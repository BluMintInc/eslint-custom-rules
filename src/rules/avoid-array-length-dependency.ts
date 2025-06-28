import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'avoidArrayLengthDependency';

const HOOK_NAMES = new Set([
  'useEffect',
  'useCallback',
  'useMemo',
  'useLayoutEffect',
]);

function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;

  // Handle direct hook calls (useEffect, useCallback, etc.)
  if (
    callee.type === AST_NODE_TYPES.Identifier &&
    HOOK_NAMES.has(callee.name)
  ) {
    return true;
  }

  // Handle React.useEffect, React.useCallback, etc.
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'React' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    HOOK_NAMES.has(callee.property.name)
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if a variable name suggests it's likely an array
 */
function isLikelyArrayVariable(name: string): boolean {
  // Common array naming patterns
  const arrayPatterns = [
    /items?\d*$/i, // items, item, items1, items2
    /list\d*$/i, // list, userList, list1
    /array\d*$/i, // array, dataArray, array1
    /collection\d*$/i, // collection, collection1
    /s\d*$/, // plural words (users, todos, etc.) with optional numbers
    /data\d*$/i, // data (often arrays), data1
    /results?\d*$/i, // result, results, results1
    /entries\d*$/i, // entries, entries1
    /values\d*$/i, // values, values1
    /elements?\d*$/i, // element, elements, elements1
    /nodes?\d*$/i, // node, nodes, nodes1
    /children\d*$/i, // children, children1
    /rows?\d*$/i, // row, rows, rows1
    /columns?\d*$/i, // column, columns, columns1
  ];

  return arrayPatterns.some((pattern) => pattern.test(name));
}

/**
 * Checks if a node is an array.length expression
 */
function isArrayLengthExpression(node: TSESTree.Node): boolean {
  let memberExpr: TSESTree.MemberExpression;

  // Handle optional chaining (ChainExpression wrapping MemberExpression)
  if (node.type === AST_NODE_TYPES.ChainExpression) {
    if (node.expression.type !== AST_NODE_TYPES.MemberExpression) {
      return false;
    }
    memberExpr = node.expression;
  } else if (node.type === AST_NODE_TYPES.MemberExpression) {
    memberExpr = node;
  } else {
    return false;
  }

  // Check if it's a property access with 'length'
  // Handle both dot notation (obj.length) and bracket notation (obj['length'])
  const isLengthProperty =
    (memberExpr.property.type === AST_NODE_TYPES.Identifier &&
      memberExpr.property.name === 'length') ||
    (memberExpr.property.type === AST_NODE_TYPES.Literal &&
      memberExpr.property.value === 'length');

  if (!isLengthProperty) {
    return false;
  }

  // Try to determine if this is likely an array based on variable naming
  if (memberExpr.object.type === AST_NODE_TYPES.Identifier) {
    const varName = memberExpr.object.name;

    // Skip common non-array variables
    if (
      [
        'text',
        'string',
        'str',
        'message',
        'content',
        'title',
        'name',
        'description',
        'customObj',
      ].includes(varName.toLowerCase())
    ) {
      return false;
    }

    // Check if it looks like an array variable
    return isLikelyArrayVariable(varName);
  }

  // For complex expressions (like data.items), assume it could be an array
  // This is a conservative approach - better to have some false positives than miss real issues
  return true;
}

/**
 * Gets the array name from an array.length expression
 */
function getArrayNameFromLengthExpression(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): string {
  let memberExpr: TSESTree.MemberExpression;

  // Handle optional chaining (ChainExpression wrapping MemberExpression)
  if (node.type === AST_NODE_TYPES.ChainExpression) {
    memberExpr = node.expression as TSESTree.MemberExpression;
  } else {
    memberExpr = node as TSESTree.MemberExpression;
  }

  // Get the array name (without the optional chaining syntax for the useMemo)
  if (memberExpr.object.type === AST_NODE_TYPES.Identifier) {
    return memberExpr.object.name;
  }

  // For more complex expressions, get the source code
  const objectText = sourceCode.getText(memberExpr.object);
  return objectText;
}

