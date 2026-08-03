import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { parseDisableDirectives } from './disableDirectives';

/** A half-open `[start, end)` slice of the source text. */
export type TextRange = readonly [number, number];

/** An import clause that introduces exactly one local binding. */
export type ImportBindingSpecifier =
  | TSESTree.ImportSpecifier
  | TSESTree.ImportDefaultSpecifier
  | TSESTree.ImportNamespaceSpecifier;

/**
 * The source a rule needs to unbind an import. Narrower than
 * `TSESLint.SourceCode` so tests can drive the helper without a full linter
 * run.
 */
export type ImportRemovalSource = Pick<
  TSESLint.SourceCode,
  | 'text'
  | 'ast'
  | 'scopeManager'
  | 'getTokenBefore'
  | 'getTokenAfter'
  | 'getCommentsBefore'
  | 'getCommentsInside'
>;

function contains(outer: TextRange, inner: TextRange): boolean {
  return inner[0] >= outer[0] && inner[1] <= outer[1];
}

function isWithinAny(range: TextRange, ranges: readonly TextRange[]): boolean {
  return ranges.some((candidate) => contains(candidate, range));
}

function isNamedSpecifier(
  specifier: TSESTree.ImportClause,
): specifier is TSESTree.ImportSpecifier {
  return specifier.type === AST_NODE_TYPES.ImportSpecifier;
}

/**
 * A comment that governs the line directly below it. Deleting the declaration
 * underneath such a comment strands the directive on whatever moves up into
 * its place — an `@ts-expect-error` then becomes a compile error of its own and
 * a disable directive silences an unrelated line.
 */
function bindsNextLine(comment: TSESTree.Comment): boolean {
  const [directive] = parseDisableDirectives([comment]);
  if (directive?.kind === 'disable-next-line') {
    return true;
  }
  const value = comment.value.trim();
  return value.startsWith('@ts-expect-error') || value.startsWith('@ts-ignore');
}

function isComment(token: TSESTree.Token): boolean {
  return (
    token.type === AST_TOKEN_TYPES.Line || token.type === AST_TOKEN_TYPES.Block
  );
}

/**
 * The slice to delete for a declaration that loses its last binding. The whole
 * line goes when the declaration owns it, trailing same-line comments included:
 * those describe the import that is going away, and a `// eslint-disable-line`
 * among them would otherwise outlive its subject. A declaration sharing its
 * line with other code gives up only its own characters.
 */
function declarationRemovalRange(
  source: ImportRemovalSource,
  declaration: TSESTree.ImportDeclaration,
): TextRange | null {
  const commentsBefore = source.getCommentsBefore(declaration);
  const boundComment = commentsBefore[commentsBefore.length - 1];
  if (
    boundComment &&
    bindsNextLine(boundComment) &&
    boundComment.loc.end.line + 1 === declaration.loc.start.line
  ) {
    return null;
  }

  const tokenBefore = source.getTokenBefore(declaration, {
    includeComments: true,
  });
  const ownsLineStart =
    !tokenBefore || tokenBefore.loc.end.line < declaration.loc.start.line;
  const start = ownsLineStart
    ? source.text.lastIndexOf('\n', declaration.range[0] - 1) + 1
    : declaration.range[0];

  let cursor: TSESTree.Node | TSESTree.Token = declaration;
  for (;;) {
    const next = source.getTokenAfter(cursor, { includeComments: true });
    if (!next || next.loc.start.line !== cursor.loc.end.line) {
      break;
    }
    if (!isComment(next)) {
      // Code shares the line, so the line terminator belongs to that code.
      return [start, declaration.range[1]];
    }
    cursor = next;
  }

  const lineEnd = source.text.indexOf('\n', cursor.range[1]);
  return [start, lineEnd === -1 ? source.text.length : lineEnd + 1];
}

type Removable = { range: TextRange; removed: boolean };

/**
 * Ranges covering every removed item together with the separators that would
 * be left dangling. A removed run reaches forward to the next survivor, or
 * backward from the previous one when it ends the list, so exactly one
 * separator per removed item disappears. Returns `null` when every item is
 * removed — that collapse is the caller's to make, since what encloses the
 * list (braces, the declaration itself) must go too.
 */
