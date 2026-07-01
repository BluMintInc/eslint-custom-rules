import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';

type Options = [
  {
    targetPaths?: string[];
  },
];

type MessageIds =
  | 'preferUseBase62IdHook'
  | 'preferUseBase62IdTopLevel'
  | 'preferUseBase62IdUseMemo';

const DEFAULT_TARGET_PATHS = [
  'src/hooks/**',
  'src/contexts/**',
  'src/pages/**',
  'src/components/**',
];

/**
 * Returns true when the given source path ends with "util/uuidv4Base62",
 * covering both relative and absolute import forms used in the BluMint monorepo.
 */
function isUuidv4Base62Source(source: string): boolean {
  // Strip any file extension the bundler may have appended
  const normalized = source.replace(/\.(js|ts|tsx|jsx|mjs|cjs)$/, '');
  return (
    normalized === 'uuidv4Base62' ||
    normalized.endsWith('/uuidv4Base62') ||
    normalized.endsWith('\\uuidv4Base62')
  );
}

/**
 * Returns true when the function name matches the React hook naming convention:
 * starts with "use" followed by an uppercase letter.
 */
function isHookName(name: string): boolean {
  return /^use[A-Z]/.test(name);
}

/**
 * Returns true when the name is PascalCase (starts with uppercase letter),
 * which is the naming convention for React components.
 */
function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * Checks whether a node is a React component or hook function.
 * Hooks: function whose name starts with "use" followed by an uppercase letter.
 * Components: function with a PascalCase name.
 */
function isComponentOrHook(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): boolean {
  // FunctionDeclaration: function MyComponent() {} or function useHook() {}
  if (node.type === AST_NODE_TYPES.FunctionDeclaration && node.id) {
    return isPascalCase(node.id.name) || isHookName(node.id.name);
  }

  // FunctionExpression or ArrowFunctionExpression assigned to a variable:
  // const MyComponent = () => {} or const useHook = () => {}
  const parent = node.parent;
  if (parent?.type === AST_NODE_TYPES.VariableDeclarator) {
    const id = parent.id;
    if (id.type === AST_NODE_TYPES.Identifier) {
      return isPascalCase(id.name) || isHookName(id.name);
    }
  }

  return false;
}

/**
 * Recursively searches the given node tree for any CallExpression that calls
 * one of the tracked uuidv4Base62 local names.
 */
function containsUuidv4Base62Call(
  node: TSESTree.Node | null | undefined,
  trackedNames: Set<string>,
): boolean {
  if (!node) return false;
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    trackedNames.has(node.callee.name)
  ) {
    return true;
  }
  // Walk child nodes
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const child = (node as unknown as Record<string, unknown>)[key];
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) {
        for (const item of child) {
          if (
            item &&
            typeof item === 'object' &&
            'type' in item &&
            containsUuidv4Base62Call(item as TSESTree.Node, trackedNames)
          ) {
            return true;
          }
        }
      } else if (
        'type' in child &&
        containsUuidv4Base62Call(child as TSESTree.Node, trackedNames)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns true when the argument to useRef contains uuidv4Base62() anywhere
 * in its expression tree (direct call or inside a larger expression).
 */
function useRefArgContainsUuid(
  callNode: TSESTree.CallExpression,
  trackedNames: Set<string>,
): boolean {
  if (callNode.arguments.length === 0) return false;
  return containsUuidv4Base62Call(callNode.arguments[0], trackedNames);
}

/**
 * For a useState call, returns the argument node that contains uuidv4Base62()
 * (either the direct first arg or the body of the first arrow function arg).
 * Returns null when uuidv4Base62() is not found.
 */
function getUseStateUuidArg(
  callNode: TSESTree.CallExpression,
  trackedNames: Set<string>,
): TSESTree.Node | null {
  if (callNode.arguments.length === 0) return null;
  const arg = callNode.arguments[0];

  // Direct call: useState(uuidv4Base62()) or useState(expr ?? uuidv4Base62())
  if (containsUuidv4Base62Call(arg, trackedNames)) return arg;

  // Lazy initializer: useState(() => uuidv4Base62()) or useState(() => { return ...; })
  if (
    arg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    arg.type === AST_NODE_TYPES.FunctionExpression
  ) {
    if (containsUuidv4Base62Call(arg.body, trackedNames)) return arg.body;
  }

  return null;
}

/**
 * Returns true when the useMemo call has an empty dependency array as its
 * second argument.
 */
function hasEmptyDepsArray(callNode: TSESTree.CallExpression): boolean {
  if (callNode.arguments.length < 2) return false;
  const deps = callNode.arguments[1];
  return (
    deps.type === AST_NODE_TYPES.ArrayExpression && deps.elements.length === 0
  );
}

/**
 * Checks whether the given identifier (the ref variable name) has its
 * `.current` property assigned anywhere in the enclosing function body.
 * This mirrors the useState setter-usage heuristic for useRef.
 */
function isRefCurrentReassigned(
  refName: string,
  functionBody: TSESTree.Node,
): boolean {
  let found = false;

  function walk(node: TSESTree.Node | null | undefined): void {
    if (!node || found) return;

    // Look for `refName.current = ...`
    if (
      node.type === AST_NODE_TYPES.AssignmentExpression &&
      node.left.type === AST_NODE_TYPES.MemberExpression &&
      !node.left.computed &&
      node.left.object.type === AST_NODE_TYPES.Identifier &&
      node.left.object.name === refName &&
      node.left.property.type === AST_NODE_TYPES.Identifier &&
      node.left.property.name === 'current'
    ) {
      found = true;
      return;
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && 'type' in item) {
              walk(item as TSESTree.Node);
            }
          }
        } else if ('type' in child) {
          walk(child as TSESTree.Node);
        }
      }
    }
  }

  walk(functionBody);
  return found;
}

