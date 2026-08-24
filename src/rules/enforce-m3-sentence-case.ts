import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { compilePatternOption } from '../utils/compilePatternOption';
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
 * True when a word carries an upper-case letter away from its start, which is
 * positive evidence of a proper noun or identifier rather than of Title Case:
 * Title Case capitalises a word's first letter and nothing else, so `BluBot`
 * cannot be Title Case while `Blubot` can.  Detecting brands structurally is
 * what spares `DEFAULT_IGNORED_WORDS` from having to enumerate every product
 * and integration name that ever appears in a label.
 *
 * Two exclusions keep the signal honest:
 * — Shouting tokens (`TERMS`, `HTTPS`) are all-upper by emphasis, not by name,
 *   and belong to the acronym / ALL-CAPS handling instead.
 * — Hyphen- and apostrophe-joined tokens are judged segment by segment, so a
 *   Title Cased compound (`Drag-And-Drop`) is not excused by its own joins
 *   while a genuine intercapped name (`McDonald's`) still is.
 */
function hasInteriorCapital(word: string): boolean {
  return word.split(/[^A-Za-z0-9]+/).some((segment) => {
    if (isAllUpperCase(segment)) return false;
    const firstLetterIndex = segment.search(/[a-zA-Z]/);
    if (firstLetterIndex === -1) return false;
    return /[A-Z]/.test(segment.slice(firstLetterIndex + 1));
  });
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
  if (/^\S+$/.test(text) && hasInteriorCapital(text)) return true;
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
    // Proper noun identified by its shape rather than by enumeration
    if (hasInteriorCapital(word)) return;
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
 * Splits a whitespace-delimited token into its leading punctuation, the bare
 * word, and its trailing punctuation, so casing can be applied to the word
 * without disturbing quotes/brackets/periods around it.  Only *surrounding*
 * punctuation is peeled off, so a possessive stays whole: `USER'S` yields the
 * single core `USER'S` rather than a `USER` word and a stray `'S`.
 */
function splitWordAffixes(raw: string): {
  lead: string;
  core: string;
  trail: string;
} {
  const lead = /^[^\w]*/.exec(raw)?.[0] ?? '';
  const rest = raw.slice(lead.length);
  const trail = /[^\w]*$/.exec(rest)?.[0] ?? '';
  return { lead, core: rest.slice(0, rest.length - trail.length), trail };
}

/**
 * Upper-cases the first alphabetic character, leaving any leading punctuation
 * untouched so `(text` becomes `(Text` rather than staying lower-case.
 */
function capitalizeFirstLetter(text: string): string {
  const index = text.search(/[a-zA-Z]/);
  if (index === -1) return text;
  return (
    text.slice(0, index) +
    text.charAt(index).toUpperCase() +
    text.slice(index + 1)
  );
}

/**
 * True when every letter in the token is upper-case (`USER'S`, `FORM`), which
 * means lower-casing just the leading character would leave a shouting tail.
 */
function isAllUpperCase(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  return letters.length > 0 && letters === letters.toUpperCase();
}

/**
 * Maps the lower-cased form of every ignored word to its canonical spelling so
 * an ALL-CAPS occurrence (`GOOGLE`) can be restored to `Google` rather than
 * flattened to `google`.
 */
function buildCanonicalIgnoredWords(
  ignoredWordsSet: Set<string>,
): Map<string, string> {
  const canonical = new Map<string, string>();
  ignoredWordsSet.forEach((word) => {
    const key = word.toLowerCase();
    if (!canonical.has(key)) canonical.set(key, word);
  });
  return canonical;
}

/**
 * Builds the corrected text for an ALL-CAPS violation: the entire string is
 * lower-cased and each sentence's first letter is capitalised.  Only words in
 * the explicit acronym allowlist and ignored/proper nouns keep their casing —
 * the length-based acronym heuristic cannot be used here because *every* token
 * of an ALL-CAPS string looks like an acronym.
 */
function buildAllCapsSuggestionText(
  text: string,
  ignoredWordsSet: Set<string>,
): string {
  const canonicalIgnoredWords = buildCanonicalIgnoredWords(ignoredWordsSet);
  return splitIntoSentences(text)
    .map((sentence) =>
      sentence
        .split(/\s+/)
        .map((raw, index) => {
          const { lead, core, trail } = splitWordAffixes(raw);
          if (!core) return raw;
          const canonical = canonicalIgnoredWords.get(core.toLowerCase());
          if (canonical) return `${lead}${canonical}${trail}`;
          if (ACRONYM_ALLOWLIST.has(core)) return raw;
          const lowered = core.toLowerCase();
          const cased = index === 0 ? capitalizeFirstLetter(lowered) : lowered;
          return `${lead}${cased}${trail}`;
        })
        .join(' '),
    )
    .join(' ');
}

/**
 * Builds the corrected text for a Title Case violation: non-first words that
 * are neither acronyms nor proper nouns are lower-cased (`Name` → `name`),
 * while shouting tokens (`CHANGES`) are lower-cased in full.  A word whose
 * capitals sit away from its start (`McDonald`, `PayPal`) is a name, so it is
 * emitted verbatim — lower-casing only its initial would yield `payPal`, which
 * is neither the brand nor sentence case.
 */
function buildTitleCaseSuggestionText(
  text: string,
  ignoredWordsSet: Set<string>,
): string {
  const sentences = splitIntoSentences(text);
  return sentences
    .map((sentence) => {
      const words = sentence.split(/\s+/);
      return words
        .map((raw, index) => {
          const { lead, core, trail } = splitWordAffixes(raw);
          if (!core) return raw;
          // Proper nouns and acronyms keep their original capitalisation.
          if (ignoredWordsSet.has(core)) return raw;
          if (isAcronymToken(core)) return raw;
          // Structurally identified names are emitted verbatim, including at a
          // sentence start: `capitalizeFirstLetter` would rewrite `eSports` to
          // `ESports`, misspelling a word the report never objected to.
          if (hasInteriorCapital(core)) return raw;
          const lowered = isAllUpperCase(core)
            ? core.toLowerCase()
            : core.charAt(0).toLowerCase() + core.slice(1);
          // Sentence-start: ensure the first letter is a capital.
          const cased = index === 0 ? capitalizeFirstLetter(lowered) : lowered;
          return `${lead}${cased}${trail}`;
        })
        .join(' ');
    })
    .join(' ');
}

/**
 * Escape sequences for characters that cannot appear literally inside a
 * JavaScript string literal.
 */
const JS_STRING_ESCAPES = new Map<string, string>([
  ['\\', '\\\\'],
  ['\n', '\\n'],
  ['\r', '\\r'],
  ['\t', '\\t'],
  ['\b', '\\b'],
  ['\f', '\\f'],
  ['\v', '\\v'],
  ['\u2028', '\\u2028'],
  ['\u2029', '\\u2029'],
]);

/**
 * Escapes text for re-emission inside a JavaScript string literal delimited by
 * `quote`.  Without this the rebuilt literal is unparseable as soon as the text
 * contains the delimiter (`'THE USER\'S FILE'`), a backslash, or a line
 * terminator.
 */
function escapeJsString(text: string, quote: string): string {
  let escaped = '';
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index);
    if (char === quote) {
      escaped += `\\${char}`;
      continue;
    }
    const mapped = JS_STRING_ESCAPES.get(char);
    if (mapped) {
      escaped += mapped;
      continue;
    }
    if (char < ' ' || char === '\u007f') {
      escaped += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
      continue;
    }
    escaped += char;
  }
  return escaped;
}

