import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { noTypeAssertionReturns } from '../rules/no-type-assertion-returns';

const typeAssertionError = (assertedType: string) => ({
  messageId: 'noTypeAssertionReturns' as const,
  data: { assertedType },
});

/**
 * The rest of this rule's suite simulates JSX with `createElement` object
 * literals, which reaches the exemption through its `Property` branch and
 * exercises no JSX AST at all. These cases run real JSX so the attribute
 * branches are covered against the nodes they actually name.
 */
ruleTesterJsx.run(
  'no-type-assertion-returns (JSX spread attributes)',
  noTypeAssertionReturns,
  {
    valid: [
      // Good: the returned value is a JSXElement; the cast only feeds a prop spread
      `function Probe({ rest }) {
  return <div {...(rest as Record<string, unknown>)} />;
}`,

      // Good: the named-attribute spelling, which must keep behaving identically
      `function Probe({ rest }) {
  return <div title={rest as string} />;
}`,

      // Good: an arrow expression body returning the element
      `const Probe = ({ rest }) => <div {...(rest as Record<string, unknown>)} />;`,

      // Good: the element is hoisted to a variable before being returned
      `function Probe({ rest }) {
  const el = <div {...(rest as Record<string, unknown>)} />;
  return el;
}`,

      // Good: not 'any'-specific — a named type behaves the same way
      `function Probe({ rest }) {
  return <Select {...(rest as SelectProps)} />;
}`,

      // Good: a spread carrying no assertion at all
      `function Probe({ rest }) {
  return <div {...rest} />;
}`,

      // Good: the same spread wrapped in a named attribute
      `function Probe({ r }) {
  return <Outer render={<Inner {...(r as Record<string, unknown>)} />} />;
}`,

      // Good: an assertion inside an object literal passed as a prop
      `function Probe({ r }) {
  return <Outer cfg={{ a: r as string }} />;
}`,

      // Good: mirrors the reported trigger — a spread inside a memo callback's JSX
      `function Probe({ rest, options }) {
  const select = useDeepCompareMemo(() => {
    const { sx = {}, ...selectProps } = rest as SelectPropsRest;
    return <Select {...(selectProps as any)} sx={{ ...sx }}>{options}</Select>;
  }, [rest, options]);
  return select;
}`,

      // Good: several spreads on one element
      `function Probe({ a, b }) {
  return <div {...(a as A)} {...(b as B)} />;
}`,

      // Good: the spread value comes from a call
      `function Probe({ rest }) {
  return <div {...(toProps(rest) as Props)} />;
}`,

      // Good: a member expression feeding the spread
      `function Probe({ config }) {
  return <div {...(config.props as Props)} />;
}`,

      // Good: 'as const' inside a spread
      `function Probe() {
  return <div {...({ a: 1 } as const)} />;
}`,

      // Good: 'as const' inside a spread even when the allowance is switched off,
      // because the JSX carve-out applies regardless of the asserted type
      {
        code: `function Probe() {
  return <div {...({ a: 1 } as const)} />;
}`,
        options: [{ allowAsConst: false }] as const,
      },

      // Good: a chained assertion inside a spread
      `function Probe({ rest }) {
  return <div {...(rest as unknown as Props)} />;
}`,

      // Good: the element is a fragment child
      `function Probe({ rest }) {
  return <><div {...(rest as Props)} /></>;
}`,

      // Good: a conditional return path
      `function Probe({ rest, flag }) {
  if (flag) {
    return <div {...(rest as Props)} />;
  }
  return null;
}`,

      // Good: both arms of a ternary
      `function Probe({ rest, flag }) {
  return flag ? <div {...(rest as Props)} /> : <span {...(rest as Props)} />;
}`,

      // Good: deeply nested JSX
      `function Probe({ rest }) {
  return <Outer><Middle><Inner {...(rest as Props)} /></Middle></Outer>;
}`,

      // Good: a spread inside a map callback that returns JSX
      `function Probe({ items }) {
  return <div>{items.map((i) => <Row key={i.id} {...(i as RowProps)} />)}</div>;
}`,

      // Good: a spread inside a render prop's nested arrow
      `function Probe({ rest }) {
  return <List renderItem={(item) => <Row {...(item as RowProps)} />} {...(rest as ListProps)} />;
}`,

      // Good: a class render method
      `class Probe extends Component {
  render() {
    return <div {...(this.props.rest as Props)} />;
  }
}`,

      // Good: a JSX element carrying a spread passed as a call argument
      `function Probe({ rest }) {
  return renderShell(<div {...(rest as Props)} />);
}`,

      // Good: an explicit return type alongside a spread, since a JSXElement is
      // not one of the untyped expression forms the annotation check targets
      `function Probe({ rest }): JSX.Element {
  return <div {...(rest as Props)} />;
}`,

      // Good: unusual whitespace and an interleaved comment
      `function Probe({ rest }) {
  return (
    <div
      // spread the remaining props through
      {...(
        rest as Props
      )}
    />
  );
}`,

      // Good: spread mixed with named attributes and children
      `function Probe({ rest, label }) {
  return <Select value={label} {...(rest as SelectProps)} onChange={noop}>{label}</Select>;
}`,
    ],
    invalid: [
      // Bad: the genuine return-position cast the rule exists to catch
      {
        code: `function probe({ rest }) {
  return rest as string;
}`,
        errors: [typeAssertionError('string')],
      },

      // Bad: a cast to 'any' in return position inside a component
      {
        code: `function Probe({ rest }) {
  return rest as any;
}`,
        errors: [typeAssertionError('any')],
      },

      // Bad: a cast wrapping a call result in return position
      {
        code: `function Probe() {
  return foo() as Bar;
}`,
        errors: [typeAssertionError('Bar')],
      },

      // Bad: an exempted JSX spread elsewhere in the function must not license
      // the cast that is actually returned
      {
        code: `function Probe({ rest }) {
  const el = <div {...(rest as Props)} />;
  return rest as Props;
}`,
        errors: [typeAssertionError('Props')],
      },

      // Bad: a nested function returning a cast from within a JSX spread — the
      // carve-out covers the spread's own value, not every return beneath it
      {
        code: `function Probe({ rest }) {
  return <List {...{ render: () => { return rest as Item; } }} />;
}`,
        errors: [typeAssertionError('Item')],
      },

      // Bad: an arrow expression body returning a cast from a component
      {
        code: `const Probe = ({ rest }) => rest as Props;`,
        errors: [typeAssertionError('Props')],
      },
    ],
  },
);

