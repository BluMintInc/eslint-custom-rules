import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'logicalGrouping';

export const enforceLogicalGrouping = createRule<[], MessageIds>({
  name: 'enforce-logical-grouping',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce logical top-to-bottom grouping of code for better readability',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      logicalGrouping: 'Related code should be grouped together logically from top to bottom',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    function isReactHook(node: TSESTree.Node): boolean {
      if (node.type !== AST_NODE_TYPES.CallExpression) return false;
      const callee = node.callee;
      if (callee.type !== AST_NODE_TYPES.Identifier) return false;
      return callee.name.startsWith('use');
    }

    function isEarlyReturn(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.IfStatement &&
        node.consequent.type === AST_NODE_TYPES.BlockStatement &&
        node.consequent.body.length === 1 &&
        node.consequent.body[0].type === AST_NODE_TYPES.ReturnStatement
      );
    }

    function getDeclarationDependencies(node: TSESTree.VariableDeclaration): Set<string> {
      const dependencies = new Set<string>();
      const identifiers = new Set<string>();

      // First pass: collect all identifiers being declared
      node.declarations.forEach(decl => {
        if (decl.id.type === AST_NODE_TYPES.Identifier) {
          identifiers.add(decl.id.name);
        }
      });

      // Second pass: collect dependencies from the init expressions
      node.declarations.forEach(decl => {
        if (!decl.init) return;

        function visit(node: TSESTree.Node) {
          if (node.type === AST_NODE_TYPES.Identifier && !identifiers.has(node.name)) {
            dependencies.add(node.name);
          }

          for (const key in node) {
            const value = node[key as keyof typeof node];
            if (value && typeof value === 'object') {
              if (Array.isArray(value)) {
                value.forEach(item => {
                  if (item && typeof item === 'object') {
                    visit(item);
                  }
                });
              } else if ('type' in value) {
                visit(value);
              }
            }
          }
        }

        visit(decl.init);
      });

      return dependencies;
    }

    return {
      Program(node) {
        const statements = node.body;
        const declarationMap = new Map<string, TSESTree.VariableDeclaration>();
        const dependencyGraph = new Map<TSESTree.VariableDeclaration, Set<string>>();
        const earlyReturns: TSESTree.IfStatement[] = [];
        const hooks: TSESTree.Node[] = [];

        // First pass: collect declarations, early returns, and hooks
        statements.forEach(stmt => {
          if (stmt.type === AST_NODE_TYPES.VariableDeclaration) {
            stmt.declarations.forEach(decl => {
              if (decl.id.type === AST_NODE_TYPES.Identifier) {
                declarationMap.set(decl.id.name, stmt);
              }
            });
            dependencyGraph.set(stmt, getDeclarationDependencies(stmt));
          } else if (isEarlyReturn(stmt)) {
            earlyReturns.push(stmt as TSESTree.IfStatement);
          } else if (stmt.type === AST_NODE_TYPES.ExpressionStatement &&
                     stmt.expression.type === AST_NODE_TYPES.CallExpression &&
                     isReactHook(stmt.expression)) {
            hooks.push(stmt);
          }
        });

        // Check for logical grouping issues
        statements.forEach((stmt, index) => {
          if (index === 0) return; // Skip first statement

          // Skip hooks - they must maintain their order
          if (hooks.includes(stmt)) return;

          // Early returns should be at the top
          if (earlyReturns.length > 0 && !earlyReturns.includes(stmt as TSESTree.IfStatement)) {
            const lastEarlyReturn = earlyReturns[earlyReturns.length - 1];
            const earlyReturnIndex = statements.indexOf(lastEarlyReturn);
            if (index < earlyReturnIndex) {
              context.report({
                node: stmt,
                messageId: 'logicalGrouping',
                fix(fixer) {
                  const stmtText = sourceCode.getText(stmt);
                  const lastEarlyReturnEnd = sourceCode.getTokenAfter(lastEarlyReturn)!;
                  return fixer.insertTextAfter(lastEarlyReturnEnd, '\n\n' + stmtText);
                },
              });
            }
          }

          // Check declaration dependencies
          if (stmt.type === AST_NODE_TYPES.VariableDeclaration) {
            const dependencies = dependencyGraph.get(stmt)!;
            for (const dep of dependencies) {
              const depDecl = declarationMap.get(dep);
              if (depDecl && statements.indexOf(depDecl) > index) {
                context.report({
                  node: stmt,
                  messageId: 'logicalGrouping',
                  fix(fixer) {
                    const stmtText = sourceCode.getText(stmt);
                    const depDeclEnd = sourceCode.getTokenAfter(depDecl)!;
                    return fixer.insertTextAfter(depDeclEnd, '\n' + stmtText);
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
