import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'avoidArrayLengthDependency';

const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier && HOOK_NAMES.has(callee.name)
  );
}

/**
 * Checks if a node is an array.length expression
 */
function isArrayLengthExpression(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }

  // Check if it's a property access with 'length'
  if (
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === 'length'
  ) {
    return true;
  }

  return false;
}

/**
 * Gets the array name from an array.length expression
 */
function getArrayNameFromLengthExpression(node: TSESTree.MemberExpression): string {
  // Handle optional chaining
  const hasOptionalChaining = node.optional;

  // Get the array name
  if (node.object.type === AST_NODE_TYPES.Identifier) {
    return hasOptionalChaining
      ? `${node.object.name}?`
      : node.object.name;
  }

  // For more complex expressions, get the source code
  return 'array'; // Fallback
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
          element: TSESTree.MemberExpression;
          arrayName: string;
          hashName: string;
        }> = [];

        depsArg.elements.forEach((element) => {
          if (!element) return; // Skip null elements (holes in the array)

          if (isArrayLengthExpression(element)) {
            const memberExpr = element as TSESTree.MemberExpression;
            const arrayName = getArrayNameFromLengthExpression(memberExpr);
            const hashName = `${arrayName.replace(/[?\.]/g, '')}Hash`;

            lengthExpressions.push({
              element: memberExpr,
              arrayName,
              hashName,
            });
          }
        });

        // If we found any array.length expressions, report and fix them
        if (lengthExpressions.length > 0) {
          // Report on the first one, but fix all of them
          const firstExpr = lengthExpressions[0];

          context.report({
            node: firstExpr.element,
            messageId: 'avoidArrayLengthDependency',
            data: {
              arrayName: firstExpr.arrayName,
              hashName: firstExpr.hashName,
            },
            *fix(fixer) {
              const sourceCode = context.getSourceCode();

              // 1. Add the stableHash import
              const stableHashImport = "import { stableHash } from 'functions/src/util/hash/stableHash';\n";
              yield fixer.insertTextBefore(sourceCode.ast, stableHashImport);

              // 2. Add or update the React import for useMemo
              const reactImports = sourceCode.ast.body.filter(
                (node) =>
                  node.type === AST_NODE_TYPES.ImportDeclaration &&
                  node.source.value === 'react'
              );

              if (reactImports.length > 0) {
                // There's an existing React import
                const reactImport = reactImports[0] as TSESTree.ImportDeclaration;
                const specifiers = reactImport.specifiers;

                // Check if useMemo is already imported
                const hasUseMemo = specifiers.some(
                  (spec) =>
                    spec.type === AST_NODE_TYPES.ImportSpecifier &&
                    spec.imported.name === 'useMemo'
                );

                if (!hasUseMemo) {
                  if (specifiers.length === 1 && specifiers[0].type === AST_NODE_TYPES.ImportDefaultSpecifier) {
                    // If it's just a default import, add a named import
                    yield fixer.insertTextAfter(
                      specifiers[0],
                      ', { useMemo }'
                    );
                  } else {
                    // Add useMemo to the existing named imports
                    const lastSpecifier = specifiers[specifiers.length - 1];
                    yield fixer.insertTextAfter(
                      lastSpecifier,
                      specifiers.length > 0 ? ', useMemo' : 'useMemo'
                    );
                  }
                }
              } else {
                // No existing React import, add a new one
                yield fixer.insertTextBefore(
                  sourceCode.ast,
                  "import { useMemo } from 'react';\n"
                );
              }

              // 3. Create all the memoized hash variables
              let useMemoStatements = '';
              for (const expr of lengthExpressions) {
                useMemoStatements += `const ${expr.hashName} = useMemo(() => stableHash(${expr.arrayName}), [${expr.arrayName}]);\n  `;
              }

              // Insert all useMemo statements before the hook call
              yield fixer.insertTextBefore(node, useMemoStatements);

              // 4. Replace all array.length expressions with their hash variables
              for (const expr of lengthExpressions) {
                yield fixer.replaceText(expr.element, expr.hashName);
              }
            },
          });
        }
      },
    };
  },
});
