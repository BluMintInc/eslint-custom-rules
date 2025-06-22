import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useFastDeepEqual' | 'addFastDeepEqualImport';

interface MicrodiffVariable {
  name: string;
  args: TSESTree.CallExpressionArgument[];
  declarationNode: TSESTree.VariableDeclarator;
}

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
    const microdiffVariables = new Map<string, MicrodiffVariable>();

    /**
     * Check if a node is a microdiff equality check pattern
     * Looks for patterns like:
     * - diff(a, b).length === 0
     * - diff(a, b).length !== 0
     * - !diff(a, b).length
     * - differences.length === 0 (where differences = diff(a, b))
     * - !changes.length (where changes = diff(a, b))
     */
    function isMicrodiffEqualityCheck(node: TSESTree.Node): {
      isEquality: boolean;
      diffCall?: TSESTree.CallExpression;
      microdiffVariable?: MicrodiffVariable;
    } {
      // Check for binary expressions like diff(a, b).length === 0 or variable.length === 0
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
        node.left.property.name === 'length'
      ) {
        // Direct call: diff(a, b).length === 0
        if (
          node.left.object.type === AST_NODE_TYPES.CallExpression &&
          node.left.object.callee.type === AST_NODE_TYPES.Identifier &&
          node.left.object.callee.name === microdiffImportName
        ) {
          return {
            isEquality: node.operator === '===' || node.operator === '==',
            diffCall: node.left.object,
          };
        }

        // Variable reference: variable.length === 0
        if (
          node.left.object.type === AST_NODE_TYPES.Identifier &&
          microdiffVariables.has(node.left.object.name)
        ) {
          const microdiffVar = microdiffVariables.get(node.left.object.name)!;
          return {
            isEquality: node.operator === '===' || node.operator === '==',
            microdiffVariable: microdiffVar,
          };
        }
      }

      // Check for unary expressions like !diff(a, b).length or !variable.length
      if (
        node.type === AST_NODE_TYPES.UnaryExpression &&
        node.operator === '!' &&
        node.argument.type === AST_NODE_TYPES.MemberExpression &&
        node.argument.property.type === AST_NODE_TYPES.Identifier &&
        node.argument.property.name === 'length'
      ) {
        // Direct call: !diff(a, b).length
        if (
          node.argument.object.type === AST_NODE_TYPES.CallExpression &&
          node.argument.object.callee.type === AST_NODE_TYPES.Identifier &&
          node.argument.object.callee.name === microdiffImportName
        ) {
          return {
            isEquality: true, // !diff(...).length is equivalent to diff(...).length === 0
            diffCall: node.argument.object,
          };
        }

        // Variable reference: !variable.length
        if (
          node.argument.object.type === AST_NODE_TYPES.Identifier &&
          microdiffVariables.has(node.argument.object.name)
        ) {
          const microdiffVar = microdiffVariables.get(
            node.argument.object.name,
          )!;
          return {
            isEquality: true, // !variable.length is equivalent to variable.length === 0
            microdiffVariable: microdiffVar,
          };
        }
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
      isEquality: boolean,
      diffCall?: TSESTree.CallExpression,
      microdiffVariable?: MicrodiffVariable,
    ) {
      let args: TSESTree.CallExpressionArgument[];
      let fixes: any[] = [];

      if (diffCall) {
        // Direct call case: diff(a, b).length === 0
        args = diffCall.arguments;
      } else if (microdiffVariable) {
        // Variable case: const differences = diff(a, b); differences.length === 0
        args = microdiffVariable.args;

        // Remove the variable declaration
        const declarationStatement = microdiffVariable.declarationNode.parent;
        if (
          declarationStatement &&
          declarationStatement.type === AST_NODE_TYPES.VariableDeclaration
        ) {
          // If this is the only declarator in the statement, remove the whole statement including newlines
          if (declarationStatement.declarations.length === 1) {
            // Find the start of the line (including any indentation)
            const statementStart = declarationStatement.range![0];
            const statementEnd = declarationStatement.range![1];
            const sourceText = sourceCode.getText();

            // Find the start of the line by going backwards to find the newline
            let lineStart = statementStart;
            while (lineStart > 0 && sourceText[lineStart - 1] !== '\n') {
              lineStart--;
            }

            // Find the end of the line by going forwards to find the newline (including the newline)
            let lineEnd = statementEnd;
            while (
              lineEnd < sourceText.length &&
              sourceText[lineEnd] !== '\n'
            ) {
              lineEnd++;
            }
            if (lineEnd < sourceText.length && sourceText[lineEnd] === '\n') {
              lineEnd++; // Include the newline character
            }

            fixes.push(fixer.removeRange([lineStart, lineEnd]));
          } else {
            // If there are multiple declarators, we need to handle commas properly
            const declaratorIndex = declarationStatement.declarations.indexOf(
              microdiffVariable.declarationNode,
            );
            if (declaratorIndex === 0) {
              // First declarator: remove it and the following comma
              const nextDeclarator = declarationStatement.declarations[1];
              const range = [
                microdiffVariable.declarationNode.range![0],
                nextDeclarator.range![0],
              ] as const;
              fixes.push(fixer.removeRange(range));
            } else {
              // Not first declarator: remove the preceding comma and the declarator
              const prevDeclarator =
                declarationStatement.declarations[declaratorIndex - 1];
              const range = [
                prevDeclarator.range![1],
                microdiffVariable.declarationNode.range![1],
              ] as const;
              fixes.push(fixer.removeRange(range));
            }
          }
        }
      } else {
        return null; // Can't fix without either diffCall or microdiffVariable
      }

      if (args.length !== 2) {
        return null; // Can't fix if not exactly 2 arguments
      }

      // Check if any arguments are spread elements (we can't handle those)
      if (args.some((arg) => arg.type === AST_NODE_TYPES.SpreadElement)) {
        return null;
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

        fixes.push(importFix);
      }

      // Replace the expression
      const replaceFix = fixer.replaceText(
        node,
        isEquality
          ? `${
              hasFastDeepEqualImport ? fastDeepEqualImportName : 'isEqual'
            }(${arg1}, ${arg2})`
          : `!${
              hasFastDeepEqualImport ? fastDeepEqualImportName : 'isEqual'
            }(${arg1}, ${arg2})`,
      );

      fixes.push(replaceFix);
      return fixes;
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
            } else if (
              specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier
            ) {
              // Handle default import: import diff from 'microdiff'
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

      // Track variable declarations that assign from microdiff calls
      VariableDeclarator(node) {
        if (
          node.init &&
          node.init.type === AST_NODE_TYPES.CallExpression &&
          node.init.callee.type === AST_NODE_TYPES.Identifier &&
          node.init.callee.name === microdiffImportName &&
          node.id.type === AST_NODE_TYPES.Identifier
        ) {
          microdiffVariables.set(node.id.name, {
            name: node.id.name,
            args: node.init.arguments,
            declarationNode: node,
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
        if (
          result.isEquality !== undefined &&
          (result.diffCall || result.microdiffVariable)
        ) {
          reportedNodes.add(node);
          context.report({
            node,
            messageId: 'useFastDeepEqual',
            fix(fixer) {
              return createFix(
                fixer,
                node,
                result.isEquality,
                result.diffCall,
                result.microdiffVariable,
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
        if (
          result.isEquality !== undefined &&
          (result.diffCall || result.microdiffVariable)
        ) {
          reportedNodes.add(node.test);
          context.report({
            node: node.test,
            messageId: 'useFastDeepEqual',
            fix(fixer) {
              return createFix(
                fixer,
                node.test,
                result.isEquality,
                result.diffCall,
                result.microdiffVariable,
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
        if (
          result.isEquality !== undefined &&
          (result.diffCall || result.microdiffVariable)
        ) {
          reportedNodes.add(node.argument);
          context.report({
            node: node.argument,
            messageId: 'useFastDeepEqual',
            fix(fixer) {
              // We already checked that node.argument is not null above
              return createFix(
                fixer,
                node.argument as TSESTree.Node,
                result.isEquality,
                result.diffCall,
                result.microdiffVariable,
              );
            },
          });
        }
      },
    };
  },
});
