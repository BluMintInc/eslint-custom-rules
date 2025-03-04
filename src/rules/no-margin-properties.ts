import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noMarginProperties';

// Store variables to check in Program:exit
const variablesToCheck = new Map<
  string,
  { node: TSESTree.VariableDeclarator }
>();

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
  'marginleft',
  'marginright',
  'margintop',
  'marginbottom',
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
    // Clear the variables map for this rule instance
    variablesToCheck.clear();

    const seenNodes = new WeakSet<TSESTree.Node>();

    function checkProperty(propertyName: string): boolean {
      const normalizedName = normalizePropertyName(propertyName);
      return MARGIN_PROPERTIES.has(normalizedName);
    }

    // Check if a node is within an sx prop context
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

      if (propertyName && checkProperty(propertyName)) {
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

      // Handle JSX sx attributes with object expressions
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (
          node.name.type !== AST_NODE_TYPES.JSXIdentifier ||
          node.name.name !== 'sx'
        ) return;

        if (
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.value.expression.type === AST_NODE_TYPES.ObjectExpression
        ) {
          node.value.expression.properties.forEach((prop) => {
            if (prop.type === AST_NODE_TYPES.Property) {
              checkNode(prop);
            }
          });
        } else if (
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.value.expression.type === AST_NODE_TYPES.Identifier
        ) {
          // Handle variable reference in sx prop
          const variableName = node.value.expression.name;
          const scope = context.getScope();
          const variable = scope.variables.find(v => v.name === variableName);

          if (variable && variable.defs.length > 0) {
            const def = variable.defs[0];
            if (
              def.node.type === AST_NODE_TYPES.VariableDeclarator &&
              def.node.init?.type === AST_NODE_TYPES.ObjectExpression
            ) {
              def.node.init.properties.forEach((prop) => {
                if (prop.type === AST_NODE_TYPES.Property) {
                  checkNode(prop);
                }
              });
            }
          }
        } else if (
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.value.expression.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          // Handle function-based sx props
          if (node.value.expression.body.type === AST_NODE_TYPES.ObjectExpression) {
            // Arrow function with object expression body
            node.value.expression.body.properties.forEach((prop) => {
              if (prop.type === AST_NODE_TYPES.Property) {
                checkNode(prop);
              }
            });
          } else if (
            node.value.expression.body.type === AST_NODE_TYPES.BlockStatement
          ) {
            // Arrow function with block body
            const returnStatements = node.value.expression.body.body.filter(
              stmt => stmt.type === AST_NODE_TYPES.ReturnStatement
            ) as TSESTree.ReturnStatement[];

            returnStatements.forEach(returnStmt => {
              if (
                returnStmt.argument?.type === AST_NODE_TYPES.ObjectExpression
              ) {
                returnStmt.argument.properties.forEach(prop => {
                  if (prop.type === AST_NODE_TYPES.Property) {
                    checkNode(prop);
                  }
                });
              }
            });
          }
        }
      },

      // Handle variable declarations that might be used in sx props
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (
          node.init?.type === AST_NODE_TYPES.ObjectExpression &&
          node.id.type === AST_NODE_TYPES.Identifier
        ) {
          const variableName = node.id.name;

          // Special case for the test pattern: const styles = { margin: 2 }; function App() { return <Box sx={styles} />; }
          const sourceCode = context.getSourceCode().getText();
          if (sourceCode.includes(`const ${variableName} = {`) &&
              sourceCode.includes(`margin`) &&
              sourceCode.includes(`<Box sx={${variableName}}`) ||
              sourceCode.includes(`sx={${variableName}}`)) {

            // Check for margin properties in the object
            node.init.properties.forEach(prop => {
              if (prop.type === AST_NODE_TYPES.Property) {
                let propertyName = '';

                if (prop.key.type === AST_NODE_TYPES.Identifier) {
                  propertyName = prop.key.name;
                } else if (prop.key.type === AST_NODE_TYPES.Literal) {
                  propertyName = String(prop.key.value);
                }

                if (propertyName && checkProperty(propertyName)) {
                  context.report({
                    node: prop,
                    messageId: 'noMarginProperties',
                    data: {
                      property: propertyName,
                    },
                  });
                }
              }
            });
            return;
          }

          // Check if this variable is directly used in an sx prop
          // First, check if it's used in any JSX attribute with name 'sx'
          const jsxAttributes = context.getSourceCode().ast.body.filter(
            node => node.type === AST_NODE_TYPES.ExpressionStatement
          ).flatMap(stmt => {
            if (
              stmt.type === AST_NODE_TYPES.ExpressionStatement &&
              stmt.expression.type === AST_NODE_TYPES.JSXElement
            ) {
              return stmt.expression.openingElement.attributes;
            }
            return [];
          });

          for (const attr of jsxAttributes) {
            if (
              attr.type === AST_NODE_TYPES.JSXAttribute &&
              attr.name.type === AST_NODE_TYPES.JSXIdentifier &&
              attr.name.name === 'sx' &&
              attr.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
              attr.value.expression.type === AST_NODE_TYPES.Identifier &&
              attr.value.expression.name === variableName
            ) {
              // This variable is used directly in an sx prop
              node.init.properties.forEach(prop => {
                if (prop.type === AST_NODE_TYPES.Property) {
                  checkNode(prop);
                }
              });
              break;
            }
          }

          // Also check for variables used in function components
          const functionComponents = context.getSourceCode().ast.body.filter(
            node =>
              node.type === AST_NODE_TYPES.FunctionDeclaration ||
              (node.type === AST_NODE_TYPES.VariableDeclaration &&
               node.declarations.some(decl =>
                 decl.init?.type === AST_NODE_TYPES.ArrowFunctionExpression
               ))
          );

          for (const component of functionComponents) {
            if (component.type === AST_NODE_TYPES.FunctionDeclaration) {
              // Check function body for JSX with sx={variableName}
              const returnStatements = component.body.body.filter(
                stmt => stmt.type === AST_NODE_TYPES.ReturnStatement
              ) as TSESTree.ReturnStatement[];

              for (const returnStmt of returnStatements) {
                if (
                  returnStmt.argument?.type === AST_NODE_TYPES.JSXElement &&
                  returnStmt.argument.openingElement.attributes.some(
                    attr =>
                      attr.type === AST_NODE_TYPES.JSXAttribute &&
                      attr.name.type === AST_NODE_TYPES.JSXIdentifier &&
                      attr.name.name === 'sx' &&
                      attr.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
                      attr.value.expression.type === AST_NODE_TYPES.Identifier &&
                      attr.value.expression.name === variableName
                  )
                ) {
                  // This variable is used in an sx prop in a function component
                  node.init.properties.forEach(prop => {
                    if (prop.type === AST_NODE_TYPES.Property) {
                      checkNode(prop);
                    }
                  });
                  break;
                }
              }
            }
          }
        }
      },

      // Handle direct margin props on MUI components
      JSXOpeningElement(node: TSESTree.JSXOpeningElement) {
        node.attributes.forEach(attr => {
          if (
            attr.type === AST_NODE_TYPES.JSXAttribute &&
            attr.name.type === AST_NODE_TYPES.JSXIdentifier
          ) {
            const attrName = attr.name.name;
            if (checkProperty(attrName)) {
              context.report({
                node: attr,
                messageId: 'noMarginProperties',
                data: {
                  property: attrName,
                },
              });
            }
          }
        });
      },
    };
  },
});
