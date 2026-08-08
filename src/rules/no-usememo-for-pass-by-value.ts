import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESTree,
  TSESLint,
  ASTUtils,
} from '@typescript-eslint/utils';
import ts from 'typescript';
import { createRule } from '../utils/createRule';
import {
  ReplacementSegment,
  joinSegmentBody,
  joinSegments,
  requiresLineBreakAfter,
} from '../utils/replacementSegments';

type Options = [
  {
    /**
     * Patterns (regex strings) that describe call expressions considered "expensive"
     * and therefore allowed even when they return pass-by-value types.
     */
    allowExpensiveCalleePatterns?: string[];
  },
];

type MessageIds = 'primitiveMemo' | 'invalidRegex';

const DEFAULT_EXPENSIVE_PATTERNS = [
  'compute',
  'calculate',
  'derive',
  'generate',
  'expensive',
  'heavy',
  'hash',
];

/**
 * Resolved on first use rather than at module load: the plugin barrel imports
 * every rule eagerly, and the compiler package root does not expose this enum on
 * all installed TypeScript releases (TypeScript 7 exports only a version stub),
 * so dereferencing it at module scope makes the whole plugin fail to load rather
 * than merely disabling this type-aware rule. The sole call site sits behind a
 * `parserServices.program` guard, so the enum is present whenever this runs.
 */
let passByValueFlagsCache: number | undefined;
function passByValueFlags(): number {
  passByValueFlagsCache ??=
    ts.TypeFlags.StringLike |
    ts.TypeFlags.NumberLike |
    ts.TypeFlags.BigIntLike |
    ts.TypeFlags.BooleanLike |
    ts.TypeFlags.Undefined |
    ts.TypeFlags.Null;
  return passByValueFlagsCache;
}

type FunctionContext = {
  isHook: boolean;
  hookName?: string;
  memoVariables: WeakMap<TSESLint.Scope.Variable, TSESTree.CallExpression>;
};

type UseMemoImports = {
  useMemoNames: Set<string>;
  useMemoSpecifiers: Map<string, TSESTree.ImportSpecifier>;
  reactNamespaceNames: Set<string>;
};

function isCustomHookName(name: string | undefined): boolean {
  if (!name) return false;
  return /^use[A-Z]/.test(name);
}

function getFunctionName(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): string | undefined {
  if (
    node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    node.id?.type === AST_NODE_TYPES.Identifier
  ) {
    return node.id.name;
  }

  if (
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  return undefined;
}

function collectUseMemoImports(program: TSESTree.Program): UseMemoImports {
  const useMemoNames = new Set<string>();
  const useMemoSpecifiers = new Map<string, TSESTree.ImportSpecifier>();
  const reactNamespaceNames = new Set<string>();

  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      statement.source.value !== 'react'
    ) {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.imported.type === AST_NODE_TYPES.Identifier &&
        specifier.imported.name === 'useMemo'
      ) {
        useMemoNames.add(specifier.local.name);
        useMemoSpecifiers.set(specifier.local.name, specifier);
      }

      if (
        specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
        specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
      ) {
        reactNamespaceNames.add(specifier.local.name);
      }
    }
  }

  return { useMemoNames, useMemoSpecifiers, reactNamespaceNames };
}

function getReturnedExpression(
  callback:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
): TSESTree.Expression | null {
  if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
    if (callback.body.body.length !== 1) {
      return null;
    }

    const [onlyStatement] = callback.body.body;
    if (
      onlyStatement.type === AST_NODE_TYPES.ReturnStatement &&
      onlyStatement.argument
    ) {
      return onlyStatement.argument;
    }

    return null;
  }

  return callback.body;
}

