import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type OptionShape = {
  stripPrefixes?: string[];
  ignoredMethods?: string[];
  factoryMethods?: string[];
  ignoreAsync?: boolean;
  ignoreVoidReturn?: boolean;
  ignoreAbstract?: boolean;
  respectJsDocSideEffects?: boolean;
  minBodyLines?: number;
};

type Options = [OptionShape];

type MessageIds = 'preferGetter' | 'preferGetterSideEffect';
type MethodLikeDefinition =
  | TSESTree.MethodDefinition
  | TSESTree.TSAbstractMethodDefinition;

type PropertyLikeDefinition =
  | TSESTree.PropertyDefinition
  | TSESTree.TSAbstractPropertyDefinition;

/**
 * Every class member that can carry a member function. A field initialized with
 * an arrow (`fullName = () => ...`) is invoked exactly as its method twin is —
 * `instance.fullName()` — so the two spellings are one subject, and writing `=`
 * must not decide whether the rule looks (#2158).
 */
type MemberLikeDefinition = MethodLikeDefinition | PropertyLikeDefinition;

function isPropertyLike(
  node: MemberLikeDefinition,
): node is PropertyLikeDefinition {
  return (
    node.type === AST_NODE_TYPES.PropertyDefinition ||
    node.type === AST_NODE_TYPES.TSAbstractPropertyDefinition
  );
}

const DEFAULT_PREFIXES = [
  'build',
  'get',
  'compute',
  'calculate',
  'retrieve',
  'extract',
  'create',
  'generate',
  'make',
  'fetch',
  'load',
  'derive',
  'resolve',
  'determine',
  'find',
  'obtain',
  'produce',
  'acquire',
];

const DEFAULT_IGNORED_METHODS = [
  'toString',
  'toJSON',
  'valueOf',
  'clone',
  'copy',
  'serialize',
  'deserialize',
  'parse',
  'stringify',
];

/**
 * Builder/factory terminal methods whose external callers (in other files)
 * would break if converted to getters. These are imperative actions, not
 * computed properties — per origin issue #990 edge case #4.
 */
const DEFAULT_FACTORY_METHODS = ['build', 'create', 'make'];

const SIDE_EFFECT_TAGS = ['sideEffect', 'sideEffects', 'mutates'];

const DEFAULT_OPTIONS: Required<OptionShape> = {
  stripPrefixes: DEFAULT_PREFIXES,
  ignoredMethods: DEFAULT_IGNORED_METHODS,
  factoryMethods: DEFAULT_FACTORY_METHODS,
  ignoreAsync: true,
  ignoreVoidReturn: true,
  ignoreAbstract: true,
  respectJsDocSideEffects: true,
  minBodyLines: 0,
};

const MUTATING_ARRAY_METHODS = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
];

const MUTATING_COLLECTION_METHODS = ['set', 'add', 'delete', 'clear'];

function isVoidishType(node: TSESTree.TypeNode | TSESTree.Node): boolean {
  switch (node.type) {
    case AST_NODE_TYPES.TSVoidKeyword:
    case AST_NODE_TYPES.TSUndefinedKeyword:
      return true;
    case AST_NODE_TYPES.TSUnionType:
      return node.types.every(isVoidishType);
    default:
      return false;
  }
}

/**
 * Type names whose values are awaited rather than read. `PromiseLike` counts
 * because thenability — not the `Promise` constructor — is what makes a value
 * an awaited one, and a `PromiseLike` member is as unconvertible as a `Promise`
 * one.
 */
const THENABLE_TYPE_NAMES = new Set(['Promise', 'PromiseLike']);

/**
 * `Promise` statics whose result is a promise whatever they are handed, so a
 * `return Promise.all(...)` is a promise return with no annotation to read.
 */
const PROMISE_STATIC_PRODUCERS = new Set([
  'resolve',
  'reject',
  'all',
  'allSettled',
  'race',
  'any',
]);

/**
 * Methods a promise answers, whose own result is another promise. `then` is the
 * definition of thenable; `catch`/`finally` are sugar over it.
 */
const THENABLE_CHAIN_METHODS = new Set(['then', 'catch', 'finally']);

/**
 * The final segment of a type name, so a qualified spelling
 * (`globalThis.Promise<T>`, `bluebird.Promise<T>`) is recognized as the thenable
 * it names rather than dismissed for not being a bare `Identifier`.
 */
function rightmostTypeName(typeName: TSESTree.EntityName): string | null {
  if (typeName.type === AST_NODE_TYPES.Identifier) return typeName.name;
  if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
    return typeName.right.name;
  }
  return null;
}

/**
 * Whether a *written* type annotation denotes a thenable.
 *
 * This is deliberately syntactic and deliberately not exhaustive: the rule
 * requests no parser services, so an alias that happens to resolve to a promise
 * is out of reach. Failing to spot one costs a report the rule would otherwise
 * have made, which is the safe direction — the unsafe one is prescribing (and
 * on `private` members, applying) a getter rewrite that breaks every caller.
 */
function isThenableTypeNode(node: TSESTree.Node | undefined | null): boolean {
  if (!node) return false;

  switch (node.type) {
    case AST_NODE_TYPES.TSTypeReference: {
      const name = rightmostTypeName(node.typeName);
      return name !== null && THENABLE_TYPE_NAMES.has(name);
    }
    // A container that can hold a thenable still hands the caller one:
    // `Promise<T> | undefined` is awaited at the call site exactly as `Promise<T>`
    // is, and an intersection carries every constituent's contract.
    case AST_NODE_TYPES.TSUnionType:
    case AST_NODE_TYPES.TSIntersectionType:
      return node.types.some(isThenableTypeNode);
    default:
      return false;
  }
}

/** Every function-valued node a class member can carry. */
type FunctionLikeValue =
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.TSEmptyBodyFunctionExpression;

