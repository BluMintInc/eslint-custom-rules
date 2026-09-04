import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import * as jsoncParser from 'jsonc-eslint-parser';
import { rules } from '../index';
import {
  buildOptionPayloads,
  hashOffset,
  optionSchemaOf,
  payloadLabel,
  screenPayloads,
} from '../utils/syntheticRuleOptions';

// markdown-eslint-parser ships no type declarations, so it cannot be imported
// without failing the build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const markdownParser = require('markdown-eslint-parser');

/**
 * A rule that throws aborts linting for the whole file, so it is strictly worse
 * than a false positive: the consumer loses every other rule's coverage of that
 * file and CI reports a crash rather than a diagnostic. Rule tests only feed a
 * rule the shapes its author anticipated, so this sweeps every rule over a
 * corpus of unusual-but-valid TypeScript/TSX instead.
 *
 * Control-first: a snippet the parser itself rejects surfaces as a `fatal`
 * message rather than a throw, and is reported separately — a parser-version gap
 * must never be able to masquerade as a rule defect.
 */

const PLUGIN = '@blumintinc/blumint';

type Snippet = { id: string; code: string; jsx?: boolean };

const SNIPPETS: Snippet[] = [];
const ts = (id: string, code: string) => SNIPPETS.push({ id, code });
const tsx = (id: string, code: string) =>
  SNIPPETS.push({ id, code, jsx: true });

// degenerate files
ts('empty', '');
ts('only-comment', '// just a comment\n');
ts('only-block-comment', '/* nothing here */\n');
ts('shebang', '#!/usr/bin/env node\nexport const a = 1;\n');
ts('only-whitespace', '\n\n   \n\t\n');

// classes and modern members
ts('static-block', 'export class A { static x = 1; static { A.x = 2; } }');
ts(
  'private-fields',
  'export class A { #x = 1; #m() { return this.#x; } has(o: any) { return #x in o; } }',
);
ts(
  'accessors',
  'export class A { get v(): number { return 1; } set v(n: number) {} }',
);
ts(
  'abstract-override',
  'export abstract class B { abstract m(): void; }\nexport class C extends B { override m(): void {} }',
);
ts(
  'param-props',
  'export class A { constructor(private readonly a: string, public b = 2) {} }',
);
ts(
  'computed-members',
  'const k = Symbol();\nexport class A { [k]() {} static ["lit"]() {} }',
);
ts('index-signature', 'export class A { [key: string]: unknown; }');
ts(
  'decorators',
  'declare const dec: any;\n@dec\nexport class A { @dec m() {} @dec p = 1; m2(@dec x: number) {} }',
);
ts(
  'overloads',
  'export function f(a: string): string;\nexport function f(a: number): number;\nexport function f(a: any): any { return a; }',
);
ts('this-param', 'export function f(this: Window, a: number) { return a; }');
ts(
  'definite-assignment',
  'export class A { x!: number; }\nexport let y!: string;',
);
ts(
  'private-static',
  'export class A { private static helper<T extends object>(a: T): T { return a; } }',
);

// types
ts(
  'conditional-infer',
  'export type E<T> = T extends Array<infer U> ? U : never;',
);
ts(
  'mapped-modifiers',
  'export type M<T> = { readonly [K in keyof T as `get${string & K}`]-?: () => T[K] };',
);
ts('template-literal-type', 'export type T = `a${string}b${number}`;');
ts('variance-annotations', 'export interface I<in out T> { v: T }');
ts('satisfies', 'export const c = { a: 1 } satisfies Record<string, number>;');
ts(
  'asserts-predicate',
  'export function assertIsStr(x: unknown): asserts x is string {}\nexport function isStr(x: unknown): x is string { return typeof x === "string"; }',
);
ts('unique-symbol', 'export declare const s: unique symbol;');
ts('tuple-labels', 'export type T = [head: string, ...rest: number[]];');
ts('typeof-import', 'export type T = typeof import("./x");');
ts(
  'abstract-construct-type',
  'export type C = abstract new (...args: any[]) => object;',
);
ts(
  'recursive-type',
  'export type J = string | number | boolean | null | J[] | { [k: string]: J };',
);

// namespaces and declaration merging
ts(
  'namespace',
  'export namespace NS { export const a = 1; export namespace Inner { export const b = 2; } }',
);
ts(
  'declare-global',
  'declare global { interface Window { custom?: string } }\nexport {};',
);
ts(
  'module-augment',
  'declare module "some-mod" { export const extra: number; }\nexport {};',
);
ts(
  'enum-variants',
  'export enum E { A, B = 2, C = "c" }\nexport const enum CE { X = 1 }',
);
ts('declare-fn', 'declare function amb(a: string): void;\nexport {};');

// imports and exports
ts(
  'type-only-io',
  'import type { A } from "./a";\nimport { type B, C } from "./b";\nexport type { A };\nexport { C };',
);
ts('export-star-as', 'export * as ns from "./mod";\nexport * from "./other";');
ts(
  'dynamic-import',
  'export const load = async () => (await import("./mod")).default;',
);
ts('side-effect-import', 'import "./polyfill";\nexport {};');
ts('import-equals', 'import fs = require("fs");\nexport const x = fs;');
ts('export-default-anon', 'export default function () { return 1; }');
ts('export-default-class', 'export default class {}');

