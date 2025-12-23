import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    allowComplexBodies?: boolean;
    allowFunctionFactories?: boolean;
  },
];
type MessageIds = 'preferUseCallback';

export const preferUseCallbackOverUseMemoForFunctions = createRule<
  Options,
  MessageIds
>({
  name: 'prefer-usecallback-over-usememo-for-functions',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using useCallback instead of useMemo for memoizing functions',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowComplexBodies: {
            type: 'boolean',
            default: true,
          },
          allowFunctionFactories: {
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferUseCallback:
        'useMemo returns {{callbackDescription}}, which hides that you are memoizing a callback. useCallback is built to keep function identities stable and signals intent to other hook consumers. Replace useMemo with useCallback and keep the same dependency array so props relying on stable references do not re-render unnecessarily.',
    },
  },
  defaultOptions: [{ allowComplexBodies: false, allowFunctionFactories: true }],
  create(context) {
    const options = context.options[0] || {
      allowComplexBodies: false,
      allowFunctionFactories: true,
    };

    /**
     * Checks if a node is a function factory (returns an object with functions or a function that generates functions)
     */
    function isFunctionFactory(node) {
      // If we're not checking for function factories, return false
      if (!options.allowFunctionFactories) {
        return false;
      }

      // For arrow functions with implicit return
      if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
        // Check if it's returning an object literal
        if (node.body.type === AST_NODE_TYPES.ObjectExpression) {
          // Check if any property in the object is a function
          return node.body.properties.some((prop) => {
            if (prop.type === AST_NODE_TYPES.Property) {
              const value = prop.value;
              return (
                value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                value.type === AST_NODE_TYPES.FunctionExpression
              );
            }
            return false;
          });
        }
        return false;
      }

      // For arrow functions with block body
      if (
        node.body.body.length === 1 &&
        node.body.body[0].type === AST_NODE_TYPES.ReturnStatement &&
        node.body.body[0].argument
      ) {
        const returnValue = node.body.body[0].argument;

        // Check if returning an object literal with functions
        if (returnValue.type === AST_NODE_TYPES.ObjectExpression) {
          return returnValue.properties.some((prop) => {
            if (prop.type === AST_NODE_TYPES.Property) {
              const value = prop.value;
              return (
                value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                value.type === AST_NODE_TYPES.FunctionExpression
              );
            }
            return false;
          });
        }
      }

      return false;
    }

    /**
     * Checks if a function body is complex (more than one statement before returning)
     */
    function hasComplexBody(node) {
      if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
        return false;
      }

      // If there's more than one statement, or the single statement isn't a return
      if (
        node.body.body.length > 1 ||
        (node.body.body.length === 1 &&
          node.body.body[0].type !== AST_NODE_TYPES.ReturnStatement)
      ) {
        return true;
      }

      return false;
    }

    /**
     * Checks if a node returns a function
     */
    function returnsFunction(node) {
      // For arrow functions with implicit return
      if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
        return (
          node.body.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.body.type === AST_NODE_TYPES.FunctionExpression
        );
      }

      // For arrow functions with block body
      if (
        node.body.body.length === 1 &&
        node.body.body[0].type === AST_NODE_TYPES.ReturnStatement &&
        node.body.body[0].argument
      ) {
        const returnValue = node.body.body[0].argument;
        return (
          returnValue.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          returnValue.type === AST_NODE_TYPES.FunctionExpression
        );
      }

      return false;
    }

    return {
      CallExpression(node) {
        // Check if the call is to useMemo
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'useMemo' &&
          node.arguments.length > 0
        ) {
          const callback = node.arguments[0];

          // Check if the callback is an arrow function or function expression
          if (
            (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              callback.type === AST_NODE_TYPES.FunctionExpression) &&
            callback.body
          ) {
            // Skip if it's a function factory and we're allowing those
            if (isFunctionFactory(callback)) {
              return;
            }

            // Skip if it has a complex body and we're allowing those
            if (hasComplexBody(callback) && options.allowComplexBodies) {
              return;
            }

            // Check if it returns a function
            if (returnsFunction(callback)) {
              reportAndFix(node, context);
            }
          }
        }
      },
    };
  },
});

function getMemoizedFunctionDescription(node) {
  const parent = node.parent;

  if (
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return `the callback "${parent.id.name}"`;
  }

  if (
    parent?.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.left.type === AST_NODE_TYPES.Identifier
  ) {
    return `the callback "${parent.left.name}"`;
  }

  if (
    parent?.type === AST_NODE_TYPES.Property &&
    parent.key.type === AST_NODE_TYPES.Identifier
  ) {
    return `the "${parent.key.name}" property callback`;
  }

  if (
    parent?.type === AST_NODE_TYPES.JSXExpressionContainer &&
    parent.parent?.type === AST_NODE_TYPES.JSXAttribute &&
    parent.parent.name.type === AST_NODE_TYPES.JSXIdentifier
  ) {
    return `the "${parent.parent.name.name}" prop callback`;
  }

  return 'this callback value';
}

function reportAndFix(node, context) {
  const sourceCode = context.sourceCode;
  const useMemoCallback = node.arguments[0];
  const dependencyArray = node.arguments[1]
    ? sourceCode.getText(node.arguments[1])
    : '[]';

  // Get the returned function from useMemo
  let returnedFunction;
  if (useMemoCallback.body.type === AST_NODE_TYPES.BlockStatement) {
    // For block body arrow functions or function expressions
    const returnStatement = useMemoCallback.body.body[0];
    returnedFunction = returnStatement.argument;
  } else {
    // For implicit return arrow functions
    returnedFunction = useMemoCallback.body;
  }

  // Create the useCallback replacement
  const returnedFunctionText = sourceCode.getText(returnedFunction);

  // Check if useMemo has TypeScript generic type parameters
  const hasTypeParameters = node.typeParameters !== undefined;
  const typeParametersText = hasTypeParameters
    ? sourceCode.getText(node.typeParameters)
    : '';

  const callbackDescription = getMemoizedFunctionDescription(node);

  context.report({
    node,
    messageId: 'preferUseCallback',
    data: { callbackDescription },
    fix: (fixer) => {
      return fixer.replaceText(
        node,
        `useCallback${typeParametersText}(${returnedFunctionText}, ${dependencyArray})`,
      );
    },
  });
}

export default preferUseCallbackOverUseMemoForFunctions;
