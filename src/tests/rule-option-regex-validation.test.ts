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
 * excluded. So this guard does not forbid throwing; it requires that the throw
 * be actionable: the message must name the rule and the offending option.
 *
 * Carries a planted-defect control in both directions. A guard that could not
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
  return (items.anyOf ?? []).some((alternative) => alternative.type === 'string');
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
 * Runs `rule` with `optionKey` set to a malformed pattern. Returns the thrown
 * message, or null when the rule tolerates the value (i.e. never compiles it).
 */
function throwsFor(
  ruleName: string,
  rule: unknown,
  optionKey: string,
  isArray: boolean,
  badValue: string,
): string | null {
  const payload = { [optionKey]: isArray ? [badValue] : badValue };
  for (const sample of SAMPLES) {
    const linter = new Linter();
    linter.defineParser('@typescript-eslint/parser', tsParser);
    linter.defineRule(`probe/${ruleName}`, rule as never);
    try {
      linter.verify(
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
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return null;
}

/** An actionable rejection names both the rule and the option at fault. */
function isActionable(message: string, ruleName: string, optionKey: string) {
  return message.includes(ruleName) && message.includes(optionKey);
}

describe('rule option regex validation', () => {
  const ruleNames = Object.keys(plugin.rules);

  const offenders: string[] = [];
  const validating: string[] = [];

  // Rules that report a malformed pattern by warning and falling back write to
  // the console on every probe; that is their contract, not a finding here.
  const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
  const consoleError = jest.spyOn(console, 'error').mockImplementation();

  for (const ruleName of ruleNames) {
    const entry = firstSchemaEntry(plugin.rules[ruleName]?.meta?.schema);
    for (const { key, isArray } of stringOptionKeys(entry)) {
      for (const badValue of MALFORMED_PATTERNS) {
        const message = throwsFor(
          ruleName,
          plugin.rules[ruleName],
          key,
          isArray,
          badValue,
        );
        // No throw means the rule never compiles this option as a regex.
        if (message === null) continue;
        // ESLint prefixes the rule id itself, so strip its wrapper before
        // judging the message the rule authored.
        const authored = message.replace(
          /^Error while loading rule '[^']*':\s*/,
          '',
        );
        const record = `${ruleName} / ${key} = ${JSON.stringify(badValue)}`;
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
    const message = throwsFor(
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
    const message = throwsFor(
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