// statements and control flow
ts(
  'labeled-loops',
  'export function f() { outer: for (const a of [1]) { inner: for (const b of [2]) { if (b) continue outer; break inner; } } }',
);
ts(
  'generators',
  'export function* g() { yield 1; yield* g(); }\nexport async function* ag() { yield 1; for await (const x of ag()) { void x; } }',
);
ts(
  'try-optional-catch',
  'export function f() { try { throw 1; } catch { return 0; } finally { void 0; } }',
);
ts(
  'logical-assign',
  'export function f(o: any) { o.a ??= 1; o.b ||= 2; o.c &&= 3; return o?.d?.[0]?.(); }',
);
ts(
  'destructuring',
  'export const { a = 1, b: { c = 2 } = {}, ...rest } = {} as any;\nexport const [x, , y = 3, ...zs] = [] as any[];',
);
ts('tagged-template', 'declare const tag: any;\nexport const t = tag`a${1}b`;');
ts('named-regex', 'export const r = /(?<year>\\d{4})-(?<m>\\d{2})/u;');
ts('comma-sequence', 'export const f = () => (console.log(1), 2);');
ts(
  'switch-forms',
  'export function f(a: number) { switch (a) { case 1: case 2: return 1; case 3 || 4: return 2; default: { const b = 2; return b; } } }',
);
ts('iife', '(function () { void 0; })();\n(() => { void 0; })();\nexport {};');
ts('new-target', 'export function F(this: any) { if (!new.target) throw 1; }');

// comments in awkward positions
ts(
  'dense-comments',
  'export /* a */ const /* b */ x /* c */ = /* d */ 1; // e\n/** jsdoc */\nexport function /* f */ g() /* h */ { /* i */ }',
);

// JSX
tsx('jsx-basic', 'export const C = () => <div className="a">text</div>;');
tsx(
  'jsx-fragment',
  'export const C = () => <><span>a</span><span>b</span></>;',
);
tsx('jsx-namespaced', 'export const C = () => <svg:circle xlinkHref="#a" />;');
tsx(
  'jsx-member-expr',
  'declare const M: any;\nexport const C = () => <M.Sub.Deep prop={1} />;',
);
tsx(
  'jsx-spread',
  'declare const p: any;\nexport const C = () => <div {...p} key="k">{...[1, 2]}</div>;',
);
tsx(
  'jsx-react-fragment-forms',
  'declare const React: any;\ndeclare const p: any;\ndeclare const xs: any[];\nexport const C = () => <React.Fragment><React.Fragment />{xs.map((x) => <React.Fragment key={x}><b /></React.Fragment>)}<React.Fragment {...p}><i /></React.Fragment></React.Fragment>;',
);
tsx('jsx-generic-arrow', 'export const id = <T,>(v: T): T => v;');
tsx(
  'jsx-expr-children',
  'declare const xs: any[];\nexport const C = () => <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul>;',
);
tsx(
  'jsx-empty-expr-comment',
  'export const C = () => <div>{/* comment only */}</div>;',
);
tsx('jsx-entities', 'export const C = () => <div>&nbsp;&amp;&#123;</div>;');
tsx(
  'jsx-boolean-props',
  'declare const D: any;\ndeclare const a: boolean | undefined;\nexport const C = () => <D disabled={a || false} hidden={a ?? true} open={!!a} />;',
);
tsx(
  'jsx-nested-deep',
  'export const C = () => <a><b><c><d><e><f>deep</f></e></d></c></b></a>;',
);

// React-shaped code, which many rules gate on
tsx(
  'react-hooks',
  'import { useState, useEffect, useMemo, useCallback, useRef } from "react";\nexport const C = () => {\n  const [s, setS] = useState(0);\n  const r = useRef<HTMLDivElement>(null);\n  const m = useMemo(() => ({ a: 1 }), []);\n  const cb = useCallback((n: number) => setS(n), []);\n  useEffect(() => { cb(s); }, [cb, s]);\n  return <div ref={r}>{m.a}</div>;\n};',
);
tsx(
  'react-memo-forwardref',
  'import { memo, forwardRef } from "react";\nexport type Props = { a: string };\nexport const C = memo(forwardRef<HTMLDivElement, Props>(function C(props, ref) {\n  return <div ref={ref}>{props.a}</div>;\n}));',
);
tsx(
  'react-inline-handlers',
  'declare const send: (n: number) => void;\nexport const C = () => <button onClick={() => send(1)} style={{ color: "red" }}>go</button>;',
);

// async and data-access shapes
ts(
  'async-await-chain',
  'declare const db: any;\nexport async function f() {\n  const snap = await db.collection("a").doc("b").get();\n  const all = await Promise.all([db.get(), db.get()]);\n  return { snap, all };\n}',
);
ts(
  'promise-forms',
  'export const p = new Promise<void>((res, rej) => { res(); rej(); });\nexport const q = Promise.resolve(1).then((v) => v).catch(() => 0).finally(() => {});',
);
ts(
  'array-methods',
  'declare const xs: number[];\nexport const r = xs.filter(Boolean).map((x) => x * 2).reduce((a, b) => a + b, 0);',
);
ts(
  'object-statics',
  'declare const o: Record<string, number>;\nexport const e = Object.entries(o).map(([k, v]) => `${k}${v}`);\nexport const f = Object.freeze({ a: 1 } as const);',
);

/**
 * Absent-child shapes: nodes whose child slot is legitimately absent — `null`
 * (array holes, a valueless JSX attribute, a missing `catch` clause), missing
 * from an argument list, or an empty collection. Rules reach these slots through
 * indexed access (`arguments[0]`, `elements[0]`) or through fields the AST types
 * declare as always present, so the type checker never forces a guard and the
 * dereference throws — aborting the whole lint run instead of producing a
 * diagnostic. Three real crashes came out of this family, each reachable only
 * through a shape the rest of the corpus lacks: a zero-argument
 * `JSON.stringify()`, a zero-argument `.map()` inside `useMemo`, and a leading
 * array hole handed to `fixer.insertTextBefore`.
 */

