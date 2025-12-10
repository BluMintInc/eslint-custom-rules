import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noObjectArrays';

type ParenthesizedTypeNode = TSESTree.TypeNode & {
  typeAnnotation: TSESTree.TypeNode;
};

const PAREN_TYPE =
  (AST_NODE_TYPES as any).TSParenthesizedType ?? 'TSParenthesizedType';

const PRIMITIVE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'Date',
  'Timestamp',
  'null',
  'undefined',
  'GeoPoint',
]);

const isInFirestoreTypesDirectory = (filename: string): boolean => {
  const normalized = filename.replace(/\\/g, '/');
  // Match typical monorepo layouts
  return normalized.includes('/types/firestore');
};

const getRightmostIdentifierName = (
  name: TSESTree.TSQualifiedName | TSESTree.Identifier,
): string => {
  if (name.type === AST_NODE_TYPES.Identifier) {
    return name.name;
  }
  return getRightmostIdentifierName(name.right);
};

const isArrayGenericReference = (node: TSESTree.TSTypeReference): boolean => {
  return (
    node.typeName.type === AST_NODE_TYPES.Identifier &&
    (node.typeName.name === 'Array' || node.typeName.name === 'ReadonlyArray')
  );
};

const isParenthesizedType = (
  node: TSESTree.TypeNode,
): node is ParenthesizedTypeNode => {
  // Use enum if available; fall back to string check for compatibility
  return (node as { type?: string }).type === PAREN_TYPE;
};

const unwrapArrayElementType = (node: TSESTree.TypeNode): TSESTree.TypeNode => {
  let current: TSESTree.TypeNode = node;
  // Fixpoint loop: peel wrappers in any order until none remain
  // Cap unwrap iterations to prevent accidental non-terminating edits if new cases are added.
  // Wrappers are finite; 10 is generous but safe.
  for (let i = 0; i < 10; i++) {
    if (
      current.type === AST_NODE_TYPES.TSTypeOperator &&
      (current as TSESTree.TSTypeOperator).operator === 'readonly'
    ) {
      current = (current as TSESTree.TSTypeOperator)
        .typeAnnotation as TSESTree.TypeNode;
      continue;
    }
    if (isParenthesizedType(current)) {
      current = (current as ParenthesizedTypeNode).typeAnnotation;
      continue;
    }
    if (current.type === AST_NODE_TYPES.TSArrayType) {
      current = (current as TSESTree.TSArrayType).elementType;
      continue;
    }
    if (
      current.type === AST_NODE_TYPES.TSTypeReference &&
      isArrayGenericReference(current as TSESTree.TSTypeReference) &&
      (current as TSESTree.TSTypeReference).typeParameters &&
      (current as TSESTree.TSTypeReference).typeParameters!.params.length > 0
    ) {
      current = (current as TSESTree.TSTypeReference).typeParameters!.params[0];
      continue;
    }
    break;
  }
  return current;
};

// Determine whether this type node appears in a Firestore model type context
// i.e., within an interface or type alias declaration, and not within variable/function annotations
const isInModelTypeContext = (node: TSESTree.Node): boolean => {
  let current: TSESTree.Node | undefined = (node as TSESTree.Node).parent as
    | TSESTree.Node
    | undefined;
  while (current) {
    // Hard stop for non-type declaration contexts
    if (
      current.type === AST_NODE_TYPES.VariableDeclarator ||
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      current.type === AST_NODE_TYPES.MethodDefinition ||
      current.type === AST_NODE_TYPES.TSMethodSignature ||
      current.type === AST_NODE_TYPES.ClassDeclaration ||
      current.type === AST_NODE_TYPES.PropertyDefinition ||
      current.type === AST_NODE_TYPES.TSParameterProperty
    ) {
      return false;
    }
    if (
      current.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
      current.type === AST_NODE_TYPES.TSInterfaceDeclaration
    ) {
      return true;
    }
    current = (current as unknown as { parent?: TSESTree.Node }).parent as
      | TSESTree.Node
      | undefined;
  }
  return false;
};

