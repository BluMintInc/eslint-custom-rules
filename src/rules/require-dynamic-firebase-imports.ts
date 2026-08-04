import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'require-dynamic-firebase-imports';

export default createRule({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce dynamic imports for Firebase dependencies',
      recommended: 'error',
    },
    schema: [],
    messages: {
      requireDynamicImport:
        'Static Firebase import from "{{importSource}}" keeps the Firebase SDK in the initial bundle and blocks route-level code splitting. Use an `await import(\'{{importSource}}\')` dynamic import so Firebase loads only on the code path that needs it; type-only imports remain allowed.',
    },
  },
  defaultOptions: [],
  create(context) {
    const isFirebaseImport = (source: string): boolean => {
      return (
        source.startsWith('firebase/') ||
        source.includes('config/firebase-client')
      );
    };

    const isTypeOnlySpecifier = (
      spec: TSESTree.ImportClause,
    ): spec is TSESTree.ImportSpecifier =>
      spec.type === AST_NODE_TYPES.ImportSpecifier &&
      spec.importKind === 'type';

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importSource = node.source.value;

        if (
          typeof importSource !== 'string' ||
          !isFirebaseImport(importSource)
        ) {
          return;
        }

        // `import type` statements are erased at compile time, so they add no
        // bundle weight — and a dynamic import cannot supply types anyway.
        if (node.importKind === 'type') {
          return;
        }

        const valueSpecifiers = node.specifiers.filter(
          (spec) => !isTypeOnlySpecifier(spec),
        );

        // Inline `type` markers on every specifier make the whole statement
        // erasable, exactly like `import type` — nothing to report.
        if (node.specifiers.length > 0 && valueSpecifiers.length === 0) {
          return;
        }

        // The rule is report-only. A static `import` declaration is legal only
        // at the top level of a module or namespace, so every reported site is
        // at module scope, where the `await import()` replacement would
        // introduce top-level await — silently converting a synchronous module
        // into an async one and breaking build targets that lack it. The
        // author must instead move the import into the async code path that
        // needs it, which is a restructuring no autofix can make safely.
        context.report({
          node,
          messageId: 'requireDynamicImport',
          data: { importSource },
        });
      },
    };
  },
});
