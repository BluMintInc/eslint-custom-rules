import fs from 'fs';
import path from 'path';
import { ESLint, Linter, Rule } from 'eslint';
import * as typescriptParser from '@typescript-eslint/parser';
import type { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertSafeObjectKey } from '../rules/enforce-assert-safe-object-key';
import { createTempFixtureDir } from '../utils/tempFixtureDir';

/**
 * The suites are named rather than passed inline so that the re-parse guard at
 * the end of this file can lint every fixture they declare. A fixer whose
 * replacement range is wrong emits text that does not parse, and a fixture diff
 * cannot see that: RuleTester compares strings (#2067).
 */
type AssertSafeTests = TSESLint.RunTests<
  'useAssertSafe',
  [{ readonly assertSafeImportPath?: string }]
>;

const IMPORT_LINE = `import { assertSafe } from 'functions/src/util/assertSafe';`;

/**
 * The message a parse of `code` fails with, or null when it parses. The fixer's
 * output has to be a program, which a fixture's string comparison never checks.
 *
 * `range` and `loc` are not decoration: without them the parser throws on
 * perfectly good code, which would read as a corrupt output everywhere below.
 */
const parseFailure = (code: string): string | null => {
  try {
    typescriptParser.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'module',
      range: true,
      loc: true,
    });
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

const buildMessage = (key: string) =>
  `Dynamic object key "${key}" is used without assertSafe() validation. Unvalidated keys can resolve to unexpected properties (including prototype fields) and make lookups fragile or unsafe. Wrap the key with assertSafe(${key}) before accessing the object.`;

const lintError = (key: string): TSESLint.TestCaseError<'useAssertSafe'> =>
  ({
    message: buildMessage(key),
  } as unknown as TSESLint.TestCaseError<'useAssertSafe'>);

const MAIN_TESTS: AssertSafeTests = {
  valid: [
    {
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value = obj[assertSafe(id)];
      `,
    },
    {
      // Direct property access (not computed) should be valid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
console.log(obj.key1);
      `,
    },
    {
      // Direct string literal in brackets should be valid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
console.log(obj['key1']);
      `,
    },
    {
      // Number index should be valid
      code: `
const arr = ['value1', 'value2'];
console.log(arr[0]);
      `,
    },
    {
      // Complex template literals with text should be valid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[\`prefix_\${id}_suffix\`]);
      `,
    },
    {
      // #1880: fixed text earns the exemption by RULING OUT a dangerous name.
      // No substitution can make a key starting `user-` be `__proto__`,
      // `constructor` or `prototype`, so the lookup cannot reach the prototype.
      name: 'a template whose prefix rules out every dangerous name stays exempt',
      code: `
const R: Record<string, number> = {};
export const f = (id: string) => R[\`user-\${id}\`];
      `,
    },
    {
      name: 'a template whose suffix rules out every dangerous name stays exempt',
      code: `
const R: Record<string, number> = {};
export const f = (id: string) => R[\`\${id}_suffix\`];
      `,
    },
    {
      // A dangerous name shares the prefix but is SHORTER than the fixed text,
      // so the template still cannot spell it.
      name: 'a template longer than the name it prefixes stays exempt',
      code: `
const R: Record<string, number> = {};
export const f = (id: string) => R[\`prototype_owner_\${id}\`];
      `,
    },
    {
      // Every substitution is provably numeric, so the template can only widen
      // into digits — and no dangerous property name is the string form of a
      // number. Same proof the identifier path already accepts.
      name: 'a numeric substitution cannot widen a reaching template into a name',
      code: `
const R: Record<string, number> = {};
export const f = (n: number) => R[\`__pro\${n}\`];
      `,
    },
    {
      // A template with no substitution produces exactly one string; it is a
      // static key like any other string literal.
      name: 'a template with no substitution is a static key',
      code: `
const R: Record<string, number> = {};
export const f = () => R[\`literal\`];
      `,
    },
    {
      // Numeric expressions should be valid
      code: `
const arr = ['value1', 'value2', 'value3'];
const index = 1;
console.log(arr[index + 1]);
      `,
    },
    {
      // Using a computed property with a complex expression
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key';
const num = 1;
console.log(obj[assertSafe(id + num)]);
      `,
    },
    {
      // Using a computed property with a conditional expression
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key';
const condition = true;
console.log(obj[assertSafe(condition ? 'key1' : 'key2')]);
      `,
    },
    {
      // Repro from issue #1245: cached assertSafe identifier used across multiple member accesses
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const keys = ['key1', 'key2'];
const userBalance = { key1: 100, key2: 200 };
const remaining = { key1: 50, key2: 75 };
const entryFee = { key1: 10, key2: 20 };
keys.map((key) => {
  const safeKey = assertSafe(key);
  const balance = userBalance[safeKey];
  const rem = remaining[safeKey];
  const fee = entryFee[safeKey];
});
      `,
    },
    {
      // let-initialized assertSafe variable is also exempt
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
let safeKey = assertSafe(rawKey);
console.log(obj[safeKey]);
      `,
    },
    {
      // assertSafe cached variable in a nested closure scope is exempt
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const data = { a: 1, b: 2 };
function process(rawKey) {
  const safeKey = assertSafe(rawKey);
  return data[safeKey];
}
      `,
    },
    {
      // Regression guard: safeKey from assertSafe used as `in` left-operand is
      // handled by the BinaryExpression visitor which never flags bare identifiers —
      // confirm it does not become a new false positive.
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
const rawKey = 'key1';
const safeKey = assertSafe(rawKey);
const exists = safeKey in obj;
      `,
    },
    {
      // Regression guard: safeKey from assertSafe in computed destructuring is
      // handled by the Property visitor which never flags bare identifiers —
      // confirm it does not become a new false positive.
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
const rawKey = 'key1';
const safeKey = assertSafe(rawKey);
const { [safeKey]: value } = obj;
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1554: prototype pollution is unreachable through a numeric
    // index, so neither an array-ish object nor a statically numeric key
    // needs assertSafe. Reported verbatim from the issue.
    // ------------------------------------------------------------------
    {
      name: 'typed-array field read through a member-expression object (issue #1554)',
      code: `
const sampleRaster = (raster, index) => {
  return raster.data[index];
};
      `,
    },
    {
      name: 'loop counter indexing an array (issue #1554)',
      code: `
const sum = (values) => {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[i];
  }
  return total;
};
      `,
    },
    {
      name: 'an array-ish field on this reads as a collection',
      code: `
class Sprite {
  constructor() {
    this.items = [];
  }

  at(index) {
    return this.items[index];
  }
}
      `,
    },
    {
      name: 'an array-ish field two levels deep reads as a collection',
      code: `
const at = (state, index) => state.buffer.list[index];
      `,
    },
    {
      name: 'an array-ish field named data reads as a collection',
      code: `
const readByte = (image, offset) => image.raw.data[offset];
      `,
    },
    {
      name: 'a post-increment loop counter is numeric',
      code: `
const totalOf = (bytes) => {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    sum += bytes[i];
  }
  return sum;
};
      `,
    },
    {
      name: 'a row-major offset built from two loop counters is numeric',
      code: `
const brighten = (pixels, width, height) => {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels[y * width + x] += 1;
    }
  }
};
      `,
    },
    {
      name: 'an RGBA channel offset is numeric',
      code: `
const fillAlpha = (out) => {
  for (let i = 0; i < 16; i += 1) {
    out[i * 4 + 3] = 255;
  }
};
      `,
    },
    {
      name: 'a Math.floor key is numeric',
      code: `
const sample = (palette, t) => palette[Math.floor(t * 255)];
      `,
    },
    {
      name: 'Number, parseInt and parseFloat keys are numeric',
      code: `
const readAll = (buffer, raw) => [
  buffer[Number(raw)],
  buffer[parseInt(raw, 10)],
  buffer[parseFloat(raw)],
];
      `,
    },
    {
      name: 'a .length key is numeric',
      code: `
const peek = (queue, stack) => queue[stack.length];
      `,
    },
    {
      name: 'a `: number` parameter is numeric on its annotation alone',
      code: `
const at = (buffer, index: number) => buffer[index];
      `,
    },
    {
      // The `: number` annotation on `index` is the whole proof: the assertion
      // is read through and asserts nothing. The unannotated spelling of this
      // very offset is an invalid case below.
      name: 'a `: number` parameter stays proven under an assertion inside an offset',
      code: `
const next = (buffer, index: number) => buffer[(index as number) + 1];
      `,
    },
    {
      // Issue #1712 FENCE, spelled with the typed receiver the report cites.
      name: 'a typed buffer offset over a `: number` parameter stays exempt',
      code: `
const next = (buffer: Uint8Array, index: number) => buffer[(index as number) + 1];
      `,
    },
    {
      name: 'a non-null assertion inside an offset is unwrapped',
      code: `
const next = (buffer, index?: number) => buffer[index! + 1];
      `,
    },
    {
      name: 'a counter advanced by ++ stays numeric',
      code: `
const drain = (buffer) => {
  let cursor = 0;
  cursor++;
  return buffer[cursor];
};
      `,
    },
    {
      name: 'an in-place increment is numeric',
      code: `
const shift = (buffer) => {
  let cursor = 0;
  return buffer[cursor++];
};
      `,
    },
    {
      name: 'bitwise and unary keys are numeric whatever the operands hold',
      code: `
const probe = (bucket, hash, mask, offset) => [
  bucket[hash & mask],
  bucket[-offset],
  bucket[~offset],
  bucket[offset >>> 1],
];
      `,
    },
    {
      name: 'a compound numeric assignment keeps the counter numeric',
      code: `
const walk = (xs, step) => {
  let i = xs.length;
  const first = xs[i];
  i -= step;
  return first;
};
      `,
    },
    {
      name: 'one counter used twice in a single key stays numeric',
      code: `
const mirror = (xs) => {
  let i = 0;
  return xs[i + i];
};
      `,
    },
    {
      name: 'a numeric const key on a plain object is numeric',
      code: `
const codes = { 0: 'a', 1: 'b' };
const idx = 1;
console.log(codes[idx]);
      `,
    },
    {
      name: 'a counter seeded from another numeric binding is numeric',
      code: `
const base = 2;
const frames = { 2: 'a' };
let cursor = base;
console.log(frames[cursor]);
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1408: inline disables. Every violation suppressed must leave
    // the file untouched — no wraps, and above all no orphan import.
    // ------------------------------------------------------------------
    {
      name: 'every violation disabled inline reports nothing',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
// eslint-disable-next-line enforce-assert-safe-object-key
const second = obj[id];
      `,
    },
    {
      name: 'whole-file block disable naming this rule suppresses everything',
      code: `
/* eslint-disable enforce-assert-safe-object-key */
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
const second = obj[id];
      `,
    },
    {
      name: 'bare block disable suppresses this rule too',
      code: `
/* eslint-disable */
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
    },
    {
      name: 'bare eslint-disable-next-line suppresses this rule',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line
const first = obj[id];
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1712: assertion and await wrappers are read through rather than
    // treated as a key of their own, so every carve-out the rule already
    // grants keeps applying to the value underneath.
    // ------------------------------------------------------------------
    {
      name: 'an asserted assertSafe call needs no second validation',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, k) => m[assertSafe(k) as string];
      `,
    },
    {
      name: 'a non-null asserted assertSafe call needs no second validation',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, k) => m[assertSafe(k)!];
      `,
    },
    {
      name: 'an assertSafe-initialised binding stays exempt under an assertion',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, rawKey) => {
  const safeKey = assertSafe(rawKey);
  return m[safeKey as string];
};
      `,
    },
    {
      name: 'a string literal under a const assertion is still a literal',
      code: `
const read = (m) => m['key1' as const];
      `,
    },
    {
      name: 'a numeric literal under an assertion is still a literal',
      code: `
const read = (arr) => arr[0 as number];
      `,
    },
    {
      name: 'a `: number` parameter is proven through an assertion',
      code: `
const at = (map, index: number) => map[index as number];
      `,
    },
    {
      name: 'a `: number` parameter is proven through an await',
      code: `
const at = async (map, index: number) => map[await index];
      `,
    },
    {
      name: 'a Math call is proven numeric through an assertion',
      code: `
const sample = (palette, t) => palette[Math.floor(t * 255) as number];
      `,
    },
    {
      name: 'an array-ish receiver keeps its carve-out under an assertion',
      code: `
const read = (items, k) => items[k as string];
      `,
    },
    {
      name: 'a complex template literal keeps its carve-out under an assertion',
      code: `
const read = (m, id) => m[\`prefix_\${id}_suffix\` as string];
      `,
    },
    {
      // A bare identifier key in destructuring is never flagged, and reading
      // through the assertion must not turn that carve-out into a report.
      name: 'a bare identifier key in computed destructuring stays exempt under an assertion',
      code: `
const read = (obj, k) => {
  const { [k as string]: value } = obj;
  return value;
};
      `,
    },
    {
      // The `in` visitor flags only String(...) and `${...}` operands, so an
      // asserted bare identifier stays exempt there as well.
      name: 'a bare identifier operand of `in` stays exempt under an assertion',
      code: `
const has = (obj, k) => (k as string) in obj;
      `,
    },
    {
      // Issue #1556: a native-ESM file spells the helper import with the
      // extension node's resolver requires. That spelling still names the
      // configured helper, so the file needs no second import and no report.
      name: 'an .mjs file importing the helper with its .js extension is satisfied',
      filename: path.join(process.cwd(), 'scripts/design/count-voice.mjs'),
      code: `
import { assertSafe } from '../../functions/src/util/assertSafe.js';
const RESULTS = {};
const name = 'voice';
RESULTS[assertSafe(name)] = 1;
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1713: the declaration site is a numeric proof of its own. A
    // binding initialized from a call has no numeric shape to read, so the
    // declared type is the only thing that can prove it — and TypeScript
    // rejects a non-numeric value under either spelling, which is the same
    // trust a `(index: number)` parameter already earns.
    // ------------------------------------------------------------------
    {
      code: 'declare function g(): number; const k: number = g(); function f(m){ return m[k]; }',
    },
    {
      code: 'declare function g(): number; const k = g() as number; function f(m){ return m[k]; }',
    },
    {
      // The spelling the agora sites cited by issue #1713 reach for: a rank
      // derived across a method boundary, declared numeric where it is bound.
      name: 'a `: number` const initialized from a method call is numeric',
      code: `
class Payouts {
  rankFor(placements, toId) {
    const rank: number = this.rankOfRecipient(toId);
    return placements[rank];
  }
}
      `,
    },
    {
      name: 'a `satisfies number` initializer is numeric',
      code: `
const at = (buffer, raw) => {
  const index = raw.offset satisfies number;
  return buffer[index];
};
      `,
    },
    {
      name: 'an angle-bracket number assertion on an initializer is numeric',
      code: `
const at = (buffer, raw) => {
  const index = <number>raw.offset;
  return buffer[index];
};
      `,
    },
    {
      // Parentheses are not nodes, so the assertion is still the initializer.
      name: 'a parenthesized number assertion on an initializer is numeric',
      code: `
const at = (buffer, compute) => {
  const index = (compute() as number);
  return buffer[index];
};
      `,
    },
    {
      // The declaration proves the initializer; the later write proves itself.
      name: 'an annotated let whose every later write is numeric stays numeric',
      code: `
const at = (buffer, compute) => {
  let index: number = compute();
  index = 3;
  return buffer[index];
};
      `,
    },
    {
      name: 'a declared numeric binding stays numeric inside an offset',
      code: `
const at = (buffer, compute) => {
  const index: number = compute();
  return buffer[index + 1];
};
      `,
    },
    {
      name: 'a declared numeric binding is numeric through an alias',
      code: `
const at = (buffer, compute) => {
  const index: number = compute();
  const cursor = index;
  return buffer[cursor];
};
      `,
    },
    {
      // Issue #1713 meets issue #1712: the assertion at the key position is
      // read through and proves nothing, and the binding underneath is what
      // carries the proof — so the key needs no validation whatever the
      // wrapper claims.
      name: 'a declared numeric binding stays numeric under an asserted key',
      code: `
const at = (buffer, compute) => {
  const index: number = compute();
  return buffer[index as any];
};
      `,
    },
    {
      name: 'a `: number` parameter default initialized from a call is numeric',
      code: `
const at = (buffer, index: number = compute()) => buffer[index];
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1830: `source?.key` parses as a ChainExpression wrapping the
    // member access, so every carve-out the rule grants has to survive that
    // wrapper too — otherwise reading through the chain turns the rule's own
    // exemptions into noise.
    // ------------------------------------------------------------------
    {
      // The false positive #1830 reports: `.length` is the numeric proof
      // whether or not the read is chained, so the counter stays exempt.
      name: 'a `.length` numeric proof survives an optional chain',
      code: `
const walk = (xs, step) => {
  let i = xs?.length;
  const first = xs[i];
  i -= step;
  return first;
};
      `,
    },
    {
      name: 'a chained `.length` used directly as a key is numeric',
      code: `
const last = (rows) => {
  const i = rows?.length;
  return rows[i];
};
      `,
    },
    {
      name: 'a Math call is proven numeric through an optional call',
      code: `
const sample = (palette, t) => palette[Math?.floor(t * 255)];
      `,
    },
    {
      // The second false positive #1830 reports: the binding still holds the
      // value assertSafe returned, so it needs no second validation.
      name: 'an assertSafe-initialised binding stays exempt under an optional call',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, rawKey) => {
  const safeKey = assertSafe?.(rawKey);
  return m[safeKey];
};
      `,
    },
    {
      name: 'an optionally-called assertSafe at the key position needs no second validation',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, k) => m[assertSafe?.(k)];
      `,
    },
    {
      // The fix's own output: reading through the chain must not make the
      // wrapped key report a second time.
      name: 'a wrapped chained key is left alone on a second pass',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, source) => m[assertSafe(source?.key)];
      `,
    },
    {
      name: 'an array-ish receiver keeps its carve-out under an optional chain',
      code: `
const read = (items, source) => items[source?.key];
      `,
    },
    {
      name: 'a complex template literal keeps its carve-out under an optional chain',
      code: `
const read = (m, id) => m[\`prefix_\${id?.raw}_suffix\`];
      `,
    },
    {
      // The destructuring visitor claims only String(...) and `${...}` keys, so
      // reading through the chain must not widen it to bare member reads.
      name: 'a chained member key in computed destructuring stays exempt',
      code: `
const read = (obj, source) => {
  const { [source?.key]: value } = obj;
  return value;
};
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1915: the declaration site that carries the `: number` proof is
    // whichever one the author wrote it on. A return-type annotation and a
    // class-field annotation spell the same `TSNumberKeyword` a declarator or
    // a parameter does, in the same file, resolvable by scope analysis alone.
    // ------------------------------------------------------------------
    {
      name: 'a `: number` return-type annotation on a method is numeric proof at the call site',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed): number {
    return seed + 1;
  }
  read(seed) {
    const rank = this.rankOf(seed);
    return this.mapping[rank];
  }
}
      `,
    },
    {
      name: 'a call to a `: number`-returning method is numeric in key position',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed): number {
    return seed + 1;
  }
  read(seed) {
    return this.mapping[this.rankOf(seed)];
  }
}
      `,
    },
    {
      name: 'a class field annotated `: number` is numeric at the use site',
      code: `
class Reader {
  private readonly rank: number = 1;
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[this.rank];
  }
}
      `,
    },
    {
      name: 'a `: number` return-type annotation on a free arrow function is numeric proof',
      code: `
const rankOf = (seed): number => {
  return seed + 1;
};
const at = (mapping, seed) => {
  const rank = rankOf(seed);
  return mapping[rank];
};
      `,
    },
    {
      name: 'an annotated local initialized from a call stays numeric (#1713)',
      code: `
const at = (mapping, seed) => {
  const rank: number = rankOf(seed);
  return mapping[rank];
};
      `,
    },
    {
      name: 'a `: number` method is numeric through a static receiver',
      code: `
class Reader {
  private static rankOf(seed): number {
    return seed + 1;
  }
  static read(mapping, seed) {
    return mapping[this.rankOf(seed)];
  }
}
      `,
    },
    {
      name: 'a `: number` static method reached by the class name is numeric',
      code: `
class Reader {
  static rankOf(seed): number {
    return seed + 1;
  }
}
const read = (mapping, seed) => mapping[Reader.rankOf(seed)];
      `,
    },
    {
      name: 'a `: number` static field reached by the class name is numeric',
      code: `
