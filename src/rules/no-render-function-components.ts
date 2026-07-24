import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'renderFunctionComponent';

type RuleOptions = {
  renderPropNames?: string[];
  allowNames?: string[];
};

type Options = [RuleOptions?];

/**
 * Slot names that legitimately consume a `render*` callback BY REFERENCE.
 * These belong to external libraries (MUI DataGrid `renderCell`, Autocomplete
 * `renderInput`/`renderOption`, Algolia widgets' `render`, etc.) that invoke the
 * callback themselves. Passing a function into one of these slots is NOT the
 * anti-pattern this rule targets, so those wirings are exempt. The list is
 * always applied; user-provided `renderPropNames` are added to (not replaced),
 * so custom library slots can be exempted without losing the defaults.
 */
const DEFAULT_RENDER_PROP_NAMES = [
  'renderCell',
  'renderHeader',
  'renderValue',
  'renderInput',
  'renderOption',
  'renderTags',
  'renderGroup',
  'render',
];

/**
 * Array iteration methods that accept a callback. Passing a `render*` function
 * BY REFERENCE into one of these (e.g. `items.map(renderItem)`) consumes it as a
 * plain function, which is the anti-pattern: the returned JSX is inlined instead
 * of mounting as its own component.
 */
const ARRAY_ITERATION_METHODS = new Set([
  'map',
  'flatMap',
  'forEach',
  'reduce',
  'reduceRight',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'some',
  'every',
]);

// Literal `render` prefix followed by an uppercase letter. Deliberately excludes
// bare `render`, `renderer`/`rendered` (lowercase continuation), PascalCase
// `Render*` (require-memo's domain), and `useRender*` hooks (no-jsx-in-hooks').
const RENDER_FN_NAME = /^render[A-Z]/;

type FunctionLikeInit =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression;