function isPassByValueType(
  type: ts.Type,
  checker: ts.TypeChecker,
): { passByValue: boolean; indeterminate: boolean; description: string } {
  const description = checker.typeToString(type);

  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    return { passByValue: false, indeterminate: true, description };
  }

  if (type.flags & ts.TypeFlags.Never) {
    return { passByValue: false, indeterminate: false, description };
  }

  if (type.flags & ts.TypeFlags.Union) {
    const unionType = type as ts.UnionType;
    let sawIndeterminate = false;

    for (const part of unionType.types) {
      const result = isPassByValueType(part, checker);
      if (result.indeterminate) {
        sawIndeterminate = true;
        break;
      }
      if (!result.passByValue) {
        return { passByValue: false, indeterminate: false, description };
      }
    }

    if (sawIndeterminate) {
      return { passByValue: false, indeterminate: true, description };
    }

    return { passByValue: true, indeterminate: false, description };
  }

  if (checker.isTupleType(type)) {
    const typeArguments = checker.getTypeArguments(type as ts.TypeReference);
    let allPrimitive = true;
    let sawIndeterminate = false;

    for (const elementType of typeArguments) {
      const result = isPassByValueType(elementType, checker);
      if (result.indeterminate) {
        sawIndeterminate = true;
        break;
      }
      if (!result.passByValue) {
        allPrimitive = false;
        break;
      }
    }

    if (sawIndeterminate) {
      return { passByValue: false, indeterminate: true, description };
    }
    return { passByValue: allPrimitive, indeterminate: false, description };
  }

  if (checker.isArrayType(type) || checker.isArrayLikeType(type)) {
    const typeArguments = checker.getTypeArguments(type as ts.TypeReference);
    const elementType = typeArguments[0];
    if (elementType) {
      if (elementType.flags & ts.TypeFlags.Never) {
        // TypeScript infers [] as never[]. The array still has reference identity, but this rule
        // treats it as a primitive-only array by definition (vacuously) to avoid special-casing.
        return { passByValue: true, indeterminate: false, description };
      }
      const result = isPassByValueType(elementType, checker);
      return { ...result, description };
    }
    // Conservative: arrays with unresolvable element types are indeterminate.
    return { passByValue: false, indeterminate: true, description };
  }

  if (type.flags & passByValueFlags()) {
    return { passByValue: true, indeterminate: false, description };
  }

  return { passByValue: false, indeterminate: false, description };
}

function getCalleeName(node: TSESTree.CallExpression): string | null {
  if (node.callee.type === AST_NODE_TYPES.Identifier) {
    return node.callee.name;
  }

  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    const object =
      node.callee.object.type === AST_NODE_TYPES.Identifier
        ? node.callee.object.name
        : null;
    if (!object) {
      return node.callee.property.name;
    }
    return `${object}.${node.callee.property.name}`;
  }

  return null;
}

function matchesExpensiveCalleePattern(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  expensiveMatchers: RegExp[],
): boolean {
  const returnedExpression = getReturnedExpression(callback);
  if (
    !returnedExpression ||
    returnedExpression.type !== AST_NODE_TYPES.CallExpression
  ) {
    return false;
  }

  const calleeName = getCalleeName(returnedExpression);
  if (!calleeName) {
    return false;
  }

  return expensiveMatchers.some((matcher) => matcher.test(calleeName));
}

function isImportedIdentifier(
  identifier: TSESTree.Identifier,
  resolveVariable: (id: TSESTree.Identifier) => TSESLint.Scope.Variable | null,
): boolean {
  // Treat identifiers as React bindings only when they resolve to an import.
  // This avoids unsafe auto-fixes when names like "React" or "useMemo" are shadowed
  // by parameters/locals or represent non-React values.
  const variable = resolveVariable(identifier);
  return variable?.defs.some((def) => def.type === 'ImportBinding') ?? false;
}

function isUseMemoCall(
  node: TSESTree.CallExpression,
  imports: UseMemoImports,
  resolveVariable: (id: TSESTree.Identifier) => TSESLint.Scope.Variable | null,
): boolean {
  if (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    imports.useMemoNames.has(node.callee.name)
  ) {
    return isImportedIdentifier(node.callee, resolveVariable);
  }

  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'useMemo' &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    imports.reactNamespaceNames.has(node.callee.object.name) &&
    isImportedIdentifier(node.callee.object, resolveVariable)
  ) {
    return true;
  }

  return false;
}

function scanBackwardOverWhitespace(text: string, position: number): number {
  let pos = position;
  while (pos > 0 && (text[pos - 1] === ' ' || text[pos - 1] === '\t')) {
    pos -= 1;
  }
  return pos;
}

function scanForwardOverWhitespace(text: string, position: number): number {
  let pos = position;
  while (pos < text.length && (text[pos] === ' ' || text[pos] === '\t')) {
    pos += 1;
  }
  return pos;
}

function consumeLineBreak(
  text: string,
  position: number,
): { consumed: boolean; newPosition: number } {
  if (
    position < text.length &&
    text[position] === '\r' &&
    text[position + 1] === '\n'
  ) {
    return { consumed: true, newPosition: position + 2 };
  }
  if (
    position < text.length &&
    (text[position] === '\n' || text[position] === '\r')
  ) {
    return { consumed: true, newPosition: position + 1 };
  }
  return { consumed: false, newPosition: position };
}

function hasDeclaredVariables(source: unknown): source is {
  getDeclaredVariables: (node: TSESTree.Node) => TSESLint.Scope.Variable[];
} {
  return (
    typeof source === 'object' &&
    source !== null &&
    'getDeclaredVariables' in source &&
    typeof (source as { getDeclaredVariables?: unknown })
      .getDeclaredVariables === 'function'
  );
}

