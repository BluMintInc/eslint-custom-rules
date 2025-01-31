import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useFieldPath';

function isObjectExpression(node: TSESTree.Node): node is TSESTree.ObjectExpression {
  return node.type === AST_NODE_TYPES.ObjectExpression;
}

function isPropertyWithNestedObject(prop: TSESTree.Property): boolean {
  return prop.value.type === AST_NODE_TYPES.ObjectExpression;
}

function flattenObject(obj: TSESTree.ObjectExpression, prefix = ''): Record<string, TSESTree.Expression> {
  const result: Record<string, TSESTree.Expression> = {};

  for (const prop of obj.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;

    const key = prop.key.type === AST_NODE_TYPES.Identifier ? prop.key.name :
                prop.key.type === AST_NODE_TYPES.Literal ? String(prop.key.value) : '';
    if (!key) continue;

    const currentPrefix = prefix ? `${prefix}.${key}` : key;
    const value = prop.value;

    if (isObjectExpression(value)) {
      const nested = flattenObject(value, currentPrefix);
      Object.assign(result, nested);
    } else if (value.type === AST_NODE_TYPES.CallExpression ||
               value.type === AST_NODE_TYPES.Literal ||
               value.type === AST_NODE_TYPES.Identifier) {
      result[currentPrefix] = value;
    }
  }

  return result;
}

function generateFix(node: TSESTree.ObjectExpression): string {
  const flattened = flattenObject(node);
  const entries = Object.entries(flattened);

  const properties = entries.map(([key, value]) => {
    const valueText = value.type === AST_NODE_TYPES.CallExpression ? 'FieldValue.delete()' :
                     value.type === AST_NODE_TYPES.Literal ? `'${value.value}'` :
                     'value';
    return `'${key}': ${valueText}`;
  });

  return `{ ${properties.join(', ')} }`;
}

export const enforceFieldPathMerge = createRule<[], MessageIds>({
  name: 'enforce-fieldpath-merge',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce FieldPath usage when merging Firestore documents',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useFieldPath: 'Use dot notation (FieldPath) instead of nested objects when using merge: true',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'set' &&
          node.arguments.length >= 2
        ) {
          const [dataArg, optionsArg] = node.arguments;

          // Check if merge: true is present
          if (
            optionsArg.type === AST_NODE_TYPES.ObjectExpression &&
            optionsArg.properties.some(
              prop =>
                prop.type === AST_NODE_TYPES.Property &&
                prop.key.type === AST_NODE_TYPES.Identifier &&
                prop.key.name === 'merge' &&
                prop.value.type === AST_NODE_TYPES.Literal &&
                prop.value.value === true
            )
          ) {
            // Check if first argument is an object with nested properties
            if (dataArg.type === AST_NODE_TYPES.ObjectExpression) {
              const hasNestedObjects = dataArg.properties.some(prop =>
                prop.type === AST_NODE_TYPES.Property && isPropertyWithNestedObject(prop)
              );

              if (hasNestedObjects) {
                context.report({
                  node: dataArg,
                  messageId: 'useFieldPath',
                  fix(fixer) {
                    return fixer.replaceText(dataArg, generateFix(dataArg));
                  },
                });
              }
            }
          }
        }
      },
    };
  },
});
