# Discourage separate loading state variables that track the loading status of other state (`@blumintinc/blumint/no-separate-loading-state`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Loading flags that separate "loading status" from the "data itself" often lead to state drift and unnecessary render cycles. This rule suggests encoding the loading phase inside the primary state variable instead.

## Rule Details

This rule identifies `useState` declarations that follow common loading patterns (e.g., `isLoading`, `isProfileLoading`) and track whether they are toggled between truthy and falsy values.

### Why this rule matters

- Boolean toggles can drift from the actual data availability, leading to UI bugs where a spinner shows while data is present, or vice versa.
- Managing multiple related state variables adds mental overhead and extra render cycles.
- Discrimination unions or sentinel values (like `null`, `'loading'`, or `{ status: 'loading' }`) provide a single authoritative source of truth.

### Examples of **incorrect** code for this rule:

```tsx
const [profile, setProfile] = useState<User | null>(null);
const [isProfileLoading, setIsProfileLoading] = useState(false);   // ❌ separate loading flag

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

Example message:

```text
Loading flag "isProfileLoading" might be splitting the source of truth for your data. This rule is a suggestion; complex UIs may legitimately require multiple loading flags. If this separate state is intentional, please use an // eslint-disable-next-line @blumintinc/blumint/no-separate-loading-state comment. Otherwise, consider encoding the loading phase inside the primary state (e.g., using a discriminated union or sentinel value) to prevent state drift.
```

### Examples of **correct** code for this rule:

```tsx
// Using a sentinel value
const [profile, setProfile] = useState<UserProfile | 'loading' | null>(null);

async function loadProfile(id) {
  setProfile('loading');
  const data = await api.get('/users/' + id);
  setProfile(data);
}

// Using a discriminated union (preferred for complex state)
type RemoteData<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

const [profile, setProfile] = useState<RemoteData<UserProfile>>({ status: 'idle' });
```

### ✅ Correct (With disable comment if separate state is intentional)

```tsx
// eslint-disable-next-line @blumintinc/blumint/no-separate-loading-state
const [isGlobalLoading, setIsGlobalLoading] = useState(false);
```

## Options

This rule accepts an options object:

- `patterns`: (Default: `[/^is.*Loading$/i, /^isLoading.+/i]`) An array of regex strings to match loading state variable names.

## When Not To Use It

Disable this rule if you are working on a complex UI where multiple independent loading flags are the clearest way to manage state, or when integrating with libraries that enforce this pattern. Use an `// eslint-disable-next-line @blumintinc/blumint/no-separate-loading-state` comment for local exceptions.

## Further Reading

- [Discriminated Unions in TypeScript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [React Docs: Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
