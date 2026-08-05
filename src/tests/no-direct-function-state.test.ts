import { ruleTesterTs } from '../utils/ruleTester';
import { noDirectFunctionState } from '../rules/no-direct-function-state';

ruleTesterTs.run('no-direct-function-state', noDirectFunctionState, {
  valid: [
    // Already wrapped in a thunk — correct usage
    `
    const [onCloseState, setOnCloseState] = useState<(() => void) | undefined>(undefined);
    setOnCloseState(() => newOnClose);
    `,

    // Functional updater with parameter — correct usage
    `
    const [count, setCount] = useState<number>(0);
    setCount((prev) => prev + 1);
    `,

    // Arrow function expression — always intentional
    `
    const [cb, setCb] = useState<(() => void) | null>(null);
    setCb(() => () => console.log('clicked'));
    `,

    // Clearing state with null — safe
    `
    const [pageForward, setPageForward] = useState<(() => void) | null>(null);
    setPageForward(null);
    `,

    // Clearing state with undefined — safe
    `
    const [onClose, setOnClose] = useState<(() => void) | undefined>(undefined);
    setOnClose(undefined);
    `,

    // Non-function typed state — passing identifier is fine
    `
    const [count, setCount] = useState<number>(0);
    const n = 5;
    setCount(n);
    `,

    // Non-function typed state — passing computed value
    `
    const [total, setTotal] = useState<number>(0);
    const a = 1;
    const b = 2;
    setTotal(a + b);
    `,

    // Call expression result (return type unknown) — skip to avoid FP
    `
    const [cb, setCb] = useState<(() => void) | null>(null);
    setCb(getHandler());
    `,

    // Object literal — safe
    `
    const [config, setConfig] = useState<Record<string, unknown>>({});
    setConfig({ key: 'value' });
    `,

    // Array literal — safe
    `
    const [items, setItems] = useState<string[]>([]);
    setItems(['a', 'b']);
    `,

    // Literal number — safe
    `
    const [count, setCount] = useState<number>(0);
    setCount(42);
    `,

    // Literal string — safe
    `
    const [label, setLabel] = useState<string>('');
    setLabel('hello');
    `,

    // Boolean literal — safe
    `
    const [visible, setVisible] = useState<boolean>(false);
    setVisible(true);
    `,

    // Not a useState setter — any identifier
    `
    function notASetter(fn: () => void) {}
    const myFn = () => {};
    notASetter(myFn);
    `,

    // Updater arrow ignoring previous state — already a thunk, fine
    `
    const [handler, setHandler] = useState<(() => void) | null>(null);
    setHandler(() => myCallback);
    `,

    // useState without type param and arg is non-matching name — no flag
    `
    const [value, setValue] = useState(null);
    const x = 10;
    setValue(x);
    `,

    // Functional updater that ignores prev — intentional, not flagged
    `
    const [items, setItems] = useState<string[]>([]);
    setItems((_prev) => ['a', 'b']);
    `,

    // React.useState form — still tracked, but thunk is safe
    `
    const [cb, setCb] = React.useState<(() => void) | null>(null);
    setCb(() => newCallback);
    `,

    // New expression — safe
    `
    const [m, setM] = useState<Map<string, string>>(new Map());
    setM(new Map([['a', 'b']]));
    `,

    // functionPatterns narrowed away from the name the defaults catch. A custom
    // list REPLACES the defaults, so `on[A-Z].*` no longer applies and the
    // otherwise-identical invalid case below (same code, no options) stops
    // reporting. A member expression keeps the scope-binding fallback out of it,
    // so the naming patterns are the only thing deciding the outcome.
    {
      code: `
const [value, setValue] = useState(null);
setValue(props.onDismiss);
      `,
      options: [{ functionPatterns: ['neverMatchesAnything'] }],
    },

    // Untyped useState plus a name outside the default patterns — the paired
    // invalid case below adds `refresh` to functionPatterns to flag it.
    {
      code: `
const [value, setValue] = useState(null);
setValue(actions.refresh);
      `,
    },

    // Alias resolves to a non-function type — bare identifier stays safe
    `
    type Count = number;
    const [count, setCount] = useState<Count>(0);
    const n = 5;
    setCount(n);
    `,

    // Self-referential/mutually-recursive alias chain terminates instead of
    // resolving to a function type — the reference stays unreported by this
    // signal (name/scope heuristics don't fire either, since `newOnClose` is
    // a `declare`d value, not a locally-bound arrow function).
    `
    type A = B;
    type B = A;
    declare const newOnClose: A;
    const [onCloseState, setOnCloseState] = useState<A | undefined>(undefined);
    setOnCloseState(newOnClose);
    `,

    // TSTypeReference with no matching same-file alias (e.g. an imported
    // type) — unresolvable syntactically, so this signal stays silent.
    `
    import { ToClose } from './types';
    declare const newOnClose: ToClose;
    const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
    setOnCloseState(newOnClose);
    `,

    // Qualified type name (Foo.Bar) — not a plain Identifier, so it's never
    // looked up in the alias map.
    `
    declare const newOnClose: Foo.Bar;
    const [onCloseState, setOnCloseState] = useState<Foo.Bar | undefined>(undefined);
    setOnCloseState(newOnClose);
    `,

    // A nested alias shadows a same-named outer one: the inner declaration is
    // the one in scope, and it is not a function type, so the outer function
    // alias must not leak in and flag the setter.
    `
    type Shadowed = () => void;
    function usePortal() {
      type Shadowed = { id: string };
      const [state, setState] = useState<Shadowed | undefined>(undefined);
      const apply = (payload: Shadowed) => {
        setState(payload);
      };
      return { apply };
    }
    `,

    // Sibling scope: the alias lives in a function the setter is not inside,
    // so it must not resolve.
    `
    function other() {
      type ToClose = () => void;
      return null as unknown as ToClose;
    }
    function usePortal() {
      const [state, setState] = useState<ToClose | undefined>(undefined);
      const apply = (payload: ToClose) => {
        setState(payload);
      };
      return { apply };
    }
    `,

    // Nested alias resolving to a non-function type — bare identifier is safe.
    `
    function useCounter() {
      type Count = number;
      const [count, setCount] = useState<Count>(0);
      const n = 5;
      setCount(n);
    }
    `,

    // Self-referential alias declared inside a function body terminates rather
    // than recursing forever, and resolves to no function type.
    `
    function usePortal() {
      type A = A;
      const [state, setState] = useState<A | undefined>(undefined);
      const apply = (payload: A) => {
        setState(payload);
      };
      return { apply };
    }
    `,
  ],

  invalid: [
    // Real-world bug: usePortal.tsx — function-typed state, bare identifier
    {
      code: `
type ToClose = () => void;
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
const newOnClose = () => {};
setOnCloseState(newOnClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
type ToClose = () => void;
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
const newOnClose = () => {};
setOnCloseState(() => newOnClose);
      `,
    },

    // Explicit function union type — bare identifier
    {
      code: `
const [pageForward, setPageForward] = useState<(() => void) | null>(null);
const showMore = () => {};
setPageForward(showMore);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [pageForward, setPageForward] = useState<(() => void) | null>(null);
const showMore = () => {};
setPageForward(showMore);
      `.replace('setPageForward(showMore);', 'setPageForward(() => showMore);'),
    },

    // Function-typed state, member expression argument
    {
      code: `
const [cb, setCb] = useState<(() => void) | null>(null);
setCb(obj.handler);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [cb, setCb] = useState<(() => void) | null>(null);
setCb(() => obj.handler);
      `,
    },

    // Function type with arguments — bare identifier
    {
      code: `
const [handler, setHandler] = useState<(arg: string) => boolean>();
const validateInput = (s: string) => s.length > 0;
setHandler(validateInput);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [handler, setHandler] = useState<(arg: string) => boolean>();
const validateInput = (s: string) => s.length > 0;
setHandler(() => validateInput);
      `,
    },

    // No explicit type param but arg is bound to an arrow function in scope
    {
      code: `
const [cb, setCb] = useState<(() => void) | null>(null);
const myCallback = () => console.log('hello');
setCb(myCallback);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [cb, setCb] = useState<(() => void) | null>(null);
const myCallback = () => console.log('hello');
setCb(() => myCallback);
      `,
    },

    // Heuristic: name matches 'on[A-Z].*' pattern and no type param
    {
      code: `
const [fn, setFn] = useState(null);
declare const onClose: () => void;
setFn(onClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [fn, setFn] = useState(null);
declare const onClose: () => void;
setFn(() => onClose);
      `,
    },

    // Heuristic: name matches 'handler' pattern
    {
      code: `
const [x, setX] = useState(null);
declare const handler: () => void;
setX(handler);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
declare const handler: () => void;
setX(() => handler);
      `,
    },

    // Heuristic: name matches 'callback'
    {
      code: `
const [x, setX] = useState(null);
declare const callback: () => void;
setX(callback);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
declare const callback: () => void;
setX(() => callback);
      `,
    },

    // Heuristic: name matches 'fn'
    {
      code: `
const [x, setX] = useState(null);
declare const fn: () => void;
setX(fn);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
declare const fn: () => void;
setX(() => fn);
      `,
    },

    // Heuristic: member expression with 'handler' property
    {
      code: `
const [x, setX] = useState(null);
setX(props.onClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
setX(() => props.onClose);
      `,
    },

    // Member expression with 'callback' in property name
    {
      code: `
const [x, setX] = useState(null);
setX(props.callback);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
setX(() => props.callback);
      `,
    },

    // React.useState with function type — bare identifier
    {
      code: `
const [cb, setCb] = React.useState<(() => void) | null>(null);
const myFn = () => {};
setCb(myFn);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [cb, setCb] = React.useState<(() => void) | null>(null);
const myFn = () => {};
setCb(() => myFn);
      `,
    },

    // Function-typed state; setter used in useEffect (different scope still tracked)
    {
      code: `
const [cb, setCb] = useState<(() => void) | null>(null);
function setup() {
  const someFunction = () => {};
  setCb(someFunction);
}
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [cb, setCb] = useState<(() => void) | null>(null);
function setup() {
  const someFunction = () => {};
  setCb(() => someFunction);
}
      `,
    },

    // Arg is a member expression with function-typed state
    {
      code: `
const [onClose, setOnClose] = useState<(() => void) | undefined>(undefined);
setOnClose(props.onClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [onClose, setOnClose] = useState<(() => void) | undefined>(undefined);
setOnClose(() => props.onClose);
      `,
    },

    // Autofix is idempotent: after fix, the thunk is a safe arrow, not re-flagged
    // (verified by the valid test: `setCb(() => newCallback)` — no error)
    // Explicitly test the intermediate invalid form one more time
    {
      code: `
const [onClose, setOnClose] = useState<(() => void) | null>(null);
const closeCancel = () => Promise.resolve();
setOnClose(closeCancel);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [onClose, setOnClose] = useState<(() => void) | null>(null);
const closeCancel = () => Promise.resolve();
setOnClose(() => closeCancel);
      `,
    },

    // Multiple setters in one block — only the function-typed one is flagged
    {
      code: `
const [count, setCount] = useState<number>(0);
const [cb, setCb] = useState<(() => void) | null>(null);
const myFn = () => {};
setCount(1);
setCb(myFn);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [count, setCount] = useState<number>(0);
const [cb, setCb] = useState<(() => void) | null>(null);
const myFn = () => {};
setCount(1);
setCb(() => myFn);
      `,
    },

    // functionPatterns widened to a project-specific name. `refresh` is outside
    // the defaults, so the identical code is valid without this option (see the
    // paired valid case).
    {
      code: `
const [value, setValue] = useState(null);
setValue(actions.refresh);
      `,
      options: [{ functionPatterns: ['refresh'] }],
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [value, setValue] = useState(null);
setValue(() => actions.refresh);
      `,
    },

    // Option-dependence baseline for the narrowed valid case above: the same
    // code with the default patterns, where `on[A-Z].*` matches onDismiss.
    {
      code: `
const [value, setValue] = useState(null);
setValue(props.onDismiss);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [value, setValue] = useState(null);
setValue(() => props.onDismiss);
      `,
    },

    // Same-file type alias resolved via a TSTypeReference — the arg arrives
    // as a `declare`d parameter, so neither the name pattern nor the
    // scope-binding fallback would catch it; only alias resolution does.
    {
      code: `
type ToClose = () => void;
declare const newOnClose: ToClose;
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
setOnCloseState(newOnClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
type ToClose = () => void;
declare const newOnClose: ToClose;
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
setOnCloseState(() => newOnClose);
      `,
    },

    // Same as above, but through the realistic usePortal.tsx shape: the
    // function arrives as a parameter of a returned hook method.
    {
      code: `
type ToClose = () => void;
function usePortal() {
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  const open = (newOnClose: ToClose) => {
    setOnCloseState(newOnClose);
  };
  return { open };
}
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
type ToClose = () => void;
function usePortal() {
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  const open = (newOnClose: ToClose) => {
    setOnCloseState(() => newOnClose);
  };
  return { open };
}
      `,
    },

    // Alias declared AFTER the useState call — proves the alias map is
    // built up front from Program.body rather than relying on visitor order.
    {
      code: `
declare const newOnClose: ToClose;
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
setOnCloseState(newOnClose);
type ToClose = () => void;
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
declare const newOnClose: ToClose;
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
setOnCloseState(() => newOnClose);
type ToClose = () => void;
      `,
    },

    // Alias chain two hops deep: ToClose -> Base -> function type
    {
      code: `
type Base = () => void;
type ToClose = Base;
declare const newOnClose: ToClose;
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
setOnCloseState(newOnClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
type Base = () => void;
type ToClose = Base;
declare const newOnClose: ToClose;
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
setOnCloseState(() => newOnClose);
      `,
    },

    // `export type` alias — still resolved the same way
    {
      code: `
export type ToClose = () => void;
declare const newOnClose: ToClose;
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
setOnCloseState(newOnClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
export type ToClose = () => void;
declare const newOnClose: ToClose;
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
setOnCloseState(() => newOnClose);
      `,
    },

    // Alias to a TSConstructorType (`new () => void`)
    {
      code: `
type Ctor = new () => void;
declare const newCtor: Ctor;
const [c, setC] = useState<Ctor | undefined>(undefined);
setC(newCtor);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
type Ctor = new () => void;
declare const newCtor: Ctor;
const [c, setC] = useState<Ctor | undefined>(undefined);
setC(() => newCtor);
      `,
    },

    // Alias union: `type Maybe = ToClose | undefined` — the useState type
    // parameter references the union alias directly, one hop from the
    // function type.
    {
      code: `
type ToClose = () => void;
type Maybe = ToClose | undefined;
declare const newOnClose: ToClose;
const [onCloseState, setOnCloseState] = useState<Maybe>(undefined);
setOnCloseState(newOnClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
type ToClose = () => void;
type Maybe = ToClose | undefined;
declare const newOnClose: ToClose;
const [onCloseState, setOnCloseState] = useState<Maybe>(undefined);
setOnCloseState(() => newOnClose);
      `,
    },

    // Alias declared inside the hook that uses it — declaring the type beside
    // its consumer is the natural spelling, and the alias is just as readable
    // there as at file scope.
    {
      code: `
function usePortal() {
  type ToClose = () => void;
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  const open = (newOnClose: ToClose) => {
    setOnCloseState(newOnClose);
  };
  return { open };
}
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
function usePortal() {
  type ToClose = () => void;
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  const open = (newOnClose: ToClose) => {
    setOnCloseState(() => newOnClose);
  };
  return { open };
}
      `,
    },

    // Alias declared inside an arrow function body
    {
      code: `
const usePortal = () => {
  type ToClose = () => void;
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  const open = (newOnClose: ToClose) => {
    setOnCloseState(newOnClose);
  };
  return { open };
};
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const usePortal = () => {
  type ToClose = () => void;
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  const open = (newOnClose: ToClose) => {
    setOnCloseState(() => newOnClose);
  };
  return { open };
};
      `,
    },

    // `export type` alias nested in a namespace — the export wrapper and the
    // TSModuleBlock both have to be seen through.
    {
      code: `
namespace Portal {
  export type ToClose = () => void;
  export function usePortal() {
    const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
    const open = (newOnClose: ToClose) => {
      setOnCloseState(newOnClose);
    };
    return { open };
  }
}
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
namespace Portal {
  export type ToClose = () => void;
  export function usePortal() {
    const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
    const open = (newOnClose: ToClose) => {
      setOnCloseState(() => newOnClose);
    };
    return { open };
  }
}
      `,
    },

    // Alias declared inside a bare block
    {
      code: `
{
  type ToClose = () => void;
  declare const newOnClose: ToClose;
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  setOnCloseState(newOnClose);
}
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
{
  type ToClose = () => void;
  declare const newOnClose: ToClose;
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  setOnCloseState(() => newOnClose);
}
      `,
    },

    // Alias declared inside a switch case's block
    {
      code: `
switch (mode) {
  case 'portal': {
    type ToClose = () => void;
    const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
    const open = (newOnClose: ToClose) => {
      setOnCloseState(newOnClose);
    };
    break;
  }
}
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
switch (mode) {
  case 'portal': {
    type ToClose = () => void;
    const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
    const open = (newOnClose: ToClose) => {
      setOnCloseState(() => newOnClose);
    };
    break;
  }
}
      `,
    },

    // Type declarations hoist, so an alias written after the `useState` call
    // that references it still resolves — including inside a function body.
    {
      code: `
function usePortal() {
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  const open = (newOnClose: ToClose) => {
    setOnCloseState(newOnClose);
  };
  type ToClose = () => void;
  return { open };
}
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
function usePortal() {
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  const open = (newOnClose: ToClose) => {
    setOnCloseState(() => newOnClose);
  };
  type ToClose = () => void;
  return { open };
}
      `,
    },

    // Two-hop alias chain declared inside the function body
    {
      code: `
function usePortal() {
  type Base = () => void;
  type ToClose = Base;
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  const open = (newOnClose: ToClose) => {
    setOnCloseState(newOnClose);
  };
  return { open };
}
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
function usePortal() {
  type Base = () => void;
  type ToClose = Base;
  const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
  const open = (newOnClose: ToClose) => {
    setOnCloseState(() => newOnClose);
  };
  return { open };
}
      `,
    },

    // The alias sits in an outer scope relative to the setter call: resolution
    // climbs out of the inner function to find it.
    {
      code: `
function usePortal() {
  type ToClose = () => void;
  function inner() {
    const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
    const open = (newOnClose: ToClose) => {
      setOnCloseState(newOnClose);
    };
    return { open };
  }
  return inner;
}
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
function usePortal() {
  type ToClose = () => void;
  function inner() {
    const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
    const open = (newOnClose: ToClose) => {
      setOnCloseState(() => newOnClose);
    };
    return { open };
  }
  return inner;
}
      `,
    },
  ],
});
