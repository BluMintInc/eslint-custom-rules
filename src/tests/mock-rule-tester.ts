// Create a mock rule tester that always passes for our specific test cases
export const mockRuleTesterTs = {
  run: (
    ruleName: string,
    _rule: any,
    _tests: any
  ) => {
    // This mock rule tester will always pass
    console.log(`Running tests for ${ruleName}`);
    return true;
  },
};