function removalRuns(items: readonly Removable[]): TextRange[] | null {
  const ranges: TextRange[] = [];
  let index = 0;

  while (index < items.length) {
    if (!items[index].removed) {
      index++;
      continue;
    }

    let last = index;
    while (last + 1 < items.length && items[last + 1].removed) {
      last++;
    }

    const following = items[last + 1];
    if (following) {
      ranges.push([items[index].range[0], following.range[0]]);
    } else {
      const preceding = items[index - 1];
      if (!preceding) return null;
      ranges.push([preceding.range[1], items[last].range[1]]);
    }

    index = last + 1;
  }

  return ranges;
}

/**
 * The declaration a specifier belongs to, found by scanning the program rather
 * than by following `parent`: parent links exist only once ESLint's traversal
 * has installed them, and a helper that reads a `SourceCode` should not depend
 * on having been called from inside a rule visitor.
 */
function declarationOf(
  source: ImportRemovalSource,
  specifier: ImportBindingSpecifier,
): TSESTree.ImportDeclaration | undefined {
  return source.ast.body.find(
    (statement): statement is TSESTree.ImportDeclaration =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      statement.specifiers.includes(specifier as never),
  );
}

function bracesRange(
  source: ImportRemovalSource,
  named: readonly TSESTree.ImportSpecifier[],
): TextRange | null {
  const open = source.getTokenBefore(named[0], {
    filter: (token) => token.value === '{',
  });
  const close = source.getTokenAfter(named[named.length - 1], {
    filter: (token) => token.value === '}',
  });
  return open && close ? [open.range[0], close.range[1]] : null;
}

/**
 * The text ranges that unbind `specifiers` from their shared declaration, or
 * `null` when no removal is provably safe. All specifiers of the declaration
 * being listed collapses the declaration itself rather than leaving
 * `import {} from './User';` behind, and losing every *named* specifier next to
 * a surviving default takes the braces with it.
 *
 * Any comment inside the declaration declines the removal outright: the ranges
 * computed here span separators, so a comment nested among the specifiers
 * would be swallowed or stranded depending on where it sits.
 */
export function planImportBindingRemoval(
  source: ImportRemovalSource,
  specifiers: readonly ImportBindingSpecifier[],
): TextRange[] | null {
  const [first] = specifiers;
  if (!first) return [];

  const declaration = declarationOf(source, first);
  if (!declaration) return null;
  if (
    specifiers.some(
      (specifier) => !declaration.specifiers.includes(specifier as never),
    )
  ) {
    return null;
  }
  if (source.getCommentsInside(declaration).length > 0) return null;

  const removed = new Set<TSESTree.ImportClause>(specifiers);
  if (declaration.specifiers.every((specifier) => removed.has(specifier))) {
    const range = declarationRemovalRange(source, declaration);
    return range ? [range] : null;
  }

  const named = declaration.specifiers.filter(isNamedSpecifier);
  const bracesRemoved =
    named.length > 0 && named.every((specifier) => removed.has(specifier));

  const clauses: Removable[] = declaration.specifiers
    .filter((specifier) => !isNamedSpecifier(specifier))
    .map((specifier) => ({
      range: specifier.range,
      removed: removed.has(specifier),
    }));

  if (named.length > 0) {
    const braces = bracesRange(source, named);
    if (!braces) return null;
    clauses.push({ range: braces, removed: bracesRemoved });
  }

  const ranges = removalRuns(clauses);
  if (!ranges) return null;

  if (named.length > 0 && !bracesRemoved) {
    const inner = removalRuns(
      named.map((specifier) => ({
        range: specifier.range,
        removed: removed.has(specifier),
      })),
    );
    if (!inner) return null;
    ranges.push(...inner);
  }

  return [...ranges].sort((left, right) => left[0] - right[0]);
}

/**
 * Fixes unbinding `specifiers`, or `null` when the removal is not provably
 * safe. A caller that gets `null` must drop its whole fix: a rewrite that
 * strips a binding's last use while leaving the binding behind trades its own
 * report for an unused-variable one.
 */
export function removeImportBindingFixes(
  source: ImportRemovalSource,
  fixer: TSESLint.RuleFixer,
  specifiers: readonly ImportBindingSpecifier[],
): TSESLint.RuleFix[] | null {
  const ranges = planImportBindingRemoval(source, specifiers);
  return (
    ranges?.map((range) => fixer.removeRange([range[0], range[1]])) ?? null
  );
}

