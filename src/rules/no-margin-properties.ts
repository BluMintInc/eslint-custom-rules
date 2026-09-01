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

/**
 * `x as T`, `<T>x`, `x satisfies T` and `x!` assert a type without contributing
 * a value of their own, so a check that classifies the *shape* of an expression
 * must look through all four alike.
 *
 * This matters beyond hand-written code: sibling rules' autofixes append
 * ` as const` to the very object literals this rule inspects
 * (`global-const-style` rewrites `const styles = { margin: 8 }` into
 * `const STYLES = { margin: 8 } as const`). A bare
 * `node.type === ObjectExpression` test taken on the wrapper therefore goes
 * silent on code `eslint --fix` had just reported (Issue #1805).
 */
const ASSERTION_EXPRESSION_TYPES = new Set([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
]);

type AssertionExpression =
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.TSTypeAssertion;

const isAssertionExpression = (
  node: TSESTree.Node,
): node is AssertionExpression => ASSERTION_EXPRESSION_TYPES.has(node.type);

/**
 * Peels every assertion wrapper off an expression, so `{ m: 1 } as const`,
 * `<const>{ m: 1 }` and chains such as `{ m: 1 } as const satisfies Styles`
 * all classify as the object literal they wrap.
 */
function unwrapAssertions(node: TSESTree.Node): TSESTree.Node {
  let target: TSESTree.Node = node;
  while (isAssertionExpression(target)) {
    target = target.expression;
  }
  return target;
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
        'Prevent margin properties (margin, marginLeft, marginRight, marginTop, marginBottom, mx, my, etc.) in MUI styling because margins fight container-controlled spacing, double gutters, and misaligned breakpoints; keep spacing centralized with padding, gap, or spacing props instead.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noMarginProperties:
        'Margin property "{{property}}" in MUI styling fights container-controlled spacing (Stack/Grid spacing, gap, responsive gutters) and produces double gutters, misalignment, and overflow as layouts shift. Keep spacing inside the component with padding or let the parent handle separation via gap/spacing so layout remains predictable.',
    },
  },
  defaultOptions: [],
  create(context) {
    const seenNodes = new WeakSet<TSESTree.Node>();

    function checkProperty(propertyName: string): boolean {
      const normalizedName = normalizePropertyName(propertyName);
      return MARGIN_PROPERTIES.has(normalizedName);
    }

    /**
     * True if node is in a flagged MUI styling context (sx attribute, sx
     * object property, or css() call). Excludes createTheme styleOverrides:
     * theme margins ARE the container-controlled styling (viewport insets,
     * resets of MUI's built-in margins, internal layout), not the
     * sibling-spacing this rule targets.
     */
    function isMuiStylingContext(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;

      // An assertion wrapper (`{ m: 1 } as const`) is transparent to this
      // climb: it matches none of the terminal predicates below, so the loop
      // steps over it and keeps ascending. Any terminal branch added here must
      // preserve that — concluding *at* an assertion would decide the styling
      // context from the type syntax an author happened to reach for.
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

        // Check for MUI's css function
        if (current.parent.type === AST_NODE_TYPES.CallExpression) {
          const callee = unwrapAssertions(current.parent.callee);
          if (
            callee.type === AST_NODE_TYPES.Identifier &&
            callee.name === 'css'
          ) {
            return true;
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

      // A computed key carries its own assertions (`['margin' as const]`), so
      // the key is classified through them as well.
      const key = unwrapAssertions(node.key);

      let propertyName = '';

      // Get property name
      if (key.type === AST_NODE_TYPES.Identifier) {
        propertyName = key.name;
      } else if (key.type === AST_NODE_TYPES.Literal) {
        propertyName = String(key.value);
      } else if (node.computed && key.type === AST_NODE_TYPES.TemplateLiteral) {
        // Handle template literals like [`${prop}Top`]
        const quasis = key.quasis.map((q) => q.value.raw).join('');
        const expressions = key.expressions
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

    /**
     * Resolves an identifier to the object literal it is initialized with,
     * looking through any assertion wrappers on that initializer.
     */
    function resolveObjectLiteral(
      variableName: string,
    ): TSESTree.ObjectExpression | undefined {
      const scope = context.getScope();
      const variable = scope.variables.find((v) => v.name === variableName);

      if (!variable || variable.defs.length === 0) return undefined;

      const def = variable.defs[0];
      if (
        def.node.type !== AST_NODE_TYPES.VariableDeclarator ||
        !def.node.init
      ) {
        return undefined;
      }

      const init = unwrapAssertions(def.node.init);
      return init.type === AST_NODE_TYPES.ObjectExpression ? init : undefined;
    }

    // Check object expression for margin properties
    function checkObjectExpression(objExp: TSESTree.ObjectExpression): void {
      objExp.properties.forEach((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          checkNode(prop);
        } else if (prop.type === AST_NODE_TYPES.SpreadElement) {
          // Handle spread elements by looking up the variable
          const spreadArgument = unwrapAssertions(prop.argument);
          if (spreadArgument.type === AST_NODE_TYPES.Identifier) {
            const spreadSource = resolveObjectLiteral(spreadArgument.name);
            if (spreadSource) {
              checkObjectExpression(spreadSource);
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

        if (node.value?.type !== AST_NODE_TYPES.JSXExpressionContainer) return;

        const expression = unwrapAssertions(node.value.expression);

        if (expression.type === AST_NODE_TYPES.ObjectExpression) {
          checkObjectExpression(expression);
        } else if (expression.type === AST_NODE_TYPES.Identifier) {
          // Handle variable reference in sx prop
          const referenced = resolveObjectLiteral(expression.name);
          if (referenced) {
            checkObjectExpression(referenced);
          }
        } else if (expression.type === AST_NODE_TYPES.ArrowFunctionExpression) {
          // Handle function-based sx props
          const body = unwrapAssertions(expression.body);

          if (body.type === AST_NODE_TYPES.ObjectExpression) {
            // Arrow function with object expression body
            checkObjectExpression(body);
          } else if (body.type === AST_NODE_TYPES.BlockStatement) {
            // Arrow function with block body
            const returnStatements = body.body.filter(
              (stmt) => stmt.type === AST_NODE_TYPES.ReturnStatement,
            ) as TSESTree.ReturnStatement[];

            returnStatements.forEach((returnStmt) => {
              if (!returnStmt.argument) return;
              const returned = unwrapAssertions(returnStmt.argument);
              if (returned.type === AST_NODE_TYPES.ObjectExpression) {
                checkObjectExpression(returned);
              }
            });
          }
        } else if (expression.type === AST_NODE_TYPES.ConditionalExpression) {
          // Handle conditional expressions in sx props
          const consequent = unwrapAssertions(expression.consequent);
          if (consequent.type === AST_NODE_TYPES.ObjectExpression) {
            checkObjectExpression(consequent);
          }
          const alternate = unwrapAssertions(expression.alternate);
          if (alternate.type === AST_NODE_TYPES.ObjectExpression) {
            checkObjectExpression(alternate);
          }
        }
      },

      // Handle variable declarations that might be used in sx props
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (!node.init || node.id.type !== AST_NODE_TYPES.Identifier) return;

        const init = unwrapAssertions(node.init);

        if (init.type === AST_NODE_TYPES.ObjectExpression) {
          const variableName = node.id.name;
          const sourceText = context.getSourceCode().getText();

          // Check for margin properties in the object
          init.properties.forEach((prop) => {
            if (prop.type === AST_NODE_TYPES.Property) {
              const key = unwrapAssertions(prop.key);
              let propertyName = '';

              if (key.type === AST_NODE_TYPES.Identifier) {
                propertyName = key.name;
              } else if (key.type === AST_NODE_TYPES.Literal) {
                propertyName = String(key.value);
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
        const callee = unwrapAssertions(node.callee);
        if (
          callee.type === AST_NODE_TYPES.Identifier &&
          callee.name === 'css' &&
          node.arguments.length > 0
        ) {
          const arg = unwrapAssertions(node.arguments[0]);
          if (arg.type === AST_NODE_TYPES.ObjectExpression) {
            checkObjectExpression(arg);
          }
        }
      },
    };
  },
});
