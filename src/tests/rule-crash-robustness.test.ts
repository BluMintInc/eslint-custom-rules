import { Linter } from 'eslint';
import { rules } from '../index';

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
const tsx = (id: string, code: string) => SNIPPETS.push({ id, code, jsx: true });

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
ts('computed-members', 'const k = Symbol();\nexport class A { [k]() {} static ["lit"]() {} }');
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
ts('definite-assignment', 'export class A { x!: number; }\nexport let y!: string;');
ts(
  'private-static',
  'export class A { private static helper<T extends object>(a: T): T { return a; } }',
);

// types
ts('conditional-infer', 'export type E<T> = T extends Array<infer U> ? U : never;');
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
ts('abstract-construct-type', 'export type C = abstract new (...args: any[]) => object;');
ts(
  'recursive-type',
  'export type J = string | number | boolean | null | J[] | { [k: string]: J };',
);

// namespaces and declaration merging
ts(
  'namespace',
  'export namespace NS { export const a = 1; export namespace Inner { export const b = 2; } }',
);
ts('declare-global', 'declare global { interface Window { custom?: string } }\nexport {};');
ts('module-augment', 'declare module "some-mod" { export const extra: number; }\nexport {};');
ts('enum-variants', 'export enum E { A, B = 2, C = "c" }\nexport const enum CE { X = 1 }');
ts('declare-fn', 'declare function amb(a: string): void;\nexport {};');

// imports and exports
ts(
  'type-only-io',
  'import type { A } from "./a";\nimport { type B, C } from "./b";\nexport type { A };\nexport { C };',
);
ts('export-star-as', 'export * as ns from "./mod";\nexport * from "./other";');
ts('dynamic-import', 'export const load = async () => (await import("./mod")).default;');
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
ts('iife', '(function () { void 0; })();\n(() => { void 0; })();\nexport {};');
ts('new-target', 'export function F(this: any) { if (!new.target) throw 1; }');

// comments in awkward positions
ts(
  'dense-comments',
  'export /* a */ const /* b */ x /* c */ = /* d */ 1; // e\n/** jsdoc */\nexport function /* f */ g() /* h */ { /* i */ }',
);

// JSX
tsx('jsx-basic', 'export const C = () => <div className="a">text</div>;');
tsx('jsx-fragment', 'export const C = () => <><span>a</span><span>b</span></>;');
tsx('jsx-namespaced', 'export const C = () => <svg:circle xlinkHref="#a" />;');
tsx('jsx-member-expr', 'declare const M: any;\nexport const C = () => <M.Sub.Deep prop={1} />;');
tsx(
  'jsx-spread',
  'declare const p: any;\nexport const C = () => <div {...p} key="k">{...[1, 2]}</div>;',
);
tsx('jsx-generic-arrow', 'export const id = <T,>(v: T): T => v;');
tsx(
  'jsx-expr-children',
  'declare const xs: any[];\nexport const C = () => <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul>;',
);
tsx('jsx-empty-expr-comment', 'export const C = () => <div>{/* comment only */}</div>;');
tsx('jsx-entities', 'export const C = () => <div>&nbsp;&amp;&#123;</div>;');
tsx('jsx-nested-deep', 'export const C = () => <a><b><c><d><e><f>deep</f></e></d></c></b></a>;');

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

// scale
ts(
  'deep-nesting',
  `export function f() {\n${'  if (true) {\n'.repeat(40)}    return 1;\n${'  }\n'.repeat(40)}}`,
);
ts('long-chain', `declare const a: any;\nexport const v = a${'.b'.repeat(200)};`);
ts(
  'many-props',
  `export const o = { ${Array.from({ length: 300 }, (_, i) => `k${i}: ${i}`).join(', ')} };`,
);
ts(
  'long-union',
  `export type U = ${Array.from({ length: 200 }, (_, i) => `"v${i}"`).join(' | ')};`,
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

const RULE_NAMES = Object.keys(rules);

type Crash = { rule: string; snippet: string; file: string; message: string };

const parserOptionsFor = (jsx?: boolean) => ({
  ecmaVersion: 2022 as const,
  sourceType: 'module' as const,
  ecmaFeatures: jsx ? { jsx: true } : {},
});

const buildLinter = (counter?: Map<string, number>) => {
  const linter = new Linter();
  linter.defineParser('ts', require('@typescript-eslint/parser'));
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

describe('rule crash robustness', () => {
  const visitorCounts = new Map<string, number>();
  const linter = buildLinter(visitorCounts);
  const crashes: Crash[] = [];
  const parserFatals: { snippet: string; file: string; message: string }[] = [];

  beforeAll(() => {
    for (const snippet of SNIPPETS) {
      for (const base of PATH_CONTEXTS) {
        const file = `${base}${snippet.jsx ? '.tsx' : '.ts'}`;
        const config = {
          parser: 'ts',
          parserOptions: parserOptionsFor(snippet.jsx),
          rules: allRulesConfig,
        } as any;
        try {
          const messages = linter.verify(snippet.code, config, file);
          const fatal = messages.find((m) => m.fatal);
          if (fatal) {
            parserFatals.push({ snippet: snippet.id, file, message: fatal.message });
          }
        } catch {
          // Running every rule at once means one throw hides the rest, so the
          // culprit is identified by replaying this snippet rule-by-rule.
          for (const name of RULE_NAMES) {
            const single = buildLinter();
            try {
              single.verify(
                snippet.code,
                {
                  parser: 'ts',
                  parserOptions: parserOptionsFor(snippet.jsx),
                  rules: { [`${PLUGIN}/${name}`]: 'error' },
                } as any,
                file,
              );
            } catch (e) {
              crashes.push({
                rule: name,
                snippet: snippet.id,
                file,
                message: (e as Error).message.split('\n').slice(0, 3).join(' | '),
              });
            }
          }
        }
      }
    }
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
        return `  ${rule} threw on ${cs.length} case(s) — snippets: ${snippets.join(', ')}\n    e.g. ${cs[0].file}: ${cs[0].message}`;
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

  it('actually executes the rules it claims to cover', () => {
    // Guards against a vacuous pass: if the harness stopped wiring rules up, the
    // sweep would report zero crashes while testing nothing. This is a floor
    // rather than full coverage so a new rule with a narrow trigger does not
    // fail an unrelated build.
    const executed = RULE_NAMES.filter((n) => (visitorCounts.get(n) ?? 0) > 0);
    expect(executed.length).toBeGreaterThanOrEqual(150);
  });

  it('detects a rule that throws (positive control)', () => {
    const control = new Linter();
    control.defineParser('ts', require('@typescript-eslint/parser'));
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
