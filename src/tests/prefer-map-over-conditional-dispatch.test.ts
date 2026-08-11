import { parse } from '@typescript-eslint/parser';
import { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import { preferMapOverConditionalDispatch } from '../rules/prefer-map-over-conditional-dispatch';

type RuleMessageIds = 'preferMap' | 'preferMapManual';
type RuleTests = TSESLint.RunTests<RuleMessageIds, []>;

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
  const RESULT_BY_MODE: Record<Mode, ((input: string) => string) | ((input: number) => string)> = {
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
  const RESULT_BY_TARGET: Record<Target, ((param: ParamMod) => void) | ((segment: SegMod) => void)> = {
    queryParam: replaceParam,
    segment: replaceSegment,
  };
  const replace = RESULT_BY_TARGET[target];
  return replace;
}
`,
      errors: [{ messageId: 'preferMap' }],
    },
    // Mixed union — only the function-type member gains parentheses.
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
  const RESULT_BY_CHOICE: Record<Choice, ((value: number) => string) | string> = {
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
  const RESULT_BY_STANDARD: Record<"native" | "erc20" | "offchain", any> = {
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
  const RESULT_BY_STANDARD: Record<TokenStandard, typeof NativeTokenEncoder | typeof Erc20TokenEncoder | typeof OffchainTokenEncoder> = {
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
  const label =
    RESULT_BY_SIDE[side];
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
    // The issue spells the assertion as `const unhandled: never = body;`. That
    // declarator sits inside the span the fix deletes, which reads to
    // multi-declarator-closure's ARM B as a destroyed sibling (#1930) even
    // though the binding it removes is scoped to the deleted block. The cast
    // spelling asserts the same `never` exhaustiveness without a statement-level
    // declarator, so the shape is pinned here without bumping that baseline.
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
      throw new Error(String(body as never));
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
  const RESULT_BY_KIND: Record<"a" | "b", number> = {
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
  const RESULT_BY_KIND: Record<"a" | "b", number> = {
    a: 1,
    b: 2,
  };
  return RESULT_BY_KIND[o.kind];
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
