/**
 * @fileoverview Enforce the use of event.params over .ref.parent.id in Firebase change handlers
 * @author BluMint
 */

import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import { planOrphanedBindingRemoval, TextRange } from '../utils/importRemoval';
import { planPatternBindingRemoval } from '../utils/patternBindingRemoval';

type MessageIds = 'preferParams';

/** A reported `ref.parent...id` read, held until `Program:exit`. */
type Violation = {
  node: TSESTree.MemberExpression;
  paramName: string;
  /** `null` when the trigger's params are not reachable from the read. */
  replacement: string | null;
};

/** A violation whose rewrite ships, with the text it rewrites to. */
type PlannedRewrite = { violation: Violation; replacement: string };

function rangesOverlap(
  a: readonly [number, number],
  b: readonly [number, number],
): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

const HANDLER_TYPES = new Set([
  'DocumentChangeHandler',
  'DocumentChangeHandlerTransaction',
  'RealtimeDbChangeHandler',
  'RealtimeDbChangeHandlerTransaction',
]);

const getQualifiedNameIdentifier = (
  typeName: TSESTree.EntityName,
): string | null => {
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return typeName.name;
  }
  if (
    typeName.type === AST_NODE_TYPES.TSQualifiedName &&
    typeName.right.type === AST_NODE_TYPES.Identifier
  ) {
    return typeName.right.name;
  }
  return null;
};

const checkTypeAnnotationForHandler = (
  typeNode: TSESTree.TypeNode,
): boolean => {
  switch (typeNode.type) {
    case AST_NODE_TYPES.TSTypeReference: {
      const typeIdentifier = getQualifiedNameIdentifier(typeNode.typeName);
      return typeIdentifier ? HANDLER_TYPES.has(typeIdentifier) : false;
    }
    case AST_NODE_TYPES.TSUnionType:
      return typeNode.types.some(checkTypeAnnotationForHandler);
    case AST_NODE_TYPES.TSIntersectionType:
      return typeNode.types.some(checkTypeAnnotationForHandler);
    default:
      return false;
  }
};

const findTypeAnnotationInContext = (
  node: TSESTree.Node,
): TSESTree.TSTypeAnnotation | undefined => {
  if (
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier &&
    node.parent.id.typeAnnotation
  ) {
    return node.parent.id.typeAnnotation;
  }

  if (
    node.parent?.type === AST_NODE_TYPES.AssignmentExpression &&
    node.parent.left.type === AST_NODE_TYPES.Identifier &&
    node.parent.left.typeAnnotation
  ) {
    return node.parent.left.typeAnnotation;
  }

  if (
    node.parent?.type === AST_NODE_TYPES.Property &&
    node.parent.value === node
  ) {
    let current = node.parent.parent;
    while (current) {
      if (
        current.type === AST_NODE_TYPES.VariableDeclarator &&
        current.id.type === AST_NODE_TYPES.Identifier &&
        current.id.typeAnnotation
      ) {
        return current.id.typeAnnotation;
      }
      current = current.parent;
    }
  }

  return undefined;
};

const isFirebaseChangeHandler = (node: TSESTree.Node): boolean => {
  if (
    node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    node.type !== AST_NODE_TYPES.FunctionExpression &&
    node.type !== AST_NODE_TYPES.FunctionDeclaration
  ) {
    return false;
  }

  const typeAnnotation = findTypeAnnotationInContext(node);
  if (!typeAnnotation) {
    return false;
  }

  return checkTypeAnnotationForHandler(typeAnnotation.typeAnnotation);
};

const isParentIdAccess = (
  node: TSESTree.MemberExpression,
): {
  isMatch: boolean;
  depth: number;
} => {
  if (
    node.property.type !== AST_NODE_TYPES.Identifier ||
    node.property.name !== 'id'
  ) {
    return { isMatch: false, depth: 0 };
  }

  const chain: string[] = [];
  let current = node.object;

  while (current && current.type === AST_NODE_TYPES.MemberExpression) {
    if (current.property.type !== AST_NODE_TYPES.Identifier) {
      return { isMatch: false, depth: 0 };
    }
    chain.unshift(current.property.name);
    current = current.object;
  }

  if (chain.length < 2) {
    return { isMatch: false, depth: 0 };
  }

  const refIndex = chain.lastIndexOf('ref');
  if (refIndex === -1) {
    return { isMatch: false, depth: 0 };
  }

  const parentSegment = chain.slice(refIndex + 1);
  if (parentSegment.length === 0) {
    return { isMatch: false, depth: 0 };
  }

  const invalidParent = parentSegment.some((segment) => segment !== 'parent');
  if (invalidParent) {
    return { isMatch: false, depth: 0 };
  }

  const depth = parentSegment.length;
  return { isMatch: depth > 0, depth };
};

