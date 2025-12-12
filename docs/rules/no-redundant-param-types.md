# Disallow redundant parameter type annotations (`@blumintinc/blumint/no-redundant-param-types`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

TypeScript already provides parameter types to arrow functions via contextual typing when they are assigned to a typed variable, property, or assignment target. Adding explicit parameter annotations inside the arrow duplicates that information, forcing two places to stay in sync.

This rule reports inline parameter type annotations on arrow functions whose surrounding declaration already specifies the function type. The auto-fix removes the redundant annotation while keeping defaults, rest parameters, and destructuring intact.

### Why this rule?

- Contextual typing keeps the complete signature in one place. Duplicating parameter annotations splits the source of truth and can drift when the declaration changes.
- Redundant annotations add noise and hide when the contextual type updates, increasing maintenance risk for refactors.
- Relying on the contextual function type improves readability and prevents stale parameter expectations.

### Examples

#### Incorrect

```ts
const fn: (value: number) => number = (value: number) => value;

const handler: DocumentChangeHandler<Event> = (
  event: DocumentSnapshot<Event>,
) => process(event);
```

#### Correct

```ts
const fn: (value: number) => number = (value) => value;

const handler: DocumentChangeHandler<Event> = (event) => process(event);
```

## When not to use it

If you need explicit parameter annotations because there is no contextual function type on the variable, property, or assignment, this rule does not apply; it only enforces removal when a surrounding type already supplies the parameters.
