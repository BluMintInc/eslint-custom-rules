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

function unwrapExpression(
  expression: TSESTree.Expression,
): TSESTree.Expression {
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
    : call.callee.range?.[1] ?? sourceCode.getIndexFromLoc(call.callee.loc.end);

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

function isSafeMemberChain(expression: TSESTree.Expression): boolean {
  const node = unwrapExpression(expression);

  if (
    node.type === AST_NODE_TYPES.Identifier ||
    node.type === AST_NODE_TYPES.ThisExpression ||
    node.type === AST_NODE_TYPES.Super
  ) {
    return true;
  }

  if (node.type === AST_NODE_TYPES.MemberExpression) {
    if (node.property.type === AST_NODE_TYPES.PrivateIdentifier) {
      return false;
    }

    if (node.computed || node.property.type !== AST_NODE_TYPES.Identifier) {
      return false;
    }

    return isSafeMemberChain(node.object as TSESTree.Expression);
  }

  return false;
}

function hasForbiddenSideEffects(
  node: TSESTree.Node | null | undefined,
): boolean {
  if (!node) return false;

  const nodeType = (node as { type: string }).type;
  if (nodeType === 'ParenthesizedExpression') {
    return hasForbiddenSideEffects(
      (node as { expression: TSESTree.Expression }).expression,
    );
  }

  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.ThisExpression:
    case AST_NODE_TYPES.Super:
      return false;
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
    case AST_NODE_TYPES.UpdateExpression:
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.YieldExpression:
    case AST_NODE_TYPES.TaggedTemplateExpression:
    case AST_NODE_TYPES.ImportExpression:
    case AST_NODE_TYPES.AssignmentExpression:
      return true;
    case AST_NODE_TYPES.UnaryExpression:
      if (node.operator === 'delete') return true;
      return hasForbiddenSideEffects(node.argument);
    case AST_NODE_TYPES.BinaryExpression:
    case AST_NODE_TYPES.LogicalExpression:
      return (
        hasForbiddenSideEffects(node.left) ||
        hasForbiddenSideEffects(node.right)
      );
    case AST_NODE_TYPES.ConditionalExpression:
      return (
        hasForbiddenSideEffects(node.test) ||
        hasForbiddenSideEffects(node.consequent) ||
        hasForbiddenSideEffects(node.alternate)
      );
    case AST_NODE_TYPES.MemberExpression:
      return (
        hasForbiddenSideEffects(node.object as TSESTree.Node) ||
        (node.computed && hasForbiddenSideEffects(node.property as TSESTree.Node))
      );
    case AST_NODE_TYPES.ChainExpression:
      return hasForbiddenSideEffects(node.expression);
    case AST_NODE_TYPES.SequenceExpression:
      return node.expressions.some((expr) => hasForbiddenSideEffects(expr));
    case AST_NODE_TYPES.TemplateLiteral:
      return node.expressions.some((expr) => hasForbiddenSideEffects(expr));
    case AST_NODE_TYPES.ArrayExpression:
      return node.elements.some((elem) =>
        elem ? hasForbiddenSideEffects(elem as TSESTree.Node) : false,
      );
    case AST_NODE_TYPES.ObjectExpression:
      return node.properties.some((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          return (
            (prop.computed &&
              hasForbiddenSideEffects(prop.key as TSESTree.Node)) ||
            hasForbiddenSideEffects(prop.value as TSESTree.Node)
          );
        }
        if (prop.type === AST_NODE_TYPES.SpreadElement) {
          return hasForbiddenSideEffects(prop.argument);
        }
        return false;
      });
    case AST_NODE_TYPES.SpreadElement:
      return hasForbiddenSideEffects(node.argument);
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSInstantiationExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return hasForbiddenSideEffects(node.expression);
    default:
      return false;
  }
}

