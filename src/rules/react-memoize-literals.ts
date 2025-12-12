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

const LITERAL_DESCRIPTOR_BY_TYPE: Partial<
  Record<AST_NODE_TYPES, LiteralDescriptor>
> = {
  [AST_NODE_TYPES.ObjectExpression]: {
    literalType: 'object literal',
    memoHook: 'useMemo',
  },
  [AST_NODE_TYPES.ArrayExpression]: {
    literalType: 'array literal',
    memoHook: 'useMemo',
  },
  [AST_NODE_TYPES.ArrowFunctionExpression]: {
    literalType: 'inline function',
    memoHook: 'useCallback',
  },
  [AST_NODE_TYPES.FunctionExpression]: {
    literalType: 'inline function',
    memoHook: 'useCallback',
  },
  [AST_NODE_TYPES.FunctionDeclaration]: {
    literalType: 'inline function',
    memoHook: 'useCallback',
  },
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

const TODO_REPLACE_WITH_ACTUAL_DEPENDENCIES = '__TODO_ADD_DEPENDENCIES__';
const TODO_DEPS_COMMENT = `/* ${TODO_REPLACE_WITH_ACTUAL_DEPENDENCIES} */`;
const PARENTHESIZED_EXPRESSION_TYPE =
  (AST_NODE_TYPES as Record<string, string>).ParenthesizedExpression ??
  'ParenthesizedExpression';

function isHookName(name: string | null | undefined): name is string {
  return !!name && /^use[A-Z]/.test(name);
}

function isComponentName(name: string | null | undefined): name is string {
  return !!name && /^[A-Z]/.test(name);
}

function isParenthesizedExpression(
  node: TSESTree.Node,
): node is TSESTree.Node & { expression: TSESTree.Node } {
  return node.type === PARENTHESIZED_EXPRESSION_TYPE;
}

function getNameFromNode(node: TSESTree.Node | null): string | null {
  if (!node) return null;

  if (
    node.type === AST_NODE_TYPES.VariableDeclarator &&
    node.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.id.name;
  }

  if (
    node.type === AST_NODE_TYPES.AssignmentExpression &&
    node.left.type === AST_NODE_TYPES.Identifier
  ) {
    return node.left.name;
  }

  if (
    node.type === AST_NODE_TYPES.Property &&
    node.key.type === AST_NODE_TYPES.Identifier
  ) {
    return node.key.name;
  }

  return null;
}

function isTransparentNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression ||
    node.type === AST_NODE_TYPES.MemberExpression ||
    node.type === AST_NODE_TYPES.ChainExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression
  );
}

function findNameInAncestors(startNode: TSESTree.Node | null): string | null {
  let current: TSESTree.Node | null = startNode;

  while (current) {
    const name = getNameFromNode(current);
    if (name) {
      return name;
    }

    if (!isTransparentNode(current)) {
      break;
    }

    current = current.parent as TSESTree.Node | null;
  }

  return null;
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
  if (!parent) {
    return null;
  }

  const immediateName = getNameFromNode(parent);
  if (immediateName) {
    return immediateName;
  }

  return findNameInAncestors(parent);
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
  const descriptor =
    LITERAL_DESCRIPTOR_BY_TYPE[node.type as AST_NODE_TYPES] ?? null;
  return descriptor;
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

function unwrapExpression(node: TSESTree.Node): TSESTree.Node {
  let current: TSESTree.Node = node;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSTypeAssertion ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      current.type === AST_NODE_TYPES.TSNonNullExpression
    ) {
      current = current.expression;
      continue;
    }

    if (current.type === AST_NODE_TYPES.ChainExpression) {
      current = current.expression;
      continue;
    }

    if (isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }

    return current;
  }
}

function findEnclosingHookCall(
  node: TSESTree.Node,
): { hookName: string; isDirectArgument: boolean } | null {
  const unwrappedTarget = unwrapExpression(node);
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      const hookName = isHookCall(current);
      if (hookName) {
        const isDirectArgument = current.arguments.some((arg) => {
          const unwrappedArg = unwrapExpression(arg as TSESTree.Node);
          return unwrappedArg === unwrappedTarget;
        });
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

function findEnclosingReturnStatement(
  node: TSESTree.Node,
): TSESTree.ReturnStatement | null {
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (current.type === AST_NODE_TYPES.ReturnStatement) {
      return current;
    }

    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSTypeAssertion ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      current.type === AST_NODE_TYPES.TSNonNullExpression ||
      current.type === AST_NODE_TYPES.ChainExpression ||
      isParenthesizedExpression(current)
    ) {
      current = current.parent as TSESTree.Node | null;
      continue;
    }

    break;
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
    owner.body.type !== AST_NODE_TYPES.BlockStatement &&
    unwrapExpression(owner.body) === unwrapExpression(node)
  ) {
    return true;
  }

  if (
    node.parent?.type !== AST_NODE_TYPES.ReturnStatement ||
    node.parent.argument !== node
  ) {
    const returnStatement = findEnclosingReturnStatement(node);
    if (!returnStatement?.argument) {
      return false;
    }

    if (
      unwrapExpression(returnStatement.argument) !== unwrapExpression(node)
    ) {
      return false;
    }

    const owningFunction = findOwningFunction(returnStatement);
    return owningFunction === owner;
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
            `${descriptor.memoHook}(${initializerText}, [${TODO_DEPS_COMMENT}])`,
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
          `${descriptor.memoHook}(() => ${wrappedInitializer}, [${TODO_DEPS_COMMENT}])`,
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
    fixable:
      null as unknown as TSESLint.RuleMetaData<MessageIds>['fixable'],
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
      FunctionDeclaration: reportLiteral,
    };
  },
});

