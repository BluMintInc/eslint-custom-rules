# Require storage access through context providers instead of direct browser APIs (`@blumintinc/blumint/enforce-storage-context`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Direct `localStorage` and `sessionStorage` calls are non-reactive and bypass the storage providers that keep UI state synchronized, handle SSR checks, and centralize error handling. Accessing storage through the context hooks (`useLocalStorage` and `useSessionStorage`) keeps reads/writes observable and type-safe.

## Rule Details

This rule reports any direct access to browser storage, including method calls and property reads on `localStorage`, `sessionStorage`, `window.localStorage`, `global.sessionStorage`, or `globalThis.localStorage`. The rule:

- Allows the context implementations themselves (`LocalStorage.tsx`, `SessionStorage.tsx`)
- Flags all storage methods (`getItem`, `setItem`, `removeItem`, `clear`, `key`) and properties like `length`
- Detects aliases such as `const store = window.localStorage; store.getItem('k')`
- Still triggers when guarded by SSR checks (`typeof window !== 'undefined' && localStorage.getItem(...)`)

## Options

The rule accepts an optional configuration object:

```json
[
  {
    "allowInTests": true,
    "allow": ["**/polyfills/**"]
  }
]
```

- `allowInTests` (default `true`): when `true`, files matching `*.test.*`, `*.spec.*`, or paths containing `__mocks__/` are ignored.
- `allow`: array of glob patterns to permit direct storage access (e.g., polyfills or specialized mocks).

### Examples of **incorrect** code for this rule:

```ts
localStorage.setItem('user-theme', theme);
const token = sessionStorage.getItem('auth-token');
window.localStorage.removeItem('flag');
globalThis.sessionStorage.length;
const store = window['localStorage'];
store.getItem('k'); // aliasing still violates the rule
```

### Examples of **correct** code for this rule:

```ts
import { useLocalStorage } from 'src/contexts/LocalStorage';
import { useSessionStorage } from 'src/contexts/SessionStorage';

const { getItem, setItem, clear } = useLocalStorage();
setItem('user-theme', theme);
const saved = getItem('user-theme');
clear();

const session = useSessionStorage();
session.removeItem('temp');
```

## When Not To Use It

The rule is automatically disabled in `LocalStorage.tsx` and `SessionStorage.tsx`. For intentional polyfills or low-level mocks, either:

- Place them under an allowed glob (`allow` option), or
- Keep them in test/mock files covered by `allowInTests: true`.
