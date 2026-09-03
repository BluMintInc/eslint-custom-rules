# Claude Code Guidance

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**As an agent, use as many steps as you need to get to a solution, and do not stop until you are VERY confident in a solution.**

---

# BluMint ESLint Plugin Development Guidelines

This repository contains custom ESLint rules for BluMint. When contributing, follow these guidelines to maintain consistency and quality.

For repository maintenance workflows (triage, automated agents, troubleshooting), see [.claude/skills/repo-maintenance/SKILL.md](.claude/skills/repo-maintenance/SKILL.md).

## Repository Purpose

This ESLint plugin provides **100+ custom rules** for BluMint's TypeScript/React codebase. The rules enforce coding standards, prevent common mistakes, and maintain code quality across BluMint's projects.

## Temporary Files

Place all temporary artifacts (verification checklists, scratch notes, generated logs, etc.) in `.claude/tmp/` to avoid adding stray files to the repository.

## Prerequisites

* **Node.js 22+** (required - see `engines` in package.json)
* npm (comes with Node.js)

## Project Structure

```
eslint-custom-rules/
├── docs/                    # Markdown documentation for each rule
│   └── rules/               # Auto-generated rule documentation
├── scripts/                 # Utility scripts for development
│   ├── make-docs.sh         # Documentation generation script
│   ├── test-release.js      # Release testing script
│   └── update-version.js    # Version update script
├── src/                     # Source code
│   ├── index.ts             # Main entry point with rule exports and recommended config
│   ├── rules/               # ESLint rule implementations
│   ├── tests/               # Jest test suites
│   └── utils/               # Helper functions and utilities
│       ├── ASTHelpers.ts    # AST manipulation helpers
│       ├── createRule.ts    # Rule creation utility
│       ├── ruleTester.ts    # Test utility exports
│       ├── harvestRuleTesterCases.ts  # Collects every fixture without running it
│       └── graph/           # Class graph analysis utilities
│           ├── ClassGraphBuilder.ts
│           ├── ClassGraphSorter.ts
│           └── ClassGraphSorterReadability.ts
├── .devcontainer/           # VS Code devcontainer setup
├── .eslintrc.js             # ESLint configuration for the plugin itself
├── .prettierrc.json         # Prettier configuration
├── .releaserc.json          # Semantic-release configuration
├── jest.config.js           # Jest configuration
├── package.json             # Package manifest
└── tsconfig.json            # TypeScript configuration
```

## Quick Reference

### Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript to `lib/` |
| `npm test` | Run all tests with coverage |
| `npx jest src/tests/my-rule.test.ts` | Run specific test |
| `npm run lint:fix` | Fix linting issues |
| `npm run docs` | Generate documentation |
| `npm run release:dry-run` | Test semantic-release |

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Rule exports and recommended config |
| `src/utils/createRule.ts` | Rule creation helper |
| `src/utils/ruleTester.ts` | Test utility exports (3 variants) |
| `src/utils/harvestRuleTesterCases.ts` | Harvests every declared fixture without executing the suite |
| `src/utils/ASTHelpers.ts` | AST manipulation helpers |
| `src/utils/graph/` | Class graph analysis utilities |

---

## Available Utilities

### createRule Utility

The `createRule` utility from `src/utils/createRule.ts` provides a standardized way to create ESLint rules with TypeScript support:

```typescript
import { ESLintUtils } from '@typescript-eslint/utils';

export const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/BluMintInc/eslint-custom-rules/blob/main/docs/rules/${name}.md`,
);
```

### RuleTester Variants

Three test utilities are available in `src/utils/ruleTester.ts` for different testing scenarios:

| RuleTester | Purpose | When to Use |
|------------|---------|-------------|
| `ruleTesterTs` | TypeScript code testing | Most rules (default) |
| `ruleTesterJsx` | JSX/React code testing | React-specific rules |
| `ruleTesterJson` | JSON file testing | `no-unpinned-dependencies`, etc. |

```typescript
// TypeScript rules
import { ruleTesterTs } from '../utils/ruleTester';

// React/JSX rules
import { ruleTesterJsx } from '../utils/ruleTester';

