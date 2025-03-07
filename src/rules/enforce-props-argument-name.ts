import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'usePropsForType';
type Options = [
  {
    enforceDestructuring?: boolean;
    ignoreExternalInterfaces?: boolean;
  },
];

const defaultOptions: Options[0] = {
  enforceDestructuring: false,
  ignoreExternalInterfaces: true,
};

export const enforcePropsArgumentName = createRule<Options, MessageIds>({
  name: 'enforce-props-argument-name',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using "Props" suffix in type names for parameter objects',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
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
      usePropsForType:
        'Use "Props" suffix in type name instead of "{{ typeSuffix }}"',
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

      const suffixes = [
        'Config',
        'Settings',
        'Options',
        'Params',
        'Parameters',
        'Args',
        'Arguments',
      ];
      for (const suffix of suffixes) {
        if (typeName.endsWith(suffix)) {
          return suffix;
        }
      }
      return null;
    }

    // Fix type name
    function fixTypeName(
      fixer: any,
      node: TSESTree.TypeNode,
      oldName: string,
      suffix: string,
    ): any {
      if (
        node.type === AST_NODE_TYPES.TSTypeReference &&
        node.typeName.type === AST_NODE_TYPES.Identifier
      ) {
        const baseName = oldName.slice(0, -suffix.length);
        return fixer.replaceText(node.typeName, `${baseName}Props`);
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
      if (node.params.length !== 1) {
        return; // Only check functions with a single parameter
      }

      const param = node.params[0];

      // Skip primitive parameters
      if (
        param.type === AST_NODE_TYPES.Identifier &&
        param.typeAnnotation &&
        (param.typeAnnotation.typeAnnotation.type ===
          AST_NODE_TYPES.TSStringKeyword ||
          param.typeAnnotation.typeAnnotation.type ===
            AST_NODE_TYPES.TSNumberKeyword ||
          param.typeAnnotation.typeAnnotation.type ===
            AST_NODE_TYPES.TSBooleanKeyword)
      ) {
        return;
      }

      // Check if the parameter has a type annotation
      if (
        param.type === AST_NODE_TYPES.Identifier &&
        param.typeAnnotation &&
        param.typeAnnotation.typeAnnotation
      ) {
        const typeName = getTypeName(param.typeAnnotation.typeAnnotation);

        if (typeName) {
          const nonPropsSuffix = hasNonPropsSuffix(typeName);

          if (nonPropsSuffix) {
            context.report({
              node: param.typeAnnotation.typeAnnotation,
              messageId: 'usePropsForType',
              data: { typeSuffix: nonPropsSuffix },
              fix: (fixer) =>
                fixTypeName(
                  fixer,
                  param.typeAnnotation!.typeAnnotation,
                  typeName,
                  nonPropsSuffix,
                ),
            });
          }
        }
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
      if (
        param.type === AST_NODE_TYPES.Identifier &&
        param.typeAnnotation &&
        (param.typeAnnotation.typeAnnotation.type ===
          AST_NODE_TYPES.TSStringKeyword ||
          param.typeAnnotation.typeAnnotation.type ===
            AST_NODE_TYPES.TSNumberKeyword ||
          param.typeAnnotation.typeAnnotation.type ===
            AST_NODE_TYPES.TSBooleanKeyword)
      ) {
        return;
      }

      // Check if the parameter has a type annotation
      if (
        param.type === AST_NODE_TYPES.Identifier &&
        param.typeAnnotation &&
        param.typeAnnotation.typeAnnotation
      ) {
        const typeName = getTypeName(param.typeAnnotation.typeAnnotation);

        if (typeName) {
          const nonPropsSuffix = hasNonPropsSuffix(typeName);

          if (nonPropsSuffix) {
            context.report({
              node: param.typeAnnotation.typeAnnotation,
              messageId: 'usePropsForType',
              data: { typeSuffix: nonPropsSuffix },
              fix: (fixer) =>
                fixTypeName(
                  fixer,
                  param.typeAnnotation!.typeAnnotation,
                  typeName,
                  nonPropsSuffix,
                ),
            });
          }
        }
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
        const baseName = typeName.slice(0, -nonPropsSuffix.length);
        const newTypeName = `${baseName}Props`;

        context.report({
          node: node.id,
          messageId: 'usePropsForType',
          data: { typeSuffix: nonPropsSuffix },
          fix: (fixer) => {
            return fixer.replaceText(node.id, newTypeName);
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
