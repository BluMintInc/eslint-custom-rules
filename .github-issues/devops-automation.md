# ESLint Custom Rules Repository DevOps Automation

## Overview

This issue outlines the implementation of an automated DevOps system for the `eslint-custom-rules` repository using **Cursor Hooks** and **Cursor Background Agents** (via GitHub Workflows). The goal is to automate the maintenance responsibilities currently handled manually, reducing toil and improving consistency.

## Background

Previously, OpenHands was used to implement ESLint rules triggered by the `fix-me` label. This required significant manual intervention:
- Re-adding labels when OpenHands failed (up to 4 retries)
- Manually verifying PRs have all required files
- Ensuring tests pass and are comprehensive
- Researching whether rules already exist before implementation

With **Cursor Hooks** and **Cursor Background Agents**, we can automate these workflows more intelligently.

---

## Implementation Plan

### Phase 0: Copy Starter Files

**Important**: The Cursor Hooks system described in this document does not exist in the `eslint-custom-rules` repo. You must first copy the starter files provided in this plan to the repo.

The following files have been copied for you as a starting point in the `eslint-custom-rules-develop/` directory:

```
eslint-custom-rules-develop/
├── .cursor/
│   ├── hooks.json
│   ├── hooks/
│   │   ├── stop.sh
│   │   ├── track-changes.sh
│   │   └── track-prompt.sh
│   ├── commands/
│   │   ├── implement-rule.md
│   │   └── fix-bug.md
│   └── rules/
│       └── task-completion-standards.mdc
├── scripts/
│   ├── cursor-hooks/
│   │   ├── agent-check.ts
│   │   ├── change-log.ts
│   │   ├── lint-diff.ts
│   │   ├── track-changes.ts
│   │   ├── track-prompt.ts
│   │   ├── types.ts
│   │   └── validate-rule-structure.ts
│   └── github/
│       └── post-research-comment.ts
```

---

### Phase 1: Repository Structure Setup

#### 1.1 Final Directory Structure

After implementation, the repository should have this structure:

```
eslint-custom-rules/
├── .cursor/
│   ├── hooks.json                           # Hook configuration
│   ├── hooks/
│   │   ├── stop.sh                          # Stop hook
│   │   ├── track-changes.sh                 # After-file-edit hook
│   │   └── track-prompt.sh                  # Before-submit-prompt hook
│   ├── tmp/
│   │   └── hooks/
│   │       └── agent-change-log.json        # Change tracking (auto-created)
│   ├── commands/
│   │   ├── implement-rule.md                # Command for implementing new rules
│   │   └── fix-bug.md                       # Command for fixing bugs
│   └── rules/
│       └── task-completion-standards.mdc    # Task completion criteria for ESLint rules
│       ├── cursor-hooks-and-workflows.mdc   # Documentation of this new system
├── .cursorrules                             # EXISTING - Development guidelines (preserve)
├── scripts/
│   ├── cursor-hooks/
│   │   ├── agent-check.ts                   # Main stop hook logic
│   │   ├── change-log.ts                    # Change log utilities
│   │   ├── lint-diff.ts                     # Linting on changed files
│   │   ├── track-changes.ts                 # Track file changes
│   │   ├── track-prompt.ts                  # Track user prompts & detect rule-request flag
│   │   ├── types.ts                         # Shared types
│   │   └── validate-rule-structure.ts       # Validate PR has required files
│   └── github/
│       └── post-research-comment.ts         # Post findings to issue
└── .github/
    └── workflows/
        ├── cursor-rule-research-agent.yml   # Research existing rules
        ├── cursor-implement-rule-agent.yml  # Implement new rules
        └── cursor-fix-bug-agent.yml         # Fix bugs in existing rules
```

#### 1.2 Update GitHub Labels

Replace current labels with:

| Old Label | New Label | Description |
|-----------|-----------|-------------|
| `enhancement` | `rule-request` | Request for a new ESLint rule |
| `bug` | `bug` | Bug in an existing rule |
| N/A | `cursor-research` | Triggers deep research workflow |
| N/A | `cursor-implement` | Triggers implementation agent |
| N/A | `cursor-fix` | Triggers bug fix agent |
| N/A | `research-complete` | Research has been performed |

