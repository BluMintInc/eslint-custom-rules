import type { Rule } from 'eslint';
import { Linter } from 'eslint';
import type { TSESLint } from '@typescript-eslint/utils';
import { requireMemo } from '../rules/require-memo';
import type { RequireMemoOptions } from '../rules/require-memo';
import { ruleTesterJsx } from '../utils/ruleTester';

const message = (name: string) =>
  `Component "${name}" renders JSX with props but is not wrapped in memo(). ` +
  'Without memo the component function is recreated on every parent render, breaking referential equality and causing avoidable child re-renders. ' +
  `Wrap the component with memo from util/memo so callers receive a stable reference; rename to "${name}Unmemoized" if it must stay un-memoized.`;

type RequireMemoInvalidCase = Omit<
  TSESLint.InvalidTestCase<'requireMemo', RequireMemoOptions>,
  'errors'
> & { name?: string };

const withDefaults = ({
  name,
  ...testCase
}: RequireMemoInvalidCase): TSESLint.InvalidTestCase<
  'requireMemo',
  RequireMemoOptions
> => ({
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
    // #2186 controls. Resolving a concise body's identifier to its initializer
    // must not turn every named binding into JSX; each of these names a value
    // that is not one, spelled the way the reported case is spelled.
    //
    // A binding whose value is a FUNCTION is not JSX, so the arrow returns a
    // render helper rather than an element.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `const makeRow = () => <div />;
const Row = (props: { x: string }) => makeRow;`,
    },
    // A reassigned binding does not deterministically name its initializer's
    // value, so it is not followed.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `let view = <div />;
view = <span />;
const Row = (props: { x: string }) => view;`,
    },
    // A self-referential initializer terminates the resolution rather than
    // recurring through it.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `const view = view;
const Row = (props: { x: string }) => view;`,
    },
    // A non-JSX initializer stays non-JSX.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `const label = 'hi';
const Row = (props: { x: string }) => label;`,
    },
    // ---------------------------------------------------------------------
    // #2352: a render function handed to forwardRef() is NOT the memoization
    // subject. React's component is the forwardRef RESULT, which is what a
    // caller memoizes; forwardRef itself rejects a memo object and throws at
    // render ("Component is not a function"), so neither remedy the message
    // offers applies at this position. The inline spelling,
    // `forwardRef(function Row() {})`, has always been silent here, so
    // reporting the by-reference one discriminated on syntax rather than on
    // memoization (#1774).
    // ---------------------------------------------------------------------
    // The issue's own file. The forwardRef call is already memoized, so the
    // report was a plain false positive whose fix crashed every consumer.
    {
      filename: 'src/components/edit/file/withInteractFile.tsx',
      code: `import { forwardRef } from 'react';
import { memo } from '../../../util/memo';
function WithInteractFileRefless(props, ref) {
  return <WrappedComponent {...props} ref={ref} />;
}
const memoized: unknown = memo(
  forwardRef(WithInteractFileRefless),
  compareDeeply('file'),
);`,
    },
    // An UNMEMOIZED forwardRef result is a real finding, but the remedy is at
    // the forwardRef call, not at its argument — this rule claims the argument,
    // so it withholds the claim rather than emitting a remedy that crashes.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import { forwardRef } from 'react';
function RowRender(props, ref) { return <li ref={ref}>{props.label}</li>; }
export const Row = forwardRef(RowRender);`,
    },
    // `React.forwardRef` spells the same helper through a member access, as
    // `React.memo` does for the memo carve-out.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import React from 'react';
function RowRender(props, ref) { return <li ref={ref}>{props.label}</li>; }
export const Row = React.memo(React.forwardRef(RowRender));`,
    },
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import React from 'react';
function RowRender(props, ref) { return <li ref={ref}>{props.label}</li>; }
export const Row = React.forwardRef(RowRender);`,
    },
    // The arrow twin: the initializer fix wraps in place, so the binding
    // forwardRef receives is the memo object just the same.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import { forwardRef } from 'react';
