import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { isShebangComment } from '../utils/shebang';

type MessageIds =
  | 'moveGuardUp'
  | 'groupDerived'
  | 'moveDeclarationCloser'
  | 'moveSideEffect';

type Options = [];

type BlockLike = TSESTree.BlockStatement | TSESTree.Program;

const TYPE_EXPRESSION_WRAPPERS = new Set<TSESTree.Node['type']>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSInstantiationExpression,
]);

function isHookLikeName(name: string): boolean {
  return /^use[A-Z0-9]/.test(name);
}

/**
 * The hook carve-out is a *suppression*, so failing to recognize a callee costs
 * more than a missed report: `handleSideEffects` would hoist the call, and
 * reordering hook calls is the one reordering React forbids outright. The
 * assertion wrappers are therefore peeled off both the callee and the receiver
 * it hangs from, so `(useTrack as any)()` and `(ref as Ref).useThing()` keep the
 * suppression their bare spellings get.
 */
function isHookCallee(
  callee:
    | TSESTree.LeftHandSideExpression
    | TSESTree.PrivateIdentifier
    | TSESTree.Super,
): boolean {
  const target = unwrapAssertions(callee as TSESTree.Node);
  if (target.type === AST_NODE_TYPES.Identifier) {
    return isHookLikeName(target.name);
  }
  if (
    target.type === AST_NODE_TYPES.MemberExpression &&
    !target.computed &&
    target.property.type === AST_NODE_TYPES.Identifier
  ) {
    return isHookLikeName(target.property.name);
  }
  return false;
}

type RuleExecutionContext = {
  context: TSESLint.RuleContext<MessageIds, Options>;
  sourceCode: TSESLint.SourceCode;
};

type Violation = {
  statement: TSESTree.Statement;
  messageId: MessageIds;
  data: Record<string, string>;
  fromIndex: number;
  toIndex: number;
  /**
   * Whether the reordering search may act on this violation by relocating its
   * statement. A violation the search must leave alone is still reported: what a
   * statement's shape forbids is the *fix*, and withholding the diagnosis as well
   * ships the violation unseen (#1889).
   */
  relocatable: boolean;
};

/**
 * Detection accumulator. Violations are collected rather than reported so the same
 * logic can score a hypothetical reordering, which is what lets the rule prove a
 * candidate ordering reports nothing before emitting it as a fix (#1405).
 */
type DetectionSink = {
  sourceCode: TSESLint.SourceCode;
  flagged: Set<TSESTree.Statement>;
  violations: Violation[];
};

function isTypeNode(node: TSESTree.Node | undefined): boolean {
  if (!node) {
    return false;
  }
  if (TYPE_EXPRESSION_WRAPPERS.has(node.type)) {
    return false;
  }
  return node.type.startsWith('TS');
}

/**
 * Peels every type-only wrapper off an expression: `x as T`, `<T>x`,
 * `x satisfies T`, `x!` and `f<T>` all assert or instantiate a type without
 * contributing a value, so a classifier asking about the *shape* of an
 * expression must read straight through them.
 *
 * This matters beyond hand-written code. Sibling rules' autofixes put these
 * wrappers on the very expressions this rule inspects — `global-const-style`
 * appends ` as const` to module constants, `enforce-object-literal-as-const`
 * to object literals — so a bare `init.type === Literal` test goes silent on a
 * declaration `eslint --fix` had just reported (#1807). In the callee-resolving
 * direction the same blindness is worse than silence: an unresolved callee
 * contributes none of its captures, and the reordering fix then hoists the call
 * above a binding it reads.
 */
function unwrapAssertions(node: TSESTree.Node): TSESTree.Node {
  let target = node;
  while (
    TYPE_EXPRESSION_WRAPPERS.has(target.type) &&
    'expression' in (target as { expression?: unknown })
  ) {
    target = (target as unknown as { expression: TSESTree.Node }).expression;
  }
  return target;
}

function unwrapTypeExpression(
  expression: TSESTree.Expression | TSESTree.PrivateIdentifier,
): TSESTree.Expression | TSESTree.PrivateIdentifier {
  switch (expression.type) {
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSInstantiationExpression:
      return expression.expression as TSESTree.Expression;
    default:
      return expression;
  }
}

function isDeclarationIdentifier(
  node: TSESTree.Identifier,
  parent: TSESTree.Node | undefined,
): boolean {
  if (!parent) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id === node) {
    return true;
  }
  if (
    (parent.type === AST_NODE_TYPES.FunctionDeclaration ||
      parent.type === AST_NODE_TYPES.FunctionExpression) &&
    parent.id === node
  ) {
    return true;
  }
  if (
    (parent.type === AST_NODE_TYPES.FunctionDeclaration ||
      parent.type === AST_NODE_TYPES.FunctionExpression ||
      parent.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
    parent.params.includes(node)
  ) {
    return true;
  }
  if (
    (parent.type === AST_NODE_TYPES.ClassDeclaration ||
      parent.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
      parent.type === AST_NODE_TYPES.TSTypeAliasDeclaration) &&
    parent.id === node
  ) {
    return true;
  }
  return false;
}

function collectPatternDependencies(
  pattern:
    | TSESTree.BindingName
    | TSESTree.RestElement
    | TSESTree.AssignmentPattern,
  names: Set<string>,
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      return;
    case AST_NODE_TYPES.RestElement:
      collectPatternDependencies(
        pattern.argument as TSESTree.BindingName,
        names,
      );
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      collectUsedIdentifiers(pattern.right as TSESTree.Expression, names, {
        skipFunctions: true,
        includeFunctionCaptures: true,
      });
      collectPatternDependencies(pattern.left as TSESTree.BindingName, names);
      return;
    case AST_NODE_TYPES.ArrayPattern:
      pattern.elements.forEach((element) => {
        if (element) {
          collectPatternDependencies(element as TSESTree.BindingName, names);
        }
      });
      return;
    case AST_NODE_TYPES.ObjectPattern:
      pattern.properties.forEach((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          if (prop.computed && ASTHelpers.isNode(prop.key)) {
            collectUsedIdentifiers(prop.key, names, {
              skipFunctions: true,
              includeFunctionCaptures: true,
            });
          }
          collectPatternDependencies(
            prop.value as TSESTree.BindingName | TSESTree.AssignmentPattern,
            names,
          );
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          collectPatternDependencies(
            prop.argument as TSESTree.BindingName,
            names,
          );
        }
      });
      return;
    default:
      return;
  }
}

function processIdentifier(
  identifier: TSESTree.Identifier,
  names: Set<string>,
): void {
  const parent = identifier.parent as TSESTree.Node | undefined;
  if (shouldSkipIdentifier(identifier, parent)) {
    return;
  }
  names.add(identifier.name);
}

/**
 * A JSX element name beginning with a lowercase letter is a string tag, not a
 * binding: `<div />` emits the literal `"div"` whatever `div` a scope holds.
 * Every other spelling — `<Provider />`, `<Ns.Item />` — reads a binding, which
 * is why they must count as dependencies of the statement carrying them.
 */
function isIntrinsicElementName(name: string): boolean {
  return /^[a-z]/.test(name);
}

/**
 * Whether a `JSXIdentifier` reads a binding. Only element names and the root of
 * a JSX member expression do; attribute names (`docPath` in `<P docPath={x} />`),
 * the property half of `<Ns.Item />` and namespace parts name nothing in scope.
 *
 * JSX identifiers live in their own node type, so a walk keyed on `Identifier`
 * alone sees a component reference as no reference at all — and a dependency that
 * registers as absent lets the reordering carry a declaration past the very call
 * that consumes it (#2042).
 */
function isJsxValueReference(identifier: TSESTree.JSXIdentifier): boolean {
  const parent = identifier.parent as TSESTree.Node | undefined;
  if (!parent) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.JSXMemberExpression) {
    return parent.object === identifier;
  }
  if (
    parent.type === AST_NODE_TYPES.JSXOpeningElement ||
    parent.type === AST_NODE_TYPES.JSXClosingElement
  ) {
    return (
      parent.name === identifier && !isIntrinsicElementName(identifier.name)
    );
  }
  return false;
}

function processJsxIdentifier(
  identifier: TSESTree.JSXIdentifier,
  names: Set<string>,
): void {
  if (!isJsxValueReference(identifier)) {
    return;
  }
  names.add(identifier.name);
}

function shouldSkipIdentifier(
  identifier: TSESTree.Identifier,
  parent: TSESTree.Node | undefined,
): boolean {
  if (isTypeNode(parent) || isDeclarationIdentifier(identifier, parent)) {
    return true;
  }

  if (
    parent &&
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.property === identifier &&
    !parent.computed
  ) {
    return true;
  }

  if (
    parent &&
    parent.type === AST_NODE_TYPES.Property &&
    parent.key === identifier &&
    !parent.computed &&
    !parent.shorthand
  ) {
    return true;
  }

  return false;
}

function shouldSkipFunction(
  node: TSESTree.Node,
  skipFunctions: boolean,
): boolean {
  return (
    skipFunctions &&
    (node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.ArrowFunctionExpression)
  );
}

function addChildNodesToStack(
  node: TSESTree.Node,
  stack: Array<TSESTree.Node>,
): void {
  for (const key of Object.keys(node)) {
    if (key === 'parent') {
      continue;
    }

    const value = (node as unknown as Record<string, unknown>)[key];

    if (Array.isArray(value)) {
      for (const element of value) {
        if (ASTHelpers.isNode(element)) {
          stack.push(element);
        }
      }
    } else if (ASTHelpers.isNode(value)) {
      stack.push(value);
    }
  }
}

type TraverseResult = {
  skipChildren?: boolean;
  push?: TSESTree.Node[];
};

function traverseAst(
  node: TSESTree.Node,
  {
    skipFunctions,
    visit,
    onSkipFunction,
  }: {
    skipFunctions: boolean;
    visit: (node: TSESTree.Node) => TraverseResult | void;
    onSkipFunction?: (node: TSESTree.Node) => void;
  },
): void {
  const stack: Array<TSESTree.Node> = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (shouldSkipFunction(current, skipFunctions)) {
      if (onSkipFunction) {
        onSkipFunction(current);
      }
      continue;
    }

    const result = visit(current) ?? {};

    if (result.push) {
      result.push.forEach((child) => {
        if (ASTHelpers.isNode(child)) {
          stack.push(child);
        }
      });
    }

    if (result.skipChildren) {
      continue;
    }

    addChildNodesToStack(current, stack);
  }
}

function unwrapIifeCallee(
  callee:
    | TSESTree.LeftHandSideExpression
    | TSESTree.PrivateIdentifier
    | TSESTree.Super,
): TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | null {
  const node = callee as TSESTree.Node;
  if (
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return node as
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression;
  }

  if (TYPE_EXPRESSION_WRAPPERS.has(node.type) && 'expression' in node) {
    return unwrapIifeCallee(
      (node as TSESTree.TSAsExpression)
        .expression as TSESTree.LeftHandSideExpression,
    );
  }

  if (node.type === AST_NODE_TYPES.ChainExpression && 'expression' in node) {
    return unwrapIifeCallee(
      (node as TSESTree.ChainExpression)
        .expression as TSESTree.LeftHandSideExpression,
    );
  }

  return null;
}