// JSON rules (e.g., package.json validation)
import { ruleTesterJson } from '../utils/ruleTester';
```

### Harvesting the fixture corpus

`harvestRuleTesterCases()` in `src/utils/harvestRuleTesterCases.ts` returns every
`valid`/`invalid` case the suite declares **without executing any of them**. Use
it to write a guard that must exercise real fixtures rather than documented
snippets — a rule's `valid` list sits on its carve-out boundaries, which is where
cross-rule composition defects live.

```typescript
import { harvestRuleTesterCases } from '../utils/harvestRuleTesterCases';

const harvested = harvestRuleTesterCases();
// Resolve the rule NAME by object identity, never from `suite.name`:
// ~100 of the 311 suites pass a display name that is not a rule name.
const nameByRule = new Map(
  Object.entries(plugin.rules).map(([name, rule]) => [rule, name]),
);
```

**Build the corpus with `src/utils/fixtureCorpus.ts`, never by hand.** It exports
`defineCorpusParsers`, `parserKeyFor`, `parserOptionsFor`, `defaultFilenameFor`
and `LANGUAGE_BY_TESTER` precisely so a guard cannot reintroduce the two silent
losses below. Four guards hand-rolled it anyway and each inherited both — every
one of them importing `fixtureCorpus` for its *other* helpers, so "does it import
the helper?" certified all four clean (#1984). A fifth,
`rule-options-safety.test.ts`, then hand-rolled a corpus by text-scraping suite
sources and was invisible to `fixture-corpus-accounting.test.ts` for a different
reason: that guard only scanned files NAMING a harvest helper, so a corpus built
without one was exempt by construction, and its scans were non-recursive, its
patterns keyed on single spellings, and its positive control planted the very
literals its own regexes were written from (#2245). It converts to
`harvestFixtureCorpus` at 10,624 cases against 565 scraped snippets.

The guard is keyed on BEHAVIOUR rather than spelling as a result: it admits any
file that lints text scraped from suite sources, scans `src/tests/` recursively,
matches the SHAPE of a tester-keyed extension choice rather than one basename
pair, and separately REQUIRES every corpus consumer that lints to route through
`defaultFilenameFor`/`parserKeyFor`/`LANGUAGE_BY_TESTER` or hold an allowlist
entry carrying a measured reason. Write a new guard's corpus with the helper —
an evasion is a defect in the guard, not a licence.

`src/tests/exemption-composition-closure.test.ts` is the reference consumer.
`src/tests/comment-fix-fidelity.test.ts` and
`src/tests/export-surface-integrity.test.ts` are the other two worked examples.

**Ask what a transform REMOVES, not only what it introduces.** Nearly every
closure guard counts violations a fix CREATES. A fixer that deletes the carrier
another rule keys its detection off makes that rule go blind silently, at exit 0,
and was invisible to all of them.
`src/tests/detection-loss-composition-closure.test.ts` is that direction: it
sweeps `invalid` fixtures, runs the composed `--fix` MINUS the victim, and fails
when the victim goes silent. Two things it needs that the introduce-direction
does not:

* **A baseline, because most losses are CORRECT.** 460 of its 540 losses are the
  culprit genuinely repairing the violation. Repair versus blinding turns on
  whether the objectionable construct SURVIVES the rewrite, which no oracle
  decides — so each `culprit -> victim` pair carries the measured reason, and a
  blinding entry carries its issue (#2003, #2312-#2319).
* **A real `parserOptions.project` for checker-driven victims.** Without lib
  files `(typeof X)[number]` degenerates to `any` and the victim goes quiet for a
  reason no consumer has; that faked 161 of 701 candidates. Re-judge as a
  DIFFERENTIAL — if the victim is silent on the PRE-image under the project too,
  the instrument cannot speak and the candidate is KEPT. Put only ONE fixture in
  that program at a time: a snippet with no import or export is a SCRIPT, so
  several at once collide in the global scope and the checker returns error
  types, which reads as exactly the silence being tested for.

Four constraints are load-bearing — read those files before writing another:

* **Match rules by object identity**, not by the name passed to `run`. Name-keyed
  matching silently drops every suite with a display name.
* **Take the filename from `defaultFilenameFor`, never from the TESTER.** A
  fixture's extension is a property of its CODE. `x.ts`/`x.tsx` chosen by tester
  made **106 valid cases across 7 rules** a fatal parse — they hold JSX under
  `ruleTesterTs`, and a `.ts` path forces `ScriptKind.TS`, which
  `ecmaFeatures.jsx: true` does **not** override. Every consumer filters messages
  by `ruleId`, so a fatal parse is indistinguishable from the rule staying silent
  (#1984, and #1859 before it). For the same reason, carry the non-TS testers via
  `LANGUAGE_BY_TESTER` rather than dropping them: `no-unpinned-dependencies` and
  `enforce-typescript-markdown-code-blocks` declare only under `ruleTesterJson` /
  `ruleTesterMarkdown`, and both ship `recommended: 'error'` with
  `fixable: 'code'` (#1860).
* **Exclude only `silentWithoutProgramRuleNames`** — rules MEASURED to report
  nothing under a bare `Linter`, and so able to contribute only a false clean.
  Do **not** exclude `typeAwareRuleNames` (every rule mentioning
  `getParserServices`) to get there. That premise is measured false: all 16
  report, because `@typescript-eslint/parser` returns an ISOLATED single-file
  program even with no `project`, so the `if (!services?.program) return;` guard
  rules use never fires. What is actually missing is cross-FILE resolution,
  which changes an answer rather than withholding it. Dropping all 16 hid a
  fixer deleting comments under `--fix` at `'error'` (#1859, #1877), a renamer
  breaking every importer of an exported binding, and four more shipping fixers
  (#1878 → #1881-#1885). To discount
  one rule whose behaviour here genuinely diverges from production, name that
  rule in the guard's own baseline — a rule-global entry un-gates every other
  arm it participates in (#1839).
* **Assert non-vacuity.** Floors on cases considered, controls that stayed
  silent, and inputs actually rewritten — plus a planted positive *and* negative
  control. A composition guard whose corpus trips nothing passes forever while
  asserting nothing. Assert what the guard SKIPS too: a fatal-parse counter that
  no `expect` reads discards cases in silence, which is how 106 of them went
  unnoticed. And keep a floor just under its measured value — the floors that hid
  #1984 sat at 5,500 against an actual 8,141.

  **Annotate every literal floor with `// measured N` on its own line**, whether
  it sits inline in the `expect` or on the `const NAME = N;` that feeds it.
  `src/tests/guard-floor-annotation.test.ts` reads those annotations statically
  and fails any floor sitting more than 2x under the number beside it, so drift
  becomes a mechanical check instead of a periodic manual sweep (three were
  needed before it existed; one re-cut 47 floors, the worst 41.8x under).
  Unannotated floors are counted as a migration backlog rather than failed —
  adding the annotation as you touch a guard is how the backlog shrinks. Put the
  annotation on the SAME line as the floor: a block comment above an assertion
  block names several populations, and attaching one of them to whichever floor
  follows would invent a measurement nobody made.

