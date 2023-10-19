import { requireMemo } from '../rules/require-memo';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run('requireMemo', requireMemo, {
  // valid: [],
  valid: [
    {
      code: `const Component = React.memo(() => <div />)`,
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
    },
    {
      code: `function DefaultPropComponent({ foo = 'default' }) { return <div>{foo}</div>; }
        `,
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
    {
      code: `export function ShouldBeMemoized({foo}) {
                return (
                  <div>{foo}</div>
                )
              }`,
    },
  ].map((testCase) => {
    return {
      ...testCase,
      filename: 'SomeComponent.tsx',
      errors: [{ messageId: 'requireMemo' }],
    };
  }),
});
