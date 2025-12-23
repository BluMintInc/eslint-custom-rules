import { minimatch } from 'minimatch';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    ignorePatterns?: string[];
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

  markConsole(variable: TSESLint.Scope.Variable | null | undefined) {
    if (!variable) {
      return;
    }
    this.consoleAliases.add(variable);
    this.errorAliases.delete(variable);
  }

  markError(variable: TSESLint.Scope.Variable | null | undefined) {
    if (!variable) {
      return;
    }
    this.errorAliases.add(variable);
    this.consoleAliases.delete(variable);
  }

  untrack(variable: TSESLint.Scope.Variable | null | undefined) {
    if (!variable) {
      return;
    }
    this.consoleAliases.delete(variable);
    this.errorAliases.delete(variable);
  }

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

  isConsoleErrorMemberExpression(
    member: TSESTree.MemberExpression,
    scope: TSESLint.Scope.Scope | null,
  ) {
    return (
      this.isConsoleObject(member.object as TSESTree.Expression, scope) &&
      isErrorKey(member.property, member.computed ?? false)
    );
  }

  isErrorAlias(
    identifier: TSESTree.Identifier,
    scope: TSESLint.Scope.Scope | null,
  ) {
    const variable = findVariable(scope, identifier.name);
    return Boolean(variable && this.errorAliases.has(variable));
  }

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

    if (callee.type === AST_NODE_TYPES.CallExpression) {
      // When the callee is the result of another call (e.g., getError()('boom')),
      // determining whether the inner call returns console.error requires return-value
      // analysis that ESLint rules cannot reliably perform.
      return false;
    }

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
      const localNames = node.left.properties
        .filter(
          (prop): prop is TSESTree.Property =>
            prop.type === AST_NODE_TYPES.Property &&
            isErrorKey(prop.key, prop.computed ?? false),
        )
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

const trackCallExpression = (
  context: TSESLint.RuleContext<MessageIds, Options>,
  tracker: AliasTracker,
) => {
  return (node: TSESTree.CallExpression) => {
    const scope = context.getScope();
    if (tracker.isConsoleErrorCall(node, scope)) {
      context.report({
        node,
        messageId: 'noConsoleError',
      });
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
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noConsoleError:
        'Use structured error handling instead of console.error. Frontend: throw HttpsError or route through useErrorAlert so failures surface via the shared pipeline. Backend: log with a structured logger (e.g., firebase-functions/v2 logger) and propagate or convert the error so monitoring captures it.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const shouldIgnoreFile = createFileIgnorePredicate(options);

    if (shouldIgnoreFile(context.getFilename())) {
      return {};
    }

    const aliasTracker = new AliasTracker();

    return {
      VariableDeclarator: trackVariableDeclarator(context, aliasTracker),
      AssignmentExpression: trackAssignmentExpression(context, aliasTracker),
      CallExpression: trackCallExpression(context, aliasTracker),
    };
  },
});
