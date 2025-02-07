import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'scopeOutOfOrder';

const REACT_HOOKS_PREFIX = 'use';

function isReactHook(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const callee = node.callee;
    if (callee.type === AST_NODE_TYPES.Identifier) {
      return callee.name.startsWith(REACT_HOOKS_PREFIX);
    }
  }
  return false;
}

function hasReactHookDependency(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.VariableDeclaration) {
    for (const declaration of node.declarations) {
      if (declaration.init && isReactHook(declaration.init)) {
        return true;
      }
    }
  }
  return false;
}

function hasSideEffects(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.UpdateExpression) {
    return true;
  }
  return false;
}

function getReferencedIdentifiers(node: TSESTree.Node): Set<string> {
  const identifiers = new Set<string>();

  function visit(node: TSESTree.Node) {
    if (node.type === AST_NODE_TYPES.Identifier) {
      identifiers.add(node.name);
    }
    for (const key in node) {
      const value = (node as any)[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (item && typeof item === 'object') {
              visit(item);
            }
          });
        } else if (value.type) {
          visit(value);
        }
      }
    }
  }

  visit(node);
  return identifiers;
}

function getDeclaredIdentifiers(node: TSESTree.Node): Set<string> {
  const identifiers = new Set<string>();

  if (node.type === AST_NODE_TYPES.VariableDeclaration) {
    for (const declaration of node.declarations) {
      if (declaration.id.type === AST_NODE_TYPES.Identifier) {
        identifiers.add(declaration.id.name);
      } else if (declaration.id.type === AST_NODE_TYPES.ObjectPattern) {
        for (const property of declaration.id.properties) {
          if (property.type === AST_NODE_TYPES.Property &&
              property.value.type === AST_NODE_TYPES.Identifier) {
            identifiers.add(property.value.name);
          }
        }
      }
    }
  }

  return identifiers;
}

export const scopesReadTopToBottom = createRule<[], MessageIds>({
  name: 'scopes-read-top-to-bottom',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce a top-to-bottom ordering for scopes in the code',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      scopeOutOfOrder: 'This declaration depends on variables defined below. Move it after its dependencies.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      BlockStatement(node) {
        const statements = node.body.filter(
          stmt => stmt.type === AST_NODE_TYPES.VariableDeclaration
        ) as TSESTree.VariableDeclaration[];

        for (let i = 0; i < statements.length; i++) {
          const currentStmt = statements[i];

          // Skip React hooks - they must maintain their order
          if (hasReactHookDependency(currentStmt)) {
            continue;
          }

          const currentRefs = getReferencedIdentifiers(currentStmt);

          // Check if any referenced identifiers are declared in later statements
          for (let j = i + 1; j < statements.length; j++) {
            const laterStmt = statements[j];
            const laterDecls = getDeclaredIdentifiers(laterStmt);

            for (const ref of currentRefs) {
              if (laterDecls.has(ref)) {
                // Don't report if the later statement has side effects
                let hasSideEffectsInBetween = false;
                for (let k = i + 1; k < j; k++) {
                  if (hasSideEffects(statements[k])) {
                    hasSideEffectsInBetween = true;
                    break;
                  }
                }

                if (!hasSideEffectsInBetween) {
                  context.report({
                    node: currentStmt,
                    messageId: 'scopeOutOfOrder',
                    fix(fixer) {
                      // Only fix if there are no side effects between the statements
                      const sourceCode = context.getSourceCode();
                      const currentText = sourceCode.getText(currentStmt);
                      const laterText = sourceCode.getText(laterStmt);

                      return [
                        fixer.replaceText(currentStmt, laterText),
                        fixer.replaceText(laterStmt, currentText),
                      ];
                    },
                  });
                }
              }
            }
          }
        }
      },
    };
  },
});
