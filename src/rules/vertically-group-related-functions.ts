import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type GroupName = 'event-handlers' | 'utilities' | 'other';
type DependencyDirection = 'callers-first' | 'callees-first';
type ExportPlacement = 'top' | 'bottom' | 'ignore';

type Options = [
  Partial<{
    exportPlacement: ExportPlacement;
    dependencyDirection: DependencyDirection;
    groupOrder: GroupName[];
    eventHandlerPattern: string;
    utilityPattern: string;
  }>,
];

type NormalizedOptions = Required<Options[0]>;

type MessageIds = 'misorderedFunction';

type FunctionLikeNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type FunctionStatementNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.VariableDeclaration
  | TSESTree.ExportNamedDeclaration
  | TSESTree.ExportDefaultDeclaration;

type FunctionInfo = {
  name: string;
  fnNode: FunctionLikeNode;
  statementNode: FunctionStatementNode;
  isExported: boolean;
  isEventHandler: boolean;
  isUtility: boolean;
  dependencies: string[];
  originalIndex: number;
};

const DEFAULT_OPTIONS: NormalizedOptions = {
  exportPlacement: 'ignore',
  dependencyDirection: 'callers-first',
  groupOrder: ['event-handlers', 'other', 'utilities'],
  eventHandlerPattern: '^(handle[A-Z]|on[A-Z])',
  utilityPattern:
    '^(get|set|fetch|load|format|compute|transform|build|derive|prepare)',
};

const DEFAULT_OPTIONS_ARRAY: Options = [DEFAULT_OPTIONS];

const PATTERN_LENGTH_LIMIT = 200;
const NESTED_QUANTIFIER_PATTERN = /\([^)]*[+*][^)]*\)\s*[\+\*{]/;
const BROAD_QUANTIFIER_WITH_BACKREFERENCE_PATTERN =
  /(?:\.\*|\.\+)[^)]*\\\d/;
const REPEATED_BROAD_QUANTIFIER_PATTERN = /(?:\.\*|\.\+).*(?:\.\*|\.\+)/;

function isPatternLikelySafe(pattern: string): { safe: boolean; reason?: string } {
  if (pattern.length > PATTERN_LENGTH_LIMIT) {
    return {
      safe: false,
      reason: `pattern longer than ${PATTERN_LENGTH_LIMIT} characters`,
    };
  }
  if (NESTED_QUANTIFIER_PATTERN.test(pattern)) {
    return {
      safe: false,
      reason:
        'nested quantifiers can trigger catastrophic backtracking (e.g., "(.+)+")',
    };
  }
  if (REPEATED_BROAD_QUANTIFIER_PATTERN.test(pattern)) {
    return {
      safe: false,
      reason: 'multiple greedy wildcards in one pattern create heavy backtracking',
    };
  }
  if (BROAD_QUANTIFIER_WITH_BACKREFERENCE_PATTERN.test(pattern)) {
    return {
      safe: false,
      reason:
        'combining greedy wildcards with backreferences is prone to ReDoS backtracking',
    };
  }

  return { safe: true };
}

function createRegexWithFallback(
  pattern: string | undefined,
  fallback: string,
  onUnsafe?: (value: string, reason: string) => void,
) {
  if (pattern) {
    const safety = isPatternLikelySafe(pattern);
    if (!safety.safe) {
      onUnsafe?.(
        pattern,
        safety.reason ||
          'pattern rejected because it may cause catastrophic backtracking',
      );
      return new RegExp(fallback);
    }
  }

  try {
    return new RegExp(pattern ?? fallback);
  } catch (error) {
    if (pattern) {
      onUnsafe?.(
        pattern,
        (error as Error)?.message || 'pattern failed to compile',
      );
    }
    return new RegExp(fallback);
  }
}

function normalizeGroupOrder(order: GroupName[] | undefined): GroupName[] {
  const base = DEFAULT_OPTIONS.groupOrder;
  if (!order || order.length === 0) {
    return base;
  }
  const seen = new Set<GroupName>();
  const combined: GroupName[] = [];
  for (const group of [...order, ...base]) {
    if (!seen.has(group)) {
      seen.add(group);
      combined.push(group);
    }
  }
  return combined;
}

