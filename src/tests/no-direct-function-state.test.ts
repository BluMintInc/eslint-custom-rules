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

    // `?.` does not retire the CallExpression carve-out. `factory?.build()` is
    // still a call whose return type is unknown without a checker, so the same
    // "skip, no FP" verdict applies as for `factory.build()`. Reporting it would
    // emit `() => factory?.build()`, deferring the call into a React updater
    // that must stay pure — a semantics change on working code.
    {
      code: `
const [cb, setCb] = useState<(() => void) | null>(null);
setCb(factory?.build());
      `,
      output: null,
    },

    // Optional-call spelling of the same carve-out.
    {
      code: `
const [cb, setCb] = useState<(() => void) | null>(null);
setCb(makeFn?.());
      `,
      output: null,
    },

    // Optional member read followed by a plain call.
    {
      code: `
const [cb, setCb] = useState<(() => void) | null>(null);
setCb(factory.build?.());
      `,
      output: null,
    },

    // The real-world shape from the report: a ref read inside the call.
    {
      code: `
const [cb, setCb] = useState<(() => void) | null>(null);
setCb(ref.current?.getHandler());
      `,
      output: null,
    },

    // A call carve-out reached through both wrapper kinds at once.
    {
      code: `
const [cb, setCb] = useState<(() => void) | null>(null);
setCb(factory?.build() as (() => void) | null);
      `,
      output: null,
    },

    // Seeing through the wrappers must not manufacture a name match: `value` is
    // outside every default pattern, so the optional read stays silent under an
    // untyped useState.
    {
      code: `
const [x, setX] = useState(null);
setX(props?.value);
      `,
      output: null,
    },

    // Unwrapping the declarator's initializer must not widen which calls count
    // as `useState`: an optional call to something else registers no setter.
    {
      code: `
const [x, setX] = hooks?.useToggle(null);
setX(props.onClose);
      `,
      output: null,
    },

    // A type parameter shadows a same-named alias for every type position
    // inside it, so the outer `() => void` says nothing about this state and
    // cannot justify a report — let alone the thunk rewrite it used to
    // produce (#2257).
    {
      code: `
type ToClose = () => void;
function useThing<ToClose>(initial: ToClose) {
  const [state, setState] = useState<ToClose | undefined>(undefined);
  const next = initial;
  setState(next);
  return state;
}
      `,
      output: null,
    },

    // The same shadowing through a class type parameter, where the reference
    // sits two containers below the binder.
    {
      code: `
type Handler = () => void;
class Store<Handler> {
  run(initial: Handler) {
    const [state, setState] = useState<Handler | null>(null);
    setState(initial);
    return state;
  }
}
      `,
      output: null,
    },

    // A VALUE binder must not shadow a type name: the parameter named `ToClose`
    // leaves the alias resolvable, so this still resolves and stays valid only
    // because the setter argument is a thunk.
    {
      code: `
type ToClose = () => void;
function useThing(ToClose: number) {
  const [state, setState] = useState<ToClose | undefined>(undefined);
  const next = () => {};
  setState(() => next);
  return state;
}
      `,
      output: null,
    },
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

    // Over-decline control for the shadow test: a PARAMETER named `ToClose`
    // binds only in value space, so the alias still answers here and the report
    // must survive. Declining on any same-named binder would silence this.
    {
      code: `
type ToClose = () => void;
function useThing(ToClose: number) {
  const [state, setState] = useState<ToClose | undefined>(undefined);
  const next = () => {};
  setState(next);
  return state;
}
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
type ToClose = () => void;
function useThing(ToClose: number) {
  const [state, setState] = useState<ToClose | undefined>(undefined);
  const next = () => {};
  setState(() => next);
  return state;
}
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

    // An uncompilable entry in functionPatterns is REPORTED, not swallowed.
    // Dropping it silently leaves the consumer's allowlist inert while the rule
    // goes on reporting the very code the pattern was written to exclude, with
    // nothing anywhere saying why.
    {
      code: `
const [value, setValue] = useState(null);
setValue(42);
      `,
      options: [{ functionPatterns: ['on[A-Z'] }],
      errors: [{ messageId: 'invalidFunctionPattern' }],
    },

    // The invalid entry does not disable the entries that DO compile: `refresh`
    // still matches, so both reports stand. A rule that bailed on the whole
    // option at the first bad entry would show only the pattern error here.
    {
      code: `
const [value, setValue] = useState(null);
setValue(actions.refresh);
      `,
      options: [{ functionPatterns: ['on[A-Z', 'refresh'] }],
      errors: [
        { messageId: 'invalidFunctionPattern' },
        { messageId: 'noDirectFunctionState' },
      ],
      output: `
const [value, setValue] = useState(null);
setValue(() => actions.refresh);
      `,
    },

    // Every uncompilable entry is named separately — a consumer with two typos
    // has two mistakes to correct, and a single pooled report would hide one.
    {
      code: `
const [value, setValue] = useState(null);
setValue(42);
      `,
      options: [{ functionPatterns: ['on[A-Z', '*bad'] }],
      errors: [
        { messageId: 'invalidFunctionPattern' },
        { messageId: 'invalidFunctionPattern' },
      ],
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

    // Optional chaining: `props?.onClose` is a ChainExpression wrapping the
    // MemberExpression, and the hazard is unchanged by the nullish branch —
    // when `props` is present and `onClose` is a function, React still invokes
    // it as an updater. The thunk remedy is total: the `?.` is preserved
    // verbatim inside it, so it cannot throw where the original did not.
    {
      code: `
const [x, setX] = useState(null);
setX(props?.onClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
setX(() => props?.onClose);
      `,
    },

    // Deeper chain, optional link before the flagged property.
    {
      code: `
const [x, setX] = useState(null);
setX(a.b?.onClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
setX(() => a.b?.onClose);
      `,
    },

    // Deeper chain, optional link earlier than the last member read — the
    // ChainExpression still wraps the outermost MemberExpression.
    {
      code: `
const [x, setX] = useState(null);
setX(a?.b.onClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
setX(() => a?.b.onClose);
      `,
    },

    // Optional chaining under a custom pattern list — the name signal reads the
    // same property whether or not the access is optional.
    {
      code: `
const [value, setValue] = useState(null);
setValue(actions?.refresh);
      `,
      options: [{ functionPatterns: ['refresh'] }],
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [value, setValue] = useState(null);
setValue(() => actions?.refresh);
      `,
    },

    // `as` is erased at runtime, so the argument is still the function the
    // pattern names. The fix is declined and the message names the hoist
    // instead: a thunk returning the cast would be an arrow returning a type
    // assertion, which no-type-assertion-returns (also `error` in recommended)
    // reports — trading one error for another under `--fix`.
    {
      code: `
const [x, setX] = useState(null);
setX(props.onClose as any);
      `,
      errors: [{ messageId: 'noDirectFunctionStateAssertion' }],
      output: null,
    },

    // Both wrapper kinds stacked: TSAsExpression over ChainExpression.
    {
      code: `
const [x, setX] = useState(null);
setX(props?.onClose as any);
      `,
      errors: [{ messageId: 'noDirectFunctionStateAssertion' }],
      output: null,
    },

    // Only a TOP-LEVEL assertion costs the fix. Nested inside the argument, the
    // thunk ends up returning a member read, which no-type-assertion-returns
    // exempts — so this one keeps its autofix.
    {
      code: `
const [x, setX] = useState(null);
setX((props as any).onClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
setX(() => (props as any).onClose);
      `,
    },

    // Angle-bracket type assertion — same decline.
    {
      code: `
const [x, setX] = useState(null);
setX(<any>props.onClose);
      `,
      errors: [{ messageId: 'noDirectFunctionStateAssertion' }],
      output: null,
    },

    // A function-typed state reaches the same argument through the primary
    // signal rather than the name pattern, and must decline identically. This
    // path predates the optional-chaining fix: `isDefinitelySafeArg` already
    // unwrapped `as`, so this snippet was already being rewritten into a
    // no-type-assertion-returns violation.
    {
      code: `
const [cb, setCb] = useState<(() => void) | null>(null);
setCb(obj.handler as any);
      `,
      errors: [{ messageId: 'noDirectFunctionStateAssertion' }],
      output: null,
    },

    // `satisfies` — same erased wrapper.
    {
      code: `
const [x, setX] = useState(null);
setX(props.onClose satisfies unknown);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
setX(() => props.onClose satisfies unknown);
      `,
    },

    // Non-null assertion over a member read.
    {
      code: `
const [x, setX] = useState(null);
setX(props.onClose!);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
setX(() => props.onClose!);
      `,
    },

    // The scope-binding signal reads the same argument, so it has to see
    // through the wrappers too: `myCallback` is bound to an arrow function and
    // its name matches no pattern, making the binding the only live signal.
    {
      code: `
const [x, setX] = useState(null);
const myCallback = () => {};
setX(myCallback!);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
const myCallback = () => {};
setX(() => myCallback!);
      `,
    },

    // Instantiation expression (`fn<T>`) is erased too, so the reference it
    // wraps is still a bare function reference.
    {
      code: `
const [x, setX] = useState(null);
declare function onSelect<T>(value: T): void;
setX(onSelect<string>);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState(null);
declare function onSelect<T>(value: T): void;
setX(() => onSelect<string>);
      `,
    },

    // An optionally-accessed hook still declares a setter. Missing it does not
    // merely lose this declaration — it untracks `setX` for the whole file, so
    // every later setter call goes unchecked too.
    {
      code: `
const [x, setX] = React?.useState(null);
setX(props.onClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = React?.useState(null);
setX(() => props.onClose);
      `,
    },

    // Optional-call spelling of the hook itself.
    {
      code: `
const [x, setX] = useState?.(null);
setX(props.onClose);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [x, setX] = useState?.(null);
setX(() => props.onClose);
      `,
    },

    // Unwrapping a ChainExpression must not exempt the member read it contains:
    // under a function-typed state, `obj?.handler` is as suspect as
    // `obj.handler`.
    {
      code: `
const [cb, setCb] = useState<(() => void) | null>(null);
setCb(obj?.handler);
      `,
      errors: [{ messageId: 'noDirectFunctionState' }],
      output: `
const [cb, setCb] = useState<(() => void) | null>(null);
setCb(() => obj?.handler);
      `,
    },
  ],
});
