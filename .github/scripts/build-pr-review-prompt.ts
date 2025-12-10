import * as fs from 'fs';

interface ReviewContext {
  review: {
    is_bot: boolean;
    comment_count: number;
    id: number;
  } | null;
  pr: {
    number: number;
    title: string;
  };
}

const BOT_BATCH_SIZE_LIMIT = 5;
const HUMAN_BATCH_SIZE_LIMIT = 7;

const contextPath = process.argv[2];
const commentsPath = process.argv[3];

if (!contextPath || !commentsPath) {
  console.error("Usage: tsx build-pr-review-prompt.ts <context_json_path> <comments_md_path>");
  process.exit(1);
}

try {
  const contextJson = fs.readFileSync(contextPath, 'utf8');
  const context: ReviewContext = JSON.parse(contextJson);
  
  let commentsMd = "";
  try {
    commentsMd = fs.readFileSync(commentsPath, 'utf8');
  } catch (e) {
    console.warn("Could not read comments file, proceeding without initial checklist.");
  }

  const review =
    context.review ??
    ({
      is_bot: false,
      comment_count: 0,
      id: 0,
    } as const);

  const isBot = review.is_bot;
  const commentCount = review.comment_count;
  // Calculate batch size based on review type
  const batchSize = isBot
    ? Math.min(BOT_BATCH_SIZE_LIMIT, commentCount)
    : Math.min(HUMAN_BATCH_SIZE_LIMIT, commentCount);

  let taskSteps = "";
  if (isBot) {
    taskSteps = `
- Step 1: Do codebase research, web research, deep thinking to validate whether the comment is a legitimate concern. If not, skip to Step 5 to mark it as invalid. About 50% of comments are valid.
- Step 2: Think deeply about the comment's suggested recommendation, tweaking it and selecting the best presented options. Expect to make tweaks to the recommendation most of the time.
- Step 3: Implement Changes: Navigate to the specified file(s) and line(s) to apply the necessary edits for valid items.
- Step 4: Update documentation if applicable (follow the \`system-documentation\` rule).
- Step 5: Resolve and Annotate Excluded/Processed Items: Generate \`decisions.json\` from the annotated chat checklist and run \`npm run apply-comment-decisions -- .cursor/tmp/decisions.json\` to react with 👍/👎 and resolve threads. The \`decisions.json\` file must be an array of objects with fields:
  - \`url\` (required): the comment URL (e.g., \`...#discussion_r123456789\`)
  - \`valid\` (required, boolean): true for valid, false for invalid`;
  } else {
    taskSteps = `
- Step 1: Perform Codebase Analysis: Given the comment, perform deep research on the codebase to understand the context and arm yourself to make the best code decisions.
- Step 2: Implement Changes: Navigate to the specified file(s) and line(s), apply the necessary code changes to address the reviewer's concerns. Where the reviewer provided insights, add succinct in-code comments to capture the rationale.
- Step 3: Update Documentation: If applicable, update related \`.mdc\` documentation guides to incorporate captured insights and reflect current behavior.
- Step 4: Resolve Addressed Comments: Run \`npm run resolve-comments -- <comment_url>\`.`;
  }

  const prompt = `# PR Review Context

\`\`\`json
${contextJson}
\`\`\`

# Unresolved Comments Checklist

${commentsMd}

# Your Task

Please see the PR Review Context and Unresolved Comments Checklist above. You have at least ${batchSize} unresolved review comments to resolve. Please make a todolist of at least ${batchSize} items, one for each of these comments, whereby for each comment you:${taskSteps}

Repeat this until you have completely processed your checklist.

## Continuous Execution

Address this batch of comments completely and correctly before stopping. Use the todolist you created to ensure you don't miss anything.

## Definition of Done

- All comments in this batch are resolved.
- Adhere to \`task-completion-standards.mdc\` for linting, testing, and documentation.
`;

  // Output the prompt to stdout
  console.log(prompt);

} catch (error) {
  console.error("Error building prompt:", {
    error,
    contextPath,
    commentsPath,
  });
  process.exit(1);
}

