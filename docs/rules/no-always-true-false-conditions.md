# Detect conditions that are always truthy or always falsy (`@blumintinc/blumint/no-always-true-false-conditions`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->
### no-always-true-false-conditions

Flag conditions that evaluate to the same boolean result every time. The rule highlights the exact constant condition in the lint message so you can see which guard is ineffective.

- **Type**: problem
- **Recommended**: error

#### Why

- An always-true condition makes the guarded branch run unconditionally, hiding logic mistakes and redundant checks.
- An always-false condition leaves unreachable code that misleads reviewers and future maintainers.
- Constant branches disguise genuine intent—whether you wanted a real guard or should remove the dead code entirely.

#### Examples

Bad:
```javascript
if (true) {
  startJob();
}

const LIMIT = 3 as const;
if (LIMIT < 0) {
  retry();
}

while (false) {
  process();
}

if (typeof "label" === "string") {
  trackLabel();
}
```

Good:
```javascript
if (shouldStart) {
  startJob();
}

if (attempts < limit) {
  retry();
}

while (queue.length > 0) {
  process(queue.shift());
}

if (typeof input === "string") {
  trackLabel(input);
}
```

#### Allowed patterns

- Default/fallback expressions such as `value || {}`, `value ?? defaultValue`, and ternaries that simply return the original value (`status ? status : 'offline'`).
- Destructuring with fallbacks (e.g., `const { name = 'Unknown' } = user || {};`).
- Optional chaining checks that depend on runtime data, like `filtered?.length`.

#### How to fix

- Replace the constant guard with a runtime check (variables, function calls, or comparisons).
- Remove unreachable branches when no runtime path can ever enter them.
- If the goal is to provide defaults, use the standard fallback patterns above instead of wrapping them in constant conditions.
