import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { declarationOf, resolveInEnclosingScopes } from './lexicalScope';

/**
 * Whether a written return annotation describes a RESOURCE HANDLE: an object
 * type carrying a function-valued member, the closure that releases whatever
 * the call allocated.
 *
 * Two rules must give the same answer to that question, in opposite directions,
 * so the answer lives here rather than in either of them:
 *
 *   - `enforce-memoize-async` DECLINES to demand `@Memoize()` on a method whose
 *     result is a handle. A cached handle factory hands every later caller the
 *     first caller's live lease and the release closure bound to it.
 *   - `no-explicit-return-type` DECLINES to strip that annotation, because the
 *     annotation is the only thing the carve-out above reads.
 *
 * Split predicates would not merely drift, they would silently cancel: a shape
 * the owner exempts and the reader strips loses the carve-out inside a single
 * unattended `eslint --fix` run, which re-lints until the output settles, so the
 * strip and the memoization it re-enables land together (#2068, #2073). That is
 * the same failure `lexicalScope` was extracted to prevent, one contract later.
 */

/**
 * Type names that wrap a value without changing what the value IS: the awaited
 * result of a promise, the elements of an array, a shallowly-frozen view of an
 * object. A lease handed back inside any of them is still the caller's lease,
 * so the handle test reads through them. A container taking more than the one
 * type argument — `Map<string, Lease>` — is left alone: it describes a registry
 * the method looked a handle up in rather than a handle the call allocated.
 */
const RESULT_CONTAINER_TYPES = new Set([
  'Promise',
  'Array',
  'ReadonlyArray',
  'Readonly',
]);

/** A same-file type declaration the handle test can read members off. */
type ResolvableTypeDeclaration =
  | TSESTree.TSTypeAliasDeclaration
  | TSESTree.TSInterfaceDeclaration;

/**
 * The interface or alias a statement list declares under the name, interface
 * first — the ordering `no-firestore-object-arrays` resolves type names in, kept
 * identical so that two rules reading the same file cannot disagree about what
 * a name denotes.
 */
function typeDeclarationIn(
  statements: readonly TSESTree.Node[],
  name: string,
): ResolvableTypeDeclaration | undefined {
  let alias: TSESTree.TSTypeAliasDeclaration | undefined;
  for (const statement of statements) {
    const declaration = declarationOf(statement);
    if (
      declaration.type === AST_NODE_TYPES.TSInterfaceDeclaration &&
      declaration.id.name === name
    ) {
      return declaration;
    }
    if (
      declaration.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
      declaration.id.name === name
    ) {
      alias = declaration;
    }
  }
  return alias;
}

/**
 * The same-file declaration a type name denotes at the point it is written.
 *
 * A handle type is named far more often than it is spelled inline, so a test
 * that reads only `TSTypeLiteral` would exempt the shape the issue reports and
 * keep memoizing the identical method one `type Admission = { … }` later. Only
 * lexical resolution is attempted: an imported handle type resolves nowhere
 * here, and the method keeps reporting, which is the false negative this rule
 * prefers over reaching for type information it does not require.
 */
function resolveTypeDeclaration(
  from: TSESTree.Node,
  name: string,
): ResolvableTypeDeclaration | undefined {
  return resolveInEnclosingScopes<ResolvableTypeDeclaration>(
    from,
    (statements) => typeDeclarationIn(statements, name),
  );
}

/**
 * Whether a member's declared type can hold a function.
 *
 * A union arm counts, unlike the union arm of a callback PARAMETER: the
 * parameter test in `enforce-memoize-async` asks whether an argument is
 * unkeyable, which a `string | (() => void)` argument need not be, while this
 * asks whether the returned object can carry a caller-owned closure, which
 * `(() => void) | undefined` plainly can. That rule's transaction carve-out
 * reads unions the same way, and for the same reason: one arm carrying the
 * hazard is enough, because the caller that receives that arm is the one
 * harmed.
 */
function declaresCallableType(
  type: TSESTree.TypeNode | undefined,
  from: TSESTree.Node,
  seen: ReadonlySet<TSESTree.Node>,
): boolean {
  if (!type) {
    return false;
  }
  if (type.type === AST_NODE_TYPES.TSFunctionType) {
    return true;
  }
  if (
    type.type === AST_NODE_TYPES.TSUnionType ||
    type.type === AST_NODE_TYPES.TSIntersectionType
  ) {
    return type.types.some((arm) => declaresCallableType(arm, from, seen));
  }
  if (
    type.type === AST_NODE_TYPES.TSTypeReference &&
    type.typeName.type === AST_NODE_TYPES.Identifier
  ) {
    const declaration = resolveTypeDeclaration(from, type.typeName.name);
    if (
      declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
      !seen.has(declaration)
    ) {
      return declaresCallableType(
        declaration.typeAnnotation,
        declaration,
        new Set([...seen, declaration]),
      );
    }
  }
  return false;
}

