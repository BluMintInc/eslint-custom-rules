import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

// This rule scans string and template literals for Firestore rules content and flags
// direct field access like `resource.data.foo.bar != null` or `== null` (also ===/!==)
// and enforces using `.get('foo', null).get('bar', null)` instead. It also enforces
// that `.get()` is called with a default value.

type MessageIds = 'useGetAccess' | 'requireGetDefault';

type Options = [
  {
    printWidth?: number;
  },
];

/**
 * Matches Prettier's own default. Expanding `.seg` into `.get('seg', null)` adds
 * 13 columns per path segment, so the rewritten literal routinely lands past the
 * width a formatter owns — and an over-wide line fails `prettier --check` on the
 * very source the fixer just wrote.
 */
const DEFAULT_PRINT_WIDTH = 80;

/**
 * Prettier's `isObjectPropertyWithShortKey` refuses to break after an object
 * key narrower than `tabWidth + 3`, however far past the width the value runs.
 * The file's own indentation step stands in for `tabWidth`, so the threshold
 * tracks a four-space file instead of assuming two.
 */
const SHORT_OBJECT_KEY_OVERLAP = 3;

/**
 * Where Prettier would break, and how many indentation steps in from that
 * line's own indentation the wrapped literal lands.
 */
type WrapPlan = {
  operator: TSESTree.Token;
  indentSteps: number;
};

/**
 * The span an over-wide argument list is re-rendered into, and the column its
 * closing parenthesis returns to.
 */
type CallWrapPlan = {
  open: TSESTree.Token;
  close: TSESTree.Token;
  slotEnd: number;
  indent: string;
};

/**
 * Positions whose parent prints its child flush against its own text, with no
 * break point in between. Walking outward through these is what lets the fix
 * know the column Prettier closes the argument list at: an arrow body, a
 * bodyless `if`, a ternary branch and a multi-declarator `const` all break
 * before the call and reindent it, so none of them is here.
 */
function attachesToParentLine(
  parent: TSESTree.Node,
  child: TSESTree.Node,
): boolean {
  switch (parent.type) {
    case AST_NODE_TYPES.ExpressionStatement:
      return parent.expression === child;
    case AST_NODE_TYPES.ReturnStatement:
    case AST_NODE_TYPES.ThrowStatement:
    case AST_NODE_TYPES.AwaitExpression:
      return parent.argument === child;
    case AST_NODE_TYPES.AssignmentExpression:
      return parent.right === child;
    case AST_NODE_TYPES.VariableDeclarator:
      return parent.init === child;
    case AST_NODE_TYPES.VariableDeclaration:
      // Sibling declarators each take their own line one step in from the
      // keyword, which moves the closing parenthesis with them.
      return parent.declarations.length === 1;
    case AST_NODE_TYPES.ExportNamedDeclaration:
    case AST_NODE_TYPES.ExportDefaultDeclaration:
      return parent.declaration === child;
    case AST_NODE_TYPES.Property:
      return parent.value === child;
    default:
      return false;
  }
}

/**
 * The `(` that opens the argument list.
 *
 * Walked over tokens from the end of the callee rather than searched for in the
 * text, because a type argument can spell a parenthesis of its own:
 * `publish<(rules: string) => void>(…)`.
 */
function argumentListOpenParen(
  sourceCode: TSESLint.SourceCode,
  call: TSESTree.CallExpression | TSESTree.NewExpression,
): TSESTree.Token | null {
  const afterCallee = call.typeParameters
    ? call.typeParameters.range[1]
    : call.callee.range[1];
  return (
    sourceCode
      .getTokens(call)
      .find(
        (token) =>
          token.range[0] >= afterCallee &&
          token.type === AST_TOKEN_TYPES.Punctuator &&
          token.value === '(',
      ) ?? null
  );
}

