/**
 * @fileoverview Enforces pinned dependencies
 * @author Brodie McGuire
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require('../../../lib/rules/no-unpinned-dependencies'),
  RuleTester = require('eslint').RuleTester;

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester({
  parser: require.resolve('jsonc-eslint-parser'),
  parserOptions: {
    ecmaVersion: 2020,
  },
});
ruleTester.run('no-unpinned-dependencies', rule, {
  valid: [`{dependencies: {eslint: "8.19.0"}}`],

  invalid: [
    {
      code: '{dependencies: {eslint: "^8.19.0"}}',
      errors: [
        {
          message: `Dependency "eslint" should be pinned to a specific version, but "^8.19.0" was found.`,
        },
      ],
    },
    {
      code: `{dependencies: {eslint: "~8.19.0"}}`,
      errors: [
        {
          message: `Dependency "eslint" should be pinned to a specific version, but "~8.19.0" was found.`,
        },
      ],
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
          "requireindex": "^1.2.0"
        },
        "devDependencies": {
          "eslint-doc-generator": "~1.0.0",
        },
        "license": "ISC"
      }
      `,
      errors: [
        {
          message: `Dependency "requireindex" should be pinned to a specific version, but "^1.2.0" was found.`,
        },
        {
          message: `Dependency "eslint-doc-generator" should be pinned to a specific version, but "~1.0.0" was found.`,
        },
      ],
    },
  ],
});
