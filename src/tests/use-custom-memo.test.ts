import { ruleTesterTs } from '../utils/ruleTester';
import { useCustomMemo } from '../rules/use-custom-memo';

ruleTesterTs.run('use-custom-memo', useCustomMemo, {
  valid: [
    {
      code: `import { memo } from 'src/util/memo';`,
    },
    {
      code: `import { memo as CustomMemo } from 'src/util/memo';`,
    },
    {
      code: `import { something } from 'react';`,
    },
    // A namespace import never names `memo` as a binding, so nothing to rewrite.
    {
      code: `import * as React from 'react';\nconst A = React.memo(() => null);`,
    },
    {
      code: `import React from 'react';`,
    },
    {
      code: `import React, * as ReactAll from 'react';`,
    },
    {
      code: `import memo from 'react';`,
    },
    {
      code: `import 'react';`,
    },
    {
      code: `import { memo } from 'preact/compat';`,
    },
    // The wrapper module the rule points at cannot import itself: rewriting it
    // would make it evaluate circularly and export `undefined` (#1671).
    {
      code: `import { memo as reactMemo } from 'react';\nexport const memo = reactMemo;`,
      filename: 'src/util/memo.ts',
    },
    {
      code: `import { memo as reactMemo } from 'react';\nexport const memo = reactMemo;`,
      filename: '/repo/src/util/memo.tsx',
    },
    // The wrapper is exempt under every source extension it can ship as (#1671).
    {
      code: `import { memo } from 'react';`,
      filename: 'src/util/memo.js',
    },
    {
      code: `import { memo } from 'react';`,
      filename: '/repo/src/util/memo.jsx',
    },
    // An extensionless path still identifies the wrapper (#1671).
    {
      code: `import { memo } from 'react';`,
      filename: '/repo/src/util/memo',
    },
    // Windows separators name the same module as POSIX ones (#1671).
    {
      code: `import { memo } from 'react';`,
      filename: 'C:\\repo\\src\\util\\memo.ts',
    },
  ],
  invalid: [
    {
      code: `import { memo } from 'react';`,
      output: `import { memo } from 'src/util/memo';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    {
      code: `import { memo as ReactMemo } from 'react';`,
      output: `import { memo as ReactMemo } from 'src/util/memo';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    {
      code: `import { memo, useState } from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport { useState } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    {
      code: `import { useState, memo } from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport { useState } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // Regression: the default specifier must stay a default import (#1366).
    {
      code: `import React, { memo } from 'react';\nconst A = memo(() => null);\nexport const B = () => React.createElement('div');`,
      output: `import { memo } from 'src/util/memo';\nimport React from 'react';\nconst A = memo(() => null);\nexport const B = () => React.createElement('div');`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // Regression: an alias on a surviving specifier must survive (#1366).
    {
      code: `import { memo, useState as useS } from 'react';\nconst A = memo(() => null);\nexport const b = useS;`,
      output: `import { memo } from 'src/util/memo';\nimport { useState as useS } from 'react';\nconst A = memo(() => null);\nexport const b = useS;`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // Regression: an inline `type` modifier must survive (#1366).
    {
      code: `import { memo, type FC } from 'react';\nconst A: FC = memo(() => null);`,
      output: `import { memo } from 'src/util/memo';\nimport { type FC } from 'react';\nconst A: FC = memo(() => null);`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // Default, named and inline-type survivors combined.
    {
      code: `import React, { memo, useState, type FC } from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport React, { useState, type FC } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // Default plus an aliased memo, with the default the only survivor.
    {
      code: `import React, { memo as ReactMemo } from 'react';`,
      output: `import { memo as ReactMemo } from 'src/util/memo';\nimport React from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A statement-level type import stays a type import on both halves.
    {
      code: `import type { memo } from 'react';`,
      output: `import type { memo } from 'src/util/memo';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    {
      code: `import type { memo, FC } from 'react';`,
      output: `import type { memo } from 'src/util/memo';\nimport type { FC } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // An inline `type` modifier on memo itself is preserved on the new import.
    {
      code: `import { type memo, useState } from 'react';`,
      output: `import { type memo } from 'src/util/memo';\nimport { useState } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // memo referenced as a value rather than called still triggers the rewrite.
    {
      code: `import React, { memo } from 'react';\nexport const wrap = memo;\nexport const el = React.createElement('div');`,
      output: `import { memo } from 'src/util/memo';\nimport React from 'react';\nexport const wrap = memo;\nexport const el = React.createElement('div');`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // The surviving import keeps the source literal's original quote style.
    {
      code: `import React, { memo, useState } from "react";`,
      output: `import { memo } from 'src/util/memo';\nimport React, { useState } from "react";`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // Multiline imports collapse to a single line without losing specifiers.
    {
      code: `import React, {\n  memo,\n  useState,\n} from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport React, { useState } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A trailing comma in the original braces does not leak into the rewrite.
    {
      code: `import { memo, useState, } from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport { useState } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // Duplicate memo bindings are both re-emitted against the custom module.
    {
      code: `import { memo, memo as M } from 'react';`,
      output: `import { memo, memo as M } from 'src/util/memo';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // Multiple aliased survivors keep every alias.
    {
      code: `import { memo, useEffect as useE, useRef as useR } from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport { useEffect as useE, useRef as useR } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // The rewrite is confined to the react import; other imports are untouched.
    {
      code: `import { useQuery } from 'react-query';\nimport React, { memo } from 'react';\nexport const A = memo(() => null);`,
      output: `import { useQuery } from 'react-query';\nimport { memo } from 'src/util/memo';\nimport React from 'react';\nexport const A = memo(() => null);`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A directive above `memo` travels with `memo` so it keeps suppressing the
    // line the binding lives on (#1445).
    {
      code: `import React, {\n  // eslint-disable-next-line no-console\n  memo,\n  useState,\n} from 'react';`,
      output: `// eslint-disable-next-line no-console\nimport { memo } from 'src/util/memo';\nimport React, {\n  useState,\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A directive above a surviving specifier stays exactly where it was (#1445).
    {
      code: `import React, {\n  memo,\n  // eslint-disable-next-line camelcase\n  useState,\n} from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport React, {\n  // eslint-disable-next-line camelcase\n  useState,\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A comment trailing a surviving specifier is not a leading comment of
    // `memo`, so it stays with the specifier it annotates (#1445).
    {
      code: `import {\n  memo,\n  useState, // keep this\n} from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport {\n  useState, // keep this\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A block comment between specifiers survives inline (#1445).
    {
      code: `import { memo, /* keep */ useState } from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport { /* keep */ useState } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // Comment preservation must not cost the alias on either half (#1445).
    {
      code: `import {\n  // eslint-disable-next-line camelcase\n  memo as ReactMemo,\n  useState as useS,\n} from 'react';`,
      output: `// eslint-disable-next-line camelcase\nimport { memo as ReactMemo } from 'src/util/memo';\nimport {\n  useState as useS,\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // `memo` as the only specifier: the whole import is replaced, so its
    // comments have to be re-emitted with the new import (#1445).
    {
      code: `import {\n  // eslint-disable-next-line camelcase\n  memo,\n} from 'react';`,
      output: `// eslint-disable-next-line camelcase\nimport { memo } from 'src/util/memo';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // `memo` as the only named specifier: the braces go away and the comment
    // inside them moves to the new import (#1445).
    {
      code: `import React, {\n  // eslint-disable-next-line camelcase\n  memo,\n} from 'react';`,
      output: `// eslint-disable-next-line camelcase\nimport { memo } from 'src/util/memo';\nimport React from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // `memo` last, with its own directive line (#1445).
    {
      code: `import {\n  useState,\n  // eslint-disable-next-line camelcase\n  memo,\n} from 'react';`,
      output: `// eslint-disable-next-line camelcase\nimport { memo } from 'src/util/memo';\nimport {\n  useState,\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // `memo` last without a trailing comma: the preceding specifier's own
    // trailing comment must not be dragged along (#1445).
    {
      code: `import {\n  useState, // keep\n  memo\n} from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport {\n  useState, // keep\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // `memo` last without a trailing comma and without comments in between:
    // the separating comma goes with it (#1445).
    {
      code: `import {\n  // eslint-disable-next-line camelcase\n  useState,\n  memo\n} from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport {\n  // eslint-disable-next-line camelcase\n  useState\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A comment wedged between `memo` and its comma is inside the removed range,
    // so it is carried rather than dropped (#1445).
    {
      code: `import { memo /* why */, useState } from 'react';`,
      output: `/* why */\nimport { memo } from 'src/util/memo';\nimport { useState } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A comment outside the braces is untouched by the specifier removal (#1445).
    {
      code: `import /* keep */ React, { memo } from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport /* keep */ React from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A statement-level type import keeps its comments on both halves (#1445).
    {
      code: `import type {\n  // eslint-disable-next-line camelcase\n  memo,\n  FC,\n} from 'react';`,
      output: `// eslint-disable-next-line camelcase\nimport type { memo } from 'src/util/memo';\nimport type {\n  FC,\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // Two memo bindings removed from a commented list leave the comment in place.
    {
      code: `import {\n  memo,\n  // eslint-disable-next-line camelcase\n  useState,\n  memo as M,\n} from 'react';`,
      output: `import { memo, memo as M } from 'src/util/memo';\nimport {\n  // eslint-disable-next-line camelcase\n  useState,\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A comment inside the `memo` specifier rides along in the specifier text
    // rather than being duplicated above the new import (#1445).
    {
      code: `import { memo /* mid */ as M, useState } from 'react';`,
      output: `import { memo /* mid */ as M } from 'src/util/memo';\nimport { useState } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    {
      code: `import { memo /* mid */ as M } from 'react';`,
      output: `import { memo /* mid */ as M } from 'src/util/memo';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A multiline block comment above `memo` is carried verbatim (#1445).
    {
      code: `import {\n  /*\n   * keep\n   */\n  memo,\n  useState,\n} from 'react';`,
      output: `/*\n   * keep\n   */\nimport { memo } from 'src/util/memo';\nimport {\n  useState,\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // Adjacent memo bindings produce adjacent removals, which must not overlap.
    {
      code: `import {\n  memo,\n  memo as M,\n  // eslint-disable-next-line camelcase\n  useState,\n} from 'react';`,
      output: `import { memo, memo as M } from 'src/util/memo';\nimport {\n  // eslint-disable-next-line camelcase\n  useState,\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A run of comments above `memo` is carried in source order (#1445).
    {
      code: `import {\n  // one\n  // two\n  memo,\n  useState,\n} from 'react';`,
      output: `// one\n// two\nimport { memo } from 'src/util/memo';\nimport {\n  useState,\n} from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A comment outside the braces of the surviving import stays put (#1445).
    {
      code: `import { memo, useState } /* keep */ from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport { useState } /* keep */ from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A consumer of the wrapper is reported however the wrapper's own module is
    // exempted (#1671).
    {
      code: `import { memo as reactMemo } from 'react';\nexport const memo = reactMemo;`,
      output: `import { memo as reactMemo } from 'src/util/memo';\nexport const memo = reactMemo;`,
      filename: 'src/components/Foo.tsx',
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // `notsrc` is a different segment from `src`, so the path names a different
    // module and stays reportable (#1671).
    {
      code: `import { memo } from 'react';`,
      output: `import { memo } from 'src/util/memo';`,
      filename: 'foo/notsrc/util/memo.ts',
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A sibling of the wrapper is not the wrapper: only the final extension is
    // stripped, so `memo.styles` never reduces to `memo` (#1671).
    {
      code: `import { memo } from 'react';`,
      output: `import { memo } from 'src/util/memo';`,
      filename: 'src/util/memo.styles.ts',
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A longer basename sharing the prefix is a different module (#1671).
    {
      code: `import { memo } from 'react';`,
      output: `import { memo } from 'src/util/memo';`,
      filename: 'src/util/memoize.ts',
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // The wrapper's own test file consumes the wrapper rather than defining it.
    {
      code: `import { memo } from 'react';`,
      output: `import { memo } from 'src/util/memo';`,
      filename: 'src/util/memo.test.ts',
      errors: [{ messageId: 'useCustomMemo' }],
    },
    // A directory named `memo` under a different parent is unrelated (#1671).
    {
      code: `import { memo } from 'react';`,
      output: `import { memo } from 'src/util/memo';`,
      filename: 'src/utils/memo.ts',
      errors: [{ messageId: 'useCustomMemo' }],
    },
  ],
});
