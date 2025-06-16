# Disallow separate loading state variables, prefer encoding loading state in the primary data state (`@blumintinc/blumint/no-separate-loading-state`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule warns when a component introduces a second `useState` pair such as `[isXLoading, setIsXLoading]` or `[isLoadingX, setIsLoadingX]` whose only job is to track whether another piece of state is still being fetched.

BluMint's guideline is to encode the temporary "loading" phase inside the primary state itself (with a `'loading'` sentinel or a discriminated-union type). This keeps component APIs minimal, removes two extra re-renders (`true → false`), and prevents drift between the boolean and the data.

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
// Bad: Separate loading state
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
// Bad: Another pattern
const [data, setData] = useState([]);
const [isLoadingData, setIsLoadingData] = useState(false);   // ❌ pattern "isLoadingX"
```

### ✅ Correct

```tsx
// Good: "loading" sentinel on the same state
const [profile, setProfile] = useState<User | null | 'loading'>(null);

async function loadProfile(id: string) {
  // eslint-disable-next-line react/no-stale-state-across-await
  setProfile('loading');                        // sentinel
  const data = await api.get(`/users/${id}`);
  setProfile(data);
}
```

```tsx
// Good: Discriminated union type
type DataState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: User[] }
  | { status: 'error'; error: string };

const [dataState, setDataState] = useState<DataState>({ status: 'idle' });
```

```tsx
// Good: Boolean states that don't match loading patterns
const [isOpen, setIsOpen] = useState(false);
const [isVisible, setIsVisible] = useState(true);
const [isEnabled, setIsEnabled] = useState(false);
```

## Benefits

1. **Fewer re-renders**: Eliminates the `true → false` loading state transitions
2. **Prevents state drift**: No risk of loading state getting out of sync with data
3. **Cleaner APIs**: Components have fewer state variables to manage
4. **Type safety**: Discriminated unions provide better TypeScript support

## Migration

When adopting the sentinel pattern, you'll usually need to:

1. Widen the type of your primary state to include the loading sentinel
2. Update consumers to handle the loading state
3. Add an eslint-disable comment for `react/no-stale-state-across-await` if needed

## Related Rules

- `react/no-stale-state-across-await` - You may need to disable this rule when intentionally setting state before and after async operations
