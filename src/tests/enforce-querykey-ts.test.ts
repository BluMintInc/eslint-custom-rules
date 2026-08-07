import { Linter, Rule } from 'eslint';
import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceQueryKeyTs } from '../rules/enforce-querykey-ts';

/**
 * One static key in two spellings, and the single fixed state both must reach.
 *
 * A quoted key and an expression-free template are the same key written two
 * ways, and the rule reports them identically, so the fix it emits has to be
 * the same text. Pointing both cases at ONE `output` constant is what makes a
 * fix withheld from either spelling a failure rather than a difference a reader
 * could take for intent (#1803). The template spelling is derived from the
 * quoted one so that the quoting stays their only difference.
 */
const STATIC_KEY_QUOTED = `
        function Component() {
          const [stream] = useRouterState({ key: 'stream-view' });
          return <div>{stream}</div>;
        }
      `;

const STATIC_KEY_TEMPLATE = STATIC_KEY_QUOTED.replace(
  "'stream-view'",
  '`stream-view`',
);

const STATIC_KEY_FIXED = `import { QUERY_KEY_STREAM_VIEW } from 'src/util/routing/queryKeys';

        function Component() {
          const [stream] = useRouterState({ key: QUERY_KEY_STREAM_VIEW });
          return <div>{stream}</div>;
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
          const [profile] = useRouterState({ key: 'user\\u002dprofile' });
          return <div>{profile}</div>;
        }
      `;

const ESCAPED_KEY_TEMPLATE = ESCAPED_KEY_QUOTED.replace(
  "'user\\u002dprofile'",
  '`user\\u002dprofile`',
);

