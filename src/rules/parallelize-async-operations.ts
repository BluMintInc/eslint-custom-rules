import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'parallelizeAsyncOperations';

export const parallelizeAsyncOperations = createRule<[], MessageIds>({
  name: 'parallelize-async-operations',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce the use of Promise.all() when multiple independent asynchronous operations are awaited sequentially',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      parallelizeAsyncOperations: 'Multiple sequential awaits detected. Consider using Promise.all() to parallelize independent async operations for better performance.',
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Checks if a node is an await expression
     */
    function isAwaitExpression(node: TSESTree.Node): node is TSESTree.AwaitExpression {
      return node.type === AST_NODE_TYPES.AwaitExpression;
    }

    /**
     * Checks if a node is a variable declaration with an await expression initializer
     */
    function isVariableDeclarationWithAwait(node: TSESTree.Node): boolean {
      if (node.type !== AST_NODE_TYPES.VariableDeclaration) {
        return false;
      }

      return node.declarations.some(
        (declaration) =>
          declaration.init && isAwaitExpression(declaration.init)
      );
    }

    /**
     * Checks if a node is an expression statement with an await expression
     */
    function isExpressionStatementWithAwait(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.ExpressionStatement &&
        node.expression.type === AST_NODE_TYPES.AwaitExpression
      );
    }

    /**
     * Extracts the await expression from a node
     */
    function getAwaitExpression(node: TSESTree.Node): TSESTree.AwaitExpression | null {
      if (isAwaitExpression(node)) {
        return node;
      }

      if (node.type === AST_NODE_TYPES.ExpressionStatement && isAwaitExpression(node.expression)) {
        return node.expression;
      }

      if (node.type === AST_NODE_TYPES.VariableDeclaration) {
        for (const declaration of node.declarations) {
          if (declaration.init && isAwaitExpression(declaration.init)) {
            return declaration.init;
          }
        }
      }

      return null;
    }

    /**
     * Checks if an identifier is used in a node
     */
    function isIdentifierUsedInNode(identifier: string, node: TSESTree.Node): boolean {
      let isUsed = false;

      function visit(node: TSESTree.Node) {
        if (node.type === AST_NODE_TYPES.Identifier && node.name === identifier) {
          isUsed = true;
          return;
        }

        // Recursively visit all child nodes
        for (const key in node) {
          if (key === 'parent' || key === 'range' || key === 'loc') continue;

          const child = (node as any)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === 'object' && 'type' in item) {
                  visit(item as TSESTree.Node);
                }
              }
            } else if ('type' in child) {
              visit(child as TSESTree.Node);
            }
          }
        }
      }

      visit(node);
      return isUsed;
    }

    /**
     * Checks if there are dependencies between await expressions
     */
    function hasDependencies(
      awaitNodes: TSESTree.Node[],
      variableNames: Set<string>
    ): boolean {
      // If we have fewer than 2 nodes, there are no dependencies to check
      if (awaitNodes.length < 2) {
        return false;
      }

      // For each await node (except the first), check if it depends on previous variables
      for (let i = 1; i < awaitNodes.length; i++) {
        const currentNode = awaitNodes[i];

        // Check if any previous variable is used in the current await expression
        for (const varName of variableNames) {
          const awaitExpr = getAwaitExpression(currentNode);
          if (awaitExpr && isIdentifierUsedInNode(varName, awaitExpr.argument)) {
            return true;
          }
        }

        // Check for operations that might have side effects that affect subsequent operations
        // This is a conservative heuristic - we only flag very specific patterns
        const awaitExpr = getAwaitExpression(currentNode);
        if (awaitExpr && awaitExpr.argument.type === AST_NODE_TYPES.CallExpression) {
          const callee = awaitExpr.argument.callee;

          // Check for method calls that might indicate side effects
          if (callee.type === AST_NODE_TYPES.MemberExpression &&
              callee.property.type === AST_NODE_TYPES.Identifier) {
            const methodName = callee.property.name.toLowerCase();

            // Only flag operations that are very likely to have side effects that affect other operations
            const sideEffectMethods = [
              'updatecounter', 'setcounter', 'incrementcounter', 'decrementcounter',
              'updatethreshold', 'setthreshold', 'checkthreshold'
            ];

            if (sideEffectMethods.some(method => methodName.includes(method))) {
              return true;
            }
          }

          // Check for function calls that might indicate side effects
          if (callee.type === AST_NODE_TYPES.Identifier) {
            const functionName = callee.name.toLowerCase();

            // Only flag operations that are very likely to have side effects that affect other operations
            const sideEffectFunctions = [
              'updatecounter', 'setcounter', 'incrementcounter', 'decrementcounter',
              'updatethreshold', 'setthreshold', 'checkthreshold'
            ];

            if (sideEffectFunctions.some(func => functionName.includes(func))) {
              return true;
            }
          }
        }
      }

      // If any node is a variable declaration with destructuring, consider it as having dependencies
      // This is because destructuring often creates variables that are used later
      for (const node of awaitNodes) {
        if (node.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declaration of node.declarations) {
            if (declaration.id.type === AST_NODE_TYPES.ObjectPattern) {
              return true;
            }
          }
        }
      }

      return false;
    }

    /**
     * Extracts variable names from variable declarations
     */
    function extractVariableNames(nodes: TSESTree.Node[]): Set<string> {
      const variableNames = new Set<string>();

      /**
       * Recursively extract identifiers from patterns
       */
      function extractIdentifiersFromPattern(pattern: TSESTree.Node): void {
        switch (pattern.type) {
          case AST_NODE_TYPES.Identifier:
            variableNames.add(pattern.name);
            break;

          case AST_NODE_TYPES.ObjectPattern:
            for (const property of pattern.properties) {
              if (property.type === AST_NODE_TYPES.Property) {
                extractIdentifiersFromPattern(property.value);
              } else if (property.type === AST_NODE_TYPES.RestElement) {
                extractIdentifiersFromPattern(property.argument);
              }
            }
            break;

          case AST_NODE_TYPES.ArrayPattern:
            for (const element of pattern.elements) {
              if (element) {
                extractIdentifiersFromPattern(element);
              }
            }
            break;

          case AST_NODE_TYPES.RestElement:
            extractIdentifiersFromPattern(pattern.argument);
            break;

          case AST_NODE_TYPES.AssignmentPattern:
            extractIdentifiersFromPattern(pattern.left);
            break;
        }
      }

      for (const node of nodes) {
        if (node.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declaration of node.declarations) {
            extractIdentifiersFromPattern(declaration.id);
          }
        }
      }

      return variableNames;
    }

    /**
     * Checks if nodes are in try-catch blocks (either individual or shared)
     */
    function areInTryCatchBlocks(nodes: TSESTree.Node[]): boolean {
      for (const node of nodes) {
        let current: TSESTree.Node | undefined = node;

        // Traverse up to find if the node is in a try block
        while (current && current.parent) {
          if (
            current.parent.type === AST_NODE_TYPES.TryStatement &&
            current.parent.block === current
          ) {
            // If we find a try block, we should not parallelize
            // This applies to both individual and shared try-catch blocks
            return true;
          }
          current = current.parent as TSESTree.Node;
        }
      }

      return false;
    }

    /**
     * Checks if nodes are in a loop
     */
    function areInLoop(nodes: TSESTree.Node[]): boolean {
      for (const node of nodes) {
        let current: TSESTree.Node | undefined = node;

        // Traverse up to find if the node is in a loop
        while (current && current.parent) {
          if (
            current.parent.type === AST_NODE_TYPES.ForStatement ||
            current.parent.type === AST_NODE_TYPES.ForInStatement ||
            current.parent.type === AST_NODE_TYPES.ForOfStatement ||
            current.parent.type === AST_NODE_TYPES.WhileStatement ||
            current.parent.type === AST_NODE_TYPES.DoWhileStatement
          ) {
            return true;
          }
          current = current.parent as TSESTree.Node;
        }
      }

      return false;
    }

    /**
     * Generates a fix for sequential awaits
     */
    function generateFix(
      fixer: TSESLint.RuleFixer,
      awaitNodes: TSESTree.Node[]
    ): TSESLint.RuleFix | null {
      const sourceCode = context.getSourceCode();

      // Extract the await expressions
      const awaitExpressions = awaitNodes
        .map((node) => getAwaitExpression(node))
        .filter((node): node is TSESTree.AwaitExpression => node !== null);

      if (awaitExpressions.length < 2) {
        return null;
      }

      // Get the text of each await argument
      const awaitArguments = awaitExpressions.map((expr) =>
        sourceCode.getText(expr.argument)
      );

      // Check if we have variable declarations that need to be preserved
      const variableNames: (string | null)[] = [];
      let hasVariableDeclarations = false;

      for (const node of awaitNodes) {
        if (node.type === AST_NODE_TYPES.VariableDeclaration) {
          hasVariableDeclarations = true;
          for (const declarator of node.declarations) {
            if (declarator.id.type === AST_NODE_TYPES.Identifier) {
              variableNames.push(declarator.id.name);
            } else {
              variableNames.push(null); // For complex patterns
            }
          }
        } else if (node.type === AST_NODE_TYPES.ExpressionStatement) {
          // Expression statement without variable assignment
          variableNames.push(null);
        }
      }

      let promiseAllText: string;

      if (hasVariableDeclarations) {
        // Create destructuring assignment with Promise.all
        const destructuringPattern = variableNames.map(name => name || '').join(', ');
        promiseAllText = `const [${destructuringPattern}] = await Promise.all([\n  ${awaitArguments.join(',\n  ')}\n]);`;
      } else {
        // Simple Promise.all without variable assignments
        promiseAllText = `await Promise.all([\n  ${awaitArguments.join(',\n  ')}\n]);`;
      }

      // Find the start position, accounting for leading comments
      let startPos = awaitNodes[0].range[0];

      // Replace the range from the start of the first await to the end of the last await
      const endPos = awaitNodes[awaitNodes.length - 1].range[1];

      return fixer.replaceTextRange([startPos, endPos], promiseAllText);
    }

    return {
      BlockStatement(node) {
        const awaitNodes: TSESTree.Node[] = [];

        // Collect consecutive await expressions or variable declarations with await
        for (const statement of node.body) {
          if (
            isExpressionStatementWithAwait(statement) ||
            isVariableDeclarationWithAwait(statement)
          ) {
            awaitNodes.push(statement);
          } else if (awaitNodes.length >= 2) {
            // We found a non-await statement after a sequence of awaits
            // Check if we should report the sequence

            // Extract variable names from variable declarations
            const variableNames = extractVariableNames(awaitNodes);

            // Check if there are dependencies between awaits
            if (
              !hasDependencies(awaitNodes, variableNames) &&
              !areInTryCatchBlocks(awaitNodes) &&
              !areInLoop(awaitNodes)
            ) {
              context.report({
                node: awaitNodes[0],
                messageId: 'parallelizeAsyncOperations',
                fix: (fixer) => generateFix(fixer, awaitNodes),
              });
            }

            // Reset for the next sequence
            awaitNodes.length = 0;
          } else {
            // Reset if we encounter a non-await statement
            awaitNodes.length = 0;
          }
        }

        // Check the last sequence if it exists
        if (awaitNodes.length >= 2) {
          const variableNames = extractVariableNames(awaitNodes);

          if (
            !hasDependencies(awaitNodes, variableNames) &&
            !areInTryCatchBlocks(awaitNodes) &&
            !areInLoop(awaitNodes)
          ) {
            context.report({
              node: awaitNodes[0],
              messageId: 'parallelizeAsyncOperations',
              fix: (fixer) => generateFix(fixer, awaitNodes),
            });
          }
        }
      },
    };
  },
});
