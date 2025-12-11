import { ruleTesterTs } from '../utils/ruleTester';
import { enforceStorageContext } from '../rules/enforce-storage-context';

ruleTesterTs.run('enforce-storage-context', enforceStorageContext, {
  valid: [
    `
      import { useLocalStorage } from 'src/contexts/LocalStorage';
      const Component = () => {
        const { setItem, getItem } = useLocalStorage();
        setItem('user-theme', 'dark');
        return getItem('user-theme');
      };
    `,
    `
      import { useSessionStorage } from 'src/contexts/SessionStorage';
      function SessionFeature() {
        const { removeItem } = useSessionStorage();
        removeItem('temp-key');
      }
    `,
    {
      code: `
        const storageService = createStorage();
        storageService.setItem('k', 'v');
        storageService.length;
      `,
    },
    {
      code: `
        localStorage.setItem('mock', 'value');
        sessionStorage.getItem('mock');
      `,
      filename: '/workspace/src/contexts/LocalStorage.tsx',
    },
    {
      code: `
        sessionStorage.setItem('mock', 'value');
        localStorage.getItem('mock');
      `,
      filename: '/workspace/src/contexts/SessionStorage.tsx',
    },
    {
      code: `
        localStorage.clear();
        sessionStorage.clear();
      `,
      filename: '/workspace/src/utils/storage.test.ts',
    },
    {
      code: `
        window.localStorage.setItem('mock', 'value');
      `,
      filename: '/workspace/src/__mocks__/storage.ts',
    },
    {
      code: `
        const polyfill = window.localStorage || createPolyfill();
        polyfill.setItem('key', 'value');
      `,
      filename: '/workspace/src/polyfills/storage.ts',
      options: [{ allow: ['**/polyfills/**'] }],
    },
    `
      const customWindow = { localStorage: 'value' };
      customWindow.localStorage;
    `,
    `
      const { getItem } = useLocalStorage();
      const value = typeof window === 'undefined' ? null : getItem('k');
    `,
    `
      const storageHook = useSessionStorage();
      const value = storageHook.getItem('session-key');
    `,
  ],
  invalid: [
    {
      code: `
        localStorage.setItem('theme', 'dark');
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        sessionStorage.getItem('token');
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        window.localStorage.removeItem('flag');
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        global.sessionStorage.clear();
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        globalThis.localStorage.key(1);
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        const count = localStorage.length;
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        const total = window.sessionStorage['length'];
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        localStorage['setItem']('user', 'abc');
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        const store = window['localStorage'];
        store.getItem('foo');
      `,
      errors: [
        { messageId: 'useStorageContext' },
        { messageId: 'useStorageContext' },
      ],
    },
    {
      code: `
        const store = localStorage;
        store.setItem('abc', '123');
      `,
      errors: [
        { messageId: 'useStorageContext' },
        { messageId: 'useStorageContext' },
      ],
    },
    {
      code: `
        typeof window !== 'undefined' && localStorage.getItem('k');
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        localStorage;
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        sessionStorage ?? useSessionStorage();
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        localStorage.setItem('x', 'y');
      `,
      filename: '/workspace/src/components/storage.test.ts',
      options: [{ allowInTests: false }],
      errors: [{ messageId: 'useStorageContext' }],
    },
  ],
});
