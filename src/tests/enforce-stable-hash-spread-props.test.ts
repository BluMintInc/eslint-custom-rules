import { Linter, Rule } from 'eslint';
import * as prettier from 'prettier';
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
  useEffect(
    () => {
      console.log(title);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(typographyProps)],
  );

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
  useCallback(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(typographyProps)],
  );
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
  useEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(buttonProps)],
  );
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
  useEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(restProps), stableHash(restProps)],
  );
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
  useEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(restProps)],
  );
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
  useLayoutEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(rest)],
  );
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
  useInsertionEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(restProps)],
  );
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
  useEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(rest), stableHash(otherProps)],
  );
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
  useEffect(
    () => {
      console.log(memoized);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(props)],
  );
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
  useEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hash(restProps)],
  );
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
  useMemo(
    () => rest,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(rest)],
  );
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
  useCallback(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(betaProps)],
  );
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
  useCallback(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(alphaProps)],
  );
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }) => {
  // eslint-disable-next-line enforce-stable-hash-spread-props
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};

const Third = ({ ...gammaProps }) => {
  useCallback(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(gammaProps)],
  );
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
  useCallback(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(alphaProps)],
  );
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
  useCallback(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(betaProps)],
  );
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
  useCallback(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(betaProps)],
  );
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
  useEffect(
    () => {
      const stableHash = 1;
      console.log(stableHash);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(restProps)],
  );
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
  useEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hash(restProps)],
  );
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
  useEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHashCustom(rest)],
  );
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
  useEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myHash(rest)],
  );
  return <div {...rest} />;
};
`,
      },
      // ------------------------------------------------------------------
      // Issue #2065: the disable comment used to be spliced in ahead of the
      // dependency array, which left the separator space between the previous
      // argument and the array stranded at the end of a line and indented the
      // comment at the pre-image's depth. An own-line comment forces prettier
      // to expand the argument list, so the fixer prints that expansion — and
      // its indentation is derived from the enclosing statement rather than
      // assumed. Each case below is prettier-clean on both sides.
      // ------------------------------------------------------------------
      {
        name: 'a blank line inside the rewritten callback body carries no indentation',
        code: `const MyComponent = ({ ...restProps }) => {
  useEffect(() => {
    first();

    second();
  }, [restProps]);
  return <div {...restProps} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ ...restProps }) => {
  useEffect(
    () => {
      first();

      second();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(restProps)],
  );
  return <div {...restProps} />;
};
`,
      },
      {
        // The indentation of a template literal's continuation lines is part of
        // the string it prints, so the expansion leaves it where the author put
        // it — exactly as prettier does.
        name: 'a multi-line template literal keeps its own indentation',
        code: `const MyComponent = ({ ...restProps }) => {
  useEffect(() => {
    log(\`line one
line two\`);
  }, [restProps]);
  return <div {...restProps} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ ...restProps }) => {
  useEffect(
    () => {
      log(\`line one
line two\`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(restProps)],
  );
  return <div {...restProps} />;
};
`,
      },
      {
        name: 'a declaration anchors the expansion on the statement, not on the call',
        code: `const MyComponent = ({ ...restProps }) => {
  const handler = useCallback(() => {
    submit(restProps);
  }, [restProps]);
  return <div {...restProps} onClick={handler} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ ...restProps }) => {
  const handler = useCallback(
    () => {
      submit(restProps);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(restProps)],
  );
  return <div {...restProps} onClick={handler} />;
};
`,
      },
      {
        // Two levels in, so an indentation copied from the pre-image or fixed
        // at the component's depth would both be visible here.
        name: 'a nested statement anchors the expansion one level deeper',
        code: `const MyComponent = ({ ...restProps }) => {
  const build = () => {
    return useCallback(() => {}, [restProps]);
  };
  return <div {...restProps} onClick={build()} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ ...restProps }) => {
  const build = () => {
    return useCallback(
      () => {},
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [stableHash(restProps)],
    );
  };
  return <div {...restProps} onClick={build()} />;
};
`,
      },
      {
        // The same function as the case above, spelled with a concise body.
        // Two spellings of one function must get the same remedy, or the rule
        // reports a violation it will not fix depending on how the author wrote
        // the arrow. Prettier's break lands after the final `=>`, which puts
        // the call one step past the statement and its arguments one step past
        // that, so the whitespace across that break is the fixer's to write.
        name: 'the concise spelling of that arrow breaks after its arrow token',
        code: `const MyComponent = ({ ...restProps }) => {
  const build = () => useCallback(() => {}, [restProps]);
  return <div {...restProps} onClick={build()} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ ...restProps }) => {
  const build = () =>
    useCallback(
      () => {},
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [stableHash(restProps)],
    );
  return <div {...restProps} onClick={build()} />;
};
`,
      },
      {
        // A chain keeps every `=>` on the statement's line and breaks only
        // before the body, so the depth is a property of the position rather
        // than of how many arrows precede it.
        name: 'a chain of concise arrows still breaks only once',
        code: `const MyComponent = ({ ...restProps }) => {
  const build = () => () => useCallback(() => {}, [restProps]);
  return <div {...restProps} onClick={build()()} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ ...restProps }) => {
  const build = () => () =>
    useCallback(
      () => {},
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [stableHash(restProps)],
    );
  return <div {...restProps} onClick={build()()} />;
};
`,
      },
      {
        // An author who already broke after the `=>` gets the same text: the
        // break is rewritten rather than added, so the two inputs converge.
        name: 'a concise body already on its own line converges on the same text',
        code: `const MyComponent = ({ ...restProps }) => {
  const build = (someArgument: string) =>
    useCallback(() => {}, [restProps, someArgument]);
  return <div {...restProps} onClick={build} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ ...restProps }) => {
  const build = (someArgument: string) =>
    useCallback(
      () => {},
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [stableHash(restProps), someArgument],
    );
  return <div {...restProps} onClick={build} />;
};
`,
      },
      {
        // Parentheses around the body are not whitespace, so the span the break
        // would be written across is not the fixer's to rewrite — deleting them
        // would leave the closer unbalanced. Prettier strips such a pair on its
        // own, which is why declining costs nothing here.
        name: 'declines a concise body wrapped in parentheses',
        code: `const MyComponent = ({ ...restProps }) => {
  const build = () => (useCallback(() => {}, [restProps]));
  return <div {...restProps} onClick={build()} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: null,
      },
      {
        name: 'a member-expression hook callee expands the same way',
        code: `const MyComponent = ({ ...restProps }) => {
  React.useEffect(() => {}, [restProps]);
  return <div {...restProps} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ ...restProps }) => {
  React.useEffect(
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(restProps)],
  );
  return <div {...restProps} />;
};
`,
      },
      {
        // Prettier breaks every argument once one of them carries an own-line
        // comment, so an argument the fixer neither reads nor rewrites still
        // gets a line of its own.
        name: 'a three-argument hook puts every argument on its own line',
        code: `const MyComponent = ({ ...restProps }) => {
  useTracked('label', () => {}, [restProps]);
  return <div {...restProps} />;
};
`,
        options: [{ hookNames: ['useTracked'] }],
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ ...restProps }) => {
  useTracked(
    'label',
    () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(restProps)],
  );
  return <div {...restProps} />;
};
`,
      },
      {
        // A comment written between the arguments belongs to no argument, so a
        // re-emitted list has nowhere to carry it. `output: null` pins the
        // decline: the alternative — emitting the wraps and dropping the
        // comment, or emitting them without the disable and handing the file to
        // `react-hooks/exhaustive-deps` — is worse than leaving the report.
        name: 'declines rather than deleting a comment written between the arguments',
        code: `const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, /* deps */ [restProps]);
  return <div {...restProps} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: null,
      },
      {
        // A call nested inside another expression sits in a group prettier may
        // break as well, so its arguments do not indent against the line the
        // call starts on. The fixer declines rather than guessing that depth.
        name: 'declines when the hook call is nested inside another expression',
        code: `const MyComponent = ({ ...restProps }) => {
  return <Button onClick={useCallback(() => {}, [restProps])} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: null,
      },
      {
        // This array is broken because it did not fit beside
        // `useEffect(() => {},` — room the expansion hands straight back, at
        // which point prettier joins it onto one line over text the fixer had
        // copied verbatim. The fixer reproduces an argument, it does not reflow
        // one, so a break made for a width the expansion changes is declined.
        name: 'declines a dependency array broken for a width the expansion changes',
        code: `const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, [
    restProps,
    somethingElse,
    yetAnotherDependencyWithALongName,
  ]);
  return <div {...restProps} />;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: null,
      },
      {
        // The counterpart: the same array already at the depth the expansion
        // targets keeps every column it had, so its break is reproduced rather
        // than declined. Without this the guard above would also be satisfied
        // by a fixer that declined every multi-line argument.
        name: 'reproduces a dependency array already broken at the target indent',
        code: `const MyComponent = ({ ...restProps }) => {
  useEffect(
    () => {},
    [
      restProps,
      somethingElse,
      yetAnotherDependencyWithAnExtremelyLongNameIndeed,
    ],
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
    [
      stableHash(restProps),
      somethingElse,
      yetAnotherDependencyWithAnExtremelyLongNameIndeed,
    ],
  );
  return <div {...restProps} />;
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

const lint = (code: string, options?: Record<string, unknown>) => {
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
    rules: {
      [RULE_ID]: (options ? ['error', options] : 'error') as Linter.RuleEntry<
        unknown[]
      >,
    },
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

// ------------------------------------------------------------------
// Issue #1648: a fix that writes a brand-new import must not displace the
// file's prologue. Each case is flush-left because a prologue's meaning
// depends on its position in the file. The final case is the control: an
// anchor disabled outright would also "preserve" every prologue above, so
// the import must still land at the top of an existing import block.
// ------------------------------------------------------------------
ruleTesterJsx.run(
  'enforce-stable-hash-spread-props',
  enforceStableHashSpreadProps,
  {
    valid: [],
    invalid: [
      {
        name: "the injected import lands below a 'use client' directive",
        code: `'use client';
const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(() => {
    console.log(title);
  }, [typographyProps]);

  return <Typography {...typographyProps}>Hello</Typography>;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `'use client';
import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(
    () => {
      console.log(title);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(typographyProps)],
  );

  return <Typography {...typographyProps}>Hello</Typography>;
};
`,
      },
      {
        name: 'the injected import leaves a shebang at character 0',
        code: `#!/usr/bin/env node
const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(() => {
    console.log(title);
  }, [typographyProps]);

  return <Typography {...typographyProps}>Hello</Typography>;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `#!/usr/bin/env node
import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(
    () => {
      console.log(title);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(typographyProps)],
  );

  return <Typography {...typographyProps}>Hello</Typography>;
};
`,
      },
      {
        name: 'the injected import stays below a // @ts-nocheck header',
        code: `// @ts-nocheck
const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(() => {
    console.log(title);
  }, [typographyProps]);

  return <Typography {...typographyProps}>Hello</Typography>;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `// @ts-nocheck
import { stableHash } from 'functions/src/util/hash/stableHash';
const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(
    () => {
      console.log(title);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(typographyProps)],
  );

  return <Typography {...typographyProps}>Hello</Typography>;
};
`,
      },
      {
        name: "a 'use client' file with an existing import anchors on that import",
        code: `'use client';
import { x } from './x';
void x;
const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(() => {
    console.log(title);
  }, [typographyProps]);

  return <Typography {...typographyProps}>Hello</Typography>;
};
`,
        errors: [{ messageId: 'wrapSpreadPropsWithStableHash' }],
        output: `'use client';
import { stableHash } from 'functions/src/util/hash/stableHash';
import { x } from './x';
void x;
const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(
    () => {
      console.log(title);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(typographyProps)],
  );

  return <Typography {...typographyProps}>Hello</Typography>;
};
`,
      },
    ],
  },
);

/**
 * Issue #2065: pinning the expected text in a fixture keeps the emitted layout
 * stable but says nothing about whether that layout is the one the consumer's
 * formatter wants — and agora runs this plugin's `--fix` over prettier-formatted
 * source and then `prettier --check` in CI, so text prettier rejects fails CI on
 * mangled source before anyone reads a report. The layout is therefore measured
 * against the repo's own prettier rather than eyeballed.
 *
 * The trailing-space half of that bug needs its own oracle: a space at the end
 * of a line is invisible in a fixture diff and in a jest failure message alike,
 * so it is scanned for directly.
 *
 * Every input below is asserted to be a prettier fixed point first. Without that
 * control the oracle would be reading the fixture's own spelling rather than the
 * fixer's, since prettier reformats an input's residue just as readily as an
 * output's.
 */
describe('enforce-stable-hash-spread-props emitted layout vs prettier (issue #2065)', () => {
  const PRETTIER_OPTIONS: prettier.Options = {
    parser: 'typescript',
    printWidth: 80,
    tabWidth: 2,
    singleQuote: true,
    semi: true,
    trailingComma: 'all',
  };

  const isFixedPoint = (text: string): boolean =>
    prettier.format(text, PRETTIER_OPTIONS) === text;

  const TRAILING_WHITESPACE = /[ \t]+$/m;

  const CORPUS: {
    name: string;
    code: string;
    options?: Record<string, unknown>;
  }[] = [
    {
      name: 'the issue repro',
      code: `'use client';
const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(() => {
    console.log(title);
  }, [typographyProps]);

  return <Typography {...typographyProps}>Hello</Typography>;
};
`,
    },
    {
      // The narrowest call the rule can rewrite. Its expanded form is far
      // under the print width, which is the point: prettier expands because
      // an argument carries an own-line comment, not because the line is
      // wide, so the fixer owes no width measurement.
      name: 'a call that fits on one line either way',
      code: `const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, [restProps]);
  return <div {...restProps} />;
};
`,
    },
    {
      // Already one argument per line, because the first one is too wide for
      // any other shape. The expansion has to reproduce it byte for byte.
      name: 'a call the author already expanded',
      code: `const MyComponent = ({ ...restProps }) => {
  useTracked(
    'a label long enough that this call cannot fit on a single line at all',
    () => {},
    [restProps],
  );
  return <div {...restProps} />;
};
`,
      options: { hookNames: ['useTracked'] },
    },
    {
      name: 'a declaration initializer',
      code: `const MyComponent = ({ ...restProps }) => {
  const handler = useCallback(() => {
    submit(restProps);
  }, [restProps]);
  return <div {...restProps} onClick={handler} />;
};
`,
    },
    {
      name: 'a callback body holding a blank line',
      code: `const MyComponent = ({ ...restProps }) => {
  useEffect(() => {
    first();

    second();
  }, [restProps]);
  return <div {...restProps} />;
};
`,
    },
    {
      name: 'a callback body holding a multi-line template literal',
      code: `const MyComponent = ({ ...restProps }) => {
  useEffect(() => {
    log(\`line one
line two\`);
  }, [restProps]);
  return <div {...restProps} />;
};
`,
    },
    {
      name: 'a hook two statements deep',
      code: `const MyComponent = ({ ...restProps }) => {
  const build = () => {
    return useCallback(() => {}, [restProps]);
  };
  return <div {...restProps} onClick={build()} />;
};
`,
    },
    {
      // The concise spelling of the case above. Prettier breaks after the
      // final `=>` instead of after the callee's `(`, so the fixer writes that
      // break too — and both spellings of one function get a remedy.
      name: 'a hook as a concise arrow body',
      code: `const MyComponent = ({ ...restProps }) => {
  const build = () => useCallback(() => {}, [restProps]);
  return <div {...restProps} onClick={build()} />;
};
`,
    },
    {
      name: 'a hook as the body of a chain of concise arrows',
      code: `const MyComponent = ({ ...restProps }) => {
  const build = () => () => useCallback(() => {}, [restProps]);
  return <div {...restProps} onClick={build()()} />;
};
`,
    },
    {
      // The author already broke after the `=>`, so the fixer rewrites that
      // break rather than adding one; the emitted text has to be the same.
      name: 'a concise body already on its own line',
      code: `const MyComponent = ({ ...restProps }) => {
  const build = (someArgument: string, anotherArgument: number) =>
    useCallback(() => {}, [restProps, someArgument, anotherArgument]);
  return <div {...restProps} onClick={build} />;
};
`,
    },
    {
      name: 'a member-expression callee',
      code: `const MyComponent = ({ ...restProps }) => {
  React.useEffect(() => {}, [restProps]);
  return <div {...restProps} />;
};
`,
    },
    {
      name: 'two offending dependencies in one array',
      code: `const MyComponent = (props) => {
  const { kind, ...rest } = props;
  const { ...otherProps } = props;
  useEffect(() => {}, [rest, otherProps]);
  return <Typography {...rest} {...otherProps} />;
};
`,
    },
    {
      name: 'a file that already imports an aliased stableHash',
      code: `import { stableHash as hash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, [restProps]);
  return <div {...restProps} />;
};
`,
    },
    {
      name: 'a hook with a third argument the fixer never reads',
      code: `const MyComponent = ({ ...restProps }) => {
  useTracked('label', () => {}, [restProps]);
  return <div {...restProps} />;
};
`,
      options: { hookNames: ['useTracked'] },
    },
    {
      // The array is broken because it did not fit beside `useEffect(() => {},`
      // — room the expansion hands straight back, at which point prettier
      // joins it onto one line over text the fixer copied verbatim. The break
      // is width-driven rather than structural, so the fixer declines.
      name: 'DECLINED: a dependency array broken for a width the expansion changes',
      code: `const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, [
    restProps,
    somethingElse,
    yetAnotherDependencyWithALongName,
  ]);
  return <div {...restProps} />;
};
`,
    },
    {
      // The counterpart of the decline above: the same break, but already at
      // the depth the expansion targets, so the array keeps every column it
      // had and is reproduced rather than declined.
      name: 'a dependency array already broken at the target indent',
      code: `const MyComponent = ({ ...restProps }) => {
  useTracked(
    'a label long enough that this call cannot fit on a single line at all',
    () => {},
    [
      restProps,
      somethingElseEntirely,
      yetAnotherDependencyWithAnExtremelyLongNameIndeed,
    ],
  );
  return <div {...restProps} />;
};
`,
      options: { hookNames: ['useTracked'] },
    },
    {
      name: 'two hooks in one component, both rewritten',
      code: `const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, [restProps]);
  useCallback(() => {}, [restProps]);
  return <div {...restProps} />;
};
`,
    },
    {
      name: 'DECLINED: a comment written between the arguments',
      code: `const MyComponent = ({ ...restProps }) => {
  useEffect(() => {}, /* deps */ [restProps]);
  return <div {...restProps} />;
};
`,
    },
    {
      name: 'DECLINED: a hook nested inside a JSX attribute',
      code: `const MyComponent = ({ ...restProps }) => {
  return <Button onClick={useCallback(() => {}, [restProps])} />;
};
`,
    },
  ];

  const results = CORPUS.map((entry) => ({
    ...entry,
    output: lint(entry.code, entry.options),
  }));
  const rewritten = results.filter((entry) => entry.output !== entry.code);

  it('measures the fixer, not the fixture: every input is prettier-clean', () => {
    const unstable = results
      .filter((entry) => !isFixedPoint(entry.code))
      .map((entry) => entry.name);
    expect(unstable).toEqual([]);
  });

  it('is not vacuous: most of the corpus is actually rewritten', () => {
    // A floor just under the measured count, so a corpus edit that stops
    // reaching the fixer fails here rather than emptying the assertions below
    // in silence. The three declines are the remainder, and the ceiling on them
    // keeps a regression that declines everything from reading as clean — a
    // fixer that emits nothing satisfies both oracles below perfectly.
    expect(rewritten.length).toBeGreaterThanOrEqual(15); // measured 16
    expect(results.length - rewritten.length).toBeLessThanOrEqual(3);
    expect(
      results
        .filter((entry) => entry.output === entry.code)
        .map((entry) => entry.name)
        .every((name) => name.startsWith('DECLINED:')),
    ).toBe(true);
  });

  it('emits no line carrying trailing whitespace', () => {
    const stranded = rewritten
      .filter((entry) => TRAILING_WHITESPACE.test(entry.output))
      .map((entry) => entry.name);
    expect(stranded).toEqual([]);
  });

  it('emits text prettier leaves alone', () => {
    const unstable = rewritten
      .filter((entry) => !isFixedPoint(entry.output))
      .map((entry) => entry.name);
    expect(unstable).toEqual([]);
  });

  // Both halves of #2065 are planted, because a `toEqual([])` over a filter
  // passes just as well when the oracle has gone blind. The stranded space is
  // assembled from an interpolation rather than typed into this file: written
  // literally it is trailing whitespace in the test source, which this repo's
  // own formatter would strip, leaving a control that silently stopped
  // controlling anything.
  const STRANDED_SEPARATOR = [
    'const MyComponent = ({ title, ...typographyProps }) => {',
    '  useEffect(() => {',
    '    console.log(title);',
    `  },${' '}`,
    '  // eslint-disable-next-line react-hooks/exhaustive-deps',
    '  [stableHash(typographyProps)]);',
    '};',
    '',
  ].join('\n');

  // The same call expanded, but with the arguments left at the depth the
  // pre-image gave them instead of the one step deeper prettier prints.
  const PRE_IMAGE_INDENT = `const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(
  () => {
    console.log(title);
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(typographyProps)],
  );
};
`;

  const POST_EXPANSION_INDENT = `const MyComponent = ({ title, ...typographyProps }) => {
  useEffect(
    () => {
      console.log(title);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(typographyProps)],
  );
};
`;

  it('is not vacuous: the stranded separator space is still detected', () => {
    expect(STRANDED_SEPARATOR).toContain(`},${' '}\n`);
    expect(TRAILING_WHITESPACE.test(STRANDED_SEPARATOR)).toBe(true);
    expect(isFixedPoint(STRANDED_SEPARATOR)).toBe(false);
  });

  it('is not vacuous: the pre-image indentation is still detected', () => {
    // The second half of the bug survives the first: no line here carries
    // trailing whitespace, so only the prettier oracle can see it.
    expect(TRAILING_WHITESPACE.test(PRE_IMAGE_INDENT)).toBe(false);
    expect(isFixedPoint(PRE_IMAGE_INDENT)).toBe(false);
    // And the same call at the depth prettier prints is accepted, so the oracle
    // is reading the indentation rather than rejecting the shape outright.
    expect(POST_EXPANSION_INDENT).not.toBe(PRE_IMAGE_INDENT);
    expect(isFixedPoint(POST_EXPANSION_INDENT)).toBe(true);
  });

  // Owning the argument list costs a remedy on any call whose statement shares
  // its line with text ahead of it, since the expansion's indent is derived from
  // where that statement starts. `fix-spelling-asymmetry` sees that as a fix
  // available in one function spelling and not the other and exempts the rule
  // for it, which un-gates the rule's every other arm there (#1839) — so the
  // boundary is pinned here instead: the decline tracks whether prettier would
  // reprint the input, not whether the body is concise or a block.
  describe('the expansion declines exactly on a body prettier would reprint', () => {
    // Same function, same body, three spellings. Only the collapsed one puts the
    // hook's statement anywhere but the start of a line.
    const CONCISE = `const MyComponent = ({ ...restProps }) => {
  const build = (someArgument: string) =>
    useCallback(() => {}, [restProps, someArgument]);
  return <div {...restProps} onClick={build} />;
};
`;

    const BLOCK = `const MyComponent = ({ ...restProps }) => {
  const build = (someArgument: string) => {
    return useCallback(() => {}, [restProps, someArgument]);
  };
  return <div {...restProps} onClick={build} />;
};
`;

    const COLLAPSED_BLOCK = `const MyComponent = ({ ...restProps }) => {
  const build = (someArgument: string) => { return useCallback(() => {}, [restProps, someArgument]); };
  return <div {...restProps} onClick={build} />;
};
`;

    it('remedies both spellings prettier actually prints', () => {
      for (const [name, code] of [
        ['concise', CONCISE],
        ['block', BLOCK],
      ] as const) {
        expect([name, isFixedPoint(code)]).toEqual([name, true]);
        const output = lint(code);
        expect([name, output === code]).toEqual([name, false]);
        expect([name, isFixedPoint(output)]).toEqual([name, true]);
        expect([name, TRAILING_WHITESPACE.test(output)]).toEqual([name, false]);
      }
    });

    it('declines the collapsed body rather than emitting text prettier rejects', () => {
      // The shape is unreachable from prettier-formatted source, which is what
      // agora lints — so the lost remedy costs a report that stands, not a fix.
      expect(isFixedPoint(COLLAPSED_BLOCK)).toBe(false);
      expect(lint(COLLAPSED_BLOCK)).toBe(COLLAPSED_BLOCK);
    });

    it('is not vacuous: the collapsed body is the same violation, still reported', () => {
      // Without this the decline above is indistinguishable from the rule simply
      // not firing — and a rule that went silent would satisfy it perfectly.
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
      const config = {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020 as const,
          sourceType: 'module' as const,
          ecmaFeatures: { jsx: true },
        },
        rules: { [RULE_ID]: 'error' as Linter.RuleEntry<unknown[]> },
      };

      const reportsFor = (code: string) =>
        linter.verify(code, config, 'Component.tsx');

      for (const [name, code] of [
        ['concise', CONCISE],
        ['block', BLOCK],
        ['collapsed', COLLAPSED_BLOCK],
      ] as const) {
        const messages = reportsFor(code);
        expect([name, messages.filter((m) => m.fatal).length]).toEqual([
          name,
          0,
        ]);
        expect([
          name,
          messages.map((m) => (m as { messageId?: string }).messageId),
        ]).toEqual([name, ['wrapSpreadPropsWithStableHash']]);
      }

      // The remedy, not the report, is what the collapsed spelling loses.
      expect(
        reportsFor(COLLAPSED_BLOCK).map((m) => !!(m as { fix?: unknown }).fix),
      ).toEqual([false]);
      expect(
        reportsFor(BLOCK).map((m) => !!(m as { fix?: unknown }).fix),
      ).toEqual([true]);
    });
  });
});
