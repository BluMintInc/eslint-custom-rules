import {
  AST_NODE_TYPES,
  ASTUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import {
  ImportInsertionAnchor,
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

type MessageIds = 'noFalsyCheck' | 'noNullishFallback' | 'noRawTypeof';

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
 * What the emitted guard call would resolve to once a suggestion is applied.
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
            description:
              'Type guard function names; the first is the one suggestions call and import',
          },
          excludeFiles: {
            type: 'array',
            items: { type: 'string' },
            description: 'File patterns to exclude from this rule',
          },
          guardImportSource: {
            type: 'string',
            description:
              'Module specifier the suggestion imports the guard from',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      // `guard` is the configured canonical guard name, so a consumer who
      // renames it is not told to call a function their config says does not
      // exist. Every report and suggestion supplies it.
      noFalsyCheck:
        "Do not use boolean coercion on FirestoreSnapshotState<T>. All string states ('idle', 'loading', 'not-found') are truthy, so '{{expression}}' does not behave as intended. Use {{guard}}(state) to narrow to T, or compare explicitly (e.g., state === 'loading').",
      // `??` is a distinct mistake from `||`, so it gets its own wording: the
      // problem is not truthiness but that no state is nullish, which makes the
      // fallback unreachable rather than merely unreliable.
      noNullishFallback:
        "Do not use nullish coalescing on FirestoreSnapshotState<T>. No state ('idle', 'loading', 'not-found') is null or undefined, so '{{expression}}' always evaluates to the state itself and the fallback is unreachable, leaving a state string bound where data was expected. Use {{guard}}(state) to choose between them (e.g., {{guard}}(state) ? state : fallback), or compare explicitly (e.g., state === 'loading').",
      noRawTypeof:
        "Do not use '{{expression}}' to narrow FirestoreSnapshotState<T> to data. Use {{guard}}(state) instead to maintain the abstraction boundary.",
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const snapshotHooks = new Set(
      options?.snapshotHooks ?? DEFAULT_SNAPSHOT_HOOKS,
    );
    /**
     * The name every suggestion calls, resolves in scope, and imports.
     * `guardFunctions` may list several recognized guards; the first usable one
     * is canonical. A list that names nothing callable — empty, or holding only
     * blanks — falls back to the default rather than leaving the suggestion to
     * emit `undefined(state)` or `(state)`.
     */
    const guardName =
      options?.guardFunctions?.find((name) => name.trim().length > 0) ??
      DEFAULT_GUARD_FUNCTIONS[0];
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
      const variable = ASTUtils.findVariable(scope, guardName);
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
      const sourceCode = context.getSourceCode();
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
        return fixer.insertTextAfter(lastSpecifier, `, ${guardName}`);
      }

      // A namespace or type-only import of the module cannot take a named value
      // specifier, but its path is proof of how this file reaches the module.
      const source = guardDeclarations.length
        ? String(guardDeclarations[0].source.value)
        : guardImportSource;
      const importText = `import { ${guardName} } from '${source}';\n`;

      const anchor = importInsertionAnchor(sourceCode);
      if (declarations.length) {
        // The statement joins an import block, and the anchor is that block's
        // first declaration (or a suppression comment bound to it), so it lands
        // among its siblings with nothing above them displaced.
        return insertAtImportAnchor(sourceCode, fixer, anchor, importText);
      }

      // A file's first import opens the file, so it may cross the blank lines
      // the source starts with. The anchor is the floor of that climb: a
      // `'use client'` directive stops being a directive, a `#!` shebang stops
      // parsing, and a header comment stops covering its subject the moment a
      // statement precedes them, so only whitespace may be crossed.
      const anchorIndex =
        anchor.kind === 'before' ? anchor.target.range[0] : anchor.index;
      const opensFile = sourceCode.text.slice(0, anchorIndex).trim() === '';
      const insertion: ImportInsertionAnchor = opensFile
        ? { kind: 'index', index: 0 }
        : anchor;
      // Keep the import visually separated from the code it precedes unless a
      // blank line already sits at the insertion point.
      const separator = /^\r?\n/.test(
        sourceCode.text.slice(opensFile ? 0 : anchorIndex),
      )
        ? ''
        : '\n';
      return insertAtImportAnchor(
        sourceCode,
        fixer,
        insertion,
        `${importText}${separator}`,
      );
    }

    /**
     * Builds the single suggestion shared by every report: swap the flagged
     * expression for its guard-based equivalent and bring the guard into
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
          data: { expression: replacement, guard: guardName },
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
              data: { expression: getText(node), guard: guardName },
              suggest: guardSuggestion(
                'noRawTypeof',
                node,
                `${guardName}(${operand.name})`,
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
     * Reports a narrowing violation on a snapshot-state identifier and attaches
     * the guard-based rewrite as its suggestion.
     *
     * `replacement` must match the polarity of the flagged expression: a falsy
     * check reads `!isSnapshotReady(state)`, a truthy one `isSnapshotReady(state)`.
     * `fixNode` defaults to the reported node but can be widened when the whole
     * surrounding expression has to be rewritten (e.g. `state || fallback`).
     */
    function reportNarrowing(
      messageId: 'noFalsyCheck' | 'noNullishFallback',
      node: TSESTree.Node,
      expression: string,
      replacement: string,
      fixNode: TSESTree.Node = node,
    ): void {
      context.report({
        node,
        messageId,
        data: { expression, guard: guardName },
        suggest: guardSuggestion(
          messageId,
          fixNode,
          replacement,
          context.getScope(),
        ),
      });
    }

    /**
     * Reports a falsy/truthy check on a snapshot-state identifier.
     */
    function reportFalsyCheck(
      node: TSESTree.Node,
      expression: string,
      replacement: string,
      fixNode: TSESTree.Node = node,
    ): void {
      reportNarrowing('noFalsyCheck', node, expression, replacement, fixNode);
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
            `!${guardName}(${argument.name})`,
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
          reportFalsyCheck(node, `!!${varName}`, `${guardName}(${varName})`);
        }
      },

      // IfStatement: if (state) { ... } or if (!state) { ... }
      // The !state case is covered by UnaryExpression. We handle if (state) here.
      IfStatement(node: TSESTree.IfStatement) {
        const test = node.test;
        if (test.type === AST_NODE_TYPES.Identifier && isSnapshotVar(test)) {
          reportFalsyCheck(test, test.name, `${guardName}(${test.name})`);
        }
      },

      // ConditionalExpression: state ? a : b
      ConditionalExpression(node: TSESTree.ConditionalExpression) {
        const test = node.test;
        if (test.type === AST_NODE_TYPES.Identifier && isSnapshotVar(test)) {
          reportFalsyCheck(test, test.name, `${guardName}(${test.name})`);
        }
      },

      // LogicalExpression: state && expr, state || expr, state ?? expr
      LogicalExpression(node: TSESTree.LogicalExpression) {
        const left = node.left;
        if (left.type !== AST_NODE_TYPES.Identifier || !isSnapshotVar(left)) {
          return;
        }

        if (node.operator === '&&') {
          // `state && expr` guards expr, so swapping the operand for the
          // guard keeps both the polarity and the narrowing of `state`.
          reportFalsyCheck(left, left.name, `${guardName}(${left.name})`);
          return;
        }

        // `??` joins the `||` arm rather than the `&&` one: both are fallback
        // forms whose left operand carries the value, so both need the same
        // conditional rewrite. `??` is no safer than `||` on a snapshot state —
        // every non-data member of the union is a truthy string and none is
        // nullish, so neither operator can reach its fallback — but it fails
        // for a different reason, so it reports under its own message.
        const isNullishFallback = node.operator === '??';

        // `state || fallback` evaluates to the state itself when it is
        // usable, so a bare operand swap would yield `true` instead of the
        // data. Only the conditional form preserves that value.
        const guarded = `${guardName}(${left.name}) ? ${left.name} : ${getText(
          node.right,
        )}`;
        reportNarrowing(
          isNullishFallback ? 'noNullishFallback' : 'noFalsyCheck',
          left,
          // The nullish message turns on the whole expression being dead, so it
          // shows the operator and the fallback it can never reach.
          isNullishFallback ? getText(node) : left.name,
          needsParentheses(node) ? `(${guarded})` : guarded,
          node,
        );
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
            `${guardName}(${varName})`,
          );
        }
      },
    };
  },
});
