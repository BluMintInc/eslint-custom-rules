import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useFastDeepEqual' | 'addFastDeepEqualImport';

export const fastDeepEqualOverMicrodiff = createRule<[], MessageIds>({
  name: 'fast-deep-equal-over-microdiff',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using fast-deep-equal for equality checks instead of microdiff',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useFastDeepEqual:
        'Use fast-deep-equal for equality checks instead of microdiff.length === 0',
      addFastDeepEqualImport:
        'Import isEqual from fast-deep-equal for equality checks',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    let hasFastDeepEqualImport = false;
    let microdiffImportName = 'diff';
    let fastDeepEqualImportName = 'isEqual';
    const reportedNodes = new Set<TSESTree.Node>();

    /**
     * Check if a node is a microdiff equality check pattern
     * Looks for patterns like:
     * - diff(a, b).length === 0
     * - diff(a, b).length !== 0
     * - !diff(a, b).length
     */
    function isMicrodiffEqualityCheck(node: TSESTree.Node): {
      isEquality: boolean;
      diffCall?: TSESTree.CallExpression;
    } {
      // Check for binary expressions like diff(a, b).length === 0
      if (
        node.type === AST_NODE_TYPES.BinaryExpression &&
        (node.operator === '===' ||
          node.operator === '==' ||
          node.operator === '!==' ||
          node.operator === '!=') &&
        node.right.type === AST_NODE_TYPES.Literal &&
        node.right.value === 0 &&
        node.left.type === AST_NODE_TYPES.MemberExpression &&
        node.left.property.type === AST_NODE_TYPES.Identifier &&
        node.left.property.name === 'length' &&
        node.left.object.type === AST_NODE_TYPES.CallExpression &&
        node.left.object.callee.type === AST_NODE_TYPES.Identifier &&
        node.left.object.callee.name === microdiffImportName
      ) {
        return {
          isEquality: node.operator === '===' || node.operator === '==',
          diffCall: node.left.object,
        };
      }

      // Check for unary expressions like !diff(a, b).length
      if (
        node.type === AST_NODE_TYPES.UnaryExpression &&
        node.operator === '!' &&
        node.argument.type === AST_NODE_TYPES.MemberExpression &&
        node.argument.property.type === AST_NODE_TYPES.Identifier &&
        node.argument.property.name === 'length' &&
        node.argument.object.type === AST_NODE_TYPES.CallExpression &&
        node.argument.object.callee.type === AST_NODE_TYPES.Identifier &&
        node.argument.object.callee.name === microdiffImportName
      ) {
        return {
          isEquality: true, // !diff(...).length is equivalent to diff(...).length === 0
          diffCall: node.argument.object,
        };
      }

      // Not a microdiff equality check
      return { isEquality: false };
    }

    /**
     * Create a fix for replacing microdiff equality check with fast-deep-equal
     */
    function createFix(
      fixer: any,
      node: TSESTree.Node,
      diffCall: TSESTree.CallExpression,
      isEquality: boolean,
    ) {
      const args = diffCall.arguments;

      if (args.length !== 2) {
        return null; // Can't fix if not exactly 2 arguments
      }

      const arg1 = sourceCode.getText(args[0]);
      const arg2 = sourceCode.getText(args[1]);

      // If fast-deep-equal is not imported, we need to add the import after the microdiff import
      if (!hasFastDeepEqualImport) {
        // Find the end of the microdiff import statement
        const importDeclarations = sourceCode.ast.body.filter(
          (node): node is TSESTree.ImportDeclaration =>
            node.type === AST_NODE_TYPES.ImportDeclaration,
        );

        const microdiffImport = importDeclarations.find(
          (node) => node.source.value === 'microdiff',
        );

        const importFix = fixer.insertTextAfter(
          microdiffImport!,
          `\nimport isEqual from 'fast-deep-equal';`,
        );

        const replaceFix = fixer.replaceText(
          node,
          isEquality
            ? `isEqual(${arg1}, ${arg2})`
            : `!isEqual(${arg1}, ${arg2})`,
        );

        return [importFix, replaceFix];
      }

      // Otherwise just replace the expression
      return fixer.replaceText(
        node,
        isEquality
          ? `${fastDeepEqualImportName}(${arg1}, ${arg2})`
          : `!${fastDeepEqualImportName}(${arg1}, ${arg2})`,
      );
    }

    return {
      // Track imports of microdiff and fast-deep-equal
      ImportDeclaration(node) {
        const importSource = node.source.value;

        // Check for microdiff import
        if (importSource === 'microdiff') {
          // Get the local name of the imported diff function
          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.name === 'diff'
            ) {
              microdiffImportName = specifier.local.name;
            }
          });
        }

        // Check for fast-deep-equal import
        if (
          importSource === 'fast-deep-equal' ||
          importSource === 'fast-deep-equal/es6'
        ) {
          hasFastDeepEqualImport = true;
          // Get the local name of the imported isEqual function
          node.specifiers.forEach((specifier) => {
            if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
              fastDeepEqualImportName = specifier.local.name;
            }
          });
        }
      },

      // Check expressions for microdiff equality patterns
      ['BinaryExpression, UnaryExpression'](
        node: TSESTree.BinaryExpression | TSESTree.UnaryExpression,
      ) {
        // Skip if we've already reported this node
        if (reportedNodes.has(node)) {
          return;
        }

        const result = isMicrodiffEqualityCheck(node);
        if (result.isEquality !== undefined && result.diffCall) {
          reportedNodes.add(node);
          context.report({
            node,
            messageId: 'useFastDeepEqual',
            fix(fixer) {
              return createFix(
                fixer,
                node,
                result.diffCall!,
                result.isEquality,
              );
            },
          });
        }
      },

      // Check if statements for microdiff equality patterns
      IfStatement(node) {
        // Skip if we've already reported this node
        if (reportedNodes.has(node.test)) {
          return;
        }

        const result = isMicrodiffEqualityCheck(node.test);
        if (result.isEquality !== undefined && result.diffCall) {
          reportedNodes.add(node.test);
          context.report({
            node: node.test,
            messageId: 'useFastDeepEqual',
            fix(fixer) {
              return createFix(
                fixer,
                node.test,
                result.diffCall!,
                result.isEquality,
              );
            },
          });
        }
      },

      // Check return statements for microdiff equality patterns
      ReturnStatement(node) {
        // Skip if we've already reported this node or if there's no argument
        if (!node.argument || reportedNodes.has(node.argument)) {
          return;
        }

        const result = isMicrodiffEqualityCheck(node.argument);
        if (result.isEquality !== undefined && result.diffCall) {
          reportedNodes.add(node.argument);
          context.report({
            node: node.argument,
            messageId: 'useFastDeepEqual',
            fix(fixer) {
              // We already checked that node.argument is not null above
              return createFix(
                fixer,
                node.argument as TSESTree.Node,
                result.diffCall!,
                result.isEquality,
              );
            },
          });
        }
      },
    };
  },
});
