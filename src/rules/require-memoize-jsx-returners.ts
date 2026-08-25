import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  importAnchorIndent,
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

type MessageIds = 'requireMemoizeJsxReturner';
type Options = [];

type JsxFactoryContext = {
  reactMemoIdentifiers: Set<string>;
  reactNamespaceIdentifiers: Set<string>;
  reactCreateElementIdentifiers: Set<string>;
};

const MEMOIZE_PREFERRED_MODULE = '@blumintinc/typescript-memoize';
const MEMOIZE_MODULES = new Set([
  MEMOIZE_PREFERRED_MODULE,
  'typescript-memoize',
]);
const MEMOIZE_EXPORT_NAME = 'Memoize';

/**
 * The base classes React ships for class components. A class extending one of
 * them hands its `render()` to React, which re-invokes it on every state and
 * props change by contract (see `isReactComponentClass`).
 */
const REACT_COMPONENT_BASE_NAMES = new Set(['Component', 'PureComponent']);
const RENDER_METHOD_NAME = 'render';
/**
 * The wrappers `unwrapSuperClass` strips. `ChainExpression` is ESTree's
 * envelope for `extends X?.Component`, which is grammatical and, whenever the
 * receiver is defined, means exactly `X.Component`.
 */
const SUPERCLASS_WRAPPER_TYPES = new Set<string>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.ChainExpression,
]);

type FunctionLike =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

type JsxReturnCacheState = 'pending' | boolean;

function isMemoizeDecorator(
  decorator: TSESTree.Decorator,
  alias: string,
  namespaceAlias: string | null,
): boolean {
  const expression = decorator.expression;

  const matchesAliasIdentifier = (node: TSESTree.Node | null): boolean =>
    !!node && node.type === AST_NODE_TYPES.Identifier && node.name === alias;

  const matchesNamespaceMember = (node: TSESTree.MemberExpression): boolean => {
    if (node.computed) return false;
    if (node.property.type !== AST_NODE_TYPES.Identifier) return false;
    if (node.property.name !== 'Memoize') return false;
    return (
      !!namespaceAlias &&
      node.object.type === AST_NODE_TYPES.Identifier &&
      node.object.name === namespaceAlias
    );
  };

  if (expression.type === AST_NODE_TYPES.CallExpression) {
    const { callee } = expression;
    if (
      callee.type === AST_NODE_TYPES.Identifier &&
      matchesAliasIdentifier(callee)
    ) {
      return true;
    }
    if (
      callee.type === AST_NODE_TYPES.MemberExpression &&
      matchesNamespaceMember(callee)
    ) {
      return true;
    }
  }

  if (matchesAliasIdentifier(expression)) {
    return true;
  }

  if (
    expression.type === AST_NODE_TYPES.MemberExpression &&
    matchesNamespaceMember(expression)
  ) {
    return true;
  }

  return false;
}

/**
 * The expression a class extends, with the wrappers an author can put around it
 * stripped: `extends (React.Component)`, `extends (Component as any)`,
 * `extends Base!`, `extends React?.Component`. The type arguments in
 * `extends Component<Props, State>` live on `superTypeParameters` and never
 * reach here.
 */