const ESCAPED_KEY_FIXED = `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Component() {
          const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{profile}</div>;
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

const SINGLE_CHARACTER_KEY_FIXED = `import { QUERY_KEY_A } from 'src/util/routing/queryKeys';
${keyCode('QUERY_KEY_A')}`;

/**
 * Keys that normalize to nothing: empty, or made only of the characters the
 * normalizer turns into separators and then strips. No constant name can be
 * derived from any of them, and the notation carrying one makes no difference
 * to that — which is why every reported spelling is listed rather than just the
 * quoted empty string the report cited (#1813).
 */
const DEGENERATE_KEY_SPELLINGS = [
  "''",
  "'-'",
  "'_'",
  "'---'",
  "':'",
  "'/'",
  "'.'",
  "'_-:/.'",
  "'   '",
];

/**
 * The rest of the degenerate surface, in template notation. This rule reports
 * an expression-free template only when it carries a significant static part,
 * so a template that normalizes to nothing is not a violation here at all —
 * the silence #1803 fenced when it widened the FIX to templates without
 * widening detection. They are carried in the same generated body as the
 * spellings above so the surface stays whole: between the two lists, no
 * spelling of a key that names no constant can produce `QUERY_KEY_`, and a
 * later detection change lands on an assertion rather than on silence.
 */
const SILENT_DEGENERATE_KEY_SPELLINGS = ['``', '`-`', '`_`'];

ruleTesterJsx.run('enforce-querykey-ts', enforceQueryKeyTs, {
  valid: [
    // 1. Basic valid cases - using imported QUERY_KEY constants
    {
      code: `
        import { QUERY_KEY_PLAYBACK_ID } from '@/util/routing/queryKeys';

        function Component() {
          const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
          return <div>{playbackId}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_NOTIFICATION, QUERY_KEY_CHANNEL } from 'src/util/routing/queryKeys';

        function Component() {
          const [notification] = useRouterState({ key: QUERY_KEY_NOTIFICATION });
          const [channel] = useRouterState({ key: QUERY_KEY_CHANNEL });
          return <div>{notification} {channel}</div>;
        }
      `,
    },

    // 2. Aliased imports
    {
      code: `
        import { QUERY_KEY_NOTIFICATION as NOTIFICATION_KEY } from '@/util/routing/queryKeys';

        function Component() {
          const [notification] = useRouterState({ key: NOTIFICATION_KEY });
          return <div>{notification}</div>;
        }
      `,
    },

    // 3. Conditional usage with valid constants
    {
      code: `
        import { QUERY_KEY_NOTIFICATION, QUERY_KEY_CHANNEL } from '@/util/routing/queryKeys';

        function Component({ isNotification }) {
          const keyToUse = isNotification ? QUERY_KEY_NOTIFICATION : QUERY_KEY_CHANNEL;
          const [queryValue] = useRouterState({ key: keyToUse });
          return <div>{queryValue}</div>;
        }
      `,
    },

    // 4. Template literals with query key variables
    {
      code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component({ userId }) {
          const key = \`\${QUERY_KEY_USER_PROFILE}-\${userId}\`;
          const [profile] = useRouterState({ key });
          return <div>{profile}</div>;
        }
      `,
    },

    // 5. Binary expressions with query keys
    {
      code: `
        import { QUERY_KEY_MATCH } from '@/util/routing/queryKeys';

        function Component({ matchId }) {
          const [match] = useRouterState({ key: QUERY_KEY_MATCH + '-' + matchId });
          return <div>{match}</div>;
        }
      `,
    },

    // 6. Function calls (permissive approach)
    {
      code: `
        import { QUERY_KEY_TOURNAMENT } from '@/util/routing/queryKeys';

        function generateKey(base, suffix) {
          return \`\${base}-\${suffix}\`;
        }

        function Component({ tournamentId }) {
          const [tournament] = useRouterState({
            key: generateKey(QUERY_KEY_TOURNAMENT, tournamentId)
          });
          return <div>{tournament}</div>;
        }
      `,
    },

    // 7. Relative imports
    {
      code: `
        import { QUERY_KEY_SESSION } from './util/routing/queryKeys';

        function Component() {
          const [session] = useRouterState({ key: QUERY_KEY_SESSION });
          return <div>{session}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_DIALOG } from '../util/routing/queryKeys';

        function Component() {
          const [dialog] = useRouterState({ key: QUERY_KEY_DIALOG });
          return <div>{dialog}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_MODAL } from '../../util/routing/queryKeys';

        function Component() {
          const [modal] = useRouterState({ key: QUERY_KEY_MODAL });
          return <div>{modal}</div>;
        }
      `,
    },

    // 8. Multiple imports in single statement
    {
      code: `
        import {
          QUERY_KEY_NOTIFICATION,
          QUERY_KEY_CHANNEL,
          QUERY_KEY_PLAYBACK_ID
        } from '@/util/routing/queryKeys';

        function Component() {
          const [notification] = useRouterState({ key: QUERY_KEY_NOTIFICATION });
          const [channel] = useRouterState({ key: QUERY_KEY_CHANNEL });
          const [playback] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
          return <div>{notification} {channel} {playback}</div>;
        }
      `,
    },

    // 9. Variables derived from query key constants
    {
      code: `
        import { QUERY_KEY_USER } from '@/util/routing/queryKeys';

        function Component() {
          const userKey = QUERY_KEY_USER;
          const [user] = useRouterState({ key: userKey });
          return <div>{user}</div>;
        }
      `,
    },

    // 10. Conditional expressions with valid constants
    {
      code: `
        import { QUERY_KEY_ADMIN, QUERY_KEY_USER } from '@/util/routing/queryKeys';

        function Component({ isAdmin }) {
          const [data] = useRouterState({
            key: isAdmin ? QUERY_KEY_ADMIN : QUERY_KEY_USER
          });
          return <div>{data}</div>;
        }
      `,
    },

    // 11. Template literals with only separators
    {
      code: `
        import { QUERY_KEY_SECTION } from '@/util/routing/queryKeys';

        function Component({ id }) {
          const [section] = useRouterState({ key: \`\${QUERY_KEY_SECTION}-\${id}\` });
          return <div>{section}</div>;
        }
      `,
    },

    // 12. Complex nested usage
    {
      code: `
        import { QUERY_KEY_WORKSPACE, QUERY_KEY_PROJECT } from '@/util/routing/queryKeys';

        function Component({ workspaceId, projectId, isWorkspace }) {
          const baseKey = isWorkspace ? QUERY_KEY_WORKSPACE : QUERY_KEY_PROJECT;
          const id = isWorkspace ? workspaceId : projectId;
          const [data] = useRouterState({ key: \`\${baseKey}-\${id}\` });
          return <div>{data}</div>;
        }
      `,
    },

    // 13. Member expression access (for namespaced constants)
    {
      code: `
        import { QueryKeys } from '@/util/routing/queryKeys';

        function Component() {
          const [data] = useRouterState({ key: QueryKeys.MATCH });
          return <div>{data}</div>;
        }
      `,
    },

    // 14. Different relative path depths
    {
      code: `
        import { QUERY_KEY_SETTINGS } from '../../../util/routing/queryKeys';

        function Component() {
          const [settings] = useRouterState({ key: QUERY_KEY_SETTINGS });
          return <div>{settings}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_PREFERENCES } from '../../../../util/routing/queryKeys';

        function Component() {
          const [preferences] = useRouterState({ key: QUERY_KEY_PREFERENCES });
          return <div>{preferences}</div>;
        }
      `,
    },

    // 15. Edge case: no key property (should not trigger rule)
    {
      code: `
        function Component() {
          const [value] = useRouterState({ location: 'queryParam' });
          return <div>{value}</div>;
        }
      `,
    },

    // 16. Edge case: empty useRouterState call
    {
      code: `
        function Component() {
          const [value] = useRouterState();
          return <div>{value}</div>;
        }
      `,
    },

    // 17. Edge case: non-object argument
    {
      code: `
        import { QUERY_KEY_DATA } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState(QUERY_KEY_DATA);
          return <div>{value}</div>;
        }
      `,
    },

    // 18. Complex variable assignment chain
    {
      code: `
        import { QUERY_KEY_ANALYTICS } from '@/util/routing/queryKeys';

        function Component() {
          const baseKey = QUERY_KEY_ANALYTICS;
          const finalKey = baseKey;
          const [analytics] = useRouterState({ key: finalKey });
          return <div>{analytics}</div>;
        }
      `,
    },

    // 19. Function that returns query key
    {
      code: `
        import { QUERY_KEY_REPORT } from '@/util/routing/queryKeys';

        function getReportKey() {
          return QUERY_KEY_REPORT;
        }

        function Component() {
          const [report] = useRouterState({ key: getReportKey() });
          return <div>{report}</div>;
        }
      `,
    },

    // 20. Template literal with multiple query key expressions
    {
      code: `
        import { QUERY_KEY_TEAM, QUERY_KEY_MEMBER } from '@/util/routing/queryKeys';

        function Component({ teamId, memberId }) {
          const [data] = useRouterState({
            key: \`\${QUERY_KEY_TEAM}-\${teamId}-\${QUERY_KEY_MEMBER}-\${memberId}\`
          });
          return <div>{data}</div>;
        }
      `,
    },

    // 21. Regression #1393: a destructured callback parameter iterating a global
    // constant array cannot be replaced by a single QUERY_KEY_* constant.
    `
import { GROUP_IDS } from '../../util/routing/groupIds';
export const useGroupIdMap = () => {
  const routerStates = GROUP_IDS.map(({ key, location }) => {
    return useRouterState({ key, location });
  });
  return routerStates;
};
`,

    // 22. Regression #1393: a plain function parameter is chosen by the caller,
    // so the key it carries is not this file's to constrain.
    {
      code: `
        function useKey(key) {
          return useRouterState({ key });
        }
      `,
    },

    // 23. Regression #1393: a destructured parameter renamed on the way in is
    // still a parameter binding.
    {
      code: `
        const useKey = ({ key: k }) => useRouterState({ key: k });
      `,
    },

    // 24. Regression #1393: a default value does not turn a parameter into a
    // fixed key, since any argument overrides it.
    {
      code: `
        import { QUERY_KEY_GROUP } from '@/util/routing/queryKeys';

        function useKey(key = QUERY_KEY_GROUP) {
          return useRouterState({ key });
        }
      `,
    },
    {
      code: `
        function useKey({ key = 'group-id' }) {
          return useRouterState({ key });
        }
      `,
    },

    // 25. Regression #1393: an annotated parameter resolves the same way, since
    // the binding — not the type — decides.
    {
      code: `
        export const useKey = (key: string) => {
          const [value] = useRouterState({ key });
          return value;
        };
      `,
    },

    // 26. Regression #1393: a rest parameter destructured positionally is a
    // parameter binding too.
    {
      code: `
        function useKey(...[key]) {
          return useRouterState({ key });
        }
      `,
    },

    // 27. Regression #1393: a nested callback reaches the parameter of an outer
    // function, so scope resolution has to climb to find it.
    {
      code: `
        export const useKeyGrid = (keys) => {
          return keys.map((key) => {
            return [1, 2].map(() => useRouterState({ key }));
          });
        };
      `,
    },

    // 28. Regression #1393: the nearest binding decides — an outer literal
    // constant of the same name is shadowed by the callback parameter.
    {
      code: `
        const key = 'group-id';

        export const useKeys = (keys) => keys.map((key) => useRouterState({ key }));
      `,
    },

    // 29. Regression #1410: every violation disabled inline leaves the file
    // untouched — no import may be emitted for keys nobody rewrites.
    {
      code: `
        function Component() {
          // eslint-disable-next-line enforce-querykey-ts
          const [match] = useRouterState({ key: 'match-view' });
          // eslint-disable-next-line enforce-querykey-ts
          const [tournament] = useRouterState({ key: 'tournament-view' });
          return <div>{match}{tournament}</div>;
        }
      `,
    },

    // 30. Regression #1410: a block disable naming this rule covers the file.
    {
      code: `
        /* eslint-disable enforce-querykey-ts */
        function Component() {
          const [match] = useRouterState({ key: 'match-view' });
          const [tournament] = useRouterState({ key: 'tournament-view' });
          return <div>{match}{tournament}</div>;
        }
      `,
    },

    // 31. Regression #1410: a bare block disable suppresses every rule.
    {
      code: `
        /* eslint-disable */
        function Component() {
          const [match] = useRouterState({ key: 'match-view' });
          return <div>{match}</div>;
        }
      `,
    },

    // 32. Regression #1410: a bare line disable suppresses this rule too.
    {
      code: `
        function Component() {
          // eslint-disable-next-line
          const [match] = useRouterState({ key: 'match-view' });
          return <div>{match}</div>;
        }
      `,
    },

    // ------------------------------------------------------------------
    // Regression #1714: this rule and prefer-global-router-state-key police the
    // same call, so a shape one of them blesses must not be the other's
    // violation. The two cases below are the sibling's own documented positions:
    // its "What the rule allows" example (docs/rules/prefer-global-router-state-key.md)
    // and the approved re-export its message advertises.
    // ------------------------------------------------------------------

    // 33. The sibling's documented factory example, verbatim.
    {
      name: "the sibling's documented buildQueryKey example stays allowed",
      code: `
        const derivedKey = buildQueryKey('match-session');
        const [value] = useRouterState({ key: derivedKey });
      `,
    },

    // 34. The constants barrel is an approved re-export of queryKeys.ts, which
    // the sibling accepts (prefer-global-router-state-key.ts:139-143).
    {
      name: 'a QUERY_KEY_* constant from the constants barrel is allowed',
      code: `
        import { QUERY_KEY_ATTEMPT } from 'src/constants';

        function Component() {
          const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
          return <div>{attempt}</div>;
        }
      `,
    },

    // 35. #1714: a call handed straight to the key is opaque too, whatever the
    // factory is named.
    {
      name: 'a call passed directly as the key is allowed',
      code: `
        function Component() {
          const [value] = useRouterState({ key: buildQueryKey('match-session') });
          return <div>{value}</div>;
        }
      `,
    },

    // 36. #1714: the factory reached through an object is still a call.
    {
      name: 'a member-expression factory is allowed',
      code: `
        import { queryKeyUtils } from './queryKeyUtils';

        function Component() {
          const [value] = useRouterState({ key: queryKeyUtils.buildQueryKey('match') });
          return <div>{value}</div>;
        }
      `,
    },

    // 37. #1714: an argument list says nothing about the return value, so a
    // zero-argument call is opaque like any other.
    {
      name: 'a call with no arguments is allowed',
      code: `
        function Component() {
          const derivedKey = resolveKey();
          const [value] = useRouterState({ key: derivedKey });
          return <div>{value}</div>;
        }
      `,
    },

    // 38. #1714: an awaited call reaches the key as an await expression, which
    // exposes no static string either.
    {
      name: 'an awaited call is allowed',
      code: `
        async function useLoadedKey() {
          const [value] = useRouterState({ key: await buildQueryKey('match') });
          return value;
        }
      `,
    },

    // 39. #1714: the carve-out survives an assignment chain, since each link
    // resolves to the call at its end.
    {
      name: 'a call reached through an assignment chain is allowed',
      code: `
        function Component() {
          const baseKey = buildQueryKey('match');
          const derivedKey = baseKey;
          const [value] = useRouterState({ key: derivedKey });
          return <div>{value}</div>;
        }
      `,
    },

    // 40. #1714: a call interpolated into a separator-only template carries the
    // whole key.
    {
      name: 'a call inside a separator-only template literal is allowed',
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: \`\${buildQueryKey('match')}-\${id}\` });
          return <div>{value}</div>;
        }
      `,
    },

    // 41. #1714: both branches of a ternary may be calls.
    {
      name: 'a ternary between two calls is allowed',
      code: `
        function Component({ isAdmin }) {
          const [value] = useRouterState({
            key: isAdmin ? buildAdminKey() : buildUserKey()
          });
          return <div>{value}</div>;
        }
      `,
    },

    // 42. #1714: every spelling of the constants barrel's root names the same
    // approved re-export, which is what the sibling recognizes.
    {
      name: 'the bare constants specifier is allowed',
      code: `
        import { QUERY_KEY_ATTEMPT } from 'constants';

        function Component() {
          const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
          return <div>{attempt}</div>;
        }
      `,
    },
    {
      name: 'the constants barrel named by its index file is allowed',
      code: `
        import { QUERY_KEY_ATTEMPT } from 'constants/index';

        function Component() {
          const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
          return <div>{attempt}</div>;
        }
      `,
    },
    {
      name: 'src/constants/index is allowed',
      code: `
        import { QUERY_KEY_ATTEMPT } from 'src/constants/index';

        function Component() {
          const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
          return <div>{attempt}</div>;
        }
      `,
    },
    {
      name: 'the aliased constants specifier is allowed',
      code: `
        import { QUERY_KEY_ATTEMPT } from '@/constants';

        function Component() {
          const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
          return <div>{attempt}</div>;
        }
      `,
    },
    {
      name: 'a relative path to the constants barrel is allowed',
      code: `
        import { QUERY_KEY_ATTEMPT } from './constants';

        function Component() {
          const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
          return <div>{attempt}</div>;
        }
      `,
    },
    {
      name: 'a deeper relative path to the constants barrel is allowed',
      code: `
        import { QUERY_KEY_ATTEMPT } from '../../constants';

        function Component() {
          const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
          return <div>{attempt}</div>;
        }
      `,
    },

    // 43. #1714: an alias of a re-exported constant is the same binding under
    // another name.
    {
      name: 'an aliased constant from the constants barrel is allowed',
      code: `
        import { QUERY_KEY_ATTEMPT as ATTEMPT_KEY } from 'src/constants';

        function Component() {
          const [attempt] = useRouterState({ key: ATTEMPT_KEY });
          return <div>{attempt}</div>;
        }
      `,
    },

    // 44. #1714: the module's own root-relative spelling, which the sibling
    // accepts as well.
    {
      name: 'the root-relative queryKeys specifier is allowed',
      code: `
        import { QUERY_KEY_ATTEMPT } from 'util/routing/queryKeys';

        function Component() {
          const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
          return <div>{attempt}</div>;
        }
      `,
    },

    // 45. #1714: a variable derived from a re-exported constant rides on it.
    {
      name: 'a variable derived from a re-exported constant is allowed',
      code: `
        import { QUERY_KEY_ATTEMPT } from 'src/constants';

        function Component() {
          const attemptKey = QUERY_KEY_ATTEMPT;
          const [attempt] = useRouterState({ key: attemptKey });
          return <div>{attempt}</div>;
        }
      `,
    },

    // 46-47. #1803: widening the FIX to expression-free templates must not
    // widen detection. A template that names no key is still not a violation,
    // so the silence these fence is the floor the widening had to preserve.
    {
      name: 'an empty template key stays silent',
      code: `
        function Component() {
          const [value] = useRouterState({ key: \`\` });
          return <div>{value}</div>;
        }
      `,
    },
    {
      name: 'a separator-only template key stays silent',
      code: `
        function Component() {
          const [value] = useRouterState({ key: \`-\` });
          return <div>{value}</div>;
        }
      `,
    },

    // 48-50. #1813: the template half of the degenerate surface, generated from
    // the same body as the reported half so the two cannot drift apart.
    ...SILENT_DEGENERATE_KEY_SPELLINGS.map((spelling) => ({
      name: `a degenerate template key spelled ${spelling} stays silent`,
      code: keyCode(spelling),
    })),

    // ------------------------------------------------------------------
    // Issue #1832: `a?.b()` parses as a ChainExpression wrapping the call, so
    // the optional spelling of a key source the rule accepts reached a type
    // switch that does not name that wrapper and was reported. Optionality is
    // orthogonal to the question the rule asks — where the key comes from —
    // and each case below is the optional twin of a case already fenced above,
    // so a spelling that reports here is one the plain spelling is allowed.
    // The invalid mirrors that keep this from becoming a blanket escape hatch
    // are cases 81-85.
    // ------------------------------------------------------------------

    // 51. Twin of case 33: the sibling's documented factory, called optionally.
    {
      name: 'an optional call to a key factory is allowed',
      code: `
        const derivedKey = buildQueryKey?.('match-session');
        const [value] = useRouterState({ key: derivedKey });
      `,
    },

    // 52. The ordinary spelling of the same defect: an optional receiver, which
    // is what a human writes when the object may be absent.
    {
      name: 'a method called through an optional receiver is allowed',
      code: `
        function Component({ config }) {
          const derivedKey = config?.getQueryKey();
          const [value] = useRouterState({ key: derivedKey });
          return <div>{value}</div>;
        }
      `,
    },

    // 53. Twin of case 40: the call carve-out reaches into a separator-only
    // template through the chain as well.
    {
      name: 'an optional call inside a separator-only template is allowed',
      code: `
        function Component({ session, id }) {
          const [value] = useRouterState({ key: \`\${session?.getKey()}-\${id}\` });
          return <div>{value}</div>;
        }
      `,
    },

    // 54. Twin of case 39: each link of an assignment chain resolves to the
    // optional call at its end.
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

    // 55. Twin of case 5: a concatenation is judged by its operands, and an
    // optional call is still the operand that carries the key.
    {
      name: 'a concatenation around an optional call is allowed',
      code: `
        function Component({ config, id }) {
          const [value] = useRouterState({ key: config?.getKey() + '-' + id });
          return <div>{value}</div>;
        }
      `,
    },

    // 56. Not the call carve-out but the member one: the chain has to resolve
    // to the node underneath rather than be waved through, so a namespace
    // member of queryKeys stays allowed for the reason it always was.
    {
      name: 'an optional member of a queryKeys namespace import is allowed',
      code: `
        import * as queryKeys from 'src/util/routing/queryKeys';

        function Component() {
          const matchKey = queryKeys?.QUERY_KEY_MATCH;
          const [value] = useRouterState({ key: matchKey });
          return <div>{value}</div>;
        }
      `,
    },
  ],

  invalid: [
    // 1. Basic invalid cases - string literals
    {
      code: `
        function Component() {
          const [playbackId] = useRouterState({ key: 'playback-id' });
          return <div>{playbackId}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_PLAYBACK_ID } from 'src/util/routing/queryKeys';

        function Component() {
          const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
          return <div>{playbackId}</div>;
        }
      `,
    },

    // 2. String literal with other properties
    {
      code: `
        function Component() {
          const [value] = useRouterState({
            key: 'tournament-details',
            location: 'queryParam'
          });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_TOURNAMENT_DETAILS } from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({
            key: QUERY_KEY_TOURNAMENT_DETAILS,
            location: 'queryParam'
          });
          return <div>{value}</div>;
        }
      `,
    },

    // 3. Multiple string literals in different components
    {
      code: `
        function MatchComponent() {
          const [value] = useRouterState({ key: 'match-view' });
          return <div>{value}</div>;
        }

        function TournamentComponent() {
          const [value] = useRouterState({ key: 'tournament-view' });
          return <div>{value}</div>;
        }
      `,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      // One import collects both substituted constants in a single pass.
      output: `import { QUERY_KEY_MATCH_VIEW, QUERY_KEY_TOURNAMENT_VIEW } from 'src/util/routing/queryKeys';

        function MatchComponent() {
          const [value] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
          return <div>{value}</div>;
        }

        function TournamentComponent() {
          const [value] = useRouterState({ key: QUERY_KEY_TOURNAMENT_VIEW });
          return <div>{value}</div>;
        }
      `,
    },

    // 4. String literals in custom hook
    {
      code: `
        function useCustomRouterState(id) {
          const [matchValue] = useRouterState({ key: 'match-details' });
          const [tournamentValue] = useRouterState({ key: 'tournament-details' });
          return { match: matchValue, tournament: tournamentValue };
        }
      `,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      output: `import { QUERY_KEY_MATCH_DETAILS, QUERY_KEY_TOURNAMENT_DETAILS } from 'src/util/routing/queryKeys';

        function useCustomRouterState(id) {
          const [matchValue] = useRouterState({ key: QUERY_KEY_MATCH_DETAILS });
          const [tournamentValue] = useRouterState({ key: QUERY_KEY_TOURNAMENT_DETAILS });
          return { match: matchValue, tournament: tournamentValue };
        }
      `,
    },

    // 5. String concatenation with literals
    {
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: 'user-profile-' + id });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 6. Conditional expressions with string literals
    {
      code: `
        function Component({ isAdmin }) {
          const [value] = useRouterState({
            key: isAdmin ? 'admin-dashboard' : 'user-dashboard'
          });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 7. Template literal with static content
    {
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: \`user-profile-\${id}\` });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 8. Variable not from queryKeys.ts
    {
      code: `
        const MY_KEY = 'custom-key';

        function Component() {
          const [value] = useRouterState({ key: MY_KEY });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'MY_KEY' },
        },
      ],
    },

    // 9. Import from wrong source
    {
      code: `
        import { QUERY_KEY_WRONG } from './wrong/path';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_WRONG });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'QUERY_KEY_WRONG' },
        },
      ],
    },

    // 10. Constant not following QUERY_KEY_ pattern
    {
      code: `
        import { WRONG_PATTERN } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: WRONG_PATTERN });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'WRONG_PATTERN' },
        },
      ],
    },

    // 11. Mixed valid and invalid usage
    {
      code: `
        import { QUERY_KEY_VALID } from '@/util/routing/queryKeys';

        function Component() {
          const [valid] = useRouterState({ key: QUERY_KEY_VALID });
          const [invalid] = useRouterState({ key: 'invalid-literal' });
          return <div>{valid} {invalid}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      // The existing queryKeys import is extended rather than duplicated.
      output: `
        import { QUERY_KEY_VALID, QUERY_KEY_INVALID_LITERAL } from '@/util/routing/queryKeys';

        function Component() {
          const [valid] = useRouterState({ key: QUERY_KEY_VALID });
          const [invalid] = useRouterState({ key: QUERY_KEY_INVALID_LITERAL });
          return <div>{valid} {invalid}</div>;
        }
      `,
    },

    // 12. Complex string literal patterns
    {
      code: `
        function Component() {
          const [value1] = useRouterState({ key: 'section.subsection' });
          const [value2] = useRouterState({ key: 'user:profile:settings' });
          const [value3] = useRouterState({ key: 'app/module/component' });
          return <div>{value1} {value2} {value3}</div>;
        }
      `,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      output: `import { QUERY_KEY_SECTION_SUBSECTION, QUERY_KEY_USER_PROFILE_SETTINGS, QUERY_KEY_APP_MODULE_COMPONENT } from 'src/util/routing/queryKeys';

        function Component() {
          const [value1] = useRouterState({ key: QUERY_KEY_SECTION_SUBSECTION });
          const [value2] = useRouterState({ key: QUERY_KEY_USER_PROFILE_SETTINGS });
          const [value3] = useRouterState({ key: QUERY_KEY_APP_MODULE_COMPONENT });
          return <div>{value1} {value2} {value3}</div>;
        }
      `,
    },

    // 13. Nested component with string literal
    {
      code: `
        function ParentComponent() {
          return <ChildComponent />;
        }

        function ChildComponent() {
          const [value] = useRouterState({ key: 'child-component' });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_CHILD_COMPONENT } from 'src/util/routing/queryKeys';

        function ParentComponent() {
          return <ChildComponent />;
        }

        function ChildComponent() {
          const [value] = useRouterState({ key: QUERY_KEY_CHILD_COMPONENT });
          return <div>{value}</div>;
        }
      `,
    },

    // 14. Array mapping with string literals
    {
      code: `
        function MultiComponent({ sections }) {
          return (
            <div>
              {sections.map(section => {
                const [value] = useRouterState({ key: 'section-' + section.id });
                return <div key={section.id}>{value}</div>;
              })}
            </div>
          );
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 15. Variable assignment from string literal
    {
      code: `
        function Component() {
          const keyName = 'user-settings';
          const [value] = useRouterState({ key: keyName });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'keyName' },
        },
      ],
    },

    // 16. Template literal with significant static content
    {
      code: `
        function Component({ userId }) {
          const [value] = useRouterState({ key: \`user-profile-details-\${userId}\` });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 17. Binary expression with string literal
    {
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: 'prefix-' + id + '-suffix' });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 18. Conditional with mixed valid/invalid
    {
      code: `
        import { QUERY_KEY_ADMIN } from '@/util/routing/queryKeys';

        function Component({ isAdmin }) {
          const [value] = useRouterState({
            key: isAdmin ? QUERY_KEY_ADMIN : 'user-dashboard'
          });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 19. Special characters in string literals
    {
      code: `
        function Component() {
          const [value1] = useRouterState({ key: 'user@profile' });
          const [value2] = useRouterState({ key: 'section#details' });
          const [value3] = useRouterState({ key: 'app$module' });
          return <div>{value1} {value2} {value3}</div>;
        }
      `,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      output: `import { QUERY_KEY_USER_PROFILE, QUERY_KEY_SECTION_DETAILS, QUERY_KEY_APP_MODULE } from 'src/util/routing/queryKeys';

        function Component() {
          const [value1] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [value2] = useRouterState({ key: QUERY_KEY_SECTION_DETAILS });
          const [value3] = useRouterState({ key: QUERY_KEY_APP_MODULE });
          return <div>{value1} {value2} {value3}</div>;
        }
      `,
    },

    // 20. Empty string literal. The report stands, but the fix does not: the
    // constant this used to substitute was the bare `QUERY_KEY_`, a name
    // `queryKeys.ts` cannot export, so the assertion here was the bug (#1813).
    {
      code: `
        function Component() {
          const [value] = useRouterState({ key: '' });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: null,
    },

    // 21. Regression #1365: the substituted constant must come with its import,
    // otherwise --fix leaves the file referencing an undefined identifier.
    {
      code: `function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return playbackId;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_PLAYBACK_ID } from 'src/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return playbackId;
}`,
    },

    // 22. Regression #1365: the new import joins the existing import block
    // instead of landing below the code it is needed by.
    {
      code: `import { useState } from 'react';

function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return [playbackId, useState];
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_PLAYBACK_ID } from 'src/util/routing/queryKeys';
import { useState } from 'react';

function Component() {
  const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return [playbackId, useState];
}`,
    },

    // 23. Regression #1365: an existing queryKeys import is extended, and its
    // own path is reused rather than the canonical alias.
    {
      code: `import { QUERY_KEY_VALID } from '../util/routing/queryKeys';

function Component() {
  const [valid] = useRouterState({ key: QUERY_KEY_VALID });
  const [other] = useRouterState({ key: 'other-key' });
  return [valid, other];
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_VALID, QUERY_KEY_OTHER_KEY } from '../util/routing/queryKeys';

function Component() {
  const [valid] = useRouterState({ key: QUERY_KEY_VALID });
  const [other] = useRouterState({ key: QUERY_KEY_OTHER_KEY });
  return [valid, other];
}`,
    },

    // 24. Regression #1365: the constant is already imported, so only the
    // literal changes — the import must not gain a duplicate specifier.
    {
      code: `import { QUERY_KEY_PLAYBACK_ID } from '@/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return playbackId;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_PLAYBACK_ID } from '@/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return playbackId;
}`,
    },

    // 25. Regression #1365: the export is already imported under an alias, so
    // the substitution reuses that binding instead of importing it twice.
    {
      code: `import { QUERY_KEY_PLAYBACK_ID as PLAYBACK_KEY } from '@/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return playbackId;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_PLAYBACK_ID as PLAYBACK_KEY } from '@/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: PLAYBACK_KEY });
  return playbackId;
}`,
    },

    // 26. Regression #1365: another module already owns that name, so the fix
    // is declined rather than silently repointing the key.
    {
      code: `import { QUERY_KEY_PLAYBACK_ID } from './legacy/keys';

function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return playbackId;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: null,
    },

    // 27. Regression #1365: a local binding of that name would shadow the
    // import, so the fix is declined.
    {
      code: `const QUERY_KEY_PLAYBACK_ID = 'playback-id';

function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return playbackId;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: null,
    },

    // 28. Regression #1365: the name is bound to a non-QUERY_KEY export of
    // queryKeys.ts, which the rule would reject after substituting.
    {
      code: `import { legacyKey as QUERY_KEY_PLAYBACK_ID } from '@/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return playbackId;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: null,
    },

    // 29. Regression #1365: two violations converge on ONE import carrying both
    // specifiers. RuleTester applies a single pass, so this also proves the two
    // fixes do not overlap and get dropped.
    {
      code: `function A() {
  const [a] = useRouterState({ key: 'match-view' });
  return a;
}

function B() {
  const [b] = useRouterState({ key: 'tournament-view' });
  return b;
}`,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      output: `import { QUERY_KEY_MATCH_VIEW, QUERY_KEY_TOURNAMENT_VIEW } from 'src/util/routing/queryKeys';

function A() {
  const [a] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
  return a;
}

function B() {
  const [b] = useRouterState({ key: QUERY_KEY_TOURNAMENT_VIEW });
  return b;
}`,
    },

    // 30. Regression #1365: the same literal twice needs the constant imported
    // once, not once per violation.
    {
      code: `function A() {
  const [a] = useRouterState({ key: 'match-view' });
  return a;
}

function B() {
  const [b] = useRouterState({ key: 'match-view' });
  return b;
}`,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      output: `import { QUERY_KEY_MATCH_VIEW } from 'src/util/routing/queryKeys';

function A() {
  const [a] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
  return a;
}

function B() {
  const [b] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
  return b;
}`,
    },

    // 31. Regression #1365: a declined violation must not swallow the import
    // needed by the ones that are still fixed.
    {
      code: `const QUERY_KEY_MATCH_VIEW = 'match-view';

function A() {
  const [a] = useRouterState({ key: 'match-view' });
  return a;
}

function B() {
  const [b] = useRouterState({ key: 'tournament-view' });
  return b;
}`,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      output: `import { QUERY_KEY_TOURNAMENT_VIEW } from 'src/util/routing/queryKeys';

const QUERY_KEY_MATCH_VIEW = 'match-view';

function A() {
  const [a] = useRouterState({ key: 'match-view' });
  return a;
}

function B() {
  const [b] = useRouterState({ key: QUERY_KEY_TOURNAMENT_VIEW });
  return b;
}`,
    },

    // 32. Regression #1365: a namespace import cannot take named specifiers, so
    // a value import is added alongside it using that same path.
    {
      code: `import * as QueryKeys from '@/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return [playbackId, QueryKeys];
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_PLAYBACK_ID } from '@/util/routing/queryKeys';
import * as QueryKeys from '@/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return [playbackId, QueryKeys];
}`,
    },

    // 33. Regression #1365: a type-only import cannot carry a value binding, so
    // a separate value import is added — reusing the path it proves works.
    {
      code: `import type { QueryKey } from 'src/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return playbackId;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_PLAYBACK_ID } from 'src/util/routing/queryKeys';
import type { QueryKey } from 'src/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return playbackId;
}`,
    },

    // 34. Regression #1365: an unfixable violation (no literal to substitute)
    // reported before a fixable one must not become the import carrier.
    {
      code: `function Component({ id }) {
  const [a] = useRouterState({ key: 'prefix-' + id });
  const [b] = useRouterState({ key: 'playback-id' });
  return [a, b];
}`,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      output: `import { QUERY_KEY_PLAYBACK_ID } from 'src/util/routing/queryKeys';

function Component({ id }) {
  const [a] = useRouterState({ key: 'prefix-' + id });
  const [b] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return [a, b];
}`,
    },

    // 35. Regression #1391: two directories below src/ reaches queryKeys with
    // two '../', never the '@/' alias that resolves nowhere.
    {
      filename: 'src/components/tournament/TeamCard.tsx',
      code: `function TeamCard() {
  const [value] = useRouterState({ key: 'user-profile' });
  return <div>{value}</div>;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_USER_PROFILE } from '../../util/routing/queryKeys';

function TeamCard() {
  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return <div>{value}</div>;
}`,
    },

    // 36. Regression #1391: a deeper file gets more '../', proving the count
    // follows the file's real depth rather than a fixed guess.
    {
      filename: 'src/components/a/b/c/Bar.tsx',
      code: `function Bar() {
  const [value] = useRouterState({ key: 'user-profile' });
  return <div>{value}</div>;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_USER_PROFILE } from '../../../../util/routing/queryKeys';

function Bar() {
  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return <div>{value}</div>;
}`,
    },

    // 37. Regression #1391: a file directly in src/ descends into the target
    // directory instead of climbing out of it.
    {
      filename: 'src/index.tsx',
      code: `function App() {
  const [value] = useRouterState({ key: 'user-profile' });
  return <div>{value}</div>;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_USER_PROFILE } from './util/routing/queryKeys';

function App() {
  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return <div>{value}</div>;
}`,
    },

    // 38. Regression #1391: a sibling of queryKeys.ts imports it by file name.
    {
      filename: 'src/util/routing/useProfileKey.ts',
      code: `export const useProfileKey = () => {
  return useRouterState({ key: 'user-profile' });
};`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_USER_PROFILE } from './queryKeys';

