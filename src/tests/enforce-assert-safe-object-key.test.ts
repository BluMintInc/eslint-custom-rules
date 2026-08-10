import fs from 'fs';
import os from 'os';
import path from 'path';
import { ESLint, Linter, Rule } from 'eslint';
import type { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertSafeObjectKey } from '../rules/enforce-assert-safe-object-key';

const buildMessage = (key: string) =>
  `Dynamic object key "${key}" is used without assertSafe() validation. Unvalidated keys can resolve to unexpected properties (including prototype fields) and make lookups fragile or unsafe. Wrap the key with assertSafe(${key}) before accessing the object.`;

const lintError = (key: string): TSESLint.TestCaseError<'useAssertSafe'> =>
  ({
    message: buildMessage(key),
  } as unknown as TSESLint.TestCaseError<'useAssertSafe'>);

ruleTesterTs.run('enforce-assert-safe-object-key', enforceAssertSafeObjectKey, {
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
  ],
  invalid: [
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
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
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[\`\${id}\`]);
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
      errors: [lintError('id')],
      output: `
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
console.log(obj[\`\${id}\`]);
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
      code: `
import something from 'other-module';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value = obj[String(id)];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
import something from 'other-module';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value = obj[assertSafe(id)];
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value1 = obj[String(id)];
const value2 = obj[\`\${id}\`];
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value1 = obj[assertSafe(id)];
const value2 = obj[assertSafe(id)];
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
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
function process(id) {
  return obj[assertSafe(id)];
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
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const nested = { obj };
console.log(nested.obj[assertSafe(id)]);
      `,
    },
    {
      code: `
const data = { users: { user1: { name: 'John' } } };
const userId = 'user1';
console.log(data.users[String(userId)].name);
      `,
      errors: [lintError('userId')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const data = { users: { user1: { name: 'John' } } };
const userId = 'user1';
console.log(data.users[assertSafe(userId)].name);
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
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class DataStore {
  constructor() {
    this.data = { key1: 'value1' };
  }

  getValue(id) {
    return this.data[assertSafe(id)];
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
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
obj[assertSafe(id)] = 'new value';
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
delete obj[String(id)];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
delete obj[assertSafe(id)];
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const hasKey = String(id) in obj;
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const hasKey = assertSafe(id) in obj;
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const { [String(id)]: value } = obj;
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const { [assertSafe(id)]: value } = obj;
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
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]); // Redundant string conversion
console.log(obj[assertSafe(id)]); // Unnecessary template literal usage
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
      errors: [lintError('idx')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { 0: 'value1' };
const idx = 0;
console.log(obj[assertSafe(idx)]);
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
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class DataStore {
  getValue(id) {
    return this.data[assertSafe(id)];
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
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[assertSafe(id)];
const third = obj[assertSafe(id)];
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
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const { [String(id)]: first } = obj;
const exists = assertSafe(id) in obj;
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
      errors: [lintError('id')],
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
      errors: [lintError('id')],
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
      errors: [lintError('id'), lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
const second = obj[assertSafe(id)];
const third = obj[assertSafe(id)];
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
      errors: [lintError('id')],
      output: `'use client';
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
`,
    },
    {
      name: 'a shebang stays at character 0 ahead of the injected import',
      code: `#!/usr/bin/env node
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
`,
      errors: [lintError('id')],
      output: `#!/usr/bin/env node
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
`,
    },
    {
      name: 'a @ts-nocheck header keeps covering the code below the injected import',
      code: `// @ts-nocheck
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
`,
      errors: [lintError('id')],
      output: `// @ts-nocheck
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
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
      errors: [lintError('id')],
      output: `'use client';
import { assertSafe } from 'functions/src/util/assertSafe';
import something from 'other-module';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)], something);
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
const has = (obj, id) => (assertSafe(String(id) as string)) in obj;
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
const has = (obj, id) => (assertSafe(String?.(id))) in obj;
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
  ],
});

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
ruleTesterTs.run(
  'enforce-assert-safe-object-key: compiler-bounded Record lookups (issue #1875)',
  enforceAssertSafeObjectKey,
  {
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
        // reporting even when both bindings are bounded — the conversion is
        // what the rule exists to flag, and assertSafe subsumes it.
        name: 'String() conversion of a bounded key still reports',
        code: `
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, string>, kind: Kind) => m[String(kind)];
      `,
        errors: [lintError('kind')],
        output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, string>, kind: Kind) => m[assertSafe(kind)];
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
        errors: [lintError('kind')],
        output: `
import { assertSafe } from 'functions/src/util/assertSafe';
type Kind = 'live' | 'simulated';
const read = (m: Record<Kind, string>, kind: Kind) => m[assertSafe(kind)];
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
export const read = (kind: 'live' | 'simulated' | 'replay') => R[assertSafe(kind)];
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
const read = (m: Record<string, number>, kind: 'live' | 'simulated') => m[assertSafe(kind)];
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
export const get = <K extends string>(m: Record<K, number>, k: K) => m[assertSafe(k)];
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
const read = (wrap: { map: Record<Kind, number> }, kind: Kind) => wrap.map[assertSafe(kind)];
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
  },
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
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
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
    expect(output).toContain('const second = obj[assertSafe(id)];');
    expect(output).toContain('const third = obj[assertSafe(id)];');
    expect(output).toContain('const fourth = assertSafe(id) in obj;');
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
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
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
    expect(output).toContain('m[assertSafe(id)]');
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
export const read = (m: Record<string, number>, id: string) => m[assertSafe(id)];
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
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-safe-esm-'));
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
    expect(output).toContain('m[assertSafe(id)]');
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
