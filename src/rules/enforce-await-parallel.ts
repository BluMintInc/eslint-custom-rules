/* eslint-disable @typescript-eslint/no-explicit-any */
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
    schema: [],
    messages: {
      sequentialAwaits:
        'Sequential await calls can be parallelized using Promise.all',
    },
  },
  defaultOptions: [],
  create(context) {
    function isAwaitExpression(
      node: TSESTree.Node,
    ): node is TSESTree.AwaitExpression {
      return node.type === AST_NODE_TYPES.AwaitExpression;
    }

    function getIdentifiersInNode(node: TSESTree.Node): Set<string> {
      const identifiers = new Set<string>();

      function visit(node: TSESTree.Node): void {
        if (node.type === AST_NODE_TYPES.Identifier) {
          identifiers.add(node.name);
        } else if (node.type === AST_NODE_TYPES.MemberExpression) {
          // For member expressions like obj.prop, we need to track the base object
          const objChain: string[] = [];
          let current: TSESTree.Node = node;

          while (current.type === AST_NODE_TYPES.MemberExpression) {
            if (current.property.type === AST_NODE_TYPES.Identifier) {
              objChain.unshift(current.property.name);
            }
            current = current.object;
          }

          if (current.type === AST_NODE_TYPES.Identifier) {
            // Add both the full chain and the base identifier
            identifiers.add(current.name);
            objChain.unshift(current.name);
            identifiers.add(objChain.join('.'));
          }
        }

        for (const key of Object.keys(node)) {
          if (key === 'parent') continue;
          const child = (node as any)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              child.forEach((item) => {
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
        if (current.type === AST_NODE_TYPES.VariableDeclarator) {
          if (current.id.type === AST_NODE_TYPES.Identifier) {
            identifiers.add(current.id.name);
          } else if (current.id.type === AST_NODE_TYPES.ObjectPattern) {
            // Handle destructuring patterns
            const addNestedIdentifiers = (pattern: TSESTree.Node) => {
              if (pattern.type === AST_NODE_TYPES.Identifier) {
                identifiers.add(pattern.name);
              } else if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
                pattern.properties.forEach((prop) => {
                  if (prop.type === AST_NODE_TYPES.Property) {
                    addNestedIdentifiers(prop.value);
                  }
                });
              }
            };
            addNestedIdentifiers(current.id);
          }
        }
        current = current.parent;
      }
      return identifiers;
    }

    function hasOverlappingIdentifiers(
      expr1: TSESTree.Node,
      expr2: TSESTree.Node,
    ): boolean {
      const ids2 = getIdentifiersInNode(expr2);
      const definedIds = getDefinedIdentifiers(expr1);

      // Find all identifiers that are mutated or used between expr1 and expr2
      const mutatedIds = new Set<string>();
      const usedIds = new Set<string>();

      // First, find the block statement that contains both expressions
      const blockStmt = findCommonBlockStatement(expr1, expr2);
      if (!blockStmt) return true; // If no common block found, assume dependency

      // Then find all statements between expr1 and expr2
      const stmts = getStatementsBetween(blockStmt, expr1, expr2);

      // Check each statement for mutations and usage
      for (const stmt of stmts) {
        function visitForMutations(node: TSESTree.Node): void {
          if (node.type === AST_NODE_TYPES.AssignmentExpression) {
            const leftIds = getIdentifiersInNode(node.left);
            leftIds.forEach((id) => mutatedIds.add(id));
            const rightIds = getIdentifiersInNode(node.right);
            rightIds.forEach((id) => usedIds.add(id));
          } else if (node.type === AST_NODE_TYPES.UpdateExpression) {
            const argIds = getIdentifiersInNode(node.argument);
            argIds.forEach((id) => mutatedIds.add(id));
          } else if (node.type === AST_NODE_TYPES.CallExpression) {
            // If an identifier is passed to a function, consider it potentially mutated
            node.arguments.forEach((arg) => {
              const argIds = getIdentifiersInNode(arg);
              argIds.forEach((id) => {
                mutatedIds.add(id);
                usedIds.add(id);
              });
            });
          } else if (node.type === AST_NODE_TYPES.MemberExpression) {
            const objIds = getIdentifiersInNode(node.object);
            objIds.forEach((id) => usedIds.add(id));
          } else if (node.type === AST_NODE_TYPES.VariableDeclarator) {
            if (node.id.type === AST_NODE_TYPES.Identifier) {
              mutatedIds.add(node.id.name);
            }
            if (node.init) {
              const initIds = getIdentifiersInNode(node.init);
              initIds.forEach((id) => usedIds.add(id));
            }
          }

          for (const key of Object.keys(node)) {
            if (key === 'parent') continue;
            const child = (node as any)[key];
            if (child && typeof child === 'object') {
              if (Array.isArray(child)) {
                child.forEach((item) => {
                  if (item && typeof item === 'object') {
                    visitForMutations(item);
                  }
                });
              } else if ('type' in child) {
                visitForMutations(child);
              }
            }
          }
        }

        visitForMutations(stmt);
      }

      // Check if expr2 uses any identifiers that were defined, mutated, or used
      for (const id of ids2) {
        if (definedIds.has(id) || mutatedIds.has(id) || usedIds.has(id)) {
          return true;
        }
        // Check if any part of a property chain matches
        for (const definedId of definedIds) {
          if (id.startsWith(definedId + '.')) {
            return true;
          }
        }
        for (const mutatedId of mutatedIds) {
          if (id.startsWith(mutatedId + '.')) {
            return true;
          }
        }
        for (const usedId of usedIds) {
          if (id.startsWith(usedId + '.')) {
            return true;
          }
        }
      }

      return false;
    }

    function findCommonBlockStatement(
      node1: TSESTree.Node,
      node2: TSESTree.Node,
    ): TSESTree.BlockStatement | null {
      const blocks1: TSESTree.BlockStatement[] = [];
      let current: TSESTree.Node | null = node1;
      while (current) {
        if (current.type === AST_NODE_TYPES.BlockStatement) {
          blocks1.push(current);
        }
        current = current.parent || null;
      }

      current = node2;
      while (current) {
        if (current.type === AST_NODE_TYPES.BlockStatement) {
          if (blocks1.includes(current)) {
            return current;
          }
        }
        current = current.parent || null;
      }

      return null;
    }

    function getStatementsBetween(
      block: TSESTree.BlockStatement,
      start: TSESTree.Node,
      end: TSESTree.Node,
    ): TSESTree.Statement[] {
      const result: TSESTree.Statement[] = [];
      let inRange = false;

      for (const stmt of block.body) {
        if (containsNode(stmt, start)) {
          inRange = true;
          continue;
        }
        if (containsNode(stmt, end)) {
          break;
        }
        if (inRange) {
          result.push(stmt);
        }
      }

      return result;
    }

    function containsNode(
      parent: TSESTree.Node,
      target: TSESTree.Node,
    ): boolean {
      if (parent === target) return true;

      for (const key of Object.keys(parent)) {
        if (key === 'parent') continue;
        const child = (parent as any)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (
                item &&
                typeof item === 'object' &&
                containsNode(item, target)
              ) {
                return true;
              }
            }
          } else if ('type' in child && containsNode(child, target)) {
            return true;
          }
        }
      }

      return false;
    }

    function areIndependentAwaits(
      awaitExpr1: TSESTree.AwaitExpression,
      awaitExpr2: TSESTree.AwaitExpression,
    ): boolean {
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

    function findSequentialAwaits(
      node: TSESTree.BlockStatement,
    ): TSESTree.AwaitExpression[][] {
      const sequentialGroups: TSESTree.AwaitExpression[][] = [];
      let currentGroup: TSESTree.AwaitExpression[] = [];

      function getAwaitFromNode(
        node: TSESTree.Node,
      ): TSESTree.AwaitExpression | null {
        if (isAwaitExpression(node)) {
          return node;
        }
        if (
          node.type === AST_NODE_TYPES.ChainExpression &&
          isAwaitExpression(node.expression)
        ) {
          return node.expression;
        }
        if (node.type === AST_NODE_TYPES.CallExpression) {
          const callee = node.callee;
          if (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            isAwaitExpression(callee.object)
          ) {
            return callee.object;
          }
        }
        return null;
      }

      for (let i = 0; i < node.body.length; i++) {
        const stmt = node.body[i];
        let currentAwait: TSESTree.AwaitExpression | null = null;

        if (stmt.type === AST_NODE_TYPES.ExpressionStatement) {
          currentAwait = getAwaitFromNode(stmt.expression);
        } else if (stmt.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const decl of stmt.declarations) {
            if (decl.init) {
              currentAwait = getAwaitFromNode(decl.init);
              if (currentAwait) break;
            }
          }
        }

        if (currentAwait) {
          if (currentGroup.length === 0) {
            currentGroup.push(currentAwait);
          } else {
            const lastAwait = currentGroup[currentGroup.length - 1];
            if (areIndependentAwaits(lastAwait, currentAwait)) {
              currentGroup.push(currentAwait);
            } else {
              if (currentGroup.length > 1) {
                sequentialGroups.push([...currentGroup]);
              }
              currentGroup = [currentAwait];
            }
          }
        } else if (stmt.type === AST_NODE_TYPES.ExpressionStatement) {
          // Allow non-await expressions between awaits
          continue;
        } else {
          // For any other statement type, close the current group
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
          });
        }
      },
    };
  },
});
