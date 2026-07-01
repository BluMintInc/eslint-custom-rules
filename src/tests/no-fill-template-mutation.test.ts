import { ruleTesterTs } from '../utils/ruleTester';
import { noFillTemplateMutation } from '../rules/no-fill-template-mutation';

const ERROR = [{ messageId: 'noFillTemplateMutation' as const }];

ruleTesterTs.run('no-fill-template-mutation', noFillTemplateMutation, {
  valid: [
    // --------------------------------------------------------------------- //
    // 1. Direct return of fillTemplate() — no mutation
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function teamFilters({ id }) {
  return fillTemplate({ template: 'tpl', placeholderValue: id });
}
`,
    },

    // --------------------------------------------------------------------- //
    // 2. Store in variable and return unmodified
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id }) {
  const filter = fillTemplate({ template: 'tpl', placeholderValue: id });
  return filter;
}
`,
    },

    // --------------------------------------------------------------------- //
    // 3. Pass filled value unmodified to another function
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id }) {
  const filter = fillTemplate({ template: 'tpl', placeholderValue: id });
  return convertToHash(filter);
}
`,
    },

    // --------------------------------------------------------------------- //
    // 4. Pass inline fillTemplate() result directly to a function
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id }) {
  return convertToHash(fillTemplate({ template: 'tpl', placeholderValue: id }));
}
`,
    },

    // --------------------------------------------------------------------- //
    // 5. fillTemplate result used as object property value — allowed
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id }) {
  const filter = fillTemplate({ template: 'tpl', placeholderValue: id });
  return { filter };
}
`,
    },

    // --------------------------------------------------------------------- //
    // 6. Bare template literal wrap — `\${f}` with no extra text (non-mutating)
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id }) {
  const filter = fillTemplate({ template: 'tpl', placeholderValue: id });
  return \`\${filter}\`;
}
`,
    },

    // --------------------------------------------------------------------- //
    // 7. String concatenation on completely unrelated strings — not flagged
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f() {
  const a = 'hello';
  const b = 'world';
  return a + ' ' + b;
}
`,
    },

    // --------------------------------------------------------------------- //
    // 8. File that doesn't import fillTemplate at all — never flagged
    // --------------------------------------------------------------------- //
    {
      code: `
const base = someOtherFunction({ template: 'tpl' });
const extended = base + ' AND extra: true';
`,
    },

    // --------------------------------------------------------------------- //
    // 9. Marketing fillTemplate (different module) — never flagged
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'src/pages/api/marketing/fillTemplate';
function f(data) {
  const result = fillTemplate(data);
  return result + ' -- promotional';
}
`,
    },

    // --------------------------------------------------------------------- //
    // 10. Ternary choosing between two unmodified fillTemplate calls — allowed
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, condition, templateA, templateB }) {
  const filter = condition
    ? fillTemplate({ template: templateA, placeholderValue: id })
    : fillTemplate({ template: templateB, placeholderValue: id });
  return filter;
}
`,
    },

    // --------------------------------------------------------------------- //
    // 11. Comparison / conditional on the result — allowed
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, expected, template }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  if (filter === expected) {
    return true;
  }
  return false;
}
`,
    },

    // --------------------------------------------------------------------- //
    // 12. Array.map collecting filled values without joining — allowed
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f(keys, id) {
  const filters = keys.map((key) =>
    fillTemplate({ template: key, placeholderValue: id })
  );
  filters.forEach((f) => registerFilter(f));
}
`,
    },

    // --------------------------------------------------------------------- //
    // 13. Using filled value in console.log template literal — logging is safe
    //     (console.log output is not used as a filter value)
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  console.log(\`Filter: \${filter}\`);
  return filter;
}
`,
    },

    // --------------------------------------------------------------------- //
    // 14. Aliased import used unmodified — allowed
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate as fill } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = fill({ template, placeholderValue: id });
  return filter;
}
`,
    },

    // --------------------------------------------------------------------- //
    // 15. Namespace import used unmodified — allowed
    // --------------------------------------------------------------------- //
    {
      code: `