function classifyGroup(
  info: Pick<FunctionInfo, 'isEventHandler' | 'isUtility'>,
): GroupName {
  if (info.isEventHandler) {
    return 'event-handlers';
  }
  if (info.isUtility) {
    return 'utilities';
  }
  return 'other';
}

function isNamedFunctionDeclaration(
  node: TSESTree.FunctionDeclaration | null | undefined,
): node is TSESTree.FunctionDeclaration & { id: TSESTree.Identifier } {
  return Boolean(node && node.id && node.id.type === 'Identifier');
}

function isFunctionExpressionLike(
  node: TSESTree.Node | null | undefined,
): node is FunctionLikeNode {
  return (
    !!node &&
    (node.type === 'ArrowFunctionExpression' ||
      node.type === 'FunctionExpression' ||
      node.type === 'FunctionDeclaration')
  );
}

function extractFunctionFromVariableDeclaration(
  statement: TSESTree.VariableDeclaration,
): { name: string; fnNode: FunctionLikeNode } | null {
  if (statement.declarations.length !== 1) {
    return null;
  }
  const declarator = statement.declarations[0];
  if (
    declarator.id.type !== 'Identifier' ||
    !isFunctionExpressionLike(declarator.init)
  ) {
    return null;
  }
  return { name: declarator.id.name, fnNode: declarator.init };
}

function collectFunctions(
  programBody: TSESTree.Statement[],
  eventHandlerRegex: RegExp,
  utilityRegex: RegExp,
): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  programBody.forEach((statement, index) => {
    if (statement.type === 'FunctionDeclaration') {
      if (!isNamedFunctionDeclaration(statement)) {
        return;
      }
      const name = statement.id.name;
      const isExported = ASTHelpers.isNodeExported(statement);
      functions.push({
        name,
        fnNode: statement,
        statementNode: statement,
        isExported,
        isEventHandler: eventHandlerRegex.test(name),
        isUtility: utilityRegex.test(name),
        dependencies: [],
        originalIndex: index,
      });
      return;
    }

    if (statement.type === 'ExportNamedDeclaration' && statement.declaration) {
      if (statement.declaration.type === 'FunctionDeclaration') {
        if (!isNamedFunctionDeclaration(statement.declaration)) {
          return;
        }
        const name = statement.declaration.id.name;
        functions.push({
          name,
          fnNode: statement.declaration,
          statementNode: statement,
          isExported: true,
          isEventHandler: eventHandlerRegex.test(name),
          isUtility: utilityRegex.test(name),
          dependencies: [],
          originalIndex: index,
        });
        return;
      }
      if (statement.declaration.type === 'VariableDeclaration') {
        const extracted = extractFunctionFromVariableDeclaration(
          statement.declaration,
        );
        if (extracted) {
          const { name, fnNode } = extracted;
          functions.push({
            name,
            fnNode,
            statementNode: statement,
            isExported: true,
            isEventHandler: eventHandlerRegex.test(name),
            isUtility: utilityRegex.test(name),
            dependencies: [],
            originalIndex: index,
          });
        }
      }
      return;
    }

    if (
      statement.type === 'ExportDefaultDeclaration' &&
      isFunctionExpressionLike(statement.declaration) &&
      (statement.declaration as TSESTree.FunctionDeclaration).id
    ) {
      const name = (
        statement.declaration as TSESTree.FunctionDeclaration
      ).id!.name;
      functions.push({
        name,
        fnNode: statement.declaration,
        statementNode: statement,
        isExported: true,
        isEventHandler: eventHandlerRegex.test(name),
        isUtility: utilityRegex.test(name),
        dependencies: [],
        originalIndex: index,
      });
      return;
    }

    if (statement.type === 'VariableDeclaration') {
      const extracted = extractFunctionFromVariableDeclaration(statement);
      if (extracted) {
        const { name, fnNode } = extracted;
        const isExported = ASTHelpers.isNodeExported(statement);
        functions.push({
          name,
          fnNode,
          statementNode: statement,
          isExported,
          isEventHandler: eventHandlerRegex.test(name),
          isUtility: utilityRegex.test(name),
          dependencies: [],
          originalIndex: index,
        });
      }
    }
  });

  return functions;
}

