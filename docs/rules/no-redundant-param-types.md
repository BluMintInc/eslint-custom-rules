# Disallow redundant parameter type annotations (`@blumintinc/blumint/no-redundant-param-types`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

TypeScript already provides parameter types to arrow functions via contextual typing when you assign them to a typed variable, property, or assignment target. Adding explicit parameter annotations inside the arrow duplicates that information and forces you to keep two places in sync.

This rule reports inline parameter type annotations on arrow functions when your surrounding declaration already specifies the function type. The auto-fix removes the redundant annotation while keeping defaults, rest parameters, and destructuring intact.

### Why this rule?

- Contextual typing keeps your complete signature in one place. Duplicating parameter annotations splits your source of truth and drifts when you change the declaration.
- Redundant annotations add noise and hide when your contextual type updates, increasing maintenance risk for refactors.
- Using the contextual function type improves readability and prevents you from keeping stale parameter expectations.

### Examples

#### Incorrect

What to look for: You annotate parameters even though the variable type already provides them.

```ts
const fn: (value: number) => number = (value: number) => value;

const handler: DocumentChangeHandler<Event> = (
  event: DocumentSnapshot<Event>,
) => process(event);
```

#### Correct

What to look for: You rely on the contextual type and leave parameter annotations off.

```ts
const fn: (value: number) => number = (value) => value;

const handler: DocumentChangeHandler<Event> = (event) => process(event);
```

## When not to use it

If you need explicit parameter annotations because there is no contextual function type on the variable, property, or assignment, you can keep the annotations; the rule only enforces removal when a surrounding type already supplies the parameters.
