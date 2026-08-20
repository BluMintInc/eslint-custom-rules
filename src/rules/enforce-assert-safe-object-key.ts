import fs from 'fs';
import path from 'path';
import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

type MessageIds = 'useAssertSafe';
type Options = [
  {
    readonly assertSafeImportPath?: string;
  },
];

const DEFAULT_IMPORT_PATH = 'functions/src/util/assertSafe';
const ASSERT_SAFE_NAME = 'assertSafe';

/**
 * A named specifier that binds `assertSafe` under its own name — the only shape
 * that makes a bare `assertSafe(...)` call resolve to the helper. An alias
 * (`import { assertSafe as ensureSafe }`) leaves the name free for the injected
 * import, and a type-only specifier erases at compile time.
 */
function isAssertSafeSpecifier(
  specifier: TSESTree.Node,
): specifier is TSESTree.ImportSpecifier {
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.name === ASSERT_SAFE_NAME &&
    specifier.local.name === ASSERT_SAFE_NAME
  );
}

/**
 * Drops the extension and normalizes separators so two spellings of one module
 * compare equal.
 */
function normalizeModulePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\.(tsx?|jsx?|mts|cts)$/i, '');
}

/**
 * Extensions whose module system the file name settles on its own, ahead of any
 * package manifest: `.mjs` is ESM and `.cjs` is CommonJS by definition, while a
 * TypeScript source — `.mts` included — is compiled before it runs and its
 * specifiers are resolved by the compiler, which accepts the extensionless
 * form. Only `.js` is ambiguous and has to ask the nearest manifest.
 */
const NATIVE_ESM_EXTENSION = /\.mjs$/i;
const NON_NATIVE_ESM_EXTENSION = /\.(cjs|tsx?|mts|cts)$/i;
const AMBIGUOUS_JS_EXTENSION = /\.js$/i;

/**
 * Whether the nearest `package.json` at or above `startDir` declares
 * `"type": "module"`, which is what makes a `.js` file native ESM. Node consults
 * only the first manifest found, and treats a missing `type` field as
 * CommonJS — so the walk stops at the first manifest it can read, not at the
 * first one that declares a type.
 *
 * Every filesystem touch is optional: a manifest that cannot be read is
 * indistinguishable from an absent one and the walk continues, while a manifest
 * that cannot be parsed declines the extension rather than guessing. Declining
 * yields the bare specifier, which every non-ESM consumer resolves — the safer
 * answer when the tree cannot say which kind of consumer this is.
 */
function nearestManifestDeclaresModule(startDir: string): boolean {
  let dir = startDir;
  for (;;) {
    let manifest: string;
    try {
      manifest = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) {
        return false;
      }
      dir = parent;
      continue;
    }
    try {
      return (
        (JSON.parse(manifest) as { type?: unknown } | null)?.type === 'module'
      );
    } catch {
      return false;
    }
  }
}

/**
 * `jest.mock` hoists its module factory above the file's imports;
 * `doMock`/`setMock` register a factory of the same shape at call time. The
 * hoist rejects a factory that reads any out-of-scope binding whose name does
 * not begin with `mock`, which is what puts the injected `assertSafe` import
 * out of reach inside one.
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
 * Strips the wrappers that stand between a computed key and the value that
 * actually names the property. `k as string`, `k satisfies string`, `<string>k`
 * and `k!` erase at compile time, and `await k` resolves to the very same key,
 * so every one of them leaves the run-time lookup untouched — including a lookup
 * of `__proto__` or `constructor`. Reading the wrapper instead of what it holds
 * classifies nothing and turns appending `as string` into a silent bypass of the
 * guard, so the wrappers are peeled off before the key is judged.
 *
 * The peel repeats because the wrappers nest: `(x as any)!` is a non-null
 * assertion over a type assertion.
 *
 * Everything peeled here erases before the code runs, which is why the peel is
 * unconditional. An optional chain does not, so it is handled apart from these
 * — see `unwrapOptionalChain`.
 */
function unwrapKeyExpression(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  for (;;) {
    switch (current.type) {
      case AST_NODE_TYPES.TSAsExpression:
      case AST_NODE_TYPES.TSSatisfiesExpression:
      case AST_NODE_TYPES.TSNonNullExpression:
      case AST_NODE_TYPES.TSTypeAssertion:
        current = current.expression;
        break;
      case AST_NODE_TYPES.AwaitExpression:
        current = current.argument;
        break;
      default:
        return current;
    }
  }
}

/**
 * Reads through an optional chain to the member access or call it holds.
 * `source?.key` parses as a `ChainExpression` wrapping the member expression,
 * so a classification that matches a bare `MemberExpression` — or a numeric
 * proof that matches `.length` — sees the wrapper and recognizes nothing.
 *
 * Kept apart from `unwrapKeyExpression` rather than folded into it because the
 * two make different claims. Those wrappers are gone before the code runs; `?.`
 * survives and short-circuits, so it is read through only where the question is
 * "what value names this property", never where the question is what the
 * expression does. That value is what the chain evaluates to, `undefined`
 * included — and the chain guards a nullish RECEIVER, not a hostile KEY:
 * `"__proto__"` is a perfectly non-nullish string, so `store[req.body?.key]`
 * reaches the prototype surface exactly as `store[req.body.key]` does.
 */
function unwrapOptionalChain(node: TSESTree.Node): TSESTree.Node {
  return node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
}

/**
 * The key expression stripped of every wrapper standing between it and the
 * value that names the property: the compile-time assertions and the `await`
 * that `unwrapKeyExpression` peels, plus an optional chain.
 *
 * The peel repeats because the two kinds nest in either order — `source?.key as
 * string` is an assertion over a chain, `(source as Raw)?.key` a chain over an
 * assertion.
 */
function unwrapWrittenKey(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  for (;;) {
    const peeled = unwrapOptionalChain(unwrapKeyExpression(current));
    if (peeled === current) {
      return current;
    }
    current = peeled;
  }
}

/** Names that read as a positional sequence rather than a keyed record. */
const ARRAY_LIKE_NAME = /^(array|arr|items|elements|list|collection|data)s?$/i;

/**
 * The name an indexed object is judged by. A collection reached as a field —
 * `raster.data[i]`, `this.items[i]`, `a.b.list[i]` — carries its signal on the
 * property rather than on the root object, so the property name is what the
 * array-ish test sees there. An ECMA private field carries the same signal:
 * `this.#items` is the very collection `this.items` is, named under the other
 * spelling of the same privacy.
 */
function indexedObjectName(node: TSESTree.Node): string {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed) {
    const { property } = node;
    if (
      property.type === AST_NODE_TYPES.Identifier ||
      property.type === AST_NODE_TYPES.PrivateIdentifier
    ) {
      return property.name;
    }
  }
  return '';
}

/**
 * Operators that coerce both operands with ToNumeric before operating, so the
 * result is a number (or bigint) whatever the operands hold. `+` is absent: it
 * keeps string concatenation, so it is judged from its operands instead.
 */
const NUMERIC_BINARY_OPERATORS = new Set([
  '-',
  '*',
  '/',
  '%',
  '**',
  '<<',
  '>>',
  '>>>',
  '&',
  '|',
  '^',
]);

/** The compound assignments of NUMERIC_BINARY_OPERATORS, `+=` excluded. */
const NUMERIC_ASSIGNMENT_OPERATORS = new Set([
  '-=',
  '*=',
  '/=',
  '%=',
  '**=',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '|=',
  '^=',
]);

/** Global conversions whose result is a number regardless of the argument. */
const NUMERIC_CALLEE_NAMES = new Set(['Number', 'parseInt', 'parseFloat']);

/**
 * Whether the call is guaranteed to produce a number. Every `Math` member
 * returns one, so the namespace is accepted wholesale rather than enumerated.
 */
function isNumericCall(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return NUMERIC_CALLEE_NAMES.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Math'
  );
}

/**
 * The property names `assertSafe` exists to reject. A key that provably cannot
 * spell one of these cannot reach the prototype surface, which is the entire
 * hazard — so proving it is what earns an exemption, the same standard the
 * numeric analysis already meets.
 */
const PROTOTYPE_REACHING_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Whether a template's FIXED text still leaves room to spell `target`.
 *
 * The producible set is `q0 + * + q1 + * + … + * + qN`, each `*` an arbitrary
 * substitution. `target` is producible iff it starts with `q0`, ends with `qN`,
 * and the interior quasis occur in order in between without overlapping. So
 * `` `user-${id}` `` can never be `__proto__` (no such prefix) while
 * `` `__pro${x}` `` can — with `x` = `'to__'`, which resolves to
 * `Object.prototype` at runtime.
 *
 * Interior quasis are matched greedily from the left. That is sufficient
 * because they are fixed strings: taking the earliest occurrence never consumes
 * a character a later quasi needed, so no backtracking can succeed where the
 * greedy pass fails.
 *
 * A template with no substitutions produces exactly one string and is a static
 * key like any other string literal, so it is never treated as reaching.
 */
