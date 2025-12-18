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
        'Authoritative rule: parameters with types ending in "Props" should be named "props" (or prefixed variants when multiple Props params exist)',
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
      currentParam: TSESTree.Parameter,
    ): string {
      const currentId = getIdFromParam(currentParam);
      const currentName = currentId?.name;
      const existingNames = new Set(
        allParams
          .map((p) => getIdFromParam(p))
          .filter(
            (id): id is TSESTree.Identifier => !!id && id.name !== currentName,
          )
          .map((id) => id.name),
      );

      if (typeName === 'Props') {
        let candidate = 'props';
        let suffix = 2;
        while (existingNames.has(candidate)) {
          candidate = `props${suffix++}`;
        }
        return candidate;
      }

      // Count how many parameters have Props types
      const propsParams = allParams.filter((param) => {
        if (
          param.type === AST_NODE_TYPES.Identifier &&
          param.typeAnnotation &&
          param.typeAnnotation.typeAnnotation
        ) {
          const paramTypeName = getTypeName(
            param.typeAnnotation.typeAnnotation,
          );
          return paramTypeName && endsWithProps(paramTypeName);
        }
        return false;
      });

      // If there's only one Props parameter, suggest "props"
      if (propsParams.length <= 1) {
        let candidate = 'props';
        let suffix = 2;
        while (existingNames.has(candidate)) {
          candidate = `props${suffix++}`;
        }
        return candidate;
      }

      // If there are multiple Props parameters, use prefixed names
      // For types like "UserProps", suggest "userProps"
      const baseName = typeName.slice(0, -5); // Remove "Props"
      const camelCaseBase =
        baseName.charAt(0).toLowerCase() + baseName.slice(1);

      let candidate = `${camelCaseBase}Props`;
      let i = 2;
      while (existingNames.has(candidate)) {
        candidate = `${camelCaseBase}Props${i++}`;
      }
      return candidate;
    }

    // Check if parameter is destructured
    function isDestructuredParameter(param: TSESTree.Parameter): boolean {
      if (
        param.type === AST_NODE_TYPES.ObjectPattern ||
        param.type === AST_NODE_TYPES.ArrayPattern
      ) {
        return true;
      }

      if (
        param.type === AST_NODE_TYPES.AssignmentPattern &&
        (param.left.type === AST_NODE_TYPES.ObjectPattern ||
          param.left.type === AST_NODE_TYPES.ArrayPattern)
      ) {
        return true;
      }

      if (param.type === AST_NODE_TYPES.TSParameterProperty) {
        const inner = param.parameter;
        if (
          inner.type === AST_NODE_TYPES.ObjectPattern ||
          inner.type === AST_NODE_TYPES.ArrayPattern
        ) {
          return true;
        }
        if (
          inner.type === AST_NODE_TYPES.AssignmentPattern &&
          (inner.left.type === AST_NODE_TYPES.ObjectPattern ||
            inner.left.type === AST_NODE_TYPES.ArrayPattern)
        ) {
          return true;
        }
      }

      return false;
    }

    function getIdFromParam(
      param: TSESTree.Parameter,
    ): TSESTree.Identifier | null {
      if (param.type === AST_NODE_TYPES.Identifier) return param;

      if (
        param.type === AST_NODE_TYPES.AssignmentPattern &&
        param.left.type === AST_NODE_TYPES.Identifier
      ) {
        return param.left;
      }

      if (param.type === AST_NODE_TYPES.TSParameterProperty) {
        const inner = param.parameter;
        if (inner.type === AST_NODE_TYPES.Identifier) return inner;
        if (
          inner.type === AST_NODE_TYPES.AssignmentPattern &&
          inner.left.type === AST_NODE_TYPES.Identifier
        ) {
          return inner.left;
        }
      }

      if (param.type === AST_NODE_TYPES.RestElement) {
        if (param.argument.type === AST_NODE_TYPES.Identifier) {
          return param.argument;
        }
      }

      return null;
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

      const sourceCode = context.getSourceCode();

      node.params.forEach((param) => {
        if (isDestructuredParameter(param)) {
          return;
        }

        const id = getIdFromParam(param);
        if (id && id.typeAnnotation && id.typeAnnotation.typeAnnotation) {
          const typeName = getTypeName(id.typeAnnotation.typeAnnotation);

          if (typeName && endsWithProps(typeName)) {
            const suggestedName = getSuggestedParameterName(
              typeName,
              node.params,
              param,
            );

            if (id.name !== suggestedName) {
              const messageId =
                suggestedName === 'props'
                  ? 'usePropsParameterName'
                  : 'usePropsParameterNameWithPrefix';

              context.report({
                node: id,
                messageId,
                data: {
                  typeName,
                  suggestedName,
                },
                fix: (fixer) => {
                  const token = sourceCode.getFirstToken(id);
                  if (!token) return null;
                  return fixer.replaceTextRange(
                    [token.range[0], token.range[1]],
                    suggestedName,
                  );
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
      const sourceCode = context.getSourceCode();

      method.params.forEach((param) => {
        if (isDestructuredParameter(param)) {
          return;
        }

        const id = getIdFromParam(param);
        if (id && id.typeAnnotation && id.typeAnnotation.typeAnnotation) {
          const typeName = getTypeName(id.typeAnnotation.typeAnnotation);

          if (typeName && endsWithProps(typeName)) {
            const suggestedName = getSuggestedParameterName(
              typeName,
              method.params,
              param,
            );

            if (id.name !== suggestedName) {
              const messageId =
                suggestedName === 'props'
                  ? 'usePropsParameterName'
                  : 'usePropsParameterNameWithPrefix';

              context.report({
                node: id,
                messageId,
                data: {
                  typeName,
                  suggestedName,
                },
                fix: (fixer) => {
                  const token = sourceCode.getFirstToken(id);
                  if (!token) return null;
                  return fixer.replaceTextRange(
                    [token.range[0], token.range[1]],
                    suggestedName,
                  );
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
