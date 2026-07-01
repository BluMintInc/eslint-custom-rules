import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noFillTemplateMutation';

/**
 * The import path suffix that identifies the Algolia realtime fillTemplate
 * function. Only calls imported from a path ending with this string are
 * tracked, avoiding false positives from the unrelated marketing
 * fillTemplate at src/pages/api/marketing/fillTemplate.ts.
 */
const FILL_TEMPLATE_MODULE_SUFFIX = 'algoliaRealtime/fillTemplate';

/**
 * String methods whose invocation on a fillTemplate result constitutes
 * a structural mutation of the filled filter string.
 */
const MUTATING_STRING_METHODS = new Set([
  'concat',
  'replace',
  'replaceAll',
  'trim',
  'trimStart',
  'trimEnd',
  'trimLeft',
  'trimRight',
  'toLowerCase',
  'toUpperCase',
  'toLocaleLowerCase',
  'toLocaleUpperCase',
  'slice',
  'substring',
  'substr',
  'padStart',
  'padEnd',
  'repeat',
  'normalize',
  'split',
]);

export const noFillTemplateMutation = createRule<[], MessageIds>({
  name: 'no-fill-template-mutation',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow mutating the return value of fillTemplate() via string concatenation, template literals, or string method calls. The filled Algolia filter must be used verbatim so matchesTemplate() can regex-match it; post-fill modification silently breaks realtime hash parity.',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [],
    messages: {
      noFillTemplateMutation:
        'The return value of fillTemplate() must not be modified after the call. String operations (concatenation, template literals, string methods) on a filled filter break matchesTemplate() and cause silent realtime hash parity failures. To add conditions, create a new template variant in REALTIME_PREEMPTIVE_FILTER_TEMPLATES or PREEMPTIVE_FILTER_TEMPLATES instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Local names (possibly aliased) that are bound to the Algolia
     * fillTemplate function in the current file.
     * e.g. `import { fillTemplate as fill }` → fill is tracked.
     */
    const filledFunctionNames = new Set<string>();

    /**
     * Namespace import names whose .fillTemplate property is the tracked
     * function. e.g. `import * as ft` → ft.fillTemplate is tracked.
     */
    const namespaceNames = new Set<string>();

    /**
     * Variable names that hold a direct fillTemplate() call result.
     * e.g. `const f = fillTemplate(...)` → f is a filled variable.
     * Only single-level const/let bindings are tracked; no cross-function
     * data-flow.
     */
    const filledVariables = new Set<string>();

    // ------------------------------------------------------------------ //
    // Helpers
    // ------------------------------------------------------------------ //

    /**
     * Returns true when node is a call to the tracked fillTemplate function,
     * either as a named import (filledFunctionNames) or namespace member
     * (namespaceNames.fillTemplate).
     */
    function isFillTemplateCall(node: TSESTree.Node): boolean {
      if (node.type !== AST_NODE_TYPES.CallExpression) return false;
      const { callee } = node;

      // Direct call: fillTemplate(...)  or aliased: fill(...)
      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        filledFunctionNames.has(callee.name)
      ) {
        return true;
      }

      // Namespace call: ft.fillTemplate(...)
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.object.type === AST_NODE_TYPES.Identifier &&
        namespaceNames.has(callee.object.name) &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === 'fillTemplate'
      ) {
        return true;
      }

      return false;
    }

    /**
     * Returns true when node is either a direct fillTemplate() call or an
     * identifier that holds a single-level fillTemplate() result.
     */
    function isFilledValue(node: TSESTree.Node): boolean {
      if (isFillTemplateCall(node)) return true;
      if (
        node.type === AST_NODE_TYPES.Identifier &&
        filledVariables.has(node.name)
      ) {
        return true;
      }
      return false;
    }

    /**
     * Set of AST nodes that have already been reported to prevent
     * double-reporting when a mutation is both the right-hand side of an
     * AssignmentExpression and a BinaryExpression/TemplateLiteral.
     */
    const reportedNodes = new Set<TSESTree.Node>();

    /**
     * Reports a mutation violation on the given node.
     */
    function report(node: TSESTree.Node) {
      if (reportedNodes.has(node)) return;
      reportedNodes.add(node);
      context.report({ node, messageId: 'noFillTemplateMutation' });
    }

    /**
     * Returns true when a TemplateLiteral node is used solely as an argument
     * to a console method (console.log, console.warn, etc.), which is safe
     * per the spec — logging output is not used as a filter value.
     */
    function isInsideConsoleCall(node: TSESTree.TemplateLiteral): boolean {
      const parent = node.parent;
      if (!parent) return false;
      if (parent.type !== AST_NODE_TYPES.CallExpression) return false;
      const { callee } = parent as TSESTree.CallExpression;
      if (callee.type !== AST_NODE_TYPES.MemberExpression) return false;
      const { object, property } = callee;
      return (
        object.type === AST_NODE_TYPES.Identifier &&
        object.name === 'console' &&
        property.type === AST_NODE_TYPES.Identifier
      );
    }

    /**
     * Checks whether a TemplateLiteral constitutes a mutation of a filled
     * value. A bare `` `${f}` `` with exactly one expression and no
     * surrounding text is considered non-mutating (it is a redundant wrap,
     * not a structural addition). Any template that also contains non-empty
     * quasi (literal text) or additional expressions is flagged.
     */
    function isTemplateLiteralMutation(node: TSESTree.TemplateLiteral): {
      isMutation: boolean;
      filledExprIndex: number;
    } {
      const { expressions, quasis } = node;

      // Find whether any expression is a filled value.
      const filledExprIndices: number[] = [];
      for (let i = 0; i < expressions.length; i++) {
        if (isFilledValue(expressions[i])) {
          filledExprIndices.push(i);
        }
      }

      if (filledExprIndices.length === 0) {
        return { isMutation: false, filledExprIndex: -1 };
      }

      // A bare `${f}` has one expression and all quasis are empty strings.
      if (expressions.length === 1 && quasis.every((q) => q.value.raw === '')) {
        return { isMutation: false, filledExprIndex: -1 };
      }

      // Any other pattern: more than one expression, or at least one quasi
      // with non-empty text → mutation.
      return { isMutation: true, filledExprIndex: filledExprIndices[0] };
    }

    // ------------------------------------------------------------------ //
    // Visitor
    // ------------------------------------------------------------------ //

    return {
      // ---- Import tracking ------------------------------------------- //
      ImportDeclaration(node) {
        const src = String(node.source.value);
        if (!src.endsWith(FILL_TEMPLATE_MODULE_SUFFIX)) return;

        for (const spec of node.specifiers) {
          if (spec.type === AST_NODE_TYPES.ImportSpecifier) {
            // Named import: `import { fillTemplate }` or
            //              `import { fillTemplate as fill }`
            // spec.imported is the exported name; spec.local is the local alias.
            const importedName =
              spec.imported.type === AST_NODE_TYPES.Identifier
                ? spec.imported.name
                : '';
            if (importedName === 'fillTemplate') {
              filledFunctionNames.add(spec.local.name);
            }
          } else if (spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
            // Namespace import: `import * as ft`
            namespaceNames.add(spec.local.name);
          } else if (spec.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
            // Default import of the module itself, treat as fillTemplate
            filledFunctionNames.add(spec.local.name);
          }
        }
      },

      // ---- Variable binding tracking ---------------------------------- //
      VariableDeclarator(node) {
        // Track: const f = fillTemplate(...)
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          node.init &&
          isFillTemplateCall(node.init)
        ) {
          filledVariables.add(node.id.name);
        }
      },

      // ---- Binary expression: + / += ---------------------------------- //
      BinaryExpression(node) {
        if (node.operator !== '+') return;
        if (!isFilledValue(node.left) && !isFilledValue(node.right)) return;

        // When this BinaryExpression is the right-hand side of a `=`
        // assignment to a tracked variable, the AssignmentExpression visitor
        // handles the report to prevent double errors.
        const parent = node.parent;
        if (
          parent &&
          parent.type === AST_NODE_TYPES.AssignmentExpression &&
          parent.operator === '=' &&
          parent.right === node &&
          parent.left.type === AST_NODE_TYPES.Identifier &&
          filledVariables.has(parent.left.name)
        ) {
          return;
        }

        report(node);
      },

      // ---- Assignment expression: +=, and reassignment with + --------- //
      AssignmentExpression(node) {
        if (node.operator === '+=') {
          // `f += '...'` — left must be a filled variable
          if (
            node.left.type === AST_NODE_TYPES.Identifier &&
            filledVariables.has(node.left.name)
          ) {
            report(node);
          }
          return;
        }

        if (node.operator === '=') {
          // `f = f + '...'` or `f = \`${f}...\``
          if (
            node.left.type === AST_NODE_TYPES.Identifier &&
            filledVariables.has(node.left.name)
          ) {
            // Right side is a BinaryExpression involving the variable
            if (
              node.right.type === AST_NODE_TYPES.BinaryExpression &&
              node.right.operator === '+' &&
              (isFilledValue(node.right.left) ||
                isFilledValue(node.right.right))
            ) {
              report(node);
              return;
            }
            // Right side is a TemplateLiteral involving the variable
            if (node.right.type === AST_NODE_TYPES.TemplateLiteral) {
              const { isMutation } = isTemplateLiteralMutation(node.right);
              if (isMutation) {
                report(node);
              }
            }
          }
        }
      },

      // ---- Template literals ------------------------------------------ //
      TemplateLiteral(node) {
        // Template literals used solely for console output are safe.
        if (isInsideConsoleCall(node)) return;

        const { isMutation } = isTemplateLiteralMutation(node);
        if (!isMutation) return;

        // When this template literal is the right-hand side of an assignment
        // to a tracked variable, the AssignmentExpression visitor reports it
        // to avoid duplicate errors. Suppress here in that case.
        const parent = node.parent;
        if (
          parent &&
          parent.type === AST_NODE_TYPES.AssignmentExpression &&
          parent.operator === '=' &&
          parent.right === node &&
          parent.left.type === AST_NODE_TYPES.Identifier &&
          filledVariables.has(parent.left.name)
        ) {
          return;
        }

        report(node);
      },

      // ---- String method calls ---------------------------------------- //
      CallExpression(node) {
        if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return;
        const { object, property, computed } = node.callee;
        if (computed) return;
        if (property.type !== AST_NODE_TYPES.Identifier) return;
        if (!MUTATING_STRING_METHODS.has(property.name)) return;

        // object is a filled value → mutation
        if (isFilledValue(object)) {
          report(node);
        }
      },

      // ---- Array.join on arrays of filled values ----------------------- //
      // Tracked via CallExpression: array.join(separator)
      // We detect `[...].join(...)` where any element is a filled value.
      // We also detect variables bound to arrays of filled values via map.
      // (Simple cases: literal array in the join call.)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      'CallExpression[callee.property.name="join"]'(
        node: TSESTree.CallExpression,
      ) {
        const callee = node.callee as TSESTree.MemberExpression;
        const obj = callee.object;
        if (obj.type === AST_NODE_TYPES.ArrayExpression) {
          const hasFilledElement = obj.elements.some(
            (el) => el !== null && isFilledValue(el),
          );
          if (hasFilledElement) {
            report(node);
          }
        }
      },
    };
  },
});
