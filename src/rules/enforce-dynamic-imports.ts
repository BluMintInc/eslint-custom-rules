import { createRule } from '../utils/createRule';

export const RULE_NAME = 'enforce-dynamic-imports';

type Options = [
  {
    libraries: string[];
    allowImportType?: boolean;
  },
];

export default createRule<Options, 'dynamicImportRequired'>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce dynamic imports for specified libraries to optimize bundle size',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          libraries: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          allowImportType: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      dynamicImportRequired:
        'Static imports from "{{source}}" are not allowed to reduce initial bundle size. Use dynamic imports instead: const Component = useDynamic(() => import("{{source}}").then(mod => mod.Component))',
    },
  },
  defaultOptions: [
    {
      libraries: ['@stream-io/video-react-sdk'],
      allowImportType: true,
    },
  ],
  create(context, [options]) {
    const { libraries, allowImportType = true } = options;

    // Check if the import source matches any of the specified libraries
    const isLibraryMatch = (source: string): boolean => {
      return libraries.some((lib) => {
        // Simple glob pattern matching
        if (lib.includes('*')) {
          const pattern = lib.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}$`);
          return regex.test(source);
        }
        return source === lib;
      });
    };

    return {
      ImportDeclaration(node) {
        const importSource = node.source.value as string;

        // Skip type-only imports if allowed
        if (allowImportType) {
          // Check if it's a type-only import declaration
          if (node.importKind === 'type') {
            return;
          }

          // Check if all specifiers are type imports
          if (
            node.specifiers.length > 0 &&
            node.specifiers.every(
              (spec) =>
                spec.type === 'ImportSpecifier' && spec.importKind === 'type',
            )
          ) {
            return;
          }
        }

        // Check if the import is from a library that should be dynamically imported
        if (typeof importSource === 'string' && isLibraryMatch(importSource)) {
          context.report({
            node,
            messageId: 'dynamicImportRequired',
            data: {
              source: importSource,
            },
          });
        }
      },
    };
  },
});
