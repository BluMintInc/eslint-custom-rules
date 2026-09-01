import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  bindingUses,
  ImportRemovalSource,
  planOrphanedImportRemoval,
  TextRange,
} from '../utils/importRemoval';

type MessageIds = 'keyOnlyOutermostElement' | 'fragmentShouldHaveKey';
type Options = [];

/** A nested `key` held until `Program:exit`, with the span its removal deletes. */
type Violation = {
  attribute: TSESTree.JSXAttribute;
  elementName: string;
  removal: TextRange;
};

/**
 * The span a removed `key` gives up: the attribute together with the whitespace
 * separating it from whatever precedes it.
 *
 * Taking the whitespace BEFORE the attribute rather than after is what makes
 * every position in an attribute list come out right. Consuming the trailing
 * space instead leaves `<div >` whenever the key ends the list — no other
 * attribute follows to donate a space — and consuming both would fuse the
 * survivors on either side into `id="x"className="y"`.
 *
 * Only whitespace is swallowed, so a block comment sitting between the previous
 * token and the key stays where its author put it.
 */
function removalRangeOf(
  source: ImportRemovalSource,
  attribute: TSESTree.JSXAttribute,
): TextRange {
  let start = attribute.range[0];
  while (start > 0 && /\s/.test(source.text[start - 1])) {
    start--;
  }
  return [start, attribute.range[1]];
}

/**
 * Partitions violations into the sets whose removals have to travel together.
 *
 * A binding read from two key expressions is unbound only once both are gone, so
 * neither removal may unbind it alone — and a fix may only count on the other
 * removal happening if it performs that removal itself. Keys that jointly hold a
 * binding alive are therefore merged into one batch, and every other key is a
 * batch of one, judged against the file as it stands.
 *
 * EVERY binding is asked about, not the imported ones alone: a local helper named
 * by two keys would otherwise be owned by no fix at all, each key looking
 * innocent by itself while `--fix` strips both in the same run (#1902).
 *
 * `violations` must already exclude suppressed reports, whose fixes never run.
 */
function batchViolations(
  source: ImportRemovalSource,
  violations: readonly Violation[],
): Violation[][] {
  const parents = violations.map((_violation, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parents[current] !== current) {
      parents[current] = parents[parents[current]];
      current = parents[current];
    }
    return current;
  };
  const union = (left: number, right: number) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) {
      parents[rootRight] = rootLeft;
    }
  };

  const ownerOf = (use: TextRange) =>
    violations.findIndex(
      ({ removal }) => use[0] >= removal[0] && use[1] <= removal[1],
    );

  for (const { uses } of bindingUses(source)) {
    // A single use cannot be shared, so the one-key judgement already covers it.
    if (uses.length < 2) continue;

    const owners = new Set<number>();
    const escapes = uses.some((use) => {
      const owner = ownerOf(use);
      if (owner === -1) return true;
      owners.add(owner);
      return false;
    });
    // A use outside every removal keeps the binding alive whatever these fixes
    // do, so its readers owe each other nothing.
    if (escapes || owners.size < 2) continue;

    const [first, ...rest] = [...owners];
    for (const other of rest) {
      union(first, other);
    }
  }

  const groups = new Map<number, Violation[]>();
  violations.forEach((violation, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) {
      group.push(violation);
    } else {
      groups.set(root, [violation]);
    }
  });
  return [...groups.values()];
}

/**
 * The ranges one fix deletes for `batch`: the keys themselves plus any import
 * they were the last consumers of. `null` when a binding the removal orphans
 * cannot be unbound safely — a `map` callback parameter read by nothing else, a
 * local helper, an import behind a directive comment. The caller then drops the
 * fix and keeps the report, because emitting the half that strips the last use
 * while leaving the binding behind turns a clean file into one that fails
 * `no-unused-vars`.
 */
