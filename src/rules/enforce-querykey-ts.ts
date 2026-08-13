import path from 'path';
import {
  AST_NODE_TYPES,
  ASTUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  ImportInsertionAnchor,
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

type MessageIds = 'enforceQueryKeyImport' | 'enforceQueryKeyConstant';

// The module's path below the project root doubles as the bare specifier,
// which is precisely why the root tsconfig `paths` and the Jest mapper resolve
// it.
const QUERY_KEYS_MODULE = 'src/util/routing/queryKeys';
const QUERY_KEYS_SUFFIX = 'util/routing/queryKeys';
const SRC_TIER_SEGMENT = '/src/';

/**
 * An `@/`-aliased specifier resolves under none of tsc, webpack or Jest, so it
 * is never emitted; it stays recognized because a consumer that does declare
 * the alias must still have its existing imports understood.
 */
const ALIASED_QUERY_KEYS_MODULE = '@/util/routing/queryKeys';

/**
 * queryKeys.ts is also reachable through the constants barrel, which
 * `prefer-global-router-state-key` accepts as an approved re-export
 * (prefer-global-router-state-key.ts:139-143) and whose messages advertise it.
 * Both rules police the same `useRouterState` key and both ship as `error` in
 * the recommended config, so a source one of them blesses must not be the
 * other's violation (#1714).
 */
const APPROVED_REEXPORT_SOURCES = new Set(['constants', 'constants/index']);

/**
 * Reduce a specifier to the module it names, dropping the roots that are all
 * spellings of the same location: the `@/` and `src/` aliases, and any run of
 * relative steps. Mirrors the sibling's normalization
 * (prefer-global-router-state-key.ts:149-151) so `src/constants` and
 * `../constants` are recognized as the same approved re-export that `constants`
 * is.
 */
const normalizeSpecifier = (source: string) =>
  source.replace(/^@\/|^src\//, '').replace(/^(\.\/|\.\.\/)+/, '');

/**
 * Every notation for writing a type onto an expression. All four are erased
 * before anything runs, so each denotes exactly the expression it wraps: a key
 * is the same key with one as without.
 *
 * One shared set keeps the two questions this rule asks about a key — where it
 * comes from (`isValidQueryKeyUsage`) and whether it is a bare string
 * (`containsInvalidStringLiteral`, and the dispatch that consults it) — unable
 * to disagree about what an assertion is. Naming assertions on only the first
 * of them made an asserted key resolve correctly and then never be asked about
 * (#1840 vs #1842).
 */
type AssertionExpression =
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.TSTypeAssertion;

const ASSERTION_NODE_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
]);

const isTypeAssertion = (node: TSESTree.Node): node is AssertionExpression =>
  ASSERTION_NODE_TYPES.has(node.type);

/**
 * The expression an assertion — or a stack of them, since they compose — is
 * written onto.
 */
const unwrapTypeAssertions = (node: TSESTree.Node): TSESTree.Node =>
  isTypeAssertion(node) ? unwrapTypeAssertions(node.expression) : node;

const toPosixPath = (filePath: string) => filePath.replace(/\\/g, '/');

const ensureRelativeSpecifier = (specifier: string) =>
  specifier.startsWith('.') ? specifier : `./${specifier}`;

const isWindowsDrivePath = (filePath: string) =>
  /^[A-Za-z]:[\\/]/.test(filePath);

const isValidRelativePath = (relativePath: string) =>
  relativePath !== '' &&
  !path.isAbsolute(relativePath) &&
  !isWindowsDrivePath(relativePath);

const toAbsoluteFilename = (sourceFilePath: string, cwd: string) =>
  toPosixPath(
    path.isAbsolute(sourceFilePath)
      ? sourceFilePath
      : path.join(cwd, sourceFilePath),
  );

