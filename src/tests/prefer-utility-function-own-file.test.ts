import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import { preferUtilityFunctionOwnFile } from '../rules/prefer-utility-function-own-file';

/**
 * Generates a sizable function body string with at least `n` statements.
 * All statements are pure (no module-scope references).
 */
function sizableBody(n: number): string {
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    lines.push(`const _v${i} = ${i} + 1;`);
  }
  return lines.join('\n');
}

/**
 * Generates a sizable arrow-const function with the given name.
 * Pure: all references are parameter-local.
 */
function sizableArrowConst(name: string, stmts = 9): string {
  return `const ${name} = (x: number) => {\n${sizableBody(
    stmts,
  )}\nreturn x;\n};`;
}

/**
 * Generates a sizable function declaration with the given name.
 */
function sizableFunctionDecl(name: string, stmts = 9): string {
  return `function ${name}(x: number) {\n${sizableBody(stmts)}\nreturn x;\n}`;
}

// ---------------------------------------------------------------------------
// TypeScript rule tester (no JSX)
// ---------------------------------------------------------------------------
ruleTesterTs.run(
  'prefer-utility-function-own-file',
  preferUtilityFunctionOwnFile,
  {
    valid: [
      // 1. Small helper under the statement threshold — no flag
      {
        code: `
const toFieldPath = (role: string, id: string) => \`roles.\${role}.\${id}\`;
export default onCall(handler);
`,
        filename: 'modifyRoleMembers.f.ts',
      },

      // 2. Dedicated util file: only one top-level function → not co-located
      {
        code: `
export const assertCrewRolesExclusive = (roles: string[], rolesExisting: Record<string, any>, context: any) => {
  const rolesToAdd = new Set(roles);
  for (const roleToAdd of roles) {
    const conflicting = MUTUALLY_EXCLUSIVE[roleToAdd];
    if (!conflicting) continue;
    const members = rolesExisting[conflicting];
    if ((members && context.memberId in members) || rolesToAdd.has(conflicting)) {
      throw new Error('conflict');
    }
  }
};
`,
        filename: 'assertCrewRolesExclusive.ts',
      },

      // 3. The primary/default-exported function in a *.f.ts file
      {
        code: `
${sizableFunctionDecl('modifyRoleMembers', 9)}
export default onCall(authenticatedOnly(modifyRoleMembers));
`,
        filename: 'modifyRoleMembers.f.ts',
      },

      // 4. Hook — never flagged, even if large and co-located
      {
        code: `
${sizableArrowConst('useComplexHook', 9)}
export default onCall(handler);
`,
        filename: 'someFile.f.ts',
      },

      // 5. Sizable function that closes over another module-scope function (ignoreClosures=true by default)
      {
        code: `
function helperA(x: number) {
  return x + 1;
}

const sizable = (x: number) => {
  const a = helperA(x);
  const b = a + 1;
  const c = b + 1;
  const d = c + 1;
  const e = d + 1;
  const f = e + 1;
  const g = f + 1;
  const h = g + 1;
  return h;
};

export default onCall(handler);
`,
        filename: 'someFile.f.ts',
      },

      // 6. Named export whose name matches the file basename
      {
        code: `
${sizableArrowConst('computeScore', 9)}
export const computeScore2 = (x: number) => x + 1;
`,
        filename: 'computeScore.ts',
      },

      // 7. Single top-level function — file IS the util file (only 1 function)
      {
        code: `
${sizableArrowConst('bigUtil', 10)}
`,
        filename: 'bigUtil.ts',
      },

      // 8. Function declaration with export default — it is the primary export
      {
        code: `
${sizableFunctionDecl('myHandler', 9)}
export default myHandler;
`,
        filename: 'myHandler.f.ts',
      },

      // 9. Function wrapped as export default via identifier (primary)
      {
        code: `
${sizableFunctionDecl('processData', 9)}
export default processData;
`,
        filename: 'processData.ts',
      },

      // 10. Two functions, but second is a hook — hook is never flagged
      {
        code: `
${sizableArrowConst('useMyHook', 9)}
export default onCall(handler);
`,
        filename: 'someEntry.f.ts',
      },

      // 11. Async function declaration as default export — primary
      {
        code: `
async function sendNotification(userId: string) {
  const _v0 = userId + '1';
  const _v1 = _v0 + '2';
  const _v2 = _v1 + '3';
  const _v3 = _v2 + '4';
  const _v4 = _v3 + '5';
  const _v5 = _v4 + '6';
  const _v6 = _v5 + '7';
  const _v7 = _v6 + '8';
  return _v7;
}
export default onCall(authenticatedOnly(sendNotification));
`,
        filename: 'sendNotification.f.ts',
      },

      // 12. Both functions are named exports — neither has a "primary" that isn't themselves
      // This is ambiguous: two named-export utils, both exported. The rule only flags when
      // there's a DISTINCT primary. Since both are named exports, each IS a primary for
      // the other's perspective. With minStatements=8 and both being sizable, they'd trigger
      // IF there's a distinct primary. But with only 2 named exports and no export default,
      // the "distinct primary" is the other named export — so they WOULD flag each other.
      // Skip this edge case — handled by the invalid tests below.
      // Instead, test: a file with only small helpers and a sizable primary export — OK.
      {
        code: `
const small1 = (x: number) => x + 1;
const small2 = (x: number) => x + 2;
${sizableArrowConst('primaryUtil', 9)}
export { primaryUtil };
`,
        filename: 'primaryUtil.ts',
      },

      // 13. Generic function (type params) — treated normally. Small, no flag.
      {
        code: `
const identity = <T>(x: T): T => x;
export default onCall(handler);
`,
        filename: 'someFile.f.ts',
      },

      // 14. Test file — exempt entirely
      {
        code: `
${sizableArrowConst('bigHelper', 10)}
export default onCall(handler);
`,
        filename: 'someFile.test.ts',
      },

      // 15. Spec file — exempt
      {
        code: `
${sizableArrowConst('bigHelper', 10)}
export default onCall(handler);
`,
        filename: 'someFile.spec.ts',
      },

      // 16. __mocks__ directory — exempt
      {
        code: `
${sizableArrowConst('mockHelper', 10)}
export default mockFactory();
`,
        filename: '/project/src/__mocks__/someFile.ts',
      },

      // 17. Types directory — exempt
      {
        code: `
${sizableArrowConst('typeHelper', 10)}
export default onCall(handler);
`,
        filename: '/project/functions/src/types/helpers.ts',
      },

      // 18. Function just under minLines threshold (11 lines) — not sizable
      {
        code: `
const almostBig = (x: number) => {
  const a = x + 1;
  const b = a + 1;
  const c = b + 1;
  const d = c + 1;
  const e = d + 1;
  const f = e + 1;
  return f;
};
export default onCall(handler);
`,
        filename: 'someFile.f.ts',
      },

      // 19. A sizable function IS the export default declaration directly
      {
        code: `
export default function bigPrimary(x: number) {
  const _v0 = x + 1;
  const _v1 = _v0 + 1;
  const _v2 = _v1 + 1;
  const _v3 = _v2 + 1;
  const _v4 = _v3 + 1;
  const _v5 = _v4 + 1;
  const _v6 = _v5 + 1;
  const _v7 = _v6 + 1;
  return _v7;
}
`,
        filename: 'bigPrimary.ts',
      },

      // 20. CLI entry-point module colocating its parser/printer/guard/compute
      // helpers — every function IS the CLI (require.main + self-invocation).
      {
        name: 'CLI entry-point module colocating its parser/printer/guard/compute helpers',
        filename: 'scripts/dev-report/report-window.ts',
        code: `
export type AutoRunIfMainProps = {
  mainModule?: NodeModule | undefined;
  currentModule?: NodeModule;
  runner?: typeof runCli;
};

export function runCli(argv = process.argv) {
  const isJson = argv.includes('--json');
  printWindow(computeReportWindow(), isJson);
}

export function printWindow(
  window: { sinceIso: string; untilIso: string },
  isJson: boolean,
) {
  if (isJson) {
    console.log(JSON.stringify(window));
    return;
  }
  console.log(
    [
      \`Window: \${window.sinceIso} -> \${window.untilIso}\`,
      \`Generated by report-window CLI\`,
    ].join('\\n'),
  );
}

export async function autoRunIfMain(props: AutoRunIfMainProps = {}) {
  const {
    mainModule = require.main,
    currentModule = module,
    runner = runCli,
  } = props;
  if (mainModule !== currentModule) return;
  try {
    await runner();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

export function computeReportWindow(now: Date = new Date()) {
  const since = new Date(now.getTime() - 86_400_000);
  return {
    sinceIso: since.toISOString(),
    untilIso: now.toISOString(),
  } as const;
}

void autoRunIfMain();
`,
      },

      // 21. Registry module whose exported finders close over the registry
      // const (a top-level non-function binding) — extraction is exactly wrong.
      {
        name: 'registry module whose exported finders close over the registry const',
        filename: 'scripts/dev-report/developer-registry.ts',
        code: `
export type DeveloperIdentity = {
  key: string;
  githubLogin: string;
  gitEmails: readonly string[];
  gitAuthorNames: readonly string[];
};

export const DEVELOPER_REGISTRY: readonly DeveloperIdentity[] = [
  {
    key: 'joe',
    githubLogin: 'oconnorjoseph',
    gitEmails: ['joe@example.com'],
    gitAuthorNames: ['oconnorjoseph'],
  },
] as const;

export function findDeveloperByGitIdentity(email: string, authorName: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const byEmail = DEVELOPER_REGISTRY.find((developer) => {
    return developer.gitEmails.includes(normalizedEmail);
  });
  if (byEmail) {
    return byEmail;
  }
  const normalizedName = authorName.trim().toLowerCase();
  return DEVELOPER_REGISTRY.find((developer) => {
    return developer.gitAuthorNames.some((name) => {
      return name.toLowerCase() === normalizedName;
    });
  });
}

export function findDeveloperByGithubLogin(login: string) {
  const normalized = login.trim().toLowerCase();
  return DEVELOPER_REGISTRY.find((developer) => {
    return developer.githubLogin.toLowerCase() === normalized;
  });
}
`,
      },

      // 22. CLI recognized via top-level self-invocation alone (no require.main)
      {
        code: `
${sizableFunctionDecl('parseArgs', 9)}
function main() {
  const parsed = parseArgs(1);
  return parsed;
}
main();
`,
        filename: 'scripts/some-cli.ts',
      },

      // 23. CLI recognized via require.main alone (no self-invocation)
      {
        code: `
${sizableFunctionDecl('collectMetrics', 9)}
export const IS_MAIN = require.main === module;
`,
        filename: 'scripts/metrics.ts',
      },

      // 24. Non-CLI file: sizable export references a sibling only through a
      // destructured default (`const { helper = computeBase } = opts`), so it
      // closes over module scope and must not be flagged (ignoreClosures).
      {
        code: `
export function computeBase(x: number) {
  return x + 1;
}
export function computeReport(opts: { helper?: typeof computeBase } = {}) {
  const { helper = computeBase } = opts;
  const a = helper(1);
  const b = a + 1;
  const c = b + 1;
  const d = c + 1;
  const e = d + 1;
  const f = e + 1;
  const g = f + 1;
  const h = g + 1;
  return h;
}
`,
        filename: 'scripts/report-utils.ts',
      },
    ],

    invalid: [
      // 1. The issue's assertCrewRolesExclusive pattern:
      // Pure sizable arrow-const co-located in *.f.ts with export default onCall(...)
      {
        code: `
const assertCrewRolesExclusive = (roles: string[], rolesExisting: Record<string, any>, context: any) => {
  const rolesToAdd = new Set(roles);
  for (const roleToAdd of roles) {
    const conflicting = MUTUALLY_EXCLUSIVE_CREW_ROLE[roleToAdd];
    if (!conflicting) continue;
    const members = rolesExisting[conflicting];
    if ((members && context.memberId in members) || rolesToAdd.has(conflicting)) {
      throw new Error('conflict');
    }
  }
  const x1 = 1;
  const x2 = 2;
  const x3 = 3;
};

export default onCall(authenticatedOnly(modifyRoleMembers));
`,
        filename: 'modifyRoleMembers.f.ts',
        errors: [{ messageId: 'extractUtility' }],
      },

      // 2. Sizable pure function declaration co-located with export default
      {
        code: `
${sizableFunctionDecl('validatePayload', 9)}
export default onCall(handler);
`,
        filename: 'someEntry.f.ts',
        errors: [{ messageId: 'extractUtility' }],
      },

      // 3. Sizable arrow-const alongside a different primary named export
      {
        code: `
${sizableArrowConst('helperUtil', 9)}
${sizableArrowConst('mainUtil', 9)}
export { mainUtil };
`,
        filename: 'mainUtil.ts',
        errors: [{ messageId: 'extractUtility' }],
      },

      // 4. Sizable function declaration co-located with export default onCall wrapping a different name
      {
        code: `
${sizableFunctionDecl('computeRoleMatrix', 9)}
${sizableFunctionDecl('handleRequest', 9)}
export default onCall(handleRequest);
`,
        filename: 'handleRequest.f.ts',
        errors: [{ messageId: 'extractUtility' }],
      },

      // 5. Sizable function co-located alongside another sizable named-exported util
      {
        code: `
${sizableArrowConst('parseConfig', 9)}
${sizableArrowConst('buildResponse', 9)}
export { parseConfig, buildResponse };
`,
        filename: 'utils.ts',
        errors: [
          { messageId: 'extractUtility' },
          { messageId: 'extractUtility' },
        ],
      },

      // 6. Generic sizable function co-located with export default
      {
        code: `
function transform<T, U>(input: T[], fn: (x: T) => U): U[] {
  const result: U[] = [];
  const step1 = input.filter(Boolean);
  const step2 = step1.map(fn);
  const step3 = step2.filter(Boolean);
  const step4 = step3.slice(0);
  const step5 = step4.concat([]);
  const step6 = step5.flat();
  const step7 = step6.reverse();
  return step7 as U[];
}
export default onCall(handler);
`,
        filename: 'someEntry.f.ts',
        errors: [{ messageId: 'extractUtility' }],
      },

      // 7. Multiple co-located helpers, only the sizable one is flagged
      {
        code: `
const tiny = (x: number) => x + 1;
${sizableArrowConst('bigHelper', 9)}
export default onCall(mainHandler);
`,
        filename: 'mainHandler.f.ts',
        errors: [{ messageId: 'extractUtility' }],
      },

      // 8. Sizable function alongside a hook (hook not flagged, sizable one is)
      {
        code: `
${sizableArrowConst('processItems', 9)}
export const useMyHook = () => {
  const _v0 = 1;
  return _v0;
};
export default onCall(handler);
`,
        filename: 'someFile.f.ts',
        errors: [{ messageId: 'extractUtility' }],
      },

      // 9. Async sizable helper co-located with export default
      {
        code: `
async function fetchAndProcess(url: string) {
  const _v0 = url + '1';
  const _v1 = _v0 + '2';
  const _v2 = _v1 + '3';
  const _v3 = _v2 + '4';
  const _v4 = _v3 + '5';
  const _v5 = _v4 + '6';
  const _v6 = _v5 + '7';
  const _v7 = _v6 + '8';
  return _v7;
}
export default onCall(primaryHandler);
`,
        filename: 'primaryHandler.f.ts',
        errors: [{ messageId: 'extractUtility' }],
      },

      // 10. ignoreClosures=false: sizable function that closes over module scope IS flagged
      {
        code: `
const MODULE_CONST = 42;
const sizableWithClosure = (x: number) => {
  const a = MODULE_CONST + x;
  const b = a + 1;
  const c = b + 1;
  const d = c + 1;
  const e = d + 1;
  const f = e + 1;
  const g = f + 1;
  const h = g + 1;
  return h;
};
export default onCall(handler);
`,
        filename: 'someFile.f.ts',
        options: [{ ignoreClosures: false }],
        errors: [{ messageId: 'extractUtility' }],
      },

      // 11. minStatements=3 custom threshold — smaller functions flagged
      {
        code: `
const smallButFlagged = (x: number) => {
  const a = x + 1;
  const b = a + 1;
  const c = b + 1;
  return c;
};
export default onCall(handler);
`,
        filename: 'someFile.f.ts',
        options: [{ minStatements: 3, minLines: 100 }],
        errors: [{ messageId: 'extractUtility' }],
      },

      // 12. minLines=5 custom threshold — flags based on line count
      {
        code: `
const fiveLines = (x: number) => {
  const a = x + 1;
  const b = a + 1;
  return b;
};
export default onCall(handler);
`,
        filename: 'someFile.f.ts',
        options: [{ minStatements: 100, minLines: 5 }],
        errors: [{ messageId: 'extractUtility' }],
      },

      // 13. A top-level bare call to an imported/non-own function is NOT a
      // self-invocation, so the CLI exemption must not fire — the co-located
      // sizable helper is still flagged.
      {
        code: `
${sizableArrowConst('bigHelper', 9)}
externalBootstrap();
export default onCall(handler);
`,
        filename: 'mainHandler.f.ts',
        errors: [{ messageId: 'extractUtility' }],
      },
    ],
  },
);