function collectDependencies(
  fnNode: FunctionLikeNode,
  knownFunctionNames: Set<string>,
): string[] {
  const dependencies = new Set<string>();

  const visit = (node: TSESTree.Node | null | undefined) => {
    if (!node || !ASTHelpers.isNode(node)) {
      return;
    }

    if (
      (node.type === 'CallExpression' || node.type === 'NewExpression') &&
      node.callee &&
      (node.callee as TSESTree.Identifier).type === 'Identifier'
    ) {
      const calleeName = (node.callee as TSESTree.Identifier).name;
      if (knownFunctionNames.has(calleeName)) {
        dependencies.add(calleeName);
      }
    }

    Object.values(node).forEach((value) => {
      if (!value || value === node || (node as any).parent === value) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((child) => {
          if (ASTHelpers.isNode(child)) {
            visit(child);
          }
        });
      } else if (ASTHelpers.isNode(value)) {
        visit(value);
      }
    });
  };

  visit(fnNode.body);

  return [...dependencies];
}

function dependencyOrder(
  functions: FunctionInfo[],
  direction: DependencyDirection,
): string[] {
  const dependencyMap = new Map<string, string[]>();
  const originalIndexMap = new Map(
    functions.map((fn) => [fn.name, fn.originalIndex] as const),
  );

  functions.forEach((fn) => {
    dependencyMap.set(fn.name, fn.dependencies);
  });

  const visited = new Set<string>();
  const order: string[] = [];
  const namesInOriginalOrder = functions
    .slice()
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((fn) => fn.name);

  const incomingCount = new Map<string, number>();
  functions.forEach((fn) => {
    if (!incomingCount.has(fn.name)) {
      incomingCount.set(fn.name, 0);
    }
    fn.dependencies.forEach((dep) => {
      incomingCount.set(dep, (incomingCount.get(dep) || 0) + 1);
    });
  });

  const roots = namesInOriginalOrder.filter(
    (name) => (incomingCount.get(name) || 0) === 0,
  );

  const visit = (name: string) => {
    if (visited.has(name)) {
      return;
    }
    visited.add(name);
    const deps =
      dependencyMap.get(name)?.slice().sort((a, b) => {
        return (originalIndexMap.get(a) || 0) - (originalIndexMap.get(b) || 0);
      }) || [];
    if (direction === 'callees-first') {
      deps.forEach(visit);
      order.push(name);
    } else {
      order.push(name);
      deps.forEach(visit);
    }
  };

  [...roots, ...namesInOriginalOrder].forEach(visit);

  return order;
}

function computeExpectedOrder(
  functions: FunctionInfo[],
  options: NormalizedOptions,
): FunctionInfo[] {
  const groupOrder = normalizeGroupOrder(options.groupOrder);
  const dependencySequence = dependencyOrder(
    functions,
    options.dependencyDirection,
  );
  const dependencyRank = new Map(
    dependencySequence.map((name, idx) => [name, idx]),
  );

  const exportRank = (fn: FunctionInfo) => {
    if (options.exportPlacement === 'ignore') {
      return 0;
    }
    if (options.exportPlacement === 'top') {
      return fn.isExported ? 0 : 1;
    }
    return fn.isExported ? 1 : 0;
  };

  const groupRank = (fn: FunctionInfo) =>
    groupOrder.indexOf(classifyGroup(fn as FunctionInfo));

  return functions.slice().sort((a, b) => {
    return (
      exportRank(a) - exportRank(b) ||
      groupRank(a) - groupRank(b) ||
      (dependencyRank.get(a.name) ?? Number.MAX_SAFE_INTEGER) -
        (dependencyRank.get(b.name) ?? Number.MAX_SAFE_INTEGER) ||
      a.originalIndex - b.originalIndex
    );
  });
}

