import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  bindingUses,
  ImportRemovalSource,
  planOrphanedBindingRemoval,
  TextRange,
} from '../utils/importRemoval';
import { planTypeDeclarationRemoval } from '../utils/typeDeclarationRemoval';
import {
  joinSegmentBody,
  requiresLineBreakAfter,
  requiresOwnLine,
} from '../utils/replacementSegments';
import {
  BOUND_UNPROVABLE,
  declarationOf,
  resolveNameInEnclosingScopes,
  statementsOf,
} from '../utils/lexicalScope';
import { declaresResourceHandleResult } from '../utils/resourceHandleType';
import {
  arrowAnnotationGap,
  Edit,
  indentAt,
  isDisjoint,
  isPositionalDirective,
  planArrowAnnotationEdits,
} from '../utils/arrowAnnotationGap';

type MessageIds =
  | 'noExplicitReturnTypeInferable'
  | 'noExplicitReturnTypeNonInferable';

type Options = [
  {
    allowRecursiveFunctions?: boolean;
    allowOverloadedFunctions?: boolean;
    allowInterfaceMethodSignatures?: boolean;
    allowAbstractMethodSignatures?: boolean;
    allowDtsFiles?: boolean;
    allowFirestoreFunctionFiles?: boolean;
    allowVoidReturnTypes?: boolean;
  },
];

const defaultOptions: Options[0] = {
  allowRecursiveFunctions: true,
  allowOverloadedFunctions: true,
  allowInterfaceMethodSignatures: true,
  allowAbstractMethodSignatures: true,
  allowDtsFiles: true,
  allowFirestoreFunctionFiles: true,
  allowVoidReturnTypes: true,
};

function getNameFromIdentifierOrLiteral(
  key: TSESTree.Identifier | TSESTree.Literal,
): string | undefined {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }

  if (typeof key.value === 'string') {
    return key.value;
  }

  return undefined;
}

type ClassMethodDefinition =
  | TSESTree.MethodDefinition
  | TSESTree.TSAbstractMethodDefinition;

function describeClassMethod(node: ClassMethodDefinition): string {
  if (
    !node.computed &&
    (node.key.type === AST_NODE_TYPES.Identifier ||
      (node.key.type === AST_NODE_TYPES.Literal &&
        typeof node.key.value === 'string'))
  ) {
    const name = getNameFromIdentifierOrLiteral(node.key);
    if (name) {
      return `class method "${name}"`;
    }
  }

  return 'class method';
}

function describeMethodSignature(node: TSESTree.TSMethodSignature): string {
  // A method signature is equally non-inferable in either container, but naming
  // the wrong one sends the reader looking for an `interface` keyword that the
  // source does not contain.
  const kind =
    node.parent?.type === AST_NODE_TYPES.TSTypeLiteral
      ? 'type literal method'
      : 'interface method';

  if (
    !node.computed &&
    (node.key.type === AST_NODE_TYPES.Identifier ||
      (node.key.type === AST_NODE_TYPES.Literal &&
        typeof node.key.value === 'string'))
  ) {
    const name = getNameFromIdentifierOrLiteral(node.key);
    if (name) {
      return `${kind} "${name}"`;
    }
  }

  return kind;
}

function describeFunctionDeclaration(
  node: TSESTree.FunctionDeclaration,
): string {
  if (node.id?.name) {
    return `function "${node.id.name}"`;
  }

  return 'function';
}

function describeTSDeclareFunction(node: TSESTree.TSDeclareFunction): string {
  if (node.id?.name) {
    return `function "${node.id.name}"`;
  }

  return 'function';
}

function describeFunctionExpression(node: TSESTree.FunctionExpression): string {
  if (node.id?.name) {
    return `function "${node.id.name}"`;
  }

  if (
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return `function "${node.parent.id.name}"`;
  }

  if (
    node.parent?.type === AST_NODE_TYPES.Property &&
    !node.parent.computed &&
    (node.parent.key.type === AST_NODE_TYPES.Identifier ||
      (node.parent.key.type === AST_NODE_TYPES.Literal &&
        typeof node.parent.key.value === 'string'))
  ) {
    const name = getNameFromIdentifierOrLiteral(node.parent.key);
    if (name) {
      return `object method "${name}"`;
    }
  }

  return 'function expression';
}

function describeArrowFunction(node: TSESTree.ArrowFunctionExpression): string {
  if (
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return `arrow function "${node.parent.id.name}"`;
  }

  return 'arrow function';
}

function describeFunctionKind(node: TSESTree.Node): string {
  switch (node.type) {
    case AST_NODE_TYPES.MethodDefinition:
      return describeClassMethod(node);
    case AST_NODE_TYPES.TSAbstractMethodDefinition:
      return describeClassMethod(node);
    case AST_NODE_TYPES.TSMethodSignature:
      return describeMethodSignature(node);
    case AST_NODE_TYPES.TSDeclareFunction:
      return describeTSDeclareFunction(node);
    case AST_NODE_TYPES.FunctionDeclaration:
      return describeFunctionDeclaration(node);
    case AST_NODE_TYPES.FunctionExpression:
      return describeFunctionExpression(node);
    case AST_NODE_TYPES.ArrowFunctionExpression:
      return describeArrowFunction(node);
    default:
      return 'function';
  }
}

function isRecursiveFunction(node: TSESTree.FunctionLike): boolean {
  const functionName =
    node.type === AST_NODE_TYPES.FunctionDeclaration
      ? node.id?.name
      : node.type === AST_NODE_TYPES.FunctionExpression && node.id
      ? node.id.name
      : undefined;

  if (!functionName || !node.body) return false;

  let hasRecursiveCall = false;
  function checkNode(node: TSESTree.Node): void {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === functionName
    ) {
      hasRecursiveCall = true;
      return;
    }

    // Only traverse specific node types to avoid circular references
    if (node.type === AST_NODE_TYPES.BlockStatement) {
      node.body.forEach(checkNode);
    } else if (node.type === AST_NODE_TYPES.ExpressionStatement) {
      checkNode(node.expression);
    } else if (node.type === AST_NODE_TYPES.CallExpression) {
      checkNode(node.callee);
      node.arguments.forEach(checkNode);
    } else if (node.type === AST_NODE_TYPES.BinaryExpression) {
      checkNode(node.left);
      checkNode(node.right);
    } else if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) {
      checkNode(node.argument);
    } else if (node.type === AST_NODE_TYPES.IfStatement) {
      checkNode(node.test);
      checkNode(node.consequent);
      if (node.alternate) {
        checkNode(node.alternate);
      }
    }
  }

  checkNode(node.body);
  return hasRecursiveCall;
}

type VisitorKeys = Readonly<Record<string, readonly string[]>>;

type FunctionWithBody =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

/**
 * A name under which a function can refer to itself. `identifier` covers bare
 * bindings (`buildQuery(...)`), `member` covers names reachable only through an
 * owner (`this.build()`, `api.build()`, `Registry.build()`).
 */
type SelfReference =
  | { kind: 'identifier'; name: string }
  | { kind: 'member'; name: string; owners: ReadonlySet<string> };

const THIS_OWNER = 'this';

const FUNCTION_NODE_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

function pushChildren(
  node: TSESTree.Node,
  visitorKeys: VisitorKeys,
  stack: TSESTree.Node[],
): void {
  for (const key of visitorKeys[node.type] ?? []) {
    const value = (node as unknown as Record<string, unknown>)[key];
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (child && typeof child === 'object' && 'type' in child) {
        stack.push(child as TSESTree.Node);
      }
    }
  }
}

/**
 * Return expressions belonging to `fn` itself: the concise arrow body, or the
 * arguments of every `return` whose nearest enclosing function is `fn`.
 * Returns of nested functions belong to those functions, not to `fn`.
 */
function collectOwnReturnExpressions(
  fn: FunctionWithBody,
  visitorKeys: VisitorKeys,
): TSESTree.Node[] {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [fn.body];
  }

  const returnExpressions: TSESTree.Node[] = [];
  const stack: TSESTree.Node[] = [...fn.body.body];

  while (stack.length > 0) {
    const current = stack.pop() as TSESTree.Node;

    if (FUNCTION_NODE_TYPES.has(current.type)) continue;

    if (current.type === AST_NODE_TYPES.ReturnStatement) {
      if (current.argument) {
        returnExpressions.push(current.argument);
      }
      continue;
    }

    pushChildren(current, visitorKeys, stack);
  }

  return returnExpressions;
}

/**
 * Identifiers that name something (object keys, member property names) are not
 * references to the binding of the same name.
 */
function isReferencePosition(node: TSESTree.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return true;

  if (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    !parent.computed &&
    parent.property === node
  ) {
    return false;
  }

  if (
    (parent.type === AST_NODE_TYPES.Property ||
      parent.type === AST_NODE_TYPES.PropertyDefinition ||
      parent.type === AST_NODE_TYPES.MethodDefinition) &&
    !parent.computed &&
    parent.key === node
  ) {
    return false;
  }

  return true;
}

function ownerMatches(
  object: TSESTree.Node,
  owners: ReadonlySet<string>,
): boolean {
  if (object.type === AST_NODE_TYPES.ThisExpression) {
    return owners.has(THIS_OWNER);
  }

  if (object.type === AST_NODE_TYPES.Identifier) {
    return owners.has(object.name);
  }

  return false;
}

