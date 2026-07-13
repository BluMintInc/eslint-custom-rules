import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import { preferMapOverConditionalDispatch } from '../rules/prefer-map-over-conditional-dispatch';

ruleTesterTs.run(
  'prefer-map-over-conditional-dispatch',
  preferMapOverConditionalDispatch,
  {
    valid: [
      // Edge 1: discriminated-union tag switch that narrows the object (reads
      // a sibling variant field) — a flat Record cannot express narrowing.
      `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
declare const result: Result;
function f() {
  switch (result.kind) {
    case 'success':
      return result.data.length;
    case 'failure':
      return 0;
  }
}
`,
      // Edge 1: multiple variants, each reading its own field.
      `
type ReportTarget =
  | { type: 'profile'; userId: string }
  | { type: 'tournament'; tournamentId: string };
declare const target: ReportTarget;
function f() {
  switch (target.type) {
    case 'profile':
      return 'p-' + target.userId;
    case 'tournament':
      return 't-' + target.tournamentId;
  }
}
`,
      // Edge 1: narrowing via a cast of the base object.
      `
type Box = { tag: 'a'; a: number } | { tag: 'b'; b: number };
declare const box: Box;
function f() {
  switch (box.tag) {
    case 'a':
      return (box as { a: number }).a;
    case 'b':
      return (box as { b: number }).b;
  }
}
`,
      // Edge 4: discriminant statically 'string' (trust-boundary switch).
      `
declare function split(): string;
function f() {
  const standard = split();
  switch (standard) {
    case 'native':
      return 1;
    case 'erc20':
      return 2;
    default:
      throw new Error('bad');
  }
}
`,
      // Edge 4: discriminant is 'number'.
      `
declare const n: number;
function f() {
  switch (n) {
    case 1:
      return 'a';
    case 2:
      return 'b';
    default:
      return 'c';
  }
}
`,
      // Edge 4: discriminant is 'boolean'.
      `
declare const flag: boolean;
function f() {
  switch (flag) {
    case true:
      return 1;
    case false:
      return 2;
  }
}
`,
      // Edge 4: T | 'disabled' guard ternary — union contains a function type.
      `
type Handler = (n: number) => void;
declare const onChange: Handler | 'disabled';
function f() {
  return onChange === 'disabled' ? 'disabled' : onChange;
}
`,
      // Edge 5: side-effect-only switch (no return/assignment value).
      `
declare const data: unknown;
type Level = 'warn' | 'error' | 'info';
declare const level: Level;
function log() {
  switch (level) {
    case 'warn':
      console.warn(data);
      break;
    case 'error':
      console.error(data);
      break;
    default:
      console.log(data);
  }
}
`,
      // Edge 5: a branch with an extra statement before the return.
      `
type K = 'a' | 'b';
declare const k: K;
declare function logEvent(s: string): void;
function f() {
  switch (k) {
    case 'a':
      logEvent('a');
      return 1;
    case 'b':
      return 2;
  }
}
`,
      // Edge 9: control-flow-only switch (multi-statement, no unified value).
      `
type Phase = 'checkin' | 'live';
declare const phase: Phase;
declare const match: unknown;
declare function notify(m: unknown): void;
declare function subscribe(m: unknown): void;
function f() {
  switch (phase) {
    case 'checkin':
      notify(match);
      break;
    case 'live':
      subscribe(match);
      break;
  }
}
`,
      // Call-bearing discriminant in a ternary chain (evaluation-count hazard).
      `
type K = 'a' | 'b';
declare function getKind(): K;
function f() {
  return getKind() === 'a' ? 1 : getKind() === 'b' ? 2 : 3;
}
`,
      // Not exhaustive and no default — genuine partial control flow.
      `
type K = 'a' | 'b' | 'c';
declare const k: K;
function f() {
  switch (k) {
    case 'a':
      return 1;
    case 'b':
      return 2;
  }
}
`,
      // Partial coverage with a throwing default (guard, not a lookup table).
      `
type K = 'a' | 'b' | 'c';
declare const k: K;
function f() {
  switch (k) {
    case 'a':
      return 1;
    default:
      throw new Error('x');
  }
}
`,
      // Idempotence: the derived Record form must not re-flag.
      `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const RESULT_BY_SIDE: Record<Side, string> = {
    buy: 'Buy now',
    sell: 'Sell now',
  };
  return RESULT_BY_SIDE[side];
}
`,
      // A boolean ternary that is not an equality-against-literal dispatch.
      `
declare const flag: boolean;
function f() {
  return flag ? 1 : 2;
}
`,
      // An if whose test is not <disc> === <literal>.
      `
declare const k: string;
function f() {
  if (k.length > 0) {
    return 1;
  } else {
    return 2;
  }
}
`,
      // An if branch with a side-effect body (not a single value).
      `
declare const x: string;
declare function doStuff(): void;
function f() {
  if (x === 'a') {
    doStuff();
  }
}
`,
      // Assignments to different targets across branches — not one lookup.
      `
type K = 'a' | 'b';
declare const k: K;
function f() {
  let a = 0;
  let b = 0;
  switch (k) {
    case 'a':
      a = 1;
      break;
    case 'b':
      b = 2;
      break;
  }
  return a + b;
}
`,
      // Mixed return + assignment branches — inconsistent shape.
      `
type K = 'a' | 'b';
declare const k: K;
function f() {
  let x = 0;
  switch (k) {
    case 'a':
      return 1;
    case 'b':
      x = 2;
      break;
  }
  return x;
}
`,
      // Equality between two non-literal operands — not a literal dispatch.
      `
type K = 'a' | 'b';
declare const k: K;
declare const other: K;
function f() {
  return k === other ? 1 : 2;
}
`,
      // Empty switch body.
      `
type K = 'a' | 'b';
declare const k: K;
function f() {
  switch (k) {
  }
}
`,
      // A group mixing default with a literal case — bail.
      `
type K = 'a' | 'b';
declare const k: K;
function f() {
  switch (k) {
    default:
    case 'a':
      return 1;
    case 'b':
      return 2;
  }
}
`,
      // Switch default value kind differs from the explicit branches.
      `
type K = 'a' | 'b' | 'c';
declare const k: K;
function f() {
  let out = '';
  switch (k) {
    case 'a':
      out = 'x';
      break;
    case 'b':
      out = 'y';
      break;
    default:
      return 'z';
  }
  return out;
}
`,
      // else-if chain that switches to a different discriminant.
      `
type K = 'a' | 'b' | 'c';
declare const k: K;
declare const j: string;
function f() {
  if (k === 'a') {
    return 1;
  } else if (j === 'x') {
    return 2;
  }
  return 3;
}
`,
      // if / else where the else body is not a single value.
      `
type K = 'a' | 'b';
declare const k: K;
declare function side(): void;
function f() {
  if (k === 'a') {
    return 1;
  } else {
    side();
  }
}
`,
      // if / else with mismatched branch kinds (return vs assignment).
      `
type K = 'a' | 'b';
declare const k: K;
function f() {
  let out = 0;
  if (k === 'a') {
    return 1;
  } else {
    out = 2;
  }
  return out;
}
`,
    ],
    invalid: [
      // Edge 3/6: full-coverage class-reference switch with a fail-loud default
      // (deduceConstructor) — autofix drops the unreachable default.
      {
        code: `
type TokenStandard = 'native' | 'ERC20' | 'ERC721' | 'ERC1155' | 'offchain' | 'coinflow';
class NativeTokenEncoder {}
class Erc20TokenEncoder {}
class Erc721TokenEncoder {}
class Erc1155TokenEncoder {}
class OffchainTokenEncoder {}
class CoinflowTokenEncoder {}
declare const token: { standard: TokenStandard };
function deduceConstructor() {
  switch (token.standard) {
    case 'native':
      return NativeTokenEncoder;
    case 'ERC20':
      return Erc20TokenEncoder;
    case 'ERC721':
      return Erc721TokenEncoder;
    case 'ERC1155':
      return Erc1155TokenEncoder;
    case 'offchain':
      return OffchainTokenEncoder;
    case 'coinflow':
      return CoinflowTokenEncoder;
    default:
      throw new Error('nope');
  }
}
`,
        output: `
type TokenStandard = 'native' | 'ERC20' | 'ERC721' | 'ERC1155' | 'offchain' | 'coinflow';
class NativeTokenEncoder {}
class Erc20TokenEncoder {}
class Erc721TokenEncoder {}
class Erc1155TokenEncoder {}
class OffchainTokenEncoder {}
class CoinflowTokenEncoder {}
declare const token: { standard: TokenStandard };
function deduceConstructor() {
  const RESULT_BY_STANDARD: Record<TokenStandard, typeof NativeTokenEncoder | typeof Erc20TokenEncoder | typeof Erc721TokenEncoder | typeof Erc1155TokenEncoder | typeof OffchainTokenEncoder | typeof CoinflowTokenEncoder> = {
    native: NativeTokenEncoder,
    ERC20: Erc20TokenEncoder,
    ERC721: Erc721TokenEncoder,
    ERC1155: Erc1155TokenEncoder,
    offchain: OffchainTokenEncoder,
    coinflow: CoinflowTokenEncoder,
  };
  return RESULT_BY_STANDARD[token.standard];
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Edge 8: two-branch ternary on a 2-member literal union.
      {
        code: `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const label = side === 'buy' ? 'Buy now' : 'Sell now';
  return label;
}
`,
        output: `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const RESULT_BY_SIDE: Record<Side, string> = {
    buy: 'Buy now',
    sell: 'Sell now',
  };
  const label = RESULT_BY_SIDE[side];
  return label;
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Edge 2: grouped cases with full coverage.
      {
        code: `
type Raw = 'a' | 'b' | 'c' | 'd';
declare const raw: Raw;
function normalize() {
  switch (raw) {
    case 'a':
      return 'x';
    case 'b':
    case 'c':
      return 'y';
    case 'd':
      return 'z';
  }
}
`,
        output: `
type Raw = 'a' | 'b' | 'c' | 'd';
declare const raw: Raw;
function normalize() {
  const RESULT_BY_RAW: Record<Raw, string> = {
    a: 'x',
    b: 'y',
    c: 'y',
    d: 'z',
  };
  return RESULT_BY_RAW[raw];
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // if / else-if chain with a final else covering the last member.
      {
        code: `
type Kind = 'a' | 'b' | 'c';
declare const kind: Kind;
function pick() {
  if (kind === 'a') {
    return 1;
  } else if (kind === 'b') {
    return 2;
  } else {
    return 3;
  }
}
`,
        output: `
type Kind = 'a' | 'b' | 'c';
declare const kind: Kind;
function pick() {
  const RESULT_BY_KIND: Record<Kind, number> = {
    a: 1,
    b: 2,
    c: 3,
  };
  return RESULT_BY_KIND[kind];
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Assignment form.
      {
        code: `
type Mode = 'on' | 'off';
declare const mode: Mode;
function setup() {
  let label = '';
  switch (mode) {
    case 'on':
      label = 'Enabled';
      break;
    case 'off':
      label = 'Disabled';
      break;
  }
  return label;
}
`,
        output: `
type Mode = 'on' | 'off';
declare const mode: Mode;
function setup() {
  let label = '';
  const RESULT_BY_MODE: Record<Mode, string> = {
    on: 'Enabled',
    off: 'Disabled',
  };
  label = RESULT_BY_MODE[mode];
  return label;
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Edge 6: selecting a function reference (not invoking).
      {
        code: `
type Action = 'start' | 'stop';
declare const action: Action;
declare function handleStart(): void;
declare function handleStop(): void;
function dispatch() {
  switch (action) {
    case 'start':
      return handleStart;
    case 'stop':
      return handleStop;
  }
}
`,
        output: `
type Action = 'start' | 'stop';
declare const action: Action;
declare function handleStart(): void;
declare function handleStop(): void;
function dispatch() {
  const RESULT_BY_ACTION: Record<Action, () => void> = {
    start: handleStart,
    stop: handleStop,
  };
  return RESULT_BY_ACTION[action];
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Edge 3: n-1 explicit cases + a value default covering the last member.
      {
        code: `
type Color = 'red' | 'green' | 'blue';
declare const color: Color;
function label() {
  switch (color) {
    case 'red':
      return 'R';
    case 'green':
      return 'G';
    default:
      return 'B';
  }
}
`,
        output: `
type Color = 'red' | 'green' | 'blue';
declare const color: Color;
function label() {
  const RESULT_BY_COLOR: Record<Color, string> = {
    red: 'R',
    green: 'G',
    blue: 'B',
  };
  return RESULT_BY_COLOR[color];
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Ternary chain of length 2 (three members) with a covering tail.
      {
        code: `
type T = 'a' | 'b' | 'c';
declare const t: T;
function f() {
  const r = t === 'a' ? 1 : t === 'b' ? 2 : 3;
  return r;
}
`,
        output: `
type T = 'a' | 'b' | 'c';
declare const t: T;
function f() {
  const RESULT_BY_T: Record<T, number> = {
    a: 1,
    b: 2,
    c: 3,
  };
  const r = RESULT_BY_T[t];
  return r;
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Number-literal union switch.
      {
        code: `
type Level = 1 | 2 | 3;
declare const level: Level;
function name() {
  switch (level) {
    case 1:
      return 'low';
    case 2:
      return 'mid';
    case 3:
      return 'high';
  }
}
`,
        output: `
type Level = 1 | 2 | 3;
declare const level: Level;
function name() {
  const RESULT_BY_LEVEL: Record<Level, string> = {
    1: 'low',
    2: 'mid',
    3: 'high',
  };
  return RESULT_BY_LEVEL[level];
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Case tests that are constant references resolved to literals.
      {
        code: `
const A = 'a';
const B = 'b';
type X = 'a' | 'b';
declare const x: X;
function f() {
  switch (x) {
    case A:
      return 1;
    case B:
      return 2;
  }
}
`,
        output: `
const A = 'a';
const B = 'b';
type X = 'a' | 'b';
declare const x: X;
function f() {
  const RESULT_BY_X: Record<X, number> = {
    a: 1,
    b: 2,
  };
  return RESULT_BY_X[x];
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // if / else-if chain with full coverage and no trailing else.
      {
        code: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  if (k === 'a') {
    return 1;
  } else if (k === 'b') {
    return 2;
  }
}
`,
        output: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  const RESULT_BY_K: Record<K, number> = {
    a: 1,
    b: 2,
  };
  return RESULT_BY_K[k];
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Flipped equality (<literal> === <discriminant>) in a ternary.
      {
        code: `
type Side = 'buy' | 'sell';
declare const side: Side;
function g() {
  const label = 'buy' === side ? 'B' : 'S';
  return label;
}
`,
        output: `
type Side = 'buy' | 'sell';
declare const side: Side;
function g() {
  const RESULT_BY_SIDE: Record<Side, string> = {
    buy: 'B',
    sell: 'S',
  };
  const label = RESULT_BY_SIDE[side];
  return label;
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // if / else-if chain in assignment form.
      {
        code: `
type M = 'a' | 'b';
declare const m: M;
function f() {
  let out = '';
  if (m === 'a') {
    out = 'x';
  } else {
    out = 'y';
  }
  return out;
}
`,
        output: `
type M = 'a' | 'b';
declare const m: M;
function f() {
  let out = '';
  const RESULT_BY_M: Record<M, string> = {
    a: 'x',
    b: 'y',
  };
  out = RESULT_BY_M[m];
  return out;
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Full explicit coverage plus a value default — the default is dropped.
      {
        code: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  switch (k) {
    case 'a':
      return 1;
    case 'b':
      return 2;
    default:
      return 0;
  }
}
`,
        output: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  const RESULT_BY_K: Record<K, number> = {
    a: 1,
    b: 2,
  };
  return RESULT_BY_K[k];
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Report-only: partial-coverage default (remaining >= 2).
      {
        code: `
type P = 'a' | 'b' | 'c' | 'd';
declare const p: P;
function f() {
  switch (p) {
    case 'a':
      return 1;
    default:
      return 0;
  }
}
`,
        output: null,
        errors: [{ messageId: 'preferMapManual' }],
      },
      // Report-only: async branches (eager promises would fire side effects).
      {
        code: `
type Source = 'algolia' | 'firestore';
declare const source: Source;
declare function fetchA(): Promise<string>;
declare function fetchB(): Promise<string>;
async function f() {
  switch (source) {
    case 'algolia':
      return await fetchA();
    case 'firestore':
      return await fetchB();
  }
}
`,
        output: null,
        errors: [{ messageId: 'preferMapManual' }],
      },
      // Report-only: call-bearing branch values (eager evaluation hazard).
      {
        code: `
type K = 'a' | 'b';
declare const k: K;
declare function makeA(): string;
declare function makeB(): string;
function f() {
  switch (k) {
    case 'a':
      return makeA();
    case 'b':
      return makeB();
  }
}
`,
        output: null,
        errors: [{ messageId: 'preferMapManual' }],
      },
      // Edge 2 + 3: grouped cases AND a partial-coverage default — report-only.
      {
        code: `
type Perm = 'granted' | 'denied' | 'prompt' | 'default' | 'unknown1' | 'unknown2';
declare const raw: Perm;
function normalize() {
  switch (raw) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'default':
    case 'prompt':
      return 'prompt';
    default:
      return 'unsupported';
  }
}
`,
        output: null,
        errors: [{ messageId: 'preferMapManual' }],
      },
      // Edge 2 + 7: grouped cases AND call-bearing values — report-only.
      {
        code: `
type Reason = 'dob-required' | 'invalid-dob' | 'too-young';
declare const reason: Reason;
declare const COPY: { needsDob(): string; tooYoung(): string };
function classify() {
  switch (reason) {
    case 'dob-required':
    case 'invalid-dob':
      return COPY.needsDob();
    case 'too-young':
      return COPY.tooYoung();
  }
}
`,
        output: null,
        errors: [{ messageId: 'preferMapManual' }],
      },
      // Report-only: a ternary chain whose tail is a shared default over
      // multiple remaining members (partial coverage).
      {
        code: `
type P = 'a' | 'b' | 'c' | 'd';
declare const p: P;
function f() {
  const r = p === 'a' ? 1 : 2;
  return r;
}
`,
        output: null,
        errors: [{ messageId: 'preferMapManual' }],
      },
      // Report-only: the derived lookup name collides in scope.
      {
        code: `
type S = 'a' | 'b';
declare const s: S;
declare const RESULT_BY_S: unknown;
function f() {
  switch (s) {
    case 'a':
      return 1;
    case 'b':
      return 2;
  }
}
`,
        output: null,
        errors: [{ messageId: 'preferMapManual' }],
      },
      // Report-only: ternary inside an expression-bodied function.
      {
        code: `
type Side = 'buy' | 'sell';
declare const side: Side;
const f = () => (side === 'buy' ? 1 : 2);
`,
        output: null,
        errors: [{ messageId: 'preferMapManual' }],
      },
    ],
  },
);

// JSX-specific coverage (Edge 10): branch bodies that create elements.
ruleTesterJsx.run(
  'prefer-map-over-conditional-dispatch (jsx)',
  preferMapOverConditionalDispatch,
  {
    valid: [
      // Narrowing JSX switch (reads a sibling variant field) — must not fire.
      `
type State =
  | { status: 'ready'; label: string }
  | { status: 'error'; message: string };
declare const state: State;
declare const Chip: any;
function View() {
  switch (state.status) {
    case 'ready':
      return <Chip text={state.label} />;
    case 'error':
      return <Chip text={state.message} />;
  }
}
`,
    ],
    invalid: [
      // Edge 10: JSX-per-case dispatch on a status union.
      {
        code: `
type Status = 'active' | 'blocked';
declare const status: Status;
declare const Row: any;
function render() {
  switch (status) {
    case 'active':
      return <Row status="active" />;
    case 'blocked':
      return <Row status="blocked" />;
  }
}
`,
        output: `
type Status = 'active' | 'blocked';
declare const status: Status;
declare const Row: any;
function render() {
  const RESULT_BY_STATUS: Record<Status, any> = {
    active: <Row status="active" />,
    blocked: <Row status="blocked" />,
  };
  return RESULT_BY_STATUS[status];
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
      // Edge 10: a branch value that is itself `cond ? <X/> : null` (one
      // expression) does not disqualify.
      {
        code: `
type Status = 'active' | 'blocked';
declare const status: Status;
declare const device: unknown;
declare const Row: any;
function render() {
  switch (status) {
    case 'active':
      return device ? <Row status="active" /> : null;
    case 'blocked':
      return <Row status="blocked" />;
  }
}
`,
        output: `
type Status = 'active' | 'blocked';
declare const status: Status;
declare const device: unknown;
declare const Row: any;
function render() {
  const RESULT_BY_STATUS: Record<Status, any> = {
    active: device ? <Row status="active" /> : null,
    blocked: <Row status="blocked" />,
  };
  return RESULT_BY_STATUS[status];
}
`,
        errors: [{ messageId: 'preferMap' }],
      },
    ],
  },
);
