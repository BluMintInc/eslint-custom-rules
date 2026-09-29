import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

type MessageIds = 'requireSxPropsTheme';

type Scope = TSESLint.Scope.Scope;
type Variable = TSESLint.Scope.Variable;

/**
 * Every module MUI re-exports `SxProps` from. Matching on the module and the
 * imported name, never the local name, is what lets a renamed import report
 * and a same-named local type or shim stay silent.
 */
const SX_PROPS_SOURCES = new Set([
  '@mui/material',
  '@mui/material/styles',
  '@mui/system',
  '@mui/system/styleFunctionSx',
]);

/**
 * The module a MUI app augments its theme through
 * (`declare module '@mui/material/styles' { interface Theme { … } }`), so it is
 * the only source whose `Theme` is provably the app theme, whichever module
 * `SxProps` itself came from.
 */
const THEME_SOURCE = '@mui/material/styles';

const SX_PROPS_NAME = 'SxProps';
const THEME_NAME = 'Theme';

type ImportClause =
  | TSESTree.ImportSpecifier
  | TSESTree.ImportDefaultSpecifier
  | TSESTree.ImportNamespaceSpecifier;

/**
 * The type argument list, read from whichever property the host
 * `@typescript-eslint` version populates: v5 fills `typeParameters`, v6 adds
 * `typeArguments`, and v8 drops `typeParameters` from `TSTypeReference`.
 */
function hasTypeArguments(node: TSESTree.TSTypeReference): boolean {
  const { typeArguments } = node as { typeArguments?: unknown };
  return Boolean(typeArguments ?? node.typeParameters);
}

/**
 * `import { "SxProps" as Sx }` arrives as a string literal on parsers that
 * support arbitrary module namespace names, so both spellings are read.
 */
function importedNameOf(specifier: TSESTree.ImportSpecifier): string {
  const imported = specifier.imported as
    | TSESTree.Identifier
    | TSESTree.StringLiteral;
  return imported.type === AST_NODE_TYPES.Identifier
    ? imported.name
    : imported.value;
}

/**
 * ES import declarations sit at the top level or directly inside an ambient
 * `declare module '…' { }` block; nothing else can hold one.
 */
function collectImportDeclarations(
  statements: readonly TSESTree.Node[],
  into: TSESTree.ImportDeclaration[],
): void {
  for (const statement of statements) {
    if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
      into.push(statement);
    } else if (
      statement.type === AST_NODE_TYPES.TSModuleDeclaration &&
      statement.body?.type === AST_NODE_TYPES.TSModuleBlock
    ) {
      collectImportDeclarations(statement.body.body, into);
    }
  }
}

/**
 * The innermost binding of `name` visible from `scope`. A value-only binding
 * stops the walk even though TypeScript would look past it for a type name;
 * that errs toward silence, never toward a wrong report or fix.
 */
function findVariable(scope: Scope, name: string): Variable | undefined {
  let current: Scope | null = scope;
  while (current) {
    const variable = current.set.get(name);
    if (variable) {
      return variable;
    }
    current = current.upper;
  }
  return undefined;
}

function importClauseOf(
  variable: Variable | undefined,
): ImportClause | undefined {
  if (!variable || variable.defs.length !== 1) {
    return undefined;
  }
  const [definition] = variable.defs;
  if (definition.type !== 'ImportBinding') {
    return undefined;
  }
  const clause = definition.node as TSESTree.Node;
  return clause.type === AST_NODE_TYPES.ImportSpecifier ||
    clause.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
    clause.type === AST_NODE_TYPES.ImportNamespaceSpecifier
    ? clause
    : undefined;
}

function sourceOf(clause: ImportClause): string {
  return (clause.parent as TSESTree.ImportDeclaration).source.value;
}

function isNamedImportOf(
  clause: ImportClause | undefined,
  importedName: string,
  isAllowedSource: (source: string) => boolean,
): clause is TSESTree.ImportSpecifier {
  return (
    clause?.type === AST_NODE_TYPES.ImportSpecifier &&
    importedNameOf(clause) === importedName &&
    isAllowedSource(sourceOf(clause))
  );
}

