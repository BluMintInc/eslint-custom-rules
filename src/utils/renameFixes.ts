import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';

/**
 * Rewrites only the identifier's first token.
 *
 * A TSESTree `Identifier` range spans everything attached to the name — the
 * optional marker and the type annotation (`props?: RunnerProps`) — so
 * `fixer.replaceText(id, newName)` silently deletes the annotation along with
 * the name. For a rule that fires *because* of the annotation, that erases its
 * own trigger condition instead of satisfying it (Issues #1351, #1357).
 * Targeting the first token keeps `?`, `!` and `: T` intact.
 */
export const renameIdentifierToken = (
  fixer: TSESLint.RuleFixer,
  sourceCode: Readonly<TSESLint.SourceCode>,
  identifier: TSESTree.Node,
  text: string,
): TSESLint.RuleFix | null => {
  const token = sourceCode.getFirstToken(identifier);
  if (!token) {
    return null;
  }
  return fixer.replaceTextRange([token.range[0], token.range[1]], text);
};

/**
 * Walks the scope chain upward from `scope` (inclusive) and reports whether
 * `targetName` is bound anywhere between `scope` and `stopScope` (inclusive).
 *
 * Mirrors how the engine resolves an identifier at a use site: the first scope
 * on the chain that declares the name wins. Used to detect whether a rewritten
 * reference would be captured by a binding sitting between it and the
 * declaration it currently resolves to.
 */
export const isNameBoundInChain = (
  scope: TSESLint.Scope.Scope | null,
  stopScope: TSESLint.Scope.Scope | null,
  targetName: string,
): boolean => {
  let current: TSESLint.Scope.Scope | null = scope;
  while (current) {
    if (current.set.has(targetName)) {
      return true;
    }
    if (current === stopScope) {
      break;
    }
    current = current.upper;
  }
  return false;
};

/**
 * Reports whether `targetName` is used as an identifier anywhere inside
 * `scope` or its nested scopes.
 *
 * Such a use currently resolves to some other binding (an outer constant, a
 * nested declaration); giving the renamed symbol that same name would capture
 * it, silently rebinding working code.
 */
export const scopeSubtreeReferencesName = (
  scope: TSESLint.Scope.Scope,
  targetName: string,
): boolean => {
  const pending: TSESLint.Scope.Scope[] = [scope];
  while (pending.length > 0) {
    const current = pending.pop() as TSESLint.Scope.Scope;
    if (
      current.references.some(
        (reference) => reference.identifier.name === targetName,
      )
    ) {
      return true;
    }
    pending.push(...current.childScopes);
  }
  return false;
};

/**
 * Returns true when renaming `variable` to `newName` would collide with an
 * existing binding in any scope the rename touches, making the autofix
 * semantics-changing (and thus unsafe).
 *
 * The fixer rewrites the declaration plus every in-file reference; if `newName`
 * already resolves to a different binding, the rewrite would redeclare a name
 * already bound in the declaration scope, capture a reference onto an
 * intervening binding, or swallow a use of an outer binding that shares the
 * name. In every such case the caller should suppress the fix (report-only).
 */
export const renameWouldCollide = (
  variable: TSESLint.Scope.Variable,
  newName: string,
): boolean => {
  const declarationScope = variable.scope;

  // (1) Declaration site: `newName` already bound in the scope that holds the
  //     declaration would make the rename a redeclaration/shadow.
  if (declarationScope.set.has(newName)) {
    return true;
  }

  // (2) Reference sites: a binding of `newName` sitting between a reference and
  //     the declaration scope would swallow the rewritten identifier — the
  //     reference would resolve to that binding instead of the renamed symbol.
  for (const reference of variable.references) {
    const referenceScope = reference.from ?? declarationScope;
    if (isNameBoundInChain(referenceScope, declarationScope, newName)) {
      return true;
    }
  }

  // (3) Capture: the declaration's own scope (or a nested one) already uses
  //     `newName` for something else, so reintroducing the symbol under that
  //     name would shadow whatever those uses resolve to.
  return scopeSubtreeReferencesName(declarationScope, newName);
};

/**
 * Reports whether the node wrapping a declaration is an `export`.
 */
const isExportWrapper = (node: TSESTree.Node | undefined): boolean =>
  node?.type === AST_NODE_TYPES.ExportNamedDeclaration ||
  node?.type === AST_NODE_TYPES.ExportDefaultDeclaration;

/**
 * Reports whether `declarationId` names a symbol whose declaration statement
 * carries an inline `export` (`export const Content = …`,
 * `export function Content() {}`).
 *
 * Deliberately keyed on the identifier rather than on `variable.defs`: a
 * parameter's definition node IS the enclosing function, so a def-based check
 * would misread `export function f(Child: ReactNode)` as an exported `Child`.
 * A parameter is always function-local and can never be an export, so anything
 * that is not the `id` of an exported declaration answers false.
 */
