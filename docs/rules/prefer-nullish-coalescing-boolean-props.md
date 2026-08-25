# Prefer nullish coalescing over logical OR, but allow logical OR in boolean contexts (`@blumintinc/blumint/prefer-nullish-coalescing-boolean-props`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule keeps logical OR (`||`) available inside boolean contexts (JSX boolean props, conditions, boolean-returning helpers) while requiring the nullish coalescing operator (`??`) for defaulting non-boolean values. Logical OR treats any falsy value (`false`, `0`, `''`, `NaN`) as missing and will override intentional states; `??` only falls back on `null` or `undefined`, preserving explicit falsy inputs.

## Rule Details

**Why**: Defaulting with `||` hides legitimate falsy values—feature flags set to `false`, counts that are `0`, empty strings that are intentional—and replaces them with fallbacks. That makes components render with the wrong values and masks real bugs.

**What the rule enforces**:
- Use `??` instead of `||` when providing default values to non-boolean expressions (props, variables, arguments, array/object literals, template literals, etc.).
- Keep `||` in boolean contexts where coercing any falsy value to `false` is intentional (boolean props, conditions, loop tests, boolean-returning helpers).

**How to fix**: Replace `left || right` with `left ?? right` unless the expression is strictly boolean. The fixer applies this automatically.

**The parentheses the swap makes load-bearing are kept, and only those**: ECMAScript rejects `??` sharing an expression with an unparenthesized `&&` or `||`, so an operand that is itself an `&&` or `||` comes back parenthesized — `(a && b) || c` becomes `(a && b) ?? c`, never the unparseable `a && b ?? c`. A `??` operand needs no such separation: `??` chains with itself, and it is associative, so the flat chain evaluates the same operands in the same order. `(a ?? b) || c` becomes `a ?? b ?? c`, not `(a ?? b) ?? c`. Parentheses that existed only to hold a `||` apart from a neighbouring `??` go the same way once the swap removes the reason for them, so `(a || b) ?? c` becomes `a ?? b ?? c`.

An operand the author already parenthesized keeps its pair on the same test, applied to that operand's own spelling rather than to the `&&`/`||` case alone. Every operator binding looser than `??` needs it to stay the same program: unparenthesized, a `yield`, an assignment or a conditional operand swallows the `??` and its right operand, turning `(yield x) ?? y` into `yield (x ?? y)`, and a sequence operand stops parsing altogether. `await`, `as` and `satisfies` bind tighter, so their pair changes no meaning, but Prettier writes it regardless — and emitting a spelling the formatter immediately rewrites churns the file on every pass in a repository that runs both over one tree:

```ts
// Before
const value = (await fetchFlag()) || fallback;

// After `--fix`
const value = (await fetchFlag()) ?? fallback;
```

**Long `||` chains convert one link per pass**: the links of `a || b || c` overlap, so a single `--fix` pass rewrites the innermost link and parenthesizes it (`(a ?? b) || c`) to keep the half-converted chain parseable. The remaining links are reported again and convert on subsequent passes, which `eslint --fix` runs automatically, and the scaffolding parentheses come off as the last link converts:

```ts
// Before
const value = a || b || c;

// After `--fix`
const value = a ?? b ?? c;
```

**Comments between the operands are carried, not dropped**: the fix rebuilds the expression from each operand's text, so a comment written around the operator — or inside parentheses the rebuild discards — has no operand to travel with. Each one is re-emitted on the side of the operator its author put it on:

```ts
// Before
const uid = primary.id || // fall back for legacy documents
            secondary.id;

// After `--fix`
const uid =
  primary.id ?? // fall back for legacy documents
  secondary.id;
```

**A chain a comment breaks is emitted one operand per line, at its own depth**: prettier prints every operand of a comment-bearing logical chain on a line of its own, and it starts that chain on a line of its own too — breaking after the `=`, `:` or `=>` the chain lands on and indenting one step in from the line that introduces it. The fix emits exactly that layout, so `--fix` output survives a formatting check rather than landing source the next formatter run rewrites:

```ts
// Before
const value = a || // legacy documents have no owner
  b || c;

// After `--fix`
const value =
  a ?? // legacy documents have no owner
  b ??
  c;
```

The break belongs to the chain, so only the chain's own breaks ask for it. A comment nested inside an operand's brackets is that operand's layout and leaves the chain on one line; a comment trailing the whole expression sits outside the chain and moves nothing. A chain that already opens its own line is at that depth already and comes back byte-identical.

Prettier reads a logical chain as ONE group, so a chain broken anywhere is broken everywhere: a comment beside one operator still puts the operands it does not touch on lines of their own, and a link an earlier pass already converted is re-flowed rather than carried with the indentation it had while parentheses held it one level deeper.

