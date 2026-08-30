import path from 'path';
import { Linter } from 'eslint';
import * as ts from 'typescript';
import {
  FixtureBucket,
  defaultFilenameFor,
  defineCorpusParsers,
  harvestFixtureCorpus,
  parserKeyFor,
  parserOptionsFor,
  ruleNameByIdentity,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules, recommended config), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
  configs: { recommended: { rules: Record<string, unknown> } };
};

const PREFIX = '@blumintinc/blumint/';

/**
 * A rule's `--fix` output must not carry a type diagnostic its input lacked —
 * over the WHOLE harvested fixture corpus, not just that rule's own fixtures.
 *
 * `fixer-type-safety.test.ts` asserts the first half of that sentence and stops
 * at the comma: it pairs each rule's fixer with THAT RULE'S OWN fixtures, so a
 * fixer is only ever type-checked against inputs its author already had in
 * mind. Nothing in the build ever handed rule A's fixer a fixture written for
 * rule B — and a rule's own suite is by construction the shapes its author
 * anticipated, which is precisely where a type-safety defect is NOT.
 *
 * The blind spot is measured, not theoretical. Three real bugs lived in it:
 * #2013 (`global-const-style`), #2014 (`no-explicit-return-type`) and #2015
 * (`enforce-object-literal-as-const`), 75 pairs between them, and EVERY one of
 * those pairs had `owner != fixer`. `fixer-type-safety` was green through all
 * three.
 *
 * The pairing is therefore driven by what actually REPORTS on a fixture rather
 * than by who owns it: every fixture is screened once under the recommended
 * config, and each rule that reports gets its fixer run alone on that fixture.
 * A cross pair is the product, and the count of cross pairs asserted is the
 * headline non-vacuity number below — without it this guard silently
 * degenerates into a second copy of `fixer-type-safety`.
 */

/**
 * The stub/compile/diff machinery from here to `introducedDiagnostics` is
 * copied VERBATIM from `fixer-type-safety.test.ts` — read that file's own doc
 * comments for why each piece is load-bearing (which modules earn a shape and
 * why, why the wildcard stays, why the diff is a multiset differential rather
 * than an absolute count). This guard changes only which (fixer, fixture) pairs
 * are built and which introduced diagnostics survive the mode discount.
 */
const REACT_STUB = `
declare module 'react' {
  export type ReactNode = any;
  export type ReactElement = any;
  export type ElementType = any;
  export type ComponentType<P = any> = any;
  export type Key = string | number;
  export type CSSProperties = any;
  export type DependencyList = readonly any[];
  export type EffectCallback = () => void | (() => void);
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export type Ref<T> = any;
  export type ForwardedRef<T> = any;
  export type PropsWithChildren<P = {}> = P & { children?: ReactNode };
  export type PropsWithoutRef<P> = P;
  export type RefAttributes<T> = { ref?: Ref<T>; key?: Key };
  export type ComponentProps<T> = any;
  export type HTMLAttributes<T = any> = any;
  export type SyntheticEvent<T = any> = { preventDefault(): void; stopPropagation(): void; target: any; currentTarget: T };
  export type FormEvent<T = any> = SyntheticEvent<T>;
  export type ChangeEvent<T = any> = SyntheticEvent<T> & { target: any };
  export type MouseEvent<T = any> = SyntheticEvent<T>;
  export type KeyboardEvent<T = any> = SyntheticEvent<T> & { key: string };
  export interface MutableRefObject<T> { current: T }
  export interface RefObject<T> { readonly current: T | null }
  export interface Context<T> { Provider: any; Consumer: any }
  export interface FunctionComponent<P = {}> { (props: P, context?: any): any; displayName?: string }
  export type FC<P = {}> = FunctionComponent<P>;
  export type VFC<P = {}> = FunctionComponent<P>;
  export type NamedExoticComponent<P = {}> = FunctionComponent<P>;

  export function useCallback<T extends Function>(callback: T, deps: DependencyList): T;
  export function useMemo<T>(factory: () => T, deps: DependencyList | undefined): T;
  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(effect: EffectCallback, deps?: DependencyList): void;
  export function useLayoutEffect(effect: EffectCallback, deps?: DependencyList): void;
  export function useRef<T>(initialValue: T): MutableRefObject<T>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
  export function useContext<T>(context: Context<T>): T;
  export function useReducer(reducer: any, initialState?: any, init?: any): [any, Dispatch<any>];
  export function useImperativeHandle(ref: any, init: () => any, deps?: DependencyList): void;
  export function useDebugValue(value: any, format?: any): void;
  export function useId(): string;
  export function useTransition(): [boolean, (cb: () => void) => void];
  export function useDeferredValue<T>(value: T): T;
  export function useSyncExternalStore<T>(subscribe: any, getSnapshot: () => T, getServerSnapshot?: () => T): T;

  // Identity, not React's MemoExoticComponent<T>: the exotic wrapper only adds
  // properties, and an approximation that stayed callable-and-constructable in
  // JSX under this file's minimal global JSX namespace is worth more here than
  // a faithful one that would fire TS2786 across every .tsx pair.
  export function memo<T>(component: T, propsAreEqual?: (prev: any, next: any) => boolean): T;
  export function forwardRef<T, P = {}>(render: (props: P, ref: ForwardedRef<T>) => any): FunctionComponent<P>;
  export function createElement(type: any, props?: any, ...children: any[]): any;
  export function cloneElement(element: any, props?: any, ...children: any[]): any;
  export function isValidElement(value: any): boolean;
  export function createContext<T>(defaultValue: T): Context<T>;
  export function lazy<T>(factory: () => Promise<{ default: T }>): T;
  export function startTransition(cb: () => void): void;
  export const Fragment: FunctionComponent<{ children?: ReactNode; key?: Key }>;
  export const Suspense: FunctionComponent<{ children?: ReactNode; fallback?: ReactNode }>;
  export const StrictMode: FunctionComponent<{ children?: ReactNode }>;
  export const Children: any;
  export const version: string;
  export class Component<P = any, S = any> {
    constructor(props?: P, context?: any);
    props: Readonly<P>;
    state: Readonly<S>;
    setState(state: any, callback?: () => void): void;
    forceUpdate(callback?: () => void): void;
    render(): any;
  }
  export class PureComponent<P = any, S = any> extends Component<P, S> {}
}
`;

/**
 * Copied from the shipped typings, not paraphrased:
 * `@google-cloud/firestore/types/firestore.d.ts` (what `firebase-admin/
 * firestore` re-exports) and `@firebase/firestore/dist/index.d.ts`. The two
 * `Timestamp` surfaces genuinely differ — the client SDK declares `toString`,
 * `toJSON` and `fromJSON`, the admin SDK does not — so they are written out
 * twice rather than aliased.
 *
 * `valueOf(): string` is deliberate and is not a typo for `number`: both SDKs
 * return an encoded *string* so `Timestamp`s compare with `<`/`>`, where
 * `Date#valueOf()` returns a number. That divergence is the reason
 * enforce-timestamp-now excludes `valueOf` from its compatible-member allowlist.
 *
 * Everything that is not a substitution target — `doc`, `setDoc`, `updateDoc`,
 * the query builders — is declared loosely on purpose. Reproducing their real
 * overloads would risk a wrong signature for no detection.
 */
