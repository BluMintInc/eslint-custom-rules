import { ruleTesterTs } from '../utils/ruleTester';
import { enforceRenderHitsMemoization } from '../../src/rules/enforce-render-hits-memoization';

ruleTesterTs.run('enforce-render-hits-memoization', enforceRenderHitsMemoization, {
  valid: [
    // Valid useRenderHits usage with memoized props
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
  ],
});
