import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { declarationOf, enclosingStatementLists } from '../utils/lexicalScope';

type MessageIds = 'childrenClobbered';
type Options = [];

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type BindingInfo = {
  identifier: TSESTree.Identifier;
  childrenExcluded: boolean;
  typeAnnotationExcludesProperty: boolean;
  childrenSourceId: string;
};

type MinimalParserServices = {
  program?: ts.Program;
  esTreeNodeToTSNodeMap?: {
    get(node: TSESTree.Node): ts.Node | undefined;
  };
};

type FunctionContext = {
  isComponent: boolean;
  bindings: Map<string, BindingInfo>;
  propsLikeIdentifiers: Set<string>;
  childrenValueSourceIds: Map<string, string>;
};

function resolveFunctionName(node: FunctionLike): string | null {
  if ('id' in node && node.id?.name) {
    return node.id.name;
  }

  if (
    node.type === AST_NODE_TYPES.FunctionExpression &&
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  if (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  return null;
}

function isComponentLike(
  node: FunctionLike,
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
): boolean {
  const name = resolveFunctionName(node);
  if (name && /^[A-Z]/.test(name)) {
    return true;
  }

  // Asked about the FUNCTION, not its body: a concise arrow's body arrives
  // as the handed node, and returnsJSX unwraps a handed function rather than
  // reading it as the value it is. That made a factory returning a render
  // function look component-like in its concise spelling only (#2191).
  return ASTHelpers.returnsJSX(node, context);
}

function patternHasChildrenProperty(pattern: TSESTree.ObjectPattern): boolean {
  return pattern.properties.some((prop) => {
    if (prop.type !== AST_NODE_TYPES.Property) return false;
    if (prop.computed) return false;
    const key = prop.key;
    if (key.type === AST_NODE_TYPES.Identifier) {
      return key.name === 'children';
    }
    if (key.type === AST_NODE_TYPES.Literal) {
      return key.value === 'children';
    }
    return false;
  });
}

function typeNodeContainsLiteral(
  node: TSESTree.TypeNode,
  literalValue: string,
): boolean {
  if (node.type === AST_NODE_TYPES.TSLiteralType) {
    return node.literal.type === AST_NODE_TYPES.Literal
      ? node.literal.value === literalValue
      : false;
  }
  if (node.type === AST_NODE_TYPES.TSUnionType) {
    return node.types.some((t) => typeNodeContainsLiteral(t, literalValue));
  }
  if (node.type === AST_NODE_TYPES.TSTupleType) {
    return node.elementTypes.some((t) =>
      typeNodeContainsLiteral(t, literalValue),
    );
  }
  if (node.type === AST_NODE_TYPES.TSArrayType) {
    return typeNodeContainsLiteral(node.elementType, literalValue);
  }
  return false;
}

/**
 * Resolves a name declared in the scope chain the resolver was built for: a
 * type-alias name to the type it stands for, and a value name to the string
 * members of the `as const` array it binds.
 *
 * A type resolution carries its own resolver so that names referenced *inside*
 * the alias body resolve from the scope the alias was declared in rather than
 * from the scope that referenced it.
 */
type AliasResolver = {
  typeAlias(name: string): AliasResolution | undefined;
  constArrayKeys(name: string): readonly string[] | undefined;
};

type AliasResolution = {
  typeNode: TSESTree.TypeNode;
  resolve: AliasResolver;
};

/**
 * The alias a statement declares, looking through `export`.
 *
 * Collecting aliases from `Program.body` alone made two everyday spellings
 * unresolvable — `export type Props = ...`, whose alias hides inside an
 * `ExportNamedDeclaration`, and any alias declared inside a function, arrow or
 * namespace. Since the alias map powers an *exemption*, an unresolvable name
 * switched the exemption off and the rule reported, so the hole manufactured
 * false positives rather than silence.
 */
function aliasDeclarationNamed(
  statement: TSESTree.Node,
  name: string,
): TSESTree.TSTypeAliasDeclaration | undefined {
  const declared = declarationOf(statement);
  return declared.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
    declared.id.name === name
    ? declared
    : undefined;
}

/**
 * The string members of `const NAME = ['a', 'b'] as const`, or `undefined` when
 * the statement declares something else or an element is not a string literal.
 *
 * `prefer-union-from-const-array` rewrites a string-literal union alias into
 * exactly this pair of declarations plus `(typeof NAME)[number]`, so a keep-list
 * that reads decidable before that transform has to stay decidable after it.
 */
function constArrayMembersNamed(
  statement: TSESTree.Node,
  name: string,
): readonly string[] | undefined {
  const declared = declarationOf(statement);
  if (
    declared.type !== AST_NODE_TYPES.VariableDeclaration ||
    declared.kind !== 'const'
  ) {
    return undefined;
  }

  for (const declarator of declared.declarations) {
    if (
      declarator.id.type !== AST_NODE_TYPES.Identifier ||
      declarator.id.name !== name ||
      declarator.init?.type !== AST_NODE_TYPES.TSAsExpression
    ) {
      continue;
    }

    const { expression, typeAnnotation } = declarator.init;
    // Without `as const` the elements widen to `string`, and the indexed access
    // yields `string` rather than a union of the literals.
    const isConstAssertion =
      typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
      typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
      typeAnnotation.typeName.name === 'const';
    if (!isConstAssertion || expression.type !== AST_NODE_TYPES.ArrayExpression)
      return undefined;

    const members: string[] = [];
    for (const element of expression.elements) {
      if (
        element?.type !== AST_NODE_TYPES.Literal ||
        typeof element.value !== 'string'
      ) {
        return undefined;
      }
      members.push(element.value);
    }
    return members;
  }

  return undefined;
}

/**
 * Lexical lookup over pre-collected statement lists, innermost first, so an
 * inner declaration shadows a same-named outer one.
 *
 * Resolution is by scope rather than by a map built during traversal because
 * type aliases hoist: a component declared above its own props alias must still
 * resolve it.
 */
function aliasResolverFrom(
  lists: readonly (readonly TSESTree.Node[])[],
  startIndex = 0,
): AliasResolver {
  return {
    typeAlias(name) {
      for (let index = startIndex; index < lists.length; index += 1) {
        for (const statement of lists[index]) {
          const declaration = aliasDeclarationNamed(statement, name);
          if (declaration) {
            return {
              typeNode: declaration.typeAnnotation,
              resolve: aliasResolverFrom(lists, index),
            };
          }
        }
      }
      return undefined;
    },
    constArrayKeys(name) {
      for (let index = startIndex; index < lists.length; index += 1) {
        for (const statement of lists[index]) {
          const members = constArrayMembersNamed(statement, name);
          if (members) return members;
        }
      }
      return undefined;
    },
  };
}

function aliasResolverAt(from: TSESTree.Node): AliasResolver {
  return aliasResolverFrom(enclosingStatementLists(from));
}

/**
 * The property names a `Pick<T, K>` keep-list names, or `null` when the list is
 * not decidable from syntax alone.
 *
 * `null` means "prove nothing", never "keeps nothing": a keep-list spelled as a
 * type parameter, `keyof T`, `string`, or a template-literal type can include
 * `children`, and treating an undecidable list as an empty one would exempt
 * exactly those.
 */
function stringLiteralKeySet(
  node: TSESTree.TypeNode,
  resolveAlias?: AliasResolver,
  seen: Set<string> = new Set(),
): Set<string> | null {
  if (node.type === AST_NODE_TYPES.TSLiteralType) {
    return node.literal.type === AST_NODE_TYPES.Literal &&
      typeof node.literal.value === 'string'
      ? new Set([node.literal.value])
      : null;
  }

  if (node.type === AST_NODE_TYPES.TSUnionType) {
    const keys = new Set<string>();
    for (const member of node.types) {
      const memberKeys = stringLiteralKeySet(member, resolveAlias, seen);
      if (!memberKeys) return null;
      for (const key of memberKeys) {
        keys.add(key);
      }
    }
    return keys;
  }

  // `(typeof KEYS)[number]` over a `const KEYS = [...] as const` names exactly
  // the array's members — the spelling `prefer-union-from-const-array` rewrites
  // a literal union alias into.
  if (
    node.type === AST_NODE_TYPES.TSIndexedAccessType &&
    node.indexType.type === AST_NODE_TYPES.TSNumberKeyword &&
    node.objectType.type === AST_NODE_TYPES.TSTypeQuery &&
    node.objectType.exprName.type === AST_NODE_TYPES.Identifier
  ) {
    const members = resolveAlias?.constArrayKeys(node.objectType.exprName.name);
    return members ? new Set(members) : null;
  }

  // A bare alias standing for a literal union (`type Keys = 'sx' | 'size'`) is
  // as decidable as the union written inline. A parameterized reference is not:
  // it is a computed key list whose members this rule cannot enumerate.
  if (
    node.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeName.type === AST_NODE_TYPES.Identifier &&
    !node.typeParameters
  ) {
    const name = node.typeName.name;
    if (!resolveAlias || seen.has(name)) return null;
    const alias = resolveAlias.typeAlias(name);
    if (!alias) return null;
    // Guarding before the recursion terminates a self-referential alias.
    seen.add(name);
    return stringLiteralKeySet(alias.typeNode, alias.resolve, seen);
  }

  return null;
}

/**
 * Whether a closed object type provably declares no `propertyName` member.
 *
 * An index signature reopens the type — `{ [key: string]: unknown }` admits
 * `children` — and so does a computed key the rule cannot evaluate, since the
 * constant behind `[KEY]` may well be `'children'`. Both surrender the proof.
 */
function typeLiteralExcludesProperty(
  node: TSESTree.TSTypeLiteral,
  propertyName: string,
): boolean {
  return node.members.every((member) => {
    if (member.type === AST_NODE_TYPES.TSIndexSignature) return false;

    if (
      member.type !== AST_NODE_TYPES.TSPropertySignature &&
      member.type !== AST_NODE_TYPES.TSMethodSignature
    ) {
      // Call and construct signatures declare no named member.
      return true;
    }

    const key = member.key;
    if (member.computed) {
      return (
        key.type === AST_NODE_TYPES.Literal &&
        String(key.value) !== propertyName
      );
    }
    if (key.type === AST_NODE_TYPES.Identifier) {
      return key.name !== propertyName;
    }
    if (key.type === AST_NODE_TYPES.Literal) {
      return String(key.value) !== propertyName;
    }
    return false;
  });
}

/**
 * Generic wrappers that re-map a type's own members without contributing any of
 * their own, so their argument still stands for the whole props type.
 *
 * `PropsWithChildren` is the counter-example the list exists for: it ADDS
 * `children`, so a proof about its argument says nothing about the wrapper.
 */
const PROPERTY_PRESERVING_WRAPPERS = new Set([
  'Readonly',
  'Required',
  'Partial',
  'NonNullable',
]);

function wrapperNameOf(typeName: TSESTree.EntityName): string | null {
  if (typeName.type === AST_NODE_TYPES.Identifier) return typeName.name;
  if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
    return typeName.right.type === AST_NODE_TYPES.Identifier
      ? typeName.right.name
      : null;
  }
  return null;
}

/**
 * Whether a type node provably lacks `propertyName`.
 *
 * `closedLiteralCounts` records whether this position IS the props type rather
 * than merely a part of it. Two of the proofs below — a `Pick<>` keep-list and
 * a closed object literal — describe the type they sit on, so they only carry
 * to the binding when nothing can add members on the way back out. The blanket
 * recursion through a type reference's arguments is where that distinction
 * bites: `PropsWithChildren<{ sx?: string }>` and `Record<string, { a: number }>`
 * both wrap a children-free argument in something that admits `children`.
 */
function typeNodeExcludesProperty(
  node: TSESTree.TypeNode,
  propertyName: string,
  resolveAlias?: AliasResolver,
  seen: Set<string> = new Set(),
  closedLiteralCounts = false,
): boolean {
  if (node.type === AST_NODE_TYPES.TSTypeReference) {
    const typeName =
      node.typeName.type === AST_NODE_TYPES.Identifier
        ? node.typeName.name
        : null;

    if (typeName === 'Omit' && node.typeParameters?.params?.[1]) {
      const excluded = node.typeParameters.params[1];
      if (
        typeNodeContainsLiteral(excluded, propertyName) ||
        typeNodeExcludesProperty(excluded, propertyName, resolveAlias, seen)
      ) {
        return true;
      }
    }

    // A keep-list is a stronger guarantee than an omit-list: `Pick` drops every
    // member it does not name, so a fully decidable list without `propertyName`
    // excludes it outright.
    if (
      closedLiteralCounts &&
      typeName === 'Pick' &&
      node.typeParameters?.params?.[1]
    ) {
      const kept = stringLiteralKeySet(
        node.typeParameters.params[1],
        resolveAlias,
      );
      if (kept && !kept.has(propertyName)) {
        return true;
      }
    }

    if (node.typeParameters?.params) {
      const argumentsAreTheType =
        closedLiteralCounts &&
        PROPERTY_PRESERVING_WRAPPERS.has(wrapperNameOf(node.typeName) ?? '');
      return node.typeParameters.params.some((param) =>
        typeNodeExcludesProperty(
          param,
          propertyName,
          resolveAlias,
          seen,
          argumentsAreTheType,
        ),
      );
    }

    // Keyed by position as well as by name: the same alias proves different
    // things in a props position than inside an arbitrary generic, so a visit
    // in one position must not suppress the visit in the other.
    const seenKey = `${closedLiteralCounts ? 'props' : 'part'}:${typeName}`;
    if (typeName && resolveAlias && !seen.has(seenKey)) {
      const alias = resolveAlias.typeAlias(typeName);
      if (alias) {
        // Guarding before the recursion terminates a self-referential alias.
        seen.add(seenKey);
        if (
          typeNodeExcludesProperty(
            alias.typeNode,
            propertyName,
            alias.resolve,
            seen,
            closedLiteralCounts,
          )
        ) {
          return true;
        }
      }
    }
  }

  if (node.type === AST_NODE_TYPES.TSTypeLiteral) {
    return (
      closedLiteralCounts && typeLiteralExcludesProperty(node, propertyName)
    );
  }

  if (node.type === AST_NODE_TYPES.TSUnionType) {
    return node.types.every((typeNode) =>
      typeNodeExcludesProperty(
        typeNode,
        propertyName,
        resolveAlias,
        seen,
        closedLiteralCounts,
      ),
    );
  }

  if (node.type === AST_NODE_TYPES.TSIntersectionType) {
    return node.types.every((typeNode) =>
      typeNodeExcludesProperty(
        typeNode,
        propertyName,
        resolveAlias,
        seen,
        closedLiteralCounts,
      ),
    );
  }

  return false;
}

/**
 * Entry point for a type node that stands for a whole props type, whether it
 * was written as a parameter annotation or supplied as a `forwardRef` type
 * argument.
 */
function propsTypeNodeExcludesProperty(
  typeNode: TSESTree.TypeNode | null | undefined,
  propertyName: string,
  resolveAlias?: AliasResolver,
): boolean {
  if (!typeNode) return false;
  return typeNodeExcludesProperty(
    typeNode,
    propertyName,
    resolveAlias,
    new Set(),
    true,
  );
}

function typeAnnotationExcludesProperty(
  annotation: TSESTree.TSTypeAnnotation | null | undefined,
  propertyName: string,
  resolveAlias?: AliasResolver,
): boolean {
  return propsTypeNodeExcludesProperty(
    annotation?.typeAnnotation,
    propertyName,
    resolveAlias,
  );
}

function collectRestBindingsFromPattern(
  pattern: TSESTree.ObjectPattern,
  ctx: FunctionContext,
  typeNode: TSESTree.TypeNode | null | undefined,
  resolveAlias?: AliasResolver,
  sourceChildrenSourceId?: string,
): void {
  const childrenPresent = patternHasChildrenProperty(pattern);
  for (const prop of pattern.properties) {
    if (
      prop.type === AST_NODE_TYPES.RestElement &&
      prop.argument.type === AST_NODE_TYPES.Identifier
    ) {
      ctx.propsLikeIdentifiers.add(prop.argument.name);
      ctx.bindings.set(prop.argument.name, {
        identifier: prop.argument,
        childrenExcluded: childrenPresent,
        typeAnnotationExcludesProperty: propsTypeNodeExcludesProperty(
          typeNode,
          'children',
          resolveAlias,
        ),
        childrenSourceId: sourceChildrenSourceId ?? prop.argument.name,
      });
    } else if (
      prop.type === AST_NODE_TYPES.Property &&
      prop.value.type === AST_NODE_TYPES.ObjectPattern
    ) {
      collectRestBindingsFromPattern(prop.value, ctx, null, resolveAlias);
    }
  }
}

function recordChildrenValueBindingsFromPattern(
  pattern: TSESTree.ObjectPattern,
  ctx: FunctionContext,
  sourceChildrenSourceId: string,
): void {
  for (const prop of pattern.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;
    if (prop.computed) continue;

    const key = prop.key;
    const keyName =
      key.type === AST_NODE_TYPES.Identifier
        ? key.name
        : key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string'
        ? key.value
        : null;

    if (keyName !== 'children') continue;

    const value = prop.value;
    if (value.type === AST_NODE_TYPES.Identifier) {
      ctx.childrenValueSourceIds.set(value.name, sourceChildrenSourceId);
      continue;
    }

    if (
      value.type === AST_NODE_TYPES.AssignmentPattern &&
      value.left.type === AST_NODE_TYPES.Identifier
    ) {
      ctx.childrenValueSourceIds.set(value.left.name, sourceChildrenSourceId);
    }
  }
}

/**
 * The props type a parameter carries: its own annotation when it has one, and
 * otherwise the type the call site supplies contextually.
 *
 * An explicit annotation always wins. It is the type the body is checked
 * against, so a `forwardRef<E, Clean>((props: MenuProps, ref) => …)` still
 * carries whatever `MenuProps` declares.
 */
function propsTypeNodeOf(
  param: TSESTree.Parameter,
  contextualTypeNode?: TSESTree.TypeNode,
): TSESTree.TypeNode | null | undefined {
  // A `TSParameterProperty` (a constructor's `private x: T`) carries its
  // annotation on the parameter it wraps and never takes part in a component's
  // props, so it simply has no props type of its own.
  const own =
    param.type === AST_NODE_TYPES.TSParameterProperty
      ? undefined
      : param.typeAnnotation?.typeAnnotation;
  return own ?? contextualTypeNode;
}

function recordParamBindings(
  param: TSESTree.Parameter,
  ctx: FunctionContext,
  resolveAlias?: AliasResolver,
  contextualTypeNode?: TSESTree.TypeNode,
) {
  const typeNode = propsTypeNodeOf(param, contextualTypeNode);

  if (param.type === AST_NODE_TYPES.Identifier) {
    ctx.propsLikeIdentifiers.add(param.name);
    ctx.bindings.set(param.name, {
      identifier: param,
      childrenExcluded: false,
      typeAnnotationExcludesProperty: propsTypeNodeExcludesProperty(
        typeNode,
        'children',
        resolveAlias,
      ),
      childrenSourceId: param.name,
    });
    return;
  }

  if (
    param.type === AST_NODE_TYPES.AssignmentPattern &&
    param.left.type === AST_NODE_TYPES.Identifier
  ) {
    ctx.propsLikeIdentifiers.add(param.left.name);
    ctx.bindings.set(param.left.name, {
      identifier: param.left,
      childrenExcluded: false,
      typeAnnotationExcludesProperty: propsTypeNodeExcludesProperty(
        typeNode,
        'children',
        resolveAlias,
      ),
      childrenSourceId: param.left.name,
    });
    return;
  }

  if (
    param.type === AST_NODE_TYPES.AssignmentPattern &&
    param.left.type === AST_NODE_TYPES.ObjectPattern
  ) {
    collectRestBindingsFromPattern(param.left, ctx, typeNode, resolveAlias);
    return;
  }

  if (param.type === AST_NODE_TYPES.ObjectPattern) {
    collectRestBindingsFromPattern(param, ctx, typeNode, resolveAlias);
  }
}

/**
 * The props type a `forwardRef<Element, Props>(…)` call supplies to its render
 * callback, whose parameters carry no annotation of their own.
 *
 * Without this the props type is invisible in the `forwardRef` spelling, so
 * even the documented `Omit<…, 'children'>` remedy could not be seen and the
 * rule reported on props it could prove children-free in every other spelling.
 */
function forwardRefPropsTypeNode(
  node: FunctionLike,
): TSESTree.TypeNode | undefined {
  const call = node.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression) return undefined;
  if (call.arguments[0] !== node) return undefined;

  // An optional call detaches the type arguments onto a
  // `TSInstantiationExpression` — `forwardRef<E, P>?.(…)` parses as
  // instantiate-then-call — so both the callee and the type arguments are read
  // through it. The node predates the `LeftHandSideExpression` union this
  // version declares, hence the hand-written narrowing.
  const rawCallee = call.callee as unknown as {
    type: string;
    expression?: TSESTree.LeftHandSideExpression;
  };
  const instantiation =
    rawCallee.type === AST_NODE_TYPES.TSInstantiationExpression
      ? rawCallee
      : undefined;

  const callee = instantiation?.expression ?? call.callee;
  const calleeName =
    callee.type === AST_NODE_TYPES.Identifier
      ? callee.name
      : callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier
      ? callee.property.name
      : null;
  if (calleeName !== 'forwardRef') return undefined;

  // `typeParameters` is where @typescript-eslint/utils 5 puts a call's type
  // arguments; `typeArguments` is the name later majors use. Reading both keeps
  // this working across the rename.
  const instantiated = (instantiation ?? call) as {
    typeParameters?: TSESTree.TSTypeParameterInstantiation;
    typeArguments?: TSESTree.TSTypeParameterInstantiation;
  };
  const typeArguments =
    instantiated.typeParameters ?? instantiated.typeArguments;

  // The first type argument is the element type; the props type is the second.
  return typeArguments?.params?.[1];
}

