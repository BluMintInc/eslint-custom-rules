import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import * as jsoncParser from 'jsonc-eslint-parser';
import { rules } from '../index';

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

const RULE_NAMES = Object.keys(rules);

type Crash = { rule: string; snippet: string; file: string; message: string };

const parserOptionsFor = (jsx?: boolean) => ({
  ecmaVersion: 2022 as const,
  sourceType: 'module' as const,
  ecmaFeatures: jsx ? { jsx: true } : {},
});

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
            parserFatals.push({
              snippet: snippet.id,
              file,
              message: fatal.message,
            });
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
                message: (e as Error).message
                  .split('\n')
                  .slice(0, 3)
                  .join(' | '),
              });
            }
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
          message: (e as Error).message.split('\n').slice(0, 3).join(' | '),
        });
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

  it('actually executes the rules it claims to cover', () => {
    // Guards against a vacuous pass: if the harness stopped wiring rules up, the
    // sweep would report zero crashes while testing nothing. The corpus, path
    // matrix and special cases together execute all of them, so the margin here
    // is headroom for new rules with narrow triggers rather than slack for
    // rules already known to be unreachable — a harness regression drops
    // coverage far below it. A new rule landing inside the margin should get a
    // corpus snippet rather than a wider margin.
    const silent = RULE_NAMES.filter((n) => (visitorCounts.get(n) ?? 0) === 0);
    const executed = RULE_NAMES.length - silent.length;
    expect(
      executed >= RULE_NAMES.length - 4
        ? ''
        : `only ${executed}/${
            RULE_NAMES.length
          } rules executed; silent: ${silent.join(', ')}`,
    ).toBe('');
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
