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
            message:
              "Dependency 'eslint' is declared with the range '^8.19.0'. Ranges let package managers pull newer releases outside code review, which breaks reproducible installs and can hide breaking changes. Pin to an exact version like '8.19.0' (no ^ or ~) so dependency updates stay intentional and auditable.",
          },
        ],
        output: '{dependencies: {eslint: "8.19.0"}}',
      },
      {
        code: `{dependencies: {eslint: "~8.19.0"}}`,
        errors: [
          {
            message:
              "Dependency 'eslint' is declared with the range '~8.19.0'. Ranges let package managers pull newer releases outside code review, which breaks reproducible installs and can hide breaking changes. Pin to an exact version like '8.19.0' (no ^ or ~) so dependency updates stay intentional and auditable.",
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
            message:
              "Dependency 'requireindex' is declared with the range '^1.2.3'. Ranges let package managers pull newer releases outside code review, which breaks reproducible installs and can hide breaking changes. Pin to an exact version like '1.2.3' (no ^ or ~) so dependency updates stay intentional and auditable.",
          },
          {
            message:
              "Dependency 'eslint-doc-generator' is declared with the range '~4.5.6'. Ranges let package managers pull newer releases outside code review, which breaks reproducible installs and can hide breaking changes. Pin to an exact version like '4.5.6' (no ^ or ~) so dependency updates stay intentional and auditable.",
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
