# Update System Documentation

You are tasked with updating an existing system documentation file (`.cursor/rules/*.mdc`) to reflect changes made in a Pull Request. This command ensures that system documentation stays current with code changes and captures important design insights that may exist outside the code itself.

## Insight

System documentation (`.mdc` files) serves as the single source of truth for understanding major code systems. When systems evolve through PRs, the documentation must evolve too. PR descriptions, comments, and associated issues often contain valuable context about design decisions, motivations, and insights that aren't obvious from code diffs alone. This command systematically gathers that context and updates the documentation accordingly.

## Continuous Execution Requirement

- Execute this workflow end-to-end in a single continuous session.
- Do not stop after each step; proceed immediately to the next.
- Only pause if blocked by missing information (use Interactive MCP tools to ask the user for what you need).
- Before yielding, verify the Definition of Done below.

## Workflow

### 1. Parse Command Arguments

The user will invoke this command with a target documentation file, for example:
- `/update-documentation @geolocation.mdc`
- `/update-documentation .cursor/rules/geolocation.mdc`

Extract the target file path. If the user provided a reference like `@geolocation.mdc`, resolve it to the full path `.cursor/rules/geolocation.mdc`.

**Optional PR Number**: If the user provided a PR number (e.g., `/update-documentation @geolocation.mdc PR#37046`), use that. Otherwise, proceed to step 2 to determine the PR from the current branch.

### 2. Gather PR Context

First, determine the PR number. If the user invoked this command with a PR number argument, use that. Otherwise, get the current branch and fetch the associated PR number:

```bash
# Get current branch
current_branch=$(git rev-parse --abbrev-ref HEAD)

# Get PR number for current branch
pr_number=$(gh pr list --head "$current_branch" --json number --jq '.[0].number')
```

If no PR is found, ask the user to specify a PR number or ensure they're on a branch with an associated PR.

Then collect the following information:

