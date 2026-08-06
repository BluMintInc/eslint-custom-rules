import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  importBindingReferences,
  planOrphanedImportRemoval,
  TextRange,
} from '../utils/importRemoval';
import {
  BOUND_UNPROVABLE,
  declarationOf,
  resolveInEnclosingScopes,
} from '../utils/lexicalScope';

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
    resolveInEnclosingScopes<FunctionWithBody>(
      from,
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

function isOverloadedTsDeclareFunction(
  node: TSESTree.TSDeclareFunction,
): boolean {
  const functionName = node.id?.name;
  if (!functionName) return false;

  let container: TSESTree.Node | undefined = node.parent as
    | TSESTree.Node
    | undefined;

  while (container) {
    if (
      container.type === AST_NODE_TYPES.Program ||
      container.type === AST_NODE_TYPES.TSModuleBlock
    ) {
      const declarations = container.body
        .map((statement) => {
          if (statement.type === AST_NODE_TYPES.TSDeclareFunction) {
            return statement;
          }

          if (
            statement.type === AST_NODE_TYPES.ExportNamedDeclaration &&
            statement.declaration?.type === AST_NODE_TYPES.TSDeclareFunction
          ) {
            return statement.declaration;
          }

          return undefined;
        })
        .filter(
          (
            value,
          ): value is TSESTree.TSDeclareFunction & {
            id: TSESTree.Identifier;
          } => Boolean(value?.id?.name),
        )
        .filter((decl) => decl.id.name === functionName);

      return declarations.length > 1;
    }

    container = container.parent as TSESTree.Node | undefined;
  }

  return false;
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
 * An import read from two annotations is unbound only once both are gone, so
 * neither annotation may unbind it alone — and a fix may only count on the other
 * removal happening if it performs that removal itself. Annotations that jointly
 * keep an import alive are therefore merged into one batch, and every other
 * annotation is a batch of one, judged against the file as it stands.
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

  for (const binding of importBindingReferences(source)) {
    // A single reference cannot be shared, so the one-annotation judgement
    // already covers it.
    if (binding.references.length < 2) continue;

    const owners = new Set<number>();
    const escapes = binding.references.some((reference) => {
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
 * The ranges a single fix deletes for `batch`: the annotations themselves plus
 * any import they were the last consumers of. `null` when a binding the removal
 * orphans cannot be unbound safely — the caller then drops the fix rather than
 * emitting the half of it that leaves a binding behind.
 */
function planRemoval(
  source: TSESLint.SourceCode,
  batch: readonly PendingAnnotation[],
): TextRange[] | null {
  const annotations = batch.map((entry) => entry.returnType.range);
  const imports = planOrphanedImportRemoval(source, annotations);
  return imports ? [...annotations, ...imports] : null;
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
       * Whether ESLint will discard a report, resolved the way ESLint resolves
       * it. A fix that deletes several annotations at once is counting on all of
       * them being reportable; a suppressed one keeps its type reference, so it
       * must be left out of every batch.
       */
      const isReportSuppressed = createSuppressionChecker(context);

      // Edges are resolved lazily, and only for functions a direct
      // self-reference has already failed to explain.
      const participatesInReturnCycle = createReturnCycleResolver(visitorKeys);

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
       * Emits every held report, each carrying the import cleanup its own
       * removal makes necessary. An annotation and the import it unbinds are one
       * fix: applying either half alone leaves the file worse than applying
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
       * (issue #1654). The annotations that jointly hold an import alive are
       * therefore removed by one fix, which owes two things: it deletes all of
       * them itself rather than assuming sibling reports land, and it counts
       * only annotations whose reports ESLint will not discard.
       */
      function flushReports(): void {
        const strippable = pending.filter((entry) => entry.strippable);

        // Every annotation starts with the judgement it would get alone, so a
        // batch can only ever add a cleanup, never withdraw one.
        const plans = new Map<PendingAnnotation, TextRange[]>();
        for (const entry of strippable) {
          const plan = planRemoval(sourceCode, [entry]);
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
          const plan = planRemoval(sourceCode, batch);
          if (!plan) continue;
          for (const entry of batch) {
            plans.set(entry, plan);
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
                    plan.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
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