const getParentParamName = (depth: number) => {
  if (depth === 1) {
    return 'userId';
  }
  if (depth === 2) {
    return 'parentId';
  }
  return `parent${depth}Id`;
};

const findHandlerFunction = (
  node: TSESTree.Node,
  handlerNodes: Set<TSESTree.Node>,
): TSESTree.Node | null => {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (handlerNodes.has(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
};

const hasOptionalChaining = (node: TSESTree.MemberExpression): boolean => {
  let current: TSESTree.Node = node;
  while (current && current.type === AST_NODE_TYPES.MemberExpression) {
    if (current.optional) {
      return true;
    }
    current = current.object;
  }
  return false;
};

interface ParamsInScope {
  identifier?: string;
  properties?: Map<string, string>;
}

const findParamsInPattern = (
  pattern: TSESTree.ObjectPattern,
): ParamsInScope | null => {
  for (const prop of pattern.properties) {
    if (
      prop.type === AST_NODE_TYPES.Property &&
      prop.key.type === AST_NODE_TYPES.Identifier &&
      prop.key.name === 'params'
    ) {
      if (prop.value.type === AST_NODE_TYPES.Identifier) {
        return { identifier: prop.value.name };
      }
      if (prop.value.type === AST_NODE_TYPES.ObjectPattern) {
        const properties = new Map<string, string>();
        for (const p of prop.value.properties) {
          if (
            p.type === AST_NODE_TYPES.Property &&
            p.key.type === AST_NODE_TYPES.Identifier &&
            p.value.type === AST_NODE_TYPES.Identifier
          ) {
            properties.set(p.key.name, p.value.name);
          }
        }
        return { properties };
      }
    }
  }
  return null;
};

const getParamsInScope = (handlerNode: TSESTree.Node): ParamsInScope | null => {
  if (
    handlerNode.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    handlerNode.type !== AST_NODE_TYPES.FunctionExpression &&
    handlerNode.type !== AST_NODE_TYPES.FunctionDeclaration
  ) {
    return null;
  }

  const firstParam = handlerNode.params[0];
  if (!firstParam) {
    return null;
  }

  if (firstParam.type === AST_NODE_TYPES.ObjectPattern) {
    const paramsInScope = findParamsInPattern(firstParam);
    if (paramsInScope) {
      return paramsInScope;
    }
  }

  if (
    handlerNode.body &&
    handlerNode.body.type === AST_NODE_TYPES.BlockStatement
  ) {
    const eventParamName =
      firstParam.type === AST_NODE_TYPES.Identifier ? firstParam.name : 'event';
    for (const statement of handlerNode.body.body) {
      if (statement.type !== AST_NODE_TYPES.VariableDeclaration) {
        continue;
      }
      for (const declarator of statement.declarations) {
        if (
          declarator.id.type !== AST_NODE_TYPES.ObjectPattern ||
          !declarator.init ||
          declarator.init.type !== AST_NODE_TYPES.Identifier ||
          declarator.init.name !== eventParamName
        ) {
          continue;
        }
        const paramsInScope = findParamsInPattern(declarator.id);
        if (paramsInScope) {
          return paramsInScope;
        }
      }
    }
  }

  return null;
};

export const preferParamsOverParentId = createRule<[], MessageIds>({
  name: 'prefer-params-over-parent-id',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer event.params over ref.parent.id for type-safe Firebase trigger paths.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferParams: [
        "What's wrong: This code reads an ID via `ref.parent...id` instead of using the trigger's params.",
        '',
        'Why it matters: Walking `ref.parent` ties the handler to the current path depth; when collections change, it can yield the wrong ID (or a collection name) and bypasses the typed params the trigger provides.',
        '',
        'How to fix: Read the ID from `params.{{paramName}}` (or destructure `const { params } = event` and then access `params.{{paramName}}`).',
      ].join('\n'),
    },
  },
  defaultOptions: [],
  create(context) {
    const handlerNodes = new Set<TSESTree.Node>();
    const sourceCode = context.getSourceCode();

    /**
     * Every `ref.parent...id` read the rule reports, in traversal order.
     *
     * Reporting waits for `Program:exit` because the binding the read walks from
     * — `change` in `const { data: change, params } = event` — is left
     * unreferenced only once NO surviving read mentions it. Judged one read at a
     * time, a handler with two of them never sees either as the binding's last
     * use, and the pass that rewrites both resolves every report, so nothing
     * revisits the stranded binding.
     */
    const violations: Violation[] = [];

    /**
     * A suppressed report is discarded together with its fix, so its rewrite
     * never happens: counting it toward the batch would retire a property the
     * surviving text still reads.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * The bindings a rewrite strands are destructuring properties rather than
     * imports, so the import machinery is handed the pattern planner to unbind
     * them with.
     */
    const planRemoval = (removed: readonly TextRange[]) =>
      planOrphanedBindingRemoval(sourceCode, removed, (variables, ranges) =>
        planPatternBindingRemoval(sourceCode, variables, ranges),
      );

    /**
     * The rewrites that ship, in traversal order.
     *
     * Each is screened alone before joining the batch: a rewrite whose own
     * deletion strands something that cannot be unbound safely would otherwise
     * withhold every other rewrite in the file. Overlapping edits are dropped
     * because ESLint discards every message for a file whose fixes collide.
     */
    function planViolations(): PlannedRewrite[] {
      const planned: PlannedRewrite[] = [];
      const claimed: TSESTree.Range[] = [];

      for (const violation of violations) {
        const { replacement } = violation;
        if (!replacement) continue;
        if (isReportSuppressed(violation.node)) continue;
        if (planRemoval([violation.node.range]) === null) continue;
        if (
          claimed.some((taken) => rangesOverlap(violation.node.range, taken))
        ) {
          continue;
        }
        claimed.push(violation.node.range);
        planned.push({ violation, replacement });
      }

      return planned;
    }

    return {
      // Track Firebase change handler functions
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(
        node:
          | TSESTree.FunctionDeclaration
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression,
      ): void {
        if (isFirebaseChangeHandler(node)) {
          handlerNodes.add(node);
        }
      },

      // Detect .ref.parent.id patterns
      MemberExpression(node: TSESTree.MemberExpression): void {
        const parentAccess = isParentIdAccess(node);
        if (!parentAccess.isMatch) {
          return;
        }

        const handlerNode = findHandlerFunction(node, handlerNodes);
        if (!handlerNode) {
          return;
        }

        const paramName = getParentParamName(parentAccess.depth);
        const paramsInScope = getParamsInScope(handlerNode);

        if (!paramsInScope) {
          violations.push({ node, paramName, replacement: null });
          return;
        }

        const hasOptional = hasOptionalChaining(node);
        let replacement: string | null = null;

        if (paramsInScope.identifier) {
          replacement = hasOptional
            ? `${paramsInScope.identifier}?.${paramName}`
            : `${paramsInScope.identifier}.${paramName}`;
        } else if (paramsInScope.properties) {
          replacement = paramsInScope.properties.get(paramName) ?? null;
        }

        violations.push({ node, paramName, replacement });
      },

      'Program:exit'(): void {
        if (violations.length === 0) {
          return;
        }

        const planned = planViolations();
        // One plan over every surviving rewrite: a binding read by two of them
        // is unreferenced only under their union, and the pass that applies
        // them all resolves every report — so this is the only moment the
        // stranded binding is visible.
        const removal =
          planned.length > 0
            ? planRemoval(planned.map((entry) => entry.violation.node.range))
            : null;

        // ESLint throws out every message for a file whose fix ranges overlap,
        // so a plan that collides with the rewrites it was computed for is
        // withheld rather than allowed to take the pass down with it.
        const collides = removal?.some((range) =>
          planned.some((entry) =>
            rangesOverlap(entry.violation.node.range, [range[0], range[1]]),
          ),
        );
        const removalRanges = removal && !collides ? removal : null;

        // The whole batch ships as one fix, so no rewrite lands without the
        // others its binding's orphanhood was judged against, and no unbinding
        // lands without the rewrites it was claimed on. The remaining
        // violations report without a fixer; the carrier's pass resolves them.
        //
        // No plan at all means some binding would be left unreferenced yet
        // cannot be unbound safely, so every rewrite stays behind: an unfixed
        // report is the lesser damage.
        const carrier = removalRanges ? planned[0] : undefined;

        for (const violation of violations) {
          context.report({
            node: violation.node,
            messageId: 'preferParams',
            data: {
              paramName: violation.paramName,
            },
            fix:
              violation === carrier?.violation
                ? (fixer: TSESLint.RuleFixer) => [
                    ...(removalRanges ?? []).map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    ),
                    ...planned.map((entry) =>
                      fixer.replaceText(
                        entry.violation.node,
                        entry.replacement,
                      ),
                    ),
                  ]
                : undefined,
          });
        }
      },
    };
  },
});
