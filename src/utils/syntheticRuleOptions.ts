/**
 * Schema-valid option payloads, synthesized from a rule's own `meta.schema`.
 *
 * Three guards need the same thing and for the same reason: a rule's
 * option-gated code — a pattern list compiled at `create` time, a glob parsed
 * before any visitor runs — is entered by NO sweep that drives every rule at a
 * bare `'error'`. Default options are the one configuration a rule's author is
 * guaranteed to have exercised, so a corpus swept at defaults measures the
 * option dimension not at all.
 *
 * Shared rather than copied because the second copy of a helper is where the
 * divergence lands: a guard whose payload builder drifted would sweep a
 * different option surface than the one its floors were cut against, and
 * nothing would say so.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const eslintLib = require('path').dirname(require.resolve('eslint'));
const { getRuleOptionsSchema } = require(eslintLib +
  '/config/flat-config-helpers.js');
const ajvFactory = require(eslintLib + '/shared/ajv.js');
/* eslint-enable @typescript-eslint/no-var-requires */

const ajv = ajvFactory({ strictDefaults: true });

export type OptionPayload = {
  /** `JSON.stringify` of the options array as DECLARED, before any screen. */
  key: string;
  options: readonly unknown[];
  /** Where the payload came from, so a finding names a reproducible origin. */
  source: string;
};

/** A rule's option schema, normalized to the array form. */
export const optionSchemaOf = (rule: unknown): any[] => {
  const schema = (rule as any)?.meta?.schema;
  if (!schema) return [];
  return Array.isArray(schema) ? schema : [schema];
};

/**
 * ESLint's OWN option validator for a rule.
 *
 * A bare `Linter` does NOT validate rule options against `meta.schema` — it
 * hands whatever it is given straight to the rule. Probing a payload real
 * ESLint would REJECT therefore manufactures a crash no consumer can reach:
 * measured, `['error', {}]` against `no-restricted-properties-fix`'s
 * array-typed schema produced 77 such "findings".
 *
 * The returned validator carries ESLint's `useDefaults`, so screening a payload
 * FILLS IN any `default` its schema declares, in place. That mirrors what a
 * consumer's config goes through, but it means the payload a rule receives can
 * differ from the `key` recorded for it — 29 of the 71 optioned rules declare
 * schema defaults, and for those `[{}]` reaches `create` already populated.
 */
export const payloadScreenFor = (
  rule: unknown,
): ((options: unknown[]) => boolean) | null => {
  const schema = getRuleOptionsSchema(rule);
  if (!schema) return null;
  return ajv.compile(schema);
};

/**
 * The first branch of an `anyOf`/`oneOf` this synthesizer can express.
 *
 * A union item schema carries no `type` of its own, so reading `items.type`
 * yields `undefined` and the array property collapses to the single value `[]`
 * — a payload indistinguishable from the default, which leaves the path behind
 * the option entered but never fed. Measured: `parallelize-async-operations`'s
 * `sideEffectPatterns` is `anyOf: [string, RegExp]`, and no payload ever put a
 * pattern in it.
 */
function resolveBranch(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const branches = schema.anyOf || schema.oneOf;
  if (!Array.isArray(branches)) return schema;
  return branches.find((branch) => legalValuesFor(branch).length) ?? schema;
}

/** Non-default values a property of this shape can legally take. */
export function legalValuesFor(rawProp: any): unknown[] {
  if (!rawProp || typeof rawProp !== 'object') return [];
  const prop = resolveBranch(rawProp);
  if (!prop || typeof prop !== 'object') return [];
  if (Array.isArray(prop.enum)) return prop.enum.slice(0, 3);
  const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;
  if (type === 'boolean') return [true, false];
  if (type === 'number' || type === 'integer') return [0, 1];
  if (type === 'string') return ['x'];
  if (type === 'array') {
    const items = resolveBranch(prop.items);
    const itemType = Array.isArray(items?.type) ? items.type[0] : items?.type;
    if (itemType === 'string') return [[], ['x']];
    if (itemType === 'number' || itemType === 'integer') return [[], [1]];
    if (itemType === 'object') return [[], [{}]];
    // An item schema carrying its constraint somewhere other than `type` — an
    // `enum`, say — still has expressible values; without this the whole
    // property collapses to the empty list.
    const itemValues = legalValuesFor(items);
    return itemValues.length ? [[], [itemValues[0]]] : [[]];
  }
  if (type === 'object') {
    // A nested object with its own properties is populated rather than left
    // empty: `{}` reaches the rule as the absence of the option, so the branch
    // that reads the nested fields is never entered.
    const filled: Record<string, unknown> = {};
    if (prop.properties && typeof prop.properties === 'object') {
      for (const [key, sub] of Object.entries<any>(prop.properties)) {
        const values = legalValuesFor(sub);
        if (values.length) filled[key] = values[0];
      }
    }
    return Object.keys(filled).length ? [{}, filled] : [{}];
  }
  return [];
}