function unwrapSuperClass(expression: TSESTree.Node): TSESTree.Node {
  let current: TSESTree.Node = expression;
  for (;;) {
    if (isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    // Compared as strings: `superClass` is typed as a LeftHandSideExpression,
    // which excludes the assertion forms the parser nevertheless yields there.
    if (SUPERCLASS_WRAPPER_TYPES.has(current.type)) {
      current = (current as unknown as { expression: TSESTree.Node })
        .expression;
      continue;
    }
    return current;
  }
}

/**
 * Whether the class hands its `render()` to React — that is, whether it extends
 * React's `Component` or `PureComponent`.
 *
 * The match is keyed on React's VOCABULARY, not on the binding's provenance: a
 * superclass spelled `Component` or `PureComponent` qualifies wherever the name
 * is bound — an unaliased `import { Component } from 'react'`, an ambient
 * global, a fixture that omits the import — and so does `X.Component` /
 * `X.PureComponent` through any namespace object (`React.Component`,
 * `Preact.PureComponent`, an aliased default import). Only where the spelling
 * carries no vocabulary is the binding resolved through the scope chain: an
 * import specifier renamed away from those names
 * (`import { Component as ReactComponent } from 'react'`) and a same-file class
 * that itself extends one of them (`class Base extends React.Component {}` …
 * `class Boundary extends Base {}`). A superclass whose name is neither of
 * those and resolves to nothing React-shaped in this file — `extends Base` from
 * another module — is NOT treated as a component.
 *
 * Provenance is deliberately not verified: `class Foo extends Component` where
 * `Component` is an unrelated local class is a corner case whose cost is one
 * unreported factory named `render`, while treating a real component's `render`
 * as a factory hands `--fix` a decorator that pins the component to its first
 * output — a silent behavioural break (#2033). A false negative is the cheaper
 * mistake, so the vocabulary wins.
 */
function isReactComponentClass(
  classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  visited: Set<TSESTree.Node> = new Set(),
): boolean {
  if (!classNode.superClass || visited.has(classNode)) {
    return false;
  }
  visited.add(classNode);

  const superClass = unwrapSuperClass(classNode.superClass);

  if (
    superClass.type === AST_NODE_TYPES.MemberExpression &&
    !superClass.computed &&
    superClass.property.type === AST_NODE_TYPES.Identifier
  ) {
    return REACT_COMPONENT_BASE_NAMES.has(superClass.property.name);
  }

  if (superClass.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  if (REACT_COMPONENT_BASE_NAMES.has(superClass.name)) {
    return true;
  }

  const variable = ASTHelpers.findVariableInScope(
    ASTHelpers.getScope(context, classNode),
    superClass.name,
  );
  if (!variable) {
    return false;
  }

  return variable.defs.some((def) => {
    const declaration = def.node as TSESTree.Node;
    if (
      declaration.type === AST_NODE_TYPES.ImportSpecifier &&
      declaration.imported.type === AST_NODE_TYPES.Identifier
    ) {
      return REACT_COMPONENT_BASE_NAMES.has(declaration.imported.name);
    }
    if (
      declaration.type === AST_NODE_TYPES.ClassDeclaration ||
      declaration.type === AST_NODE_TYPES.ClassExpression
    ) {
      return isReactComponentClass(declaration, context, visited);
    }
    return false;
  });
}

/**
 * Whether the member is the `render` React calls — the key is read literally,
 * so a computed `[render]()` naming some other value does not qualify.
 */
function isRenderMember(node: TSESTree.MethodDefinition): boolean {
  const { key } = node;
  if (key.type === AST_NODE_TYPES.Identifier && !node.computed) {
    return key.name === RENDER_METHOD_NAME;
  }
  return (
    key.type === AST_NODE_TYPES.Literal && key.value === RENDER_METHOD_NAME
  );
}

function getMemberName(node: TSESTree.MethodDefinition): string {
  const key = node.key;
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }
  if (key.type === AST_NODE_TYPES.PrivateIdentifier) {
    return key.name;
  }
  return 'member';
}

function extractFunctionsFromVariableDeclaration(
  declaration: TSESTree.VariableDeclaration,
  functions: Map<string, FunctionLike>,
): void {
  for (const declarator of declaration.declarations) {
    if (declarator.id.type !== AST_NODE_TYPES.Identifier) {
      continue;
    }

    const init = declarator.init;
    if (
      !init ||
      (init.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
        init.type !== AST_NODE_TYPES.FunctionExpression)
    ) {
      continue;
    }

    functions.set(declarator.id.name, init);
  }
}

function traverseStatements(
  statements: TSESTree.Statement[],
  functions: Map<string, FunctionLike>,
): void {
  statements.forEach((statement) => visitStatement(statement, functions));
}

function visitStatementByType(
  statement: TSESTree.Statement,
  functions: Map<string, FunctionLike>,
): void {
  switch (statement.type) {
    case AST_NODE_TYPES.BlockStatement:
      traverseStatements(statement.body, functions);
      break;
    case AST_NODE_TYPES.IfStatement:
      visitStatement(statement.consequent, functions);
      if (statement.alternate) {
        visitStatement(statement.alternate, functions);
      }
      break;
    case AST_NODE_TYPES.SwitchStatement:
      statement.cases.forEach((caseNode) =>
        traverseStatements(caseNode.consequent, functions),
      );
      break;
    case AST_NODE_TYPES.TryStatement:
      visitStatement(statement.block, functions);
      if (statement.handler) {
        visitStatement(statement.handler.body, functions);
      }
      if (statement.finalizer) {
        visitStatement(statement.finalizer, functions);
      }
      break;
    case AST_NODE_TYPES.ForStatement:
      if (
        statement.init &&
        statement.init.type === AST_NODE_TYPES.VariableDeclaration
      ) {
        extractFunctionsFromVariableDeclaration(statement.init, functions);
      }
      visitStatement(statement.body, functions);
      break;
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForOfStatement:
      if (statement.left.type === AST_NODE_TYPES.VariableDeclaration) {
        extractFunctionsFromVariableDeclaration(statement.left, functions);
      }
      visitStatement(statement.body, functions);
      break;
    case AST_NODE_TYPES.WhileStatement:
    case AST_NODE_TYPES.DoWhileStatement:
    case AST_NODE_TYPES.LabeledStatement:
    case AST_NODE_TYPES.WithStatement:
      visitStatement(statement.body, functions);
      break;
    default:
      break;
  }
}

function visitStatement(
  statement: TSESTree.Statement,
  functions: Map<string, FunctionLike>,
): void {
  if (
    statement.type === AST_NODE_TYPES.FunctionDeclaration &&
    statement.id?.name
  ) {
    functions.set(statement.id.name, statement);
    return;
  }

  if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
    extractFunctionsFromVariableDeclaration(statement, functions);
  }

  visitStatementByType(statement, functions);
}

