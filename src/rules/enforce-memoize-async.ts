import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  importAnchorIndent,
  importAnchorLineStartIfOwned,
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';
import { declaresResourceHandleResult } from '../utils/resourceHandleType';

type MessageIds = 'requireMemoize';
type Options = [];

const MEMOIZE_MODULE = '@blumintinc/typescript-memoize';
const ALLOWED_MEMOIZE_MODULES = new Set([MEMOIZE_MODULE, 'typescript-memoize']);
const MEMOIZE_NAME = 'Memoize';

/**
 * A named specifier that binds `Memoize` under its own name — the only shape
 * that makes a bare `@Memoize()` decorator resolve to the decorator factory. An
 * alias (`import { Memoize as Cache }`) leaves the name free for the injected
 * import, and a type-only specifier erases at compile time, so neither backs a
 * value reference.
 */
function isMemoizeSpecifier(
  specifier: TSESTree.Node,
): specifier is TSESTree.ImportSpecifier {
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.type === AST_NODE_TYPES.Identifier &&
    specifier.imported.name === MEMOIZE_NAME &&
    specifier.local.name === MEMOIZE_NAME
  );
}

/**
 * Whether every declaration of a visible `Memoize` binding is a value import of
 * the decorator itself. A local const/function/class, an enclosing class of the
 * same name, a parameter, a namespace or default import, or a named import from
 * any other module all mean the emitted `@Memoize()` would resolve somewhere
 * other than the decorator factory.
 */
function bindsMemoize(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (!isMemoizeSpecifier(specifier)) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        declaration.importKind !== 'type' &&
        ALLOWED_MEMOIZE_MODULES.has(String(declaration.source.value))
      );
    })
  );
}

/**
 * `jest.mock` hoists its module factory above the file's imports;
 * `doMock`/`setMock` register a factory of the same shape at call time. The
 * hoist rejects a factory that reads any out-of-scope binding whose name does
 * not begin with `mock`, which is what puts a module-scope `Memoize` binding —
 * injected or already present — out of reach inside one.
 */
const MOCK_REGISTRARS = new Set(['mock', 'doMock', 'setMock']);

/** Whether the call registers a module factory with `jest`. */
function isMockRegistrarCall(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const { object, property } = callee;
  return (
    object.type === AST_NODE_TYPES.Identifier &&
    object.name === 'jest' &&
    property.type === AST_NODE_TYPES.Identifier &&
    MOCK_REGISTRARS.has(property.name)
  );
}

/**
 * Whether the node sits inside the factory a jest registrar hoists — the second
 * argument of the call. The module specifier that precedes it is evaluated in
 * place and keeps its access to the file's imports, so only the factory subtree
 * is out of reach.
 */
function isInsideMockFactory(node: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
  let parent = node.parent;
  while (parent) {
    if (
      parent.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments[1] === child &&
      isMockRegistrarCall(parent)
    ) {
      return true;
    }
    child = parent;
    parent = parent.parent;
  }
  return false;
}

/**
 * The class a method belongs to, reached through its `ClassBody`.
 */
function enclosingClass(
  node: TSESTree.MethodDefinition,
): TSESTree.Node | undefined {
  const body = node.parent;
  return body?.type === AST_NODE_TYPES.ClassBody ? body.parent : undefined;
}

/**
 * Whether the method's own class is written as an expression — `const C = class
 * {}`, a class in argument position, a class assigned to a property — rather
 * than as a declaration.
 *
 * Under `experimentalDecorators` — the mode this plugin's consumers compile in
 * — TypeScript accepts a member decorator only inside a class DECLARATION: the
 * same `@Memoize()` that compiles inside `class C {}`, `export class C {}` or
 * `export default class {}` is `TS1206: Decorators are not valid here.` inside
 * a class expression, whatever the member is named and wherever the decorator
 * is written. Report and fix are both withheld: the only remedy the message
 * offers is "add @Memoize() above the method", which is unwritable there, and a
 * report naming an edit its reader cannot make is worse than silence.
 *
 * The enclosing class is read directly rather than by walking ancestors: a
 * class DECLARATION nested inside a class expression's method takes decorators
 * normally, and `export default class { … }` is a declaration despite having no
 * name.
 */
function isInsideClassExpression(node: TSESTree.MethodDefinition): boolean {
  return enclosingClass(node)?.type === AST_NODE_TYPES.ClassExpression;
}

/**
 * Whether a declared return type annotation promises no value: `void` or
 * `Promise<void>`.
 *
 * Memoizing such a method caches nothing — there is no result to hand back —
 * while changing runtime behaviour: the side effects run once per instance and
 * every later call silently no-ops. Because the decision comes from the
 * annotation node, spacing and line breaks inside the type are irrelevant.
 *
 * The check stays keyed to a plain `void`: a union (`Promise<void | undefined>`)
 * or a type parameter (`Promise<T>`) can resolve to a value, so those still
 * warrant caching. Absent annotations are likewise not exempt — this rule is
 * syntactic (no `parserOptions.project`), so an unannotated body carries no
 * declaration of intent to honour, and exempting inferred void would silently
 * drop methods the author never marked value-less.
 */
function declaresVoidResult(
  returnType: TSESTree.TSTypeAnnotation | undefined,
): boolean {
  const annotation = returnType?.typeAnnotation;
  if (!annotation) {
    return false;
  }
  if (annotation.type === AST_NODE_TYPES.TSVoidKeyword) {
    return true;
  }
  if (
    annotation.type !== AST_NODE_TYPES.TSTypeReference ||
    annotation.typeName.type !== AST_NODE_TYPES.Identifier ||
    annotation.typeName.name !== 'Promise'
  ) {
    return false;
  }
  const typeArguments = annotation.typeParameters?.params;
  return (
    typeArguments?.length === 1 &&
    typeArguments[0].type === AST_NODE_TYPES.TSVoidKeyword
  );
}

/**
 * The type annotation a parameter declares, reached through the wrapper shapes
 * a parameter can take. A default value (`cb = noop`) holds the annotated
 * binding in `left`, while a rest element carries the annotation on itself and
 * keeps only the binding name in `argument`.
 */
