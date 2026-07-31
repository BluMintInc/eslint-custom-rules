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
      // ------------------------------------------------------------------
      // Issue #1430: the fix emits a bare `stableHash` call and a top-level
      // import for it. When that name is already bound where the call lands,
      // the edit is unsafe — a module-scope binding duplicates the identifier
      // (TS2440/TS2300) and a narrower shadow silently captures the call — so
      // the violation is reported with no autofix at all.
      // ------------------------------------------------------------------
      {
        name: 'declines the fix when stableHash is already bound at module scope',
        code: `
const stableHash = undefined as unknown as never;
const MyComponent = ({ ...restProps }) => {
  useEffect(
    () => {},
    [restProps],
  );
  return <div {...restProps} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `
const stableHash = undefined as unknown as never;
const MyComponent = ({ ...restProps }) => {
  useEffect(
    () => {},
    [restProps],
  );
  return <div {...restProps} />;
};
`,
      },
      {
        name: 'declines the fix when a local const shadows the imported stableHash',
        code: `
import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...restProps }) => {
  const stableHash = (value) => value;
  useEffect(() => {}, [restProps]);
  return <div {...restProps} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `
import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...restProps }) => {
  const stableHash = (value) => value;
  useEffect(() => {}, [restProps]);
  return <div {...restProps} />;
};
`,
      },
      {
        name: 'declines the fix when a prop named stableHash shadows the import',
        code: `
const MyComponent = ({ stableHash, ...restProps }) => {
  useEffect(() => {}, [restProps]);
  return <div {...restProps} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `
const MyComponent = ({ stableHash, ...restProps }) => {
  useEffect(() => {}, [restProps]);
  return <div {...restProps} />;
};
`,
      },
      {
        // A binding the emitted call cannot reach is irrelevant: the import
        // lands at module scope, where the sibling function's local shadows
        // nothing.
        name: 'still fixes when an unrelated function owns a stableHash local',
        code: `
const helper = () => {
  const stableHash = 1;
  return stableHash;
};

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, [restProps]);
  return <div {...restProps} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const helper = () => {
  const stableHash = 1;
  return stableHash;
};

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(restProps)]);
  return <div {...restProps} />;
};
`,
      },
      {
        // The call is written into the dependency array, which sits outside the
        // effect callback, so a shadow confined to that callback never captures
        // it.
        name: 'still fixes when the shadow is confined to the effect callback',
        code: `
const MyComponent = ({ ...restProps }) => {
  useEffect(() => {
    const stableHash = 1;
    console.log(stableHash);
  }, [restProps]);
  return <div {...restProps} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {
    const stableHash = 1;
    console.log(stableHash);
  }, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(restProps)]);
  return <div {...restProps} />;
};
`,
      },
      {
        // The guard weighs the name the fix actually emits. An aliased import
        // means nothing is emitted under the taken name, so the rewrite stands.
        name: 'fixes through an aliased import even when stableHash itself is taken',
        code: `
import { stableHash as hash } from 'functions/src/util/hash/stableHash';

const stableHash = undefined as unknown as never;

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, [restProps]);
  return <div {...restProps} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `
import { stableHash as hash } from 'functions/src/util/hash/stableHash';

const stableHash = undefined as unknown as never;

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [hash(restProps)]);
  return <div {...restProps} />;
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
      {
        // `hashImport` never influences detection — all four of its reads live
        // inside `fix()` — so only the emitted text proves the option is live:
        // both the inserted import and the call written into the deps array
        // follow the configured source and name.
        name: 'emits the configured hashImport source and importName',
        code: `
