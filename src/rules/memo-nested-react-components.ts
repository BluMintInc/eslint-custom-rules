import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type Options = [
  {
    ignorePatterns?: string[];
  },
];

type MessageIds = 'memoizeNestedComponent';

type ComponentDetectionResult = {
  found: true;
  componentIsCallback: boolean;
};

const CALLBACK_HOOKS = new Set(['useCallback', 'useDeepCompareCallback']);

const HOOK_REPLACEMENT: Record<string, string> = {
  useCallback: 'useMemo',
  useDeepCompareCallback: 'useDeepCompareMemo',
};

type ReactImports = {
  namespace: string | null;
  named: Partial<Record<'createElement' | 'memo' | 'forwardRef', string>>;
};

const collectReactImports = (
  sourceCode: Readonly<TSESLint.SourceCode>,
): ReactImports => {
  const reactImports: ReactImports = { namespace: null, named: {} };

  for (const statement of sourceCode.ast.body) {
    if (statement.type !== AST_NODE_TYPES.ImportDeclaration) continue;

    if (statement.source.value !== 'react') continue;

    for (const specifier of statement.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.imported.type === AST_NODE_TYPES.Identifier
      ) {
        const importedName = specifier.imported.name;
        if (
          importedName === 'createElement' ||
          importedName === 'memo' ||
          importedName === 'forwardRef'
        ) {
          reactImports.named[importedName] = specifier.local.name;
        }
      }

      if (
        specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
        specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
      ) {
        reactImports.namespace = specifier.local.name;
      }
    }
  }

  return reactImports;
};

const calleeMatchesReactMember = (
  callee: TSESTree.LeftHandSideExpression,
  reactImports: ReactImports,
  member: keyof ReactImports['named'],
): boolean => {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return reactImports.named[member] === callee.name;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === member &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    reactImports.namespace === callee.object.name
  ) {
    return true;
  }

  return false;
};

const isFunctionExpression = (
  node: TSESTree.Node,
): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression => {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
};

const unwrapExpression = (
  expression: TSESTree.Expression,
): TSESTree.Expression => {
  if (expression.type === AST_NODE_TYPES.TSAsExpression) {
    return unwrapExpression(expression.expression);
  }
  if (expression.type === AST_NODE_TYPES.TSSatisfiesExpression) {
    return unwrapExpression(expression.expression);
  }
  if (expression.type === AST_NODE_TYPES.TSNonNullExpression) {
    return unwrapExpression(expression.expression);
  }
  /**
   * ParenthesizedExpression appears in the parsed AST even though the type
   * is missing from AST_NODE_TYPES. This assertion safely unwraps to keep
   * traversal consistent.
   */
  if (
    ((expression as TSESTree.Node).type as unknown as string) ===
    'ParenthesizedExpression'
  ) {
    return unwrapExpression(
      (expression as unknown as { expression: TSESTree.Expression }).expression,
    );
  }

  return expression;
};

const isReactCreateElementCall = (
  node: TSESTree.CallExpression,
  reactImports: ReactImports,
): boolean => {
  return calleeMatchesReactMember(node.callee, reactImports, 'createElement');
};

const isHookCall = (
  callee: TSESTree.LeftHandSideExpression,
): { name: string } | null => {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    if (CALLBACK_HOOKS.has(callee.name)) {
      return { name: callee.name };
    }
    return null;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    CALLBACK_HOOKS.has(callee.property.name)
  ) {
    return { name: callee.property.name };
  }

  return null;
};

const isForwardRefCall = (
  node: TSESTree.CallExpression,
  reactImports: ReactImports,
): boolean => {
  return calleeMatchesReactMember(node.callee, reactImports, 'forwardRef');
};

const isMemoCall = (
  node: TSESTree.CallExpression,
  reactImports: ReactImports,
): boolean => {
  return calleeMatchesReactMember(node.callee, reactImports, 'memo');
};

const filterPresentResults = (
  results: Array<ComponentDetectionResult | null>,
): ComponentDetectionResult[] => {
  return results.filter((result): result is ComponentDetectionResult =>
    Boolean(result),
  );
};

