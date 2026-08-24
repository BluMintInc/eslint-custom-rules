import path from 'path';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceEmptyObjectCheck } from '../rules/enforce-empty-object-check';

const tsconfigRootDir = path.join(__dirname, '..', '..');

ruleTesterTs.run('enforce-empty-object-check', enforceEmptyObjectCheck, {
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
    `
      const payload = getPayload();
      if (!payload || 0 >= Object.keys(payload).length) {
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
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-array.ts',
      ),
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
    {
      code: `
        type Config = { required: string } & { optional?: string };
        const config: Config | undefined = getConfig();
        if (!config) {
          return;
        }
        const value = config.required;
        return value;
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    /**
     * A construct-signature-only type carries no data: `Object.keys()` of a class
     * is `[]` unless it declares statics, so the prescribed emptiness check would
     * invert the guard. The name deliberately ends with an object-like suffix, so
     * the naming fallback would report it — only real type information exempts it,
     * which keeps this case from passing vacuously if type-aware parsing is lost.
     */
    {
      code: `
        interface BuilderConstructor {
          new (id: string): { build(): string };
        }
        declare const builderConfig: BuilderConstructor | undefined;
        if (!builderConfig) {
          throw new Error('no builder registered');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    /**
     * The `ComponentType` shape: a union of a call-signature type and a
     * construct-signature type. A union counts as an object when ANY member does,
     * so the constructor member alone used to poison the whole union.
     */
    {
      code: `
        type ViewProps = { id: string };
        type FunctionComponentLike = (props: ViewProps) => unknown;
        interface ComponentClassLike {
          new (props: ViewProps): { render(): unknown };
          displayName?: string;
        }
        type ComponentTypeLike = FunctionComponentLike | ComponentClassLike;
        declare const TokenView: ComponentTypeLike | undefined;
        if (!TokenView) {
          throw new Error('missing view');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    {
      code: `
        type FallbackProps = { id: string };
        interface RendererClass {
          new (props: FallbackProps): { render(): unknown };
        }
        type Renderer = ((props: FallbackProps) => unknown) | RendererClass;
        declare const rendererOptions: Renderer | undefined;
        if (!rendererOptions) {
          throw new Error('missing renderer');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    /**
     * A class reference is exempt as well. It reaches `non-object` through the
     * required `prototype` property the checker puts on every `typeof Class`, so
     * this case guards the documented behaviour rather than the construct-signature
     * branch — the branch is what covers the constructor interfaces above, which
     * carry no properties at all.
     */
    {
      code: `
        class NotificationBuilder {
          build() {
            return 'notification';
          }
        }
        declare const BuilderClass: typeof NotificationBuilder | undefined;
        if (!BuilderClass) {
          throw new Error('no builder registered');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    {
      code: `
        type StrategyConstructor = abstract new (id: string) => { run(): void };
        declare const strategyConfig: StrategyConstructor | undefined;
        if (!strategyConfig) {
          throw new Error('no strategy registered');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    /**
     * The optional spellings of an emptiness check are the SAME guard as the
     * plain one: every `?.` link short-circuits on a nullish receiver, and
     * neither the `Object` global nor the array `Object.keys` hands back is ever
     * nullish. Detection that matched only the plain shape read these as guards
     * missing their emptiness check and appended a duplicate one under `--fix`,
     * corrupting code that was already correct.
     */
    `
      function processUserData(userData) {
        if (!userData || Object?.keys?.(userData)?.length === 0) {
          return null;
        }
        return userData.name || 'Unknown';
      }
      `,
    `
      function processUserData(userData) {
        if (!userData || Object.keys(userData)?.length === 0) {
          return null;
        }
        return userData.name || 'Unknown';
      }
      `,
    `
      if (!userData || Object?.keys(userData).length === 0) {
        handle(userData);
      }
      `,
    `
      if (!userData || Object.keys?.(userData).length === 0) {
        handle(userData);
      }
      `,
    `
      if (!payload || Object.keys(payload)?.length <= 0) {
        handle(payload);
      }
      `,
    `
      const payload = getPayload();
      if (!payload || 0 >= Object.keys(payload)?.length) {
        handle(payload);
      }
      `,
    `
      const payload = getPayload();
      if (!payload || 0 === Object.keys(payload)?.length) {
        handle(payload);
      }
      `,
    `
      const payload = getPayload();
      if (!payload || !Object.keys(payload)?.length) {
        handle(payload);
      }
      `,
    `
      const config = getConfig();
      if (!config || isEmpty?.(config)) {
        useDefaultConfig();
      }
      `,
    {
      code: `
        const responsePayload = getResponse();
        if (!responsePayload || lodash?.isEmpty(responsePayload)) {
          return;
        }
        `,
      options: [{ emptyCheckFunctions: ['isEmpty'] }],
    },
    `
      const name = !userProfile || Object.keys(userProfile)?.length === 0 ? 'anonymous' : userProfile.name;
      `,
    `
      let options = load();
      while (!options || Object.keys(options)?.length === 0) {
        options = retry();
      }
      `,
    `
      let data;
      do {
        data = read();
      } while (!data || Object.keys(data)?.length === 0);
      `,
    `
      let config;
      for (; !config || Object.keys(config)?.length === 0; ) {
        config = getConfig();
      }
      `,
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
          if (!userData || Object.keys(userData).length === 0) {
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
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        const config = getConfig();
        if (!config || Object.keys(config).length === 0) {
          useDefaultConfig();
        } else {
          applyConfig(config);
        }
        `,
    },
    // An `&&` operand keeps its parentheses: `&&` binds tighter than the `||`
    // the fixer emits, so dropping them would rewrite the guard (#2082).
    {
      code: `
        if (!response && shouldLog) {
          logResponse(response);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'response' } },
      ],
      output: `
        if ((!response || Object.keys(response).length === 0) && shouldLog) {
          logResponse(response);
        }
        `,
    },
    {
      code: `
        const responseData = getResponse();
        if (shouldLog && !responseData) {
          logResponse(responseData);
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'responseData' },
        },
      ],
      output: `
        const responseData = getResponse();
        if (
          shouldLog &&
          (!responseData || Object.keys(responseData).length === 0)
        ) {
          logResponse(responseData);
        }
        `,
    },
    // `??` refuses to sit beside `||` unparenthesized at all, so the grouping is
    // a grammar requirement here rather than a precedence one.
    {
      code: `
        const fallbackData = getData();
        if (isReady ?? !fallbackData) {
          handle(fallbackData);
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'fallbackData' },
        },
      ],
      output: `
        const fallbackData = getData();
        if (
          isReady ??
          (!fallbackData || Object.keys(fallbackData).length === 0)
        ) {
          handle(fallbackData);
        }
        `,
    },
    // Parentheses the author already wrote enclose the emission, so the fixer
    // adds none of its own rather than nesting a second redundant pair.
    {
      code: `
        const cachedData = read();
        if (isReady && (!cachedData)) {
          refresh(cachedData);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'cachedData' } },
      ],
      output: `
        const cachedData = read();
        if (isReady && (!cachedData || Object.keys(cachedData).length === 0)) {
          refresh(cachedData);
        }
        `,
    },
    // The nearest enclosing operator decides, not the outermost one: an `&&`
    // nested inside an `||` still demands the grouping.
    {
      code: `
        const meta = read();
        if (isStale || (isReady && !meta)) {
          refresh(meta);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'meta' } },
      ],
      output: `
        const meta = read();
        if (isStale || (isReady && (!meta || Object.keys(meta).length === 0))) {
          refresh(meta);
        }
        `,
    },
    // A ternary branch nested under `&&` takes no parentheses of its own: `?:`
    // binds looser than `||`, and the branch is already delimited by `?` and `:`.
    {
      code: `
        const meta = read();
        if (isReady && (flag ? !meta : isStale)) {
          refresh(meta);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'meta' } },
      ],
      output: `
        const meta = read();
        if (
          isReady &&
          (flag ? !meta || Object.keys(meta).length === 0 : isStale)
        ) {
          refresh(meta);
        }
        `,
    },
    // The RIGHT operand of `||` needs no grouping either: regrouping a run of
    // `||` preserves both the value and the short-circuit order.
    {
      code: `
        const metaInfo = read();
        if (isStale || !metaInfo) {
          refresh(metaInfo);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'metaInfo' } },
      ],
      output: `
        const metaInfo = read();
        if (isStale || !metaInfo || Object.keys(metaInfo).length === 0) {
          refresh(metaInfo);
        }
        `,
    },
    {
      code: `
        const name = !userProfile ? 'anonymous' : userProfile.name;
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'userProfile' },
        },
      ],
      output: `
        const name =
          !userProfile || Object.keys(userProfile).length === 0
            ? 'anonymous'
            : userProfile.name;
        `,
    },
    {
      code: `
        let options = load();
        while (!options) {
          options = retry();
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'options' } },
      ],
      output: `
        let options = load();
        while (!options || Object.keys(options).length === 0) {
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
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'data' } },
      ],
      output: `
        let data;
        do {
          data = read();
        } while (!data || Object.keys(data).length === 0);
        `,
    },
    {
      code: `
        let config;
        for (; !config; ) {
          config = getConfig();
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        let config;
        for (; !config || Object.keys(config).length === 0; ) {
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
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload: Record<string, unknown> | undefined = getPayload();
        if (!payload || Object.keys(payload).length === 0) {
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
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'requestContext' },
        },
      ],
      output: `
        const requestContext = getContext();
        if (
          !requestContext ||
          Object.keys(requestContext).length === 0 ||
          requestContext.user
        ) {
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
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'resultBag' } },
      ],
      output: `
        const resultBag = getBag();
        if (!resultBag || Object.keys(resultBag).length === 0) {
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
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'responsePayload' },
        },
      ],
      output: `
        const responsePayload = getResponse();
        if (!responsePayload || Object.keys(responsePayload).length === 0) {
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
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'count' } },
      ],
      output: `
        const count: Record<string, unknown> | undefined = getCount();
        if (!count || Object.keys(count).length === 0) {
          return handle(count);
        }
        `,
    },
    {
      code: `
        type Mixed = { required: string } | Record<string, unknown>;
        const mixed: Mixed = getPayload();
        if (!mixed) {
          return handle(mixed);
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'mixed' } },
      ],
      output: `
        type Mixed = { required: string } | Record<string, unknown>;
        const mixed: Mixed = getPayload();
        if (!mixed || Object.keys(mixed).length === 0) {
          return handle(mixed);
        }
        `,
    },
    {
      code: `
        type Payload = { a?: string } & { b?: string };
        const payload: Payload | undefined = getPayload();
        if (!payload) {
          return handle(payload);
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        type Payload = { a?: string } & { b?: string };
        const payload: Payload | undefined = getPayload();
        if (!payload || Object.keys(payload).length === 0) {
          return handle(payload);
        }
        `,
    },
    {
      code: `
        if (!payload ? handleEmpty() : handlePayload(payload)) {
          process();
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        if (
          !payload || Object.keys(payload).length === 0
            ? handleEmpty()
            : handlePayload(payload)
        ) {
          process();
        }
        `,
    },
    {
      code: `
        if (flag ? !config : hasConfig(config)) {
          apply(config);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        if (
          flag ? !config || Object.keys(config).length === 0 : hasConfig(config)
        ) {
          apply(config);
        }
        `,
    },
    {
      code: `
        if (flag ? hasConfig(config) : !config) {
          apply(config);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        if (
          flag ? hasConfig(config) : !config || Object.keys(config).length === 0
        ) {
          apply(config);
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
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        const config = getConfig();
        if (!config || Object.keys(config).length === 0) {
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
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          Object.keys(payload).length > 5
        ) {
          handle(payload);
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || Object.keys(payload).length < 0) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          Object.keys(payload).length < 0
        ) {
          handle(payload);
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || 0 > Object.keys(payload).length) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          0 > Object.keys(payload).length
        ) {
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
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        const config = load();
        if (
          !config ||
          Object.keys(config).length === 0 ||
          Object.keys(config).length === 10
        ) {
          return config;
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || !!Object.keys(payload).length) {
          return handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          !!Object.keys(payload).length
        ) {
          return handle(payload);
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
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'islandData' },
        },
      ],
      output: `
        const islandData = fetchIsland();
        if (!islandData || Object.keys(islandData).length === 0) {
          return islandData;
        }
        `,
    },
    /**
     * Negative controls for the callable/constructable carve-out. Both names are
     * outside the naming heuristic, so the report can only come from the type
     * analysis: a data object stays an object even when every property is
     * optional, and a union keeps reporting as long as one member is a data
     * object.
     */
    {
      code: `
        declare const incoming: { a?: string } | undefined;
        if (!incoming) {
          throw new Error('missing payload');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'incoming' } },
      ],
      output: `
        declare const incoming: { a?: string } | undefined;
        if (!incoming || Object.keys(incoming).length === 0) {
          throw new Error('missing payload');
        }
        `,
    },
    {
      code: `
        type OptionalOnly = { retries?: number; verbose?: boolean };
        declare const banner: OptionalOnly | undefined;
        if (!banner) {
          throw new Error('missing banner');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'banner' } },
      ],
      output: `
        type OptionalOnly = { retries?: number; verbose?: boolean };
        declare const banner: OptionalOnly | undefined;
        if (!banner || Object.keys(banner).length === 0) {
          throw new Error('missing banner');
        }
        `,
    },
    {
      code: `
        interface WidgetConstructor {
          new (): { render(): void };
        }
        type WidgetSlot = WidgetConstructor | { fallback?: string };
        declare const slot: WidgetSlot | undefined;
        if (!slot) {
          throw new Error('missing slot');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'slot' } },
      ],
      output: `
        interface WidgetConstructor {
          new (): { render(): void };
        }
        type WidgetSlot = WidgetConstructor | { fallback?: string };
        declare const slot: WidgetSlot | undefined;
        if (!slot || Object.keys(slot).length === 0) {
          throw new Error('missing slot');
        }
        `,
    },
    /**
     * Negative controls for the optional-chain arm. Reading through a
     * `ChainExpression` must recognize the emptiness check it wraps, not accept
     * any chain at all: a presence test, a different object, `Object.values`, a
     * negated emptiness test, and a helper called on another identifier each
     * leave `{}` passing the guard, so each still has to report.
     */
    {
      code: `
        const payload = getPayload();
        if (!payload || Object.keys(payload)?.length > 5) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          Object.keys(payload)?.length > 5
        ) {
          handle(payload);
        }
        `,
    },
    {
      code: `
        const userData = getUser();
        if (!userData || Object.keys(otherData)?.length === 0) {
          handle(userData);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'userData' } },
      ],
      output: `
        const userData = getUser();
        if (
          !userData ||
          Object.keys(userData).length === 0 ||
          Object.keys(otherData)?.length === 0
        ) {
          handle(userData);
        }
        `,
    },
    {
      code: `
        const userData = getUser();
        if (!userData || Object.values(userData)?.length === 0) {
          handle(userData);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'userData' } },
      ],
      output: `
        const userData = getUser();
        if (
          !userData ||
          Object.keys(userData).length === 0 ||
          Object.values(userData)?.length === 0
        ) {
          handle(userData);
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || !(Object.keys(payload)?.length === 0)) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          !(Object.keys(payload)?.length === 0)
        ) {
          handle(payload);
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || !!Object.keys(payload)?.length) {
          return handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          !!Object.keys(payload)?.length
        ) {
          return handle(payload);
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || isEmpty?.(otherPayload)) {
          return;
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          isEmpty?.(otherPayload)
        ) {
          return;
        }
        `,
    },
    {
      code: `
        const config = load();
        if (!config || Object.keys(config)?.length === 10) {
          return config;
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        const config = load();
        if (
          !config ||
          Object.keys(config).length === 0 ||
          Object.keys(config)?.length === 10
        ) {
          return config;
        }
        `,
    },
    /**
     * Print-width coverage (#2095). The widened condition can push the statement
     * it lives in past the print width, and Prettier answers that by breaking
     * the header one operand per line. Every emission below is a fixed point of
     * Prettier 2.8.8 — agora's pin, which is the binary that decides whether a
     * `--fix` run leaves the tree failing `prettier --check`.
     */
    {
      name: 'an over-wide if header breaks one operand per line',
      code: `
        const requestPayload = getPayload();
        if (!requestPayload || Object.keys(requestPayload).length > 5) {
          handle(requestPayload);
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'requestPayload' },
        },
      ],
      output: `
        const requestPayload = getPayload();
        if (
          !requestPayload ||
          Object.keys(requestPayload).length === 0 ||
          Object.keys(requestPayload).length > 5
        ) {
          handle(requestPayload);
        }
        `,
    },
    {
      name: 'an over-wide while header breaks one operand per line',
      code: `
        let optionsRecord = load();
        while (!optionsRecord || retryCounterValue < maximumRetryCount) {
          optionsRecord = retry();
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'optionsRecord' },
        },
      ],
      output: `
        let optionsRecord = load();
        while (
          !optionsRecord ||
          Object.keys(optionsRecord).length === 0 ||
          retryCounterValue < maximumRetryCount
        ) {
          optionsRecord = retry();
        }
        `,
    },
    {
      name: 'an over-wide do-while trailer breaks one operand per line',
      code: `
        let dataRecord;
        do {
          dataRecord = read();
        } while (!dataRecord || retryCounterValue < maximumRetryCount);
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'dataRecord' } },
      ],
      output: `
        let dataRecord;
        do {
          dataRecord = read();
        } while (
          !dataRecord ||
          Object.keys(dataRecord).length === 0 ||
          retryCounterValue < maximumRetryCount
        );
        `,
    },
    /**
     * A parenthesized operand that no longer fits breaks INSIDE its own
     * parentheses, with the closing one glued to the last line — the layout
     * Prettier gives a group, which differs from the one it gives the chain that
     * holds it.
     */
    {
      name: 'a grouped operand breaks inside its own parentheses',
      code: `
        const metaConfigInfo = read();
        if (isStaleAlready || (isReadyToGo && !metaConfigInfo)) {
          refresh(metaConfigInfo);
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'metaConfigInfo' },
        },
      ],
      output: `
        const metaConfigInfo = read();
        if (
          isStaleAlready ||
          (isReadyToGo &&
            (!metaConfigInfo || Object.keys(metaConfigInfo).length === 0))
        ) {
          refresh(metaConfigInfo);
        }
        `,
    },
    /**
     * An assignment breaks after the `=` and lets the conditional break beneath
     * it; a `return` keeps its argument on the keyword's line and breaks only
     * the conditional. The two layouts differ, so both are pinned.
     */
    {
      name: 'an over-wide assignment breaks after the equals sign',
      code: `
        someHolderObject.displayName = !userProfile ? 'anonymous' : userProfile.name;
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'userProfile' },
        },
      ],
      output: `
        someHolderObject.displayName =
          !userProfile || Object.keys(userProfile).length === 0
            ? 'anonymous'
            : userProfile.name;
        `,
    },
    {
      name: 'an over-wide return breaks only the conditional',
      code: `
        function pick() {
          return !userProfile ? 'anonymous' : userProfile.displayName;
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'userProfile' },
        },
      ],
      output: `
        function pick() {
          return !userProfile || Object.keys(userProfile).length === 0
            ? 'anonymous'
            : userProfile.displayName;
        }
        `,
    },
    /**
     * A header Prettier has ALREADY broken is the common case once a condition
     * overflows, so the emitter re-lays it out rather than splicing a one-line
     * guard into the broken form.
     */
    {
      name: 'a header already broken by Prettier is laid out again',
      code: `
        if (
          !payloadRecord ? handleEmptyPayload() : handlePayloadNow(payloadRecord)
        ) {
          process();
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'payloadRecord' },
        },
      ],
      output: `
        if (
          !payloadRecord || Object.keys(payloadRecord).length === 0
            ? handleEmptyPayload()
            : handlePayloadNow(payloadRecord)
        ) {
          process();
        }
        `,
    },
    /**
     * The decline boundary. Each shape below is one whose break Prettier decides
     * by a rule this emitter does not author — it opens a call's argument list,
     * lays a second declarator out under the first, or moves a non-block clause
     * to its own line — so the fix stays the minimal replacement rather than
     * emitting a line `prettier --check` would reject. Declining is not a lost
     * fix: the guard is still added, exactly as it was before the width was
     * measured at all.
     */
    {
      name: 'a comment inside the condition keeps the minimal replacement',
      code: `
        if (!payload /* keep me */ || Object.keys(payload).length > 5) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        if (!payload || Object.keys(payload).length === 0 /* keep me */ || Object.keys(payload).length > 5) {
          handle(payload);
        }
        `,
    },
    {
      name: 'a non-block clause keeps the minimal replacement',
      code: `
        if (!payloadContext || Object.keys(payloadContext).length > 5) return handle();
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'payloadContext' },
        },
      ],
      output: `
        if (!payloadContext || Object.keys(payloadContext).length === 0 || Object.keys(payloadContext).length > 5) return handle();
        `,
    },
    {
      name: 'a second declarator keeps the minimal replacement',
      code: `
        const first = 1,
          second = !userProfile ? 'anonymous' : userProfile.name;
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'userProfile' },
        },
      ],
      output: `
        const first = 1,
          second = !userProfile || Object.keys(userProfile).length === 0 ? 'anonymous' : userProfile.name;
        `,
    },
    {
      name: 'an operand too wide for its own line keeps the minimal replacement',
      code: `
        if (!payloadInfo || someVeryLongPredicateName(argumentOne, argumentTwo, argumentThree, four)) {
          handle(payloadInfo);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payloadInfo' } },
      ],
      output: `
        if (!payloadInfo || Object.keys(payloadInfo).length === 0 || someVeryLongPredicateName(argumentOne, argumentTwo, argumentThree, four)) {
          handle(payloadInfo);
        }
        `,
    },
    /**
     * `printWidth` drives the emission in BOTH directions, against the same
     * fixture pairs: raised, an 86-column header that breaks at the default
     * stays on one line; lowered, a 61-column header that fits at the default
     * breaks. The middle case is the control that pins the default.
     */
    {
      name: 'a raised printWidth keeps an 86-column header on one line',
      options: [{ printWidth: 120 }],
      code: `
        const payload = getPayload();
        if (!payload || Object.keys(payload).length > 5) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (!payload || Object.keys(payload).length === 0 || Object.keys(payload).length > 5) {
          handle(payload);
        }
        `,
    },
    {
      name: 'a lowered printWidth breaks a header that fits at the default',
      options: [{ printWidth: 60 }],
      code: `
        const userData = getUser();
        if (!userData) {
          handle(userData);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'userData' } },
      ],
      output: `
        const userData = getUser();
        if (
          !userData ||
          Object.keys(userData).length === 0
        ) {
          handle(userData);
        }
        `,
    },
    {
      name: 'the same header stays on one line at the default printWidth',
      code: `
        const userData = getUser();
        if (!userData) {
          handle(userData);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'userData' } },
      ],
      output: `
        const userData = getUser();
        if (!userData || Object.keys(userData).length === 0) {
          handle(userData);
        }
        `,
    },
  ],
});
