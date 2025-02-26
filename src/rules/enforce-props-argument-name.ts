import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'usePropsForParameter' | 'usePropsForType';
type Options = [
  {
    allowedExceptions?: string[];
    enforceDestructuring?: boolean;
    ignoreExternalInterfaces?: boolean;
  },
];

const defaultOptions: Options[0] = {
  allowedExceptions: [],
  enforceDestructuring: false,
  ignoreExternalInterfaces: true,
};

export const enforcePropsArgumentName = createRule<Options, MessageIds>({
  name: 'enforce-props-argument-name',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using "props" as the name for parameter objects',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowedExceptions: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          enforceDestructuring: {
            type: 'boolean',
          },
          ignoreExternalInterfaces: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      usePropsForParameter: 'Use "props" as the parameter name instead of "{{ paramName }}"',
      usePropsForType: 'Use "Props" suffix in type name instead of "{{ typeSuffix }}"',
    },
  },
  defaultOptions: [defaultOptions],
  create(context, [options]) {
    const finalOptions = { ...defaultOptions, ...options };

    // Check if a node is from an external library
    function isFromExternalLibrary(node: TSESTree.Node): boolean {
      if (!finalOptions.ignoreExternalInterfaces) {
        return false;
      }

      let current = node;
      while (current.parent) {
        if (current.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
          // Check if the interface extends something from an external library
          const interfaceDecl = current as TSESTree.TSInterfaceDeclaration;
          if (interfaceDecl.extends && interfaceDecl.extends.length > 0) {
            // Check if any of the extended interfaces are from external libraries
            // This is a simplified check - a more robust implementation would trace imports
            return true;
          }
        }
        current = current.parent;
      }
      return false;
    }

    // Check if a parameter name is in the allowed exceptions list
    function isAllowedException(paramName: string): boolean {
      return (finalOptions.allowedExceptions || []).includes(paramName);
    }

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

    // Check if a type name has a non-"Props" suffix
    function hasNonPropsSuffix(typeName: string): string | null {
      if (typeName.endsWith('Props')) {
        return null;
      }

      const suffixes = ['Config', 'Settings', 'Options', 'Params', 'Parameters', 'Args', 'Arguments'];
      for (const suffix of suffixes) {
        if (typeName.endsWith(suffix)) {
          return suffix;
        }
      }
      return null;
    }

    // Fix parameter name
    function fixParameterName(fixer: any, node: TSESTree.Parameter): any {
      if (node.type === AST_NODE_TYPES.Identifier) {
        return fixer.replaceText(node, 'props');
      } else if (node.type === AST_NODE_TYPES.ObjectPattern) {
        // For destructured parameters, we need to add the props name
        return fixer.replaceText(node, `props`);
      }
      return null;
    }

    // Fix type name
    function fixTypeName(fixer: any, node: TSESTree.TypeNode, oldName: string, suffix: string): any {
      if (node.type === AST_NODE_TYPES.TSTypeReference &&
          node.typeName.type === AST_NODE_TYPES.Identifier) {
        const baseName = oldName.slice(0, -suffix.length);
        return fixer.replaceText(node.typeName, `${baseName}Props`);
      }
      return null;
    }

    // Check function parameters
    function checkFunctionParams(
      node: TSESTree.FunctionDeclaration |
            TSESTree.FunctionExpression |
            TSESTree.ArrowFunctionExpression |
            TSESTree.TSMethodSignature
    ): void {
      if (node.params.length !== 1) {
        return; // Only check functions with a single parameter
      }

      const param = node.params[0];

      // Skip primitive parameters
      if (param.type === AST_NODE_TYPES.Identifier && param.typeAnnotation && (
          param.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSStringKeyword ||
          param.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSNumberKeyword ||
          param.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword)) {
        return;
      }

      // Check parameter name
      if (param.type === AST_NODE_TYPES.Identifier &&
          param.name !== 'props' &&
          !isAllowedException(param.name)) {

        // Check if the parameter has a type annotation
        if (param.typeAnnotation && param.typeAnnotation.typeAnnotation) {
          const typeName = getTypeName(param.typeAnnotation.typeAnnotation);

          if (typeName) {
            const nonPropsSuffix = hasNonPropsSuffix(typeName);

            if (nonPropsSuffix) {
              context.report({
                node: param.typeAnnotation.typeAnnotation,
                messageId: 'usePropsForType',
                data: { typeSuffix: nonPropsSuffix },
                fix: (fixer) => fixTypeName(
                  fixer,
                  param.typeAnnotation!.typeAnnotation,
                  typeName,
                  nonPropsSuffix
                ),
              });
            }
          }
        }

        context.report({
          node: param,
          messageId: 'usePropsForParameter',
          data: { paramName: param.name },
          fix: (fixer) => fixParameterName(fixer, param),
        });
      }

      // Check object pattern (destructured parameter)
      else if (param.type === AST_NODE_TYPES.ObjectPattern &&
               finalOptions.enforceDestructuring) {

        // If we're enforcing non-destructuring, report an error
        context.report({
          node: param,
          messageId: 'usePropsForParameter',
          data: { paramName: 'destructured object' },
          fix: (fixer) => {
            return fixer.replaceText(param, `props`);
          },
        });
      }
    }

    // Check class constructor parameters
    function checkClassConstructor(node: TSESTree.MethodDefinition): void {
      if (node.kind !== 'constructor') {
        return;
      }

      const constructor = node.value;
      if (constructor.params.length !== 1) {
        return; // Only check constructors with a single parameter
      }

      const param = constructor.params[0];

      // Skip primitive parameters
      if (param.type === AST_NODE_TYPES.Identifier && param.typeAnnotation && (
          param.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSStringKeyword ||
          param.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSNumberKeyword ||
          param.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword)) {
        return;
      }

      // Check parameter name
      if (param.type === AST_NODE_TYPES.Identifier &&
          param.name !== 'props' &&
          !isAllowedException(param.name)) {

        // Check if the parameter has a type annotation
        if (param.typeAnnotation && param.typeAnnotation.typeAnnotation) {
          const typeName = getTypeName(param.typeAnnotation.typeAnnotation);

          if (typeName) {
            const nonPropsSuffix = hasNonPropsSuffix(typeName);

            if (nonPropsSuffix) {
              context.report({
                node: param.typeAnnotation.typeAnnotation,
                messageId: 'usePropsForType',
                data: { typeSuffix: nonPropsSuffix },
                fix: (fixer) => fixTypeName(
                  fixer,
                  param.typeAnnotation!.typeAnnotation,
                  typeName,
                  nonPropsSuffix
                ),
              });
            }
          }
        }

        context.report({
          node: param,
          messageId: 'usePropsForParameter',
          data: { paramName: param.name },
          fix: (fixer) => fixParameterName(fixer, param),
        });
      }
    }

    // Check type definitions
    function checkTypeDefinition(node: TSESTree.TSTypeAliasDeclaration): void {
      if (!node.id || !node.id.name) {
        return;
      }

      const typeName = node.id.name;
      const nonPropsSuffix = hasNonPropsSuffix(typeName);

      if (nonPropsSuffix && !isFromExternalLibrary(node)) {
        context.report({
          node: node.id,
          messageId: 'usePropsForType',
          data: { typeSuffix: nonPropsSuffix },
          fix: (fixer) => {
            const baseName = typeName.slice(0, -nonPropsSuffix.length);
            return fixer.replaceText(node.id, `${baseName}Props`);
          },
        });
      }
    }

    return {
      FunctionDeclaration: checkFunctionParams,
      FunctionExpression: checkFunctionParams,
      ArrowFunctionExpression: checkFunctionParams,
      TSMethodSignature: checkFunctionParams,
      MethodDefinition: checkClassConstructor,
      TSTypeAliasDeclaration: checkTypeDefinition,
    };
  },
});
