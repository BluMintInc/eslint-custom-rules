import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchAllConversationFiles, fetchChangedFiles } from './change-log';

function filterLintableFiles(files: readonly string[]) {
  return files.filter((file) => {
    return (
      /\.(ts|tsx|js|jsx)$/.test(file) &&
      existsSync(file) &&
      // ESLint ignores dot-directories (like .github/) by default, which produces noisy warnings
      // when we pass those files explicitly. These scripts are still covered by tests when applicable.
      !file.startsWith('.github/') &&
      !file.includes('node_modules') &&
      !file.includes('.claude/tmp/') &&
      !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)
    );
  });
}

export function performLintDiff({
  conversationId,
  generationId,
}: {
  readonly conversationId: string | null;
  readonly generationId: string | null;
}) {
  if (!conversationId) {
    console.error('Missing conversation-id');
    process.exit(1);
  }

  // When no generationId, lint all files changed in the session (stop hook context)
  const changedFiles = generationId
    ? fetchChangedFiles({ conversationId, generationId })
    : fetchAllConversationFiles({ conversationId });
  const lintableFiles = filterLintableFiles(changedFiles);

  if (lintableFiles.length === 0) {
    return;
  }

  console.log(`Linting ${lintableFiles.length} files...`);

  const result = spawnSync('npx', ['eslint', '--fix', ...lintableFiles], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const conversationIdIdx = args.indexOf('--conversation-id');
  const generationIdIdx = args.indexOf('--generation-id');

  const conversationIdValue =
    conversationIdIdx === -1 ? null : args[conversationIdIdx + 1] ?? null;
  const generationIdValue =
    generationIdIdx === -1 ? null : args[generationIdIdx + 1] ?? null;

  const conversationId =
    conversationIdValue && conversationIdValue.length > 0
      ? conversationIdValue
      : null;
  const generationId =
    generationIdValue && generationIdValue.length > 0
      ? generationIdValue
      : null;

  return { conversationId, generationId } as const;
}

function executeMain() {
  const { conversationId, generationId } = parseArgs();
  performLintDiff({ conversationId, generationId });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  executeMain();
}
