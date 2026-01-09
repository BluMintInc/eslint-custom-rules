import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

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

const MEMOIZATION_DEPS_TODO_PLACEHOLDER = '__TODO_MEMOIZATION_DEPENDENCIES__';
const TODO_DEPS_COMMENT = `/* ${MEMOIZATION_DEPS_TODO_PLACEHOLDER} */`;
const PARENTHESIZED_EXPRESSION_TYPE =
  (AST_NODE_TYPES as Record<string, string>).ParenthesizedExpression ??
  'ParenthesizedExpression';

/**
 * Detects React hook-style identifiers prefixed with "use".
 * @param name Candidate identifier name.
 * @returns True when the name follows the hook naming convention.
 */
function isHookName(name: string | null | undefined): name is string {
  return !!name && /^use[A-Z]/.test(name);
}

/**
 * Detects PascalCase identifiers commonly used for React components.
 * @param name Candidate identifier name.
 * @returns True when the name begins with an uppercase character.
 */
function isComponentName(name: string | null | undefined): name is string {
  return !!name && /^[A-Z]/.test(name);
}

/**
 * Type guard for parenthesized expressions to unwrap safely.
 * @param node Node to evaluate.
 * @returns True when the node is a parenthesized expression wrapper.
 */
function isParenthesizedExpression(
  node: TSESTree.Node,
): node is TSESTree.Node & { expression: TSESTree.Node } {
  return node.type === PARENTHESIZED_EXPRESSION_TYPE;
}

/**
 * Extracts an identifier name from variable, assignment, or property nodes.
 * @param node AST node that may carry an identifier.
 * @returns Identifier name when present, otherwise null.
 */
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

/**
 * Determines whether a node should be traversed through when resolving names.
 * @param node Node to evaluate for transparency.
 * @returns True when the node does not introduce a binding boundary.
 */
function isTransparentNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression ||
    node.type === AST_NODE_TYPES.MemberExpression ||
    isExpressionWrapper(node)
  );
}

/**
 * Walks ancestors through transparent nodes to find the nearest identifier name.
 * @param startNode Node where the search begins.
 * @returns Resolved identifier name or null if none is located.
 */
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

/**
 * Resolves a function's display name from its declaration or surrounding
 * assignment/property wrappers so HOC-wrapped and asserted components still map
 * to their intended identifiers.
 */
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

/**
 * Checks whether a function should be treated as a React component or hook
 * based on naming conventions. Enables the rule to limit reports to user-facing
 * components and hooks rather than arbitrary functions.
 */
function isComponentOrHookFunction(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): boolean {
  const name = getFunctionName(fn);
  return isComponentName(name) || isHookName(name);
}

/**
 * Checks whether a function node represents a hook by name.
 * @param fn Function node to inspect.
 * @returns True when the function follows hook naming.
 */
function isHookFunction(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): boolean {
  return isHookName(getFunctionName(fn));
}

/**
 * Narrows nodes to the supported function-like shapes.
 * @param node Node to test.
 * @returns True when the node is any function declaration or expression.
 */
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

/**
 * Extracts a hook name from simple identifier or member-expression callees.
 * @param callee Callee expression from a call.
 * @returns Hook name when available, otherwise null.
 */
function getHookNameFromCallee(
  callee: TSESTree.LeftHandSideExpression,
): string | null {
  const resolvedCallee = unwrapNestedExpressions(
    callee as unknown as TSESTree.Node,
  ) as TSESTree.Node;

  if (resolvedCallee.type === AST_NODE_TYPES.Identifier) {
    return resolvedCallee.name;
  }

  if (
    resolvedCallee.type === AST_NODE_TYPES.MemberExpression &&
    !resolvedCallee.computed &&
    (resolvedCallee.property as TSESTree.Node).type ===
      AST_NODE_TYPES.Identifier
  ) {
    const property = resolvedCallee.property as TSESTree.Identifier;
    return property.name;
  }

  return null;
}

/**
 * Detects hook call expressions and returns their hook name.
 * @param node Call expression to inspect.
 * @returns Hook name when the call targets a hook, otherwise null.
 */
function isHookCall(node: TSESTree.CallExpression): string | null {
  const hookName = getHookNameFromCallee(node.callee);
  return hookName && isHookName(hookName) ? hookName : null;
}

/**
 * Maps literal node types to memoization metadata used for reporting.
 * @param node Candidate literal node.
 * @returns Descriptor with literal type and memo hook, or null.
 */
function getLiteralDescriptor(node: TSESTree.Node): LiteralDescriptor | null {
  const descriptor =
    LITERAL_DESCRIPTOR_BY_TYPE[node.type as AST_NODE_TYPES] ?? null;
  return descriptor;
}

/**
 * Finds the nearest ancestor function considered a React component or hook.
 * @param node Starting node for the search.
 * @returns Owning component/hook function or null.
 */
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

