import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

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
  },
];

const defaultOptions: Options[0] = {
  allowRecursiveFunctions: true,
  allowOverloadedFunctions: true,
  allowInterfaceMethodSignatures: true,
  allowAbstractMethodSignatures: true,
  allowDtsFiles: true,
  allowFirestoreFunctionFiles: true,
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
  if (
    !node.computed &&
    (node.key.type === AST_NODE_TYPES.Identifier ||
      (node.key.type === AST_NODE_TYPES.Literal &&
        typeof node.key.value === 'string'))
  ) {
    const name = getNameFromIdentifierOrLiteral(node.key);
    if (name) {
      return `interface method "${name}"`;
    }
  }

  return 'interface method';
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

function moduleScopeFunctions(
  program: TSESTree.Program,
): Map<string, FunctionWithBody> {
  const functions = new Map<string, FunctionWithBody>();

  const statements = program.body.map((statement) => {
    if (
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration ||
      statement.type === AST_NODE_TYPES.ExportDefaultDeclaration
    ) {
      return statement.declaration ?? statement;
    }
    return statement;
  });

  for (const statement of statements) {
    if (
      statement.type === AST_NODE_TYPES.FunctionDeclaration &&
      statement.id &&
      statement.body
    ) {
      functions.set(statement.id.name, statement);
      continue;
    }

    if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        const init = declarator.init;
        if (
          declarator.id.type === AST_NODE_TYPES.Identifier &&
          init &&
          (init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            (init.type === AST_NODE_TYPES.FunctionExpression && init.body))
        ) {
          functions.set(declarator.id.name, init);
        }
      }
    }
  }

  return functions;
}

/**
 * Maps each module-scope function name to the names it references from its own
 * return expressions. A cycle in this graph is mutual recursion, which triggers
 * the same TS7023 as direct self-reference.
 */
function buildReturnReferenceGraph(
  program: TSESTree.Program,
  visitorKeys: VisitorKeys,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const [name, fn] of moduleScopeFunctions(program)) {
    graph.set(name, collectReturnIdentifierNames(fn, visitorKeys));
  }

  return graph;
}

function participatesInReturnCycle(
  name: string,
  graph: Map<string, Set<string>>,
): boolean {
  const seen = new Set<string>();
  const stack = [...(graph.get(name) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === name) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(graph.get(current) ?? []));
  }

  return false;
}

function isOverloadedFunction(node: TSESTree.Node): boolean {
  if (!node.parent) return false;

  if (node.type === AST_NODE_TYPES.TSMethodSignature) {
    const interfaceBody = node.parent;
    if (interfaceBody.type !== AST_NODE_TYPES.TSInterfaceBody) return false;

    if (node.computed) return false;

    const methodName =
      node.key.type === AST_NODE_TYPES.Identifier ||
      node.key.type === AST_NODE_TYPES.Literal
        ? getNameFromIdentifierOrLiteral(node.key)
        : undefined;
    if (!methodName) return false;

    return (
      interfaceBody.body.filter(
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

      // Built at most once per file, and only when a direct self-reference has
      // already been ruled out.
      let returnReferenceGraph: Map<string, Set<string>> | undefined;

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
        if (identifierNames.length === 0) return false;

        if (!returnReferenceGraph) {
          returnReferenceGraph = buildReturnReferenceGraph(
            sourceCode.ast,
            visitorKeys,
          );
        }
        const graph = returnReferenceGraph;

        return identifierNames.some((name) =>
          participatesInReturnCycle(name, graph),
        );
      }

      if (
        (mergedOptions.allowDtsFiles && filename.endsWith('.d.ts')) ||
        (mergedOptions.allowFirestoreFunctionFiles &&
          filename.endsWith('.f.ts'))
      ) {
        return {};
      }

      type FixableNode =
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | TSESTree.MethodDefinition;

      function fixReturnType(
        fixer: TSESLint.RuleFixer,
        node: FixableNode,
      ): TSESLint.RuleFix | null {
        // Some nodes expose returnType directly while others nest it under value.
        const returnType =
          'returnType' in node
            ? node.returnType
            : 'value' in node
            ? node.value.returnType
            : null;
        if (!returnType) return null;

        return fixer.remove(returnType);
      }

      return {
        FunctionDeclaration(node) {
          const returnType = node.returnType;
          if (!returnType) return;

          if (
            isTypeGuardFunction(node) ||
            isReadonlyWideningReturnType(returnType) ||
            (mergedOptions.allowRecursiveFunctions &&
              isRecursiveFunction(node)) ||
            isReturnTypeRequiredByRecursion(node)
          ) {
            return;
          }

          const isInferable = Boolean(node.body);

          context.report({
            node: returnType,
            messageId: isInferable
              ? 'noExplicitReturnTypeInferable'
              : 'noExplicitReturnTypeNonInferable',
            data: { functionKind: describeFunctionKind(node) },
            ...(isInferable
              ? { fix: (fixer) => fixReturnType(fixer, node) }
              : {}),
          });
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
            (mergedOptions.allowRecursiveFunctions &&
              isRecursiveFunction(node)) ||
            isReturnTypeRequiredByRecursion(node)
          ) {
            return;
          }

          context.report({
            node: returnType,
            messageId: 'noExplicitReturnTypeInferable',
            data: { functionKind: describeFunctionKind(node) },
            fix: (fixer) => fixReturnType(fixer, node),
          });
        },

        ArrowFunctionExpression(node) {
          const returnType = node.returnType;
          if (!returnType) return;

          if (
            isTypeGuardFunction(node) ||
            isReadonlyWideningReturnType(returnType) ||
            isReturnTypeRequiredByRecursion(node)
          ) {
            return;
          }

          context.report({
            node: returnType,
            messageId: 'noExplicitReturnTypeInferable',
            data: { functionKind: describeFunctionKind(node) },
            fix: (fixer) => fixReturnType(fixer, node),
          });
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

          context.report({
            node: returnType,
            messageId: 'noExplicitReturnTypeNonInferable',
            data: { functionKind: describeFunctionKind(node) },
          });
        },

        MethodDefinition(node) {
          const returnType = node.value.returnType;
          if (!returnType) return;

          if (
            isTypeGuardFunction(node.value) ||
            isReadonlyWideningReturnType(returnType) ||
            (mergedOptions.allowAbstractMethodSignatures &&
              isInterfaceOrAbstractMethodSignature(node)) ||
            isReturnTypeRequiredByRecursion(node)
          ) {
            return;
          }

          const isInferable = Boolean(node.value.body);

          context.report({
            node: returnType,
            messageId: isInferable
              ? 'noExplicitReturnTypeInferable'
              : 'noExplicitReturnTypeNonInferable',
            data: { functionKind: describeFunctionKind(node) },
            ...(isInferable
              ? { fix: (fixer) => fixReturnType(fixer, node) }
              : {}),
          });
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
          context.report({
            node: returnType,
            messageId: 'noExplicitReturnTypeNonInferable',
            data: { functionKind: describeFunctionKind(node) },
          });
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

          context.report({
            node: returnType,
            messageId: 'noExplicitReturnTypeNonInferable',
            data: { functionKind: describeFunctionKind(node) },
          });
        },
      };
    },
  });