// Zero-argument calls. React hooks are the highest-value case because so many
// rules destructure the deps argument, which is optional at every call site.
tsx(
  'zero-arg-hooks',
  'import { useState, useEffect, useMemo, useCallback, useLayoutEffect } from "react";\ndeclare const fn: any;\nexport const C = () => {\n  const [s] = useState();\n  const m = useMemo(fn);\n  const cb = useCallback(fn);\n  useEffect(fn);\n  useLayoutEffect(fn);\n  return <div onClick={cb}>{String(s)}{m}</div>;\n};',
);
tsx(
  'zero-arg-memo-forwardref',
  'import { memo, forwardRef } from "react";\nexport const A = memo();\nexport const B = forwardRef();\nexport const D = memo(forwardRef());\nexport const E = () => <A />;',
);
// Both a component and a `use`-prefixed hook, because a rule gated on being
// inside a custom hook never sees the component form — which is exactly how the
// zero-argument `.map()` inside `useMemo` stayed hidden.
tsx(
  'zero-arg-map-in-usememo',
  'import { useMemo } from "react";\ndeclare const registry: any;\nexport const useItems = () => {\n  const memoized = useMemo(() => registry.map(), []);\n  return useMemo(() => registry.map(), [memoized]);\n};\nexport function useMoreItems() {\n  return useMemo(() => registry.map(), []);\n}\nexport const useNested = () => {\n  return useMemo(function () { return registry.map(); }, []);\n};\nexport const C = () => {\n  const items = useMemo(() => registry.map(), []);\n  return <div>{items}</div>;\n};',
);
tsx(
  'zero-arg-hooks-in-custom-hook',
  'import { useState, useEffect, useMemo, useCallback } from "react";\ndeclare const fn: any;\ndeclare const registry: any;\nexport const useThing = () => {\n  const [s] = useState();\n  const [, setS] = useState();\n  const m = useMemo(fn);\n  const cb = useCallback(fn);\n  useEffect(fn);\n  return { s, setS, m, cb, items: useMemo(() => registry.map(), []) };\n};\nexport function useOther() {\n  useEffect(fn);\n  return useMemo(...(fn as any));\n}',
);
ts(
  'zero-arg-json-stringify',
  'declare const next: any;\nexport function f() {\n  if (JSON.stringify() === JSON.stringify(next)) return 1;\n  if (JSON.stringify(next) !== JSON.stringify()) return 2;\n  return JSON.parse();\n}',
);
ts(
  'zero-arg-methods',
  'declare const registry: any;\ndeclare const xs: any[];\nexport const a = registry.map();\nexport const b = xs.filter().reduce();\nexport const c = Object.keys();\nexport const d = Object.entries().map();\nexport const e = Promise.all();\nexport const g = xs.forEach();\nexport const h = Array.from();\nexport const i = xs.sort().join();',
);
ts(
  'zero-arg-standalone',
  'declare function fn(...args: any[]): any;\ndeclare const o: any;\nexport const a = fn();\nexport const b = new Set();\nexport const c = o?.();\nexport const d = o?.m?.();\nexport const e = (0, fn)();\nexport const g = fn()();\nexport const h = (async () => {})();',
);

// Leading array hole: `elements[0] === null` is a distinct shape from a hole in
// the middle, because it is the slot an insertion anchors on.
ts(
  'array-hole-leading',
  'declare const xs: any[];\nexport const a = [, 1];\nexport const b = [,];\nexport const c = [, , 3];\nexport const d = [, ...xs];\nexport const [, second] = xs;\nexport const [, , third = 3] = xs;\nexport function f([, first]: any[]) { return first; }',
);
tsx(
  'array-hole-hook-destructure',
  'import { useState } from "react";\nexport const C = () => {\n  const [, setS] = useState(0);\n  return <button onClick={() => setS(1)}>go</button>;\n};',
);
// Regression for the leading-hole crash in prefer-sx-prop-over-system-props:
// the fixer anchored on `elements[0]`, which a hole leaves null. Carries a
// system prop so the rule reports and the fixer actually runs, and imports the
// component from MUI because the rule reads provenance rather than the name.
tsx(
  'sx-array-leading-hole',
  'import { Box } from "@mui/material";\ndeclare const isActive: boolean;\ndeclare const activeStyles: any;\nexport const A = () => <Box pt={2} sx={[, isActive && activeStyles]} />;\nexport const B = () => <Box mt={1} sx={[,]} />;\nexport const D = () => <Box display="flex" sx={[, , activeStyles]} />;\nexport const E = () => <Box mt={1} sx />;\nexport const F = () => <Box mt={1} sx={[]} />;\nexport const G = () => <Box mt={1} sx={{}} />;',
);

// Bare `return;` / `yield;` — an absent `argument`.
ts(
  'bare-return-yield',
  'declare const cond: boolean;\nexport function f() { if (cond) return; return; }\nexport const g = () => { return; };\nexport function* h() { yield; yield* h(); return; }\nexport async function* i() { yield; }\nexport class A { m() { return; } get v() { return; } }',
);

// A `try` missing either the handler or the finalizer, rather than all three
// clauses at once.
ts(
  'try-finally-only',
  'export function f() { try { void 0; } finally { void 0; } }\nexport function g() { try {} finally {} }',
);
ts(
  'try-catch-only',
  'export function f() { try { void 0; } catch {} }\nexport function g() { try { void 0; } catch (e) { void e; } }\nexport function h() { try {} catch ({ message }: any) { void message; } }',
);

