import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'reactNodeShouldBeLowercase' | 'componentTypeShouldBeUppercase';

// Types that should have lowercase variable names
const LOWERCASE_TYPES = ['ReactNode', 'JSX.Element'];

// Types that should have uppercase variable names
const UPPERCASE_TYPES = ['ComponentType', 'FC', 'FunctionComponent'];

export const enforceReactTypeNaming = createRule<[], MessageIds>({
  name: 'enforce-react-type-naming',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce naming conventions for React types',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      reactNodeShouldBeLowercase:
        'Variables or parameters of type "{{type}}" should use lowercase naming (e.g., "{{suggestion}}").',
      componentTypeShouldBeUppercase:
        'Variables or parameters of type "{{type}}" should use uppercase naming (e.g., "{{suggestion}}").',
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Checks if a string starts with an uppercase letter
     */
    function isUppercase(str: string): boolean {
      return /^[A-Z]/.test(str);
    }

    /**
     * Converts a string to start with lowercase
     */
    function toLowercase(str: string): string {
      if (!str) return str;
      return str.charAt(0).toLowerCase() + str.slice(1);
    }

    /**
     * Converts a string to start with uppercase
     */
    function toUppercase(str: string): string {
      if (!str) return str;
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Extracts the type name from a type annotation
     */
    function getTypeName(typeAnnotation: TSESTree.TypeNode | undefined): string | null {
      if (!typeAnnotation) return null;

      // Handle TSTypeReference (e.g., ReactNode, ComponentType)
      if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
        if (typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier) {
          return typeAnnotation.typeName.name;
        }
        // Handle qualified names like JSX.Element
        if (typeAnnotation.typeName.type === AST_NODE_TYPES.TSQualifiedName) {
          const left = typeAnnotation.typeName.left.type === AST_NODE_TYPES.Identifier
            ? typeAnnotation.typeName.left.name
            : '';
          const right = typeAnnotation.typeName.right.name;
          return `${left}.${right}`;
        }
      }

      return null;
    }

    /**
     * Checks if a node is a destructured variable
     */
    function isDestructured(node: TSESTree.Node): boolean {
      return (
        node.parent?.type === AST_NODE_TYPES.Property ||
        node.parent?.type === AST_NODE_TYPES.ArrayPattern ||
        (node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          (node.parent.id.type === AST_NODE_TYPES.ObjectPattern ||
            node.parent.id.type === AST_NODE_TYPES.ArrayPattern))
      );
    }

    /**
     * Checks if a node is a default import
     */
    function isDefaultImport(node: TSESTree.Node): boolean {
      return (
        node.parent?.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
        (node.parent?.type === AST_NODE_TYPES.ImportSpecifier &&
         node.parent.local.name !== node.parent.imported?.name)
      );
    }

    /**
     * Check variable declarations for React type naming conventions
     */
    function checkVariableDeclaration(node: TSESTree.VariableDeclarator) {
      if (node.id.type !== AST_NODE_TYPES.Identifier) return;

      // Skip destructured variables
      if (isDestructured(node.id)) return;

      const variableName = node.id.name;

      // Get the type annotation
      const typeAnnotation = node.id.typeAnnotation?.typeAnnotation;
      const typeName = getTypeName(typeAnnotation);

      if (!typeName) return;

      // Check if it's a ReactNode or JSX.Element (should be lowercase)
      if (LOWERCASE_TYPES.includes(typeName) && isUppercase(variableName)) {
        const suggestion = toLowercase(variableName);
        context.report({
          node: node.id,
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: typeName,
            suggestion,
          },
          fix: (fixer) => fixer.replaceText(node.id, suggestion),
        });
      }

      // Check if it's a ComponentType or FC (should be uppercase)
      if (UPPERCASE_TYPES.includes(typeName) && !isUppercase(variableName)) {
        const suggestion = toUppercase(variableName);
        context.report({
          node: node.id,
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: typeName,
            suggestion,
          },
          fix: (fixer) => fixer.replaceText(node.id, suggestion),
        });
      }
    }

    /**
     * Check function parameters for React type naming conventions
     */
    function checkParameter(node: TSESTree.Parameter) {
      if (node.type !== AST_NODE_TYPES.Identifier) return;

      // Skip destructured parameters
      if (isDestructured(node)) return;

      // Skip default imports
      if (isDefaultImport(node)) return;

      const paramName = node.name;

      // Get the type annotation
      const typeAnnotation = node.typeAnnotation?.typeAnnotation;
      const typeName = getTypeName(typeAnnotation);

      if (!typeName) return;

      // Check if it's a ReactNode or JSX.Element (should be lowercase)
      if (LOWERCASE_TYPES.includes(typeName) && isUppercase(paramName)) {
        const suggestion = toLowercase(paramName);
        context.report({
          node,
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: typeName,
            suggestion,
          },
          fix: (fixer) => fixer.replaceText(node, suggestion),
        });
      }

      // Check if it's a ComponentType or FC (should be uppercase)
      if (UPPERCASE_TYPES.includes(typeName) && !isUppercase(paramName)) {
        const suggestion = toUppercase(paramName);
        context.report({
          node,
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: typeName,
            suggestion,
          },
          fix: (fixer) => fixer.replaceText(node, suggestion),
        });
      }
    }

    return {
      VariableDeclarator: checkVariableDeclaration,
      Identifier(node: TSESTree.Identifier) {
        // Check parameter names in function declarations
        if (
          node.parent &&
          (node.parent.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.parent.type === AST_NODE_TYPES.FunctionExpression ||
            node.parent.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
          node.parent.params.includes(node)
        ) {
          checkParameter(node);
        }
      },
    };
  },
});