function templateCanSpell(quasis: readonly string[], target: string): boolean {
  if (quasis.length < 2) {
    return false;
  }
  const first = quasis[0];
  const last = quasis[quasis.length - 1];
  if (!target.startsWith(first) || !target.endsWith(last)) {
    return false;
  }
  const limit = target.length - last.length;
  let cursor = first.length;
  if (cursor > limit) {
    return false;
  }
  for (const middle of quasis.slice(1, -1)) {
    const at = target.indexOf(middle, cursor);
    if (at < 0 || at + middle.length > limit) {
      return false;
    }
    cursor = at + middle.length;
  }
  return true;
}

/**
 * A `: number` type annotation. Every declaration site spells the proof with
 * the same `TSTypeAnnotation` wrapper — a binding name, a class property, a
 * function's return type — so one predicate reads them all, and which site the
 * author chose stops deciding the verdict.
 */
function isNumberTypeAnnotation(
  annotation: TSESTree.TSTypeAnnotation | undefined,
): boolean {
  return annotation?.typeAnnotation.type === AST_NODE_TYPES.TSNumberKeyword;
}

/**
 * A `: number` annotation on a binding name. Parameters and variable
 * declarators are the bindings that carry one, and TypeScript checks every
 * value that reaches such a binding against it.
 */
function isNumberAnnotated(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.Identifier &&
    isNumberTypeAnnotation(node.typeAnnotation)
  );
}

/** The function-valued nodes that can carry a return-type annotation. */
type AnnotatableFunction =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.TSDeclareFunction
  | TSESTree.TSEmptyBodyFunctionExpression;

/** The node read as a function, or null when it is not one. */
function asFunctionNode(node: TSESTree.Node): AnnotatableFunction | null {
  switch (node.type) {
    case AST_NODE_TYPES.FunctionDeclaration:
    case AST_NODE_TYPES.FunctionExpression:
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.TSDeclareFunction:
    case AST_NODE_TYPES.TSEmptyBodyFunctionExpression:
      return node;
    default:
      return null;
  }
}

/**
 * Whether a function declares that it returns a number. The `: number` on a
 * return type is the author's own claim at a declaration site, and TypeScript
 * rejects every `return` that contradicts it — the same trust a `: number`
 * binding annotation already earns, spelled one node over.
 *
 * A laundering assertion inside the body (`return raw as unknown as number`)
 * switches that check off for the one statement carrying it, and is still
 * credited here. `const k: number = raw as unknown as number` is credited for
 * exactly the same reason: the annotation, not the initializer, is what the
 * proof rests on. Refusing the return annotation alone would reinstate the very
 * asymmetry between declaration sites this predicate exists to remove — and a
 * body scan is not a proof anyway, since the laundering can happen one call or
 * one local alias further away and read as clean.
 */
function returnsNumberType(node: TSESTree.Node): boolean {
  const fn = asFunctionNode(node);
  return !!fn && isNumberTypeAnnotation(fn.returnType);
}

/** The binding a constructor parameter property declares, default and all. */
function parameterPropertyBinding(
  node: TSESTree.TSParameterProperty,
): TSESTree.Node {
  return node.parameter.type === AST_NODE_TYPES.AssignmentPattern
    ? node.parameter.left
    : node.parameter;
}

/** Class members that declare a value under a name of their own. */
const NAMED_CLASS_MEMBER_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.MethodDefinition,
  AST_NODE_TYPES.TSAbstractMethodDefinition,
  AST_NODE_TYPES.PropertyDefinition,
  AST_NODE_TYPES.TSAbstractPropertyDefinition,
  AST_NODE_TYPES.AccessorProperty,
  AST_NODE_TYPES.TSAbstractAccessorProperty,
]);

/**
 * The member a name identifies: the name itself, plus whether it is an ECMA
 * private name. The privacy travels beside the name because `#rank` and `rank`
 * are two members a class can declare at once, while `PrivateIdentifier.name`
 * is the bare `rank` with no `#` — matching on the name alone would let a read
 * of the public member be credited with the private one's annotation.
 */
type ClassMemberKey = { name: string; isPrivate: boolean };

/**
 * The member a key node names, or null for a key whose text names no member the
 * syntax can match — a numeric or computed key, or a `PrivateIdentifier` in a
 * position where the syntax forbids one.
 */
function memberKeyOf(node: TSESTree.Node): ClassMemberKey | null {
  switch (node.type) {
    case AST_NODE_TYPES.PrivateIdentifier:
      return { name: node.name, isPrivate: true };
    case AST_NODE_TYPES.Identifier:
      return { name: node.name, isPrivate: false };
    case AST_NODE_TYPES.Literal:
      return typeof node.value === 'string'
        ? { name: node.value, isPrivate: false }
        : null;
    default:
      return null;
  }
}

/**
 * The member a class member declares, or null for an index signature, a static
 * block, or a computed key whose text names no member the syntax can match.
 */
function classMemberKey(member: TSESTree.Node): ClassMemberKey | null {
  if (!NAMED_CLASS_MEMBER_TYPES.has(member.type)) {
    return null;
  }
  const { key, computed } = member as TSESTree.PropertyDefinition;
  return computed ? null : memberKeyOf(key);
}

/**
 * The member a non-computed access names — `this.rank`, `this.#rank`,
 * `Reader.#rankOf`. A computed access names its member by a value rather than
 * by syntax, so it identifies none.
 */
function memberAccessKey(
  node: TSESTree.MemberExpression,
): ClassMemberKey | null {
  return node.computed ? null : memberKeyOf(node.property);
}

/**
 * A setter declares what a write to the member accepts, never what a read of it
 * yields — a `get depth(): number` paired with a `set depth(v: string)` reads
 * as a number. So the setter is left out of the judgement rather than failing
 * it, which would let adding a setter re-report the getter's own proof.
 */
function isSetterDeclaration(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.MethodDefinition ||
      node.type === AST_NODE_TYPES.TSAbstractMethodDefinition) &&
    node.kind === 'set'
  );
}

/**
 * Whether reading the member yields a number by its own declaration: a property
 * annotated `: number`, a getter returning `: number`, or a constructor
 * parameter property annotated `: number`.
 */
function memberReadsNumber(declaration: TSESTree.Node): boolean {
  switch (declaration.type) {
    case AST_NODE_TYPES.PropertyDefinition:
    case AST_NODE_TYPES.TSAbstractPropertyDefinition:
    case AST_NODE_TYPES.AccessorProperty:
    case AST_NODE_TYPES.TSAbstractAccessorProperty:
      return isNumberTypeAnnotation(declaration.typeAnnotation);
    case AST_NODE_TYPES.MethodDefinition:
    case AST_NODE_TYPES.TSAbstractMethodDefinition:
      return declaration.kind === 'get' && returnsNumberType(declaration.value);
    case AST_NODE_TYPES.TSParameterProperty:
      return isNumberAnnotated(parameterPropertyBinding(declaration));
    default:
      return false;
  }
}

/** Whether calling the member returns a number by its own declaration. */
function memberCallReturnsNumber(declaration: TSESTree.Node): boolean {
  switch (declaration.type) {
    case AST_NODE_TYPES.MethodDefinition:
    case AST_NODE_TYPES.TSAbstractMethodDefinition:
      return (
        declaration.kind === 'method' && returnsNumberType(declaration.value)
      );
    case AST_NODE_TYPES.PropertyDefinition:
    case AST_NODE_TYPES.TSAbstractPropertyDefinition:
    case AST_NODE_TYPES.AccessorProperty:
    case AST_NODE_TYPES.TSAbstractAccessorProperty:
      return !!declaration.value && returnsNumberType(declaration.value);
    default:
      return false;
  }
}

/**
 * Whether the function is the body of a class member rather than a function of
 * its own. A method's `FunctionExpression` receives the class instance as
 * `this`; every other non-arrow function receives its own call-time receiver.
 */
function isClassMemberBody(node: TSESTree.Node): boolean {
  const owner = node.parent;
  switch (owner?.type) {
    case AST_NODE_TYPES.MethodDefinition:
    case AST_NODE_TYPES.TSAbstractMethodDefinition:
    case AST_NODE_TYPES.PropertyDefinition:
    case AST_NODE_TYPES.TSAbstractPropertyDefinition:
    case AST_NODE_TYPES.AccessorProperty:
    case AST_NODE_TYPES.TSAbstractAccessorProperty:
      return owner.value === node;
    default:
      return false;
  }
}

