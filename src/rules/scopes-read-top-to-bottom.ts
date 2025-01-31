import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'scopesReadTopToBottom';

function getDependencies(node: TSESTree.Node): Set<string> {
  const dependencies = new Set<string>();

  function visit(node: TSESTree.Node) {
    if (node.type === AST_NODE_TYPES.Identifier) {
      dependencies.add(node.name);
    } else if (node.type === AST_NODE_TYPES.BinaryExpression) {
      visit(node.left);
      visit(node.right);
    }
  }

  visit(node);
  return dependencies;
}

function getDeclarationNames(node: TSESTree.Node): Set<string> {
  const names = new Set<string>();

  function visit(node: TSESTree.Node) {
    if (node.type === AST_NODE_TYPES.Identifier) {
      names.add(node.name);
    } else if (node.type === AST_NODE_TYPES.ArrayPattern) {
      node.elements.forEach(element => {
        if (element && element.type === AST_NODE_TYPES.Identifier) {
          names.add(element.name);
        }
      });
    }
  }

  visit(node);
  return names;
}

export const scopesReadTopToBottom = createRule<[], MessageIds>({
  name: 'scopes-read-top-to-bottom',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce a top-to-bottom ordering for scopes in the code',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [],
    messages: {
      scopesReadTopToBottom:
        'Variables and function calls should be arranged such that dependencies appear before the code that relies on them',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      VariableDeclaration(node) {
        node.declarations.forEach(decl => {
          if (decl.init) {
            const deps = getDependencies(decl.init);
            const sourceCode = context.getSourceCode();
            const program = sourceCode.ast;
            let foundAllDependencies = true;

            deps.forEach(dep => {
              let foundDep = false;
              for (const stmt of program.body) {
                if (stmt === node) break;
                if (stmt.type === AST_NODE_TYPES.VariableDeclaration) {
                  const declaredNames = stmt.declarations.reduce((names, d) => {
                    getDeclarationNames(d.id).forEach(name => names.add(name));
                    return names;
                  }, new Set<string>());
                  if (declaredNames.has(dep)) {
                    foundDep = true;
                    break;
                  }
                }
              }
              if (!foundDep) {
                foundAllDependencies = false;
              }
            });

            if (!foundAllDependencies) {
              context.report({
                node,
                messageId: 'scopesReadTopToBottom',
              });
            }
          }
        });
      },
    };
  },
});
