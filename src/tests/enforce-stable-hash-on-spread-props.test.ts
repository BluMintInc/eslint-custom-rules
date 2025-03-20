import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceStableHashOnSpreadProps } from '../rules/enforce-stable-hash-on-spread-props';

// Configure the rule tester to ignore react-hooks/exhaustive-deps rule
ruleTesterJsx.run('enforce-stable-hash-on-spread-props', enforceStableHashOnSpreadProps, {
  valid: [
    // Already wrapped in stableHash
    {
      code: `
        import { stableHash } from 'fuunctions/src/util/hash/stableHash';

        const MyComponent = ({ someProp, ...typographyProps }) => {
          useEffect(() => {
            console.log('typographyProps changed!');
          }, [stableHash(typographyProps)]);

          return <Typography {...typographyProps}>Hello</Typography>;
        };
      `,
    },
    // Already memoized with useMemo that directly returns the spread prop
    {
      code: `
        const MyComponent = ({ someProp, ...typographyProps }) => {
          const memoizedProps = useMemo(() => typographyProps, [typographyProps]);

          useEffect(() => {
            console.log('typographyProps changed!');
          }, [memoizedProps]);

          return <Typography {...typographyProps}>Hello</Typography>;
        };
      `,
    },
    // Non-spread props should not be flagged
    {
      code: `
        const MyComponent = ({ someProp, title }) => {
          useEffect(() => {
            console.log('title changed!');
          }, [title]);

          return <Typography title={title}>Hello</Typography>;
        };
      `,
    },
    // Primitive values should not be flagged
    {
      code: `
        const MyComponent = ({ count }) => {
          useEffect(() => {
            console.log('count changed!');
          }, [count]);

          return <div>{count}</div>;
        };
      `,
    },
    // Non-destructured props should not be flagged
    {
      code: `
        const MyComponent = (props) => {
          useEffect(() => {
            console.log('props changed!');
          }, [props]);

          return <div>{props.title}</div>;
        };
      `,
    },
  ],
  invalid: [
    // Basic case - spread props in dependency array
    {
      code: `
        const MyComponent = ({ someProp, ...typographyProps }) => {
          useEffect(() => {
            console.log('typographyProps changed!');
          }, [typographyProps]);

          return <Typography {...typographyProps}>Hello</Typography>;
        };
      `,
      errors: [
        {
          messageId: 'enforceStableHash',
        },
      ],
      output: `
        import { stableHash } from 'fuunctions/src/util/hash/stableHash';

        const MyComponent = ({ someProp, ...typographyProps }) => {
          useEffect(() => {
            console.log('typographyProps changed!');
                      // eslint-disable-next-line react-hooks/exhaustive-deps
          }, [stableHash(typographyProps)]);

          return <Typography {...typographyProps}>Hello</Typography>;
        };
      `,
    },
    // Multiple hooks using the same spread props
    {
      code: `
        const MyComponent = ({ someProp, ...typographyProps }) => {
          useEffect(() => {
            console.log('Effect 1');
          }, [typographyProps]);

          useCallback(() => {
            console.log('Callback');
          }, [typographyProps]);

          return <Typography {...typographyProps}>Hello</Typography>;
        };
      `,
      errors: [
        {
          messageId: 'enforceStableHash',
        },
        {
          messageId: 'enforceStableHash',
        },
      ],
      output: `
        import { stableHash } from 'fuunctions/src/util/hash/stableHash';

        const MyComponent = ({ someProp, ...typographyProps }) => {
          useEffect(() => {
            console.log('Effect 1');
                      // eslint-disable-next-line react-hooks/exhaustive-deps
          }, [stableHash(typographyProps)]);

          useCallback(() => {
            console.log('Callback');
                      // eslint-disable-next-line react-hooks/exhaustive-deps
          }, [stableHash(typographyProps)]);

          return <Typography {...typographyProps}>Hello</Typography>;
        };
      `,
    },
    // Function component with function declaration
    {
      code: `
        function MyComponent({ someProp, ...typographyProps }) {
          useMemo(() => {
            return computeValue(typographyProps);
          }, [typographyProps]);

          return <Typography {...typographyProps}>Hello</Typography>;
        }
      `,
      errors: [
        {
          messageId: 'enforceStableHash',
        },
      ],
      output: `
        import { stableHash } from 'fuunctions/src/util/hash/stableHash';

        function MyComponent({ someProp, ...typographyProps }) {
          useMemo(() => {
            return computeValue(typographyProps);
                      // eslint-disable-next-line react-hooks/exhaustive-deps
          }, [stableHash(typographyProps)]);

          return <Typography {...typographyProps}>Hello</Typography>;
        }
      `,
    },
  ],
});
