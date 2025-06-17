# Prevent stale intermediate state by disallowing useState updates both before and after async boundaries (`@blumintinc/blumint/no-stale-state-across-await`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule prevents a pattern called **Stale Intermediate State (SIS)**: when a component sets a `useState` value before an async boundary (`await`, `.then()`, `yield`) **and** sets **that same value again** after the boundary, causing the UI to render with a transient, potentially wrong value.

For React applications, this catches many flicker and race condition bugs that core ESLint rules miss.

## Examples

### ❌ Incorrect

```tsx
// Bad: Same setter called before and after await
function Component() {
  const [profile, setProfile] = useState(null);

  async function loadProfile(id) {
    setProfile(null);                        // ❌ 1st update (placeholder)
    const data = await api.get(`/users/${id}`); // async boundary
    setProfile(data);                        // ❌ 2nd update
  }

  return <div>{profile?.name}</div>;
}

// Bad: Using .then()
function Component() {
  const [profile, setProfile] = useState(null);

  function loadProfile(id) {
    setProfile(null);
    api.get(`/users/${id}`).then(data => {
      setProfile(data);
    });
  }

  return <div>{profile?.name}</div>;
}

// Bad: Using yield
function* Component() {
  const [profile, setProfile] = useState(null);

  function* loadProfile(id) {
    setProfile(null);
    const data = yield api.get(`/users/${id}`);
    setProfile(data);
  }

  return <div>{profile?.name}</div>;
}
```

### ✅ Correct

```tsx
// Good: Atomic update (preferred)
function Component() {
  const [profile, setProfile] = useState(null);

  async function loadProfile(id) {
    const data = await api.get(`/users/${id}`);
    setProfile(data);                        // ✅ single update after await
  }

  return <div>{profile?.name}</div>;
}

// Good: Different setters for different purposes
function Component() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadProfile(id) {
    setLoading(true);                        // ✅ loading state
    const data = await api.get(`/users/${id}`);
    setProfile(data);                        // ✅ data state
    setLoading(false);                       // ✅ loading state
  }

  return <div>{loading ? 'Loading...' : profile?.name}</div>;
}

// Good: Explicit loading sentinel (with disable comment)
function Component() {
  const [profile, setProfile] = useState(null);

  async function loadProfile(id) {
    // The next line introduces an intentional loading sentinel.
    // Disable the rule once to document that intent.
    // eslint-disable-next-line react/no-stale-state-across-await
    setProfile('loading');                   // ✅ 1st update – sentinel
    const data = await api.get(`/users/${id}`);
    setProfile(data);                        // ✅ 2nd update – final value
  }

  return <div>{profile === 'loading' ? <Spinner /> : profile?.name}</div>;
}
```

## When Not To Use

This rule should not be disabled unless you have a specific need for intentional loading sentinels or optimistic updates. In such cases, use `eslint-disable-next-line` to document the intent.

## Options

This rule has no configuration options.

## Implementation Notes

- The rule tracks `useState` declarations and their setter names across function scopes
- It identifies async boundaries: `await` expressions, `yield` expressions, and `.then()` calls
- It reports violations when the same setter is called both before and after any async boundary within the same function
- The rule does not provide auto-fix functionality as choosing between atomic updates, sentinels, or separate loading flags requires human judgment

## Related Rules

- `require-atomic-updates` (ESLint core) - catches some similar patterns but misses React-specific cases
- `react-hooks/exhaustive-deps` - ensures proper dependency arrays for hooks
