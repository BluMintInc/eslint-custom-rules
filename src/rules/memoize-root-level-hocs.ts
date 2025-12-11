import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
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

const isHocIdentifier = (
  name: string,
  additionalHocs: Set<string>,
): boolean => {
  if (additionalHocs.has(name)) {
    return true;
  }

  if (!name.startsWith('with')) {
    return false;
  }

  const suffix = name.charAt(4);
  return Boolean(suffix) && /^[A-Z]$/.test(suffix);
};

const findHocName = (
  node: TSESTree.CallExpression,
  additionalHocs: Set<string>,
): string | null => {
  const identifier = getCallableIdentifierName(node.callee);
  if (identifier && isHocIdentifier(identifier, additionalHocs)) {
    return identifier;
  }

  if (node.callee.type === AST_NODE_TYPES.CallExpression) {
    return findHocName(node.callee, additionalHocs);
  }

  return null;
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
      const hocName = findHocName(callExpr, additionalHocs);
      const parentCall = getParentCallExpression(callExpr);
      const parentHocName =
        parentCall && findHocName(parentCall, additionalHocs);

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
