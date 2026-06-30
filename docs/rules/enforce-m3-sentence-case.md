# Enforce Material Design 3 sentence-case capitalisation for user-facing text — flag Title Case and ALL CAPS strings in JSX text and configured string props (`@blumintinc/blumint/enforce-m3-sentence-case`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

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
```

## Options

```json
{
  "@blumintinc/blumint/enforce-m3-sentence-case": [
    "warn",
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
