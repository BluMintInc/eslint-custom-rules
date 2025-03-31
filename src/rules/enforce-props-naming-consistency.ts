import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'usePropsName';
type Options = [];

export const enforcePropsNamingConsistency = createRule<Options, MessageIds>({
  name: 'enforce-props-naming-consistency',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce naming parameters "props" when their type ends with "Props"',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      usePropsName:
        'Parameter with a type ending in "Props" should be named "props" instead of "{{ paramName }}"',
    },
  },
  defaultOptions: [],
  create(context) {

    // Extract type name from a type annotation
    function getTypeName(typeAnnotation: TSESTree.TypeNode): string | null {
      if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = typeAnnotation.typeName;
        if (typeName.type === AST_NODE_TYPES.Identifier) {
          return typeName.name;
        }
      }
      return null;
    }

    // Check if a parameter should be named "props"
    function shouldBeNamedProps(param: TSESTree.Parameter | TSESTree.Identifier): boolean {
      // Only check non-destructured parameters
      if (param.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      // Check if the parameter has a type annotation
      if (!param.typeAnnotation || !param.typeAnnotation.typeAnnotation) {
        return false;
      }

      // Get the type name
      const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
      if (!typeName) {
        return false;
      }

      // Check if the type name ends with "Props"
      return typeName.endsWith('Props');
    }

    // Check if a parameter name is already prefixed with "props"
    function isPropsNameWithPrefix(paramName: string): boolean {
      return paramName.endsWith('Props') || paramName === 'props';
    }

    // Fix parameter name to "props"
    function fixParameterName(fixer: any, param: TSESTree.Identifier): any {
      return fixer.replaceText(param, 'props');
    }

    // Check function parameters
    function checkFunctionParams(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | TSESTree.TSMethodSignature,
    ): void {
      // Skip functions with multiple parameters that have Props types
      const propsTypeParams = node.params.filter(param => {
        if (param.type !== AST_NODE_TYPES.Identifier) return false;
        if (!param.typeAnnotation || !param.typeAnnotation.typeAnnotation) return false;
        const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
        return typeName && typeName.endsWith('Props');
      });

      if (propsTypeParams.length > 1) {
        return; // Skip functions with multiple Props parameters
      }

      for (const param of node.params) {
        if (
          shouldBeNamedProps(param) &&
          param.type === AST_NODE_TYPES.Identifier &&
          !isPropsNameWithPrefix(param.name)
        ) {
          context.report({
            node: param,
            messageId: 'usePropsName',
            data: { paramName: param.name },
            fix: (fixer) => fixParameterName(fixer, param),
          });
        }
      }
    }

    // Check class constructor parameters
    function checkClassConstructor(node: TSESTree.MethodDefinition): void {
      if (node.kind !== 'constructor') {
        return;
      }

      const constructor = node.value;

      // Skip constructors with multiple parameters that have Props types
      const propsTypeParams = constructor.params.filter(param => {
        if (param.type === AST_NODE_TYPES.Identifier) {
          if (!param.typeAnnotation || !param.typeAnnotation.typeAnnotation) return false;
          const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
          return typeName && typeName.endsWith('Props');
        } else if (param.type === AST_NODE_TYPES.TSParameterProperty && param.parameter.type === AST_NODE_TYPES.Identifier) {
          if (!param.parameter.typeAnnotation || !param.parameter.typeAnnotation.typeAnnotation) return false;
          const typeName = getTypeName(param.parameter.typeAnnotation.typeAnnotation);
          return typeName && typeName.endsWith('Props');
        }
        return false;
      });

      if (propsTypeParams.length > 1) {
        return; // Skip constructors with multiple Props parameters
      }

      for (const param of constructor.params) {
        if (
          shouldBeNamedProps(param) &&
          param.type === AST_NODE_TYPES.Identifier &&
          !isPropsNameWithPrefix(param.name)
        ) {
          context.report({
            node: param,
            messageId: 'usePropsName',
            data: { paramName: param.name },
            fix: (fixer) => fixParameterName(fixer, param),
          });
        } else if (
          param.type === AST_NODE_TYPES.TSParameterProperty &&
          param.parameter.type === AST_NODE_TYPES.Identifier &&
          shouldBeNamedProps(param.parameter) &&
          !isPropsNameWithPrefix(param.parameter.name)
        ) {
          context.report({
            node: param.parameter,
            messageId: 'usePropsName',
            data: { paramName: param.parameter.name },
            fix: (fixer) => {
              if (param.parameter.type === AST_NODE_TYPES.Identifier) {
                return fixParameterName(fixer, param.parameter);
              }
              return null;
            },
          });
        }
      }
    }

    return {
      FunctionDeclaration: checkFunctionParams,
      FunctionExpression: checkFunctionParams,
      ArrowFunctionExpression: checkFunctionParams,
      TSMethodSignature: checkFunctionParams,
      MethodDefinition: checkClassConstructor,
    };
  },
});
