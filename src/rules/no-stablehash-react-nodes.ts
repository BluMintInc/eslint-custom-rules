import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noStableHashReactNode';

/**
 * Module path suffix that identifies the stableHash family of utilities.
 * Matches both absolute and relative import paths that end in util/hash/stableHash.
 */
const HASH_MODULE_SUFFIX = 'util/hash/stableHash';

/**
 * Named exports from the hash module that we care about. sortedHash is included
 * because it wraps stableHash and has the same stringification danger.
 */
const HASH_EXPORT_NAMES = new Set(['stableHash', 'sortedHash']);

/**
 * Type names that unambiguously denote React render trees or BluMint node
 * wrappers. When a variable/parameter carries one of these annotations we know
 * it is a ReactNode and must not be hashed.
 */
const REACT_NODE_TYPE_NAMES = new Set([
  'ReactNode',
  'ReactElement',
  'JSX',
  'KeyedNode',
  'OrNode',
]);

/**
 * Object-literal property names whose presence signals the object contains a
 * React render tree (either a children prop or a BluMint "Node" field).
 */
const NODE_PROP_NAMES = new Set(['children', 'Node']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return true when the import source path ends with the known hash module
 * suffix, handling both absolute paths (functions/src/util/hash/stableHash)
 * and relative variants (../../../util/hash/stableHash).
 */
function isHashModulePath(source: string): boolean {
  return source.endsWith(HASH_MODULE_SUFFIX);
}

/**
 * Resolve the TSTypeAnnotation / TSTypeReference down to a base type name so
 * we can match against REACT_NODE_TYPE_NAMES without depending on the type
 * checker.
 *
 * Handles:
 *   ReactNode                        → 'ReactNode'
 *   React.ReactNode                  → 'ReactNode'  (qualified reference)
 *   JSX.Element                      → 'JSX'
 *   OrNode<T>                        → 'OrNode'
 *   KeyedNode[]  / readonly KeyedNode[] → 'KeyedNode' (array element)
 */
function extractBaseTypeName(typeNode: TSESTree.TypeNode): string | null {
  switch (typeNode.type) {
    case AST_NODE_TYPES.TSTypeReference: {
      const name = typeNode.typeName;
      if (name.type === AST_NODE_TYPES.Identifier) {
        return name.name;
      }
      // Qualified name: React.ReactNode → take the right-hand part
      if (
        name.type === AST_NODE_TYPES.TSQualifiedName &&
        name.right.type === AST_NODE_TYPES.Identifier
      ) {
        // For JSX.Element we want "JSX" (the left) so we can match the set
        if (
          name.left.type === AST_NODE_TYPES.Identifier &&
          name.left.name === 'JSX'
        ) {
          return 'JSX';
        }
        return name.right.name;
      }
      return null;
    }
    case AST_NODE_TYPES.TSArrayType:
      return extractBaseTypeName(typeNode.elementType);
    case AST_NODE_TYPES.TSTypeOperator:
      // readonly T[]
      if (typeNode.typeAnnotation) {
        return extractBaseTypeName(typeNode.typeAnnotation);
      }
      return null;
    default:
      return null;
  }
}

/**
 * Return true when a TS type annotation (already unwrapped to the inner type
 * node) indicates a ReactNode / ReactElement / KeyedNode / OrNode / JSX.Element.
 */
function isReactNodeTypeAnnotation(typeNode: TSESTree.TypeNode): boolean {
  const base = extractBaseTypeName(typeNode);
  if (base === null) return false;
  return REACT_NODE_TYPE_NAMES.has(base);
}

/**
 * Walk the program body's import declarations to build a mapping from local
 * binding name → { isNamespace: boolean }.
 *
 * isNamespace = true  → `import * as Hash from '...'` — we flag Hash.stableHash(...)
 * isNamespace = false → `import { stableHash } from '...'` (possibly aliased)
 */
function collectHashBindings(
  program: TSESTree.Program,
): Map<string, { isNamespace: boolean }> {
  const bindings = new Map<string, { isNamespace: boolean }>();

  for (const node of program.body) {
    if (node.type !== AST_NODE_TYPES.ImportDeclaration) continue;
    if (!isHashModulePath(String(node.source.value))) continue;

    for (const spec of node.specifiers) {
      if (spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
        // import * as Hash from '...'
        bindings.set(spec.local.name, { isNamespace: true });
      } else if (spec.type === AST_NODE_TYPES.ImportSpecifier) {
        // import { stableHash } or import { stableHash as hash }
        const importedName =
          spec.imported.type === AST_NODE_TYPES.Identifier
            ? spec.imported.name
            : (spec.imported as unknown as TSESTree.StringLiteral).value;
        if (HASH_EXPORT_NAMES.has(importedName)) {
          bindings.set(spec.local.name, { isNamespace: false });
        }
      }
    }
  }

  return bindings;
}

/**
 * Return true when the argument to a stableHash call is a JSX element or
 * JSX fragment.
 */
function isJsxNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.JSXElement ||
    node.type === AST_NODE_TYPES.JSXFragment
  );
}

/**
 * Return true when the argument is an object literal that contains a property
 * named `children` or `Node` (shorthand or keyed), signalling it wraps a
 * render-tree value.
 */
function objectLiteralContainsNodeProp(
  node: TSESTree.ObjectExpression,
): boolean {
  for (const prop of node.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;

    const key = prop.key;
    let propName: string | null = null;

    if (key.type === AST_NODE_TYPES.Identifier) {
      propName = key.name;
    } else if (
      key.type === AST_NODE_TYPES.Literal &&
      typeof key.value === 'string'
    ) {
      propName = key.value;
    }

    if (propName !== null && NODE_PROP_NAMES.has(propName)) {
      return true;
    }
  }
  return false;
}

