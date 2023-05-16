/**
 * @fileoverview Custom eslint rules for use at BluMint
 * @author Brodie McGuire
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const requireIndex = require('requireindex');

//------------------------------------------------------------------------------
// Plugin Definition
//------------------------------------------------------------------------------

module.exports = {
  meta: {
    name: 'eslint-plugin-blumint',
    version: '0.0.1',
  },
  parseOptions: {
    ecmaVersion: 2020,
  },
};

// import all rules in lib/rules
module.exports.rules = requireIndex(__dirname + '/rules');
