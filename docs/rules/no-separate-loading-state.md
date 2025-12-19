# Disallow separate loading state variables that track the loading status of other state (`@blumintinc/blumint/no-separate-loading-state`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule warns when a component introduces a _second_ `useState` pair such as **`[isXLoading, setIsXLoading]`** or **`[isLoadingX, setIsLoadingX]`** whose only job is to track whether **another** piece of state is still being fetched.

Separate loading booleans split the source of truth for fetching state. The flag can drift from the data (`false` before the data arrives, `true` after an error), and the extra toggles add renders without exposing the data's real lifecycle. Encode the loading phase inside the primary state instead (for example with a `'loading'` sentinel or a discriminated union) so every consumer reads a single authoritative value.

### Detection Heuristic

The rule flags any `useState` identifier that matches `/^is.*Loading$/i` or `/^isLoading.+/i` and whose setter is invoked with a truthy value before an async boundary and with a falsy value afterward. This heuristic targets booleans that mirror a separate piece of state instead of representing the data directly.

### Scope

React function components and custom hooks. Redux/SWR/React-Query flags are ignored.

### Allowed Uses

Booleans whose names do not match the patterns (for example `isModalOpen`) are allowed.

### Autofix

Not provided – switching to a sentinel or discriminated union requires manual type updates and consumer changes.

### Options

- `patterns` (`string[]`, optional): Custom regex strings for detecting loading-state variable names. Defaults to `['^is.*Loading$', '^isLoading.+']`.

## Examples

### ❌ Incorrect

```tsx
const [profile, setProfile] = useState<User | null>(null);
const [isProfileLoading, setIsProfileLoading] = useState(false);   // ❌ duplicate loading flag

async function loadProfile(id: string) {
  setIsProfileLoading(true);
  try {
    const data = await api.get(`/users/${id}`);
    setProfile(data);
  } finally {
    setIsProfileLoading(false);
  }
}
```

```tsx
const [avatar, setAvatar] = useState(null);
const [isLoadingAvatar, setIsLoadingAvatar] = useState(false);   // ❌ duplicate loading flag

async function loadAvatar() {
  setIsLoadingAvatar(true);
  const data = await fetchAvatar();
  setAvatar(data);
  setIsLoadingAvatar(false);
}
```

### ✅ Correct

```tsx
const [profile, setProfile] = useState<User | 'loading' | { kind: 'error'; message: string } | null>(null);

async function loadProfile(id: string) {
  setProfile('loading');                        // sentinel to mark the fetch lifecycle
  try {
    const data = await api.get(`/users/${id}`);
    setProfile(data);
  } catch (error) {
    setProfile({ kind: 'error', message: (error as Error).message });
  }
}
```

```tsx
// Boolean states that don't match loading patterns are allowed
const [isModalOpen, setIsModalOpen] = useState(false);
const [isVisible, setIsVisible] = useState(true);

function toggleModal() {
  setIsModalOpen(!isModalOpen);
}
```

## Interaction with react/no-stale-state-across-await

Disable `react/no-stale-state-across-await` when intentionally double updating:

```tsx
// eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await
setProfile('loading');
```

## Benefits

By detecting **both** `isXLoading` and `isLoadingX` patterns, this rule keeps loading semantics co-located with the data they describe, removes redundant renders (`true → false`), and prevents desynchronisation between a boolean flag and the actual fetch result.