const TIMESTAMP_ADMIN = `
  export class Timestamp {
    static now(): Timestamp;
    static fromDate(date: Date): Timestamp;
    static fromMillis(milliseconds: number): Timestamp;
    constructor(seconds: number, nanoseconds: number);
    readonly seconds: number;
    readonly nanoseconds: number;
    toDate(): Date;
    toMillis(): number;
    isEqual(other: Timestamp): boolean;
    valueOf(): string;
  }
`;

const FIRESTORE_COMMON = `
  export type DocumentData = { [field: string]: any };
  export type UpdateData<T = any> = any;
  export type WithFieldValue<T> = any;
  export type PartialWithFieldValue<T> = any;
  export type SetOptions = { merge?: boolean; mergeFields?: any[] };
  export type SnapshotOptions = any;
  export class DocumentReference<AppModelType = DocumentData, DbModelType = DocumentData> {
    readonly id: string;
    readonly path: string;
    readonly parent: CollectionReference<AppModelType, DbModelType>;
  }
  export class CollectionReference<AppModelType = DocumentData, DbModelType = DocumentData> {
    readonly id: string;
    readonly path: string;
  }
  export class Query<AppModelType = DocumentData, DbModelType = DocumentData> {}
  export class DocumentSnapshot<AppModelType = DocumentData, DbModelType = DocumentData> {
    readonly id: string;
    readonly exists: any;
    data(): AppModelType | undefined;
  }
  export class QuerySnapshot<AppModelType = DocumentData, DbModelType = DocumentData> {
    readonly docs: DocumentSnapshot<AppModelType, DbModelType>[];
    readonly empty: boolean;
    readonly size: number;
  }
  export class Firestore {}
  export class WriteBatch {}
  export class Transaction {}
  export class FieldPath { constructor(...segments: string[]); isEqual(other: FieldPath): boolean }
  export class GeoPoint { constructor(latitude: number, longitude: number) }
`;

const FIRESTORE_ADMIN_STUB = `
declare module 'firebase-admin/firestore' {
${TIMESTAMP_ADMIN}
${FIRESTORE_COMMON}
  export class FieldValue {
    static serverTimestamp(): FieldValue;
    static delete(): FieldValue;
    static increment(n: number): FieldValue;
    static arrayUnion(...elements: any[]): FieldValue;
    static arrayRemove(...elements: any[]): FieldValue;
    isEqual(other: FieldValue): boolean;
  }
  export function getFirestore(...args: any[]): Firestore;
  export const FieldPathClass: any;
}
`;

const FIRESTORE_CLIENT_STUB = `
declare module 'firebase/firestore' {
  export class Timestamp {
    static now(): Timestamp;
    static fromDate(date: Date): Timestamp;
    static fromMillis(milliseconds: number): Timestamp;
    static fromJSON(json: object): Timestamp;
    constructor(seconds: number, nanoseconds: number);
    readonly seconds: number;
    readonly nanoseconds: number;
    toDate(): Date;
    toMillis(): number;
    isEqual(other: Timestamp): boolean;
    toString(): string;
    toJSON(): { seconds: number; nanoseconds: number; type: string };
    valueOf(): string;
  }
${FIRESTORE_COMMON}
  export abstract class FieldValue { isEqual(other: FieldValue): boolean }
  export function getFirestore(...args: any[]): Firestore;
  export function doc(...args: any[]): DocumentReference<any, any>;
  export function collection(...args: any[]): CollectionReference<any, any>;
  export function getDoc(...args: any[]): Promise<DocumentSnapshot<any, any>>;
  export function getDocs(...args: any[]): Promise<QuerySnapshot<any, any>>;
  export function setDoc(...args: any[]): Promise<void>;
  export function updateDoc(...args: any[]): Promise<void>;
  export function addDoc(...args: any[]): Promise<DocumentReference<any, any>>;
  export function deleteDoc(...args: any[]): Promise<void>;
  export function onSnapshot(...args: any[]): () => void;
  export function query(...args: any[]): Query<any, any>;
  export function where(...args: any[]): any;
  export function orderBy(...args: any[]): any;
  export function limit(n: number): any;
  export function writeBatch(...args: any[]): WriteBatch;
  export function runTransaction<T>(db: any, updateFunction: (tx: Transaction) => Promise<T>): Promise<T>;
  export function serverTimestamp(): FieldValue;
  export function deleteField(): FieldValue;
  export function increment(n: number): FieldValue;
  export function arrayUnion(...elements: any[]): FieldValue;
  export function arrayRemove(...elements: any[]): FieldValue;
}
`;

/**
 * The substitution partners of the React hooks above, so that a fix swapping
 * one callable for another has to agree with the replacement's real arity and
 * return type: `use-latest-callback` drops the dependency array,
 * `prefer-use-deep-compare-memo` keeps it, and `fast-deep-equal-over-microdiff`
 * replaces an array-returning `diff` with a boolean-returning `isEqual`.
 *
 * Both `export =` forms are copied verbatim from the installed packages
 * (`use-latest-callback/lib/src/index.d.ts`, `fast-deep-equal/index.d.ts`) and
 * are not interchangeable with a `default` export: `export =` has no named
 * exports at all, so a named import of `useLatestCallback` is TS2614. Four
 * `no-empty-dependency-use-callbacks` fixtures import it that way and are held
 * out for it — a fixture inaccuracy, not a rule defect, since the fixers
 * themselves emit the default form.
 *
 * The scoped fork is what `fast-deep-equal-over-microdiff` actually emits, and
 * its typings are a different shape from upstream's — `export default` over a
 * type predicate, copied verbatim from `@blumintinc/fast-deep-equal@4.0.0`.
 * Without it the emitted import falls to the wildcard and every fixed snippet
 * of that rule type-checks as `any`, which is the blind spot #1529 closed for
 * the others.
 *
 * `microdiff` is deliberately left to the wildcard. Its real typings export
 * `diff` as the *default* only, while `enforce-microdiff`'s fixer emits
 * `import { diff } from 'microdiff'`; stubbing it faithfully would turn that
 * into a standing failure of a rule this guard is not the place to fix, and
 * stubbing it with an invented named export would be a lie in the harness.
 */
