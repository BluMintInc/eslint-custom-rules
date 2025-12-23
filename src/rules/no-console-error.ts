import { minimatch } from 'minimatch';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    ignorePatterns?: string[];
    allowWithUseAlertDialog?: boolean;
  },
];

type MessageIds = 'noConsoleError';

const defaultIgnorePatterns = [
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/__playwright__/**',
  '**/scripts/**',
  '**/electron/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
];

const normalizeFilename = (filename: string) => filename.replace(/\\/g, '/');

const createFileIgnorePredicate = (options: Options[0]) => {
  const ignorePatterns = [
    ...defaultIgnorePatterns,
    ...(options?.ignorePatterns ?? []),
  ];

  return (filename: string) => {
    const normalizedFilename = normalizeFilename(filename);

    return (
      normalizedFilename &&
      !normalizedFilename.startsWith('<') &&
      ignorePatterns.some((pattern) =>
        minimatch(normalizedFilename, pattern, { dot: true }),
      )
    );
  };
};

const unwrapChainExpression = <T extends TSESTree.Node>(
  node: T | TSESTree.ChainExpression | null | undefined,
): T | null => {
  if (!node) {
    return null;
  }
  if (node.type === AST_NODE_TYPES.ChainExpression) {
    return node.expression as T;
  }
  return node;
};

const findVariable = (
  scope: TSESLint.Scope.Scope | null,
  name: string,
): TSESLint.Scope.Variable | null => {
  let current: TSESLint.Scope.Scope | null = scope;
  while (current) {
    const variable = current.variables.find((v) => v.name === name);
    if (variable) {
      return variable;
    }
    current = current.upper;
  }
  return null;
};

const isErrorKey = (
  key: TSESTree.Expression | TSESTree.PrivateIdentifier,
  computed: boolean,
) => {
  if (!computed && key.type === AST_NODE_TYPES.Identifier) {
    return key.name === 'error';
  }

  if (computed) {
    if (key.type === AST_NODE_TYPES.Literal && key.value === 'error') {
      return true;
    }

    if (
      key.type === AST_NODE_TYPES.TemplateLiteral &&
      key.expressions.length === 0 &&
      key.quasis.length === 1 &&
      key.quasis[0].value.raw === 'error'
    ) {
      return true;
    }
  }

  return false;
};

const getLocalNameFromPattern = (target: TSESTree.Node): string | null => {
  if (target.type === AST_NODE_TYPES.Identifier) {
    return target.name;
  }

  if (
    target.type === AST_NODE_TYPES.AssignmentPattern &&
    target.left.type === AST_NODE_TYPES.Identifier
  ) {
    return target.left.name;
  }

  return null;
};

const findDeclaredVariableByName = (
  name: string,
  variables: readonly TSESLint.Scope.Variable[],
) => variables.find((variable) => variable.name === name);

class AliasTracker {
  private consoleAliases = new Set<TSESLint.Scope.Variable>();
  private errorAliases = new Set<TSESLint.Scope.Variable>();

  /**
   * Tracks that a variable refers to the console object so member accesses like
   * `alias.error(...)` can be treated as console.error calls.
   *
   * This untracks the variable as an error alias to keep alias sets mutually
   * exclusive when reassignment occurs.
   */
  markConsole(variable: TSESLint.Scope.Variable | null | undefined) {
    if (!variable) {
      return;
    }
    this.consoleAliases.add(variable);
    this.errorAliases.delete(variable);
  }

  /**
   * Tracks that a variable refers to console.error so identifier calls like
   * `err(...)` can be treated as console.error calls.
   *
   * This untracks the variable as a console alias to keep alias sets mutually
   * exclusive when reassignment occurs.
   */
  markError(variable: TSESLint.Scope.Variable | null | undefined) {
    if (!variable) {
      return;
    }
    this.errorAliases.add(variable);
    this.consoleAliases.delete(variable);
  }

  /**
   * Stops tracking a variable as either a console alias or an error alias.
   *
   * This is used when a previously tracked variable is reassigned to a
   * non-console target, so later calls are not mis-attributed to console.error.
   */
  untrack(variable: TSESLint.Scope.Variable | null | undefined) {
    if (!variable) {
      return;
    }
    this.consoleAliases.delete(variable);
    this.errorAliases.delete(variable);
  }

  /**
   * Treats an identifier as console when it is either the global `console`, or a
   * tracked alias in the active scope chain.
   *
   * Shadowed `console` bindings are intentionally treated as non-console unless
   * the binding is explicitly tracked as an alias.
   */
  isConsoleIdentifier(
    identifier: TSESTree.Identifier,
    scope: TSESLint.Scope.Scope | null,
  ) {
    const variable = findVariable(scope, identifier.name);
    if (variable) {
      return this.consoleAliases.has(variable);
    }
    return identifier.name === 'console';
  }

