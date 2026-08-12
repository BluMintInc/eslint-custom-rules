import * as tsParser from '@typescript-eslint/parser';

/**
 * Restricted productions: the places the ECMAScript grammar forbids a
 * LineTerminator, and where `@typescript-eslint/parser` accepts one anyway.
 *
 * A fixer that leaves — or carries — a line break into one of these gaps emits
 * text no engine will run, and NOTHING else in this repo's pipeline says so.
 * Every parse-based guard (`fixture-corpus-parsability`, `fix-fixpoint-closure`'s
 * fatal check, `fix-orphan-binding-closure`'s `message.fatal` gate, the agora
 * `fix: true` sweep) reads the broken text as clean, because the parser they all
 * share is the one that accepts it. #1964 shipped through every one of them.
 *
 * WHICH productions belong here is MEASURED, not copied from the spec. The
 * grammar lists seven; only two are detectable here, because for the rest
 * `@typescript-eslint/parser` already agrees with V8:
 *
 *   | production                 | parser  | V8      | detectable here     |
 *   | -------------------------- | ------- | ------- | ------------------- |
 *   | `ArrowParameters [] =>`    | accepts | rejects | YES                 |
 *   | `throw []`                 | accepts | rejects | YES                 |
 *   | `async [] (params) =>`     | rejects | rejects | no — parser sees it |
 *   | `async [] method()`        | rejects | rejects | no — parser sees it |
 *   | `yield [] *`               | rejects | rejects | no — parser sees it |
 *   | postfix `++` / `--`        | rejects | rejects | no — parser sees it |
 *   | `return` / `yield` / label | ASI     | ASI     | no — both insert `;` |
 *
 * The last row is the one worth stating plainly: for `return`, `yield`,
 * `break`/`continue` with a label and `async function`, the parser applies
 * automatic semicolon insertion exactly as V8 does, so the two never disagree
 * and there is no divergence to detect. The rows the parser rejects are already
 * fatal to every parse-based guard, so they need no help from this module.
 *
 * `src/tests/restricted-production-closure.test.ts` re-measures that table on
 * every run: an arm that stops being redundant (a parser upgrade turning a
 * "rejects" into an "accepts") fails there rather than silently going unchecked.
 */

/**
 * Every character the syntactic grammar counts as a LineTerminator, by code
 * point rather than as a regular expression: U+2028 and U+2029 terminate a line
 * in JavaScript SOURCE too, so a literal holding them cannot be written here
 * without breaking this file.
 */
const LINE_TERMINATOR_CODES = new Set([0x0a, 0x0d, 0x2028, 0x2029]);

const hasLineTerminator = (text: string): boolean => {
  for (let index = 0; index < text.length; index++) {
    if (LINE_TERMINATOR_CODES.has(text.charCodeAt(index))) return true;
  }
  return false;
};

export type RestrictedProduction = 'arrow' | 'throw';

export type RestrictedBreach = {
  production: RestrictedProduction;
  /** 1-indexed line of the token that closes the gap. */
  line: number;
  /** The offending text between the two tokens, comments included. */
  gap: string;
};

type Token = { type: string; value: string; range: [number, number] };
type Node = { type: string; range: [number, number] } & Record<string, unknown>;

const PARSE_OPTIONS = {
  ecmaVersion: 2022,
  sourceType: 'module',
  range: true,
  loc: true,
  comment: true,
  tokens: true,
} as const;

type ParsedSource = { ast: Node; tokens: Token[] } | null;

/**
 * `.ts` and `.tsx` are not ordered by permissiveness — only `.ts` accepts
 * `<T>expr` and only `.tsx` accepts JSX — so a snippet is tried both ways rather
 * than parsed under a guessed extension. A snippet that parses under neither is
 * `null`: unparsable text is `fixture-corpus-parsability`'s axis, and reporting
 * it here would double-count it.
 */
