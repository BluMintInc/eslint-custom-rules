import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'componentLiteral'
  | 'nestedHookLiteral'
  | 'hookReturnLiteral'
  | 'memoizeLiteralSuggestion';

type LiteralDescriptor = {
  literalType: 'object literal' | 'array literal' | 'inline function';
  memoHook: 'useMemo' | 'useCallback';
};

const SAFE_HOOK_ARGUMENTS = new Set([
  'useMemo',
  'useCallback',
  'useEffect',
  'useLayoutEffect',
  'useInsertionEffect',
  'useImperativeHandle',
  'useState',
  'useReducer',
  'useRef',
  'useSyncExternalStore',
  'useDeferredValue',
  'useTransition',
  'useId',
]);

function isHookName(name: string | null | undefined): name is string {
  return !!name && /^use[A-Z]/.test(name);
}

function isComponentName(name: string | null | undefined): name is string {
  return !!name && /^[A-Z]/.test(name);
}

function getFunctionName(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): string | null {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn.id?.name ?? null;
  }

  if (fn.type === AST_NODE_TYPES.FunctionExpression && fn.id?.name) {
    return fn.id.name;
  }

  const parent = fn.parent;
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

  return null;
}

function isComponentOrHookFunction(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): boolean {
  const name = getFunctionName(fn);
  return isComponentName(name) || isHookName(name);
}

function isHookFunction(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): boolean {
  return isHookName(getFunctionName(fn));
}

function isFunctionNode(
  node: TSESTree.Node,
): node is
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function getHookNameFromCallee(
  callee: TSESTree.LeftHandSideExpression,
): string | null {
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
}

function isHookCall(node: TSESTree.CallExpression): string | null {
  const hookName = getHookNameFromCallee(node.callee);
  return hookName && isHookName(hookName) ? hookName : null;
}

function getLiteralDescriptor(node: TSESTree.Node): LiteralDescriptor | null {
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return { literalType: 'object literal', memoHook: 'useMemo' };
  }
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return { literalType: 'array literal', memoHook: 'useMemo' };
  }
  if (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  ) {
    return { literalType: 'inline function', memoHook: 'useCallback' };
  }
  return null;
}

function findEnclosingComponentOrHook(node: TSESTree.Node) {
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (isFunctionNode(current) && isComponentOrHookFunction(current)) {
      return current;
    }
    current = current.parent as TSESTree.Node | null;
  }
  return null;
}

function isInsideAllowedHookCallback(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | null = node;
  while (current) {
    if (
      (current.type === AST_NODE_TYPES.FunctionExpression ||
        current.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
      current.parent?.type === AST_NODE_TYPES.CallExpression
    ) {
      const hookName = getHookNameFromCallee(current.parent.callee);
      if (hookName && SAFE_HOOK_ARGUMENTS.has(hookName)) {
        return true;
      }
    }
    current = current.parent as TSESTree.Node | null;
  }
  return false;
}

function findEnclosingHookCall(
  node: TSESTree.Node,
): { hookName: string; isDirectArgument: boolean } | null {
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      const hookName = isHookCall(current);
      if (hookName) {
        const isDirectArgument = current.arguments.includes(
          node as TSESTree.Expression,
        );
        return { hookName, isDirectArgument };
      }
    }
    current = current.parent as TSESTree.Node | null;
  }
  return null;
}

function findOwningFunction(
  node: TSESTree.Node,
):
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | null {
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (isFunctionNode(current)) {
      return current;
    }
    current = current.parent as TSESTree.Node | null;
  }
  return null;
}

function isReturnValueFromHook(
  node: TSESTree.Node,
  owner:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): boolean {
  if (!isHookFunction(owner)) return false;

  if (
    owner.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    owner.body === node
  ) {
    return true;
  }

  if (
    node.parent?.type !== AST_NODE_TYPES.ReturnStatement ||
    node.parent.argument !== node
  ) {
    return false;
  }

  const owningFunction = findOwningFunction(node.parent);
  return owningFunction === owner;
}