function parameterAnnotation(param: TSESTree.Parameter) {
  if (param.type === AST_NODE_TYPES.Identifier) {
    return param.typeAnnotation?.typeAnnotation;
  }
  if (param.type === AST_NODE_TYPES.AssignmentPattern) {
    return param.left.typeAnnotation?.typeAnnotation;
  }
  if (param.type === AST_NODE_TYPES.RestElement) {
    return (
      param.typeAnnotation?.typeAnnotation ??
      (param.argument.type === AST_NODE_TYPES.Identifier
        ? param.argument.typeAnnotation?.typeAnnotation
        : undefined)
    );
  }
  return undefined;
}

/**
 * Whether the method's sole parameter is annotated as a function.
 *
 * `@Memoize()` keys its cache on the argument value, compared against stored
 * entries by deep equality. A function argument satisfies that comparison in
 * exactly two ways and both defeat the decorator: a stable reference (a
 * module-level function, a bound method, `this.handler`) matches the first
 * entry, so every later call replays the first result and the body never runs
 * again; a fresh arrow per call — the common shape — matches nothing, so every
 * lookup misses while the map accumulates one dead closure per call and each
 * later call pays a longer scan. Neither is an optimisation, and the fixer
 * would apply it unattended, so such a method is skipped.
 *
 * The `params.length > 1` gate already encodes that the decorator keys on a
 * single argument; this asks the remaining question, whether that argument is
 * keyable at all.
 *
 * Detection is syntactic, mirroring the return-type exemption: only an
 * annotation written as a function type declares the intent to honour. A
 * callback reached through a type alias (`onUrl: UrlPresenter`) or hidden in a
 * union (`cb: string | (() => void)`) is not categorically a function without a
 * type checker this rule deliberately does not require, and an unannotated
 * parameter declares nothing at all, so all of those keep reporting.
 */
function declaresFunctionParameter(params: TSESTree.Parameter[]): boolean {
  if (params.length !== 1) {
    return false;
  }
  return parameterAnnotation(params[0])?.type === AST_NODE_TYPES.TSFunctionType;
}

/**
 * A database transaction handle is valid only for the attempt that created it,
 * and a transaction body is re-run whenever the driver retries — Firestore
 * retries an attempt whose reads a concurrent write invalidated. A memoized
 * body hands the retry the first attempt's cached promise, so the retry queues
 * no writes on its own handle, commits empty, and the caller reads the first
 * attempt's return value and reports success. Memoizing the method that OWNS
 * the transaction is the same defect one level up: the whole transaction, writes
 * included, then runs once per instance.
 */
const TRANSACTION_TYPE_NAME = 'Transaction';
const RUN_TRANSACTION_NAME = 'runTransaction';

/**
 * Keys that hold source positions or the tree's only back-edge rather than
 * child nodes; `parent` would make a subtree walk non-terminating.
 */
const NON_TRAVERSABLE_KEYS = new Set(['parent', 'range', 'loc', 'type']);

/** Every node of `root`'s subtree, `root` included. */
function* subtreeOf(root: TSESTree.Node): Generator<TSESTree.Node> {
  yield root;
  for (const [key, value] of Object.entries(root)) {
    if (NON_TRAVERSABLE_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const element of value) {
        if (ASTHelpers.isNode(element)) {
          yield* subtreeOf(element);
        }
      }
    } else if (ASTHelpers.isNode(value)) {
      yield* subtreeOf(value);
    }
  }
}

/** The name a call invokes, for `f()` and for `o.f()` alike. */
function calleeName(node: TSESTree.CallExpression): string | undefined {
  const callee = withoutChain(node.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name;
  }
  return undefined;
}

/**
 * Whether the node is a `runTransaction(…)` call, under any receiver:
 * `db.runTransaction`, `firestore.runTransaction` and a bare imported
 * `runTransaction` all open a retryable transaction.
 */
function isRunTransactionCall(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    calleeName(node) === RUN_TRANSACTION_NAME
  );
}

