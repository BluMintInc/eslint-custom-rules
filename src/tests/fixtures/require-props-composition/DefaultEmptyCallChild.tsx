/**
 * Fixture for issue #1316: a default export whose wrapper call has NO argument
 * to inspect. Even though the callee is props-preserving, there is no wrapped
 * function, so nothing about the binding's parameter list is knowable and the
 * child must stay a composition dependency.
 */
import { memo } from 'react';

export default memo();
