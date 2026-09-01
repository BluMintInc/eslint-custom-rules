import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESTree,
  TSESLint,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { afterShebang } from '../utils/shebang';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds =
  | 'useGlobalConstant'
  | 'extractDefaultToGlobalConstant'
  | 'declareMemoDependency';

type Options = [
  {
    printWidth?: number;
  },
];

/**
 * Matches Prettier's own default. The autofix authors a whole module-scope
 * declaration and inflates the destructuring line it edits, so a line it
 * leaves past this width is rewritten on the next `prettier --write` — and
 * fails `prettier --check` in the meantime.
 */
const DEFAULT_PRINT_WIDTH = 80;

/**
 * The file's own nesting step, taken as the most common indentation increase
 * between consecutive lines. Reading it from the source keeps emitted code in
 * the author's units instead of assuming a two-space, space-indented file.
 */
function indentUnitOf(sourceCode: TSESLint.SourceCode): string {
  const text = sourceCode.getText();
  const blockComments = sourceCode
    .getAllComments()
    .filter((comment) => comment.type === AST_TOKEN_TYPES.Block)
    .map((comment) => comment.range);
  // A block comment's interior lines carry whatever alignment the comment uses
  // — the `*` one column in from its own indentation, or, for commented-out
  // code, the original code's depths. Neither is a nesting step of the file, and
  // counting them makes a JSDoc-heavy file look 1-space indented. Keying on the
  // comment's range rather than a leading `*` also covers a body without them.
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

/**
 * A numeric literal, possibly signed — the element kind prettier's "fill"
 * detection keys on.
 */
function isNumericArrayElement(element: TSESTree.Node): boolean {
  if (element.type === AST_NODE_TYPES.Literal) {
    return typeof element.value === 'number';
  }
  if (
    element.type === AST_NODE_TYPES.UnaryExpression &&
    (element.operator === '-' || element.operator === '+')
  ) {
    return (
      element.argument.type === AST_NODE_TYPES.Literal &&
      typeof element.argument.value === 'number'
    );
  }
  return false;
}

/**
 * Prettier prints an all-numeric array in "fill" mode — several elements per
 * line — so a one-element-per-line expansion of it is not a prettier fixed
 * point.
 */
function isFillPrintedArray(literal: TSESTree.ArrayExpression): boolean {
  const elements = literal.elements as Array<TSESTree.Node | null>;
  return (
    elements.length > 1 &&
    elements.every(
      (element) => element !== null && isNumericArrayElement(element),
    )
  );
}

/**
 * Top-level items of an object/array literal for a one-item-per-line
 * expansion, or null when the literal has no such spelling: an array hole
 * owns no line of its own, and a fill-printed array is re-packed by prettier.
 */
function expansionItemsOf(
  literal: TSESTree.ObjectExpression | TSESTree.ArrayExpression,
): TSESTree.Node[] | null {
  if (literal.type === AST_NODE_TYPES.ObjectExpression) {
    return literal.properties;
  }
  const elements = literal.elements as Array<TSESTree.Node | null>;
  if (elements.some((element) => element === null)) {
    return null;
  }
  if (isFillPrintedArray(literal)) {
    return null;
  }
  return elements as TSESTree.Node[];
}

/**
 * Scope kinds whose bindings are established once per module evaluation:
 * globals, imports and module-level declarations. A literal reading one of those
 * can still be hoisted verbatim, because the name it reads is in scope at module
 * level too.
 */
const MODULE_LEVEL_SCOPE_TYPES = new Set<string>(['global', 'module']);

/**
 * True when `inner` lies entirely inside `outer`'s source range.
 */
function isRangeWithin(inner: TSESTree.Range, outer: TSESTree.Range): boolean {
  return inner[0] >= outer[0] && inner[1] <= outer[1];
}

/**
 * True when a reference appears purely in type position (an annotation, or the
 * target of an `as`/`satisfies`). Types erase at compile time, so such a name
 * neither blocks hoisting nor belongs in a dependency array. The flags are read
 * defensively: an analyzer that omits them leaves the reference classified as a
 * value, which keeps the conservative answer.
 */
function isTypeOnlyReference(reference: TSESLint.Scope.Reference): boolean {
  const flags = reference as unknown as {
    isValueReference?: boolean;
    isTypeReference?: boolean;
  };
  return flags.isTypeReference === true && flags.isValueReference === false;
}

/**
 * True when a reference names a value that can differ between renders, i.e. one
 * bound INSIDE the module and OUTSIDE the memo callback: a prop, a local, a
 * destructured value, another hook's result.
 *
 * Everything else leaves hoisting available. An unresolved name is an ambient
 * global. A module- or global-scoped binding is fixed for the module's lifetime
 * and is equally visible from module scope. A binding whose own scope sits
 * inside the callback — the callback's parameters, its locals, a nested
 * function's locals — is created by the callback rather than closed over.
 */
function isRenderScopeReference(
  reference: TSESLint.Scope.Reference,
  callbackRange: TSESTree.Range,
): boolean {
  const variable = reference.resolved;
  if (!variable) {
    return false;
  }
  if (MODULE_LEVEL_SCOPE_TYPES.has(variable.scope.type)) {
    return false;
  }
  return !isRangeWithin(variable.scope.block.range, callbackRange);
}

/**
 * The first render-scope value a memo callback reads, in source order, or null
 * when it reads none.
 *
 * Answered from RESOLVED scope references rather than identifier names, so
 * shadowing, destructuring and imports are accounted for exactly as the scope
 * analyzer sees them. The whole callback is the unit of analysis, not just the
 * returned literal: `const debounce = delay * 2; return { debounce };` closes
 * over `delay` just as `return { debounce: delay }` does, and naming the
 * callback-local `debounce` would prescribe a dependency that does not exist
 * outside the callback.
 */
function findRenderScopeDependency(
  callbackScope: TSESLint.Scope.Scope,
  callbackRange: TSESTree.Range,
): string | null {
  let earliest: TSESLint.Scope.Reference | null = null;
  const pending: TSESLint.Scope.Scope[] = [callbackScope];

  while (pending.length > 0) {
    const current = pending.pop() as TSESLint.Scope.Scope;

    for (const reference of current.references) {
      if (isTypeOnlyReference(reference)) {
        continue;
      }
      if (!isRenderScopeReference(reference, callbackRange)) {
        continue;
      }
      // Source order rather than traversal order, so the reported name does not
      // depend on how the scope tree happens to be walked.
      if (
        !earliest ||
        reference.identifier.range[0] < earliest.identifier.range[0]
      ) {
        earliest = reference;
      }
    }

    pending.push(...current.childScopes);
  }

  return earliest ? earliest.identifier.name : null;
}

export const enforceGlobalConstants = createRule<Options, MessageIds>({
  name: 'enforce-global-constants',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce global static constants for React components/hooks',
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
      useGlobalConstant:
        'Object literal returned from useMemo with empty dependencies creates a new reference every render without providing memoization benefits → this wastes memory and misleads readers into thinking the value is computed → move the object to a module-level constant (e.g., const OPTIONS = { ... } as const;).',
      extractDefaultToGlobalConstant:
        'Inline default value in destructuring creates a new reference on every render → this causes unnecessary re-renders in child components due to unstable identity → extract the default to a module-level constant (e.g., const DEFAULT_OPTIONS = { ... } as const;).',
      declareMemoDependency:
        'Object literal returned from useMemo reads "{{name}}" from the surrounding render scope while declaring an empty dependency array → the memo keeps the "{{name}}" captured on the first render and never recomputes, so the object silently goes stale, and it cannot be hoisted to a module-level constant because "{{name}}" exists only during a render → declare "{{name}}" (and every other render-scope value the callback reads) in the dependency array, or drop the useMemo if the object is meant to be constant.',
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

    function isHookName(name: string): boolean {
      return /^use[A-Z]/.test(name);
    }

    function isComponentOrHookFunction(
      fn:
        | TSESTree.FunctionDeclaration
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression,
    ): boolean {
      if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
        const n = fn.id?.name ?? '';
        return /^[A-Z]/.test(n) || isHookName(n);
      }
      const parent = fn.parent;
      if (
        parent &&
        parent.type === AST_NODE_TYPES.VariableDeclarator &&
        parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        const n = parent.id.name;
        return /^[A-Z]/.test(n) || isHookName(n);
      }
      return false;
    }

    function getEnclosingFunction(
      node: TSESTree.Node,
    ):
      | TSESTree.FunctionDeclaration
      | TSESTree.ArrowFunctionExpression
      | TSESTree.FunctionExpression
      | null {
      let current: TSESTree.Node | undefined | null = node;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          current.type === AST_NODE_TYPES.FunctionExpression
        ) {
          return current;
        }
        current = current.parent as TSESTree.Node | undefined | null;
      }
      return null;
    }

    function toUpperSnakeCase(name: string): string {
      return name
        .replace(/([A-Z])/g, '_$1')
        .toUpperCase()
        .replace(/^_/, '');
    }

    function collectAssignmentDefaultsFromPattern(
      pattern:
        | TSESTree.ArrayPattern
        | TSESTree.ObjectPattern
        | TSESTree.AssignmentPattern,
    ) {
      const results: Array<{
        assignment: TSESTree.AssignmentPattern;
        localName: string;
      }> = [];
      const visitPattern = (
        p:
          | TSESTree.ArrayPattern
          | TSESTree.ObjectPattern
          | TSESTree.AssignmentPattern,
      ) => {
        if (p.type === AST_NODE_TYPES.ObjectPattern) {
          for (const prop of p.properties) {
            if (prop.type === AST_NODE_TYPES.Property) {
              const value = prop.value as unknown as
                | TSESTree.ArrayPattern
                | TSESTree.ObjectPattern
                | TSESTree.AssignmentPattern
                | TSESTree.Identifier;
              if (
                value &&
                (value as TSESTree.AssignmentPattern).type ===
                  AST_NODE_TYPES.AssignmentPattern
              ) {
                const assign = value as TSESTree.AssignmentPattern;
                const left = assign.left;
                if (left.type === AST_NODE_TYPES.Identifier) {
                  results.push({ assignment: assign, localName: left.name });
                }
                if (
                  left.type === AST_NODE_TYPES.ObjectPattern ||
                  left.type === AST_NODE_TYPES.ArrayPattern
                ) {
                  // Nested pattern on the left of an assignment; uncommon, ignore naming
                }
              } else if (
                value &&
                (value as TSESTree.ObjectPattern | TSESTree.ArrayPattern)
                  .type &&
                ((value as TSESTree.ObjectPattern | TSESTree.ArrayPattern)
                  .type === AST_NODE_TYPES.ObjectPattern ||
                  (value as TSESTree.ObjectPattern | TSESTree.ArrayPattern)
                    .type === AST_NODE_TYPES.ArrayPattern)
              ) {
                visitPattern(
                  value as TSESTree.ObjectPattern | TSESTree.ArrayPattern,
                );
              }
            }
          }
        } else if (p.type === AST_NODE_TYPES.ArrayPattern) {
          for (const elem of p.elements) {
            if (!elem) continue;
            if (elem.type === AST_NODE_TYPES.AssignmentPattern) {
              const left = elem.left;
              if (left.type === AST_NODE_TYPES.Identifier) {
                results.push({ assignment: elem, localName: left.name });
              }
            } else if (
              elem.type === AST_NODE_TYPES.ArrayPattern ||
              elem.type === AST_NODE_TYPES.ObjectPattern
            ) {
              visitPattern(elem);
            }
          }
        } else if (p.type === AST_NODE_TYPES.AssignmentPattern) {
          const left = p.left;
          if (left.type === AST_NODE_TYPES.Identifier) {
            results.push({ assignment: p, localName: left.name });
          }
        }
      };
      visitPattern(pattern);
      return results;
    }

    function hasIdentifiers(node: TSESTree.Expression | null): boolean {
      return !!node && ASTHelpers.declarationIncludesIdentifier(node);
    }

    /**
     * A generated name is safe to emit only when nothing between the report
     * site and module scope already owns it. Resolution therefore walks the
     * scope chain at the report site rather than scanning `Program.body`: a
     * name-only scan misses inner-scope bindings (which would capture the
     * emitted reference), non-`const` bindings (which would be redeclared) and
     * module constants holding a different value (which would silently swap the
     * default).
     */
    type NameResolution =
      | { kind: 'free' }
      | { kind: 'reusable'; initText: string }
      | { kind: 'blocked' };

    function classifyModuleBinding(
      variable: TSESLint.Scope.Variable,
    ): NameResolution {
      if (variable.defs.length !== 1) {
        return { kind: 'blocked' };
      }
      const declarator = variable.defs[0].node;
      if (declarator.type !== AST_NODE_TYPES.VariableDeclarator) {
        return { kind: 'blocked' };
      }
      const declaration = declarator.parent;
      if (
        !declaration ||
        declaration.type !== AST_NODE_TYPES.VariableDeclaration ||
        declaration.kind !== 'const' ||
        declarator.id.type !== AST_NODE_TYPES.Identifier ||
        !declarator.init
      ) {
        return { kind: 'blocked' };
      }
      return {
        kind: 'reusable',
        initText: sourceCode.getText(declarator.init),
      };
    }

    /**
     * `SourceCode#getScope` supersedes the deprecated `context.getScope`; the
     * fallback keeps the rule working on ESLint versions that predate it.
     */
    function scopeOf(node: TSESTree.Node): TSESLint.Scope.Scope {
      const scoped = sourceCode as TSESLint.SourceCode & {
        getScope?: (node: TSESTree.Node) => TSESLint.Scope.Scope;
      };
      return typeof scoped.getScope === 'function'
        ? scoped.getScope(node)
        : context.getScope();
    }

    function resolveGeneratedName(
      scope: TSESLint.Scope.Scope | null,
      constName: string,
    ): NameResolution {
      let current = scope;
      while (current) {
        const variable = current.variables.find((v) => v.name === constName);
        if (variable) {
          return current.block.type === AST_NODE_TYPES.Program
            ? classifyModuleBinding(variable)
            : { kind: 'blocked' };
        }
        current = current.upper;
      }
      // An unresolved reference elsewhere in the file points at an ambient
      // global; declaring the name at module scope would capture it.
      const globalScope = sourceCode.scopeManager?.globalScope;
      if (
        globalScope?.through.some((ref) => ref.identifier.name === constName)
      ) {
        return { kind: 'blocked' };
      }
      return { kind: 'free' };
    }

    /**
     * The first render-scope value the memo callback reads, or null when it
     * reads none and the literal is therefore hoistable as written.
     */
    function getRenderScopeDependency(
      callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    ): string | null {
      const callbackScope = sourceCode.scopeManager?.acquire(callback);
      if (!callbackScope) {
        // Without scope analysis nothing can be shown to be closed over, so the
        // literal keeps the hoisting report the rule has always emitted.
        return null;
      }
      return findRenderScopeDependency(callbackScope, callback.range);
    }

    function buildInitializerText(initText: string): string {
      const needsAsConst =
        /^(?:true|false|-?\d|\[|\{|[`'"])/.test(initText) &&
        !/\bas const\b/.test(initText);
      return needsAsConst ? `${initText} as const` : initText;
    }

    /**
     * The hoisted module-scope declaration for a default. The emitted line
     * always lands at column 0, so its width is exactly its length: the inline
     * spelling is kept while it fits the print width, and past it the
     * initializer is re-emitted one item per line — the shape prettier itself
     * settles on — instead of copying the source text verbatim. Null when no
     * within-width spelling exists: a numeric array prettier re-packs in fill
     * mode, an item too wide for its own line, an interior comment the
     * expansion cannot carry, or a non-literal initializer.
     */
    function buildConstDeclaration(
      constName: string,
      right: TSESTree.Expression,
    ): string | null {
      const rightText = sourceCode.getText(right);
      const initializerText = buildInitializerText(rightText);
      const inline = `const ${constName} = ${initializerText};`;
      if (!inline.includes('\n') && inline.length <= printWidth) {
        return inline;
      }
      const literal =
        right.type === AST_NODE_TYPES.TSAsExpression ? right.expression : right;
      if (
        (literal.type !== AST_NODE_TYPES.ObjectExpression &&
          literal.type !== AST_NODE_TYPES.ArrayExpression) ||
        // A parenthesized operand would leave its `(` outside the copied
        // ranges, so only a cast wrapping the bare literal is unwrapped.
        literal.range[0] !== right.range[0]
      ) {
        return null;
      }
      if (sourceCode.getCommentsInside(right).length > 0) {
        return null;
      }
      const items = expansionItemsOf(literal);
      if (items === null || items.length === 0) {
        return null;
      }
      // A cast written in the source survives via its own text; the appended
      // `as const` keeps parity with the inline spelling.
      const castSuffix =
        literal === right
          ? ''
          : sourceCode.text.slice(literal.range[1], right.range[1]);
      const appendedAsConst = initializerText === rightText ? '' : ' as const';
      const [open, close] =
        literal.type === AST_NODE_TYPES.ObjectExpression
          ? ['{', '}']
          : ['[', ']'];
      const itemTexts: string[] = [];
      for (const item of items) {
        const itemText = sourceCode.getText(item);
        if (itemText.includes('\n')) {
          return null;
        }
        itemTexts.push(itemText);
      }
      // A default written across lines can still fit the hoisted line once
      // collapsed. Prettier re-fits a short ARRAY onto one line, so for arrays
      // the collapsed spelling is the only fixed point; a collapsed short
      // object is a fixed point too.
      if (inline.includes('\n')) {
        const collapsedLiteral =
          literal.type === AST_NODE_TYPES.ObjectExpression
            ? `{ ${itemTexts.join(', ')} }`
            : `[${itemTexts.join(', ')}]`;
        const collapsed = `const ${constName} = ${collapsedLiteral}${castSuffix}${appendedAsConst};`;
        if (collapsed.length <= printWidth) {
          return collapsed;
        }
      }
      const unit = fileIndentUnit();
      const lines = [`const ${constName} = ${open}`];
      for (const itemText of itemTexts) {
        lines.push(`${unit}${itemText},`);
      }
      lines.push(`${close}${castSuffix}${appendedAsConst};`);
      return lines.every((line) => line.length <= printWidth)
        ? lines.join('\n')
        : null;
    }

    type Substitution = { range: TSESTree.Range; text: string };

    /**
     * The source of `range` with the given replacements applied. Only
     * replacements lying fully inside the range participate, so a caller can
     * hand over the whole substitution set and splice any sub-region.
     */
    function splicedText(
      range: TSESTree.Range,
      substitutions: Substitution[],
    ): string {
      const within = substitutions
        .filter((sub) => sub.range[0] >= range[0] && sub.range[1] <= range[1])
        .sort((a, b) => b.range[0] - a.range[0]);
      let text = sourceCode.text.slice(range[0], range[1]);
      for (const sub of within) {
        text =
          text.slice(0, sub.range[0] - range[0]) +
          sub.text +
          text.slice(sub.range[1] - range[0]);
      }
      return text;
    }

    /**
     * The offset where the CODE on a line ends, trailing comments excluded.
     * Prettier treats a trailing `//` comment as a line suffix and this fixer
     * never moves a comment, so the measured width has to be a function of the
     * code rather than of the commentary beside it.
     */
    function effectiveLineEnd(lineStart: number, lineEnd: number): number {
      const text = sourceCode.text;
      const comments = sourceCode.getAllComments();
      let effective = lineEnd;
      for (;;) {
        while (effective > lineStart && /[ \t]/.test(text[effective - 1])) {
          effective -= 1;
        }
        const trailing = comments.find(
          (comment) =>
            comment.range[1] === effective && comment.range[0] >= lineStart,
        );
        if (!trailing) {
          return effective;
        }
        effective = trailing.range[0];
      }
    }

    /**
     * The widest physical line spanned by `nodes` after substitution. Width is
     * judged on whole lines because the replaced defaults sit mid-line: the
     * prefix and suffix around them count toward the print width too.
     */
    function widestLineAfter(
      nodes: TSESTree.Node[],
      substitutions: Substitution[],
    ): number {
      const startLine = Math.min(...nodes.map((node) => node.loc.start.line));
      const endLine = Math.max(...nodes.map((node) => node.loc.end.line));
      const range: TSESTree.Range = [
        sourceCode.getIndexFromLoc({ line: startLine, column: 0 }),
        sourceCode.getIndexFromLoc({
          line: endLine,
          column: sourceCode.lines[endLine - 1]?.length ?? 0,
        }),
      ];
      // Trailing comments are masked out of the measurement (a span replaced
      // by a substitution keeps its own accounting).
      const masked = [...substitutions];
      for (let line = startLine; line <= endLine; line += 1) {
        const lineStart = sourceCode.getIndexFromLoc({ line, column: 0 });
        const lineEnd = lineStart + (sourceCode.lines[line - 1]?.length ?? 0);
        const effective = effectiveLineEnd(lineStart, lineEnd);
        if (
          effective === lineEnd ||
          substitutions.some(
            (sub) => sub.range[0] < lineEnd && effective < sub.range[1],
          )
        ) {
          continue;
        }
        masked.push({ range: [effective, lineEnd], text: '' });
      }
      return Math.max(
        ...splicedText(range, masked)
          .split('\n')
          .map((line) => line.length),
      );
    }

    /**
     * The variable declaration whose destructuring pattern contains `node`, or
     * null for a pattern in a function signature (or any other position).
     */
    function owningDeclarationOf(
      node: TSESTree.Node,
    ): TSESTree.VariableDeclaration | null {
      let current: TSESTree.Node = node;
      while (current.parent) {
        const parent = current.parent as TSESTree.Node;
        if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
          return parent.id === current &&
            parent.parent?.type === AST_NODE_TYPES.VariableDeclaration
            ? parent.parent
            : null;
        }
        if (
          parent.type === AST_NODE_TYPES.ObjectPattern ||
          parent.type === AST_NODE_TYPES.ArrayPattern ||
          parent.type === AST_NODE_TYPES.AssignmentPattern ||
          parent.type === AST_NODE_TYPES.Property ||
          parent.type === AST_NODE_TYPES.RestElement
        ) {
          current = parent;
          continue;
        }
        return null;
      }
      return null;
    }

    /**
     * Re-derives a destructuring declaration's layout after substitution the
     * way prettier chooses it, measured against the print width: everything on
     * one line while it fits; a "complex" object pattern — three or more
     * entries, at least one defaulted or renamed — breaks one entry per line;
     * an object/array initializer hugs the `= {` and breaks its own items; a
     * remaining overflow breaks after `=`; only then does the pattern break
     * open. Each arm was verified as a prettier fixed point. Returns null for
     * a shape the rebuild does not own — the caller then keeps plain
     * substitutions when they fit and declines them when they overflow.
     */
    function rebuildDeclaration(
      declaration: TSESTree.VariableDeclaration,
      substitutions: Substitution[],
    ): string | null {
      if (declaration.declare || declaration.declarations.length !== 1) {
        return null;
      }
      const declarator = declaration.declarations[0];
      const pattern = declarator.id;
      const init = declarator.init;
      if (
        (pattern.type !== AST_NODE_TYPES.ObjectPattern &&
          pattern.type !== AST_NODE_TYPES.ArrayPattern) ||
        !init
      ) {
        return null;
      }
      // Comments have no anchor in rebuilt text; leave the layout alone.
      if (sourceCode.getCommentsInside(declaration).length > 0) {
        return null;
      }
      const firstLine = sourceCode.lines[declaration.loc.start.line - 1] ?? '';
      const indent = firstLine.slice(0, declaration.loc.start.column);
      const lastLineStart = sourceCode.getIndexFromLoc({
        line: declaration.loc.end.line,
        column: 0,
      });
      const lastLineEnd =
        lastLineStart +
        (sourceCode.lines[declaration.loc.end.line - 1] ?? '').length;
      // Reflowing lines the statement shares with other CODE would relocate
      // that code, so the rebuild only owns statements that own their lines. A
      // trailing comment is fine: it sits outside the replaced range and rides
      // along after the rebuilt text.
      if (
        indent.trim() !== '' ||
        effectiveLineEnd(lastLineStart, lastLineEnd) > declaration.range[1]
      ) {
        return null;
      }

      const entries = (
        pattern.type === AST_NODE_TYPES.ObjectPattern
          ? pattern.properties
          : pattern.elements
      ) as Array<TSESTree.Node | null>;
      if (entries.length === 0 || entries.some((entry) => entry === null)) {
        return null;
      }
      const patternEntries = entries as TSESTree.Node[];
      const entryTexts: string[] = [];
      for (const entry of patternEntries) {
        const text = splicedText(entry.range, substitutions);
        if (text.includes('\n')) {
          return null;
        }
        entryTexts.push(text);
      }
      const [open, close] =
        pattern.type === AST_NODE_TYPES.ObjectPattern ? ['{', '}'] : ['[', ']'];
      const patternInline =
        pattern.type === AST_NODE_TYPES.ObjectPattern
          ? `{ ${entryTexts.join(', ')} }`
          : `[${entryTexts.join(', ')}]`;

      const isLiteralInit =
        init.type === AST_NODE_TYPES.ObjectExpression ||
        init.type === AST_NODE_TYPES.ArrayExpression;
      const initItemTexts = (() => {
        if (!isLiteralInit) {
          return null;
        }
        const items = expansionItemsOf(
          init as TSESTree.ObjectExpression | TSESTree.ArrayExpression,
        );
        if (items === null || items.length === 0) {
          return null;
        }
        const texts: string[] = [];
        for (const item of items) {
          const text = sourceCode.getText(item);
          if (text.includes('\n')) {
            return null;
          }
          texts.push(text);
        }
        return texts;
      })();
      const initText = sourceCode.getText(init);
      // A multi-line OBJECT literal keeps its break (prettier preserves the
      // newline after `{`), so only a multi-line ARRAY initializer may be
      // collapsed back onto the line.
      const initInline = !initText.includes('\n')
        ? initText
        : init.type === AST_NODE_TYPES.ArrayExpression && initItemTexts !== null
        ? `[${initItemTexts.join(', ')}]`
        : null;

      const fits = (line: string) => line.length <= printWidth;
      const unit = fileIndentUnit();
      const finish = (lines: string[] | null): string | null =>
        lines && lines.every(fits)
          ? lines.join('\n').slice(indent.length)
          : null;

      // Prettier breaks an object pattern open unconditionally when a
      // property's value is itself an object pattern, so no inline spelling of
      // such a pattern is a fixed point.
      const hasNestedObjectPatternEntry =
        pattern.type === AST_NODE_TYPES.ObjectPattern &&
        pattern.properties.some(
          (property) =>
            property.type === AST_NODE_TYPES.Property &&
            property.value.type === AST_NODE_TYPES.ObjectPattern,
        );

      if (initInline !== null && !hasNestedObjectPatternEntry) {
        const inline = `${indent}${declaration.kind} ${patternInline} = ${initInline};`;
        if (fits(inline)) {
          return inline.slice(indent.length);
        }
      }

      const expandedPattern = (): string[] | null => {
        if (initInline === null) {
          return null;
        }
        const lines = [`${indent}${declaration.kind} ${open}`];
        patternEntries.forEach((entry, index) => {
          // A trailing comma after a rest element is a syntax error inside a
          // destructuring pattern, so the final rest entry goes bare.
          const bareRest =
            index === patternEntries.length - 1 &&
            entry.type === AST_NODE_TYPES.RestElement;
          lines.push(
            `${indent}${unit}${entryTexts[index]}${bareRest ? '' : ','}`,
          );
        });
        lines.push(`${indent}${close} = ${initInline};`);
        return lines;
      };

      const isComplexPattern =
        pattern.type === AST_NODE_TYPES.ObjectPattern &&
        pattern.properties.length > 2 &&
        pattern.properties.some(
          (property) =>
            property.type === AST_NODE_TYPES.Property &&
            (!property.shorthand ||
              property.value.type === AST_NODE_TYPES.AssignmentPattern),
        );
      if (isComplexPattern || hasNestedObjectPatternEntry) {
        return finish(expandedPattern());
      }

      if (isLiteralInit) {
        // Prettier hugs a literal initializer — `= {` holds the head line and
        // the items break — so no other layout is a fixed point here.
        if (initItemTexts === null) {
          return null;
        }
        const [initOpen, initClose] =
          init.type === AST_NODE_TYPES.ObjectExpression
            ? ['{', '}']
            : ['[', ']'];
        const lines = [
          `${indent}${declaration.kind} ${patternInline} = ${initOpen}`,
        ];
        for (const itemText of initItemTexts) {
          lines.push(`${indent}${unit}${itemText},`);
        }
        lines.push(`${indent}${initClose};`);
        return finish(lines);
      }

      const brokenAfterEquals =
        initInline === null
          ? null
          : [
              `${indent}${declaration.kind} ${patternInline} =`,
              `${indent}${unit}${initInline};`,
            ];
      return finish(brokenAfterEquals) ?? finish(expandedPattern());
    }

    function reportStaticDefaults(
      patterns: Array<TSESTree.ObjectPattern | TSESTree.ArrayPattern>,
      enclosingFn:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | null,
      nodeForReport: TSESTree.Node,
    ) {
      if (!enclosingFn || !isComponentOrHookFunction(enclosingFn)) return;

      const defaults: Array<{
        assignment: TSESTree.AssignmentPattern;
        localName: string;
      }> = [];
      for (const pattern of patterns) {
        defaults.push(...collectAssignmentDefaultsFromPattern(pattern));
      }
      if (defaults.length === 0) return;

      const staticDefaults = defaults.filter((def) => {
        const right = def.assignment.right as TSESTree.Expression | null;
        return right && !hasIdentifiers(right);
      });
      if (staticDefaults.length === 0) return;

      const reportScope = scopeOf(nodeForReport);

      context.report({
        node: nodeForReport,
        messageId: 'extractDefaultToGlobalConstant',
        fix(fixer) {
          type Candidate = {
            right: TSESTree.Expression;
            constName: string;
            declText: string | null;
            needsDeclaration: boolean;
          };

          const candidates: Candidate[] = [];
          // Names this fix commits to declaring, mapped to the initializer it
          // declares them with, so sibling defaults sharing a generated name
          // share the declaration instead of duplicating the binding. A null
          // declaration text poisons the name: no within-width spelling of
          // the hoisted line exists.
          const scheduledInits = new Map<
            string,
            { initText: string; declText: string | null }
          >();

          for (const def of staticDefaults) {
            const { assignment, localName } = def;
            const right = assignment.right as TSESTree.Expression;
            const rightText = sourceCode.getText(right);
            const constName = `DEFAULT_${toUpperSnakeCase(localName)}`;
            const initText = buildInitializerText(rightText);

            const scheduled = scheduledInits.get(constName);
            if (scheduled !== undefined) {
              if (
                scheduled.initText !== initText ||
                scheduled.declText === null
              ) {
                continue;
              }
              candidates.push({
                right,
                constName,
                declText: scheduled.declText,
                needsDeclaration: true,
              });
              continue;
            }

            const resolution = resolveGeneratedName(reportScope, constName);
            if (resolution.kind === 'blocked') {
              // Declining leaves the report in place: the developer extracts
              // the constant by hand instead of the fixer corrupting the file.
              continue;
            }
            if (resolution.kind === 'reusable') {
              // Reuse is safe only when the existing constant holds the very
              // same value; `as const` may be present on either side.
              if (
                resolution.initText !== initText &&
                resolution.initText !== rightText
              ) {
                continue;
              }
              candidates.push({
                right,
                constName,
                declText: null,
                needsDeclaration: false,
              });
              continue;
            }

            const declText = buildConstDeclaration(constName, right);
            scheduledInits.set(constName, { initText, declText });
            if (declText === null) {
              // No within-width spelling of the hoisted line exists; declining
              // beats authoring a line prettier immediately rewraps.
              continue;
            }
            candidates.push({
              right,
              constName,
              declText,
              needsDeclaration: true,
            });
          }

          if (candidates.length === 0) return null;

          // Substitutions are gated per owning statement: pointing a default
          // at its generated name inflates (or deflates) the destructuring
          // line, so the line is measured — and relaid out where needed —
          // rather than edited blind.
          const groups = new Map<
            TSESTree.VariableDeclaration | null,
            Candidate[]
          >();
          for (const candidate of candidates) {
            const owner = owningDeclarationOf(candidate.right);
            const group = groups.get(owner) ?? [];
            group.push(candidate);
            groups.set(owner, group);
          }

          const fixes: TSESLint.RuleFix[] = [];
          const surviving: Candidate[] = [];
          for (const [owner, group] of groups) {
            const substitutions = group.map((candidate) => ({
              range: candidate.right.range,
              text: candidate.constName,
            }));
            const overWide =
              widestLineAfter(
                group.map((candidate) => candidate.right),
                substitutions,
              ) > printWidth;
            const pushPlain = () => {
              surviving.push(...group);
              for (const sub of substitutions) {
                fixes.push(fixer.replaceTextRange(sub.range, sub.text));
              }
            };
            if (owner === null) {
              // A pattern in a function signature has no rebuild here; an
              // overflowing line declines its substitutions.
              if (!overWide) {
                pushPlain();
              }
              continue;
            }
            const spansLines = owner.loc.start.line !== owner.loc.end.line;
            if (!overWide && !spansLines) {
              pushPlain();
              continue;
            }
            // An overflow needs a wider layout; a multi-line statement may
            // deserve a narrower one (prettier collapses a destructure whose
            // substituted spelling fits on one line).
            const rebuilt = rebuildDeclaration(owner, substitutions);
            if (rebuilt === null) {
              if (!overWide) {
                pushPlain();
              }
              continue;
            }
            if (rebuilt === splicedText(owner.range, substitutions)) {
              pushPlain();
              continue;
            }
            surviving.push(...group);
            fixes.push(fixer.replaceText(owner, rebuilt));
          }

          if (fixes.length === 0) return null;

          const declLines: string[] = [];
          const declaredNames = new Set<string>();
          for (const candidate of surviving) {
            if (
              !candidate.needsDeclaration ||
              candidate.declText === null ||
              declaredNames.has(candidate.constName)
            ) {
              continue;
            }
            declaredNames.add(candidate.constName);
            declLines.push(candidate.declText);
          }

          if (declLines.length > 0) {
            const program = sourceCode.ast;
            const constSection =
              declLines.length === 1
                ? declLines[0]
                : `${declLines[0]}\n\n${declLines.slice(1).join('\n')}`;
            const text = sourceCode.text;
            const findNextNonWhitespace = (start: number): number => {
              let idx = start;
              while (idx < text.length && /\s/.test(text[idx])) {
                idx += 1;
              }
              return idx;
            };
            const buildBlock = (
              extraSpacing: boolean,
              insertPos: number,
              nextPos: number,
            ): string => {
              const whitespace = text.slice(insertPos, nextPos);
              const lastNewline = whitespace.lastIndexOf('\n');
              const nextIndentRaw =
                lastNewline === -1
                  ? ''
                  : whitespace.slice(lastNewline + 1).replace(/[^\t ]/g, '');
              const separator = extraSpacing ? '\n\n\n' : '\n\n';
              const nextIndent = extraSpacing ? nextIndentRaw : '';
              return `\n${constSection}${separator}${nextIndent}`;
            };
            const imports = program.body.filter(
              (s) => s.type === AST_NODE_TYPES.ImportDeclaration,
            );
            if (imports.length > 0) {
              const lastImport = imports[imports.length - 1];
              const insertPos = lastImport.range![1];
              const nextPos = findNextNonWhitespace(insertPos);
              fixes.push(
                fixer.replaceTextRange(
                  [insertPos, nextPos],
                  buildBlock(false, insertPos, nextPos),
                ),
              );
            } else {
              const body = program.body;
              // A shebang has to stay at character 0 or the file stops parsing
              // (TS18026), so it bounds the insertion the same way the
              // directive prologue below does.
              let insertPos = afterShebang(text);
              let afterDirectiveIdx = -1;
              for (let i = 0; i < body.length; i++) {
                const stmt = body[i];
                if (
                  stmt.type === AST_NODE_TYPES.ExpressionStatement &&
                  stmt.expression.type === AST_NODE_TYPES.Literal &&
                  typeof stmt.expression.value === 'string'
                ) {
                  afterDirectiveIdx = i;
                } else {
                  break;
                }
              }
              if (afterDirectiveIdx >= 0) {
                insertPos = body[afterDirectiveIdx].range![1];
              }
              const nextPos = findNextNonWhitespace(insertPos);
              fixes.push(
                fixer.replaceTextRange(
                  [insertPos, nextPos],
                  buildBlock(afterDirectiveIdx < 0, insertPos, nextPos),
                ),
              );
            }
          }

          return fixes;
        },
      });
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type !== AST_NODE_TYPES.Identifier ||
          node.callee.name !== 'useMemo'
        ) {
          return;
        }

        if (node.arguments.length !== 2) {
          return;
        }

        const depsArray = node.arguments[1];
        if (
          depsArray.type !== AST_NODE_TYPES.ArrayExpression ||
          depsArray.elements.length !== 0
        ) {
          return;
        }

        const callback = node.arguments[0];
        if (
          callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callback.type !== AST_NODE_TYPES.FunctionExpression
        ) {
          return;
        }

        let returnValue: TSESTree.Expression | null = null;

        if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
          const returnStatement = callback.body.body.find(
            (stmt) => stmt.type === AST_NODE_TYPES.ReturnStatement,
          ) as TSESTree.ReturnStatement | undefined;

          if (!returnStatement || !returnStatement.argument) {
            return;
          }

          returnValue = returnStatement.argument;
        } else {
          returnValue = callback.body;
        }

        let actualReturnValue = returnValue;
        if (returnValue.type === AST_NODE_TYPES.TSAsExpression) {
          actualReturnValue = returnValue.expression;
        }

        if (
          actualReturnValue.type !== AST_NODE_TYPES.ObjectExpression &&
          !(
            actualReturnValue.type === AST_NODE_TYPES.ArrayExpression &&
            actualReturnValue.elements.some(
              (element) =>
                element !== null &&
                element.type === AST_NODE_TYPES.ObjectExpression,
            )
          )
        ) {
          return;
        }

        // An empty dependency array means the author DECLARED no dependencies,
        // not that there are none. When the callback closes over a render-scope
        // value, hoisting the literal to module scope does not compile — the
        // name it reads exists only during a render — so prescribing a global
        // constant is advice that cannot be followed. The reachable remedy is
        // the omitted dependency, which is what the split below names.
        const renderScopeDependency = getRenderScopeDependency(callback);

        if (renderScopeDependency !== null) {
          context.report({
            node,
            messageId: 'declareMemoDependency',
            data: { name: renderScopeDependency },
          });
          return;
        }

        context.report({
          node,
          messageId: 'useGlobalConstant',
        });
      },

      VariableDeclaration(node) {
        const relevantDeclarators = node.declarations.filter(
          (d) =>
            d.id.type === AST_NODE_TYPES.ObjectPattern ||
            d.id.type === AST_NODE_TYPES.ArrayPattern,
        );
        if (relevantDeclarators.length === 0) return;

        const enclosingFn = getEnclosingFunction(node);
        reportStaticDefaults(
          relevantDeclarators.map(
            (d) => d.id as TSESTree.ObjectPattern | TSESTree.ArrayPattern,
          ),
          enclosingFn,
          node,
        );
      },

      FunctionDeclaration(node) {
        const patterns = node.params.filter(
          (p): p is TSESTree.ObjectPattern | TSESTree.ArrayPattern =>
            p.type === AST_NODE_TYPES.ObjectPattern ||
            p.type === AST_NODE_TYPES.ArrayPattern,
        );
        if (patterns.length === 0) return;
        reportStaticDefaults(patterns, node, node);
      },

      FunctionExpression(node) {
        const patterns = node.params.filter(
          (p): p is TSESTree.ObjectPattern | TSESTree.ArrayPattern =>
            p.type === AST_NODE_TYPES.ObjectPattern ||
            p.type === AST_NODE_TYPES.ArrayPattern,
        );
        if (patterns.length === 0) return;
        reportStaticDefaults(patterns, node, node);
      },

      ArrowFunctionExpression(node) {
        const patterns = node.params.filter(
          (p): p is TSESTree.ObjectPattern | TSESTree.ArrayPattern =>
            p.type === AST_NODE_TYPES.ObjectPattern ||
            p.type === AST_NODE_TYPES.ArrayPattern,
        );
        if (patterns.length === 0) return;
        reportStaticDefaults(patterns, node, node);
      },
    };
  },
});