/**
 * `queryKeys.ts` lives at `src/util/routing/queryKeys.ts` and is reachable by
 * exactly two forms: a relative path, and the bare `src/…` specifier that the
 * root tsconfig `paths` and the Jest `moduleNameMapper` both resolve. A
 * hardcoded `@/`-aliased specifier therefore turns every fix into a broken
 * import (#1391).
 *
 * Files under a `src/` segment take the relative form, which dominates the
 * codebase and stays correct even where `paths` are unavailable; the `../`
 * count comes from the file's own depth below the root that owns its `src/`
 * segment. Returns null when no correct specifier exists, which makes the
 * caller decline the fix rather than write an import that cannot resolve.
 */
function buildQueryKeysSpecifier(
  sourceFilePath: string,
  cwd: string,
): string | null {
  const absoluteFilename = toAbsoluteFilename(sourceFilePath, cwd);

  const tierIndex = absoluteFilename.indexOf(SRC_TIER_SEGMENT);
  if (tierIndex === -1) {
    return QUERY_KEYS_MODULE;
  }

  // The project root is everything up to and including the separator that
  // precedes the file's own `src/` segment.
  const projectRoot = absoluteFilename.slice(0, tierIndex + 1);
  const targetPath = path.join(projectRoot, QUERY_KEYS_MODULE);
  const relativePath = path.relative(
    path.dirname(absoluteFilename),
    targetPath,
  );

  if (!isValidRelativePath(relativePath)) {
    return null;
  }

  return ensureRelativeSpecifier(toPosixPath(relativePath));
}

/**
 * What the substituted `QUERY_KEY_*` name would resolve to once the fix lands.
 */
type BindingState =
  /** Already imported from queryKeys.ts; only the literal has to change. */
  | 'bound'
  /** Nothing owns the name, so the fix must bring the import with it. */
  | 'missing'
  /** Something unrelated owns the name; substituting would silently repoint the key. */
  | 'conflict';

type PendingReport = {
  node: TSESTree.Node;
  messageId: MessageIds;
  data?: { variableName: string };
  /** Present only where the key's value is statically known, hence fixable. */
  substitution?: {
    /**
     * The span the constant is written over: the literal together with any
     * assertions on it, so the constant replaces the whole key expression
     * rather than landing inside one.
     */
    keyNode: TSESTree.Node;
    constant: string;
    scope: TSESLint.Scope.Scope;
  };
};

/**
 * Rule to enforce the use of centralized router state key constants imported from
 * `src/util/routing/queryKeys.ts` instead of arbitrary string literals when calling
 * router methods that accept key parameters.
 */
