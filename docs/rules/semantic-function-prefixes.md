# Enforce semantic function prefixes over generic ones like "get" and "update" (`@blumintinc/blumint/semantic-function-prefixes`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Generic prefixes such as `get`, `update`, `check`, `manage`, `process`, or `do` do not tell readers whether a function fetches remote data, transforms input, or mutates state. This rule requires more descriptive prefixes so call sites understand the operation and its side effects.

## Why this rule?

- Ambiguous verbs hide intent; `getUser` could fetch from the network, read cache, or compute derived state.
- Naming clarity signals side effects and performance costs, preventing misuse in render paths or memoization.
- Semantic verbs (`fetch`, `retrieve`, `validate`, `transform`, `apply`, etc.) make behaviors self-documenting and easier to review.

## How to fix

- Replace generic prefixes with verbs that reflect the operation, e.g. `get` → `fetch/retrieve/compute/derive`, `update` → `modify/set/apply`, `check` → `validate/assert/ensure`, `manage` → `control/coordinate/schedule`, `process` → `transform/sanitize/compute`.
- Keep boolean checks starting with `is` and Next.js data functions (`getServerSideProps`, `getStaticProps`, `getStaticPaths`) as-is; the rule already exempts them.
- Ensure the first word of PascalCase/camelCase names expresses the function's behavior rather than a placeholder verb.

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

No options are available for this rule.
