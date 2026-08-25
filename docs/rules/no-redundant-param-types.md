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

Two properties keep the fix safe rather than clever:

- **Every strip a pass makes ships as one fix, and orphanhood is judged against all of them together.** A type that several strippable annotations share is unbound by their union, even though no single annotation is its last consumer — judging each removal alone would see the sibling annotation still standing, strip both anyway, and strand the import with nothing left to re-report it. A site whose report is suppressed is left out of that union: a rule cannot see `eslint-disable` (suppression is applied to reports after they are emitted), so a disabled sibling keeps its annotation, and counting its reference as removed would delete an import the surviving annotation still names — trading an unused import for a type bound to nothing.
- **A binding that cannot be unbound cleanly cancels the fix that would orphan it, annotation included.** The report then carries no fixer, and you resolve it by hand. This covers an import behind a `// eslint-disable-next-line` or `@ts-expect-error` directive, a comment sitting among the specifiers, a name that another binding shadows, and an orphan bound by something other than an import — a local `type` alias, a type parameter, or a value declaration the annotation reads through `typeof` (a `const` or a `function` alike; a declaration's own initializer is not counted as a use of it, so the two spellings decline the same way). Such a site is screened out before the batch is planned, so it declines its own fix without cancelling its siblings'; when the batch as a whole still orphans something unrewritable — a local alias that every one of those annotations reads, say — every report in it goes without a fixer.

### The fix leaves the arrow laid out the way prettier prints it

Removing an annotation shortens the header, and prettier lays an arrow function out against its print width: a parameter list broken one-per-line only because the annotation overflowed collapses once it is gone, and when the collapsed statement is still too long the body breaks instead. A fix that stripped the annotation and left the old layout behind would be rewritten the moment prettier ran — and agora runs prettier and `eslint --fix` over the same tree, so that is a diff that never settles. The fixer therefore re-lays the arrow out the way prettier prints the stripped result, measured against an 80-column width:

```ts
// Before: the annotation forces the parameter list onto its own lines
const swap: (tuple: [string, number]) => [number, string] = (
  tuple: [string, number],
) => [tuple[1], tuple[0]];

// After: the list collapses, and the array body breaks beneath it because the
// collapsed statement no longer fits on one line
const swap: (tuple: [string, number]) => [number, string] = (tuple) => [
  tuple[1],
  tuple[0],
];
```

What the fixer does with each shape tracks what prettier does with it:

- A list whose names still overflow the header without their annotations stays broken. A block body, and an object literal broken after its brace, keep their own lines while the header collapses around them. A call, member, template, or other body prettier does not hug drops beneath the arrow, indented one step, when the collapsed line is too long for it.
- A comment prettier itself holds the list open for — a line comment inside the parentheses, or a block comment on a line of its own — keeps the list as written, and only the annotation goes. A block comment sharing a parameter's line rides onto that parameter.
- A trailing line comment never counts toward the width; a trailing block comment occupies its columns and does.
- Where prettier's answer cannot be read off the source — an array of numbers or of nested literals, a body that would still overflow beneath the arrow — the annotation is stripped in place and the layout is left to the formatter.

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