import { memo } from '../util/memo';
const RowRender = (props, ref) => <li ref={ref}>{props.label}</li>;
export const Row = memo(forwardRef(RowRender));`,
    },
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import { forwardRef } from 'react';
const RowRender = (props, ref) => <li ref={ref}>{props.label}</li>;
export const Row = forwardRef(RowRender);`,
    },
    // A named function expression is claimed through the binding it is
    // assigned to, which is the identifier forwardRef reads.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import { forwardRef } from 'react';
const RowRender = function Render(props, ref) { return <li ref={ref}>{props.label}</li>; };
export const Row = forwardRef(RowRender);`,
    },
    // The call may precede the declaration it hoists over: the carve-out reads
    // the binding's references, not source order.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import { forwardRef } from 'react';
export default forwardRef(RowRender);
function RowRender(props, ref) { return <li ref={ref}>{props.label}</li>; }`,
    },
    // A type assertion on the argument hands forwardRef the same value.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import { forwardRef } from 'react';
function RowRender(props, ref) { return <li ref={ref}>{props.label}</li>; }
export const Row = forwardRef(RowRender as RenderFn);`,
    },
    // The render function reaches forwardRef from an enclosing function too,
    // where the memo hand-back carve-out does not speak for it.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import { forwardRef } from 'react';
export function withRef(Wrapped) {
  function Inner({value}, ref) { return <Wrapped value={value} ref={ref} />; }
  return forwardRef(Inner);
}`,
    },
    // Controls: the INLINE spellings the rule already exempts, pinned so the
    // by-reference cases above are a symmetry rather than a new exemption.
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import { forwardRef } from 'react';
import { memo } from '../util/memo';
export const Row = memo(forwardRef(function RowRender(props, ref) {
  return <li ref={ref}>{props.label}</li>;
}));`,
    },
    {
      filename: 'src/components/SomeComponent.tsx',
      code: `import { forwardRef } from 'react';
export const Row = forwardRef((props, ref) => <li ref={ref}>{props.label}</li>);`,
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
    // #2186 subject: a concise body naming a JSX-valued binding renders exactly
    // what the block-bodied twin below renders, so the two must be reported
    // alike. The identifier resolution used to reach only the `return` form.
    withDefaults({
      code: `const view = <div />;
const Row = (props: { x: string }) => view;`,
      output: `import { memo } from '../util/memo';
const view = <div />;
const Row = memo((props: { x: string }) => view);`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'Row',
    }),
    // #2186 control: the block-bodied twin, which the rule has always caught.
    withDefaults({
      code: `const view = <div />;
const Row = (props: { x: string }) => { return view; };`,
      output: `import { memo } from '../util/memo';
const view = <div />;
const Row = memo((props: { x: string }) => { return view; });`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'Row',
    }),
    // A chain of single-assignment bindings resolves the same way either
    // spelling reaches it.
    withDefaults({
      code: `const view = <div />;
const alias = view;
const Row = (props: { x: string }) => alias;`,
      output: `import { memo } from '../util/memo';
