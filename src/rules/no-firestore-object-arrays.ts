import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noObjectArrays';

type ParenthesizedTypeNode = {
  type: 'TSParenthesizedType';
  typeAnnotation: TSESTree.TypeNode;
  parent?: TSESTree.Node;
};

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

const UNKNOWN_FIELD_LABEL = '<unknown field>';

const isInFirestoreTypesDirectory = (filename: string): boolean => {
  if (!filename || filename === '<input>') return false;
  const normalized = filename.replace(/\\/g, '/');
  if (normalized.includes('/node_modules/') || normalized.includes('/dist/')) {
    return false;
  }
  // Match typical mono/multi-repo layouts
  return normalized.includes('/types/firestore/');
};

const getRightmostIdentifierName = (
  name: TSESTree.TSQualifiedName | TSESTree.Identifier,
): string => {
  let cur: TSESTree.TSQualifiedName | TSESTree.Identifier = name;
  // Walk rightwards until we reach an Identifier
  while (cur.type !== AST_NODE_TYPES.Identifier) {
    cur = cur.right;
  }
  return cur.name;
};

const isArrayGenericReference = (node: TSESTree.TSTypeReference): boolean => {
  return (
    node.typeName.type === AST_NODE_TYPES.Identifier &&
    (node.typeName.name === 'Array' || node.typeName.name === 'ReadonlyArray')
  );
};

const isParenthesizedType = (node: unknown): node is ParenthesizedTypeNode => {
  if (!node || typeof node !== 'object') return false;
  const candidate = node as {
    type?: unknown;
    typeAnnotation?: unknown;
  };
  return (
    candidate.type === 'TSParenthesizedType' &&
    candidate.typeAnnotation !== undefined
  );
};

const unwrapArrayElementType = (
  node: TSESTree.TypeNode | ParenthesizedTypeNode,
): TSESTree.TypeNode => {
  let current: TSESTree.TypeNode | ParenthesizedTypeNode = node;
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
      const paren = current as ParenthesizedTypeNode;
      current = paren.typeAnnotation;
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
  return current as TSESTree.TypeNode;
};

/**
 * Derives a field label for diagnostics by walking ancestors.
 * Prefers TSPropertySignature keys and returns identifier or string/number/bigint literal keys when present.
 * Falls back to the surrounding TSTypeAliasDeclaration or TSInterfaceDeclaration name when no property key is available so declaration-level array aliases (for example, `type Foo = Object[]`) still surface a meaningful label and avoid unlabeled diagnostics.
 * Returns a placeholder when resolution fails so downstream messaging remains readable.
 */
