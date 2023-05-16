/**
 * @fileoverview Disallow async callbacks for Array.filter
 * @author
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require('../../../lib/rules/no-async-array-filter'),
  RuleTester = require('eslint').RuleTester;

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester({ parserOptions: { ecmaVersion: 2020 } });
ruleTester.run('no-async-array-filter', rule, {
  valid: [
    `['a'].filter((x) => true)`,
    `['a'].filter(function (x) {
      return true
    })`,
  ],

  invalid: [
    {
      code: `['a'].filter(async (x) => true)`,
      errors: [
        {
          message:
            'Async array filter is dangerous as a Promise object will always be truthy',
        },
      ],
    },
    {
      code: `['a'].filter(async function(x) {
        return true
      })`,
      errors: [
        {
          message:
            'Async array filter is dangerous as a Promise object will always be truthy',
        },
      ],
    },
  ],
});