function getStatementRangeWithComments(
  statement: FunctionStatementNode,
  sourceCode: Readonly<TSESLint.SourceCode>,
  consumedComments?: Set<TSESTree.Comment>,
  nextStatement?: FunctionStatementNode,
): [number, number] {
  const filterComments = (comments: TSESTree.Comment[]) =>
    (comments || []).filter(
      (comment) => !consumedComments || !consumedComments.has(comment),
    );

  const commentsBefore = filterComments(
    sourceCode.getCommentsBefore(statement) || [],
  );
  const nextLeadingComments = nextStatement
    ? new Set(
        filterComments(sourceCode.getCommentsBefore(nextStatement) || []),
      )
    : new Set<TSESTree.Comment>();
  const trailingCandidates = filterComments(
    sourceCode.getCommentsAfter(statement) || [],
  ).filter((comment) => !nextLeadingComments.has(comment));

  const start =
    commentsBefore.length > 0
      ? Math.min(statement.range[0], commentsBefore[0].range[0])
      : statement.range[0];
  const end =
    trailingCandidates.length > 0
      ? Math.max(
          statement.range[1],
          trailingCandidates[trailingCandidates.length - 1].range[1],
        )
      : statement.range[1];

  commentsBefore.forEach((comment) => consumedComments?.add(comment));
  trailingCandidates.forEach((comment) => consumedComments?.add(comment));

  return [start, end];
}

export const verticallyGroupRelatedFunctions: TSESLint.RuleModule<
  MessageIds,
  Options
