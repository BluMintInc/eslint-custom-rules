import type { TSESLint } from '@typescript-eslint/utils';
import { requireMemo } from '../rules/require-memo';
import { ruleTesterJsx } from '../utils/ruleTester';

const message = (name: string) =>
  `Component "${name}" renders JSX with props but is not wrapped in memo(). ` +
  'Without memo the component function is recreated on every parent render, breaking referential equality and causing avoidable child re-renders. ' +
  `Wrap the component with memo from util/memo so callers receive a stable reference; rename to "${name}Unmemoized" if it must stay un-memoized.`;

type RequireMemoInvalidCase = Omit<
  TSESLint.InvalidTestCase<'requireMemo', []>,
  'errors'
> & { name?: string };

const withDefaults = ({
  name,
  ...testCase
}: RequireMemoInvalidCase): TSESLint.InvalidTestCase<'requireMemo', []> => ({
  ...testCase,
  filename: testCase.filename || 'src/components/SomeComponent.tsx',
  errors: [
    {
      message: message(name || 'Component'),
    },
  ] as unknown as TSESLint.TestCaseError<'requireMemo'>[],
});

ruleTesterJsx.run('requireMemo', requireMemo, {
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
  ].map((testCase) => ({
    ...testCase,
    filename: 'SomeComponent.tsx',
  })),
  invalid: [
    withDefaults({
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; })`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'Component',
    }),
    withDefaults({
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; })`,
      filename: 'src/components/nested/SomeComponent.tsx',
      name: 'Component',
    }),
    withDefaults({
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
      name: 'TeamMemberDetails',
    }),
    withDefaults({
      code: `const FooBar = ({baz}) => {
            return (
                <SomeOtherComponent baz={baz}/>
            )
        }`,
      name: 'FooBar',
    }),
    withDefaults({
      code: `const FooBar: FC<{baz: string}> = ({baz}) => {
            return (
                <SomeOtherComponent baz={baz}/>
            )
        }`,
      name: 'FooBar',
    }),
    withDefaults({
      code: `function MultiplePropsComponent({ foo, bar }) { return <div>{foo}{bar}</div>; }`,
      output: `import { memo } from '../util/memo';
const MultiplePropsComponent = memo(function MultiplePropsComponentUnmemoized({ foo, bar }) { return <div>{foo}{bar}</div>; })`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'MultiplePropsComponent',
    }),
    withDefaults({
      code: `function DefaultPropComponent({ foo = 'default' }) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
const DefaultPropComponent = memo(function DefaultPropComponentUnmemoized({ foo = 'default' }) { return <div>{foo}</div>; })`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'DefaultPropComponent',
    }),
    withDefaults({
      code: `const Component = ({ someFunc }) => <div>{someFunc()}</div>;`,
      name: 'Component',
    }),
    withDefaults({
      code: `const Component = ({ foo, shouldRender }) => { return shouldRender ? <div>{foo}</div> : null; };`,
      name: 'Component',
    }),
    withDefaults({
      code: `const Component = ({ foo, ...rest }) => <div>{foo}{Object.values(rest).join()}</div>;`,
      name: 'Component',
    }),
    withDefaults({
      code: `const Component = ({ onClick = () => {} }) => <button onClick={onClick}>Click me</button>;`,
      name: 'Component',
    }),
    withDefaults({
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
      name: 'ShouldBeMemoized',
    }),
    withDefaults({
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
      name: 'ShouldBeMemoized',
    }),
    withDefaults({
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
      name: 'ShouldBeMemoized',
    }),
    withDefaults({
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
      name: 'ShouldStillBeMemoized',
    }),
    withDefaults({
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from 'src/util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; })`,
      filename: 'pages/SomeComponent.tsx',
      name: 'Component',
    }),
    withDefaults({
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from './util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; })`,
      filename: 'src/SomeComponent.tsx',
      name: 'Component',
    }),
    withDefaults({
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; })`,
      filename: 'src\\components\\SomeComponent.tsx',
      name: 'Component',
    }),
  ],
});
