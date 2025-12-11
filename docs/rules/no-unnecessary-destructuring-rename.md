# Avoid destructuring renames that only write back to the original key (`@blumintinc/blumint/no-unnecessary-destructuring-rename`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Renaming during object destructuring is useful when it resolves naming conflicts or improves clarity. It becomes noise when the renamed variable is only used to assign a property with the original name. That indirection makes readers match two identifiers for no benefit. This rule flags destructuring renames that are used exactly once to populate an object property with the source key name and nothing else.

## Rule Details

- Targets object destructuring where `source: alias` (or `source: alias = default`) is declared.
- Flags when the alias is used exactly once, solely as the value of an object property whose key is `source` and the property is not computed.
- Skips computed property names and aliases that are read more than once or participate in other expressions.
- Does not offer a fix when using the original key would shadow another binding in the same or nested scope, preventing semantic changes.

### Examples of **incorrect** code for this rule:

```ts
const { nextMatchId: nextId } = afterData ?? {};
const resultSummaryUpdate: UpdateData<ResultSummary> = {
  nextMatchId: nextId,
};
```

```ts
const { id: renamedId = 'fallback' } = record ?? {};
const payload = { id: renamedId };
```

```ts
function buildUpdate({ token: authToken }: Session) {
  return { token: authToken };
}
```

### Examples of **correct** code for this rule:

```ts
const { nextMatchId } = afterData ?? {};
const resultSummaryUpdate: UpdateData<ResultSummary> = {
  nextMatchId,
};
```

```ts
const { id: userId } = user;
const payload = { userId }; // different key, keeps the clearer name
```

```ts
const { [dynamicKey]: renamedValue } = data;
const update = { [dynamicKey]: renamedValue }; // computed keys are skipped
```

### Options

This rule has no options.

### When to disable

- You intentionally rename a property and only reassign it to the same key for stylistic or compatibility reasons.
- You rely on a computed property name; the rule already skips these but you can disable it locally if needed.
