import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'catchAlreadyExistsInTransaction';

type ErrorCheckMatch = 'already-exists' | '6';

const TARGET_STRING_CODES = new Set(['already-exists', 'ALREADY_EXISTS']);
const TARGET_NUMBER_CODES = new Set([6]);

export const noTryCatchAlreadyExistsInTransaction = createRule<
  [],
  MessageIds
>({
  name: 'no-try-catch-already-exists-in-transaction',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow handling ALREADY_EXISTS errors inside Firestore runTransaction callbacks. Handle them outside the transaction to avoid re-running error logic on retries.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      catchAlreadyExistsInTransaction:
        'Do not catch ALREADY_EXISTS ({{code}}) inside a Firestore transaction. ALREADY_EXISTS is a permanent failure, and running this catch block inside runTransaction makes the error handler re-run on automatic retries. Move the try/catch outside the transaction callback or use runCreateForgivenessTransaction so the retryable work stays inside the transaction and the ALREADY_EXISTS handler runs once.',
    },
  },
  defaultOptions: [],
  create(context) {
    const transactionCallbacks = new Set<TSESTree.Node>();

    function unwrapExpression(
      expression: TSESTree.Expression,
    ): TSESTree.Expression {
      const maybeParenthesized = expression as {
        type: string;
        expression?: TSESTree.Expression;
      };
      if (
        maybeParenthesized.type === 'ParenthesizedExpression' &&
        maybeParenthesized.expression
      ) {
        return unwrapExpression(maybeParenthesized.expression);
      }

      switch (expression.type) {
        case AST_NODE_TYPES.TSAsExpression:
        case AST_NODE_TYPES.TSTypeAssertion:
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.ChainExpression:
          return unwrapExpression(expression.expression);
        default:
          return expression;
      }
    }

    function addNamesFromPattern(
      pattern: TSESTree.Node,
      target: Set<string>,
    ): void {
      if (pattern.type === AST_NODE_TYPES.Identifier) {
        target.add(pattern.name);
        return;
      }

      if (pattern.type === AST_NODE_TYPES.RestElement) {
        addNamesFromPattern(pattern.argument, target);
        return;
      }

      if (pattern.type === AST_NODE_TYPES.AssignmentPattern) {
        addNamesFromPattern(pattern.left, target);
        return;
      }

      if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
        for (const property of pattern.properties) {
          if (property.type === AST_NODE_TYPES.RestElement) {
            addNamesFromPattern(property.argument, target);
            continue;
          }

          if (property.type === AST_NODE_TYPES.Property) {
            addNamesFromPattern(property.value, target);
          }
        }
        return;
      }

      if (pattern.type === AST_NODE_TYPES.ArrayPattern) {
        for (const element of pattern.elements) {
          if (!element) continue;
          addNamesFromPattern(element, target);
        }
      }
    }

    function getCatchIdentifiers(
      param: TSESTree.CatchClause['param'],
    ): Set<string> {
      const names = new Set<string>();
      if (!param) return names;
      addNamesFromPattern(param, names);
      return names;
    }

    function traverse(
      node: TSESTree.Node,
      visitor: (node: TSESTree.Node) => void,
    ): void {
      visitor(node);
      const entries = Object.entries(node) as Array<[string, unknown]>;
      for (const [key, value] of entries) {
        if (key === 'parent') continue;
        if (!value) continue;
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child && typeof child === 'object' && 'type' in child) {
              traverse(child as TSESTree.Node, visitor);
            }
          }
          continue;
        }
        if (typeof value === 'object' && 'type' in value) {
          traverse(value as TSESTree.Node, visitor);
        }
      }
    }

    function expressionReferencesIdentifiers(
      expression: TSESTree.Node,
      identifiers: Set<string>,
    ): boolean {
      let found = false;
      traverse(expression as TSESTree.Node, (node) => {
        if (found) return;
        if (
          node.type === AST_NODE_TYPES.Identifier &&
          identifiers.has(node.name)
        ) {
          found = true;
        }
      });
      return found;
    }

    function isErrorCodeExpression(
      expression: TSESTree.Expression,
      identifiers: Set<string>,
    ): boolean {
      const unwrapped = unwrapExpression(expression);

      if (unwrapped.type === AST_NODE_TYPES.Identifier) {
        return identifiers.has(unwrapped.name);
      }

      if (unwrapped.type === AST_NODE_TYPES.MemberExpression) {
        const object = unwrapExpression(
          unwrapped.object as TSESTree.Expression,
        );
        const property = unwrapped.property;
        const isCodeProperty =
          (!unwrapped.computed &&
            property.type === AST_NODE_TYPES.Identifier &&
            property.name === 'code') ||
          (unwrapped.computed &&
            property.type === AST_NODE_TYPES.Literal &&
            property.value === 'code');

        if (!isCodeProperty) return false;

        if (
          object.type === AST_NODE_TYPES.Identifier &&
          identifiers.has(object.name)
        ) {
          return true;
        }

        return isErrorCodeExpression(object, identifiers);
      }

      return false;
    }

    function getCodeLiteral(
      expression: TSESTree.Expression,
    ): ErrorCheckMatch | null {
      const unwrapped = unwrapExpression(expression);

      if (
        unwrapped.type === AST_NODE_TYPES.Literal &&
        typeof unwrapped.value === 'string' &&
        TARGET_STRING_CODES.has(unwrapped.value)
      ) {
        return 'already-exists';
      }

      if (
        unwrapped.type === AST_NODE_TYPES.Literal &&
        typeof unwrapped.value === 'number' &&
        TARGET_NUMBER_CODES.has(unwrapped.value)
      ) {
        return '6';
      }

      if (
        unwrapped.type === AST_NODE_TYPES.TemplateLiteral &&
        unwrapped.expressions.length === 0 &&
        unwrapped.quasis.length === 1
      ) {
        const text = unwrapped.quasis[0].value.cooked;
        if (text && TARGET_STRING_CODES.has(text)) {
          return 'already-exists';
        }
      }

      return null;
    }

    function addErrorAliases(
      node: TSESTree.Node,
      errorIdentifiers: Set<string>,
    ): void {
      if (
        node.type === AST_NODE_TYPES.VariableDeclarator &&
        node.init &&
        expressionReferencesIdentifiers(node.init, errorIdentifiers)
      ) {
        addNamesFromPattern(
          node.id as TSESTree.BindingName | TSESTree.AssignmentPattern,
          errorIdentifiers,
        );
      }
    }

    function binaryExpressionMatches(
      node: TSESTree.BinaryExpression,
      errorIdentifiers: Set<string>,
    ): ErrorCheckMatch | null {
      if (node.operator !== '==' && node.operator !== '===') {
        return null;
      }

      const leftLiteral = getCodeLiteral(node.left as TSESTree.Expression);
      const rightLiteral = getCodeLiteral(node.right as TSESTree.Expression);

      if (leftLiteral && isErrorCodeExpression(node.right as TSESTree.Expression, errorIdentifiers)) {
        return leftLiteral;
      }

      if (rightLiteral && isErrorCodeExpression(node.left as TSESTree.Expression, errorIdentifiers)) {
        return rightLiteral;
      }

      return null;
    }

    function switchCaseMatches(
      node: TSESTree.SwitchStatement,
      errorIdentifiers: Set<string>,
    ): ErrorCheckMatch | null {
      if (!isErrorCodeExpression(node.discriminant as TSESTree.Expression, errorIdentifiers)) {
        return null;
      }

      for (const switchCase of node.cases) {
        if (!switchCase.test) continue;
        const literal = getCodeLiteral(switchCase.test as TSESTree.Expression);
        if (literal) {
          return literal;
        }
      }

      return null;
    }

    function isRunTransactionCall(node: TSESTree.CallExpression): boolean {
      const callee = node.callee;

      if (callee.type === AST_NODE_TYPES.MemberExpression) {
        return (
          !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          callee.property.name === 'runTransaction'
        );
      }

      return callee.type === AST_NODE_TYPES.Identifier && callee.name === 'runTransaction';
    }

    function extractCallback(
      expression: TSESTree.Expression | TSESTree.SpreadElement | undefined,
    ): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null {
      if (!expression || expression.type === AST_NODE_TYPES.SpreadElement) {
        return null;
      }

      if (
        expression.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        expression.type === AST_NODE_TYPES.FunctionExpression
      ) {
        return expression;
      }

      return null;
    }

    function trackTransactionCallback(node: TSESTree.CallExpression): void {
      if (!isRunTransactionCall(node)) return;

      const { arguments: args } = node;
      const callbackFromMemberCall = extractCallback(args[0]);
      const callbackFromIdentifierCall = extractCallback(args[1] ?? args[0]);

      const callback =
        node.callee.type === AST_NODE_TYPES.MemberExpression
          ? callbackFromMemberCall
          : callbackFromIdentifierCall;

      if (callback) {
        transactionCallbacks.add(callback);
      }
    }

    function isInsideTransactionCallback(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;
      while (current) {
        if (transactionCallbacks.has(current)) return true;
        current = current.parent as TSESTree.Node | undefined;
      }
      return false;
    }

    function findAlreadyExistsCheck(
      node: TSESTree.CatchClause,
      errorIdentifiers: Set<string>,
    ): ErrorCheckMatch | null {
      let match: ErrorCheckMatch | null = null;

      traverse(node.body, (current) => {
        if (match) return;

        addErrorAliases(current, errorIdentifiers);

        if (current.type === AST_NODE_TYPES.BinaryExpression) {
          match = binaryExpressionMatches(current, errorIdentifiers);
          return;
        }

        if (current.type === AST_NODE_TYPES.SwitchStatement) {
          match = switchCaseMatches(current, errorIdentifiers);
        }
      });

      return match;
    }

    return {
      CallExpression: trackTransactionCallback,
      CatchClause(node) {
        if (!isInsideTransactionCallback(node)) return;

        const catchIdentifiers = getCatchIdentifiers(node.param);
        const matchedCode = findAlreadyExistsCheck(node, catchIdentifiers);

        if (!matchedCode) return;

        context.report({
          node,
          messageId: 'catchAlreadyExistsInTransaction',
          data: { code: matchedCode === 'already-exists' ? 'already-exists' : '6' },
        });
      },
    };
  },
});
