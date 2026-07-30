import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

export const RULE_NAME = 'require-dynamic-firebase-imports';

/**
 * A specifier is erased at compile time when either the whole statement is an
 * `import type` or the specifier carries an inline `type` marker. Only such a
 * specifier is interchangeable with the `import type` the fixer hoists.
 */
const isErasableTypeSpecifier = (
  declaration: TSESTree.ImportDeclaration,
  specifier: TSESTree.ImportSpecifier,
): boolean =>
  declaration.importKind === 'type' || specifier.importKind === 'type';

/**
 * Whether `specifier` binds the same local name to the same export of
 * `importSource` in type position as `target` — i.e. whether it is exactly the
 * binding the hoisted `import type` would introduce.
 */
const bindsSameTypeImport = (
  specifier: TSESTree.Node,
  target: TSESTree.ImportSpecifier,
  importSource: string,
): boolean => {
  if (
    specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
    specifier.local.name !== target.local.name ||
    specifier.imported.name !== target.imported.name
  ) {
    return false;
  }
  const declaration = specifier.parent;
  return (
    declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
    declaration.source.value === importSource &&
    isErasableTypeSpecifier(declaration, specifier)
  );
};

/**
 * Read the module-scope import state off `Program.body` rather than a traversal
 * flag: `--fix` runs multiple passes, and a sibling report in an earlier pass may
 * already have hoisted the same `import type`. A flag set by the
 * `ImportDeclaration` visitor also depends on source order, so it would be stale
 * for any import that precedes the one being rewritten.
 */
const findHoistedTypeImport = (
  program: TSESTree.Program,
  target: TSESTree.ImportSpecifier,
  importSource: string,
): TSESTree.ImportSpecifier | undefined => {
  for (const statement of program.body) {
    if (statement.type !== AST_NODE_TYPES.ImportDeclaration) {
      continue;
    }
    const match = statement.specifiers.find((specifier) =>
      bindsSameTypeImport(specifier, target, importSource),
    );
    if (match) {
      return match as TSESTree.ImportSpecifier;
    }
  }
  return undefined;
};

/**
 * The binding that makes hoisting `target` unsafe, or `null` when the name is
 * free (or already bound to the very import being hoisted).
 *
 * Resolution walks the scope chain of the rewritten import instead of stopping
 * at module scope, because a narrower shadow raises no TypeScript diagnostic yet
 * silently binds the hoisted type to the wrong declaration. Each hop resolves a
 * single step further up: the rewritten statement binds its own inline `type`
 * specifier in the enclosing function scope, which would otherwise mask the
 * colliding declaration above it. Bindings without a definition are ambient
 * (TypeScript lib types, configured globals); a module-scope import legally
 * shadows those, so they are not collisions.
 */
const findCollidingBinding = (
  scope: TSESLint.Scope.Scope,
  target: TSESTree.ImportSpecifier,
  importSource: string,
): TSESLint.Scope.Variable | null => {
  let current: TSESLint.Scope.Scope | null = scope;
  while (current) {
    const existing = ASTHelpers.findVariableInScope(current, target.local.name);
    if (!existing) {
      return null;
    }
    if (existing.defs.length > 0) {
      const bindsTheDesiredImport = existing.defs.every((def) =>
        bindsSameTypeImport(def.node, target, importSource),
      );
      if (!bindsTheDesiredImport) {
        return existing;
      }
    }
    current = existing.scope.upper;
  }
  return null;
};

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

            // Type specifiers must not travel into the runtime destructuring:
            // they have no runtime value, and dropping the `type` marker turns
            // type references into dangling value bindings. They hoist into a
            // static `import type` at module scope, which is erased at compile
            // time.
            const scope = ASTHelpers.getScope(context, node);
            const program = context.getSourceCode().ast;
            const specifiersToHoist: TSESTree.ImportSpecifier[] = [];

            for (const specifier of typeSpecifiers) {
              if (findCollidingBinding(scope, specifier, importSource)) {
                // Declining the whole fix keeps the file compiling: applying
                // the dynamic import while skipping a colliding hoist would
                // strand the type reference (TS2749) instead of duplicating an
                // identifier (TS2440/TS2300). The report stands so the author
                // resolves the name clash deliberately.
                return null;
              }
              if (!findHoistedTypeImport(program, specifier, importSource)) {
                specifiersToHoist.push(specifier);
              }
            }

            const fixes = [
              fixer.replaceText(
                node,
                buildDynamicImport(importSource, valueSpecifiers),
              ),
            ];
            if (specifiersToHoist.length > 0) {
              fixes.push(
                fixer.insertTextBeforeRange(
                  [0, 0],
                  buildStaticTypeImport(importSource, specifiersToHoist),
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
