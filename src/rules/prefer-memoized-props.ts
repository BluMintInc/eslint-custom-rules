import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferMemoizedProps';

type LiteralKind = 'object' | 'array' | 'function';

type FunctionNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

type PendingViolation = {
  node: TSESTree.Node;
  propName: string;
  literalKind: LiteralKind;
  enclosingFn: FunctionNode;
};

/**
 * Returns true for props whose values are deep-compared by the custom
 * blumintAreEqual comparator, meaning inline definitions do not cause
 * referential-inequality re-renders even without explicit memoization.
 */
function isDeepComparedProp(name: string): boolean {
  return (
    name === 'sx' ||
    name.endsWith('Sx') ||
    name === 'style' ||
    name.endsWith('Style')
  );
}

/**
 * Strips TypeScript type-assertion wrappers to reach the underlying expression.
 */
function unwrapExpression(node: TSESTree.Expression): TSESTree.Expression {
  let current: TSESTree.Expression = node;
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion ||
    current.type === AST_NODE_TYPES.TSNonNullExpression ||
    current.type === AST_NODE_TYPES.TSSatisfiesExpression
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * Detects import paths pointing to the project-local memo utility, which
 * provides deep comparison via blumintAreEqual for sx/style props.
 */
function isUtilMemoPath(path: string): boolean {
  return /(?:^|\/|\\)util\/memo$/.test(path);
}

/**
 * Finds the nearest enclosing function node by walking up the parent chain.
 */
function findEnclosingFunction(node: TSESTree.Node): FunctionNode | null {
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return current as FunctionNode;
    }
    current = current.parent as TSESTree.Node | null;
  }
  return null;
}

export const preferMemoizedProps = createRule<[], MessageIds>({
  name: 'prefer-memoized-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require that object, array, and function literals passed as JSX props inside React.memo components are memoized or hoisted, so memoized children retain referential equality across renders. Props handled by deep comparison (sx, style, *Sx, *Style) are exempt.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      preferMemoizedProps:
        'Prop "{{propName}}" in a React.memo component receives a {{literalKind}} that is recreated every render, so memoized children lose referential equality and re-render. Memoize this {{literalKind}} with useMemo/useCallback or hoist a stable constant so the prop reference stays stable.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Local identifiers that refer to the memo() function from react or util/memo.
    const memoIdentifiers = new Set<string>();

    // Functions that have been confirmed as arguments to memo().
    const memoizedFunctions = new Set<FunctionNode>();

    // Maps a variable/function name to the function node that defines it, so
    // that memo(MyComp) can be resolved back to the ArrowFunctionExpression or
    // FunctionDeclaration that MyComp refers to.
    const nameToFunction = new Map<string, FunctionNode>();

    // Violations collected during traversal; reported in Program:exit once all
    // memo() calls in the file have been seen.
    const pendingViolations: PendingViolation[] = [];

    function isMemoCallee(callee: TSESTree.LeftHandSideExpression): boolean {
      if (callee.type === AST_NODE_TYPES.Identifier) {
        return memoIdentifiers.has(callee.name);
      }
      // React.memo(...)
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === 'memo'
      ) {
        return true;
      }
      return false;
    }

    function markMemoArg(arg: TSESTree.Expression): void {
      const unwrapped = unwrapExpression(arg);

      if (
        unwrapped.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        unwrapped.type === AST_NODE_TYPES.FunctionExpression
      ) {
        memoizedFunctions.add(unwrapped);
        return;
      }

      if (unwrapped.type === AST_NODE_TYPES.Identifier) {
        const fn = nameToFunction.get(unwrapped.name);
        if (fn) {
          memoizedFunctions.add(fn);
        }
      }
    }

    function getLiteralKind(node: TSESTree.Expression): LiteralKind | null {
      switch (node.type) {
        case AST_NODE_TYPES.ObjectExpression:
          return 'object';
        case AST_NODE_TYPES.ArrayExpression:
          return 'array';
        case AST_NODE_TYPES.ArrowFunctionExpression:
        case AST_NODE_TYPES.FunctionExpression:
          return 'function';
        default:
          return null;
      }
    }

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;
        const source = node.source.value as string;
        if (source !== 'react' && !isUtilMemoPath(source)) return;

        for (const specifier of node.specifiers) {
          if (
            specifier.type === AST_NODE_TYPES.ImportSpecifier &&
            specifier.imported.type === AST_NODE_TYPES.Identifier &&
            specifier.imported.name === 'memo'
          ) {
            memoIdentifiers.add(specifier.local.name);
          }
        }
      },

      FunctionDeclaration(node) {
        if (node.id) {
          nameToFunction.set(node.id.name, node);
        }
      },

      VariableDeclarator(node) {
        if (node.id.type !== AST_NODE_TYPES.Identifier || !node.init) return;
        const init = unwrapExpression(node.init as TSESTree.Expression);
        if (
          init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          init.type === AST_NODE_TYPES.FunctionExpression
        ) {
          nameToFunction.set(node.id.name, init);
        }
      },

      CallExpression(node) {
        if (!isMemoCallee(node.callee)) return;
        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.type === AST_NODE_TYPES.SpreadElement) return;
        markMemoArg(firstArg as TSESTree.Expression);
      },

      JSXAttribute(node) {
        if (!node.value) return;
        if (node.value.type !== AST_NODE_TYPES.JSXExpressionContainer) return;

        const rawExpr = node.value.expression;
        if (rawExpr.type === AST_NODE_TYPES.JSXEmptyExpression) return;

        const expression = unwrapExpression(rawExpr as TSESTree.Expression);
        const literalKind = getLiteralKind(expression);
        if (!literalKind) return;

        // JSXNamespacedName props are unusual and ignored for safety.
        if (node.name.type !== AST_NODE_TYPES.JSXIdentifier) return;
        const propName = node.name.name;

        // Props deep-compared by our custom memo are safe as inline literals.
        if (isDeepComparedProp(propName)) return;

        const enclosingFn = findEnclosingFunction(node);
        if (!enclosingFn) return;

        pendingViolations.push({
          node: rawExpr as TSESTree.Node,
          propName,
          literalKind,
          enclosingFn,
        });
      },

      'Program:exit'() {
        for (const { node, propName, literalKind, enclosingFn } of pendingViolations) {
          if (memoizedFunctions.has(enclosingFn)) {
            context.report({
              node,
              messageId: 'preferMemoizedProps',
              data: { propName, literalKind },
            });
          }
        }
      },
    };
  },
});
