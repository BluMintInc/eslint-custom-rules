import { enforcePositiveNaming } from '../rules/enforce-positive-naming';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run(
  'enforce-positive-naming-config-files',
  enforcePositiveNaming,
  {
    valid: [
      // Files starting with dot should be ignored
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
      {
        code: `
        module.exports = {
          presets: ['@babel/preset-env'],
          disableCache: true,
          ignoredPackages: ['lodash']
        };
      `,
        filename: '.babelrc.js',
      },

      // Files containing .config should be ignored
      {
        code: `
        module.exports = {
          entry: './src/index.js',
          excludedModules: ['node_modules'],
          disableSourceMaps: true
        };
      `,
        filename: 'webpack.config.js',
      },
      {
        code: `
        module.exports = {
          invalidOptions: true,
          notAllowed: ['feature1']
        };
      `,
        filename: 'jest.config.js',
      },

      // Files with rc suffix should be ignored
      {
        code: `
        module.exports = {
          extends: ["eslint:recommended"],
          disabledRules: ["no-console"]
        };
      `,
        filename: '.eslintrc',
      },
      {
        code: `
        module.exports = {
          presets: ["@babel/preset-env"],
          disableCache: true
        };
      `,
        filename: '.prettierrc',
      },

      // Non-TS/TSX files should be ignored
      {
        code: `
        function isNotAllowed() {
          return false;
        }
      `,
        filename: 'script.js',
      },
      {
        code: `
        function Component() {
          const isDisabled = true;
          return "This is a component";
        }
      `,
        filename: 'component.vue',
      },

      // Non-boolean variables with negative-sounding names should be valid
      {
        code: `
        const disabledFeatures: string[] = ['feature1', 'feature2'];
      `,
        filename: 'src/features.ts',
      },
    ],
    invalid: [
      // Boolean variable with negative naming should be flagged
      {
        code: `
        const isNotAllowed: boolean = false;
      `,
        filename: 'src/component.ts',
        errors: [
          {
            messageId: 'avoidNegativeNaming',
          },
        ],
      },
      // Boolean function with negative naming should be flagged
      {
        code: `
        const isNotAllowed = (): boolean => false;
      `,
        filename: 'src/component.tsx',
        errors: [
          {
            messageId: 'avoidNegativeNaming',
          },
        ],
      },
    ],
  },
);