/**
 * Checks whether a node is inside an allowed hook callback that should be skipped.
 * @param node Starting node for traversal.
 * @returns True when enclosed by a callback to an allowed hook.
 */
function isInsideAllowedHookCallback(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | null = node;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      let parent: TSESTree.Node | null = current.parent as TSESTree.Node | null;

      while (parent && isExpressionWrapper(parent)) {
        parent = parent.parent as TSESTree.Node | null;
      }

      if (parent?.type === AST_NODE_TYPES.CallExpression) {
        const hookName = getHookNameFromCallee(parent.callee);
        const matchesCallback = parent.arguments.some(
          (arg) => unwrapNestedExpressions(arg as TSESTree.Node) === current,
        );

        if (hookName && SAFE_HOOK_ARGUMENTS.has(hookName) && matchesCallback) {
          return true;
        }
      }
    }
    current = current.parent as TSESTree.Node | null;
  }
  return false;
}

/**
 * Type guard for nodes that wrap an underlying expression (e.g. assertions,
 * parentheses, optional chaining wrappers).
 */
function isExpressionWrapper(
  node: TSESTree.Node,
): node is
  | TSESTree.TSAsExpression
  | TSESTree.TSTypeAssertion
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.ChainExpression
  | (TSESTree.Node & { expression: TSESTree.Node }) {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.ChainExpression ||
    isParenthesizedExpression(node)
  );
}

/**
 * Unwraps TypeScript assertions, optional chaining, and parentheses to reach
 * the underlying expression node for stable identity comparisons.
 */
function unwrapNestedExpressions(node: TSESTree.Node): TSESTree.Node {
  let current: TSESTree.Node = node;
  while (isExpressionWrapper(current)) {
    current = current.expression;
  }
  return current;
}

/**
 * Finds the nearest enclosing hook call for a literal and whether the literal
 * is passed directly as an argument (versus nested inside another expression).
 */
function findEnclosingHookCall(
  node: TSESTree.Node,
): { hookName: string; isDirectArgument: boolean } | null {
  const unwrappedTarget = unwrapNestedExpressions(node);
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      const hookName = isHookCall(current);
      if (hookName) {
        const isDirectArgument = current.arguments.some((arg) => {
          const unwrappedArg = unwrapNestedExpressions(arg as TSESTree.Node);
          return unwrappedArg === unwrappedTarget;
        });
        return { hookName, isDirectArgument };
      }
    }
    current = current.parent as TSESTree.Node | null;
  }
  return null;
}

/**
 * Finds the nearest owning function for the provided node.
 * @param node Node to start from.
 * @returns Enclosing function declaration/expression or null.
 */
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

/**
 * Locates the closest return statement ancestor, skipping assertion wrappers.
 * @param node Node to start from.
 * @returns Enclosing return statement or null.
 */
function findEnclosingReturnStatement(
  node: TSESTree.Node,
): TSESTree.ReturnStatement | null {
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (current.type === AST_NODE_TYPES.ReturnStatement) {
      return current;
    }

    if (isExpressionWrapper(current)) {
      current = current.parent as TSESTree.Node | null;
      continue;
    }

    break;
  }
  return null;
}

/**
 * Determines whether a node is returned from the provided hook function.
 * @param node Expression candidate for return.
 * @param owner Hook function candidate.
 * @returns True when the expression is the hook's return value.
 */
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
    unwrapNestedExpressions(owner.body) === unwrapNestedExpressions(node)
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
      unwrapNestedExpressions(returnStatement.argument) !==
      unwrapNestedExpressions(node)
    ) {
      return false;
    }

    const owningFunction = findOwningFunction(returnStatement);
    return owningFunction === owner;
  }

  const owningFunction = findOwningFunction(node.parent);
  return owningFunction === owner;
}

/**
 * Builds memoization suggestions with dependency placeholders for developers.
 * @param node Literal node to wrap.
 * @param descriptor Literal metadata including memo hook.
 * @param sourceCode Source code utility for text extraction.
 * @returns Suggestion array encouraging memoization with explicit deps TODO.
 */
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

