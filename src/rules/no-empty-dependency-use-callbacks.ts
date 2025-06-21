import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    allowMemoizedComponents?: boolean;
    allowCustomHooks?: boolean;
    allowTestFiles?: boolean;
  },
];
type MessageIds = 'extractToUtilityFunction' | 'considerUtilityFunction';

export const noEmptyDependencyUseCallbacks = createRule<Options, MessageIds>({
  name: 'no-empty-dependency-use-callbacks',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce extracting useCallback with empty dependencies to utility functions',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowMemoizedComponents: {
            type: 'boolean',
            default: false,
          },
          allowCustomHooks: {
            type: 'boolean',
            default: false,
          },
          allowTestFiles: {
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      extractToUtilityFunction:
        'useCallback with empty dependencies should be extracted to a utility function outside the component for better performance',
      considerUtilityFunction:
        'Consider extracting this useCallback with empty dependencies to a utility function, or add an ESLint disable comment if intentional',
    },
  },
  defaultOptions: [
    {
      allowMemoizedComponents: false,
      allowCustomHooks: false,
      allowTestFiles: true,
    },
  ],
  create(context) {
    const options = context.options[0] || {
      allowMemoizedComponents: false,
      allowCustomHooks: false,
      allowTestFiles: true,
    };
    const sourceCode = context.getSourceCode();
    const filename = context.getFilename();

    // Check if we're in a test file
    const isTestFile = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filename) ||
                      filename.includes('__tests__') ||
                      filename.includes('test-');

    if (isTestFile && options.allowTestFiles) {
      return {};
    }

    /**
     * Checks if a node is inside a custom hook (function starting with 'use')
     */
    function isInCustomHook(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node.parent;
      while (current) {
        if (
          (current.type === AST_NODE_TYPES.FunctionDeclaration ||
           current.type === AST_NODE_TYPES.FunctionExpression ||
           current.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
          current.parent &&
          current.parent.type === AST_NODE_TYPES.VariableDeclarator &&
          current.parent.id.type === AST_NODE_TYPES.Identifier &&
          current.parent.id.name.startsWith('use')
        ) {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    /**
     * Checks if the callback accesses component-scoped variables
     * For now, we'll use a simple heuristic: if the callback only uses built-ins and imports, it's safe
     */
    function accessesComponentScope(
      callbackNode: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
      _componentNode: TSESTree.Node
    ): boolean {
      // Simple approach: if the callback only uses built-ins, imports, and its own parameters,
      // then it doesn't access component scope
      return !onlyUsesImportsAndBuiltins(callbackNode);
    }

    /**
     * Checks if the callback returns JSX
     */
    function returnsJSX(
      callbackNode: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression
    ): boolean {
      function hasJSXReturn(node: TSESTree.Node, depth = 0): boolean {
        if (depth > 5) return false; // Prevent deep recursion

        if ((node as any).type === 'JSXElement' ||
            (node as any).type === 'JSXFragment') {
          return true;
        }

        // Only check the callback body, not the entire component
        if (node === callbackNode) {
          // For arrow functions, check the body
          if (callbackNode.body) {
            return hasJSXReturn(callbackNode.body, depth + 1);
          }
        } else {
          // Recursively check children
          for (const key in node) {
            const child = (node as any)[key];
            if (Array.isArray(child)) {
              if (child.some(item =>
                item && typeof item === 'object' && item.type &&
                hasJSXReturn(item, depth + 1)
              )) {
                return true;
              }
            } else if (child && typeof child === 'object' && child.type) {
              if (hasJSXReturn(child, depth + 1)) {
                return true;
              }
            }
          }
        }

        return false;
      }

      return hasJSXReturn(callbackNode);
    }

    /**
     * Checks if the callback only uses imported functions/constants or built-ins
     */
    function onlyUsesImportsAndBuiltins(
      callbackNode: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression
    ): boolean {
      const imports = new Set<string>();
      const program = sourceCode.ast;

      // Collect all imports
      program.body.forEach(node => {
        if (node.type === AST_NODE_TYPES.ImportDeclaration) {
          node.specifiers.forEach(spec => {
            if (spec.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
                spec.type === AST_NODE_TYPES.ImportSpecifier ||
                spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
              imports.add(spec.local.name);
            }
          });
        }
      });

      // Built-in objects and global functions
      const builtIns = new Set([
        'console', 'Date', 'Math', 'JSON', 'Object', 'Array', 'String',
        'Number', 'Boolean', 'RegExp', 'Error', 'Promise', 'fetch', 'Intl'
      ]);

      const identifiersUsed = new Set<string>();

      // Collect all identifiers used in the callback
      function collectIdentifiers(node: TSESTree.Node, depth = 0) {
        if (depth > 10) return; // Prevent deep recursion

        if (node.type === AST_NODE_TYPES.Identifier) {
          identifiersUsed.add(node.name);
        }

        // Only traverse specific properties that are part of the AST structure
        // Avoid traversing parent, range, loc, etc.
        const childKeys = ['left', 'right', 'body', 'argument', 'arguments', 'callee', 'object', 'property', 'elements', 'properties', 'value', 'init', 'test', 'consequent', 'alternate'];

        for (const key of childKeys) {
          const child = (node as any)[key];
          if (child) {
            if (Array.isArray(child)) {
              child.forEach(item => {
                if (item && typeof item === 'object' && item.type) {
                  collectIdentifiers(item, depth + 1);
                }
              });
            } else if (typeof child === 'object' && child.type) {
              collectIdentifiers(child, depth + 1);
            }
          }
        }
      }

      collectIdentifiers(callbackNode.body);

      // Check if all identifiers are either imports, built-ins, or function parameters
      const callbackParams = new Set<string>();
      if (callbackNode.params) {
        callbackNode.params.forEach(param => {
          if (param.type === AST_NODE_TYPES.Identifier) {
            callbackParams.add(param.name);
          }
        });
      }

      for (const identifier of identifiersUsed) {
        if (!builtIns.has(identifier) && !imports.has(identifier) && !callbackParams.has(identifier)) {
          return false;
        }
      }

      return true;
    }

    /**
     * Finds the containing component function
     */
    function findContainingComponent(node: TSESTree.Node): TSESTree.Node | null {
      let current: TSESTree.Node | undefined = node.parent;
      while (current) {
        if (
          (current.type === AST_NODE_TYPES.FunctionDeclaration ||
           current.type === AST_NODE_TYPES.FunctionExpression ||
           current.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
          current.parent &&
          (current.parent.type === AST_NODE_TYPES.VariableDeclarator ||
           current.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration ||
           current.parent.type === AST_NODE_TYPES.ExportNamedDeclaration)
        ) {
          return current;
        }
        current = current.parent;
      }
      return null;
    }

    /**
     * Generates the utility function name from the callback
     */
    function generateUtilityFunctionName(
      callbackNode: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression
    ): string {
      // Try to infer name from variable declaration
      let current: TSESTree.Node | undefined = callbackNode.parent;
      while (current) {
        if (current.type === AST_NODE_TYPES.VariableDeclarator &&
            current.id.type === AST_NODE_TYPES.Identifier) {
          return current.id.name;
        }
        current = current.parent;
      }

      // Fallback to generic name
      return 'utilityFunction';
    }

    /**
     * Creates the auto-fix for extracting the callback
     */
    function createAutoFix(
      node: TSESTree.CallExpression,
      callbackNode: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression
    ) {
      const utilityName = generateUtilityFunctionName(callbackNode);
      const callbackText = sourceCode.getText(callbackNode);

      // Find the component to insert the utility function before it
      const component = findContainingComponent(node);
      if (!component) {
        return null;
      }

      // Find the start of the line containing the component
      const componentStart = component.range[0];
      const lines = sourceCode.getText().split('\n');
      const componentLine = sourceCode.getLocFromIndex(componentStart).line - 1;

      // Calculate the position at the start of the component line
      let lineStart = 0;
      for (let i = 0; i < componentLine; i++) {
        lineStart += lines[i].length + 1; // +1 for newline
      }

      const utilityFunction = `const ${utilityName} = ${callbackText};\n\n`;

      return (fixer: any) => [
        // Insert utility function before component
        fixer.insertTextBeforeRange([lineStart, lineStart], utilityFunction),
        // Replace useCallback with just the function name
        fixer.replaceText(node, utilityName),
      ];
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        // Check if this is a useCallback call
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'useCallback' &&
          node.arguments.length >= 2
        ) {

          const callback = node.arguments[0];
          const dependencies = node.arguments[1];

          // Check if dependencies is an empty array
          if (
            dependencies.type === AST_NODE_TYPES.ArrayExpression &&
            dependencies.elements.length === 0 &&
            (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
             callback.type === AST_NODE_TYPES.FunctionExpression)
          ) {
            // Skip if in custom hook and allowed
            if (isInCustomHook(node) && options.allowCustomHooks) {
              return;
            }

            // Skip if returns JSX
            if (returnsJSX(callback)) {
              return;
            }

            // Find containing component
            const component = findContainingComponent(node);
            if (!component) {
              return;
            }

            // Skip if accesses component scope
            if (accessesComponentScope(callback, component)) {
              return;
            }

            // Report the issue
            const canAutoFix = onlyUsesImportsAndBuiltins(callback);

            context.report({
              node,
              messageId: canAutoFix ? 'extractToUtilityFunction' : 'considerUtilityFunction',
              fix: canAutoFix ? createAutoFix(node, callback) : undefined,
            });
          }
        }
      },
    };
  },
});

export default noEmptyDependencyUseCallbacks;
