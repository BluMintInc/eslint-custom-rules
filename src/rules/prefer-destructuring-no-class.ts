import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferDestructuring';
type Options = [
  {
    object?: boolean;
    enforceForRenamedProperties?: boolean;
  },
];

const defaultOptions: [Options[0]] = [
  {
    object: true,
    enforceForRenamedProperties: false,
  },
];

function isClassInstance(node: TSESTree.Node, context: any): boolean {
  // Check if node is a MemberExpression
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    const object = node.object;

    // If object is a NewExpression, it's a class instance
    if (object.type === AST_NODE_TYPES.NewExpression) {
      return true;
    }

    // If object is an identifier, check if it refers to a class instance
    if (object.type === AST_NODE_TYPES.Identifier) {
      const variable = object.name;
      const scope = context.getScope();
      const ref = scope.references.find(
        (ref: any) => ref.identifier.name === variable,
      );

      if (
        ref?.resolved?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator
      ) {
        const init = ref.resolved.defs[0].node.init;
        return init?.type === AST_NODE_TYPES.NewExpression;
      }

      // Check if the identifier refers to a class (not an instance)
      if (
        ref?.resolved?.defs[0]?.node.type === AST_NODE_TYPES.ClassDeclaration
      ) {
        return false;
      }
    }

    // Recursively check if parent object is a class instance
    if (object.type === AST_NODE_TYPES.MemberExpression) {
      return isClassInstance(object, context);
    }
  }
  return false;
}

function isStaticClassMember(node: TSESTree.Node, context: any): boolean {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    const object = node.object;
    if (object.type === AST_NODE_TYPES.Identifier) {
      const variable = object.name;
      const scope = context.getScope();
      const ref = scope.references.find(
        (ref: any) => ref.identifier.name === variable,
      );
      return (
        ref?.resolved?.defs[0]?.node.type === AST_NODE_TYPES.ClassDeclaration
      );
    }
  }
  return false;
}

/**
 * Check if the property name matches the variable name in an assignment
 */
function isMatchingPropertyName(
  propertyNode: TSESTree.Node,
  variableName: string,
): boolean {
  if (propertyNode.type === AST_NODE_TYPES.Identifier) {
    return propertyNode.name === variableName;
  }
  if (propertyNode.type === AST_NODE_TYPES.Literal) {
    return propertyNode.value === variableName;
  }
  return false;
}

/**
 * Get the property text for destructuring
 */
function getPropertyText(
  property: TSESTree.Expression | TSESTree.PrivateIdentifier,
  computed: boolean,
  sourceCode: any,
): string {
  if (computed) {
    return sourceCode.getText(property);
  }

  if (property.type === AST_NODE_TYPES.Identifier) {
    return property.name;
  }

  if (property.type === AST_NODE_TYPES.Literal) {
    return String(property.value);
  }

  // For any other type, use the source text
  return sourceCode.getText(property);
}

