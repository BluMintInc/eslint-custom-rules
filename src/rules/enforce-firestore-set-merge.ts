import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import {
  createSuppressionChecker,
  parseDisableDirectives,
} from '../utils/disableDirectives';
import {
  ImportRemovalSource,
  TextRange,
  planOrphanedBindingRemoval,
} from '../utils/importRemoval';
import { planPatternBindingRemoval } from '../utils/patternBindingRemoval';
import {
  joinSegmentBody,
  requiresLineBreakAfter,
  requiresOwnLine,
} from '../utils/replacementSegments';
import { declarationOf, resolveInEnclosingScopes } from '../utils/lexicalScope';
import { reindentRelocated } from '../utils/reindentRelocated';

type MessageIds = 'preferSetMerge';

const FIRESTORE_MODULES = new Set(['firebase/firestore', 'firebase-admin']);
const UPDATE_DOC = 'updateDoc';
const SET_DOC = 'setDoc';
const MERGE_OPTION = '{ merge: true }';
/** The document data `setDoc` requires between the reference and the options. */
const EMPTY_DATA = '{}';
/**
 * The width and indent step the consumer's formatter prints at. They decide the
 * layout of an emitted argument list, so a fix that ignores them lands text the
 * formatter immediately rewrites (#2097).
 */
const PRINT_WIDTH = 80;
const INDENT_STEP = '  ';
const BATCH_MANAGER = 'batchManager';
/**
 * Realtime Database's batch manager is held under the same `batchManager` field
 * name as the Firestore one, yet it exposes no `set` method at all — its
 * positional `update(path, data)` is the only write path it has, and RTDB's
 * update already merges shallowly. Rewriting one of its calls emits a method
 * that does not exist (TS2339), so a receiver proven to be this class is out of
 * the rule's scope entirely.
 */
const REALTIME_BATCH_MANAGER = 'RealtimeBatchManager';

/**
 * Where a firestore export enters the file: the entry inside `import { … }`, or
 * the object-pattern property of `await import('firebase/firestore')`. That
 * entry is what a fix edits when it swaps `updateDoc` for `setDoc`.
 */
type FirestoreBinding = {
  /** The name firestore exports under this binding, e.g. `updateDoc`. */
  imported: string;
  /**
   * The module the binding is read from. Each firestore entry point ships its
   * own API surface, so the exported NAME alone does not identify a binding:
   * `firebase-admin`'s `setDoc` is not the modular SDK's, and reusing it for the
   * emitted call rewrites `updateDoc(ref, data)` into a call on a different
   * function (#1901).
   */
  module: string;
  node: TSESTree.ImportSpecifier | TSESTree.Property;
};

/** Where one argument's own text starts and ends, comments on it included. */
type ArgumentSpan = { start: number; end: number };

type CallLayout = {
  openParen: TSESTree.Token;
  closeParen: TSESTree.Token;
  spans: ArgumentSpan[];
};

/** The firestore module a dynamic `await import(…)` reads, if it is one. */
function firestoreDynamicImportModule(
  node: TSESTree.Node | null | undefined,
): string | null {
  if (node?.type !== AST_NODE_TYPES.AwaitExpression) {
    return null;
  }
  const imported = node.argument;
  if (
    imported.type !== AST_NODE_TYPES.ImportExpression ||
    imported.source.type !== AST_NODE_TYPES.Literal ||
    typeof imported.source.value !== 'string' ||
    !FIRESTORE_MODULES.has(imported.source.value)
  ) {
    return null;
  }
  return imported.source.value;
}

function isFirestoreDynamicImport(
  node: TSESTree.Node | null | undefined,
): boolean {
  return firestoreDynamicImportModule(node) !== null;
}

/**
 * Reads a binding's origin off the AST rather than off a traversal flag, so the
 * verdict is re-derived on every pass of a multi-pass `--fix` — including the
 * passes that run after a previous pass inserted the `setDoc` binding.
 */
function firestoreBindingOf(
  def: TSESLint.Scope.Definition,
): FirestoreBinding | null {
  const { node } = def;
  if (node.type === AST_NODE_TYPES.ImportSpecifier) {
    const declaration = node.parent;
    if (
      declaration?.type !== AST_NODE_TYPES.ImportDeclaration ||
      !FIRESTORE_MODULES.has(declaration.source.value) ||
      declaration.importKind === 'type' ||
      node.importKind === 'type'
    ) {
      return null;
    }
    return {
      imported: node.imported.name,
      module: declaration.source.value,
      node,
    };
  }
  if (
    node.type === AST_NODE_TYPES.VariableDeclarator &&
    node.id.type === AST_NODE_TYPES.ObjectPattern
  ) {
    const module = firestoreDynamicImportModule(node.init);
    if (module === null) {
      return null;
    }
    const property = def.name.parent;
    if (
      property?.type !== AST_NODE_TYPES.Property ||
      property.parent !== node.id ||
      property.value !== def.name ||
      property.computed ||
      property.key.type !== AST_NODE_TYPES.Identifier
    ) {
      return null;
    }
    return {
      imported: property.key.name,
      module,
      node: property,
    };
  }
  return null;
}

/**
 * Whether every declaration of a visible binding is the given firestore export,
 * read from the given module.
 *
 * The module half is what makes the answer usable as "this name already means
 * what the rewrite is about to emit". Matching on the exported name alone let a
 * `setDoc` imported from `firebase-admin` stand in for the modular SDK's, so the
 * fix emitted a call to the wrong function and left the `firebase/firestore`
 * `updateDoc` import bound to nothing (#1901).
 */
function bindsFirestoreExport(
  variable: TSESLint.Scope.Variable,
  imported: string,
  module: string,
): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const binding = firestoreBindingOf(def);
      return binding?.imported === imported && binding.module === module;
    })
  );
}

/**
 * A comment whose meaning is tied to where it sits. Re-emitting one somewhere
 * else retargets it — a disable directive lands on an unrelated line and a
 * `@ts-expect-error` becomes an error of its own — so a removal that would move
 * one is withheld instead.
 */
function isPositionalDirective(comment: TSESTree.Comment): boolean {
  if (parseDisableDirectives([comment]).length > 0) {
    return true;
  }
  const value = comment.value.trim();
  return value.startsWith('@ts-expect-error') || value.startsWith('@ts-ignore');
}

/** The rightmost segment of a type name, so `realtimeDb.X` reads like a bare `X`. */
function typeNameOf(node: TSESTree.EntityName): string | null {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  if (node.type === AST_NODE_TYPES.TSQualifiedName) {
    return typeNameOf(node.right);
  }
  return null;
}

/**
 * Whether a type annotation names the Realtime Database batch manager. Wrappers
 * that preserve the instance type — `Readonly<…>`, a union, an intersection —
 * are looked through, because the field they annotate still holds the class.
 */
function isRealtimeType(node: TSESTree.TypeNode | undefined | null): boolean {
  if (!node) {
    return false;
  }
  switch (node.type) {
    case AST_NODE_TYPES.TSTypeReference:
      return (
        typeNameOf(node.typeName) === REALTIME_BATCH_MANAGER ||
        (node.typeParameters?.params ?? []).some(isRealtimeType)
      );
    case AST_NODE_TYPES.TSUnionType:
    case AST_NODE_TYPES.TSIntersectionType:
      return node.types.some(isRealtimeType);
    default:
      return false;
  }
}

function isRealtimeAnnotation(
  annotation: TSESTree.TSTypeAnnotation | undefined,
): boolean {
  return isRealtimeType(annotation?.typeAnnotation);
}

