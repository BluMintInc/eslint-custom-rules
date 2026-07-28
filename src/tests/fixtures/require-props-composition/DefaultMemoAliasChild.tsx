/**
 * Fixture for issue #1316: `export default memo(<Identifier>)`. memo is
 * props-preserving and the identifier resolves to a zero-parameter component in
 * the same module, so the default binding is provably prop-less.
 */
import { memo } from 'react';

const DefaultMemoAliasChildUnmemoized = () => {
  return <div />;
};

export default memo(DefaultMemoAliasChildUnmemoized);
