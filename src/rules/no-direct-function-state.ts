import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { declarationOf, resolveInEnclosingScopes } from '../utils/lexicalScope';

type Options = [
  {
    functionPatterns?: string[];
  },
];

type MessageIds = 'noDirectFunctionState';

const DEFAULT_FUNCTION_PATTERNS = [
  'callback',
  'handler',
  'fn',
  'func',
  'on[A-Z].*',
];

/**
 * The type alias a statement declares under `name`, looking through `export`.
 *
 * `export type ToClose = ...` is the same declaration one AST node deeper,
 * inside an `ExportNamedDeclaration`. Reading the statement without unwrapping
 * would make the `export` keyword alone decide whether the state's type is
 * readable, which says nothing about what the state holds.
 */
function typeAliasNamed(
  statement: TSESTree.Node,
  name: string,
): TSESTree.TSTypeAliasDeclaration | undefined {
  const declaration = declarationOf(statement);
  return declaration.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
    declaration.id.name === name
    ? declaration
    : undefined;
}

/**
 * Resolves a same-file `type X = ...` alias against every enclosing statement
 * container, innermost outward, so the nearest declaration shadows a
 * same-named outer one.
 *
 * Resolving lexically rather than from a map built off `Program.body` is what
 * lets an alias declared beside the hook that uses it — the more natural
 * spelling than hoisting it to file scope — be seen at all. It also keeps the
 * document-order independence the up-front scan was written for: every
 * statement of a container is searched, so an alias declared after the
 * `useState` call that references it still resolves, matching TypeScript's
 * hoisting of type declarations.
 */
function resolveTypeAlias(
  from: TSESTree.Node,
  name: string,
): TSESTree.TSTypeAliasDeclaration | undefined {
  return resolveInEnclosingScopes<TSESTree.TSTypeAliasDeclaration>(
    from,
    (statements) => {
      for (const statement of statements) {
        const alias = typeAliasNamed(statement, name);
        if (alias) {
          return alias;
        }
      }
      return undefined;
    },
  );
}

/**
 * Returns true if the TSTypeAnnotation node (from useState's type parameter)
 * represents a function type — either directly or as part of a union with
 * null/undefined. We check purely syntactically; no type-checker required.
 *
 * A `TSTypeReference` (e.g. `ToClose` in `useState<ToClose>`) is resolved
 * against same-file type aliases and recursed into, continuing the search from
 * the alias's own declaration so each hop of a chain resolves in its own
 * scope. Cross-file aliases (imported types) are syntactically unreachable and
 * are left unreported by this signal — the name-pattern and scope-binding
 * signals still apply. `visitedAliases` guards against infinite recursion on a
 * self-referential or mutually-recursive alias chain (`type A = B; type B = A;`).
 * It holds resolved declaration nodes rather than names, because one name can
 * denote different declarations in different scopes.
 */
function isFunctionTypeAnnotation(
  typeNode: TSESTree.TypeNode,
  resolveFrom: TSESTree.Node,
  visitedAliases: Set<TSESTree.Node> = new Set(),
): boolean {
  switch (typeNode.type) {
    case AST_NODE_TYPES.TSFunctionType:
    case AST_NODE_TYPES.TSConstructorType:
      return true;
    case AST_NODE_TYPES.TSUnionType:
      // Union like `(() => void) | null` — any member being a function type suffices
      return typeNode.types.some((member) =>
        isFunctionTypeAnnotation(member, resolveFrom, visitedAliases),
      );
    case AST_NODE_TYPES.TSTypeReference: {
      const { typeName } = typeNode;
      // Qualified names (`Foo.Bar`) aren't resolvable without a type checker
      if (typeName.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }
      const alias = resolveTypeAlias(resolveFrom, typeName.name);
      if (!alias || visitedAliases.has(alias)) {
        return false;
      }
      visitedAliases.add(alias);
      return isFunctionTypeAnnotation(
        alias.typeAnnotation,
        alias,
        visitedAliases,
      );
    }
    default:
      return false;
  }
}

/**
 * Checks whether a useState call expression has a type parameter that
 * includes a function type, e.g. useState<(() => void) | null>(null).
 *
 * `resolveFrom` anchors alias lookup at the declaration site so that an alias
 * local to the enclosing function or block is reachable.
 */
