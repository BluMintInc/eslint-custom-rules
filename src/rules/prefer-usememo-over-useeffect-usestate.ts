import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const preferUseMemoOverUseEffectUseState = createRule({
  name: 'prefer-usememo-over-useeffect-usestate',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer useMemo over useEffect + useState for pure computations. Using useEffect to update state with a pure computation causes unnecessary re-renders.',
      recommended: 'error',
    },
    messages: {
      preferUseMemo:
        'Prefer useMemo over useEffect + useState for pure computations to avoid unnecessary re-renders',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
  create(context) {
    // Track useState declarations to match with useEffect
    const stateSetters = new Map<string, { stateName: string; initialValue: TSESTree.Node | null }>();

    // Helper to check if a node is a pure computation (no side effects)
    const isPureComputation = (node: TSESTree.Node): boolean => {
      // If it's a call expression, check if it's likely to be pure
      if (node.type === 'CallExpression') {
        // Allow certain known pure functions
        const callee = node.callee;
        if (callee.type === 'Identifier') {
          // Allow functions that start with "compute", "calculate", "format", etc.
          const pureNamePatterns = /^(compute|calculate|format|transform|convert|get|derive|create|expensive)/i;
          if (pureNamePatterns.test(callee.name)) {
            return true;
          }
        }

        // Allow array methods like map, filter, reduce which are pure
        if (callee.type === 'MemberExpression' &&
            callee.property.type === 'Identifier') {
          const arrayMethods = ['map', 'filter', 'reduce', 'forEach', 'some', 'every', 'find', 'findIndex'];
          if (arrayMethods.includes(callee.property.name)) {
            return true;
          }
        }

        // For this rule, we'll consider all other function calls as potentially having side effects
        return false;
      }

      // If it's an await expression, it's not pure
      if (node.type === 'AwaitExpression') {
        return false;
      }

      // If it contains assignments to variables outside its scope, it's not pure
      if (node.type === 'AssignmentExpression') {
        return false;
      }

      // Object and array literals are pure
      if (node.type === 'ObjectExpression' || node.type === 'ArrayExpression') {
        return true;
      }

      // Allow basic expressions and literals
      return true;
    };

    return {
      // Track useState declarations
      VariableDeclarator(node) {
        if (
          node.init?.type === 'CallExpression' &&
          node.init.callee.type === 'Identifier' &&
          node.init.callee.name === 'useState'
        ) {
          if (
            node.id.type === 'ArrayPattern' &&
            node.id.elements.length === 2 &&
            node.id.elements[0]?.type === 'Identifier' &&
            node.id.elements[1]?.type === 'Identifier'
          ) {
            const stateName = node.id.elements[0].name;
            const setterName = node.id.elements[1].name;
            const initialValue = node.init.arguments[0] || null;

            stateSetters.set(setterName, { stateName, initialValue });
          }
        }
      },

      // Check useEffect calls
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'useEffect' &&
          node.arguments.length > 0 &&
          (node.arguments[0].type === 'ArrowFunctionExpression' || node.arguments[0].type === 'FunctionExpression')
        ) {
          const effectCallback = node.arguments[0] as TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
          const dependencies = node.arguments[1];

          // Check if the effect body is a block with a single statement
          if (
            effectCallback.body.type === 'BlockStatement' &&
            effectCallback.body.body.length === 1
          ) {
            const statement = effectCallback.body.body[0];

            // Check if the statement is a call to a state setter
            if (
              statement.type === 'ExpressionStatement' &&
              statement.expression.type === 'CallExpression' &&
              statement.expression.callee.type === 'Identifier'
            ) {
              const setterName = statement.expression.callee.name;
              const stateInfo = stateSetters.get(setterName);

              if (stateInfo && statement.expression.arguments.length === 1) {
                const computation = statement.expression.arguments[0];

                // Check if the computation is pure
                if (isPureComputation(computation)) {
                  const sourceCode = context.getSourceCode();
                  const computationText = sourceCode.getText(computation);
                  const dependenciesText = dependencies ? sourceCode.getText(dependencies) : '[]';

                  // For object literals, we need to wrap them in parentheses
                  const wrappedComputationText =
                    computation.type === 'ObjectExpression'
                      ? `(${computationText})`
                      : computationText;

                  context.report({
                    node,
                    messageId: 'preferUseMemo',
                    fix(fixer) {
                      // Create the useMemo replacement
                      const useMemoText = `const ${stateInfo.stateName} = useMemo(() => ${wrappedComputationText}, ${dependenciesText});`;

                      // Find the useState declaration to remove it
                      const scope = context.getScope();
                      const stateVariable = scope.variables.find(v => v.name === stateInfo.stateName);

                      if (stateVariable && stateVariable.defs[0]?.node.type === 'VariableDeclarator') {
                        const declarator = stateVariable.defs[0].node;
                        const declaration = declarator.parent;

                        if (declaration && declaration.type === 'VariableDeclaration') {
                          // If there's only one declarator, remove the entire declaration
                          if (declaration.declarations.length === 1) {
                            return [
                              fixer.remove(declaration),
                              fixer.remove(node),
                              fixer.insertTextAfter(declaration, useMemoText)
                            ];
                          }
                        }
                      }

                      // If we can't safely remove the useState, just replace the useEffect
                      return fixer.replaceText(node, useMemoText);
                    }
                  });
                }
              }
            }
          }
        }
      }
    };
  },
});
