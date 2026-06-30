import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'parallelizeLoopAwaits';
type Options = [
  {
    coordinatorPatterns?: string[];
    rateLimitedPatterns?: string[];
  },
];

const DEFAULT_COORDINATOR_PATTERNS = [
  'batchManager',
  'batch',
  'transaction',
  'collector',
  'accumulator',
  'aggregator',
  'mutex',
  'lock',
];

const DEFAULT_RATE_LIMITED_PATTERNS = [
  'sleep',
  'delay',
  'throttle',
  'rateLimit',
];

const defaultOptions: Options = [
  {
    coordinatorPatterns: DEFAULT_COORDINATOR_PATTERNS,
    rateLimitedPatterns: DEFAULT_RATE_LIMITED_PATTERNS,
  },
];

type LoopNode =
  | TSESTree.ForOfStatement
  | TSESTree.ForInStatement
  | TSESTree.ForStatement
  | TSESTree.WhileStatement;

export const parallelizeLoopAwaits = createRule<Options, MessageIds>({
  name: 'parallelize-loop-awaits',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow sequential await expressions inside loops when iterations could be parallelized with Promise.all(items.map(...))',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          coordinatorPatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_COORDINATOR_PATTERNS,
          },
          rateLimitedPatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_RATE_LIMITED_PATTERNS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      parallelizeLoopAwaits:
        'Sequential await in loop can likely be parallelized using Promise.all(items.map(...)). If sequential execution is intentional, add an `// eslint-disable-next-line @blumintinc/blumint/parallelize-loop-awaits -- <reason>` comment explaining why.',
    },
  },
  defaultOptions,
  create(context, [options]) {
    const coordinatorPatterns =
      options?.coordinatorPatterns ?? DEFAULT_COORDINATOR_PATTERNS;
    const rateLimitedPatterns =
      options?.rateLimitedPatterns ?? DEFAULT_RATE_LIMITED_PATTERNS;

    /**
     * Tests whether an identifier name matches a coordinator/rate-limit pattern.
     * Uses camelCase-aware matching: the identifier equals the pattern, starts
     * with it, or ends with it (all case-insensitive). This avoids false
     * positives from substring coincidences like "nonBatchMethod" matching "batch".
     */
    function matchesPattern(identifierName: string, pattern: string): boolean {
      const lower = identifierName.toLowerCase();
      const pat = pattern.toLowerCase();
      return lower === pat || lower.startsWith(pat) || lower.endsWith(pat);
    }

    /**
     * Recursively collects all identifier names referenced in a node.
     * Does not cross nested function boundaries.
     */
    function collectIdentifiers(
      node: TSESTree.Node,
      names: Set<string>,
      stopAtFunctions = false,
    ): void {
      if (stopAtFunctions && node.type !== node.type) return; // no-op placeholder

      if (node.type === AST_NODE_TYPES.Identifier) {
        names.add(node.name);
        return;
      }

      // Do not descend into nested functions when stopAtFunctions is set
      if (
        stopAtFunctions &&
        (node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression)
      ) {
        return;
      }

      for (const key in node) {
        if (
          key === 'parent' ||
          key === 'range' ||
          key === 'loc' ||
          key === 'type'
        )
          continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                collectIdentifiers(
                  item as TSESTree.Node,
                  names,
                  stopAtFunctions,
                );
              }
            }
          } else if ('type' in (child as object)) {
            collectIdentifiers(child as TSESTree.Node, names, stopAtFunctions);
          }
        }
      }
    }

    /**
     * Returns the function call name(s) from an await expression, used to
     * check for rate-limiting function calls like `await sleep(1000)`.
     */
    function getCallNames(awaitExpr: TSESTree.AwaitExpression): string[] {
      const names: string[] = [];
      const { argument } = awaitExpr;

      let callExpr: TSESTree.CallExpression | null = null;
      if (argument.type === AST_NODE_TYPES.CallExpression) {
        callExpr = argument;
      } else if (
        argument.type === AST_NODE_TYPES.ChainExpression &&
        argument.expression.type === AST_NODE_TYPES.CallExpression
      ) {
        callExpr = argument.expression;
      }

      if (!callExpr) return names;

      const { callee } = callExpr;
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        names.push(callee.property.name);
      } else if (callee.type === AST_NODE_TYPES.Identifier) {
        names.push(callee.name);
      }

      return names;
    }

    /**
     * Determines whether a node (a loop body) directly contains a break,
     * continue, or return statement that is NOT inside a nested function.
     * These statements indicate the loop's control flow depends on the async
     * result and cannot be safely parallelized.
     */
    function containsBreakContinueReturn(node: TSESTree.Node): boolean {
      if (
        node.type === AST_NODE_TYPES.BreakStatement ||
        node.type === AST_NODE_TYPES.ContinueStatement ||
        node.type === AST_NODE_TYPES.ReturnStatement
      ) {
        return true;
      }

      // Don't descend into nested functions — their control flow is separate
      if (
        node.type === AST_NODE_TYPES.FunctionDeclaration ||
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression
      ) {
        return false;
      }

      for (const key in node) {
        if (
          key === 'parent' ||
          key === 'range' ||
          key === 'loc' ||
          key === 'type'
        )
          continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                if (containsBreakContinueReturn(item as TSESTree.Node))
                  return true;
              }
            }
          } else if ('type' in (child as object)) {
            if (containsBreakContinueReturn(child as TSESTree.Node))
              return true;
          }
        }
      }

      return false;
    }

    /**
     * Returns true when the await expression is directly wrapped in a try
     * block within the same loop body. This indicates per-iteration error
     * handling is in use, where sequential semantics are intentional.
     */
    function isAwaitInTryCatch(
      awaitNode: TSESTree.AwaitExpression,
      loopNode: LoopNode,
    ): boolean {
      let current: TSESTree.Node | undefined =
        awaitNode.parent as TSESTree.Node;
      while (current && current !== loopNode) {
        if (current.type === AST_NODE_TYPES.TryStatement) {
          return true;
        }
        current = current.parent as TSESTree.Node;
      }
      return false;
    }

    /**
     * Checks whether any identifier used in the loop body matches any of the
     * coordinator patterns (using camelCase-aware matching), indicating shared
     * mutable state that requires sequential execution (e.g. BatchManager,
     * Firestore Transaction).
     */
    function hasCoordinatorInBody(body: TSESTree.Node): boolean {
      const ids = new Set<string>();
      collectIdentifiers(body, ids, true);
      for (const id of ids) {
        for (const pattern of coordinatorPatterns) {
          if (matchesPattern(id, pattern)) {
            return true;
          }
        }
      }
      return false;
    }

    /**
     * Checks whether the loop body contains a call to a rate-limiting
     * function (e.g. sleep, delay, throttle). When present, sequential
     * execution is almost certainly intentional.
     *
     * Uses exact case-insensitive matching (not substring) to avoid
     * false positives.
     */
    function hasRateLimitedCallInBody(body: TSESTree.Node): boolean {
      const ids = new Set<string>();
      collectIdentifiers(body, ids, true);
      for (const id of ids) {
        for (const pattern of rateLimitedPatterns) {
          if (id.toLowerCase() === pattern.toLowerCase()) {
            return true;
          }
        }
      }
      return false;
    }

    /**
     * Collects all variables declared INSIDE the loop body (at the direct
     * body scope, not crossing nested function boundaries). These are
     * iteration-local variables.
     */
    function collectLoopLocalVars(body: TSESTree.Node): Set<string> {
      const localVars = new Set<string>();

      function visit(node: TSESTree.Node, isRoot: boolean): void {
        if (
          !isRoot &&
          (node.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.type === AST_NODE_TYPES.FunctionExpression ||
            node.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          return;
        }

        if (node.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declarator of node.declarations) {
            collectBindingNames(declarator.id, localVars);
          }
        }

        for (const key in node) {
          if (
            key === 'parent' ||
            key === 'range' ||
            key === 'loc' ||
            key === 'type'
          )
            continue;
          const child = (node as unknown as Record<string, unknown>)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === 'object' && 'type' in item) {
                  visit(item as TSESTree.Node, false);
                }
              }
            } else if ('type' in (child as object)) {
              visit(child as TSESTree.Node, false);
            }
          }
        }
      }

      visit(body, true);
      return localVars;
    }

    /**
     * Detects cross-iteration state patterns that require sequential
     * execution:
     *
     * 1. Accumulator: a variable declared OUTSIDE the loop body (i.e., not
     *    in localVars) is ASSIGNED inside the loop body. Examples: `total +=
     *    value`, `cursor = page.nextCursor`, `previousResult = result`. This
     *    catches running totals, pagination cursors, and chained results.
     *
     * 2. Direct cross-await dependency: a variable declared by an await
     *    inside the loop is then read as an argument to another await in the
     *    same loop body. Example: `const a = await f(); const b = await g(a);`.
     */
    function hasSequentialDependency(
      body: TSESTree.Node,
      loopLocalVars: Set<string>,
    ): boolean {
      // Pattern 1: outer variable is written inside the loop body.
      // Collect all assignment targets (left-hand sides of assignments and
      // compound assignments) in the loop body.
      let foundOuterWrite = false;

      function findOuterWrites(node: TSESTree.Node, isRoot: boolean): void {
        if (foundOuterWrite) return;

        if (
          !isRoot &&
          (node.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.type === AST_NODE_TYPES.FunctionExpression ||
            node.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          return;
        }

        if (node.type === AST_NODE_TYPES.AssignmentExpression) {
          // Collect identifiers on the left-hand side
          const lhsIds = new Set<string>();
          collectIdentifiers(node.left, lhsIds, false);
          for (const id of lhsIds) {
            if (!loopLocalVars.has(id)) {
              foundOuterWrite = true;
              return;
            }
          }
        }

        for (const key in node) {
          if (
            key === 'parent' ||
            key === 'range' ||
            key === 'loc' ||
            key === 'type'
          )
            continue;
          const child = (node as unknown as Record<string, unknown>)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === 'object' && 'type' in item) {
                  findOuterWrites(item as TSESTree.Node, false);
                }
              }
            } else if ('type' in (child as object)) {
              findOuterWrites(child as TSESTree.Node, false);
            }
          }
        }
      }

      findOuterWrites(body, true);
      if (foundOuterWrite) return true;

      // Pattern 2: a variable declared by an await is used as arg to another await.
      const awaitDeclaredVars = new Set<string>();

      function collectAwaitDeclVars(
        node: TSESTree.Node,
        isRoot: boolean,
      ): void {
        if (
          !isRoot &&
          (node.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.type === AST_NODE_TYPES.FunctionExpression ||
            node.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          return;
        }

        if (node.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declarator of node.declarations) {
            if (
              declarator.init &&
              declarator.init.type === AST_NODE_TYPES.AwaitExpression
            ) {
              collectBindingNames(declarator.id, awaitDeclaredVars);
            }
          }
        }

        for (const key in node) {
          if (
            key === 'parent' ||
            key === 'range' ||
            key === 'loc' ||
            key === 'type'
          )
            continue;
          const child = (node as unknown as Record<string, unknown>)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === 'object' && 'type' in item) {
                  collectAwaitDeclVars(item as TSESTree.Node, false);
                }
              }
            } else if ('type' in (child as object)) {
              collectAwaitDeclVars(child as TSESTree.Node, false);
            }
          }
        }
      }

      collectAwaitDeclVars(body, true);

      if (awaitDeclaredVars.size === 0) return false;

      let foundCrossAwaitDep = false;

      function findCrossAwaitDep(node: TSESTree.Node, isRoot: boolean): void {
        if (foundCrossAwaitDep) return;

        if (
          !isRoot &&
          (node.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.type === AST_NODE_TYPES.FunctionExpression ||
            node.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          return;
        }

        if (node.type === AST_NODE_TYPES.AwaitExpression) {
          const argIds = new Set<string>();
          collectIdentifiers(node.argument, argIds, false);
          for (const varName of awaitDeclaredVars) {
            if (argIds.has(varName)) {
              foundCrossAwaitDep = true;
              return;
            }
          }
        }

        for (const key in node) {
          if (
            key === 'parent' ||
            key === 'range' ||
            key === 'loc' ||
            key === 'type'
          )
            continue;
          const child = (node as unknown as Record<string, unknown>)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === 'object' && 'type' in item) {
                  findCrossAwaitDep(item as TSESTree.Node, false);
                }
              }
            } else if ('type' in (child as object)) {
              findCrossAwaitDep(child as TSESTree.Node, false);
            }
          }
        }
      }

      findCrossAwaitDep(body, true);
      return foundCrossAwaitDep;
    }

    /**
     * Extracts all binding names from a pattern (handles identifiers,
     * object/array destructuring, rest elements, etc.).
     */
    function collectBindingNames(
      pattern: TSESTree.DestructuringPattern | TSESTree.BindingName,
      names: Set<string>,
    ): void {
      switch (pattern.type) {
        case AST_NODE_TYPES.Identifier:
          names.add(pattern.name);
          break;
        case AST_NODE_TYPES.ObjectPattern:
          for (const prop of pattern.properties) {
            if (prop.type === AST_NODE_TYPES.Property) {
              collectBindingNames(
                prop.value as TSESTree.DestructuringPattern,
                names,
              );
            } else if (prop.type === AST_NODE_TYPES.RestElement) {
              collectBindingNames(
                prop.argument as TSESTree.DestructuringPattern,
                names,
              );
            }
          }
          break;
        case AST_NODE_TYPES.ArrayPattern:
          for (const el of pattern.elements) {
            if (el)
              collectBindingNames(el as TSESTree.DestructuringPattern, names);
          }
          break;
        case AST_NODE_TYPES.RestElement:
          collectBindingNames(
            pattern.argument as TSESTree.DestructuringPattern,
            names,
          );
          break;
        case AST_NODE_TYPES.AssignmentPattern:
          collectBindingNames(
            pattern.left as TSESTree.DestructuringPattern,
            names,
          );
          break;
      }
    }

    /**
     * Walks the loop body looking for the first AwaitExpression that is NOT
     * inside a nested async function (a different async scope). Returns the
     * first such AwaitExpression found, or null if none exists.
     */
    function findDirectAwait(
      node: TSESTree.Node,
      isRoot: boolean,
    ): TSESTree.AwaitExpression | null {
      // Do not cross into nested functions; their awaits belong to a
      // different async scope
      if (
        !isRoot &&
        (node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression)
      ) {
        return null;
      }

      if (node.type === AST_NODE_TYPES.AwaitExpression) {
        return node;
      }

      for (const key in node) {
        if (
          key === 'parent' ||
          key === 'range' ||
          key === 'loc' ||
          key === 'type'
        )
          continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                const result = findDirectAwait(item as TSESTree.Node, false);
                if (result) return result;
              }
            }
          } else if ('type' in (child as object)) {
            const result = findDirectAwait(child as TSESTree.Node, false);
            if (result) return result;
          }
        }
      }

      return null;
    }

    /**
     * Central analysis for a loop node. Returns the AwaitExpression to
     * report on, or null if the loop should not be flagged.
     */
    function analyzeLoop(loopNode: LoopNode): TSESTree.AwaitExpression | null {
      const body = loopNode.body;
      if (!body) return null;

      // Find an await directly inside the loop body (not in nested async fns)
      const awaitExpr = findDirectAwait(body, true);
      if (!awaitExpr) return null;

      // Exclusion: loop body contains a coordinator (batch, transaction, etc.)
      if (hasCoordinatorInBody(body)) return null;

      // Exclusion: loop body contains a rate-limiting call (sleep, delay, etc.)
      if (hasRateLimitedCallInBody(body)) return null;

      // Exclusion: the await is inside a try/catch — per-iteration error
      // handling implies intentional sequential execution
      if (isAwaitInTryCatch(awaitExpr, loopNode)) return null;

      // Exclusion: loop body contains break/continue/return — control flow
      // depends on async result
      if (containsBreakContinueReturn(body)) return null;

      // Exclusion: accumulator / pagination patterns — sequential dependency
      // detected between iterations
      const loopLocalVars = collectLoopLocalVars(body);
      if (hasSequentialDependency(body, loopLocalVars)) return null;

      // Exclusion: the specific await being reported is a rate-limiting call
      const callNames = getCallNames(awaitExpr);
      for (const name of callNames) {
        for (const pattern of rateLimitedPatterns) {
          if (name.toLowerCase() === pattern.toLowerCase()) return null;
        }
      }

      return awaitExpr;
    }

    return {
      ForOfStatement(node) {
        const awaitExpr = analyzeLoop(node);
        if (awaitExpr) {
          context.report({
            node: awaitExpr,
            messageId: 'parallelizeLoopAwaits',
          });
        }
      },
      ForInStatement(node) {
        const awaitExpr = analyzeLoop(node);
        if (awaitExpr) {
          context.report({
            node: awaitExpr,
            messageId: 'parallelizeLoopAwaits',
          });
        }
      },
      ForStatement(node) {
        const awaitExpr = analyzeLoop(node);
        if (awaitExpr) {
          context.report({
            node: awaitExpr,
            messageId: 'parallelizeLoopAwaits',
          });
        }
      },
      WhileStatement(node) {
        const awaitExpr = analyzeLoop(node);
        if (awaitExpr) {
          context.report({
            node: awaitExpr,
            messageId: 'parallelizeLoopAwaits',
          });
        }
      },
    };
  },
});