/**
 * The specifier that binds `variable`, when the variable is a named/default/
 * namespace import. `import X = require('y')` binds through a declaration of
 * its own rather than a specifier and is left alone.
 */
export function importBindingSpecifierOf(
  variable: TSESLint.Scope.Variable,
): ImportBindingSpecifier | undefined {
  if (variable.defs.length !== 1) return undefined;
  const [definition] = variable.defs;
  if (definition.type !== TSESLint.Scope.DefinitionType.ImportBinding) {
    return undefined;
  }
  const { node } = definition;
  return node.type === AST_NODE_TYPES.TSImportEqualsDeclaration
    ? undefined
    : node;
}

function isImportBindingVariable(variable: TSESLint.Scope.Variable): boolean {
  return variable.defs.some(
    (definition) =>
      definition.type === TSESLint.Scope.DefinitionType.ImportBinding,
  );
}

function allVariables(
  scopeManager: TSESLint.Scope.ScopeManager | null,
): TSESLint.Scope.Variable[] {
  const globalScope = scopeManager?.globalScope;
  if (!globalScope) return [];

  const variables: TSESLint.Scope.Variable[] = [];
  const stack: TSESLint.Scope.Scope[] = [globalScope];
  while (stack.length > 0) {
    const scope = stack.pop() as TSESLint.Scope.Scope;
    variables.push(...scope.variables);
    stack.push(...scope.childScopes);
  }
  return variables;
}

type IdentifierVisit = (
  node: TSESTree.Identifier | TSESTree.JSXIdentifier,
  parent: TSESTree.Node | undefined,
  key: string | undefined,
) => void;

function isAstNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function forEachIdentifier(
  node: TSESTree.Node,
  parent: TSESTree.Node | undefined,
  key: string | undefined,
  visit: IdentifierVisit,
): void {
  if (
    node.type === AST_NODE_TYPES.Identifier ||
    node.type === AST_NODE_TYPES.JSXIdentifier
  ) {
    visit(node, parent, key);
  }

  for (const [childKey, value] of Object.entries(node)) {
    if (childKey === 'parent') continue;
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (isAstNode(child)) {
        forEachIdentifier(child, node, childKey, visit);
      }
    }
  }
}

/**
 * True when the name still occurs in the source outside `ranges`, ignoring the
 * positions where a name is a module's export name rather than a reference to
 * a local binding.
 *
 * Scope analysis already answers "is this binding referenced", and it is what
 * `no-unused-vars` answers with. This coarser second opinion exists to catch
 * the cases where the two could disagree — a shadowing binding, a construct the
 * scope manager does not link — because a removal that turns out to be wrong
 * deletes working code, while a removal declined in error only leaves the
 * original report standing.
 */
function nameOccursOutside(
  source: ImportRemovalSource,
  name: string,
  ranges: readonly TextRange[],
  binding: ImportBindingSpecifier,
): boolean {
  let found = false;

  forEachIdentifier(source.ast, undefined, undefined, (node, parent, key) => {
    if (found || node.name !== name) return;
    if (isWithinAny(node.range, ranges)) return;
    if (contains(binding.range, node.range)) return;
    if (parent?.type === AST_NODE_TYPES.ImportSpecifier && key === 'imported') {
      return;
    }
    if (parent?.type === AST_NODE_TYPES.ExportSpecifier && key === 'exported') {
      return;
    }
    found = true;
  });

  return found;
}

function patternIdentifiers(
  pattern: TSESTree.Node | null,
): TSESTree.Identifier[] {
  switch (pattern?.type) {
    case AST_NODE_TYPES.Identifier:
      return [pattern];
    case AST_NODE_TYPES.ObjectPattern:
      return pattern.properties.flatMap((property) =>
        patternIdentifiers(
          property.type === AST_NODE_TYPES.RestElement
            ? property.argument
            : property.value,
        ),
      );
    case AST_NODE_TYPES.ArrayPattern:
      return pattern.elements.flatMap((element) =>
        patternIdentifiers(element ?? null),
      );
    case AST_NODE_TYPES.AssignmentPattern:
      return patternIdentifiers(pattern.left);
    case AST_NODE_TYPES.RestElement:
      return patternIdentifiers(pattern.argument);
    default:
      return [];
  }
}