export const useProfileKey = () => {
  return useRouterState({ key: QUERY_KEY_USER_PROFILE });
};`,
    },

    // 39. Regression #1391: outside src/, the bare specifier that the tsconfig
    // paths and the Jest mapper resolve is the only correct form.
    {
      filename: 'pages/legacy/Widget.tsx',
      code: `function Widget() {
  const [value] = useRouterState({ key: 'user-profile' });
  return <div>{value}</div>;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

function Widget() {
  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return <div>{value}</div>;
}`,
    },

    // 40. Regression #1391: an absolute filename derives the same specifier as
    // its cwd-relative form.
    {
      filename: '/repo/src/components/tournament/TeamCard.tsx',
      code: `function TeamCard() {
  const [value] = useRouterState({ key: 'user-profile' });
  return <div>{value}</div>;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_USER_PROFILE } from '../../util/routing/queryKeys';

function TeamCard() {
  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return <div>{value}</div>;
}`,
    },

    // 41. Regression #1391: derivation applies only where nothing proves how
    // the file reaches the module — an existing '@/' import still wins, since a
    // consumer that declares that alias resolves it.
    {
      filename: 'src/components/tournament/TeamCard.tsx',
      code: `import { QUERY_KEY_VALID } from '@/util/routing/queryKeys';

function TeamCard() {
  const [valid] = useRouterState({ key: QUERY_KEY_VALID });
  const [other] = useRouterState({ key: 'user-profile' });
  return [valid, other];
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_VALID, QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

function TeamCard() {
  const [valid] = useRouterState({ key: QUERY_KEY_VALID });
  const [other] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return [valid, other];
}`,
    },

    // 42. Regression #1391: a file inside a directory named queryKeys leaves no
    // specifier to derive, so the fix is declined rather than written broken.
    {
      filename: 'src/util/routing/queryKeys/index.ts',
      code: `export const useProfileKey = () => {
  return useRouterState({ key: 'user-profile' });
};`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: null,
    },

    // 43. Regression #1391: the emitted relative form is recognized on a later
    // pass, so a sibling's './queryKeys' import is extended, not duplicated.
    {
      filename: 'src/util/routing/useProfileKey.ts',
      code: `import { QUERY_KEY_USER_PROFILE } from './queryKeys';

export const useProfileKey = () => {
  const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  const [settings] = useRouterState({ key: 'user-settings' });
  return [profile, settings];
};`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_USER_PROFILE, QUERY_KEY_USER_SETTINGS } from './queryKeys';

export const useProfileKey = () => {
  const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  const [settings] = useRouterState({ key: QUERY_KEY_USER_SETTINGS });
  return [profile, settings];
};`,
    },

    // 44. Regression #1393: exempting parameters must not exempt ordinary
    // variables — a module-scope literal binding names one key and a constant
    // can replace it.
    {
      code: `
        const key = 'group-id';

        export const useGroupId = () => {
          return useRouterState({ key });
        };
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'key' },
        },
      ],
    },

    // 45. Regression #1393: a local variable declared inside a function that
    // also takes parameters is still reportable; the binding decides, not the
    // enclosing signature.
    {
      code: `
        export const useGroupId = (location) => {
          const key = 'group-id';
          return useRouterState({ key, location });
        };
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'key' },
        },
      ],
    },

    // 46. Regression #1393: an inner local binding shadows an outer parameter of
    // the same name, so the nearest binding is what gets resolved.
    {
      code: `
        function useKey(key) {
          return [1].map(() => {
            const key = 'group-id';
            return useRouterState({ key });
          });
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'key' },
        },
      ],
    },

    // 47. Regression #1393: an identifier imported from a module other than
    // queryKeys.ts still has to be replaced.
    {
      code: `
        import { key } from '../../util/routing/groupIds';

        export const useGroupId = () => {
          return useRouterState({ key });
        };
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'key' },
        },
      ],
    },

    // 48. Regression #1393: a parameter inside a ternary alongside string
    // literals reports through the literal path, which the parameter exemption
    // must leave intact.
    {
      code: `
        function Component({ type }) {
          const [value] = useRouterState({
            key: type === 'admin' ? 'admin-profile' : 'user-profile'
          });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
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
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 49. Regression #1393: a string literal key stays fixable — the exemption
    // touches only bare identifiers.
    {
      code: `
        export const useGroupId = () => {
          return useRouterState({ key: 'group-id' });
        };
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_GROUP_ID } from 'src/util/routing/queryKeys';

        export const useGroupId = () => {
          return useRouterState({ key: QUERY_KEY_GROUP_ID });
        };
      `,
    },

    // ------------------------------------------------------------------
    // Regression #1410: the import rides on one violation's fix, so that
    // violation is the file's import carrier. ESLint collects fixes before it
    // applies inline disable directives, so a suppressed carrier used to take
    // the import down with it while the survivors still substituted their
    // constants. The carrier must fall to a surviving violation, and the
    // import must name only the constants the survivors actually use.
    // ------------------------------------------------------------------

    // 50. A disable on the FIRST violation still lands the import, naming only
    // the surviving constant.
    {
      name: 'disable on the first violation keeps the import minimal',
      code: `
        function MatchComponent() {
          // eslint-disable-next-line enforce-querykey-ts
          const [value] = useRouterState({ key: 'match-view' });
          return <div>{value}</div>;
        }

        function TournamentComponent() {
          const [other] = useRouterState({ key: 'tournament-view' });
          return <div>{other}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_TOURNAMENT_VIEW } from 'src/util/routing/queryKeys';

        function MatchComponent() {
          // eslint-disable-next-line enforce-querykey-ts
          const [value] = useRouterState({ key: 'match-view' });
          return <div>{value}</div>;
        }

        function TournamentComponent() {
          const [other] = useRouterState({ key: QUERY_KEY_TOURNAMENT_VIEW });
          return <div>{other}</div>;
        }
      `,
    },

    // 51. A disable on the MIDDLE violation drops only that constant.
    {
      name: 'disable on the middle violation drops only its constant',
      code: `
        function Component() {
          const [match] = useRouterState({ key: 'match-view' });
          // eslint-disable-next-line enforce-querykey-ts
          const [tournament] = useRouterState({ key: 'tournament-view' });
          const [team] = useRouterState({ key: 'team-view' });
          return <div>{match}{tournament}{team}</div>;
        }
      `,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      output: `import { QUERY_KEY_MATCH_VIEW, QUERY_KEY_TEAM_VIEW } from 'src/util/routing/queryKeys';

        function Component() {
          const [match] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
          // eslint-disable-next-line enforce-querykey-ts
          const [tournament] = useRouterState({ key: 'tournament-view' });
          const [team] = useRouterState({ key: QUERY_KEY_TEAM_VIEW });
          return <div>{match}{tournament}{team}</div>;
        }
      `,
    },

    // 52. A disable on the LAST violation leaves the carrier where it was.
    {
      name: 'disable on the last violation drops only its constant',
      code: `
        function Component() {
          const [match] = useRouterState({ key: 'match-view' });
          // eslint-disable-next-line enforce-querykey-ts
          const [tournament] = useRouterState({ key: 'tournament-view' });
          return <div>{match}{tournament}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_MATCH_VIEW } from 'src/util/routing/queryKeys';

        function Component() {
          const [match] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
          // eslint-disable-next-line enforce-querykey-ts
          const [tournament] = useRouterState({ key: 'tournament-view' });
          return <div>{match}{tournament}</div>;
        }
      `,
    },

    // 53. A disable naming a different rule suppresses nothing. (A core rule
    // stands in for the neighbour because `RuleTester` errors on a directive
    // naming a rule it cannot resolve; the near-miss name is covered by the
    // `Linter` suite below.)
    {
      name: 'a disable for another rule leaves both violations reportable',
      code: `
        function Component() {
          // eslint-disable-next-line no-console
          const [match] = useRouterState({ key: 'match-view' });
          const [tournament] = useRouterState({ key: 'tournament-view' });
          return <div>{match}{tournament}</div>;
        }
      `,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      output: `import { QUERY_KEY_MATCH_VIEW, QUERY_KEY_TOURNAMENT_VIEW } from 'src/util/routing/queryKeys';

        function Component() {
          // eslint-disable-next-line no-console
          const [match] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
          const [tournament] = useRouterState({ key: QUERY_KEY_TOURNAMENT_VIEW });
          return <div>{match}{tournament}</div>;
        }
      `,
    },

    // 54. An existing queryKeys import is extended with the surviving constant
    // alone — a suppressed key must not be added and left unused.
    {
      name: 'an existing queryKeys import gains only the surviving constant',
      code: `
        import { QUERY_KEY_VALID } from '@/util/routing/queryKeys';

        function Component() {
          const [valid] = useRouterState({ key: QUERY_KEY_VALID });
          // eslint-disable-next-line enforce-querykey-ts
          const [match] = useRouterState({ key: 'match-view' });
          const [tournament] = useRouterState({ key: 'tournament-view' });
          return <div>{valid}{match}{tournament}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `
        import { QUERY_KEY_VALID, QUERY_KEY_TOURNAMENT_VIEW } from '@/util/routing/queryKeys';

        function Component() {
          const [valid] = useRouterState({ key: QUERY_KEY_VALID });
          // eslint-disable-next-line enforce-querykey-ts
          const [match] = useRouterState({ key: 'match-view' });
          const [tournament] = useRouterState({ key: QUERY_KEY_TOURNAMENT_VIEW });
          return <div>{valid}{match}{tournament}</div>;
        }
      `,
    },

    // 55. A suppressed non-carrier must not rewrite its own key either: with
    // the first violation surviving, the second one's literal stays put.
    {
      name: 'a suppressed non-carrier keeps its literal',
      code: `
        function Component() {
          const [match] = useRouterState({ key: 'match-view' });
          // eslint-disable-next-line enforce-querykey-ts
          const [same] = useRouterState({ key: 'match-view' });
          return <div>{match}{same}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_MATCH_VIEW } from 'src/util/routing/queryKeys';

        function Component() {
          const [match] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
          // eslint-disable-next-line enforce-querykey-ts
          const [same] = useRouterState({ key: 'match-view' });
          return <div>{match}{same}</div>;
        }
      `,
    },

    // ------------------------------------------------------------------
    // Regression #1714: aligning this rule's carve-outs with
    // prefer-global-router-state-key widens what is accepted, so the boundary
    // of that widening is fenced here. A source that merely resembles the
    // approved re-export, a non-`QUERY_KEY_*` name taken from it, and a static
    // template around a call all stay reportable.
    // ------------------------------------------------------------------

    // 56. The barrel is approved, the naming convention still is not.
    {
      name: 'a non-QUERY_KEY name from the constants barrel still reports',
      code: `
        import { ATTEMPT_KEY } from 'src/constants';

        function Component() {
          const [attempt] = useRouterState({ key: ATTEMPT_KEY });
          return <div>{attempt}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'ATTEMPT_KEY' },
        },
      ],
    },

    // 57. A module beneath the barrel is not the barrel — the sibling's own
    // documented incorrect example.
    {
      name: 'a module below the constants barrel still reports',
      code: `
        import { USER_PROFILE_KEY } from 'src/constants/other';

        function Component() {
          const [value] = useRouterState({ key: USER_PROFILE_KEY });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'USER_PROFILE_KEY' },
        },
      ],
    },

    // 58. Matching is on the whole specifier, not a prefix of it.
    {
      name: 'a specifier that merely starts with constants still reports',
      code: `
        import { QUERY_KEY_ATTEMPT } from 'src/constantsy';

        function Component() {
          const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
          return <div>{attempt}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'QUERY_KEY_ATTEMPT' },
        },
      ],
    },

    // 59. The call carve-out covers the call, not the text wrapped around it:
    // a template with its own static content still names a key of its own.
    {
      name: 'static template content around a call still reports',
      code: `
        function Component() {
          const [value] = useRouterState({ key: \`user-profile-\${buildQueryKey('match')}\` });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 60. The barrel is proof of a path that resolves for this file, so a
    // substituted constant joins that import instead of opening a second one.
    {
      name: 'the fix extends an existing constants-barrel import',
      code: `import { QUERY_KEY_ATTEMPT } from 'src/constants';

function Component() {
  const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
  const [match] = useRouterState({ key: 'match-view' });
  return [attempt, match];
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_ATTEMPT, QUERY_KEY_MATCH_VIEW } from 'src/constants';

function Component() {
  const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
  const [match] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
  return [attempt, match];
}`,
    },

    // ------------------------------------------------------------------
    // Issue #1803: the fix is gated on the key's VALUE being statically known,
    // never on the node type that spells it. Each pair below writes one key two
    // ways and asserts ONE shared `output`, so a spelling that reports without
    // a fix — a dead-end error — fails here. The declines that follow pin the
    // shapes that have no static value to derive from, which is what keeps the
    // widening from reaching them.
    // ------------------------------------------------------------------

    // 61. The quoted spelling, whose fixed state its template twin shares.
    {
      name: 'a quoted static key is substituted and imported',
      code: STATIC_KEY_QUOTED,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: STATIC_KEY_FIXED,
    },

    // 62. The same key in template notation reaches the same bytes.
    {
      name: 'an expression-free template key emits the quoted spelling fix',
      code: STATIC_KEY_TEMPLATE,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: STATIC_KEY_FIXED,
    },

    // 63. An escape denotes the character it renders to, in both spellings.
    {
      name: 'an escaped quoted key derives its constant from the escape',
      code: ESCAPED_KEY_QUOTED,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: ESCAPED_KEY_FIXED,
    },

    // 64. Reading the template through `raw` would invent a different constant
    // here, which is the whole difference this case exists to catch.
    {
      name: 'an escaped template key derives the same constant as the quoted one',
      code: ESCAPED_KEY_TEMPLATE,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: ESCAPED_KEY_FIXED,
    },

    // 65. Two spellings, one import: the substitution and the import carrier
    // work the same whichever spelling holds the key.
    {
      name: 'a template key and a quoted key share one emitted import',
      code: `function Component() {
  const [match] = useRouterState({ key: \`match-view\` });
  const [tournament] = useRouterState({ key: 'tournament-view' });
  return [match, tournament];
}`,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      output: `import { QUERY_KEY_MATCH_VIEW, QUERY_KEY_TOURNAMENT_VIEW } from 'src/util/routing/queryKeys';

function Component() {
  const [match] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
  const [tournament] = useRouterState({ key: QUERY_KEY_TOURNAMENT_VIEW });
  return [match, tournament];
}`,
    },

    // 66. An interpolated template holds a different key per render, so there
    // is no value to derive a constant from and the decline is deliberate.
    {
      name: 'an interpolated template key reports without a fix',
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: \`session-\${id}\` });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: null,
    },

    // 67-68. Concatenation and a ternary decline for the same reason.
    {
      name: 'a concatenated key reports without a fix',
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: 'session-' + id });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
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
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: null,
    },

    // ------------------------------------------------------------------
    // Issue #1813: a key whose normalized text is empty names no constant.
    // Emitting `QUERY_KEY_` anyway wrote an identifier `queryKeys.ts` cannot
    // export, so the "fixed" file failed to compile — strictly worse than the
    // report it replaced. Every spelling is asserted the same way, because the
    // decline turns on the key's VALUE; keying it to notation would undo the
    // parity #1803 established. The narrowness controls that follow fix on a
    // single surviving character.
    // ------------------------------------------------------------------
    ...DEGENERATE_KEY_SPELLINGS.map((spelling) => ({
      name: `a key spelled ${spelling} reports without a fix`,
      code: keyCode(spelling),
      errors: [{ messageId: 'enforceQueryKeyImport' as const }],
      output: null,
    })),

    // 78. One alphanumeric character survives normalization, so a constant
    // exists and the fix stands: the decline covers keys that normalize to
    // nothing, not short keys.
    {
      name: 'a one-character key is still substituted and imported',
      code: keyCode("'a'"),
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: SINGLE_CHARACTER_KEY_FIXED,
    },

    // 79. Separators around a single character are stripped, and what is left
    // still names a constant.
    {
      name: 'a key of separators around one character is substituted',
      code: keyCode("'-a-'"),
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: SINGLE_CHARACTER_KEY_FIXED,
    },

    // 80. The decline is per violation: a degenerate key sitting ahead of a
    // real one must not claim the import carrier slot it can no longer fill,
    // which would leave the substituted constant undefined (#1410, #1813).
    {
      name: 'a degenerate key ahead of a real one does not take the import down',
      code: `function Component() {
  const [empty] = useRouterState({ key: '' });
  const [match] = useRouterState({ key: 'match-view' });
  return [empty, match];
}`,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
      output: `import { QUERY_KEY_MATCH_VIEW } from 'src/util/routing/queryKeys';

function Component() {
  const [empty] = useRouterState({ key: '' });
  const [match] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
  return [empty, match];
}`,
    },

    // ------------------------------------------------------------------
    // Issue #1832: reading through the optional chain must resolve to the node
    // underneath, not wave the chain through. These are the mirrors of the
    // valid cases 51-56: a source the plain spelling reports still reports when
    // it is written optionally, and the fix the rule emits is unchanged by a
    // chain sitting anywhere else in the file. Without them, a rule that simply
    // fell silent on anything chained would satisfy every one of those.
    // ------------------------------------------------------------------

    // 81. An unapproved member is unapproved through the chain too — the same
    // report `config.queryKey` draws, with the same absent fix.
    {
      name: 'an optional member from an unapproved source still reports',
      code: `
        function Component({ config }) {
          const derivedKey = config?.queryKey;
          const [value] = useRouterState({ key: derivedKey });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'derivedKey' },
        },
      ],
      output: null,
    },

    // 82. The template feeder reaches the same verdict on the same source.
    {
      name: 'an optional member from an unapproved source in a template reports',
      code: `
        function Component({ config, id }) {
          const [value] = useRouterState({ key: \`\${config?.queryKey}-\${id}\` });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: null,
    },

    // 83. Mirror of case 59: the call carve-out covers the call, and a chain
    // around that call does not extend it to the static text beside it.
    {
      name: 'static template content around an optional call still reports',
      code: `
        function Component() {
          const [value] = useRouterState({ key: \`user-profile-\${buildQueryKey?.('match')}\` });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: null,
    },

    // 84. The lost direction: the hook itself called optionally is still the
    // hook, so its literal key is still detected AND still substituted. A fix
    // is emitted here only because the key's VALUE is statically known (#1803);
    // the chained expressions above yield no value and so name no constant.
    {
      name: 'an optionally called useRouterState with a literal key still fixes',
      code: `function Component() {
  const [stream] = useRouterState?.({ key: 'stream-view' });
  return <div>{stream}</div>;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_STREAM_VIEW } from 'src/util/routing/queryKeys';

function Component() {
  const [stream] = useRouterState?.({ key: QUERY_KEY_STREAM_VIEW });
  return <div>{stream}</div>;
}`,
    },

    // 85. Both directions in one file: the chained derivation stops reporting
    // while the literal beside it keeps its report and carries the import, so
    // the widening cannot be silencing the file wholesale.
    {
      name: 'a literal key beside an optional-chained derivation still fixes',
      code: `function Component({ config }) {
  const derivedKey = config?.getQueryKey();
  const [derived] = useRouterState({ key: derivedKey });
  const [stream] = useRouterState({ key: 'stream-view' });
  return <div>{derived}{stream}</div>;
}`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `import { QUERY_KEY_STREAM_VIEW } from 'src/util/routing/queryKeys';

function Component({ config }) {
  const derivedKey = config?.getQueryKey();
  const [derived] = useRouterState({ key: derivedKey });
  const [stream] = useRouterState({ key: QUERY_KEY_STREAM_VIEW });
  return <div>{derived}{stream}</div>;
}`,
    },
  ],
});

// Issue #1365: RuleTester asserts a single fix pass, but `eslint --fix` loops.
// The defect was that the substituted constant was left undefined, so the rule
// re-reported its own output; these cases assert the multi-pass result is both
// clean and stable.
describe('enforce-querykey-ts: --fix convergence (issue #1365)', () => {
  const lint = (code: string, filename = 'Component.tsx') => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/enforce-querykey-ts',
      enforceQueryKeyTs as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: { 'test/enforce-querykey-ts': 'error' as const },
    };
    const { output } = linter.verifyAndFix(code, config, filename);
    return {
      output,
      remaining: linter.verify(output, config, filename),
    };
  };

  it('leaves no undefined identifier behind', () => {
    const { output, remaining } = lint(`function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return playbackId;
}`);

    expect(output)
      .toBe(`import { QUERY_KEY_PLAYBACK_ID } from 'src/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return playbackId;
}`);
    expect(remaining).toHaveLength(0);
  });

  it('converges several violations onto a single import', () => {
    const { output, remaining } =
      lint(`import { QUERY_KEY_VALID } from '@/util/routing/queryKeys';

function Component() {
  const [valid] = useRouterState({ key: QUERY_KEY_VALID });
  const [match] = useRouterState({ key: 'match-view' });
  const [tournament] = useRouterState({ key: 'tournament-view' });
  return [valid, match, tournament];
}`);

    expect(output)
      .toBe(`import { QUERY_KEY_VALID, QUERY_KEY_MATCH_VIEW, QUERY_KEY_TOURNAMENT_VIEW } from '@/util/routing/queryKeys';

function Component() {
  const [valid] = useRouterState({ key: QUERY_KEY_VALID });
  const [match] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
  const [tournament] = useRouterState({ key: QUERY_KEY_TOURNAMENT_VIEW });
  return [valid, match, tournament];
}`);
    expect(remaining).toHaveLength(0);
  });

  // Issue #1391: the emitted specifier must satisfy the rule's own detection,
  // or every extra pass would append another import of the same module.
  it('reuses the relative import it emitted for a file under src/', () => {
    const { output, remaining } = lint(
      `export const useProfileKey = () => {
  const [profile] = useRouterState({ key: 'user-profile' });
  const [settings] = useRouterState({ key: 'user-settings' });
  return [profile, settings];
};`,
      'src/util/routing/useProfileKey.ts',
    );

    expect(output)
      .toBe(`import { QUERY_KEY_USER_PROFILE, QUERY_KEY_USER_SETTINGS } from './queryKeys';

export const useProfileKey = () => {
  const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  const [settings] = useRouterState({ key: QUERY_KEY_USER_SETTINGS });
  return [profile, settings];
};`);
    expect(remaining).toHaveLength(0);
  });

  it('declines to touch a key whose constant name is already taken', () => {
    const code = `import { QUERY_KEY_PLAYBACK_ID } from './legacy/keys';

function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return playbackId;
}`;
    const { output, remaining } = lint(code);

    expect(output).toBe(code);
    expect(remaining).toHaveLength(1);
  });
});

// Issue #1410: `RuleTester` asserts one fix pass, but `eslint --fix` loops and
// an import stranded by a suppressed carrier never heals on a later pass. These
// run the real `Linter` to assert the end state of a full `--fix` run.
describe('enforce-querykey-ts: inline disables and the import carrier (issue #1410)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-querykey-ts';

  const lint = (code: string, filename = 'Component.tsx') => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(RULE_ID, enforceQueryKeyTs as unknown as Rule.RuleModule);
    // A near-miss neighbour proves rule matching is exact rather than a
    // prefix/substring heuristic.
    linter.defineRule('@blumintinc/blumint/enforce-querykey-ts-strict', {
      meta: { schema: [] },
      create: () => ({}),
    } as unknown as Rule.RuleModule);
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: { [RULE_ID]: 'error' as const },
    };
    const { output } = linter.verifyAndFix(code, config, filename);
    return { output, remaining: linter.verify(output, config, filename) };
  };

  const importedNamesOf = (output: string) =>
    new Set(
      [...output.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*queryKeys'/g)]
        .flatMap(([, specifiers]) => specifiers.split(','))
        .map((specifier) => specifier.trim().split(/\s+as\s+/)[0])
        .filter((name) => name !== ''),
    );

  /** The defect's signature: a substituted constant with no import behind it. */
  const expectEveryQueryKeyImported = (output: string) => {
    const imported = importedNamesOf(output);
    for (const used of new Set(output.match(/QUERY_KEY_[A-Z0-9_]*/g) ?? [])) {
      expect(Array.from(imported)).toContain(used);
    }
  };

  it('carries the import on the first surviving violation', () => {
    const { output, remaining } = lint(`function MatchComponent() {
  // eslint-disable-next-line @blumintinc/blumint/enforce-querykey-ts
  const [value] = useRouterState({ key: 'match-view' });
  return value;
}

function TournamentComponent() {
  const [other] = useRouterState({ key: 'tournament-view' });
  return other;
}
`);

    expect(output)
      .toBe(`import { QUERY_KEY_TOURNAMENT_VIEW } from 'src/util/routing/queryKeys';

function MatchComponent() {
  // eslint-disable-next-line @blumintinc/blumint/enforce-querykey-ts
  const [value] = useRouterState({ key: 'match-view' });
  return value;
}

function TournamentComponent() {
  const [other] = useRouterState({ key: QUERY_KEY_TOURNAMENT_VIEW });
  return other;
}
`);
    expectEveryQueryKeyImported(output);
    expect(remaining).toHaveLength(0);
  });

  it('imports only the constants the surviving rewrites use', () => {
    const { output } = lint(`function Component() {
  const [match] = useRouterState({ key: 'match-view' });
  // eslint-disable-next-line @blumintinc/blumint/enforce-querykey-ts
  const [tournament] = useRouterState({ key: 'tournament-view' });
  const [team] = useRouterState({ key: 'team-view' });
  return [match, tournament, team];
}
`);

    expect(Array.from(importedNamesOf(output)).sort()).toEqual([
      'QUERY_KEY_MATCH_VIEW',
      'QUERY_KEY_TEAM_VIEW',
    ]);
    expect(output).toContain("key: 'tournament-view'");
    expectEveryQueryKeyImported(output);
  });

  it('adds neither import nor substitution when every violation is disabled', () => {
    const code = `function Component() {
  // eslint-disable-next-line @blumintinc/blumint/enforce-querykey-ts
  const [match] = useRouterState({ key: 'match-view' });
  // eslint-disable-next-line @blumintinc/blumint/enforce-querykey-ts
  const [tournament] = useRouterState({ key: 'tournament-view' });
  return [match, tournament];
}
`;

    const { output } = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('QUERY_KEY_');
  });

  it('leaves the file untouched under a whole-file block disable', () => {
    const code = `/* eslint-disable @blumintinc/blumint/enforce-querykey-ts */
function Component() {
  const [match] = useRouterState({ key: 'match-view' });
  const [tournament] = useRouterState({ key: 'tournament-view' });
  return [match, tournament];
}
`;

    const { output } = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('QUERY_KEY_');
  });

  it('does not treat a disable for a similarly named rule as its own', () => {
    const { output, remaining } = lint(`function Component() {
  // eslint-disable-next-line @blumintinc/blumint/enforce-querykey-ts-strict
  const [match] = useRouterState({ key: 'match-view' });
  return match;
}
`);

    expect(output)
      .toBe(`import { QUERY_KEY_MATCH_VIEW } from 'src/util/routing/queryKeys';

function Component() {
  // eslint-disable-next-line @blumintinc/blumint/enforce-querykey-ts-strict
  const [match] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
  return match;
}
`);
    expectEveryQueryKeyImported(output);
    expect(remaining).toHaveLength(0);
  });

  it('keeps the import when only the last violation survives a block disable', () => {
    const { output } = lint(`function Component() {
  /* eslint-disable @blumintinc/blumint/enforce-querykey-ts */
  const [match] = useRouterState({ key: 'match-view' });
  const [tournament] = useRouterState({ key: 'tournament-view' });
  /* eslint-enable @blumintinc/blumint/enforce-querykey-ts */
  const [team] = useRouterState({ key: 'team-view' });
  return [match, tournament, team];
}
`);

    expect(Array.from(importedNamesOf(output))).toEqual([
      'QUERY_KEY_TEAM_VIEW',
    ]);
    expectEveryQueryKeyImported(output);
  });

  it('extends an existing queryKeys import with the survivors alone', () => {
    const { output, remaining } =
      lint(`import { QUERY_KEY_VALID } from '@/util/routing/queryKeys';

function Component() {
  const [valid] = useRouterState({ key: QUERY_KEY_VALID });
  // eslint-disable-next-line @blumintinc/blumint/enforce-querykey-ts
  const [match] = useRouterState({ key: 'match-view' });
  const [tournament] = useRouterState({ key: 'tournament-view' });
  return [valid, match, tournament];
}
`);

    expect(output)
      .toBe(`import { QUERY_KEY_VALID, QUERY_KEY_TOURNAMENT_VIEW } from '@/util/routing/queryKeys';

function Component() {
  const [valid] = useRouterState({ key: QUERY_KEY_VALID });
  // eslint-disable-next-line @blumintinc/blumint/enforce-querykey-ts
  const [match] = useRouterState({ key: 'match-view' });
  const [tournament] = useRouterState({ key: QUERY_KEY_TOURNAMENT_VIEW });
  return [valid, match, tournament];
}
`);
    expect(output.match(/from '@\/util\/routing\/queryKeys'/g)).toHaveLength(1);
    expectEveryQueryKeyImported(output);
    expect(remaining).toHaveLength(0);
  });

  it('fixes every surviving violation across several passes with one import', () => {
    const { output, remaining } = lint(`function Component() {
  // eslint-disable-next-line @blumintinc/blumint/enforce-querykey-ts
  const [match] = useRouterState({ key: 'match-view' });
  const [tournament] = useRouterState({ key: 'tournament-view' });
  const [team] = useRouterState({ key: 'team-view' });
  return [match, tournament, team];
}
`);

    expect(output.match(/from 'src\/util\/routing\/queryKeys'/g)).toHaveLength(
      1,
    );
    expect(Array.from(importedNamesOf(output)).sort()).toEqual([
      'QUERY_KEY_TEAM_VIEW',
      'QUERY_KEY_TOURNAMENT_VIEW',
    ]);
    expectEveryQueryKeyImported(output);
    expect(remaining).toHaveLength(0);
  });
});

// ------------------------------------------------------------------
// Issue #1648: a fix that writes a brand-new import must not displace the
// file's prologue. Each case is flush-left because a prologue's meaning
// depends on its position in the file. The final case is the control: an
// anchor disabled outright would also "preserve" every prologue above, so
// the import must still land at the top of an existing import block.
// ------------------------------------------------------------------
ruleTesterJsx.run('enforce-querykey-ts', enforceQueryKeyTs, {
  valid: [],
  invalid: [
    {
      name: "the injected import lands below a 'use client' directive",
      filename: '/repo/src/components/Widget.tsx',
      code: `'use client';
function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return <div>{playbackId}</div>;
}
`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `'use client';
import { QUERY_KEY_PLAYBACK_ID } from '../util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return <div>{playbackId}</div>;
}
`,
    },
    {
      name: 'the injected import leaves a shebang at character 0',
      filename: '/repo/src/components/Widget.tsx',
      code: `#!/usr/bin/env node
function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return <div>{playbackId}</div>;
}
`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `#!/usr/bin/env node
import { QUERY_KEY_PLAYBACK_ID } from '../util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return <div>{playbackId}</div>;
}
`,
    },
    {
      name: 'the injected import stays below a // @ts-nocheck header',
      filename: '/repo/src/components/Widget.tsx',
      code: `// @ts-nocheck
function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return <div>{playbackId}</div>;
}
`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `// @ts-nocheck
import { QUERY_KEY_PLAYBACK_ID } from '../util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return <div>{playbackId}</div>;
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
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return <div>{playbackId}</div>;
}
`,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `'use client';
import { QUERY_KEY_PLAYBACK_ID } from '../util/routing/queryKeys';
import { x } from './x';
void x;
function Component() {
  const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return <div>{playbackId}</div>;
}
`,
    },
  ],
});
