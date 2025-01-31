import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'tooManyParams' | 'sameTypeParams';
type Options = [
  {
    minimumParameters?: number;
    checkSameTypeParameters?: boolean;
    ignoreBoundMethods?: boolean;
    ignoreVariadicFunctions?: boolean;
  },
];

const defaultOptions: Options[0] = {
  minimumParameters: 3,
  checkSameTypeParameters: true,
  ignoreBoundMethods: true,
  ignoreVariadicFunctions: true,
};

export const preferSettingsObject = createRule<Options, MessageIds>({
  name: 'prefer-settings-object',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using a settings object for functions with multiple parameters',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          minimumParameters: {
            type: 'number',
            minimum: 2,
          },
          checkSameTypeParameters: {
            type: 'boolean',
          },
          ignoreBoundMethods: {
            type: 'boolean',
          },
          ignoreVariadicFunctions: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooManyParams: 'Function has too many parameters ({{count}}). Use a settings object instead.',
      sameTypeParams: 'Function has multiple parameters of the same type. Use a settings object instead.',
    },
  },
  defaultOptions: [defaultOptions],
  create(context, [options]) {
    const finalOptions = { ...defaultOptions, ...options };

    function getParameterType(param: TSESTree.Parameter): string {
      if (param.type === AST_NODE_TYPES.AssignmentPattern) {
        return getParameterType(param.left as TSESTree.Parameter);
      }
      if (param.type === AST_NODE_TYPES.Identifier && param.typeAnnotation) {
        const typeNode = param.typeAnnotation.typeAnnotation;
        if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
          return typeNode.typeName.type === AST_NODE_TYPES.Identifier
            ? typeNode.typeName.name
            : 'unknown';
        }
        if (typeNode.type === AST_NODE_TYPES.TSStringKeyword) return 'string';
        if (typeNode.type === AST_NODE_TYPES.TSNumberKeyword) return 'number';
        if (typeNode.type === AST_NODE_TYPES.TSBooleanKeyword) return 'boolean';
        return typeNode.type;
      }
      return 'unknown';
    }

    function hasSameTypeParameters(params: TSESTree.Parameter[]): boolean {
      const typeMap = new Map<string, number>();

      for (const param of params) {
        const type = getParameterType(param);
        typeMap.set(type, (typeMap.get(type) || 0) + 1);

        if (typeMap.get(type)! > 1) {
          return true;
        }
      }

      return false;
    }

    function shouldIgnoreNode(node: TSESTree.Node): boolean {
      // Ignore variadic functions if configured
      if (finalOptions.ignoreVariadicFunctions) {
        const hasRestParam = node.type === AST_NODE_TYPES.FunctionDeclaration &&
          node.params.some(param => param.type === AST_NODE_TYPES.RestElement);
        if (hasRestParam) return true;
      }

      // Ignore bound methods if configured
      if (finalOptions.ignoreBoundMethods) {
        let parent = node.parent;
        while (parent) {
          if (
            parent.type === AST_NODE_TYPES.CallExpression ||
            parent.type === AST_NODE_TYPES.TSCallSignatureDeclaration
          ) {
            return true;
          }
          parent = parent.parent as TSESTree.Node;
        }
      }

      return false;
    }

    function checkFunction(node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | TSESTree.TSMethodSignature | TSESTree.TSFunctionType): void {
      if (shouldIgnoreNode(node)) return;

      const params = node.params;

      // Check for too many parameters first
      const minParams = finalOptions.minimumParameters !== undefined
        ? finalOptions.minimumParameters
        : defaultOptions.minimumParameters!;
      if (params.length >= minParams) {
        context.report({
          node,
          messageId: 'tooManyParams',
          data: { count: params.length },
        });
        return;
      }

      // Then check for same type parameters if enabled
      if (finalOptions.checkSameTypeParameters && params.length >= 2) {
        if (hasSameTypeParameters(params)) {
          context.report({
            node,
            messageId: 'sameTypeParams',
          });
        }
      }
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      TSMethodSignature: checkFunction,
      TSFunctionType: checkFunction,
    };
  },
});
