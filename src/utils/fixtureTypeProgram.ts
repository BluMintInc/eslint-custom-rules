import path from 'path';
import * as ts from 'typescript';

/**
 * The stub/compile/differential machinery every "does the rewrite still
 * type-check?" guard runs on, in one place.
 *
 * `fixer-type-safety` (a rule's fixer against its OWN fixtures),
 * `cross-fixture-fixer-type-safety` (against EVERY rule's fixtures) and
 * `composed-fix-type-safety-closure` (the whole recommended config composed) ask
 * three different questions of the same instrument, and the instrument is where
 * the subtle parts live: which modules earn a shape and why, why the wildcard
 * stays, why the diff is a multiset differential rather than an absolute count,
 * why both strictness modes run. Each of those is documented at its definition
 * below; a guard that copied them would fork the reasoning as well as the code.
 *
 * What a guard still owns for itself: which (input, output) pairs it builds,
 * which introduced diagnostics survive its discount, and its own baseline.
 */

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
 *    controls each guard plants sit in the same program as everything else
 *    precisely to keep proving that.
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
 * produced zero diagnostics, which is why `fixer-type-safety` could not catch
 * #1528.
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
 * shows up in each guard's "held out for an input that does not type-check"
 * accounting.
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
export const REACT_STUB = `
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
export const TIMESTAMP_ADMIN = `
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

export const FIRESTORE_COMMON = `
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

export const FIRESTORE_ADMIN_STUB = `
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

export const FIRESTORE_CLIENT_STUB = `
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
 * `microdiff` is stubbed on the same grounds, from the same shipped typings as
 * the own-corpus guard. The paragraph that held it out said
 * `enforce-microdiff`'s fixer emits `import { diff } from 'microdiff'`; it
 * emits `import diff from '@blumintinc/microdiff';` — a DEFAULT import — so the
 * faithful stub was never the standing failure the exclusion predicted. While
 * it stood, every fixed snippet of that rule and of
 * `fast-deep-equal-over-microdiff` fell to the wildcard and type-checked as
 * `any` (#2215). `@blumintinc/typescript-memoize` is stubbed for the three
 * fixers that emit `import { Memoize } from ...`.
 */
export const SUBSTITUTION_PARTNER_STUBS = `
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
declare module 'microdiff' {
  export type Difference<TData = unknown> =
    | { type: 'CREATE'; path: (string | number)[]; value: any; oldValue: undefined }
    | { type: 'REMOVE'; path: (string | number)[]; value: undefined; oldValue: any }
    | { type: 'CHANGE'; path: (string | number)[]; value: any; oldValue: any };
  export interface MicrodiffOptions {
    cyclesFix: boolean;
  }
  export default function diff<
    TData extends Record<string, unknown> | unknown[],
  >(
    obj: TData,
    newObj: TData,
    options?: Partial<MicrodiffOptions>,
  ): Difference<TData>[];
}
declare module '@blumintinc/microdiff' {
  export type Difference<TData = unknown> =
    | { type: 'CREATE'; path: (string | number)[]; value: any; oldValue: undefined }
    | { type: 'REMOVE'; path: (string | number)[]; value: undefined; oldValue: any }
    | { type: 'CHANGE'; path: (string | number)[]; value: any; oldValue: any };
  export interface MicrodiffOptions {
    cyclesFix: boolean;
    isAtomic: (value: object) => boolean;
    isEqualAtomic: (a: unknown, b: unknown) => boolean;
  }
  export default function diff<
    TData extends Record<string, unknown> | unknown[],
  >(
    obj: TData,
    newObj: TData,
    options?: Partial<MicrodiffOptions>,
    _stack?: object[],
  ): Difference<TData>[];
}
declare module 'typescript-memoize' {
  interface MemoizeArgs {
    expiring?: number;
    hashFunction?: boolean | ((...args: any[]) => any);
    tags?: string[];
    useDeepEqual?: boolean;
  }
  export function Memoize(
    args?: MemoizeArgs | MemoizeArgs['hashFunction'],
  ): (
    target: Object,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<any>,
  ) => void;
}
declare module '@blumintinc/typescript-memoize' {
  interface MemoizeArgs {
    expiring?: number;
    hashFunction?: boolean | ((...args: any[]) => any);
    tags?: string[];
    useDeepEqual?: boolean;
  }
  export function Memoize(
    args?: MemoizeArgs | MemoizeArgs['hashFunction'],
  ): (
    target: Object,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<any>,
  ) => void;
  export function MemoizeExpiring(
    expiring: number,
    hashFunction?: MemoizeArgs['hashFunction'],
  ): (
    target: Object,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<any>,
  ) => void;
  export function clear(tags: string[]): number;
}
declare module '@blumintinc/use-deep-compare' {
  export function useDeepCompareMemo<T>(factory: () => T, dependencies: readonly any[]): T;
  export function useDeepCompareCallback<T extends Function>(callback: T, dependencies: readonly any[]): T;
  export function useDeepCompareEffect(effect: () => void | (() => void), dependencies: readonly any[]): void;
  export function useDeepCompareLayoutEffect(effect: () => void | (() => void), dependencies: readonly any[]): void;
  export function useDeepCompareImperativeHandle(ref: any, init: () => any, dependencies: readonly any[]): void;
}
`;

/**
 * `assertSafe`, at the module specifier `enforce-assert-safe-object-key` emits
 * by default (`assertSafeImportPath`). The signature is the shipped one, copied
 * from the rule's own docs page rather than invented:
 * `assertSafe<T extends PropertyKey>(key: T): T` — an IDENTITY, which is what
 * makes wrapping a key type-preserving.
 *
 * It earns a shape under the stated policy — the fixer substitutes `k` for
 * `assertSafe(k)`, so a wrong signature there is a type error — and it is the
 * one place the wildcard's "costs coverage, never a false finding" contract
 * measurably BREAKS. Under `declare module '*'` the call returns `any`, and an
 * `any` computed DESTRUCTURING key is a position TypeScript rejects outright
 * (TS2538: "Type 'any' cannot be used as an index type") while the expression
 * position `obj[assertSafe(k)]` accepts it. So the wildcard did not merely
 * withhold detection there, it MANUFACTURED a diagnostic: composing
 * `prefer-destructuring-no-class` with this rule produced a TS2538 that
 * vanishes once the real signature is in scope (#2234).
 *
 * The EXACT specifier is load-bearing and a pattern is not a substitute:
 * measured, `declare module '*\/assertSafe'` does NOT beat the `'*'` shorthand,
 * so it leaves the call `any` and changes nothing. A fixture that declares a
 * nested `filename` makes the rule emit a RELATIVE specifier instead, which no
 * ambient declaration can claim — that residue keeps the wildcard's `any`.
 */
const ASSERT_SAFE_STUB = `
declare module 'functions/src/util/assertSafe' {
  export function assertSafe<T extends PropertyKey>(key: T): T;
}
`;

export const STUBS = `
declare module '*';
${REACT_STUB}
${FIRESTORE_ADMIN_STUB}
${FIRESTORE_CLIENT_STUB}
${SUBSTITUTION_PARTNER_STUBS}
${ASSERT_SAFE_STUB}
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

