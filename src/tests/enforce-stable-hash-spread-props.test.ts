import { Linter, Rule } from 'eslint';
import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceStableHashSpreadProps } from '../rules/enforce-stable-hash-spread-props';

(ruleTesterJsx as any).defineRule?.('react-hooks/exhaustive-deps', {
  meta: {
    type: 'suggestion',
    docs: { description: 'stub', recommended: false },
    schema: [],
    messages: {},
  },
  create: () => ({}),
});

ruleTesterJsx.run(
  'enforce-stable-hash-spread-props',
  enforceStableHashSpreadProps,
  {
    valid: [
      {
        code: `
import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(() => {
    console.log(title);
  }, [stableHash(typographyProps)]);

  return <Typography {...typographyProps}>Hello</Typography>;
};
        `,
      },
      {
        code: `
const MyComponent = ({ label, ...props }) => {
  useEffect(() => {
    console.log(label);
  }, [props.id]);

  return <Typography {...props}>Hello</Typography>;
};
        `,
      },
      {
        code: `
const MyComponent = ({ ...rest }) => {
  const memoized = useMemo(() => rest, [rest]);
  useEffect(() => {}, [memoized]);
  return <Typography {...memoized} />;
};
        `,
      },
      {
        code: `
const helper = ({ ...rest }) => {
  return rest.name;
};
        `,
      },
      {
        code: `
import { stableHash as hash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, [hash(restProps)]);
  return <Typography {...restProps} />;
};
        `,
      },
      {
        code: `
const MyComponent = ({ ...restProps }) => {
  const hashed = stableHash(restProps);
  useEffect(() => {}, [hashed]);
  return <Typography {...restProps} />;
};
        `,
      },
      {
        code: `
const MyComponent = ({ ...typographyProps }) => {
  useMemo(() => typographyProps, [typographyProps]);
  return <Typography {...typographyProps} />;
};
        `,
      },
      {
        code: `
const MyComponent = (props) => {
  const { primary, ...buttonProps } = props;
  useEffect(() => {}, [stableHash(buttonProps)]);
  return <Button {...buttonProps} />;
};
        `,
      },
      {
        code: `
const MyComponent = ({ ...rest }) => {
  const memoized = useDeepCompareMemo(() => rest, [rest]);
  useEffect(() => {}, [memoized]);
  return <Typography {...memoized} />;
};
        `,
      },
      {
        code: `
const MyComponent = ({ count }) => {
  useEffect(() => {}, [count]);
  return <div>{count}</div>;
};
        `,
      },
      {
        code: `
function MyComponent({ children, ...props }) {
  useEffect(() => {}, [stableHash(props)]);
  return <div {...props}>{children}</div>;
}
        `,
      },
      // Issue #1413: every violation suppressed inline leaves the file untouched
      {
        name: 'all violations disabled inline report nothing',
        code: `
const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
        `,
      },
      // Issue #1413: a block disable naming this rule covers the whole file
      {
        name: 'whole-file block disable naming this rule suppresses everything',
        code: `
/* eslint-disable enforce-stable-hash-spread-props */
const First = ({ ...alphaProps }) => {
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
        `,
      },
      // Issue #1413: a bare block disable suppresses every rule
      {
        name: 'bare whole-file block disable suppresses this rule',
        code: `
/* eslint-disable */
const First = ({ ...alphaProps }) => {
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};
        `,
      },
      // Issue #1413: a bare line disable suppresses this rule too
      {
        name: 'bare eslint-disable-next-line suppresses this rule',
        code: `
const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};
        `,
      },
    ],
    invalid: [
      {
        code: `
const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(() => {
    console.log(title);
  }, [typographyProps]);

  return <Typography {...typographyProps}>Hello</Typography>;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(() => {
    console.log(title);
  }, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(typographyProps)]);

  return <Typography {...typographyProps}>Hello</Typography>;
};
        `,
      },
      {
        code: `
const MyComponent = ({ ...typographyProps }) => {
  useCallback(() => {}, [typographyProps]);
  return <Typography {...typographyProps} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...typographyProps }) => {
  useCallback(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(typographyProps)]);
  return <Typography {...typographyProps} />;
};
        `,
      },
      {
        code: `
const MyComponent = ({ primary, ...buttonProps }) => {
  const memoized = useMemo(() => buttonProps, [buttonProps]);
  useEffect(() => {}, [buttonProps]);
  return <Button {...memoized} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ primary, ...buttonProps }) => {
  const memoized = useMemo(() => buttonProps, [buttonProps]);
  useEffect(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(buttonProps)]);
  return <Button {...memoized} />;
};
        `,
      },
      {
        code: `
const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, [restProps, restProps]);
  return <Typography {...restProps} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(restProps), stableHash(restProps)]);
  return <Typography {...restProps} />;
};
        `,
      },
      {
        code: `
import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, [restProps]);
  return <Typography {...restProps} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `
import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(restProps)]);
  return <Typography {...restProps} />;
};
        `,
      },
      {
        code: `
const MyComponent = (props) => {
  const { kind, ...rest } = props;
  useLayoutEffect(() => {}, [rest]);
  return <Typography {...rest} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = (props) => {
  const { kind, ...rest } = props;
  useLayoutEffect(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(rest)]);
  return <Typography {...rest} />;
};
        `,
      },
      {
        code: `
const MyComponent = ({ value, ...restProps }) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {}, [restProps]);
  return <Typography {...restProps} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ value, ...restProps }) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {}, [stableHash(restProps)]);
  return <Typography {...restProps} />;
};
        `,
      },
      {
        code: `
