import { ruleTesterTs } from '../utils/ruleTester';
import { enforceRenderHitsMemoization } from '../../src/rules/enforce-render-hits-memoization';

ruleTesterTs.run('enforce-render-hits-memoization', enforceRenderHitsMemoization, {
  valid: [
    // Basic valid useRenderHits usage with memoized props
    {
      code: `
        const transformBefore = useCallback((hits) => hits.filter(h => h.isActive), []);
        const render = useCallback((hit) => <HitComponent hit={hit} />, []);
        useRenderHits({ hits, transformBefore, render });
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

        const transformBefore = useCallback((hits) => hits.filter(h => h.isActive), []);
        const render = useCallback((hit) => <HitComponent hit={hit} />, []);
        customHook({ hits, transformBefore, render });

        const result = useMemo(() => customRender(hits, render), [hits, render]);
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
        const transformBefore=useCallback(
          // Filter active hits
          (hits)=>hits.filter(h=>h.isActive)
          /* No dependencies needed */
          ,[]
        );const render=useCallback((hit)=><HitComponent hit={hit}/>,[]
        );useRenderHits({hits,transformBefore,render});
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
        const render = useCallback(
          (hit) => <MemoizedHitComponent hit={hit} />,
          []
        );
        useRenderHits({ hits, transformBefore, render });
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
  ],
});
