# Enforce that sizable utility functions live in their own file rather than being co-located inside an entry-point or consumer file (`@blumintinc/blumint/prefer-utility-function-own-file`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule flags a module-level (top-level) function — declaration or arrow-const — when **all** of the following hold:

1. It is **sizable** (configurable; defaults: `minStatements: 8` or `minLines: 12`).
2. It is **utility-like**: not a React component (no JSX return), not a hook (`use*`), and not the file's primary/default export.
3. It is **co-located** in a file whose primary purpose is something else — the file has a distinct primary export (a callable `export default`, a React component, or another exported util).

When these conditions are met, the suggestion is to move the function to its own file (e.g. under `util/`) so it is discoverable and reusable.

### Files and functions that are never flagged

Some modules are cohesive by design, so the rule exempts them:

- **Test/spec files, `__mocks__/` directories, and `types/**` files** are exempt entirely.
- **CLI entry-point modules** are exempt entirely. A file is treated as a CLI entry point when it references `require.main` or top-level self-invokes one of its own functions (e.g. `void autoRunIfMain();`). Its `parse*`/`print*`/guard/compute helpers ARE the file's purpose — they are not foreign utilities.
- **Functions that close over module scope** are skipped while `ignoreClosures` is `true` (the default). This covers any top-level binding — including a `const` such as a registry array a finder reads (`DEVELOPER_REGISTRY.find(...)`) and sibling names referenced through destructuring defaults (`const { runner = runCli } = props`) — because such a function cannot move to its own file without also moving what it depends on.
- **Next.js reserved page exports** (`getServerSideProps`, `getStaticProps`, `getStaticPaths`, `middleware`, `config`) are exempt when they are top-level named exports of a file under a `pages/` directory (covers both `src/pages/**` and bare `pages/**`). Next.js only recognizes these when they are exported from the page file itself, so they categorically cannot be moved to a `util/` file and re-imported — the suggested remediation is impossible to follow. The exemption applies regardless of the export's size or closure geometry. It is scoped to those exact names *and* the `pages/` path segment, so a same-named function elsewhere (e.g. `src/util/helpers.ts`) is still flagged.

### Motivation

When an AI agent or a developer encapsulates logic into a utility function, the function is often defined in the same file where it first became needed instead of getting its own module. This:

- **Reduces discoverability** — a util buried inside a Cloud Function file won't be found by someone elsewhere who needs the same logic.
- **Reduces reuse** — co-located helpers are rarely imported from other places, leading to duplicate implementations.
- **Bloats entry-point files** — callables/components accrete unrelated pure logic, hurting separation of concerns.

Examples of this pattern: `assertCrewRolesExclusive` defined inside `modifyRoleMembers.f.ts` instead of `util/roles/assertCrewRolesExclusive.ts`.

## Examples

### Incorrect

```ts
// File: functions/src/callable/modifyRoleMembers.f.ts — Cloud Function entry-point file
// ✖ Spans more than `minLines` source lines, is pure, and is not the file's primary export
const assertCrewRolesExclusive = (roles, rolesExisting, context) => {
  const rolesToAdd = new Set(roles);
  const conflicts = [];
  for (const roleToAdd of roles) {
    const conflicting = MUTUALLY_EXCLUSIVE_CREW_ROLE[roleToAdd];
    if (!conflicting) continue;
    const members = rolesExisting[conflicting];
    const heldByMember = members && context.memberId in members;
    if (heldByMember || rolesToAdd.has(conflicting)) {
      conflicts.push(conflicting);
    }
  }
  if (conflicts.length > 0) {
    throw new HttpsError({ code: 'internal', message: '...' });
  }
  return rolesToAdd;
};

export default onCall(authenticatedOnly(modifyRoleMembers));
```

```ts
// File: functions/src/callable/someEntry.f.ts
// ✖ Eight body statements, so it clears `minStatements` on its own
function validatePayload(data, schema, options) {
  const result = schema.safeParse(data);
  const errors = [];
  if (!result.success) errors.push(...result.error.issues);
  const normalized = options.strict ? result : data;
  const validated = { ...normalized, timestamp: Date.now() };
  const final = JSON.stringify(validated);
  const checksum = createHash(final);
  return { validated, final, errors, checksum };
}

export default onCall(handler);
```