/**
 * Searches a whole expression subtree, nested functions included. A closure in
 * the returned value is part of the return type, so a self-reference inside it
 * can be what defeats inference: `return { orderBy: () => buildQuery(p) }
 * satisfies FakeQuery` is TS7023. Whether TypeScript manages to break such a
 * cycle depends on type information this rule does not have, so every reference
 * in a return expression counts — erring toward silence, per the repo's
 * preference for false negatives over false positives.
 */
function subtreeReferences(
  root: TSESTree.Node,
  selfReferences: readonly SelfReference[],
  visitorKeys: VisitorKeys,
): boolean {
  const stack: TSESTree.Node[] = [root];

  while (stack.length > 0) {
    const current = stack.pop() as TSESTree.Node;

    if (
      current.type === AST_NODE_TYPES.Identifier &&
      isReferencePosition(current) &&
      selfReferences.some(
        (reference) =>
          reference.kind === 'identifier' && reference.name === current.name,
      )
    ) {
      return true;
    }

    if (
      current.type === AST_NODE_TYPES.MemberExpression &&
      !current.computed &&
      current.property.type === AST_NODE_TYPES.Identifier
    ) {
      const propertyName = current.property.name;
      const matchesMember = selfReferences.some(
        (reference) =>
          reference.kind === 'member' &&
          reference.name === propertyName &&
          ownerMatches(current.object, reference.owners),
      );
      if (matchesMember) return true;
    }

    pushChildren(current, visitorKeys, stack);
  }

  return false;
}

function ownerNamesOfObjectExpression(
  objectExpression: TSESTree.Node,
): Set<string> {
  const owners = new Set<string>([THIS_OWNER]);

  const parent = objectExpression.parent;
  if (
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    owners.add(parent.id.name);
  }

  return owners;
}

function ownerNamesOfClassMember(member: TSESTree.Node): Set<string> {
  const owners = new Set<string>([THIS_OWNER]);

  const classBody = member.parent;
  const classNode = classBody?.parent;

  if (
    classNode?.type === AST_NODE_TYPES.ClassDeclaration ||
    classNode?.type === AST_NODE_TYPES.ClassExpression
  ) {
    if (classNode.id) {
      owners.add(classNode.id.name);
    }

    // A class expression assigned to a binding is also reachable by that name.
    if (
      classNode.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
      classNode.parent.id.type === AST_NODE_TYPES.Identifier
    ) {
      owners.add(classNode.parent.id.name);
    }
  }

  return owners;
}

function keyName(
  node: TSESTree.Node & { key: TSESTree.Node; computed: boolean },
): string | undefined {
  if (node.computed) return undefined;

  if (
    node.key.type === AST_NODE_TYPES.Identifier ||
    (node.key.type === AST_NODE_TYPES.Literal &&
      typeof node.key.value === 'string')
  ) {
    return getNameFromIdentifierOrLiteral(
      node.key as TSESTree.Identifier | TSESTree.Literal,
    );
  }

  return undefined;
}

/**
 * Every name by which the function can reach itself. A function with no
 * resolvable name cannot be self-referential by name, so it yields none.
 */
function resolveSelfReferences(node: TSESTree.Node): SelfReference[] {
  const selfReferences: SelfReference[] = [];

  if (node.type === AST_NODE_TYPES.MethodDefinition) {
    const name = keyName(node);
    if (name) {
      selfReferences.push({
        kind: 'member',
        name,
        owners: ownerNamesOfClassMember(node),
      });
    }
    return selfReferences;
  }

  if (
    (node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression) &&
    node.id
  ) {
    selfReferences.push({ kind: 'identifier', name: node.id.name });
  }

  const parent = node.parent;

  if (
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    selfReferences.push({ kind: 'identifier', name: parent.id.name });
  }

  if (parent?.type === AST_NODE_TYPES.Property) {
    const name = keyName(parent);
    if (name) {
      selfReferences.push({
        kind: 'member',
        name,
        owners: ownerNamesOfObjectExpression(parent.parent as TSESTree.Node),
      });
    }
  }

  if (parent?.type === AST_NODE_TYPES.PropertyDefinition) {
    const name = keyName(parent);
    if (name) {
      selfReferences.push({
        kind: 'member',
        name,
        owners: ownerNamesOfClassMember(parent),
      });
    }
  }

  if (parent?.type === AST_NODE_TYPES.AssignmentExpression) {
    const target = parent.left;
    if (target.type === AST_NODE_TYPES.Identifier) {
      selfReferences.push({ kind: 'identifier', name: target.name });
    } else if (
      target.type === AST_NODE_TYPES.MemberExpression &&
      !target.computed &&
      target.property.type === AST_NODE_TYPES.Identifier
    ) {
      const owners = new Set<string>();
      if (target.object.type === AST_NODE_TYPES.ThisExpression) {
        owners.add(THIS_OWNER);
      } else if (target.object.type === AST_NODE_TYPES.Identifier) {
        owners.add(target.object.name);
      }
      if (owners.size > 0) {
        selfReferences.push({
          kind: 'member',
          name: target.property.name,
          owners,
        });
      }
    }
  }

  return selfReferences;
}

function bodyOf(node: TSESTree.Node): FunctionWithBody | undefined {
  if (node.type === AST_NODE_TYPES.MethodDefinition) {
    return node.value.body ? node.value : undefined;
  }

  if (
    (node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression) &&
    node.body
  ) {
    return node;
  }

  if (node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return node;
  }

  return undefined;
}

/** Bare identifiers referenced from a function's own return expressions. */
function collectReturnIdentifierNames(
  fn: FunctionWithBody,
  visitorKeys: VisitorKeys,
): Set<string> {
  const names = new Set<string>();

  for (const returnExpression of collectOwnReturnExpressions(fn, visitorKeys)) {
    const stack: TSESTree.Node[] = [returnExpression];
    while (stack.length > 0) {
      const current = stack.pop() as TSESTree.Node;
      if (
        current.type === AST_NODE_TYPES.Identifier &&
        isReferencePosition(current)
      ) {
        names.add(current.name);
      }
      pushChildren(current, visitorKeys, stack);
    }
  }

  return names;
}

/**
 * What a statement list binds each of its names to: the function when the name
 * denotes one, `null` when it denotes anything else.
 *
 * A non-function binding is recorded rather than skipped because it still
 * shadows a same-named function in an enclosing scope, and a reference resolving
 * to it reaches no function at all.
 */
function scopeBindings(
  statements: readonly TSESTree.Node[],
): Map<string, FunctionWithBody | null> {
  const bindings = new Map<string, FunctionWithBody | null>();

  const bind = (name: string, fn: FunctionWithBody | null): void => {
    if (!bindings.has(name)) {
      bindings.set(name, fn);
    }
  };

  for (const rawStatement of statements) {
    // `export function f() {}` is the same declaration one AST node deeper, and
    // the `export` keyword alone cannot decide whether a name is resolvable.
    const statement = declarationOf(rawStatement);

    if (statement.type === AST_NODE_TYPES.FunctionDeclaration && statement.id) {
      bind(statement.id.name, statement.body ? statement : null);
      continue;
    }

    if (statement.type === AST_NODE_TYPES.ClassDeclaration && statement.id) {
      bind(statement.id.name, null);
      continue;
    }

    if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
      for (const specifier of statement.specifiers) {
        bind(specifier.local.name, null);
      }
      continue;
    }

    if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        if (declarator.id.type !== AST_NODE_TYPES.Identifier) continue;

        const init = declarator.init;
        const isFunction =
          init &&
          (init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            (init.type === AST_NODE_TYPES.FunctionExpression && init.body));
        bind(
          declarator.id.name,
          isFunction ? (init as FunctionWithBody) : null,
        );
      }
    }
  }

  return bindings;
}

/**
 * Walks the graph whose nodes are functions and whose edges run from a function
 * to each function it names in its own return expressions. A cycle through that
 * graph is mutual recursion, which triggers the same TS7023 as direct
 * self-reference.
 *
 * Each edge is resolved from the referencing function's own body outward
 * through every enclosing statement container, innermost first, so the nearest
 * declaration shadows a same-named outer one — the resolution TypeScript itself
 * performs. That keeps the graph honest in both directions: two same-named
 * functions in sibling scopes cannot see each other and so never link, while a
 * cycle crossing a scope boundary — an inner function returning a call to the
 * enclosing one that returns it — still does.
 *
 * A function declared in a function body, a bare block, a `namespace` or a
 * `switch` case binds its name just as effectively as a top-level one. Reading
 * only `Program.body` left every one of those unresolvable, which killed this
 * carve-out for any pair not written at the top level (#1771) — and since the
 * fixer DELETES the annotation, the resulting report shipped code that does not
 * compile.
 *
 * Every statement of a container is searched rather than only those preceding
 * the reference, matching the hoisting that makes a mutually recursive pair
 * legal in the first place.
 *
 * Bindings and edges are memoised per node: a file's annotations are walked one
 * at a time, each walk re-reads the same enclosing containers, and a cycle is
 * traversed once per member.
 */
