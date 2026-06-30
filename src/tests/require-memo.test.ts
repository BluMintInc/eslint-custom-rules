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
    ...[
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
        code: `const shorthandHOC = (Component) => (props) => <Component {...props} />;`,
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
    // camelCase render-prop callbacks — NOT React components (issue #1243)
    {
      filename: 'rankColumn.tsx',
      code: `
    import type { GridRenderCellParams } from '@mui/x-data-grid';
    import { Rank } from 'src/components/Rank';
    const renderRankCellOrdinal = ({ row }: Readonly<GridRenderCellParams>) => {
      return <Rank rank={row.rank} />;
    };
    export const col = { field: 'rank', renderCell: renderRankCellOrdinal };
  `,
    },
    {
      filename: 'render.tsx',
      code: `const renderItem = (item) => <li>{item.label}</li>;`,
    },
    // camelCase FunctionDeclaration at Program level — not a component
    {
      filename: 'cellRenderers.tsx',
      code: `function renderCell(props) { return <td>{props.value}</td>; }`,
    },
    // exported camelCase FunctionDeclaration — not a component
    {
      filename: 'cellRenderers.tsx',
      code: `export function renderCell({ row }) { return <div>{row.id}</div>; }`,
    },
    // lowercase single-word camelCase arrow function with destructuring
    {
      filename: 'utils.tsx',
      code: `const render = ({ data }) => <span>{data}</span>;`,
    },
    // underscore-prefixed name — does not start with uppercase
    {
      filename: 'utils.tsx',
      code: `const _renderItem = ({ item }) => <li>{item.name}</li>;`,
    },
    // multi-segment camelCase arrow function with typed params
    {
      filename: 'grid.tsx',
      code: `const getRowElement = ({ id, label }: { id: string; label: string }) => <tr key={id}><td>{label}</td></tr>;`,
    },
    // camelCase function declaration with multiple params
    {
      filename: 'helpers.tsx',
      code: `function formatCell({ value, style }) { return <span style={style}>{value}</span>; }`,
    },
    // exported camelCase arrow render callback
    {
      filename: 'table.tsx',
      code: `export const renderRow = ({ row, index }) => <div data-index={index}>{row.id}</div>;`,
    },
    // camelCase name with "handle" prefix — still not PascalCase
    {
      filename: 'grid.tsx',
      code: `const handleRenderItem = ({ item }) => <li>{item.name}</li>;`,
    },
  ],
  invalid: [
    withDefaults({
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'Component',
    }),
    withDefaults({
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
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
const MultiplePropsComponent = memo(function MultiplePropsComponentUnmemoized({ foo, bar }) { return <div>{foo}{bar}</div>; });`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'MultiplePropsComponent',
    }),
    withDefaults({
      code: `function DefaultPropComponent({ foo = 'default' }) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
const DefaultPropComponent = memo(function DefaultPropComponentUnmemoized({ foo = 'default' }) { return <div>{foo}</div>; });`,
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
      });`,
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
          });`,
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
          });`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'ShouldBeMemoized',
    }),
    withDefaults({
      code: `export function ShouldStillBeMemoized({foo}) {
            return (
              <div>{foo}</div>
            )
          }`,
      output: `import { memo } from '../util/memo';
export const ShouldStillBeMemoized = memo(function ShouldStillBeMemoizedUnmemoized({foo}) {
            return (
              <div>{foo}</div>
            )
          });`,
      name: 'ShouldStillBeMemoized',
    }),
    withDefaults({
      code: `async function AsyncComponent({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'AsyncComponent',
    }),
    withDefaults({
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from 'src/util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      filename: 'pages/SomeComponent.tsx',
      name: 'Component',
    }),
    withDefaults({
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from './util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      filename: 'src/SomeComponent.tsx',
      name: 'Component',
    }),
    withDefaults({
      code: `function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      filename: 'src\\components\\SomeComponent.tsx',
      name: 'Component',
    }),
    // Confirm PascalCase arrow functions are still flagged (no false negatives from fix)
    withDefaults({
      code: `const RenderItem = ({ item }) => <li>{item.label}</li>;`,
      name: 'RenderItem',
    }),
    // Confirm PascalCase function declarations are still flagged
    withDefaults({
      code: `function RenderCell({ value }) { return <span>{value}</span>; }`,
      output: `import { memo } from '../util/memo';
const RenderCell = memo(function RenderCellUnmemoized({ value }) { return <span>{value}</span>; });`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'RenderCell',
    }),
    // Confirm exported PascalCase function declarations are still flagged
    withDefaults({
      code: `export function RenderRow({ row }) { return <tr><td>{row.id}</td></tr>; }`,
      output: `import { memo } from '../util/memo';
export const RenderRow = memo(function RenderRowUnmemoized({ row }) { return <tr><td>{row.id}</td></tr>; });`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'RenderRow',
    }),
  ],
});