  /**
   * Returns true when an expression resolves to the console object, including
   * optional chaining wrappers.
   */
  isConsoleObject(
    expression: TSESTree.Expression,
    scope: TSESLint.Scope.Scope | null,
  ) {
    const unwrapped = unwrapChainExpression(expression);
    if (!unwrapped || unwrapped.type !== AST_NODE_TYPES.Identifier) {
      return false;
    }
    return this.isConsoleIdentifier(unwrapped, scope);
  }

  /**
   * Returns true when a member expression represents `.error` on a console-like
   * object (global console or a tracked alias).
   */
  isConsoleErrorMemberExpression(
    member: TSESTree.MemberExpression,
    scope: TSESLint.Scope.Scope | null,
  ) {
    return (
      this.isConsoleObject(member.object as TSESTree.Expression, scope) &&
      isErrorKey(member.property, member.computed ?? false)
    );
  }

  /**
   * Returns true when an identifier is tracked as an alias of console.error.
   */
  isErrorAlias(
    identifier: TSESTree.Identifier,
    scope: TSESLint.Scope.Scope | null,
  ) {
    const variable = findVariable(scope, identifier.name);
    return Boolean(variable && this.errorAliases.has(variable));
  }

  /**
   * Returns true when a CallExpression invokes console.error directly or through
   * tracked aliases.
   *
   * CallExpression callees (e.g., getError()('boom')) are not treated as
   * console.error calls because determining return values requires inter-procedural
   * analysis that ESLint rules cannot reliably perform.
   */
  isConsoleErrorCall(
    node: TSESTree.CallExpression,
    scope: TSESLint.Scope.Scope | null,
  ): boolean {
    const callee = unwrapChainExpression(node.callee);
    if (!callee) {
      return false;
    }

    if (callee.type === AST_NODE_TYPES.MemberExpression) {
      return this.isConsoleErrorMemberExpression(callee, scope);
    }

    if (callee.type === AST_NODE_TYPES.Identifier) {
      return this.isErrorAlias(callee, scope);
    }

    if (callee.type === AST_NODE_TYPES.CallExpression) return false;

    return false;
  }
}

const trackVariableDeclarator = (
  context: TSESLint.RuleContext<MessageIds, Options>,
  tracker: AliasTracker,
) => {
  return (node: TSESTree.VariableDeclarator) => {
    if (!node.init) {
      return;
    }

    const scope = context.getScope();
    const init = unwrapChainExpression(node.init);
    const declaredVariables = context.getDeclaredVariables(node);

    const markConsoleAlias = (name: string) =>
      tracker.markConsole(
        findDeclaredVariableByName(name, declaredVariables) ?? null,
      );
    const markErrorAlias = (name: string) =>
      tracker.markError(
        findDeclaredVariableByName(name, declaredVariables) ?? null,
      );

    if (
      node.id.type === AST_NODE_TYPES.Identifier &&
      init &&
      tracker.isConsoleObject(init as TSESTree.Expression, scope)
    ) {
      markConsoleAlias(node.id.name);
      return;
    }

    if (
      node.id.type === AST_NODE_TYPES.Identifier &&
      init &&
      init.type === AST_NODE_TYPES.MemberExpression &&
      tracker.isConsoleErrorMemberExpression(init, scope)
    ) {
      markErrorAlias(node.id.name);
      return;
    }

    if (
      node.id.type === AST_NODE_TYPES.ObjectPattern &&
      init &&
      tracker.isConsoleObject(init as TSESTree.Expression, scope)
    ) {
      for (const prop of node.id.properties) {
        if (prop.type !== AST_NODE_TYPES.Property) {
          continue;
        }

        if (!isErrorKey(prop.key, prop.computed ?? false)) {
          continue;
        }

        const localName = getLocalNameFromPattern(prop.value);
        if (!localName) {
          continue;
        }

        markErrorAlias(localName);
      }
    }
  };
};

