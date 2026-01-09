import { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceVerbNounNaming } from '../rules/enforce-verb-noun-naming';

const verbNounMessage = (name: string) =>
  `Function "${name}" should start with an action verb followed by the thing it acts on. Verb-first names tell readers this symbol performs work instead of representing data, which keeps APIs predictable and prevents accidental misuse. Rename "${name}" to a verb-noun phrase such as "fetchUsers" or "processRequest".`;

const verbNounError = (name: string) =>
  ({
    message: verbNounMessage(name),
  } as unknown as TSESLint.TestCaseError<'functionVerbPhrase'>);

ruleTesterTs.run('enforce-verb-noun-naming', enforceVerbNounNaming, {
  valid: [
    // Function declarations with verb phrases
    {
      code: `function fetchUserData() { return null; }`,
    },
    {
      code: `function processRequest() { return null; }`,
    },

    // Arrow functions with verb phrases
    {
      code: `const fetchData = () => null;`,
    },
    {
      code: `const processInput = () => null;`,
    },

    // Short verb functions
    {
      code: `function syncMembership() { return null; }`,
    },
    {
      code: `function fixBug() { return null; }`,
    },
    {
      code: `function setConfig() { return null; }`,
    },
    {
      code: `function logError() { return null; }`,
    },
    {
      code: `const syncData = () => null;`,
    },

    // Technical verb functions
    {
      code: `function enqueueTask() { return null; }`,
    },
    {
      code: `function dequeueMessage() { return null; }`,
    },
    {
      code: `function memoizeResult() { return null; }`,
    },
    {
      code: `function serializeData() { return null; }`,
    },
    {
      code: `function deserializeResponse() { return null; }`,
    },
    {
      code: `function instantiateClass() { return null; }`,
    },
    {
      code: `function marshalRequest() { return null; }`,
    },
    {
      code: `function unmarshalResponse() { return null; }`,
    },
    {
      code: `class QueueHelper {
        async enqueueTask() { return null; }
        async dequeueMessage() { return null; }
      }`,
    },

    // Functions starting with "to" or "with"
    {
      code: `function toNumber(value) { return +value; }`,
    },
    {
      code: `const withLogging = (fn) => (...args) => { console.log(...args); return fn(...args); }`,
    },
    {
      code: `class Converter { toString() { return ''; } }`,
    },

    // Data types with noun phrases
    {
      code: `const userProfile = { name: 'John' };`,
    },
    {
      code: `const requestProcessor = { handle: () => {} };`,
    },

    // Classes with noun phrases
    {
      code: `class UserService { }`,
    },
    {
      code: `class DataProcessor { }`,
    },

    // Class methods with verb phrases
    {
      code: `class Service {
        fetchData() { }
        processRequest() { }
        toString() { }
      }`,
    },

    // Class constructors (should be ignored)
    {
      code: `class User {
        constructor(name) {
          this.name = name;
        }
      }`,
    },

    // Class getters (should be ignored since they represent properties)
    {
      code: `class Service {
        get groupRef() { return null; }
        get userProfile() { return null; }
        @Memoize()
        get dataCache() { return null; }
      }`,
    },

    // Variables that are not functions (should be ignored)
    {
      code: `const data = { value: true };`,
    },
    {
      code: `const userProfile = { name: 'John' };`,
    },
    {
      code: `class DataProcessor { }`,
    },

    // React components (should be ignored)
    {
      code: `/** @jsx jsx */
      function UserCard() {
        return <div>User</div>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `/** @jsx jsx */
      const ProfileView = () => {
        return <div>Profile</div>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `/** @jsx jsx */
      const StatsPanelUnmemoized: React.FC<StatsPanelProps> = ({ data }) => {
        return <div className="stats-panel">{/* component implementation */}</div>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `/** @jsx jsx */
      const UserProfile: FunctionComponent<UserProfileProps> = ({ user }) => {
        return <div>{user.name}</div>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `/** @jsx jsx */
      const DataTable: React.FunctionComponent<DataTableProps> = ({ data }) => {
        return <table>{/* table implementation */}</table>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },

    // Regression tests for Issue #1101
    `async function upsertMetadata() {}`,
    `async function debit() {}`,
    `async function lookupIpData() {}`,
    `async function mintMore() {}`,
    `function dedupeSnaps() {}`,
    `function lowercaseFirstLetter() {}`,
    `function unpluck() {}`,
    `function triage() {}`,
    `function calcMinAge() {}`,
    `function cleanup() {}`,
    `function cacheTransactionStatus() {}`,
    `function destructureAdminDirectory() {}`,
    `function firstExists() {}`,
    `const stableHash = () => {}`,
    `const sequentialDocumentWritten = () => {}`,
    `const onlyEvery = () => {}`,
    `const cartesianCombine = () => {}`,
    `const uuidv4Base62 = () => {}`,
    `const blumintAreEqual = () => {}`,
    `const callableFactory = () => {}`,
    `const recursive = () => {}`,
    {
      code: `function UnauthorizedPage() { return <div />; }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `const ElectronTitleBar = () => { return <div />; }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `/** @jsx jsx */
      const conditionalComponent = (props) => {
        return props.isVisible && <div>Visible</div>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `/** @jsx jsx */
      function logicalFunction(props) {
        return props.data || <div />;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `/** @jsx jsx */
      const conditionalReturn = (props) => {
        return props.isVisible ? <div>Visible</div> : null;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  ],
  invalid: [
    // Invalid function names (not verb phrases)
    {
      code: `function userData() { return null; }`,
      errors: [verbNounError('userData')],
    },

    // Regression tests for destructured parameters false positive
    {
      code: `function userDataDestructured({ id, name }) { return { id, name }; }`,
      errors: [verbNounError('userDataDestructured')],
    },
    {
      code: `const configHandler = ({ config }) => { return config; };`,
      errors: [verbNounError('configHandler')],
    },

    // Regression tests for React type annotation false positive (FC/FunctionComponent substring matching)
    {
      code: `const myFC: RFC3339Date = (date) => { return date; };`,
      errors: [verbNounError('myFC')],
    },
    {
      code: `const configParser: IETFConfig = ({ config }) => { return config; };`,
      errors: [verbNounError('configParser')],
    },

    // Invalid arrow function names (not verb phrases)
    {
      code: `const data = () => null;`,
      errors: [verbNounError('data')],
    },

    // Invalid class method names (not verb phrases)
    {
      code: `class Service {
        data() { }
      }`,
      errors: [verbNounError('data')],
    },
  ],
});
