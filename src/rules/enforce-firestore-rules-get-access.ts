import { createRule } from '../utils/createRule';

// This rule scans string and template literals for Firestore rules content and flags
// direct field access like `resource.data.foo.bar != null` or `== null` (also ===/!==)
// and enforces using `.get('foo', null).get('bar', null)` instead. It also enforces
// that `.get()` is called with a default value.

type MessageIds = 'useGetAccess' | 'requireGetDefault';

type Options = [];

function hasDirectFieldAccessComparison(text: string): boolean {
	// Match resource.data.<a>.<b>... <op> null|undefined (requires at least one segment)
	// and ensure the first accessor after .data is not .get(
	const directAccessRegex = /\b(?:request\.resource|resource)\.data\.(?!get\()([a-zA-Z_][\w]*)(?:\.[a-zA-Z_][\w]*)*\s*(?:!=|==|!==|===)\s*(?:null|undefined)\b/;
	return directAccessRegex.test(text);
}

function hasGetWithoutDefault(text: string): boolean {
	// Look for `.get('field')` with a single argument. We only check in contexts that
	// also mention resource.data/request.resource.data to reduce false positives.
	const mentionsRulesContext = /\b(?:request\.resource|resource)\.data\b/.test(text);
	if (!mentionsRulesContext) return false;
	const singleArgGetRegex = /\.get\(\s*(['"][^'"]+['"])\s*\)/;
	return singleArgGetRegex.test(text);
}

function applyDirectAccessFixes(text: string): string {
	// Replace each direct access chain with equivalent `.get('seg', null)` chain
	const pattern = /\b((?:request\.resource|resource)\.data)\.(?!get\()(([a-zA-Z_][\w]*)(?:\.[a-zA-Z_][\w]*)*)(\s*)((?:!=|==|!==|===)\s*(?:null|undefined)\b)/g;
	return text.replace(
		pattern,
		(
			_m,
			prefix: string,
			path: string,
			_firstSeg: string,
			preOpWhitespace: string,
			opAndRest: string,
		) => {
			const segments = path.split('.');
			const replaced = segments.map((seg) => `.get('${seg}', null)`).join('');
			return `${prefix}${replaced}${preOpWhitespace}${opAndRest}`;
		},
	);
}

function applyGetDefaultFixes(text: string): string {
	// Add ", null" as the second argument when `.get('field')` is used
	const singleArgGetRegexGlobal = /\.get\(\s*(['"][^'"]+['"])\s*\)/g;
	return text.replace(singleArgGetRegexGlobal, (_m, keyLiteral: string) => `.get(${keyLiteral}, null)`);
}

export const enforceFirestoreRulesGetAccess = createRule<Options, MessageIds>({
	name: 'enforce-firestore-rules-get-access',
	meta: {
		type: 'suggestion',
		docs: {
			description:
				"Ensure Firestore security rules use .get() with a default value instead of direct field access comparisons (e.g., resource.data.fieldX.fieldY != null).",
			recommended: 'error',
		},
		fixable: 'code',
		schema: [],
		messages: {
			useGetAccess:
				"Use .get('<field>', null) instead of direct field access in Firestore rules, e.g., resource.data.get('fieldX', null).",
			requireGetDefault:
				"Provide a default value to .get() in Firestore rules, e.g., .get('fieldX', null).",
		},
	},
	defaultOptions: [],
	create(context) {
		return {
			Literal(node) {
				if (typeof node.value !== 'string') return;
				const value = node.value;
				if (!/(?:request\.resource|resource)\.data/.test(value)) return;

				const needsDirectFix = hasDirectFieldAccessComparison(value);
				const needsGetDefaultFix = hasGetWithoutDefault(value);
				if (!needsDirectFix && !needsGetDefaultFix) return;

				context.report({
					node,
					messageId: needsDirectFix ? 'useGetAccess' : 'requireGetDefault',
					fix: (fixer) => {
						let newText = value;
						if (needsDirectFix) newText = applyDirectAccessFixes(newText);
						if (needsGetDefaultFix) newText = applyGetDefaultFixes(newText);
						return fixer.replaceText(node, `"${newText.replace(/"/g, '\\"')}"`);
					},
				});
			},
			TemplateLiteral(node) {
				const staticText = node.quasis.map((q) => q.value.raw).join('');
				if (!/(?:request\.resource|resource)\.data/.test(staticText)) return;
				const needsDirectFix = hasDirectFieldAccessComparison(staticText);
				const needsGetDefaultFix = hasGetWithoutDefault(staticText);
				if (!needsDirectFix && !needsGetDefaultFix) return;

				context.report({
					node,
					messageId: needsDirectFix ? 'useGetAccess' : 'requireGetDefault',
					// No auto-fix for template literals due to dynamic expressions
				});
			},
		};
	},
});