import fs from 'fs';
import path from 'path';
import {
  AST_NODE_TYPES,
  parse,
  TSESTree,
} from '@typescript-eslint/typescript-estree';

/**
 * Issue #1476: a rule that resolves paths must anchor them at the directory
 * ESLint was configured with (`context.getCwd()`), never at the node process
 * cwd. The two are identical only when ESLint is invoked from the project root;
 * they diverge under the VS Code ESLint extension, in monorepos, and for any
 * programmatic `new ESLint({ cwd })` / `new Linter({ cwd })`. Reading the wrong
 * one has already shipped three distinct defects: a broken import written into
 * user source (#1473), an unlocatable path in a message (#1475), and a false
 * positive from a sibling module that silently stopped resolving (#1476).
 *
 * This class is invisible to every per-rule test in the repo. `RuleTester`
 * builds a `Linter` whose cwd DEFAULTS to `process.cwd()`, so the correct read
 * and the incorrect read return the same string in every RuleTester case ever
 * written — a rule can regress here with the entire suite green. Only a
 * source-level scan closes it.
 *
 * The sanctioned shape, and the only one accepted:
 *
 *   const cwd =
 *     typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();
 *
 * The `typeof` guard keeps rules working under harnesses that predate
 * `getCwd`; the process cwd is reachable only as that fallback operand.
 */

const RULES_DIR = path.join(__dirname, '..', 'rules');

// The repo ships ~194 rules. A scan that visits far fewer files has silently
// stopped finding them and would pass vacuously.
const MIN_RULE_FILES_SCANNED = 150; // measured 194

/**
 * Rules whose sanctioned fallback shape anchors this guard: if the matcher ever
 * stops recognising the known-good form, these assertions fail rather than the
 * guard quietly accepting everything.
 */
const RULES_WITH_SANCTIONED_FALLBACK = [
  'avoid-utils-directory.ts',
  'enforce-assert-safe-object-key.ts',
  'enforce-querykey-ts.ts',
  'no-firestore-jest-mock.ts',
  'prefer-global-router-state-key.ts',
  'prefer-spread-over-reassembly.ts',
  'require-props-composition.ts',
  'test-file-location-enforcement.ts',
];

/**
 * Rules that genuinely want the node process cwd rather than ESLint's.
 *
 * Empty by design — no such rule exists. An entry is not enough on its own:
 * the reason must also be recorded at the call site as a comment containing
 * `eslint-cwd-exempt:`, so a reader looking at the `process.cwd()` line learns
 * why without hunting for this file.
 */
const PROCESS_CWD_EXEMPTIONS: Record<string, string> = {};

const EXEMPTION_MARKER = 'eslint-cwd-exempt:';

// How far above a call site the marker comment may sit. Wide enough for a short
// explanatory comment, narrow enough that an unrelated marker cannot cover an
// unrelated line.
const EXEMPTION_MARKER_LOOKBEHIND = 4;

type CwdRead = {
  line: number;
  sanctioned: boolean;
};

const isMemberCall = (
  node: TSESTree.Node,
  objectName: string,
  propertyName: string,
): boolean =>
  node.type === AST_NODE_TYPES.CallExpression &&
  node.arguments.length === 0 &&
  node.callee.type === AST_NODE_TYPES.MemberExpression &&
  !node.callee.computed &&
  node.callee.object.type === AST_NODE_TYPES.Identifier &&
  node.callee.object.name === objectName &&
  node.callee.property.type === AST_NODE_TYPES.Identifier &&
  node.callee.property.name === propertyName;

const isTypeofGetCwdIsFunction = (node: TSESTree.Node): boolean => {
  if (
    node.type !== AST_NODE_TYPES.BinaryExpression ||
    node.operator !== '==='
  ) {
    return false;
  }
  const { left, right } = node;
  return (
    left.type === AST_NODE_TYPES.UnaryExpression &&
    left.operator === 'typeof' &&
    left.argument.type === AST_NODE_TYPES.MemberExpression &&
    !left.argument.computed &&
    left.argument.object.type === AST_NODE_TYPES.Identifier &&
    left.argument.object.name === 'context' &&
    left.argument.property.type === AST_NODE_TYPES.Identifier &&
    left.argument.property.name === 'getCwd' &&
    right.type === AST_NODE_TYPES.Literal &&
    right.value === 'function'
  );
};

/**
 * True for the whole sanctioned conditional. Every clause is checked
 * structurally — the guard, the `context.getCwd()` consequent, and the
 * `process.cwd()` alternate — so a partial imitation (e.g. a `typeof` guard
 * whose consequent reads something else) is not accepted.
 */
const isSanctionedFallback = (
  node: TSESTree.Node,
): node is TSESTree.ConditionalExpression =>
  node.type === AST_NODE_TYPES.ConditionalExpression &&
  isTypeofGetCwdIsFunction(node.test) &&
  isMemberCall(node.consequent, 'context', 'getCwd') &&
  isMemberCall(node.alternate, 'process', 'cwd');

const walk = (node: TSESTree.Node, visit: (n: TSESTree.Node) => void): void => {
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const child = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in item) {
          walk(item as TSESTree.Node, visit);
        }
      }
    } else if (child && typeof child === 'object' && 'type' in child) {
      walk(child as TSESTree.Node, visit);
    }
  }
};

