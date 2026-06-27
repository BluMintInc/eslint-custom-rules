/**
 * Conventional scopes permitted on `fix`/`feat` commits that are NOT a single
 * rule name — genuinely cross-cutting changes that still warrant a release.
 * Kept deliberately small: a rule fix MUST scope to its rule so the release
 * manifest can re-enable it by exact name.
 *
 * Shared by the commitlint scope rule (commit-msg hook) and the CI scope
 * validator so the two enforcement points never drift.
 */
const ALLOWED_NON_RULE_SCOPES = ['deps'];

module.exports = { ALLOWED_NON_RULE_SCOPES };