class Reader {
  static rank: number = 1;
}
const read = (mapping) => mapping[Reader.rank];
      `,
    },
    {
      name: 'a `: number` static field reached through a static `this` is numeric',
      code: `
class Reader {
  static rank: number = 1;
  static read(mapping) {
    return mapping[this.rank];
  }
}
      `,
    },
    {
      name: 'a getter returning `: number` is numeric at the read site',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private get rank(): number {
    return 1;
  }
  read() {
    return this.mapping[this.rank];
  }
}
      `,
    },
    {
      // A setter constrains writes, not reads, so pairing one with the getter
      // must not withdraw the getter's own proof.
      name: 'a getter paired with a setter keeps its numeric proof',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private get rank(): number {
    return 1;
  }
  private set rank(next) {}
  read() {
    return this.mapping[this.rank];
  }
}
      `,
    },
    {
      name: 'a `: number` constructor parameter property is numeric at the use site',
      code: `
class Reader {
  constructor(private readonly mapping, private readonly rank: number) {}
  read() {
    return this.mapping[this.rank];
  }
}
      `,
    },
    {
      name: 'a `: number`-returning arrow class field is numeric at the call site',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private rankOf = (seed): number => seed + 1;
  read(seed) {
    return this.mapping[this.rankOf(seed)];
  }
}
      `,
    },
    {
      // `this.rankOf?.(seed)` parses as a ChainExpression around the call, so
      // the callee resolution has to survive the optional spelling.
      name: 'an optionally-called `: number` method keeps its proof',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed): number {
    return seed;
  }
  read(seed) {
    return this.mapping[this.rankOf?.(seed)];
  }
}
      `,
    },
    {
      name: 'an optionally-read `: number` field keeps its proof',
      code: `
class Reader {
  private readonly rank: number = 1;
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[this?.rank];
  }
}
      `,
    },
    {
      // An arrow keeps the enclosing `this`, so a field initializer resolves
      // against the class it is written in.
      name: 'a `: number` field is numeric inside an arrow class field',
      code: `
class Reader {
  private readonly rank: number = 1;
  constructor(private readonly mapping) {}
  read = () => this.mapping[this.rank];
}
      `,
    },
    {
      name: 'a `: number` function declaration is numeric at the call site',
      code: `
function rankOf(seed): number {
  return seed;
}
const read = (mapping, seed) => mapping[rankOf(seed)];
      `,
    },
    {
      name: 'a `: number` ambient function declaration is numeric at the call site',
      code: `
declare function rankOf(seed): number;
const read = (mapping, seed) => mapping[rankOf(seed)];
      `,
    },
    {
      name: 'a `: number` field stays numeric inside an offset',
      code: `
class Reader {
  private readonly rank: number = 1;
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[this.rank + 1];
  }
}
      `,
    },
    {
      name: 'a `: number` abstract method is numeric at the call site',
      code: `
