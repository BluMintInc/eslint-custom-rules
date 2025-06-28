import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'usePropsParameterName' | 'usePropsParameterNameWithPrefix';
type Options = [];

export const enforcePropsArgumentName = createRule<Options, MessageIds>({
  name: 'enforce-props-argument-name',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce that parameters with types ending in "Props" should be named "props"',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      usePropsParameterName:
        'Parameter with type "{{ typeName }}" should be named "props"',
      usePropsParameterNameWithPrefix:
        'Parameter with type "{{ typeName }}" should be named "{{ suggestedName }}"',
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

    // Check if a type name ends with "Props"
    function endsWithProps(typeName: string): boolean {
      return typeName.endsWith('Props');
    }

    // Generate suggested parameter name for Props types
    function getSuggestedParameterName(
      typeName: string,
      allParams: TSESTree.Parameter[],
    ): string {
      if (typeName === 'Props') {
        return 'props';
      }

      // Count how many parameters have Props types
      const propsParams = allParams.filter((param) => {
        if (
          param.type === AST_NODE_TYPES.Identifier &&
          param.typeAnnotation &&
          param.typeAnnotation.typeAnnotation
        ) {
          const paramTypeName = getTypeName(param.typeAnnotation.typeAnnotation);
          return paramTypeName && endsWithProps(paramTypeName);
        }
        return false;
      });

      // If there's only one Props parameter, suggest "props"
      if (propsParams.length <= 1) {
        return 'props';
      }

      // If there are multiple Props parameters, use prefixed names
      // For types like "UserProps", suggest "userProps"
      const baseName = typeName.slice(0, -5); // Remove "Props"
      const camelCaseBase = baseName.charAt(0).toLowerCase() + baseName.slice(1);
      return `${camelCaseBase}Props`;
    }

    // Check if parameter is destructured
    function isDestructuredParameter(param: TSESTree.Parameter): boolean {
      return (
        param.type === AST_NODE_TYPES.ObjectPattern ||
        param.type === AST_NODE_TYPES.ArrayPattern
      );
    }



    // Check function parameters
    function checkFunctionParams(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | TSESTree.TSMethodSignature,
    ): void {
      // Skip function expressions that are part of method definitions
      // to avoid duplicate processing
      if (
        node.type === AST_NODE_TYPES.FunctionExpression &&
        node.parent &&
        node.parent.type === AST_NODE_TYPES.MethodDefinition
      ) {
        return;
      }

      node.params.forEach((param) => {
        // Skip destructured parameters
        if (isDestructuredParameter(param)) {
          return;
        }

        // Only check identifier parameters with type annotations
        if (
          param.type === AST_NODE_TYPES.Identifier &&
          param.typeAnnotation &&
          param.typeAnnotation.typeAnnotation
        ) {
          const typeName = getTypeName(param.typeAnnotation.typeAnnotation);

          if (typeName && endsWithProps(typeName)) {
            const suggestedName = getSuggestedParameterName(
              typeName,
              node.params,
            );

            if (param.name !== suggestedName) {
              const messageId =
                suggestedName === 'props'
                  ? 'usePropsParameterName'
                  : 'usePropsParameterNameWithPrefix';

              context.report({
                node: param,
                messageId,
                data: {
                  typeName,
                  suggestedName,
                },
                fix: (fixer) => {
                  // Create the replacement text with the type annotation
                  const typeText = param.typeAnnotation
                    ? context.getSourceCode().getText(param.typeAnnotation)
                    : '';
                  const optional = param.optional ? '?' : '';
                  return fixer.replaceText(param, `${suggestedName}${optional}${typeText}`);
                },
              });
            }
          }
        }
      });
    }



    // Check class method parameters (including constructors)
    function checkClassMethod(node: TSESTree.MethodDefinition): void {
      const method = node.value;
      method.params.forEach((param) => {
        // Skip destructured parameters
        if (isDestructuredParameter(param)) {
          return;
        }

        // Only check identifier parameters with type annotations
        if (
          param.type === AST_NODE_TYPES.Identifier &&
          param.typeAnnotation &&
          param.typeAnnotation.typeAnnotation
        ) {
          const typeName = getTypeName(param.typeAnnotation.typeAnnotation);

          if (typeName && endsWithProps(typeName)) {
            const suggestedName = getSuggestedParameterName(
              typeName,
              method.params,
            );

            if (param.name !== suggestedName) {
              const messageId =
                suggestedName === 'props'
                  ? 'usePropsParameterName'
                  : 'usePropsParameterNameWithPrefix';

              context.report({
                node: param,
                messageId,
                data: {
                  typeName,
                  suggestedName,
                },
                fix: (fixer) => {
                  const typeText = param.typeAnnotation
                    ? context.getSourceCode().getText(param.typeAnnotation)
                    : '';
                  const optional = param.optional ? '?' : '';
                  return fixer.replaceText(param, `${suggestedName}${optional}${typeText}`);
                },
              });
            }
          }
        }
      });
    }

    return {
      FunctionDeclaration: checkFunctionParams,
      FunctionExpression: checkFunctionParams,
      ArrowFunctionExpression: checkFunctionParams,
      TSMethodSignature: checkFunctionParams,
      MethodDefinition: checkClassMethod,
    };
  },
});