const view = <div />;
const alias = view;
const Row = memo((props: { x: string }) => alias);`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'Row',
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
function MultiplePropsComponentUnmemoized({ foo, bar }) { return <div>{foo}{bar}</div>; }
const MultiplePropsComponent = memo(MultiplePropsComponentUnmemoized);`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'MultiplePropsComponent',
    }),
    withDefaults({
      code: `function DefaultPropComponent({ foo = 'default' }) { return <div>{foo}</div>; }`,
      output: `import { memo } from '../util/memo';
function DefaultPropComponentUnmemoized({ foo = 'default' }) { return <div>{foo}</div>; }
const DefaultPropComponent = memo(DefaultPropComponentUnmemoized);`,
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
function ShouldBeMemoizedUnmemoized({foo}) {
        return (
          <div>{foo}</div>
        )
      }
export const ShouldBeMemoized = memo(ShouldBeMemoizedUnmemoized);`,
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
function ShouldBeMemoizedUnmemoized({ foo }: { foo: string }): JSX.Element {
            return (
              <div>{foo}</div>
            )
          }
export const ShouldBeMemoized = memo(ShouldBeMemoizedUnmemoized);`,
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
    function ShouldBeMemoizedUnmemoized({foo}) {
            return (
              <div>{foo}</div>
            )
          }
    export const ShouldBeMemoized = memo(ShouldBeMemoizedUnmemoized);`,
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
function ShouldStillBeMemoizedUnmemoized({foo}) {
            return (
              <div>{foo}</div>
            )
          }
export const ShouldStillBeMemoized = memo(ShouldStillBeMemoizedUnmemoized);`,
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
    // The extended import is measured against the print width, so the --fix
    // output is the layout Prettier keeps rather than a line it re-wraps.
    // ---------------------------------------------------------------------
    // The appended `, memo` lands the line exactly at 80 columns: it fits, so
    // the declaration stays flat (an always-expanded import is its own churn).
    withDefaults({
      code: `import { aMemoHelperWithAFortyTwoCharacterLongName1 } from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { aMemoHelperWithAFortyTwoCharacterLongName1, memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // One column more and the appended line would be 81 wide: the import is
    // re-laid one specifier per line, the way Prettier prints the overflow.
    withDefaults({
      code: `import { aMemoHelperWithAFortyThreeCharacterName1234 } from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import {
  aMemoHelperWithAFortyThreeCharacterName1234,
  memo,
} from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // The initializer wrap shares the import plan, so it crosses the width the
    // same way.
    withDefaults({
      code: `import { aMemoHelperWithAFortyThreeCharacterName1234 } from '../util/memo';
export const Component = ({foo}) => <div>{foo}</div>;`,
      output: `import {
  aMemoHelperWithAFortyThreeCharacterName1234,
  memo,
} from '../util/memo';
export const Component = memo(({foo}) => <div>{foo}</div>);`,
      name: 'Component',
    }),
    // An import Prettier already broke takes the specifier on its own line at
    // the existing indent, keeping the trailing comma where Prettier puts it.
    withDefaults({
      code: `import {
  aMemoHelperWithAFortyThreeCharacterName1234,
  anotherMemoHelper,
} from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import {
  aMemoHelperWithAFortyThreeCharacterName1234,
  anotherMemoHelper,
  memo,
} from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // A default import that stops fitting opens its braces the way Prettier
    // prints them, instead of appending `, { memo }` past the width.
    withDefaults({
      code: `import aVeryLongDefaultMemoFactoryExportBindingName1234 from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import aVeryLongDefaultMemoFactoryExportBindingName1234, {
  memo,
} from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // A comment in a separator gap the re-layout would own withholds it: the
    // helper gets its own declaration and the existing bytes are left alone.
    withDefaults({
      code: `import { aMemoHelperWithAFortyThreeCharacterName1234 /* pinned */ } from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import { aMemoHelperWithAFortyThreeCharacterName1234 /* pinned */ } from '../util/memo';
import { memo } from '../util/memo';
const Component = memo(function ComponentUnmemoized({foo}) { return <div>{foo}</div>; });`,
      name: 'Component',
    }),
    // A default import paired with a namespace has no grammatical slot for
    // `{ memo }` — `import d, { memo }, * as ns` is a syntax error — so the
    // helper gets its own declaration.
    withDefaults({
      code: `import memoDefault, * as memoUtils from '../util/memo';
function Component({foo}) { return <div>{foo}</div>; }`,
      output: `import memoDefault, * as memoUtils from '../util/memo';
import { memo } from '../util/memo';
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
    // Jest hoists a `jest.mock` factory above the imports, so a memo reference
    // inside one is unbound when the factory runs. The report stands — `memo as
    // mockMemo` and an in-factory `jest.requireActual` are both legal — but the
    // rewrite is withheld.
    withDefaults({
      code: `jest.mock('./Widget', () => {
  const Widget = ({ label }) => <div>{label}</div>;
  return { __esModule: true, Widget };
});`,
      output: null,
      filename: 'src/components/Widget.test.tsx',
      name: 'Widget',
    }),
    withDefaults({
      code: `jest.mock('./Widget', () => {
  function Widget({ label }) { return <div>{label}</div>; }
  return { __esModule: true, Widget };
});`,
      output: null,
      filename: 'src/components/Widget.test.tsx',
      name: 'Widget',
    }),
    // `doMock`/`setMock` run their factory in place, so the helper is bound and
    // the edit stands. These pin the carve-out to the one registrar jest
    // hoists rather than to the shape `jest.<method>(path, factory)`.
    withDefaults({
      code: `jest.doMock('./Widget', () => {
  const Widget = ({ label }) => <div>{label}</div>;
  return { Widget };
});`,
      output: `import { memo } from '../util/memo';
jest.doMock('./Widget', () => {
  const Widget = memo(({ label }) => <div>{label}</div>);
  return { Widget };
});`,
      filename: 'src/components/Widget.test.tsx',
      name: 'Widget',
    }),
    withDefaults({
      code: `jest.setMock('./Widget', () => {
  const Widget = ({ label }) => <div>{label}</div>;
  return { Widget };
});`,
      output: `import { memo } from '../util/memo';
jest.setMock('./Widget', () => {
  const Widget = memo(({ label }) => <div>{label}</div>);
  return { Widget };
});`,
      filename: 'src/components/Widget.test.tsx',
      name: 'Widget',
    }),
    // An already-imported helper is rejected by jest just the same, so the
    // decline cannot be keyed on whether this rule injects the import.
    withDefaults({
      code: `import { memo } from '../util/memo';
jest.mock('./Widget', () => {
  const Widget = ({ label }) => <div>{label}</div>;
  return { Widget };
});`,
      output: null,
      filename: 'src/components/Widget.test.tsx',
      name: 'Widget',
    }),
    // Controls: the carve-out is the factory subtree, not the file and not any
    // call's second argument, so a component beside a mock registrar and one
    // inside a non-jest callback both keep their edit.
    withDefaults({
      code: `jest.mock('./dep');
const Component = ({ foo }) => <div>{foo}</div>;`,
      output: `import { memo } from '../util/memo';
jest.mock('./dep');
const Component = memo(({ foo }) => <div>{foo}</div>);`,
      filename: 'src/components/SomeComponent.test.tsx',
      name: 'Component',
    }),
    withDefaults({
      code: `describe('suite', () => {
  const Component = ({ foo }) => <div>{foo}</div>;
});`,
      output: `import { memo } from '../util/memo';
describe('suite', () => {
  const Component = memo(({ foo }) => <div>{foo}</div>);
});`,
      filename: 'src/components/SomeComponent.test.tsx',
      name: 'Component',
    }),

    // --- #2054: the in-place wrapper spells the component's name twice on one
    // line, so the header it authors is 42 + 2*len(name) columns before any
    // parameter text. Past the print width the declaration stays put and the
    // memo binding is appended instead, which is one identifier per line. ---

    // The issue's repro. Its parameters are ALREADY broken one per line, so the
    // pre-image header is 46 columns — nothing about it is near 80. The 96-column
    // header is authored entirely by the fix, which is what makes this a shape
    // defect rather than a fixed-size insertion tipping a near-80 line.
    withDefaults({
      code: `export function TournamentRegistrationPanel({
  tournamentId,
  userId,
  onRegistered,
  variant,
}) {
  return <div>{tournamentId}</div>;
}`,
      output: `import { memo } from '../util/memo';
function TournamentRegistrationPanelUnmemoized({
  tournamentId,
  userId,
  onRegistered,
  variant,
}) {
  return <div>{tournamentId}</div>;
}
export const TournamentRegistrationPanel = memo(
  TournamentRegistrationPanelUnmemoized,
);`,
      filename: 'src/components/T.tsx',
      name: 'TournamentRegistrationPanel',
    }),

    // The other side of the threshold: a short name's in-place header fits, so
    // the wrapper goes in place and the declaration is NOT split. Without this
    // control an unconditional split would pass the case above while landing
    // the mirror-image defect on every short component.
    withDefaults({
      code: `export function Panel({ foo }) {
  return <div>{foo}</div>;
}`,
      output: `import { memo } from '../util/memo';
export const Panel = memo(function PanelUnmemoized({ foo }) {
  return <div>{foo}</div>;
});`,
      filename: 'src/components/T.tsx',
      name: 'Panel',
    }),

    // Only the in-place header is measured. Here the split header overflows too
    // — the parameters are on one line — and the split shape is still correct:
    // a formatter breaks that parameter list alone, leaving the body where the
    // author put it, while the in-place shape forces `memo(` open and re-indents
    // the whole body.
    withDefaults({
      code: `export function TournamentRegistrationPanelForBracket({ tournamentId, userId, onRegistered }) {
  return <div>{tournamentId}</div>;
}`,
      output: `import { memo } from '../util/memo';
function TournamentRegistrationPanelForBracketUnmemoized({ tournamentId, userId, onRegistered }) {
  return <div>{tournamentId}</div>;
}
export const TournamentRegistrationPanelForBracket = memo(
  TournamentRegistrationPanelForBracketUnmemoized,
);`,
      filename: 'src/components/T.tsx',
      name: 'TournamentRegistrationPanelForBracket',
    }),

    // A comment in the parameter list occupies columns like any other text, so
    // it counts toward the measured header. This pair straddles the threshold on
    // the comment alone: without it the in-place header is 67 columns and stays
    // in place, and the same declaration is split once the comment carries it to
    // 87. Discounting comment columns would emit the 87-column in-place header
    // that #2054 exists to prevent, so the shape legitimately depends on a
    // comment — the carve-out recorded for this rule in
    // `src/tests/commentFidelityBaseline.ts`, which the comment-fidelity guards
    // require a fixture here to keep anchored. The comment survives either way.
    withDefaults({
      code: `function ProfileCardPanel({
  title,
}: Props) {
  return <div>{title}</div>;
}`,
      output: `import { memo } from '../util/memo';
const ProfileCardPanel = memo(function ProfileCardPanelUnmemoized({
  title,
}: Props) {
  return <div>{title}</div>;
});`,
      name: 'ProfileCardPanel',
    }),
    withDefaults({
      code: `function ProfileCardPanel({ /* keep me */
  title,
}: Props) {
  return <div>{title}</div>;
}`,
      output: `import { memo } from '../util/memo';
function ProfileCardPanelUnmemoized({ /* keep me */
  title,
}: Props) {
  return <div>{title}</div>;
}
const ProfileCardPanel = memo(ProfileCardPanelUnmemoized);`,
      name: 'ProfileCardPanel',
    }),

    // `printWidth` drives the decision rather than a hard-coded 80: the same
    // short component the default keeps in place is split at a narrower width,
    // and the appended binding breaks its sole argument out because the one-line
    // spelling (42 columns) no longer fits either.
    withDefaults({
      code: `export function Panel({ foo }) {
  return <div>{foo}</div>;
}`,
      options: [{ printWidth: 40 }],
      output: `import { memo } from '../util/memo';
function PanelUnmemoized({ foo }) {
  return <div>{foo}</div>;
}
export const Panel = memo(
  PanelUnmemoized,
);`,
      filename: 'src/components/T.tsx',
      name: 'Panel',
    }),

    // The width is a measurement in both directions: widening it past the
    // 96-column header keeps the issue's own repro in place.
    withDefaults({
      code: `export function TournamentRegistrationPanel({
  tournamentId,
  userId,
}) {
  return <div>{tournamentId}</div>;
}`,
      options: [{ printWidth: 200 }],
      output: `import { memo } from '../util/memo';
export const TournamentRegistrationPanel = memo(function TournamentRegistrationPanelUnmemoized({
  tournamentId,
  userId,
}) {
  return <div>{tournamentId}</div>;
});`,
      filename: 'src/components/T.tsx',
      name: 'TournamentRegistrationPanel',
    }),

    /**
     * The import specifier is anchored on the source root NEAREST the file.
     * `context.getFilename()` is absolute under every real ESLint entry point,
     * so a checkout living under a directory named `src` puts a second `src`
     * segment in the path; anchoring on the outer one emits a specifier that
     * resolves outside the project (#2207).
     */
    withDefaults({
      code: `const Foo = ({ a }: { a: string }) => {
  return <div>{a}</div>;
};
export default Foo;`,
      filename: '/home/dev/src/proj/src/components/Foo.tsx',
      output: `import { memo } from '../util/memo';
const Foo = memo(({ a }: { a: string }) => {
  return <div>{a}</div>;
});
export default Foo;`,
      name: 'Foo',
    }),

    // A deeper file under the same doubled-`src` checkout: depth counts from
    // the inner source root, not from the outer segment.
    withDefaults({
      code: `const Panel = ({ a }: { a: string }) => {
  return <div>{a}</div>;
};
export default Panel;`,
      filename: '/srv/src/app/src/features/panel/Panel.tsx',
      output: `import { memo } from '../../util/memo';
const Panel = memo(({ a }: { a: string }) => {
  return <div>{a}</div>;
});
export default Panel;`,
      name: 'Panel',
    }),

    // Control: the ordinary absolute path, with a single `src`. Anchoring is
    // unchanged here, which is what makes the two cases above a real
    // discrimination rather than a blanket shift in depth.
    withDefaults({
      code: `const Widget = ({ a }: { a: string }) => {
  return <div>{a}</div>;
};
export default Widget;`,
      filename: '/home/dev/proj/src/components/Widget.tsx',
      output: `import { memo } from '../util/memo';
const Widget = memo(({ a }: { a: string }) => {
  return <div>{a}</div>;
});
export default Widget;`,
      name: 'Widget',
    }),

    // A file directly in the source root still takes the depth-0 spelling.
    withDefaults({
      code: `const App = ({ a }: { a: string }) => {
  return <div>{a}</div>;
};
export default App;`,
      filename: '/home/dev/src/proj/src/App.tsx',
      output: `import { memo } from './util/memo';
const App = memo(({ a }: { a: string }) => {
  return <div>{a}</div>;
});
export default App;`,
      name: 'App',
    }),

    // ---------------------------------------------------------------------
    // #2352 discrimination. The forwardRef carve-out is keyed to the binding
    // the call reads, so everything beside it keeps the report and the fix it
    // had; without these the carve-out could widen to the whole file, or to
    // every component named like a render function, and no fixture would say.
    // ---------------------------------------------------------------------
    // A plain component sharing the file with a forwardRef render function is
    // still claimed, and still rewritten.
    withDefaults({
      code: `import { forwardRef } from 'react';
import { memo } from '../util/memo';
function RowRender(props, ref) { return <li ref={ref}>{props.label}</li>; }
export const Row = memo(forwardRef(RowRender));
function Cell({value}) { return <td>{value}</td>; }`,
      output: `import { forwardRef } from 'react';
import { memo } from '../util/memo';
function RowRender(props, ref) { return <li ref={ref}>{props.label}</li>; }
export const Row = memo(forwardRef(RowRender));
const Cell = memo(function CellUnmemoized({value}) { return <td>{value}</td>; });`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'Cell',
    }),
    // The arrow twin of the case above, where the fix wraps in place.
    withDefaults({
      code: `import { forwardRef } from 'react';
import { memo } from '../util/memo';
function RowRender(props, ref) { return <li ref={ref}>{props.label}</li>; }
export const RowRef = forwardRef(RowRender);
const Cell = ({value}) => <td>{value}</td>;`,
      output: `import { forwardRef } from 'react';
import { memo } from '../util/memo';
function RowRender(props, ref) { return <li ref={ref}>{props.label}</li>; }
export const RowRef = forwardRef(RowRender);
const Cell = memo(({value}) => <td>{value}</td>);`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'Cell',
    }),
    // Being handed to SOME call is not the carve-out: only forwardRef refuses
    // a memo object, and `withTheme(Row)` reads the memoized binding happily.
    withDefaults({
      code: `function Row(props) { return <li>{props.label}</li>; }
export const Wrapped = withTheme(Row);`,
      output: `import { memo } from '../util/memo';
const Row = memo(function RowUnmemoized(props) { return <li>{props.label}</li>; });
export const Wrapped = withTheme(Row);`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'Row',
    }),
    // The carve-out reads the BINDING's references, so a same-named component
    // in another scope is neither cleared by this one's forwardRef call nor
    // claimed by it: the nested `Row` is exempt, the module-level `Row` is not.
    withDefaults({
      code: `import { forwardRef } from 'react';
export function makeRow() {
  const Row = (props, ref) => <li ref={ref}>{props.label}</li>;
  return forwardRef(Row);
}
function Row({label}) { return <li>{label}</li>; }`,
      output: `import { forwardRef } from 'react';
import { memo } from '../util/memo';
export function makeRow() {
  const Row = (props, ref) => <li ref={ref}>{props.label}</li>;
  return forwardRef(Row);
}
const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });`,
      filename: 'src/components/SomeComponent.tsx',
      name: 'Row',
    }),
  ],
});

/**
 * Issue #2352, asked of the fixer's whole-file output rather than of a
 * `RuleTester` `output` string. The defect was not wrong fix TEXT: the rewrite
 * parsed, type-checked and re-linted clean while handing `forwardRef` a memo
 * object, which React throws on at render ("Component is not a function"). The
 * broken output also spelled the two calls in DIFFERENT statements — `const X =
 * memo(XUnmemoized)` beside an untouched `forwardRef(X)` — so a text pattern
 * over the output would not have seen it either. The oracle below resolves the
 * argument instead, and is planted with the issue's own broken output so it
 * cannot pass by never firing.
 */
const RULE_ID = 'test/require-memo';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');
const PARSER_OPTIONS = {
  ecmaVersion: 2020 as const,
  sourceType: 'module' as const,
  ecmaFeatures: { jsx: true },
  // Without `range`/`loc` the standalone parser throws on valid input too,
  // which would make every assertion below vacuous.
  range: true,
  loc: true,
};

const fixWholeFile = (code: string, filename: string) => {
  const linter = new Linter();
  linter.defineParser('@typescript-eslint/parser', tsParser);
  linter.defineRule(RULE_ID, requireMemo as unknown as Rule.RuleModule);
  return linter.verifyAndFix(
    code,
    {
      parser: '@typescript-eslint/parser',
      parserOptions: PARSER_OPTIONS,
      rules: { [RULE_ID]: 'error' },
    },
    filename,
  );
};

/* eslint-disable-next-line @typescript-eslint/no-explicit-any --
 * The oracle walks a parse tree of the FIXED output, which is untyped text:
 * narrowing each visited node would restate the parser's own union without
 * changing which nodes the walk reaches. */
type SyntaxNode = Record<string, any>;

const walk = (node: SyntaxNode, visit: (node: SyntaxNode) => void) => {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item as SyntaxNode, visit));
    } else if (value && typeof value === 'object') {
      walk(value as SyntaxNode, visit);
    }
  }
};

const isCallTo = (node: SyntaxNode, name: string) =>
  !!node &&
  node.type === 'CallExpression' &&
  ((node.callee.type === 'Identifier' && node.callee.name === name) ||
    (node.callee.type === 'MemberExpression' &&
      node.callee.property?.name === name));

/** Bindings whose value is a memo object — what React refuses to forward a ref through. */
const memoBoundNames = (ast: SyntaxNode) => {
  const names = new Set<string>();
  walk(ast, (node) => {
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      isCallTo(node.init, 'memo')
    ) {
      names.add(node.id.name);
    }
  });
  return names;
};

