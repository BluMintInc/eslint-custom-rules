import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { declarationOf, resolveInEnclosingScopes } from '../utils/lexicalScope';

type Options = [
  {
    functionPatterns?: string[];
  },
];

type MessageIds =
  | 'noDirectFunctionState'
  | 'noDirectFunctionStateAssertion'
  | 'invalidFunctionPattern';

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
 * The expression a runtime-transparent wrapper stands in for.
 *
 * `a?.b` parses as a `ChainExpression` around the member read, and `x as T`,
 * `<T>x`, `x satisfies T`, `x!` and `fn<T>` each wrap their operand in a node
 * that is erased before execution. Every one of them evaluates to exactly what
 * its operand evaluates to, so a question about what a setter argument *is* has
 * to be asked of the operand — asking the wrapper answers about the wrapper and
 * silently loses the argument, in whichever direction the caller's default
 * happens to point.
 *
 * Recursive because the wrappers stack: `props?.onClose as any` is a
 * `TSAsExpression` over a `ChainExpression` over the member read.
 */
function unwrapTransparent(node: TSESTree.Node): TSESTree.Node {
  switch (node.type) {
    case AST_NODE_TYPES.ChainExpression:
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSInstantiationExpression:
      return unwrapTransparent(node.expression);
    default:
      return node;
  }
}

/**
 * Whether wrapping this argument in a thunk would leave an arrow whose body is
 * a type assertion.
 *
 * `no-type-assertion-returns` is `error` in the same recommended config and
 * reports exactly that shape, so emitting `setX(() => props.onClose as any)`
 * would trade one error for another and leave `eslint --fix` non-converging.
 * Moving the assertion outside the thunk instead — `(() => x) as T` — is not an
 * option either: it asserts a different value, and for a `T` that is neither
 * assignable to nor from `() => T` it does not even compile. So the report
 * stands without a fix and names the hoist that does converge (verified end to
 * end under the whole recommended config).
 *
 * Only a top-level assertion matters. An assertion nested inside the argument
 * (`(props as any).onClose`) leaves the thunk returning a member read, which
 * that rule exempts.
 */
function thunkWouldReturnAssertion(arg: TSESTree.Node): boolean {
  return (
    arg.type === AST_NODE_TYPES.TSAsExpression ||
    arg.type === AST_NODE_TYPES.TSTypeAssertion
  );
}

/**
 * Returns true when the AST node is a safe value to pass to a setter — i.e.,
 * NOT a bare identifier or member expression that could be a function reference.
 * Arrow/function expressions are always safe (they are intentional).
 * Literals, null, undefined, call expressions, arrays, objects are all safe.
 *
 * The argument is unwrapped first so the carve-outs below are decided by what
 * actually reaches the setter. Without it a wrapped argument falls to the
 * `default` arm, which is the *unsafe* verdict — so `factory?.build()` would
 * lose the deliberate CallExpression exemption and be rewritten into
 * `() => factory?.build()`, deferring the call into a React updater.
 */
function isDefinitelySafeArg(argNode: TSESTree.Node): boolean {
  const node = unwrapTransparent(argNode);
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
    default:
      // MemberExpression, Identifier (non-undefined), etc. are NOT definitely safe
      return false;
  }
}

/**
 * Compiles the configured function-naming patterns once, separating the ones
 * that do not compile from the ones that do.
 *
 * Swallowing an uncompilable pattern makes the consumer's allowlist silently
 * inert: the rule then reports the very code they wrote the pattern to exclude,
 * with nothing anywhere saying why. Returning the rejects lets `create` report
 * them, which is what the sibling pattern-compiling rules already do.
 */
function compileFunctionPatterns(patterns: string[]): {
  matchers: RegExp[];
  invalid: string[];
} {
  const matchers: RegExp[] = [];
  const invalid: string[] = [];
  for (const pattern of patterns) {
    try {
      matchers.push(new RegExp(`^${pattern}$`));
    } catch {
      invalid.push(pattern);
    }
  }
  return { matchers, invalid };
}

/**
 * Checks whether an identifier name matches any of the function-naming patterns
 * (e.g. onClose, handler, fn, callback).
 */
function matchesFunctionPattern(name: string, matchers: RegExp[]): boolean {
  return matchers.some((matcher) => matcher.test(name));
}

