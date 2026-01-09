import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'missingCause'
  | 'causeNotCatchBinding'
  | 'missingCatchBinding';
type Options = [];

type CatchFrame = {
  paramName: string | null;
  node: TSESTree.CatchClause;
};

const isHttpsErrorCallee = (
  callee: TSESTree.LeftHandSideExpression,
): boolean => {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'HttpsError';
  }

  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return (
      callee.object.type === AST_NODE_TYPES.Identifier &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      callee.property.name === 'HttpsError'
    );
  }

  return false;
};

const findVariableInScopeChain = (
  scope: TSESLint.Scope.Scope | null,
  name: string,
): TSESLint.Scope.Variable | null => {
  let currentScope: TSESLint.Scope.Scope | null = scope;

  while (currentScope) {
    const variable = currentScope.variables.find((item) => item.name === name);
    if (variable) {
      return variable;
    }
    currentScope = currentScope.upper;
  }

  return null;
};

export const requireHttpsErrorCause = createRule<Options, MessageIds>({
  name: 'require-https-error-cause',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure HttpsError calls inside catch blocks pass the caught error as the fourth "cause" argument to preserve stack traces for monitoring.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      missingCause:
        'HttpsError inside a catch block must pass the caught error as the fourth "cause" argument. Without the original error, the stack is lost and monitoring fingerprints degrade. Add {{catchName}} as the cause argument after the optional details parameter.',
      causeNotCatchBinding:
        'The fourth HttpsError argument should be the catch binding {{catchName}} so the original error stack is preserved for monitoring. Pass the catch variable instead of {{actual}}.',
      missingCatchBinding:
        'HttpsError inside a catch block needs a named catch binding so the original error can be forwarded as the fourth "cause" argument. Bind the error value (e.g., `catch (error)`) and pass that variable as the cause to keep the upstream stack trace.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const catchStack: CatchFrame[] = [];

    // ESLint 9 moves getScope onto sourceCode; ESLint 8 exposes context.getScope().
    // This shim keeps the rule compatible until the codebase drops ESLint 8 support.
    const getScopeForNode = (node: TSESTree.Node) => {
      try {
        const sourceCodeWithScope = sourceCode as unknown as {
          getScope?: (currentNode?: TSESTree.Node) => TSESLint.Scope.Scope | null;
        };

        if (typeof sourceCodeWithScope.getScope === 'function') {
          return sourceCodeWithScope.getScope(node) ?? context.getScope();
        }

        return context.getScope();
      } catch {
        return context.getScope();
      }
    };

    const reportMissingCause = (
      node: TSESTree.NewExpression | TSESTree.CallExpression,
      catchName: string,
    ) => {
      context.report({
        node,
        messageId: 'missingCause',
        data: {
          catchName,
        },
      });
    };

    const reportWrongCause = (
      node: TSESTree.Node,
      catchName: string,
      actual: string,
    ) => {
      context.report({
        node,
        messageId: 'causeNotCatchBinding',
        data: {
          catchName,
          actual,
        },
      });
    };

    const isCatchBindingReference = (
      identifier: TSESTree.Identifier,
      frame: CatchFrame,
    ): boolean => {
      if (!frame.paramName || identifier.name !== frame.paramName) {
        return false;
      }

      const variable = findVariableInScopeChain(
        getScopeForNode(identifier),
        identifier.name,
      );

      return (
        variable?.defs.some(
          (definition) =>
            definition.type === 'CatchClause' && definition.node === frame.node,
        ) ?? false
      );
    };

    const validateHttpsError = (
      node: TSESTree.NewExpression | TSESTree.CallExpression,
    ) => {
      if (!catchStack.length) {
        return;
      }

      if (!isHttpsErrorCallee(node.callee)) {
        return;
      }

      const activeCatch = catchStack[catchStack.length - 1];

      if (!activeCatch.paramName) {
        context.report({
          node,
          messageId: 'missingCatchBinding',
        });
        return;
      }

      const catchName = activeCatch.paramName;

      // HttpsError accepts both positional and object-based constructors. This signature
      // is supported for compatibility with HttpsError overloads, ensuring the rule
      // can validate the 'cause' property within a settings object to preserve
      // error chaining for better diagnostics.
      if (
        node.arguments.length === 1 &&
        node.arguments[0].type === AST_NODE_TYPES.ObjectExpression
      ) {
        const settingsObj = node.arguments[0];
        const causeProp = settingsObj.properties.find(
          (prop): prop is TSESTree.Property =>
            prop.type === AST_NODE_TYPES.Property &&
            !prop.computed &&
            ((prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === 'cause') ||
              (prop.key.type === AST_NODE_TYPES.Literal &&
                prop.key.value === 'cause')),
        );

        if (!causeProp) {
          reportMissingCause(node, catchName);
          return;
        }

        const causeValue = causeProp.value;

        if (causeValue.type !== AST_NODE_TYPES.Identifier) {
          reportWrongCause(
            causeValue,
            catchName,
            sourceCode.getText(causeValue),
          );
          return;
        }

        if (!isCatchBindingReference(causeValue, activeCatch)) {
          reportWrongCause(
            causeValue,
            catchName,
            sourceCode.getText(causeValue),
          );
        }
        return;
      }

      if (node.arguments.length < 4) {
        reportMissingCause(node, catchName);
        return;
      }

      const causeArg = node.arguments[3];

      if (!causeArg || causeArg.type !== AST_NODE_TYPES.Identifier) {
        reportWrongCause(
          causeArg ?? node,
          catchName,
          causeArg
            ? sourceCode.getText(causeArg)
            : 'the missing cause argument',
        );
        return;
      }

      if (!isCatchBindingReference(causeArg, activeCatch)) {
        reportWrongCause(causeArg, catchName, sourceCode.getText(causeArg));
      }
    };

    return {
      CatchClause(node: TSESTree.CatchClause) {
        if (node.param?.type === AST_NODE_TYPES.Identifier) {
          catchStack.push({ paramName: node.param.name, node });
          return;
        }

        // Destructured catch params (e.g., `catch ({ message })`) do not bind the
        // full error object, so they cannot be forwarded as the HttpsError cause.
        // Users should bind the error value (e.g., `catch (error)`) before rethrowing.
        catchStack.push({ paramName: null, node });
      },
      'CatchClause:exit'() {
        catchStack.pop();
      },
      NewExpression(node: TSESTree.NewExpression) {
        validateHttpsError(node);
      },
      CallExpression(node: TSESTree.CallExpression) {
        validateHttpsError(node);
      },
    };
  },
});