function removeCompleteImport(
  importDeclaration: TSESTree.ImportDeclaration,
  sourceCode: Readonly<TSESLint.SourceCode>,
  fixer: TSESLint.RuleFixer,
): TSESLint.RuleFix {
  const text = sourceCode.getText();
  let [start, end] = importDeclaration.range;

  const beforeImport = scanBackwardOverWhitespace(text, start);
  const lineBreakIndex = beforeImport - 1;
  if (
    lineBreakIndex >= 0 &&
    (text[lineBreakIndex] === '\n' || text[lineBreakIndex] === '\r')
  ) {
    const lineBreakStart =
      text[lineBreakIndex] === '\n' &&
      lineBreakIndex > 0 &&
      text[lineBreakIndex - 1] === '\r'
        ? lineBreakIndex - 1
        : lineBreakIndex;

    const whitespaceBeforeLineBreak = scanBackwardOverWhitespace(
      text,
      lineBreakStart,
    );
    const precedingCharIndex = whitespaceBeforeLineBreak - 1;
    const lineIsWhitespaceOnly =
      whitespaceBeforeLineBreak === 0 ||
      (precedingCharIndex >= 0 &&
        (text[precedingCharIndex] === '\n' ||
          text[precedingCharIndex] === '\r'));

    start = lineIsWhitespaceOnly ? whitespaceBeforeLineBreak : beforeImport;
  } else {
    start = beforeImport;
  }

  const afterImportWhitespace = scanForwardOverWhitespace(text, end);
  const firstLineBreak = consumeLineBreak(text, afterImportWhitespace);
  let removalEnd = afterImportWhitespace;

  if (firstLineBreak.consumed) {
    const afterFirstBreak = firstLineBreak.newPosition;
    const spacesAfterFirst = scanForwardOverWhitespace(text, afterFirstBreak);
    const secondLineBreak = consumeLineBreak(text, spacesAfterFirst);
    if (secondLineBreak.consumed) {
      // Remove a trailing blank line but stop before consuming indentation of the next statement.
      removalEnd = secondLineBreak.newPosition;
    } else {
      // Keep indentation that belongs to the following statement.
      removalEnd = afterFirstBreak;
    }
  }

  return fixer.removeRange([start, removalEnd]);
}

/**
 * Removing the last binding removes the whole declaration, but a comment
 * written inside it (between the braces, around the source) must not go with
 * it: the declaration's span is re-emitted as just those comments, each kept in
 * order, with a line break appended when the last one would otherwise swallow
 * whatever follows the declaration on its line.
 */
function removeCompleteImportPreservingComments(
  importDeclaration: TSESTree.ImportDeclaration,
  sourceCode: Readonly<TSESLint.SourceCode>,
  fixer: TSESLint.RuleFixer,
): TSESLint.RuleFix {
  const comments = sourceCode.getCommentsInside(importDeclaration);
  if (comments.length === 0) {
    return removeCompleteImport(importDeclaration, sourceCode, fixer);
  }

  const text = sourceCode.getText();
  const carried = comments
    .map((comment) => text.slice(comment.range[0], comment.range[1]))
    .join('\n');
  const suffix = requiresLineBreakAfter(comments[comments.length - 1])
    ? '\n'
    : '';
  return fixer.replaceText(importDeclaration, `${carried}${suffix}`);
}

function isCommaToken(token: TSESTree.Token | null): token is TSESTree.Token {
  return (
    token !== null &&
    token.type === AST_TOKEN_TYPES.Punctuator &&
    token.value === ','
  );
}

/**
 * Deletes the `useMemo` specifier and one adjacent comma while other NAMED
 * specifiers remain. Only the tokens being retired are edited — never the
 * declaration re-emitted from its parts — so every comment elsewhere in the
 * declaration survives verbatim. When nothing but whitespace separates the
 * retired tokens from their neighbour the removal range swallows that
 * whitespace too; when a comment sits in between, the tokens are removed
 * individually around it.
 */
function removeSpecifierFixes(
  specifier: TSESTree.ImportSpecifier,
  sourceCode: Readonly<TSESLint.SourceCode>,
  fixer: TSESLint.RuleFixer,
): TSESLint.RuleFix[] {
  const commaAfter = sourceCode.getTokenAfter(specifier);
  if (isCommaToken(commaAfter)) {
    const nextToken = sourceCode.getTokenAfter(commaAfter);
    if (nextToken && !sourceCode.commentsExistBetween(specifier, nextToken)) {
      return [fixer.removeRange([specifier.range[0], nextToken.range[0]])];
    }
    return [fixer.remove(specifier), fixer.removeRange(commaAfter.range)];
  }

  const commaBefore = sourceCode.getTokenBefore(specifier);
  if (isCommaToken(commaBefore)) {
    if (!sourceCode.commentsExistBetween(commaBefore, specifier)) {
      return [fixer.removeRange([commaBefore.range[0], specifier.range[1]])];
    }
    return [fixer.removeRange(commaBefore.range), fixer.remove(specifier)];
  }

  return [fixer.remove(specifier)];
}

