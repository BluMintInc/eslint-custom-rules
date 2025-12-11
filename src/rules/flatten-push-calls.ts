import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'flattenPushCalls';

type PushCallStatement = {
  statement: TSESTree.ExpressionStatement;
  call: TSESTree.CallExpression;
  targetKey: string;
  calleeText: string;
};

const PUSH_METHOD_NAME = 'push';

function unwrapExpression(expression: TSESTree.Expression): TSESTree.Expression {
  let current: TSESTree.Expression = expression;

  // Peel off harmless wrappers to compare the underlying array identity
  // (e.g., arr!.push(), arr as Foo, (arr).push()).
  while (true) {
    if (current.type === AST_NODE_TYPES.TSNonNullExpression) {
      current = current.expression;
      continue;
    }

    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSTypeAssertion ||
      current.type === AST_NODE_TYPES.TSInstantiationExpression
    ) {
      current = current.expression as TSESTree.Expression;
      continue;
    }

    if (current.type === AST_NODE_TYPES.ChainExpression) {
      current = (current as TSESTree.ChainExpression)
        .expression as TSESTree.Expression;
      continue;
    }

    break;
  }

  return current;
}

function getPropertyKey(
  property: TSESTree.Expression | TSESTree.PrivateIdentifier,
  computed: boolean,
): string | null {
  if (!computed && property.type === AST_NODE_TYPES.Identifier) {
    return property.name;
  }

  if (property.type === AST_NODE_TYPES.Literal) {
    const value =
      typeof property.value === 'string' || typeof property.value === 'number'
        ? property.value
        : null;
    return value !== null ? String(value) : null;
  }

  if (
    computed &&
    property.type === AST_NODE_TYPES.Identifier &&
    property.name !== ''
  ) {
    return property.name;
  }

  return null;
}

function getCalleeWithTypeParams(
  call: TSESTree.CallExpression,
  sourceCode: TSESLint.SourceCode,
): string {
  const calleeStart =
    call.callee.range?.[0] ?? sourceCode.getIndexFromLoc(call.callee.loc.start);
  const calleeEnd = call.typeParameters
    ? call.typeParameters.range?.[1] ??
      sourceCode.getIndexFromLoc(call.typeParameters.loc.end)
    : call.callee.range?.[1] ??
      sourceCode.getIndexFromLoc(call.callee.loc.end);

  return sourceCode.text.slice(calleeStart, calleeEnd);
}

function getPreferredCalleeText(group: PushCallStatement[]): string {
  const withTypeParams = group.find((entry) => entry.call.typeParameters);
  return withTypeParams ? withTypeParams.calleeText : group[0].calleeText;
}

function getExpressionIdentity(expression: TSESTree.Expression): string | null {
  const node = unwrapExpression(expression);

  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
      return `id:${node.name}`;
    case AST_NODE_TYPES.ThisExpression:
      return 'this';
    case AST_NODE_TYPES.Super:
      return 'super';
    case AST_NODE_TYPES.Literal:
      if (typeof node.value === 'string' || typeof node.value === 'number') {
        return `lit:${String(node.value)}`;
      }
      return null;
    case AST_NODE_TYPES.ChainExpression:
      return getExpressionIdentity(
        (node as TSESTree.ChainExpression)
          .expression as TSESTree.Expression,
      );
    case AST_NODE_TYPES.MemberExpression: {
      if (node.property.type === AST_NODE_TYPES.PrivateIdentifier) return null;
      const objectKey = getExpressionIdentity(
        node.object as TSESTree.Expression,
      );
      const propertyKey = getPropertyKey(node.property, Boolean(node.computed));
      if (!objectKey || !propertyKey) return null;
      return `${objectKey}.${propertyKey}`;
    }
    default:
      return null;
  }
}

function isPushCallStatement(
  statement: TSESTree.Statement,
  sourceCode: TSESLint.SourceCode,
): PushCallStatement | null {
  if (statement.type !== AST_NODE_TYPES.ExpressionStatement) return null;

  const expr = statement.expression;
  if (expr.type !== AST_NODE_TYPES.CallExpression) return null;

  if (expr.optional) return null;
  const callee = expr.callee;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.optional ||
    callee.property.type === AST_NODE_TYPES.PrivateIdentifier
  ) {
    return null;
  }

  const propertyName =
    callee.property.type === AST_NODE_TYPES.Identifier
      ? callee.property.name
      : callee.property.type === AST_NODE_TYPES.Literal
        ? callee.property.value
        : null;

  if (propertyName !== PUSH_METHOD_NAME) return null;

  const targetKey = getExpressionIdentity(callee.object as TSESTree.Expression);
  if (!targetKey) return null;

  return {
    statement,
    call: expr,
    targetKey,
    calleeText: getCalleeWithTypeParams(expr, sourceCode),
  };
}

function getLineIndent(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): string {
  const start = node.range?.[0] ?? sourceCode.getIndexFromLoc(node.loc.start);
  const text = sourceCode.text;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const indentMatch = text.slice(lineStart, start).match(/^[\t ]*/u);
  return indentMatch ? indentMatch[0] : '';
}

function normalizeIndentation(text: string): string {
  const lines = text.split('\n');
  const indents = lines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => (line.match(/^[\t ]*/u)?.[0].length ?? 0));

  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  if (minIndent === 0) return text;

  return [
    lines[0],
    ...lines.slice(1).map((line) => line.slice(Math.min(minIndent, line.length))),
  ].join('\n');
}

