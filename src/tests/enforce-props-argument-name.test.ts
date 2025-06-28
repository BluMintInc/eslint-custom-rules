import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import { enforcePropsArgumentName } from '../rules/enforce-props-argument-name';

// Run non-JSX tests
ruleTesterTs.run('enforce-props-argument-name', enforcePropsArgumentName, {
  valid: [
    // Function with correct props naming
    {
      code: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User(props: UserProps) {
          return props.name;
        }
      `,
    },
    // Arrow function with correct props naming
    {
      code: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (props: ButtonProps) => {
          return props.label;
        };
      `,
    },
    // Class with correct props naming
    {
      code: `
        type PendingStrategyProps = {
          tournament: Tournament;
          match: MatchAggregated;
        };
        class PendingStrategy {
          constructor(props: PendingStrategyProps) {
            // ...
          }
        }
      `,
    },
    // Function with correct props naming and destructuring
    {
      code: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User(props: UserProps) {
          const { name, age } = props;
          return name;
        }
      `,
    },
    // Function with primitive parameter (should be ignored)
    {
      code: `
        function getId(id: string) {
          return id;
        }
      `,
    },
    // Function with multiple parameters (should be ignored)
    {
      code: `
        function createUser(name: string, age: number) {
          return { name, age };
        }
      `,
    },
    // Function with any parameter name is now allowed
    {
      code: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User(config: UserProps) {
          return config.name;
        }
      `,
    },
    // Class with any parameter name is now allowed
    {
      code: `
        type PendingStrategyProps = {
          tournament: Tournament;
          match: MatchAggregated;
        };
        class PendingStrategy {
          constructor(settings: PendingStrategyProps) {
            // ...
          }
        }
      `,
    },
    // Function with any parameter name is now allowed
    {
      code: `
        type AreQueuesEmptyProps = {
          videoPlatforms?: VideoPlatform[];
          projectId?: string;
        };
        function areQueuesEmpty(params: AreQueuesEmptyProps) {
          // ...
        }
      `,
    },
    // External interface implementation (should be ignored)
    {
      code: `
        interface ExternalInterface {
          configure(props: ConfigType): void;
        }
        class OurClass implements ExternalInterface {
          configure(props: ConfigType) {
            // ...
          }
        }
      `,
      options: [{ ignoreExternalInterfaces: true }],
    },
    // Built-in Web API types should be whitelisted
    {
      code: `
        function parseQuery(params: URLSearchParams) {
          return Object.fromEntries(params.entries());
        }
      `,
    },
    {
      code: `
        function initializeAudio(options: AudioContextOptions) {
          return new AudioContext(options);
        }
      `,
    },
    {
      code: `
        function setupCanvas(settings: CanvasRenderingContext2DSettings) {
          // implementation
        }
      `,
    },
    {
      code: `
        function processPayment(options: PaymentRequestOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function setupPush(options: PushSubscriptionOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function recordMedia(options: MediaRecorderOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function createStore(params: IDBObjectStoreParameters) {
          // implementation
        }
      `,
    },
    {
      code: `
        function registerWorker(options: ServiceWorkerRegistrationOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function setupRTC(config: RTCConfiguration) {
          // implementation
        }
      `,
    },
    {
      code: `
        function observeResize(options: ResizeObserverOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function observeIntersection(options: IntersectionObserverOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function observeMutation(options: MutationObserverOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function getWebGLContext(attributes: WebGLContextAttributes) {
          // implementation
        }
      `,
    },
    {
      code: `
        function showNotification(options: NotificationOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function requestCredentials(options: CredentialRequestOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function getCurrentPosition(options: GeolocationPositionOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function queryCache(options: CacheQueryOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function addEventListener(options: EventListenerOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function addListener(options: AddEventListenerOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function observePerformance(options: PerformanceObserverOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function decodeText(options: TextDecoderOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function shareContent(options: ShareOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function scrollIntoView(options: ScrollIntoViewOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function scrollElement(options: ScrollOptions) {
          // implementation
        }
      `,
    },
    // Node.js types should be whitelisted
    {
      code: `
        function watchFile(options: FSWatchOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function readFile(options: ReadFileOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function writeFile(options: WriteFileOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function makeDirectory(options: MkdirOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function makeRequest(options: HttpRequestOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function createServer(options: HttpServerOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function spawnProcess(options: ChildProcessOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function createStream(options: StreamOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function compressData(options: ZlibOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function startServer(options: ServerOptions) {
          // implementation
        }
      `,
    },
    // DOM types should be whitelisted
    {
      code: `
        function parseDOM(options: DOMParserOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function createRect(options: DOMRectOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function createMatrix(options: DOMMatrixOptions) {
          // implementation
        }
      `,
    },
    // Intl types should be whitelisted
    {
      code: `
        function formatDate(options: DateTimeFormatOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function formatNumber(options: NumberFormatOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function createCollator(options: CollatorOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function createPluralRules(options: PluralRulesOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function formatRelativeTime(options: RelativeTimeFormatOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function formatList(options: ListFormatOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function getDisplayNames(options: DisplayNamesOptions) {
          // implementation
        }
      `,
    },
    // Speech and Media types should be whitelisted
    {
      code: `
        function setupRecognition(options: SpeechRecognitionOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function setupSynthesis(options: SpeechSynthesisOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function queryMedia(options: MediaQueryOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function createStream(options: MediaStreamOptions) {
          // implementation
        }
      `,
    },
    // Security and Crypto types should be whitelisted
    {
      code: `
        function createKey(options: CryptoKeyOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function setupCrypto(options: SubtleCryptoOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function encrypt(params: CryptoAlgorithmParameters) {
          // implementation
        }
      `,
    },
    {
      code: `
        function requestPermission(options: PermissionOptions) {
          // implementation
        }
      `,
    },
    // WebRTC types should be whitelisted
    {
      code: `
        function createConnection(options: RTCPeerConnectionOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function createChannel(options: RTCDataChannelOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function setEncoding(params: RTCRtpEncodingParameters) {
          // implementation
        }
      `,
    },
    {
      code: `
        function setSendParams(params: RTCRtpSendParameters) {
          // implementation
        }
      `,
    },
    // Web Components and Animation types should be whitelisted
    {
      code: `
        function attachShadow(options: ShadowRootOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function defineElement(options: CustomElementOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function animate(options: AnimationOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function createEffect(options: AnimationEffectOptions) {
          // implementation
        }
      `,
    },
    // TypeScript Compiler types should be whitelisted
    {
      code: `
        function compile(options: CompilerOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function loadConfig(options: TSConfigOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function transpile(options: TranspileOptions) {
          // implementation
        }
      `,
    },
    // Edge case: Generic types with built-in types
    {
      code: `
        function processPromise(params: Promise<URLSearchParams>) {
          // implementation
        }
      `,
    },
    {
      code: `
        function processArray(options: Array<AudioContextOptions>) {
          // implementation
        }
      `,
    },
    // Edge case: Union types with built-in types
    {
      code: `
        function handleUnion(params: URLSearchParams | string) {
          // implementation
        }
      `,
    },
    // Edge case: Intersection types with built-in types
    {
      code: `
        function handleIntersection(options: AudioContextOptions & { custom: string }) {
          // implementation
        }
      `,
    },
    // Edge case: Array types with built-in types
    {
      code: `
        function processArray(params: URLSearchParams[]) {
          // implementation
        }
      `,
    },
    // Edge case: Tuple types with built-in types
    {
      code: `
        function processTuple(params: [URLSearchParams, string]) {
          // implementation
        }
      `,
    },
    // Edge case: Utility types with built-in types
    {
      code: `
        function processPartial(options: Partial<AudioContextOptions>) {
          // implementation
        }
      `,
    },
    {
      code: `
        function processRequired(options: Required<NotificationOptions>) {
          // implementation
        }
      `,
    },
    {
      code: `
        function processPick(options: Pick<GeolocationPositionOptions, 'timeout'>) {
          // implementation
        }
      `,
    },
    {
      code: `
        function processOmit(options: Omit<CacheQueryOptions, 'ignoreSearch'>) {
          // implementation
        }
      `,
    },
    // Edge case: Multiple parameters with built-in types
    {
      code: `
        function processMultiple(params: URLSearchParams, options: AudioContextOptions) {
          // implementation
        }
      `,
    },
    // Edge case: Optional parameters with built-in types
    {
      code: `
        function processOptional(params?: URLSearchParams) {
          // implementation
        }
      `,
    },
    // Edge case: Rest parameters with built-in types
    {
      code: `
        function processRest(...params: URLSearchParams[]) {
          // implementation
        }
      `,
    },
    // Edge case: Default parameters with built-in types
    {
      code: `
        function processDefault(params: URLSearchParams = new URLSearchParams()) {
          // implementation
        }
      `,
    },
    // Edge case: Destructured parameters with built-in types
    {
      code: `
        function processDestructured({ params }: { params: URLSearchParams }) {
          // implementation
        }
      `,
    },
    // Edge case: Async functions with built-in types
    {
      code: `
        async function processAsync(params: URLSearchParams) {
          // implementation
        }
      `,
    },
    // Edge case: Arrow functions with built-in types
    {
      code: `
        const processArrow = (params: URLSearchParams) => {
          // implementation
        };
      `,
    },
    // Edge case: Function expressions with built-in types
    {
      code: `
        const processFunction = function(params: URLSearchParams) {
          // implementation
        };
      `,
    },
    // Edge case: Method signatures with built-in types
    {
      code: `
        interface MyInterface {
          process(params: URLSearchParams): void;
        }
      `,
    },
    // Edge case: Class methods with built-in types
    {
      code: `
        class MyClass {
          process(params: URLSearchParams) {
            // implementation
          }
        }
      `,
    },
    // Edge case: Static methods with built-in types
    {
      code: `
        class MyClass {
          static process(params: URLSearchParams) {
            // implementation
          }
        }
      `,
    },
    // Edge case: Getters with built-in types
    {
      code: `
        class MyClass {
          get params(): URLSearchParams {
            return new URLSearchParams();
          }
        }
      `,
    },
    // Edge case: Setters with built-in types
    {
      code: `
        class MyClass {
          set params(value: URLSearchParams) {
            // implementation
          }
        }
      `,
    },
    // Edge case: Constructor with built-in types
    {
      code: `
        class MyClass {
          constructor(params: URLSearchParams) {
            // implementation
          }
        }
      `,
    },
    // Edge case: Abstract methods with built-in types
    {
      code: `
        abstract class MyClass {
          abstract process(params: URLSearchParams): void;
        }
      `,
    },
    // Edge case: Function overloads with built-in types
    {
      code: `
        function process(params: URLSearchParams): void;
        function process(params: string): void;
        function process(params: URLSearchParams | string): void {
          // implementation
        }
      `,
    },
    // Edge case: Call signatures with built-in types
    {
      code: `
        interface MyInterface {
          (params: URLSearchParams): void;
        }
      `,
    },
    // Edge case: Construct signatures with built-in types
    {
      code: `
        interface MyInterface {
          new (params: URLSearchParams): MyClass;
        }
      `,
    },
    // Edge case: Index signatures with built-in types
    {
      code: `
        interface MyInterface {
          [key: string]: URLSearchParams;
        }
      `,
    },
    // Edge case: Conditional types with built-in types
    {
      code: `
        type ConditionalType<T> = T extends URLSearchParams ? T : never;
        function process(params: ConditionalType<URLSearchParams>) {
          // implementation
        }
      `,
    },
    // Edge case: Mapped types with built-in types
    {
      code: `
        type MappedType = {
          [K in keyof URLSearchParams]: URLSearchParams[K];
        };
        function process(params: MappedType) {
          // implementation
        }
      `,
    },
    // Edge case: Template literal types
    {
      code: `
        type TemplateType = \`prefix-\${string}\`;
        function process(params: TemplateType) {
          // implementation
        }
      `,
    },
    // Edge case: Readonly types with built-in types
    {
      code: `
        function process(params: Readonly<URLSearchParams>) {
          // implementation
        }
      `,
    },
    // Edge case: Record types with built-in types
    {
      code: `
        function process(params: Record<string, URLSearchParams>) {
          // implementation
        }
      `,
    },
    // Edge case: Exclude/Extract utility types
    {
      code: `
        function process(params: Exclude<URLSearchParams | string, string>) {
          // implementation
        }
      `,
    },
    {
      code: `
        function process(params: Extract<URLSearchParams | string, URLSearchParams>) {
          // implementation
        }
      `,
    },
    // Edge case: NonNullable with built-in types
    {
      code: `
        function process(params: NonNullable<URLSearchParams | null>) {
          // implementation
        }
      `,
    },
    // Edge case: ReturnType with built-in types
    {
      code: `
        function getParams(): URLSearchParams {
          return new URLSearchParams();
        }
        function process(params: ReturnType<typeof getParams>) {
          // implementation
        }
      `,
    },
    // Edge case: Parameters utility type
    {
      code: `
        function originalFunction(params: URLSearchParams): void {}
        function process(params: Parameters<typeof originalFunction>[0]) {
          // implementation
        }
      `,
    },
    // Edge case: InstanceType with built-in types
    {
      code: `
        function process(params: InstanceType<typeof URLSearchParams>) {
          // implementation
        }
      `,
    },
    // Edge case: Nested generic types
    {
      code: `
        function process(params: Promise<Array<URLSearchParams>>) {
          // implementation
        }
      `,
    },
    // Edge case: Complex union with built-in types
    {
      code: `
        function process(params: URLSearchParams | AudioContextOptions | string) {
          // implementation
        }
      `,
    },
    // Edge case: Complex intersection with built-in types
    {
      code: `
        function process(params: URLSearchParams & AudioContextOptions & { custom: string }) {
          // implementation
        }
      `,
    },
    // Edge case: Keyof with built-in types
    {
      code: `
        function process(params: keyof URLSearchParams) {
          // implementation
        }
      `,
    },
    // Edge case: Typeof with built-in types
    {
      code: `
        const instance = new URLSearchParams();
        function process(params: typeof instance) {
          // implementation
        }
      `,
    },
    // Edge case: Infer types
    {
      code: `
        type InferType<T> = T extends (params: infer P) => any ? P : never;
        function originalFunction(params: URLSearchParams): void {}
        function process(params: InferType<typeof originalFunction>) {
          // implementation
        }
      `,
    },
    // Edge case: Built-in types in object literal types
    {
      code: `
        function process(params: { search: URLSearchParams; options: AudioContextOptions }) {
          // implementation
        }
      `,
    },
    // Edge case: Built-in types in function types
    {
      code: `
        function process(params: (search: URLSearchParams) => void) {
          // implementation
        }
      `,
    },
    // Edge case: Built-in types with type assertions
    {
      code: `
        function process(params: URLSearchParams) {
          const typed = params as URLSearchParams;
          // implementation
        }
      `,
    },
    // Edge case: Built-in types in type guards
    {
      code: `
        function isURLSearchParams(params: any): params is URLSearchParams {
          return params instanceof URLSearchParams;
        }
      `,
    },
    // Edge case: Built-in types in satisfies expressions
    {
      code: `
        const config = {
          search: new URLSearchParams()
        } satisfies { search: URLSearchParams };
      `,
    },
    // Edge case: Case sensitivity - lowercase suffixes should not be flagged
    {
      code: `
        type urlsearchparams = {
          custom: string;
        };
        function processLowercase(params: urlsearchparams) {
          // ...
        }
      `,
    },
  ],
  invalid: [
    // Class with incorrect type suffix
    {
      code: `
        type PendingStrategySettings = {
          tournament: Tournament;
          match: MatchAggregated;
        };
        class PendingStrategy {
          constructor(settings: PendingStrategySettings) {
            // ...
          }
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Settings' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Settings' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Settings' } },
      ],
      output: `
        type PendingStrategyProps = {
          tournament: Tournament;
          match: MatchAggregated;
        };
        class PendingStrategy {
          constructor(settings: PendingStrategyProps) {
            // ...
          }
        }
      `,
    },
    // Function with incorrect type suffix
    {
      code: `
        type AreQueuesEmptyParams = {
          videoPlatforms?: VideoPlatform[];
          projectId?: string;
        };
        function areQueuesEmpty(params: AreQueuesEmptyParams) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Params' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Params' } },
      ],
      output: `
        type AreQueuesEmptyProps = {
          videoPlatforms?: VideoPlatform[];
          projectId?: string;
        };
        function areQueuesEmpty(params: AreQueuesEmptyProps) {
          // ...
        }
      `,
    },
    // Type with incorrect suffix
    {
      code: `
        type AlgoliaLayoutConfig = {
          CatalogWrapper: RenderCatalogWrapper;
          configureOptions: Required<UseConfigureProps, 'filters'>;
        };
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
      ],
      output: `
        type AlgoliaLayoutProps = {
          CatalogWrapper: RenderCatalogWrapper;
          configureOptions: Required<UseConfigureProps, 'filters'>;
        };
      `,
    },
    // User-defined types should still be flagged (not built-in types)
    {
      code: `
        type CustomOptions = {
          theme: string;
          size: number;
        };
        function setupCustom(options: CustomOptions) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Options' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Options' } },
      ],
      output: `
        type CustomProps = {
          theme: string;
          size: number;
        };
        function setupCustom(options: CustomProps) {
          // ...
        }
      `,
    },
    {
      code: `
        type UserParams = {
          name: string;
          email: string;
        };
        function createUser(params: UserParams) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Params' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Params' } },
      ],
      output: `
        type UserProps = {
          name: string;
          email: string;
        };
        function createUser(params: UserProps) {
          // ...
        }
      `,
    },
    {
      code: `
        type DatabaseConfig = {
          host: string;
          port: number;
        };
        function connectDatabase(config: DatabaseConfig) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
      ],
      output: `
        type DatabaseProps = {
          host: string;
          port: number;
        };
        function connectDatabase(config: DatabaseProps) {
          // ...
        }
      `,
    },
    // Edge case: User-defined types with complex structures should still be flagged
    {
      code: `
        type ComplexUserOptions = {
          theme: string;
          size: number;
          callbacks: {
            onSuccess: () => void;
            onError: (error: Error) => void;
          };
        };
        function setupComplex(options: ComplexUserOptions) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Options' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Options' } },
      ],
      output: `
        type ComplexUserProps = {
          theme: string;
          size: number;
          callbacks: {
            onSuccess: () => void;
            onError: (error: Error) => void;
          };
        };
        function setupComplex(options: ComplexUserProps) {
          // ...
        }
      `,
    },
    // Edge case: User-defined types with generic parameters should still be flagged
    {
      code: `
        type GenericUserConfig<T> = {
          data: T;
          options: string[];
        };
        function processGeneric<T>(config: GenericUserConfig<T>) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
      ],
      output: `
        type GenericUserProps<T> = {
          data: T;
          options: string[];
        };
        function processGeneric<T>(config: GenericUserProps<T>) {
          // ...
        }
      `,
    },
    // Edge case: User-defined types in union with built-in types should still be flagged (type definition only)
    {
      code: `
        type UserSettings = {
          theme: string;
          language: string;
        };
        function processUnion(params: UserSettings | URLSearchParams) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Settings' } },
      ],
      output: `
        type UserProps = {
          theme: string;
          language: string;
        };
        function processUnion(params: UserSettings | URLSearchParams) {
          // ...
        }
      `,
    },
    // Edge case: User-defined types in intersection with built-in types should still be flagged (type definition only)
    {
      code: `
        type UserConfig = {
          theme: string;
          language: string;
        };
        function processIntersection(params: UserConfig & { extra: string }) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
      ],
      output: `
        type UserProps = {
          theme: string;
          language: string;
        };
        function processIntersection(params: UserConfig & { extra: string }) {
          // ...
        }
      `,
    },
    // Edge case: User-defined types in array should still be flagged (type definition only)
    {
      code: `
        type UserParams = {
          id: string;
          name: string;
        };
        function processArray(params: UserParams[]) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Params' } },
      ],
      output: `
        type UserProps = {
          id: string;
          name: string;
        };
        function processArray(params: UserParams[]) {
          // ...
        }
      `,
    },
    // Edge case: User-defined types in tuple should still be flagged (type definition only)
    {
      code: `
        type UserOptions = {
          theme: string;
        };
        function processTuple(params: [UserOptions, string]) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Options' } },
      ],
      output: `
        type UserProps = {
          theme: string;
        };
        function processTuple(params: [UserOptions, string]) {
          // ...
        }
      `,
    },
    // Edge case: User-defined types in utility types should still be flagged (type definition only)
    {
      code: `
        type UserSettings = {
          theme: string;
          language: string;
        };
        function processPartial(params: Partial<UserSettings>) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Settings' } },
      ],
      output: `
        type UserProps = {
          theme: string;
          language: string;
        };
        function processPartial(params: Partial<UserSettings>) {
          // ...
        }
      `,
    },
    // Edge case: User-defined types in Promise should still be flagged (type definition only)
    {
      code: `
        type AsyncUserConfig = {
          endpoint: string;
          timeout: number;
        };
        function processAsync(config: Promise<AsyncUserConfig>) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
      ],
      output: `
        type AsyncUserProps = {
          endpoint: string;
          timeout: number;
        };
        function processAsync(config: Promise<AsyncUserConfig>) {
          // ...
        }
      `,
    },
    // Edge case: User-defined types in class methods should still be flagged
    {
      code: `
        type ServiceConfig = {
          apiKey: string;
          baseUrl: string;
        };
        class ApiService {
          configure(config: ServiceConfig) {
            // ...
          }
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
      ],
      output: `
        type ServiceProps = {
          apiKey: string;
          baseUrl: string;
        };
        class ApiService {
          configure(config: ServiceProps) {
            // ...
          }
        }
      `,
    },
    // Edge case: User-defined types in static methods should still be flagged
    {
      code: `
        type FactoryOptions = {
          type: string;
          version: number;
        };
        class Factory {
          static create(options: FactoryOptions) {
            // ...
          }
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Options' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Options' } },
      ],
      output: `
        type FactoryProps = {
          type: string;
          version: number;
        };
        class Factory {
          static create(options: FactoryProps) {
            // ...
          }
        }
      `,
    },
    // Edge case: User-defined types in async functions should still be flagged
    {
      code: `
        type FetchParams = {
          url: string;
          method: string;
        };
        async function fetchData(params: FetchParams) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Params' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Params' } },
      ],
      output: `
        type FetchProps = {
          url: string;
          method: string;
        };
        async function fetchData(params: FetchProps) {
          // ...
        }
      `,
    },
    // Edge case: User-defined types in arrow functions should still be flagged
    {
      code: `
        type HandlerOptions = {
          timeout: number;
          retries: number;
        };
        const handleRequest = (options: HandlerOptions) => {
          // ...
        };
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Options' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Options' } },
      ],
      output: `
        type HandlerProps = {
          timeout: number;
          retries: number;
        };
        const handleRequest = (options: HandlerProps) => {
          // ...
        };
      `,
    },
    // Edge case: User-defined types in function expressions should still be flagged
    {
      code: `
        type ProcessorConfig = {
          batchSize: number;
          parallel: boolean;
        };
        const processor = function(config: ProcessorConfig) {
          // ...
        };
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
      ],
      output: `
        type ProcessorProps = {
          batchSize: number;
          parallel: boolean;
        };
        const processor = function(config: ProcessorProps) {
          // ...
        };
      `,
    },
    // Edge case: User-defined types with multiple suffixes should be flagged
    {
      code: `
        type ValidationArgs = {
          rules: string[];
          strict: boolean;
        };
        function validate(args: ValidationArgs) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Args' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Args' } },
      ],
      output: `
        type ValidationProps = {
          rules: string[];
          strict: boolean;
        };
        function validate(args: ValidationProps) {
          // ...
        }
      `,
    },
    {
      code: `
        type InitializationArguments = {
          plugins: string[];
          debug: boolean;
        };
        function initialize(args: InitializationArguments) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Arguments' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Arguments' } },
      ],
      output: `
        type InitializationProps = {
          plugins: string[];
          debug: boolean;
        };
        function initialize(args: InitializationProps) {
          // ...
        }
      `,
    },
    {
      code: `
        type DatabaseParameters = {
          host: string;
          port: number;
          ssl: boolean;
        };
        function connect(params: DatabaseParameters) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Parameters' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Parameters' } },
      ],
      output: `
        type DatabaseProps = {
          host: string;
          port: number;
          ssl: boolean;
        };
        function connect(params: DatabaseProps) {
          // ...
        }
      `,
    },

    // Edge case: Similar names to built-in types but not exact matches should be flagged
    {
      code: `
        type MyURLSearchParams = {
          custom: string;
        };
        function processCustom(params: MyURLSearchParams) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Params' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Params' } },
      ],
      output: `
        type MyURLSearchProps = {
          custom: string;
        };
        function processCustom(params: MyURLSearchProps) {
          // ...
        }
      `,
    },
    {
      code: `
        type CustomAudioContextOptions = {
          custom: string;
        };
        function processCustomAudio(options: CustomAudioContextOptions) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Options' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Options' } },
      ],
      output: `
        type CustomAudioContextProps = {
          custom: string;
        };
        function processCustomAudio(options: CustomAudioContextProps) {
          // ...
        }
      `,
    },
  ],
});

