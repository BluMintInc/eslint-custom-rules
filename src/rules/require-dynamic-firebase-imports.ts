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
    fixable: 'code',
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

    /**
     * `await import()` is only valid inside an async function. Rewriting a
     * module-scope import would introduce top-level await, silently converting
     * a synchronous module into an async one (and failing outright on build
     * targets without top-level await support) — so those sites are reported
     * without a fix.
     */
    const isInsideAsyncFunction = (node: TSESTree.Node): boolean => {
      let current = node.parent;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          // The nearest enclosing function decides await validity; an async
          // ancestor beyond a sync function cannot host the await.
          return current.async;
        }
        current = current.parent;
      }
      return false;
    };

    const isTypeOnlySpecifier = (
      spec: TSESTree.ImportClause,
    ): spec is TSESTree.ImportSpecifier =>
      spec.type === AST_NODE_TYPES.ImportSpecifier &&
      spec.importKind === 'type';

    const buildDynamicImport = (
      importSource: string,
      valueSpecifiers: TSESTree.ImportClause[],
    ): string => {
      if (valueSpecifiers.length === 0) {
        // Side-effect imports have no bindings to destructure.
        return `await import('${importSource}');`;
      }

      const namespaceSpecifier = valueSpecifiers.find(
        (spec): spec is TSESTree.ImportNamespaceSpecifier =>
          spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
      );
      const defaultSpecifier = valueSpecifiers.find(
        (spec): spec is TSESTree.ImportDefaultSpecifier =>
          spec.type === AST_NODE_TYPES.ImportDefaultSpecifier,
      );
      const namedSpecifiers = valueSpecifiers.filter(
        (spec): spec is TSESTree.ImportSpecifier =>
          spec.type === AST_NODE_TYPES.ImportSpecifier,
      );

      if (namespaceSpecifier) {
        // The promise resolved by `import()` IS the module namespace object,
        // so the `* as ns` binding maps directly onto it.
        const namespaceDeclaration = `const ${namespaceSpecifier.local.name} = await import('${importSource}');`;
        if (defaultSpecifier) {
          return `${namespaceDeclaration} const ${defaultSpecifier.local.name} = ${namespaceSpecifier.local.name}.default;`;
        }
        return namespaceDeclaration;
      }

      const destructuredNames = namedSpecifiers.map((spec) =>
        spec.imported.name === spec.local.name
          ? spec.local.name
          : `${spec.imported.name}: ${spec.local.name}`,
      );

      if (defaultSpecifier) {
        if (destructuredNames.length === 0) {
          return `const ${defaultSpecifier.local.name} = (await import('${importSource}')).default;`;
        }
        // The namespace object exposes the default export under `default`.
        return `const { default: ${
          defaultSpecifier.local.name
        }, ${destructuredNames.join(
          ', ',
        )} } = await import('${importSource}');`;
      }

      return `const { ${destructuredNames.join(
        ', ',
      )} } = await import('${importSource}');`;
    };

    const buildStaticTypeImport = (
      importSource: string,
      typeSpecifiers: TSESTree.ImportSpecifier[],
    ): string => {
      const names = typeSpecifiers.map((spec) =>
        spec.imported.name === spec.local.name
          ? spec.local.name
          : `${spec.imported.name} as ${spec.local.name}`,
      );
      return `import type { ${names.join(', ')} } from '${importSource}';\n`;
    };

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

        const typeSpecifiers = node.specifiers.filter(isTypeOnlySpecifier);
        const valueSpecifiers = node.specifiers.filter(
          (spec) => !isTypeOnlySpecifier(spec),
        );

        // Inline `type` markers on every specifier make the whole statement
        // erasable, exactly like `import type` — nothing to report.
        if (node.specifiers.length > 0 && valueSpecifiers.length === 0) {
          return;
        }

        context.report({
          node,
          messageId: 'requireDynamicImport',
          data: { importSource },
          fix(fixer) {
            if (!isInsideAsyncFunction(node)) {
              return null;
            }
            const fixes = [
              fixer.replaceText(
                node,
                buildDynamicImport(importSource, valueSpecifiers),
              ),
            ];
            if (typeSpecifiers.length > 0) {
              // Type specifiers must not travel into the runtime
              // destructuring: they have no runtime value, and dropping the
              // `type` marker turns type references into dangling value
              // bindings. Hoist them into a static `import type` at module
              // scope, which is erased at compile time.
              fixes.push(
                fixer.insertTextBeforeRange(
                  [0, 0],
                  buildStaticTypeImport(importSource, typeSpecifiers),
                ),
              );
            }
            return fixes;
          },
        });
      },
    };
  },
});
