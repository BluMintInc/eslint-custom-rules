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

/**
 * One statement container on the chain, with the binders guarding entry to it.
 *
 * {@link enclosingStatementLists} loses the nodes BETWEEN two containers, and
 * those are exactly the ones that bind a name without holding a statement — a
 * function's parameters and type parameters sit on the function, not on the
 * block that is its body. A caller that materialises the chain rather than
 * walking it once therefore cannot ask the question {@link
 * resolveNameInEnclosingScopes} asks, unless the frames carry them.
 *
 * `barriers` holds the nodes crossed to reach this frame from the one inside
 * it, so a binder among them shadows the name for this frame and every frame
 * outside it.
 */
export type ScopeFrame = {
  statements: readonly TSESTree.Node[];
  barriers: readonly TSESTree.Node[];
};

/**
 * The statement containers enclosing a node, innermost outward, each carrying
 * the binders crossed to reach it.
 */
export function enclosingScopeFrames(from: TSESTree.Node): ScopeFrame[] {
  const frames: ScopeFrame[] = [];
  let barriers: TSESTree.Node[] = [];
  let current: TSESTree.Node | undefined = from;
  while (current) {
    const statements = statementsOf(current);
    if (statements) {
      frames.push({ statements, barriers });
      barriers = [];
    } else {
      barriers.push(current);
    }
    current = current.parent as TSESTree.Node | undefined;
  }
  return frames;
}

/**
 * Which of TypeScript's two declaration spaces a name is being resolved in.
 *
 * The distinction is load-bearing rather than pedantic: `function f<Props>()`
 * shadows a `type Props` for every type position inside `f` while leaving a
 * `const Props` untouched, and a parameter `(batch) => …` does the reverse.
 * Testing both spaces at once would decline on a collision that TypeScript does
 * not consider one, turning a resolution hole into an over-decline.
 */
export type BindingNamespace = 'type' | 'value';

/**
 * Whether a pattern binds `name`, looking through destructuring and defaults.
 */
function patternBindsName(
  node: TSESTree.Node | null | undefined,
  name: string,
): boolean {
  if (!node) {
    return false;
  }
  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
      return node.name === name;
    case AST_NODE_TYPES.ArrayPattern:
      return node.elements.some((element) => patternBindsName(element, name));
    case AST_NODE_TYPES.ObjectPattern:
      return node.properties.some((property) =>
        patternBindsName(
          property.type === AST_NODE_TYPES.RestElement
            ? property.argument
            : property.value,
          name,
        ),
      );
    case AST_NODE_TYPES.AssignmentPattern:
      return patternBindsName(node.left, name);
    case AST_NODE_TYPES.RestElement:
      return patternBindsName(node.argument, name);
    default:
      return false;
  }
}

/**
 * Whether a `for` head declares `name`, for any of the three loop spellings.
 */
function forHeadBindsName(node: TSESTree.Node, name: string): boolean {
  const head =
    node.type === AST_NODE_TYPES.ForStatement
      ? node.init
      : node.type === AST_NODE_TYPES.ForOfStatement ||
        node.type === AST_NODE_TYPES.ForInStatement
      ? node.left
      : undefined;
  return head?.type === AST_NODE_TYPES.VariableDeclaration
    ? head.declarations.some((declarator) =>
        patternBindsName(declarator.id, name),
      )
    : false;
}

/**
 * Whether a container binds `name` somewhere OTHER than its statement list.
 *
 * {@link statementsOf} recognises five containers, so every binder that is not a
 * statement — a type parameter, a function parameter, a `catch` parameter, a
 * `for` head, a function or class expression's own name — introduces a scope the
 * walk cannot see. That makes the walk step straight past a shadow and let an
 * outer declaration answer for a name the reference does not denote, which is
 * precisely the failure move 3 of this module's contract forbids: an unrelated
 * `type ToClose = () => void` answered for the type parameter of
 * `function useThing<ToClose>(…)`, and `no-direct-function-state` reported —
 * and rewrote — code whose state type it had never seen (#2257).
 *
 * A shadow is deliberately not a resolution. The binder proves only that the
 * name is taken here, never what it denotes, so a caller must treat it exactly
 * as {@link BOUND_UNPROVABLE} — stop, and answer nothing.
 */
export function bindsNameOutsideStatements(
  container: TSESTree.Node,
  name: string,
  namespace: BindingNamespace,
): boolean {
  const node = container as TSESTree.Node & {
    typeParameters?:
      | TSESTree.TSTypeParameterDeclaration
      | TSESTree.TSTypeParameterInstantiation;
    params?: readonly TSESTree.Node[];
    id?: TSESTree.Identifier | null;
  };

  if (namespace === 'type') {
    // `typeParameters` names two unrelated things: the DECLARATION that binds
    // `<T>` on a function or class, and the INSTANTIATION that supplies `<Foo>`
    // at a call, `new`, or type reference. Only the first binds anything, and
    // the second holds type nodes carrying no `name` at all, so reading one as
    // the other throws on any ancestor that passes type arguments.
    const declared =
      node.typeParameters?.type === AST_NODE_TYPES.TSTypeParameterDeclaration
        ? node.typeParameters.params
        : undefined;
    return (
      declared?.some((parameter) => parameter.name.name === name) === true ||
      (container.type === AST_NODE_TYPES.ClassExpression &&
        node.id?.name === name)
    );
  }

  if (
    (container.type === AST_NODE_TYPES.FunctionExpression ||
      container.type === AST_NODE_TYPES.ClassExpression) &&
    node.id?.name === name
  ) {
    return true;
  }
  if (
    container.type === AST_NODE_TYPES.CatchClause &&
    patternBindsName(container.param, name)
  ) {
    return true;
  }
  if (forHeadBindsName(container, name)) {
    return true;
  }
  // `TSTypeParameterDeclaration` also carries `params`, of a node kind no
  // pattern arm matches, so a type parameter cannot leak into this space.
  return (
    isFunctionLike(container) &&
    node.params?.some((parameter) => patternBindsName(parameter, name)) === true
  );
}

function isFunctionLike(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.TSDeclareFunction ||
    node.type === AST_NODE_TYPES.TSEmptyBodyFunctionExpression
  );
}

/**
 * {@link resolveInEnclosingScopes}, stopped by the binders it cannot see.
 *
 * The name and the space it is resolved in have to be stated by the caller
 * because the shadow test needs them and `matchIn` only closes over them. That
 * is the point of the separate entry rather than an optional argument: a caller
 * resolving a name gets the shadow test by writing the name down, instead of by
 * remembering that a hazard exists.
 */
export function resolveNameInEnclosingScopes<T>(
  from: TSESTree.Node,
  name: string,
  namespace: BindingNamespace,
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
    // Tested after the statement list, so a container that both declares the
    // name and binds it — `function f<T>() { type T = …; }` — resolves to the
    // declaration the reference actually denotes.
    if (bindsNameOutsideStatements(current, name, namespace)) {
      return undefined;
    }
    current = current.parent as TSESTree.Node | undefined;
  }
  return fallback?.();
}
