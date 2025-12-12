# Enforce verb phrases for functions and methods (`@blumintinc/blumint/enforce-verb-noun-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Function names should communicate actions. Noun-only names hide intent (`data()` vs `fetchData()`) and make call sites harder to read. This rule requires functions and methods to start with a verb (or preposition phrase such as `with`/`to`) so names read as commands like “fetchData”, “buildQuery”, or “withRetry”.

## Rule Details

This rule reports when:

- A function declaration, function expression, or arrow function assigned to a variable does not start with a verb.
- A class/obj method (except constructors and getters) does not start with a verb.
- The rule uses a curated verb list plus NLP (`compromise`) to recognize verb phrases and allows prepositions like `to`, `from`, `with`, `by`, `of`, `at` for helper patterns (`withTracing`, `toJson`).

The rule skips:

- React components (detected by PascalCase names plus JSX returns/props), because components read as nouns.
- Getters, which should be noun phrases.

### Examples of **incorrect** code for this rule:

```ts
function dataLoader() { /* ... */ }
const user = () => fetchUser();          // name is noun-only
class Repo {
  items() { return this.cache; }         // method lacks verb
  handle() {}                            // ambiguous noun
}
```

### Examples of **correct** code for this rule:

```ts
function fetchData() { /* ... */ }
const buildUser = () => fetchUser();
const withRetry = (fn: () => Promise<void>) => { /* ... */ };

class Repo {
  loadItems() { return this.cache; }
  updateCache() { /* ... */ }
  get items() { return this.cache; } // getter is allowed
}

// React components are allowed
const UserCard = ({ user }: { user: User }) => <Card>{user.name}</Card>;
```

## Options

This rule does not have any options.

## When Not To Use It

- Codebases that prefer noun-style function names (e.g., DSL-like APIs).
- Files that intentionally expose React components or values only—disable locally if necessary.

## Further Reading

- [Clean Code: Meaningful Names](https://learning.oreilly.com/library/view/clean-code/9780136083238/chapter02.html)
