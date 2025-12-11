#!/usr/bin/env tsx

import type {
  ConflictedFileContext,
  MergeContext,
} from '../../scripts/cli/git-merge/types';

function buildFileSection(file: ConflictedFileContext): string {
  return `### File: \`${file.path}\`

#### OURS Changes (last modified: ${file.oursDiff.lastCommitDate ?? 'unknown'})
\`\`\`diff
${file.oursDiff.diffFromMergeBase ?? '(no changes)'}
\`\`\`

#### THEIRS Changes (last modified: ${
    file.theirsDiff.lastCommitDate ?? 'unknown'
  })
\`\`\`diff
${file.theirsDiff.diffFromMergeBase ?? '(no changes)'}
\`\`\`

#### Current File Content (with conflict markers)
\`\`\`
${file.contentWithMarkers}
\`\`\``;
}

function buildPrContextSection(context: MergeContext): string {
  if (!context.associatedPr) {
    return '';
  }

  const { associatedPr } = context;

  let section = `## PR Context

This merge is associated with **PR #${associatedPr.number}**: [${
    associatedPr.title
  }](${associatedPr.url})

### PR Description
${associatedPr.description || '(No description provided)'}`;

  if (associatedPr.codeRabbitSummary) {
    section += `

### CodeRabbit Summary
${associatedPr.codeRabbitSummary}`;
  }

  return section + '\n\n';
}

/**
 * Constructs the structured prompt for merge conflict resolution.
 * Shared by both the initial setup script and stop hook followups.
 */
export function buildMergePrompt(context: MergeContext): string {
  const fileSections = context.conflictedFiles
    .map(buildFileSection)
    .join('\n\n---\n\n');

  const prContextSection = buildPrContextSection(context);

  return `# Merge Conflict Resolution Task

You are an expert software engineer at git merge conflict resolution.

## Goal
Produce the correct final contents for each conflicted file. Prefer changes that are:
1. **Freshest** relative to the merge base (check timestamps—more recent is *usually* better)
2. **Most semantically correct** for the codebase (when timestamps are similar, use intelligent judgment)

Do NOT blindly choose ours/theirs; use rationale and logic to determine the correct merge when changes are compatible.

## Branches
- **OURS (current branch)**: \`${context.ourBranchName}\`
- **THEIRS (incoming branch)**: \`${context.theirBranchName}\`
- **Merge Base**: \`${context.mergeBaseSha}\`

${prContextSection}## Resolution Rules
1. If two changes are compatible, keep both.
2. If one side fixes a bug or updates an API used elsewhere, preserve that fix even if older.
3. If one side is a refactor and the other is a feature, merge feature onto refactor.
4. Maintain formatting and local conventions.
5. Output ONLY the resolved file content, no conflict markers.
6. If uncertain, preserve more behavior and add a brief comment explaining the choice.

## Conflicted Files

${fileSections}

## Instructions

For each file:
1. **Compare Timestamps**: Check which branch has more recent changes
2. **Examine Diffs**: Understand what each branch changed from the merge-base
3. **Resolve**: Edit the file directly, removing all conflict markers (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`)
4. **Stage**: Run \`git add <path>\` after resolving each file
5. The Cursor hooks will verify no conflicts remain before allowing you to stop

**Output only clean, working code in resolved files—no explanations or markdown.**`;
}

// CLI usage: tsx build-merge-prompt.ts <context-json-path>
async function main() {
  const contextPath = process.argv[2];
  if (!contextPath) {
    console.error('Usage: tsx build-merge-prompt.ts <context-json-path>');
    process.exit(1);
  }

  const fs = await import('node:fs');
  const context: MergeContext = JSON.parse(
    fs.readFileSync(contextPath, 'utf-8'),
  );
  console.log(buildMergePrompt(context));
}

if (process.argv[1]?.endsWith('build-merge-prompt.ts')) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}