/**
 * Whether an initializer constructs the Realtime Database batch manager.
 *
 * The wrappers TypeScript writes around a value — `as T`, `satisfies T`, `!`,
 * `<T>` — restate the expression's TYPE; none of them changes which class is
 * constructed, so the construction underneath one is what the carve-out reads.
 * {@link isRealtimeType} already looks through the type-level wrappers, and
 * keying this arm on a bare `NewExpression` drifted the two apart: a field
 * initialized `new RealtimeBatchManager() as RealtimeBatchManager` fell through
 * to the Firestore arm and was told to call `set(…, { merge: true })` on a
 * manager that has no `set` method at all, which no spelling of the code
 * satisfies (#2150).
 */
function isRealtimeInstance(node: TSESTree.Node | null | undefined): boolean {
  const constructed = node ? unwrapAssertions(node) : null;
  if (constructed?.type !== AST_NODE_TYPES.NewExpression) {
    return false;
  }
  const { callee } = constructed;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === REALTIME_BATCH_MANAGER;
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === REALTIME_BATCH_MANAGER
  );
}

/**
 * Whether a parameter binds `name` to the Realtime batch manager. A parameter
 * property declares the field outright; a plain constructor parameter of the
 * same name is the evidence a subclass carries when it forwards the manager to a
 * `super()` that stores it.
 */
function parameterBindsRealtime(
  param: TSESTree.Parameter,
  name: string,
): boolean {
  const declared =
    param.type === AST_NODE_TYPES.TSParameterProperty ? param.parameter : param;
  const identifier =
    declared.type === AST_NODE_TYPES.AssignmentPattern
      ? declared.left
      : declared;
  const initializer =
    declared.type === AST_NODE_TYPES.AssignmentPattern ? declared.right : null;
  return (
    identifier.type === AST_NODE_TYPES.Identifier &&
    identifier.name === name &&
    (isRealtimeAnnotation(identifier.typeAnnotation) ||
      isRealtimeInstance(initializer))
  );
}

/** Whether a class member identifies `name` as the Realtime batch manager. */
function memberBindsRealtime(
  member: TSESTree.ClassElement,
  name: string,
): boolean {
  if (member.type === AST_NODE_TYPES.PropertyDefinition) {
    return (
      !member.computed &&
      member.key.type === AST_NODE_TYPES.Identifier &&
      member.key.name === name &&
      (isRealtimeInstance(member.value) ||
        isRealtimeAnnotation(member.typeAnnotation))
    );
  }
  return (
    member.type === AST_NODE_TYPES.MethodDefinition &&
    member.kind === 'constructor' &&
    member.value.params.some((param) => parameterBindsRealtime(param, name))
  );
}

/** Strips assertions, which change a literal's type but not its value. */
function unwrapAssertions(node: TSESTree.Node): TSESTree.Node {
  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    return unwrapAssertions(node.expression);
  }
  return node;
}

/**
 * Whether an expression evaluates to a primitive value on its face. Firestore's
 * update data is an object of field updates, so a primitive in the data
 * position proves the call is not Firestore's — the only signal available where
 * the receiver is inherited from another module.
 */
function isPrimitiveLiteral(node: TSESTree.Node | undefined): boolean {
  if (!node) {
    return false;
  }
  const expression = unwrapAssertions(node);
  // A template literal evaluates to a string however it interpolates.
  if (expression.type === AST_NODE_TYPES.TemplateLiteral) {
    return true;
  }
  if (
    expression.type === AST_NODE_TYPES.UnaryExpression &&
    (expression.operator === '-' || expression.operator === '+')
  ) {
    return isPrimitiveLiteral(expression.argument);
  }
  if (expression.type !== AST_NODE_TYPES.Literal) {
    return false;
  }
  const { value } = expression;
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  );
}

/**
 * Strips the wrappers that leave an expression's shape intact, assertions plus
 * the `ChainExpression` an optional link parks on the outermost node of a chain.
 *
 * The two are kept apart rather than merged into `unwrapAssertions` because a
 * chain is not erased at runtime: `admin?.firestore()` evaluates to the handle
 * or to `undefined`, so a caller reasoning about the *value* an expression
 * produces — `isPrimitiveLiteral` — must keep seeing the chain. A caller
 * reasoning about the *shape* it is written in, which is what the evidence scan
 * asks, must look through it: the optional link decides whether the handle is
 * produced, never which instance it is.
 */
function unwrapTransparent(node: TSESTree.Node): TSESTree.Node {
  const stripped = unwrapAssertions(node);
  return stripped.type === AST_NODE_TYPES.ChainExpression
    ? unwrapTransparent(stripped.expression)
    : stripped;
}

/**
 * Whether a declarator is initialized from a `<x>.firestore()` call.
 *
 * Both optional spellings — `admin?.firestore()` and `admin.firestore?.()` —
 * parse as `ChainExpression > CallExpression`, so testing the initializer's own
 * type read `ChainExpression` and answered no. Since this scan is the last
 * detector left for a bare-identifier receiver, that miss dropped the report
 * silently, and it hit the more careful spellings hardest: `admin.apps[0]?.
 * firestore()` and `admin.app()?.firestore()` are the idiomatic admin-SDK
 * singleton bootstrap, not exotic code.
 */
function initializesFirestore(
  declarator: TSESTree.VariableDeclarator,
): boolean {
  const init = declarator.init ? unwrapTransparent(declarator.init) : null;
  return (
    init?.type === AST_NODE_TYPES.CallExpression &&
    init.callee.type === AST_NODE_TYPES.MemberExpression &&
    init.callee.property.type === AST_NODE_TYPES.Identifier &&
    init.callee.property.name === 'firestore'
  );
}

/**
 * Whether a statement declares a Firestore instance, looking through `export`.
 *
 * `export const db = admin.firestore()` is the same declaration one AST node
 * deeper, inside an `ExportNamedDeclaration`. Reading the statement without
 * unwrapping makes the `export` keyword alone decide whether the file's
 * Firestore evidence is visible, which is not a distinction a `db` handle knows
 * anything about — `resolveClassBody()` unwraps it for the same
 * "find the in-file declaration that carries the evidence" purpose.
 */
function declaresFirestoreInstance(statement: TSESTree.Node): boolean {
  const declaration = declarationOf(statement);
  return (
    declaration.type === AST_NODE_TYPES.VariableDeclaration &&
    declaration.declarations.some(initializesFirestore)
  );
}

/**
 * Whether the file itself proves Firestore is in play at the call site, by
 * searching every enclosing statement container innermost outward.
 *
 * Scanning `Program.body` alone left both commonplace spellings invisible: a
 * `const db = admin.firestore()` written inside the handler that uses it, and an
 * exported one, which sits inside its `export` statement. Since this scan is the
 * only detector left for a bare-identifier receiver, the hole silently dropped
 * the report rather than producing a wrong one. A container without the evidence
 * falls through to the next one out instead of answering for the whole chain.
 */
function hasFirestoreInstanceInScope(node: TSESTree.Node): boolean {
  return (
    resolveInEnclosingScopes<true>(node, (statements) =>
      statements.some((statement) => declaresFirestoreInstance(statement))
        ? true
        : undefined,
    ) === true
  );
}