function createReturnCycleResolver(visitorKeys: VisitorKeys) {
  const edges = new Map<FunctionWithBody, FunctionWithBody[]>();
  const bindings = new Map<
    TSESTree.Node,
    Map<string, FunctionWithBody | null>
  >();

  const bindingsOf = (
    container: TSESTree.Node,
    statements: readonly TSESTree.Node[],
  ): Map<string, FunctionWithBody | null> => {
    const cached = bindings.get(container);
    if (cached) return cached;

    const computed = scopeBindings(statements);
    bindings.set(container, computed);
    return computed;
  };

  const resolveFunctionInScope = (
    from: TSESTree.Node,
    name: string,
  ): FunctionWithBody | undefined =>
    resolveNameInEnclosingScopes<FunctionWithBody>(
      from,
      name,
      'value',
      (statements, container) => {
        const scope = bindingsOf(container, statements);
        if (!scope.has(name)) return undefined;
        // A non-function binding still shadows a same-named outer function, so
        // it ends the search without yielding one.
        return scope.get(name) ?? BOUND_UNPROVABLE;
      },
    );

  const edgesOf = (fn: FunctionWithBody): FunctionWithBody[] => {
    const cached = edges.get(fn);
    if (cached) return cached;

    const resolved: FunctionWithBody[] = [];
    for (const name of collectReturnIdentifierNames(fn, visitorKeys)) {
      const target = resolveFunctionInScope(fn.body, name);
      if (target) {
        resolved.push(target);
      }
    }
    edges.set(fn, resolved);
    return resolved;
  };

  return function participatesInReturnCycle(fn: FunctionWithBody): boolean {
    const seen = new Set<FunctionWithBody>();
    const stack = [...edgesOf(fn)];

    while (stack.length > 0) {
      const current = stack.pop() as FunctionWithBody;
      if (current === fn) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...edgesOf(current));
    }

    return false;
  };
}

/**
 * The sibling members of a method signature's container. An interface body and a
 * type literal declare exactly the same members — `interface X { f(): void }` and
 * `type X = { f(): void }` differ only in the keyword that introduces them, and
 * `prefer-type-over-interface` (also fixable, also in the recommended config)
 * rewrites the first into the second. A member's inferability cannot depend on
 * which keyword declared its container, so both are read here.
 */
function signatureContainerMembers(
  container: TSESTree.Node | undefined,
): TSESTree.TypeElement[] | undefined {
  if (container?.type === AST_NODE_TYPES.TSInterfaceBody) {
    return container.body;
  }

  if (container?.type === AST_NODE_TYPES.TSTypeLiteral) {
    return container.members;
  }

  return undefined;
}

function isOverloadedFunction(node: TSESTree.Node): boolean {
  if (!node.parent) return false;

  if (node.type === AST_NODE_TYPES.TSMethodSignature) {
    const members = signatureContainerMembers(node.parent);
    if (!members) return false;

    if (node.computed) return false;

    const methodName =
      node.key.type === AST_NODE_TYPES.Identifier ||
      node.key.type === AST_NODE_TYPES.Literal
        ? getNameFromIdentifierOrLiteral(node.key)
        : undefined;
    if (!methodName) return false;

    return (
      members.filter(
        (member) =>
          member.type === AST_NODE_TYPES.TSMethodSignature &&
          !member.computed &&
          (member.key.type === AST_NODE_TYPES.Identifier ||
            member.key.type === AST_NODE_TYPES.Literal) &&
          getNameFromIdentifierOrLiteral(member.key) === methodName,
      ).length > 1
    );
  }

  return false;
}

/**
 * The statement list that directly holds `node`, looking through `export`.
 *
 * Overload signatures and their implementation are siblings of one statement
 * list — an overload set cannot span containers — so this is the only list worth
 * reading. Walking outward instead would let a same-named function in an
 * enclosing scope answer for one it cannot overload.
 */
function siblingStatementsOf(
  node: TSESTree.Node,
): readonly TSESTree.Node[] | undefined {
  const parent = node.parent;
  if (!parent) return undefined;

  const container =
    parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    parent.type === AST_NODE_TYPES.ExportDefaultDeclaration
      ? parent.parent
      : parent;

  return container ? statementsOf(container) : undefined;
}

type OverloadSet = { signatures: number; implementations: number };

const EMPTY_OVERLOAD_SET: OverloadSet = { signatures: 0, implementations: 0 };

/**
 * How many declaration-only signatures and how many implementations the
 * container holding `node` declares under `node`'s own name, `node` included.
 *
 * Every statement container is read, not just `Program` and `TSModuleBlock`: a
 * function body, a bare block and a `switch` case each bind a name just as
 * effectively, so reading only the top level makes the DEPTH of an overload set
 * decide whether it exists (the same defect as #1771).
 */
function overloadSetOf(
  node: TSESTree.FunctionDeclaration | TSESTree.TSDeclareFunction,
): OverloadSet {
  const functionName = node.id?.name;
  if (!functionName) return EMPTY_OVERLOAD_SET;

  const statements = siblingStatementsOf(node);
  if (!statements) return EMPTY_OVERLOAD_SET;

  let signatures = 0;
  let implementations = 0;

  for (const statement of statements) {
    // `export function f(...)` is the same declaration one AST node deeper, and
    // an overload set may export some of its members and not others.
    const declaration = declarationOf(statement);

    if (
      declaration.type !== AST_NODE_TYPES.TSDeclareFunction &&
      declaration.type !== AST_NODE_TYPES.FunctionDeclaration
    ) {
      continue;
    }

    if (declaration.id?.name !== functionName) continue;

    if (
      declaration.type === AST_NODE_TYPES.TSDeclareFunction ||
      !declaration.body
    ) {
      signatures += 1;
    } else {
      implementations += 1;
    }
  }

  return { signatures, implementations };
}

/**
 * True when `node` is the IMPLEMENTATION of an overload set — a function with a
 * body whose container also declares the same name as one or more
 * declaration-only signatures.
 *
 * Its annotation is not a restatement of what the body returns: TypeScript
 * checks each overload signature against the IMPLEMENTATION SIGNATURE, so the
 * annotation is what the overloads are measured against. Inference yields the
 * body's own type, which need not accept them — stripping `: void | string`
 * from `function get(param?: string): void | string {}` infers `void` and makes
 * the `: string` overload above it TS2394 (#2019).
 *
 * This carve-out ignores `allowOverloadedFunctions`. That option governs the
 * declaration-only signatures, whose annotations are mandatory but carry no
 * fixer, so reporting them costs nothing but a message. Here the report ships a
 * fix that does not compile, which no option may ask for.
 */
function isOverloadImplementation(node: TSESTree.FunctionDeclaration): boolean {
  if (!node.body) return false;
  return overloadSetOf(node).signatures > 0;
}

/**
 * True when `node` is a declaration-only signature that belongs to an overload
 * set: another signature declares the same name, or an implementation below it
 * does. A lone `declare function f(): number;` overloads nothing, so it stays
 * reportable.
 */
function isOverloadedTsDeclareFunction(
  node: TSESTree.TSDeclareFunction,
): boolean {
  const { signatures, implementations } = overloadSetOf(node);
  return signatures > 1 || implementations > 0;
}

/**
 * A method's identity inside its class body. Overloads agree on all three
 * components; `static f` and `f` merely spell the same name, and a computed key
 * names nothing resolvable, so it yields nothing. The separator keeps a private
 * `#log` from colliding with a string key `'#log'`.
 */
function methodIdentityOf(node: ClassMethodDefinition): string | undefined {
  if (node.computed) return undefined;

  if (node.key.type === AST_NODE_TYPES.PrivateIdentifier) {
    return `${node.static}\u0000private\u0000${node.key.name}`;
  }

  if (
    node.key.type !== AST_NODE_TYPES.Identifier &&
    node.key.type !== AST_NODE_TYPES.Literal
  ) {
    return undefined;
  }

  const name = getNameFromIdentifierOrLiteral(node.key);
  return name === undefined
    ? undefined
    : `${node.static}\u0000public\u0000${name}`;
}

/**
 * The overload set a class method belongs to, counted over the members of its
 * own class body. A member without a body is an overload signature
 * (`TSEmptyBodyFunctionExpression`); the one member with a body is the
 * implementation.
 */
function classOverloadSetOf(node: TSESTree.MethodDefinition): OverloadSet {
  const identity = methodIdentityOf(node);
  const classBody = node.parent;
  if (!identity || classBody?.type !== AST_NODE_TYPES.ClassBody) {
    return EMPTY_OVERLOAD_SET;
  }

  let signatures = 0;
  let implementations = 0;

  for (const member of classBody.body) {
    if (member.type !== AST_NODE_TYPES.MethodDefinition) continue;
    if (methodIdentityOf(member) !== identity) continue;

    if (member.value.body) {
      implementations += 1;
    } else {
      signatures += 1;
    }
  }

  return { signatures, implementations };
}

/**
 * True when the method is the implementation of an overloaded class method, for
 * the reason {@link isOverloadImplementation} gives — a class overload set is
 * checked exactly as a function one is (#2019).
 */
function isOverloadImplementationMethod(
  node: TSESTree.MethodDefinition,
): boolean {
  if (!node.value.body) return false;
  return classOverloadSetOf(node).signatures > 0;
}

/**
 * True when the method is a declaration-only overload signature. A body-less
 * method is legal only as part of an overload set, so it is exempt whenever the
 * set holds anything else at all.
 */
function isOverloadedClassMethodSignature(
  node: TSESTree.MethodDefinition,
): boolean {
  if (node.value.body) return false;

  const { signatures, implementations } = classOverloadSetOf(node);
  return signatures > 1 || implementations > 0;
}

function isInterfaceOrAbstractMethodSignature(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.TSAbstractMethodDefinition) return true;
  if (node.type === AST_NODE_TYPES.TSMethodSignature) return true;

  if (node.type === AST_NODE_TYPES.MethodDefinition) {
    let current: TSESTree.Node | undefined = node;
    while (current) {
      if (
        current.type === AST_NODE_TYPES.ClassDeclaration &&
        current.abstract
      ) {
        return true;
      }
      current = current.parent;
    }
  }

  return false;
}