function planBatch(
  source: ImportRemovalSource,
  batch: readonly Violation[],
): TextRange[] | null {
  const removals = batch.map((violation) => violation.removal);
  const cleanups = planOrphanedImportRemoval(source, removals);
  return cleanups ? [...removals, ...cleanups] : null;
}

const getJSXElementName = (name: TSESTree.JSXTagNameExpression): string => {
  if (name.type === 'JSXIdentifier') {
    return name.name;
  }

  if (name.type === 'JSXMemberExpression') {
    const objectName =
      name.object.type === 'JSXIdentifier'
        ? name.object.name
        : getJSXElementName(name.object);

    return `${objectName}.${name.property.name}`;
  }

  if (name.type === 'JSXNamespacedName') {
    return `${name.namespace.name}:${name.name.name}`;
  }

  return 'element';
};

export const keyOnlyOutermostElement = createRule<Options, MessageIds>({
  name: 'key-only-outermost-element',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that only the outermost element in list rendering has a key prop',
      recommended: 'error',
    },
    messages: {
      keyOnlyOutermostElement:
        'Nested element "{{elementName}}" has a key even though the list item already owns the identity. React reconciles list items using the key on the outermost element; nested keys create redundant identities and can mask ordering bugs. Remove this nested key and keep the key only on the element returned from map().',
      fragmentShouldHaveKey:
        'List items returned as fragments need a key on the fragment. Shorthand fragments (<></>) cannot accept keys, so React cannot track each item when the list reorders. Replace the shorthand with <React.Fragment key={...}> or another keyed wrapper so every list item has a stable identity.',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    // Track JSXElements that are direct children of a map callback
    const mapCallbackElements = new Set<TSESTree.JSXElement>();
    // Track JSXFragments that are direct children of a map callback
    const mapCallbackFragments = new Set<TSESTree.JSXFragment>();
    // Track JSX attributes that have already been reported to avoid duplicate reports
    const reportedAttributes = new Set<TSESTree.JSXAttribute>();

    /**
     * Nested keys held until `Program:exit`. Whether removing one strands a
     * binding is a whole-file question, and the answer can only be given once
     * every key that reads that binding is known.
     */
    const violations: Violation[] = [];

    /**
     * Whether ESLint will discard a report, resolved the way ESLint resolves it.
     * A batched fix counts on every removal in its batch happening; a suppressed
     * report never fixes, so its key — and the reference it holds — outlives the
     * pass and must not be counted on.
     */
    const isSuppressed = createSuppressionChecker(context);

    // Helper function to process map calls
    const processMapCall = (node: TSESTree.CallExpression) => {
      // Get the callback function
      const callback = node.arguments[0];

      if (
        callback &&
        (callback.type === 'ArrowFunctionExpression' ||
          callback.type === 'FunctionExpression')
      ) {
        // Find the return statement or expression
        let returnExpr: TSESTree.Expression | null = null;

        if (
          callback.type === 'ArrowFunctionExpression' &&
          callback.expression &&
          callback.body.type !== 'BlockStatement'
        ) {
          // Arrow function with implicit return
          returnExpr = callback.body;
        } else {
          // Look for return statements in the function body
          const body = callback.body;
          if (body.type === 'BlockStatement') {
            for (const stmt of body.body) {
              if (stmt.type === 'ReturnStatement' && stmt.argument) {
                returnExpr = stmt.argument;
                break;
              }
            }
          }
        }

        // If we found a JSX element or fragment as the return value, mark it
        if (returnExpr) {
          if (returnExpr.type === 'JSXElement') {
            mapCallbackElements.add(returnExpr);
          } else if (returnExpr.type === 'JSXFragment') {
            mapCallbackFragments.add(returnExpr);

            // Check if it's a shorthand fragment (<>)
            // Shorthand fragments can't have keys, so suggest using React.Fragment
            context.report({
              node: returnExpr.openingFragment,
              messageId: 'fragmentShouldHaveKey',
            });
          }
        }
      }
    };

    return {
      // Find array.map() calls
      'CallExpression[callee.property.name="map"]'(
        node: TSESTree.CallExpression,
      ) {
        processMapCall(node);
      },

      // Check all JSX elements for key props
      JSXElement(node: TSESTree.JSXElement) {
        // Skip if this is the outermost element in a map callback
        if (mapCallbackElements.has(node)) {
          return;
        }

        // Check if this element has a key prop
        const openingElement = node.openingElement;
        const attributes = openingElement.attributes;

        for (let i = 0; i < attributes.length; i++) {
          const attr = attributes[i];
          if (
            attr.type === 'JSXAttribute' &&
            attr.name.name === 'key' &&
            !reportedAttributes.has(attr)
          ) {
            // Check if this element is nested inside a map callback element or fragment
            let parent = node.parent;
            let isNestedInMapCallback = false;

            while (parent) {
              if (
                (parent.type === 'JSXElement' &&
                  mapCallbackElements.has(parent)) ||
                (parent.type === 'JSXFragment' &&
                  mapCallbackFragments.has(parent))
              ) {
                isNestedInMapCallback = true;
                break;
              }
              parent = parent.parent;
            }

            if (isNestedInMapCallback) {
              // Mark this attribute as reported to avoid duplicate reports
              reportedAttributes.add(attr);

              violations.push({
                attribute: attr,
                elementName: getJSXElementName(openingElement.name),
                removal: removalRangeOf(sourceCode, attr),
              });
            }
          }
        }
      },

      // Handle conditional expressions that might contain map callbacks
      ConditionalExpression(node: TSESTree.ConditionalExpression) {
        // Check both the consequent and alternate branches
        if (
          node.consequent.type === 'CallExpression' &&
          node.consequent.callee.type === 'MemberExpression' &&
          node.consequent.callee.property.type === 'Identifier' &&
          node.consequent.callee.property.name === 'map'
        ) {
          processMapCall(node.consequent);
        }

        if (
          node.alternate.type === 'CallExpression' &&
          node.alternate.callee.type === 'MemberExpression' &&
          node.alternate.callee.property.type === 'Identifier' &&
          node.alternate.callee.property.name === 'map'
        ) {
          processMapCall(node.alternate);
        }
      },

      // Handle logical expressions (&&, ||) that might contain map callbacks
      LogicalExpression(node: TSESTree.LogicalExpression) {
        if (
          node.right.type === 'CallExpression' &&
          node.right.callee.type === 'MemberExpression' &&
          node.right.callee.property.type === 'Identifier' &&
          node.right.callee.property.name === 'map'
        ) {
          processMapCall(node.right);
        }
      },

      /**
       * Emits every held report, each carrying the cleanup its own removal makes
       * necessary.
       *
       * Orphanhood is judged against a single fix's own deletions, never against
       * what sibling reports might also delete: ESLint may discard a sibling
       * (a disable directive, a fix that collided with another rule's), and the
       * key it was going to remove then keeps the binding alive. Keys that
       * jointly hold a binding alive are therefore removed by one fix, which
       * deletes all of them itself rather than assuming its siblings land.
       */
      'Program:exit'() {
        if (violations.length === 0) return;

        const fixable = violations.filter(
          (violation) => !isSuppressed(violation.attribute),
        );

        const plans = new Map<Violation, TextRange[]>();
        for (const batch of batchViolations(sourceCode, fixable)) {
          const plan = planBatch(sourceCode, batch);
          if (!plan) continue;
          for (const violation of batch) {
            plans.set(violation, plan);
          }
        }

        for (const violation of violations) {
          const plan = plans.get(violation);
          context.report({
            node: violation.attribute,
            messageId: 'keyOnlyOutermostElement',
            data: { elementName: violation.elementName },
            ...(plan
              ? {
                  fix: (fixer) =>
                    plan.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    ),
                }
              : {}),
          });
        }
      },
    };
  },
});
