/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

export = createRule<[], 'callbackFunctionSuffix'>({
  name: 'no-handler-suffix',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce descriptive naming by preventing the use of "handler" suffix in callback function names',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      callbackFunctionSuffix:
        'Avoid using "handler" suffix in function names. Use descriptive, action-oriented names instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Checks if a string ends with "handler" or "Handler" (case-insensitive)
     */
    function hasHandlerSuffix(name: string): boolean {
      return /[hH]andler$/.test(name);
    }

    /**
     * Suggests a better name by removing the "handler" suffix
     */
    function suggestBetterName(name: string): string {
      // Remove the "handler" or "Handler" suffix
      return name.replace(/[hH]andler$/, '');
    }

    return {
      // Check function declarations
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        const functionName = node.id?.name;

        if (functionName && hasHandlerSuffix(functionName) && node.id) {
          // Get all references to this variable
          const scope = context.getScope();
          const variable = scope.variables.find((v) => v.name === functionName);
          const references = new Set(variable?.references ?? []);

          // Get references from all scopes
          const allScopes = [scope];
          let currentScope = scope;
          while (currentScope.upper) {
            currentScope = currentScope.upper;
            allScopes.push(currentScope);
          }

          // Get references from all scopes and their children
          for (const s of allScopes) {
            // Get references from current scope
            const currentVar = s.variables.find((v) => v.name === functionName);
            if (currentVar) {
              currentVar.references.forEach((ref) => references.add(ref));
            }

            // Get references from child scopes
            const childScopes = s.childScopes;
            for (const childScope of childScopes) {
              const childVar = childScope.variables.find(
                (v) => v.name === functionName,
              );
              if (childVar) {
                childVar.references.forEach((ref) => references.add(ref));
              }
            }
          }

          // Get references from sibling scopes
          const siblingScopes = scope.upper?.childScopes ?? [];
          for (const siblingScope of siblingScopes) {
            if (siblingScope !== scope) {
              const siblingVar = siblingScope.variables.find(
                (v) => v.name === functionName,
              );
              if (siblingVar) {
                siblingVar.references.forEach((ref) => references.add(ref));
              }
            }
          }

          // Get references from global scope
          const sourceCode = context.getSourceCode();
          if (sourceCode.scopeManager?.globalScope) {
            const globalVar =
              sourceCode.scopeManager.globalScope.variables.find(
                (v) => v.name === functionName,
              );
            if (globalVar) {
              globalVar.references.forEach((ref) => references.add(ref));
            }
          }

          context.report({
            node,
            messageId: 'callbackFunctionSuffix',
            fix(fixer) {
              const newName = suggestBetterName(functionName);

              // Fix the declaration and all references
              const fixes: Array<
                import('@typescript-eslint/utils').TSESLint.RuleFix
              > = [];
              fixes.push(fixer.replaceText(node.id!, newName));
              for (const ref of references) {
                if (ref.identifier !== node.id) {
                  fixes.push(fixer.replaceText(ref.identifier, newName));
                }
              }
              return fixes;
            },
          });
        }
      },

      // Check variable declarations with function expressions or arrow functions
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        const variableName = node.id.type === 'Identifier' ? node.id.name : undefined;

        if (
          variableName &&
          hasHandlerSuffix(variableName) &&
          (node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
           node.init?.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          // Get all references to this variable
          const scope = context.getScope();
          const variable = scope.variables.find((v) => v.name === variableName);
          const references = new Set(variable?.references ?? []);

          // Get references from all scopes
          const allScopes = [scope];
          let currentScope = scope;
          while (currentScope.upper) {
            currentScope = currentScope.upper;
            allScopes.push(currentScope);
          }

          // Get references from all scopes and their children
          for (const s of allScopes) {
            // Get references from current scope
            const currentVar = s.variables.find((v) => v.name === variableName);
            if (currentVar) {
              currentVar.references.forEach((ref) => references.add(ref));
            }

            // Get references from child scopes
            const childScopes = s.childScopes;
            for (const childScope of childScopes) {
              const childVar = childScope.variables.find(
                (v) => v.name === variableName,
              );
              if (childVar) {
                childVar.references.forEach((ref) => references.add(ref));
              }
            }
          }

          // Get references from sibling scopes
          const siblingScopes = scope.upper?.childScopes ?? [];
          for (const siblingScope of siblingScopes) {
            if (siblingScope !== scope) {
              const siblingVar = siblingScope.variables.find(
                (v) => v.name === variableName,
              );
              if (siblingVar) {
                siblingVar.references.forEach((ref) => references.add(ref));
              }
            }
          }

          // Get references from global scope
          const sourceCode = context.getSourceCode();
          if (sourceCode.scopeManager?.globalScope) {
            const globalVar =
              sourceCode.scopeManager.globalScope.variables.find(
                (v) => v.name === variableName,
              );
            if (globalVar) {
              globalVar.references.forEach((ref) => references.add(ref));
            }
          }

          context.report({
            node,
            messageId: 'callbackFunctionSuffix',
            fix(fixer) {
              const newName = suggestBetterName(variableName);

              // Fix the declaration and all references
              const fixes: Array<
                import('@typescript-eslint/utils').TSESLint.RuleFix
              > = [];
              fixes.push(fixer.replaceText(node.id, newName));
              for (const ref of references) {
                if (ref.identifier !== node.id) {
                  fixes.push(fixer.replaceText(ref.identifier, newName));
                }
              }
              return fixes;
            },
          });
        }
      },

      // Check class methods and object methods
      'MethodDefinition, Property'(
        node: TSESTree.MethodDefinition | TSESTree.Property,
      ) {
        if (
          node.key.type === 'Identifier' &&
          node.key.name &&
          hasHandlerSuffix(node.key.name)
        ) {
          const name = node.key.name;

          // Skip autofixing for class parameters and getters
          if (node.type === 'MethodDefinition' && node.kind === 'get') {
            context.report({
              node: node.key,
              messageId: 'callbackFunctionSuffix',
            });
            return;
          }

          context.report({
            node: node.key,
            messageId: 'callbackFunctionSuffix',
            fix(fixer) {
              const newName = suggestBetterName(name);
              return fixer.replaceText(node.key, newName);
            },
          });
        }
      },

      // Check constructor parameters
      TSParameterProperty(node: TSESTree.TSParameterProperty) {
        if (
          node.parameter.type === 'Identifier' &&
          hasHandlerSuffix(node.parameter.name)
        ) {
          context.report({
            node,
            messageId: 'callbackFunctionSuffix',
          });
        }
      },
    };
  },
});
