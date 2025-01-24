import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'missingExportedType' | 'missingExportedReturnType' | 'missingExportedPropsType';

export const enforceExportedFunctionTypes = createRule<[], MessageIds>({
  name: 'enforce-exported-function-types',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce exporting types for function props and return values',
      recommended: 'error',
    },
    schema: [],
    messages: {
      missingExportedType: 'Type {{typeName}} should be exported since it is used in an exported function',
      missingExportedReturnType: 'Return type {{typeName}} should be exported since it is used in an exported function',
      missingExportedPropsType: 'Props type {{typeName}} should be exported since it is used in an exported React component',
    },
  },
  defaultOptions: [],
  create(context) {
    const reportedTypes = new Set<string>();
    function isExported(node: TSESTree.Node | undefined): boolean {
      if (!node) return false;

      if (node.type === AST_NODE_TYPES.ExportNamedDeclaration ||
          node.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
        return true;
      }

      const parent = node.parent;
      if (!parent) return false;

      if (parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
          parent.type === AST_NODE_TYPES.ExportDefaultDeclaration ||
          parent.type === AST_NODE_TYPES.VariableDeclarator && isExported(parent.parent)) {
        return true;
      }

      return false;
    }

    function getTypeName(node: TSESTree.TypeNode | undefined): string | undefined {
      if (!node) return undefined;

      switch (node.type) {
        case AST_NODE_TYPES.TSTypeReference:
          if (node.typeName.type === AST_NODE_TYPES.Identifier) {
            return node.typeName.name;
          }
          break;
        case AST_NODE_TYPES.TSTypeLiteral:
          return 'AnonymousType';
      }
      return undefined;
    }

    function isTypeExported(typeName: string): boolean {
      const sourceCode = context.getSourceCode();
      const program = sourceCode.ast;

      // Check for exported type declarations
      const exportedTypes = program.body.filter(node => {
        if (node.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          if (node.declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
            return node.declaration.id.name === typeName;
          }
          if (node.declaration?.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
            return node.declaration.id.name === typeName;
          }
        }
        return false;
      });

      if (exportedTypes.length > 0) {
        return true;
      }

      // Check for type aliases in the current scope
      const scope = context.getScope();
      const variable = scope.variables.find(v => v.name === typeName);
      if (!variable) return false;

      const def = variable.defs[0];
      if (!def) return false;

      // Check if the type is directly exported
      if (isExported(def.node)) return true;

      // Check if the type is part of an export declaration
      const parent = def.node.parent;
      if (!parent) return false;

      // Handle type aliases in export declarations
      if (parent.type === AST_NODE_TYPES.ExportNamedDeclaration) {
        return true;
      }

      // Handle type aliases in variable declarations
      if (parent.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
        if (parent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          return true;
        }
      }

      // Handle type aliases in interface declarations
      if (parent.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        if (parent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          return true;
        }
      }

      return false;
    }

    return {
      FunctionDeclaration(node) {
        if (!isExported(node)) return;

        // Skip React components
        if (node.id?.name && /^[A-Z]/.test(node.id.name)) return;

        // Check return type
        if (node.returnType?.typeAnnotation) {
          const typeName = getTypeName(node.returnType.typeAnnotation);
          if (typeName && !isTypeExported(typeName)) {
            // Check if we've already reported this type
            const key = `${typeName}-${node.loc?.start.line}-${node.loc?.start.column}`;
            if (!reportedTypes.has(key)) {
              reportedTypes.add(key);
              context.report({
                node: node.returnType,
                messageId: 'missingExportedReturnType',
                data: { typeName },
              });
            }
          }
        }

        // Check parameter types
        node.params.forEach(param => {
          if (param.type === AST_NODE_TYPES.Identifier && param.typeAnnotation) {
            const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
            if (typeName && !isTypeExported(typeName)) {
              // Check if we've already reported this type
              const key = `${typeName}-${param.loc?.start.line}-${param.loc?.start.column}`;
              if (!reportedTypes.has(key)) {
                reportedTypes.add(key);
                context.report({
                  node: param.typeAnnotation,
                  messageId: 'missingExportedType',
                  data: { typeName },
                });
              }
            }
          }
        });
      },

      'VariableDeclarator > ArrowFunctionExpression'(node: TSESTree.ArrowFunctionExpression) {
        if (!node.parent?.parent || !isExported(node.parent.parent)) return;

        // Skip React components
        if (node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
            node.parent.id.type === AST_NODE_TYPES.Identifier &&
            /^[A-Z]/.test(node.parent.id.name)) return;

        // Check return type
        if (node.returnType?.typeAnnotation) {
          const typeName = getTypeName(node.returnType.typeAnnotation);
          if (typeName && !isTypeExported(typeName)) {
            // Check if we've already reported this type
            const key = `${typeName}-${node.loc?.start.line}-${node.loc?.start.column}`;
            if (!reportedTypes.has(key)) {
              reportedTypes.add(key);
              context.report({
                node: node.returnType,
                messageId: 'missingExportedReturnType',
                data: { typeName },
              });
            }
          }
        }

        // Check parameter types
        node.params.forEach(param => {
          if (param.type === AST_NODE_TYPES.Identifier && param.typeAnnotation) {
            const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
            if (typeName && !isTypeExported(typeName)) {
              // Check if we've already reported this type
              const key = `${typeName}-${param.loc?.start.line}-${param.loc?.start.column}`;
              if (!reportedTypes.has(key)) {
                reportedTypes.add(key);
                context.report({
                  node: param.typeAnnotation,
                  messageId: 'missingExportedType',
                  data: { typeName },
                });
              }
            }
          }
        });
      },

      // Handle React components
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation]'(node: TSESTree.Identifier) {
        if (!isExported(node.parent)) return;

        // Check props parameter
        if (node.typeAnnotation) {
          const typeName = getTypeName(node.typeAnnotation.typeAnnotation);
          if (typeName && !isTypeExported(typeName)) {
            // Check if we've already reported this type
            const key = `${typeName}-${node.loc?.start.line}-${node.loc?.start.column}`;
            if (!reportedTypes.has(key)) {
              reportedTypes.add(key);
              context.report({
                node: node.typeAnnotation,
                messageId: 'missingExportedType',
                data: { typeName },
              });
              return;
            }
          }
        }
      },

      // Skip type checking for React components since we handle them separately
      'FunctionDeclaration[id.name=/^[A-Z]/] > TSTypeAnnotation'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > TSTypeAnnotation > TSTypeReference'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > TSTypeAnnotation'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > TSTypeAnnotation > TSTypeReference'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > Identifier'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > Identifier'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > Identifier'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > Identifier'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
    };
  },
});