function isTypeGuardFunction(node: TSESTree.Node): boolean {
  if (!('returnType' in node) || !node.returnType) return false;

  const returnType = node.returnType;
  if (returnType.type !== AST_NODE_TYPES.TSTypeAnnotation) return false;

  const typeAnnotation = returnType.typeAnnotation;

  // Check for type predicates (is keyword)
  if (typeAnnotation.type === AST_NODE_TYPES.TSTypePredicate) return true;

  // `never` is never inferred: TypeScript infers `void` for a function whose
  // every path throws, so an explicit `: never` always carries more information
  // than inference (callers rely on it for control-flow narrowing and
  // exhaustiveness). Removing it would silently widen the type to `void`.
  if (typeAnnotation.type === AST_NODE_TYPES.TSNeverKeyword) return true;

  // Check for assertion functions (asserts keyword)
  if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
    const typeName = typeAnnotation.typeName;
    if (
      typeName.type === AST_NODE_TYPES.Identifier &&
      typeName.name === 'asserts'
    ) {
      return true;
    }
  }

  return false;
}

// The names below are the built-in TypeScript read-only wrapper types. When a
// function is annotated with one of these, the annotation is NOT redundant:
// TypeScript always infers the mutable concrete type (e.g. Set<T> not
// ReadonlySet<T>), so stripping the annotation silently changes the public
// return type and lets callers mutate internal state that the author intended
// to protect.
const READONLY_TYPE_NAMES = new Set([
  'ReadonlySet',
  'ReadonlyMap',
  'ReadonlyArray',
  'Readonly',
]);

/**
 * Returns true when `returnType` is a read-only widening annotation — i.e.
 * one that TypeScript would NOT infer on its own and whose removal therefore
 * changes the public API. Two forms are covered:
 *
 *   TSTypeReference  — ReadonlySet<T>, ReadonlyMap<K,V>, ReadonlyArray<T>,
 *                      Readonly<T>
 *   TSTypeOperator   — `readonly T[]` and `readonly [a, b]` tuples
 */
function isReadonlyWideningReturnType(
  returnType: TSESTree.TSTypeAnnotation,
): boolean {
  const typeAnnotation = returnType.typeAnnotation;

  if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
    const typeName = typeAnnotation.typeName;
    return (
      typeName.type === AST_NODE_TYPES.Identifier &&
      READONLY_TYPE_NAMES.has(typeName.name)
    );
  }

  // `readonly T[]` and `readonly [a, b]` are represented as TSTypeOperator
  // nodes with operator === 'readonly'.
  if (typeAnnotation.type === AST_NODE_TYPES.TSTypeOperator) {
    return typeAnnotation.operator === 'readonly';
  }

  return false;
}

/**
 * Returns true when the annotation declares that the function produces no
 * value: a bare `void`, or `Promise<void>` with exactly one type argument.
 *
 * The rule's case against an explicit return type is that it restates what the
 * implementation already returns and "can drift from what the implementation
 * actually returns, hiding bugs behind a stale type". That case does not reach
 * `void`/`Promise<void>`. Such an annotation is not a restatement of a result,
 * it is a declaration that there is no result, and TypeScript enforces it:
 * adding `return <expr>` to a function annotated `Promise<void>` is a compile
 * error. It cannot drift into a lie, so removing it destroys information rather
 * than removing redundancy.
 *
 * That information is load-bearing for other rules: `enforce-memoize-async`
 * reads exactly this declaration of intent and skips a method declared
 * `Promise<void>`, because caching a call that yields nothing turns a repeatable
 * side effect into a once-per-instance one. Stripping the annotation happens
 * unattended — `eslint --fix` re-lints until the output settles, so the strip
 * and the memoization that follows it land in the same run.
 *
 * The shape match stays deliberately exact, mirroring the check
 * `enforce-memoize-async` performs. A union (`Promise<void | string>`), a nested
 * wrapper (`Promise<Awaited<void>>`) or any other arity can resolve to a value,
 * so those annotations remain redundant restatements and stay reportable.
 */
function declaresVoidResult(returnType: TSESTree.TSTypeAnnotation): boolean {
  const annotation = returnType.typeAnnotation;

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
 * Returns true when the annotation declares that the function hands back a
 * RESOURCE HANDLE: an object result carrying a function-valued member, which is
 * the closure that releases whatever the call allocated.
 *
 * `declaresVoidResult` above answers the same objection for the opposite shape,
 * and the reasoning transfers verbatim. This annotation is not a restatement of
 * a result either — it is the evidence a sibling rule's correctness decision
 * rests on. `enforce-memoize-async` reads exactly this shape and declines to
 * demand `@Memoize()` on the method, because a memoized handle factory serves
 * every caller after the first the FIRST caller's live lease and the release
 * closure bound to it: N concurrent callers hold one lease between them while
 * the pool accounts for N, and whichever caller finishes first disposes a
 * resource the others still believe they own.
 *
 * Stripping the annotation therefore destroys information rather than removing
 * redundancy, and it destroys it unattended: `eslint --fix` re-lints until the
 * output settles, so the strip and the memoization it re-arms land in the same
 * run. Nothing downstream catches what that re-arms, because the failure is
 * silent and load-dependent — it needs concurrent callers to show itself, so a
 * green suite stays green and the corruption surfaces under load.
 *
 * The predicate is SHARED with the owner (`../utils/resourceHandleType`) rather
 * than restated here. A shape one rule exempts while the other strips is the
 * whole defect; a shape one rule strips while the other exempts is the same
 * defect pointing the other way, so the two cannot be allowed to drift apart.
 */
function isResourceHandleReturnType(
  returnType: TSESTree.TSTypeAnnotation,
): boolean {
  return declaresResourceHandleResult(returnType);
}

// TypeScript's built-in decorator signatures. A factory annotated with one of
// these is the one shape where the annotation is WIDER than what inference
// produces rather than a restatement of it: `MethodDecorator` accepts three
// parameters, the returned closure typically declares none, and a decoration
// site requires the declared arity. Stripping the annotation therefore turns
// every `@Factory()` use into TS1329 (#2014).
const DECORATOR_TYPE_NAMES = new Set([
  'ClassDecorator',
  'MethodDecorator',
  'ParameterDecorator',
  'PropertyDecorator',
]);

/**
 * The identifier a type name resolves to. A qualified name (`ts.MethodDecorator`)
 * denotes the type its right-most segment names, so that segment is what decides
 * — a substring test over the printed annotation would equally match
 * `MyMethodDecoratorConfig`, which is an unrelated user type.
 */
function rightmostTypeName(typeName: TSESTree.EntityName): string | undefined {
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return typeName.name;
  }

  if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
    return rightmostTypeName(typeName.right);
  }

  return undefined;
}

function namesDecoratorType(annotation: TSESTree.TypeNode): boolean {
  if (annotation.type === AST_NODE_TYPES.TSTypeReference) {
    const name = rightmostTypeName(annotation.typeName);
    return name !== undefined && DECORATOR_TYPE_NAMES.has(name);
  }

  // A factory usable in more than one position (`ClassDecorator &
  // MethodDecorator`) still owes every decoration site the declared shape.
  if (
    annotation.type === AST_NODE_TYPES.TSUnionType ||
    annotation.type === AST_NODE_TYPES.TSIntersectionType
  ) {
    return annotation.types.some(namesDecoratorType);
  }

  return false;
}

/**
 * The identifier a CALLED decorator invokes: `Log` for `@Log()` and `@Log()()`.
 *
 * Only a called decorator identifies a factory, and only a factory's return type
 * is what the decoration site consumes. A bare `@Log` names the decorator
 * itself, whose annotation restates the value it returns exactly as inference
 * would — so it stays reportable rather than being silenced by proximity to a
 * decorator.
 *
 * An owner-qualified decorator (`@registry.log()`) names a property rather than
 * a binding, and matching it by property name alone would silence the rule on
 * every unrelated method of the same name, so it yields nothing.
 */
function decoratorFactoryIdentifier(
  expression: TSESTree.Node,
): TSESTree.Node | undefined {
  if (expression.type !== AST_NODE_TYPES.CallExpression) return undefined;

  const callee = expression.callee;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee;
  }

  return decoratorFactoryIdentifier(callee);
}

/**
 * The declarations invoked by a decorator in this file.
 *
 * This catches the factory whose annotation is a user-defined decorator type
 * (`type Cached = (t: object, k: string, d: PropertyDescriptor) => void`), which
 * no name test can recognise. Each identifier is resolved through the scope
 * manager rather than compared by name, so a same-named binding elsewhere in the
 * file cannot silence the rule on a function no decorator actually reaches.
 */
function decoratorReferencedDeclarations(
  source: TSESLint.SourceCode,
  visitorKeys: VisitorKeys,
): Set<TSESTree.Node> {
  const heads = new Set<TSESTree.Node>();
  const stack: TSESTree.Node[] = [source.ast];

  while (stack.length > 0) {
    const current = stack.pop() as TSESTree.Node;

    if (current.type === AST_NODE_TYPES.Decorator) {
      const head = decoratorFactoryIdentifier(current.expression);
      if (head) {
        heads.add(head);
      }
    }

    pushChildren(current, visitorKeys, stack);
  }

  const declarations = new Set<TSESTree.Node>();
  if (heads.size === 0) return declarations;

  for (const scope of source.scopeManager?.scopes ?? []) {
    for (const reference of scope.references) {
      if (!heads.has(reference.identifier)) continue;
      for (const definition of reference.resolved?.defs ?? []) {
        declarations.add(definition.node);
      }
    }
  }

  return declarations;
}

