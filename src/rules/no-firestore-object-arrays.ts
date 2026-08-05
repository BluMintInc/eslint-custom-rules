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

/** Statements a declaration can be a direct child of, innermost outward. */
const statementsOf = (node: TSESTree.Node): TSESTree.Node[] | undefined => {
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
};

/**
 * The declaration a statement carries, looking through `export`.
 *
 * `export type Comment = ...` is the same declaration one AST node deeper,
 * inside an `ExportNamedDeclaration`. Reading the statement without unwrapping
 * would let the `export` keyword alone decide whether an element type is
 * resolvable, which says nothing about the shape it denotes.
 */
const declarationOf = (statement: TSESTree.Node): TSESTree.Node => {
  if (
    (statement.type === AST_NODE_TYPES.ExportNamedDeclaration ||
      statement.type === AST_NODE_TYPES.ExportDefaultDeclaration) &&
    statement.declaration
  ) {
    return statement.declaration as TSESTree.Node;
  }
  return statement;
};

type ResolvedTypeName =
  | { kind: 'interface' }
  | { kind: 'enum' }
  | { kind: 'alias'; typeAnnotation: TSESTree.TypeNode };

/**
 * Interface beats enum beats alias, matching the order the file-wide tables are
 * consulted in. The orderings can only differ for a name declared twice in one
 * scope — which TypeScript rejects — but keeping them identical means the
 * lexical search can never disagree with the fallback it precedes.
 */
const typeDeclarationIn = (
  statements: TSESTree.Node[],
  name: string,
): ResolvedTypeName | undefined => {
  let interfaceMatch: ResolvedTypeName | undefined;
  let enumMatch: ResolvedTypeName | undefined;
  let aliasMatch: ResolvedTypeName | undefined;
  for (const statement of statements) {
    const declaration = declarationOf(statement);
    switch (declaration.type) {
      case AST_NODE_TYPES.TSInterfaceDeclaration:
        if (declaration.id.name === name)
          interfaceMatch = { kind: 'interface' };
        break;
      case AST_NODE_TYPES.TSEnumDeclaration:
        if (declaration.id.name === name) enumMatch = { kind: 'enum' };
        break;
      case AST_NODE_TYPES.TSTypeAliasDeclaration:
        if (declaration.id.name === name) {
          aliasMatch = {
            kind: 'alias',
            typeAnnotation: declaration.typeAnnotation,
          };
        }
        break;
      default:
        break;
    }
  }
  return interfaceMatch ?? enumMatch ?? aliasMatch;
};

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

const unwrapParenthesizedTypeNode = (
  node: TSESTree.TypeNode | ParenthesizedTypeNode,
): TSESTree.TypeNode => {
  let current: TSESTree.TypeNode | ParenthesizedTypeNode = node;
  // Cap iterations for the same reason as unwrapArrayElementType: wrappers are
  // finite, but a future wrapper case must not be able to loop forever.
  for (let i = 0; i < 10; i++) {
    if (isParenthesizedType(current)) {
      current = (current as ParenthesizedTypeNode).typeAnnotation;
      continue;
    }
    break;
  }
  return current as TSESTree.TypeNode;
};

// Assertion wrappers never change the runtime value, so `[...] as const` and
// `[...] as const satisfies readonly string[]` both still describe an array.
const EXPRESSION_ASSERTION_TYPES = new Set<string>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  'TSSatisfiesExpression',
]);

const unwrapExpressionAssertions = (
  node: TSESTree.Expression,
): TSESTree.Expression => {
  let current: TSESTree.Expression = node;
  for (let i = 0; i < 10; i++) {
    if (EXPRESSION_ASSERTION_TYPES.has(current.type)) {
      const inner = (current as unknown as { expression?: TSESTree.Expression })
        .expression;
      if (!inner) break;
      current = inner;
      continue;
    }
    break;
  }
  return current;
};

/**
 * A same-named `const` binding shadows any outer one whether or not it holds an
 * array literal, so the lexical search must stop at it rather than reaching past
 * it to a binding the reference cannot denote.
 */
const CONST_ARRAY_SHADOWED = 'shadowed' as const;

