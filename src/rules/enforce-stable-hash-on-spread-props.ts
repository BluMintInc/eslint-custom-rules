import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceStableHash';

const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier && HOOK_NAMES.has(callee.name)
  );
}

function isSpreadObjectInDependencyArray(
  node: TSESTree.Identifier,
  functionComponent: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): boolean {
  // Check if the identifier is a destructured spread property
  const params = functionComponent.params;

  for (const param of params) {
    if (param.type === AST_NODE_TYPES.ObjectPattern) {
      for (const property of param.properties) {
        if (
          property.type === AST_NODE_TYPES.RestElement &&
          property.argument.type === AST_NODE_TYPES.Identifier &&
          property.argument.name === node.name
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

function isWrappedInStableHash(node: TSESTree.Expression): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }

  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }

  return callee.name === 'stableHash';
}

function isWrappedInUseMemo(
  node: TSESTree.Identifier,
  scope: Record<string, TSESTree.Node>,
): boolean {
  // If this is a dependency in a useMemo call, we don't need to wrap it
  if (
    node.parent &&
    node.parent.type === AST_NODE_TYPES.ArrayExpression &&
    node.parent.parent &&
    node.parent.parent.type === AST_NODE_TYPES.CallExpression &&
    node.parent.parent.callee.type === AST_NODE_TYPES.Identifier &&
    node.parent.parent.callee.name === 'useMemo'
  ) {
    // Check if the useMemo is storing the spread prop
    const useMemoCallback = node.parent.parent.arguments[0];
    if (
      useMemoCallback &&
      (useMemoCallback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
       useMemoCallback.type === AST_NODE_TYPES.FunctionExpression)
    ) {
      // Check if the callback directly returns the spread prop
      const body = useMemoCallback.body;
      if (
        (body.type === AST_NODE_TYPES.Identifier && body.name === node.name) ||
        (body.type === AST_NODE_TYPES.BlockStatement &&
         body.body.length === 1 &&
         body.body[0].type === AST_NODE_TYPES.ReturnStatement &&
         body.body[0].argument &&
         body.body[0].argument.type === AST_NODE_TYPES.Identifier &&
         body.body[0].argument.name === node.name)
      ) {
        return true;
      }
    }
  }

  // Check if the identifier is a variable that was created with useMemo
  const declaration = scope[node.name];

  if (!declaration) {
    return false;
  }

  if (
    declaration.type === AST_NODE_TYPES.VariableDeclarator &&
    declaration.init &&
    declaration.init.type === AST_NODE_TYPES.CallExpression &&
    declaration.init.callee.type === AST_NODE_TYPES.Identifier &&
    declaration.init.callee.name === 'useMemo'
  ) {
    return true;
  }

  return false;
}

export const enforceStableHashOnSpreadProps = createRule<[], MessageIds>({
  name: 'enforce-stable-hash-on-spread-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce wrapping destructured spread props in stableHash() when used in dependency arrays to ensure referential stability.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceStableHash:
        'Destructured spread props should be wrapped in stableHash() when used in dependency arrays to ensure referential stability.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track variable declarations to check for useMemo
    const variableDeclarations: Record<string, TSESTree.Node> = {};

    // Track the current function component
    let currentFunctionComponent: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null = null;

    return {
      // Track variable declarations for useMemo check
      VariableDeclarator(node) {
        if (node.id.type === AST_NODE_TYPES.Identifier) {
          variableDeclarations[node.id.name] = node;
        }
      },

      // Track function components
      FunctionDeclaration(node) {
        currentFunctionComponent = node;
      },
      'FunctionDeclaration:exit'() {
        currentFunctionComponent = null;
      },

      ArrowFunctionExpression(node) {
        currentFunctionComponent = node;
      },
      'ArrowFunctionExpression:exit'() {
        currentFunctionComponent = null;
      },

      FunctionExpression(node) {
        currentFunctionComponent = node;
      },
      'FunctionExpression:exit'() {
        currentFunctionComponent = null;
      },

      // Check hook dependency arrays
      CallExpression(node) {
        if (!isHookCall(node) || !currentFunctionComponent) {
          return;
        }

        // Get the dependency array argument
        const depsArg = node.arguments[node.arguments.length - 1];
        if (!depsArg || depsArg.type !== AST_NODE_TYPES.ArrayExpression) {
          return;
        }

        // Check each dependency in the array
        depsArg.elements.forEach((element) => {
          if (!element) return; // Skip null elements (holes in the array)

          if (element.type === AST_NODE_TYPES.Identifier) {
            // Check if this is a spread prop from destructuring
            if (currentFunctionComponent && isSpreadObjectInDependencyArray(element, currentFunctionComponent)) {
              // Check if it's already wrapped in stableHash or useMemo
              if (!isWrappedInStableHash(element) && !isWrappedInUseMemo(element, variableDeclarations)) {
                context.report({
                  node: element,
                  messageId: 'enforceStableHash',
                  fix(fixer) {
                    // Add import statement for stableHash if needed
                    const importFix = fixer.insertTextBeforeRange(
                      [0, 0],
                      "import { stableHash } from 'fuunctions/src/util/hash/stableHash';\n\n"
                    );

                    // Add eslint-disable comment for react-hooks/exhaustive-deps
                    const sourceCode = context.getSourceCode();
                    const comments = sourceCode.getCommentsBefore(depsArg);
                    const hasExhaustiveDepsComment = comments.some(comment =>
                      comment.value.includes('eslint-disable-next-line react-hooks/exhaustive-deps')
                    );

                    let fixes = [
                      fixer.replaceText(element, `stableHash(${element.name})`)
                    ];

                    // Add the import fix
                    fixes.push(importFix);

                    // Add eslint-disable comment if not already present
                    if (!hasExhaustiveDepsComment) {
                      // Find the line with the closing bracket of the callback function
                      const callbackArg = node.arguments[0];
                      if (callbackArg && (callbackArg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                                         callbackArg.type === AST_NODE_TYPES.FunctionExpression)) {
                        const callbackBody = callbackArg.body;
                        if (callbackBody.type === AST_NODE_TYPES.BlockStatement) {
                          const lastToken = sourceCode.getLastToken(callbackBody);
                          if (lastToken) {
                            const indentation = sourceCode.text.slice(
                              sourceCode.getIndexFromLoc({ line: lastToken.loc.start.line, column: 0 }),
                              sourceCode.getIndexFromLoc({ line: lastToken.loc.start.line, column: lastToken.loc.start.column })
                            );

                            fixes.push(
                              fixer.insertTextBefore(
                                lastToken,
                                `${indentation}  // eslint-disable-next-line react-hooks/exhaustive-deps\n${indentation}`
                              )
                            );
                          }
                        }
                      }
                    }

                    return fixes;
                  },
                });
              }
            }
          }
        });
      },
    };
  },
});
