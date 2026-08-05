import path from 'path';
import { Linter } from 'eslint';
import * as ts from 'typescript';
import {
  FALLBACK_FILENAMES,
  FixtureCase,
  defaultFilenameFor,
  harvestFixtureCorpus,
  parserOptionsFor,
  severityWithOptions,
  typeAwareRuleNames,
} from '../utils/fixtureCorpus';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';

/**
 * An autofix must not turn compiling code into non-compiling code.
 *
 * Every other fixer guard reads ESLint-level signals only — reports, scope
 * bindings, re-parse — so a fix that emits parseable-but-type-broken code is
 * invisible to all of them, and to `RuleTester`, which never type-checks. One
 * pass of this check found four defects at once: #1521 (a `Timestamp.now()`
 * fix emitted with no `Timestamp` in scope), #1522 (a prop rename applied to
 * one side of the contract only), #1523 (a synthesized `= {}` default on a
 * nested object pattern) and #1524 (a destructure that dropped the receiver of
 * a method).
 *
 * The assertion is a differential, never an absolute diagnostic count: the
 * corpus is made of test snippets, which are fragments full of identifiers no
 * program defines. What must hold is that the fixed text carries no diagnostic
 * the input did not already carry.
 *
 * A SUGGESTION emits code into the same file under the same compiler, so it can
 * break the build in exactly the same way; `meta.fixable` alone made every
 * suggestion-only rule invisible here (#1601). The one difference is how the
 * text under test is produced: `--fix` never applies a suggestion, so each is
 * applied ALONE to the untouched snippet rather than run through
 * `verifyAndFix`. Composing two suggestions from one report would compile a
 * file no consumer can produce.
 *
 * The corpus is the suite's OWN `RuleTester` cases, captured by
 * `harvestFixtureCorpus` with their `options`, `filename` and `parserOptions`
 * attached. Text-parsing the test files for string literals — what this guard
 * did until #1732 — reported `310 case(s) unharvestable (interpolated)` in its
 * own accounting: a suite that assembles every case from a shared prelude
 * (`no-usememo-for-pass-by-value`) yielded ONE snippet where it declares 105
 * cases, and the snippets that did survive arrived stripped of the options
 * their fixer is gated on.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Two things about this harness are load-bearing, and both were learned the
 * hard way while the axis was first swept:
 *
 * 1. The compiler API, not the `tsc` CLI. `tsc` short-circuits: if ANY file in
 *    the program fails to parse it reports zero semantic diagnostics for EVERY
 *    file. Over a flat corpus of hundreds of fix outputs, one parse-breaking
 *    fix would mask every type error in the run and the guard would report a
 *    clean sweep. `getSyntacticDiagnostics(file)` / `getSemanticDiagnostics(
 *    file)` are per-file and have no such short-circuit — the syntax-breaking
 *    control below sits in the same program as everything else precisely to
 *    keep proving that.
 *
 * 2. `declare module '*'` types every import as `any`, so a fix that adds an
 *    import cannot manufacture a TS2307 the input lacked, and `export {}` is
 *    appended to every file so script-scope declarations cannot collide across
 *    the flat corpus. Both transforms apply identically to the before and after
 *    corpora, so they cancel in the diff. `export {}` does not contain a
 *    `declare global`, though, which is why snippets carrying one are dropped
 *    from the corpus outright (see `DECLARES_INTO_SHARED_SCOPE`).
 */

/**
 * The wildcard alone was a blind spot (#1529). It types every imported binding
 * `any`, so the entire class of "the fix substitutes a value of a *different
 * type*" was invisible: under it,
 *
 *   import { Timestamp } from 'firebase-admin/firestore';
 *   Timestamp.now().toLocaleDateString();
 *
 * produced zero diagnostics, which is why this guard could not catch #1528.
 *
 * An exact `declare module 'x' { ... }` beats the `'*'` *pattern* ambient
 * module, so a stub can be sharpened without giving up the wildcard's job of
 * keeping an added import from manufacturing a TS2307. Precedence is a property
 * of specificity, not of declaration order — verified by compiling the same
 * cases with the wildcard first, last, in an earlier file and in a later file,
 * which give byte-identical diagnostics.
 *
 * There is no fallback *within* a stubbed module: TypeScript has no index
 * signature for module exports, and `export * from` an `any` module re-exports
 * nothing, so a member the stub omits is TS2305 (or TS2339 through the default
 * import). That failure is symmetric — it hits the before and after corpora
 * alike — so an over-narrow stub costs *coverage*, never a false finding, and
 * shows up in the "held out for an input that does not type-check" line below.
 *
 * Which modules earn a shape, therefore, is not "the popular ones": a module is
 * stubbed when some fixer **substitutes a value across it** and a wrong
 * substitution would be a type error — React's hooks (`useMemo` -> `useCallback`,
 * `useCallback` -> `useLatestCallback`/`useDeepCompareMemo`, unwrapping a
 * `useMemo`), `Timestamp` (#1528), `diff` <-> `isEqual`. Everything else —
 * `@mui/icons-material/*`, `next/*`, the memoize decorators, every relative
 * path — keeps the wildcard's `any`, because a stub there would add the risk of
 * a wrong member signature without buying any detection.
 *
 * Shapes are copied from the shipped typings, never invented; getting a return
 * type wrong manufactures fake findings. Where realism would only add noise
 * (`ReactNode`, `ComponentType`) the alias is `any`, which is exactly what the
 * wildcard already gave and so can regress nothing.
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

const VIRTUAL_DIR = '/virtual-fixer-corpus';

/**
 * Compiling every snippet separately would build one program per pair and cost
 * a lib load each time. The corpus is flat and every file is its own module, so
 * one program per side is equivalent and ~500x cheaper.
 */