const MyComponent = ({ data, ...restProps }) => {
  useInsertionEffect(() => {}, [restProps]);
  return <Typography {...restProps} data={data} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ data, ...restProps }) => {
  useInsertionEffect(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(restProps)]);
  return <Typography {...restProps} data={data} />;
};
        `,
      },
      {
        code: `
const MyComponent = (props) => {
  const { kind, ...rest } = props;
  const { ...otherProps } = props;
  useEffect(() => {}, [rest, otherProps]);
  return <Typography {...rest} {...otherProps} />;
};
        `,
        errors: [
          {
            messageId: 'wrapSpreadPropsWithStableHash',
            data: { names: 'rest, otherProps' },
          },
        ],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = (props) => {
  const { kind, ...rest } = props;
  const { ...otherProps } = props;
  useEffect(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(rest), stableHash(otherProps)]);
  return <Typography {...rest} {...otherProps} />;
};
        `,
      },
      {
        code: `
const MyComponent = ({ ...props }) => {
  const memoized = useMemo(() => props, [props]);
  useEffect(() => {
    console.log(memoized);
  }, [props]);
  return <Typography {...memoized} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...props }) => {
  const memoized = useMemo(() => props, [props]);
  useEffect(() => {
    console.log(memoized);
  }, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(props)]);
  return <Typography {...memoized} />;
};
        `,
      },
      {
        code: `
import { stableHash as hash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, [restProps]);
  return <Typography {...restProps} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `
import { stableHash as hash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [hash(restProps)]);
  return <Typography {...restProps} />;
};
        `,
      },
      {
        code: `
const MyComponent = ({ ...restProps }) => {
  useEffect(
    () => {},
    [restProps],
  );
  return <div {...restProps} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...restProps }) => {
  useEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(restProps)],
  );
  return <div {...restProps} />;
};
        `,
      },
      {
        code: `
const MyComponent = ({ ...rest }) => {
  useMemo(() => rest, [rest]);
};
        `,
        options: [{ hookNames: ['useMemo'] }],
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...rest }) => {
  useMemo(() => rest, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(rest)]);
};
        `,
      },
      // ------------------------------------------------------------------
      // Issue #1413: the `import { stableHash }` fix rides on a single
      // violation, making it the file's import carrier. A suppressed
      // violation used to claim that slot and take the import down with it,
      // leaving surviving `stableHash(...)` rewrites with nothing imported.
      // ------------------------------------------------------------------
      {
        name: 'disable on the FIRST violation still lands the import',
        code: `
const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(betaProps)]);
  return <div {...betaProps} />;
};
        `,
      },
      {
        name: 'disable on a MIDDLE violation keeps one import and both other rewrites',
        code: `
const First = ({ ...alphaProps }) => {
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};

const Third = ({ ...gammaProps }) => {
  useCallback(() => {}, [gammaProps]);
  return <div {...gammaProps} />;
};
        `,
        errors: [
          { messageId: 'wrapSpreadPropsWithStableHash' },
          { messageId: 'wrapSpreadPropsWithStableHash' },
        ],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const First = ({ ...alphaProps }) => {
  useCallback(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(alphaProps)]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};

const Third = ({ ...gammaProps }) => {
  useCallback(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(gammaProps)]);
  return <div {...gammaProps} />;
};
        `,
      },
      {
        name: 'disable on the LAST violation leaves the earlier ones fixed and imported',
        code: `
const First = ({ ...alphaProps }) => {
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const First = ({ ...alphaProps }) => {
  useCallback(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(alphaProps)]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
        `,
      },
      {
        // The rule's own fix inserts `react-hooks/exhaustive-deps` disables.
        // Those name a different rule, so neither an inserted nor a
        // pre-existing one may suppress this rule or forfeit the import.
        name: 'a react-hooks/exhaustive-deps disable does not suppress this rule',
        code: `
const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
        `,
        errors: [
          { messageId: 'wrapSpreadPropsWithStableHash' },
          { messageId: 'wrapSpreadPropsWithStableHash' },
        ],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useCallback(() => {}, [stableHash(alphaProps)]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(betaProps)]);
  return <div {...betaProps} />;
};
        `,
      },
      {
        name: 'disable on the first violation adds no duplicate to an existing import',
        code: `
import { stableHash } from 'functions/src/util/hash/stableHash';

const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `
import { stableHash } from 'functions/src/util/hash/stableHash';

const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(betaProps)]);
  return <div {...betaProps} />;
};
        `,
      },
      {
        // The report sits on the dependency array, so a disable above the
        // hook call covers a different line and — exactly as ESLint itself
        // resolves it — suppresses nothing.
        name: 'disable above a multiline hook call does not cover its deps array',
        code: `
