# Enforce the use of toString() over toJSON() on URL objects (`@blumintinc/blumint/prefer-url-tostring-over-tojson`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce the use of `toString()` over `toJSON()` when working with `URL` objects in JavaScript, unless explicitly serializing as part of a JSON object. Both methods return the fully qualified URL as a string, but `toJSON()` simply calls `toString()` internally. This rule promotes clarity and consistency by ensuring developers default to `toString()` unless a JSON-specific context is required, avoiding unnecessary indirection and making intent clearer in Node.js and browser codebases.

- **Configuration**: ✅ Recommended
- **Fixable**: 🔧 Yes
- **Type Information**: Not required, but leveraged when available

## Rule Details

`URL#toJSON()` only delegates to `toString()`. Calling it directly adds an unnecessary hop and hides that `JSON.stringify` already invokes `toJSON` on `URL` objects. The rule reports any `toJSON()` call on a `URL` instance and guides you to:

- Use `toString()` when you need a string representation explicitly.
- Pass the `URL` object directly to `JSON.stringify` so serialization remains obvious and consistent.

This keeps URL serialization explicit, avoids redundant calls, and prevents readers from assuming a different JSON-specific payload.

### Incorrect

```javascript
const url = new URL('https://example.com/path');
console.log(url.toJSON()); // Redundant hop; same output as toString()
```

```javascript
const url = new URL('https://example.com/path');
const payload = { link: url.toJSON() }; // Hides that JSON.stringify will call toJSON for you
```

```javascript
const u = new URL('https://e.com');
JSON.stringify({ link: u.toJSON() }); // JSON.stringify already invokes toJSON on URL objects
```

```javascript
const u = new URL('https://e.com');
u?.toJSON(); // Optional chaining still adds the redundant call
```

### Correct

```javascript
const url = new URL('https://example.com/path');
console.log(url.toString()); // Clearer and more direct
```

```javascript
const url = new URL('https://example.com/path');
const payload = JSON.stringify({ link: url }); // `toJSON` called automatically during JSON serialization
```

```javascript
console.log(new URL('https://e.com').toString());
```

```javascript
const maybeUrl = Math.random() > 0.5 ? new URL('https://e.com') : undefined;
console.log(maybeUrl?.toString());
```

## When Not To Use It

- If your project intentionally prefers `toJSON()` to signal JSON-only usage even outside `JSON.stringify`. This is uncommon and discouraged because `URL#toJSON()` returns the same string as `toString()` and adds indirection without changing output.

## Implementation Notes

- The rule uses light heuristics and optionally TypeScript type information to detect `URL` instances.
- Autofix behavior:
  - General case: `foo.toJSON()` → `foo.toString()`
  - Inside `JSON.stringify(...)`: `foo.toJSON()` → `foo` (drop the method call)
  - Optional chaining calls like `foo?.toJSON()` are fixed to `foo?.toString()` (the call is not dropped to preserve semantics).

