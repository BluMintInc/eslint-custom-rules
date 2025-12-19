# Prevent stale intermediate state by disallowing useState setter calls both before and after async boundaries (await, .then(), yield) within the same function (`@blumintinc/blumint/no-stale-state-across-await`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Calling a `useState` setter on both sides of an async boundary leaves the component vulnerable to stale writes. A placeholder or reset that happens before `await`, `.then()`, or `yield` can resolve after later updates and overwrite fresher data, causing flicker or outdated UI. This rule flags those cross-boundary setters to keep state updates atomic and predictable.

## Rule Details

- Triggers when the same `useState` setter is invoked both before and after an async boundary (`await`, `.then()`, or `yield`) inside one function.
- Earlier writes can resolve after the async work completes, replacing the new value with stale data or a loading placeholder.
- Favor a single atomic update after the async work or a dedicated loading flag instead of mutating the same state twice.

### Examples of **incorrect** code for this rule:

```tsx
const [profile, setProfile] = useState<Profile | 'loading'>(null);

async function loadProfile(id: string) {
  setProfile('loading');
  const data = await api.get(`/users/${id}`);
  setProfile(data);
}
```

```tsx
const [profile, setProfile] = useState<Profile | null>(null);

function loadProfile(id: string) {
  setProfile(null);
  api.get(`/users/${id}`).then((data) => {
    setProfile(data);
  });
}
```

### Examples of **correct** code for this rule:

```tsx
const [profile, setProfile] = useState<Profile | null>(null);

async function loadProfile(id: string) {
  const data = await api.get(`/users/${id}`);
  setProfile(data); // single write after await keeps state atomic
}
```

```tsx
const [profile, setProfile] = useState<Profile | null>(null);
const [loading, setLoading] = useState(false);

async function loadProfile(id: string) {
  setLoading(true); // dedicated loading flag
  const data = await api.get(`/users/${id}`);
  setProfile(data);
  setLoading(false);
}
```

### Intentional loading sentinel (discouraged by default)

If you must write a placeholder before the async boundary, document the decision and disable the rule for that line to avoid accidental regressions:

```tsx
// eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await -- using a loading sentinel is intentional for UX
setProfile('loading');
const data = await api.get(`/users/${id}`);
setProfile(data);
```

## How to fix a violation

- Move all calls to the flagged setter so they occur before the async boundary or after it, but not both.
- Prefer a single atomic update after the awaited work, potentially using functional updates when merging data.
- Use a separate loading flag instead of writing placeholder values into the same state.
- When a placeholder before the await is truly required, pair it with an `eslint-disable-next-line` comment explaining the rationale.