/**
 * Attempt to resolve the type annotation of an identifier from the local
 * scope without the type checker.
 *
 * Strategy (in order):
 * 1. The identifier is a parameter of the immediately enclosing function with
 *    a TSTypeAnnotation — read it directly.
 * 2. The identifier is declared as a variable with a type annotation
 *    (`const x: ReactNode = ...`).
 *
 * Returns the TSTypeAnnotation typeAnnotation node or null if not found.
 */
function resolveAnnotationForIdentifier(
  identNode: TSESTree.Identifier,
): TSESTree.TypeNode | null {
  // Walk parents looking for a parameter list or variable declarator that
  // matches the identifier's name.
  let current: TSESTree.Node | undefined = identNode.parent as
    | TSESTree.Node
    | undefined;

  while (current) {
    // Function or arrow-function parameter
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      const fn = current as
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression;
      for (const param of fn.params) {
        if (
          param.type === AST_NODE_TYPES.Identifier &&
          param.name === identNode.name &&
          param.typeAnnotation?.typeAnnotation
        ) {
          return param.typeAnnotation.typeAnnotation;
        }
        // Handle default param: (node: KeyedNode = ...)
        if (
          param.type === AST_NODE_TYPES.AssignmentPattern &&
          param.left.type === AST_NODE_TYPES.Identifier &&
          param.left.name === identNode.name &&
          (param.left as TSESTree.Identifier).typeAnnotation?.typeAnnotation
        ) {
          const annotation = (param.left as TSESTree.Identifier).typeAnnotation;
          if (annotation) {
            return annotation.typeAnnotation;
          }
        }
      }
    }

    // Variable declaration in the same scope
    if (current.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const decl of current.declarations) {
        if (
          decl.id.type === AST_NODE_TYPES.Identifier &&
          decl.id.name === identNode.name &&
          decl.id.typeAnnotation?.typeAnnotation
        ) {
          return decl.id.typeAnnotation.typeAnnotation;
        }
      }
    }

    current = current.parent as TSESTree.Node | undefined;
  }

  return null;
}

/**
 * Return true when the argument expression is, or contains, a ReactNode based
 * on purely syntactic (AST-level) evidence:
 *
 * 1. Literal JSX element/fragment.
 * 2. Object literal with a `children` or `Node` property.
 * 3. Identifier whose nearest resolvable TS type annotation names a ReactNode.
 */
function argIsReactNode(arg: TSESTree.CallExpressionArgument): boolean {
  // Strip as/type-assertion wrappers
  let expr: TSESTree.Node = arg;
  while (
    expr.type === AST_NODE_TYPES.TSAsExpression ||
    expr.type === AST_NODE_TYPES.TSTypeAssertion ||
    expr.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    expr = (expr as TSESTree.TSAsExpression).expression;
  }

  // Case 1: direct JSX
  if (isJsxNode(expr)) {
    return true;
  }

  // Case 2: object literal with node-shaped prop
  if (
    expr.type === AST_NODE_TYPES.ObjectExpression &&
    objectLiteralContainsNodeProp(expr)
  ) {
    return true;
  }

  // Case 3: identifier with resolvable ReactNode annotation
  if (expr.type === AST_NODE_TYPES.Identifier) {
    const typeNode = resolveAnnotationForIdentifier(expr);
    if (typeNode && isReactNodeTypeAnnotation(typeNode)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

export const noStablehashReactNodes = createRule<[], MessageIds>({
  name: 'no-stablehash-react-nodes',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent passing ReactNodes or render-tree values to stableHash(), which deep-stringifies its argument and can freeze the browser.',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [],
    messages: {
      noStableHashReactNode:
        'Do not stableHash ReactNodes / KeyedNodes — stableHash() stringifies the full render tree and can freeze the browser. Hash stable keys/ids instead (e.g. stableHash(nodes.map((n) => n.key))).',
    },
  },
  defaultOptions: [],
  create(context) {
    // Collect hash-function bindings lazily on first CallExpression visit.
    let bindings: Map<string, { isNamespace: boolean }> | null = null;

    function getBindings(): Map<string, { isNamespace: boolean }> {
      if (bindings === null) {
        const sourceCode =
          (context as unknown as { sourceCode?: { ast: TSESTree.Program } })
            .sourceCode ?? context.getSourceCode();
        bindings = collectHashBindings(sourceCode.ast);
      }
      return bindings;
    }

    /**
     * Determine whether a CallExpression's callee is a tracked stableHash /
     * sortedHash binding and return the first argument if so.
     */
    function getTrackedCallArg(
      node: TSESTree.CallExpression,
    ): TSESTree.CallExpressionArgument | null {
      if (node.arguments.length === 0) return null;

      const map = getBindings();
      if (map.size === 0) return null;

      const callee = node.callee;

      // Direct call: stableHash(arg) or hash(arg) (aliased)
      if (callee.type === AST_NODE_TYPES.Identifier) {
        const info = map.get(callee.name);
        if (info && !info.isNamespace) {
          return node.arguments[0];
        }
      }

      // Member expression: Hash.stableHash(arg)
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.object.type === AST_NODE_TYPES.Identifier &&
        callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        const objectName = callee.object.name;
        const methodName = callee.property.name;
        const info = map.get(objectName);
        if (info && info.isNamespace && HASH_EXPORT_NAMES.has(methodName)) {
          return node.arguments[0];
        }
      }

      return null;
    }

    return {
      CallExpression(node) {
        const arg = getTrackedCallArg(node);
        if (arg === null) return;

        if (argIsReactNode(arg)) {
          context.report({
            node,
            messageId: 'noStableHashReactNode',
          });
        }
      },
    };
  },
});
