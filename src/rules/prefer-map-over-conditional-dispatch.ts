import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferMap' | 'preferMapManual';

/**
 * Named short deliberately: spelled `Options`, the `createRule<...>` call below
 * measures 81 columns against this rule's export name, and Prettier answers
 * that by breaking the call open and re-indenting the entire rule body.
 */
type Opts = [
  {
    printWidth?: number;
    singleQuote?: boolean;
  },
];

/**
 * A single value produced by a branch: either `return <expr>;` or
 * `<target> = <expr>;`. Ternary branches carry only an expression. `stmt` is
 * the producing statement itself — the anchor comments hosted by the fix are
 * attributed against (parent pointers are not yet populated when the
 * enclosing construct's visitor runs, so the statement is captured here).
 */
type BranchValue =
  | { kind: 'return'; expr: TSESTree.Expression; stmt: TSESTree.Statement }
  | {
      kind: 'assign';
      target: TSESTree.Node;
      expr: TSESTree.Expression;
      stmt: TSESTree.Statement;
    };

/**
 * Literal key resolved from a case test / equality test.
 *
 * `sourceText` is present only when the key came from a test the checker had to
 * resolve — a constant reference (`STATUS.active`, `Status.Active`, `ACTIVE`),
 * an enum member, a template literal, a negated numeric literal — rather than
 * from an inline literal. The fixer emits those as computed keys built from the
 * source expression. Keys derived from the discriminant's union type (the
 * members a `default`/`else` covers) have no source expression at all and carry
 * no `sourceText`.
 */
type LiteralKey = {
  value: string | number;
  kind: 'string' | 'number';
  sourceText?: string;
};

/**
 * Outcome of deriving the lookup constant's name. The two failures are
 * different facts about the code and are reported as such: a discriminant with
 * no usable name in it is nothing like one whose name is already taken, and a
 * report-only message that states the wrong one misdiagnoses why the fix was
 * withheld (#1941).
 */
type NameDerivation =
  | { kind: 'ok'; name: string }
  | { kind: 'taken'; name: string }
  | { kind: 'underivable' };

/**
 * Node types whose presence in a branch value — outside any function the value
 * itself carries — means the value is NOT safe to eager-evaluate inside a
 * `Record` (all entries construct at once).
 */
const EAGER_UNSAFE_NODES = new Set<string>([
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.YieldExpression,
  AST_NODE_TYPES.TaggedTemplateExpression,
  AST_NODE_TYPES.UpdateExpression,
  AST_NODE_TYPES.AssignmentExpression,
]);

const CONTAINER_TYPES = new Set<string>([
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.SwitchCase,
]);

/**
 * Node types whose children are a statement LIST, so a replacement spanning a
 * declaration plus a statement fits. This is deliberately wider than
 * `CONTAINER_TYPES`, which answers a different question — where a ternary's
 * hoist lands — and would change that answer if it grew these.
 */
const STATEMENT_LIST_TYPES = new Set<string>([
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.SwitchCase,
  AST_NODE_TYPES.StaticBlock,
  AST_NODE_TYPES.TSModuleBlock,
]);

/**
 * Parents that break AFTER their operator and leave the right-hand side flat on
 * the next line, so a break there is a property of the RHS's width alone. Every
 * other position either never breaks before the expression (`return`) or
 * re-measures a delimiter group whose layout the expression does not decide.
 */
const WRAP_ABSORBING_PARENTS = new Set<string>([
  AST_NODE_TYPES.VariableDeclarator,
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.Property,
]);

const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
]);

/**
 * Sentinel standing in for the receiver of a `this`-rooted member chain, which
 * has no identifier to key on. `this` is a reserved word, so no binding can
 * carry this name and shadow the sentinel.
 */
const THIS_ROOT = 'this';

/**
 * Node types that bind their own `this`, so a `this` inside one is a different
 * receiver than the enclosing scope's. Arrow functions are deliberately absent:
 * they close over the lexical `this`, exactly as a closure closes over an
 * identifier binding.
 */
const THIS_REBINDING_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.ClassBody,
]);

/**
 * A printed type that is a bare name — an alias, interface, enum, or class the
 * checker resolved to a single symbol. Such a name already tracks its union as
 * that union grows; anything more elaborate (a printed literal union, a type
 * literal, a generic instantiation) does not.
 */
const BARE_TYPE_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * The symbol each bare type name in a synthesized annotation was printed FOR.
 *
 * A printed bare name is only the right spelling where it still DENOTES the
 * symbol the checker printed it for, and the annotation is inserted somewhere
 * the printer never looked. A `null` entry marks a name printed for two
 * different symbols in one annotation, where no single binding can be right.
 */
type IntendedSymbols = Map<string, ts.Symbol | null>;

/**
 * Record one attribution, marking a name claimed by two different symbols
 * ambiguous. Both sides of the emitted `Record` contribute names, and the two
 * must agree: whichever declaration one spelling reaches, the other is
 * captured. Ambiguity is sticky, so a later agreeing attribution cannot clear
 * a conflict already seen.
 */
function recordAttribution(
  intended: IntendedSymbols,
  name: string,
  symbol: ts.Symbol | null,
): void {
  if (intended.has(name) && intended.get(name) !== symbol) {
    intended.set(name, null);
    return;
  }
  intended.set(name, symbol);
}

/** Fold one set of attributions into another under the same conflict rule. */
function mergeIntendedSymbols(
  target: IntendedSymbols,
  source: IntendedSymbols,
): void {
  for (const [name, symbol] of source) {
    recordAttribution(target, name, symbol);
  }
}

/**
 * Attribute a printed bare name to the symbol it stands for — the alias the
 * checker resolved through, or the declaration the type belongs to, whichever
 * supplied the name.
 *
 * Anything the symbols do not account for (a printed literal union, a generic
 * instantiation, a printer-synthesized spelling) gets no attribution and so
 * keeps the weaker name-presence check: an unattributable name has no intended
 * symbol to compare against, and inventing one would withhold fixes that
 * compile.
 */
function attributePrintedName(
  intended: IntendedSymbols,
  printed: string,
  type: ts.Type,
): void {
  if (!BARE_TYPE_NAME.test(printed)) {
    return;
  }
  const symbol =
    [type.aliasSymbol, type.symbol].find(
      (candidate) => candidate?.name === printed,
    ) ?? null;
  if (!symbol) {
    return;
  }
  recordAttribution(intended, printed, symbol);
}

/**
 * Function/constructor/conditional type notation must be parenthesized to
 * appear as a `|` union member, or the emitted annotation does not parse
 * ("Function type notation must be parenthesized when used in a union type").
 * Over-wrapping is harmless — a parenthesized type is valid in any type
 * position — so this tests the printed text conservatively instead of
 * re-deriving the printer's precedence rules.
 */
function parenthesizeForUnion(text: string): string {
  const needsParens =
    text.includes('=>') || /^new\b/.test(text) || /\bextends\b/.test(text);
  return needsParens ? `(${text})` : text;
}

/**
 * Prettier's own default. The fixer authors the whole declaration head — the
 * lookup name, both `Record` type arguments and the `= {` that opens the map —
 * so a head left past this width is rewritten by the next `prettier --write`,
 * and fails `prettier --check` in the meantime.
 */
const DEFAULT_PRINT_WIDTH = 80;

/**
 * A printed string, numeric, boolean or template literal type — the only
 * members a discriminant's inlined union can hold, since the type gate admits
 * only string/number literal members.
 */
const PRINTED_LITERAL_TYPE =
  /^(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|-?(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?\d+)?n?|true|false)$/;

/**
 * Top-level `|` members of a printed type, for the leading-`|` spelling
 * Prettier breaks a wide union into. The scan is quote-aware and then insists
 * every member is a literal type: a discriminant prints as a union only when
 * the checker inlined its literal members, and refusing anything else keeps the
 * splitter away from text where a bare `|` is not a top-level separator (the
 * `>` of a `=>` inside a function type, a conditional type's branches). Text it
 * declines to segment stays one member and is emitted on a single line.
 */