const DIRECT_ACCESS_REGEX =
  /\b(?:request\.resource|resource)\.data(?!\.get\()(?:\.(?!get\()[A-Za-z_]\w*|\[['"][^'"]+['"]\])+(?:\s*)(?:!=|==|!==|===)\s*(?:null|undefined)\b/;

function hasDirectFieldAccessComparison(text: string): boolean {
  // Match resource.data.<a>.<b>... or bracketed string segments compared to null/undefined.
  return DIRECT_ACCESS_REGEX.test(text);
}

function hasGetWithoutDefault(text: string): boolean {
  // Look for `.get('field')` with a single argument. We only check in contexts that
  // also mention resource.data/request.resource.data to reduce false positives.
  const mentionsRulesContext = /\b(?:request\.resource|resource)\.data\b/.test(
    text,
  );
  if (!mentionsRulesContext) return false;
  const singleArgGetRegex = /\.get\(\s*(['"][^'"]+['"])\s*\)/;
  return singleArgGetRegex.test(text);
}

function applyDirectAccessFixes(text: string): string {
  // Replace each direct access chain with equivalent `.get('seg', null)` chain
  const pattern =
    /\b((?:request\.resource|resource)\.data)(?!\.get\()((?:\.(?!get\()[A-Za-z_]\w*|\[['"][^'"]+['"]\])+)(\s*)((?:!=|==|!==|===)\s*(?:null|undefined)\b)/g;
  const segmentRegex = /(?:\.(?!get\()[A-Za-z_]\w*|\[['"][^'"]+['"]\])/g;

  const unescapeLiteral = (raw: string): string =>
    raw.replace(/\\(['"\\])/g, '$1');

  return text.replace(
    pattern,
    (
      _m,
      prefix: string,
      path: string,
      preOpWhitespace: string,
      opAndRest: string,
    ) => {
      const segments: string[] = [];
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
    },
  );
}

function applyGetDefaultFixes(text: string): string {
  // Add ", null" as the second argument when `.get('field')` is used
  const singleArgGetRegexGlobal = /\.get\(\s*(['"][^'"]+['"])\s*\)/g;
  return text.replace(
    singleArgGetRegexGlobal,
    (_m, keyLiteral: string) => `.get(${keyLiteral}, null)`,
  );
}

/**
 * The file's own nesting step, taken as the most common indentation increase
 * between consecutive lines. Reading it from the source keeps the wrapped line
 * in the author's units instead of assuming a two-space, space-indented file.
 */
function indentUnitOf(sourceCode: TSESLint.SourceCode): string {
  const text = sourceCode.getText();
  const blockComments = sourceCode
    .getAllComments()
    .filter((comment) => comment.type === AST_TOKEN_TYPES.Block)
    .map((comment) => comment.range);
  // A block comment's interior lines carry the comment's own alignment, not a
  // nesting step of the file; counting them makes a JSDoc-heavy file look
  // 1-space indented.
  const continuesBlockComment = (offset: number) =>
    blockComments.some(([start, end]) => start < offset && offset < end);

  const frequencies = new Map<string, number>();
  let previous = '';
  let offset = 0;
  for (const line of text.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;
    if (line.trim() === '') {
      continue;
    }
    if (continuesBlockComment(lineStart)) {
      continue;
    }
    const match = /^[ \t]*/.exec(line);
    const indent = match ? match[0] : '';
    if (indent.length > previous.length && indent.startsWith(previous)) {
      const delta = indent.slice(previous.length);
      frequencies.set(delta, (frequencies.get(delta) ?? 0) + 1);
    }
    previous = indent;
  }

  let unit = '  ';
  let best = 0;
  for (const [delta, count] of frequencies) {
    if (count > best) {
      unit = delta;
      best = count;
    }
  }
  return unit;
}

export const enforceFirestoreRulesGetAccess = createRule<Options, MessageIds>({
  name: 'enforce-firestore-rules-get-access',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Ensure Firestore security rules use .get() with a default value instead of direct field access comparisons (e.g., resource.data.fieldX.fieldY != null).',
      recommended: 'error',
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
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useGetAccess:
        "Use .get('<field>', null) instead of direct field access in Firestore rules, e.g., resource.data.get('fieldX', null).",
      requireGetDefault:
        "Provide a default value to .get() in Firestore rules, e.g., .get('fieldX', null).",
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const sourceCode = context.getSourceCode();

    const printWidth =
      typeof options.printWidth === 'number' && options.printWidth > 0
        ? options.printWidth
        : DEFAULT_PRINT_WIDTH;

    // Derived once per file rather than per fix: every fix in a file shares the
    // author's nesting step.
    let indentUnit: string | null = null;
    const fileIndentUnit = () => {
      if (indentUnit === null) {
        indentUnit = indentUnitOf(sourceCode);
      }
      return indentUnit;
    };

    /**
     * A string literal has no interior break point, so the only wrap Prettier
     * can perform is after the assignment-like operator that precedes it. This
     * returns that operator token when the surrounding shape is one Prettier
     * breaks that way, and `null` everywhere else — including the shapes it
     * measurably leaves on one over-wide line (a short object key, a `return`,
     * an expression statement, `export default`) and the shapes where some
     * enclosing construct owns the break instead (a call argument, an array
     * element, a JSX attribute, a ternary, a concatenation, an arrow body).
     * Emitting a break Prettier would not make is not the safe direction: it
     * collapses the line straight back, so a needless wrap fails
     * `prettier --check` exactly as an over-wide line does.
     */
    const breakPointBefore = (node: TSESTree.Literal): WrapPlan | null => {
      const parent = node.parent;
      if (!parent) return null;

      let operatorText: string;
      // Every shape below indents the wrapped literal one step in from the line
      // carrying its operator; only a multi-declarator `const` adds a second.
      let indentSteps = 1;
      switch (parent.type) {
        case AST_NODE_TYPES.VariableDeclarator: {
          if (parent.init !== node) return null;
          const declaration = parent.parent;
          if (declaration?.type !== AST_NODE_TYPES.VariableDeclaration) {
            return null;
          }
          // A `for` head is laid out by the head's own rules rather than the
          // initializer's, so the `=` there is not a break point.
          const container = declaration.parent?.type;
          if (
            container === AST_NODE_TYPES.ForStatement ||
            container === AST_NODE_TYPES.ForInStatement ||
            container === AST_NODE_TYPES.ForOfStatement
          ) {
            return null;
          }
          // Sibling declarators sit one step in from the keyword, and the
          // wrapped value one step in from those. A later declarator already
          // occupies that indented line, so only the first needs the extra step.
          if (
            declaration.declarations.length > 1 &&
            parent.loc.start.line === declaration.loc.start.line
          ) {
            indentSteps = 2;
          }
          operatorText = '=';
          break;
        }
        case AST_NODE_TYPES.AssignmentExpression: {
          if (parent.right !== node) return null;
          // Nested inside any larger expression the enclosing construct owns the
          // break: `() => (rule = '...')` breaks after the arrow, not the `=`.
          // A chain of assignments is the exception — `a = b = '...'` keeps both
          // operators on the statement's line and breaks after the last.
          let statement: TSESTree.Node | undefined = parent.parent;
          while (statement?.type === AST_NODE_TYPES.AssignmentExpression) {
            statement = statement.parent;
          }
          if (statement?.type !== AST_NODE_TYPES.ExpressionStatement) {
            return null;
          }
          operatorText = parent.operator;
          break;
        }
        case AST_NODE_TYPES.PropertyDefinition: {
          if (parent.value !== node) return null;
          operatorText = '=';
          break;
        }
        case AST_NODE_TYPES.Property: {
          if (parent.value !== node || parent.computed || parent.shorthand) {
            return null;
          }
          // Only a bare identifier key has a printed width the rule can know:
          // a quoted key's width depends on whether `quoteProps` strips its
          // quotes, which is a property of the whole object literal.
          if (parent.key.type !== AST_NODE_TYPES.Identifier) return null;
          if (
            parent.key.name.length <
            fileIndentUnit().length + SHORT_OBJECT_KEY_OVERLAP
          ) {
            return null;
          }
          operatorText = ':';
          break;
        }
        default:
          return null;
      }

      const operator = sourceCode.getTokenBefore(node);
      // A mismatch means something sits between the operator and the literal —
      // a parenthesis, a type assertion — and that construct owns the layout.
      if (!operator || operator.value !== operatorText) return null;
      // An already-wrapped literal carries the formatter's answer; re-wrapping
      // would insert a second break.
      if (operator.loc.end.line !== node.loc.start.line) return null;
      // A comment between the operator and the literal sits inside the range the
      // wrap rewrites, so wrapping would move or lose it.
      if (
        sourceCode.getText().slice(operator.range[1], node.range[0]).trim() !==
        ''
      ) {
        return null;
      }
      return { operator, indentSteps };
    };

    /**
     * Width of the line the single-node fix would leave behind: everything
     * before the literal on its line, the literal itself, and the source text
     * that follows it. A trailing line comment is excluded because Prettier
     * pushes it past the width without counting it; a trailing block comment is
     * counted, because Prettier does count that one.
     */
    const emittedLineWidth = (
      node: TSESTree.Literal,
      literalText: string,
    ): number => {
      const endLine = sourceCode.lines[node.loc.end.line - 1] ?? '';
      const after = endLine.slice(node.loc.end.column);
      const lineCommentStart = after.indexOf('//');
      const counted = (
        lineCommentStart === -1 ? after : after.slice(0, lineCommentStart)
      ).replace(/\s+$/, '');
      return node.loc.start.column + literalText.length + counted.length;
    };

    /**
     * Whether the line the node starts on is the line Prettier prints it on.
     *
     * True once nothing but whitespace precedes the node on its line, or once
     * every construct between it and that line's start is one Prettier keeps
     * flush. Anything else — an arrow body, a bodyless `if`, a ternary branch —
     * breaks before the node and indents it a step further than the line it was
     * written on, which is a column this fix cannot read off the source.
     */
    const keepsItsColumn = (node: TSESTree.Node): boolean => {
      let current: TSESTree.Node = node;
      for (;;) {
        const line = sourceCode.lines[current.loc.start.line - 1] ?? '';
        if (line.slice(0, current.loc.start.column).trim() === '') return true;
        const parent = current.parent;
        if (!parent) return false;
        if (!attachesToParentLine(parent, current)) return false;
        // A parent opening on an earlier line leaves text on this one that the
        // walk has not accounted for, so its layout is not this fix's to guess.
        if (parent.loc.start.line !== current.loc.start.line) return false;
        current = parent;
      }
    };

    /**
     * How Prettier re-renders the call around a literal that no longer fits:
     * the argument on its own line one nesting step in, a trailing comma after
     * it, and the closing parenthesis back at the column the call's line starts
     * at. The trailing comma is `trailingComma: 'all'`, which is this
     * repository's and its consumer's setting and Prettier 3's default.
     *
     * Every `null` below is a DELIBERATE decline rather than a fall-through:
     * the literal is replaced in place instead, leaving a line Prettier rewraps
     * but losing nothing the author wrote. A formatting nicety does not justify
     * relocating a comment or guessing at a layout Prettier does not print.
     */
    const callWrapPlanFor = (node: TSESTree.Literal): CallWrapPlan | null => {
      const call = node.parent;
      if (
        !call ||
        (call.type !== AST_NODE_TYPES.CallExpression &&
          call.type !== AST_NODE_TYPES.NewExpression)
      ) {
        return null;
      }
      // Prettier hugs a trailing function, object or array argument instead of
      // giving each argument its own line, and two rewritten literals in one
      // argument list would produce two fixes over the same span — so only a
      // list holding this literal alone is a shape the emitter can state.
      if (call.arguments.length !== 1 || call.arguments[0] !== node)
        return null;
      // A call already broken across lines carries the formatter's answer, and
      // its continuation lines keep columns this re-render does not set.
      if (call.loc.start.line !== call.loc.end.line) return null;
      if (!keepsItsColumn(call)) return null;

      const open = argumentListOpenParen(sourceCode, call);
      const close = sourceCode.getLastToken(call);
      if (!open || !close || close.value !== ')') return null;

      // A comment between the callee and the opening parenthesis is one
      // Prettier MOVES: it prints `publish(/* keep */ arg`. Comments written
      // inside the argument list need no such care — each rides along on the
      // slot text below, which is exactly where Prettier leaves it.
      const relocatedComment = sourceCode
        .getAllComments()
        .some(
          (comment) =>
            comment.range[0] >= call.callee.range[1] &&
            comment.range[1] <= open.range[0],
        );
      if (relocatedComment) return null;

      // A comma the author already wrote before the closing parenthesis is the
      // one this re-render appends itself, so the slot ends ahead of it.
      const beforeClose = sourceCode.getTokenBefore(close);
      const slotEnd =
        beforeClose && beforeClose.value === ','
          ? beforeClose.range[0]
          : close.range[0];

      const callLine = sourceCode.lines[call.loc.start.line - 1] ?? '';
      return {
        open,
        close,
        slotEnd,
        indent: /^[ \t]*/.exec(callLine)?.[0] ?? '',
      };
    };

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
            const literalText = `"${newText.replace(/"/g, '\\"')}"`;

            // Measure, never wrap unconditionally: a rewritten literal that
            // still fits is left flat because Prettier pulls a needlessly
            // wrapped short value straight back onto one line.
            if (emittedLineWidth(node, literalText) <= printWidth) {
              return fixer.replaceText(node, literalText);
            }

            const plan = breakPointBefore(node);
            if (plan) {
              const { operator, indentSteps } = plan;
              const operatorLine =
                sourceCode.lines[operator.loc.start.line - 1] ?? '';
              const indent = /^[ \t]*/.exec(operatorLine)?.[0] ?? '';
              const step = fileIndentUnit().repeat(indentSteps);
              return fixer.replaceTextRange(
                [operator.range[1], node.range[1]],
                `\n${indent}${step}${literalText}`,
              );
            }

            // A literal an operator cannot carry onto its own line may still be
            // one Prettier answers by breaking the call around it open.
            const callWrap = callWrapPlanFor(node);
            if (callWrap) {
              const { open, close, slotEnd, indent } = callWrap;
              const source = sourceCode.getText();
              // Sliced out of the source rather than rebuilt from the argument,
              // so a comment written beside the literal rides along on the slot
              // it annotates — where Prettier prints it.
              const slot = (
                source.slice(open.range[1], node.range[0]) +
                literalText +
                source.slice(node.range[1], slotEnd)
              ).trim();
              return fixer.replaceTextRange(
                [open.range[1], close.range[0]],
                `\n${indent}${fileIndentUnit()}${slot},\n${indent}`,
              );
            }

            return fixer.replaceText(node, literalText);
          },
        });
      },
      TemplateLiteral(node) {
        // Best-effort: we only join static quasis and ignore embedded expressions,
        // so template expressions spanning placeholders may be missed.
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