**If a guard PERTURBS the fixture rather than reading it, the rewrite needs its
own controls — three of them.** A skip reason is often a property of the
fixtures, not of the rule: `fixer-shadow-capture` parked 21 rules on "no function
block encloses the report" when 13 of them simply had flat fixtures (#1998).
Wrapping the body settles it, but the wrapper is itself a rule input:

* **Neutrality, gated TWO ways.** Lint the bare wrapper and require the rule's
  reports unchanged — then *also* require that no report lands in an inserted
  scaffolding span. A messageId multiset alone is not enough: on 44
  `global-const-style` fixtures it matched exactly while the SUBJECT had swapped
  to the probe's own scaffolding (the rule renamed `ProbeShell`), one report in
  and one out. Carry both, or the control certifies its own contamination.
* **Validity as a DIFFERENTIAL `ts.Program` check.** A reparse misses grammar
  errors (`declare` in a body is TS1184), and an absolute diagnostic count
  rejects everything, since fixtures are full of unresolved names. Accept a
  variant only when it introduces no diagnostic CODE the unwrapped control
  already carries.
* **A modifier chosen per fixture.** A plain wrapper breaks top-level `await`;
  a blanket `async` one cannot be a React component and silenced 104 fixtures of
  a component-keyed rule. Emit `async` only when the region itself awaits.

Ship every wrapper spelling whose gate you rely on: the second neutrality gate
fires only under the class-expression wrapper, so shipping the arrow one alone
would leave it present but never firing — indistinguishable from absent.

### ASTHelpers Class

The `ASTHelpers` class in `src/utils/ASTHelpers.ts` provides common AST operations:

