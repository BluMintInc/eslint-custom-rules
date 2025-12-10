# Enforce the use of toString() over toJSON() on URL objects. Prefer passing URL objects directly to JSON.stringify, which will call toJSON automatically (`@blumintinc/blumint/prefer-url-tostring-over-tojson`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce the use of `toString()` over `toJSON()` when working with `URL` objects in JavaScript, unless explicitly serializing as part of a JSON object. Both methods return the fully qualified URL as a string, but `toJSON()` simply calls `toString()` internally. This rule promotes clarity and consistency by ensuring developers default to `toString()` unless a JSON-specific context is required, avoiding unnecessary indirection and making intent clearer in Node.js and browser codebases.

- **Configuration**: ✅ Recommended
- **Fixable**: 🔧 Yes
- **Type Information**: Not required, but leveraged when available

## Rule Details

This rule reports usage of `URL#toJSON()` and suggests either:

- Replacing it with `URL#toString()` in general code, or
- Passing the `URL` object directly to `JSON.stringify` if the call occurs within the argument to `JSON.stringify`. In that context, `JSON.stringify` automatically invokes `toJSON` on the `URL` object.

### Incorrect

```javascript
const url = new URL('https://example.com/path');
console.log(url.toJSON()); // Works, but unnecessary
```

```javascript
const url = new URL('https://example.com/path');
const payload = { link: url.toJSON() }; // Not needed unless part of a JSON serialization pipeline
```

```javascript
const u = new URL('https://e.com');
JSON.stringify({ link: u.toJSON() }); // toJSON() is redundant here
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

## When Not To Use It

- If your project intentionally prefers `toJSON()` to signal JSON-only usage even outside `JSON.stringify`. This is uncommon and discouraged due to redundancy with `toString()` on `URL`.

## Implementation Notes

- The rule uses light heuristics and optionally TypeScript type information to detect `URL` instances.
- Autofix behavior:
  - General case: `foo.toJSON()` → `foo.toString()`
  - Inside `JSON.stringify(...)`: `foo.toJSON()` → `foo` (drop the method call)
  - Optional chaining calls like `foo?.toJSON()` are fixed to `foo?.toString()` (the call is not dropped to preserve semantics).