/**
 * An annotation waiting to be reported. Reports are held until the whole file
 * has been walked because whether one annotation's fix may unbind an import
 * depends on which other annotations the same fix can take with it — a question
 * with no answer while the walk is still in progress.
 */
type PendingAnnotation = {
  node: TSESTree.Node;
  returnType: TSESTree.TSTypeAnnotation;
  strippable: boolean;
};

function containsRange(outer: TextRange, inner: TextRange): boolean {
  return inner[0] >= outer[0] && inner[1] <= outer[1];
}

/**
 * Partitions annotations into the sets whose removals have to travel together.
 *
 * A binding read from two annotations is unbound only once both are gone, so
 * neither annotation may unbind it alone — and a fix may only count on the other
 * removal happening if it performs that removal itself. Annotations that jointly
 * keep a binding alive are therefore merged into one batch, and every other
 * annotation is a batch of one, judged against the file as it stands.
 *
 * EVERY binding is asked about, not only the imported ones. Partitioning over
 * imports alone left a local `type` alias named by two annotations owned by no
 * fix: each annotation looked innocent alone, both were stripped, and the alias
 * survived with nothing referencing it (#1902).
 *
 * `candidates` must already exclude suppressed reports: a suppressed report's
 * fix never runs, so its annotation — and the reference it holds — outlives the
 * pass.
 */
function batchAnnotations(
  source: TSESLint.SourceCode,
  candidates: readonly PendingAnnotation[],
): PendingAnnotation[][] {
  const parents = candidates.map((_, index) => index);
  const rootOf = (index: number): number => {
    let root = index;
    while (parents[root] !== root) {
      root = parents[root];
    }
    return root;
  };

  const ownerOf = (reference: TextRange): number =>
    candidates.findIndex((candidate) =>
      containsRange(candidate.returnType.range, reference),
    );

  for (const binding of bindingUses(source)) {
    // A single reference cannot be shared, so the one-annotation judgement
    // already covers it.
    if (binding.uses.length < 2) continue;

    const owners = new Set<number>();
    const escapes = binding.uses.some((reference) => {
      const owner = ownerOf(reference);
      if (owner === -1) return true;
      owners.add(owner);
      return false;
    });
    // A reference outside every strippable annotation survives whatever this
    // pass deletes, so no batch can unbind the import.
    if (escapes || owners.size < 2) continue;

    const [target, ...rest] = [...owners].map(rootOf);
    for (const root of rest) {
      if (root !== target) {
        parents[root] = target;
      }
    }
  }

  const batches = new Map<number, PendingAnnotation[]>();
  candidates.forEach((candidate, index) => {
    const root = rootOf(index);
    const batch = batches.get(root);
    if (batch) {
      batch.push(candidate);
    } else {
      batches.set(root, [candidate]);
    }
  });

  return [...batches.values()];
}

/**
 * Whether the span deletes a whole declaration of the program.
 *
 * Such a span owns the comments inside it: they describe the declaration that is
 * going away, and re-emitting them would leave prose behind with no subject. The
 * spans that reach across a specifier list are the opposite case — the
 * declaration survives them, so a comment they cover has to survive too.
 */
function removesWholeStatement(
  source: TSESLint.SourceCode,
  range: TextRange,
): boolean {
  return source.ast.body.some(
    (statement) =>
      statement.range[0] >= range[0] && statement.range[1] <= range[1],
  );
}

/**
 * What a removal range is replaced with: nothing, or the comments it covers
 * re-emitted so the deletion carries them instead of dropping them. `null`
 * withholds the fix, for a comment whose meaning is its position.
 *
 * The separators around the carried run are chosen from the text on either side
 * rather than added unconditionally, so a range that already sits between
 * whitespace does not gain any. A trailing line break is mandatory where the
 * last comment is a line comment or the range consumed its own newline: without
 * one the surviving code moves onto the comment's line and is commented out.
 */
function carriedText(
  source: TSESLint.SourceCode,
  range: TextRange,
): string | null {
  const comments = source
    .getAllComments()
    .filter(
      (comment) => comment.range[0] >= range[0] && comment.range[1] <= range[1],
    );
  if (comments.length === 0) return '';
  if (comments.some(isPositionalDirective)) return null;

  const indent = indentAt(source, range[0]);
  const segments = comments.map((comment) => ({
    text: source.text.slice(comment.range[0], comment.range[1]),
    breakAfter: requiresLineBreakAfter(comment),
  }));
  const body = joinSegmentBody(segments, indent);

  const before = range[0] > 0 ? source.text[range[0] - 1] : '';
  const after = source.text[range[1]] ?? '';
  const lead = before === '' || /\s/.test(before) ? '' : ' ';
  const trail =
    segments[segments.length - 1].breakAfter ||
    source.text.slice(range[0], range[1]).endsWith('\n')
      ? `\n${indent}`
      : after === '' || /\s/.test(after)
      ? ''
      : ' ';
  return `${lead}${body}${trail}`;
}

/** Every character the syntactic grammar counts as a LineTerminator. */
const LINE_TERMINATORS = /[\n\r\u2028\u2029]/g;

function countLineTerminators(text: string): number {
  return text.match(LINE_TERMINATORS)?.length ?? 0;
}

/**
 * The text `range` spells once `edits` are applied.
 *
 * Only an edit lying wholly inside the span can change what it spells: one
 * outside shifts both endpoints by the same amount, which moves the span
 * without rewriting it.
 */
function previewSpan(
  text: string,
  edits: readonly Edit[],
  range: TextRange,
): string {
  const inside = edits
    .filter((edit) => edit.range[0] >= range[0] && edit.range[1] <= range[1])
    .sort((left, right) => left.range[0] - right.range[0]);

  let preview = '';
  let cursor = range[0];
  for (const edit of inside) {
    preview += text.slice(cursor, edit.range[0]) + edit.text;
    cursor = edit.range[1];
  }
  return preview + text.slice(cursor, range[1]);
}

/**
 * Whether a line break falls BETWEEN two of the node's tokens, rather than
 * inside one of them.
 *
 * A body spanning lines only has an interior depth to get wrong when its own
 * structure spans them. The lines a multi-line template literal or a block
 * comment occupies are inside a single token — content whose columns prettier
 * never re-indents — so moving such a body's first line leaves nothing behind
 * at the wrong depth.
 */
function spansLinesBetweenTokens(
  source: TSESLint.SourceCode,
  node: TSESTree.Node,
): boolean {
  const tokens = source.getTokens(node, { includeComments: true });
  return tokens.some(
    (token, index) =>
      index > 0 && tokens[index - 1].loc.end.line !== token.loc.start.line,
  );
}

/**
 * Whether `text`, the span between an arrow's `=>` and its body, breaks the
 * line before anything else. Only a break the arrow's own line ends on counts:
 * a block comment that hugs the `=>` and spans lines leaves the body on the
 * arrow's group, and prettier keeps it at the declaration's depth.
 */
function breaksAheadOfBody(text: string): boolean {
  return /^[ \t]*[\n\r\u2028\u2029]/.test(text);
}

/**
 * Whether the emitted text moves the arrow's body off the `=>` onto a line of
 * its own, one step deeper than its interior was written for.
 *
 * Prettier indents a block body from the line its arrow breaks on: a body left
 * beside the `=>` is one step past the declaration, and a body pushed to the
 * next line is one step past THAT. A carried comment run that must own a line
 * — a `//` comment, or a second block comment — leaves the body no room
 * beside the `=>`, so the body drops a line while its interior and its closing
 * bracket stay at the columns they were written at, and prettier re-indents
 * the whole body to settle them (#2129). A body already opening its own line
 * keeps the depth it was written at, and one whose run hugs the `=>` never
 * leaves the arrow's line.
 */
function displacesBody(
  source: TSESLint.SourceCode,
  arrow: TSESTree.ArrowFunctionExpression,
  edits: readonly Edit[],
): boolean {
  if (!spansLinesBetweenTokens(source, arrow.body)) return false;

  const arrowToken = source.getTokenBefore(arrow.body, {
    filter: (token) => token.value === '=>',
  });
  if (!arrowToken) return false;

  const lead: TextRange = [arrowToken.range[1], arrow.body.range[0]];
  return (
    breaksAheadOfBody(previewSpan(source.text, edits, lead)) !==
    breaksAheadOfBody(source.text.slice(lead[0], lead[1]))
  );
}

/**
 * Every link of the arrow chain `arrow` belongs to, outermost first.
 *
 * An arrow function is the only node that can stand as an arrow's body without
 * a wrapper, so the body position identifies a link exactly: an arrow sitting
 * in a parameter default shares a parent type without sharing a chain.
 */
function arrowChainLinks(
  arrow: TSESTree.ArrowFunctionExpression,
): TSESTree.ArrowFunctionExpression[] {
  let root = arrow;
  for (
    let parent = root.parent;
    parent?.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    parent.body === root;
    parent = root.parent
  ) {
    root = parent;
  }

  const links = [root];
  let body: TSESTree.Node = root.body;
  while (body.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    links.push(body);
    body = body.body;
  }

  return links;
}

/**
 * Whether the chain is written with its links one per line, the shape prettier
 * prints when the chain's single group is open.
 *
 * The signal is a line terminator between one link's `=>` and the next link,
 * which is a break prettier only takes for the whole group at once — a chain it
 * fits on one line puts every `=>` on that line.
 */
