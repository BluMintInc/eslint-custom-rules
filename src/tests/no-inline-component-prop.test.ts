import { ruleTesterJsx } from '../utils/ruleTester';
import { noInlineComponentProp } from '../rules/no-inline-component-prop';

// Both fixtures declare their wrapper at module scope, which is exactly what
// allowModuleScopeFactories exempts. Reusing the same text on both sides of the
// valid/invalid divide leaves the option as the sole difference. The object
// variant matters separately because member-expression props take their own
// allowModuleScopeFactories branch in the rule.
const MODULE_SCOPE_WRAPPER = `
    const StableWrapper = (props: { children: unknown }) => (
      <div>{props.children}</div>
    );

    function Page() {
      return <AlgoliaLayout CatalogWrapper={StableWrapper} />;
    }
    `;

const MODULE_SCOPE_WRAPPER_OBJECT = `
    const wrappers = {
      CatalogWrapper: (props: { children: JSX.Element }) => <div>{props.children}</div>,
    };

    function Page() {
      return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
    }
    `;

// `global-const-style` autofixes a module-scope object literal to `as const`, so
// under the recommended config this spelling is what the member-expression
// branch actually receives. Reading `init` without unwrapping made the
// annotation silence the rule, which let one fixer disable another.
const MODULE_SCOPE_WRAPPER_OBJECT_AS_CONST = `
    const wrappers = {
      CatalogWrapper: (props: { children: JSX.Element }) => <div>{props.children}</div>,
    } as const;

    function Page() {
      return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
    }
    `;

// The exact shape `require-memo`'s --fix emits for a nested component: the
// declaration is renamed to `<Name>Unmemoized` and a sibling `const <Name> =
// memo(<Name>Unmemoized)` is appended. Both statements stay inside the render
// scope, so the declaration is still recreated per render and `memo` is
// re-invoked on a fresh argument — the hazard the culprit's rewrite was
// supposed to remove survives it, and this rule must keep saying so.
const RENAME_AND_WRAP_IN_RENDER = `
    import { memo } from '../util/memo';

    function Page() {
      function ItemComponentUnmemoized(props: { value: string }) {
        return <Row {...props} />;
      }
      const ItemComponent = memo(ItemComponentUnmemoized);
      return <List ItemComponent={ItemComponent} />;
    }
    `;

// The same rewrite applied at module scope is the CORRECT, stable pattern: the
// declaration is created once and `memo` is invoked once. Sharing the text with
// the fixture above leaves the declaration's scope as the sole difference.
const RENAME_AND_WRAP_AT_MODULE_SCOPE = `
    import { memo } from '../util/memo';

    function ItemComponentUnmemoized(props: { value: string }) {
      return <Row {...props} />;
    }
    const ItemComponent = memo(ItemComponentUnmemoized);

    function Page() {
      return <List ItemComponent={ItemComponent} />;
    }
    `;