```ts
// Before
const owner =
  (explicit ?? inherited) || // legacy documents have no owner
  fallback;

// After `--fix`
const owner =
  explicit ??
  inherited ?? // legacy documents have no owner
  fallback;
```

The depth those operands land at belongs to the construct the chain sits in, not to a constant step. An assignment, an object value, a class field, an arrow body, `return`/`throw`, a template hole and an `if`/`while`/`switch`/`do` test have all already indented the chain, so its operands stay flush with the first one. A call or `new` argument, an array element, a parameter default, an `await`, a spread, an `as` and a JSX child have not, so prettier indents every operand after the first one step further in, and the fix does too:

```ts
// Before
save(
  primary.id || // legacy documents have no owner
    secondary.id,
);

// After `--fix`
save(
  primary.id ?? // legacy documents have no owner
    secondary.id,
);
```

Three landing shapes are deliberately left alone, each measured against prettier rather than assumed. After `return`, `throw` or `yield` prettier parenthesizes the broken chain instead, and parentheses are tokens — emitting them because a comment is present would let the comment change the program. In a JSX attribute prettier answers by re-breaking the whole opening element, which is text outside the expression this fix owns. In an argument, an array element or a parameter default prettier never breaks between the punctuation and the chain's first operand at all.

A comment that must occupy its own line gets one, and where the expression follows `return`, `throw` or `yield` — which forbid a line terminator before their operand — such a comment is hoisted ahead of the keyword instead, so the fix cannot change the program through ASI. Whether the result is parenthesized is decided by the surrounding expression exactly as it is without comments, so a comment never adds or removes parentheses.

**A `||` that strips a short-circuit sentinel is left alone**: `cond && payload` evaluates to `cond` itself when it short-circuits, so its type is `false | payload` (or `0 | payload`, `'' | payload`). The trailing `||` exists to strip that sentinel, and `??` — which discards only `null` and `undefined` — cannot, so the sentinel leaks into a position typed for the payload alone and the program stops compiling:

```ts
type Arrows = { next: string; prev: string };
declare const hasArrows: boolean | undefined;

const options: { arrows?: Arrows } = {
  // `(hasArrows && {…})` is `false | Arrows | undefined`
  arrows: (hasArrows && { next, prev }) || undefined, // ✅ `Arrows | undefined`
  // `??` would keep the `false`: TS2322, boolean is not assignable to Arrows
};
```

The test is a property of the left operand's type, not of the `&&` that usually produces it, so a hand-written `false | Arrows | undefined` is treated the same way. It applies only where the falsy member comes from outside the payload's primitive domain. A union confined to one domain — `string | undefined`, `boolean | undefined`, `0 | 1 | undefined` — is the case the rule exists for, where the falsy value belongs to the same kind as the fallback and preserving it is the point, so those keep reporting. The carve-out needs the type checker: without type information the rule behaves as it does for any other operand.

### Examples of correct code

Boolean props keep logical OR:

```tsx
<LoadingButton
  disabled={
    !isValidated.phoneNumber ||
    !hasUserTyped.phoneNumber ||
    isLoading ||
    !isPhoneInputLoaded
  }
>
  Send Code
</LoadingButton>
```

```tsx
<Button disabled={isLoading || !isValid}>Submit</Button>
```

```tsx
<Input required={hasValue || isRequired} />
```

```tsx
<Checkbox checked={isSelected || defaultSelected} />
```

Conditions keep logical OR:

```tsx
if (isLoading || !isValid) {
  return null;
}
```

Nullish coalescing for defaulting values:

```tsx
const value = data ?? defaultValue;
const placeholder = text ?? 'Enter text';
const { title = data.title ?? 'Untitled' } = props;
```

A logical operand keeps its parentheses, which `??` requires:

```ts
const config = (overrides.theme && overrides.theme.dark) ?? defaults.dark;
```

The short-circuit idiom keeps logical OR, because only `||` discards the `false`:

```ts
const arrows = (hasArrows && { next, prev }) || undefined;
```

### Examples of incorrect code

```tsx
// Non-boolean defaults overwrite intentional falsy values
const value = data || defaultValue;
function Component() {
  return <Input placeholder={text || 'Enter text'} />;
}

// Template literals and nested expressions
const str = `Hello ${name || 'World'}`;
const result = (data.field || defaultField).toString();
```

```ts
// A logical operand: the fix keeps the parentheses `??` requires
const config = (overrides.theme && overrides.theme.dark) || defaults.dark;
```

These cases should use `??` so the fallback only applies when the left side is `null` or `undefined`.

## When Not To Use It

If you don't use the `@typescript-eslint/prefer-nullish-coalescing` rule, you don't need this rule.

## Further Reading

- [TypeScript ESLint prefer-nullish-coalescing rule](https://typescript-eslint.io/rules/prefer-nullish-coalescing/)
- [Nullish coalescing operator (??)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing)
- [Logical OR operator (||)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_OR)