// An absent init/test/update in a `for` header.
ts(
  'for-empty-header',
  'declare const cond: boolean;\nexport function f() {\n  for (;;) { break; }\n  for (let i = 0; ; i++) { break; }\n  for (; cond; ) { break; }\n  for (let j = 0; cond; ) { void j; break; }\n}',
);

// A bare boolean JSX attribute has `value === null`.
tsx(
  'jsx-valueless-attrs',
  'declare const D: any;\nexport const C = () => <D disabled hidden open required data-flag aria-hidden />;\nexport const E = () => <input type="text" readOnly disabled />;',
);

// `arguments[0]` exists but is a SpreadElement, so every field a rule expects
// on the real first argument is absent.
ts(
  'spread-only-args',
  'declare function fn(...args: any[]): any;\ndeclare const args: any[];\ndeclare const K: any;\nexport const a = fn(...args);\nexport const b = Math.max(...args);\nexport const c = new K(...args);\nexport const d = fn(...args, 1);\nexport const e = console.log(...args);',
);
tsx(
  'spread-only-hook-args',
  'import { useEffect, useMemo } from "react";\ndeclare const args: any;\nexport const C = () => {\n  const m = useMemo(...args);\n  useEffect(...args);\n  return <div>{m}</div>;\n};',
);

// Empty collections and empty binding patterns.
ts(
  'empty-literals-and-patterns',
  'declare const src: any;\nexport const o = {};\nexport const a: any[] = [];\nexport const spread = { ...src };\nexport const nested = { ...src, ...{} };\nexport function f() { const {} = src; const [] = src; }\nexport function g({}: any, []: any[], { ...rest }: any) { return rest; }',
);
ts(
  'empty-declarations',
  'export interface I {}\nexport enum E {}\nexport type T = {};\nexport type U = [];\nexport function f() {}\nexport const g = () => {};\nexport const h = function () {};\nexport namespace N {}\nexport abstract class A {}',
);
ts(
  'empty-import-export',
  'import {} from "./m";\nimport "./side";\nexport {};\nexport {} from "./n";',
);
ts(
  'empty-statements',
  'declare const cond: any;\nexport function f() {\n  ;\n  if (cond);\n  if (cond); else;\n  while (cond) ;\n  for (const a of []) ;\n  do ; while (cond);\n  switch (cond) {}\n  loop: ;\n  {}\n}',
);

// A class property with neither a value nor a type annotation.
ts(
  'class-bare-members',
  'export class A { x; static y; protected p; #priv; ["computed"]; }\nexport class B { constructor() {} }\nexport class C {}\nexport class D extends B {}',
);

// TSEmptyBodyFunctionExpression: `value.body` is null on overload signatures and
// on every member of a `declare class`.
ts(
  'declare-class-empty-bodies',
  'declare class D {\n  constructor(a: string);\n  m(): void;\n  static s(): void;\n  p: string;\n  private q;\n}\nexport type DT = D;',
);
ts(
  'class-method-overloads',
  'export class A {\n  m(a: string): void;\n  m(a: number): void;\n  m(a: any): void { void a; }\n  static s(): void;\n  static s(a?: any): void { void a; }\n}',
);

// Params with no type annotation, and optional params with no default.
ts(
  'untyped-optional-params',
  'export function f(a, b?, ...rest) { return [a, b, rest]; }\nexport const g = (a, b = 1, { c } = {} as any) => [a, b, c];\nexport class A { constructor(a) { void a; } m(a, b?) { return [a, b]; } }\nexport const h = function (a, b?) { return [a, b]; };\nexport declare function i(a?, b?): void;',
);

// Remaining absent-child odds and ends.
ts('export-default-literal', 'export default 1;');
ts(
  'tagged-template-no-subs',
  'declare const tag: any;\nexport const a = tag`plain`;\nexport const b = tag``;\nexport const c = String.raw`x`;\nexport const d = ``;',
);
ts(
  'new-without-parens',
  'declare const K: any;\nexport const a = new K;\nexport const b = new K.D;\nexport const c = new (class {});\nexport const d = new Map;',
);
tsx(
  'jsx-empty-children',
  'export const A = () => <div></div>;\nexport const B = () => <></>;\nexport const D = () => <div>{}</div>;\nexport const E = () => <span></span>;',
);

// scale
ts(
  'deep-nesting',
  `export function f() {\n${'  if (true) {\n'.repeat(
    40,
  )}    return 1;\n${'  }\n'.repeat(40)}}`,
);
ts(
  'long-chain',
  `declare const a: any;\nexport const v = a${'.b'.repeat(200)};`,
);
ts(
  'many-props',
  `export const o = { ${Array.from(
    { length: 300 },
    (_, i) => `k${i}: ${i}`,
  ).join(', ')} };`,
);
ts(
  'long-union',
  `export type U = ${Array.from({ length: 200 }, (_, i) => `"v${i}"`).join(
    ' | ',
  )};`,
);
ts('long-identifier', `export const ${'a'.repeat(500)} = 1;`);
ts('long-string', `export const s = "${'x'.repeat(5000)}";`);

/**
 * Path contexts, reduced to a minimal set that still reaches every path-gated
 * rule. Rules keyed to a directory or filename suffix never execute under a
 * single generic filename, so without these the sweep would silently cover only
 * part of the plugin.
 */