```typescript
class ASTHelpers {
  // Check if a block statement contains an identifier
  static blockIncludesIdentifier(block: TSESTree.BlockStatement): boolean;

  // Recursively check if a node includes an identifier
  static declarationIncludesIdentifier(node: TSESTree.Node | null): boolean;

  // Extract class method dependencies for graph building
  static classMethodDependenciesOf(
    node: TSESTree.Node | null,
    graph: Graph,
    className: string,
  ): string[];

  // Type guard for AST nodes
  static isNode(value: unknown): value is TSESTree.Node;

  // Check if a node contains a return statement
  static hasReturnStatement(node: TSESTree.Node): boolean;

  // Check if a node is exported
  static isNodeExported(node: TSESTree.Node): boolean;

  // Check if a node returns JSX
  static returnsJSX(node: TSESTree.Node): boolean;

  // Check if a function has parameters
  static hasParameters(
    node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration,
  ): boolean;
}
```

### Graph Utilities

The graph utilities in `src/utils/graph/` are used by `class-methods-read-top-to-bottom` for class member ordering:

**Types (`ClassGraphBuilder.ts`):**
```typescript
type GraphNode = {
  name: string;
  type: 'method' | 'property' | 'constructor';
  accessibility?: TSESTree.Accessibility;
  isStatic: boolean;
  dependencies: string[];
};

type Graph = Record<string, GraphNode>;
```

**Classes:**
- `ClassGraphBuilder` - Builds dependency graphs from class declarations
- `ClassGraphSorter` - Abstract base class for sorting algorithms
- `ClassGraphSorterReadability` - DFS-based sorting for readable class layout

These may prove as helpful utilities for other complex rule implementations.

---

## Creating New Rules

### 1. Rule Implementation

Create a new file in `src/rules/` using this template:

```typescript
import { createRule } from '../utils/createRule';

type MessageIds = 'yourMessageId';

export const yourRuleName = createRule<[], MessageIds>({
  name: 'your-rule-name',
  meta: {
    type: 'suggestion', // or 'problem' or 'layout'
    docs: {
      description: 'Clear description of what the rule enforces',
      recommended: 'error', // Default to 'error'. See "Rule Severity Policy" below before choosing anything else.
    },
    fixable: 'code', // 'code' | 'whitespace' | null
    schema: [], // or your options schema
    messages: {
      yourMessageId: 'Your error message here',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      // Your AST visitor methods here
    };
  },
});
```

### Rule Severity Policy

**Default new rules to `'error'`.** Downstream CI, the `PostToolUse` eslint hook,
stop hooks, and agent tooling all key on **error** exit codes — a `'warn'` rule
is invisible to every one of them, so it is effectively unenforced documentation,
not a gate. A finding that only warns ships unaddressed.

Use `'warn'` **only** with a specific, documented reason recorded on the rule's
docs page:

* **"Gradual migration"** is a valid reason *only* if you also record concrete
  graduation criteria and the date/owner for the promotion to `'error'`. An
  open-ended warn with no graduation plan never graduates.
* **"Legitimate exceptions exist"** is **NOT** a reason to use `'warn'`. Handle
  exceptions with inline `eslint-disable-next-line` comments (which force a
  conscious, reviewable opt-out) or with rule options (`ignoredWords`,
  `allowNestedIn`, etc.) — the rule can still be `'error'`.

Declare the severity in **both** places and keep them identical:
`configs.recommended.rules` in `src/index.ts` **and** `meta.docs.recommended` in
the rule source. `src/tests/recommended-severity-consistency.test.ts` asserts
every enabled rule's `meta.docs.recommended` matches its shipped config severity,
so the two cannot silently drift.

### 2. Rule Naming and Organization

* Use kebab-case for rule names
* Be descriptive and action-oriented (e.g., `enforce-`, `require-`, `no-`, `prefer-`)
* Group related rules with common prefixes

### 3. AST Handling

Use TypeScript's AST types from `@typescript-eslint/utils`:

```typescript
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

// Type guards for node types
function isTargetNode(node: TSESTree.Node): node is TSESTree.CallExpression {
  return node.type === AST_NODE_TYPES.CallExpression;
}

// Parent traversal helpers
function findParentOfType<T extends TSESTree.Node>(
  node: TSESTree.Node,
  type: AST_NODE_TYPES,
): T | undefined {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (current.type === type) {
      return current as T;
    }
    current = current.parent as TSESTree.Node;
  }
  return undefined;
}
```

