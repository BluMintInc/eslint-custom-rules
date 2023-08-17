import { requireMemo } from '../rules/require-memo';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run('requireMemo', requireMemo, {
  //   valid: [],
  valid: [
    {
      code: `const Component = React.memo(() => <div />)`,
    },
    {
      code: `const Component = memo(({foo}) => <div>{foo}</div>)`,
    },
    {
      code: `const Component = memo(({foo}) => <div>{foo}</div>, (oldProps,newProps) => true)`,
    },
    {
      code: `const Component = memo(useRef(() => <div />))`,
    },
    {
      code: `const Component = React.useRef(React.memo(() => <div />))`,
    },
    {
      code: `const myFunction = wrapper(() => <div />)`,
    },
    {
      code: `const Component = React.memo(function() { return <div />; });`,
    },
    {
      code: `const Component = memo(function Component() { return <div />; });`,
    },
    {
      code: `const myFunction = () => <div />`,
    },
    {
      code: `const myFunction = wrapper(() => <div />)`,
    },
    {
      code: `function myFunction() { return <div />; }`,
    },
    {
      code: `const myFunction = wrapper(function() { return <div /> })`,
    },
    {
      code: `const Component = () => <div />`,
    },
    {
      code: `function withHOC(Component) {
            return function WrappedComponent(props) {
              return <Component {...props} />;
            }};
          `,
    },
    {
      code: `function useComponent() {
            return function HookComponent() {
              return <div>From Hook</div>;
            };
          }`,
    },
    {
      code: `function GetUserInfo() {
            // some logic here...
            return userData;
          }`,
    },
  ].map((testCase) => {
    return {
      ...testCase,
      filename: 'SomeComponent.tsx',
    };
  }),
  invalid: [
    {
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
    },
    {
      code: `const FooBar: FC<{baz: string}> = ({baz}) => {
            return (
                <SomeOtherComponent baz={baz}/>
            )
        }`,
    },
    {
      code: `function MultiplePropsComponent({ foo, bar }) { return <div>{foo}{bar}</div>; }`,
    },
    {
      code: `function DefaultPropComponent({ foo = 'default' }) { return <div>{foo}</div>; }
        `,
    },
  ].map((testCase) => {
    return {
      ...testCase,
      filename: 'SomeComponent.tsx',
      errors: [{ messageId: 'requireMemo' }],
    };
  }),
});
