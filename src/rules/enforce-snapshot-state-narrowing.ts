import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noFalsyCheck' | 'noRawTypeof';

type Options = [
  {
    snapshotHooks?: string[];
    guardFunctions?: string[];
    excludeFiles?: string[];
  }?,
];

const DEFAULT_SNAPSHOT_HOOKS = [
  'useDocSnapshot',
  'useCollectionSnapshot',
  'useCachedDocSnapshot',
  'useFirestore',
];

const DEFAULT_GUARD_FUNCTIONS = ['isSnapshotReady'];

export const enforceSnapshotStateNarrowing = createRule<Options, MessageIds>({
  name: 'enforce-snapshot-state-narrowing',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce correct narrowing of FirestoreSnapshotState<T> variables. Falsy/truthy checks are semantic bugs because all string states are truthy; raw typeof narrowing to data bypasses the isSnapshotReady abstraction.',
      recommended: 'error',
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          snapshotHooks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Hook names that return FirestoreSnapshotState<T>',
          },
          guardFunctions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Canonical type guard function names',
          },
          excludeFiles: {
            type: 'array',
            items: { type: 'string' },
            description: 'File patterns to exclude from this rule',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noFalsyCheck:
        "Do not use boolean coercion on FirestoreSnapshotState<T>. All string states ('idle', 'loading', 'not-found') are truthy, so '{{expression}}' does not behave as intended. Use isSnapshotReady(state) to narrow to T, or compare explicitly (e.g., state === 'loading').",
      noRawTypeof:
        "Do not use '{{expression}}' to narrow FirestoreSnapshotState<T> to data. Use isSnapshotReady(state) instead to maintain the abstraction boundary.",
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const snapshotHooks = new Set(
      options?.snapshotHooks ?? DEFAULT_SNAPSHOT_HOOKS,
    );
    // guardFunctions is accepted in config for documentation and future extensibility
    // but detection is purely syntactic (by hook source), not by guard function name.
    void (options?.guardFunctions ?? DEFAULT_GUARD_FUNCTIONS);
    const excludeFiles = options?.excludeFiles ?? [
      'src/types/FirestoreSnapshotState.ts',
    ];

    // Check if the current file should be excluded
    const filename = context.getFilename();
    if (excludeFiles.some((pattern) => filename.endsWith(pattern))) {
      return {};
    }

    // Track variable names that are assigned from snapshot hooks within each scope.
    // We map variable name -> true (in-scope snapshot vars).
    const snapshotVars = new Set<string>();

    /**
     * Extracts the callee name from a CallExpression.
     * Handles both simple identifiers (useDocSnapshot) and member expressions
     * (hooks.useDocSnapshot). Returns undefined if it cannot be determined.
     */
    function getCalleeName(node: TSESTree.CallExpression): string | undefined {
      const callee = node.callee;
      if (callee.type === AST_NODE_TYPES.Identifier) {
        return callee.name;
      }
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        return callee.property.name;
      }
      return undefined;
    }

    /**
     * Returns true if the identifier refers to a variable we are tracking as a
     * snapshot state variable.
     */
    function isSnapshotVar(node: TSESTree.Identifier): boolean {
      return snapshotVars.has(node.name);
    }

    /**
     * Returns the source text of a node, falling back to a simple stringification.
     */
    function getText(node: TSESTree.Node): string {
      try {
        return context.getSourceCode().getText(node);
      } catch {
        return '<expression>';
      }
    }

    /**
     * Checks a BinaryExpression for raw typeof narrowing patterns that attempt
     * to narrow the state to data:
     *   - typeof state === 'object'   (bad)
     *   - typeof state !== 'string'   (bad - equivalent to isSnapshotReady)
     *   - typeof state === 'object' && state !== null  (the combined form is
     *     handled by visiting the BinaryExpression children individually)
     *
     * Allowed:
     *   - typeof state === 'string'   (good - narrows to non-data states)
     *   - typeof state !== 'object'   (not flagged, unusual but not a to-data check)
     */
    function checkTypeofBinaryExpression(
      node: TSESTree.BinaryExpression,
    ): void {
      const { operator, left, right } = node;

      // Pattern: typeof <expr> === <literal> or typeof <expr> !== <literal>
      if (
        left.type === AST_NODE_TYPES.UnaryExpression &&
        left.operator === 'typeof' &&
        right.type === AST_NODE_TYPES.Literal
      ) {
        const operand = left.argument;
        const literal = right.value;

        if (
          operand.type === AST_NODE_TYPES.Identifier &&
          isSnapshotVar(operand)
        ) {
          // typeof state === 'object' — bad: narrows to data, use isSnapshotReady
          if (operator === '===' && literal === 'object') {
            context.report({
              node,
              messageId: 'noRawTypeof',
              data: { expression: getText(node) },
              suggest: [
                {
                  messageId: 'noRawTypeof',
                  data: {
                    expression: `isSnapshotReady(${operand.name})`,
                  },
                  fix(fixer) {
                    return fixer.replaceText(
                      node,
                      `isSnapshotReady(${operand.name})`,
                    );
                  },
                },
              ],
            });
          }
          // typeof state !== 'string' — bad: equivalent to isSnapshotReady
          else if (operator === '!==' && literal === 'string') {
            context.report({
              node,
              messageId: 'noRawTypeof',
              data: { expression: getText(node) },
              suggest: [
                {
                  messageId: 'noRawTypeof',
                  data: {
                    expression: `isSnapshotReady(${operand.name})`,
                  },
                  fix(fixer) {
                    return fixer.replaceText(
                      node,
                      `isSnapshotReady(${operand.name})`,
                    );
                  },
                },
              ],
            });
          }
          // typeof state === 'string' — allowed (narrows to non-data states)
          // typeof state !== 'object' — allowed
        }
      }
    }

    /**
     * Reports a falsy/truthy check on a snapshot-state identifier.
     */
    function reportFalsyCheck(
      node: TSESTree.Node,
      expression: string,
      varName: string,
    ): void {
      context.report({
        node,
        messageId: 'noFalsyCheck',
        data: { expression },
        suggest: [
          {
            messageId: 'noFalsyCheck',
            data: { expression: `isSnapshotReady(${varName})` },
            fix(fixer) {
              // Replace the entire flagged expression with the canonical guard
              return fixer.replaceText(node, `isSnapshotReady(${varName})`);
            },
          },
        ],
      });
    }

    return {
      // Track variable declarations that come from snapshot hooks.
      // Supports:
      //   const state = useDocSnapshot<T>(...)         — simple assignment
      //   const [state, setState] = useCollectionSnapshot<T>(...)   — array destructuring
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (!node.init || node.init.type !== AST_NODE_TYPES.CallExpression) {
          return;
        }
        const callee = getCalleeName(node.init);
        if (!callee || !snapshotHooks.has(callee)) {
          return;
        }

        // Simple: const state = useDocSnapshot(...)
        if (node.id.type === AST_NODE_TYPES.Identifier) {
          snapshotVars.add(node.id.name);
        }
        // Destructuring: const { state } = useDocSnapshot(...) or const [state] = ...
        // We don't track these deeply to avoid false positives — the variable would
        // need a different name and it is unusual to destructure a snapshot state hook result.
      },

      // UnaryExpression: !state or !!state
      // For !!state: ESLint visits both the outer (!) and inner (!) nodes.
      // We report at the outermost level only: skip when this node is the inner
      // `!` of a `!!` expression (i.e. the parent is also a `!` UnaryExpression).
      UnaryExpression(node: TSESTree.UnaryExpression) {
        if (node.operator !== '!') return;

        // Skip the inner `!` of a `!!state` pattern — the outer `!` will report it.
        const parent = node.parent;
        if (
          parent &&
          parent.type === AST_NODE_TYPES.UnaryExpression &&
          parent.operator === '!'
        ) {
          return;
        }

        const argument = node.argument;

        // !state — the argument is directly the snapshot var
        if (
          argument.type === AST_NODE_TYPES.Identifier &&
          isSnapshotVar(argument)
        ) {
          const expression = `!${argument.name}`;
          reportFalsyCheck(node, expression, argument.name);
        }
        // !!state — the argument is another `!` whose argument is the snapshot var
        else if (
          argument.type === AST_NODE_TYPES.UnaryExpression &&
          argument.operator === '!' &&
          argument.argument.type === AST_NODE_TYPES.Identifier &&
          isSnapshotVar(argument.argument as TSESTree.Identifier)
        ) {
          const varName = (argument.argument as TSESTree.Identifier).name;
          reportFalsyCheck(node, `!!${varName}`, varName);
        }
      },

      // IfStatement: if (state) { ... } or if (!state) { ... }
      // The !state case is covered by UnaryExpression. We handle if (state) here.
      IfStatement(node: TSESTree.IfStatement) {
        const test = node.test;
        if (test.type === AST_NODE_TYPES.Identifier && isSnapshotVar(test)) {
          reportFalsyCheck(test, test.name, test.name);
        }
      },

      // ConditionalExpression: state ? a : b
      ConditionalExpression(node: TSESTree.ConditionalExpression) {
        const test = node.test;
        if (test.type === AST_NODE_TYPES.Identifier && isSnapshotVar(test)) {
          reportFalsyCheck(test, test.name, test.name);
        }
      },

      // LogicalExpression: state && expr, state || expr
      LogicalExpression(node: TSESTree.LogicalExpression) {
        const left = node.left;
        if (
          (node.operator === '&&' || node.operator === '||') &&
          left.type === AST_NODE_TYPES.Identifier &&
          isSnapshotVar(left)
        ) {
          reportFalsyCheck(left, left.name, left.name);
        }
      },

      // BinaryExpression: typeof state === 'object', typeof state !== 'string'
      BinaryExpression(node: TSESTree.BinaryExpression) {
        checkTypeofBinaryExpression(node);
      },

      // CallExpression: Boolean(state)
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee;

        // Boolean(state) — explicit coercion
        if (
          callee.type === AST_NODE_TYPES.Identifier &&
          callee.name === 'Boolean' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === AST_NODE_TYPES.Identifier &&
          isSnapshotVar(node.arguments[0] as TSESTree.Identifier)
        ) {
          const varName = (node.arguments[0] as TSESTree.Identifier).name;
          reportFalsyCheck(node, `Boolean(${varName})`, varName);
        }
      },
    };
  },
});