function collectIifeDependencies(
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  names: Set<string>,
): void {
  collectFunctionCaptures(fn, names, {
    skipFunctions: true,
    includeFunctionCaptures: true,
  });
}

type CollectIdentifierOptions = {
  skipFunctions: boolean;
  includeFunctionCaptures?: boolean;
};

function collectFunctionScopedDeclarations(
  node: TSESTree.Node,
  declared: Set<string>,
): void {
  traverseAst(node, {
    skipFunctions: false,
    visit(current) {
      if (
        current !== node &&
        (current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression)
      ) {
        return { skipChildren: true };
      }

      if (current.type === AST_NODE_TYPES.FunctionDeclaration && current.id) {
        declared.add(current.id.name);
        return { skipChildren: true };
      }

      if (current.type === AST_NODE_TYPES.VariableDeclaration) {
        current.declarations.forEach((declarator) =>
          collectDeclaredNamesFromPattern(
            declarator.id as
              | TSESTree.BindingName
              | TSESTree.RestElement
              | TSESTree.AssignmentPattern,
            declared,
          ),
        );
      }

      if (current.type === AST_NODE_TYPES.ClassDeclaration && current.id) {
        declared.add(current.id.name);
        return { skipChildren: true };
      }

      if (current.type === AST_NODE_TYPES.CatchClause && current.param) {
        collectDeclaredNamesFromPattern(
          current.param as
            | TSESTree.BindingName
            | TSESTree.RestElement
            | TSESTree.AssignmentPattern,
          declared,
        );
      }

      return undefined;
    },
  });
}

function collectFunctionCaptures(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
  names: Set<string>,
  options: CollectIdentifierOptions,
): void {
  const declared = new Set<string>();
  if (fn.type !== AST_NODE_TYPES.ArrowFunctionExpression && fn.id) {
    declared.add(fn.id.name);
  }
  fn.params.forEach((param) =>
    collectDeclaredNamesFromPattern(
      param as
        | TSESTree.BindingName
        | TSESTree.RestElement
        | TSESTree.AssignmentPattern,
      declared,
    ),
  );

  if (fn.body.type === AST_NODE_TYPES.BlockStatement) {
    collectFunctionScopedDeclarations(fn.body, declared);
  }

  const used = new Set<string>();
  fn.params.forEach((param) => {
    collectUsedIdentifiers(param, used, {
      skipFunctions: options.skipFunctions,
      includeFunctionCaptures: options.includeFunctionCaptures,
    });
  });
  collectUsedIdentifiers(fn.body, used, {
    skipFunctions: options.skipFunctions,
    includeFunctionCaptures: options.includeFunctionCaptures,
  });

  used.forEach((name) => {
    if (!declared.has(name)) {
      names.add(name);
    }
  });
}

function collectUsedIdentifiers(
  node: TSESTree.Node,
  names: Set<string>,
  { skipFunctions, includeFunctionCaptures = false }: CollectIdentifierOptions,
): void {
  traverseAst(node, {
    skipFunctions,
    onSkipFunction: includeFunctionCaptures
      ? createFunctionCaptureHandler(names, {
          skipFunctions,
          includeFunctionCaptures,
        })
      : undefined,
    visit(current) {
      if (current.type === AST_NODE_TYPES.Identifier) {
        processIdentifier(current, names);
        return { skipChildren: true };
      }
      if (current.type === AST_NODE_TYPES.JSXIdentifier) {
        processJsxIdentifier(current, names);
        return { skipChildren: true };
      }
      if (skipFunctions && current.type === AST_NODE_TYPES.CallExpression) {
        processCallExpression(current, names);
      }
      return undefined;
    },
  });
}

function createFunctionCaptureHandler(
  names: Set<string>,
  options: CollectIdentifierOptions,
): (fnNode: TSESTree.Node) => void {
  return (fnNode) => {
    if (
      fnNode.type === AST_NODE_TYPES.FunctionDeclaration ||
      fnNode.type === AST_NODE_TYPES.FunctionExpression ||
      fnNode.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      collectFunctionCaptures(fnNode, names, {
        skipFunctions: true,
        includeFunctionCaptures: options.includeFunctionCaptures,
      });
    }
  };
}

function processCallExpression(
  node: TSESTree.CallExpression,
  names: Set<string>,
): void {
  const iife = unwrapIifeCallee(node.callee);
  if (iife) {
    collectIifeDependencies(iife, names);
  }
}

function collectDeclaredNamesFromPattern(
  pattern:
    | TSESTree.BindingName
    | TSESTree.RestElement
    | TSESTree.AssignmentPattern,
  names: Set<string>,
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      names.add(pattern.name);
      return;
    case AST_NODE_TYPES.RestElement:
      collectDeclaredNamesFromPattern(
        pattern.argument as TSESTree.BindingName,
        names,
      );
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      collectDeclaredNamesFromPattern(
        pattern.left as TSESTree.BindingName,
        names,
      );
      return;
    case AST_NODE_TYPES.ArrayPattern:
      pattern.elements.forEach((element) => {
        if (element) {
          collectDeclaredNamesFromPattern(
            element as TSESTree.BindingName,
            names,
          );
        }
      });
      return;
    case AST_NODE_TYPES.ObjectPattern:
      pattern.properties.forEach((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          if (prop.value.type === AST_NODE_TYPES.Identifier) {
            names.add(prop.value.name);
          } else {
            collectDeclaredNamesFromPattern(
              prop.value as TSESTree.BindingName | TSESTree.AssignmentPattern,
              names,
            );
          }
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          collectDeclaredNamesFromPattern(
            prop.argument as TSESTree.BindingName,
            names,
          );
        }
      });
      return;
    default:
      return;
  }
}

/**
 * `export` is a modifier on a declaration, not a distinct kind of statement:
 * `export const x = 1` declares, initializes and orders exactly as `const x = 1`
 * does. Every classifier therefore reads through the wrapper, so an exported
 * declaration participates in the analysis instead of being scored an opaque
 * impure barrier that no statement may cross (#1762).
 *
 * `export default …` and `export { a, b }` carry no `.declaration` and keep their
 * opaque treatment: the first wraps an expression whose evaluation order is the
 * module's own contract, and the second only re-binds names declared above it.
 */
function unwrapExport(statement: TSESTree.Statement): TSESTree.Statement {
  if (
    statement.type === AST_NODE_TYPES.ExportNamedDeclaration &&
    statement.declaration
  ) {
    // `NamedExportDeclarations` widens `ClassDeclaration.id` to nullable, which
    // `Statement` does not admit. Every classifier below null-checks `id` before
    // reading it, so the cast costs nothing the code was not already handling.
    return statement.declaration as TSESTree.Statement;
  }
  return statement;
}

function getDeclaredNames(statement: TSESTree.Statement): Set<string> {
  const names = new Set<string>();
  const declaration = unwrapExport(statement);

  if (declaration.type === AST_NODE_TYPES.VariableDeclaration) {
    declaration.declarations.forEach((declarator) => {
      collectDeclaredNamesFromPattern(
        declarator.id as
          | TSESTree.BindingName
          | TSESTree.ArrayPattern
          | TSESTree.ObjectPattern,
        names,
      );
    });
  }

  if (
    declaration.type === AST_NODE_TYPES.FunctionDeclaration &&
    declaration.id
  ) {
    names.add(declaration.id.name);
  }

  if (
    declaration.type === AST_NODE_TYPES.ClassDeclaration &&
    declaration.id &&
    declaration.id.type === AST_NODE_TYPES.Identifier
  ) {
    names.add(declaration.id.name);
  }

  return names;
}