export const noFirestoreObjectArrays = createRule<[], MessageIds>({
  name: 'no-firestore-object-arrays',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow arrays of object types in Firestore models. Prefer Record maps keyed by id with an index field, or subcollections/arrays of IDs.',
      recommended: 'warn',
      requiresTypeChecking: false,
    },
    schema: [],
    messages: {
      noObjectArrays: `Arrays of objects are problematic in Firestore:
- Not queryable
- Destructive updates
- Concurrency risks

Prefer:
- Record<string, T> keyed by id with an index field for order (use toMap/toArr)
- Subcollections
- Arrays of IDs where appropriate`,
    },
  },
  defaultOptions: [],
  create(context) {
    if (!isInFirestoreTypesDirectory(context.getFilename())) {
      return {};
    }

    const sourceCode = context.getSourceCode();

    // Collect alias/interface/enum information within this file to refine object vs primitive classification
    const aliasNameToType = new Map<string, TSESTree.TypeNode>();
    const interfaceNames = new Set<string>();
    const enumNames = new Set<string>();

    const visitNode = (n: TSESTree.Node): void => {
      switch (n.type) {
        case AST_NODE_TYPES.TSTypeAliasDeclaration: {
          aliasNameToType.set(n.id.name, n.typeAnnotation);
          break;
        }
        case AST_NODE_TYPES.TSInterfaceDeclaration: {
          interfaceNames.add(n.id.name);
          break;
        }
        case AST_NODE_TYPES.TSEnumDeclaration: {
          enumNames.add(n.id.name);
          break;
        }
        case AST_NODE_TYPES.ExportNamedDeclaration: {
          if (n.declaration)
            visitNode(n.declaration as unknown as TSESTree.Node);
          break;
        }
        case AST_NODE_TYPES.TSModuleDeclaration: {
          const body = (n.body as any) || null;
          if (body && body.type === AST_NODE_TYPES.TSModuleBlock) {
            for (const stmt of body.body as TSESTree.Node[]) {
              visitNode(stmt);
            }
          } else if (body && body.type === AST_NODE_TYPES.TSModuleDeclaration) {
            visitNode(body as unknown as TSESTree.Node);
          }
          break;
        }
        default: {
          // Only traverse a shallow subset we care about
          break;
        }
      }
    };

    for (const stmt of sourceCode.ast.body as unknown as TSESTree.Node[]) {
      visitNode(stmt);
    }

    const seenAlias = new Set<string>();

    const isPrimitiveLikeAlias = (name: string, depth = 0): boolean => {
      if (depth > 5) return false; // guard against cycles
      if (PRIMITIVE_TYPES.has(name)) return true;
      if (enumNames.has(name)) return true; // enums are non-object primitives for our purposes
      const aliased = aliasNameToType.get(name);
      if (!aliased) return false;
      // Determine if the alias ultimately resolves to only primitive-like/literal types
      const node = aliased as TSESTree.TypeNode;
      const result = isPrimitiveLikeTypeNode(node, depth + 1);
      if (result) seenAlias.add(name);
      return result;
    };

    const isPrimitiveLikeTypeNode = (
      node: TSESTree.TypeNode,
      depth = 0,
    ): boolean => {
      if (isParenthesizedType(node)) {
        return isPrimitiveLikeTypeNode(
          (node as ParenthesizedTypeNode).typeAnnotation,
          depth + 1,
        );
      }
      switch (node.type) {
        case AST_NODE_TYPES.TSStringKeyword:
        case AST_NODE_TYPES.TSNumberKeyword:
        case AST_NODE_TYPES.TSBooleanKeyword:
        case AST_NODE_TYPES.TSNullKeyword:
        case AST_NODE_TYPES.TSUndefinedKeyword:
        case AST_NODE_TYPES.TSNeverKeyword:
          return true;
        case AST_NODE_TYPES.TSAnyKeyword:
        case AST_NODE_TYPES.TSUnknownKeyword:
          return false;
        case AST_NODE_TYPES.TSLiteralType:
          return true; // string/number/boolean literals
        case AST_NODE_TYPES.TSTypeReference: {
          // Allow known primitive-like references and enums or primitive-like aliases
          const ref = node as TSESTree.TSTypeReference;
          if (ref.typeName.type === AST_NODE_TYPES.Identifier) {
            const name = ref.typeName.name;
            if (PRIMITIVE_TYPES.has(name) || enumNames.has(name)) return true;
            if (seenAlias.has(name)) return true;
            return isPrimitiveLikeAlias(name, depth + 1);
          }
          if (ref.typeName.type === AST_NODE_TYPES.TSQualifiedName) {
            const name = getRightmostIdentifierName(ref.typeName);
            if (PRIMITIVE_TYPES.has(name) || enumNames.has(name)) return true;
            if (seenAlias.has(name)) return true;
            return isPrimitiveLikeAlias(name, depth + 1);
          }
          return false;
        }
        case AST_NODE_TYPES.TSUnionType: {
          return (node.types as TSESTree.TypeNode[]).every((t) =>
            isPrimitiveLikeTypeNode(t, depth + 1),
          );
        }
        case AST_NODE_TYPES.TSTypeOperator: {
          // Treat keyof/unique symbol/etc as primitive-like to avoid false positives
          if ((node as TSESTree.TSTypeOperator).operator !== 'readonly')
            return true;
          return isPrimitiveLikeTypeNode(
            (node as TSESTree.TSTypeOperator)
              .typeAnnotation as TSESTree.TypeNode,
            depth + 1,
          );
        }
        case (AST_NODE_TYPES as any).TSTemplateLiteralType as any: {
          // Template literal types behave like strings
          return true;
        }
        default:
          return false;
      }
    };

    const isObjectType = (node: TSESTree.TypeNode): boolean => {
      if (isParenthesizedType(node)) {
        return isObjectType(
          (node as ParenthesizedTypeNode).typeAnnotation,
        );
      }
      switch (node.type) {
        case AST_NODE_TYPES.TSTypeLiteral:
          return true;
        case AST_NODE_TYPES.TSTypeReference: {
          const tn = node.typeName as
            | TSESTree.Identifier
            | TSESTree.TSQualifiedName
            | TSESTree.ThisExpression;
          if (
            tn.type !== AST_NODE_TYPES.Identifier &&
            tn.type !== AST_NODE_TYPES.TSQualifiedName
          ) {
            // Unsupported reference (e.g., ThisType) — do not assume object to avoid false positives
            return false;
          }
          const refName =
            tn.type === AST_NODE_TYPES.Identifier
              ? tn.name
              : getRightmostIdentifierName(tn);

          if (PRIMITIVE_TYPES.has(refName)) return false;
          if (interfaceNames.has(refName)) return true;
          if (enumNames.has(refName)) return false;
          if (aliasNameToType.has(refName)) {
            return !isPrimitiveLikeAlias(refName);
          }
          // Unknown reference: do not assume object to avoid false positives
          return false;
        }
        case AST_NODE_TYPES.TSIntersectionType:
        case AST_NODE_TYPES.TSUnionType:
          return node.types.some(isObjectType);
        case AST_NODE_TYPES.TSMappedType:
          return true;
        case AST_NODE_TYPES.TSIndexedAccessType:
          // Treat indexed access as object-like to align with existing tests
          return true;
        case AST_NODE_TYPES.TSTypeOperator:
          if ((node as TSESTree.TSTypeOperator).operator === 'readonly') {
            return isObjectType(
              (node as TSESTree.TSTypeOperator)
                .typeAnnotation as TSESTree.TypeNode,
            );
          }
          return false;
        case AST_NODE_TYPES.TSAnyKeyword:
        case AST_NODE_TYPES.TSUnknownKeyword:
          return true;
        default:
          return false;
      }
    };

    const skipReadonlyAndParens = (
      parent: TSESTree.Node | undefined,
    ): TSESTree.Node | undefined => {
      let currentParent = parent;
      while (currentParent) {
        if (
          currentParent.type === AST_NODE_TYPES.TSTypeOperator &&
          (currentParent as TSESTree.TSTypeOperator).operator === 'readonly'
        ) {
          currentParent = (currentParent as TSESTree.TSTypeOperator)
            .parent as TSESTree.Node | undefined;
          continue;
        }
        if (isParenthesizedType(currentParent as TSESTree.TypeNode)) {
          currentParent = (currentParent as ParenthesizedTypeNode)
            .parent as TSESTree.Node | undefined;
          continue;
        }
        break;
      }
      return currentParent;
    };

    const isImmediatelyWrappedByArraySyntax = (
      node: TSESTree.Node,
    ): boolean => {
      const parent = skipReadonlyAndParens(
        (node as TSESTree.Node).parent as TSESTree.Node | undefined,
      );
      if (!parent) return false;
      if (parent.type === AST_NODE_TYPES.TSArrayType) return true;
      if (
        parent.type === AST_NODE_TYPES.TSTypeReference &&
        isArrayGenericReference(parent as TSESTree.TSTypeReference)
      )
        return true;
      return false;
    };

    return {
      TSArrayType(node) {
        // Only consider arrays within model type/interface declarations
        if (!isInModelTypeContext(node)) {
          return;
        }
        if (isImmediatelyWrappedByArraySyntax(node)) {
          return;
        }
        const base = unwrapArrayElementType(node.elementType);
        if (isObjectType(base)) {
          context.report({
            node,
            messageId: 'noObjectArrays',
          });
        }
      },
      TSTypeReference(node) {
        if (
          node.typeName.type === AST_NODE_TYPES.Identifier &&
          (node.typeName.name === 'Array' ||
            node.typeName.name === 'ReadonlyArray') &&
          node.typeParameters
        ) {
          // Only consider arrays within model type/interface declarations
          if (!isInModelTypeContext(node)) {
            return;
          }
          if (isImmediatelyWrappedByArraySyntax(node)) {
            return;
          }
          const elementType = node.typeParameters.params[0] ?? null;
          if (!elementType) return;
          const base = unwrapArrayElementType(elementType);
          if (isObjectType(base)) {
            context.report({
              node,
              messageId: 'noObjectArrays',
            });
          }
        }
      },
    };
  },
});
