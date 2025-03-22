import { TSESTree } from '@typescript-eslint/utils';
import path from 'path';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-restricted-imports-dynamic';

type Options = [
  | {
      paths?: (
        | string
        | {
            name: string;
            message?: string;
            allowTypeImports?: boolean;
            allowDynamicImports?: boolean;
          }
      )[];
      patterns?: (
        | string
        | {
            group: string[];
            message?: string;
            caseSensitive?: boolean;
            allowTypeImports?: boolean;
            allowDynamicImports?: boolean;
          }
      )[];
    }
  | (
      | string
      | {
          name: string;
          message?: string;
          allowTypeImports?: boolean;
          allowDynamicImports?: boolean;
        }
    )[]
];

export default createRule<
  Options,
  'restrictedImport' | 'restrictedImportPattern'
>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow specified modules when loaded by `import`, with special handling for .dynamic.tsx files',
      recommended: 'error',
    },
    schema: [
      {
        oneOf: [
          {
            type: 'object',
            properties: {
              paths: {
                type: 'array',
                items: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        message: { type: 'string' },
                        allowTypeImports: { type: 'boolean' },
                        allowDynamicImports: { type: 'boolean' },
                      },
                      additionalProperties: false,
                      required: ['name'],
                    },
                  ],
                },
              },
              patterns: {
                type: 'array',
                items: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'object',
                      properties: {
                        group: {
                          type: 'array',
                          items: { type: 'string' },
                          minItems: 1,
                        },
                        message: { type: 'string' },
                        caseSensitive: { type: 'boolean' },
                        allowTypeImports: { type: 'boolean' },
                        allowDynamicImports: { type: 'boolean' },
                      },
                      additionalProperties: false,
                      required: ['group'],
                    },
                  ],
                },
              },
            },
            additionalProperties: false,
          },
          {
            type: 'array',
            items: {
              oneOf: [
                { type: 'string' },
                {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    message: { type: 'string' },
                    allowTypeImports: { type: 'boolean' },
                    allowDynamicImports: { type: 'boolean' },
                  },
                  additionalProperties: false,
                  required: ['name'],
                },
              ],
            },
          },
        ],
      },
    ],
    messages: {
      restrictedImport:
        "import '{{importSource}}' is restricted from being used{{customMessage}}",
      restrictedImportPattern:
        "import '{{importSource}}' is restricted from being used by a pattern{{customMessage}}",
    },
  },
  defaultOptions: [{ paths: [], patterns: [] }],
  create(context, [options]) {
    // Get the file path and name
    const filePath = context.getFilename();
    const fileName = path.basename(filePath);

    // Check if the file has .dynamic.ts or .dynamic.tsx extension
    const isDynamicFile = /\.dynamic\.tsx?$/.test(fileName);

    // If this is a dynamic file, we'll allow imports from other dynamic files
    if (isDynamicFile) {
      return {};
    }

    // Process options
    const restrictedPaths: {
      name: string;
      message?: string;
      allowTypeImports?: boolean;
      allowDynamicImports?: boolean;
    }[] = [];
    const restrictedPatterns: {
      group: string[];
      message?: string;
      caseSensitive?: boolean;
      allowTypeImports?: boolean;
      allowDynamicImports?: boolean;
    }[] = [];

    if (Array.isArray(options)) {
      // Handle array format
      for (const item of options) {
        if (typeof item === 'string') {
          restrictedPaths.push({ name: item });
        } else {
          restrictedPaths.push(item);
        }
      }
    } else if (options && typeof options === 'object') {
      // Handle object format
      if (options.paths) {
        for (const item of options.paths) {
          if (typeof item === 'string') {
            restrictedPaths.push({ name: item });
          } else {
            restrictedPaths.push(item);
          }
        }
      }

      if (options.patterns) {
        for (const item of options.patterns) {
          if (typeof item === 'string') {
            restrictedPatterns.push({ group: [item] });
          } else {
            restrictedPatterns.push(item);
          }
        }
      }
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importSource = node.source.value as string;
        const importKind = node.importKind;

        // Check against restricted paths
        for (const restrictedPath of restrictedPaths) {
          if (importSource === restrictedPath.name) {
            // Skip if it's a type import and type imports are allowed
            if (
              importKind === 'type' &&
              restrictedPath.allowTypeImports === true
            ) {
              continue;
            }

            // Skip if it's a dynamic import and dynamic imports are allowed
            if (
              importSource.endsWith('.dynamic') &&
              restrictedPath.allowDynamicImports === true
            ) {
              continue;
            }

            context.report({
              node,
              messageId: 'restrictedImport',
              data: {
                importSource,
                customMessage: restrictedPath.message
                  ? `: ${restrictedPath.message}`
                  : '',
              },
            });
          }
        }

        // Check against restricted patterns
        for (const restrictedPattern of restrictedPatterns) {
          const { group, caseSensitive = false } = restrictedPattern;
          const matched = group.some((pattern) => {
            if (pattern.includes('*')) {
              const regex = new RegExp(
                `^${pattern.replace(/\*/g, '.*')}$`,
                caseSensitive ? '' : 'i'
              );
              return regex.test(importSource);
            }
            return caseSensitive
              ? importSource === pattern
              : importSource.toLowerCase() === pattern.toLowerCase();
          });

          if (matched) {
            // Skip if it's a type import and type imports are allowed
            if (
              importKind === 'type' &&
              restrictedPattern.allowTypeImports === true
            ) {
              continue;
            }

            // Skip if it's a dynamic import and dynamic imports are allowed
            if (
              importSource.endsWith('.dynamic') &&
              restrictedPattern.allowDynamicImports === true
            ) {
              continue;
            }

            context.report({
              node,
              messageId: 'restrictedImportPattern',
              data: {
                importSource,
                customMessage: restrictedPattern.message
                  ? `: ${restrictedPattern.message}`
                  : '',
              },
            });
          }
        }
      },
    };
  },
});