const SUBSTITUTION_PARTNER_STUBS = `
declare module 'use-latest-callback' {
  function useLatestCallback<T extends Function>(callback: T): T;
  export = useLatestCallback;
}
declare module 'fast-deep-equal' {
  const equal: (a: any, b: any) => boolean;
  export = equal;
}
declare module '@blumintinc/fast-deep-equal' {
  function equal<T>(actual: any, expected: T): actual is T;
  export default equal;
}
declare module '@blumintinc/fast-deep-equal/react' {
  function equal<T>(actual: any, expected: T): actual is T;
  export default equal;
}
declare module '@blumintinc/use-deep-compare' {
  export function useDeepCompareMemo<T>(factory: () => T, dependencies: readonly any[]): T;
  export function useDeepCompareCallback<T extends Function>(callback: T, dependencies: readonly any[]): T;
  export function useDeepCompareEffect(effect: () => void | (() => void), dependencies: readonly any[]): void;
  export function useDeepCompareLayoutEffect(effect: () => void | (() => void), dependencies: readonly any[]): void;
  export function useDeepCompareImperativeHandle(ref: any, init: () => any, dependencies: readonly any[]): void;
}
`;

const STUBS = `
declare module '*';
${REACT_STUB}
${FIRESTORE_ADMIN_STUB}
${FIRESTORE_CLIENT_STUB}
${SUBSTITUTION_PARTNER_STUBS}
declare namespace JSX {
  interface IntrinsicElements { [k: string]: any }
  interface Element {}
  interface ElementAttributesProperty { props: {} }
  interface ElementChildrenAttribute { children: {} }
}
declare const require: any;
declare const process: any;
declare const module: any;
`;
const VIRTUAL_DIR = '/virtual-cross-fixer-corpus';

/**
 * The corpus is compiled under BOTH strictness settings, because each one is
 * blind to a class the other sees and neither is "the" consumer's config.
 *
 * `strict: false` was the only mode until #1985, and it switches off
 * `strictNullChecks` — so every TS18048/TS2532/null-assignability diagnostic
 * was unobservable here. `no-entire-object-hook-deps` was hoisting a
 * guard-protected dereference into a dependency array, where it is evaluated
 * unconditionally and throws `TypeError`; the type-level shadow of that defect
 * is a TS18048 this guard could not see, and it stayed green through it.
 * `tsconfig.json` sets `strict: true` + `strictNullChecks: true`, so the loose
 * mode was not even modelling this repo, let alone agora.
 *
 * Running strict ALONE would have been a regression of its own: 36 pairs across
 * 6 rules have inputs that type-check only under the loose mode, and
 * `baselineCompiles` would have held every one of them out. Both modes run, a
 * pair is asserted where its own input compiles, and the findings are unioned —
 * so neither mode's coverage is paid for with the other's.
 *
 * `noImplicitAny: false` is deliberately kept in both: `tsconfig.json` sets
 * exactly that, so it is a match rather than a divergence.
 */
const MODES = [
  { key: 'default', strict: false },
  { key: 'strict', strict: true },
] as const;

type ModeKey = typeof MODES[number]['key'];

/**
 * Compiling every snippet separately would build one program per pair and cost
 * a lib load each time. The corpus is flat and every file is its own module, so
 * one program per side is equivalent and ~500x cheaper.
 */