function useStateHasFunctionTypeParam(
  callNode: TSESTree.CallExpression,
  resolveFrom: TSESTree.Node,
): boolean {
  const typeParams = callNode.typeParameters;
  if (!typeParams || typeParams.params.length === 0) {
    return false;
  }
  return isFunctionTypeAnnotation(typeParams.params[0], resolveFrom);
}

/**
 * Returns true when the AST node is a safe value to pass to a setter — i.e.,
 * NOT a bare identifier or member expression that could be a function reference.
 * Arrow/function expressions are always safe (they are intentional).
 * Literals, null, undefined, call expressions, arrays, objects are all safe.
 */
function isDefinitelySafeArg(node: TSESTree.Node): boolean {
  switch (node.type) {
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression:
      // Inline function/arrow — always intentional (updater or thunk)
      return true;
    case AST_NODE_TYPES.Literal:
      // Literal values (numbers, strings, booleans, null, regex)
      return true;
    case AST_NODE_TYPES.TemplateLiteral:
      return true;
    case AST_NODE_TYPES.Identifier:
      // `undefined` is safe; generic identifiers may be function refs
      return node.name === 'undefined';
    case AST_NODE_TYPES.UnaryExpression:
      // `void 0`, `!flag`, `typeof x` etc. — all non-function values
      return true;
    case AST_NODE_TYPES.BinaryExpression:
      // `a + b`, `a * b`, etc. — never callable
      return true;
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
      // Call/new expressions — return value unknown without types; skip (no FP)
      return true;
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.ObjectExpression:
      return true;
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
      // Unwrap type assertions and recurse
      return isDefinitelySafeArg(
        (
          node as
            | TSESTree.TSAsExpression
            | TSESTree.TSTypeAssertion
            | TSESTree.TSNonNullExpression
        ).expression,
      );
    default:
      // MemberExpression, Identifier (non-undefined), etc. are NOT definitely safe
      return false;
  }
}

/**
 * Checks whether an identifier name matches any of the function-naming patterns
 * (e.g. onClose, handler, fn, callback).
 */
function matchesFunctionPattern(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(name)) {
        return true;
      }
    } catch {
      // Ignore invalid regex patterns
    }
  }
  return false;
}

/**
 * Extracts the identifier name from an argument node for pattern matching.
 * For MemberExpression like `obj.handler`, returns `handler`.
 * For Identifier like `myCallback`, returns `myCallback`.
 */
function getArgName(node: TSESTree.Node): string | null {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    const prop = node.property;
    if (prop.type === AST_NODE_TYPES.Identifier && !node.computed) {
      return prop.name;
    }
  }
  return null;
}

/**
 * Walks up the scope to find if an identifier is bound (in scope) to a
 * function — an arrow function expression or function expression/declaration.
 * This covers: `const x = () => ...` and `function x() {...}`.
 */