> = createRule({
  name: 'vertically-group-related-functions',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Keep top-level functions grouped vertically so callers, exports, and helpers read top-down.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          exportPlacement: {
            enum: ['top', 'bottom', 'ignore'],
            default: DEFAULT_OPTIONS.exportPlacement,
          },
          dependencyDirection: {
            enum: ['callers-first', 'callees-first'],
            default: DEFAULT_OPTIONS.dependencyDirection,
          },
          groupOrder: {
            type: 'array',
            items: {
              enum: ['event-handlers', 'utilities', 'other'],
            },
            minItems: 1,
            uniqueItems: true,
          },
          eventHandlerPattern: {
            type: 'string',
          },
          utilityPattern: {
            type: 'string',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      misorderedFunction:
        'Function "{{name}}" is out of order: {{reason}}. Move it {{placement}} to keep related call chains grouped so readers can scan the file top-down.',
    },
  },
  defaultOptions: DEFAULT_OPTIONS_ARRAY,
  create(context, [options]) {
    const normalizedOptions: NormalizedOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    const warnUnsafePattern = (
      key: 'eventHandlerPattern' | 'utilityPattern',
      value: string,
      reason: string,
    ) => {
      const truncatedValue =
        value.length > 120 ? `${value.slice(0, 117)}...` : value;
      console.warn(
        `[vertically-group-related-functions] ${key} "${truncatedValue}" rejected: ${reason}. Falling back to safe defaults.`,
      );
    };
    const eventHandlerRegex = createRegexWithFallback(
      options?.eventHandlerPattern,
      DEFAULT_OPTIONS.eventHandlerPattern,
      options?.eventHandlerPattern
        ? (value, reason) => warnUnsafePattern('eventHandlerPattern', value, reason)
        : undefined,
    );
    const utilityRegex = createRegexWithFallback(
      options?.utilityPattern,
      DEFAULT_OPTIONS.utilityPattern,
      options?.utilityPattern
        ? (value, reason) => warnUnsafePattern('utilityPattern', value, reason)
        : undefined,
    );

    return {
      'Program:exit'(node: TSESTree.Program) {
        const functions = collectFunctions(
          node.body,
          eventHandlerRegex,
          utilityRegex,
        );

        if (functions.length < 2) {
          return;
        }

        const uniqueNames = new Set(functions.map((fn) => fn.name));
        if (uniqueNames.size !== functions.length) {
          return;
        }

        const knownNames = new Set(functions.map((fn) => fn.name));
        functions.forEach((fn) => {
          fn.dependencies = collectDependencies(fn.fnNode, knownNames);
        });

        const expectedOrderInfos = computeExpectedOrder(
          functions,
          normalizedOptions,
        );
        const expectedNames = expectedOrderInfos.map((fn) => fn.name);
        const actualNames = functions.map((fn) => fn.name);

        if (
          expectedNames.length === actualNames.length &&
          expectedNames.every((name, idx) => name === actualNames[idx])
        ) {
          return;
        }

        const misplacedIndex = actualNames.findIndex(
          (name, idx) => name !== expectedNames[idx],
        );
        if (misplacedIndex === -1) {
          return;
        }

        const misplacedInfo = functions[misplacedIndex];
        const targetIndex = expectedNames.indexOf(misplacedInfo.name);
        const anchorName =
          targetIndex > 0 ? expectedNames[targetIndex - 1] : null;

        const dependencyReason =
          misplacedInfo.dependencies.length > 0
            ? normalizedOptions.dependencyDirection === 'callees-first'
              ? `it calls ${misplacedInfo.dependencies.join(
                  ', ',
                )} and helpers should precede the callers that depend on them when dependencyDirection is "callees-first"`
              : `it calls ${misplacedInfo.dependencies.join(
                  ', ',
                )} and callers should sit above the helpers they invoke`
            : 'keep related functions adjacent';

        const exportReason =
          normalizedOptions.exportPlacement === 'ignore'
            ? ''
            : normalizedOptions.exportPlacement === 'top'
              ? 'exports stay at the top of the file'
              : 'exports stay at the bottom of the file';

        const group = classifyGroup(misplacedInfo);
        const groupOrder = normalizeGroupOrder(normalizedOptions.groupOrder);
        const groupReason =
          groupOrder.indexOf(group) > 0
            ? `${group.replace('-', ' ')} should follow the configured group order`
            : '';

        const reasons = [dependencyReason, exportReason, groupReason]
          .filter(Boolean)
          .join('; ');

        const placement = anchorName
          ? `after "${anchorName}"`
          : 'at the start of the function block';

        const sourceCode = context.getSourceCode();
        const functionStatements = new Set(
          functions.map((fn) => fn.statementNode),
        );
        const sourceOrderedInfos = functions
          .slice()
          .sort((a, b) => a.originalIndex - b.originalIndex);
        const consumedComments = new Set<TSESTree.Comment>();
        const statementRanges = new Map<
          FunctionStatementNode,
          [number, number]
        >();
        sourceOrderedInfos.forEach((info, idx) => {
          const nextInfo = sourceOrderedInfos[idx + 1];
          const [rangeStart, rangeEnd] = getStatementRangeWithComments(
            info.statementNode,
            sourceCode,
            consumedComments,
            nextInfo?.statementNode,
          );
          statementRanges.set(info.statementNode, [rangeStart, rangeEnd]);
        });
        const firstFunctionIndex = node.body.findIndex((statement) =>
          functionStatements.has(statement as FunctionStatementNode),
        );
        const lastFunctionIndex =
          node.body.length -
          1 -
          [...node.body]
            .reverse()
            .findIndex((statement) =>
              functionStatements.has(statement as FunctionStatementNode),
            );

        context.report({
          node: misplacedInfo.statementNode,
          messageId: 'misorderedFunction',
          data: {
            name: misplacedInfo.name,
            reason: reasons,
            placement,
          },
          fix(fixer) {
            if (
              firstFunctionIndex === -1 ||
              lastFunctionIndex === -1 ||
              firstFunctionIndex > lastFunctionIndex
            ) {
              return null;
            }

            const slice = node.body.slice(
              firstFunctionIndex,
              lastFunctionIndex + 1,
            );
            const blockContainsOnlyFunctions = slice.every((statement) =>
              functionStatements.has(statement as FunctionStatementNode),
            );

            if (!blockContainsOnlyFunctions) {
              return null;
            }

            const [start] =
              statementRanges.get(
                node.body[firstFunctionIndex] as FunctionStatementNode,
              ) ||
              getStatementRangeWithComments(
                node.body[firstFunctionIndex] as FunctionStatementNode,
                sourceCode,
              );
            const [, end] =
              statementRanges.get(
                node.body[lastFunctionIndex] as FunctionStatementNode,
              ) ||
              getStatementRangeWithComments(
                node.body[lastFunctionIndex] as FunctionStatementNode,
                sourceCode,
              );

            const textParts = expectedOrderInfos.map((fn) => {
              const [fnStart, fnEnd] =
                statementRanges.get(fn.statementNode) ||
                getStatementRangeWithComments(fn.statementNode, sourceCode);
              return sourceCode.text.slice(fnStart, fnEnd);
            });

            return fixer.replaceTextRange([start, end], textParts.join('\n\n'));
          },
        });

      },
    };
  },
});
