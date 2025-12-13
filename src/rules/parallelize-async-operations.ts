import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'parallelizeAsyncOperations';
type Options = [
  {
    sideEffectPatterns?: Array<string | RegExp>;
  },
];

const defaultOptions: Options = [
  {
    sideEffectPatterns: [
      'updatecounter',
      'setcounter',
      'incrementcounter',
      'decrementcounter',
      'updatethreshold',
      'setthreshold',
      'checkthreshold',
    ],
  },
];

export const parallelizeAsyncOperations = createRule<Options, MessageIds>({
  name: 'parallelize-async-operations',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce the use of Promise.all() when multiple independent asynchronous operations are awaited sequentially',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          sideEffectPatterns: {
            type: 'array',
            items: {
              anyOf: [
                { type: 'string' },
                { type: 'object', instanceof: 'RegExp' },
              ],
            },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      parallelizeAsyncOperations:
        'Multiple sequential awaits detected. Consider using Promise.all() to parallelize independent async operations for better performance.',
    },
  },
  defaultOptions,
  create(context, [options]) {
    const sourceCode = context.getSourceCode();
    const sideEffectMatchers = (options?.sideEffectPatterns ?? []).map(
      (pattern) =>
        typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern,
    );
    const reportedRanges = new Set<string>();
    /**
     * Checks if a node is an await expression
     */
    function isAwaitExpression(
      node: TSESTree.Node,
    ): node is TSESTree.AwaitExpression {
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
          declaration.init && isAwaitExpression(declaration.init),
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
    function getAwaitExpression(
      node: TSESTree.Node,
    ): TSESTree.AwaitExpression | null {
      if (isAwaitExpression(node)) {
        return node;
      }

      if (
        node.type === AST_NODE_TYPES.ExpressionStatement &&
        isAwaitExpression(node.expression)
      ) {
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
    function isIdentifierUsedInNode(
      identifier: string,
      node: TSESTree.Node,
    ): boolean {
      let isUsed = false;

      function visit(node: TSESTree.Node) {
        if (
          node.type === AST_NODE_TYPES.Identifier &&
          node.name === identifier
        ) {
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
      variableNames: Set<string>,
      sideEffectPatterns: RegExp[],
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
          if (
            awaitExpr &&
            isIdentifierUsedInNode(varName, awaitExpr.argument)
          ) {
            return true;
          }
        }

        // Check for operations that might have side effects that affect subsequent operations
        // This is a conservative heuristic - we only flag very specific patterns
        const awaitExpr = getAwaitExpression(currentNode);
        if (
          awaitExpr &&
          awaitExpr.argument.type === AST_NODE_TYPES.CallExpression
        ) {
          const callee = awaitExpr.argument.callee;

          // Check for method calls that might indicate side effects
          if (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            callee.property.type === AST_NODE_TYPES.Identifier
          ) {
            const methodName = callee.property.name;
            if (
              sideEffectPatterns.some((pattern) => pattern.test(methodName))
            ) {
              return true;
            }
          }

          if (callee.type === AST_NODE_TYPES.Identifier) {
            const functionName = callee.name;
            if (
              sideEffectPatterns.some((pattern) => pattern.test(functionName))
            ) {
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
      awaitNodes: TSESTree.Node[],
    ): TSESLint.RuleFix | null {
      // Extract the await expressions
      const awaitExpressions = awaitNodes
        .map((node) => getAwaitExpression(node))
        .filter((node): node is TSESTree.AwaitExpression => node !== null);

      if (awaitExpressions.length < 2) {
        return null;
      }

      // Get the text of each await argument
      const awaitArguments = awaitExpressions.map((expr) =>
        sourceCode.getText(expr.argument),
      );

      const idsText: string[] = [];
      const declKinds = new Set<TSESTree.VariableDeclaration['kind']>();
      let hasVariableDeclarations = false;

      for (const node of awaitNodes) {
        if (node.type === AST_NODE_TYPES.VariableDeclaration) {
          hasVariableDeclarations = true;
          declKinds.add(node.kind);
          for (const declarator of node.declarations) {
            idsText.push(sourceCode.getText(declarator.id));
          }
        } else if (node.type === AST_NODE_TYPES.ExpressionStatement) {
          idsText.push('');
        }
      }

      let promiseAllText: string;

      if (hasVariableDeclarations) {
        if (declKinds.size !== 1) {
          return null;
        }

        if (idsText.length !== awaitArguments.length) {
          return null;
        }

        const destructuringPattern = idsText.join(', ');
        const declKind = Array.from(declKinds)[0];
        promiseAllText = `${declKind} [${destructuringPattern}] = await Promise.all([\n  ${awaitArguments.join(
          ',\n  ',
        )}\n]);`;
      } else {
        // Simple Promise.all without variable assignments
        promiseAllText = `await Promise.all([\n  ${awaitArguments.join(
          ',\n  ',
        )}\n]);`;
      }

      // Find the start position, accounting for leading comments
      let startPos = awaitNodes[0].range[0];

      // Replace the range from the start of the first await to the end of the last await
      const endPos = awaitNodes[awaitNodes.length - 1].range[1];

      return fixer.replaceTextRange([startPos, endPos], promiseAllText);
    }

    const processStatementList = (statements: TSESTree.Statement[]): void => {
      const awaitNodes: TSESTree.Node[] = [];

      for (const statement of statements) {
        if (
          isExpressionStatementWithAwait(statement) ||
          isVariableDeclarationWithAwait(statement)
        ) {
          awaitNodes.push(statement);
        } else if (awaitNodes.length >= 2) {
          const variableNames = extractVariableNames(awaitNodes);

          if (
            !hasDependencies(awaitNodes, variableNames, sideEffectMatchers) &&
            !areInTryCatchBlocks(awaitNodes) &&
            !areInLoop(awaitNodes)
          ) {
            const start = awaitNodes[0].range?.[0];
            const end = awaitNodes[awaitNodes.length - 1].range?.[1];
            // Range metadata should exist on parser-produced nodes; this guard
            // only skips malformed or synthetic nodes to avoid forming an
            // "undefined-undefined" deduplication key
            if (start == null || end == null) {
              awaitNodes.length = 0;
              continue;
            }
            const key = `${start}-${end}`;
            if (!reportedRanges.has(key)) {
              reportedRanges.add(key);
              context.report({
                node: awaitNodes[0],
                messageId: 'parallelizeAsyncOperations',
                fix: (fixer) => generateFix(fixer, awaitNodes),
              });
            }
          }

          awaitNodes.length = 0;
        } else {
          awaitNodes.length = 0;
        }
      }

      if (awaitNodes.length >= 2) {
        const variableNames = extractVariableNames(awaitNodes);

        if (
          !hasDependencies(awaitNodes, variableNames, sideEffectMatchers) &&
          !areInTryCatchBlocks(awaitNodes) &&
          !areInLoop(awaitNodes)
        ) {
          const start = awaitNodes[0].range?.[0];
          const end = awaitNodes[awaitNodes.length - 1].range?.[1];
          if (start == null || end == null) {
            // Defensive guard: skip reporting when range metadata is missing
            return;
          }
          const key = `${start}-${end}`;
          if (!reportedRanges.has(key)) {
            reportedRanges.add(key);
            context.report({
              node: awaitNodes[0],
              messageId: 'parallelizeAsyncOperations',
              fix: (fixer) => generateFix(fixer, awaitNodes),
            });
          }
        }
      }
    };

    return {
      Program(node) {
        processStatementList(node.body);
      },
      BlockStatement(node) {
        processStatementList(node.body);
      },
    };
  },
});