function isIdentifierBoundToFunction(
  name: string,
  scope: TSESLint.Scope.Scope,
): boolean {
  let currentScope: typeof scope | null = scope;
  while (currentScope) {
    for (const variable of currentScope.variables) {
      if (variable.name !== name) continue;
      for (const def of variable.defs) {
        if (
          def.type === 'Variable' &&
          def.node.init &&
          (def.node.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            def.node.init.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          return true;
        }
        if (
          def.type === 'FunctionName' ||
          def.type === 'ImplicitGlobalVariable'
        ) {
          return true;
        }
      }
    }
    currentScope = currentScope.upper;
  }
  return false;
}

export const noDirectFunctionState = createRule<Options, MessageIds>({
  name: 'no-direct-function-state',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent passing a function directly to a useState setter — React will invoke it as a functional updater instead of storing it. Wrap in a thunk: setState(() => fn).',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          functionPatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_FUNCTION_PATTERNS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noDirectFunctionState:
        'What\'s wrong: "{{argText}}" is passed directly to "{{setterName}}", but React invokes a function argument as a functional updater (prev => next) instead of storing it. ' +
        'Why it matters: The function will be called with the previous state value and its return value stored — a silent bug with no error. ' +
        'How to fix: Wrap it in a thunk so React stores the function as a value: {{setterName}}(() => {{argText}})',
    },
  },
  defaultOptions: [{ functionPatterns: DEFAULT_FUNCTION_PATTERNS }],
  create(context) {
    const options = context.options[0] ?? {};
    const functionPatterns: string[] =
      options.functionPatterns ?? DEFAULT_FUNCTION_PATTERNS;

    /**
     * Maps setter-variable names to whether the corresponding useState has
     * an explicit function type parameter. This is populated as we encounter
     * useState array-destructuring declarations.
     */
    const setterFunctionTyped = new Map<string, boolean>();

    return {
      VariableDeclarator(node) {
        // Look for `const [state, setter] = useState<T>(...)` or
        // `const [state, setter] = React.useState<T>(...)`.
        if (
          node.id.type !== AST_NODE_TYPES.ArrayPattern ||
          !node.init ||
          node.init.type !== AST_NODE_TYPES.CallExpression
        ) {
          return;
        }

        const callNode = node.init;
        const callee = callNode.callee;

        const isUseStateCall =
          (callee.type === AST_NODE_TYPES.Identifier &&
            callee.name === 'useState') ||
          (callee.type === AST_NODE_TYPES.MemberExpression &&
            callee.property.type === AST_NODE_TYPES.Identifier &&
            callee.property.name === 'useState');

        if (!isUseStateCall) return;

        // The setter is the second element of the destructured array
        const elements = node.id.elements;
        if (elements.length < 2) return;

        const setterElement = elements[1];
        if (
          !setterElement ||
          setterElement.type !== AST_NODE_TYPES.Identifier
        ) {
          return;
        }

        const setterName = setterElement.name;
        const hasFunctionType = useStateHasFunctionTypeParam(callNode, node);
        setterFunctionTyped.set(setterName, hasFunctionType);
      },

      CallExpression(node) {
        // We are looking for calls like `setter(arg)` where:
        // 1. setter is known (tracked from useState destructuring), AND
        //    - the useState type is function-typed, OR
        //    - the arg name matches a function pattern, OR
        //    - the arg is bound to a function in scope
        // 2. The arg is NOT already a safe value (arrow/function expr, literal, etc.)

        const callee = node.callee;
        if (callee.type !== AST_NODE_TYPES.Identifier) return;

        const setterName = callee.name;

        // Only flag calls to tracked setters
        if (!setterFunctionTyped.has(setterName)) return;

        // Only consider single-argument calls (setters take exactly one value arg)
        if (node.arguments.length !== 1) return;

        const arg = node.arguments[0];

        // SpreadElement is not a plain expression; skip
        if (arg.type === AST_NODE_TYPES.SpreadElement) return;

        // If arg is a definitely-safe type (inline arrow, literal, undefined, etc.),
        // skip without further checks
        if (isDefinitelySafeArg(arg)) return;

        // At this point arg is an Identifier (non-undefined) or MemberExpression.
        // Decide whether it is a function reference.

        const isFunctionTypedState =
          setterFunctionTyped.get(setterName) === true;

        if (isFunctionTypedState) {
          // Type annotation says the state holds a function — any bare
          // identifier or member expression is suspect.
          reportAndFix(node, arg, setterName, context);
          return;
        }

        // No explicit function type. Fall back to heuristic: name pattern match
        // or scope-level binding to a function.
        const argName = getArgName(arg);

        if (argName && matchesFunctionPattern(argName, functionPatterns)) {
          reportAndFix(node, arg, setterName, context);
          return;
        }

        // Check if the identifier is bound to a function in scope
        if (
          arg.type === AST_NODE_TYPES.Identifier &&
          arg.name !== 'undefined'
        ) {
          const scope = context.getScope();
          if (isIdentifierBoundToFunction(arg.name, scope)) {
            reportAndFix(node, arg, setterName, context);
            return;
          }
        }
      },
    };
  },
});

function reportAndFix(
  callNode: TSESTree.CallExpression,
  arg: TSESTree.CallExpressionArgument,
  setterName: string,
  context: Parameters<typeof noDirectFunctionState['create']>[0],
): void {
  const sourceCode = context.getSourceCode();
  const argText = sourceCode.getText(arg);

  context.report({
    node: callNode,
    messageId: 'noDirectFunctionState',
    data: {
      argText,
      setterName,
    },
    fix(fixer) {
      return fixer.replaceText(arg, `() => ${argText}`);
    },
  });
}