/**
 * Deletes the whole `{ useMemo }` group — braces, specifier and the comma
 * joining it to the default specifier — when `useMemo` is the only named
 * binding but a default import keeps the declaration alive. As above, comments
 * inside the group survive by shrinking the edit to the individual tokens.
 */
function removeNamedGroupFixes(
  specifier: TSESTree.ImportSpecifier,
  sourceCode: Readonly<TSESLint.SourceCode>,
  fixer: TSESLint.RuleFixer,
): TSESLint.RuleFix[] {
  const openBrace = sourceCode.getTokenBefore(specifier, {
    filter: (token) => token.value === '{',
  });
  const closeBrace = sourceCode.getTokenAfter(specifier, {
    filter: (token) => token.value === '}',
  });
  if (!openBrace || !closeBrace) {
    return [fixer.remove(specifier)];
  }

  const commaBefore = sourceCode.getTokenBefore(openBrace);
  const start = isCommaToken(commaBefore) ? commaBefore : openBrace;
  if (!sourceCode.commentsExistBetween(start, closeBrace)) {
    return [fixer.removeRange([start.range[0], closeBrace.range[1]])];
  }

  const fixes: TSESLint.RuleFix[] = [];
  if (start !== openBrace) {
    fixes.push(fixer.removeRange(start.range));
  }
  fixes.push(fixer.removeRange(openBrace.range), fixer.remove(specifier));
  const trailingComma = sourceCode.getTokenAfter(specifier);
  if (isCommaToken(trailingComma)) {
    fixes.push(fixer.removeRange(trailingComma.range));
  }
  fixes.push(fixer.removeRange(closeBrace.range));
  return fixes;
}

function getImportRemovalFixes(
  specifier: TSESTree.ImportSpecifier,
  sourceCode: Readonly<TSESLint.SourceCode>,
  fixer: TSESLint.RuleFixer,
): TSESLint.RuleFix[] {
  const importDeclaration = specifier.parent;
  if (
    !importDeclaration ||
    importDeclaration.type !== AST_NODE_TYPES.ImportDeclaration
  ) {
    return [];
  }

  const remainingSpecifiers = importDeclaration.specifiers.filter(
    (candidate) => candidate !== specifier,
  );

  if (remainingSpecifiers.length === 0) {
    return [
      removeCompleteImportPreservingComments(
        importDeclaration,
        sourceCode,
        fixer,
      ),
    ];
  }

  const hasOtherNamedSpecifiers = remainingSpecifiers.some(
    (candidate) => candidate.type === AST_NODE_TYPES.ImportSpecifier,
  );
  if (!hasOtherNamedSpecifiers) {
    return removeNamedGroupFixes(specifier, sourceCode, fixer);
  }

  return removeSpecifierFixes(specifier, sourceCode, fixer);
}

function getReplacementText(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): string | null {
  const returnedExpression = getReturnedExpression(callback);
  if (!returnedExpression) {
    return null;
  }

  if (
    callback.body.type === AST_NODE_TYPES.BlockStatement &&
    callback.body.body.length !== 1
  ) {
    return null;
  }

  return sourceCode.getText(returnedExpression);
}

/**
 * Comments inside the `useMemo(...)` span but outside the returned expression.
 *
 * The fix replaces the whole call with the text of the returned expression, so
 * the callback wrapper, the `return` keyword, the dependency array and every
 * piece of trivia between them disappear. A comment sitting in any of those
 * places has no surviving anchor in the replacement, so the fixer carries it
 * into the replacement instead (#1877). A comment inside the returned
 * expression needs no carrying: its text is copied verbatim with the
 * expression.
 */
function strandedCommentsOf(
  node: TSESTree.CallExpression,
  returnedExpression: TSESTree.Expression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): TSESTree.Comment[] {
  return sourceCode
    .getCommentsInside(node)
    .filter(
      (comment) =>
        comment.range[0] < returnedExpression.range[0] ||
        comment.range[1] > returnedExpression.range[1],
    );
}

function isSafeAtomicExpression(expression: TSESTree.Expression): boolean {
  switch (expression.type) {
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.TemplateLiteral:
    case AST_NODE_TYPES.ThisExpression:
    case AST_NODE_TYPES.Super:
    case AST_NODE_TYPES.MemberExpression:
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.ObjectExpression:
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression:
    case AST_NODE_TYPES.ClassExpression:
    case AST_NODE_TYPES.TaggedTemplateExpression:
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.UpdateExpression:
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
      return true;
    default:
      return false;
  }
}