export const avoidArrayLengthDependency = createRule<[], MessageIds>({
  name: 'avoid-array-length-dependency',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid using array.length in dependency arrays of React hooks. Use stableHash(array) with useMemo instead.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      avoidArrayLengthDependency:
        'Avoid using {{arrayName}}.length in dependency arrays. Use a memoized hash of the array instead: const {{hashName}} = useMemo(() => stableHash({{arrayName}}), [{{arrayName}}])',
    },
  },
  defaultOptions: [],
  create(context) {
    const allLengthExpressions: Array<{
      element: TSESTree.Node;
      arrayName: string;
      hashName: string;
      hookNode: TSESTree.CallExpression;
    }> = [];

    return {
      CallExpression(node) {
        if (!isHookCall(node)) {
          return;
        }

        // Get the dependency array argument
        const depsArg = node.arguments[node.arguments.length - 1];
        if (!depsArg || depsArg.type !== AST_NODE_TYPES.ArrayExpression) {
          return;
        }

        // Find all array.length expressions in the dependency array
        const lengthExpressions: Array<{
          element: TSESTree.Node;
          arrayName: string;
          hashName: string;
        }> = [];

        depsArg.elements.forEach((element) => {
          if (!element) return; // Skip null elements (holes in the array)

          if (isArrayLengthExpression(element)) {
            const sourceCode = context.getSourceCode();
            const arrayName = getArrayNameFromLengthExpression(
              element,
              sourceCode,
            );
            const hashName = `${arrayName.replace(/[?\.]/g, '')}Hash`;

            lengthExpressions.push({
              element: element,
              arrayName,
              hashName,
            });

            // Add to global collection
            allLengthExpressions.push({
              element: element,
              arrayName,
              hashName,
              hookNode: node,
            });
          }
        });

        // Don't report here, we'll report in Program:exit to handle all violations together
      },

      'Program:exit'() {
        if (allLengthExpressions.length === 0) {
          return;
        }

        // Group expressions by unique array names to avoid duplicates
        const uniqueExpressions = new Map<string, {
          element: TSESTree.Node;
          arrayName: string;
          hashName: string;
          hookNode: TSESTree.CallExpression;
        }>();

        allLengthExpressions.forEach((expr) => {
          if (!uniqueExpressions.has(expr.arrayName)) {
            uniqueExpressions.set(expr.arrayName, expr);
          }
        });

        // Report each violation separately
        allLengthExpressions.forEach((expr, index) => {
          context.report({
            node: expr.element,
            messageId: 'avoidArrayLengthDependency',
            data: {
              arrayName: expr.arrayName,
              hashName: expr.hashName,
            },
            // Only apply fix on the first violation to avoid conflicts
            ...(index === 0 && {
              *fix(fixer) {
                const sourceCode = context.getSourceCode();

                // 1. Check for existing stableHash import
                const stableHashImports = sourceCode.ast.body.filter(
                  (node) =>
                    node.type === AST_NODE_TYPES.ImportDeclaration &&
                    node.source.value === 'functions/src/util/hash/stableHash',
                );

                if (stableHashImports.length === 0) {
                  // Add the stableHash import only if it doesn't exist
                  const stableHashImport =
                    "import { stableHash } from 'functions/src/util/hash/stableHash';\n";
                  yield fixer.insertTextBefore(sourceCode.ast, stableHashImport);
                }

                // 2. Add or update the React import for useMemo
                const reactImports = sourceCode.ast.body.filter(
                  (node) =>
                    node.type === AST_NODE_TYPES.ImportDeclaration &&
                    node.source.value === 'react',
                );

                if (reactImports.length > 0) {
                  // There's an existing React import
                  const reactImport =
                    reactImports[0] as TSESTree.ImportDeclaration;
                  const specifiers = reactImport.specifiers;

                  // Check if useMemo is already imported
                  const hasUseMemo = specifiers.some(
                    (spec) =>
                      spec.type === AST_NODE_TYPES.ImportSpecifier &&
                      spec.imported.name === 'useMemo',
                  );

                  if (!hasUseMemo) {
                    if (
                      specifiers.length === 1 &&
                      specifiers[0].type === AST_NODE_TYPES.ImportDefaultSpecifier
                    ) {
                      // If it's just a default import, add a named import
                      yield fixer.insertTextAfter(specifiers[0], ', { useMemo }');
                    } else {
                      // Add useMemo to the existing named imports
                      const lastSpecifier = specifiers[specifiers.length - 1];
                      yield fixer.insertTextAfter(
                        lastSpecifier,
                        specifiers.length > 0 ? ', useMemo' : 'useMemo',
                      );
                    }
                  }
                } else {
                  // No existing React import, add a new one
                  yield fixer.insertTextBefore(
                    sourceCode.ast,
                    "import { useMemo } from 'react';\n",
                  );
                }

                // 3. Create all the memoized hash variables
                // Find the first function/component body to insert the useMemo statements
                let insertionPoint: TSESTree.Node | null = null;
                for (const expr of uniqueExpressions.values()) {
                  let currentNode: TSESTree.Node = expr.hookNode;
                  while (currentNode.parent) {
                    const parent = currentNode.parent;
                    if (
                      parent.type === AST_NODE_TYPES.ExpressionStatement ||
                      parent.type === AST_NODE_TYPES.VariableDeclaration
                    ) {
                      insertionPoint = parent;
                      break;
                    }
                    currentNode = parent;
                  }
                  if (insertionPoint) break;
                }

                if (insertionPoint) {
                  // Insert all useMemo statements before the first hook
                  for (const expr of uniqueExpressions.values()) {
                    const useMemoStatement = `const ${expr.hashName} = useMemo(() => stableHash(${expr.arrayName}), [${expr.arrayName}]);\n  `;
                    yield fixer.insertTextBefore(insertionPoint, useMemoStatement);
                  }
                }

                // 4. Replace all array.length expressions with their hash variables
                for (const expr of allLengthExpressions) {
                  yield fixer.replaceText(expr.element, expr.hashName);
                }
              },
            }),
          });
        });
      },
    };
  },
});