function printedUnionMembers(text: string): string[] {
  const members: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote !== null) {
      current += char;
      if (char === '\\') {
        current += text[index + 1] ?? '';
        index++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '|') {
      members.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  members.push(current.trim());
  return members.length > 1 &&
    members.every((member) => PRINTED_LITERAL_TYPE.test(member))
    ? members
    : [text];
}

/**
 * Whether Prettier hugs a lone type argument onto its reference's line instead
 * of breaking the argument list open. It hugs a "simple" argument only — a
 * literal, or a reference carrying no type arguments of its own — so
 * `Array<Foo>` stays whole while `Array<Foo[]>`, `Array<typeof Foo>` and
 * `Array<Array<Foo>>` break (measured).
 */
function isHuggedTypeArgument(node: ts.TypeNode): boolean {
  if (ts.isLiteralTypeNode(node) || ts.isTemplateLiteralTypeNode(node)) {
    return true;
  }
  return (
    (ts.isTypeReferenceNode(node) || ts.isImportTypeNode(node)) &&
    node.typeArguments === undefined
  );
}

function typeReflows(node: ts.TypeNode): boolean {
  if (ts.isParenthesizedTypeNode(node)) {
    return typeReflows(node.type);
  }
  if (ts.isArrayTypeNode(node)) {
    return typeReflows(node.elementType);
  }
  if (ts.isTypeOperatorNode(node)) {
    return typeReflows(node.type);
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    return typeReflows(node.objectType) || typeReflows(node.indexType);
  }
  if (ts.isLiteralTypeNode(node) || ts.isTemplateLiteralTypeNode(node)) {
    return false;
  }
  if (ts.isTypeQueryNode(node)) {
    return node.typeArguments !== undefined;
  }
  if (ts.isTypeReferenceNode(node) || ts.isImportTypeNode(node)) {
    const args = node.typeArguments;
    if (args === undefined || args.length === 0) {
      return false;
    }
    return args.length > 1 || !isHuggedTypeArgument(args[0]);
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    return node.types.length > 1 || typeReflows(node.types[0]);
  }
  // A keyword type (`string`, `never`, ...) is a single token and `this` is a
  // single word, neither with an interior. Every remaining shape — function,
  // constructor, type literal, tuple, conditional, mapped — carries a break
  // point Prettier uses, so an over-wide line holding one is not its output.
  return !ts.isToken(node) && node.kind !== ts.SyntaxKind.ThisType;
}

/**
 * The alias wrapper every printed type is parsed through. Shared so the offset
 * a parsed node reports and the offset into the type text it came from cannot
 * drift apart.
 */
const TYPE_TEXT_PREFIX = 'type __T = ';

/** The printed type parsed standalone, with the file it was parsed in. */
function parseTypeSourceFile(typeText: string): {
  sourceFile: ts.SourceFile;
  type: ts.TypeNode | null;
} {
  const sourceFile = ts.createSourceFile(
    '__annotation__.ts',
    `${TYPE_TEXT_PREFIX}${typeText};`,
    ts.ScriptTarget.Latest,
    true,
  );
  const [statement] = sourceFile.statements;
  const type =
    statement && ts.isTypeAliasDeclaration(statement) ? statement.type : null;
  return { sourceFile, type };
}

/** The printed type as a TypeScript node, or null when it does not parse. */
function parseTypeText(typeText: string): ts.TypeNode | null {
  return parseTypeSourceFile(typeText).type;
}

/**
 * The delimiter Prettier gives a string whose content is `content`, reproducing
 * `getPreferredQuote`: the configured quote, unless the content holds strictly
 * more of it than of the other one, in which case the other one wins because it
 * needs fewer escapes. A tie keeps the configured quote.
 *
 * The count decides it, not the presence — this is why a blind flip is wrong:
 * under `singleQuote`, `"it's"` keeps its double quotes.
 */
function preferredQuoteFor(content: string, singleQuote: boolean): '"' | "'" {
  const preferred = singleQuote ? "'" : '"';
  const alternate = singleQuote ? '"' : "'";
  const preferredCount = content.split(preferred).length - 1;
  const alternateCount = content.split(alternate).length - 1;
  return preferredCount > alternateCount ? alternate : preferred;
}

/**
 * A raw string literal (delimiters included) re-spelled with the delimiter
 * Prettier would choose, reproducing `makeString`.
 *
 * It works on the RAW text rather than the cooked value so every other escape
 * — `\t`, `\u00e9`, `\\` — survives byte-identical, and only the quotes move:
 * an escape that the old delimiter needed is dropped when the new delimiter
 * does not need it, and vice versa. A regex over the whole type text cannot do
 * that, because re-escaping is a property of the literal being re-delimited.
 */
function requoteStringLiteral(raw: string, singleQuote: boolean): string {
  const content = raw.slice(1, -1);
  const quote = preferredQuoteFor(content, singleQuote);
  const other = quote === '"' ? "'" : '"';
  const body = content.replace(
    /\\([\s\S])|(["'])/g,
    (_match, escaped: string | undefined, bare: string | undefined) => {
      if (escaped !== undefined) {
        return escaped === other ? escaped : `\\${escaped}`;
      }
      return bare === quote ? `\\${quote}` : other;
    },
  );
  return `${quote}${body}${quote}`;
}

/** Characters a synthesized string literal cannot carry unescaped. */
const STRING_ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * A cooked value spelled as a string literal the way Prettier spells one: the
 * delimiter chosen by occurrence count, and only the delimiter escaped.
 * Escaping the other quote as well would ship text `prettier --check` rejects,
 * because Prettier drops an escape its own delimiter does not need.
 */
function quotedStringLiteral(value: string, singleQuote: boolean): string {
  const quote = preferredQuoteFor(value, singleQuote);
  const body = value.replace(/[\\\n\r\u2028\u2029"']/g, (character) =>
    character === quote ? `\\${quote}` : STRING_ESCAPES[character] ?? character,
  );
  return `${quote}${body}${quote}`;
}

/**
 * A per-line transform moving text written at `fromIndent` to `toIndent`, or
 * null when neither indentation is a prefix of the other (tabs against spaces),
 * where no delta is expressible and applying one would mangle the body.
 */
function lineShifterBetween(
  fromIndent: string,
  toIndent: string,
): ((line: string) => string) | null {
  if (fromIndent === toIndent) {
    return (line) => line;
  }
  if (fromIndent.startsWith(toIndent)) {
    const removed = fromIndent.slice(toIndent.length);
    return (line) =>
      line.startsWith(removed) ? line.slice(removed.length) : line;
  }
  if (toIndent.startsWith(fromIndent)) {
    const added = toIndent.slice(fromIndent.length);
    return (line) => `${added}${line}`;
  }
  return null;
}

/**
 * The printed type with every string literal inside it re-delimited the way
 * Prettier would.
 *
 * `checker.typeToString` always prints a string-literal type double-quoted, so
 * shipping its text verbatim into an annotation fails `prettier --check` in a
 * `singleQuote` codebase at any width (#2059). Re-emitting the parsed literals
 * rather than substituting quotes textually is what keeps two shapes intact: a
 * quote embedded in the content (whose escaping changes with the delimiter),
 * and a quote inside a template literal TYPE, which is content and never a
 * delimiter. Text that does not parse is returned unchanged — the annotation
 * gate is the one place that decides whether unparseable text may ship.
 */
export function normalizeTypeQuotes(
  typeText: string,
  singleQuote: boolean,
): string {
  const { sourceFile, type } = parseTypeSourceFile(typeText);
  if (type === null) {
    return typeText;
  }
  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node)) {
      const start = node.getStart(sourceFile);
      const end = node.getEnd();
      const raw = sourceFile.text.slice(start, end);
      if (raw.length >= 2 && (raw[0] === '"' || raw[0] === "'")) {
        edits.push({
          start: start - TYPE_TEXT_PREFIX.length,
          end: end - TYPE_TEXT_PREFIX.length,
          text: requoteStringLiteral(raw, singleQuote),
        });
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(type);
  let result = typeText;
  for (const edit of edits.reverse()) {
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(
      edit.end,
    )}`;
  }
  return result;
}

/**
 * Whether Prettier answers an over-wide line holding this printed type alone by
 * reflowing the type itself. Exported so the measurement it encodes is pinned
 * differentially against the repo's own Prettier rather than restated in prose.
 *
 * It leaves an atomic type — a reference, a `typeof` query, a literal, and the
 * array / `keyof` / indexed-access wrappers around one — on its own over-wide
 * line, so emitting that line IS emitting Prettier's output. Anything with an
 * interior break point it opens up instead, a shape this emitter cannot author,
 * and the fix declines rather than shipping text the formatter rewrites.
 */
export function reflowsWhenOverWide(typeText: string): boolean {
  const node = parseTypeText(typeText);
  return node === null || typeReflows(node);
}

/**
 * Whether this printed type makes the whole annotation "complex" in Prettier's
 * sense, which decides the narrow regime between a head that fits and one that
 * needs its type-argument list broken.
 *
 * A `Record<K, V>` two columns over the width is normally answered by moving
 * the map to the next line, leaving the annotation whole. Prettier withholds
 * that spelling when a type argument is itself a generic reference or a
 * conditional type, and breaks the argument list instead — measured across a
 * 10x10 matrix of key/value shapes at heads 80, 81 and 82. An `import(...)`
 * type carrying arguments is NOT complex, and neither is a generic reached
 * through an array or a union member: only the argument's own top-level shape
 * counts.
 */
function forcesTypeArgumentBreak(typeText: string): boolean {
  const node = parseTypeText(typeText);
  if (node === null) {
    return false;
  }
  if (ts.isConditionalTypeNode(node)) {
    return true;
  }
  return ts.isTypeReferenceNode(node) && (node.typeArguments?.length ?? 0) > 0;
}

/**
 * How Prettier opens a map entry whose value does not fit on the entry's line.
 *
 * - `element`: a JSX element or fragment, which Prettier parenthesizes onto
 *   lines of its own.
 * - `ternary`: a conditional Prettier prints in its JSX mode, where each
 *   branch is parenthesized unless it is `null`/`undefined`, which stays
 *   inline.
 */
export type JsxBreakShape =
  | { kind: 'element' }
  | {
      kind: 'ternary';
      test: string;
      consequent: string;
      consequentNil: boolean;
      alternate: string;
      alternateNil: boolean;
    };

/**
 * The lines of one map entry whose flat spelling overflows the print width and
 * whose value is a JSX shape, or null when Prettier's answer is a layout this
 * emitter does not author (an element whose attributes it would break apart).
 *
 * The fixer copies branch values verbatim, so an entry wider than the print
 * width is text Prettier rewrites the moment it runs — churn on every file the
 * fix touches (#2107). JSX is the shape worth authoring rather than declining:
 * a component dispatch table is what this rule exists to produce, and Prettier
 * answers both of its spellings with a parenthesization that is fully
 * determined by the width.
 *
 * `null`/`undefined` is the one branch Prettier leaves inline, which is why a
 * nil branch appends to the surrounding line instead of opening one.
 */
export function jsxEntryLines(
  entryIndent: string,
  keyText: string,
  valueText: string,
  shape: JsxBreakShape,
  printWidth: number,
): string[] | null {
  const innerIndent = `${entryIndent}  `;
  const head = `${entryIndent}${keyText}: `;
  const fits = (line: string): boolean => line.length <= printWidth;

  if (shape.kind === 'element') {
    const body = `${innerIndent}${valueText}`;
    // Past the width even parenthesized, Prettier breaks the element's own
    // attribute list — a reflow of text this rule copied rather than authored.
    return fits(`${head}(`) && fits(body)
      ? [`${head}(`, body, `${entryIndent}),`]
      : null;
  }

  const lines: string[] = [];
  let pending = `${head}${shape.test} ? `;
  if (shape.consequentNil) {
    pending += `${shape.consequent} : `;
  } else {
    const body = `${innerIndent}${shape.consequent}`;
    if (!fits(body)) {
      return null;
    }
    lines.push(`${pending}(`);
    lines.push(body);
    pending = `${entryIndent}) : `;
  }
  if (shape.alternateNil) {
    lines.push(`${pending}${shape.alternate},`);
  } else {
    const body = `${innerIndent}${shape.alternate}`;
    if (!fits(body)) {
      return null;
    }
    lines.push(`${pending}(`);
    lines.push(body);
    lines.push(`${entryIndent}),`);
  }
  // The test rides the entry's own line; past the width Prettier reaches for a
  // different regime altogether rather than the one built here.
  return lines.every(fits) ? lines : null;
}

/** Why a Record body could not be emitted, spelled for the manual message. */
const DECLINE_REASONS = {
  indent:
    'a multi-line branch value is indented in different units than the fix site, so its body cannot be re-indented onto the Record — normalize the indentation, then convert',
  jsxWidth:
    'a JSX branch value overflows the print width even parenthesized on its own line, so the formatter would break its attributes apart — shorten the element, or write the Record manually',
  jsxChildren:
    'a JSX branch value nests an element child, so the formatter opens it across lines wherever it lands — break the element out into its own component or constant, then convert',
} as const;

/**
 * Why the synthesized `Record<D, V>` annotation could not ship, spelled for the
 * manual message. Each arm names the property of the annotation that failed, so
 * the reader is sent to the spelling that actually blocks the fix.
 */
const ANNOTATION_DECLINE_REASONS = {
  unparseable:
    'the branch value type does not print as a parseable annotation — write the Record with an explicit type manually',
  unresolvable:
    'the annotation would name types that are not in scope at the fix site — import them or write the Record manually',
  shadowed:
    'a nearer declaration shadows a type the annotation names, so the Record would be keyed on that declaration instead and stop gating exhaustiveness — rename the shadowing type, or write the Record manually',
} as const;

/**
 * How position-sensitive a comment is when the fix relocates it onto the
 * generated Record:
 *
 * - `next-line`: suppresses exactly the following line
 *   (`eslint-disable-next-line`, `@ts-expect-error`, `@ts-ignore`) — hosting
 *   it anywhere but directly above the line it suppressed silently changes
 *   which rules report.
 * - `own-line`: suppresses its own line (`eslint-disable-line`) — must stay on
 *   the same line as the value it annotates.
 * - `range`: opens/closes a suppression region or configures the linter
 *   (`eslint-disable`, `eslint-enable`, `eslint-env`, `eslint`, `global`,
 *   `exported`) — ESLint honors these only in block-comment form, and
 *   relocation can move the region boundary across reported lines, so the fix
 *   is never attempted around one.
 * - `none`: prose; content preservation suffices.
 */
function directiveKindOf(
  comment: TSESTree.Comment,
): 'next-line' | 'own-line' | 'range' | 'none' {
  const text = comment.value.trim();
  if (/^(eslint-disable-next-line|@ts-expect-error|@ts-ignore)\b/.test(text)) {
    return 'next-line';
  }
  if (/^eslint-disable-line\b/.test(text)) {
    return 'own-line';
  }
  if (
    comment.type === AST_TOKEN_TYPES.Block &&
    /^(eslint-disable|eslint-enable|eslint-env|eslint\b|globals?\b|exported\b)/.test(
      text,
    )
  ) {
    return 'range';
  }
  return 'none';
}

export const preferMapOverConditionalDispatch = createRule<Opts, MessageIds>({
  name: 'prefer-map-over-conditional-dispatch',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer a Record<Discriminant, Value> lookup over switch/ternary/if-else dispatch on a literal-union discriminant where every branch returns or assigns a single value.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          printWidth: {
            type: 'number',
            minimum: 1,
          },
          singleQuote: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferMap:
        'This dispatch on a literal-union discriminant maps each case to a single value; replace it with a Record<Discriminant, Value> lookup so exhaustiveness is a compile-time guarantee and adding a case is a one-line data edit.',
      preferMapManual:
        'This dispatch on a literal-union discriminant is a lookup table in disguise; prefer a Record<Discriminant, Value>. Autofix skipped: {{reason}}.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const sourceCode = context.getSourceCode();
    const printWidth =
      typeof options.printWidth === 'number' && options.printWidth > 0
        ? options.printWidth
        : DEFAULT_PRINT_WIDTH;
    // Prettier's own default, and the setting this repo and its consumer ship:
    // the emitted quote has to match the formatter's, or every fix authors a
    // line that fails `prettier --check` (#2059).
    const singleQuote = options.singleQuote !== false;
    const parserServices = sourceCode.parserServices;

    // Type-aware rule: without the TypeScript program we cannot verify the
    // discriminant is a finite literal union, so we silently skip (the plugin
    // prefers false negatives over false positives on trust-boundary switches).
    if (
      !parserServices?.program ||
      !parserServices.esTreeNodeToTSNodeMap ||
      typeof parserServices.program.getTypeChecker !== 'function'
    ) {
      return {};
    }

    const checker = parserServices.program.getTypeChecker();
    const esTreeNodeToTSNodeMap = parserServices.esTreeNodeToTSNodeMap;

    // Ternary/if forms stash their resolved discriminant here so the shared
    // `report`/fixer can recover it (switch reads `node.discriminant` directly).
    const discriminantMap = new WeakMap<TSESTree.Node, TSESTree.Node>();

    // Lookup names this pass has committed to emitting, keyed by the scope that
    // receives the declaration. The textual collision check only sees names the
    // source already carries, so without a claim two dispatches sharing a
    // trailing property name (`this.tier` and `this.#tier`, or `a.tier` and
    // `b.tier`) both emit `const RESULT_BY_TIER` into one scope, which does not
    // compile (TS2451). The key is the scope rather than the file because the
    // same name in two sibling function bodies is two independent bindings, and
    // blocking those would strand every dispatch after the first — the textual
    // check sees the first fix's output on every later run.
    const claimedNames = new Map<TSESTree.Node, Set<string>>();

    // ---- Type helpers -------------------------------------------------------

    function tsTypeOf(node: TSESTree.Node): ts.Type | null {
      try {
        const tsNode = esTreeNodeToTSNodeMap.get(node);
        if (!tsNode) {
          return null;
        }
        return checker.getTypeAtLocation(tsNode);
      } catch {
        return null;
      }
    }

    function unionPartsOf(type: ts.Type): ts.Type[] {
      return type.isUnion() ? type.types : [type];
    }

    function literalValueOf(t: ts.Type): LiteralKey | null {
      if (t.flags & ts.TypeFlags.StringLiteral) {
        return { value: (t as ts.StringLiteralType).value, kind: 'string' };
      }
      if (t.flags & ts.TypeFlags.NumberLiteral) {
        return { value: (t as ts.NumberLiteralType).value, kind: 'number' };
      }
      return null;
    }

    /**
     * Classify the discriminant's static type. The rule fires only when every
     * non-nullish constituent is a string/number literal. `undefined`/`null`
     * do not block firing but force the report-only path (they are not
     * expressible as Record keys).
     */
    function classifyDiscriminant(type: ts.Type): {
      literalKeys: LiteralKey[];
      hasNullish: boolean;
      hasOther: boolean;
    } {
      const literalKeys: LiteralKey[] = [];
      let hasNullish = false;
      let hasOther = false;
      for (const part of unionPartsOf(type)) {
        const f = part.flags;
        if (f & ts.TypeFlags.Undefined || f & ts.TypeFlags.Null) {
          hasNullish = true;
          continue;
        }
        // `boolean` is `true | false`; boolean literals are NOT literal keys.
        if (f & ts.TypeFlags.BooleanLiteral) {
          hasOther = true;
          continue;
        }
        const lit = literalValueOf(part);
        if (lit) {
          literalKeys.push(lit);
        } else {
          hasOther = true;
        }
      }
      return { literalKeys, hasNullish, hasOther };
    }

    /**
     * Resolve a case-test / equality-test node to a literal key. Handles inline
     * literals directly and constant references (e.g. `THIS_DEVICE_STATUS.active`)
     * via the checker.
     *
     * A test the checker had to resolve carries its source text along with the
     * value: the value proves the key is a literal, but emitting the value as
     * the key destroys the expression it came from. For a constant reference
     * that orphans the constant (an imported one then trips `no-unused-vars`)
     * and bakes its value into the call site, discarding the single source of
     * truth the constant exists to provide; for `case -1:` the resolved value
     * does not even print as a legal object key (`{ -1: v }` does not parse).
     * The fixer emits a computed key from the source text instead.
     */
    function resolveLiteralKey(node: TSESTree.Node): LiteralKey | null {
      if (node.type === AST_NODE_TYPES.Literal) {
        if (typeof node.value === 'string') {
          return { value: node.value, kind: 'string' };
        }
        if (typeof node.value === 'number') {
          return { value: node.value, kind: 'number' };
        }
        return null;
      }
      const type = tsTypeOf(node);
      if (!type) {
        return null;
      }
      const literal = literalValueOf(type);
      if (!literal) {
        return null;
      }
      return { ...literal, sourceText: sourceCode.getText(node) };
    }

    /**
     * The distinct printed branch value types, each already spelled as a legal
     * `|` member. The members are returned rather than joined so the emitter
     * can lay them out one per line when the joined union does not fit the
     * print width; the annotation gate still sees the flat join.
     */
    function computeValueTypeMembers(
      exprs: TSESTree.Expression[],
    ): { members: string[]; intended: IntendedSymbols } | null {
      const seen = new Set<string>();
      const parts: string[] = [];
      const intended: IntendedSymbols = new Map();
      for (const expr of exprs) {
        const type = tsTypeOf(expr);
        if (!type) {
          return null;
        }
        let widened: ts.Type;
        try {
          widened = checker.getBaseTypeOfLiteralType(type);
        } catch {
          widened = type;
        }
        let text: string;
        try {
          // Pass the expression's TS node as the enclosing declaration so the
          // printer qualifies namespaced symbols to their scoped name (e.g.
          // `JSX.Element`, not the DOM global `Element`) at the fix site.
          const enclosing = esTreeNodeToTSNodeMap.get(expr);
          text = normalizeTypeQuotes(
            checker.typeToString(widened, enclosing),
            singleQuote,
          );
        } catch {
          return null;
        }
        if (!text || text === 'error') {
          return null;
        }
        // The value side is printed from the same symbol names as the key side
        // and is captured by a shadow the same way (#2229).
        attributePrintedName(intended, text, widened);
        if (!seen.has(text)) {
          seen.add(text);
          parts.push(text);
        }
      }
      if (parts.length === 0) {
        return null;
      }
      // A sole member sits in a plain type-argument position, where function
      // type notation needs no parentheses.
      if (parts.length === 1) {
        return { members: parts, intended };
      }
      return { members: parts.map(parenthesizeForUnion), intended };
    }

    /** Whether two classified discriminant types admit exactly the same keys. */
    function sameKeySpace(
      left: ReturnType<typeof classifyDiscriminant>,
      right: ReturnType<typeof classifyDiscriminant>,
    ): boolean {
      if (left.hasOther || right.hasOther) {
        return false;
      }
      if (left.hasNullish !== right.hasNullish) {
        return false;
      }
      const spell = (keys: LiteralKey[]) =>
        new Set(keys.map((key) => `${key.kind}:${String(key.value)}`));
      const leftKeys = spell(left.literalKeys);
      const rightKeys = spell(right.literalKeys);
      return (
        leftKeys.size === rightKeys.size &&
        [...leftKeys].every((key) => rightKeys.has(key))
      );
    }

    /**
     * `ObjectType['tag']` for a tag access whose object type has a name that
     * resolves at the fix site.
     *
     * The rule's promise is that a missing key becomes a *compile* error the
     * moment the union grows, and inlining the resolved literal union does not
     * keep it: the stale `Record` still typechecks on its own, and only the
     * lookup trips TS7053 — an implicit-any diagnostic, so under
     * `noImplicitAny: false` nothing is reported at all and the lookup quietly
     * yields `undefined` for the new member. Following the property through its
     * declaring type instead puts the error on the `Record` ("Property 'c' is
     * missing"), which names what to add and does not depend on
     * `noImplicitAny` (#1926).
     *
     * A wrong annotation does not compile, so the derived spelling ships only
     * when two things hold. The printed object-type name must resolve, at the
     * fix site, to exactly the object's own type: the checker prints a symbol's
     * bare name with no regard for whether that name is reachable there (the
     * printer behaviour `validateAnnotation` exists to catch), and building an
     * unreachable name would turn a fix that used to apply into a report. And
     * the property's declared key set must equal the discriminant's, because a
     * flow-narrowed tag access (`if (o.kind === 'c') return;` above the switch)
     * leaves the declared union wider than the cases the construct covers —
     * `Holder['kind']` there demands an entry the switch has no value for.
     * Failing either, the resolved literal union stays: a weak key type beats
     * one that breaks the build.
     */
    function indexedAccessTypeText(
      discriminant: TSESTree.Node,
      discriminantType: ts.Type,
    ): string | null {
      const chain = unwrapChain(discriminant);
      if (
        chain.type !== AST_NODE_TYPES.MemberExpression ||
        chain.computed ||
        chain.property.type !== AST_NODE_TYPES.Identifier
      ) {
        return null;
      }
      const objectType = tsTypeOf(chain.object);
      const tsObjectNode = esTreeNodeToTSNodeMap.get(chain.object);
      const tsFixSite = esTreeNodeToTSNodeMap.get(discriminant);
      if (!objectType || !tsObjectNode || !tsFixSite) {
        return null;
      }
      const propertyName = chain.property.name;
      try {
        const printed = checker.typeToString(objectType, tsObjectNode);
        if (!printed || !BARE_TYPE_NAME.test(printed)) {
          return null;
        }
        const inScope = checker
          .getSymbolsInScope(
            tsFixSite,
            ts.SymbolFlags.Type | ts.SymbolFlags.Alias,
          )
          .find((symbol) => symbol.name === printed);
        if (!inScope) {
          return null;
        }
        const declaredSymbol =
          inScope.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(inScope)
            : inScope;
        if (checker.getDeclaredTypeOfSymbol(declaredSymbol) !== objectType) {
          return null;
        }
        const property = checker.getPropertyOfType(objectType, propertyName);
        if (!property) {
          return null;
        }
        const declared = checker.getTypeOfSymbolAtLocation(
          property,
          tsObjectNode,
        );
        if (
          !sameKeySpace(
            classifyDiscriminant(declared),
            classifyDiscriminant(discriminantType),
          )
        ) {
          return null;
        }
        return `${printed}[${quotedStringLiteral(propertyName, singleQuote)}]`;
      } catch {
        return null;
      }
    }

    /**
     * Key type for the emitted `Record`. A discriminant whose own type prints
     * as a bare name already carries the union's identity, so that name is
     * kept; otherwise the fix reaches for the tag's declaring type before
     * settling for the resolved literal union (#1926).
     */
    function discriminantTypeText(
      type: ts.Type,
      discriminant: TSESTree.Node,
    ): { text: string; intended: IntendedSymbols } | null {
      let printed: string | null;
      try {
        // Pass the discriminant's TS node as the enclosing declaration so the
        // printer qualifies namespaced symbols to their scoped name at the fix
        // site rather than printing an ambiguous short name.
        const enclosing = esTreeNodeToTSNodeMap.get(discriminant);
        const text = checker.typeToString(type, enclosing);
        printed = text && text !== 'error' ? text : null;
      } catch {
        printed = null;
      }
      const intended: IntendedSymbols = new Map();
      if (printed && BARE_TYPE_NAME.test(printed)) {
        // The bare name is the capturable spelling — it ships verbatim into an
        // annotation the printer never saw the position of, where a nearer
        // declaration of the same name binds it instead (#2229). Carrying the
        // symbol it was printed for is what lets the gate tell the two apart.
        attributePrintedName(intended, printed, type);
        return { text: printed, intended };
      }
      // The indexed-access spelling's own root name is left unattributed: it
      // already ships only when the name resolves, at the fix site, to exactly
      // the object's declared type, and identity of the TYPE accepts a nearer
      // alias that denotes the same type — which compiles, and reads the same.
      const text = indexedAccessTypeText(discriminant, type) ?? printed;
      return text === null
        ? null
        : { text: normalizeTypeQuotes(text, singleQuote), intended };
    }

    /**
     * Whether the binding a type name reaches at the fix site is the symbol the
     * checker printed that name for.
     *
     * A name with no attribution keeps the weaker presence answer: the printer
     * did not derive it from one symbol, so there is nothing to compare it
     * against, and manufacturing an answer there would withhold fixes that
     * compile. Import aliases are followed on both sides — a name imported at
     * the fix site is a different SYMBOL from the declaration the checker
     * printed while denoting exactly it.
     */
    function denotesIntendedSymbol(
      root: string,
      found: ts.Symbol,
      intendedSymbols: IntendedSymbols,
    ): boolean {
      if (!intendedSymbols.has(root)) {
        return true;
      }
      const intended = intendedSymbols.get(root);
      if (!intended) {
        // One name printed for two different symbols: whichever declaration
        // the fix site reaches, the other spelling is captured.
        return false;
      }
      if (found === intended) {
        return true;
      }
      const resolveAlias = (symbol: ts.Symbol): ts.Symbol => {
        if (!(symbol.flags & ts.SymbolFlags.Alias)) {
          return symbol;
        }
        try {
          return checker.getAliasedSymbol(symbol);
        } catch {
          return symbol;
        }
      };
      const target = resolveAlias(found);
      // A binding carrying no type meaning captures nothing: a type reference
      // resolves past it to a declaration this lookup does not surface, so the
      // presence answer stands rather than a guess about which one.
      if (!(target.flags & ts.SymbolFlags.Type)) {
        return true;
      }
      return target === resolveAlias(intended);
    }

    /**
     * `checker.typeToString()` prints a symbol's bare name with no regard for
     * whether that name resolves at the fix site (an unimported helper type
     * prints the same as an imported one), and exotic printer output can be
     * invalid in an annotation position. Shipping such an annotation breaks
     * the build, so the fix is gated on the synthesized text (a) parsing
     * standalone, (b) referencing only names in scope where the Record is
     * inserted, and (c) having each of those names still DENOTE the symbol it
     * was printed for. Failing the gate downgrades to the report-only path —
     * the plugin prefers a skipped fix over one that does not compile.
     *
     * (c) is not implied by (b). A nearer declaration of the same name
     * satisfies mere presence while binding the annotation to something else,
     * and the capture is silent when the shadow is compatible: the emitted
     * `Record` keeps compiling, having quietly traded the union it was keyed on
     * for the shadow's own type. That drops exactly the exhaustiveness the
     * rule's message promises — growing the real union stops failing the build
     * (#2229). The correct spelling is not derivable syntactically (the outer
     * symbol has no reachable name there at all), so the fix is withheld.
     */
    function validateAnnotation(
      annotationText: string,
      fixSite: TSESTree.Node,
      intendedSymbols: IntendedSymbols,
    ): 'ok' | 'unparseable' | 'unresolvable' | 'shadowed' {
      const sourceFile = ts.createSourceFile(
        '__annotation__.ts',
        `type __T = ${annotationText};`,
        ts.ScriptTarget.Latest,
        true,
      );
      // parseDiagnostics is absent from the public SourceFile type but always
      // populated at runtime; a diagnostic here means the annotation cannot
      // ship (e.g. printer truncation, or an unparenthesized member shape the
      // union-wrapping heuristic does not recognize).
      const parseDiagnostics = (
        sourceFile as unknown as { parseDiagnostics?: readonly unknown[] }
      ).parseDiagnostics;
      if (!parseDiagnostics || parseDiagnostics.length > 0) {
        return 'unparseable';
      }

      const typeReferenceRoots = new Set<string>();
      const typeQueryRoots = new Set<string>();
      let hasImportType = false;
      const rootNameOf = (name: ts.EntityName): string => {
        let current: ts.EntityName = name;
        while (ts.isQualifiedName(current)) {
          current = current.left;
        }
        return current.text;
      };
      const collect = (node: ts.Node): void => {
        if (ts.isTypeReferenceNode(node)) {
          typeReferenceRoots.add(rootNameOf(node.typeName));
        } else if (ts.isTypeQueryNode(node)) {
          typeQueryRoots.add(rootNameOf(node.exprName));
        } else if (ts.isImportTypeNode(node)) {
          // `import("...").T` paths printed by the checker are absolute or
          // resolver-relative — never portable source text.
          hasImportType = true;
        }
        ts.forEachChild(node, collect);
      };
      collect(sourceFile);
      if (hasImportType) {
        return 'unresolvable';
      }

      // `Record` is the wrapper this rule itself emits — a TS lib global that
      // is present in any real project. The isolated single-file program a
      // RuleTester builds loads no lib files at all, so requiring it in scope
      // would falsely downgrade every fix under test.
      typeReferenceRoots.delete('Record');
      if (typeReferenceRoots.size === 0 && typeQueryRoots.size === 0) {
        return 'ok';
      }

      const tsFixSite = esTreeNodeToTSNodeMap.get(fixSite);
      if (!tsFixSite) {
        return 'unresolvable';
      }
      try {
        const symbolsInScope = (meaning: ts.SymbolFlags): ts.Symbol[] =>
          checker.getSymbolsInScope(tsFixSite, meaning);
        if (typeReferenceRoots.size > 0) {
          const typeSymbols = symbolsInScope(
            ts.SymbolFlags.Type |
              ts.SymbolFlags.Namespace |
              ts.SymbolFlags.Alias,
          );
          // `getSymbolsInScope` walks outward from the location, so the FIRST
          // symbol under a name is the one a reference written at the fix site
          // would bind to — a nearer declaration is the one that wins.
          const typeNames = new Map<string, ts.Symbol>();
          for (const symbol of typeSymbols) {
            if (!typeNames.has(symbol.name)) {
              typeNames.set(symbol.name, symbol);
            }
          }
          for (const root of typeReferenceRoots) {
            const found = typeNames.get(root);
            if (!found) {
              return 'unresolvable';
            }
            if (!denotesIntendedSymbol(root, found, intendedSymbols)) {
              return 'shadowed';
            }
          }
        }
        if (typeQueryRoots.size > 0) {
          const valueNames = new Set(
            symbolsInScope(ts.SymbolFlags.Value | ts.SymbolFlags.Alias).map(
              (symbol) => symbol.name,
            ),
          );
          for (const root of typeQueryRoots) {
            if (!valueNames.has(root)) {
              return 'unresolvable';
            }
          }
        }
      } catch {
        return 'unresolvable';
      }
      return 'ok';
    }

    // ---- AST helpers --------------------------------------------------------

    /**
     * The expression an optional chain wraps: ESTree hangs a `ChainExpression`
     * above the OUTERMOST link of `a?.b`, so a shape test written against
     * `MemberExpression` sees a different node for a spelling that asks the same
     * question here. `?.` changes nothing this rule decides on shape — the
     * generated lookup copies the discriminant's source text verbatim
     * (`RESULT_BY_KIND[a?.b]`), so the optional link survives the fix intact, and
     * whether the chain can produce `undefined` is answered by the discriminant's
     * TYPE (`hasNullish`), never by its shape. Reading the raw node instead made
     * the narrowing carve-out unreachable and turned a `?.` on a discriminated
     * union into a false positive whose remedy does not compile (#1867).
     *
     * Only one unwrap is needed: inner links of the same chain are plain
     * `MemberExpression`s carrying `optional`, not nested `ChainExpression`s.
     */
    function unwrapChain(node: TSESTree.Node): TSESTree.Node {
      return node.type === AST_NODE_TYPES.ChainExpression
        ? node.expression
        : node;
    }

    /**
     * The link a chain-internal spelling wraps: `unwrapChain` for `?.`, plus the
     * `TSNonNullExpression` a `!` hangs around the link it asserts.
     *
     * Both wrappers sit between one link and the next while changing nothing a
     * walk down a chain is asking — `a!.b` and `a?.b` read the same property of
     * the same receiver as `a.b` — so a walk that stops at either one reports
     * the wrapper's own node type as its answer. `unwrapChain` stays the single
     * place that knows how `?.` is shaped; this composes with it so no walk
     * grows a second one (#1929).
     */
    function unwrapLink(node: TSESTree.Node): TSESTree.Node {
      let cur = unwrapChain(node);
      while (cur.type === AST_NODE_TYPES.TSNonNullExpression) {
        cur = unwrapChain(cur.expression);
      }
      return cur;
    }

    /**
     * Whether a discriminant expression is an identifier or a call-free member
     * chain rooted at one (safe to collapse repeated evaluations).
     *
     * The walk down the chain goes through `unwrapLink`, so a link spelled
     * `a?.b` or `a!.b` is read as the member access it is. Both are pure
     * property reads, so collapsing repeated evaluations of `flags?.tier` into
     * one lookup is exactly as safe as collapsing `flags.tier`, and the emitted
     * lookup copies the discriminant's source text verbatim so the spelling
     * survives the fix. Stopping at either wrapper answered "is this a member
     * chain?" with false and took the whole construct silent, while the switch
     * arm — which reads its discriminant through `unwrapChain` — reported and
     * fixed the same code: two arms disagreeing about one spelling of one
     * question (#1929).
     *
     * The OUTERMOST `!` is deliberately not stripped: `a.b!` asserts the
     * discriminant as a whole rather than a link inside it, and the name and
     * key-type derivations reach the member access through `unwrapChain`, so
     * admitting it here would emit a report no fix can serve.
     *
     * Whether the chain can yield `undefined` is decided by the discriminant's
     * TYPE (`hasNullish` routes it to the report-only path), never by its
     * shape. A computed link stays out: `a[i].b` re-reads `i`, which is the
     * evaluation this test exists to protect.
     */
    function isValidDiscriminant(node: TSESTree.Node): boolean {
      let cur: TSESTree.Node = unwrapChain(node);
      while (cur.type === AST_NODE_TYPES.MemberExpression) {
        if (cur.computed) {
          return false;
        }
        cur = unwrapLink(cur.object);
      }
      return cur.type === AST_NODE_TYPES.Identifier;
    }

    /**
     * Root of a member chain (`a.b.c` -> `a`, `this.a.b` -> `THIS_ROOT`).
     *
     * A `this`-rooted chain names its receiver with a keyword rather than a
     * binding, so it needs a sentinel to participate in root-keyed analysis at
     * all. `'this'` cannot collide with a real root: `this` is a reserved word,
     * so no identifier can ever carry that name.
     *
     * The descent goes through `unwrapLink`, because a root the walk cannot
     * name is a narrowing exemption that cannot fire: `switch (result!.kind)`
     * narrows its union exactly as `result.kind` does, so failing to reach
     * `result` reports a discriminated-union dispatch whose Record hoists
     * `result.data` out of the narrowing and does not compile (#1929).
     */
    function chainRootName(node: TSESTree.Node): string | null {
      let cur: TSESTree.Node = unwrapLink(node);
      while (cur.type === AST_NODE_TYPES.MemberExpression) {
        cur = unwrapLink(cur.object);
      }
      if (cur.type === AST_NODE_TYPES.ThisExpression) {
        return THIS_ROOT;
      }
      return cur.type === AST_NODE_TYPES.Identifier ? cur.name : null;
    }

    function isInlineLiteralKey(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.Literal &&
        (typeof node.value === 'string' || typeof node.value === 'number')
      );
    }

    /** Extract the single value produced by a run of statements, tolerating a
     * wrapping block and a trailing `break`. Returns null for any other shape. */
    function extractBranchValue(
      statements: TSESTree.Statement[],
    ): BranchValue | null {
      let stmts = statements;
      if (
        stmts.length === 1 &&
        stmts[0].type === AST_NODE_TYPES.BlockStatement
      ) {
        stmts = stmts[0].body;
      }
      if (
        stmts.length > 0 &&
        stmts[stmts.length - 1].type === AST_NODE_TYPES.BreakStatement
      ) {
        stmts = stmts.slice(0, -1);
      }
      if (stmts.length !== 1) {
        return null;
      }
      const stmt = stmts[0];
      if (stmt.type === AST_NODE_TYPES.ReturnStatement && stmt.argument) {
        return { kind: 'return', expr: stmt.argument, stmt };
      }
      if (
        stmt.type === AST_NODE_TYPES.ExpressionStatement &&
        stmt.expression.type === AST_NODE_TYPES.AssignmentExpression &&
        stmt.expression.operator === '='
      ) {
        return {
          kind: 'assign',
          target: stmt.expression.left,
          expr: stmt.expression.right,
          stmt,
        };
      }
      return null;
    }

    /**
     * True when any node in the subtree is unsafe to eager-evaluate.
     *
     * The walk stops at a function boundary, because what the `Record` literal
     * evaluates per entry is the branch value itself, not what that value does
     * when it is later invoked. A branch value that IS a function is already
     * the thunk the report-only message asks for: its body runs on invocation,
     * after the lookup, so a call inside it can no more fire per entry than a
     * call inside any other uninvoked function. Scanning through the boundary
     * declined every function-valued dispatch whose body did anything but
     * arithmetic, and told the author to write the very shape they had (#2062).
     *
     * The boundary answers `await` too, and answers it correctly in both
     * directions: an `await` is eager exactly when it is evaluated where the
     * literal is built, so a top-level one still blocks, while one inside an
     * `async` branch value — the only place it can legally appear inside a
     * function — is suspended until that value is called.
     *
     * A class expression is deliberately not a boundary: its static
     * initializers, static blocks and computed member names all run when the
     * class definition is evaluated, which is per entry.
     */
    function containsEagerUnsafe(node: TSESTree.Node): boolean {
      let found = false;
      const visit = (n: unknown): void => {
        if (found || !n || typeof n !== 'object') {
          return;
        }
        const anyNode = n as Record<string, unknown> & { type?: string };
        if (typeof anyNode.type !== 'string') {
          return;
        }
        if (EAGER_UNSAFE_NODES.has(anyNode.type)) {
          found = true;
          return;
        }
        if (FUNCTION_TYPES.has(anyNode.type)) {
          // A parameter decorator is the one position inside a function that
          // does not wait for a call: it is evaluated with the enclosing class
          // definition, which the `Record` literal performs for every entry.
          for (const param of (anyNode.params as unknown[]) ?? []) {
            const decorators = (param as { decorators?: unknown[] } | null)
              ?.decorators;
            for (const decorator of decorators ?? []) {
              visit(decorator);
            }
          }
          return;
        }
        for (const key of Object.keys(anyNode)) {
          if (key === 'parent') {
            continue;
          }
          const val = anyNode[key];
          if (Array.isArray(val)) {
            for (const child of val) {
              visit(child);
            }
          } else {
            visit(val);
          }
        }
      };
      visit(node);
      return found;
    }

    /** Whether the subtree references an identifier with the given name in a
     * non-property-key position (i.e., an actual read of that binding). */
    function referencesIdentifier(node: TSESTree.Node, name: string): boolean {
      let found = false;
      const visit = (n: unknown, parent?: Record<string, unknown>): void => {
        if (found || !n || typeof n !== 'object') {
          return;
        }
        const anyNode = n as Record<string, unknown> & { type?: string };
        if (typeof anyNode.type !== 'string') {
          return;
        }
        if (
          anyNode.type === AST_NODE_TYPES.Identifier &&
          anyNode.name === name
        ) {
          // Ignore non-computed property names / object-literal keys — those
          // are not references to the outer binding.
          const isMemberProperty =
            parent &&
            parent.type === AST_NODE_TYPES.MemberExpression &&
            parent.property === anyNode &&
            parent.computed === false;
          const isPropertyKey =
            parent &&
            parent.type === AST_NODE_TYPES.Property &&
            parent.key === anyNode &&
            parent.computed === false;
          if (!isMemberProperty && !isPropertyKey) {
            found = true;
            return;
          }
        }
        for (const key of Object.keys(anyNode)) {
          if (key === 'parent') {
            continue;
          }
          const val = anyNode[key];
          if (Array.isArray(val)) {
            for (const child of val) {
              visit(child, anyNode);
            }
          } else {
            visit(val, anyNode);
          }
        }
      };
      visit(node);
      return found;
    }

    /**
     * Whether the subtree reads the receiver of the enclosing scope — the `this`
     * counterpart of `referencesIdentifier`. Nested `function`/class bodies are
     * skipped because their `this` is a different receiver, so a `this` inside
     * one is no more a read of the narrowed object than an identifier of the
     * same name declared in an inner scope would be.
     */
    function referencesThis(node: TSESTree.Node): boolean {
      let found = false;
      const visit = (n: unknown): void => {
        if (found || !n || typeof n !== 'object') {
          return;
        }
        const anyNode = n as Record<string, unknown> & { type?: string };
        if (typeof anyNode.type !== 'string') {
          return;
        }
        if (anyNode.type === AST_NODE_TYPES.ThisExpression) {
          found = true;
          return;
        }
        if (THIS_REBINDING_TYPES.has(anyNode.type)) {
          return;
        }
        for (const key of Object.keys(anyNode)) {
          if (key === 'parent') {
            continue;
          }
          const val = anyNode[key];
          if (Array.isArray(val)) {
            for (const child of val) {
              visit(child);
            }
          } else {
            visit(val);
          }
        }
      };
      visit(node);
      return found;
    }

    /**
     * Whether the subtree names an ECMA private member (`o.#f`, `#f in o`).
     * Such a name resolves only lexically inside the class body that declares
     * it, so text carrying one cannot be moved out of that body.
     */
    function referencesPrivateName(node: TSESTree.Node): boolean {
      let found = false;
      const visit = (n: unknown): void => {
        if (found || !n || typeof n !== 'object') {
          return;
        }
        const anyNode = n as Record<string, unknown> & { type?: string };
        if (typeof anyNode.type !== 'string') {
          return;
        }
        if (anyNode.type === AST_NODE_TYPES.PrivateIdentifier) {
          found = true;
          return;
        }
        for (const key of Object.keys(anyNode)) {
          if (key === 'parent') {
            continue;
          }
          const val = anyNode[key];
          if (Array.isArray(val)) {
            for (const child of val) {
              visit(child);
            }
          } else {
            visit(val);
          }
        }
      };
      visit(node);
      return found;
    }

    /**
     * Whether the ternary form's hoist would carry a branch value out of the
     * class body that gives it meaning.
     *
     * Only the ternary hoists: it inserts the `Record` before the enclosing
     * statement, and inside a class that statement can be the class declaration
     * itself (a field initializer or a `static` block has no statement of its
     * own inside the body). The lookup that replaces the construct stays put —
     * a `#private` discriminant is still read where it was written — but the
     * branch VALUES travel with the `Record`, and `this` or `#f` in one of them
     * does not resolve at module scope (TS18013/TS18016, and a `this` that is
     * no longer the instance). Values that name neither are free to move, so
     * the test is on what the hoisted text needs, not on where it started.
     */
    function hoistLeavesClassBody(
      node: TSESTree.Node,
      values: TSESTree.Expression[],
    ): boolean {
      let stmt: TSESTree.Node = node;
      let crossesClassBody = false;
      while (stmt.parent && !CONTAINER_TYPES.has(stmt.parent.type)) {
        stmt = stmt.parent;
        if (stmt.type === AST_NODE_TYPES.ClassBody) {
          crossesClassBody = true;
        }
      }
      if (!crossesClassBody) {
        return false;
      }
      return values.some(
        (value) => referencesThis(value) || referencesPrivateName(value),
      );
    }

    /**
     * Whether stepping from `child` up to `parent` crosses a boundary that
     * decides WHETHER — or how many times — the child is evaluated, or that
     * owns bindings the child may read.
     *
     * The question is about the child's POSITION, not the parent's type alone:
     * an `if` test, a `for` init and a `for…of` right-hand side are evaluated
     * exactly once, before control reaches the construct they head, so text
     * lifted out of them runs precisely when it used to. A while/do-while test
     * is re-evaluated per iteration, so it is a boundary like the bodies are.
     */
    function crossingGuardsEvaluation(
      child: TSESTree.Node,
      parent: TSESTree.Node,
    ): boolean {
      switch (parent.type) {
        case AST_NODE_TYPES.IfStatement:
          return parent.test !== child;
        case AST_NODE_TYPES.WhileStatement:
        case AST_NODE_TYPES.DoWhileStatement:
          return true;
        case AST_NODE_TYPES.ForStatement:
          return parent.init !== child;
        case AST_NODE_TYPES.ForInStatement:
        case AST_NODE_TYPES.ForOfStatement:
          return parent.right !== child;
        case AST_NODE_TYPES.LogicalExpression:
          // `&&`/`||`/`??` evaluate the right operand only for some values of
          // the left; the left operand always runs.
          return parent.right === child;
        case AST_NODE_TYPES.ConditionalExpression:
          return parent.test !== child;
        default:
          return false;
      }
    }

    /**
     * Whether the ternary form's hoist would carry the branch values across a
     * guard that decides whether they are evaluated, or out of a scope that
     * owns bindings they read.
     *
     * The hoist walk treats a braceless body as transparent — it stops only at
     * a `BlockStatement`/`Program`/`SwitchCase` — so `if (box) return kind ===
     * 'a' ? box.a.v : box.b.v;` lands the `Record` ABOVE the guard and
     * dereferences both values with the narrowing left behind (#1990). Braces
     * are what make the hoist safe: with them the walk stops inside the guarded
     * block, where the values are still narrowed and every loop binding is
     * still in scope, so the boundary test also cures the scope violation that
     * hoisting out of `for (const r of rows)` produces (TS2304).
     *
     * Nothing else sees this: the branch values are ordinary member reads, so
     * `EAGER_UNSAFE_NODES` passes them, and `isNarrowingExempt` inspects only
     * narrowing by the discriminant's own root, never narrowing applied by a
     * surrounding statement.
     */
    function hoistCrossesGuard(node: TSESTree.Node): boolean {
      let child: TSESTree.Node = node;
      while (child.parent && !CONTAINER_TYPES.has(child.parent.type)) {
        if (crossingGuardsEvaluation(child, child.parent)) {
          return true;
        }
        child = child.parent;
      }
      return false;
    }

    // ---- Name derivation ----------------------------------------------------

    function toUpperSnake(name: string): string {
      return name
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
    }

    /**
     * `RESULT_BY_<KEY>` for a discriminant, or why no such name is available.
     *
     * The trailing member property may be spelled as an ECMA private field
     * (`this.#tier`). `#tier` and a `private tier` declared on the same class
     * are the same privacy, they are mutually exclusive (`private #tier` is
     * TS18010), and the parser hands the name over with the `#` already
     * stripped — so the derivation has a perfectly ordinary identifier to work
     * with and both spellings arrive at the same `RESULT_BY_TIER`. Reading the
     * `#` spelling as "no name derivable" withheld the fix from it and reported
     * a reason that was false (#1941).
     *
     * The name is only a name: it is not the private member and does not read
     * it. A sibling public `tier` on the same class is a different member that
     * the fix neither reads nor shadows — the emitted lookup copies the
     * discriminant's source text verbatim, so `this.#tier` stays `this.#tier`.
     * What the two spellings do share is the derived constant, which is why the
     * name has to be claimed rather than merely tested against the source text:
     * two dispatches in one scope both emitting `const RESULT_BY_TIER` do not
     * compile (TS2451).
     */
    function deriveLookupName(
      discriminant: TSESTree.Node,
      fixScope: TSESTree.Node,
    ): NameDerivation {
      const target = unwrapChain(discriminant);
      let key: string | null = null;
      if (target.type === AST_NODE_TYPES.Identifier) {
        key = target.name;
      } else if (
        target.type === AST_NODE_TYPES.MemberExpression &&
        !target.computed &&
        (target.property.type === AST_NODE_TYPES.Identifier ||
          target.property.type === AST_NODE_TYPES.PrivateIdentifier)
      ) {
        key = target.property.name;
      }
      if (!key) {
        return { kind: 'underivable' };
      }
      const snake = toUpperSnake(key);
      if (!snake) {
        return { kind: 'underivable' };
      }
      const name = `RESULT_BY_${snake}`;
      // Conservative collision check: any textual occurrence of the name, or a
      // claim staked by an earlier dispatch in this file, blocks the autofix (a
      // false collision only downgrades to report-only).
      if (
        claimedNames.get(fixScope)?.has(name) ||
        new RegExp(`\\b${name}\\b`).test(sourceCode.getText())
      ) {
        return { kind: 'taken', name };
      }
      return { kind: 'ok', name };
    }

    /**
     * The statement a ternary's generated declaration is inserted before. The
     * conditional is an expression, so the declaration cannot take its place;
     * it is hoisted to the nearest enclosing statement, whose indentation the
     * emitted head is measured against.
     */
    function hoistTargetOf(node: TSESTree.Node): TSESTree.Node {
      let stmt: TSESTree.Node = node;
      while (stmt.parent && !CONTAINER_TYPES.has(stmt.parent.type)) {
        stmt = stmt.parent;
      }
      return stmt;
    }

    /**
     * The node whose children the generated `const` joins — the scope its
     * binding lives in. A ternary hoists to the enclosing statement, so its
     * declaration lands beside that statement; every other form is replaced in
     * place, so the declaration lands beside the construct. A `const` written
     * into a `case` clause is scoped to the whole `switch` block, so the clause
     * answers with the statement that owns that block.
     */
    function fixScopeOf(node: TSESTree.Node, form: Analysis['form']) {
      const stmt = form === 'expr' ? hoistTargetOf(node) : node;
      const container = stmt.parent ?? stmt;
      return container.type === AST_NODE_TYPES.SwitchCase
        ? container.parent ?? container
        : container;
    }

    // ---- Fix construction ---------------------------------------------------

    function formatKey(key: LiteralKey): string {
      if (key.sourceText !== undefined) {
        // Computed key preserving the constant reference the case tested on.
        // Type-safe by construction: the fix is reached only after the checker
        // resolved this expression to a string/number *literal* type, so the
        // computed key is a literal key and the Record stays exhaustive.
        return `[${key.sourceText}]`;
      }
      if (key.kind === 'number') {
        return String(key.value);
      }
      const str = String(key.value);
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(str)) {
        return str;
      }
      return quotedStringLiteral(str, singleQuote);
    }

    function indentOf(node: TSESTree.Node): string {
      const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
      const before = line.slice(0, node.loc.start.column);
      const match = /[ \t]*$/.exec(before);
      return match ? match[0] : '';
    }

    /** The leading whitespace of the line `offset` sits on. */
    function lineIndentAt(offset: number): string {
      const text = sourceCode.getText();
      const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
      const match = /^[ \t]*/.exec(text.slice(lineStart, offset));
      return match ? match[0] : '';
    }

    /**
     * The depth the copied expression's interior lines were written against.
     *
     * `indentOf` answers a different question — the whitespace immediately
     * before the node — which on `return function () {` is the single space
     * after `return`. What the interior is measured from is the column the
     * expression's own closing line sits at, so that line is read when there is
     * one. A branch of a broken ternary is written one step in from its line's
     * indentation (Prettier's `? ` alignment) and only its closing line records
     * that step; keying on the opening line would rebase it one step too far.
     */
    function copiedBaseIndent(expr: TSESTree.Node): string {
      const text = sourceCode.getText(expr);
      const lastLine = text.slice(text.lastIndexOf('\n') + 1);
      const closer = /^([ \t]*)(?:[)\]}]|<\/)/.exec(lastLine);
      return closer ? closer[1] : lineIndentAt(expr.range[0]);
    }

    /**
     * Ranges whose interior line breaks carry string data rather than layout. A
     * multi-line template literal evaluates to the whitespace written inside
     * it, so shifting those lines would change the value the code produces.
     */
    function stringDataRangesOf(node: TSESTree.Node): TSESTree.Range[] {
      return sourceCode
        .getTokens(node)
        .filter(
          (token) =>
            (token.type === AST_TOKEN_TYPES.Template ||
              token.type === AST_TOKEN_TYPES.String) &&
            token.loc.start.line !== token.loc.end.line,
        )
        .map((token) => token.range);
    }

    /**
     * A branch value's source text with its continuation lines moved to the
     * depth the map entry sits at, or null when that move is not expressible.
     *
     * A copied multi-line value keeps the columns it had at its original
     * nesting depth, which is rarely the entry's (#2061). The first line is
     * excluded because it is spliced in after the `key: ` prefix and has no
     * indentation of its own left to adjust — re-indenting it is the usual
     * off-by-one. A source indented in the other unit than the fix site has no
     * expressible delta at all, and the caller declines rather than emitting a
     * mangled body.
     */
    function rebasedValueText(entry: Entry, toIndent: string): string | null {
      const { valueExpr, valueText } = entry;
      if (!valueExpr || !valueText.includes('\n')) {
        return valueText;
      }
      const shiftLine = lineShifterBetween(
        copiedBaseIndent(valueExpr),
        toIndent,
      );
      if (!shiftLine) {
        return null;
      }
      const stringData = stringDataRangesOf(valueExpr);
      const carriesStringData = (offset: number) =>
        stringData.some(([start, end]) => start < offset && offset < end);

      let offset = valueExpr.range[0];
      return valueText
        .split('\n')
        .map((line, index) => {
          const lineStart = offset;
          offset += line.length + 1;
          if (
            index === 0 ||
            line.trim() === '' ||
            carriesStringData(lineStart)
          ) {
            return line;
          }
          return shiftLine(line);
        })
        .join('\n');
    }

    /**
     * Whether `node` sits where Prettier breaks after the operator, leaving the
     * expression alone on the next line.
     */
    function isWrapAbsorbingPosition(
      node: TSESTree.Node,
      parent: TSESTree.Node,
    ): boolean {
      switch (parent.type) {
        case AST_NODE_TYPES.VariableDeclarator:
          return parent.init === node;
        case AST_NODE_TYPES.AssignmentExpression:
          return parent.right === node;
        case AST_NODE_TYPES.Property:
          return parent.value === node && !parent.shorthand;
        default:
          return false;
      }
    }

    /**
     * A rewrite of the fix site, replacing `range` with `text`. `preserved`
     * names the comments inside `range` that `text` re-emits verbatim, so the
     * comment gate can tell a comment the edit carries from one it deletes.
     */
    type LookupEdit = {
      range: TSESTree.Range;
      text: string;
      preserved?: TSESTree.Comment[];
    };

    /**
     * The reported node together with the outer edges of the text a replacement
     * may cover: the node itself, or the parentheses standing around it that the
     * lookup does not need. Absorption is measured from those edges, so a
     * parenthesized conditional joins onto its host by the same rules as a bare
     * one and the two widenings compose into a single edit.
     */
    type FixSpan = {
      node: TSESTree.Node;
      left: TSESTree.Node | TSESTree.Token;
      right: TSESTree.Node | TSESTree.Token;
    };

    /**
     * The opening parenthesis the PARENT's own syntax puts in front of `node` —
     * an `if`/`while`/`switch`/`with` head, a lone call or `new` argument, a
     * `do…while` test, `import(...)`. Such a pair delimits the parent rather
     * than grouping the expression, and dropping it does not parse.
     *
     * A call with more than one argument needs no entry: the token on one side
     * of any argument is then a comma, so no pair is seen around it at all.
     */
    function parentSyntaxParen(
      node: TSESTree.Node,
      parent: TSESTree.Node,
    ): TSESTree.Token | null {
      const parenAfter = (preceding: TSESTree.Node) =>
        sourceCode.getTokenAfter(preceding, {
          filter: (token) => token.value === '(',
        });
      switch (parent.type) {
        case AST_NODE_TYPES.CallExpression:
        case AST_NODE_TYPES.NewExpression:
          return parent.arguments.length === 1 && parent.arguments[0] === node
            ? parenAfter(parent.callee)
            : null;
        case AST_NODE_TYPES.DoWhileStatement:
          return parent.test === node ? parenAfter(parent.body) : null;
        case AST_NODE_TYPES.IfStatement:
        case AST_NODE_TYPES.WhileStatement:
          return parent.test === node
            ? sourceCode.getFirstToken(parent, 1)
            : null;
        case AST_NODE_TYPES.SwitchStatement:
          return parent.discriminant === node
            ? sourceCode.getFirstToken(parent, 1)
            : null;
        case AST_NODE_TYPES.WithStatement:
          return parent.object === node
            ? sourceCode.getFirstToken(parent, 1)
            : null;
        case AST_NODE_TYPES.ImportExpression:
          return parent.source === node
            ? sourceCode.getFirstToken(parent, 1)
            : null;
        default:
          return null;
      }
    }

    /**
     * The parentheses standing around `node` that the emitted lookup does not
     * need — the outermost such pair, so a nested grouping goes with it.
     *
     * Precedence is a property of the REPLACEMENT text, not of the expression
     * being replaced: a computed member access is the tightest-binding
     * production there is, so no enclosing operator can require a pair around
     * one. Parentheses a ternary genuinely needed (`(k === 'a' ? 1 : 2) > 0`
     * parses differently without them) are therefore redundant the moment the
     * lookup takes its place, and keeping them ships
     * `if ((RESULT_BY_KIND[kind]) > 0)` — text the next `prettier --write`
     * strips, so the fix is not a fixed point (#2063).
     *
     * Two pairs are not the expression's own grouping and stay: one the
     * parent's syntax requires, and one a decorator requires, whose grammar
     * admits no computed access at all (`@(cond)` cannot become `@X[k]`).
     */
    function redundantParens(
      node: TSESTree.Node,
    ): { open: TSESTree.Token; close: TSESTree.Token } | null {
      const parent = node.parent;
      if (!parent || parent.type === AST_NODE_TYPES.Decorator) {
        return null;
      }
      const syntaxParen = parentSyntaxParen(node, parent);
      let pair: { open: TSESTree.Token; close: TSESTree.Token } | null = null;
      let open = sourceCode.getTokenBefore(node);
      let close = sourceCode.getTokenAfter(node);
      while (
        open !== null &&
        close !== null &&
        open !== syntaxParen &&
        open.type === AST_TOKEN_TYPES.Punctuator &&
        open.value === '(' &&
        close.type === AST_TOKEN_TYPES.Punctuator &&
        close.value === ')'
      ) {
        pair = { open, close };
        open = sourceCode.getTokenBefore(open);
        close = sourceCode.getTokenAfter(close);
      }
      return pair;
    }

    /**
     * The ternary's replacement, widened over text the lookup makes redundant —
     * the parentheses that used to bind the conditional, and the host's line
     * break when the shortened host fits on one line; null when only the
     * expression itself should be replaced.
     *
     * The break exists only because the ternary used to be wide; a lookup is
     * short, and Prettier answers the shortened host by joining it back onto one
     * line (#2060). This is the mirror of measuring an inserted head: the fixer
     * SHORTENS, so every line it writes is well inside the width and nothing
     * about the emitted text reveals the stale wrap — which is equally true of
     * the stale parentheses (#2063).
     *
     * Measure, do not always-join: a host that is over-width for a reason the
     * ternary never caused — a long binding name, a wide type annotation —
     * keeps a wrap Prettier would put straight back.
     */
    function absorbedLookupEdit(
      node: TSESTree.Node,
      lookupText: string,
    ): LookupEdit | null {
      const parent = node.parent;
      if (!parent) {
        return null;
      }
      const parens = redundantParens(node);
      const span: FixSpan = {
        node,
        left: parens?.open ?? node,
        right: parens?.close ?? node,
      };
      const parenEdit: LookupEdit | null =
        parens === null
          ? null
          : {
              range: [parens.open.range[0], parens.close.range[1]],
              text: lookupText,
            };
      // Widest first: a host join is measured from the parentheses' outer
      // edges, so where one applies it already carries the paren widening. A
      // candidate whose span would delete a comment steps down to the next,
      // narrower one rather than withholding the conversion.
      const candidates = [
        absorbedOperatorWrap(span, parent, lookupText),
        absorbedArgumentWrap(span, parent, lookupText),
        parenEdit,
      ];
      return (
        candidates.find(
          (edit): edit is LookupEdit =>
            edit !== null && !absorbsComment(node, edit),
        ) ?? null
      );
    }

    /**
     * Whether the margins an absorbing edit adds around `node` hold a comment.
     *
     * The absorbed span is wider than the reported node, so a comment can sit in
     * it while being adjacent to neither end — between Prettier's dangling comma
     * and the call's closer, say, which `getCommentsAfter(node)` does not reach
     * because it stops at the comma. Absorbing that span deletes text the fixer
     * does not own.
     *
     * Only the MARGINS are asked about, not the whole span: a comment inside the
     * expression itself goes with the expression under either spelling, so
     * declining there would cost the join and save nothing. The join is a layout
     * optimization, so dropping it and replacing the expression in place keeps
     * both the conversion and the comment.
     *
     * Measured against the reported node whatever the edit spans, this is the
     * single gate for every widening: the parenthesis absorption (#2063) adds
     * exactly such a margin, and a comment written between a parenthesis and the
     * expression it groups sits in it.
     *
     * A comment the edit's own text re-emits is not absorbed — it is moved, and
     * the emitter owns where it lands.
     */
    function absorbsComment(node: TSESTree.Node, edit: LookupEdit): boolean {
      const preserved = new Set(edit.preserved ?? []);
      return sourceCode
        .getAllComments()
        .some(
          (comment) =>
            !preserved.has(comment) &&
            ((comment.range[1] > edit.range[0] &&
              comment.range[0] < node.range[0]) ||
              (comment.range[1] > node.range[1] &&
                comment.range[0] < edit.range[1])),
        );
    }

    /**
     * The comments lying wholly inside `[start, end)`, or null when one of them
     * cannot travel with a join.
     *
     * A directive is excluded whatever its content: which line
     * `eslint-disable-line` covers, and which line `eslint-disable-next-line`
     * suppresses, are both decided by where the comment sits, so a join that
     * moves it changes which rules report. `allowLine` is false where the joined
     * text continues after the comment — a `//` comment there would swallow the
     * rest of the line.
     */
    function joinableComments(
      start: number,
      end: number,
      allowLine: boolean,
    ): TSESTree.Comment[] | null {
      const comments = sourceCode
        .getAllComments()
        .filter(
          (comment) => comment.range[0] >= start && comment.range[1] <= end,
        );
      const travels = comments.every(
        (comment) =>
          directiveKindOf(comment) === 'none' &&
          (allowLine || comment.type === AST_TOKEN_TYPES.Block),
      );
      return travels ? comments : null;
    }

    /**
     * The text between `start` and `end` with every comment cut out, split at
     * the comments. The first segment is the one a terminator may sit in:
     * Prettier prints a trailing comment AFTER the statement's semicolon, so a
     * comment written before the terminator is a token move this emitter does
     * not author and the join is declined there.
     */
    function segmentsAround(
      start: number,
      end: number,
      comments: TSESTree.Comment[],
    ): string[] {
      const text = sourceCode.getText();
      const segments: string[] = [];
      let cursor = start;
      for (const comment of comments) {
        segments.push(text.slice(cursor, comment.range[0]));
        cursor = comment.range[1];
      }
      segments.push(text.slice(cursor, end));
      return segments;
    }

    /** The join for a host that broke after `=` / `:` (see `absorbedLookupEdit`). */
    function absorbedOperatorWrap(
      span: FixSpan,
      parent: TSESTree.Node,
      lookupText: string,
    ): LookupEdit | null {
      if (
        !WRAP_ABSORBING_PARENTS.has(parent.type) ||
        !isWrapAbsorbingPosition(span.node, parent)
      ) {
        return null;
      }
      const prevToken = sourceCode.getTokenBefore(span.left);
      if (!prevToken || prevToken.loc.end.line === span.left.loc.start.line) {
        return null;
      }
      // Joining across a comment would pull the lookup onto a `//` line, which
      // comments the value out.
      if (sourceCode.getCommentsBefore(span.left).length > 0) {
        return null;
      }
      const headLine = sourceCode.lines[prevToken.loc.end.line - 1] ?? '';
      if (headLine.slice(prevToken.loc.end.column).trim() !== '') {
        return null;
      }
      const tailLine = sourceCode.lines[span.right.loc.end.line - 1] ?? '';
      const lineEnd = sourceCode.getIndexFromLoc({
        line: span.right.loc.end.line,
        column: tailLine.length,
      });
      // A trailing comment travels with the line it is on, so joining moves it
      // up whole and the fixer never rewrites it — Prettier joins the same host
      // the same way (#2107). Anything else past the span's own terminator (a
      // closing paren the span does not own) means joining does not produce one
      // line.
      const tailComments = joinableComments(span.right.range[1], lineEnd, true);
      if (tailComments === null) {
        return null;
      }
      const segments = segmentsAround(
        span.right.range[1],
        lineEnd,
        tailComments,
      );
      if (
        !/^[ \t]*[,;]?[ \t]*$/.test(segments[0]) ||
        segments.slice(1).some((segment) => segment.trim() !== '')
      ) {
        return null;
      }
      // A `//` comment is a line suffix Prettier does not measure, so the width
      // is read from the code and any block comment before it — the same split
      // Prettier makes when it decides whether the host fits.
      const lineComment = tailComments.find(
        (comment) => comment.type === AST_TOKEN_TYPES.Line,
      );
      const measuredTail = sourceCode
        .getText()
        .slice(span.right.range[1], lineComment?.range[0] ?? lineEnd)
        .trimEnd();
      const head = headLine.slice(0, prevToken.loc.end.column);
      const joined = `${head} ${lookupText}${measuredTail}`;
      return joined.length <= printWidth
        ? {
            range: [prevToken.range[1], span.right.range[1]],
            text: ` ${lookupText}`,
          }
        : null;
    }

    /**
     * The join for a call broken open around its sole argument. Absorbing the
     * whole interior — both breaks and the dangling comma Prettier adds with
     * them — is what makes the shortened call a fixed point; keeping the comma
     * would leave `render(RESULT[x],);`, which Prettier rewrites again.
     */
    function absorbedArgumentWrap(
      span: FixSpan,
      parent: TSESTree.Node,
      lookupText: string,
    ): LookupEdit | null {
      if (
        (parent.type !== AST_NODE_TYPES.CallExpression &&
          parent.type !== AST_NODE_TYPES.NewExpression) ||
        parent.arguments.length !== 1 ||
        parent.arguments[0] !== span.node
      ) {
        return null;
      }
      const openParen = sourceCode.getTokenBefore(span.left);
      const closeParen = sourceCode.getLastToken(parent);
      if (
        !openParen ||
        !closeParen ||
        openParen.value !== '(' ||
        closeParen.value !== ')' ||
        openParen.loc.end.line === closeParen.loc.start.line
      ) {
        return null;
      }
      // Parentheses the span does not own would otherwise be swallowed: the
      // token trail from the span's right edge to the call's closer must hold
      // nothing but Prettier's dangling comma.
      const afterNode = sourceCode.getTokenAfter(span.right);
      const afterComma =
        afterNode && afterNode.value === ','
          ? sourceCode.getTokenAfter(afterNode)
          : afterNode;
      if (afterComma !== closeParen) {
        return null;
      }
      // The whole interior is rewritten, so a comment in it is not swallowed
      // but re-emitted around the lookup — which is where Prettier puts one
      // when it joins the same call, whichever side of the dangling comma it
      // was written on (#2107). Only a block comment can make that trip: a `//`
      // one would comment out the closer.
      const before = joinableComments(
        openParen.range[1],
        span.left.range[0],
        false,
      );
      const after = joinableComments(
        span.right.range[1],
        closeParen.range[0],
        false,
      );
      if (before === null || after === null) {
        return null;
      }
      const text = [
        ...before.map((comment) => sourceCode.getText(comment)),
        lookupText,
        ...after.map((comment) => sourceCode.getText(comment)),
      ].join(' ');
      const headLine = sourceCode.lines[openParen.loc.end.line - 1] ?? '';
      const tailLine = sourceCode.lines[closeParen.loc.start.line - 1] ?? '';
      if (
        headLine.slice(openParen.loc.end.column).trim() !== '' ||
        tailLine.slice(0, closeParen.loc.start.column).trim() !== ''
      ) {
        return null;
      }
      const joined = `${headLine.slice(
        0,
        openParen.loc.end.column,
      )}${text}${tailLine.slice(closeParen.loc.start.column).trimEnd()}`;
      return joined.length <= printWidth
        ? {
            range: [openParen.range[1], closeParen.range[0]],
            text,
            preserved: [...before, ...after],
          }
        : null;
    }

    /**
     * The emitted declaration's head lines and the indentation its map entries
     * take. The two travel together: the spelling that moves the map onto its
     * own line indents the whole literal one step further in.
     */
    type RecordLayout = { head: string[]; bodyIndent: string };

    /**
     * One `Record<...>` type argument as Prettier lays it out once the argument
     * list has broken: on its own line while that line fits, and past the width
     * one member per line behind a leading `|`. Null when neither spelling
     * fits and the overflowing member is one Prettier would reflow internally —
     * a shape this emitter cannot author, so the fix declines rather than
     * shipping text `prettier --check` rejects.
     */
    function typeArgumentLines(
      members: string[],
      separator: string,
      baseIndent: string,
    ): string[] | null {
      const flat = `${baseIndent}  ${members.join(' | ')}${separator}`;
      if (flat.length <= printWidth) {
        return [flat];
      }
      if (members.length === 1) {
        return reflowsWhenOverWide(members[0]) ? null : [flat];
      }
      const lines: string[] = [];
      for (const [index, member] of members.entries()) {
        const tail = index === members.length - 1 ? separator : '';
        const line = `${baseIndent}  | ${member}${tail}`;
        if (line.length > printWidth && reflowsWhenOverWide(member)) {
          return null;
        }
        lines.push(line);
      }
      return lines;
    }

    /**
     * The declaration head, plus the indentation its map entries take. The
     * first head line carries no indentation of its own — it is written at the
     * construct's position, which already sits at `baseIndent`.
     *
     * Measure, do not always-wrap: Prettier collapses a hand-broken
     * `Record<Mode, string>` straight back onto one line, so an unconditional
     * wrap would trade this overflow for its mirror image on every short
     * dispatch. Prettier answers a head that does not fit in three measured
     * regimes, each reproduced here and each verified against the repo's own
     * Prettier at widths 60/80/100/120 and indents 0-3:
     *
     * - the whole head fits: keep it on one line;
     * - only the text through the `=` fits: the map opens on the next line,
     *   one indent step in (this window is exactly two columns wide, since the
     *   head is that text plus ` {`) — unless the annotation is "complex", a
     *   spelling Prettier answers by breaking the arguments instead;
     * - neither fits: break the `Record<...>` type-argument list open.
     *
     * Null when no spelling within the width exists.
     */
    function buildRecordLayout(
      name: string,
      dMembers: string[],
      vMembers: string[],
      baseIndent: string,
    ): RecordLayout | null {
      const dText = dMembers.join(' | ');
      const vText = vMembers.join(' | ');
      const declaration = `const ${name}: Record<${dText}, ${vText}> =`;
      if (baseIndent.length + declaration.length + 2 <= printWidth) {
        return { head: [`${declaration} {`], bodyIndent: baseIndent };
      }
      const complexAnnotation =
        forcesTypeArgumentBreak(dText) || forcesTypeArgumentBreak(vText);
      if (
        !complexAnnotation &&
        baseIndent.length + declaration.length <= printWidth
      ) {
        return {
          head: [declaration, `${baseIndent}  {`],
          bodyIndent: `${baseIndent}  `,
        };
      }
      const keyLines = typeArgumentLines(dMembers, ',', baseIndent);
      const valueLines = typeArgumentLines(vMembers, '', baseIndent);
      if (!keyLines || !valueLines) {
        return null;
      }
      return {
        head: [
          `const ${name}: Record<`,
          ...keyLines,
          ...valueLines,
          `${baseIndent}> = {`,
        ],
        bodyIndent: baseIndent,
      };
    }

    /** Whether Prettier reads this node as JSX for layout purposes. */
    function isJsxNode(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.JSXElement ||
        node.type === AST_NODE_TYPES.JSXFragment
      );
    }

    /**
     * Whether Prettier opens this JSX element across lines whatever the width.
     * An element child forces the break; text and expression containers — even
     * one holding JSX — do not, so `<Row>{cond && <Inner />}</Row>` stays flat
     * while `<Row><Inner /></Row>` cannot.
     *
     * A value this is true of is one the emitter cannot place on an entry at
     * all: re-indenting the opened element is a reflow of text the fixer
     * copied rather than authored.
     */
    function forcesJsxOpen(node: TSESTree.Node): boolean {
      if (!isJsxNode(node)) {
        return false;
      }
      const { children } = node as TSESTree.JSXElement | TSESTree.JSXFragment;
      return children.some((child) => isJsxNode(child));
    }

    /**
     * Whether the entry's value carries a force-opened element directly or on
     * a ternary branch — the two positions the fixer copies a value from.
     */
    function carriesOpenedJsx(node: TSESTree.Node | undefined): boolean {
      if (!node) {
        return false;
      }
      if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return forcesJsxOpen(node.consequent) || forcesJsxOpen(node.alternate);
      }
      return forcesJsxOpen(node);
    }

    /** `null` / `undefined` — the ternary branches Prettier leaves inline. */
    function isNilBranch(node: TSESTree.Node): boolean {
      return (
        (node.type === AST_NODE_TYPES.Literal && node.value === null) ||
        (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined')
      );
    }

    /**
     * How Prettier would open this over-wide value, or null when the value is
     * not one of the JSX shapes whose broken layout is width-determined — the
     * emitter then leaves the entry flat, which is what Prettier keeps for
     * every other over-wide value this corpus reaches.
     *
     * Two shapes are excluded deliberately, because Prettier answers them with
     * a different regime rather than the parenthesization built here: a
     * conditional whose test is binaryish breaks after the `:` instead
     * (`shouldBreakAfterOperator`), and a chained ternary alternate is printed
     * inline rather than parenthesized.
     */
    function jsxBreakShapeOf(
      expr: TSESTree.Node | undefined,
      valueText: string,
    ): JsxBreakShape | null {
      if (!expr || sourceCode.getText(expr) !== valueText) {
        return null;
      }
      if (isJsxNode(expr)) {
        return { kind: 'element' };
      }
      if (expr.type !== AST_NODE_TYPES.ConditionalExpression) {
        return null;
      }
      const { test, consequent, alternate } = expr;
      if (
        test.type === AST_NODE_TYPES.LogicalExpression ||
        test.type === AST_NODE_TYPES.BinaryExpression ||
        alternate.type === AST_NODE_TYPES.ConditionalExpression
      ) {
        return null;
      }
      if (!isJsxNode(consequent) && !isJsxNode(alternate)) {
        return null;
      }
      const parts = {
        test: sourceCode.getText(test),
        consequent: sourceCode.getText(consequent),
        alternate: sourceCode.getText(alternate),
      };
      // Reassembly has to be exact: anything between the operands that is not
      // the canonical spacing (a comment, an extra parenthesis pair) is text
      // this emitter would drop when it lays the branches out itself.
      return `${parts.test} ? ${parts.consequent} : ${parts.alternate}` ===
        valueText
        ? {
            kind: 'ternary',
            ...parts,
            consequentNil: isNilBranch(consequent),
            alternateNil: isNilBranch(alternate),
          }
        : null;
    }

    /**
     * The emitted declaration, or the reason it cannot be emitted. The caller
     * decides on a failure before reporting, because it changes which message
     * the construct gets.
     */
    function buildRecordText(
      layout: RecordLayout,
      entries: Entry[],
    ): { text: string } | { failure: 'indent' | 'jsxWidth' | 'jsxChildren' } {
      const { bodyIndent } = layout;
      const entryIndent = `${bodyIndent}  `;
      const lines: string[] = [];
      for (const e of entries) {
        const valueText = rebasedValueText(e, entryIndent);
        if (valueText === null) {
          return { failure: 'indent' };
        }
        for (const comment of e.leadingComments ?? []) {
          lines.push(`${entryIndent}${comment}`);
        }
        const trailing =
          e.trailingComments && e.trailingComments.length > 0
            ? ` ${e.trailingComments.join(' ')}`
            : '';
        const keyText = formatKey(e.key);
        const flat = `${entryIndent}${keyText}: ${valueText},`;
        const singleLine = !valueText.includes('\n');
        const innerIndent = `${entryIndent}  `;

        // An element already broken across lines is one Prettier answers by
        // parenthesizing it in a value position, so the entry opens and the
        // copied body is re-indented a step further in. Every other
        // multi-line value — a function body above all — sits unwrapped.
        if (!singleLine && e.valueExpr && isJsxNode(e.valueExpr)) {
          const nested = rebasedValueText(e, innerIndent);
          if (nested === null) {
            return { failure: 'indent' };
          }
          const body = `${innerIndent}${nested}`;
          if (body.split('\n').some((line) => line.length > printWidth)) {
            return { failure: 'jsxWidth' };
          }
          lines.push(
            `${entryIndent}${keyText}: (`,
            body,
            `${entryIndent}),${trailing}`,
          );
          continue;
        }

        // A flat element Prettier would open anyway cannot be placed at all:
        // re-indenting the opened form is a reflow of copied text.
        if (singleLine && carriesOpenedJsx(e.valueExpr)) {
          return { failure: 'jsxChildren' };
        }
        // Past the width, a flat entry is a line Prettier lays out differently.
        const shape =
          singleLine && flat.length > printWidth
            ? jsxBreakShapeOf(e.valueExpr, valueText)
            : null;
        if (shape === null) {
          lines.push(`${flat}${trailing}`);
          continue;
        }
        const broken = jsxEntryLines(
          entryIndent,
          keyText,
          valueText,
          shape,
          printWidth,
        );
        if (broken === null) {
          return { failure: 'jsxWidth' };
        }
        lines.push(
          ...broken.slice(0, -1),
          `${broken[broken.length - 1]}${trailing}`,
        );
      }
      return {
        text: [...layout.head, ...lines, `${bodyIndent}};`].join('\n'),
      };
    }

    // ---- Comment hosting ----------------------------------------------------

    /**
     * A branch's value statement (or ternary value expression), used to decide
     * which generated map entry hosts the comments attributed to that branch.
     * `entryCount > 1` marks a grouped-case branch that expands into several
     * entries — a line-targeted directive cannot cover all of them at once.
     */
    type CommentAnchor = {
      range: TSESTree.Range;
      startLine: number;
      endLine: number;
      entryIndex: number;
      entryCount: number;
    };

    /**
     * Decides where every comment inside the replaced construct lands on the
     * generated Record, mutating `entries` with the hosted text. Comments
     * inside a carried span (a branch value expression, the discriminant, the
     * assignment target) survive verbatim inside the copied text; comments
     * inside a dropped span (an unreachable default/tail) die together with
     * the code they annotate, which is not an orphaning. Every other comment
     * must be hosted onto a map entry — leading comments go on the line(s)
     * directly above the entry, same-line trailing comments append after it.
     * Returns false when a comment cannot be hosted without changing what it
     * annotates or suppresses; the caller then withholds the autofix so a
     * directive is never silently deleted or retargeted.
     */
    function planCommentHosting(args: {
      container: TSESTree.Node;
      carriedSpans: TSESTree.Range[];
      droppedSpans: TSESTree.Range[];
      anchors: CommentAnchor[];
      entries: Entry[];
    }): boolean {
      const { container, carriedSpans, droppedSpans, anchors, entries } = args;
      const ordered = [...anchors].sort((a, b) => a.range[0] - b.range[0]);
      const hostLeading = (entry: Entry, text: string): void => {
        entry.leadingComments = [...(entry.leadingComments ?? []), text];
      };
      const hostTrailing = (entry: Entry, text: string): void => {
        entry.trailingComments = [...(entry.trailingComments ?? []), text];
      };

      for (const comment of sourceCode.getCommentsInside(container)) {
        const [cStart, cEnd] = comment.range;
        const within = (spans: TSESTree.Range[]): boolean =>
          spans.some(([start, end]) => cStart >= start && cEnd <= end);
        if (within(carriedSpans) || within(droppedSpans)) {
          continue;
        }
        const kind = directiveKindOf(comment);
        if (kind === 'range') {
          return false;
        }
        const text = sourceCode.getText(comment);

        // Same-line trailing (`doThing(); // note`): append to the entry line
        // so an `eslint-disable-line` keeps suppressing the line its value
        // lands on. The last matching anchor wins so a comment trailing two
        // same-line statements attaches to the nearer one.
        const trailingCandidates = ordered.filter(
          (anchor) =>
            anchor.endLine === comment.loc.start.line &&
            cStart >= anchor.range[1],
        );
        const trailingAnchor =
          trailingCandidates[trailingCandidates.length - 1];
        if (trailingAnchor) {
          if (kind === 'next-line') {
            // A trailing disable-next-line targets whatever follows the
            // statement; the generated map has no equivalent following line.
            return false;
          }
          if (kind === 'own-line' && trailingAnchor.entryCount > 1) {
            return false;
          }
          hostTrailing(entries[trailingAnchor.entryIndex], text);
          continue;
        }

        // A comment inside the value statement but outside the copied
        // expression (`return /* why */ value;`) belongs to that branch.
        const containingAnchor = ordered.find(
          (anchor) => cStart >= anchor.range[0] && cEnd <= anchor.range[1],
        );
        const leadingAnchor =
          containingAnchor ?? ordered.find((anchor) => anchor.range[0] >= cEnd);
        if (!leadingAnchor) {
          return false;
        }
        if (kind === 'next-line') {
          // Host a line-targeted directive only when it provably targeted the
          // branch's value line, so relocation preserves — never widens or
          // drops — the suppression.
          if (
            leadingAnchor.entryCount > 1 ||
            leadingAnchor.startLine !== comment.loc.end.line + 1
          ) {
            return false;
          }
        }
        hostLeading(entries[leadingAnchor.entryIndex], text);
      }
      return true;
    }

    // ---- Core analysis result ----------------------------------------------

    type Entry = {
      key: LiteralKey;
      valueText: string;
      /**
       * The node `valueText` was copied from, so a multi-line value can be
       * re-indented against the depth the emitted entry sits at.
       */
      valueExpr?: TSESTree.Node;
      /** Comments emitted on their own line(s) directly above the entry. */
      leadingComments?: string[];
      /** Comments appended after the entry's trailing comma. */
      trailingComments?: string[];
    };

    type Analysis = {
      // Ordered Record entries (only meaningful when autofixable).
      entries: Entry[];
      // Expressions that will materialize as Record values (for eager check).
      contributingValues: TSESTree.Expression[];
      dText: string;
      // The symbols the bare names in `dText` were printed for, so the
      // annotation gate can tell a name that still denotes them from one a
      // nearer declaration captures.
      dIntended: IntendedSymbols;
      // 'return' | 'assign' for switch/if forms; 'expr' for ternary.
      form: 'return' | 'assign' | 'expr';
      assignTargetText?: string;
      fullCoverage: boolean;
      hasNullish: boolean;
      // False when the fix cannot be safely placed (ternary inside an
      // expression-bodied function) — forces the report-only path.
      canPlaceFix: boolean;
      // True when a comment inside the construct cannot be hosted on the
      // generated Record without changing what it annotates or suppresses —
      // forces the report-only path rather than destroying the comment.
      commentBlocked: boolean;
    };

    /**
     * Given ordered explicit branches + optional tail, resolve coverage against
     * the union's literal keys and (when full) the ordered Record entries.
     * Returns null when the construct is not a qualifying dispatch at all.
     */
    function resolveCoverage(
      explicit: {
        keys: LiteralKey[];
        valueText: string;
        valueExpr: TSESTree.Node;
      }[],
      unionKeys: LiteralKey[],
      tail: { valueText: string; valueExpr: TSESTree.Node } | null,
    ): {
      entries: Entry[];
      fullCoverage: boolean;
      remainingCount: number;
    } | null {
      const unionValues = new Set(unionKeys.map((k) => String(k.value)));
      const explicitValues = new Set<string>();
      for (const branch of explicit) {
        for (const k of branch.keys) {
          const s = String(k.value);
          if (!unionValues.has(s) || explicitValues.has(s)) {
            // Key outside the union, or duplicated — bail entirely.
            return null;
          }
          explicitValues.add(s);
        }
      }
      const remaining = unionKeys.filter(
        (k) => !explicitValues.has(String(k.value)),
      );

      const entries: Entry[] = [];
      for (const branch of explicit) {
        for (const k of branch.keys) {
          entries.push({
            key: k,
            valueText: branch.valueText,
            valueExpr: branch.valueExpr,
          });
        }
      }

      if (remaining.length === 0) {
        // Full coverage; any tail is unreachable for typed values and dropped.
        return { entries, fullCoverage: true, remainingCount: 0 };
      }
      if (remaining.length === 1 && tail) {
        entries.push({
          key: remaining[0],
          valueText: tail.valueText,
          valueExpr: tail.valueExpr,
        });
        return { entries, fullCoverage: true, remainingCount: 1 };
      }
      if (!tail) {
        // Not exhaustive and no default/else — genuine control flow, skip.
        return null;
      }
      // Partial coverage relying on a shared default — report-only.
      return { entries, fullCoverage: false, remainingCount: remaining.length };
    }

    /**
     * Why the fix was withheld, in the words of the condition that actually
     * withheld it. Every arm here is a fact about the reported code, so a
     * reason that is emitted is a reason that is true — a report-only message
     * blaming the wrong condition sends the author to fix something that is not
     * broken (#1941).
     */
    function manualReason(flags: {
      fullCoverage: boolean;
      hasNullish: boolean;
      eagerSafe: boolean;
      canPlaceFix: boolean;
      hoistEscapesClass: boolean;
      hoistCrossesGuard: boolean;
      inStatementList: boolean;
      commentSafe: boolean;
      derivation: NameDerivation | null;
    }): string {
      if (flags.hasNullish) {
        return 'the union includes undefined/null, which cannot be a Record key — use Partial<Record<D, V>> with a ?? fallback';
      }
      if (!flags.fullCoverage) {
        return 'the default/else covers multiple union members — use Partial<Record<D, V>> with a ?? fallback';
      }
      if (!flags.eagerSafe) {
        return 'a branch value invokes a call/await and would run eagerly for every entry — use a thunk Record<D, () => V> invoked after lookup';
      }
      if (!flags.canPlaceFix) {
        return 'the dispatch sits inside an expression-bodied function; extract the Record manually so it stays in scope';
      }
      if (flags.hoistEscapesClass) {
        return 'the Record would hoist outside the class body, where the branch values’ `this`/`#private` reads do not resolve; extract it manually inside the class';
      }
      if (flags.hoistCrossesGuard) {
        return 'the Record would hoist above the guard or loop that decides whether the branch values are evaluated, dropping their narrowing and any binding the guard scopes; add braces around the branch — or lift the guarded expression into its own statement — then convert';
      }
      if (!flags.inStatementList) {
        return 'the dispatch is the whole body of a braceless branch, where a declaration is not allowed; add braces around it, then convert';
      }
      if (!flags.commentSafe) {
        return 'a comment inside the dispatch cannot be carried onto the generated Record without changing what it annotates or suppresses — relocate the comment, then convert';
      }
      if (flags.derivation?.kind === 'taken') {
        return `the lookup name ${flags.derivation.name} is already taken in this file — rename the colliding binding, or write the Record manually`;
      }
      return 'no lookup name could be derived from the discriminant';
    }

    function report(node: TSESTree.Node, analysis: Analysis): void {
      const {
        entries,
        contributingValues,
        dText,
        dIntended,
        form,
        assignTargetText,
        fullCoverage,
        hasNullish,
        canPlaceFix,
        commentBlocked,
      } = analysis;

      const eagerSafe = contributingValues.every(
        (expr) => !containsEagerUnsafe(expr),
      );

      const hoistEscapesClass =
        form === 'expr' && hoistLeavesClassBody(node, contributingValues);

      // Only the ternary hoists; every other form is replaced where it stands,
      // so no guard can be crossed.
      const crossesGuard = form === 'expr' && hoistCrossesGuard(node);

      // Every non-ternary form replaces the construct with a declaration plus a
      // statement, which needs a statement LIST to land in. As the sole body of
      // a braceless `if`/`else`/loop the construct sits where exactly one
      // statement is allowed and a lexical declaration is not allowed at all
      // (TS1156), so the fix waits for braces.
      const inStatementList =
        form === 'expr' ||
        (node.parent !== undefined &&
          STATEMENT_LIST_TYPES.has(node.parent.type));

      const fixScope = fixScopeOf(node, form);
      let derivation: NameDerivation | null = null;
      // Name derivation is only needed for the autofix path.
      if (
        fullCoverage &&
        !hasNullish &&
        eagerSafe &&
        canPlaceFix &&
        !hoistEscapesClass &&
        !crossesGuard &&
        inStatementList &&
        !commentBlocked
      ) {
        derivation = deriveLookupName(discriminantOf(node), fixScope);
      }

      if (derivation === null || derivation.kind !== 'ok') {
        context.report({
          node,
          messageId: 'preferMapManual',
          data: {
            reason: manualReason({
              fullCoverage,
              hasNullish,
              eagerSafe,
              canPlaceFix,
              hoistEscapesClass,
              hoistCrossesGuard: crossesGuard,
              inStatementList,
              commentSafe: !commentBlocked,
              derivation,
            }),
          },
        });
        return;
      }

      const lookupName = derivation.name;
      const valueTypes = computeValueTypeMembers(contributingValues);
      if (!valueTypes) {
        context.report({
          node,
          messageId: 'preferMapManual',
          data: {
            reason:
              'the branch value type could not be resolved for the annotation',
          },
        });
        return;
      }
      const vMembers = valueTypes.members;

      // Both sides of the `Record` are printed from symbols, so both carry
      // their attributions into the gate together.
      const intendedSymbols: IntendedSymbols = new Map(dIntended);
      mergeIntendedSymbols(intendedSymbols, valueTypes.intended);

      // The gate parses `type __T = ...;` standalone, so it reads the flat
      // annotation whatever layout the emitter settles on for it.
      const verdict = validateAnnotation(
        `Record<${dText}, ${vMembers.join(' | ')}>`,
        discriminantOf(node),
        intendedSymbols,
      );
      if (verdict !== 'ok') {
        context.report({
          node,
          messageId: 'preferMapManual',
          data: {
            reason: ANNOTATION_DECLINE_REASONS[verdict],
          },
        });
        return;
      }

      // A ternary hoists its declaration to the enclosing statement's line;
      // every other form is replaced where it stands. The head is laid out
      // against the print width here rather than inside the fixer, because a
      // head with no spelling within the width withholds the fix altogether
      // and so changes which message is reported.
      const fixTarget = form === 'expr' ? hoistTargetOf(node) : node;
      const baseIndent = indentOf(fixTarget);
      const layout = buildRecordLayout(
        lookupName,
        printedUnionMembers(dText),
        vMembers,
        baseIndent,
      );
      if (!layout) {
        context.report({
          node,
          messageId: 'preferMapManual',
          data: {
            reason:
              'the Record annotation does not fit the print width in any layout the formatter would keep — shorten the branch value types, or write the Record manually',
          },
        });
        return;
      }

      // Built here rather than inside the fixer: a value whose indentation
      // cannot be rebased withholds the fix, which changes which message this
      // construct gets, and a fixer runs long after that decision is made.
      const built = buildRecordText(layout, entries);
      if ('failure' in built) {
        context.report({
          node,
          messageId: 'preferMapManual',
          data: {
            reason: DECLINE_REASONS[built.failure],
          },
        });
        return;
      }
      const recordText = built.text;

      // Claimed only once every gate has passed, so a dispatch that ends up
      // report-only never blocks a later one from using the name.
      const claimed = claimedNames.get(fixScope) ?? new Set<string>();
      claimed.add(lookupName);
      claimedNames.set(fixScope, claimed);

      context.report({
        node,
        messageId: 'preferMap',
        fix(fixer) {
          const discText = sourceCode.getText(discriminantOf(node));
          if (form === 'expr') {
            // Ternary: insert the Record before the enclosing statement and
            // replace the conditional expression with the lookup, taking the
            // host's stale line break with it when the shortened host fits.
            const lookupText = `${lookupName}[${discText}]`;
            const absorbed = absorbedLookupEdit(node, lookupText);
            return [
              fixer.insertTextBefore(fixTarget, `${recordText}\n${baseIndent}`),
              absorbed === null
                ? fixer.replaceText(node, lookupText)
                : fixer.replaceTextRange(absorbed.range, absorbed.text),
            ];
          }

          const lookup =
            form === 'assign'
              ? `${assignTargetText} = ${lookupName}[${discText}];`
              : `return ${lookupName}[${discText}];`;
          return fixer.replaceText(
            node,
            `${recordText}\n${baseIndent}${lookup}`,
          );
        },
      });
    }

    function discriminantOf(node: TSESTree.Node): TSESTree.Node {
      if (node.type === AST_NODE_TYPES.SwitchStatement) {
        return node.discriminant;
      }
      // For ternary/if we stash the discriminant on a WeakMap.
      return discriminantMap.get(node) ?? node;
    }

    // ---- Shared type gate + narrowing exemption -----------------------------

    /**
     * Type gate (Edge Case 4): fire only when every non-nullish union member is
     * a string/number literal. Returns the union keys + nullish flag, or null to
     * skip entirely (boolean/open string/number/object/function discriminants).
     */
    function typeGate(discriminant: TSESTree.Node): {
      unionKeys: LiteralKey[];
      hasNullish: boolean;
      dText: string;
      dIntended: IntendedSymbols;
    } | null {
      const type = tsTypeOf(discriminant);
      if (!type) {
        return null;
      }
      const { literalKeys, hasNullish, hasOther } = classifyDiscriminant(type);
      if (literalKeys.length === 0 || hasOther) {
        return null;
      }
      const printed = discriminantTypeText(type, discriminant);
      if (!printed || !printed.text) {
        return null;
      }
      return {
        unionKeys: literalKeys,
        hasNullish,
        dText: printed.text,
        dIntended: printed.intended,
      };
    }

    /**
     * Narrowing exemption (Edge Case 1): when the discriminant is `obj.tag`, a
     * flat Record cannot express variant narrowing. If any KEPT branch value
     * references the base object beyond the tag access itself, do not fire.
     *
     * `this.obj.tag` narrows identically — the receiver is reached through a
     * keyword instead of a binding, which changes nothing about what the Record
     * would lose (hoisting `this.obj.data` out of the switch drops the narrowing
     * and the emitted code no longer typechecks), so a `this`-rooted chain is
     * matched against `this` reads in the kept branches.
     *
     * `obj?.tag` narrows identically too — TypeScript discriminates a union
     * through an optional chain — so the discriminant is unwrapped before its
     * shape is read. A nullable discriminant is exactly where `?.` gets written,
     * and reading the `ChainExpression` as "not a member access" skipped this
     * carve-out entirely (#1867). `obj.tag!` and `obj!.tag` are the same access
     * under an assertion and are unwrapped for the same reason: a carve-out
     * that a spelling can switch off is a carve-out for one spelling (#1929).
     */
    function isNarrowingExempt(
      discriminant: TSESTree.Node,
      keptValues: TSESTree.Expression[],
    ): boolean {
      const chain = unwrapLink(discriminant);
      if (chain.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }
      const root = chainRootName(chain);
      if (!root) {
        return false;
      }
      const readsRoot =
        root === THIS_ROOT
          ? referencesThis
          : (value: TSESTree.Expression) => referencesIdentifier(value, root);
      return keptValues.some(readsRoot);
    }

    // ---- Switch form --------------------------------------------------------

    function handleSwitch(node: TSESTree.SwitchStatement): void {
      // Parse cases into branches, grouping empty-consequent fallthrough cases
      // onto the following case's body.
      type ParsedBranch = {
        tests: (TSESTree.Node | null)[];
        value: BranchValue | null;
        // The case clause holding the consequent — the source region a
        // dropped default's comments legitimately die with.
        caseNode: TSESTree.SwitchCase;
      };
      const parsed: ParsedBranch[] = [];
      let pending: (TSESTree.Node | null)[] = [];
      for (const c of node.cases) {
        if (c.consequent.length === 0) {
          pending.push(c.test);
          continue;
        }
        const value = extractBranchValue(c.consequent);
        parsed.push({ tests: [...pending, c.test], value, caseNode: c });
        pending = [];
      }
      if (pending.length > 0) {
        // Trailing empty cases falling through to nothing — malformed.
        return;
      }
      if (parsed.length === 0) {
        return;
      }

      // Separate explicit branches from the default; disallow mixed groups.
      const explicit: { keys: LiteralKey[]; value: BranchValue }[] = [];
      let defaultValue: BranchValue | null | undefined;
      let hasDefault = false;
      let defaultCaseNode: TSESTree.SwitchCase | null = null;
      for (const branch of parsed) {
        const literalTests = branch.tests.filter(
          (t): t is TSESTree.Node => t !== null,
        );
        const isDefaultGroup = literalTests.length !== branch.tests.length;
        if (isDefaultGroup) {
          if (literalTests.length > 0) {
            // `default: case 'x':` mixed group — bail (rare).
            return;
          }
          hasDefault = true;
          defaultValue = branch.value;
          defaultCaseNode = branch.caseNode;
          continue;
        }
        if (!branch.value) {
          // A non-default branch that is not a single value — control flow.
          return;
        }
        const keys: LiteralKey[] = [];
        for (const test of literalTests) {
          const key = resolveLiteralKey(test);
          if (!key) {
            return;
          }
          keys.push(key);
        }
        explicit.push({ keys, value: branch.value });
      }

      if (explicit.length === 0) {
        return;
      }

      // Consistent kind/target across contributing branches.
      const kind = explicit[0].value.kind;
      const assignTargetText =
        kind === 'assign'
          ? sourceCode.getText(
              (explicit[0].value as { target: TSESTree.Node }).target,
            )
          : undefined;
      for (const branch of explicit) {
        if (branch.value.kind !== kind) {
          return;
        }
        if (
          kind === 'assign' &&
          sourceCode.getText(
            (branch.value as { target: TSESTree.Node }).target,
          ) !== assignTargetText
        ) {
          return;
        }
      }

      // Determine tail value from the default (only usable if it is a value).
      const defaultVal: BranchValue | null =
        hasDefault && defaultValue != null ? defaultValue : null;
      if (defaultVal && defaultVal.kind !== kind) {
        return;
      }
      if (
        defaultVal &&
        kind === 'assign' &&
        sourceCode.getText((defaultVal as { target: TSESTree.Node }).target) !==
          assignTargetText
      ) {
        return;
      }

      const gated = typeGate(node.discriminant);
      if (!gated) {
        return;
      }
      const { unionKeys, hasNullish, dText, dIntended } = gated;

      // Compute coverage.
      const explicitForCoverage = explicit.map((b) => ({
        keys: b.keys,
        valueText: sourceCode.getText(b.value.expr),
        valueExpr: b.value.expr,
      }));
      const tail = defaultVal
        ? {
            valueText: sourceCode.getText(defaultVal.expr),
            valueExpr: defaultVal.expr,
          }
        : null;

      // A throwing/omitted default cannot satisfy a needed tail: when the
      // remaining members are guarded (not value-mapped), `resolveCoverage`
      // returns null because there is no usable tail, so the construct is not a
      // pure lookup and is skipped below.
      const coverage = resolveCoverage(explicitForCoverage, unionKeys, tail);
      if (!coverage) {
        return;
      }

      // Kept values (materialize as Record entries / shared fallback): explicit
      // branches always, plus the default only when the tail is used.
      const contributingValues = explicit.map((b) => b.value.expr);
      if (coverage.remainingCount >= 1 && defaultVal) {
        contributingValues.push(defaultVal.expr);
      }

      if (isNarrowingExempt(node.discriminant, contributingValues)) {
        return;
      }

      // Comment hosting only gates the autofix path (partial coverage is
      // already report-only), so it is planned for full coverage alone.
      let commentBlocked = false;
      if (coverage.fullCoverage) {
        const tailUsed = coverage.remainingCount === 1 && defaultVal !== null;
        const carriedSpans: TSESTree.Range[] = [node.discriminant.range];
        const droppedSpans: TSESTree.Range[] = [];
        const anchors: CommentAnchor[] = [];
        let entryIndex = 0;
        for (const branch of explicit) {
          carriedSpans.push(branch.value.expr.range);
          anchors.push({
            range: branch.value.stmt.range,
            startLine: branch.value.stmt.loc.start.line,
            endLine: branch.value.stmt.loc.end.line,
            entryIndex,
            entryCount: branch.keys.length,
          });
          entryIndex += branch.keys.length;
        }
        if (kind === 'assign' && explicit[0].value.kind === 'assign') {
          carriedSpans.push(explicit[0].value.target.range);
        }
        if (tailUsed && defaultVal) {
          carriedSpans.push(defaultVal.expr.range);
          anchors.push({
            range: defaultVal.stmt.range,
            startLine: defaultVal.stmt.loc.start.line,
            endLine: defaultVal.stmt.loc.end.line,
            entryIndex: coverage.entries.length - 1,
            entryCount: 1,
          });
        } else if (defaultCaseNode) {
          // The unreachable default is deleted wholesale; its comments —
          // including any directly above the `default:` label — annotate
          // deleted code and die with it.
          const caseIndex = node.cases.indexOf(defaultCaseNode);
          const droppedStart =
            caseIndex > 0
              ? node.cases[caseIndex - 1].range[1]
              : node.discriminant.range[1];
          droppedSpans.push([droppedStart, defaultCaseNode.range[1]]);
        }
        commentBlocked = !planCommentHosting({
          container: node,
          carriedSpans,
          droppedSpans,
          anchors,
          entries: coverage.entries,
        });
      }

      report(node, {
        entries: coverage.entries,
        contributingValues,
        dText,
        dIntended,
        form: kind,
        assignTargetText,
        fullCoverage: coverage.fullCoverage,
        hasNullish,
        canPlaceFix: true,
        commentBlocked,
      });
    }

    // ---- Ternary form -------------------------------------------------------

    function equalityDiscriminant(
      test: TSESTree.Node,
    ): { discNode: TSESTree.Node; keyNode: TSESTree.Node } | null {
      if (
        test.type !== AST_NODE_TYPES.BinaryExpression ||
        test.operator !== '==='
      ) {
        return null;
      }
      const { left, right } = test;
      let discNode: TSESTree.Node | null = null;
      let keyNode: TSESTree.Node | null = null;
      if (isInlineLiteralKey(left) && !isInlineLiteralKey(right)) {
        keyNode = left;
        discNode = right;
      } else if (isInlineLiteralKey(right) && !isInlineLiteralKey(left)) {
        keyNode = right;
        discNode = left;
      } else {
        return null;
      }
      if (!isValidDiscriminant(discNode)) {
        return null;
      }
      return { discNode, keyNode };
    }

    function handleConditional(node: TSESTree.ConditionalExpression): void {
      const head = equalityDiscriminant(node.test);
      if (!head) {
        return;
      }
      const discText = sourceCode.getText(head.discNode);

      // Skip chain continuations — only the outermost link reports.
      if (
        node.parent?.type === AST_NODE_TYPES.ConditionalExpression &&
        node.parent.alternate === node
      ) {
        const parentHead = equalityDiscriminant(node.parent.test);
        if (
          parentHead &&
          sourceCode.getText(parentHead.discNode) === discText
        ) {
          return;
        }
      }

      // Walk the chain.
      const links: { keyNode: TSESTree.Node; expr: TSESTree.Expression }[] = [];
      let cur: TSESTree.Expression = node;
      while (cur.type === AST_NODE_TYPES.ConditionalExpression) {
        const link = equalityDiscriminant(cur.test);
        if (!link || sourceCode.getText(link.discNode) !== discText) {
          break;
        }
        links.push({ keyNode: link.keyNode, expr: cur.consequent });
        cur = cur.alternate;
      }
      const tailExpr = cur;
      if (links.length === 0) {
        return;
      }

      const explicitKeys: LiteralKey[][] = [];
      for (const link of links) {
        const key = resolveLiteralKey(link.keyNode);
        if (!key) {
          return;
        }
        explicitKeys.push([key]);
      }

      const gated = typeGate(head.discNode);
      if (!gated) {
        return;
      }
      const { unionKeys, hasNullish, dText, dIntended } = gated;

      const explicitForCoverage = links.map((l, i) => ({
        keys: explicitKeys[i],
        valueText: sourceCode.getText(l.expr),
        valueExpr: l.expr,
      }));
      const coverage = resolveCoverage(explicitForCoverage, unionKeys, {
        valueText: sourceCode.getText(tailExpr),
        valueExpr: tailExpr,
      });
      if (!coverage) {
        return;
      }

      // Contributing values: links, plus tail only when it is kept.
      const contributingValues = links.map((l) => l.expr);
      if (coverage.remainingCount >= 1) {
        contributingValues.push(tailExpr);
      }

      if (isNarrowingExempt(head.discNode, contributingValues)) {
        return;
      }

      // A ternary hoists its Record to the enclosing statement; if that crosses
      // a function boundary the values/discriminant may fall out of scope, so
      // the fix cannot be placed safely there — downgrade to report-only.
      let stmt: TSESTree.Node = node;
      let crossesFunction = false;
      while (stmt.parent && !CONTAINER_TYPES.has(stmt.parent.type)) {
        stmt = stmt.parent;
        if (FUNCTION_TYPES.has(stmt.type)) {
          crossesFunction = true;
        }
      }

      let commentBlocked = false;
      if (coverage.fullCoverage) {
        const tailUsed = coverage.remainingCount === 1;
        const carriedSpans: TSESTree.Range[] = [
          head.discNode.range,
          ...links.map((l) => l.expr.range),
        ];
        const droppedSpans: TSESTree.Range[] = [];
        const anchors: CommentAnchor[] = links.map((l, i) => ({
          range: l.expr.range,
          startLine: l.expr.loc.start.line,
          endLine: l.expr.loc.end.line,
          entryIndex: i,
          entryCount: 1,
        }));
        if (tailUsed) {
          carriedSpans.push(tailExpr.range);
          anchors.push({
            range: tailExpr.range,
            startLine: tailExpr.loc.start.line,
            endLine: tailExpr.loc.end.line,
            entryIndex: coverage.entries.length - 1,
            entryCount: 1,
          });
        } else {
          // The unreachable tail is deleted; comments between the last kept
          // consequent and the tail's end annotate deleted code.
          droppedSpans.push([
            links[links.length - 1].expr.range[1],
            tailExpr.range[1],
          ]);
        }
        commentBlocked = !planCommentHosting({
          container: node,
          carriedSpans,
          droppedSpans,
          anchors,
          entries: coverage.entries,
        });
      }

      discriminantMap.set(node, head.discNode);
      report(node, {
        entries: coverage.entries,
        contributingValues,
        dText,
        dIntended,
        form: 'expr',
        fullCoverage: coverage.fullCoverage,
        hasNullish,
        canPlaceFix: !crossesFunction,
        commentBlocked,
      });
    }

    // ---- if / else-if form --------------------------------------------------

    function handleIf(node: TSESTree.IfStatement): void {
      const head = equalityDiscriminant(node.test);
      if (!head) {
        return;
      }
      const discText = sourceCode.getText(head.discNode);

      // Skip continuations (this if is the else-if of a same-discriminant chain).
      if (
        node.parent?.type === AST_NODE_TYPES.IfStatement &&
        node.parent.alternate === node
      ) {
        const parentHead = equalityDiscriminant(node.parent.test);
        if (
          parentHead &&
          sourceCode.getText(parentHead.discNode) === discText
        ) {
          return;
        }
      }

      const links: { keyNode: TSESTree.Node; value: BranchValue }[] = [];
      let tail: BranchValue | null = null;
      // The final else statement/block and the end of the consequent before
      // it — the source region a dropped tail's comments die with.
      let tailNode: TSESTree.Statement | null = null;
      let tailPrevEnd = 0;
      let cur: TSESTree.IfStatement | null = node;
      while (cur) {
        const link = equalityDiscriminant(cur.test);
        if (!link || sourceCode.getText(link.discNode) !== discText) {
          return;
        }
        const value = extractBranchValue([cur.consequent]);
        if (!value) {
          return;
        }
        links.push({ keyNode: link.keyNode, value });
        const alt = cur.alternate;
        if (!alt) {
          cur = null;
          break;
        }
        if (alt.type === AST_NODE_TYPES.IfStatement) {
          cur = alt;
          continue;
        }
        const tailValue = extractBranchValue([alt]);
        if (!tailValue) {
          return;
        }
        tail = tailValue;
        tailNode = alt;
        tailPrevEnd = cur.consequent.range[1];
        cur = null;
      }

      if (links.length === 0) {
        return;
      }

      // Consistent kind/target.
      const kind = links[0].value.kind;
      const assignTargetText =
        kind === 'assign'
          ? sourceCode.getText(
              (links[0].value as { target: TSESTree.Node }).target,
            )
          : undefined;
      const allValues = [...links.map((l) => l.value)];
      if (tail) {
        allValues.push(tail);
      }
      for (const v of allValues) {
        if (v.kind !== kind) {
          return;
        }
        if (
          kind === 'assign' &&
          sourceCode.getText((v as { target: TSESTree.Node }).target) !==
            assignTargetText
        ) {
          return;
        }
      }

      const explicitKeys: LiteralKey[][] = [];
      for (const link of links) {
        const key = resolveLiteralKey(link.keyNode);
        if (!key) {
          return;
        }
        explicitKeys.push([key]);
      }

      const gated = typeGate(head.discNode);
      if (!gated) {
        return;
      }
      const { unionKeys, hasNullish, dText, dIntended } = gated;

      const explicitForCoverage = links.map((l, i) => ({
        keys: explicitKeys[i],
        valueText: sourceCode.getText(l.value.expr),
        valueExpr: l.value.expr,
      }));
      const coverage = resolveCoverage(
        explicitForCoverage,
        unionKeys,
        tail
          ? { valueText: sourceCode.getText(tail.expr), valueExpr: tail.expr }
          : null,
      );
      if (!coverage) {
        return;
      }

      const contributingValues = links.map((l) => l.value.expr);
      if (coverage.remainingCount >= 1 && tail) {
        contributingValues.push(tail.expr);
      }

      if (isNarrowingExempt(head.discNode, contributingValues)) {
        return;
      }

      let commentBlocked = false;
      if (coverage.fullCoverage) {
        const tailUsed = coverage.remainingCount === 1 && tail !== null;
        const carriedSpans: TSESTree.Range[] = [head.discNode.range];
        const droppedSpans: TSESTree.Range[] = [];
        const anchors: CommentAnchor[] = [];
        links.forEach((link, i) => {
          carriedSpans.push(link.value.expr.range);
          anchors.push({
            range: link.value.stmt.range,
            startLine: link.value.stmt.loc.start.line,
            endLine: link.value.stmt.loc.end.line,
            entryIndex: i,
            entryCount: 1,
          });
        });
        if (kind === 'assign' && links[0].value.kind === 'assign') {
          carriedSpans.push(links[0].value.target.range);
        }
        if (tailUsed && tail) {
          carriedSpans.push(tail.expr.range);
          anchors.push({
            range: tail.stmt.range,
            startLine: tail.stmt.loc.start.line,
            endLine: tail.stmt.loc.end.line,
            entryIndex: coverage.entries.length - 1,
            entryCount: 1,
          });
        } else if (tailNode) {
          // The unreachable else is deleted; comments from the last kept
          // consequent through the else's end annotate deleted code.
          droppedSpans.push([tailPrevEnd, tailNode.range[1]]);
        }
        commentBlocked = !planCommentHosting({
          container: node,
          carriedSpans,
          droppedSpans,
          anchors,
          entries: coverage.entries,
        });
      }

      discriminantMap.set(node, head.discNode);
      report(node, {
        entries: coverage.entries,
        contributingValues,
        dText,
        dIntended,
        form: kind,
        assignTargetText,
        fullCoverage: coverage.fullCoverage,
        hasNullish,
        canPlaceFix: true,
        commentBlocked,
      });
    }

    return {
      SwitchStatement: handleSwitch,
      ConditionalExpression: handleConditional,
      IfStatement: handleIf,
    } as TSESLint.RuleListener;
  },
});