const PATH_CONTEXTS = [
  'functions/src/types/firestore/Conn/index',
  'src/components/Mod',
  'src/mod.test',
  'functions/src/callable/mod.f',
  'functions/src/callable/scripts/mod.f',
  'src/util/edit/validators/string/isEmail',
  'mod.dynamic',
];

/**
 * A dozen rules gate on a `.tsx` filename, so a shape carried by a non-JSX
 * snippet never reaches them under the matrix above — the same structural
 * blindness as running each rule only against its own fixtures. Mirroring the
 * non-JSX corpus into a single `.tsx` path closes that without multiplying the
 * whole matrix.
 */
const TSX_MIRROR = 'src/components/MirroredMod';

const RULE_NAMES = Object.keys(rules);

type Target = { file: string; jsx: boolean };

const targetsFor = (snippet: Snippet): Target[] => {
  const targets = PATH_CONTEXTS.map((base) => ({
    file: `${base}${snippet.jsx ? '.tsx' : '.ts'}`,
    jsx: Boolean(snippet.jsx),
  }));
  return snippet.jsx
    ? targets
    : [...targets, { file: `${TSX_MIRROR}.tsx`, jsx: true }];
};

type Crash = { rule: string; snippet: string; file: string; message: string };

const parserOptionsFor = (jsx?: boolean) => ({
  ecmaVersion: 2022 as const,
  sourceType: 'module' as const,
  ecmaFeatures: jsx ? { jsx: true } : {},
});

/**
 * ESLint decorates a rule's throw with the AST node it was visiting, so letting
 * the error object itself reach jest surfaces as
 * `TypeError: Converting circular structure to JSON` — noise that names neither
 * the rule nor the shape. Everything the report needs is flattened to a string
 * here, at the catch site, while the rule and snippet are still in scope.
 */
const describeThrow = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return `threw a non-Error value: ${String(error)}`;
  }
  const head = error.message.split('\n').slice(0, 3).join(' | ');
  return `${error.name}: ${head}`;
};

const buildLinter = (counter?: Map<string, number>) => {
  const linter = new Linter();
  linter.defineParser('ts', tsParser);
  // A handful of rules consume package.json or Markdown. Feeding those to the
  // TypeScript parser yields parser-level fatals that say nothing about the
  // rule, so they are swept under the parsers the repo pairs them with.
  linter.defineParser('jsonc', jsoncParser);
  linter.defineParser('md', markdownParser);
  for (const name of RULE_NAMES) {
    const rule = (rules as Record<string, any>)[name];
    if (!counter) {
      linter.defineRule(`${PLUGIN}/${name}`, rule);
      continue;
    }
    counter.set(name, 0);
    linter.defineRule(`${PLUGIN}/${name}`, {
      ...rule,
      create(context: unknown, options: unknown) {
        const visitors = rule.create(context, options);
        const wrapped: Record<string, unknown> = {};
        for (const key of Object.keys(visitors)) {
          const handler = visitors[key];
          if (typeof handler !== 'function') {
            wrapped[key] = handler;
            continue;
          }
          wrapped[key] = function (this: unknown, ...args: unknown[]) {
            counter.set(name, (counter.get(name) ?? 0) + 1);
            return handler.apply(this, args);
          };
        }
        return wrapped;
      },
    });
  }
  return linter;
};

const allRulesConfig = Object.fromEntries(
  RULE_NAMES.map((n) => [`${PLUGIN}/${n}`, 'error']),
) as Record<string, 'error'>;

/**
 * The options dimension.
 *
 * `allRulesConfig` is a bare `'error'` for every rule, so the whole snippet
 * matrix above measures the DEFAULT configuration and nothing else. An option
 * consumed at `create` time — the pattern lists five rules compile before any
 * visitor object exists, each defaulting to an empty list — is entered by no
 * probe in it, and the only non-default payload the sweep ever drove belonged
 * to a single rule's `SPECIAL_CASES` entry.
 *
 * Driven one rule at a time so a throw needs no replay to attribute.
 *
 * Snippets are SHARDED across a rule's payloads rather than sampled: every
 * shape still meets some non-default payload, and every payload still drives
 * `create` over a slice of the corpus, at a cost of one lint per
 * (rule, snippet, path) instead of one per (rule, payload, snippet, path). The
 * shard's owner is offset by a hash of the rule name so the same payload does
 * not own the head of the corpus for every rule.
 */
const OPTIONED_RULES = RULE_NAMES.filter(
  (name) => optionSchemaOf((rules as Record<string, unknown>)[name]).length > 0,
);

const shardFor = (
  ruleName: string,
  payloadIndex: number,
  payloadCount: number,
): Snippet[] => {
  const offset = hashOffset(ruleName, payloadCount);
  return SNIPPETS.filter(
    (_, index) => (index + offset) % payloadCount === payloadIndex,
  );
};

type OptionSweepTotals = {
  payloads: number;
  lints: number;
  snippetsDriven: Set<string>;
  rulesDriven: Set<string>;
};