/**
 * The half of a class — static or instance — that `this` reaches at a node,
 * together with the body whose members it names. A non-arrow function rebinds
 * `this` to its own call-time receiver, so the walk stops there unless that
 * function IS a member's body; an arrow keeps the enclosing `this`, which is
 * what makes `read = () => this.rank` resolve against the class it is written
 * in. The walk stops at the innermost class body, so a nested class shadows the
 * outer one exactly as `this` does at run time.
 */
function enclosingClassContext(
  node: TSESTree.Node,
): { body: TSESTree.ClassBody; isStatic: boolean } | null {
  let child: TSESTree.Node = node;
  let parent = node.parent;
  while (parent) {
    if (parent.type === AST_NODE_TYPES.ClassBody) {
      // A static block's `this` is the class object, the same half of the class
      // a `static` member lives on.
      return {
        body: parent,
        isStatic:
          child.type === AST_NODE_TYPES.StaticBlock ||
          (child as TSESTree.PropertyDefinition).static === true,
      };
    }
    if (
      (parent.type === AST_NODE_TYPES.FunctionExpression ||
        parent.type === AST_NODE_TYPES.FunctionDeclaration) &&
      !isClassMemberBody(parent)
    ) {
      return null;
    }
    child = parent;
    parent = parent.parent;
  }
  return null;
}

/** The types an assertion can launder any value through without complaint. */
const LAUNDERING_ASSERTION_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.TSAnyKeyword,
  AST_NODE_TYPES.TSUnknownKeyword,
]);

/**
 * An assertion naming `number` over the value it wraps — `f() as number`,
 * `f() satisfies number`, `<number>f()`. An assertion to anything other than
 * the `number` keyword — `as any`, `as unknown`, `as string`, `as const`, a
 * union, a generic — is not this claim at all.
 *
 * The claim is only worth trusting because TypeScript checks it: `f() as number`
 * is rejected unless the operand's type overlaps `number`. A step through `any`
 * or `unknown` removes exactly that check, which is what makes
 * `userInput as unknown as number` the idiom for asserting anything at all — so
 * a chain carrying one proves nothing, and a string laundered through it would
 * re-open the `__proto__` key this rule exists to stop.
 */
function assertsNumberType(node: TSESTree.Node): boolean {
  if (
    (node.type !== AST_NODE_TYPES.TSAsExpression &&
      node.type !== AST_NODE_TYPES.TSSatisfiesExpression &&
      node.type !== AST_NODE_TYPES.TSTypeAssertion) ||
    node.typeAnnotation.type !== AST_NODE_TYPES.TSNumberKeyword
  ) {
    return false;
  }
  for (
    let inner: TSESTree.Node = node.expression;
    inner.type === AST_NODE_TYPES.TSAsExpression ||
    inner.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    inner.type === AST_NODE_TYPES.TSTypeAssertion;
    inner = inner.expression
  ) {
    if (LAUNDERING_ASSERTION_TYPES.has(inner.typeAnnotation.type)) {
      return false;
    }
  }
  return true;
}

/**
 * Whether the write is the initializer of a declaration that declares itself
 * numeric — either by annotating the binding name (`const k: number =
 * rankOf(id)`, `(index: number = rankOf(id)) =>`) or by asserting the
 * initializing value (`const k = rankOf(id) as number`). TypeScript rejects a
 * non-numeric value under either spelling, so on a TypeScript source both are
 * syntactic proof that the value is a number — the same trust a
 * `(index: number) =>` parameter already earns. Without them an author whose
 * index comes from a call has no compliant spelling at all, because the shape
 * of a call proves nothing on its own.
 *
 * The proof covers the initializer alone. A later assignment is a separate
 * statement and is where a value out of a `catch` binding or an `any`-typed
 * source enters the binding, so every other write still has to prove itself by
 * its own shape — including a `for (k of xs)` binding, whose write expression
 * is the iterated value rather than an initializer.
 */
function initializesNumericDeclaration(writeExpr: TSESTree.Node): boolean {
  const site = writeExpr.parent;
  switch (site?.type) {
    case AST_NODE_TYPES.VariableDeclarator:
      // A destructuring pattern takes the initializer apart before binding, so
      // an assertion over the whole initializer describes the container rather
      // than the element bound out of it: `const { a } = f() as number` says
      // nothing about `a`.
      return (
        site.id.type === AST_NODE_TYPES.Identifier &&
        (isNumberAnnotated(site.id) || assertsNumberType(writeExpr))
      );
    // A parameter default is checked against the parameter's own annotation the
    // same way a declarator's initializer is checked against its own. That
    // annotation is also what admits the parameter as a numeric binding at all,
    // so an assertion on the default decides nothing here.
    case AST_NODE_TYPES.AssignmentPattern:
      return isNumberAnnotated(site.left);
    default:
      return false;
  }
}

/**
 * Whether the definition can hold a number: a declarator (whose value is proven
 * by its declaration site and its writes) or a parameter annotated `: number`.
 * Anything else — an import, a function or class name, a catch binding — is
 * not.
 */
function definesNumericBinding(def: TSESLint.Scope.Definition): boolean {
  return (
    def.node.type === AST_NODE_TYPES.VariableDeclarator ||
    isNumberAnnotated(def.name)
  );
}

/**
 * Utility wrappers whose single type argument keeps a Record annotation's key
 * domain intact: `Readonly<Record<K, V>>` and `Partial<Record<K, V>>` admit
 * exactly the keys `Record<K, V>` admits.
 */
const RECORD_KEY_PRESERVING_WRAPPERS = new Set(['Readonly', 'Partial']);

/**
 * The property names assertSafe exists to keep out of a lookup. A literal key
 * union that names one of them proves nothing about safety, so the
 * compiler-bounded carve-out refuses it and the key keeps being reported.
 */
const PROTOTYPE_SURFACE_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * The key domain a type annotation declares, judged from syntax alone:
 *
 * - a `Set` of literal values for a union the syntax spells out
 *   (`'live' | 'simulated'`, a string enum with literal initializers);
 * - `'closed'` for a finite domain whose members the syntax derives from a
 *   value rather than listing (`(typeof KINDS)[number]`, an enum with computed
 *   members);
 * - `'open'` for a domain that admits arbitrary keys (`string`, `number`,
 *   `any`, a template literal type);
 * - `'unknown'` for anything the syntax cannot classify, an imported alias
 *   included.
 */
type KeyDomain = 'open' | 'closed' | 'unknown' | Set<string>;

/**
 * Union semantics over domains: one open member opens the whole domain, an
 * unclassifiable member leaves it unclassifiable (it could be hiding an open
 * one), and a closed-but-unenumerable member keeps the union closed without a
 * literal listing.
 */
function foldKeyDomains(domains: readonly KeyDomain[]): KeyDomain {
  const values = new Set<string>();
  let closed = false;
  let unknown = false;
  for (const domain of domains) {
    if (domain === 'open') {
      return 'open';
    }
    if (domain === 'unknown') {
      unknown = true;
    } else if (domain === 'closed') {
      closed = true;
    } else {
      for (const value of domain) {
        values.add(value);
      }
    }
  }
  if (unknown) {
    return 'unknown';
  }
  if (closed) {
    return 'closed';
  }
  return values;
}

/**
 * The span of the access a written key belongs to: `obj[key]` including the
 * object and both brackets, `[key]` for a computed property (whose value is an
 * expression of its own), and the whole comparison for `key in obj`. Null where
 * the key sits in none of those, which leaves the wrap to span the key alone.
 *
 * This is the unit a fix that rewrites a key has to claim. The key's own range
 * stops short of the `]` that closes the access, and a fixer that reformats the
 * access spreads its edits across the whole of it — so a span ending between
 * the key and its bracket splits that set in half. Claiming the access instead
 * leaves a competing rewrite of it either wholly discarded (and re-made against
 * the fixed text on a later pass) or wholly applied, both of which parse.
 */
function accessSpan(
  sourceCode: Readonly<TSESLint.SourceCode>,
  written: TSESTree.Node,
): [number, number] | null {
  const { parent } = written;
  if (!parent) {
    return null;
  }
  if (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.computed &&
    parent.property === written
  ) {
    return [parent.range[0], parent.range[1]];
  }
  if (
    parent.type === AST_NODE_TYPES.Property &&
    parent.computed &&
    parent.key === written
  ) {
    // A computed property's range runs past its key to the end of its value,
    // which the wrap has no business claiming; the bracket that closes the key
    // is where this access ends.
    const closing = sourceCode.getTokenAfter(written);
    return closing?.value === ']'
      ? [parent.range[0], closing.range[1]]
      : [written.range[0], written.range[1]];
  }
  if (
    parent.type === AST_NODE_TYPES.BinaryExpression &&
    parent.operator === 'in' &&
    parent.left === written
  ) {
    return [parent.range[0], parent.range[1]];
  }
  return null;
}

