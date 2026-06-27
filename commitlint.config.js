/* eslint-disable @typescript-eslint/no-var-requires */
const { loadRuleNames } = require('./scripts/load-rule-names');
const {
  ALLOWED_NON_RULE_SCOPES,
} = require('./scripts/allowed-non-rule-scopes');

/** Conventional types that bump a release and therefore feed release-manifest.json. */
const RELEASE_TYPES = new Set(['fix', 'feat']);
/** Valid scopes for a fix/feat commit: every rule name + the cross-cutting allowlist. */
const RULE_SCOPES = new Set([...loadRuleNames(), ...ALLOWED_NON_RULE_SCOPES]);

/**
 * A `fix`/`feat` commit's scope MUST be a real rule name (or an allowlisted
 * cross-cutting scope). The release-manifest generator keys re-enable signals
 * off the scope and agora re-enables OFF rules by exact rule name — a missing or
 * typo'd scope would silently drop a fixed rule from the manifest or invent one.
 * commitlint's default ignores (merge/revert commits) keep this off the hot path.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'blumint-rule-scope': ({ type, scope }) => {
          if (!RELEASE_TYPES.has(type)) {
            return [true];
          }
          if (!scope) {
            return [
              false,
              `"${type}" commits must declare a scope equal to the rule name they change (e.g. "${type}(no-margin-properties): ...") so release-manifest.json can re-enable it`,
            ];
          }
          if (!RULE_SCOPES.has(scope)) {
            return [
              false,
              `commit scope "${scope}" is not a known rule name; "${type}" commits must scope to exactly one rule (cross-cutting exceptions: ${ALLOWED_NON_RULE_SCOPES.join(
                ', ',
              )})`,
            ];
          }
          return [true];
        },
      },
    },
  ],
  rules: {
    'blumint-rule-scope': [2, 'always'],
  },
};
