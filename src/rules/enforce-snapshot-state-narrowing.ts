import {
  AST_NODE_TYPES,
  ASTUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noFalsyCheck' | 'noRawTypeof';

type Options = [
  {
    snapshotHooks?: string[];
    guardFunctions?: string[];
    excludeFiles?: string[];
    guardImportSource?: string;
  }?,
];

const DEFAULT_SNAPSHOT_HOOKS = [
  'useDocSnapshot',
  'useCollectionSnapshot',
  'useCachedDocSnapshot',
  'useFirestore',
];

const GUARD_NAME = 'isSnapshotReady';

const DEFAULT_GUARD_FUNCTIONS = [GUARD_NAME];

/**
 * Where the canonical guard lives. The rule's own default `excludeFiles` entry
 * names the guard's implementation file, so the fixer writes an import for that
 * very module rather than guessing a path.
 */
const DEFAULT_GUARD_IMPORT_SOURCE = 'src/types/FirestoreSnapshotState';

/**
 * Parents that accept a bare conditional expression without parentheses. Any
 * other parent binds tighter than `?:` (or reads ambiguously next to it), so the
 * rewritten expression is wrapped.
 */
const PARENTHESES_FREE_PARENTS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.AssignmentPattern,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ExpressionStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.JSXExpressionContainer,
  AST_NODE_TYPES.Property,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.SwitchCase,
  AST_NODE_TYPES.SwitchStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.VariableDeclarator,
  AST_NODE_TYPES.WhileStatement,
]);

/**
 * What the emitted `isSnapshotReady` call would resolve to once a suggestion is
 * applied.
 */
