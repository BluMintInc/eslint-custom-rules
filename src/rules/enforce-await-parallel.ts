import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'sequentialAwaits';

export const enforceAwaitParallel = createRule<[], MessageIds>({
  name: 'enforce-await-parallel',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce parallelization of independent await calls',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      sequentialAwaits: 'Sequential await calls can be parallelized using Promise.all',
    },
  },
  defaultOptions: [],
  create(context) {
    function isAwaitExpression(node: TSESTree.Node): node is TSESTree.AwaitExpression {
      return node.type === AST_NODE_TYPES.AwaitExpression;
    }

    function getIdentifiersInNode(node: TSESTree.Node): Set<string> {
      const identifiers = new Set<string>();

      function visit(node: TSESTree.Node): void {
        if (node.type === AST_NODE_TYPES.Identifier) {
          identifiers.add(node.name);
        }
        for (const key of Object.keys(node)) {
          if (key === 'parent') continue;
          const child = (node as any)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              child.forEach(item => {
                if (item && typeof item === 'object') {
                  visit(item);
                }
              });
            } else if ('type' in child) {
              visit(child);
            }
          }
        }
      }

      visit(node);
      return identifiers;
    }

    function getDefinedIdentifiers(node: TSESTree.Node): Set<string> {
      const identifiers = new Set<string>();
      let current: TSESTree.Node | undefined = node;

      while (current) {
        if (current.type === AST_NODE_TYPES.VariableDeclarator && current.id.type === AST_NODE_TYPES.Identifier) {
          identifiers.add(current.id.name);
        }
        current = current.parent;
      }
      return identifiers;
    }

    function hasOverlappingIdentifiers(expr1: TSESTree.Node, expr2: TSESTree.Node): boolean {
      const ids2 = getIdentifiersInNode(expr2);
      const definedIds = getDefinedIdentifiers(expr1);

      // Check if expr2 uses any identifiers defined in expr1
      for (const id of ids2) {
        if (definedIds.has(id)) {
          return true;
        }
      }

      return false;
    }

    function areIndependentAwaits(awaitExpr1: TSESTree.AwaitExpression, awaitExpr2: TSESTree.AwaitExpression): boolean {
      // Check if expr2 depends on expr1
      if (hasOverlappingIdentifiers(awaitExpr1, awaitExpr2)) {
        return false;
      }

      // Check if expr1 depends on expr2
      if (hasOverlappingIdentifiers(awaitExpr2, awaitExpr1)) {
        return false;
      }

      return true;
    }

    function findSequentialAwaits(node: TSESTree.BlockStatement): TSESTree.AwaitExpression[][] {
      const sequentialGroups: TSESTree.AwaitExpression[][] = [];
      let currentGroup: TSESTree.AwaitExpression[] = [];

      for (let i = 0; i < node.body.length; i++) {
        const stmt = node.body[i];
        if (stmt.type === AST_NODE_TYPES.ExpressionStatement && isAwaitExpression(stmt.expression)) {
          if (currentGroup.length === 0) {
            currentGroup.push(stmt.expression);
          } else {
            const lastAwait = currentGroup[currentGroup.length - 1];
            if (areIndependentAwaits(lastAwait, stmt.expression)) {
              currentGroup.push(stmt.expression);
            } else {
              if (currentGroup.length > 1) {
                sequentialGroups.push([...currentGroup]);
              }
              currentGroup = [stmt.expression];
            }
          }
        } else if (stmt.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const decl of stmt.declarations) {
            if (decl.init && isAwaitExpression(decl.init)) {
              if (currentGroup.length === 0) {
                currentGroup.push(decl.init);
              } else {
                const lastAwait = currentGroup[currentGroup.length - 1];
                if (areIndependentAwaits(lastAwait, decl.init)) {
                  currentGroup.push(decl.init);
                } else {
                  if (currentGroup.length > 1) {
                    sequentialGroups.push([...currentGroup]);
                  }
                  currentGroup = [decl.init];
                }
              }
            }
          }
        } else {
          if (currentGroup.length > 1) {
            sequentialGroups.push([...currentGroup]);
          }
          currentGroup = [];
        }
      }

      if (currentGroup.length > 1) {
        sequentialGroups.push(currentGroup);
      }

      return sequentialGroups;
    }

    return {
      BlockStatement(node) {
        const sequentialGroups = findSequentialAwaits(node);
        for (const group of sequentialGroups) {
          context.report({
            node: group[0],
            messageId: 'sequentialAwaits',
            fix(fixer) {
              // This is a simplified fix that may not work in all cases
              // A more robust fix would need to handle variable declarations and complex expressions
              const sourceCode = context.getSourceCode();
              const statements = group.map(awaitExpr => {
                let parent = awaitExpr.parent;
                while (parent && parent.type !== AST_NODE_TYPES.ExpressionStatement && parent.type !== AST_NODE_TYPES.VariableDeclaration) {
                  parent = parent.parent;
                }
                return parent;
              });

              if (!statements.every(stmt => stmt)) {
                return null;
              }

              const firstStmt = statements[0]!;
              const lastStmt = statements[statements.length - 1]!;
              const fixRange: [number, number] = [firstStmt.range![0], lastStmt.range![1]];

              // Extract variable names and expressions
              const variables: string[] = [];
              const expressions: string[] = [];

              for (const awaitExpr of group) {
                let parent = awaitExpr.parent;
                while (parent && parent.type !== AST_NODE_TYPES.VariableDeclarator && parent.type !== AST_NODE_TYPES.ExpressionStatement) {
                  parent = parent.parent;
                }

                if (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) {
                  variables.push(parent.id.name);
                }

                if (awaitExpr.argument.range) {
                  expressions.push(sourceCode.getText().slice(awaitExpr.argument.range[0], awaitExpr.argument.range[1]));
                }
              }

              let fixText: string;
              if (variables.length > 0) {
                fixText = `const [${variables.join(', ')}] = await Promise.all([${expressions.join(', ')}]);`;
              } else {
                fixText = `await Promise.all([${expressions.join(', ')}]);`;
              }

              return fixer.replaceTextRange(fixRange, fixText);
            }
          });
        }
      }
    };
  },
});
