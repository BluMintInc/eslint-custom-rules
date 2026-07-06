import { ruleTesterJsx } from '../utils/ruleTester';
import { preferUseBase62Id } from '../rules/prefer-use-base62-id';

const IN_SCOPE_FILE = 'src/components/example/ExamplePanel.tsx';
const IN_SCOPE_HOOK = 'src/hooks/useExample.ts';
const OUT_OF_SCOPE_FILE = 'src/util/lookupSessionId.ts';
// Issue #1267: getFilename() is absolute/platform-native in production; the rule
// must resolve these against the repo-relative target globs.
const ABSOLUTE_IN_SCOPE_FILE =
  '/Users/dev/agora/src/components/example/ExamplePanel.tsx';
const WINDOWS_IN_SCOPE_HOOK = 'C:\\repo\\src\\hooks\\useExample.ts';
const ABSOLUTE_OUT_OF_SCOPE_FILE = '/Users/dev/agora/src/util/lookupSessionId.ts';

ruleTesterJsx.run('prefer-use-base62-id', preferUseBase62Id, {
  valid: [
    // 1. Setter is used for regeneration — legitimate pattern, do NOT flag
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const WithdrawalMenu = () => {
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv4Base62());
  const submitWithdrawal = async () => {
    setIdempotencyKey(uuidv4Base62());
  };
  return <div>{idempotencyKey}</div>;
};
`,
    },

    // 2. Setter renamed but still used — do NOT flag
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [key, regenerateKey] = useState(() => uuidv4Base62());
  const handleReset = () => { regenerateKey(uuidv4Base62()); };
  return <div>{key}</div>;
};
`,
    },

    // 3. Setter passed to child as prop — do NOT flag (cannot prove unused)
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [key, setKey] = useState(() => uuidv4Base62());
  return <ChildComponent onReset={() => setKey(uuidv4Base62())} />;
};
`,
    },

    // 4. uuidv4Base62() inside a useEffect — do NOT flag (per-operation)
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState, useEffect } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [id, setId] = useState('');
  useEffect(() => {
    setId(uuidv4Base62());
  }, []);
  return <div>{id}</div>;
};
`,
    },

    // 5. uuidv4Base62() inside a callback — do NOT flag (per-operation)
    {
      filename: IN_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const handleClick = () => {
    const operationId = uuidv4Base62();
    submitOperation(operationId);
  };
  return <button onClick={handleClick}>Submit</button>;
};
`,
    },

    // 6. useMemo with non-empty deps — do NOT flag
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useMemo } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = ({ prefix }) => {
  const operationId = useMemo(() => \`\${prefix}-\${uuidv4Base62()}\`, [prefix]);
  return <div>{operationId}</div>;
};
`,
    },

    // 7. useMemo with non-empty deps (array of attachments) — do NOT flag
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useMemo } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = ({ attachments }) => {
  const keys = useMemo(() => {
    return attachments.map(({ image_url }) => {
      return \`Preview-\${image_url ?? uuidv4Base62()}\`;
    });
  }, [attachments]);
  return <div>{keys}</div>;
};
`,
    },

    // 8. File outside target paths — do NOT flag
    {
      filename: OUT_OF_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const lookupSessionId = () => {
  return uuidv4Base62();
};
`,
    },

    // 8b. Issue #1267: an ABSOLUTE path outside the target paths stays exempt
    // after the repo-relative resolution.
    {
      filename: ABSOLUTE_OUT_OF_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const lookupSessionId = () => {
  return uuidv4Base62();
};
`,
    },

    // 9. No import of uuidv4Base62 — do NOT flag
    {
      filename: IN_SCOPE_FILE,
      code: `
import { nanoid } from 'nanoid';
const MyComponent = () => {
  const [id] = useState(() => nanoid());
  return <div>{id}</div>;
};
`,
    },

    // 10. Already using useBase62Id — do NOT flag
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useBase62Id } from '../../hooks/useBase62Id';
const MyComponent = () => {
  const placementId = useBase62Id();
  return <div id={placementId}>Hello</div>;
};
`,
    },

    // 11. useCallback with empty deps — do NOT flag (useCallback always returns a function)
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useCallback } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const genId = useCallback(() => uuidv4Base62(), []);
  return <button onClick={() => genId()}>Go</button>;
};
`,
    },

    // 12. uuidv4Base62() inside class method — do NOT flag
    {
      filename: IN_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
class TokenMetadataInitializer {
  initialize() {
    const id = uuidv4Base62();
    return id;
  }
}
`,
    },

    // 13. Plain utility function in a components file — do NOT flag (camelCase non-hook)
    {
      filename: IN_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
function buildConfig() {
  const id = uuidv4Base62();
  return { id };
}
`,
    },

    // 14. uuid() or other generators — not in scope, do NOT flag
    {
      filename: IN_SCOPE_FILE,
      code: `
import { v4 as uuid } from 'uuid';
const MyComponent = () => {
  const [id] = useState(() => uuid());
  return <div>{id}</div>;
};
`,
    },

    // 15. useRef without uuidv4Base62 — do NOT flag
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef } from 'react';
export function useMyHook() {
  const idRef = useRef(null);
  return idRef;
}
`,
    },

    // 16. useRef with uuidv4Base62 but ref.current is reassigned — do NOT flag
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = useRef(uuidv4Base62());
  const handleReset = () => {
    idRef.current = uuidv4Base62();
  };
  return { id: idRef.current, handleReset };
}
`,
    },

    // 17. Multiple useState — setter used for one, valid separation
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv4Base62());
  const handleSubmit = async () => {
    setIdempotencyKey(uuidv4Base62());
  };
  return <button onClick={handleSubmit}>Submit</button>;
};
`,
    },

    // 18. Setter called with any value (reset pattern) — do NOT flag
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [requestId, setRequestId] = useState(() => uuidv4Base62());
  const reset = () => { setRequestId(generateNewId()); };
  return <button onClick={reset}>Reset</button>;
};
`,
    },
  ],

  invalid: [
    // 1. Classic stable-ID pattern: setter not destructured
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = () => {
  const [placementId] = useState(() => uuidv4Base62());
  return <div id={placementId}>Hello</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 2. Setter destructured but never used
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [id, setId] = useState(() => uuidv4Base62());
  return <div id={id}>Hello</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 3. useRef with uuidv4Base62 — ref.current never reassigned
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useExampleForm() {
  const idRef = useRef(uuidv4Base62());
  return { id: idRef.current };
}
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 4. useMemo with empty dependency array
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useMemo } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const stableId = useMemo(() => uuidv4Base62(), []);
  return <div id={stableId}>Hello</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdUseMemo' }],
    },

    // 5. useMemo with empty deps — larger expression (template literal)
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useMemo } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const formId = useMemo(() => \`form-\${uuidv4Base62()}\`, []);
  return <div id={formId}>Hello</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdUseMemo' }],
    },

    // 6. useState with direct (non-lazy) call — setter unused
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [id] = useState(uuidv4Base62());
  return <div id={id}>Hello</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 7. useState initializer containing uuidv4Base62 in a larger expression — setter unused
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [formId] = useState(() => \`form-\${uuidv4Base62()}\`);
  return <div id={formId}>Hello</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 8. Conditional fallback (nullish coalescing) — setter unused
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = ({ existingId }) => {
  const [id] = useState(() => existingId ?? uuidv4Base62());
  return <div id={id}>Hello</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 9. Ternary initializer — setter unused
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = ({ propId }) => {
  const [id] = useState(() => propId ? propId : uuidv4Base62());
  return <div id={id}>Hello</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 10. Aliased import (import { uuidv4Base62 as uuid } ...) — setter unused
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 as uuid } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [id] = useState(() => uuid());
  return <div id={id}>Hello</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 11. Inside a custom hook — useRef never reassigned
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useStableId() {
  const idRef = useRef(uuidv4Base62());
  return idRef.current;
}
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 12. Multiple useState — only the one with unused setter is flagged
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv4Base62());
  const [stableId] = useState(() => uuidv4Base62());
  const handleSubmit = async () => {
    setIdempotencyKey(uuidv4Base62());
  };
  return <div id={stableId}>{idempotencyKey}</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 13. useState object initializer containing uuidv4Base62 — setter unused
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [config] = useState(() => ({
    id: uuidv4Base62(),
    timestamp: Date.now(),
  }));
  return <div>{config.id}</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 14. useState with setter destructured but never called — renamed setter
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [key, resetKey] = useState(() => uuidv4Base62());
  return <div>{key}</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 15. useState in a hook file — setter not destructured
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useFormId() {
  const [formId] = useState(() => uuidv4Base62());
  return formId;
}
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 16. useMemo empty deps in a hook file
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useMemo } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useStableKey() {
  const stableKey = useMemo(() => uuidv4Base62(), []);
  return stableKey;
}
`,
      errors: [{ messageId: 'preferUseBase62IdUseMemo' }],
    },

    // 17. useState in contexts directory — setter unused
    {
      filename: 'src/contexts/UserContext.tsx',
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const UserContextProvider = ({ children }) => {
  const [sessionId] = useState(() => uuidv4Base62());
  return <div data-session={sessionId}>{children}</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 18. useState in pages directory — setter unused
    {
      filename: 'src/pages/index.tsx',
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const HomePage = () => {
  const [trackingId] = useState(uuidv4Base62());
  return <main data-id={trackingId}>Home</main>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 19. useRef with uuidv4Base62 in component — ref.current never reassigned
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const AdsPanel = () => {
  const idRef = useRef(uuidv4Base62());
  return <div id={idRef.current}>Ad</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 20. Import from util/uuidv4Base62 (monorepo functions path) — setter unused
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from '../../functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const [id] = useState(() => uuidv4Base62());
  return <div id={id}>Hello</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 21. useMemo with empty deps — object expression containing uuidv4Base62
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useMemo } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const config = useMemo(() => ({ id: uuidv4Base62() }), []);
  return <div>{config.id}</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdUseMemo' }],
    },

    // 22. Issue #1267: an ABSOLUTE (POSIX) in-scope path must be enforced.
    // Before the repo-relative resolution, minimatch never matched an absolute
    // path, so the rule silently no-op'd for every real (absolute) filename.
    {
      filename: ABSOLUTE_IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = () => {
  const [placementId] = useState(() => uuidv4Base62());
  return <div id={placementId}>Hello</div>;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 23. Issue #1267: a Windows backslash in-scope path must be enforced too.
    {
      filename: WINDOWS_IN_SCOPE_HOOK,
      code: `
import { useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useExampleForm() {
  const idRef = useRef(uuidv4Base62());
  return { id: idRef.current };
}
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },
  ],
});
