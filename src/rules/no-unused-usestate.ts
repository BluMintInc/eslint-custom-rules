import { ESLintUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/BluMintInc/eslint-custom-rules/blob/main/docs/rules/${name}.md`,
);

/**
 * A destructuring binding counts as live when anything other than its own
 * initializer write references it. The write produced by the declaration itself
 * carries `init: true`, so it must not be mistaken for a usage.
 */
const isBindingReferenced = (variable: TSESLint.Scope.Variable) => {
  return variable.references.some((reference) => !reference.init);
};

/**
 * Rule to detect and remove unused useState hooks in React components
 * This rule identifies cases where the state variable from useState is ignored (e.g., replaced with _)
 */
export const noUnusedUseState = createRule({
  name: 'no-unused-usestate',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow unused useState hooks',
      recommended: 'error',
    },
    fixable: 'code',
    messages: {
      unusedUseState:
        'State value "{{stateName}}" from useState is discarded. React still allocates state and re-renders for a value you never read, which misleads readers into thinking the component depends on that state. Remove the useState pair or switch to a ref/derived value when you only need the setter-style side effect.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      // Look for variable declarations that destructure from useState
      VariableDeclarator(node) {
        // Check if it's an array pattern (destructuring)
        if (
          node.id.type === TSESTree.AST_NODE_TYPES.ArrayPattern &&
          node.init?.type === TSESTree.AST_NODE_TYPES.CallExpression
        ) {
          const callExpression = node.init;

          // Check if the call is to useState
          if (
            callExpression.callee.type === TSESTree.AST_NODE_TYPES.Identifier &&
            callExpression.callee.name === 'useState'
          ) {
            const arrayPattern = node.id;

            // Check if the first element is ignored (named _ or unused)
            if (
              arrayPattern.elements.length > 0 &&
              arrayPattern.elements[0] &&
              arrayPattern.elements[0].type ===
                TSESTree.AST_NODE_TYPES.Identifier &&
              (arrayPattern.elements[0].name === '_' ||
                arrayPattern.elements[0].name.startsWith('_'))
            ) {
              const stateIdentifier = arrayPattern.elements[0];
              const declaredVariables = context.getDeclaredVariables(node);
              const stateVariable = declaredVariables.find((variable) =>
                variable.identifiers.includes(stateIdentifier),
              );

              // The `_` prefix is a convention, not proof: when the value is
              // actually read the pair is justified and nothing is discarded.
              if (stateVariable && isBindingReferenced(stateVariable)) {
                return;
              }

              // Every other binding of the pattern (the setter, and any nested
              // or rest binding) must be dead before the declaration can be
              // deleted. Removing it while the setter is still called strands
              // the call sites and breaks the component.
              const hasLiveSiblingBinding = declaredVariables.some(
                (variable) =>
                  variable !== stateVariable && isBindingReferenced(variable),
              );

              context.report({
                node,
                messageId: 'unusedUseState',
                data: {
                  stateName: stateIdentifier.name,
                },
                fix: (fixer) => {
                  // A live setter still needs its declaration, so report the
                  // discarded value without offering a destructive fix.
                  if (hasLiveSiblingBinding) {
                    return null;
                  }

                  // Remove the entire useState declaration
                  const sourceCode = context.sourceCode;
                  const parentStatement = node.parent;

                  if (
                    parentStatement &&
                    parentStatement.type ===
                      TSESTree.AST_NODE_TYPES.VariableDeclaration
                  ) {
                    // If this is the only declarator, remove the entire statement and any extra whitespace
                    if (parentStatement.declarations.length === 1) {
                      // Get the next token after the statement to handle whitespace properly
                      const nextToken = sourceCode.getTokenAfter(
                        parentStatement,
                        { includeComments: true },
                      );

                      if (nextToken) {
                        // Remove the statement and any whitespace up to the next token
                        return fixer.removeRange([
                          parentStatement.range[0],
                          nextToken.range[0],
                        ]);
                      }

                      return fixer.remove(parentStatement);
                    }

                    // Otherwise, just remove this declarator and any trailing comma
                    const declaratorRange = node.range;

                    // Check if there's a comma after this declarator
                    const tokenAfter = sourceCode.getTokenAfter(node);
                    if (tokenAfter && tokenAfter.value === ',') {
                      // Consume the separator plus the whitespace before the
                      // surviving declarator so no double space is left behind.
                      // Comments stop the removal so they survive the fix.
                      const tokenAfterComma = sourceCode.getTokenAfter(
                        tokenAfter,
                        { includeComments: true },
                      );

                      return fixer.removeRange([
                        declaratorRange[0],
                        tokenAfterComma
                          ? tokenAfterComma.range[0]
                          : tokenAfter.range[1],
                      ]);
                    }

                    // Check if there's a comma before this declarator
                    const tokenBefore = sourceCode.getTokenBefore(node);
                    if (tokenBefore && tokenBefore.value === ',') {
                      return fixer.removeRange([
                        tokenBefore.range[0],
                        declaratorRange[1],
                      ]);
                    }

                    return fixer.remove(node);
                  }

                  return null;
                },
              });
            }
          }
        }
      },
    };
  },
});
