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

## When Not To Use It

Disable this rule in projects that do not ship a `src/util/memo` module.

## Options

This rule has no options.