/**
 * Whether one member of an object type carries a callable — the member that
 * makes the object a handle rather than data.
 *
 * A method signature (`release(): void`) is callable by construction; a getter
 * or setter signature is a property access wearing a parameter list, so only
 * `kind: 'method'` answers. An index signature is deliberately not a member
 * here: `{ [event: string]: () => void }` is a lookup table of handlers, which
 * a second caller can share without losing anything the first one owned.
 */
function memberCarriesCallable(
  member: TSESTree.TypeElement,
  from: TSESTree.Node,
  seen: ReadonlySet<TSESTree.Node>,
): boolean {
  if (member.type === AST_NODE_TYPES.TSMethodSignature) {
    return member.kind === 'method';
  }
  if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
    return false;
  }
  const type = member.typeAnnotation?.typeAnnotation;
  return (
    declaresCallableType(type, from, seen) ||
    declaresResourceHandle(type, from, seen)
  );
}

/**
 * Whether a declared type describes a resource handle: an object type with at
 * least one function-valued member, written inline or reached through a
 * same-file alias or interface, at any nesting depth and inside any of the
 * result containers above.
 *
 * The test is STRUCTURAL rather than a name allowlist. `release`, `dispose`,
 * `close` and `unsubscribe` are the spellings that come to mind, but `free`,
 * `cancel`, `destroy`, `abort` and `[Symbol.dispose]` are the same member, and
 * a list that omits any of them re-reports the very method the carve-out exists
 * for — the harmful direction, since both rules reading this predicate carry a
 * fixer that applies unattended. Reading the shape instead costs the opposite error: an object
 * that merely bundles a callback with its data goes unreported. That is the
 * error this repo prefers, and it is small, because an async method whose
 * result carries a closure is already sharing that closure's captured state
 * with every caller a cache would serve.
 *
 * A bare callable result (`Promise<() => void>`) is NOT a handle: the closure
 * is the whole result, with no resource paired to it whose accounting a shared
 * reference corrupts, and that shape is how a compiled formatter, a resolved
 * renderer or a prepared query is returned — results whose whole point is to be
 * computed once. The carve-out stays on the pairing, which is what makes the
 * value caller-owned.
 */
function declaresResourceHandle(
  type: TSESTree.TypeNode | undefined,
  from: TSESTree.Node,
  seen: ReadonlySet<TSESTree.Node>,
): boolean {
  if (!type) {
    return false;
  }
  if (type.type === AST_NODE_TYPES.TSTypeLiteral) {
    return type.members.some((member) =>
      memberCarriesCallable(member, from, seen),
    );
  }
  if (
    type.type === AST_NODE_TYPES.TSUnionType ||
    type.type === AST_NODE_TYPES.TSIntersectionType
  ) {
    return type.types.some((arm) => declaresResourceHandle(arm, from, seen));
  }
  if (type.type === AST_NODE_TYPES.TSArrayType) {
    return declaresResourceHandle(type.elementType, from, seen);
  }
  if (type.type === AST_NODE_TYPES.TSTypeOperator) {
    return (
      type.operator === 'readonly' &&
      declaresResourceHandle(type.typeAnnotation, from, seen)
    );
  }
  if (
    type.type !== AST_NODE_TYPES.TSTypeReference ||
    type.typeName.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const { name } = type.typeName;
  if (RESULT_CONTAINER_TYPES.has(name)) {
    const typeArguments = type.typeParameters?.params;
    return (
      typeArguments?.length === 1 &&
      declaresResourceHandle(typeArguments[0], from, seen)
    );
  }
  const declaration = resolveTypeDeclaration(from, name);
  if (!declaration || seen.has(declaration)) {
    return false;
  }
  const visited = new Set([...seen, declaration]);
  if (declaration.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
    return declaresResourceHandle(
      declaration.typeAnnotation,
      declaration,
      visited,
    );
  }
  return declaration.body.body.some((member) =>
    memberCarriesCallable(member, declaration, visited),
  );
}

/**
 * Whether the method's declared result is a resource handle it allocates for
 * the caller.
 *
 * Memoizing such a method is not a cache with a staleness caveat, it is a
 * correctness failure: every caller after the first receives the FIRST caller's
 * handle and the release closure bound to it. Two concurrent callers then hold
 * one lease between them while the pool accounts for two, and whichever caller
 * finishes first releases a resource the others still believe they own. The
 * `Promise<void>` carve-out cannot reach this — the method returns a value, and
 * the value is exactly the problem — and the failure is silent and
 * load-dependent, so the fixer would ship it under `--fix` past a green
 * concurrency suite.
 *
 * The decision comes from the written annotation, as the other return-type
 * carve-outs do: neither rule requires `parserOptions.project`, and an
 * unannotated method declares no result to honour. That is also why the
 * reader must preserve the annotation — it is the entirety of the evidence.
 */
export function declaresResourceHandleResult(
  returnType: TSESTree.TSTypeAnnotation | undefined,
): boolean {
  const annotation = returnType?.typeAnnotation;
  if (!annotation) {
    return false;
  }
  return declaresResourceHandle(annotation, annotation, new Set());
}
