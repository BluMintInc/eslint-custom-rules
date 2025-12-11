# Disallow separate loading state variables that track the loading status of other state (`@blumintinc/blumint/no-separate-loading-state`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule warns when a component introduces a _second_ `useState` pair such as **`[isXLoading, setIsXLoading]`** _or_ **`[isLoadingX, setIsLoadingX]`** whose only job is to track whether **another** piece of state is still being fetched.

BluMint's guideline is to encode the temporary "loading" phase **inside the primary state** itself (with a `'loading'` sentinel or a discriminated-union type). This keeps component APIs minimal, removes two extra re-renders (`true → false`), and prevents drift between the boolean and the data.

### Detection Heuristic

The rule flags any `useState` identifier that matches the configured patterns (defaults: `/^is.*Loading$/i`, `/^isLoading.+/i`) and whose setter is invoked with a truthy value before an async boundary and with a falsy value afterward.

### Scope

React function components & custom hooks. Loading flags that come from external data/state libraries (e.g., Redux selectors, SWR/React Query hooks) are not reported; this rule only targets separate local `useState` loading booleans.

### Allowed Uses

Booleans whose names do not match the patterns (e.g. `isModalOpen`).

### Autofix

Not provided – switching to a sentinel requires manual type widening and consumer updates.

### Options

- `patterns` (`string[]`, optional): Custom regex strings for detecting loading-state variable names. Defaults to `['^is.*Loading$', '^isLoading.+']`.

## Examples

### ❌ Incorrect

```tsx
const [profile, setProfile] = useState<User | null>(null);
const [isProfileLoading, setIsProfileLoading] = useState(false);   // ❌ pattern "isXLoading"

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
const [isLoadingAvatar, setIsLoadingAvatar] = useState(false);   // ❌ pattern "isLoadingX"

async function loadAvatar() {
  setIsLoadingAvatar(true);
  const data = await fetchAvatar();
  setAvatar(data);
  setIsLoadingAvatar(false);
}
```

### ✅ Correct

```tsx
const [profile, setProfile] = useState<User | null | 'loading'>(null);

async function loadProfile(id: string) {
  // eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await
  setProfile('loading');                        // sentinel
  const data = await api.get(`/users/${id}`);
  setProfile(data);
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

After adopting the sentinel you'll usually disable that rule for the intentional double update:

```tsx
// eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await
setProfile('loading');
```

## Benefits

By detecting **both** `isXLoading` _and_ `isLoadingX` patterns, this rule ensures BluMint teams consistently encode loading directly into the primary state, reducing boilerplate and avoiding subtle desynchronisation bugs.