### 4. Rule Configuration

Define schema for rule options when needed:

```typescript
schema: [
  {
    type: 'object',
    properties: {
      yourOption: {
        type: 'array',
        items: { type: 'string' },
        default: ['defaultValue'],
      },
    },
    additionalProperties: false,
  },
],
```

Access options in `create` function:

```typescript
create(context, [options]) {
  const userOptions = {
    ...defaultOptions,
    ...options,
  };
  // ...
}
```

### 5. Error Reporting

Use `context.report()` with `messageId` for errors:

```typescript
context.report({
  node,
  messageId: 'yourMessageId',
  fix(fixer) {
    // Return null if fix isn't possible in some cases
    if (!canFix) return null;
    return fixer.replaceText(node, newText);
  },
});
```

### 6. Performance Considerations

* Cache repeated calculations
* Skip unnecessary processing (e.g., files in `node_modules`)
* Use early returns when possible
* Use `Set`s for O(1) lookups:
  ```typescript
  const CONSTANT_SET = new Set(['value1', 'value2']);
  ```

---

## Writing Tests

### Test File Structure

* Create test files in `src/tests/` directory
* Name the test file the same as the rule file with `.test.ts` extension
* Use the appropriate ruleTester variant:

```typescript
import { ruleTesterTs } from '../utils/ruleTester';
import { yourRuleName } from '../rules/your-rule-name';

ruleTesterTs.run('your-rule-name', yourRuleName, {
  valid: [
    // valid test cases
  ],
  invalid: [
    // invalid test cases with expected errors
  ],
});
```

### Test Setup

* Use the exported `ruleTesterTs`, `ruleTesterJsx`, or `ruleTesterJson`
* **DO NOT** create a new `RuleTester` instance

### Understanding Valid vs Invalid Tests

ESLint rule tests are divided into two categories that serve opposite purposes:

#### Valid (Positive) Tests

**Purpose:** Tests where the code snippet should **NOT** throw an ESLint error. These are examples of "good" code that follows the rule correctly.

Valid tests live inside the `valid: [...]` array. They verify that the rule does **not** produce false positives—i.e., the rule correctly allows code that is acceptable.

```typescript
valid: [
  // Global constants are valid (rule should NOT fire)
  `
  const ROOM_OPTIONS = { disconnectOnPageLeave: true } as const;
  const MyComponent = () => {
    return (
      <div>
        {Object.entries(ROOM_OPTIONS).map(([key, option]) => (
          <Option key={key} label={option.label} icon={option.icon} />
        ))}
      </div>
    );
  };
  `,
],
```

#### Invalid (Negative) Tests

**Purpose:** Tests where the code snippet **SHOULD** throw ESLint errors. These are examples of "bad" code that violates the rule.

Invalid tests live inside the `invalid: [...]` array. Each test must specify the expected error(s) via the `errors` property, which lists the `messageId`(s) the rule should report.

```typescript
invalid: [
  // useMemo with empty dependency array returning object literal (rule SHOULD fire)
  {
    code: `
    const MyComponent = () => {
      const roomOptions = useMemo(() => {
        return {
          disconnectOnPageLeave: true,
        } as const;
      }, []);
      return (
        <div>
          {Object.entries(roomOptions).map(([key, option]) => (
            <Option key={key} label={option.label} icon={option.icon} />
          ))}
        </div>
      );
    };
    `,
    errors: [
      {
        messageId: 'useGlobalConstant',
      },
    ],
  },
],
```

### Why Both Test Types Matter

| Test Type | What It Proves | Common Failure Mode |
|-----------|----------------|---------------------|
| **Valid** | Rule does NOT fire on correct code | **False Positive**: Rule incorrectly flags good code |
| **Invalid** | Rule DOES fire on incorrect code | **False Negative**: Rule fails to catch bad code |

When writing tests, brainstorm scenarios that might cause:
* **False positives** — add these as `valid` tests to ensure the rule doesn't over-trigger
* **False negatives** — add these as `invalid` tests to ensure the rule catches all violations

### Testing Guidelines

* **Be extremely comprehensive** - expect to write 20+ tests per rule
* Cover edge cases:
  - Incorrect AST node types
  - Empty function bodies
  - Invalid function signatures
  - Unusual whitespace or comments
  - Complex nested structures