const areAllComponentsCallbacks = (
  components: ComponentDetectionResult[],
): boolean => {
  return components.every((result) => result.componentIsCallback);
};

const createMergedResult = (
  components: ComponentDetectionResult[],
): ComponentDetectionResult => {
  return {
    found: true,
    // Auto-fix wraps the callback in memo() and swaps the hook. That is only valid when
    // every branch is itself a component callback (returns JSX/createElement directly).
    // If any branch yields a component factory, the transformation changes behavior.
    componentIsCallback: areAllComponentsCallbacks(components),
  };
};

const mergeComponentResults = (
  ...results: Array<ComponentDetectionResult | null>
): ComponentDetectionResult | null => {
  const present = filterPresentResults(results);

  if (!present.length) {
    return null;
  }

  return createMergedResult(present);
};

const expressionCreatesComponent = (
  expression: TSESTree.Expression | null,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  if (!expression) {
    return null;
  }

  const unwrapped = unwrapExpression(expression);

  if (
    unwrapped.type === AST_NODE_TYPES.JSXElement ||
    unwrapped.type === AST_NODE_TYPES.JSXFragment
  ) {
    return { found: true, componentIsCallback: true };
  }

  if (
    unwrapped.type === AST_NODE_TYPES.CallExpression &&
    isReactCreateElementCall(unwrapped, reactImports)
  ) {
    return { found: true, componentIsCallback: true };
  }

  switch (unwrapped.type) {
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression: {
      const inner = functionCreatesComponent(unwrapped, reactImports);
      return inner ? { found: true, componentIsCallback: false } : null;
    }
    case AST_NODE_TYPES.CallExpression: {
      if (
        isForwardRefCall(unwrapped, reactImports) ||
        isMemoCall(unwrapped, reactImports)
      ) {
        const firstArg = unwrapped.arguments[0];
        if (firstArg && isFunctionExpression(firstArg)) {
          const inner = functionCreatesComponent(firstArg, reactImports);
          if (inner) {
            return { found: true, componentIsCallback: false };
          }
        }
      }

      return null;
    }
    case AST_NODE_TYPES.ConditionalExpression: {
      const cons = expressionCreatesComponent(
        unwrapped.consequent,
        reactImports,
      );
      const alt = expressionCreatesComponent(unwrapped.alternate, reactImports);
      return mergeComponentResults(cons, alt);
    }
    case AST_NODE_TYPES.LogicalExpression: {
      const left = expressionCreatesComponent(unwrapped.left, reactImports);
      const right = expressionCreatesComponent(unwrapped.right, reactImports);
      return mergeComponentResults(left, right);
    }
    case AST_NODE_TYPES.SequenceExpression: {
      const last = unwrapped.expressions[unwrapped.expressions.length - 1];
      return expressionCreatesComponent(last || null, reactImports);
    }
    case AST_NODE_TYPES.ArrayExpression: {
      const matches = unwrapped.elements
        .map((element) =>
          element && element.type !== AST_NODE_TYPES.SpreadElement
            ? expressionCreatesComponent(element, reactImports)
            : null,
        )
        .filter(Boolean) as ComponentDetectionResult[];
      return mergeComponentResults(...matches);
    }
    default:
      return null;
  }
};

