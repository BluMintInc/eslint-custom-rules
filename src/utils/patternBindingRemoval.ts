/**
 * @fileoverview Unbinding a destructured property, for a fixer whose rewrite
 * strips the last reference to one — `const { data: change } = event;` left
 * behind by a rewrite of `change.after.ref.parent.id`.
 *
 * The shape is the same as the import machinery's and so are its contracts:
 * `null` is a demand that the caller drop its WHOLE fix, and every question this
 * planner cannot answer from the syntax in front of it is answered `null`.
 * Declining costs a report that stays unfixed; guessing deletes working code.
 *
 * Unlike an import declaration, a destructuring declaration READS something, so
 * a plan produced here can strand a further binding. The caller reaches this
 * through `planOrphanedBindingRemoval`, which re-examines the plan for exactly
 * that.
 */

import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  ImportRemovalSource,
  TextRange,
  nameOccursOutside,
  patternIdentifiers,
  removalRuns,
  statementRemovalRange,
} from './importRemoval';

/** The declaration site of a binding introduced by a destructuring pattern. */
type PatternBinding = {
  declarator: TSESTree.VariableDeclarator;
  declaration: TSESTree.VariableDeclaration;
  pattern: TSESTree.ObjectPattern;
};

function patternBindingOf(
  variable: TSESLint.Scope.Variable,
): PatternBinding | null {
  if (variable.defs.length !== 1) return null;
  const [definition] = variable.defs;
  if (definition.type !== TSESLint.Scope.DefinitionType.Variable) return null;

  // Read from the tree rather than from the definition record so the shape is
  // checked rather than asserted; a rule reaches this from a visitor, where
  // parent links are installed.
  const declarator = definition.node;
  const declaration = declarator.parent;
  if (
    !declaration ||
    declaration.type !== AST_NODE_TYPES.VariableDeclaration ||
    declarator.id.type !== AST_NODE_TYPES.ObjectPattern
  ) {
    return null;
  }

  return { declarator, declaration, pattern: declarator.id };
}

/**
 * Whether the declaration is a statement in its own right, and so can be
 * deleted whole. A `for (const { data } of events)` head reads as a declaration
 * too, and deleting one leaves a `for` with no binding at all; an
 * `export const` keeps its `export` keyword outside the declaration's own range.
 */
export function isFreestandingStatement(
  declaration: TSESTree.VariableDeclaration,
): boolean {
  const parent = declaration.parent;
  return (
    parent?.type === AST_NODE_TYPES.Program ||
    parent?.type === AST_NODE_TYPES.BlockStatement ||
    parent?.type === AST_NODE_TYPES.StaticBlock ||
    parent?.type === AST_NODE_TYPES.SwitchCase ||
    parent?.type === AST_NODE_TYPES.TSModuleBlock
  );
}

/**
 * The properties of `pattern` that bind nothing but orphans, or `null` when one
 * of them cannot be dropped without changing what the declaration does.
 *
 * A property is removable only when EVERY binding it introduces is orphaned: a
 * nested `data: { after, before }` with a live `before` in it stays, since
 * rewriting a pattern to keep one half is a transformation this planner has no
 * license to invent.
 */
function removableProperties(
  properties: readonly TSESTree.Property[],
  orphans: ReadonlySet<TSESTree.Identifier>,
): Set<TSESTree.Property> | null {
  const removable = new Set<TSESTree.Property>();

  for (const property of properties) {
    const bound = patternIdentifiers(property.value);
    const orphaned = bound.filter((identifier) => orphans.has(identifier));
    if (orphaned.length === 0) continue;
    if (orphaned.length !== bound.length) return null;

    // A computed key and a default value are both EXPRESSIONS the declaration
    // evaluates; deleting the property deletes their evaluation with them.
    if (property.computed) return null;
    if (property.value.type === AST_NODE_TYPES.AssignmentPattern) return null;

    removable.add(property);
  }

  return removable;
}

/**
 * The pattern's properties, or `null` when a rest element is among them: a rest
 * binding absorbs whatever the pattern does not name, so dropping a property
 * REWRITES the object that rest binding receives.
 */
function plainProperties(
  pattern: TSESTree.ObjectPattern,
): TSESTree.Property[] | null {
  const properties: TSESTree.Property[] = [];
  for (const property of pattern.properties) {
    if (property.type !== AST_NODE_TYPES.Property) return null;
    properties.push(property);
  }
  return properties;
}

