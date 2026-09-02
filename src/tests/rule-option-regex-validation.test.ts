import { Linter } from 'eslint';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as { rules: Record<string, RuleShape> };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

/**
 * Pattern options are declared as bare `string` / `string[]`, because JSON
 * Schema cannot express "is a compilable regex". Schema validation therefore
 * passes any string straight through to `new RegExp`, and an exception raised
 * while building a rule aborts the whole lint run — every file, every other
 * rule — not just the file that triggered it.
 *
 * The realistic input is not exotic. A consumer excluding the literal brand
 * string `C++`, or reaching for glob syntax in an option named `...Patterns`,
 * writes a value that is not a valid regex. Unguarded, they get
 * `Invalid regular expression: /C++/: Nothing to repeat` and no indication of
 * which option produced it (#1534, #1535, #1536).
 *
 * Rejecting the config is the correct response — silently dropping the pattern
 * would leave the consumer's allowlist inert, reporting the very code they
 * excluded. So this guard does not forbid throwing; it requires that the
 * failure be ACTIONABLE, through any of three channels: a throw naming the rule
 * and the option, a lint report naming the offending value, or a console
 * warning naming it. The last two are strictly better behaved than a throw,
 * since they do not abort the whole lint run, and two rules already prefer
 * them.
 *
 * What that leaves is the shape this guard could not see until #2217: a rule
 * that hands the value to `new RegExp`, catches the failure, and says nothing.
 * The old oracle inferred "never compiles this option" from the absence of a
 * throw, which is silent about exactly that rule — and one shipped.
 * `no-direct-function-state` discarded an uncompilable `functionPatterns` entry
 * inside a bare `catch {}` while this suite stayed green (#2218).
 *
 * Compilation is therefore OBSERVED rather than inferred: `RegExp` is wrapped
 * for the duration of each probe and every construction that THROWS is
 * recorded. A failed construction is unambiguous evidence the rule compiled the
 * consumer's value; matching successful compiles against it instead would flag
 * any internal regex that merely contains `[`.
 *
 * Carries planted-defect controls in both directions, including a mutation test
 * against the real shipped body — planted controls prove the mechanism, only
 * that proves the guard catches what actually happened. A guard that could not
 * go red guards nothing.
 */

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
};

type RuleShape = {
  meta?: { schema?: JsonSchema | JsonSchema[] };
};

// Values a consumer plausibly writes that are not valid regex sources.
const MALFORMED_PATTERNS = [
  '*.test.ts', // glob syntax in an option whose name says "pattern"
  'C++', // a literal brand string with regex metacharacters
  '[', // unterminated character class
  '(foo', // unterminated group
];

// Enough shapes that a rule compiling its patterns lazily inside a visitor
// still reaches the compile site.
const SAMPLES: { filename: string; code: string }[] = [
  {
    filename: 'src/components/Widget.tsx',
    code: `
import { useState, useCallback, useMemo } from 'react';
type Props = { isOpen: boolean; onClose: () => void; label: string };
export const Widget = ({ isOpen, onClose, label }: Props) => {
  const [isDataLoading, setIsDataLoading] = useState(false);
  const handleClick = useCallback(() => { setIsDataLoading(true); onClose(); }, [onClose]);
  const data = useMemo(() => ({ a: 1 }), []);
  const renderRow = () => <span>{label}</span>;
  return <div onClick={handleClick} title="Save Changes">{isOpen ? renderRow() : null}{String(data.a)}{String(isDataLoading)}</div>;
};
export class Thing {
  private value = 1;
  public getValue() { return this.value; }
}
`,
  },
  {
    filename: 'functions/src/util/helper.ts',
    code: `
export const CONFIG = { retries: 3 } as const;
export async function fetchAll(ids: string[]) {
  const out: string[] = [];
  for (const id of ids) { out.push(await Promise.resolve(id)); }
  return out;
}
export interface HandlerProps { onDone: () => void; isReady: boolean }
export function clickHandler() { return 1; }
`,
  },
];

function admitsStringItem(items: JsonSchema | undefined): boolean {
  if (!items) return false;
  if (items.type === 'string') return true;
  return (items.anyOf ?? []).some(
    (alternative) => alternative.type === 'string',
  );
}

