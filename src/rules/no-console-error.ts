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
    const ignorePatterns = [
      ...defaultIgnorePatterns,
      ...(options?.ignorePatterns ?? []),
    ];
    const filename = context.getFilename();
    const normalizedFilename = filename.replace(/\\/g, '/');

    if (
      normalizedFilename &&
      !normalizedFilename.startsWith('<') &&
      ignorePatterns.some((pattern) =>
        minimatch(normalizedFilename, pattern, { dot: true }),
      )
    ) {
      return {};
    }

    const consoleAliases = new Set<TSESLint.Scope.Variable>();
    const errorAliases = new Set<TSESLint.Scope.Variable>();

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

    const getLocalNameFromPattern = (
      target: TSESTree.Node,
    ): string | null => {
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

    const isConsoleIdentifier = (
      identifier: TSESTree.Identifier,
      scope: TSESLint.Scope.Scope | null,
    ) => {
      if (identifier.name === 'console') {
        return true;
      }

      const variable = findVariable(scope, identifier.name);
      return Boolean(variable && consoleAliases.has(variable));
    };

    const isConsoleObject = (
      expression: TSESTree.Expression,
      scope: TSESLint.Scope.Scope | null,
    ) => {
      const unwrapped = unwrapChainExpression(expression);
      if (!unwrapped) {
        return false;
      }

      if (unwrapped.type === AST_NODE_TYPES.Identifier) {
        return isConsoleIdentifier(unwrapped, scope);
      }

      return false;
    };

    const isConsoleErrorMemberExpression = (
      member: TSESTree.MemberExpression,
      scope: TSESLint.Scope.Scope | null,
    ) => {
      return (
        isConsoleObject(member.object as TSESTree.Expression, scope) &&
        isErrorKey(member.property, member.computed ?? false)
      );
    };

    const isErrorAlias = (
      identifier: TSESTree.Identifier,
      scope: TSESLint.Scope.Scope | null,
    ) => {
      const variable = findVariable(scope, identifier.name);
      return Boolean(variable && errorAliases.has(variable));
    };

    const addDeclaredVariableByName = (
      name: string,
      variables: readonly TSESLint.Scope.Variable[],
      target: Set<TSESLint.Scope.Variable>,
    ) => {
      const variable = variables.find((item) => item.name === name);
      if (variable) {
        target.add(variable);
      }
    };

    const isConsoleErrorCall = (
      node: TSESTree.CallExpression,
      scope: TSESLint.Scope.Scope | null,
    ): boolean => {
      const callee = unwrapChainExpression(node.callee);
      if (!callee) {
        return false;
      }

      if (callee.type === AST_NODE_TYPES.MemberExpression) {
        return isConsoleErrorMemberExpression(callee, scope);
      }

      if (callee.type === AST_NODE_TYPES.Identifier) {
        return isErrorAlias(callee, scope);
      }

      if (callee.type === AST_NODE_TYPES.CallExpression) {
        return isConsoleErrorCall(callee, scope);
      }

      return false;
    };

    return {
      VariableDeclarator(node) {
        if (!node.init) {
          return;
        }

        const scope = context.getScope();
        const init = unwrapChainExpression(node.init);
        const declaredVariables = context.getDeclaredVariables(node);

        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          init &&
          isConsoleObject(init as TSESTree.Expression, scope)
        ) {
          addDeclaredVariableByName(
            node.id.name,
            declaredVariables,
            consoleAliases,
          );
          return;
        }

        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          init &&
          init.type === AST_NODE_TYPES.MemberExpression &&
          isConsoleErrorMemberExpression(init, scope)
        ) {
          addDeclaredVariableByName(
            node.id.name,
            declaredVariables,
            errorAliases,
          );
          return;
        }

        if (
          node.id.type === AST_NODE_TYPES.ObjectPattern &&
          init &&
          isConsoleObject(init as TSESTree.Expression, scope)
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

            addDeclaredVariableByName(
              localName,
              declaredVariables,
              errorAliases,
            );
          }
        }
      },
      AssignmentExpression(node) {
        const scope = context.getScope();
        const right = unwrapChainExpression(node.right);

        if (!right) {
          return;
        }

        if (
          node.left.type === AST_NODE_TYPES.Identifier &&
          isConsoleObject(right as TSESTree.Expression, scope)
        ) {
          const variable = findVariable(scope, node.left.name);
          if (variable) {
            consoleAliases.add(variable);
          }
          return;
        }

        if (
          node.left.type === AST_NODE_TYPES.Identifier &&
          right.type === AST_NODE_TYPES.MemberExpression &&
          isConsoleErrorMemberExpression(right, scope)
        ) {
          const variable = findVariable(scope, node.left.name);
          if (variable) {
            errorAliases.add(variable);
          }
          return;
        }

        if (
          node.left.type === AST_NODE_TYPES.ObjectPattern &&
          isConsoleObject(right as TSESTree.Expression, scope)
        ) {
          for (const prop of node.left.properties) {
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

            const variable = findVariable(scope, localName);
            if (variable) {
              errorAliases.add(variable);
            }
          }
        }
      },
      CallExpression(node) {
        const scope = context.getScope();
        if (isConsoleErrorCall(node, scope)) {
          context.report({
            node,
            messageId: 'noConsoleError',
          });
        }
      },
    };
  },
});