/**
 * Whether any `forwardRef(...)` call in `code` receives a memo object, spelled
 * inline or reached through a binding declared elsewhere in the file.
 */
const forwardsRefOverMemo = (code: string) => {
  const ast = tsParser.parse(code, PARSER_OPTIONS) as SyntaxNode;
  const memoized = memoBoundNames(ast);
  let found = false;
  walk(ast, (node) => {
    if (!isCallTo(node, 'forwardRef')) {
      return;
    }
    for (const argument of node.arguments as SyntaxNode[]) {
      if (
        isCallTo(argument, 'memo') ||
        (argument.type === 'Identifier' && memoized.has(argument.name))
      ) {
        found = true;
      }
    }
  });
  return found;
};

const REPRO_FILENAME = 'src/components/edit/file/withInteractFile.tsx';

/** The issue's file, reduced to the declarations the rule reads. */
const REPRO = `import { forwardRef } from 'react';
import { memo } from '../../../util/memo';

function WithInteractFileRefless(props, ref) {
  return <WrappedComponent {...props} ref={mergedRef} />;
}

const memoized: unknown = memo(
  forwardRef(WithInteractFileRefless),
  compareDeeply('file'),
);
`;

/** What `--fix` produced for {@link REPRO}, quoted from the issue. */
const REPRO_BROKEN_FIX = `import { forwardRef } from 'react';
import { memo } from '../../../util/memo';

function WithInteractFileReflessUnmemoized(props, ref) {
  return <WrappedComponent {...props} ref={mergedRef} />;
}
const WithInteractFileRefless = memo(WithInteractFileReflessUnmemoized);

const memoized: unknown = memo(
  forwardRef(WithInteractFileRefless),
  compareDeeply('file'),
);
`;