const compileCorpus = (files: Array<{ name: string; text: string }>) => {
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: false,
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

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

/**
 * The case's own options reach the fix pass. An option-gated fixer is
 * unreachable on defaults — #1461's autofix only exists once `headerTemplate`
 * is set — so a corpus that dropped them could not reach it at all, and a
 * corpus that applied them to only one side would manufacture findings.
 */
const configFor = (ruleId: string, testCase: FixtureCase): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: parserOptionsFor(testCase),
    rules: { [ruleId]: severityWithOptions(testCase) },
  } as Linter.Config);

/**
 * `verifyAndFix`, not a single fix application: what a developer runs is the
 * fix loop, and that is the text that has to compile.
 */
const fixWith = (
  ruleId: string,
  testCase: FixtureCase,
  filenames: string[],
) => {
  for (const filename of filenames) {
    let result;
    try {
      result = linter.verifyAndFix(testCase.code, configFor(ruleId, testCase), {
        filename,
      });
    } catch {
      continue;
    }
    if (result && result.output && result.output !== testCase.code) {
      return { output: result.output, filename };
    }
  }
  return null;
};

const applyEdit = (
  text: string,
  fix: { range: readonly number[]; text: string },
) => text.slice(0, fix.range[0]) + fix.text + text.slice(fix.range[1]);

/**
 * One output per emitted suggestion, each applied alone to `snippet`.
 *
 * Deliberately NOT `verifyAndFix`: that loop never sees a suggestion, and
 * stacking two of them — or re-running the rule on a suggestion's output —
 * would compile a state no editor can produce, so a diagnostic found there
 * would be unactionable.
 */
const suggestWith = (
  ruleId: string,
  testCase: FixtureCase,
  filenames: string[],
) => {
  for (const filename of filenames) {
    let messages;
    try {
      messages = linter.verify(testCase.code, configFor(ruleId, testCase), {
        filename,
      });
    } catch {
      continue;
    }
    if (messages.some((message) => message.fatal)) continue;
    const outputs: string[] = [];
    for (const message of messages) {
      if (message.ruleId !== ruleId) continue;
      for (const suggestion of message.suggestions || []) {
        if (!suggestion.fix) continue;
        const output = applyEdit(testCase.code, suggestion.fix);
        if (output !== testCase.code) outputs.push(output);
      }
    }
    if (outputs.length) return { outputs, filename };
  }
  return null;
};

type Pair = {
  rule: string;
  name: string;
  before: string;
  after: string;
  /** Declaring suite and probed path, so a finding is reproducible by hand. */
  origin: string;
  filename: string;
};

/**
 * Planted defects, run through the exact pipeline the guard uses. A zero on the
 * real rules only means something if the same corpus, the same programs and the
 * same diff flag code that is known-broken.
 *
 * `expectFlagged: false` is as important as the true cases — it pins the
 * artifact filter's polarity so a future widening cannot quietly swallow the
 * #1521 defect shape along with the duplicate-reference noise.
 */
