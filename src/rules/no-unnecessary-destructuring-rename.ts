import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'unnecessaryDestructuringRename';

interface DestructuredVariable {
  originalName: string;
  renamedName: string;
  renamedNode: TSESTree.Identifier;
  destructuringNode: TSESTree.VariableDeclarator;
  hasDefaultValue: boolean;
}

export const noUnnecessaryDestructuringRename = createRule<[], MessageIds>({
  name: 'no-unnecessary-destructuring-rename',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prevent unnecessary renaming in destructuring assignments when the renamed variable is immediately used to assign back to the same property name',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      unnecessaryDestructuringRename:
        'Unnecessary destructuring rename. Use the original property name "{{originalName}}" instead of renaming to "{{renamedName}}" only to assign it back to "{{originalName}}".',
    },
  },
  defaultOptions: [],
  create(context) {
    const destructuredVariables = new Map<string, DestructuredVariable>();
    const variableUsages = new Map<string, TSESTree.Node[]>();

    function isDirectObjectPropertyAssignment(
      node: TSESTree.Node,
      propertyName: string,
      variableName: string,
    ): boolean {
      if (
        node.type === AST_NODE_TYPES.Property &&
        !node.computed &&
        node.key.type === AST_NODE_TYPES.Identifier &&
        node.key.name === propertyName &&
        node.value.type === AST_NODE_TYPES.Identifier &&
        node.value.name === variableName
      ) {
        // Check if this is a direct property assignment (not nested)
        const objectExpression = node.parent;
        if (objectExpression?.type === AST_NODE_TYPES.ObjectExpression) {
          // Check if the object is being assigned directly (not nested in another object or conditional)
          const parent = objectExpression.parent;
          if (
            parent?.type === AST_NODE_TYPES.VariableDeclarator ||
            parent?.type === AST_NODE_TYPES.ReturnStatement ||
            parent?.type === AST_NODE_TYPES.AssignmentExpression
          ) {
            // Check if it's not part of a conditional expression
            return parent.parent?.type !== AST_NODE_TYPES.ConditionalExpression;
          }
          return false;
        }
      }
      return false;
    }

    function areInSameScope(destructuringNode: TSESTree.Node, usageNode: TSESTree.Node): boolean {
      // Find the closest function or program scope for both nodes
      function findScope(node: TSESTree.Node): TSESTree.Node | null {
        let current = node.parent;
        while (current) {
          if (
            current.type === AST_NODE_TYPES.FunctionDeclaration ||
            current.type === AST_NODE_TYPES.FunctionExpression ||
            current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            current.type === AST_NODE_TYPES.Program
          ) {
            return current;
          }
          current = current.parent;
        }
        return null;
      }

      const destructuringScope = findScope(destructuringNode);
      const usageScope = findScope(usageNode);
      return destructuringScope === usageScope;
    }

    function trackDestructuredVariable(node: TSESTree.VariableDeclarator) {
      if (
        node.id.type !== AST_NODE_TYPES.ObjectPattern ||
        !node.init
      ) {
        return;
      }

      for (const property of node.id.properties) {
        if (
          property.type === AST_NODE_TYPES.Property &&
          !property.computed &&
          property.key.type === AST_NODE_TYPES.Identifier
        ) {
          let originalName: string;
          let renamedName: string;
          let hasDefaultValue = false;

          if (property.value.type === AST_NODE_TYPES.Identifier) {
            // Simple rename: { originalName: renamedName }
            originalName = property.key.name;
            renamedName = property.value.name;
          } else if (property.value.type === AST_NODE_TYPES.AssignmentPattern &&
                     property.value.left.type === AST_NODE_TYPES.Identifier) {
            // Rename with default: { originalName: renamedName = defaultValue }
            originalName = property.key.name;
            renamedName = property.value.left.name;
            hasDefaultValue = true;
          } else {
            continue;
          }

          // Only process if there's actually a rename
          if (originalName !== renamedName) {
            const renamedNode = hasDefaultValue
              ? (property.value as TSESTree.AssignmentPattern).left as TSESTree.Identifier
              : property.value as TSESTree.Identifier;

            destructuredVariables.set(renamedName, {
              originalName,
              renamedName,
              renamedNode,
              destructuringNode: node,
              hasDefaultValue,
            });
          }
        }
      }
    }

    function trackVariableUsage(node: TSESTree.Identifier) {
      const name = node.name;
      if (!variableUsages.has(name)) {
        variableUsages.set(name, []);
      }
      variableUsages.get(name)!.push(node);
    }

    function checkForUnnecessaryRename() {
      for (const [renamedName, destructuredVar] of destructuredVariables) {
        const usages = variableUsages.get(renamedName) || [];

        // Filter out the declaration itself
        const actualUsages = usages.filter(usage => usage !== destructuredVar.renamedNode);

        // Check if the variable is used exactly once
        if (actualUsages.length === 1) {
          const usage = actualUsages[0];
          const parent = usage.parent;

          // Check if it's used in a direct object property assignment with the original name
          if (isDirectObjectPropertyAssignment(parent!, destructuredVar.originalName, renamedName)) {
            // Check if the usage is in the same scope as the destructuring
            if (areInSameScope(destructuredVar.destructuringNode, usage)) {
              context.report({
                node: destructuredVar.destructuringNode,
                messageId: 'unnecessaryDestructuringRename',
                data: {
                  originalName: destructuredVar.originalName,
                  renamedName: destructuredVar.renamedName,
                },
              fix(fixer) {
                const sourceCode = context.getSourceCode();

                // Find the property in the destructuring pattern
                const objectPattern = destructuredVar.destructuringNode.id as TSESTree.ObjectPattern;
                const targetProperty = objectPattern.properties.find(
                  prop =>
                    prop.type === AST_NODE_TYPES.Property &&
                    prop.key.type === AST_NODE_TYPES.Identifier &&
                    prop.key.name === destructuredVar.originalName
                ) as TSESTree.Property;

                if (!targetProperty) return null;

                // Replace the renamed property with just the original name
                let replacement = destructuredVar.originalName;

                // Handle default values
                if (destructuredVar.hasDefaultValue && targetProperty.value.type === AST_NODE_TYPES.AssignmentPattern) {
                  const assignmentPattern = targetProperty.value as TSESTree.AssignmentPattern;
                  const defaultValueText = sourceCode.getText(assignmentPattern.right);
                  replacement = `${destructuredVar.originalName} = ${defaultValueText}`;
                }

                const fixes = [
                  // Fix the destructuring pattern
                  fixer.replaceText(targetProperty, replacement),
                ];

                // Fix the object property to use shorthand
                const propertyParent = usage.parent as TSESTree.Property;
                if (propertyParent && propertyParent.type === AST_NODE_TYPES.Property) {
                  fixes.push(fixer.replaceText(propertyParent, destructuredVar.originalName));
                }

                return fixes;
              },
              });
            }
          }
        }
      }
    }

    return {
      VariableDeclarator(node) {
        trackDestructuredVariable(node);
      },

      Identifier(node) {
        // Only track identifiers that are being read (not written to)
        if (
          node.parent?.type !== AST_NODE_TYPES.VariableDeclarator &&
          node.parent?.type !== AST_NODE_TYPES.Property ||
          (node.parent?.type === AST_NODE_TYPES.Property && node.parent.value === node)
        ) {
          trackVariableUsage(node);
        }
      },

      'Program:exit'() {
        checkForUnnecessaryRename();
      },
    };
  },
});