const compileCorpus = (
  files: Array<{ name: string; text: string }>,
  strict: boolean,
) => {
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict,
    noImplicitAny: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    skipLibCheck: true,
    types: [],
    jsx: ts.JsxEmit.Preserve,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    experimentalDecorators: true,
  };

  // In-memory: the corpus is transient and a test must not litter the disk.
  const sources = new Map<string, string>();
  sources.set(`${VIRTUAL_DIR}/stubs.d.ts`, STUBS);
  for (const file of files) {
    sources.set(`${VIRTUAL_DIR}/${file.name}`, `${file.text}\nexport {};\n`);
  }

  const host = ts.createCompilerHost(options, true);
  const getSourceFileFromDisk = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = sources.get(fileName);
    if (text === undefined) {
      return getSourceFileFromDisk(
        fileName,
        languageVersion,
        onError,
        shouldCreate,
      );
    }
    return ts.createSourceFile(
      fileName,
      text,
      languageVersion,
      true,
      fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
  };
  const fileExistsOnDisk = host.fileExists.bind(host);
  host.fileExists = (fileName) =>
    sources.has(fileName) || fileExistsOnDisk(fileName);
  const readFileFromDisk = host.readFile.bind(host);
  host.readFile = (fileName) =>
    sources.has(fileName) ? sources.get(fileName) : readFileFromDisk(fileName);

  const program = ts.createProgram([...sources.keys()], options, host);
  const byFile = new Map<string, string[]>();
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ];
    byFile.set(
      path.basename(sourceFile.fileName),
      // Keyed without position: a fix shifts lines, and a shifted duplicate of
      // an existing diagnostic is not a new defect.
      diagnostics.map(
        (d) =>
          `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
      ),
    );
  }
  return byFile;
};

const multisetDiff = (before: string[], after: string[]) => {
  const counts = new Map<string, number>();
  for (const d of before) counts.set(d, (counts.get(d) || 0) + 1);
  const added: string[] = [];
  for (const d of after) {
    const remaining = counts.get(d) || 0;
    if (remaining > 0) counts.set(d, remaining - 1);
    else added.push(d);
  }
  return added;
};

/**
 * Every "cannot find name" variant, so the artifact filter below keys on the
 * missing identifier rather than on one exact message.
 */
const UNRESOLVED_NAME = /^TS(?:2304|2552|2662|2663):[^']*'([^']+)'/;

const missingNameOf = (diagnostic: string) => {
  const match = UNRESOLVED_NAME.exec(diagnostic);
  return match ? match[1] : null;
};

/**
 * The one artifact class. A fix that merely mentions an already-unresolvable
 * name one more time adds a duplicate TS2304 to the multiset without breaking
 * anything:
 *
 *   before: for (; !config;)                                    1x TS2304
 *   after:  for (; (!config || Object.keys(config).length === 0);)  2x TS2304
 *
 * A TS2304 naming an identifier that was resolvable — or absent — before the
 * fix is not filtered: that is exactly the #1521 defect, where the fix emitted
 * `Timestamp.now()` into a file with no `Timestamp` binding.
 *
 * The filter costs real detection, and the cost is worth stating: #1524's shape
 * — a fix that rebuilds `new Person(...)` once per destructured property, in a
 * fixture where `Person` is undefined — is a duplicate reference to an
 * already-unresolvable name and is therefore indistinguishable from the
 * artifact here. Reverting that fix does not fail this guard. An absolute
 * diagnostic count would catch it and would also fire on every snippet in the
 * corpus, since test snippets are fragments, so the differential is the only
 * usable framing.
 */
const introducedDiagnostics = (before: string[], after: string[]) => {
  const alreadyMissing = new Set<string>();
  for (const d of before) {
    const name = missingNameOf(d);
    if (name) alreadyMissing.add(name);
  }
  return multisetDiff(before, after).filter((d) => {
    const name = missingNameOf(d);
    return !(name && alreadyMissing.has(name));
  });
};

type DiagnosticsFn = (before: string[], after: string[]) => string[];

/**
 * The multiset every list shares.
 *
 * This is the mode discount, and it is the one place this guard's oracle
 * deliberately differs from `fixer-type-safety`'s. That guard UNIONS the
 * diagnostics introduced under each mode whose input compiles; here a
 * diagnostic counts only if EVERY mode that could judge the pair saw it.
 *
 * Measured, both directions, before it was adopted:
 *
 *   - it preserves all 77 pairs of the three real bugs this guard exists for
 *     (#2013, #2014, #2015), per signature 14/14, 2/2, 58/58, 2/2 and 1/1; and
 *   - it discounts exactly the known artifact class - the two
 *     `prefer-spread-over-reassembly` TS2698 pairs whose input is
 *     `let units = []`, an evolving `never[]` under `strictNullChecks` only.
 *     Annotating the declaration `let units: Unit[] = []` makes the diagnostic
 *     vanish on the AFTER side, which is what proves it an artifact of the
 *     degraded input rather than of the fix. `fixer-type-safety` already
 *     baselines the same two as #1986 with the same explanation.
 *
 * The other discount on offer - "drop a pair whose input carries a TS2304" - is
 * DISQUALIFIED and must not be reintroduced: measured, it hides all 60
 * `global-const-style` rows, the largest of the three bugs above. The corpus is
 * fragments, so nearly every input carries an unresolved name.
 *
 * The intersection only bites where both modes could judge. A pair whose input
 * compiles under one mode only has a single-element intersection, so for it
 * this is identical to the union.
 */
const multisetIntersect = (lists: string[][]): string[] => {
  if (!lists.length) return [];
  let common = [...lists[0]];
  for (const list of lists.slice(1)) {
    const counts = new Map<string, number>();
    for (const diagnostic of list) {
      counts.set(diagnostic, (counts.get(diagnostic) || 0) + 1);
    }
    common = common.filter((diagnostic) => {
      const remaining = counts.get(diagnostic) || 0;
      if (remaining <= 0) return false;
      counts.set(diagnostic, remaining - 1);
      return true;
    });
  }
  return common;
};

/**
 * `ts.createProgram` SILENTLY drops a root file whose name it does not
 * recognize as TypeScript: `corpus.ts-7` is filtered out with no diagnostic at
 * all, not merely renamed, so `compileCorpus` returns an EMPTY list for it -
 * indistinguishable from "compiles clean". A derived name must therefore keep
 * its `.ts`/`.tsx` as the actual suffix rather than have one appended after it.
 */
const withSuffix = (name: string, suffix: string): string => {
  const match = /\.(tsx?)$/.exec(name);
  if (!match) return `${name}${suffix}.ts`;
  return `${name.slice(0, match.index)}${suffix}.${match[1]}`;
};

/**
 * A snippet that declares into the SHARED scope - `declare global`, or an
 * ambient/augmenting `declare module 'x'` - retypes every other file in the
 * corpus, because one program compiles them all. Dropped and counted, never
 * silently discarded; verbatim from `fixer-type-safety.test.ts`, which has the
 * `JSX.Element` branding example that makes the damage concrete.
 */
const DECLARES_INTO_SHARED_SCOPE = /\bdeclare\s+(?:global\b|module\s+['"])/;

const linter = new Linter();
defineCorpusParsers(linter);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`${PREFIX}${name}`, rule as never);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Planted defects, driven through the exact pipeline the corpus goes through:
 * the same `verifyAndFix`, the same two programs, the same diff, the same
 * discount. A green sweep over the real rules means nothing unless known-broken
 * transforms still come out red here.
 *
 * Registered on the linter under a `control/` id, which is neither the plugin
 * PREFIX nor in the recommended config, so no corpus fixture can reach one and
 * no control can inflate a corpus counter.
 *
 * `expectModesFlagged` is what pins the discount's POLARITY, and it is the
 * reason this array is not merely a copy of `fixer-type-safety`'s:
 *
 *   - `control-strict-only-break` introduces its diagnostic under `strict`
 *     ALONE while its input compiles under both, so the union oracle flags it
 *     and the intersection must not. Widen the discount back to a union and
 *     this control fails, instead of the corpus quietly regaining two artifact
 *     findings.
 *   - `control-both-modes-break` is its mirror: a fix broken under both modes
 *     must survive, so the discount cannot be "satisfied" by rejecting
 *     everything.
 */
const CONTROLS: Array<{
  name: string;
  code: string;
  /** Under the intersection oracle this guard ships. */
  expectFlagged: boolean;
  /** Which baseline-clean modes see an introduced diagnostic at all. */
  expectModesFlagged: ModeKey[];
  rule: Record<string, any>;
}> = [
  {
    name: 'control-type-break',
    // Retypes a string to a number: parses fine, fails tsc (TS2322).
    code: 'export const v: string = "hello";\n',
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          Literal(node: any) {
            if (node.value !== 'hello') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, '42'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-syntax-break',
    // Sits in the same programs as the real corpus, so it keeps proving that
    // one unparseable file does not zero out everybody else's diagnostics.
    code: 'export const fn = (a: number) => { return a + 1; };\n',
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          ReturnStatement(node: any) {
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, 'return a +;'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-unbound-reference',
    // The #1521 shape, in a file that ALREADY has an unresolved name: the fix
    // emits `Timestamp.now()` with no `Timestamp` in scope. Must survive the
    // artifact filter inside `introducedDiagnostics`.
    code: 'const missing = ghost;\nexport const at = new Date();\n',
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          NewExpression(node: any) {
            if (node.callee.name !== 'Date') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, 'Timestamp.now()'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-duplicate-reference',
    // The artifact `introducedDiagnostics` exists to absorb: one more mention
    // of a name that was already unresolvable. Must NOT be flagged.
    code: 'export const flag = !ghost;\n',
    expectFlagged: false,
    expectModesFlagged: [],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          UnaryExpression(node: any) {
            if (node.operator !== '!') return;
            if (node.argument.name !== 'ghost') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) =>
                f.replaceText(
                  node,
                  '(!ghost || Object.keys(ghost).length === 0)',
                ),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-strict-only-break',
    /**
     * The discount's polarity. Dropping the null narrowing is a diagnostic
     * under `strictNullChecks` and nothing at all without it, while the input
     * compiles under both - so this is the exact shape the mode intersection
     * exists to discount, and the exact shape a union oracle would report.
     */
    code: 'export const len = (s: string | null) => (s === null ? 0 : s.length);\n',
    expectFlagged: false,
    expectModesFlagged: ['strict'],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          ConditionalExpression(node: any) {
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, 's.length'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-both-modes-break',
    // The other half of the polarity: broken under both modes, so the
    // intersection keeps it. Without this, a discount that rejected every
    // finding would still satisfy every other control here.
    code: 'export const total = (n: number): number => n;\n',
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          ArrowFunctionExpression(node: any) {
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node.body, "'text'"),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-stub-beats-wildcard-firestore',
    /**
     * The stubs above are a verbatim copy, and a copy rots. Both of these are
     * silent when the imported binding is `any` - which is all `declare module
     * '*'` gives - so each is flagged if and only if the specific `declare
     * module` really does win over the wildcard. Deleting or mistyping a stub
     * therefore fails a control instead of quietly widening the blind spot.
     */
    code:
      "import { Timestamp } from 'firebase-admin/firestore';\n" +
      'export const at = Timestamp.now().toMillis();\n',
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          MemberExpression(node: any) {
            if (node.property.name !== 'toMillis') return;
            context.report({
              node: node.property,
              messageId: 'm',
              // A `Date` member `Timestamp` lacks: the #1528 shape exactly.
              fix: (f: any) =>
                f.replaceText(node.property, 'toLocaleDateString'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-stub-beats-wildcard-react',
    // `useCallback` returns the callback where `useMemo` returns what it
    // produced, so this swap is a type error under React's real signatures and
    // invisible under the wildcard's `any`.
    code:
      "import { useCallback, useMemo } from 'react';\n" +
      'export const useTotal = (): number => useMemo(() => 1, []);\n',
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          CallExpression(node: any) {
            if (node.callee.name !== 'useMemo') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node.callee, 'useCallback'),
            });
          },
        };
      },
    },
  },
];

for (const control of CONTROLS) {
  linter.defineRule(`control/${control.name}`, control.rule as never);
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * EMPTY, and kept as the place an exclusion must be written.
 *
 * Its one entry was `no-entire-object-hook-deps`, discounted because with no
 * program every dependency reads as `unknown`-typed, so the rule reports and
 * deletes deps a consumer's CI would leave alone (#1621). That rationale is
 * about which dependencies get REPORTED. What this guard asks is what the fixer
 * then WRITES, which is range arithmetic and entirely syntactic — so the
 * exclusion was broader than its own reason, and no oracle had ever been
 * pointed at the hole it left. Three defects came out of it once one was:
 * #2208, a removal span anchored on a neighbouring element that swallowed the
 * comment between them; #2209 and #2210, a removal that stranded its binding.
 *
 * Dropping the name is MEASURED, not asserted: with the rule composed here the
 * suite is green, and it is driven non-vacuously rather than merely admitted.
 * The #1621 divergence itself is untouched and still real; it simply never
 * showed up as the thing this guard asks about.
 *
 * An entry here is one NAME rather than all 16 rules mentioning
 * `getParserServices` — discounting one measured divergence never justified
 * unprobing fifteen others (#1879) — and never belongs in
 * `silentWithoutProgramRuleNames`, which means "reports nothing here", nor at
 * rule-global scope, which un-gates every other arm at once (#1839).
 */
const DIVERGENT_WITHOUT_PROGRAM = new Set([]);

/**
 * The screening config: the shipped recommended set. Screening with it, rather
 * than enumerating every fixable rule against every fixture, is what makes the
 * corpus-wide pairing affordable - 190 rules against ~20k fixtures is millions
 * of fix passes, while "which rules report here" is one lint per fixture and a
 * handful of fixes.
 */
const RECOMMENDED: Record<string, unknown> = {};
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  if (severity === 'off' || severity === 0) continue;
  const name = id.slice(PREFIX.length);
  if (silentWithoutProgramRuleNames.has(name)) continue;
  if (DIVERGENT_WITHOUT_PROGRAM.has(name)) continue;
  RECOMMENDED[id] = severity;
}

/**
 * Fixtures carry bare `eslint-disable-next-line rule-name` comments, because
 * `RuleTester` registers the rule under its bare name. Under a `Linter` the
 * rules are registered PREFIXED, so an unprefixed directive silences nothing -
 * and a fixture written to suppress a rule would instead be fixed by it.
 *
 * Longest name first, so a shorter rule name that prefixes a longer one cannot
 * rewrite half of it.
 */
const BARE_RULE_NAMES = [...ruleNameByIdentity.values()].sort(
  (a, b) => b.length - a.length,
);
const DIRECTIVE =
  /(eslint-disable(?:-next-line|-line)?|eslint-enable)([^\n*]*)/g;
const prefixDirectives = (code: string) =>
  code.replace(DIRECTIVE, (_whole, keyword: string, tail: string) => {
    let rewritten = tail;
    for (const name of BARE_RULE_NAMES) {
      rewritten = rewritten.replace(
        new RegExp(`(^|[\\s,])${name}(?![\\w/-])`, 'g'),
        `$1${PREFIX}${name}`,
      );
    }
    return `${keyword}${rewritten}`;
  });

const isFixable = (name: string) =>
  Boolean(plugin.rules[name] && plugin.rules[name].meta?.fixable);

type Pair = {
  /** The rule whose fixer produced `after`. */
  fixer: string;
  /** Every rule that owns a fixture this exact rewrite came out of. */
  owners: Set<string>;
  before: string;
  after: string;
  isTsx: boolean;
  /** One witness's declaring suite and probed path, to reproduce by hand. */
  origin: string;
  bucket: FixtureBucket | 'control';
  filename: string;
  /** The synthetic program filename of each side; assigned once per TEXT. */
  beforeName: string;
  afterName: string;
};

/**
 * The pair this guard exists for: a rewrite reached through a fixture its
 * fixer's author never wrote. Classified on the whole owner SET, since one
 * rewrite can be reached from several rules' suites and collapsing it onto the
 * first witness would understate the reach.
 */
const isCross = (pair: Pair) =>
  [...pair.owners].some((owner) => owner !== pair.fixer);

const corpus = harvestFixtureCorpus();

/**
 * Every skip is counted and every counter is read by an `expect` below. A skip
 * counter nothing asserts discards cases in silence, which is exactly how 106
 * fatal parses went unnoticed in #1984.
 */
const stats = {
  fixturesConsidered: 0,
  nonTypeScriptDropped: 0,
  sharedScopeDropped: 0,
  inputFatalDropped: 0,
  threw: 0,
  soloFixAttempts: 0,
  rewrites: 0,
  crossRewrites: 0,
};

const pairsByKey = new Map<string, Pair>();
const pairingStarted = Date.now();

for (const [owner, cases] of corpus.byRule) {
  for (const testCase of cases) {
    /**
     * `tsc` has nothing to say about a `package.json` body or a `.md` file, so
     * a pair built from one could only manufacture noise.
     */
    if (testCase.language !== 'ts') {
      stats.nonTypeScriptDropped++;
      continue;
    }
    if (DECLARES_INTO_SHARED_SCOPE.test(testCase.code)) {
      stats.sharedScopeDropped++;
      continue;
    }
    stats.fixturesConsidered++;

    const filename = defaultFilenameFor(testCase);
    const isTsx = filename.endsWith('.tsx');
    const source = prefixDirectives(testCase.code);
    const parsing = {
      parser: parserKeyFor(testCase),
      parserOptions: parserOptionsFor(testCase),
    };

    try {
      const ownerId = `${PREFIX}${owner}`;
      /**
       * The owner's own entry carries the OPTIONS its author declared. Without
       * them an option-gated fixer is unreachable, and an option-gated report
       * arrives under a configuration nobody wrote.
       */
      const screened = linter.verify(
        source,
        {
          ...parsing,
          rules: {
            ...RECOMMENDED,
            ...(RECOMMENDED[ownerId] || DIVERGENT_WITHOUT_PROGRAM.has(owner)
              ? {}
              : { [ownerId]: severityWithOptions(testCase) }),
          },
        } as unknown as Linter.Config,
        filename,
      );
      /**
       * A fatal parse produces no `ruleId`, so it is indistinguishable from
       * every rule staying silent - counted, then asserted, never dropped.
       */
      if (screened.some((message) => message.fatal)) {
        stats.inputFatalDropped++;
        continue;
      }

      const reporting = new Set(
        screened
          .map((message) => message.ruleId)
          .filter((id): id is string => id !== null && id.startsWith(PREFIX)),
      );

      for (const id of reporting) {
        const name = id.slice(PREFIX.length);
        if (DIVERGENT_WITHOUT_PROGRAM.has(name)) continue;
        if (!isFixable(name)) continue;
        stats.soloFixAttempts++;
        /**
         * SOLO, not composed: the claim under test is about ONE rule's fixer,
         * so a diagnostic has to be attributable to it. What two fixers do in
         * combination is a different question with a different oracle.
         */
        const fixed = linter.verifyAndFix(
          source,
          {
            ...parsing,
            rules: {
              [id]: name === owner ? severityWithOptions(testCase) : 'error',
            },
          } as unknown as Linter.Config,
          filename,
        );
        if (
          !fixed ||
          typeof fixed.output !== 'string' ||
          fixed.output === source
        ) {
          continue;
        }
        stats.rewrites++;
        if (name !== owner) stats.crossRewrites++;

        const key = JSON.stringify([isTsx, name, source, fixed.output]);
        const known = pairsByKey.get(key);
        if (known) {
          known.owners.add(owner);
          continue;
        }
        pairsByKey.set(key, {
          fixer: name,
          owners: new Set([owner]),
          before: source,
          after: fixed.output,
          isTsx,
          origin: testCase.origin,
          bucket: testCase.bucket,
          filename,
          beforeName: '',
          afterName: '',
        });
      }
    } catch {
      stats.threw++;
    }
  }
}

const pairingSeconds = (Date.now() - pairingStarted) / 1000;

const controlPairs: Pair[] = [];
for (const control of CONTROLS) {
  const id = `control/${control.name}`;
  let output = control.code;
  try {
    const fixed = linter.verifyAndFix(
      control.code,
      {
        parser: 'ts',
        parserOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
        rules: { [id]: 'error' },
      } as unknown as Linter.Config,
      'control.ts',
    );
    if (fixed && typeof fixed.output === 'string') output = fixed.output;
  } catch {
    // A control whose transform never fires stays an identity pair and fails
    // its own `fired` assertion below rather than passing vacuously.
  }
  controlPairs.push({
    fixer: control.name,
    owners: new Set([control.name]),
    before: control.code,
    after: output,
    isTsx: false,
    origin: 'planted control',
    bucket: 'control',
    filename: 'control.ts',
    beforeName: '',
    afterName: '',
  });
}

const corpusPairs = [...pairsByKey.values()];
const allPairs = [...corpusPairs, ...controlPairs];

/**
 * One program entry per distinct TEXT, not per pair side.
 *
 * The two sides of ~12k pairs are ~25k texts but only ~20k distinct ones - a
 * fixture reached by two fixers contributes the same `before` twice, and an
 * `output`-bucket case is frequently some other pair's `after` - so keying the
 * programs by pair side re-compiles a fifth of the corpus for nothing.
 */
const nameByText = new Map<string, string>();
const files: Array<{ name: string; text: string }> = [];
const nameForText = (text: string, isTsx: boolean) => {
  const key = `${isTsx ? 'tsx' : 'ts'} ${text}`;
  const known = nameByText.get(key);
  if (known) return known;
  const name = withSuffix(
    isTsx ? 'corpus.tsx' : 'corpus.ts',
    `-${files.length}`,
  );
  nameByText.set(key, name);
  files.push({ name, text });
  return name;
};
for (const pair of allPairs) {
  pair.beforeName = nameForText(pair.before, pair.isTsx);
  pair.afterName = nameForText(pair.after, pair.isTsx);
}

/**
 * Chunked so one program never holds the whole corpus. Every file is its own
 * module and the shared-scope declarers are excluded above, so a file's
 * diagnostics do not depend on which chunk it lands in.
 */
const TEXT_CHUNK = 2500;
const compileStarted = Date.now();
const diagnosticsByMode = new Map<ModeKey, Map<string, string[]>>();
for (const mode of MODES) {
  const accumulated = new Map<string, string[]>();
  for (let index = 0; index < files.length; index += TEXT_CHUNK) {
    const compiled = compileCorpus(
      files.slice(index, index + TEXT_CHUNK),
      mode.strict,
    );
    for (const [name, diagnostics] of compiled) {
      accumulated.set(name, diagnostics);
    }
  }
  diagnosticsByMode.set(mode.key, accumulated);
}
const compileSeconds = (Date.now() - compileStarted) / 1000;

const diagnosticsOf = (mode: ModeKey, name: string) =>
  diagnosticsByMode.get(mode)?.get(name) || [];

/**
 * The claim is that a fix does not turn COMPILING code into non-compiling code,
 * so a snippet that does not compile is no baseline: against a broken input the
 * differential reports re-wordings rather than defects. Unresolved names are
 * the deliberate exception - the corpus is fragments, excluding those would
 * leave almost nothing, and the artifact filter inside `introducedDiagnostics`
 * already handles them in the diff.
 */
const baselineCompilesIn = (pair: Pair, mode: ModeKey) =>
  diagnosticsOf(mode, pair.beforeName).every(
    (diagnostic) => missingNameOf(diagnostic) !== null,
  );

const cleanModesFor = (pair: Pair) =>
  MODES.filter((mode) => baselineCompilesIn(pair, mode.key));

const introducedPerMode = (pair: Pair, diagnosticsFn: DiagnosticsFn) =>
  cleanModesFor(pair).map((mode) => ({
    mode: mode.key,
    added: diagnosticsFn(
      diagnosticsOf(mode.key, pair.beforeName),
      diagnosticsOf(mode.key, pair.afterName),
    ),
  }));

/** The shipped oracle: introduced in EVERY mode whose input could judge it. */
const introducedWith = (pair: Pair, diagnosticsFn: DiagnosticsFn) =>
  multisetIntersect(
    introducedPerMode(pair, diagnosticsFn).map((entry) => entry.added),
  );

const introducedFor = (pair: Pair) =>
  introducedWith(pair, introducedDiagnostics);

/** The rejected oracle, computed only so a control can pin the difference. */
const introducedUnionFor = (pair: Pair) => [
  ...new Set(
    introducedPerMode(pair, introducedDiagnostics).flatMap(
      (entry) => entry.added,
    ),
  ),
];

const modesFlaggingFor = (pair: Pair) =>
  introducedPerMode(pair, introducedDiagnostics)
    .filter((entry) => entry.added.length)
    .map((entry) => entry.mode);

const assertedPairs = corpusPairs.filter(
  (pair) => cleanModesFor(pair).length > 0,
);
const assertedCrossPairs = assertedPairs.filter(isCross);
const assertedFixers = [
  ...new Set(assertedPairs.map((pair) => pair.fixer)),
].sort();

type Finding = { pair: Pair; added: string[] };

const findingsWith = (diagnosticsFn: DiagnosticsFn): Finding[] =>
  assertedPairs
    .map((pair) => ({ pair, added: introducedWith(pair, diagnosticsFn) }))
    .filter((finding) => finding.added.length > 0);

const findings = findingsWith(introducedDiagnostics);

/**
 * The mutation control. Every assertion below is a differential, so a harness
 * whose diff had degenerated would report zero and read exactly like a healthy
 * one. Blinding the oracle must take the findings to zero, and nothing else in
 * the pipeline may be able to produce one.
 */
const mutantFindings = findingsWith(() => []);

/** `<fixer> <the TS codes it introduced>`, one key per defect shape. */
const findingKey = (finding: Finding) =>
  `${finding.pair.fixer} ${[
    ...new Set(
      finding.added.map((diagnostic) =>
        diagnostic.slice(0, diagnostic.indexOf(':')),
      ),
    ),
  ]
    .sort()
    .join('+')}`;

/**
 * Cross-fixture type-unsafe fixes the corpus reaches, keyed `<fixer> <TS code>`
 * with the number of pairs that reproduce each shape.
 *
 * AN ENTRY IS NOT A WAY TO MAKE A BUILD GREEN. It records a defect tracked
 * elsewhere, and the count is part of the key's meaning: a second pair reaching
 * the same shape is a new instance and fails here, exactly as an unlisted shape
 * does. A listed shape that STOPS reproducing fails too, so an entry cannot rot
 * into a shield for the next regression.
 *
 * Prefer fixing over listing. Each entry here is listed rather than fixed for
 * one reason only: a fix belongs in its own branch, since one rule per commit
 * is a hard repo invariant and each already carries an issue.
 */
const TYPE_UNSAFE_BASELINE: Record<string, { pairs: number; note: string }> =
  {};

const baselinedCounts = new Map<string, number>();
for (const finding of findings) {
  const key = findingKey(finding);
  if (!(key in TYPE_UNSAFE_BASELINE)) continue;
  baselinedCounts.set(key, (baselinedCounts.get(key) || 0) + 1);
}

const unbaselinedByFixer = new Map<string, Finding[]>();
for (const fixer of assertedFixers) unbaselinedByFixer.set(fixer, []);
for (const finding of findings) {
  if (findingKey(finding) in TYPE_UNSAFE_BASELINE) continue;
  unbaselinedByFixer.get(finding.pair.fixer)?.push(finding);
}

const controlOutcomes = controlPairs.map((pair) => ({
  name: pair.fixer,
  fired: pair.after !== pair.before,
  cleanModes: cleanModesFor(pair).map((mode) => mode.key),
  flagged: introducedFor(pair).length > 0,
  unionFlagged: introducedUnionFor(pair).length > 0,
  modesFlagged: modesFlaggingFor(pair),
}));

const report = (finding: Finding) =>
  [
    `introduced: ${finding.added.join(' | ')}`,
    `fixer: ${finding.pair.fixer}`,
    `reached from fixture(s) owned by: ${[...finding.pair.owners].join(', ')}`,
    `src/tests/${finding.pair.origin} (${finding.pair.bucket}) as ${finding.pair.filename}`,
    '--- input (compiles) ---',
    finding.pair.before,
    '--- after --fix (does not) ---',
    finding.pair.after,
  ].join('\n');

/**
 * Floors sit JUST UNDER what this harness measures, so ordinary corpus churn
 * does not move them while a harness that lost most of the corpus does. The
 * floors that hid #1984 sat at 5,500 against an actual 8,141; measure first,
 * then floor.
 *
 * The measurement each is cut from is recorded beside it, so a future change
 * can tell "the corpus grew" from "the harness started dropping work" without
 * re-deriving the whole run. Re-measure from the console block below after any
 * change to the pairing, and move a floor only WITH its measurement.
 */
const CORPUS_FILES_FLOOR = 270; // measured 274
const CORPUS_CASES_FLOOR = 19500; // measured 20267
const FIXTURES_CONSIDERED_FLOOR = 19500; // measured 20197
const SOLO_ATTEMPT_FLOOR = 33000; // measured 35259
const REWRITE_FLOOR = 12000; // measured 12517
const ASSERTED_FLOOR = 11000; // measured 11349
const CROSS_GENERATED_FLOOR = 8600; // measured 8950
const CROSS_FLOOR = 8000; // measured 8190
const CROSS_FIXER_FLOOR = 52; // measured 58
const FIXER_FLOOR = 78; // measured 81
/**
 * Ceilings, not floors: each is a case this guard does NOT judge, so a harness
 * regression shows up as a jump rather than a dip.
 *
 * These are cut CLOSE deliberately. A ceiling far above its measurement is the
 * #1984 failure verbatim: 106 fixtures became a fatal parse there and nothing
 * noticed, so a fatal-parse ceiling of 200 against a measured 0 would readmit
 * that exact defect while still reading as an assertion.
 */
// measured 95 — the CommonMark fence fixtures added to
// `enforce-typescript-markdown-code-blocks` for #2213, including its CRLF and
// code-span cases, took the non-TS population from 40 to 95. These cases are
// judged instead by `lang-fix-closure`, the core-equivalent oracle for their
// languages.
const NON_TS_CEILING = 130;
const SHARED_SCOPE_CEILING = 50; // measured 30
const INPUT_FATAL_CEILING = 10; // measured 0

console.log(
  [
    "cross-fixture fixer type safety: each rule's --fix over EVERY rule's fixtures",
    `  corpus: ${corpus.totalCases} cases across ${corpus.byRule.size} rules from ${corpus.filesLoaded} suite files`,
    `  fixtures: ${stats.fixturesConsidered} considered, ${stats.nonTypeScriptDropped} non-TypeScript, ${stats.sharedScopeDropped} shared-scope declarers, ${stats.inputFatalDropped} fatal parses, ${stats.threw} threw`,
    `  fixes: ${stats.soloFixAttempts} solo attempts, ${stats.rewrites} rewrote (${stats.crossRewrites} of them cross-rule)`,
    `  pairs: ${corpusPairs.length} unique, ${
      corpusPairs.filter(isCross).length
    } cross-rule, from ${
      new Set(corpusPairs.map((pair) => pair.fixer)).size
    } distinct fixers`,
    `  asserted (input compiles): ${assertedPairs.length} pairs, ${assertedCrossPairs.length} cross-rule, ${assertedFixers.length} fixers`,
    ...MODES.map((mode) => {
      const clean = corpusPairs.filter((pair) =>
        baselineCompilesIn(pair, mode.key),
      ).length;
      return `    mode ${mode.key} (strict: ${mode.strict}): ${clean} of ${corpusPairs.length} pairs have a compiling input`;
    }),
    `  programs: ${files.length} distinct texts, ${MODES.length} modes, chunked at ${TEXT_CHUNK}`,
    `  findings: ${findings.length} (${
      findings.filter((finding) => isCross(finding.pair)).length
    } cross-rule); the rejected union oracle would report ${
      assertedPairs.filter((pair) => introducedUnionFor(pair).length).length
    }`,
    `  timing: pairing ${pairingSeconds.toFixed(
      1,
    )}s, programs ${compileSeconds.toFixed(1)}s`,
  ].join('\n'),
);

describe("a rule's --fix must not introduce a type error on ANY rule's fixture", () => {
  /**
   * Non-vacuity first. Planted defects go through the same fix loop, the same
   * two programs and the same discount as every corpus pair, so a harness that
   * had quietly broken cannot report a clean sweep.
   */
  it.each(CONTROLS.map((control) => [control.name] as const))(
    'control %s behaves as planted',
    (name) => {
      const control = CONTROLS.find((entry) => entry.name === name)!;
      const outcome = controlOutcomes.find((entry) => entry.name === name)!;
      expect(outcome.fired).toBe(true);
      // Held out by the baseline gate, a control proves nothing about the
      // gate's other side.
      expect(outcome.cleanModes).toEqual(MODES.map((mode) => mode.key));
      expect(outcome.modesFlagged).toEqual(control.expectModesFlagged);
      expect(outcome.flagged).toBe(control.expectFlagged);
    },
  );

  /**
   * The mode discount's polarity, stated as a difference rather than as two
   * unrelated outcomes: the union oracle and the shipped one must DISAGREE on
   * the strict-only control and AGREE on the both-modes one. Widening the
   * discount back to a union, or narrowing it until it rejects everything,
   * breaks exactly one of these.
   */
  it('discounts a strict-only diagnostic and keeps a both-mode one', () => {
    const strictOnly = controlOutcomes.find(
      (outcome) => outcome.name === 'control-strict-only-break',
    )!;
    expect([strictOnly.unionFlagged, strictOnly.flagged]).toEqual([
      true,
      false,
    ]);
    const bothModes = controlOutcomes.find(
      (outcome) => outcome.name === 'control-both-modes-break',
    )!;
    expect([bothModes.unionFlagged, bothModes.flagged]).toEqual([true, true]);
  });

  /**
   * The whole point of this guard. `fixer-type-safety` pairs a fixer only with
   * its own suite's fixtures; if the cross-rule count here ever collapses, this
   * file has silently become a second copy of that one - green, and asserting
   * nothing new.
   */
  it('pairs fixers with OTHER rules fixtures, at scale', () => {
    expect(assertedCrossPairs.length).toBeGreaterThanOrEqual(CROSS_FLOOR);
    expect(corpusPairs.filter(isCross).length).toBeGreaterThanOrEqual(
      CROSS_GENERATED_FLOOR,
    );
    // A single prolific fixer must not be able to hold the floor up alone.
    expect(
      new Set(assertedCrossPairs.map((pair) => pair.fixer)).size,
    ).toBeGreaterThanOrEqual(CROSS_FIXER_FLOOR);
    expect(assertedFixers.length).toBeGreaterThanOrEqual(FIXER_FLOOR);
  });

  /**
   * Corpus reach. Every one of these would read as a healthy zero if the
   * harvest, the screen or the fix loop broke, so each is floored rather than
   * assumed - and every skip counter is read here, because a skip nothing
   * asserts is a silent discard (#1984).
   */
  it('accounts for every fixture it did not pair', () => {
    expect(corpus.failures).toEqual([]);
    expect(corpus.filesLoaded).toBeGreaterThanOrEqual(CORPUS_FILES_FLOOR);
    expect(corpus.totalCases).toBeGreaterThanOrEqual(CORPUS_CASES_FLOOR);
    expect(stats.fixturesConsidered).toBeGreaterThanOrEqual(
      FIXTURES_CONSIDERED_FLOOR,
    );
    expect(stats.soloFixAttempts).toBeGreaterThanOrEqual(SOLO_ATTEMPT_FLOOR);
    expect(stats.rewrites).toBeGreaterThanOrEqual(REWRITE_FLOOR);
    expect(assertedPairs.length).toBeGreaterThanOrEqual(ASSERTED_FLOOR);
    // Skips are bounded from ABOVE: each is a case this guard does not judge,
    // so a harness regression shows up as a jump, not as a dip.
    expect(stats.nonTypeScriptDropped).toBeLessThanOrEqual(NON_TS_CEILING);
    expect(stats.sharedScopeDropped).toBeLessThanOrEqual(SHARED_SCOPE_CEILING);
    expect(stats.inputFatalDropped).toBeLessThanOrEqual(INPUT_FATAL_CEILING);
    expect(stats.threw).toBe(0);
  });

  /**
   * The oracle is the differential and nothing else. Blinded, the corpus must
   * produce no finding at all - otherwise some other part of the pipeline is
   * manufacturing them and the assertions below measure that instead.
   */
  it('produces findings only through the diagnostic differential', () => {
    expect(mutantFindings).toEqual([]);
  });

  /**
   * A baselined defect must stay exactly as large as recorded, and one that
   * stops reproducing must be deleted. Either half left unenforced lets the
   * entry absorb the next regression silently.
   */
  it('reproduces every baselined cross-fixture unsafe fix, and no more', () => {
    expect(Object.fromEntries(baselinedCounts)).toEqual(
      Object.fromEntries(
        Object.entries(TYPE_UNSAFE_BASELINE).map(([key, { pairs }]) => [
          key,
          pairs,
        ]),
      ),
    );
  });

  it.each(assertedFixers)('%s', (fixer) => {
    const problems = unbaselinedByFixer.get(fixer) || [];
    expect(problems.map((finding) => report(finding)).join('\n\n')).toBe('');
  });
});
