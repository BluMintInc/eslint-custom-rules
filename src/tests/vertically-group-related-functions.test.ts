// rule-request
import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import { verticallyGroupRelatedFunctions } from '../rules/vertically-group-related-functions';

const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

ruleTesterTs.run(
  'vertically-group-related-functions',
  verticallyGroupRelatedFunctions,
  {
    valid: [
      `
      function handleClick() {
        processUserInput(userInput);
      }

      function processUserInput(input: string) {
        return sanitize(input);
      }

      function fetchData() {
        return api.get('/data');
      }

      function transformData(data: unknown[]) {
        return data.map((item) => (item as any).value);
      }
      `,
      `
      const handleSubmit = () => formatPayload();
      const formatPayload = () => ({});
      `,
      `
      function main() {
        helper();
      }
      function helper() {}
      `,
      `
      export function entry() {
        return compute();
      }
      function compute() {
        return 1;
      }
      `,
      {
        code: `
        function localHelper() {}
        export function apiHandler() {
          return localHelper();
        }
        `,
        options: [{ exportPlacement: 'bottom' }],
      },
      {
        code: `
        export function topExport() {}
        function secondary() {}
        `,
        options: [{ exportPlacement: 'top' }],
      },
      {
        // Group order still governs functions with no call relationship: with
        // utilities-first, the independent utility precedes the independent
        // handler.
        code: `
        const buildQuery = () => {};
        const handleAction = () => ({});
        `,
        options: [
          {
            groupOrder: ['utilities', 'event-handlers', 'other'],
          },
        ],
      },
      {
        // Diamond call graph in its natural callers-first order: the caller
        // fans out to two independent helper chains, each grouped beneath it.
        // Verb prefixes (compute/fetch = "utilities", bucket/tally/find =
        // "other") must NOT reorder the chains.
        name: 'diamond call graph in natural callers-first order with grouped helper chains',
        code: `
        export async function computeGithubActivity(login: string) {
          const titles = await fetchIssueActivity(login);
          const closers = await fetchIssuesClosedByActor(login);
          return { titles, closers };
        }

        async function fetchIssueActivity(login: string) {
          const pages = [[login]];
          return bucketTitles(pages.flat());
        }

        function bucketTitles(titles: string[]) {
          return titles.map((title) => title.toUpperCase());
        }

        async function fetchIssuesClosedByActor(login: string) {
          const pages = [[login]];
          return pages.map((page) => tallyClosersFromPage(page));
        }

        function tallyClosersFromPage(page: string[]) {
          return findLatestInWindowCloser(page);
        }

        function findLatestInWindowCloser(page: string[]) {
          return page[page.length - 1];
        }
        `,
      },
      `
      const onClose = () => {
        console.log('close');
      };

      const formatData = () => {
        return fetchData();
      };

      const fetchData = () => {
        return api.get('x');
      };
      `,
      {
        code: `
        function outer() {
          function inner() {
            return 'inner';
          }
          return inner();
        }
        function sibling() {
          return outer();
        }
        `,
        options: [{ dependencyDirection: 'callees-first' }],
      },
      `
      const fetchData = () => api.get('/data');
      addEventListener('click', () => {
        console.log(fetchData);
      });
      `,
      {
        // A sibling declarator widens what the rule can SEE, not what it
        // complains about: a helper already sitting below its caller is
        // correctly ordered whether or not it shares a statement.
        name: 'correctly ordered helper sharing a statement with a sibling binding',
        code: `
        const handleClick = () => helper() + offset;
        const helper = () => 1, offset = 2;
        `,
      },
      {
        name: 'correctly ordered helper declared after its sibling binding',
        code: `
        const handleClick = () => helper() + offset;
        const offset = 2, helper = () => 1;
        `,
      },
      {
        // A multi-declarator statement holding no function-like initializer is
        // an interleaved value declaration, not a function.
        name: 'multi-declarator statement with no function initializer',
        code: `
        const handleClick = () => helper() + offset;
        const offset = 2, scale = 3;
        const helper = () => scale;
        `,
      },
      {
        // A destructuring sibling is skipped while the function-like declarator
        // beside it is still found.
        name: 'correctly ordered helper sharing a statement with a destructuring sibling',
        code: `
        export const handleClick = () => helper();
        const { base } = config, helper = () => base;
        `,
      },
      {
        // Transitive chain whose leaf helper (runCommand) is shared by a second
        // caller chain. Every caller already sits above every helper it invokes
        // and the shared primitive sits last, below all its callers — a layout
        // that satisfies callers-first for every edge. The greedy DFS used to
        // inline the shared leaf under its first caller and then flag this,
        // instructing a move that violates its own stated principle.
        name: 'transitive chain with shared leaf helper: every caller already above its helpers, shared primitive last',
        filename: 'scripts/cli/git-utils.ts',
        code: `
        import { execSync } from 'node:child_process';

        export function ensureDependency(tool: string) {
          runCommand(\`command -v \${tool}\`, true);
        }

        export function ensureGhScopes(
          requiredScopes: readonly string[] = ['workflow'],
        ) {
          const grantedScopes = fetchGhScopes();
          const missing = requiredScopes.filter(
            (scope) => !grantedScopes.includes(scope),
          );
          if (missing.length > 0) {
            console.error(\`Missing: \${missing.join(', ')}\`);
            process.exit(1);
          }
        }

        function fetchGhScopes() {
          const output = runCommand('gh auth status', true);
          const scopesLine = output
            .split('\\n')
            .find((line) => line.includes('Token scopes:'));
          if (!scopesLine) {
            return [];
          }
          return [...scopesLine.matchAll(/'([^']+)'/g)].map((match) => match[1]);
        }

        export function runCommand(command: string, suppressOutput = false) {
          const result = execSync(command, {
            encoding: 'utf8',
            stdio: suppressOutput ? 'pipe' : 'inherit',
          });
          return result.trim();
        }
        `,
      },
    ],
    invalid: [
      // A shebang is only a shebang at character 0. ESLint presents it as a
      // leading comment of the first statement, so relocating that statement
      // used to carry `#!` into the middle of the file, where the output no
      // longer parses (TS18026).
      {
        code: `#!/usr/bin/env node
function fetchData() {
  return api.get('/data');
}

function handleClick() {
  processUserInput(userInput);
}

function processUserInput(input) {
  return sanitize(input);
}
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `#!/usr/bin/env node
function handleClick() {
  processUserInput(userInput);
}

function processUserInput(input) {
  return sanitize(input);
}

function fetchData() {
  return api.get('/data');
}
`,
      },
      {
        code: `
        function fetchData() {
          return api.get('/data');
        }

        function processUserInput(input) {
          return sanitize(input);
        }

        function transformData(data) {
          return data.map((item) => item.value);
        }

        function handleClick() {
          processUserInput(userInput);
        }
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        function handleClick() {
          processUserInput(userInput);
        }

function processUserInput(input) {
          return sanitize(input);
        }

function fetchData() {
          return api.get('/data');
        }

function transformData(data) {
          return data.map((item) => item.value);
        }
        `,
      },
      {
        code: `
        function helper() {
          return 'h';
        }
        function main() {
          return helper();
        }
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        function main() {
          return helper();
        }

function helper() {
          return 'h';
        }
        `,
      },
      {
        code: `
        const helper = () => 1;
        const handleClick = () => helper();
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        const handleClick = () => helper();

const helper = () => 1;
        `,
      },
      {
        // A sibling declarator must not hide the misorder. Relocating `helper`
        // means splitting the declaration and dragging `offset` along, so the
        // autofix is declined — but the violation is still reported.
        name: 'function declared alongside a sibling binding, subject first',
        code: `
        const helper = () => 1, offset = 2;
        const handleClick = () => helper() + offset;
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: null,
      },
      {
        // Mirror of the case above with the sibling declared FIRST: the
        // function-holding declarator is not `declarations[0]`.
        name: 'function declared alongside a sibling binding, subject second',
        code: `
        const offset = 2, helper = () => 1;
        const handleClick = () => helper() + offset;
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: null,
      },
      {
        // Only the FIRST function-like declarator of a statement enters the
        // inventory, so `format` stays invisible while `compute` is ordered
        // against the handler by group order. The fix is still declined.
        name: 'statement declaring two function-like bindings',
        code: `
        const compute = () => 1, format = () => 2;
        const handleClick = () => format();
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: null,
      },
      {
        // An exported declaration reaches the same extractor, so a sibling
        // binding hides the misorder there too.
        name: 'exported function declared after a sibling binding',
        code: `
        export const offset = 2, helper = () => 1;
        export const handleClick = () => helper() + offset;
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: null,
      },
      {
        // A multi-declarator function anywhere in the block withholds the fix
        // for every function, since the reorder rewrites the whole region.
        name: 'multi-declarator function suppresses the fix for its neighbours',
        code: `
        function helper() {
          return 1;
        }
        const onReady = () => helper(), ready = true;
        function main() {
          return helper() && ready;
        }
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: null,
      },
      {
        code: `
        function utility() {}
        function onSubmit() {
          return utility();
        }
        `,
        options: [{ groupOrder: ['event-handlers', 'other', 'utilities'] }],
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        function onSubmit() {
          return utility();
        }

function utility() {}
        `,
      },
      {
        code: `
        function handleClick() {
          return transform();
        }
        function transform() {}
        function onClose() {}
        `,
        options: [{ dependencyDirection: 'callees-first' }],
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        function transform() {}

function handleClick() {
          return transform();
        }

function onClose() {}
        `,
      },
      {
        code: `
        function secondary() {
          return 1;
        }
        function helper() {
          return secondary();
        }
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        function helper() {
          return secondary();
        }

function secondary() {
          return 1;
        }
        `,
      },
      {
        code: `
        function alpha() {}
        function beta() {
          return alpha();
        }
        function onClick() {
          return beta();
        }
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        function onClick() {
          return beta();
        }

function beta() {
          return alpha();
        }

function alpha() {}
        `,
      },
      {
        code: `
        export function exportedHandler() {}
        function localHelper() {}
        `,
        options: [{ exportPlacement: 'bottom' }],
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        function localHelper() {}

export function exportedHandler() {}
        `,
      },
      {
        code: `
        function localHelper() {}
        export function exportedHandler() {}
        `,
        options: [{ exportPlacement: 'top' }],
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        export function exportedHandler() {}

function localHelper() {}
        `,
      },
      {
        code: `
        const helper = () => {};
        const buildThing = () => helper();
        `,
        options: [{ groupOrder: ['event-handlers', 'utilities', 'other'] }],
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        const buildThing = () => helper();

const helper = () => {};
        `,
      },
      {
        code: `
        export default function entry() {}
        function setup() {}
        `,
        options: [{ exportPlacement: 'bottom' }],
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        function setup() {}

export default function entry() {}
        `,
      },
      {
        code: `
        const format = () => {
          return handleSave();
        };
        const handleSave = () => format();
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        const handleSave = () => format();

const format = () => {
          return handleSave();
        };
        `,
      },
      {
        code: `
        const util = () => doWork();
        function doWork() {}
        function onEvent() {}
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        function onEvent() {}

const util = () => doWork();

function doWork() {}
        `,
      },
      {
        code: `
        function helper() {}
        // helper comment
        function main() {
          return helper();
        }
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        // helper comment
        function main() {
          return helper();
        }

function helper() {}
        `,
      },
      {
        code: `
        const helper = () => {};
        const handleClick = () => helper();
        `,
        options: [
          {
            eventHandlerPattern: '(.+)+',
            utilityPattern: '(.*)+\\1',
          },
        ],
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        const handleClick = () => helper();

const helper = () => {};
        `,
      },
      {
        // Dependency now overrides group order: even with utilities-first, a
        // caller must sit above the helper it invokes (previously group order
        // wrongly kept the utility on top, contradicting callers-first).
        code: `
        const buildQuery = () => {};
        const handleAction = () => buildQuery();
        `,
        options: [
          {
            groupOrder: ['utilities', 'event-handlers', 'other'],
          },
        ],
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        const handleAction = () => buildQuery();

const buildQuery = () => {};
        `,
      },
      {
        // Misordered diamond (helpers above their caller) converges to the
        // natural callers-first order in a single fix.
        code: `
        function bucketTitles(titles: string[]) {
          return titles;
        }
        function fetchIssueActivity(login: string) {
          return bucketTitles([login]);
        }
        export function computeGithubActivity(login: string) {
          return fetchIssueActivity(login);
        }
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        export function computeGithubActivity(login: string) {
          return fetchIssueActivity(login);
        }

function fetchIssueActivity(login: string) {
          return bucketTitles([login]);
        }

function bucketTitles(titles: string[]) {
          return titles;
        }
        `,
      },
      {
        // Fixer reorders functions in place around interleaved non-function
        // statements (a const, here) instead of bailing.
        code: `
        function helper() {
          return OFFSET;
        }
        const OFFSET = 2;
        function main() {
          return helper();
        }
        `,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
        function main() {
          return helper();
        }
        const OFFSET = 2;
        function helper() {
          return OFFSET;
        }
        `,
      },
      {
        // Interleaved non-function statement (const) forces the in-place
        // reorder branch; each function's leading JSDoc must travel with it.
        code: `
/**
 * DOC-FOR-HELPER: returns OFFSET doubled.
 */
function helper() {
  return OFFSET * 2;
}

const OFFSET = 2;

/**
 * DOC-FOR-MAIN: entry point, calls helper.
 */
function main() {
  return helper();
}
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
/**
 * DOC-FOR-MAIN: entry point, calls helper.
 */
function main() {
  return helper();
}

const OFFSET = 2;

/**
 * DOC-FOR-HELPER: returns OFFSET doubled.
 */
function helper() {
  return OFFSET * 2;
}
`,
      },
      {
        // Three functions interleaved with non-function statements (a const and
        // a type alias), each carrying a distinguishing leading comment. The
        // fully-reversed source order forces an N-way rotation across the
        // function slots; every leading comment must rotate together with the
        // function it documents (no orphaned or duplicated comment).
        code: `
// DOC-FOR-LEAF: reads VALUE.
function leaf() {
  return VALUE;
}

const VALUE = 1;

// DOC-FOR-MIDDLE: calls leaf.
function middle() {
  return leaf();
}

type Marker = string;

// DOC-FOR-ENTRY: calls middle.
function entry(): Marker {
  return middle();
}
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
// DOC-FOR-ENTRY: calls middle.
function entry(): Marker {
  return middle();
}

const VALUE = 1;

// DOC-FOR-MIDDLE: calls leaf.
function middle() {
  return leaf();
}

type Marker = string;

// DOC-FOR-LEAF: reads VALUE.
function leaf() {
  return VALUE;
}
`,
      },
      {
        // The interleaved statement carries its OWN own-line leading comment.
        // Reordering the functions around it must leave that comment attached
        // to the const it documents — it must not be swallowed into the
        // trailing range of the function above and dragged away.
        code: `
function helper() {
  return OFFSET * 2;
}

// comment describing OFFSET
const OFFSET = 2;

function main() {
  return helper();
}
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
function main() {
  return helper();
}

// comment describing OFFSET
const OFFSET = 2;

function helper() {
  return OFFSET * 2;
}
`,
      },
      {
        // A preceding interleaved statement carries a SAME-LINE trailing
        // comment. That comment belongs to the const, not to the function
        // beneath it, so it must stay with the const rather than travel down
        // as part of the relocated function's leading block.
        code: `
const OFFSET = 2; // offset value
function helper() {
  return OFFSET * 2;
}
function main() {
  return helper();
}
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
const OFFSET = 2; // offset value
function main() {
  return helper();
}

function helper() {
  return OFFSET * 2;
}
`,
      },
    ],
  },
);

ruleTesterJsx.run(
  'vertically-group-related-functions (hoist-above-dependency guard)',
  verticallyGroupRelatedFunctions,
  {
    valid: [],
    invalid: [
      {
        // The component references an interleaved `type` and `const` that sit
        // between it and its helper. Callers-first ordering wants the component
        // above the helper, but the only reachable reorder (the interleaved-
        // statement slot swap) would hoist the component ABOVE the `const
        // DEFAULT_LABEL` it uses as a default-parameter value — a fresh
        // declare-before-use. The misorder is still reported, but the harmful
        // autofix must be declined (output === input).
        code: `
import { FC } from 'react';

const findSlideAncestor = (element: HTMLElement | null) => {
  let parent = element?.parentElement ?? null;
  while (parent) {
    if (parent.className.includes('slide')) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
};

type WidgetProps = { label: string };

const DEFAULT_LABEL = 'hello' as const;

const WidgetUnmemoized: FC<WidgetProps> = ({ label = DEFAULT_LABEL }) => {
  findSlideAncestor(null);
  return <span>{label}</span>;
};

export const Widget = WidgetUnmemoized;
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: null,
      },
      {
        // Guard must not over-trigger: the interleaved `const UNRELATED` is not
        // referenced by the hoisted component, so the normal callers-first
        // reorder still applies (component above helper, interleaved const
        // pinned).
        code: `
const findSlideAncestor = (element: HTMLElement | null) => {
  return element;
};

const UNRELATED = 1;

const WidgetUnmemoized = () => {
  findSlideAncestor(null);
  return null;
};
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
const WidgetUnmemoized = () => {
  findSlideAncestor(null);
  return null;
};

const UNRELATED = 1;

const findSlideAncestor = (element: HTMLElement | null) => {
  return element;
};
`,
      },
      {
        // Value-only dependency: the component references an interleaved const
        // purely as a default-parameter value (no type reference). Hoisting it
        // above `CONFIG_DEFAULT` is a declare-before-use, so the fix is declined.
        code: `
const helper = () => {
  return 1;
};

const CONFIG_DEFAULT = 5;

const useThing = ({ value = CONFIG_DEFAULT } = {}) => {
  helper();
  return value;
};
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: null,
      },
      {
        // Type-only dependency: the component references an interleaved `type`
        // alias and nothing else across the boundary. TypeScript hoists type
        // aliases, so placing the component above `PanelProps` is legal and the
        // normal reorder still applies.
        code: `
const findAncestor = (element: HTMLElement | null) => {
  return element;
};

type PanelProps = { open: boolean };

const PanelUnmemoized = (props: PanelProps) => {
  findAncestor(null);
  return null;
};
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
const PanelUnmemoized = (props: PanelProps) => {
  findAncestor(null);
  return null;
};

type PanelProps = { open: boolean };

const findAncestor = (element: HTMLElement | null) => {
  return element;
};
`,
      },
      {
        // Type dependency via the const's OWN binding annotation
        // (`const C: FC<PanelProps> = ...`) — unlike the param-annotation case
        // above, this is exactly what prefer-type-alias-over-typeof-constant's
        // defineTypeBeforeConstant fires on. Hoisting the component above
        // `type PanelProps` would trade the misorder for that cross-rule
        // violation, so the autofix is declined.
        code: `
import { FC } from 'react';

const findAncestor = (element: HTMLElement | null) => {
  return element;
};

type PanelProps = { open: boolean };

const PanelUnmemoized: FC<PanelProps> = ({ open }) => {
  findAncestor(null);
  return open ? null : null;
};

export const Panel = PanelUnmemoized;
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: null,
      },
      {
        // Exported interleaved `type` alias, and an EXPORTED annotated const that
        // references it (`export const beta: FC<Marker>`). `beta` reorders to sit
        // directly BELOW `export type Marker`, so its annotation dependency stays
        // declared-before-use and the guard must NOT bail — the reorder applies.
        // Exercises the exported-type-alias branches: the alias is tracked as an
        // interleaved constraint AND marked declared as the walk passes it, and
        // the annotation is read through the ExportNamedDeclaration wrapper.
        code: `
import { FC } from 'react';

const alpha: FC = () => {
  return beta();
};

export type Marker = { id: string };

const gamma = () => {
  return 1;
};

export const beta: FC<Marker> = () => {
  gamma();
  return null;
};
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
import { FC } from 'react';

const alpha: FC = () => {
  return beta();
};

export type Marker = { id: string };

export const beta: FC<Marker> = () => {
  gamma();
  return null;
};

const gamma = () => {
  return 1;
};
`,
      },
      {
        // The referencing function stays BELOW the interleaved const it uses in
        // both the old and new order, so there is no hoist-above-dependency and
        // the reorder applies. `beta` references `SHARED` and remains beneath it
        // after `beta`/`gamma` swap slots.
        code: `
const alpha = () => {
  return beta();
};

const SHARED = 3;

const gamma = () => {
  return 1;
};

const beta = () => {
  return SHARED + gamma();
};
`,
        errors: [{ messageId: 'misorderedFunction' }],
        output: `
const alpha = () => {
  return beta();
};

const SHARED = 3;

const beta = () => {
  return SHARED + gamma();
};

const gamma = () => {
  return 1;
};
`,
      },
    ],
  },
);

afterAll(() => {
  expect(consoleWarnSpy).toHaveBeenCalled();
  consoleWarnSpy.mockRestore();
});