function chainIsPrintedBroken(
  source: TSESLint.SourceCode,
  links: readonly TSESTree.ArrowFunctionExpression[],
): boolean {
  return links.slice(1).some((next) => {
    const arrowToken = source.getTokenBefore(next, {
      filter: (token) => token.value === '=>',
    });

    return (
      arrowToken !== null && arrowToken.loc.end.line !== next.loc.start.line
    );
  });
}

/**
 * Whether stripping the annotation takes the line terminator that holds an
 * already-broken arrow chain open out of this link's head.
 *
 * Prettier lays an arrow chain out as a single group: either every `=>` in it
 * ends a line or none does. A line terminator in the head of one link — a block
 * comment carrying one, or an annotation written across lines — is enough to
 * force that group open, so deleting it re-decides where every OTHER link
 * breaks. Those links are not this annotation's span, and re-emitting them
 * would mean laying the whole chain out again, so the fix is withheld instead
 * of shipping a head prettier immediately rewrites (#2129).
 *
 * A chain whose links already share a line is not held open by anything, so the
 * same strip leaves the group where it was and the fix ships.
 *
 * The head stops at the `=>` rather than past it: a comment carried to the far
 * side lands beyond the group's decision point, and counting it would read the
 * carried terminators as if they still held the chain open.
 */
function collapsesChainHead(
  source: TSESLint.SourceCode,
  returnType: TSESTree.TSTypeAnnotation,
  arrow: TSESTree.ArrowFunctionExpression,
  edits: readonly Edit[],
): boolean {
  const links = arrowChainLinks(arrow);
  if (links.length < 2 || !chainIsPrintedBroken(source, links)) return false;

  const gapInfo = arrowAnnotationGap(source, returnType);
  if (!gapInfo) return false;

  const head: TextRange = [arrow.range[0], gapInfo.arrow.range[0]];
  return (
    countLineTerminators(previewSpan(source.text, edits, head)) <
    countLineTerminators(source.text.slice(head[0], head[1]))
  );
}

/**
 * Whether a planned strip leaves every line it does not own where it was.
 *
 * agora runs prettier and `eslint --fix` over the same tree, so a fix whose
 * output the formatter rewrites on arrival produces a diff that never settles
 * and churns every file it touches. Both shapes screened here are ones where
 * the emitted text re-decides the layout of code OUTSIDE the annotation's own
 * span — a body's interior, or the other links of an arrow chain — which the
 * shared planner cannot re-emit without rewriting text it does not own. A
 * block body can take the run onto its first line instead, which
 * {@link reroutedIntoBlockBody} answers for; everywhere else the fix is
 * withheld and the report still ships, so the annotation is surfaced to its
 * author (#2129).
 */
function keepsSurroundingLayout(
  source: TSESLint.SourceCode,
  returnType: TSESTree.TSTypeAnnotation,
  edits: readonly Edit[],
): boolean {
  const arrow = returnType.parent;
  if (arrow?.type !== AST_NODE_TYPES.ArrowFunctionExpression) return true;

  return (
    !displacesBody(source, arrow, edits) &&
    !collapsesChainHead(source, returnType, arrow, edits)
  );
}

/** A single LineTerminator, for a look at one character. */
const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;

/**
 * One nesting step, in the spelling prettier writes at its default `tabWidth`:
 * the depth a block body's interior sits at past the declaration that owns it.
 */
const INDENT_STEP = '  ';

const textOf = (source: TSESLint.SourceCode, range: TextRange): string =>
  source.text.slice(range[0], range[1]);

/**
 * Whether every continuation line of a block comment carries the `*` gutter,
 * which makes its alignment a function of the column it opens at rather than
 * text its author chose. Any other block comment's interior is content —
 * commented-out code, a table — and keeps its columns byte-for-byte.
 */
function hasAlignedGutter(lines: readonly string[]): boolean {
  return (
    lines.length > 1 &&
    lines.slice(1).every((line) => line.trimStart().startsWith('*'))
  );
}

/**
 * A block comment re-aligned to open at `indent`, its gutter one column in
 * from the `/*`. Only leading whitespace moves: the comment's own characters
 * are the part a fix may not rewrite.
 */
function realignComment(text: string, indent: string): string {
  const lines = text.split('\n');
  if (!hasAlignedGutter(lines)) return text;
  return lines
    .map((line, index) =>
      index === 0 ? line : `${indent} ${line.trimStart()}`,
    )
    .join('\n');
}

/**
 * The depth a block body's first line is written at: the indentation of the
 * first token or comment inside it when that opens a line of its own, and one
 * step past the declaration otherwise — an empty body, or one written on a
 * single line. Reading it from the body rather than computing it keeps a
 * carried comment level with the statement it lands beside.
 */
function blockInteriorIndent(
  source: TSESLint.SourceCode,
  body: TSESTree.BlockStatement,
  subjectIndent: string,
): string {
  const brace = source.getFirstToken(body);
  const first = brace && source.getTokenAfter(brace, { includeComments: true });
  if (first && first.range[1] < body.range[1]) {
    const lineStart = source.text.lastIndexOf('\n', first.range[0] - 1) + 1;
    const prefix = source.text.slice(lineStart, first.range[0]);
    if (lineStart > body.range[0] && prefix.trim() === '') return prefix;
  }
  return `${subjectIndent}${INDENT_STEP}`;
}

/**
 * Re-emits `comments` as the first lines of a block body, level with its
 * interior.
 *
 * A comment run that has to end a line cannot sit ahead of the body's `{`
 * without pushing that brace onto a line of its own, where prettier never
 * prints it: it re-lays out the whole body around a brace displaced that way
 * (#2129). The body's first line is the one position such a run can hold
 * where the surrounding text keeps every column it had — and it is where
 * prettier itself settles a comment stranded ahead of a brace, so the emitted
 * text is what the formatter would have written.
 *
 * The edit consumes only the horizontal whitespace after the brace. A body
 * that already breaks after its `{` supplies the separator the run needs; one
 * with text on that line gets one, so the run cannot comment it out; an empty
 * body gets its `}` back at the declaration's depth.
 */
function carryIntoBlockBody(
  source: TSESLint.SourceCode,
  comments: readonly TSESTree.Comment[],
  subjectIndent: string,
  body: TSESTree.BlockStatement,
): Edit {
  const indent = blockInteriorIndent(source, body, subjectIndent);
  const run = joinSegmentBody(
    comments.map((comment) => ({
      text: realignComment(textOf(source, comment.range), indent),
      breakAfter: true,
    })),
    indent,
  );
  const braceEnd = body.range[0] + 1;
  const interior = source.text.slice(braceEnd, body.range[1] - 1);
  const [spacing] = /^[ \t]*/.exec(interior) ?? [''];
  const rest = interior.slice(spacing.length);
  const closer =
    rest === ''
      ? `\n${subjectIndent}`
      : LINE_TERMINATOR.test(rest.charAt(0))
      ? ''
      : `\n${indent}`;
  return {
    range: [braceEnd, braceEnd + spacing.length],
    text: `\n${indent}${run}${closer}`,
  };
}

/**
 * The block body of a non-arrow subject, or `null` for one that has none: an
 * overload signature, an abstract method or a `declare`d function ends at a
 * semicolon, and its comments stay where they were written. A class method is
 * reported on the member, whose function sits in its `value`.
 */
function blockBodyOf(node: TSESTree.Node): TSESTree.BlockStatement | null {
  const fn =
    node.type === AST_NODE_TYPES.MethodDefinition ||
    node.type === AST_NODE_TYPES.TSAbstractMethodDefinition
      ? node.value
      : node;
  if (
    fn.type !== AST_NODE_TYPES.FunctionDeclaration &&
    fn.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return null;
  }
  return fn.body && fn.body.type === AST_NODE_TYPES.BlockStatement
    ? fn.body
    : null;
}

/**
 * The node whose line a subject's body is indented from. A method's function
 * node begins at its parameter list, on the same line as its key in every
 * spelling prettier prints, but the member is what the indentation belongs to.
 */
function subjectAnchorOf(node: TSESTree.Node): TSESTree.Node {
  const { parent } = node;
  return parent &&
    (parent.type === AST_NODE_TYPES.MethodDefinition ||
      parent.type === AST_NODE_TYPES.TSAbstractMethodDefinition ||
      parent.type === AST_NODE_TYPES.Property ||
      parent.type === AST_NODE_TYPES.PropertyDefinition)
    ? parent
    : node;
}

/**
 * The edits that strip an annotation from a subject whose parameter list ends
 * at a body rather than an arrow.
 *
 * A run holding a comment that must end its line — a `//` comment — cannot be
 * re-emitted in place: the break it needs lands ahead of the body's `{` and
 * pushes the brace onto a line of its own, which prettier re-lays out on
 * arrival (#2129). Such a run is carried into the body instead. Every other
 * run keeps its place, so a multi-line block comment spliced in ahead of the
 * brace — which prettier leaves exactly there — does not move.
 */
function planBodiedSubjectEdits(
  source: TSESLint.SourceCode,
  entry: PendingAnnotation,
): Edit[] | null {
  const range = entry.returnType.range;
  const body = blockBodyOf(entry.node);
  const comments = source
    .getAllComments()
    .filter((comment) => containsRange(range, comment.range));
  if (body === null || !comments.some(requiresLineBreakAfter)) {
    const carried = carriedText(source, range);
    return carried === null ? null : [{ range, text: carried }];
  }
  if (comments.some(isPositionalDirective)) return null;

  const subjectIndent = indentAt(source, subjectAnchorOf(entry.node).range[0]);
  return [
    { range, text: '' },
    carryIntoBlockBody(source, comments, subjectIndent, body),
  ];
}