ruleTesterJsx.run('no-inline-component-prop', noInlineComponentProp, {
  valid: [
    `
    const StableWrapper = (props: { children: unknown }) => (
      <div>{props.children}</div>
    );

    function Page() {
      return <AlgoliaLayout CatalogWrapper={StableWrapper} />;
    }
    `,
    `
    function List({ items }: { items: string[] }) {
      return (
        <VirtualizedList
          items={items}
          renderItem={(row) => <Row row={row} />}
        />
      );
    }
    `,
    `
    type Props = { CatalogWrapper: (props: { id: string }) => JSX.Element };
    const Page = ({ CatalogWrapper }: Props) => (
      <AlgoliaLayout CatalogWrapper={CatalogWrapper} />
    );
    `,
    `
    const makeWrapper = (header: JSX.Element) => (props: { children: JSX.Element }) =>
      <Wrapper {...props} header={header} />;

    function Page({ header }: { header: JSX.Element }) {
      return <AlgoliaLayout CatalogWrapper={makeWrapper(header)} />;
    }
    `,
    `
    function Page() {
      const Local = () => <div>safe</div>;
      return <Local />;
    }
    `,
    `
    const Boxed = () => {
      return <Box component={(props) => <div {...props} />} />;
    };
    `,
    `
    const Grid = ({ rows }: { rows: string[] }) => (
      <GridView rows={rows} renderRow={(row) => <Row row={row} />} />
    );
    `,
    `
    import React from 'react';
    const Stable = React.memo(function Stable(props: { children: React.ReactNode }) {
      return <Wrapper {...props} />;
    });

    function Page() {
      return <AlgoliaLayout CatalogWrapper={Stable} />;
    }
    `,
    `
    const wrappers = {
      CatalogWrapper: (props: { children: JSX.Element }) => <div>{props.children}</div>,
    };

    function Page() {
      return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
    }
    `,
    `
    const Inline = (props: { title: string }) => <div>{props.title}</div>;
    function Page() {
      return <Layout PanelComponent={Inline} />;
    }
    `,
    `
    function Page() {
      return <List renderComponent={(row) => <Row row={row} />} />;
    }
    `,
    {
      code: `
      function Page() {
        return (
          <Layout
            custom={(props: { children: JSX.Element }) => <div {...props} />}
          />
        );
      }
      `,
      options: [{ props: ['*a*b*c*'] }],
    },
    // allowModuleScopeFactories: true is the default, stated explicitly to pair
    // with the invalid twin that only flips it to false.
    {
      code: MODULE_SCOPE_WRAPPER,
      options: [{ allowModuleScopeFactories: true }],
    },
    {
      code: MODULE_SCOPE_WRAPPER_OBJECT,
      options: [{ allowModuleScopeFactories: true }],
    },
    {
      code: MODULE_SCOPE_WRAPPER_OBJECT_AS_CONST,
      options: [{ allowModuleScopeFactories: true }],
    },
    // A definition in a STRICTLY OUTER function is created once per call of that
    // outer function, so every run of the consumer sees the identical reference
    // and there is no remount to prevent. The invalid twins below pin that the
    // same shapes still report once definition and consumer share a function.
    `
    export function withCatalog(Inner: any) {
      const StableWrapper = (props: { children: unknown }) => (
        <Inner>{props.children}</Inner>
      );

      return function Page() {
        return <AlgoliaLayout CatalogWrapper={StableWrapper} />;
      };
    }
    `,
    // A describe body runs once while its it callbacks run later, so the wrapper
    // identity is fixed across every consuming callback.
    `
    describe('CustomHitsPreempted', () => {
      const CatalogWrapper = ({ hits }: { hits: unknown[] }) => (
        <div>{hits.length}</div>
      );

      it('renders', () => {
        render(<CustomHitsPreemptedUnmemoized CatalogWrapper={CatalogWrapper} />);
      });
    });
    `,
    `
    class PageFactory {
      build() {
        const StableWrapper = (props: { children: unknown }) => (
          <div>{props.children}</div>
        );
        return function Page() {
          return <AlgoliaLayout CatalogWrapper={StableWrapper} />;
        };
      }
    }
    `,
    `
    const factories = {
      build() {
        const StableWrapper = (props: { children: unknown }) => (
          <div>{props.children}</div>
        );
        return function Page() {
          return <AlgoliaLayout CatalogWrapper={StableWrapper} />;
        };
      },
    };
    `,
    // Wrapping the module-scope fixture in a plain function is semantically
    // neutral for identity churn, so it must stay silent.
    `
    function buildPage() {
      const StableWrapper = (props: { children: unknown }) => (
        <div>{props.children}</div>
      );

      function Page() {
        return <AlgoliaLayout CatalogWrapper={StableWrapper} />;
      }

      return Page;
    }
    `,
    // Member-expression branch of the same outer-scope shape; it carries its own
    // exemption check, so it needs its own fixture.
    `
    function buildPage() {
      const wrappers = {
        CatalogWrapper: (props: { children: JSX.Element }) => <div>{props.children}</div>,
      };

      function Page() {
        return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
      }

      return Page;
    }
    `,
    // Definition and consumer both at module scope: neither has an enclosing
    // function, and a module binding is never recreated.
    `
    const StableWrapper = (props: { children: unknown }) => (
      <div>{props.children}</div>
    );

    export const element = <AlgoliaLayout CatalogWrapper={StableWrapper} />;
    `,
    // memo(<identifier>) is judged on where the identifier is DECLARED. Every
    // case below resolves to a binding the consuming render does not recreate,
    // or to no visible binding at all, so each one must stay silent.
    RENAME_AND_WRAP_AT_MODULE_SCOPE,
    {
      code: RENAME_AND_WRAP_AT_MODULE_SCOPE,
      options: [{ allowModuleScopeFactories: true }],
    },
    // An imported name is defined in another module and cannot churn with this
    // render.
    `
    import { memo } from '../util/memo';
    import { ItemComponentUnmemoized } from './ItemComponent';

    function Page() {
      const ItemComponent = memo(ItemComponentUnmemoized);
      return <List ItemComponent={ItemComponent} />;
    }
    `,
    // A parameter is supplied by the caller; its identity is the caller's to
    // keep stable, and the message's remedy would not apply.
    `
    import { memo } from '../util/memo';

    function Page({ Inner }: { Inner: any }) {
      const ItemComponent = memo(Inner);
      return <List ItemComponent={ItemComponent} />;
    }
    `,
    // An unresolvable name — a global, or an ambient declaration from a file
    // this rule never sees — proves nothing about churn.
    `
    import { memo } from '../util/memo';

    function Page() {
      const ItemComponent = memo(SomeGlobalComponent);
      return <List ItemComponent={ItemComponent} />;
    }
    `,
    // A rebound binding is not fixed by any single declaration, so the
    // declaration site does not decide what memo() receives.
    `
    import { memo } from '../util/memo';

    function Page({ flag }: { flag: boolean }) {
      let Inner = (props: { value: string }) => <Row {...props} />;
      if (flag) {
        Inner = OtherRow;
      }
      const ItemComponent = memo(Inner);
      return <List ItemComponent={ItemComponent} />;
    }
    `,
    // Declared by a strictly outer function: created once per call of that
    // function, so every run of the consumer sees the identical reference.
    `
    import { memo } from '../util/memo';

    export function withCatalog() {
      function ItemComponentUnmemoized(props: { value: string }) {
        return <Row {...props} />;
      }
      const ItemComponent = memo(ItemComponentUnmemoized);

      return function Page() {
        return <List ItemComponent={ItemComponent} />;
      };
    }
    `,
    // A class binding is not the function-shaped declaration this branch reads,
    // and the conservative reading declines it.
    `
    import { memo } from '../util/memo';

    function Page() {
      class ItemComponentUnmemoized extends Component {
        render() {
          return <Row />;
        }
      }
      const ItemComponent = memo(ItemComponentUnmemoized);
      return <List ItemComponent={ItemComponent} />;
    }
    `,
    // A self-referential initializer must terminate rather than recurse on the
    // scope graph, and it names no function to judge.
    `
    import { memo } from '../util/memo';

    function Page() {
      const ItemComponent = memo(ItemComponent);
      return <List ItemComponent={ItemComponent} />;
    }
    `,
    // memo() with no argument resolves to nothing.
    `
    import { memo } from '../util/memo';

    function Page() {
      const ItemComponent = memo();
      return <List ItemComponent={ItemComponent} />;
    }
    `,
    // A destructured local carries no function-shaped initializer of its own.
    `
    import { memo } from '../util/memo';

    function Page({ deps }: { deps: any }) {
      const { Inner } = deps;
      const ItemComponent = memo(Inner);
      return <List ItemComponent={ItemComponent} />;
    }
    `,
    // A member expression in argument position is not a resolvable name.
    `
    import { memo } from '../util/memo';

    function Page() {
      const wrappers = {
        Inner: (props: { value: string }) => <Row {...props} />,
      };
      const ItemComponent = memo(wrappers.Inner);
      return <List ItemComponent={ItemComponent} />;
    }
    `,
  ],
  invalid: [
    {
      code: `
      function Page() {
        return <AlgoliaLayout CatalogWrapper={(props) => <div {...props} />} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        const CatalogWrapper = (props: { children: JSX.Element }) => (
          <Wrapper {...props} />
        );
        return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      import { useCallback } from 'react';
      function Page({ header }: { header: JSX.Element }) {
        const CatalogWrapper = useCallback(
          (props: { children: JSX.Element }) => (
            <Wrapper {...props} header={header} />
          ),
          [header],
        );
        return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      import { useMemo } from 'react';
      function Page({ header }: { header: JSX.Element }) {
        const CatalogWrapper = useMemo(
          function CatalogWrapper(props: { children: JSX.Element }) {
            return <Wrapper {...props} header={header} />;
          },
          [header],
        );
        return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        function ItemComponent(props: { value: string }) {
          return <Row {...props} />;
        }
        return <List ItemComponent={ItemComponent} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      import React from 'react';
      function Page() {
        const WrapperComponent = React.memo((props: { children: JSX.Element }) => (
          <Wrapper {...props} />
        ));
        return <AlgoliaLayout CatalogWrapper={WrapperComponent} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        const rowWrapper = (props: { children: JSX.Element }) => <div {...props} />;
        return <AlgoliaLayout RowWrapper={rowWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        const wrappers = {
          CatalogWrapper: (props: { children: JSX.Element }) => <div {...props} />,
        };
        return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        return (
          <List
            renderComponent={(row) => <Row row={row} />}
          />
        );
      }
      `,
      options: [{ allowRenderProps: false }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      import React from 'react';
      function Page() {
        const Forward = React.forwardRef<HTMLDivElement, { children: JSX.Element }>(
          (props, ref) => <div ref={ref}>{props.children}</div>,
        );
        return <AlgoliaLayout CatalogWrapper={Forward} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        const SlotComponent = (props: { value: string }) => <div>{props.value}</div>;
        return <Widget SlotComponent={SlotComponent} />;
      }
      `,
      options: [{ props: ['SlotComponent'] }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      import { useCallback } from 'react';
      function Page() {
        return (
          <AlgoliaLayout
            CatalogWrapper={useCallback(
              (props: { children: JSX.Element }) => <div {...props} />,
              [],
            )}
          />
        );
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        return (
          <Widget
            customProp={(props: { value: string }) => <div>{props.value}</div>}
          />
        );
      }
      `,
      options: [{ props: ['customProp'] }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // Twin of the valid allowModuleScopeFactories case: withdrawing the module
    // scope exemption reports the identical fixture.
    {
      code: MODULE_SCOPE_WRAPPER,
      options: [{ allowModuleScopeFactories: false }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: MODULE_SCOPE_WRAPPER_OBJECT,
      options: [{ allowModuleScopeFactories: false }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // An `as const` on the holding object must not change the verdict: the
    // annotation is a type-level assertion and the object is still recreated.
    {
      code: MODULE_SCOPE_WRAPPER_OBJECT_AS_CONST,
      options: [{ allowModuleScopeFactories: false }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // `satisfies` reaches the same branch through the same wrapper.
    {
      code: `
      const wrappers = {
        CatalogWrapper: (props: { children: JSX.Element }) => <div {...props} />,
      } satisfies Record<string, unknown>;

      function Page() {
        return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
      }
      `,
      options: [{ allowModuleScopeFactories: false }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // Nesting depth is irrelevant: what matters is that the definition and the
    // consuming JSX share their nearest enclosing function.
    {
      code: `
      export function outer() {
        return function middle() {
          return function Page() {
            const StableWrapper = (props: { children: unknown }) => (
              <div>{props.children}</div>
            );
            return <AlgoliaLayout CatalogWrapper={StableWrapper} />;
          };
        };
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // A custom hook body re-runs on every render of its caller, so a wrapper
    // declared beside the consuming JSX churns exactly like one in a component.
    {
      code: `
      export function useCatalogLayout() {
        const CatalogWrapper = (props: { children: unknown }) => (
          <div>{props.children}</div>
        );
        return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      export function useCatalogWrappers() {
        const wrappers = {
          CatalogWrapper: (props: { children: JSX.Element }) => <div {...props} />,
        };
        return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // An IIFE body encloses both the definition and the consumer, so it is the
    // same-function case rather than an outer factory.
    {
      code: `
      function Page() {
        return (() => {
          const StableWrapper = (props: { children: unknown }) => (
            <div>{props.children}</div>
          );
          return <AlgoliaLayout CatalogWrapper={StableWrapper} />;
        })();
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // A loop body is not a function, so the declaration still belongs to Page.
    {
      code: `
      function Page({ rows }: { rows: string[] }) {
        for (const row of rows) {
          const RowWrapper = (props: { children: unknown }) => (
            <div>{props.children}</div>
          );
          return <AlgoliaLayout CatalogWrapper={RowWrapper} />;
        }
        return null;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // Withdrawing allowModuleScopeFactories withdraws every stability carve-out,
    // outer-function factories included; without this the option would be inert
    // for anything but module scope.
    {
      code: `
      export function withCatalog(Inner: any) {
        const StableWrapper = (props: { children: unknown }) => (
          <Inner>{props.children}</Inner>
        );

        return function Page() {
          return <AlgoliaLayout CatalogWrapper={StableWrapper} />;
        };
      }
      `,
      options: [{ allowModuleScopeFactories: false }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      export function withCatalog() {
        const wrappers = {
          CatalogWrapper: (props: { children: JSX.Element }) => <div {...props} />,
        };

        return function Page() {
          return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
        };
      }
      `,
      options: [{ allowModuleScopeFactories: false }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // The rename-plus-wrap spelling `require-memo`'s --fix emits. Resolving the
    // identifier is what keeps this reported: reading only an inline function
    // literal let one fixer disable this rule while the violation survived.
    {
      code: RENAME_AND_WRAP_IN_RENDER,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // Past the print width the culprit breaks its sole argument onto its own
    // line. The verdict is a property of the reference, not of the formatting.
    {
      code: `
      import { memo } from '../util/memo';

      function Page() {
        function ItemComponentWithARatherLongNameUnmemoized(props: { value: string }) {
          return <Row {...props} />;
        }
        const ItemComponentWithARatherLongName = memo(
          ItemComponentWithARatherLongNameUnmemoized,
        );
        return <List ItemComponent={ItemComponentWithARatherLongName} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // The namespaced spelling of the same call.
    {
      code: `
      import React from 'react';

      function Page() {
        const CatalogWrapperUnmemoized = (props: { children: JSX.Element }) => (
          <Wrapper {...props} />
        );
        const CatalogWrapper = React.memo(CatalogWrapperUnmemoized);
        return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // forwardRef takes the same argument position, and a local reference churns
    // through it identically.
    {
      code: `
      import React from 'react';

      function Page() {
        const InnerUnmemoized = (props: { children: JSX.Element }, ref: any) => (
          <div ref={ref}>{props.children}</div>
        );
        const CatalogWrapper = React.forwardRef(InnerUnmemoized);
        return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // A bounded chain of wrapper calls still lands on the local declaration.
    {
      code: `
      import { memo, forwardRef } from '../util/memo';

      function Page() {
        const InnerUnmemoized = (props: { children: JSX.Element }) => (
          <Wrapper {...props} />
        );
        const Inner = forwardRef(InnerUnmemoized);
        const CatalogWrapper = memo(Inner);
        return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // A hook body re-runs per render of its caller, so the rewritten shape
    // churns there for the same reason it does in a component.
    {
      code: `
      import { memo } from '../util/memo';

      export function useCatalogLayout() {
        function CatalogWrapperUnmemoized(props: { children: unknown }) {
          return <div>{props.children}</div>;
        }
        const CatalogWrapper = memo(CatalogWrapperUnmemoized);
        return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    // Twin of the valid module-scope fixture: withdrawing the stability
    // carve-out reports the identical text, which pins that the resolution
    // reaches the declaration rather than declining for some other reason.
    {
      code: RENAME_AND_WRAP_AT_MODULE_SCOPE,
      options: [{ allowModuleScopeFactories: false }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
  ],
});
