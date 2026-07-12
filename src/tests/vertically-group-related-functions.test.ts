// rule-request
import { ruleTesterTs } from '../utils/ruleTester';
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
    ],
    invalid: [
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
    ],
  },
);

afterAll(() => {
  expect(consoleWarnSpy).toHaveBeenCalled();
  consoleWarnSpy.mockRestore();
});
