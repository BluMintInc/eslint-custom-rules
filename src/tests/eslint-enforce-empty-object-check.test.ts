import path from 'path';
import { ruleTesterTs } from '../utils/ruleTester';
import { eslintEnforceEmptyObjectCheck } from '../rules/eslint-enforce-empty-object-check';

const tsconfigRootDir = path.join(__dirname, '..', '..');

ruleTesterTs.run(
  'eslint-enforce-empty-object-check',
  eslintEnforceEmptyObjectCheck,
  {
    valid: [
      `
      function processUserData(userData) {
        if (!userData || Object.keys(userData).length === 0) {
          return null;
        }
        return userData.name || 'Unknown';
      }
      `,
      `
      const config = getConfig();
      if (!config || isEmpty(config)) {
        useDefaultConfig();
      } else {
        applyConfig(config);
      }
      `,
      `
      const count: number | undefined = getCount();
      if (!count) {
        return 0;
      }
      `,
      `
      const isEnabled = getFlag();
      if (!isEnabled) {
        toggle();
      }
      `,
      `
      if (!payload || Object.keys(payload).length <= 0) {
        handle(payload);
      }
      `,
      {
        code: `
        const items: string[] | undefined = getItems();
        if (!items) {
          return [];
        }
        `,
        filename: path.join(tsconfigRootDir, 'src/tests/fixtures/type-aware-array.ts'),
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },
      `
      const callback: () => void = getCallback();
      if (!callback) {
        throw new Error('missing callback');
      }
      `,
      `
      interface User {
        id: string;
        name: string;
      }

      const user: User | null = getUser();
      if (!user) {
        return;
      }
      `,
      {
        code: `
        for (; !config;) {
          config = loadConfig();
        }
        `,
        options: [{ ignoreInLoops: true }],
      },
      `
      if (Object.keys(settings).length === 0) {
        hydrateDefaults();
      }
      `,
      {
        code: `
        const formBag = getBag();
        if (!formBag || Object.keys(formBag).length === 0) {
          return;
        }
        `,
        options: [{ objectNamePattern: ['Bag'] }],
      },
      {
        code: `
        const responsePayload = getResponse();
        if (!responsePayload || lodash.isEmpty(responsePayload)) {
          return;
        }
        `,
        options: [{ emptyCheckFunctions: ['isEmpty'] }],
      },
      {
        code: `
        const payload = getPayload();
        if (!payload || isEmpty(payload)) {
          return;
        }
        `,
        options: [{ emptyCheckFunctions: ['customIsEmpty'] }],
      },
    ],
    invalid: [
      {
        code: `
        function processUserData(userData) {
          if (!userData) {
            return null;
          }
          return userData.name || 'Unknown';
        }
        `,
        errors: [
          { messageId: 'missingEmptyObjectCheck', data: { name: 'userData' } },
        ],
        output: `
        function processUserData(userData) {
          if ((!userData || Object.keys(userData).length === 0)) {
            return null;
          }
          return userData.name || 'Unknown';
        }
        `,
      },
      {
        code: `
        const config = getConfig();
        if (!config) {
          useDefaultConfig();
        } else {
          applyConfig(config);
        }
        `,
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'config' } }],
        output: `
        const config = getConfig();
        if ((!config || Object.keys(config).length === 0)) {
          useDefaultConfig();
        } else {
          applyConfig(config);
        }
        `,
      },
      {
        code: `
        if (!response && shouldLog) {
          logResponse(response);
        }
        `,
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'response' } }],
        output: `
        if ((!response || Object.keys(response).length === 0) && shouldLog) {
          logResponse(response);
        }
        `,
      },
      {
        code: `
        const name = !userProfile ? 'anonymous' : userProfile.name;
        `,
        errors: [
          { messageId: 'missingEmptyObjectCheck', data: { name: 'userProfile' } },
        ],
        output: `
        const name = (!userProfile || Object.keys(userProfile).length === 0) ? 'anonymous' : userProfile.name;
        `,
      },
      {
        code: `
        let options = load();
        while (!options) {
          options = retry();
        }
        `,
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'options' } }],
        output: `
        let options = load();
        while ((!options || Object.keys(options).length === 0)) {
          options = retry();
        }
        `,
      },
      {
        code: `
        let data;
        do {
          data = read();
        } while (!data);
        `,
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'data' } }],
        output: `
        let data;
        do {
          data = read();
        } while ((!data || Object.keys(data).length === 0));
        `,
      },
      {
        code: `
        let config;
        for (; !config; ) {
          config = getConfig();
        }
        `,
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'config' } }],
        output: `
        let config;
        for (; (!config || Object.keys(config).length === 0); ) {
          config = getConfig();
        }
        `,
      },
      {
        code: `
        const payload: Record<string, unknown> | undefined = getPayload();
        if (!payload) {
          return handle(payload);
        }
        `,
        filename: 'src/payload.ts',
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } }],
        output: `
        const payload: Record<string, unknown> | undefined = getPayload();
        if ((!payload || Object.keys(payload).length === 0)) {
          return handle(payload);
        }
        `,
      },
      {
        code: `
        const requestContext = getContext();
        if (!requestContext || requestContext.user) {
          return requestContext;
        }
        `,
        errors: [
          { messageId: 'missingEmptyObjectCheck', data: { name: 'requestContext' } },
        ],
        output: `
        const requestContext = getContext();
        if ((!requestContext || Object.keys(requestContext).length === 0) || requestContext.user) {
          return requestContext;
        }
        `,
      },
      {
        code: `
        const resultBag = getBag();
        if (!resultBag) {
          return null;
        }
        `,
        options: [{ objectNamePattern: ['Bag'] }],
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'resultBag' } }],
        output: `
        const resultBag = getBag();
        if ((!resultBag || Object.keys(resultBag).length === 0)) {
          return null;
        }
        `,
      },
      {
        code: `
        const responsePayload = getResponse();
        if (!responsePayload) {
          return;
        }
        `,
        options: [{ emptyCheckFunctions: ['isEmpty'] }],
        errors: [
          { messageId: 'missingEmptyObjectCheck', data: { name: 'responsePayload' } },
        ],
        output: `
        const responsePayload = getResponse();
        if ((!responsePayload || Object.keys(responsePayload).length === 0)) {
          return;
        }
        `,
      },
      {
        code: `
        const count: Record<string, unknown> | undefined = getCount();
        if (!count) {
          return handle(count);
        }
        `,
        filename: path.join(tsconfigRootDir, 'src/tests/fixtures/type-aware-object.ts'),
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'count' } }],
        output: `
        const count: Record<string, unknown> | undefined = getCount();
        if ((!count || Object.keys(count).length === 0)) {
          return handle(count);
        }
        `,
      },
      {
        code: `
        if (!payload ? handleEmpty() : handlePayload(payload)) {
          process();
        }
        `,
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } }],
        output: `
        if ((!payload || Object.keys(payload).length === 0) ? handleEmpty() : handlePayload(payload)) {
          process();
        }
        `,
      },
      {
        code: `
        const config = getConfig();
        if (!config) {
          apply(config);
        }
        `,
        options: [{ objectNamePattern: ['Bag'] }],
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'config' } }],
        output: `
        const config = getConfig();
        if ((!config || Object.keys(config).length === 0)) {
          apply(config);
        }
        `,
      },
      {
        code: `
        if (!payload || Object.keys(payload).length > 5) {
          handle(payload);
        }
        `,
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } }],
        output: `
        if ((!payload || Object.keys(payload).length === 0) || Object.keys(payload).length > 5) {
          handle(payload);
        }
        `,
      },
      {
        code: `
        const config = load();
        if (!config || Object.keys(config).length === 10) {
          return config;
        }
        `,
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'config' } }],
        output: `
        const config = load();
        if ((!config || Object.keys(config).length === 0) || Object.keys(config).length === 10) {
          return config;
        }
        `,
      },
      {
        code: `
        const islandData = fetchIsland();
        if (!islandData) {
          return islandData;
        }
        `,
        errors: [{ messageId: 'missingEmptyObjectCheck', data: { name: 'islandData' } }],
        output: `
        const islandData = fetchIsland();
        if ((!islandData || Object.keys(islandData).length === 0)) {
          return islandData;
        }
        `,
      },
    ],
  },
);