const MyComponent = ({ ...rest }) => {
  useEffect(() => {}, [rest]);
  return <div {...rest} />;
};
`,
        options: [
          {
            hashImport: {
              source: 'app/utils/stableHash',
              importName: 'stableHashCustom',
            },
          },
        ],
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHashCustom } from 'app/utils/stableHash';

const MyComponent = ({ ...rest }) => {
  useEffect(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHashCustom(rest)]);
  return <div {...rest} />;
};
`,
      },
      {
        // A local binding of the name the fix would emit makes both halves of
        // the rewrite wrong, so the fixer declines while the report stands.
        // `output: null` is the assertion that matters: a report that looks
        // fixable but silently produces nothing is otherwise invisible.
        name: 'reports without fixing when the default importName is taken',
        code: `
function stableHash(x) { return x; }

const MyComponent = ({ ...rest }) => {
  useEffect(() => {}, [rest]);
  return <div {...rest} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: null,
      },
      {
        // The same collision resolved by pointing `hashImport` at a name the
        // file does not bind: the collision guard weighs the configured name,
        // not the default one, so the fix applies.
        name: 'fixes the collided case once hashImport renames the import',
        code: `
function stableHash(x) { return x; }

const MyComponent = ({ ...rest }) => {
  useEffect(() => {}, [rest]);
  return <div {...rest} />;
};
`,
        options: [
          {
            hashImport: {
              source: 'my/custom/hash/module',
              importName: 'myHash',
            },
          },
        ],
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { myHash } from 'my/custom/hash/module';

function stableHash(x) { return x; }

const MyComponent = ({ ...rest }) => {
  useEffect(() => {}, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [myHash(rest)]);
  return <div {...rest} />;
};
`,
      },
    ],
  },
);

// RuleTester applies a single fix pass and never shows the file that
// `eslint --fix` actually writes, so the multi-pass invariants are asserted
// through the real Linter instead.
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
  linter.defineRule('@blumintinc/blumint/enforce-stable-hash-spread-props-2', {
    meta: { schema: [] },
    create: () => ({}),
  } as unknown as Rule.RuleModule);
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

const countOf = (output: string, needle: string) =>
  output.split(needle).length - 1;

// Issue #1413: these cases assert the invariant that bug violated: an emitted
// stableHash() call is never left without its import.
describe('enforce-stable-hash-spread-props: inline disables and the import carrier (issue #1413)', () => {
  const expectNoUnboundStableHash = (output: string) => {
    if (output.includes('stableHash(')) {
      expect(output).toContain(IMPORT_LINE);
    }
  };

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

// Issue #1430: `--fix` used to write a second top-scope `stableHash` over an
// existing binding, corrupting the file automatically with no prompt. These
// cases drive the real multi-pass fixer, where a per-pass import decision that
// looked safe in isolation is where such a duplicate would surface.
describe('enforce-stable-hash-spread-props: an existing stableHash binding (issue #1430)', () => {
  it('leaves a file that already binds stableHash at module scope untouched', () => {
    const code = `const stableHash = undefined as unknown as never;
const First = ({ ...alphaProps }) => {
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};
`;

    expect(lint(code)).toBe(code);
  });

  it('never declares stableHash twice, whichever violation carries the import', () => {
    const output = lint(`const stableHash = undefined as unknown as never;
const First = ({ ...alphaProps }) => {
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
`);

    expect(countOf(output, IMPORT_LINE)).toBe(0);
    expect(countOf(output, 'const stableHash')).toBe(1);
  });

  it('leaves the violation whose scope is shadowed and fixes its neighbour', () => {
    const output = lint(`const First = ({ ...alphaProps }) => {
  const stableHash = (value) => value;
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
`);

    expect(countOf(output, IMPORT_LINE)).toBe(1);
    expect(output).toContain('useCallback(() => {}, [alphaProps]);');
    expect(output).toContain('[stableHash(betaProps)]');
  });

  it('reports without fixing rather than falling silent', () => {
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
    const messages = linter.verify(
      `const stableHash = undefined as unknown as never;
const First = ({ ...alphaProps }) => {
  useCallback(() => {}, [alphaProps]);
  return <div {...alphaProps} />;
};
`,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020 as const,
          sourceType: 'module' as const,
          ecmaFeatures: { jsx: true },
        },
        rules: { [RULE_ID]: 'error' as const },
      },
      'Component.tsx',
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(RULE_ID);
    expect(messages[0].fix).toBeUndefined();
  });
});
