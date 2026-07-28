/**
 * Fixture for issue #1316: `lazy()` forwards the loaded component's ENTIRE props
 * surface, so the zero-parameter loader arrow says nothing about the child's
 * props. Unwrapping this call would drop a child that really takes props.
 */
import { lazy } from 'react';

export const LazyChild = lazy(() => import('./ChildWithProps'));
