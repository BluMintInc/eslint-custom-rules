import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

/**
 * Same-file lexical resolution: what a name denotes at the point it is written.
 *
 * Every rule that answers "what does this name refer to here?" without a type
 * checker converges on the same three moves, and getting any of them wrong has
 * shipped the same defect repeatedly (#1756, #1759, #1769, #1771, #1776):
 *
 *   1. A container yields its statement list. Reading only `Program.body` makes
 *      the DEPTH of a declaration decide whether it exists, a distinction the
 *      declaration itself knows nothing about — a type written beside the
 *      component that uses it, a `const` built inside the handler that reads it,
 *      a declaration in a `namespace` or a `switch` case all become invisible.
 *   2. A statement yields its declaration through `export`. Otherwise the
 *      `export` keyword alone decides whether a name is resolvable.
 *   3. The chain is walked innermost outward and the first match wins, which is
 *      what shadowing requires: a same-named outer declaration must never answer
 *      for an inner binding the reference actually denotes.
 */

/**
 * The statement list a container holds, or undefined for a node that holds none.
 *
 * These are every place a declaration can be written as a direct child, so
 * walking them outward reproduces TypeScript's own scope chain. A node holding
 * no statement list yields undefined, so a walk simply steps past it.
 */
export function statementsOf(
  node: TSESTree.Node,
): readonly TSESTree.Node[] | undefined {
  switch (node.type) {
    case AST_NODE_TYPES.Program:
    case AST_NODE_TYPES.BlockStatement:
    case AST_NODE_TYPES.TSModuleBlock:
    case AST_NODE_TYPES.StaticBlock:
      return node.body;
    case AST_NODE_TYPES.SwitchCase:
      return node.consequent;
    default:
      return undefined;
  }
}

/**
 * The declaration a statement carries, looking through `export`.
 *
 * `export type Props = ...` and `export const db = ...` are the same declaration
 * one AST node deeper. A statement carrying no declaration — `export { X }`,
 * `export * from './y'`, or any ordinary statement — is returned unchanged, so a
 * caller matching on declaration kinds rejects it exactly as it would have
 * rejected the wrapper.
 */
export function declarationOf(statement: TSESTree.Node): TSESTree.Node {
  if (
    (statement.type === AST_NODE_TYPES.ExportNamedDeclaration ||
      statement.type === AST_NODE_TYPES.ExportDefaultDeclaration) &&
    statement.declaration
  ) {
    return statement.declaration;
  }
  return statement;
}

/**
 * A container that BINDS the name without proving what the caller asked.
 *
 * This is the distinction a two-valued lookup cannot make, and conflating it
 * with "not declared here" reopens a masquerade: `const Spinner = lazy(...)`
 * inside a component binds `Spinner` while proving nothing about its props, and
 * a walk that keeps going lets an unrelated outer `const Spinner = () => <div/>`
 * answer for it (#1316). A shadowing binding ends the search whether or not it
 * yields an answer, and it also suppresses any fallback — the fallback describes
 * the file's top level, which the reference cannot reach past the shadow.
 */
export const BOUND_UNPROVABLE: unique symbol = Symbol('boundUnprovable');

/**
 * What one container's statement list says about a name:
 *   - `undefined`        not declared here, keep walking outward
 *   - {@link BOUND_UNPROVABLE}  declared here, nothing provable — stop
 *   - anything else      the resolved declaration
 */
export type ScopeMatch<T> = T | typeof BOUND_UNPROVABLE | undefined;

/**
 * Resolves a name against every enclosing statement container, innermost
 * outward, with an optional fallback consulted ONLY on a complete lexical miss.
 *
 * Every statement of a container is searched rather than only those preceding
 * the reference, matching the hoisting that makes a declaration written below
 * its own use legal.
 *
 * Two rules need the fallback, for unrelated reasons, and both are answers the
 * lexical walk cannot reach:
 *   - a name bound by no lexical scope at the reference but recorded by an eager
 *     file-wide table (`no-firestore-object-arrays`);
 *   - a sibling module parsed by `typescript-estree`, whose nodes carry NO
 *     parent pointers, so there is no chain to climb at all
 *     (`prefer-spread-over-reassembly`, #1644). A top-level declaration is in
 *     scope from anywhere in its file, so the fallback can only find what the
 *     walk would have.
 */
export function resolveInEnclosingScopes<T>(
  from: TSESTree.Node,
  matchIn: (
    statements: readonly TSESTree.Node[],
    container: TSESTree.Node,
  ) => ScopeMatch<T>,
  fallback?: () => T | undefined,
): T | undefined {
  let current: TSESTree.Node | undefined = from;
  while (current) {
    const statements = statementsOf(current);
    if (statements) {
      const match = matchIn(statements, current);
      if (match === BOUND_UNPROVABLE) {
        return undefined;
      }
      if (match !== undefined) {
        return match as T;
      }
    }
    current = current.parent as TSESTree.Node | undefined;
  }
  return fallback?.();
}

/**
 * The statement lists enclosing a node, innermost outward.
 *
 * The materialised form of the same walk, for a caller that must RESUME the
 * search from a given depth rather than run it once: a name referenced inside a
 * type alias body resolves from the scope the alias was declared in, not from
 * the scope that referenced the alias.
 */
export function enclosingStatementLists(
  from: TSESTree.Node,
): (readonly TSESTree.Node[])[] {
  const lists: (readonly TSESTree.Node[])[] = [];
  let current: TSESTree.Node | undefined = from;
  while (current) {
    const statements = statementsOf(current);
    if (statements) {
      lists.push(statements);
    }
    current = current.parent as TSESTree.Node | undefined;
  }
  return lists;
}