const constArrayIn = (
  statements: TSESTree.Node[],
  name: string,
): TSESTree.ArrayExpression | typeof CONST_ARRAY_SHADOWED | undefined => {
  for (const statement of statements) {
    const declaration = declarationOf(statement);
    if (
      declaration.type !== AST_NODE_TYPES.VariableDeclaration ||
      declaration.kind !== 'const'
    ) {
      continue;
    }
    for (const declarator of declaration.declarations) {
      if (
        declarator.id.type !== AST_NODE_TYPES.Identifier ||
        declarator.id.name !== name
      ) {
        continue;
      }
      if (!declarator.init) return CONST_ARRAY_SHADOWED;
      const init = unwrapExpressionAssertions(declarator.init);
      return init.type === AST_NODE_TYPES.ArrayExpression
        ? init
        : CONST_ARRAY_SHADOWED;
    }
  }
  return undefined;
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

const literalToString = (
  node: TSESTree.Node | null | undefined,
): string | null => {
  if (!node || node.type !== AST_NODE_TYPES.Literal) return null;
  const value = (node as TSESTree.Literal).value;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return null;
};

/**
 * Derives a field label for diagnostics by walking ancestors.
 * Prefers TSPropertySignature keys and returns identifier or string/number/bigint literal keys when present.
 * Falls back to the surrounding TSTypeAliasDeclaration or TSInterfaceDeclaration name when no property key is available.
 * This ensures declaration-level array aliases (for example, `type Foo = Object[]`) surface a meaningful label and avoid unlabeled diagnostics.
 * Returns a placeholder when resolution fails so downstream messaging remains readable.
 */
const getFieldName = (node: TSESTree.Node): string => {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (current.type === AST_NODE_TYPES.TSPropertySignature) {
      const key = current.key;
      if (key.type === AST_NODE_TYPES.Identifier) return key.name;
      const literalKey = literalToString(key);
      if (literalKey !== null) return literalKey;
      const computedKey = key as { type?: string; expression?: TSESTree.Node };
      if (
        computedKey.type === 'TSComputedPropertyName' &&
        computedKey.expression
      ) {
        const expr = computedKey.expression;
        if (expr.type === AST_NODE_TYPES.Identifier) return expr.name;
        const literalExpr = literalToString(expr);
        if (literalExpr !== null) return literalExpr;
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
      recommended: 'error',
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
        'How to fix: Store items as Record<string, T> keyed by id with an index field for ordering (use toMap/toArr helpers), or move items into a subcollection or store only an array of IDs.',
      ].join('\n'),
    },
  },
  defaultOptions: [],
  create(context) {
    if (!isInFirestoreTypesDirectory(context.getFilename())) {
      return {};
    }

    const sourceCode = context.sourceCode;

    // Namespace members are reachable unqualified from this table, which is what
    // lets a `NS.User[]` reference — whose rightmost name no lexical scope binds —
    // still classify. It backs the lexical search below rather than replacing it:
    // a flat, file-wide table cannot express shadowing, and widening it to every
    // nested container would make a declaration inside one function resolve a
    // reference inside another, which TypeScript never does.
    const aliasNameToType = new Map<string, TSESTree.TypeNode>();
    const interfaceNames = new Set<string>();
    const enumNames = new Set<string>();
    const constArrayNameToLiteral = new Map<string, TSESTree.ArrayExpression>();

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
        case AST_NODE_TYPES.VariableDeclaration: {
          // Only `const` bindings can back a `(typeof X)[number]` element union
          if (n.kind !== 'const') break;
          for (const declarator of n.declarations) {
            if (
              declarator.id.type !== AST_NODE_TYPES.Identifier ||
              !declarator.init
            ) {
              continue;
            }
            const init = unwrapExpressionAssertions(declarator.init);
            if (init.type === AST_NODE_TYPES.ArrayExpression) {
              constArrayNameToLiteral.set(declarator.id.name, init);
            }
          }
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

    /**
     * Resolves a same-file type name against every enclosing statement
     * container, innermost outward, so the nearest declaration shadows a
     * same-named outer one.
     *
     * Searching lexically rather than reading a table built off `Program.body`
     * is what lets an alias or interface declared beside the model type that
     * uses it be seen at all. Every statement of a container is searched, so a
     * declaration written below its own reference still resolves, matching
     * TypeScript's hoisting of type declarations.
     */
    const resolveTypeName = (
      from: TSESTree.Node,
      name: string,
    ): ResolvedTypeName | undefined => {
      let current: TSESTree.Node | undefined = from;
      while (current) {
        const statements = statementsOf(current);
        if (statements) {
          const declared = typeDeclarationIn(statements, name);
          if (declared) return declared;
        }
        current = current.parent as TSESTree.Node | undefined;
      }
      if (interfaceNames.has(name)) return { kind: 'interface' };
      if (enumNames.has(name)) return { kind: 'enum' };
      const aliased = aliasNameToType.get(name);
      return aliased ? { kind: 'alias', typeAnnotation: aliased } : undefined;
    };

    const resolveConstArray = (
      from: TSESTree.Node,
      name: string,
    ): TSESTree.ArrayExpression | undefined => {
      let current: TSESTree.Node | undefined = from;
      while (current) {
        const statements = statementsOf(current);
        if (statements) {
          const declared = constArrayIn(statements, name);
          if (declared === CONST_ARRAY_SHADOWED) return undefined;
          if (declared) return declared;
        }
        current = current.parent as TSESTree.Node | undefined;
      }
      return constArrayNameToLiteral.get(name);
    };

    // Keyed by resolved declaration rather than by name: one name can denote
    // different declarations in different scopes, so a name-keyed memo would
    // answer for whichever scope asked first.
    const seenAlias = new Set<TSESTree.Node>();
    const visitingAliases = new Set<TSESTree.Node>();

    const isPrimitiveLiteralElement = (
      element: TSESTree.Expression | TSESTree.SpreadElement | null,
      visitedConstArrays: Set<TSESTree.Node>,
    ): boolean => {
      // Array holes resolve to `undefined`, but the shape is unusual enough
      // that refusing to classify it keeps the narrowing conservative.
      if (!element) return false;
      if (element.type === AST_NODE_TYPES.SpreadElement) {
        const argument = unwrapExpressionAssertions(element.argument);
        if (argument.type === AST_NODE_TYPES.ArrayExpression) {
          return argument.elements.every((nested) =>
            isPrimitiveLiteralElement(nested, visitedConstArrays),
          );
        }
        if (argument.type === AST_NODE_TYPES.Identifier) {
          // The spread resolves in the scope it is written in, not the scope of
          // whichever reference started this walk.
          return isPrimitiveConstArray(
            argument.name,
            argument,
            visitedConstArrays,
          );
        }
        return false;
      }
      const expression = unwrapExpressionAssertions(element);
      switch (expression.type) {
        case AST_NODE_TYPES.Literal: {
          // A regex literal is an object; its `value` is engine-dependent, so
          // reject it explicitly rather than relying on the typeof check.
          if ((expression as unknown as { regex?: unknown }).regex)
            return false;
          const value = (expression as TSESTree.Literal).value;
          return (
            value === null ||
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'bigint'
          );
        }
        case AST_NODE_TYPES.TemplateLiteral:
          return true; // a template literal always produces a string
        case AST_NODE_TYPES.ArrayExpression:
          // Nested primitive arrays mirror the allowance for `string[][]` and
          // tuples of primitives elsewhere in this rule.
          return (expression as TSESTree.ArrayExpression).elements.every(
            (nested) => isPrimitiveLiteralElement(nested, visitedConstArrays),
          );
        case AST_NODE_TYPES.UnaryExpression: {
          const unary = expression as TSESTree.UnaryExpression;
          if (unary.operator !== '-' && unary.operator !== '+') return false;
          return isPrimitiveLiteralElement(unary.argument, visitedConstArrays);
        }
        case AST_NODE_TYPES.Identifier:
          return (expression as TSESTree.Identifier).name === 'undefined';
        default:
          return false;
      }
    };

    const isPrimitiveConstArray = (
      name: string,
      from: TSESTree.Node,
      visitedConstArrays: Set<TSESTree.Node>,
    ): boolean => {
      const arrayLiteral = resolveConstArray(from, name);
      if (!arrayLiteral) return false;
      // A cyclic spread cannot be resolved syntactically; refuse to classify it
      if (visitedConstArrays.has(arrayLiteral)) return false;
      visitedConstArrays.add(arrayLiteral);
      const result = arrayLiteral.elements.every((element) =>
        isPrimitiveLiteralElement(element, visitedConstArrays),
      );
      visitedConstArrays.delete(arrayLiteral);
      return result;
    };

    /**
     * Recognizes `(typeof VALUES)[number]` where VALUES is a same-file const
     * array of primitive literals. That form denotes the union of those
     * literals, not an object lookup, and it is exactly what the sibling
     * rule prefer-union-from-const-array autofixes toward.
     */
    const isConstArrayElementUnion = (
      node: TSESTree.TSIndexedAccessType,
    ): boolean => {
      const indexType = unwrapParenthesizedTypeNode(node.indexType);
      // Only a `number` index yields the element union; `['length']` or any key
      // lookup resolves to something this syntactic check cannot vouch for.
      if (indexType.type !== AST_NODE_TYPES.TSNumberKeyword) return false;
      const objectType = unwrapParenthesizedTypeNode(node.objectType);
      if (objectType.type !== AST_NODE_TYPES.TSTypeQuery) return false;
      const exprName = (objectType as TSESTree.TSTypeQuery).exprName;
      if (exprName.type !== AST_NODE_TYPES.Identifier) return false;
      return isPrimitiveConstArray(exprName.name, exprName, new Set());
    };

    const isPrimitiveLikeAlias = (
      name: string,
      from: TSESTree.Node,
      recursionDepth: number,
    ): boolean => {
      if (recursionDepth > 50) return false;
      if (PRIMITIVE_TYPES.has(name)) return true;
      const resolved = resolveTypeName(from, name);
      if (!resolved) return false;
      if (resolved.kind === 'enum') return true; // enums are non-object primitives for our purposes
      if (resolved.kind === 'interface') return false;
      const aliased = resolved.typeAnnotation;
      if (seenAlias.has(aliased)) return true;
      if (visitingAliases.has(aliased)) {
        return false;
      }
      visitingAliases.add(aliased);
      seenAlias.add(aliased);
      // Determine if the alias ultimately resolves to only primitive-like/literal
      // types. The annotation is searched from its own position, so each hop of
      // an alias chain resolves in the scope it was written in.
      const result = isPrimitiveLikeTypeNode(aliased, recursionDepth + 1);
      visitingAliases.delete(aliased);
      if (result) {
        seenAlias.add(aliased);
      } else {
        // Remove optimistic marking when resolution fails
        seenAlias.delete(aliased);
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
        case AST_NODE_TYPES.TSIndexedAccessType:
          return isConstArrayElementUnion(node as TSESTree.TSIndexedAccessType);
        case AST_NODE_TYPES.TSTypeReference: {
          // Allow known primitive-like references and enums or primitive-like aliases
          const ref = node as TSESTree.TSTypeReference;
          if (
            ref.typeName.type !== AST_NODE_TYPES.Identifier &&
            ref.typeName.type !== AST_NODE_TYPES.TSQualifiedName
          ) {
            return false;
          }
          const name =
            ref.typeName.type === AST_NODE_TYPES.Identifier
              ? ref.typeName.name
              : getRightmostIdentifierName(ref.typeName);
          return isPrimitiveLikeAlias(name, ref, recursionDepth + 1);
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
          const resolved = resolveTypeName(node, refName);
          // Unknown reference: do not assume object to avoid false positives
          if (!resolved) return false;
          if (resolved.kind === 'interface') return true;
          if (resolved.kind === 'enum') return false;
          return !isPrimitiveLikeAlias(refName, node, 0);
        }
        case AST_NODE_TYPES.TSIntersectionType:
        case AST_NODE_TYPES.TSUnionType:
          return node.types.some(isObjectType);
        case AST_NODE_TYPES.TSMappedType:
          return true;
        case AST_NODE_TYPES.TSIndexedAccessType:
          // An indexed access such as `DataShape['user']` is an object lookup,
          // but `(typeof VALUES)[number]` over a const array of primitive
          // literals is a primitive union and must not be flagged.
          return !isConstArrayElementUnion(
            node as TSESTree.TSIndexedAccessType,
          );
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
          currentParent = (currentParent as TSESTree.TSTypeOperator).parent as
            | TSESTree.Node
            | undefined;
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
