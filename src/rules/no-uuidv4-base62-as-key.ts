import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import path from 'path';

type MessageIds = 'noUuidv4Base62AsKey';
type Options = [];

// Target import path for uuidv4Base62
const TARGET_IMPORT_PATH = 'functions/src/util/uuidv4Base62.ts';

export const noUuidv4Base62AsKey = createRule<Options, MessageIds>({
  name: 'no-uuidv4-base62-as-key',
  meta: {
    type: 'problem',
    docs: {
      description: 'Avoid using uuidv4Base62() from functions/src/util/uuidv4Base62.ts as React list keys',
      recommended: 'error',
    },
    messages: {
      noUuidv4Base62AsKey:
        'Avoid using uuidv4Base62() as a key in React list iterations. Use a stable identifier from the data instead.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    // Track JSXElements that are direct children of a map callback
    const mapCallbackElements = new Set<TSESTree.JSXElement | TSESTree.JSXFragment>();

    // Track imported uuidv4Base62 identifiers
    const uuidv4Base62Identifiers = new Set<string>();

    // Helper function to check if an import path matches our target
    const isTargetImportPath = (importPath: string): boolean => {
      // Handle relative paths
      if (importPath.startsWith('.')) {
        const currentFilePath = context.getFilename();
        const currentDir = path.dirname(currentFilePath);
        const resolvedPath = path.resolve(currentDir, importPath);

        // Check if the resolved path ends with our target path
        return resolvedPath.endsWith(TARGET_IMPORT_PATH);
      }

      // Handle absolute paths
      return importPath.endsWith(TARGET_IMPORT_PATH);
    };

    // Helper function to process map calls
    const processMapCall = (node: TSESTree.CallExpression) => {
      // Get the callback function
      const callback = node.arguments[0];

      if (
        callback &&
        (callback.type === 'ArrowFunctionExpression' ||
          callback.type === 'FunctionExpression')
      ) {
        // Find the return statement or expression
        let returnExpr: TSESTree.Expression | null = null;

        if (
          callback.type === 'ArrowFunctionExpression' &&
          callback.expression &&
          callback.body.type !== 'BlockStatement'
        ) {
          // Arrow function with implicit return
          returnExpr = callback.body;
        } else {
          // Look for return statements in the function body
          const body = callback.body;
          if (body.type === 'BlockStatement') {
            for (const stmt of body.body) {
              if (stmt.type === 'ReturnStatement' && stmt.argument) {
                returnExpr = stmt.argument;
                break;
              }
            }
          }
        }

        // If we found a JSX element or fragment as the return value, mark it
        if (returnExpr) {
          if (returnExpr.type === 'JSXElement') {
            mapCallbackElements.add(returnExpr);
          } else if (returnExpr.type === 'JSXFragment') {
            mapCallbackElements.add(returnExpr);
          }
        }
      }
    };

    // Helper function to check if a node is a uuidv4Base62 call
    const isUuidv4Base62Call = (node: TSESTree.Node): boolean => {
      if (node.type !== 'CallExpression') return false;

      const callee = node.callee;
      if (callee.type === 'Identifier') {
        // Check if the identifier is in our tracked set of uuidv4Base62 imports
        return uuidv4Base62Identifiers.has(callee.name);
      }

      return false;
    };

    // Helper function to recursively check if an expression contains uuidv4Base62()
    const containsUuidv4Base62Call = (node: TSESTree.Node): boolean => {
      if (!node) return false;

      // Direct call to uuidv4Base62()
      if (isUuidv4Base62Call(node)) {
        return true;
      }

      // Check template literals
      if (node.type === 'TemplateLiteral') {
        for (const expr of node.expressions) {
          if (containsUuidv4Base62Call(expr)) {
            return true;
          }
        }
      }

      // Check binary expressions (string concatenation, etc.)
      if (node.type === 'BinaryExpression') {
        return containsUuidv4Base62Call(node.left) || containsUuidv4Base62Call(node.right);
      }

      // Check conditional expressions (ternary)
      if (node.type === 'ConditionalExpression') {
        return (
          containsUuidv4Base62Call(node.test) ||
          containsUuidv4Base62Call(node.consequent) ||
          containsUuidv4Base62Call(node.alternate)
        );
      }

      // Check logical expressions (&&, ||, ??)
      if (node.type === 'LogicalExpression') {
        return containsUuidv4Base62Call(node.left) || containsUuidv4Base62Call(node.right);
      }

      // Check function calls that might contain uuidv4Base62() as an argument
      if (node.type === 'CallExpression' && !isUuidv4Base62Call(node)) {
        return node.arguments.some(arg => containsUuidv4Base62Call(arg));
      }

      return false;
    };

    // Helper function to check if an element is within a map callback
    const isWithinMapCallback = (node: TSESTree.Node): boolean => {
      if (!node) return false;

      // Check if this element is directly a map callback element
      if (
        (node.type === 'JSXElement' || node.type === 'JSXFragment') &&
        mapCallbackElements.has(node)
      ) {
        return true;
      }

      // Check if this element is nested within a map callback element
      let parent = node.parent;
      while (parent) {
        if (
          (parent.type === 'JSXElement' || parent.type === 'JSXFragment') &&
          mapCallbackElements.has(parent)
        ) {
          return true;
        }
        parent = parent.parent;
      }

      return false;
    };

    // Helper function to check JSX attributes for uuidv4Base62 in keys
    const checkJSXAttributesForUuidv4Base62 = (attributes: (TSESTree.JSXAttribute | TSESTree.JSXSpreadAttribute)[]) => {
      for (const attr of attributes) {
        if (
          attr.type === 'JSXAttribute' &&
          attr.name.name === 'key' &&
          attr.value &&
          attr.value.type === 'JSXExpressionContainer'
        ) {
          const expression = attr.value.expression;

          // Check if the key is using uuidv4Base62() directly or in a complex expression
          if (containsUuidv4Base62Call(expression)) {
            context.report({
              node: attr,
              messageId: 'noUuidv4Base62AsKey',
            });
          }
        }
      }
    };

    return {
      // Track imports of uuidv4Base62
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importPath = node.source.value;

        // Check if this import is from our target path
        if (typeof importPath === 'string' && isTargetImportPath(importPath)) {
          // Process all specifiers to find uuidv4Base62
          for (const specifier of node.specifiers) {
            if (specifier.type === 'ImportSpecifier') {
              // Check for direct import or renamed import
              if (specifier.imported.name === 'uuidv4Base62') {
                // Add the local name to our tracked identifiers
                uuidv4Base62Identifiers.add(specifier.local.name);
              }
            }
          }
        }
      },

      // Find array.map() calls
      'CallExpression[callee.property.name="map"]'(node: TSESTree.CallExpression) {
        processMapCall(node);
      },

      // Check JSX elements for key props using uuidv4Base62
      JSXElement(node: TSESTree.JSXElement) {
        // Only check elements that are part of a map callback or nested within them
        if (!isWithinMapCallback(node)) {
          return;
        }

        // Check if this element has a key prop
        const openingElement = node.openingElement;
        const attributes = openingElement.attributes;
        checkJSXAttributesForUuidv4Base62(attributes);
      },

      // Handle JSX fragments (including shorthand syntax <>...</>)
      JSXFragment(node: TSESTree.JSXFragment) {
        // Only process if this fragment is directly within a map callback
        // (nested elements will be handled by the JSXElement visitor)
        if (isWithinMapCallback(node)) {
          // Track elements we've already checked to avoid duplicates
          const checkedElements = new Set<TSESTree.JSXElement>();

          // Process all child elements within the fragment
          for (const child of node.children) {
            if (child.type === 'JSXElement' && !checkedElements.has(child)) {
              checkedElements.add(child);
              const openingElement = child.openingElement;
              const attributes = openingElement.attributes;
              checkJSXAttributesForUuidv4Base62(attributes);
            }
          }
        }
      },

      // Handle conditional expressions that might contain map callbacks
      ConditionalExpression(node: TSESTree.ConditionalExpression) {
        // Check both the consequent and alternate branches
        if (
          node.consequent.type === 'CallExpression' &&
          node.consequent.callee.type === 'MemberExpression' &&
          node.consequent.callee.property.type === 'Identifier' &&
          node.consequent.callee.property.name === 'map'
        ) {
          processMapCall(node.consequent);
        }

        if (
          node.alternate.type === 'CallExpression' &&
          node.alternate.callee.type === 'MemberExpression' &&
          node.alternate.callee.property.type === 'Identifier' &&
          node.alternate.callee.property.name === 'map'
        ) {
          processMapCall(node.alternate);
        }
      },

      // Handle logical expressions (&&, ||) that might contain map callbacks
      LogicalExpression(node: TSESTree.LogicalExpression) {
        if (
          node.right.type === 'CallExpression' &&
          node.right.callee.type === 'MemberExpression' &&
          node.right.callee.property.type === 'Identifier' &&
          node.right.callee.property.name === 'map'
        ) {
          processMapCall(node.right);
        }
      },
    };
  },
});