/**
 * Extracts the identifier name from an argument node for pattern matching.
 * For MemberExpression like `obj.handler`, returns `handler`.
 * For Identifier like `myCallback`, returns `myCallback`.
 *
 * The argument is unwrapped first: `props?.onClose` and `props.onClose as any`
 * name the same property as `props.onClose`. Under an untyped `useState` the
 * name pattern is the only live signal, so returning `null` for a wrapped
 * argument silences the rule entirely rather than merely weakening it.
 */
function getArgName(argNode: TSESTree.Node): string | null {
  const node = unwrapTransparent(argNode);
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
      noDirectFunctionStateAssertion:
        'What\'s wrong: "{{argText}}" is passed directly to "{{setterName}}", but React invokes a function argument as a functional updater (prev => next) instead of storing it. ' +
        'Why it matters: The function will be called with the previous state value and its return value stored — a silent bug with no error. ' +
        'How to fix: Give the asserted value a name, then store that name through a thunk: const value = {{argText}}; {{setterName}}(() => value). ' +
        'The assertion is hoisted out because a thunk that returned it would be an arrow returning a cast, which no-type-assertion-returns reports.',
      invalidFunctionPattern:
        'What\u2019s wrong: "{{pattern}}" in functionPatterns is not a valid regular expression, so it was dropped. ' +
        'Why it matters: the rule silently stops honouring that entry, and reports the very code the pattern was written to exclude. ' +
        'How to fix: correct the pattern in your ESLint configuration.',
    },
  },
  defaultOptions: [{ functionPatterns: DEFAULT_FUNCTION_PATTERNS }],
  create(context) {
    const options = context.options[0] ?? {};
    const functionPatterns: string[] =
      options.functionPatterns ?? DEFAULT_FUNCTION_PATTERNS;
    const { matchers: functionPatternMatchers, invalid: invalidPatterns } =
      compileFunctionPatterns(functionPatterns);

    /**
     * Maps setter-variable names to whether the corresponding useState has
     * an explicit function type parameter. This is populated as we encounter
     * useState array-destructuring declarations.
     */
    const setterFunctionTyped = new Map<string, boolean>();

    return {
      Program(node) {
        for (const pattern of invalidPatterns) {
          context.report({
            node,
            messageId: 'invalidFunctionPattern',
            data: { pattern },
          });
        }
      },
      VariableDeclarator(node) {
        // Look for `const [state, setter] = useState<T>(...)` or
        // `const [state, setter] = React.useState<T>(...)`.
        if (node.id.type !== AST_NODE_TYPES.ArrayPattern || !node.init) {
          return;
        }

        // `React?.useState(...)` and `useState?.(...)` wrap the call in a
        // ChainExpression. Reading `init` without unwrapping registers no
        // setter, which blinds every setter call in the file rather than just
        // this declaration.
        const init = unwrapTransparent(node.init);
        if (init.type !== AST_NODE_TYPES.CallExpression) {
          return;
        }

        const callNode = init;
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

        // At this point arg is an Identifier (non-undefined) or MemberExpression,
        // possibly behind transparent wrappers (`?.`, `as`, `!`).
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

        if (
          argName &&
          matchesFunctionPattern(argName, functionPatternMatchers)
        ) {
          reportAndFix(node, arg, setterName, context);
          return;
        }

        // Check if the identifier is bound to a function in scope. This reads
        // the same argument the two signals above do, so it has to see through
        // the same wrappers: `myCallback!` still references `myCallback`.
        const unwrappedArg = unwrapTransparent(arg);
        if (
          unwrappedArg.type === AST_NODE_TYPES.Identifier &&
          unwrappedArg.name !== 'undefined'
        ) {
          const scope = context.getScope();
          if (isIdentifierBoundToFunction(unwrappedArg.name, scope)) {
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
  const returnsAssertion = thunkWouldReturnAssertion(arg);

  context.report({
    node: callNode,
    messageId: returnsAssertion
      ? 'noDirectFunctionStateAssertion'
      : 'noDirectFunctionState',
    data: {
      argText,
      setterName,
    },
    fix(fixer) {
      if (returnsAssertion) {
        return null;
      }
      return fixer.replaceText(arg, `() => ${argText}`);
    },
  });
}