#### 1.3 Update Issue Templates

Update `.github/ISSUE_TEMPLATE/eslint-rule-request.md`:
- Change default label from `enhancement` to `rule-request, cursor-research`
- Keep the same structure

Update `.github/ISSUE_TEMPLATE/eslint-rule-bug-report.md`:
- Keep `bug` label
- Add `cursor-fix` as default label for automatic fixing

---

### Phase 2: Deep Research Automation (Responsibility #0)

#### 2.1 GitHub Workflow: `cursor-rule-research-agent.yml`

**Trigger**: Issue labeled with `cursor-research`

**Purpose**: Launch a Cursor Background Agent to research if an ESLint rule already exists.

**Workflow Logic**:

```yaml
name: Research Existing ESLint Rules

on:
  issues:
    types: [labeled, reopened]

permissions:
  contents: read
  issues: write

env:
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

concurrency:
  group: cursor-research-${{ github.event.issue.number }}
  cancel-in-progress: true

jobs:
  research_existing_rules:
    if: |
      (github.event.action == 'labeled' && github.event.label.name == 'cursor-research') ||
      (github.event.action == 'reopened' && contains(github.event.issue.labels.*.name, 'cursor-research'))
    runs-on: ubuntu-latest
    steps:
      # 1. Check if research comment already exists (short-circuit)
      - name: Check for existing research
        id: check_research
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          COMMENTS=$(gh api repos/${{ github.repository }}/issues/${{ github.event.issue.number }}/comments)
          HAS_RESEARCH=$(echo "$COMMENTS" | jq 'any(.body | contains("## 🔍 ESLint Rule Research Results"))')
          echo "has_research=$HAS_RESEARCH" >> $GITHUB_OUTPUT
      
      # 2. Skip if research already done
      - name: Skip if research exists
        if: steps.check_research.outputs.has_research == 'true'
        run: |
          echo "Research already completed for this issue. Skipping."
          exit 0
      
      # 3. Build prompt from issue body
      # 4. Launch Cursor Background Agent to perform research
      # 5. Agent posts comment with findings
```

**Agent Prompt Template**:

```markdown
Conduct a thorough and deep research of the @Web to determine if an ESLint rule already exists that matches the following description.

## Rule Description
**Title**: ${issue.title}
**Body**:
${issue.body}

## Detailed Steps for Comprehensive Research

1. **Search thoroughly across a wide variety of sources**, including but not limited to:
   - Official ESLint core rules (https://eslint.org/docs/rules/)
   - @typescript-eslint/eslint-plugin rules
   - eslint-plugin-react and eslint-plugin-react-hooks
   - eslint-plugin-import
   - Other relevant ESLint plugins on npm
   - GitHub repositories, issues, and pull requests
   - Discussions on Stack Overflow, Reddit, and programming forums

2. **Provide links** to all relevant ESLint rules, plugins, or discussions discovered, along with concise assessments regarding how closely these resources align with the provided description.

3. **Offer a clear recommendation** based on your extensive findings:
   - **EXACT MATCH**: An existing rule exactly meets the criteria and can be directly utilized
   - **PARTIAL MATCH**: An existing rule partially meets the criteria and could be adapted with minimal modifications or configuration
   - **NO MATCH**: No suitable rule exists, necessitating the creation of a new custom rule

Include direct URLs and detailed summaries of your findings for comprehensive reference.

## Output

After completing your research, write your findings to `.cursor/tmp/research-results.md`. Your results should follow the template below:

\`\`\`markdown
## 🔍 ESLint Rule Research Results

### Summary
**Recommendation**: [EXACT MATCH | PARTIAL MATCH | NO MATCH]

### Existing Rule(s) Found

#### 1. `eslint-plugin-xxx/rule-name`
- **Match Level**: 80%
- **Description**: Brief description
- **Configuration**: Example config
- **Limitations**: What it doesn't cover

### Recommendation Details
[Detailed explanation of the recommendation]
\`\`\`

Then run:

\`\`\`bash
ISSUE_NUMBER=${issue.number} npx tsx scripts/github/post-research-comment.ts
\`\`\`

The script will:
1. Post your research findings as a comment on the issue
2. Manipulate labels based on your recommendation:
   - Remove `cursor-research` label
   - Add `research-complete` label
   - If NO MATCH: Also add `cursor-implement` label
```

