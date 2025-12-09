import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fetchChangedFiles } from './change-log';

function filterLintableFiles(files: readonly string[]) {
  return files.filter((file) => {
    return (
      /\.(ts|tsx|js|jsx)$/.test(file) &&
      existsSync(file) &&
      !file.includes('node_modules') &&
      !file.includes('.cursor/tmp/')
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
  if (!conversationId || !generationId) {
    console.error('Missing conversation-id or generation-id');
    process.exit(1);
  }

  const changedFiles = fetchChangedFiles({ conversationId, generationId });
  const lintableFiles = filterLintableFiles(changedFiles);

  if (lintableFiles.length === 0) {
    return;
  }

  console.log(`Linting ${lintableFiles.length} files...`);

  try {
    execSync(
      `npx eslint --fix ${lintableFiles
        .map((file) => {
          return `"${file}"`;
        })
        .join(' ')}`,
      {
        stdio: 'inherit',
      },
    );
  } catch {
    process.exit(1);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const conversationIdIdx = args.indexOf('--conversation-id');
  const generationIdIdx = args.indexOf('--generation-id');

  const conversationId =
    conversationIdIdx === -1 ? null : args[conversationIdIdx + 1];
  const generationId =
    generationIdIdx === -1 ? null : args[generationIdIdx + 1];

  return { conversationId, generationId } as const;
}

function executeMain() {
  const { conversationId, generationId } = parseArgs();
  performLintDiff({ conversationId, generationId });
}

const isDirectExecution =
  process.argv[1] && process.argv[1].includes('lint-diff');

if (isDirectExecution) {
  executeMain();
}