* **Avoid excessive indentation** in multiline `code` and `output` blocks

### Coverage Verification

```bash
# Run tests with coverage
npm test

# View coverage report
open coverage/lcov-report/index.html
```

Jest is configured with `collectCoverage: true` and outputs to `coverage/` directory.

---

## Registering Rules

After implementing and testing your rule:

1. **Import your rule** at the top of `src/index.ts`:
   ```typescript
   import { yourRuleName } from './rules/your-rule-name';
   ```

2. **Add to the `rules` object**:
   ```typescript
   rules: {
     // ... existing rules
     'your-rule-name': yourRuleName,
   }
   ```

3. **Add to recommended config** (if it should be enabled by default):
   ```typescript
   configs: {
     recommended: {
       rules: {
         // ... existing rules
         '@blumintinc/blumint/your-rule-name': 'error', // Default 'error'; 'warn' needs a documented reason (see "Rule Severity Policy"). Must equal the rule's meta.docs.recommended.
       }
     }
   }
   ```

4. **Ensure the rule name matches** your file name in kebab-case

---

## Documentation

### Generate Documentation

```bash
# Generate rule docs and update README
npm run docs

# Verify documentation
npm run lint:eslint-docs
```

This runs `scripts/make-docs.sh` followed by `eslint-doc-generator`.

### Rule Metadata

Write comprehensive metadata in your rule file:
* Clear description
* Recommended configuration status
* Fixable status
* Examples of valid/invalid code

---

## Development Workflow

1. **Setup**: Run `npm install` to set up all dependencies
2. **Development**:
   * Write rule implementation and tests
   * Run `npm run build` to compile TypeScript
   * Run `npm test` to run all tests
   * Run `npx jest src/tests/<rule>.test.ts` to test specific rule
   * Run `npm run lint:fix` to fix linting issues
3. **Documentation**:
   * Run `npm run docs` to generate/update documentation
   * Run `npm run lint:eslint-docs` to verify documentation

---

## CI/CD & Release Process

### Semantic Release

The project uses **Semantic Release** for automated versioning and publishing:
* Releases are triggered from the `main` branch (see `.releaserc.json`)
* Version bumps are determined by commit message prefixes:
  - `fix:` → patch (1.0.x)
  - `feat:` → minor (1.x.0)
  - `BREAKING CHANGE:` in body → major (x.0.0)

### Conventional Commits

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
```
feat: add new rule for XYZ
fix: correct false positive in ABC rule
docs: update README with new examples
refactor: simplify AST traversal logic
test: add edge case coverage for DEF rule
```

### Release Testing

```bash
# Test what would be released without actually releasing
npm run release:dry-run
```

### Autonomous maintenance (the `maintainer`)

This repo is operated by an autonomous `maintainer` (`/maintainer`, backed by the
deterministic toolkit `scripts/maintainer.ts`), not by humans triaging labels.
It drains the open-issue queue **bugs-before-features, oldest-first** (spawning
`fix-bug` / `implement-rule` per issue), self-merges to `develop`, and on an
empty queue promotes `develop → main` (firing the release) then fast-forwards
`develop` to cure branch drift. The label-driven GitHub-Action agents were
removed — the maintainer acts on **all** open issues; `bug` / `rule-request`
labels only choose which subagent fixes them.

To drive any single open PR to review-clean + CI-green on demand (addressing
CodeRabbit/human comments and fixing failing checks autonomously, committing +
pushing each cycle), the maintainer or a human can run
`npm run pr-autopilot -- --pr=<n>` (see `.github/scripts/pr-autopilot.ts`).

### Release manifest + scope contract

Each release emits a strict, published `release-manifest.json` — an **array**
of `{version, date, rules: [{name, changeType, issues, summary}]}` (newest
first), via `scripts/generate-release-manifest.js` (a `@semantic-release/exec`
prepareCmd). agora re-enables disabled rules by reading each entry's
`rules[].name` verbatim (`sync-eslint-rules.ts`), so the key is `name`, not
`rule`, and the manifest MUST be trustworthy:

* **Every `fix`/`feat` commit's scope must be a real rule name** (one rule per
  commit). Enforced by the `blumint-rule-scope` rule in `commitlint.config.js`
  (commit-msg hook) and the `validate-commit-scopes` CI gate. Cross-cutting
  exceptions are limited to the allowlist in `scripts/allowed-non-rule-scopes.js`.
