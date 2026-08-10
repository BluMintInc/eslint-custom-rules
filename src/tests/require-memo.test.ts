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

    // ---------------------------------------------------------------------
    // Already memoized where it escapes: a second wrapper is redundant. The
    // carve-out is spelling-blind (#1774): the arrow twins below must stay as
    // silent as the declarations, or the two spellings drift apart again.
    // ---------------------------------------------------------------------
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return memo(Row);
}`,
    },
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function withRef(Wrapped) {
  function Inner({value}, ref) { return <Wrapped value={value} ref={ref} />; }
  return memo(forwardRef(Inner));
}`,
    },
    // The arrow twins of the two shapes above.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeRow() {
  const Row = ({label}) => { return <li>{label}</li>; };
  return memo(Row);
}`,
    },
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function withRef(Wrapped) {
  const Inner = ({value}, ref) => { return <Wrapped value={value} ref={ref} />; };
  return memo(forwardRef(Inner));
}`,
    },
    // A type assertion on the memoized hand-back does not hide the wrapper.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return memo(Row) as ComponentType<RowProps>;
}`,
    },
    // `React.memo` spells the same helper through a member access.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import React from 'react';
export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return React.memo(Row);
}`,
    },
    // The nullish spellings of the two shapes above are not pinned here:
    // `optional-chaining-closure` derives them from these fixtures, and the
    // sibling `memo-nested-react-components` pins the hand-back twins in its
    // own suite, where the matching carve-out lives (#1911).

    // ---------------------------------------------------------------------
    // A CONTAINER-carried hand-back memoizes the component just as a bare
    // `return memo(Row)` does (#1919): `{ __esModule: true, default: <component> }`
    // is what every `jest.mock()` factory returns for a default export, so it is
    // the common way a memoized component reaches its callers in test code.
    // ---------------------------------------------------------------------
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return { __esModule: true, default: memo(Row) };
}`,
    },
    // The arrow twin of the shape above — the carve-out stays spelling-blind
    // through a container too.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeRow() {
  const Row = ({label}) => { return <li>{label}</li>; };
  return { __esModule: true, default: memo(Row) };
}`,
    },
    // The gap is container recursion, not optional chaining: the nullish
    // spelling inside a container reads as the same wrapper the plain one does.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return { __esModule: true, default: memo?.(Row) };
}`,
    },
    // Depth is not a boundary — a container nested in a container carries the
    // component out just the same.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeModule() {
  function Row({label}) { return <li>{label}</li>; }
  return { rows: { default: memo(Row) } };
}`,
    },
    // An ARRAY element is a carried value as much as a property value is, and
    // the bare spelling is pinned here because the sibling
    // `memo-nested-react-components` reads an array-carried hand-back too
    // (#1925) — it is silent on both, so neither fixture signs off a gap of
    // its own.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return [memo(Row)];
}`,
    },
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return [[memo(Row)]];
}`,
    },
    // The array arm stays load-bearing when the array sits inside the object
    // container: `Cell` is reachable only through it.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeModule() {
  function Row({label}) { return <li>{label}</li>; }
  function Cell({value}) { return <td>{value}</td>; }
  return { __esModule: true, default: memo(Row), extras: [memo(Cell)] };
}`,
    },
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeModule() {
  function Row({label}) { return <li>{label}</li>; }
  function Cell({value}) { return <td>{value}</td>; }
  return { __esModule: true, default: memo(Row), extras: [[memo(Cell)]] };
}`,
    },
    // A second wrapper inside the container is read through, exactly as it is
    // when the call is returned directly.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function withRef(Wrapped) {
  function Inner({value}, ref) { return <Wrapped value={value} ref={ref} />; }
  return { __esModule: true, default: memo(forwardRef(Inner)) };
}`,
    },
    // A type assertion over the whole container does not hide the wrapper.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return { __esModule: true, default: memo(Row) } as RowModule;
}`,
    },
    // A shorthand property is read as the VALUE it carries, never as its key:
    // `Row` names a binding that is already memoized, and `Cell`'s wrapper in
    // the property beside it still counts.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export function makeModule() {
  const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });
  function Cell({value}) { return <td>{value}</td>; }
  return { Row, default: memo(Cell) };
}`,
    },
    // A nested camelCase helper stays a helper wherever it sits (issue #1243).
    // Not named `render*`, because that name shape is
    // `no-render-function-components`' claim.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `function Toolbar() {
  function formatCell({value}) { return <td>{value}</td>; }
  return <table>{formatCell({value: 1})}</table>;
}`,
    },
    // A nested non-component function returns no JSX, so no spelling of it is
    // a memo candidate.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export const Wrapper = memo(function WrapperUnmemoized({items}) {
  function total({values}) { return values.length; }
  return <div>{total({values: items})}</div>;
});`,
    },
    // A nested declaration opts out the same way a top-level one does.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export const Page = memo(function PageUnmemoized({items}) {
  function RowUnmemoized({label}) { return <li>{label}</li>; }
  return <ul>{items.map((item) => <RowUnmemoized label={item} />)}</ul>;
});`,
    },

    // ---------------------------------------------------------------------
    // `export default` shapes that stay exempt for the ordinary reasons.
    // ---------------------------------------------------------------------
    // Anonymous default export has no name to memoize or to opt out with.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export default function ({foo}) { return <div>{foo}</div>; }`,
    },
    // Explicit opt-out via the `Unmemoized` suffix.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export default function ComponentUnmemoized({foo}) { return <div>{foo}</div>; }`,
    },
    // camelCase default export — a render helper, not a component.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export default function renderCell({value}) { return <span>{value}</span>; }`,
    },
    // A default-exported declaration taking no props is not a memo candidate,
    // matching the existing parameterless carve-out.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `export default function Component() { return <div />; }`,
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
      output: `import { memo } from '../util/memo';
export const TeamMemberDetails = memo(({ member }: TeamMemberDetailsProps) => {
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
      });`,
      name: 'TeamMemberDetails',
    }),
    withDefaults({
      code: `const FooBar = ({baz}) => {
            return (
                <SomeOtherComponent baz={baz}/>
            )
        }`,
      output: `import { memo } from '../util/memo';
const FooBar = memo(({baz}) => {
            return (
                <SomeOtherComponent baz={baz}/>
            )
        })`,
      name: 'FooBar',
    }),
    // An annotated binding keeps its report and loses its edit: memo()'s return
    // type need not be assignable to the declared one, so the rewrite would
    // trade a lint report for a type error.
    withDefaults({
      code: `const FooBar: FC<{baz: string}> = ({baz}) => {
            return (
                <SomeOtherComponent baz={baz}/>
            )
        }`,
      output: null,
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
      output: `import { memo } from '../util/memo';
const Component = memo(({ someFunc }) => <div>{someFunc()}</div>);`,
      name: 'Component',
    }),
    withDefaults({
      code: `const Component = ({ foo, shouldRender }) => { return shouldRender ? <div>{foo}</div> : null; };`,
      output: `import { memo } from '../util/memo';
const Component = memo(({ foo, shouldRender }) => { return shouldRender ? <div>{foo}</div> : null; });`,
      name: 'Component',
    }),
    withDefaults({
      code: `const Component = ({ foo, ...rest }) => <div>{foo}{Object.values(rest).join()}</div>;`,
      output: `import { memo } from '../util/memo';
const Component = memo(({ foo, ...rest }) => <div>{foo}{Object.values(rest).join()}</div>);`,
      name: 'Component',
    }),
    withDefaults({
      code: `const Component = ({ onClick = () => {} }) => <button onClick={onClick}>Click me</button>;`,
      output: `import { memo } from '../util/memo';
const Component = memo(({ onClick = () => {} }) => <button onClick={onClick}>Click me</button>);`,
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
      output: `import { memo } from '../util/memo';
const RenderItem = memo(({ item }) => <li>{item.label}</li>);`,
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

    // ---------------------------------------------------------------------
    // File prologues survive the inserted import (no import to anchor to).
    // ---------------------------------------------------------------------
    // A `'use client'` directive stops being one the moment a statement
    // precedes it, turning the file into a server module.
    withDefaults({
      code: `'use client';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `'use client';
import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // A shebang parses only at character 0.
    withDefaults({
      code: `#!/usr/bin/env node
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `#!/usr/bin/env node
import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // A file-level `// @ts-nocheck` covers the whole file only from the top.
    withDefaults({
      code: `// @ts-nocheck
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `// @ts-nocheck
import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // Control: with an import to anchor to, the directive is already safe and
    // the helper import still follows the module's own imports.
    withDefaults({
      code: `'use client';
import { useState } from 'react';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `'use client';
import { useState } from 'react';
import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),

    // ---------------------------------------------------------------------
    // Scope, not parent node type (issue #1774). A declaration whose binding
    // outlives a render is reported wherever it sits; the shipped check only
    // enumerated `Program` and `ExportNamedDeclaration` parents, so the shapes
    // below went silent while their arrow twins were reported.
    // ---------------------------------------------------------------------
    // `export default const X = ...` is a syntax error, so the edit splits the
    // declaration from the export rather than rewriting in place.
    withDefaults({
      code: `export default function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });
export default Component;`,
      name: 'Component',
    }),
    // The same, with an import to anchor the helper import to.
    withDefaults({
      code: `import { useState } from 'react';
export default function ProfileCard({ user }) { return <UserAvatar {...user} />; }`,
      output: `import { useState } from 'react';
import { memo } from '../util/memo';
const ProfileCard = memo(function ProfileCardUnmemoized({ user }) { return <UserAvatar {...user} />; });
export default ProfileCard;`,
      name: 'ProfileCard',
    }),
    // A default export is not exempt from the `memo` collision guard either:
    // the report stands, the edit is withheld.
    withDefaults({
      code: `const memo = 1;
export default function Component({foo}) { return <div>{foo}</div>; }`,
      output: null,
      name: 'Component',
    }),
    // A bare block at module scope: the binding still outlives every render.
    withDefaults({
      code: `{
  function Component({foo}) { return <div>{foo}</div>; }
}`,
      output: `import { memo } from '../util/memo';
{
  const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });
}`,
      name: 'Component',
    }),
    // A conditional block at module scope.
    withDefaults({
      code: `if (flag) {
  function Component({foo}) { return <div>{foo}</div>; }
}`,
      output: `import { memo } from '../util/memo';
if (flag) {
  const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });
}`,
      name: 'Component',
    }),
    // A namespace body is not module scope, yet the shipped check reported this
    // one purely because its parent happened to be `ExportNamedDeclaration`.
    // It stays reported, for the right reason.
    withDefaults({
      code: `namespace UI {
  export function Component({foo}) { return <div>{foo}</div>; }
}`,
      output: `import { memo } from '../util/memo';
namespace UI {
  export const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });
}`,
      name: 'Component',
    }),
    // The same namespace declaration without `export` — identical lifetime,
    // and the parent-type check missed it.
    withDefaults({
      code: `namespace UI {
  function Component({foo}) { return <div>{foo}</div>; }
}`,
      output: `import { memo } from '../util/memo';
namespace UI {
  const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });
}`,
      name: 'Component',
    }),
    // An HOC factory hands the component straight to its callers unwrapped, so
    // memoizing it where it is declared is exactly the right remedy — and the
    // arrow twin of this shape has always been reported.
    withDefaults({
      code: `export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return Row;
}`,
      output: `import { memo } from '../util/memo';
export function makeRow() {
  const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });
  return Row;
}`,
      name: 'Row',
    }),
    // A type assertion on the returned reference does not hide the hand-back.
    withDefaults({
      code: `export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return Row as ComponentType<RowProps>;
}`,
      output: `import { memo } from '../util/memo';
export function makeRow() {
  const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });
  return Row as ComponentType<RowProps>;
}`,
      name: 'Row',
    }),
    // The arrow twin of the factory case, pinned so the two shapes cannot drift
    // apart again.
    withDefaults({
      code: `export function makeRow() {
  const Row = ({label}) => { return <li>{label}</li>; };
  return Row;
}`,
      output: `import { memo } from '../util/memo';
export function makeRow() {
  const Row = memo(({label}) => { return <li>{label}</li>; });
  return Row;
}`,
      name: 'Row',
    }),

    // ---------------------------------------------------------------------
    // A container carries an UN-memoized component out just as plainly as it
    // carries a memoized one (#1919). Reading the memo() call through a
    // container without reading the bare reference through it too would turn
    // every shape below from a report into a silent escape.
    // ---------------------------------------------------------------------
    withDefaults({
      code: `export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return { default: Row };
}`,
      output: `import { memo } from '../util/memo';
export function makeRow() {
  const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });
  return { default: Row };
}`,
      name: 'Row',
    }),
    // A shorthand property hands the binding back under its own name.
    withDefaults({
      code: `export function makeRow() {
  function Row({label}) { return <li>{label}</li>; }
  return { Row };
}`,
      output: `import { memo } from '../util/memo';
export function makeRow() {
  const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });
  return { Row };
}`,
      name: 'Row',
    }),
    // A sibling property being memoized buys the bare one nothing.
    withDefaults({
      code: `export function makeModule() {
  function Row({label}) { return <li>{label}</li>; }
  function Cell({value}) { return <td>{value}</td>; }
  return { __esModule: true, default: memo(Row), fallback: Cell };
}`,
      output: `import { memo } from '../util/memo';
export function makeModule() {
  function Row({label}) { return <li>{label}</li>; }
  const Cell = memo(function CellUnmemoized({value}) { return <td>{value}</td>; });
  return { __esModule: true, default: memo(Row), fallback: Cell };
}`,
      name: 'Cell',
    }),
    // The array arm reads bare references as readily as it reads wrappers.
    withDefaults({
      code: `export function makeModule() {
  function Row({label}) { return <li>{label}</li>; }
  function Cell({value}) { return <td>{value}</td>; }
  return { __esModule: true, default: memo(Row), extras: [Cell] };
}`,
      output: `import { memo } from '../util/memo';
export function makeModule() {
  function Row({label}) { return <li>{label}</li>; }
  const Cell = memo(function CellUnmemoized({value}) { return <td>{value}</td>; });
  return { __esModule: true, default: memo(Row), extras: [Cell] };
}`,
      name: 'Cell',
    }),
    // A call that is not memo() hands back whatever it returns, so the
    // component it takes is still un-memoized where it is declared.
    withDefaults({
      code: `export function makeModule() {
  function Row({label}) { return <li>{label}</li>; }
  function Cell({value}) { return <td>{value}</td>; }
  return { __esModule: true, default: memo(Row), fallback: wrap(Cell) };
}`,
      output: `import { memo } from '../util/memo';
export function makeModule() {
  function Row({label}) { return <li>{label}</li>; }
  const Cell = memo(function CellUnmemoized({value}) { return <td>{value}</td>; });
  return { __esModule: true, default: memo(Row), fallback: wrap(Cell) };
}`,
      name: 'Cell',
    }),
    // Any bare path defeats the carve-out, in either direction: a bare return
    // beside a memoized container, and a memoized return beside a container
    // that carries the component bare.
    withDefaults({
      code: `export function makeRow(compact) {
  function Row({label}) { return <li>{label}</li>; }
  if (compact) { return Row; }
  return { __esModule: true, default: memo(Row) };
}`,
      output: `import { memo } from '../util/memo';
export function makeRow(compact) {
  const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });
  if (compact) { return Row; }
  return { __esModule: true, default: memo(Row) };
}`,
      name: 'Row',
    }),
    withDefaults({
      code: `export function makeRow(compact) {
  function Row({label}) { return <li>{label}</li>; }
  if (compact) { return memo(Row); }
  return { default: Row };
}`,
      output: `import { memo } from '../util/memo';
export function makeRow(compact) {
  const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });
  if (compact) { return memo(Row); }
  return { default: Row };
}`,
      name: 'Row',
    }),

    // ---------------------------------------------------------------------
    // Nesting is not a carve-out (issue #1774, reopened). A component declared
    // inside another function is the same component its arrow twin is at the
    // identical depth, and the arrow twin has always been reported — so the
    // declaration spelling is reported too, wherever it sits.
    // ---------------------------------------------------------------------
    // The issue's FORM2: a nested declaration, minimal shape.
    withDefaults({
      code: `function __probeNest() {
  function Component({foo}) { return <div>{foo}</div>; }
}`,
      output: `import { memo } from '../util/memo';
function __probeNest() {
  const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });
}`,
      name: 'Component',
    }),
    // The issue's control, pinned: the arrow twin at the identical depth.
    withDefaults({
      code: `function __probeNest() {
  const Component = ({foo}) => { return <div>{foo}</div>; };
}`,
      output: `import { memo } from '../util/memo';
function __probeNest() {
  const Component = memo(({foo}) => { return <div>{foo}</div>; });
}`,
      name: 'Component',
    }),
    // Declared in a function body and handed to a registrar rather than
    // returned: the binding is still an un-memoized component reaching callers.
    withDefaults({
      code: `function setup() {
  function Component({foo}) { return <div>{foo}</div>; }
  register(Component);
}`,
      output: `import { memo } from '../util/memo';
function setup() {
  const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });
  register(Component);
}`,
      name: 'Component',
    }),
    // The reopening comment's shape: a declaration inside a memo() factory.
    // The factory function itself is already memoized (and named Unmemoized);
    // only the nested Row is the violation, exactly as its arrow twin is.
    withDefaults({
      code: `export const Page = memo(function PageUnmemoized({items}) {
  function Row({label}) { return <li>{label}</li>; }
  return <ul>{items.map((item) => <Row label={item} />)}</ul>;
});`,
      output: `import { memo } from '../util/memo';
export const Page = memo(function PageUnmemoized({items}) {
  const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });
  return <ul>{items.map((item) => <Row label={item} />)}</ul>;
});`,
      name: 'Row',
    }),
    // The arrow twin inside the same memo() factory, pinned alongside it.
    withDefaults({
      code: `export const Page = memo(function PageUnmemoized({items}) {
  const Row = ({label}) => { return <li>{label}</li>; };
  return <ul>{items.map((item) => <Row label={item} />)}</ul>;
});`,
      output: `import { memo } from '../util/memo';
export const Page = memo(function PageUnmemoized({items}) {
  const Row = memo(({label}) => { return <li>{label}</li>; });
  return <ul>{items.map((item) => <Row label={item} />)}</ul>;
});`,
      name: 'Row',
    }),
    // Nested inside an arrow component's body.
    withDefaults({
      code: `const Dashboard = memo(({items}) => {
  function Row({label}) { return <li>{label}</li>; }
  return <ul>{items.map((item) => <Row label={item} />)}</ul>;
});`,
      output: `import { memo } from '../util/memo';
const Dashboard = memo(({items}) => {
  const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });
  return <ul>{items.map((item) => <Row label={item} />)}</ul>;
});`,
      name: 'Row',
    }),
    // Nested inside a method body. An object-literal method rather than a
    // class member, because a class method returning a per-call JSX-returner
    // is `require-memoize-jsx-returners`' contract, and this suite must not
    // bless a shape that sibling owns.
    withDefaults({
      code: `const panel = {
  render() {
    function Cell({value}) { return <td>{value}</td>; }
    return <table><Cell value={1} /></table>;
  },
};`,
      output: `import { memo } from '../util/memo';
const panel = {
  render() {
    const Cell = memo(function CellUnmemoized({value}) { return <td>{value}</td>; });
    return <table><Cell value={1} /></table>;
  },
};`,
      name: 'Cell',
    }),
    // Handed back bare on one branch while another renders JSX: callers can
    // still receive the un-memoized function, so the report stands.
    withDefaults({
      code: `export function renderPanel({compact, items}) {
  function Row({label}) { return <li>{label}</li>; }
  if (compact) {
    return Row;
  }
  return <ul>{items.map((item) => <Row label={item} />)}</ul>;
}`,
      output: `import { memo } from '../util/memo';
export function renderPanel({compact, items}) {
  const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });
  if (compact) {
    return Row;
  }
  return <ul>{items.map((item) => <Row label={item} />)}</ul>;
}`,
      name: 'Row',
    }),
    // Declared inside an HOC factory and consumed by the returned component:
    // the arrow twin of this shape has always been reported.
    withDefaults({
      code: `export function withGuard(Editable) {
  function GuardedInner({value}) { return <Editable value={value} />; }
  return memo(function GuardedUnmemoized({value}) {
    return <Provider><GuardedInner value={value} /></Provider>;
  });
}`,
      output: `import { memo } from '../util/memo';
export function withGuard(Editable) {
  const GuardedInner = memo(function GuardedInnerUnmemoized({value}) { return <Editable value={value} />; });
  return memo(function GuardedUnmemoized({value}) {
    return <Provider><GuardedInner value={value} /></Provider>;
  });
}`,
      name: 'GuardedInner',
    }),
    // A nested declaration meets the same collision guard a top-level one does:
    // the report stands, the edit is withheld.
    withDefaults({
      code: `import { memo } from 'react';
const Dashboard = memo(({items}) => {
  function Row({label}) { return <li>{label}</li>; }
  return <ul>{items.map((item) => <Row label={item} />)}</ul>;
});`,
      output: null,
      name: 'Row',
    }),

    // ---------------------------------------------------------------------
    // The initializer spellings carry the same remedy as the declaration one:
    // the component is wrapped where it stands, keeping the binding's name.
    // ---------------------------------------------------------------------
    withDefaults({
      code: `const Component = ({ foo }) => { return <div>{foo}</div>; };`,
      output: `import { memo } from '../util/memo';
const Component = memo(({ foo }) => { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    withDefaults({
      code: `export const Component = ({ foo }) => { return <div>{foo}</div>; };`,
      output: `import { memo } from '../util/memo';
export const Component = memo(({ foo }) => { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // A concise body needs no braces added: the arrow is wrapped whole.
    withDefaults({
      code: `const Component = ({ foo }) => <div>{foo}</div>;`,
      output: `import { memo } from '../util/memo';
const Component = memo(({ foo }) => <div>{foo}</div>);`,
      name: 'Component',
    }),
    withDefaults({
      code: `const Component = ({ foo, bar, baz }) => <div>{foo}{bar}{baz}</div>;`,
      output: `import { memo } from '../util/memo';
const Component = memo(({ foo, bar, baz }) => <div>{foo}{bar}{baz}</div>);`,
      name: 'Component',
    }),
    // An anonymous function expression stays anonymous: the edit adds the
    // wrapper and nothing else.
    withDefaults({
      code: `const Component = function ({ foo }) { return <div>{foo}</div>; };`,
      output: `import { memo } from '../util/memo';
const Component = memo(function ({ foo }) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // A named function expression keeps the name it was written with.
    withDefaults({
      code: `const Component = function ComponentInner({ foo }) { return <div>{foo}</div>; };`,
      output: `import { memo } from '../util/memo';
const Component = memo(function ComponentInner({ foo }) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // The import specifier follows the file's depth below `src`, the same way
    // it does for the declaration spelling.
    withDefaults({
      code: `const Component = ({ foo }) => <div>{foo}</div>;`,
      output: `import { memo } from '../../util/memo';
const Component = memo(({ foo }) => <div>{foo}</div>);`,
      filename: 'src/components/nested/SomeComponent.tsx',
      name: 'Component',
    }),
    withDefaults({
      code: `const Component = ({ foo }) => <div>{foo}</div>;`,
      output: `import { memo } from './util/memo';
const Component = memo(({ foo }) => <div>{foo}</div>);`,
      filename: 'src/SomeComponent.tsx',
      name: 'Component',
    }),
    // An already-imported helper is reused rather than imported twice.
    withDefaults({
      code: `import { memo } from '../util/memo';
const Component = ({ foo }) => <div>{foo}</div>;`,
      output: `import { memo } from '../util/memo';
const Component = memo(({ foo }) => <div>{foo}</div>);`,
      name: 'Component',
    }),
    // An existing value import of the helper is extended in place.
    withDefaults({
      code: `import { memoWithDisplayName } from '../util/memo';
const Component = ({ foo }) => <div>{foo}</div>;`,
      output: `import { memoWithDisplayName, memo } from '../util/memo';
const Component = memo(({ foo }) => <div>{foo}</div>);`,
      name: 'Component',
    }),
    // The helper import follows the module's own imports.
    withDefaults({
      code: `import { useState } from 'react';
const Component = ({ foo }) => <div>{foo}</div>;`,
      output: `import { useState } from 'react';
import { memo } from '../util/memo';
const Component = memo(({ foo }) => <div>{foo}</div>);`,
      name: 'Component',
    }),

    // ---------------------------------------------------------------------
    // Initializer carve-outs: the report stands, the edit is withheld.
    // ---------------------------------------------------------------------
    // A colliding `memo` binding captures the emitted call.
    withDefaults({
      code: `const memo = 1;
const Component = ({ foo }) => <div>{foo}</div>;`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `import { memo } from 'react';
const Component = ({ foo }) => <div>{foo}</div>;`,
      output: null,
      name: 'Component',
    }),
    // A parameter named `memo` is visible at the component itself.
    withDefaults({
      code: `const Component = (memo) => <div>{memo}</div>;`,
      output: null,
      name: 'Component',
    }),
    // React renders neither a promise nor an iterator, so neither shape is a
    // component the wrapper could rescue.
    withDefaults({
      code: `const Component = async ({ foo }) => <div>{foo}</div>;`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `const Component = function* ({ foo }) { return <div>{foo}</div>; };`,
      output: null,
      name: 'Component',
    }),
    // A reassignable binding can be rebound to an unmemoized value later, so
    // wrapping the initializer would only appear to have fixed it.
    withDefaults({
      code: `let Component = ({ foo }) => <div>{foo}</div>;`,
      output: null,
      name: 'Component',
    }),
    withDefaults({
      code: `var Component = ({ foo }) => <div>{foo}</div>;`,
      output: null,
      name: 'Component',
    }),
    // A shared declaration may carry more than one reported component.
    withDefaults({
      code: `const label = 'x', Component = ({ foo }) => <div>{foo}</div>;`,
      output: null,
      name: 'Component',
    }),
  ],
});