function buildMemoSuggestions(
  node: TSESTree.Node,
  descriptor: LiteralDescriptor,
  sourceCode: TSESLint.SourceCode,
): TSESLint.ReportSuggestionArray<MessageIds> {
  const initializerText = sourceCode.getText(node);
  const wrappedInitializer =
    descriptor.literalType === 'object literal'
      ? `(${initializerText})`
      : initializerText;

  if (descriptor.literalType === 'inline function') {
    return [
      {
        messageId: 'memoizeLiteralSuggestion',
        data: {
          literalType: descriptor.literalType,
          memoHook: descriptor.memoHook,
        },
        fix(fixer) {
          return fixer.replaceText(
            node,
            `${descriptor.memoHook}(${initializerText}, [])`,
          );
        },
      },
    ];
  }

  return [
    {
      messageId: 'memoizeLiteralSuggestion',
      data: {
        literalType: descriptor.literalType,
        memoHook: descriptor.memoHook,
      },
      fix(fixer) {
        return fixer.replaceText(
          node,
          `${descriptor.memoHook}(() => ${wrappedInitializer}, [])`,
        );
      },
    },
  ];
}

function formatContextLabel(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): string {
  const name = getFunctionName(fn);
  if (!name) return 'this component or hook';
  if (isHookName(name)) return `hook "${name}"`;
  return `component "${name}"`;
}

export const reactMemoizeLiterals = createRule<[], MessageIds>({
  name: 'react-memoize-literals',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detect object, array, and function literals created in React components or hooks that create new references every render. Prefer memoized values (useMemo/useCallback) or module-level constants to keep referential stability.',
      recommended: 'error',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      componentLiteral:
        'New {{literalType}} inside {{context}} is created on every render. It breaks referential stability for hooks and props. Move it to a module-level constant or wrap it in {{memoHook}} so React sees a stable reference.',
      nestedHookLiteral:
        'Nested {{literalType}} inside {{hookName}} arguments is recreated on each render, so dependency comparisons always change. Extract it into a memoized value (useMemo/useCallback) or hoist it to a module constant before passing it to {{hookName}}.',
      hookReturnLiteral:
        '{{hookName}} returns a {{literalType}} literal, giving consumers a fresh reference every render and forcing re-renders. Memoize the returned value with useMemo/useCallback or return pre-memoized pieces so callers receive a stable reference.',
      memoizeLiteralSuggestion:
        'Wrap this {{literalType}} in {{memoHook}} so React keeps a stable reference. Include every value it closes over in the dependency array.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    function reportLiteral(node: TSESTree.Node) {
      const descriptor = getLiteralDescriptor(node);
      if (!descriptor) return;

      if (isInsideAllowedHookCallback(node)) {
        return;
      }

      const owner = findEnclosingComponentOrHook(node);
      if (!owner) return;

      const hookCall = findEnclosingHookCall(node);
      if (hookCall) {
        if (hookCall.isDirectArgument) {
          // Top-level literal passed directly to a hook argument is allowed.
          return;
        }

        context.report({
          node,
          messageId: 'nestedHookLiteral',
          data: {
            literalType: descriptor.literalType,
            hookName: hookCall.hookName,
          },
        });
        return;
      }

      if (isReturnValueFromHook(node, owner)) {
        const hookName = getFunctionName(owner) ?? 'this hook';
        context.report({
          node,
          messageId: 'hookReturnLiteral',
          data: {
            literalType: descriptor.literalType,
            hookName,
          },
        });
        return;
      }

      const contextLabel = formatContextLabel(owner);
      const suggestions =
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.init === node
          ? buildMemoSuggestions(node, descriptor, sourceCode)
          : undefined;

      context.report({
        node,
        messageId: 'componentLiteral',
        data: {
          literalType: descriptor.literalType,
          context: contextLabel,
          memoHook: descriptor.memoHook,
        },
        suggest: suggestions,
      });
    }

    return {
      ObjectExpression: reportLiteral,
      ArrayExpression: reportLiteral,
      ArrowFunctionExpression: reportLiteral,
      FunctionExpression: reportLiteral,
    };
  },
});