type GuardBinding =
  /** Already callable in this scope; the rewrite stands alone. */
  | 'bound'
  /** Nothing owns the name, so the rewrite must carry an import with it. */
  | 'missing'
  /** Something else owns the name; calling it would run unrelated code. */
  | 'conflict';

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
          guardImportSource: {
            type: 'string',
            description:
              'Module specifier the suggestion imports isSnapshotReady from',
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
    const guardImportSource =
      options?.guardImportSource ?? DEFAULT_GUARD_IMPORT_SOURCE;

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
     * Strips a module specifier down to its final segment so an import written
     * as a relative path, an alias, or with an extension is still recognized as
     * the guard's module.
     */
    function moduleBasename(source: string): string {
      const withoutExtension = source.replace(/\.[cm]?[jt]sx?$/, '');
      const segments = withoutExtension.split('/');
      return segments[segments.length - 1];
    }

    const guardModuleName = moduleBasename(guardImportSource);

    function isGuardModule(source: string): boolean {
      return (
        source === guardImportSource ||
        moduleBasename(source) === guardModuleName
      );
    }

    function importDeclarationsOf(): TSESTree.ImportDeclaration[] {
      return context
        .getSourceCode()
        .ast.body.filter(
          (statement): statement is TSESTree.ImportDeclaration =>
            statement.type === AST_NODE_TYPES.ImportDeclaration &&
            typeof statement.source.value === 'string',
        );
    }

    function isValueImportSpecifier(
      specifier: TSESTree.ImportClause,
    ): specifier is TSESTree.ImportSpecifier {
      return (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.importKind !== 'type'
      );
    }

    /**
     * Decides whether the emitted guard call resolves as written, needs an
     * import, or would collide with an unrelated binding of the same name.
     */
    function resolveGuardBinding(scope: TSESLint.Scope.Scope): GuardBinding {
      const variable = ASTUtils.findVariable(scope, GUARD_NAME);
      if (!variable) {
        return 'missing';
      }
      const [definition] = variable.defs;
      if (!definition) {
        return 'conflict';
      }
      const definitionNode = definition.node;

      if (
        definitionNode.type === AST_NODE_TYPES.ImportSpecifier ||
        definitionNode.type === AST_NODE_TYPES.ImportDefaultSpecifier
      ) {
        // A type-only binding is erased at runtime, so calling it is not an
        // option — importing the value would then clash with the type binding.
        if (
          definitionNode.type === AST_NODE_TYPES.ImportSpecifier &&
          definitionNode.importKind === 'type'
        ) {
          return 'conflict';
        }
        const declaration = definitionNode.parent;
        if (
          !declaration ||
          declaration.type !== AST_NODE_TYPES.ImportDeclaration ||
          declaration.importKind === 'type'
        ) {
          return 'conflict';
        }
        // Any value import under this name reaches the guard (a barrel or
        // re-export is still the same function), so no second import is needed.
        return 'bound';
      }

      // A file that declares the guard itself already has a callable binding.
      if (definitionNode.type === AST_NODE_TYPES.FunctionDeclaration) {
        return 'bound';
      }
      if (
        definitionNode.type === AST_NODE_TYPES.VariableDeclarator &&
        (definitionNode.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          definitionNode.init?.type === AST_NODE_TYPES.FunctionExpression)
      ) {
        return 'bound';
      }

      return 'conflict';
    }

    /**
     * Makes the emitted guard call resolve: extend an existing import of the
     * guard's module when there is one to extend (reusing that file's own path),
     * otherwise add the canonical import statement.
     */
    function buildImportFix(fixer: TSESLint.RuleFixer): TSESLint.RuleFix {
      const declarations = importDeclarationsOf();
      const guardDeclarations = declarations.filter((declaration) =>
        isGuardModule(String(declaration.source.value)),
      );

      const reusable = guardDeclarations.find(
        (declaration) =>
          declaration.importKind !== 'type' &&
          declaration.specifiers.some(isValueImportSpecifier),
      );
      if (reusable) {
        const namedSpecifiers = reusable.specifiers.filter(
          isValueImportSpecifier,
        );
        const lastSpecifier = namedSpecifiers[namedSpecifiers.length - 1];
        return fixer.insertTextAfter(lastSpecifier, `, ${GUARD_NAME}`);
      }

      // A namespace or type-only import of the module cannot take a named value
      // specifier, but its path is proof of how this file reaches the module.
      const source = guardDeclarations.length
        ? String(guardDeclarations[0].source.value)
        : guardImportSource;
      const importText = `import { ${GUARD_NAME} } from '${source}';\n`;

      const [firstImport] = declarations;
      if (firstImport) {
        return fixer.insertTextBefore(firstImport, importText);
      }
      // Keep the import visually separated from the code it precedes unless the
      // file already opens with a blank line.
      const separator = /^\r?\n/.test(context.getSourceCode().text) ? '' : '\n';
      return fixer.insertTextBeforeRange([0, 0], `${importText}${separator}`);
    }

    /**
     * Builds the single suggestion shared by every report: swap the flagged
     * expression for its guard-based equivalent and bring `isSnapshotReady` into
     * scope. Declines (no suggestion) when the name is already taken by
     * something that is not the guard.
     */
    function guardSuggestion(
      messageId: MessageIds,
      fixNode: TSESTree.Node,
      replacement: string,
      scope: TSESLint.Scope.Scope,
    ): TSESLint.ReportSuggestionArray<MessageIds> {
      return [
        {
          messageId,
          data: { expression: replacement },
          fix(fixer) {
            const binding = resolveGuardBinding(scope);
            if (binding === 'conflict') {
              return null;
            }
            const fixes = [fixer.replaceText(fixNode, replacement)];
            if (binding === 'missing') {
              fixes.unshift(buildImportFix(fixer));
            }
            return fixes;
          },
        },
      ];
    }

    /**
     * True when a conditional expression substituted for `node` would need
     * parentheses to preserve the surrounding expression's grouping.
     */
    function needsParentheses(node: TSESTree.Node): boolean {
      // Source parentheses live outside the replaced range, so they already do
      // the grouping and a second pair would only add noise.
      if (ASTUtils.isParenthesized(node, context.getSourceCode())) {
        return false;
      }
      const parent = node.parent;
      if (!parent) {
        return true;
      }
      if (
        parent.type === AST_NODE_TYPES.CallExpression ||
        parent.type === AST_NODE_TYPES.NewExpression
      ) {
        return parent.callee === node;
      }
      return !PARENTHESES_FREE_PARENTS.has(parent.type);
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
          // Both flagged forms are true exactly when the state holds data, so
          // the guard replaces them with matching polarity.
          const isToDataCheck =
            (operator === '===' && literal === 'object') ||
            (operator === '!==' && literal === 'string');

          if (isToDataCheck) {
            context.report({
              node,
              messageId: 'noRawTypeof',
              data: { expression: getText(node) },
              suggest: guardSuggestion(
                'noRawTypeof',
                node,
                `${GUARD_NAME}(${operand.name})`,
                context.getScope(),
              ),
            });
          }
          // typeof state === 'string' — allowed (narrows to non-data states)
          // typeof state !== 'object' — allowed
        }
      }
    }

    /**
     * Reports a falsy/truthy check on a snapshot-state identifier.
     *
     * `replacement` must match the polarity of the flagged expression: a falsy
     * check reads `!isSnapshotReady(state)`, a truthy one `isSnapshotReady(state)`.
     * `fixNode` defaults to the reported node but can be widened when the whole
     * surrounding expression has to be rewritten (e.g. `state || fallback`).
     */
    function reportFalsyCheck(
      node: TSESTree.Node,
      expression: string,
      replacement: string,
      fixNode: TSESTree.Node = node,
    ): void {
      context.report({
        node,
        messageId: 'noFalsyCheck',
        data: { expression },
        suggest: guardSuggestion(
          'noFalsyCheck',
          fixNode,
          replacement,
          context.getScope(),
        ),
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

        // !state — the argument is directly the snapshot var.
        // The check is true when the state is NOT usable, so the guard has to
        // stay negated or the suggestion would reverse the control flow.
        if (
          argument.type === AST_NODE_TYPES.Identifier &&
          isSnapshotVar(argument)
        ) {
          reportFalsyCheck(
            node,
            `!${argument.name}`,
            `!${GUARD_NAME}(${argument.name})`,
          );
        }
        // !!state — the argument is another `!` whose argument is the snapshot var.
        // The double negation is a truthiness coercion, so the guard is positive.
        else if (
          argument.type === AST_NODE_TYPES.UnaryExpression &&
          argument.operator === '!' &&
          argument.argument.type === AST_NODE_TYPES.Identifier &&
          isSnapshotVar(argument.argument as TSESTree.Identifier)
        ) {
          const varName = (argument.argument as TSESTree.Identifier).name;
          reportFalsyCheck(node, `!!${varName}`, `${GUARD_NAME}(${varName})`);
        }
      },

      // IfStatement: if (state) { ... } or if (!state) { ... }
      // The !state case is covered by UnaryExpression. We handle if (state) here.
      IfStatement(node: TSESTree.IfStatement) {
        const test = node.test;
        if (test.type === AST_NODE_TYPES.Identifier && isSnapshotVar(test)) {
          reportFalsyCheck(test, test.name, `${GUARD_NAME}(${test.name})`);
        }
      },

      // ConditionalExpression: state ? a : b
      ConditionalExpression(node: TSESTree.ConditionalExpression) {
        const test = node.test;
        if (test.type === AST_NODE_TYPES.Identifier && isSnapshotVar(test)) {
          reportFalsyCheck(test, test.name, `${GUARD_NAME}(${test.name})`);
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
          if (node.operator === '&&') {
            // `state && expr` guards expr, so swapping the operand for the
            // guard keeps both the polarity and the narrowing of `state`.
            reportFalsyCheck(left, left.name, `${GUARD_NAME}(${left.name})`);
            return;
          }
          // `state || fallback` evaluates to the state itself when it is
          // usable, so a bare operand swap would yield `true` instead of the
          // data. Only the conditional form preserves that value.
          const guarded = `${GUARD_NAME}(${left.name}) ? ${
            left.name
          } : ${getText(node.right)}`;
          reportFalsyCheck(
            left,
            left.name,
            needsParentheses(node) ? `(${guarded})` : guarded,
            node,
          );
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
          reportFalsyCheck(
            node,
            `Boolean(${varName})`,
            `${GUARD_NAME}(${varName})`,
          );
        }
      },
    };
  },
});
