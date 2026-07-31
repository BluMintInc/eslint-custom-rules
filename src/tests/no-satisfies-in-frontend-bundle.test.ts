import { ruleTesterTs } from '../utils/ruleTester';
import { noSatisfiesInFrontendBundle } from '../rules/no-satisfies-in-frontend-bundle';

// Shared by the four option cases below (27-30). Each option is asserted as a
// valid/invalid pair over this identical source and an identical filename, so
// the configured path list is the only difference between the two outcomes and
// neither case could pass if the rule ignored the option it sets.
const PATH_OPTION_CODE = `
type ThemeConfig = { spacing: number };
const THEME = { spacing: 8 } satisfies ThemeConfig;
`;

// Inside the default include paths and outside the default exclude paths.
const FRONTEND_FILE = '/project/src/config/theme.ts';

// Inside the default exclude paths.
const EXCLUDED_BACKEND_FILE =
  '/project/functions/src/firestore/report/reasons.ts';

// Outside the default include paths entirely.
const UNINCLUDED_FILE = '/project/scripts/buildTheme.ts';

ruleTesterTs.run(
  'no-satisfies-in-frontend-bundle',
  noSatisfiesInFrontendBundle,
  {
    valid: [
      // 1. Bare `as const` (TSAsExpression) in a src/ file — must NOT be flagged.
      {
        filename: '/project/src/components/report/ReportDialogTitle.tsx',
        code: `
const REPORT_TARGET_LABELS = {
  user: 'User',
  post: 'Post',
} as const;
`,
      },

      // 2. `satisfies` inside an excluded backend dir (functions/src/firestore/).
      {
        filename: '/project/functions/src/firestore/report/reasons.ts',
        code: `
type ReportReason = { label: string };
const REASONS = { spam: { label: 'Spam' } } satisfies Record<string, ReportReason>;
`,
      },

      // 3. `satisfies` inside another excluded backend dir (functions/src/callable/).
      {
        filename: '/project/functions/src/callable/users/createUser.ts',
        code: `
type Params = { uid: string };
const DEFAULT_PARAMS = { uid: '' } satisfies Params;
`,
      },

      // 4. `satisfies` inside excluded functions/src/pubsub/.
      {
        filename: '/project/functions/src/pubsub/notifications/send.ts',
        code: `
type Config = { retry: boolean };
const config = { retry: true } satisfies Config;
`,
      },

      // 5. `satisfies` inside excluded functions/src/webhooks/.
      {
        filename: '/project/functions/src/webhooks/stripe/webhook.ts',
        code: `
type Handler = { path: string };
const handler = { path: '/stripe' } satisfies Handler;
`,
      },

      // 6. `satisfies` in excluded functions/src/queues/.
      {
        filename: '/project/functions/src/queues/email/queue.ts',
        code: `
type QueueConfig = { maxConcurrency: number };
const queueConfig = { maxConcurrency: 10 } satisfies QueueConfig;
`,
      },

      // 7. `satisfies` in excluded functions/src/realtime/.
      {
        filename: '/project/functions/src/realtime/presence/tracker.ts',
        code: `
type PresenceConfig = { ttl: number };
const presenceConfig = { ttl: 300 } satisfies PresenceConfig;
`,
      },

      // 8. `satisfies` in a .d.ts declaration file — always exempt.
      {
        filename: '/project/src/types/global.d.ts',
        code: `
declare const OPTIONS: { key: string } extends Record<string, string>
  ? { key: string }
  : never;
`,
      },

      // 9. `satisfies` in a test file (*.test.ts) — exempt, never bundled.
      {
        filename:
          '/project/src/components/report/__tests__/ReportDialog.test.ts',
        code: `
type Config = { label: string };
const testConfig = { label: 'test' } satisfies Config;
`,
      },

      // 10. `satisfies` in a spec file (*.spec.ts) — exempt, never bundled.
      {
        filename: '/project/src/hooks/useReport.spec.ts',
        code: `
type Opts = { enabled: boolean };
const opts = { enabled: true } satisfies Opts;
`,
      },

      // 11. `satisfies` in a TSX test file (*.test.tsx) — exempt.
      {
        filename: '/project/src/components/Foo.test.tsx',
        code: `
type Props = { label: string };
const mockProps = { label: 'hello' } satisfies Props;
`,
      },

      // 12. File outside any include path — not enforced.
      {
        filename: '/project/scripts/generate-manifest.ts',
        code: `
type Config = { output: string };
const config = { output: 'dist' } satisfies Config;
`,
      },

      // 13. File outside any include path (node_modules-like path) — not enforced.
      {
        filename: '/project/node_modules/some-lib/index.ts',
        code: `
type Opts = { debug: boolean };
const opts = { debug: false } satisfies Opts;
`,
      },

      // 14. Plain variable declaration with explicit type annotation — valid.
      {
        filename: '/project/src/constants/labels.ts',
        code: `
type Labels = Record<string, string>;
const LABELS: Labels = { home: 'Home', profile: 'Profile' };
`,
      },

      // 15. Constrained identity helper pattern (the approved workaround) — valid.
      {
        filename: '/project/src/hooks/guard/guardFlow.ts',
        code: `
function build<T extends Record<string, { label: string }>>(x: T) { return x; }
export const GUARD_FLOW_MAP = build({ login: { label: 'Login' } } as const);
`,
      },

      // 16. `as const` on a nested object — no `satisfies`, must NOT fire.
      {
        filename: '/project/src/components/Settings.tsx',
        code: `
const SETTINGS = {
  theme: { dark: true, contrast: false } as const,
} as const;
`,
      },

      // 17. `satisfies` in a functions/src/spec file — exempt.
      {
        filename: '/project/functions/src/types/report.spec.ts',
        code: `
type ReportType = { kind: string };
const report = { kind: 'spam' } satisfies ReportType;
`,
      },

      // 27a. excludePaths WIDENED to cover a frontend file that the defaults
      // enforce. Paired with invalid 27b: same code, same filename.
      {
        filename: FRONTEND_FILE,
        code: PATH_OPTION_CODE,
        options: [{ excludePaths: ['src/config/**'] }],
      },

      // 28a. The backend file the default excludePaths already cover. Paired
      // with invalid 28b, which empties that list over the same file.
      {
        filename: EXCLUDED_BACKEND_FILE,
        code: PATH_OPTION_CODE,
      },

      // 29a. includePaths NARROWED to the backend only, so a frontend file
      // falls outside enforcement. The default excludePaths do not match
      // `src/config/**`, so includePaths is what silences this. Paired with
      // invalid 27b, which lints the same file and code with the defaults.
      {
        filename: FRONTEND_FILE,
        code: PATH_OPTION_CODE,
        options: [{ includePaths: ['functions/src/**'] }],
      },

      // 30a. A file outside every default include path. Paired with invalid
      // 30b, which widens includePaths to reach it.
      {
        filename: UNINCLUDED_FILE,
        code: PATH_OPTION_CODE,
      },
    ],

    invalid: [
      // 18. `{ ... } as const satisfies T` in a src/components/ tsx file — MUST report.
      {
        filename: '/project/src/components/report/ReportDialogTitle.tsx',
        code: `
type ReportTargetType = 'user' | 'post';
const REPORT_TARGET_LABELS = {
  user: 'User',
  post: 'Post',
} as const satisfies Record<ReportTargetType, string>;
`,
        errors: [{ messageId: 'noSatisfiesOperator' }],
      },

      // 19. Plain `satisfies` in a src/ file.
      {
        filename: '/project/src/hooks/useReport.ts',
        code: `
type Opts = { enabled: boolean };
const opts = { enabled: true } satisfies Opts;
`,
        errors: [{ messageId: 'noSatisfiesOperator' }],
      },

      // 20. `satisfies` in functions/src/types/ — NOT excluded, is in include path.
      {
        filename: '/project/functions/src/types/firestore/Report/reasons.ts',
        code: `
type ReportReason = { label: string };
export const REASONS = {
  spam: { label: 'Spam' },
  harassment: { label: 'Harassment' },
} as const satisfies Record<string, ReportReason>;
`,
        errors: [{ messageId: 'noSatisfiesOperator' }],
      },

      // 21. Nested `satisfies` expressions inside an object property — each reported.
      {
        filename: '/project/src/constants/config.ts',
        code: `
type Color = { hex: string };
type Shape = { sides: number };
const STYLES = {
  primary: ({ hex: '#ff0000' } satisfies Color),
  secondary: ({ hex: '#0000ff' } satisfies Color),
};
`,
        errors: [
          { messageId: 'noSatisfiesOperator' },
          { messageId: 'noSatisfiesOperator' },
        ],
      },

      // 22. `x satisfies Foo` as an expression statement in src/.
      {
        filename: '/project/src/utils/validate.ts',
        code: `
type Foo = { bar: string };
const x = { bar: 'baz' };
void (x satisfies Foo);
`,
        errors: [{ messageId: 'noSatisfiesOperator' }],
      },

      // 23. `satisfies` in a functions/src/ file outside any excluded directory.
      {
        filename: '/project/functions/src/utils/format.ts',
        code: `
type Formatter = (val: string) => string;
const formatName = ((val: string) => val.trim()) satisfies Formatter;
`,
        errors: [{ messageId: 'noSatisfiesOperator' }],
      },

      // 24. Multiple `satisfies` at top level and nested — all reported.
      {
        filename: '/project/src/pages/index.tsx',
        code: `
type Config = { title: string };
type Meta = { description: string };
const PAGE_CONFIG = { title: 'Home' } satisfies Config;
const PAGE_META = { description: 'Home page' } satisfies Meta;
`,
        errors: [
          { messageId: 'noSatisfiesOperator' },
          { messageId: 'noSatisfiesOperator' },
        ],
      },

      // 25. `satisfies` in a TSX component file.
      {
        filename: '/project/src/components/Foo.tsx',
        code: `
type ButtonVariant = 'primary' | 'secondary';
type VariantConfig = { color: string };
const VARIANT_CONFIG = {
  primary: { color: 'blue' },
  secondary: { color: 'gray' },
} satisfies Record<ButtonVariant, VariantConfig>;
`,
        errors: [{ messageId: 'noSatisfiesOperator' }],
      },

      // 26. `satisfies` in a src/ index file.
      {
        filename: '/project/src/index.ts',
        code: `
type Exports = { version: string };
const exports_ = { version: '1.0.0' } satisfies Exports;
`,
        errors: [{ messageId: 'noSatisfiesOperator' }],
      },

      // 27b. The default counterpart of valid 27a and 29a: with no options this
      // exact file and source is reported, so those two valid cases are decided
      // by their excludePaths/includePaths values alone.
      {
        filename: FRONTEND_FILE,
        code: PATH_OPTION_CODE,
        errors: [{ messageId: 'noSatisfiesOperator' }],
      },

      // 28b. excludePaths EMPTIED, so the backend directory the defaults exempt
      // (valid 28a) is enforced instead.
      {
        filename: EXCLUDED_BACKEND_FILE,
        code: PATH_OPTION_CODE,
        options: [{ excludePaths: [] }],
        errors: [{ messageId: 'noSatisfiesOperator' }],
      },

      // 30b. includePaths WIDENED to reach a directory the defaults ignore
      // (valid 30a). An inclusion filter only demonstrates an effect when
      // narrowed or widened past its default, never at its default.
      {
        filename: UNINCLUDED_FILE,
        code: PATH_OPTION_CODE,
        options: [{ includePaths: ['**/scripts/**'] }],
        errors: [{ messageId: 'noSatisfiesOperator' }],
      },
    ],
  },
);