const trackAssignmentExpression = (
  context: TSESLint.RuleContext<MessageIds, Options>,
  tracker: AliasTracker,
) => {
  return (node: TSESTree.AssignmentExpression) => {
    const scope = context.getScope();
    const right = unwrapChainExpression(node.right);

    if (!right) {
      return;
    }

    if (node.left.type === AST_NODE_TYPES.Identifier) {
      const variable = findVariable(scope, node.left.name);

      if (tracker.isConsoleObject(right as TSESTree.Expression, scope)) {
        tracker.markConsole(variable);
        return;
      }

      if (
        right.type === AST_NODE_TYPES.MemberExpression &&
        tracker.isConsoleErrorMemberExpression(right, scope)
      ) {
        tracker.markError(variable);
        return;
      }

      tracker.untrack(variable);
      return;
    }

    if (node.left.type === AST_NODE_TYPES.ObjectPattern) {
      const errorProps = node.left.properties.filter(
        (prop): prop is TSESTree.Property =>
          prop.type === AST_NODE_TYPES.Property &&
          isErrorKey(prop.key, prop.computed ?? false),
      );

      const localNames = errorProps
        .map((prop) => getLocalNameFromPattern(prop.value))
        .filter((name): name is string => Boolean(name));

      if (tracker.isConsoleObject(right as TSESTree.Expression, scope)) {
        for (const name of localNames) {
          tracker.markError(findVariable(scope, name));
        }
        return;
      }

      for (const name of localNames) {
        tracker.untrack(findVariable(scope, name));
      }
    }
  };
};

