import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    additionalHocNames?: string[];
  },
];

type MessageIds = 'wrapHocInUseMemo';

const defaultOptions: Options = [{ additionalHocNames: [] }];

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

const isFunctionNode = (node: TSESTree.Node): node is FunctionNode =>
  node.type === AST_NODE_TYPES.FunctionDeclaration ||
  node.type === AST_NODE_TYPES.FunctionExpression ||
  node.type === AST_NODE_TYPES.ArrowFunctionExpression;

const isHookName = (name: string): boolean => /^use[A-Z]/.test(name);
const isComponentName = (name: string): boolean => /^[A-Z]/.test(name);

const forEachChildNode = (
  node: TSESTree.Node,
  callback: (child: TSESTree.Node) => boolean | void,
): boolean => {
  for (const key of Object.keys(node) as (keyof typeof node)[]) {
    if (key === 'parent') continue;
    const value = (node as any)[key];
    if (!value) continue;

    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') {
          if (callback(child as TSESTree.Node)) {
            return true;
          }
        }
      }
    } else if (value && typeof value.type === 'string') {
      if (callback(value as TSESTree.Node)) {
        return true;
      }
    }
  }

  return false;
};

const getFunctionName = (node: FunctionNode): string | null => {
  if (node.type === AST_NODE_TYPES.FunctionDeclaration && node.id) {
    return node.id.name;
  }

  if (
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    const parent = node.parent;
    if (
      parent &&
      parent.type === AST_NODE_TYPES.VariableDeclarator &&
      parent.id.type === AST_NODE_TYPES.Identifier
    ) {
      return parent.id.name;
    }

    if (
      parent &&
      parent.type === AST_NODE_TYPES.Property &&
      parent.key.type === AST_NODE_TYPES.Identifier
    ) {
      return parent.key.name;
    }
  }

  return null;
};

type ContainsJsxOptions = {
  skipFunctionBodies?: boolean;
};

const containsJsx = (
  node: TSESTree.Node | null,
  options?: ContainsJsxOptions,
): boolean => {
  if (!node) return false;

  if (
    node.type === AST_NODE_TYPES.JSXElement ||
    node.type === AST_NODE_TYPES.JSXFragment
  ) {
    return true;
  }

  return forEachChildNode(node, (child) => {
    if (options?.skipFunctionBodies && isFunctionNode(child)) {
      return false;
    }

    return containsJsx(child, options);
  });
};

const hasFunctionParent = (node: TSESTree.Node): boolean => {
  let current = node.parent as TSESTree.Node | undefined;
  while (current) {
    if (isFunctionNode(current)) {
      return true;
    }
    current = current.parent as TSESTree.Node | undefined;
  }
  return false;
};

const getBodyNodeForJsxCheck = (node: FunctionNode): TSESTree.Node | null => {
  if (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression
  ) {
    return node.body;
  }

  if (node.body && node.body.type !== AST_NODE_TYPES.BlockStatement) {
    return node.body;
  }

  return node.body as TSESTree.Node | null;
};

const isComponentOrHook = (
  node: FunctionNode,
): { contextLabel: string } | null => {
  const name = getFunctionName(node);
  const hook = name ? isHookName(name) : false;
  const component = name ? isComponentName(name) : false;
  const nestedFunction = hasFunctionParent(node);
  const jsxBody = containsJsx(getBodyNodeForJsxCheck(node), {
    skipFunctionBodies: !hook && !component,
  });

  if (!hook && !component && nestedFunction) {
    return null;
  }

  if (!hook && !component && !jsxBody) {
    return null;
  }

  if (hook) {
    return { contextLabel: `hook${name ? ` ${name}` : ''}` };
  }

  return { contextLabel: `component${name ? ` ${name}` : ''}` };
};

const getCallableIdentifierName = (
  callee: TSESTree.LeftHandSideExpression,
): string | null => {
  const maybeChain = callee as unknown as TSESTree.ChainExpression;
  if (maybeChain.type === AST_NODE_TYPES.ChainExpression) {
    return getCallableIdentifierName(
      maybeChain.expression as TSESTree.LeftHandSideExpression,
    );
  }

  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name;
  }

  return null;
};

const hasHocNameShape = (name: string): boolean => {
  if (!name.startsWith('with')) {
    return false;
  }

  const suffix = name.charAt(4);
  return Boolean(suffix) && /^[A-Z]$/.test(suffix);
};

/**
 * Strips wrappers that carry no runtime meaning so a component argument stays
 * recognizable behind `as`, `!`, `satisfies` and optional-chaining nodes.
 */
const unwrapExpression = (node: TSESTree.Node): TSESTree.Node => {
  let current = node;
  for (;;) {
    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      current.type === AST_NODE_TYPES.TSNonNullExpression ||
      current.type === AST_NODE_TYPES.TSTypeAssertion ||
      current.type === AST_NODE_TYPES.TSInstantiationExpression ||
      current.type === AST_NODE_TYPES.ChainExpression
    ) {
      current = current.expression;
      continue;
    }

    return current;
  }
};