export function parseForRestrictedProductions(code: string): ParsedSource {
  for (const jsx of [true, false]) {
    try {
      const ast = tsParser.parse(code, {
        ...PARSE_OPTIONS,
        ecmaFeatures: { jsx },
      } as never) as unknown as Node & { tokens?: Token[] };
      if (ast.tokens) return { ast, tokens: ast.tokens };
    } catch {
      continue;
    }
  }
  return null;
}

function visit(node: unknown, callback: (node: Node) => void): void {
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (typeof record.type === 'string' && Array.isArray(record.range)) {
    callback(record as Node);
  }
  for (const [key, value] of Object.entries(record)) {
    // `parent` is a back-edge on some node shapes and would loop forever.
    if (key === 'parent') continue;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, callback);
    } else if (value && typeof value === 'object') {
      visit(value, callback);
    }
  }
}

/** Index of the last token ending at or before `position`. */
function lastTokenIndexBefore(tokens: Token[], position: number): number {
  let low = 0;
  let high = tokens.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (tokens[middle].range[1] <= position) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

const lineAt = (code: string, position: number): number =>
  code.slice(0, position).split('\n').length;

/**
 * Every restricted-production breach in `code`, or `null` when it does not parse
 * at all.
 *
 * The gap is measured between TOKENS, so the text it spans is whitespace and
 * comments and nothing else. That is what makes a block comment carrying a line
 * terminator indistinguishable from a raw newline here — which is the whole
 * point, since it is indistinguishable to the grammar too.
 */
export function restrictedProductionBreaches(
  code: string,
): RestrictedBreach[] | null {
  const parsed = parseForRestrictedProductions(code);
  if (!parsed) return null;
  const { ast, tokens } = parsed;
  const breaches: RestrictedBreach[] = [];

  const record = (
    production: RestrictedProduction,
    from: number,
    to: number,
  ) => {
    const gap = code.slice(from, to);
    if (!hasLineTerminator(gap)) return;
    breaches.push({ production, line: lineAt(code, to), gap });
  };

  visit(ast, (node) => {
    if (node.type === 'ArrowFunctionExpression') {
      const body = node.body as Node | undefined;
      if (!body) return;
      /**
       * The arrow token is the LAST `=>` before the body, never the first: a
       * default parameter may itself be an arrow, and its `=>` sits inside this
       * node's range.
       *
       * Taking the token immediately before it is also what makes a TypeScript
       * return annotation fall out correctly. The grammar forbids the break
       * between the SIGNATURE and `=>`, and the annotation is part of the
       * signature — `() \n : T => 1` is legal and `(): T \n => 1` is not, which
       * is exactly the pair this comparison distinguishes.
       */
      const end = lastTokenIndexBefore(tokens, body.range[0]);
      for (let index = end; index >= 0; index--) {
        if (tokens[index].range[1] <= node.range[0]) break;
        if (tokens[index].value !== '=>') continue;
        if (index > 0) {
          record('arrow', tokens[index - 1].range[1], tokens[index].range[0]);
        }
        break;
      }
      return;
    }

    if (node.type === 'ThrowStatement' && node.argument) {
      // The keyword opens the statement, so it is the token after the last one
      // that ends at or before the statement's start.
      const index = lastTokenIndexBefore(tokens, node.range[0]) + 1;
      const keyword = tokens[index];
      if (!keyword || keyword.value !== 'throw') return;
      /**
       * The parser does not reject the breach, but it does RECOVER from it: it
       * emits a zero-width token where the argument should have been and hands
       * back a `ThrowStatement` whose argument is an empty node. Measuring the
       * gap to that phantom would measure nothing at all, so the width filter
       * is what makes this arm detect anything.
       */
      const next = tokens
        .slice(index + 1)
        .find((token) => token.range[1] > token.range[0]);
      if (!next) return;
      record('throw', keyword.range[1], next.range[0]);
    }
  });

  return breaches;
}

/**
 * The non-comment token stream, used to prove a planted comment changed nothing
 * but comments. `null` when the text does not parse.
 */
export function tokenSignatureOf(code: string): string | null {
  const parsed = parseForRestrictedProductions(code);
  if (!parsed) return null;
  return parsed.tokens.map((token) => `${token.type} ${token.value}`).join(' ');
}