import * as ft from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = ft.fillTemplate({ template, placeholderValue: id });
  return filter;
}
`,
    },
  ],

  invalid: [
    // --------------------------------------------------------------------- //
    // 1. Original bug: template literal with extra clause on stored variable
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function teamFilters({ tournamentId, isContinuousRegistration, template }) {
  const baseFilter = fillTemplate({ template, placeholderValue: tournamentId });
  if (isContinuousRegistration) {
    return \`\${baseFilter} AND canBePromoted: true\`;
  }
  return baseFilter;
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 2. Binary + concatenation: stored variable on the left
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  return filter + ' AND status: active';
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 3. Binary + concatenation: stored variable on the right
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  return 'prefix ' + filter;
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 4. Compound assignment +=
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  let filter = fillTemplate({ template, placeholderValue: id });
  filter += ' AND isPublic: true';
  return filter;
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 5. Reassignment: filter = filter + '...'
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  let filter = fillTemplate({ template, placeholderValue: id });
  filter = filter + ' AND extra: true';
  return filter;
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 6. Reassignment: filter = \`\${filter}...\`
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  let filter = fillTemplate({ template, placeholderValue: id });
  filter = \`\${filter} AND extra: true\`;
  return filter;
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 7. Direct inline template literal mutation of fillTemplate() call
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  return \`\${fillTemplate({ template, placeholderValue: id })} AND online: true\`;
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 8. Direct inline binary + on fillTemplate() call
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  return fillTemplate({ template, placeholderValue: id }) + ' AND extra';
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 9. Aliased import — mutation is still detected
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate as fill } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = fill({ template, placeholderValue: id });
  return \`\${filter} AND extra: true\`;
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 10. Namespace import — mutation detected
    // --------------------------------------------------------------------- //
    {
      code: `
import * as ft from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = ft.fillTemplate({ template, placeholderValue: id });
  return filter + ' AND extra';
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 11. .concat() method call on stored variable
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  return filter.concat(' AND status: active');
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 12. .replace() method call on stored variable
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  return filter.replace('accepted', 'pending');
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 13. .trim() on stored variable
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  return filter.trim();
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 14. .toLowerCase() on stored variable
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  return filter.toLowerCase();
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 15. .replaceAll() on stored variable
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  return filter.replaceAll('true', 'false');
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 16. Ternary that appends to the filter in one branch
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template, condition }) {
  return condition
    ? fillTemplate({ template, placeholderValue: id }) + ' AND extra: true'
    : fillTemplate({ template, placeholderValue: id });
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 17. Short-circuit concatenation
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template, condition }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  return filter + (condition ? ' AND extra: true' : '');
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 18. Mutation before hashing (frontend pattern)
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ uid, template }) {
  const filter = fillTemplate({ template, placeholderValue: uid });
  return convertToHash(\`\${filter} AND online: true\`);
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 19. Array.join on array literal containing fillTemplate results
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, templateA, templateB }) {
  const filter1 = fillTemplate({ template: templateA, placeholderValue: id });
  return [filter1, 'globalCondition: true'].join(' OR ');
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 20. Direct .concat() on inline fillTemplate() call result
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  return fillTemplate({ template, placeholderValue: id }).concat(' AND extra');
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 21. Template literal with extra expression (two interpolations)
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template, extra }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  return \`\${filter} AND \${extra}\`;
}
`,
      errors: ERROR,
    },

    // --------------------------------------------------------------------- //
    // 22. .slice() on stored variable
    // --------------------------------------------------------------------- //
    {
      code: `
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';
function f({ id, template }) {
  const filter = fillTemplate({ template, placeholderValue: id });
  return filter.slice(2);
}
`,
      errors: ERROR,
    },
  ],
});
