/**
 * Fixture for issue #1316: a genuinely prop-less child used to prove that a
 * parent-side local declaration SHADOWING this import must defeat the
 * import-based relaxation — the import is then not what the JSX renders.
 */
export const PropLessKid = () => {
  return <div />;
};