function shouldParenthesizeReplacement(
  node: TSESTree.CallExpression,
  replacementExpression: TSESTree.Expression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  const alreadyParenthesized = ASTUtils.isParenthesized(
    replacementExpression,
    sourceCode,
  );
  const parent = node.parent;
  if (!parent) {
    return false;
  }

  if (
    (replacementExpression as TSESTree.SequenceExpression).type ===
    AST_NODE_TYPES.SequenceExpression
  ) {
    return true;
  }

  switch (parent.type) {
    case AST_NODE_TYPES.LogicalExpression:
    case AST_NODE_TYPES.BinaryExpression:
      return (
        alreadyParenthesized || !isSafeAtomicExpression(replacementExpression)
      );
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.MemberExpression:
    case AST_NODE_TYPES.TaggedTemplateExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.ChainExpression:
      return true;
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return (
        alreadyParenthesized || !isSafeAtomicExpression(replacementExpression)
      );
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
      return (
        alreadyParenthesized ||
        parent.callee === node ||
        replacementExpression.type === AST_NODE_TYPES.SequenceExpression
      );
    case AST_NODE_TYPES.ConditionalExpression:
      if (parent.test !== node) {
        return false;
      }
      return (
        alreadyParenthesized || !isSafeAtomicExpression(replacementExpression)
      );
    case AST_NODE_TYPES.AssignmentExpression:
      return false;
    default:
      return false;
  }
}

