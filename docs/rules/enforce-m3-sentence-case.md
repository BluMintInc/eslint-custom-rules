# Enforce Material Design 3 sentence-case capitalisation for user-facing text — flag Title Case and ALL CAPS strings in JSX text and configured string props (`@blumintinc/blumint/enforce-m3-sentence-case`)

💼 This rule is enabled in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

BluMint follows Material Design 3 (M3) guidelines, which mandate **sentence case** for all user-facing text. Sentence case means only the first letter of the first word (and proper nouns / brand names) is capitalised. This rule flags two patterns:

1. **Title Case** — multiple words where more than one non-first word starts with an upper-case letter (e.g. "Back To App").
2. **ALL CAPS** — multi-word strings where all letters are upper-case (e.g. "SUBMIT FORM").

Both patterns are flagged in JSX text content and in string literals passed to configured props (`label`, `title`, `placeholder`, `helperText`, `aria-label`, `alt`, and others).

## Why This Matters

- **M3 alignment** — the M3 type system prescribes sentence case across all components for improved readability and a modern aesthetic.
- **Consistency** — mixed casing across the UI fragments the user experience.
- **Accessibility** — sentence case is easier to read for users with cognitive disabilities and non-native English speakers.

## Rule Details

The rule inspects `JSXText` nodes and string literals in JSX attributes whose name is in `propsToCheck`. For each string:

1. It is split at sentence-boundary punctuation (`. `, `? `, `! `, `: `).
2. Each segment is checked for non-first words that start with an upper-case letter.
3. Words in `ignoredWords` (proper nouns / brand names) and recognised acronyms are exempted.
4. Strings in `allowList` and strings matching `ignorePatterns` are skipped entirely.

## Suggestions

Every report carries an editor suggestion that rewrites the text in sentence case. The rewrite differs by violation type:

- **ALL CAPS** — the whole string is lower-cased and the first letter of each sentence is capitalised (`THE USER'S FILE` → `The user's file`). Proper nouns are restored to their canonical spelling (`SIGN IN WITH GOOGLE` → `Sign in with Google`) and allowlisted acronyms keep their casing (`ENTER YOUR API KEY` → `Enter your API key`). Possessives stay intact — `USER'S` is a single word, not `USER` plus `'S`.
- **Title Case** — non-first words that are neither acronyms nor proper nouns are lower-cased (`Back To App` → `Back to app`). Intra-word casing of the first word is preserved (`MacBook Pro Sale` → `MacBook pro sale`).

The replacement is re-escaped for the literal form it is written back into, so applying a suggestion never breaks parsing:

| Target | Escaping |
|--------|----------|
| JS string literal (`aria-label={'…'}`) | Backslash escapes for the delimiter, backslashes, line terminators, and control characters |
| JSX attribute string (`label="…"`) | Character references (`&quot;`, `&#39;`, `&amp;`) — JSX attribute strings do not process backslash escapes |
| JSX text (`<Button>…</Button>`) | Character references for `&`, `<`, `>`, `{`, `}` |

Template literals are treated as dynamic and are never checked or rewritten.

Examples of **incorrect** code for this rule:

```jsx
// Title Case in JSX text
<Button>Back To App</Button>
<Button>Save Changes</Button>

// Title Case in props
<TextField label="Full Name" />
<DateTimePicker label="Scheduled For" />
<TextField placeholder="Enter Your Name" />
<img alt="User Profile Picture" />

// ALL CAPS
<Button>SUBMIT FORM</Button>
<Typography>CLICK HERE TO CONTINUE</Typography>
<button aria-label={'THE USER\'S FILE'} />
```

Examples of **correct** code for this rule:

```jsx
// Sentence case in JSX text
<Button>Back to app</Button>
<Button>Save changes</Button>

// Sentence case in props
<TextField label="Full name" />
<DateTimePicker label="Scheduled for" />
<TextField placeholder="Enter your name" />
<img alt="User profile picture" />

// Proper nouns and brand names are always allowed
<Typography>Sign in with Google</Typography>
<Typography>Welcome to BluMint</Typography>
<TextField label="Enter BluMint username" />

// Acronyms are always allowed
<Typography>Connect via API</Typography>
<TextField label="Enter URL" />
<Typography>Your user ID</Typography>

// Single-word strings are never flagged
<Button>Cancel</Button>
<Button>OK</Button>

// Sentence-cased possessives
<button aria-label={'The user\'s file'} />
```

## Options

```json
{
  "@blumintinc/blumint/enforce-m3-sentence-case": [
    "error",
    {
      "propsToCheck": ["label", "title", "placeholder", "helperText", "message", "description", "tooltip", "buttonText", "aria-label", "alt"],
      "ignoredWords": ["BluMint", "Google", "Discord"],
      "ignorePatterns": ["^[A-Z]{2,}$"],
      "allowList": ["Terms & Conditions", "Do Not Sell My Info"],
      "checkJsxText": true
    }
  ]
}
```

### `propsToCheck`

Type: `string[]`  
Default: `["label", "title", "placeholder", "helperText", "message", "description", "tooltip", "buttonText", "aria-label", "alt"]`

The JSX attribute names whose string values are validated. Attributes not in this list (e.g. `className`, `style`, `data-*`) are ignored.

### `ignoredWords`

Type: `string[]`  
Default: BluMint brand name and common platform/game names (Google, Apple, Discord, Twitch, etc.)

Words that are exempt from the capitalisation check. Use this to add proper nouns or brand names specific to your project.

### `ignorePatterns`

Type: `string[]` (each element is a regex source string)  
Default: `[]`

Strings matching any of these patterns are skipped entirely. Useful for intentional exceptions such as pure acronyms or marketing taglines.

### `allowList`

Type: `string[]`  
Default: `[]`

Exact strings to skip. Use this for legal text, marketing taglines, or other intentional exceptions (e.g. `"Terms & Conditions"`, `"Do Not Sell My Info"`).

### `checkJsxText`

Type: `boolean`  
Default: `true`

Set to `false` to only check configured prop values and skip inline JSX text content.

## When to Disable

You can disable this rule for a single line with `// eslint-disable-next-line @blumintinc/blumint/enforce-m3-sentence-case` when:

- The text has a deliberate stylistic or legal exception that cannot be expressed via `allowList`.
- The component uses `variant="overline"` or another explicitly all-caps style, and single-word all-caps tokens in that context are intentional.