/** Whether the method opens a transaction anywhere in its own body. */
function ownsTransaction(fn: TSESTree.FunctionExpression): boolean {
  for (const node of subtreeOf(fn)) {
    if (isRunTransactionCall(node)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a type name denotes the transaction handle. The rightmost segment is
 * the type's own name, so the qualified spellings — `FirebaseFirestore.
 * Transaction`, `admin.firestore.Transaction` — answer alongside the bare one;
 * a locally aliased import (`import { Transaction as Txn }`) answers through
 * the alias set the file's imports define.
 */
function namesTransaction(
  typeName: TSESTree.EntityName,
  aliases: ReadonlySet<string>,
): boolean {
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return (
      typeName.name === TRANSACTION_TYPE_NAME || aliases.has(typeName.name)
    );
  }
  if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
    return typeName.right.name === TRANSACTION_TYPE_NAME;
  }
  return false;
}

/**
 * Whether a declared type hands the method a transaction handle: written
 * directly, as one arm of a union or intersection, or as a property of an
 * object type — the shape a destructured `{ transaction }: { transaction:
 * Transaction }` parameter carries.
 *
 * Type ARGUMENTS are deliberately not entered: `Map<string, Transaction>` or
 * `Promise<Transaction>` describes a collection of handles or a handle yet to
 * exist, neither of which is the attempt-scoped handle this carve-out is about.
 */
function declaresTransactionType(
  annotation: TSESTree.TypeNode | undefined,
  aliases: ReadonlySet<string>,
): boolean {
  if (!annotation) {
    return false;
  }
  if (annotation.type === AST_NODE_TYPES.TSTypeReference) {
    return namesTransaction(annotation.typeName, aliases);
  }
  if (
    annotation.type === AST_NODE_TYPES.TSUnionType ||
    annotation.type === AST_NODE_TYPES.TSIntersectionType
  ) {
    return annotation.types.some((member) =>
      declaresTransactionType(member, aliases),
    );
  }
  if (annotation.type === AST_NODE_TYPES.TSTypeLiteral) {
    return annotation.members.some(
      (member) =>
        member.type === AST_NODE_TYPES.TSPropertySignature &&
        declaresTransactionType(member.typeAnnotation?.typeAnnotation, aliases),
    );
  }
  return false;
}

/**
 * The type annotation a parameter declares, including the destructuring shapes
 * `parameterAnnotation` does not reach: an object or array pattern carries its
 * annotation on the pattern itself.
 */
function bindingAnnotation(param: TSESTree.Parameter) {
  if (
    param.type === AST_NODE_TYPES.ObjectPattern ||
    param.type === AST_NODE_TYPES.ArrayPattern
  ) {
    return param.typeAnnotation?.typeAnnotation;
  }
  return parameterAnnotation(param);
}

/**
 * Whether the method declares a parameter typed as a transaction handle.
 *
 * The test reads the ANNOTATION, not the parameter's name: a parameter merely
 * named `transaction` is as likely to hold a payment or a ledger entry, and the
 * rule's other carve-outs (void result, callback parameter) are annotation-driven
 * for the same reason. A bare `async apply(transaction)` therefore keeps
 * reporting — it declares nothing to honour, and under the `noImplicitAny` its
 * consumers compile with it does not type-check anyway. Where the handle arrives
 * through an unresolvable alias (`args: MembershipArgs`), the call-site test
 * below is what recognises it.
 */
function declaresTransactionParameter(
  params: TSESTree.Parameter[],
  aliases: ReadonlySet<string>,
): boolean {
  return params.some((param) =>
    declaresTransactionType(bindingAnnotation(param), aliases),
  );
}

/**
 * The expression itself, with any `ChainExpression` wrapper removed. ESTree
 * wraps a whole optional chain in that node, so `this?.body` and
 * `this.body.bind?.(this)` reach a bare member/call test as something else
 * entirely. Nullish spellings carry the transaction handle exactly as the plain
 * ones do, and reading through the wrapper is what keeps the carve-out from
 * lapsing on them — a lapse that would restore the empty-commit autofix.
 */
function withoutChain(node: TSESTree.Node): TSESTree.Node {
  return node.type === AST_NODE_TYPES.ChainExpression
    ? withoutChain(node.expression)
    : node;
}

/** The own-method name a `this.foo` reference reads, if it reads one. */
function thisMemberName(node: TSESTree.Node): string | undefined {
  const expression = withoutChain(node);
  if (
    expression.type === AST_NODE_TYPES.MemberExpression &&
    !expression.computed &&
    withoutChain(expression.object).type === AST_NODE_TYPES.ThisExpression &&
    expression.property.type === AST_NODE_TYPES.Identifier
  ) {
    return expression.property.name;
  }
  // `this.body.bind(this)` passes the same method, one wrapper out.
  if (
    expression.type === AST_NODE_TYPES.CallExpression &&
    expression.callee.type === AST_NODE_TYPES.MemberExpression &&
    !expression.callee.computed &&
    expression.callee.property.type === AST_NODE_TYPES.Identifier &&
    expression.callee.property.name === 'bind'
  ) {
    return thisMemberName(expression.callee.object);
  }
  return undefined;
}

/** Whether the subtree mentions the binding, under any nesting. */
function mentionsBinding(node: TSESTree.Node, name: string): boolean {
  for (const descendant of subtreeOf(node)) {
    if (
      descendant.type === AST_NODE_TYPES.Identifier &&
      descendant.name === name
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Own methods a `runTransaction` argument hands the attempt to: the method
 * passed as the callback itself, and every `this.method(…)` the callback body
 * invokes with the attempt's handle among its arguments.
 *
 * Passing the handle on is what makes a method part of the attempt, so a
 * helper the callback calls WITHOUT it — a config read, a lookup that takes no
 * transaction — is untouched and keeps reporting.
 */
function collectTransactionParticipants(
  argument: TSESTree.Node,
  participants: Set<string>,
): void {
  const passed = thisMemberName(argument);
  if (passed) {
    participants.add(passed);
    return;
  }
  if (
    argument.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    argument.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return;
  }
  const handle = argument.params[0];
  if (handle?.type !== AST_NODE_TYPES.Identifier) {
    return;
  }
  for (const node of subtreeOf(argument.body)) {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    const method = thisMemberName(node.callee);
    if (
      method &&
      node.arguments.some((arg) => mentionsBinding(arg, handle.name))
    ) {
      participants.add(method);
    }
  }
}

/** Every own method the class hands a transaction handle to. */
function transactionParticipantsOf(body: TSESTree.ClassBody): Set<string> {
  const participants = new Set<string>();
  for (const node of subtreeOf(body)) {
    if (!isRunTransactionCall(node)) {
      continue;
    }
    for (const argument of (node as TSESTree.CallExpression).arguments) {
      collectTransactionParticipants(argument, participants);
    }
  }
  return participants;
}

/**
 * Node types that own the statements written inside them. A walk bounded by
 * them answers about what the method DOES rather than about what it merely
 * defines: a `try`/`finally` written inside a callback is that callback's
 * acquire/release pair, and a field written inside one is written on whatever
 * schedule the callback runs on. The decorator caches the method's own promise,
 * so only the method's own steps bear on whether caching is safe.
 */
const OWN_STEP_BOUNDARIES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
]);

/**
 * Every node the enclosing function executes as its own step, `root` included.
 * Descent stops at a nested function, which `subtreeOf` enters.
 */
function* ownSubtreeOf(root: TSESTree.Node): Generator<TSESTree.Node> {
  yield root;
  for (const [key, value] of Object.entries(root)) {
    if (NON_TRAVERSABLE_KEYS.has(key)) {
      continue;
    }
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (ASTHelpers.isNode(child) && !OWN_STEP_BOUNDARIES.has(child.type)) {
        yield* ownSubtreeOf(child);
      }
    }
  }
}

/**
 * The expression under the wrappers that stand between a value and the access
 * path it evaluates. `await this.pending`, `this.pending!`, `this.pending as
 * Ready` and `this?.pending` all read the same field, and a discriminator blind
 * to one of those spellings would answer "hands back something else" about a
 * method that hands back exactly what it wrote.
 */
function withoutValueWrappers(node: TSESTree.Node): TSESTree.Node {
  switch (node.type) {
    case AST_NODE_TYPES.AwaitExpression:
      return withoutValueWrappers(node.argument);
    case AST_NODE_TYPES.ChainExpression:
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
      return withoutValueWrappers(node.expression);
    default:
      return node;
  }
}

/**
 * The instance field an expression is rooted at: `cached` for `this.cached`,
 * for `this.cached.value` and for `this.cache[id]` alike.
 *
 * Both sides of the discriminator below read the ROOT, so an element write
 * (`this.cache[id] = …`) and the read that answers it (`return this.cache[id]`)
 * meet on the same name. A computed root (`this[key]`) names no field
 * statically and answers nothing, which leaves the method reporting.
 */
function rootThisField(node: TSESTree.Node): string | undefined {
  const expression = withoutValueWrappers(node);
  if (expression.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const object = withoutValueWrappers(expression.object);
  if (object.type !== AST_NODE_TYPES.ThisExpression) {
    return rootThisField(object);
  }
  return !expression.computed &&
    expression.property.type === AST_NODE_TYPES.Identifier
    ? expression.property.name
    : undefined;
}

/**
 * Every binding an assignment target names, with its destructuring patterns
 * opened up: `client` and `done` for `const { client, done } = pool.connect()`.
 *
 * One call hands back several names as readily as one, and the acquire/release
 * triangle below is read across all of them — the guarded block works through
 * one of them while the `finally` gives the resource back through another.
 */
function* patternBindingsOf(target: TSESTree.Node): Generator<string> {
  switch (target.type) {
    case AST_NODE_TYPES.Identifier:
      yield target.name;
      return;
    case AST_NODE_TYPES.ObjectPattern:
      for (const property of target.properties) {
        yield* patternBindingsOf(
          property.type === AST_NODE_TYPES.RestElement
            ? property
            : property.value,
        );
      }
      return;
    case AST_NODE_TYPES.ArrayPattern:
      for (const element of target.elements) {
        if (element) {
          yield* patternBindingsOf(element);
        }
      }
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      yield* patternBindingsOf(target.left);
      return;
    case AST_NODE_TYPES.RestElement:
      yield* patternBindingsOf(target.argument);
      return;
    default:
    // A `this.field` or `obj[key]` target names a place rather than a binding,
    // and a place outlives the call that filled it.
  }
}

/** Whether the value a binding takes is obtained from a call. */
function isAcquisition(value: TSESTree.Node): boolean {
  const expression = withoutValueWrappers(value);
  return (
    expression.type === AST_NODE_TYPES.CallExpression ||
    expression.type === AST_NODE_TYPES.NewExpression
  );
}

/**
 * The bindings the method's own steps take FROM a call, grouped by the call
 * that established them: `[ticket]` for `const ticket = this.queue.enqueue()`,
 * `[client, done]` for `const { client, done } = await this.pool.connect()`,
 * and `[conn]` for a `conn = await pool.acquire()` written into a `let`
 * declared ahead of the `try`. A `new` counts as readily as a call, since a
 * handle is constructed as often as it is handed out.
 *
 * A parameter is not among them, and neither is an instance field. What the
 * caller acquired and passed in the caller also decides the lifetime of, and a
 * field outlives the call that filled it, so in neither case does the body
 * carry an acquisition for the `finally` to pair against.
 */
function acquisitionsOf(fn: TSESTree.FunctionExpression): Set<string>[] {
  const acquisitions: Set<string>[] = [];
  const record = (target: TSESTree.Node, value: TSESTree.Node | null) => {
    if (!value || !isAcquisition(value)) {
      return;
    }
    const bindings = new Set(patternBindingsOf(target));
    if (bindings.size > 0) {
      acquisitions.push(bindings);
    }
  };
  for (const node of ownSubtreeOf(fn.body)) {
    if (node.type === AST_NODE_TYPES.VariableDeclarator) {
      record(node.id, node.init);
    } else if (node.type === AST_NODE_TYPES.AssignmentExpression) {
      record(node.left, node.right);
    }
  }
  return acquisitions;
}

/** Whether the subtree mentions any of the bindings. */
function mentionsAny(node: TSESTree.Node, names: ReadonlySet<string>): boolean {
  for (const name of names) {
    if (mentionsBinding(node, name)) {
      return true;
    }
  }
  return false;
}

/**
 * Words that name handing a resource BACK, as opposed to reporting on the work
 * that used it.
 *
 * Words for a lifetime merely ENDING are deliberately absent — `end`, `finish`,
 * `stop`, `complete`, `clear`. Every `finally` runs when the work ends, so
 * those name the moment rather than a hand-back, and they are how observability
 * and timers are spelled: `span.end()`, `clearTimeout(t)`. A genuine hand-back
 * spelled that way keeps its carve-out through the triangle below, which
 * answers whenever the guarded block worked through the thing being ended.
 */
const RELEASE_WORDS = new Set([
  'abandon',
  'abort',
  'cancel',
  'cleanup',
  'close',
  'destroy',
  'detach',
  'disconnect',
  'dispose',
  'free',
  'release',
  'restore',
  'revert',
  'rollback',
  'teardown',
  'unbind',
  'unlock',
  'unregister',
  'unsubscribe',
  'unwatch',
]);

/**
 * The words a name is spelled from, lowercased: `releaseLock` and
 * `release_lock` both give `release` and `lock`. Reading whole words rather
 * than substrings is what keeps `clearTimeout` out of the release vocabulary
 * while `disconnectAll` stays in it.
 */
function wordsOf(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
}

/** Whether the call is spelled as a hand-back rather than as a report. */
function namesRelease(call: TSESTree.CallExpression): boolean {
  const name = calleeName(call);
  return (
    name !== undefined && wordsOf(name).some((word) => RELEASE_WORDS.has(word))
  );
}

/**
 * Whether the `finally` gives back something the method took, rather than
 * reporting on the work that took it.
 *
 * Two shapes answer yes. The first is the acquire/hold/release triangle read
 * off the body alone: the finalizer's call names a binding some call in the
 * body established, and the guarded block worked through that same acquisition.
 * A ticket enqueued, polled on and abandoned is that triangle, and so is a
 * lease, a connection or a transaction under any spelling, because no name is
 * consulted to see it. Requiring the guarded block to WORK THROUGH the handle
 * is what separates a resource held across the value being produced from
 * bookkeeping the work never touched — `clearTimeout(t)` beside a `fetch` that
 * ignores `t`, or a span that observes the attempt from outside it.
 *
 * The second shape is the name, and it covers the release a method does not
 * acquire: the caller takes the lock and passes it in, leaving `finally {
 * lock.release() }` with nothing in the body to pair against. Structurally that
 * is indistinguishable from `finally { span.end() }` — same receiver kind, same
 * arity, same absence of any acquisition — so the word is the only evidence
 * there is, and only words that name a hand-back are read as one.
 *
 * A candidate call is found with the step walk, which stops at a function the
 * finalizer merely DEFINES, but judged with the unbounded one: an immediately
 * invoked `(async () => { await this.queue.abandon(ticket.id); })()` performs
 * its body as part of the invocation, so that body is the method's own release
 * however the invocation is spelled.
 */
function releasesResource(
  guarded: TSESTree.BlockStatement,
  finalizer: TSESTree.BlockStatement,
  acquisitions: readonly Set<string>[],
): boolean {
  for (const node of ownSubtreeOf(finalizer)) {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    if (namesRelease(node)) {
      return true;
    }
    for (const bindings of acquisitions) {
      if (mentionsAny(node, bindings) && mentionsAny(guarded, bindings)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether the method owns an acquire/release pair: a `try` among its own steps
 * whose `finalizer` hands a resource back.
 *
 * What such a method returns describes one attempt — a grant held while a queue
 * ticket was outstanding, a read taken while a lock was held — rather than a
 * fact that stays true once the release has run.
 *
 * An empty `finalizer` releases nothing, one that only writes a local
 * (`finally { done = true; }`) records that the attempt finished instead of
 * undoing it, and one that logs, emits a metric, ends a span or clears a timer
 * the work never touched reports on the attempt instead of giving anything
 * back, so none of them costs the method its report.
 */
function releasesInOwnFinalizer(fn: TSESTree.FunctionExpression): boolean {
  const acquisitions = acquisitionsOf(fn);
  for (const node of ownSubtreeOf(fn.body)) {
    if (
      node.type === AST_NODE_TYPES.TryStatement &&
      node.finalizer &&
      releasesResource(node.block, node.finalizer, acquisitions)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the expression reads a field the method wrote. Depth and nesting are
 * immaterial — `this.cached ?? EMPTY` and `() => this.cached` hand the written
 * state back as plainly as a bare `this.cached` does — because the question is
 * whether the result carries that state at all, not how it is spelled.
 */
function readsWrittenField(
  node: TSESTree.Node,
  fields: ReadonlySet<string>,
): boolean {
  for (const descendant of subtreeOf(node)) {
    const field = rootThisField(descendant);
    if (field !== undefined && fields.has(field)) {
      return true;
    }
  }
  return false;
}

/**
 * The places an assignment target names, with its destructuring patterns opened
 * up: `this.head` for `[this.head] = holders` and `this.idleSince` for
 * `({ idleSince: this.idleSince } = state)`.
 *
 * A pattern writes to every place it names, so a reader that stopped at the
 * pattern node answers "writes nothing" about a step that writes several
 * fields. Leaves are handed on unexamined, since a place is what
 * `rootThisField` decides on: a member path may or may not be rooted at `this`,
 * and a plain binding names no field at all.
 */
function* assignmentTargetsOf(target: TSESTree.Node): Generator<TSESTree.Node> {
  switch (target.type) {
    case AST_NODE_TYPES.ObjectPattern:
      for (const property of target.properties) {
        yield* assignmentTargetsOf(
          property.type === AST_NODE_TYPES.RestElement
            ? property
            : property.value,
        );
      }
      return;
    case AST_NODE_TYPES.ArrayPattern:
      for (const element of target.elements) {
        if (element) {
          yield* assignmentTargetsOf(element);
        }
      }
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      yield* assignmentTargetsOf(target.left);
      return;
    case AST_NODE_TYPES.RestElement:
      yield* assignmentTargetsOf(target.argument);
      return;
    default:
      yield target;
  }
}

/**
 * The places a step writes to. `=` is one spelling of a write among several:
 * `this.attempts++` records an attempt, `delete this.slots[id]` drops an entry
 * and `for (this.cursor of pages)` advances a field once per iteration, and a
 * method whose only write is spelled one of those ways states its effect as
 * plainly as its `=` twin does.
 *
 * A `for…of`/`for…in` that DECLARES its variable is not among them: the binding
 * is fresh per iteration and dies with the loop, so it names no place that
 * outlives the call.
 */
function* writeTargetsOf(node: TSESTree.Node): Generator<TSESTree.Node> {
  switch (node.type) {
    case AST_NODE_TYPES.AssignmentExpression:
      yield* assignmentTargetsOf(node.left);
      return;
    case AST_NODE_TYPES.UpdateExpression:
      yield node.argument;
      return;
    case AST_NODE_TYPES.UnaryExpression:
      if (node.operator === 'delete') {
        yield node.argument;
      }
      return;
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForOfStatement:
      if (node.left.type !== AST_NODE_TYPES.VariableDeclaration) {
        yield* assignmentTargetsOf(node.left);
      }
      return;
    default:
    // Every other step reads, calls or declares; none of them writes a place.
  }
}

/**
 * Whether the method writes an instance field and hands back a result that
 * reads none of the fields it wrote.
 *
 * Such a method reports on an effect: its result says what THIS call did, so
 * the next call has to be free to do it again. Writing a field and returning it
 * is the opposite shape — a hand-rolled cache, which is the very thing
 * `@Memoize()` replaces — and the field read is what separates the two. A
 * single returned read is enough, because a method with one cache-hit path
 * hands back state on that path however many effects its other paths report.
 *
 * A method with no value-returning `return` is left alone. Its result is void
 * by inference rather than by declaration, and #1548 fenced inferred void out
 * of this rule deliberately: an unannotated body carries no declaration of
 * intent to honour.
 */
function writesFieldItDoesNotReturn(fn: TSESTree.FunctionExpression): boolean {
  const written = new Set<string>();
  const results: TSESTree.Node[] = [];
  for (const node of ownSubtreeOf(fn.body)) {
    if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) {
      results.push(node.argument);
      continue;
    }
    for (const target of writeTargetsOf(node)) {
      const field = rootThisField(target);
      if (field !== undefined) {
        written.add(field);
      }
    }
  }
  if (written.size === 0 || results.length === 0) {
    return false;
  }
  return !results.some((result) => readsWrittenField(result, written));
}

/** The statically known name of a method, for matching call sites against it. */
function methodName(node: TSESTree.MethodDefinition): string | undefined {
  if (node.computed) {
    return undefined;
  }
  const { key } = node;
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }
  return undefined;
}

/**
 * Matches a memoize decorator in supported syntaxes:
 * - @Alias()
 * - @Alias
 * - @ns.Alias
 */
function isMemoizeDecorator(
  decorator: TSESTree.Decorator,
  alias: string,
): boolean {
  const expression = decorator.expression;
  /* @Alias() */
  if (expression.type === AST_NODE_TYPES.CallExpression) {
    const callee = expression.callee;
    return (
      (callee.type === AST_NODE_TYPES.Identifier && callee.name === alias) ||
      (callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === alias)
    );
  }
  /* @Alias */
  if (expression.type === AST_NODE_TYPES.Identifier) {
    return expression.name === alias;
  }
  /* @ns.Alias */
  if (
    expression.type === AST_NODE_TYPES.MemberExpression &&
    !expression.computed &&
    expression.property.type === AST_NODE_TYPES.Identifier
  ) {
    return expression.property.name === alias;
  }
  return false;
}

export const enforceMemoizeAsync = createRule<Options, MessageIds>({
  name: 'enforce-memoize-async',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce @Memoize() decorator on async methods with 0-1 parameters to cache results and prevent redundant API calls or expensive computations. Without memoization, repeated calls trigger redundant requests or expensive computations, increasing latency. @Memoize() caches results by parameter, ensuring subsequent calls with identical inputs return immediately.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireMemoize:
        'Async methods with 0-1 parameters should be decorated with @Memoize(). Without memoization, repeated calls trigger redundant network requests or expensive computations, increasing latency and risk of rate-limiting. @Memoize() caches results by parameter, ensuring subsequent calls with identical inputs return immediately. Fix: add @Memoize() above the method and import Memoize from "@blumintinc/typescript-memoize".',
    },
  },
  defaultOptions: [],
  create(context) {
    let scheduledImportFix = false;

    /**
     * The `import { Memoize }` statement rides on a single violation's fix, so
     * that violation is the file's import carrier. A suppressed carrier would
     * take the import down with it while the surviving violations still emit
     * `@Memoize()`, leaving a decorator with no import.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * Memoize bindings the file already imports, keyed by local name: aliases
     * for `import { Memoize as X }` and namespaces for `import * as X`.
     *
     * Read off `Program.body` rather than accumulated by an `ImportDeclaration`
     * visitor, because a class that precedes the import declaration in source
     * order is visited — and fixed — before that visitor runs, and would be
     * judged against state recorded for no import at all. The AST is fixed for
     * the pass, so a single scan serves every violation.
     */
    const readMemoizeImports = () => {
      const aliases = new Map<string, string>();
      const namespaces = new Map<string, string>();
      for (const statement of context.getSourceCode().ast.body) {
        if (statement.type !== AST_NODE_TYPES.ImportDeclaration) {
          continue;
        }
        const source = String(statement.source.value);
        if (!ALLOWED_MEMOIZE_MODULES.has(source)) {
          continue;
        }
        for (const spec of statement.specifiers) {
          if (
            spec.type === AST_NODE_TYPES.ImportSpecifier &&
            spec.imported.type === AST_NODE_TYPES.Identifier &&
            spec.imported.name === MEMOIZE_NAME
          ) {
            aliases.set(spec.local.name, source);
          } else if (spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
            namespaces.set(spec.local.name, source);
          }
        }
      }
      return { aliases, namespaces };
    };

    let memoizeImportCache: ReturnType<typeof readMemoizeImports> | null = null;
    const memoizeImports = () => {
      if (!memoizeImportCache) {
        memoizeImportCache = readMemoizeImports();
      }
      return memoizeImportCache;
    };

    /**
     * Local names bound to an imported `Transaction` type, so that an aliased
     * import (`import { Transaction as Txn } from 'firebase-admin/firestore'`)
     * is read as the handle it is. The module is not constrained: a handle is
     * re-exported through as many paths as a codebase has layers, and the
     * imported NAME already carries the signal.
     */
    let transactionAliasCache: Set<string> | null = null;
    const transactionAliases = () => {
      if (!transactionAliasCache) {
        transactionAliasCache = new Set<string>();
        for (const statement of context.getSourceCode().ast.body) {
          if (statement.type !== AST_NODE_TYPES.ImportDeclaration) {
            continue;
          }
          for (const spec of statement.specifiers) {
            if (
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.type === AST_NODE_TYPES.Identifier &&
              spec.imported.name === TRANSACTION_TYPE_NAME
            ) {
              transactionAliasCache.add(spec.local.name);
            }
          }
        }
      }
      return transactionAliasCache;
    };

    /**
     * The class-level scan is shared by every method of the class, so it runs
     * once per class body rather than once per candidate method.
     */
    const participantCache = new WeakMap<TSESTree.ClassBody, Set<string>>();
    const transactionParticipants = (body: TSESTree.ClassBody) => {
      let participants = participantCache.get(body);
      if (!participants) {
        participants = transactionParticipantsOf(body);
        participantCache.set(body, participants);
      }
      return participants;
    };

    /**
     * Whether the method takes part in a database transaction attempt, either
     * by opening one or by being handed the attempt's handle. Caching such a
     * method is never an optimisation: a retried attempt would replay the first
     * attempt's promise, writing nothing on its own handle while the caller
     * reads a success it did not get.
     */
    const participatesInTransaction = (
      node: TSESTree.MethodDefinition,
      fn: TSESTree.FunctionExpression,
    ) => {
      if (declaresTransactionParameter(fn.params, transactionAliases())) {
        return true;
      }
      if (ownsTransaction(fn)) {
        return true;
      }
      const body = node.parent;
      if (body?.type !== AST_NODE_TYPES.ClassBody) {
        return false;
      }
      const name = methodName(node);
      return name !== undefined && transactionParticipants(body).has(name);
    };

    return {
      MethodDefinition(node: TSESTree.MethodDefinition) {
        // Only process async instance methods (skip static methods)
        if (
          node.value.type !== AST_NODE_TYPES.FunctionExpression ||
          !node.value.async ||
          node.static
        ) {
          return;
        }

        // A `#private` name admits no decorator under `experimentalDecorators`
        // — the mode this plugin's `@Memoize()` is written for — so the
        // prescribed remedy is `TS1206: Decorators are not valid here.`,
        // measured against the repo's tsc 5.0.3, for the own-line spelling
        // exactly as for the inline one. Report and fix are both withheld, as
        // `enforce-memoize-getters` withholds them (#1945): the message's only
        // remedy, "add @Memoize() above the method", cannot be written on that
        // member, and a report naming an edit its reader cannot make is worse
        // than silence. The restriction is on the private NAME, not on privacy
        // — `private async load()` is a legal decorator position and keeps both
        // report and fix. Nothing is lost by the silence either: a `#private`
        // member is unnameable outside its class, so an author who wants
        // memoization can reach it through the `private` modifier.
        if (node.key.type === AST_NODE_TYPES.PrivateIdentifier) {
          return;
        }

        // No decorator is legal on any member of a class expression, so this
        // rule has nothing to say there: it cannot fix, and its message names
        // the one edit the author cannot write. Silence, matching the sibling
        // rules `enforce-memoize-getters` and `require-memoize-jsx-returners`.
        // Withholding the report also keeps such a method out of the
        // import-carrier race below — a violation that never reports can never
        // claim the file's `import { Memoize }` and strand it. The private-name
        // carve-out above is withheld ahead of the report for the same reason.
        if (isInsideClassExpression(node)) {
          return;
        }

        // Skip methods with more than one parameter
        if (node.value.params.length > 1) {
          return;
        }

        // A callback argument cannot serve as a cache key, so the decorator
        // either replays a stale result or never hits while leaking entries.
        if (declaresFunctionParameter(node.value.params)) {
          return;
        }

        // A method declared to produce no value has no result to cache, so the
        // decorator's benefit is unobtainable while its cost is real: the
        // fixer would convert a repeatable side effect into a
        // once-per-instance one, unattended, under `--fix`.
        if (declaresVoidResult(node.value.returnType)) {
          return;
        }

        // A method that hands back a resource handle — an object carrying the
        // closure that releases what the call allocated — must run per caller.
        // Cached, N concurrent callers share one lease and one release closure:
        // the first `release()` frees it while the remaining N-1 keep running
        // against budget nobody accounts for, and a caller's `finally` block
        // disposes another caller's resource. The failure is silent and
        // load-dependent, so the fixer would apply it unattended under `--fix`
        // and a passing concurrency suite would keep passing.
        if (declaresResourceHandleResult(node.value.returnType)) {
          return;
        }

        // A transaction handle is valid only for the attempt that created it,
        // so a result derived from one must not outlive that attempt. Caching
        // the body of a `runTransaction` callback — or the method that owns the
        // call — turns the retry a concurrent write provokes into a silent
        // no-op: the retry replays the first attempt's promise, queues nothing
        // on its own handle, commits empty, and reports the first attempt's
        // value as success. The fixer would apply that unattended under
        // `--fix`, so both report and fix are withheld.
        if (participatesInTransaction(node, node.value)) {
          return;
        }

        // A `finally` that gives back what the `try` took names an attempt:
        // the method takes a resource, works while it holds it, and hands it
        // back on the way out. What it returns describes that one attempt, not
        // a fact that stays true afterwards. Cached, the acquire/release pair
        // runs once per instance and every later caller receives a value
        // computed while a resource the `finally` has since released was still
        // held — the hazard the resource-handle exemption above names, seen
        // from the side where the method releases the handle itself, so nothing
        // of it reaches the return type for a signature-keyed gate to read. The
        // failure is silent and arrives only under concurrency, so the fixer
        // would apply it unattended under `--fix`, and both report and fix are
        // withheld.
        //
        // A `finally` that merely reports on the attempt — a log line, a
        // metric, an event, a span ended around work that never touched it —
        // hands nothing back, so it buys no silence: that is the whole of what
        // the rule exists to find, written beside a `try`.
        if (releasesInOwnFinalizer(node.value)) {
          return;
        }

        // A method that writes an instance field and hands back a result
        // reading none of the fields it wrote reports on an effect: the result
        // says what THIS call did — "I reclaimed the slot" — and the next call
        // has to be free to do it again. Cached, the write happens once per
        // instance while every later caller reads the first call's verdict
        // about work that call alone performed, and a caller passing a freshly
        // built argument object instead accumulates one dead entry per call.
        //
        // The read is the discriminator, and it is deliberately the whole test:
        // a method that writes a field and returns it is a hand-rolled cache,
        // which is the shape `@Memoize()` exists to replace, so it keeps both
        // report and fix. Carving out every write to `this` would silence that
        // shape along with these.
        if (writesFieldItDoesNotReturn(node.value)) {
          return;
        }

        const { aliases: memoizeAliases, namespaces: memoizeNamespaces } =
          memoizeImports();
        const hasMemoizeImport =
          memoizeAliases.size > 0 || memoizeNamespaces.size > 0;

        // Check if method already has @Memoize or @Memoize() decorator
        const hasDecorator = node.decorators?.some((decorator) => {
          // If no named imports were found, we assume 'Memoize' is the intended name (for legacy/global support)
          const aliasesToCheck =
            memoizeAliases.size === 0
              ? ['Memoize']
              : Array.from(memoizeAliases.keys());

          // Check against all known aliases
          for (const alias of aliasesToCheck) {
            if (isMemoizeDecorator(decorator, alias)) {
              return true;
            }
          }
          // Also check against namespaces
          const expression = decorator.expression;
          if (
            expression.type === AST_NODE_TYPES.MemberExpression &&
            !expression.computed &&
            expression.property.type === AST_NODE_TYPES.Identifier &&
            expression.property.name === 'Memoize' &&
            expression.object.type === AST_NODE_TYPES.Identifier &&
            memoizeNamespaces.has(expression.object.name)
          ) {
            return true;
          }
          // Handle namespace call: @ns.Memoize()
          if (
            expression.type === AST_NODE_TYPES.CallExpression &&
            expression.callee.type === AST_NODE_TYPES.MemberExpression &&
            !expression.callee.computed &&
            expression.callee.property.type === AST_NODE_TYPES.Identifier &&
            expression.callee.property.name === 'Memoize' &&
            expression.callee.object.type === AST_NODE_TYPES.Identifier &&
            memoizeNamespaces.has(expression.callee.object.name)
          ) {
            return true;
          }
          return false;
        });

        if (hasDecorator) {
          return;
        }

        // The report is emitted even when suppressed: ESLint discards it, and
        // reporting keeps the user's disable directive "used" so that
        // `--report-unused-disable-directives` does not flag it.
        context.report({
          node,
          messageId: 'requireMemoize',
          fix(fixer) {
            // A suppressed report is dropped together with its fix. Producing
            // no fix — and leaving the import unscheduled — passes the import
            // to the first violation that survives.
            if (isReportSuppressed(node)) {
              return null;
            }

            // A jest registrar's factory is hoisted above every import in the
            // file, so the decorator emitted inside one names a binding that
            // does not exist yet: the hoist admits only globals and
            // `mock`-prefixed bindings, and rejects the module at transform
            // time otherwise, taking the whole suite down with it. That holds
            // for an alias or namespace decorator too — those read a
            // module-scope import the factory cannot reach either. Declining
            // here, ahead of the import carrier claim below, leaves the import
            // to a violation that does fix, and leaves the report standing so
            // the author reaches for a remedy the factory can hold, such as
            // decorating the real class the mock stands in for.
            if (isInsideMockFactory(node)) {
              return null;
            }

            const fixes: TSESLint.RuleFix[] = [];
            const sourceCode = context.getSourceCode();

            // Determine which identifier to use for the decorator
            let decoratorIdent = 'Memoize';
            if (hasMemoizeImport) {
              // Prefer 'Memoize' from the new package if available
              if (
                memoizeAliases.has('Memoize') &&
                memoizeAliases.get('Memoize') === MEMOIZE_MODULE
              ) {
                decoratorIdent = 'Memoize';
              } else if (memoizeAliases.size > 0) {
                // Find first alias from new package, fallback to any alias
                const newPackageAlias = Array.from(
                  memoizeAliases.entries(),
                ).find(([, pkg]) => pkg === MEMOIZE_MODULE)?.[0];
                decoratorIdent =
                  newPackageAlias || Array.from(memoizeAliases.keys())[0];
              } else if (memoizeNamespaces.size > 0) {
                // Prefer namespace from the new package if available
                const newPackageNs = Array.from(
                  memoizeNamespaces.entries(),
                ).find(([, pkg]) => pkg === MEMOIZE_MODULE)?.[0];
                const selectedNs =
                  newPackageNs || Array.from(memoizeNamespaces.keys())[0];
                decoratorIdent = `${selectedNs}.Memoize`;
              }
            }
            const importStatement = `import { Memoize } from '${MEMOIZE_MODULE}';`;

            // Resolve `Memoize` through the scope chain at the fixed node
            // whenever the edit spells the decorator bare. A binding that is
            // not a memoize import breaks the edit two ways: the injected
            // import collides with a module-scope declaration (TS2440, or
            // TS2300 when the binding is itself an import), and a shadowing
            // parameter or block-scoped binding captures the emitted decorator
            // with no compile error at all. Declining leaves the report
            // standing so the author resolves the clash deliberately.
            //
            // An alias or namespace decorator (`@Cache()`, `@ns.Memoize()`)
            // neither references the bare name nor injects the import, so it is
            // unaffected by a `Memoize` binding and must not be declined.
            if (decoratorIdent === MEMOIZE_NAME) {
              const existing = ASTHelpers.findVariableInScope(
                ASTHelpers.getScope(context, node),
                MEMOIZE_NAME,
              );
              if (existing && !bindsMemoize(existing)) {
                return null;
              }
            }

            // Add import if it's not already present; ensure we only add once per file
            if (
              !hasMemoizeImport &&
              memoizeNamespaces.size === 0 &&
              !scheduledImportFix
            ) {
              // The shared anchor keeps the import below whatever governs the
              // top of the file — a `'use client'` directive that must stay the
              // first statement, a `#!` shebang that must stay at character 0,
              // a header comment — while still placing it above the first
              // existing import.
              const anchor = importInsertionAnchor(sourceCode);
              fixes.push(
                insertAtImportAnchor(
                  sourceCode,
                  fixer,
                  importAnchorLineStartIfOwned(sourceCode, anchor),
                  `${importAnchorIndent(
                    sourceCode,
                    anchor,
                  )}${importStatement}\n`,
                ),
              );
              scheduledImportFix = true;
            }

            // Anchor the decorator on the method — its first token, so ahead of
            // `public`/`static` and of any decorator it already carries —
            // rather than on the start of the line the method happens to sit
            // on. The two coincide only while the method is first on its line:
            // in a single-line class body, where a method shares the class's
            // own `{`, or where a property is declared ahead of it, a line-start
            // edit emits the decorator before `export class …` (or before that
            // property), decorating the CLASS with what is a METHOD decorator.
            // The method stays bare, so the rule reports it again on the next
            // pass and `--fix` stacks one more decorator per pass up to
            // ESLint's pass cap instead of reaching a fixpoint. Spelled as
            // `enforce-memoize-getters` (#1945) and
            // `require-memoize-jsx-returners` (#1951) spell it, since all three
            // rules emit the same decorator onto the same kind of member.
            const insertionTarget = node.decorators?.[0] ?? node;
            const insertionStart = insertionTarget.range[0];
            const text = sourceCode.text;
            const lineStart = text.lastIndexOf('\n', insertionStart - 1) + 1;
            const linePrefix = text.slice(lineStart, insertionStart);
            // A method that owns its line keeps the decorator on a line of its
            // own at the method's indentation, which is the layout authors
            // write by hand. A method that shares its line has no line to take,
            // and a newline there would strand the decorator against the
            // neighbour's text, so it rides inline — a spelling the grammar
            // accepts just as readily.
            const ownsItsLine = /^[ \t]*$/.test(linePrefix);
            fixes.push(
              fixer.insertTextBefore(
                insertionTarget,
                ownsItsLine
                  ? `@${decoratorIdent}()\n${linePrefix}`
                  : `@${decoratorIdent}() `,
              ),
            );

            // A member carrying a SINGLE decorator may keep it on the member's
            // own line, and a formatter preserves that. Adding a second one
            // withdraws the choice: with more than one decorator each takes a
            // line of its own. So a decorator the author wrote inline —
            // `@Log() async load() {` — has to be broken out here, or the
            // formatter does it on its next run and the file churns every pass
            // (#2111). Spelled as `enforce-memoize-getters` (#2124) and
            // `require-memoize-jsx-returners` spell it, since all three rules
            // emit the same decorator onto the same kind of member.
            if (ownsItsLine) {
              for (const decorator of node.decorators ?? []) {
                const following = sourceCode.getTokenAfter(decorator);
                if (!following) {
                  continue;
                }
                // A comment written after the decorator stays WITH the
                // decorator — that is where it was attached and where a
                // formatter leaves it — so the break goes after the comment
                // rather than before it. Anything else would move the comment
                // onto the member it does not annotate.
                const trailing = sourceCode
                  .getCommentsAfter(decorator)
                  .filter(
                    (comment) =>
                      comment.range[1] <= following.range[0] &&
                      comment.loc.start.line === decorator.loc.end.line,
                  );
                const anchor = trailing[trailing.length - 1] ?? decorator;
                if (following.loc.start.line === anchor.loc.end.line) {
                  fixes.push(
                    fixer.replaceTextRange(
                      [anchor.range[1], following.range[0]],
                      `\n${linePrefix}`,
                    ),
                  );
                }
              }
            }

            return fixes;
          },
        });
      },
    };
  },
});