abstract class Reader {
  constructor(protected readonly mapping) {}
  protected abstract rankOf(seed): number;
  read(seed) {
    return this.mapping[this.rankOf(seed)];
  }
}
      `,
    },
    {
      // The annotation is the proof at every declaration site, and an assertion
      // inside the body is exactly what `const k: number = raw as unknown as
      // number` already carries past the same check. Crediting one spelling and
      // not the other would rebuild the asymmetry #1915 reports.
      name: 'a laundering assertion inside a `: number` body leaves the annotation standing',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(raw): number {
    return raw as unknown as number;
  }
  read(raw) {
    return this.mapping[this.rankOf(raw)];
  }
}
      `,
    },
    // ------------------------------------------------------------------
    // Issue #2152: a TypeScript wrapper on an `assertSafe(...)` initializer
    // erases before the code runs, so the binding still holds the validated
    // key. The index-site arm already reads through those wrappers; these pin
    // the binding arm to the same answer. The cast is not stylistic in the
    // reported code: `Object.keys` widens to `string` while the map is keyed
    // by a branded type, so it is the shape this rule's own remedy produces.
    // ------------------------------------------------------------------
    {
      name: 'an `as` assertion on the assertSafe initializer keeps the binding validated (issue #2152)',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const target: Record<TokenEncoded, string>;
export const read = (key: string) => {
  const safeKey = assertSafe(key) as TokenEncoded;
  return target[safeKey] ?? '0';
};
      `,
    },
    {
      name: 'a `satisfies` assertion on the assertSafe initializer keeps the binding validated (issue #2152)',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const target: Record<string, string>;
export const read = (key: string) => {
  const safeKey = assertSafe(key) satisfies string;
  return target[safeKey];
};
      `,
    },
    {
      name: 'a non-null assertion on the assertSafe initializer keeps the binding validated (issue #2152)',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const target: Record<string, string>;
export const read = (key: string) => {
  const safeKey = assertSafe(key)!;
  return target[safeKey];
};
      `,
    },
    {
      name: 'an angle-bracket assertion on the assertSafe initializer keeps the binding validated (issue #2152)',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const target: Record<TokenEncoded, string>;
export const read = (key: string) => {
  const safeKey = <TokenEncoded>assertSafe(key);
  return target[safeKey];
};
      `,
    },
    {
      name: 'an assertion over an optionally-called assertSafe keeps the binding validated (issue #2152)',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const target: Record<TokenEncoded, string>;
export const read = (key: string) => {
  const safeKey = assertSafe?.(key) as TokenEncoded;
  return target[safeKey];
};
      `,
    },
    {
      name: 'nested assertions in either order keep the binding validated (issue #2152)',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const target: Record<TokenEncoded, string>;
export const read = (key: string) => {
  const safeKey = (assertSafe(key) as TokenEncoded)!;
  const other = <TokenEncoded>(assertSafe(key) satisfies string);
  return [target[safeKey], target[other]];
};
      `,
    },
    {
      // `await` on assertSafe's synchronous return resolves to the very value
      // it validated, so the binding holds the validated key exactly as the
      // unawaited spelling does; the index arm already exempts
      // `m[await assertSafe(k)]` and the two arms must not disagree.
      name: 'an awaited assertSafe initializer keeps the binding validated (issue #2152)',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const target: Record<string, string>;
export const read = async (key: string) => {
  const safeKey = await assertSafe(key);
  return target[safeKey];
};
      `,
    },
  ],
  invalid: [
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(String(id))]);
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[\`\${id}\`]);
      `,
      errors: [lintError('`${id}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(\`\${id}\`)]);
      `,
    },
    {
      // #1880: fixed text does NOT by itself rule a dangerous name out. With
      // `x` = 'to__' this key is `__proto__`, which resolves to
      // Object.prototype at runtime. The whole template is the key, so the
      // whole template is what gets wrapped.
      name: 'a template that can still spell __proto__ is reported',
      code: `
const R: Record<string, number> = {};
export const f = (x: string) => R[\`__pro\${x}\`];
      `,
      errors: [lintError('`__pro${x}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const R: Record<string, number> = {};
export const f = (x: string) => R[assertSafe(\`__pro\${x}\`)];
      `,
    },
    {
      name: 'a template that can still spell __proto__ through its suffix is reported',
      code: `
const R: Record<string, number> = {};
export const f = (x: string) => R[\`\${x}proto__\`];
      `,
      errors: [lintError('`${x}proto__`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const R: Record<string, number> = {};
export const f = (x: string) => R[assertSafe(\`\${x}proto__\`)];
      `,
    },
    {
      // The substitution sits BETWEEN two fixed halves of the dangerous name.
      name: 'a template bracketing a dangerous name is reported',
      code: `
const R: Record<string, number> = {};
export const f = (x: string) => R[\`__\${x}__\`];
      `,
      errors: [lintError('`__${x}__`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const R: Record<string, number> = {};
export const f = (x: string) => R[assertSafe(\`__\${x}__\`)];
      `,
    },
    {
      name: 'a template that can still spell constructor is reported',
      code: `
const R: Record<string, number> = {};
export const f = (x: string) => R[\`cons\${x}\`];
      `,
      errors: [lintError('`cons${x}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const R: Record<string, number> = {};
export const f = (x: string) => R[assertSafe(\`cons\${x}\`)];
      `,
    },
    {
      // Prototype POLLUTION rather than mere reach: the write is the shape that
      // actually corrupts the prototype.
      name: 'a reaching template on the left of an assignment is reported',
      code: `
const R: Record<string, number> = {};
export const f = (x: string) => { R[\`__pro\${x}\`] = 1; };
      `,
      errors: [lintError('`__pro${x}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const R: Record<string, number> = {};
export const f = (x: string) => { R[assertSafe(\`__pro\${x}\`)] = 1; };
      `,
    },
    {
      // Two substitutions, both unbounded: the interior quasi must still be
      // matched in order for the name to be producible.
      name: 'a multi-substitution template that can spell prototype is reported',
      code: `
const R: Record<string, number> = {};
export const f = (a: string, b: string) => R[\`pro\${a}ty\${b}\`];
      `,
      errors: [lintError('`pro${a}ty${b}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const R: Record<string, number> = {};
export const f = (a: string, b: string) => R[assertSafe(\`pro\${a}ty\${b}\`)];
      `,
    },
    {
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(String(id))]);
      `,
    },
    {
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[\`\${id}\`]);
      `,
      errors: [lintError('`${id}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(\`\${id}\`)]);
      `,
    },
    {
      code: `
import something from 'other-module';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value = obj[String(id)];
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
import something from 'other-module';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value = obj[assertSafe(String(id))];
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value1 = obj[String(id)];
const value2 = obj[\`\${id}\`];
      `,
      errors: [lintError('String(id)'), lintError('`${id}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value1 = obj[assertSafe(String(id))];
const value2 = obj[assertSafe(\`\${id}\`)];
      `,
    },
    // Additional test cases
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
function process(id) {
  return obj[String(id)];
}
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
function process(id) {
  return obj[assertSafe(String(id))];
}
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const nested = { obj };
console.log(nested.obj[String(id)]);
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const nested = { obj };
console.log(nested.obj[assertSafe(String(id))]);
      `,
    },
    {
      code: `
const data = { users: { user1: { name: 'John' } } };
const userId = 'user1';
console.log(data.users[String(userId)].name);
      `,
      errors: [lintError('String(userId)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const data = { users: { user1: { name: 'John' } } };
const userId = 'user1';
console.log(data.users[assertSafe(String(userId))].name);
      `,
    },
    {
      code: `
class DataStore {
  constructor() {
    this.data = { key1: 'value1' };
  }

  getValue(id) {
    return this.data[String(id)];
  }
}
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class DataStore {
  constructor() {
    this.data = { key1: 'value1' };
  }

  getValue(id) {
    return this.data[assertSafe(String(id))];
  }
}
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const prop = \`\${id}\`;
console.log(obj[prop]);
      `,
      errors: [lintError('prop')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const prop = \`\${id}\`;
console.log(obj[assertSafe(prop)]);
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
obj[String(id)] = 'new value';
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
obj[assertSafe(String(id))] = 'new value';
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
delete obj[String(id)];
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
delete obj[assertSafe(String(id))];
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const hasKey = String(id) in obj;
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const hasKey = assertSafe(String(id)) in obj;
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const { [String(id)]: value } = obj;
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const { [assertSafe(String(id))]: value } = obj;
      `,
    },
    {
      // The example from the issue description
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]); // Redundant string conversion
console.log(obj[\`\${id}\`]); // Unnecessary template literal usage
      `,
      errors: [lintError('String(id)'), lintError('`${id}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(String(id))]); // Redundant string conversion
console.log(obj[assertSafe(\`\${id}\`)]); // Unnecessary template literal usage
      `,
    },
    {
      // Object property access with a variable directly should be invalid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[id]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      // Boolean expressions should be invalid
      code: `
const obj = { true: 'value1', false: 'value2' };
const condition = true;
console.log(obj[condition]);
      `,
      errors: [lintError('condition')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { true: 'value1', false: 'value2' };
const condition = true;
console.log(obj[assertSafe(condition)]);
      `,
    },
    {
      // Function calls other than String() should be invalid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const getId = () => 'key1';
console.log(obj[getId()]);
      `,
      errors: [lintError('getId()')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const getId = () => 'key1';
console.log(obj[assertSafe(getId())]);
      `,
    },
    {
      // Plain alias (const k = rawKey) is NOT assertSafe-validated and must be flagged
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = rawKey;
console.log(obj[k]);
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = rawKey;
console.log(obj[assertSafe(k)]);
      `,
    },
    {
      // Variable initialized from a non-assertSafe call must still be flagged
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = sanitize(rawKey);
console.log(obj[k]);
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = sanitize(rawKey);
console.log(obj[assertSafe(k)]);
      `,
    },
    {
      // Similar-but-different callee name (assertUnsafe) must still be flagged
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = assertUnsafe(rawKey);
console.log(obj[k]);
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = assertUnsafe(rawKey);
console.log(obj[assertSafe(k)]);
      `,
    },
    {
      // Shadowing: inner const safeKey = rawKey shadows the outer assertSafe
      // safeKey — the inner binding is NOT from assertSafe and must be flagged.
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const safeKey = assertSafe(rawKey);
function inner() {
  const safeKey = rawKey;
  return obj[safeKey];
}
      `,
      errors: [lintError('safeKey')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const safeKey = assertSafe(rawKey);
function inner() {
  const safeKey = rawKey;
  return obj[assertSafe(safeKey)];
}
      `,
    },
    {
      // Repro from issue #1321: the injected import specifier must be computed
      // relative to the fixed file (deeply nested under functions/src/util),
      // not the bare repo-root path which is unresolvable inside functions/.
      filename: path.join(
        process.cwd(),
        'functions/src/util/notifications/util/builders/SomeBuilder.ts',
      ),
      code: `
const NOTIFICATION_TITLES: Record<string, string> = {};
export function lookup(key: string): string { return NOTIFICATION_TITLES[key]; }
      `,
      errors: [lintError('key')],
      output: `
import { assertSafe } from '../../../assertSafe';
const NOTIFICATION_TITLES: Record<string, string> = {};
export function lookup(key: string): string { return NOTIFICATION_TITLES[assertSafe(key)]; }
      `,
    },
    {
      // Two levels below functions/src/util resolves to '../../assertSafe'.
      filename: path.join(process.cwd(), 'functions/src/util/a/b/fixture.ts'),
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[id]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from '../../assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      // A sibling of assertSafe inside functions/src/util must get the './'
      // prefix, never a bare 'assertSafe' specifier.
      filename: path.join(process.cwd(), 'functions/src/util/foo.ts'),
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[id]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from './assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      // A file in a sibling directory resolves upward into util.
      filename: path.join(process.cwd(), 'functions/src/other/bar.ts'),
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[id]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from '../util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      // The assertSafeImportPath option is also anchored at the repo root, so
      // the relative computation honors a custom target location.
      filename: path.join(process.cwd(), 'functions/src/util/thing.ts'),
      options: [{ assertSafeImportPath: 'functions/src/shared/assertSafe' }],
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[id]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from '../shared/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      // Backward compat: with no filename set (RuleTester default 'file.ts' is
      // non-absolute), the configured repo-root path is emitted verbatim.
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[id]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1554: the numeric carve-out is proof-based. A key the syntax
    // leaves unproven — an unwritten binding, a value from outside, a `+`
    // that may concatenate — still names a property and still reports.
    // ------------------------------------------------------------------
    {
      name: 'an uninitialised binding is not numeric',
      code: `
const obj = { key1: 'value1' };
let k;
console.log(obj[k]);
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
let k;
console.log(obj[assertSafe(k)]);
      `,
    },
    {
      name: 'a counter reassigned from outside input is not numeric',
      code: `
const obj = { key1: 'value1' };
let n = 0;
n = userInput;
console.log(obj[n]);
      `,
      errors: [lintError('n')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
let n = 0;
n = userInput;
console.log(obj[assertSafe(n)]);
      `,
    },
    {
      name: 'a `+` over unknown operands may concatenate strings',
      code: `
const obj = { ab: 'value1' };
console.log(obj[a + b]);
      `,
      errors: [lintError('a + b')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { ab: 'value1' };
console.log(obj[assertSafe(a + b)]);
      `,
    },
    {
      name: 'a boolean-initialised binding is not numeric',
      code: `
const obj = { true: 'value1', false: 'value2' };
const flag = false;
console.log(obj[flag]);
      `,
      errors: [lintError('flag')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { true: 'value1', false: 'value2' };
const flag = false;
console.log(obj[assertSafe(flag)]);
      `,
    },
    {
      name: 'a string-initialised binding is not numeric',
      code: `
const obj = { key1: 'value1' };
const name = 'key1';
console.log(obj[name]);
      `,
      errors: [lintError('name')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
const name = 'key1';
console.log(obj[assertSafe(name)]);
      `,
    },
    {
      name: 'String(...) is reported even when its argument is numeric',
      code: `
const obj = { 0: 'value1' };
const idx = 0;
console.log(obj[String(idx)]);
      `,
      errors: [lintError('String(idx)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { 0: 'value1' };
const idx = 0;
console.log(obj[assertSafe(String(idx))]);
      `,
    },
    {
      name: 'mutually referring bindings terminate without proving numeric',
      code: `
const obj = { key1: 'value1' };
let a = b;
let b = a;
console.log(obj[a]);
      `,
      errors: [lintError('a')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
let a = b;
let b = a;
console.log(obj[assertSafe(a)]);
      `,
    },
    {
      name: 'an unannotated parameter key is still reported',
      code: `
const read = (map, index) => map[index];
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (map, index) => map[assertSafe(index)];
      `,
    },
    {
      name: 'a `: string` parameter key is still reported',
      code: `
const read = (map, key: string) => map[key];
      `,
      errors: [lintError('key')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (map, key: string) => map[assertSafe(key)];
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1713 FENCE: only the `number` keyword at the declaration site
    // proves anything, and it proves it of the initializer alone. A type that
    // admits a string, an assertion naming another type, and every write that
    // is not the initializer all keep reporting.
    // ------------------------------------------------------------------
    {
      name: 'an `as any` initializer proves nothing',
      code: `
const at = (buffer, raw) => {
  const index = raw as any;
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, raw) => {
  const index = raw as any;
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      name: 'an `as unknown` initializer proves nothing',
      code: `
const at = (buffer, raw) => {
  const index = raw as unknown;
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, raw) => {
  const index = raw as unknown;
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      // The declaration-site proof is worth trusting only because TypeScript
      // checks it, and a step through `unknown` is precisely how an author
      // switches that check off — `raw as unknown as number` compiles for a
      // `raw` holding '__proto__'. Trusting it would hand the rule's own
      // subject a one-token bypass.
      name: 'a double assertion through unknown proves nothing',
      code: `
const at = (buffer, raw) => {
  const index = raw as unknown as number;
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, raw) => {
  const index = raw as unknown as number;
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      name: 'a double assertion through any proves nothing',
      code: `
const at = (buffer, raw) => {
  const index = raw as any as number;
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, raw) => {
  const index = raw as any as number;
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      name: 'an `as string` initializer proves nothing',
      code: `
const at = (buffer, raw) => {
  const index = raw as string;
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, raw) => {
  const index = raw as string;
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      // `as const` narrows to whatever the operand already was, which for a
      // call is unknowable from the syntax.
      name: 'an `as const` initializer proves nothing',
      code: `
const at = (buffer, compute) => {
  const index = compute() as const;
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, compute) => {
  const index = compute() as const;
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      name: 'a `number | string` annotation admits a string key',
      code: `
const at = (buffer, compute) => {
  const index: number | string = compute();
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, compute) => {
  const index: number | string = compute();
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      name: 'an `: any` annotation admits a string key',
      code: `
const at = (buffer, compute) => {
  const index: any = compute();
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, compute) => {
  const index: any = compute();
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      // A generic naming `number` inside it is not the `number` keyword.
      name: 'a generic annotation over number proves nothing',
      code: `
const at = (buffer, compute) => {
  const index: Wrapped<number> = compute();
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, compute) => {
  const index: Wrapped<number> = compute();
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      // The annotation covers the initializer; a later assignment is a
      // separate statement and proves itself or nothing.
      name: 'an annotated let reassigned from outside input is not numeric',
      code: `
const at = (buffer, compute) => {
  let index: number = compute();
  index = userInput;
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, compute) => {
  let index: number = compute();
  index = userInput;
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      // A thrown value is typed `any` under the default compiler settings, so
      // the annotation stops TypeScript from checking this write at all.
      name: 'an annotated let written from a catch binding is not numeric',
      code: `
const at = (buffer, compute) => {
  let index: number = compute();
  try {
    compute();
  } catch (error) {
    index = error;
  }
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, compute) => {
  let index: number = compute();
  try {
    compute();
  } catch (error) {
    index = error;
  }
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      name: 'an asserted initializer reassigned from outside input is not numeric',
      code: `
const at = (buffer, compute) => {
  let index = compute() as number;
  index = userInput;
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, compute) => {
  let index = compute() as number;
  index = userInput;
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      // A for-of write expression is the iterated value, not an initializer,
      // so the annotation's proof does not reach it.
      name: 'an annotated let rebound by for-of is not numeric',
      code: `
const at = (buffer, keys) => {
  let index: number = 0;
  for (index of keys) {
    return buffer[index];
  }
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, keys) => {
  let index: number = 0;
  for (index of keys) {
    return buffer[assertSafe(index)];
  }
};
      `,
    },
    {
      // The annotation sits on the pattern, not on the element bound out of
      // it, so it says nothing about the element.
      name: 'a destructured element under a numeric pattern annotation is not numeric',
      code: `
const at = (buffer, source) => {
  const { index }: { index: number } = source;
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, source) => {
  const { index }: { index: number } = source;
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      // The assertion describes the container the pattern takes apart.
      name: 'a destructured element out of a number-asserted initializer is not numeric',
      code: `
const at = (buffer, source) => {
  const { index } = source as number;
  return buffer[index];
};
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, source) => {
  const { index } = source as number;
  return buffer[assertSafe(index)];
};
      `,
    },
    {
      name: 'a redeclaration dropping the annotation is not numeric',
      code: `
function at(buffer, compute) {
  var index: number = compute();
  var index = 'key1';
  return buffer[index];
}
      `,
      errors: [lintError('index')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
function at(buffer, compute) {
  var index: number = compute();
  var index = 'key1';
  return buffer[assertSafe(index)];
}
      `,
    },
    {
      // Issue #1713 meets issue #1712 from the other side: an assertion at the
      // key position never launders an unproven binding, whatever it names.
      name: 'an unproven binding stays reported under a number-asserted key',
      code: `
const at = (buffer, compute) => {
  const index = compute();
  return buffer[index as number];
};
      `,
      errors: [lintError('index as number')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, compute) => {
  const index = compute();
  return buffer[assertSafe(index as number)];
};
      `,
    },
    {
      name: 'an array-ish field still reports a String(...) key',
      code: `
class DataStore {
  getValue(id) {
    return this.data[String(id)];
  }
}
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class DataStore {
  getValue(id) {
    return this.data[assertSafe(String(id))];
  }
}
      `,
    },
    {
      name: 'a computed member object gains no array-ish name',
      code: `
const readCell = (grid, key) => grid[0][key];
      `,
      errors: [lintError('key')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const readCell = (grid, key) => grid[0][assertSafe(key)];
      `,
    },
    {
      name: 'a field whose name is not array-ish is still a record',
      code: `
const read = (table, key) => table.rows[key];
      `,
      errors: [lintError('key')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (table, key) => table.rows[assertSafe(key)];
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1408: the assertSafe import rides on a single violation's fix,
    // so that violation is the file's import carrier. A suppressed carrier
    // used to take the import down with it while surviving violations were
    // still rewritten to assertSafe(...), leaving the call unbound.
    // ------------------------------------------------------------------
    {
      name: 'disable on the FIRST violation still lands the import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[assertSafe(id)];
      `,
    },
    {
      name: 'disable on the FIRST of three violations lands exactly one import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[String(id)];
const third = obj[\`\${id}\`];
      `,
      errors: [lintError('String(id)'), lintError('`${id}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[assertSafe(String(id))];
const third = obj[assertSafe(\`\${id}\`)];
      `,
    },
    {
      name: 'disable on a MIDDLE violation keeps one import and both survivors',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
// eslint-disable-next-line enforce-assert-safe-object-key
const second = obj[id];
const third = obj[id];
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
// eslint-disable-next-line enforce-assert-safe-object-key
const second = obj[id];
const third = obj[assertSafe(id)];
      `,
    },
    {
      name: 'disable on the LAST violation keeps one import and both survivors',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
const second = obj[id];
// eslint-disable-next-line enforce-assert-safe-object-key
const third = obj[id];
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
const second = obj[assertSafe(id)];
// eslint-disable-next-line enforce-assert-safe-object-key
const third = obj[id];
      `,
    },
    {
      name: 'bare disable on the FIRST violation still lands the import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line
const first = obj[id];
const second = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line
const first = obj[id];
const second = obj[assertSafe(id)];
      `,
    },
    {
      name: 'a disable naming a DIFFERENT rule does not suppress this one',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line no-console
const first = obj[id];
const second = obj[id];
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line no-console
const first = obj[assertSafe(id)];
const second = obj[assertSafe(id)];
      `,
    },
    {
      name: 'a block disable ended before the last violation still lands the import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
/* eslint-disable enforce-assert-safe-object-key */
const first = obj[id];
const second = obj[id];
/* eslint-enable enforce-assert-safe-object-key */
const third = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
/* eslint-disable enforce-assert-safe-object-key */
const first = obj[id];
const second = obj[id];
/* eslint-enable enforce-assert-safe-object-key */
const third = obj[assertSafe(id)];
      `,
    },
    {
      name: 'a file already importing assertSafe never gains a duplicate import',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[assertSafe(id)];
      `,
    },
    {
      name: 'suppressing the carrier in a destructuring/`in` mix still lands the import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const { [String(id)]: first } = obj;
const exists = String(id) in obj;
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const { [String(id)]: first } = obj;
const exists = assertSafe(String(id)) in obj;
      `,
    },
    {
      name: 'the injected relative specifier is unaffected by a suppressed carrier',
      filename: path.join(process.cwd(), 'functions/src/util/a/b/fixture.ts'),
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from '../../assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[assertSafe(id)];
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1422: the fix inserts an import that binds `assertSafe`, so an
    // existing binding of that name makes the edit wrong twice over — a
    // module-scope declaration collides with the import (TS2440/TS2300), and
    // a shadow at the fix site captures the emitted call with no compile
    // error at all. The report stands; only the edit is withheld.
    // ------------------------------------------------------------------
    {
      name: 'a module-scope const named assertSafe withholds the fix',
      code: `
const assertSafe = (key: string) => key;
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a function declaration named assertSafe withholds the fix',
      code: `
function assertSafe(key: string) { return key; }
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[String(id)];
      `,
      errors: [lintError('String(id)')],
      output: null,
    },
    {
      name: 'a class declaration named assertSafe withholds the fix',
      code: `
class assertSafe {}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[\`\${id}\`];
      `,
      errors: [lintError('`${id}`')],
      output: null,
    },
    {
      name: 'a named assertSafe import from another module withholds the fix',
      code: `
import { assertSafe } from 'functions/src/util/legacyAssertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a namespace import named assertSafe withholds the fix',
      code: `
import * as assertSafe from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a default import named assertSafe withholds the fix',
      code: `
import assertSafe from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a type-only assertSafe import withholds the fix',
      code: `
import type { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a shadowing parameter named assertSafe withholds the fix at that site',
      code: `
const obj = { alpha: 1, beta: 2 };
function lookup(assertSafe, id) {
  return obj[id];
}
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a block-scoped assertSafe binding withholds the fix at that site',
      code: `
const obj = { alpha: 1, beta: 2 };
function lookup(id) {
  const assertSafe = (key) => key;
  return obj[id];
}
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a shadowed site declines while an unshadowed site still carries the import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
function shadowed(assertSafe) {
  return obj[id];
}
const outer = obj[id];
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
function shadowed(assertSafe) {
  return obj[id];
}
const outer = obj[assertSafe(id)];
      `,
    },
    {
      name: 'an equivalent relative spelling of the helper import is reused',
      filename: path.join(process.cwd(), 'functions/src/util/a/b/fixture.ts'),
      code: `
import { assertSafe } from '../../../util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from '../../../util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
      `,
    },
    {
      name: 'the repo-root spelling of the helper import is reused under an absolute filename',
      filename: path.join(process.cwd(), 'functions/src/util/a/b/fixture.ts'),
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
      `,
    },
    {
      name: 'an aliased helper import leaves the name free, so the import is added',
      code: `
import { assertSafe as ensureSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
import { assertSafe as ensureSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
      `,
    },
    {
      name: 'a similarly named binding does not withhold the fix',
      code: `
const assertSafeKey = (key: string) => key;
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const assertSafeKey = (key: string) => key;
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
      `,
    },
    {
      name: 'the ordinary no-collision fix is byte-identical under the binding guard',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
const second = obj[String(id)];
const third = obj[\`\${id}\`];
      `,
      errors: [lintError('id'), lintError('String(id)'), lintError('`${id}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
const second = obj[assertSafe(String(id))];
const third = obj[assertSafe(\`\${id}\`)];
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1556: a native-ESM consumer needs the extension on the
    // injected specifier, or node throws ERR_MODULE_NOT_FOUND at startup.
    // ------------------------------------------------------------------
    {
      name: 'an .mjs file gets a .js extension on the injected specifier',
      filename: path.join(process.cwd(), 'scripts/design/count-voice.mjs'),
      code: `
const SOURCES = { voice: ['a'], text: ['b'] };
const RESULTS = {};
for (const [name, dirs] of Object.entries(SOURCES)) {
  RESULTS[name] = dirs.length;
}
      `,
      errors: [lintError('name')],
      output: `
import { assertSafe } from '../../functions/src/util/assertSafe.js';
const SOURCES = { voice: ['a'], text: ['b'] };
const RESULTS = {};
for (const [name, dirs] of Object.entries(SOURCES)) {
  RESULTS[assertSafe(name)] = dirs.length;
}
      `,
    },
    {
      // The extension-carrying spelling already reaches the helper, so the fix
      // wraps the unguarded key and adds nothing.
      name: 'an .mjs file already importing the helper gains no second import',
      filename: path.join(process.cwd(), 'scripts/design/count-voice.mjs'),
      code: `
import { assertSafe } from '../../functions/src/util/assertSafe.js';
const RESULTS = {};
const first = 'voice';
const second = 'text';
RESULTS[assertSafe(first)] = 1;
RESULTS[second] = 2;
      `,
      errors: [lintError('second')],
      output: `
import { assertSafe } from '../../functions/src/util/assertSafe.js';
const RESULTS = {};
const first = 'voice';
const second = 'text';
RESULTS[assertSafe(first)] = 1;
RESULTS[assertSafe(second)] = 2;
      `,
    },
    {
      // `.cjs` is CommonJS whatever the nearest manifest says, and CommonJS
      // resolves an extensionless specifier.
      name: 'a .cjs file keeps the extensionless specifier',
      filename: path.join(process.cwd(), 'scripts/design/count-voice.cjs'),
      code: `
const RESULTS = {};
const name = 'voice';
RESULTS[name] = 1;
      `,
      errors: [lintError('name')],
      output: `
import { assertSafe } from '../../functions/src/util/assertSafe';
const RESULTS = {};
const name = 'voice';
RESULTS[assertSafe(name)] = 1;
      `,
    },
    {
      // `.mts` is ESM, but it is TypeScript: the compiler resolves the
      // extensionless specifier, so the emitted import is left alone.
      name: 'an .mts file keeps the extensionless specifier',
      filename: path.join(process.cwd(), 'scripts/design/count-voice.mts'),
      code: `
const RESULTS: Record<string, number> = {};
const name = 'voice';
RESULTS[name] = 1;
      `,
      errors: [lintError('name')],
      output: `
import { assertSafe } from '../../functions/src/util/assertSafe';
const RESULTS: Record<string, number> = {};
const name = 'voice';
RESULTS[assertSafe(name)] = 1;
      `,
    },
    {
      // A `.js` file defers to the nearest package.json. This repo's manifest
      // declares no `type`, which is CommonJS, so the specifier stays bare —
      // the same walk the temp-tree cases below exercise against both answers.
      name: 'a .js file under a manifest without a type field keeps the extensionless specifier',
      filename: path.join(process.cwd(), 'scripts/design/count-voice.js'),
      code: `
const RESULTS = {};
const name = 'voice';
RESULTS[name] = 1;
      `,
      errors: [lintError('name')],
      output: `
import { assertSafe } from '../../functions/src/util/assertSafe';
const RESULTS = {};
const name = 'voice';
RESULTS[assertSafe(name)] = 1;
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1648: a file with no import to anchor to must still keep its
    // prologue intact. A directive that stops being the first statement
    // stops being a directive, and a shebang that leaves character 0 stops
    // parsing, so the injected import belongs below both.
    // ------------------------------------------------------------------
    {
      name: "a 'use client' directive stays ahead of the injected import",
      code: `'use client';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
`,
      errors: [lintError('String(id)')],
      output: `'use client';
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(String(id))]);
`,
    },
    {
      name: 'a shebang stays at character 0 ahead of the injected import',
      code: `#!/usr/bin/env node
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
`,
      errors: [lintError('String(id)')],
      output: `#!/usr/bin/env node
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(String(id))]);
`,
    },
    {
      name: 'a @ts-nocheck header keeps covering the code below the injected import',
      code: `// @ts-nocheck
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
`,
      errors: [lintError('String(id)')],
      output: `// @ts-nocheck
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(String(id))]);
`,
    },
    {
      // The control for the three prologue cases: with an import present the
      // anchor is that import, so a fix that simply stopped anchoring would
      // fail here rather than pass everything.
      name: 'an existing import anchors the injected one below the directive',
      code: `'use client';
import something from 'other-module';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)], something);
`,
      errors: [lintError('String(id)')],
      output: `'use client';
import { assertSafe } from 'functions/src/util/assertSafe';
import something from 'other-module';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(String(id))], something);
`,
    },
    // ------------------------------------------------------------------
    // Issue #1659: a jest registrar's module factory is hoisted above the
    // file's imports, and babel-plugin-jest-hoist rejects a factory that
    // reads an out-of-scope binding whose name does not begin with `mock`.
    // An injected `import { assertSafe }` is unreachable from inside one, so
    // the fix declines there while the report stands.
    // ------------------------------------------------------------------
    {
      // A jest.mock factory is hoisted above the imports, so it cannot reference an
      // out-of-scope `assertSafe`. The report stands; the fix must decline.
      code: `
let mockChips: unknown[] = [];
jest.mock('./useThing', () => {
  return { useThing: () => [0, 1].map((i) => ({ Chip: mockChips[i] })) };
});
`,
      output: null,
      errors: [{ messageId: 'useAssertSafe' }],
    },
    {
      name: 'a jest.doMock factory withholds the fix',
      code: `
let mockChips: unknown[] = [];
jest.doMock('./useThing', () => {
  return { useThing: (i) => mockChips[i] };
});
      `,
      errors: [lintError('i')],
      output: null,
    },
    {
      name: 'a jest.setMock factory withholds the fix',
      code: `
let mockChips: unknown[] = [];
jest.setMock('./useThing', () => {
  return { useThing: (i) => mockChips[i] };
});
      `,
      errors: [lintError('i')],
      output: null,
    },
    {
      // The control for the decline: the same violation outside any factory
      // still gains the import and the wrap.
      name: 'a violation outside every mock factory fixes normally',
      code: `
let mockChips: unknown[] = [];
jest.mock('./useThing', () => ({ useThing: () => [] }));
const read = (i) => mockChips[i];
      `,
      errors: [lintError('i')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
let mockChips: unknown[] = [];
jest.mock('./useThing', () => ({ useThing: () => [] }));
const read = (i) => mockChips[assertSafe(i)];
      `,
    },
    {
      name: 'a declining mock-factory violation passes the import carrier on',
      code: `
const obj = { alpha: 1, beta: 2 };
let mockChips: unknown[] = [];
jest.mock('./useThing', () => {
  return { useThing: (i) => mockChips[i] };
});
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('i'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
let mockChips: unknown[] = [];
jest.mock('./useThing', () => {
  return { useThing: (i) => mockChips[i] };
});
const id = 'alpha';
const first = obj[assertSafe(id)];
      `,
    },
    {
      // The module specifier is evaluated in place rather than hoisted with
      // the factory, so a key there keeps its access to the file's imports.
      name: 'a computed key in the mock specifier position fixes normally',
      code: `
const paths = { alpha: './alpha' };
const id = 'alpha';
jest.mock(paths[id], () => ({}));
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const paths = { alpha: './alpha' };
const id = 'alpha';
jest.mock(paths[assertSafe(id)], () => ({}));
      `,
    },
    {
      // `jest.fn` is not a registrar: its callback is never hoisted, so a
      // violation inside it fixes like any other.
      name: 'a factory-shaped callback outside a registrar fixes normally',
      code: `
let mockChips: unknown[] = [];
const spy = jest.fn((i) => mockChips[i]);
      `,
      errors: [lintError('i')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
let mockChips: unknown[] = [];
const spy = jest.fn((i) => mockChips[assertSafe(i)]);
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1712: an assertion or an await around a computed key erases at
    // run time, so what the wrapper holds is what names the property —
    // `__proto__` and `constructor` included. The key is classified through
    // the wrapper, and the fix wraps the written form so the assertion the
    // author put there survives the rewrite.
    // ------------------------------------------------------------------
    // invalid — assertion wrappers must be unwrapped, not dropped
    {
      code: 'function f(m,k){ return m[k as string]; }',
      errors: [{ messageId: 'useAssertSafe' }],
      output: `import { assertSafe } from 'functions/src/util/assertSafe';
function f(m,k){ return m[assertSafe(k as string)]; }`,
    },
    {
      code: 'function f(m,k){ return m[k!]; }',
      errors: [{ messageId: 'useAssertSafe' }],
      output: `import { assertSafe } from 'functions/src/util/assertSafe';
function f(m,k){ return m[assertSafe(k!)]; }`,
    },
    {
      code: 'function f(m,k){ return m[k satisfies string]; }',
      errors: [{ messageId: 'useAssertSafe' }],
      output: `import { assertSafe } from 'functions/src/util/assertSafe';
function f(m,k){ return m[assertSafe(k satisfies string)]; }`,
    },
    {
      code: 'async function f(m,p){ return m[await p]; }',
      errors: [{ messageId: 'useAssertSafe' }],
      output: `import { assertSafe } from 'functions/src/util/assertSafe';
async function f(m,p){ return m[assertSafe(await p)]; }`,
    },
    {
      // The message names the key as it is written, wrapper included, so the
      // remedy it prints is the edit the fixer makes.
      name: 'the reported key is the written form, assertion included',
      code: `
const read = (m, k) => m[k as string];
      `,
      errors: [lintError('k as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, k) => m[assertSafe(k as string)];
      `,
    },
    {
      name: 'an angle-bracket type assertion is unwrapped',
      code: `
const read = (m, k) => m[<string>k];
      `,
      errors: [lintError('<string>k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, k) => m[assertSafe(<string>k)];
      `,
    },
    {
      name: 'nested wrappers are peeled down to the identifier underneath',
      code: `
const read = (m, k) => m[(k as any)!];
      `,
      errors: [lintError('(k as any)!')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, k) => m[assertSafe((k as any)!)];
      `,
    },
    {
      name: 'three stacked wrappers are peeled in one pass',
      code: `
const read = (m, k) => m[((k as unknown) as string)!];
      `,
      errors: [lintError('((k as unknown) as string)!')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, k) => m[assertSafe(((k as unknown) as string)!)];
      `,
    },
    {
      name: 'a satisfies wrapper over an await is peeled',
      code: `
const read = async (m, p) => m[(await p) satisfies string];
      `,
      errors: [lintError('(await p) satisfies string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = async (m, p) => m[assertSafe((await p) satisfies string)];
      `,
    },
    {
      // Issue #1712's table row: a bare `g()` key reports, so the asserted
      // spelling of the same call must report too.
      name: 'an assertion over a call expression is unwrapped',
      code: `
const read = (m, g) => m[g() as number];
      `,
      errors: [lintError('g() as number')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, g) => m[assertSafe(g() as number)];
      `,
    },
    {
      name: 'an assertion over a member expression key is unwrapped',
      code: `
const read = (m, source) => m[source.key as string];
      `,
      errors: [lintError('source.key as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, source) => m[assertSafe(source.key as string)];
      `,
    },
    {
      name: 'an awaited member expression key is unwrapped',
      code: `
const read = async (m, source) => m[await source.key];
      `,
      errors: [lintError('await source.key')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = async (m, source) => m[assertSafe(await source.key)];
      `,
    },
    {
      name: 'an assertion over a conditional key is unwrapped',
      code: `
const read = (m, flag, k) => m[(flag ? 'a' : k) as string];
      `,
      errors: [lintError("(flag ? 'a' : k) as string")],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, flag, k) => m[assertSafe((flag ? 'a' : k) as string)];
      `,
    },
    {
      // agora evidence for issue #1712: an asserted key on the write side of
      // an assignment is the shape that pollutes a prototype.
      name: 'a computed write through an assertion is reported',
      code: `
const toMap = (prev, deviceId, label) => {
  prev[deviceId as string] = label;
};
      `,
      errors: [lintError('deviceId as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const toMap = (prev, deviceId, label) => {
  prev[assertSafe(deviceId as string)] = label;
};
      `,
    },
    {
      name: 'an optional computed member through an assertion is reported',
      code: `
const read = (m, k) => m?.[k as string];
      `,
      errors: [lintError('k as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, k) => m?.[assertSafe(k as string)];
      `,
    },
    {
      name: 'a delete through an assertion is reported',
      code: `
const drop = (m, k) => {
  delete m[k as string];
};
      `,
      errors: [lintError('k as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const drop = (m, k) => {
  delete m[assertSafe(k as string)];
};
      `,
    },
    {
      name: 'a non-array-ish field indexed through an assertion is reported',
      code: `
const read = (table, key) => table.rows[key as string];
      `,
      errors: [lintError('key as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (table, key) => table.rows[assertSafe(key as string)];
      `,
    },
    {
      // The chained read from agora's toNoContentText.
      name: 'an asserted key deep in a member chain is reported',
      code: `
const read = (data, variant) => data.users[variant as string].name;
      `,
      errors: [lintError('variant as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (data, variant) => data.users[assertSafe(variant as string)].name;
      `,
    },
    {
      // The String(...) conversion is kept rather than collapsed to its
      // argument: the assertion the author wrote applies to the call's result,
      // so deleting either half rewrites text the fixer does not own.
      name: 'an asserted String(...) key keeps both the call and the assertion',
      code: `
const read = (m, id) => m[String(id) as string];
      `,
      errors: [lintError('String(id) as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, id) => m[assertSafe(String(id) as string)];
      `,
    },
    {
      name: 'an asserted template-literal key keeps the template',
      code: `
const read = (m, id) => m[\`\${id}\` as string];
      `,
      errors: [lintError('`${id}` as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, id) => m[assertSafe(\`\${id}\` as string)];
      `,
    },
    {
      name: 'an asserted String(...) key in computed destructuring is reported',
      code: `
const read = (obj, id) => {
  const { [String(id) as string]: value } = obj;
  return value;
};
      `,
      errors: [lintError('String(id) as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (obj, id) => {
  const { [assertSafe(String(id) as string)]: value } = obj;
  return value;
};
      `,
    },
    {
      name: 'an asserted String(...) operand of `in` is reported',
      code: `
const has = (obj, id) => (String(id) as string) in obj;
      `,
      errors: [lintError('String(id) as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const has = (obj, id) => assertSafe(String(id) as string) in obj;
      `,
    },
    {
      // FENCE for issue #1712: the assertion is not what exempts the offset.
      // With no annotation on `index` the syntax proves nothing, so the key
      // reports — the mirror of the valid case that pins the annotation.
      name: 'an unannotated parameter under a number assertion stays unproven',
      code: `
const next = (buffer, index) => buffer[(index as number) + 1];
      `,
      errors: [lintError('(index as number) + 1')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const next = (buffer, index) => buffer[assertSafe((index as number) + 1)];
      `,
    },
    {
      name: 'an unannotated parameter asserted numeric on its own stays unproven',
      code: `
const at = (buffer, index) => buffer[index as number];
      `,
      errors: [lintError('index as number')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, index) => buffer[assertSafe(index as number)];
      `,
    },
    {
      // The wrapped fix is idempotent: a second pass sees an assertSafe call
      // at the key position and leaves it alone.
      name: 'wrapped keys across one file take a single import and converge',
      code: `
const read = (m, k, id) => [m[k as string], m[id!]];
      `,
      errors: [lintError('k as string'), lintError('id!')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, k, id) => [m[assertSafe(k as string)], m[assertSafe(id!)]];
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1830: an optional chain in the key position wraps the member or
    // call in a ChainExpression, which matched none of the classification
    // branches — so the rule went silent on exactly the defensively-chained
    // payload reads it exists for. `?.` guards a nullish RECEIVER; this rule
    // guards a hostile KEY, and `"__proto__"` is a perfectly non-nullish
    // string. The fix wraps the whole chain, so the short-circuit is evaluated
    // once, in place, and its result is what assertSafe validates.
    // ------------------------------------------------------------------
    {
      name: 'a chained member key is reported',
      code: `
const read = (m, source) => m[source?.key];
      `,
      errors: [lintError('source?.key')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, source) => m[assertSafe(source?.key)];
      `,
    },
    {
      // An HTTP payload read as an object key is the prototype-pollution
      // vector, and `req.body?.` is how it is written in practice.
      name: 'a chained request-body key is reported',
      code: `
const read = (store, req) => store[req.body?.key];
      `,
      errors: [lintError('req.body?.key')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (store, req) => store[assertSafe(req.body?.key)];
      `,
    },
    {
      name: 'a chained Firestore snapshot key is reported',
      code: `
const read = (store, change) => store[change.after?.data().userId];
      `,
      errors: [lintError('change.after?.data().userId')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (store, change) => store[assertSafe(change.after?.data().userId)];
      `,
    },
    {
      name: 'two chained links in one key are reported once, wrapped whole',
      code: `
const read = (store, payload) => store[payload?.body?.userId];
      `,
      errors: [lintError('payload?.body?.userId')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (store, payload) => store[assertSafe(payload?.body?.userId)];
      `,
    },
    {
      name: 'an optionally-called key is reported',
      code: `
const read = (m, getKey) => m[getKey?.()];
      `,
      errors: [lintError('getKey?.()')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, getKey) => m[assertSafe(getKey?.())];
      `,
    },
    {
      // Issue #1712 meets #1830: an assertion over a chain. Both wrappers are
      // read through, and both survive into the emitted call.
      name: 'an assertion over a chained key is reported',
      code: `
const read = (m, source) => m[source?.key as string];
      `,
      errors: [lintError('source?.key as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, source) => m[assertSafe(source?.key as string)];
      `,
    },
    {
      // The other nesting order: a chain over an assertion.
      name: 'a chain over an asserted receiver is reported',
      code: `
const read = (m, source) => m[(source as any)?.key];
      `,
      errors: [lintError('(source as any)?.key')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, source) => m[assertSafe((source as any)?.key)];
      `,
    },
    {
      name: 'an awaited chained key is reported',
      code: `
const read = async (m, source) => m[await source?.key];
      `,
      errors: [lintError('await source?.key')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = async (m, source) => m[assertSafe(await source?.key)];
      `,
    },
    {
      // The String(...) conversion is kept rather than collapsed to `id`: the
      // optional call is text the fixer does not own.
      name: 'an optionally-called String(...) key keeps the call',
      code: `
const read = (m, id) => m[String?.(id)];
      `,
      errors: [lintError('String?.(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, id) => m[assertSafe(String?.(id))];
      `,
    },
    {
      name: 'an optionally-called String(...) key in computed destructuring is reported',
      code: `
const read = (obj, id) => {
  const { [String?.(id)]: value } = obj;
  return value;
};
      `,
      errors: [lintError('String?.(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (obj, id) => {
  const { [assertSafe(String?.(id))]: value } = obj;
  return value;
};
      `,
    },
    {
      name: 'an optionally-called String(...) operand of `in` is reported',
      code: `
const has = (obj, id) => (String?.(id)) in obj;
      `,
      errors: [lintError('String?.(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const has = (obj, id) => assertSafe(String?.(id)) in obj;
      `,
    },
    {
      // A chained receiver on the OBJECT side already reported; a chain on both
      // sides must report exactly once, on the key.
      name: 'a chained lookup of a chained key is reported on the key',
      code: `
const read = (m, source) => m?.[source?.key];
      `,
      errors: [lintError('source?.key')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, source) => m?.[assertSafe(source?.key)];
      `,
    },
    {
      // FENCE for the numeric carve-out: reading through the chain proves
      // `.length`, not every chained member. A chained read of anything else is
      // as unproven as its unchained spelling.
      name: 'a chained member that is not `.length` stays unproven',
      code: `
const at = (buffer, source) => buffer[source?.offset];
      `,
      errors: [lintError('source?.offset')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (buffer, source) => buffer[assertSafe(source?.offset)];
      `,
    },
    {
      // FENCE for the assertSafe exemption: the chain is read through to the
      // callee's NAME, so an optional call to anything else is still a
      // violation rather than a way past the check.
      name: 'a binding initialised from an optional call to another helper reports',
      code: `
const read = (m, rawKey, sanitize) => {
  const safeKey = sanitize?.(rawKey);
  return m[safeKey];
};
      `,
      errors: [lintError('safeKey')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m, rawKey, sanitize) => {
  const safeKey = sanitize?.(rawKey);
  return m[assertSafe(safeKey)];
};
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1915 FENCE: the proof is the `number` keyword the author wrote at
    // the declaration site the reference RESOLVES to. A return type naming
    // anything else, an inferred one, and a same-named member of another class
    // or another half of this one all keep reporting.
    // ------------------------------------------------------------------
    {
      name: 'a `: string` return type proves nothing',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed): string {
    return seed;
  }
  read(seed) {
    return this.mapping[this.rankOf(seed)];
  }
}
      `,
      errors: [lintError('this.rankOf(seed)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed): string {
    return seed;
  }
  read(seed) {
    return this.mapping[assertSafe(this.rankOf(seed))];
  }
}
      `,
    },
    {
      name: 'an `: any` return type proves nothing',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed): any {
    return seed;
  }
  read(seed) {
    return this.mapping[this.rankOf(seed)];
  }
}
      `,
      errors: [lintError('this.rankOf(seed)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed): any {
    return seed;
  }
  read(seed) {
    return this.mapping[assertSafe(this.rankOf(seed))];
  }
}
      `,
    },
    {
      name: 'an `: unknown` return type proves nothing',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed): unknown {
    return seed;
  }
  read(seed) {
    return this.mapping[this.rankOf(seed)];
  }
}
      `,
      errors: [lintError('this.rankOf(seed)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed): unknown {
    return seed;
  }
  read(seed) {
    return this.mapping[assertSafe(this.rankOf(seed))];
  }
}
      `,
    },
    {
      // A union admitting a string admits '__proto__', which is the whole
      // hazard — only the bare keyword rules it out.
      name: 'a `: number | string` return type proves nothing',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed): number | string {
    return seed;
  }
  read(seed) {
    return this.mapping[this.rankOf(seed)];
  }
}
      `,
      errors: [lintError('this.rankOf(seed)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed): number | string {
    return seed;
  }
  read(seed) {
    return this.mapping[assertSafe(this.rankOf(seed))];
  }
}
      `,
    },
    {
      // The rule reads syntax, not types: an inferred return is not a written
      // proof, and reading one would need the checker this rule does without.
      name: 'an unannotated method returning a number proves nothing',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed) {
    return 1;
  }
  read(seed) {
    return this.mapping[this.rankOf(seed)];
  }
}
      `,
      errors: [lintError('this.rankOf(seed)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  constructor(private readonly mapping) {}
  private rankOf(seed) {
    return 1;
  }
  read(seed) {
    return this.mapping[assertSafe(this.rankOf(seed))];
  }
}
      `,
    },
    {
      name: 'a `: number` field of another class proves nothing',
      code: `
class Ranked {
  rank: number = 1;
}
class Reader {
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[this.rank];
  }
}
      `,
      errors: [lintError('this.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Ranked {
  rank: number = 1;
}
class Reader {
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[assertSafe(this.rank)];
  }
}
      `,
    },
    {
      name: 'a `: number` method of another class proves nothing',
      code: `
class Ranked {
  rankOf(seed): number {
    return seed;
  }
}
class Reader {
  constructor(private readonly mapping) {}
  read(seed) {
    return this.mapping[this.rankOf(seed)];
  }
}
      `,
      errors: [lintError('this.rankOf(seed)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Ranked {
  rankOf(seed): number {
    return seed;
  }
}
class Reader {
  constructor(private readonly mapping) {}
  read(seed) {
    return this.mapping[assertSafe(this.rankOf(seed))];
  }
}
      `,
    },
    {
      // The callee resolves through the scope chain, so the nearest binding is
      // what is judged — the outer helper's annotation is not in play.
      name: 'a local shadowing a `: number` helper proves nothing',
      code: `
const rankOf = (seed): number => seed;
const read = (mapping, seed) => {
  const rankOf = (s) => s;
  return mapping[rankOf(seed)];
};
      `,
      errors: [lintError('rankOf(seed)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const rankOf = (seed): number => seed;
const read = (mapping, seed) => {
  const rankOf = (s) => s;
  return mapping[assertSafe(rankOf(seed))];
};
      `,
    },
    {
      name: 'an instance field read through a static `this` proves nothing',
      code: `
class Reader {
  rank: number = 1;
  static read(mapping) {
    return mapping[this.rank];
  }
}
      `,
      errors: [lintError('this.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  rank: number = 1;
  static read(mapping) {
    return mapping[assertSafe(this.rank)];
  }
}
      `,
    },
    {
      name: 'a static field read through an instance `this` proves nothing',
      code: `
class Reader {
  static rank: number = 1;
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[this.rank];
  }
}
      `,
      errors: [lintError('this.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  static rank: number = 1;
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[assertSafe(this.rank)];
  }
}
      `,
    },
    {
      // A non-arrow callback receives its own call-time `this`, which is not
      // the class the field is declared on.
      name: 'a `this` rebound by a plain function proves nothing',
      code: `
class Reader {
  rank: number = 1;
  constructor(private readonly mapping) {}
  read() {
    const self = this;
    return [1].map(function () {
      return self.mapping[this.rank];
    });
  }
}
      `,
      errors: [lintError('this.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  rank: number = 1;
  constructor(private readonly mapping) {}
  read() {
    const self = this;
    return [1].map(function () {
      return self.mapping[assertSafe(this.rank)];
    });
  }
}
      `,
    },
    {
      name: 'a nested class shadows the outer class it is written in',
      code: `
class Outer {
  rank: number = 1;
  read(mapping) {
    class Inner {
      at() {
        return mapping[this.rank];
      }
    }
    return Inner;
  }
}
      `,
      errors: [lintError('this.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Outer {
  rank: number = 1;
  read(mapping) {
    class Inner {
      at() {
        return mapping[assertSafe(this.rank)];
      }
    }
    return Inner;
  }
}
      `,
    },
    {
      name: 'a member of a receiver that is not a class proves nothing',
      code: `
const read = (mapping, holder) => mapping[holder.rank];
      `,
      errors: [lintError('holder.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (mapping, holder) => mapping[assertSafe(holder.rank)];
      `,
    },
    {
      // The declaration no longer says what the call reaches once another
      // function is written into the binding.
      name: 'a callee reassigned to an unannotated function proves nothing',
      code: `
let rankOf = (seed): number => seed;
rankOf = (seed) => seed;
const read = (mapping, seed) => mapping[rankOf(seed)];
      `,
      errors: [lintError('rankOf(seed)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
let rankOf = (seed): number => seed;
rankOf = (seed) => seed;
const read = (mapping, seed) => mapping[assertSafe(rankOf(seed))];
      `,
    },
    {
      // A parameter's definition node is the function that declares it, whose
      // own return type describes the function, not the parameter.
      name: 'a parameter callee inside a `: number` function proves nothing',
      code: `
const at = (mapping, rankOf): number => mapping[rankOf(1)];
      `,
      errors: [lintError('rankOf(1)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const at = (mapping, rankOf): number => mapping[assertSafe(rankOf(1))];
      `,
    },
    {
      // A superclass may be declared in another file, so its annotations are
      // out of reach of a single-file analysis.
      name: 'a `super` method call proves nothing',
      code: `
class Base {
  rankOf(seed): number {
    return seed;
  }
}
class Reader extends Base {
  constructor(private readonly mapping) {
    super();
  }
  read(seed) {
    return this.mapping[super.rankOf(seed)];
  }
}
      `,
      errors: [lintError('super.rankOf(seed)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Base {
  rankOf(seed): number {
    return seed;
  }
}
class Reader extends Base {
  constructor(private readonly mapping) {
    super();
  }
  read(seed) {
    return this.mapping[assertSafe(super.rankOf(seed))];
  }
}
      `,
    },
    {
      // `Promise<number>` is a type reference, not the `number` keyword, so the
      // awaited call is judged unproven like any other.
      name: 'an awaited `: Promise<number>` method proves nothing',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private async rankOf(seed): Promise<number> {
    return seed;
  }
  async read(seed) {
    return this.mapping[await this.rankOf(seed)];
  }
}
      `,
      errors: [lintError('await this.rankOf(seed)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  constructor(private readonly mapping) {}
  private async rankOf(seed): Promise<number> {
    return seed;
  }
  async read(seed) {
    return this.mapping[assertSafe(await this.rankOf(seed))];
  }
}
      `,
    },
    {
      name: 'a field annotated `: number | string` proves nothing',
      code: `
class Reader {
  private readonly rank: number | string = 1;
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[this.rank];
  }
}
      `,
      errors: [lintError('this.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  private readonly rank: number | string = 1;
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[assertSafe(this.rank)];
  }
}
      `,
    },
    {
      name: 'an unannotated field initialized to a number proves nothing',
      code: `
class Reader {
  private readonly rank = 1;
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[this.rank];
  }
}
      `,
      errors: [lintError('this.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  private readonly rank = 1;
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[assertSafe(this.rank)];
  }
}
      `,
    },
    {
      // A setter says what a write accepts; with no getter beside it there is
      // no declared read type at all.
      name: 'a setter alone proves nothing about the read',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  private set rank(next: number) {}
  read() {
    return this.mapping[this.rank];
  }
}
      `,
      errors: [lintError('this.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  constructor(private readonly mapping) {}
  private set rank(next: number) {}
  read() {
    return this.mapping[assertSafe(this.rank)];
  }
}
      `,
    },
    {
      // The annotation lives in another file, where this analysis cannot read
      // it — an imported name proves nothing on its own.
      name: 'an imported callee proves nothing',
      code: `
import { rankOf } from './rank';
const read = (mapping, seed) => mapping[rankOf(seed)];
      `,
      errors: [lintError('rankOf(seed)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
import { rankOf } from './rank';
const read = (mapping, seed) => mapping[assertSafe(rankOf(seed))];
      `,
    },
    {
      // An object literal's method is not a class member, so `this.rank` there
      // resolves to no annotated declaration.
      name: 'an object literal method `this` proves nothing',
      code: `
const holder = {
  rank: 1,
  read(mapping) {
    return mapping[this.rank];
  },
};
      `,
      errors: [lintError('this.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const holder = {
  rank: 1,
  read(mapping) {
    return mapping[assertSafe(this.rank)];
  },
};
      `,
    },
    {
      // A computed member read names whatever the key holds, which is the very
      // thing the rule cannot see — the member carries no declaration to read.
      name: 'a computed member read on the receiver proves nothing',
      code: `
class Reader {
  private readonly rank: number = 1;
  constructor(private readonly mapping) {}
  read(k) {
    return this.mapping[this[k]];
  }
}
      `,
      errors: [lintError('this[k]'), lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  private readonly rank: number = 1;
  constructor(private readonly mapping) {}
  read(k) {
    return this.mapping[assertSafe(this[k])];
  }
}
      `,
    },
    // ------------------------------------------------------------------
    // Issue #2152 controls: the validated-binding carve-out reads through the
    // wrappers, but stays keyed on the callee being assertSafe. Widening it to
    // "anything wrapped" would turn the rule into a no-op behind an `as`.
    // ------------------------------------------------------------------
    {
      name: 'a wrapped call to something other than assertSafe still reports (issue #2152)',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
const read = (rawKey) => {
  const k = coerce(rawKey) as string;
  return obj[k];
};
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
const read = (rawKey) => {
  const k = coerce(rawKey) as string;
  return obj[assertSafe(k)];
};
      `,
    },
    {
      name: 'a wrapped non-call initializer still reports (issue #2152)',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
const read = (rawKey) => {
  const k = rawKey as string;
  return obj[k];
};
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
const read = (rawKey) => {
  const k = rawKey as string;
  return obj[assertSafe(k)];
};
      `,
    },
  ],
};

ruleTesterTs.run(
  'enforce-assert-safe-object-key',
  enforceAssertSafeObjectKey,
  MAIN_TESTS,
);

// Issue #1933: `private rankOf(): number` and `#rankOf(): number` are the same
// privacy under two spellings, and TypeScript forbids writing both at once
// (TS18010), so an author on the `#` spelling cannot opt into the declaration
// proof by adding `private`. The proof the rule asks for is the WRITTEN
// annotation plus a reference that RESOLVES to it, both of which a `#` member
// satisfies — more strictly than the `private` one, since a `#` name is
// unreachable outside the class body and cannot be shadowed or aliased.
// The fence matters as much as the carve-out: `PrivateIdentifier.name` is the
// bare name with no `#`, so `#rank` and a public `rank` in the same class must
// stay separate declarations or crediting one would silence a read of the other.
const PRIVATE_MEMBER_TESTS: AssertSafeTests = {
  valid: [
    {
      name: 'a `: number` return type on a `#` method is numeric proof at the call site',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  #rankOf(seed): number {
    return seed + 1;
  }
  read(seed) {
    const rank = this.#rankOf(seed);
    return this.mapping[rank];
  }
}
      `,
    },
    {
      name: 'a call to a `: number`-returning `#` method is numeric in key position',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  #rankOf(seed): number {
    return seed + 1;
  }
  read(seed) {
    return this.mapping[this.#rankOf(seed)];
  }
}
      `,
    },
    {
      name: 'a `#` field annotated `: number` is numeric at the use site',
      code: `
class Reader {
  readonly #rank: number = 1;
  constructor(private readonly mapping) {}
  read() {
    return this.mapping[this.#rank];
  }
}
      `,
    },
    {
      name: 'a `#` getter returning `: number` is numeric at the read site',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  get #rank(): number {
    return 1;
  }
  read() {
    return this.mapping[this.#rank];
  }
}
      `,
    },
    {
      // A setter constrains writes, not reads, on either spelling of privacy.
      name: 'a `#` getter paired with a `#` setter keeps its numeric proof',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  get #rank(): number {
    return 1;
  }
  set #rank(next) {}
  read() {
    return this.mapping[this.#rank];
  }
}
      `,
    },
    {
      name: 'a `: number`-returning `#` arrow class field is numeric at the call site',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  #rankOf = (seed): number => seed + 1;
  read(seed) {
    return this.mapping[this.#rankOf(seed)];
  }
}
      `,
    },
    {
      name: 'an optionally-called `: number` `#` method keeps its proof',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  #rankOf(seed): number {
    return seed;
  }
  read(seed) {
    return this.mapping[this.#rankOf?.(seed)];
  }
}
      `,
    },
    {
      name: 'a `static #` method is numeric through a static `this`',
      code: `
class Reader {
  static mapping = {};
  static #rankOf(seed): number {
    return seed + 1;
  }
  static read(seed) {
    return this.mapping[this.#rankOf(seed)];
  }
}
      `,
    },
    {
      name: 'a `static #` method reached by the class name is numeric',
      code: `
class Reader {
  static mapping = {};
  static #rankOf(seed): number {
    return seed + 1;
  }
  read(seed) {
    return Reader.mapping[Reader.#rankOf(seed)];
  }
}
      `,
    },
    {
      // The array-ish name is read off the property, and `#items` names the
      // very collection `items` does.
      name: 'a `#` field carrying an array-ish name reads as a positional lookup',
      code: `
class Reader {
  #items = [];
  read(i) {
    return this.#items[i];
  }
}
      `,
    },
  ],
  invalid: [
    {
      name: 'a `: string` return type on a `#` method proves nothing',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  #rankOf(seed): string {
    return String(seed);
  }
  read(seed) {
    const rank = this.#rankOf(seed);
    return this.mapping[rank];
  }
}
      `,
      errors: [lintError('rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  constructor(private readonly mapping) {}
  #rankOf(seed): string {
    return String(seed);
  }
  read(seed) {
    const rank = this.#rankOf(seed);
    return this.mapping[assertSafe(rank)];
  }
}
      `,
    },
    {
      name: 'an unannotated `#` field initialized to a number proves nothing',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  #rank = 1;
  read() {
    return this.mapping[this.#rank];
  }
}
      `,
      errors: [lintError('this.#rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  constructor(private readonly mapping) {}
  #rank = 1;
  read() {
    return this.mapping[assertSafe(this.#rank)];
  }
}
      `,
    },
    {
      // `PrivateIdentifier.name` drops the `#`, so a name-only match would
      // credit this public `rank: string` read with the `#rank: number`
      // annotation it never resolves to.
      name: 'a `: number` `#` field proves nothing about the public field spelled the same',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  #rank: number = 1;
  rank: string = 'a';
  read() {
    return this.mapping[this.rank];
  }
}
      `,
      errors: [lintError('this.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  constructor(private readonly mapping) {}
  #rank: number = 1;
  rank: string = 'a';
  read() {
    return this.mapping[assertSafe(this.rank)];
  }
}
      `,
    },
    {
      name: 'a `: number` public field proves nothing about the `#` field spelled the same',
      code: `
class Reader {
  constructor(private readonly mapping) {}
  rank: number = 1;
  #rank: string = 'a';
  read() {
    return this.mapping[this.#rank];
  }
}
      `,
      errors: [lintError('this.#rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Reader {
  constructor(private readonly mapping) {}
  rank: number = 1;
  #rank: string = 'a';
  read() {
    return this.mapping[assertSafe(this.#rank)];
  }
}
      `,
    },
    {
      // A `#` member of another class is unreachable by syntax, and its
      // annotation is never read for a same-named member of this one.
      name: 'a `: number` `#` field of another class proves nothing',
      code: `
class Ranked {
  #rank: number = 1;
}
class Reader {
  constructor(private readonly mapping) {}
  rank = 'a';
  read() {
    return this.mapping[this.rank];
  }
}
      `,
      errors: [lintError('this.rank')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class Ranked {
  #rank: number = 1;
}
class Reader {
  constructor(private readonly mapping) {}
  rank = 'a';
  read() {
    return this.mapping[assertSafe(this.rank)];
  }
}
      `,
    },
  ],
};

ruleTesterTs.run(
  'enforce-assert-safe-object-key: ECMA private class members (issue #1933)',
  enforceAssertSafeObjectKey,
  PRIVATE_MEMBER_TESTS,
);

// Issue #1875: a typed discriminant indexing a Record whose declared keys cover
// its type is compile-time bounded — TypeScript rejects any key value outside
// the record's declared keys — so wrapping it in assertSafe validates nothing
// the compiler has not already checked. Worse, the wrap is not semantics
// preserving for the values that DO slip past a declared type at runtime (data
// crossing a persistence or version boundary): the plain lookup degrades to
// `undefined` where assertSafe throws, which is how the composed autofix of
// prefer-map-over-conditional-dispatch and this rule turned a graceful render
// fallback into a render-time crash. These cases pin the carve-out and, just as
// deliberately, its edges: both sides must be annotated, the coverage must be
// syntactically provable, and every conversion spelling keeps reporting.
const BOUNDED_RECORD_TESTS: AssertSafeTests = {
  valid: [
    {
      name: 'a key sharing the record key alias is exempt (the #1875 post-fix shape)',
      code: `
type Kind = 'live' | 'simulated';
export const layer = (kind: Kind) => {
  const RESULT_BY_KIND: Record<Kind, string | undefined> = {
    simulated: 'watermark',
    live: undefined,
  };
  return RESULT_BY_KIND[kind];
};
      `,
    },
    {
      name: 'inline literal unions matching on both sides are exempt',
      code: `
const read = (m: Record<'live' | 'simulated', string>, kind: 'live' | 'simulated') => m[kind];
      `,
    },
    {
      name: 'a key narrowed to a single literal of the record union is exempt',
      code: `
const read = (m: Record<'live' | 'simulated', string>, kind: 'simulated') => m[kind];
      `,
    },
    {
      name: 'an in-file alias key into its spelled-out union record is exempt',
      code: `
type Kind = 'live' | 'simulated';
const R: Record<'live' | 'simulated', number> = { live: 1, simulated: 2 };
export const read = (kind: Kind) => R[kind];
      `,
    },
    {
      name: 'an inline union key into an aliased record key type is exempt',
      code: `
type Kind = 'live' | 'simulated';
const R: Record<Kind, number> = { live: 1, simulated: 2 };
export const read = (kind: 'live' | 'simulated') => R[kind];
      `,
    },
    {
      name: 'an imported alias shared by key and record is exempt on name identity',
      code: `
import { Kind } from './kinds';
export const read = (m: Record<Kind, string>, kind: Kind) => m[kind];
      `,
    },
    {
      name: 'a type-only imported alias shared by key and record is exempt',
      code: `
import type { Kind } from './kinds';
export const read = (m: Record<Kind, string>, kind: Kind) => m[kind];
      `,
    },
    {
      name: 'an alias derived from an as-const values array is exempt (closed domain)',
      code: `
const KINDS = ['live', 'simulated'] as const;
type Kind = (typeof KINDS)[number];
export const read = (m: Record<Kind, string>, kind: Kind) => m[kind];
      `,
    },
    {
      name: 'a string enum shared by key and record is exempt',
      code: `
enum Status {
  Active = 'active',
  Closed = 'closed',
}
const LABELS: Record<Status, string> = { [Status.Active]: 'a', [Status.Closed]: 'c' };
export const labelOf = (status: Status) => LABELS[status];
      `,
    },
    {
      name: 'Readonly<Record<...>> keeps the key domain and the exemption',
      code: `
type Kind = 'live' | 'simulated';
const read = (m: Readonly<Record<Kind, string>>, kind: Kind) => m[kind];
      `,
    },
    {
      name: 'Partial<Record<...>> keeps the key domain and the exemption',
      code: `
type Kind = 'live' | 'simulated';
const read = (m: Partial<Record<Kind, string>>, kind: Kind) => m[kind];
      `,
    },
    {
      name: 'an in-file alias of the whole Record annotation is read through',
      code: `
type Kind = 'live' | 'simulated';
type Lookup = Record<Kind, number>;
const R: Lookup = { live: 1, simulated: 2 };
export const read = (kind: Kind) => R[kind];
      `,
    },
    {
      name: 'an optionally chained bounded lookup is exempt',
      code: `
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, string> | undefined, kind: Kind) => m?.[kind];
      `,
    },
    {
      name: 'a bounded key on the write side of an assignment is exempt',
      code: `
type Kind = 'live' | 'simulated';
const write = (m: Record<Kind, number>, kind: Kind) => {
  m[kind] = 1;
};
      `,
    },
    {
      name: 'an annotated let stays bounded across reassignment',
      code: `
type Kind = 'live' | 'simulated';
const R: Record<Kind, number> = { live: 1, simulated: 2 };
export const read = (flag: boolean) => {
  let kind: Kind = 'live';
  if (flag) {
    kind = 'simulated';
  }
  return R[kind];
};
      `,
    },
    {
      name: 'a parameter default does not disturb the annotation proof',
      code: `
type Kind = 'live' | 'simulated';
const R: Record<Kind, number> = { live: 1, simulated: 2 };
export const read = (kind: Kind = 'live') => R[kind];
      `,
    },
    {
      name: 'a member read off the bounded lookup result is exempt',
      code: `
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, { label: string }>, kind: Kind) => m[kind].label;
      `,
    },
    {
      name: 'an erasing wrapper on a bounded key is read through to the binding',
      code: `
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, string>, kind: Kind) => m[kind!];
      `,
    },
    {
      name: 'a numeric literal union key into its own record is exempt',
      code: `
const read = (m: Record<1 | 2, string>, slot: 1 | 2) => m[slot];
      `,
    },
    {
      // The mixed spelling prefer-union-from-const-array's rewrite leaves
      // behind: the key's alias is array-derived while the record still
      // spells the union out. The array's `as const` elements are the
      // literal set the subset comparison reads.
      name: 'an as-const array-derived key into a spelled-out union record is exempt',
      code: `
const KINDS = ['live', 'simulated'] as const;
type Kind = (typeof KINDS)[number];
const R: Record<'live' | 'simulated', number> = { live: 1, simulated: 2 };
export const read = (kind: Kind) => R[kind];
      `,
    },
    {
      // Name identity carries the exemption even where the array's
      // as-const-ness cannot settle the domain: both sides are the same
      // alias, so the compiler holds the key inside the record's declared
      // keys whatever that alias resolves to.
      name: 'a shared alias over a non-as-const array is exempt on name identity',
      code: `
const KINDS = ['live', 'simulated'];
type Kind = (typeof KINDS)[number];
export const read = (m: Record<Kind, string>, kind: Kind) => m[kind];
      `,
    },
  ],
  invalid: [
    {
      // The documented core trigger: an explicit string conversion keeps
      // reporting even when both bindings are bounded — a conversion is a key
      // the source computes, which is what the rule exists to flag. The fix
      // wraps the conversion rather than dropping it, since assertSafe
      // validates a key and never performs one (#2144).
      name: 'String() conversion of a bounded key still reports',
      code: `
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, string>, kind: Kind) => m[String(kind)];
      `,
      errors: [lintError('String(kind)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, string>, kind: Kind) =>
  m[assertSafe(String(kind))];
      `,
    },
    {
      // The other documented trigger: simple interpolation is an explicit
      // conversion by another spelling.
      name: 'template interpolation of a bounded key still reports',
      code: `
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, string>, kind: Kind) => m[\`\${kind}\`];
      `,
      errors: [lintError('`${kind}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, string>, kind: Kind) => m[assertSafe(\`\${kind}\`)];
      `,
    },
    {
      name: 'an unannotated key into a bounded record still reports',
      code: `
const R: Record<'live' | 'simulated', number> = { live: 1, simulated: 2 };
export const read = (kind) => R[kind];
      `,
      errors: [lintError('kind')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const R: Record<'live' | 'simulated', number> = { live: 1, simulated: 2 };
export const read = (kind) => R[assertSafe(kind)];
      `,
    },
    {
      // An `: string` key admits '__proto__'; the record's closed key set
      // cannot vouch for a key the compiler lets range over every string.
      name: 'a string-typed key into a bounded record still reports',
      code: `
const R: Record<'live' | 'simulated', number> = { live: 1, simulated: 2 };
export const read = (kind: string) => R[kind];
      `,
      errors: [lintError('kind')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const R: Record<'live' | 'simulated', number> = { live: 1, simulated: 2 };
export const read = (kind: string) => R[assertSafe(kind)];
      `,
    },
    {
      // A laundering assertion on the key is peeled; the BINDING's open type
      // is what gets judged, so the assertion is no way into the carve-out.
      name: 'an assertion cannot launder an open key into the exemption',
      code: `
type Kind = 'live' | 'simulated';
const R: Record<Kind, number> = { live: 1, simulated: 2 };
export const read = (kind: string) => R[kind as Kind];
      `,
      errors: [lintError('kind as Kind')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type Kind = 'live' | 'simulated';
const R: Record<Kind, number> = { live: 1, simulated: 2 };
export const read = (kind: string) => R[assertSafe(kind as Kind)];
      `,
    },
    {
      name: 'a key union wider than the record union still reports',
      code: `
const R: Record<'live' | 'simulated', number> = { live: 1, simulated: 2 };
export const read = (kind: 'live' | 'simulated' | 'replay') => R[kind];
      `,
      errors: [lintError('kind')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const R: Record<'live' | 'simulated', number> = { live: 1, simulated: 2 };
export const read = (kind: 'live' | 'simulated' | 'replay') =>
  R[assertSafe(kind)];
      `,
    },
    {
      // Record<string, V> declares no closed key set, so a literal-union key
      // has nothing syntactic to be covered BY — the pairing stays reported.
      name: 'a union key into Record<string, ...> still reports',
      code: `
const read = (m: Record<string, number>, kind: 'live' | 'simulated') => m[kind];
      `,
      errors: [lintError('kind')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m: Record<string, number>, kind: 'live' | 'simulated') =>
  m[assertSafe(kind)];
      `,
    },
    {
      // Name identity is trusted only until the alias resolves to an open
      // domain: `type K = string` re-opens the surface the rule guards.
      name: 'a shared alias that resolves to string still reports',
      code: `
type K = string;
const R: Record<K, number> = {};
export const read = (k: K) => R[k];
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type K = string;
const R: Record<K, number> = {};
export const read = (k: K) => R[assertSafe(k)];
      `,
    },
    {
      // A literal union that itself names a prototype field is a declared
      // route to the surface assertSafe guards, not a proof of safety.
      name: 'a shared alias whose union names __proto__ still reports',
      code: `
type K = '__proto__' | 'safe';
const R: Record<K, number> = { __proto__: 1, safe: 2 };
export const read = (k: K) => R[k];
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type K = '__proto__' | 'safe';
const R: Record<K, number> = { __proto__: 1, safe: 2 };
export const read = (k: K) => R[assertSafe(k)];
      `,
    },
    {
      // `K extends string` admits an instantiation at `string` itself, so a
      // generic lookup helper keeps being reported.
      name: 'a generic key constrained to string still reports',
      code: `
export const get = <K extends string>(m: Record<K, number>, k: K) => m[k];
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
export const get = <K extends string>(m: Record<K, number>, k: K) =>
  m[assertSafe(k)];
      `,
    },
    {
      // The nearest binding is what gets judged: an inner open-typed shadow
      // must not inherit the outer bounded parameter's proof.
      name: 'a shadowing open-typed binding still reports',
      code: `
type Kind = 'live' | 'simulated';
const R: Record<Kind, number> = { live: 1, simulated: 2 };
export const outer = (kind: Kind) => {
  const inner = (kind: string) => R[kind];
  return inner(kind);
};
      `,
      errors: [lintError('kind')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type Kind = 'live' | 'simulated';
const R: Record<Kind, number> = { live: 1, simulated: 2 };
export const outer = (kind: Kind) => {
  const inner = (kind: string) => R[assertSafe(kind)];
  return inner(kind);
};
      `,
    },
    {
      // The record proof rides on a binding's own annotation; a record
      // reached as a field makes no resolvable claim here, so the
      // conservative answer stands. Deliberately a false positive the
      // carve-out does not chase.
      name: 'a bounded record reached as a field still reports',
      code: `
type Kind = 'live' | 'simulated';
const read = (wrap: { map: Record<Kind, number> }, kind: Kind) => wrap.map[kind];
      `,
      errors: [lintError('kind')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type Kind = 'live' | 'simulated';
const read = (wrap: { map: Record<Kind, number> }, kind: Kind) =>
  wrap.map[assertSafe(kind)];
      `,
    },
    {
      // An index signature admits every string key, so it is not the closed
      // claim `Record<K, V>` makes.
      name: 'an index-signature annotation is not a bounded record',
      code: `
type Kind = 'live' | 'simulated';
const R: { [k: string]: number } = {};
export const read = (kind: Kind) => R[kind];
      `,
      errors: [lintError('kind')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type Kind = 'live' | 'simulated';
const R: { [k: string]: number } = {};
export const read = (kind: Kind) => R[assertSafe(kind)];
      `,
    },
    {
      // Without an annotation the record's key set lives in the value, which
      // this syntactic proof does not read. Deliberately conservative.
      name: 'an unannotated record initializer still reports',
      code: `
type Kind = 'live' | 'simulated';
const R = { live: 1, simulated: 2 };
export const read = (kind: Kind) => R[kind];
      `,
      errors: [lintError('kind')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type Kind = 'live' | 'simulated';
const R = { live: 1, simulated: 2 };
export const read = (kind: Kind) => R[assertSafe(kind)];
      `,
    },
    {
      // Without `as const` the array's type widens to `string[]`, so the
      // derived alias IS `string` — an open domain no spelled-out record
      // union can vouch for.
      name: 'a non-as-const array-derived key into a spelled-out record still reports',
      code: `
const KINDS = ['live', 'simulated'];
type Kind = (typeof KINDS)[number];
const R: Record<'live' | 'simulated', number> = { live: 1, simulated: 2 };
export const read = (kind: Kind) => R[kind];
      `,
      errors: [lintError('kind')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const KINDS = ['live', 'simulated'];
type Kind = (typeof KINDS)[number];
const R: Record<'live' | 'simulated', number> = { live: 1, simulated: 2 };
export const read = (kind: Kind) => R[assertSafe(kind)];
      `,
    },
    {
      // The exemption covers the bounded inner lookup only; the open key on
      // the chained outer lookup keeps its report.
      name: 'only the bounded half of a chained double lookup is exempt',
      code: `
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, Record<string, number>>, kind: Kind, other: string) => m[kind][other];
      `,
      errors: [lintError('other')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, Record<string, number>>, kind: Kind, other: string) => m[kind][assertSafe(other)];
      `,
    },
  ],
};

ruleTesterTs.run(
  'enforce-assert-safe-object-key: compiler-bounded Record lookups (issue #1875)',
  enforceAssertSafeObjectKey,
  BOUNDED_RECORD_TESTS,
);

// Issue #1408: RuleTester applies a single fix pass and never shows the file
// that `eslint --fix` actually writes. These cases run the real multi-pass
// fixer and assert the invariant the bug violated: an emitted assertSafe(...)
// call is never left without its import.
describe('enforce-assert-safe-object-key: inline disables and the import carrier (issue #1408)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-assert-safe-object-key';
  const IMPORT_LINE = `import { assertSafe } from 'functions/src/util/assertSafe';`;

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser('@typescript-eslint/parser', typescriptParser);
    linter.defineRule(
      RULE_ID,
      enforceAssertSafeObjectKey as unknown as Rule.RuleModule,
    );
    // A near-miss neighbour proves rule matching is exact rather than a
    // prefix/substring heuristic.
    linter.defineRule(
      '@blumintinc/blumint/enforce-assert-safe-object-key-strict',
      {
        meta: { schema: [] },
        create: () => ({}),
      } as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
      },
      rules: { [RULE_ID]: 'error' as const },
    };
    // A relative filename keeps the emitted specifier at its configured
    // repo-root value, isolating these cases from specifier resolution.
    const { output } = linter.verifyAndFix(code, config, 'lookup.ts');
    return output;
  };

  const expectNoUnboundAssertSafe = (output: string) => {
    if (/assertSafe\(/.test(output)) {
      expect(output).toContain(IMPORT_LINE);
    }
  };

  const countImports = (output: string) => output.split(IMPORT_LINE).length - 1;

  it('carries the import on the first surviving violation', () => {
    const output = lint(`const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id];
const second = obj[id];
`);

    expect(output).toBe(`${IMPORT_LINE}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id];
const second = obj[assertSafe(id)];
`);
    expectNoUnboundAssertSafe(output);
  });

  it('fixes every surviving violation across several passes with one import', () => {
    const output = lint(`const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id];
const second = obj[String(id)];
const third = obj[\`\${id}\`];
const fourth = String(id) in obj;
`);

    expect(countImports(output)).toBe(1);
    expect(output).toContain('const first = obj[id];');
    expect(output).toContain('const second = obj[assertSafe(String(id))];');
    expect(output).toContain('const third = obj[assertSafe(`${id}`)];');
    expect(output).toContain('const fourth = assertSafe(String(id)) in obj;');
    expectNoUnboundAssertSafe(output);
  });

  it('adds neither import nor wrapper when every violation is disabled', () => {
    const code = `const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id];
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const second = obj[id];
`;

    expect(lint(code)).toBe(code);
  });

  it('adds neither import nor wrapper under a whole-file block disable', () => {
    const code = `/* eslint-disable @blumintinc/blumint/enforce-assert-safe-object-key */
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
const second = obj[id];
`;

    expect(lint(code)).toBe(code);
  });

  it('keeps the import when only the last violation survives a block disable', () => {
    const output = lint(`const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
/* eslint-disable @blumintinc/blumint/enforce-assert-safe-object-key */
const first = obj[id];
const second = obj[id];
/* eslint-enable @blumintinc/blumint/enforce-assert-safe-object-key */
const third = obj[id];
`);

    expect(output).toBe(`${IMPORT_LINE}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
/* eslint-disable @blumintinc/blumint/enforce-assert-safe-object-key */
const first = obj[id];
const second = obj[id];
/* eslint-enable @blumintinc/blumint/enforce-assert-safe-object-key */
const third = obj[assertSafe(id)];
`);
    expectNoUnboundAssertSafe(output);
  });

  it('does not treat a disable for a similarly named rule as its own', () => {
    const output = lint(`const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key-strict
const first = obj[id];
`);

    expect(output).toBe(`${IMPORT_LINE}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key-strict
const first = obj[assertSafe(id)];
`);
    expectNoUnboundAssertSafe(output);
  });

  it('never duplicates an import the file already has', () => {
    const output = lint(`${IMPORT_LINE}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id];
const second = obj[id];
`);

    expect(countImports(output)).toBe(1);
    expect(output).toContain('const second = obj[assertSafe(id)];');
  });
});

// Issue #1422: RuleTester stops after one fix pass, so it cannot show that a
// withheld fix stays withheld. These cases run the real multi-pass fixer and
// assert the invariant the bug violated: `assertSafe` is never declared twice.
describe('enforce-assert-safe-object-key: an existing assertSafe binding (issue #1422)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-assert-safe-object-key';
  const IMPORT_LINE = `import { assertSafe } from 'functions/src/util/assertSafe';`;

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser('@typescript-eslint/parser', typescriptParser);
    linter.defineRule(
      RULE_ID,
      enforceAssertSafeObjectKey as unknown as Rule.RuleModule,
    );
    const { output } = linter.verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020 as const,
          sourceType: 'module' as const,
        },
        rules: { [RULE_ID]: 'error' as const },
      },
      // A relative filename keeps the emitted specifier at its configured
      // repo-root value, isolating these cases from specifier resolution.
      'lookup.ts',
    );
    return output;
  };

  // Counts statements that BIND the name `assertSafe`; a call site or a
  // parameter list merely mentioning it is not a declaration.
  const countAssertSafeDeclarations = (output: string) =>
    (
      output.match(
        /^\s*(?:import\s+assertSafe\b|import\s[^;]*\{[^}]*\bassertSafe\b[^}]*\}|(?:const|let|var)\s+assertSafe\b|function\s+assertSafe\b|class\s+assertSafe\b)/gm,
      ) ?? []
    ).length;

  it('leaves a file whose module scope already declares assertSafe untouched', () => {
    const code = `const assertSafe = (key) => key;
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
const second = obj[id];
`;

    expect(lint(code)).toBe(code);
    expect(countAssertSafeDeclarations(lint(code))).toBe(1);
  });

  it('leaves a file importing assertSafe from another module untouched', () => {
    const code = `import { assertSafe } from 'functions/src/util/legacyAssertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
`;

    expect(lint(code)).toBe(code);
  });

  it('fixes the unshadowed site only, with a single import', () => {
    const output = lint(`const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
function shadowed(assertSafe) {
  return obj[id];
}
const outer = obj[id];
`);

    expect(output).toBe(`${IMPORT_LINE}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
function shadowed(assertSafe) {
  return obj[id];
}
const outer = obj[assertSafe(id)];
`);
    expect(countAssertSafeDeclarations(output)).toBe(1);
  });
});

// Issue #1473: the injected import's specifier is anchored at the cwd ESLint
// was configured with, not the node process cwd. The two differ under the
// VS Code ESLint extension, in monorepos, and for any programmatic
// `new ESLint({ cwd })`, and anchoring at the process cwd emits a specifier
// that does not resolve, so the fixed file no longer compiles.
//
// RuleTester cannot express this: its Linter's cwd defaults to process.cwd(),
// which makes the correct and the incorrect read indistinguishable. These cases
// therefore drive the ESLint class with a cwd deliberately unrelated to the
// process cwd.
describe('enforce-assert-safe-object-key: the ESLint cwd anchors the specifier (issue #1473)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-assert-safe-object-key';
  // Absolute and non-existent: lintText never reads the disk, and a root that
  // shares no prefix with the process cwd makes a process-cwd read visibly wrong
  // rather than accidentally close.
  const PROJECT_ROOT = '/eslint-cwd-1473';

  const plugin = {
    rules: {
      'enforce-assert-safe-object-key': enforceAssertSafeObjectKey,
    },
  };

  const lintAt = async (relativePath: string, code: string) => {
    const eslint = new ESLint({
      cwd: PROJECT_ROOT,
      useEslintrc: false,
      fix: true,
      plugins: { '@blumintinc/blumint': plugin as never },
      overrideConfig: {
        parser: require.resolve('@typescript-eslint/parser'),
        parserOptions: {
          ecmaVersion: 2022 as const,
          sourceType: 'module' as const,
        },
        plugins: ['@blumintinc/blumint'],
        rules: { [RULE_ID]: 'error' as const },
      },
    });
    const [result] = await eslint.lintText(code, {
      filePath: path.posix.join(PROJECT_ROOT, relativePath),
    });
    // `output` is absent when no fix applied; the unchanged source is then the
    // effective result.
    return result.output ?? code;
  };

  const specifiersOf = (output: string) =>
    [...output.matchAll(/import \{ assertSafe \} from '([^']+)';/g)].map(
      (match) => match[1],
    );

  it('runs with an ESLint cwd that is not the process cwd', () => {
    expect(PROJECT_ROOT).not.toBe(process.cwd());
    expect(process.cwd().startsWith(`${PROJECT_ROOT}/`)).toBe(false);
  });

  it('derives a functions/ file specifier from the ESLint cwd', async () => {
    const output = await lintAt(
      'functions/src/handlers/handler.ts',
      'export const read = (m: Record<string, number>, id: string) => m[`${id}`];\n',
    );

    expect(specifiersOf(output)).toEqual(['../util/assertSafe']);
    expect(output).toContain('m[assertSafe(`${id}`)]');
  });

  it('derives a top-level src/ file specifier from the ESLint cwd', async () => {
    const output = await lintAt(
      'src/utils/helpers.ts',
      'export const read = (m: Record<string, number>, id: string) => m[`${id}`];\n',
    );

    expect(specifiersOf(output)).toEqual([
      '../../functions/src/util/assertSafe',
    ]);
  });

  it('matches an existing relative helper import against the ESLint cwd', async () => {
    const output = await lintAt(
      'functions/src/util/a/b/fixture.ts',
      `import { assertSafe } from '../../assertSafe';
export const read = (m: Record<string, number>, id: string) => m[\`\${id}\`];
`,
    );

    // The file already reaches the helper, so the fix only wraps the key. A cwd
    // misread fails to match that import two ways: the specifier comparison
    // misses, and the in-scope binding stops counting as the helper — which
    // withholds the fix entirely.
    expect(output).toBe(`import { assertSafe } from '../../assertSafe';
export const read = (m: Record<string, number>, id: string) =>
  m[assertSafe(\`\${id}\`)];
`);
  });
});

// Issue #1556: node's ESM resolver takes a specifier literally, so an
// extensionless injected import turns a working native-ESM file into one that
// throws ERR_MODULE_NOT_FOUND at startup. Whether a `.js` file is native ESM is
// decided by the nearest package.json on disk, which RuleTester cannot express:
// these cases build real manifests in a temp tree and lint files inside it.
describe('enforce-assert-safe-object-key: the nearest manifest decides the extension (issue #1556)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-assert-safe-object-key';

  const plugin = {
    rules: {
      'enforce-assert-safe-object-key': enforceAssertSafeObjectKey,
    },
  };

  let projectRoot: string;

  const writeFixture = (relativePath: string, contents: string) => {
    const target = path.join(projectRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  beforeAll(() => {
    projectRoot = createTempFixtureDir('assert-safe-esm-');
    writeFixture('esm-pkg/package.json', '{"type":"module"}');
    writeFixture('cjs-pkg/package.json', '{"type":"commonjs"}');
    // A nested manifest without a `type` field: node reads the nearest one and
    // stops, so this shadows the ESM manifest above it.
    writeFixture('esm-pkg/sub/package.json', '{}');
    writeFixture('malformed-pkg/package.json', '{oops');
    fs.mkdirSync(path.join(projectRoot, 'no-pkg'), { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  const lintAt = async (relativePath: string, code: string) => {
    const eslint = new ESLint({
      cwd: projectRoot,
      useEslintrc: false,
      fix: true,
      plugins: { '@blumintinc/blumint': plugin as never },
      overrideConfig: {
        parser: require.resolve('@typescript-eslint/parser'),
        parserOptions: {
          ecmaVersion: 2022 as const,
          sourceType: 'module' as const,
        },
        plugins: ['@blumintinc/blumint'],
        rules: { [RULE_ID]: 'error' as const },
      },
    });
    const [result] = await eslint.lintText(code, {
      filePath: path.join(projectRoot, relativePath),
    });
    return result.output ?? code;
  };

  const specifiersOf = (output: string) =>
    [...output.matchAll(/import \{ assertSafe \} from '([^']+)';/g)].map(
      (match) => match[1],
    );

  const SOURCE = 'export const read = (m, id) => m[`${id}`];\n';

  it('appends .js for a .js file under a "type": "module" manifest', async () => {
    const output = await lintAt('esm-pkg/app.js', SOURCE);

    expect(specifiersOf(output)).toEqual([
      '../functions/src/util/assertSafe.js',
    ]);
    expect(output).toContain('m[assertSafe(`${id}`)]');
  });

  it('leaves a .js file under a "type": "commonjs" manifest extensionless', async () => {
    const output = await lintAt('cjs-pkg/app.js', SOURCE);

    expect(specifiersOf(output)).toEqual(['../functions/src/util/assertSafe']);
  });

  it('leaves a .js file with no manifest above it extensionless', async () => {
    const output = await lintAt('no-pkg/app.js', SOURCE);

    expect(specifiersOf(output)).toEqual(['../functions/src/util/assertSafe']);
  });

  it('stops at the nearest manifest, so a typeless one shadows an ESM parent', async () => {
    const output = await lintAt('esm-pkg/sub/app.js', SOURCE);

    expect(specifiersOf(output)).toEqual([
      '../../functions/src/util/assertSafe',
    ]);
  });

  it('declines the extension on an unparseable manifest without throwing', async () => {
    const output = await lintAt('malformed-pkg/app.js', SOURCE);

    expect(specifiersOf(output)).toEqual(['../functions/src/util/assertSafe']);
  });

  it('appends .js for a .mjs file even under a CommonJS manifest', async () => {
    const output = await lintAt('cjs-pkg/app.mjs', SOURCE);

    expect(specifiersOf(output)).toEqual([
      '../functions/src/util/assertSafe.js',
    ]);
  });

  it('leaves a .ts file under an ESM manifest extensionless', async () => {
    const output = await lintAt(
      'esm-pkg/app.ts',
      'export const read = (m: Record<string, number>, id: string) => m[`${id}`];\n',
    );

    expect(specifiersOf(output)).toEqual(['../functions/src/util/assertSafe']);
  });
});

// Issue #2067: ESLint merges the fixes of one report into a single edit
// spanning [first start, last end]. The `import { assertSafe }` this rule
// injects is anchored at the top of the file, so bundling it with the wrap made
// the emitted edit claim everything from the file's first statement to the
// middle of the key's own access — a span that sorts ahead of every competing
// fix and wins against all of them, but only as far as its end. A formatter
// rewriting that same access spreads its edits across the whole of it, so its
// edits inside the span were discarded and its edits past the key were kept,
// and the halves did not fit together: `--fix` emitted a file that does not
// parse. The wrap therefore spans the ACCESS it rewrites, whose text it
// re-emits verbatim around the wrapped key. These cases pin that text on every
// shape the span has to reproduce.
const SPAN_TESTS: AssertSafeTests = {
  valid: [
    {
      name: 'a wrapped key on its own line after a parenthesized assertion',
      code: [
        IMPORT_LINE,
        'declare const result: unknown;',
        'declare const KEY: string;',
        'const entry = (result as Record<string, { event: unknown }>)[',
        '  assertSafe(KEY)',
        '];',
      ].join('\n'),
    },
    {
      name: 'a wrapped key in the shape prettier prints the assertion in',
      code: [
        IMPORT_LINE,
        'declare const result: unknown;',
        'declare const KEY: string;',
        'const entry = (',
        '  result as Record<',
        '    string,',
        '    { event: unknown }',
        '  >',
        ')[assertSafe(KEY)];',
      ].join('\n'),
    },
    {
      name: 'a wrapped key on its own line in an optional-chained access',
      code: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown> | undefined;',
        'declare const KEY: string;',
        'const entry = store?.[',
        '  assertSafe(KEY)',
        '];',
      ].join('\n'),
    },
    {
      name: 'a wrapped call-valued key on its own line',
      code: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const id: string;',
        'declare function resolveKey(id: string): string;',
        'const entry = store[',
        '  assertSafe(resolveKey(id))',
        '];',
      ].join('\n'),
    },
    {
      name: 'a string literal key on its own line needs no wrap',
      code: [
        'declare const store: Record<string, unknown>;',
        'const entry = store[',
        "  'alpha'",
        '];',
      ].join('\n'),
    },
    {
      name: 'a numeric literal key on its own line needs no wrap',
      code: [
        'declare const rows: unknown[];',
        'const entry = rows[',
        '  0',
        '];',
      ].join('\n'),
    },
    {
      name: 'an array-like receiver indexed on its own line needs no wrap',
      code: [
        'declare const items: unknown[];',
        'declare const index: number;',
        'const entry = items[',
        '  index',
        '];',
      ].join('\n'),
    },
    {
      name: 'a key the syntax proves numeric needs no wrap across lines',
      code: [
        'declare const store: Record<string, unknown>;',
        'const read = (offset: number) =>',
        '  store[',
        '    offset + 1',
        '  ];',
      ].join('\n'),
    },
    {
      name: 'a wrapped key across lines in an `in` comparison',
      code: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const id: string;',
        'const present =',
        '  assertSafe(id)',
        '  in store;',
      ].join('\n'),
    },
    {
      name: 'a wrapped computed property key across lines',
      code: [
        IMPORT_LINE,
        'declare const id: string;',
        'const row = {',
        '  [',
        '    assertSafe(id)',
        '  ]: 1,',
        '};',
      ].join('\n'),
    },
    {
      name: 'both levels of a nested access already wrapped',
      code: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const lookup: Record<string, string>;',
        'declare const KEY: string;',
        'const entry = store[',
        '  assertSafe(lookup[assertSafe(KEY)])',
        '];',
      ].join('\n'),
    },
    {
      name: 'a comment inside the brackets of a wrapped access',
      code: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'const entry = store[',
        '  // the caller picked this',
        '  assertSafe(KEY)',
        '];',
      ].join('\n'),
    },
  ],
  invalid: [
    {
      // The reproduction from issue #2067, verbatim.
      name: 'a key on its own line after a parenthesized type assertion',
      code: [
        'declare const result: unknown;',
        'declare const KEY: string;',
        'const entry = (result as Record<string, { event: unknown }>)[',
        '  KEY',
        '];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const result: unknown;',
        'declare const KEY: string;',
        'const entry = (result as Record<string, { event: unknown }>)[',
        '  assertSafe(KEY)',
        '];',
      ].join('\n'),
    },
    {
      name: 'the same assertion with the bracket and the key on one line',
      code: [
        'declare const result: unknown;',
        'declare const KEY: string;',
        'const entry = (result as Record<string, { event: unknown }>)[KEY];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const result: unknown;',
        'declare const KEY: string;',
        'const entry = (result as Record<string, { event: unknown }>)[assertSafe(KEY)];',
      ].join('\n'),
    },
    {
      name: 'the assertion in the shape prettier prints it in',
      code: [
        'declare const result: unknown;',
        'declare const KEY: string;',
        'const entry = (',
        '  result as Record<',
        '    string,',
        '    { event: unknown; props: { id: string } }',
        '  >',
        ')[KEY];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const result: unknown;',
        'declare const KEY: string;',
        'const entry = (',
        '  result as Record<',
        '    string,',
        '    { event: unknown; props: { id: string } }',
        '  >',
        ')[assertSafe(KEY)];',
      ].join('\n'),
    },
    {
      name: 'a plain identifier receiver with the key on its own line',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'const entry = store[',
        '  KEY',
        '];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'const entry = store[',
        '  assertSafe(KEY)',
        '];',
      ].join('\n'),
    },
    {
      name: 'a plain identifier receiver on one line',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'const entry = store[KEY];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'const entry = store[assertSafe(KEY)];',
      ].join('\n'),
    },
    {
      // The outer access contains the inner one, so the two spans overlap and
      // only the outer wrap survives the pass. The inner key is reported all
      // the same and lands on the next pass, which is what the multi-pass
      // fixture below asserts.
      name: 'a nested access as the key wraps outside-in',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const lookup: Record<string, string>;',
        'declare const KEY: string;',
        'const entry = store[',
        '  lookup[KEY]',
        '];',
      ].join('\n'),
      errors: 2,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const lookup: Record<string, string>;',
        'declare const KEY: string;',
        'const entry = store[',
        '  assertSafe(lookup[KEY])',
        '];',
      ].join('\n'),
    },
    {
      name: 'an optional-chained access with the key on its own line',
      code: [
        'declare const store: Record<string, unknown> | undefined;',
        'declare const KEY: string;',
        'const entry = store?.[',
        '  KEY',
        '];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown> | undefined;',
        'declare const KEY: string;',
        'const entry = store?.[',
        '  assertSafe(KEY)',
        '];',
      ].join('\n'),
    },
    {
      name: 'a computed key that is itself a call, on its own line',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const id: string;',
        'declare function resolveKey(id: string): string;',
        'const entry = store[',
        '  resolveKey(id)',
        '];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const id: string;',
        'declare function resolveKey(id: string): string;',
        'const entry = store[',
        '  assertSafe(resolveKey(id))',
        '];',
      ].join('\n'),
    },
    {
      name: 'a member-expression key on its own line',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const source: { key: string };',
        'const entry = store[',
        '  source.key',
        '];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const source: { key: string };',
        'const entry = store[',
        '  assertSafe(source.key)',
        '];',
      ].join('\n'),
    },
    {
      // The span re-emits everything between the brackets that is not the key,
      // so a comment the author put there has to come through untouched.
      name: 'a comment between the bracket and the key',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'const entry = store[',
        '  // the caller picked this',
        '  KEY',
        '];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'const entry = store[',
        '  // the caller picked this',
        '  assertSafe(KEY)',
        '];',
      ].join('\n'),
    },
    {
      name: 'a trailing comment between the key and its closing bracket',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'const entry = store[',
        '  KEY // the caller picked this',
        '];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'const entry = store[',
        '  assertSafe(KEY) // the caller picked this',
        '];',
      ].join('\n'),
    },
    {
      name: 'a comment between the receiver and the bracket',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'const entry = store /* dynamic */[KEY];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'const entry = store /* dynamic */[assertSafe(KEY)];',
      ].join('\n'),
    },
    {
      name: 'a computed property key across lines',
      code: [
        'declare const id: string;',
        'const row = {',
        '  [',
        '    String(id)',
        '  ]: 1,',
        '};',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const id: string;',
        'const row = {',
        '  [',
        '    assertSafe(String(id))',
        '  ]: 1,',
        '};',
      ].join('\n'),
    },
    {
      name: 'an `in` comparison split across lines',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const id: string;',
        'const present =',
        '  `${id}`',
        '  in store;',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const id: string;',
        'const present =',
        '  assertSafe(`${id}`)',
        '  in store;',
      ].join('\n'),
    },
    {
      name: 'an access in assignment-target position across lines',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'store[',
        '  KEY',
        '] = 1;',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const KEY: string;',
        'store[',
        '  assertSafe(KEY)',
        '] = 1;',
      ].join('\n'),
    },
    {
      name: 'a template literal key on its own line',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const id: string;',
        'const entry = store[',
        '  `${id}`',
        '];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const id: string;',
        'const entry = store[',
        '  assertSafe(`${id}`)',
        '];',
      ].join('\n'),
    },
    {
      name: 'an asserted key on its own line keeps its assertion',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const raw: unknown;',
        'const entry = store[',
        '  raw as string',
        '];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const raw: unknown;',
        'const entry = store[',
        '  assertSafe(raw as string)',
        '];',
      ].join('\n'),
    },
    {
      name: 'a non-null asserted key on its own line keeps its assertion',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const maybe: string | undefined;',
        'const entry = store[',
        '  maybe!',
        '];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const maybe: string | undefined;',
        'const entry = store[',
        '  assertSafe(maybe!)',
        '];',
      ].join('\n'),
    },
    {
      name: 'an awaited key on its own line keeps the await inside the wrap',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare function keyOf(): Promise<string>;',
        'export const read = async () =>',
        '  store[',
        '    await keyOf()',
        '  ];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare function keyOf(): Promise<string>;',
        'export const read = async () =>',
        '  store[',
        '    assertSafe(await keyOf())',
        '  ];',
      ].join('\n'),
    },
    {
      // Two accesses of one chain nest, so their spans overlap and the inner
      // one — the narrower of two edits starting at the same offset — is the
      // one ESLint keeps. The outer key is reported and wraps on the next pass.
      name: 'a chained double lookup wraps inside-out',
      code: [
        IMPORT_LINE,
        'declare const store: Record<string, Record<string, unknown>>;',
        'declare const outerKey: string;',
        'declare const innerKey: string;',
        'const entry = store[outerKey][innerKey];',
      ].join('\n'),
      errors: 2,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, Record<string, unknown>>;',
        'declare const outerKey: string;',
        'declare const innerKey: string;',
        'const entry = store[assertSafe(outerKey)][innerKey];',
      ].join('\n'),
    },
    {
      // The same access with the import already present, so the wrap is the
      // whole of the report's edit: the span still has to reach the closing
      // bracket, which is where the second corruption in #2067 landed.
      name: 'a key on its own line in a file that already imports the helper',
      code: [
        IMPORT_LINE,
        'declare const result: unknown;',
        'declare const KEY: string;',
        'const entry = (result as Record<string, { event: unknown }>)[',
        '  KEY',
        '];',
      ].join('\n'),
      errors: 1,
      output: [
        IMPORT_LINE,
        'declare const result: unknown;',
        'declare const KEY: string;',
        'const entry = (result as Record<string, { event: unknown }>)[',
        '  assertSafe(KEY)',
        '];',
      ].join('\n'),
    },
    {
      // Sibling accesses do not nest, so both wraps land in one pass.
      name: 'two sibling accesses in one statement both wrap in one pass',
      code: [
        'declare const store: Record<string, unknown>;',
        'declare const first: string;',
        'declare const second: string;',
        'const pair = [store[first], store[second]];',
      ].join('\n'),
      errors: 2,
      output: [
        IMPORT_LINE,
        'declare const store: Record<string, unknown>;',
        'declare const first: string;',
        'declare const second: string;',
        'const pair = [store[assertSafe(first)], store[assertSafe(second)]];',
      ].join('\n'),
    },
    {
      // Wrapping the key makes the parentheses around it redundant, and
      // prettier deletes a redundant pair — which is the churn #2108 is
      // about. A comment written inside the pair is the exception: the pair
      // is the group the author wrote the comment into, so dropping it would
      // move the comment out of that group. The pair stays, redundant or not.
      name: 'grouping parens carrying a block comment survive the wrap',
      code: [
        'const has = (obj, id) => (/* c */ String(id) as string) in obj;',
      ].join('\n'),
      errors: [lintError('String(id) as string')],
      output: [
        IMPORT_LINE,
        'const has = (obj, id) => (/* c */ assertSafe(String(id) as string)) in obj;',
      ].join('\n'),
    },
    {
      // A line comment decides which lines after it are commented out, so
      // moving it changes meaning rather than layout.
      name: 'grouping parens carrying a line comment survive the wrap',
      code: [
        'const has = (obj, id) =>',
        '  (',
        '    // c',
        '    String(id) as string',
        '  ) in obj;',
      ].join('\n'),
      errors: [lintError('String(id) as string')],
      output: [
        IMPORT_LINE,
        'const has = (obj, id) =>',
        '  (',
        '    // c',
        '    assertSafe(String(id) as string)',
        '  ) in obj;',
      ].join('\n'),
    },
    {
      // The run of parentheses is dropped as a whole; an inner pair left
      // behind is text prettier deletes on its next run.
      name: 'a nested run of grouping parens is dropped whole',
      code: ['const has = (obj, id) => ((String(id) as string)) in obj;'].join(
        '\n',
      ),
      errors: [lintError('String(id) as string')],
      output: [
        IMPORT_LINE,
        'const has = (obj, id) => assertSafe(String(id) as string) in obj;',
      ].join('\n'),
    },
    {
      // `return` may abut its argument’s parenthesis. Dropping the pair
      // there would fuse the keyword to the emitted call —
      // `returnassertSafe(...)` — so separating them is the one thing the
      // parenthesis is still doing, and it stays.
      name: 'grouping parens abutting a keyword are kept, or the two fuse',
      code: [
        'function f(obj, id) {',
        '  return(String(id) as string) in obj;',
        '}',
      ].join('\n'),
      errors: [lintError('String(id) as string')],
      output: [
        IMPORT_LINE,
        'function f(obj, id) {',
        '  return(assertSafe(String(id) as string)) in obj;',
        '}',
      ].join('\n'),
    },
    {
      // The wrap widens this line past the print width, so a break after
      // `=>` is what prettier would print — but only where the emitter can
      // say WHERE the break goes. A comment between `=>` and the body is
      // text this emitter does not own, so it declines and leaves the line
      // long; the formatter then decides, which costs layout, never meaning.
      name: 'a comment between => and the body declines the arrow break',
      code: [
        "const readSomething = (m: Record<string, number>, kind: 'live' | 'sim') => /* c */ m[kind];",
      ].join('\n'),
      errors: [lintError('kind')],
      output: [
        IMPORT_LINE,
        "const readSomething = (m: Record<string, number>, kind: 'live' | 'sim') => /* c */ m[assertSafe(kind)];",
      ].join('\n'),
    },
    {
      // The break after `=>` is already taken, so the wrap has nowhere to
      // move the body: prettier opens the lookup at its bracket and, where
      // the call still does not fit at the key's indent, the call at its
      // parenthesis (#2134). This is that output, so the sweep asserting
      // prettier stability over every fixture covers the shape.
      name: 'a wrap past the print width opens the lookup and the call',
      code: [
        'const read = (m: Record<string, number>) =>',
        '  m[someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth];',
      ].join('\n'),
      errors: [
        lintError(
          'someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth',
        ),
      ],
      output: [
        IMPORT_LINE,
        'const read = (m: Record<string, number>) =>',
        '  m[',
        '    assertSafe(',
        '      someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth,',
        '    )',
        '  ];',
      ].join('\n'),
    },
    {
      // The call is measured on the key's own line: one that fits there
      // stays flat inside the opened lookup.
      name: 'a wrap past the print width keeps a call that fits at the key indent flat',
      code: [
        'const read = (m: Record<string, number>) =>',
        '  m[someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthXx];',
      ].join('\n'),
      errors: [
        lintError(
          'someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthXx',
        ),
      ],
      output: [
        IMPORT_LINE,
        'const read = (m: Record<string, number>) =>',
        '  m[',
        '    assertSafe(someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthXx)',
        '  ];',
      ].join('\n'),
    },
    {
      // The other direction: a wrap that lands exactly on the print width
      // is a line prettier keeps, so no break is emitted.
      name: 'a wrap that lands exactly on the print width stays flat',
      code: [
        'const read = (m: Record<string, number>) =>',
        '  m[someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthX];',
      ].join('\n'),
      errors: [
        lintError(
          'someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthX',
        ),
      ],
      output: [
        IMPORT_LINE,
        'const read = (m: Record<string, number>) =>',
        '  m[assertSafe(someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthX)];',
      ].join('\n'),
    },
    {
      // The call's own boundary, pinned from both sides: at exactly the
      // print width it stays flat; one column past it, it opens.
      name: 'a wrapped call landing exactly on the print width stays flat in the lookup',
      code: [
        'const read = (m: Record<string, number>) =>',
        '  m[aKeyWhoseWrappedCallLandsExactlyOnTheEightyColumnMarkWhenSetInXy];',
      ].join('\n'),
      errors: [
        lintError(
          'aKeyWhoseWrappedCallLandsExactlyOnTheEightyColumnMarkWhenSetInXy',
        ),
      ],
      output: [
        IMPORT_LINE,
        'const read = (m: Record<string, number>) =>',
        '  m[',
        '    assertSafe(aKeyWhoseWrappedCallLandsExactlyOnTheEightyColumnMarkWhenSetInXy)',
        '  ];',
      ].join('\n'),
    },
    {
      name: 'a wrapped call one column past the print width opens at its parenthesis',
      code: [
        'const read = (m: Record<string, number>) =>',
        '  m[aKeyWhoseWrappedCallLandsJustOneColumnPastTheEightyMarkWhenSetInX];',
      ].join('\n'),
      errors: [
        lintError(
          'aKeyWhoseWrappedCallLandsJustOneColumnPastTheEightyMarkWhenSetInX',
        ),
      ],
      output: [
        IMPORT_LINE,
        'const read = (m: Record<string, number>) =>',
        '  m[',
        '    assertSafe(',
        '      aKeyWhoseWrappedCallLandsJustOneColumnPastTheEightyMarkWhenSetInX,',
        '    )',
        '  ];',
      ].join('\n'),
    },
    {
      // Prettier opens only the outermost lookup; everything through its
      // bracket — here the optional chain — stays on the body's line.
      name: 'an optional-chained lookup past the print width opens at its bracket',
      code: [
        'const read = (m?: Record<string, number>) =>',
        '  m?.[someLongKeyNameThatPushesThisLinePastEightyColumnsInOptionalMap];',
      ].join('\n'),
      errors: [
        lintError(
          'someLongKeyNameThatPushesThisLinePastEightyColumnsInOptionalMap',
        ),
      ],
      output: [
        IMPORT_LINE,
        'const read = (m?: Record<string, number>) =>',
        '  m?.[',
        '    assertSafe(someLongKeyNameThatPushesThisLinePastEightyColumnsInOptionalMap)',
        '  ];',
      ].join('\n'),
    },
    {
      // The indent is the body line's own, and a `,` closing an element is
      // as much the end of the line as a `;` closing a statement.
      name: 'a property-valued arrow body past the print width opens at its indent',
      code: [
        'run({',
        '  read: (m: Record<string, number>) =>',
        '    m[someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnWidth],',
        '});',
      ].join('\n'),
      errors: [
        lintError(
          'someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnWidth',
        ),
      ],
      output: [
        IMPORT_LINE,
        'run({',
        '  read: (m: Record<string, number>) =>',
        '    m[',
        '      assertSafe(someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnWidth)',
        '    ],',
        '});',
      ].join('\n'),
    },
    {
      // A comment on a line of its own between `=>` and the body leaves
      // the body's layout untouched — prettier keeps it on that line and
      // opens the lookup exactly as it would without it — so it is carried,
      // not declined around.
      name: 'a comment on its own line above the body rides with the opened lookup',
      code: [
        'const read = (m: Record<string, number>) =>',
        '  // chosen by the caller',
        '  m[someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthXx];',
      ].join('\n'),
      errors: [
        lintError(
          'someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthXx',
        ),
      ],
      output: [
        IMPORT_LINE,
        'const read = (m: Record<string, number>) =>',
        '  // chosen by the caller',
        '  m[',
        '    assertSafe(someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthXx)',
        '  ];',
      ].join('\n'),
    },
    {
      // A comment trailing the `;` stays where it is — prettier leaves it
      // after the `;` on the closing line when it opens the lookup — so it
      // rides along rather than turning the break off.
      name: 'a block comment trailing the semicolon rides on the closing line',
      code: [
        'const read = (m: Record<string, number>) =>',
        '  m[someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth]; /* a */',
      ].join('\n'),
      errors: [
        lintError(
          'someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth',
        ),
      ],
      output: [
        IMPORT_LINE,
        'const read = (m: Record<string, number>) =>',
        '  m[',
        '    assertSafe(',
        '      someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth,',
        '    )',
        '  ]; /* a */',
      ].join('\n'),
    },
    {
      name: 'a line comment trailing the semicolon rides on the closing line',
      code: [
        'const read = (m: Record<string, number>) =>',
        '  m[someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthXx]; // note',
      ].join('\n'),
      errors: [
        lintError(
          'someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthXx',
        ),
      ],
      output: [
        IMPORT_LINE,
        'const read = (m: Record<string, number>) =>',
        '  m[',
        '    assertSafe(someLongKeyNameThatPushesThisLineJustPastTheEightyColumnWidthXx)',
        '  ]; // note',
      ].join('\n'),
    },
  ],
};

ruleTesterTs.run(
  'enforce-assert-safe-object-key: the fix owns the access it rewrites (issue #2067)',
  enforceAssertSafeObjectKey,
  SPAN_TESTS,
);

// A coercion the author wrote — `String(k)` or a template that interpolates
// nothing else — is part of the key, not scaffolding around it. assertSafe
// VALIDATES a key and never coerces one: it throws on any argument whose
// `typeof` is neither `string` nor `number`. Replacing the coercion with its
// operand therefore rewrites working code into code that throws on its first
// call, which is what a `Record<`${boolean}`, …>` lookup did in agora (#2144).
// The fix wraps the key as written, which is also what the multi-substitution
// template has always done.
const COERCION_TESTS: AssertSafeTests = {
  valid: [
    {
      name: 'a template carrying fixed text before its substitution',
      code: `
declare const R: Record<string, number>;
export const f = (id: string) => R[\`user-\${id}\`];
      `,
    },
    {
      name: 'a template carrying fixed text between two substitutions',
      code: `
declare const R: Record<string, number>;
export const f = (a: string, b: string) => R[\`\${a}-\${b}\`];
      `,
    },
    {
      name: 'a wrapped template key is already validated',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const R: Record<string, number>;
export const f = (id: string) => R[assertSafe(\`\${id}\`)];
      `,
    },
    {
      name: 'a wrapped String() key is already validated',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const R: Record<string, number>;
export const f = (id: string) => R[assertSafe(String(id))];
      `,
    },
    {
      name: 'a wrapped String() key in a destructuring property',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const R: Record<string, number>;
export const f = (id: string) => {
  const { [assertSafe(String(id))]: v } = R;
  return v;
};
      `,
    },
    {
      name: 'a wrapped template key on the left of `in`',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const R: Record<string, number>;
export const f = (id: string) => assertSafe(\`\${id}\`) in R;
      `,
    },
  ],
  invalid: [
    {
      // The issue's own reproduction. `assertSafe(isArmed)` throws
      // `Invalid Key Type boolean` on every call; `assertSafe(`${isArmed}`)`
      // hands it the string the template built, which is what the Record is
      // keyed by.
      name: 'a boolean-keyed Record lookup keeps its template (issue #2144)',
      code: `
const NOTICE: Readonly<Record<\`\${boolean}\`, string>> = {
  false: 'unarmed',
  true: 'armed',
};
export function describe(isArmed: boolean) {
  return NOTICE[\`\${isArmed}\`];
}
      `,
      errors: [lintError('`${isArmed}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const NOTICE: Readonly<Record<\`\${boolean}\`, string>> = {
  false: 'unarmed',
  true: 'armed',
};
export function describe(isArmed: boolean) {
  return NOTICE[assertSafe(\`\${isArmed}\`)];
}
      `,
    },
    {
      name: 'a member lookup keyed by a sole-substitution template',
      code: `
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[\`\${id}\`];
      `,
      errors: [lintError('`${id}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[assertSafe(\`\${id}\`)];
      `,
    },
    {
      name: 'a member lookup keyed by String()',
      code: `
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[String(id)];
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[assertSafe(String(id))];
      `,
    },
    {
      name: 'an `in` test keyed by a sole-substitution template',
      code: `
declare const store: Record<string, unknown>;
export const has = (id: boolean) => \`\${id}\` in store;
      `,
      errors: [lintError('`${id}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const has = (id: boolean) => assertSafe(\`\${id}\`) in store;
      `,
    },
    {
      name: 'an `in` test keyed by String()',
      code: `
declare const store: Record<string, unknown>;
export const has = (id: boolean) => String(id) in store;
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const has = (id: boolean) => assertSafe(String(id)) in store;
      `,
    },
    {
      name: 'a destructuring property keyed by a sole-substitution template',
      code: `
declare const store: Record<string, unknown>;
export const read = (id: boolean) => {
  const { [\`\${id}\`]: value } = store;
  return value;
};
      `,
      errors: [lintError('`${id}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (id: boolean) => {
  const { [assertSafe(\`\${id}\`)]: value } = store;
  return value;
};
      `,
    },
    {
      name: 'a destructuring property keyed by String()',
      code: `
declare const store: Record<string, unknown>;
export const read = (id: boolean) => {
  const { [String(id)]: value } = store;
  return value;
};
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (id: boolean) => {
  const { [assertSafe(String(id))]: value } = store;
  return value;
};
      `,
    },
    {
      // The shape that was already correct, kept as the regression guard that
      // the sole-substitution case was aligned WITH rather than away from.
      name: 'a multi-substitution template is still wrapped whole',
      code: `
declare const store: Record<string, unknown>;
export const read = (a: boolean, b: boolean) => store[\`\${a}\${b}\`];
      `,
      errors: [lintError('`${a}${b}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (a: boolean, b: boolean) => store[assertSafe(\`\${a}\${b}\`)];
      `,
    },
    {
      name: 'an assertion around a template key keeps both',
      code: `
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[\`\${id}\` as string];
      `,
      errors: [lintError('`${id}` as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[assertSafe(\`\${id}\` as string)];
      `,
    },
    {
      name: 'an assertion around a String() key keeps both',
      code: `
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[String(id) as string];
      `,
      errors: [lintError('String(id) as string')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[assertSafe(String(id) as string)];
      `,
    },
    {
      name: 'a non-null assertion around a String() key keeps both',
      code: `
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[String(id)!];
      `,
      errors: [lintError('String(id)!')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[assertSafe(String(id)!)];
      `,
    },
    {
      // The await stays inside the template, where it resolves the value the
      // template widens — moving it would validate the promise instead.
      name: 'an awaited substitution stays inside the template',
      code: `
declare const store: Record<string, unknown>;
export const read = async (p: Promise<boolean>) => store[\`\${await p}\`];
      `,
      errors: [lintError('`${await p}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = async (p: Promise<boolean>) =>
  store[assertSafe(\`\${await p}\`)];
      `,
    },
    {
      name: 'an optional-chained substitution stays inside the template',
      code: `
declare const store: Record<string, unknown>;
export const read = (s?: { k: boolean }) => store[\`\${s?.k}\`];
      `,
      errors: [lintError('`${s?.k}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (s?: { k: boolean }) => store[assertSafe(\`\${s?.k}\`)];
      `,
    },
    {
      name: 'a member-expression operand stays inside String()',
      code: `
declare const store: Record<string, unknown>;
export const read = (s: { k: boolean }) => store[String(s.k)];
      `,
      errors: [lintError('String(s.k)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (s: { k: boolean }) => store[assertSafe(String(s.k))];
      `,
    },
    {
      name: 'a call-valued operand stays inside String()',
      code: `
declare const store: Record<string, unknown>;
declare function resolve(): boolean;
export const read = () => store[String(resolve())];
      `,
      errors: [lintError('String(resolve())')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
declare function resolve(): boolean;
export const read = () => store[assertSafe(String(resolve()))];
      `,
    },
    {
      name: 'a ternary operand stays inside the template',
      code: `
declare const store: Record<string, unknown>;
export const read = (f: boolean, a: boolean, b: boolean) =>
  store[\`\${f ? a : b}\`];
      `,
      errors: [lintError('`${f ? a : b}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (f: boolean, a: boolean, b: boolean) =>
  store[assertSafe(\`\${f ? a : b}\`)];
      `,
    },
    {
      name: 'a nested String() operand is preserved in full',
      code: `
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[String(String(id))];
      `,
      errors: [lintError('String(String(id))')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const read = (id: boolean) => store[assertSafe(String(String(id)))];
      `,
    },
    {
      name: 'an assignment target keyed by a template keeps its coercion',
      code: `
declare const store: Record<string, unknown>;
export const write = (id: boolean) => {
  store[\`\${id}\`] = 1;
};
      `,
      errors: [lintError('`${id}`')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const write = (id: boolean) => {
  store[assertSafe(\`\${id}\`)] = 1;
};
      `,
    },
    {
      name: 'a delete target keyed by String() keeps its coercion',
      code: `
declare const store: Record<string, unknown>;
export const drop = (id: boolean) => {
  delete store[String(id)];
};
      `,
      errors: [lintError('String(id)')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
declare const store: Record<string, unknown>;
export const drop = (id: boolean) => {
  delete store[assertSafe(String(id))];
};
      `,
    },
  ],
};

ruleTesterTs.run(
  'enforce-assert-safe-object-key: a coercion is wrapped, not replaced (issue #2144)',
  enforceAssertSafeObjectKey,
  COERCION_TESTS,
);

// A wrap widens the line it lands on, so where prettier would then break
// after `=>` the fixer emits that break itself rather than leave churn
// (#2108), and where that break is already taken it opens the lookup at its
// bracket instead (#2134). It declines wherever it cannot say WHERE the break
// goes — an access the author already broke across lines is one such place,
// because the single line the width was measured on is not the whole of what
// moves; a key too long for even its own line, or a comment inside the
// lookup, are two more.
//
// These cases are driven through a bare `Linter` rather than declared as
// RuleTester fixtures on purpose: reaching a decline REQUIRES a line past the
// print width (the wrap only ever widens), so the output is one prettier must
// re-wrap. Declaring one as a fixture would put a knowingly non-fixed-point
// case into the corpus the #2108 sweep asserts over.
describe('enforce-assert-safe-object-key: the arrow break declines (issue #2108)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-assert-safe-object-key';

  const fixOf = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      'ts',
      typescriptParser as unknown as Linter.ParserModule,
    );
    linter.defineRule(
      RULE_ID,
      enforceAssertSafeObjectKey as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(
      code,
      {
        parser: 'ts',
        parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { [RULE_ID]: 'error' },
      } as unknown as Linter.Config,
      { filename: 'x.ts' },
    );
  };

  it('leaves an already-broken access alone rather than guess a break', () => {
    const fixed = fixOf(
      [
        'const read = (m: Record<string, number>) => m[',
        '    someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth',
        '  ];',
      ].join('\n'),
    );

    // The key is still wrapped — declining the BREAK must never decline the
    // safety fix that is the rule’s whole purpose.
    expect(fixed.output).toContain(
      'assertSafe(someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth)',
    );
    // And no break was invented after the arrow.
    expect(fixed.output).toContain('=> m[');
    expect(parseFailure(fixed.output)).toBeNull();
  });

  it('a comment between => and the body also declines the break', () => {
    const fixed = fixOf(
      "const readSomething = (m: Record<string, number>, kind: 'live' | 'sim') => /* c */ m[kind];",
    );

    expect(fixed.output).toContain('/* c */ m[assertSafe(kind)]');
    expect(parseFailure(fixed.output)).toBeNull();
  });

  it('the break IS emitted where the emitter can place it', () => {
    // The positive control: without this, every assertion above would pass on
    // a fixer that had simply stopped breaking anywhere.
    const fixed = fixOf(
      "const read = (m: Record<string, number>, kind: 'live' | 'simulated') => m[kind];",
    );

    expect(fixed.output).toContain('=>\n  m[assertSafe(kind)]');
  });

  it('a key too long for even its own line declines the lookup break', () => {
    // Opening the lookup and the call would still leave the argument's line
    // past the print width, and how prettier lays THAT out is not modelled —
    // so the emission is the one-line wrap, as it was before #2134.
    const fixed = fixOf(
      [
        'const read = (m: Record<string, number>) =>',
        '  m[aKeyTooLongToFitEvenOnItsOwnLineAtTheArgumentIndentSoTheBreakIsDeclinedHere];',
      ].join('\n'),
    );

    expect(fixed.output).toContain(
      '=>\n  m[assertSafe(aKeyTooLongToFitEvenOnItsOwnLineAtTheArgumentIndentSoTheBreakIsDeclinedHere)];',
    );
    expect(parseFailure(fixed.output)).toBeNull();
  });

  it('a comment inside the lookup declines the lookup break', () => {
    // Where prettier carries a comment when it opens the lookup is not
    // modelled either; the comment stays exactly where it was written.
    const fixed = fixOf(
      [
        'const read = (m: Record<string, number>) =>',
        '  m[someLongKeyNameWhoseCommentKeepsTheLookupOnOneLinePastEighty /* c */];',
      ].join('\n'),
    );

    expect(fixed.output).toContain(
      '=>\n  m[assertSafe(someLongKeyNameWhoseCommentKeepsTheLookupOnOneLinePastEighty) /* c */];',
    );
    expect(parseFailure(fixed.output)).toBeNull();
  });

  it('a comment trailing the arrow on its own line declines the lookup break', () => {
    // Prettier moves a comment written after `=>` into the parameter list,
    // which is a relocation this emitter does not model; the comment stays
    // where it was written and the wrap ships on one line.
    const fixed = fixOf(
      [
        'const read = (m: Record<string, number>) => /* c */',
        '  m[someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth];',
      ].join('\n'),
    );

    expect(fixed.output).toContain(
      '=> /* c */\n  m[assertSafe(someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth)];',
    );
    expect(parseFailure(fixed.output)).toBeNull();
  });

  it('a comment trailing an element\u2019s comma declines the lookup break', () => {
    // Prettier re-hosts a comment written after a `,` to BEFORE the comma
    // when it opens the lookup — a relocation the emitter does not model, so
    // the wrap ships on one line and the comment stays where it was written.
    const fixed = fixOf(
      [
        'run({',
        '  read: (m: Record<string, number>) =>',
        '    m[someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnWidth], /* c */',
        '});',
      ].join('\n'),
    );

    expect(fixed.output).toContain(
      '    m[assertSafe(someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnWidth)], /* c */',
    );
    expect(parseFailure(fixed.output)).toBeNull();
  });

  it('the lookup break IS emitted where the emitter can place it', () => {
    // The positive control for the two declines above (#2134).
    const fixed = fixOf(
      [
        'const read = (m: Record<string, number>) =>',
        '  m[someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth];',
      ].join('\n'),
    );

    expect(fixed.output).toContain(
      [
        '=>',
        '  m[',
        '    assertSafe(',
        '      someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth,',
        '    )',
        '  ];',
      ].join('\n'),
    );
  });
});

// Issue #2067: the corruption this rule shipped was invisible to every fixture
// above, because a fixture compares one rule's output against a string. It took
// a second fixer competing for the same lines — the formatter agora runs beside
// this plugin — to show it: ESLint discarded the competitor's edits that fell
// inside this rule's merged span and kept the ones past its end, and the halves
// did not fit together. These cases drive the real multi-pass `Linter` with both
// fixers configured and assert the one property a fixture cannot: the file
// ESLint writes parses.
describe('enforce-assert-safe-object-key --fix beside a formatter (issue #2067)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-assert-safe-object-key';
  const FORMATTER_ID = 'prettier/prettier';
  const FILENAME = path.join(
    process.cwd(),
    'functions/src/webhooks/extractProcessorProps.test.ts',
  );
  const FORMATTER_OPTIONS = {
    parser: 'typescript',
    singleQuote: true,
    trailingComma: 'all',
  };

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const formatterRule = require('eslint-plugin-prettier').rules
    .prettier as Rule.RuleModule;

  /**
   * The same formatter, reporting from `Program:exit` instead of `Program`.
   *
   * Which of two fixes ESLint keeps at one location is decided by the order the
   * reports arrive in, and that order is the order the rules' visitors fire —
   * so this rule loses the race to a formatter that reports on the way in and
   * wins it against one that reports on the way out. Both are formatters a
   * consumer plausibly runs, and the file has to parse either way.
   */
  const deferredFormatterRule: Rule.RuleModule = {
    meta: formatterRule.meta,
    create(context) {
      const visitor = formatterRule.create(context) as unknown as Record<
        string,
        (node: unknown) => void
      >;
      return {
        'Program:exit'(node) {
          visitor.Program(node);
        },
      };
    },
  };

  const makeLinter = (formatter: Rule.RuleModule = formatterRule) => {
    const linter = new Linter();
    linter.defineParser('@typescript-eslint/parser', typescriptParser);
    linter.defineRule(
      RULE_ID,
      enforceAssertSafeObjectKey as unknown as Rule.RuleModule,
    );
    linter.defineRule(FORMATTER_ID, formatter);
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules,
  });

  const RULE_ONLY: Linter.RulesRecord = { [RULE_ID]: 'error' };
  const FORMATTER_ONLY: Linter.RulesRecord = {
    [FORMATTER_ID]: ['error', FORMATTER_OPTIONS],
  };
  const BOTH: Linter.RulesRecord = { ...RULE_ONLY, ...FORMATTER_ONLY };

  // The key sits on its own line because the access ahead of it is too wide for
  // the print width — which is exactly the state that makes the formatter want
  // to rewrite the whole access, and the discriminator the issue reported.
  const UNFORMATTED = [
    "export const KEY = 'a' as const;",
    '',
    'export function readIt(result: unknown) {',
    '  const entry = (result as Record<string, { event: unknown; props: { integration: unknown; messageId: string } }>)[',
    '    KEY',
    '  ];',
    '  return entry;',
    '}',
  ].join('\n');

  const UNFORMATTED_WITH_IMPORT = [
    "import { assertSafe } from '../util/assertSafe';",
    UNFORMATTED,
  ].join('\n');

  it('the formatter really competes, on both sides of the key', () => {
    // Without this the composition below proves nothing: a formatter that
    // reports no fix, or reports one fix, cannot be split in half.
    const fixes = makeLinter()
      .verify(UNFORMATTED, configFor(FORMATTER_ONLY), FILENAME)
      .map((message) => message.fix)
      .filter((fix): fix is NonNullable<typeof fix> => !!fix);
    expect(fixes.length).toBeGreaterThanOrEqual(3);

    const keyStart = UNFORMATTED.indexOf('    KEY') + 4;
    expect(fixes.some((fix) => fix.range[0] < keyStart)).toBe(true);
    expect(fixes.some((fix) => fix.range[0] > keyStart)).toBe(true);
  });

  it('this rule alone wraps the key', () => {
    const fixed = makeLinter().verifyAndFix(
      UNFORMATTED,
      configFor(RULE_ONLY),
      FILENAME,
    );
    expect(fixed.output).toContain('assertSafe(KEY)');
  });

  it('emits a file that parses when the import rides along', () => {
    const fixed = makeLinter().verifyAndFix(
      UNFORMATTED,
      configFor(BOTH),
      FILENAME,
    );

    expect(fixed.output).toContain('assertSafe(KEY)');
    expect(fixed.output).toContain(
      "import { assertSafe } from '../util/assertSafe';",
    );
    expect(parseFailure(fixed.output)).toBeNull();
    expect(fixed.messages.filter((message) => message.fatal)).toEqual([]);
    // The `)[KEY]` tail the issue reported surviving beside the wrap.
    expect(fixed.output).not.toContain(')[KEY]');
  });

  it('emits a file that parses when the helper is already imported', () => {
    const fixed = makeLinter().verifyAndFix(
      UNFORMATTED_WITH_IMPORT,
      configFor(BOTH),
      FILENAME,
    );

    expect(fixed.output).toContain('assertSafe(KEY)');
    expect(parseFailure(fixed.output)).toBeNull();
    expect(fixed.messages.filter((message) => message.fatal)).toEqual([]);
  });

  it('emits a file that parses when the formatter reports last', () => {
    // The arm where this rule WINS the race: its fix is applied and the
    // formatter's competing edits are the ones discarded. Both files below are
    // the shapes #2067 measured — the second is the one the real file was
    // corrupted into, with the assertion's closing `>` consumed.
    for (const source of [UNFORMATTED, UNFORMATTED_WITH_IMPORT]) {
      const fixed = makeLinter(deferredFormatterRule).verifyAndFix(
        source,
        configFor(BOTH),
        FILENAME,
      );

      expect(fixed.output).toContain('assertSafe(KEY)');
      expect(parseFailure(fixed.output)).toBeNull();
      expect(fixed.messages.filter((message) => message.fatal)).toEqual([]);
    }
  });

  it('the deferred formatter really reports after this rule', () => {
    // Without this the arm above proves nothing: it is the report ORDER that
    // puts this rule's fix ahead of the formatter's.
    const order = makeLinter(deferredFormatterRule)
      .verify(UNFORMATTED, configFor(BOTH), FILENAME)
      .filter((message) => message.line === 5)
      .map((message) => message.ruleId);

    expect(order).toEqual([RULE_ID, FORMATTER_ID]);
  });

  it('leaves the formatter nothing left to say', () => {
    const fixed = makeLinter().verifyAndFix(
      UNFORMATTED,
      configFor(BOTH),
      FILENAME,
    );

    expect(
      makeLinter().verify(fixed.output, configFor(BOTH), FILENAME),
    ).toEqual([]);
  });

  it('the parse check sees the corruption the issue reported', () => {
    // The planted control for every `parseFailure(...) === null` above: the
    // output #2067 measured, which wrote the wrap over the wrong span and left
    // the original `)[KEY]` tail behind.
    const corrupted = [
      "import { assertSafe } from '../util/assertSafe';",
      "export const KEY = 'a' as const;",
      '',
      'export function readIt(result: unknown) {',
      '  const entry = (result as Record<string, { event: unknown }>)[',
      '    assertSafe(KEY)',
      '  )[KEY];',
      '  return entry;',
      '}',
    ].join('\n');

    expect(parseFailure(corrupted)).not.toBeNull();
  });
});

// Issue #2067: a wrong replacement range is invisible in a fixture diff — the
// output string simply differs — but fatal in a file. This sweep re-lints what
// the fixer writes for EVERY invalid fixture this file declares and requires it
// to parse.
describe('enforce-assert-safe-object-key: every fixed fixture parses (issue #2067)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-assert-safe-object-key';

  const makeLinter = (rule: Rule.RuleModule) => {
    const linter = new Linter();
    linter.defineParser('@typescript-eslint/parser', typescriptParser);
    linter.defineRule(RULE_ID, rule);
    return linter;
  };

  type Fixture = {
    code: string;
    filename?: string;
    options?: readonly unknown[];
    parserOptions?: Linter.ParserOptions;
  };

  const FIXTURES: Fixture[] = [
    MAIN_TESTS,
    PRIVATE_MEMBER_TESTS,
    BOUNDED_RECORD_TESTS,
    SPAN_TESTS,
  ].flatMap((suite) => suite.invalid as unknown as Fixture[]);

  const fixWith = (rule: Rule.RuleModule, fixture: Fixture) =>
    makeLinter(rule).verifyAndFix(
      fixture.code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2022 as const,
          sourceType: 'module' as const,
          ...fixture.parserOptions,
        },
        rules: {
          [RULE_ID]: fixture.options
            ? ['error', ...(fixture.options as unknown[])]
            : 'error',
        },
      } as Linter.Config,
      fixture.filename ?? 'file.ts',
    );

  const subject = enforceAssertSafeObjectKey as unknown as Rule.RuleModule;

  it('sweeps every invalid fixture, and most of them are rewritten', () => {
    // Floors just under the measured values: a suite that stops declaring
    // fixtures, or a rule that stops fixing them, would otherwise leave the
    // assertion below passing over nothing.
    expect(FIXTURES.length).toBeGreaterThanOrEqual(210);

    const rewritten = FIXTURES.filter(
      (fixture) => fixWith(subject, fixture).output !== fixture.code,
    );
    expect(rewritten.length).toBeGreaterThanOrEqual(196);
  });

  it('emits text that parses for every invalid fixture', () => {
    const broken = FIXTURES.map((fixture) => {
      const fixed = fixWith(subject, fixture);
      return { fixture, failure: parseFailure(fixed.output) };
    }).filter((entry) => entry.failure !== null);

    expect(
      broken.map((entry) => `${entry.failure}: ${entry.fixture.code}`),
    ).toEqual([]);
  });

  it('reports nothing fatal on what it wrote', () => {
    const fatal = FIXTURES.flatMap((fixture) =>
      fixWith(subject, fixture).messages.filter((message) => message.fatal),
    );
    expect(fatal).toEqual([]);
  });

  it('the sweep catches a fixer whose range is wrong', () => {
    // The planted positive control. This fixer wraps the key with the call it
    // never closes — the same class of defect as writing the wrap over a span
    // that ends short of the closing bracket — and the sweep above has to see
    // it, or its clean result means nothing.
    const brokenFixer: Rule.RuleModule = {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { useAssertSafe: 'planted' },
      },
      create(context) {
        return {
          MemberExpression(node) {
            const member = node as unknown as {
              computed: boolean;
              property: { type: string };
            };
            if (!member.computed || member.property.type === 'Literal') {
              return;
            }
            context.report({
              node: member.property as never,
              messageId: 'useAssertSafe',
              fix: (fixer) =>
                fixer.insertTextBefore(member.property as never, 'assertSafe('),
            });
          },
        };
      },
    };

    const broken = FIXTURES.filter(
      (fixture) => parseFailure(fixWith(brokenFixer, fixture).output) !== null,
    );
    expect(broken.length).toBeGreaterThanOrEqual(150);
  });
});