function stringOptionKeys(entry: JsonSchema | undefined) {
  const keys: { key: string; isArray: boolean }[] = [];
  if (!entry || entry.type !== 'object' || !entry.properties) return keys;
  for (const [key, def] of Object.entries(entry.properties)) {
    if (!def || typeof def !== 'object') continue;
    if (def.type === 'string') keys.push({ key, isArray: false });
    // `items.type === 'string'` alone misses an option whose items are declared
    // `anyOf: [{type:'string'}, …]` to admit a pre-compiled RegExp beside a
    // source string. A consumer still writes a string there, so it compiles and
    // can still throw — `parallelize-async-operations:sideEffectPatterns` was
    // invisible to this guard for exactly that reason (#1873).
    else if (def.type === 'array' && admitsStringItem(def.items)) {
      keys.push({ key, isArray: true });
    }
  }
  return keys;
}

function firstSchemaEntry(schema: JsonSchema | JsonSchema[] | undefined) {
  if (!schema) return undefined;
  return Array.isArray(schema) ? schema[0] : schema;
}

/**
 * Records the source of every `new RegExp(...)` that THREW while `run` executes.
 *
 * A failed construction is the only unambiguous evidence that a rule compiled
 * the consumer's value: matching every successful compile against the bad value
 * would flag any internal regex that merely contains `[`. Regex LITERALS never
 * reach the constructor, so ordinary rule code is untouched, and the real
 * constructor is restored before the caller returns.
 */
function withRegExpFailuresRecorded<T>(run: () => T): {
  result: T;
  failed: string[];
} {
  const failed: string[] = [];
  const Real = RegExp;
  const Spy = function (this: unknown, pattern?: unknown, flags?: unknown) {
    try {
      return new (Real as never as new (p?: unknown, f?: unknown) => RegExp)(
        pattern,
        flags,
      );
    } catch (error) {
      if (typeof pattern === 'string') {
        failed.push(pattern);
      }
      throw error;
    }
  } as unknown as RegExpConstructor;
  Spy.prototype = Real.prototype;
  (globalThis as { RegExp: RegExpConstructor }).RegExp = Spy;
  try {
    return { result: run(), failed };
  } finally {
    (globalThis as { RegExp: RegExpConstructor }).RegExp = Real;
  }
}

/**
 * Runs `rule` with `optionKey` set to a malformed pattern.
 *
 * `message` is the thrown text, or null when nothing was thrown. `compiled`
 * says whether the rule handed the value to `new RegExp` at all — which is the
 * distinction the oracle used to be unable to draw. Reading a null `message` as
 * "the rule never compiles this option" conflated a rule that genuinely ignores
 * the value with one that compiles it inside `catch {}` and drops it, and the
 * second shipped: `no-direct-function-state` silently discarded an uncompilable
 * `functionPatterns` entry, leaving the consumer's allowlist inert while this
 * guard stayed green (#2217, #2218).
 */