const isEmptyContainer = (value: unknown): boolean =>
  (Array.isArray(value) && value.length === 0) ||
  (Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0);

/**
 * Schema properties no synthesized payload ever gives CONTENT.
 *
 * A property the synthesizer cannot express at all, or can only express as an
 * empty container, is probed at a value the rule cannot tell from its default.
 * Reported by name rather than counted into a margin: a builder that silently
 * stops expressing a property looks exactly like a rule with no option to
 * drive, which is the failure mode this whole surface exists to close.
 */
export const unexpressedProperties = (rule: unknown): string[] => {
  const head = optionSchemaOf(rule)[0];
  const properties = head?.properties;
  if (!properties || typeof properties !== 'object') return [];
  return Object.entries<any>(properties)
    .filter(([, propSchema]) => {
      const values = legalValuesFor(propSchema);
      return values.length === 0 || values.every(isEmptyContainer);
    })
    .map(([prop]) => prop);
};

/**
 * Payloads to probe rule R under: the ones its own author wrote, then one per
 * (property, legal value), an all-properties payload, and the empty object.
 *
 * `declared` carries the author-written payloads first so that a rule whose
 * fixtures pin an option shape this synthesizer cannot express still gets it
 * probed. The empty array is never a payload: it IS the default arm.
 */
export const buildOptionPayloads = (
  rule: unknown,
  declared: readonly (readonly unknown[])[] = [],
): OptionPayload[] => {
  const out: OptionPayload[] = [];
  const seen = new Set<string>();
  const add = (options: readonly unknown[], source: string) => {
    const key = JSON.stringify(options);
    if (key === '[]' || seen.has(key)) return;
    seen.add(key);
    out.push({ key, options, source });
  };

  for (const options of declared) {
    if (options && options.length) add(options, 'fixture');
  }

  // The empty object — legal against nearly every schema here, and the shape
  // an unguarded destructuring read (`const [{ list }] = options`) crashes on.
  add([{}], 'empty-object');

  const head = optionSchemaOf(rule)[0];
  const properties = head?.properties;
  if (properties && typeof properties === 'object') {
    const all: Record<string, unknown> = {};
    for (const [prop, propSchema] of Object.entries<any>(properties)) {
      const values = legalValuesFor(propSchema);
      for (const value of values) add([{ [prop]: value }], 'prop:' + prop);
      if (values[0] !== undefined) all[prop] = values[0];
    }
    if (Object.keys(all).length > 1) add([all], 'all-props');
  }
  // A non-object head schema (enum/string) takes its own values.
  if (head && !properties) {
    for (const value of legalValuesFor(head)) add([value], 'head');
  }
  return out;
};

export type ScreenedPayloads = {
  valid: OptionPayload[];
  /** Payloads ESLint's validator rejects, which no consumer could write. */
  rejected: OptionPayload[];
};

export const screenPayloads = (
  rule: unknown,
  payloads: readonly OptionPayload[],
): ScreenedPayloads => {
  const validate = payloadScreenFor(rule);
  const valid: OptionPayload[] = [];
  const rejected: OptionPayload[] = [];
  for (const payload of payloads) {
    if (validate && !validate(payload.options as unknown[])) {
      rejected.push(payload);
      continue;
    }
    valid.push(payload);
  }
  return { valid, rejected };
};

/**
 * A start offset derived from a key rather than drawn at random.
 *
 * A sweep that caps how many fixtures each (rule, payload) probes and always
 * takes the FIRST ones spends every payload's budget on the same handful of
 * inputs; offsetting the window by a hash of the key spreads the same budget
 * across the whole population. FNV-1a because a guard is a build gate: the same
 * commit must select the same inputs on every machine and every run, which
 * rules out `Math.random`, insertion time, or anything ordered by a set built
 * from a non-deterministic source.
 */
export const hashOffset = (key: string, modulus: number): number => {
  if (modulus <= 0) return 0;
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % modulus;
};

/**
 * The window of `size` entries a key selects out of `population`, starting at
 * the key's hash offset and wrapping. Shorter than `size` only when the
 * population itself is.
 */
export const rotatedWindow = <T>(
  key: string,
  population: readonly T[],
  size: number,
): T[] => {
  const take = Math.min(size, population.length);
  const start = hashOffset(key, population.length);
  const window: T[] = [];
  for (let step = 0; step < take; step++) {
    window.push(population[(start + step) % population.length]);
  }
  return window;
};

/**
 * The fixed-order window the same key would have selected without rotation.
 * Exists so a guard can MEASURE what its rotation buys instead of asserting it.
 */
export const fixedWindow = <T>(population: readonly T[], size: number): T[] =>
  population.slice(0, Math.min(size, population.length));