function collectLocalFunctions(
  body: TSESTree.BlockStatement | null | undefined,
): Map<string, FunctionLike> {
  const functions = new Map<string, FunctionLike>();
  if (!body || body.type !== AST_NODE_TYPES.BlockStatement) {
    return functions;
  }

  traverseStatements(body.body, functions);

  return functions;
}

/** Type guard for ParenthesizedExpression (non-standard node type in some parsers). */
function isParenthesizedExpression(
  node: TSESTree.Node | null | undefined,
): node is TSESTree.Node & { expression: TSESTree.Expression } {
  return (
    !!node &&
    (node.type as string) === 'ParenthesizedExpression' &&
    'expression' in node &&
    (node as any).expression != null
  );
}

function isIdentifierReturningJsx(
  node: TSESTree.Identifier,
  knownFunctions: Map<string, FunctionLike>,
  cache: WeakMap<FunctionLike, JsxReturnCacheState>,
  factoryContext: JsxFactoryContext,
): boolean {
  const targetFn = knownFunctions.get(node.name);
  return (
    !!targetFn &&
    functionReturnsJSX(targetFn, knownFunctions, cache, factoryContext)
  );
}

function isWrappedReturningJsx(
  node:
    | TSESTree.TSAsExpression
    | TSESTree.TSTypeAssertion
    | TSESTree.TSNonNullExpression
    | TSESTree.TSSatisfiesExpression
    | TSESTree.ChainExpression,
  knownFunctions: Map<string, FunctionLike>,
  cache: WeakMap<FunctionLike, JsxReturnCacheState>,
  factoryContext: JsxFactoryContext,
): boolean {
  return expressionReturnsJSX(
    node.expression,
    knownFunctions,
    cache,
    factoryContext,
  );
}

function isSequenceReturningJsx(
  node: TSESTree.SequenceExpression,
  knownFunctions: Map<string, FunctionLike>,
  cache: WeakMap<FunctionLike, JsxReturnCacheState>,
  factoryContext: JsxFactoryContext,
): boolean {
  return (
    node.expressions.length > 0 &&
    expressionReturnsJSX(
      node.expressions[node.expressions.length - 1],
      knownFunctions,
      cache,
      factoryContext,
    )
  );
}

function isLogicalReturningJsx(
  node: TSESTree.LogicalExpression,
  knownFunctions: Map<string, FunctionLike>,
  cache: WeakMap<FunctionLike, JsxReturnCacheState>,
  factoryContext: JsxFactoryContext,
): boolean {
  return (
    expressionReturnsJSX(node.left, knownFunctions, cache, factoryContext) ||
    expressionReturnsJSX(node.right, knownFunctions, cache, factoryContext)
  );
}

function isConditionalReturningJsx(
  node: TSESTree.ConditionalExpression,
  knownFunctions: Map<string, FunctionLike>,
  cache: WeakMap<FunctionLike, JsxReturnCacheState>,
  factoryContext: JsxFactoryContext,
): boolean {
  return (
    expressionReturnsJSX(
      node.consequent,
      knownFunctions,
      cache,
      factoryContext,
    ) ||
    expressionReturnsJSX(node.alternate, knownFunctions, cache, factoryContext)
  );
}