/**
 * Escapes text for re-emission inside a JSX attribute string (`label="…"`).
 * JSX attribute strings do not process backslash escapes, so the delimiter can
 * only be represented as a character reference.  `&` is re-encoded because the
 * value read off the AST has already been entity-decoded.
 */
function escapeJsxAttributeString(text: string, quote: string): string {
  const escaped = text.split('&').join('&amp;');
  return quote === "'"
    ? escaped.split("'").join('&#39;')
    : escaped.split('"').join('&quot;');
}

/**
 * Characters that change the meaning of JSX children and must therefore be
 * written back as character references.  `JSXText.value` is entity-decoded, so
 * emitting it verbatim can break parsing (`&lt;` → `<`) or silently turn text
 * into an expression container (`&#123;x&#125;` → `{x}`).
 */
const JSX_TEXT_ENTITIES = new Map<string, string>([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['{', '&#123;'],
  ['}', '&#125;'],
]);

function escapeJsxText(text: string): string {
  return text.replace(
    /[&<>{}]/g,
    (char) => JSX_TEXT_ENTITIES.get(char) ?? char,
  );
}

/**
 * Replaces the first occurrence of `search` without treating `$` sequences in
 * the replacement as `String.prototype.replace` patterns.
 */
function replaceFirst(
  text: string,
  search: string,
  replacement: string,
): string {
  const index = text.indexOf(search);
  if (index === -1) return replacement;
  return text.slice(0, index) + replacement + text.slice(index + search.length);
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
      recommended: 'error',
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

    // Rejecting a malformed `ignorePatterns` entry rather than dropping it keeps
    // the consumer's exception list honest: a silently discarded pattern would
    // make text they deliberately excluded start getting reported with no
    // indication why.
    const ignorePatternRegexes = compilePatternOption(
      'enforce-m3-sentence-case',
      'ignorePatterns',
      options.ignorePatterns ?? [],
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
     * Produces the replacement source text for the reported node, re-escaping
     * the suggestion for whichever literal form it is being written back into.
     * Returns null when the node is not a rewritable literal.
     */
    function buildFixText(
      reportNode: TSESTree.Node,
      checkable: string,
      suggestion: string,
    ): string | null {
      if (reportNode.type === AST_NODE_TYPES.Literal) {
        if (typeof reportNode.value !== 'string') return null;
        const raw = context.getSourceCode().getText(reportNode);
        const quote = raw.charAt(0);
        // Template literals never reach here (they are skipped as dynamic), so
        // only the two string-literal delimiters are rewritable.
        if (quote !== '"' && quote !== "'") return null;
        // Surrounding whitespace of the original value is preserved; only the
        // trimmed, checked portion is re-cased.
        const replaced = replaceFirst(reportNode.value, checkable, suggestion);
        const inner =
          reportNode.parent?.type === AST_NODE_TYPES.JSXAttribute
            ? escapeJsxAttributeString(replaced, quote)
            : escapeJsString(replaced, quote);
        return `${quote}${inner}${quote}`;
      }
      if (reportNode.type === AST_NODE_TYPES.JSXText) {
        const replaced = replaceFirst(reportNode.value, checkable, suggestion);
        return escapeJsxText(replaced);
      }
      return null;
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
        const suggestion = buildAllCapsSuggestionText(
          checkable,
          ignoredWordsSet,
        );
        context.report({
          node: reportNode,
          messageId: 'allCaps',
          data: { text: checkable, suggestion },
          suggest: [
            {
              messageId: 'allCaps',
              data: { text: checkable, suggestion },
              fix(fixer) {
                const fixText = buildFixText(reportNode, checkable, suggestion);
                return fixText === null
                  ? null
                  : fixer.replaceText(reportNode, fixText);
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
        const suggestion = buildTitleCaseSuggestionText(
          checkable,
          ignoredWordsSet,
        );
        context.report({
          node: reportNode,
          messageId: 'titleCase',
          data: { text: checkable, suggestion },
          suggest: [
            {
              messageId: 'titleCase',
              data: { text: checkable, suggestion },
              fix(fixer) {
                const fixText = buildFixText(reportNode, checkable, suggestion);
                return fixText === null
                  ? null
                  : fixer.replaceText(reportNode, fixText);
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
