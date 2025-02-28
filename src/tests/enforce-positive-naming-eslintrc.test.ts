import { enforcePositiveNaming } from '../rules/enforce-positive-naming';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('enforce-positive-naming-eslintrc', enforcePositiveNaming, {
  valid: [
    // Test the specific bug case mentioned in the issue
    // Config files should be ignored
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
    // Another config file with negative-sounding names should be ignored
    {
      code: `
        module.exports = {
          rules: {
            "no-invalid-code": "error",
            "disabledRules": ["no-console"]
          }
        };
      `,
      filename: '.eslintrc.js',
    },
  ],
  invalid: [],
});
