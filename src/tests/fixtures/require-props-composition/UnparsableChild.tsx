/**
 * Fixture for issue #1316: a resolved child module that CANNOT be parsed (the
 * JSX attribute below is never closed). A file that fails to parse proves
 * nothing about its exported binding's parameter list, so the child must stay a
 * composition dependency rather than be silently dropped.
 *
 * Deliberately invalid syntax. The fixture directory is excluded from tsconfig
 * and .eslintignore, so neither `npm run build` nor `eslint ./src` reads it.
 */
export const UnparsableChild = () => {
  return <div className={ />;
};