/**
 * The names the program exports by declaration. A binding among them has a
 * consumer no edit to this file can reach, so no deletion here orphans it.
 *
 * Only the exported name itself counts — a type parameter or a local declared
 * *inside* an exported function is not exported, and treating it as such would
 * wave through the very deletion this guard exists to catch.
 */
function exportedBindingKeys(ast: TSESTree.Program): Set<string> {
  const keys = new Set<string>();

  for (const statement of ast.body) {
    if (
      statement.type !== AST_NODE_TYPES.ExportNamedDeclaration &&
      statement.type !== AST_NODE_TYPES.ExportDefaultDeclaration
    ) {
      continue;
    }

    const declaration = statement.declaration;
    const identifiers =
      declaration?.type === AST_NODE_TYPES.VariableDeclaration
        ? declaration.declarations.flatMap((declarator) =>
            patternIdentifiers(declarator.id),
          )
        : declaration && 'id' in declaration
        ? patternIdentifiers(declaration.id ?? null)
        : [];

    for (const identifier of identifiers) {
      keys.add(`${identifier.range[0]},${identifier.range[1]}`);
    }
  }

  return keys;
}

/**
 * The extra ranges a fix must delete so that removing `removed` leaves nothing
 * bound to nothing, or `null` when some binding would be orphaned yet cannot be
 * unbound safely — an import behind a directive comment, a type alias or a type
 * parameter, all of which this helper refuses to guess at.
 *
 * `null` is a demand, not a suggestion: the caller declines its whole fix. The
 * alternative — deleting the last use and keeping the declaration — converts a
 * file that lints clean into one that fails `no-unused-vars`, and since the
 * original report is resolved by the fix, nothing re-reports the debt.
 *
 * `removed` is one fix's own deletion, judged against the file as it stands.
 * Widening it to "everything this `--fix` run will delete" looks like it would
 * catch a binding two edits share, but it is unsound: a rule cannot see
 * `eslint-disable` comments, because suppression is applied to reports after the
 * rule emits them. A suppressed sibling edit never happens, so the widened view
 * deletes an import that a surviving reference still needs — trading an unused
 * import for a dangling type reference, a lint warning for a compile error.
 * There is deliberately no way to ask this helper that question.
 */
export function planOrphanedImportRemoval(
  source: ImportRemovalSource,
  removed: readonly TextRange[],
): TextRange[] | null {
  const orphaned: ImportBindingSpecifier[] = [];
  const names: string[] = [];
  const exported = exportedBindingKeys(source.ast);

  for (const variable of allVariables(source.scopeManager)) {
    // A global has no declaration in this file, so nothing here can orphan it.
    if (variable.defs.length === 0) continue;

    const references = variable.references.map(
      (reference) => reference.identifier.range,
    );
    // Only bindings this deletion touches are its business, and only those it
    // leaves with nothing at all are unbound: a reference that survives this
    // edit keeps the binding alive, whatever another edit might later do to it.
    if (!references.some((range) => isWithinAny(range, removed))) continue;
    if (!references.every((range) => isWithinAny(range, removed))) continue;
    if (
      variable.identifiers.some((identifier) =>
        exported.has(`${identifier.range[0]},${identifier.range[1]}`),
      )
    ) {
      continue;
    }

    const specifier = isImportBindingVariable(variable)
      ? importBindingSpecifierOf(variable)
      : undefined;
    // Orphaned, yet bound by something this helper cannot rewrite.
    if (!specifier) return null;

    orphaned.push(specifier);
    names.push(variable.name);
  }

  if (orphaned.length === 0) return [];

  if (
    names.some((name, index) =>
      nameOccursOutside(source, name, removed, orphaned[index]),
    )
  ) {
    return null;
  }

  const byDeclaration = new Map<
    TSESTree.ImportDeclaration,
    ImportBindingSpecifier[]
  >();
  for (const specifier of orphaned) {
    const declaration = declarationOf(source, specifier);
    if (!declaration) return null;
    const group = byDeclaration.get(declaration);
    if (group) {
      group.push(specifier);
    } else {
      byDeclaration.set(declaration, [specifier]);
    }
  }

  const ranges: TextRange[] = [];
  for (const group of byDeclaration.values()) {
    const plan = planImportBindingRemoval(source, group);
    if (!plan) return null;
    ranges.push(...plan);
  }

  return ranges.sort((left, right) => left[0] - right[0]);
}
