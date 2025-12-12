import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';

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

const isReactCreateElementCall = (node: TSESTree.CallExpression): boolean => {
  if (node.callee.type === AST_NODE_TYPES.Identifier) {
    return node.callee.name === 'createElement';
  }

  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return node.callee.property.name === 'createElement';
  }

  return false;
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

const isForwardRefCall = (node: TSESTree.CallExpression): boolean => {
  if (node.callee.type === AST_NODE_TYPES.Identifier) {
    return node.callee.name === 'forwardRef';
  }
  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return node.callee.property.name === 'forwardRef';
  }
  return false;
};

const isMemoCall = (node: TSESTree.CallExpression): boolean => {
  if (node.callee.type === AST_NODE_TYPES.Identifier) {
    return node.callee.name === 'memo';
  }
  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return node.callee.property.name === 'memo';
  }
  return false;
};

const expressionCreatesComponent = (
  expression: TSESTree.Expression | null,
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
    isReactCreateElementCall(unwrapped)
  ) {
    return { found: true, componentIsCallback: true };
  }

  switch (unwrapped.type) {
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression: {
      const inner = functionCreatesComponent(unwrapped);
      return inner ? { found: true, componentIsCallback: false } : null;
    }
    case AST_NODE_TYPES.CallExpression: {
      if (isForwardRefCall(unwrapped) || isMemoCall(unwrapped)) {
        const firstArg = unwrapped.arguments[0];
        if (firstArg && isFunctionExpression(firstArg)) {
          const inner = functionCreatesComponent(firstArg);
          if (inner) {
            return { found: true, componentIsCallback: false };
          }
        }
      }

      return null;
    }
    case AST_NODE_TYPES.ConditionalExpression: {
      const cons = expressionCreatesComponent(unwrapped.consequent);
      const alt = expressionCreatesComponent(unwrapped.alternate);
      return cons || alt;
    }
    case AST_NODE_TYPES.LogicalExpression: {
      const left = expressionCreatesComponent(unwrapped.left);
      const right = expressionCreatesComponent(unwrapped.right);
      return left || right;
    }
    case AST_NODE_TYPES.SequenceExpression: {
      const last = unwrapped.expressions[unwrapped.expressions.length - 1];
      return expressionCreatesComponent(last || null);
    }
    case AST_NODE_TYPES.ArrayExpression: {
      const match = unwrapped.elements
        .map((element) =>
          element && element.type !== AST_NODE_TYPES.SpreadElement
            ? expressionCreatesComponent(element)
            : null,
        )
        .find(Boolean);
      return match || null;
    }
    default:
      return null;
  }
};

const statementCreatesComponent = (
  node: TSESTree.Statement,
): ComponentDetectionResult | null => {
  switch (node.type) {
    case AST_NODE_TYPES.ReturnStatement:
      return expressionCreatesComponent(node.argument);
    case AST_NODE_TYPES.IfStatement: {
      const cons =
        node.consequent.type === AST_NODE_TYPES.BlockStatement
          ? blockCreatesComponent(node.consequent)
          : statementCreatesComponent(node.consequent);

      if (cons) return cons;

      if (node.alternate) {
        if (node.alternate.type === AST_NODE_TYPES.BlockStatement) {
          return blockCreatesComponent(node.alternate);
        }
        return statementCreatesComponent(node.alternate);
      }

      return null;
    }
    case AST_NODE_TYPES.SwitchStatement: {
      for (const switchCase of node.cases) {
        for (const consequent of switchCase.consequent) {
          const match = statementCreatesComponent(consequent);
          if (match) return match;
        }
      }
      return null;
    }
    case AST_NODE_TYPES.BlockStatement:
      return blockCreatesComponent(node);
    case AST_NODE_TYPES.ForStatement:
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForOfStatement:
    case AST_NODE_TYPES.WhileStatement:
    case AST_NODE_TYPES.DoWhileStatement: {
      if (node.body.type === AST_NODE_TYPES.BlockStatement) {
        return blockCreatesComponent(node.body);
      }
      return statementCreatesComponent(node.body);
    }
    case AST_NODE_TYPES.TryStatement: {
      const blockMatch = blockCreatesComponent(node.block);
      if (blockMatch) return blockMatch;

      if (node.handler?.body) {
        const handlerMatch = blockCreatesComponent(node.handler.body);
        if (handlerMatch) return handlerMatch;
      }

      if (node.finalizer) {
        return blockCreatesComponent(node.finalizer);
      }

      return null;
    }
    default:
      return null;
  }
};

