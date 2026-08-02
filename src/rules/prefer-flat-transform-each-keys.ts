import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferFlatTransformEachKeys';

// Propagation strategy shape signals: an object literal with one of these
// properties (besides transformEach) is treated as a propagation strategy.
const STRATEGY_SHAPE_KEYS = new Set([
  'resolveAll',
  'queryResolveAll',
  'numericFieldPathConfig',
  'upsert',
  'sourceDeletionOverride',
]);

function isObjectExpression(
  node: TSESTree.Node | null | undefined,
): node is TSESTree.ObjectExpression {
  return !!node && node.type === AST_NODE_TYPES.ObjectExpression;
}

/**
 * Strips assertion wrappers (`as const`, `as T`, `satisfies T`, `!`, `<T>x`),
 * which nest, from an expression before its node type is inspected.
 *
 * An assertion changes no runtime value, so the write shape transformEach sends
 * to Firestore — the only thing this rule judges — is identical with or without
 * one. Matching bare node types alone leaves the rule blind to its own
 * ecosystem: `enforce-object-literal-as-const` ships `'error'` in the same
 * recommended config and is fixable, so `eslint --fix` appends `as const` to
 * exactly these literals, which silences the nested-key report while the nested
 * write shape survives (#1608).
 *
 * Unwrapping the whole chain rather than one level is safe because no wrapper's
 * `typeAnnotation` carries information this rule reads; only key names and value
 * shapes underneath matter.
 */
function unwrapAssertions(node: TSESTree.Node): TSESTree.Node {
  return ASTHelpers.unwrapTSAssertions(node);
}

// Resolve the object literal an expression ultimately is, seeing through
// assertion wrappers. Returns null when the underlying expression is anything
// else (a call, a member expression, a binding reference).
function unwrapToObjectExpression(
  node: TSESTree.Node | null | undefined,
): TSESTree.ObjectExpression | null {
  if (!node) return null;
  const inner = unwrapAssertions(node);
  return isObjectExpression(inner) ? inner : null;
}

function isProperty(node: TSESTree.Node): node is TSESTree.Property {
  return node.type === AST_NODE_TYPES.Property;
}

// Return the string name of a non-computed property key, or null.
function getStaticKeyName(prop: TSESTree.Property): string | null {
  if (prop.computed) return null;
  if (prop.key.type === AST_NODE_TYPES.Identifier) return prop.key.name;
  if (
    prop.key.type === AST_NODE_TYPES.Literal &&
    typeof prop.key.value === 'string'
  )
    return prop.key.value;
  return null;
}

// A key is a "dot-notation key" if it contains a dot (e.g., 'foo.bar').
// Such keys represent leaf paths — their values can be any shape.
function isDotNotationKey(keyName: string): boolean {
  return keyName.includes('.');
}

// Determine whether an object-expression property key is a computed key.
// Computed keys (bracket notation, including template literals) represent
// dynamic leaf paths and are therefore exempt from the flat-key requirement.
// Template literal keys always have `computed: true` in the AST, so a single
// check on `prop.computed` is sufficient.
function isComputedKey(prop: TSESTree.Property): boolean {
  return prop.computed;
}

// Find a direct Property child by name inside an ObjectExpression.
function findProp(
  obj: TSESTree.ObjectExpression,
  name: string,
): TSESTree.Property | null {
  for (const p of obj.properties) {
    if (!isProperty(p)) continue;
    const k = getStaticKeyName(p);
    if (k === name) return p;
  }
  return null;
}

// Determine whether an ObjectExpression looks like a propagation strategy:
// it has a `transformEach` property AND at least one of the known strategy
// shape keys.
function isStrategyObject(obj: TSESTree.ObjectExpression): boolean {
  let hasTransformEach = false;
  let hasStrategyKey = false;
  for (const p of obj.properties) {
    if (!isProperty(p)) continue;
    const k = getStaticKeyName(p);
    if (!k) continue;
    if (k === 'transformEach') hasTransformEach = true;
    if (STRATEGY_SHAPE_KEYS.has(k)) hasStrategyKey = true;
  }
  return hasTransformEach && hasStrategyKey;
}

// Return true if the strategy uses resolveSelf (deleted-source short-circuit,
// so nested objects are safe). Checks: resolveAll's value is an Identifier
// named 'resolveSelf'.
function usesResolveSelf(obj: TSESTree.ObjectExpression): boolean {
  const resolveAllProp = findProp(obj, 'resolveAll');
  if (!resolveAllProp) return false;
  // `resolveAll: resolveSelf as ResolveAllStrategy` still resolves self, so the
  // exemption must survive an assertion on the reference.
  const val = unwrapAssertions(resolveAllProp.value);
  return val.type === AST_NODE_TYPES.Identifier && val.name === 'resolveSelf';
}

// Extract the effective "data" object from a return value:
// - If the returned object has an `afterData` property, return its value
//   (since the outer object is a structural wrapper, not a propagation map).
// - Otherwise return the object itself.
function getDataObject(
  obj: TSESTree.ObjectExpression,
): TSESTree.ObjectExpression | null {
  const afterDataProp = findProp(obj, 'afterData');
  if (afterDataProp) {
    const val = unwrapToObjectExpression(afterDataProp.value);
    if (val) return val;
    // afterData exists but its value isn't a literal (e.g. a variable) — skip.
    return null;
  }
  return obj;
}

