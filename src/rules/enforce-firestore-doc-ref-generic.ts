/**
 * @fileoverview Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup
 * @author BluMint
 */

/**
 * @type {import('eslint').Rule.RuleModule}
 */

import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { declarationOf, resolveInEnclosingScopes } from '../utils/lexicalScope';

type MessageIds = 'missingGeneric' | 'invalidGeneric';

/** The Firestore reference types that carry a document-shape generic. */
const REFERENCE_TYPE_NAMES = new Set([
  'DocumentReference',
  'CollectionReference',
  'CollectionGroup',
]);

/**
 * The final segment of a type reference's name, so `FirebaseFirestore.
 * DocumentReference` is read as the same name as `DocumentReference`.
 */
const rightmostTypeName = (
  typeName: TSESTree.EntityName,
): string | undefined => {
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return typeName.name;
  }
  if (
    typeName.type === AST_NODE_TYPES.TSQualifiedName &&
    typeName.right.type === AST_NODE_TYPES.Identifier
  ) {
    return typeName.right.name;
  }
  return undefined;
};

/**
 * The reference type a name states, matched on that final segment.
 *
 * The rightmost segment is the right granularity because the namespace is
 * arbitrary — `FirebaseFirestore.`, `admin.firestore.` and any
 * `import * as fs from 'firebase-admin/firestore'` alias all name these types —
 * while the names themselves are specific enough that an unrelated module's
 * `DocumentReference` is not a realistic collision.
 */
const referenceTypeNameOf = (
  typeName: TSESTree.EntityName,
): string | undefined => {
  const name = rightmostTypeName(typeName);
  return name && REFERENCE_TYPE_NAMES.has(name) ? name : undefined;
};

/**
 * The type names an assertion can state that carry a document-shape generic.
 *
 * `Query` joins the three reference types here alone: `.where(...)` narrows a
 * collection to it while keeping the document generic, so `as Query<User>`
 * states the schema exactly as `as CollectionReference<User>` does. It is not a
 * reference type the rule reports on, which is why it is not in
 * `REFERENCE_TYPE_NAMES`.
 */
const SCHEMA_TYPE_NAMES = new Set([...REFERENCE_TYPE_NAMES, 'Query']);

/**
 * The name a type reference or an interface heritage clause states, whichever
 * spelling names it, so `FirebaseFirestore.DocumentReference` and
 * `DocumentReference` are read as the same type.
 */
const namedTypeOf = (node: TSESTree.Node): string | undefined => {
  if (node.type === AST_NODE_TYPES.TSTypeReference) {
    return rightmostTypeName(node.typeName);
  }
  if (node.type === AST_NODE_TYPES.TSInterfaceHeritage) {
    const { expression } = node;
    if (expression.type === AST_NODE_TYPES.Identifier) {
      return expression.name;
    }
    if (
      expression.type === AST_NODE_TYPES.MemberExpression &&
      expression.property.type === AST_NODE_TYPES.Identifier
    ) {
      return expression.property.name;
    }
  }
  return undefined;
};

/**
 * The child nodes of a node, read generically so that every type syntax — an
 * array, a union, a tuple, a mapped or conditional type — is traversed without
 * enumerating the kinds one by one. `parent` is skipped because following it
 * walks back out of the subtree and never terminates.
 */
const childNodesOf = (node: TSESTree.Node): TSESTree.Node[] => {
  const children: TSESTree.Node[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (ASTHelpers.isNode(item)) {
          children.push(item);
        }
      }
    } else if (ASTHelpers.isNode(value)) {
      children.push(value);
    }
  }
  return children;
};

/**
 * The type nodes a declaration states about the type it declares.
 *
 * An alias hands over its whole right-hand side, so every type its members name
 * is reached. The interface spelling has to hand over as much or the two answer
 * differently about the same declaration: its heritage clauses state what it
 * inherits, and its body states what it declares. Reading the clauses alone
 * left a reference type written as an interface MEMBER invisible, so
 * `as Schema['user']` reported a schema the file states in full — while the
 * alias `prefer-type-over-interface --fix` rewrites that interface into was
 * already exempt, making one fix pass the difference between reporting and
 * silence (#2189).
 */
const statedTypeNodesOf = (
  declaration: NamedTypeDeclaration,
): TSESTree.Node[] =>
  declaration.type === AST_NODE_TYPES.TSTypeAliasDeclaration
    ? [declaration.typeAnnotation]
    : [...(declaration.extends ?? []), declaration.body];

/**
 * The expression an optional link wraps, so a receiver spelled with `?.` is
 * read as the expression it actually evaluates.
 *
 * `a?.b` interposes a `ChainExpression` between the member/call and its real
 * parent. That link perturbs nullability, not the document schema:
 * `db?.collection<T>('x')` has type `CollectionReference<T> | undefined`, whose
 * schema is still `T`, never `DocumentData`. Leaving the wrapper in place makes
 * a typed collection look unrecognizable, and the `.doc()` that inherits its
 * schema draws a missing-generic report whose only remedy — `doc<T>(...)` —
 * does not compile, since `CollectionReference<T>.doc` declares no type
 * parameters.
 */
function unwrapOptionalChain(node: TSESTree.Node): TSESTree.Node {
  return node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
}

/**
 * The two ways a class member is named at a `this.<member>` site and at its
 * declaration.
 *
 * `#foo` and `private foo` express the same privacy and are mutually exclusive
 * spellings — `private #foo` is a TypeScript error (TS18010) — so a member
 * lookup that reads only `Identifier` cannot be opted back into by adding a
 * modifier. The schema a class member declares is evidence about the reference
 * built from it whichever spelling names it, so both are resolved.
 */
type MemberName = TSESTree.Identifier | TSESTree.PrivateIdentifier;

function isMemberName(node: TSESTree.Node): node is MemberName {
  return (
    node.type === AST_NODE_TYPES.Identifier ||
    node.type === AST_NODE_TYPES.PrivateIdentifier
  );
}

/**
 * Whether a class member's key names the member a `this.<member>` site reaches.
 *
 * The spelling has to agree as well as the bare word: `#settings` and a sibling
 * public `settings` are two distinct members that may hold different schemas,
 * so matching on the name alone would answer a question about one of them with
 * evidence taken from the other. `PrivateIdentifier.name` carries the bare word
 * with no `#` at both the declaration and the reference, so once the node types
 * agree the names compare directly.
 */
function isMemberKeyNamed(
  key: TSESTree.Node,
  reference: MemberName,
): key is MemberName {
  return (
    isMemberName(key) &&
    key.type === reference.type &&
    key.name === reference.name
  );
}

/** The spellings a function can be written in. */
type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