function isFunctionLikeNode(value: TSESTree.Node): boolean {
  return (
    value.type === AST_NODE_TYPES.FunctionExpression ||
    value.type === AST_NODE_TYPES.FunctionDeclaration ||
    value.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

/**
 * The member function a class member carries, or null when it carries none. A
 * method's value is always a function; a field's value is one only when it is
 * written as an arrow or a function expression, which is what makes the field a
 * member function rather than data.
 */
function memberFunctionOf(
  node: MemberLikeDefinition,
): FunctionLikeValue | null {
  if (!isPropertyLike(node)) return node.value;

  const value = node.value;
  if (
    value &&
    (value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      value.type === AST_NODE_TYPES.FunctionExpression)
  ) {
    return value;
  }
  return null;
}

/**
 * The return type a FIELD's own annotation declares for the function it holds.
 * `render: () => void = () => this.draw()` states the member's contract beside
 * the field name rather than on the arrow, and that contract is what a caller
 * reads — so it answers the void and promise questions the same way an arrow's
 * own `(): void` annotation does.
 */
function declaredFunctionReturnType(
  node: MemberLikeDefinition,
): TSESTree.TypeNode | null {
  if (!isPropertyLike(node)) return null;

  const annotation = node.typeAnnotation?.typeAnnotation;
  if (!annotation || annotation.type !== AST_NODE_TYPES.TSFunctionType) {
    return null;
  }
  return annotation.returnType?.typeAnnotation ?? null;
}

/**
 * The nodes a top-level body walk starts from. A concise arrow body is a single
 * expression rather than a statement list, and every walk here is about what
 * the member's OWN scope does, so the expression is that scope's whole content.
 */
function bodyWalkRoots(fn: FunctionLikeValue): TSESTree.Node[] {
  const body = fn.body;
  if (!body) return [];
  return body.type === AST_NODE_TYPES.BlockStatement ? [...body.body] : [body];
}

function lowerFirst(text: string): string {
  if (!text) return text;
  return text[0].toLowerCase() + text.slice(1);
}

/**
 * The member's name as it is written, keeping the `#` of an ECMA private name.
 * `#foo` and `foo` are two distinct members of the same class, so every
 * name-keyed lookup here (collision, call-use, self-reference, duplicate
 * suggestion) must carry the sigil rather than compare bare names. Returns null
 * for keys whose name is not statically known (computed, literal, template).
 */
function memberNameOf(
  key: TSESTree.Node | undefined | null,
  computed?: boolean,
): string | null {
  if (!key || computed) return null;
  if (key.type === AST_NODE_TYPES.Identifier) return key.name;
  if (key.type === AST_NODE_TYPES.PrivateIdentifier) return `#${key.name}`;
  return null;
}

function isEcmaPrivateName(name: string): boolean {
  return name.startsWith('#');
}

function computeBodyLineCount(fn: FunctionLikeValue): number {
  const body = fn.body;
  if (!body) return 0;
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    // A concise body has no braces of its own, so its span IS its content: a
    // one-line body counts 0, exactly as the one-line block spelling does.
    return Math.max(0, body.loc.end.line - body.loc.start.line);
  }
  return Math.max(0, body.loc.end.line - body.loc.start.line - 1);
}

function hasNameCollision(
  node: MemberLikeDefinition,
  newName: string,
): boolean {
  const classBody = node.parent;
  if (!classBody || classBody.type !== AST_NODE_TYPES.ClassBody) {
    return false;
  }

  const targetIsStatic = (node as { static?: boolean }).static ?? false;
  // An ECMA private name lives in a single per-class namespace: `class A {
  // static #x = 1; #x = 2; }` is a SyntaxError ("Identifier '#x' has already
  // been declared"). The static/instance split that keeps two `x` members apart
  // therefore does not keep two `#x` members apart.
  const targetIsEcmaPrivate = isEcmaPrivateName(newName);

  return classBody.body.some((member) => {
    if ((member as unknown as MemberLikeDefinition) === node) {
      return false;
    }

    const key = (member as { key?: TSESTree.PropertyName }).key;
    if (!key || member.type === AST_NODE_TYPES.StaticBlock) {
      return false;
    }

    if ((member as { computed?: boolean }).computed) {
      return false;
    }

    const memberIsStatic = (member as { static?: boolean }).static ?? false;
    if (!targetIsEcmaPrivate && memberIsStatic !== targetIsStatic) {
      return false;
    }

    if (
      member.type === AST_NODE_TYPES.MethodDefinition &&
      member.kind === 'set'
    ) {
      return false;
    }

    return memberNameOf(key) === newName;
  });
}

function hasOverloadSignatures(node: MethodLikeDefinition): boolean {
  const classBody = node.parent;
  if (!classBody || classBody.type !== AST_NODE_TYPES.ClassBody) {
    return false;
  }

  const targetName = memberNameOf(node.key, node.computed);
  if (targetName === null) {
    return false;
  }

  const targetIsStatic = (node as { static?: boolean }).static ?? false;

  return classBody.body.some((member) => {
    if (
      member.type !== AST_NODE_TYPES.MethodDefinition &&
      member.type !== AST_NODE_TYPES.TSAbstractMethodDefinition
    ) {
      return false;
    }

    if ((member as { computed?: boolean }).computed) {
      return false;
    }

    const memberName = memberNameOf(
      (member as { key?: TSESTree.PropertyName }).key,
    );
    if (memberName === null) {
      return false;
    }

    const memberIsStatic = (member as { static?: boolean }).static ?? false;
    if (memberIsStatic !== targetIsStatic) {
      return false;
    }

    if (
      member.type === AST_NODE_TYPES.MethodDefinition &&
      member.kind !== 'method'
    ) {
      return false;
    }

    const hasBody = (
      member as TSESTree.MethodDefinition | TSESTree.TSAbstractMethodDefinition
    ).value?.body;

    return !hasBody && memberName === targetName;
  });
}

type ClassLikeNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;

/**
 * Member names a class inherits an obligation for, split by the side of the
 * class they live on: an `implements` clause constrains only the instance side,
 * while `extends` constrains both. `resolved` goes false as soon as any part of
 * the contract chain leaves the file (an imported/global/qualified reference, a
 * mixin call, a mapped or conditional type), because the members of that part
 * are unknowable from a single file.
 */
type ContractMembers = {
  instance: Set<string>;
  staticSide: Set<string>;
  resolved: boolean;
};

type HeritageContract =
  | { status: 'none' }
  | { status: 'unresolvable' }
  | { status: 'resolved'; members: ContractMembers };

function getClassOf(node: MemberLikeDefinition): ClassLikeNode | null {
  const classBody = node.parent;
  if (!classBody || classBody.type !== AST_NODE_TYPES.ClassBody) {
    return null;
  }

  const classNode = classBody.parent;
  if (
    classNode &&
    (classNode.type === AST_NODE_TYPES.ClassDeclaration ||
      classNode.type === AST_NODE_TYPES.ClassExpression)
  ) {
    return classNode;
  }

  return null;
}

/**
 * A member typed as a function is as binding as a method signature: a getter
 * returning the function's *result* is not assignable to the function type, so
 * such a member is a contract match too.
 */
function isFunctionTypeNode(node: TSESTree.Node | undefined | null): boolean {
  if (!node) return false;

  switch (node.type) {
    case AST_NODE_TYPES.TSFunctionType:
    case AST_NODE_TYPES.TSConstructorType:
      return true;
    case AST_NODE_TYPES.TSUnionType:
    case AST_NODE_TYPES.TSIntersectionType:
      return node.types.some(isFunctionTypeNode);
    default:
      return false;
  }
}

function knownMemberName(
  key: TSESTree.Node | undefined,
  computed: boolean | undefined,
): string | null {
  if (!key || computed) return null;
  if (key.type === AST_NODE_TYPES.Identifier) return key.name;
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }
  return null;
}

function findVariableInScopeChain(
  scope: TSESLint.Scope.Scope | null,
  name: string,
): TSESLint.Scope.Variable | null {
  let current = scope;
  while (current) {
    const variable = current.variables.find((entry) => entry.name === name);
    if (variable) {
      return variable;
    }
    current = current.upper;
  }
  return null;
}

function collectTypeElementMembers(
  elements: TSESTree.TypeElement[],
  out: ContractMembers,
) {
  for (const element of elements) {
    if (element.type === AST_NODE_TYPES.TSMethodSignature) {
      // A `get`/`set` signature already describes property access, so a getter
      // implementation satisfies it — only call signatures bind.
      if (element.kind === 'get' || element.kind === 'set') continue;
      const name = knownMemberName(element.key, element.computed);
      if (name) out.instance.add(name);
      continue;
    }

    if (
      element.type === AST_NODE_TYPES.TSPropertySignature &&
      isFunctionTypeNode(element.typeAnnotation?.typeAnnotation)
    ) {
      const name = knownMemberName(element.key, element.computed);
      if (name) out.instance.add(name);
    }
  }
}

