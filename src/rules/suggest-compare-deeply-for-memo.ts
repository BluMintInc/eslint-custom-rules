import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'suggestCompareDeeply';

interface ComplexProp {
  name: string;
  isComplex: boolean;
}

export const suggestCompareDeeplyForMemo = createRule<[], MessageIds>({
  name: 'suggest-compare-deeply-for-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Suggest compareDeeply for memoized components with complex props',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      suggestCompareDeeply: 'The prop(s) {{complexProps}} on the memoized component {{componentName}} appear to be complex objects/arrays but no deep comparison strategy is used. Consider using `compareDeeply({{propList}})` from `src/util/memo.ts` as the second argument to `memo` to prevent unnecessary re-renders.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    // Track imports to know if we have compareDeeply imported
    let hasCompareDeeplyImport = false;

    // Helper function to check if a type is complex (object/array)
    function isComplexType(typeNode: TSESTree.TSTypeAnnotation | TSESTree.TSTypeReference | TSESTree.Node | undefined): boolean {
      if (!typeNode) return false;

      // Handle TSTypeAnnotation wrapper
      if (typeNode.type === AST_NODE_TYPES.TSTypeAnnotation) {
        return isComplexType(typeNode.typeAnnotation);
      }

      switch (typeNode.type) {
        case AST_NODE_TYPES.TSTypeLiteral:
        case AST_NODE_TYPES.TSInterfaceDeclaration:
          return true;
        case AST_NODE_TYPES.TSArrayType:
        case AST_NODE_TYPES.TSTupleType:
          return true;
        case AST_NODE_TYPES.TSUnionType:
          // Union is complex if any member is complex (excluding null/undefined)
          return typeNode.types.some(type =>
            type.type !== AST_NODE_TYPES.TSNullKeyword &&
            type.type !== AST_NODE_TYPES.TSUndefinedKeyword &&
            isComplexType(type)
          );
        case AST_NODE_TYPES.TSIntersectionType:
          return typeNode.types.some(type => isComplexType(type));
        case AST_NODE_TYPES.TSTypeReference:
          // Check for common complex type references
          if (typeNode.typeName.type === AST_NODE_TYPES.Identifier) {
            const typeName = typeNode.typeName.name;
            // Common complex types
            if (['Array', 'Object', 'Record', 'Map', 'Set', 'Date'].includes(typeName)) {
              return true;
            }
            // Custom interfaces/types are likely complex
            if (typeName[0] === typeName[0].toUpperCase()) {
              return true;
            }
          }
          return false;
        case AST_NODE_TYPES.TSStringKeyword:
        case AST_NODE_TYPES.TSNumberKeyword:
        case AST_NODE_TYPES.TSBooleanKeyword:
        case AST_NODE_TYPES.TSNullKeyword:
        case AST_NODE_TYPES.TSUndefinedKeyword:
        case AST_NODE_TYPES.TSVoidKeyword:
          return false;
        case AST_NODE_TYPES.TSFunctionType:
        case AST_NODE_TYPES.TSMethodSignature:
          return false; // Functions are not considered complex for our purposes
        default:
          return false;
      }
    }

    // Helper function to extract complex props from a component's props interface
    function getComplexPropsFromInterface(interfaceNode: TSESTree.TSInterfaceDeclaration): ComplexProp[] {
      const complexProps: ComplexProp[] = [];

      for (const member of interfaceNode.body.body) {
        if (member.type === AST_NODE_TYPES.TSPropertySignature &&
            member.key.type === AST_NODE_TYPES.Identifier) {
          const propName = member.key.name;
          const isComplex = isComplexType(member.typeAnnotation);
          complexProps.push({ name: propName, isComplex });
        }
      }

      return complexProps;
    }

    // Helper function to find component props interface
    function findComponentPropsInterface(componentName: string): TSESTree.TSInterfaceDeclaration | null {
      const program = sourceCode.ast;

      // Try different naming patterns for props interface
      const possibleNames = [
        `${componentName}Props`,
        // If component name ends with 'Unmemoized', try without it
        componentName.endsWith('Unmemoized')
          ? `${componentName.slice(0, -10)}Props`
          : null,
      ].filter(Boolean) as string[];

      for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.TSInterfaceDeclaration &&
            possibleNames.includes(statement.id.name)) {
          return statement;
        }
      }

      return null;
    }

    // Helper function to extract component name from memo call
    function getComponentNameFromMemoCall(node: TSESTree.CallExpression): string | null {
      const firstArg = node.arguments[0];
      if (!firstArg) return null;

      if (firstArg.type === AST_NODE_TYPES.Identifier) {
        return firstArg.name;
      }

      // Handle arrow functions assigned to variables
      if (firstArg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          firstArg.type === AST_NODE_TYPES.FunctionExpression) {
        // Look for the variable declarator that contains this function
        let current = node.parent;
        while (current) {
          if (current.type === AST_NODE_TYPES.VariableDeclarator &&
              current.id.type === AST_NODE_TYPES.Identifier) {
            return current.id.name;
          }
          current = current.parent;
        }
      }

      return null;
    }

    // Helper function to check if memo call already has a comparison function
    function hasCustomComparison(node: TSESTree.CallExpression): boolean {
      return node.arguments.length > 1;
    }

    // Helper function to check if this is a memo call
    function isMemoCall(node: TSESTree.CallExpression): boolean {
      if (node.callee.type === AST_NODE_TYPES.Identifier) {
        return node.callee.name === 'memo';
      }

      if (node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          node.callee.object.name === 'React' &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'memo') {
        return true;
      }

      return false;
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        // Check for custom memo import
        if (typeof node.source.value === 'string' &&
            /(?:^|\/|\\)util\/memo$/.test(node.source.value)) {
          const compareDeeplySpecifier = node.specifiers.find(
            (spec): spec is TSESTree.ImportSpecifier =>
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.type === AST_NODE_TYPES.Identifier &&
              spec.imported.name === 'compareDeeply'
          );
          if (compareDeeplySpecifier) {
            hasCompareDeeplyImport = true;
          }
        }
      },

      CallExpression(node: TSESTree.CallExpression) {
        // Only check .tsx files
        const fileName = context.getFilename();
        if (!fileName.endsWith('.tsx')) {
          return;
        }

        // Check if this is a memo call
        if (!isMemoCall(node)) {
          return;
        }

        // Skip if already has custom comparison
        if (hasCustomComparison(node)) {
          return;
        }

        // Get component name
        const componentName = getComponentNameFromMemoCall(node);
        if (!componentName) {
          return;
        }

        // Find the props interface
        const propsInterface = findComponentPropsInterface(componentName);
        if (!propsInterface) {
          return;
        }

        // Get complex props
        const allProps = getComplexPropsFromInterface(propsInterface);
        const complexProps = allProps.filter(prop => prop.isComplex);

        if (complexProps.length === 0) {
          return;
        }

        // Generate error message
        const complexPropNames = complexProps.map(prop => `\`${prop.name}\``).join(', ');
        const propList = complexProps.map(prop => `'${prop.name}'`).join(', ');

        context.report({
          node,
          messageId: 'suggestCompareDeeply',
          data: {
            complexProps: complexPropNames,
            componentName,
            propList,
          },
          fix(fixer) {
            // Add compareDeeply import if not present
            const fixes: any[] = [];

            if (!hasCompareDeeplyImport) {
              // Find existing memo import from util/memo
              const program = sourceCode.ast;
              const memoImport = program.body.find(
                (statement): statement is TSESTree.ImportDeclaration =>
                  statement.type === AST_NODE_TYPES.ImportDeclaration &&
                  typeof statement.source.value === 'string' &&
                  /(?:^|\/|\\)util\/memo$/.test(statement.source.value)
              );

              if (memoImport) {
                // Add compareDeeply to existing import
                const lastSpecifier = memoImport.specifiers[memoImport.specifiers.length - 1];
                fixes.push(fixer.insertTextAfter(lastSpecifier, ', compareDeeply'));
              } else {
                // Create new import - this shouldn't happen if we're using custom memo
                // but handle it just in case
                const firstImport = program.body.find(
                  statement => statement.type === AST_NODE_TYPES.ImportDeclaration
                );
                if (firstImport) {
                  fixes.push(fixer.insertTextAfter(
                    firstImport,
                    `\n        import { compareDeeply } from 'src/util/memo';`
                  ));
                }
              }
            }

            // Add compareDeeply as second argument to memo call
            const firstArg = node.arguments[0];
            fixes.push(fixer.insertTextAfter(
              firstArg,
              `,\n  compareDeeply(${propList})`
            ));

            return fixes;
          },
        });
      },
    };
  },
});