function findNearestComponentContext(
  stack: FunctionContext[],
): FunctionContext | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].isComponent) return stack[i];
  }
  return undefined;
}

function findBinding(
  name: string,
  stack: FunctionContext[],
): BindingInfo | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const binding = stack[i].bindings.get(name);
    if (binding) return binding;
  }
  return undefined;
}

function findChildrenValueSourceId(
  name: string,
  stack: FunctionContext[],
): string | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const sourceId = stack[i].childrenValueSourceIds.get(name);
    if (sourceId) return sourceId;
  }
  return undefined;
}

function isPropsLike(name: string, stack: FunctionContext[]): boolean {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].propsLikeIdentifiers.has(name)) return true;
  }
  return false;
}

function typeHasChildrenProperty(
  checker: ts.TypeChecker,
  type: ts.Type,
): boolean | null {
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    return null;
  }

  const apparent = checker.getApparentType(type);
  const directProp =
    type.getProperty?.('children') ??
    checker.getPropertyOfType(type, 'children') ??
    checker.getPropertyOfType(apparent, 'children');

  if (directProp) {
    return true;
  }

  if (type.isUnion?.()) {
    let sawUnknown = false;
    for (const member of type.types) {
      const result = typeHasChildrenProperty(checker, member);
      if (result) return true;
      if (result === null) sawUnknown = true;
    }
    return sawUnknown ? null : false;
  }

  if (type.isIntersection?.()) {
    let sawUnknown = false;
    for (const member of type.types) {
      const result = typeHasChildrenProperty(checker, member);
      if (result) return true;
      if (result === null) sawUnknown = true;
    }
    return sawUnknown ? null : false;
  }

  return false;
}

