import { enforcePositiveNaming } from '../rules/enforce-positive-naming';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('enforce-positive-naming-eslintrc', enforcePositiveNaming, {
  valid: [
    // Test the specific bug case mentioned in the issue
    {
      code: `
        module.exports = {
          rules: {
            "some-rule": "error",
            "excludedFiles": ["test/**", "scripts/**"]
          }
        };
      `,
      filename: '.eslintrc.js',
    },
  ],
  invalid: [],
});
