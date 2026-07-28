/**
 * Fixture for issue #1316 (reopened): a relatively-imported child that takes no
 * props at all, so no BestOfTextProps can exist for a parent to compose with.
 */
export const BestOfText = () => {
  return <div />;
};
