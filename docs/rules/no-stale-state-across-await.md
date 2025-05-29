# no-stale-state-across-await

> Prevent setting the same state value before and after an async boundary

## Rule Details

This rule prevents a pattern we call **Stale Intermediate State (SIS)**, where a component sets a `useState` value before an async boundary (`await`, `.then()`, `yield`) **and** sets **that same value again** after the boundary, causing the UI to render with a transient, potentially wrong value.

### Examples of **incorrect** code for this rule:

```tsx
const [profile, setProfile] = useState<User | null>(null);

async function loadProfile(id: string) {
  setProfile(null);                        // ❌ 1st update (placeholder)
  const data = await api.get(`/users/${id}`); // async boundary
  setProfile(data);                        // ❌ 2nd update
}
```

### Examples of **correct** code for this rule:

```tsx
// Approach 1: Atomic update (preferred)
const [profile, setProfile] = useState<User | null>(null);

async function loadProfile(id: string) {
  const data = await api.get(`/users/${id}`);
  setProfile(data);                        // ✅ single update after await
}
```

```tsx
// Approach 2: Separate loading state
const [profile, setProfile] = useState<User | null>(null);
const [loading, setLoading] = useState(false);

async function loadProfile(id: string) {
  setLoading(true);                        // ✅ Different state variable
  const data = await api.get(`/users/${id}`);
  setProfile(data);
  setLoading(false);
}
```

```tsx
// Approach 3: Loading sentinel (with explicit disable)
const [profile, setProfile] = useState<User | null | 'loading'>(null);

async function loadProfile(id: string) {
  // The next line introduces an intentional loading sentinel.
  // Disable the rule once to document that intent.
  // eslint-disable-next-line react/no-stale-state-across-await
  setProfile('loading');                   // ✅ 1st update – sentinel
  const data = await api.get(`/users/${id}`); // async boundary
  setProfile(data);                        // ✅ 2nd update – final value
}

// Consumers of profile must now handle the 'loading' variant:
if (profile === 'loading') return <Spinner />;
if (profile === null)      return <EmptyState />;
return <ProfileCard user={profile} />;
```

## Rule Options

This rule has no options.

## When Not To Use It

If your codebase extensively uses the pattern of setting state before and after async operations and you have a different way to handle loading states, you might want to disable this rule.

## Further Reading

- [React useState Hook](https://reactjs.org/docs/hooks-state.html)
- [Handling Async Operations in React](https://reactjs.org/docs/concurrent-mode-suspense.html)