const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useEffect(
    () => {},
    [alphaProps],
  );
  return <div {...alphaProps} />;
};
        `,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(alphaProps)],
  );
  return <div {...alphaProps} />;
};
        `,
      },
    ],
  },
);

// Issue #1413: RuleTester applies a single fix pass and never shows the file
// that `eslint --fix` actually writes. These cases run the real multi-pass
// fixer and assert the invariant the bug violated: an emitted stableHash()
// call is never left without its import.
describe('enforce-stable-hash-spread-props: inline disables and the import carrier (issue #1413)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-stable-hash-spread-props';
  const IMPORT_LINE =
    "import { stableHash } from 'functions/src/util/hash/stableHash';";

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceStableHashSpreadProps as unknown as Rule.RuleModule,
    );
    // A near-miss neighbour proves rule matching is exact rather than a
    // suffix/substring heuristic.
    linter.defineRule(
      '@blumintinc/blumint/enforce-stable-hash-spread-props-2',
      {
        meta: { schema: [] },
        create: () => ({}),
      } as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: { [RULE_ID]: 'error' as const },
    };
    const { output } = linter.verifyAndFix(code, config, 'Component.tsx');
    return output;
  };

  const expectNoUnboundStableHash = (output: string) => {
    if (output.includes('stableHash(')) {
      expect(output).toContain(IMPORT_LINE);
    }
  };

  const countOf = (output: string, needle: string) =>
    output.split(needle).length - 1;

  it('carries the import on the first surviving violation', () => {
    const output = lint(`const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line ${RULE_ID}
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
`);

    expectNoUnboundStableHash(output);
    expect(countOf(output, IMPORT_LINE)).toBe(1);
    expect(output).toContain('useCallback(() => {}, [alphaProps]);');
    expect(output).toContain('[stableHash(betaProps)]');
  });

  it('fixes every surviving violation across several passes with one import', () => {
    const output = lint(`const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line ${RULE_ID}
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};

const Third = ({ ...gammaProps }) => {
  useCallback(() => {}, [gammaProps]);
  return <div {...gammaProps} />;
};
`);

    expectNoUnboundStableHash(output);
    expect(countOf(output, IMPORT_LINE)).toBe(1);
    expect(countOf(output, 'stableHash(')).toBe(2);
    expect(output).toContain('useCallback(() => {}, [alphaProps]);');
  });

  it('keeps the import when only the last violation survives a block disable', () => {
    const output = lint(`/* eslint-disable ${RULE_ID} */
const First = ({ ...alphaProps }) => {
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};
/* eslint-enable ${RULE_ID} */

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
`);

    expectNoUnboundStableHash(output);
    expect(countOf(output, IMPORT_LINE)).toBe(1);
    expect(countOf(output, 'stableHash(')).toBe(1);
    expect(output).toContain('useCallback(() => {}, [alphaProps]);');
  });

  it('rewrites nothing and imports nothing when every violation is disabled', () => {
    const code = `const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line ${RULE_ID}
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  // eslint-disable-next-line ${RULE_ID}
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
`;

    expect(lint(code)).toBe(code);
  });

  it('rewrites nothing under a whole-file block disable', () => {
    const code = `/* eslint-disable ${RULE_ID} */
const First = ({ ...alphaProps }) => {
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};
`;

    expect(lint(code)).toBe(code);
  });

  it('does not treat a disable for a similarly named rule as its own', () => {
    const output = lint(`const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line ${RULE_ID}-2
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};
`);

    expectNoUnboundStableHash(output);
    expect(countOf(output, IMPORT_LINE)).toBe(1);
    expect(output).toContain('[stableHash(alphaProps)]');
  });

  it('treats an exhaustive-deps disable as unrelated and still fixes the hook', () => {
    const output = lint(`const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
`);

    expectNoUnboundStableHash(output);
    expect(countOf(output, IMPORT_LINE)).toBe(1);
    expect(countOf(output, 'stableHash(')).toBe(2);
  });

  it('adds no second import when the file already imports stableHash', () => {
    const output = lint(`${IMPORT_LINE}

const First = ({ ...alphaProps }) => {
  // eslint-disable-next-line ${RULE_ID}
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
`);

    expectNoUnboundStableHash(output);
    expect(countOf(output, IMPORT_LINE)).toBe(1);
    expect(countOf(output, 'stableHash(')).toBe(1);
  });
});
