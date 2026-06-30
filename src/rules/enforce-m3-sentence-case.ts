import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    propsToCheck?: string[];
    ignoredWords?: string[];
    ignorePatterns?: string[];
    allowList?: string[];
    checkJsxText?: boolean;
  },
];

type MessageIds = 'titleCase' | 'allCaps';

/**
 * Default props that carry user-facing label text, per the issue spec.
 */
const DEFAULT_PROPS_TO_CHECK = new Set([
  'label',
  'title',
  'placeholder',
  'helperText',
  'message',
  'description',
  'tooltip',
  'buttonText',
  'aria-label',
  'alt',
]);

/**
 * Words that are always allowed to keep their original capitalisation.
 * Populated with brand names / proper nouns from the issue spec plus a broad set
 * of common platform, game, and tech names.
 */
const DEFAULT_IGNORED_WORDS = new Set([
  // BluMint brand
  'BluMint',
  // Auth / social
  'Google',
  'Apple',
  'Facebook',
  'Discord',
  'Twitch',
  'Steam',
  'YouTube',
  'Twitter',
  'Instagram',
  'TikTok',
  'Reddit',
  'GitHub',
  'LinkedIn',
  // Games / platforms
  'Overwolf',
  'Fortnite',
  'Valorant',
  'Apex',
  'Legends',
  'Rocket',
  'League',
  'Minecraft',
  'Roblox',
  'PlayStation',
  'Xbox',
  'Nintendo',
  // Other tech
  'Windows',
  'macOS',
  'Linux',
  'Android',
  'iPhone',
  'iPad',
  // Common acronyms treated as words (capitalised but not ALL-CAPS)
  'iOS',
  'macOS',
]);

/**
 * Short all-caps tokens that are valid acronyms and must not be flagged as
 * ALL-CAPS violations. Entries are case-sensitive (already upper-case).
 */
const ACRONYM_ALLOWLIST = new Set([
  'OK',
  'ID',
  'IDs',
  'API',
  'APIs',
  'URL',
  'URLs',
  'URI',
  'URIs',
  'FAQ',
  'FAQs',
  'NFT',
  'NFTs',
  'USD',
  'EUR',
  'GBP',
  'DM',
  'DMs',
  'OBS',
  'RTMP',
  'RTMPS',
  'CDN',
  'SDK',
  'UI',
  'UX',
  'AI',
  'ML',
  'VR',
  'AR',
  'PR',
  'QR',
  'vs',
  'VS',
]);

/**
 * Maximum character length for a token that is treated as a valid short acronym
 * even if it is not in the explicit allowlist (e.g. three-letter country codes
 * like "USA", "EUR", etc.).
 */
const SHORT_ACRONYM_MAX_LENGTH = 4;

/**
 * Returns true when a single whitespace-free token should be treated as a
 * valid acronym / abbreviation and ignored.
 */
function isAcronymToken(word: string): boolean {
  if (ACRONYM_ALLOWLIST.has(word)) return true;
  // All-caps tokens up to the threshold length are treated as acronyms.
  if (word.length <= SHORT_ACRONYM_MAX_LENGTH && /^[A-Z]+$/.test(word)) {
    return true;
  }
  return false;
}

/**
 * Checks whether the raw text looks like code, a URL, or a file-path and
 * should be skipped entirely.
 */