describe('require-memo --fix never forwards a ref through memo (#2352)', () => {
  it('flags the broken output the issue reported (oracle control)', () => {
    expect(forwardsRefOverMemo(REPRO_BROKEN_FIX)).toBe(true);
    expect(forwardsRefOverMemo(`const R = forwardRef(memo(Render));`)).toBe(
      true,
    );
    expect(forwardsRefOverMemo(REPRO)).toBe(false);
  });

  it('leaves the issue repro untouched', () => {
    const { output, fixed, messages } = fixWholeFile(REPRO, REPRO_FILENAME);
    expect(messages).toEqual([]);
    expect(fixed).toBe(false);
    expect(output).toBe(REPRO);
    expect(forwardsRefOverMemo(output)).toBe(false);
  });

  it.each([
    [
      'bare forwardRef, result not memoized',
      `import { forwardRef } from 'react';
function RowRender(props, ref) { return <li ref={ref}>{props.label}</li>; }
export const Row = forwardRef(RowRender);
`,
    ],
    [
      'React.forwardRef, result memoized',
      `import React from 'react';
function RowRender(props, ref) { return <li ref={ref}>{props.label}</li>; }
export const Row = React.memo(React.forwardRef(RowRender));
`,
    ],
    [
      'arrow render function by reference',
      `import { forwardRef } from 'react';
import { memo } from '../util/memo';
const RowRender = (props, ref) => <li ref={ref}>{props.label}</li>;
export const Row = memo(forwardRef(RowRender));
`,
    ],
    [
      'render function passed inline',
      `import { forwardRef } from 'react';
export const Row = forwardRef(function RowRender(props, ref) {
  return <li ref={ref}>{props.label}</li>;
});
`,
    ],
  ])('%s', (_name, code) => {
    const { output } = fixWholeFile(code, 'src/components/Row.tsx');
    expect(forwardsRefOverMemo(output)).toBe(false);
    expect(output).toBe(code);
  });

  it('still rewrites a component that no forwardRef call reads', () => {
    const { output, fixed } = fixWholeFile(
      `function Row({label}) { return <li>{label}</li>; }
`,
      'src/components/Row.tsx',
    );
    expect(fixed).toBe(true);
    expect(output).toBe(
      `import { memo } from '../util/memo';
const Row = memo(function RowUnmemoized({label}) { return <li>{label}</li>; });
`,
    );
  });
});