#### 2.2 Research Script Implementation

The `scripts/github/post-research-comment.ts` file is provided in the starter files. It:

1. Reads research results from `.cursor/tmp/research-results.md`
2. Detects the recommendation (EXACT MATCH, PARTIAL MATCH, or NO MATCH)
3. Posts the findings as a comment on the GitHub issue
4. Manipulates labels:
   - Removes `cursor-research`
   - Adds `research-complete`
   - If NO MATCH: Adds `cursor-implement` to trigger implementation agent
   - If MATCH: Tags `@dev` for human review

#### 2.3 Workflow Behavior After Research

- On `EXACT MATCH` or `PARTIAL MATCH`:
  - Remove `cursor-research` label
  - Add `research-complete` label
  - Do NOT add `cursor-implement` (requires human to import existing rule)
  - Comment tags `@dev` to import the existing rule

- On `NO MATCH`:
  - Remove `cursor-research` label
  - Add `research-complete` label
  - **Automatically add `cursor-implement` label** to trigger implementation agent

---

### Phase 3: Cursor Hooks System (Responsibilities #2, #3, #4)

#### 3.1 How the Change Log System Works

The Cursor Hooks system tracks all file changes and conversation metadata in `.cursor/tmp/hooks/agent-change-log.json`. **This file is created automatically** when the first file edit or prompt occurs in a conversation.

**Hooks Configuration** (`.cursor/hooks.json`):

```json
{
  "version": 1,
  "hooks": {
    "afterFileEdit": [
      { "command": ".cursor/hooks/track-changes.sh" }
    ],
    "beforeSubmitPrompt": [
      { "command": ".cursor/hooks/track-prompt.sh" }
    ],
    "stop": [
      { "command": ".cursor/hooks/stop.sh" }
    ]
  }
}
```

**How It Works**:

1. **`afterFileEdit` hook** (`track-changes.sh` → `track-changes.ts`):
   - Triggered after every file modification
   - Records the file path in `agent-change-log.json` under the current conversation/generation
   - Updates the heartbeat timestamp

2. **`beforeSubmitPrompt` hook** (`track-prompt.sh` → `track-prompt.ts`):
   - Triggered before each user message is sent
   - Records `lastUserMessage` for loop prevention
   - **Detects `<!-- rule-request -->` flag** to mark conversations as rule implementations
   - Updates activity timestamps

3. **`stop` hook** (`stop.sh` → `agent-check.ts`):
   - Triggered when an agent attempts to complete
   - Runs validation checks (build, lint, tests, rule structure)
   - Returns followup messages to prevent completion if checks fail

#### 3.2 Change Log Structure

The `agent-change-log.json` file is auto-created with this structure:

```json
{
  "conversation-123": {
    "_metadata": {
      "hasCheckWorkPrompted": false,
      "hasExpandTestsPrompted": false,
      "isRuleRequest": true,
      "lastUserMessage": "...",
      "endTimestamp": null,
      "lastActivityTimestamp": 1700000100000
    },
    "generation-456": ["src/rules/new-rule.ts", "src/tests/new-rule.test.ts"]
  }
}
```

Key fields:
- `hasCheckWorkPrompted`: Whether the "check your work" prompt has been sent
- `hasExpandTestsPrompted`: Whether the "expand tests" prompt has been sent
- `isRuleRequest`: **Set to `true` when `<!-- rule-request -->` flag is detected** in the first prompt
- `lastUserMessage`: Used by MAX_LOOPS for loop prevention
- `endTimestamp`: Set when conversation completes
- `lastActivityTimestamp`: Updated on every file edit and prompt