export const enforceQueryKeyTs = createRule<[], MessageIds>({
  name: 'enforce-querykey-ts',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce using centralized router state key constants from queryKeys.ts for useRouterState key parameter',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceQueryKeyImport:
        'Router state key must come from queryKeys.ts (e.g., "src/util/routing/queryKeys" or a relative path to that module). Use a QUERY_KEY_* constant instead of string literals.',
      enforceQueryKeyConstant:
        'Router state key must use a QUERY_KEY_* constant from queryKeys.ts. Variable "{{variableName}}" is not imported from the correct source.',
    },
  },
  defaultOptions: [],
  create(context) {
    const cwd =
      typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();
    const absoluteFilename = toAbsoluteFilename(context.getFilename(), cwd);
    const queryKeysSpecifier = buildQueryKeysSpecifier(
      context.getFilename(),
      cwd,
    );
    // Track imports from queryKeys.ts
    const queryKeyImports = new Map<
      string,
      { source: string; imported: string }
    >();
    const localUseRouterStateNames = new Set<string>(['useRouterState']);
    const validQueryKeySources = new Set([
      ALIASED_QUERY_KEYS_MODULE,
      QUERY_KEYS_MODULE,
    ]);

    const sourceCode = context.getSourceCode();

    /**
     * Reports are buffered until the whole file has been walked so the fixer can
     * put every substituted constant into a single import instead of racing
     * per-violation insertions that overlap and get dropped.
     */
    const pendingReports: PendingReport[] = [];

    /**
     * The queryKeys import rides on one violation's fix, which makes that
     * violation the file's import carrier. ESLint collects fixes before it
     * applies inline disable directives, so a suppressed carrier takes the
     * import down with it while the surviving substitutions still land —
     * leaving the file referencing constants nothing imports (#1410).
     * Resolving suppression here keeps a suppressed violation out of the plan
     * entirely: it neither claims the carrier slot nor contributes a specifier
     * to the import, which would otherwise be imported and never used.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * `SourceCode#getScope` supersedes the deprecated `context.getScope`; the
     * fallback keeps the rule working on ESLint versions that predate it.
     */
    function scopeOf(node: TSESTree.Node): TSESLint.Scope.Scope {
      const scoped = sourceCode as TSESLint.SourceCode & {
        getScope?: (node: TSESTree.Node) => TSESLint.Scope.Scope;
      };
      return typeof scoped.getScope === 'function'
        ? scoped.getScope(node)
        : context.getScope();
    }

    /**
     * Check if a source path refers to queryKeys.ts
     */
    function isQueryKeysSource(source: string): boolean {
      if (
        validQueryKeySources.has(source) ||
        source.endsWith(`/${QUERY_KEYS_SUFFIX}`)
      ) {
        return true;
      }

      // The approved re-export and the root-relative spelling of the module
      // itself are recognized under every alias of their root, which is what the
      // sibling rule accepts; recognizing less makes its advertised remedy this
      // rule's violation (#1714).
      const normalized = normalizeSpecifier(source);
      if (
        APPROVED_REEXPORT_SOURCES.has(normalized) ||
        normalized === QUERY_KEYS_SUFFIX
      ) {
        return true;
      }

      // A relative specifier can name the module without spelling out
      // `util/routing`: a sibling reaches it as `./queryKeys`, and a file two
      // directories below `src/util` as `../../routing/queryKeys`. Resolving
      // against the linted file recognizes those, which also keeps the fix's own
      // relative output recognized on the next pass so a second violation
      // extends that import instead of duplicating it.
      if (!source.startsWith('.')) {
        return false;
      }

      const resolved = toPosixPath(
        path.resolve(path.dirname(absoluteFilename), source),
      );
      return resolved.endsWith(`/${QUERY_KEYS_SUFFIX}`);
    }

    function importDeclarationsOf(): TSESTree.ImportDeclaration[] {
      return sourceCode.ast.body.filter(
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
     * A file that already imports the export under another name reaches it
     * through that name; re-importing it would leave two bindings for one
     * constant.
     */
    function localNameOf(constant: string): string {
      for (const declaration of importDeclarationsOf()) {
        if (
          declaration.importKind === 'type' ||
          !isQueryKeysSource(String(declaration.source.value))
        ) {
          continue;
        }
        for (const specifier of declaration.specifiers) {
          if (
            isValueImportSpecifier(specifier) &&
            specifier.imported.name === constant
          ) {
            return specifier.local.name;
          }
        }
      }
      return constant;
    }

    /**
     * Decide whether the suggested constant can be substituted, and whether the
     * substitution has to carry an import with it.
     */
    function resolveBinding(
      scope: TSESLint.Scope.Scope,
      constant: string,
    ): BindingState {
      const variable = ASTUtils.findVariable(scope, constant);
      if (!variable) {
        return 'missing';
      }
      const [definition] = variable.defs;
      if (!definition) {
        return 'conflict';
      }
      const definitionNode = definition.node;
      if (
        definitionNode.type !== AST_NODE_TYPES.ImportSpecifier ||
        definitionNode.importKind === 'type' ||
        !isValidQueryKeyConstant(definitionNode.imported.name)
      ) {
        return 'conflict';
      }
      const declaration = definitionNode.parent;
      if (
        !declaration ||
        declaration.type !== AST_NODE_TYPES.ImportDeclaration ||
        declaration.importKind === 'type' ||
        typeof declaration.source.value !== 'string' ||
        !isQueryKeysSource(declaration.source.value)
      ) {
        return 'conflict';
      }
      return 'bound';
    }

    /**
     * A parameter binding holds a different value on every call, so no single
     * `QUERY_KEY_*` constant can stand in for it: a hook that iterates a
     * constant array of keys hands each one to a callback parameter by design
     * (#1393). Reporting such an identifier demands a substitution that does not
     * exist, and the enclosing function is where the caller — not this file —
     * decides which key is passed.
     */
    function isParameterBinding(identifier: TSESTree.Identifier): boolean {
      const variable = ASTUtils.findVariable(scopeOf(identifier), identifier);
      const definition = variable?.defs[0];
      return definition?.type === TSESLint.Scope.DefinitionType.Parameter;
    }

    function queryKeysDeclarationsOf(): TSESTree.ImportDeclaration[] {
      return importDeclarationsOf().filter((declaration) =>
        isQueryKeysSource(String(declaration.source.value)),
      );
    }

    /**
     * The path by which this file reaches queryKeys.ts. An existing declaration
     * is proof of a path that resolves here — including an `@/` one, in a
     * consumer that declares that alias — so it wins over anything derived.
     * Null means the module is unreachable by any specifier this rule can write.
     */
    function importSourceOf(): string | null {
      const [declaration] = queryKeysDeclarationsOf();
      return declaration
        ? String(declaration.source.value)
        : queryKeysSpecifier;
    }

    /**
     * Make the substituted constants resolve: extend the file's queryKeys import
     * when there is one to extend, otherwise add a fresh import statement.
     */
    function buildImportFix(
      fixer: TSESLint.RuleFixer,
      constants: string[],
    ): TSESLint.RuleFix | null {
      const importDeclarations = importDeclarationsOf();
      const queryKeysDeclarations = queryKeysDeclarationsOf();

      const reusable = queryKeysDeclarations.find(
        (declaration) =>
          declaration.importKind !== 'type' &&
          declaration.specifiers.some(isValueImportSpecifier),
      );
      if (reusable) {
        const namedSpecifiers = reusable.specifiers.filter(
          isValueImportSpecifier,
        );
        const lastSpecifier = namedSpecifiers[namedSpecifiers.length - 1];
        return fixer.insertTextAfter(
          lastSpecifier,
          constants.map((constant) => `, ${constant}`).join(''),
        );
      }

      // A namespace or type-only queryKeys import cannot take named value
      // specifiers, but its path is proof of how this file reaches the module.
      const source = importSourceOf();
      if (source === null) {
        return null;
      }
      const importText = `import { ${constants.join(
        ', ',
      )} } from '${source}';\n`;

      const anchor = importInsertionAnchor(sourceCode);
      if (importDeclarations.length) {
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

    function flushReports(): void {
      const resolutions = new Map<
        PendingReport,
        { name: string; state: BindingState }
      >();
      const missingConstants: string[] = [];
      const canImport = importSourceOf() !== null;

      // The location handed to `context.report` below is what ESLint matches a
      // directive against, so suppression is resolved from exactly that node.
      const suppressed = new Set(
        pendingReports.filter((report) => isReportSuppressed(report.node)),
      );

      for (const report of pendingReports) {
        if (!report.substitution || suppressed.has(report)) {
          continue;
        }
        const { constant, scope } = report.substitution;
        const name = localNameOf(constant);
        const state = resolveBinding(scope, name);
        // Substituting a constant whose import cannot be written would leave
        // the file referencing an undefined identifier, which is worse than the
        // literal it replaced; leaving the report unresolved declines its fix.
        if (state === 'missing' && !canImport) {
          continue;
        }
        resolutions.set(report, { name, state });
        if (state === 'missing' && !missingConstants.includes(name)) {
          missingConstants.push(name);
        }
      }

      // The first applied substitution carries the import for every other one:
      // its fix range then starts at the top of the file and ends before the
      // remaining literals, so no two fixes of this rule overlap in a pass.
      // Suppressed reports are skipped so the slot falls to a survivor.
      const importCarrier = pendingReports.find((report) => {
        const resolution = resolutions.get(report);
        return (
          !suppressed.has(report) &&
          resolution !== undefined &&
          resolution.state !== 'conflict'
        );
      });

      // Suppressed violations are still reported: ESLint discards them, and
      // reporting keeps the user's directive "used" so that
      // `--report-unused-disable-directives` does not flag it.
      for (const report of pendingReports) {
        context.report({
          node: report.node,
          messageId: report.messageId,
          data: report.data,
          fix(fixer) {
            const { substitution } = report;
            const resolution = resolutions.get(report);
            if (
              suppressed.has(report) ||
              !substitution ||
              !resolution ||
              resolution.state === 'conflict'
            ) {
              return null;
            }
            const fixes = [
              fixer.replaceText(substitution.keyNode, resolution.name),
            ];
            if (report === importCarrier && missingConstants.length > 0) {
              const importFix = buildImportFix(fixer, missingConstants);
              if (!importFix) {
                return null;
              }
              fixes.unshift(importFix);
            }
            return fixes;
          },
        });
      }
    }

    /**
     * Check if an identifier is a valid QUERY_KEY constant
     */
    function isValidQueryKeyConstant(name: string): boolean {
      return name.startsWith('QUERY_KEY_');
    }

    /**
     * Track variable assignments to detect variables derived from query key constants
     */
    const variableAssignments = new Map<string, TSESTree.Node>();

    /**
     * Names whose declaration leaves them holding `undefined` — `let key;` and
     * `let key = undefined;` alike. Both falsy and nullish, which is what makes
     * a later `||=`/`??=` onto one of them assign unconditionally.
     */
    const declaredUndefined = new Set<string>();

    /** Declarations and assignments seen per name, to bound the above to the provable case. */
    const declarationCounts = new Map<string, number>();
    const assignmentCounts = new Map<string, number>();

    const isUndefinedIdentifier = (node: TSESTree.Node): boolean =>
      node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined';

    /**
     * Check if a node represents a valid query key usage
     */
    function isValidQueryKeyUsage(node: TSESTree.Node): boolean {
      // `config?.getQueryKey()` parses as a `ChainExpression` wrapping the call,
      // a type this switch does not name — so the optional spelling alone fell
      // through to `return false` and bypassed the carve-outs below, reporting a
      // key the plain spelling is allowed to build (#1832). Optionality is
      // orthogonal to what this function asks: the question is where the key
      // comes from, and a short-circuit changes only whether the same source is
      // evaluated, never which source it is.
      if (node.type === AST_NODE_TYPES.ChainExpression) {
        return isValidQueryKeyUsage(node.expression);
      }

      // The same argument, and it holds more strongly for an assertion: `as
      // const`, `satisfies string`, `!` and `<string>KEY` are erased before
      // anything runs, so what they evaluate to is the very key they wrap.
      // Naming none of these types made an asserted key fall through to
      // `return false`, and an alias records its initializer exactly as
      // written — so a type spelled onto an alias of an approved constant
      // withdrew the carve-out that same alias has without one, reporting a key
      // `prefer-global-router-state-key` accepts (#1840).
      if (isTypeAssertion(node)) {
        return isValidQueryKeyUsage(node.expression);
      }

      if (node.type === AST_NODE_TYPES.Identifier) {
        const importInfo = queryKeyImports.get(node.name);
        if (importInfo && isQueryKeysSource(importInfo.source)) {
          return isValidQueryKeyConstant(importInfo.imported);
        }

        // Check if it's a variable derived from a query key constant
        const assignment = variableAssignments.get(node.name);
        if (assignment) {
          return isValidQueryKeyUsage(assignment);
        }
      }

      // Allow member expressions accessing query key constants
      if (node.type === AST_NODE_TYPES.MemberExpression) {
        const member = node;
        if (
          member.object.type === AST_NODE_TYPES.Identifier &&
          !member.computed &&
          member.property.type === AST_NODE_TYPES.Identifier
        ) {
          const importInfo = queryKeyImports.get(member.object.name);
          if (importInfo && isQueryKeysSource(importInfo.source)) {
            if (importInfo.imported === '*') {
              return isValidQueryKeyConstant(member.property.name);
            }
            return isValidQueryKeyConstant(member.property.name);
          }
        }
      }

      // Allow template literals only when they contain no static content and all expressions are valid
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        const hasSignificantStaticPart = node.quasis.some((quasi) => {
          const content = quasi.value.raw.trim();
          return content.length > 0 && !/^[-_:/.]+$/.test(content);
        });

        if (node.expressions.length === 0) {
          // Pure static template acts like a string literal
          return false;
        }

        if (hasSignificantStaticPart) {
          return false;
        }

        return node.expressions.some((expr) => isValidQueryKeyUsage(expr));
      }

      if (
        node.type === AST_NODE_TYPES.BinaryExpression &&
        node.operator === '+'
      ) {
        return (
          isValidQueryKeyUsage(node.left) || isValidQueryKeyUsage(node.right)
        );
      }

      // Allow conditional expressions if both branches use valid query keys
      if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          isValidQueryKeyUsage(node.consequent) &&
          isValidQueryKeyUsage(node.alternate)
        );
      }

      // A call's return value is opaque to a syntactic check, so every call is
      // allowed rather than guessed at — the position
      // `prefer-global-router-state-key` takes and documents. Enumerating
      // factory names instead reported whichever spelling the enumeration
      // missed, including the `buildQueryKey` of the sibling's own documented
      // remedy (#1714).
      if (node.type === AST_NODE_TYPES.CallExpression) {
        return true;
      }

      return false;
    }

    /**
     * Check if a node contains string literals that should be reported
     */
    function containsInvalidStringLiteral(node: TSESTree.Node): boolean {
      // A type says nothing about where a key came from, and a literal under
      // one came from nowhere just the same. Answering on the assertion node
      // instead of what it wraps let `'key' as const` — and an asserted operand
      // of a concatenation or a ternary — pass for something other than a
      // string literal, so the only bare-key detector this rule has never ran
      // on it (#1842).
      if (isTypeAssertion(node)) {
        return containsInvalidStringLiteral(node.expression);
      }

      // Direct string literal
      if (
        node.type === AST_NODE_TYPES.Literal &&
        typeof node.value === 'string'
      ) {
        return true;
      }

      // String concatenation with + operator containing literals
      if (
        node.type === AST_NODE_TYPES.BinaryExpression &&
        node.operator === '+'
      ) {
        return (
          containsInvalidStringLiteral(node.left) ||
          containsInvalidStringLiteral(node.right)
        );
      }

      // Conditional (ternary) expression with string literals
      if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          containsInvalidStringLiteral(node.consequent) ||
          containsInvalidStringLiteral(node.alternate)
        );
      }

      // Template literal handling
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        const hasSignificantStaticPart = node.quasis.some((quasi) => {
          const content = quasi.value.raw.trim();
          return content.length > 0 && !/^[-_:/.]+$/.test(content);
        });

        if (node.expressions.length === 0) {
          // Pure static template behaves like a string literal
          return hasSignificantStaticPart;
        }

        // Any meaningful static content makes this invalid regardless of expressions
        if (hasSignificantStaticPart) {
          return true;
        }

        // Only dynamic parts remain; all expressions must be valid query key usages
        return !node.expressions.every((expr) => isValidQueryKeyUsage(expr));
      }

      return false;
    }

    /**
     * The key's value when it is knowable without running the program, paired
     * with the node that spells it.
     *
     * The substituted `QUERY_KEY_*` name is derived from that value, so what a
     * fix needs is the value — not the notation carrying it. Gating on the node
     * type instead left a static template reported exactly like the quoted
     * string it renders to but with no fix behind the report (#1803). Every
     * genuinely underivable shape — concatenation, a ternary, a template WITH
     * expressions — holds no single value and falls out here on its own, so the
     * conservative carve-out survives without being keyed to notation.
     *
     * Read through `cooked` rather than `raw` so an escape names the character
     * it renders to, and the two spellings of one key derive one constant.
     */
    function staticKeyOf(node: TSESTree.Node): {
      node: TSESTree.Literal | TSESTree.TemplateLiteral;
      text: string;
    } | null {
      if (node.type === AST_NODE_TYPES.Literal) {
        return typeof node.value === 'string'
          ? { node, text: node.value }
          : null;
      }
      if (
        node.type === AST_NODE_TYPES.TemplateLiteral &&
        node.expressions.length === 0
      ) {
        const cooked = node.quasis[0]?.value.cooked;
        // A cooked value is absent only for an invalid escape sequence, which
        // names no character and so cannot name a constant either.
        return typeof cooked === 'string' ? { node, text: cooked } : null;
      }
      return null;
    }

    /**
     * The span a substituted constant is written over: the literal together
     * with every assertion written onto it.
     *
     * The assertion is dropped rather than kept because it exists to shape the
     * literal, and the literal is what leaves. `as const` is illegal on a
     * reference (TS1355), so writing the constant *inside* the assertion would
     * trade a report for a file that no longer compiles; the other notations
     * survive that but only to restate a type the constant already has, since
     * `queryKeys.ts` exports it narrowed. Replacing the whole span is therefore
     * both the only uniformly compiling choice and the smaller edit to read.
     *
     * Null where a comment sits in the span the constant would cover: no
     * rewrite can know what a comment beside a key meant, and deleting it is
     * text this fixer does not own. The report then stands unfixed, which
     * leaves the author holding both the key and the comment.
     */
    function substitutionSpanOf(
      keyExpression: TSESTree.Node,
      staticKeyNode: TSESTree.Node,
    ): TSESTree.Node | null {
      if (keyExpression === staticKeyNode) {
        return keyExpression;
      }
      return sourceCode.getCommentsInside(keyExpression).length === 0
        ? keyExpression
        : null;
    }

    /**
     * The `QUERY_KEY_*` constant a key value names, or null when it names none.
     *
     * A key that is empty, or built only from the characters normalization
     * folds into separators and then strips, leaves nothing after the prefix:
     * the bare `QUERY_KEY_` that emitted is a name `queryKeys.ts` neither
     * exports nor plausibly would, so applying it traded a report for a file
     * that no longer compiles. Declining here leaves the report standing with
     * no fix, which is the honest outcome — the author has to choose a real
     * key, and no rewrite can choose one for them.
     *
     * The test is on the derived text alone, so it answers the same way for
     * every notation the same value can be written in; putting it in
     * `staticKeyOf` instead would gate the fix on content at the point that
     * exists to keep notation out of the gate (#1803, #1813).
     */
    function generateAutoFix(keyValue: string): string | null {
      const normalizedKey = keyValue
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');

      if (normalizedKey === '') {
        return null;
      }

      return `QUERY_KEY_${normalizedKey}`;
    }

    return {
      // Track imports from queryKeys.ts
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          typeof node.source.value === 'string'
        ) {
          const source = node.source.value;
          if (isQueryKeysSource(source)) {
            node.specifiers.forEach((spec) => {
              if (spec.type === AST_NODE_TYPES.ImportSpecifier) {
                const imported = spec.imported.name;
                const local = spec.local.name;
                queryKeyImports.set(local, { source, imported });
              } else if (
                spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier
              ) {
                const local = spec.local.name;
                queryKeyImports.set(local, { source, imported: '*' });
              }
            });
          }

          node.specifiers.forEach((spec) => {
            if (
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.type === AST_NODE_TYPES.Identifier &&
              spec.imported.name === 'useRouterState'
            ) {
              localUseRouterStateNames.add(spec.local.name);
            }
          });
        }
      },

      // Track variable declarations that might derive from query key constants
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (node.id.type !== AST_NODE_TYPES.Identifier) return;
        const { name } = node.id;
        declarationCounts.set(name, (declarationCounts.get(name) ?? 0) + 1);
        if (node.init) {
          variableAssignments.set(name, node.init);
        }
        if (!node.init || isUndefinedIdentifier(node.init)) {
          declaredUndefined.add(name);
        }
      },

      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        if (node.left.type !== AST_NODE_TYPES.Identifier) return;
        const { name } = node.left;
        const assignmentCount = (assignmentCounts.get(name) ?? 0) + 1;
        assignmentCounts.set(name, assignmentCount);

        // Only a plain `=` makes the right-hand side the variable's value in
        // general. A compound assignment leaves the prior value reachable
        // (`key ||= K` is the old key OR K), so recording the operand would
        // launder an unapproved key into an approved one.
        if (node.operator === '=') {
          variableAssignments.set(name, node.right);
          return;
        }

        // The exception is a `||=`/`??=` onto a variable still holding
        // `undefined`, which is both falsy and nullish: the assignment always
        // happens, so the operand IS the value. A single declaration and a
        // single assignment are what keep that provable — a second assignment
        // anywhere puts a prior value back in play. `+=` is excluded because it
        // concatenates onto `undefined` and yields neither operand.
        //
        // The operand is recorded rather than exempted, so it still has to be
        // an approved constant to pass.
        if (
          (node.operator === '||=' || node.operator === '??=') &&
          declaredUndefined.has(name) &&
          declarationCounts.get(name) === 1 &&
          assignmentCount === 1
        ) {
          variableAssignments.set(name, node.right);
        }
      },

      // Check useRouterState calls
      CallExpression(node: TSESTree.CallExpression) {
        // Check if this is a call to useRouterState
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          localUseRouterStateNames.has(node.callee.name)
        ) {
          // Check if there are arguments
          if (node.arguments.length > 0) {
            const firstArg = node.arguments[0];

            // Check if the first argument is an object expression
            if (firstArg.type === AST_NODE_TYPES.ObjectExpression) {
              // Find the key property in the object
              const keyProperty = firstArg.properties.find(
                (prop): prop is TSESTree.Property =>
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'key',
              );

              // If key property exists, check its value
              if (keyProperty && keyProperty.value) {
                const keyExpression = keyProperty.value;
                // A type written onto the key is erased before anything runs,
                // so what the arms below have to judge is the key underneath
                // it. Dispatching on the node as written asked about the
                // assertion — a node type neither arm names — so an invalid key
                // escaped the rule altogether merely by carrying one, while the
                // resolver behind `isValidQueryKeyUsage` had long since seen
                // through it: detecting and resolving are separate paths, and
                // widening one leaves the other exactly as it was (#1842).
                // Reporting the unwrapped node puts the report on the same key
                // the unasserted spelling reports.
                const keyValue = unwrapTypeAssertions(keyExpression);

                // Check if it's a valid query key usage
                if (!isValidQueryKeyUsage(keyValue)) {
                  // Check if it contains invalid string literals
                  if (containsInvalidStringLiteral(keyValue)) {
                    // Only a statically known key value can be auto-fixed.
                    const staticKey = staticKeyOf(keyValue);
                    const suggestedConstant = staticKey
                      ? generateAutoFix(staticKey.text)
                      : null;
                    const span = staticKey
                      ? substitutionSpanOf(keyExpression, staticKey.node)
                      : null;
                    pendingReports.push({
                      node: keyValue,
                      messageId: 'enforceQueryKeyImport',
                      substitution:
                        span && suggestedConstant
                          ? {
                              keyNode: span,
                              constant: suggestedConstant,
                              scope: scopeOf(keyValue),
                            }
                          : undefined,
                    });
                  } else if (
                    keyValue.type === AST_NODE_TYPES.Identifier &&
                    !isParameterBinding(keyValue)
                  ) {
                    // Report variables that aren't from the correct source
                    pendingReports.push({
                      node: keyValue,
                      messageId: 'enforceQueryKeyConstant',
                      data: {
                        variableName: keyValue.name,
                      },
                    });
                  }
                }
              }
            }
          }
        }
      },

      'Program:exit'() {
        flushReports();
      },
    };
  },
});