const getFieldName = (node: TSESTree.Node): string => {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (current.type === AST_NODE_TYPES.TSPropertySignature) {
      const key = current.key;
      if (key.type === AST_NODE_TYPES.Identifier) return key.name;
      if (
        key.type === AST_NODE_TYPES.Literal &&
        (typeof key.value === 'string' ||
          typeof key.value === 'number' ||
          typeof key.value === 'bigint')
      ) {
        return String(key.value);
      }
      const computedKey = key as { type?: string; expression?: TSESTree.Node };
      if (
        computedKey.type === 'TSComputedPropertyName' &&
        computedKey.expression
      ) {
        const expr = computedKey.expression;
        if (expr.type === AST_NODE_TYPES.Identifier) return expr.name;
        if (
          expr.type === AST_NODE_TYPES.Literal &&
          (typeof (expr as TSESTree.Literal).value === 'string' ||
            typeof (expr as TSESTree.Literal).value === 'number' ||
            typeof (expr as TSESTree.Literal).value === 'bigint')
        ) {
          return String((expr as TSESTree.Literal).value);
        }
      }
    }
    if (
      current.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
      current.type === AST_NODE_TYPES.TSInterfaceDeclaration
    ) {
      const id = current.id;
      if (id.type === AST_NODE_TYPES.Identifier) {
        return id.name;
      }
    }
    current = (current as { parent?: TSESTree.Node }).parent as
      | TSESTree.Node
      | undefined;
  }
  return UNKNOWN_FIELD_LABEL;
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
      noObjectArrays: [
        // What's wrong
        "What's wrong: {{fieldName}} stores an array of objects in a Firestore document.",
        // Why it matters
        'Why it matters: Firestore cannot query inside object arrays, and updating one item rewrites the whole array; concurrent writes can overwrite each other and lose data.',
        // How to fix
        'How to fix: Store items as Record<string, T> keyed by id (with an index field for ordering; convert with toMap/toArr), or move items into a subcollection or store only an array of IDs.',
      ].join('\n'),
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
        case AST_NODE_TYPES.ExportDefaultDeclaration: {
          if (n.declaration) {
            visitNode(n.declaration as unknown as TSESTree.Node);
          }
          break;
        }
        case AST_NODE_TYPES.TSExportAssignment: {
          if (n.expression) {
            visitNode(n.expression as unknown as TSESTree.Node);
          }
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
    const visitingAliases = new Set<string>();

    const isPrimitiveLikeAlias = (
      name: string,
      recursionDepth: number,
    ): boolean => {
      if (seenAlias.has(name)) return true;
      if (recursionDepth > 50) return false;
      if (PRIMITIVE_TYPES.has(name)) return true;
      if (enumNames.has(name)) return true; // enums are non-object primitives for our purposes
      const aliased = aliasNameToType.get(name);
      if (!aliased) return false;
      if (visitingAliases.has(name)) {
        return false;
      }
      visitingAliases.add(name);
      seenAlias.add(name);
      // Determine if the alias ultimately resolves to only primitive-like/literal types
      const node = aliased as TSESTree.TypeNode;
      const result = isPrimitiveLikeTypeNode(node, recursionDepth + 1);
      visitingAliases.delete(name);
      if (result) {
        seenAlias.add(name);
      } else {
        // Remove optimistic marking when resolution fails
        seenAlias.delete(name);
      }
      return result;
    };

    const isPrimitiveLikeTypeNode = (
      node: TSESTree.TypeNode | ParenthesizedTypeNode,
      recursionDepth = 0,
    ): boolean => {
      if (recursionDepth > 25) {
        return false;
      }
      if (isParenthesizedType(node)) {
        const paren = node as ParenthesizedTypeNode;
        return isPrimitiveLikeTypeNode(
          paren.typeAnnotation,
          recursionDepth + 1,
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
            return isPrimitiveLikeAlias(name, recursionDepth + 1);
          }
          if (ref.typeName.type === AST_NODE_TYPES.TSQualifiedName) {
            const name = getRightmostIdentifierName(ref.typeName);
            if (PRIMITIVE_TYPES.has(name) || enumNames.has(name)) return true;
            if (seenAlias.has(name)) return true;
            return isPrimitiveLikeAlias(name, recursionDepth + 1);
          }
          return false;
        }
        case AST_NODE_TYPES.TSUnionType: {
          return (node.types as TSESTree.TypeNode[]).every((t) =>
            isPrimitiveLikeTypeNode(t, recursionDepth + 1),
          );
        }
        case AST_NODE_TYPES.TSTypeOperator: {
          // Treat keyof/unique symbol/etc as primitive-like to avoid false positives
          if ((node as TSESTree.TSTypeOperator).operator !== 'readonly')
            return true;
          return isPrimitiveLikeTypeNode(
            (node as TSESTree.TSTypeOperator)
              .typeAnnotation as TSESTree.TypeNode,
            recursionDepth + 1,
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

    const isObjectType = (
      node: TSESTree.TypeNode | ParenthesizedTypeNode,
    ): boolean => {
      if (isParenthesizedType(node)) {
        const paren = node as ParenthesizedTypeNode;
        return isObjectType(paren.typeAnnotation);
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
            return !isPrimitiveLikeAlias(refName, 0);
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
      let currentParent: TSESTree.Node | ParenthesizedTypeNode | undefined =
        parent;
      while (currentParent) {
        if (
          currentParent.type === AST_NODE_TYPES.TSTypeOperator &&
          (currentParent as TSESTree.TSTypeOperator).operator === 'readonly'
        ) {
          currentParent = (currentParent as TSESTree.TSTypeOperator)
            .parent as TSESTree.Node | undefined;
          continue;
        }
        if (isParenthesizedType(currentParent)) {
          const paren = currentParent as ParenthesizedTypeNode;
          currentParent = paren.parent as TSESTree.Node | undefined;
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
            data: {
              fieldName: getFieldName(node),
            },
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
            data: {
              fieldName: getFieldName(node),
            },
            });
          }
        }
      },
    };
  },
});