/**
 * Formats a readable label for diagnostics based on the owning function.
 * @param fn Owning component or hook function.
 * @returns Human-friendly label for error messages.
 */
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
        'New {{literalType}} inside {{context}} is created on every render → Breaks referential stability for hooks/props and can re-run effects or re-render children → Hoist it to a module-level constant or wrap it in {{memoHook}} with the right dependencies.',
      nestedHookLiteral:
        'Nested {{literalType}} inside {{hookName}} arguments is recreated on every render → Dependency/reference comparisons change each time and defeat memoization/caching → Extract it into a memoized value (useMemo/useCallback) or hoist it to a module constant before passing it to {{hookName}}.',
      hookReturnLiteral:
        '{{hookName}} returns a {{literalType}} literal on each render → Callers receive a fresh reference and may re-render or re-run effects → Memoize the returned value with useMemo/useCallback or return pre-memoized pieces so callers see stable references.',
      memoizeLiteralSuggestion:
        'This {{literalType}} is created inline → It produces a new reference each render → Wrap it in {{memoHook}} and include every closed-over value in the dependency array.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * Checks whether a VariableDeclarator's sole usage is being thrown
     * in the same function scope.
     */
    function isVariableAlwaysThrown(
      declarator: TSESTree.VariableDeclarator,
    ): boolean {
      const variables = ASTHelpers.getDeclaredVariables(
        context as unknown as TSESLint.RuleContext<string, readonly unknown[]>,
        declarator,
      );
      if (variables.length === 0) {
        return false;
      }

      const variable = variables[0];
      const usages = variable.references.filter((ref) => !ref.init);

      // Variables with no usages (dead code) don't bypass memoization checks
      // because we can't prove the literal is thrown.
      if (usages.length === 0) {
        return false;
      }

      const owningFunction = findOwningFunction(declarator);

      return usages.every((ref) => {
        let refParent: TSESTree.Node | null = ref.identifier
          .parent as TSESTree.Node | null;

        while (refParent) {
          if (isFunctionNode(refParent)) {
            // Stop at function boundaries: throws inside nested functions don't
            // abort the outer render cycle, so they don't make the literal terminal
            // from the perspective of the declaring function.
            return false;
          }

          if (refParent.type === AST_NODE_TYPES.ThrowStatement) {
            // Found a throw in the same lexical scope as the usage.
            // Verify the throw is in the same function where the variable was declared
            // to ensure the throw terminates the render before memoization matters.
            let throwCheckParent: TSESTree.Node | null =
              refParent.parent as TSESTree.Node | null;
            while (throwCheckParent) {
              if (isFunctionNode(throwCheckParent)) {
                return throwCheckParent === owningFunction;
              }
              throwCheckParent = throwCheckParent.parent as TSESTree.Node | null;
            }
            return owningFunction === null;
          }

          if (refParent === declarator) {
            break;
          }

          refParent = refParent.parent as TSESTree.Node | null;
        }
        return false;
      });
    }

    /**
     * Checks whether a literal is destined to be thrown, making referential
     * stability irrelevant.
     */
    function isTerminalUsage(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
      // Tracks whether the literal passed through a node that represents non-container usage.
      // Once true, any throw we encounter won't count as "terminal" because the literal
      // is already used in an expression that might need memoization.
      let hasPassedForbiddenNode = false;

      while (current) {
        if (current.type === AST_NODE_TYPES.ThrowStatement) {
          return !hasPassedForbiddenNode;
        }

        if (
          current.type === AST_NODE_TYPES.VariableDeclarator &&
          current.id.type === AST_NODE_TYPES.Identifier &&
          current.init
        ) {
          if (!hasPassedForbiddenNode && isVariableAlwaysThrown(current)) {
            return true;
          }
        }

        // Stop at function boundaries as throws across functions are not "terminal"
        // in the same render cycle sense for the current component/hook.
        if (isFunctionNode(current)) {
          break;
        }

        // We distinguish between "containers" (nodes that build up an error value
        // or wrap an expression) and "usages" (nodes where the value is consumed
        // in a way that might benefit from memoization).
        //
        // Containers (NewExpression for errors, wrappers, or object/array builders)
        // are allowed because they are part of the path to a 'throw'.
        // Other nodes (like function calls or being a prop) mark the literal as
        // having a non-terminal usage.
        //
        // Note: AST_NODE_TYPES.CallExpression is intentionally excluded from allowed
        // containers. Passing a literal into a CallExpression allows the callee to
        // observe or store the reference, making its identity relevant even if
        // the result is eventually thrown (e.g., const err = fn({ ... }); throw err;).
        if (
          current.type !== AST_NODE_TYPES.ObjectExpression &&
          current.type !== AST_NODE_TYPES.Property &&
          current.type !== AST_NODE_TYPES.ArrayExpression &&
          current.type !== AST_NODE_TYPES.NewExpression &&
          !isExpressionWrapper(current)
        ) {
          hasPassedForbiddenNode = true;
        }

        current = current.parent as TSESTree.Node | null;
      }
      return false;
    }

    function reportLiteral(node: TSESTree.Node) {
      const descriptor = getLiteralDescriptor(node);
      if (!descriptor) return;

      const owner = findEnclosingComponentOrHook(node);
      if (!owner) return;

      if (isInsideAllowedHookCallback(node)) {
        return;
      }

      if (isTerminalUsage(node)) {
        return;
      }

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
      // Only emit auto-fix suggestions for simple variable initializers; other
      // contexts (returns, JSX props, nested expressions) risk unsafe rewrites.
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
