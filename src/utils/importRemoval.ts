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
 * The slice to delete for a statement that loses its last binding. The whole
 * line goes when the statement owns it, trailing same-line comments included:
 * those describe the declaration that is going away, and a
 * `// eslint-disable-line` among them would otherwise outlive its subject. A
 * statement sharing its line with other code gives up only its own characters.
 */
export function statementRemovalRange(
  source: ImportRemovalSource,
  declaration: TSESTree.Node,
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

export type Removable = { range: TextRange; removed: boolean };

/**
 * Ranges covering every removed item together with the separators that would
 * be left dangling. A removed run reaches forward to the next survivor, or
 * backward from the previous one when it ends the list, so exactly one
 * separator per removed item disappears. Returns `null` when every item is
 * removed — that collapse is the caller's to make, since what encloses the
 * list (braces, the declaration itself) must go too.
 */
export function removalRuns(items: readonly Removable[]): TextRange[] | null {
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
    const range = statementRemovalRange(source, declaration);
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

/** An import binding together with the ranges that reference it. */
export type ImportBindingUse = {
  specifier: ImportBindingSpecifier;
  references: TextRange[];
};

/**
 * Every import binding the file declares, paired with the positions that read
 * it.
 *
 * A caller deleting several regions at once needs this to decide *which* of its
 * own deletions a binding depends on before asking
 * {@link planOrphanedImportRemoval} to unbind it: a binding read from two
 * regions is unbound only if both go, and only a caller that deletes both in one
 * fix may claim that.
 */
export function importBindingReferences(
  source: ImportRemovalSource,
): ImportBindingUse[] {
  const uses: ImportBindingUse[] = [];

  for (const variable of allVariables(source.scopeManager)) {
    if (!isImportBindingVariable(variable)) continue;
    const specifier = importBindingSpecifierOf(variable);
    if (!specifier) continue;

    uses.push({
      specifier,
      references: variable.references.map(
        (reference) => reference.identifier.range,
      ),
    });
  }

  return uses;
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
 * True when the name still occurs in the source outside `ranges` and outside
 * `binding` — the span or spans that declare it — ignoring the positions where a
 * name is a module's export name rather than a reference to a local binding.
 *
 * Scope analysis already answers "is this binding referenced", and it is what
 * `no-unused-vars` answers with. This coarser second opinion exists to catch
 * the cases where the two could disagree — a shadowing binding, a construct the
 * scope manager does not link — because a removal that turns out to be wrong
 * deletes working code, while a removal declined in error only leaves the
 * original report standing.
 */
export function nameOccursOutside(
  source: ImportRemovalSource,
  name: string,
  ranges: readonly TextRange[],
  binding: readonly TextRange[],
): boolean {
  let found = false;

  forEachIdentifier(source.ast, undefined, undefined, (node, parent, key) => {
    if (found || node.name !== name) return;
    if (isWithinAny(node.range, ranges)) return;
    if (isWithinAny(node.range, binding)) return;
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

/** Every binding identifier a destructuring pattern introduces. */
export function patternIdentifiers(
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
 * Whether a reference is the declaration writing to its own binding: a
 * declarator's initializer, a parameter's default, a `for…of` binding.
 *
 * Such a write is not a use, and counting it as one keeps a binding alive on the
 * strength of its own declaration. That made orphanhood depend on how a helper
 * was SPELLED — `const f = () => {}` records an initializer write and so could
 * never look orphaned, while the identical `function f() {}` records no
 * reference at all and could (#1868). `no-unused-vars` answers the same question
 * the same way.
 *
 * Both halves of the test carry weight. `init` alone rests on one escope flag;
 * pairing it with the binding's own declaration identifiers pins the reference
 * to the declaration site, which is what makes the filter provably inert for
 * import bindings — an import records reads only, never an initializer write, so
 * no import can lose a reference here and be unbound while still read.
 */
function isOwnInitializerWrite(
  variable: TSESLint.Scope.Variable,
  reference: TSESLint.Scope.Reference,
): boolean {
  return (
    reference.init === true &&
    variable.identifiers.some(
      (identifier) => identifier === reference.identifier,
    )
  );
}

/**
 * Every binding that `removed` would leave with nothing referencing it.
 *
 * The scan answers only "which bindings does this deletion strand"; what to do
 * about each is the caller's, since an import is unbound by deleting a specifier
 * while a destructured property is unbound by deleting a property — and some
 * bindings must not be touched at all.
 */
export function orphanedBindings(
  source: ImportRemovalSource,
  removed: readonly TextRange[],
): TSESLint.Scope.Variable[] {
  const orphaned: TSESLint.Scope.Variable[] = [];
  const exported = exportedBindingKeys(source.ast);

  for (const variable of allVariables(source.scopeManager)) {
    // A global has no declaration in this file, so nothing here can orphan it.
    if (variable.defs.length === 0) continue;

    // Only bindings this deletion touches are its business. Touching counts the
    // declaration site itself, so this test reads every reference: an edit that
    // covers a binding's own declarator has reached that binding whether or not
    // anything reads it.
    if (
      !variable.references.some((reference) =>
        isWithinAny(reference.identifier.range, removed),
      )
    ) {
      continue;
    }

    // Only bindings the edit leaves with nothing at all are unbound: a USE that
    // survives this edit keeps the binding alive, whatever another edit might
    // later do to it. A declarator's own initializer write is not such a use —
    // see {@link isOwnInitializerWrite}.
    const uses = variable.references
      .filter((reference) => !isOwnInitializerWrite(variable, reference))
      .map((reference) => reference.identifier.range);
    if (!uses.every((range) => isWithinAny(range, removed))) continue;
    if (
      variable.identifiers.some((identifier) =>
        exported.has(`${identifier.range[0]},${identifier.range[1]}`),
      )
    ) {
      continue;
    }

    orphaned.push(variable);
  }

  return orphaned;
}

/** A binding together with the ranges that USE it. */
export type BindingUse = {
  variable: TSESLint.Scope.Variable;
  uses: TextRange[];
};

/**
 * Every binding the file declares, paired with the positions that USE it — the
 * same set {@link orphanedBindings} judges orphanhood by, a declarator's own
 * initializer write excluded.
 *
 * {@link importBindingReferences} answers the narrower question for import
 * bindings alone, which suffices only for a caller whose deletions can strand
 * nothing else. A caller that can also strand a local declaration — a `type`
 * alias named by the annotations it deletes, a `const` read through `typeof` —
 * has to partition its edits over every binding, because a binding it never
 * asks about ends up owned by no fix at all and stays orphaned for good.
 */
export function bindingUses(source: ImportRemovalSource): BindingUse[] {
  return allVariables(source.scopeManager)
    .filter((variable) => variable.defs.length > 0)
    .map((variable) => ({
      variable,
      uses: variable.references
        .filter((reference) => !isOwnInitializerWrite(variable, reference))
        .map((reference) => reference.identifier.range),
    }));
}

/**
 * How a caller unbinds the orphans this module does not own — a destructured
 * property, a local declaration, a binding it deliberately leaves alone.
 *
 * Every such orphan arrives in ONE call because two of them can share a list
 * whose separators are only correct when planned together. The result is the
 * ranges that unbind them, `[]` for orphans the caller accepts as they are, or
 * `null` to decline — which withholds the caller's whole fix.
 */
export type OrphanUnbinder = (
  variables: readonly TSESLint.Scope.Variable[],
  removed: readonly TextRange[],
) => TextRange[] | null;

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
 * `removed` is **one fix's own deletion**, judged against the file as it stands.
 * Several ranges may be passed only when a single fix deletes all of them, since
 * ESLint applies a fix whole or not at all. Passing ranges that belong to other
 * reports is unsound in two ways: a sibling report may be suppressed (ESLint
 * applies `eslint-disable` after the rule emits its reports, so the sibling's fix
 * never runs), and a sibling fix that overlaps another rule's fix is dropped for
 * the pass. Either way the surviving reference outlives the import this helper
 * was told to unbind — trading an unused import for a dangling type reference, a
 * lint warning for a compile error.
 *
 * A caller batching several of its own edits therefore owes two things: the
 * edits must ship as one fix, and the reports they came from must be checked
 * with `createSuppressionChecker` so that a suppressed one is never counted on.
 * {@link importBindingReferences} exposes the reference sets such a caller needs
 * to work out which edits belong in the same batch.
 */
export function planOrphanedImportRemoval(
  source: ImportRemovalSource,
  removed: readonly TextRange[],
): TextRange[] | null {
  return planOrphanedBindingRemoval(source, removed);
}

/**
 * {@link planOrphanedImportRemoval} widened by an `unbind` strategy for the
 * orphans imports do not cover. Without one, an orphan bound by anything other
 * than an import declines the fix, which is exactly what the import-only entry
 * point promises.
 *
 * Every contract of {@link planOrphanedImportRemoval} carries over unchanged —
 * `removed` is one fix's own deletion, `null` is a demand — with one addition
 * the import arm never needed. An import declaration binds names without reading
 * any, so unbinding one cannot strand a second binding; a declaration `unbind`
 * deletes usually DOES read something (`const { data } = event` reads `event`),
 * so its plan is re-examined against the file and declined if it strands
 * anything the first pass did not already account for.
 */
export function planOrphanedBindingRemoval(
  source: ImportRemovalSource,
  removed: readonly TextRange[],
  unbind?: OrphanUnbinder,
): TextRange[] | null {
  const orphaned = orphanedBindings(source, removed);
  if (orphaned.length === 0) return [];

  const specifiers: ImportBindingSpecifier[] = [];
  const names: string[] = [];
  const others: TSESLint.Scope.Variable[] = [];

  for (const variable of orphaned) {
    const specifier = isImportBindingVariable(variable)
      ? importBindingSpecifierOf(variable)
      : undefined;
    if (specifier) {
      specifiers.push(specifier);
      names.push(variable.name);
      continue;
    }
    // Orphaned, yet bound by something this helper cannot rewrite.
    if (!unbind) return null;
    others.push(variable);
  }

  if (
    names.some((name, index) =>
      nameOccursOutside(source, name, removed, [specifiers[index].range]),
    )
  ) {
    return null;
  }

  const byDeclaration = new Map<
    TSESTree.ImportDeclaration,
    ImportBindingSpecifier[]
  >();
  for (const specifier of specifiers) {
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

  if (others.length > 0) {
    const plan = (unbind as OrphanUnbinder)(others, removed);
    if (!plan) return null;
    ranges.push(...plan);
  }

  const sorted = ranges.sort((left, right) => left[0] - right[0]);

  if (others.length > 0) {
    const handled = new Set(orphaned);
    const stranded = orphanedBindings(source, [...removed, ...sorted]).some(
      (variable) => !handled.has(variable),
    );
    if (stranded) return null;
  }

  return sorted;
}