### Correct

```ts
// assertCrewRolesExclusive.ts — its own dedicated util file
export const assertCrewRolesExclusive = (roles, rolesExisting, context) => {
  // ...
};
```

```ts
// Small co-located helper under the size threshold — fine to keep inline
const toFieldPath = (role, id) => `roles.${role}.${id}`;
export default onCall(authenticatedOnly(modifyRoleMembers));
```

```tsx
// React components and hooks are never flagged
function UserCard() { return <div />; }
export default UserCard;
```

```ts
// The file's primary handler is never flagged
function modifyRoleMembers(data) {
  // ... 15+ statements
}
export default onCall(authenticatedOnly(modifyRoleMembers));
```

```tsx
// src/pages/stream-settings/index.tsx — Next.js reserved page exports are
// exempt: they must live in the page file, so they can never move to util/.
export function getServerSideProps(context) {
  // ... 12+ statements, pure — still exempt
}
export default StreamSettingsPage;
```

## Options

```jsonc
{
  "@blumintinc/blumint/prefer-utility-function-own-file": ["error", {
    "minStatements": 8,     // Flag functions with >= 8 body statements (default: 8)
    "minLines": 12,         // OR >= 12 source lines (default: 12)
    "ignoreClosures": true  // Skip functions referencing module-scoped bindings (default: true)
  }]
}
```

### `minStatements` (default: `8`)

The minimum number of statements in the function body for it to be considered "sizable." Functions below this threshold are never flagged, even if they exceed `minLines`.

### `minLines` (default: `12`)

The minimum number of source lines spanned by the function. A function is considered sizable if it meets **either** `minStatements` OR `minLines`.

### `ignoreClosures` (default: `true`)

When `true`, functions that reference module-scoped variables or sibling function names (not passed as parameters) are skipped. Such functions are not trivially extractable to their own file without also moving the referenced bindings.

Set to `false` to flag all sizable co-located utility functions, even those that close over module scope.

## Parameter lists are part of what a function references

A parameter list carries two different things, and both matter to the closure
checks above.

**A parameter default is a reference.** A default expression evaluates in the
enclosing scope, so a default naming a module-scoped binding captures it exactly
as a body reference does. Such a function closes over module scope and is
skipped under `ignoreClosures` — it cannot move to its own file without also
moving what its default names:

```ts
const runCli = () => 1;

// Skipped: the default captures the module-scoped `runCli`.
const formatReport = (input: string[], make = runCli) => {
  // ... 8+ statements
};
```

The same holds in the reverse direction. A sibling that consumes the candidate
as its own parameter default depends on it, so the candidate is the module's
shared internal primitive and stays where it is:

```ts
// Skipped: the sibling's default consumes `formatReport`.
export function primaryThing(fmt = formatReport) {
  return fmt;
}

const formatReport = (input: string[]) => {
  // ... 8+ statements
};
```

**A parameter name is a binding, not a reference.** A sibling parameter that
shadows the candidate's name introduces a different binding, so uses of that name
inside the sibling say nothing about the module-level function. The candidate is
still free-standing, so it is still flagged:

```ts
// Flagged: `formatReport` inside `primaryThing` is the parameter, not the
// module-level helper, so the file does not depend on the helper.
export function primaryThing(formatReport: (v: string) => string) {
  return formatReport('x');
}

const formatReport = (input: string[]) => {
  // ... 8+ statements
};
```

A function's own parameters read the same way: a default naming an earlier
parameter of the same function refers to that parameter, so it captures nothing
from module scope.

## When To Disable

Disable on a per-line basis with `// eslint-disable-next-line @blumintinc/blumint/prefer-utility-function-own-file` when:

- A helper is intentionally private to a single file and will never be reused.
- The helper is a performance-critical inner function that benefits from co-location.
- You are in a transitional migration and plan to extract it later.

## Related Rules

- [`prefer-utility-function-over-private-static`](./prefer-utility-function-over-private-static.md) — flags private static class methods that should be standalone utility functions.
- [`extract-global-constants`](./extract-global-constants.md) — flags constants that can be hoisted to module scope.
