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
      'commit',
      'flush',
      'saveall',
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
        'Awaiting {{awaitCount}} independent async operations sequentially makes their network and I/O latency add up, which slows responses and wastes compute. These awaits have no data dependency or per-call error handling, so run them together with Promise.all([...]) and destructure the results when you need individual values.',
    },
  },
  defaultOptions,
  create(context, [options]) {
    const sourceCode = context.sourceCode;
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
     * Extracts all identifiers used in a node
     */
    function getAllIdentifiers(node: TSESTree.Node): Set<string> {
      const identifiers = new Set<string>();

      function visit(n: TSESTree.Node) {
        if (n.type === AST_NODE_TYPES.Identifier) {
          identifiers.add(n.name);
          return;
        }

        for (const key in n) {
          if (key === 'parent' || key === 'range' || key === 'loc') continue;

          const child = (n as any)[key];
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
      return identifiers;
    }

    const COORDINATOR_PATTERN =
      /batch|manager|collector|transaction|tx|unitofwork|accumulator/i;

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

      const allIdentifiers = awaitNodes.map((node) => {
        const awaitExpr = getAwaitExpression(node);
        return awaitExpr
          ? getAllIdentifiers(awaitExpr.argument)
          : new Set<string>();
      });

      // Check all nodes for side effects and shared coordinators
      for (let i = 0; i < awaitNodes.length; i++) {
        const currentNode = awaitNodes[i];
        const awaitExpr = getAwaitExpression(currentNode);
        if (!awaitExpr) continue;

        // 1. Check if current node depends on variables DECLARED in previous awaits
        if (i > 0) {
          for (const varName of variableNames) {
            if (isIdentifierUsedInNode(varName, awaitExpr.argument)) {
              return true;
            }
          }
        }

        // 2. Check for shared coordinators between this node and ANY previous node
        if (i > 0) {
          const currentIds = allIdentifiers[i];
          for (const id of currentIds) {
            if (COORDINATOR_PATTERN.test(id)) {
              for (let j = 0; j < i; j++) {
                if (allIdentifiers[j].has(id)) {
                  return true;
                }
              }
            }
          }
        }

        // 3. Check for operations that might have side effects
        // If any node has a side effect, we should not parallelize the sequence
        if (awaitExpr.argument.type === AST_NODE_TYPES.CallExpression) {
          const callee = awaitExpr.argument.callee;
          let methodName: string | null = null;

          if (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            callee.property.type === AST_NODE_TYPES.Identifier
          ) {
            methodName = callee.property.name;
          } else if (callee.type === AST_NODE_TYPES.Identifier) {
            methodName = callee.name;
          }

          if (
            methodName &&
            sideEffectPatterns.some((pattern) => pattern.test(methodName!))
          ) {
            return true;
          }
        }
      }

      // If any node is a variable declaration with destructuring, consider it as having dependencies
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
     *
     * Returns null when the sequential awaits cannot be safely rewritten as a Promise.all.
     */
    function generateFix(
      fixer: TSESLint.RuleFixer,
      awaitNodes: TSESTree.Node[],
    ): TSESLint.RuleFix | null {
      if (awaitNodes.length < 2) {
        return null;
      }

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
      const startPos = awaitNodes[0].range[0];

      // Replace the range from the start of the first await to the end of the last await
      const endPos = awaitNodes[awaitNodes.length - 1].range[1];

      return fixer.replaceTextRange([startPos, endPos], promiseAllText);
    }

    /**
     * Generates a deduplication key from await nodes' range metadata.
     */
    function getDeduplicationKey(awaitNodes: TSESTree.Node[]): string {
      const rangeStart = awaitNodes[0].range[0];
      const rangeEnd = awaitNodes[awaitNodes.length - 1].range[1];

      return `${rangeStart}-${rangeEnd}`;
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
            const key = getDeduplicationKey(awaitNodes);
            if (!reportedRanges.has(key)) {
              reportedRanges.add(key);
              context.report({
                node: awaitNodes[0],
                messageId: 'parallelizeAsyncOperations',
                data: {
                  awaitCount: awaitNodes.length.toString(),
                },
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
          const key = getDeduplicationKey(awaitNodes);
          if (!reportedRanges.has(key)) {
            reportedRanges.add(key);
            context.report({
              node: awaitNodes[0],
              messageId: 'parallelizeAsyncOperations',
              data: {
                awaitCount: awaitNodes.length.toString(),
              },
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
