"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUnpinnedDependencies = void 0;
const createRule_1 = require("../utils/createRule");
const PINNED_SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-(?:[0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RANGE_OPERATOR_PATTERN = /[~^]/;
const LEADING_RANGE_PATTERN = /^[~^]/;
const DEFAULT_PINNED_VERSION = '1.2.3';
const BASIC_SEMVER_PATTERN = /\d+\.\d+\.\d+/;
/**
 * Computes a pinned-version recommendation from a raw dependency version.
 * Strips a leading range token (^ or ~), validates pinned candidates, and
 * falls back to the first semver-like substring or a default placeholder
 * when no safe candidate is present.
 *
 * @param version Dependency version string from package.json.
 * @returns Object describing whether a safe fix is possible and the
 * suggested pinned version.
 */
function computeVersionSuggestion(version) {
    const startsWithRange = LEADING_RANGE_PATTERN.test(version);
    const pinnedCandidate = startsWithRange
        ? version.replace(LEADING_RANGE_PATTERN, '')
        : version;
    const firstSemverInString = version.match(BASIC_SEMVER_PATTERN)?.[0];
    const isSimplePinned = startsWithRange && PINNED_SEMVER_PATTERN.test(pinnedCandidate);
    const suggestedVersion = isSimplePinned && startsWithRange
        ? pinnedCandidate
        : firstSemverInString ?? DEFAULT_PINNED_VERSION;
    return { isSimplePinned, suggestedVersion, pinnedCandidate };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.noUnpinnedDependencies = (0, createRule_1.createRule)({
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforces pinned dependencies',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            unexpected: "Dependency '{{ propertyName }}' is declared with the range '{{ version }}'. Ranges let package managers pull newer releases outside code review, which breaks reproducible installs and can hide breaking changes. Pin to a single exact version without range operators (for example '{{ suggestedVersion }}') so dependency updates stay intentional and auditable; complex ranges must be pinned manually.",
        },
    },
    defaultOptions: [],
    name: 'no-unpinned-dependencies',
    create(context) {
        return {
            JSONLiteral(node) {
                const property = node?.parent;
                // const property = node.parent;
                const configSection = node?.parent?.parent?.parent;
                if (!property || !configSection) {
                    return;
                }
                const configKey = configSection?.key;
                if (!configKey) {
                    return;
                }
                // Check if we're in the "dependencies" or "devDependencies" section of package.json
                if (node.type === 'JSONLiteral' &&
                    property?.type === 'JSONProperty' &&
                    (configKey.name === 'devDependencies' ||
                        configKey.value === 'devDependencies' ||
                        configKey.name === 'dependencies' ||
                        configKey.value === 'dependencies')) {
                    // Get the version string
                    const version = node.value;
                    const propertyName = property.key.name ||
                        property.key.value;
                    // Flag caret/tilde range operators anywhere; only auto-fix simple leading ranges
                    if (typeof version === 'string' &&
                        RANGE_OPERATOR_PATTERN.test(version)) {
                        const { isSimplePinned, suggestedVersion, pinnedCandidate } = computeVersionSuggestion(version);
                        context.report({
                            node: node,
                            messageId: 'unexpected',
                            data: {
                                propertyName,
                                version,
                                suggestedVersion,
                            },
                            fix: function (fixer) {
                                if (!isSimplePinned) {
                                    return null;
                                }
                                return fixer.replaceTextRange(node.range, `"${pinnedCandidate}"`);
                            },
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-unpinned-dependencies.js.map