function callExpressionReturnsJSX(
  expression: TSESTree.CallExpression,
  knownFunctions: Map<string, FunctionLike>,
  cache: WeakMap<FunctionLike, JsxReturnCacheState>,
  factoryContext: JsxFactoryContext,
): boolean {
  const { callee } = expression;
  const firstNonSpreadArgument = expression.arguments.find(
    (arg) => arg.type !== AST_NODE_TYPES.SpreadElement,
  ) as TSESTree.Expression | undefined;

  if (callee.type === AST_NODE_TYPES.Identifier) {
    if (factoryContext.reactCreateElementIdentifiers.has(callee.name)) {
      return true;
    }

    if (
      isIdentifierReturningJsx(callee, knownFunctions, cache, factoryContext)
    ) {
      return true;
    }

    if (
      factoryContext.reactMemoIdentifiers.has(callee.name) &&
      firstNonSpreadArgument &&
      expressionReturnsJSX(
        firstNonSpreadArgument,
        knownFunctions,
        cache,
        factoryContext,
      )
    ) {
      return true;
    }
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    const propertyName = callee.property.name;

    /** Treat React.createElement style calls as JSX-producing. */
    if (
      propertyName === 'createElement' &&
      callee.object.type === AST_NODE_TYPES.Identifier &&
      factoryContext.reactNamespaceIdentifiers.has(callee.object.name)
    ) {
      return true;
    }

    if (
      propertyName === 'memo' &&
      callee.object.type === AST_NODE_TYPES.Identifier &&
      factoryContext.reactNamespaceIdentifiers.has(callee.object.name) &&
      firstNonSpreadArgument &&
      expressionReturnsJSX(
        firstNonSpreadArgument,
        knownFunctions,
        cache,
        factoryContext,
      )
    ) {
      return true;
    }

    if (
      (propertyName === 'call' || propertyName === 'apply') &&
      callee.object.type === AST_NODE_TYPES.Identifier
    ) {
      if (
        isIdentifierReturningJsx(
          callee.object,
          knownFunctions,
          cache,
          factoryContext,
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function isFunctionReturningJSX(
  node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  knownFunctions: Map<string, FunctionLike>,
  cache: WeakMap<FunctionLike, JsxReturnCacheState>,
  factoryContext: JsxFactoryContext,
): boolean {
  return functionReturnsJSX(node, knownFunctions, cache, factoryContext);
}

function dispatchExpressionReturnsJSX(
  expression: TSESTree.Expression,
  knownFunctions: Map<string, FunctionLike>,
  cache: WeakMap<FunctionLike, JsxReturnCacheState>,
  factoryContext: JsxFactoryContext,
): boolean {
  const type = (expression as TSESTree.Node).type;
  switch (type) {
    case AST_NODE_TYPES.JSXElement:
    case AST_NODE_TYPES.JSXFragment:
      return true;

    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression:
      return isFunctionReturningJSX(
        expression as
          | TSESTree.ArrowFunctionExpression
          | TSESTree.FunctionExpression,
        knownFunctions,
        cache,
        factoryContext,
      );

    case AST_NODE_TYPES.Identifier:
      return isIdentifierReturningJsx(
        expression as TSESTree.Identifier,
        knownFunctions,
        cache,
        factoryContext,
      );

    case AST_NODE_TYPES.CallExpression:
      return callExpressionReturnsJSX(
        expression as TSESTree.CallExpression,
        knownFunctions,
        cache,
        factoryContext,
      );

    case AST_NODE_TYPES.ConditionalExpression:
      return isConditionalReturningJsx(
        expression as TSESTree.ConditionalExpression,
        knownFunctions,
        cache,
        factoryContext,
      );

    case AST_NODE_TYPES.LogicalExpression:
      return isLogicalReturningJsx(
        expression as TSESTree.LogicalExpression,
        knownFunctions,
        cache,
        factoryContext,
      );

    case AST_NODE_TYPES.SequenceExpression:
      return isSequenceReturningJsx(
        expression as TSESTree.SequenceExpression,
        knownFunctions,
        cache,
        factoryContext,
      );

    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.ChainExpression:
      return isWrappedReturningJsx(
        expression as
          | TSESTree.TSAsExpression
          | TSESTree.TSTypeAssertion
          | TSESTree.TSNonNullExpression
          | TSESTree.TSSatisfiesExpression
          | TSESTree.ChainExpression,
        knownFunctions,
        cache,
        factoryContext,
      );

    default:
      return false;
  }
}

function expressionReturnsJSX(
  expression: TSESTree.Expression | null | undefined,
  knownFunctions: Map<string, FunctionLike>,
  cache: WeakMap<FunctionLike, JsxReturnCacheState>,
  factoryContext: JsxFactoryContext,
): boolean {
  if (!expression) return false;

  if (isParenthesizedExpression(expression)) {
    return expressionReturnsJSX(
      expression.expression,
      knownFunctions,
      cache,
      factoryContext,
    );
  }

  return dispatchExpressionReturnsJSX(
    expression,
    knownFunctions,
    cache,
    factoryContext,
  );
}

function statementReturnsJSX(
  statement: TSESTree.Statement,
  knownFunctions: Map<string, FunctionLike>,
  cache: WeakMap<FunctionLike, JsxReturnCacheState>,
  factoryContext: JsxFactoryContext,
): boolean {
  switch (statement.type) {
    case AST_NODE_TYPES.ReturnStatement:
      return expressionReturnsJSX(
        statement.argument,
        knownFunctions,
        cache,
        factoryContext,
      );
    case AST_NODE_TYPES.BlockStatement:
      return statement.body.some((child) =>
        statementReturnsJSX(child, knownFunctions, cache, factoryContext),
      );
    case AST_NODE_TYPES.IfStatement:
      return (
        statementReturnsJSX(
          statement.consequent,
          knownFunctions,
          cache,
          factoryContext,
        ) ||
        (statement.alternate
          ? statementReturnsJSX(
              statement.alternate,
              knownFunctions,
              cache,
              factoryContext,
            )
          : false)
      );
    case AST_NODE_TYPES.SwitchStatement:
      return statement.cases.some((caseNode) =>
        caseNode.consequent.some((consequent) =>
          statementReturnsJSX(
            consequent,
            knownFunctions,
            cache,
            factoryContext,
          ),
        ),
      );
    case AST_NODE_TYPES.TryStatement:
      if (
        statementReturnsJSX(
          statement.block,
          knownFunctions,
          cache,
          factoryContext,
        )
      ) {
        return true;
      }
      if (
        statement.handler &&
        statementReturnsJSX(
          statement.handler.body,
          knownFunctions,
          cache,
          factoryContext,
        )
      ) {
        return true;
      }
      if (
        statement.finalizer &&
        statementReturnsJSX(
          statement.finalizer,
          knownFunctions,
          cache,
          factoryContext,
        )
      ) {
        return true;
      }
      return false;
    case AST_NODE_TYPES.ForStatement:
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForOfStatement:
    case AST_NODE_TYPES.WhileStatement:
    case AST_NODE_TYPES.DoWhileStatement:
    case AST_NODE_TYPES.LabeledStatement:
    case AST_NODE_TYPES.WithStatement:
      return statementReturnsJSX(
        statement.body,
        knownFunctions,
        cache,
        factoryContext,
      );
    default:
      return false;
  }
}

function functionReturnsJSX(
  fn: FunctionLike,
  knownFunctions: Map<string, FunctionLike>,
  cache: WeakMap<FunctionLike, JsxReturnCacheState>,
  factoryContext: JsxFactoryContext,
): boolean {
  const cached = cache.get(fn);
  if (cached === true || cached === false) {
    return cached;
  }
  if (cached === 'pending') {
    return false;
  }

  cache.set(fn, 'pending');

  if (
    fn.type !== AST_NODE_TYPES.FunctionDeclaration &&
    fn.type !== AST_NODE_TYPES.FunctionExpression &&
    fn.type !== AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    cache.set(fn, false);
    return false;
  }

  let extendedFunctions = knownFunctions;
  if (fn.body && fn.body.type === AST_NODE_TYPES.BlockStatement) {
    const nested = collectLocalFunctions(fn.body);
    if (nested.size > 0) {
      extendedFunctions = new Map(knownFunctions);
      for (const [name, nestedFn] of nested.entries()) {
        extendedFunctions.set(name, nestedFn);
      }
    }
  }

  let returnsJSX = false;

  if (!fn.body) {
    cache.set(fn, false);
    return false;
  }

  if (fn.body.type === AST_NODE_TYPES.BlockStatement) {
    returnsJSX = statementReturnsJSX(
      fn.body,
      extendedFunctions,
      cache,
      factoryContext,
    );
  } else if (
    expressionReturnsJSX(fn.body, extendedFunctions, cache, factoryContext)
  ) {
    returnsJSX = true;
  }

  cache.set(fn, returnsJSX);
  return returnsJSX;
}

type MemoizeImportBinding = {
  /** The identifier through which `Memoize` is reachable in the file. */
  localName: string;
  /** A namespace binding reaches the decorator as `localName.Memoize`. */
  isNamespace: boolean;
};

/**
 * A specifier that binds the memoize module's `Memoize` export — either by name
 * (under any local alias) or through the module namespace.
 */
function isMemoizeSpecifier(
  specifier: TSESTree.Node,
): specifier is TSESTree.ImportSpecifier | TSESTree.ImportNamespaceSpecifier {
  if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
    return true;
  }
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.imported.type === AST_NODE_TYPES.Identifier &&
    specifier.imported.name === MEMOIZE_EXPORT_NAME
  );
}

/**
 * The binding through which the emitted decorator reaches `Memoize`, read off
 * the program body rather than a traversal flag. `eslint --fix` re-lints between
 * passes and inserts the import above code an earlier pass already visited, so a
 * flag set by the `ImportDeclaration` visitor is not yet accurate for a class
 * that precedes the import in source order.
 */
function findMemoizeImportBinding(
  program: TSESTree.Program,
): MemoizeImportBinding | null {
  let namedAlias: string | null = null;
  let namespaceAlias: string | null = null;

  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      !MEMOIZE_MODULES.has(String(statement.source.value))
    ) {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
        namespaceAlias = specifier.local.name;
      } else if (isMemoizeSpecifier(specifier)) {
        namedAlias = specifier.local?.name ?? namedAlias;
      }
    }
  }

  /** `namespace.Memoize` stays valid whatever the named specifiers are. */
  if (namespaceAlias) {
    return { localName: namespaceAlias, isNamespace: true };
  }
  return namedAlias ? { localName: namedAlias, isNamespace: false } : null;
}

