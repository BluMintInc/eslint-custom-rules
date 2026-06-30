import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { Minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';

type MessageIds = 'useServerTimestamp';

type Options = [
  {
    firestoreTypePaths?: string[];
    targetPaths?: string[];
    ignoreTestFiles?: boolean;
  },
];

const DEFAULT_FIRESTORE_TYPE_PATHS = ['functions/src/types/firestore/**'];
const DEFAULT_TARGET_PATHS = ['src/**'];
const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /__mocks__\//,
];

function isTestFile(filename: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

function matchesAnyGlob(value: string, globs: string[]): boolean {
  return globs.some((glob) => {
    const mm = new Minimatch(glob, { matchBase: false });
    return mm.match(value);
  });
}

/**
 * Checks whether the import source matches any of the configured Firestore
 * type path globs. Handles both absolute paths like
 * `functions/src/types/firestore/TokenMetadata` and relative paths like
 * `../../functions/src/types/firestore/TokenMetadata` by normalising the
 * path before testing.
 */
function isFirestoreTypePath(
  source: string,
  firestoreTypePaths: string[],
): boolean {
  // Strip leading relative segments so relative paths are tested the same way
  // as bare module specifiers.
  const normalized = source.replace(/^(\.\.\/|\.\/)+/, '');
  return matchesAnyGlob(normalized, firestoreTypePaths);
}

/**
 * Extracts the base type name (without generic parameters) from a
 * TSTypeReference node. For `TokenMetadata<'offchain', Date>` this returns
 * `TokenMetadata`.
 */
function getBaseTypeName(node: TSESTree.TSTypeReference): string | null {
  if (node.typeName.type === AST_NODE_TYPES.Identifier) {
    return node.typeName.name;
  }
  // Handle qualified names like `NS.TypeName`
  if (node.typeName.type === AST_NODE_TYPES.TSQualifiedName) {
    return node.typeName.right.name;
  }
  return null;
}

/**
 * Recursively collects all TSTypeReference base names from a type node,
 * including type parameters. This lets us detect Firestore types nested
 * inside utility types like `Partial<TokenMetadata<...>>`.
 */
function collectTypeReferenceNames(
  typeNode: TSESTree.TypeNode | null | undefined,
): string[] {
  if (!typeNode) return [];

  const names: string[] = [];

  if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
    const base = getBaseTypeName(typeNode);
    if (base) names.push(base);
    if (typeNode.typeParameters) {
      for (const param of typeNode.typeParameters.params) {
        names.push(...collectTypeReferenceNames(param));
      }
    }
  } else if (typeNode.type === AST_NODE_TYPES.TSArrayType) {
    names.push(...collectTypeReferenceNames(typeNode.elementType));
  } else if (
    typeNode.type === AST_NODE_TYPES.TSUnionType ||
    typeNode.type === AST_NODE_TYPES.TSIntersectionType
  ) {
    for (const t of typeNode.types) {
      names.push(...collectTypeReferenceNames(t));
    }
  } else if (typeNode.type === AST_NODE_TYPES.TSTypeOperator) {
    names.push(...collectTypeReferenceNames(typeNode.typeAnnotation));
  }

  return names;
}

/**
 * Determines whether a type annotation references any of the tracked Firestore
 * type names. The check is purely syntactic — we look for type names in
 * TSTypeReference nodes.
 */
function typeAnnotationReferencesFirestoreType(
  typeAnnotation: TSESTree.TypeNode | null | undefined,
  firestoreTypeNames: Set<string>,
): boolean {
  const names = collectTypeReferenceNames(typeAnnotation);
  return names.some((n) => firestoreTypeNames.has(n));
}

/**
 * Returns the inner expression, unwrapping TSAsExpression / TSSatisfiesExpression
 * chains, so we can inspect what lies under a cast.
 */
function unwrapCast(node: TSESTree.Expression): TSESTree.Expression {
  let current: TSESTree.Expression = node;
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type ===
      (AST_NODE_TYPES as { TSSatisfiesExpression?: string })
        .TSSatisfiesExpression
  ) {
    current = (current as TSESTree.TSAsExpression).expression;
  }
  return current;
}