function planDeclarator(
  source: ImportRemovalSource,
  binding: PatternBinding,
  orphans: ReadonlySet<TSESTree.Identifier>,
): TextRange[] | null {
  const { declarator, declaration, pattern } = binding;

  // `const` is what makes "nothing reads it" the whole story: a `let` binding
  // can be assigned from anywhere its scope reaches, and an assignment is not a
  // read, so a binding this planner would call orphaned may still be written to.
  if (declaration.kind !== 'const') return null;
  if (declaration.declare) return null;

  // The ranges below span separators, so a comment among the properties would be
  // swallowed or stranded depending on where it sits.
  if (source.getCommentsInside(declaration).length > 0) return null;

  const properties = plainProperties(pattern);
  if (!properties) return null;

  const removable = removableProperties(properties, orphans);
  if (!removable || removable.size === 0) return null;

  if (removable.size < properties.length) {
    return removalRuns(
      properties.map((property) => ({
        range: property.range,
        removed: removable.has(property),
      })),
    );
  }

  // Nothing survives the pattern, so the declarator goes with it — and with the
  // declarator goes its initializer. Only a plain identifier read is deleted
  // sight unseen; anything else could be a call whose effect the file depends
  // on.
  if (declarator.init?.type !== AST_NODE_TYPES.Identifier) return null;

  const siblings = declaration.declarations;
  if (siblings.length > 1) {
    return removalRuns(
      siblings.map((sibling) => ({
        range: sibling.range,
        removed: sibling === declarator,
      })),
    );
  }

  if (!isFreestandingStatement(declaration)) return null;
  const range = statementRemovalRange(source, declaration);
  return range ? [range] : null;
}

/**
 * The ranges that unbind `variables` from the destructuring patterns declaring
 * them, or `null` when any of them cannot be unbound safely.
 *
 * Suitable as the `unbind` argument of `planOrphanedBindingRemoval`. A binding
 * declared by anything other than a `const` object pattern declines, with one
 * exception: a PARAMETER is left exactly as it is, because a destructured
 * parameter is part of the function's signature and a fixer that rewrites a read
 * has no license to change what its enclosing function accepts.
 */
export function planPatternBindingRemoval(
  source: ImportRemovalSource,
  variables: readonly TSESLint.Scope.Variable[],
  removed: readonly TextRange[],
): TextRange[] | null {
  const byDeclarator = new Map<
    TSESTree.VariableDeclarator,
    { binding: PatternBinding; variables: TSESLint.Scope.Variable[] }
  >();

  for (const variable of variables) {
    if (
      variable.defs.every(
        (definition) =>
          definition.type === TSESLint.Scope.DefinitionType.Parameter,
      )
    ) {
      continue;
    }

    const binding = patternBindingOf(variable);
    if (!binding) return null;

    const group = byDeclarator.get(binding.declarator);
    if (group) {
      group.variables.push(variable);
    } else {
      byDeclarator.set(binding.declarator, { binding, variables: [variable] });
    }
  }

  const ranges: TextRange[] = [];
  for (const { binding, variables: group } of byDeclarator.values()) {
    const orphans = new Set(group.flatMap((variable) => variable.identifiers));
    const plan = planDeclarator(source, binding, orphans);
    if (!plan) return null;
    ranges.push(...plan);
  }

  // The same coarse second opinion the import path takes, and for the same
  // reason: scope analysis and a plain name scan can disagree — a shadowing
  // binding, a construct the scope manager does not link — and a removal that
  // turns out to be wrong deletes working code.
  //
  // The scan is windowed to the scope that declares the binding, which the
  // import path has no use for: an import is module-scoped, so every occurrence
  // of its name is a candidate reference, whereas an occurrence of a
  // function-local name OUTSIDE that function belongs to a different binding
  // altogether. Scanning the whole file for a name as ordinary as `change` would
  // decline on any file holding a second handler that happens to use it.
  for (const { variables: group } of byDeclarator.values()) {
    for (const variable of group) {
      const scope = variable.scope.block.range;
      const elsewhere: TextRange[] = [
        [0, scope[0]],
        [scope[1], source.text.length],
      ];
      if (
        nameOccursOutside(
          source,
          variable.name,
          [...removed, ...ranges, ...elsewhere],
          variable.identifiers.map((identifier) => identifier.range),
        )
      ) {
        return null;
      }
    }
  }

  return ranges;
}