/**
 * Whether every declaration of a visible binding is the memoize import itself.
 * Anything else — a local declaration, a parameter, a class, a default
 * specifier, an import of the same name from another module — means the fix
 * cannot proceed under that name.
 */
function bindsMemoizeImport(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (!isMemoizeSpecifier(specifier)) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        MEMOIZE_MODULES.has(String(declaration.source.value))
      );
    })
  );
}

function getImportFixes(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  hasMemoizeImport: boolean,
  scheduledImportFix: boolean,
): { fixes: TSESLint.RuleFix[]; scheduledImportFix: boolean } {
  const fixes: TSESLint.RuleFix[] = [];
  if (hasMemoizeImport || scheduledImportFix) {
    return { fixes, scheduledImportFix };
  }

  const programBody = sourceCode.ast.body;

  /** Look for an existing import from the memoize module. */
  const existingMemoizeImport = programBody.find(
    (statement): statement is TSESTree.ImportDeclaration =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      MEMOIZE_MODULES.has(String(statement.source.value)),
  );

  if (
    existingMemoizeImport &&
    existingMemoizeImport.specifiers.some(
      (s) => s.type === AST_NODE_TYPES.ImportSpecifier,
    )
  ) {
    /** Augment existing named import. */
    const lastSpecifier = [...existingMemoizeImport.specifiers]
      .reverse()
      .find((s) => s.type === AST_NODE_TYPES.ImportSpecifier);

    if (lastSpecifier) {
      fixes.push(fixer.insertTextAfter(lastSpecifier, ', Memoize'));
      return { fixes, scheduledImportFix: true };
    }
  }

  // The anchor sits past the file's prologue, so a `'use client'` directive
  // keeps its position as the first statement and a `#!` shebang keeps
  // character 0. Emitting the anchor's own indentation after the import leaves
  // the displaced statement indented exactly as it was.
  const anchor = importInsertionAnchor(sourceCode);
  const indent = importAnchorIndent(sourceCode, anchor);
  fixes.push(
    insertAtImportAnchor(
      sourceCode,
      fixer,
      anchor,
      `import { Memoize } from '${MEMOIZE_PREFERRED_MODULE}';\n${indent}`,
    ),
  );

  return { fixes, scheduledImportFix: true };
}