/**
 * The corpus is compiled under BOTH strictness settings, because each one is
 * blind to a class the other sees and neither is "the" consumer's config.
 *
 * `strict: false` was the only mode until #1985, and it switches off
 * `strictNullChecks` — so every TS18048/TS2532/null-assignability diagnostic
 * was unobservable here. `no-entire-object-hook-deps` was hoisting a
 * guard-protected dereference into a dependency array, where it is evaluated
 * unconditionally and throws `TypeError`; the type-level shadow of that defect
 * is a TS18048 no consumer of this helper could see, and every one of them
 * stayed green through it. `tsconfig.json` sets `strict: true` +
 * `strictNullChecks: true`, so the loose mode was not even modelling this repo,
 * let alone agora.
 *
 * Running strict ALONE would have been a regression of its own: 36 pairs across
 * 6 rules have inputs that type-check only under the loose mode, and a
 * baseline-compiles gate would have held every one of them out. Both modes run
 * and a pair is asserted where its own input compiles, so neither mode's
 * coverage is paid for with the other's.
 *
 * `noImplicitAny: false` is deliberately kept in both: `tsconfig.json` sets
 * exactly that, so it is a match rather than a divergence.
 *
 * `noUnusedLocals`/`noUnusedParameters` match `tsconfig.json` and the
 * consumer's build too, and no `ts.Program` guard in this repo set them until
 * #2234 — so a fix that STRANDS a binding (TS6133/TS6196/TS6198) was invisible
 * to every one of them, which is precisely the damage the three baselined
 * `no-unused-vars` composition signatures describe at the ESLint level.
 *
 * They are safe against a corpus of FRAGMENTS only because every consumer of
 * this module is a DIFFERENTIAL: a snippet whose input already carries an
 * unused local carries the same diagnostic on both sides and is not a finding.
 * A guard that ever reads an ABSOLUTE diagnostic count off these programs must
 * turn them back off rather than widen a baseline.
 */
