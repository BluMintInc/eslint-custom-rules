# Disallow destructuring renames that are only used to assign back to the original property name (`@blumintinc/blumint/no-unnecessary-destructuring-rename`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Renaming during object destructuring is useful when it resolves naming conflicts or improves clarity. It becomes noise when the renamed variable is only used to assign a property with the original name. That indirection makes readers match two identifiers for no benefit. This rule flags destructuring renames that are used exactly once to populate an object property with the source key name and nothing else.

## Rule Details

- Targets object destructuring where `source: alias` (or `source: alias = default`) is declared.
- Flags when the alias is used exactly once, solely as the value of an object property whose key is `source` and the property is not computed.
- Skips computed property names and aliases that are read more than once or participate in other expressions.
- Stays silent — no report, not merely no fix — when using the original key would change which binding is read. See [When a name conflict suppresses the report](#when-a-name-conflict-suppresses-the-report).
- Skips properties whose original key cannot be used as a binding identifier (for example reserved words), because the alias is required in those cases.

### When a name conflict suppresses the report

Dropping the rename is only safe when the original key means nothing else where the alias lives. When it does mean something else, the rule discards the candidate before reporting it — there is no report-without-a-fix path. Any of these is a conflict:

- The declaring scope already binds the original key.
- A scope between the matched usage and the declaration binds it, so the inlined reference would resolve to that binding instead.
- The key is referenced *freely* anywhere inside the declaring scope, including nested functions — the inlined declaration would capture that reference and silently change what it reads.

A nested scope that declares its **own** binding of the same name does not suppress the report: that binding shadows the inlined name rather than being captured by it, so the rename is still unnecessary.

```ts
// Not reported: the arrow reads a free `nextMatchId` that the inlined
// declaration would capture.
function build(afterData) {
  const { nextMatchId: nextId } = afterData ?? {};
  const inner = () => {
    return nextMatchId;
  };
  return { nextMatchId: nextId, inner };
}

// Reported: the nested `nextMatchId` is a separate binding, not a capture.
function build(afterData) {
  const { nextMatchId: nextId } = afterData ?? {};
  const inner = () => {
    const nextMatchId = 5;
    return nextMatchId;
  };
  return { nextMatchId: nextId, inner };
}
```

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

### When to disable

- You intentionally rename a property and only reassign it to the same key for stylistic or compatibility reasons.
- You rely on a computed property name; the rule already skips these but you can disable it locally if needed.
