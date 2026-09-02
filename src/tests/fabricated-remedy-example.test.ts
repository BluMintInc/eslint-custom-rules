import fs from 'fs';
import path from 'path';

const RULES_DIR = path.join(__dirname, '../rules');

/**
 * Shapes that assert a VALUE the rule never read from the source. `export const
 * x = undefined;` reads as code to paste over the declaration, so following the
 * remedy deletes the initializer it was meant to export — the #1543 defect.
 *
 * Naming a construct is fine and deliberately absent here: `get ${name}()` is
 * accurate because a getter really takes no parameters, and `${method}()` in a
 * message is a method reference, not a proposed edit.
 */
const FABRICATED_VALUE = [
  { kind: 'assigns undefined', pattern: /=\s*undefined\s*;?\s*`/ },
  { kind: 'assigns unknown', pattern: /=\s*unknown\s*;?\s*`/ },
  { kind: 'assigns null', pattern: /=\s*null\s*;?\s*`/ },
  { kind: 'assigns any', pattern: /=\s*any\s*;?\s*`/ },
  { kind: 'assigns empty object', pattern: /=\s*\{\s*\}\s*;?\s*`/ },
  { kind: 'empties a function body', pattern: /\)\s*\{\s*\}\s*`/ },
];

/**
 * Fixer text legitimately supplies syntax the source lacks —
 * `require-hooks-default-params` emits `${paramText} = {}` to ADD a default,
 * having already refused params that carry one. Whether a fixer's output is
 * safe is settled by the autofix corruption and fixer-type-safety probes, which
 * apply the edit; this guard is about remedy prose, which nothing else reads.
 */
const FIXER_LOOKBEHIND = 3;

const emittedByFixer = (lines: string[], index: number) => {
  const start = Math.max(0, index - FIXER_LOOKBEHIND);
  return lines
    .slice(start, index + 1)
    .some((line) => /fixer\.|fix\s*\(/.test(line));
};

type Finding = { rule: string; kind: string; line: number; text: string };

const scanSource = (rule: string, source: string): Finding[] => {
  const lines = source.split('\n');
  const findings: Finding[] = [];

  lines.forEach((line, index) => {
    // A template literal with no interpolation is static prose, not a remedy
    // assembled per report site.
    if (!line.includes('`') || !line.includes('${')) {
      return;
    }
    if (emittedByFixer(lines, index)) {
      return;
    }
    FABRICATED_VALUE.forEach(({ kind, pattern }) => {
      if (pattern.test(line)) {
        findings.push({ rule, kind, line: index + 1, text: line.trim() });
      }
    });
  });

  return findings;
};

const ruleFiles = fs
  .readdirSync(RULES_DIR)
  .filter((file) => file.endsWith('.ts'))
  .sort();

describe('no rule fabricates a value in its remedy example', () => {
  /**
   * #1499's lesson: a coverage floor cannot see what was dropped before it
   * counted, so pin the corpus size rather than trusting a zero.
   */
  it('scans every rule source', () => {
    expect(ruleFiles.length).toBeGreaterThan(190); // measured 194
  });

  it.each(ruleFiles)('%s', (file) => {
    const rule = path.basename(file, '.ts');
    const source = fs.readFileSync(path.join(RULES_DIR, file), 'utf8');
    const findings = scanSource(rule, source);

    expect(
      findings.map((f) => `${f.rule}:${f.line} ${f.kind} — ${f.text}`),
    ).toEqual([]);
  });

  /**
   * Controls. Without these the suite passes just as happily if the patterns
   * stop matching anything at all, which is how a guard silently retires
   * itself. Each line is the verbatim pre-#1543 source of a branch that shipped
   * a destructive remedy.
   */
  describe('detects the shapes #1543 shipped', () => {
    const controls = [
      'const exportExample = `export ${kind} ${name} = undefined;`;',
      'const exportExample = `export function ${name}() {}`;',
      'const exportExample = `export type ${name} = unknown;`;',
    ];

    it.each(controls)('flags %s', (control) => {
      expect(scanSource('control', control)).not.toEqual([]);
    });

    it('does not flag fixer text that adds a missing default', () => {
      const fixerLine = 'return fixer.replaceText(param, `${paramText} = {}`);';
      expect(scanSource('control', fixerLine)).toEqual([]);
    });

    it('does not flag a message naming a parameterless getter', () => {
      const getterLine = 'const suggestion = `get ${suggestedName}()`;';
      expect(scanSource('control', getterLine)).toEqual([]);
    });
  });
});