/**
 * An object or array spread is NOT exempted alongside the JSX one. A JSX spread
 * feeds props that the receiving component's own types re-check, and the
 * function returns a JSXElement rather than the asserted value; splicing an
 * asserted value into a returned object or array instead hands its unvalidated
 * members straight to the caller, which is precisely the escape this rule
 * reports. These pin that split so the choice is not silently reversed.
 */
ruleTesterTs.run(
  'no-type-assertion-returns (non-JSX spread stays reported)',
  noTypeAssertionReturns,
  {
    valid: [
      // Good: the spread result is bound to a variable rather than returned
      `
      function probe(x: unknown) {
        const merged = { ...(x as Record<string, unknown>) };
        return merged;
      }
      `,
    ],
    invalid: [
      // Bad: the asserted object's members become the returned object's members
      {
        code: `
        function probe(x: unknown) {
          return { ...(x as Record<string, unknown>) };
        }
        `,
        errors: [typeAssertionError('Record<string, unknown>')],
      },

      // Bad: the asserted array's elements become the returned array's elements
      {
        code: `
        function probe(x: unknown) {
          return [...(x as string[])];
        }
        `,
        errors: [typeAssertionError('string[]')],
      },

      // Bad: a spread call argument is not covered by the direct-argument carve-out
      {
        code: `
        function probe(x: unknown) {
          return fn(...(x as string[]));
        }
        `,
        errors: [typeAssertionError('string[]')],
      },
    ],
  },
);