const statementCreatesComponent = (
  node: TSESTree.Statement,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  switch (node.type) {
    case AST_NODE_TYPES.ReturnStatement:
      return expressionCreatesComponent(node.argument, reactImports);
    case AST_NODE_TYPES.IfStatement: {
      const cons =
        node.consequent.type === AST_NODE_TYPES.BlockStatement
          ? blockCreatesComponent(node.consequent, reactImports)
          : statementCreatesComponent(node.consequent, reactImports);

      const alt = node.alternate
        ? node.alternate.type === AST_NODE_TYPES.BlockStatement
          ? blockCreatesComponent(node.alternate, reactImports)
          : statementCreatesComponent(node.alternate, reactImports)
        : null;

      return mergeComponentResults(cons, alt);
    }
    case AST_NODE_TYPES.SwitchStatement: {
      const matches: Array<ComponentDetectionResult | null> = [];
      for (const switchCase of node.cases) {
        for (const consequent of switchCase.consequent) {
          matches.push(statementCreatesComponent(consequent, reactImports));
        }
      }
      return mergeComponentResults(...matches);
    }
    case AST_NODE_TYPES.BlockStatement:
      return blockCreatesComponent(node, reactImports);
    case AST_NODE_TYPES.ForStatement:
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForOfStatement:
    case AST_NODE_TYPES.WhileStatement:
    case AST_NODE_TYPES.DoWhileStatement: {
      if (node.body.type === AST_NODE_TYPES.BlockStatement) {
        return blockCreatesComponent(node.body, reactImports);
      }
      return statementCreatesComponent(node.body, reactImports);
    }
    case AST_NODE_TYPES.TryStatement: {
      const blockMatch = blockCreatesComponent(node.block, reactImports);
      const handlerMatch = node.handler?.body
        ? blockCreatesComponent(node.handler.body, reactImports)
        : null;
      const finalizerMatch = node.finalizer
        ? blockCreatesComponent(node.finalizer, reactImports)
        : null;

      return mergeComponentResults(blockMatch, handlerMatch, finalizerMatch);
    }
    default:
      return null;
  }
};

const blockCreatesComponent = (
  block: TSESTree.BlockStatement,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  const matches: Array<ComponentDetectionResult | null> = [];

  for (const statement of block.body) {
    matches.push(statementCreatesComponent(statement, reactImports));
  }

  return mergeComponentResults(...matches);
};

const functionCreatesComponent = (
  node:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  if (node.body.type === AST_NODE_TYPES.BlockStatement) {
    return blockCreatesComponent(node.body, reactImports);
  }

  return expressionCreatesComponent(node.body, reactImports);
};

const shouldIgnoreFile = (filename: string, patterns: string[]): boolean => {
  return patterns.some((pattern) => minimatch(filename, pattern));
};