// Check whether a variable-binding return follows the pattern:
//   const result = { ... };
//   return result;
// Returns the initialiser ObjectExpression if found, otherwise null.
function resolveVariableBinding(
  returnArg: TSESTree.Node,
  funcBody: TSESTree.BlockStatement,
): TSESTree.ObjectExpression | null {
  if (returnArg.type !== AST_NODE_TYPES.Identifier) return null;
  const varName = returnArg.name;

  // Walk the statements in the function body looking for a single const/let
  // initialisation whose id matches varName.
  for (const stmt of funcBody.body) {
    if (stmt.type !== AST_NODE_TYPES.VariableDeclaration) continue;
    for (const decl of stmt.declarations) {
      if (
        decl.id.type !== AST_NODE_TYPES.Identifier ||
        decl.id.name !== varName
      ) {
        continue;
      }
      const init = unwrapToObjectExpression(decl.init);
      if (init) return init;
    }
  }
  return null;
}

// Report nested-object properties in a data object (the actual propagation
// map, after afterData unwrapping). A property is flagged when:
//   - its key is a simple non-dot-notation identifier/string
//   - its value is an ObjectExpression
function checkDataObject(
  dataObj: TSESTree.ObjectExpression,
  report: (node: TSESTree.Node) => void,
): void {
  for (const prop of dataObj.properties) {
    if (!isProperty(prop)) continue;
    if (isComputedKey(prop)) continue;

    const keyName = getStaticKeyName(prop);
    if (keyName === null) continue;
    // Dot-notation string keys represent leaf paths — their values may be
    // any shape (the value IS the leaf data).
    if (isDotNotationKey(keyName)) continue;

    // Flag when the value is a nested object literal.
    if (unwrapToObjectExpression(prop.value)) {
      report(prop);
    }
  }
}

// Analyse a function body (BlockStatement) for return statements that produce
// nested objects, and report each violation.
function analyzeBlockBody(
  body: TSESTree.BlockStatement,
  report: (node: TSESTree.Node) => void,
): void {
  for (const stmt of body.body) {
    if (stmt.type !== AST_NODE_TYPES.ReturnStatement) continue;
    if (!stmt.argument) continue;

    const returned = unwrapAssertions(stmt.argument);

    // Try single-binding pattern: const x = {...}; return x;
    const retObj = isObjectExpression(returned)
      ? returned
      : resolveVariableBinding(returned, body);

    if (!retObj) continue;

    const dataObj = getDataObject(retObj);
    if (!dataObj) continue;

    checkDataObject(dataObj, report);
  }
}

export const preferFlatTransformEachKeys = createRule<[], MessageIds>({
  name: 'prefer-flat-transform-each-keys',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when transformEach in a propagation strategy returns nested object values instead of flat dot-notation keys.',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [],
    messages: {
      preferFlatTransformEachKeys:
        "Avoid returning nested objects from transformEach. Use flat dot-notation keys instead (e.g., 'parent.child.key' instead of { parent: { child: { key } } }). Nested objects cause FieldValue.delete() at the parent key on source deletion, wiping the entire sub-tree instead of just the propagated fields. If nesting is intentional (e.g., wiping an entire sub-tree), disable this rule with a comment explaining why.",
    },
  },
  defaultOptions: [],
  create(context) {
    // Core detection is purely syntactic and works without type info.
    // The parserServices guard below mirrors no-entire-object-hook-deps.ts so
    // the rule degrades gracefully in test environments without parserOptions.project.
    // Currently only the syntactic path is exercised; type-aware enhancement
    // (e.g. resolving identifier types) can be wired in here when needed.
    void context.parserServices; // accessed for future type-aware enhancement

    return {
      // Visit every ObjectExpression. If it looks like a propagation strategy,
      // find the transformEach function and check its return values.
      ObjectExpression(node) {
        if (!isStrategyObject(node)) return;
        if (usesResolveSelf(node)) return;

        const transformEachProp = findProp(node, 'transformEach');
        if (!transformEachProp) return;

        // A transform asserted at its binding
        // (`transformEach: ((doc) => ({...})) as TransformEach`) is still the
        // function the strategy runs.
        const fn = unwrapAssertions(transformEachProp.value);

        const report = (violatingNode: TSESTree.Node) => {
          context.report({
            node: violatingNode,
            messageId: 'preferFlatTransformEachKeys',
          });
        };

        if (
          fn.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          fn.type === AST_NODE_TYPES.FunctionExpression
        ) {
          const body = fn.body;
          // Arrow function with implicit return: () => ({ ... })
          const implicitReturn = unwrapToObjectExpression(body);

          if (implicitReturn) {
            const dataObj = getDataObject(implicitReturn);
            if (dataObj) checkDataObject(dataObj, report);
          } else if (body.type === AST_NODE_TYPES.BlockStatement) {
            analyzeBlockBody(body, report);
          }
        }
      },
    };
  },
});
