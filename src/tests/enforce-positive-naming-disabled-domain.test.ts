import { enforcePositiveNaming } from '../rules/enforce-positive-naming';
import { ruleTesterTs } from '../utils/ruleTester';

// Regression guard for #1261: "disabled" is a single English adjective and the
// native HTML/React/MUI prop name. Its leading "dis" is a bound morpheme, not a
// separable negation of "abled", so identifiers built on it must not be flagged
// (the rule previously suggested the non-word "isAbled"). Same class as the
// dispute (#772), display (#634), integer (#859), and interactions (#569) fixes.
ruleTesterTs.run(
  'enforce-positive-naming-disabled-domain',
  enforcePositiveNaming,
  {
    valid: [
      { code: 'const isDisabled = true;' },
      {
        code: 'function toggle(isDisabled: boolean) { return isDisabled; }',
      },
      { code: 'const state = { isDisabled: true };' },
      { code: 'interface ButtonProps { isDisabled: boolean }' },
      { code: 'type ButtonProps = { isDisabled: boolean };' },
      { code: 'class Button { get isDisabled() { return true; } }' },
      // The compound must also pass — "disabled" mid-name is still the word.
      { code: 'const isDisabledByAdmin = true;' },
      // The bare verb/noun forms of the family are valid too.
      { code: 'function disable() {}' },
      { code: 'const disabling = true;' },
      { code: 'const disables = 1;' },
    ],
    invalid: [
      // Guardrail: a genuine "dis" double-negation stays flagged.
      {
        code: 'const isDisallowed = true;',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
    ],
  },
);
