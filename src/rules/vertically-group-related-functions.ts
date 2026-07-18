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
const BROAD_QUANTIFIER_WITH_BACKREFERENCE_PATTERN = /(?:\.\*|\.\+)[^)]*\\\d/;
const REPEATED_BROAD_QUANTIFIER_PATTERN = /(?:\.\*|\.\+).*(?:\.\*|\.\+)/;

function isPatternLikelySafe(pattern: string): {
  safe: boolean;
  reason?: string;
} {
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
      reason:
        'multiple greedy wildcards in one pattern create heavy backtracking',
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
      const name = (statement.declaration as TSESTree.FunctionDeclaration).id!
        .name;
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
  groupOrder: GroupName[],
): string[] {
  const dependencyMap = new Map<string, string[]>();
  const originalIndexMap = new Map(
    functions.map((fn) => [fn.name, fn.originalIndex] as const),
  );
  const groupRankMap = new Map(
    functions.map(
      (fn) => [fn.name, groupOrder.indexOf(classifyGroup(fn))] as const,
    ),
  );

  functions.forEach((fn) => {
    dependencyMap.set(fn.name, fn.dependencies);
  });

  // Tiebreak among functions the call graph does NOT order relative to each
  // other (independent roots, sibling callees, cycle members): configured
  // group order first, then original source position. Both keys are intrinsic
  // to the function rather than its current arrangement, so the traversal is a
  // fixed point once reached — obeying a move never spawns a contradicting one.
  const tiebreak = (a: string, b: string) =>
    (groupRankMap.get(a) ?? 0) - (groupRankMap.get(b) ?? 0) ||
    (originalIndexMap.get(a) ?? 0) - (originalIndexMap.get(b) ?? 0);

  const visited = new Set<string>();
  const order: string[] = [];
  const namesInTiebreakOrder = functions.map((fn) => fn.name).sort(tiebreak);

  const incomingCount = new Map<string, number>();
  functions.forEach((fn) => {
    if (!incomingCount.has(fn.name)) {
      incomingCount.set(fn.name, 0);
    }
    fn.dependencies.forEach((dep) => {
      incomingCount.set(dep, (incomingCount.get(dep) || 0) + 1);
    });
  });

  const roots = namesInTiebreakOrder.filter(
    (name) => (incomingCount.get(name) || 0) === 0,
  );

  // Remaining unemitted callers per function, seeded from incomingCount. Used
  // (callers-first only) to defer a shared callee until every caller that
  // reaches it has been emitted, so the shared primitive lands below all of its
  // callers rather than being greedily inlined beneath whichever caller the DFS
  // reaches first — which would place its other callers below their own helper.
  const remainingCallers = new Map(incomingCount);

  const visit = (name: string) => {
    if (visited.has(name)) {
      return;
    }
    visited.add(name);
    const deps = dependencyMap.get(name)?.slice().sort(tiebreak) || [];
    if (direction === 'callees-first') {
      deps.forEach(visit);
      order.push(name);
    } else {
      order.push(name);
      for (const dep of deps) {
        const remaining = (remainingCallers.get(dep) ?? 0) - 1;
        remainingCallers.set(dep, remaining);
        // Descend into the callee only once its last caller has been emitted.
        // A shared callee is deferred here and picked up when the caller that
        // drives its counter to zero recurses into it. If a callee is never
        // driven to zero (e.g. a dependency cycle), the top-level sweep below
        // still visits it, so no function is dropped from the order.
        if (remaining <= 0) {
          visit(dep);
        }
      }
    }
  };

  // Depth-first from roots keeps each caller immediately above its own helper
  // subtree (callers-first) — grouping call chains vertically. The call graph
  // is primary; group order only breaks ties the graph leaves open.
  [...roots, ...namesInTiebreakOrder].forEach(visit);

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
    groupOrder,
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

  // Export placement is the only concern allowed to outrank the call graph.
  // The dependency sequence already folds group order in as a tiebreak, so a
  // caller is never sorted below the helpers it invokes on account of its verb
  // prefix — the defect that produced self-contradicting move instructions.
  return functions.slice().sort((a, b) => {
    return (
      exportRank(a) - exportRank(b) ||
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
  nextStatement?: TSESTree.Node,
): [number, number] {
  const filterComments = (comments: TSESTree.Comment[]) =>
    (comments || []).filter(
      (comment) => !consumedComments || !consumedComments.has(comment),
    );

  // A comment sharing a line with the code token immediately before it is a
  // trailing comment of that preceding statement (e.g. `const x = 2; // note`),
  // not a leading comment of the node beneath it. Attributing it to the node
  // below would drag an interleaved statement's own end-of-line comment along
  // when the following function is relocated. Only own-line comments count as
  // leading comments.
  const leadingCommentsOf = (target: TSESTree.Node) =>
    filterComments(sourceCode.getCommentsBefore(target) || []).filter(
      (comment) => {
        const tokenBefore = sourceCode.getTokenBefore(comment);
        return (
          !tokenBefore || tokenBefore.loc.end.line !== comment.loc.start.line
        );
      },
    );

  const commentsBefore = leadingCommentsOf(statement);
  const nextLeadingComments = nextStatement
    ? new Set(leadingCommentsOf(nextStatement))
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

// Collect every identifier a statement references anywhere in its subtree,
// including type-annotation positions (e.g. `WidgetProps` inside
// `FC<WidgetProps>`) and default-parameter values (e.g. `DEFAULT_LABEL` in
// `{ label = DEFAULT_LABEL }`). Identifiers that are member-access properties or
// object/type member keys are skipped: `obj.OFFSET` is not a reference to a
// top-level `OFFSET` binding, so counting it would spuriously constrain the
// reorder.
function collectReferencedNames(node: TSESTree.Node): Set<string> {
  const names = new Set<string>();

  const visit = (
    current: TSESTree.Node | null | undefined,
    parent: TSESTree.Node | null,
  ) => {
    if (!current || !ASTHelpers.isNode(current)) {
      return;
    }

    if (current.type === 'Identifier') {
      const isMemberProperty =
        parent?.type === 'MemberExpression' &&
        parent.property === current &&
        !parent.computed;
      const isObjectKey =
        parent?.type === 'Property' &&
        parent.key === current &&
        !parent.computed;
      const isMemberKey =
        (parent?.type === 'TSPropertySignature' ||
          parent?.type === 'TSMethodSignature') &&
        parent.key === current &&
        !parent.computed;
      if (!isMemberProperty && !isObjectKey && !isMemberKey) {
        names.add(current.name);
      }
    }

    Object.values(current).forEach((value) => {
      if (!value || value === current || (current as any).parent === value) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((child) => {
          if (ASTHelpers.isNode(child)) {
            visit(child, current);
          }
        });
      } else if (ASTHelpers.isNode(value)) {
        visit(value, current);
      }
    });
  };

  visit(node, null);

  return names;
}

// Names bound by an interleaved VALUE declaration (const/let/var) — but not by a
// reorderable function. Hoisting a function above a value binding it references
// is a genuine runtime declare-before-use. Type aliases are tracked separately
// (interleavedTypeAliasNamesOf), because their hoist hazard is not runtime — it
// is the companion prefer-type-alias-over-typeof-constant rule, which fires only
// for a const declarator whose own type annotation names a later alias.
function interleavedValueNamesOf(
  regionStatements: TSESTree.Statement[],
  functionStatements: Set<FunctionStatementNode>,
): Set<string> {
  const names = new Set<string>();
  regionStatements.forEach((statement) => {
    if (functionStatements.has(statement as FunctionStatementNode)) {
      return;
    }
    if (statement.type === 'VariableDeclaration') {
      statement.declarations.forEach((declarator) => {
        if (declarator.id.type === 'Identifier') {
          names.add(declarator.id.name);
        }
      });
    }
  });
  return names;
}

// Names bound by an interleaved `type` alias in the reordered region.
function interleavedTypeAliasNamesOf(
  regionStatements: TSESTree.Statement[],
  functionStatements: Set<FunctionStatementNode>,
): Set<string> {
  const names = new Set<string>();
  regionStatements.forEach((statement) => {
    if (functionStatements.has(statement as FunctionStatementNode)) {
      return;
    }
    if (statement.type === 'TSTypeAliasDeclaration') {
      names.add(statement.id.name);
    } else if (
      statement.type === 'ExportNamedDeclaration' &&
      statement.declaration?.type === 'TSTypeAliasDeclaration'
    ) {
      names.add(statement.declaration.id.name);
    }
  });
  return names;
}

// Type names referenced in the annotation of a function-holding const's own
// binding identifier (e.g. `WidgetProps` in `const W: FC<WidgetProps> = ...`).
// This mirrors exactly what prefer-type-alias-over-typeof-constant's
// defineTypeBeforeConstant keys on: only a const declarator's `id` annotation.
// A function *declaration*'s return type (`function f(): Marker`) and an arrow
// parameter's annotation (`const f = (p: Props) => ...`) are deliberately NOT
// counted — neither trips the companion rule, so constraining them would decline
// safe reorders.
function constAnnotationTypeNamesOf(
  statementNode: FunctionStatementNode,
): Set<string> {
  const names = new Set<string>();
  const declaration =
    statementNode.type === 'ExportNamedDeclaration'
      ? statementNode.declaration
      : statementNode;
  if (declaration?.type === 'VariableDeclaration') {
    declaration.declarations.forEach((declarator) => {
      if (declarator.id.type === 'Identifier' && declarator.id.typeAnnotation) {
        collectReferencedNames(declarator.id.typeAnnotation).forEach((name) =>
          names.add(name),
        );
      }
    });
  }
  return names;
}

// Decline (return true) any reorder that would place a function ABOVE an
// interleaved declaration it depends on. The fixer pins interleaved statements in
// place and only swaps functions between their own slots, so such a reorder
// produces a fresh declare-before-use — trading one violation for another instead
// of converging. Two hazards are guarded:
//   * value binding (const/let/var): a runtime declare-before-use if a function
//     references it and is hoisted above it.
//   * `type` alias: hoisting a function-holding const whose OWN binding
//     annotation names the alias above that alias trips the companion
//     prefer-type-alias-over-typeof-constant rule (defineTypeBeforeConstant).
// Walks the post-reorder sequence front-to-back: each function slot is filled
// with the next expected function; interleaved statements keep their slot. A
// function that references a not-yet-declared interleaved dependency is being
// hoisted above it.
function reorderHoistsFunctionAboveDependency(
  regionStatements: TSESTree.Statement[],
  functionStatements: Set<FunctionStatementNode>,
  expectedOrderInfos: FunctionInfo[],
): boolean {
  const interleavedValueNames = interleavedValueNamesOf(
    regionStatements,
    functionStatements,
  );
  const interleavedTypeNames = interleavedTypeAliasNamesOf(
    regionStatements,
    functionStatements,
  );
  if (interleavedValueNames.size === 0 && interleavedTypeNames.size === 0) {
    return false;
  }

  const declaredValueNames = new Set<string>();
  const declaredTypeNames = new Set<string>();
  let slotCursor = 0;
  for (const statement of regionStatements) {
    if (functionStatements.has(statement as FunctionStatementNode)) {
      const occupant = expectedOrderInfos[slotCursor];
      slotCursor += 1;
      if (!occupant) {
        continue;
      }
      if (interleavedValueNames.size > 0) {
        const referenced = collectReferencedNames(occupant.statementNode);
        for (const name of referenced) {
          if (
            interleavedValueNames.has(name) &&
            !declaredValueNames.has(name)
          ) {
            return true;
          }
        }
      }
      if (interleavedTypeNames.size > 0) {
        const annotationTypes = constAnnotationTypeNamesOf(
          occupant.statementNode,
        );
        for (const name of annotationTypes) {
          if (interleavedTypeNames.has(name) && !declaredTypeNames.has(name)) {
            return true;
          }
        }
      }
    } else if (statement.type === 'VariableDeclaration') {
      statement.declarations.forEach((declarator) => {
        if (declarator.id.type === 'Identifier') {
          declaredValueNames.add(declarator.id.name);
        }
      });
    } else if (statement.type === 'TSTypeAliasDeclaration') {
      declaredTypeNames.add(statement.id.name);
    } else if (
      statement.type === 'ExportNamedDeclaration' &&
      statement.declaration?.type === 'TSTypeAliasDeclaration'
    ) {
      declaredTypeNames.add(statement.declaration.id.name);
    }
  }

  return false;
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
        ? (value, reason) =>
            warnUnsafePattern('eventHandlerPattern', value, reason)
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
        // Group order only settles ties the call graph leaves open, so cite it
        // as a reason only when this function has no helpers of its own — never
        // paired with "callers should sit above the helpers they invoke".
        const groupReason =
          misplacedInfo.dependencies.length === 0 &&
          groupOrder.indexOf(group) > 0
            ? `${group.replace(
                '-',
                ' ',
              )} should follow the configured group order`
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
        sourceOrderedInfos.forEach((info) => {
          // Bound each function's trailing comments by the statement that
          // physically follows it in the block — which may be an interleaved
          // non-function statement, not the next function — so an interleaved
          // statement's own leading comment is never swallowed into the
          // function above it.
          const bodyIndex = node.body.indexOf(
            info.statementNode as TSESTree.Statement,
          );
          const nextStatement =
            bodyIndex >= 0 ? node.body[bodyIndex + 1] : undefined;
          const [rangeStart, rangeEnd] = getStatementRangeWithComments(
            info.statementNode,
            sourceCode,
            consumedComments,
            nextStatement,
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

            // Decline a reorder that would hoist a function above an interleaved
            // declaration it depends on (a value binding it references, or the
            // `type` alias named in its own const annotation). Applies to both
            // paths, though it can only trigger in the interleaved-statement
            // branch below (Path A reorders a block with no interleaved
            // declarations). The misorderedFunction report still fires; only the
            // harmful, non-converging autofix is suppressed.
            if (
              reorderHoistsFunctionAboveDependency(
                slice as TSESTree.Statement[],
                functionStatements,
                expectedOrderInfos,
              )
            ) {
              return null;
            }

            if (!blockContainsOnlyFunctions) {
              // Real modules interleave type aliases, consts, and top-level
              // calls (e.g. `void autoRunIfMain();`) between functions. Rather
              // than bail, reorder only the function statements among their own
              // slots, leaving every other statement exactly where it is. Both
              // the destination slot and the source text use the same
              // comment-inclusive ranges Path A relies on, so each function's
              // leading JSDoc travels with it instead of being left orphaned in
              // its old slot. The precomputed `statementRanges` already exclude
              // each interleaved statement's own leading comments (they are
              // treated as the next function's leading comments), so the widened
              // edits stay disjoint from one another and from the interleaved
              // statements — no comment-span overlap.
              return sourceOrderedInfos.map((info, idx) => {
                const target = expectedOrderInfos[idx];
                const destRange =
                  statementRanges.get(info.statementNode) ||
                  getStatementRangeWithComments(info.statementNode, sourceCode);
                const [targetStart, targetEnd] =
                  statementRanges.get(target.statementNode) ||
                  getStatementRangeWithComments(
                    target.statementNode,
                    sourceCode,
                  );
                return fixer.replaceTextRange(
                  destRange,
                  sourceCode.text.slice(targetStart, targetEnd),
                );
              });
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
