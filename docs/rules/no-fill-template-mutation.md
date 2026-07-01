# Disallow mutating the return value of fillTemplate() via string concatenation, template literals, or string method calls. The filled Algolia filter must be used verbatim so matchesTemplate() can regex-match it; post-fill modification silently breaks realtime hash parity (`@blumintinc/blumint/no-fill-template-mutation`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

The `fillTemplate()` function from `algoliaRealtime/fillTemplate` fills placeholders in Algolia filter templates. The entire Algolia realtime system — preemption path resolution, realtime hash computation, and template matching via `matchesTemplate()` — depends on the filled filter being used verbatim.

`matchesTemplate()` converts templates into `^...$`-anchored regex patterns. Any extra clause appended after `fillTemplate()` causes the regex match to fail silently (it returns `false`, not an error), causing stale data on the frontend with no visible error message.

This rule prevents all post-fill string operations: concatenation, template-literal wrapping with extra content, and string method calls such as `.replace()`, `.concat()`, `.trim()`, etc.

## Rule Details

Only calls imported from a path ending in `algoliaRealtime/fillTemplate` are tracked. The unrelated marketing `fillTemplate` at `src/pages/api/marketing/fillTemplate.ts` is never flagged.

The rule tracks:

- Direct calls: `fillTemplate(...)`
- Aliased imports: `import { fillTemplate as fill }` — `fill(...)` is tracked
- Namespace imports: `import * as ft` — `ft.fillTemplate(...)` is tracked
- Variables assigned from `fillTemplate()`: `const f = fillTemplate(...)` — `f` is tracked

The rule flags:

- Binary `+` concatenation involving a filled value
- Compound assignment `+=` on a filled variable
- Reassignment `filter = filter + ...` or `filter = \`${filter}...\``
- Template literals that interpolate a filled value AND contain additional text or expressions (a bare `` `${f}` `` with no extra content is allowed)
- String method calls (`.replace()`, `.replaceAll()`, `.trim()`, `.toLowerCase()`, `.concat()`, `.slice()`, etc.) on a filled value
- `.join()` on an array literal containing a filled value

The rule intentionally does **not** cross function boundaries. If you pass `filter` to `processFilter(filter)`, what `processFilter` does internally is out of scope.

### How to fix

Instead of appending conditions after `fillTemplate()`, bake all conditions into a new template variant in `REALTIME_PREEMPTIVE_FILTER_TEMPLATES` or `PREEMPTIVE_FILTER_TEMPLATES` and select the right template before calling `fillTemplate()`.

Examples of **incorrect** code for this rule:

```typescript
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';

// Appending via template literal
const baseFilter = fillTemplate({ template, placeholderValue: tournamentId });
if (isContinuousRegistration) {
  return `${baseFilter} AND canBePromoted: true`; // flagged
}

// Appending via binary concatenation
const filter = fillTemplate({ template, placeholderValue: id });
return filter + ' AND status: active'; // flagged

// Compound assignment
let filter = fillTemplate({ template, placeholderValue: id });
filter += ' AND isPublic: true'; // flagged

// String method call
const filter = fillTemplate({ template, placeholderValue: id });
return filter.replace('accepted', 'pending'); // flagged
```

Examples of **correct** code for this rule:

```typescript
import { fillTemplate } from 'functions/src/util/algoliaRealtime/fillTemplate';

// Return unmodified
return fillTemplate({ template: PREEMPTIVE_FILTER_TEMPLATES[key], placeholderValue: id });

// Store and return unmodified
const filter = fillTemplate({ template, placeholderValue: id });
return filter;

// Pass to another function unmodified
const hash = convertToHash(fillTemplate({ template, placeholderValue: uid }));

// Conditions baked into template selection (the correct fix pattern)
const templateKey = deriveTeamKey({ roundsStatus, isContinuousRegistration });
return fillTemplate({
  template: PREEMPTIVE_FILTER_TEMPLATES[templateKey],
  placeholderValue: tournamentId,
});

// Logging is safe — console output is not used as a filter value
const filter = fillTemplate({ template, placeholderValue: id });
console.log(`Filter: ${filter}`);
return filter;
```

## When to disable

This rule should never be disabled. The template-as-source-of-truth contract is absolute: any post-fill modification silently breaks `matchesTemplate()` and causes stale realtime data without a runtime error.
