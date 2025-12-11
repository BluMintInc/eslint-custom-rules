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
    ],
  },
);