function looksLikeCodeOrUrl(text: string): boolean {
  // URLs
  if (/https?:\/\//i.test(text)) return true;
  // File paths (starts with /, ./, ../)
  if (/^\.{0,2}\//.test(text)) return true;
  // camelCase / PascalCase single tokens with no spaces
  if (/^\S+$/.test(text) && /[a-z][A-Z]/.test(text)) return true;
  return false;
}

/**
 * Segments a string at sentence boundaries (`.`, `?`, `!`, or `:` followed by
 * whitespace) and at the colon heuristic described in the issue.  Each returned
 * segment starts at a sentence-boundary, so its first word is allowed to carry
 * a capital letter.
 */
function splitIntoSentences(text: string): string[] {
  // Split on `. `, `? `, `! `, `: ` — the character after the punctuation is
  // trimmed so each segment's first word is examined independently.
  const segments = text.split(/(?<=[.?!:])\s+/);
  return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Given a sentence (first word allowed to be capitalised), returns the words
 * that carry an unexpected capital — i.e. non-first words whose first letter is
 * upper-case AND which are not in the ignored set AND not acronyms.
 */
function titleCaseViolatingWords(
  sentence: string,
  ignoredWordsSet: Set<string>,
): string[] {
  const words = sentence.split(/\s+/);
  const violating: string[] = [];
  words.forEach((raw, index) => {
    // Strip surrounding punctuation to get the bare word for checks
    const word = raw.replace(/^[^\w]+|[^\w]+$/g, '');
    if (!word) return;
    // First word of the sentence — allowed to start with a capital
    if (index === 0) return;
    // Ignored (proper noun / brand)
    if (ignoredWordsSet.has(word)) return;
    // Acronym
    if (isAcronymToken(word)) return;
    // Only flag if the first character is an upper-case letter
    if (/^[A-Z]/.test(word)) {
      violating.push(word);
    }
  });
  return violating;
}

/**
 * Returns true when the text is an ALL-CAPS violation:
 * — ≥ 2 words
 * — The full letter content is upper-case
 * — It cannot be decomposed into individual acronyms
 */
function isAllCapsViolation(
  text: string,
  ignoredWordsSet: Set<string>,
): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return false;
  // All letter characters must be upper-case
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters !== letters.toUpperCase()) return false;
  // If every word is an acronym or ignored, it is not a violation
  const allExempt = words.every(
    (w) => isAcronymToken(w) || ignoredWordsSet.has(w),
  );
  return !allExempt;
}

/**
 * Builds the corrected version of the text for the suggestion / fix.
 * — ALL-CAPS: Capitalises only the first letter of the first word, lowercases
 *   the rest (respecting acronyms and ignored words).
 * — Title Case: Lowercases non-first words that are not acronyms / proper nouns.
 */
function buildSuggestionText(
  text: string,
  ignoredWordsSet: Set<string>,
): string {
  const sentences = splitIntoSentences(text);
  return sentences
    .map((sentence) => {
      const words = sentence.split(/\s+/);
      return words
        .map((raw, index) => {
          const word = raw.replace(/^[^\w]+|[^\w]+$/g, '');
          if (!word) return raw;
          if (index === 0) {
            // Preserve ignored words in their original capitalisation; for all-caps
            // first words, lower-case everything except the initial letter.
            if (ignoredWordsSet.has(word)) return raw;
            if (isAcronymToken(word)) return raw;
            // Sentence-start: ensure first letter is capital
            return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
          }
          if (ignoredWordsSet.has(word)) return raw;
          if (isAcronymToken(word)) return raw;
          // Non-first word: lower-case
          return raw.charAt(0).toLowerCase() + raw.slice(1);
        })
        .join(' ');
    })
    .join(' ');
}

/**
 * Returns the trimmed text to check and whether it is worth checking.
 * JSXText nodes often contain only whitespace / newlines from formatting.
 */
function extractCheckableText(raw: string): string | null {
  const trimmed = raw.trim();
  // Nothing to check
  if (!trimmed) return null;
  // Numeric / symbol only — not user-facing text
  if (/^[\d\W]+$/.test(trimmed)) return null;
  // Code / URL patterns
  if (looksLikeCodeOrUrl(trimmed)) return null;
  return trimmed;
}

export const enforceM3SentenceCase = createRule<Options, MessageIds>({
  name: 'enforce-m3-sentence-case',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce Material Design 3 sentence-case capitalisation for user-facing text — flag Title Case and ALL CAPS strings in JSX text and configured string props.',
      recommended: 'warn',
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          propsToCheck: {
            type: 'array',
            items: { type: 'string' },
          },
          ignoredWords: {
            type: 'array',
            items: { type: 'string' },
          },
          ignorePatterns: {
            type: 'array',
            items: { type: 'string' },
          },
          allowList: {
            type: 'array',
            items: { type: 'string' },
          },
          checkJsxText: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      titleCase:
        'Text "{{text}}" uses Title Case. Material Design 3 requires sentence case — only the first word and proper nouns should be capitalised. Consider "{{suggestion}}".',
      allCaps:
        'Text "{{text}}" is ALL CAPS. Material Design 3 requires sentence case — use "{{suggestion}}" instead.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const propsToCheckSet = options.propsToCheck
      ? new Set(options.propsToCheck)
      : DEFAULT_PROPS_TO_CHECK;

    const ignoredWordsSet = new Set([
      ...DEFAULT_IGNORED_WORDS,
      ...(options.ignoredWords ?? []),
    ]);

    const ignorePatternRegexes = (options.ignorePatterns ?? []).map(
      (p) => new RegExp(p),
    );

    const allowListSet = new Set(options.allowList ?? []);

    const checkJsxText = options.checkJsxText !== false;

    /**
     * Determine whether the text should be skipped before casing checks.
     */
    function shouldSkip(text: string): boolean {
      if (allowListSet.has(text)) return true;
      if (ignorePatternRegexes.some((re) => re.test(text))) return true;
      return false;
    }

    /**
     * Core checker.  Reports on `reportNode` if `text` violates M3 sentence case.
     */
    function checkText(text: string, reportNode: TSESTree.Node): void {
      const checkable = extractCheckableText(text);
      if (!checkable) return;
      if (shouldSkip(checkable)) return;

      // ALL-CAPS check first (higher severity and different fix)
      if (isAllCapsViolation(checkable, ignoredWordsSet)) {
        const suggestion = buildSuggestionText(checkable, ignoredWordsSet);
        context.report({
          node: reportNode,
          messageId: 'allCaps',
          data: { text: checkable, suggestion },
          suggest: [
            {
              messageId: 'allCaps',
              data: { text: checkable, suggestion },
              fix(fixer) {
                if (reportNode.type === AST_NODE_TYPES.Literal) {
                  const raw = context.getSourceCode().getText(reportNode);
                  const quote = raw[0];
                  return fixer.replaceText(
                    reportNode,
                    `${quote}${suggestion}${quote}`,
                  );
                }
                if (reportNode.type === AST_NODE_TYPES.JSXText) {
                  const original = (reportNode as TSESTree.JSXText).value;
                  const replaced = original.replace(checkable, suggestion);
                  return fixer.replaceText(reportNode, replaced);
                }
                return null;
              },
            },
          ],
        });
        return;
      }

      // Title-Case check: validate each sentence segment independently
      const sentences = splitIntoSentences(checkable);
      const violatingWords: string[] = [];
      sentences.forEach((sentence) => {
        violatingWords.push(
          ...titleCaseViolatingWords(sentence, ignoredWordsSet),
        );
      });

      if (violatingWords.length > 0) {
        const suggestion = buildSuggestionText(checkable, ignoredWordsSet);
        context.report({
          node: reportNode,
          messageId: 'titleCase',
          data: { text: checkable, suggestion },
          suggest: [
            {
              messageId: 'titleCase',
              data: { text: checkable, suggestion },
              fix(fixer) {
                if (reportNode.type === AST_NODE_TYPES.Literal) {
                  const raw = context.getSourceCode().getText(reportNode);
                  const quote = raw[0];
                  return fixer.replaceText(
                    reportNode,
                    `${quote}${suggestion}${quote}`,
                  );
                }
                if (reportNode.type === AST_NODE_TYPES.JSXText) {
                  const original = (reportNode as TSESTree.JSXText).value;
                  const replaced = original.replace(checkable, suggestion);
                  return fixer.replaceText(reportNode, replaced);
                }
                return null;
              },
            },
          ],
        });
      }
    }

    return {
      // Check inline JSX text like <Button>Back To App</Button>
      JSXText(node: TSESTree.JSXText) {
        if (!checkJsxText) return;
        checkText(node.value, node);
      },

      // Check string literals in JSX attribute values
      JSXAttribute(node: TSESTree.JSXAttribute) {
        // Determine the attribute name (handles both plain and namespaced names)
        let attrName: string;
        if (node.name.type === AST_NODE_TYPES.JSXNamespacedName) {
          attrName = `${node.name.namespace.name}:${node.name.name.name}`;
        } else {
          attrName = node.name.name;
        }

        if (!propsToCheckSet.has(attrName)) return;

        const value = node.value;
        if (!value) return;

        // <TextField label="Full Name" />  → value is a Literal
        if (
          value.type === AST_NODE_TYPES.Literal &&
          typeof (value as TSESTree.Literal).value === 'string'
        ) {
          checkText(String((value as TSESTree.Literal).value), value);
          return;
        }

        // <TextField label={"Full Name"} />  → value is JSXExpressionContainer
        if (value.type === AST_NODE_TYPES.JSXExpressionContainer) {
          const expr = value.expression;
          if (
            expr.type === AST_NODE_TYPES.Literal &&
            typeof (expr as TSESTree.Literal).value === 'string'
          ) {
            checkText(String((expr as TSESTree.Literal).value), expr);
          }
          // Template literals: skip — dynamic, cannot reliably check
        }
      },
    };
  },
});