// Run JSX tests - combined with the previous ruleTesterTs tests
ruleTesterJsx.run('enforce-props-argument-name', enforcePropsArgumentName, {
  valid: [
    // React component with correct props naming
    {
      code: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (props: ButtonProps) => {
          return <button onClick={props.onClick}>{props.label}</button>;
        };
      `,
    },
    // React component with correct props naming and destructuring
    {
      code: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (props: ButtonProps) => {
          const { label, onClick } = props;
          return <button onClick={onClick}>{label}</button>;
        };
      `,
    },
    // React class component with correct props naming
    {
      code: `
        type MyComponentProps = {
          title: string;
        };
        class MyComponent extends React.Component<MyComponentProps> {
          render() {
            return <div>{this.props.title}</div>;
          }
        }
      `,
    },
    // React component with any parameter name is now allowed
    {
      code: `
        type AlgoliaLayoutProps = {
          CatalogWrapper: RenderCatalogWrapper;
          configureOptions: Required<UseConfigureProps, 'filters'>;
        };
        const AlgoliaLayout = ({ CatalogWrapper, configureOptions }: AlgoliaLayoutProps) => {
          // ...
        };
      `,
    },
  ],
  invalid: [
    // React component with incorrect type suffix
    {
      code: `
        type AlgoliaLayoutConfig = {
          CatalogWrapper: RenderCatalogWrapper;
          configureOptions: Required<UseConfigureProps, 'filters'>;
        };
        const AlgoliaLayout = ({ CatalogWrapper, configureOptions }: AlgoliaLayoutConfig) => {
          // ...
        };
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
      ],
      output: `
        type AlgoliaLayoutProps = {
          CatalogWrapper: RenderCatalogWrapper;
          configureOptions: Required<UseConfigureProps, 'filters'>;
        };
        const AlgoliaLayout = ({ CatalogWrapper, configureOptions }: AlgoliaLayoutConfig) => {
          // ...
        };
      `,
    },
  ],
});