function collectClassContractMembers(
  classNode: ClassLikeNode,
  out: ContractMembers,
) {
  for (const member of classNode.body.body) {
    if (member.type === AST_NODE_TYPES.StaticBlock) continue;

    const isStatic = (member as { static?: boolean }).static ?? false;
    const target = isStatic ? out.staticSide : out.instance;

    if (
      member.type === AST_NODE_TYPES.MethodDefinition ||
      member.type === AST_NODE_TYPES.TSAbstractMethodDefinition
    ) {
      if (member.kind !== 'method') continue;
      const name = knownMemberName(member.key, member.computed);
      if (name) target.add(name);
      continue;
    }

    if (
      (member.type === AST_NODE_TYPES.PropertyDefinition ||
        member.type === AST_NODE_TYPES.TSAbstractPropertyDefinition) &&
      isFunctionTypeNode(member.typeAnnotation?.typeAnnotation)
    ) {
      const name = knownMemberName(member.key, member.computed);
      if (name) target.add(name);
    }
  }
}

function collectContractFromName(
  name: string,
  scope: TSESLint.Scope.Scope | null,
  seen: Set<string>,
  out: ContractMembers,
) {
  if (seen.has(name)) return;
  seen.add(name);

  const variable = findVariableInScopeChain(scope, name);
  // No binding at all (a global/ambient type) or a binding with no declaration
  // node (a lib type) leaves the contract unknowable from this file.
  if (!variable || variable.defs.length === 0) {
    out.resolved = false;
    return;
  }

  for (const def of variable.defs) {
    const declaration = def.node;
    switch (declaration.type) {
      case AST_NODE_TYPES.TSInterfaceDeclaration:
        collectContractFromInterface(declaration, scope, seen, out);
        break;
      case AST_NODE_TYPES.TSTypeAliasDeclaration:
        collectContractFromTypeNode(
          declaration.typeAnnotation,
          scope,
          seen,
          out,
        );
        break;
      case AST_NODE_TYPES.ClassDeclaration:
      case AST_NODE_TYPES.ClassExpression:
        collectContractFromClass(declaration, scope, seen, out);
        break;
      default:
        // An import binding, an enum, a value — nothing whose members this file
        // can enumerate.
        out.resolved = false;
    }
  }
}

function collectContractFromHeritage(
  heritage: TSESTree.TSClassImplements | TSESTree.TSInterfaceHeritage,
  scope: TSESLint.Scope.Scope | null,
  seen: Set<string>,
  out: ContractMembers,
) {
  // A qualified reference (`ns.Type`) names a declaration this lookup cannot
  // reach, so the contract stays unresolved.
  if (heritage.expression.type !== AST_NODE_TYPES.Identifier) {
    out.resolved = false;
    return;
  }
  collectContractFromName(heritage.expression.name, scope, seen, out);
}

function collectContractFromInterface(
  declaration: TSESTree.TSInterfaceDeclaration,
  scope: TSESLint.Scope.Scope | null,
  seen: Set<string>,
  out: ContractMembers,
) {
  collectTypeElementMembers(declaration.body.body, out);

  for (const heritage of [
    ...(declaration.extends ?? []),
    ...(declaration.implements ?? []),
  ]) {
    collectContractFromHeritage(heritage, scope, seen, out);
  }
}

function collectContractFromClass(
  declaration: ClassLikeNode,
  scope: TSESLint.Scope.Scope | null,
  seen: Set<string>,
  out: ContractMembers,
) {
  collectClassContractMembers(declaration, out);

  if (declaration.superClass) {
    if (declaration.superClass.type === AST_NODE_TYPES.Identifier) {
      collectContractFromName(declaration.superClass.name, scope, seen, out);
    } else {
      // A mixin call or member expression base class: unknowable members.
      out.resolved = false;
    }
  }

  for (const heritage of declaration.implements ?? []) {
    collectContractFromHeritage(heritage, scope, seen, out);
  }
}

function collectContractFromTypeNode(
  typeNode: TSESTree.TypeNode,
  scope: TSESLint.Scope.Scope | null,
  seen: Set<string>,
  out: ContractMembers,
) {
  switch (typeNode.type) {
    case AST_NODE_TYPES.TSTypeLiteral:
      collectTypeElementMembers(typeNode.members, out);
      return;
    case AST_NODE_TYPES.TSIntersectionType:
      for (const part of typeNode.types) {
        collectContractFromTypeNode(part, scope, seen, out);
      }
      return;
    case AST_NODE_TYPES.TSTypeReference:
      if (typeNode.typeName.type === AST_NODE_TYPES.Identifier) {
        collectContractFromName(typeNode.typeName.name, scope, seen, out);
        return;
      }
      out.resolved = false;
      return;
    default:
      // Mapped, conditional, indexed-access and utility-type shapes describe
      // members this rule cannot enumerate syntactically.
      out.resolved = false;
  }
}

/**
 * Resolves what the class's `extends`/`implements` clauses oblige its members
 * to look like, using only declarations visible in the file being linted.
 */
function resolveHeritageContract(
  classNode: ClassLikeNode,
  scope: TSESLint.Scope.Scope | null,
): HeritageContract {
  const heritageNames: string[] = [];
  let hasOpaqueHeritage = false;

  if (classNode.superClass) {
    if (classNode.superClass.type === AST_NODE_TYPES.Identifier) {
      heritageNames.push(classNode.superClass.name);
    } else {
      hasOpaqueHeritage = true;
    }
  }

  for (const implemented of classNode.implements ?? []) {
    if (implemented.expression.type === AST_NODE_TYPES.Identifier) {
      heritageNames.push(implemented.expression.name);
    } else {
      hasOpaqueHeritage = true;
    }
  }

  if (!heritageNames.length && !hasOpaqueHeritage) {
    return { status: 'none' };
  }

  if (hasOpaqueHeritage) {
    return { status: 'unresolvable' };
  }

  const members: ContractMembers = {
    instance: new Set<string>(),
    staticSide: new Set<string>(),
    resolved: true,
  };
  const seen = new Set<string>();

  for (const name of heritageNames) {
    collectContractFromName(name, scope, seen, members);
  }

  return members.resolved
    ? { status: 'resolved', members }
    : { status: 'unresolvable' };
}

export const preferGetterOverParameterlessMethod = createRule<
  Options,
  MessageIds