type HocMatch = {
  name: string;
  /** True when the name comes from `additionalHocNames` rather than the `with[A-Z]` shape. */
  configured: boolean;
};

/**
 * State threaded through the structural checks.
 *
 * `visiting` breaks reference cycles: `const enhanced = withX(enhanced)` would
 * otherwise make the evidence lookup for the argument re-enter the same call.
 */
type HocContext = {
  additionalHocs: Set<string>;
  resolveVariable: (
    identifier: TSESTree.Identifier,
  ) => TSESLint.Scope.Variable | null;
  visiting: Set<TSESTree.Node>;
};

const findHocNameMatch = (
  node: TSESTree.CallExpression,
  additionalHocs: Set<string>,
): HocMatch | null => {
  const identifier = getCallableIdentifierName(node.callee);
  if (identifier) {
    if (additionalHocs.has(identifier)) {
      return { name: identifier, configured: true };
    }

    if (hasHocNameShape(identifier)) {
      return { name: identifier, configured: false };
    }
  }

  const callee = unwrapExpression(node.callee);
  if (callee.type === AST_NODE_TYPES.CallExpression) {
    return findHocNameMatch(callee, additionalHocs);
  }

  return null;
};

/**
 * Collects the arguments of every call in a curried chain, so the component
 * passed to `withStyles(styles)(Component)` still counts as evidence for the
 * outer call even though it names the HOC through its callee.
 */
const collectCallChainArguments = (
  node: TSESTree.CallExpression,
): TSESTree.Node[] => {
  const args: TSESTree.Node[] = [];
  let current: TSESTree.Node = node;

  while (current.type === AST_NODE_TYPES.CallExpression) {
    args.push(...current.arguments);
    current = unwrapExpression(current.callee);
  }

  return args;
};

/**
 * A `with[A-Z]…` name alone says nothing: string utilities such as
 * `withOpacity(color, 0.3)` share the shape. Reporting requires positive
 * structural evidence that the call operates on a component.
 */
const isComponentEvidence = (node: TSESTree.Node, ctx: HocContext): boolean => {
  const target = unwrapExpression(node);

  if (ctx.visiting.has(target)) {
    return false;
  }

  ctx.visiting.add(target);
  try {
    switch (target.type) {
      case AST_NODE_TYPES.Identifier:
        return (
          isComponentName(target.name) || resolvesToComponentValue(target, ctx)
        );
      case AST_NODE_TYPES.MemberExpression:
        return (
          !target.computed &&
          target.property.type === AST_NODE_TYPES.Identifier &&
          isComponentName(target.property.name)
        );
      case AST_NODE_TYPES.ArrowFunctionExpression:
      case AST_NODE_TYPES.FunctionExpression:
      case AST_NODE_TYPES.FunctionDeclaration:
        return containsJsx(getBodyNodeForJsxCheck(target));
      case AST_NODE_TYPES.ClassExpression:
      case AST_NODE_TYPES.ClassDeclaration:
        return true;
      case AST_NODE_TYPES.CallExpression:
        return getHocName(target, ctx) !== null;
      case AST_NODE_TYPES.ConditionalExpression:
        return (
          isComponentEvidence(target.consequent, ctx) ||
          isComponentEvidence(target.alternate, ctx)
        );
      case AST_NODE_TYPES.LogicalExpression:
        return (
          isComponentEvidence(target.left, ctx) ||
          isComponentEvidence(target.right, ctx)
        );
      case AST_NODE_TYPES.SpreadElement:
        return isComponentEvidence(target.argument, ctx);
      default:
        return false;
    }
  } finally {
    ctx.visiting.delete(target);
  }
};

/**
 * Resolves a lowercase argument through scope analysis rather than assuming it
 * might be a component. Component bindings are conventionally capitalized, so a
 * lowercase name only counts when its declaration proves it holds a component —
 * which keeps `withPortal(build)` reported while leaving `withOpacity(color,
 * 0.3)` alone. A binding the scope cannot resolve (an import, a parameter, a
 * global) proves nothing and is therefore not evidence.
 */
const resolvesToComponentValue = (
  identifier: TSESTree.Identifier,
  ctx: HocContext,
): boolean => {
  const variable = ctx.resolveVariable(identifier);
  if (!variable) {
    return false;
  }

  return variable.defs.some((def) => {
    const defNode = def.node;

    if (defNode.type === AST_NODE_TYPES.VariableDeclarator) {
      return (
        defNode.id === def.name &&
        Boolean(defNode.init) &&
        isComponentEvidence(defNode.init as TSESTree.Node, ctx)
      );
    }

    // A parameter definition shares its node with the enclosing function, so the
    // function's own JSX must not be credited to the parameter.
    if (defNode.type === AST_NODE_TYPES.FunctionDeclaration) {
      return (
        defNode.id === def.name && containsJsx(getBodyNodeForJsxCheck(defNode))
      );
    }

    if (defNode.type === AST_NODE_TYPES.ClassDeclaration) {
      return defNode.id === def.name;
    }

    return false;
  });
};