/**
 * An enum is a compiler-checked finite set. Members with literal initializers
 * enumerate their runtime key strings (which is what lets the forbidden-name
 * screen and subset comparison see them); a computed or auto-numbered member
 * leaves the set finite but unenumerable.
 */
function enumKeyDomain(node: TSESTree.TSEnumDeclaration): KeyDomain {
  const values = new Set<string>();
  for (const member of node.members) {
    const { initializer } = member;
    if (
      initializer?.type === AST_NODE_TYPES.Literal &&
      (typeof initializer.value === 'string' ||
        typeof initializer.value === 'number')
    ) {
      values.add(String(initializer.value));
    } else {
      return 'closed';
    }
  }
  return values;
}

export const enforceAssertSafeObjectKey = createRule<Options, MessageIds>({
  name: 'enforce-assert-safe-object-key',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce the use of assertSafe(id) when accessing object properties with computed keys that involve string interpolation or explicit string conversion.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          assertSafeImportPath: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useAssertSafe:
        'Dynamic object key "{{key}}" is used without assertSafe() validation. Unvalidated keys can resolve to unexpected properties (including prototype fields) and make lookups fragile or unsafe. Wrap the key with assertSafe({{key}}) before accessing the object.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const importPath = options?.assertSafeImportPath || DEFAULT_IMPORT_PATH;
    // Repo-root-anchored location of the helper, the yardstick every module
    // specifier written in the file is compared against.
    const assertSafeTarget = normalizeModulePath(importPath);
    // Whether an earlier fix in this pass already carries the import. The AST is
    // not re-parsed between the fixes of a single pass, so the import can only
    // be claimed once: a second fix repeating it would span the same insertion
    // point, overlap, and be dropped along with its wrap.
    let importClaimed = false;

    /**
     * The `import { assertSafe }` statement rides on a single violation's fix,
     * making that violation the file's import carrier. A suppressed carrier
     * would take the import down with it while the surviving violations still
     * emit `assertSafe(...)`, leaving the call unbound.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * The directory ESLint itself was configured with, which is what
     * `importPath` is anchored at. The node process cwd is only a fallback for
     * harnesses that predate `getCwd`: the two differ under the VS Code ESLint
     * extension, in monorepos, and for any programmatic `new ESLint({ cwd })`,
     * and anchoring at the process cwd there emits an unresolvable specifier.
     */
    const cwd =
      typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();

    /**
     * Directory of the file being fixed, relative to the configured cwd, or
     * null for virtual/stdin files (RuleTester default 'file.ts', '<input>',
     * '<text>') whose non-absolute name cannot anchor a relative path.
     */
    const fileDirFromRoot = (): string | null => {
      const rawFilename = context.getFilename().replace(/\\/g, '/');
      if (!path.isAbsolute(rawFilename)) {
        return null;
      }
      const fileRelToCwd = path.relative(cwd, rawFilename).replace(/\\/g, '/');
      return path.posix.dirname(fileRelToCwd);
    };

    /**
     * Whether the file being fixed runs as native ESM, where node's resolver
     * takes a specifier literally and an extensionless one throws
     * ERR_MODULE_NOT_FOUND at startup. TypeScript and bundler consumers resolve
     * extensionless specifiers themselves, so they keep the bare form.
     *
     * The walk for an ambiguous `.js` file runs only while a fix is being built,
     * costs a handful of stat-sized reads, and needs an absolute name to have a
     * directory to start from.
     */
    const isNativeEsmFile = (): boolean => {
      const filename = context.getFilename().replace(/\\/g, '/');
      if (NATIVE_ESM_EXTENSION.test(filename)) {
        return true;
      }
      if (
        NON_NATIVE_ESM_EXTENSION.test(filename) ||
        !AMBIGUOUS_JS_EXTENSION.test(filename) ||
        !path.isAbsolute(filename)
      ) {
        return false;
      }
      return nearestManifestDeclaresModule(path.dirname(filename));
    };

    /**
     * Computes the module specifier for the injected assertSafe import.
     *
     * `importPath` is anchored at the repo root — the directory ESLint runs
     * with, not the node process cwd — matching how avoid-utils-directory and
     * test-file-location-enforcement treat paths. A bare repo-root specifier
     * such as 'functions/src/util/assertSafe' is unresolvable inside the
     * functions/ TS project, whose baseUrl is functions/: it would resolve to
     * functions/functions/src/util/assertSafe, which does not exist. The
     * specifier is therefore derived relative to the file being fixed so the
     * emitted import resolves from that file's location.
     */
    const computeImportSpecifier = (): string => {
      // The helper is authored as TypeScript and runs as its compiled output, so
      // a native-ESM importer names the emitted `.js` file. TS resolves a `.js`
      // specifier back to the `.ts` source under nodenext, which keeps the one
      // spelling correct for both.
      const extension = isNativeEsmFile() ? '.js' : '';
      const fileDir = fileDirFromRoot();
      // Emitting the configured path verbatim preserves the option's literal
      // value for non-file lints.
      if (fileDir === null) {
        return `${importPath}${extension}`;
      }
      let specifier = path.posix.relative(fileDir, assertSafeTarget);
      if (!specifier.startsWith('.')) {
        specifier = `./${specifier}`;
      }
      return `${specifier}${extension}`;
    };

    /**
     * Whether a module specifier written in the file denotes the same helper the
     * fix imports. A relative specifier is resolved against the file's own
     * directory before the comparison, because the configured path is anchored
     * at the repo root: `../../assertSafe` inside functions/src/util/a/b and
     * `functions/src/util/assertSafe` name one module, and treating them as
     * different would withhold the fix from files that import the helper
     * perfectly well.
     */
    const isAssertSafeModule = (source: string): boolean => {
      const normalized = normalizeModulePath(source);
      if (normalized === assertSafeTarget) {
        return true;
      }
      if (!normalized.startsWith('.')) {
        return false;
      }
      const fileDir = fileDirFromRoot();
      if (fileDir === null) {
        return false;
      }
      return (
        path.posix.normalize(path.posix.join(fileDir, normalized)) ===
        assertSafeTarget
      );
    };

    /**
     * Read the import off the AST instead of a traversal flag: a violation that
     * precedes the import declaration in source order would otherwise be judged
     * against a flag the `ImportDeclaration` visitor has not set yet, emitting a
     * duplicate import.
     */
    const importsAssertSafe = (program: TSESTree.Program): boolean =>
      program.body.some(
        (statement) =>
          statement.type === AST_NODE_TYPES.ImportDeclaration &&
          statement.importKind !== 'type' &&
          isAssertSafeModule(statement.source.value) &&
          statement.specifiers.some(isAssertSafeSpecifier),
      );

    /**
     * Whether every declaration of a visible `assertSafe` binding is the helper
     * import itself. A local const/function/class, a parameter, a namespace or
     * default import, or a named import from another module all mean the emitted
     * `assertSafe(...)` call would resolve somewhere other than the helper.
     */
    const bindsAssertSafe = (variable: TSESLint.Scope.Variable): boolean =>
      variable.defs.length > 0 &&
      variable.defs.every((def) => {
        const specifier = def.node as TSESTree.Node;
        if (!isAssertSafeSpecifier(specifier)) {
          return false;
        }
        const declaration = specifier.parent;
        return (
          declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
          declaration.importKind !== 'type' &&
          isAssertSafeModule(declaration.source.value)
        );
      });

    /**
     * Emits the `import { assertSafe }` statement the wrapped call needs. The
     * position comes from the shared anchor so the file's prologue keeps its
     * meaning: a `'use client'` directive stops being a directive the moment a
     * statement precedes it, and a `#!` shebang stops parsing once it leaves
     * character 0.
     */
    const addAssertSafeImport = (
      fixer: TSESLint.RuleFixer,
    ): TSESLint.RuleFix => {
      const importStatement = `import { assertSafe } from '${computeImportSpecifier()}';\n`;
      return insertAtImportAnchor(
        context.sourceCode,
        fixer,
        importInsertionAnchor(context.sourceCode),
        importStatement,
      );
    };

    /**
     * The wrap of the key, emitted over the whole access the key belongs to
     * rather than over the key alone.
     *
     * ESLint merges the fixes of one report into a single edit spanning
     * [first start, last end], splicing the original text back in between. The
     * import anchor sits at the top of the file, so bundling it with the wrap
     * turns a three-character edit into one that claims everything from the
     * file's first statement to the end of the key — which is a point in the
     * middle of the access, before the `]` that closes it. That span sorts
     * ahead of every competing fix and wins the race against all of them, but
     * only up to its end. A fixer whose edits are coherent only as a set (a
     * formatter re-wrapping one access across several lines is the common
     * case) then has the edits inside the span discarded and the edits past
     * its end applied, and the two halves do not fit together: the emitted
     * file does not parse.
     *
     * Ending the span where the access ends puts every edit of such a
     * competing rewrite on one side of the boundary — either wholly inside the
     * span (discarded whole, and re-made against the fixed text on the next
     * pass) or wholly outside it. Both parse. The re-emitted head and tail are
     * copied verbatim from the source, so the text this fix produces is
     * character-for-character what replacing the key alone produced.
     */
    const wrapKey = (
      fixer: TSESLint.RuleFixer,
      node: TSESTree.Node,
      argText: string,
    ): TSESLint.RuleFix => {
      const replacement = `assertSafe(${argText})`;
      const span = accessSpan(context.sourceCode, node);
      if (!span) {
        return fixer.replaceText(node, replacement);
      }
      const [start, end] = span;
      const { text } = context.sourceCode;
      return fixer.replaceTextRange(
        [start, end],
        `${text.slice(start, node.range[0])}${replacement}${text.slice(
          node.range[1],
          end,
        )}`,
      );
    };

    /**
     * Helper function to create fixes for a node
     */
    const createFixes = (
      fixer: TSESLint.RuleFixer,
      node: TSESTree.Node,
      argText: string,
    ): TSESLint.RuleFix[] => {
      const fixes: TSESLint.RuleFix[] = [];

      const carriesImport =
        !importClaimed && !importsAssertSafe(context.sourceCode.ast);
      if (carriesImport) {
        fixes.push(addAssertSafeImport(fixer));
        importClaimed = true;
      }

      fixes.push(wrapKey(fixer, node, argText));

      return fixes;
    };

    // The report is emitted even when suppressed: ESLint discards it, and
    // reporting keeps the user's disable directive "used" so that
    // `--report-unused-disable-directives` does not flag it.
    const reportUseAssertSafe = (node: TSESTree.Node, expressionText: string) =>
      context.report({
        node,
        messageId: 'useAssertSafe',
        data: { key: expressionText },
        fix(fixer) {
          // A suppressed report is dropped together with its fix. Producing no
          // fix — and leaving the import unclaimed — passes the carrier slot to
          // the first violation that survives.
          if (isReportSuppressed(node)) {
            return null;
          }

          // A jest registrar's factory is hoisted above every import in the
          // file, so the injected `import { assertSafe }` binds too late for
          // the emitted call: the hoist allows a factory to read only globals
          // and `mock`-prefixed bindings, and rejects the module at transform
          // time otherwise, taking the whole suite down with it. Declining —
          // and leaving the import unclaimed for a violation that does fix —
          // keeps the report standing so the author reaches for a remedy the
          // factory can hold, such as `jest.requireActual` inside it or a
          // `mock`-prefixed import alias.
          if (isInsideMockFactory(node)) {
            return null;
          }

          // Resolve `assertSafe` through the scope chain at the fixed node. A
          // binding that is not the helper import breaks the edit two ways: the
          // injected import collides with a module-scope declaration (TS2440,
          // or TS2300 when the binding is itself an import), and a shadowing
          // parameter or block-scoped binding captures the emitted call with no
          // compile error at all. Declining leaves the report standing so the
          // author resolves the clash deliberately.
          const existing = ASTHelpers.findVariableInScope(
            ASTHelpers.getScope(context, node),
            ASSERT_SAFE_NAME,
          );
          if (existing && !bindsAssertSafe(existing)) {
            return null;
          }

          return createFixes(fixer, node, expressionText);
        },
      });

    /**
     * Reports a key whose written form may carry assertion or await wrappers or
     * an optional chain.
     *
     * The report and the fix sit on the outermost written node, so the wrapper
     * the author put there survives the rewrite: `m[assertSafe(k as string)]`
     * rather than `m[assertSafe(k)]`, which would delete text the fixer does not
     * own. `assertSafe` is identity-typed (`<T extends PropertyKey>(key: T): T`),
     * so wrapping the asserted expression preserves the key's type, and wrapping
     * an `await` keeps the validation on the resolved key rather than moving it
     * onto the promise. Wrapping the whole chain is what keeps the short-circuit
     * intact: `m[assertSafe(source?.key)]` evaluates `source?.key` once, in the
     * position the author wrote it, and hands assertSafe what it produces — the
     * rewrite adds a validation, it does not move a dereference.
     *
     * A key written without a wrapper keeps the narrower argument the fix has
     * always emitted: `String(id)` and `` `${id}` `` collapse to `id`, whose
     * conversion assertSafe subsumes.
     */
    const reportWrittenKey = (
      written: TSESTree.Node,
      unwrapped: TSESTree.Node,
      innerText: string,
    ) =>
      reportUseAssertSafe(
        written,
        written === unwrapped ? innerText : context.sourceCode.getText(written),
      );

    /**
     * Returns true when the identifier was initialized directly from an
     * assertSafe(...) call, e.g. `const safeKey = assertSafe(rawKey)`.
     * Only direct, single-step initializers count — transitive aliases
     * (const b = a) are not followed so they continue to be flagged.
     * findVariableInScope returns the nearest binding, so an inner variable
     * that shadows an outer assertSafe-initialized one is correctly not exempt.
     */
    const isAssertSafeValidatedIdentifier = (
      node: TSESTree.Identifier,
    ): boolean => {
      const scope = ASTHelpers.getScope(context, node);
      const variable = ASTHelpers.findVariableInScope(scope, node.name);
      if (!variable) return false;
      return variable.defs.some((def) => {
        // `assertSafe?.(rawKey)` produces the very same validated key as
        // `assertSafe(rawKey)` — the chain guards only a nullish callee — so
        // the exemption reads through it rather than re-reporting the binding.
        const init =
          def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init
            ? unwrapOptionalChain(def.node.init)
            : null;
        return (
          !!init &&
          init.type === AST_NODE_TYPES.CallExpression &&
          init.callee.type === AST_NODE_TYPES.Identifier &&
          init.callee.name === 'assertSafe'
        );
      });
    };

    /**
     * The declared key domain of a type annotation. Alias references resolve
     * through the scope chain to the declaration in this file — a type alias
     * recurses into what it aliases, an enum enumerates its members, a generic
     * type parameter is judged by its constraint (an unconstrained one could be
     * instantiated with anything, so it reads as open). `seen` terminates a
     * recursive alias without conflating it with a sibling reference to the
     * same name.
     */
    const keyDomainOf = (
      typeNode: TSESTree.TypeNode,
      anchor: TSESTree.Node,
      seen: Set<TSESLint.Scope.Variable>,
    ): KeyDomain => {
      switch (typeNode.type) {
        case AST_NODE_TYPES.TSLiteralType: {
          const { literal } = typeNode;
          if (
            literal.type === AST_NODE_TYPES.Literal &&
            (typeof literal.value === 'string' ||
              typeof literal.value === 'number')
          ) {
            return new Set([String(literal.value)]);
          }
          return 'unknown';
        }
        case AST_NODE_TYPES.TSUnionType:
          return foldKeyDomains(
            typeNode.types.map((member) => keyDomainOf(member, anchor, seen)),
          );
        case AST_NODE_TYPES.TSTypeReference: {
          if (
            typeNode.typeParameters ||
            typeNode.typeName.type !== AST_NODE_TYPES.Identifier
          ) {
            return 'unknown';
          }
          const variable = ASTHelpers.findVariableInScope(
            ASTHelpers.getScope(context, anchor),
            typeNode.typeName.name,
          );
          if (!variable || variable.defs.length === 0 || seen.has(variable)) {
            return 'unknown';
          }
          const nextSeen = new Set(seen).add(variable);
          return foldKeyDomains(
            variable.defs.map((def) => {
              switch (def.node.type) {
                case AST_NODE_TYPES.TSTypeAliasDeclaration:
                  return keyDomainOf(def.node.typeAnnotation, anchor, nextSeen);
                case AST_NODE_TYPES.TSEnumDeclaration:
                  return enumKeyDomain(def.node);
                case AST_NODE_TYPES.TSTypeParameter:
                  return def.node.constraint
                    ? keyDomainOf(def.node.constraint, anchor, nextSeen)
                    : 'open';
                default:
                  return 'unknown';
              }
            }),
          );
        }
        // `(typeof KINDS)[number]` — the union derived from a values array,
        // which prefer-union-from-const-array rewrites literal-union aliases
        // into. The members live in a value rather than the type syntax, so
        // they are read off the array's own literal elements — but only under
        // `as const`: without it the array's type widens to `string[]` and the
        // indexed access IS `string`, the open domain this rule exists to keep
        // reported.
        case AST_NODE_TYPES.TSIndexedAccessType: {
          if (typeNode.objectType.type !== AST_NODE_TYPES.TSTypeQuery) {
            return 'unknown';
          }
          const { exprName } = typeNode.objectType;
          if (exprName.type !== AST_NODE_TYPES.Identifier) {
            return 'unknown';
          }
          const variable = ASTHelpers.findVariableInScope(
            ASTHelpers.getScope(context, anchor),
            exprName.name,
          );
          if (!variable || variable.defs.length !== 1) {
            return 'unknown';
          }
          const def = variable.defs[0];
          if (def.node.type !== AST_NODE_TYPES.VariableDeclarator) {
            return 'unknown';
          }
          const init = def.node.init;
          const isAsConstArray =
            init?.type === AST_NODE_TYPES.TSAsExpression &&
            init.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
            init.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
            init.typeAnnotation.typeName.name === 'const' &&
            init.expression.type === AST_NODE_TYPES.ArrayExpression;
          if (!isAsConstArray) {
            return 'unknown';
          }
          if (typeNode.indexType.type !== AST_NODE_TYPES.TSNumberKeyword) {
            return 'closed';
          }
          const values = new Set<string>();
          for (const element of (init.expression as TSESTree.ArrayExpression)
            .elements) {
            if (
              element?.type === AST_NODE_TYPES.Literal &&
              (typeof element.value === 'string' ||
                typeof element.value === 'number')
            ) {
              values.add(String(element.value));
            } else {
              return 'closed';
            }
          }
          return values;
        }
        case AST_NODE_TYPES.TSStringKeyword:
        case AST_NODE_TYPES.TSNumberKeyword:
        case AST_NODE_TYPES.TSSymbolKeyword:
        case AST_NODE_TYPES.TSAnyKeyword:
        case AST_NODE_TYPES.TSUnknownKeyword:
        case AST_NODE_TYPES.TSTemplateLiteralType:
          return 'open';
        default:
          return 'unknown';
      }
    };

    /**
     * The key type parameter of a Record-shaped annotation, read through the
     * wrappers that keep its key domain (`Readonly`, `Partial`) and through a
     * bare in-file alias (`type Lookup = Record<K, V>`). Anything else — a type
     * literal with an index signature, a Map, an imported alias — yields null:
     * the annotation then makes no syntactically checkable claim about which
     * keys exist.
     */
    const recordKeyTypeOf = (
      typeNode: TSESTree.TypeNode,
      anchor: TSESTree.Node,
      seen: Set<TSESLint.Scope.Variable> = new Set(),
    ): TSESTree.TypeNode | null => {
      // `Record<K, V> | undefined` — the natural annotation for a receiver
      // reached through `?.` — keys exactly what `Record<K, V>` keys: a nullish
      // receiver short-circuits (or throws), it never indexes anything else.
      if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
        const substantive = typeNode.types.filter(
          (member) =>
            member.type !== AST_NODE_TYPES.TSUndefinedKeyword &&
            member.type !== AST_NODE_TYPES.TSNullKeyword,
        );
        return substantive.length === 1
          ? recordKeyTypeOf(substantive[0], anchor, seen)
          : null;
      }
      if (
        typeNode.type !== AST_NODE_TYPES.TSTypeReference ||
        typeNode.typeName.type !== AST_NODE_TYPES.Identifier
      ) {
        return null;
      }
      const { name } = typeNode.typeName;
      const args = typeNode.typeParameters?.params;
      if (name === 'Record') {
        return args?.length === 2 ? args[0] : null;
      }
      if (RECORD_KEY_PRESERVING_WRAPPERS.has(name) && args?.length === 1) {
        return recordKeyTypeOf(args[0], anchor, seen);
      }
      if (args) {
        return null;
      }
      const variable = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, anchor),
        name,
      );
      if (!variable || seen.has(variable) || variable.defs.length !== 1) {
        return null;
      }
      const def = variable.defs[0];
      if (def.node.type !== AST_NODE_TYPES.TSTypeAliasDeclaration) {
        return null;
      }
      return recordKeyTypeOf(
        def.node.typeAnnotation,
        anchor,
        new Set(seen).add(variable),
      );
    };

    /**
     * Whether the Record's declared key domain covers the key's declared type,
     * so that TypeScript itself rejects any key value outside the record's
     * declared keys.
     *
     * Two spellings prove it:
     *
     * - **The same type reference on both sides** (`kind: Kind` into
     *   `Record<Kind, V>`). Name identity makes the domains equal whatever the
     *   alias holds — an imported alias included — so resolution is consulted
     *   only to refuse a domain that resolves to something open (`type K =
     *   string` re-opens the very surface this rule guards) or to a literal
     *   union naming a prototype field.
     * - **Literal unions the syntax can compare** (`kind: 'live' | 'simulated'`
     *   into `Record<'live' | 'simulated', V>`, or a narrowing of it): every
     *   literal the key admits must be a declared record key, and none of them
     *   may name the prototype surface.
     */
    const recordKeyCovers = (
      keyAnnotation: TSESTree.TypeNode,
      recordKeyType: TSESTree.TypeNode,
      anchor: TSESTree.Node,
    ): boolean => {
      const namesNoPrototypeField = (domain: Set<string>): boolean =>
        ![...domain].some((value) => PROTOTYPE_SURFACE_NAMES.has(value));
      if (
        keyAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
        recordKeyType.type === AST_NODE_TYPES.TSTypeReference &&
        !keyAnnotation.typeParameters &&
        !recordKeyType.typeParameters &&
        context.sourceCode.getText(keyAnnotation.typeName) ===
          context.sourceCode.getText(recordKeyType.typeName)
      ) {
        const domain = keyDomainOf(keyAnnotation, anchor, new Set());
        if (domain === 'open') {
          return false;
        }
        return typeof domain === 'string' || namesNoPrototypeField(domain);
      }
      const keyDomain = keyDomainOf(keyAnnotation, anchor, new Set());
      if (
        typeof keyDomain === 'string' ||
        keyDomain.size === 0 ||
        !namesNoPrototypeField(keyDomain)
      ) {
        return false;
      }
      const recordDomain = keyDomainOf(recordKeyType, anchor, new Set());
      if (typeof recordDomain === 'string') {
        return false;
      }
      return [...keyDomain].every((value) => recordDomain.has(value));
    };

    /**
     * The type annotations declared on the binding an identifier resolves to.
     * Every definition must carry one on the binding name itself — an
     * annotation on a binding is what TypeScript checks every write against, so
     * it holds for the lookup no matter which statement assigned last. A
     * destructured binding, an unannotated declarator, an import: null, because
     * nothing constrains what the identifier holds.
     */
    const declaredAnnotationsOf = (
      identifier: TSESTree.Identifier,
    ): TSESTree.TypeNode[] | null => {
      const variable = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, identifier),
        identifier.name,
      );
      if (!variable || variable.defs.length === 0) {
        return null;
      }
      const annotations: TSESTree.TypeNode[] = [];
      for (const def of variable.defs) {
        const bindingName = def.name as TSESTree.Node;
        if (
          bindingName.type !== AST_NODE_TYPES.Identifier ||
          !bindingName.typeAnnotation
        ) {
          return null;
        }
        annotations.push(bindingName.typeAnnotation.typeAnnotation);
      }
      return annotations;
    };

    /**
     * Whether `object[key]` is a lookup the compiler already bounds: the object
     * is a binding annotated `Record<K, V>` and the key a binding whose
     * declared type `K` covers (#1875). Such a lookup cannot reach the
     * prototype surface without the code failing to compile, so `assertSafe`
     * would validate nothing — and it is not identity on the values that DO
     * slip past a declared type at runtime (data crossing a persistence or
     * version boundary): the plain lookup degrades to `undefined` where the
     * wrapped one throws, which is precisely the semantic change that turned a
     * graceful render fallback into a render-time crash. Both sides must be
     * annotated: an `any`-typed or unannotated key indexes into any Record
     * without a compile error, so the record annotation alone proves nothing.
     */
    const isCompilerBoundedLookup = (
      node: TSESTree.MemberExpression,
      key: TSESTree.Identifier,
    ): boolean => {
      if (node.object.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }
      const objectAnnotations = declaredAnnotationsOf(node.object);
      if (!objectAnnotations) {
        return false;
      }
      const recordKeyTypes: TSESTree.TypeNode[] = [];
      for (const annotation of objectAnnotations) {
        const recordKeyType = recordKeyTypeOf(annotation, node);
        if (!recordKeyType) {
          return false;
        }
        recordKeyTypes.push(recordKeyType);
      }
      const keyAnnotations = declaredAnnotationsOf(key);
      if (!keyAnnotations) {
        return false;
      }
      return keyAnnotations.every((keyAnnotation) =>
        recordKeyTypes.every((recordKeyType) =>
          recordKeyCovers(keyAnnotation, recordKeyType, node),
        ),
      );
    };

    /**
     * The class body an identifier names. A class reached by its own name
     * exposes only the static half of itself, which is why the caller is told
     * so rather than left to guess.
     */
    const classBodyOfName = (
      identifier: TSESTree.Identifier,
    ): TSESTree.ClassBody | null => {
      const variable = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, identifier),
        identifier.name,
      );
      if (!variable || variable.defs.length !== 1) {
        return null;
      }
      const { node: definition } = variable.defs[0];
      if (definition.type === AST_NODE_TYPES.ClassDeclaration) {
        return definition.body;
      }
      return definition.type === AST_NODE_TYPES.VariableDeclarator &&
        definition.init?.type === AST_NODE_TYPES.ClassExpression
        ? definition.init.body
        : null;
    };

    /**
     * The class body a receiver's members are declared in, and which half of it
     * the receiver reaches. `this` resolves to the class it is written in;
     * a bare name resolves to the class that name binds to, whose members it
     * reaches statically. Anything else — a parameter, an import, a `super`
     * whose class may live in another file — resolves to no body, so the
     * annotation on a same-named member of some other class is never read.
     */
    const receiverClassContext = (
      receiver: TSESTree.Node,
    ): { body: TSESTree.ClassBody; isStatic: boolean } | null => {
      const target = unwrapWrittenKey(receiver);
      if (target.type === AST_NODE_TYPES.ThisExpression) {
        return enclosingClassContext(target);
      }
      if (target.type !== AST_NODE_TYPES.Identifier) {
        return null;
      }
      const body = classBodyOfName(target);
      return body ? { body, isStatic: true } : null;
    };

    /**
     * The declarations of a member name on one half of a class. A `static`
     * member and an instance member of the same name are separate declarations
     * that TypeScript keeps apart, so crediting the wrong half would credit an
     * annotation the reference does not resolve to. An ECMA private name is
     * kept apart from the public name it spells the same way for the same
     * reason. Constructor parameter properties declare a member too, and are
     * read alongside the body's own elements — never for a private name, which
     * the parameter-property syntax cannot declare.
     */
    const classMemberDeclarations = (
      body: TSESTree.ClassBody,
      key: ClassMemberKey,
      isStatic: boolean,
    ): TSESTree.Node[] => {
      const declarations: TSESTree.Node[] = [];
      for (const member of body.body) {
        if (
          !isStatic &&
          !key.isPrivate &&
          member.type === AST_NODE_TYPES.MethodDefinition &&
          member.kind === 'constructor'
        ) {
          for (const parameter of member.value.params) {
            if (
              parameter.type === AST_NODE_TYPES.TSParameterProperty &&
              (parameterPropertyBinding(parameter) as TSESTree.Identifier)
                .name === key.name
            ) {
              declarations.push(parameter);
            }
          }
        }
        const declared = classMemberKey(member);
        if (
          declared?.name === key.name &&
          declared.isPrivate === key.isPrivate &&
          (member as TSESTree.PropertyDefinition).static === isStatic
        ) {
          declarations.push(member);
        }
      }
      return declarations.filter(
        (declaration) => !isSetterDeclaration(declaration),
      );
    };

    /**
     * Whether a member read resolves to a member its own class declares
     * `: number`. Every declaration of the name has to carry the proof: an
     * overload or a second declaration that does not is a value the read can
     * also yield.
     */
    const isNumberMemberRead = (node: TSESTree.MemberExpression): boolean => {
      const key = memberAccessKey(node);
      if (!key) {
        return false;
      }
      const receiver = receiverClassContext(node.object);
      if (!receiver) {
        return false;
      }
      const declarations = classMemberDeclarations(
        receiver.body,
        key,
        receiver.isStatic,
      );
      return declarations.length > 0 && declarations.every(memberReadsNumber);
    };

    /**
     * Whether a call resolves to a function the author declared `: number`
     * returning — a free function, a method, or a function-valued class member.
     * The callee is resolved through the scope chain, so a local that shadows a
     * numeric helper is judged by the shadowing declaration alone; a binding
     * reassigned to another function has to prove every write, because the
     * declaration no longer says what the call reaches.
     */
    const isNumberReturningCall = (node: TSESTree.CallExpression): boolean => {
      const callee = unwrapWrittenKey(node.callee);
      if (callee.type === AST_NODE_TYPES.Identifier) {
        const variable = ASTHelpers.findVariableInScope(
          ASTHelpers.getScope(context, callee),
          callee.name,
        );
        if (!variable || variable.defs.length === 0) {
          return false;
        }
        // The definition KIND decides which node carries the annotation: a
        // function name is annotated on the function it names, while a
        // parameter's definition node is the enclosing function — whose own
        // return type says nothing about what the parameter holds.
        const declaresNumeric = variable.defs.every((def) => {
          switch (def.type) {
            case TSESLint.Scope.DefinitionType.FunctionName:
              return returnsNumberType(def.node);
            case TSESLint.Scope.DefinitionType.Variable:
              // The declarator's initializer is a write, so the write pass is
              // what reads the annotation off the function it holds.
              return (
                def.node.type === AST_NODE_TYPES.VariableDeclarator &&
                !!def.node.init
              );
            default:
              return false;
          }
        });
        return (
          declaresNumeric &&
          variable.references
            .filter((reference) => reference.isWrite())
            .every(
              (reference) =>
                !!reference.writeExpr &&
                returnsNumberType(unwrapWrittenKey(reference.writeExpr)),
            )
        );
      }
      if (callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }
      const key = memberAccessKey(callee);
      if (!key) {
        return false;
      }
      const receiver = receiverClassContext(callee.object);
      if (!receiver) {
        return false;
      }
      const declarations = classMemberDeclarations(
        receiver.body,
        key,
        receiver.isStatic,
      );
      return (
        declarations.length > 0 && declarations.every(memberCallReturnsNumber)
      );
    };

    /**
     * Whether the syntax alone proves the key is a number. `__proto__`,
     * `constructor` and `prototype` are never the string form of a number, so a
     * numeric key cannot reach the prototype surface assertSafe exists to
     * guard: the call would be dead weight, and in an index-heavy loop a
     * per-iteration coercion. The judgement stays syntactic — a key the syntax
     * does not prove numeric keeps being reported.
     */
    const isStaticallyNumeric = (
      node: TSESTree.Node,
      seen: Set<TSESLint.Scope.Variable> = new Set(),
    ): boolean => {
      // An assertion or an await around an operand leaves its run-time value
      // alone, so the proof reads through to what the wrapper holds. The
      // annotation on the binding underneath is what proves the key numeric —
      // an assertion asserts and proves nothing on its own. An optional chain
      // is read through as well: `xs?.length` is the same `.length` proof, and
      // its short-circuit yields `undefined`, which stringifies to "undefined"
      // and so still names no field of the prototype surface.
      const target = unwrapWrittenKey(node);
      switch (target.type) {
        case AST_NODE_TYPES.Literal:
          return typeof target.value === 'number';
        case AST_NODE_TYPES.UpdateExpression:
          return true;
        case AST_NODE_TYPES.UnaryExpression:
          return (
            target.operator === '-' ||
            target.operator === '+' ||
            target.operator === '~'
          );
        case AST_NODE_TYPES.BinaryExpression:
          if (NUMERIC_BINARY_OPERATORS.has(target.operator)) {
            return true;
          }
          return (
            target.operator === '+' &&
            isStaticallyNumeric(target.left, seen) &&
            isStaticallyNumeric(target.right, seen)
          );
        case AST_NODE_TYPES.CallExpression:
          return isNumericCall(target) || isNumberReturningCall(target);
        case AST_NODE_TYPES.MemberExpression:
          // `.length` is a number on arrays, typed arrays and strings alike.
          if (
            !target.computed &&
            target.property.type === AST_NODE_TYPES.Identifier &&
            target.property.name === 'length'
          ) {
            return true;
          }
          return isNumberMemberRead(target);
        case AST_NODE_TYPES.Identifier:
          return isNumericIdentifier(target, seen);
        default:
          return false;
      }
    };

    /**
     * Whether every declaration and every write of the resolved binding keeps it
     * numeric. `seen` is copied per resolution step so a cycle
     * (`let a = b; let b = a;`) terminates without a sibling occurrence of one
     * variable (`arr[i + i]`) being mistaken for that cycle.
     */
    const isNumericIdentifier = (
      node: TSESTree.Identifier,
      seen: Set<TSESLint.Scope.Variable>,
    ): boolean => {
      const variable = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, node),
        node.name,
      );
      if (!variable || seen.has(variable)) {
        return false;
      }
      const nextSeen = new Set(seen).add(variable);

      if (
        variable.defs.length === 0 ||
        !variable.defs.every(definesNumericBinding)
      ) {
        return false;
      }

      const writes = variable.references.filter((reference) =>
        reference.isWrite(),
      );
      const staysNumeric = writes.every((reference) => {
        const { writeExpr } = reference;
        // `i++`/`--i` write a number back with no expression to inspect.
        if (!writeExpr) {
          return true;
        }
        const assignment = writeExpr.parent;
        if (
          assignment?.type === AST_NODE_TYPES.AssignmentExpression &&
          NUMERIC_ASSIGNMENT_OPERATORS.has(assignment.operator)
        ) {
          return true;
        }
        if (initializesNumericDeclaration(writeExpr)) {
          return true;
        }
        return isStaticallyNumeric(writeExpr, nextSeen);
      });
      if (!staysNumeric) {
        return false;
      }

      // A `: number` parameter is numeric from its declaration; a declarator is
      // only proven by a write, and its initializer is one — so `let k;` with no
      // write anywhere holds undefined and stays unproven.
      return (
        writes.length > 0 ||
        variable.defs.every((def) => isNumberAnnotated(def.name))
      );
    };

    return {
      // Handle computed property in object destructuring
      Property(node: TSESTree.Property) {
        if (node.computed && node.key) {
          const written = node.key;
          const key = unwrapWrittenKey(written);

          // Check for String(id) pattern
          if (
            key.type === AST_NODE_TYPES.CallExpression &&
            key.callee.type === AST_NODE_TYPES.Identifier &&
            key.callee.name === 'String'
          ) {
            const arg = key.arguments[0];
            const argText = context.sourceCode.getText(arg);
            reportWrittenKey(written, key, argText);
          }

          // Check for template literals like `${id}`
          if (
            key.type === AST_NODE_TYPES.TemplateLiteral &&
            key.expressions.length === 1 &&
            key.quasis.length === 2 &&
            key.quasis[0].value.raw === '' &&
            key.quasis[1].value.raw === ''
          ) {
            const expr = key.expressions[0];
            const exprText = context.sourceCode.getText(expr);
            reportWrittenKey(written, key, exprText);
          }
        }
      },
      // Handle binary expressions like 'key' in obj
      BinaryExpression(node: TSESTree.BinaryExpression) {
        if (node.operator === 'in') {
          const written = node.left;
          const left = unwrapWrittenKey(written);

          // Check for String(id) pattern
          if (
            left.type === AST_NODE_TYPES.CallExpression &&
            left.callee.type === AST_NODE_TYPES.Identifier &&
            left.callee.name === 'String'
          ) {
            const arg = left.arguments[0];
            const argText = context.sourceCode.getText(arg);
            reportWrittenKey(written, left, argText);
          }

          // Check for template literals like `${id}`
          if (
            left.type === AST_NODE_TYPES.TemplateLiteral &&
            left.expressions.length === 1 &&
            left.quasis.length === 2 &&
            left.quasis[0].value.raw === '' &&
            left.quasis[1].value.raw === ''
          ) {
            const expr = left.expressions[0];
            const exprText = context.sourceCode.getText(expr);
            reportWrittenKey(written, left, exprText);
          }
        }
      },
      MemberExpression(node: TSESTree.MemberExpression) {
        if (node.computed) {
          const written = node.property;
          // The written key may sit under assertion or await wrappers that erase
          // at run time, or under an optional chain; what they hold is what
          // names the property, so that is what the branches below classify.
          const property = unwrapWrittenKey(written);

          // Skip if already using assertSafe
          if (
            property.type === AST_NODE_TYPES.CallExpression &&
            property.callee.type === AST_NODE_TYPES.Identifier &&
            property.callee.name === 'assertSafe'
          ) {
            // Already using assertSafe, this is valid
            return;
          }

          // Try to determine if this is likely an array or dictionary
          const isLikelyArray = ARRAY_LIKE_NAME.test(
            indexedObjectName(node.object),
          );

          // Check for string literals - allow them for dictionaries but not for regular objects
          if (
            property.type === AST_NODE_TYPES.Literal &&
            typeof property.value === 'string'
          ) {
            // String literals are fine, no need for assertSafe
            return;
          }

          // Check for numeric literals - always allow for arrays
          if (
            property.type === AST_NODE_TYPES.Literal &&
            typeof property.value === 'number'
          ) {
            // Numeric literals are fine, no need for assertSafe
            return;
          }

          // A key the syntax proves numeric — a loop counter, an offset
          // computation, Math.floor(...) — cannot name a prototype field, so
          // validating it guards nothing.
          if (isStaticallyNumeric(property)) {
            return;
          }

          // Check if we're using String(id) pattern
          if (
            property.type === AST_NODE_TYPES.CallExpression &&
            property.callee.type === AST_NODE_TYPES.Identifier &&
            property.callee.name === 'String'
          ) {
            const arg = property.arguments[0];
            const argText = context.sourceCode.getText(arg);
            reportWrittenKey(written, property, argText);
            return;
          }

          // Check for template literals
          if (property.type === AST_NODE_TYPES.TemplateLiteral) {
            // If it's a template literal in an array, allow it
            if (isLikelyArray) {
              return;
            }

            // A template whose every substitution is provably numeric can only
            // widen into digits, and no dangerous property name is the string
            // form of a number — the same proof the identifier path accepts.
            const canWidenToText = property.expressions.some(
              (expr) => !isStaticallyNumeric(expr),
            );
            const quasis = property.quasis.map(
              (quasi) => quasi.value.cooked ?? quasi.value.raw,
            );
            const reachesPrototype =
              canWidenToText &&
              PROTOTYPE_REACHING_KEYS.some((key) =>
                templateCanSpell(quasis, key),
              );

            // Fixed text on either side of the substitution can rule a property
            // name out — `user-${id}` is never `__proto__` — and the rule skips
            // a key it can prove harmless. What it must NOT do is assume that:
            // `__pro${x}` carries fixed text too and still reaches the
            // prototype (#1880).
            if (!reachesPrototype) {
              return;
            }

            // `${id}` alone is the whole key, so the remedy names the inner
            // expression and the fix wraps it directly. A template carrying
            // fixed text has no such inner key — the string it builds is the
            // key — so that whole template is what gets wrapped, which is the
            // shape the docs show for `assertSafe(`${id}_suffix`)`.
            const isSimpleVarInterpolation =
              property.expressions.length === 1 &&
              property.quasis.length === 2 &&
              property.quasis[0].value.raw === '' &&
              property.quasis[1].value.raw === '';
            const unwrapped = isSimpleVarInterpolation
              ? property.expressions[0]
              : property;
            reportWrittenKey(
              written,
              property,
              context.sourceCode.getText(unwrapped),
            );
            return;
          }

          // Check for direct variable usage (identifiers)
          if (property.type === AST_NODE_TYPES.Identifier) {
            // Skip numeric literals, they're safe
            if (/^\d+$/.test(property.name)) {
              return;
            }

            // If it looks like an array access, allow it
            if (isLikelyArray) {
              return;
            }

            // Variables initialized directly from assertSafe(...) are already
            // validated — no need to double-wrap them.
            if (isAssertSafeValidatedIdentifier(property)) {
              return;
            }

            // A typed discriminant indexing a Record whose declared keys cover
            // its type is compile-time bounded; wrapping it would turn a total
            // lookup into a throwing one (#1875).
            if (isCompilerBoundedLookup(node, property)) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportWrittenKey(written, property, propText);
            return;
          }

          // Check for binary expressions (like index + 1)
          if (property.type === AST_NODE_TYPES.BinaryExpression) {
            // Allow binary expressions in array access
            if (isLikelyArray) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportWrittenKey(written, property, propText);
            return;
          }

          // Check for boolean expressions and other literals
          if (
            property.type === AST_NODE_TYPES.Literal ||
            property.type === AST_NODE_TYPES.LogicalExpression ||
            property.type === AST_NODE_TYPES.ConditionalExpression
          ) {
            // Allow these expressions in array access
            if (isLikelyArray) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportWrittenKey(written, property, propText);
            return;
          }

          // Check for function calls (anything that isn't handled above)
          if (
            property.type === AST_NODE_TYPES.MemberExpression ||
            (property.type === AST_NODE_TYPES.CallExpression &&
              !(
                property.callee.type === AST_NODE_TYPES.Identifier &&
                property.callee.name === 'String'
              ))
          ) {
            // Allow member expressions and function calls in array access
            if (isLikelyArray) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportWrittenKey(written, property, propText);
            return;
          }
        }
      },
    };
  },
});
