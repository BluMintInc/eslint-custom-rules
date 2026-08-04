import { createRule } from '../utils/createRule';

type Options = [];
type MessageIds = 'useCustomLink';

const LINK_MODULE_PATH = 'src/components/Link';

/**
 * MUI's documented Next.js integration names the component that adapts
 * `next/link` for the wrapper `NextLinkComposed`, and `src/components/Link`
 * renders it. Keying on the basename alone — rather than a full path — matches
 * wherever the integration component is colocated.
 */
const INTEGRATION_COMPONENT = 'NextLinkComposed';

const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx)$/;

/**
 * The two modules that implement the wrapper are the ones that must keep
 * importing `next/link`: `src/components/Link` is the module the fixer points
 * every other import at, and it renders `NextLinkComposed`. Rewriting either
 * one manufactures a cycle — `Link` importing itself, or
 * `Link → NextLinkComposed → Link` — so the wrapper evaluates circularly and
 * every consumer of it breaks.
 *
 * The linted path is matched by suffix because it reaches the rule in whatever
 * form the caller used — absolute (`/repo/src/components/Link.tsx`) or
 * project-relative (`src/components/Link.tsx`). The suffix has to land on a
 * path-segment boundary, otherwise `notsrc/components/Link.tsx` — an unrelated
 * module — would be exempted too, and the integration component is matched by
 * basename equality so that `MyNextLinkComposed.tsx` stays reportable.
 */
const isWrapperImplementation = (filename: string): boolean => {
  const normalized = filename.replace(/\\/g, '/').replace(SOURCE_EXTENSION, '');
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (basename === INTEGRATION_COMPONENT) {
    return true;
  }
  if (!normalized.endsWith(LINK_MODULE_PATH)) {
    return false;
  }
  const suffixStart = normalized.length - LINK_MODULE_PATH.length;
  return suffixStart === 0 || normalized[suffixStart - 1] === '/';
};

export const useCustomLink = createRule<Options, MessageIds>({
  name: 'use-custom-link',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce using src/components/Link instead of next/link',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useCustomLink:
        'Import "{{localName}}" from src/components/Link instead of next/link. The custom Link wraps Next.js navigation with design system defaults and analytics hooks; importing next/link bypasses those wrappers and leads to inconsistent styling and missing instrumentation. Replace the import source with src/components/Link so routing uses the shared wrapper.',
    },
  },
  defaultOptions: [],
  create(context) {
    // A processor hands the rule a virtual filename for an extracted code block;
    // the physical path is the one that identifies the module on disk.
    const filename = context.getPhysicalFilename
      ? context.getPhysicalFilename()
      : context.getFilename();
    if (isWrapperImplementation(filename)) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/link') {
          const importSpecifiers = node.specifiers;

          // Handle different import types (default, named, namespace)
          const defaultSpecifier = importSpecifiers.find(
            (specifier) => specifier.type === 'ImportDefaultSpecifier',
          );

          const defaultAsSpecifier = importSpecifiers.find(
            (specifier) =>
              specifier.type === 'ImportSpecifier' &&
              specifier.imported.name === 'default',
          );

          if (defaultSpecifier || defaultAsSpecifier) {
            context.report({
              node,
              messageId: 'useCustomLink',
              data: {
                localName:
                  defaultSpecifier?.local?.name ||
                  defaultAsSpecifier?.local?.name ||
                  'Link',
              },
              fix(fixer) {
                // Get the local name of the imported Link component
                const localName =
                  defaultSpecifier?.local?.name ||
                  defaultAsSpecifier?.local?.name ||
                  'Link';

                // Create the new import statement
                const newImport = `import ${localName} from '${LINK_MODULE_PATH}';`;

                return fixer.replaceText(node, newImport);
              },
            });
          }
        }
      },
    };
  },
});