export const MODES = [
  { key: 'default', strict: false },
  { key: 'strict', strict: true },
] as const;

export type ModeKey = typeof MODES[number]['key'];

/**
 * Compiling every snippet separately would build one program per pair and cost
 * a lib load each time. The corpus is flat and every file is its own module, so
 * one program per side is equivalent and ~500x cheaper.
 */
export const compileCorpus = (
  files: Array<{ name: string; text: string }>,
  strict: boolean,
  virtualDir: string,
) => {
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict,
    noImplicitAny: false,
    noUnusedLocals: true,
    noUnusedParameters: true,
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
  sources.set(`${virtualDir}/stubs.d.ts`, STUBS);
  for (const file of files) {
    sources.set(`${virtualDir}/${file.name}`, `${file.text}\nexport {};\n`);
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

export const multisetDiff = (before: string[], after: string[]) => {
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
export const UNRESOLVED_NAME = /^TS(?:2304|2552|2662|2663):[^']*'([^']+)'/;

export const missingNameOf = (diagnostic: string) => {
  const match = UNRESOLVED_NAME.exec(diagnostic);
  return match ? match[1] : null;
};

/**
 * "Declared but never read", every spelling `noUnusedLocals`/
 * `noUnusedParameters` produce: a plain binding (TS6133), a private class
 * member (TS6138), a whole import clause (TS6192), a type or class declaration
 * (TS6196), a whole destructuring pattern (TS6198), a whole variable statement
 * (TS6199) and an unused type parameter (TS6205).
 */
const UNUSED_DECLARATION = /^TS(?:6133|6138|6192|6196|6198|6199|6205):/;

export const isUnusedDeclaration = (diagnostic: string) =>
  UNUSED_DECLARATION.test(diagnostic);

/**
 * A diagnostic a corpus of FRAGMENTS carries by construction, and which
 * therefore must not disqualify a snippet from being a BASELINE.
 *
 * Unresolved names were the original member: test snippets are full of
 * identifiers no program defines, and holding those out leaves nearly nothing.
 * Unused declarations join them for exactly the same reason, and the cost of
 * leaving them out is measured rather than argued — with `noUnusedLocals` on
 * and this predicate still keyed on unresolved names alone,
 * `fixer-type-safety`'s asserted pairs fell from 4,265 to 1,228 and its covered
 * rules from 82 to 65, because a fragment that declares a local it never reads
 * is the common case rather than the exception (#2234).
 *
 * Tolerating them in the GATE costs nothing in the DIFF: a fix that strands a
 * binding the input did not still adds a TS6133 the input's multiset lacks, and
 * that is the whole point of turning the flags on.
 */
export const isFragmentArtifact = (diagnostic: string) =>
  missingNameOf(diagnostic) !== null || isUnusedDeclaration(diagnostic);

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
export const introducedDiagnostics = (before: string[], after: string[]) => {
  const alreadyMissing = new Set<string>();
  for (const d of before) {
    const name = missingNameOf(d);
    if (name) alreadyMissing.add(name);
  }
  /**
   * The second artifact class, and the reason `noUnusedLocals` is usable here
   * at all.
   *
   * An unused-declaration diagnostic QUOTES the identifier, so a fix that
   * merely RENAMES an already-unused binding trades one message for another and
   * the multiset diff reads the second as introduced:
   *
   *   before: import { Logout } from '@mui/icons-material';
   *           -> TS6133: 'Logout' is declared but its value is never read.
   *   after:  import { LogoutRounded } from '@mui/icons-material';
   *           -> TS6133: 'LogoutRounded' is declared but its value is never read.
   *
   * Measured: 19 of `fixer-type-safety`'s per-rule arms failed on exactly that
   * shape, none of them a defect (#2234). Keying on the NAME the way the
   * unresolved-name filter does cannot work, because the name is what changed;
   * the answer is a COUNT, so an unused-declaration diagnostic is introduced
   * only insofar as the output carries MORE of them than the input did.
   *
   * The trade is the same one a count gate always makes and is stated rather
   * than hidden: a fix that strands one binding while retiring another is
   * silent here. What it preserves is the shape the flags exist for — an input
   * that stranded nothing and an output that strands something.
   */
  let unusedBudget = Math.max(
    0,
    after.filter(isUnusedDeclaration).length -
      before.filter(isUnusedDeclaration).length,
  );
  return multisetDiff(before, after).filter((d) => {
    const name = missingNameOf(d);
    if (name && alreadyMissing.has(name)) return false;
    if (isUnusedDeclaration(d)) {
      if (unusedBudget <= 0) return false;
      unusedBudget--;
    }
    return true;
  });
};

export type DiagnosticsFn = (before: string[], after: string[]) => string[];

/**
 * The differential WITHOUT the unused-declaration channel, which is what the
 * SOLO guards run.
 *
 * The channel is not merely noisy for them, it is unusable, and each step of
 * that was measured on `fixer-type-safety` rather than argued (#2234):
 *
 *   1. keyed on unresolved names alone, the baseline gate held out three
 *      quarters of the corpus — 4,265 asserted pairs down to 1,228;
 *   2. with `isFragmentArtifact` opening the gate, 19 per-rule arms failed on
 *      RENAMES of already-unused bindings (`Logout` -> `LogoutRounded`);
 *   3. with the count discount above absorbing those, 11 arms still failed on
 *      fixes that change the SHAPE of an unused declaration — one TS6198 ("all
 *      destructured elements are unused") becoming N separate TS6133s when a
 *      fixer expands a destructuring.
 *
 * Every one of those is a single rule's rewrite, so the one guard that can
 * absorb them is the one with a SOLO filter:
 * `composed-fix-type-safety-closure` keeps the channel and drops anything a
 * single rule reproduces alone. The solo guards drop the channel instead, which
 * leaves them byte-identical to their pre-#2234 behaviour while the programs
 * they run now match `tsconfig.json`.
 */
export const introducedDiagnosticsIgnoringUnused: DiagnosticsFn = (
  before,
  after,
) =>
  introducedDiagnostics(before, after).filter((d) => !isUnusedDeclaration(d));

export const multisetIntersect = (lists: string[][]): string[] =>
  intersectBy(lists, canonicalizeDiagnostic);

/** The `TS####` prefix a corpus diagnostic is built with in `compileCorpus`. */
export const codeOf = (diagnostic: string) => {
  const colon = diagnostic.indexOf(':');
  return colon < 0 ? diagnostic : diagnostic.slice(0, colon);
};

const OPENERS = '<([{';
const CLOSERS = '>)]}';
const isOpener = (char: string) => OPENERS.includes(char);
const isCloser = (char: string) => CLOSERS.includes(char);

/**
 * Every scan below treats `=>` as ONE token. Its `>` is not a closing bracket,
 * and letting it decrement the depth drives a function-typed member negative
 * and splits the rest of the string in the wrong places.
 */
const skipsArrow = (text: string, index: number) =>
  text[index] === '=' && text[index + 1] === '>';

/** Splits on `separator` where it sits at bracket depth zero. */
const splitTopLevel = (text: string, separator: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (skipsArrow(text, index)) {
      index++;
      continue;
    }
    if (isOpener(char)) depth++;
    else if (isCloser(char)) depth--;
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
};

/**
 * A bracketed group's contents are an element LIST - tuple elements, type
 * arguments, parameters, object members - separated by `,` or `;`. Splitting
 * one as if it were a union is how `{ a: A | B; }` canonicalizes to
 * `{B; | a: A}`: the `|` belongs to the member's type, not to the body.
 */
const splitListElements = (text: string) => {
  const parts: string[] = [];
  const separators: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (skipsArrow(text, index)) {
      index++;
      continue;
    }
    if (isOpener(char)) depth++;
    else if (isCloser(char)) depth--;
    else if ((char === ',' || char === ';') && depth === 0) {
      parts.push(text.slice(start, index));
      separators.push(char);
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return { parts, separators };
};

/** Splits on a depth-zero `=>`, so `(x: A) => B | C` unions only `B | C`. */
const splitTopLevelArrow = (text: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (skipsArrow(text, index)) {
      if (depth === 0) {
        parts.push(text.slice(start, index));
        start = index + 2;
      }
      index++;
      continue;
    }
    if (isOpener(char)) depth++;
    else if (isCloser(char)) depth--;
  }
  parts.push(text.slice(start));
  return parts;
};

/** The depth-zero `:` separating a member's name from its type, or -1. */
const labelEnd = (text: string) => {
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (skipsArrow(text, index)) {
      index++;
      continue;
    }
    if (isOpener(char)) depth++;
    else if (isCloser(char)) depth--;
    else if (char === ':' && depth === 0) return index;
  }
  return -1;
};

/** The index of the bracket closing the one at `open`, or -1 if unbalanced. */
const matchingBracket = (text: string, open: number) => {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    const char = text[index];
    if (skipsArrow(text, index)) {
      index++;
      continue;
    }
    if (isOpener(char)) depth++;
    else if (isCloser(char)) {
      depth--;
      if (depth === 0) return index;
      if (depth < 0) return -1;
    }
  }
  return -1;
};

/** Rewrites the contents of every bracketed group as an element list. */
const sortUnionsInside = (text: string): string => {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (isOpener(char)) {
      const close = matchingBracket(text, index);
      if (close < 0) {
        out += char;
        index++;
        continue;
      }
      out += char + sortUnionsList(text.slice(index + 1, close)) + text[close];
      index = close + 1;
      continue;
    }
    out += char;
    index++;
  }
  return out;
};

const sortUnionsList = (text: string): string => {
  const { parts, separators } = splitListElements(text);
  const sorted = parts.map((part) => sortUnionsMember(part.trim()));
  return sorted.reduce(
    (out, part, index) =>
      index ? `${out}${separators[index - 1]} ${part}` : part,
    '',
  );
};

/** `name: T` unions only `T`; the name is not a union member. */
const sortUnionsMember = (text: string): string => {
  const colon = labelEnd(text);
  if (colon < 0) return sortUnions(text);
  return `${text.slice(0, colon)}: ${sortUnions(text.slice(colon + 1).trim())}`;
};

/**
 * Only UNION members are reordered. Tuple elements, type arguments, parameters
 * and object members print in DECLARATION order, which is a property of the
 * source and stable across programs, so sorting those would erase a real
 * difference rather than a spurious one - they are rebuilt in place.
 */
const sortUnions = (text: string): string => {
  const arrowParts = splitTopLevelArrow(text);
  if (arrowParts.length > 1) {
    return arrowParts
      .map((part, index) =>
        index === arrowParts.length - 1
          ? sortUnions(part.trim())
          : sortUnionsInside(part.trim()),
      )
      .join(' => ');
  }
  if (splitListElements(text).separators.length) return sortUnionsList(text);
  const members = splitTopLevel(text, '|').map((member) =>
    sortUnionsInside(member.trim()),
  );
  if (members.length === 1) return members[0];
  return [...members].sort().join(' | ');
};

/**
 * A diagnostic message with every printed union in a canonical member order.
 *
 * TypeScript orders a union's members by type ID - the order the checker
 * happened to CREATE those types in - not by anything in the source, and a
 * type ID is per-program. Two programs over the same files can therefore print
 * one union two ways:
 *
 *   TS2345: ... parameter of type 'Record<string, unknown> | unknown[]'.
 *   TS2345: ... parameter of type 'unknown[] | Record<string, unknown>'.
 *
 * That matters because `intersectDiagnostics` is a SILENCING oracle: what it
 * drops becomes a clean. Comparing raw messages discarded a diagnostic present
 * in BOTH modes as strict-only, which is why `cross-fixture-fixer-type-safety`
 * read 0 findings while `fixer-type-safety` - which unions instead of
 * intersecting - baselines the same 4 `enforce-microdiff` TS2345 pairs (#2235).
 *
 * Rewriting is confined to single-quoted spans because that is where and only
 * where TypeScript prints a type; a string-literal type nested in one is
 * printed with double quotes, so the spans do not nest. This is a COMPARISON
 * KEY - every diagnostic reported to a maintainer is the original string.
 */
const canonicalCache = new Map<string, string>();
export const canonicalizeDiagnostic = (diagnostic: string) => {
  const cached = canonicalCache.get(diagnostic);
  if (cached !== undefined) return cached;
  const canonical = diagnostic.replace(
    /'([^']*)'/g,
    (_match, inner: string) => `'${sortUnions(inner)}'`,
  );
  canonicalCache.set(diagnostic, canonical);
  return canonical;
};

/** The entries of `list` that `kept` does not cover, compared by `keyOf`. */
const subtractBy = (
  kept: string[],
  list: string[],
  keyOf: (value: string) => string,
) => {
  const counts = new Map<string, number>();
  for (const diagnostic of kept) {
    const key = keyOf(diagnostic);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return list.filter((diagnostic) => {
    const key = keyOf(diagnostic);
    const remaining = counts.get(key) || 0;
    if (remaining <= 0) return true;
    counts.set(key, remaining - 1);
    return false;
  });
};

const intersectBy = (lists: string[][], keyOf: (value: string) => string) => {
  if (!lists.length) return [];
  let common = [...lists[0]];
  for (const list of lists.slice(1)) {
    const counts = new Map<string, number>();
    for (const diagnostic of list) {
      const key = keyOf(diagnostic);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    common = common.filter((diagnostic) => {
      const key = keyOf(diagnostic);
      const remaining = counts.get(key) || 0;
      if (remaining <= 0) return false;
      counts.set(key, remaining - 1);
      return true;
    });
  }
  return common;
};

export type DiagnosticIntersection = {
  /** The shared multiset, carrying the FIRST list's original message strings. */
  common: string[];
  /**
   * Everything ANY mode saw that the intersection did not keep - what the
   * oracle silenced. Taken over every list, not just the first: the artifact
   * class this discount exists for is the STRICT-only diagnostic, which never
   * appears in the default mode's list and so is invisible to a counter read
   * off `lists[0]` alone.
   */
  dropped: string[];
  /**
   * The subset of `dropped` that a code-only intersection would have KEPT: the
   * TS code is present in every list with the multiplicity to match, and only
   * the message text diverged. A genuinely mode-specific diagnostic is not in
   * here, so this counter isolates exactly the silent-divergence failure and a
   * guard can assert it to zero.
   *
   * Measured zero across all three consuming guards. If one ever appears, the
   * remedy is to extend `canonicalizeDiagnostic` when it is another print-order
   * divergence, or to record that one shape by name in the guard's own baseline
   * when the two modes genuinely produce different diagnostics under the same
   * TS code. Widening the comparison back toward the code alone is not a
   * remedy: it resumes silencing, which is the defect.
   */
  codeMatchedDrops: string[];
};

/**
 * The multiset every list shares, with an account of what it discarded.
 *
 * This is the mode discount, and it is the one place the cross-corpus oracles
 * deliberately differ from `fixer-type-safety`'s. That guard UNIONS the
 * diagnostics introduced under each mode whose input compiles; under this
 * helper a diagnostic counts only if EVERY mode that could judge the pair saw
 * it.
 *
 * Measured, both directions, before it was adopted:
 *
 *   - it preserves all 77 pairs of the three real bugs
 *     `cross-fixture-fixer-type-safety` exists for (#2013, #2014, #2015), per
 *     signature 14/14, 2/2, 58/58, 2/2 and 1/1; and
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
 *
 * Because dropping is how this oracle produces a clean, every drop is counted
 * rather than discarded in silence, and `codeMatchedDrops` separates "the modes
 * disagree" from "the modes agree and the message merely printed differently".
 */
export const intersectDiagnostics = (
  lists: string[][],
): DiagnosticIntersection => {
  const common = intersectBy(lists, canonicalizeDiagnostic);
  const byCode = intersectBy(lists, codeOf);
  return {
    common,
    // Compared by the CANONICAL key, like `common` itself: subtracting by raw
    // string would report the other mode's spelling of a KEPT diagnostic as a
    // drop, which is the #2235 confusion inverted.
    dropped: lists.flatMap((list) =>
      subtractBy(common, list, canonicalizeDiagnostic),
    ),
    // Canonical-key equality implies code equality, so `byCode` contains
    // `common` as a multiset and the difference is exactly the divergence.
    codeMatchedDrops: subtractBy(common, byCode, canonicalizeDiagnostic),
  };
};

/**
 * `ts.createProgram` SILENTLY drops a root file whose name it does not
 * recognize as TypeScript: `corpus.ts-7` is filtered out with no diagnostic at
 * all, not merely renamed, so `compileCorpus` returns an EMPTY list for it -
 * indistinguishable from "compiles clean". A derived name must therefore keep
 * its `.ts`/`.tsx` as the actual suffix rather than have one appended after it.
 */
export const withSuffix = (name: string, suffix: string): string => {
  const match = /\.(tsx?)$/.exec(name);
  if (!match) return `${name}${suffix}.ts`;
  return `${name.slice(0, match.index)}${suffix}.${match[1]}`;
};

/**
 * A snippet that declares into the SHARED scope - `declare global`, or an
 * ambient/augmenting `declare module 'x'` - retypes every other file in the
 * corpus, because one program compiles them all. Dropped and counted, never
 * silently discarded; `fixer-type-safety.test.ts`'s own header carries the
 * `JSX.Element` branding example that makes the damage concrete.
 */
export const DECLARES_INTO_SHARED_SCOPE =
  /\bdeclare\s+(?:global\b|module\s+['"])/;