function bindingMayContainChildren(
  binding: BindingInfo,
  context: TSESLint.RuleContext<MessageIds, Options>,
): boolean {
  if (binding.childrenExcluded) return false;
  if (binding.typeAnnotationExcludesProperty) return false;

  const services =
    (
      context.getSourceCode() as unknown as {
        parserServices?: MinimalParserServices;
      }
    ).parserServices ?? (context.parserServices as MinimalParserServices);
  if (!services?.program || !services?.esTreeNodeToTSNodeMap) {
    return true;
  }

  try {
    const checker = services.program.getTypeChecker();
    const tsNode = services.esTreeNodeToTSNodeMap.get(binding.identifier);
    if (!tsNode) return true;
    const type = checker.getTypeAtLocation(tsNode);
    const hasChildren = typeHasChildrenProperty(checker, type);
    if (hasChildren === false) return false;
    return true;
  } catch {
    return true;
  }
}

function hasExplicitChildren(element: TSESTree.JSXElement): boolean {
  if (element.openingElement.selfClosing) return false;

  return element.children.some((child) => {
    if (child.type === AST_NODE_TYPES.JSXText) {
      return child.value.trim().length > 0;
    }
    if (child.type === AST_NODE_TYPES.JSXExpressionContainer) {
      return child.expression.type !== AST_NODE_TYPES.JSXEmptyExpression;
    }
    return true; // JSXElement, JSXFragment, JSXSpreadChild, etc.
  });
}

