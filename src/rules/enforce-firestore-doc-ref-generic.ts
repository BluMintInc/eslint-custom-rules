/**
 * @fileoverview Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup
 * @author BluMint
 */

/**
 * @type {import('eslint').Rule.RuleModule}
 */

import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'missingGeneric' | 'invalidGeneric';

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
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      missingGeneric:
        '{{ type }} must specify a generic type argument for type safety. Instead of `const docRef = doc(collection)`, use `const docRef = doc<YourType>(collection)`.',
      invalidGeneric:
        '{{ type }} must not use "any" or "{}" as generic type argument. Define a proper interface/type for your document: `interface UserDoc { name: string; age: number; }` and use it: `const docRef = doc<UserDoc>(collection)`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeCache = new Map<string, boolean>();
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
          return node.members.some((member) => {
            if (
              member.type === AST_NODE_TYPES.TSPropertySignature &&
              member.typeAnnotation
            ) {
              return hasInvalidType(member.typeAnnotation.typeAnnotation);
            }
            return false;
          });
        case AST_NODE_TYPES.TSTypeReference:
          if (node.typeParameters) {
            return node.typeParameters.params.some(hasInvalidType);
          }
          if (node.typeName.type === AST_NODE_TYPES.Identifier) {
            const typeName = node.typeName.name;
            if (typeCache.has(typeName)) {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              return typeCache.get(typeName)!;
            }
            // Prevent infinite recursion
            typeCache.set(typeName, false);
            const program = context.getSourceCode().ast;
            const interfaceDecl = program.body.find(
              (n): n is TSESTree.TSInterfaceDeclaration =>
                n.type === AST_NODE_TYPES.TSInterfaceDeclaration &&
                n.id.name === typeName,
            );
            if (interfaceDecl) {
              const result = interfaceDecl.body.body.some((member) => {
                if (
                  member.type === AST_NODE_TYPES.TSPropertySignature &&
                  member.typeAnnotation
                ) {
                  return hasInvalidType(member.typeAnnotation.typeAnnotation);
                }
                return false;
              });
              typeCache.set(typeName, result);
              return result;
            }
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

    function isTypedCollectionReference(node: TSESTree.Node): boolean {
      // Check if the node is a call to .collection() with generics
      if (
        node.type === AST_NODE_TYPES.CallExpression &&
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'collection' &&
        node.typeParameters &&
        node.typeParameters.params.length > 0
      ) {
        return true;
      }

      // Check if the node is a member expression (like this.collectionRef)
      if (node.type === AST_NODE_TYPES.MemberExpression) {
        const obj = node.object;
        const property = node.property;

        if (obj.type === AST_NODE_TYPES.ThisExpression && property.type === AST_NODE_TYPES.Identifier) {
          // Look for class property with CollectionReference type
          const classNode = findParentClass(node);
          if (classNode) {
            const classProp = classNode.body.body.find(
              (member): member is TSESTree.PropertyDefinition =>
                member.type === AST_NODE_TYPES.PropertyDefinition &&
                member.key.type === AST_NODE_TYPES.Identifier &&
                member.key.name === property.name,
            );
            if (classProp?.typeAnnotation) {
              return hasCollectionReferenceType(classProp.typeAnnotation.typeAnnotation);
            }
          }
        }
      }

      // Check if the node is an identifier that refers to a typed variable
      if (node.type === AST_NODE_TYPES.Identifier) {
        // Look for variable declaration with CollectionReference type
        let current: TSESTree.Node | undefined = node;
        while (current) {
          if (current.type === AST_NODE_TYPES.Program) {
            // Search in program body for variable declarations
            const varDecl = current.body.find((stmt): stmt is TSESTree.VariableDeclaration =>
              stmt.type === AST_NODE_TYPES.VariableDeclaration &&
              stmt.declarations.some(
                (decl): decl is TSESTree.VariableDeclarator =>
                  decl.type === AST_NODE_TYPES.VariableDeclarator &&
                  decl.id.type === AST_NODE_TYPES.Identifier &&
                  decl.id.name === node.name &&
                  decl.id.typeAnnotation !== undefined
              )
            );
            if (varDecl) {
              const declarator = varDecl.declarations.find(
                (decl): decl is TSESTree.VariableDeclarator =>
                  decl.type === AST_NODE_TYPES.VariableDeclarator &&
                  decl.id.type === AST_NODE_TYPES.Identifier &&
                  decl.id.name === node.name &&
                  decl.id.typeAnnotation !== undefined
              );
              if (declarator?.id.typeAnnotation) {
                return hasCollectionReferenceType(declarator.id.typeAnnotation.typeAnnotation);
              }
            }
            break;
          }
          current = current.parent as TSESTree.Node;
        }
      }

      return false;
    }

    function hasCollectionReferenceType(typeNode: TSESTree.TypeNode): boolean {
      if (
        typeNode.type === AST_NODE_TYPES.TSTypeReference &&
        typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
        typeNode.typeName.name === 'CollectionReference' &&
        typeNode.typeParameters &&
        typeNode.typeParameters.params.length > 0
      ) {
        return true;
      }
      return false;
    }

    return {
      TSTypeReference(node: TSESTree.TSTypeReference): void {
        if (
          node.typeName.type === AST_NODE_TYPES.Identifier &&
          (node.typeName.name === 'DocumentReference' ||
            node.typeName.name === 'CollectionReference' ||
            node.typeName.name === 'CollectionGroup')
        ) {
          const typeName = node.typeName.name;
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
          const typeAnnotation = node.typeParameters;
          const isOnTypedCollection = isTypedCollectionReference(node.callee.object);

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
        // Check for .collection() calls
        else if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'collection' &&
          !isPartOfMethodChain(node)
        ) {
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
