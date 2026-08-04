# Enforce using src/util/memo instead of React memo (`@blumintinc/blumint/use-custom-memo`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

BluMint's `src/util/memo` wraps `React.memo` with project-specific behavior, so
`memo` must be imported from there rather than from `react`.

## Rule Details

The rule reports any `import` declaration from `react` that names `memo`, and
autofixes it by splitting the declaration in two: a new import of `memo` from
`src/util/memo`, plus the original declaration minus `memo`.

### Examples of **incorrect** code

```ts
import { memo } from 'react';
import React, { memo } from 'react';
import { memo, useState as useS } from 'react';
```

### Examples of **correct** code

```ts
import { memo } from 'src/util/memo';
import { memo as CustomMemo } from 'src/util/memo';
import * as React from 'react';
```

## The wrapper module is exempt

`src/util/memo` is the one module that has to import `memo` from `react` — it is
the wrapper the rule points everything else at. The rule therefore never reports
inside it, since the fix there would make the module import itself, and a
self-import evaluates circularly: the wrapper exports `undefined` and every
consumer of it breaks.

```ts
// src/util/memo.ts — not reported
import { memo as reactMemo } from 'react';
export const memo = reactMemo;
```

The exemption keys on the linted file's path with its extension (`.ts`, `.tsx`,
`.js`, `.jsx`) stripped and its separators normalized, so an absolute path
(`/repo/src/util/memo.ts`) identifies the wrapper as readily as a
project-relative one. The match has to land on a path-segment boundary, so
neighbours that merely share the prefix — `src/util/memoize.ts`,
`src/util/memo.styles.ts`, `foo/notsrc/util/memo.ts` — are still reported.

## Autofix

The surviving specifiers are re-emitted verbatim, so every part of a binding
that determines how it resolves is preserved:

| Input | Output |
| --- | --- |
| `import { memo } from 'react';` | `import { memo } from 'src/util/memo';` |
| `import React, { memo } from 'react';` | `import { memo } from 'src/util/memo';`<br>`import React from 'react';` |
| `import { memo, useState as useS } from 'react';` | `import { memo } from 'src/util/memo';`<br>`import { useState as useS } from 'react';` |
| `import { memo, type FC } from 'react';` | `import { memo } from 'src/util/memo';`<br>`import { type FC } from 'react';` |
| `import type { memo, FC } from 'react';` | `import type { memo } from 'src/util/memo';`<br>`import type { FC } from 'react';` |

Specifically:

* A default specifier stays outside the braces (`import React from 'react'`)
  instead of being demoted to a nonexistent named export.
* `as` aliases and inline `type` modifiers are carried over unchanged.
* The braces are dropped entirely when no named specifier survives.
* A statement-level `import type` stays a type import on both halves.
* The `react` source literal keeps its original quote style.

### Comments

Rebuilding the surviving specifier list would discard the comments attached to
them, and discarding an `eslint-disable-next-line` silently changes which rules
report on the file. An import that carries comments is therefore *spliced*: only
the `memo` bindings are cut out and the rest of the declaration — including its
comments and line structure — is left byte-for-byte alone.

```ts
import React, {
  // eslint-disable-next-line camelcase
  memo as some_name,
  useState,
} from 'react';
```

becomes

```ts
// eslint-disable-next-line camelcase
import { memo as some_name } from 'src/util/memo';
import React, {
  useState,
} from 'react';
```

A comment in front of `memo` annotates `memo`, so it travels with `memo` to the
new import and keeps suppressing the line the binding lives on. A comment
trailing another specifier on that specifier's own line annotates *it*, so it
stays behind. Imports without comments are still rebuilt, which is why they
collapse onto a single line.

## When Not To Use It

Disable this rule in projects that do not ship a `src/util/memo` module.

