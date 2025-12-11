import { runCommand } from '../git-utils';
import type { PrMetadata } from './types';

/**
 * Fetches PR metadata for additional context.
 * Does NOT include the PR diff to avoid overwhelming the prompt
 * with redundant information (the per-file squashed diffs already
 * provide the net change context).
 */
export function fetchPrMetadata(prNumber: number) {
  if (!Number.isFinite(prNumber) || prNumber <= 0) {
    throw new Error(`Invalid PR number: ${prNumber}`);
  }

  const prJson = runCommand(
    `gh pr view ${prNumber} --json number,title,body,url`,
    true,
  );
  let prData: {
    readonly number: number;
    readonly title: string;
    readonly body: string | null;
    readonly url: string;
  };
  try {
    prData = JSON.parse(prJson);
  } catch {
    throw new Error(`Failed to parse PR metadata for PR #${prNumber}`);
  }

  let codeRabbitSummary: string | null = null;
  try {
    const commentsOutput = runCommand(
      `gh pr view ${prNumber} --json comments --jq '[.comments[] | select(.author.login == "coderabbitai")] | .[0:100] | .[].body'`,
      true,
    );

    if (commentsOutput) {
      codeRabbitSummary = commentsOutput;
    }
  } catch {
    // CodeRabbit summary not found or error fetching.
  }

  const metadata: PrMetadata = {
    number: prData.number,
    title: prData.title,
    description: prData.body ?? null,
    url: prData.url,
    codeRabbitSummary,
  };

  return metadata;
}
