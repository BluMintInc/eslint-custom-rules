/**
 * Fixture for issue #1316: `export default memo(() => …)`. The wrapped function
 * is written INLINE rather than aliased, and memo hands its props surface
 * through unchanged, so the zero-parameter arrow proves the default binding
 * prop-less.
 */
import { memo } from 'react';

export default memo(() => {
  return <div />;
});
