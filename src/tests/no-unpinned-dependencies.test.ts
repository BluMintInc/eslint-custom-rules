import { noUnpinnedDependencies } from '../rules/no-unpinned-dependencies';
import { Rule } from 'eslint';
import { ruleTesterJson } from '../utils/ruleTester';

ruleTesterJson.run(
  'no-unpinned-dependencies',
  noUnpinnedDependencies as unknown as Rule.RuleModule,
  {
    valid: [`{dependencies: {eslint: "8.19.0"}}`],
    invalid: [
      {
        code: '{dependencies: {eslint: "^8.19.0"}}',
        errors: [
          {
            messageId: 'unexpected',
          },
        ],
        output: '{dependencies: {eslint: "8.19.0"}}',
      },
      {
        code: `{dependencies: {eslint: "~8.19.0"}}`,
        errors: [
          {
            messageId: 'unexpected',
          },
        ],
        output: '{dependencies: {eslint: "8.19.0"}}',
      },
      {
        code: `{
            "name": "eslint-plugin-blumint",
            "version": "0.0.0",
            "description": "Custom eslint rules for use at BluMint",
            "keywords": [
              "eslint",
              "eslintplugin",
              "eslint-plugin"
            ],
            "author": "Brodie McGuire",
            "main": "./lib/index.js",
            "exports": "./lib/index.js",
            "scripts": {
              "update:eslint-docs": "eslint-doc-generator"
            },
            "dependencies": {
              "requireindex": "^1.2.3"
            },
            "devDependencies": {
              "eslint-doc-generator": "~4.5.6",
            },
            "license": "ISC"
          }
          `,
        errors: [
          {
            messageId: 'unexpected',
          },
          {
            messageId: 'unexpected',
          },
        ],
        output: `{
            "name": "eslint-plugin-blumint",
            "version": "0.0.0",
            "description": "Custom eslint rules for use at BluMint",
            "keywords": [
              "eslint",
              "eslintplugin",
              "eslint-plugin"
            ],
            "author": "Brodie McGuire",
            "main": "./lib/index.js",
            "exports": "./lib/index.js",
            "scripts": {
              "update:eslint-docs": "eslint-doc-generator"
            },
            "dependencies": {
              "requireindex": "1.2.3"
            },
            "devDependencies": {
              "eslint-doc-generator": "4.5.6",
            },
            "license": "ISC"
          }
          `,
      },
    ],
  },
);