- **PR Diff**: Use `run_terminal_cmd` to execute `gh pr diff <PR_NUMBER> | cat` to get the files changed
- **PR Description**: Use `run_terminal_cmd` to execute `gh pr view <PR_NUMBER> --json body --jq .body | cat`
- **PR Title**: Use `run_terminal_cmd` to execute `gh pr view <PR_NUMBER> --json title --jq .title | cat`
- **CodeRabbitAI Walkthrough**: Use `run_terminal_cmd` to execute `gh pr view <PR_NUMBER> --json comments --jq '.comments[] | select(.author.login == "coderabbitai") | .body' | cat | head -n 200` to get walkthrough comments (these often contain architectural insights)
- **All PR Comments**: Use `run_terminal_cmd` to execute `gh pr view <PR_NUMBER> --json comments --jq '.comments[] | {author: .author.login, body: .body}' | cat` to capture design discussions
- **Associated GitHub Issues**: Extract issue references from the PR description (e.g., #123, closes #456), then fetch each issue with `gh issue view <ISSUE_NUMBER> --json title,body --jq '{title, body}' | cat`
- **PR Merge Status**: Check if PR is merged with `gh pr view <PR_NUMBER> --json state,merged,baseRefName --jq '{state, merged, baseRefName}' | cat`

### 3. Read Current Documentation

Read the target documentation file to understand its current structure and content:

- Read the entire `.mdc` file
- Note the sections present (Purpose, Definitions, Directory Structure, How to Use, Critical Insights, etc.)
- Identify the system's current documented behavior and design philosophy

### 4. Analyze Changes Relevant to the System

Based on the PR diff and the target system documentation, perform a focused analysis:

- **Map File Changes to System**: Identify which changed files belong to the system being documented (based on the `globs` pattern in the `.mdc` file's frontmatter)
- **Identify System-Specific Changes**: Filter the PR diff to focus on files that match the system's glob patterns
- **Extract New Concepts**: Look for:
  - New classes, functions, or utilities introduced
  - New patterns or architectural decisions
  - Changes to existing APIs or behaviors
  - New use cases or capabilities
- **Identify Removed Functionality**: Note any deprecated or removed features
- **Capture Design Insights**: From PR description, comments, and issues, extract:
  - Rationale for changes
  - Design decisions and trade-offs
  - Lessons learned during implementation
  - Assumptions that were validated or invalidated
  - Performance, security, or scalability considerations

### 5. Analyze PR Context for Insights

Review the gathered PR context (description, comments, issues) to extract insights that should be documented:

- **Design Rationale**: What motivated these changes? What problems do they solve?
- **Architectural Decisions**: Were there alternative approaches considered? Why was this approach chosen?
- **Implementation Insights**: What did the developers learn during implementation?
- **Edge Cases Discovered**: Were there unexpected edge cases or gotchas discovered?
- **Performance Considerations**: Were there performance optimizations or concerns?
- **Breaking Changes**: Are there any breaking changes that need to be highlighted?
- **Migration Notes**: If applicable, are there migration paths or upgrade notes?

### 6. Update Documentation

Update the target `.mdc` file following these guidelines:

#### A-Temporal Phrasing (CRITICAL)
- **Never use time-coupled language**: Avoid words like "now", "currently", "recently", "new", "old", "temporary", "added", "removed", "changed"
- **Use present-tense, declarative statements**: Describe what the system does, not what changed
- **Example**: Instead of "The system now uses GeoEligibilityCache", write "The system uses GeoEligibilityCache"
- **Example**: Instead of "We added write-through caching", write "The system implements write-through caching"

#### Update Sections as Needed

**Definitions Section**:
- Add new terminology or conceptual vocabulary introduced by the PR
- Update existing definitions if their meaning has changed
- Remove definitions for deprecated concepts (but consider documenting deprecation in Critical Insights)
- Move descriptions of concrete classes or modules to a **Core Components** section instead of Definitions

**Directory Structure**:
- Update if new directories were added or structure changed
- Use directory tree diagram syntax with code blocks:
  ```text
  path/to/
  ├── directory1/              # Description
  │   ├── file1.ts            # Description
  │   └── file2.ts            # Description
  └── directory2/              # Description
      └── file3.ts            # Description
  ```
- Include inline comments describing what each directory/file contains
- Keep descriptions of why directories exist

**How to Use Section**:
- Add new usage examples for new functionality
- Update existing examples if APIs or behaviors changed
- Add subsections for new use cases or patterns
- Remove or mark deprecated usage patterns

**Critical Insights for Maintainers**:
- **Major deviations from the initial plan**: Add entries for significant design changes
- **Critical insights discovered**: Add insights about performance, scalability, design patterns, or architectural decisions
- **Notable assumptions that proved inaccurate**: Document assumptions that were validated or invalidated during implementation
- **Important lessons or improvements**: Add actionable advice for future maintainers

**Purpose Section**:
- Update if the system's role or scope has evolved
- Keep it focused on how the system makes developers' lives easier

**Why did we build this system?**:
- Update if new motivations or pain points were addressed

#### Code Examples
- Ensure all code examples are accurate and reflect current implementation
- Update import paths if they changed
- Update function signatures if APIs changed
- Add examples for new functionality

### 7. Verify Documentation Quality

Before completing, verify:

- **Completeness**: All new functionality is documented
- **Accuracy**: Code examples match current implementation
- **Clarity**: Documentation is clear and actionable
- **A-Temporal**: No time-coupled language remains
- **Consistency**: Terminology matches throughout the document
- **Structure**: Follows the template structure from `system-documentation.mdc`

### 8. Present Summary

After updating the documentation, provide a summary of:

- **What was updated**: List the specific sections and changes made
- **Key insights captured**: Highlight important design decisions or lessons learned that were documented
- **New concepts added**: List any new definitions, usage patterns, or critical insights added
- **Breaking changes**: If any, highlight them clearly

## Definition of Done

- PR context has been successfully gathered (diff, description, title, CodeRabbitAI comments, PR comments, associated issues)
- Current documentation has been read and understood
- Changes relevant to the system have been identified and analyzed
- PR context has been analyzed for design insights and rationale
- Documentation has been updated with:
  - New functionality documented
  - Updated code examples
  - New critical insights added
  - A-temporal phrasing throughout (no time-coupled language)
- All sections remain accurate and consistent
- Summary of changes has been provided

## Quality Guidelines

Your documentation updates should be:

- **A-Temporal**: Use present-tense, declarative language. Never mention what "changed" or what's "new"
- **Comprehensive**: Capture not just what changed, but why it changed and what insights were gained
- **Actionable**: Code examples should be copy-paste ready and accurate
- **Insightful**: Don't just document what the code does—document the design decisions and lessons learned
- **Consistent**: Maintain the same tone, structure, and level of detail as the existing documentation

## Example Workflow

Here's an example of updating `geolocation.mdc` after PR #37046:

1. **Parse**: User invokes `/update-documentation @geolocation.mdc`
2. **Gather PR Context**: Fetch PR #37046 diff, description, comments, and associated issues
3. **Read Current Docs**: Read `.cursor/rules/geolocation.mdc` to understand current structure
4. **Analyze Changes**: Identify that `GeoEligibilityCache` was added, `pingGeo` response format changed, write-through pattern introduced
5. **Extract Insights**: From PR comments, capture that the write-through pattern could be generalized, that IP encoding handles CIDR notation, etc.
6. **Update Documentation**:
   - Add `GeoEligibilityCache` to Definitions
   - Add new "Using GeoEligibilityCache Manually" section
   - Update "Client-Side Geo Ping" section with cache behavior details
   - Add critical insights about write-through pattern and conditional GeoPing ID
   - Ensure all language is a-temporal
7. **Verify**: Check that all changes are documented, examples are accurate, no time-coupled language remains
8. **Summarize**: Present what was updated and key insights captured

## Important Notes

- **Focus on the System**: While PRs may change many files, focus documentation updates on changes relevant to the target system (matching its glob patterns)
- **Capture Context**: PR descriptions, comments, and issues often contain valuable context that isn't in code. Make sure to capture and document these insights
- **Preserve Structure**: Maintain the existing documentation structure unless the system's scope has fundamentally changed
- **Document Why, Not Just What**: The "Critical Insights" section is especially valuable—document design decisions, trade-offs, and lessons learned