/**
 * The planned arrow edits with their carried run moved into the block body,
 * for a strip whose run would otherwise displace that body.
 *
 * The shared planner carries a line-ending run past the `=>` onto a line of
 * its own, which leaves a block body nowhere to go but the line below, at a
 * depth its interior does not share (#2129). The body's first line takes the
 * run instead: the brace stays beside the `=>` and every column behind it is
 * kept. Only the edit that hoisted the run is replaced; the gap rewrite, which
 * keeps one-line comments in place, is the planner's own.
 *
 * A concise body has no interior to carry into, and a chain link whose strip
 * collapses the chain's head is re-laid out for a reason no body can absorb;
 * both stay withheld.
 */
function reroutedIntoBlockBody(
  source: TSESLint.SourceCode,
  returnType: TSESTree.TSTypeAnnotation,
  edits: readonly Edit[],
): Edit[] | null {
  const arrow = returnType.parent;
  if (arrow?.type !== AST_NODE_TYPES.ArrowFunctionExpression) return null;
  const { body } = arrow;
  if (body.type !== AST_NODE_TYPES.BlockStatement) return null;
  if (collapsesChainHead(source, returnType, arrow, edits)) return null;

  const gapInfo = arrowAnnotationGap(source, returnType);
  if (!gapInfo) return null;
  const hoistIndex = edits.findIndex(
    (edit) => edit.range[0] === gapInfo.arrow.range[1],
  );
  if (hoistIndex === -1) return null;

  const hoisted = source
    .getAllComments()
    .filter(
      (comment) =>
        containsRange(gapInfo.gap, comment.range) && requiresOwnLine(comment),
    );
  if (hoisted.length === 0) return null;

  const rerouted = [
    ...edits.filter((_, index) => index !== hoistIndex),
    carryIntoBlockBody(
      source,
      hoisted,
      indentAt(source, subjectAnchorOf(arrow).range[0]),
      body,
    ),
  ];
  return isDisjoint(rerouted) ? rerouted : null;
}

/**
 * The edits that strip one annotation, carrying every comment the strip
 * strands rather than deleting it (#1877). `null` withholds the fix, for a
 * comment whose meaning is its position and which cannot stay where it is.
 *
 * An arrow is the one subject whose annotation sits inside a restricted
 * production, so its edits come from the shared planner that answers for that
 * grammar (#1964). The removal span handed to it is the annotation's own
 * range: unlike the planner's other caller, nothing here reaches back over the
 * whitespace ahead of the `:`. Those edits are screened once more before they
 * ship: a carried run that would displace the body is carried into a block
 * body instead, and a strip that would re-lay out anything else outside the
 * annotation's span is withheld (#2129).
 *
 * Every other subject ends its parameter list at a body or a semicolon, so
 * nothing about the comments around it is restricted; a run that must end its
 * line still goes into the body, since ahead of the brace it would displace
 * that too.
 */
function planAnnotationEdits(
  source: TSESLint.SourceCode,
  entry: PendingAnnotation,
): Edit[] | null {
  if (entry.node.type !== AST_NODE_TYPES.ArrowFunctionExpression) {
    return planBodiedSubjectEdits(source, entry);
  }

  const range = entry.returnType.range;
  const edits = planArrowAnnotationEdits(source, entry.returnType, range);
  if (edits === null) return null;
  if (keepsSurroundingLayout(source, entry.returnType, edits)) return edits;

  return reroutedIntoBlockBody(source, entry.returnType, edits);
}

/**
 * The edits a single fix makes for `batch`: the annotations themselves plus the
 * bindings they were the last consumers of. `null` when a binding the removal
 * orphans cannot be unbound safely — the caller then drops the fix rather than
 * emitting the half of it that leaves a binding behind.
 *
 * A cleanup span is REPLACED by the comments it covers rather than deleted
 * outright. The planner computes spans that reach across separators, so a
 * comment among the specifiers sits inside one; declining on that comment is no
 * remedy, since it lets a comment decide whether the annotations are stripped at
 * all, which is a comment changing the transform just the same (#1877). The
 * annotation spans are carried the same way by {@link planAnnotationEdits},
 * which additionally answers for the arrow whose annotation sits inside a
 * restricted production.
 */
function planRemoval(
  source: TSESLint.SourceCode,
  removalSource: ImportRemovalSource,
  batch: readonly PendingAnnotation[],
): Edit[] | null {
  const annotations = batch.map((entry) => entry.returnType.range);
  const cleanups = planOrphanedBindingRemoval(
    removalSource,
    annotations,
    (variables, planned) =>
      planTypeDeclarationRemoval(removalSource, variables, planned),
  );
  if (!cleanups) return null;

  const edits: Edit[] = [];
  for (const entry of batch) {
    const planned = planAnnotationEdits(source, entry);
    if (planned === null) return null;
    edits.push(...planned);
  }
  for (const range of cleanups) {
    if (removesWholeStatement(source, range)) {
      edits.push({ range, text: '' });
      continue;
    }
    const carried = carriedText(source, range);
    if (carried === null) return null;
    edits.push({ range, text: carried });
  }

  return isDisjoint(edits) ? edits : null;
}