export const requireMemoizeJsxReturners = createRule<Options, MessageIds>({
  name: 'require-memoize-jsx-returners',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require @Memoize() decorator on instance members that return JSX or JSX factories',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireMemoizeJsxReturner:
        '"{{name}}" returns JSX (or a JSX-producing factory) without @Memoize() → Each call/access creates a new component/function reference that can trigger avoidable React re-renders or remounts → Add @Memoize() to "{{name}}" and import { Memoize } from "@blumintinc/typescript-memoize".',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.getFilename();
    const isVirtualFile = filename.startsWith('<');
    if (!isVirtualFile && !/\.tsx?$/i.test(filename)) {
      return {} as TSESLint.RuleListener;
    }

    /**
     * Aliases used to recognize an existing `@Memoize()` decorator. The fixer
     * derives its own import state from the program body instead, so these track
     * detection only.
     */
    let memoizeAlias = MEMOIZE_EXPORT_NAME;
    let memoizeNamespace: string | null = null;
    let scheduledImportFix = false;

    /**
     * The `import { Memoize }` statement rides on a single violation's fix, so
     * that violation is the file's import carrier. A suppressed carrier would
     * take the import down with it while the surviving violations still emit
     * `@Memoize()`, leaving a decorator with no import.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    const jsxReturnCache = new WeakMap<FunctionLike, JsxReturnCacheState>();
    const reactMemoIdentifiers = new Set<string>();
    const reactNamespaceIdentifiers = new Set<string>();
    const reactCreateElementIdentifiers = new Set<string>();
    const factoryContext: JsxFactoryContext = {
      reactMemoIdentifiers,
      reactNamespaceIdentifiers,
      reactCreateElementIdentifiers,
    };

    return {
      ImportDeclaration(node) {
        const sourceValue = String(node.source.value);

        if (sourceValue === 'react') {
          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'memo'
            ) {
              reactMemoIdentifiers.add(
                specifier.local?.name ?? specifier.imported.name,
              );
            } else if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'createElement'
            ) {
              reactCreateElementIdentifiers.add(
                specifier.local?.name ?? specifier.imported.name,
              );
            } else if (
              specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier
            ) {
              reactNamespaceIdentifiers.add(specifier.local.name);
            } else if (
              specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
            ) {
              reactNamespaceIdentifiers.add(specifier.local.name);
            }
          });
        }

        if (!MEMOIZE_MODULES.has(sourceValue)) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
            if (
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === MEMOIZE_EXPORT_NAME
            ) {
              memoizeAlias = specifier.local?.name ?? memoizeAlias;
            }
          } else if (
            specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
          ) {
            memoizeNamespace = specifier.local.name;
          }
        }
      },

      MethodDefinition(node) {
        if (node.kind === 'set' || node.kind === 'constructor') {
          return;
        }
        if (node.static) {
          return;
        }
        if (node.value.type !== AST_NODE_TYPES.FunctionExpression) {
          return;
        }

        // A `#private` NAME admits no decorator under `experimentalDecorators`
        // — the mode this plugin's `@Memoize()` is written for — so the
        // prescribed remedy is `TS1206: Decorators are not valid here.`,
        // measured against the repo's tsc 5.0.3, for the own-line spelling
        // exactly as for the inline one, and for a `get #view()` accessor
        // exactly as for a `#view()` method. Report and fix are both withheld,
        // as `enforce-memoize-getters` withholds them (#1945) and
        // `enforce-memoize-async` since #1954: the message's only remedy, "Add
        // @Memoize() to …", cannot be written on that member, and a report
        // naming an edit its reader cannot make is worse than silence. The
        // restriction is on the private NAME, not on privacy — `private get
        // view()` is a legal decorator position and keeps both report and fix,
        // as does a string-literal key that merely contains a `#`, which is why
        // the key's node type is what is read here rather than its text.
        // Nothing is lost by the silence either: a `#private` member is
        // unnameable outside its class, so an author who wants memoization can
        // reach it through the `private` modifier. Withholding the report ahead
        // of it also keeps such a member out of the import-carrier race below.
        if (node.key.type === AST_NODE_TYPES.PrivateIdentifier) {
          return;
        }

        // Under `experimentalDecorators` — the mode this plugin's consumers
        // compile in — TypeScript rejects a decorator on EVERY member of a
        // class EXPRESSION with TS1206, "Decorators are not valid here.",
        // whatever the member is named and wherever the decorator is written.
        // `const K = class { … }`, a named `class Inner { … }`, and a class
        // expression returned from a factory, passed as an argument or held in
        // a property are all out of reach, so `@Memoize()` cannot be added in
        // place. Report and fix are BOTH withheld: an unfixable report names a
        // remedy — "Add @Memoize() to …" — that the author cannot write there
        // at all, which is worse than silence. The enclosing class is read
        // directly rather than by walking ancestors: a class DECLARATION nested
        // inside a class expression's method takes decorators normally, and
        // `export default class { … }` is a declaration despite having no name.
        const classBody = node.parent;
        if (classBody?.parent?.type === AST_NODE_TYPES.ClassExpression) {
          return;
        }

        // React re-invokes a class component's `render()` on every state and
        // props change BY CONTRACT, so `@Memoize()` there is never a remedy:
        // it pins the component to the output of its first render. An error
        // boundary is the sharpest case — it catches, `getDerivedStateFromError`
        // sets state, React re-renders, and the memoized `render()` hands back
        // the cached pre-error children, so the fallback can never appear
        // (#2033). Unlike this rule's compile-breaking autofix defects
        // (#1414, #1434, #1950, #1951, #1955), the result compiles and lints
        // clean, so nothing downstream catches it. Report and fix are both
        // withheld — the message's only remedy is the very edit that breaks
        // the component. `render` is the ONLY instance lifecycle method that
        // returns an element (`shouldComponentUpdate` returns a boolean,
        // `getSnapshotBeforeUpdate` an opaque snapshot, the rest `void`), and
        // the statics React also calls — `getDerivedStateFromError`,
        // `getDerivedStateFromProps` — return state and are out of scope above
        // regardless, so the exemption is keyed on that one name. Other
        // members of a class component are the author's own factories, called
        // on the author's schedule, and stay under the rule. Withholding the
        // report here also keeps `render` out of the import-carrier race below.
        if (
          isRenderMember(node) &&
          classBody?.parent?.type === AST_NODE_TYPES.ClassDeclaration &&
          isReactComponentClass(classBody.parent, context)
        ) {
          return;
        }

        const hasDecorator = node.decorators?.some((decorator) =>
          isMemoizeDecorator(decorator, memoizeAlias, memoizeNamespace),
        );

        if (hasDecorator) {
          return;
        }

        const localFunctions = collectLocalFunctions(node.value.body);
        if (
          !functionReturnsJSX(
            node.value as FunctionLike,
            localFunctions,
            jsxReturnCache,
            factoryContext,
          )
        ) {
          return;
        }

        // The report is emitted even when suppressed: ESLint discards it, and
        // reporting keeps the user's disable directive "used" so that
        // `--report-unused-disable-directives` does not flag it.
        context.report({
          node,
          messageId: 'requireMemoizeJsxReturner',
          data: { name: getMemberName(node) },
          fix(fixer) {
            // A suppressed report is dropped together with its fix. Producing
            // no fix — and leaving `scheduledImportFix` untouched — passes the
            // import to the first violation that survives.
            if (isReportSuppressed(node)) {
              return null;
            }

            const sourceCode = context.getSourceCode();
            const memoizeImport = findMemoizeImportBinding(sourceCode.ast);
            const decoratorBaseName =
              memoizeImport?.localName ?? MEMOIZE_EXPORT_NAME;

            // Resolve the decorator's identifier through the scope chain at the
            // member being fixed. A binding that is not the memoize import
            // makes both halves of the edit wrong: the inserted
            // `import { Memoize }` collides with a top-level binding of that
            // name (TS2440/TS2300), and a narrower shadow silently binds
            // `@Memoize()` to the shadow with no TypeScript diagnostic at all.
            // Declining leaves the report in place so the author resolves the
            // conflict deliberately.
            const existing = ASTHelpers.findVariableInScope(
              ASTHelpers.getScope(context, node),
              decoratorBaseName,
            );
            if (existing && !bindsMemoizeImport(existing)) {
              return null;
            }

            const decoratorIdent = memoizeImport?.isNamespace
              ? `${memoizeImport.localName}.${MEMOIZE_EXPORT_NAME}`
              : decoratorBaseName;

            const { fixes, scheduledImportFix: newScheduledImportFix } =
              getImportFixes(
                fixer,
                sourceCode,
                !!memoizeImport,
                scheduledImportFix,
              );
            scheduledImportFix = newScheduledImportFix;

            // Anchor the decorator on the member — its first token, so ahead of
            // `public`/`private` and of any decorator it already carries —
            // rather than on the start of the line the member happens to sit
            // on. The two coincide only while the member is first on its line:
            // in a single-line class body, or where a member shares a line with
            // the class's own `{`, a line-start edit emits the decorator before
            // `class …`, decorating the CLASS. `Memoize` is a METHOD decorator,
            // so that lands TS1238 and TS1270 on the class, and the member it
            // was meant for stays bare — the rule reports it again on the next
            // pass and `--fix` stacks one more decorator per pass up to
            // ESLint's pass cap instead of reaching a fixpoint. Spelled as
            // `enforce-memoize-getters` spells it, since both rules emit the
            // same decorator onto the same kind of member.
            const insertionTarget = node.decorators?.[0] ?? node;
            const insertionStart = insertionTarget.range[0];
            const text = sourceCode.text;
            const lineStart = text.lastIndexOf('\n', insertionStart - 1) + 1;
            const linePrefix = text.slice(lineStart, insertionStart);
            // A member that owns its line keeps the decorator on a line of its
            // own at the member's indentation, which is the layout authors
            // write by hand. A member that shares its line has no line to take,
            // and a newline there would strand the decorator against the
            // neighbour's text, so it rides inline — a spelling the grammar
            // accepts just as readily.
            const ownsItsLine = /^[ \t]*$/.test(linePrefix);
            fixes.push(
              fixer.insertTextBefore(
                insertionTarget,
                ownsItsLine
                  ? `@${decoratorIdent}()\n${linePrefix}`
                  : `@${decoratorIdent}() `,
              ),
            );

            // A member carrying a SINGLE decorator may keep it on the member's
            // own line, and a formatter preserves that. Adding a second one
            // withdraws the choice: with more than one decorator each takes a
            // line of its own. So a decorator the author wrote inline —
            // `@Log() get view() {` — has to be broken out here, or the
            // formatter does it on its next run and the file churns every pass
            // (#2115). Only whitespace may be crossed: text between a decorator
            // and what follows it is a comment, and moving the line break past
            // it would change which line the comment introduces.
            if (ownsItsLine) {
              for (const decorator of node.decorators ?? []) {
                const following = sourceCode.getTokenAfter(decorator);
                if (!following) {
                  continue;
                }
                // A comment written after the decorator stays WITH the
                // decorator — that is where it was attached and where a
                // formatter leaves it — so the break goes after the comment
                // rather than before it. Anything else would move the comment
                // onto the member it does not annotate.
                const trailing = sourceCode
                  .getCommentsAfter(decorator)
                  .filter(
                    (comment) =>
                      comment.range[1] <= following.range[0] &&
                      comment.loc.start.line === decorator.loc.end.line,
                  );
                const anchor = trailing[trailing.length - 1] ?? decorator;
                if (following.loc.start.line === anchor.loc.end.line) {
                  fixes.push(
                    fixer.replaceTextRange(
                      [anchor.range[1], following.range[0]],
                      `\n${linePrefix}`,
                    ),
                  );
                }
              }
            }

            return fixes;
          },
        });
      },
    };
  },
});

export default requireMemoizeJsxReturners;
