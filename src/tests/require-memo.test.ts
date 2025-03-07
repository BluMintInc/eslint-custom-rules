import { requireMemo } from '../rules/require-memo';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run('requireMemo', requireMemo, {
  // valid: [],
  valid: [
    {
      code: `const Component = memo(() => <div />)`,
    },
    {
      code: `const ComponentUnmemoized = ({foo}) => <div>{foo}</div>`,
    },
    {
      code: `export function UnmemoizedThing({foo}) {
                return (
                  <div>{foo}</div>
                )
              }`,
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
      code: `const myFunction = wrapper(() => <div />)`,
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
      code: `export const Wizard = wrappedWithHOF(
        (props) => {
         return <Component {...props} />;
       })`,
    },
    {
      code: `export const Wizard = wrappedWithHOF(
        function (props) {
         return <Component {...props} />;
       })`,
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
    {
      code: `import { memo } from 'src/util/memo';
      const Component = memo(() => <div />)`,
    },
    {
      code: `import { memo } from '../util/memo';
      const Component = memo(() => <div />)`,
    },
    {
      code: `import { memo } from '../../util/memo';
      const Component = memo(() => <div />)`,
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
      output: `import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; })`,
      filename: 'src/components/SomeComponent.tsx',
    },
    {
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; })`,
      filename: 'src/components/nested/SomeComponent.tsx',
    },
    {
      code: `export const TeamMemberDetails = ({ member }: TeamMemberDetailsProps) => {
        const { user } = useAuth();
        const { checkedIn, imgUrl, status, tournamentId, ...memberRest } = member;
        const { username, userId } = memberRest;
        return (
          <>
            {!!Object.keys(memberRest).length && (
              <>
                <ChipUser
                  username={truncateIfTooLong(username)}
                  avatarUrl={imgUrl}
                  href={\`/profile/\${userId}\`}
                />,
                {isAdmin(user?.email) && !!memberRest && (
                  <ParticipantAdminDetails
                    {...memberRest}
                    sx={{ wordWrap: 'break-word' }}
                  />
                )}
              </>
            )}
          </>
        );
      };`,
    },
    {
      code: `const FooBar = ({baz}) => {
            return (
                <SomeOtherComponent baz={baz}/>
            )
        }`,
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
      output: `import { memo } from '../util/memo';
const MultiplePropsComponent = memo(function MultiplePropsComponentUnmemoized({ foo, bar }) { return <div>{foo}{bar}</div>; })`,
      filename: 'src/components/SomeComponent.tsx',
    },
    {
      code: `function DefaultPropComponent({ foo = 'default' }) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
const DefaultPropComponent = memo(function DefaultPropComponentUnmemoized({ foo = 'default' }) { return <div>{foo}</div>; })`,
      filename: 'src/components/SomeComponent.tsx',
    },
    {
      code: `const Component = ({ someFunc }) => <div>{someFunc()}</div>;`,
    },
    {
      code: `const Component = ({ foo, shouldRender }) => { return shouldRender ? <div>{foo}</div> : null; };`,
    },
    {
      code: `const Component = ({ foo, ...rest }) => <div>{foo}{Object.values(rest).join()}</div>;`,
    },
    {
      code: `const Component = ({ onClick = () => {} }) => <button onClick={onClick}>Click me</button>;`,
    },
    // NOTE: for autofix, whitespace formatting matters!
    {
      code: `export function ShouldBeMemoized({foo}) {
        return (
          <div>{foo}</div>
        )
      }`,
      output: `import { memo } from '../util/memo';
export const ShouldBeMemoized = memo(function ShouldBeMemoizedUnmemoized({foo}) {
        return (
          <div>{foo}</div>
        )
      })`,
      filename: 'src/components/SomeComponent.tsx',
    },
    {
      code: `export function ShouldBeMemoized({ foo }: { foo: string }): JSX.Element {
            return (
              <div>{foo}</div>
            )
          }`,
      output: `import { memo } from '../util/memo';
export const ShouldBeMemoized = memo(function ShouldBeMemoizedUnmemoized({ foo }: { foo: string }): JSX.Element {
            return (
              <div>{foo}</div>
            )
          })`,
      filename: 'src/components/SomeComponent.tsx',
    },
    // existing react import
    {
      code: `import { useState } from 'react';
    export function ShouldBeMemoized({foo}) {
            return (
              <div>{foo}</div>
            )
          }`,
      output: `import { useState } from 'react';
import { memo } from '../util/memo';
    export const ShouldBeMemoized = memo(function ShouldBeMemoizedUnmemoized({foo}) {
            return (
              <div>{foo}</div>
            )
          })`,
      filename: 'src/components/SomeComponent.tsx',
    },
    //existing memo import
    {
      code: `import { memo } from '../util/memo';
    
    export function ShouldStillBeMemoized({foo}) {
            return (
              <div>{foo}</div>
            )
          }`,
      output: `import { memo } from '../util/memo';
    
    export const ShouldStillBeMemoized = memo(function ShouldStillBeMemoizedUnmemoized({foo}) {
            return (
              <div>{foo}</div>
            )
          })`,
    },
    // Test absolute path import
    {
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from 'src/util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; })`,
      filename: 'pages/SomeComponent.tsx',
    },
    // Test same directory import
    {
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from './util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; })`,
      filename: 'src/SomeComponent.tsx',
    },
    // Test Windows-style paths
    {
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; })`,
      filename: 'src\\components\\SomeComponent.tsx',
    },
  ].map((testCase) => ({
    ...testCase,
    filename: testCase.filename || 'src/components/SomeComponent.tsx',
    errors: [{ messageId: 'requireMemo' }],
  })),
});