export const preferUseBase62Id = createRule<Options, MessageIds>({
  name: 'prefer-use-base62-id',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer `useBase62Id()` over `uuidv4Base62()` inside useState/useRef/useMemo for stable component IDs to avoid SSR hydration mismatches',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          targetPaths: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_TARGET_PATHS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferUseBase62IdHook:
        "Prefer `useBase62Id()` from 'src/hooks/useBase62Id' for stable component IDs. `uuidv4Base62()` uses crypto.getRandomValues() which causes SSR hydration mismatches. `useBase62Id()` is deterministic across server and client rendering.",
      preferUseBase62IdUseMemo:
        "Prefer `useBase62Id()` from 'src/hooks/useBase62Id' for stable component IDs. `useMemo(() => uuidv4Base62(), [])` with an empty dependency array is functionally equivalent to `useState(() => uuidv4Base62())` and causes SSR hydration mismatches. Use `useBase62Id()` instead.",
      preferUseBase62IdTopLevel:
        'Calling `uuidv4Base62()` at the top level of a component regenerates the ID on every render. Use `useBase62Id()` for a stable ID, or move the call inside a callback for per-operation uniqueness.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const targetPaths: string[] = options.targetPaths ?? DEFAULT_TARGET_PATHS;

    // Check whether the current file is inside a target path
    const filename = context.getFilename();
    const isInTargetPath = targetPaths.some((pattern) =>
      minimatch(filename, pattern, { matchBase: false }),
    );
    if (!isInTargetPath) return {};

    // Local names bound to the uuidv4Base62 export in the current file
    const trackedUuidNames = new Set<string>();

    /**
     * Pending useState calls to evaluate at Program:exit.
     * We must defer the setter-usage check until the full AST is available.
     */
    type PendingUseState = {
      callNode: TSESTree.CallExpression;
      setterName: string | null;
      /** True when the array pattern omits the setter entirely, e.g. const [id] = useState(...) */
      noSetterDestructured: boolean;
    };
    const pendingUseStateCalls: PendingUseState[] = [];

    /**
     * Pending useRef calls: { callNode, refName }.
     * Ref reassignment (`ref.current = ...`) is also checked at Program:exit.
     */
    type PendingUseRef = {
      callNode: TSESTree.CallExpression;
      refName: string | null;
      functionBody: TSESTree.Node | null;
    };
    const pendingUseRefCalls: PendingUseRef[] = [];

    /**
     * Finds the enclosing React component or hook function body for a given
     * AST node, walking up the parent chain.
     */
    function getEnclosingComponentOrHookBody(
      node: TSESTree.Node,
    ): TSESTree.Node | null {
      let current: TSESTree.Node | undefined = node.parent;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          if (
            isComponentOrHook(
              current as
                | TSESTree.FunctionDeclaration
                | TSESTree.FunctionExpression
                | TSESTree.ArrowFunctionExpression,
            )
          ) {
            return current.type === AST_NODE_TYPES.ArrowFunctionExpression
              ? current.body
              : (
                  current as
                    | TSESTree.FunctionDeclaration
                    | TSESTree.FunctionExpression
                ).body;
          }
          // A non-component/hook function boundary — stop searching, we're
          // inside a nested callback or event handler.
          return null;
        }
        current = current.parent;
      }
      return null;
    }

    /**
     * Returns the depth at which the immediate parent is a React component or
     * hook function body, ignoring expression-statement wrappers. Specifically,
     * returns true when the node's parent chain is:
     *   ComponentOrHookBody → [ExpressionStatement] → VariableDeclaration → node
     * i.e. the call is a direct statement inside the component body (not nested
     * in a callback, effect, or hook call argument).
     */
    function isDirectChildOfComponentBody(
      callNode: TSESTree.CallExpression,
    ): boolean {
      // Walk up past VariableDeclarator → VariableDeclaration → ...
      let current: TSESTree.Node | undefined = callNode.parent;

      // Allow: CallExpression is the init of a VariableDeclarator
      if (current?.type !== AST_NODE_TYPES.VariableDeclarator) return false;
      current = current.parent;
      if (current?.type !== AST_NODE_TYPES.VariableDeclaration) return false;
      current = current.parent;
      if (current?.type === AST_NODE_TYPES.ExpressionStatement) {
        current = current.parent;
      }

      // The parent must be a block that belongs to a component or hook
      if (current?.type !== AST_NODE_TYPES.BlockStatement) return false;
      const block = current;
      const functionNode = block.parent;
      if (!functionNode) return false;
      if (
        functionNode.type === AST_NODE_TYPES.FunctionDeclaration ||
        functionNode.type === AST_NODE_TYPES.FunctionExpression ||
        functionNode.type === AST_NODE_TYPES.ArrowFunctionExpression
      ) {
        return isComponentOrHook(
          functionNode as
            | TSESTree.FunctionDeclaration
            | TSESTree.FunctionExpression
            | TSESTree.ArrowFunctionExpression,
        );
      }
      return false;
    }

    /**
     * Returns true when the given CallExpression to useState/useRef/useMemo is
     * a direct top-level statement inside a React component or hook body
     * (i.e. not nested inside another hook's callback argument, useEffect, etc.).
     * Walking upward, the first function boundary we hit determines the answer:
     * if it is a component or hook → true; otherwise → false.
     */
    function isAtComponentTopLevel(callNode: TSESTree.CallExpression): boolean {
      let current: TSESTree.Node | undefined = callNode.parent;

      while (current) {
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          // The first enclosing function boundary determines whether we are at
          // the component/hook top level. If it is not a component or hook (e.g.
          // a callback, effect, or event handler), the call is nested and should
          // not be flagged.
          return isComponentOrHook(
            current as
              | TSESTree.FunctionDeclaration
              | TSESTree.FunctionExpression
              | TSESTree.ArrowFunctionExpression,
          );
        }

        current = current.parent;
      }

      return false;
    }

    return {
      ImportDeclaration(node) {
        if (!isUuidv4Base62Source(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === AST_NODE_TYPES.ImportSpecifier &&
            specifier.imported.type === AST_NODE_TYPES.Identifier &&
            specifier.imported.name === 'uuidv4Base62'
          ) {
            // Track the local alias (e.g. import { uuidv4Base62 as uuid } ...)
            trackedUuidNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (trackedUuidNames.size === 0) return;

        const callee = node.callee;
        if (callee.type !== AST_NODE_TYPES.Identifier) return;

        // --- Pattern 3: useMemo(() => uuidv4Base62(), []) ---
        if (callee.name === 'useMemo') {
          if (!hasEmptyDepsArray(node)) return;
          const firstArg = node.arguments[0];
          if (
            !firstArg ||
            (firstArg.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
              firstArg.type !== AST_NODE_TYPES.FunctionExpression)
          ) {
            return;
          }
          if (!containsUuidv4Base62Call(firstArg.body, trackedUuidNames)) {
            return;
          }
          if (!isAtComponentTopLevel(node)) return;
          context.report({
            node,
            messageId: 'preferUseBase62IdUseMemo',
          });
          return;
        }

        // --- Pattern 1: useState(uuidv4Base62()) or useState(() => uuidv4Base62()) ---
        if (callee.name === 'useState') {
          if (!isAtComponentTopLevel(node)) return;
          const uuidArg = getUseStateUuidArg(node, trackedUuidNames);
          if (!uuidArg) return;

          // Inspect parent to determine setter destructuring
          const parent = node.parent;
          let setterName: string | null = null;
          let noSetterDestructured = false;

          if (
            parent?.type === AST_NODE_TYPES.VariableDeclarator &&
            parent.id.type === AST_NODE_TYPES.ArrayPattern
          ) {
            const elements = parent.id.elements;
            if (elements.length >= 2 && elements[1]) {
              // Setter is present in destructuring
              const setter = elements[1];
              if (setter.type === AST_NODE_TYPES.Identifier) {
                setterName = setter.name;
              } else {
                // Non-identifier setter (e.g. rest, pattern): conservatively skip
                return;
              }
            } else {
              // Only value destructured, no setter: `const [id] = useState(...)`
              noSetterDestructured = true;
            }
          } else if (
            parent?.type === AST_NODE_TYPES.VariableDeclarator &&
            parent.id.type === AST_NODE_TYPES.Identifier
          ) {
            // const state = useState(...) — no destructuring, no setter reference
            noSetterDestructured = true;
          } else {
            // useState not assigned to a variable — treat as no setter
            noSetterDestructured = true;
          }

          pendingUseStateCalls.push({
            callNode: node,
            setterName,
            noSetterDestructured,
          });
          return;
        }

        // --- Pattern 2: useRef(uuidv4Base62()) ---
        if (callee.name === 'useRef') {
          if (!isAtComponentTopLevel(node)) return;
          if (!useRefArgContainsUuid(node, trackedUuidNames)) return;

          // Find the variable name assigned to the ref
          const parent = node.parent;
          let refName: string | null = null;
          if (
            parent?.type === AST_NODE_TYPES.VariableDeclarator &&
            parent.id.type === AST_NODE_TYPES.Identifier
          ) {
            refName = parent.id.name;
          }

          const functionBody = getEnclosingComponentOrHookBody(node);

          pendingUseRefCalls.push({
            callNode: node,
            refName,
            functionBody,
          });
          return;
        }

        // --- Pattern 4: bare top-level uuidv4Base62() call ---
        if (trackedUuidNames.has(callee.name)) {
          if (!isDirectChildOfComponentBody(node)) return;
          context.report({
            node,
            messageId: 'preferUseBase62IdTopLevel',
          });
        }
      },

      'Program:exit'() {
        // Evaluate pending useState calls
        for (const pending of pendingUseStateCalls) {
          const { callNode, setterName, noSetterDestructured } = pending;

          if (noSetterDestructured) {
            // No setter — always flag
            context.report({
              node: callNode,
              messageId: 'preferUseBase62IdHook',
            });
            continue;
          }

          if (setterName === null) continue;

          // Check whether the setter identifier is referenced anywhere in the
          // file beyond its destructuring site
          const scope = context.getScope();

          // Walk up to Program scope
          let programScope = scope;
          while (programScope.upper) {
            programScope = programScope.upper;
          }

          // Find the variable for the setter
          function findVarInScope(
            searchScope: typeof scope,
            name: string,
          ): boolean {
            for (const variable of searchScope.variables) {
              if (variable.name === name) {
                // References beyond the definition itself indicate usage
                const usageRefs = variable.references.filter(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (ref) => !ref.isWrite() || !(ref as any).init,
                );
                return usageRefs.length > 0;
              }
            }
            for (const childScope of searchScope.childScopes) {
              if (findVarInScope(childScope, name)) return true;
            }
            return false;
          }

          const setterIsUsed = findVarInScope(programScope, setterName);

          if (!setterIsUsed) {
            context.report({
              node: callNode,
              messageId: 'preferUseBase62IdHook',
            });
          }
        }

        // Evaluate pending useRef calls
        for (const pending of pendingUseRefCalls) {
          const { callNode, refName, functionBody } = pending;

          if (!refName || !functionBody) {
            // Cannot determine ref name or body — flag conservatively
            context.report({
              node: callNode,
              messageId: 'preferUseBase62IdHook',
            });
            continue;
          }

          if (!isRefCurrentReassigned(refName, functionBody)) {
            context.report({
              node: callNode,
              messageId: 'preferUseBase62IdHook',
            });
          }
        }
      },
    };
  },
});
