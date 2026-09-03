import { ruleTesterJsx } from '../utils/ruleTester';
import { memoNestedReactComponents } from '../rules/memo-nested-react-components';

ruleTesterJsx.run('memo-nested-react-components', memoNestedReactComponents, {
  valid: [
    // A jest.mock() factory runs once per module registration, not per render,
    // so a component defined inside one has module-scope-stable identity. The
    // ES-module interop shape puts it one property deep in the returned object.
    {
      code: `
        jest.mock('next/head', () => {
          const MockHeadUnmemoized = ({ children }) => {
            return <>{children}</>;
          };
          MockHeadUnmemoized.displayName = 'MockHeadUnmemoized';
          return { __esModule: true, default: MockHeadUnmemoized };
        });
      `,
    },
    // The interop marker is incidental; a bare `{ default: Component }` is the
    // same shape.
    {
      code: `
        jest.mock('../Widget', () => {
          const MockWidget = () => <div />;
          return { default: MockWidget };
        });
      `,
    },
    {
      code: `
        jest.mock('../Widget', () => {
          const MockWidget = () => <div />;
          return { __esModule: true, Widget: MockWidget };
        });
      `,
    },
    // Named exports sit one level deeper in some mock shapes.
    {
      code: `
        jest.mock('../Widget', () => {
          const MockWidget = () => <div />;
          return { __esModule: true, components: { Widget: MockWidget } };
        });
      `,
    },
    {
      code: `
        jest.mock('../Widget', () => {
          const MockWidget = memo(() => <div />);
          return { __esModule: true, default: MockWidget };
        });
      `,
    },
    // The registry shape: the component is reachable only through a call, so
    // the exemption has to key on the jest.mock() call, not the return value.
    {
      code: `
        jest.mock('../renderers', () => {
          const StubRenderer = ({ data }) => <div>{data}</div>;
          return {
            RENDERERS: Object.fromEntries(ids.map((id) => [id, StubRenderer])),
          };
        });
      `,
    },
    {
      code: `
        jest.doMock('../renderers', () => {
          const StubRenderer = () => <div />;
          return { RENDERERS: [StubRenderer] };
        });
      `,
    },
    // A factory returning JSX outright is still a mock factory, not a render
    // body — it runs at registration time either way.
    {
      code: `
        jest.mock('../Widget', function () {
          const MockWidget = () => <div />;
          return { default: MockWidget };
        });
      `,
    },
    // A describe body runs once at collection time and an it/hook body once per
    // test; neither re-renders, so a stub defined there is identity-stable.
    {
      code: `
        describe('EditableWrapper', () => {
          const MockViewComponent = ({ value }) => <span>{value}</span>;

          it('renders', () => {
            render(<MockViewComponent value="x" />);
          });
        });
      `,
    },
    {
      code: `
        it('forwards the override', () => {
          const MockAvatar = () => <span>mock-avatar</span>;
          render(<Competitor AvatarComponent={MockAvatar} />);
        });
      `,
    },
    {
      code: `
        beforeEach(() => {
          const StubProbe = () => <div />;
          register(StubProbe);
        });
      `,
    },
    {
      code: `
        it.each([1, 2])('case %s', (value) => {
          const StubProbe = () => <div>{value}</div>;
          render(<StubProbe />);
        });
      `,
    },
    {
      code: `
        describe.only('suite', () => {
          const StubProbe = () => <div />;
          render(<StubProbe />);
        });
      `,
    },
    {
      code: `
        test('uses a local stub', () => {
          function StubProbe() {
            return <div />;
          }
          render(<StubProbe />);
        });
      `,
    },
    // A helper declared in a test body builds a tree once per test rather than
    // per render, so a stub inside it is scaffolding too. It qualifies only
    // because it does not itself return JSX.
    {
      code: `
        describe('provider', () => {
          const renderUpdater = (values) => {
            const provider = new CentralizedProvider();
            const { Provider } = provider;

            const Consumer = () => {
              const { updateObj } = provider.useEntireObject();
              return <button onClick={() => updateObj(values)} />;
            };

            return render(<Provider><Consumer /></Provider>);
          };

          it('updates', () => {
            renderUpdater({ name: 'beta' });
          });
        });
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const handleClick = useCallback((event) => {
          event.preventDefault();
          return event.clientX;
        }, []);
      `,
    },
    {
      code: `
        import { useDeepCompareCallback } from '@blumintinc/use-deep-compare';

        const computeValue = useDeepCompareCallback((input) => input.value * 2, []);
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const buildConfig = useCallback(() => {
          return {
            title: 'example',
            footer: <div>not treated as component</div>,
          };
        }, []);
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const noop = useCallback(() => {}, []);
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const getList = useCallback(() => [1, 2, 3], []);
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const ignoreTests = useCallback(() => {
          return <div>Should be ignored via pattern</div>;
        }, []);
      `,
      filename: 'Component.test.tsx',
      options: [{ ignorePatterns: ['**/*.test.tsx'] }],
    },
    {
      code: `
        import { useCallback } from 'react';
        import * as Factory from 'ui-factory';

        const NonReactFactory = useCallback(() => {
          return Factory.createElement('div', null, 'text');
        }, []);
      `,
    },
    {
      code: `
        import { useMemo } from 'react';
        const element = useMemo(() => <div>just an element</div>, []);
      `,
    },
    {
      code: `
        const MyComponent = () => {
          return <List render={(item) => <div>{item}</div>} />;
        };
      `,
    },
    {
      code: `
        const MyComponent = () => {
          const handleClick = () => console.log('hi');
          return <button onClick={handleClick} />;
        };
      `,
    },
    {
      code: `
        const MyComponent = () => {
          const renderHeader = () => <div>Header</div>;
          return <div>{renderHeader()}</div>;
        };
      `,
    },
    {
      code: `
        const MyPage = () => {
          return <Layout Header={<header />} />; // JSX element, not a function
        };
      `,
    },
    {
      code: `
        const Comp = useCallback(...args);
      `,
    },
    {
      code: `
        const MyPage = () => {
          const MyElement = <div />;
          return <div>{MyElement}</div>;
        };
      `,
    },
    {
      code: `
        const MyPage = () => {
          return <Layout Header={/* comment */} />;
        };
      `,
    },
    {
      // FP #1: HOC factory returning memo(Inner) is not a render body; the
      // inner component has a stable identity (factory runs once per call).
      code: `
        import { memo } from 'react';

        export function withPendingSupport(WrappedComponent) {
          const ComponentWithPendingSupportUnmemoized = (props) => {
            if (isPending(props)) {
              return <Pending {...props} />;
            }
            return <WrappedComponent {...props} />;
          };
          return memo(ComponentWithPendingSupportUnmemoized);
        }
      `,
    },
    {
      // FP #1 variant: HOC factory returning the component identifier directly.
      code: `
        export function withLogging(WrappedComponent) {
          const LoggedComponentUnmemoized = (props) => {
            return <WrappedComponent {...props} />;
          };
          return LoggedComponentUnmemoized;
        }
      `,
    },
    {
      // FP #2: forwardRef wrapper inside an HOC factory returning
      // memo(forwardRef(...)); the refless component must not be flagged.
      code: `
        import { memo, forwardRef } from 'react';

        export function withDatePickerEdit(WrappedPicker, options) {
          function DatePickerEditReflessUnmemoized(props, forwardedRef) {
            return <WrappedPicker {...props} ref={forwardedRef} options={options} />;
          }
          const DatePickerEditUnmemoized = forwardRef(DatePickerEditReflessUnmemoized);
          return memo(DatePickerEditUnmemoized);
        }
      `,
    },
    {
      // FP #2 variant: HOC factory returning forwardRef(...) directly.
      code: `
        import { forwardRef } from 'react';

        export function withRef(WrappedComponent) {
          const InnerUnmemoized = (props, ref) => {
            return <WrappedComponent {...props} ref={ref} />;
          };
          return forwardRef(InnerUnmemoized);
        }
      `,
    },
    {
      // FP #3: render callback assigned to a non-PascalCase name (render={...}).
      code: `
        import { useCallback } from 'react';

        const renderHit = useCallback((hit) => <AccordionCompetitor {...hit} />, []);
      `,
    },
    {
      // FP #3 variant: lowercase render callback via useMemo returning a function.
      code: `
        import { useMemo } from 'react';

        const renderRow = useMemo(() => (row) => <Row {...row} />, []);
      `,
    },
    {
      // FP #3 variant: lowercase render callback inside a render body.
      code: `
        import { useCallback } from 'react';

        const MyList = () => {
          const renderHit = useCallback((hit) => <Hit {...hit} />, []);
          return <Hits render={renderHit} />;
        };
      `,
    },
    {
      name: 'HOC factory returning custom-memo(Inner) — memo re-exported from a project module',
      code: `
        import { memo } from 'src/util/memo';
        export const buildCadenceCustomView = (featureId) => {
          const CadenceCustomViewUnmemoized = ({ value }) => {
            return <Typography>{value}</Typography>;
          };
          return memo(CadenceCustomViewUnmemoized);
        };
      `,
    },
    {
      name: 'HOC factory returning custom-forwardRef(Inner) — forwardRef re-exported from a project module',
      code: `
        import { forwardRef } from 'src/util/forwardRef';
        export const buildRefView = () => {
          const InnerUnmemoized = (props, ref) => <div ref={ref} />;
          return forwardRef(InnerUnmemoized);
        };
      `,
    },
    {
      name: 'HOC factory returning namespaced .memo(Inner) member call from a project module',
      code: `
        import * as CustomReact from 'src/util/react';
        export const buildView = () => {
          const InnerUnmemoized = ({ value }) => <span>{value}</span>;
          return CustomReact.memo(InnerUnmemoized);
        };
      `,
    },
    {
      name: 'HOC factory returning React.memo(Inner) member call from react namespace',
      code: `
        import * as React from 'react';
        export const buildReactView = () => {
          const InnerUnmemoized = ({ value }) => <span>{value}</span>;
          return React.memo(InnerUnmemoized);
        };
      `,
    },
    {
      name: 'HOC factory returning custom memo(forwardRef(Inner)) — both re-exported from a project module',
      code: `
        import { memo, forwardRef } from 'src/util/memo';
        export const buildDatePicker = (options) => {
          const InnerReflessUnmemoized = (props, ref) => (
            <div ref={ref} options={options} />
          );
          const InnerUnmemoized = forwardRef(InnerReflessUnmemoized);
          return memo(InnerUnmemoized);
        };
      `,
    },
    {
      // #1336: useDeepCompareMemo returning memo(namedFn), memo re-exported from
      // a project module. The memo hook stabilizes the component identity across
      // re-renders, so it never remounts—the harm this rule prevents.
      name: 'component defined inside useDeepCompareMemo callback (memo-wrapped) is identity-stabilized',
      code: `
        import { memo } from 'src/util/memo';
        import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
        const Outer = ({ value }) => {
          const WrappedViewComponent = useDeepCompareMemo(() => {
            return memo(function WrappedViewComponentUnmemoized(props) {
              return <div>{props.value}</div>;
            });
          }, [value]);
          return <WrappedViewComponent value={value} />;
        };
      `,
    },
    {
      // #1336: useMemo returning React's memo(inlineFn) via an arrow expression
      // body. Identity is stabilized by useMemo regardless of the enclosing
      // scope re-rendering.
      name: 'component defined inside useMemo callback (memo-wrapped) is identity-stabilized',
      code: `
        import { memo, useMemo } from 'react';
        const Outer = ({ value }) => {
          const Wrapped = useMemo(() => memo((props) => <div {...props} />), [value]);
          return <Wrapped value={value} />;
        };
      `,
    },
    {
      // #1336: React.memo member-call form returned from a useMemo callback.
      name: 'useMemo returning React.memo(inline) member call is identity-stabilized',
      code: `
        import * as React from 'react';
        const Outer = () => {
          const Wrapped = React.useMemo(() => React.memo((props) => <div {...props} />), []);
          return <Wrapped />;
        };
      `,
    },
    {
      // #1336: forwardRef-wrapped return is also identity-stabilized.
      name: 'useMemo returning forwardRef(inline) is identity-stabilized',
      code: `
        import { forwardRef, useMemo } from 'react';
        const Outer = () => {
          const RefView = useMemo(() => forwardRef((props, ref) => <div ref={ref} />), []);
          return <RefView />;
        };
      `,
    },
    {
      // #1336: memo(forwardRef(inline)) return is identity-stabilized.
      name: 'useMemo returning memo(forwardRef(inline)) is identity-stabilized',
      code: `
        import { memo, forwardRef, useMemo } from 'react';
        const Outer = () => {
          const RefView = useMemo(() => memo(forwardRef((props, ref) => <div ref={ref} />)), []);
          return <RefView />;
        };
      `,
    },
    {
      // #1336: block-body callback whose every return is memo-wrapped.
      name: 'useDeepCompareMemo block body returning memo(inline) is identity-stabilized',
      code: `
        import { memo } from 'src/util/memo';
        import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
        const Outer = ({ value }) => {
          const View = useDeepCompareMemo(() => {
            return memo((props) => <span>{props.value}</span>);
          }, [value]);
          return <View value={value} />;
        };
      `,
    },
    {
      // #1567: a `render`-prefixed prop is a render callback, not a
      // component-type prop, even when its name happens to end in one of the
      // component-prop suffixes.
      name: 'renderHeader/renderFooter render-prop callbacks are not component props',
      code: `
        const Scoreboard = ({ rows, columns }) => {
          return (
            <DataGrid
              rows={rows}
              columns={columns}
              renderHeader={() => <Box>Score</Box>}
              renderFooter={() => <Box>Total</Box>}
            />
          );
        };
      `,
    },
    {
      // #1567: the plain render-prop forms the docs call out explicitly.
      name: 'render/renderItem inline callbacks are not component props',
      code: `
        const List = ({ items }) => {
          return (
            <Virtuoso
              render={() => <Row />}
              renderItem={(item) => <Row {...item} />}
            />
          );
        };
      `,
    },
    {
      // #1567: each component-prop suffix, reached through a render- prefix.
      name: 'renderTemplate/renderWrapper/renderSectionHeader are render callbacks',
      code: `
        const Page = () => {
          return (
            <Layout
              renderTemplate={() => <Template />}
              renderWrapper={(props) => <div {...props} />}
              renderSectionHeader={() => <h2 />}
              renderComponent={() => <span />}
            />
          );
        };
      `,
    },
    {
      // #1567: the inline half of the consistency pair below. The named-binding
      // form was already silent (non-PascalCase binding carve-out), so the
      // inline form must be silent too.
      name: 'inline renderHeader agrees with the named-binding form',
      code: `
        const Page = () => {
          return <Foo renderHeader={() => <div />} />;
        };
      `,
    },
    {
      // #1567: the named-binding half of the same pair.
      name: 'named renderHeader binding passed to renderHeader prop stays silent',
      code: `
        const Page = () => {
          const renderHeader = () => <div />;
          return <Foo renderHeader={renderHeader} />;
        };
      `,
    },
    {
      name: 'HOC factory (function declaration) handing back memo(Row)',
      code: `
        import { memo } from 'src/util/memo';
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return memo(Row);
        }
      `,
    },
    {
      name: 'HOC factory (function declaration) handing back memo?.(Row)',
      code: `
        import { memo } from 'src/util/memo';
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return memo?.(Row);
        }
      `,
    },
    {
      name: 'HOC factory (function declaration) handing back React.memo(Row)',
      code: `
        import * as React from 'react';
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return React.memo(Row);
        }
      `,
    },
    {
      name: 'HOC factory (function declaration) handing back React?.memo(Row)',
      code: `
        import * as React from 'react';
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return React?.memo(Row);
        }
      `,
    },
    {
      // The optional call is a spelling of the same hand-back, so the arrow
      // factory must read it the same way the declaration one does.
      name: 'HOC factory (arrow) handing back memo?.(Inner)',
      code: `
        import { memo } from 'src/util/memo';
        export const buildView = () => {
          const InnerUnmemoized = ({ value }) => <span>{value}</span>;
          return memo?.(InnerUnmemoized);
        };
      `,
    },
    {
      name: 'HOC factory (arrow) handing back CustomReact?.memo(Inner)',
      code: `
        import * as CustomReact from 'src/util/react';
        export const buildView = () => {
          const InnerUnmemoized = ({ value }) => <span>{value}</span>;
          return CustomReact?.memo(InnerUnmemoized);
        };
      `,
    },
    {
      // A parenthesized optional chain puts the ChainExpression in callee
      // position rather than around the whole call.
      name: 'HOC factory handing back (React?.memo)(Inner)',
      code: `
        import * as React from 'react';
        export const buildView = () => {
          const InnerUnmemoized = ({ value }) => <span>{value}</span>;
          return (React?.memo)(InnerUnmemoized);
        };
      `,
    },
    {
      name: 'HOC factory handing back forwardRef?.(Inner)',
      code: `
        import { forwardRef } from 'react';
        export const buildRefView = () => {
          const InnerUnmemoized = (props, ref) => <div ref={ref} />;
          return forwardRef?.(InnerUnmemoized);
        };
      `,
    },
    {
      name: 'HOC factory handing back memo(forwardRef(Inner))',
      code: `
        import { memo, forwardRef } from 'src/util/memo';
        export const buildDatePicker = () => {
          const InnerReflessUnmemoized = (props, ref) => <div ref={ref} />;
          const InnerUnmemoized = forwardRef(InnerReflessUnmemoized);
          return memo(forwardRef(InnerUnmemoized));
        };
      `,
    },
    {
      name: 'HOC factory handing back memo?.(forwardRef?.(Inner))',
      code: `
        import { memo, forwardRef } from 'src/util/memo';
        export const buildDatePicker = () => {
          const InnerReflessUnmemoized = (props, ref) => <div ref={ref} />;
          return memo?.(forwardRef?.(InnerReflessUnmemoized));
        };
      `,
    },
    {
      name: 'HOC factory handing back forwardRef(memo(Inner))',
      code: `
        import { memo, forwardRef } from 'src/util/memo';
        export const buildRefView = () => {
          const InnerUnmemoized = (props, ref) => <div ref={ref} />;
          return forwardRef(memo(InnerUnmemoized));
        };
      `,
    },
    {
      name: 'HOC factory handing back forwardRef?.(memo?.(Inner))',
      code: `
        import { memo, forwardRef } from 'src/util/memo';
        export const buildRefView = () => {
          const InnerUnmemoized = (props, ref) => <div ref={ref} />;
          return forwardRef?.(memo?.(InnerUnmemoized));
        };
      `,
    },
    {
      // A type-level wrapper around the hand-back is transparent to the
      // carve-out in both spellings.
      name: 'HOC factory handing back memo(Inner) as ComponentType',
      code: `
        import { memo } from 'src/util/memo';
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return memo(Row) as ComponentType<RowProps>;
        }
      `,
    },
    {
      name: 'HOC factory handing back memo?.(Inner) as ComponentType',
      code: `
        import { memo } from 'src/util/memo';
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return memo?.(Row) as ComponentType<RowProps>;
        }
      `,
    },
    {
      // The interop object hand-back reaches the carve-out one property deep,
      // so the optional call inside it must be transparent there too.
      // `require-memo` credits an object-carried `memo(...)` hand-back in both
      // spellings since #1919, so the component needs no `Unmemoized` opt-out
      // to keep the pair in agreement (measured) (#1925).
      name: 'HOC factory handing back an object carrying memo?.(Inner)',
      code: `
        import { memo } from 'src/util/memo';
        export function buildModule() {
          function Row({ label }) { return <li>{label}</li>; }
          return { __esModule: true, default: memo?.(Row) };
        }
      `,
    },
    // -----------------------------------------------------------------------
    // An ARRAY carries a component out to callers exactly as an object does, so
    // the HOC-factory carve-out reads through both. The sibling walker
    // `expressionCreatesComponent` already recursed into both containers, and
    // `require-memo`'s `containedValues` reads array elements beside object
    // property values, so an array-carried `memo(...)` hand-back read as a
    // nested un-memoized declaration was an asymmetry rather than a design
    // (#1925).
    // -----------------------------------------------------------------------
    {
      name: 'HOC factory handing back an array carrying memo(Inner) (#1925)',
      code: `
        import { memo } from 'src/util/memo';
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return [memo(Row)];
        }
      `,
    },
    {
      // Depth is not a boundary: a container nested in a container hands the
      // component out just the same (#1925).
      name: 'HOC factory handing back a nested array carrying memo(Inner) (#1925)',
      code: `
        import { memo } from 'src/util/memo';
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return [[memo(Row)]];
        }
      `,
    },
    {
      // The gap is container recursion, not optional chaining (#1911): the
      // nullish spelling inside an array reads as the same wrapper the plain
      // one does (#1925).
      name: 'HOC factory handing back an array carrying memo?.(Inner) (#1925)',
      code: `
        import { memo } from 'src/util/memo';
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return [memo?.(Row)];
        }
      `,
    },
    {
      // Mixed containers: the component is reachable only through the array
      // sitting in a property value (#1925).
      name: 'HOC factory handing back an array inside an object (#1925)',
      code: `
        import { memo } from 'src/util/memo';
        export function buildModule() {
          function Row({ label }) { return <li>{label}</li>; }
          return { __esModule: true, extras: [memo(Row)] };
        }
      `,
    },
    {
      // The mirror spelling: an interop object carried as an array element
      // (#1925).
      name: 'HOC factory handing back an object inside an array (#1925)',
      code: `
        import { memo } from 'src/util/memo';
        export function buildModule() {
          function Row({ label }) { return <li>{label}</li>; }
          return [{ __esModule: true, default: memo(Row) }];
        }
      `,
    },
    {
      // A type-level wrapper on the ELEMENT is as transparent as one on the
      // whole hand-back (#1925).
      name: 'HOC factory handing back an array carrying memo(Inner) as ComponentType (#1925)',
      code: `
        import { memo } from 'src/util/memo';
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return [memo(Row) as ComponentType<RowProps>];
        }
      `,
    },
    {
      name: 'HOC factory handing back an array carrying memo(Inner) satisfies ComponentType (#1925)',
      code: `
        import { memo } from 'src/util/memo';
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return [memo(Row) satisfies ComponentType<RowProps>];
        }
      `,
    },
    {
      // #1336 in the nullish spelling: the memo hook stabilizes the identity
      // regardless of how the memo() hand-back is spelled.
      name: 'useMemo returning memo?.(inline) is identity-stabilized',
      code: `
        import { useMemo } from 'react';
        import { memo } from 'src/util/memo';
        const Outer = ({ value }) => {
          const Wrapped = useMemo(() => memo?.((props) => <div {...props} />), [value]);
          return <Wrapped value={value} />;
        };
      `,
    },
    {
      name: 'useMemo returning React?.memo(inline) is identity-stabilized',
      code: `
        import * as React from 'react';
        const Outer = () => {
          const Wrapped = React.useMemo(() => React?.memo((props) => <div {...props} />), []);
          return <Wrapped />;
        };
      `,
    },
    {
      // The hook itself called through an optional chain still resolves to the
      // hook, so the identity-stabilization carve-out still applies.
      name: 'useMemo?.() returning memo(inline) is identity-stabilized',
      code: `
        import { useMemo } from 'react';
        import { memo } from 'src/util/memo';
        const Outer = () => {
          const Wrapped = useMemo?.(() => memo((props) => <div {...props} />), []);
          return <Wrapped />;
        };
      `,
    },
    {
      name: 'useDeepCompareMemo?.() returning memo?.(inline) is identity-stabilized',
      code: `
        import { memo } from 'src/util/memo';
        import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
        const Outer = ({ value }) => {
          const View = useDeepCompareMemo?.(() => {
            return memo?.((props) => <span>{props.value}</span>);
          }, [value]);
          return <View value={value} />;
        };
      `,
    },
    {
      // The non-PascalCase binding carve-out reads the declarator through the
      // call, so an optional hook call must not hide the binding's name.
      name: 'lowercase render callback via an optional hook call stays silent',
      code: `
        import { useCallback } from 'react';
        const renderHit = useCallback?.((hit) => <AccordionCompetitor {...hit} />, []);
      `,
    },
    {
      name: 'lowercase render callback via an optional hook call inside a render body stays silent',
      code: `
        import { useCallback } from 'react';
        const MyList = () => {
          const renderHit = useCallback?.((hit) => <Hit {...hit} />, []);
          return <Hits render={renderHit} />;
        };
      `,
    },
    {
      // A runner call reached through an optional chain is still a statement,
      // so its body still runs once per test rather than per render.
      name: 'it?.() callback keeps the test-runner exemption',
      code: `
        it?.('forwards the override', () => {
          const MockAvatar = () => <span>mock-avatar</span>;
          render(<Competitor AvatarComponent={MockAvatar} />);
        });
      `,
    },
    {
      name: 'describe?.() callback keeps the test-runner exemption',
      code: `
        describe?.('suite', () => {
          const StubProbe = () => <div />;
          render(<StubProbe />);
        });
      `,
    },
    {
      name: 'it.each([...])?.() callback keeps the test-runner exemption',
      code: `
        it.each([1, 2])?.('case %s', (value) => {
          const StubProbe = () => <div>{value}</div>;
          render(<StubProbe />);
        });
      `,
    },
    {
      name: 'jest?.mock() factory keeps the module-mock exemption',
      code: `
        jest?.mock('../Widget', () => {
          const MockWidget = () => <div />;
          return { default: MockWidget };
        });
      `,
    },
    {
      name: 'jest.mock?.() factory keeps the module-mock exemption',
      code: `
        jest.mock?.('../Widget', () => {
          const MockWidget = () => <div />;
          return { default: MockWidget };
        });
      `,
    },
    {
      name: '(jest?.mock)() factory keeps the module-mock exemption',
      code: `
        (jest?.mock)('../Widget', () => {
          const MockWidget = () => <div />;
          return { default: MockWidget };
        });
      `,
    },
    // `use-latest-callback`'s --fix rewrites `useCallback(fn, [])` into
    // `useLatestCallback(fn)`, so this rule reads the replacement hook too
    // (#2313). These cases pin that the carve-outs the `useCallback` spelling
    // enjoys survive the rename rather than the name simply widening reports.
    {
      name: 'useLatestCallback wrapping a plain handler is not a component (#2313)',
      code: `
        import useLatestCallback from 'use-latest-callback';

        const handleClick = useLatestCallback((event) => {
          event.preventDefault();
          return event.clientX;
        });
      `,
    },
    {
      name: 'useLatestCallback returning an object carrying JSX is not a component (#2313)',
      code: `
        import useLatestCallback from 'use-latest-callback';

        const buildConfig = useLatestCallback(() => {
          return {
            title: 'example',
            footer: <div>not treated as component</div>,
          };
        });
      `,
    },
    {
      name: 'lowercase render callback via useLatestCallback stays silent (#2313)',
      code: `
        import useLatestCallback from 'use-latest-callback';

        const renderHit = useLatestCallback((hit) => <AccordionCompetitor {...hit} />);
      `,
    },
    {
      name: 'lowercase render callback via useLatestCallback in a render body stays silent (#2313)',
      code: `
        import useLatestCallback from 'use-latest-callback';

        const MyList = () => {
          const renderHit = useLatestCallback((hit) => <Hit {...hit} />);
          return <Hits render={renderHit} />;
        };
      `,
    },
    {
      name: 'useLatestCallback honours ignorePatterns (#2313)',
      code: `
        import useLatestCallback from 'use-latest-callback';

        const IgnoredComp = useLatestCallback(() => {
          return <div>Should be ignored via pattern</div>;
        });
      `,
      filename: 'Component.test.tsx',
      options: [{ ignorePatterns: ['**/*.test.tsx'] }],
    },
    {
      name: 'useLatestCallback with a spread argument is not inspected (#2313)',
      code: `
        const Comp = useLatestCallback(...args);
      `,
    },
  ],
  invalid: [
    // The test-runner exemption reads only the NEAREST enclosing function, so a
    // component nested inside a component that itself sits in an it() body is
    // still a genuine violation — it really does remount when the outer one
    // re-renders.
    {
      code: `
        it('renders the tree', () => {
          const Outer = () => {
            const Inner = () => <span />;
            return <Inner />;
          };
          render(<Outer />);
        });
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Inner',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    // Reaching helpers declared inside a test body must not reach real
    // components declared there: this one returns JSX, so it is a render body
    // and its nested component still remounts.
    {
      code: `
        describe('suite', () => {
          const Wrapper = ({ children }) => {
            const Inner = () => <span />;
            return <div><Inner />{children}</div>;
          };

          it('renders', () => {
            render(<Wrapper />);
          });
        });
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Inner',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    // A same-named helper called for its value is not a runner callback; the
    // exemption requires the call to stand alone as a statement.
    {
      code: `
        const outcome = test(() => {
          const InlineProbe = () => <div />;
          register(InlineProbe);
          return 1;
        });
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'InlineProbe',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    // The exemption is keyed on jest.mock/doMock specifically; a lookalike
    // `.mock()` on some other object earns no such treatment.
    {
      code: `
        registry.mock('../Widget', () => {
          const InlineWidget = () => <div />;
          return { count: 1 };
        });
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'InlineWidget',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    // Returning an object is not itself the escape hatch — the object has to
    // actually carry a component, or an inline component in a genuine render
    // body would slip through behind any object return.
    {
      code: `
        import { useMemo } from 'react';

        const useConfig = () => {
          return useMemo(() => {
            const InlineBadge = () => <span />;
            return { label: 'x', count: 2 };
          }, []);
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'InlineBadge',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      code: `
        import React, { useCallback } from 'react';

        const CustomButton = useCallback(({ onClick, children }) => <button onClick={onClick}>{children}</button>, []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CustomButton',
            locationDescription: 'useCallback()',
          },
        },
      ],
    },
    {
      code: `
        import { useMemo } from 'react';
        const NestedComp = useMemo(() => (props) => <div {...props} />, []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'NestedComp',
            locationDescription: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        const Parent = () => {
          const Child = () => <div />;
          return <Child />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Child',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      code: `
        const Parent = () => {
          function Child() { return <div />; }
          return <Child />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Child',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      code: `
        const ContentVerticalCarouselGrid = ({ header, ...gridProps }) => {
          const CatalogWrapper = useCallback((props) => {
            return <ContentCarouselWrapper {...props} {...gridProps} header={header} />;
          }, [gridProps, header]);

          return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CatalogWrapper',
            locationDescription: 'useCallback()',
          },
        },
      ],
    },
    {
      code: `
        const MyComp = () => {
          return <AlgoliaLayout CatalogWrapper={(props) => <div {...props} />} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CatalogWrapper',
            locationDescription: 'the "CatalogWrapper" prop',
          },
        },
      ],
    },
    {
      code: `
        const TeamsUnmemoized = () => {
          const TeamsCatalogWrapper = useCallback((props) => {
            return (
              <TeamKeyProvider teamKey={teamKey}>
                <TeamsCarouselWrapper {...props} />
              </TeamKeyProvider>
            );
          }, [teamKey]);

          return <AlgoliaLayout CatalogWrapper={TeamsCatalogWrapper} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'TeamsCatalogWrapper',
            locationDescription: 'useCallback()',
          },
        },
      ],
    },
    {
      code: `
        import { useDeepCompareCallback } from '@blumintinc/use-deep-compare';
        const DeepComp = useDeepCompareCallback((props) => <div {...props} />, []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'DeepComp',
            locationDescription: 'useDeepCompareCallback()',
          },
        },
      ],
    },
    {
      code: `
        import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
        const DeepMemo = useDeepCompareMemo(() => (props) => <div {...props} />, []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'DeepMemo',
            locationDescription: 'useDeepCompareMemo()',
          },
        },
      ],
    },
    {
      code: `
        const MyPage = () => {
          return <Something SomethingComponent={() => <div />} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'SomethingComponent',
            locationDescription: 'the "SomethingComponent" prop',
          },
        },
      ],
    },
    {
      code: `
        const MyPage = () => {
          return <Layout Header={() => <header />} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Header',
            locationDescription: 'the "Header" prop',
          },
        },
      ],
    },
    {
      code: `
        const Comp = useCallback((flag: boolean) => flag && <div />, []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        const Comp = useCallback((flag: boolean) => {
          if (flag) return <div />;
          return null;
        }, []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        const Comp = useCallback((type: string) => {
          switch (type) {
            case 'a': return <div />;
            default: return null;
          }
        }, []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        const Comp = useCallback(() => {
          try {
            return <div />;
          } catch {
            return null;
          }
        }, []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        const Comp = useCallback(() => {
          for (let i = 0; i < 1; i++) {
             return <div />;
          }
          return null;
        }, []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        import { forwardRef, useCallback } from 'react';
        const RefComp = useCallback(forwardRef((props, ref) => <div ref={ref} />), []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        import React, { useCallback } from 'react';
        const Comp = useCallback(() => React.createElement('div'), []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      // FP #4 control: PascalCase useCallback used as a component-type prop
      // inside a render body (returns JSX) must STILL report.
      code: `
        import { useCallback } from 'react';

        const UserCarouselWrapperUnmemoized = ({ ContentCard = UserCardLayout, ...rest }) => {
          const CarouselWrapper = useCallback(
            (props) => <UserVerticalCarousel {...props} ContentCard={ContentCard} />,
            [ContentCard, rest],
          );
          return <AlgoliaLayout CatalogWrapper={CarouselWrapper} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CarouselWrapper',
            locationDescription: 'useCallback()',
          },
        },
      ],
    },
    {
      // FP #5 control: PascalCase component via useMemo inside a render body
      // (the enclosing function returns JSX) must STILL report.
      code: `
        import { useMemo } from 'react';

        const Parent = () => {
          const Child = useMemo(() => (props) => <div {...props} />, []);
          return <Child />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Child',
            locationDescription: 'useMemo()',
          },
        },
      ],
    },
    {
      // FP #2 control: a PascalCase component defined inside an HOC factory
      // that ALSO returns JSX is still a render body and must report.
      code: `
        import { memo } from 'react';

        function withWeird(WrappedComponent) {
          const InnerUnmemoized = (props) => <WrappedComponent {...props} />;
          if (shouldRenderInline) {
            return <InnerUnmemoized />;
          }
          return memo(InnerUnmemoized);
        }
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'InnerUnmemoized',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      name: 'factory with a custom-memo import that also returns JSX still reports',
      code: `
        import { memo } from 'src/util/memo';
        function withWeird(WrappedComponent) {
          const InnerUnmemoized = (props) => <WrappedComponent {...props} />;
          if (shouldRenderInline) {
            return <InnerUnmemoized />;
          }
          return memo(InnerUnmemoized);
        }
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      // by-name recognition must stay scoped to memo/forwardRef: a factory
      // returning some other call like styled(Inner) is NOT an HOC factory and
      // the nested inline component must still be flagged.
      name: 'factory returning styled(Inner) is not exempted by the by-name change',
      code: `
        import { styled } from 'src/util/styled';
        export const buildStyled = () => {
          const InnerUnmemoized = () => <div />;
          return styled(InnerUnmemoized);
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'InnerUnmemoized',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    // #1567 guard: the render-callback carve-out keys on the prop's initial
    // letter only, so every uppercase-initial component-prop suffix must keep
    // reporting. Without these the carve-out could silently widen into an
    // amnesty for the whole JSXAttribute branch.
    {
      name: 'uppercase-initial FooWrapper prop still reports',
      code: `
        const Page = () => {
          return <Layout FooWrapper={(props) => <div {...props} />} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'FooWrapper',
            locationDescription: 'the "FooWrapper" prop',
          },
        },
      ],
    },
    {
      name: 'uppercase-initial FooComponent prop still reports',
      code: `
        const Page = () => {
          return <Layout FooComponent={() => <div />} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'FooComponent',
            locationDescription: 'the "FooComponent" prop',
          },
        },
      ],
    },
    {
      name: 'uppercase-initial FooTemplate prop still reports',
      code: `
        const Page = () => {
          return <Layout FooTemplate={() => <div />} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'FooTemplate',
            locationDescription: 'the "FooTemplate" prop',
          },
        },
      ],
    },
    {
      name: 'uppercase-initial FooHeader prop still reports',
      code: `
        const Page = () => {
          return <Layout FooHeader={() => <header />} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'FooHeader',
            locationDescription: 'the "FooHeader" prop',
          },
        },
      ],
    },
    {
      name: 'uppercase-initial FooFooter prop still reports',
      code: `
        const Page = () => {
          return <Layout FooFooter={() => <footer />} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'FooFooter',
            locationDescription: 'the "FooFooter" prop',
          },
        },
      ],
    },
    {
      // #1567: the other direction of the consistency pair — a PascalCase
      // component prop reports through BOTH the inline and the named-binding
      // path, so the carve-out did not blunt component-type props.
      name: 'PascalCase HeaderComponent reports for both inline and named binding',
      code: `
        const Page = () => {
          const HeaderComponent = () => <header />;
          return (
            <>
              <Layout HeaderComponent={HeaderComponent} />
              <Layout HeaderComponent={() => <header />} />
            </>
          );
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'HeaderComponent',
            locationDescription: 'a render body',
          },
        },
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'HeaderComponent',
            locationDescription: 'the "HeaderComponent" prop',
          },
        },
      ],
    },
    // #1911 controls: unwrapping the optional chain must not widen the
    // already-memoized carve-out past memo/forwardRef. Each of these is the
    // nullish twin of a shape that reports in its plain spelling.
    {
      name: 'factory handing back a non-memo optional call still reports',
      code: `
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return wrap?.(Row);
        }
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Row',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      name: 'factory handing back styled?.(Inner) still reports',
      code: `
        import { styled } from 'src/util/styled';
        export const buildStyled = () => {
          const InnerUnmemoized = () => <div />;
          return styled?.(InnerUnmemoized);
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'InnerUnmemoized',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      name: 'factory with a memo?.() hand-back that also returns JSX still reports',
      code: `
        import { memo } from 'react';
        function withWeird(WrappedComponent) {
          const InnerUnmemoized = (props) => <WrappedComponent {...props} />;
          if (shouldRenderInline) {
            return <InnerUnmemoized />;
          }
          return memo?.(InnerUnmemoized);
        }
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'InnerUnmemoized',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      name: 'lookalike registry.mock?.() earns no module-mock exemption',
      code: `
        registry.mock?.('../Widget', () => {
          const InlineWidget = () => <div />;
          return { count: 1 };
        });
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'InlineWidget',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      // The exemption requires the runner call to stand alone as a statement,
      // and an optional chain does not turn a value-position call into one.
      name: 'value-position test?.() callback still reports',
      code: `
        const outcome = test?.(() => {
          const InlineProbe = () => <div />;
          register(InlineProbe);
          return 1;
        });
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'InlineProbe',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      // The declarator is read through the chain, so the report names the
      // binding rather than falling back to the anonymous label.
      name: 'PascalCase component via an optional useMemo call reports under its own name',
      code: `
        import { useMemo } from 'react';
        const Parent = () => {
          const Child = useMemo?.(() => (props) => <div {...props} />, []);
          return <Child />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Child',
            locationDescription: 'useMemo()',
          },
        },
      ],
    },
    {
      name: 'PascalCase component via an optional useCallback call reports under its own name',
      code: `
        import { useCallback } from 'react';
        const CustomButton = useCallback?.(({ onClick }) => <button onClick={onClick} />, []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CustomButton',
            locationDescription: 'useCallback()',
          },
        },
      ],
    },
    {
      // A component-type prop fed an inline definition through memo?.() is the
      // nullish twin of the memo() form, which reports.
      name: 'component-type prop fed memo?.(inline) still reports',
      code: `
        import { memo } from 'react';
        const MyPage = () => {
          return <Layout Header={memo?.((props) => <header {...props} />)} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Header',
            locationDescription: 'the "Header" prop',
          },
        },
      ],
    },
    {
      // A bare hand-back through an optional chain is not a memo() call at all,
      // so the nested component keeps its report.
      name: 'factory handing back an optional member access still reports',
      code: `
        export const buildView = () => {
          const InnerUnmemoized = ({ value }) => <span>{value}</span>;
          return registry?.InnerUnmemoized;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'InnerUnmemoized',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    // Reading arrays credits the WRAPPED hand-back, never a bare one. A bare
    // array-carried reference is the shape `require-memo` is still repairing —
    // it reports there and its remedy is the `memo(...)` wrapper the fixtures
    // above carry — so crediting it here would exempt the very shape the paired
    // rule is complaining about (#1925).
    {
      name: 'factory handing back an array carrying a bare component still reports (#1925)',
      code: `
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return [Row];
        }
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Row',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      name: 'factory handing back a nested array carrying a bare component still reports (#1925)',
      code: `
        export function makeRow() {
          function Row({ label }) { return <li>{label}</li>; }
          return [[Row]];
        }
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Row',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    // The post-image of `use-latest-callback`'s --fix. The rename swaps which
    // memoization hook wraps the callback; the component is still constructed
    // inline inside render scope, so the advice this rule gives (hoist to module
    // scope) is unchanged and the report must survive the rewrite (#2313).
    {
      name: 'forwardRef component wrapped in useLatestCallback still reports (#2313)',
      code: `
        import { forwardRef } from 'react';
        import useLatestCallback from 'use-latest-callback';
        const RefComp = useLatestCallback(forwardRef((props, ref) => <div ref={ref} />));
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'RefComp',
            locationDescription: 'useLatestCallback()',
          },
        },
      ],
    },
    {
      name: 'PascalCase component-type prop built with useLatestCallback still reports (#2313)',
      code: `
        import useLatestCallback from 'use-latest-callback';

        const UserCarouselWrapperUnmemoized = ({ ContentCard = UserCardLayout, ...rest }) => {
          const CarouselWrapper = useLatestCallback(
            (props) => <UserVerticalCarousel {...props} ContentCard={ContentCard} />,
          );
          return <AlgoliaLayout CatalogWrapper={CarouselWrapper} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CarouselWrapper',
            locationDescription: 'useLatestCallback()',
          },
        },
      ],
    },
    {
      name: 'conditional JSX return through useLatestCallback still reports (#2313)',
      code: `
        import useLatestCallback from 'use-latest-callback';
        const Comp = useLatestCallback((flag: boolean) => flag && <div />);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      name: 'createElement return through useLatestCallback still reports (#2313)',
      code: `
        import React from 'react';
        import useLatestCallback from 'use-latest-callback';
        const Comp = useLatestCallback(() => React.createElement('div'));
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      // The hook allowlist is read through unwrapNode, so the optional and
      // member spellings of the replacement hook reach it exactly as the
      // `useCallback` ones do.
      name: 'PascalCase component via an optional useLatestCallback call reports (#2313)',
      code: `
        import useLatestCallback from 'use-latest-callback';
        const CustomButton = useLatestCallback?.(({ onClick }) => <button onClick={onClick} />);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CustomButton',
            locationDescription: 'useLatestCallback()',
          },
        },
      ],
    },
    {
      name: 'PascalCase component via a member useLatestCallback call reports (#2313)',
      code: `
        import * as Hooks from 'use-latest-callback';
        const CustomButton = Hooks.useLatestCallback(({ onClick }) => <button onClick={onClick} />);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CustomButton',
            locationDescription: 'useLatestCallback()',
          },
        },
      ],
    },
  ],
});