const sweepOptions = (
  linter: Linter,
  ruleMap: Record<string, unknown>,
  names: readonly string[],
): { crashes: Crash[]; totals: OptionSweepTotals } => {
  const crashes: Crash[] = [];
  const totals: OptionSweepTotals = {
    payloads: 0,
    lints: 0,
    snippetsDriven: new Set<string>(),
    rulesDriven: new Set<string>(),
  };
  for (const name of names) {
    const rule = ruleMap[name];
    // Screened by ESLint's own validator: a payload the schema rejects is one
    // no consumer can write, so a crash under it would be a fabrication.
    const { valid } = screenPayloads(rule, buildOptionPayloads(rule));
    valid.forEach((payload, payloadIndex) => {
      totals.payloads++;
      totals.rulesDriven.add(name);
      for (const snippet of shardFor(name, payloadIndex, valid.length)) {
        totals.snippetsDriven.add(snippet.id);
        for (const { file, jsx } of targetsFor(snippet)) {
          totals.lints++;
          try {
            linter.verify(
              snippet.code,
              {
                parser: 'ts',
                parserOptions: parserOptionsFor(jsx),
                rules: {
                  [`${PLUGIN}/${name}`]: ['error', ...payload.options],
                },
              } as any,
              file,
            );
          } catch (error) {
            crashes.push({
              rule: name,
              snippet: `${snippet.id} under ${payload.source} ${payloadLabel(
                payload,
              )}`,
              file,
              message: describeThrow(error),
            });
          }
        }
      }
    });
  }
  return { crashes, totals };
};

const CONTROL_SCHEMA = [
  {
    type: 'object',
    properties: { list: { type: 'array', items: { type: 'string' } } },
    additionalProperties: false,
  },
];

/** Crashes only once a payload is supplied — the option arm's positive control. */
const OPTION_CRASH_CONTROL = {
  meta: { type: 'suggestion', schema: CONTROL_SCHEMA, messages: { m: 'x' } },
  create(context: { options: unknown[] }) {
    if (context.options.length) throw new Error('planted option crash');
    return {};
  },
};

/** The same option surface, tolerated — the option arm's negative control. */
const OPTION_SAFE_CONTROL = {
  meta: { type: 'suggestion', schema: CONTROL_SCHEMA, messages: { m: 'x' } },
  create() {
    return {};
  },
};

/** Floors sit just under the values measured at 1.20.198. */
const OPTIONED_RULE_FLOOR = 68; // measured 71
const OPTION_PAYLOAD_FLOOR = 390; // measured 406
const OPTION_LINT_FLOOR = 57_000; // measured 58,504

/**
 * Rules the path sweep above cannot reach, because they gate on file *content*
 * or require options rather than keying off the path. Without these the sweep
 * silently reports "no crashes" for rules it never actually ran.
 */
type SpecialCase = {
  rule: string;
  id: string;
  parser: 'ts' | 'jsonc' | 'md';
  file: string;
  code: string;
  options?: unknown[];
};

const SPECIAL_CASES: SpecialCase[] = [];

// Needs options before any visitor does work.
const RESTRICTED_OPTIONS = [
  [{ property: 'length', message: 'Using .length is restricted.' }],
];
for (const [id, code] of [
  ['plain', 'declare const o: any;\nexport const n = o.length;'],
  [
    'optional-chain',
    'declare const o: any;\nexport const n = o?.length ?? o?.[0]?.length;',
  ],
  [
    'computed',
    'declare const o: any;\nconst k = "length";\nexport const n = o[k];',
  ],
  [
    'private-field',
    'export class A { #length = 1; get l() { return this.#length; } }',
  ],
  [
    'deep-chain',
    `declare const a: any;\nexport const v = a${'.b'.repeat(200)}.length;`,
  ],
  [
    'destructured',
    'declare const o: any;\nexport const { length, ...rest } = o;',
  ],
  [
    'assign-target',
    'declare const o: any;\nexport function f() { o.length = 0; o.length ??= 1; }',
  ],
  [
    'static-block',
    'declare const o: any;\nexport class A { static { void o.length; } }',
  ],
  // Absent-child shapes. This rule only runs with options, so the main corpus
  // never reaches it and these have to be restated here.
  [
    'zero-arg-call',
    'declare const o: any;\nexport const a = o.length();\nexport const b = o();\nexport const c = o.length.toString();',
  ],
  [
    'array-hole',
    'declare const o: any;\nexport const xs = [, o.length];\nexport const [, second] = [o.length, o.length];',
  ],
  [
    'spread-only-args',
    'declare const o: any;\ndeclare function fn(...args: any[]): any;\nexport const a = fn(...o.length);',
  ],
  [
    'bare-class-member',
    'export class A { length; static length2; }\nexport const empty = {};',
  ],
] as const) {
  SPECIAL_CASES.push({
    rule: 'no-restricted-properties-fix',
    id,
    parser: 'ts',
    file: 'src/mod.ts',
    code,
    options: RESTRICTED_OPTIONS,
  });
}

for (const [id, code] of [
  [
    'pinned',
    '{ "dependencies": { "a": "1.0.0" }, "devDependencies": { "b": "2.0.0" } }',
  ],
  [
    'ranges',
    '{ "dependencies": { "a": "^1.0.0", "b": "~2.0.0", "c": "*", "d": ">=1", "e": "1.x" } }',
  ],
  ['empty', '{}'],
  [
    'nested-object-value',
    '{ "dependencies": { "a": { "nested": "^1.0.0" } } }',
  ],
  ['array-deps', '{ "dependencies": ["^1.0.0"] }'],
  ['null-dep', '{ "dependencies": { "a": null } }'],
  ['numeric-dep', '{ "dependencies": { "a": 1 } }'],
  ['bool-deps', '{ "dependencies": true }'],
  ['no-deps-key', '{ "name": "x", "version": "1.0.0" }'],
  [
    'all-buckets',
    '{ "dependencies": {"a":"^1"}, "devDependencies": {"b":"^1"}, "peerDependencies": {"c":"^1"}, "optionalDependencies": {"d":"^1"} }',
  ],
  [
    'non-registry-specs',
    '{ "dependencies": { "a": "git+https://github.com/x/y.git#v1", "b": "file:../local", "c": "npm:other@^1" } }',
  ],
  ['empty-version', '{ "dependencies": { "a": "" } }'],
  ['top-level-array', '[1, 2, 3]'],
  ['empty-deps-object', '{ "dependencies": {}, "devDependencies": {} }'],
  ['empty-array-deps', '{ "dependencies": [] }'],
] as const) {
  SPECIAL_CASES.push({
    rule: 'no-unpinned-dependencies',
    id,
    parser: 'jsonc',
    file: 'package.json',
    code,
  });
}