function nodeReferencesChildren(
  node: TSESTree.Node,
  propsObjectNames: Set<string>,
  childrenValueNames: Set<string>,
): boolean {
  const stack: TSESTree.Node[] = [node];
  while (stack.length) {
    const current = stack.pop()!;
    if (current.type === AST_NODE_TYPES.Identifier) {
      if (childrenValueNames.has(current.name)) return true;
    } else if (current.type === AST_NODE_TYPES.MemberExpression) {
      if (
        !current.computed &&
        current.property.type === AST_NODE_TYPES.Identifier &&
        current.property.name === 'children' &&
        current.object.type === AST_NODE_TYPES.Identifier &&
        propsObjectNames.has(current.object.name)
      ) {
        return true;
      }
    } else if (current.type === AST_NODE_TYPES.ChainExpression) {
      stack.push(current.expression as TSESTree.Node);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const key of Object.keys(current as any)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (current as any)[key];
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object' && 'type' in child) {
            stack.push(child as TSESTree.Node);
          }
        }
      } else if (typeof value === 'object' && 'type' in value) {
        stack.push(value as TSESTree.Node);
      }
    }
  }
  return false;
}

function childrenRenderSpreadChildren(
  children: TSESTree.JSXChild[],
  propsObjectNames: Set<string>,
  childrenValueNames: Set<string>,
): boolean {
  for (const child of children) {
    if (child.type === AST_NODE_TYPES.JSXExpressionContainer) {
      if (
        nodeReferencesChildren(
          child.expression,
          propsObjectNames,
          childrenValueNames,
        )
      ) {
        return true;
      }
    } else if (
      child.type === AST_NODE_TYPES.JSXElement ||
      child.type === AST_NODE_TYPES.JSXFragment ||
      child.type === AST_NODE_TYPES.JSXSpreadChild
    ) {
      if (nodeReferencesChildren(child, propsObjectNames, childrenValueNames)) {
        return true;
      }
    } else if (child.type === AST_NODE_TYPES.JSXText) {
      continue;
    }
  }
  return false;
}