export const enforceFirestoreSetMerge = createRule<[], MessageIds>({
  name: 'enforce-firestore-set-merge',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using set() with { merge: true } instead of update() for Firestore operations to ensure consistent behavior. The update() method fails if the document does not exist, while set() with { merge: true } creates the document if needed and safely merges fields, making it more reliable and predictable.',
      recommended: 'error',
      requiresTypeChecking: false,
      extendsBaseRule: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferSetMerge:
        'Use set() with { merge: true } instead of update() for more predictable Firestore operations. Instead of `docRef.update({ field: value })`, use `docRef.set({ field: value }, { merge: true })`. This ensures consistent behavior when the document does not exist.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const updateAliases = new Set<string>();

    /**
     * The `setDoc` binding rides on one violation's fix, which makes that
     * violation the file's import carrier. ESLint calls `fix()` before it
     * applies inline disable directives, so a suppressed carrier takes the
     * binding down with it while the surviving violations still emit
     * `setDoc(…)`. Resolving suppression up front passes the carrier slot to the
     * first violation that actually survives.
     */
    const isReportSuppressed = createSuppressionChecker(context);
    let plannedSetDocBinding = false;

    /**
     * Calls a previous report's fix already rewrote. A batch that retires the
     * `updateDoc` binding has to own every call that reads it — see
     * {@link retiringRewrites} — so the reports for those calls stand without a
     * fix of their own rather than fighting the carrier for the same ranges.
     */
    const batchedCalls = new Set<TSESTree.CallExpression>();

    /**
     * Classes declared directly in one statement container, by name — both the
     * `class X {}` spelling and the `const X = class {}` one, each looked
     * through its optional `export` wrapper.
     *
     * The memo hangs off the container rather than off the file. What a single
     * container declares is the same answer for every call site that asks, so
     * caching it is safe, whereas a file-wide name map is not: lexical
     * resolution is position dependent, and one map computed for whichever site
     * asked first would hand that site's answer to every other one.
     */
    const classesByContainer = new WeakMap<
      TSESTree.Node,
      Map<string, TSESTree.ClassBody>
    >();
    function containerClasses(
      container: TSESTree.Node,
      statements: readonly TSESTree.Node[],
    ): Map<string, TSESTree.ClassBody> {
      const cached = classesByContainer.get(container);
      if (cached) {
        return cached;
      }
      const classes = new Map<string, TSESTree.ClassBody>();
      for (const statement of statements) {
        const declaration = declarationOf(statement);
        if (
          declaration.type === AST_NODE_TYPES.ClassDeclaration &&
          declaration.id
        ) {
          classes.set(declaration.id.name, declaration.body);
          continue;
        }
        if (declaration.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declarator of declaration.declarations) {
            if (
              declarator.id.type === AST_NODE_TYPES.Identifier &&
              declarator.init?.type === AST_NODE_TYPES.ClassExpression
            ) {
              classes.set(declarator.id.name, declarator.init.body);
            }
          }
        }
      }
      classesByContainer.set(container, classes);
      return classes;
    }

    /**
     * The class a superclass reference names, searched from the reference
     * outward through every enclosing statement container so the declaration
     * that carries the field's evidence is found wherever it sits.
     *
     * Scanning `Program.body` alone made the `export` keyword and the depth of a
     * declaration decide whether a base class is visible, which is not a
     * distinction an inherited field knows anything about. This map feeds the
     * Realtime Database carve-out, so a miss switches the exemption off and
     * turns a call the rule cannot legally rewrite into a report — the same
     * hole `hasFirestoreInstanceInScope` closes for the detection direction,
     * and the two must agree. The innermost container wins, so a nested class
     * shadowing an outer one of the same name answers for the code that sees
     * the shadow.
     */
    function resolveClassBody(
      name: string,
      reference: TSESTree.Node,
    ): TSESTree.ClassBody | null {
      return (
        resolveInEnclosingScopes<TSESTree.ClassBody>(
          reference,
          (statements, container) =>
            containerClasses(container, statements).get(name),
        ) ?? null
      );
    }

    function enclosingClassBody(
      node: TSESTree.Node,
    ): TSESTree.ClassBody | null {
      let current: TSESTree.Node | undefined = node.parent;
      while (current) {
        if (current.type === AST_NODE_TYPES.ClassBody) {
          return current;
        }
        current = current.parent;
      }
      return null;
    }

    /** Follows `extends` in-file, since a subclass inherits its field's type. */
    function classBindsRealtime(
      body: TSESTree.ClassBody,
      name: string,
      seen: Set<TSESTree.ClassBody>,
    ): boolean {
      if (seen.has(body)) {
        return false;
      }
      seen.add(body);
      if (body.body.some((member) => memberBindsRealtime(member, name))) {
        return true;
      }
      const declaration = body.parent;
      const superClass =
        declaration?.type === AST_NODE_TYPES.ClassDeclaration ||
        declaration?.type === AST_NODE_TYPES.ClassExpression
          ? declaration.superClass
          : null;
      if (superClass?.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }
      const superBody = resolveClassBody(superClass.name, superClass);
      return superBody ? classBindsRealtime(superBody, name, seen) : false;
    }

    function identifierBindsRealtime(identifier: TSESTree.Identifier): boolean {
      const scope = ASTHelpers.getScope(context, identifier);
      const variable = ASTHelpers.findVariableInScope(scope, identifier.name);
      return (variable?.defs ?? []).some((def) => {
        const declaredName: TSESTree.Node = def.name;
        return (
          (declaredName.type === AST_NODE_TYPES.Identifier &&
            isRealtimeAnnotation(declaredName.typeAnnotation)) ||
          (def.node.type === AST_NODE_TYPES.VariableDeclarator &&
            isRealtimeInstance(def.node.init))
        );
      });
    }

    /**
     * Whether the file itself proves the receiver holds a RealtimeBatchManager:
     * `this.batchManager` against the class (or an in-file superclass) that
     * declares the field, and a plain identifier against its binding.
     */
    function receiverBindsRealtime(
      node: TSESTree.CallExpression,
      receiver: TSESTree.Node,
    ): boolean {
      if (receiver.type === AST_NODE_TYPES.Identifier) {
        return identifierBindsRealtime(receiver);
      }
      if (
        receiver.type !== AST_NODE_TYPES.MemberExpression ||
        receiver.computed ||
        receiver.property.type !== AST_NODE_TYPES.Identifier ||
        receiver.object.type !== AST_NODE_TYPES.ThisExpression
      ) {
        return false;
      }
      const body = enclosingClassBody(node);
      return body
        ? classBindsRealtime(body, receiver.property.name, new Set())
        : false;
    }

    /**
     * Either syntactic signal puts a `batchManager.update(…)` call outside the
     * rule: the receiver resolves in-file to the Realtime Database manager, or
     * the data argument is a primitive literal, which Firestore's object of
     * field updates can never be. A call with no data argument has nothing in
     * that position, so only the receiver can answer for it.
     */
    function isRealtimeBatchUpdate(
      node: TSESTree.CallExpression,
      receiver: TSESTree.Node,
    ): boolean {
      return (
        isPrimitiveLiteral(node.arguments[1]) ||
        receiverBindsRealtime(node, receiver)
      );
    }

    function isFirestoreUpdateCall(node: TSESTree.CallExpression): boolean {
      // Check if it's a set() call with merge: true
      if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
        const property = node.callee.property;
        if (property.type === AST_NODE_TYPES.Identifier) {
          // If it's a set() call, check if it has merge: true
          if (property.name === 'set') {
            const lastArg = node.arguments[node.arguments.length - 1];
            if (lastArg?.type === AST_NODE_TYPES.ObjectExpression) {
              const hasMergeTrue = lastArg.properties.some(
                (prop) =>
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'merge' &&
                  prop.value.type === AST_NODE_TYPES.Literal &&
                  prop.value.value === true,
              );
              if (hasMergeTrue) {
                return false; // Already using set with merge: true
              }
            }
          }

          // Only flag update() calls that are Firestore operations
          if (property.name === 'update') {
            const object = node.callee.object;

            // Check for BatchManager update calls. The Realtime Database
            // manager answers to the same field name without a `set` method, so
            // its calls are not Firestore operations at all.
            if (
              object.type === AST_NODE_TYPES.MemberExpression &&
              object.property.type === AST_NODE_TYPES.Identifier &&
              object.property.name === BATCH_MANAGER
            ) {
              return !isRealtimeBatchUpdate(node, object);
            }

            if (object.type === AST_NODE_TYPES.CallExpression) {
              // Check if it's a createHash().update() call
              if (
                object.callee.type === AST_NODE_TYPES.Identifier &&
                object.callee.name === 'createHash'
              ) {
                return false;
              }
            }

            // Check if it's a Firestore document reference or transaction
            let current: TSESTree.Node | undefined = node;
            while (current?.parent) {
              current = current.parent;
              if (current.type === AST_NODE_TYPES.MemberExpression) {
                const obj = current.object;
                if (obj.type === AST_NODE_TYPES.Identifier) {
                  // Check for common Firestore variable names
                  if (
                    obj.name === 'db' ||
                    obj.name === 'firestore' ||
                    obj.name === 'transaction' ||
                    obj.name === 'docRef' ||
                    obj.name === 'userRef' ||
                    obj.name.endsWith('Ref')
                  ) {
                    return true;
                  }
                }
              }
            }

            // Check if it's a Firestore document reference method chain
            let currentObj = object;
            while (currentObj.type === AST_NODE_TYPES.MemberExpression) {
              if (currentObj.property.type === AST_NODE_TYPES.Identifier) {
                const methodName = currentObj.property.name;
                if (methodName === 'collection' || methodName === 'doc') {
                  return true;
                }
              }
              currentObj = currentObj.object;
            }

            // Check if it's a transaction.update() call
            if (
              object.type === AST_NODE_TYPES.Identifier &&
              object.name === 'transaction'
            ) {
              return true;
            }

            // Check if it's a Firestore document reference by looking for the
            // file's own `<x>.firestore()` handle, wherever it is declared.
            return hasFirestoreInstanceInScope(node);
          }
          return false;
        }
      }
      if (node.callee.type === AST_NODE_TYPES.Identifier) {
        // Check if it's a setDoc() call with merge: true
        if (node.callee.name === SET_DOC) {
          const lastArg = node.arguments[node.arguments.length - 1];
          if (lastArg?.type === AST_NODE_TYPES.ObjectExpression) {
            const hasMergeTrue = lastArg.properties.some(
              (prop) =>
                prop.type === AST_NODE_TYPES.Property &&
                prop.key.type === AST_NODE_TYPES.Identifier &&
                prop.key.name === 'merge' &&
                prop.value.type === AST_NODE_TYPES.Literal &&
                prop.value.value === true,
            );
            if (hasMergeTrue) {
              return false; // Already using setDoc with merge: true
            }
          }
        }
        return updateAliases.has(node.callee.name);
      }
      return false;
    }

    /**
     * A spread hides how many arguments the call really passes, so the options
     * object cannot be positioned.
     */
    function hasSpreadArgument(node: TSESTree.CallExpression): boolean {
      return node.arguments.some(
        (argument) => argument.type === AST_NODE_TYPES.SpreadElement,
      );
    }

    /**
     * The parentheses of an argument list, with the source range each argument
     * occupies INCLUDING the comments written against it.
     *
     * Absorbing the comments into the spans is what lets a re-layout rewrite
     * the separators alone: every byte a comment occupies stays inside the span
     * of the argument it annotates, so nothing between the arguments is ever
     * part of a replaced range.
     *
     * Boundaries come from tokens rather than from node ranges because a node's
     * range excludes the parentheses around it: `f((a), b)` would otherwise
     * leave the closing parenthesis in a separator, and a rewritten separator
     * would emit unbalanced code.
     */
    function callLayout(node: TSESTree.CallExpression): CallLayout | null {
      const args = node.arguments;
      if (args.length === 0) {
        return null;
      }
      const openParen = sourceCode.getTokenAfter(
        node.typeParameters ?? node.callee,
        { filter: (token) => token.value === '(' },
      );
      const closeParen = sourceCode.getLastToken(node);
      if (!openParen || closeParen?.value !== ')') {
        return null;
      }

      const trailingComma = sourceCode.getTokenBefore(closeParen);
      const spans: ArgumentSpan[] = [];
      let leftBoundary: TSESTree.Token = openParen;
      for (let index = 0; index < args.length; index++) {
        const rightBoundary =
          index === args.length - 1
            ? trailingComma?.value === ','
              ? trailingComma
              : closeParen
            : sourceCode.getTokenAfter(args[index], {
                filter: (token) => token.value === ',',
              });
        if (!rightBoundary) {
          return null;
        }
        const first = sourceCode.getTokenAfter(leftBoundary, {
          includeComments: true,
        });
        const last = sourceCode.getTokenBefore(rightBoundary, {
          includeComments: true,
        });
        if (!first || !last || first.range[0] >= last.range[1]) {
          return null;
        }
        spans.push({ start: first.range[0], end: last.range[1] });
        leftBoundary = rightBoundary;
      }
      return { openParen, closeParen, spans };
    }

    /**
     * Whether a callee is a member chain the formatter breaks before it breaks
     * an argument list, which puts the width answer out of this fixer's reach.
     */
    function calleeBreaksFirst(callee: TSESTree.Node): boolean {
      let current = callee;
      while (current.type === AST_NODE_TYPES.MemberExpression) {
        current = current.object;
      }
      return current.type === AST_NODE_TYPES.CallExpression;
    }

    /**
     * Whether the emitted argument list has to be printed one argument per
     * line, closing on a line of its own.
     *
     * A formatter prints an argument list flat only while every argument prints
     * flat and the whole call fits the print width; one argument that cannot
     * puts every OTHER argument on a line of its own. Appending the option
     * inline there emits text the formatter immediately re-breaks, so the fix
     * is never a fixed point of the consumer's own formatting pass (#2097).
     *
     * A list written across lines answers the first half outright and is
     * handled before this is asked: the caller keeps it broken, except for
     * the block-comment tail {@link flattenedListFixes} claims (#2142).
     *
     * The width half is answered only where the formatter's own answer is
     * modelled end to end. A trailing options object gets hugged against the
     * call when the argument before it is of another kind, and a member chain
     * breaks before its arguments do; both print a layout this fixer cannot
     * emit, so the list is left flat rather than laid out a way the formatter
     * would rewrite.
     */
    function requiresBrokenList(
      node: TSESTree.CallExpression,
      layout: CallLayout,
      appended: readonly string[],
      nameDelta: number,
    ): boolean {
      const { openParen, closeParen, spans } = layout;
      if (
        sourceCode.text
          .slice(openParen.range[1], closeParen.range[0])
          .includes('\n')
      ) {
        return true;
      }

      const last = node.arguments[node.arguments.length - 1];
      if (
        (appended.length < 2 &&
          last.type !== AST_NODE_TYPES.ObjectExpression) ||
        calleeBreaksFirst(node.callee)
      ) {
        return false;
      }
      const line = sourceCode.lines[closeParen.loc.start.line - 1] ?? '';
      const appendedWidth = appended.reduce(
        (width, argument) => width + argument.length + ', '.length,
        0,
      );
      if (line.length + nameDelta + appendedWidth <= PRINT_WIDTH) {
        return false;
      }
      // Breaking the list settles the layout only while every argument then
      // fits on the line of its own it lands on. One that does not is re-flowed
      // INSIDE, which is a rewrite of that argument's own text.
      const body = indentAt(openParen.range[0]).length + INDENT_STEP.length;
      const widest = Math.max(
        ...spans.map((span) => span.end - span.start),
        ...appended.map((argument) => argument.length),
      );
      return body + widest + ','.length <= PRINT_WIDTH;
    }

    /**
     * The width the call prints at with its argument list riding one line:
     * everything on the opening line through the parenthesis, each span
     * joined by `, `, the tail comments a written comma strands outside the
     * last span, the appended arguments, and whatever follows the closing
     * parenthesis on its own line.
     */
    function flatListWidth(
      layout: CallLayout,
      appended: readonly string[],
      nameDelta: number,
      gapComments: readonly TSESTree.Comment[],
    ): number {
      const { openParen, closeParen, spans } = layout;
      const lastSpanEnd = spans[spans.length - 1].end;
      const suffix = (sourceCode.lines[closeParen.loc.start.line - 1] ?? '')
        .slice(closeParen.loc.start.column)
        .trimEnd();
      return (
        openParen.loc.end.column +
        nameDelta +
        spans.reduce((width, span) => width + (span.end - span.start), 0) +
        (spans.length - 1) * ', '.length +
        gapComments
          .filter((comment) => comment.range[0] >= lastSpanEnd)
          .reduce(
            (width, comment) =>
              width + ' '.length + (comment.range[1] - comment.range[0]),
            0,
          ) +
        appended.reduce(
          (width, argument) => width + ', '.length + argument.length,
          0,
        ) +
        suffix.length
      );
    }

    /**
     * The edits that print an authored-broken list flat, with `appended` on
     * its tail — or `null` where the flat layout is out of reach or out of
     * scope.
     *
     * A list written across lines usually stays broken: a multi-line argument
     * cannot be inlined without rewriting its text, and a line comment pins
     * its break outright. A break held up by nothing but a BLOCK comment
     * trailing the last argument is neither — a block comment is no line
     * terminator, so the consumer's formatter collapses the whole call as
     * soon as it fits the print width, and no broken emission is a fixed
     * point of its formatting pass there (#2142). Only that annotated tail
     * claims the flat layout; elsewhere the author's breaks are kept — a
     * choice the formatter may fold, but one this fix did not create.
     */
    function flattenedListFixes(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.CallExpression,
      layout: CallLayout,
      appended: readonly string[],
      nameDelta: number,
      beforeClose: TSESTree.Token,
      gapComments: readonly TSESTree.Comment[],
      ownLineComments: readonly TSESTree.Comment[],
    ): TSESLint.RuleFix[] | null {
      const { openParen, closeParen, spans } = layout;
      if (
        gapComments.length === 0 ||
        ownLineComments.length > 0 ||
        gapComments.some(requiresOwnLine) ||
        calleeBreaksFirst(node.callee) ||
        spans.some((span) =>
          sourceCode.text.slice(span.start, span.end).includes('\n'),
        ) ||
        flatListWidth(layout, appended, nameDelta, gapComments) > PRINT_WIDTH
      ) {
        return null;
      }
      const fixes: TSESLint.RuleFix[] = [
        fixer.replaceTextRange([openParen.range[1], spans[0].start], ''),
      ];
      for (let index = 1; index < spans.length; index++) {
        fixes.push(
          fixer.replaceTextRange(
            [spans[index - 1].end, spans[index].start],
            ', ',
          ),
        );
      }
      const lastSpanEnd = spans[spans.length - 1].end;
      const flatTail = appended.map((argument) => `, ${argument}`).join('');
      if (beforeClose.value !== ',') {
        // With no written comma the tail comments sit inside the last span,
        // so everything between the span and the parenthesis is whitespace.
        fixes.push(
          fixer.replaceTextRange([lastSpanEnd, closeParen.range[0]], flatTail),
        );
        return fixes;
      }
      const pastComma = gapComments.filter(
        (comment) => comment.range[0] >= beforeClose.range[1],
      );
      if (pastComma.length === 0) {
        // The written comma already trails the annotation; it is the
        // separator the appended arguments ride on.
        fixes.push(
          fixer.replaceTextRange(
            [beforeClose.range[1], closeParen.range[0]],
            ` ${appended.join(', ')}`,
          ),
        );
        return fixes;
      }
      // The written comma moves past the comments it precedes: prettier
      // prints a block comment on a list element BEFORE the separator.
      fixes.push(fixer.removeRange(beforeClose.range));
      fixes.push(
        fixer.replaceTextRange(
          [pastComma[pastComma.length - 1].range[1], closeParen.range[0]],
          flatTail,
        ),
      );
      return fixes;
    }

    /**
     * The edits that add `appended` to the end of a call's argument list, laid
     * out the way the consumer's formatter prints the result — or `null` for
     * the one tail no edit can extend without retargeting a directive.
     *
     * No layout re-emits an argument from its text. The broken one rewrites
     * the SEPARATORS between the arguments and shifts the indentation of the
     * ones that span lines, and the flat one rewrites the separators alone,
     * so everything between them — comments included, and a dropped
     * `eslint-disable` silently re-enables the rule it was suppressing
     * (#1877) — stays where it was written, attached to the argument it
     * belongs to.
     *
     * `nameDelta` is how much the caller's own rename widens the call, since
     * the two edits land on the same line and the width answer is about the
     * line as it will be emitted.
     */
    function appendArguments(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.CallExpression,
      appended: readonly string[],
      nameDelta: number,
    ): TSESLint.RuleFix[] | null {
      const args = node.arguments;
      const inline = () => [
        fixer.insertTextAfter(
          args[args.length - 1],
          appended.map((argument) => `, ${argument}`).join(''),
        ),
      ];

      const layout = callLayout(node);
      if (!layout) {
        return inline();
      }
      const { openParen, closeParen, spans } = layout;
      const listSpansLines = sourceCode.text
        .slice(openParen.range[1], closeParen.range[0])
        .includes('\n');
      if (
        !listSpansLines &&
        !requiresBrokenList(node, layout, appended, nameDelta)
      ) {
        return inline();
      }
      // Between the last argument's own last token and the closing parenthesis
      // sit the trailing comma, if one was written, and any comment. The tail
      // SPAN absorbs such a comment whenever no comma follows it, so the span's
      // end is not a safe place to write a separator: a `,` emitted after a
      // line comment is swallowed into the comment's text and the call no
      // longer parses (#2140). Both boundaries are therefore taken from the
      // TOKEN stream, where a comment can never be the answer.
      const beforeClose = sourceCode.getTokenBefore(closeParen);
      const lastArgumentToken =
        beforeClose?.value === ','
          ? sourceCode.getTokenBefore(beforeClose)
          : beforeClose;
      if (!beforeClose || !lastArgumentToken) {
        return inline();
      }
      const gapComments = sourceCode
        .getCommentsInside(node)
        .filter((comment) => comment.range[0] >= lastArgumentToken.range[1]);
      const sameLineComments = gapComments.filter(
        (comment) => comment.loc.start.line === lastArgumentToken.loc.end.line,
      );
      const ownLineComments = gapComments.filter(
        (comment) => comment.loc.start.line !== lastArgumentToken.loc.end.line,
      );
      // A directive trailing the argument's line means the line that FOLLOWS
      // it: emitting anything there hands `{ merge: true }` the suppression
      // that was written for the closing line, and re-exposes whatever it was
      // suppressing. No layout preserves both the option's position and the
      // directive's subject, so the fix is withheld and the report left to the
      // developer, who restructures the call with the directive in view
      // (#1877). A directive on a line of its OWN is safe: the option lands
      // BEFORE it, so everything the directive is adjacent to stays adjacent.
      if (sameLineComments.some(isPositionalDirective)) {
        return null;
      }
      if (listSpansLines) {
        const flattened = flattenedListFixes(
          fixer,
          node,
          layout,
          appended,
          nameDelta,
          beforeClose,
          gapComments,
          ownLineComments,
        );
        if (flattened) {
          return flattened;
        }
      }

      // A broken list is indented one step past the line its parenthesis opens
      // on, whatever depth that line sits at, and closes at that line's own
      // column. A constant indent is right for exactly one call site.
      const indent = indentAt(openParen.range[0]);
      const body = `${indent}${INDENT_STEP}`;
      const fixes = [
        fixer.replaceTextRange(
          [openParen.range[1], spans[0].start],
          `\n${body}`,
        ),
      ];
      for (let index = 1; index < spans.length; index++) {
        fixes.push(
          fixer.replaceTextRange(
            [spans[index - 1].end, spans[index].start],
            `,\n${body}`,
          ),
        );
      }
      // An argument laid out across lines was written against the line the call
      // opens on; landing it a step deeper moves its interior with it.
      for (const argument of args) {
        if (argument.loc.start.line === argument.loc.end.line) {
          continue;
        }
        const relocated = reindentRelocated(argument, body, sourceCode);
        if (relocated !== sourceCode.getText(argument)) {
          fixes.push(fixer.replaceText(argument, relocated));
        }
      }
      if (gapComments.length === 0) {
        fixes.push(
          fixer.replaceTextRange(
            [lastArgumentToken.range[1], closeParen.range[0]],
            `${appended
              .map((argument) => `,\n${body}${argument}`)
              .join('')},\n${indent}`,
          ),
        );
        return fixes;
      }

      const separatorPresent = beforeClose.value === ',';
      const lastSameLine = sameLineComments[sameLineComments.length - 1];
      // WHERE the separator sits among the trailing comments is the
      // formatter's call, not a constant: prettier prints a line comment on a
      // list element after the comma and a block comment before it (#2142).
      // The comma therefore lands past the leading run of block comments — at
      // the argument's own last token when that run is empty — and a comma
      // the author wrote on the wrong side of the run is moved rather than
      // doubled. Everything else in the annotation is left byte for byte as
      // written.
      let blockRunEnd = lastArgumentToken.range[1];
      for (const comment of sameLineComments) {
        if (requiresLineBreakAfter(comment)) {
          break;
        }
        blockRunEnd = comment.range[1];
      }
      const commaMisplaced =
        separatorPresent && beforeClose.range[1] < blockRunEnd;
      const needsComma = !separatorPresent || commaMisplaced;
      if (commaMisplaced) {
        fixes.push(fixer.removeRange(beforeClose.range));
      }
      if (ownLineComments.length === 0) {
        // The comment trails the argument it annotates, so it keeps that line
        // and the option opens the next one.
        const annotationEnd = Math.max(
          lastSameLine.range[1],
          beforeClose.range[1],
        );
        if (needsComma && blockRunEnd < annotationEnd) {
          fixes.push(
            fixer.insertTextAfterRange([blockRunEnd, blockRunEnd], ','),
          );
        }
        fixes.push(
          fixer.replaceTextRange(
            [annotationEnd, closeParen.range[0]],
            `${needsComma && blockRunEnd >= annotationEnd ? ',' : ''}${appended
              .map((argument) => `\n${body}${argument},`)
              .join('')}\n${indent}`,
          ),
        );
        return fixes;
      }

      // A comment on a line of its own before the `)` was not written against
      // the last argument, so the option lands BEFORE it — after the trailing
      // annotation, if the line carries one — and the comment keeps both its
      // bytes and its neighbours: what it sat above, it still sits above.
      const appendedText = appended
        .map((argument) => `\n${body}${argument},`)
        .join('');
      const anchor = Math.max(
        separatorPresent && !commaMisplaced
          ? beforeClose.range[1]
          : lastArgumentToken.range[1],
        lastSameLine ? lastSameLine.range[1] : 0,
      );
      if (!needsComma) {
        fixes.push(fixer.insertTextAfterRange([anchor, anchor], appendedText));
        return fixes;
      }
      if (blockRunEnd < anchor) {
        fixes.push(fixer.insertTextAfterRange([blockRunEnd, blockRunEnd], ','));
        fixes.push(fixer.insertTextAfterRange([anchor, anchor], appendedText));
        return fixes;
      }
      // With the separator due at the annotation's own end, it and the option
      // travel as one insertion, since both land at the same offset.
      fixes.push(
        fixer.insertTextAfterRange([anchor, anchor], `,${appendedText}`),
      );
      return fixes;
    }

    /**
     * `ref.update(…)` becomes `ref.set(…, { merge: true })` by editing the
     * method name and the argument list's separators and tail — never the text
     * of an argument itself, beyond the indentation a re-laid-out list shifts.
     * Re-emitting the call from the text of each argument dropped everything
     * between them — comments included, and a dropped `eslint-disable` silently
     * re-enables the rule it was suppressing — and dropped every argument past
     * the second outright.
     */
    function fixUpdateMethod(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.CallExpression,
      callee: TSESTree.MemberExpression,
    ): TSESLint.RuleFix[] | null {
      if (
        callee.computed ||
        callee.property.type !== AST_NODE_TYPES.Identifier
      ) {
        return null;
      }
      const args = node.arguments;
      const lastArgument = args[args.length - 1];
      if (!lastArgument || hasSpreadArgument(node)) {
        return null;
      }

      const objectText = sourceCode.getText(callee.object);
      // BatchManager takes a single descriptor object, so its arguments are
      // genuinely restructured rather than extended.
      if (objectText.includes('batchManager')) {
        if (args.length < 2) {
          return null;
        }
        // This branch is the one rewrite that cannot edit the call in place: it
        // rebuilds the argument list from the text of the pieces it keeps, so
        // anything BETWEEN those pieces is not copied anywhere. A comment
        // sitting between the two arguments is dropped that way, and a dropped
        // `eslint-disable` silently re-enables the rule it was suppressing
        // (#1877). Withholding the fix leaves the report, so the developer is
        // still told — and still restructures the call, by hand and with the
        // comment in view.
        const carried = [callee.object, args[0], args[1]];
        const dropsComment = sourceCode
          .getCommentsInside(node)
          .some(
            (comment) =>
              !carried.some(
                (span) =>
                  comment.range[0] >= span.range[0] &&
                  comment.range[1] <= span.range[1],
              ),
          );
        if (dropsComment) {
          return null;
        }
        // The descriptor is emitted across lines, so its body has to land at the
        // depth the call itself sits at. A constant indent is only ever right
        // for one call site and leaves prettier to re-indent every other one.
        const indent = indentAt(node.range[0]);
        const body = `${indent}  `;
        return [
          fixer.replaceText(
            node,
            `${objectText}.set({\n` +
              `${body}ref: ${reindentRelocated(args[0], body, sourceCode)},\n` +
              `${body}data: ${reindentRelocated(
                args[1],
                body,
                sourceCode,
              )},\n` +
              `${body}merge: true,\n` +
              `${indent}})`,
          ),
        ];
      }

      const appended = appendArguments(
        fixer,
        node,
        [MERGE_OPTION],
        'set'.length - callee.property.name.length,
      );
      if (!appended) {
        return null;
      }
      return [fixer.replaceText(callee.property, 'set'), ...appended];
    }

    /**
     * The source the removal planner reads, with the comments inside a
     * declaration hidden from it.
     *
     * `planImportBindingRemoval` declines outright on any comment inside the
     * declaration it is asked to edit, because the ranges it computes span
     * separators and a comment nested among the entries would be swallowed. That
     * decline is not available here. By the time a removal is planned the
     * rewrite has already stripped the binding's last reference, so declining
     * the removal alone leaves `updateDoc` bound to nothing — and declining the
     * WHOLE fix lets a comment decide whether the rewrite fires at all, which is
     * a comment changing the transform just the same (#1877).
     *
     * The planner is therefore asked for the ranges as if the declaration
     * carried no comments, and {@link carriedText} re-emits every comment those
     * ranges cover in place of the text they delete. Only `getCommentsInside` is
     * blinded: `getCommentsBefore` still answers for the directive that binds a
     * whole statement, which is the one shape no re-emission can save.
     */
    const removalSource = {
      text: sourceCode.text,
      ast: sourceCode.ast,
      scopeManager: sourceCode.scopeManager,
      getTokenBefore: sourceCode.getTokenBefore.bind(sourceCode),
      getTokenAfter: sourceCode.getTokenAfter.bind(sourceCode),
      getCommentsBefore: sourceCode.getCommentsBefore.bind(sourceCode),
      getCommentsInside: () => [],
    } as unknown as ImportRemovalSource;

    /** The indentation of the line `offset` sits on, for a carried line break. */
    function indentAt(offset: number): string {
      const lineStart = sourceCode.text.lastIndexOf('\n', offset - 1) + 1;
      const prefix = sourceCode.text.slice(lineStart, offset);
      const [indent] = /^[ \t]*/.exec(prefix) ?? [''];
      return indent;
    }

    /**
     * What a removal range is replaced with: nothing, or the comments it covers
     * re-emitted so the deletion carries them instead of dropping them. `null`
     * withholds the fix, for a comment whose meaning is its position.
     *
     * The separators around the carried run are chosen from the text on either
     * side rather than added unconditionally, so a range that already sits
     * between whitespace does not gain any. A trailing line break is mandatory
     * where the last comment is a line comment or the range consumed its own
     * newline: without one the surviving code moves onto the comment's line and
     * is commented out.
     */
    function carriedText(range: TextRange): string | null {
      const comments = sourceCode
        .getAllComments()
        .filter(
          (comment) =>
            comment.range[0] >= range[0] && comment.range[1] <= range[1],
        );
      if (comments.length === 0) {
        return '';
      }
      if (comments.some(isPositionalDirective)) {
        return null;
      }

      const indent = indentAt(range[0]);
      const segments = comments.map((comment) => ({
        text: sourceCode.text.slice(comment.range[0], comment.range[1]),
        breakAfter: requiresLineBreakAfter(comment),
      }));
      const body = joinSegmentBody(segments, indent);

      const before = range[0] > 0 ? sourceCode.text[range[0] - 1] : '';
      const after = sourceCode.text[range[1]] ?? '';
      const lead = before === '' || /\s/.test(before) ? '' : ' ';
      const trail =
        segments[segments.length - 1].breakAfter ||
        sourceCode.text.slice(range[0], range[1]).endsWith('\n')
          ? `\n${indent}`
          : after === '' || /\s/.test(after)
          ? ''
          : ' ';
      return `${lead}${body}${trail}`;
    }

    /**
     * The edits that unbind whatever `removed` leaves referenced by nothing, or
     * `null` when no such edit is provably safe — in which case the caller drops
     * its whole fix, since a rewrite that strips a binding's last use while
     * leaving the binding behind trades this report for an unused-variable one
     * the consumer's build fails on (#1901).
     *
     * `removed` is the set of reference ranges ONE fix rewrites. Everything else
     * — which bindings that strands, whether a specifier or a whole declaration
     * has to go, whether the name still occurs where scope analysis says it
     * should not — is the shared planner's answer, including the destructured
     * property that binds a `await import('firebase/firestore')` entry.
     */
    function planRetirement(
      fixer: TSESLint.RuleFixer,
      removed: readonly TextRange[],
    ): TSESLint.RuleFix[] | null {
      const ranges = planOrphanedBindingRemoval(
        removalSource,
        removed,
        (variables, planned) =>
          planPatternBindingRemoval(removalSource, variables, planned),
      );
      if (!ranges || ranges.length === 0) {
        return null;
      }

      const fixes: TSESLint.RuleFix[] = [];
      for (const range of ranges) {
        const carried = carriedText(range);
        if (carried === null) {
          return null;
        }
        fixes.push(fixer.replaceTextRange([range[0], range[1]], carried));
      }
      return fixes;
    }

    type UpdateRewrite = {
      identifier: TSESTree.Identifier;
      call: TSESTree.CallExpression;
    };

    /**
     * Every call this pass would rewrite, when together they account for the
     * WHOLE of `variable` — otherwise `null`, because the binding survives and
     * nothing may be removed.
     *
     * The batch exists because retirement is not a per-report question. Two
     * violations sharing one import each strip one reference, and only after
     * both land is the binding unreferenced; a report that removed the specifier
     * on its own would strand whichever sibling fix a multi-rule `--fix` drops.
     * Collecting the calls lets ONE report own the import edit and every rewrite
     * that justifies it, which ESLint applies whole or not at all.
     *
     * A reference the rule would not rewrite — read as a value, suppressed by an
     * inline directive, spread arguments, a `setDoc` meaning something else at
     * that site — keeps the binding alive and is answered `null` rather than
     * quietly excluded.
     */
    function retiringRewrites(
      variable: TSESLint.Scope.Variable,
      callee: TSESTree.Identifier,
      setDocVariable: TSESLint.Scope.Variable | null,
    ): UpdateRewrite[] | null {
      const rewrites: UpdateRewrite[] = [];

      for (const reference of variable.references) {
        const identifier = reference.identifier as TSESTree.Identifier;
        // A destructured `const { updateDoc } = await import(…)` records the
        // declaration writing to its own binding. That write is not a use, and
        // counting it as one would make orphanhood depend on how the binding was
        // SPELLED — `orphanedBindings` discounts it for the same reason.
        if (
          reference.init === true &&
          variable.identifiers.some((declared) => declared === identifier)
        ) {
          continue;
        }
        const call = identifier.parent;
        if (
          !reference.isRead() ||
          call?.type !== AST_NODE_TYPES.CallExpression ||
          call.callee !== identifier
        ) {
          return null;
        }
        const lastArgument = call.arguments[call.arguments.length - 1];
        if (!lastArgument || hasSpreadArgument(call)) {
          return null;
        }
        if (isReportSuppressed(call)) {
          return null;
        }
        // `setDoc` has to mean the same thing at every site the batch rewrites,
        // and the batch is planned from one site's resolution.
        if (
          ASTHelpers.findVariableInScope(reference.from, SET_DOC) !==
          setDocVariable
        ) {
          return null;
        }
        rewrites.push({ identifier, call });
      }

      // The reporting call has to be among them, or scope analysis did not link
      // the reference this fix is about to rewrite — in which case its ranges
      // account for nothing and the binding must be left alone.
      if (!rewrites.some((rewrite) => rewrite.identifier === callee)) {
        return null;
      }

      // ESLint merges one report's fixes into a single span and refuses
      // overlapping edits within it, so a call nested inside another cannot ride
      // in the same batch.
      const ordered = [...rewrites].sort(
        (left, right) => left.call.range[0] - right.call.range[0],
      );
      const overlaps = ordered.some(
        (rewrite, index) =>
          index > 0 && rewrite.call.range[0] < ordered[index - 1].call.range[1],
      );
      return overlaps ? null : rewrites;
    }

    /**
     * `updateDoc(ref, data)` → `setDoc(ref, data, { merge: true })`, or `null`
     * where the argument list cannot be extended. No state is touched on the
     * way to that answer: the caller marks the call batched only once every
     * edit riding in the same fix is known to land, since a call marked by a
     * fix that never ships would make its own report decline too.
     */
    function rewriteCall(
      fixer: TSESLint.RuleFixer,
      rewrite: UpdateRewrite,
    ): TSESLint.RuleFix[] | null {
      // `setDoc` takes the document data between the reference and the
      // options, so a call that passed no data gets an empty object to merge.
      const appended = appendArguments(
        fixer,
        rewrite.call,
        rewrite.call.arguments.length > 1
          ? [MERGE_OPTION]
          : [EMPTY_DATA, MERGE_OPTION],
        SET_DOC.length - rewrite.identifier.name.length,
      );
      if (!appended) {
        return null;
      }
      return [fixer.replaceText(rewrite.identifier, SET_DOC), ...appended];
    }

    /**
     * `updateDoc(ref, data)` becomes `setDoc(ref, data, { merge: true })`, which
     * only works if `setDoc` is bound. The import edit and the call rewrites ship
     * as one fix array: they sit in disjoint ranges, and a multi-rule `--fix`
     * that applied one without the other would leave the file with an unbound
     * name, or with a binding nothing reads.
     */
    function fixUpdateDocCall(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.CallExpression,
      callee: TSESTree.Identifier,
    ): TSESLint.RuleFix[] | null {
      if (isReportSuppressed(node)) {
        return null;
      }
      // An earlier report's fix already rewrites this call, and ESLint refuses
      // two overlapping edits.
      if (batchedCalls.has(node)) {
        return null;
      }

      const lastArgument = node.arguments[node.arguments.length - 1];
      if (!lastArgument || hasSpreadArgument(node)) {
        return null;
      }

      const scope = ASTHelpers.getScope(context, node);
      const updateVariable = ASTHelpers.findVariableInScope(scope, callee.name);
      if (!updateVariable || updateVariable.defs.length !== 1) {
        return null;
      }
      const updateBinding = firestoreBindingOf(updateVariable.defs[0]);
      if (!updateBinding || updateBinding.imported !== UPDATE_DOC) {
        return null;
      }

      // A `setDoc` that means something else makes both halves of the edit
      // wrong: an added import collides with the declaration (TS2440/TS2300),
      // and a narrower-scope shadow rebinds the emitted call to the local value
      // with no diagnostic at all. Resolving from the call's own scope chain
      // catches both, and declining before the binding is scheduled leaves the
      // carrier slot to a violation whose scope is safe.
      const setDocVariable = ASTHelpers.findVariableInScope(scope, SET_DOC);
      if (
        setDocVariable &&
        !bindsFirestoreExport(setDocVariable, SET_DOC, updateBinding.module)
      ) {
        return null;
      }

      // Rewriting every reference to `updateDoc` frees its binding site, and the
      // binding then has to go in the SAME fix: leaving it behind turns a file
      // that lints clean into one failing `no-unused-vars` and `noUnusedLocals`,
      // with this report resolved so nothing re-reports the debt (#1901).
      const rewrites = retiringRewrites(updateVariable, callee, setDocVariable);
      if (!rewrites) {
        // A reference survives the pass, so the name stays bound and `setDoc` is
        // added alongside it. Only the first surviving violation carries the
        // binding; the rest emit the call against it. The call rewrite is asked
        // for FIRST: a declined rewrite must leave the binding plan untouched,
        // or a later violation would trust an import this fix never emitted.
        const callFixes = rewriteCall(fixer, {
          identifier: callee,
          call: node,
        });
        if (!callFixes) {
          return null;
        }
        const fixes: TSESLint.RuleFix[] = [];
        if (!setDocVariable && !plannedSetDocBinding) {
          fixes.push(fixer.insertTextAfter(updateBinding.node, `, ${SET_DOC}`));
          plannedSetDocBinding = true;
        }
        batchedCalls.add(node);
        fixes.push(...callFixes);
        return fixes;
      }

      // One call whose tail cannot be extended declines the WHOLE batch, before
      // any flag records it as handled: a partial batch would retire an import
      // some call still reads, and a call marked batched by a fix that never
      // shipped would silently lose its own report's fix as well.
      const rewriteFixes: TSESLint.RuleFix[] = [];
      for (const rewrite of rewrites) {
        const callFixes = rewriteCall(fixer, rewrite);
        if (!callFixes) {
          return null;
        }
        rewriteFixes.push(...callFixes);
      }

      const fixes: TSESLint.RuleFix[] = [];
      if (setDocVariable) {
        // The name is already bound to firestore's own `setDoc`, so the entry
        // that becomes redundant is removed rather than renamed.
        const retirement = planRetirement(
          fixer,
          rewrites.map((rewrite) => rewrite.identifier.range),
        );
        if (!retirement) {
          return null;
        }
        fixes.push(...retirement);
      } else {
        // A second `updateDoc` binding under another local name would already
        // have claimed the `setDoc` entry; emitting a second one collides with
        // it (TS2300).
        if (plannedSetDocBinding) {
          return null;
        }
        // The entry is renamed in place, so an alias disappears together with
        // the references that used it.
        fixes.push(fixer.replaceText(updateBinding.node, SET_DOC));
        plannedSetDocBinding = true;
      }

      for (const rewrite of rewrites) {
        batchedCalls.add(rewrite.call);
      }
      fixes.push(...rewriteFixes);
      return fixes;
    }

    return {
      ImportDeclaration(node): void {
        if (FIRESTORE_MODULES.has(node.source.value)) {
          node.specifiers.forEach((specifier) => {
            if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
              if (specifier.imported.name === UPDATE_DOC) {
                updateAliases.add(specifier.local.name);
              }
            }
          });
        }
      },

      VariableDeclarator(node): void {
        if (!isFirestoreDynamicImport(node.init)) {
          return;
        }
        // Handle destructured imports
        if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
          node.id.properties.forEach((prop) => {
            if (
              prop.type === AST_NODE_TYPES.Property &&
              prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === UPDATE_DOC &&
              prop.value.type === AST_NODE_TYPES.Identifier
            ) {
              updateAliases.add(prop.value.name);
            }
          });
        }
      },

      CallExpression(node): void {
        if (!isFirestoreUpdateCall(node)) {
          return;
        }
        context.report({
          node,
          messageId: 'preferSetMerge',
          fix(fixer) {
            if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
              return fixUpdateMethod(fixer, node, node.callee);
            }
            if (node.callee.type === AST_NODE_TYPES.Identifier) {
              return fixUpdateDocCall(fixer, node, node.callee);
            }
            return null;
          },
        });
      },
    };
  },
});