function indentText(text: string, indent: string): string {
  const normalized = normalizeIndentation(text);
  return normalized
    .split('\n')
    .map((line) => indent + line)
    .join('\n');
}

function formatComments(
  comments: TSESTree.Comment[],
  indent: string,
  sourceCode: TSESLint.SourceCode,
): string[] {
  return comments.map((comment) =>
    indentText(sourceCode.getText(comment), indent),
  );
}

function getLeadingCommentsBetween(
  sourceCode: TSESLint.SourceCode,
  previous: TSESTree.Statement,
  current: TSESTree.Statement,
): TSESTree.Comment[] {
  const previousEnd =
    previous.range?.[1] ?? sourceCode.getIndexFromLoc(previous.loc.end);
  return sourceCode
    .getCommentsBefore(current)
    .filter((comment) => comment.range[0] >= previousEnd);
}

export const flattenPushCalls = createRule<[], MessageIds>({
  name: 'flatten-push-calls',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Consolidate consecutive push calls on the same array into a single push with multiple arguments.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      flattenPushCalls:
        'Combine consecutive push calls on "{{target}}" into a single push with all items. One batched call preserves left-to-right evaluation, reduces call overhead, and makes the intent to add several items obvious.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    function buildReplacement(group: PushCallStatement[]): string | null {
      const first = group[0];
      const last = group[group.length - 1];
      const totalArgs = group.reduce(
        (count, item) => count + item.call.arguments.length,
        0,
      );
      const calleeText = getPreferredCalleeText(group);

      const segments = group.map((entry, index) => {
        const previous = index > 0 ? group[index - 1].statement : null;
        const comments =
          previous === null
            ? []
            : getLeadingCommentsBetween(sourceCode, previous, entry.statement);
        return { comments, args: entry.call.arguments };
      });

      const hasInterstitialComments = segments.some(
        (segment) => segment.comments.length > 0,
      );
      const hasMultilineArgument = group.some((entry) =>
        entry.call.arguments.some((arg) => sourceCode.getText(arg).includes('\n')),
      );

      const shouldUseMultiline =
        hasInterstitialComments || hasMultilineArgument || totalArgs > 2;

      const baseIndent = getLineIndent(first.statement, sourceCode);
      const argumentIndent = `${baseIndent}  `;

      const argumentParts: string[] = [];

      segments.forEach((segment) => {
        if (!shouldUseMultiline) {
          segment.args.forEach((arg) => {
            argumentParts.push(sourceCode.getText(arg));
          });
          return;
        }

        const formattedComments = formatComments(
          segment.comments,
          argumentIndent,
          sourceCode,
        );

        if (segment.args.length === 0) {
          if (formattedComments.length > 0) {
            argumentParts.push(formattedComments.join('\n'));
          }
          return;
        }

        segment.args.forEach((arg, index) => {
          const argText = indentText(sourceCode.getText(arg), argumentIndent);
          if (index === 0 && formattedComments.length > 0) {
            argumentParts.push(`${formattedComments.join('\n')}\n${argText}`);
          } else {
            argumentParts.push(argText);
          }
        });
      });

      const argsText = shouldUseMultiline
        ? `\n${argumentParts.join(',\n')}\n${baseIndent}`
        : argumentParts.join(', ');

      const hasSemicolon =
        sourceCode.getLastToken(last.statement)?.value === ';' ||
        sourceCode.getLastToken(first.statement)?.value === ';';

      const replacement = `${calleeText}(${argsText})${
        hasSemicolon ? ';' : ''
      }`;

      const currentText = sourceCode
        .getText()
        .slice(first.statement.range[0], last.statement.range[1]);

      return currentText === replacement ? null : replacement;
    }

    function checkStatements(statements: TSESTree.Statement[]): void {
      for (let i = 0; i < statements.length; i++) {
        const info = isPushCallStatement(statements[i], sourceCode);
        if (!info) continue;

        const group: PushCallStatement[] = [info];
        let cursor = i + 1;

        while (cursor < statements.length) {
          const next = isPushCallStatement(statements[cursor], sourceCode);
          if (!next || next.targetKey !== info.targetKey) break;
          group.push(next);
          cursor += 1;
        }

        if (group.length > 1) {
          const totalArgs = group.reduce(
            (count, entry) => count + entry.call.arguments.length,
            0,
          );

          const firstArgs = group[0].call.arguments.length;
          if (totalArgs > firstArgs) {
            context.report({
              node: group[0].call.callee,
              messageId: 'flattenPushCalls',
              data: {
                target: sourceCode.getText(
                  (group[0].call.callee as TSESTree.MemberExpression).object,
                ),
              },
              fix(fixer) {
                const replacement = buildReplacement(group);
                if (!replacement) return null;
                return fixer.replaceTextRange(
                  [
                    group[0].statement.range[0],
                    group[group.length - 1].statement.range[1],
                  ],
                  replacement,
                );
              },
            });
          }
        }

        i = cursor - 1;
      }
    }

    return {
      Program(node) {
        checkStatements(node.body);
      },
      BlockStatement(node) {
        checkStatements(node.body);
      },
      SwitchCase(node) {
        checkStatements(node.consequent);
      },
    };
  },
});
