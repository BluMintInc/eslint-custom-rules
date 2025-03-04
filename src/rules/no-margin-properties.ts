import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noMarginProperties';

// Convert camelCase to kebab-case
function toKebabCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

// Normalize property name to kebab-case for consistent lookup
function normalizePropertyName(name: string): string {
  // If already contains hyphens, assume it's kebab-case
  if (name.includes('-')) return name.toLowerCase();
  // Convert camelCase to kebab-case
  return toKebabCase(name).toLowerCase();
}

// List of margin properties to flag
const MARGIN_PROPERTIES = new Set([
  'margin',
  'margin-left',
  'margin-right',
  'margin-top',
  'margin-bottom',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'm',
]);

export const noMarginProperties = createRule<[], MessageIds>({
  name: 'no-margin-properties',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage using margin properties (margin, marginLeft, marginRight, marginTop, marginBottom, mx, my, etc.) for spacing in MUI components. Instead, prefer defining spacing with padding, gap, or the spacing prop for more predictable layouts.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noMarginProperties:
        'Avoid using {{property}} for spacing in MUI components. Use padding, gap, or the spacing prop instead for more predictable layouts. See https://www.youtube.com/watch?v=KVQMoEFUee8 for more details.',
    },
  },
  defaultOptions: [],
  create(context) {
    const seenNodes = new WeakSet<TSESTree.Node>();

    function checkProperty(propertyName: string): boolean {
      const normalizedName = normalizePropertyName(propertyName);
      return MARGIN_PROPERTIES.has(normalizedName);
    }

    function isMuiSxContext(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;
      while (current?.parent) {
        // Check for JSX sx attribute (MUI specific)
        if (
          current.parent.type === AST_NODE_TYPES.JSXAttribute &&
          current.parent.name.type === AST_NODE_TYPES.JSXIdentifier &&
          current.parent.name.name === 'sx'
        ) {
          return true;
        }

        // Check for sx prop in object spread
        if (
          current.parent.type === AST_NODE_TYPES.Property &&
          current.parent.key.type === AST_NODE_TYPES.Identifier &&
          current.parent.key.name === 'sx'
        ) {
          return true;
        }

        // Check for variable that's used in sx prop
        if (
          current.type === AST_NODE_TYPES.VariableDeclarator &&
          current.id.type === AST_NODE_TYPES.Identifier
        ) {
          // This is a variable declaration, now we need to check if it's used in an sx prop
          const variableName = current.id.name;
          const sourceCode = context.getSourceCode();
          const references = sourceCode.getScope().references;

          for (const ref of references) {
            if (ref.identifier.name === variableName) {
              // Check if this reference is used in an sx prop
              let refNode: TSESTree.Node | undefined = ref.identifier;
              while (refNode?.parent) {
                if (
                  refNode.parent.type === AST_NODE_TYPES.JSXAttribute &&
                  refNode.parent.name.type === AST_NODE_TYPES.JSXIdentifier &&
                  refNode.parent.name.name === 'sx'
                ) {
                  return true;
                }
                refNode = refNode.parent;
              }
            }
          }
        }

        // Skip if we're in a TypeScript type definition
        if (
          current.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
          current.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
          current.type === AST_NODE_TYPES.TSPropertySignature
        ) {
          return false;
        }

        current = current.parent;
      }
      return false;
    }

    function checkNode(node: TSESTree.Property): void {
      // Skip if we've already processed this node
      if (seenNodes.has(node)) return;
      seenNodes.add(node);

      let propertyName = '';

      // Get property name
      if (node.key.type === AST_NODE_TYPES.Identifier) {
        propertyName = node.key.name;
      } else if (node.key.type === AST_NODE_TYPES.Literal) {
        propertyName = String(node.key.value);
      }

      if (checkProperty(propertyName)) {
        // Check if in MUI sx context
        if (isMuiSxContext(node)) {
          context.report({
            node,
            messageId: 'noMarginProperties',
            data: {
              property: propertyName,
            },
          });
        }
      }
    }

    return {
      // Handle object literal properties (inline styles)
      Property(node: TSESTree.Property) {
        if (node.parent?.type !== AST_NODE_TYPES.ObjectExpression) return;
        checkNode(node);
      },

      // Handle JSX sx attributes
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (node.name.name !== 'sx') return;

        if (
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.value.expression.type === AST_NODE_TYPES.ObjectExpression
        ) {
          node.value.expression.properties.forEach((prop) => {
            if (prop.type === AST_NODE_TYPES.Property) {
              checkNode(prop);
            }
          });
        }
      },

      // Handle variable declarations that might be used in sx props
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (
          node.init?.type === AST_NODE_TYPES.ObjectExpression &&
          node.id.type === AST_NODE_TYPES.Identifier
        ) {
          // Check if this variable is used in an sx prop
          if (isMuiSxContext(node)) {
            // Check all properties in the object for margin properties
            node.init.properties.forEach((prop) => {
              if (prop.type === AST_NODE_TYPES.Property) {
                checkNode(prop);
              }
            });
          }
        }
      },
    };
  },
});
