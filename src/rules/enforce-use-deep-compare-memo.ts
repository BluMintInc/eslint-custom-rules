import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useDeepCompareMemo';

const MEMOIZATION_HOOKS = new Set([
  'useMemo',
  'useCallback',
  'useRef',
  'useState',
  'useReducer',
]);



export const enforceUseDeepCompareMemo = createRule<[], MessageIds>({
  name: 'enforce-use-deep-compare-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce useDeepCompareMemo instead of useMemo when dependency arrays contain non-primitive values that are not already memoized. This prevents unnecessary re-renders caused by reference equality checks failing for structurally identical but newly created objects, arrays, or functions.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useDeepCompareMemo:
        'Use useDeepCompareMemo instead of useMemo when dependency array contains non-primitive values. This prevents unnecessary re-renders when objects/arrays have the same values but different references.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();



    /**
     * Checks if a node represents a non-primitive value that should trigger the rule
     */
    function isProblematicNonPrimitive(node: TSESTree.Node): boolean {
      switch (node.type) {
        case AST_NODE_TYPES.Literal:
          // Literals are always primitive
          return false;
        case AST_NODE_TYPES.TemplateLiteral:
          // Template literals are primitive
          return false;
        case AST_NODE_TYPES.ObjectExpression:
        case AST_NODE_TYPES.ArrayExpression:
        case AST_NODE_TYPES.ArrowFunctionExpression:
        case AST_NODE_TYPES.FunctionExpression:
        case AST_NODE_TYPES.NewExpression:
          return true;
        case AST_NODE_TYPES.CallExpression:
          // Function calls that return non-primitive values
          return !isKnownPrimitiveFunction(node);
        case AST_NODE_TYPES.Identifier:
          // Flag identifiers (assume they could be non-primitive)
          return true;
        case AST_NODE_TYPES.MemberExpression:
          // Property access that returns objects/arrays
          if (node.property.type === AST_NODE_TYPES.Identifier) {
            // Skip primitive properties
            const primitiveProperties = new Set(['length', 'size']);
            if (primitiveProperties.has(node.property.name)) {
              return false; // This is a primitive property access
            }
          }
          return true;
        case AST_NODE_TYPES.UnaryExpression:
          // Unary expressions like typeof, !, -, + are primitive
          return false;
        case AST_NODE_TYPES.BinaryExpression:
          // Binary expressions are primitive
          return false;
        case AST_NODE_TYPES.LogicalExpression:
          // Logical expressions are primitive
          return false;
        case AST_NODE_TYPES.ConditionalExpression:
          // Conditional expressions are primitive
          return false;
        default:
          return false;
      }
    }

    /**
     * Checks if a function call is known to return primitive values
     */
    function isKnownPrimitiveFunction(node: TSESTree.CallExpression): boolean {
      if (node.callee.type === AST_NODE_TYPES.Identifier) {
        const functionName = node.callee.name;
        // Common functions that return primitives
        const primitiveFunctions = new Set([
          'String',
          'Number',
          'Boolean',
          'parseInt',
          'parseFloat',
          'isNaN',
          'isFinite',
          'typeof',
        ]);
        return primitiveFunctions.has(functionName);
      }

      if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
        const property = node.callee.property;
        if (property.type === AST_NODE_TYPES.Identifier) {
          // Common methods that return primitives
          const primitiveMethods = new Set([
            'toString',
            'valueOf',
            'indexOf',
            'lastIndexOf',
            'includes',
            'startsWith',
            'endsWith',
            'charAt',
            'charCodeAt',
            'codePointAt',
            'localeCompare',
            'search',
            'test',
            'toUpperCase',
            'toLowerCase',
            'trim',
            'trimStart',
            'trimEnd',
            'padStart',
            'padEnd',
            'repeat',
            'substring',
            'substr',
            'slice',
          ]);
          return primitiveMethods.has(property.name);
        }
      }

      return false;
    }

    /**
     * Checks if the useMemo callback returns JSX
     */
    function returnsJSX(callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): boolean {
      if (callback.body.type === AST_NODE_TYPES.JSXElement || callback.body.type === AST_NODE_TYPES.JSXFragment) {
        return true;
      }

      if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
        // Check return statements in the block
        for (const statement of callback.body.body) {
          if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument) {
            if (
              statement.argument.type === AST_NODE_TYPES.JSXElement ||
              statement.argument.type === AST_NODE_TYPES.JSXFragment
            ) {
              return true;
            }
          }
        }
      }

      return false;
    }

    /**
     * Checks if an identifier is memoized by looking for its declaration in the current scope
     */
    function isIdentifierMemoized(identifierName: string, currentNode: TSESTree.Node): boolean {
      // Look for the variable declaration in the current function scope
      let current = currentNode.parent;
      while (current) {
        if (current.type === AST_NODE_TYPES.FunctionExpression ||
            current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            current.type === AST_NODE_TYPES.FunctionDeclaration) {
          // Found the function scope, now look for variable declarations
          if (current.body && current.body.type === AST_NODE_TYPES.BlockStatement) {
            for (const statement of current.body.body) {
              if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
                for (const declarator of statement.declarations) {
                  if (declarator.id.type === AST_NODE_TYPES.Identifier &&
                      declarator.id.name === identifierName &&
                      declarator.init &&
                      declarator.init.type === AST_NODE_TYPES.CallExpression &&
                      declarator.init.callee.type === AST_NODE_TYPES.Identifier &&
                      MEMOIZATION_HOOKS.has(declarator.init.callee.name)) {
                    return true;
                  }
                  // Handle destructuring like [state, setState] = useState()
                  if (declarator.id.type === AST_NODE_TYPES.ArrayPattern &&
                      declarator.init &&
                      declarator.init.type === AST_NODE_TYPES.CallExpression &&
                      declarator.init.callee.type === AST_NODE_TYPES.Identifier &&
                      MEMOIZATION_HOOKS.has(declarator.init.callee.name)) {
                    for (const element of declarator.id.elements) {
                      if (element && element.type === AST_NODE_TYPES.Identifier && element.name === identifierName) {
                        return true;
                      }
                    }
                  }
                }
              }
            }
          }
          break;
        }
        current = current.parent;
      }
      return false;
    }

    /**
     * Analyzes dependency array for problematic non-primitive values
     */
    function analyzeDepArray(depArray: TSESTree.ArrayExpression, currentNode: TSESTree.Node): boolean {
      for (const element of depArray.elements) {
        if (!element) continue; // Skip holes in sparse arrays

        if (isProblematicNonPrimitive(element)) {
          // Check if this is a memoized identifier
          if (element.type === AST_NODE_TYPES.Identifier && isIdentifierMemoized(element.name, currentNode)) {
            continue; // This is memoized, so it's okay
          }
          return true; // Found a problematic non-primitive
        }
      }

      return false; // No problematic non-primitives found
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {

        // Check if this is a useMemo call
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'useMemo' &&
          node.arguments.length >= 2
        ) {
          const callback = node.arguments[0];
          const depArray = node.arguments[1];

          // Skip if callback is not a function
          if (
            callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
            callback.type !== AST_NODE_TYPES.FunctionExpression
          ) {
            return;
          }

          // Skip if useMemo returns JSX
          if (returnsJSX(callback)) {
            return;
          }

          // Skip if dependency array is not an array literal
          if (depArray.type !== AST_NODE_TYPES.ArrayExpression) {
            return;
          }

          // Skip empty dependency arrays
          if (depArray.elements.length === 0) {
            return;
          }

          const hasProblematicDeps = analyzeDepArray(depArray, node);

          // Only suggest useDeepCompareMemo if there are problematic non-primitives
          if (hasProblematicDeps) {
            context.report({
              node,
              messageId: 'useDeepCompareMemo',
              fix(fixer) {
                // Create the fix by replacing useMemo with useDeepCompareMemo
                const calleeText = 'useDeepCompareMemo';
                const typeParameters = node.typeParameters ? sourceCode.getText(node.typeParameters) : '';
                const args = node.arguments.map(arg => sourceCode.getText(arg)).join(', ');

                return fixer.replaceText(node, `${calleeText}${typeParameters}(${args})`);
              },
            });
          }
        }
      },
    };
  },
});

export default enforceUseDeepCompareMemo;