#### 3.3 Detecting Rule Request Conversations

**Detection Mechanism**: Instead of relying on keyword detection in `firstUserMessage` (which would trigger too many false positives), the system uses a **`<!-- rule-request -->` HTML comment flag**.

The `cursor-implement-rule-agent.yml` workflow includes this flag at the top of its prompt:

```markdown
<!-- rule-request -->

You are implementing a new ESLint rule...
```

The `track-prompt.ts` hook detects this flag and marks the conversation:

```typescript
function detectRuleRequestFlag(prompt: string): boolean {
  return prompt.includes('<!-- rule-request -->');
}

function executeMain() {
  const input = readInput();
  const output = { continue: true };

  if (input && input.prompt && input.conversation_id) {
    // Check for rule-request flag on first message
    if (!isRuleRequestConversation(input.conversation_id)) {
      if (detectRuleRequestFlag(input.prompt)) {
        markAsRuleRequest(input.conversation_id);
      }
    }
    // ... rest of tracking
  }
}
```

This ensures only agents launched by `cursor-implement-rule-agent.yml` are treated as rule implementations, avoiding false positives from bug fix agents or manual sessions.

#### 3.4 Stop Hook Logic (`agent-check.ts`)

The stop hook executes checks in this priority order:

1. **Heartbeat Update**: Update activity timestamp
2. **Status Check**: Skip remaining checks if status is not `completed`
3. **Build Validation**: `npm run build` must succeed
4. **Linting Validation**: `lint-diff.ts` runs ESLint fix on changed files
5. **Test Validation**: `npm test` must pass
6. **Rule Structure Validation**: For rule implementations, validate all required files exist
7. **Check-Your-Work Prompt**: First self-review prompt
8. **Expand Tests Prompt**: For rule implementations only, after check-your-work

**Loop Prevention**: After `MAX_LOOPS` (10) iterations, allow the agent to complete even if checks fail. This prevents infinite loops when issues are unfixable.

#### 3.5 Linting with `lint-diff.ts`

Instead of a separate `auto-format.sh` hook, linting is handled in the stop hook via `lint-diff.ts`:

```typescript
export function performLintDiff({
  conversationId,
  generationId,
}: {
  readonly conversationId: string | null;
  readonly generationId: string | null;
}) {
  const changedFiles = fetchChangedFiles({ conversationId, generationId });
  const lintableFiles = filterLintableFiles(changedFiles);

  if (lintableFiles.length === 0) return;

  // Run ESLint fix on changed files only
  execSync(
    `npx eslint --fix ${lintableFiles.map(f => `"${f}"`).join(' ')}`,
    { stdio: 'inherit' }
  );
}
```

This approach:
- Only lints files changed in the current generation
- Runs `--fix` to auto-correct fixable issues
- Reports remaining errors as a followup message

#### 3.6 Rule Structure Validation (Responsibility #2)

The `validate-rule-structure.ts` script validates that new rules have all required files:

```typescript
export function validateRuleStructure(ruleName: string): ValidationResult {
  const requiredFiles = [
    `src/rules/${ruleName}.ts`,
    `src/tests/${ruleName}.test.ts`,
    `docs/rules/${ruleName}.md`,
  ];
  
  const missingFiles = requiredFiles.filter(file => !existsSync(file));
  
  // Also validate src/index.ts includes the rule in 3 places:
  // 1. Import statement
  // 2. configs.recommended.rules entry
  // 3. rules object entry
  
  // And check README.md mentions the rule
  
  return { isValid, missingFiles, indexIssues };
}
```

#### 3.7 Expand Tests Prompt (Responsibility #4)

For rule implementations (detected via `isRuleRequest` flag), after the first "check your work" prompt, the system sends an "expand tests" prompt:

```typescript
const EXPAND_TESTS_PROMPT = `
Your implementation looks good so far! Now let's ensure comprehensive test coverage.

Please expand the test suite to have **at least 20 tests** covering edge cases:

1. **False Positive Tests** (Valid code that should NOT trigger the rule):
   - Edge cases where similar patterns are actually correct
   - Framework-specific code that resembles violations
   - Dynamic values that look like they should be flagged

2. **False Negative Tests** (Invalid code that SHOULD trigger the rule):
   - Subtle violations that might be missed
   - Complex nested cases
   - Multi-line variations

3. **Auto-fix Tests** (if the rule has a fixer):
   - Verify the auto-fix produces correct output
   - Edge cases where auto-fix might break code

Think outside the box. What could go wrong? What edge cases exist in real codebases?

After expanding tests, ensure all tests pass with: npm test
`;
```

---

### Phase 4: GitHub Workflows for Implementation

#### 4.1 `cursor-implement-rule-agent.yml`

**Trigger**: Issue labeled with `cursor-implement`

**Prerequisites**: 
- Issue has `rule-request` label
- Issue has `research-complete` label (research didn't find exact match)

```yaml
name: Implement ESLint Rule

on:
  issues:
    types: [labeled, reopened]

permissions:
  contents: read
  pull-requests: write
  issues: write

env:
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

concurrency:
  group: cursor-implement-${{ github.event.issue.number }}
  cancel-in-progress: true

jobs:
  implement_rule:
    if: |
      ((github.event.action == 'labeled' && github.event.label.name == 'cursor-implement') ||
       (github.event.action == 'reopened' && contains(github.event.issue.labels.*.name, 'cursor-implement'))) &&
      contains(github.event.issue.labels.*.name, 'rule-request') &&
      contains(github.event.issue.labels.*.name, 'research-complete')
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Compute variables and build prompt
        id: vars
        run: |
          set -euo pipefail
          ISSUE_NUMBER='${{ github.event.issue.number }}'
          DEFAULT_REF='develop'
          
          # Fetch issue details
          ISSUE_JSON=$(gh api repos/${{ github.repository }}/issues/$ISSUE_NUMBER)
          ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
          ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body // ""')
          
          # Derive target branch
          TARGET_BRANCH="develop-implement-rule-$ISSUE_NUMBER"
          
          # Build prompt by copying command file and appending issue details
          PROMPT_FILE=/tmp/implement-prompt.txt
          cat > "$PROMPT_FILE" << 'PROMPT_HEADER'
          <!-- rule-request -->
          
          PROMPT_HEADER
          
          # Append the implement-rule command
          cat .cursor/commands/implement-rule.md >> "$PROMPT_FILE"
          
          # Append issue-specific details
          cat >> "$PROMPT_FILE" << PROMPT_ISSUE
          
          ---
          
          ## Issue to Implement
          
          **Issue #${ISSUE_NUMBER}**: ${ISSUE_TITLE}
          
          ${ISSUE_BODY}
          
          ---
          
          When complete, open a PR targeting the \`develop\` branch.
          PROMPT_ISSUE
          
          echo "source_ref=$DEFAULT_REF" >> "$GITHUB_OUTPUT"
          echo "target_branch=$TARGET_BRANCH" >> "$GITHUB_OUTPUT"
          echo "prompt_path=$PROMPT_FILE" >> "$GITHUB_OUTPUT"

      - name: Launch Cursor Background Agent
        id: launch
        env:
          CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
        run: |
          PROMPT_FILE='${{ steps.vars.outputs.prompt_path }}'
          
          JSON_PAYLOAD=$(jq -n \
            --rawfile prompt_text "$PROMPT_FILE" \
            --arg repository "https://github.com/${{ github.repository }}" \
            --arg source_ref "${{ steps.vars.outputs.source_ref }}" \
            --arg target_branch "${{ steps.vars.outputs.target_branch }}" \
            --arg model "gemini-3-flash" \
            '{
              model: $model,
              prompt: { text: $prompt_text },
              source: { repository: $repository, ref: $source_ref },
              target: { branchName: $target_branch, autoCreatePr: true, skipReviewerRequest: true }
            }')
          
          RESPONSE=$(curl --fail --silent --show-error \
            --request POST \
            --url https://api.cursor.com/v0/agents \
            --header "Authorization: Bearer ${CURSOR_API_KEY}" \
            --header "Content-Type: application/json" \
            --data "$JSON_PAYLOAD")
          
          AGENT_URL=$(echo "$RESPONSE" | jq -r '.target.url')
          echo "agent_url=$AGENT_URL" >> $GITHUB_OUTPUT

      - name: Comment on issue with agent link
        run: |
          URL='${{ steps.launch.outputs.agent_url }}'
          gh api repos/${{ github.repository }}/issues/${{ github.event.issue.number }}/comments \
            -f body="✅ Launched Cursor Implementation Agent. View agent: $URL"
```

**Key Points**:
- The prompt includes `<!-- rule-request -->` at the top for detection
- The workflow copies `.cursor/commands/implement-rule.md` and appends issue details
- This avoids prompt duplication and ensures consistency

#### 4.2 `cursor-fix-bug-agent.yml`

**Trigger**: Issue labeled with `cursor-fix`

**Prerequisites**: Issue has `bug` label

```yaml
name: Fix ESLint Rule Bug

on:
  issues:
    types: [labeled, reopened]

permissions:
  contents: read
  pull-requests: write
  issues: write

env:
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

concurrency:
  group: cursor-fix-${{ github.event.issue.number }}
  cancel-in-progress: true

jobs:
  fix_bug:
    if: |
      ((github.event.action == 'labeled' && github.event.label.name == 'cursor-fix') ||
       (github.event.action == 'reopened' && contains(github.event.issue.labels.*.name, 'cursor-fix'))) &&
      contains(github.event.issue.labels.*.name, 'bug')
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Compute variables and build prompt
        id: vars
        run: |
          set -euo pipefail
          ISSUE_NUMBER='${{ github.event.issue.number }}'
          DEFAULT_REF='develop'
          
          # Fetch issue details
          ISSUE_JSON=$(gh api repos/${{ github.repository }}/issues/$ISSUE_NUMBER)
          ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
          ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body // ""')
          
          # Derive target branch
          TARGET_BRANCH="develop-fix-bug-$ISSUE_NUMBER"
          
          # Build prompt by copying command file and appending issue details
          PROMPT_FILE=/tmp/fix-prompt.txt
          
          # Copy the fix-bug command (no rule-request flag for bug fixes)
          cat .cursor/commands/fix-bug.md > "$PROMPT_FILE"
          
          # Append issue-specific details
          cat >> "$PROMPT_FILE" << PROMPT_ISSUE
          
          ---
          
          ## Bug to Fix
          
          **Issue #${ISSUE_NUMBER}**: ${ISSUE_TITLE}
          
          ${ISSUE_BODY}
          
          ---
          
          When complete, open a PR targeting the \`develop\` branch.
          PROMPT_ISSUE
          
          echo "source_ref=$DEFAULT_REF" >> "$GITHUB_OUTPUT"
          echo "target_branch=$TARGET_BRANCH" >> "$GITHUB_OUTPUT"
          echo "prompt_path=$PROMPT_FILE" >> "$GITHUB_OUTPUT"

      - name: Launch Cursor Background Agent
        id: launch
        env:
          CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
        run: |
          PROMPT_FILE='${{ steps.vars.outputs.prompt_path }}'
          
          JSON_PAYLOAD=$(jq -n \
            --rawfile prompt_text "$PROMPT_FILE" \
            --arg repository "https://github.com/${{ github.repository }}" \
            --arg source_ref "${{ steps.vars.outputs.source_ref }}" \
            --arg target_branch "${{ steps.vars.outputs.target_branch }}" \
            --arg model "gemini-3-flash" \
            '{
              model: $model,
              prompt: { text: $prompt_text },
              source: { repository: $repository, ref: $source_ref },
              target: { branchName: $target_branch, autoCreatePr: true, skipReviewerRequest: true }
            }')
          
          RESPONSE=$(curl --fail --silent --show-error \
            --request POST \
            --url https://api.cursor.com/v0/agents \
            --header "Authorization: Bearer ${CURSOR_API_KEY}" \
            --header "Content-Type: application/json" \
            --data "$JSON_PAYLOAD")
          
          AGENT_URL=$(echo "$RESPONSE" | jq -r '.target.url')
          echo "agent_url=$AGENT_URL" >> $GITHUB_OUTPUT

      - name: Comment on issue with agent link
        run: |
          URL='${{ steps.launch.outputs.agent_url }}'
          gh api repos/${{ github.repository }}/issues/${{ github.event.issue.number }}/comments \
            -f body="✅ Launched Cursor Bug Fix Agent. View agent: $URL"
```

**Key Points**:
- No `<!-- rule-request -->` flag (bug fixes don't need expanded tests)
- Copies `.cursor/commands/fix-bug.md` and appends issue details
- Targets `develop` branch

---

### Phase 5: Provided Cursor Commands and Rules

The following files are provided in the starter files. Review and customize as needed.

#### 5.1 `.cursor/commands/implement-rule.md`

Provides comprehensive guidance for implementing new ESLint rules:
- Available utilities table (createRule, ruleTesterTs/Jsx/Json, ASTHelpers)
- Step-by-step implementation guide
- Code examples for rule structure, tests, and index.ts updates
- Quality checklist emphasizing 20+ tests

#### 5.2 `.cursor/commands/fix-bug.md`

Provides guidance for fixing bugs:
- Bug reproduction steps
- Root cause diagnosis
- Regression test requirements
- Quality checklist

#### 5.3 `.cursor/rules/task-completion-standards.mdc`

Defines completion criteria:
- Files checklist (5 locations for new rules)
- Quality checklist (20+ tests, build, lint)
- Common rejection reasons

---

## Warnings & Considerations

### Security Implications
- **GitHub Token Scope**: Ensure `GITHUB_TOKEN` or `PAT_TOKEN` has appropriate permissions for issue comments and PR creation
- **Cursor API Key**: Store securely as GitHub secret; never expose in logs

### Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `CURSOR_API_KEY` | Cursor API authentication for background agents |
| `PAT_TOKEN` | GitHub Personal Access Token for issue/PR operations |

**Note**: No webhook secrets needed - agents comment directly on issues using `gh` CLI or the GitHub API.

### Performance Considerations
- **Short-Circuit Logic**: The research workflow checks for existing research comments to avoid redundant agent launches
- **Linting via lint-diff.ts**: Only lints changed files, not the entire codebase

### Scalability Concerns
- **Rate Limiting**: If many issues are labeled simultaneously, GitHub workflow concurrency groups prevent overlapping runs
- **Agent Costs**: Each Cursor Background Agent run incurs API costs; the short-circuit logic helps minimize unnecessary runs

### Loop Prevention

The system uses `MAX_LOOPS = 10` to prevent infinite loops. After 10 iterations, agents are allowed to complete even if checks fail. This is the sole loop prevention mechanism (no duplicate message detection needed).

### Edge Cases

1. **Research finds multiple partial matches**: The research comment should clearly document all options and let a human decide
2. **Rule name conflicts**: The structure validation should check for existing rules with the same name
3. **Flaky tests**: The test validation should distinguish between actual failures and flaky tests (consider retry logic)
4. **Complex rules requiring multiple files**: Some rules might need helper utilities; the validation should be flexible

---

## Implementation Order

1. **Phase 0**: Copy starter files to eslint-custom-rules repo
2. **Phase 1**: Repository structure setup (labels, templates)
3. **Phase 2**: Deep research workflow
4. **Phase 3**: Test and verify Cursor hooks system
5. **Phase 4**: Add implementation/fix workflows
6. **Phase 5**: Verify commands and rules work correctly

## Success Metrics

- Reduce time from issue creation to PR merge by 70%
- Eliminate manual retries (currently up to 4 per issue)
- Ensure 100% of merged PRs have all required files
- Increase test coverage quality through automated expand-tests prompts