for (const [id, code] of [
  ['ts-block', '# Title\n\n```ts\nconst a = 1;\n```\n'],
  ['js-block', '# Title\n\n```js\nconst a = 1;\n```\n'],
  ['jsx-block', '# Title\n\n```jsx\nconst a = <div />;\n```\n'],
  ['no-lang', '# Title\n\n```\nconst a = 1;\n```\n'],
  ['unterminated', '# Title\n\n```ts\nconst a = 1;\n'],
  ['empty', ''],
  ['prose-only', 'Some `inline` code only.\n'],
  ['nested-fence', '# T\n\n````md\n```ts\nconst a = 1;\n```\n````\n'],
  ['crlf', '# T\r\n\r\n```js\r\nconst a = 1;\r\n```\r\n'],
  ['tilde-fence', '# T\n\n~~~js\nconst a = 1;\n~~~\n'],
  ['lang-with-meta', '# T\n\n```js title="x" {1-3}\nconst a = 1;\n```\n'],
  ['list-embedded', '# T\n\n- item\n  ```js\n  const a = 1;\n  ```\n'],
] as const) {
  SPECIAL_CASES.push({
    rule: 'enforce-typescript-markdown-code-blocks',
    id,
    parser: 'md',
    file: 'docs/example.md',
    code,
  });
}

/**
 * Rules the sweep cannot reach even with the path matrix and the special cases —
 * enumerated rather than absorbed into a numeric margin, so that a rule the
 * corpus stops reaching is named instead of hiding inside slack. Empty, because
 * the corpus reaches every rule the plugin exports.
 */
const KNOWN_UNREACHABLE = new Set<string>([]);

