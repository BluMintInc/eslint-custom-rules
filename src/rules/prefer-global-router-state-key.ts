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
 * Rule to enforce the use of centralized router state key constants imported from
 * `src/util/routing/queryKeys.ts` instead of arbitrary string literals when calling
 * router methods that accept key parameters.
 */
export const preferGlobalRouterStateKey = createRule<[], MessageIds>({
  name: 'prefer-global-router-state-key',
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
      preferGlobalRouterStateKey:
        'Router state key {{keyValue}} is a string literal. String literals bypass the shared queryKeys.ts QUERY_KEY_* constants, which leads to duplicate router cache entries and makes allowed keys hard to discover. Import the corresponding QUERY_KEY_* constant from "src/util/routing/queryKeys" (a relative path to that module, or an approved re-export) and pass that to useRouterState instead.',
      invalidQueryKeySource:
        'Router state key variable "{{variableName}}" is not sourced from queryKeys.ts. useRouterState keys must come from QUERY_KEY_* exports so routing cache keys stay stable and traceable. Import the matching constant from "src/util/routing/queryKeys" (a relative path to that module, or an approved re-export) and use that value here instead of {{variableName}}.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
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
     * Generate auto-fix suggestion for string literals
     */
    function generateAutoFix(keyValue: string): string | null {
      const normalizedKey = keyValue
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');

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
        if (node.id.type === AST_NODE_TYPES.Identifier && node.init) {
          variableAssignments.set(node.id.name, node.init);
        }
      },

      // Track assignment expressions
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        if (
          node.left.type === AST_NODE_TYPES.Identifier &&
          node.operator === '='
        ) {
          variableAssignments.set(node.left.name, node.right);
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

                if (!isValidQueryKeyUsage(keyValue)) {
                  if (containsInvalidStringLiteral(keyValue)) {
                    context.report({
                      node: keyValue,
                      messageId: 'preferGlobalRouterStateKey',
                      data: {
                        keyValue: sourceCode.getText(keyValue),
                      },
                      fix(fixer) {
                        // Only a statically known key value can be auto-fixed.
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
                                const lastSpecifier =
                                  importSpecifiers[importSpecifiers.length - 1];
                                fixes.push(
                                  fixer.insertTextAfter(
                                    lastSpecifier,
                                    `, ${suggestedConstant}`,
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
                    keyValue.type === AST_NODE_TYPES.Identifier &&
                    !isParameterBinding(keyValue)
                  ) {
                    context.report({
                      node: keyValue,
                      messageId: 'invalidQueryKeySource',
                      data: {
                        variableName: keyValue.name,
                      },
                    });
                  } else if (
                    keyValue.type === AST_NODE_TYPES.MemberExpression
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