// ---------------------------------------------------------------------------
// JSX rule tester (for React component tests)
// ---------------------------------------------------------------------------
ruleTesterJsx.run(
  'prefer-utility-function-own-file (JSX)',
  preferUtilityFunctionOwnFile,
  {
    valid: [
      // 1. Large component in its own file (only component, no co-located util)
      {
        code: `
function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>Content</p>
    </div>
  );
}
export default Dashboard;
`,
        filename: 'Dashboard.tsx',
      },

      // 2. The component itself is never flagged (returns JSX)
      {
        code: `
const MyComponent = () => <div className="foo" />;
export default MyComponent;
`,
        filename: 'MyComponent.tsx',
      },

      // 3. Hook in JSX file — not flagged
      {
        code: `
${sizableArrowConst('useMyHook', 9)}
function MyPage() { return <div />; }
export default MyPage;
`,
        filename: 'MyPage.tsx',
      },
    ],

    invalid: [
      // 1. Sizable pure helper alongside a React component
      {
        code: `
${sizableArrowConst('formatData', 9)}
function MyPage() { return <div />; }
export default MyPage;
`,
        filename: 'MyPage.tsx',
        errors: [{ messageId: 'extractUtility' }],
      },

      // 2. Sizable helper with a named-export component
      {
        code: `
${sizableArrowConst('computeLayout', 9)}
export function Header() { return <header />; }
`,
        filename: 'Header.tsx',
        errors: [{ messageId: 'extractUtility' }],
      },

      // 3. Sizable non-hook arrow-const alongside a component + export default
      {
        code: `
${sizableArrowConst('pureHelper', 9)}
const MyComponent = () => <div className="foo" />;
export default MyComponent;
`,
        filename: 'MyComponent.tsx',
        errors: [{ messageId: 'extractUtility' }],
      },
    ],
  },
);