/**
 * Every `process.cwd()` call in the source, each flagged with whether it sits
 * in the sanctioned fallback position. Parsing (rather than matching text)
 * means an occurrence inside a comment or a string literal is not a read at
 * all, and the fallback shape is recognised by structure rather than by
 * formatting.
 */
const findProcessCwdReads = (source: string, filePath: string): CwdRead[] => {
  const ast = parse(source, { loc: true, range: true, jsx: false });
  const sanctionedRanges = new Set<string>();
  const reads: CwdRead[] = [];

  walk(ast as unknown as TSESTree.Node, (node) => {
    if (isSanctionedFallback(node)) {
      sanctionedRanges.add(String(node.alternate.range));
    }
  });

  walk(ast as unknown as TSESTree.Node, (node) => {
    if (!isMemberCall(node, 'process', 'cwd')) {
      return;
    }
    if (!node.loc) {
      throw new Error(`Missing location data while scanning ${filePath}`);
    }
    reads.push({
      line: node.loc.start.line,
      sanctioned: sanctionedRanges.has(String(node.range)),
    });
  });

  return reads;
};

const hasExemptionMarker = (source: string, line: number): boolean => {
  const lines = source.split('\n');
  const start = Math.max(0, line - 1 - EXEMPTION_MARKER_LOOKBEHIND);
  return lines
    .slice(start, line)
    .some((text) => text.includes(EXEMPTION_MARKER));
};

const ruleFiles = fs
  .readdirSync(RULES_DIR)
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
  .sort();

const sourceOf = (file: string) =>
  fs.readFileSync(path.join(RULES_DIR, file), 'utf8');

// Parsing ~194 sources is the expensive part; each assertion below needs the
// same verdicts, so parse each file once.
const scanCache = new Map<string, CwdRead[]>();
const scanRuleFile = (file: string): CwdRead[] => {
  const cached = scanCache.get(file);
  if (cached) {
    return cached;
  }
  const reads = findProcessCwdReads(sourceOf(file), file);
  scanCache.set(file, reads);
  return reads;
};

describe('rules anchor paths at ESLint’s configured cwd (issue #1476)', () => {
  it('scans every rule source', () => {
    expect(ruleFiles.length).toBeGreaterThanOrEqual(MIN_RULE_FILES_SCANNED);
  });

  it('reads process.cwd() only as the context.getCwd() fallback', () => {
    const offenders: string[] = [];

    for (const file of ruleFiles) {
      const source = sourceOf(file);
      for (const read of scanRuleFile(file)) {
        if (read.sanctioned) {
          continue;
        }
        const reason = PROCESS_CWD_EXEMPTIONS[file];
        if (reason && hasExemptionMarker(source, read.line)) {
          continue;
        }
        offenders.push(
          `${file}:${read.line}${
            reason
              ? ` (allowlisted, but no "${EXEMPTION_MARKER} ${reason}" comment at the call site)`
              : ''
          }`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it('recognises the sanctioned fallback in the rules that use it', () => {
    for (const file of RULES_WITH_SANCTIONED_FALLBACK) {
      const reads = scanRuleFile(file);
      expect({ file, reads }).toEqual({
        file,
        reads: [{ line: expect.any(Number), sanctioned: true }],
      });
    }
  });

  it('finds the fallback in more than one rule, so the scan is not vacuous', () => {
    const filesWithReads = ruleFiles.filter(
      (file) => scanRuleFile(file).length > 0,
    );

    expect(filesWithReads.sort()).toEqual(
      [...RULES_WITH_SANCTIONED_FALLBACK].sort(),
    );
  });

  it('ships no allowlist entries', () => {
    expect(Object.keys(PROCESS_CWD_EXEMPTIONS)).toEqual([]);
  });
});

describe('the process.cwd() detector itself', () => {
  const scan = (source: string) => findProcessCwdReads(source, 'probe.ts');

  it('flags a bare read', () => {
    expect(scan('const cwd = process.cwd();')).toEqual([
      { line: 1, sanctioned: false },
    ]);
  });

  it('accepts the sanctioned fallback', () => {
    expect(
      scan(
        `const cwd =
  typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();`,
      ),
    ).toEqual([{ line: 2, sanctioned: true }]);
  });

  it('rejects a conditional whose consequent reads something else', () => {
    expect(
      scan(
        `const cwd =
  typeof context.getCwd === 'function' ? context.getRoot() : process.cwd();`,
      ),
    ).toEqual([{ line: 2, sanctioned: false }]);
  });

  it('rejects an inverted guard that prefers the process cwd', () => {
    expect(
      scan(
        `const cwd =
  typeof context.getCwd === 'function' ? process.cwd() : context.getCwd();`,
      ),
    ).toEqual([{ line: 2, sanctioned: false }]);
  });

  it('is not fooled by comments or string literals', () => {
    expect(
      scan(
        `// process.cwd() is wrong here
const note = 'process.cwd()';
/* process.cwd() */
`,
      ),
    ).toEqual([]);
  });

  it('recognises the marker comment used by an allowlist entry', () => {
    const source = [
      '// eslint-cwd-exempt: resolves a tool path, not a linted path',
      'const root = process.cwd();',
    ].join('\n');

    expect(hasExemptionMarker(source, 2)).toBe(true);
    expect(hasExemptionMarker('const root = process.cwd();', 1)).toBe(false);
  });
});
