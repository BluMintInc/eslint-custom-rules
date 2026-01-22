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
  | 'extensionInDependencies'
  | 'noneCasing'
  | 'legacyHeaderNotAllowed'
  | 'multipleMetadataBlocks';

type Options = [
  {
    targetGlobs?: string[];
    allowLegacyHeader?: boolean;
  },
];

const DEFAULT_OPTIONS: Options[0] = {
  targetGlobs: ['**/functions/src/callable/scripts/**/*.f.ts'],
  allowLegacyHeader: true,
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
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingMetadata:
        'Missing migration metadata JSDoc block → Release tooling cannot determine participation or ordering, which can skip or misorder migrations → Add a top-of-file JSDoc block with `@migration` true/false; when true include `@migrationPhase`, `@migrationDependencies` (or NONE), and `@migrationDescription`.',
      metadataAfterStatement:
        'Migration metadata appears after code/imports → The release scanner only reads the top-of-file block and will miss this metadata → Move the metadata JSDoc above all imports/statements (legacy header allowed only when configured).',
      missingMigrationTag:
        'Metadata block is missing `@migration` → Without an explicit true/false, automation cannot decide whether to run this script → Add `@migration` true or `@migration` false to the metadata block.',
      invalidMigrationTag:
        'Invalid `@migration` value → Only true/false is supported so automation can branch deterministically → Replace with `@migration` true or `@migration` false.',
      missingPhaseTag:
        'Missing `@migrationPhase` while `@migration` is true → Release ordering cannot place this script → Add `@migrationPhase` before or after.',
      invalidPhaseTag:
        'Invalid `@migrationPhase` value → Release ordering only understands before/after → Use `@migrationPhase` before or `@migrationPhase` after.',
      missingDependenciesTag:
        'Missing `@migrationDependencies` while `@migration` is true → Dependency ordering cannot be computed → Add `@migrationDependencies` NONE or a comma-separated list of script names.',
      invalidDependenciesTag:
        'Invalid `@migrationDependencies` list → Empty or whitespace entries break dependency resolution → Provide a comma-separated list of non-empty names or NONE.',
      missingDescriptionTag:
        'Missing `@migrationDescription` while `@migration` is true → Release reports lose context and reviewers cannot assess impact → Add a brief `@migrationDescription`.',
      extensionInDependencies:
        'Dependency "{{name}}" includes a file extension → Dependencies are script identifiers, and extensions cause mismatches → Remove the ".f.ts" extension from "{{name}}".',
      noneCasing:
        'Invalid `@migrationDependencies` casing → Automation expects exactly "NONE" in all-caps to signal no dependencies → Change to uppercase "NONE".',
      legacyHeaderNotAllowed:
        'Legacy header/comment appears before metadata → The metadata block must be the first file-level block to keep linting deterministic → Remove leading comments or enable allowLegacyHeader.',
      multipleMetadataBlocks:
        'Multiple metadata blocks found → Conflicting `@migration` tags make automation ambiguous → Keep exactly one JSDoc block with `@migration`.',
    },
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(context, [options]) {
    const rawFilename =
      (context as { filename?: string }).filename ?? context.getFilename();
    const filename = rawFilename.replace(/\\/g, '/');
    const { targetGlobs, allowLegacyHeader } = {
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

    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const comments = sourceCode.getAllComments();
    const firstToken = sourceCode.getFirstToken(sourceCode.ast, {
      includeComments: false,
    });

    return {
      Program() {
        const metadataCandidates = comments
          .filter(
            (comment) => comment.type === 'Block' && comment.value.startsWith('*'),
          )
          .map((comment) => ({ comment, tags: parseJSDocTags(comment.value) }))
          .filter(({ tags }) =>
            Object.keys(tags).some((tag) => tag.startsWith('migration')),
          );

        if (metadataCandidates.length > 1) {
          for (const extra of metadataCandidates.slice(1)) {
            context.report({
              node: extra.comment,
              messageId: 'multipleMetadataBlocks',
            });
          }
        }

        const migrationMetadata = metadataCandidates[0] ?? null;

        if (!migrationMetadata) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'missingMetadata',
          });
          return;
        }

        const { comment, tags } = migrationMetadata;

        if (!allowLegacyHeader) {
          const hasLeadingComment = comments.some(
            (c) => c.type === 'Block' && c.range[0] < comment.range[0],
          );
          if (hasLeadingComment) {
            context.report({
              node: comment,
              messageId: 'legacyHeaderNotAllowed',
            });
          }
        }

        // Check if metadata appears after the first statement/import
        if (firstToken && comment.range[0] > firstToken.range[0]) {
          context.report({
            node: comment,
            messageId: 'metadataAfterStatement',
          });
        }

        if (!('migration' in tags)) {
          context.report({
            node: comment,
            messageId: 'missingMigrationTag',
          });
          return;
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
          } else {
            const deps = tags.migrationDependencies
              .split(',')
              .map((d) => d.trim());
            const hasNone = deps.some((d) => d.toUpperCase() === 'NONE');

            if (deps.some((d) => d === '')) {
              context.report({
                node: comment,
                messageId: 'invalidDependenciesTag',
              });
            } else if (hasNone && deps.length > 1) {
              context.report({
                node: comment,
                messageId: 'invalidDependenciesTag',
              });
            } else if (hasNone && deps[0] !== 'NONE') {
              context.report({
                node: comment,
                messageId: 'noneCasing',
              });
            } else if (hasNone && deps[0] === 'NONE') {
              // Valid: exactly NONE
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
    const match = trimmedLine.match(/^@(\w+)(?:\s+(.*))?$/);
    if (match) {
      const [, tagName, tagValue] = match;
      tags[tagName] = (tagValue ?? '').trim();
    }
  }

  return tags;
}
