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

type MessageIds = 'missingGeneric' | 'invalidGeneric';

/** The Firestore reference types that carry a document-shape generic. */
const REFERENCE_TYPE_NAMES = new Set([
  'DocumentReference',
  'CollectionReference',
  'CollectionGroup',
]);

/**
 * The final segment of a type reference's name, so `FirebaseFirestore.
 * DocumentReference` is recognized as the same type as `DocumentReference`.
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
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return REFERENCE_TYPE_NAMES.has(typeName.name) ? typeName.name : undefined;
  }
  if (
    typeName.type === AST_NODE_TYPES.TSQualifiedName &&
    typeName.right.type === AST_NODE_TYPES.Identifier &&
    REFERENCE_TYPE_NAMES.has(typeName.right.name)
  ) {
    return typeName.right.name;
  }
  return undefined;
};

/** The declaration spellings a named document schema can be written in. */
type NamedTypeDeclaration =
  | TSESTree.TSInterfaceDeclaration
  | TSESTree.TSTypeAliasDeclaration;

/** Statement containers a type declaration can be a direct child of. */
function statementsOf(node: TSESTree.Node): TSESTree.Node[] | undefined {
  switch (node.type) {
    case AST_NODE_TYPES.Program:
    case AST_NODE_TYPES.BlockStatement:
    case AST_NODE_TYPES.TSModuleBlock:
    case AST_NODE_TYPES.StaticBlock:
      return (node as { body: TSESTree.Node[] }).body;
    case AST_NODE_TYPES.SwitchCase:
      return node.consequent;
    default:
      return undefined;
  }
}

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
  const declared =
    statement.type === AST_NODE_TYPES.ExportNamedDeclaration &&
    statement.declaration
      ? statement.declaration
      : statement;

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
  let current: TSESTree.Node | undefined = from;
  while (current) {
    const statements = statementsOf(current);
    if (statements) {
      for (const statement of statements) {
        const declaration = typeDeclarationNamed(statement, name);
        if (declaration) {
          return declaration;
        }
      }
    }
    current = current.parent as TSESTree.Node | undefined;
  }
  return undefined;
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

      let current: TSESTree.Node | undefined = node;
      while (current) {
        // Type assertions using 'as' keyword
        if (current.type === AST_NODE_TYPES.TSAsExpression) {
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
        // Return statements in functions with return type annotations
        if (current.type === AST_NODE_TYPES.ReturnStatement) {
          const func = current.parent?.parent;
          if (
            func?.type === AST_NODE_TYPES.FunctionDeclaration &&
            func.returnType
          ) {
            nodeCache.set(node, true);
            return true;
          }
        }
        // Assignment expressions to class properties
        if (current.type === AST_NODE_TYPES.AssignmentExpression) {
          const left = current.left;
          if (left.type === AST_NODE_TYPES.MemberExpression) {
            const obj = left.object;
            if (obj.type === AST_NODE_TYPES.ThisExpression) {
              const classNode = findParentClass(current);
              if (classNode) {
                const property = classNode.body.body.find(
                  (member): member is TSESTree.PropertyDefinition =>
                    member.type === AST_NODE_TYPES.PropertyDefinition &&
                    member.key.type === AST_NODE_TYPES.Identifier &&
                    member.key.name ===
                      (left.property as TSESTree.Identifier).name,
                );
                if (property?.typeAnnotation) {
                  nodeCache.set(node, true);
                  return true;
                }
              }
            }
          }
        }
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

    function isTypedCollectionReference(node: TSESTree.Node): boolean {
      if (!node) return false;
      if (isTypedCollectionReferenceCache.has(node)) {
        return isTypedCollectionReferenceCache.get(node)!;
      }

      let result = false;

      if (
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
        property.type === AST_NODE_TYPES.Identifier
      ) {
        const classNode = findParentClass(node);
        if (classNode) {
          const classProp = classNode.body.body.find(
            (member): member is TSESTree.PropertyDefinition =>
              member.type === AST_NODE_TYPES.PropertyDefinition &&
              member.key.type === AST_NODE_TYPES.Identifier &&
              member.key.name === property.name,
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
        property.type === AST_NODE_TYPES.Identifier
      ) {
        const classNode = findParentClass(node);
        if (classNode) {
          const getter = classNode.body.body.find(
            (member): member is TSESTree.MethodDefinition =>
              member.type === AST_NODE_TYPES.MethodDefinition &&
              member.kind === 'get' &&
              member.key.type === AST_NODE_TYPES.Identifier &&
              member.key.name === property.name,
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
      init: TSESTree.Expression | null | undefined,
    ): boolean {
      if (!init) {
        return false;
      }

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

        if (property.type === AST_NODE_TYPES.Identifier) {
          // Check if this is a getter or method that returns CollectionReference
          if (obj.type === AST_NODE_TYPES.ThisExpression) {
            const classNode = findParentClass(node);
            if (classNode) {
              const callee = findClassCallable(classNode, property.name);
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
      name: string,
    ):
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression
      | TSESTree.TSEmptyBodyFunctionExpression
      | undefined {
      for (const member of classNode.body.body) {
        if (
          member.type === AST_NODE_TYPES.MethodDefinition &&
          member.kind === 'method' &&
          member.key.type === AST_NODE_TYPES.Identifier &&
          member.key.name === name
        ) {
          return member.value;
        }

        if (
          member.type === AST_NODE_TYPES.PropertyDefinition &&
          member.key.type === AST_NODE_TYPES.Identifier &&
          member.key.name === name
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
      if (
        node.object.type === AST_NODE_TYPES.ThisExpression &&
        node.property.type === AST_NODE_TYPES.Identifier
      ) {
        const classNode = findParentClass(node);
        if (classNode) {
          const classProp = classNode.body.body.find(
            (member): member is TSESTree.PropertyDefinition =>
              member.type === AST_NODE_TYPES.PropertyDefinition &&
              member.key.type === AST_NODE_TYPES.Identifier &&
              'name' in node.property &&
              member.key.name === node.property.name,
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
      const isFunctionNode = (
        n: TSESTree.Node,
      ): n is
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression =>
        n.type === AST_NODE_TYPES.FunctionDeclaration ||
        n.type === AST_NODE_TYPES.FunctionExpression ||
        n.type === AST_NODE_TYPES.ArrowFunctionExpression;

      const findParamInFunction = (
        func:
          | TSESTree.FunctionDeclaration
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression,
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

      const functionScopes: Array<
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
      > = [];

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
     * Walks an expression toward its syntactic root and reports whether that
     * root is a value supplied by `@firebase/rules-unit-testing`.
     *
     * Only `const` bindings are followed, mirroring `isTypedCollectionBinding`:
     * a `let`/`var` receiver can be reassigned to an Admin SDK handle, where the
     * generic is both supportable and valuable, so exempting it would silently
     * drop enforcement.
     */
    function tracesToRulesUnitTesting(
      node: TSESTree.Node | null | undefined,
      visited: Set<TSESTree.Node> = new Set(),
    ): boolean {
      if (!node || getRulesUnitTestingLocals().size === 0) {
        return false;
      }
      // Guards against a self-referential declaration such as `const a = a.b;`.
      if (visited.has(node)) {
        return false;
      }
      visited.add(node);

      switch (node.type) {
        case AST_NODE_TYPES.AwaitExpression:
          return tracesToRulesUnitTesting(node.argument, visited);
        case AST_NODE_TYPES.CallExpression:
          return tracesToRulesUnitTesting(node.callee, visited);
        case AST_NODE_TYPES.MemberExpression:
          return tracesToRulesUnitTesting(node.object, visited);
        case AST_NODE_TYPES.ChainExpression:
          return tracesToRulesUnitTesting(node.expression, visited);
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.TSAsExpression:
        case AST_NODE_TYPES.TSSatisfiesExpression:
        case AST_NODE_TYPES.TSTypeAssertion:
          return tracesToRulesUnitTesting(node.expression, visited);
        case AST_NODE_TYPES.Identifier:
          return identifierTracesToRulesUnitTesting(node, visited);
        case AST_NODE_TYPES.ArrowFunctionExpression:
        case AST_NODE_TYPES.FunctionExpression:
        case AST_NODE_TYPES.FunctionDeclaration:
          return functionReturnTracesToRulesUnitTesting(node, visited);
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
    ): boolean {
      if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
        return tracesToRulesUnitTesting(node.body, visited);
      }

      return node.body.body.some(
        (statement) =>
          statement.type === AST_NODE_TYPES.ReturnStatement &&
          tracesToRulesUnitTesting(statement.argument, visited),
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

      return tracesToRulesUnitTesting(call.callee.object, visited);
    }

    function identifierTracesToRulesUnitTesting(
      node: TSESTree.Identifier,
      visited: Set<TSESTree.Node>,
    ): boolean {
      const scope = ASTHelpers.getScope(context, node);
      const variable = ASTHelpers.findVariableInScope(scope, node.name);
      if (!variable || variable.defs.length !== 1) {
        return false;
      }

      const def = variable.defs[0];

      if (def.type === 'ImportBinding') {
        return (
          def.parent?.type === AST_NODE_TYPES.ImportDeclaration &&
          def.parent.source.value === RULES_UNIT_TESTING_MODULE
        );
      }

      if (def.type === 'Parameter') {
        return parameterTracesToRulesUnitTesting(def.name, def.node, visited);
      }

      // A hoisted declaration binds the helper the same way a `const` arrow
      // does; an ambient `declare function` has no body and falls through.
      if (def.type === 'FunctionName') {
        return tracesToRulesUnitTesting(def.node, visited);
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

      return tracesToRulesUnitTesting(declarator.init, visited);
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
