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
  ],
});
