# Prevent wrapping prop-less Unmemoized components in memo since memo provides no benefit without props and adds unnecessary indirection (`@blumintinc/blumint/no-unmemoized-memo-without-props`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Options

This rule accepts an options object with the following properties:

- `ignoreHooks` (`string[]`, default `[]`) — hook names that exempt a component. A component whose body calls one of these hooks is not flagged.
- `ignoreHocs` (`string[]`, default `[]`) — higher-order-component names. A component wrapped by one of these HOCs is not flagged.
