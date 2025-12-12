"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFirestoreRulesGetAccess = void 0;
const createRule_1 = require("../utils/createRule");
const DIRECT_ACCESS_REGEX = /\b(?:request\.resource|resource)\.data(?!\.get\()(?:\.(?!get\()[A-Za-z_]\w*|\[['"][^'"]+['"]\])+(?:\s*)(?:!=|==|!==|===)\s*(?:null|undefined)\b/;
function hasDirectFieldAccessComparison(text) {
    // Match resource.data.<a>.<b>... or bracketed string segments compared to null/undefined.
    return DIRECT_ACCESS_REGEX.test(text);
}
function hasGetWithoutDefault(text) {
    // Look for `.get('field')` with a single argument. We only check in contexts that
    // also mention resource.data/request.resource.data to reduce false positives.
    const mentionsRulesContext = /\b(?:request\.resource|resource)\.data\b/.test(text);
    if (!mentionsRulesContext)
        return false;
    const singleArgGetRegex = /\.get\(\s*(['"][^'"]+['"])\s*\)/;
    return singleArgGetRegex.test(text);
}
function applyDirectAccessFixes(text) {
    // Replace each direct access chain with equivalent `.get('seg', null)` chain
    const pattern = /\b((?:request\.resource|resource)\.data)(?!\.get\()((?:\.(?!get\()[A-Za-z_]\w*|\[['"][^'"]+['"]\])+)(\s*)((?:!=|==|!==|===)\s*(?:null|undefined)\b)/g;
    const segmentRegex = /(?:\.(?!get\()[A-Za-z_]\w*|\[['"][^'"]+['"]\])/g;
    const unescapeLiteral = (raw) => raw.replace(/\\(['"\\])/g, '$1');
    return text.replace(pattern, (_m, prefix, path, preOpWhitespace, opAndRest) => {
        const segments = [];
        path.replace(segmentRegex, (seg) => {
            if (seg.startsWith('.')) {
                segments.push(seg.slice(1));
                return '';
            }
            const match = /"\s*([^"]+)"|'\s*([^']+)'/.exec(seg);
            if (match) {
                const raw = match[1] ?? match[2] ?? '';
                segments.push(unescapeLiteral(raw));
            }
            return '';
        });
        const replaced = segments
            .map((seg) => `.get('${seg.replace(/'/g, "\\'")}', null)`)
            .join('');
        return `${prefix}${replaced}${preOpWhitespace}${opAndRest}`;
    });
}
function applyGetDefaultFixes(text) {
    // Add ", null" as the second argument when `.get('field')` is used
    const singleArgGetRegexGlobal = /\.get\(\s*(['"][^'"]+['"])\s*\)/g;
    return text.replace(singleArgGetRegexGlobal, (_m, keyLiteral) => `.get(${keyLiteral}, null)`);
}
exports.enforceFirestoreRulesGetAccess = (0, createRule_1.createRule)({
    name: 'enforce-firestore-rules-get-access',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Ensure Firestore security rules use .get() with a default value instead of direct field access comparisons (e.g., resource.data.fieldX.fieldY != null).',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            useGetAccess: "Use .get('<field>', null) instead of direct field access in Firestore rules, e.g., resource.data.get('fieldX', null).",
            requireGetDefault: "Provide a default value to .get() in Firestore rules, e.g., .get('fieldX', null).",
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            Literal(node) {
                if (typeof node.value !== 'string')
                    return;
                const value = node.value;
                if (!/(?:request\.resource|resource)\.data/.test(value))
                    return;
                const needsDirectFix = hasDirectFieldAccessComparison(value);
                const needsGetDefaultFix = hasGetWithoutDefault(value);
                if (!needsDirectFix && !needsGetDefaultFix)
                    return;
                context.report({
                    node,
                    messageId: needsDirectFix ? 'useGetAccess' : 'requireGetDefault',
                    fix: (fixer) => {
                        let newText = value;
                        if (needsDirectFix)
                            newText = applyDirectAccessFixes(newText);
                        if (needsGetDefaultFix)
                            newText = applyGetDefaultFixes(newText);
                        return fixer.replaceText(node, JSON.stringify(newText));
                    },
                });
            },
            TemplateLiteral(node) {
                // Best-effort: we only join static quasis and ignore embedded expressions,
                // so template expressions spanning placeholders may be missed.
                const staticText = node.quasis.map((q) => q.value.raw).join('');
                if (!/(?:request\.resource|resource)\.data/.test(staticText))
                    return;
                const needsDirectFix = hasDirectFieldAccessComparison(staticText);
                const needsGetDefaultFix = hasGetWithoutDefault(staticText);
                if (!needsDirectFix && !needsGetDefaultFix)
                    return;
                context.report({
                    node,
                    messageId: needsDirectFix ? 'useGetAccess' : 'requireGetDefault',
                    // No auto-fix for template literals due to dynamic expressions
                });
            },
        };
    },
});
//# sourceMappingURL=enforce-firestore-rules-get-access.js.map