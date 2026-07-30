# Enforce logical top-to-bottom grouping of related statements (`@blumintinc/blumint/logical-top-to-bottom-grouping`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

You keep related statements grouped in a logical, top-to-bottom order. You hoist guard clauses above skipped setup, place derived declarations next to their dependencies, keep placeholder declarations near their first use, and lift side effects (like logging) above unrelated initialization. Hook calls stay in place as boundaries so React's Rules of Hooks are preserved; you do not move non-hook statements across hook calls.

You only move placeholder declarations across pure declarations that do not reference the placeholder or its initializer, so closure timing and TDZ behavior remain unchanged.

A derived declaration is only pulled next to its dependency when every statement in between is a pure declaration. An intervening hook call — or any other call-valued initializer — is an ordering barrier: the statement stays put and nothing is reported.

## Rule Details

This rule rearranges statements inside a block to keep the execution flow readable and chronological.

### Examples of incorrect code for this rule:

```typescript
const { id } = props;
const { a } = props.group;
if (id == null) {
  return null;
}
const b = a;
```

```typescript
const { groupTabState } = useGroupRouter();
const group = useGroupDoc();
const extra = 1;
const { id } = group || {};
```

```typescript
let results = [];

console.log('Processing started');

for (const item of items) {
  results.push(processItem(item));
}
```

### Examples of correct code for this rule:

```typescript
const { id } = props;
if (id == null) {
  return null;
}

const { a } = props.group;
const b = a;
```

```typescript
const { groupTabState } = useGroupRouter();
const group = useGroupDoc();
const { id } = group || {};
const extra = 1;
```

```typescript
console.log('Processing started');

let results = [];
for (const item of items) {
  results.push(processItem(item));
}
```

## Autofix Behavior

Each report names one statement and one place to move it, but the moves are coupled:
relocating a statement to satisfy its own adjacency constraint can separate a different
pair and flag that instead. Relocating statements one report at a time therefore never
settles — `--fix` either rewrites the source in a loop or runs out of passes with a
fixable report still standing.

So the fix is not per report. The rule searches for an ordering of the block that
satisfies **every** constraint at once and emits that whole reordering as a single fix,
attached to the first report in the block. Because the emitted ordering is verified to
report nothing, one pass settles the block.

Two consequences worth knowing:

* **A single fix can move several statements.** The reordering is the shortest one the
  search finds, so the diff stays close to the reports, but expect more than the one
  statement a report names.
* **Some reports are not fixable.** Some blocks have constraints that no ordering
  satisfies at once: two derivation chains rooted in separate destructures cannot both
  stay adjacent to their sources, and a declaration can be pulled toward its first use
  by one constraint while another pulls it back toward its dependency. Those blocks are
  reported with no fix — a report you resolve by hand beats a fix that leaves a
  different violation behind. Restructure the block, or disable the rule for it.
* **Comments travel with the statement they annotate.** A comment sharing a line with a
  statement moves with it; a comment on its own line above a statement is treated as
  that statement's preamble and moves with it too.

## When Not To Use It

Disable this rule if you intentionally rely on non-linear ordering (e.g., staged startup logging for distributed tracing) or need to keep audit/compliance logging after initialization even when it breaks top-to-bottom grouping.

