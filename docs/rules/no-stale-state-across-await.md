# Prevent stale intermediate state across async boundaries (`@blumintinc/blumint/no-stale-state-across-await`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule prevents a pattern called **Stale Intermediate State (SIS)**: when a component sets a `useState` value before an async boundary (`await`, `.then()`, `yield`) **and** sets **that same value again** after the boundary, causing the UI to render with a transient, potentially wrong value.

This rule is particularly valuable for React-heavy frontends as it catches many flicker and race condition bugs that core ESLint rules like `require-atomic-updates` miss.

### ❌ Incorrect

```tsx
const [profile, setProfile] = useState<User | null>(null);

async function loadProfile(id: string) {
  setProfile(null);                        // ❌ 1st update (placeholder)
  const data = await api.get(`/users/${id}`); // async boundary
  setProfile(data);                        // ❌ 2nd update
}
```

### ✅ Correct

**Option 1: Atomic update (preferred)**
```tsx
const [profile, setProfile] = useState<User | null>(null);

async function loadProfile(id: string) {
  const data = await api.get(`/users/${id}`);
  setProfile(data);                        // ✅ single update after await
}
```

**Option 2: Explicit loading sentinel (allowed with disable comment)**
```tsx
const [profile, setProfile] = useState<User | null | 'loading'>(null);

async function loadProfile(id: string) {
  // The next line introduces an intentional loading sentinel.
  // Disable the rule once to document that intent.
  // eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await
  setProfile('loading');                   // ✅ 1st update – sentinel
  const data = await api.get(`/users/${id}`); // async boundary
  setProfile(data);                        // ✅ 2nd update – final value
}
```

## Examples

### Valid Code

```tsx
// Atomic update - no intermediate state
const [data, setData] = useState(null);

async function loadData() {
  const result = await api.get('/data');
  setData(result);
}
```

```tsx
// Conditional calls - may not both execute
const [data, setData] = useState(null);

async function loadData(shouldClear) {
  if (shouldClear) {
    setData(null);
  }
  const result = await api.get('/data');
  if (result.success) {
    setData(result.data);
  }
}
```

```tsx
// Different setters
const [loading, setLoading] = useState(false);
const [data, setData] = useState(null);

async function loadData() {
  setLoading(true);
  const result = await api.get('/data');
  setData(result);
  setLoading(false);
}
```

### Invalid Code

```tsx
// Basic violation
const [data, setData] = useState(null);

async function loadData() {
  setData(null);                    // ❌
  const result = await api.get('/data');
  setData(result);                  // ❌
}
```

```tsx
// Multiple setters violating
const [data, setData] = useState(null);
const [error, setError] = useState(null);

async function loadData() {
  setData(null);                    // ❌
  setError(null);                   // ❌
  try {
    const result = await api.get('/data');
    setData(result);                // ❌
  } catch (err) {
    setError(err);                  // ❌
  }
}
```

## Configuration

This rule has no configuration options. It's enabled by default in the recommended configuration.

```json
{
  "rules": {
    "@blumintinc/blumint/no-stale-state-across-await": "error"
  }
}
```

## When to Disable

Use `eslint-disable-next-line` when you intentionally want to show intermediate loading states:

```tsx
// eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await
setProfile('loading');
const data = await api.get(`/users/${id}`);
setProfile(data);
```