* The canonical rule-name set is parsed (build-free) from `src/index.ts`'s
  `rules:` map by `scripts/load-rule-names.js` — shared by commitlint, the CI
  gate, and the manifest generator.

On publish, `scripts/dispatch-agora-release.js` fires a `repository_dispatch`
(`eslint-rules-released`) to agora (needs the `AGORA_DISPATCH_TOKEN` secret;
best-effort — dependabot is the backstop). The end-to-end loop is documented in
agora's `.claude/skills/eslint-autonomy/SKILL.md`.

---

## Configuration Files

| File | Purpose |
|------|---------|
| `.releaserc.json` | Semantic-release configuration (branches from `main`) |
| `.prettierrc.json` | Prettier: semicolons, single quotes, 80 width, trailing commas |
| `.eslintrc.js` | ESLint config for the plugin codebase itself |
| `.devcontainer/` | VS Code devcontainer setup |
| `jest.config.js` | Jest: ts-jest preset, coverage enabled |
| `tsconfig.json` | TypeScript configuration |

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@typescript-eslint/utils` | 5.59.6 | ESLint TypeScript utilities |
| `compromise` | 14.14.4 | NLP for verb/noun analysis (`enforce-verb-noun-naming`) |
| `pluralize` | 8.0.0 | Pluralization for naming conventions |
| `minimatch` | 10.0.1 | Glob pattern matching |
| `typescript` | ^4.9.5 | TypeScript compiler |

---

## Development Philosophy

### Quality Over Speed
* Write comprehensive tests (20+ per rule)
* Fix edge cases before shipping
* Prefer false negatives over false positives

### Fail Fast
* Rules should report clear, actionable error messages
* Include suggestions for fixes when possible
* Use auto-fix functionality where appropriate

---

## Code Style & Conventions

### Comments

Write comments that explain **why**, not **how**:
* Design decisions and trade-offs
* Non-obvious behaviors or edge cases
* Business logic requirements

**Do not** write comments that:
* Merely restate what the code does
* Summarize variable assignments

**A-temporal style required**: Use present tense. Avoid "now", "currently", "recently", "new", "old", or references to history.

### TypeScript Conventions

* Trust TypeScript inference for return types
* Use descriptive variable names
* Prefer `const` over `let`
* Use strict equality (`===`)

---

## Acceptance Criteria

All new rules must meet these criteria:

### File Structure (Strict Enforcement)
* The following files must be created/updated for every new rule:
  - `src/index.ts` (Rule export, rules object, recommended config)
  - `src/rules/new-rule.ts`
  - `src/tests/new-rule.test.ts`
  - `docs/rules/new-rule.md`
  - `README.md`
* **Note:** Stop Hooks will block completion if any of these are missing.

### Code Quality
* Rule adheres to ESLint plugin guidelines
* Passes linting and code style checks with zero errors
* Uses `createRule` utility from `src/utils/createRule.ts`
* Leverages `ASTHelpers` for common operations where appropriate

### Testing
* Comprehensive test coverage (minimum 90%)
* Tests include edge cases:
  - Incorrect AST node types
  - Empty function bodies
  - Invalid function signatures
  - Unusual whitespace or comments
  - Complex nested structures
* **Expect to write 20+ tests per rule**
* All tests passing

### Documentation
* Clear and concise documentation including:
  - Description of the rule's purpose
  - Usage instructions
  - Configuration options
  - Examples of correct and incorrect code
* Documentation generated via `npm run docs`
* Documentation verification passes via `npm run lint:eslint-docs`

---

## Troubleshooting

### Common Issues

**Tests failing with parser errors:**
- Ensure you're using the correct ruleTester variant (`ruleTesterTs`, `ruleTesterJsx`, or `ruleTesterJson`)

**Rule not appearing in recommended config:**
- Check that the rule is imported in `src/index.ts`
- Verify it's added to both the `rules` object and `configs.recommended.rules`

**Documentation generation failing:**
- Run `npm run build` first to compile TypeScript
- Ensure rule metadata is complete (description, recommended, fixable)

**Type errors with AST nodes:**
- Import types from `@typescript-eslint/utils`: `TSESTree`, `AST_NODE_TYPES`
- Use type guards for node type narrowing
