/**
 * Conventional scopes permitted on `fix`/`feat` commits that are NOT a single
 * rule name — genuinely cross-cutting changes that still warrant a release.
 * Kept deliberately small: a rule fix MUST scope to its rule so the release
 * manifest can re-enable it by exact name.
 *
 * Shared by the commitlint scope rule (commit-msg hook) and the CI scope
 * validator so the two enforcement points never drift.
 *
 * A shared fixer helper earns a place here only when one edit to it changes
 * what several rules EMIT, so no single rule name describes the change
 * honestly. The manifest skips these scopes rather than inventing a rule entry,
 * so the release still ships while agora's re-enable stays keyed on real names.
 */
const ALLOWED_NON_RULE_SCOPES = ['deps', 'createRule', 'importRemoval'];

module.exports = { ALLOWED_NON_RULE_SCOPES };
