import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noComplexObjects';

export const noComplexCloudParams = createRule<[], MessageIds>({
  name: 'no-complex-cloud-params',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow passing complex objects to cloud functions',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noComplexObjects:
        'Do not pass complex objects to cloud functions. Complex objects include class instances, objects with methods, non-serializable values (RegExp, BigInt, TypedArray, etc.), or objects with nested complex properties.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track imported cloud functions
    const cloudFunctions = new Set<string>();

    function isFunction(node: TSESTree.Node): boolean {
      return [
        AST_NODE_TYPES.FunctionExpression,
        AST_NODE_TYPES.ArrowFunctionExpression,
        AST_NODE_TYPES.MethodDefinition,
      ].includes(node.type);
    }

    function isMethod(
      node: TSESTree.Property | TSESTree.MethodDefinition,
    ): boolean {
      return (
        node.type === AST_NODE_TYPES.MethodDefinition ||
        (node.type === AST_NODE_TYPES.Property &&
          (node.method || isFunction(node.value)))
      );
    }

    function isClassInstance(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.NewExpression) {
        // Check for known non-serializable constructors
        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          const nonSerializableTypes = new Set([
            'RegExp',
            'BigInt',
            'Int8Array',
            'Uint8Array',
            'Uint8ClampedArray',
            'Int16Array',
            'Uint16Array',
            'Int32Array',
            'Uint32Array',
            'Float32Array',
            'Float64Array',
            'BigInt64Array',
            'BigUint64Array',
            'WeakMap',
            'WeakSet',
            'Promise',
            'Error',
            'Proxy',
          ]);
          if (nonSerializableTypes.has(node.callee.name)) {
            return true;
          }
        }
        return true;
      }

      if (node.type === AST_NODE_TYPES.Identifier) {
        // Try to find the variable declaration
        const scope = context.getScope();
        const variable = scope.variables.find((v) => v.name === node.name);
        if (variable && variable.defs.length > 0) {
          const def = variable.defs[0];
          if (
            def.node.type === AST_NODE_TYPES.VariableDeclarator &&
            def.node.init
          ) {
            return isClassInstance(def.node.init);
          }
        }
        // Check if the identifier starts with a capital letter (potential class instance)
        return node.name[0] === node.name[0].toUpperCase();
      }

      return false;
    }

    function isNonSerializableLiteral(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.Literal &&
        (node.regex !== undefined || // RegExp literal
          node.bigint !== undefined) // BigInt literal
      );
    }

    function hasComplexProperties(node: TSESTree.Node): boolean {
      switch (node.type) {
        case AST_NODE_TYPES.ObjectExpression:
          return node.properties.some((prop) => {
            if (prop.type === AST_NODE_TYPES.Property) {
              // Check if property is a method
              if (isMethod(prop)) return true;

              // Check if property value is a function
              if (isFunction(prop.value)) return true;

              // Check if property value is a class instance
              if (isClassInstance(prop.value)) return true;

              // Check if property value is a non-serializable literal
              if (isNonSerializableLiteral(prop.value)) return true;

              // Recursively check nested objects
              return hasComplexProperties(prop.value);
            }
            return false;
          });

        case AST_NODE_TYPES.ArrayExpression:
          return node.elements.some(
            (element) => element !== null && hasComplexProperties(element),
          );

        case AST_NODE_TYPES.Identifier:
          // Try to find the variable declaration
          const scope = context.getScope();
          const variable = scope.variables.find((v) => v.name === node.name);
          if (variable && variable.defs.length > 0) {
            const def = variable.defs[0];
            if (
              def.node.type === AST_NODE_TYPES.VariableDeclarator &&
              def.node.init
            ) {
              return hasComplexProperties(def.node.init);
            }
          }
          // Check for class instances
          return isClassInstance(node);

        case AST_NODE_TYPES.NewExpression:
          return true;

        case AST_NODE_TYPES.CallExpression:
          // Check if the call is to a class constructor or returns a complex object
          return isClassInstance(node.callee) || hasComplexProperties(node.callee);

        case AST_NODE_TYPES.Property:
          return (
            isMethod(node) ||
            isFunction(node.value) ||
            hasComplexProperties(node.value)
          );

        case AST_NODE_TYPES.ObjectPattern:
          return node.properties.some((prop) => hasComplexProperties(prop));

        case AST_NODE_TYPES.MemberExpression:
          // Check if the member expression resolves to a complex object
          const object = node.object;
          const property = node.property;
          return (
            hasComplexProperties(object) ||
            (property.type === AST_NODE_TYPES.Identifier &&
              property.name === 'prototype')
          );

        case AST_NODE_TYPES.Literal:
          return isNonSerializableLiteral(node);

        default:
          return false;
      }
    }

    return {
      // Track cloud function imports
      ImportExpression(node) {
        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          typeof node.source.value === 'string' &&
          node.source.value.includes('firebaseCloud')
        ) {
          // Find the variable declarator that contains this import
          let parent = node.parent;
          while (parent && parent.type !== AST_NODE_TYPES.VariableDeclarator) {
            parent = parent.parent;
          }
          if (parent && parent.type === AST_NODE_TYPES.VariableDeclarator) {
            // Get the destructured identifiers
            if (parent.id.type === AST_NODE_TYPES.ObjectPattern) {
              parent.id.properties.forEach((prop) => {
                if (
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.value.type === AST_NODE_TYPES.Identifier
                ) {
                  cloudFunctions.add(prop.value.name);
                }
              });
            }
          }
        }
      },

      CallExpression(node) {
        // Check if this is a cloud function call
        const callee = node.callee;
        if (
          callee.type !== AST_NODE_TYPES.Identifier ||
          !cloudFunctions.has(callee.name)
        ) {
          return;
        }

        // Check arguments for complex objects
        node.arguments.forEach((arg) => {
          if (hasComplexProperties(arg)) {
            context.report({
              node: arg,
              messageId: 'noComplexObjects',
            });
          }
        });
      },
    };
  },
});
