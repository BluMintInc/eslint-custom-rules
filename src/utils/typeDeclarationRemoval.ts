/**
 * @fileoverview Unbinding a module-scope `type` or `interface` declaration whose
 * last reference a fixer strips — `type Wrapper = { id: string }` left behind by
 * a rule that deletes the annotations naming it.
 *
 * The shape mirrors the import machinery's and so do its contracts: `null` is a
 * demand that the caller drop its WHOLE fix, and every question this planner
 * cannot answer from the syntax in front of it is answered `null`. Declining
 * costs a report that stays unfixed; guessing deletes working code, and an
 * over-eager removal is by far the worse of the two.
 *
 * Unlike an import declaration, a type declaration READS the names in its own
 * body, so a plan produced here can strand a further binding. The caller reaches
 * this through `planOrphanedBindingRemoval`, which re-examines the plan for
 * exactly that.
 */

import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  ImportRemovalSource,
  TextRange,
  nameOccursOutside,
  statementRemovalRange,
} from './importRemoval';

type TypeDeclaration =
  | TSESTree.TSTypeAliasDeclaration
  | TSESTree.TSInterfaceDeclaration;

/**
 * Whether the file is a module. A TypeScript source with no top-level `import`
 * or `export` is a SCRIPT, and its type declarations are ambient — visible to
 * every other file in the program, where a whole-file name scan can see nothing
 * of the references that keep them alive. Only a module's declarations are
 * private enough for "nothing in this file reads it" to be the whole story.
 */
function isModule(ast: TSESTree.Program): boolean {
  return ast.body.some(
    (statement) =>
      statement.type === AST_NODE_TYPES.ImportDeclaration ||
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration ||
      statement.type === AST_NODE_TYPES.ExportDefaultDeclaration ||
      statement.type === AST_NODE_TYPES.ExportAllDeclaration ||
      statement.type === AST_NODE_TYPES.TSExportAssignment,
  );
}

/**
 * The declaration binding `variable`, when it is a `type` alias or an
 * `interface` written as a statement of the program itself.
 *
 * Several declarations of one name is interface merging, where deleting the one
 * this fix strands leaves the name meaning something different rather than
 * nothing. A nested declaration is refused because the containers that hold one
 * do not all keep it private: a `declare global` block publishes its members to
 * the whole program, and this planner has no way to tell the shapes apart from
 * the outside. An `enum` is refused too — it emits a runtime object, so deleting
 * it is a change to what the file DOES rather than to what it declares.
 */
function typeDeclarationOf(
  source: ImportRemovalSource,
  variable: TSESLint.Scope.Variable,
): TypeDeclaration | null {
  if (variable.defs.length !== 1) return null;

  const [definition] = variable.defs;
  if (definition.type !== TSESLint.Scope.DefinitionType.Type) return null;

  const { node } = definition;
  if (
    node.type !== AST_NODE_TYPES.TSTypeAliasDeclaration &&
    node.type !== AST_NODE_TYPES.TSInterfaceDeclaration
  ) {
    return null;
  }
  // An ambient declaration describes something declared elsewhere, so what reads
  // it is not confined to this file.
  if (node.declare) return null;
  // Read from the program's own statement list rather than through `parent`,
  // which exists only once ESLint's traversal has installed it.
  if (!source.ast.body.includes(node)) return null;

  return node;
}

/**
 * The ranges that delete the type declarations binding `variables`, or `null`
 * when any of them cannot be deleted safely.
 *
 * Suitable as the `unbind` argument of `planOrphanedBindingRemoval`. A binding
 * declared by anything else — a type parameter, a class, an enum, a value — has
 * no removal this planner is willing to invent, so it declines.
 *
 * `removed` is the caller's own deletion, needed for the same coarse second
 * opinion the import path takes: scope analysis and a plain name scan can
 * disagree, and where they do the removal is not provable. The scan covers the
 * whole file because a module-scope type is visible throughout it.
 */
export function planTypeDeclarationRemoval(
  source: ImportRemovalSource,
  variables: readonly TSESLint.Scope.Variable[],
  removed: readonly TextRange[],
): TextRange[] | null {
  if (variables.length === 0) return [];
  if (!isModule(source.ast)) return null;

  const ranges: TextRange[] = [];
  for (const variable of variables) {
    const declaration = typeDeclarationOf(source, variable);
    if (!declaration) return null;

    const range = statementRemovalRange(source, declaration);
    if (!range) return null;
    ranges.push(range);
  }

  for (const variable of variables) {
    if (
      nameOccursOutside(
        source,
        variable.name,
        [...removed, ...ranges],
        variable.identifiers.map((identifier) => identifier.range),
      )
    ) {
      return null;
    }
  }

  return ranges;
}