function isFunctionNode(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

/**
 * The nearest function a node sits inside.
 *
 * A return statement is reached from its function through an arbitrary depth of
 * blocks, conditionals and loops, so stepping a fixed number of parents up
 * answers a question about indentation rather than about ownership: it finds the
 * function only when the `return` is written directly in the body, and only for
 * the spelling whose body is a block.
 */
function enclosingFunction(node: TSESTree.Node): FunctionNode | undefined {
  let current: TSESTree.Node | undefined = node.parent as
    | TSESTree.Node
    | undefined;
  while (current) {
    if (isFunctionNode(current)) {
      return current;
    }
    current = current.parent as TSESTree.Node | undefined;
  }
  return undefined;
}

/** The declaration spellings a named document schema can be written in. */
type NamedTypeDeclaration =
  | TSESTree.TSInterfaceDeclaration
  | TSESTree.TSTypeAliasDeclaration;

/**
 * The type declaration a statement makes, looking through `export`.
 *
 * `export type User = ...` is the same declaration one AST node deeper, inside
 * an `ExportNamedDeclaration`. Reading the statement without unwrapping makes
 * the `export` keyword alone decide whether a schema is checked, which is not a
 * distinction the document shape knows anything about.
 */
function typeDeclarationNamed(
  statement: TSESTree.Node,
  name: string,
): NamedTypeDeclaration | undefined {
  const declared = declarationOf(statement);

  if (
    (declared.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
      declared.type === AST_NODE_TYPES.TSTypeAliasDeclaration) &&
    declared.id.name === name
  ) {
    return declared;
  }
  return undefined;
}

/**
 * Resolves a type name against every enclosing statement container, innermost
 * outward, so the nearest declaration shadows a same-named outer one.
 *
 * Searching `Program.body` alone left the two commonest spellings unresolvable:
 * an exported declaration sits inside its `export` statement, and a declaration
 * written in a function body, block, or namespace sits inside that. Since an
 * unresolved name is treated as carrying no readable members, the hole silently
 * dropped the nested-`any` check rather than reporting anything.
 */
function declarationOfType(
  from: TSESTree.Node,
  name: string,
): NamedTypeDeclaration | undefined {
  return resolveInEnclosingScopes<NamedTypeDeclaration>(from, (statements) => {
    for (const statement of statements) {
      const declaration = typeDeclarationNamed(statement, name);
      if (declaration) {
        return declaration;
      }
    }
    return undefined;
  });
}

/**
 * Whether an asserted type states a Firestore reference surface, and so
 * describes the document schema of the expression it is applied to.
 *
 * The presence of an assertion is not evidence on its own. `as const` states no
 * type at all — it preserves whatever the operand already infers to and adds
 * `readonly` — so every reference beneath one keeps the loose `DocumentData`
 * schema this rule exists to reject, byte for byte. `global-const-style` ships
 * `error` in the same recommended config and is fixable, and its fix appends
 * exactly that assertion to a module-scope literal, so crediting any ancestor
 * assertion lets one `eslint --fix` pass silence the rule without repairing
 * anything (#2007).
 *
 * The search is structural rather than positional, because an assertion types
 * the references inside a literal it wraps: `[db.collection('a')] as
 * CollectionReference<T>[]` and `{...} as Record<string, CollectionReference<T>>`
 * both state the schema from several type nodes away. Proximity therefore
 * cannot be the test — the minimal repro, `db.collection('x') as const`, has the
 * assertion as the call's own parent.
 *
 * A name that resolves to a declaration in the file is followed, since an alias
 * states what it stands for. Both declaration spellings are read for the reason
 * `declaredMembersOf` reads both: `prefer-type-over-interface` ships in the same
 * config and is fixable, so an interface and the alias it becomes have to answer
 * alike.
 */
function statesDocumentSchema(
  node: TSESTree.Node,
  visited: Set<NamedTypeDeclaration>,
): boolean {
  const name = namedTypeOf(node);
  if (name) {
    if (SCHEMA_TYPE_NAMES.has(name)) {
      return true;
    }
    if (declaredTypeStatesDocumentSchema(node, name, visited)) {
      return true;
    }
  }

  return childNodesOf(node).some((child) =>
    statesDocumentSchema(child, visited),
  );
}

/**
 * The declaration set doubles as the recursion guard, so a self-referential
 * alias such as `type Loop = Loop[]` terminates instead of exhausting the stack.
 */
function declaredTypeStatesDocumentSchema(
  reference: TSESTree.Node,
  name: string,
  visited: Set<NamedTypeDeclaration>,
): boolean {
  const declaration = declarationOfType(reference, name);
  if (!declaration || visited.has(declaration)) {
    return false;
  }
  visited.add(declaration);

  return statedTypeNodesOf(declaration).some((stated) =>
    statesDocumentSchema(stated, visited),
  );
}

/**
 * @type {import('eslint').Rule.RuleModule}
 */
export const enforceFirestoreDocRefGeneric = createRule<[], MessageIds>({
  name: 'enforce-firestore-doc-ref-generic',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup',
      recommended: 'error',
      // Every check here is syntactic: generics are read off the AST and named
      // generics are resolved against declarations in the same file. Declaring
      // type information would be a false promise twice over — it tells
      // consumers they need `parserOptions.project`, and it exempts this rule
      // from guards that skip rules a program-less `Linter` cannot exercise.
      requiresTypeChecking: false,
    },
    schema: [],
    messages: {
      missingGeneric: [
        "What's wrong: {{ type }} is missing its document schema generic (the document data type).",
        '',
        'Why it matters: Without the generic, Firestore references fall back to loose DocumentData, so TypeScript cannot catch field typos or missing required properties before they reach Firestore.',
        '',
        'How to fix: Add the document interface/type as the generic (e.g., const ref: {{ type }}<UserDoc> = ... or doc<UserDoc>(collection)).',
      ].join('\n'),
      invalidGeneric: [
        'What\'s wrong: {{ type }} uses "any" or an empty object ({}) in its schema generic.',
        '',
        'Why it matters: This erases the document schema and disables TypeScript checks on Firestore reads and writes, so malformed payloads and missing fields can pass silently.',
        '',
        'How to fix: Define a concrete interface/type for the document (e.g., interface UserDoc { name: string }) and use it as the generic instead of "any" or {}.',
      ].join('\n'),
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Keyed on the resolved declaration rather than on the name, because
     * resolution is lexical: two scopes in one file may declare the same name
     * with different fields, and a name-keyed answer would carry one scope's
     * verdict into the other.
     */
    const declarationCache = new WeakMap<NamedTypeDeclaration, boolean>();
    const nodeCache = new WeakMap<TSESTree.Node, boolean>();

    function hasInvalidType(node: TSESTree.TypeNode | undefined): boolean {
      if (!node) return false;

      switch (node.type) {
        case AST_NODE_TYPES.TSAnyKeyword:
          return true;
        case AST_NODE_TYPES.TSTypeLiteral:
          if (!node.members || node.members.length === 0) {
            return true;
          }
          return membersHaveInvalidType(node.members);
        case AST_NODE_TYPES.TSTypeReference:
          if (node.typeParameters) {
            return node.typeParameters.params.some(hasInvalidType);
          }
          if (node.typeName.type === AST_NODE_TYPES.Identifier) {
            return declaredTypeHasInvalidType(node.typeName);
          }
          return false;
        case AST_NODE_TYPES.TSIntersectionType:
        case AST_NODE_TYPES.TSUnionType:
          return node.types.some(hasInvalidType);
        case AST_NODE_TYPES.TSTypeOperator:
          if ('typeAnnotation' in node) {
            return hasInvalidType(node.typeAnnotation);
          }
          return false;
        case AST_NODE_TYPES.TSMappedType:
          if ('typeAnnotation' in node) {
            return hasInvalidType(node.typeAnnotation);
          }
          return false;
        case AST_NODE_TYPES.TSIndexedAccessType:
          return (
            hasInvalidType(node.objectType) || hasInvalidType(node.indexType)
          );
        case AST_NODE_TYPES.TSConditionalType:
          return (
            hasInvalidType(node.checkType) ||
            hasInvalidType(node.extendsType) ||
            hasInvalidType(node.trueType) ||
            hasInvalidType(node.falseType)
          );
        case AST_NODE_TYPES.TSArrayType:
          return hasInvalidType(node.elementType);
        case AST_NODE_TYPES.TSTupleType:
          return node.elementTypes.some(hasInvalidType);
        case AST_NODE_TYPES.TSTypeQuery:
          return false;
        default:
          return false;
      }
    }

    function membersHaveInvalidType(members: TSESTree.TypeElement[]): boolean {
      return members.some((member) => {
        if (
          member.type === AST_NODE_TYPES.TSPropertySignature &&
          member.typeAnnotation
        ) {
          return hasInvalidType(member.typeAnnotation.typeAnnotation);
        }
        return false;
      });
    }

    /**
     * Wrappers an alias may place around its type literal without changing the
     * fields the document declares. `Readonly<{...}>` written inline at the
     * reference is already looked through by the type-argument recursion in
     * `hasInvalidType`, so reading it here keeps the two spellings in agreement.
     * A wrapper that drops fields, such as `Omit`, is excluded: its members are
     * not the document's members, and checking them invents reports.
     */
    const FIELD_PRESERVING_WRAPPERS = new Set(['Readonly']);

    /**
     * Reads the type literal an alias declares, looking through at most one
     * field-preserving wrapper. Anything else — a union, an intersection, a
     * mapped type, a reference to another named or imported type — has no
     * members this rule can read syntactically, and guessing at them is how
     * false positives arrive, so it stays unresolved.
     */
    function aliasedTypeLiteral(
      typeNode: TSESTree.TypeNode,
    ): TSESTree.TSTypeLiteral | undefined {
      if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
        return typeNode;
      }

      if (
        typeNode.type !== AST_NODE_TYPES.TSTypeReference ||
        typeNode.typeName.type !== AST_NODE_TYPES.Identifier ||
        !FIELD_PRESERVING_WRAPPERS.has(typeNode.typeName.name)
      ) {
        return undefined;
      }

      const wrapperArguments = typeNode.typeParameters?.params;
      if (!wrapperArguments || wrapperArguments.length !== 1) {
        return undefined;
      }

      const [wrapped] = wrapperArguments;
      return wrapped.type === AST_NODE_TYPES.TSTypeLiteral
        ? wrapped
        : undefined;
    }

    /**
     * The members a declaration lists, reading an interface and a type alias
     * alike.
     *
     * The alias spelling is not an extra convenience: `prefer-type-over-interface`
     * ships in the same recommended config and is fixable, so a single
     * `eslint --fix` pass rewrites every interface into a type alias. A lookup
     * that reads interfaces alone therefore resolves nothing on a codebase that
     * has run the config, and a nested `any` in a document schema goes
     * unreported.
     */
    function declaredMembersOf(
      declaration: NamedTypeDeclaration,
    ): TSESTree.TypeElement[] | undefined {
      return declaration.type === AST_NODE_TYPES.TSInterfaceDeclaration
        ? declaration.body.body
        : aliasedTypeLiteral(declaration.typeAnnotation)?.members;
    }

    /**
     * Reports whether the type a name stands for declares a field this rule
     * rejects, resolving the name from the reference site outward.
     *
     * The declaration doubles as the recursion guard: a self-referential schema
     * such as `type Node = { child: Node }` reaches its own entry, which is
     * seeded `false` before its members are read.
     */
    function declaredTypeHasInvalidType(
      typeName: TSESTree.Identifier,
    ): boolean {
      const declaration = declarationOfType(typeName, typeName.name);
      if (!declaration) {
        return false;
      }

      const cached = declarationCache.get(declaration);
      if (cached !== undefined) {
        return cached;
      }
      declarationCache.set(declaration, false);

      const members = declaredMembersOf(declaration);
      if (!members) {
        return false;
      }

      const result = membersHaveInvalidType(members);
      declarationCache.set(declaration, result);
      return result;
    }

    function hasTypeAnnotation(node: TSESTree.Node): boolean {
      if (nodeCache.has(node)) {
        return nodeCache.get(node)!;
      }

      // The child the walk arrived from, which is what distinguishes a function
      // whose returned expression is under examination from one that merely
      // contains the expression somewhere in its body.
      let previous: TSESTree.Node | undefined;
      let current: TSESTree.Node | undefined = node;
      while (current) {
        // Type assertions using 'as' keyword, credited only when the asserted
        // type states the document schema. A non-stating assertion does not end
        // the walk: `db.doc(p) as unknown as DocumentReference<User>` reaches
        // the stating one an assertion further out.
        if (
          current.type === AST_NODE_TYPES.TSAsExpression &&
          statesDocumentSchema(current.typeAnnotation, new Set())
        ) {
          nodeCache.set(node, true);
          return true;
        }
        // Variable declarations with type annotations
        if (
          current.type === AST_NODE_TYPES.VariableDeclarator &&
          current.id.typeAnnotation
        ) {
          nodeCache.set(node, true);
          return true;
        }
        // Class property definitions with type annotations
        if (
          current.type === AST_NODE_TYPES.PropertyDefinition &&
          current.typeAnnotation
        ) {
          nodeCache.set(node, true);
          return true;
        }
        // Return statements in functions with return type annotations. The
        // annotation states the schema whichever way its function is written,
        // so a declaration, a function expression and an arrow are all read.
        if (current.type === AST_NODE_TYPES.ReturnStatement) {
          if (enclosingFunction(current)?.returnType) {
            nodeCache.set(node, true);
            return true;
          }
        }
        // A concise arrow body is the returned expression itself and produces no
        // ReturnStatement, so the branch above cannot see it. Requiring the walk
        // to have arrived from the body keeps the annotation describing only
        // what the function hands back: a reference built and stored inside a
        // block body is described by nothing and still reports.
        if (
          isFunctionNode(current) &&
          current.returnType &&
          current.body === previous &&
          current.body.type !== AST_NODE_TYPES.BlockStatement
        ) {
          nodeCache.set(node, true);
          return true;
        }
        // Assignment expressions to class properties
        if (current.type === AST_NODE_TYPES.AssignmentExpression) {
          const left = current.left;
          if (left.type === AST_NODE_TYPES.MemberExpression) {
            const obj = left.object;
            const assigned = left.property;
            if (
              obj.type === AST_NODE_TYPES.ThisExpression &&
              isMemberName(assigned)
            ) {
              const classNode = findParentClass(current);
              if (classNode) {
                const property = classNode.body.body.find(
                  (member): member is TSESTree.PropertyDefinition =>
                    member.type === AST_NODE_TYPES.PropertyDefinition &&
                    isMemberKeyNamed(member.key, assigned),
                );
                if (property?.typeAnnotation) {
                  nodeCache.set(node, true);
                  return true;
                }
              }
            }
          }
        }
        previous = current;
        current = current.parent as TSESTree.Node;
      }
      nodeCache.set(node, false);
      return false;
    }

    function findParentClass(
      node: TSESTree.Node,
    ): TSESTree.ClassDeclaration | undefined {
      let current: TSESTree.Node | undefined = node;
      while (current) {
        if (current.type === AST_NODE_TYPES.ClassDeclaration) {
          return current;
        }
        current = current.parent as TSESTree.Node;
      }
      return undefined;
    }

    function isPartOfMethodChain(node: TSESTree.CallExpression): boolean {
      if (node.callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      // Check if this node is part of a method chain as the object
      const obj = node.callee.object;
      if (obj.type === AST_NODE_TYPES.CallExpression) {
        return true;
      }

      // Check if this node is part of a method chain as the callee
      let current: TSESTree.Node | undefined = node;
      while (current) {
        if (
          current.parent?.type === AST_NODE_TYPES.MemberExpression &&
          current.parent.parent?.type === AST_NODE_TYPES.CallExpression
        ) {
          return true;
        }
        current = current.parent as TSESTree.Node;
      }

      return false;
    }

    const isTypedCollectionReferenceCache = new Map<TSESTree.Node, boolean>();

    function isTypedCollectionReference(receiver: TSESTree.Node): boolean {
      if (!receiver) return false;
      const node = unwrapOptionalChain(receiver);
      if (isTypedCollectionReferenceCache.has(node)) {
        return isTypedCollectionReferenceCache.get(node)!;
      }

      let result = false;

      // A receiver reached through an assertion states its schema exactly as an
      // annotated binding does, and `isTypedCollectionInitializer` already reads
      // the same spelling one hop later. Without this, the receiver in
      // `(matchRef.collection('m') as CollectionReference<T>).doc(id)` looks
      // untyped and `.doc()` draws a report whose only remedy — `doc<T>(id)` —
      // does not compile, since `CollectionReference<T>.doc` declares zero type
      // parameters.
      if (node.type === AST_NODE_TYPES.TSAsExpression) {
        result = hasCollectionReferenceType(node.typeAnnotation);
      } else if (
        node.type === AST_NODE_TYPES.CallExpression &&
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'collection' &&
        node.typeParameters &&
        node.typeParameters.params.length > 0
      ) {
        result = true;
      } else if (node.type === AST_NODE_TYPES.MemberExpression) {
        result = checkMemberExpressionForCollectionReference(node);
      } else if (node.type === AST_NODE_TYPES.Identifier) {
        result = checkIdentifierForCollectionReference(node);
      } else if (node.type === AST_NODE_TYPES.CallExpression) {
        result = checkCallExpressionForCollectionReference(node);
      }

      isTypedCollectionReferenceCache.set(node, result);
      return result;
    }

    function checkMemberExpressionForCollectionReference(
      node: TSESTree.MemberExpression,
    ): boolean {
      const obj = node.object;
      const property = node.property;

      // Handle this.property access
      if (
        obj.type === AST_NODE_TYPES.ThisExpression &&
        isMemberName(property)
      ) {
        const classNode = findParentClass(node);
        if (classNode) {
          const classProp = classNode.body.body.find(
            (member): member is TSESTree.PropertyDefinition =>
              member.type === AST_NODE_TYPES.PropertyDefinition &&
              isMemberKeyNamed(member.key, property),
          );
          if (classProp?.typeAnnotation) {
            return hasCollectionReferenceType(
              classProp.typeAnnotation.typeAnnotation,
            );
          }
        }
      }

      // Handle nested property access like this.collections.tasks
      if (obj.type === AST_NODE_TYPES.MemberExpression) {
        const parentType = getTypeOfMemberExpression(obj);
        if (parentType && property.type === AST_NODE_TYPES.Identifier) {
          // Check if the parent object has a property with CollectionReference type
          return checkObjectPropertyForCollectionReference(
            parentType,
            property.name,
          );
        }
      }

      // Handle identifier.property access
      if (
        obj.type === AST_NODE_TYPES.Identifier &&
        property.type === AST_NODE_TYPES.Identifier
      ) {
        const objType = getTypeOfIdentifier(obj);
        if (objType) {
          return checkObjectPropertyForCollectionReference(
            objType,
            property.name,
          );
        }
      }

      // Handle getter methods like this.collection where collection is a getter
      if (
        obj.type === AST_NODE_TYPES.ThisExpression &&
        isMemberName(property)
      ) {
        const classNode = findParentClass(node);
        if (classNode) {
          const getter = classNode.body.body.find(
            (member): member is TSESTree.MethodDefinition =>
              member.type === AST_NODE_TYPES.MethodDefinition &&
              member.kind === 'get' &&
              isMemberKeyNamed(member.key, property),
          );
          if (getter) {
            return yieldsTypedCollectionReference(getter.value);
          }
        }
      }

      return false;
    }

    /**
     * Guards the return-expression inference below against a class whose
     * members refer to one another, such as `get a() { return this.a; }` or a
     * pair of mutually recursive methods. Following the expression is otherwise
     * unbounded, and a cycle is legal input that must terminate rather than
     * exhaust the stack.
     */
    const inferenceInProgress = new Set<TSESTree.Node>();

    /**
     * Reports whether a class member provably hands back a typed
     * CollectionReference.
     *
     * The explicit return annotation is authoritative where it exists, but it
     * cannot be the only evidence read: `no-explicit-return-type` ships in the
     * same recommended config and is fixable, so a single `eslint --fix` pass
     * deletes it. The schema the annotation described still lives in the
     * expression the member returns, and that expression is what the fixer
     * leaves behind, so it is read as the fallback.
     */
    function yieldsTypedCollectionReference(
      fn:
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | TSESTree.TSEmptyBodyFunctionExpression,
    ): boolean {
      if (fn.returnType) {
        return hasCollectionReferenceType(fn.returnType.typeAnnotation);
      }

      if (!fn.body || inferenceInProgress.has(fn)) {
        return false;
      }
      inferenceInProgress.add(fn);
      try {
        if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
          return isTypedCollectionReference(fn.body);
        }

        // Only top-level returns are read; a return nested inside another
        // function belongs to that one.
        return fn.body.body.some(
          (statement) =>
            statement.type === AST_NODE_TYPES.ReturnStatement &&
            !!statement.argument &&
            isTypedCollectionReference(statement.argument),
        );
      } finally {
        inferenceInProgress.delete(fn);
      }
    }

    function checkIdentifierForCollectionReference(
      node: TSESTree.Identifier,
    ): boolean {
      // Check function parameters
      const functionParam = findFunctionParameter(node);
      if (
        functionParam &&
        'typeAnnotation' in functionParam &&
        functionParam.typeAnnotation
      ) {
        return hasCollectionReferenceType(
          functionParam.typeAnnotation.typeAnnotation,
        );
      }

      // Check variable declarations in current scope and parent scopes
      if (findVariableDeclaration(node)) {
        return true;
      }

      // Resolve the binding through the scope chain so that a typed collection
      // stored in a variable still supplies the document generic to .doc().
      if (isTypedCollectionBinding(node)) {
        return true;
      }

      return false;
    }

    /**
     * Resolves an identifier to its declaration and reports whether that
     * declaration provably yields a typed CollectionReference.
     *
     * Deliberately conservative: only immutable (`const`) bindings with a
     * single definition are followed, and only for one hop. An alias such as
     * `const b = a;` is not resolved because chasing arbitrary dataflow
     * syntactically produces unsound exemptions; `let`/`var` are refused
     * because a later assignment can replace the value with an untyped
     * collection. Anything unresolvable (parameters, imports, destructuring)
     * keeps reporting, since the rule cannot prove the reference is typed.
     */
    function isTypedCollectionBinding(node: TSESTree.Identifier): boolean {
      const scope = ASTHelpers.getScope(context, node);
      const variable = ASTHelpers.findVariableInScope(scope, node.name);
      if (!variable || variable.defs.length !== 1) {
        return false;
      }

      const def = variable.defs[0];
      if (
        def.type !== 'Variable' ||
        def.node.type !== AST_NODE_TYPES.VariableDeclarator ||
        def.parent?.type !== AST_NODE_TYPES.VariableDeclaration ||
        def.parent.kind !== 'const'
      ) {
        return false;
      }

      const declarator = def.node;
      if (
        declarator.id.type === AST_NODE_TYPES.Identifier &&
        declarator.id.typeAnnotation
      ) {
        return hasCollectionReferenceType(
          declarator.id.typeAnnotation.typeAnnotation,
        );
      }

      return isTypedCollectionInitializer(declarator.init);
    }

    function isTypedCollectionInitializer(
      initializer: TSESTree.Expression | null | undefined,
    ): boolean {
      if (!initializer) {
        return false;
      }

      const init = unwrapOptionalChain(initializer);

      // An explicit assertion states the schema just as an annotation does.
      if (init.type === AST_NODE_TYPES.TSAsExpression) {
        return hasCollectionReferenceType(init.typeAnnotation);
      }

      // Mirrors the chained `db.collection<T>('x').doc('y')` detection: the
      // presence of the type argument is what matters here. An `any`/`{}`
      // argument is already reported on the collection call itself, so it is
      // not reported a second time on the derived document reference.
      return (
        init.type === AST_NODE_TYPES.CallExpression &&
        init.callee.type === AST_NODE_TYPES.MemberExpression &&
        init.callee.property.type === AST_NODE_TYPES.Identifier &&
        init.callee.property.name === 'collection' &&
        !!init.typeParameters &&
        init.typeParameters.params.length > 0
      );
    }

    function checkCallExpressionForCollectionReference(
      node: TSESTree.CallExpression,
    ): boolean {
      // Check if this is a method call that returns CollectionReference
      if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
        const obj = node.callee.object;
        const property = node.callee.property;

        if (isMemberName(property)) {
          // Check if this is a getter or method that returns CollectionReference
          if (obj.type === AST_NODE_TYPES.ThisExpression) {
            const classNode = findParentClass(node);
            if (classNode) {
              const callee = findClassCallable(classNode, property);
              if (callee) {
                return yieldsTypedCollectionReference(callee);
              }
            }
          }
        }
      }

      return false;
    }

    /**
     * Resolves `this.<name>()` to the function the call runs, covering both a
     * method declaration and a property holding a function expression. The
     * member is matched by name alone: requiring a return annotation here would
     * make the resolution disappear the moment `no-explicit-return-type`
     * strips it, even though the returned expression is unchanged.
     */
    function findClassCallable(
      classNode: TSESTree.ClassDeclaration,
      reference: MemberName,
    ):
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression
      | TSESTree.TSEmptyBodyFunctionExpression
      | undefined {
      for (const member of classNode.body.body) {
        if (
          member.type === AST_NODE_TYPES.MethodDefinition &&
          member.kind === 'method' &&
          isMemberKeyNamed(member.key, reference)
        ) {
          return member.value;
        }

        if (
          member.type === AST_NODE_TYPES.PropertyDefinition &&
          isMemberKeyNamed(member.key, reference)
        ) {
          // An annotated property is already resolved by the member-expression
          // path, which reads the annotation rather than the initializer.
          if (member.typeAnnotation || !member.value) {
            return undefined;
          }
          const initializer = member.value;
          const isFunction =
            initializer.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            initializer.type === AST_NODE_TYPES.FunctionExpression;
          return isFunction ? initializer : undefined;
        }
      }

      return undefined;
    }

    function getTypeOfMemberExpression(
      node: TSESTree.MemberExpression,
    ): TSESTree.TypeNode | null {
      const property = node.property;
      if (
        node.object.type === AST_NODE_TYPES.ThisExpression &&
        isMemberName(property)
      ) {
        const classNode = findParentClass(node);
        if (classNode) {
          const classProp = classNode.body.body.find(
            (member): member is TSESTree.PropertyDefinition =>
              member.type === AST_NODE_TYPES.PropertyDefinition &&
              isMemberKeyNamed(member.key, property),
          );
          return classProp?.typeAnnotation?.typeAnnotation || null;
        }
      }
      return null;
    }

    function getTypeOfIdentifier(
      node: TSESTree.Identifier,
    ): TSESTree.TypeNode | null {
      const functionParam = findFunctionParameter(node);
      if (
        functionParam &&
        'typeAnnotation' in functionParam &&
        functionParam.typeAnnotation
      ) {
        return functionParam.typeAnnotation.typeAnnotation;
      }

      const varDecl = findVariableDeclarationNode(node);
      if (varDecl?.typeAnnotation) {
        return varDecl.typeAnnotation.typeAnnotation;
      }

      return null;
    }

    function checkObjectPropertyForCollectionReference(
      objectType: TSESTree.TypeNode,
      propertyName: string,
    ): boolean {
      if (objectType.type === AST_NODE_TYPES.TSTypeLiteral) {
        const property = objectType.members.find(
          (member): member is TSESTree.TSPropertySignature =>
            member.type === AST_NODE_TYPES.TSPropertySignature &&
            member.key.type === AST_NODE_TYPES.Identifier &&
            member.key.name === propertyName &&
            !!member.typeAnnotation,
        );
        if (property?.typeAnnotation) {
          return hasCollectionReferenceType(
            property.typeAnnotation.typeAnnotation,
          );
        }
      }

      // Handle Record<string, CollectionReference<T>> types
      if (
        objectType.type === AST_NODE_TYPES.TSTypeReference &&
        objectType.typeName.type === AST_NODE_TYPES.Identifier &&
        objectType.typeName.name === 'Record' &&
        objectType.typeParameters &&
        objectType.typeParameters.params.length === 2
      ) {
        const valueType = objectType.typeParameters.params[1];
        return hasCollectionReferenceType(valueType);
      }

      // Handle array types like CollectionReference<T>[]
      if (objectType.type === AST_NODE_TYPES.TSArrayType) {
        return hasCollectionReferenceType(objectType.elementType);
      }

      return false;
    }

    function findFunctionParameter(
      node: TSESTree.Identifier,
    ): TSESTree.Parameter | null {
      const findParamInFunction = (
        func: FunctionNode,
      ): TSESTree.Identifier | null => {
        const param = func.params.find(
          (p): p is TSESTree.Identifier =>
            p.type === AST_NODE_TYPES.Identifier &&
            p.name === node.name &&
            'typeAnnotation' in p &&
            p.typeAnnotation !== undefined,
        );
        return param || null;
      };

      const functionScopes: FunctionNode[] = [];

      let current: TSESTree.Node | undefined = node;
      while (current) {
        if (isFunctionNode(current)) {
          functionScopes.push(current);
        }
        current = current.parent as TSESTree.Node | undefined;
      }

      for (const func of functionScopes) {
        const param = findParamInFunction(func);
        if (param) {
          return param;
        }
      }

      return null;
    }

    function findVariableDeclaration(node: TSESTree.Identifier): boolean {
      let current: TSESTree.Node | undefined = node;
      while (current) {
        // Check in current scope
        if (
          current.type === AST_NODE_TYPES.Program ||
          current.type === AST_NODE_TYPES.BlockStatement ||
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          const varDecl = findVariableInScope(current, node.name);
          if (varDecl && varDecl.typeAnnotation) {
            return hasCollectionReferenceType(
              varDecl.typeAnnotation.typeAnnotation,
            );
          }
        }
        current = current.parent as TSESTree.Node;
      }
      return false;
    }

    function findVariableDeclarationNode(
      node: TSESTree.Identifier,
    ): TSESTree.Identifier | null {
      let current: TSESTree.Node | undefined = node;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.Program ||
          current.type === AST_NODE_TYPES.BlockStatement ||
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          const varDecl = findVariableInScope(current, node.name);
          if (varDecl) {
            return varDecl;
          }
        }
        current = current.parent as TSESTree.Node;
      }
      return null;
    }

    function findVariableInScope(
      scope: TSESTree.Node,
      varName: string,
    ): TSESTree.Identifier | null {
      const body = getNodeBody(scope);
      if (!body) return null;

      for (const stmt of body) {
        if (stmt.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const decl of stmt.declarations) {
            if (
              decl.type === AST_NODE_TYPES.VariableDeclarator &&
              decl.id.type === AST_NODE_TYPES.Identifier &&
              decl.id.name === varName &&
              decl.id.typeAnnotation
            ) {
              return decl.id;
            }
          }
        }
      }
      return null;
    }

    function getNodeBody(node: TSESTree.Node): TSESTree.Statement[] | null {
      if (node.type === AST_NODE_TYPES.Program) {
        return node.body;
      }
      if (node.type === AST_NODE_TYPES.BlockStatement) {
        return node.body;
      }
      if (
        node.type === AST_NODE_TYPES.FunctionDeclaration ||
        node.type === AST_NODE_TYPES.FunctionExpression
      ) {
        return node.body?.body || null;
      }
      if (node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        return node.body.type === AST_NODE_TYPES.BlockStatement
          ? node.body.body
          : null;
      }
      return null;
    }

    function hasCollectionReferenceType(typeNode: TSESTree.TypeNode): boolean {
      if (
        typeNode.type === AST_NODE_TYPES.TSTypeReference &&
        referenceTypeNameOf(typeNode.typeName) === 'CollectionReference' &&
        typeNode.typeParameters &&
        typeNode.typeParameters.params.length > 0
      ) {
        return true;
      }

      if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
        return typeNode.types.some(hasCollectionReferenceType);
      }

      if (typeNode.type === AST_NODE_TYPES.TSIntersectionType) {
        return typeNode.types.some(hasCollectionReferenceType);
      }

      // TSParenthesizedType may appear even though AST_NODE_TYPES omits it
      if ((typeNode.type as string) === 'TSParenthesizedType') {
        const inner = (typeNode as { typeAnnotation: TSESTree.TypeNode })
          .typeAnnotation;
        return hasCollectionReferenceType(inner);
      }

      if (typeNode.type === AST_NODE_TYPES.TSArrayType) {
        return hasCollectionReferenceType(typeNode.elementType);
      }

      return false;
    }

    /**
     * `@firebase/rules-unit-testing` hands back the compat (v8) Firestore, whose
     * `.doc()`, `.collection()` and `.collectionGroup()` declare zero type
     * parameters. Asking for a schema generic there produces
     * `TS2558: Expected 0 type arguments, but got 1`, so every remediation this
     * rule suggests is uncompilable on that surface and the receiver must be
     * exempt.
     */
    const RULES_UNIT_TESTING_MODULE = '@firebase/rules-unit-testing';

    /**
     * A shared provisioner of the test environment lives in a module of the
     * project under lint, and this rule never opens another file, so the
     * specifier is the only evidence available about what that module hands
     * back. A relative specifier names such a module — code that can itself
     * construct a `RulesTestEnvironment` — whereas a bare specifier names a
     * package, and every published Firestore surface reached that way
     * (`firebase/firestore`, `firebase-admin/firestore`) does accept the
     * generic, so those roots must keep reporting.
     */
    function isProjectModuleSpecifier(source: string): boolean {
      return source.startsWith('./') || source.startsWith('../');
    }

    let fileImportsProjectModule: boolean | undefined;

    function importsProjectModule(): boolean {
      if (fileImportsProjectModule !== undefined) {
        return fileImportsProjectModule;
      }

      const found = context.sourceCode.ast.body.some(
        (statement) =>
          statement.type === AST_NODE_TYPES.ImportDeclaration &&
          isProjectModuleSpecifier(statement.source.value),
      );

      fileImportsProjectModule = found;
      return found;
    }

    let rulesUnitTestingLocals: Set<string> | undefined;

    /**
     * Scanned lazily rather than from an `ImportDeclaration` visitor so that
     * traversal order can never decide whether the exemption applies. Type-only
     * specifiers count because a callback parameter annotated `RulesTestContext`
     * is the other way a compat handle reaches a `.doc()` receiver.
     */
    function getRulesUnitTestingLocals(): Set<string> {
      if (rulesUnitTestingLocals) {
        return rulesUnitTestingLocals;
      }

      const locals = new Set<string>();
      for (const statement of context.sourceCode.ast.body) {
        if (
          statement.type === AST_NODE_TYPES.ImportDeclaration &&
          statement.source.value === RULES_UNIT_TESTING_MODULE
        ) {
          for (const specifier of statement.specifiers) {
            locals.add(specifier.local.name);
          }
        }
      }

      rulesUnitTestingLocals = locals;
      return locals;
    }

    /**
     * A qualified annotation such as `rut.RulesTestContext` is rooted at the
     * namespace binding, which is the name the import declaration provides.
     */
    function rootTypeNameOf(typeNode: TSESTree.TypeNode): string | undefined {
      if (typeNode.type !== AST_NODE_TYPES.TSTypeReference) {
        return undefined;
      }

      let entity: TSESTree.EntityName = typeNode.typeName;
      while (entity.type === AST_NODE_TYPES.TSQualifiedName) {
        entity = entity.left;
      }

      return entity.type === AST_NODE_TYPES.Identifier
        ? entity.name
        : undefined;
    }

    function isRulesUnitTestingType(typeNode: TSESTree.TypeNode): boolean {
      if (
        typeNode.type === AST_NODE_TYPES.TSUnionType ||
        typeNode.type === AST_NODE_TYPES.TSIntersectionType
      ) {
        return typeNode.types.some(isRulesUnitTestingType);
      }

      const rootName = rootTypeNameOf(typeNode);
      return !!rootName && getRulesUnitTestingLocals().has(rootName);
    }

    /**
     * How much of the `RulesTestEnvironment` context signature the walk has
     * passed through: a context factory followed by `firestore()`. Carried by
     * value rather than accumulated on the traversal, so a branch that reaches
     * the signature cannot lend it to a sibling branch that does not.
     */
    type ContextSignatureStage = 'none' | 'firestore' | 'satisfied';

    /**
     * The methods that hand back a `RulesTestContext`. Recognizing an API by
     * name is what `CONTEXT_CALLBACK_METHOD` already does; here it is never the
     * whole answer, since the signature only ever widens a root the module
     * specifier has already qualified.
     */
    const CONTEXT_FACTORY_METHODS = new Set([
      'authenticatedContext',
      'unauthenticatedContext',
    ]);

    const CONTEXT_FIRESTORE_METHOD = 'firestore';

    /**
     * The walk runs from the receiver toward the root, so the calls of
     * `env.authenticatedContext('u').firestore()` arrive in reverse:
     * `firestore()` first, then the factory that produced the context it was
     * called on. Requiring that order is what keeps a bare `env.firestore()` —
     * the spelling of every Admin SDK handle — outside the signature.
     */
    function advanceContextSignature(
      node: TSESTree.CallExpression,
      stage: ContextSignatureStage,
    ): ContextSignatureStage {
      if (
        node.callee.type !== AST_NODE_TYPES.MemberExpression ||
        node.callee.property.type !== AST_NODE_TYPES.Identifier
      ) {
        return stage;
      }

      const method = node.callee.property.name;
      if (stage === 'none' && method === CONTEXT_FIRESTORE_METHOD) {
        return 'firestore';
      }
      if (stage === 'firestore' && CONTEXT_FACTORY_METHODS.has(method)) {
        return 'satisfied';
      }
      return stage;
    }

    /**
     * Walks an expression toward its syntactic root and reports whether that
     * root is a value supplied by `@firebase/rules-unit-testing`, either
     * directly or through a module of the project that provisions the
     * environment on its behalf.
     *
     * Only `const` bindings are followed, mirroring `isTypedCollectionBinding`:
     * a `let`/`var` receiver can be reassigned to an Admin SDK handle, where the
     * generic is both supportable and valuable, so exempting it would silently
     * drop enforcement.
     */
    function tracesToRulesUnitTesting(
      node: TSESTree.Node | null | undefined,
      visited: Set<TSESTree.Node> = new Set(),
      stage: ContextSignatureStage = 'none',
    ): boolean {
      if (!node) {
        return false;
      }
      // The in-file arm needs a local binding of the module to terminate on,
      // and the cross-module arm needs a relative import. A file with neither
      // has no root that can qualify, so the walk is skipped outright rather
      // than run to exhaustion.
      if (getRulesUnitTestingLocals().size === 0 && !importsProjectModule()) {
        return false;
      }
      // Guards against a self-referential declaration such as `const a = a.b;`.
      if (visited.has(node)) {
        return false;
      }
      visited.add(node);

      switch (node.type) {
        case AST_NODE_TYPES.AwaitExpression:
          return tracesToRulesUnitTesting(node.argument, visited, stage);
        case AST_NODE_TYPES.CallExpression:
          return tracesToRulesUnitTesting(
            node.callee,
            visited,
            advanceContextSignature(node, stage),
          );
        case AST_NODE_TYPES.MemberExpression:
          return tracesToRulesUnitTesting(node.object, visited, stage);
        case AST_NODE_TYPES.ChainExpression:
          return tracesToRulesUnitTesting(node.expression, visited, stage);
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.TSAsExpression:
        case AST_NODE_TYPES.TSSatisfiesExpression:
        case AST_NODE_TYPES.TSTypeAssertion:
          return tracesToRulesUnitTesting(node.expression, visited, stage);
        case AST_NODE_TYPES.Identifier:
          return identifierTracesToRulesUnitTesting(node, visited, stage);
        case AST_NODE_TYPES.ArrowFunctionExpression:
        case AST_NODE_TYPES.FunctionExpression:
        case AST_NODE_TYPES.FunctionDeclaration:
          return functionReturnTracesToRulesUnitTesting(node, visited, stage);
        default:
          return false;
      }
    }

    /**
     * Reached when a receiver is the result of calling a local helper, so what
     * the helper hands back decides the surface. Only top-level returns are
     * read; a return nested inside another function belongs to that one.
     */
    function functionReturnTracesToRulesUnitTesting(
      node:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration,
      visited: Set<TSESTree.Node>,
      stage: ContextSignatureStage,
    ): boolean {
      if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
        return tracesToRulesUnitTesting(node.body, visited, stage);
      }

      return node.body.body.some(
        (statement) =>
          statement.type === AST_NODE_TYPES.ReturnStatement &&
          tracesToRulesUnitTesting(statement.argument, visited, stage),
      );
    }

    /**
     * `withSecurityRulesDisabled` is the one API here that delivers a context
     * through a callback rather than a return value, and the documented spelling
     * leaves the parameter unannotated, so the call it belongs to is the only
     * evidence of the surface.
     */
    const CONTEXT_CALLBACK_METHOD = 'withSecurityRulesDisabled';

    function parameterTracesToRulesUnitTesting(
      name: TSESTree.BindingName,
      owner: TSESTree.Node,
      visited: Set<TSESTree.Node>,
      stage: ContextSignatureStage,
    ): boolean {
      if (
        name.type === AST_NODE_TYPES.Identifier &&
        name.typeAnnotation &&
        isRulesUnitTestingType(name.typeAnnotation.typeAnnotation)
      ) {
        return true;
      }

      const call = owner.parent;
      if (
        !call ||
        call.type !== AST_NODE_TYPES.CallExpression ||
        !(call.arguments as TSESTree.Node[]).includes(owner) ||
        call.callee.type !== AST_NODE_TYPES.MemberExpression ||
        call.callee.property.type !== AST_NODE_TYPES.Identifier ||
        call.callee.property.name !== CONTEXT_CALLBACK_METHOD
      ) {
        return false;
      }

      // The callback receives a context already provisioned, so reaching it
      // through `withSecurityRulesDisabled` completes the same signature a
      // context factory completes on the return path — provided the walk got
      // here through the `firestore()` the context hands out.
      return tracesToRulesUnitTesting(
        call.callee.object,
        visited,
        stage === 'firestore' ? 'satisfied' : stage,
      );
    }

    function identifierTracesToRulesUnitTesting(
      node: TSESTree.Identifier,
      visited: Set<TSESTree.Node>,
      stage: ContextSignatureStage,
    ): boolean {
      const scope = ASTHelpers.getScope(context, node);
      const variable = ASTHelpers.findVariableInScope(scope, node.name);
      if (!variable || variable.defs.length !== 1) {
        return false;
      }

      const def = variable.defs[0];

      if (def.type === 'ImportBinding') {
        if (def.parent?.type !== AST_NODE_TYPES.ImportDeclaration) {
          return false;
        }

        const source = def.parent.source.value;
        if (source === RULES_UNIT_TESTING_MODULE) {
          return true;
        }

        // Provisioning the environment in a shared module of the project does
        // not change what it hands back: the same compat Firestore, whose
        // `.doc()` still takes zero type arguments. The module cannot be read
        // from here, so the chain has to carry the evidence itself — only a
        // receiver that came off a `RulesTestEnvironment` context crosses the
        // boundary, which leaves an ordinary imported handle reportable.
        return stage === 'satisfied' && isProjectModuleSpecifier(source);
      }

      if (def.type === 'Parameter') {
        return parameterTracesToRulesUnitTesting(
          def.name,
          def.node,
          visited,
          stage,
        );
      }

      // A hoisted declaration binds the helper the same way a `const` arrow
      // does; an ambient `declare function` has no body and falls through.
      if (def.type === 'FunctionName') {
        return tracesToRulesUnitTesting(def.node, visited, stage);
      }

      if (
        def.type !== 'Variable' ||
        def.node.type !== AST_NODE_TYPES.VariableDeclarator
      ) {
        return false;
      }

      const declarator = def.node;

      // An annotation constrains every assignment rather than just the
      // initializer, so unlike an initializer it survives a `let`. The
      // environment handle is created in `beforeAll` and so cannot be `const`;
      // `let testEnv: RulesTestEnvironment` is the documented spelling, and
      // TypeScript refuses to put another surface in it.
      if (
        declarator.id.type === AST_NODE_TYPES.Identifier &&
        declarator.id.typeAnnotation &&
        isRulesUnitTestingType(declarator.id.typeAnnotation.typeAnnotation)
      ) {
        return true;
      }

      // Without that guarantee only a `const` initializer is followed, mirroring
      // `isTypedCollectionBinding`: an unannotated reassignable binding can hold
      // an Admin SDK handle by the time it reaches `.doc()`.
      if (
        def.parent?.type !== AST_NODE_TYPES.VariableDeclaration ||
        def.parent.kind !== 'const'
      ) {
        return false;
      }

      return tracesToRulesUnitTesting(declarator.init, visited, stage);
    }

    return {
      TSTypeReference(node: TSESTree.TSTypeReference): void {
        const typeName = referenceTypeNameOf(node.typeName);
        if (typeName) {
          // Check if generic type argument is missing
          if (!node.typeParameters || node.typeParameters.params.length === 0) {
            context.report({
              node,
              messageId: 'missingGeneric',
              data: { type: typeName },
            });
            return;
          }

          // Check for invalid generic type arguments (any or {}) recursively
          const typeArg = node.typeParameters.params[0];
          if (hasInvalidType(typeArg)) {
            context.report({
              node,
              messageId: 'invalidGeneric',
              data: { type: typeName },
            });
          }
        }
      },
      CallExpression(node: TSESTree.CallExpression): void {
        // Only check method calls if there's no type annotation
        if (hasTypeAnnotation(node)) {
          return;
        }

        // Check for .doc() calls
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'doc'
        ) {
          if (tracesToRulesUnitTesting(node.callee.object)) {
            return;
          }

          const typeAnnotation = node.typeParameters;
          const isOnTypedCollection = isTypedCollectionReference(
            node.callee.object,
          );

          // If this is a .doc() call on a typed CollectionReference,
          // only check for invalid generics, not missing generics
          if (isOnTypedCollection) {
            if (typeAnnotation && hasInvalidType(typeAnnotation.params[0])) {
              context.report({
                node,
                messageId: 'invalidGeneric',
                data: { type: 'DocumentReference' },
              });
            }
            return; // Skip the missing generic check for typed CollectionReference.doc() calls
          }

          // For standalone doc() calls or calls on untyped collections
          if (!typeAnnotation) {
            context.report({
              node,
              messageId: 'missingGeneric',
              data: { type: 'DocumentReference' },
            });
          } else if (hasInvalidType(typeAnnotation.params[0])) {
            context.report({
              node,
              messageId: 'invalidGeneric',
              data: { type: 'DocumentReference' },
            });
          }
        }
        // Check for standalone doc() function calls
        else if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'doc'
        ) {
          const typeAnnotation = node.typeParameters;
          if (!typeAnnotation) {
            context.report({
              node,
              messageId: 'missingGeneric',
              data: { type: 'DocumentReference' },
            });
          } else if (hasInvalidType(typeAnnotation.params[0])) {
            context.report({
              node,
              messageId: 'invalidGeneric',
              data: { type: 'DocumentReference' },
            });
          }
        }
        // Check for .collection() calls
        else if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'collection' &&
          !isPartOfMethodChain(node)
        ) {
          if (tracesToRulesUnitTesting(node.callee.object)) {
            return;
          }

          const typeAnnotation = node.typeParameters;
          if (!typeAnnotation) {
            context.report({
              node,
              messageId: 'missingGeneric',
              data: { type: 'CollectionReference' },
            });
          } else if (hasInvalidType(typeAnnotation.params[0])) {
            context.report({
              node,
              messageId: 'invalidGeneric',
              data: { type: 'CollectionReference' },
            });
          }
        }
        // Check for .collectionGroup() calls
        else if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'collectionGroup'
        ) {
          if (tracesToRulesUnitTesting(node.callee.object)) {
            return;
          }

          const typeAnnotation = node.typeParameters;
          if (!typeAnnotation) {
            context.report({
              node,
              messageId: 'missingGeneric',
              data: { type: 'CollectionGroup' },
            });
          } else if (hasInvalidType(typeAnnotation.params[0])) {
            context.report({
              node,
              messageId: 'invalidGeneric',
              data: { type: 'CollectionGroup' },
            });
          }
        }
      },
    };
  },
});