/**
 * Checks whether an expression is `new Date(...)` (possibly wrapped in casts).
 */
function isNewDate(node: TSESTree.Expression): boolean {
  const unwrapped = unwrapCast(node);
  if (unwrapped.type !== AST_NODE_TYPES.NewExpression) return false;
  const callee = unwrapped.callee;
  return callee.type === AST_NODE_TYPES.Identifier && callee.name === 'Date';
}

/**
 * Recursively visits all property values in an ObjectExpression (including
 * nested objects) and reports any `new Date()` calls.
 */
function reportNewDatesInObject(
  obj: TSESTree.ObjectExpression,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
): void {
  for (const prop of obj.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;
    const value = prop.value as TSESTree.Expression;
    if (isNewDate(value)) {
      context.report({
        node: value,
        messageId: 'useServerTimestamp',
      });
    } else if (value.type === AST_NODE_TYPES.ObjectExpression) {
      reportNewDatesInObject(value, context);
    } else if (
      value.type === AST_NODE_TYPES.TSAsExpression ||
      value.type ===
        (AST_NODE_TYPES as { TSSatisfiesExpression?: string })
          .TSSatisfiesExpression
    ) {
      // The cast may wrap a new Date() OR an object literal we need to recurse into
      const inner = unwrapCast(value as TSESTree.Expression);
      if (isNewDate(inner as TSESTree.Expression)) {
        context.report({
          node: value,
          messageId: 'useServerTimestamp',
        });
      } else if (inner.type === AST_NODE_TYPES.ObjectExpression) {
        reportNewDatesInObject(inner as TSESTree.ObjectExpression, context);
      }
    } else if (value.type === AST_NODE_TYPES.ConditionalExpression) {
      // Ternary: check both branches
      if (isNewDate(value.consequent as TSESTree.Expression)) {
        context.report({
          node: value.consequent,
          messageId: 'useServerTimestamp',
        });
      }
      if (isNewDate(value.alternate as TSESTree.Expression)) {
        context.report({
          node: value.alternate,
          messageId: 'useServerTimestamp',
        });
      }
    }
  }
}

export const requireServerTimestampForFirestoreDates = createRule<
  Options,
  MessageIds
