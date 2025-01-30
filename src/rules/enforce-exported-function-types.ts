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

    function getTypeNames(node: TSESTree.TypeNode | undefined): string[] {
      if (!node) return [];

      switch (node.type) {
        case AST_NODE_TYPES.TSTypeReference:
          if (node.typeName.type === AST_NODE_TYPES.Identifier) {
            const names = [node.typeName.name];
            // For generic types like AuthenticatedRequest<Params>, check both the base type and type parameters
            if ('typeParameters' in node && node.typeParameters) {
              node.typeParameters.params.forEach(param => {
                names.push(...getTypeNames(param));
              });
            }
            return names;
          }
          break;
        case AST_NODE_TYPES.TSTypeLiteral:
          return ['AnonymousType'];
      }
      return [];
    }

    function checkAndReportType(
      node: TSESTree.TypeNode,
      parentNode: TSESTree.Node,
      messageId: MessageIds
    ): void {
      const typeNames = getTypeNames(node);
      for (const typeName of typeNames) {
        if (typeName !== 'AnonymousType' && !isTypeExported(typeName)) {
          // Check if we've already reported this type
          const key = `${typeName}-${parentNode.loc?.start.line}-${parentNode.loc?.start.column}`;
          if (!reportedTypes.has(key)) {
            reportedTypes.add(key);
            context.report({
              node: parentNode,
              messageId,
              data: { typeName },
            });
          }
        }
      }
    }

    function isTypeExported(typeName: string): boolean {
      const sourceCode = context.getSourceCode();
      const program = sourceCode.ast;

      // Check for imported types
      const importedTypes = program.body.filter(node => {
        if (node.type === AST_NODE_TYPES.ImportDeclaration) {
          return node.specifiers.some(specifier =>
            specifier.type === AST_NODE_TYPES.ImportSpecifier &&
            specifier.local.name === typeName
          );
        }
        return false;
      });

      if (importedTypes.length > 0) {
        return true;
      }

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
          checkAndReportType(node.returnType.typeAnnotation, node.returnType, 'missingExportedReturnType');
        }

        // Check parameter types
        node.params.forEach(param => {
          if (param.type === AST_NODE_TYPES.Identifier && param.typeAnnotation) {
            checkAndReportType(param.typeAnnotation.typeAnnotation, param.typeAnnotation, 'missingExportedType');
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
          checkAndReportType(node.returnType.typeAnnotation, node.returnType, 'missingExportedReturnType');
        }

        // Check parameter types
        node.params.forEach(param => {
          if (param.type === AST_NODE_TYPES.Identifier && param.typeAnnotation) {
            checkAndReportType(param.typeAnnotation.typeAnnotation, param.typeAnnotation, 'missingExportedType');
          }
        });
      },

      // Handle React components
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation]'(node: TSESTree.Identifier) {
        if (!isExported(node.parent)) return;

        // Check props parameter
        if (node.typeAnnotation) {
          checkAndReportType(node.typeAnnotation.typeAnnotation, node.typeAnnotation, 'missingExportedPropsType');
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
