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

    // ---------------------------------------------------------------------
    // Colliding `memo` bindings: the report stands, the edit is withheld.
    // ---------------------------------------------------------------------
    withDefaults({
      code: `const memo = 1;
function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `let memo;
function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `function memo(fn) { return fn; }
export function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `class memo {}
function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `import { memo } from 'react';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `import * as memo from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `import memo from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `import type { memo } from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `import { type memo } from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `import { useState as memo } from 'react';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `import { createMemo as memo } from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    // Shadowing parameter: the emitted call would bind to the parameter.
    withDefaults({
      code: `export function Component(memo) { return <div>{memo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    // Shadow declared inside the component body.
    withDefaults({
      code: `function Component({foo}) {
  const memo = foo;
  return <div>{memo}</div>;
}`,
      output: null,
      name: 'Component',
    }),

    // ---------------------------------------------------------------------
    // Non-colliding paths: the edit must still land, byte-identical.
    // ---------------------------------------------------------------------
    // memo already imported from util/memo — reused, no duplicate specifier.
    withDefaults({
      code: `import { memo } from '../util/memo';
export function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
export const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // Other named specifier from util/memo — the specifier list is extended.
    withDefaults({
      code: `import { memoWithDisplayName } from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memoWithDisplayName, memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // Default import from util/memo cannot host a bare named specifier.
    withDefaults({
      code: `import memoDefault from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import memoDefault, { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // Namespace import cannot host a named specifier — own declaration.
    withDefaults({
      code: `import * as memoUtils from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import * as memoUtils from '../util/memo';
import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // A type-only import erases at compile time, so it cannot carry the value.
    withDefaults({
      code: `import type { MemoOptions } from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import type { MemoOptions } from '../util/memo';
import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // Side-effect-only import has no specifier to extend.
    withDefaults({
      code: `import '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import '../util/memo';
import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // React default import: `React.memo` is a member access, not a `memo`
    // binding, so it must not be mistaken for a collision.
    withDefaults({
      code: `import React from 'react';
const Widget = React.memo(() => <div />);
export function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import React from 'react';
import { memo } from '../util/memo';
const Widget = React.memo(() => <div />);
export const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // A similarly named binding must not trigger the guard.
    withDefaults({
      code: `const memoize = (fn) => fn;
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
const memoize = (fn) => fn;
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // An aliased util/memo import leaves the `memo` name free.
    withDefaults({
      code: `import { memo as memoAliased } from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo as memoAliased, memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
  ],
});