function throwsFor(
  ruleName: string,
  rule: unknown,
  optionKey: string,
  isArray: boolean,
  badValue: string,
): { message: string | null; compiled: boolean; surfaced: boolean } {
  const payload = { [optionKey]: isArray ? [badValue] : badValue };
  let compiled = false;
  let surfaced = false;
  for (const sample of SAMPLES) {
    const linter = new Linter();
    linter.defineParser('@typescript-eslint/parser', tsParser);
    linter.defineRule(`probe/${ruleName}`, rule as never);
    const warned: string[] = [];
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation((...args: unknown[]) => {
        warned.push(args.map(String).join(' '));
      });
    const { result, failed } = withRegExpFailuresRecorded(() => {
      try {
        const messages = linter.verify(
          sample.code,
          {
            parser: '@typescript-eslint/parser',
            parserOptions: {
              ecmaVersion: 2022,
              sourceType: 'module',
              ecmaFeatures: { jsx: true },
            },
            rules: { [`probe/${ruleName}`]: ['error', payload] },
          },
          { filename: sample.filename },
        );
        /**
         * A REPORT naming the offending value is as actionable as a throw, and
         * strictly better behaved: it tells the consumer which pattern was
         * dropped without aborting the whole lint run. Two rules already do
         * this (`no-usememo-for-pass-by-value` reports `invalidRegex`), so an
         * oracle that only accepted a throw would condemn the house pattern.
         */
        if (messages.some((one) => one.message.includes(badValue))) {
          surfaced = true;
        }
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      return null;
    });
    warnSpy.mockRestore();
    // A console warning naming the value is the third actionable channel;
    // `vertically-group-related-functions` falls back to a default that way.
    if (warned.some((one) => one.includes(badValue))) {
      surfaced = true;
    }
    // The rule built its pattern from the value, so a source merely CONTAINING
    // it counts — `^${pattern}$` is the common spelling.
    if (failed.some((source) => source.includes(badValue))) {
      compiled = true;
    }
    if (result !== null) {
      return { message: result, compiled: true, surfaced: true };
    }
  }
  return { message: null, compiled, surfaced };
}

/** An actionable rejection names both the rule and the option at fault. */
function isActionable(message: string, ruleName: string, optionKey: string) {
  return message.includes(ruleName) && message.includes(optionKey);
}

describe('rule option regex validation', () => {
  const ruleNames = Object.keys(plugin.rules);

  const offenders: string[] = [];
  const validating: string[] = [];
  /** Rules that compiled the value and dropped the failure without a word. */
  const swallowers: string[] = [];
  /** (rule, option, value) triples no rule ever handed to `new RegExp`. */
  const tolerated: string[] = [];
  /** Rules MEASURED to compile a pattern option, rather than assumed to. */
  const compilingRules = new Set<string>();
  /** Rules that compiled a bad value and reported or warned instead of throwing. */
  const surfacingRules = new Set<string>();

  // Rules that report a malformed pattern by warning and falling back write to
  // the console on every probe; that is their contract, not a finding here.
  const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
  const consoleError = jest.spyOn(console, 'error').mockImplementation();

  for (const ruleName of ruleNames) {
    const entry = firstSchemaEntry(plugin.rules[ruleName]?.meta?.schema);
    for (const { key, isArray } of stringOptionKeys(entry)) {
      for (const badValue of MALFORMED_PATTERNS) {
        const { message, compiled, surfaced } = throwsFor(
          ruleName,
          plugin.rules[ruleName],
          key,
          isArray,
          badValue,
        );
        const record = `${ruleName} / ${key} = ${JSON.stringify(badValue)}`;
        if (message === null) {
          /**
           * Silence is only acceptable from a rule that never compiled the
           * value. One that DID compile it and swallowed the failure leaves the
           * consumer's allowlist inert — the rule goes on reporting the very
           * code the pattern was written to exclude, with nothing to say why.
           */
          if (compiled && !surfaced) {
            swallowers.push(
              `${record}\n      -> compiled the value and discarded the failure silently`,
            );
          } else if (compiled) {
            surfacingRules.add(ruleName);
          } else {
            tolerated.push(record);
          }
          continue;
        }
        if (compiled) {
          compilingRules.add(ruleName);
        }
        // ESLint prefixes the rule id itself, so strip its wrapper before
        // judging the message the rule authored.
        const authored = message.replace(
          /^Error while loading rule '[^']*':\s*/,
          '',
        );
        if (isActionable(authored, ruleName, key)) {
          if (!validating.includes(ruleName)) validating.push(ruleName);
        } else {
          offenders.push(`${record}\n      -> ${authored.split('\n')[0]}`);
        }
      }
    }
  }

  consoleWarn.mockRestore();
  consoleError.mockRestore();

  it('rejects a malformed pattern option with a message naming the rule and option', () => {
    expect(offenders).toEqual([]);
  });

  it('actually exercised rules that compile pattern options', () => {
    // Without this floor the suite passes vacuously the moment the harness
    // stops reaching any compile site — an empty sweep looks identical to a
    // clean one. The named rules are the known pattern-compiling set; a rule
    // leaving it is a deliberate change, so updating this list should be a
    // conscious act rather than a silent drift.
    expect(validating).toEqual(
      expect.arrayContaining([
        'no-handler-suffix',
        'enforce-m3-sentence-case',
        'no-separate-loading-state',
        'no-render-function-components',
      ]),
    );
  });

  /**
   * The gate this guard was missing. "No throw" used to be read as "the rule
   * never compiles this option", which is silent about the rule that compiles
   * it inside `catch {}` and drops it — leaving the consumer's allowlist inert
   * while the rule reports the very code the pattern was written to exclude.
   * `no-direct-function-state` shipped exactly that and this suite stayed green
   * (#2217, fixed in #2218).
   */
  it('rejects a rule that compiles a pattern option and drops the failure', () => {
    expect(swallowers).toEqual([]);
  });

  /**
   * Measured rather than assumed. The hand-written four below understated the
   * set: `parallelize-async-operations` also throws actionably, and three more
   * rules surface the failure through a report or a warning instead — a
   * channel the old oracle could not see at all, so it counted them as rules
   * that "never compile" the option.
   */
  it('measured which rules reach a compile site, in both channels', () => {
    expect([...compilingRules].sort()).toEqual([
      'enforce-m3-sentence-case',
      'no-handler-suffix',
      'no-render-function-components',
      'no-separate-loading-state',
      'parallelize-async-operations',
    ]);
    expect([...surfacingRules].sort()).toEqual([
      'no-direct-function-state',
      'no-usememo-for-pass-by-value',
      'vertically-group-related-functions',
    ]);
    // The population that genuinely never compiles, floored so a harness that
    // stops reaching any rule cannot read as a clean sweep.
    expect(tolerated.length).toBeGreaterThanOrEqual(280); // measured 304
  });

  /**
   * The mutation test the fix demands: a planted rule reproducing
   * `no-direct-function-state`'s ORIGINAL body — compile per call site inside a
   * bare `catch {}` — must be caught, naming its option. Planted controls prove
   * the mechanism; only this proves the guard catches what actually shipped.
   */
  it('flags a planted rule that compiles and swallows, as the real one did', () => {
    const swallowing = {
      meta: {
        type: 'problem',
        schema: [
          {
            type: 'object',
            properties: {
              functionPatterns: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
        ],
        messages: { x: 'x' },
      },
      create(context: never) {
        const ctx = context as unknown as {
          options: { functionPatterns?: string[] }[];
        };
        const patterns = ctx.options[0]?.functionPatterns ?? [];
        return {
          Identifier(node: { name: string }) {
            for (const pattern of patterns) {
              try {
                new RegExp(`^${pattern}$`).test(node.name);
              } catch {
                // Ignore invalid regex patterns — the shipped defect verbatim.
              }
            }
          },
        };
      },
    };
    const { message, compiled, surfaced } = throwsFor(
      'planted-swallower',
      swallowing,
      'functionPatterns',
      true,
      '[',
    );
    expect(message).toBeNull();
    expect(compiled).toBe(true);
    expect(surfaced).toBe(false);
  });

  /**
   * The negative half: a rule that never hands the value to `new RegExp` is
   * silent for a legitimate reason and must NOT be flagged, or the gate above
   * would condemn all 304 tolerated triples.
   */
  it('stays silent on a rule that never compiles the option', () => {
    const inert = {
      meta: {
        type: 'problem',
        schema: [
          {
            type: 'object',
            properties: {
              functionPatterns: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
        ],
        messages: { x: 'x' },
      },
      create() {
        return {};
      },
    };
    const { message, compiled } = throwsFor(
      'planted-inert',
      inert,
      'functionPatterns',
      true,
      '[',
    );
    expect(message).toBeNull();
    expect(compiled).toBe(false);
  });

  it('flags a planted rule that compiles a user pattern unguarded', () => {
    const unguarded = {
      meta: {
        type: 'problem',
        schema: [
          {
            type: 'object',
            properties: {
              ignorePatterns: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
        ],
        messages: { x: 'x' },
      },
      create(context: { options: { ignorePatterns?: string[] }[] }) {
        (context.options[0]?.ignorePatterns ?? []).map((p) => new RegExp(p));
        return {};
      },
    };
    const { message } = throwsFor(
      'planted-unguarded',
      unguarded,
      'ignorePatterns',
      true,
      '[',
    );
    expect(message).not.toBeNull();
    expect(
      isActionable(message as string, 'planted-unguarded', 'ignorePatterns'),
    ).toBe(false);
  });

  it('accepts a planted rule that rejects the pattern actionably', () => {
    const guarded = {
      meta: {
        type: 'problem',
        schema: [
          {
            type: 'object',
            properties: {
              ignorePatterns: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
        ],
        messages: { x: 'x' },
      },
      create(context: { options: { ignorePatterns?: string[] }[] }) {
        const invalid: string[] = [];
        (context.options[0]?.ignorePatterns ?? []).forEach((p) => {
          try {
            new RegExp(p);
          } catch (error) {
            invalid.push(`${p} (${(error as Error).message})`);
          }
        });
        if (invalid.length > 0) {
          throw new Error(
            `planted-guarded: invalid ignorePatterns: ${invalid.join(', ')}`,
          );
        }
        return {};
      },
    };
    const { message } = throwsFor(
      'planted-guarded',
      guarded,
      'ignorePatterns',
      true,
      '[',
    );
    expect(message).not.toBeNull();
    expect(
      isActionable(message as string, 'planted-guarded', 'ignorePatterns'),
    ).toBe(true);
  });
});