const CONTROLS: Array<{
  name: string;
  code: string;
  expectFlagged: boolean;
  /** Which transform channel the control's text comes out of. */
  kind?: 'fix' | 'suggestion';
  rule: Record<string, any>;
}> = [
  {
    name: 'control-type-break',
    // Retypes a string to a number: parses fine, fails tsc (TS2322).
    code: 'export const v: string = "hello";\n',
    expectFlagged: true,
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
    // Sits in the same program as the real corpus to keep proving that one
    // unparseable file does not zero out everybody else's diagnostics.
    code: 'export const fn = (a: number) => { return a + 1; };\n',
    expectFlagged: true,
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
    // artifact filter.
    code: 'const missing = ghost;\nexport const at = new Date();\n',
    expectFlagged: true,
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
    // The artifact: one more mention of a name that was already unresolvable.
    // Must NOT be flagged.
    code: 'export const flag = !ghost;\n',
    expectFlagged: false,
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
    name: 'control-stub-beats-wildcard-firestore',
    /**
     * Pins the #1529 repair itself. Both of these are silent when the imported
     * binding is `any`, which is what `declare module '*'` alone gave and why
     * this guard could not see #1528 — so each is flagged if and only if the
     * specific `declare module` really does win over the wildcard. Deleting or
     * mistyping a stub therefore fails a control instead of quietly restoring
     * the blind spot.
     */
    code:
      "import { Timestamp } from 'firebase-admin/firestore';\n" +
      'export const at = Timestamp.now().toMillis();\n',
    expectFlagged: true,
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
  {
    name: 'control-suggestion-type-break',
    /**
     * The suggestion channel needs its own planted defect: `verifyAndFix`
     * returns this snippet untouched, so a harness that only knows about fixes
     * builds an empty suggestion corpus and every per-rule assertion below
     * degrades to a vacuous pass.
     */
    code: 'export const label: string = "hello";\n',
    expectFlagged: true,
    kind: 'suggestion',
    rule: {
      meta: {
        type: 'suggestion',
        hasSuggestions: true,
        schema: [],
        messages: { m: 'x', s: 'retype it' },
      },
      create(context: any) {
        return {
          Literal(node: any) {
            if (node.value !== 'hello') return;
            context.report({
              node,
              messageId: 'm',
              suggest: [
                { messageId: 's', fix: (f: any) => f.replaceText(node, '42') },
              ],
            });
          },
        };
      },
    },
  },
  {
    name: 'control-suggestion-type-safe',
    // Pins the polarity: a well-typed suggestion must NOT be flagged, or the
    // suggestion assertions below would fire on everything and mean nothing.
    code: 'export const label: string = "hello";\n',
    expectFlagged: false,
    kind: 'suggestion',
    rule: {
      meta: {
        type: 'suggestion',
        hasSuggestions: true,
        schema: [],
        messages: { m: 'x', s: 'reword it' },
      },
      create(context: any) {
        return {
          Literal(node: any) {
            if (node.value !== 'hello') return;
            context.report({
              node,
              messageId: 'm',
              suggest: [
                {
                  messageId: 's',
                  fix: (f: any) => f.replaceText(node, '"goodbye"'),
                },
              ],
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

/**
 * The cap counts *fix pairs*, not harvested cases, and every case a rule offers
 * is scanned until that many pairs exist.
 *
 * Capping the harvest instead silently excluded rules (#1527). Cases come out
 * in test-file order, `valid` cases first, and a rule with more than the cap's
 * worth of them spent its whole budget before reaching a single trigger — so it
 * contributed nothing and was listed as a rule with no fixable trigger,
 * indistinguishable from one that genuinely has none. `enforce-object-literal-
 * as-const` was the proof: 122 snippets, the first 30 all `valid`, and its
 * TS4104 defect (#1526) sat outside the window the guard could ever see.
 *
 * At 30 the cap was still dropping a tail — its own accounting printed `1,999 of
 * 8,069 harvested snippets unscanned` across 37 rules (#1732). What paid for
 * lifting it is probing each case under the filename it was WRITTEN for instead
 * of re-probing every one under seven invented paths: measured over the same
 * corpus, the fan-out yields 8,433 fix pairs across 81 rules where the authentic
 * filename yields 2,652 across the same 81, so the fan-out was spending 3.2x the
 * budget to compile near-duplicates of pairs it already had. The largest rule
 * contributes 117 pairs, so this bound is slack today and exists only to keep a
 * future fixture explosion from turning two TypeScript programs into an
 * unbounded cost — and if it ever binds, exactly what it dropped is printed
 * below and asserted, never silently discarded.
 */
const MAX_PAIRS_PER_RULE = 150;

/**
 * A snippet that declares into the *shared* scope — `declare global`, or an
 * ambient/augmenting `declare module 'x'` — retypes every other file in the
 * corpus, because one program compiles them all. `export {}` makes each file a
 * module and so contains ordinary declarations; it cannot contain these.
 *
 * The damage is not hypothetical: one `prefer-map-over-conditional-dispatch`
 * fixture declares `namespace JSX { interface Element { readonly _brand: unique
 * symbol } }` globally, which brands `JSX.Element` for the whole corpus and
 * makes every component whose return type is concrete a TS2786 — in whichever
 * of the two corpora happens to have the concrete type. Such snippets are
 * dropped, and counted below.
 */
const DECLARES_INTO_SHARED_SCOPE = /\bdeclare\s+(?:global\b|module\s+['"])/;

const fixableRules = Object.entries(plugin.rules)
  .filter(([, rule]) => rule && rule.meta && rule.meta.fixable)
  .map(([name]) => name)
  .sort();

const suggestionRules = Object.entries(plugin.rules)
  .filter(([, rule]) => rule && rule.meta && rule.meta.hasSuggestions)
  .map(([name]) => name)
  .sort();

const corpus = harvestFixtureCorpus();

/** The `declare`-free subset of a rule's fixtures, plus what that cost. */
const casesFor = (rule: string) => {
  const all = corpus.byRule.get(rule) || [];
  const usable = all.filter(
    (testCase) => !DECLARES_INTO_SHARED_SCOPE.test(testCase.code),
  );
  return { total: all.length, usable, dropped: all.length - usable.length };
};

/**
 * Reasons a rule contributes no asserted pair, each established by the run
 * itself. Which one holds is information: a rule that never reports on its own
 * fixtures is a different (and more surprising) fact than one that reports and
 * declines to fix, and both differ from one whose every fixture is already
 * ill-typed before anything touches it.
 */
const REASONS = {
  noFixtures: 'declares no fixture this TypeScript harness can lint',
  sharedScope: 'every one of its fixtures declares into the shared scope',
  typeAware:
    'is type-aware, and a bare Linter has no program, so its fixer is unreachable here',
  neverReports: 'never reports on any of its own fixtures',
  reportsWithoutFix: 'reports on its own fixtures but never offers a fix',
  fixDiscarded: 'offers a fix that the fix loop then discards',
  illTypedInput: 'every one of its pairs starts from an input that fails tsc',
} as const;

type Reason = typeof REASONS[keyof typeof REASONS];

const filenamesFor = (testCase: FixtureCase) => [defaultFilenameFor(testCase)];

/**
 * Second-chance filenames, for a case whose author declared none. Running this
 * for every case is what the fan-out did; running it only where the rule is
 * otherwise unreached keeps the reason honest without paying for the rest.
 */
const fallbackFilenamesFor = (testCase: FixtureCase) =>
  testCase.filename ? [] : FALLBACK_FILENAMES;

const noFixReasonFor = (rule: string, cases: FixtureCase[]): Reason => {
  const ruleId = PREFIX + rule;
  let reported = false;
  let offeredFix = false;
  for (const testCase of cases) {
    for (const filename of [
      ...filenamesFor(testCase),
      ...fallbackFilenamesFor(testCase),
    ]) {
      let messages;
      try {
        messages = linter.verify(testCase.code, configFor(ruleId, testCase), {
          filename,
        });
      } catch {
        continue;
      }
      for (const message of messages) {
        // A parse failure surfaces as a message with no rule attached.
        if (message.ruleId !== ruleId) continue;
        reported = true;
        if (message.fix) offeredFix = true;
      }
    }
  }
  if (offeredFix) return REASONS.fixDiscarded;
  if (typeAwareRuleNames.has(rule)) return REASONS.typeAware;
  if (reported) return REASONS.reportsWithoutFix;
  return REASONS.neverReports;
};

const coverage = {
  noFixtures: [] as string[],
  neverFixed: [] as string[],
  illTypedInput: [] as string[],
  covered: [] as string[],
  cappedTail: [] as string[],
};
const explanation = new Map<string, Reason>();
const detail = new Map<string, string>();

const pairs: Pair[] = [];
let harvested = 0;
let capped = 0;
let sharedScopeDropped = 0;

for (const rule of fixableRules) {
  const { total, usable, dropped } = casesFor(rule);
  sharedScopeDropped += dropped;
  if (!usable.length) {
    coverage.noFixtures.push(rule);
    explanation.set(
      rule,
      total === 0 ? REASONS.noFixtures : REASONS.sharedScope,
    );
    detail.set(
      rule,
      `${total} case(s) harvested, ${dropped} declaring into the shared scope`,
    );
    continue;
  }
  harvested += usable.length;

  let fixed = 0;
  let skipped = 0;
  const collect = (testCase: FixtureCase, filenames: string[]) => {
    if (!filenames.length) return;
    if (fixed >= MAX_PAIRS_PER_RULE) {
      skipped++;
      return;
    }
    const result = fixWith(PREFIX + rule, testCase, filenames);
    if (!result) return;
    pairs.push({
      rule,
      name: `${rule}__${fixed}.${
        result.filename.endsWith('.tsx') ? 'tsx' : 'ts'
      }`,
      before: testCase.code,
      after: result.output,
      origin: testCase.origin,
      filename: result.filename,
    });
    fixed++;
  };

  for (const testCase of usable) collect(testCase, filenamesFor(testCase));
  if (!fixed) {
    for (const testCase of usable) {
      collect(testCase, fallbackFilenamesFor(testCase));
    }
  }

  if (skipped) {
    coverage.cappedTail.push(`${rule} ${skipped}`);
    capped += skipped;
  }
  if (!fixed) {
    coverage.neverFixed.push(rule);
    explanation.set(rule, noFixReasonFor(rule, usable));
    detail.set(rule, `${usable.length} case(s) scanned`);
  }
}

/**
 * The suggestion corpus, built from the same harvest under the same cap. Each
 * emitted suggestion becomes its own pair against the untouched snippet, so a
 * rule offering three suggestions on one report contributes three independent
 * compilations rather than one impossible composite.
 */
const suggestionPairs: Pair[] = [];
const suggestionExplanation = new Map<string, Reason>();

for (const rule of suggestionRules) {
  const { usable } = casesFor(rule);
  if (!usable.length) {
    suggestionExplanation.set(rule, REASONS.noFixtures);
    continue;
  }
  let emitted = 0;
  const collect = (testCase: FixtureCase, filenames: string[]) => {
    if (!filenames.length || emitted >= MAX_PAIRS_PER_RULE) return;
    const result = suggestWith(PREFIX + rule, testCase, filenames);
    if (!result) return;
    for (const output of result.outputs) {
      if (emitted >= MAX_PAIRS_PER_RULE) break;
      suggestionPairs.push({
        rule,
        name: `${rule}__s${emitted}.${
          result.filename.endsWith('.tsx') ? 'tsx' : 'ts'
        }`,
        before: testCase.code,
        after: output,
        origin: testCase.origin,
        filename: result.filename,
      });
      emitted++;
    }
  };
  for (const testCase of usable) collect(testCase, filenamesFor(testCase));
  if (!emitted) {
    for (const testCase of usable) {
      collect(testCase, fallbackFilenamesFor(testCase));
    }
  }
  if (!emitted) {
    suggestionExplanation.set(
      rule,
      typeAwareRuleNames.has(rule) ? REASONS.typeAware : REASONS.neverReports,
    );
  }
}

/** A planted control is not a harvested fixture, but it is probed as one. */
const plantedCase = (code: string): FixtureCase => ({
  code,
  tester: 'ruleTesterTs',
  origin: 'planted control',
  bucket: 'valid',
});

const controlPairs: Pair[] = [];
for (const control of CONTROLS) {
  const id = `control/${control.name}`;
  const testCase = plantedCase(control.code);
  const output =
    control.kind === 'suggestion'
      ? (suggestWith(id, testCase, FALLBACK_FILENAMES)?.outputs || [])[0]
      : fixWith(id, testCase, FALLBACK_FILENAMES)?.output;
  // A control whose transform never fires would make its assertion vacuous, so
  // it is carried through as an empty pair and fails loudly below.
  controlPairs.push({
    rule: control.name,
    name: `${control.name}.ts`,
    before: control.code,
    after: output ?? control.code,
    origin: 'planted control',
    filename: FALLBACK_FILENAMES[1],
  });
}

const allPairs = [...pairs, ...suggestionPairs, ...controlPairs];
const beforeDiagnostics = compileCorpus(
  allPairs.map((p) => ({ name: p.name, text: p.before })),
);
const afterDiagnostics = compileCorpus(
  allPairs.map((p) => ({ name: p.name, text: p.after })),
);

const introducedFor = (pair: Pair) =>
  introducedDiagnostics(
    beforeDiagnostics.get(pair.name) || [],
    afterDiagnostics.get(pair.name) || [],
  );

/**
 * The claim being tested is that an autofix does not turn *compiling* code into
 * non-compiling code, so a snippet that does not compile is no baseline at all.
 * Against a broken input the differential reports re-wordings rather than
 * defects, and every one of them costs a maintainer a full investigation:
 *
 *   before: TS2739: Type 'any[]' is missing ... from type 'Promise<[A, B]>'
 *   after:  TS2322: Type 'readonly [any, any]' is not assignable to 'Promise<[A, B]>'
 *
 * That pair (a non-`async` function annotated `Promise<...>` returning an array
 * literal) is not valid TypeScript with or without the fix, and the same shape
 * written `async` — the one that does compile — is already left alone. A pair
 * whose input carries a real type error is therefore excluded and reported,
 * never silently dropped.
 *
 * Unresolved *names* are the deliberate exception. The corpus is test fragments
 * full of identifiers no program defines; excluding those would leave nearly
 * nothing, and the artifact filter above already handles them in the diff.
 */
const baselineCompiles = (pair: Pair) =>
  (beforeDiagnostics.get(pair.name) || []).every(
    (diagnostic) => missingNameOf(diagnostic) !== null,
  );

const assertedPairs = pairs.filter(baselineCompiles);
const assertedByRule = new Set(assertedPairs.map((pair) => pair.rule));
for (const rule of fixableRules) {
  if (assertedByRule.has(rule)) {
    coverage.covered.push(rule);
    continue;
  }
  if (explanation.has(rule)) continue;
  const rulePairs = pairs.filter((pair) => pair.rule === rule);
  coverage.illTypedInput.push(rule);
  explanation.set(rule, REASONS.illTypedInput);
  detail.set(
    rule,
    `all ${rulePairs.length} fix pairs, e.g. ${
      rulePairs
        .flatMap((pair) => beforeDiagnostics.get(pair.name) || [])
        .find((diagnostic) => !missingNameOf(diagnostic)) || 'unknown'
    }`,
  );
}

const findingsByRule = new Map<string, Array<Pair & { added: string[] }>>();
for (const rule of fixableRules) findingsByRule.set(rule, []);
for (const pair of assertedPairs) {
  const added = introducedFor(pair);
  if (added.length) findingsByRule.get(pair.rule)!.push({ ...pair, added });
}

/** `<rule> <the TS codes the fix introduced>`, one key per defect shape. */
const findingKey = (finding: Pair & { added: string[] }) =>
  `${finding.rule} ${[
    ...new Set(finding.added.map((d) => d.slice(0, d.indexOf(':')))),
  ]
    .sort()
    .join('+')}`;

/**
 * Type-unsafe fixes the corpus reaches today, keyed `<rule> <TS code>` with the
 * number of pairs that reproduce it.
 *
 * AN ENTRY IS NOT A WAY TO MAKE A BUILD GREEN. It records a defect that is
 * tracked elsewhere, and the count is part of the key's meaning: a second pair
 * reaching the same shape is a new instance and fails here, exactly as an
 * unlisted shape does. A listed shape that stops reproducing fails too, so the
 * entry cannot rot into a shield for the next regression.
 *
 * Prefer fixing over listing.
 */
const TYPE_UNSAFE_BASELINE: Record<string, { pairs: number; note: string }> = {
  'enforce-memoize-async TS1206': {
    pairs: 1,
    note:
      'The fixer decorates a method of a class EXPRESSION (`jest.mock(' +
      'resolveModule(class Locator { … }))`), and TypeScript accepts a ' +
      'decorator only inside a class DECLARATION under experimentalDecorators ' +
      '— verified against tsc 5.0.3: the same member decorated inside `class ' +
      'C {}` or `export default class {}` compiles, inside `const C = class ' +
      "{}` or a call argument it is TS1206. The rule's own invalid fixture " +
      'enshrines the broken output as its expectation, so RuleTester agrees ' +
      'with it. Surfaced by #1732 lifting the 30-pair cap that hid the ' +
      'fixture; the rule fix belongs in its own issue.',
  },
};

const baselinedCounts = new Map<string, number>();
for (const findings of findingsByRule.values()) {
  for (const finding of findings) {
    if (!(findingKey(finding) in TYPE_UNSAFE_BASELINE)) continue;
    const key = findingKey(finding);
    baselinedCounts.set(key, (baselinedCounts.get(key) || 0) + 1);
  }
}

const assertedSuggestionPairs = suggestionPairs.filter(baselineCompiles);
const assertedSuggestionRules = new Set(
  assertedSuggestionPairs.map((pair) => pair.rule),
);
for (const rule of suggestionRules) {
  if (assertedSuggestionRules.has(rule) || suggestionExplanation.has(rule)) {
    continue;
  }
  const rulePairs = suggestionPairs.filter((pair) => pair.rule === rule);
  suggestionExplanation.set(rule, REASONS.illTypedInput);
  detail.set(
    `suggestion:${rule}`,
    `all ${rulePairs.length} suggestion pairs, e.g. ${
      rulePairs
        .flatMap((pair) => beforeDiagnostics.get(pair.name) || [])
        .find((diagnostic) => !missingNameOf(diagnostic)) || 'unknown'
    }`,
  );
}

const suggestionFindingsByRule = new Map<
  string,
  Array<Pair & { added: string[] }>
>();
for (const rule of suggestionRules) suggestionFindingsByRule.set(rule, []);
for (const pair of assertedSuggestionPairs) {
  const added = introducedFor(pair);
  if (added.length) {
    suggestionFindingsByRule.get(pair.rule)!.push({ ...pair, added });
  }
}

const controlOutcomes = controlPairs.map((pair) => ({
  name: pair.rule,
  fired: pair.after !== pair.before,
  flagged: introducedFor(pair).length > 0,
  baselineCompiles: baselineCompiles(pair),
}));

const report = (finding: Pair & { added: string[] }, channel = 'after --fix') =>
  [
    `introduced: ${finding.added.join(' | ')}`,
    `src/tests/${finding.origin} as ${finding.filename}`,
    '--- input (compiles) ---',
    finding.before,
    `--- ${channel} (does not) ---`,
    finding.after,
  ].join('\n');

const uncovered = [
  ...coverage.noFixtures,
  ...coverage.neverFixed,
  ...coverage.illTypedInput,
].sort();

/**
 * Every fixable rule this corpus cannot type-check a fix for, with the reason
 * the run itself produces.
 *
 * Enforced BOTH ways below, which a partition test alone is not: a rule that
 * goes dark must be added here consciously, and an entry that stops reproducing
 * must be deleted, since a stale one would silently absorb the next rule to
 * fall out of the corpus.
 */
const UNCOVERED_FIXERS: Record<string, Reason> = {
  // Its fixtures are markdown, declared under `ruleTesterMarkdown`.
  'enforce-typescript-markdown-code-blocks': REASONS.noFixtures,
  // Its fixtures are `package.json` bodies, declared under `ruleTesterJson`.
  'no-unpinned-dependencies': REASONS.noFixtures,
  // All 105 of its cases embed a `typedPrelude` that declares `module 'react'`,
  // which would retype every other file in the shared program.
  'no-usememo-for-pass-by-value': REASONS.sharedScope,
};

/**
 * Same contract on the suggestion channel. Empty by achievement, not omission:
 * `enforce-snapshot-state-narrowing` was here while the corpus was text-harvested
 * (every pair started from a fragment whose shorthand properties had no binding,
 * TS18004) and its real fixtures compile.
 */
const UNCOVERED_SUGGESTIONS: Record<string, Reason> = {};

const observedUncovered = Object.fromEntries(
  uncovered.map((rule) => [rule, explanation.get(rule)!]),
);

const observedUncoveredSuggestions = Object.fromEntries(
  suggestionRules
    .filter((rule) => !assertedSuggestionRules.has(rule))
    .map((rule) => [rule, suggestionExplanation.get(rule)!]),
);

const heldOutByRule = coverage.covered
  .map((rule) => {
    const total = pairs.filter((pair) => pair.rule === rule).length;
    const asserted = assertedPairs.filter((pair) => pair.rule === rule).length;
    return { rule, held: total - asserted, total };
  })
  .filter((entry) => entry.held > 0)
  .map((entry) => `${entry.rule} ${entry.held}/${entry.total}`);

/**
 * Printed, not merely asserted, and printed *per rule with its reason*: an
 * uncovered rule that lands in an unlabelled bucket reads as "this rule has no
 * fixable trigger" when the truth may be that the harness dropped it, which is
 * how #1526's defect stayed invisible under a rule the guard listed as swept.
 */
console.log(
  [
    `[fixer-type-safety] asserted ${assertedPairs.length} of ${pairs.length} ` +
      `fix pairs across ${coverage.covered.length} of ${fixableRules.length} ` +
      `fixable rules`,
    `  corpus: ${corpus.totalCases} cases from ${corpus.suitesUsed} suites, ` +
      `${corpus.filesLoaded} files loaded, ${corpus.failures.length} failed`,
    `  uncovered (${uncovered.length}), each with its reason:`,
    ...uncovered.map(
      (rule) =>
        `    ${rule}: ${explanation.get(rule)} [${detail.get(rule) || ''}]`,
    ),
    `  pair cap ${MAX_PAIRS_PER_RULE}/rule dropped ${capped} of ${harvested} ` +
      `harvested cases, in ${coverage.cappedTail.length} rule(s) [dropped]: ${
        coverage.cappedTail.join(', ') || 'none'
      }`,
    `  ${sharedScopeDropped} case(s) dropped for declaring into the shared scope`,
    `  ${
      pairs.length - assertedPairs.length
    } pair(s) held out for an input that does not type-check, in ${
      heldOutByRule.length
    } covered rule(s) [held/total]: ${heldOutByRule.join(', ') || 'none'}`,
    `  suggestion channel: asserted ${assertedSuggestionPairs.length} of ${suggestionPairs.length} pairs across ${assertedSuggestionRules.size} of ${suggestionRules.length} suggestion-emitting rules`,
    ...Object.entries(observedUncoveredSuggestions).map(
      ([rule, reason]) =>
        `    ${rule}: ${reason} [${detail.get(`suggestion:${rule}`) || ''}]`,
    ),
  ].join('\n'),
);

describe('an autofix must not turn compiling code into non-compiling code', () => {
  /**
   * Non-vacuity. Planted defects go through the same harvest, the same two
   * programs and the same diff as every rule below, so a broken harness cannot
   * degrade the assertions into a clean sweep.
   */
  it.each(CONTROLS.map((c) => [c.name, c.expectFlagged] as const))(
    'control %s is flagged: %s',
    (name, expectFlagged) => {
      const outcome = controlOutcomes.find((o) => o.name === name)!;
      expect(outcome.fired).toBe(true);
      // A control whose own input stopped type-checking would be held out by
      // the baseline gate and prove nothing about the gate's other side.
      expect(outcome.baselineCompiles).toBe(true);
      expect(outcome.flagged).toBe(expectFlagged);
    },
  );

  /**
   * Coverage floor. The per-rule assertions pass trivially if harvesting or
   * fixing breaks, so the corpus size is asserted rather than assumed.
   */
  it('compiles a meaningful share of the fixable rules', () => {
    expect(fixableRules.length).toBeGreaterThan(70);
    // Exact, not a floor: every rule below the count is named in
    // UNCOVERED_FIXERS, so slack here would only re-open the hole it closes.
    expect(coverage.covered.length).toBe(
      fixableRules.length - Object.keys(UNCOVERED_FIXERS).length,
    );
    expect(assertedPairs.length).toBeGreaterThanOrEqual(1800);
    expect(corpus.failures).toEqual([]);
  });

  /**
   * "Uncovered" must never be a silent bucket (#1527). Every fixable rule lands
   * in exactly one bucket, every rule outside `covered` carries a reason, and
   * the reason it carries is the one recorded for it — so a rule the harness
   * drops can never again read as a rule with no fixable trigger, and an
   * exemption cannot outlive the fact that justified it (#1732).
   */
  it('accounts for every fixable rule, uncovered ones by reason', () => {
    expect([...coverage.covered, ...uncovered].sort()).toEqual(fixableRules);
    expect(observedUncovered).toEqual(UNCOVERED_FIXERS);
  });

  /**
   * A baselined defect must stay exactly as large as it was recorded, and a
   * baseline that stops reproducing must be deleted — either half left
   * unenforced would let the entry absorb the next regression silently.
   */
  it('reproduces every baselined type-unsafe fix, and no more of it', () => {
    expect(Object.fromEntries(baselinedCounts)).toEqual(
      Object.fromEntries(
        Object.entries(TYPE_UNSAFE_BASELINE).map(([key, { pairs }]) => [
          key,
          pairs,
        ]),
      ),
    );
  });

  it.each(fixableRules)('%s', (rule) => {
    const findings = findingsByRule
      .get(rule)!
      .filter((finding) => !(findingKey(finding) in TYPE_UNSAFE_BASELINE));
    const problems: string[] = [];
    // Without this, a rule that stopped contributing a pair asserts nothing.
    if (!assertedByRule.has(rule) && !(rule in UNCOVERED_FIXERS)) {
      problems.push(
        `no fix of this rule was type-checked (${explanation.get(rule)}). ` +
          `Restore a triggering fixture, or add the rule to UNCOVERED_FIXERS ` +
          `with that reason.`,
      );
    }
    // A finding means the fix must decline instead; see #1521, #1522, #1523.
    if (findings.length) {
      problems.push(findings.map((f) => report(f)).join('\n\n'));
    }
    expect(problems.join('\n\n')).toBe('');
  });
});

describe('a suggestion must not turn compiling code into non-compiling code', () => {
  /**
   * Non-vacuity, per rule. A suggestion the harness never applies compiles
   * nothing, and a corpus total would let one prolific rule hold the floor up
   * while another stopped emitting entirely. `control-suggestion-type-break`
   * above proves the same pipeline flags a planted defect on this channel.
   */
  it('compiles at least one suggestion from every suggestion-emitting rule', () => {
    expect(suggestionRules.length).toBeGreaterThanOrEqual(7);
    expect(
      Object.fromEntries(
        suggestionRules.map((rule) => [
          rule,
          suggestionPairs.some((pair) => pair.rule === rule),
        ]),
      ),
    ).toEqual(Object.fromEntries(suggestionRules.map((rule) => [rule, true])));
    expect(assertedSuggestionPairs.length).toBeGreaterThanOrEqual(120);
  });

  /**
   * A rule with no ASSERTED pair is not a failure — every one of its inputs may
   * be ill-typed to begin with — but it must never be a silent bucket, for the
   * same reason #1527 gave on the fix channel, and the reason it carries has to
   * be the one recorded for it or the exemption outlives its justification.
   */
  it('accounts for every suggestion-emitting rule, unasserted ones by reason', () => {
    expect(observedUncoveredSuggestions).toEqual(UNCOVERED_SUGGESTIONS);
  });

  it.each(suggestionRules)('%s', (rule) => {
    const findings = suggestionFindingsByRule.get(rule)!;
    const problems: string[] = [];
    // Without this, a rule whose suggestions stopped compiling asserts nothing.
    if (
      !assertedSuggestionRules.has(rule) &&
      !(rule in UNCOVERED_SUGGESTIONS)
    ) {
      problems.push(
        `no suggestion of this rule was type-checked ` +
          `(${suggestionExplanation.get(rule)}). Restore a triggering ` +
          `fixture, or add the rule to UNCOVERED_SUGGESTIONS with that reason.`,
      );
    }
    // A finding means the suggestion must decline instead; see #1521.
    if (findings.length) {
      problems.push(
        findings.map((f) => report(f, 'after the suggestion')).join('\n\n'),
      );
    }
    expect(problems.join('\n\n')).toBe('');
  });
});
