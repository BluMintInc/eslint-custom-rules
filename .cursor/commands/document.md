# Create System Documentation

You are tasked with creating a new system documentation file (`.cursor/rules/*.mdc`) from scratch for a code system that currently lacks documentation. This command analyzes the codebase to understand the system's architecture, design patterns, and usage, then creates comprehensive documentation following the established template.

## Insight

System documentation (`.mdc` files) serves as the single source of truth for understanding major code systems. When a new system is implemented but lacks documentation, developers struggle to understand its design philosophy, usage patterns, and critical insights. This command systematically analyzes the codebase to discover the system's structure, patterns, and purpose, then creates documentation that captures both what the system does and why it was designed that way.

## Continuous Execution Requirement

- Execute this workflow end-to-end in a single continuous session.
- Do not stop after each step; proceed immediately to the next.
- Only pause if blocked by missing information (use Interactive MCP tools to ask the user for what you need).
- Before yielding, verify the Definition of Done below.

## Workflow

### 1. Parse Command Arguments

The user will invoke this command with:
1. **Target documentation file name** (e.g., `@new-system.mdc` or `.cursor/rules/new-system.mdc`)
2. **System scope description** (one or two sentences describing what the system does or its scope)

Example invocations:
- `/document @new-system.mdc "A system for handling user authentication and authorization"`
- `/document .cursor/rules/validation.mdc "The validation system provides composable validation rules for form inputs"`

Extract:
- The target file path (resolve `@name.mdc` to `.cursor/rules/name.mdc`)
- The system scope description (use this to guide your discovery process)

### 2. Discover System Files

Based on the system scope description, search the codebase to identify files that belong to this system:

- **Use semantic search**: Search for concepts related to the system scope (e.g., if documenting "validation system", search for "validation", "validators", "form validation")
- **Search by directory patterns**: Look for directories that might contain the system (e.g., `functions/src/util/validation/`, `src/components/validation/`)
- **Search for key terms**: Use `codebase_search` to find files related to the system's purpose
- **Check imports**: Look for files that import from or are imported by system files
- **Identify glob patterns**: Determine appropriate glob patterns for the `globs` field in the frontmatter

Create a comprehensive list of files that belong to the system, organized by directory.

### 3. Analyze System Architecture

Read and analyze the discovered system files to understand:

- **Core Components**: Identify the main classes, functions, utilities, hooks, contexts, or components
- **Key Concepts**: Extract important terms, patterns, and architectural elements
- **Design Patterns**: Identify design patterns used (e.g., factory, builder, facade, observer)
- **Dependencies**: Understand what the system depends on and what depends on it
- **Data Flow**: Understand how data flows through the system
- **Entry Points**: Identify the main APIs or entry points developers use
- **Configuration**: Note any configuration or setup requirements

### 4. Gather Context from Related PRs and Issues

Search for related context that might provide insights:

- **Search GitHub Issues**: Use `codebase_search` or `grep` to find issue references in code comments, then fetch those issues
- **Search for PRs**: Look for recent PRs that might have introduced or modified this system
  - Search commit messages or git history for keywords related to the system
  - If a PR is found, gather its context (description, comments, CodeRabbitAI walkthrough)
- **Search Documentation**: Check if there are any existing docs, comments, or README files that mention this system
- **Search Slack/Knowledge**: If accessible, search for discussions about this system in the knowledge base

### 5. Understand Usage Patterns

Analyze how the system is used throughout the codebase:

- **Find Usage Examples**: Search for files that import or use the system
- **Identify Common Patterns**: Look for recurring usage patterns
- **Extract Real Examples**: Find actual code examples of the system in use
- **Understand Integration Points**: See how the system integrates with other parts of the codebase

### 6. Determine System Purpose and Motivation

Based on your analysis, determine:

- **Why was this system built?**: What problems does it solve? What gap does it fill?
- **What makes developers' lives easier?**: What are the practical benefits?
- **Core insights**: What are the key paradigms or design philosophies?

If context is unclear, use Interactive MCP tools to ask the user for clarification on:
- The original motivation for building this system
- Key pain points it addresses
- Any important design decisions or trade-offs

### 7. Create Documentation

Create the new `.mdc` file following the template from `system-documentation.mdc`:

#### Frontmatter

```markdown
---
description: [One-line description of the system]
globs: [Comma-separated glob patterns matching system files]
alwaysApply: false
---
```

#### Structure Each Section

**Purpose**:
- Write a hook that explains how the system makes developers' lives easier
- Explain core insights or paradigms that drive its design
- Keep it concise but meaningful

**Definitions**:
- List the core terminology and conceptual vocabulary developers need
- Provide clear, concise definitions that explain ideas and patterns, not implementation details
- Include important relationships between concepts so readers understand how they fit together
- Keep concrete classes or modules out of this section (document them under **Core Components** if needed)

**Core Components (Optional)**:
- Document notable classes, modules, or files the system exposes
- Summarize each component's responsibility and how developers interact with it
- Reference the conceptual terminology from the Definitions section where relevant

**Why did we build [System Name]?**:
- Discuss key pain points or motivations
- Explain what gap it fills
- Describe how it improves or simplifies existing processes