const getHocName = (
  node: TSESTree.CallExpression,
  ctx: HocContext,
): string | null => {
  const match = findHocNameMatch(node, ctx.additionalHocs);
  if (!match) {
    return null;
  }

  // An explicitly configured name is a deliberate opt-in, so it is trusted
  // without any structural confirmation.
  if (match.configured) {
    return match.name;
  }

  const hasEvidence = collectCallChainArguments(node).some((argument) =>
    isComponentEvidence(argument, ctx),
  );

  return hasEvidence ? match.name : null;
};

/**
 * Detects chained HOC calls where an inner call is immediately invoked by
 * another call (for example, withHoc(Component)()). We only treat calls as
 * part of the same chain when the current CallExpression is the callee of its
 * parent and both resolve to the same HOC name, which prevents duplicate
 * reports for patterns like withHoc(Component)(props).
 */
const getParentCallExpression = (
  callExpr: TSESTree.CallExpression,
): TSESTree.CallExpression | null =>
  callExpr.parent &&
  callExpr.parent.type === AST_NODE_TYPES.CallExpression &&
  callExpr.parent.callee === callExpr
    ? callExpr.parent
    : null;

const isPartOfHocChain = (
  hocName: string,
  parentHocName: string | null,
): boolean => Boolean(parentHocName && parentHocName === hocName);

export const memoizeRootLevelHocs = createRule<Options, MessageIds>({
  name: 'memoize-root-level-hocs',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent creating Higher-Order Components at the root level of React components/hooks without wrapping them in useMemo to keep wrapped component identities stable across renders.',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          additionalHocNames: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      wrapHocInUseMemo:
        'HOC "{{hocName}}" is created inside {{contextLabel}} during render, so every render creates a brand-new wrapped component reference. React treats that as a different component, unmounting/remounting it (resetting internal state) and forcing children to re-render even when props stay the same. Wrap the HOC creation in useMemo with the correct dependencies or hoist it outside the {{contextLabel}} so the wrapped component identity stays stable.',
    },
  },
  defaultOptions,
  create(context, [options]) {
    const additionalHocs = new Set(options?.additionalHocNames ?? []);
    const sourceCode = context.getSourceCode();

    /**
     * Walks outward to the nearest scope owning the identifier, then up the
     * scope chain. Acquiring scopes from the node keeps resolution independent
     * of where the traversal currently sits.
     */
    const resolveVariable = (
      identifier: TSESTree.Identifier,
    ): TSESLint.Scope.Variable | null => {
      const { scopeManager } = sourceCode;
      if (!scopeManager) {
        return null;
      }

      let scope: TSESLint.Scope.Scope | null = null;
      let current: TSESTree.Node | undefined = identifier;
      while (current && !scope) {
        scope = scopeManager.acquire(current, true);
        current = current.parent as TSESTree.Node | undefined;
      }

      scope = scope ?? scopeManager.globalScope;

      while (scope) {
        const variable = scope.variables.find(
          (candidate) => candidate.name === identifier.name,
        );
        if (variable) {
          return variable;
        }
        scope = scope.upper;
      }

      return null;
    };

    const hocContext: HocContext = {
      additionalHocs,
      resolveVariable,
      visiting: new Set<TSESTree.Node>(),
    };

    const reportUnmemoizedHoc = (
      node: TSESTree.CallExpression,
      hocName: string,
      contextInfo: { contextLabel: string },
    ) => {
      context.report({
        node,
        messageId: 'wrapHocInUseMemo',
        data: {
          hocName,
          contextLabel: contextInfo.contextLabel,
        },
      });
    };

    const checkHocCall = (
      callExpr: TSESTree.CallExpression,
      contextInfo: { contextLabel: string },
    ) => {
      const hocName = getHocName(callExpr, hocContext);
      const parentCall = getParentCallExpression(callExpr);
      const parentHocName = parentCall && getHocName(parentCall, hocContext);

      if (hocName && !isPartOfHocChain(hocName, parentHocName)) {
        reportUnmemoizedHoc(callExpr, hocName, contextInfo);
      }
    };

    const traverseFunctionBody = (
      node: FunctionNode,
      contextInfo: { contextLabel: string },
    ) => {
      const visitNode = (current: TSESTree.Node) => {
        if (isFunctionNode(current) && current !== node) {
          return;
        }

        if (current.type === AST_NODE_TYPES.CallExpression) {
          checkHocCall(current, contextInfo);
        }

        forEachChildNode(current, (child) => {
          visitNode(child);
          return false;
        });
      };

      if (!node.body) {
        return;
      }

      if (node.body.type === AST_NODE_TYPES.BlockStatement) {
        for (const statement of node.body.body) {
          visitNode(statement);
        }
        return;
      }

      visitNode(node.body);
    };

    const analyzeFunction = (node: FunctionNode) => {
      const contextInfo = isComponentOrHook(node);
      if (!contextInfo) {
        return;
      }

      traverseFunctionBody(node, contextInfo);
    };

    return {
      FunctionDeclaration: analyzeFunction,
      FunctionExpression: analyzeFunction,
      ArrowFunctionExpression: analyzeFunction,
    };
  },
});