>({
  name: 'prefer-getter-over-parameterless-method',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce getter syntax for synchronous parameterless methods that return values, improving semantic clarity and avoiding accidental method invocation without parentheses.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          stripPrefixes: {
            type: 'array',
            items: { type: 'string' },
          },
          ignoredMethods: {
            type: 'array',
            items: { type: 'string' },
          },
          factoryMethods: {
            type: 'array',
            items: { type: 'string' },
          },
          ignoreAsync: {
            type: 'boolean',
          },
          ignoreVoidReturn: {
            type: 'boolean',
          },
          ignoreAbstract: {
            type: 'boolean',
          },
          respectJsDocSideEffects: {
            type: 'boolean',
          },
          minBodyLines: {
            type: 'number',
            minimum: 0,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferGetter:
        'Problem: Method "{{name}}" is a parameterless synchronous method that returns a value. → Impact: Calling it with parentheses disguises that it behaves like a computed property, increasing the chance callers omit parentheses or treat it like an action. → Solution: Convert it to a getter: "get {{suggestedName}}()" to signal property semantics and remove call-site parentheses.',
      preferGetterSideEffect:
        'Problem: Method "{{name}}" looks like a computed value. → Impact: However, {{reason}}, so converting it to a getter would execute side effects on every property access and violate the principle of least surprise. → Solution: If the side effects are intentional, declare them with an "@sideEffect" (or "@mutates") tag inside a /** */ JSDoc block placed immediately above "{{name}}" with no blank line between: the tag warns callers that reading this value performs work, and the rule honors it (option "respectJsDocSideEffects", enabled by default) and stops reporting the method. If the side effects are not intentional, remove them and convert the method to "get {{suggestedName}}()".',
    },
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(context, [options]) {
    const userOptions = options ?? {};
    const config = {
      ...DEFAULT_OPTIONS,
      ...userOptions,
      stripPrefixes: userOptions.stripPrefixes ?? DEFAULT_OPTIONS.stripPrefixes,
      ignoredMethods:
        userOptions.ignoredMethods ?? DEFAULT_OPTIONS.ignoredMethods,
      factoryMethods:
        userOptions.factoryMethods ?? DEFAULT_OPTIONS.factoryMethods,
    };

    const ignoredMethods = new Set(config.ignoredMethods);
    const factoryMethods = new Set(config.factoryMethods);
    const prefixList = config.stripPrefixes;
    const sourceCode = context.getSourceCode();
    const ignoredTraversalKeys = new Set(['parent', 'loc', 'range']);

    function ensureGlobalPattern(pattern: RegExp) {
      const flags = pattern.flags.includes('g')
        ? pattern.flags
        : `${pattern.flags}g`;
      return new RegExp(pattern.source, flags);
    }

    function pushChildNodes(current: TSESTree.Node, stack: TSESTree.Node[]) {
      for (const [key, value] of Object.entries(current)) {
        if (ignoredTraversalKeys.has(key)) continue;
        if (!value) continue;
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof (item as any).type === 'string') {
              stack.push(item as TSESTree.Node);
            }
          }
        } else if (typeof (value as any).type === 'string') {
          stack.push(value as TSESTree.Node);
        }
      }
    }

    function getEnclosingClassBody(
      node: TSESTree.Node | null,
    ): TSESTree.ClassBody | null {
      let current: TSESTree.Node | null = node;
      while (current) {
        if (current.type === AST_NODE_TYPES.ClassBody) {
          return current;
        }
        current = (current.parent as TSESTree.Node | null) ?? null;
      }
      return null;
    }

    function addCallUse(
      node: TSESTree.Node,
      propName: string,
      callUsedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      callUsedNamesInFile: Set<string>,
    ) {
      callUsedNamesInFile.add(propName);

      const classBody = getEnclosingClassBody(node);
      if (!classBody) {
        return;
      }

      let names = callUsedNamesByClass.get(classBody);
      if (!names) {
        names = new Set<string>();
        callUsedNamesByClass.set(classBody, names);
      }

      names.add(propName);
    }

    function addCallUseForMember(
      member: TSESTree.MemberExpression,
      propName: string,
      callUsedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      callUsedNamesInFile: Set<string>,
    ) {
      addCallUse(member, propName, callUsedNamesByClass, callUsedNamesInFile);
    }

    function getJsDoc(node: MemberLikeDefinition) {
      const comments = sourceCode.getCommentsBefore(node);
      const candidate = comments[comments.length - 1];
      if (
        candidate &&
        candidate.type === 'Block' &&
        candidate.value.startsWith('*') &&
        candidate.loc &&
        node.loc &&
        candidate.loc.end.line === node.loc.start.line - 1
      ) {
        return candidate;
      }
      return null;
    }

    function hasSideEffectTag(node: MemberLikeDefinition): boolean {
      const jsDoc = getJsDoc(node);
      if (!jsDoc) {
        return false;
      }

      const value = jsDoc.value;
      if (SIDE_EFFECT_TAGS.some((tag) => value.includes(`@${tag}`))) {
        return true;
      }

      const normalized = value.toLowerCase().replace(/[-\s]+/g, ' ');
      const negationPattern =
        /\b(?:no|without|not|non|none|never|free of|lack|lacks|lacking|avoid|avoids|avoiding)\b/;

      /**
       * Detects matches that are not negated within a short preceding context.
       * Uses a 24-character lookback to catch nearby negations like "no", "not",
       * or "without" that typically appear immediately before side-effect wording,
       * balancing coverage with keeping false positives low.
       */
      const matchesAffirmative = (pattern: RegExp) => {
        const globalPattern = ensureGlobalPattern(pattern);
        const matches = normalized.matchAll(globalPattern);
        for (const match of matches) {
          const start = match.index ?? 0;
          const windowStart = Math.max(0, start - 24);
          const window = normalized.slice(windowStart, start);
          if (!negationPattern.test(window)) {
            return true;
          }
        }
        return false;
      };

      return (
        matchesAffirmative(/\bside effects?\b/) ||
        matchesAffirmative(/\bmutat(?:e|es|ing|ion|ions|ed|ive|ively)?\b/)
      );
    }

    function analyzeMutations(fn: FunctionLikeValue): string | null {
      const stack: TSESTree.Node[] = bodyWalkRoots(fn);

      while (stack.length) {
        const current = stack.pop() as TSESTree.Node;

        if (isFunctionLikeNode(current)) {
          continue;
        }

        if (
          current.type === AST_NODE_TYPES.UnaryExpression &&
          current.operator === 'delete'
        ) {
          return `it deletes ${sourceCode.getText(current.argument)}`;
        }

        if (current.type === AST_NODE_TYPES.UpdateExpression) {
          return 'it mutates state with ++/--';
        }

        if (current.type === AST_NODE_TYPES.AssignmentExpression) {
          if (current.left.type === AST_NODE_TYPES.MemberExpression) {
            return `it assigns to ${sourceCode.getText(current.left)}`;
          }
        }

        if (current.type === AST_NODE_TYPES.CallExpression) {
          const callee = current.callee;
          if (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            callee.property.type === AST_NODE_TYPES.Identifier &&
            (MUTATING_ARRAY_METHODS.includes(callee.property.name) ||
              MUTATING_COLLECTION_METHODS.includes(callee.property.name))
          ) {
            return `it calls mutating method ${callee.property.name}()`;
          }
        }

        pushChildNodes(current, stack);
      }

      return null;
    }

    function returnsValue(
      node: MemberLikeDefinition,
      fn: FunctionLikeValue,
    ): boolean {
      const returnType =
        fn.returnType?.typeAnnotation ?? declaredFunctionReturnType(node);
      if (returnType) {
        if (isVoidishType(returnType)) {
          return false;
        }
        return true;
      }

      const body = fn.body;
      if (!body) return false;

      // A concise arrow body IS the value handed back; the subject visitor has
      // already required it to be one that cannot be read as a command.
      if (body.type !== AST_NODE_TYPES.BlockStatement) return true;

      const stack: TSESTree.Node[] = [...body.body];
      while (stack.length) {
        const current = stack.pop() as TSESTree.Node;
        if (isFunctionLikeNode(current)) {
          continue;
        }
        if (
          current.type === AST_NODE_TYPES.ReturnStatement &&
          current.argument
        ) {
          return true;
        }
        pushChildNodes(current, stack);
      }

      return false;
    }

    /**
     * The expressions the method itself returns. A `return` inside a nested
     * function is that callback's result, not the method's, so those are skipped
     * exactly as every other body walk here skips them.
     */
    function collectReturnedExpressions(
      body: TSESTree.BlockStatement,
    ): TSESTree.Node[] {
      const returned: TSESTree.Node[] = [];
      const stack: TSESTree.Node[] = [...body.body];

      while (stack.length) {
        const current = stack.pop() as TSESTree.Node;
        if (isFunctionLikeNode(current)) {
          continue;
        }
        if (
          current.type === AST_NODE_TYPES.ReturnStatement &&
          current.argument
        ) {
          returned.push(current.argument);
        }
        pushChildNodes(current, stack);
      }

      return returned;
    }

    /**
     * Whether a function-valued node hands back a thenable: by its `async`
     * keyword, by its own return annotation, or — failing both — by what its
     * body demonstrably returns.
     *
     * `owner` fixes the class body that `this.<name>` resolves against. It stays
     * the originally reported method through every recursion, because a sibling
     * reached from that method's body lives in the same class body.
     */
    function functionYieldsThenable(
      owner: MemberLikeDefinition,
      fn: FunctionLikeValue | null | undefined,
      seen: Set<TSESTree.Node>,
    ): boolean {
      if (!fn) return false;
      if (fn.async) return true;

      const returnType = fn.returnType?.typeAnnotation;
      if (returnType) {
        return isThenableTypeNode(returnType);
      }

      const body = fn.body;
      if (!body) return false;

      // A concise arrow body IS the returned expression.
      if (body.type !== AST_NODE_TYPES.BlockStatement) {
        return isThenableExpression(owner, body, seen);
      }

      return collectReturnedExpressions(body).some((expression) =>
        isThenableExpression(owner, expression, seen),
      );
    }

    /** Recurses into a sibling's body once, never revisiting a function. */
    function siblingFunctionYieldsThenable(
      owner: MemberLikeDefinition,
      fn: FunctionLikeValue | null | undefined,
      seen: Set<TSESTree.Node>,
    ): boolean {
      // `a() { return this.b(); } b() { return this.a(); }` is legal and would
      // otherwise recur forever; visiting each function at most once also bounds
      // the work by the size of the class body.
      if (!fn || seen.has(fn)) return false;
      seen.add(fn);
      return functionYieldsThenable(owner, fn, seen);
    }

    /**
     * Whether `this.<name>` resolves, within the enclosing class body, to a
     * member that yields a thenable.
     *
     * A promise-returning method is often written with no annotation of its own
     * (`readEpoch() { return this.evaluate(); }`), so the sibling's declaration
     * is the only syntactic evidence available without a type checker. The
     * sibling's BODY is consulted when it carries no annotation either, so the
     * exemption survives a sibling transform that strips one — `--fix` under the
     * recommended config runs `no-explicit-return-type` over the same file, and
     * an exemption that only an annotation can carry does not survive it.
     *
     * `viaCall` distinguishes `this.evaluate()` from `this.evaluate`: reading a
     * method without calling it yields the function object, which is not a
     * thenable however the method is annotated, while reading a getter or a
     * field is what produces its declared type.
     */
    function siblingYieldsThenable(
      owner: MemberLikeDefinition,
      name: string,
      viaCall: boolean,
      seen: Set<TSESTree.Node>,
    ): boolean {
      const classBody = owner.parent;
      if (!classBody || classBody.type !== AST_NODE_TYPES.ClassBody) {
        return false;
      }

      return classBody.body.some((member) => {
        if (member.type === AST_NODE_TYPES.StaticBlock) return false;

        const memberName = memberNameOf(
          (member as { key?: TSESTree.Node }).key,
          (member as { computed?: boolean }).computed,
        );
        if (memberName !== name) return false;

        if (
          member.type === AST_NODE_TYPES.MethodDefinition ||
          member.type === AST_NODE_TYPES.TSAbstractMethodDefinition
        ) {
          const readsAsValue = member.kind === 'get' ? !viaCall : viaCall;
          return (
            readsAsValue &&
            siblingFunctionYieldsThenable(owner, member.value, seen)
          );
        }

        if (
          member.type === AST_NODE_TYPES.PropertyDefinition ||
          member.type === AST_NODE_TYPES.TSAbstractPropertyDefinition
        ) {
          const annotation = member.typeAnnotation?.typeAnnotation;
          const value = member.value;
          const isFunctionValued =
            !!value &&
            (value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              value.type === AST_NODE_TYPES.FunctionExpression);

          if (!viaCall) {
            if (isThenableTypeNode(annotation)) return true;
            // An un-annotated field initialized to a promise (`private pending =
            // Promise.resolve(x)`) is thenable on its own evidence. A
            // function-valued field is not: reading it yields the function.
            return (
              !annotation &&
              !isFunctionValued &&
              !!value &&
              isThenableExpression(owner, value, seen)
            );
          }

          // A called field is function-valued, so its RETURN type is what
          // reaches the caller.
          if (annotation?.type === AST_NODE_TYPES.TSFunctionType) {
            return isThenableTypeNode(annotation.returnType?.typeAnnotation);
          }

          return (
            isFunctionValued &&
            siblingFunctionYieldsThenable(
              owner,
              value as FunctionLikeValue,
              seen,
            )
          );
        }

        return false;
      });
    }

    /** `Promise`, however it is qualified (`globalThis.Promise`, `bluebird.Promise`). */
    function isPromiseNamespace(expression: TSESTree.Node): boolean {
      if (expression.type === AST_NODE_TYPES.Identifier) {
        return expression.name === 'Promise';
      }
      if (expression.type === AST_NODE_TYPES.MemberExpression) {
        return (
          memberNameOf(expression.property, expression.computed) === 'Promise'
        );
      }
      return false;
    }

    function isThenableCall(
      owner: MemberLikeDefinition,
      call: TSESTree.CallExpression,
      seen: Set<TSESTree.Node>,
    ): boolean {
      // An optional call is a `ChainExpression` WRAPPING the call, so the
      // callee here is always the plain member expression; the chain wrapper is
      // unwrapped one level up.
      const callee = call.callee;
      if (callee.type !== AST_NODE_TYPES.MemberExpression) return false;

      const property = memberNameOf(callee.property, callee.computed);
      if (property === null) return false;

      if (
        isPromiseNamespace(callee.object) &&
        PROMISE_STATIC_PRODUCERS.has(property)
      ) {
        return true;
      }

      if (THENABLE_CHAIN_METHODS.has(property)) return true;

      if (callee.object.type === AST_NODE_TYPES.ThisExpression) {
        return siblingYieldsThenable(owner, property, true, seen);
      }

      return false;
    }

    /**
     * Whether a returned expression is demonstrably a thenable. Recursion is
     * confined to combinators that pass a value straight through (assertions,
     * `?:`, `&&`/`||`/`??`, optional chains), so the answer always rests on one
     * of the concrete producers above rather than on a guess about a name.
     */
    function isThenableExpression(
      owner: MemberLikeDefinition,
      expression: TSESTree.Node,
      seen: Set<TSESTree.Node>,
      depth = 0,
    ): boolean {
      if (depth > 4) return false;

      switch (expression.type) {
        // `return await x` only parses inside an `async` method, so the method
        // itself hands the caller a promise.
        case AST_NODE_TYPES.AwaitExpression:
          return true;
        case AST_NODE_TYPES.TSAsExpression:
        case AST_NODE_TYPES.TSSatisfiesExpression:
          return (
            isThenableTypeNode(expression.typeAnnotation) ||
            isThenableExpression(owner, expression.expression, seen, depth + 1)
          );
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.ChainExpression:
          return isThenableExpression(
            owner,
            expression.expression,
            seen,
            depth + 1,
          );
        case AST_NODE_TYPES.ConditionalExpression:
          return (
            isThenableExpression(
              owner,
              expression.consequent,
              seen,
              depth + 1,
            ) ||
            isThenableExpression(owner, expression.alternate, seen, depth + 1)
          );
        case AST_NODE_TYPES.LogicalExpression:
          return (
            isThenableExpression(owner, expression.left, seen, depth + 1) ||
            isThenableExpression(owner, expression.right, seen, depth + 1)
          );
        case AST_NODE_TYPES.CallExpression:
          return isThenableCall(owner, expression, seen);
        case AST_NODE_TYPES.MemberExpression:
          // `return this.pending` where `pending: Promise<T>`.
          return (
            expression.object.type === AST_NODE_TYPES.ThisExpression &&
            siblingYieldsThenable(
              owner,
              memberNameOf(expression.property, expression.computed) ?? '',
              false,
              seen,
            )
          );
        default:
          return false;
      }
    }

    /**
     * Whether the method hands the caller a thenable.
     *
     * TypeScript does not require the `async` keyword to return a promise, so
     * keying on the keyword alone classified `fetchToken(): Promise<string>` as
     * synchronous and asked for a getter (#2154). A getter is never a legal
     * remedy here: it turns a call that starts work into a property read, so
     * `session.epoch` spawns the work on what reads as a field access and any
     * reflective call site (`(session as any).readEpoch()`) throws outright.
     *
     * An explicit return annotation is the method's whole contract, so a
     * non-thenable one settles the question without reading the body — which is
     * what keeps an annotated `(): string` method reportable even when its body
     * mentions promises.
     */
    function returnsThenable(node: MemberLikeDefinition): boolean {
      const fn = memberFunctionOf(node);
      if (!fn) return false;

      // A field states its contract beside the name when the arrow carries no
      // annotation of its own, and that contract settles the question exactly
      // as an arrow's own annotation would.
      if (!fn.returnType) {
        const declared = declaredFunctionReturnType(node);
        if (declared) return isThenableTypeNode(declared);
      }

      return functionYieldsThenable(node, fn, new Set<TSESTree.Node>([fn]));
    }

    /**
     * Returns true when the method body contains a ThrowStatement that is
     * directly in the method's own scope (not inside a nested function/arrow).
     * A method that can throw at the top level is an imperative assertion, not
     * a computed property, so it must not become a getter.
     */
    function containsTopLevelThrow(fn: FunctionLikeValue): boolean {
      const stack: TSESTree.Node[] = bodyWalkRoots(fn);
      while (stack.length) {
        const current = stack.pop() as TSESTree.Node;
        // Do not descend into nested function-like scopes — a throw there is
        // that nested function's concern, not the method's.
        if (isFunctionLikeNode(current)) {
          continue;
        }
        if (current.type === AST_NODE_TYPES.ThrowStatement) {
          return true;
        }
        pushChildNodes(current, stack);
      }
      return false;
    }

    function suggestName(name: string): string {
      for (const prefix of prefixList) {
        if (
          name.startsWith(prefix) &&
          name.length > prefix.length &&
          /[A-Z_]/.test(name[prefix.length])
        ) {
          const remainder = name.slice(prefix.length);
          return lowerFirst(remainder);
        }
      }
      return name;
    }

    function isThisProperty(
      member: TSESTree.MemberExpression,
      propName: string,
    ): boolean {
      if (
        member.object.type !== AST_NODE_TYPES.ThisExpression &&
        member.object.type !== AST_NODE_TYPES.Super
      ) {
        return false;
      }

      const propertyName = memberNameOf(member.property, member.computed);
      if (propertyName !== null) {
        return propertyName === propName;
      }

      if (
        member.computed &&
        member.property.type === AST_NODE_TYPES.Literal &&
        typeof member.property.value === 'string'
      ) {
        return member.property.value === propName;
      }

      return false;
    }

    function bodyReferencesThisProperty(
      fn: FunctionLikeValue,
      propName: string,
    ): boolean {
      const stack: TSESTree.Node[] = bodyWalkRoots(fn);

      while (stack.length) {
        const current = stack.pop() as TSESTree.Node;

        if (isFunctionLikeNode(current)) {
          continue;
        }

        if (current.type === AST_NODE_TYPES.MemberExpression) {
          if (isThisProperty(current, propName)) {
            return true;
          }
        } else if (current.type === AST_NODE_TYPES.ChainExpression) {
          const expression = current.expression;
          if (
            expression.type === AST_NODE_TYPES.MemberExpression &&
            isThisProperty(expression, propName)
          ) {
            return true;
          }
        }

        pushChildNodes(current, stack);
      }

      return false;
    }

    function isMemberExpressionNode(
      value: TSESTree.Node,
    ): value is TSESTree.MemberExpression {
      return value.type === AST_NODE_TYPES.MemberExpression;
    }

    function trackMemberCall(
      member: TSESTree.MemberExpression,
      callUsedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      callUsedNamesInFile: Set<string>,
    ) {
      const propName = memberNameOf(member.property, member.computed);
      if (propName === null) {
        return;
      }

      if (propName === 'call' || propName === 'apply' || propName === 'bind') {
        const target = member.object;
        const targetPropName = isMemberExpressionNode(target)
          ? memberNameOf(target.property, target.computed)
          : null;
        if (
          isMemberExpressionNode(target) &&
          targetPropName !== null &&
          target.object.type === AST_NODE_TYPES.ThisExpression
        ) {
          addCallUseForMember(
            member,
            targetPropName,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        } else if (target.type === AST_NODE_TYPES.ThisExpression) {
          addCallUseForMember(
            member,
            propName,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        } else if (isMemberExpressionNode(target) && targetPropName !== null) {
          addCallUseForMember(
            target,
            targetPropName,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        } else if (target.type === AST_NODE_TYPES.Identifier) {
          addCallUseForMember(
            member,
            target.name,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        } else {
          addCallUseForMember(
            member,
            propName,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        }
        return;
      }

      addCallUseForMember(
        member,
        propName,
        callUsedNamesByClass,
        callUsedNamesInFile,
      );
    }

    function isFunctionReference(member: TSESTree.MemberExpression): boolean {
      const parent = member.parent;
      if (!parent) return false;

      if (parent.type === AST_NODE_TYPES.CallExpression) {
        if (parent.callee === member) {
          return false;
        }
        return true;
      }

      if (parent.type === AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      if (parent.type === AST_NODE_TYPES.ChainExpression) {
        const chainParent = parent.parent;
        if (
          chainParent &&
          chainParent.type === AST_NODE_TYPES.CallExpression &&
          chainParent.callee ===
            (parent as unknown as TSESTree.LeftHandSideExpression)
        ) {
          return false;
        }
        return true;
      }

      return true;
    }

    function trackMemberReference(
      member: TSESTree.MemberExpression,
      callUsedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      callUsedNamesInFile: Set<string>,
      detachedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      detachedNamesInFile: Set<string>,
    ) {
      const propName = memberNameOf(member.property, member.computed);
      if (propName === null) {
        return;
      }

      if (!isFunctionReference(member)) {
        return;
      }

      addCallUseForMember(
        member,
        propName,
        callUsedNamesByClass,
        callUsedNamesInFile,
      );
      addCallUseForMember(
        member,
        propName,
        detachedNamesByClass,
        detachedNamesInFile,
      );
    }

    function trackThisDestructuring(
      pattern: TSESTree.ObjectPattern,
      init: TSESTree.Node | null | undefined,
      callUsedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      callUsedNamesInFile: Set<string>,
      detachedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      detachedNamesInFile: Set<string>,
    ) {
      if (!init || init.type !== AST_NODE_TYPES.ThisExpression) {
        return;
      }

      const record = (name: string) => {
        addCallUse(pattern, name, callUsedNamesByClass, callUsedNamesInFile);
        // Pulling a member off `this` without calling it takes the function
        // value itself, which is the detachment a getter cannot survive.
        addCallUse(pattern, name, detachedNamesByClass, detachedNamesInFile);
      };

      for (const prop of pattern.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          if (prop.computed) continue;

          const key = prop.key;
          if (key.type === AST_NODE_TYPES.Identifier) {
            record(key.name);
          } else if (
            key.type === AST_NODE_TYPES.Literal &&
            typeof key.value === 'string'
          ) {
            record(key.value);
          }
        }
      }
    }

    const heritageContracts = new WeakMap<TSESTree.Node, HeritageContract>();

    /**
     * A method that satisfies an `implements` clause or overrides a base-class
     * member cannot become a getter: the heritage type declares a *method*, so
     * the conversion the rule prescribes is a TS2416/TS2417 compile error. When
     * every heritage reference resolves in-file the exemption is per method —
     * only names the contract declares are spared. When any reference leaves
     * the file (an import, a global, a third-party `.d.ts`, a mixin call) the
     * contract's members are unknowable, so no method of that class can be
     * proven safe and the whole class is spared: a false negative is preferable
     * to prescribing a remedy that does not compile.
     */
    function isConstrainedByHeritage(node: MemberLikeDefinition): boolean {
      // An ECMA private member is unreachable from outside its own class body,
      // so no `implements` or `extends` clause — resolvable or not — can oblige
      // it to stay a method: a base class's `#x` is a different member, and a
      // type can never declare one. Converting it cannot produce TS2416/TS2417.
      if (node.key.type === AST_NODE_TYPES.PrivateIdentifier) return false;

      const classNode = getClassOf(node);
      if (!classNode) return false;

      let contract = heritageContracts.get(classNode);
      if (!contract) {
        contract = resolveHeritageContract(classNode, context.getScope());
        heritageContracts.set(classNode, contract);
      }

      if (contract.status === 'none') return false;
      if (contract.status === 'unresolvable') return true;

      const name = (node.key as TSESTree.Identifier).name;
      const isStatic = (node as { static?: boolean }).static ?? false;
      return isStatic
        ? contract.members.staticSide.has(name)
        : contract.members.instance.has(name);
    }

    const callUsedNamesByClass = new WeakMap<TSESTree.ClassBody, Set<string>>();
    const callUsedNamesInFile = new Set<string>();
    /**
     * Names read WITHOUT being called — the strict subset of the call-use sets
     * that means "the function value itself was taken". A field arrow exists to
     * be handed around bound (`store.on('change', this.getSnapshot)`), and a
     * getter would run on that read instead of yielding the function, so the
     * field arm withholds its report there rather than prescribe a remedy that
     * breaks the site.
     */
    const detachedNamesByClass = new WeakMap<TSESTree.ClassBody, Set<string>>();
    const detachedNamesInFile = new Set<string>();
    const candidates: Array<{
      node: MemberLikeDefinition;
      fn: FunctionLikeValue;
      sideEffectReason: string | null;
      /** The member as written, `#`-prefixed for an ECMA private name. */
      memberName: string;
      /** The getter name to emit, carrying the same `#` the member has. */
      getterName: string;
      /**
       * Whether the member is a field. A field carries no fixer: converting an
       * own enumerable per-instance property into a prototype accessor drops
       * the key from `Object.keys(instance)` and object spread, which no gate
       * here models and no single-file analysis can settle.
       */
      isField: boolean;
    }> = [];

    /**
     * The gates every member function answers, whichever way it is spelled.
     */
    function considerMember(
      node: MemberLikeDefinition,
      fn: FunctionLikeValue,
      isField: boolean,
    ) {
      if (fn.params.length > 0) return;
      if (node.optional) return;
      if (node.computed) return;
      if (fn.typeParameters) return;
      // An ECMA private name (`#foo`) is the same privacy as the TypeScript
      // `private` modifier — and mutually exclusive with it, since `private
      // #foo` is TS18010 — so it carries a plain, strippable name that the
      // rule analyzes exactly like an `Identifier` key. Literal, computed and
      // template keys stay out: their names are not always statically known
      // and the emitted getter would need quoting the fixer does not do.
      if (
        node.key.type !== AST_NODE_TYPES.Identifier &&
        node.key.type !== AST_NODE_TYPES.PrivateIdentifier
      ) {
        return;
      }
      // `ignoreAsync` means "ignore asynchronous members", not "ignore members
      // bearing the async keyword": TypeScript does not require the keyword to
      // return a promise, so `fetchToken(): Promise<string>` is asynchronous
      // with no keyword written at all (#2154).
      if (config.ignoreAsync && returnsThenable(node)) return;
      if ((node as unknown as { override?: boolean }).override) return;
      if (!fn.body) return;
      if (isConstrainedByHeritage(node)) return;

      const name = node.key.name;
      if (ignoredMethods.has(name)) return;
      // Factory/builder terminal members are imperative actions (issue #990 #4).
      // Exemption takes precedence over stripPrefixes so names like "build"
      // are never prefix-stripped into a getter candidate.
      if (factoryMethods.has(name)) return;

      if (computeBodyLineCount(fn) < config.minBodyLines) {
        return;
      }

      if (!returnsValue(node, fn)) return;
      if (config.respectJsDocSideEffects && hasSideEffectTag(node)) return;

      // A member that throws at the top level is an imperative assertion or
      // command, not a computed property — getters must be pure/non-throwing.
      if (containsTopLevelThrow(fn)) return;

      const sideEffectReason = analyzeMutations(fn);
      const suggestedName = suggestName(name);
      const sigil =
        node.key.type === AST_NODE_TYPES.PrivateIdentifier ? '#' : '';

      candidates.push({
        node,
        fn,
        sideEffectReason,
        memberName: `${sigil}${name}`,
        getterName: `${sigil}${suggestedName}`,
        isField,
      });
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee as TSESTree.Node;

        if (callee.type === AST_NODE_TYPES.MemberExpression) {
          trackMemberCall(callee, callUsedNamesByClass, callUsedNamesInFile);
        } else if (callee.type === AST_NODE_TYPES.ChainExpression) {
          const expression = (callee as TSESTree.ChainExpression).expression;
          if (expression.type === AST_NODE_TYPES.MemberExpression) {
            trackMemberCall(
              expression,
              callUsedNamesByClass,
              callUsedNamesInFile,
            );
          }
        }
      },
      MemberExpression(node: TSESTree.MemberExpression) {
        trackMemberReference(
          node,
          callUsedNamesByClass,
          callUsedNamesInFile,
          detachedNamesByClass,
          detachedNamesInFile,
        );
      },
      ChainExpression(node: TSESTree.ChainExpression) {
        if (node.expression.type === AST_NODE_TYPES.MemberExpression) {
          trackMemberReference(
            node.expression,
            callUsedNamesByClass,
            callUsedNamesInFile,
            detachedNamesByClass,
            detachedNamesInFile,
          );
        }
      },
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
          trackThisDestructuring(
            node.id,
            node.init ?? null,
            callUsedNamesByClass,
            callUsedNamesInFile,
            detachedNamesByClass,
            detachedNamesInFile,
          );
        }
      },
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        if (node.left.type === AST_NODE_TYPES.ObjectPattern) {
          trackThisDestructuring(
            node.left,
            node.right,
            callUsedNamesByClass,
            callUsedNamesInFile,
            detachedNamesByClass,
            detachedNamesInFile,
          );
        }
      },
      JSXMemberExpression(node: TSESTree.JSXMemberExpression) {
        // `<this.Panel />` takes the member's function value — JSX invokes the
        // component itself — but it is a JSXMemberExpression, which the member
        // trackers never see. A component declared as a field is exactly the
        // shape a getter would break, so this counts as detachment.
        const property = node.property;
        if (property.type === AST_NODE_TYPES.JSXIdentifier) {
          addCallUse(
            node,
            property.name,
            detachedNamesByClass,
            detachedNamesInFile,
          );
        }
      },
      BinaryExpression(node: TSESTree.BinaryExpression) {
        // An ergonomic brand check (`#foo in candidate`) names the member
        // without a MemberExpression, so the member trackers never see it. A
        // rename would leave it pointing at a member that no longer exists, so
        // it counts as a use that withholds the fix.
        const left = node.left as TSESTree.Node;
        if (
          node.operator === 'in' &&
          left.type === AST_NODE_TYPES.PrivateIdentifier
        ) {
          addCallUse(
            node,
            `#${left.name}`,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        }
      },
      'MethodDefinition, TSAbstractMethodDefinition'(
        node: MethodLikeDefinition,
      ) {
        if (node.kind !== 'method') return;
        if (node.value.generator) return;
        if (
          config.ignoreAbstract &&
          node.type === AST_NODE_TYPES.TSAbstractMethodDefinition
        ) {
          return;
        }
        // Getters cannot carry overload declarations, so leaving the signatures
        // in place would produce invalid TypeScript. Only a method can have
        // them: a field and an overload signature of the same name is not a
        // legal class body.
        if (hasOverloadSignatures(node)) return;

        considerMember(node, node.value, false);
      },
      'PropertyDefinition, TSAbstractPropertyDefinition'(
        node: PropertyLikeDefinition,
      ) {
        // A field is a member function only when it holds one. Data fields,
        // `declare` fields and `abstract` declarations hold no function at all,
        // so they leave here rather than needing a gate of their own.
        const fn = memberFunctionOf(node);
        if (!fn) return;

        // `foo = function* () {}` hands back an iterator through a protocol a
        // getter has no way to express.
        if (fn.type === AST_NODE_TYPES.FunctionExpression && fn.generator) {
          return;
        }
        if (
          config.ignoreAbstract &&
          node.type === AST_NODE_TYPES.TSAbstractPropertyDefinition
        ) {
          return;
        }
        considerMember(node, fn, true);
      },
      'Program:exit'() {
        const suggestedNameCounts = new WeakMap<
          TSESTree.ClassBody,
          Map<string, number>
        >();

        // An ECMA private name is one per-class namespace across both sides of
        // the class, so `static #x` and `#x` collide where `static x` and `x`
        // do not — its bucket must not be split by static-ness.
        const scopeKeyOf = (node: MemberLikeDefinition, getterName: string) => {
          if (isEcmaPrivateName(getterName)) return `private:${getterName}`;
          const side = (node as { static?: boolean }).static ?? false;
          return `${side ? 'static' : 'instance'}:${getterName}`;
        };

        /**
         * A field handed around as a function value is the one shape whose
         * getter remedy is wrong rather than merely unfixable: the caller that
         * wrote `this.getSnapshot` wants the function, and a getter would run
         * the body and hand back its result instead. The method arm keeps
         * reporting such members — its remedy is to convert the member AND its
         * call sites, which stays available — so this withholding is specific
         * to the spelling whose purpose is detachment.
         */
        const isDetachedField = (candidate: typeof candidates[number]) => {
          if (!candidate.isField) return false;
          const classBody = candidate.node.parent;
          const withinClass =
            classBody?.type === AST_NODE_TYPES.ClassBody
              ? detachedNamesByClass
                  .get(classBody)
                  ?.has(candidate.memberName) ?? false
              : false;
          return withinClass || detachedNamesInFile.has(candidate.memberName);
        };

        const reportable = candidates.filter(
          (candidate) => !isDetachedField(candidate),
        );

        for (const { node, getterName } of reportable) {
          const classBody = node.parent;
          if (!classBody || classBody.type !== AST_NODE_TYPES.ClassBody) {
            continue;
          }

          const scopeKey = scopeKeyOf(node, getterName);
          const existingCounts =
            suggestedNameCounts.get(classBody) ?? new Map<string, number>();
          existingCounts.set(scopeKey, (existingCounts.get(scopeKey) ?? 0) + 1);
          suggestedNameCounts.set(classBody, existingCounts);
        }

        for (const {
          node,
          fn,
          sideEffectReason,
          memberName,
          getterName,
          isField,
        } of reportable) {
          const classBody = node.parent;
          const scopeKey = scopeKeyOf(node, getterName);

          const leftParen = sourceCode.getTokenAfter(node.key, {
            filter: (token) => token.value === '(',
          });
          const rightParen = leftParen
            ? sourceCode.getTokenAfter(leftParen, {
                filter: (token) => token.value === ')',
              })
            : null;

          const referencesSuggestedName = bodyReferencesThisProperty(
            fn,
            getterName,
          );

          const hasCollision = hasNameCollision(node, getterName);
          const isCallUsed =
            classBody?.type === AST_NODE_TYPES.ClassBody
              ? callUsedNamesByClass.get(classBody)?.has(memberName) ?? false
              : false;
          const isCallUsedSomewhereInFile = callUsedNamesInFile.has(memberName);
          const hasDuplicateSuggestedName =
            classBody?.type === AST_NODE_TYPES.ClassBody
              ? (suggestedNameCounts.get(classBody)?.get(scopeKey) ?? 0) > 1
              : false;

          // A thenable-returning member has no legal getter form at all: the
          // rewrite converts a call that starts work into a property read, and
          // a reflective call site (`(session as any).readEpoch()`) throws
          // afterwards. The eligibility gate already withholds the report for
          // these, so this is a second, independent lock — a future change
          // there must not silently re-enable a rewrite that cannot compile or
          // run. It subsumes the former `async`-keyword-only withhold.
          const isThenableReturning = returnsThenable(node);

          // A decorator cannot be applied to an ECMA private member under
          // `experimentalDecorators` (TS1206), so a decorated `#foo()` has no
          // legal getter form to convert to — the fix is impossible, not merely
          // risky, and the report stands on its own.
          const isUndecoratableEcmaPrivate =
            node.key.type === AST_NODE_TYPES.PrivateIdentifier &&
            ((node as { decorators?: unknown[] }).decorators?.length ?? 0) > 0;

          // Only `private` methods are safe to autofix. A public / protected /
          // unspecified-accessibility method is API surface whose call sites of
          // the form `instance.method()` may live in other files this
          // single-file rule never sees. Converting such a method to a getter
          // silently breaks every external caller (the call would invoke the
          // getter's return value), so the fix must be withheld for anything
          // not demonstrably private. The report (nudge) is still emitted. An
          // ECMA private name satisfies this more strongly than the erased
          // `private` modifier: `#foo` is unreachable outside the class body at
          // runtime, so every call site is in this file by construction.
          const isPrivate =
            node.accessibility === 'private' ||
            node.key.type === AST_NODE_TYPES.PrivateIdentifier;

          context.report({
            node: node.key,
            messageId: sideEffectReason
              ? 'preferGetterSideEffect'
              : 'preferGetter',
            data: {
              name: memberName,
              suggestedName: getterName,
              reason: sideEffectReason ?? 'it returns a value',
            },
            fix:
              // The field spelling is report-only. Its rewrite must consume the
              // `= (`…`) =>` and the terminating `;`, reshape a concise body
              // into a block, and drop a `readonly` modifier a getter cannot
              // carry — and even done perfectly it turns an own enumerable
              // per-instance property into a prototype accessor, which changes
              // `Object.keys(instance)` and object spread. No gate here models
              // that, so the developer applies it.
              isField ||
              !isPrivate ||
              sideEffectReason ||
              isThenableReturning ||
              !leftParen ||
              !rightParen ||
              hasCollision ||
              isCallUsed ||
              isCallUsedSomewhereInFile ||
              referencesSuggestedName ||
              hasDuplicateSuggestedName ||
              isUndecoratableEcmaPrivate
                ? null
                : (fixer) =>
                    fixer.replaceTextRange(
                      [node.key.range[0], rightParen.range[1]],
                      `get ${getterName}()`,
                    ),
          });
        }
      },
    };
  },
});

export default preferGetterOverParameterlessMethod;