export const noExplicitReturnType: TSESLint.RuleModule<MessageIds, Options> =
  createRule<Options, MessageIds>({
    name: 'no-explicit-return-type',
    meta: {
      type: 'suggestion',
      docs: {
        description:
          "Disallow explicit return type annotations on functions when TypeScript can infer them. This reduces code verbosity and maintenance burden while leveraging TypeScript's powerful type inference. Exceptions are made for type guard functions (using the `is` keyword), recursive functions, overloaded functions, interface methods, and abstract methods where explicit types improve clarity.",
        recommended: 'error',
        requiresTypeChecking: false,
        extendsBaseRule: false,
      },
      fixable: 'code',
      schema: [
        {
          type: 'object',
          properties: {
            allowRecursiveFunctions: { type: 'boolean' },
            allowOverloadedFunctions: { type: 'boolean' },
            allowInterfaceMethodSignatures: { type: 'boolean' },
            allowAbstractMethodSignatures: { type: 'boolean' },
            allowDtsFiles: { type: 'boolean' },
            allowFirestoreFunctionFiles: { type: 'boolean' },
            allowVoidReturnTypes: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      ],
      messages: {
        noExplicitReturnTypeInferable:
          "What's wrong: {{functionKind}} has an explicit return type annotation. \u2192 Why it matters: it must be updated manually and can drift from what the implementation actually returns, hiding bugs behind a stale type. \u2192 How to fix: remove the return type annotation so TypeScript infers it from the implementation.",
        noExplicitReturnTypeNonInferable:
          "What's wrong: {{functionKind}} has an explicit return type annotation but no implementation body. \u2192 Why it matters: TypeScript cannot infer the return type here; removing it widens the return type to `any`. \u2192 How to fix: keep the annotation, or provide an implementation body where inference can succeed.",
      },
    },
    defaultOptions: [defaultOptions],
    create(context, [options]) {
      const mergedOptions = { ...defaultOptions, ...options };
      const filename = context.getFilename();
      const sourceCode = context.getSourceCode();
      const visitorKeys = sourceCode.visitorKeys as VisitorKeys;

      const pending: PendingAnnotation[] = [];

      /**
       * The source the removal planner reads, with the comments inside a
       * declaration hidden from it.
       *
       * `planImportBindingRemoval` declines outright on any comment inside the
       * declaration it is asked to edit, because the spans it computes reach
       * across separators and a comment nested among the specifiers would be
       * swallowed. That decline is not available here: the annotations that
       * jointly name an import are stripped by one fix or not at all, so
       * declining only the import half strands the binding, and declining the
       * whole fix lets a comment decide whether the rule's own transform fires
       * (#1877, #1902).
       *
       * The planner is therefore asked for the spans as if the declaration
       * carried no comments, and {@link carriedText} re-emits every comment
       * those spans cover in place of the text they delete. Only
       * `getCommentsInside` is blinded: `getCommentsBefore` still answers for
       * the directive that binds a whole statement, which is the one shape no
       * re-emission can save.
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

      /**
       * Whether ESLint will discard a report, resolved the way ESLint resolves
       * it. A fix that deletes several annotations at once is counting on all of
       * them being reportable; a suppressed one keeps its type reference, so it
       * must be left out of every batch.
       */
      const isReportSuppressed = createSuppressionChecker(context);

      // Edges are resolved lazily, and only for functions a direct
      // self-reference has already failed to explain.
      const participatesInReturnCycle = createReturnCycleResolver(visitorKeys);

      // Decorators are visited after the functions they name — a class body is
      // walked long after the top-level factory it decorates with — so the
      // answer is computed from the whole tree rather than accumulated during
      // the walk, and memoised because most files hold no decorator at all.
      let decoratedDeclarations: Set<TSESTree.Node> | undefined;
      const declarationsNamedByDecorators = (): Set<TSESTree.Node> => {
        decoratedDeclarations ??= decoratorReferencedDeclarations(
          sourceCode,
          visitorKeys,
        );
        return decoratedDeclarations;
      };

      /**
       * True when the annotation is what makes the function usable in a
       * decorator position. TypeScript infers the concrete closure the factory
       * returns — `() => void` for `return () => {};` — which declares fewer
       * parameters than a decoration site passes, so removing the annotation
       * turns every `@Factory()` use into TS1329 (#2014).
       *
       * The question is answered syntactically. A `RuleTester` fixture carries
       * no `parserOptions.project`, so a type-based answer would be untestable
       * and would silently no-op wherever consumers lint without a program.
       */
      function isDecoratorFactory(
        node: TSESTree.Node,
        returnType: TSESTree.TSTypeAnnotation,
      ): boolean {
        if (namesDecoratorType(returnType.typeAnnotation)) return true;

        const declarations = declarationsNamedByDecorators();
        if (declarations.size === 0) return false;

        if (declarations.has(node)) return true;

        // `const Log = (): Cached => ...` is bound by its declarator, which is
        // what a decorator's identifier resolves to.
        const parent = node.parent;
        return (
          parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          declarations.has(parent)
        );
      }

      /**
       * True when TypeScript cannot infer the return type because the function
       * is referenced from within its own return expression (TS7023). Removing
       * the annotation in that case does not compile, so the rule stays silent.
       */
      function isReturnTypeRequiredByRecursion(node: TSESTree.Node): boolean {
        if (!mergedOptions.allowRecursiveFunctions) return false;

        const fn = bodyOf(node);
        if (!fn) return false;

        const selfReferences = resolveSelfReferences(node);
        if (selfReferences.length === 0) return false;

        const returnExpressions = collectOwnReturnExpressions(fn, visitorKeys);
        const referencesItself = returnExpressions.some((expression) =>
          subtreeReferences(expression, selfReferences, visitorKeys),
        );
        if (referencesItself) return true;

        const identifierNames = selfReferences
          .filter(
            (reference): reference is SelfReference & { kind: 'identifier' } =>
              reference.kind === 'identifier',
          )
          .map((reference) => reference.name);
        // A function nothing can name cannot close a cycle, so the cheap
        // name check stays ahead of the graph walk.
        if (identifierNames.length === 0) return false;

        return participatesInReturnCycle(fn);
      }

      if (
        (mergedOptions.allowDtsFiles && filename.endsWith('.d.ts')) ||
        (mergedOptions.allowFirestoreFunctionFiles &&
          filename.endsWith('.f.ts'))
      ) {
        return {};
      }

      /**
       * Applied at the implementation sites this rule's fixer can rewrite —
       * functions, arrows and class methods. Signature-only declarations
       * (interface methods, abstract methods, `declare function`) are outside
       * the exemption: they have no body to infer from, so their annotation is
       * mandatory rather than redundant, they are reported only when the
       * matching `allow*` option is turned off, and no fixer ever strips them.
       */
      function isAllowedVoidReturnType(
        returnType: TSESTree.TSTypeAnnotation,
      ): boolean {
        return (
          Boolean(mergedOptions.allowVoidReturnTypes) &&
          declaresVoidResult(returnType)
        );
      }

      /**
       * Holds an annotation for `flushReports`, which decides once the file has
       * been walked which removals may travel together.
       */
      function reportAnnotation(
        node: TSESTree.Node,
        returnType: TSESTree.TSTypeAnnotation,
        strippable: boolean,
      ): void {
        pending.push({ node, returnType, strippable });
      }

      /**
       * Emits every held report, each carrying the binding cleanup its own
       * removal makes necessary. An annotation and the binding it unbinds are
       * one fix: applying either half alone leaves the file worse than applying
       * neither.
       *
       * Orphanhood is judged against a single fix's own deletions, never against
       * what the rest of the `--fix` run might also delete. That is what makes
       * the cleanup suppression-safe, and it is why a type several annotations
       * share cannot be unbound by any one of them: a sibling annotation may be
       * `eslint-disable`d, and deleting "its" import strands a reference that
       * outlives the pass — a compile error in place of an unused import.
       *
       * Waiting for the last such annotation does not work either. Once every
       * annotation is stripped the rule has nothing left to report, so no later
       * fix exists to carry the cleanup and the binding stays orphaned for good
       * (issue #1654). The annotations that jointly hold a binding alive are
       * therefore removed by one fix, which owes two things: it deletes all of
       * them itself rather than assuming sibling reports land, and it counts
       * only annotations whose reports ESLint will not discard.
       */
      function flushReports(): void {
        const strippable = pending.filter((entry) => entry.strippable);

        // Each annotation starts with the judgement it would get alone. That
        // judgement holds only while the annotation is the whole story for every
        // binding it names; a batch below either extends it to cover the
        // binding they share, or withdraws it.
        const plans = new Map<PendingAnnotation, Edit[]>();
        for (const entry of strippable) {
          const plan = planRemoval(sourceCode, removalSource, [entry]);
          if (plan) {
            plans.set(entry, plan);
          }
        }

        const batches = batchAnnotations(
          sourceCode,
          strippable.filter((entry) => !isReportSuppressed(entry.returnType)),
        );
        for (const batch of batches) {
          if (batch.length < 2) continue;
          const plan = planRemoval(sourceCode, removalSource, batch);
          if (plan) {
            for (const entry of batch) {
              plans.set(entry, plan);
            }
            continue;
          }
          // The batch exists because its members jointly hold a binding alive,
          // so falling back to the one-at-a-time strip is not the harmless
          // status quo it looks like: `--fix` applies those strips in the same
          // run, the last one leaves the binding referenced by nothing, and no
          // report survives to clean it up (#1902). Every member gives up its
          // fix and keeps its report.
          for (const entry of batch) {
            plans.delete(entry);
          }
        }

        for (const entry of pending) {
          const plan = plans.get(entry);
          context.report({
            node: entry.returnType,
            messageId: entry.strippable
              ? 'noExplicitReturnTypeInferable'
              : 'noExplicitReturnTypeNonInferable',
            data: { functionKind: describeFunctionKind(entry.node) },
            ...(plan
              ? {
                  fix: (fixer) =>
                    plan.map((edit) =>
                      fixer.replaceTextRange(
                        [edit.range[0], edit.range[1]],
                        edit.text,
                      ),
                    ),
                }
              : {}),
          });
        }
      }

      return {
        'Program:exit'() {
          flushReports();
        },

        FunctionDeclaration(node) {
          const returnType = node.returnType;
          if (!returnType) return;

          if (
            isTypeGuardFunction(node) ||
            isReadonlyWideningReturnType(returnType) ||
            isAllowedVoidReturnType(returnType) ||
            isResourceHandleReturnType(returnType) ||
            isDecoratorFactory(node, returnType) ||
            isOverloadImplementation(node) ||
            (mergedOptions.allowRecursiveFunctions &&
              isRecursiveFunction(node)) ||
            isReturnTypeRequiredByRecursion(node)
          ) {
            return;
          }

          reportAnnotation(node, returnType, Boolean(node.body));
        },

        FunctionExpression(node) {
          const returnType = node.returnType;
          if (!returnType) return;

          if (node.parent?.type === AST_NODE_TYPES.MethodDefinition) {
            return;
          }

          if (
            isTypeGuardFunction(node) ||
            isReadonlyWideningReturnType(returnType) ||
            isAllowedVoidReturnType(returnType) ||
            isResourceHandleReturnType(returnType) ||
            isDecoratorFactory(node, returnType) ||
            (mergedOptions.allowRecursiveFunctions &&
              isRecursiveFunction(node)) ||
            isReturnTypeRequiredByRecursion(node)
          ) {
            return;
          }

          reportAnnotation(node, returnType, true);
        },

        ArrowFunctionExpression(node) {
          const returnType = node.returnType;
          if (!returnType) return;

          if (
            isTypeGuardFunction(node) ||
            isReadonlyWideningReturnType(returnType) ||
            isAllowedVoidReturnType(returnType) ||
            isResourceHandleReturnType(returnType) ||
            isDecoratorFactory(node, returnType) ||
            isReturnTypeRequiredByRecursion(node)
          ) {
            return;
          }

          reportAnnotation(node, returnType, true);
        },

        TSMethodSignature(node) {
          const returnType = node.returnType;
          if (!returnType) return;

          if (mergedOptions.allowInterfaceMethodSignatures) {
            return;
          }

          if (
            mergedOptions.allowOverloadedFunctions &&
            isOverloadedFunction(node)
          ) {
            return;
          }

          reportAnnotation(node, returnType, false);
        },

        MethodDefinition(node) {
          const returnType = node.value.returnType;
          if (!returnType) return;

          if (
            isTypeGuardFunction(node.value) ||
            isReadonlyWideningReturnType(returnType) ||
            isAllowedVoidReturnType(returnType) ||
            isResourceHandleReturnType(returnType) ||
            isDecoratorFactory(node, returnType) ||
            isOverloadImplementationMethod(node) ||
            (mergedOptions.allowOverloadedFunctions &&
              isOverloadedClassMethodSignature(node)) ||
            (mergedOptions.allowAbstractMethodSignatures &&
              isInterfaceOrAbstractMethodSignature(node)) ||
            isReturnTypeRequiredByRecursion(node)
          ) {
            return;
          }

          reportAnnotation(node, returnType, Boolean(node.value.body));
        },

        TSAbstractMethodDefinition(node) {
          const returnType = node.value.returnType;
          if (!returnType) return;

          if (
            isTypeGuardFunction(node.value) ||
            (mergedOptions.allowAbstractMethodSignatures &&
              isInterfaceOrAbstractMethodSignature(node))
          ) {
            return;
          }

          // Abstract methods never have bodies; they are always non-inferable and
          // intentionally have no fixer.
          reportAnnotation(node, returnType, false);
        },

        TSDeclareFunction(node) {
          const returnType = node.returnType;
          if (!returnType) return;

          if (isTypeGuardFunction(node)) {
            return;
          }

          if (
            mergedOptions.allowOverloadedFunctions &&
            isOverloadedTsDeclareFunction(node)
          ) {
            return;
          }

          reportAnnotation(node, returnType, false);
        },
      };
    },
  });
