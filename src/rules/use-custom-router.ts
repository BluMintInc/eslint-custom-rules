import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useCustomRouter';

const ROUTER_MODULE_PATH = 'src/hooks/routing/useRouter';

const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx)$/;

/**
 * The module the fixer points every `useRouter` import at is the one module that
 * must keep importing `useRouter` from `next/router`: rewriting it makes it
 * import itself, and a self-import evaluates circularly, so the wrapper exports
 * `undefined` and every consumer of it breaks.
 *
 * The linted path is matched by suffix because it reaches the rule in whatever
 * form the caller used — absolute (`/repo/src/hooks/routing/useRouter.ts`) or
 * project-relative (`src/hooks/routing/useRouter.ts`). The suffix has to land on
 * a path-segment boundary, otherwise `notsrc/hooks/routing/useRouter.ts` — an
 * unrelated module — would be exempted too.
 */
const isRouterModule = (filename: string): boolean => {
  const normalized = filename.replace(/\\/g, '/').replace(SOURCE_EXTENSION, '');
  if (!normalized.endsWith(ROUTER_MODULE_PATH)) {
    return false;
  }
  const suffixStart = normalized.length - ROUTER_MODULE_PATH.length;
  return suffixStart === 0 || normalized[suffixStart - 1] === '/';
};

export const useCustomRouter = createRule<[], MessageIds>({
  name: 'use-custom-router',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using src/hooks/routing/useRouter instead of next/router',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useCustomRouter:
        'useRouter import "{{imports}}" comes from next/router, which bypasses the app-specific hook that applies auth checks, analytics, and redirect helpers. Import it from src/hooks/routing/useRouter so routing code stays consistent with the rest of the app.',
    },
  },
  defaultOptions: [],
  create(context) {
    // A processor hands the rule a virtual filename for an extracted code block;
    // the physical path is the one that identifies the module on disk.
    const filename = context.getPhysicalFilename
      ? context.getPhysicalFilename()
      : context.getFilename();
    if (isRouterModule(filename)) {
      return {};
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.source.value === 'next/router') {
          const specifiers = node.specifiers.filter(
            (specifier): specifier is TSESTree.ImportSpecifier =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'useRouter',
          );

          if (specifiers.length > 0) {
            context.report({
              node,
              messageId: 'useCustomRouter',
              data: {
                imports: specifiers
                  .map((specifier) => specifier.local.name)
                  .join(', '),
              },
              fix(fixer) {
                // If there are other imports from next/router, keep them
                const otherSpecifiers = node.specifiers.filter(
                  (specifier): specifier is TSESTree.ImportSpecifier =>
                    specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
                    (specifier.imported.type === AST_NODE_TYPES.Identifier &&
                      specifier.imported.name !== 'useRouter'),
                );

                if (otherSpecifiers.length === 0) {
                  // If useRouter is the only import, replace the entire import
                  return fixer.replaceText(
                    node,
                    `import { ${specifiers
                      .map((s) =>
                        s.local.name !== s.imported.name
                          ? `useRouter as ${s.local.name}`
                          : 'useRouter',
                      )
                      .join(', ')} } from '${ROUTER_MODULE_PATH}';`,
                  );
                } else {
                  // Create a new import for useRouter and keep other imports
                  const useRouterImport = `import { ${specifiers
                    .map((s) =>
                      s.local.name !== s.imported.name
                        ? `useRouter as ${s.local.name}`
                        : 'useRouter',
                    )
                    .join(', ')} } from '${ROUTER_MODULE_PATH}';\n`;

                  const otherImports = `import { ${otherSpecifiers
                    .map((s) => s.local.name)
                    .join(', ')} } from 'next/router';`;

                  return fixer.replaceText(
                    node,
                    useRouterImport + otherImports,
                  );
                }
              },
            });
          }
        }
      },
    };
  },
});
