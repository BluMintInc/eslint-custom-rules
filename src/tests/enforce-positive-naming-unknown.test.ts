import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

// Issue #1281: two defects in enforce-positive-naming.
// 1. Primary false positive: `unknown` was treated as `un` + `known` and
//    flagged. `unknown` is a single positive-form English adjective (an
//    epistemic "not-yet-determined" state), not a constructed double-negative,
//    and belongs alongside the whitelisted `unique`/`union`/`understand`.
// 2. Secondary broken suggestion: for the `has`/`can`/`should`/`will`/`does`
//    boolean prefixes, an unmapped negative prefix emitted the literal
//    placeholder "a positive alternative" instead of a real name.
ruleTesterTs.run('enforce-positive-naming', enforcePositiveNaming, {
  valid: [
    // `unknown` must not be flagged on any boolean prefix or declaration form.
    { code: 'const isUnknown = true;' },
    { code: 'const hasUnknownData = false;' },
    { code: 'const hasUnknownLabels: boolean = true;' },
    { code: 'const unknowns = new Set();' },
    {
      code: `
        type RoundLabelProps = {
          hasUnknownTotalRounds: boolean;
        };
        function resolveRoundLabel({ hasUnknownTotalRounds }: RoundLabelProps) {
          const hasUnknownLabels = hasUnknownTotalRounds;
          return hasUnknownLabels;
        }
      `,
    },
    // The pre-existing `unknown`-family exceptions must remain unaffected.
    { code: 'const isUnique = true;' },
    { code: 'function understand() { return true; }' },
  ],
  invalid: [
    // Guardrail: genuine double-negatives must STILL fire after the exception.
    {
      code: 'const isNotReady = true;',
      errors: [{ messageId: 'avoidNegativeNaming' }],
    },
    // Secondary defect: a `has`-prefixed negative with an unmapped prefix must
    // now yield a real suggestion, not the "a positive alternative" placeholder.
    {
      code: 'const hasUnavailableItems = false;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'hasUnavailableItems',
            alternatives: 'hasAvailableItems',
          },
        },
      ],
    },
    // `should`-prefixed negative → real suggestion.
    {
      code: 'const shouldUnfollowUser = false;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'shouldUnfollowUser',
            alternatives: 'shouldFollowUser',
          },
        },
      ],
    },
    // `will`-prefixed negative → real suggestion.
    {
      code: 'const willUninstallPackages = false;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'willUninstallPackages',
            alternatives: 'willInstallPackages',
          },
        },
      ],
    },
    // `does`-prefixed negative → real suggestion.
    {
      code: 'const doesUnsetValue = false;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'doesUnsetValue',
            alternatives: 'doesSetValue',
          },
        },
      ],
    },
    // Mapped `has` negative (hasNo) must keep producing its real suggestion.
    {
      code: 'const hasNoAccess = false;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'hasNoAccess',
            alternatives: 'hasAccess',
          },
        },
      ],
    },
  ],
});
