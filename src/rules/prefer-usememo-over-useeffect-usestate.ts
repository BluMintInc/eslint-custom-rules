import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const preferUseMemoOverUseEffectUseState = createRule({
  name: 'prefer-usememo-over-useeffect-usestate',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer useMemo over useEffect + useState for pure computations to avoid extra render cycles and stale derived state.',
      recommended: 'error',
    },
    messages: {
      preferUseMemo:
        'Derived state "{{stateName}}" is computed inside useEffect and copied into React state even though the value comes from a pure calculation. That extra render cycle and state indirection make components re-render more and risk stale snapshots when dependencies change. Compute the value with useMemo (or inline in render) and read it directly instead of mirroring it into state.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    // Track useState declarations to match with useEffect
    const stateSetters = new Map<
      string,
      {
        stateName: string;
        initialValue: TSESTree.Node | null;
        defId: TSESTree.Identifier;
      }
    >();

    // Helper to check if a node is a pure computation (no side effects)
    const isPureComputation = (node: TSESTree.Node): boolean => {
      // If it's an arrow function or function expression, it's not pure for our purposes
      if (
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionExpression'
      ) {
        return false;
      }

      // If it's a call expression, check if it's likely to be pure
      if (node.type === 'CallExpression') {
        // Allow certain known pure functions
        const callee = node.callee;
        if (callee.type === 'Identifier') {
          // Allow functions that start with "compute", "calculate", "format", etc.
          const pureNamePatterns =
            /^(compute|calculate|format|transform|convert|get|derive|create|expensive)/i;
          if (pureNamePatterns.test(callee.name)) {
            return true;
          }

          // Consider all other named functions as potentially having side effects
          return false;
        }

        // Allow array methods like map, filter, reduce which are pure
        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier'
        ) {
          const arrayMethods = [
            'map',
            'filter',
            'reduce',
            'some',
            'every',
            'find',
            'findIndex',
          ];
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

    // Helper to check if a node is a reference to a prop or variable
    const isIdentifierReference = (node: TSESTree.Node): boolean => {
      return node.type === 'Identifier';
    };

    // Helper to check if this is a state synchronization pattern
    const isStateSynchronization = (
      initialValue: TSESTree.Node | null,
      setterArgument: TSESTree.Node,
    ): boolean => {
      // If the initial value is a reference to a prop/variable and the setter argument
      // is the same reference, this is likely state synchronization
      if (
        initialValue &&
        isIdentifierReference(initialValue) &&
        isIdentifierReference(setterArgument) &&
        (initialValue as TSESTree.Identifier).name ===
          (setterArgument as TSESTree.Identifier).name
      ) {
        return true;
      }

      // If the initial value is a function that references a prop and the setter argument
      // is that same prop, this is likely state synchronization
      if (
        initialValue &&
        initialValue.type === 'ArrowFunctionExpression' &&
        initialValue.body.type === 'Identifier' &&
        isIdentifierReference(setterArgument) &&
        initialValue.body.name === (setterArgument as TSESTree.Identifier).name
      ) {
        return true;
      }

      return false;
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
            // keep a reference to the defining identifier node
            const defId = node.id.elements[1];

            stateSetters.set(setterName, { stateName, initialValue, defId });
          }
        }
      },

      // Check useEffect calls
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'useEffect' &&
          node.arguments.length > 0 &&
          (node.arguments[0].type === 'ArrowFunctionExpression' ||
            node.arguments[0].type === 'FunctionExpression')
        ) {
          const effectCallback = node.arguments[0] as
            | TSESTree.ArrowFunctionExpression
            | TSESTree.FunctionExpression;

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

              // Verify the setter identifier resolves to the tracked binding
              const calleeId = statement.expression
                .callee as TSESTree.Identifier;
              const scope = context.getScope();
              const variable =
                scope.set.get(calleeId.name) ||
                scope.upper?.set.get(calleeId.name);
              const defNode = variable?.defs?.[0]?.name;

              if (
                !stateInfo ||
                !defNode ||
                defNode.type !== 'Identifier' ||
                defNode.name !== stateInfo.defId.name
              ) {
                return;
              }

              if (statement.expression.arguments.length === 1) {
                const computation = statement.expression.arguments[0];

                // Skip if this is a state synchronization pattern
                if (
                  isStateSynchronization(stateInfo.initialValue, computation)
                ) {
                  return;
                }

                // Check if the computation is pure
                if (isPureComputation(computation)) {
                  // Report the issue but without autofixing
                  context.report({
                    node,
                    messageId: 'preferUseMemo',
                    data: {
                      stateName: stateInfo.stateName,
                    },
                  });
                }
              }
            }
          }
        }
      },
    };
  },
});
