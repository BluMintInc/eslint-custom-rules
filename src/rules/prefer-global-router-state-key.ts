import path from 'path';
import {
  AST_NODE_TYPES,
  ASTUtils,
  TSESTree,
  TSESLint,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import {
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

type MessageIds = 'preferGlobalRouterStateKey' | 'invalidQueryKeySource';

type Options = [
  {
    printWidth?: number;
  },
];

/**
 * Prettier's own default. The fixer extends an import statement a formatter
 * owns, so a specifier list it runs past this width is rewritten by the next
 * `prettier --write` — and fails `prettier --check` until then (#2051).
 */
const DEFAULT_PRINT_WIDTH = 80;

/**
 * Prettier's default `tabWidth`, used for an import the source has not already
 * broken across lines and so offers no step to copy.
 */
const DEFAULT_INDENT_STEP = '  ';

// The module's path below the project root doubles as the bare specifier,
// which is precisely why the root tsconfig `paths` and the Jest mapper resolve
// it.
const QUERY_KEYS_MODULE = 'src/util/routing/queryKeys';
const QUERY_KEYS_SUFFIX = 'util/routing/queryKeys';
const SRC_TIER_SEGMENT = '/src/';

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
 * root tsconfig `paths` and the Jest `moduleNameMapper` both resolve. An
 * `@/`-aliased specifier resolves under none of tsc, webpack or Jest, so a
 * hardcoded one turns every fix into a broken import (#1390).
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
 * The expression a key ultimately comes from, read through the wrappers that
 * restate it without relocating it.
 *
 * A chain records that the access short-circuits and an assertion restates a
 * type; neither changes WHERE the key comes from, which is the only question
 * the report-site dispatch asks. That dispatch enumerates the node types it
 * knows and stays silent on everything else, so a key passed directly as
 * `config?.queryKey` or `config.queryKey as string` matched no arm and the
 * unapproved source went unreported (#1836) — the silent mirror of the
 * over-reporting #1833 removed from the key-source classifier.
 *
 * A `ConditionalExpression` is deliberately NOT resolved here: it holds two
 * branches and therefore no single source, so there is nothing for this to
 * return. Its literal-bearing shapes already report through
 * `containsInvalidStringLiteral`, which judges the whole expression; the
 * branch-by-branch verdict a ternary of unapproved sources would need is a
 * separate policy, and one that would have to answer for the per-source
 * parameter carve-out (#1394) that only the identifier arm applies. The same
 * holds for a logical expression's operands.
 */
function unwrapTransparentKeySource(node: TSESTree.Node): TSESTree.Node {
  switch (node.type) {
    case AST_NODE_TYPES.ChainExpression:
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
      return unwrapTransparentKeySource(node.expression);
    default:
      return node;
  }
}

/**
 * The whitespace `node` sits behind on its own line, or '' when anything else
 * shares that line. Used only to line the emitted continuation lines up with
 * the declaration they belong to; a real import is at column 0, since the
 * grammar admits one only at module top level.
 */
function lineIndentOf(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
): string {
  const text = sourceCode.getText();
  const lineStart = text.lastIndexOf('\n', node.range[0] - 1) + 1;
  const prefix = text.slice(lineStart, node.range[0]);
  return /^[ \t]*$/.test(prefix) ? prefix : '';
}

/**
 * The nesting step the declaration already uses when the source has broken it
 * across lines, so re-rendering keeps the author's unit rather than imposing
 * two spaces on a tab-indented or four-space file.
 */
function specifierIndentStepOf(
  sourceCode: TSESLint.SourceCode,
  declaration: TSESTree.ImportDeclaration,
  declarationIndent: string,
): string {
  const first = declaration.specifiers[0];
  if (!first) {
    return DEFAULT_INDENT_STEP;
  }
  const indent = lineIndentOf(sourceCode, first);
  return indent.length > declarationIndent.length &&
    indent.startsWith(declarationIndent)
    ? indent.slice(declarationIndent.length)
    : DEFAULT_INDENT_STEP;
}

/**
 * The edit that adds `addition` to an existing `queryKeys` named import.
 *
 * Prettier owns this statement's shape and makes an all-or-nothing choice about
 * it: a named import list either stays entirely on one line, or breaks with
 * EVERY specifier on its own line (measured — prettier never packs two
 * specifiers onto a continuation line). Which one it picks is decided by the
 * rendered line's own length against the print width, at column 0: the grammar
 * admits an import only at module top level, so that is the column prettier
 * prints it at whatever column the source indents it to. Measuring the source
 * column instead would expand an import prettier then collapses straight back,
 * trading one `prettier --check` failure for its mirror image.
 *
 * A lone specifier is exempt in both directions — prettier keeps it on one line
 * at any length and collapses a pre-expanded one — which is why the sibling
 * emission path that writes a fresh single-specifier import is left alone. This
 * branch always ends at two or more specifiers, so it never meets that case.
 *
 * Appending to the last specifier — the historical edit — ignored the
 * declaration's rendered form entirely and so failed BOTH ways: it ran a
 * two-specifier list past the width, and it welded the new name onto the last
 * populated line of an already-expanded import, which is under the width yet
 * still not what prettier prints (#2051).
 */
function extendQueryKeysImport(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  declaration: TSESTree.ImportDeclaration,
  specifiers: TSESTree.ImportSpecifier[],
  addition: string,
  printWidth: number,
): TSESLint.RuleFix {
  const lastSpecifier = specifiers[specifiers.length - 1];
  const appendInPlace = () =>
    fixer.insertTextAfter(lastSpecifier, `, ${addition}`);

  const tail = sourceCode
    .getText()
    .slice(declaration.source.range[1], declaration.range[1]);

  // Re-rendering writes the whole declaration, so it is only reached where the
  // declaration carries nothing this function does not reproduce. An import
  // attribute clause (`with { type: 'json' }`) lives in that tail; a comment
  // between the specifiers, or a default/namespace specifier alongside them,
  // would be written over. None of the three is reachable from a real
  // `queryKeys` import, and each makes the in-place append the honest edit:
  // this arm declines the wrap DELIBERATELY rather than by falling through,
  // because a formatting nicety does not justify deleting a comment or a
  // binding (#2045 — a declined wrap must be a decision, not an accident).
  if (
    !/^\s*;?\s*$/.test(tail) ||
    specifiers.length !== declaration.specifiers.length ||
    sourceCode.getCommentsInside(declaration).length > 0
  ) {
    return appendInPlace();
  }

  const names = [
    ...specifiers.map((specifier) => sourceCode.getText(specifier)),
    addition,
  ];
  const source = sourceCode.getText(declaration.source);
  // An absent semicolon is the author's, and prettier's `semi: false` keeps it
  // absent, so the re-render restates what the declaration already spells.
  const semicolon = tail.includes(';') ? ';' : '';
  const oneLine = `import { ${names.join(', ')} } from ${source}${semicolon}`;

  if (oneLine.length <= printWidth) {
    // Re-rendering rather than appending also collapses an import the source
    // left expanded but that now fits, which is precisely what prettier does
    // with one.
    return fixer.replaceText(declaration, oneLine);
  }

  const declarationIndent = lineIndentOf(sourceCode, declaration);
  const step = specifierIndentStepOf(
    sourceCode,
    declaration,
    declarationIndent,
  );
  const wrapped = [
    'import {',
    ...names.map((name) => `${declarationIndent}${step}${name},`),
    `${declarationIndent}} from ${source}${semicolon}`,
  ].join('\n');
  return fixer.replaceText(declaration, wrapped);
}

/**
 * Rule to enforce the use of centralized router state key constants imported from
 * `src/util/routing/queryKeys.ts` instead of arbitrary string literals when calling
 * router methods that accept key parameters.
 */
export const preferGlobalRouterStateKey = createRule<Options, MessageIds>({
  name: 'prefer-global-router-state-key',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce using centralized router state key constants from queryKeys.ts for useRouterState key parameter',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          printWidth: {
            type: 'number',
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferGlobalRouterStateKey:
        'Router state key {{keyValue}} is a string literal. String literals bypass the shared queryKeys.ts QUERY_KEY_* constants, which leads to duplicate router cache entries and makes allowed keys hard to discover. Import the corresponding QUERY_KEY_* constant from "src/util/routing/queryKeys" (a relative path to that module, or an approved re-export) and pass that to useRouterState instead.',
      invalidQueryKeySource:
        'Router state key variable "{{variableName}}" is not sourced from queryKeys.ts. useRouterState keys must come from QUERY_KEY_* exports so routing cache keys stay stable and traceable. Import the matching constant from "src/util/routing/queryKeys" (a relative path to that module, or an approved re-export) and use that value here instead of {{variableName}}.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const sourceCode = context.getSourceCode();

    const printWidth =
      typeof options.printWidth === 'number' && options.printWidth > 0
        ? options.printWidth
        : DEFAULT_PRINT_WIDTH;
    const cwd =
      typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();
    const absoluteFilename = toAbsoluteFilename(context.getFilename(), cwd);
    const queryKeysSpecifier = buildQueryKeysSpecifier(
      context.getFilename(),
      cwd,
    );
    // Prevent duplicate import insertions when multiple fixes target the same query key constant.
    const scheduledQueryKeyNamedImports = new Set<string>();
    // Track imports from queryKeys.ts
    const queryKeyImports = new Map<
      string,
      {
        source: string;
        imported: string;
        isNamespace?: boolean;
        isDefault?: boolean;
      }
    >();

    // Track namespace imports (import * as QueryKeys from ...)
    const namespaceImports = new Map<string, string>();

    // Track default imports (import queryKeys from ...)
    const defaultImports = new Map<string, string>();

    // Track re-exports and variable assignments
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

    const validQueryKeySources = new Set<string>([
      'util/routing/queryKeys',
      'constants',
      'constants/index',
    ]);

    /**
     * Check if a source path refers to queryKeys.ts or re-exports from it
     */
    function isQueryKeysSource(source: string): boolean {
      const normalized = source
        .replace(/^@\/|^src\//, '')
        .replace(/^(\.\/|\.\.\/)+/, '');

      if (
        validQueryKeySources.has(normalized) ||
        normalized.endsWith(QUERY_KEYS_SUFFIX)
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

    /**
     * Check if an identifier is a valid QUERY_KEY constant
     */
    function isValidQueryKeyConstant(name: string): boolean {
      return name.startsWith('QUERY_KEY_');
    }

    /**
     * Whether every declaration of a visible binding is the very import the fix
     * wants to reference: a value `ImportSpecifier` of `constant` taken from
     * queryKeys.ts, under any local name. Read off the specifier nodes the scope
     * points at rather than off the traversal maps, so an import written below
     * the call site — which the `ImportDeclaration` visitor has not recorded by
     * the time the fix runs — is recognized instead of duplicated.
     *
     * Any other binding (a local declaration, a parameter, an alias of a
     * different export, a type-only specifier) means a bare reference to the
     * name would resolve somewhere other than the constant.
     */
    function bindsQueryKeyConstant(
      variable: TSESLint.Scope.Variable,
      constant: string,
    ): boolean {
      return (
        variable.defs.length > 0 &&
        variable.defs.every((def) => {
          const specifier = def.node as TSESTree.Node;
          if (
            specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
            specifier.importKind === 'type' ||
            specifier.imported.name !== constant
          ) {
            return false;
          }
          const declaration = specifier.parent;
          return (
            declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
            declaration.importKind !== 'type' &&
            declaration.source.type === AST_NODE_TYPES.Literal &&
            typeof declaration.source.value === 'string' &&
            isQueryKeysSource(declaration.source.value)
          );
        })
      );
    }

    /**
     * Whether every declaration of a visible binding is the namespace or
     * default import of queryKeys.ts that a qualified `alias.CONSTANT` fix
     * reaches the constant through. The alias only carries the module's
     * exports where it still resolves to that import at the reference: an inner
     * `const QueryKeys = {…}` captures the emitted reference, the member access
     * type-checks against the object, and the router key silently becomes that
     * object's value instead of the shared constant.
     */
    function bindsQueryKeysModule(variable: TSESLint.Scope.Variable): boolean {
      return (
        variable.defs.length > 0 &&
        variable.defs.every((def) => {
          const specifier = def.node as TSESTree.Node;
          if (
            specifier.type !== AST_NODE_TYPES.ImportNamespaceSpecifier &&
            specifier.type !== AST_NODE_TYPES.ImportDefaultSpecifier
          ) {
            return false;
          }
          const declaration = specifier.parent;
          return (
            declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
            declaration.importKind !== 'type' &&
            declaration.source.type === AST_NODE_TYPES.Literal &&
            typeof declaration.source.value === 'string' &&
            isQueryKeysSource(declaration.source.value)
          );
        })
      );
    }

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
     * A parameter binding holds a different value on every call, so no single
     * `QUERY_KEY_*` constant can stand in for it: a hook that iterates a
     * constant array of keys hands each one to a callback parameter by design
     * (#1394). Reporting such an identifier demands a substitution that does not
     * exist, and the caller — not this file — decides which key is passed.
     */
    function isParameterBinding(identifier: TSESTree.Identifier): boolean {
      const variable = ASTUtils.findVariable(scopeOf(identifier), identifier);
      const definition = variable?.defs[0];
      return definition?.type === TSESLint.Scope.DefinitionType.Parameter;
    }

    /**
     * Check if a node represents a valid query key usage
     */
    function isValidQueryKeyUsage(node: TSESTree.Node): boolean {
      // `config?.getQueryKey()` parses as a `ChainExpression` wrapping the call,
      // a type this dispatch does not name — so the optional spelling alone fell
      // past every arm below and reported a key source the plain spelling is
      // allowed to build (#1833). Optionality is orthogonal to the question
      // asked here: a short-circuit changes only whether the same source is
      // evaluated, never which source it is. Resolving to the node underneath
      // rather than accepting the wrapper keeps an unapproved source reported
      // through the chain, which is what stops this from becoming a blanket
      // escape hatch. The sibling `enforce-querykey-ts` carries the same arm
      // (#1832), and both rules ship as `error`, so a source one blesses must
      // not be the other's violation (#1714).
      if (node.type === AST_NODE_TYPES.ChainExpression) {
        return isValidQueryKeyUsage(node.expression);
      }

      if (node.type === AST_NODE_TYPES.Identifier) {
        // Check direct imports
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
        if (node.object.type === AST_NODE_TYPES.Identifier) {
          // Check namespace imports (QueryKeys.QUERY_KEY_USER)
          const namespaceSource = namespaceImports.get(node.object.name);
          if (namespaceSource && isQueryKeysSource(namespaceSource)) {
            if (node.property.type === AST_NODE_TYPES.Identifier) {
              return isValidQueryKeyConstant(node.property.name);
            }
            return false; // Invalid property access on namespace import
          }

          // Check default imports (queryKeys.QUERY_KEY_USER)
          const defaultSource = defaultImports.get(node.object.name);
          if (defaultSource && isQueryKeysSource(defaultSource)) {
            return true; // Allow any property access on default imports
          }

          // Check regular imports
          const importInfo = queryKeyImports.get(node.object.name);
          if (importInfo && isQueryKeysSource(importInfo.source)) {
            return true;
          }
        }
      }

      // Allow template literals if they use valid query keys
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        if (node.expressions.length > 0) {
          return node.expressions.some((expr) => isValidQueryKeyUsage(expr));
        }
        // Template literals with no expressions are just static strings
        return false;
      }

      // Allow binary expressions if they use valid query keys
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

      // Allow function calls that might return query keys
      if (node.type === AST_NODE_TYPES.CallExpression) {
        return true; // Permissive for function calls
      }

      // Allow type assertions (key as const)
      if (node.type === AST_NODE_TYPES.TSAsExpression) {
        return isValidQueryKeyUsage(node.expression);
      }

      if (node.type === AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      return false;
    }

    /**
     * Check if a node contains string literals that should be reported
     */
    function containsInvalidStringLiteral(node: TSESTree.Node): boolean {
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

      // Template literal with static parts (but allow if it uses query key variables)
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        // If no expressions, it's just a static template literal
        if (node.expressions.length === 0) {
          return true;
        }

        const hasSignificantStaticPart = node.quasis.some((quasi) => {
          const content = quasi.value.raw.trim();
          return content.length > 0 && !/^[-_:/.]+$/.test(content);
        });
        if (hasSignificantStaticPart) {
          return !node.expressions.every((expr) => isValidQueryKeyUsage(expr));
        }
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
     * string it renders to but with no fix behind the report (#1804). Every
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
     * exists to keep notation out of the gate (#1804, #1811).
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

    /**
     * Helper to find a key in an import map based on a predicate
     */
    function findImportKey<T>(
      importMap: Map<string, T>,
      predicate: (value: T) => boolean,
    ): string | undefined {
      return Array.from(importMap.entries()).find(([, value]) =>
        predicate(value),
      )?.[0];
    }

    return {
      // Track imports from queryKeys.ts
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.importKind === 'type') return;

        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          typeof node.source.value === 'string'
        ) {
          const source = node.source.value;
          if (isQueryKeysSource(source)) {
            node.specifiers.forEach((spec) => {
              if (spec.type === AST_NODE_TYPES.ImportSpecifier) {
                if (spec.importKind === 'type') return;

                const imported = spec.imported.name;
                const local = spec.local.name;
                queryKeyImports.set(local, { source, imported });
              } else if (
                spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier
              ) {
                namespaceImports.set(spec.local.name, source);
              } else if (spec.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
                defaultImports.set(spec.local.name, source);
              }
            });
          }
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

      // Track assignment expressions
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
          node.callee.name === 'useRouterState'
        ) {
          if (node.arguments.length > 0) {
            const firstArg = node.arguments[0];

            if (firstArg.type === AST_NODE_TYPES.ObjectExpression) {
              const keyProperty = firstArg.properties.find(
                (prop): prop is TSESTree.Property =>
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'key',
              );

              if (keyProperty && keyProperty.value) {
                const keyValue = keyProperty.value;
                // Every question below is about the source, so each is asked of
                // the source rather than of the notation wrapping it. The
                // report still names `keyValue`: the whole key expression is
                // what an author replaces with the constant, and naming only
                // the part underneath an `as const` would prescribe an edit
                // that does not compile (TS1355).
                const keySource = unwrapTransparentKeySource(keyValue);

                if (!isValidQueryKeyUsage(keySource)) {
                  if (containsInvalidStringLiteral(keySource)) {
                    context.report({
                      node: keyValue,
                      messageId: 'preferGlobalRouterStateKey',
                      data: {
                        keyValue: sourceCode.getText(keyValue),
                      },
                      fix(fixer) {
                        // Only a statically known key value can be auto-fixed,
                        // and the value read is the one the key is WRITTEN as,
                        // wrapper included. A wrapper carries no static value,
                        // so a wrapped literal reports with no fix behind it:
                        // substituting the constant underneath the wrapper
                        // would leave `QUERY_KEY_X as const`, which TypeScript
                        // rejects outright (TS1355), and there is no rewrite
                        // that both keeps the assertion and names a constant.
                        const staticKey = staticKeyOf(keyValue);
                        if (staticKey) {
                          const suggestedConstant = generateAutoFix(
                            staticKey.text,
                          );
                          if (suggestedConstant) {
                            const fixes: TSESLint.RuleFix[] = [];

                            const namespaceAlias = findImportKey(
                              namespaceImports,
                              isQueryKeysSource,
                            );
                            const defaultAlias = findImportKey(
                              defaultImports,
                              isQueryKeysSource,
                            );

                            // Check if the constant is already imported (possibly with an alias)
                            const existingNamedImport = findImportKey(
                              queryKeyImports,
                              (info) =>
                                isQueryKeysSource(info.source) &&
                                info.imported === suggestedConstant,
                            );
                            const localName = existingNamedImport;

                            const importAlias = namespaceAlias ?? defaultAlias;
                            const formatConstantReference = (
                              alias: string | undefined,
                              constant: string,
                            ): string =>
                              alias ? `${alias}.${constant}` : constant;

                            const replacementText = localName
                              ? localName
                              : formatConstantReference(
                                  importAlias,
                                  suggestedConstant,
                                );

                            // An already-imported constant is referenced by its
                            // own local name, so the alias leads the emitted
                            // text only when no such import exists.
                            const referenceAlias = localName
                              ? undefined
                              : importAlias;
                            // Both hazards below turn on what the emitted text's
                            // leading name resolves to where it is written, so
                            // the scope chain is entered at the literal rather
                            // than at module scope.
                            const scopeAtLiteral = ASTHelpers.getScope(
                              context,
                              keyValue,
                            );

                            // The qualified `alias.CONSTANT` form claims no name
                            // of its own, yet it reaches the module's exports
                            // only while the alias still resolves to that import
                            // here. An inner binding of the alias captures it
                            // silently — the member access type-checks against
                            // whatever the local holds — so the router key would
                            // become that value instead of the constant.
                            if (referenceAlias) {
                              const aliasBinding =
                                ASTHelpers.findVariableInScope(
                                  scopeAtLiteral,
                                  referenceAlias,
                                );
                              if (
                                !aliasBinding ||
                                !bindsQueryKeysModule(aliasBinding)
                              ) {
                                return null;
                              }
                            }

                            // A binding that already owns the emitted name
                            // makes both halves of the edit wrong: the inserted
                            // import becomes a second declaration of it
                            // (TS2440/TS2300), and a shadowing local or
                            // parameter captures the bare reference with no
                            // diagnostic at all. Declining leaves the report in
                            // place for the author to resolve.
                            const visibleBinding = referenceAlias
                              ? null
                              : ASTHelpers.findVariableInScope(
                                  scopeAtLiteral,
                                  replacementText,
                                );
                            const bindingIsQueryKeyImport =
                              visibleBinding !== null &&
                              bindsQueryKeyConstant(
                                visibleBinding,
                                suggestedConstant,
                              );
                            if (visibleBinding && !bindingIsQueryKeyImport) {
                              return null;
                            }

                            // 1) Replace the key with the constant (qualify if alias exists)
                            fixes.push(
                              fixer.replaceText(
                                staticKey.node,
                                replacementText,
                              ),
                            );

                            // 2) Ensure an import exists for the suggested constant
                            const hasNamespaceOrDefault = Boolean(importAlias);

                            if (
                              !existingNamedImport &&
                              !hasNamespaceOrDefault
                            ) {
                              // The name resolves to the very import this fix
                              // would write — one declared below this call site,
                              // which the traversal maps miss — so the
                              // replacement alone is the complete edit.
                              if (bindingIsQueryKeyImport) {
                                return fixes;
                              }
                              if (
                                scheduledQueryKeyNamedImports.has(
                                  suggestedConstant,
                                )
                              ) {
                                return fixes;
                              }
                              const importText =
                                queryKeysSpecifier === null
                                  ? null
                                  : `import { ${suggestedConstant} } from '${queryKeysSpecifier}';\n`;
                              const queryKeysNamedImport =
                                sourceCode.ast.body.find(
                                  (n): n is TSESTree.ImportDeclaration =>
                                    n.type ===
                                      AST_NODE_TYPES.ImportDeclaration &&
                                    n.importKind !== 'type' &&
                                    n.source.type === AST_NODE_TYPES.Literal &&
                                    typeof n.source.value === 'string' &&
                                    isQueryKeysSource(n.source.value) &&
                                    n.specifiers.some(
                                      (s) =>
                                        s.type ===
                                        AST_NODE_TYPES.ImportSpecifier,
                                    ),
                                );
                              const sideEffectImport = sourceCode.ast.body.find(
                                (n): n is TSESTree.ImportDeclaration =>
                                  n.type === AST_NODE_TYPES.ImportDeclaration &&
                                  n.source.type === AST_NODE_TYPES.Literal &&
                                  typeof n.source.value === 'string' &&
                                  isQueryKeysSource(n.source.value) &&
                                  n.specifiers.length === 0,
                              );

                              if (queryKeysNamedImport) {
                                const importSpecifiers =
                                  queryKeysNamedImport.specifiers.filter(
                                    (spec): spec is TSESTree.ImportSpecifier =>
                                      spec.type ===
                                      AST_NODE_TYPES.ImportSpecifier,
                                  );
                                fixes.push(
                                  extendQueryKeysImport(
                                    fixer,
                                    sourceCode,
                                    queryKeysNamedImport,
                                    importSpecifiers,
                                    suggestedConstant,
                                    printWidth,
                                  ),
                                );
                              } else if (importText === null) {
                                // Extending an existing named import needs no
                                // specifier of its own, so only a freshly
                                // written import statement depends on one being
                                // derivable.
                                return null;
                              } else if (sideEffectImport) {
                                fixes.push(
                                  fixer.replaceText(
                                    sideEffectImport,
                                    importText.trimEnd(),
                                  ),
                                );
                              } else {
                                const firstImport =
                                  sourceCode.ast.body.find(
                                    (n): n is TSESTree.ImportDeclaration =>
                                      n.type ===
                                        AST_NODE_TYPES.ImportDeclaration &&
                                      n.importKind !== 'type',
                                  ) ||
                                  sourceCode.ast.body.find(
                                    (n): n is TSESTree.ImportDeclaration =>
                                      n.type ===
                                      AST_NODE_TYPES.ImportDeclaration,
                                  );

                                if (firstImport) {
                                  fixes.push(
                                    fixer.insertTextBefore(
                                      firstImport,
                                      importText,
                                    ),
                                  );
                                } else {
                                  // A file's first import may cross only the
                                  // whitespace the source opens with. The
                                  // shared anchor is the floor of that climb:
                                  // it clears the directive prologue, but
                                  // also a `#!` shebang or a leading header
                                  // comment, which text spliced at character
                                  // 0 would displace.
                                  const anchor =
                                    importInsertionAnchor(sourceCode);
                                  const anchorIndex =
                                    anchor.kind === 'before'
                                      ? anchor.target.range[0]
                                      : anchor.index;
                                  const opensFile =
                                    sourceCode.text
                                      .slice(0, anchorIndex)
                                      .trim() === '';
                                  fixes.push(
                                    insertAtImportAnchor(
                                      sourceCode,
                                      fixer,
                                      opensFile
                                        ? { kind: 'index', index: 0 }
                                        : anchor,
                                      importText,
                                    ),
                                  );
                                }
                              }
                              scheduledQueryKeyNamedImports.add(
                                suggestedConstant,
                              );
                            }

                            return fixes;
                          }
                        }
                        return null;
                      },
                    });
                  } else if (
                    // A key with no literal in it reports only where it names
                    // one source the author can swap out. A parameter is not
                    // one: it holds a different value on every call, and the
                    // caller — not this file — chooses it (#1394).
                    (keySource.type === AST_NODE_TYPES.Identifier &&
                      !isParameterBinding(keySource)) ||
                    keySource.type === AST_NODE_TYPES.MemberExpression
                  ) {
                    context.report({
                      node: keyValue,
                      messageId: 'invalidQueryKeySource',
                      data: {
                        variableName: sourceCode.getText(keyValue),
                      },
                    });
                  }
                }
              }
            }
          }
        }
      },
    };
  },
});
