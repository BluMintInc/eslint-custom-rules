# Disallow the generic "handler" suffix in callback names so names explain the action they perform (`@blumintinc/blumint/no-handler-suffix`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Rejects callback names that end with the generic `handler` suffix (e.g., `countCheckedInHandler`, `processPaymentHandler`). The suffix might hide what the function actually does, making call sites harder to scan.

## Rule Details

The rule inspects function declarations, function expressions, arrow functions assigned to variables or properties, and class members. It suggests action‑oriented names instead of ending with `Handler` or `Handlers`.

### Why this matters

- Generic `handler` names often force readers to open the implementation to learn what the callback does.
- Distinct, action‑focused names (e.g., `countCheckedInParticipants`, `processPaymentTransaction`) communicate intent at call sites.
- Keeping this rule alongside `consistent-callback-naming` covers both prefix and suffix conventions.

### Examples of **incorrect** code

```ts
// Generic suffix hides the outcome of the callback
const countCheckedInHandler: DocumentChangeHandler<ParticipantTeam> = async (
  event,
) => {
  const checkedInCount = event.data.after.data()?.members?.filter(
    (m) => m.isCheckedIn,
  ).length;
  await event.data.after.ref.set({ checkedInCount }, { merge: true });
};

const updateUserHandler = async (userId: string) => {};
const processPaymentHandler = async (payment: Payment) => {};
const validateInputHandler = (input: string) => {};
export default function handler(req: NextApiRequest, res: NextApiResponse) {}
```

Example message:

```text
Function "updateUserHandler" ends with the generic "Handler" suffix, which might hide what the function actually does. This rule is a suggestion; "handler" is sometimes the most descriptive term for generic callbacks. If this suffix is appropriate, please use an // eslint-disable-next-line @blumintinc/blumint/no-handler-suffix comment. Otherwise, consider renaming to describe the effect (e.g., "updateUser").
```

### Examples of **correct** code

```ts
// Descriptive names explain the action without opening the implementation
const countCheckedInParticipants: DocumentChangeHandler<ParticipantTeam> =
  async (event) => {
    const checkedInCount = event.data.after.data()?.members?.filter(
      (m) => m.isCheckedIn,
    ).length;
    await event.data.after.ref.set({ checkedInCount }, { merge: true });
  };

const updateUserProfile = async (userId: string) => {};
const processPaymentTransaction = async (payment: Payment) => {};
const validateUserInput = (input: string) => {};
```

### ✅ Correct (With disable comment if "handler" is intentional)

```ts
// eslint-disable-next-line @blumintinc/blumint/no-handler-suffix
const resultHandler = (result) => { /* ... */ };
```

## Options

```json
{
  "ignoreClassMethods": false,
  "ignoreInterfaceImplementations": false,
  "interfaceAllowlist": [],
  "allowNames": [],
  "allowPatterns": [],
  "allowFilePatterns": []
}
```

- `ignoreClassMethods` (boolean): Skip class methods and class fields when set to `true`.
- `ignoreInterfaceImplementations` (boolean): Skip names that appear on classes implementing any interface or names typed with an interface/type alias (e.g., `const fn: EventHandler = ...`).
- `interfaceAllowlist` (string[]): Skip when the class implements, or the identifier is annotated with, a listed interface name. Useful when external contracts require a `handler` name.
- `allowNames` (string[]): Explicit name allowlist (e.g., `["errorBoundaryHandler"]`).
- `allowPatterns` (string[]): Regex allowlist applied to the full name (e.g., `["BoundaryHandler$"]`). Patterns must compile and avoid nested quantifiers (e.g., `(a+)+`) to prevent ReDoS; invalid or unsafe patterns throw during lint startup.
- `allowFilePatterns` (string[]): Glob patterns (minimatch syntax) for paths to ignore, e.g., `["**/pages/api/**"]` for Next.js API route defaults.

### Configured examples

```json
{
  "rules": {
    "@blumintinc/blumint/no-handler-suffix": [
      "error",
      {
        "ignoreClassMethods": true,
        "allowFilePatterns": ["**/pages/api/**"],
        "interfaceAllowlist": ["ExternalHandler"],
        "allowPatterns": ["BoundaryHandler$"]
      }
    ]
  }
}
```

With this configuration:

- `class Emitter { eventHandler() {} }` is ignored (class methods skipped).
- `export default function handler()` under `pages/api/` is ignored by path.
- `class Foo implements ExternalHandler { onEventHandler() {} }` is allowed due to the interface allowlist.
- `const errorBoundaryHandler = () => {};` is allowed by the regex allowlist.

## When Not To Use It

Disable or relax this rule if a framework or third‑party contract mandates the `handler` suffix everywhere and more descriptive aliases are not feasible, or if the suffix is the most accurate term for your callback. Use an `// eslint-disable-next-line @blumintinc/blumint/no-handler-suffix` comment for local exceptions.