const blockCreatesComponent = (
  block: TSESTree.BlockStatement,
): ComponentDetectionResult | null => {
  for (const statement of block.body) {
    const match = statementCreatesComponent(statement);
    if (match) return match;
  }
  return null;
};

const functionCreatesComponent = (
  node:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
): ComponentDetectionResult | null => {
  if (node.body.type === AST_NODE_TYPES.BlockStatement) {
    return blockCreatesComponent(node.body);
  }

  return expressionCreatesComponent(node.body);
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

const findMemoReference = (
  sourceCode: Readonly<TSESLint.SourceCode>,
): string | null => {
  let reactIdentifier: string | null = null;

  for (const statement of sourceCode.ast.body) {
    if (statement.type !== AST_NODE_TYPES.ImportDeclaration) continue;

    const isReactImport = statement.source.value === 'react';
    if (!isReactImport) {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.imported.type === AST_NODE_TYPES.Identifier &&
        specifier.imported.name === 'memo'
      ) {
        return specifier.local.name;
      }

      if (
        specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier &&
        specifier.local.name === 'memo'
      ) {
        return 'memo';
      }

      if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
        reactIdentifier = specifier.local.name;
      }

      if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
        reactIdentifier = specifier.local.name;
      }
    }
  }

  return reactIdentifier ? `${reactIdentifier}.memo` : null;
};

const hasIdentifierInScope = (name: string, scope: TSESLint.Scope.Scope) => {
  let current: TSESLint.Scope.Scope | null = scope;

  while (current) {
    if (current.variables.some((variable) => variable.name === name)) {
      return true;
    }
    current = current.upper;
  }

  return false;
};

export const memoNestedReactComponents = createRule<Options, MessageIds>({
  name: 'memo-nested-react-components',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prevent defining React components inside useCallback/useDeepCompareCallback; memoize them with useMemo/useDeepCompareMemo and memo() to avoid unnecessary remounts',
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
      memoizeNestedComponent:
        'React component "{{componentName}}" is created inside {{hookName}}. Components defined in callbacks get new identities whenever the callback changes, which forces React to remount them and drop their state. Move this component into {{replacementHook}} and wrap it in memo() so its identity stays stable across renders.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const ignorePatterns = options?.ignorePatterns ?? [];
    const filename =
      (Reflect.get(context, 'filename') as string | undefined) ??
      context.getFilename();

    if (ignorePatterns.length && shouldIgnoreFile(filename, ignorePatterns)) {
      return {};
    }

    const sourceCode =
      (Reflect.get(context, 'sourceCode') as Readonly<TSESLint.SourceCode> | null | undefined) ??
      context.getSourceCode();
    const memoReference = findMemoReference(sourceCode);

    return {
      CallExpression(node) {
        const hook = isHookCall(node.callee);
        if (!hook) return;

        const callback = node.arguments[0];

        if (!callback || callback.type === AST_NODE_TYPES.SpreadElement) {
          return;
        }

        const componentMatch = isFunctionExpression(callback)
          ? functionCreatesComponent(callback)
          : expressionCreatesComponent(callback);
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

            const scope = context.getScope();
            const replacementIdentifierAvailable =
              hook.name === 'useCallback'
                ? hasIdentifierInScope(HOOK_REPLACEMENT.useCallback, scope)
                : hasIdentifierInScope(
                    HOOK_REPLACEMENT.useDeepCompareCallback,
                    scope,
                  );

            if (!replacementIdentifierAvailable) {
              // Avoid producing an invalid fix when the replacement hook is not imported.
              if (
                node.callee.type !== AST_NODE_TYPES.MemberExpression ||
                node.callee.object.type !== AST_NODE_TYPES.Identifier
              ) {
                return null;
              }
            }

            if (!componentMatch.componentIsCallback) {
              return null;
            }

            if (!isFunctionExpression(callback)) {
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
