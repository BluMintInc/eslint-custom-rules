import { Linter, Rule } from 'eslint';
import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceRenderHitsMemoization } from '../rules/enforce-render-hits-memoization';
import { noEmptyDependencyUseCallbacks } from '../rules/no-empty-dependency-use-callbacks';
import { useLatestCallback } from '../rules/use-latest-callback';

ruleTesterJsx.run(
  'enforce-render-hits-memoization',
  enforceRenderHitsMemoization,
  {
    valid: [
      // Basic valid useRenderHits usage with memoized shorthand props. The
      // consts live INSIDE the component on purpose: at module scope they would
      // be accepted by the module-scope carve-out whatever the callee set said,
      // so the fixture would stop proving that useCallback is a boundary.
      {
        code: `
        const Component = ({ hits }) => {
          const transformBefore = useCallback((hits) => hits.filter(h => h.isActive), []);
          const render = useCallback((hit) => <HitComponent hit={hit} />, []);
          useRenderHits({ hits, transformBefore, render });
        };
      `,
      },
      // The same props written out, so neither spelling is the only one covered
      {
        code: `
        const Component = ({ hits }) => {
          const transform = useCallback((hits) => hits.filter(h => h.isActive), []);
          const renderHit = useCallback((hit) => <HitComponent hit={hit} />, []);
          useRenderHits({ hits, transformBefore: transform, render: renderHit });
        };
      `,
      },
      // Valid renderHits usage inside useMemo
      {
        code: `
        const result = useMemo(() => renderHits(hits, (hit) => <HitComponent hit={hit} />), [hits]);
      `,
      },
      // Valid renderHits usage inside useCallback
      {
        code: `
        const renderResults = useCallback(() => renderHits(hits, (hit) => <HitComponent hit={hit} />), [hits]);
      `,
      },
      // Valid with aliased imports
      {
        code: `
        import { useRenderHits as customHook } from '@/hooks/algolia/useRenderHits';
        import { renderHits as customRender } from '@/hooks/algolia/renderHits';

        const Component = ({ hits }) => {
          const transformBefore = useCallback((hits) => hits.filter(h => h.isActive), []);
          const render = useCallback((hit) => <HitComponent hit={hit} />, []);
          customHook({ hits, transformBefore, render });

          return useMemo(() => customRender(hits, render), [hits, render]);
        };
      `,
      },
      // Valid with complex nested structures
      {
        code: `
        const Component = () => {
          const transformBefore = useCallback((hits) => {
            const filtered = hits.filter(h => h.isActive);
            return filtered.map(hit => ({
              ...hit,
              score: hit.score * 2,
              nested: {
                value: hit.nested?.value ?? 0
              }
            }));
          }, []);

          const render = useCallback((hit) => (
            <div>
              <HitComponent
                hit={hit}
                score={hit.score}
                nested={hit.nested}
              />
            </div>
          ), []);

          useRenderHits({ hits, transformBefore, render });
        };
      `,
      },
      // Valid with unusual whitespace and comments
      {
        code: `
        const Component=({hits})=>{const transformBefore=useCallback(
          // Filter active hits
          (hits)=>hits.filter(h=>h.isActive)
          /* No dependencies needed */
          ,[]
        );const render=useCallback((hit)=><HitComponent hit={hit}/>,[]
        );useRenderHits({hits,transformBefore,render});};
      `,
      },
      // Valid with different hook dependency patterns
      {
        code: `
        const Component = ({ config, theme }) => {
          const transformBefore = useCallback(
            (hits) => hits.filter(h => h.type === config.type),
            [config.type]
          );

          const render = useCallback(
            (hit) => (
              <HitComponent
                hit={hit}
                theme={theme}
                config={config}
              />
            ),
            [theme, config]
          );

          useRenderHits({ hits, transformBefore, render });
        };
      `,
      },
      // Valid with memoized component reference
      {
        code: `
        const MemoizedHitComponent = memo(HitComponent);

        const Component = ({ hits }) => {
          const transformBefore = useCallback((hits) => hits.filter(h => h.isActive), []);
          const render = useCallback(
            (hit) => <MemoizedHitComponent hit={hit} />,
            []
          );
          useRenderHits({ hits, transformBefore, render });
        };
      `,
      },
      // Valid with multiple renderHits calls in different memoization contexts
      {
        code: `
        const Component = ({ hits1, hits2 }) => {
          const renderFirst = useMemo(
            () => renderHits(hits1, (hit) => <Hit1 hit={hit} />),
            [hits1]
          );

          const renderSecond = useCallback(
            () => renderHits(hits2, (hit) => <Hit2 hit={hit} />),
            [hits2]
          );

          return <>{renderFirst}{renderSecond()}</>;
        };
      `,
      },
      // Valid: the react import spells out the shape a composition sweep needs.
      // Fixtures that write a bare `useCallback(...)` never trigger
      // use-latest-callback's fixer, so the chain that produces issue #1585
      // rewrites nothing and the sweep reports a vacuous clean.
      {
        code: `
        import { useCallback } from 'react';

        const HitsList = ({ hits }) => {
          const renderResults = useCallback(
            () => renderHits(hits, (hit) => <HitComponent hit={hit} />),
            [hits],
          );
          return <div>{renderResults()}</div>;
        };
      `,
      },
      // Valid: useLatestCallback is a memoization boundary. It is also exactly
      // what use-latest-callback's fixer leaves behind when it rewrites the
      // useCallback above, so rejecting it would make the recommended config
      // manufacture a report against its own output (issue #1585).
      {
        code: `
        import useLatestCallback from 'use-latest-callback';

        const HitsList = ({ hits }) => {
          const renderResults = useLatestCallback(() =>
            renderHits(hits, (hit) => <HitComponent hit={hit} />),
          );
          return <div>{renderResults()}</div>;
        };
      `,
      },
      // Valid: the sibling fixer falls back to a numeric suffix when
      // 'useLatestCallback' is already bound in the file, so the hook reaches
      // this rule under a name only the import can reveal.
      {
        code: `
        import useLatestCallback2 from 'use-latest-callback';
        const useLatestCallback = 'not the hook';

        const HitsList = ({ hits }) => {
          const renderResults = useLatestCallback2(() =>
            renderHits(hits, (hit) => <HitComponent hit={hit} />),
          );
          return <div>{useLatestCallback}{renderResults()}</div>;
        };
      `,
      },
      // Valid: named-specifier form of the same module
      {
        code: `
        import { useLatestCallback } from 'use-latest-callback';

        const result = useLatestCallback(() =>
          renderHits(hits, (hit) => <HitComponent hit={hit} />),
        );
      `,
      },
      // Valid: inline useLatestCallback props on useRenderHits
      {
        code: `
        import useLatestCallback from 'use-latest-callback';

        useRenderHits({
          hits,
          transformBefore: useLatestCallback((hits) => hits.filter(h => h.isActive)),
          render: useLatestCallback((hit) => <HitComponent hit={hit} />),
        });
      `,
      },
      // Valid: shorthand props whose consts are memoized with useLatestCallback
      {
        code: `
        import useLatestCallback from 'use-latest-callback';

        const Component = ({ hits }) => {
          const transformBefore = useLatestCallback((hits) => hits.filter(h => h.isActive));
          const render = useLatestCallback((hit) => <HitComponent hit={hit} />);
          useRenderHits({ hits, transformBefore, render });
        };
      `,
      },
      // Valid: non-shorthand props pointing at useLatestCallback consts
      {
        code: `
        import useLatestCallback from 'use-latest-callback';

        const Component = ({ hits }) => {
          const transform = useLatestCallback((hits) => hits.filter(h => h.isActive));
          const renderHit = useLatestCallback((hit) => <HitComponent hit={hit} />);
          useRenderHits({ hits, transformBefore: transform, render: renderHit });
        };
      `,
      },
      // Valid: a useRenderHits call nested inside a useLatestCallback, matching
      // the leniency the rule already grants inside useMemo/useCallback
      {
        code: `
        import useLatestCallback from 'use-latest-callback';

        const Component = ({ hits }) =>
          useLatestCallback(() =>
            useRenderHits({
              hits,
              transformBefore: (hits) => hits,
              render: (hit) => <HitComponent hit={hit} />,
            }),
          );
      `,
      },
      // Valid: a module-scope const is created once for the program's lifetime,
      // so it is strictly more stable than any hook could make it. This is the
      // exact shape no-empty-dependency-use-callbacks' fixer produces when it
      // hoists a dependency-free callback out of the component (issue #1586).
      {
        code: `
        const transform = (hits) => hits.filter(h => h.isActive);
        const renderHit = (hit) => <HitComponent hit={hit} />;

        const Component = ({ hits }) => {
          useRenderHits({ hits, transformBefore: transform, render: renderHit });
        };
      `,
      },
      // Valid: the function-declaration form of the same stable binding
      {
        code: `
        function transform(hits) {
          return hits.filter(h => h.isActive);
        }
        function renderHit(hit) {
          return <HitComponent hit={hit} />;
        }

        const Component = ({ hits }) => {
          useRenderHits({ hits, transformBefore: transform, render: renderHit });
        };
      `,
      },
      // Valid: an imported binding is module-stable for the same reason — the
      // module it comes from evaluates once.
      {
        code: `
        import { transform } from './transform';
        import renderHit from './renderHit';

        const Component = ({ hits }) => {
          useRenderHits({ hits, transformBefore: transform, render: renderHit });
        };
      `,
      },
      // Valid: an exported module-scope const is the same binding wearing an
      // export keyword, which the scope analysis sees through
      {
        code: `
        export const transform = (hits) => hits.filter(h => h.isActive);

        const Component = ({ hits }) => {
          useRenderHits({
            hits,
            transformBefore: transform,
            render: useCallback((hit) => <HitComponent hit={hit} />, []),
          });
        };
      `,
      },
      // Valid: under sourceType 'script' the very same top-level declarations
      // bind to the GLOBAL scope and no module scope exists at all (issue
      // #1578). A consumer whose config leaves the parser default in place must
      // get the same carve-out, so the check accepts both scope types.
      {
        code: `
        const transform = (hits) => hits.filter(h => h.isActive);
        function renderHit(hit) {
          return <HitComponent hit={hit} />;
        }

        const Component = ({ hits }) => {
          useRenderHits({ hits, transformBefore: transform, render: renderHit });
        };
      `,
        parserOptions: {
          sourceType: 'script' as const,
          ecmaFeatures: { jsx: true },
        },
      },
      // Valid: module scope reached through an intervening nested function —
      // resolution walks the whole scope chain, not just the nearest scope
      {
        code: `
        const transform = (hits) => hits.filter(h => h.isActive);

        const Component = ({ hits }) => {
          const Inner = () => {
            useRenderHits({
              hits,
              transformBefore: transform,
              render: useCallback((hit) => <HitComponent hit={hit} />, []),
            });
          };
          return <Inner />;
        };
      `,
      },
      // Valid: shorthand props pointing at module-scope declarations. The
      // carve-out keys on where the declaration lives, so it has to survive the
      // spelling `object-shorthand` rewrites props into (issue #1588).
      {
        code: `
        const transformBefore = (hits) => hits.filter(h => h.isActive);
        function render(hit) {
          return <HitComponent hit={hit} />;
        }

        const Component = ({ hits }) => {
          useRenderHits({ hits, transformBefore, render });
        };
      `,
      },
      // Valid: shorthand props bound by imports — module-stable for the same
      // reason, and the names an import gives are exactly the names shorthand
      // needs
      {
        code: `
        import { transformBefore } from './transformBefore';
        import render from './render';

        const Component = ({ hits }) => {
          useRenderHits({ hits, transformBefore, render });
        };
      `,
      },
      // Valid: shorthand prop memoized with useMemo
      {
        code: `
        const Component = ({ hits, sortKey }) => {
          const render = useMemo(() => (hit) => <HitComponent hit={hit} />, [sortKey]);
          useRenderHits({ hits, render });
        };
      `,
      },
      // Valid: shorthand prop bound to the suffixed name the use-latest-callback
      // fixer falls back to, reached through the import rather than by name
      {
        code: `
        import useLatestCallback2 from 'use-latest-callback';
        const useLatestCallback = 'not the hook';

        const Component = ({ hits }) => {
          const render = useLatestCallback2((hit) => <HitComponent hit={hit} />);
          useRenderHits({ hits, render });
          return useLatestCallback;
        };
      `,
      },
      // Valid: the memoized declaration sits in an ENCLOSING scope. Resolving
      // only the innermost scope's own variables would miss it and demand a
      // useCallback around a value that already has one.
      {
        code: `
        const Component = ({ hits }) => {
          const render = useCallback((hit) => <HitComponent hit={hit} />, []);
          const Inner = () => {
            useRenderHits({ hits, render });
          };
          return <Inner />;
        };
      `,
      },
      // Valid: the same resolution question one block deep instead of one
      // function deep
      {
        code: `
        const Component = ({ hits, enabled }) => {
          const transformBefore = useCallback((hits) => hits.filter(h => h.isActive), []);
          if (enabled) {
            useRenderHits({ hits, transformBefore });
          }
        };
      `,
      },
      // Valid: the written-out spelling of the same enclosing-scope resolution,
      // which reports before the lookup walks the scope chain
      {
        code: `
        const Component = ({ hits, enabled }) => {
          const transform = useCallback((hits) => hits.filter(h => h.isActive), []);
          if (enabled) {
            useRenderHits({ hits, transformBefore: transform });
          }
        };
      `,
      },
      // Valid: a component factory. The helpers are built once per
      // createHitList() call and the HitList closure is built in that same call,
      // so every render of a given HitList sees the identical references. The
      // demanded remedy is unavailable in both directions: useCallback cannot
      // legally be called in createHitList (neither component nor hook), and
      // transform closes over `pred` so it cannot be hoisted to module scope
      // either (issue #1768).
      {
        code: `
        export function createHitList(pred) {
          const transform = (hits) => hits.filter(pred);
          const renderHit = (hit) => <HitComponent hit={hit} />;
          return function HitList({ hits }) {
            useRenderHits({ hits, transformBefore: transform, render: renderHit });
          };
        }
      `,
      },
      // Valid: the shorthand spelling of the same factory, so the carve-out is
      // not keyed on one spelling
      {
        code: `
        export function createHitList(pred) {
          const transformBefore = (hits) => hits.filter(pred);
          const render = (hit) => <HitComponent hit={hit} />;
          return function HitList({ hits }) {
            useRenderHits({ hits, transformBefore, render });
          };
        }
      `,
      },
      // Valid: an HOC, with the helper written as a function declaration rather
      // than a const
      {
        code: `
        export function withHits(Inner) {
          function renderHit(hit) {
            return <Inner hit={hit} />;
          }
          return function HitList({ hits }) {
            useRenderHits({ hits, render: renderHit });
          };
        }
      `,
      },
      // Valid: a describe-scope helper consumed from a nested it. The helper is
      // created once for the whole suite, which is the idiomatic Jest spelling.
      {
        code: `
        describe('useRenderHits', () => {
          const renderHit = () => null;
          it('a', () => {
            renderHook(() => useRenderHits({ hits: [], render: renderHit, isLoading: false }));
          });
          it('b', () => {
            renderHook(() => useRenderHits({ hits: [], render: renderHit, isLoading: true }));
          });
        });
      `,
      },
      // Valid: a custom hook body re-runs per render, but the helper it declares
      // is captured by the component closure created in that same run, so the
      // nested consumer never observes a previous identity
      {
        code: `
        export function useHitListFactory() {
          const transform = (hits) => hits.filter(h => h.isActive);
          return function HitList({ hits }) {
            useRenderHits({ hits, transformBefore: transform });
          };
        }
      `,
      },
      // Valid: the declaration sits in a BLOCK of the enclosing function rather
      // than its body — still outside the calling function
      {
        code: `
        function buildHitList(enabled) {
          if (enabled) {
            const transform = (hits) => hits.filter(h => h.isActive);
            return ({ hits }) => {
              useRenderHits({ hits, transformBefore: transform });
            };
          }
          return null;
        }
      `,
      },
      // Valid: a class-method factory reaches the same verdict as a plain one —
      // the method is the enclosing function, the returned component is not
      {
        code: `
        class HitListFactory {
          build() {
            const renderHit = (hit) => <HitComponent hit={hit} />;
            return function HitList({ hits }) {
              useRenderHits({ hits, render: renderHit });
            };
          }
        }
      `,
      },
    ],
    invalid: [
      // Invalid: transformBefore not memoized
      {
        code: `
        useRenderHits({
          hits,
          transformBefore: (hits) => hits.filter(h => h.isActive),
          render: useCallback((hit) => <HitComponent hit={hit} />, []),
        });
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: render not memoized
      {
        code: `
        useRenderHits({
          hits,
          transformBefore: useCallback((hits) => hits.filter(h => h.isActive), []),
          render: (hit) => <HitComponent hit={hit} />,
        });
      `,
        errors: [{ messageId: 'requireMemoizedRender' }],
      },
      // Invalid: direct component in render
      {
        code: `
        useRenderHits({
          hits,
          transformBefore: useCallback((hits) => hits.filter(h => h.isActive), []),
          render: HitComponent,
        });
      `,
        errors: [{ messageId: 'noDirectComponentInRender' }],
      },
      // Invalid: renderHits not in useMemo/useCallback
      {
        code: `
        const result = renderHits(hits, (hit) => <HitComponent hit={hit} />);
      `,
        errors: [{ messageId: 'requireMemoizedRenderHits' }],
      },
      // Invalid: nested renderHits not in useMemo/useCallback
      {
        code: `
        function renderResults(hits) {
          return renderHits(hits, (hit) => <HitComponent hit={hit} />);
        }
      `,
        errors: [{ messageId: 'requireMemoizedRenderHits' }],
      },
      // Invalid: aliased import with unmemoized props
      {
        code: `
        import { useRenderHits as customHook } from '@/hooks/algolia/useRenderHits';
        customHook({
          hits,
          transformBefore: hits => hits,
          render: hit => <Hit hit={hit} />,
        });
      `,
        errors: [
          { messageId: 'requireMemoizedTransformBefore' },
          { messageId: 'requireMemoizedRender' },
        ],
      },
      // Invalid: complex nested structure without memoization
      {
        code: `
        const Component = () => {
          function complexTransform(hits) {
            return hits.map(hit => ({
              ...hit,
              score: calculateScore(hit)
            }));
          }

          useRenderHits({
            hits,
            transformBefore: complexTransform,
            render: useCallback((hit) => <Hit hit={hit} />, []),
          });
        };
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: multiple unmemoized props
      {
        code: `
        useRenderHits({
          hits,
          transformBefore: hits => hits.filter(Boolean),
          render: hit => <Hit hit={hit} />,
        });
      `,
        errors: [
          { messageId: 'requireMemoizedTransformBefore' },
          { messageId: 'requireMemoizedRender' },
        ],
      },
      // Invalid: renderHits in async function without memoization
      {
        code: `
        async function fetchAndRender() {
          const hits = await fetchHits();
          return renderHits(hits, hit => <Hit hit={hit} />);
        }
      `,
        errors: [{ messageId: 'requireMemoizedRenderHits' }],
      },
      // Invalid: renderHits in class method
      {
        code: `
        class HitsRenderer {
          render(hits) {
            return renderHits(hits, hit => <Hit hit={hit} />);
          }
        }
      `,
        errors: [{ messageId: 'requireMemoizedRenderHits' }],
      },
      // Invalid: direct component with props spread
      {
        code: `
        useRenderHits({
          hits,
          transformBefore: useCallback(hits => hits, []),
          render: props => <HitComponent {...props} />,
        });
      `,
        errors: [{ messageId: 'requireMemoizedRender' }],
      },
      // Invalid: nested renderHits in conditional
      {
        code: `
        function render(hits) {
          if (hits.length > 0) {
            return renderHits(hits, hit => <Hit hit={hit} />);
          }
          return null;
        }
      `,
        errors: [{ messageId: 'requireMemoizedRenderHits' }],
      },
      // Invalid: importing useLatestCallback is not a file-wide amnesty — an
      // unwrapped renderHits in the same file still reports
      {
        code: `
        import useLatestCallback from 'use-latest-callback';

        const memoized = useLatestCallback(() => renderHits(hits, hit => <Hit hit={hit} />));
        const stray = renderHits(hits, hit => <Hit hit={hit} />);
      `,
        errors: [{ messageId: 'requireMemoizedRenderHits' }],
      },
      // Invalid: an arbitrary wrapper from another module stabilizes nothing
      {
        code: `
        import wrap from './wrap';

        const result = wrap(() => renderHits(hits, hit => <Hit hit={hit} />));
      `,
        errors: [{ messageId: 'requireMemoizedRenderHits' }],
      },
      // Invalid: a type-only import binds no value, so its local name is not a
      // callable memoization boundary
      {
        code: `
        import type ULC from 'use-latest-callback';

        const result = ULC(() => renderHits(hits, hit => <Hit hit={hit} />));
      `,
        errors: [{ messageId: 'requireMemoizedRenderHits' }],
      },
      // Invalid: useLatestCallback on render does not excuse an unmemoized
      // transformBefore beside it
      {
        code: `
        import useLatestCallback from 'use-latest-callback';

        useRenderHits({
          hits,
          transformBefore: (hits) => hits.filter(Boolean),
          render: useLatestCallback((hit) => <Hit hit={hit} />),
        });
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: a component-scope const is rebuilt on every render, which is
      // the whole point of the rule. The module-scope carve-out keys on where
      // the declaration lives, not on the prop being a bare identifier.
      {
        code: `
        const Component = ({ hits }) => {
          const transform = (hits) => hits.filter(h => h.isActive);
          const renderHit = (hit) => <HitComponent hit={hit} />;
          useRenderHits({ hits, transformBefore: transform, render: renderHit });
        };
      `,
        errors: [
          { messageId: 'requireMemoizedTransformBefore' },
          { messageId: 'requireMemoizedRender' },
        ],
      },
      // Invalid: a module-scope declaration is not a file-wide amnesty — an
      // inline arrow beside it is still recreated every render
      {
        code: `
        const renderHit = (hit) => <HitComponent hit={hit} />;

        const Component = ({ hits }) => {
          useRenderHits({
            hits,
            transformBefore: (hits) => hits.filter(h => h.isActive),
            render: renderHit,
          });
        };
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: a top-level `let` is reassignable, so the binding can hand
      // useRenderHits a different function on a later render
      {
        code: `
        let transform = (hits) => hits.filter(h => h.isActive);

        const Component = ({ hits }) => {
          useRenderHits({
            hits,
            transformBefore: transform,
            render: useCallback((hit) => <HitComponent hit={hit} />, []),
          });
        };
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: a const declared in a nested block binds to that block, not to
      // the module, so it is re-created every time the block runs
      {
        code: `
        const Component = ({ hits, enabled }) => {
          if (enabled) {
            const transform = (hits) => hits.filter(h => h.isActive);
            useRenderHits({
              hits,
              transformBefore: transform,
              render: useCallback((hit) => <HitComponent hit={hit} />, []),
            });
          }
        };
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: a module-scope component is still a component — stability does
      // not make passing one directly to render acceptable
      {
        code: `
        const HitComponent = (props) => <div {...props} />;

        const Component = ({ hits }) => {
          useRenderHits({
            hits,
            transformBefore: useCallback((hits) => hits, []),
            render: HitComponent,
          });
        };
      `,
        errors: [{ messageId: 'noDirectComponentInRender' }],
      },
      // Invalid: a type-only import binds no value at module scope, so its
      // local name is not a stable function
      {
        code: `
        import type { transform } from './transform';

        const Component = ({ hits }) => {
          useRenderHits({
            hits,
            transformBefore: transform,
            render: useCallback((hit) => <HitComponent hit={hit} />, []),
          });
        };
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: a component parameter is per-render data no matter that the
      // component itself is declared at module scope
      {
        code: `
        const Component = ({ hits, transform }) => {
          useRenderHits({
            hits,
            transformBefore: transform,
            render: useCallback((hit) => <HitComponent hit={hit} />, []),
          });
        };
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: shorthand props are the spelling idiomatic code reaches for
      // first — a variable named after the prop it fills — and both of these are
      // rebuilt on every render. Exempting the shorthand form left the rule's
      // central case unreportable (issue #1588).
      {
        code: `
        const Component = ({ hits }) => {
          const transformBefore = (hits) => hits.filter(h => h.isActive);
          const render = (hit) => <HitComponent hit={hit} />;
          useRenderHits({ hits, transformBefore, render });
        };
      `,
        errors: [
          { messageId: 'requireMemoizedTransformBefore' },
          { messageId: 'requireMemoizedRender' },
        ],
      },
      // Invalid: the two spellings mix freely inside one call, so neither can be
      // the only one the rule reads
      {
        code: `
        const Component = ({ hits }) => {
          const transformBefore = (hits) => hits.filter(Boolean);
          useRenderHits({
            hits,
            transformBefore,
            render: useCallback((hit) => <HitComponent hit={hit} />, []),
          });
        };
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: a component-scope function declaration is re-created on every
      // render exactly like an arrow, and shorthand hides nothing
      {
        code: `
        const Component = ({ hits }) => {
          function render(hit) {
            return <HitComponent hit={hit} />;
          }
          useRenderHits({ hits, render });
        };
      `,
        errors: [{ messageId: 'requireMemoizedRender' }],
      },
      // Invalid: a shorthand prop filled by a component parameter forwards a
      // value whose identity the caller decides, which is per-render data here —
      // the same verdict the written-out spelling already gets
      {
        code: `
        const Component = ({ hits, transformBefore, render }) => {
          useRenderHits({ hits, transformBefore, render });
        };
      `,
        errors: [
          { messageId: 'requireMemoizedTransformBefore' },
          { messageId: 'requireMemoizedRender' },
        ],
      },
      // Invalid: a top-level `let` can be reassigned between renders, so the
      // shorthand spelling of it is no more stable than the written-out one
      {
        code: `
        let render = (hit) => <HitComponent hit={hit} />;

        const Component = ({ hits }) => {
          useRenderHits({ hits, render });
        };
      `,
        errors: [{ messageId: 'requireMemoizedRender' }],
      },
      // Invalid: a const declared in a nested block is re-created every time the
      // block runs, whichever spelling passes it on
      {
        code: `
        const Component = ({ hits, enabled }) => {
          if (enabled) {
            const transformBefore = (hits) => hits.filter(h => h.isActive);
            useRenderHits({ hits, transformBefore });
          }
        };
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: an aliased useRenderHits import reads shorthand props too
      {
        code: `
        import { useRenderHits as customHook } from '@/hooks/algolia/useRenderHits';

        const Component = ({ hits }) => {
          const transformBefore = (hits) => hits;
          const render = (hit) => <Hit hit={hit} />;
          customHook({ hits, transformBefore, render });
        };
      `,
        errors: [
          { messageId: 'requireMemoizedTransformBefore' },
          { messageId: 'requireMemoizedRender' },
        ],
      },
      // Invalid: the outer-scope carve-out is RELATIVE, so a declaration sharing
      // the calling function still reports even when that function is itself
      // nested inside a factory — the helpers are rebuilt on every HitList render
      {
        code: `
        export function createHitList() {
          return function HitList({ hits }) {
            const transform = (hits) => hits.filter(h => h.isActive);
            const renderHit = (hit) => <HitComponent hit={hit} />;
            useRenderHits({ hits, transformBefore: transform, render: renderHit });
          };
        }
      `,
        errors: [
          { messageId: 'requireMemoizedTransformBefore' },
          { messageId: 'requireMemoizedRender' },
        ],
      },
      // Invalid: a custom hook body re-runs on every render of its caller, so a
      // helper declared there and consumed by a useRenderHits call in that same
      // body is a fresh identity each pass
      {
        code: `
        export function useHitList(hits) {
          const transform = (hits) => hits.filter(h => h.isActive);
          const renderHit = (hit) => <HitComponent hit={hit} />;
          useRenderHits({ hits, transformBefore: transform, render: renderHit });
        }
      `,
        errors: [
          { messageId: 'requireMemoizedTransformBefore' },
          { messageId: 'requireMemoizedRender' },
        ],
      },
      // Invalid: a block INSIDE the calling function crosses no function
      // boundary, so the declaration is still per-render
      {
        code: `
        export function useHitList(hits, enabled) {
          if (enabled) {
            const transform = (hits) => hits.filter(h => h.isActive);
            const renderHit = (hit) => <HitComponent hit={hit} />;
            useRenderHits({ hits, transformBefore: transform, render: renderHit });
          }
        }
      `,
        errors: [
          { messageId: 'requireMemoizedTransformBefore' },
          { messageId: 'requireMemoizedRender' },
        ],
      },
      // Invalid: an outer-scope helper is not a file-wide amnesty — the inline
      // arrow beside it is still rebuilt on every render
      {
        code: `
        export function createHitList(pred) {
          const renderHit = (hit) => <HitComponent hit={hit} />;
          return function HitList({ hits }) {
            useRenderHits({
              hits,
              transformBefore: (hits) => hits.filter(pred),
              render: renderHit,
            });
          };
        }
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: an outer-scope `let` can be reassigned between renders of the
      // closure that captured it, so enclosing the calling function is not
      // enough on its own
      {
        code: `
        export function createHitList() {
          let transform = (hits) => hits.filter(h => h.isActive);
          return function HitList({ hits }) {
            useRenderHits({ hits, transformBefore: transform });
          };
        }
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
      // Invalid: an outer-scope component is still a component — stability never
      // makes passing one directly to render acceptable
      {
        code: `
        export function createHitList() {
          const HitComponent = (props) => <div {...props} />;
          return function HitList({ hits }) {
            useRenderHits({ hits, render: HitComponent });
          };
        }
      `,
        errors: [{ messageId: 'noDirectComponentInRender' }],
      },
      // Invalid: a parameter of the enclosing factory forwards a value whose
      // identity the CALLER decides, so it is memoized where it is created
      {
        code: `
        export function createHitList(transform) {
          return function HitList({ hits }) {
            useRenderHits({ hits, transformBefore: transform });
          };
        }
      `,
        errors: [{ messageId: 'requireMemoizedTransformBefore' }],
      },
    ],
  },
);

// use-latest-callback rewrites every useCallback into useLatestCallback and
// drops the dependency array. Both rules ship as 'error' in the recommended
// config, use-latest-callback is fixable, and ESLint re-lints until the output
// settles — so ONE `eslint --fix` invocation does both steps. If this rule
// cannot see the hook the fix lands on, correctly memoized code goes in and a
// demand to memoize it comes out, naming the very hook the sibling just
// removed: the config manufacturing an unfixable violation (issue #1585).
describe('enforce-render-hits-memoization vs use-latest-callback --fix', () => {
  const fixThenLint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/enforce-render-hits-memoization',
      enforceRenderHitsMemoization as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      'test/use-latest-callback',
      useLatestCallback as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: {
        'test/enforce-render-hits-memoization': 'error' as const,
        'test/use-latest-callback': 'error' as const,
      },
    };
    const { output } = linter.verifyAndFix(code, config, 'HitsList.tsx');
    return {
      output,
      messages: linter.verify(
        output,
        {
          ...config,
          rules: { 'test/enforce-render-hits-memoization': 'error' as const },
        },
        'HitsList.tsx',
      ),
    };
  };

  it('stays silent on a renderHits call the sibling fixer rewrites', () => {
    const { output, messages } = fixThenLint(
      `import { useCallback } from 'react';

function HitsList({ hits }) {
  const renderResults = useCallback(() => renderHits(hits, (hit) => <Hit hit={hit} />), [hits]);
  return <div>{renderResults()}</div>;
}`,
    );

    // Without this the test passes vacuously: an unrun sibling fixer leaves the
    // original useCallback, which this rule always accepted.
    expect(output).toContain('useLatestCallback');
    expect(output).not.toContain('useCallback(');
    expect(messages).toEqual([]);
  });

  it('stays silent on useRenderHits props the sibling fixer rewrites', () => {
    const { output, messages } = fixThenLint(
      `import { useCallback } from 'react';
import { useRenderHits } from '@/hooks/algolia/useRenderHits';

function HitsList({ hits }) {
  useRenderHits({
    hits,
    transformBefore: useCallback((items) => items.filter((h) => h.isActive), []),
    render: useCallback((hit) => <Hit hit={hit} />, []),
  });
  return null;
}`,
    );

    // The render prop returns JSX, which use-latest-callback leaves alone, so
    // only transformBefore crosses over — exactly the mixed state a real file
    // lands in after one --fix.
    expect(output).toContain('useLatestCallback(');
    expect(messages).toEqual([]);
  });

  it('stays silent under the suffixed name the sibling fixer falls back to', () => {
    const { output, messages } = fixThenLint(
      `import { useCallback } from 'react';
const useLatestCallback = 'taken';

function HitsList({ hits }) {
  const Row = useCallback((hit) => <Hit hit={hit} />, []);
  const renderResults = useCallback(() => renderHits(hits, Row), [hits, Row]);
  return <div>{useLatestCallback}{renderResults()}</div>;
}`,
    );

    // A name-only check would miss this: the hook arrives as useLatestCallback2
    // because the plain name is already bound in the file.
    expect(output).toContain('useLatestCallback2');
    expect(messages).toEqual([]);
  });

  it('still reports an unmemoized renderHits in the same fixed file', () => {
    const { output, messages } = fixThenLint(
      `import { useCallback } from 'react';

function HitsList({ hits }) {
  const renderResults = useCallback(() => renderHits(hits, (hit) => <Hit hit={hit} />), [hits]);
  const stray = renderHits(hits, (hit) => <Hit hit={hit} />);
  return <div>{renderResults()}{stray}</div>;
}`,
    );

    expect(output).toContain('useLatestCallback');
    expect(messages.map((message) => message.messageId)).toEqual([
      'requireMemoizedRenderHits',
    ]);
  });
});

// `object-shorthand: ['error', 'always']` is a core, fixable rule that consumers
// enable alongside this one. It rewrites `{ transformBefore: transformBefore }`
// into `{ transformBefore }`, so a rule that reads only the written-out spelling
// loses every report about a prop whose variable is named after it — the shape
// idiomatic code reaches for first — after a single `eslint --fix` (issue #1588).
describe('enforce-render-hits-memoization vs object-shorthand --fix', () => {
  const fixThenLint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/enforce-render-hits-memoization',
      enforceRenderHitsMemoization as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: {
        'test/enforce-render-hits-memoization': 'error' as const,
        'object-shorthand': ['error', 'always'] as ['error', 'always'],
      },
    };
    const { output } = linter.verifyAndFix(code, config, 'HitsList.tsx');
    return {
      output,
      messages: linter.verify(
        output,
        {
          ...config,
          rules: { 'test/enforce-render-hits-memoization': 'error' as const },
        },
        'HitsList.tsx',
      ),
    };
  };

  it('keeps reporting unmemoized props after they are rewritten to shorthand', () => {
    const { output, messages } = fixThenLint(
      `function HitsList({ hits }) {
  const transformBefore = (items) => items.filter((h) => h.isActive);
  const render = (hit) => <Hit hit={hit} />;
  useRenderHits({ hits, transformBefore: transformBefore, render: render });
  return null;
}`,
    );

    // Without this the test passes vacuously: an unrun sibling fixer leaves the
    // written-out spelling, which the rule always read.
    expect(output).toContain('{ hits, transformBefore, render }');
    expect(messages.map((message) => message.messageId)).toEqual([
      'requireMemoizedTransformBefore',
      'requireMemoizedRender',
    ]);
  });

  it('stays silent on memoized props the same rewrite touches', () => {
    const { output, messages } = fixThenLint(
      `import { useCallback } from 'react';

function HitsList({ hits }) {
  const transformBefore = useCallback((items) => items.filter((h) => h.isActive), []);
  const render = useCallback((hit) => <Hit hit={hit} />, []);
  useRenderHits({ hits, transformBefore: transformBefore, render: render });
  return null;
}`,
    );

    expect(output).toContain('{ hits, transformBefore, render }');
    expect(messages).toEqual([]);
  });
});

// no-empty-dependency-use-callbacks hoists a dependency-free callback out of
// the component to module scope and drops the hook entirely. It is 'error' in
// the same recommended config and fixable, so one `eslint --fix` turns a
// correctly memoized useRenderHits prop into a bare module-scope const. If this
// rule does not accept module scope as a memoization boundary, clean code goes
// in and a demand to re-add the hook the sibling just deleted comes out — and
// following that demand only feeds the hoister again (issue #1586).
describe('enforce-render-hits-memoization vs no-empty-dependency-use-callbacks --fix', () => {
  const fixThenLint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/enforce-render-hits-memoization',
      enforceRenderHitsMemoization as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      'test/no-empty-dependency-use-callbacks',
      noEmptyDependencyUseCallbacks as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: {
        'test/enforce-render-hits-memoization': 'error' as const,
        'test/no-empty-dependency-use-callbacks': 'error' as const,
      },
    };
    const { output } = linter.verifyAndFix(code, config, 'HitsList.tsx');
    return {
      output,
      messages: linter.verify(
        output,
        {
          ...config,
          rules: { 'test/enforce-render-hits-memoization': 'error' as const },
        },
        'HitsList.tsx',
      ),
    };
  };

  const HOISTABLE = `import { useCallback } from 'react';
import { useRenderHits } from '@/hooks/algolia/useRenderHits';

const renderHit = (hit) => <Hit hit={hit} />;

function HitsList({ hits }) {
  const transform = useCallback((items) => items.filter((h) => h.isActive), []);
  useRenderHits({ hits, transformBefore: transform, render: renderHit });
  return null;
}`;

  it('stays silent on a transformBefore the sibling fixer hoists to module scope', () => {
    const { output, messages } = fixThenLint(HOISTABLE);

    // Without these the test passes vacuously: an unrun sibling fixer leaves
    // the original useCallback, which this rule always accepted. The hook has
    // to be GONE and the declaration has to sit at column 0.
    expect(output).not.toContain('useCallback(');
    expect(output).toMatch(/^const transform = /m);
    expect(messages).toEqual([]);
  });

  it('still reports a genuinely unstable inline arrow in the same fixed file', () => {
    const { output, messages } = fixThenLint(
      HOISTABLE.replace(
        '  return null;',
        `  useRenderHits({
    hits,
    transformBefore: (items) => items.filter((h) => h.isNew),
    render: renderHit,
  });
  return null;`,
      ),
    );

    expect(output).not.toContain('useCallback(');
    expect(output).toMatch(/^const transform = /m);
    expect(messages.map((message) => message.messageId)).toEqual([
      'requireMemoizedTransformBefore',
    ]);
  });

  it('still reports a component-scope const the sibling fixer cannot hoist', () => {
    // Reading a prop pins the callback to the component, so no fixer moves it
    // and the report the rule exists to make must survive untouched.
    const code = `import { useRenderHits } from '@/hooks/algolia/useRenderHits';

const renderHit = (hit) => <Hit hit={hit} />;

function HitsList({ hits, minScore }) {
  const transform = (items) => items.filter((h) => h.score > minScore);
  useRenderHits({ hits, transformBefore: transform, render: renderHit });
  return null;
}`;
    const { output, messages } = fixThenLint(code);

    expect(output).toBe(code);
    expect(messages.map((message) => message.messageId)).toEqual([
      'requireMemoizedTransformBefore',
    ]);
  });
});