function statementReferencesAny(
  statement: TSESTree.Statement,
  names: Set<string>,
): boolean {
  if (names.size === 0) {
    return false;
  }
  const found = new Set<string>();
  collectUsedIdentifiers(statement, found, { skipFunctions: false });
  for (const name of names) {
    if (found.has(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Find the index of the first statement that references any of the given names,
 * searching forward from afterIndex.
 */
function findFirstUsageIndex(
  body: TSESTree.Statement[],
  names: Set<string>,
  afterIndex: number,
): number {
  for (let cursor = afterIndex; cursor < body.length; cursor += 1) {
    if (statementReferencesAny(body[cursor], names)) {
      return cursor;
    }
  }
  return -1;
}

function collectAssignedNamesFromPattern(
  target: TSESTree.Node,
  names: Set<string>,
): void {
  if (
    TYPE_EXPRESSION_WRAPPERS.has(target.type) &&
    'expression' in (target as { expression?: unknown })
  ) {
    collectAssignedNamesFromPattern(
      (target as { expression: TSESTree.Node }).expression as TSESTree.Node,
      names,
    );
    return;
  }

  switch (target.type) {
    case AST_NODE_TYPES.Identifier:
      names.add((target as TSESTree.Identifier).name);
      return;
    case AST_NODE_TYPES.MemberExpression: {
      let cursor = (target as TSESTree.MemberExpression)
        .object as TSESTree.Expression;
      while (true) {
        if (
          TYPE_EXPRESSION_WRAPPERS.has(cursor.type) &&
          'expression' in (cursor as { expression?: unknown })
        ) {
          cursor = (cursor as { expression: TSESTree.Expression })
            .expression as TSESTree.Expression;
          continue;
        }
        if (cursor.type === AST_NODE_TYPES.MemberExpression) {
          cursor = (cursor as TSESTree.MemberExpression)
            .object as TSESTree.Expression;
          continue;
        }
        break;
      }
      if (cursor.type === AST_NODE_TYPES.Identifier) {
        names.add((cursor as TSESTree.Identifier).name);
      }
      return;
    }
    case AST_NODE_TYPES.AssignmentPattern:
      collectAssignedNamesFromPattern(
        (target as TSESTree.AssignmentPattern).left as TSESTree.Node,
        names,
      );
      return;
    case AST_NODE_TYPES.RestElement:
      collectAssignedNamesFromPattern(
        (target as TSESTree.RestElement).argument as TSESTree.Node,
        names,
      );
      return;
    case AST_NODE_TYPES.ArrayPattern:
      (target as TSESTree.ArrayPattern).elements.forEach((element) => {
        if (element) {
          collectAssignedNamesFromPattern(element as TSESTree.Node, names);
        }
      });
      return;
    case AST_NODE_TYPES.ObjectPattern:
      (target as TSESTree.ObjectPattern).properties.forEach((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          collectAssignedNamesFromPattern(prop.value as TSESTree.Node, names);
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          collectAssignedNamesFromPattern(
            prop.argument as TSESTree.Node,
            names,
          );
        }
      });
      return;
    default:
      return;
  }
}

function collectMutatedIdentifiers(
  node: TSESTree.Node,
  names: Set<string>,
  { skipFunctions }: { skipFunctions: boolean },
): void {
  traverseAst(node, {
    skipFunctions,
    visit(current) {
      if (current.type === AST_NODE_TYPES.AssignmentExpression) {
        const push = ASTHelpers.isNode(current.right)
          ? ([current.right] as TSESTree.Node[])
          : undefined;
        collectAssignedNamesFromPattern(current.left as TSESTree.Node, names);
        return { skipChildren: true, push };
      }

      if (current.type === AST_NODE_TYPES.UpdateExpression) {
        collectAssignedNamesFromPattern(
          current.argument as TSESTree.Node,
          names,
        );
        return { skipChildren: true };
      }

      return undefined;
    },
  });
}

function statementMutatesAny(
  statement: TSESTree.Statement,
  names: Set<string>,
): boolean {
  if (names.size === 0) {
    return false;
  }
  const mutated = new Set<string>();
  collectMutatedIdentifiers(statement, mutated, { skipFunctions: true });
  for (const name of names) {
    if (mutated.has(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Mutations create ordering barriers: once a name is reassigned, moving statements
 * across that mutation can change observable state. Guard moves stop before the
 * first mutation to keep evaluation order stable.
 */
function isIdentifierMutated(
  body: TSESTree.Statement[],
  name: string,
  beforeIndex: number,
): boolean {
  const target = new Set([name]);
  let seenDeclaration = false;
  for (let index = 0; index < beforeIndex; index += 1) {
    const statement = unwrapExport(body[index]);
    if (statementMutatesAny(statement, target)) {
      return true;
    }
    if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        const declaredNames = new Set<string>();
        collectDeclaredNamesFromPattern(
          declarator.id as
            | TSESTree.BindingName
            | TSESTree.RestElement
            | TSESTree.AssignmentPattern,
          declaredNames,
        );
        if (!declaredNames.has(name)) {
          continue;
        }
        if (seenDeclaration && declarator.init) {
          return true;
        }
        seenDeclaration = true;
      }
    }
  }
  return false;
}

function initializerIsSafe(
  expression: TSESTree.Expression | TSESTree.PrivateIdentifier,
  { allowHooks }: { allowHooks: boolean },
): boolean {
  // Hook calls are treated as impure so we never reorder React hook execution unless a callsite explicitly opts in.
  const unwrapped = unwrapTypeExpression(expression);
  if (unwrapped !== expression) {
    return initializerIsSafe(unwrapped as TSESTree.Expression, { allowHooks });
  }

  switch (expression.type) {
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.Super:
    case AST_NODE_TYPES.ThisExpression:
      return true;
    case AST_NODE_TYPES.TemplateLiteral:
      return expression.expressions.every((exp) =>
        initializerIsSafe(exp as TSESTree.Expression, { allowHooks }),
      );
    case AST_NODE_TYPES.MemberExpression:
      if (expression.computed) {
        return (
          initializerIsSafe(expression.property as TSESTree.Expression, {
            allowHooks,
          }) &&
          initializerIsSafe(expression.object as TSESTree.Expression, {
            allowHooks,
          })
        );
      }
      return initializerIsSafe(expression.object as TSESTree.Expression, {
        allowHooks,
      });
    case AST_NODE_TYPES.ArrayExpression:
      return expression.elements.every((element) => {
        if (!element) {
          return true;
        }
        if (element.type === AST_NODE_TYPES.SpreadElement) {
          return false;
        }
        return initializerIsSafe(element as TSESTree.Expression, {
          allowHooks,
        });
      });
    case AST_NODE_TYPES.ObjectExpression:
      return expression.properties.every((prop) => {
        if (prop.type !== AST_NODE_TYPES.Property) {
          return false;
        }
        if (prop.computed) {
          if (
            !initializerIsSafe(prop.key as TSESTree.Expression, { allowHooks })
          ) {
            return false;
          }
        }
        return initializerIsSafe(prop.value as TSESTree.Expression, {
          allowHooks,
        });
      });
    case AST_NODE_TYPES.UnaryExpression:
      if (expression.operator === 'delete') {
        return false;
      }
      return initializerIsSafe(expression.argument as TSESTree.Expression, {
        allowHooks,
      });
    case AST_NODE_TYPES.BinaryExpression:
    case AST_NODE_TYPES.LogicalExpression:
      return (
        initializerIsSafe(expression.left as TSESTree.Expression, {
          allowHooks,
        }) &&
        initializerIsSafe(expression.right as TSESTree.Expression, {
          allowHooks,
        })
      );
    case AST_NODE_TYPES.ConditionalExpression:
      return (
        initializerIsSafe(expression.test as TSESTree.Expression, {
          allowHooks,
        }) &&
        initializerIsSafe(expression.consequent as TSESTree.Expression, {
          allowHooks,
        }) &&
        initializerIsSafe(expression.alternate as TSESTree.Expression, {
          allowHooks,
        })
      );
    case AST_NODE_TYPES.CallExpression: {
      if (allowHooks && isHookCallee(expression.callee)) {
        return expression.arguments.every((arg) => {
          if (!ASTHelpers.isNode(arg)) {
            return true;
          }
          if (arg.type === AST_NODE_TYPES.SpreadElement) {
            return false;
          }
          return initializerIsSafe(arg as TSESTree.Expression, { allowHooks });
        });
      }
      return false;
    }
    case AST_NODE_TYPES.ChainExpression:
      return initializerIsSafe(expression.expression as TSESTree.Expression, {
        allowHooks,
      });
    default:
      return false;
  }
}

function patternIsSafe(
  pattern:
    | TSESTree.BindingName
    | TSESTree.RestElement
    | TSESTree.AssignmentPattern,
  { allowHooks }: { allowHooks: boolean },
): boolean {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      return true;
    case AST_NODE_TYPES.RestElement:
      return patternIsSafe(pattern.argument as TSESTree.BindingName, {
        allowHooks,
      });
    case AST_NODE_TYPES.AssignmentPattern:
      return (
        initializerIsSafe(pattern.right as TSESTree.Expression, {
          allowHooks,
        }) &&
        patternIsSafe(pattern.left as TSESTree.BindingName, { allowHooks })
      );
    case AST_NODE_TYPES.ArrayPattern:
      return pattern.elements.every(
        (element) =>
          !element ||
          patternIsSafe(element as TSESTree.BindingName, { allowHooks }),
      );
    case AST_NODE_TYPES.ObjectPattern:
      return pattern.properties.every((prop) => {
        if (prop.type === AST_NODE_TYPES.RestElement) {
          return patternIsSafe(prop.argument as TSESTree.BindingName, {
            allowHooks,
          });
        }
        if (prop.type !== AST_NODE_TYPES.Property) {
          return false;
        }
        if (prop.computed && ASTHelpers.isNode(prop.key)) {
          if (
            !initializerIsSafe(prop.key as TSESTree.Expression, { allowHooks })
          ) {
            return false;
          }
        }
        return patternIsSafe(
          prop.value as TSESTree.BindingName | TSESTree.AssignmentPattern,
          { allowHooks },
        );
      });
    default:
      return false;
  }
}

function isPureDeclaration(
  statement: TSESTree.Statement,
  { allowHooks }: { allowHooks: boolean },
): boolean {
  const declaration = unwrapExport(statement);
  if (declaration.type !== AST_NODE_TYPES.VariableDeclaration) {
    return false;
  }

  return declaration.declarations.every((declarator) => {
    if (
      declarator.id &&
      ASTHelpers.isNode(declarator.id) &&
      !patternIsSafe(
        declarator.id as
          | TSESTree.BindingName
          | TSESTree.RestElement
          | TSESTree.AssignmentPattern,
        { allowHooks },
      )
    ) {
      return false;
    }
    if (!declarator.init) {
      return true;
    }
    return initializerIsSafe(declarator.init as TSESTree.Expression, {
      allowHooks,
    });
  });
}

function statementDeclaresAny(
  statement: TSESTree.Statement,
  names: Set<string>,
): boolean {
  const declared = getDeclaredNames(statement);
  for (const name of names) {
    if (declared.has(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the subtree contains a property read. `parent` is skipped because it
 * points back up the tree and would make this walk unbounded.
 */
function containsMemberRead(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return true;
  }
  return Object.entries(node).some(([key, value]) => {
    if (key === 'parent') {
      return false;
    }
    if (Array.isArray(value)) {
      return value.some(
        (item) => ASTHelpers.isNode(item) && containsMemberRead(item),
      );
    }
    return ASTHelpers.isNode(value) && containsMemberRead(value);
  });
}

/**
 * Whether a declaration captures a value read off some object's property.
 *
 * Such a read is side-effect-*free*, which is what `isPureDeclaration` answers,
 * but it is not order-*independent*: the value is whatever that property held at
 * this point in the block. Those are different questions, and only the second
 * licenses moving an effect across the declaration. Conflating them let a
 * hoisted call land above a deliberate before-snapshot, turning a before/after
 * comparison into a self-referential one that still type-checks and still lints
 * clean.
 */
function capturesObservableState(statement: TSESTree.Statement): boolean {
  const declaration = unwrapExport(statement);
  if (declaration.type !== AST_NODE_TYPES.VariableDeclaration) {
    return false;
  }
  return declaration.declarations.some(
    (declarator) =>
      Boolean(declarator.init) &&
      containsMemberRead(declarator.init as TSESTree.Node),
  );
}

function findEarliestSafeIndex(
  body: TSESTree.Statement[],
  startIndex: number,
  dependencies: Set<string>,
  {
    allowHooks,
    stopAtObservableState = false,
  }: { allowHooks: boolean; stopAtObservableState?: boolean },
): number {
  // Reuse the backward scan so guard/side-effect movers stop before impure work or any declaration/reference of tracked dependencies.
  let targetIndex = startIndex;
  for (let cursor = startIndex - 1; cursor >= 0; cursor -= 1) {
    const candidate = body[cursor];
    if (!isPureDeclaration(candidate, { allowHooks })) {
      break;
    }
    if (statementDeclaresAny(candidate, dependencies)) {
      break;
    }
    if (statementReferencesAny(candidate, dependencies)) {
      break;
    }
    if (stopAtObservableState && capturesObservableState(candidate)) {
      break;
    }
    targetIndex = cursor;
  }
  return targetIndex;
}

/**
 * A comment sharing a line with the code before it annotates that code, so it belongs
 * to the preceding statement even though it lexically precedes this one. Counting it as
 * this statement's leading comment cuts the segment boundary mid-line, which strands
 * the comment against the wrong statement as soon as either one moves.
 *
 * Comments from the first own-line one onward are this statement's: a run of own-line
 * comments directly above it reads as its preamble.
 */
function getLeadingComments(
  statement: TSESTree.Statement,
  sourceCode: TSESLint.SourceCode,
): TSESTree.Comment[] {
  // A shebang belongs to the file, not to the statement below it. Left in the
  // preamble, relocating the first statement carries `#!` off character 0 and
  // the output stops parsing.
  const comments = sourceCode
    .getCommentsBefore(statement)
    .filter((comment) => !isShebangComment(sourceCode, comment));
  const ownLine = comments.findIndex((comment) => {
    const previous = sourceCode.getTokenBefore(comment, {
      includeComments: true,
    });
    return !previous || previous.loc.end.line < comment.loc.start.line;
  });
  return ownLine === -1 ? [] : comments.slice(ownLine);
}

function getStartWithComments(
  statement: TSESTree.Statement,
  sourceCode: TSESLint.SourceCode,
): number {
  const comments = getLeadingComments(statement, sourceCode);
  const start =
    comments.length === 0 ? statement.range[0] : comments[0].range[0];
  const text = sourceCode.getText();
  let cursor = start - 1;
  while (cursor >= 0 && (text[cursor] === ' ' || text[cursor] === '\t')) {
    cursor -= 1;
  }
  return cursor + 1;
}

function getNextStart(
  body: TSESTree.Statement[],
  index: number,
  parent: BlockLike,
  sourceCode: TSESLint.SourceCode,
): number {
  const nextStatement = body[index + 1];
  if (nextStatement) {
    return getStartWithComments(nextStatement, sourceCode);
  }
  const closingBraceOffset =
    parent.type === AST_NODE_TYPES.BlockStatement ? 1 : 0;
  return parent.range[1] - closingBraceOffset;
}

function truncateWithEllipsis(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * At most one violation per statement: a statement can qualify under several
 * handlers with contradictory targets, so the first handler to claim it wins and
 * the handler call order in `detectViolations` is the tie-break.
 */
function record(
  sink: DetectionSink,
  statement: TSESTree.Statement,
  messageId: MessageIds,
  data: Record<string, string>,
  fromIndex: number,
  toIndex: number,
  relocatable = true,
): void {
  if (sink.flagged.has(statement)) {
    return;
  }
  sink.flagged.add(statement);
  sink.violations.push({
    statement,
    messageId,
    data,
    fromIndex,
    toIndex,
    relocatable,
  });
}

/**
 * The violations the reordering search is allowed to expand into moves, and the
 * only ones its zero-violation goal test answers about.
 *
 * Screening here rather than at detection is what keeps the fix path identical to
 * one that never saw an unrelocatable violation: the search's candidate moves, its
 * budget and the order it certifies clean are all computed as if the report were
 * absent, so adding a report can never redirect, weaken or block a fix.
 */
function relocatableViolations(violations: Violation[]): Violation[] {
  return violations.filter((violation) => violation.relocatable);
}

function isGuardIfStatement(
  statement: TSESTree.Statement,
): statement is TSESTree.IfStatement {
  if (statement.type !== AST_NODE_TYPES.IfStatement || statement.alternate) {
    return false;
  }
  const { consequent } = statement;
  if (
    consequent.type === AST_NODE_TYPES.ReturnStatement ||
    consequent.type === AST_NODE_TYPES.ThrowStatement ||
    consequent.type === AST_NODE_TYPES.BreakStatement ||
    consequent.type === AST_NODE_TYPES.ContinueStatement
  ) {
    return true;
  }
  if (
    consequent.type === AST_NODE_TYPES.BlockStatement &&
    consequent.body.length === 1 &&
    (consequent.body[0].type === AST_NODE_TYPES.ReturnStatement ||
      consequent.body[0].type === AST_NODE_TYPES.ThrowStatement ||
      consequent.body[0].type === AST_NODE_TYPES.BreakStatement ||
      consequent.body[0].type === AST_NODE_TYPES.ContinueStatement)
  ) {
    return true;
  }
  return false;
}

function handleGuardHoists(
  sink: DetectionSink,
  body: TSESTree.Statement[],
): void {
  const { sourceCode } = sink;
  body.forEach((statement, index) => {
    if (!isGuardIfStatement(statement)) {
      return;
    }

    const guardDependencies = new Set<string>();
    collectUsedIdentifiers(statement.test, guardDependencies, {
      skipFunctions: true,
      includeFunctionCaptures: true,
    });
    collectUsedIdentifiers(statement.consequent, guardDependencies, {
      skipFunctions: true,
      includeFunctionCaptures: true,
    });

    const targetIndex = findEarliestSafeIndex(body, index, guardDependencies, {
      allowHooks: false,
    });

    if (targetIndex === index) {
      return;
    }

    record(
      sink,
      statement,
      'moveGuardUp',
      { guard: truncateWithEllipsis(sourceCode.getText(statement.test)) },
      index,
      targetIndex,
    );
  });
}

function handleDerivedGrouping(
  sink: DetectionSink,
  body: TSESTree.Statement[],
): void {
  const declaredIndices = new Map<string, number>();
  /**
   * Each binding name → the declarator that introduced it. Sibling bindings of
   * one multi-target declarator (e.g. `const [a, b] = ...`) share one node, so
   * a statement deriving from `a` is recognizable as a sibling of one deriving
   * from `b` even though `a` separates `b` from its declaration.
   */
  const sourceDeclarators = new Map<string, TSESTree.VariableDeclarator>();

  body.forEach((statement, index) => {
    const declaration = variableDeclarationOf(statement);
    if (declaration) {
      processVariableDeclaration(
        sink,
        statement,
        declaration,
        index,
        body,
        declaredIndices,
        sourceDeclarators,
      );
    }

    trackDeclaredNames(statement, index, declaredIndices);
    trackSourceDeclarators(statement, sourceDeclarators);
  });
}

function variableDeclarationOf(
  statement: TSESTree.Statement,
): TSESTree.VariableDeclaration | null {
  const declaration = unwrapExport(statement);
  return declaration.type === AST_NODE_TYPES.VariableDeclaration
    ? declaration
    : null;
}

/**
 * `statement` is the block-level node — the `export` wrapper when there is one —
 * because it is what gets reported and what the reordering fix relocates as a
 * whole. `declaration` is the same node read through that wrapper, and is what
 * the dependency analysis inspects.
 */
function processVariableDeclaration(
  sink: DetectionSink,
  statement: TSESTree.Statement,
  declaration: TSESTree.VariableDeclaration,
  index: number,
  body: TSESTree.Statement[],
  declaredIndices: Map<string, number>,
  sourceDeclarators: Map<string, TSESTree.VariableDeclarator>,
): void {
  const dependencies = collectDependencies(declaration);
  const priorDependencies = findPriorDependencies(
    dependencies,
    declaredIndices,
  );

  if (priorDependencies.length === 0 || sink.flagged.has(statement)) {
    return;
  }

  const lastDependencyIndex = findLastDependencyIndex(
    priorDependencies,
    declaredIndices,
  );

  if (lastDependencyIndex >= index - 1) {
    return;
  }

  const declaredNames = getDeclaredNames(statement);
  const priorDependencySet = new Set(priorDependencies);

  if (
    interveningAreSiblingDerivations(
      body,
      lastDependencyIndex,
      index,
      priorDependencySet,
      sourceDeclarators,
    )
  ) {
    return;
  }

  if (
    hasBlockers(
      body,
      lastDependencyIndex,
      index,
      priorDependencySet,
      declaredNames,
    )
  ) {
    return;
  }

  reportDerivedGroupingViolation(
    sink,
    statement,
    priorDependencies,
    declaredNames,
    index,
    lastDependencyIndex,
  );
}

function collectDependencies(
  statement: TSESTree.VariableDeclaration,
): Set<string> {
  const dependencies = new Set<string>();

  statement.declarations.forEach((declarator) => {
    collectPatternDependencies(
      declarator.id as TSESTree.BindingName | TSESTree.AssignmentPattern,
      dependencies,
    );
    if (declarator.init) {
      collectUsedIdentifiers(declarator.init, dependencies, {
        skipFunctions: true,
        includeFunctionCaptures: true,
      });
    }
  });

  return dependencies;
}

function findPriorDependencies(
  dependencies: Set<string>,
  declaredIndices: Map<string, number>,
): string[] {
  return Array.from(dependencies).filter((name) => declaredIndices.has(name));
}

function findLastDependencyIndex(
  priorDependencies: string[],
  declaredIndices: Map<string, number>,
): number {
  return Math.max(
    ...priorDependencies.map((name) => declaredIndices.get(name) ?? -1),
  );
}

function hasBlockers(
  body: TSESTree.Statement[],
  lastDependencyIndex: number,
  currentIndex: number,
  priorDependencySet: Set<string>,
  declaredNames: Set<string>,
): boolean {
  return body
    .slice(lastDependencyIndex + 1, currentIndex)
    .some(
      (between) =>
        !isPureDeclaration(between, { allowHooks: false }) ||
        statementDeclaresAny(between, priorDependencySet) ||
        statementReferencesAny(between, priorDependencySet) ||
        statementDeclaresAny(between, declaredNames) ||
        statementReferencesAny(between, declaredNames),
    );
}

function reportDerivedGroupingViolation(
  sink: DetectionSink,
  statement: TSESTree.Statement,
  priorDependencies: string[],
  declaredNames: Set<string>,
  currentIndex: number,
  lastDependencyIndex: number,
): void {
  const dependency = priorDependencies[0];
  const name = declaredNames.values().next().value ?? 'value';

  record(
    sink,
    statement,
    'groupDerived',
    {
      dependency,
      name,
    },
    currentIndex,
    lastDependencyIndex + 1,
  );
}

function trackDeclaredNames(
  statement: TSESTree.Statement,
  index: number,
  declaredIndices: Map<string, number>,
): void {
  const declared = getDeclaredNames(statement);
  declared.forEach((name) => declaredIndices.set(name, index));
}

function trackSourceDeclarators(
  statement: TSESTree.Statement,
  sourceDeclarators: Map<string, TSESTree.VariableDeclarator>,
): void {
  const declaration = variableDeclarationOf(statement);
  if (!declaration) {
    return;
  }
  declaration.declarations.forEach((declarator) => {
    const names = new Set<string>();
    collectDeclaredNamesFromPattern(
      declarator.id as
        | TSESTree.BindingName
        | TSESTree.RestElement
        | TSESTree.AssignmentPattern,
      names,
    );
    names.forEach((name) => sourceDeclarators.set(name, declarator));
  });
}

/**
 * True when every statement between a dependency and the statement deriving from
 * it is itself a pure derivation from a *sibling binding of the same declarator*.
 *
 * `const [a, b] = await Promise.all([...]); const x = a; const y = b;` is already
 * grouped: `x` and `y` unpack one source declaration in order, so the `x` line is
 * not "unrelated" separation between `b` and `y`. Suppressing here keeps such
 * cohesive sibling-destructure groups intact instead of reordering them.
 */
function interveningAreSiblingDerivations(
  body: TSESTree.Statement[],
  lastDependencyIndex: number,
  currentIndex: number,
  priorDependencySet: Set<string>,
  sourceDeclarators: Map<string, TSESTree.VariableDeclarator>,
): boolean {
  const sourceNodes = new Set<TSESTree.VariableDeclarator>();
  priorDependencySet.forEach((name) => {
    const declarator = sourceDeclarators.get(name);
    if (declarator) {
      sourceNodes.add(declarator);
    }
  });

  if (sourceNodes.size === 0) {
    return false;
  }

  const intervening = body.slice(lastDependencyIndex + 1, currentIndex);
  if (intervening.length === 0) {
    return false;
  }

  return intervening.every((between) =>
    isSiblingSourceDerivation(between, sourceNodes, sourceDeclarators),
  );
}

/**
 * A statement is a sibling-source derivation when it is a pure declaration whose
 * every prior-declared dependency was introduced by one of `sourceNodes` — i.e.
 * it unpacks a sibling binding of the same multi-target declaration the dependent
 * statement derives from.
 */
function isSiblingSourceDerivation(
  statement: TSESTree.Statement,
  sourceNodes: Set<TSESTree.VariableDeclarator>,
  sourceDeclarators: Map<string, TSESTree.VariableDeclarator>,
): boolean {
  const declaration = variableDeclarationOf(statement);
  if (!declaration || !isPureDeclaration(statement, { allowHooks: false })) {
    return false;
  }

  const dependencies = collectDependencies(declaration);
  const siblingSourced = Array.from(dependencies).filter((name) => {
    const declarator = sourceDeclarators.get(name);
    return Boolean(declarator && sourceNodes.has(declarator));
  });

  if (siblingSourced.length === 0) {
    return false;
  }

  /**
   * Reject when the statement also pulls in any prior-declared name from outside
   * the sibling source: that would be genuine extra coupling, not a clean sibling
   * unpack.
   */
  return Array.from(dependencies).every((name) => {
    if (siblingSourced.includes(name)) {
      return true;
    }
    return !sourceDeclarators.has(name);
  });
}

/**
 * A declarator's initializer with every type-only wrapper removed, or null when
 * there is none.
 *
 * The candidate test and the dependency read below must agree on which node the
 * initializer *is*: accepting `x as const` as a movable candidate while reading
 * its dependency off the wrapper would make the move miss the very name it
 * depends on. One accessor keeps both in step.
 */
function unwrappedInitOf(
  declarator: TSESTree.VariableDeclarator,
): TSESTree.Node | null {
  return declarator.init ? unwrapAssertions(declarator.init) : null;
}

type SimpleDeclarator = TSESTree.VariableDeclarator & {
  id: TSESTree.Identifier;
};

/**
 * Restrict late-declaration candidates to simple variables with at most an Identifier or
 * Literal initializer. This ensures they are pure values that do not have side effects or
 * change execution order when moved closer to their usage. More complex initializers are
 * excluded to maintain temporal safety.
 *
 * The classification runs on the unwrapped initializer: an assertion is erased
 * before the code runs, so `1 as const` is exactly the movable literal `1` is.
 *
 * Every declarator must qualify, because the statement is diagnosed — and moved —
 * as a whole. A sibling binding does not disqualify the statement: how many
 * bindings a declaration introduces decides whether the fix may relocate it, not
 * whether the declaration is far from the first use of what it declares (#1889).
 */
function lateDeclarationDeclaratorsOf(
  statement: TSESTree.Statement,
): SimpleDeclarator[] | null {
  const declaration = variableDeclarationOf(statement);
  if (!declaration || declaration.declarations.length === 0) {
    return null;
  }
  const declarators: SimpleDeclarator[] = [];
  for (const declarator of declaration.declarations) {
    if (declarator.id.type !== AST_NODE_TYPES.Identifier) {
      return null;
    }
    const init = unwrappedInitOf(declarator);
    if (
      init &&
      init.type !== AST_NODE_TYPES.Identifier &&
      init.type !== AST_NODE_TYPES.Literal
    ) {
      return null;
    }
    declarators.push(declarator as SimpleDeclarator);
  }
  return declarators;
}

/**
 * Whether the reordering fix may relocate this statement to satisfy a
 * late-declaration report.
 *
 * The fix moves whole statements, so relocating `const x = 1, y = 2;` carries `y`
 * along — past its own first use in the general case, and always further than the
 * report asked for. Splitting the declaration is the developer's call, so a
 * declaration with sibling bindings is reported and left where it stands.
 */
function isRelocatableLateDeclaration(statement: TSESTree.Statement): boolean {
  return lateDeclarationDeclaratorsOf(statement)?.length === 1;
}

/**
 * The binding the report names: the one whose own first use is the group's.
 *
 * A statement's bindings share its position, so the declaration is late relative to
 * whichever of them is read first; naming a sibling read later would point the
 * reader at the wrong line.
 */
function earliestUsedDeclarator(
  declarators: SimpleDeclarator[],
  body: TSESTree.Statement[],
  afterIndex: number,
  usageIndex: number,
): SimpleDeclarator {
  if (declarators.length === 1) {
    return declarators[0];
  }
  const earliest = declarators.find(
    (declarator) =>
      findFirstUsageIndex(body, new Set([declarator.id.name]), afterIndex) ===
      usageIndex,
  );
  return earliest ?? declarators[0];
}

const LOOP_TYPES = new Set<TSESTree.Node['type']>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

/**
 * Treat a loop as an ordering barrier for late-declaration moves when it mutates any
 * tracked variable inside the loop body.
 *
 * Variables that are declared before a loop and mutated inside it (accumulators,
 * counters, collectors) must remain before the loop so their declaration is visible
 * across all iterations. Moving them inside would reset them on every iteration,
 * changing program semantics. This guard applies regardless of whether the variable
 * is also read after the loop.
 *
 * Assumptions:
 * - nameSet contains the name(s) being tracked for late declaration.
 * - body is the array of statements in the current block.
 * - usageIndex is the index of the first statement that references the variable(s).
 */
function isMutatedInLoop(
  body: TSESTree.Statement[],
  usageIndex: number,
  nameSet: Set<string>,
): boolean {
  const firstUsage = body[usageIndex];
  if (!firstUsage) {
    return false;
  }
  if (!LOOP_TYPES.has(firstUsage.type)) {
    return false;
  }
  return statementMutatesAny(firstUsage, nameSet);
}

function handleLateDeclarations(
  sink: DetectionSink,
  body: TSESTree.Statement[],
): void {
  body.forEach((statement, index) => {
    const declarators = lateDeclarationDeclaratorsOf(statement);
    if (!declarators) {
      return;
    }
    const dependencies = new Set<string>();
    declarators.forEach((declarator) => {
      const init = unwrappedInitOf(declarator);
      if (init && init.type === AST_NODE_TYPES.Identifier) {
        dependencies.add(init.name);
      }
    });

    const nameSet = new Set(
      declarators.map((declarator) => declarator.id.name),
    );
    const usageIndex = findFirstUsageIndex(body, nameSet, index + 1);

    if (usageIndex === -1 || usageIndex <= index + 1) {
      return;
    }

    // Loop mutations create a dependency barrier: declarations that precede loops and are
    // mutated inside them cannot be safely moved, as the declaration must be visible across
    // all iterations. Prevent false positives for this pattern.
    if (isMutatedInLoop(body, usageIndex, nameSet)) {
      return;
    }

    const intervening = body.slice(index + 1, usageIndex);
    // Only move across pure declarations that do not mention the placeholder or its initializer dependencies to avoid changing closure timing or TDZ behavior.
    const crossesImpureOrTracked = intervening.some((stmt, i) => {
      if (!isPureDeclaration(stmt, { allowHooks: false })) {
        return true;
      }

      // Do not hop over another declaration that is used at the same index or earlier
      // if it is also a candidate for being moved.
      // This prevents circular swapping of related declarations (like resolve/reject pairs).
      // The test asks about *relocation*, so a declaration the fix will never move
      // is not one of the two ends of such a swap and does not block the hop.
      if (isRelocatableLateDeclaration(stmt)) {
        const declaredNames = getDeclaredNames(stmt);
        const firstUsageOfIntervening = findFirstUsageIndex(
          body,
          declaredNames,
          index + 1 + i + 1,
        );
        if (
          firstUsageOfIntervening !== -1 &&
          firstUsageOfIntervening <= usageIndex
        ) {
          return true;
        }
      }

      if (
        statementDeclaresAny(stmt, nameSet) ||
        statementMutatesAny(stmt, nameSet)
      ) {
        return true;
      }
      if (
        dependencies.size > 0 &&
        (statementDeclaresAny(stmt, dependencies) ||
          statementReferencesAny(stmt, dependencies) ||
          statementMutatesAny(stmt, dependencies))
      ) {
        return true;
      }
      return false;
    });
    if (crossesImpureOrTracked) {
      return;
    }

    const subject = earliestUsedDeclarator(
      declarators,
      body,
      index + 1,
      usageIndex,
    );
    // The same test `isRelocatableLateDeclaration` applies to an intervening
    // statement, read off the declarators already in hand.
    const relocatable = declarators.length === 1;
    record(
      sink,
      statement,
      'moveDeclarationCloser',
      { name: subject.id.name },
      index,
      usageIndex,
      relocatable,
    );
  });
}

/**
 * Assertions are peeled at both ends of the optional-chain wrapper, so
 * `send() as void`, `(send?.())!` and `(send?.() as void)` are all recognized as
 * the call they perform.
 */
function extractCallExpression(
  expression: TSESTree.Expression,
): TSESTree.CallExpression | null {
  const unwrapped = unwrapAssertions(expression);
  if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
    return unwrapped;
  }
  if (unwrapped.type === AST_NODE_TYPES.ChainExpression) {
    const chained = unwrapAssertions(unwrapped.expression);
    if (chained.type === AST_NODE_TYPES.CallExpression) {
      return chained;
    }
  }
  return null;
}

function collectFunctionBodyDependencies(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
  dependencies: Set<string>,
  context: {
    body: TSESTree.Statement[];
    callIndex: number;
    visitedCallees: Set<string>;
  },
): boolean {
  if (!fn.body) {
    return true;
  }
  collectFunctionCaptures(fn, dependencies, {
    skipFunctions: true,
    includeFunctionCaptures: true,
  });

  let resolved = true;
  const resolveCallsIn = (region: TSESTree.Node): void => {
    traverseAst(region, {
      skipFunctions: true,
      visit(current) {
        if (
          current.type !== AST_NODE_TYPES.CallExpression &&
          current.type !== AST_NODE_TYPES.ChainExpression
        ) {
          return undefined;
        }

        const callExpression =
          current.type === AST_NODE_TYPES.CallExpression
            ? current
            : extractCallExpression(current as TSESTree.Expression);
        if (!callExpression) {
          return undefined;
        }

        const nestedResolved = collectCalleeDependencies(
          context.body,
          callExpression.callee,
          dependencies,
          context.callIndex,
          context.visitedCallees,
        );
        if (!nestedResolved) {
          resolved = false;
          return { skipChildren: true };
        }
        return undefined;
      },
    });
  };

  // Parameter initializers run on entry, so a call sitting in a default reaches
  // the callee's captures exactly as a call in the body does. Restricting this
  // walk to the body contributes the callee's NAME without any of its captures,
  // and the reordering fix then hoists the effect above a binding that callee
  // reads -- a TDZ ReferenceError at runtime with no lint-visible symptom.
  // `collectFunctionCaptures` above spans `fn.params` for the same reason.
  fn.params.forEach((param) => resolveCallsIn(param));
  resolveCallsIn(fn.body);

  return resolved;
}

function resolveValueForIdentifier(
  body: TSESTree.Statement[],
  name: string,
  beforeIndex: number,
):
  | TSESTree.Expression
  | TSESTree.ClassDeclaration
  | TSESTree.ClassExpression
  | null {
  for (
    let index = Math.min(beforeIndex, body.length) - 1;
    index >= 0;
    index -= 1
  ) {
    const statement = unwrapExport(body[index]);
    if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        if (
          declarator.id.type === AST_NODE_TYPES.Identifier &&
          declarator.id.name === name &&
          declarator.init &&
          ASTHelpers.isNode(declarator.init)
        ) {
          return declarator.init as TSESTree.Expression;
        }
      }
    }
    if (
      statement.type === AST_NODE_TYPES.ClassDeclaration &&
      statement.id?.name === name
    ) {
      return statement;
    }
    if (
      statement.type === AST_NODE_TYPES.ExpressionStatement &&
      statement.expression.type === AST_NODE_TYPES.AssignmentExpression &&
      statement.expression.left.type === AST_NODE_TYPES.Identifier &&
      statement.expression.left.name === name &&
      ASTHelpers.isNode(statement.expression.right)
    ) {
      return statement.expression.right as TSESTree.Expression;
    }
  }
  return null;
}

function resolveValueNode(
  body: TSESTree.Statement[],
  node:
    | TSESTree.Expression
    | TSESTree.ClassDeclaration
    | TSESTree.ClassExpression,
  visited: Set<string>,
  beforeIndex: number,
):
  | TSESTree.Expression
  | TSESTree.ClassDeclaration
  | TSESTree.ClassExpression
  | null {
  // Every caller feeds its value through here, so unwrapping once at the entry
  // covers the object, class and function shapes `descend` matches on: an
  // `as const` on a lookup table must not turn its members opaque.
  const target = unwrapAssertions(node) as
    | TSESTree.Expression
    | TSESTree.ClassDeclaration
    | TSESTree.ClassExpression;

  if (target.type === AST_NODE_TYPES.Identifier) {
    if (visited.has(target.name)) {
      return null;
    }
    visited.add(target.name);
    const resolved = resolveValueForIdentifier(body, target.name, beforeIndex);
    if (!resolved) {
      return null;
    }
    return resolveValueNode(
      body,
      resolved as TSESTree.Expression,
      visited,
      beforeIndex,
    );
  }

  if (target.type === AST_NODE_TYPES.NewExpression) {
    const constructor = unwrapAssertions(target.callee);
    if (constructor.type === AST_NODE_TYPES.Identifier) {
      const resolvedClass = resolveValueForIdentifier(
        body,
        constructor.name,
        beforeIndex,
      );
      if (
        resolvedClass &&
        (resolvedClass.type === AST_NODE_TYPES.ClassDeclaration ||
          resolvedClass.type === AST_NODE_TYPES.ClassExpression)
      ) {
        return resolvedClass;
      }
    }
  }

  return target;
}

function resolveMemberFunction(
  body: TSESTree.Statement[],
  member: TSESTree.MemberExpression,
  beforeIndex: number,
): TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | null {
  if (member.computed || member.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const path: string[] = [];
  // A receiver may carry an assertion at any link — `(api as Api).run` — and an
  // unresolved receiver costs the captures of the function it names, which is
  // what stops the call being hoisted above them.
  let cursor: TSESTree.Node | null = unwrapAssertions(member);

  while (
    cursor &&
    cursor.type === AST_NODE_TYPES.MemberExpression &&
    !cursor.computed &&
    cursor.property.type === AST_NODE_TYPES.Identifier
  ) {
    path.unshift(cursor.property.name);
    cursor = unwrapAssertions(cursor.object as TSESTree.Node);
  }

  if (!cursor || cursor.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  path.unshift(cursor.name);
  const [root, ...segments] = path;
  const initialValue = resolveValueForIdentifier(body, root, beforeIndex);
  if (!initialValue) {
    return null;
  }

  const visited = new Set<string>([root]);
  return descend(
    resolveValueNode(body, initialValue, visited, beforeIndex),
    segments,
    visited,
  );

  function descend(
    value:
      | TSESTree.Expression
      | TSESTree.ClassDeclaration
      | TSESTree.ClassExpression
      | null,
    remaining: string[],
    visitedNames: Set<string>,
  ): TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | null {
    if (!value) {
      return null;
    }

    if (remaining.length === 0) {
      if (
        value.type === AST_NODE_TYPES.FunctionExpression ||
        value.type === AST_NODE_TYPES.ArrowFunctionExpression
      ) {
        return value;
      }
      return null;
    }

    const [segment, ...rest] = remaining;

    if (value.type === AST_NODE_TYPES.ObjectExpression) {
      const property = value.properties.find(
        (prop) =>
          prop.type === AST_NODE_TYPES.Property &&
          !prop.computed &&
          prop.key.type === AST_NODE_TYPES.Identifier &&
          prop.key.name === segment,
      ) as TSESTree.Property | undefined;

      if (!property) {
        return null;
      }

      const resolved = resolveValueNode(
        body,
        property.value as TSESTree.Expression,
        visitedNames,
        beforeIndex,
      );
      return descend(resolved, rest, visitedNames);
    }

    if (
      value.type === AST_NODE_TYPES.ClassDeclaration ||
      value.type === AST_NODE_TYPES.ClassExpression
    ) {
      const method = value.body.body.find(
        (memberDef) =>
          memberDef.type === AST_NODE_TYPES.MethodDefinition &&
          !memberDef.computed &&
          memberDef.key.type === AST_NODE_TYPES.Identifier &&
          memberDef.key.name === segment,
      ) as TSESTree.MethodDefinition | undefined;

      if (!method) {
        return null;
      }

      const resolved = resolveValueNode(
        body,
        method.value as TSESTree.FunctionExpression,
        visitedNames,
        beforeIndex,
      );
      return descend(resolved, rest, visitedNames);
    }

    return null;
  }
}

function getMemberCalleeKey(member: TSESTree.MemberExpression): string | null {
  if (member.computed || member.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const parts: string[] = [member.property.name];
  let cursor: TSESTree.Node = unwrapAssertions(member.object as TSESTree.Node);
  while (
    cursor.type === AST_NODE_TYPES.MemberExpression &&
    !cursor.computed &&
    cursor.property.type === AST_NODE_TYPES.Identifier
  ) {
    parts.unshift(cursor.property.name);
    cursor = unwrapAssertions(cursor.object as TSESTree.Node);
  }

  if (cursor.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }
  parts.unshift(cursor.name);
  return parts.join('.');
}

function unwrapCalleeExpression(
  callee:
    | TSESTree.LeftHandSideExpression
    | TSESTree.PrivateIdentifier
    | TSESTree.Super
    | TSESTree.ChainExpression,
):
  | TSESTree.LeftHandSideExpression
  | TSESTree.PrivateIdentifier
  | TSESTree.Super
  | TSESTree.ChainExpression {
  let current = callee;
  while (true) {
    if (TYPE_EXPRESSION_WRAPPERS.has(current.type) && 'expression' in current) {
      current = (current as TSESTree.TSAsExpression).expression as
        | TSESTree.LeftHandSideExpression
        | TSESTree.PrivateIdentifier
        | TSESTree.Super;
      continue;
    }
    if (
      current.type === AST_NODE_TYPES.ChainExpression &&
      'expression' in current
    ) {
      current = (current as TSESTree.ChainExpression).expression as
        | TSESTree.LeftHandSideExpression
        | TSESTree.PrivateIdentifier
        | TSESTree.Super;
      continue;
    }
    break;
  }
  return current;
}

function collectCalleeDependencies(
  body: TSESTree.Statement[],
  callee:
    | TSESTree.LeftHandSideExpression
    | TSESTree.PrivateIdentifier
    | TSESTree.Super
    | TSESTree.ChainExpression,
  dependencies: Set<string>,
  callIndex: number,
  visitedCallees: Set<string> = new Set<string>(),
): boolean {
  const unwrappedCallee = unwrapCalleeExpression(callee);
  if (unwrappedCallee !== callee) {
    return collectCalleeDependencies(
      body,
      unwrappedCallee,
      dependencies,
      callIndex,
      visitedCallees,
    );
  }

  if (
    callee.type === AST_NODE_TYPES.FunctionExpression ||
    callee.type === AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return collectFunctionBodyDependencies(callee, dependencies, {
      body,
      callIndex,
      visitedCallees,
    });
  }

  if (callee.type === AST_NODE_TYPES.Identifier) {
    const name = callee.name;
    if (visitedCallees.has(name)) {
      return true;
    }
    visitedCallees.add(name);
    if (isIdentifierMutated(body, name, callIndex)) {
      return false;
    }

    // Function declarations are hoisted, and duplicate declarations bind the name to the last
    // declaration in source order. Scanning from the end also finds the implementation in
    // TypeScript overloads (where earlier signatures omit the body).
    let functionDeclaration: TSESTree.FunctionDeclaration | null = null;
    for (let index = body.length - 1; index >= 0; index -= 1) {
      const statement = unwrapExport(body[index]);
      const declaration =
        statement.type === AST_NODE_TYPES.FunctionDeclaration
          ? statement
          : null;

      if (declaration?.id?.name !== name) {
        continue;
      }

      functionDeclaration = declaration;
      if (functionDeclaration.body) {
        break;
      }
    }

    if (functionDeclaration?.body) {
      return collectFunctionBodyDependencies(
        functionDeclaration,
        dependencies,
        {
          body,
          callIndex,
          visitedCallees,
        },
      );
    }

    for (let index = callIndex - 1; index >= 0; index -= 1) {
      const statement = variableDeclarationOf(body[index]);
      if (!statement) {
        continue;
      }
      for (const declarator of statement.declarations) {
        if (
          declarator.id.type !== AST_NODE_TYPES.Identifier ||
          declarator.id.name !== name
        ) {
          continue;
        }
        // Missing the function behind an assertion does not merely lose a
        // report: the scan falls through to "resolved with no dependencies",
        // and the reordering fix then hoists the call above the bindings the
        // function body reads.
        const init = unwrappedInitOf(declarator);
        if (
          init &&
          (init.type === AST_NODE_TYPES.FunctionExpression ||
            init.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          return collectFunctionBodyDependencies(init, dependencies, {
            body,
            callIndex,
            visitedCallees,
          });
        }
      }
    }
    return true;
  }

  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    const memberKey = getMemberCalleeKey(callee);
    if (memberKey) {
      if (visitedCallees.has(memberKey)) {
        return true;
      }
      visitedCallees.add(memberKey);
    }

    const receiver = unwrapAssertions(callee.object as TSESTree.Node);
    const rootName =
      receiver.type === AST_NODE_TYPES.Identifier ? receiver.name : null;
    if (rootName && isIdentifierMutated(body, rootName, callIndex)) {
      return false;
    }
    const memberFunction = resolveMemberFunction(body, callee, callIndex);
    if (memberFunction) {
      return collectFunctionBodyDependencies(memberFunction, dependencies, {
        body,
        callIndex,
        visitedCallees,
      });
    }
    if (rootName) {
      const declaredBeforeCall = body
        .slice(0, callIndex)
        .some((statement) =>
          statementDeclaresAny(statement, new Set([rootName])),
        );
      if (declaredBeforeCall) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function isSideEffectExpression(
  statement: TSESTree.Statement,
): statement is TSESTree.ExpressionStatement {
  if (statement.type !== AST_NODE_TYPES.ExpressionStatement) {
    return false;
  }
  return Boolean(extractCallExpression(statement.expression));
}

function handleSideEffects(
  sink: DetectionSink,
  body: TSESTree.Statement[],
): void {
  const { sourceCode } = sink;

  body.forEach((statement, index) => {
    if (!isSideEffectExpression(statement)) {
      return;
    }

    const expression = statement.expression;
    const callExpression = extractCallExpression(expression);
    if (!callExpression) {
      return;
    }
    if (isHookCallee(callExpression.callee)) {
      return;
    }

    const dependencies = new Set<string>();
    collectUsedIdentifiers(expression, dependencies, {
      skipFunctions: true,
      includeFunctionCaptures: true,
    });
    const calleeResolved = collectCalleeDependencies(
      body,
      callExpression.callee,
      dependencies,
      index,
    );
    if (!calleeResolved) {
      return;
    }

    const targetIndex = findEarliestSafeIndex(body, index, dependencies, {
      allowHooks: false,
      stopAtObservableState: true,
    });

    if (targetIndex === index) {
      return;
    }

    const effectText = truncateWithEllipsis(
      sourceCode.getText(statement).trim(),
    );
    record(
      sink,
      statement,
      'moveSideEffect',
      { effect: effectText },
      index,
      targetIndex,
    );
  });
}

/**
 * Detection is pure over the statement order, so it scores a hypothetical
 * reordering exactly as it scores the real one. Handler order is the tie-break for
 * a statement several handlers claim — do not reorder these calls.
 */
function detectViolations(
  sourceCode: TSESLint.SourceCode,
  body: TSESTree.Statement[],
): Violation[] {
  const sink: DetectionSink = {
    sourceCode,
    flagged: new Set<TSESTree.Statement>(),
    violations: [],
  };
  handleGuardHoists(sink, body);
  handleDerivedGrouping(sink, body);
  handleLateDeclarations(sink, body);
  handleSideEffects(sink, body);
  return sink.violations;
}

/**
 * Mirrors the rotation `moveSegment` performs on text, at statement granularity, so a
 * candidate ordering can be scored without rewriting and reparsing the source. The
 * two must stay in step: the search verifies the order that the fix emits.
 */
function applyMove(
  body: TSESTree.Statement[],
  fromIndex: number,
  toIndex: number,
): TSESTree.Statement[] {
  const next = [...body];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex < fromIndex ? toIndex : toIndex - 1, 0, moved);
  return next;
}

type Move = {
  fromIndex: number;
  toIndex: number;
};

/**
 * A statement whose own value comes straight from an `await`, matching how
 * `parallelize-async-operations` recognizes the members of a sequential-await run:
 * an expression statement that *is* an await, or a declaration whose initializer *is*
 * an await. An await buried deeper (`const x = (await f()).y`) is deliberately not
 * counted — that rule does not group it either, so protecting it would cost autofixes
 * for no gain.
 *
 * The same reasoning keeps assertion wrappers *out* of this one test, against the
 * grain of the rest of the file: `parallelize-async-operations` matches an await
 * initializer with the identical bare type check, so `const x = (await f()) as T`
 * is outside its runs. Peeling the wrapper here would protect a run that rule
 * never forms, so the narrowness is what keeps the two in step (#1807).
 */
function isAwaitBearingStatement(statement: TSESTree.Statement): boolean {
  if (statement.type === AST_NODE_TYPES.ExpressionStatement) {
    return statement.expression.type === AST_NODE_TYPES.AwaitExpression;
  }
  const declaration = unwrapExport(statement);
  if (declaration.type === AST_NODE_TYPES.VariableDeclaration) {
    return declaration.declarations.some(
      (declaration) =>
        declaration.init?.type === AST_NODE_TYPES.AwaitExpression,
    );
  }
  return false;
}

/**
 * Maximal stretches of two or more adjacent await-bearing statements.
 *
 * Adjacency is the entire input to `parallelize-async-operations`: a single unrelated
 * statement dropped between two sequential awaits ends the run and silences that rule
 * outright. A run of one is not protected because no such rule exists for it.
 */
function collectAwaitRuns(body: TSESTree.Statement[]): TSESTree.Statement[][] {
  const runs: TSESTree.Statement[][] = [];
  let run: TSESTree.Statement[] = [];

  for (const statement of body) {
    if (isAwaitBearingStatement(statement)) {
      run.push(statement);
      continue;
    }
    if (run.length >= 2) {
      runs.push(run);
    }
    run = [];
  }
  if (run.length >= 2) {
    runs.push(run);
  }

  return runs;
}

/**
 * Whether a candidate ordering leaves every await run contiguous and internally
 * ordered as it was.
 *
 * Relative order matters as much as contiguity: `parallelize-async-operations` anchors
 * its report and its `Promise.all` rewrite on the run's first await, so permuting the
 * run relocates the transform even when the awaits stay adjacent.
 */
function preservesAwaitRuns(
  order: TSESTree.Statement[],
  runs: TSESTree.Statement[][],
): boolean {
  return runs.every((run) => {
    const start = order.indexOf(run[0]);
    return (
      start !== -1 &&
      run.every((statement, offset) => order[start + offset] === statement)
    );
  });
}

/**
 * Names a statement binds that are unusable before the binding itself runs.
 * `const`, `let` and `class` sit in a temporal dead zone until their declaration
 * evaluates, and `var` holds `undefined` until then, so carrying one of them past
 * a statement that reads it turns a working read into a `ReferenceError` or a
 * silent `undefined`.
 *
 * Function declarations are deliberately absent: they hoist complete, so demoting
 * one past a call to it stays correct. This mirrors the same carve-out
 * `vertically-group-related-functions` makes at module scope.
 */
function nonHoistingDeclaredNames(statement: TSESTree.Statement): Set<string> {
  const names = new Set<string>();
  const declaration = unwrapExport(statement);

  if (declaration.type === AST_NODE_TYPES.VariableDeclaration) {
    declaration.declarations.forEach((declarator) => {
      collectDeclaredNamesFromPattern(
        declarator.id as
          | TSESTree.BindingName
          | TSESTree.ArrayPattern
          | TSESTree.ObjectPattern,
        names,
      );
    });
  }

  if (
    declaration.type === AST_NODE_TYPES.ClassDeclaration &&
    declaration.id &&
    declaration.id.type === AST_NODE_TYPES.Identifier
  ) {
    names.add(declaration.id.name);
  }

  return names;
}

/**
 * Per-statement binding and reference sets, plus the declare-after-use names the
 * block already carries.
 *
 * Statement identity survives every reordering, so both sets are computed once and
 * read back for each candidate order — the search scores hundreds of orders and a
 * fresh walk per order would dominate its cost.
 *
 * References are over-approximated: a read inside a nested function counts, since a
 * callback may be invoked the moment it is handed over (`act(() => render(<P />))`),
 * and only bindings the nested scope declares for itself are subtracted. Erring
 * this way can withhold a reordering but can never license one.
 */
type DeclarationFlow = {
  declared: Map<TSESTree.Statement, Set<string>>;
  referenced: Map<TSESTree.Statement, Set<string>>;
  baseline: Set<string>;
};

/**
 * Names some statement reads before the statement that binds them runs. Empty for
 * source that is already ordered; whatever it holds for the input order is the
 * allowance a candidate order may not exceed.
 */
function declareAfterUseNames(
  order: TSESTree.Statement[],
  declared: Map<TSESTree.Statement, Set<string>>,
  referenced: Map<TSESTree.Statement, Set<string>>,
): Set<string> {
  const declaredAt = new Map<string, number>();
  order.forEach((statement, index) => {
    declared.get(statement)?.forEach((name) => {
      if (!declaredAt.has(name)) {
        declaredAt.set(name, index);
      }
    });
  });

  const hazards = new Set<string>();
  if (declaredAt.size === 0) {
    return hazards;
  }

  order.forEach((statement, index) => {
    referenced.get(statement)?.forEach((name) => {
      const declaredIndex = declaredAt.get(name);
      if (declaredIndex !== undefined && declaredIndex > index) {
        hazards.add(name);
      }
    });
  });

  return hazards;
}

function buildDeclarationFlow(body: TSESTree.Statement[]): DeclarationFlow {
  const declared = new Map<TSESTree.Statement, Set<string>>();
  const referenced = new Map<TSESTree.Statement, Set<string>>();

  body.forEach((statement) => {
    declared.set(statement, nonHoistingDeclaredNames(statement));
    const names = new Set<string>();
    collectUsedIdentifiers(statement, names, {
      skipFunctions: true,
      includeFunctionCaptures: true,
    });
    referenced.set(statement, names);
  });

  return {
    declared,
    referenced,
    baseline: declareAfterUseNames(body, declared, referenced),
  };
}

/**
 * Whether a candidate ordering leaves every binding declared before the statements
 * that read it — measured against the input, so source that already reads a binding
 * ahead of its declaration is not held against the reordering.
 *
 * The test is over the whole order rather than over a move's direction, which is
 * what makes it answer both hazards at once: a declaration carried DOWN past its
 * consumer and a consumer carried UP above its producer are the same broken order
 * seen from either end. Data flow, not position, decides it — the emitted file
 * parses and type-checks either way, and only a run surfaces the
 * `ReferenceError: Cannot access '…' before initialization` (#2042).
 */
function preservesDeclarationOrder(
  order: TSESTree.Statement[],
  flow: DeclarationFlow,
): boolean {
  const hazards = declareAfterUseNames(order, flow.declared, flow.referenced);
  for (const name of hazards) {
    if (!flow.baseline.has(name)) {
      return false;
    }
  }
  return true;
}

/**
 * Upper bound on candidate moves expanded per search node. Each candidate costs one
 * full detection pass, so a node offering more violations than this has its tail
 * ignored: the frontier stays bounded and the budget buys depth rather than width.
 */
const MAX_FIX_CANDIDATES = 12;

/**
 * Real code routinely needs a run of moves before every constraint holds: hoisting
 * one `jest.mock` exposes the next, and interleaved `before`/`after` fixtures pass
 * through orders with *more* violations than they started with before settling at
 * zero. Satisfying every adjacency constraint at once therefore requires looking well
 * past the first move.
 *
 * The block's violation count is the search's initial branching factor, so a lone
 * violation starts a near-chain that can be followed far while a wide block cannot.
 * Bodies too large for repeated detection are skipped outright, and `SEARCH_BUDGET`
 * caps total detections whatever the shape — a block whose ordering cannot be settled
 * inside the budget is reported without a fix.
 */
const SEARCH_DEPTH_CHAIN = 16;
const SEARCH_DEPTH_BRANCHING = 6;
const SEARCH_MAX_VIOLATIONS = 12;
const SEARCH_MAX_STATEMENTS = 120;
const SEARCH_BUDGET = 400;

function searchDepthFor(
  violationCount: number,
  statementCount: number,
): number {
  if (statementCount > SEARCH_MAX_STATEMENTS) {
    return 0;
  }
  if (violationCount === 1) {
    return SEARCH_DEPTH_CHAIN;
  }
  if (violationCount <= SEARCH_MAX_VIOLATIONS) {
    return SEARCH_DEPTH_BRANCHING;
  }
  return 0;
}

type SearchNode = {
  order: TSESTree.Statement[];
  violations: Violation[];
  moves: Move[];
};

/**
 * Statement identity is stable across reorderings, so the original indices of an
 * order identify it uniquely and cheaply — which is what lets the search skip orders
 * reachable by more than one sequence of moves.
 */
function orderKey(
  order: TSESTree.Statement[],
  indices: Map<TSESTree.Statement, number>,
): string {
  return order.map((statement) => indices.get(statement)).join(',');
}

/**
 * Shortest sequence of moves reaching an order with **zero** relocatable violations,
 * or null when the search bounds contain no such order.
 *
 * `violations` is pre-screened by `relocatableViolations`, and so is every detection
 * the search performs: a violation whose statement the fix may not move is neither a
 * candidate move nor a reason to reject an order, since no reordering can answer it.
 *
 * Breadth-first for two reasons: the emitted fix is then the smallest reordering that
 * satisfies every constraint, and a block whose single named move already suffices
 * yields exactly that move.
 *
 * Violation count is not used to prune: an order that trades one violation for two
 * can still be the only route to a clean order, so the frontier is bounded by move
 * count and detection budget rather than by any notion of progress. Only the
 * zero-violation goal test decides whether a fix is emitted at all.
 *
 * Two hard constraints bound the search. The block's await runs: splitting a run of
 * sequential awaits destroys `parallelize-async-operations`' `Promise.all` rewrite,
 * and that rewrite carries a latency win this reordering does not — so orders that
 * break a run are not candidates at all, however clean they score. A block whose only
 * clean orders break a run is reported without a fix (#1651). And the block's
 * declaration order: an order that reads a binding before the statement declaring it
 * runs is refused outright, since a fix nobody can run is worse than a report the
 * developer resolves (#2042).
 */
function findResolvingMoves(
  sourceCode: TSESLint.SourceCode,
  body: TSESTree.Statement[],
  violations: Violation[],
  maxMoves: number,
): Move[] | null {
  if (maxMoves === 0) {
    return null;
  }

  const awaitRuns = collectAwaitRuns(body);
  const declarationFlow = buildDeclarationFlow(body);
  const indices = new Map<TSESTree.Statement, number>(
    body.map((statement, index) => [statement, index]),
  );
  const seen = new Set<string>([orderKey(body, indices)]);
  const queue: SearchNode[] = [{ order: body, violations, moves: [] }];
  let budget = SEARCH_BUDGET;

  while (queue.length > 0) {
    const node = queue.shift() as SearchNode;
    if (node.moves.length >= maxMoves) {
      continue;
    }

    const candidates = Math.min(node.violations.length, MAX_FIX_CANDIDATES);
    for (let candidate = 0; candidate < candidates; candidate += 1) {
      if (budget <= 0) {
        return null;
      }

      const { fromIndex, toIndex } = node.violations[candidate];
      const order = applyMove(node.order, fromIndex, toIndex);
      // Checked before the budget is charged: the test is a couple of array lookups,
      // and dropping the order here prunes the frontier as well as the goal, so no
      // route to a clean order passes through a broken run.
      if (!preservesAwaitRuns(order, awaitRuns)) {
        continue;
      }
      // Same placement and same reasoning as the await-run test: a set lookup per
      // name is cheaper than a detection pass, and pruning the frontier here keeps
      // every route to a clean order free of declare-after-use.
      if (!preservesDeclarationOrder(order, declarationFlow)) {
        continue;
      }
      const key = orderKey(order, indices);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      budget -= 1;

      const next = relocatableViolations(detectViolations(sourceCode, order));
      const moves = [...node.moves, { fromIndex, toIndex }];
      if (next.length === 0) {
        return moves;
      }
      queue.push({ order, violations: next, moves });
    }
  }

  return null;
}

/**
 * Statement `i` owns the text from its own leading comments and indentation up to
 * where statement `i + 1`'s begins, so the segments tile the block's statement region
 * exactly and any reordering is a permutation of them.
 */
function collectSegments(
  body: TSESTree.Statement[],
  parent: BlockLike,
  sourceCode: TSESLint.SourceCode,
): { bounds: number[]; segments: string[] } {
  const text = sourceCode.getText();
  const bounds = body.map((statement) =>
    getStartWithComments(statement, sourceCode),
  );
  bounds.push(getNextStart(body, body.length - 1, parent, sourceCode));

  return {
    bounds,
    segments: body.map((_, index) =>
      text.slice(bounds[index], bounds[index + 1]),
    ),
  };
}

/**
 * Trailing spaces and tabs are dropped as a segment moves: that whitespace is the
 * indentation of whatever used to follow the segment, not part of the segment itself.
 * Keeping it would double the indentation at the segment's destination.
 */
function moveSegment(
  segments: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  const next = [...segments];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(
    toIndex < fromIndex ? toIndex : toIndex - 1,
    0,
    moved.replace(/[ \t]+$/u, ''),
  );
  return next;
}

const LINE_TERMINATORS = new Set(['\n', '\r', '\u2028', '\u2029']);

/**
 * Whether text appended to `text` would start on a fresh line.
 *
 * Trailing spaces and tabs are skipped: a segment ends with the indentation that
 * belonged to whatever followed it, and that indentation still leaves an appended
 * segment on a line of its own.
 */
function endsWithLineTerminator(text: string): boolean {
  let cursor = text.length - 1;
  while (cursor >= 0 && (text[cursor] === ' ' || text[cursor] === '\t')) {
    cursor -= 1;
  }
  return cursor >= 0 && LINE_TERMINATORS.has(text[cursor]);
}

/**
 * The line break the source itself uses, so a separator restored below matches its
 * neighbours instead of mixing endings into a CRLF file.
 */
function lineBreakOf(text: string): string {
  const index = text.indexOf('\n');
  return index > 0 && text[index - 1] === '\r' ? '\r\n' : '\n';
}

/**
 * Concatenates reordered segments, restoring the statement separation the source
 * carried positionally.
 *
 * A segment runs up to where the next one began, so it normally already ends with the
 * line break that separated them. Two do not: the block's last segment stops at `}` or
 * at the end of the file, and a statement sharing a line with its predecessor never had
 * a break in front of it. Once a reordering moves such a segment away from the end,
 * appending the next segment directly runs two statements together — and where the
 * first ends in a `//` comment that is not a formatting blemish, since the appended
 * statement becomes comment text and vanishes from the program (#2023).
 *
 * Only the joins are separated. Nothing is appended after the final segment, whose
 * successor is the untouched text outside the replaced range.
 */
function joinSegments(segments: string[], lineBreak: string): string {
  return segments.reduce(
    (text, segment, index) =>
      index === 0 || endsWithLineTerminator(text)
        ? text + segment
        : text + lineBreak + segment,
    '',
  );
}

/**
 * Emits an entire reordering as one fix by permuting the block's text segments.
 *
 * Only the span that actually changes is replaced. That keeps the fix disjoint from
 * fixes in nested and sibling blocks — ESLint discards overlapping fixes — and makes
 * a one-move reordering byte-identical to relocating that one statement.
 */
function buildReorderFix(
  body: TSESTree.Statement[],
  moves: Move[],
  parent: BlockLike,
  sourceCode: TSESLint.SourceCode,
  fixer: TSESLint.RuleFixer,
): TSESLint.RuleFix | null {
  const { bounds, segments } = collectSegments(body, parent, sourceCode);
  const reordered = moves.reduce(
    (current, move) => moveSegment(current, move.fromIndex, move.toIndex),
    segments,
  );

  let first = 0;
  while (first < segments.length && reordered[first] === segments[first]) {
    first += 1;
  }
  let last = segments.length - 1;
  while (last > first && reordered[last] === segments[last]) {
    last -= 1;
  }
  if (first > last) {
    return null;
  }

  return fixer.replaceTextRange(
    [bounds[first], bounds[last + 1]],
    joinSegments(
      reordered.slice(first, last + 1),
      lineBreakOf(sourceCode.getText()),
    ),
  );
}

/**
 * A fix is emitted only for a reordering the detector scores at zero relocatable
 * violations, and the whole reordering ships as a single fix. Relocating one
 * statement per report satisfies its own adjacency constraint while breaking
 * another's, which under `--fix` oscillates or exhausts the pass budget (#1405).
 *
 * A violation no reordering may answer — a declaration whose sibling bindings the
 * fix would drag along — is reported and otherwise invisible here: it does not
 * carry the fix, does not veto one, and cannot keep the block from settling, since
 * the fixed text scores it exactly as the input did.
 *
 * Convergence is structural rather than argued: the emitted order is verified clean
 * by the same detector that produced the reports, and detection depends only on
 * statement order, so a single pass settles the block. Blocks with no clean order in
 * range are reported without a fix — a report the developer resolves beats a fix that
 * leaves a different violation behind.
 *
 * The fix rides on the first report because the reordering resolves every violation
 * in the block at once; a second fix would be redundant and would overlap this one.
 */
function handleBlock(ruleContext: RuleExecutionContext, node: BlockLike): void {
  const { context, sourceCode } = ruleContext;
  const body = node.body;
  const violations = detectViolations(sourceCode, body);
  if (violations.length === 0) {
    return;
  }

  const relocatable = relocatableViolations(violations);
  const moves = findResolvingMoves(
    sourceCode,
    body,
    relocatable,
    searchDepthFor(relocatable.length, body.length),
  );

  violations.forEach((violation) => {
    context.report({
      node: violation.statement,
      messageId: violation.messageId,
      data: violation.data,
      fix:
        moves && violation === relocatable[0]
          ? (fixer) => buildReorderFix(body, moves, node, sourceCode, fixer)
          : null,
    });
  });
}

export const logicalTopToBottomGrouping: TSESLint.RuleModule<
  MessageIds,
  Options
> = createRule<Options, MessageIds>({
  name: 'logical-top-to-bottom-grouping',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce logical top-to-bottom grouping of related statements',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      moveGuardUp: `What's wrong: the guard "{{guard}}" appears after setup it can skip. Why it matters: readers miss the early-exit path and unnecessary work may execute; unsafe reordering can also introduce TDZ errors when guards reference values declared below. How to fix: place the guard immediately before the setup it protects.`,
      groupDerived: `What's wrong: "{{name}}" depends on "{{dependency}}" but is separated by unrelated statements. Why it matters: scattered dependencies make the input→output flow harder to follow and increase cognitive load; grouping them clarifies the logical relationship. How to fix: move "{{name}}" next to "{{dependency}}" so they form a cohesive unit.`,
      moveDeclarationCloser: `What's wrong: "{{name}}" is declared far from its first use. Why it matters: distant declarations scatter the flow and make the execution order harder to follow; readers must mentally track when the variable becomes available. How to fix: move "{{name}}" next to its first usage.`,
      moveSideEffect: `What's wrong: the side effect "{{effect}}" is buried after unrelated setup. Why it matters: chronological flow becomes unclear and readers may assume the effect happens later than it actually does. How to fix: emit observable effects before unrelated initialization to keep the temporal order obvious.`,
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    const ruleContext: RuleExecutionContext = {
      context,
      sourceCode,
    };

    const visitBlock = (node: BlockLike) => handleBlock(ruleContext, node);

    return {
      Program: visitBlock,
      BlockStatement: visitBlock,
    };
  },
});
