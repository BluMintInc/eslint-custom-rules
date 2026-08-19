import { parse } from '@typescript-eslint/parser';
import { TSESLint } from '@typescript-eslint/utils';
import * as prettier from 'prettier';
import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import {
  normalizeTypeQuotes,
  preferMapOverConditionalDispatch,
  reflowsWhenOverWide,
} from '../rules/prefer-map-over-conditional-dispatch';

type RuleMessageIds = 'preferMap' | 'preferMapManual';
type RuleOptions = [{ printWidth?: number; singleQuote?: boolean }];
type RuleTests = TSESLint.RunTests<RuleMessageIds, RuleOptions>;

const tsTests: RuleTests = {
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
    // Edge 1 (#1867): the same narrowing switch written with an optional-chained
    // discriminant. ESTree wraps `result?.kind` in a ChainExpression, and reading
    // that node's type as "not a member access" skipped the exemption above and
    // reported `preferMapManual`. TypeScript discriminates the union through the
    // optional chain (this snippet compiles), so the Record the message urges
    // hoists `result.data` out of the narrowing and does NOT compile (TS2339) —
    // a nullable discriminant is exactly where `?.` gets written.
    `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
declare const result: Result;
function f() {
  switch (result?.kind) {
    case 'success':
      return result.data.length;
    case 'failure':
      return 0;
  }
}
`,
    // Edge 1 (#1867): every link of the chain optional, and the branch values
    // optional-chained too — the shape a `?.`-heavy codebase actually produces.
    `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
declare const result: Result;
function f() {
  switch (result?.kind) {
    case 'success':
      return result?.data?.length;
    case 'failure':
      return 0;
  }
}
`,
    // Edge 1 (#1929): the ternary arm reaches the narrowing exemption through
    // the same unwrapping, so teaching it to see `?.` must not turn a narrowing
    // ternary into a false positive whose remedy does not compile — hoisting
    // `result.data` out of the narrowing fails with TS2339 exactly as it does
    // in the switch form.
    `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
declare const result: Result;
function f() {
  const size = result?.kind === 'success' ? result.data.length : 0;
  return size;
}
`,
    // Edge 1 (#1929): the plain spelling of the ternary above, so the pair
    // proves the exemption — not blindness to `?.` — is what keeps both quiet.
    `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
declare const result: Result;
function f() {
  const size = result.kind === 'success' ? result.data.length : 0;
  return size;
}
`,
    // Edge 1 (#1929): a non-null assertion narrows the union exactly as the
    // plain access does, so the exemption must survive it in either arm. A walk
    // that stops at the assertion cannot name the root `result`, and the
    // construct is then reported with a Record that hoists `result.data` out of
    // the narrowing (TS2339).
    `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
declare const result: Result;
function f() {
  switch (result!.kind) {
    case 'success':
      return result.data.length;
    case 'failure':
      return 0;
  }
}
`,
    `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
declare const result: Result;
function f() {
  const size = result!.kind === 'success' ? result.data.length : 0;
  return size;
}
`,
    // Edge 1 (#1929): the assertion sits mid-chain, above an optional link —
    // the root is two wrappers down and still names the narrowed object.
    `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
type Box = { r: Result };
declare const box: Box;
function f() {
  const size = box?.r!.kind === 'success' ? box.r.data.length : 0;
  return size;
}
`,
    // Edge 1 (#1929): the assertion applies to the tag access as a whole, which
    // leaves the same narrowing to lose.
    `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
declare const result: Result;
function f() {
  switch (result.kind!) {
    case 'success':
      return result.data.length;
    case 'failure':
      return 0;
  }
}
`,
    // Edge 1 (#1929): the if/else-if arm derives its discriminant through the
    // same helper, so it reaches the same exemption under `?.`.
    `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
declare const result: Result;
function f() {
  if (result?.kind === 'success') {
    return result.data.length;
  } else {
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
    // Edge 1 (#1626): the narrowed base object is reached through `this` —
    // rooting the discriminant chain at `this` must not lose the narrowing
    // exemption, or the fix hoists `this.result.data` out of the narrowing
    // (TS2339).
    `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
class Holder {
  public result!: Result;
  public describe() {
    switch (this.result.kind) {
      case 'success':
        return this.result.data.length;
      case 'failure':
        return 0;
    }
  }
}
`,
    // Edge 1 (#1626 + #1867): the this-rooted chain written optional. The
    // ChainExpression sits above the OUTERMOST link only, so the walk to the
    // `this` root still has to run after one unwrap.
    `
type Result = { kind: 'success'; data: string } | { kind: 'failure' };
class Holder {
  public result!: Result;
  public describe() {
    switch (this?.result?.kind) {
      case 'success':
        return this?.result?.data?.length;
      case 'failure':
        return 0;
    }
  }
}
`,
    // Edge 1 (#1626): deeper this-rooted chain (agora's ReportAlerter shape
    // without its destructuring).
    `
type ReportTarget =
  | { type: 'profile'; userId: string }
  | { type: 'tournament'; tournamentId: string };
class ReportAlerter {
  private readonly options!: { target: ReportTarget };
  private get targetReference() {
    switch (this.options.target.type) {
      case 'profile':
        return \`User: \${this.options.target.userId}\`;
      case 'tournament':
        return \`Tournament: \${this.options.target.tournamentId}\`;
    }
  }
}
`,
    // Edge 1 (#1626): `this` is itself the base object (chain length 1) — the
    // branches read sibling members off the same receiver, exactly as the
    // identifier-rooted `switch (o.kind)` form does.
    `
class Widget {
  public readonly kind: 'compact' | 'full' = 'compact';
  private readonly compactWidth = 120;
  private readonly fullWidth = 480;
  public width() {
    switch (this.kind) {
      case 'compact':
        return this.compactWidth;
      case 'full':
        return this.fullWidth;
    }
  }
}
`,
    // Edge 1 (#1626): mixed branches — the exemption is any-kept-branch, so one
    // branch reading through `this` exempts the construct, matching how a single
    // `box`-reading branch exempts the identifier-rooted form.
    `
type Payload = { mode: 'inline'; body: string } | { mode: 'empty' };
class Renderer {
  private readonly payload!: Payload;
  public render() {
    switch (this.payload.mode) {
      case 'inline':
        return this.payload.body;
      case 'empty':
        return '';
    }
  }
}
`,
    // Edge 1 (#1626): an arrow branch value closes over the lexical `this`, so
    // it reads the narrowed receiver exactly as a closure over an identifier
    // root reads its binding.
    `
type Job = { mode: 'timed'; budgetMs: number } | { mode: 'instant' };
class Runner {
  private readonly job!: Job;
  public schedule() {
    switch (this.job.mode) {
      case 'timed':
        return () => this.job;
      case 'instant':
        return () => null;
    }
  }
}
`,
    // #1929: an assertion on the tag access as a WHOLE (rather than on a link
    // inside the chain) stays out of scope for the ternary/if forms: the name
    // and key-type derivations reach the member access through the chain
    // unwrap, so admitting it would emit a report no fix can serve.
    `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  const label = flags.tier! === 'free' ? 'Free' : 'Pro';
  return label;
}
`,
    // #1626: the ternary/if forms accept only identifier-rooted discriminants
    // (`isValidDiscriminant`), so a `this`-rooted equality chain never reaches
    // the narrowing exemption at all — it is out of scope for those forms.
    `
type Slot = { role: 'title'; title: string } | { role: 'spacer' };
class Panel {
  private readonly slot!: Slot;
  public label() {
    return this.slot.role === 'title' ? this.slot.title : '';
  }
}
`,
    // #1941: the narrowing exemption is spelling-agnostic. An ECMA private field
    // is the same privacy as a `private` one (and mutually exclusive with it —
    // `private #result` is TS18010), and the walk to the chain root goes through
    // `.object`, never the property, so a `#`-spelled base object narrows and
    // exempts exactly as its `private` twin does.
    `
class Holder {
  readonly #result!: { kind: 'ok'; data: number } | { kind: 'err' };
  public read() {
    switch (this.#result.kind) {
      case 'ok':
        return this.#result.data;
      case 'err':
        return -1;
    }
  }
}
`,
    // #1941: a `this`-rooted ternary is out of scope for BOTH privacy spellings.
    // `isValidDiscriminant` requires an identifier root, so respelling the field
    // must not turn a silent construct into a reported one.
    `
type Tier = 'free' | 'pro';
class Pricing {
  readonly #tier!: Tier;
  public label() {
    return this.#tier === 'free' ? 'Free' : 'Pro';
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
    // #1663: the equality forms (`if`/ternary) match only when one side of the
    // `===` is an INLINE literal, so a constant reference on the key side is
    // not a recognized dispatch at all — the resolver's constant-reference path
    // is unreachable from here, and both forms are left alone.
    `
const A = 'a';
type K = 'a' | 'b';
declare const k: K;
function f() {
  if (k === A) {
    return 1;
  }
  return 2;
}
`,
    `
const A = 'a';
type K = 'a' | 'b';
declare const k: K;
function f() {
  const out = k === A ? 1 : 2;
  return out;
}
`,
  ],
  invalid: [
    // #1867: an optional-chained discriminant that does NOT narrow is the same
    // lookup table as its plain spelling, so it keeps the autofix rather than
    // degrading to `preferMapManual` claiming no lookup name could be derived —
    // `?.` never blocked the derivation, it was simply not looked through. The
    // generated lookup copies the discriminant verbatim, so the optional link
    // survives the fix.
    {
      code: `
type Mode = 'light' | 'dark';
declare const PALETTE: { light: string; dark: string };
class Theme {
  private readonly config!: { mode: Mode };
  public color() {
    switch (this?.config?.mode) {
      case 'light':
        return PALETTE?.light;
      case 'dark':
        return PALETTE?.dark;
    }
  }
}
`,
      output: `
type Mode = 'light' | 'dark';
declare const PALETTE: { light: string; dark: string };
class Theme {
  private readonly config!: { mode: Mode };
  public color() {
    const RESULT_BY_MODE: Record<Mode, string> = {
      light: PALETTE?.light,
      dark: PALETTE?.dark,
    };
    return RESULT_BY_MODE[this?.config?.mode];
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1867: identifier-rooted optional chain, with a fail-loud default the fix
    // drops as unreachable — the coverage math is unchanged by the `?.`.
    {
      code: `
type TokenStandard = 'native' | 'ERC20' | 'offchain';
declare const token: { standard: TokenStandard };
function rank() {
  switch (token?.standard) {
    case 'native':
      return 0;
    case 'ERC20':
      return 1;
    case 'offchain':
      return 2;
    default:
      throw new Error('nope');
  }
}
`,
      output: `
type TokenStandard = 'native' | 'ERC20' | 'offchain';
declare const token: { standard: TokenStandard };
function rank() {
  const RESULT_BY_STANDARD: Record<TokenStandard, number> = {
    native: 0,
    ERC20: 1,
    offchain: 2,
  };
  return RESULT_BY_STANDARD[token?.standard];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1929: the ternary arm asks the same question of the same discriminant.
    // ESTree wraps `flags?.tier` in a ChainExpression, so the arm's shape test
    // saw something other than a member chain and the construct went silent
    // while its plain spelling reported and fixed — the switch spelling below
    // is the parity twin. The generated lookup copies the discriminant
    // verbatim, so the optional link survives the fix.
    {
      code: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  const label = flags?.tier === 'free' ? 'Free' : 'Pro';
  return label;
}
`,
      output: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  const RESULT_BY_TIER: Record<Flags['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
  };
  const label = RESULT_BY_TIER[flags?.tier];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1929: the switch twin of the ternary above, on the same discriminant.
    {
      code: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  switch (flags?.tier) {
    case 'free':
      return 'Free';
    case 'pro':
      return 'Pro';
  }
}
`,
      output: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  const RESULT_BY_TIER: Record<Flags['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
  };
  return RESULT_BY_TIER[flags?.tier];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1929: every link of a longer chain optional, in the ternary form.
    {
      code: `
type Inner = { tier: 'free' | 'pro' };
type Outer = { inner: Inner };
declare const o: Outer;
function f() {
  const label = o?.inner?.tier === 'free' ? 'Free' : 'Pro';
  return label;
}
`,
      output: `
type Inner = { tier: 'free' | 'pro' };
type Outer = { inner: Inner };
declare const o: Outer;
function f() {
  const RESULT_BY_TIER: Record<Inner['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
  };
  const label = RESULT_BY_TIER[o?.inner?.tier];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1929: the switch twin of the longer chain.
    {
      code: `
type Inner = { tier: 'free' | 'pro' };
type Outer = { inner: Inner };
declare const o: Outer;
function f() {
  switch (o?.inner?.tier) {
    case 'free':
      return 'Free';
    case 'pro':
      return 'Pro';
  }
}
`,
      output: `
type Inner = { tier: 'free' | 'pro' };
type Outer = { inner: Inner };
declare const o: Outer;
function f() {
  const RESULT_BY_TIER: Record<Inner['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
  };
  return RESULT_BY_TIER[o?.inner?.tier];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1929: a non-null assertion is the other spelling wrapper the ternary
    // arm's shape test walked into — `flags!.tier` hangs a TSNonNullExpression
    // where the walk expected the chain's root, so it went silent for the same
    // reason `?.` did while the switch arm fixed it.
    {
      code: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  const label = flags!.tier === 'free' ? 'Free' : 'Pro';
  return label;
}
`,
      output: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  const RESULT_BY_TIER: Record<Flags['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
  };
  const label = RESULT_BY_TIER[flags!.tier];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1929: the switch twin of the non-null assertion.
    {
      code: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  switch (flags!.tier) {
    case 'free':
      return 'Free';
    case 'pro':
      return 'Pro';
  }
}
`,
      output: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  const RESULT_BY_TIER: Record<Flags['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
  };
  return RESULT_BY_TIER[flags!.tier];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1929: mixed spelling — one optional link, one asserted — in the ternary
    // form. The wrappers nest, so looking through only the outermost one is not
    // enough.
    {
      code: `
type Inner = { tier: 'free' | 'pro' };
type Outer = { inner: Inner };
declare const o: Outer;
function f() {
  const label = o?.inner!.tier === 'free' ? 'Free' : 'Pro';
  return label;
}
`,
      output: `
type Inner = { tier: 'free' | 'pro' };
type Outer = { inner: Inner };
declare const o: Outer;
function f() {
  const RESULT_BY_TIER: Record<Inner['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
  };
  const label = RESULT_BY_TIER[o?.inner!.tier];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1929: the switch twin of the mixed spelling.
    {
      code: `
type Inner = { tier: 'free' | 'pro' };
type Outer = { inner: Inner };
declare const o: Outer;
function f() {
  switch (o?.inner!.tier) {
    case 'free':
      return 'Free';
    case 'pro':
      return 'Pro';
  }
}
`,
      output: `
type Inner = { tier: 'free' | 'pro' };
type Outer = { inner: Inner };
declare const o: Outer;
function f() {
  const RESULT_BY_TIER: Record<Inner['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
  };
  return RESULT_BY_TIER[o?.inner!.tier];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1929: mixed the other way round — a plain link above an optional one.
    {
      code: `
type Inner = { tier: 'free' | 'pro' };
type Outer = { inner: Inner };
declare const o: Outer;
function f() {
  const label = o.inner?.tier === 'free' ? 'Free' : 'Pro';
  return label;
}
`,
      output: `
type Inner = { tier: 'free' | 'pro' };
type Outer = { inner: Inner };
declare const o: Outer;
function f() {
  const RESULT_BY_TIER: Record<Inner['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
  };
  const label = RESULT_BY_TIER[o.inner?.tier];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1929: the if/else-if arm derives its discriminant through the same
    // helper as the ternary arm, so it went blind on `?.` too and regains the
    // fix with it.
    {
      code: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  if (flags?.tier === 'free') {
    return 'Free';
  } else {
    return 'Pro';
  }
}
`,
      output: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  const RESULT_BY_TIER: Record<Flags['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
  };
  return RESULT_BY_TIER[flags?.tier];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
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
  const RESULT_BY_STANDARD: Record<
    TokenStandard,
    | typeof NativeTokenEncoder
    | typeof Erc20TokenEncoder
    | typeof Erc721TokenEncoder
    | typeof Erc1155TokenEncoder
    | typeof OffchainTokenEncoder
    | typeof CoinflowTokenEncoder
  > = {
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
    // #1663: bare identifier constants as case tests keep their reference —
    // the checker resolves them to prove the key is a literal, but emitting
    // the resolved value would leave `A`/`B` unreferenced (an imported one
    // then trips no-unused-vars) and bake their values into the call site.
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
    [A]: 1,
    [B]: 2,
  };
  return RESULT_BY_X[x];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1663: the live agora shape — a constant object imported for the sole
    // purpose of naming the dispatch keys. The import must still be read by
    // the generated Record.
    {
      code: `
declare module 'device-status' {
  export const THIS_DEVICE_STATUS: {
    readonly active: 'active';
    readonly unregistered: 'unregistered';
  };
}
import { THIS_DEVICE_STATUS } from 'device-status';
type Status = 'active' | 'unregistered';
declare const status: Status;
function f() {
  switch (status) {
    case THIS_DEVICE_STATUS.active:
      return 1;
    case THIS_DEVICE_STATUS.unregistered:
      return 2;
  }
}
`,
      output: `
declare module 'device-status' {
  export const THIS_DEVICE_STATUS: {
    readonly active: 'active';
    readonly unregistered: 'unregistered';
  };
}
import { THIS_DEVICE_STATUS } from 'device-status';
type Status = 'active' | 'unregistered';
declare const status: Status;
function f() {
  const RESULT_BY_STATUS: Record<Status, number> = {
    [THIS_DEVICE_STATUS.active]: 1,
    [THIS_DEVICE_STATUS.unregistered]: 2,
  };
  return RESULT_BY_STATUS[status];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1663: the same shape with a locally declared `as const` object.
    {
      code: `
const STATUS = { active: 'active', blocked: 'blocked' } as const;
type S = 'active' | 'blocked';
declare const s: S;
function f() {
  switch (s) {
    case STATUS.active:
      return 1;
    case STATUS.blocked:
      return 2;
  }
}
`,
      output: `
const STATUS = { active: 'active', blocked: 'blocked' } as const;
type S = 'active' | 'blocked';
declare const s: S;
function f() {
  const RESULT_BY_S: Record<S, number> = {
    [STATUS.active]: 1,
    [STATUS.blocked]: 2,
  };
  return RESULT_BY_S[s];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1663: a nested member chain through a namespace resolves and is kept
    // whole, not collapsed to its trailing property.
    {
      code: `
namespace Config {
  export const ACTIVE = 'active';
  export const BLOCKED = 'blocked';
}
type S = 'active' | 'blocked';
declare const s: S;
function f() {
  switch (s) {
    case Config.ACTIVE:
      return 1;
    case Config.BLOCKED:
      return 2;
  }
}
`,
      output: `
namespace Config {
  export const ACTIVE = 'active';
  export const BLOCKED = 'blocked';
}
type S = 'active' | 'blocked';
declare const s: S;
function f() {
  const RESULT_BY_S: Record<S, number> = {
    [Config.ACTIVE]: 1,
    [Config.BLOCKED]: 2,
  };
  return RESULT_BY_S[s];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1663: string enum members are references too — `Status.Active` is a
    // computed key, and `Record<Status, V>` stays exhaustive over it.
    {
      code: `
enum Status {
  Active = 'active',
  Blocked = 'blocked',
}
declare const s: Status;
function f() {
  switch (s) {
    case Status.Active:
      return 1;
    case Status.Blocked:
      return 2;
  }
}
`,
      output: `
enum Status {
  Active = 'active',
  Blocked = 'blocked',
}
declare const s: Status;
function f() {
  const RESULT_BY_S: Record<Status, number> = {
    [Status.Active]: 1,
    [Status.Blocked]: 2,
  };
  return RESULT_BY_S[s];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1663: a numeric enum member — the resolved value (1/2) would print as a
    // legal key, which is exactly why inlining it went unnoticed.
    {
      code: `
enum Level {
  Low = 1,
  High = 2,
}
declare const level: Level;
function f() {
  switch (level) {
    case Level.Low:
      return 'low';
    case Level.High:
      return 'high';
  }
}
`,
      output: `
enum Level {
  Low = 1,
  High = 2,
}
declare const level: Level;
function f() {
  const RESULT_BY_LEVEL: Record<Level, string> = {
    [Level.Low]: 'low',
    [Level.High]: 'high',
  };
  return RESULT_BY_LEVEL[level];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1663: inline literals and constant references in one switch — each key
    // is emitted in the form its own test had.
    {
      code: `
const STATUS = { active: 'active' } as const;
type S = 'active' | 'blocked' | 'idle';
declare const s: S;
function f() {
  switch (s) {
    case STATUS.active:
      return 1;
    case 'blocked':
      return 2;
    case 'idle':
      return 3;
  }
}
`,
      output: `
const STATUS = { active: 'active' } as const;
type S = 'active' | 'blocked' | 'idle';
declare const s: S;
function f() {
  const RESULT_BY_S: Record<S, number> = {
    [STATUS.active]: 1,
    blocked: 2,
    idle: 3,
  };
  return RESULT_BY_S[s];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1663: a member the `default` covers has no case-test expression of its
    // own, so it keeps a plain key while the explicit cases stay references.
    {
      code: `
const STATUS = { active: 'active' } as const;
type S = 'active' | 'blocked';
declare const s: S;
function f() {
  switch (s) {
    case STATUS.active:
      return 1;
    default:
      return 2;
  }
}
`,
      output: `
const STATUS = { active: 'active' } as const;
type S = 'active' | 'blocked';
declare const s: S;
function f() {
  const RESULT_BY_S: Record<S, number> = {
    [STATUS.active]: 1,
    blocked: 2,
  };
  return RESULT_BY_S[s];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1663: a grouped case whose tests mix both forms expands into one entry
    // per test, each keeping its own form.
    {
      code: `
const K = { a: 'a' } as const;
type X = 'a' | 'b' | 'c';
declare const x: X;
function f() {
  switch (x) {
    case K.a:
    case 'b':
      return 1;
    case 'c':
      return 2;
  }
}
`,
      output: `
const K = { a: 'a' } as const;
type X = 'a' | 'b' | 'c';
declare const x: X;
function f() {
  const RESULT_BY_X: Record<X, number> = {
    [K.a]: 1,
    b: 1,
    c: 2,
  };
  return RESULT_BY_X[x];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1663: a negated numeric literal is not an inline literal — its resolved
    // value does not print as a legal object key (`{ -1: v }` does not parse),
    // so the computed key is what makes this output compile at all.
    {
      code: `
type Offset = -1 | 1;
declare const offset: Offset;
function f() {
  switch (offset) {
    case -1:
      return 'back';
    case 1:
      return 'forward';
  }
}
`,
      output: `
type Offset = -1 | 1;
declare const offset: Offset;
function f() {
  const RESULT_BY_OFFSET: Record<Offset, string> = {
    [-1]: 'back',
    1: 'forward',
  };
  return RESULT_BY_OFFSET[offset];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1663: a no-substitution template literal is resolved by the checker,
    // not read off the AST, so it is carried verbatim.
    {
      code: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  switch (k) {
    case \`a\`:
      return 1;
    case 'b':
      return 2;
  }
}
`,
      output: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  const RESULT_BY_K: Record<K, number> = {
    [\`a\`]: 1,
    b: 2,
  };
  return RESULT_BY_K[k];
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
    // #2062 (A): a `function` expression branch value whose body calls. The
    // value IS the thunk the eager carve-out's message asks for — its body runs
    // on invocation, after the lookup — so the call cannot fire per entry and
    // the fix applies.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function trim(input: string): string;
declare function shout(input: string): string;
function pick() {
  switch (mode) {
    case 'plain':
      return function (input: string) {
        return trim(input);
      };
    case 'fancy':
      return function (input: string) {
        return shout(input);
      };
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function trim(input: string): string;
declare function shout(input: string): string;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (input: string) => string> = {
    plain: function (input: string) {
      return trim(input);
    },
    fancy: function (input: string) {
      return shout(input);
    },
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2062 (B): the same value spelled as a block-bodied arrow.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function trim(input: string): string;
declare function shout(input: string): string;
function pick() {
  switch (mode) {
    case 'plain':
      return (input: string) => {
        return trim(input);
      };
    case 'fancy':
      return (input: string) => {
        return shout(input);
      };
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function trim(input: string): string;
declare function shout(input: string): string;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (input: string) => string> = {
    plain: (input: string) => {
      return trim(input);
    },
    fancy: (input: string) => {
      return shout(input);
    },
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2062 (C): and as a concise arrow, where the call is the whole body.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function trim(input: string): string;
declare function shout(input: string): string;
function pick() {
  switch (mode) {
    case 'plain':
      return (input: string) => trim(input);
    case 'fancy':
      return (input: string) => shout(input);
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function trim(input: string): string;
declare function shout(input: string): string;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (input: string) => string> = {
    plain: (input: string) => trim(input),
    fancy: (input: string) => shout(input),
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2062 (D control): a bare call is still eager — the boundary above must
    // not switch the carve-out off.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function sideEffect(): string;
function pick() {
  switch (mode) {
    case 'plain':
      return sideEffect();
    case 'fancy':
      return sideEffect();
  }
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #2062 (E control): the same scaffold as (D), with a function-valued
    // branch that carries no call at all. It converts on its own, so only the
    // COMBINATION of the two shapes was ever broken.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function sideEffect(): string;
function pick() {
  switch (mode) {
    case 'plain':
      return function (input: string) {
        return input + '!';
      };
    case 'fancy':
      return function (input: string) {
        return input + '?';
      };
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function sideEffect(): string;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (input: string) => string> = {
    plain: function (input: string) {
      return input + '!';
    },
    fancy: function (input: string) {
      return input + '?';
    },
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2062 (F): an `async` branch value whose body awaits is suspended until
    // the value is called, so it converts. The emitted value type is what the
    // lib-less test program prints for a promise (`unknown`); a real project
    // prints `Promise<string>`.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function load(input: string): PromiseLike<string>;
function pick() {
  switch (mode) {
    case 'plain':
      return async function (input: string) {
        return await load(input);
      };
    case 'fancy':
      return async function (input: string) {
        return await load(input.trim());
      };
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function load(input: string): PromiseLike<string>;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (input: string) => unknown> = {
    plain: async function (input: string) {
      return await load(input);
    },
    fancy: async function (input: string) {
      return await load(input.trim());
    },
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2062 (G control): a TOP-LEVEL await is evaluated where the Record
    // literal is built, so it stays eager — `await` is not lazy by itself, only
    // by the function that encloses it.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function load(input: string): PromiseLike<string>;
async function pick() {
  switch (mode) {
    case 'plain':
      return await load('a');
    case 'fancy':
      return await load('b');
  }
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #2062 (H control): a parameter decorator sits inside a function yet runs
    // with the enclosing class definition, which the Record literal performs
    // per entry — so it is eager despite the function boundary around it.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function inject(): (t: unknown, k: unknown, i: number) => void;
function pick() {
  switch (mode) {
    case 'plain':
      return class {
        run(@inject() dep: unknown) {}
      };
    case 'fancy':
      return class {
        run(dep: unknown) {}
      };
  }
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #2062 (I): a default parameter is evaluated on invocation like the body
    // is, so a call in one is lazy too.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function fallback(): string;
function pick() {
  switch (mode) {
    case 'plain':
      return (input: string = fallback()) => input;
    case 'fancy':
      return (input: string = fallback()) => input + '!';
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function fallback(): string;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (input?: string) => string> = {
    plain: (input: string = fallback()) => input,
    fancy: (input: string = fallback()) => input + '!',
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2062 (J control): a class expression is NOT a boundary — its static
    // initializers, static blocks and computed member names all run when the
    // class definition is evaluated, which the Record literal does per entry.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare function sideEffect(): string;
function pick() {
  switch (mode) {
    case 'plain':
      return class {
        static tag = sideEffect();
      };
    case 'fancy':
      return class {
        static tag = 'fancy';
      };
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
    // Union of two distinct function types must be parenthesized per member
    // (regression: unparenthesized \`=>\` union members do not parse).
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare const formatPlain: (input: string) => string;
declare const formatFancy: (input: number) => string;
function pick() {
  switch (mode) {
    case 'plain':
      return formatPlain;
    case 'fancy':
      return formatFancy;
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare const formatPlain: (input: string) => string;
declare const formatFancy: (input: number) => string;
function pick() {
  const RESULT_BY_MODE: Record<
    Mode,
    ((input: string) => string) | ((input: number) => string)
  > = {
    plain: formatPlain,
    fancy: formatFancy,
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // Ternary selecting between typed function references — the agora
    // useRouterState shape whose annotation failed to parse. (The original
    // uses rest-array parameters, but the lib-less program a RuleTester
    // builds cannot print array types, so this pins the scalar-param form;
    // the rest-param form is covered by the agora harness.)
    {
      code: `
type ParamMod = { name: string };
type SegMod = { index: number };
type Target = 'queryParam' | 'segment';
declare const target: Target;
declare const replaceParam: (param: ParamMod) => void;
declare const replaceSegment: (segment: SegMod) => void;
function update() {
  const replace = target === 'queryParam' ? replaceParam : replaceSegment;
  return replace;
}
`,
      output: `
type ParamMod = { name: string };
type SegMod = { index: number };
type Target = 'queryParam' | 'segment';
declare const target: Target;
declare const replaceParam: (param: ParamMod) => void;
declare const replaceSegment: (segment: SegMod) => void;
function update() {
  const RESULT_BY_TARGET: Record<
    Target,
    ((param: ParamMod) => void) | ((segment: SegMod) => void)
  > = {
    queryParam: replaceParam,
    segment: replaceSegment,
  };
  const replace = RESULT_BY_TARGET[target];
  return replace;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // Mixed union — only the function-type member gains parentheses. The head
    // lands two columns over the width, the one window where Prettier answers
    // by moving the map to its own line rather than by breaking the type
    // arguments open; the emitted layout is that answer.
    {
      code: `
type Choice = 'fn' | 'label';
declare const choice: Choice;
declare const toLabel: (value: number) => string;
function pick() {
  switch (choice) {
    case 'fn':
      return toLabel;
    case 'label':
      return 'none';
  }
}
`,
      output: `
type Choice = 'fn' | 'label';
declare const choice: Choice;
declare const toLabel: (value: number) => string;
function pick() {
  const RESULT_BY_CHOICE: Record<Choice, ((value: number) => string) | string> =
    {
      fn: toLabel,
      label: 'none',
    };
  return RESULT_BY_CHOICE[choice];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // Report-only: the printed value type names class-expression internals
    // (\`typeof HiddenA\`) that are not in scope at the fix site — the same
    // failure mode as an unimported type name printed by the checker.
    {
      code: `
type K = 'a' | 'b';
declare const k: K;
const MakeA = class HiddenA { a = 1 };
const MakeB = class HiddenB { b = 2 };
function f() {
  switch (k) {
    case 'a':
      return MakeA;
    case 'b':
      return MakeB;
  }
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1590: an eslint-disable-next-line directive inside a converted branch
    // must survive the fix directly above the map entry it annotates, or the
    // suppressed rule silently re-reports after --fix.
    {
      code: `
function pickEncoder(standard: 'native' | 'erc20' | 'offchain') {
  switch (standard) {
    case 'native':
      // eslint-disable-next-line no-restricted-syntax
      return NativeEncoder;
    case 'erc20':
      return Erc20Encoder;
    case 'offchain':
      return OffchainEncoder;
    default:
      throw new Error('unsupported');
  }
}
`,
      output: `
function pickEncoder(standard: 'native' | 'erc20' | 'offchain') {
  const RESULT_BY_STANDARD: Record<'native' | 'erc20' | 'offchain', any> = {
    // eslint-disable-next-line no-restricted-syntax
    native: NativeEncoder,
    erc20: Erc20Encoder,
    offchain: OffchainEncoder,
  };
  return RESULT_BY_STANDARD[standard];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1590: the issue's real-world shape — declared classes, typeof union
    // annotation, fail-loud default — with a suppression on one branch.
    {
      code: `
type TokenStandard = 'native' | 'ERC20' | 'offchain';
class NativeTokenEncoder {}
class Erc20TokenEncoder {}
class OffchainTokenEncoder {}
declare const token: { standard: TokenStandard };
function deduceConstructor() {
  switch (token.standard) {
    case 'native':
      // eslint-disable-next-line no-restricted-syntax
      return NativeTokenEncoder;
    case 'ERC20':
      return Erc20TokenEncoder;
    case 'offchain':
      return OffchainTokenEncoder;
    default:
      throw new Error('nope');
  }
}
`,
      output: `
type TokenStandard = 'native' | 'ERC20' | 'offchain';
class NativeTokenEncoder {}
class Erc20TokenEncoder {}
class OffchainTokenEncoder {}
declare const token: { standard: TokenStandard };
function deduceConstructor() {
  const RESULT_BY_STANDARD: Record<
    TokenStandard,
    | typeof NativeTokenEncoder
    | typeof Erc20TokenEncoder
    | typeof OffchainTokenEncoder
  > = {
    // eslint-disable-next-line no-restricted-syntax
    native: NativeTokenEncoder,
    ERC20: Erc20TokenEncoder,
    offchain: OffchainTokenEncoder,
  };
  return RESULT_BY_STANDARD[token.standard];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1590: a same-line eslint-disable-line stays on the entry line whose
    // value it suppressed.
    {
      code: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  switch (k) {
    case 'a':
      return 1; // eslint-disable-line no-restricted-syntax
    case 'b':
      return 2;
  }
}
`,
      output: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  const RESULT_BY_K: Record<K, number> = {
    a: 1, // eslint-disable-line no-restricted-syntax
    b: 2,
  };
  return RESULT_BY_K[k];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1590: a prose comment above a case label lands above that entry.
    {
      code: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  switch (k) {
    // legacy naming kept for API compatibility
    case 'a':
      return 1;
    case 'b':
      return 2;
  }
}
`,
      output: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  const RESULT_BY_K: Record<K, number> = {
    // legacy naming kept for API compatibility
    a: 1,
    b: 2,
  };
  return RESULT_BY_K[k];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1590: a prose comment on a grouped branch lands above the group's
    // first entry.
    {
      code: `
type Raw = 'a' | 'b' | 'c';
declare const raw: Raw;
function normalize() {
  switch (raw) {
    case 'a':
      return 'x';
    case 'b':
    case 'c':
      // shared label for the merged branches
      return 'y';
  }
}
`,
      output: `
type Raw = 'a' | 'b' | 'c';
declare const raw: Raw;
function normalize() {
  const RESULT_BY_RAW: Record<Raw, string> = {
    a: 'x',
    // shared label for the merged branches
    b: 'y',
    c: 'y',
  };
  return RESULT_BY_RAW[raw];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1590: a line-targeted directive on a grouped branch cannot cover the
    // several entries the group expands into — fix withheld, report kept.
    {
      code: `
type Raw = 'a' | 'b' | 'c';
declare const raw: Raw;
function normalize() {
  switch (raw) {
    case 'a':
      return 'x';
    case 'b':
    case 'c':
      // eslint-disable-next-line no-restricted-syntax
      return 'y';
  }
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1590: a comment inside the dropped unreachable default dies with the
    // code it annotates — the fix still applies.
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
      // unreachable: all members covered above
      throw new Error('unexpected');
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
    // #1590: a comment after the last branch has no entry to host it — fix
    // withheld, report kept.
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
    // end of dispatch
  }
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1590: a region directive opens a suppression range whose boundary the
    // rewrite would move — fix withheld, report kept.
    {
      code: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  switch (k) {
    case 'a':
      /* eslint-disable no-restricted-syntax */
      return 1;
    case 'b':
      return 2;
  }
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1590: a disable-next-line separated from the value by a blank line
    // suppresses the blank line, not the value; hosting it above the entry
    // would BEGIN suppressing — fix withheld, report kept.
    {
      code: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  switch (k) {
    case 'a':
      // eslint-disable-next-line no-restricted-syntax

      return 1;
    case 'b':
      return 2;
  }
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1590: if/else-if form carries a branch directive onto its entry.
    {
      code: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  if (k === 'a') {
    // eslint-disable-next-line no-restricted-syntax
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
    // eslint-disable-next-line no-restricted-syntax
    a: 1,
    b: 2,
  };
  return RESULT_BY_K[k];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1590: ternary form carries a directive that targets the consequent's
    // line onto its entry.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const label =
    side === 'buy'
      ? // eslint-disable-next-line no-restricted-syntax
        'Buy now'
      : 'Sell now';
  return label;
}
`,
      output: `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const RESULT_BY_SIDE: Record<Side, string> = {
    // eslint-disable-next-line no-restricted-syntax
    buy: 'Buy now',
    sell: 'Sell now',
  };
  const label = RESULT_BY_SIDE[side];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1590: assignment form carries a branch directive onto its entry.
    {
      code: `
type Mode = 'on' | 'off';
declare const mode: Mode;
function setup() {
  let label = '';
  switch (mode) {
    case 'on':
      // eslint-disable-next-line no-restricted-syntax
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
    // eslint-disable-next-line no-restricted-syntax
    on: 'Enabled',
    off: 'Disabled',
  };
  label = RESULT_BY_MODE[mode];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1590: a comment inside the statement but outside the copied value
    // (\`return /* c */ 1;\`) is hosted above the branch's own entry.
    {
      code: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  switch (k) {
    case 'a':
      return /* legacy value */ 1;
    case 'b':
      return 2;
  }
}
`,
      output: `
type K = 'a' | 'b';
declare const k: K;
function f() {
  const RESULT_BY_K: Record<K, number> = {
    /* legacy value */
    a: 1,
    b: 2,
  };
  return RESULT_BY_K[k];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1590: a comment inside the value expression itself travels verbatim
    // inside the copied text.
    {
      code: `
type K = 'a' | 'b';
declare const k: K;
declare const fallback: string | undefined;
function f() {
  switch (k) {
    case 'a':
      return fallback ?? /* default label */ 'x';
    case 'b':
      return 'y';
  }
}
`,
      output: `
type K = 'a' | 'b';
declare const k: K;
declare const fallback: string | undefined;
function f() {
  const RESULT_BY_K: Record<K, string> = {
    a: fallback ?? /* default label */ 'x',
    b: 'y',
  };
  return RESULT_BY_K[k];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1590: a comment inside a ternary's unreachable tail dies with the
    // dropped tail — the fix still applies.
    {
      code: `
type T = 'a' | 'b';
declare const t: T;
function f() {
  const r = t === 'a' ? 1 : t === 'b' ? 2 : /* unreachable */ 0;
  return r;
}
`,
      output: `
type T = 'a' | 'b';
declare const t: T;
function f() {
  const RESULT_BY_T: Record<T, number> = {
    a: 1,
    b: 2,
  };
  const r = RESULT_BY_T[t];
  return r;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1626: a `this`-rooted discriminant is only exempt when a kept branch
    // reads the base object back. A genuine dispatch table whose branches are
    // constants keeps reporting.
    {
      code: `
type Tier = 'free' | 'pro';
class Pricing {
  private readonly tier!: Tier;
  public monthlyCost() {
    switch (this.tier) {
      case 'free':
        return 0;
      case 'pro':
        return 25;
    }
  }
}
`,
      output: `
type Tier = 'free' | 'pro';
class Pricing {
  private readonly tier!: Tier;
  public monthlyCost() {
    const RESULT_BY_TIER: Record<Tier, number> = {
      free: 0,
      pro: 25,
    };
    return RESULT_BY_TIER[this.tier];
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1941: the ECMA-private twin of the fixture above — the same privacy, and
    // the only spelling available to an author who wants it (`private #tier` is
    // TS18010). The parser hands the trailing property over as a
    // `PrivateIdentifier` whose `name` is already `#`-free, so the very same
    // `RESULT_BY_TIER` is derivable and free; reading that node as "no name"
    // withheld the fix and blamed a collision that never existed. The lookup is
    // written where the switch was, inside the class body, so `this.#tier`
    // stays readable.
    {
      code: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly #tier!: Tier;
  public monthlyCost() {
    switch (this.#tier) {
      case 'free':
        return 0;
      case 'pro':
        return 25;
    }
  }
}
`,
      output: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly #tier!: Tier;
  public monthlyCost() {
    const RESULT_BY_TIER: Record<Tier, number> = {
      free: 0,
      pro: 25,
    };
    return RESULT_BY_TIER[this.#tier];
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1941 isolation control: renaming the member while KEEPING `private` must
    // not move the verdict. Both this and the `#tier` case above fix, so the
    // divergence the issue reported was the privacy spelling, not the name.
    {
      code: `
type Tier = 'free' | 'pro';
class Pricing {
  private readonly zqx!: Tier;
  public monthlyCost() {
    switch (this.zqx) {
      case 'free':
        return 0;
      case 'pro':
        return 25;
    }
  }
}
`,
      output: `
type Tier = 'free' | 'pro';
class Pricing {
  private readonly zqx!: Tier;
  public monthlyCost() {
    const RESULT_BY_ZQX: Record<Tier, number> = {
      free: 0,
      pro: 25,
    };
    return RESULT_BY_ZQX[this.zqx];
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1941: a static ECMA private field read off the class name. The fix is
    // written in place inside the class body, where `Pricing.#tier` is legal.
    {
      code: `
type Tier = 'free' | 'pro';
class Pricing {
  static readonly #tier: Tier = 'free';
  public static monthlyCost() {
    switch (Pricing.#tier) {
      case 'free':
        return 0;
      case 'pro':
        return 25;
    }
  }
}
`,
      output: `
type Tier = 'free' | 'pro';
class Pricing {
  static readonly #tier: Tier = 'free';
  public static monthlyCost() {
    const RESULT_BY_TIER: Record<Tier, number> = {
      free: 0,
      pro: 25,
    };
    return RESULT_BY_TIER[Pricing.#tier];
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1941: a private GETTER is reached through the same PrivateIdentifier
    // node, so it derives its name the same way.
    {
      code: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly raw!: Tier;
  get #tier(): Tier {
    return this.raw;
  }
  public monthlyCost() {
    switch (this.#tier) {
      case 'free':
        return 0;
      case 'pro':
        return 25;
    }
  }
}
`,
      output: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly raw!: Tier;
  get #tier(): Tier {
    return this.raw;
  }
  public monthlyCost() {
    const RESULT_BY_TIER: Record<Tier, number> = {
      free: 0,
      pro: 25,
    };
    return RESULT_BY_TIER[this.#tier];
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1941: the assign form on an ECMA private discriminant.
    {
      code: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly #tier!: Tier;
  public monthlyCost() {
    let cost = 0;
    switch (this.#tier) {
      case 'free':
        cost = 0;
        break;
      case 'pro':
        cost = 25;
        break;
    }
    return cost;
  }
}
`,
      output: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly #tier!: Tier;
  public monthlyCost() {
    let cost = 0;
    const RESULT_BY_TIER: Record<Tier, number> = {
      free: 0,
      pro: 25,
    };
    cost = RESULT_BY_TIER[this.#tier];
    return cost;
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1941: the ternary form on an ECMA private field read off an identifier
    // (the one form that HOISTS its Record). The enclosing statement is inside
    // the method body, so the hoist stays within the class body and the emitted
    // `other.#tier` still resolves.
    {
      code: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly #tier!: Tier;
  public compare(other: Pricing) {
    const label = other.#tier === 'free' ? 'Free' : 'Pro';
    return label;
  }
}
`,
      output: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly #tier!: Tier;
  public compare(other: Pricing) {
    const RESULT_BY_TIER: Record<Tier, string> = {
      free: 'Free',
      pro: 'Pro',
    };
    const label = RESULT_BY_TIER[other.#tier];
    return label;
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1941: `#kind` and a sibling public `kind` are DIFFERENT members. The
    // key type must come from the private field's own union — `Holder['kind']`
    // is not expressible for a private name and would silently name the public
    // sibling's union instead, so the resolved literal union is what ships.
    {
      code: `
class Holder {
  readonly kind!: 'x' | 'y';
  readonly #kind!: 'a' | 'b';
  public read() {
    switch (this.#kind) {
      case 'a':
        return 1;
      case 'b':
        return 2;
    }
  }
}
`,
      output: `
class Holder {
  readonly kind!: 'x' | 'y';
  readonly #kind!: 'a' | 'b';
  public read() {
    const RESULT_BY_KIND: Record<'a' | 'b', number> = {
      a: 1,
      b: 2,
    };
    return RESULT_BY_KIND[this.#kind];
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1941: a public `tier` and a private `#tier` on one class each dispatch in
    // their own method. Both derive `RESULT_BY_TIER`, and both are fixed: the
    // two constants are separate bindings in separate scopes, so withholding
    // either would strand it (the textual collision check sees the first fix's
    // output on every later run).
    {
      code: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly tier!: Tier;
  readonly #tier!: Tier;
  public listed() {
    switch (this.tier) {
      case 'free':
        return 0;
      case 'pro':
        return 25;
    }
  }
  public actual() {
    switch (this.#tier) {
      case 'free':
        return 1;
      case 'pro':
        return 26;
    }
  }
}
`,
      output: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly tier!: Tier;
  readonly #tier!: Tier;
  public listed() {
    const RESULT_BY_TIER: Record<Tier, number> = {
      free: 0,
      pro: 25,
    };
    return RESULT_BY_TIER[this.tier];
  }
  public actual() {
    const RESULT_BY_TIER: Record<Tier, number> = {
      free: 1,
      pro: 26,
    };
    return RESULT_BY_TIER[this.#tier];
  }
}
`,
      errors: [{ messageId: 'preferMap' }, { messageId: 'preferMap' }],
    },
    // #1941: the same two members dispatching in ONE scope. `#tier` and `tier`
    // are different members that derive the same constant name, so emitting
    // both would redeclare it (TS2451). The second dispatch reports without a
    // fix, and says so truthfully.
    {
      code: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly tier!: Tier;
  readonly #tier!: Tier;
  public both() {
    let listed = 0;
    switch (this.tier) {
      case 'free':
        listed = 0;
        break;
      case 'pro':
        listed = 25;
        break;
    }
    let actual = 0;
    switch (this.#tier) {
      case 'free':
        actual = 1;
        break;
      case 'pro':
        actual = 26;
        break;
    }
    return listed + actual;
  }
}
`,
      output: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly tier!: Tier;
  readonly #tier!: Tier;
  public both() {
    let listed = 0;
    const RESULT_BY_TIER: Record<Tier, number> = {
      free: 0,
      pro: 25,
    };
    listed = RESULT_BY_TIER[this.tier];
    let actual = 0;
    switch (this.#tier) {
      case 'free':
        actual = 1;
        break;
      case 'pro':
        actual = 26;
        break;
    }
    return listed + actual;
  }
}
`,
      errors: [
        { messageId: 'preferMap' },
        {
          messageId: 'preferMapManual',
          data: {
            reason:
              'the lookup name RESULT_BY_TIER is already taken in this file — rename the colliding binding, or write the Record manually',
          },
        },
      ],
    },
    // #1941: the reason string has to be TRUE wherever the fix is genuinely
    // withheld. Here the name really is taken, and the message says which name.
    {
      code: `
type Tier = 'free' | 'pro';
const RESULT_BY_TIER = 1;
class Pricing {
  readonly #tier!: Tier;
  public monthlyCost() {
    switch (this.#tier) {
      case 'free':
        return 0;
      case 'pro':
        return 25;
    }
  }
}
export { RESULT_BY_TIER };
`,
      output: null,
      errors: [
        {
          messageId: 'preferMapManual',
          data: {
            reason:
              'the lookup name RESULT_BY_TIER is already taken in this file — rename the colliding binding, or write the Record manually',
          },
        },
      ],
    },
    // #1941: a discriminant with no name in it at all still reports, and the
    // reason names the real condition rather than blaming a collision.
    {
      code: `
type Tier = 'free' | 'pro';
declare function readTier(): Tier;
function monthlyCost() {
  switch (readTier()) {
    case 'free':
      return 0;
    case 'pro':
      return 25;
  }
}
`,
      output: null,
      errors: [
        {
          messageId: 'preferMapManual',
          data: {
            reason: 'no lookup name could be derived from the discriminant',
          },
        },
      ],
    },
    // #1941: the ternary form hoists its Record to the enclosing statement, and
    // inside a class that statement can be the class declaration itself. A
    // branch value naming an ECMA private member cannot travel there (TS18013),
    // so the fix is withheld and the reason says where it would have landed.
    {
      code: `
type Tier = 'free' | 'pro';
declare const p: Pricing;
class Pricing {
  readonly #tier!: Tier;
  static readonly #free = 'Free';
  static label = p.#tier === 'free' ? Pricing.#free : 'Pro';
}
`,
      output: null,
      errors: [
        {
          messageId: 'preferMapManual',
          data: {
            reason:
              'the Record would hoist outside the class body, where the branch values’ `this`/`#private` reads do not resolve; extract it manually inside the class',
          },
        },
      ],
    },
    // #1941: the same escape with a `this` branch value — the privacy spelling
    // of the discriminant is irrelevant to where the Record lands, so the guard
    // is on what the hoisted text needs, not on how the discriminant is
    // spelled.
    {
      code: `
type Tier = 'free' | 'pro';
declare const p: { tier: Tier };
class Pricing {
  readonly base = 'Free';
  label = p.tier === 'free' ? this.base : 'Pro';
}
`,
      output: null,
      errors: [
        {
          messageId: 'preferMapManual',
          data: {
            reason:
              'the Record would hoist outside the class body, where the branch values’ `this`/`#private` reads do not resolve; extract it manually inside the class',
          },
        },
      ],
    },
    // #1941: a hoist that leaves the class body carrying only literals needs
    // nothing from the class, so it still fixes — the guard above is about what
    // travels, not about crossing the boundary.
    {
      code: `
type Tier = 'free' | 'pro';
declare const p: Pricing;
class Pricing {
  readonly #tier!: Tier;
  static label = p.#tier === 'free' ? 'Free' : 'Pro';
}
`,
      output: `
type Tier = 'free' | 'pro';
declare const p: Pricing;
const RESULT_BY_TIER: Record<Tier, string> = {
  free: 'Free',
  pro: 'Pro',
};
class Pricing {
  readonly #tier!: Tier;
  static label = RESULT_BY_TIER[p.#tier];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1941: the in-place forms replace the construct with a declaration plus a
    // statement, so they need a statement list to land in. As the whole body of
    // a braceless `if` the switch sits where a lexical declaration is not
    // allowed (TS1156), so the fix waits for braces — for either privacy
    // spelling, since where the construct sits is not a question about how its
    // discriminant is declared.
    {
      code: `
type Tier = 'free' | 'pro';
class Pricing {
  readonly #tier!: Tier;
  public monthlyCost(cond: boolean) {
    if (cond) switch (this.#tier) {
      case 'free':
        return 0;
      case 'pro':
        return 25;
    }
    return -1;
  }
}
`,
      output: null,
      errors: [
        {
          messageId: 'preferMapManual',
          data: {
            reason:
              'the dispatch is the whole body of a braceless branch, where a declaration is not allowed; add braces around it, then convert',
          },
        },
      ],
    },
    {
      code: `
type Tier = 'free' | 'pro';
declare const flags: { tier: Tier };
function monthlyCost(cond: boolean) {
  if (cond) switch (flags.tier) {
    case 'free':
      return 0;
    case 'pro':
      return 25;
  }
  return -1;
}
`,
      output: null,
      errors: [
        {
          messageId: 'preferMapManual',
          data: {
            reason:
              'the dispatch is the whole body of a braceless branch, where a declaration is not allowed; add braces around it, then convert',
          },
        },
      ],
    },
    // #1941: a `static` block holds a statement list, so the in-place fix still
    // lands — the carve-out above is about single-statement positions, not
    // about every position that is not a function body.
    {
      code: `
type Tier = 'free' | 'pro';
declare const p: Pricing;
class Pricing {
  readonly #tier!: Tier;
  static label = '';
  static {
    let out = '';
    switch (p.#tier) {
      case 'free':
        out = 'Free';
        break;
      case 'pro':
        out = 'Pro';
        break;
    }
    Pricing.label = out;
  }
}
`,
      output: `
type Tier = 'free' | 'pro';
declare const p: Pricing;
class Pricing {
  readonly #tier!: Tier;
  static label = '';
  static {
    let out = '';
    const RESULT_BY_TIER: Record<Tier, string> = {
      free: 'Free',
      pro: 'Pro',
    };
    out = RESULT_BY_TIER[p.#tier];
    Pricing.label = out;
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1941: a namespace body is a statement list too.
    {
      code: `
type Tier = 'free' | 'pro';
declare const flags: { tier: Tier };
namespace Pricing {
  export let out = 0;
  switch (flags.tier) {
    case 'free':
      out = 0;
      break;
    case 'pro':
      out = 25;
      break;
  }
}
`,
      output: `
type Tier = 'free' | 'pro';
declare const flags: { tier: Tier };
namespace Pricing {
  export let out = 0;
  const RESULT_BY_TIER: Record<Tier, number> = {
    free: 0,
    pro: 25,
  };
  out = RESULT_BY_TIER[flags.tier];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1626: the base object of a `this`-rooted chain is `this.config`; branches
    // reading an unrelated receiver do not narrow it, so the dispatch reports.
    {
      code: `
type Mode = 'light' | 'dark';
declare const PALETTE: { light: string; dark: string };
class Theme {
  private readonly config!: { mode: Mode };
  public color() {
    switch (this.config.mode) {
      case 'light':
        return PALETTE.light;
      case 'dark':
        return PALETTE.dark;
    }
  }
}
`,
      output: `
type Mode = 'light' | 'dark';
declare const PALETTE: { light: string; dark: string };
class Theme {
  private readonly config!: { mode: Mode };
  public color() {
    const RESULT_BY_MODE: Record<Mode, string> = {
      light: PALETTE.light,
      dark: PALETTE.dark,
    };
    return RESULT_BY_MODE[this.config.mode];
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1626: a `function` branch value binds its own `this`, so the `this` it
    // reads is not the receiver the discriminant is rooted at — the construct is
    // a genuine dispatch table and reports.
    {
      code: `
type Kind = 'alpha' | 'beta';
type Sized = { size: number };
class Registry {
  private readonly kind!: Kind;
  public handler() {
    switch (this.kind) {
      case 'alpha':
        return function (this: Sized) { return this.size; };
      case 'beta':
        return function (this: Sized) { return 0; };
    }
  }
}
`,
      output: `
type Kind = 'alpha' | 'beta';
type Sized = { size: number };
class Registry {
  private readonly kind!: Kind;
  public handler() {
    const RESULT_BY_KIND: Record<Kind, (this: Sized) => number> = {
      alpha: function (this: Sized) { return this.size; },
      beta: function (this: Sized) { return 0; },
    };
    return RESULT_BY_KIND[this.kind];
  }
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1626: a class body inside a branch value binds its own `this` as well, so
    // it does not read the receiver the discriminant is rooted at. (The printed
    // value type names class-expression internals, so this lands on the
    // report-only path — the point is that it reports at all.)
    {
      code: `
type Kind = 'alpha' | 'beta';
class Factory {
  private readonly kind!: Kind;
  public model() {
    switch (this.kind) {
      case 'alpha':
        return class { size = 1; double() { return this.size * 2; } };
      case 'beta':
        return class { size = 2; double() { return this.size * 3; } };
    }
  }
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1926: the issue's own shape — an exhaustive switch on a discriminated
    // union's tag whose `default` asserts `never` and throws. The construct
    // still converts (the default is unreachable for typed values, exactly as
    // the type gate's contract says), but the emitted key type must be the
    // discriminant's type EXPRESSION. Inlining the resolved literal union
    // silently drops the exhaustiveness the rule's own message promises: a
    // third `kind` added later leaves the Record valid, and the lookup returns
    // `undefined` under `noImplicitAny: false` with no diagnostic anywhere.
    //
    // The assertion is spelled as the canonical exhaustiveness idiom — a
    // block-scoped `const unhandled: never = body;` whose only consumer is the
    // throw beside it — rather than an inline cast, because that declarator is
    // what makes the arm a compile-time check: adding a third `kind` makes the
    // ASSIGNMENT fail, which is the diagnostic the idiom exists to produce. The
    // fix deletes the whole `default` block, taking that binding with it; that
    // is the rule's documented contract for an arm unreachable for typed values,
    // and nothing outside the block can reference a binding declared inside it
    // (#1930).
    {
      code: `
type Body = { kind: 'a' } | { kind: 'b' };
const f = (body: Body) => {
  switch (body.kind) {
    case 'a':
      return 1;
    case 'b':
      return 2;
    default: {
      const unhandled: never = body;
      throw new Error(String(unhandled));
    }
  }
};
`,
      output: `
type Body = { kind: 'a' } | { kind: 'b' };
const f = (body: Body) => {
  const RESULT_BY_KIND: Record<Body['kind'], number> = {
    a: 1,
    b: 2,
  };
  return RESULT_BY_KIND[body.kind];
};
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1926: a tag access on a value typed by a named object type — the key
    // type follows the property through the alias (`Props['mode']`) so the
    // Record is the thing that fails to compile when `mode` gains a member.
    {
      code: `
type Props = { mode: 'compact' | 'full' };
declare const props: Props;
function f() {
  switch (props.mode) {
    case 'compact':
      return 'c';
    case 'full':
      return 'f';
  }
}
`,
      output: `
type Props = { mode: 'compact' | 'full' };
declare const props: Props;
function f() {
  const RESULT_BY_MODE: Record<Props['mode'], string> = {
    compact: 'c',
    full: 'f',
  };
  return RESULT_BY_MODE[props.mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1926: a named-alias discriminant already prints as a name; deriving an
    // indexed access must not displace it.
    {
      code: `
type Mode = 'compact' | 'full';
declare const mode: Mode;
function f() {
  switch (mode) {
    case 'compact':
      return 'c';
    case 'full':
      return 'f';
  }
}
`,
      output: `
type Mode = 'compact' | 'full';
declare const mode: Mode;
function f() {
  const RESULT_BY_MODE: Record<Mode, string> = {
    compact: 'c',
    full: 'f',
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1926: the key type is derived from the discriminant, not from the
    // construct, so the ternary form carries the indexed access too (#1929).
    {
      code: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  const label = flags.tier === 'free' ? 'Free' : 'Pro';
  return label;
}
`,
      output: `
type Flags = { tier: 'free' | 'pro' };
declare const flags: Flags;
function f() {
  const RESULT_BY_TIER: Record<Flags['tier'], string> = {
    free: 'Free',
    pro: 'Pro',
  };
  const label = RESULT_BY_TIER[flags.tier];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1926: the tag access is flow-narrowed above the switch, so the
    // property's DECLARED union ('a' | 'b' | 'c') is wider than the cases the
    // construct covers. `Holder['kind']` would demand a `c` entry the switch
    // has no value for (TS2741 on the Record itself), so the resolved literal
    // union stays — the derived key type ships only when it denotes the same
    // key set.
    {
      code: `
type Kind = 'a' | 'b' | 'c';
type Holder = { kind: Kind };
declare const h: Holder;
function f() {
  if (h.kind === 'c') {
    return 0;
  }
  switch (h.kind) {
    case 'a':
      return 1;
    case 'b':
      return 2;
  }
}
`,
      output: `
type Kind = 'a' | 'b' | 'c';
type Holder = { kind: Kind };
declare const h: Holder;
function f() {
  if (h.kind === 'c') {
    return 0;
  }
  const RESULT_BY_KIND: Record<'a' | 'b', number> = {
    a: 1,
    b: 2,
  };
  return RESULT_BY_KIND[h.kind];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1926: no name is reachable from a fully inline object type, so the
    // resolved literal union stays the only faithful spelling. A synthesized
    // name that does not resolve at the fix site would not compile, which is
    // strictly worse than a weak key type.
    {
      code: `
declare const o: { kind: 'a' | 'b' };
function f() {
  switch (o.kind) {
    case 'a':
      return 1;
    case 'b':
      return 2;
  }
}
`,
      output: `
declare const o: { kind: 'a' | 'b' };
function f() {
  const RESULT_BY_KIND: Record<'a' | 'b', number> = {
    a: 1,
    b: 2,
  };
  return RESULT_BY_KIND[o.kind];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    {
      // The hoist walk must not cross the braceless if — either insert inside a
      // guarded position or decline to preferMapManual. Asserting output: null
      // pins the decline.
      code: `type Kind = 'a' | 'b';
declare const kind: Kind;
declare const box: { a: { v: number }; b: { v: number } } | undefined;
function f() {
  if (box) return kind === 'a' ? box.a.v : box.b.v;
  return 0;
}`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1990: the right operand of `&&` runs only for some values of the left,
    // so a Record hoisted to the enclosing statement dereferences both branch
    // values unguarded (TS18048 under strict; TypeError when `box` is
    // undefined).
    {
      code: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const box: { a: { v: number }; b: { v: number } } | undefined;
function f() {
  return box && (kind === 'a' ? box.a.v : box.b.v);
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1990: a braceless loop body. The values are re-read every iteration and
    // not read at all when the loop never runs, so a single hoisted snapshot
    // above the loop is neither — it throws on an empty `rows`.
    {
      code: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const rows: { a: { v: number }; b: { v: number } }[];
function f() {
  let total = 0;
  while (rows.length > 0) total += kind === 'a' ? rows[0].a.v : rows[0].b.v;
  return total;
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1990: a `typeof`/`!== null` guard whose narrowing is spent through an
    // assertion. The assertion makes the hoisted text compile in both places,
    // so the type checker never objects — the failure surfaces only when `raw`
    // is null and the eager Record dereferences it.
    {
      code: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const raw: unknown;
function f() {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (kind === 'a' ? (raw as any).a.v : (raw as any).b.v)
  );
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1990: hoisting out of a `for…of` leaves the loop's own SCOPE, so the
    // Record reads a binding that does not exist at the insertion point
    // (TS2304 / ReferenceError) — broken unconditionally, not just for some
    // inputs.
    {
      code: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const rows: ({ a: { v: number }; b: { v: number } } | undefined)[];
function f() {
  let total = 0;
  for (const r of rows) if (r) total += kind === 'a' ? r.a.v : r.b.v;
  return total;
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1990: the same scope escape without the inner guard, so the loop body
    // itself is the only boundary crossed.
    {
      code: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const rows: { a: { v: number }; b: { v: number } }[];
function f() {
  let total = 0;
  for (const r of rows) total += kind === 'a' ? r.a.v : r.b.v;
  return total;
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1990 control: the early-return spelling of the same guard. The ternary
    // is a statement of the function body, so the hoist lands BELOW the guard
    // where `box` is still narrowed — the boundary test must not reach this,
    // or it disables the ternary form's autofix wholesale.
    {
      code: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const box: { a: { v: number }; b: { v: number } } | undefined;
function f() {
  if (!box) return 0;
  return kind === 'a' ? box.a.v : box.b.v;
}
`,
      output: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const box: { a: { v: number }; b: { v: number } } | undefined;
function f() {
  if (!box) return 0;
  const RESULT_BY_KIND: Record<Kind, number> = {
    a: box.a.v,
    b: box.b.v,
  };
  return RESULT_BY_KIND[kind];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1990 control: the remedy the report-only message names. Braces stop the
    // hoist walk inside the guarded block, so the Record is written where the
    // narrowing still holds — the advice is executable, not decorative.
    {
      code: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const box: { a: { v: number }; b: { v: number } } | undefined;
function f() {
  if (box) {
    return kind === 'a' ? box.a.v : box.b.v;
  }
  return 0;
}
`,
      output: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const box: { a: { v: number }; b: { v: number } } | undefined;
function f() {
  if (box) {
    const RESULT_BY_KIND: Record<Kind, number> = {
      a: box.a.v,
      b: box.b.v,
    };
    return RESULT_BY_KIND[kind];
  }
  return 0;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1990 control: an `if` TEST is evaluated exactly once, before control
    // reaches either branch, so lifting text out of it runs precisely when it
    // used to. The boundary test asks about the child's POSITION, not the
    // parent's type.
    {
      code: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const box: { a: { v: number }; b: { v: number } };
function f() {
  if ((kind === 'a' ? box.a.v : box.b.v) > 0) {
    return 1;
  }
  return 0;
}
`,
      output: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const box: { a: { v: number }; b: { v: number } };
function f() {
  const RESULT_BY_KIND: Record<Kind, number> = {
    a: box.a.v,
    b: box.b.v,
  };
  if ((RESULT_BY_KIND[kind]) > 0) {
    return 1;
  }
  return 0;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1990: a braceless classic `for` body is guarded by the loop's test and
    // scoped to the loop's own `i`, exactly as the `for…of` row is.
    {
      code: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const rows: { a: { v: number }; b: { v: number } }[];
function f() {
  let total = 0;
  for (let i = 0; i < rows.length; i += 1) total += kind === 'a' ? rows[i].a.v : rows[i].b.v;
  return total;
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #1990 control: a `for…of` right-hand side is evaluated once before the
    // loop, and the loop binding is not in scope there, so the iterable is as
    // hoistable as any other expression.
    {
      code: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const first: string;
declare const second: string;
function f() {
  let total = 0;
  for (const ch of kind === 'a' ? first : second) {
    total += ch.length;
  }
  return total;
}
`,
      output: `
type Kind = 'a' | 'b';
declare const kind: Kind;
declare const first: string;
declare const second: string;
function f() {
  let total = 0;
  const RESULT_BY_KIND: Record<Kind, string> = {
    a: first,
    b: second,
  };
  for (const ch of RESULT_BY_KIND[kind]) {
    total += ch.length;
  }
  return total;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #1990 control: a classic `for` init runs once, before the loop's own
    // bindings can be read anywhere else, so it hoists safely.
    {
      code: `
type Kind = 'a' | 'b';
declare const kind: Kind;
function f() {
  let total = 0;
  for (let i = kind === 'a' ? 0 : 1; i < 3; i += 1) {
    total += i;
  }
  return total;
}
`,
      output: `
type Kind = 'a' | 'b';
declare const kind: Kind;
function f() {
  let total = 0;
  const RESULT_BY_KIND: Record<Kind, number> = {
    a: 0,
    b: 1,
  };
  for (let i = RESULT_BY_KIND[kind]; i < 3; i += 1) {
    total += i;
  }
  return total;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // ---- Print-width layout (#2048) ---------------------------------------
    // The fixer authors the whole declaration head, so its width is its own
    // responsibility. Every `output` below is a verified Prettier fixed point
    // at the width the case runs under; agora applies `--fix` and then runs
    // `prettier --check`, so a head Prettier rewrites fails CI on mangled
    // source before a human reads the report.
    // Width regime 1 of 3 — the head measures exactly the print width, so it
    // stays on one line. This is the control an always-wrap remedy breaks:
    // Prettier collapses a hand-broken `Record<Mode, V>` straight back.
    {
      code: `
type Mode = 'plain' | 'fancy';
class PlainSummary {}
class FancyCard {}
declare const mode: Mode;
function pick() {
  switch (mode) {
    case 'plain':
      return PlainSummary;
    case 'fancy':
      return FancyCard;
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
class PlainSummary {}
class FancyCard {}
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<Mode, typeof PlainSummary | typeof FancyCard> = {
    plain: PlainSummary,
    fancy: FancyCard,
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // Width regime 2 of 3 — one column over. Prettier's answer here is not to
    // break the type arguments but to move the map onto its own line, which
    // fits because the annotation through the `=` is two columns shorter.
    {
      code: `
type Mode = 'plain' | 'fancy';
class PlainSummary {}
class FancyCards {}
declare const mode: Mode;
function pick() {
  switch (mode) {
    case 'plain':
      return PlainSummary;
    case 'fancy':
      return FancyCards;
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
class PlainSummary {}
class FancyCards {}
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<Mode, typeof PlainSummary | typeof FancyCards> =
    {
      plain: PlainSummary,
      fancy: FancyCards,
    };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // Width regime 3 of 3 — three columns over, past the point where moving the
    // map alone helps, so the type-argument list breaks open.
    {
      code: `
type Mode = 'plain' | 'fancy';
class PlainSummary {}
class FancyCardList {}
declare const mode: Mode;
function pick() {
  switch (mode) {
    case 'plain':
      return PlainSummary;
    case 'fancy':
      return FancyCardList;
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
class PlainSummary {}
class FancyCardList {}
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<
    Mode,
    typeof PlainSummary | typeof FancyCardList
  > = {
    plain: PlainSummary,
    fancy: FancyCardList,
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // The broken type-argument list keeps a union on one line while that line
    // fits — here at exactly the print width.
    {
      code: `
type TokenStandard = 'coinflow' | 'offchain' | 'erc1155';
class CoinflowEncoder {}
class OffchainEncoder {}
class Erc1155TokenEncoder {}
declare const standard: TokenStandard;
function deduceEncoder() {
  switch (standard) {
    case 'coinflow':
      return CoinflowEncoder;
    case 'offchain':
      return OffchainEncoder;
    case 'erc1155':
      return Erc1155TokenEncoder;
  }
}
`,
      output: `
type TokenStandard = 'coinflow' | 'offchain' | 'erc1155';
class CoinflowEncoder {}
class OffchainEncoder {}
class Erc1155TokenEncoder {}
declare const standard: TokenStandard;
function deduceEncoder() {
  const RESULT_BY_STANDARD: Record<
    TokenStandard,
    typeof CoinflowEncoder | typeof OffchainEncoder | typeof Erc1155TokenEncoder
  > = {
    coinflow: CoinflowEncoder,
    offchain: OffchainEncoder,
    erc1155: Erc1155TokenEncoder,
  };
  return RESULT_BY_STANDARD[standard];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // One column further and the same union is spelled one member per line
    // behind a leading `|` — the other side of the boundary above.
    {
      code: `
type TokenStandard = 'erc1155' | 'erc721' | 'native';
class Erc1155TokenEncoder {}
class Erc721Encoder {}
class NativeTokenEncoder {}
declare const standard: TokenStandard;
function deduceEncoder() {
  switch (standard) {
    case 'erc1155':
      return Erc1155TokenEncoder;
    case 'erc721':
      return Erc721Encoder;
    case 'native':
      return NativeTokenEncoder;
  }
}
`,
      output: `
type TokenStandard = 'erc1155' | 'erc721' | 'native';
class Erc1155TokenEncoder {}
class Erc721Encoder {}
class NativeTokenEncoder {}
declare const standard: TokenStandard;
function deduceEncoder() {
  const RESULT_BY_STANDARD: Record<
    TokenStandard,
    | typeof Erc1155TokenEncoder
    | typeof Erc721Encoder
    | typeof NativeTokenEncoder
  > = {
    erc1155: Erc1155TokenEncoder,
    erc721: Erc721Encoder,
    native: NativeTokenEncoder,
  };
  return RESULT_BY_STANDARD[standard];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // The issue's shape at a width that accommodates it: the option is what
    // decides, and a 99-column head is left alone at `printWidth: 120`.
    {
      options: [{ printWidth: 120 }],
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare const formatPlain: (input: string) => string;
declare const formatFancy: (input: number) => string;
function pick() {
  switch (mode) {
    case 'plain':
      return formatPlain;
    case 'fancy':
      return formatFancy;
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare const formatPlain: (input: string) => string;
declare const formatFancy: (input: number) => string;
function pick() {
  const RESULT_BY_MODE: Record<Mode, ((input: string) => string) | ((input: number) => string)> = {
    plain: formatPlain,
    fancy: formatFancy,
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // The KEY type grows with the source too, and an anonymous discriminant
    // union is inlined into it. It breaks to leading `|` members on the same
    // measurement, and carries the comma the type-argument list needs.
    {
      options: [{ printWidth: 40 }],
      code: `
declare const status:
  | 200
  | 301
  | 400
  | 404
  | 429
  | 500
  | 503;
function describe() {
  switch (status) {
    case 200:
      return 'ok';
    case 301:
      return 'moved';
    case 400:
      return 'bad request';
    case 404:
      return 'not found';
    case 429:
      return 'slow down';
    case 500:
      return 'server error';
    case 503:
      return 'unavailable';
  }
}
`,
      output: `
declare const status:
  | 200
  | 301
  | 400
  | 404
  | 429
  | 500
  | 503;
function describe() {
  const RESULT_BY_STATUS: Record<
    | 200
    | 301
    | 400
    | 404
    | 429
    | 500
    | 503,
    string
  > = {
    200: 'ok',
    301: 'moved',
    400: 'bad request',
    404: 'not found',
    429: 'slow down',
    500: 'server error',
    503: 'unavailable',
  };
  return RESULT_BY_STATUS[status];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // An atomic type has no break point of its own, so Prettier leaves it on
    // its over-wide line — emitting that line IS emitting Prettier's output,
    // and the fix is not withheld over it.
    {
      code: `
type Mode = 'plain' | 'fancy';
class TheOnlyRendererImplementationForEveryDispatchedModeHere {}
declare const mode: Mode;
declare const plainRenderer: TheOnlyRendererImplementationForEveryDispatchedModeHere;
declare const fancyRenderer: TheOnlyRendererImplementationForEveryDispatchedModeHere;
function pick() {
  switch (mode) {
    case 'plain':
      return plainRenderer;
    case 'fancy':
      return fancyRenderer;
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
class TheOnlyRendererImplementationForEveryDispatchedModeHere {}
declare const mode: Mode;
declare const plainRenderer: TheOnlyRendererImplementationForEveryDispatchedModeHere;
declare const fancyRenderer: TheOnlyRendererImplementationForEveryDispatchedModeHere;
function pick() {
  const RESULT_BY_MODE: Record<
    Mode,
    TheOnlyRendererImplementationForEveryDispatchedModeHere
  > = {
    plain: plainRenderer,
    fancy: fancyRenderer,
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // Each union member overflows its own line and Prettier answers by opening
    // the function types up, a shape this fixer cannot author — so it declines
    // rather than shipping text `prettier --check` rejects.
    {
      code: `
type Mode = 'plain' | 'fancy';
type PlainInput = { readonly identifier: string };
type FancyInput = { readonly identifier: number };
declare const mode: Mode;
declare const formatPlain: (
  input: PlainInput,
  fallbackLabelText: string,
  secondFallbackLabel: number,
) => string;
declare const formatFancy: (
  input: FancyInput,
  fallbackLabelText: number,
  secondFallbackLabel: string,
) => number;
function pick() {
  switch (mode) {
    case 'plain':
      return formatPlain;
    case 'fancy':
      return formatFancy;
  }
}
`,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // The same decline with a single value type: there is no union to spell one
    // member per line, and the lone member is one Prettier reflows.
    {
      code: `
type Mode = 'plain' | 'fancy';
type RowInput = { readonly identifier: string };
declare const mode: Mode;
declare const formatPlain: (
  row: RowInput,
  fallbackLabelText: string,
  secondFallbackLabel: number,
) => string;
declare const formatFancy: (
  row: RowInput,
  fallbackLabelText: string,
  secondFallbackLabel: number,
) => string;
function pick() {
  switch (mode) {
    case 'plain':
      return formatPlain;
    case 'fancy':
      return formatFancy;
  }
}
`,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // A generic type argument makes the annotation "complex" in Prettier's sense:
    // it breaks the argument list rather than moving the map down, even one
    // column over, where an ordinary union takes the narrower spelling above.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare class SomeQuiteLongDispatchResultTypeName {}
declare class Box<T> {
  value: T;
}
declare const plainBox: Box<SomeQuiteLongDispatchResultTypeName>;
declare const fancyBox: Box<SomeQuiteLongDispatchResultTypeName>;
declare const mode: Mode;
function pick() {
  switch (mode) {
    case 'plain':
      return plainBox;
    case 'fancy':
      return fancyBox;
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare class SomeQuiteLongDispatchResultTypeName {}
declare class Box<T> {
  value: T;
}
declare const plainBox: Box<SomeQuiteLongDispatchResultTypeName>;
declare const fancyBox: Box<SomeQuiteLongDispatchResultTypeName>;
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<
    Mode,
    Box<SomeQuiteLongDispatchResultTypeName>
  > = {
    plain: plainBox,
    fancy: fancyBox,
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // A lone "simple" type argument is hugged onto its reference's line, so the
    // spelling has no break point of its own and rides its over-wide line.
    {
      options: [{ printWidth: 40 }],
      code: `
type Mode = 'plain' | 'fancy';
declare class SomeQuiteLongDispatchResultTypeName {}
declare class Box<T> {
  value: T;
}
declare const plainBox: Box<SomeQuiteLongDispatchResultTypeName>;
declare const fancyBox: Box<SomeQuiteLongDispatchResultTypeName>;
declare const mode: Mode;
function pick() {
  switch (mode) {
    case 'plain':
      return plainBox;
    case 'fancy':
      return fancyBox;
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare class SomeQuiteLongDispatchResultTypeName {}
declare class Box<T> {
  value: T;
}
declare const plainBox: Box<SomeQuiteLongDispatchResultTypeName>;
declare const fancyBox: Box<SomeQuiteLongDispatchResultTypeName>;
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<
    Mode,
    Box<SomeQuiteLongDispatchResultTypeName>
  > = {
    plain: plainBox,
    fancy: fancyBox,
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // Two type arguments are a break point of their own: Prettier opens the
    // list up rather than leaving the line long, so the fix declines.
    {
      options: [{ printWidth: 40 }],
      code: `
type Mode = 'plain' | 'fancy';
declare class SomeKeyTypeName {}
declare class SomeValueTypeName {}
declare class Pair<K, V> {
  key: K;
  value: V;
}
declare const plainPair: Pair<
  SomeKeyTypeName,
  SomeValueTypeName
>;
declare const fancyPair: Pair<
  SomeKeyTypeName,
  SomeValueTypeName
>;
declare const mode: Mode;
function pick() {
  switch (mode) {
    case 'plain':
      return plainPair;
    case 'fancy':
      return fancyPair;
  }
}
`,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #2059: an anonymous literal-union discriminant. `typeToString` prints a
    // string-literal type double-quoted whatever the file's quote style is, and
    // the printed text ships straight into the key position, so the authored
    // line failed `prettier --check` at any width.
    {
      code: `
declare const kind: 'a' | 'b';
function f() {
  switch (kind) {
    case 'a':
      return 1;
    case 'b':
      return 2;
  }
}
`,
      output: `
declare const kind: 'a' | 'b';
function f() {
  const RESULT_BY_KIND: Record<'a' | 'b', number> = {
    a: 1,
    b: 2,
  };
  return RESULT_BY_KIND[kind];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2059: a member holding a double quote. The printer escapes it inside its
    // own delimiter; Prettier drops an escape the chosen delimiter does not
    // need, which a textual quote swap cannot do.
    {
      code: `
declare const kind: 'say "hi"' | 'plain';
function f() {
  switch (kind) {
    case 'say "hi"':
      return 1;
    case 'plain':
      return 2;
  }
}
`,
      output: `
declare const kind: 'say "hi"' | 'plain';
function f() {
  const RESULT_BY_KIND: Record<'say "hi"' | 'plain', number> = {
    'say "hi"': 1,
    plain: 2,
  };
  return RESULT_BY_KIND[kind];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2059: a member holding a single quote keeps its double quotes even under
    // `singleQuote`, because Prettier picks the delimiter that needs fewer
    // escapes — so only the second member flips, in the type AND in the key.
    {
      code: `
declare const kind: "it's" | 'plain';
function f() {
  switch (kind) {
    case "it's":
      return 1;
    case 'plain':
      return 2;
  }
}
`,
      output: `
declare const kind: "it's" | 'plain';
function f() {
  const RESULT_BY_KIND: Record<"it's" | 'plain', number> = {
    "it's": 1,
    plain: 2,
  };
  return RESULT_BY_KIND[kind];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2059: `singleQuote: false`. The indexed-access key the fix reaches for is
    // authored by this rule rather than printed by the checker, so it is the arm
    // where the option decides the delimiter rather than merely keeping it.
    {
      options: [{ singleQuote: false }],
      code: `
type Flags = { tier: "free" | "pro" };
declare const flags: Flags;
function f() {
  const label = flags.tier === "free" ? "Free" : "Pro";
  return label;
}
`,
      output: `
type Flags = { tier: "free" | "pro" };
declare const flags: Flags;
function f() {
  const RESULT_BY_TIER: Record<Flags["tier"], string> = {
    free: "Free",
    pro: "Pro",
  };
  const label = RESULT_BY_TIER[flags.tier];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2059: the bidirectional partner of the fixture above, and a negative
    // control — under `singleQuote: false` the printer's own double quotes are
    // left exactly as they are, so the normalizer is not rewriting blindly.
    {
      options: [{ singleQuote: false }],
      code: `
declare const kind: "a" | "b";
function f() {
  switch (kind) {
    case "a":
      return 1;
    case "b":
      return 2;
  }
}
`,
      output: `
declare const kind: "a" | "b";
function f() {
  const RESULT_BY_KIND: Record<"a" | "b", number> = {
    a: 1,
    b: 2,
  };
  return RESULT_BY_KIND[kind];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2059: a union too wide for one line goes through the broken
    // type-argument list, a different emission path from the flat join — the
    // normalization has to happen before the split, not after.
    {
      code: `
declare const kind:
  | 'alphaalpha'
  | 'bravobravo'
  | 'charliecharlie'
  | 'deltadelta';
function f() {
  switch (kind) {
    case 'alphaalpha':
      return 1;
    case 'bravobravo':
      return 2;
    case 'charliecharlie':
      return 3;
    case 'deltadelta':
      return 4;
  }
}
`,
      output: `
declare const kind:
  | 'alphaalpha'
  | 'bravobravo'
  | 'charliecharlie'
  | 'deltadelta';
function f() {
  const RESULT_BY_KIND: Record<
    'alphaalpha' | 'bravobravo' | 'charliecharlie' | 'deltadelta',
    number
  > = {
    alphaalpha: 1,
    bravobravo: 2,
    charliecharlie: 3,
    deltadelta: 4,
  };
  return RESULT_BY_KIND[kind];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2059: members that are not identifiers, so the same value is spelled in
    // the type position and in the key position by two different emitters. They
    // have to agree on the delimiter.
    {
      code: `
declare const kind: 'a-one' | 'b-two';
function f() {
  switch (kind) {
    case 'a-one':
      return 1;
    case 'b-two':
      return 2;
  }
}
`,
      output: `
declare const kind: 'a-one' | 'b-two';
function f() {
  const RESULT_BY_KIND: Record<'a-one' | 'b-two', number> = {
    'a-one': 1,
    'b-two': 2,
  };
  return RESULT_BY_KIND[kind];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2059, value position: a bare literal branch value is widened before it is
    // printed, but a literal NESTED in a type reference survives that widening
    // and reaches the annotation double-quoted.
    {
      code: `
type K = 'a' | 'b';
declare const k: K;
declare const A: Record<'x', number>;
declare const B: Record<'y', number>;
function f() {
  switch (k) {
    case 'a':
      return A;
    case 'b':
      return B;
  }
}
`,
      output: `
type K = 'a' | 'b';
declare const k: K;
declare const A: Record<'x', number>;
declare const B: Record<'y', number>;
function f() {
  const RESULT_BY_K: Record<K, Record<'x', number> | Record<'y', number>> = {
    a: A,
    b: B,
  };
  return RESULT_BY_K[k];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060: the enclosing declarator wrapped only because the ternary was wide.
    // The lookup is short, so Prettier joins the host back onto one line and the
    // emitted break has to go with the expression it belonged to.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_HEADER: string;
function getLabel() {
  const label =
    side === 'buy' ? BUY_SIDE_LABEL_TEXT : SELL_SIDE_LABEL_TEXT_FOR_HEADER;
  return label;
}
`,
      output: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_HEADER: string;
function getLabel() {
  const RESULT_BY_SIDE: Record<Side, string> = {
    buy: BUY_SIDE_LABEL_TEXT,
    sell: SELL_SIDE_LABEL_TEXT_FOR_HEADER,
  };
  const label = RESULT_BY_SIDE[side];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060 RETAIN: the host is over-width for a reason the ternary never
    // caused, so Prettier keeps the break and the fixer must keep it too.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const selectedTradingSideLabelForTheOrderConfirmationDialog =
    side === 'buy' ? 'Buy now' : 'Sell now';
  return selectedTradingSideLabelForTheOrderConfirmationDialog;
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
  const selectedTradingSideLabelForTheOrderConfirmationDialog =
    RESULT_BY_SIDE[side];
  return selectedTradingSideLabelForTheOrderConfirmationDialog;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060 RETAIN, second cause: the binding name is short and the type
    // annotation is what holds the host over the width.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const label: Readonly<Record<'x', string>> | string | undefined =
    side === 'buy' ? 'Buy now' : 'Sell now';
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
  const label: Readonly<Record<'x', string>> | string | undefined =
    RESULT_BY_SIDE[side];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060: an assignment right-hand side breaks after `=` exactly as a
    // declarator does, so the join cannot be keyed on the declarator alone.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT_MAIN: string;
declare const SELL_SIDE_LABEL_TEXT_HEADER: string;
function getLabel() {
  let label = '';
  label =
    side === 'buy' ? BUY_SIDE_LABEL_TEXT_MAIN : SELL_SIDE_LABEL_TEXT_HEADER;
  return label;
}
`,
      output: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT_MAIN: string;
declare const SELL_SIDE_LABEL_TEXT_HEADER: string;
function getLabel() {
  let label = '';
  const RESULT_BY_SIDE: Record<Side, string> = {
    buy: BUY_SIDE_LABEL_TEXT_MAIN,
    sell: SELL_SIDE_LABEL_TEXT_HEADER,
  };
  label = RESULT_BY_SIDE[side];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060: an object property value breaks after `:`. The literal stays
    // expanded — Prettier preserves that — so only the property line joins.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_HEADER: string;
function buildRow() {
  const row = {
    label:
      side === 'buy' ? BUY_SIDE_LABEL_TEXT : SELL_SIDE_LABEL_TEXT_FOR_HEADER,
  };
  return row;
}
`,
      output: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_HEADER: string;
function buildRow() {
  const RESULT_BY_SIDE: Record<Side, string> = {
    buy: BUY_SIDE_LABEL_TEXT,
    sell: SELL_SIDE_LABEL_TEXT_FOR_HEADER,
  };
  const row = {
    label: RESULT_BY_SIDE[side],
  };
  return row;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060 DECLINE: a comment sits between the `=` and the expression. Joining
    // would pull the lookup onto the comment's line and comment it out, and the
    // retained break is itself what Prettier writes.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const label =
    // the buy label leads because the buy flow is the default
    side === 'buy' ? 'Buy now' : 'Sell now';
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
  const label =
    // the buy label leads because the buy flow is the default
    RESULT_BY_SIDE[side];
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060 BOUNDARY: the joined line measures exactly the print width, which
    // Prettier keeps on one line. Paired with the fixture below, this pins the
    // comparison as `<=` rather than `<`.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const labelXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX =
    side === 'buy' ? 'Buy now' : 'Sell now';
  return labelXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX;
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
  const labelXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX = RESULT_BY_SIDE[side];
  return labelXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060 BOUNDARY: one column wider, so the joined line would overflow and
    // the break stays.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const labelXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX =
    side === 'buy' ? 'Buy now' : 'Sell now';
  return labelXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX;
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
  const labelXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX =
    RESULT_BY_SIDE[side];
  return labelXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060: the join reads the configured width, not a hard-coded 80 — at 40
    // the same host stays broken.
    {
      options: [{ printWidth: 40 }],
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const labelForTheSide =
    side === 'buy' ? 'Buy' : 'Sell';
  return labelForTheSide;
}
`,
      output: `
type Side = 'buy' | 'sell';
declare const side: Side;
function getLabel() {
  const RESULT_BY_SIDE: Record<
    Side,
    string
  > = {
    buy: 'Buy',
    sell: 'Sell',
  };
  const labelForTheSide =
    RESULT_BY_SIDE[side];
  return labelForTheSide;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060: a call broken open around its sole argument. Absorbing the whole
    // interior takes the dangling comma with it; leaving it would produce
    // `renderLabel(RESULT_BY_SIDE[side],);`, which Prettier rewrites again.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_HEADER: string;
declare function renderLabel(text: string): void;
function paint() {
  renderLabel(
    side === 'buy' ? BUY_SIDE_LABEL_TEXT : SELL_SIDE_LABEL_TEXT_FOR_HEADER,
  );
}
`,
      output: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_HEADER: string;
declare function renderLabel(text: string): void;
function paint() {
  const RESULT_BY_SIDE: Record<Side, string> = {
    buy: BUY_SIDE_LABEL_TEXT,
    sell: SELL_SIDE_LABEL_TEXT_FOR_HEADER,
  };
  renderLabel(RESULT_BY_SIDE[side]);
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060 DECLINE: a comment after the dangling comma sits in the absorbed
    // interior while being adjacent to neither end of it — `getCommentsAfter`
    // on the expression stops at the comma — so the join would delete text the
    // fixer does not own. The join is dropped and the expression replaced in
    // place; the conversion itself still happens and the comment survives.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_HEADER: string;
declare function renderLabel(text: string): void;
function paint() {
  renderLabel(
    side === 'buy' ? BUY_SIDE_LABEL_TEXT : SELL_SIDE_LABEL_TEXT_FOR_HEADER, /* keep */
  );
}
`,
      output: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_HEADER: string;
declare function renderLabel(text: string): void;
function paint() {
  const RESULT_BY_SIDE: Record<Side, string> = {
    buy: BUY_SIDE_LABEL_TEXT,
    sell: SELL_SIDE_LABEL_TEXT_FOR_HEADER,
  };
  renderLabel(
    RESULT_BY_SIDE[side], /* keep */
  );
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060 DECLINE, operator arm: the mirror case on the other absorbing
    // spelling. Here the tail check already refuses it — anything past the
    // expression's own terminator means joining does not produce one line — so
    // this pins that the two arms agree rather than one carrying the comment
    // and the other eating it.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_HEADER: string;
function paint() {
  const label =
    side === 'buy' ? BUY_SIDE_LABEL_TEXT : SELL_SIDE_LABEL_TEXT_FOR_HEADER; /* keep */
  return label;
}
`,
      output: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_HEADER: string;
function paint() {
  const RESULT_BY_SIDE: Record<Side, string> = {
    buy: BUY_SIDE_LABEL_TEXT,
    sell: SELL_SIDE_LABEL_TEXT_FOR_HEADER,
  };
  const label =
    RESULT_BY_SIDE[side]; /* keep */
  return label;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2060 CONTROL: `return` never carries a break before the expression —
    // Prettier breaks the ternary's own `?`/`:` instead, so that break lives
    // inside the replaced node. Nothing may be absorbed here.
    {
      code: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT_FOR_DISPLAY: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_DISPLAY: string;
function getLabel() {
  return side === 'buy'
    ? BUY_SIDE_LABEL_TEXT_FOR_DISPLAY
    : SELL_SIDE_LABEL_TEXT_FOR_DISPLAY;
}
`,
      output: `
type Side = 'buy' | 'sell';
declare const side: Side;
declare const BUY_SIDE_LABEL_TEXT_FOR_DISPLAY: string;
declare const SELL_SIDE_LABEL_TEXT_FOR_DISPLAY: string;
function getLabel() {
  const RESULT_BY_SIDE: Record<Side, string> = {
    buy: BUY_SIDE_LABEL_TEXT_FOR_DISPLAY,
    sell: SELL_SIDE_LABEL_TEXT_FOR_DISPLAY,
  };
  return RESULT_BY_SIDE[side];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2061: a multi-line function expression copied into an entry kept the
    // columns it had at its original nesting depth, landing one step too deep.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
  switch (mode) {
    case 'plain':
      return function (input: string) {
        return input + '!';
      };
    case 'fancy':
      return function (input: string) {
        return input + '?';
      };
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (input: string) => string> = {
    plain: function (input: string) {
      return input + '!';
    },
    fancy: function (input: string) {
      return input + '?';
    },
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2061: an arrow with a block body, nested two levels deeper. The delta is
    // read from the copied node, not assumed from the construct's depth.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
export const outer = () => {
  return function middle() {
    switch (mode) {
      case 'plain':
        return (i: string) => {
          return i + '!';
        };
      case 'fancy':
        return (i: string) => {
          return i + '?';
        };
    }
  };
};
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
export const outer = () => {
  return function middle() {
    const RESULT_BY_MODE: Record<Mode, (i: string) => string> = {
      plain: (i: string) => {
        return i + '!';
      },
      fancy: (i: string) => {
        return i + '?';
      },
    };
    return RESULT_BY_MODE[mode];
  };
};
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2061 THE OTHER DIRECTION: at this width the head takes the regime that
    // moves the map one step in, so the entry sits DEEPER than the statement the
    // value was copied from and the rebase has to add indentation. A fixer that
    // only ever dedents passes every other fixture here and fails this one.
    {
      options: [{ printWidth: 65 }],
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
  if (mode === 'plain') {
    return (input: string) => {
      return input + '!';
    };
  } else {
    return (input: string) => {
      return input + '?';
    };
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (input: string) => string> =
    {
      plain: (input: string) => {
        return input + '!';
      },
      fancy: (input: string) => {
        return input + '?';
      },
    };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2061 ZERO-DELTA CONTROL: the same chain at the default width, where the
    // source depth already equals the entry depth. Catches an off-by-one that
    // shifts unconditionally.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
  if (mode === 'plain') {
    return (input: string) => {
      return input + '!';
    };
  } else {
    return (input: string) => {
      return input + '?';
    };
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (input: string) => string> = {
    plain: (input: string) => {
      return input + '!';
    },
    fancy: (input: string) => {
      return input + '?';
    },
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2061: a multi-line template literal inside the copied body. Its interior
    // line is the value the code produces, so it must NOT move while the block
    // lines around it do.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
  switch (mode) {
    case 'plain':
      return (i: string) => {
        return \`first
second\`;
      };
    case 'fancy':
      return (i: string) => {
        return i;
      };
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (i: string) => string> = {
    plain: (i: string) => {
      return \`first
second\`;
    },
    fancy: (i: string) => {
      return i;
    },
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2061 DECLINE: a tab-indented source against a fix site indented in tabs
    // plus spaces. Neither indentation is a prefix of the other, so no delta is
    // expressible and the fix is withheld rather than emitting a mangled body.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
\tswitch (mode) {
\t\tcase 'plain':
\t\t\treturn (i: string) => {
\t\t\t\treturn i + '!';
\t\t\t};
\t\tcase 'fancy':
\t\t\treturn (i: string) => {
\t\t\t\treturn i + '?';
\t\t\t};
\t}
}
`,
      output: null,
      errors: [{ messageId: 'preferMapManual' }],
    },
    // #2061 DECLINE SCOPE: the same tab-indented file with single-line values
    // still autofixes. Without this control the decline could widen to every
    // tab-indented file and silently disable the rule there.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
\tswitch (mode) {
\t\tcase 'plain':
\t\t\treturn 1;
\t\tcase 'fancy':
\t\t\treturn 2;
\t}
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
\tconst RESULT_BY_MODE: Record<Mode, number> = {
\t  plain: 1,
\t  fancy: 2,
\t};
\treturn RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2061: grouped cases copy one value into two entries, so the rebase runs
    // per entry rather than once per source branch.
    {
      code: `
type Mode = 'plain' | 'fancy' | 'bold';
declare const mode: Mode;
function pick() {
  switch (mode) {
    case 'plain':
    case 'fancy':
      return (i: string) => {
        return i + '!';
      };
    case 'bold':
      return (i: string) => {
        return i + '#';
      };
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy' | 'bold';
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (i: string) => string> = {
    plain: (i: string) => {
      return i + '!';
    },
    fancy: (i: string) => {
      return i + '!';
    },
    bold: (i: string) => {
      return i + '#';
    },
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2061: the last entry comes from the `default` clause, which reaches the
    // emitter down the tail path rather than the explicit-branch path.
    {
      code: `
type Mode = 'plain' | 'fancy' | 'bold';
declare const mode: Mode;
function pick() {
  switch (mode) {
    case 'plain':
      return (i: string) => {
        return i + '!';
      };
    case 'fancy':
      return (i: string) => {
        return i + '?';
      };
    default:
      return (i: string) => {
        return i;
      };
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy' | 'bold';
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (i: string) => string> = {
    plain: (i: string) => {
      return i + '!';
    },
    fancy: (i: string) => {
      return i + '?';
    },
    bold: (i: string) => {
      return i;
    },
  };
  return RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2061: the assign form reaches the same emitter through a different
    // capture site.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare let out: (i: string) => string;
function pick() {
  switch (mode) {
    case 'plain':
      out = (i: string) => {
        return i + '!';
      };
      break;
    case 'fancy':
      out = (i: string) => {
        return i + '?';
      };
      break;
  }
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
declare let out: (i: string) => string;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (i: string) => string> = {
    plain: (i: string) => {
      return i + '!';
    },
    fancy: (i: string) => {
      return i + '?';
    },
  };
  out = RESULT_BY_MODE[mode];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // #2061 x #2060: a ternary branch is written one step in from its line's
    // indentation (the `? ` alignment), so the delta is two steps here and only
    // the branch's closing line records the depth it was written at. The host's
    // stale wrap is absorbed in the same fix.
    {
      code: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
  const handler =
    mode === 'plain'
      ? (i: string) => {
          return i + '!';
        }
      : (i: string) => {
          return i + '?';
        };
  return handler;
}
`,
      output: `
type Mode = 'plain' | 'fancy';
declare const mode: Mode;
function pick() {
  const RESULT_BY_MODE: Record<Mode, (i: string) => string> = {
    plain: (i: string) => {
      return i + '!';
    },
    fancy: (i: string) => {
      return i + '?';
    },
  };
  const handler = RESULT_BY_MODE[mode];
  return handler;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
  ],
};

ruleTesterTs.run(
  'prefer-map-over-conditional-dispatch',
  preferMapOverConditionalDispatch,
  tsTests,
);

// JSX-specific coverage (Edge 10): branch bodies that create elements.
const jsxTests: RuleTests = {
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
    // #1663: the live agora file (PushDeviceList.tsx) — a status constant
    // imported solely to name the dispatch keys. Emitting the checker-resolved
    // values left the import unreferenced and failed no-unused-vars there.
    {
      code: `
declare module '../../hooks/notification/useThisDeviceStatus' {
  export const THIS_DEVICE_STATUS: {
    readonly active: 'active';
    readonly unregistered: 'unregistered';
    readonly hasOtherDevices: 'hasOtherDevices';
    readonly blocked: 'blocked';
  };
}
import { THIS_DEVICE_STATUS } from '../../hooks/notification/useThisDeviceStatus';
type Status = 'active' | 'unregistered' | 'hasOtherDevices' | 'blocked';
declare const status: Status;
declare const device: unknown;
declare const turnOn: () => void;
declare const recover: () => void;
declare const ThisDeviceRow: any;
function render() {
  switch (status) {
    case THIS_DEVICE_STATUS.active:
      return device ? <ThisDeviceRow device={device} status="active" /> : null;
    case THIS_DEVICE_STATUS.unregistered:
      return <ThisDeviceRow status="unregistered" onTurnOn={turnOn} />;
    case THIS_DEVICE_STATUS.hasOtherDevices:
      return <ThisDeviceRow status="hasOtherDevices" onTurnOn={turnOn} />;
    case THIS_DEVICE_STATUS.blocked:
      return <ThisDeviceRow status="blocked" onRecover={recover} />;
  }
}
`,
      output: `
declare module '../../hooks/notification/useThisDeviceStatus' {
  export const THIS_DEVICE_STATUS: {
    readonly active: 'active';
    readonly unregistered: 'unregistered';
    readonly hasOtherDevices: 'hasOtherDevices';
    readonly blocked: 'blocked';
  };
}
import { THIS_DEVICE_STATUS } from '../../hooks/notification/useThisDeviceStatus';
type Status = 'active' | 'unregistered' | 'hasOtherDevices' | 'blocked';
declare const status: Status;
declare const device: unknown;
declare const turnOn: () => void;
declare const recover: () => void;
declare const ThisDeviceRow: any;
function render() {
  const RESULT_BY_STATUS: Record<Status, any> = {
    [THIS_DEVICE_STATUS.active]: device ? <ThisDeviceRow device={device} status="active" /> : null,
    [THIS_DEVICE_STATUS.unregistered]: <ThisDeviceRow status="unregistered" onTurnOn={turnOn} />,
    [THIS_DEVICE_STATUS.hasOtherDevices]: <ThisDeviceRow status="hasOtherDevices" onTurnOn={turnOn} />,
    [THIS_DEVICE_STATUS.blocked]: <ThisDeviceRow status="blocked" onRecover={recover} />,
  };
  return RESULT_BY_STATUS[status];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
  ],
};

ruleTesterJsx.run(
  'prefer-map-over-conditional-dispatch (jsx)',
  preferMapOverConditionalDispatch,
  jsxTests,
);

const jsxAnnotationTests: RuleTests = {
  valid: [],
  invalid: [
    {
      code: `
export {};
declare global {
  namespace JSX {
    interface Element { readonly _brand: unique symbol; }
    interface IntrinsicElements { [name: string]: unknown; }
  }
}
declare function Checkbox(): JSX.Element;
declare function Switch(): JSX.Element;
type Variant = 'switch' | 'icon-toggle';
declare const variant: Variant;
function render() {
  switch (variant) {
    case 'icon-toggle':
      return <Checkbox />;
    case 'switch':
      return <Switch />;
  }
}
`,
      output: `
export {};
declare global {
  namespace JSX {
    interface Element { readonly _brand: unique symbol; }
    interface IntrinsicElements { [name: string]: unknown; }
  }
}
declare function Checkbox(): JSX.Element;
declare function Switch(): JSX.Element;
type Variant = 'switch' | 'icon-toggle';
declare const variant: Variant;
function render() {
  const RESULT_BY_VARIANT: Record<Variant, JSX.Element> = {
    'icon-toggle': <Checkbox />,
    switch: <Switch />,
  };
  return RESULT_BY_VARIANT[variant];
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
  ],
};

ruleTesterJsx.run(
  'prefer-map-over-conditional-dispatch (jsx type annotation)',
  preferMapOverConditionalDispatch,
  jsxAnnotationTests,
);

// The RuleTester never re-parses `output`, so an autofix emitting invalid
// TypeScript — the exact defect this suite regression-tests — would pass the
// string comparison silently. Every expected output must parse standalone.
describe('prefer-map-over-conditional-dispatch fix output parseability', () => {
  const outputs = [
    ...tsTests.invalid,
    ...jsxTests.invalid,
    ...jsxAnnotationTests.invalid,
  ]
    .map((testCase) => testCase.output)
    .filter((output): output is string => typeof output === 'string');

  it('parses every expected autofix output as valid TypeScript', () => {
    expect(outputs.length).toBeGreaterThan(0);
    for (const output of outputs) {
      expect(() =>
        parse(output, { ecmaFeatures: { jsx: true }, range: true, loc: true }),
      ).not.toThrow();
    }
  });

  it('rejects an unparenthesized function-type union, proving the guard has teeth', () => {
    expect(() =>
      parse(
        'const R: Record<"a" | "b", (...p: readonly string[]) => void | (...s: readonly number[]) => void> = {};',
        { range: true },
      ),
    ).toThrow();
  });
});

/**
 * Pinning the expected text keeps a fix's layout stable, but says nothing about
 * whether that layout is the one the consumer's formatter wants — and text
 * `prettier --check` rejects is text the next `prettier --write` rewrites. So
 * the layout is measured against the repo's own Prettier rather than eyeballed
 * (#2062), which matters most for a function-valued entry: the widest thing
 * this fixer copies, a multi-line body it re-indents under a head whose own
 * layout depends on the annotation's width.
 *
 * The oracle is CONDITIONAL on the input, because the fixer copies branch
 * values verbatim: a fixture written with its function body on one line ships
 * that line into the Record, and the reformatting Prettier then asks for is the
 * fixture's spelling talking, not the fixer's. Only a fixture whose own source
 * is already a fixed point can hold the fixer to one.
 */
describe('prefer-map-over-conditional-dispatch fix layout vs Prettier', () => {
  const PRETTIER_OPTIONS: prettier.Options = {
    parser: 'typescript',
    printWidth: 80,
    tabWidth: 2,
    singleQuote: true,
    semi: true,
    trailingComma: 'all',
  };

  const isFixedPoint = (text: string): boolean =>
    prettier.format(text, PRETTIER_OPTIONS) === text;

  // A case carrying `options` authors its layout for a width that is not the
  // repo's, so Prettier at 80 is not its oracle. The leading newline every
  // fixture opens with is a template-literal artifact Prettier strips; every
  // other byte has to survive formatting untouched.
  const fixedCases = tsTests.invalid
    .filter((testCase) => testCase.options === undefined)
    .map((testCase) => ({
      code: testCase.code.trimStart(),
      output:
        typeof testCase.output === 'string' ? testCase.output.trimStart() : '',
    }))
    .filter((testCase) => testCase.output !== '');
  const settled = fixedCases.filter((testCase) => isFixedPoint(testCase.code));
  const functionValued = settled.filter((testCase) =>
    /Record<[A-Za-z]+, \(/.test(testCase.output),
  );

  it('rewrites Prettier-clean input into Prettier-clean output', () => {
    console.log(
      `[fix-layout] ${settled.length} settled input(s) of ${fixedCases.length} fixed, ${functionValued.length} function-valued`,
    );
    // Floors just under the measured counts, so a fixture edited out of either
    // sample fails here rather than quietly emptying it.
    expect(settled.length).toBeGreaterThanOrEqual(108);
    expect(functionValued.length).toBeGreaterThanOrEqual(14);
    for (const testCase of functionValued) {
      expect(prettier.format(testCase.output, PRETTIER_OPTIONS)).toBe(
        testCase.output,
      );
    }
  });

  it('carries exactly the one measured residue over the whole sample', () => {
    // Replacing a PARENTHESIZED expression keeps the source's parentheses
    // (`if ((RESULT_BY_KIND[kind]) > 0)`), which Prettier strips as redundant.
    // That is a property of the replacement span rather than of the layout this
    // guard is about, so it is named rather than filtered away: a second
    // unstable output has to fail here.
    const unstable = settled.filter(
      (testCase) => !isFixedPoint(testCase.output),
    );
    expect(unstable).toHaveLength(1);
    expect(unstable[0].output).toContain('if ((RESULT_BY_KIND[kind]) > 0) {');
  });

  it('accounts for what it skips: a ceiling cut close to the measurement', () => {
    // The skipped cases are fixtures whose own source Prettier would rewrite.
    // Left uncounted, a formatting drift that unsettled every input would leave
    // the assertion above passing over an empty sample, so the ceiling sits
    // just above the measured count rather than at "a minority".
    expect(fixedCases.length - settled.length).toBeLessThanOrEqual(8);
  });

  it('is not vacuous: the same output mis-indented is rejected', () => {
    const misindented = functionValued[0].output.replace(
      '  const RESULT_BY_',
      '    const RESULT_BY_',
    );
    expect(misindented).not.toBe(functionValued[0].output);
    expect(prettier.format(misindented, PRETTIER_OPTIONS)).not.toBe(
      misindented,
    );
  });
});

/**
 * The layout the fixer authors is only correct if it agrees with Prettier, so
 * the agreement is asserted against the repo's own Prettier rather than
 * described. Each spelling below sits alone as the value type argument of a
 * `Record<>` whose argument list has already broken, at a width it overflows:
 * Prettier either leaves it on that over-wide line (a shape the fixer may
 * emit) or opens it up (a shape the fixer cannot author, and declines).
 */
describe('prefer-map-over-conditional-dispatch print-width classifier', () => {
  const PRETTIER_OPTIONS: prettier.Options = {
    parser: 'typescript',
    printWidth: 80,
    tabWidth: 2,
    singleQuote: true,
    semi: true,
    trailingComma: 'all',
  };

  const prettierReflows = (typeText: string): boolean => {
    const source = `function scope() {\n  const RESULT: Record<Key, ${typeText}> = {\n    alpha: first,\n  };\n}\n`;
    const formatted = prettier.format(source, PRETTIER_OPTIONS);
    return !formatted
      .split('\n')
      .some((line) => line.trim() === typeText.trim());
  };

  // Long enough that every spelling below overflows its own line.
  const PAD = 'X'.repeat(60);
  const SPELLINGS = [
    `SomeVeryLongTypeName${PAD}`,
    `typeof SomeVeryLongEncoderName${PAD}`,
    `SomeVeryLongTypeName${PAD}[]`,
    `SomeVeryLongTypeName${PAD}[][]`,
    `SomeHolderTypeName${PAD}['kindPropertyName']`,
    `SomeNamespace.SomeVeryLongTypeName${PAD}`,
    `JSX.ElementSomethingVeryLongIndeed${PAD}`,
    `keyof SomeVeryLongTypeName${PAD}`,
    `readonly SomeVeryLongTypeName${PAD}[]`,
    `'someVeryLongStringLiteralValue${PAD}'`,
    `\`prefix-\${string}-suffix-${PAD}\``,
    `import('some/really/long/module/path/${PAD}').SomeType`,
    `Array<SomeVeryLongTypeName${PAD}>`,
    `Promise<SomeVeryLongTypeName${PAD}>`,
    `SomeType<SomeVeryLongArgumentName${PAD}>[]`,
    `Map<SomeVeryLongKeyTypeName${PAD}, SomeValueTypeName>`,
    `Array<Array<SomeVeryLongTypeName${PAD}>>`,
    `Array<{ alpha: SomeLongTypeName${PAD} }>`,
    `import('m').Type<SomeVeryLongArg${PAD}, Second>`,
    `(inputParameter: SomeLongTypeName${PAD}) => ResultTypeName`,
    `((inputParameter: SomeLongTypeName${PAD}) => ResultTypeName)`,
    `(() => SomeVeryLongResultTypeName${PAD})`,
    `new (inputParameter: SomeLongTypeName${PAD}) => ResultTypeName`,
    `{ alphaProperty: SomeLongTypeName${PAD}; beta: number }`,
    `{ [key: string]: SomeVeryLongValueTypeName${PAD} }`,
    `{ readonly [K in SomeVeryLongKeyName${PAD}]: string }`,
    `[SomeLongTypeName${PAD}, AnotherTypeName]`,
    `SomeLongTypeName${PAD} & AnotherTypeName`,
    `SomeVeryLongTypeName${PAD} | Another`,
    `SomeVeryLongTypeName${PAD} extends X ? A : B`,
  ];

  it('agrees with Prettier on every measured spelling', () => {
    const disagreements = SPELLINGS.filter(
      (spelling) => reflowsWhenOverWide(spelling) !== prettierReflows(spelling),
    );
    expect(disagreements).toEqual([]);
  });

  it('is not vacuous: both answers occur, and every spelling overflows', () => {
    const reflowed = SPELLINGS.filter((spelling) => prettierReflows(spelling));
    expect(reflowed.length).toBeGreaterThanOrEqual(11);
    expect(SPELLINGS.length - reflowed.length).toBeGreaterThanOrEqual(11);
    // 4 columns of indentation inside a broken type-argument list.
    for (const spelling of SPELLINGS) {
      expect(spelling.length + 4).toBeGreaterThan(80);
    }
  });
});

/**
 * The emitted key type is only correct if its quoting agrees with Prettier, so
 * the agreement is asserted against the repo's own Prettier rather than
 * described. `checker.typeToString` always prints a string-literal type
 * double-quoted, and a codebase formatted with `singleQuote` rejects that text
 * at any width (#2059).
 *
 * A template literal TYPE is the case this block exists to reach: a quote
 * inside backticks is content rather than a delimiter, and no rule fixture can
 * exercise it, because a template-literal discriminant is classified as "other"
 * and never reaches the fixer at all.
 */
describe('prefer-map-over-conditional-dispatch quote normalizer', () => {
  const PRETTIER_OPTIONS: prettier.Options = {
    parser: 'typescript',
    printWidth: 80,
    tabWidth: 2,
    singleQuote: true,
    semi: true,
    trailingComma: 'all',
  };

  const prettierQuoting = (typeText: string, singleQuote: boolean): string =>
    prettier
      .format(`type T = ${typeText};\n`, { ...PRETTIER_OPTIONS, singleQuote })
      .replace(/^type T = /, '')
      .replace(/;\n$/, '');

  const SPELLINGS = [
    '"a" | "b"',
    '"it\'s" | "b"',
    '"say \\"hi\\"" | "b"',
    '"mix \' and \\" here" | "b"',
    '"two \'\' vs one \\"" | "b"',
    '"a\\tb"',
    '"back\\\\slash"',
    '"caf\\u00e9"',
    "Holder['kind']",
    'Holder["kind"]',
    "`it's-${string}`",
    '`a-${"x" | "y"}`',
    'import("some/module/path").Thing',
    "import('some/module/path').Thing",
    'Record<"x", number> | Record<"y", number>',
    '{ readonly t: "x" }',
    '(a: "x") => "y"',
    '1 | 2',
    'Kind',
  ];

  it('agrees with Prettier on every measured spelling, both settings', () => {
    const disagreements = SPELLINGS.flatMap((spelling) =>
      [true, false]
        .map((singleQuote) => ({
          spelling,
          singleQuote,
          mine: normalizeTypeQuotes(spelling, singleQuote),
          prettier: prettierQuoting(spelling, singleQuote),
        }))
        .filter((row) => row.mine !== row.prettier),
    );
    expect(disagreements).toEqual([]);
  });

  it('is not vacuous: it rewrites some spellings and leaves others alone', () => {
    const rewritten = SPELLINGS.filter(
      (spelling) => normalizeTypeQuotes(spelling, true) !== spelling,
    );
    expect(rewritten.length).toBeGreaterThanOrEqual(10);
    expect(SPELLINGS.length - rewritten.length).toBeGreaterThanOrEqual(4);
    // A quote inside a template literal type is content, not a delimiter, and
    // survives both settings untouched — the shape a regex would corrupt.
    expect(normalizeTypeQuotes("`it's-${string}`", true)).toBe(
      "`it's-${string}`",
    );
    expect(normalizeTypeQuotes("`it's-${string}`", false)).toBe(
      "`it's-${string}`",
    );
    // Text the parser cannot resolve into a type comes back byte-identical
    // rather than half-rewritten; the annotation gate is the only place that
    // decides whether such text may ship at all.
    expect(normalizeTypeQuotes('not a "type', true)).toBe('not a "type');
  });
});
