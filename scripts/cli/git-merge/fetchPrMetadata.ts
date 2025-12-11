import { runCommand } from '../git-utils';
import type { PrMetadata } from './types';

/**
 * Fetches PR metadata for additional context.
 * Does NOT include the PR diff to avoid overwhelming the prompt
 * with redundant information (the per-file squashed diffs already
 * provide the net change context).
 */
export function fetchPrMetadata(prNumber: number) {
  const prJson = runCommand(
    `gh pr view ${prNumber} --json number,title,body,url`,
    true,
  );
  const prData = JSON.parse(prJson) as {
    readonly number: number;
    readonly title: string;
    readonly body: string | null;
    readonly url: string;
  };

  let codeRabbitSummary: string | null = null;
  try {
    const commentsOutput = runCommand(
      `gh pr view ${prNumber} --json comments --jq '.comments[] | select(.author.login == "coderabbitai") | .body' | head -n 100`,
      true,
    );

    if (commentsOutput) {
      codeRabbitSummary = commentsOutput;
    }
  } catch {
    // CodeRabbit summary not found or error fetching.
  }

  return {
    number: prData.number,
    title: prData.title,
    description: prData.body ?? null,
    url: prData.url,
    codeRabbitSummary,
  } as const satisfies PrMetadata;
}
