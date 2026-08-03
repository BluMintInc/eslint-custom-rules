# Disallow redundant parameter type annotations (`@blumintinc/blumint/no-redundant-param-types`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

TypeScript already provides parameter types to arrow functions via contextual typing when you assign them to a typed variable, property, or assignment target. Adding explicit parameter annotations inside the arrow duplicates that information and forces you to keep two places in sync.

This rule reports inline parameter type annotations on arrow functions when your surrounding declaration already specifies the function type. The auto-fix removes the redundant annotation while keeping defaults, rest parameters, and destructuring intact, along with any import the annotation was the only consumer of (see [The fix takes the imports the annotation was the only consumer of](#the-fix-takes-the-imports-the-annotation-was-the-only-consumer-of)).

### The fix takes the imports the annotation was the only consumer of

An annotation is often the sole reference to the types it names. Deleting it alone would leave those imports bound to nothing, so a file that lints clean would fail `@typescript-eslint/no-unused-vars` afterwards — with a violation this rule cannot report, because its own finding is resolved by the fix. The annotation and the imports it orphans therefore go as a single fix: applying either half alone leaves your file worse than applying neither.

```ts
// Before: the parameter annotation is the only consumer of three imports
import { Change } from 'firebase-functions/v2';
import { DatabaseEvent } from 'firebase-functions/v2/database';
import { DataSnapshot } from '../types/DataSnapshot';
import { RealtimeDbChangeHandler } from '../v2/handlerTypes';
import { CallerCount, CallerCountPath } from '../types/CallerCount';

export const closeRoom: RealtimeDbChangeHandler<
  CallerCount,
  CallerCountPath
> = async (event: DatabaseEvent<Change<DataSnapshot<CallerCount>>>) => {
  await close(event);
};

// After: the handler type still names CallerCount, so that import stays
import { RealtimeDbChangeHandler } from '../v2/handlerTypes';
import { CallerCount, CallerCountPath } from '../types/CallerCount';

export const closeRoom: RealtimeDbChangeHandler<
  CallerCount,
  CallerCountPath
> = async (event) => {
  await close(event);
};
```

Two limits keep the fix safe rather than clever:

- **Each annotation is judged on its own removal, against the file as it stands.** A type that two strippable annotations share is not unbound in one pass — neither annotation is its last consumer. A rule cannot see `eslint-disable` (suppression is applied to reports after they are emitted), so assuming a sibling annotation will also go would delete an import the surviving annotation still references, trading an unused import for a type bound to nothing.
- **A binding that cannot be unbound cleanly cancels the whole fix, annotation included.** The report then carries no fixer, and you resolve it by hand. This covers an import behind a `// eslint-disable-next-line` or `@ts-expect-error` directive, a comment sitting among the specifiers, a name that another binding shadows, and an orphan bound by something other than an import — a local `type` alias or a type parameter.

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
