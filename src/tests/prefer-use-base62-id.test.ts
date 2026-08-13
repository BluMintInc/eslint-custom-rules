import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { preferUseBase62Id } from '../rules/prefer-use-base62-id';

const IN_SCOPE_FILE = 'src/components/example/ExamplePanel.tsx';
const IN_SCOPE_HOOK = 'src/hooks/useExample.ts';
const OUT_OF_SCOPE_FILE = 'src/util/lookupSessionId.ts';
// Issue #1267: getFilename() is absolute/platform-native in production; the rule
// must resolve these against the repo-relative target globs.
const ABSOLUTE_IN_SCOPE_FILE =
  '/Users/dev/agora/src/components/example/ExamplePanel.tsx';
const WINDOWS_IN_SCOPE_HOOK = 'C:\\repo\\src\\hooks\\useExample.ts';
const ABSOLUTE_OUT_OF_SCOPE_FILE =
  '/Users/dev/agora/src/util/lookupSessionId.ts';

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

    // 8c. `targetPaths` baseline for the WIDENING pair: with the option left at
    // its default this out-of-scope file is exempt. Invalid case 28 runs the
    // same code and filename with `targetPaths` widened to cover `src/util/**`.
    {
      filename: OUT_OF_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const SessionPanel = () => {
  const [id] = useState(() => uuidv4Base62());
  return id;
};
`,
    },

    // 8d. `targetPaths` NARROWED away from `src/hooks/**` exempts a file the
    // default list covers. An inclusion filter has to be probed in both
    // directions — widening alone cannot tell a narrow default from an
    // ignored option.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const SessionPanel = () => {
  const [id] = useState(() => uuidv4Base62());
  return id;
};
`,
      options: [{ targetPaths: ['src/pages/**'] }],
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

    // 19. Bare top-level call whose result is discarded — nothing to stabilize,
    // so no hydration mismatch is possible. Only an assigned value is flagged.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  uuidv4Base62();
  return <div />;
};
`,
    },

    // 20. Call nested in an event handler — runs per interaction, not per
    // render, so the ID is meant to be fresh each time.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const submit = () => {
    const requestId = uuidv4Base62();
    send(requestId);
  };
  return <button onClick={submit}>Send</button>;
};
`,
    },

    // 21. Plain camelCase helper is not a component or hook, so a per-call ID
    // is the expected behaviour.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const buildPayload = () => {
  const requestId = uuidv4Base62();
  return { requestId };
};
`,
    },

    // 22. Same top-level assignment, but outside the enforced directories.
    // Kept JSX-free because the out-of-scope fixture is a .ts path.
    {
      filename: OUT_OF_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const id = uuidv4Base62();
  return id;
};
`,
    },

    // 23. A type assertion between the useRef call and its declarator is
    // semantically neutral, so the reassignment exemption of case 16 must
    // survive it (issue #1782).
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef, MutableRefObject } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = useRef(uuidv4Base62()) as MutableRefObject<string>;
  const handleReset = () => {
    idRef.current = uuidv4Base62();
  };
  return { id: idRef.current, handleReset };
}
`,
    },

    // 24. `satisfies` is likewise type-only.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef, MutableRefObject } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = useRef(uuidv4Base62()) satisfies MutableRefObject<string>;
  const handleReset = () => {
    idRef.current = uuidv4Base62();
  };
  return { id: idRef.current, handleReset };
}
`,
    },

    // 25. A double assertion nests two TSAsExpression nodes, so unwrapping the
    // wrappers must loop rather than peel a single layer.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef, MutableRefObject } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = useRef(uuidv4Base62()) as unknown as MutableRefObject<string>;
  const handleReset = () => {
    idRef.current = uuidv4Base62();
  };
  return { id: idRef.current, handleReset };
}
`,
    },

    // 26. The non-null assertion is the third type-only wrapper.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = useRef(uuidv4Base62())!;
  const handleReset = () => {
    idRef.current = uuidv4Base62();
  };
  return { id: idRef.current, handleReset };
}
`,
    },

    // 27. Parentheses around the assertion must not hide the declarator either.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef, MutableRefObject } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = (useRef(uuidv4Base62()) as MutableRefObject<string>)!;
  const handleReset = () => {
    idRef.current = uuidv4Base62();
  };
  return { id: idRef.current, handleReset };
}
`,
    },

    // 28. A memo-wrapped component already on `useBase62Id` is the target state,
    // so seeing through the wrapper must not invent a finding.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { memo } from 'react';
import { useBase62Id } from 'src/hooks/useBase62Id';
const ExamplePanel = memo(() => {
  const placementId = useBase62Id();
  return <div id={placementId}>Hello</div>;
});
`,
    },

    // 29. The climb answers with the OUTER binding's name, so a wrapper cannot
    // launder a non-component into one: this binding is neither PascalCase nor a
    // hook name, and stays exempt exactly as its unwrapped spelling does.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { memo, useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const buildSessionId = memo(() => {
  const [sessionId] = useState(() => uuidv4Base62());
  return sessionId;
});
`,
    },

    // 30. Only the first argument carries the component. A comparator passed as
    // `memo`'s second argument runs per comparison, so an ID minted inside it is
    // per-operation and not a stable component ID.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { memo } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = memo(ExamplePanelUnmemoized, (prev, next) => {
  const traceId = uuidv4Base62();
  logComparison(traceId, prev, next);
  return prev.id === next.id;
});
`,
    },

    // 31. Only the wrappers `require-memo` emits are climbed. An arbitrary
    // callee is no evidence of component-hood — its argument is as likely a
    // callback, where a per-operation ID is the point — so it stays a boundary.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const SessionRunner = createRunner(() => {
  const operationId = uuidv4Base62();
  return operationId;
});
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

    // 24. Top-level assignment in a component: regenerates the ID on every
    // render. This is the only shape that reports preferUseBase62IdTopLevel,
    // and #1484 found the branch had no coverage at all.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const id = uuidv4Base62();
  return <div id={id} />;
};
`,
      errors: [{ messageId: 'preferUseBase62IdTopLevel' }],
    },

    // 25. The import may be aliased; tracking is by local binding, not by the
    // exported name.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { uuidv4Base62 as makeId } from 'functions/src/util/uuidv4Base62';
const MyComponent = () => {
  const id = makeId();
  return <div id={id} />;
};
`,
      errors: [{ messageId: 'preferUseBase62IdTopLevel' }],
    },

    // 26. Function-declaration component form, not just the arrow form.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function MyComponent() {
  const id = uuidv4Base62();
  return <div id={id} />;
}
`,
      errors: [{ messageId: 'preferUseBase62IdTopLevel' }],
    },

    // 27. Custom hooks re-render with their caller, so the same instability
    // applies there.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useExampleForm() {
  const id = uuidv4Base62();
  return { id };
}
`,
      errors: [{ messageId: 'preferUseBase62IdTopLevel' }],
    },

    // 28. `targetPaths` WIDENED to include `src/util/**` brings a file the
    // defaults exempt into scope. Pairs with valid case 8c on identical code
    // and filename, so the option is the only difference.
    {
      filename: OUT_OF_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const SessionPanel = () => {
  const [id] = useState(() => uuidv4Base62());
  return id;
};
`,
      options: [{ targetPaths: ['src/util/**'] }],
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 29. The default-`targetPaths` half of the NARROWING pair with valid case
    // 8d: the same hook file reports once the option stops excluding it.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const SessionPanel = () => {
  const [id] = useState(() => uuidv4Base62());
  return id;
};
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 30. Anti-vacuity control for valid case 23: looking through the assertion
    // must still leave a never-reassigned ref reportable.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef, MutableRefObject } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = useRef(uuidv4Base62()) as MutableRefObject<string>;
  return { id: idRef.current };
}
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 31. Same control for `satisfies`.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef, MutableRefObject } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = useRef(uuidv4Base62()) satisfies MutableRefObject<string>;
  return { id: idRef.current };
}
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 32. Same control for the double assertion.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef, MutableRefObject } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = useRef(uuidv4Base62()) as unknown as MutableRefObject<string>;
  return { id: idRef.current };
}
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 33. Same control for the non-null assertion.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = useRef(uuidv4Base62())!;
  return { id: idRef.current };
}
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 34. A destructured ref has no name to track reassignment through, so the
    // conservative report stands.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const { current } = useRef(uuidv4Base62());
  return { id: current };
}
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 35. A useRef whose result is never bound is equally untrackable.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  useRef(uuidv4Base62());
  return null;
}
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 36. Returning the ref directly escapes it from the analyzable scope.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  return useRef(uuidv4Base62());
}
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 37. `memo(...)` is the shape `require-memo` autofixes a component INTO, so
    // the wrapper may not hide the hydration hazard from this rule (#2005).
    {
      filename: IN_SCOPE_FILE,
      code: `
import { memo, useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = memo(({ existingId }) => {
  const [placementId] = useState(() => existingId ?? uuidv4Base62());
  return <div id={placementId}>Hello</div>;
});
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 38. The same for the useRef handler.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { memo, useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = memo(() => {
  const idRef = useRef(uuidv4Base62());
  return <div id={idRef.current}>Hello</div>;
});
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 39. …and for the empty-deps useMemo handler.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { memo, useMemo } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = memo(() => {
  const stableId = useMemo(() => uuidv4Base62(), []);
  return <div id={stableId}>Hello</div>;
});
`,
      errors: [{ messageId: 'preferUseBase62IdUseMemo' }],
    },

    // 40. …and for a bare call at the wrapped component's top level.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { memo } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = memo(() => {
  const placementId = uuidv4Base62();
  return <div id={placementId}>Hello</div>;
});
`,
      errors: [{ messageId: 'preferUseBase62IdTopLevel' }],
    },

    // 41. The namespaced callee `React.memo` names the same wrapper.
    {
      filename: IN_SCOPE_FILE,
      code: `
import React, { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = React.memo(() => {
  const [placementId] = useState(() => uuidv4Base62());
  return <div id={placementId}>Hello</div>;
});
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 42. `forwardRef` is the wrapper `require-memo` pairs with `memo` whenever
    // a ref is forwarded.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { forwardRef, useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = forwardRef((props, ref) => {
  const [placementId] = useState(() => uuidv4Base62());
  return <div id={placementId} ref={ref}>Hello</div>;
});
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 43. Nested wrappers peel one after the other.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { forwardRef, memo, useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = memo(
  forwardRef((props, ref) => {
    const [placementId] = useState(() => uuidv4Base62());
    return <div id={placementId} ref={ref}>Hello</div>;
  }),
);
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 44. The comparator `memo-compare-deeply-complex-props` adds as a second
    // argument leaves the component in first position.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { useState } from 'react';
import { compareDeeply, memo } from 'src/util/memo';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = memo(({ existingId }) => {
  const [placementId] = useState(() => uuidv4Base62());
  return <div id={placementId} data-existing={existingId}>Hello</div>;
}, compareDeeply('existingId'));
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 45. `memo?.(...)` parses as a ChainExpression around the call, so the
    // wrapper sits one node deeper than the plain spelling.
    {
      filename: IN_SCOPE_FILE,
      parserOptions: { ecmaVersion: 2020 },
      code: `
import { memo, useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = memo?.(() => {
  const [placementId] = useState(() => uuidv4Base62());
  return <div id={placementId}>Hello</div>;
});
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 46. The same for an optional member callee, `React?.memo(...)`.
    {
      filename: IN_SCOPE_FILE,
      parserOptions: { ecmaVersion: 2020 },
      code: `
import React, { useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = React?.memo(() => {
  const [placementId] = useState(() => uuidv4Base62());
  return <div id={placementId}>Hello</div>;
});
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 47. The function-expression spelling `require-memo` emits when it rewrites
    // a function declaration.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { memo, useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = memo(function ExamplePanelUnmemoized() {
  const [placementId] = useState(() => uuidv4Base62());
  return <div id={placementId}>Hello</div>;
});
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 48. A type-only wrapper may sit OUTSIDE the memo call, between it and the
    // declarator, so the climb has to look through both kinds of wrapper.
    {
      filename: IN_SCOPE_FILE,
      code: `
import { FC, memo, useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
const ExamplePanel = memo(() => {
  const [placementId] = useState(() => uuidv4Base62());
  return <div id={placementId}>Hello</div>;
}) as FC;
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },

    // 49. A memo-wrapped custom hook is reached by the hook-name half of the
    // same predicate.
    {
      filename: IN_SCOPE_HOOK,
      code: `
import { memo, useRef } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export const useExampleId = memo(() => {
  const idRef = useRef(uuidv4Base62());
  return idRef.current;
});
`,
      errors: [{ messageId: 'preferUseBase62IdHook' }],
    },
  ],
});

/**
 * The angle-bracket assertion is the fourth type-only wrapper, and it only
 * parses where JSX is off, so it needs the non-JSX tester.
 */
ruleTesterTs.run(
  'prefer-use-base62-id (angle-bracket assertion)',
  preferUseBase62Id,
  {
    valid: [
      // The reassignment exemption survives the assertion.
      {
        filename: IN_SCOPE_HOOK,
        code: `
import { useRef, MutableRefObject } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = <MutableRefObject<string>>useRef(uuidv4Base62());
  const handleReset = () => {
    idRef.current = uuidv4Base62();
  };
  return { id: idRef.current, handleReset };
}
`,
      },
    ],

    invalid: [
      // Anti-vacuity control: without a reassignment the report stands.
      {
        filename: IN_SCOPE_HOOK,
        code: `
import { useRef, MutableRefObject } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
export function useMyHook() {
  const idRef = <MutableRefObject<string>>useRef(uuidv4Base62());
  return { id: idRef.current };
}
`,
        errors: [{ messageId: 'preferUseBase62IdHook' }],
      },
    ],
  },
);
