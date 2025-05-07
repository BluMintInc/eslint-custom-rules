# enforce-storage-context

This rule enforces the use of storage context providers (`src/contexts/LocalStorage.tsx` and `src/contexts/SessionStorage.tsx`) instead of direct browser storage APIs.

## Rule Details

Direct calls to `localStorage` and `sessionStorage` create non-reactive code that won't trigger re-renders when storage changes, leading to stale UI states and synchronization issues. They also lack our standardized error handling, type safety, and utility methods like pattern matching.

This rule prevents these issues by ensuring all storage access happens through our context providers.

### ❌ Incorrect

```tsx
function saveUserPreference(theme: string) {
  localStorage.setItem('user-theme', theme);
}

function getUserPreference(): string | null {
  return localStorage.getItem('user-theme');
}

function clearAllSettings() {
  localStorage.clear();
}

// Using window.localStorage is also flagged
function saveUserPreference(theme: string) {
  window.localStorage.setItem('user-theme', theme);
}

// Using sessionStorage is also flagged
function saveSessionData(data: string) {
  sessionStorage.setItem('session-data', data);
}
```

### ✅ Correct

```tsx
import { useLocalStorage } from 'src/contexts/LocalStorage';

function UserPreferenceManager() {
  const { getItem, setItem, clear } = useLocalStorage();

  const saveUserPreference = (theme: string) => {
    setItem('user-theme', theme);
  };

  const getUserPreference = (): string | null => {
    return getItem('user-theme');
  };

  const clearAllSettings = () => {
    clear();
  };

  // Component implementation...
}
```

```tsx
import { useSessionStorage } from 'src/contexts/SessionStorage';

function SessionDataManager() {
  const { getItem, setItem, removeItem } = useSessionStorage();

  const saveSessionData = (data: string) => {
    setItem('session-data', data);
  };

  const getSessionData = (): string | null => {
    return getItem('session-data');
  };

  const removeSessionData = () => {
    removeItem('session-data');
  };

  // Component implementation...
}
```

## When Not To Use It

This rule should be disabled in the storage context implementation files themselves (`src/contexts/LocalStorage.tsx` and `src/contexts/SessionStorage.tsx`), as they need to access the browser APIs directly. The rule automatically skips checking these files.

## Further Reading

- [React Context API Documentation](https://reactjs.org/docs/context.html)
- [MDN Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
