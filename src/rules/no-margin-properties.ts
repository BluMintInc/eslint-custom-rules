import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noMarginProperties';

type Options = [
  {
    autofix?: boolean;
  },
];

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

export const noMarginProperties = createRule<Options, MessageIds>({
  name: 'no-margin-properties',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prevent margin properties (margin, marginLeft, marginRight, marginTop, marginBottom, mx, my, etc.) in MUI styling because margins fight container-controlled spacing, double gutters, and misaligned breakpoints; keep spacing centralized with padding, gap, or spacing props instead.',
      recommended: 'warn',
    },
    schema: [
      {
        type: 'object',
        properties: {
          autofix: {
            type: 'boolean',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noMarginProperties:
        'Margin property "{{property}}" in MUI styling fights container-controlled spacing (Stack/Grid spacing, gap, responsive gutters) and produces double gutters, misalignment, and overflow as layouts shift. Keep spacing inside the component with padding or let the parent handle separation via gap/spacing so layout remains predictable.',
    },
  },
  defaultOptions: [{ autofix: false }],
  create(context) {
    const seenNodes = new WeakSet<TSESTree.Node>();
    // Note: autofix option is available but not currently implemented
    // Future implementation can use: const { autofix = false } = _options;

    function checkProperty(propertyName: string): boolean {
      const normalizedName = normalizePropertyName(propertyName);
      return MARGIN_PROPERTIES.has(normalizedName);
    }

    // Check if a node is within an sx prop context or theme override context
    function isMuiStylingContext(node: TSESTree.Node): boolean {
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

        // Check for theme overrides (MUI's createTheme)
        if (
          current.parent.type === AST_NODE_TYPES.Property &&
          current.parent.key.type === AST_NODE_TYPES.Identifier &&
          (current.parent.key.name === 'styleOverrides' ||
            current.parent.key.name === 'components')
        ) {
          return true;
        }

        // Check for MUI's css function
        if (
          current.parent.type === AST_NODE_TYPES.CallExpression &&
          current.parent.callee.type === AST_NODE_TYPES.Identifier &&
          current.parent.callee.name === 'css'
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
      } else if (
        node.computed &&
        node.key.type === AST_NODE_TYPES.TemplateLiteral
      ) {
        // Handle template literals like [`${prop}Top`]
        const quasis = node.key.quasis.map((q) => q.value.raw).join('');
        const expressions = node.key.expressions
          .map((exp) => {
            if (exp.type === AST_NODE_TYPES.Identifier) {
              return exp.name;
            }
            return '';
          })
          .join('');

        propertyName = quasis + expressions;
      }

      if (propertyName && checkProperty(propertyName)) {
        // Check if in MUI styling context
        if (isMuiStylingContext(node)) {
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

    // Check object expression for margin properties
    function checkObjectExpression(objExp: TSESTree.ObjectExpression): void {
      objExp.properties.forEach((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          checkNode(prop);
        } else if (
          prop.type === AST_NODE_TYPES.SpreadElement &&
          prop.argument.type === AST_NODE_TYPES.Identifier
        ) {
          // Handle spread elements by looking up the variable
          const variableName = prop.argument.name;
          const scope = context.getScope();
          const variable = scope.variables.find((v) => v.name === variableName);

          if (variable && variable.defs.length > 0) {
            const def = variable.defs[0];
            if (
              def.node.type === AST_NODE_TYPES.VariableDeclarator &&
              def.node.init?.type === AST_NODE_TYPES.ObjectExpression
            ) {
              checkObjectExpression(def.node.init);
            }
          }
        }
      });
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
        )
          return;

        if (
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.value.expression.type === AST_NODE_TYPES.ObjectExpression
        ) {
          checkObjectExpression(node.value.expression);
        } else if (
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.value.expression.type === AST_NODE_TYPES.Identifier
        ) {
          // Handle variable reference in sx prop
          const variableName = node.value.expression.name;
          const scope = context.getScope();
          const variable = scope.variables.find((v) => v.name === variableName);

          if (variable && variable.defs.length > 0) {
            const def = variable.defs[0];
            if (
              def.node.type === AST_NODE_TYPES.VariableDeclarator &&
              def.node.init?.type === AST_NODE_TYPES.ObjectExpression
            ) {
              checkObjectExpression(def.node.init);
            }
          }
        } else if (
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.value.expression.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          // Handle function-based sx props
          if (
            node.value.expression.body.type === AST_NODE_TYPES.ObjectExpression
          ) {
            // Arrow function with object expression body
            checkObjectExpression(node.value.expression.body);
          } else if (
            node.value.expression.body.type === AST_NODE_TYPES.BlockStatement
          ) {
            // Arrow function with block body
            const returnStatements = node.value.expression.body.body.filter(
              (stmt) => stmt.type === AST_NODE_TYPES.ReturnStatement,
            ) as TSESTree.ReturnStatement[];

            returnStatements.forEach((returnStmt) => {
              if (
                returnStmt.argument?.type === AST_NODE_TYPES.ObjectExpression
              ) {
                checkObjectExpression(returnStmt.argument);
              }
            });
          }
        } else if (
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.value.expression.type === AST_NODE_TYPES.ConditionalExpression
        ) {
          // Handle conditional expressions in sx props
          if (
            node.value.expression.consequent.type ===
            AST_NODE_TYPES.ObjectExpression
          ) {
            checkObjectExpression(node.value.expression.consequent);
          }
          if (
            node.value.expression.alternate.type ===
            AST_NODE_TYPES.ObjectExpression
          ) {
            checkObjectExpression(node.value.expression.alternate);
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
          const sourceText = context.sourceCode.getText();

          // Check for margin properties in the object
          node.init.properties.forEach((prop) => {
            if (prop.type === AST_NODE_TYPES.Property) {
              let propertyName = '';

              if (prop.key.type === AST_NODE_TYPES.Identifier) {
                propertyName = prop.key.name;
              } else if (prop.key.type === AST_NODE_TYPES.Literal) {
                propertyName = String(prop.key.value);
              }

              if (propertyName && checkProperty(propertyName)) {
                // Check if this variable is used in an sx prop
                if (
                  sourceText.includes(`sx={${variableName}}`) ||
                  sourceText.includes(`sx={{ ...${variableName}`) ||
                  sourceText.includes(`sx={Object.assign({}, ${variableName}`)
                ) {
                  context.report({
                    node: prop,
                    messageId: 'noMarginProperties',
                    data: {
                      property: propertyName,
                    },
                  });
                }
              }
            }
          });
        }
      },

      // Handle direct margin props on MUI components
      JSXOpeningElement(node: TSESTree.JSXOpeningElement) {
        node.attributes.forEach((attr) => {
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

      // Handle MUI's css function
      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'css' &&
          node.arguments.length > 0
        ) {
          const arg = node.arguments[0];
          if (arg.type === AST_NODE_TYPES.ObjectExpression) {
            checkObjectExpression(arg);
          }
        }

        // Handle createTheme for MUI theme overrides
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'createTheme' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === AST_NODE_TYPES.ObjectExpression
        ) {
          const themeObj = node.arguments[0];

          // Find components property in theme object
          const componentsProperty = themeObj.properties.find(
            (prop) =>
              prop.type === AST_NODE_TYPES.Property &&
              prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === 'components' &&
              prop.value.type === AST_NODE_TYPES.ObjectExpression,
          ) as TSESTree.Property | undefined;

          if (
            componentsProperty &&
            componentsProperty.value.type === AST_NODE_TYPES.ObjectExpression
          ) {
            // Check each component override
            componentsProperty.value.properties.forEach((componentProp) => {
              if (
                componentProp.type === AST_NODE_TYPES.Property &&
                componentProp.value.type === AST_NODE_TYPES.ObjectExpression
              ) {
                // Find styleOverrides property
                const styleOverrides = componentProp.value.properties.find(
                  (prop) =>
                    prop.type === AST_NODE_TYPES.Property &&
                    prop.key.type === AST_NODE_TYPES.Identifier &&
                    prop.key.name === 'styleOverrides' &&
                    prop.value.type === AST_NODE_TYPES.ObjectExpression,
                ) as TSESTree.Property | undefined;

                if (
                  styleOverrides &&
                  styleOverrides.value.type === AST_NODE_TYPES.ObjectExpression
                ) {
                  checkObjectExpression(styleOverrides.value);
                }
              }
            });
          }
        }
      },
    };
  },
});