function collectPropsObjectNamesForChildrenSourceIds(
  sourceIds: Set<string>,
  stack: FunctionContext[],
): Set<string> {
  const names = new Set<string>();
  for (const ctx of stack) {
    for (const [name, binding] of ctx.bindings) {
      if (sourceIds.has(binding.childrenSourceId)) {
        names.add(name);
      }
    }
  }
  return names;
}

function collectChildrenValueNamesForChildrenSourceIds(
  sourceIds: Set<string>,
  stack: FunctionContext[],
): Set<string> {
  const names = new Set<string>();
  for (const ctx of stack) {
    for (const [name, sourceId] of ctx.childrenValueSourceIds) {
      if (sourceIds.has(sourceId)) {
        names.add(name);
      }
    }
  }
  return names;
}

export const preventChildrenClobber = createRule<Options, MessageIds>({
  name: 'prevent-children-clobber',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent JSX spreads from silently discarding props.children',
      recommended: 'error',
      requiresTypeChecking: false,
    },
    schema: [],
    messages: {
      childrenClobbered:
        "Children clobber detected: JSX spreads {{spreadNames}} which may already contain children, but the element also declares its own children. The spread children are discarded. Destructure and render children explicitly (e.g., `{ children, ...rest }` and include `{children}`) or add `'children'` to an `Omit<>` if this component should not accept children.",
    },
  },
  defaultOptions: [],
  create(context) {
    const functionStack: FunctionContext[] = [];

    return {
      ':function'(node: FunctionLike) {
        const ctx: FunctionContext = {
          isComponent: isComponentLike(node, context),
          bindings: new Map(),
          propsLikeIdentifiers: new Set(),
          childrenValueSourceIds: new Map(),
        };

        if (ctx.isComponent) {
          // The function is the resolution site rather than the parameter:
          // ESLint has assigned `parent` up the chain by the time this visitor
          // runs, but not yet onto the parameter's own type annotation.
          const resolveAlias = aliasResolverAt(node);
          // Only the first parameter receives the contextual props type; the
          // second is the forwarded ref.
          const contextualPropsType = forwardRefPropsTypeNode(node);
          node.params.forEach((param, index) => {
            recordParamBindings(
              param,
              ctx,
              resolveAlias,
              index === 0 ? contextualPropsType : undefined,
            );
          });
        }

        functionStack.push(ctx);
      },
      ':function:exit'() {
        functionStack.pop();
      },
      VariableDeclarator(node) {
        const componentCtx = findNearestComponentContext(functionStack);
        if (!componentCtx) return;

        const id = node.id;
        const init = node.init;

        if (
          id.type === AST_NODE_TYPES.Identifier &&
          init?.type === AST_NODE_TYPES.Identifier
        ) {
          const sourceBinding = findBinding(init.name, functionStack);
          const typeExcludes = typeAnnotationExcludesProperty(
            id.typeAnnotation,
            'children',
            aliasResolverAt(node),
          );
          if (sourceBinding) {
            componentCtx.bindings.set(id.name, {
              identifier: id,
              childrenExcluded: sourceBinding.childrenExcluded,
              typeAnnotationExcludesProperty:
                sourceBinding.typeAnnotationExcludesProperty || typeExcludes,
              childrenSourceId: sourceBinding.childrenSourceId,
            });
          } else if (isPropsLike(init.name, functionStack)) {
            const propsLikeBinding = findBinding(init.name, functionStack);
            componentCtx.bindings.set(id.name, {
              identifier: id,
              childrenExcluded: false,
              typeAnnotationExcludesProperty: typeExcludes,
              childrenSourceId: propsLikeBinding?.childrenSourceId ?? init.name,
            });
          }

          if (isPropsLike(init.name, functionStack)) {
            componentCtx.propsLikeIdentifiers.add(id.name);
          }

          const childSourceId = findChildrenValueSourceId(
            init.name,
            functionStack,
          );
          if (childSourceId) {
            componentCtx.childrenValueSourceIds.set(id.name, childSourceId);
          }
        } else if (
          id.type === AST_NODE_TYPES.Identifier &&
          init &&
          (init.type === AST_NODE_TYPES.MemberExpression ||
            init.type === AST_NODE_TYPES.ChainExpression)
        ) {
          const member =
            init.type === AST_NODE_TYPES.ChainExpression
              ? (init.expression as TSESTree.Expression)
              : init;

          if (
            member.type === AST_NODE_TYPES.MemberExpression &&
            !member.computed &&
            member.property.type === AST_NODE_TYPES.Identifier &&
            member.property.name === 'children' &&
            member.object.type === AST_NODE_TYPES.Identifier
          ) {
            const sourceBinding = findBinding(
              member.object.name,
              functionStack,
            );
            if (sourceBinding) {
              componentCtx.childrenValueSourceIds.set(
                id.name,
                sourceBinding.childrenSourceId,
              );
            }
          }
        } else if (
          id.type === AST_NODE_TYPES.ObjectPattern &&
          init?.type === AST_NODE_TYPES.Identifier &&
          isPropsLike(init.name, functionStack)
        ) {
          const initBinding = findBinding(init.name, functionStack);
          const sourceChildrenSourceId =
            initBinding?.childrenSourceId ?? init.name;

          recordChildrenValueBindingsFromPattern(
            id,
            componentCtx,
            sourceChildrenSourceId,
          );
          collectRestBindingsFromPattern(
            id,
            componentCtx,
            id.typeAnnotation?.typeAnnotation ?? null,
            aliasResolverAt(node),
            sourceChildrenSourceId,
          );
        }
      },
      JSXElement(node) {
        const componentCtx = findNearestComponentContext(functionStack);
        if (!componentCtx) return;
        if (!hasExplicitChildren(node)) return;

        const spreadNamesInOrder: string[] = [];
        for (const attr of node.openingElement.attributes) {
          if (
            attr.type === AST_NODE_TYPES.JSXSpreadAttribute &&
            attr.argument.type === AST_NODE_TYPES.Identifier
          ) {
            spreadNamesInOrder.push(attr.argument.name);
          }
        }

        if (spreadNamesInOrder.length === 0) return;

        const offendingSpreads: Array<{
          name: string;
          childrenSourceId: string;
        }> = [];
        for (const name of spreadNamesInOrder) {
          const binding = findBinding(name, functionStack);
          if (!binding) continue;
          if (!bindingMayContainChildren(binding, context)) {
            continue;
          }
          offendingSpreads.push({
            name,
            childrenSourceId: binding.childrenSourceId,
          });
        }

        if (offendingSpreads.length === 0) return;

        const lastOffendingChildrenSourceId =
          offendingSpreads[offendingSpreads.length - 1].childrenSourceId;
        const lastSourceIds = new Set([lastOffendingChildrenSourceId]);
        const propsObjectNames = collectPropsObjectNamesForChildrenSourceIds(
          lastSourceIds,
          functionStack,
        );
        const childrenValueNames =
          collectChildrenValueNamesForChildrenSourceIds(
            lastSourceIds,
            functionStack,
          );
        if (
          childrenRenderSpreadChildren(
            node.children,
            propsObjectNames,
            childrenValueNames,
          )
        ) {
          return;
        }

        const clobberedNames = Array.from(
          new Set(
            offendingSpreads
              .filter(
                (spread) =>
                  spread.childrenSourceId === lastOffendingChildrenSourceId,
              )
              .map((spread) => spread.name),
          ),
        );
        context.report({
          node: node.openingElement,
          messageId: 'childrenClobbered',
          data: { spreadNames: clobberedNames.join(', ') },
        });
      },
    };
  },
});
