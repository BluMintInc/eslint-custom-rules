import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { preferGlobalRouterStateKey } from '../rules/prefer-global-router-state-key';

const stringLiteralError = (keyValue: string) => ({
  messageId: 'preferGlobalRouterStateKey' as const,
  data: { keyValue },
});

const invalidSourceError = (variableName: string) => ({
  messageId: 'invalidQueryKeySource' as const,
  data: { variableName },
});

/**
 * One static key in two spellings, and the single fixed state both must reach.
 *
 * A quoted key and an expression-free template are the same key written two
 * ways, and the rule reports them identically, so the fix it emits has to be the
 * same text. Pointing both cases at ONE `output` constant is what makes a fix
 * withheld from either spelling a failure rather than a difference a reader
 * could take for intent (#1804). The template spelling is derived from the
 * quoted one so that the quoting stays their only difference.
 */
const STATIC_KEY_QUOTED = `
        function Component() {
          const [value] = useRouterState({ key: 'stream-view' });
          return <div>{value}</div>;
        }
        `;

const STATIC_KEY_TEMPLATE = STATIC_KEY_QUOTED.replace(
  "'stream-view'",
  '`stream-view`',
);

const STATIC_KEY_FIXED = `import { QUERY_KEY_STREAM_VIEW } from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_STREAM_VIEW });
          return <div>{value}</div>;
        }
        `;

/**
 * The same pairing for a key written with an escape. Both spellings denote the
 * character the escape renders to, so both derive the same constant — which
 * only holds if the template is read through `cooked`; `raw` would invent
 * `QUERY_KEY_USER_U002DPROFILE` for the template alone.
 */
const ESCAPED_KEY_QUOTED = `
        function Component() {
          const [value] = useRouterState({ key: 'user\\u002dprofile' });
          return <div>{value}</div>;
        }
        `;

const ESCAPED_KEY_TEMPLATE = ESCAPED_KEY_QUOTED.replace(
  "'user\\u002dprofile'",
  '`user\\u002dprofile`',
);

const ESCAPED_KEY_FIXED = `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `;

/**
 * One component body parameterized by the text spelling the key, so a case's
 * notation is the only thing that varies from its neighbours.
 */
const keyCode = (keySpelling: string) => `
        function Component() {
          const [value] = useRouterState({ key: ${keySpelling} });
          return <div>{value}</div>;
        }
        `;

/**
 * Keys that normalize to nothing: empty, or made only of the characters the
 * normalizer turns into separators and then strips. No constant name can be
 * derived from any of them, and the notation carrying one makes no difference
 * to that — which is why every spelling is listed rather than just the quoted
 * empty string the report cited (#1811).
 */
const SINGLE_CHARACTER_KEY_FIXED = `import { QUERY_KEY_A } from 'src/util/routing/queryKeys';
${keyCode('QUERY_KEY_A')}`;

const DEGENERATE_KEY_SPELLINGS = [
  "''",
  '``',
  "'-'",
  '`-`',
  "'_'",
  '`_`',
  "'---'",
  "':'",
  "'/'",
  "'.'",
  "'_-:/.'",
  "'   '",
];

