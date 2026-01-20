import { TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'missingMetadata'
  | 'metadataAfterStatement'
  | 'missingMigrationTag'
  | 'invalidMigrationTag'
  | 'missingPhaseTag'
  | 'invalidPhaseTag'
  | 'missingDependenciesTag'
  | 'invalidDependenciesTag'
  | 'missingDescriptionTag'
  | 'extensionInDependencies';

type Options = [
  {
    targetGlobs?: string[];
    allowLegacyHeader?: boolean;
    autoFix?: boolean;
  },
];

const DEFAULT_OPTIONS: Options[0] = {
  targetGlobs: ['functions/src/callable/scripts/**/*.f.ts'],
  allowLegacyHeader: true,
  autoFix: false,
};

export const requireMigrationScriptMetadata = createRule<Options, MessageIds>({
  name: 'require-migration-script-metadata',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce JSDoc migration metadata in callable scripts',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          targetGlobs: {
            type: 'array',
            items: { type: 'string' },
          },
          allowLegacyHeader: {
            type: 'boolean',
          },
          autoFix: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingMetadata:
        'Migration script metadata block is missing. Every callable script must include a JSDoc block with @migration, @migrationPhase, @migrationDependencies, and @migrationDescription.',
      metadataAfterStatement:
        'Migration metadata must appear at the top of the file, before any imports or executable statements.',
      missingMigrationTag: 'The @migration tag is required (true/false).',
      invalidMigrationTag: 'The @migration tag must be "true" or "false".',
      missingPhaseTag:
        'The @migrationPhase tag is required when @migration is true.',
      invalidPhaseTag: 'The @migrationPhase tag must be "before" or "after".',
      missingDependenciesTag:
        'The @migrationDependencies tag is required when @migration is true. Use "NONE" if there are no dependencies.',
      invalidDependenciesTag:
        'The @migrationDependencies tag must be a comma-separated list of script names or "NONE". Empty entries are not allowed.',
      missingDescriptionTag:
        'The @migrationDescription tag is required when @migration is true.',
      extensionInDependencies:
        'Dependency "{{name}}" should not include the ".f.ts" extension. Use only the script name.',
    },
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(context, [options]) {
    const filename = context.getFilename();
    const { targetGlobs } = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    // Only run on files matching targetGlobs
    const isTargetFile = targetGlobs?.some((glob) =>
      minimatch(filename, glob, { dot: true, matchBase: true }),
    );

    if (!isTargetFile) {
      return {};
    }

    const sourceCode = context.getSourceCode();
    const comments = sourceCode.getAllComments();
    const firstToken = sourceCode.getFirstToken(sourceCode.ast, {
      includeComments: false,
    });

    return {
      Program() {
        let migrationMetadata: {
          comment: TSESTree.Comment;
          tags: Record<string, string>;
        } | null = null;

        for (const comment of comments) {
          if (comment.type !== 'Block' || !comment.value.startsWith('*')) {
            continue;
          }

          const tags = parseJSDocTags(comment.value);
          if ('migration' in tags) {
            migrationMetadata = { comment, tags };
            break;
          }
        }

        if (!migrationMetadata) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'missingMetadata',
          });
          return;
        }

        const { comment, tags } = migrationMetadata;

        // Check if metadata appears after the first statement/import
        if (firstToken && comment.range[0] > firstToken.range[0]) {
          context.report({
            node: comment,
            messageId: 'metadataAfterStatement',
          });
        }

        const migration = tags.migration;
        if (migration !== 'true' && migration !== 'false') {
          context.report({
            node: comment,
            messageId: 'invalidMigrationTag',
          });
          return;
        }

        if (migration === 'true') {
          // Check phase
          if (!tags.migrationPhase) {
            context.report({
              node: comment,
              messageId: 'missingPhaseTag',
            });
          } else if (
            tags.migrationPhase !== 'before' &&
            tags.migrationPhase !== 'after'
          ) {
            context.report({
              node: comment,
              messageId: 'invalidPhaseTag',
            });
          }

          // Check dependencies
          if (!tags.migrationDependencies) {
            context.report({
              node: comment,
              messageId: 'missingDependenciesTag',
            });
          } else if (tags.migrationDependencies === 'NONE') {
            // Valid
          } else {
            const deps = tags.migrationDependencies
              .split(',')
              .map((d) => d.trim());
            if (deps.length === 0 || deps.some((d) => d === '')) {
              context.report({
                node: comment,
                messageId: 'invalidDependenciesTag',
              });
            } else {
              for (const dep of deps) {
                if (dep.endsWith('.f.ts')) {
                  context.report({
                    node: comment,
                    messageId: 'extensionInDependencies',
                    data: { name: dep },
                  });
                }
              }
            }
          }

          // Check description
          if (!tags.migrationDescription) {
            context.report({
              node: comment,
              messageId: 'missingDescriptionTag',
            });
          }
        }
      },
    };
  },
});

function parseJSDocTags(commentValue: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const lines = commentValue.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim().replace(/^\*+\s*/, '');
    const match = trimmedLine.match(/^@(\w+)\s+(.+)$/);
    if (match) {
      const [, tagName, tagValue] = match;
      tags[tagName] = tagValue.trim();
    }
  }

  return tags;
}
