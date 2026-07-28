/**
 * Fixture for issue #1316: the shape this plugin's own `prefer-next-dynamic`
 * autofix manufactures. The zero-parameter loader arrow is not the component,
 * and `dynamic()` forwards the loaded component's whole props surface.
 */
import dynamic from 'next/dynamic';

export const DynamicChild = dynamic(() => import('./ChildWithProps'), {
  ssr: false,
});
