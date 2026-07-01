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
  ],
});
