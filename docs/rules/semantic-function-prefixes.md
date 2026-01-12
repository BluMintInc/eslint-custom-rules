# Require semantic function prefixes instead of generic verbs so callers know whether a function fetches data, transforms input, or mutates state (`@blumintinc/blumint/semantic-function-prefixes`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Generic prefixes such as `get`, `update`, `check`, `manage`, `process`, or `do` do not tell readers whether a function fetches remote data, transforms input, or mutates state. This rule suggests more descriptive prefixes so call sites understand the operation and its side effects.

## Why this rule?

- Ambiguous verbs hide intent; `getUser` could fetch from the network, read cache, or compute derived state.
- Naming clarity signals side effects and performance costs, preventing misuse in render paths or memoization.
- Semantic verbs (`fetch`, `retrieve`, `validate`, `transform`, `apply`, etc.) make behaviors self-documenting and easier to review.

## How to fix

- Replace generic prefixes with verbs that reflect the operation, e.g. `get` → `fetch/retrieve/compute/derive`, `update` → `modify/set/apply`, `check` → `validate/assert/ensure`, `manage` → `control/coordinate/schedule`, `process` → `transform/sanitize/compute`.
- Keep boolean checks starting with `is` and Next.js data functions (`getServerSideProps`, `getStaticProps`, `getStaticPaths`) as-is; the rule already exempts them.
- Ensure the first word of PascalCase/camelCase names expresses the function's behavior rather than a placeholder verb.
- If the generic prefix is the most accurate verb for your context, use an `// eslint-disable-next-line @blumintinc/blumint/semantic-function-prefixes` comment.

## Examples

### ✅ Correct

```ts
function fetchUserProfile() {}
const retrieveSettings = () => {}
class FormService {
  validateInput() {}
  transformPayload() {}
}
```

### ❌ Incorrect

```ts
function getUserProfile() {}
const updateSettings = () => {}
class FormService {
  processPayload() {}
}
```

Example message:

```text
Function "getUserProfile" uses the generic prefix "get", which might hide its intent. This rule is a suggestion and may flag prefixes that are appropriate for your specific context. If "get" is the most accurate verb, please use an // eslint-disable-next-line @blumintinc/blumint/semantic-function-prefixes comment. Otherwise, consider a more semantic alternative like fetch, retrieve, compute, derive to better describe if it fetches data, transforms input, or mutates state.
```

### ✅ Correct (With disable comment if generic prefix is intentional)

```ts
// eslint-disable-next-line @blumintinc/blumint/semantic-function-prefixes
function get(key: string) {
  return cache.get(key);
}
```

### ✅ Exempt patterns

```ts
export async function getServerSideProps() {
  return { props: {} };
}

function isUserLoggedIn() {}

class Page {
  static getStaticProps() {
    return { props: {} };
  }
}
```