describe('rule crash robustness', () => {
  const visitorCounts = new Map<string, number>();
  const linter = buildLinter(visitorCounts);
  const crashes: Crash[] = [];
  const parserFatals: { snippet: string; file: string; message: string }[] = [];
  let optionTotals: OptionSweepTotals = {
    payloads: 0,
    lints: 0,
    snippetsDriven: new Set<string>(),
    rulesDriven: new Set<string>(),
  };

  beforeAll(() => {
    for (const snippet of SNIPPETS) {
      for (const { file, jsx } of targetsFor(snippet)) {
        const config = {
          parser: 'ts',
          parserOptions: parserOptionsFor(jsx),
          rules: allRulesConfig,
        } as any;
        try {
          const messages = linter.verify(snippet.code, config, file);
          const fatal = messages.find((m) => m.fatal);
          if (fatal) {
            parserFatals.push({
              snippet: snippet.id,
              file,
              message: fatal.message,
            });
          }
        } catch (batchError) {
          // Running every rule at once means one throw hides the rest, so the
          // culprit is identified by replaying this snippet rule-by-rule.
          let attributed = false;
          for (const name of RULE_NAMES) {
            const single = buildLinter();
            try {
              single.verify(
                snippet.code,
                {
                  parser: 'ts',
                  parserOptions: parserOptionsFor(jsx),
                  rules: { [`${PLUGIN}/${name}`]: 'error' },
                } as any,
                file,
              );
            } catch (e) {
              attributed = true;
              crashes.push({
                rule: name,
                snippet: snippet.id,
                file,
                message: describeThrow(e),
              });
            }
          }
          // A throw that only reproduces with the whole config enabled has no
          // single culprit to name. Recording it anyway keeps the batch failure
          // from vanishing just because the replay could not reproduce it.
          if (!attributed) {
            crashes.push({
              rule: '(no single rule reproduced it; only the full config throws)',
              snippet: snippet.id,
              file,
              message: describeThrow(batchError),
            });
          }
        }
      }
    }

    for (const special of SPECIAL_CASES) {
      const config = {
        parser: special.parser,
        parserOptions:
          special.parser === 'ts'
            ? parserOptionsFor(special.file.endsWith('.tsx'))
            : { ecmaVersion: 2020 },
        rules: {
          [`${PLUGIN}/${special.rule}`]: special.options
            ? ['error', ...special.options]
            : 'error',
        },
      } as any;
      try {
        const messages = linter.verify(special.code, config, special.file);
        const fatal = messages.find((m) => m.fatal);
        if (fatal) {
          parserFatals.push({
            snippet: `${special.rule}/${special.id}`,
            file: special.file,
            message: fatal.message,
          });
        }
      } catch (e) {
        crashes.push({
          rule: special.rule,
          snippet: special.id,
          file: special.file,
          message: describeThrow(e),
        });
      }
    }

    const optionPass = sweepOptions(
      linter,
      rules as unknown as Record<string, unknown>,
      OPTIONED_RULES,
    );
    crashes.push(...optionPass.crashes);
    optionTotals = optionPass.totals;
  });

  it('no rule throws on unusual-but-valid TypeScript or TSX', () => {
    // One crashing rule fires once per (snippet, path) pair, so the raw list is
    // dozens of near-identical lines. Collapse to one entry per rule.
    const byRule = new Map<string, Crash[]>();
    for (const crash of crashes) {
      const existing = byRule.get(crash.rule);
      if (existing) existing.push(crash);
      else byRule.set(crash.rule, [crash]);
    }
    const detail = [...byRule.entries()]
      .map(([rule, cs]) => {
        const snippets = [...new Set(cs.map((c) => c.snippet))];
        return `  ${rule} threw on ${
          cs.length
        } case(s) — snippets: ${snippets.join(', ')}\n    e.g. ${cs[0].file}: ${
          cs[0].message
        }`;
      })
      .join('\n');
    expect(crashes.length === 0 ? '' : `\n${detail}`).toBe('');
  });

  it('parses every corpus snippet, so the sweep is not silently skipping shapes', () => {
    const detail = parserFatals
      .map((f) => `  "${f.snippet}" (${f.file}): ${f.message}`)
      .join('\n');
    expect(parserFatals.length === 0 ? '' : `\n${detail}`).toBe('');
  });

  it('actually executes every rule it claims to cover', () => {
    // Guards against a vacuous pass: if the harness stopped wiring rules up, the
    // sweep would report zero crashes while testing nothing. A numeric margin
    // here would be a coverage floor, and a floor hides gaps — it lets a rule
    // the sweep never reaches pass anonymously. Every exported rule executes, so
    // unreached rules are enumerated by name instead: a new rule with a trigger
    // this corpus does not contain fails here until it gets a snippet (or a path
    // context, or a SPECIAL_CASES entry), which is the point.
    const silent = RULE_NAMES.filter((n) => (visitorCounts.get(n) ?? 0) === 0);
    const unexpected = silent.filter((n) => !KNOWN_UNREACHABLE.has(n));
    // A name that stops being unreachable must leave the list, or the list
    // quietly becomes a place for real gaps to hide.
    const stale = [...KNOWN_UNREACHABLE].filter((n) => !silent.includes(n));
    const detail = [
      unexpected.length === 0
        ? ''
        : `${unexpected.length}/${
            RULE_NAMES.length
          } rules never executed a visitor: ${unexpected.join(
            ', ',
          )} — add a corpus snippet (or PATH_CONTEXTS/SPECIAL_CASES entry) that reaches them`,
      stale.length === 0
        ? ''
        : `KNOWN_UNREACHABLE is stale; these do execute now and should be removed from it: ${stale.join(
            ', ',
          )}`,
    ]
      .filter(Boolean)
      .join('\n');
    expect(detail).toBe('');
  });

  it('drives every optioned rule under a schema-valid non-default payload', () => {
    // Named rather than floored: a rule that falls out of the option pass has
    // to say which one it is, or the gap hides inside a margin.
    const undriven = OPTIONED_RULES.filter(
      (name) => !optionTotals.rulesDriven.has(name),
    );
    expect(undriven).toEqual([]);
    expect(OPTIONED_RULES.length).toBeGreaterThanOrEqual(OPTIONED_RULE_FLOOR);
    expect(optionTotals.payloads).toBeGreaterThanOrEqual(OPTION_PAYLOAD_FLOOR);
    // The shard covers the whole snippet corpus, so a shape that stops being
    // driven under options is a gap rather than a smaller number. Asserted
    // before the lint floor, which a collapsed shard would also trip but only
    // as a count that says nothing about which shapes went missing.
    expect(optionTotals.snippetsDriven.size).toBe(SNIPPETS.length);
    expect(optionTotals.lints).toBeGreaterThanOrEqual(OPTION_LINT_FLOOR);
  });

  it('detects a crash only a payload reaches (option-arm positive control)', () => {
    // The default arm of this control returns an empty visitor, so a sweep that
    // never supplies options reads it as clean — which is exactly the blindness
    // the pass above exists to close.
    const control = new Linter();
    control.defineParser('ts', tsParser);
    control.defineRule(
      `${PLUGIN}/__control_option_crash`,
      OPTION_CRASH_CONTROL,
    );
    control.defineRule(`${PLUGIN}/__control_option_safe`, OPTION_SAFE_CONTROL);
    // The same payloads over a rule that tolerates them stay silent, so the
    // pass is reading the rule rather than reacting to being handed options.
    const safe = sweepOptions(
      control,
      { __control_option_safe: OPTION_SAFE_CONTROL },
      ['__control_option_safe'],
    );
    expect(safe.totals.lints).toBeGreaterThan(0);
    expect(safe.crashes).toEqual([]);
    const planted = sweepOptions(
      control,
      { __control_option_crash: OPTION_CRASH_CONTROL },
      ['__control_option_crash'],
    );
    expect(planted.totals.payloads).toBeGreaterThan(0);
    expect(planted.totals.lints).toBeGreaterThan(0);
    expect(planted.crashes.length).toBeGreaterThan(0);
    expect(
      planted.crashes.every((c) => /planted option crash/.test(c.message)),
    ).toBe(true);
  });

  it('detects a rule that throws (positive control)', () => {
    const control = new Linter();
    control.defineParser('ts', tsParser);
    control.defineRule(`${PLUGIN}/__control_throws`, {
      create() {
        return {
          Program() {
            throw new Error('planted crash');
          },
        };
      },
    } as any);
    expect(() =>
      control.verify(
        'export const a = 1;',
        {
          parser: 'ts',
          parserOptions: parserOptionsFor(false),
          rules: { [`${PLUGIN}/__control_throws`]: 'error' },
        } as any,
        'src/mod.ts',
      ),
    ).toThrow(/planted crash/);
  });
});