**How does this system make developers' lives easier?**:
- Explain common use cases and practical benefits
- Focus on solving real-world problems
- Provide concrete examples

**Directory Structure**:
- List all directories where the system lives
- Briefly describe why these directories exist or how they're organized
- Explain the logical organization

**How to Use [System Name]**:
- Provide multiple subsections, each with complete examples
- Start simple and progressively get more complex
- Focus on **how to use** the system, not implementation details
- Introduce new concepts by their purpose
- Use real code examples from the codebase (ensure they're accurate)

**Critical Insights for Maintainers**:
- **Major deviations from the initial plan**: If you found PR/issue context about design changes, document them. Otherwise, you can skip this section or note that this is the initial implementation.
- **Critical insights discovered**: Document key insights about performance, scalability, design patterns, or architectural decisions
- **Notable assumptions that proved inaccurate**: Document any assumptions you discovered from code analysis or context
- **Important lessons or improvements**: Provide actionable advice for future maintainers


#### A-Temporal Phrasing (CRITICAL)

- **Never use time-coupled language**: Avoid words like "now", "currently", "recently", "new", "old", "temporary"
- **Use present-tense, declarative statements**: Describe what the system does
- **Example**: Instead of "The system was built to solve X", write "The system solves X"
- **Example**: Instead of "We created this to handle Y", write "The system handles Y"

### 8. Verify Documentation Quality

Before completing, verify:

- **Completeness**: All major components and concepts are documented
- **Accuracy**: Code examples match actual implementation
- **Clarity**: Documentation is clear and actionable
- **A-Temporal**: No time-coupled language remains
- **Consistency**: Terminology matches throughout the document
- **Structure**: Follows the template structure from `system-documentation.mdc`
- **Glob Patterns**: The `globs` field accurately matches system files

### 9. Present Summary

After creating the documentation, provide a summary of:

- **What was documented**: List the major sections and concepts covered
- **Key insights captured**: Highlight important design decisions or patterns documented
- **Files included**: List the glob patterns and explain what files they match
- **Usage examples**: Note the types of usage examples included
- **Areas that may need expansion**: If you couldn't fully understand certain aspects, note them for the user to review

## Definition of Done

- System files have been discovered and analyzed
- System architecture has been understood (components, patterns, data flow)
- Related PR/issue context has been gathered (if available)
- Usage patterns have been identified and documented
- Documentation file has been created following the template:
  - Frontmatter with accurate description and globs
  - Purpose section explaining core insights
  - Complete Definitions section
  - "Why did we build" section
  - "How does this make developers' lives easier" section
  - Directory Structure section
  - Comprehensive "How to Use" section with examples
  - Critical Insights section (if applicable)
- All code examples are accurate and reflect current implementation
- A-temporal phrasing throughout (no time-coupled language)
- Documentation quality has been verified
- Summary has been provided

## Quality Guidelines

Your documentation should be:

- **A-Temporal**: Use present-tense, declarative language. Never mention what "was built" or what's "new"
- **Comprehensive**: Cover all major components, concepts, and usage patterns
- **Actionable**: Code examples should be copy-paste ready and accurate
- **Insightful**: Don't just document what the code does—document the design decisions and why the system exists
- **Well-Structured**: Follow the template structure consistently
- **Discoverable**: Use appropriate glob patterns so the documentation is associated with the right files

## Example Workflow

Here's an example of creating documentation for a "Validation System":

1. **Parse**: User invokes `/document @validation.mdc "A composable validation system for form inputs"`
2. **Discover Files**: Search for "validation", find `functions/src/util/edit/validators/`, `src/components/edit/validators/`, etc.
3. **Analyze Architecture**: Read validator files, understand the composable pattern, identify key classes like `Validator`, `ValidationRule`, etc.
4. **Gather Context**: Search for related PRs or issues about validation system
5. **Understand Usage**: Find examples of validators being used in forms
6. **Determine Purpose**: Understand it solves the problem of reusable, composable validation logic
7. **Create Documentation**:
   - Frontmatter with globs: `functions/src/util/edit/validators/**/*,src/components/edit/validators/**/*`
   - Purpose: Explain composable validation paradigm
   - Definitions: Validator, ValidationRule, ValidationError, etc.
   - How to Use: Examples of creating validators, composing them, using in forms
   - Critical Insights: Document the composable pattern, fail-fast behavior, etc.
8. **Verify**: Check examples are accurate, no time-coupled language
9. **Summarize**: Present what was documented

## Important Notes

- **Discovery First**: Spend adequate time discovering all system files before documenting. Missing files means incomplete documentation.
- **Use Real Examples**: Extract actual code examples from the codebase rather than making them up. Ensure they're accurate.
- **Ask for Clarification**: If the system's purpose or scope is unclear, use Interactive MCP tools to ask the user for clarification.
- **Glob Patterns Matter**: Take time to determine accurate glob patterns. They help Cursor associate the documentation with the right files.
- **Document Why, Not Just What**: The "Critical Insights" section is especially valuable—document design decisions, trade-offs, and lessons learned, even if you infer them from code analysis.