const getVariableName = (node: TSESTree.CallExpression): string | null => {
  if (
    node.parent &&
    node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  return null;
};

const findMemoReference = (reactImports: ReactImports): string | null => {
  if (reactImports.namespace) {
    return `${reactImports.namespace}.memo`;
  }

  return reactImports.named.memo ?? null;
};

const hasIdentifierInScope = (
  identifierName: string,
  scope: TSESLint.Scope.Scope,
) => {
  return !!ASTHelpers.findVariableInScope(scope, identifierName);
};

export const memoNestedReactComponents = createRule<Options, MessageIds>({
  name: 'memo-nested-react-components',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow React components defined in useCallback/useDeepCompareCallback',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          ignorePatterns: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      memoizeNestedComponent: `What's wrong: React component "{{componentName}}" is created inside {{hookName}}.
Why it matters: Components defined inside callbacks get new identities when the callback changes, causing React to remount them and drop their state and effects.
How to fix: Create the component via {{replacementHook}} and wrap it in memo() so its identity stays stable across renders.`,
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const ignorePatterns = options?.ignorePatterns ?? [];
    const filename =
      (context as { filename?: string }).filename ?? context.getFilename();

    if (ignorePatterns.length && shouldIgnoreFile(filename, ignorePatterns)) {
      return {};
    }

    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const reactImports = collectReactImports(sourceCode);
    const memoReference = findMemoReference(reactImports);

    return {
      CallExpression(node) {
        const hook = isHookCall(node.callee);
        if (!hook) return;

        const callback = node.arguments[0];

        if (!callback || callback.type === AST_NODE_TYPES.SpreadElement) {
          return;
        }

        const componentMatch = isFunctionExpression(callback)
          ? functionCreatesComponent(callback, reactImports)
          : expressionCreatesComponent(callback, reactImports);
        if (!componentMatch) {
          return;
        }

        const componentName =
          getVariableName(node) ??
          (isFunctionExpression(callback) &&
          callback.id?.type === AST_NODE_TYPES.Identifier
            ? callback.id.name
            : 'component');

        const replacementHook = HOOK_REPLACEMENT[hook.name];

        context.report({
          node,
          messageId: 'memoizeNestedComponent',
          data: {
            componentName,
            hookName: `${hook.name}()`,
            replacementHook: `${replacementHook}()`,
          },
          fix: (fixer) => {
            if (!memoReference) {
              return null;
            }

            const memoNamespace = memoReference.endsWith('.memo')
              ? memoReference.slice(0, -'.memo'.length)
              : null;

            // Prefer SourceCode#getScope when available; fall back to RuleContext#getScope for ESLint compatibility.
            const sourceCodeWithScope = sourceCode as unknown as {
              getScope?: (node: TSESTree.Node) => TSESLint.Scope.Scope;
            };
            const scope =
              typeof sourceCodeWithScope.getScope === 'function'
                ? sourceCodeWithScope.getScope(node)
                : context.getScope();
            const replacementIdentifierAvailable =
              hook.name === 'useCallback'
                ? hasIdentifierInScope(HOOK_REPLACEMENT.useCallback, scope)
                : hasIdentifierInScope(
                    HOOK_REPLACEMENT.useDeepCompareCallback,
                    scope,
                  );

            if (!replacementIdentifierAvailable) {
              // When the standalone replacement hook (useMemo/useDeepCompareMemo) is not imported,
              // we can only fix member expressions that use the React namespace.
              if (
                node.callee.type !== AST_NODE_TYPES.MemberExpression ||
                node.callee.object.type !== AST_NODE_TYPES.Identifier
              ) {
                return null;
              }

              // Ensure memo's namespace matches the hook's namespace (e.g., React.useCallback → React.useMemo + React.memo).
              if (
                memoReference &&
                memoReference.includes('.') &&
                memoReference !== `${node.callee.object.name}.memo`
              ) {
                return null;
              }
            }

            // Component factories (functions returning functions that return JSX) require manual refactoring.
            if (!componentMatch.componentIsCallback) {
              return null;
            }

            // Ensure callback is a function expression before attempting to wrap it.
            if (!isFunctionExpression(callback)) {
              return null;
            }

            // React.memo() expects a synchronous component function. Wrapping async functions or
            // generators would produce a Promise/yielding component, which is not renderable.
            if (
              callback.async ||
              (callback.type === AST_NODE_TYPES.FunctionExpression &&
                callback.generator)
            ) {
              return null;
            }

            // Avoid rewriting non-React namespaces (e.g., Hooks.useCallback → Hooks.useMemo),
            // even when useMemo/memo are available as named imports.
            if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
              if (
                node.callee.object.type !== AST_NODE_TYPES.Identifier ||
                !reactImports.namespace ||
                node.callee.object.name !== reactImports.namespace
              ) {
                return null;
              }
            }

            // Prevent mixing namespaces: don't apply fix when hook and memo use different React imports.
            if (
              memoNamespace &&
              node.callee.type === AST_NODE_TYPES.MemberExpression &&
              node.callee.object.type === AST_NODE_TYPES.Identifier &&
              node.callee.object.name !== memoNamespace
            ) {
              return null;
            }

            const callbackText = sourceCode.getText(callback);
            const callbackReplacement = `() => ${memoReference}(${callbackText})`;

            const fixes: TSESLint.RuleFix[] = [
              fixer.replaceText(callback, callbackReplacement),
            ];

            if (node.callee.type === AST_NODE_TYPES.Identifier) {
              fixes.push(
                fixer.replaceText(
                  node.callee,
                  HOOK_REPLACEMENT[node.callee.name],
                ),
              );
            } else if (
              node.callee.type === AST_NODE_TYPES.MemberExpression &&
              node.callee.property.type === AST_NODE_TYPES.Identifier
            ) {
              fixes.push(
                fixer.replaceText(
                  node.callee.property,
                  HOOK_REPLACEMENT[node.callee.property.name],
                ),
              );
            }

            return fixes;
          },
        });
      },
    };
  },
});
