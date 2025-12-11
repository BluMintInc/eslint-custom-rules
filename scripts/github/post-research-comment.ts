import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Posts research results to a GitHub issue and manipulates labels based on findings.
 *
 * Required environment variables:
 * - ISSUE_NUMBER: The GitHub issue number to post to
 * - GITHUB_REPOSITORY: The repository in format 'owner/repo' (optional, defaults to BluMintInc/eslint-custom-rules)
 */

const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const GITHUB_REPOSITORY =
  process.env.GITHUB_REPOSITORY || 'BluMintInc/eslint-custom-rules';
const REVIEW_TEAM = process.env.REVIEW_TEAM || '@BluMintInc/core';

if (!ISSUE_NUMBER) {
  console.error('ISSUE_NUMBER environment variable is required');
  process.exit(1);
}

// Read research results
const resultsPath = '.cursor/tmp/research-results.md';
if (!existsSync(resultsPath)) {
  console.error(`Research results not found at ${resultsPath}`);
  process.exit(1);
}

const researchResults = readFileSync(resultsPath, 'utf-8');

/**
 * Detect the recommendation type from research results.
 * Looks specifically for the recommendation in the Summary section format:
 * - **Recommendation**: EXACT MATCH
 * - **Recommendation**: PARTIAL MATCH
 * - **Recommendation**: NO MATCH
 *
 * Also accepts bracket format: [EXACT MATCH], [PARTIAL MATCH], [NO MATCH]
 */
type RecommendationType =
  | 'EXACT_MATCH'
  | 'PARTIAL_MATCH'
  | 'NO_MATCH'
  | 'UNKNOWN';

function detectRecommendationType(results: string): RecommendationType {
  // Look for the Summary section and extract recommendation line
  // Pattern matches: **Recommendation**: VALUE or **Recommendation**: [VALUE]
  const recommendationLineMatch = results.match(
    /\*\*Recommendation\*\*\s*:\s*\[?\s*(EXACT MATCH|PARTIAL MATCH|NO MATCH)\s*\]?/i,
  );

  if (recommendationLineMatch) {
    const recommendation = recommendationLineMatch[1].toUpperCase();
    return recommendation.replace(' ', '_') as RecommendationType;
  }

  // Fallback: Look for Summary section header followed by recommendation
  const summaryMatch = results.match(
    /###?\s*Summary[\s\S]*?\*\*Recommendation\*\*[:\s]*\[?\s*(EXACT MATCH|PARTIAL MATCH|NO MATCH)\s*\]?/i,
  );

  if (summaryMatch) {
    const recommendation = summaryMatch[1].toUpperCase();
    return recommendation.replace(' ', '_') as RecommendationType;
  }

  return 'UNKNOWN';
}

const recommendationType = detectRecommendationType(researchResults);

/**
 * Execute a GitHub CLI command, handling errors gracefully.
 */
function gh(args: string): string {
  try {
    return execSync(`gh ${args}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`GitHub CLI command failed: gh ${args}`);
    console.error(`Error: ${errorMessage}`);
    throw error;
  }
}

function postIssueComment(body: string) {
  const payload = JSON.stringify({ body });
  execSync(
    `gh api repos/${GITHUB_REPOSITORY}/issues/${ISSUE_NUMBER}/comments --input -`,
    {
      input: payload,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
}

// Build comment body without duplicating the heading if it already exists
const HEADING = '## 🔍 ESLint Rule Research Results';
const researchResultsTrimmed = researchResults.trimStart();
const resultsWithHeading = researchResultsTrimmed.startsWith(HEADING)
  ? researchResultsTrimmed
  : `${HEADING}\n\n${researchResultsTrimmed}`;

const commentBody = `${resultsWithHeading.trimEnd()}`;

// Post research results as a comment
console.log(`Posting research results to issue #${ISSUE_NUMBER}...`);
try {
  postIssueComment(commentBody);
  console.log('Research comment posted successfully');
} catch (error) {
  console.error('Failed to post research comment');
  console.error(
    error instanceof Error ? error.message : 'Unknown error posting comment',
  );
  console.error('Exiting: research comment is required for workflow');
  process.exit(1);
}

// Manipulate labels
console.log('Updating issue labels...');

try {
  // Remove cursor-research label
  gh(
    `issue edit ${ISSUE_NUMBER} --repo ${GITHUB_REPOSITORY} --remove-label "cursor-research"`,
  );
  console.log('Removed cursor-research label');
} catch {
  // Label might not exist, continue
  console.log('Note: cursor-research label may not have been present');
}

try {
  // Add research-complete label
  gh(
    `issue edit ${ISSUE_NUMBER} --repo ${GITHUB_REPOSITORY} --add-label "research-complete"`,
  );
  console.log('Added research-complete label');
} catch {
  console.error('Failed to add research-complete label');
}

// Handle recommendation-based actions
if (recommendationType === 'NO_MATCH') {
  // No existing rule found - automatically trigger implementation
  console.log('NO MATCH detected - triggering implementation workflow');
  try {
    gh(
      `issue edit ${ISSUE_NUMBER} --repo ${GITHUB_REPOSITORY} --add-label "cursor-implement"`,
    );
    console.log('Added cursor-implement label');
  } catch {
    console.error('Failed to add cursor-implement label');
  }
} else if (
  recommendationType === 'EXACT_MATCH' ||
  recommendationType === 'PARTIAL_MATCH'
) {
  // Existing rule found - tag dev team for review
  const matchType =
    recommendationType === 'EXACT_MATCH' ? 'EXACT MATCH' : 'PARTIAL MATCH';
  console.log(`${matchType} detected - tagging ${REVIEW_TEAM} for review`);
  try {
    postIssueComment(
      `${REVIEW_TEAM} Please review the research findings above. An existing rule may satisfy this requirement.`,
    );
    console.log('Posted review request comment');
  } catch {
    console.error('Failed to post review request comment');
  }
} else {
  // No clear recommendation detected - notify that manual review is needed
  console.log(
    'WARNING: Could not detect a clear recommendation (EXACT MATCH, PARTIAL MATCH, or NO MATCH)',
  );
  console.log('Manual review of research results is recommended');
  try {
    postIssueComment(
      '⚠️ **Automated Review Notice**: The research results do not contain a clear recommendation. Please manually review the findings above and determine the next steps.',
    );
  } catch {
    console.error('Failed to post warning comment');
  }
}

console.log('Research comment workflow completed');
