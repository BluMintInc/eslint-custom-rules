# Disallow use of conditional literals in JSX code (`@blumintinc/blumint/no-conditional-literals-in-jsx`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Conditional string literals must not sit next to other JSX text or expressions. When JSX mixes `"text"`, `{condition && 'more text'}`, and other siblings in the same element, React splits the sentence across multiple text nodes. Those fragmented nodes confuse browser auto-translation, i18n tooling, and React hydration because different environments may assemble the text differently. Wrap the conditional expression in its own element or move the entire sentence inside the conditional so it renders as one text node.

## Rule Details

The rule reports conditional string literals that are adjacent to other JSX text or expressions. This pattern is risky because:

- Browser translation and screen readers treat each fragment as a separate node, so conditional pieces produce garbled output or untranslated leftovers.
- React's server-rendered markup may not match the client because conditional fragments change how text nodes are grouped, creating hydration warnings.
- Reviewers cannot easily tell which sentences render together, making copy and localization work brittle.

To fix the warning, either:

- Wrap the conditional expression in its own element so the text node stays intact while preserving the original operator: `<div>text <span>{condition && 'more text'}</span></div>` or `<div>text <span>{value || 'fallback'}</span></div>`
- Move the entire sentence into the conditional: `{condition && <div>text more text</div>}`

Examples of **incorrect** code for this rule:

```jsx
<div>Welcome {isReturning && 'back'} user</div>
<p>Cart total: {showAmount && '$42.00'}</p>
<div><span>This is {maybe && 'sometimes'} split</span></div>
<div>Status: {state || 'unknown'}</div>
```

Examples of **correct** code for this rule:

```jsx
<div>Welcome <span>{isReturning && 'back'}</span> user</div>
<p>{showAmount && 'Cart total: $42.00'}</p>
{maybe && <div><span>This stays together</span></div>}
<div>Status: <span>{state || 'unknown'}</span></div>
```