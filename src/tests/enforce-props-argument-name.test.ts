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
