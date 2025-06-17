# Prevent stale intermediate state across async boundaries (`@blumintinc/blumint/no-stale-state-across-await`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule prevents a pattern called **Stale Intermediate State (SIS)**: when a component sets a `useState` value before an async boundary (`await`, `.then()`, `yield`) **and** sets **that same value again** after the boundary, causing the UI to render with a transient, potentially wrong value.

For BluMint's React-heavy frontend, this catches many flicker/race bugs that the core `require-atomic-updates` rule misses.

## Examples

❌ Examples of **incorrect** code for this rule:

```tsx
const [profile, setProfile] = useState<User | null>(null);

async function loadProfile(id: string) {
  setProfile(null);                        // ❌ 1st update (placeholder)
  const data = await api.get(`/users/${id}`); // async boundary
  setProfile(data);                        // ❌ 2nd update
}
```

```tsx
const [profile, setProfile] = useState<User | null>(null);

function loadProfile(id: string) {
  setProfile(null);
  api.get(`/users/${id}`).then(data => {
    setProfile(data);                      // ❌ Stale state across .then()
  });
}
```

```tsx
const [loading, setLoading] = useState(false);

async function fetchData() {
  setLoading(true);                        // ❌ Before async
  const data = await api.get('/data');
  setLoading(false);                       // ❌ After async - same setter
}
```

✅ Examples of **correct** code for this rule:

```tsx
const [profile, setProfile] = useState<User | null>(null);

async function loadProfile(id: string) {
  const data = await api.get(`/users/${id}`);
  setProfile(data);                        // ✅ Single update after await
}
```

```tsx
const [profile, setProfile] = useState<User | null>(null);
const [loading, setLoading] = useState(false);

async function loadProfile(id: string) {
  setLoading(true);                        // ✅ Different setter
  const data = await api.get(`/users/${id}`);
  setProfile(data);                        // ✅ Different setter
}
```

```tsx
const [profile, setProfile] = useState<User | null | 'loading'>(null);

async function loadProfile(id: string) {
  // The next line introduces an intentional loading sentinel.
  // Disable the rule once to document that intent.
  // eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await
  setProfile('loading');                   // ✅ Explicit sentinel with disable
  const data = await api.get(`/users/${id}`);
  setProfile(data);                        // ✅ Final value
}
```

## When to Disable

The rule should be disabled with `eslint-disable-next-line` when you intentionally want to use a loading sentinel pattern. This documents that the double-update is intentional and not a bug.

## Async Boundaries Detected

The rule detects these async boundaries:
- `await` expressions
- `.then()` method calls
- `yield` expressions (in generator functions)

## Why This Rule Exists

This pattern often leads to:
- UI flickering as components render intermediate states
- Race conditions where the wrong data is displayed
- Confusing user experiences during loading states

## Related Rules

- ESLint core: `require-atomic-updates` - catches some similar patterns but misses React-specific cases