>({
  name: 'require-server-timestamp-for-firestore-dates',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce serverTimestamp() instead of new Date() for Firestore timestamp fields',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          firestoreTypePaths: {
            type: 'array',
            items: { type: 'string' },
          },
          targetPaths: {
            type: 'array',
            items: { type: 'string' },
          },
          ignoreTestFiles: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useServerTimestamp:
        'Use serverTimestamp() instead of new Date() for Firestore timestamp fields — client clocks are unreliable and spoofable.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const firestoreTypePaths =
      options.firestoreTypePaths ?? DEFAULT_FIRESTORE_TYPE_PATHS;
    const targetPaths = options.targetPaths ?? DEFAULT_TARGET_PATHS;
    const ignoreTestFiles = options.ignoreTestFiles ?? true;

    const filename = context.getFilename();

    // Honour ignoreTestFiles option
    if (ignoreTestFiles && isTestFile(filename)) {
      return {};
    }

    // Only apply rule to target paths (frontend code by default).
    // Normalise to forward slashes so Windows paths work. Test filenames are
    // relative (e.g. `src/hooks/useExample.ts`). Real monorepo filenames are
    // absolute (e.g. `/workspace/src/hooks/useExample.ts`); for those we also
    // try matching the segment of the path that starts with the first literal
    // prefix of each glob (only when the filename is an absolute path).
    const normalizedFilename = filename.replace(/\\/g, '/');
    const isAbsolutePath = normalizedFilename.startsWith('/');
    const inTargetPaths =
      matchesAnyGlob(normalizedFilename, targetPaths) ||
      (isAbsolutePath &&
        targetPaths.some((glob) => {
          const prefix = glob.replace(/\*.*$/, ''); // e.g. 'src/'
          const idx = normalizedFilename.indexOf('/' + prefix);
          if (idx === -1) return false;
          const suffix = normalizedFilename.slice(idx + 1); // e.g. 'src/hooks/...'
          return matchesAnyGlob(suffix, [glob]);
        }));
    if (!inTargetPaths) return {};

    // Collect Firestore type names from imports in this file
    const firestoreTypeNames = new Set<string>();

    return {
      ImportDeclaration(node) {
        const source = node.source.value as string;
        if (!isFirestoreTypePath(source, firestoreTypePaths)) return;

        for (const specifier of node.specifiers) {
          if (
            specifier.type === AST_NODE_TYPES.ImportSpecifier ||
            specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
            specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
          ) {
            // Track the local alias name (what this file uses to refer to the type)
            firestoreTypeNames.add(specifier.local.name);
          }
        }
      },

      VariableDeclarator(node) {
        if (firestoreTypeNames.size === 0) return;

        // Pattern: const x: FirestoreType = { ... }
        const typeAnnotation = node.id.typeAnnotation?.typeAnnotation;
        if (
          typeAnnotation &&
          typeAnnotationReferencesFirestoreType(
            typeAnnotation,
            firestoreTypeNames,
          ) &&
          node.init &&
          node.init.type === AST_NODE_TYPES.ObjectExpression
        ) {
          reportNewDatesInObject(node.init, context);
        }
      },

      // Pattern: { ... } as FirestoreType  or  { ... } satisfies FirestoreType
      TSAsExpression(node) {
        if (firestoreTypeNames.size === 0) return;

        // Only check when the as-cast target type references a Firestore type
        const typeAnnotation = node.typeAnnotation;
        if (
          !typeAnnotationReferencesFirestoreType(
            typeAnnotation,
            firestoreTypeNames,
          )
        )
          return;

        const inner = unwrapCast(node.expression);
        if (inner.type === AST_NODE_TYPES.ObjectExpression) {
          reportNewDatesInObject(inner as TSESTree.ObjectExpression, context);
        }
      },

      // Arrow functions with concise body: `const f = (): FirestoreType => ({ ... })`
      // In this form the body is the ObjectExpression directly (no ReturnStatement).
      ArrowFunctionExpression(node) {
        if (firestoreTypeNames.size === 0) return;
        if (node.body.type !== AST_NODE_TYPES.ObjectExpression) return;

        const returnType = node.returnType?.typeAnnotation;
        if (
          returnType &&
          typeAnnotationReferencesFirestoreType(returnType, firestoreTypeNames)
        ) {
          reportNewDatesInObject(
            node.body as TSESTree.ObjectExpression,
            context,
          );
        }
      },

      // Return statements in functions with explicit Firestore return type annotation
      ReturnStatement(node) {
        if (firestoreTypeNames.size === 0) return;
        if (!node.argument) return;
        if (node.argument.type !== AST_NODE_TYPES.ObjectExpression) return;

        // Walk up to find the enclosing function and check its return type
        let ancestor: TSESTree.Node | undefined = node.parent;
        while (ancestor) {
          if (
            ancestor.type === AST_NODE_TYPES.FunctionDeclaration ||
            ancestor.type === AST_NODE_TYPES.FunctionExpression ||
            ancestor.type === AST_NODE_TYPES.ArrowFunctionExpression
          ) {
            const returnType = (
              ancestor as
                | TSESTree.FunctionDeclaration
                | TSESTree.FunctionExpression
                | TSESTree.ArrowFunctionExpression
            ).returnType?.typeAnnotation;
            if (
              returnType &&
              typeAnnotationReferencesFirestoreType(
                returnType,
                firestoreTypeNames,
              )
            ) {
              reportNewDatesInObject(
                node.argument as TSESTree.ObjectExpression,
                context,
              );
            }
            break;
          }
          ancestor = ancestor.parent as TSESTree.Node | undefined;
        }
      },
    };
  },
});
