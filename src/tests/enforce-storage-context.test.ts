import { enforceStorageContext } from '../rules/enforce-storage-context';
import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';

// Test non-JSX code
ruleTesterTs.run('enforce-storage-context', enforceStorageContext, {
  valid: [
    // Valid: Unrelated code
    `const value = 'some value';`,
    `const storage = { getItem: (key) => key };`,
    `const myCustomStorage = { localStorage: { getItem: (key) => key } };`,

    // Valid: Context implementation files should be exempt (non-JSX version)
    {
      code: `
      export function LocalStorage() {
        const getItem = (key: string): string | null => {
          return localStorage.getItem(key);
        };

        const setItem = (key: string, value: string): void => {
          localStorage.setItem(key, value);
        };

        return null;
      }
      `,
      filename: 'src/contexts/LocalStorage.tsx',
    },

    {
      code: `
      export function SessionStorage() {
        const getItem = (key: string): string | null => {
          return sessionStorage.getItem(key);
        };

        const setItem = (key: string, value: string): void => {
          sessionStorage.setItem(key, value);
        };

        return null;
      }
      `,
      filename: 'src/contexts/SessionStorage.tsx',
    },
  ],

  invalid: [
    // Invalid: Direct localStorage method calls
    {
      code: `function saveUserPreference(theme: string) { localStorage.setItem('user-theme', theme); }`,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },
    {
      code: `function getUserPreference(): string | null { return localStorage.getItem('user-theme'); }`,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },
    {
      code: `function clearAllSettings() { localStorage.clear(); }`,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },
    {
      code: `function removeUserPreference() { localStorage.removeItem('user-theme'); }`,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },
    {
      code: `function getStorageKey(index: number) { return localStorage.key(index); }`,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },
    {
      code: `function getStorageLength() { return localStorage.length; }`,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },

    // Invalid: Direct sessionStorage method calls
    {
      code: `function saveSessionData(data: string) { sessionStorage.setItem('session-data', data); }`,
      errors: [{ messageId: 'enforceSessionStorage' }],
    },
    {
      code: `function getSessionData(): string | null { return sessionStorage.getItem('session-data'); }`,
      errors: [{ messageId: 'enforceSessionStorage' }],
    },
    {
      code: `function clearAllSessionData() { sessionStorage.clear(); }`,
      errors: [{ messageId: 'enforceSessionStorage' }],
    },
    {
      code: `function removeSessionData() { sessionStorage.removeItem('session-data'); }`,
      errors: [{ messageId: 'enforceSessionStorage' }],
    },
    {
      code: `function getSessionKey(index: number) { return sessionStorage.key(index); }`,
      errors: [{ messageId: 'enforceSessionStorage' }],
    },
    {
      code: `function getSessionLength() { return sessionStorage.length; }`,
      errors: [{ messageId: 'enforceSessionStorage' }],
    },

    // Invalid: Using window.localStorage
    {
      code: `function saveUserPreference(theme: string) { window.localStorage.setItem('user-theme', theme); }`,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },
    {
      code: `function getUserPreference(): string | null { return window.localStorage.getItem('user-theme'); }`,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },

    // Invalid: Using window.sessionStorage
    {
      code: `function saveSessionData(data: string) { window.sessionStorage.setItem('session-data', data); }`,
      errors: [{ messageId: 'enforceSessionStorage' }],
    },
    {
      code: `function getSessionData(): string | null { return window.sessionStorage.getItem('session-data'); }`,
      errors: [{ messageId: 'enforceSessionStorage' }],
    },

    // Invalid: Using global.localStorage (less common but possible)
    {
      code: `function saveUserPreference(theme: string) { global.localStorage.setItem('user-theme', theme); }`,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },

    // Invalid: Using global.sessionStorage
    {
      code: `function saveSessionData(data: string) { global.sessionStorage.setItem('session-data', data); }`,
      errors: [{ messageId: 'enforceSessionStorage' }],
    },

    // Invalid: Using in conditional statements
    {
      code: `
      function getUserPreference(): string | null {
        if (someCondition) {
          return localStorage.getItem('user-theme');
        }
        return null;
      }
      `,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },

    // Invalid: Using in SSR checks
    {
      code: `
      function getUserPreference(): string | null {
        if (typeof window !== 'undefined') {
          return localStorage.getItem('user-theme');
        }
        return null;
      }
      `,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },

    // Invalid: Using in try/catch blocks
    {
      code: `
      function getUserPreference(): string | null {
        try {
          return localStorage.getItem('user-theme');
        } catch (error) {
          console.error('Error accessing localStorage', error);
          return null;
        }
      }
      `,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },

    // Invalid: Using in complex expressions
    {
      code: `
      function getUserPreferences(): Record<string, string> {
        const theme = localStorage.getItem('user-theme');
        const language = localStorage.getItem('user-language');
        return { theme, language };
      }
      `,
      errors: [
        { messageId: 'enforceLocalStorage' },
        { messageId: 'enforceLocalStorage' },
      ],
    },
  ],
});

// Test JSX code
ruleTesterJsx.run('enforce-storage-context-jsx', enforceStorageContext, {
  valid: [
    // Valid: Using the context providers
    `
    import { useLocalStorage } from 'src/contexts/LocalStorage';

    function Component() {
      const { getItem, setItem, clear } = useLocalStorage();

      const saveUserPreference = (theme) => {
        setItem('user-theme', theme);
      };

      const getUserPreference = () => {
        return getItem('user-theme');
      };

      const clearAllSettings = () => {
        clear();
      };

      return <div />;
    }
    `,

    `
    import { useSessionStorage } from 'src/contexts/SessionStorage';

    function Component() {
      const { getItem, setItem, removeItem } = useSessionStorage();

      const saveSessionData = (data) => {
        setItem('session-data', data);
      };

      const getSessionData = () => {
        return getItem('session-data');
      };

      const removeSessionData = () => {
        removeItem('session-data');
      };

      return <div />;
    }
    `,

    // Valid: Context implementation files should be exempt
    {
      code: `
      export function LocalStorage() {
        const getItem = (key) => {
          return localStorage.getItem(key);
        };

        const setItem = (key, value) => {
          localStorage.setItem(key, value);
        };

        return <div />;
      }
      `,
      filename: 'src/contexts/LocalStorage.tsx',
    },

    {
      code: `
      export function SessionStorage() {
        const getItem = (key) => {
          return sessionStorage.getItem(key);
        };

        const setItem = (key, value) => {
          sessionStorage.setItem(key, value);
        };

        return <div />;
      }
      `,
      filename: 'src/contexts/SessionStorage.tsx',
    },
  ],

  invalid: [
    // Invalid: Using localStorage in JSX components
    {
      code: `
      function Component() {
        const saveUserPreference = (theme) => {
          localStorage.setItem('user-theme', theme);
        };

        return <div onClick={saveUserPreference} />;
      }
      `,
      errors: [{ messageId: 'enforceLocalStorage' }],
    },

    // Invalid: Using sessionStorage in JSX components
    {
      code: `
      function Component() {
        const saveSessionData = (data) => {
          sessionStorage.setItem('session-data', data);
        };

        return <div onClick={saveSessionData} />;
      }
      `,
      errors: [{ messageId: 'enforceSessionStorage' }],
    },
  ],
});