export const noConsoleError = createRule<Options, MessageIds>({
  name: 'no-console-error',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow console.error so errors flow through structured handling (HttpsError/useErrorAlert on frontend, structured loggers on backend).',
      recommended: 'warn',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignorePatterns: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          allowWithUseAlertDialog: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noConsoleError:
        'console.error bypasses the structured error pipeline → failures are harder to monitor, debug, and surface consistently to users → use structured error handling instead (frontend: throw HttpsError or route through useErrorAlert; backend: log with a structured logger such as firebase-functions/v2 logger and propagate/convert the error so monitoring captures it).',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    type FunctionNode =
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression;

    const shouldIgnoreFile = createFileIgnorePredicate(options);

    if (shouldIgnoreFile(context.getFilename())) {
      return {};
    }

    const allowWithUseAlertDialog = options.allowWithUseAlertDialog === true;

    const aliasTracker = new AliasTracker();
    const useAlertDialogNames = new Set<string>(['useAlertDialog']);
    const openFunctionNames = new Set<string>();
    let hasUseAlertDialog = false;

    const functionScopeStack: FunctionNode[] = [];
    let currentFunctionScope: FunctionNode | null = null;

    const functionsWithErrorDialogOpen = new WeakSet<FunctionNode>();
    const pendingDirectConsoleErrorCalls = new Map<
      FunctionNode | null,
      TSESTree.CallExpression[]
    >();

    const enterFunction = (node: FunctionNode) => {
      functionScopeStack.push(node);
      currentFunctionScope = functionScopeStack[functionScopeStack.length - 1];
    };

    const flushPendingConsoleErrorCalls = (scope: FunctionNode | null) => {
      const pending = pendingDirectConsoleErrorCalls.get(scope);
      if (!pending) return;

      const shouldAllow =
        allowWithUseAlertDialog &&
        hasUseAlertDialog &&
        scope !== null &&
        functionsWithErrorDialogOpen.has(scope);

      if (!shouldAllow) {
        for (const node of pending) {
          context.report({
            node,
            messageId: 'noConsoleError',
          });
        }
      }

      pendingDirectConsoleErrorCalls.delete(scope);
    };

    const exitFunction = () => {
      const exitingScope = currentFunctionScope;
      flushPendingConsoleErrorCalls(exitingScope);

      functionScopeStack.pop();
      currentFunctionScope =
        functionScopeStack[functionScopeStack.length - 1] ?? null;
    };

    const isUseAlertDialogCall = (node: TSESTree.CallExpression): boolean =>
      node.callee.type === AST_NODE_TYPES.Identifier &&
      useAlertDialogNames.has(node.callee.name);

    const trackUseAlertDialogImports = (node: TSESTree.ImportDeclaration) => {
      const importPath = String(node.source.value);
      const isAlertDialogImport =
        importPath === '../useAlertDialog' ||
        importPath === './useAlertDialog' ||
        importPath === 'useAlertDialog' ||
        importPath.endsWith('/useAlertDialog') ||
        importPath.endsWith('/useAlertDialog/index') ||
        importPath === '@/hooks/useAlertDialog' ||
        importPath === 'src/hooks/useAlertDialog';

      if (!isAlertDialogImport) return;

      hasUseAlertDialog = true;

      for (const specifier of node.specifiers) {
        if (
          specifier.type === AST_NODE_TYPES.ImportSpecifier &&
          specifier.imported.type === AST_NODE_TYPES.Identifier &&
          specifier.imported.name === 'useAlertDialog' &&
          specifier.local.type === AST_NODE_TYPES.Identifier
        ) {
          useAlertDialogNames.add(specifier.local.name);
        }

        if (
          specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
          specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
        ) {
          if (specifier.local.type === AST_NODE_TYPES.Identifier) {
            useAlertDialogNames.add(specifier.local.name);
          }
        }
      }
    };

    const trackUseAlertDialogOpenAliases = (
      node: TSESTree.VariableDeclarator,
    ) => {
      if (
        !node.init ||
        node.init.type !== AST_NODE_TYPES.CallExpression ||
        !isUseAlertDialogCall(node.init) ||
        node.id.type !== AST_NODE_TYPES.ObjectPattern
      ) {
        return;
      }

      for (const prop of node.id.properties) {
        if (
          prop.type === AST_NODE_TYPES.Property &&
          prop.key.type === AST_NODE_TYPES.Identifier &&
          prop.key.name === 'open' &&
          prop.value.type === AST_NODE_TYPES.Identifier
        ) {
          openFunctionNames.add(prop.value.name);
        }
      }
    };

    const isOpenCall = (node: TSESTree.CallExpression) => {
      const callee = unwrapChainExpression(node.callee);
      if (!callee) return false;

      return (
        ((callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          callee.property.name === 'open') ||
          (callee.type === AST_NODE_TYPES.Identifier &&
            (callee.name === 'open' || openFunctionNames.has(callee.name)))) &&
        node.arguments.length > 0
      );
    };

    const hasErrorSeverity = (node: TSESTree.ObjectExpression): boolean => {
      for (const prop of node.properties) {
        if (prop.type !== AST_NODE_TYPES.Property) continue;

        const isSeverityProperty =
          (!prop.computed &&
            prop.key.type === AST_NODE_TYPES.Identifier &&
            prop.key.name === 'severity') ||
          (prop.computed &&
            prop.key.type === AST_NODE_TYPES.Literal &&
            prop.key.value === 'severity');

        if (!isSeverityProperty) continue;

        if (
          prop.value.type === AST_NODE_TYPES.Literal &&
          typeof prop.value.value === 'string'
        ) {
          return prop.value.value === 'error';
        }

        return true;
      }

      return false;
    };

    const isDirectGlobalConsoleErrorCall = (node: TSESTree.CallExpression) => {
      const scope = context.getScope();
      const callee = unwrapChainExpression(node.callee);
      if (!callee || callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      if (
        callee.computed ||
        callee.property.type !== AST_NODE_TYPES.Identifier ||
        callee.property.name !== 'error'
      ) {
        return false;
      }

      const object = unwrapChainExpression(
        callee.object as TSESTree.Expression,
      );
      if (!object || object.type !== AST_NODE_TYPES.Identifier) return false;
      if (object.name !== 'console') return false;

      return findVariable(scope, 'console') === null;
    };

    const handleVariableDeclarator = trackVariableDeclarator(
      context,
      aliasTracker,
    );
    const handleAssignmentExpression = trackAssignmentExpression(
      context,
      aliasTracker,
    );

    return {
      ImportDeclaration: trackUseAlertDialogImports,

      FunctionDeclaration: enterFunction,
      FunctionExpression: enterFunction,
      ArrowFunctionExpression: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      'FunctionExpression:exit': exitFunction,
      'ArrowFunctionExpression:exit': exitFunction,

      'Program:exit'() {
        flushPendingConsoleErrorCalls(null);
      },

      VariableDeclarator(node) {
        trackUseAlertDialogOpenAliases(node);
        handleVariableDeclarator(node);
      },

      AssignmentExpression: handleAssignmentExpression,

      CallExpression(node) {
        if (isUseAlertDialogCall(node)) {
          hasUseAlertDialog = true;
        }

        if (
          isOpenCall(node) &&
          node.arguments[0]?.type === AST_NODE_TYPES.ObjectExpression &&
          hasErrorSeverity(node.arguments[0])
        ) {
          const scope = currentFunctionScope;
          if (scope) {
            functionsWithErrorDialogOpen.add(scope);
          }
        }

        const scope = context.getScope();
        if (!aliasTracker.isConsoleErrorCall(node, scope)) return;

        if (allowWithUseAlertDialog && isDirectGlobalConsoleErrorCall(node)) {
          const scopeKey = currentFunctionScope;
          const pending = pendingDirectConsoleErrorCalls.get(scopeKey) ?? [];
          pending.push(node);
          pendingDirectConsoleErrorCalls.set(scopeKey, pending);
          return;
        }

        context.report({
          node,
          messageId: 'noConsoleError',
        });
      },
    };
  },
});
