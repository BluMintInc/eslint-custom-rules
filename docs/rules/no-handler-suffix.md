# Disallow the generic "handler" suffix in callback names so names explain the action they perform (`@blumintinc/blumint/no-handler-suffix`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Rejects callback names that end with the generic `handler` suffix (e.g., `countCheckedInHandler`, `processPaymentHandler`). The suffix hides what the function actually does, making call sites harder to scan and encouraging copy‑pasted naming across unrelated callbacks.

## Rule Details

The rule inspects function declarations, function expressions, arrow functions assigned to variables or properties, and class members. It reports when the name ends with `Handler` or `Handlers`, encouraging descriptive, action‑oriented names.

### Why this matters

- Generic `handler` names force readers to open the implementation to learn what the callback does, slowing code review and debugging.
- Distinct, action‑focused names (e.g., `countCheckedInParticipants`, `processPaymentTransaction`) communicate intent at call sites and reduce duplicate or incorrectly wired callbacks.
- Keeping this rule alongside `consistent-callback-naming` covers both prefix and suffix conventions so callbacks read like verbs instead of framework boilerplate.

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

Disable or relax this rule if a framework or third‑party contract mandates the `handler` suffix everywhere and more descriptive aliases are not feasible, or if your codebase already enforces descriptive naming through other mechanisms.