ruleTesterJsx.run(
  'prefer-global-router-state-key',
  preferGlobalRouterStateKey,
  {
    valid: [
      // 1. Import Patterns - Namespace imports
      {
        code: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QueryKeys.QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },
      {
        code: `
        import * as QueryKeys from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QueryKeys.QUERY_KEY_SETTINGS });
          return <div>{value}</div>;
        }
        `,
      },

      // 2. Import Patterns - Default imports
      {
        code: `
        import queryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: queryKeys.QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },

      // 3. Import Patterns - Named imports
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },
      {
        code: `
        import { QUERY_KEY_USER_PROFILE, QUERY_KEY_SETTINGS } from 'src/util/routing/queryKeys';

        function Component() {
          const [value1] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [value2] = useRouterState({ key: QUERY_KEY_SETTINGS });
          return <div>{value1} {value2}</div>;
        }
        `,
      },

      // 4. Import Patterns - Re-exports
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/constants';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },
      {
        code: `
        import { QUERY_KEY_USER_PROFILE as USER_KEY } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: USER_KEY });
          return <div>{value}</div>;
        }
        `,
      },

      // 5. React Hook Integration - useEffect dependencies
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });

          useEffect(() => {
            // some effect
          }, [value]);

          return <div>{value}</div>;
        }
        `,
      },

      // 6. React Hook Integration - useCallback/useMemo
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const memoizedKey = useMemo(() => QUERY_KEY_USER_PROFILE, []);
          const [value] = useRouterState({ key: memoizedKey });
          return <div>{value}</div>;
        }
        `,
      },

      // 7. React Hook Integration - Custom hook patterns
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function useCustomRouter() {
          return useRouterState({ key: QUERY_KEY_USER_PROFILE });
        }

        function Component() {
          const [value] = useCustomRouter();
          return <div>{value}</div>;
        }
        `,
      },

      // 8. TypeScript Patterns - Type assertions
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const key = QUERY_KEY_USER_PROFILE as const;
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
      },

      // 9. TypeScript Patterns - Interface/type usage
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        interface RouterConfig {
          key: string;
        }

        function Component() {
          const config: RouterConfig = { key: QUERY_KEY_USER_PROFILE };
          const [value] = useRouterState(config);
          return <div>{value}</div>;
        }
        `,
      },

      // 10. Complex React Patterns - Higher-order components
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        const withRouter = (Component) => (props) => {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <Component {...props} routerValue={value} />;
        };
        `,
      },

      // 11. Async/Dynamic Patterns - Variables derived from constants (simple case)
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const key = QUERY_KEY_USER_PROFILE;
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
      },

      // 12. Template literals with query keys
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component({ id }) {
          const [value] = useRouterState({ key: \`\${QUERY_KEY_USER_PROFILE}-\${id}\` });
          return <div>{value}</div>;
        }
        `,
      },

      // 13. Conditional expressions with query keys
      {
        code: `
        import { QUERY_KEY_USER_PROFILE, QUERY_KEY_ADMIN_PROFILE } from '@/util/routing/queryKeys';

        function Component({ isAdmin }) {
          const key = isAdmin ? QUERY_KEY_ADMIN_PROFILE : QUERY_KEY_USER_PROFILE;
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
      },

      // 14. Function calls returning keys (allowed - permissive)
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function getKey() {
          return QUERY_KEY_USER_PROFILE;
        }

        function Component() {
          const [value] = useRouterState({ key: getKey() });
          return <div>{value}</div>;
        }
        `,
      },

      // 15. Function calls with string literals (allowed - permissive)
      {
        code: `
        function getKey() {
          return 'user-profile';
        }

        function Component() {
          const [value] = useRouterState({ key: getKey() });
          return <div>{value}</div>;
        }
        `,
      },

      // 17. Spread operator (allowed - permissive for complex cases)
      {
        code: `
        function Component() {
          const config = { key: 'user-profile' };
          const [value] = useRouterState({ ...config });
          return <div>{value}</div>;
        }
        `,
      },

      // 19. Relative imports
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '../util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },

      // 20. Mixed import styles
      {
        code: `
        import queryKeys, { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const [value1] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [value2] = useRouterState({ key: queryKeys.QUERY_KEY_SETTINGS });
          return <div>{value1} {value2}</div>;
        }
        `,
      },

      // 21. Template literals with only separators
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component({ id }) {
          const [value] = useRouterState({ key: \`\${QUERY_KEY_USER_PROFILE}_\${id}\` });
          return <div>{value}</div>;
        }
        `,
      },

      // 22. Binary expressions with query keys
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component({ suffix }) {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE + suffix });
          return <div>{value}</div>;
        }
        `,
      },

      // 23. Sibling of queryKeys.ts reaches it as './queryKeys'
      {
        filename: 'src/util/routing/useProfileKey.ts',
        code: `
        import { QUERY_KEY_USER_PROFILE } from './queryKeys';

        export const useProfileKey = () => {
          return useRouterState({ key: QUERY_KEY_USER_PROFILE });
        };
        `,
      },

      // 24. Relative specifier whose text omits the 'util' segment
      {
        filename: 'src/util/notification/actions/buildProfileUrl.ts',
        code: `
        import { QUERY_KEY_USER_PROFILE } from '../../routing/queryKeys';

        export const buildProfileUrl = () => {
          return useRouterState({ key: QUERY_KEY_USER_PROFILE });
        };
        `,
      },

      // 25. Depth-correct relative specifier from a nested component
      {
        filename: 'src/components/tournament/TeamCard.tsx',
        code: `
        import { QUERY_KEY_USER_PROFILE } from '../../util/routing/queryKeys';

        function TeamCard() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },

      // A destructured callback parameter iterating a global constant array cannot be
      // replaced by a single QUERY_KEY_* constant.
      `
import { GROUP_IDS } from '../../util/routing/groupIds';
export const useGroupIdMap = () => {
  const routerStates = GROUP_IDS.map(({ key, location }) => {
    return useRouterState({ key, location });
  });
  return routerStates;
};
`,

      // 27. A plain function parameter is decided by the caller
      {
        code: `
        function useKey(key) {
          return useRouterState({ key });
        }
        `,
      },

      // 28. A renamed destructured parameter is still a parameter
      {
        code: `
        export const useKeys = (entries) => {
          return entries.map(({ key: k }) => useRouterState({ key: k }));
        };
        `,
      },

      // 29. A parameter with a default value
      {
        code: `
        export const useKey = ({ key = 'fallback' }) => {
          return useRouterState({ key });
        };
        `,
      },

      // 30. A nested callback resolves the outer function's parameter
      {
        code: `
        export const useKey = (key) => {
          return useMemo(() => {
            return useRouterState({ key });
          }, [key]);
        };
        `,
      },

      // 31. A callback parameter shadows an outer literal of the same name
      {
        code: `
        const key = 'user-profile';

        export const useKeys = (entries) => {
          return entries.map((key) => useRouterState({ key }));
        };
        `,
      },

      // 32. A typed parameter of a class method
      {
        code: `
        class RouterStates {
          public build(key: string) {
            return useRouterState({ key });
          }
        }
        `,
      },

      // 33. A rest parameter element reaching useRouterState
      {
        code: `
        export const useKeys = (...keys) => {
          return keys.map((key) => useRouterState({ key }));
        };
        `,
      },

      // 34. A destructured parameter of a function expression, not an arrow
      {
        code: `
        export const useKeys = (entries) => {
          return entries.flatMap(function ({ key }) {
            return useRouterState({ key });
          });
        };
        `,
      },

      // ------------------------------------------------------------------
      // Issue #1833: `a?.b()` parses as a ChainExpression wrapping the call, a
      // type the key-source classifier does not name, so the optional spelling
      // of a source the rule accepts fell through to the unrecognised-source
      // arm. Each case below is the optional twin of a spelling already
      // accepted, so a report here is one the plain spelling is allowed. The
      // sibling `enforce-querykey-ts` accepts all of these (#1832, #1714), and
      // both rules ship as `error`, so a divergence leaves a consumer with no
      // spelling that satisfies both. The invalid mirrors that keep this from
      // becoming a blanket escape hatch are cases 80-83.
      // ------------------------------------------------------------------

      // 35. A method called through an optional receiver, which is what a
      // human writes when the object may be absent.
      {
        name: 'an optional receiver on a key-building method is allowed',
        code: `
        function Component({ config }) {
          const derivedKey = config?.getQueryKey();
          const [value] = useRouterState({ key: derivedKey });
          return <div>{value}</div>;
        }
        `,
      },

      // 36. The optionally called factory the sibling rule documents.
      {
        name: 'an optional call to a key factory is allowed',
        code: `
        function Component() {
          const derivedKey = buildQueryKey?.('match-session');
          const [value] = useRouterState({ key: derivedKey });
          return <div>{value}</div>;
        }
        `,
      },

      // 37. Each link of an assignment chain resolves to the optional call at
      // its end.
      {
        name: 'an optional call reached through an assignment chain is allowed',
        code: `
        function Component() {
          const baseKey = fetchKey?.();
          const derivedKey = baseKey;
          const [value] = useRouterState({ key: derivedKey });
          return <div>{value}</div>;
        }
        `,
      },

      // 38. A concatenation is judged by its operands, and an optional call is
      // still the operand carrying the key.
      {
        name: 'a concatenation around an optional call is allowed',
        code: `
        function Component({ config, id }) {
          const [value] = useRouterState({ key: config?.getKey() + '-' + id });
          return <div>{value}</div>;
        }
        `,
      },

      // 39. A template's static text is judged the same way through the chain
      // as without it: the call carve-out covers the interpolation either way.
      {
        name: 'an optional call inside a template is allowed',
        code: `
        function Component() {
          const [value] = useRouterState({ key: \`user-profile-\${buildQueryKey?.('match')}\` });
          return <div>{value}</div>;
        }
        `,
      },

      // 40. Not the call carve-out but the member one: the chain resolves to
      // the node underneath rather than being waved through, so a namespace
      // member of queryKeys stays allowed for the reason it always was.
      {
        name: 'an optional member of a queryKeys namespace import is allowed',
        code: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const matchKey = QueryKeys?.QUERY_KEY_MATCH;
          const [value] = useRouterState({ key: matchKey });
          return <div>{value}</div>;
        }
        `,
      },

      // ------------------------------------------------------------------
      // Issue #1836: a key passed DIRECTLY reaches a dispatch that enumerates
      // node types, so every wrapper restating the key — an optional chain, an
      // assertion — used to match no arm and report nothing. Reading through
      // those wrappers is what closes that, and these cases are the control on
      // the other side of it: an approved source stays approved in every
      // spelling. A dispatch that reported whatever it could not classify
      // would satisfy invalid cases 84-92 while flagging the code this rule
      // exists to bless.
      // ------------------------------------------------------------------

      // 41. The constant itself, widened by an assertion.
      {
        name: 'an asserted queryKeys constant passed directly is allowed',
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE as string });
          return <div>{value}</div>;
        }
        `,
      },

      // 42. The same constant under `satisfies`, which checks the type without
      // changing the value at all.
      {
        name: 'a queryKeys constant under satisfies is allowed',
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE satisfies string });
          return <div>{value}</div>;
        }
        `,
      },

      // 43. A non-null assertion, which is what a human writes when the
      // constant arrives through an optional type.
      {
        name: 'a non-null asserted queryKeys constant is allowed',
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE! });
          return <div>{value}</div>;
        }
        `,
      },

      // 44. The namespace member of valid case 40 passed straight into the
      // call, where no variable stands between the chain and the dispatch.
      {
        name: 'an optional namespace member passed directly is allowed',
        code: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QueryKeys?.QUERY_KEY_MATCH });
          return <div>{value}</div>;
        }
        `,
      },

      // 45. Two wrappers over the call carve-out: unwrapping has to reach the
      // call through both, not stop at the outer one.
      {
        name: 'an asserted optional call is allowed',
        code: `
        function Component() {
          const [value] = useRouterState({ key: buildQueryKey?.('match') as string });
          return <div>{value}</div>;
        }
        `,
      },

      // 46. The parameter carve-out survives the unwrap. A parameter holds a
      // different value on every call, so no constant can stand in for it
      // (#1394) — and that verdict is reached by resolving to the identifier,
      // never by failing to classify the wrapper.
      {
        name: 'an asserted parameter binding is allowed',
        code: `
        export const useKeys = (paramKey) => {
          return useRouterState({ key: paramKey as string });
        };
        `,
      },

      // 47. The scope boundary, recorded rather than endorsed: a ternary is
      // not a wrapper. Its two branches name two sources and no single one, so
      // the source-naming report has nothing to name, and reporting the whole
      // expression would bypass the per-source parameter carve-out above. A
      // ternary carrying a string literal still reports through the literal
      // path — invalid cases 8 and 17 pin that — so what stays silent here is
      // only the branch-by-branch source verdict.
      {
        name: 'a ternary of unapproved sources is outside this rule, not approved',
        code: `
        function Component({ config, other }) {
          const [value] = useRouterState({ key: flag ? config.queryKey : other.k });
          return <div>{value}</div>;
        }
        `,
      },
    ],
    invalid: [
      // 1. Basic string literals
      {
        code: `
        function Component() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },
      {
        code: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QueryKeys.QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },
      {
        code: `
        import queryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `
        import queryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: queryKeys.QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },

      // 2a. Merge with existing queryKeys import
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-settings' });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-settings'")],
        output: `
        import { QUERY_KEY_USER_PROFILE, QUERY_KEY_USER_SETTINGS } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_SETTINGS });
          return <div>{value}</div>;
        }
        `,
      },
      // 2b. Namespace import should qualify constant
      {
        code: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QueryKeys.QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },
      // 2c. Default import should qualify constant
      {
        code: `
        import queryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-settings' });
          return <div>{value}</div>;
        }
        `,
        output: `
        import queryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: queryKeys.QUERY_KEY_USER_SETTINGS });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-settings'")],
      },

      // 2. String literals in template expressions
      {
        code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: 'user-profile-' + id });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile-' + id")],
      },

      // 3. String literals in conditional expressions
      {
        code: `
        function Component({ isAdmin }) {
          const [value] = useRouterState({
            key: isAdmin ? 'admin-dashboard' : 'user-dashboard'
          });
          return <div>{value}</div>;
        }
        `,
        errors: [
          stringLiteralError("isAdmin ? 'admin-dashboard' : 'user-dashboard'"),
        ],
      },

      // 4. Template literals with static content
      {
        code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: \`user-profile-\${id}\` });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError('`user-profile-${id}`')],
      },

      // 5. Variables not from query keys
      {
        code: `
        function Component() {
          const key = 'user-profile';
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('key')],
      },

      // 6. Variables from wrong import source
      {
        code: `
        import { USER_PROFILE_KEY } from '@/constants/other';

        function Component() {
          const [value] = useRouterState({ key: USER_PROFILE_KEY });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('USER_PROFILE_KEY')],
      },

      // 7. Non-QUERY_KEY constants from correct source
      {
        code: `
        import { OTHER_CONSTANT } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: OTHER_CONSTANT });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('OTHER_CONSTANT')],
      },

      // 8. Mixed valid and invalid in conditional
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component({ isAdmin }) {
          const [value] = useRouterState({
            key: isAdmin ? QUERY_KEY_USER_PROFILE : 'admin-dashboard'
          });
          return <div>{value}</div>;
        }
        `,
        errors: [
          stringLiteralError(
            "isAdmin ? QUERY_KEY_USER_PROFILE : 'admin-dashboard'",
          ),
        ],
      },

      // 9. Member expression without validated source
      {
        code: `
        function Component() {
          const keys = { user: 'user-profile' };
          const [value] = useRouterState({ key: keys.user });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('keys.user')],
      },

      // 10. Array member expression without validated source
      {
        code: `
        function Component() {
          const keys = ['user-profile', 'user-settings'];
          const [value] = useRouterState({ key: keys[0] });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('keys[0]')],
      },

      // 11. Import from unrelated queryKeys path should be rejected
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from './some/other/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('QUERY_KEY_USER_PROFILE')],
      },

      // 9. String literals in custom hooks
      {
        code: `
        function useCustomRouter() {
          return useRouterState({ key: 'user-profile' });
        }

        function Component() {
          const [value] = useCustomRouter();
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function useCustomRouter() {
          return useRouterState({ key: QUERY_KEY_USER_PROFILE });
        }

        function Component() {
          const [value] = useCustomRouter();
          return <div>{value}</div>;
        }
        `,
      },

      // 10. String literals in HOCs
      {
        code: `
        const withRouter = (Component) => (props) => {
          const [value] = useRouterState({ key: 'user-profile' });
          return <Component {...props} routerValue={value} />;
        };
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        const withRouter = (Component) => (props) => {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <Component {...props} routerValue={value} />;
        };
        `,
      },

      // 11. Multiple string literals
      {
        code: `
        function Component() {
          const [value1] = useRouterState({ key: 'user-profile' });
          const [value2] = useRouterState({ key: 'user-settings' });
          return <div>{value1} {value2}</div>;
        }
        `,
        errors: [
          stringLiteralError("'user-profile'"),
          stringLiteralError("'user-settings'"),
        ],
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Component() {
          const [value1] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [value2] = useRouterState({ key: 'user-settings' });
          return <div>{value1} {value2}</div>;
        }
        `,
      },

      // 12. String literals with other properties
      {
        code: `
        function Component() {
          const [value] = useRouterState({
            key: 'user-profile',
            location: 'queryParam'
          });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({
            key: QUERY_KEY_USER_PROFILE,
            location: 'queryParam'
          });
          return <div>{value}</div>;
        }
        `,
      },

      // 13. Template literals with significant static content
      {
        code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: \`userProfile\${id}\` });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError('`userProfile${id}`')],
      },

      // 14. Binary expressions with string literals
      {
        code: `
        function Component({ suffix }) {
          const [value] = useRouterState({ key: 'user-profile' + suffix });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile' + suffix")],
      },

      // 15. Namespace import with wrong property (currently not detected - complex to implement)
      // This would require static analysis of the imported module

      // 16. Type assertion on string literal
      {
        code: `
        function Component() {
          const key = 'user-profile' as const;
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('key')],
      },

      // 17. Conditional with both branches invalid
      {
        code: `
        function Component({ type }) {
          const [value] = useRouterState({
            key: type === 'admin' ? 'admin-profile' : 'user-profile'
          });
          return <div>{value}</div>;
        }
        `,
        errors: [
          stringLiteralError(
            "type === 'admin' ? 'admin-profile' : 'user-profile'",
          ),
        ],
      },

      // 18. Mixed import sources - some valid, some invalid
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';
        import { OTHER_KEY } from '@/constants/other';

        function Component({ useOther }) {
          const key = useOther ? OTHER_KEY : QUERY_KEY_USER_PROFILE;
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('key')],
      },

      // 19. Template literal with only static content. Its value is knowable
      // without running the program, so it carries the same remedy the quoted
      // spelling of that key carries (#1804).
      {
        code: `
        function Component() {
          const [value] = useRouterState({ key: \`userProfile\` });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError('`userProfile`')],
        output: `import { QUERY_KEY_USERPROFILE } from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USERPROFILE });
          return <div>{value}</div>;
        }
        `,
      },

      // 20. Async patterns with string literals
      {
        code: `
        function Component() {
          const [key, setKey] = useState('initial-key');
          const [value] = useRouterState({ key });

          useEffect(() => {
            setKey('updated-key');
          }, []);

          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('key')],
      },
      // 21. Side-effect queryKeys import should still add named import
      {
        code: `
        import '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `
        import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },
      // 22. Should NOT merge with type-only import
      {
        code: "import type { SomeType } from '@/util/routing/queryKeys';\n\nfunction Component() {\n  const [value] = useRouterState({ key: 'user-profile' });\n  return <div>{value}</div>;\n}",
        output:
          "import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';\nimport type { SomeType } from '@/util/routing/queryKeys';\n\nfunction Component() {\n  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });\n  return <div>{value}</div>;\n}",
        errors: [stringLiteralError("'user-profile'")],
      },

      // 23. Two directories below src/ reaches queryKeys with two '../'
      {
        filename: 'src/components/tournament/TeamCard.tsx',
        code: `
        function TeamCard() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from '../../util/routing/queryKeys';

        function TeamCard() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 24. A deeper file gets more '../', proving the count follows real depth
      {
        filename: 'src/components/a/b/c/Bar.tsx',
        code: `
        function Bar() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from '../../../../util/routing/queryKeys';

        function Bar() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 25. A file directly in src/ descends into the target directory
      {
        filename: 'src/index.tsx',
        code: `
        function App() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from './util/routing/queryKeys';

        function App() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 26. A sibling of queryKeys.ts imports it by file name alone
      {
        filename: 'src/util/routing/useProfileKey.ts',
        code: `
        export const useProfileKey = () => {
          return useRouterState({ key: 'user-profile' });
        };
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from './queryKeys';

        export const useProfileKey = () => {
          return useRouterState({ key: QUERY_KEY_USER_PROFILE });
        };
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 27. An existing relative import is extended, never duplicated
      {
        filename: 'src/components/tournament/TeamCard.tsx',
        code: `
        import { QUERY_KEY_USER_PROFILE } from '../../util/routing/queryKeys';

        function TeamCard() {
          const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [settings] = useRouterState({ key: 'user-settings' });
          return <div>{profile}{settings}</div>;
        }
        `,
        output: `
        import { QUERY_KEY_USER_PROFILE, QUERY_KEY_USER_SETTINGS } from '../../util/routing/queryKeys';

        function TeamCard() {
          const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [settings] = useRouterState({ key: QUERY_KEY_USER_SETTINGS });
          return <div>{profile}{settings}</div>;
        }
        `,
        errors: [stringLiteralError("'user-settings'")],
      },

      // 28. A sibling's './queryKeys' import is extended, never duplicated
      {
        filename: 'src/util/routing/useProfileKey.ts',
        code: `
        import { QUERY_KEY_USER_PROFILE } from './queryKeys';

        export const useProfileKey = () => {
          const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [settings] = useRouterState({ key: 'user-settings' });
          return [profile, settings];
        };
        `,
        output: `
        import { QUERY_KEY_USER_PROFILE, QUERY_KEY_USER_SETTINGS } from './queryKeys';

        export const useProfileKey = () => {
          const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [settings] = useRouterState({ key: QUERY_KEY_USER_SETTINGS });
          return [profile, settings];
        };
        `,
        errors: [stringLiteralError("'user-settings'")],
      },

      // 29. Outside src/, the bare specifier that tsconfig paths resolve is kept
      {
        filename: 'pages/legacy/Widget.tsx',
        code: `
        function Widget() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Widget() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 30. An absolute filename derives the same relative specifier
      {
        filename: '/repo/src/components/tournament/TeamCard.tsx',
        code: `
        function TeamCard() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from '../../util/routing/queryKeys';

        function TeamCard() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 31. A module-scope local variable is substitutable, unlike a parameter
      {
        code: `
        const key = 'user-profile';

        function Component() {
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('key')],
      },

      // 32. An inner local shadowing a parameter of the same name still reports
      {
        code: `
        export const useKey = (key) => {
          const inner = () => {
            const key = 'user-profile';
            return useRouterState({ key });
          };
          return inner();
        };
        `,
        errors: [invalidSourceError('key')],
      },

      // 33. An identifier named 'key' imported from an unrelated module
      {
        code: `
        import { key } from '../../util/routing/groupIds';

        export const useGroupKey = () => {
          return useRouterState({ key });
        };
        `,
        errors: [invalidSourceError('key')],
      },

      // 34. A parameter inside a ternary alongside a string literal
      {
        code: `
        export const useKey = (key) => {
          return useRouterState({ key: key ? key : 'user-profile' });
        };
        `,
        errors: [stringLiteralError("key ? key : 'user-profile'")],
      },

      // 35. A parameter reached through a member expression is not a bare binding
      {
        code: `
        export const useKey = ({ keys }) => {
          return useRouterState({ key: keys.user });
        };
        `,
        errors: [invalidSourceError('keys.user')],
      },

      // -----------------------------------------------------------------------
      // A binding that already owns the derived constant's name withholds the
      // edit (issue #1431). The violation is still reported; only the automated
      // fix is skipped.
      // -----------------------------------------------------------------------
      // 36. A pre-existing `QUERY_KEY_USER_PROFILE` binding makes the import
      // unsafe to insert, so the violation is reported without an autofix.
      {
        code: `
const QUERY_KEY_USER_PROFILE = undefined as unknown as never;
export const useProfileKey = () => {
          return useRouterState({ key: 'user-profile' });
        };
`,
        output: `
const QUERY_KEY_USER_PROFILE = undefined as unknown as never;
export const useProfileKey = () => {
          return useRouterState({ key: 'user-profile' });
        };
`,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 37. The guard follows the name derived from the key, not one constant:
      // a different key collides with a different existing binding.
      {
        code: `
const QUERY_KEY_USER_SETTINGS = undefined as unknown as never;
export const useSettingsKey = () => {
          return useRouterState({ key: 'user-settings' });
        };
`,
        output: `
const QUERY_KEY_USER_SETTINGS = undefined as unknown as never;
export const useSettingsKey = () => {
          return useRouterState({ key: 'user-settings' });
        };
`,
        errors: [stringLiteralError("'user-settings'")],
      },

      // 38. A binding of some other derived name leaves the fix reachable,
      // proving the guard is keyed to the constant this fix emits.
      {
        code: `
const QUERY_KEY_USER_SETTINGS = undefined as unknown as never;
export const useProfileKey = () => {
          return useRouterState({ key: 'user-profile' });
        };
`,
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

const QUERY_KEY_USER_SETTINGS = undefined as unknown as never;
export const useProfileKey = () => {
          return useRouterState({ key: QUERY_KEY_USER_PROFILE });
        };
`,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 39. A `let` binding of the derived name collides just as a `const` does.
      {
        code: `
let QUERY_KEY_USER_PROFILE;

function Component() {
  return useRouterState({ key: 'user-profile' });
}
`,
        output: null,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 40. A function declaration owns the name at module scope.
      {
        code: `
function QUERY_KEY_USER_PROFILE() {}

function Component() {
  return useRouterState({ key: 'user-profile' });
}
`,
        output: null,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 41. A shadow declared inside the enclosing function raises no TypeScript
      // diagnostic, so only scope-chain resolution at the literal catches it.
      {
        code: `
function Component() {
  const QUERY_KEY_USER_PROFILE = 'stale-key';
  return useRouterState({ key: 'user-profile' });
}
`,
        output: null,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 42. A parameter of the enclosing function shadows the name too.
      {
        code: `
export const useProfileKey = (QUERY_KEY_USER_PROFILE) => {
  return useRouterState({ key: 'user-profile' });
};
`,
        output: null,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 43. The name imported from an unrelated module holds a different value.
      {
        code: `
import { QUERY_KEY_USER_PROFILE } from './legacy/keys';

function Component() {
  return useRouterState({ key: 'user-profile' });
}
`,
        output: null,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 44. An inline type-only specifier binds the name without providing a
      // value, so neither reusing nor re-importing it compiles.
      {
        code: `
import { type QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

function Component() {
  return useRouterState({ key: 'user-profile' });
}
`,
        output: null,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 45. Extending an existing queryKeys import is withheld as well, since
      // the added specifier declares the colliding name.
      {
        code: `
import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';
const QUERY_KEY_USER_SETTINGS = 'stale-key';

function Component() {
  const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  const [settings] = useRouterState({ key: 'user-settings' });
  return <div>{profile}{settings}</div>;
}
`,
        output: null,
        errors: [stringLiteralError("'user-settings'")],
      },

      // 46. A binding in a scope the literal cannot see is legally shadowed by
      // the inserted import, so the fix stays available.
      {
        code: `
function other() {
  const QUERY_KEY_USER_PROFILE = 'stale-key';
  return QUERY_KEY_USER_PROFILE;
}

function Component() {
  return useRouterState({ key: 'user-profile' });
}
`,
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

function other() {
  const QUERY_KEY_USER_PROFILE = 'stale-key';
  return QUERY_KEY_USER_PROFILE;
}

function Component() {
  return useRouterState({ key: QUERY_KEY_USER_PROFILE });
}
`,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 47. One colliding literal withholds only its own edit; an independent
      // literal in the same file is still fixed.
      {
        code: `
const QUERY_KEY_USER_PROFILE = 'stale-key';

function Component() {
  const [profile] = useRouterState({ key: 'user-profile' });
  const [settings] = useRouterState({ key: 'user-settings' });
  return <div>{profile}{settings}</div>;
}
`,
        output: `import { QUERY_KEY_USER_SETTINGS } from 'src/util/routing/queryKeys';

const QUERY_KEY_USER_PROFILE = 'stale-key';

function Component() {
  const [profile] = useRouterState({ key: 'user-profile' });
  const [settings] = useRouterState({ key: QUERY_KEY_USER_SETTINGS });
  return <div>{profile}{settings}</div>;
}
`,
        errors: [
          stringLiteralError("'user-profile'"),
          stringLiteralError("'user-settings'"),
        ],
      },

      // 48. An alias already carrying the constant is referenced instead, so a
      // colliding module-scope binding of the constant's own name is harmless.
      {
        code: `
import { QUERY_KEY_USER_PROFILE as PROFILE_KEY } from '@/util/routing/queryKeys';
const QUERY_KEY_USER_PROFILE = 'stale-key';

function Component() {
  return useRouterState({ key: 'user-profile' });
}
`,
        output: `
import { QUERY_KEY_USER_PROFILE as PROFILE_KEY } from '@/util/routing/queryKeys';
const QUERY_KEY_USER_PROFILE = 'stale-key';

function Component() {
  return useRouterState({ key: PROFILE_KEY });
}
`,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 49. A qualified reference through a namespace import declares nothing,
      // so a colliding binding of the constant's name cannot break it.
      {
        code: `
import * as QueryKeys from '@/util/routing/queryKeys';
const QUERY_KEY_USER_PROFILE = 'stale-key';

function Component() {
  return useRouterState({ key: 'user-profile' });
}
`,
        output: `
import * as QueryKeys from '@/util/routing/queryKeys';
const QUERY_KEY_USER_PROFILE = 'stale-key';

function Component() {
  return useRouterState({ key: QueryKeys.QUERY_KEY_USER_PROFILE });
}
`,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 50. An import written below the call site already binds the constant,
      // so the literal is rewritten and the import left untouched.
      {
        code: `
function Component() {
  return useRouterState({ key: 'user-profile' });
}

import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';
`,
        output: `
function Component() {
  return useRouterState({ key: QUERY_KEY_USER_PROFILE });
}

import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';
`,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 51. A local binding of the namespace alias captures the qualified
      // reference, so the fix is withheld and only the report stands.
      {
        code: `
import * as QueryKeys from '@/util/routing/queryKeys';

function Component() {
  const QueryKeys = { QUERY_KEY_USER_PROFILE: 'shadowed-wrong-key' };
  const [value] = useRouterState({ key: 'user-profile' });
  return [value, QueryKeys];
}
`,
        output: null,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 52. Same capture through a default import's local name.
      {
        code: `
import queryKeys from '@/util/routing/queryKeys';

function Component() {
  const queryKeys = { QUERY_KEY_USER_PROFILE: 'shadowed-wrong-key' };
  const [value] = useRouterState({ key: 'user-profile' });
  return [value, queryKeys];
}
`,
        output: null,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 53. The capturing binding need not sit in the enclosing function: any
      // block scope between the literal and module scope shadows the alias.
      {
        code: `
import * as QueryKeys from '@/util/routing/queryKeys';

function Component(showProfile) {
  if (showProfile) {
    const QueryKeys = { QUERY_KEY_USER_PROFILE: 'shadowed-wrong-key' };
    const [value] = useRouterState({ key: 'user-profile' });
    return [value, QueryKeys];
  }
  return null;
}
`,
        output: null,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 54. A parameter captures the alias just as a local declaration does.
      {
        code: `
import queryKeys from '@/util/routing/queryKeys';

function Component(queryKeys) {
  const [value] = useRouterState({ key: 'user-profile' });
  return [value, queryKeys];
}
`,
        output: null,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 55. The constant's own imported name leads the emitted text whenever it
      // is already imported, so a local shadow of it withholds the fix even
      // though a default import is present.
      {
        code: `
import queryKeys, { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

function Component() {
  const QUERY_KEY_USER_PROFILE = 'shadowed-wrong-key';
  const [value] = useRouterState({ key: 'user-profile' });
  return [value, QUERY_KEY_USER_PROFILE];
}
`,
        output: null,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 56. That same file without the shadow still rewrites the literal to the
      // imported constant and leaves the import untouched.
      {
        code: `
import queryKeys, { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

function Component() {
  const [value] = useRouterState({ key: 'user-profile' });
  return value;
}
`,
        output: `
import queryKeys, { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

function Component() {
  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return value;
}
`,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 57. A same-named binding that never shadows the literal leaves the
      // alias resolving to the import, so the qualified fix still applies.
      {
        code: `
import * as QueryKeys from '@/util/routing/queryKeys';

function Sibling() {
  const QueryKeys = { QUERY_KEY_USER_PROFILE: 'unrelated' };
  return QueryKeys;
}

function Component() {
  const [value] = useRouterState({ key: 'user-profile' });
  return value;
}
`,
        output: `
import * as QueryKeys from '@/util/routing/queryKeys';

function Sibling() {
  const QueryKeys = { QUERY_KEY_USER_PROFILE: 'unrelated' };
  return QueryKeys;
}

function Component() {
  const [value] = useRouterState({ key: QueryKeys.QUERY_KEY_USER_PROFILE });
  return value;
}
`,
        errors: [stringLiteralError("'user-profile'")],
      },

      // ------------------------------------------------------------------
      // Issue #1804: the fix is gated on the key's VALUE being statically
      // known, never on the node type that spells it. Each pair below writes
      // one key two ways and asserts ONE shared `output`, so a spelling that
      // reports without a fix — a dead-end error — fails here. The declines
      // that follow pin the shapes that hold no single value, which is what
      // keeps the widening from reaching them.
      // ------------------------------------------------------------------

      // 58. The quoted spelling, whose fixed state its template twin shares.
      {
        name: 'a quoted static key is substituted and imported',
        code: STATIC_KEY_QUOTED,
        errors: [stringLiteralError("'stream-view'")],
        output: STATIC_KEY_FIXED,
      },

      // 59. The same key in template notation reaches the same bytes.
      {
        name: 'an expression-free template key emits the quoted spelling fix',
        code: STATIC_KEY_TEMPLATE,
        errors: [stringLiteralError('`stream-view`')],
        output: STATIC_KEY_FIXED,
      },

      // 60. An escape denotes the character it renders to, in both spellings.
      {
        name: 'an escaped quoted key derives its constant from the escape',
        code: ESCAPED_KEY_QUOTED,
        errors: [stringLiteralError("'user\\u002dprofile'")],
        output: ESCAPED_KEY_FIXED,
      },

      // 61. Reading the template through `raw` would invent a different
      // constant here, which is the whole difference this case exists to catch.
      {
        name: 'an escaped template key derives the same constant as the quoted one',
        code: ESCAPED_KEY_TEMPLATE,
        errors: [stringLiteralError('`user\\u002dprofile`')],
        output: ESCAPED_KEY_FIXED,
      },

      // 62. Two keys in one file, the first spelled as a template. A fix that
      // carries an import spans from character 0, so one pass can apply only
      // the first of them (case 11 above pins that for two quoted keys), and
      // the second violation stands for the pass that follows. Which fix wins
      // that race must not turn on notation: before #1804 the unfixable
      // template ceded the pass and the SECOND key was rewritten instead.
      {
        name: 'a template key claims the pass a quoted key in its place would',
        code: `
        function Component() {
          const [match] = useRouterState({ key: \`match-view\` });
          const [tournament] = useRouterState({ key: 'tournament-view' });
          return [match, tournament];
        }
        `,
        errors: [
          stringLiteralError('`match-view`'),
          stringLiteralError("'tournament-view'"),
        ],
        output: `import { QUERY_KEY_MATCH_VIEW } from 'src/util/routing/queryKeys';

        function Component() {
          const [match] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
          const [tournament] = useRouterState({ key: 'tournament-view' });
          return [match, tournament];
        }
        `,
      },

      // 63. An interpolated template holds a different key per render, so
      // there is no value to derive a constant from and the decline stands.
      {
        name: 'an interpolated template key reports without a fix',
        code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: \`session-\${id}\` });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError('`session-${id}`')],
        output: null,
      },

      // 64-65. Concatenation and a ternary decline for the same reason.
      {
        name: 'a concatenated key reports without a fix',
        code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: 'session-' + id });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'session-' + id")],
        output: null,
      },
      {
        name: 'a ternary between two static keys reports without a fix',
        code: `
        function Component({ isAdmin }) {
          const [value] = useRouterState({
            key: isAdmin ? 'admin-home' : 'user-home'
          });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("isAdmin ? 'admin-home' : 'user-home'")],
        output: null,
      },

      // ------------------------------------------------------------------
      // Issue #1811: a key whose normalized text is empty names no constant.
      // Emitting `QUERY_KEY_` anyway wrote an identifier `queryKeys.ts` cannot
      // export, so the "fixed" file failed to compile — strictly worse than
      // the report it replaced. Every spelling is asserted the same way,
      // because the decline turns on the key's VALUE; keying it to notation
      // would undo the parity #1804 established. The narrowness controls that
      // follow fix on a single surviving character.
      // ------------------------------------------------------------------
      ...DEGENERATE_KEY_SPELLINGS.map((spelling) => ({
        name: `a key spelled ${spelling} reports without a fix`,
        code: keyCode(spelling),
        errors: [stringLiteralError(spelling)],
        output: null,
      })),

      // 78. One alphanumeric character survives normalization, so a constant
      // exists and the fix stands: the decline covers keys that normalize to
      // nothing, not short keys.
      {
        name: 'a one-character key is still substituted and imported',
        code: keyCode("'a'"),
        errors: [stringLiteralError("'a'")],
        output: SINGLE_CHARACTER_KEY_FIXED,
      },

      // 79. Separators around a single character are stripped, and what is
      // left still names a constant.
      {
        name: 'a key of separators around one character is substituted',
        code: keyCode("'-a-'"),
        errors: [stringLiteralError("'-a-'")],
        output: SINGLE_CHARACTER_KEY_FIXED,
      },

      // ------------------------------------------------------------------
      // Issue #1833: reading through the optional chain must resolve to the
      // node underneath, not wave the chain through. These are the mirrors of
      // valid cases 35-40 — a source the plain spelling reports still reports
      // when written optionally. Without them, a rule that simply fell silent
      // on anything chained would satisfy every one of those valid cases while
      // being disabled for the inputs it exists to catch.
      // ------------------------------------------------------------------

      // 80. An unapproved member is unapproved through the chain too: the same
      // report `config.queryKey` draws, with the same absent fix — a chain
      // carries no statically known value, so no constant name is derivable
      // from one (#1803, #1811).
      {
        name: 'an optional member from an unapproved source still reports',
        code: `
        function Component({ config }) {
          const derivedKey = config?.queryKey;
          const [value] = useRouterState({ key: derivedKey });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('derivedKey')],
        output: null,
      },

      // 81. The template feeder reaches the same verdict on the same source,
      // and the interpolation still leaves the key valueless, so the report
      // stands with no fix behind it.
      {
        name: 'an optional member from an unapproved source in a template reports',
        code: `
        function Component({ config }) {
          const [value] = useRouterState({ key: \`user-profile-\${config?.queryKey}\` });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError('`user-profile-${config?.queryKey}`')],
        output: null,
      },

      // 82. The chain resolves INTO the namespace branch rather than past it:
      // an alias of queryKeys.ts is not a licence for any member of it, so a
      // property that is no `QUERY_KEY_*` export still reports.
      {
        name: 'an optional member of a queryKeys namespace that is no constant reports',
        code: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const matchKey = QueryKeys?.matchKey;
          const [value] = useRouterState({ key: matchKey });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('matchKey')],
        output: null,
      },

      // 83. Both directions in one file: the chained derivation stops
      // reporting while the literal beside it keeps its report and carries the
      // import, so the widening cannot be silencing the file wholesale.
      {
        name: 'a literal key beside an optional-chained derivation still fixes',
        code: `
        function Component({ config }) {
          const derivedKey = config?.getQueryKey();
          const [derived] = useRouterState({ key: derivedKey });
          const [stream] = useRouterState({ key: 'stream-view' });
          return <div>{derived}{stream}</div>;
        }
        `,
        errors: [stringLiteralError("'stream-view'")],
        output: `import { QUERY_KEY_STREAM_VIEW } from 'src/util/routing/queryKeys';

        function Component({ config }) {
          const derivedKey = config?.getQueryKey();
          const [derived] = useRouterState({ key: derivedKey });
          const [stream] = useRouterState({ key: QUERY_KEY_STREAM_VIEW });
          return <div>{derived}{stream}</div>;
        }
        `,
      },

      // ------------------------------------------------------------------
      // Issue #1836: the mirror of #1833 at the report site, and the silent
      // direction — a key passed DIRECTLY through a wrapper matched no arm of
      // a node-type dispatch, so an unapproved source went unreported wherever
      // it was written optionally or asserted. Each case below is the wrapped
      // twin of a report the plain spelling already produces, which is the
      // whole invariant: `key: X` and `key: <wrapper around X>` agree. Valid
      // cases 41-47 are the other side — the approved sources that must not
      // start reporting because the dispatch grew a reach.
      //
      // Every one of these declines its fix, and `output: null` says so. The
      // key's value is not statically known through a wrapper (#1803, #1811),
      // and substituting the constant underneath one would write
      // `QUERY_KEY_X as const`, which TypeScript rejects (TS1355) — a report
      // with no fix is the honest outcome.
      // ------------------------------------------------------------------

      // 84. The reported case: the optional twin of invalid case 6's member
      // access, passed directly rather than through a variable.
      {
        name: 'an optional member passed directly reports',
        code: `
        function Component({ config }) {
          const [value] = useRouterState({ key: config?.queryKey });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('config?.queryKey')],
        output: null,
      },

      // 85. An assertion restates the type and relocates nothing, so the same
      // member draws the same report through one.
      {
        name: 'an asserted member passed directly reports',
        code: `
        function Component({ config }) {
          const [value] = useRouterState({ key: config.queryKey as string });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('config.queryKey as string')],
        output: null,
      },

      // 86. `satisfies` checks a type and yields the same value, over an
      // identifier rather than a member.
      {
        name: 'an identifier under satisfies reports',
        code: `
        function Component({ config }) {
          const derivedKey = config.queryKey;
          const [value] = useRouterState({ key: derivedKey satisfies string });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('derivedKey satisfies string')],
        output: null,
      },

      // 87. A non-null assertion is the spelling a human reaches for when the
      // source is optionally typed, and it hides the source no better.
      {
        name: 'a non-null asserted identifier reports',
        code: `
        function Component({ config }) {
          const derivedKey = config.queryKey;
          const [value] = useRouterState({ key: derivedKey! });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('derivedKey!')],
        output: null,
      },

      // 88. Wrappers nest, so resolving through one is not enough: the chain
      // sits under the assertion here.
      {
        name: 'an asserted optional member reports through both wrappers',
        code: `
        function Component({ config }) {
          const [value] = useRouterState({ key: (config?.queryKey) as string });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('(config?.queryKey) as string')],
        output: null,
      },

      // 89. The chain resolves INTO the namespace branch, not past it, when
      // the member is passed directly: an alias of queryKeys.ts licenses its
      // `QUERY_KEY_*` exports, not every property of it. This is invalid case
      // 82 with the variable removed.
      {
        name: 'an optional namespace member that is no constant reports directly',
        code: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QueryKeys?.matchKey });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('QueryKeys?.matchKey')],
        output: null,
      },

      // 90. A literal is a literal through an assertion, so it draws the
      // literal report — and the fix stops, because `as const` applies to
      // literals alone and `QUERY_KEY_USER_PROFILE as const` would not
      // compile.
      {
        name: 'an asserted string literal reports without a fix',
        code: `
        function Component() {
          const [value] = useRouterState({ key: 'user-profile' as const });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile' as const")],
        output: null,
      },

      // 91. The template spelling of the same key reaches the same verdict,
      // which keeps the two notations of one value from diverging (#1804).
      {
        name: 'an asserted static template reports without a fix',
        code: `
        function Component() {
          const [value] = useRouterState({ key: \`user-profile\` as const });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError('`user-profile` as const')],
        output: null,
      },

      // 92. Both directions in one file. The wrapped literal reports and is
      // left untouched, while the plain literal beside it still fixes and
      // still carries the import — so the withheld fix is withheld from the
      // wrapper alone, not from the file.
      {
        name: 'a wrapped literal reports while the plain literal beside it fixes',
        code: `
        function Component() {
          const [asserted] = useRouterState({ key: 'stream-view' as const });
          const [stream] = useRouterState({ key: 'stream-view' });
          return <div>{asserted}{stream}</div>;
        }
        `,
        errors: [
          stringLiteralError("'stream-view' as const"),
          stringLiteralError("'stream-view'"),
        ],
        output: `import { QUERY_KEY_STREAM_VIEW } from 'src/util/routing/queryKeys';

        function Component() {
          const [asserted] = useRouterState({ key: 'stream-view' as const });
          const [stream] = useRouterState({ key: QUERY_KEY_STREAM_VIEW });
          return <div>{asserted}{stream}</div>;
        }
        `,
      },
    ],
  },
);

// ------------------------------------------------------------------
// Issue #1836, the one wrapper JSX cannot spell: `<string>key` parses as an
// element wherever JSX is enabled, so the angle-bracket type assertion is
// reachable only from a non-JSX `.ts` file — which is where a hook's key
// plumbing often lives. Both cases below are the twins of ones above, so the
// spelling is their only difference.
// ------------------------------------------------------------------
ruleTesterTs.run('prefer-global-router-state-key', preferGlobalRouterStateKey, {
  valid: [
    {
      name: 'an angle-bracket asserted queryKeys constant is allowed',
      code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        export function useProfileKey() {
          return useRouterState({ key: <string>QUERY_KEY_USER_PROFILE });
        }
        `,
    },
  ],
  invalid: [
    {
      name: 'an angle-bracket asserted member reports',
      code: `
        export function useProfileKey(config) {
          return useRouterState({ key: <string>config.queryKey });
        }
        `,
      errors: [invalidSourceError('<string>config.queryKey')],
      output: null,
    },
  ],
});

// ------------------------------------------------------------------
// Issue #1648: a fix that writes a brand-new import must not displace the
// file's prologue. Each case is flush-left because a prologue's meaning
// depends on its position in the file. The final case is the control: an
// anchor disabled outright would also "preserve" every prologue above, so
// the import must still land at the top of an existing import block.
// ------------------------------------------------------------------
ruleTesterJsx.run(
  'prefer-global-router-state-key',
  preferGlobalRouterStateKey,
  {
    valid: [],
    invalid: [
      {
        name: "the injected import lands below a 'use client' directive",
        filename: '/repo/src/components/Widget.tsx',
        code: `'use client';
function Component() {
  const [value] = useRouterState({ key: 'user-profile' });
  return <div>{value}</div>;
}
`,
        errors: [stringLiteralError("'user-profile'")],
        output: `'use client';
import { QUERY_KEY_USER_PROFILE } from '../util/routing/queryKeys';
function Component() {
  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return <div>{value}</div>;
}
`,
      },
      {
        name: 'the injected import leaves a shebang at character 0',
        filename: '/repo/src/components/Widget.tsx',
        code: `#!/usr/bin/env node
function Component() {
  const [value] = useRouterState({ key: 'user-profile' });
  return <div>{value}</div>;
}
`,
        errors: [stringLiteralError("'user-profile'")],
        output: `#!/usr/bin/env node
import { QUERY_KEY_USER_PROFILE } from '../util/routing/queryKeys';
function Component() {
  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return <div>{value}</div>;
}
`,
      },
      {
        name: 'the injected import stays below a // @ts-nocheck header',
        filename: '/repo/src/components/Widget.tsx',
        code: `// @ts-nocheck
function Component() {
  const [value] = useRouterState({ key: 'user-profile' });
  return <div>{value}</div>;
}
`,
        errors: [stringLiteralError("'user-profile'")],
        output: `// @ts-nocheck
import { QUERY_KEY_USER_PROFILE } from '../util/routing/queryKeys';
function Component() {
  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return <div>{value}</div>;
}
`,
      },
      {
        name: "a 'use client' file with an existing import anchors on that import",
        filename: '/repo/src/components/Widget.tsx',
        code: `'use client';
import { x } from './x';
void x;
function Component() {
  const [value] = useRouterState({ key: 'user-profile' });
  return <div>{value}</div>;
}
`,
        errors: [stringLiteralError("'user-profile'")],
        output: `'use client';
import { QUERY_KEY_USER_PROFILE } from '../util/routing/queryKeys';
import { x } from './x';
void x;
function Component() {
  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return <div>{value}</div>;
}
`,
      },
    ],
  },
);

// ------------------------------------------------------------------
// Issue #1999: the mirror of enforce-querykey-ts's assignment-operator table.
//
// This rule already guards on `node.operator === '='`; its sibling did not,
// and the two resolve identifier keys through byte-identical
// `variableAssignments` maps. Neither rule's corpus held a single
// AssignmentExpression fixture, which is why the divergence stayed invisible
// (both keys sat on `noFixtureForShape` in visitor-key-liveness). Pinning the
// contract on the already-correct side is what stops the next fix to either
// rule from re-opening the gap on this one.
// ------------------------------------------------------------------
const LAUNDERING_OPERATORS = ['||=', '??=', '+='] as const;

const assignedKeyCode = (operator: string) =>
  `import { QUERY_KEY_PLAYBACK_ID } from 'src/util/routing/queryKeys';
function Component() {
  let key = 'playback-id';
  key ${operator} QUERY_KEY_PLAYBACK_ID;
  const [playbackId] = useRouterState({ key });
  return <div>{playbackId}</div>;
}
`;

ruleTesterJsx.run(
  'prefer-global-router-state-key',
  preferGlobalRouterStateKey,
  {
    valid: [
      {
        name: 'a plain `=` reassignment to an approved constant IS the key',
        filename: '/repo/src/components/Widget.tsx',
        code: assignedKeyCode('='),
      },
    ],
    invalid: LAUNDERING_OPERATORS.map((operator) => ({
      name: `\`${operator}\` leaves the unapproved key reachable, so it still reports`,
      filename: '/repo/src/components/Widget.tsx',
      code: assignedKeyCode(operator),
      errors: [{ messageId: 'invalidQueryKeySource' as const }],
      // Declined rather than rewritten: which branch runs is not knowable.
      output: null,
    })),
  },
);

// ------------------------------------------------------------------
// Issue #2001: the mirror of enforce-querykey-ts's undefined-held table.
//
// A `||=`/`??=` onto a variable that still holds `undefined` ALWAYS assigns —
// `undefined` is both falsy and nullish — so the operand provably IS the key.
// Both rules reported it, which #1999 did not cause: this rule has always
// reported here, and #1999 brought its sibling into agreement on the
// conditional cases before this one was settled.
//
// Pinning the table on both sides is what keeps the pair from drifting apart
// again on one side only (#1714, #1832/#1833, #1840/#1842, #1999). The
// crossrule-contradiction guard measures that directly: fixing one rule alone
// moved this pair's disagreement from 12 fixtures to 16.
// ------------------------------------------------------------------
const undefinedHeldKeyCode = (declaration: string, assignments: string) =>
  `import { QUERY_KEY_PLAYBACK_ID } from 'src/util/routing/queryKeys';
function Component() {
  ${declaration}
${assignments}
  const [playbackId] = useRouterState({ key });
  return <div>{playbackId}</div>;
}
`;

ruleTesterJsx.run(
  'prefer-global-router-state-key',
  preferGlobalRouterStateKey,
  {
    valid: [
      {
        name: '`let key;` then `||=` always assigns, so the constant IS the key',
        filename: '/repo/src/components/Widget.tsx',
        code: undefinedHeldKeyCode(
          'let key;',
          '  key ||= QUERY_KEY_PLAYBACK_ID;',
        ),
      },
      {
        name: '`let key;` then `??=` always assigns, so the constant IS the key',
        filename: '/repo/src/components/Widget.tsx',
        code: undefinedHeldKeyCode(
          'let key;',
          '  key ??= QUERY_KEY_PLAYBACK_ID;',
        ),
      },
      {
        name: 'an explicit `= undefined` initializer holds undefined just the same (`||=`)',
        filename: '/repo/src/components/Widget.tsx',
        code: undefinedHeldKeyCode(
          'let key = undefined;',
          '  key ||= QUERY_KEY_PLAYBACK_ID;',
        ),
      },
      {
        name: 'an explicit `= undefined` initializer holds undefined just the same (`??=`)',
        filename: '/repo/src/components/Widget.tsx',
        code: undefinedHeldKeyCode(
          'let key = undefined;',
          '  key ??= QUERY_KEY_PLAYBACK_ID;',
        ),
      },
    ],
    invalid: [
      {
        name: '`+=` onto undefined concatenates, yielding neither operand',
        filename: '/repo/src/components/Widget.tsx',
        code: undefinedHeldKeyCode(
          'let key;',
          '  key += QUERY_KEY_PLAYBACK_ID;',
        ),
        errors: [{ messageId: 'invalidQueryKeySource' as const }],
        output: null,
      },
      {
        name: 'a prior `=` puts the unapproved value back in play, so `||=` is conditional again',
        filename: '/repo/src/components/Widget.tsx',
        code: undefinedHeldKeyCode(
          'let key;',
          "  key = 'playback-id';\n  key ||= QUERY_KEY_PLAYBACK_ID;",
        ),
        errors: [{ messageId: 'invalidQueryKeySource' as const }],
        output: null,
      },
      {
        name: 'the operand is still validated: an unapproved literal reports',
        filename: '/repo/src/components/Widget.tsx',
        code: undefinedHeldKeyCode('let key;', "  key ||= 'playback-id';"),
        errors: [{ messageId: 'invalidQueryKeySource' as const }],
        output: null,
      },
    ],
  },
);
