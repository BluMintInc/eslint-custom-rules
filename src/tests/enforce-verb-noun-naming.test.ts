import { Linter, Rule } from 'eslint';
import { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceVerbNounNaming } from '../rules/enforce-verb-noun-naming';
import { noExplicitReturnType } from '../rules/no-explicit-return-type';

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

    // React component detection for PascalCase functions (isJsxFile=false)
    {
      code: `const MyComponent: React.FC = () => null;`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      code: `function MyComponent(): React.JSX.Element { return null; }`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      code: `const MyComponent: FC<Props> = (props) => { return null; };`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      code: `export const MyComponent: FunctionComponent = () => null;`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      code: `const MyComponent: React.FunctionComponent = () => null;`,
      filename: 'src/components/MyComponent.ts',
    },
    // PascalCase in TSX files should be treated as components even without JSX return (e.g. returns null)
    {
      code: `const MyComponent = () => null;`,
      filename: 'src/components/MyComponent.tsx',
    },
    {
      code: `function MyComponent() { return null; }`,
      filename: 'src/components/MyComponent.tsx',
    },

    // Issue #1596: a return-type annotation cannot be the only carrier of
    // component-hood, because `no-explicit-return-type --fix` deletes it. A
    // component in a `.ts` file stays recognisable from what it renders, the
    // hooks it calls, or how it is used.
    {
      name: 'a component whose only return renders nothing',
      code: `function MyComponent() { return null; }`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'the arrow form of the annotation-less component',
      code: `const MyComponent = () => { return null; };`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'a concise-body arrow component',
      code: `const MyComponent = () => null;`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'an explicit undefined return also renders nothing',
      code: `function MyComponent() { return undefined; }`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'a component built with createElement instead of JSX',
      code: `function MyComponent() { return createElement('div'); }`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'every branch renders: a null guard plus a React.createElement return',
      code: `function MyComponent(props) {
  if (!props.ready) {
    return null;
  }
  return React.createElement('div', null, props.label);
}`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'a nullish return reached through an as-expression',
      code: `function MyComponent() { return null as any; }`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'a PascalCase function calling a React hook',
      code: `function MyComponent(props) {
  const [isOpen, setOpen] = useState(false);
  return renderDialog(isOpen, setOpen, props);
}`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'an unmemoized component recognised through its memo() wrapper',
      code: `const UserBadgeUnmemoized = (props) => {
  return buildBadge(props);
};
export const UserBadge = memo(UserBadgeUnmemoized);`,
      filename: 'src/components/UserBadge.ts',
    },
    {
      name: 'a component recognised through its React.forwardRef() wrapper',
      code: `const StatusPanelInner = (props, ref) => {
  return buildPanel(props, ref);
};
export const StatusPanel = React.forwardRef(StatusPanelInner);`,
      filename: 'src/components/StatusPanel.ts',
    },
    {
      name: 'an async server component that renders nothing',
      code: `async function MyComponent() { return null; }`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'a component whose renders are spread across a switch',
      code: `function MyComponent(props) {
  switch (props.kind) {
    case 'empty':
      return null;
    default:
      return React.createElement('div');
  }
}`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'a component whose renders are spread across a try/catch',
      code: `function MyComponent(props) {
  try {
    return React.createElement('div', null, props.label);
  } catch (error) {
    return null;
  }
}`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'a nested callback returning a value does not disqualify the component',
      code: `function MyComponent(props) {
  const ids = props.items.map((item) => item.id);
  void ids;
  return null;
}`,
      filename: 'src/components/MyComponent.ts',
    },
    {
      name: 'a component recognised by its use as a JSX element',
      code: `function MyComponent(props) {
  return buildTree(props);
}
export const app = <MyComponent />;`,
      filename: 'src/components/MyComponent.js',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
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

    // Regression tests for Issue #1225 — `bucket` is a transitive verb
    // ("group/sort items into buckets"), idiomatic in data-engineering.
    // NLP fallback (compromise) tags it noun-dominant, so it lives in the allowlist.
    `function bucketMatchesByDepth() {}`,
    `function bucketEventsByHour() {}`,
    `function bucketRequestsByEndpoint() {}`,
    `const bucketLogsByLevel = () => {}`,
    `async function bucketItemsIntoTiers() {}`,
    `function bucketizeHistogram() {}`,
    {
      code: `class Bracket {
        bucketMatchesByDepth() {}
      }`,
    },
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
    // React component detection tests
    {
      filename: 'MyComponent.tsx',
      code: `function MyComponent() { return <div />; }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      filename: 'MyComponent.ts',
      code: `function MyComponent(): React.FC { return null; }`,
    },

    // main as a standalone entry-point function name (domain allowlist)
    `function main() {}`,
    `async function main() {}`,
    `const main = () => {}`,
    `const main = async () => {}`,
    // main as a class method
    {
      code: `class App {
        main() {}
      }`,
    },
    // mainX compound names — first word is still "main", should also pass
    // (domain allowlist matches on leading word, so mainProcess starts with "main")
    `function mainProcess() {}`,
    `const mainHandler = () => {}`,

    // Issue #1555: externally specified export names (registry keys, CLI verbs,
    // artifact paths) are noun phrases by contract.
    {
      name: 'a noun-phrase export whose name is an external registry key',
      code: 'export const axisProfile = (raster, params) => { return null; };',
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/axisProfile.mjs',
    },
    {
      name: 'an absolute filename matches the same leading-** glob',
      code: 'export const axisProfile = (raster, params) => { return null; };',
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: '/repo/scripts/design/proxy/ops/axisProfile.mjs',
    },
    {
      name: 'any pattern in the list may match',
      code: 'export const rasterHistogram = () => { return null; };',
      options: [
        { externallyNamedExports: ['**/predicates/*.mjs', '**/ops/*.mjs'] },
      ],
      filename: 'scripts/design/proxy/ops/rasterHistogram.mjs',
    },
    {
      name: 'an exported function declaration is exempt in a matching file',
      code: 'export function glyphPopulation() { return null; }',
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/glyphPopulation.mjs',
    },
    {
      name: 'a default-exported function declaration is exempt',
      code: 'export default function contourDelta() { return null; }',
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/contourDelta.mjs',
    },
    {
      name: 'a deferred export specifier exempts the local binding',
      code: `const axisProfile = () => { return null; };
export { axisProfile };`,
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/axisProfile.mjs',
    },
    {
      name: 'a renamed export specifier exempts the local name',
      code: `const axisProfile = () => { return null; };
export { axisProfile as ops_axisProfile };`,
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/axisProfile.mjs',
    },
    {
      name: 'a deferred default export exempts the local binding',
      code: `const axisProfile = () => { return null; };
export default axisProfile;`,
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/axisProfile.mjs',
    },
    {
      name: 'a deferred export of a function declaration is exempt',
      code: `function glyphPopulation() { return null; }
export { glyphPopulation };`,
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/glyphPopulation.mjs',
    },
    {
      name: 'an exported function expression is exempt',
      code: 'export const axisProfile = function (raster) { return null; };',
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/axisProfile.mjs',
    },
    {
      name: 'a verb-named export in a matching file stays clean',
      code: 'export const computeProfile = (raster) => { return null; };',
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/computeProfile.mjs',
    },
    {
      name: 'a verb-named export needs no option to stay clean',
      code: 'export const buildAxisProfile = (raster) => { return null; };',
      filename: 'scripts/design/proxy/ops/buildAxisProfile.mjs',
    },
    // #2295: `elide` and `bound` are transitive verbs the NLP fallback
    // misreads (unknown and past-participle respectively), so the allowlist
    // carries them the same way #1225 carries `bucket`.
    {
      code: `export const elideMiddle = (entries: readonly string[]) => {
  return entries.slice(1);
};`,
    },
    {
      code: `export const boundErrorDetails = (details: Readonly<Record<string, unknown>>) => {
  return details;
};`,
    },
    {
      code: `export function boundConcurrency(limit: number) {
  return Math.min(limit, 8);
}`,
    },
  ],
  invalid: [
    {
      code: `function NonComponentHelper() { return 123; }`,
      filename: 'helpers.ts',
      errors: [verbNounError('NonComponentHelper')],
    },
    {
      code: `const HelperFunction = () => { doWork(); }`,
      filename: 'utils.ts',
      errors: [verbNounError('HelperFunction')],
    },

    // Issue #1596 controls — recognising annotation-less components must not
    // become a blanket amnesty for every PascalCase function in a `.ts` file.
    {
      name: 'a PascalCase helper returning a data object is not a component',
      code: `function ConfigParser() { return { parsed: true }; }`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('ConfigParser')],
    },
    {
      name: 'a PascalCase helper returning a computed value is not a component',
      code: `function UserRecord() {
  const value = fetchValue();
  return value;
}`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('UserRecord')],
    },
    {
      name: 'a nullish return on one branch only is not component evidence',
      code: `function DataSnapshot(input) {
  if (!input) {
    return null;
  }
  return buildSnapshot(input);
}`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('DataSnapshot')],
    },
    {
      name: 'a `|| null` fallback is an ordinary value, not a render',
      code: `function TournamentRoster() { return roster.get(id) || null; }`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('TournamentRoster')],
    },
    {
      name: 'a return null nested in an inner function does not exempt the outer one',
      code: `function StatusRegistry() {
  const reset = () => {
    return null;
  };
  reset();
}`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('StatusRegistry')],
    },
    {
      name: 'a PascalCase helper that returns nothing at all is not a component',
      code: `const PayloadBuilder = () => { doWork(); };`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('PayloadBuilder')],
    },
    {
      name: 'returning a plain call is not a createElement return',
      code: `function MetricsSummary() { return computeSummary(); }`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('MetricsSummary')],
    },
    {
      name: 'a non-React wrapper is not component usage',
      code: `const UserRecord = (row) => {
  return mapRow(row);
};
export const cached = memoize(UserRecord);`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('UserRecord')],
    },
    {
      name: 'a camelCase function that renders nothing is still not a component',
      code: `const statusLabel = () => { return null; };`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('statusLabel')],
    },
    {
      name: 'a generator never renders, whatever it returns',
      code: `function* DataStream() {
  yield 1;
  return null;
}`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('DataStream')],
    },
    {
      name: 'document.createElement is a DOM call, not a render',
      code: `function DomFragment() { return document.createElement('div'); }`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('DomFragment')],
    },
    {
      name: 'a useX method on an object is not a React hook call',
      code: `function StatusRegistry(db) { return db.useCache(); }`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('StatusRegistry')],
    },
    {
      name: 'a conditional with one non-render branch is not a render',
      code: `function StatusLabel(flag) { return flag ? null : computeLabel(); }`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('StatusLabel')],
    },
    {
      name: 'a return null inside a nested object method does not exempt the outer one',
      code: `function StatusRegistry() {
  return {
    build() {
      return null;
    },
  };
}`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('StatusRegistry')],
    },
    {
      name: 'an empty PascalCase function body is not a component',
      code: `function StatusLabel() {}`,
      filename: 'src/helpers.ts',
      errors: [verbNounError('StatusLabel')],
    },
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

    // Issue #1225 controls — adding `bucket` to the verb allowlist must NOT
    // blanket-allow look-alike leading nouns; genuine noun-first names still fire.
    {
      code: `function socketHandler() { return null; }`,
      errors: [verbNounError('socketHandler')],
    },
    {
      code: `const payloadData = () => null;`,
      errors: [verbNounError('payloadData')],
    },

    // Invalid class method names (not verb phrases)
    {
      code: `class Service {
        data() { }
      }`,
      errors: [verbNounError('data')],
    },
    {
      filename: 'UserData.ts',
      code: `function UserData() {
        let make = () => { return null; };
        make = () => { return 1; };
        return make;
      }`,
      errors: [verbNounError('UserData')],
    },
    {
      filename: 'StatusData.ts',
      code: `function StatusData() {
        const make = () => { return null; };
        {
          const make = () => { return 1; };
          return make;
        }
      }`,
      errors: [verbNounError('StatusData')],
    },

    // Issue #1555 controls — the exemption is opt-in, file-scoped, and
    // export-scoped; everything outside those bounds still reports.
    {
      name: 'without options the noun-phrase export still reports',
      code: 'export const axisProfile = (raster, params) => { return null; };',
      filename: 'scripts/design/proxy/ops/axisProfile.mjs',
      errors: [verbNounError('axisProfile')],
    },
    {
      name: 'an empty pattern list exempts nothing',
      code: 'export const axisProfile = (raster, params) => { return null; };',
      options: [{ externallyNamedExports: [] }],
      filename: 'scripts/design/proxy/ops/axisProfile.mjs',
      errors: [verbNounError('axisProfile')],
    },
    {
      name: 'a non-matching pattern leaves the file checked',
      code: 'export const axisProfile = (raster, params) => { return null; };',
      options: [{ externallyNamedExports: ['**/predicates/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/axisProfile.mjs',
      errors: [verbNounError('axisProfile')],
    },
    {
      name: 'a non-exported binding in a matching file still reports',
      code: 'const axisProfile = (raster, params) => { return null; };',
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/index.mjs',
      errors: [verbNounError('axisProfile')],
    },
    {
      name: 'a non-exported function declaration in a matching file still reports',
      code: `function glyphPopulation() { return null; }
export const computeProfile = () => glyphPopulation();`,
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/computeProfile.mjs',
      errors: [verbNounError('glyphPopulation')],
    },
    {
      name: 'a nested function inside an exported function still reports',
      code: `export const computeProfile = () => {
  function axisProfile() { return null; }
  return axisProfile;
};`,
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/computeProfile.mjs',
      errors: [verbNounError('axisProfile')],
    },
    {
      name: 'a re-export carrying a source does not exempt a same-named local',
      code: `const axisProfile = () => { return null; };
export { axisProfile } from './registry.mjs';`,
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/index.mjs',
      errors: [verbNounError('axisProfile')],
    },
    {
      name: 'a method on an exported class is a local API choice, not a registry key',
      code: `export class OpRunner {
  axisProfile() { return null; }
}`,
      options: [{ externallyNamedExports: ['**/ops/*.mjs'] }],
      filename: 'scripts/design/proxy/ops/OpRunner.mjs',
      errors: [verbNounError('axisProfile')],
    },
    {
      name: 'malformed glob patterns match nothing and do not crash',
      code: 'const axisProfile = (raster, params) => { return null; };',
      options: [{ externallyNamedExports: ['[', '(foo'] }],
      filename: 'scripts/design/proxy/ops/axisProfile.mjs',
      errors: [verbNounError('axisProfile')],
    },
    {
      name: 'malformed glob patterns do not exempt exports either',
      code: 'export const axisProfile = (raster, params) => { return null; };',
      options: [{ externallyNamedExports: ['[', '(foo'] }],
      filename: 'scripts/design/proxy/ops/axisProfile.mjs',
      errors: [verbNounError('axisProfile')],
    },
  ],
});

// Both rules ship in the recommended config and `no-explicit-return-type` is
// fixable, so one `eslint --fix` pass deletes the return-type annotation that
// identifies a React component in a `.ts` file. Recognising the component only
// by that annotation makes the fix pass manufacture a naming violation whose
// remedy — renaming a component to a verb phrase — breaks every JSX call site
// and cannot be silenced by restoring the annotation (issue #1596).
describe('enforce-verb-noun-naming after no-explicit-return-type --fix', () => {
  const VICTIM_ID = '@blumintinc/blumint/enforce-verb-noun-naming';
  const CULPRIT_ID = '@blumintinc/blumint/no-explicit-return-type';
  const FILENAME = 'src/components/MyComponent.ts';

  const ANNOTATION = /:\s*(React\.)?(JSX\.Element|FC|ReactElement|Record<)/;

  const COMPONENT_SOURCES: [string, string][] = [
    [
      'a JSX.Element return annotation',
      'function MyComponent(): React.JSX.Element {\n  return null;\n}\n',
    ],
    [
      'a React.FC return annotation',
      'function MyComponent(): React.FC {\n  return null;\n}\n',
    ],
    [
      'a bare ReactElement return annotation',
      'export function MyComponent(): ReactElement {\n  return null;\n}\n',
    ],
    [
      'an annotated arrow component',
      'export const MyComponent = (): React.JSX.Element => {\n  return null;\n};\n',
    ],
  ];

  // A genuinely misnamed helper carries an annotation too, so the fix pass
  // strips it just the same; the rule must keep reporting it afterwards.
  const HELPER_SOURCE =
    'export function ConfigParser(): Record<string, string> {\n  return { parsed: "true" };\n}\n';

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      VICTIM_ID,
      enforceVerbNounNaming as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      CULPRIT_ID,
      noExplicitReturnType as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules,
  });

  it.each(COMPONENT_SOURCES)(
    'keeps a component silent through the fix pass: %s',
    (_label, source) => {
      const linter = makeLinter();
      expect(
        linter.verify(source, configFor({ [VICTIM_ID]: 'error' }), FILENAME),
      ).toHaveLength(0);

      const fixed = linter.verifyAndFix(
        source,
        configFor({ [CULPRIT_ID]: 'error' }),
        FILENAME,
      );
      // Without this the case passes vacuously whenever the culprit stops
      // rewriting the annotated form.
      expect(fixed.output).not.toMatch(ANNOTATION);
      expect(fixed.output).not.toEqual(source);

      expect(
        linter.verify(
          fixed.output,
          configFor({ [VICTIM_ID]: 'error' }),
          FILENAME,
        ),
      ).toHaveLength(0);
    },
  );

  it('still reports a misnamed non-component through the same pipeline', () => {
    const linter = makeLinter();
    expect(
      linter.verify(
        HELPER_SOURCE,
        configFor({ [VICTIM_ID]: 'error' }),
        FILENAME,
      ),
    ).toHaveLength(1);

    const fixed = linter.verifyAndFix(
      HELPER_SOURCE,
      configFor({ [CULPRIT_ID]: 'error' }),
      FILENAME,
    );
    expect(fixed.output).not.toMatch(ANNOTATION);
    expect(fixed.output).not.toEqual(HELPER_SOURCE);

    expect(
      linter.verify(
        fixed.output,
        configFor({ [VICTIM_ID]: 'error' }),
        FILENAME,
      ),
    ).toHaveLength(1);
  });
});