const isExportedDeclaration = (declarationId: TSESTree.Node): boolean => {
  const parent = declarationId.parent;
  if (!parent) {
    return false;
  }

  if (
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id === declarationId
  ) {
    return isExportWrapper(parent.parent?.parent);
  }

  if (
    (parent.type === AST_NODE_TYPES.FunctionDeclaration ||
      parent.type === AST_NODE_TYPES.ClassDeclaration) &&
    parent.id === declarationId
  ) {
    return isExportWrapper(parent.parent);
  }

  return false;
};

export type VariableRenameFixesOptions = {
  fixer: TSESLint.RuleFixer;
  sourceCode: Readonly<TSESLint.SourceCode>;
  /** The scope-manager variable resolved from the declaration identity. */
  variable: TSESLint.Scope.Variable;
  /** The identifier that declares `variable` (parameter id, declarator id, …). */
  declarationId: TSESTree.Node;
  newName: string;
};

/**
 * Builds the complete rename: the declaration AND every in-file reference to
 * it.
 *
 * A declaration-only rename leaves every use site bound to a now-undefined
 * name, so `--fix` exits 0 while producing code that no longer compiles
 * (Issues #1256, #1313, #1355, #1357). Returns `null` whenever the rename
 * cannot be applied everywhere, so the report stands on its own rather than
 * corrupting the source. Callers must treat `null` as "report, do not fix".
 *
 * Resolve `variable` by declaration identity — `context.getDeclaredVariables(…)
 * .find((v) => v.defs.some((def) => def.name === declarationId))` — and never
 * by name: shapes like `function Content(Content: ReactNode)` declare two
 * distinct symbols that share a name, and a name-based lookup picks the wrong
 * one.
 */
export const buildVariableRenameFixes = ({
  fixer,
  sourceCode,
  variable,
  declarationId,
  newName,
}: VariableRenameFixesOptions): TSESLint.RuleFix[] | null => {
  const declarationFix = renameIdentifierToken(
    fixer,
    sourceCode,
    declarationId,
    newName,
  );
  if (!declarationFix) {
    return null;
  }

  if (renameWouldCollide(variable, newName)) {
    return null;
  }

  // The declaration's own write reference (a `const x = …` initializer or a
  // defaulted parameter) points at the declaration identifier, already rewritten
  // above. Skipping it also avoids overlapping fix ranges, which ESLint rejects.
  const references = variable.references.filter(
    (reference) => reference.identifier !== declarationId,
  );

  // An exported symbol is a cross-file contract whose importers a single-file
  // fixer cannot reach. Renaming the declaration breaks every importer, so
  // decline. (The hazard lives entirely in those other files, so it does not
  // depend on whether the declaring file also uses the name: a bare
  // `export const` with no in-file reference is the most exposed shape, not the
  // safest one. `global-const-style` withholds its rename on the same grounds.)
  if (isExportedDeclaration(declarationId)) {
    return null;
  }

  const fixes: TSESLint.RuleFix[] = [declarationFix];
  for (const reference of references) {
    const referenceId = reference.identifier;
    const referenceParent = referenceId.parent;

    // A re-export specifier `export { content }` binds the public export name
    // to this identifier — `local` and `exported` are the same token — so
    // rewriting it would change the exported name, a cross-file contract a
    // single-file fixer cannot safely rewrite. The declaration-level guard
    // above only catches inline `export const`. Decline the fix.
    if (referenceParent?.type === AST_NODE_TYPES.ExportSpecifier) {
      return null;
    }

    // An object-literal shorthand `{ content }` desugars to
    // `{ content: content }`: the single token is both the property key and its
    // value. Rewriting it wholesale would rename the KEY too, silently changing
    // the object's shape. Expand to `oldKey: newName` so only the value moves.
    if (
      referenceParent?.type === AST_NODE_TYPES.Property &&
      referenceParent.shorthand &&
      referenceParent.parent?.type === AST_NODE_TYPES.ObjectExpression
    ) {
      const shorthandFix = renameIdentifierToken(
        fixer,
        sourceCode,
        referenceId,
        `${variable.name}: ${newName}`,
      );
      if (!shorthandFix) {
        return null;
      }
      fixes.push(shorthandFix);
      continue;
    }

    const referenceFix = renameIdentifierToken(
      fixer,
      sourceCode,
      referenceId,
      newName,
    );
    if (!referenceFix) {
      return null;
    }
    fixes.push(referenceFix);
  }

  return fixes;
};