function canSafelyFix(group: PushCallStatement[]): boolean {
  return group.every((entry) => {
    const callee = entry.call.callee as TSESTree.MemberExpression;
    if (
      callee.property.type === AST_NODE_TYPES.PrivateIdentifier ||
      callee.computed ||
      callee.property.type !== AST_NODE_TYPES.Identifier
    ) {
      return false;
    }

    if (!isSafeMemberChain(callee.object as TSESTree.Expression)) {
      return false;
    }

    if (hasForbiddenSideEffects(callee.object as TSESTree.Node)) {
      return false;
    }

    return entry.call.arguments.every((arg) => {
      if (arg.type === AST_NODE_TYPES.SpreadElement) {
        return !hasForbiddenSideEffects(arg.argument);
      }

      return !hasForbiddenSideEffects(arg);
    });
  });
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
  targetNode: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): string {
  const start =
    targetNode.range?.[0] ??
    sourceCode.getIndexFromLoc(targetNode.loc.start);
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
    .map((line) => line.match(/^[\t ]*/u)?.[0].length ?? 0);

  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  if (minIndent === 0) return text;

  return [
    lines[0],
    ...lines
      .slice(1)
      .map((line) => line.slice(Math.min(minIndent, line.length))),
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
        [
          'What’s wrong: "{{target}}" is pushed to using multiple consecutive ".push(...)" calls.',
          'Why it matters: repeated calls add property-access overhead and obscure that these values belong to one append operation.',
          'How to fix: merge them into a single ".push(...)" call with multiple arguments (for example, "{{target}}.push(a, b, c)").',
        ].join(' '),
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    type PushSegment = {
      comments: TSESTree.Comment[];
      args: TSESTree.CallExpressionArgument[];
    };

    function buildSegments(group: PushCallStatement[]): PushSegment[] {
      return group.map((entry, index) => {
        const previous = index > 0 ? group[index - 1].statement : null;
        const comments =
          previous === null
            ? []
            : getLeadingCommentsBetween(sourceCode, previous, entry.statement);
        return { comments, args: entry.call.arguments };
      });
    }

    function shouldUseMultilineFormat(
      segments: PushSegment[],
      group: PushCallStatement[],
      totalArgs: number,
    ): boolean {
      const hasInterstitialComments = segments.some(
        (segment) => segment.comments.length > 0,
      );
      const hasMultilineArgument = group.some((entry) =>
        entry.call.arguments.some((arg) =>
          sourceCode.getText(arg).includes('\n'),
        ),
      );

      return hasInterstitialComments || hasMultilineArgument || totalArgs > 2;
    }

    function detectSemicolon(
      first: PushCallStatement,
      last: PushCallStatement,
    ): boolean {
      return (
        sourceCode.getLastToken(last.statement)?.value === ';' ||
        sourceCode.getLastToken(first.statement)?.value === ';'
      );
    }

    function formatArguments(
      segments: PushSegment[],
      shouldUseMultiline: boolean,
      argumentIndent: string,
    ): string[] {
      if (!shouldUseMultiline) {
        return segments.flatMap((segment) =>
          segment.args.map((arg) => sourceCode.getText(arg)),
        );
      }

      const argumentParts: string[] = [];
      let pendingComments: string[] = [];

      segments.forEach((segment) => {
        const formattedComments = formatComments(
          segment.comments,
          argumentIndent,
          sourceCode,
        );

        pendingComments = pendingComments.concat(formattedComments);
        if (segment.args.length === 0) return;

        segment.args.forEach((arg, index) => {
          const argText = indentText(sourceCode.getText(arg), argumentIndent);
          if (index === 0 && pendingComments.length > 0) {
            argumentParts.push(`${pendingComments.join('\n')}\n${argText}`);
            pendingComments = [];
          } else {
            argumentParts.push(argText);
          }
        });
      });

      if (pendingComments.length > 0 && argumentParts.length > 0) {
        const lastIndex = argumentParts.length - 1;
        argumentParts[lastIndex] = `${
          argumentParts[lastIndex]
        }\n${pendingComments.join('\n')}`;
      }

      return argumentParts;
    }

    function buildFinalReplacement(
      calleeText: string,
      argumentParts: string[],
      shouldUseMultiline: boolean,
      baseIndent: string,
      hasSemicolon: boolean,
    ): string {
      const argsText = shouldUseMultiline
        ? `\n${argumentParts.join(',\n')}\n${baseIndent}`
        : argumentParts.join(', ');

      return `${calleeText}(${argsText})${hasSemicolon ? ';' : ''}`;
    }

    function buildReplacement(group: PushCallStatement[]): string | null {
      const first = group[0];
      const last = group[group.length - 1];
      const totalArgs = group.reduce(
        (count, item) => count + item.call.arguments.length,
        0,
      );
      const calleeText = getPreferredCalleeText(group);

      const segments = buildSegments(group);
      const shouldUseMultiline = shouldUseMultilineFormat(
        segments,
        group,
        totalArgs,
      );
      const baseIndent = getLineIndent(first.statement, sourceCode);
      const argumentIndent = `${baseIndent}  `;
      const argumentParts = formatArguments(
        segments,
        shouldUseMultiline,
        argumentIndent,
      );
      const hasSemicolon = detectSemicolon(first, last);

      const replacement = buildFinalReplacement(
        calleeText,
        argumentParts,
        shouldUseMultiline,
        baseIndent,
        hasSemicolon,
      );

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
            if (!canSafelyFix(group)) {
              i = cursor - 1;
              continue;
            }

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