function getRemovableImportSpecifier(
  callExpression: TSESTree.CallExpression,
  imports: UseMemoImports,
  sourceCode: Readonly<TSESLint.SourceCode>,
): TSESTree.ImportSpecifier | null {
  if (callExpression.callee.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const specifier = imports.useMemoSpecifiers.get(callExpression.callee.name);
  if (!specifier) {
    return null;
  }

  const declaredVariables = hasDeclaredVariables(sourceCode)
    ? sourceCode.getDeclaredVariables(specifier)
    : (sourceCode as any).getDeclaredVariables?.(specifier) ?? [];
  const [variable] = declaredVariables;
  if (!variable) {
    // Defer removal when scope analysis cannot resolve the import.
    return null;
  }

  const otherReferences = variable.references.filter(
    (reference) => reference.identifier !== callExpression.callee,
  );
  if (otherReferences.length > 0) {
    return null;
  }

  return specifier;
}

export const noUsememoForPassByValue = createRule<Options, MessageIds>({
  name: 'no-usememo-for-pass-by-value',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow returning useMemo results from custom hooks when the memoized value is pass-by-value: primitives with value equality (string, number, boolean, null, undefined, bigint) or arrays/tuples composed exclusively of these primitives. Requires type information.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowExpensiveCalleePatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_EXPENSIVE_PATTERNS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      primitiveMemo:
        'What’s wrong: custom hook "{{hookName}}" returns useMemo wrapping a pass-by-value value ({{valueType}}) → Why it matters: memoizing pass-by-value results cannot change identity and implies stability that is not real, which misleads callers and adds noise → How to fix: inline the returned expression and remove the useMemo import if it becomes unused.',
      invalidRegex:
        'What’s wrong: invalid regex pattern "{{pattern}}" in allowExpensiveCalleePatterns → Why it matters: invalid patterns prevent the rule from correctly identifying expensive computations, potentially causing false positives → How to fix: correct the regex pattern in your ESLint configuration.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const sourceCode = context.getSourceCode();
    const parserServices = sourceCode.parserServices ?? context.parserServices;
    if (!parserServices?.program || !parserServices.esTreeNodeToTSNodeMap) {
      return {};
    }

    const { program, esTreeNodeToTSNodeMap } = parserServices;
    const checker = program.getTypeChecker();
    const imports = collectUseMemoImports(sourceCode.ast);
    const expensiveMatchers: RegExp[] = [];
    const invalidPatterns: string[] = [];

    (
      context.options[0]?.allowExpensiveCalleePatterns ??
      DEFAULT_EXPENSIVE_PATTERNS
    ).forEach((pattern) => {
      try {
        expensiveMatchers.push(new RegExp(pattern));
      } catch {
        invalidPatterns.push(pattern);
      }
    });

    const functionStack: FunctionContext[] = [];
    const reported = new WeakSet<TSESTree.CallExpression>();
    const resolveVariable = (identifier: TSESTree.Identifier) =>
      ASTUtils.findVariable(context.getScope(), identifier) ?? null;

    function visitPatternNode(
      pattern: TSESTree.Node,
      visitIdentifier: (identifier: TSESTree.Identifier) => void,
    ): void {
      if (pattern.type === AST_NODE_TYPES.Identifier) {
        visitIdentifier(pattern);
        return;
      }

      if (pattern.type === AST_NODE_TYPES.ArrayPattern) {
        for (const element of pattern.elements) {
          if (!element) {
            continue;
          }
          visitPatternNode(
            element.type === AST_NODE_TYPES.RestElement
              ? element.argument
              : element,
            visitIdentifier,
          );
        }
        return;
      }

      if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
        for (const property of pattern.properties) {
          if (property.type === AST_NODE_TYPES.Property) {
            visitPatternNode(property.value, visitIdentifier);
            continue;
          }
          if (property.type === AST_NODE_TYPES.RestElement) {
            visitPatternNode(property.argument, visitIdentifier);
          }
        }
        return;
      }

      if (pattern.type === AST_NODE_TYPES.AssignmentPattern) {
        visitPatternNode(pattern.left, visitIdentifier);
      }
    }

    function traversePattern(
      pattern: TSESTree.Node,
      resolveVariable: (
        id: TSESTree.Identifier,
      ) => TSESLint.Scope.Variable | null,
      visitVariable: (variable: TSESLint.Scope.Variable) => void,
    ) {
      visitPatternNode(pattern, (identifier) => {
        const variable = resolveVariable(identifier);
        if (variable) {
          visitVariable(variable);
        }
      });
    }

    function trackPatternVariables(
      pattern: TSESTree.Node,
      memoCall: TSESTree.CallExpression,
      currentContext: FunctionContext,
      resolveVariable: (
        id: TSESTree.Identifier,
      ) => TSESLint.Scope.Variable | null,
    ) {
      traversePattern(pattern, resolveVariable, (variable) => {
        currentContext.memoVariables.set(variable, memoCall);
      });
    }

    function untrackPatternVariables(
      pattern: TSESTree.Node,
      currentContext: FunctionContext,
      resolveVariable: (
        id: TSESTree.Identifier,
      ) => TSESLint.Scope.Variable | null,
    ) {
      traversePattern(pattern, resolveVariable, (variable) => {
        currentContext.memoVariables.delete(variable);
      });
    }

    function validateUseMemoArgument(node: TSESTree.CallExpression): {
      callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
      returnedExpression: TSESTree.Expression;
    } | null {
      const callback = node.arguments[0];
      if (
        !callback ||
        (callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callback.type !== AST_NODE_TYPES.FunctionExpression)
      ) {
        return null;
      }
      const returnedExpression = getReturnedExpression(callback);
      if (!returnedExpression) {
        return null;
      }
      return { callback, returnedExpression };
    }

    function classifyUseMemoReturnType(
      node: TSESTree.CallExpression,
      returnedExpression: TSESTree.Expression,
    ): {
      passByValue: boolean;
      indeterminate: boolean;
      description: string;
    } | null {
      const tsNode = esTreeNodeToTSNodeMap.get(node);
      if (!tsNode) {
        return null;
      }

      const type = checker.getTypeAtLocation(tsNode);
      let classification = isPassByValueType(type, checker);
      if (classification.indeterminate) {
        // When useMemo's type is indeterminate (any/unknown), the callback can still return a
        // concrete pass-by-value type. Inspect the returned expression to reduce false negatives.
        const returnedTsNode = esTreeNodeToTSNodeMap.get(returnedExpression);
        if (returnedTsNode) {
          const returnedType = checker.getTypeAtLocation(returnedTsNode);
          const fallbackClassification = isPassByValueType(
            returnedType,
            checker,
          );
          if (!fallbackClassification.indeterminate) {
            classification = fallbackClassification;
          }
        }
      }

      return classification;
    }

    function getUseMemoFix(
      node: TSESTree.CallExpression,
      callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
      returnedExpression: TSESTree.Expression,
      fixer: TSESLint.RuleFixer,
    ): TSESLint.RuleFix[] | null {
      const replacementText = getReplacementText(callback, sourceCode);
      if (!replacementText) {
        return null;
      }

      const needsParentheses = shouldParenthesizeReplacement(
        node,
        returnedExpression,
        sourceCode,
      );
      const strandedComments = strandedCommentsOf(
        node,
        returnedExpression,
        sourceCode,
      );

      const fixes: TSESLint.RuleFix[] = [];

      if (strandedComments.length === 0) {
        fixes.push(
          fixer.replaceText(
            node,
            needsParentheses ? `(${replacementText})` : replacementText,
          ),
        );
      } else {
        // Carrying must not change the non-comment token stream: whether the
        // replacement is parenthesized is decided by the expression's context
        // exactly as in the comment-free fix, never by the comments themselves.
        // The call can start mid-line, so the indentation of the line it opens
        // on is the only anchor the carried comments have.
        const startLine = sourceCode.lines[node.loc.start.line - 1] ?? '';
        const indent = /^[\t ]*/.exec(startLine)?.[0] ?? '';
        const text = sourceCode.getText();
        const toSegment = (comment: TSESTree.Comment): ReplacementSegment => ({
          text: text.slice(comment.range[0], comment.range[1]),
          breakAfter: requiresLineBreakAfter(comment),
        });
        // A stranded comment lies wholly on one side of the expression, since
        // a comment is a token and cannot straddle a node; keeping each on its
        // own side preserves what it annotates.
        const isBefore = (comment: TSESTree.Comment) =>
          comment.range[0] < returnedExpression.range[0];
        const leadingComments = strandedComments.filter(isBefore);
        const trailingComments = strandedComments.filter(
          (comment) => !isBefore(comment),
        );

        if (needsParentheses) {
          // Inside parentheses a newline can never trigger ASI, so every
          // comment — line comments and -next-line directives included — can
          // ride within the replacement on a line of its own.
          const segments: ReplacementSegment[] = [
            ...leadingComments.map(toSegment),
            { text: replacementText, breakAfter: false },
            ...trailingComments.map(toSegment),
          ];
          fixes.push(fixer.replaceText(node, joinSegments(segments, indent)));
        } else {
          // Without parentheses a line break between a restricted keyword
          // (`return`, `throw`, `yield`) and the expression would change the
          // program through ASI, so a leading comment that demands its own
          // line is hoisted onto a full line of its own ABOVE the line the
          // call starts on. That insertion can never split a token pair, and
          // it lands a `-next-line` directive exactly one line above the
          // statement that now hosts its subject. Everything else stays
          // inline: a block comment beside the expression, and a trailing
          // line-bound comment followed by a line break, which is safe after
          // the expression has begun.
          const hoistedComments = leadingComments.filter(
            requiresLineBreakAfter,
          );
          if (hoistedComments.length > 0) {
            const lineStartIndex = sourceCode.getIndexFromLoc({
              line: node.loc.start.line,
              column: 0,
            });
            const hoisted = hoistedComments
              .map(
                (comment) =>
                  `${indent}${text.slice(
                    comment.range[0],
                    comment.range[1],
                  )}\n`,
              )
              .join('');
            fixes.push(
              fixer.insertTextBeforeRange(
                [lineStartIndex, lineStartIndex],
                hoisted,
              ),
            );
          }

          const segments: ReplacementSegment[] = [
            ...leadingComments
              .filter((comment) => !requiresLineBreakAfter(comment))
              .map(toSegment),
            { text: replacementText, breakAfter: false },
            ...trailingComments.map(toSegment),
          ];
          const body = joinSegmentBody(segments, indent);
          const trailing = segments[segments.length - 1].breakAfter
            ? `\n${indent}`
            : '';
          fixes.push(fixer.replaceText(node, `${body}${trailing}`));
        }
      }

      const specifier = getRemovableImportSpecifier(node, imports, sourceCode);
      if (specifier) {
        fixes.push(...getImportRemovalFixes(specifier, sourceCode, fixer));
      }

      return fixes;
    }

    function checkUseMemoForPassByValue(
      node: TSESTree.CallExpression,
      currentContext: FunctionContext | undefined,
    ) {
      if (!currentContext?.isHook || reported.has(node)) {
        return;
      }

      const validated = validateUseMemoArgument(node);
      if (!validated) {
        return;
      }

      const { callback, returnedExpression } = validated;
      if (matchesExpensiveCalleePattern(callback, expensiveMatchers)) {
        return;
      }

      const classification = classifyUseMemoReturnType(
        node,
        returnedExpression,
      );
      if (
        !classification ||
        classification.indeterminate ||
        !classification.passByValue
      ) {
        return;
      }

      reported.add(node);

      context.report({
        node,
        messageId: 'primitiveMemo',
        data: {
          hookName: currentContext.hookName ?? 'this hook',
          valueType: classification.description,
        },
        fix: (fixer) =>
          getUseMemoFix(node, callback, returnedExpression, fixer),
      });
    }

    function analyzeExpressionList(
      expressions: (
        | TSESTree.Expression
        | TSESTree.SpreadElement
        | null
        | undefined
      )[],
      currentContext: FunctionContext | undefined,
    ) {
      for (const expr of expressions) {
        if (!expr) {
          continue;
        }
        if (expr.type === AST_NODE_TYPES.SpreadElement) {
          analyzeReturnedValue(expr.argument, currentContext);
          continue;
        }
        analyzeReturnedValue(expr, currentContext);
      }
    }

    function analyzeReturnedValue(
      expression: TSESTree.Expression | null | undefined,
      currentContext: FunctionContext | undefined,
    ) {
      if (!expression || !currentContext?.isHook) {
        return;
      }

      switch (expression.type) {
        case AST_NODE_TYPES.CallExpression:
          if (isUseMemoCall(expression, imports, resolveVariable)) {
            checkUseMemoForPassByValue(expression, currentContext);
            return;
          }
          analyzeExpressionList(expression.arguments, currentContext);
          return;
        case AST_NODE_TYPES.NewExpression:
          analyzeExpressionList(expression.arguments ?? [], currentContext);
          return;
        case AST_NODE_TYPES.Identifier: {
          const variable = resolveVariable(expression);
          const memoCall = variable
            ? currentContext.memoVariables.get(variable)
            : undefined;
          if (memoCall) {
            checkUseMemoForPassByValue(memoCall, currentContext);
          }
          return;
        }
        case AST_NODE_TYPES.ConditionalExpression:
          analyzeReturnedValue(expression.test, currentContext);
          analyzeReturnedValue(expression.consequent, currentContext);
          analyzeReturnedValue(expression.alternate, currentContext);
          return;
        case AST_NODE_TYPES.LogicalExpression:
          analyzeReturnedValue(expression.left, currentContext);
          analyzeReturnedValue(expression.right, currentContext);
          return;
        case AST_NODE_TYPES.BinaryExpression:
          if (expression.left.type !== AST_NODE_TYPES.PrivateIdentifier) {
            analyzeReturnedValue(expression.left, currentContext);
          }
          analyzeReturnedValue(expression.right, currentContext);
          return;
        case AST_NODE_TYPES.UnaryExpression:
          analyzeReturnedValue(expression.argument, currentContext);
          return;
        case AST_NODE_TYPES.SequenceExpression: {
          const lastExpression =
            expression.expressions[expression.expressions.length - 1];
          analyzeReturnedValue(lastExpression, currentContext);
          return;
        }
        case AST_NODE_TYPES.ArrayExpression:
          analyzeExpressionList(expression.elements, currentContext);
          return;
        case AST_NODE_TYPES.ObjectExpression: {
          const propertyExpressions = expression.properties.map((property) => {
            if (property.type === AST_NODE_TYPES.SpreadElement) {
              return property.argument;
            }
            if (property.type === AST_NODE_TYPES.Property && property.value) {
              return property.value as TSESTree.Expression;
            }
            return null;
          });
          analyzeExpressionList(propertyExpressions, currentContext);
          return;
        }
        case AST_NODE_TYPES.TSAsExpression:
        case AST_NODE_TYPES.TSTypeAssertion:
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.TSSatisfiesExpression:
        case AST_NODE_TYPES.ChainExpression:
          analyzeReturnedValue(expression.expression, currentContext);
          return;
        case AST_NODE_TYPES.AwaitExpression:
          analyzeReturnedValue(expression.argument, currentContext);
          return;
      }
    }

    return {
      Program() {
        invalidPatterns.forEach((pattern) => {
          context.report({
            node: sourceCode.ast,
            messageId: 'invalidRegex',
            data: { pattern },
          });
        });
      },
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        const name = getFunctionName(node);
        functionStack.push({
          isHook: isCustomHookName(name),
          hookName: name,
          memoVariables: new WeakMap(),
        });
      },
      'FunctionDeclaration:exit'() {
        functionStack.pop();
      },
      FunctionExpression(node: TSESTree.FunctionExpression) {
        const name = getFunctionName(node);
        functionStack.push({
          isHook: isCustomHookName(name),
          hookName: name,
          memoVariables: new WeakMap(),
        });
      },
      'FunctionExpression:exit'() {
        functionStack.pop();
      },
      ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
        const name = getFunctionName(node);
        functionStack.push({
          isHook: isCustomHookName(name),
          hookName: name,
          memoVariables: new WeakMap(),
        });
      },
      'ArrowFunctionExpression:exit'(node: TSESTree.ArrowFunctionExpression) {
        const currentContext = functionStack[functionStack.length - 1];
        if (currentContext?.isHook && node.expression) {
          analyzeReturnedValue(
            node.body as TSESTree.Expression,
            currentContext,
          );
        }
        functionStack.pop();
      },
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        const currentContext = functionStack[functionStack.length - 1];
        if (
          !currentContext?.isHook ||
          !node.init ||
          node.init.type !== AST_NODE_TYPES.CallExpression ||
          !isUseMemoCall(node.init, imports, resolveVariable)
        ) {
          return;
        }

        trackPatternVariables(
          node.id,
          node.init,
          currentContext,
          resolveVariable,
        );
      },
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        const currentContext = functionStack[functionStack.length - 1];
        if (!currentContext?.isHook) {
          return;
        }

        if (
          node.right.type === AST_NODE_TYPES.CallExpression &&
          isUseMemoCall(node.right, imports, resolveVariable)
        ) {
          trackPatternVariables(
            node.left,
            node.right,
            currentContext,
            resolveVariable,
          );
          return;
        }

        if (node.operator === '=') {
          untrackPatternVariables(node.left, currentContext, resolveVariable);
        }
      },
      ReturnStatement(node: TSESTree.ReturnStatement) {
        const currentContext = functionStack[functionStack.length - 1];
        if (!currentContext?.isHook) {
          return;
        }

        analyzeReturnedValue(node.argument, currentContext);
      },
    };
  },
});

export default noUsememoForPassByValue;