const isSxPropsSource = (source: string) => SX_PROPS_SOURCES.has(source);
const isThemeSource = (source: string) => source === THEME_SOURCE;

/**
 * Inside `declare module '@mui/material/styles' { … }` the `Theme` in reach is
 * the interface being augmented, and an import spliced into or above the
 * ambient block changes what the declaration file means.
 */
function isInsideThemeAugmentation(node: TSESTree.Node): boolean {
  let current = node.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.TSModuleDeclaration &&
      current.id.type === AST_NODE_TYPES.Literal &&
      current.id.value === THEME_SOURCE
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isTypeOnlyImport(clause: TSESTree.ImportSpecifier): boolean {
  const declaration = clause.parent as TSESTree.ImportDeclaration;
  return declaration.importKind === 'type' || clause.importKind === 'type';
}

type FixPlan = {
  /** What goes between the angle brackets: `Theme`, an alias, or `NS.Theme`. */
  themeText: string;
  importFix?: (fixer: TSESLint.RuleFixer) => TSESLint.RuleFix;
};

export const requireSxPropsTheme = createRule<[], MessageIds>({
  name: 'require-sx-props-theme',
  meta: {
    type: 'problem',
    docs: {
      description:
        "Require MUI `SxProps` to carry the app theme as `SxProps<Theme>`, because the bare type defaults to `SxProps<{}>`: `sx` callbacks lose the theme's typing and TypeScript pays for a structural comparison against MUI's own `SxProps<Theme>`",
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireSxPropsTheme:
        "`{{typeName}}` has no theme argument, so MUI defaults it to `SxProps<{}>`: an `sx` callback's `theme` is typed `{}`, and TypeScript compares this type structurally against MUI's `SxProps<Theme>` wherever the two meet, which can cost seconds of type checking per file. Write `{{typeName}}<Theme>` with `Theme` from '@mui/material/styles'.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const program = sourceCode.ast;

    const allImports: TSESTree.ImportDeclaration[] = [];
    collectImportDeclarations(program.body, allImports);

    const sxPropsLocalNames = new Set<string>();
    const sxNamespaceLocalNames = new Set<string>();
    for (const declaration of allImports) {
      if (!isSxPropsSource(declaration.source.value)) {
        continue;
      }
      for (const specifier of declaration.specifiers) {
        if (
          specifier.type === AST_NODE_TYPES.ImportSpecifier &&
          importedNameOf(specifier) === SX_PROPS_NAME
        ) {
          sxPropsLocalNames.add(specifier.local.name);
        } else if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
          sxNamespaceLocalNames.add(specifier.local.name);
        }
      }
    }

    if (sxPropsLocalNames.size === 0 && sxNamespaceLocalNames.size === 0) {
      return {};
    }

    /**
     * Only a top-level import can be extended or anchored after: one inside an
     * ambient module block binds nothing outside it, and a file with no
     * top-level import is a global script that a new import would turn into a
     * module.
     */
    const topLevelImports = program.body.filter(
      (statement): statement is TSESTree.ImportDeclaration =>
        statement.type === AST_NODE_TYPES.ImportDeclaration,
    );
    const themeSourceImports = topLevelImports.filter((declaration) =>
      isThemeSource(declaration.source.value),
    );

    /**
     * An unresolved `Theme` elsewhere in the file (a global, or a name the file
     * never declared) would silently change meaning once an import binds the
     * name at module scope.
     */
    let hasUnresolvedTheme: boolean | undefined;
    const themeIsReferencedUnresolved = () => {
      if (hasUnresolvedTheme === undefined) {
        const globalScope = sourceCode.scopeManager?.globalScope;
        hasUnresolvedTheme = Boolean(
          globalScope?.through.some(
            (reference) => reference.identifier.name === THEME_NAME,
          ),
        );
      }
      return hasUnresolvedTheme;
    };

    function resolvesTo(
      scope: Scope,
      name: string,
      clause: ImportClause,
    ): boolean {
      return importClauseOf(findVariable(scope, name)) === clause;
    }

    function isReportableSxProps(
      typeName: TSESTree.EntityName,
      scope: Scope,
    ): boolean {
      if (typeName.type === AST_NODE_TYPES.Identifier) {
        return (
          sxPropsLocalNames.has(typeName.name) &&
          isNamedImportOf(
            importClauseOf(findVariable(scope, typeName.name)),
            SX_PROPS_NAME,
            isSxPropsSource,
          )
        );
      }
      if (
        typeName.type !== AST_NODE_TYPES.TSQualifiedName ||
        typeName.right.name !== SX_PROPS_NAME ||
        typeName.left.type !== AST_NODE_TYPES.Identifier ||
        !sxNamespaceLocalNames.has(typeName.left.name)
      ) {
        return false;
      }
      const clause = importClauseOf(findVariable(scope, typeName.left.name));
      return (
        clause?.type === AST_NODE_TYPES.ImportNamespaceSpecifier &&
        isSxPropsSource(sourceOf(clause))
      );
    }

    /** An existing `Theme` import, under whatever local name reaches the node. */
    function existingThemeName(scope: Scope): string | undefined {
      if (
        isNamedImportOf(
          importClauseOf(findVariable(scope, THEME_NAME)),
          THEME_NAME,
          isThemeSource,
        )
      ) {
        return THEME_NAME;
      }
      for (const declaration of themeSourceImports) {
        for (const specifier of declaration.specifiers) {
          if (
            specifier.type === AST_NODE_TYPES.ImportSpecifier &&
            importedNameOf(specifier) === THEME_NAME &&
            resolvesTo(scope, specifier.local.name, specifier)
          ) {
            return specifier.local.name;
          }
        }
      }
      return undefined;
    }

    /** `Styles.Theme` through a namespace import, which adds no binding. */
    function namespaceThemeText(scope: Scope): string | undefined {
      for (const declaration of themeSourceImports) {
        for (const specifier of declaration.specifiers) {
          if (
            specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier &&
            resolvesTo(scope, specifier.local.name, specifier)
          ) {
            return `${specifier.local.name}.${THEME_NAME}`;
          }
        }
      }
      return undefined;
    }

    /**
     * Mirrors the declaration's own convention so a `verbatimModuleSyntax` or
     * `consistent-type-imports` project stays clean: a type-only declaration
     * takes a plain specifier, inline `type` specifiers call for another, and a
     * declaration with no type marker follows how `SxProps` itself arrived.
     */
    function themeSpecifierText(
      declaration: TSESTree.ImportDeclaration,
      sxPropsClause: TSESTree.ImportSpecifier | undefined,
    ): string {
      if (declaration.importKind === 'type') {
        return THEME_NAME;
      }
      const usesInlineType = declaration.specifiers.some(
        (specifier) =>
          specifier.type === AST_NODE_TYPES.ImportSpecifier &&
          specifier.importKind === 'type',
      );
      const sxPropsIsTypeOnly =
        sxPropsClause !== undefined &&
        sxPropsClause.parent !== declaration &&
        isTypeOnlyImport(sxPropsClause);
      return usesInlineType || sxPropsIsTypeOnly
        ? `type ${THEME_NAME}`
        : THEME_NAME;
    }

    function extendNamedImport(
      declaration: TSESTree.ImportDeclaration,
      specifiers: TSESTree.ImportSpecifier[],
      sxPropsClause: TSESTree.ImportSpecifier | undefined,
    ): FixPlan['importFix'] {
      const text = themeSpecifierText(declaration, sxPropsClause);
      const lastSpecifier = specifiers[specifiers.length - 1];
      const openingBrace = sourceCode.getTokenBefore(specifiers[0]);
      const isMultiline =
        openingBrace !== null &&
        openingBrace.loc.end.line !== lastSpecifier.loc.start.line;
      if (!isMultiline) {
        return (fixer) => fixer.insertTextAfter(lastSpecifier, `, ${text}`);
      }
      const lineText = sourceCode.lines[lastSpecifier.loc.start.line - 1];
      const indent = /^[\t ]*/.exec(lineText)?.[0] ?? '';
      const trailingComma = sourceCode.getTokenAfter(lastSpecifier);
      if (trailingComma?.value !== ',') {
        return (fixer) =>
          fixer.insertTextAfter(lastSpecifier, `,\n${indent}${text}`);
      }
      // A same-line comment after the trailing comma annotates the specifier
      // above it, so the new specifier goes on the next line, below the comment.
      let anchor: TSESTree.Token | TSESTree.Comment = trailingComma;
      for (const comment of sourceCode.getCommentsAfter(trailingComma)) {
        if (comment.loc.start.line !== trailingComma.loc.end.line) {
          break;
        }
        anchor = comment;
      }
      return (fixer) =>
        fixer.insertTextAfterRange(anchor.range, `\n${indent}${text},`);
    }

    function insertNewImport(
      lastImport: TSESTree.ImportDeclaration,
    ): FixPlan['importFix'] {
      const quote = lastImport.source.raw.startsWith('"') ? '"' : "'";
      const lastToken = sourceCode.getLastToken(lastImport);
      const semicolon = lastToken?.value === ';' ? ';' : '';
      const statement = `import type { ${THEME_NAME} } from ${quote}${THEME_SOURCE}${quote}${semicolon}`;

      // A trailing same-line comment stays with the import it annotates.
      let anchor: TSESTree.Node | TSESTree.Comment = lastImport;
      for (const comment of sourceCode.getCommentsAfter(lastImport)) {
        if (comment.loc.start.line !== lastImport.loc.end.line) {
          break;
        }
        anchor = comment;
      }
      return (fixer) =>
        fixer.insertTextAfterRange(anchor.range, `\n${statement}`);
    }

    function planFix(
      node: TSESTree.TSTypeReference,
      scope: Scope,
    ): FixPlan | undefined {
      if (isInsideThemeAugmentation(node)) {
        return undefined;
      }

      const existing = existingThemeName(scope);
      if (existing) {
        return { themeText: existing };
      }

      // Adding a `Theme` binding is safe only where the name is free, both at
      // the node and everywhere else in the file.
      if (
        findVariable(scope, THEME_NAME) !== undefined ||
        themeIsReferencedUnresolved()
      ) {
        const namespaced = namespaceThemeText(scope);
        return namespaced ? { themeText: namespaced } : undefined;
      }

      const sxPropsClause =
        node.typeName.type === AST_NODE_TYPES.Identifier
          ? (importClauseOf(findVariable(scope, node.typeName.name)) as
              | TSESTree.ImportSpecifier
              | undefined)
          : undefined;

      for (const declaration of themeSourceImports) {
        const specifiers = declaration.specifiers.filter(
          (specifier): specifier is TSESTree.ImportSpecifier =>
            specifier.type === AST_NODE_TYPES.ImportSpecifier,
        );
        if (specifiers.length > 0) {
          return {
            themeText: THEME_NAME,
            importFix: extendNamedImport(
              declaration,
              specifiers,
              sxPropsClause,
            ),
          };
        }
      }

      const namespaced = namespaceThemeText(scope);
      if (namespaced) {
        return { themeText: namespaced };
      }

      const lastImport = topLevelImports[topLevelImports.length - 1];
      if (!lastImport) {
        return undefined;
      }
      return {
        themeText: THEME_NAME,
        importFix: insertNewImport(lastImport),
      };
    }

    return {
      TSTypeReference(node) {
        if (hasTypeArguments(node)) {
          return;
        }
        const scope = ASTHelpers.getScope(context, node);
        if (!isReportableSxProps(node.typeName, scope)) {
          return;
        }

        const plan = planFix(node, scope);
        context.report({
          node,
          messageId: 'requireSxPropsTheme',
          data: { typeName: sourceCode.getText(node.typeName) },
          // Each report carries its own import edit so any single fix is
          // complete on its own. Two reports editing the same import overlap,
          // so ESLint applies one per pass and the next pass sees `Theme`
          // imported and needs only the insertions.
          fix: plan
            ? (fixer) => {
                const fixes = [
                  fixer.insertTextAfter(node.typeName, `<${plan.themeText}>`),
                ];
                if (plan.importFix) {
                  fixes.push(plan.importFix(fixer));
                }
                return fixes;
              }
            : null,
        });
      },
    };
  },
});