export const preferDestructuringNoClass = createRule<Options, MessageIds>({
  name: 'prefer-destructuring-no-class',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce destructuring when accessing object properties, except for class instances',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          object: {
            type: 'boolean',
            default: true,
          },
          enforceForRenamedProperties: {
            type: 'boolean',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferDestructuring:
        'Property "{{property}}" from "{{object}}" is assigned via dot access{{targetNote}}. Destructure the property so the dependency is declared once and stays aligned with the source object. Use destructuring{{renamingHint}} (e.g., {{example}}).',
    },
  },
  defaultOptions,
  create(context) {
    const options = {
      object: defaultOptions[0].object,
      enforceForRenamedProperties:
        defaultOptions[0].enforceForRenamedProperties,
      ...context.options[0],
    };

    /**
     * Check if we're inside a class method
     */
    function isInsideClassMethod(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;

      // Traverse up the AST to find a MethodDefinition
      while (current && current.parent) {
        current = current.parent;
        if (current.type === AST_NODE_TYPES.MethodDefinition) {
          return true;
        }
      }

      return false;
    }

    /**
     * Check if destructuring should be used for this node
     */
    function shouldUseDestructuring(
      node: TSESTree.MemberExpression,
      leftNode: TSESTree.Node,
    ): boolean {
      // Skip if this is a class instance or static class member
      if (
        isClassInstance(node, context) ||
        isStaticClassMember(node, context)
      ) {
        return false;
      }

      // Skip if the object is 'this' and we're inside a class method
      if (
        node.object.type === AST_NODE_TYPES.ThisExpression &&
        isInsideClassMethod(node)
      ) {
        return false;
      }

      // Check object destructuring
      if (options.object) {
        if (options.enforceForRenamedProperties) {
          return true;
        }

        // Only suggest destructuring when property name matches variable name
        if (leftNode.type === AST_NODE_TYPES.Identifier) {
          return isMatchingPropertyName(node.property, leftNode.name);
        }
      }

      return false;
    }

    function buildReportDetails(
      memberExpr: TSESTree.MemberExpression,
      targetName: string | null,
      examplePrefix: string,
      exampleSuffix: string,
    ) {
      const contextWithSource = context as typeof context & {
        sourceCode?: TSESLint.SourceCode;
      };
      const sourceCode =
        contextWithSource.sourceCode ?? context.getSourceCode();
      const objectText = sourceCode.getText(memberExpr.object);
      const propertyText = getPropertyText(
        memberExpr.property,
        memberExpr.computed,
        sourceCode,
      );
      const usesRenaming =
        options.enforceForRenamedProperties &&
        !!targetName &&
        !isMatchingPropertyName(memberExpr.property, targetName);
      const aliasName = targetName ?? propertyText;

      return {
        propertyText,
        objectText,
        data: {
          property: propertyText,
          object: objectText,
          targetNote: usesRenaming && targetName ? ` to "${targetName}"` : '',
          renamingHint: usesRenaming ? ' with renaming' : '',
          example: usesRenaming
            ? `${examplePrefix}{ ${propertyText}: ${aliasName} } = ${objectText}${exampleSuffix}`
            : `${examplePrefix}{ ${propertyText} } = ${objectText}${exampleSuffix}`,
        },
      };
    }

    function generateVariableDeclaratorFix(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.VariableDeclarator,
      propertyText: string,
      objectText: string,
      memberExpr: TSESTree.MemberExpression,
    ) {
      const parentNode = node.parent;
      if (
        !parentNode ||
        parentNode.type !== AST_NODE_TYPES.VariableDeclaration
      ) {
        return null;
      }

      if (parentNode.declarations.length > 1) {
        return null;
      }

      const kind = parentNode.kind;

      if (
        options.enforceForRenamedProperties &&
        node.id.type === AST_NODE_TYPES.Identifier &&
        !isMatchingPropertyName(memberExpr.property, node.id.name)
      ) {
        return fixer.replaceText(
          parentNode,
          `${kind} { ${propertyText}: ${node.id.name} } = ${objectText};`,
        );
      }

      return fixer.replaceText(
        parentNode,
        `${kind} { ${propertyText} } = ${objectText};`,
      );
    }

    function generateAssignmentExpressionFix(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.AssignmentExpression,
      propertyText: string,
      objectText: string,
      memberExpr: TSESTree.MemberExpression,
    ) {
      if (
        options.enforceForRenamedProperties &&
        node.left.type === AST_NODE_TYPES.Identifier &&
        !isMatchingPropertyName(memberExpr.property, node.left.name)
      ) {
        return fixer.replaceText(
          node,
          `({ ${propertyText}: ${node.left.name} } = ${objectText})`,
        );
      }

      return fixer.replaceText(
        node,
        `({ ${propertyText} } = ${objectText})`,
      );
    }

    return {
      VariableDeclarator(node) {
        // Skip if variable is declared without assignment or if init is not a MemberExpression
        if (!node.init) return;
        if (node.init.type !== AST_NODE_TYPES.MemberExpression) return;

        const memberInit = node.init;
        if (!shouldUseDestructuring(memberInit, node.id)) {
          return;
        }

        const targetName =
          node.id.type === AST_NODE_TYPES.Identifier ? node.id.name : null;
        const { propertyText, objectText, data } = buildReportDetails(
          memberInit,
          targetName,
          `${
            node.parent?.type === AST_NODE_TYPES.VariableDeclaration
              ? node.parent.kind
              : 'const'
          } `,
          ';',
        );

        context.report({
          node,
          messageId: 'preferDestructuring',
          data,
          fix(fixer) {
            return generateVariableDeclaratorFix(
              fixer,
              node,
              propertyText,
              objectText,
              memberInit,
            );
          },
        });
      },

      AssignmentExpression(node) {
        if (
          node.operator === '=' &&
          node.right.type === AST_NODE_TYPES.MemberExpression
        ) {
          const memberRight = node.right;
          if (!shouldUseDestructuring(node.right, node.left)) {
            return;
          }

          const targetName =
            node.left.type === AST_NODE_TYPES.Identifier
              ? node.left.name
              : null;
          const { propertyText, objectText, data } = buildReportDetails(
            memberRight,
            targetName,
            '(',
            ')',
          );

          context.report({
            node,
            messageId: 'preferDestructuring',
            data,
            fix(fixer) {
              return generateAssignmentExpressionFix(
                fixer,
                node,
                propertyText,
                objectText,
                memberRight,
              );
            },
          });
        }
      },
    };
  },
});
