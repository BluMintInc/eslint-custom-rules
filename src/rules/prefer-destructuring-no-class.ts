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

    function isIdentifierTarget(
      node: TSESTree.Node,
    ): node is TSESTree.Identifier {
      return node.type === AST_NODE_TYPES.Identifier;
    }

    function isSkippedClassMemberAccess(
      memberExpression: TSESTree.MemberExpression,
    ): boolean {
      return (
        isClassInstance(memberExpression, context) ||
        isStaticClassMember(memberExpression, context)
      );
    }

    function isThisMemberInClassMethod(
      memberExpression: TSESTree.MemberExpression,
    ): boolean {
      return (
        memberExpression.object.type === AST_NODE_TYPES.ThisExpression &&
        isInsideClassMethod(memberExpression)
      );
    }

    function canDestructureObjectProperty(
      memberExpression: TSESTree.MemberExpression,
      identifier: TSESTree.Identifier,
    ): boolean {
      if (!options.object) {
        return false;
      }

      if (options.enforceForRenamedProperties) {
        return true;
      }

      return isMatchingPropertyName(memberExpression.property, identifier.name);
    }

    /**
     * Check if destructuring should be used for this node
     */
    function shouldUseDestructuring(
      node: TSESTree.MemberExpression,
      leftNode: TSESTree.Node,
    ): boolean {
      if (!isIdentifierTarget(leftNode)) {
        return false;
      }

      return (
        !isSkippedClassMemberAccess(node) &&
        !isThisMemberInClassMethod(node) &&
        canDestructureObjectProperty(node, leftNode)
      );
    }

    /**
     * Extracts the property name from a MemberExpression when it can be safely compared.
     */
    function getMemberExpressionPropertyName(
      memberExpression: TSESTree.MemberExpression,
    ): string | null {
      if (memberExpression.property.type === AST_NODE_TYPES.PrivateIdentifier) {
        return null;
      }

      if (!memberExpression.computed) {
        if (memberExpression.property.type === AST_NODE_TYPES.Identifier) {
          return memberExpression.property.name;
        }

        return null;
      }

      if (
        memberExpression.property.type === AST_NODE_TYPES.Literal &&
        typeof memberExpression.property.value === 'string'
      ) {
        return memberExpression.property.value;
      }

      return null;
    }

    /**
     * Look up a variable by name within a scope.
     */
    function findVariableInScope(
      scope: TSESLint.Scope.Scope | null,
      name: string,
    ): TSESLint.Scope.Variable | undefined {
      return scope?.variables.find((variable) => variable.name === name);
    }

    /**
     * Check whether a variable definition originates from a parameter.
     */
    function isParameterDefinition(
      variable: TSESLint.Scope.Variable | undefined,
    ): boolean {
      if (!variable || !Array.isArray(variable.defs)) {
        return false;
      }

      return variable.defs.some(
        (definition) => definition.type === 'Parameter',
      );
    }

    /**
     * Determine whether an identifier refers to a function or method parameter.
     */
    function isFunctionParameter(identifier: TSESTree.Identifier): boolean {
      let scope: TSESLint.Scope.Scope | null = context.getScope();

      while (scope) {
        const variable = findVariableInScope(scope, identifier.name);
        if (variable) {
          return isParameterDefinition(variable);
        }

        scope = scope.upper;
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

      return fixer.replaceText(node, `({ ${propertyText} } = ${objectText})`);
    }

    /**
     * Report assignments that copy properties from parameter objects to class fields.
     * These are reported without a fixer to avoid changing function signatures.
     */
    function handleClassPropertyAssignment(
      node: TSESTree.AssignmentExpression & {
        right: TSESTree.MemberExpression;
      },
    ): void {
      // Caller ensures node.right is a MemberExpression.
      if (
        !options.object ||
        node.left.type !== AST_NODE_TYPES.MemberExpression ||
        node.left.object.type !== AST_NODE_TYPES.ThisExpression
      ) {
        return;
      }

      const rightObject = node.right.object;

      if (
        rightObject.type !== AST_NODE_TYPES.Identifier ||
        !isFunctionParameter(rightObject)
      ) {
        return;
      }

      const leftPropertyName = getMemberExpressionPropertyName(node.left);
      const rightPropertyName = getMemberExpressionPropertyName(node.right);

      if (!leftPropertyName || !rightPropertyName) {
        return;
      }

      if (
        !options.enforceForRenamedProperties &&
        leftPropertyName !== rightPropertyName
      ) {
        return;
      }

      if (
        isClassInstance(node.right, context) ||
        isStaticClassMember(node.right, context)
      ) {
        return;
      }

      const { data } = buildReportDetails(
        node.right,
        leftPropertyName,
        '(',
        ')',
      );

      // No fixer here because destructuring parameters changes the function signature and must stay manual.
      context.report({
        node,
        messageId: 'preferDestructuring',
        data,
      });
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
          node.operator !== '=' ||
          node.right.type !== AST_NODE_TYPES.MemberExpression
        ) {
          return;
        }

        const memberRight = node.right;
        if (shouldUseDestructuring(memberRight, node.left)) {
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
          return;
        }

        handleClassPropertyAssignment(
          node as TSESTree.AssignmentExpression & {
            right: TSESTree.MemberExpression;
          },
        );
      },
    };
  },
});
