/**
 * Fixture for issue #1316: the default-export form of the `lazy()` trap. The
 * default binding forwards the loaded component's whole props surface.
 */
import { lazy } from 'react';

export default lazy(() => import('./ChildWithProps'));
