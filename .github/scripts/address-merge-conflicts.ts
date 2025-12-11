#!/usr/bin/env tsx

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureDependency, runCommand } from '../../scripts/cli/git-utils';
import { normalizeBranchName } from '../../scripts/cli/git-merge/normalizeBranchName';
import { isInMergeConflictState } from '../../scripts/cli/git-merge/isInMergeConflictState';
import { buildMergeContext } from '../../scripts/cli/git-merge/buildMergeContext';
import { buildMergePrompt } from './build-merge-prompt';

function outputInstructions(promptPath: string): void {
  console.log('\n' + '='.repeat(70));
  console.log('✅ Setup Complete!');
  console.log('='.repeat(70));
  console.log(`\n📄 The agent prompt has been written to:\n   ${promptPath}`);
  console.log('\n📋 Next Steps:');
  console.log('   1. Open the prompt file above');
  console.log('   2. Copy its entire contents');
  console.log('   3. Open a new Cursor Composer conversation');
  console.log('   4. Paste the prompt and start the agent');
  console.log(
    '\n🔄 The agent will loop via Cursor Hooks until all conflicts are resolved.',
  );
  console.log(
    '   After conflicts are resolved, the normal build/lint/test hooks can run.',
  );
  console.log('\n' + '='.repeat(70) + '\n');
}

function main(): void {
  console.log('🚀 Setting up merge conflict resolution workflow...\n');

  console.log('Checking dependencies...');
  ensureDependency('git');
  ensureDependency('gh');
  console.log('✓ All dependencies found\n');

  console.log('Checking merge state...');
  if (!isInMergeConflictState()) {
    console.error(
      'Error: No merge conflict detected. Run this command after "git merge" produces conflicts.',
    );
    process.exit(1);
  }

  const ourBranch = runCommand('git rev-parse --abbrev-ref HEAD', true);
  const normalizedTheirBranch = normalizeBranchName(
    runCommand('git name-rev --name-only MERGE_HEAD', true),
  );

  if (!normalizedTheirBranch) {
    console.error('Error: Failed to normalize merge head branch name.');
    process.exit(1);
  }

  console.log(
    `✓ Merge conflict detected (merging '${normalizedTheirBranch}' into '${ourBranch}')\n`,
  );

  console.log('Gathering context...');
  const context = buildMergeContext();
  console.log(`✓ Found ${context.conflictedFiles.length} conflicted file(s)`);
  console.log('✓ Generated squashed diffs for ours and theirs branches');

  if (context.associatedPr) {
    console.log(
      `✓ Detected associated PR #${context.associatedPr.number}: "${context.associatedPr.title}"`,
    );
    console.log(
      '✓ Fetched PR metadata (title, description, CodeRabbit summary)',
    );
  }
  console.log('');

  console.log('Building prompt...');
  const prompt = buildMergePrompt(context);

  const repoRoot = runCommand('git rev-parse --show-toplevel', true);
  const tmpDir = path.join(repoRoot, '.cursor', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const promptPath = path.join(tmpDir, 'merge-conflict-prompt.md');
  fs.writeFileSync(promptPath, prompt);
  console.log('✓ Prompt written to .cursor/tmp/merge-conflict-prompt.md\n');

  outputInstructions(promptPath);
}

try {
  main();
} catch (error) {
  console.error('Unexpected error:', error);
  process.exit(1);
}
