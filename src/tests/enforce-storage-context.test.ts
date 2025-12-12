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
        localStorage.setItem('mock', 'value');
      `,
      filename: 'C:\\\\repo\\\\src\\\\contexts\\\\LocalStorage.tsx',
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
        window.localStorage.getItem('mock');
      `,
      filename: 'C:\\\\repo\\\\src\\\\__mocks__\\\\storage.ts',
    },
    {
      code: `
        const polyfill = window.localStorage || createPolyfill();
        polyfill.setItem('key', 'value');
      `,
      filename: '/workspace/src/polyfills/storage.ts',
      options: [{ allow: ['**/polyfills/**'] }],
    },
    {
      code: `
        const polyfill = window.sessionStorage || createPolyfill();
        polyfill.getItem('key');
      `,
      filename: 'C:\\\\repo\\\\polyfills\\\\storage.ts',
      options: [{ allow: ['**/polyfills/**'] }],
    },
    `
      const customWindow = { localStorage: 'value' };
      customWindow.localStorage;
    `,
    `
      const config = { localStorage: { setItem: () => {} } };
      const { localStorage: cfg } = config;
      cfg.setItem('value', 'x');
    `,
    `
      const { getItem } = useLocalStorage();
      const value = typeof window === 'undefined' ? null : getItem('k');
    `,
    `
      const storageHook = useSessionStorage();
      const value = storageHook.getItem('session-key');
    `,
    `
      const localStorage = createMockStorage();
      localStorage.setItem('mock', 'value');
    `,
    `
      function save(localStorage: Storage) {
        localStorage.setItem('k', 'v');
      }
    `,
    `
      if (featureFlag) {
        const sessionStorage = createMockStorage();
        sessionStorage.getItem('k');
      }
    `,
    `
      const window = { localStorage: createMockStorage() };
      window.localStorage.setItem('k', 'v');
    `,
    `
      try {
        throw new Error('boom');
      } catch (localStorage) {
        localStorage.message;
      }
    `,
    `
      function localStorage() {
        return 'shadowed';
      }
      localStorage();
    `,
    `
      const fn = function localStorage() {
        return 'shadowed';
      };
      fn();
    `,
    `
      const Box = class localStorage {
        value() {
          return localStorage;
        }
      };
      Box.prototype.value();
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
        const storage = localStorage;
        function inner() {
          const storage = createStorage();
          return storage;
        }
        storage.setItem('k', 'v');
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
        const value = (localStorage satisfies Storage).getItem('k');
      `,
      errors: [
        { messageId: 'useStorageContext' },
        { messageId: 'useStorageContext' },
      ],
    },
    {
      code: `
        const store = (window.sessionStorage satisfies Storage);
        store.clear();
      `,
      errors: [
        { messageId: 'useStorageContext' },
        { messageId: 'useStorageContext' },
      ],
    },
    {
      code: `
        const obj = { localStorage };
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
    {
      code: `
        let store;
({ localStorage: store } = window);
store.setItem('k', 'v');
      `,
      errors: [
        { messageId: 'useStorageContext', line: 3, column: 4 },
        { messageId: 'useStorageContext', line: 4, column: 7 },
      ],
    },
    {
      code: `
        type localStorage = {};
        const cache = localStorage;
        cache.setItem('k', 'v');
      `,
      errors: [
        { messageId: 'useStorageContext' },
        { messageId: 'useStorageContext' },
      ],
    },
    {
      code: `
        class StoreShim { localStorage = createStorage(); }
        localStorage.getItem('k');
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        class Scoped {
          static {
            const localStorage = createMockStorage();
            localStorage.setItem('temp', 'v');
          }
        }
        localStorage.setItem('final', 'v');
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
    {
      code: `
        namespace StorageScope {
          const localStorage = createMockStorage();
          localStorage.setItem('namespaced', 'v');
        }
        localStorage.setItem('outer', 'v');
      `,
      errors: [{ messageId: 'useStorageContext' }],
    },
  ],
});
