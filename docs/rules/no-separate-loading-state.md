# Disallow separate loading state variables that track the loading status of other state (`@blumintinc/blumint/no-separate-loading-state`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule warns when a component introduces a _second_ `useState` pair such as `[isXLoading, setIsXLoading]` _or_ `[isLoadingX, setIsLoadingX]` whose only job is to track whether **another** piece of state is still being fetched.

BluMint's guideline is to encode the temporary "loading" phase **inside the primary state** itself (with a `'loading'` sentinel or a discriminated-union type). This keeps component APIs minimal, removes two extra re-renders (`true → false`), and prevents drift between the boolean and the data.

### Detection Heuristic

The rule flags any `useState` identifier that matches:
- `/^is.*Loading$/i` (e.g., `isProfileLoading`, `isDataLoading`)
- `/^isLoading.+/i` (e.g., `isLoadingProfile`, `isLoadingData`)

### Scope

- React function components & custom hooks
- Redux/SWR/React-Query flags are ignored
- Booleans whose names do not match the patterns (e.g., `isModalOpen`) are allowed

## Examples

### ❌ Incorrect

```tsx
const [profile, setProfile] = useState<User | null>(null);
const [isProfileLoading, setIsProfileLoading] = useState(false);   // ❌ pattern "isXLoading"
const [isLoadingAvatar, setIsLoadingAvatar] = useState(false);     // ❌ pattern "isLoadingX"

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

### ✅ Correct

```tsx
const [profile, setProfile] = useState<User | null | 'loading'>(null);

async function loadProfile(id: string) {
  // eslint-disable-next-line react/no-stale-state-across-await
  setProfile('loading');                        // sentinel
  const data = await api.get(`/users/${id}`);
  setProfile(data);
}
```

### ✅ Also Correct

```tsx
// Non-loading boolean states are allowed
const [isModalOpen, setIsModalOpen] = useState(false);
const [isVisible, setIsVisible] = useState(true);

// Different naming patterns are allowed
const [loading, setLoading] = useState(false);
const [busy, setBusy] = useState(false);
```

## Benefits

1. **Fewer re-renders**: Eliminates the `true → false` boolean state changes
2. **Prevents state drift**: No risk of boolean and data getting out of sync
3. **Simpler APIs**: One state variable instead of two
4. **Type safety**: Discriminated unions provide better TypeScript support

## Interaction with Other Rules

After adopting the sentinel pattern, you'll usually need to disable `react/no-stale-state-across-await` for the intentional double update:

```tsx
// eslint-disable-next-line react/no-stale-state-across-await
setProfile('loading');
```

## When Not To Use It

This rule should not be disabled. If you have a legitimate use case for separate loading states that don't match the patterns, consider renaming them to avoid the `isXLoading` or `isLoadingX` patterns.
