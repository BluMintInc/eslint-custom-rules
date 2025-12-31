import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

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

  const firstImport = programBody.find(
    (statement) => statement.type === AST_NODE_TYPES.ImportDeclaration,
  );
  const anchorNode = (firstImport ?? programBody[0]) as
    | TSESTree.Node
    | undefined;

  if (anchorNode) {
    const text = sourceCode.text;
    const anchorStart = anchorNode.range?.[0] ?? 0;
    const lineStart = text.lastIndexOf('\n', anchorStart - 1) + 1;
    const leadingWhitespace =
      text.slice(lineStart, anchorStart).match(/^[ \t]*/)?.[0] ?? '';
    const importLine = `${leadingWhitespace}import { Memoize } from '${MEMOIZE_PREFERRED_MODULE}';\n`;
    fixes.push(fixer.insertTextBeforeRange([lineStart, lineStart], importLine));
  } else {
    fixes.push(
      fixer.insertTextBeforeRange(
        [0, 0],
        `import { Memoize } from '${MEMOIZE_PREFERRED_MODULE}';\n`,
      ),
    );
  }

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

    let hasMemoizeImport = false;
    let memoizeAlias = 'Memoize';
    let memoizeNamespace: string | null = null;
    let scheduledImportFix = false;
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
              specifier.imported.name === 'Memoize'
            ) {
              hasMemoizeImport = true;
              memoizeAlias = specifier.local?.name ?? memoizeAlias;
            }
          } else if (
            specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
          ) {
            hasMemoizeImport = true;
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

        const decoratorIdent = memoizeNamespace
          ? `${memoizeNamespace}.Memoize`
          : memoizeAlias;

        context.report({
          node,
          messageId: 'requireMemoizeJsxReturner',
          data: { name: getMemberName(node) },
          fix(fixer) {
            const sourceCode = context.getSourceCode();
            const { fixes, scheduledImportFix: newScheduledImportFix } =
              getImportFixes(
                fixer,
                sourceCode,
                hasMemoizeImport,
                scheduledImportFix,
              );
            scheduledImportFix = newScheduledImportFix;

            const insertionTarget =
              node.decorators && node.decorators.length > 0
                ? node.decorators[0]
                : node;
            const insertionStart = insertionTarget.range
              ? insertionTarget.range[0]
              : node.range
              ? node.range[0]
              : 0;
            const text = sourceCode.text;
            const lineStart = text.lastIndexOf('\n', insertionStart - 1) + 1;
            const leadingWhitespace =
              text.slice(lineStart, insertionStart).match(/^[ \t]*/)?.[0] ?? '';
            fixes.push(
              fixer.insertTextBeforeRange(
                [lineStart, lineStart],
                `${leadingWhitespace}@${decoratorIdent}()\n`,
              ),
            );

            return fixes;
          },
        });
      },
    };
  },
});

export default requireMemoizeJsxReturners;