function isFunctionLikeInit(node: TSESTree.Node): node is FunctionLikeInit {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

function getJsxAttributeName(
  name: TSESTree.JSXIdentifier | TSESTree.JSXNamespacedName,
): string | null {
  if (name.type === AST_NODE_TYPES.JSXIdentifier) {
    return name.name;
  }
  return null;
}

export const noRenderFunctionComponents = createRule<Options, MessageIds>({
  name: 'no-render-function-components',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow declaring a local `render*` function that returns JSX and consuming it as a plain function (direct call or array-iteration callback); author it as a real component rendered with JSX instead',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          renderPropNames: {
            type: 'array',
            items: { type: 'string' },
          },
          allowNames: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      renderFunctionComponent:
        'Local function "{{name}}" returns JSX and is consumed as a plain function (called directly or passed to an array method like .map). ' +
        'A function that takes inputs and returns JSX IS a React component, so it should be a PascalCase functional component rendered as JSX (e.g. <{{suggestion}} {...props} />), not invoked like a helper. ' +
        'Calling it directly forfeits React reconciliation and key semantics, isolated hook scope, a memoization boundary, and DevTools visibility — the elements are inlined into the parent instead of mounting as their own component. ' +
        'Extract "{{name}}" into a real component named "{{suggestion}}" and render it with JSX.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const userRenderPropNames = options?.renderPropNames ?? [];
    const renderPropNames = new Set([
      ...DEFAULT_RENDER_PROP_NAMES,
      ...userRenderPropNames,
    ]);
    const allowNamePatterns = (options?.allowNames ?? []).map(
      (pattern) => new RegExp(pattern),
    );

    type Candidate = {
      name: string;
      reportNode: TSESTree.Node;
      variable: TSESLint.Scope.Variable | null;
      isExported: boolean;
    };
    const candidates: Candidate[] = [];

    function isAllowed(name: string): boolean {
      return allowNamePatterns.some((pattern) => pattern.test(name));
    }

    function findVariable(
      node: TSESTree.Node,
      name: string,
    ): TSESLint.Scope.Variable | null {
      const declared = ASTHelpers.getDeclaredVariables(context, node);
      return declared.find((variable) => variable.name === name) ?? null;
    }

    // A plain function invocation: renderFoo(...) where the identifier is the callee.
    function isDirectCall(id: TSESTree.Identifier): boolean {
      const parent = id.parent;
      return (
        !!parent &&
        parent.type === AST_NODE_TYPES.CallExpression &&
        parent.callee === id
      );
    }

    // A by-reference pass into an array-iteration method: arr.map(renderFoo).
    function isArrayIterationPass(id: TSESTree.Identifier): boolean {
      const parent = id.parent;
      if (!parent || parent.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }
      if (!parent.arguments.includes(id)) {
        return false;
      }
      const callee = parent.callee;
      if (
        callee.type !== AST_NODE_TYPES.MemberExpression ||
        callee.computed ||
        callee.property.type !== AST_NODE_TYPES.Identifier
      ) {
        return false;
      }
      return ARRAY_ITERATION_METHODS.has(callee.property.name);
    }

    // A by-reference pass into a render-prop slot: <X renderCell={renderFoo} />
    // or { renderCell: renderFoo }. The exemption anchors on the slot name, not
    // the function's own name.
    function isRenderPropSlotReference(id: TSESTree.Identifier): boolean {
      const parent = id.parent;
      if (!parent) {
        return false;
      }

      if (parent.type === AST_NODE_TYPES.JSXExpressionContainer) {
        const attribute = parent.parent;
        if (
          attribute &&
          attribute.type === AST_NODE_TYPES.JSXAttribute &&
          attribute.value === parent
        ) {
          const attrName = getJsxAttributeName(attribute.name);
          if (attrName && renderPropNames.has(attrName)) {
            return true;
          }
        }
      }

      if (parent.type === AST_NODE_TYPES.Property && parent.value === id) {
        const key = parent.key;
        let keyName: string | null = null;
        if (!parent.computed && key.type === AST_NODE_TYPES.Identifier) {
          keyName = key.name;
        } else if (
          key.type === AST_NODE_TYPES.Literal &&
          typeof key.value === 'string'
        ) {
          keyName = key.value;
        }
        if (keyName && renderPropNames.has(keyName)) {
          return true;
        }
      }

      return false;
    }

    function isExportSpecifierReference(id: TSESTree.Identifier): boolean {
      const parent = id.parent;
      return !!parent && parent.type === AST_NODE_TYPES.ExportSpecifier;
    }

    return {
      VariableDeclarator(node) {
        if (node.id.type !== AST_NODE_TYPES.Identifier) {
          return;
        }
        const name = node.id.name;
        if (!RENDER_FN_NAME.test(name) || isAllowed(name)) {
          return;
        }
        if (!node.init) {
          return;
        }
        const init = ASTHelpers.unwrapTSAssertions(node.init);
        if (!isFunctionLikeInit(init)) {
          return;
        }
        if (!ASTHelpers.returnsJSX(init, context)) {
          return;
        }

        const declaration = node.parent;
        const isExported =
          !!declaration &&
          declaration.type === AST_NODE_TYPES.VariableDeclaration &&
          !!declaration.parent &&
          (declaration.parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
            declaration.parent.type ===
              AST_NODE_TYPES.ExportDefaultDeclaration);

        candidates.push({
          name,
          reportNode: node.id,
          variable: findVariable(node, name),
          isExported,
        });
      },

      FunctionDeclaration(node) {
        if (!node.id) {
          return;
        }
        const name = node.id.name;
        if (!RENDER_FN_NAME.test(name) || isAllowed(name)) {
          return;
        }
        if (!ASTHelpers.returnsJSX(node, context)) {
          return;
        }

        const isExported =
          !!node.parent &&
          (node.parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
            node.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration);

        candidates.push({
          name,
          reportNode: node.id,
          variable: findVariable(node, name),
          isExported,
        });
      },

      'Program:exit'() {
        for (const candidate of candidates) {
          const references = candidate.variable
            ? candidate.variable.references
            : [];

          let hasViolatingConsumption = false;
          let isWiredToSlot = false;
          let exportedViaSpecifier = false;

          for (const reference of references) {
            // Skip the declaration write and any reassignments — only reads are
            // consumption sites.
            if (typeof reference.isRead === 'function' && !reference.isRead()) {
              continue;
            }
            const id = reference.identifier as TSESTree.Identifier;

            if (isDirectCall(id) || isArrayIterationPass(id)) {
              hasViolatingConsumption = true;
              continue;
            }
            if (isRenderPropSlotReference(id)) {
              isWiredToSlot = true;
              continue;
            }
            if (isExportSpecifierReference(id)) {
              exportedViaSpecifier = true;
              continue;
            }
          }

          const isExported = candidate.isExported || exportedViaSpecifier;
          const shouldFlag =
            hasViolatingConsumption || (isExported && !isWiredToSlot);

          if (shouldFlag) {
            context.report({
              node: candidate.reportNode,
              messageId: 'renderFunctionComponent',
              data: {
                name: candidate.name,
                suggestion: candidate.name.slice('render'.length),
              },
            });
          }
        }
      },
    };
  },
});
