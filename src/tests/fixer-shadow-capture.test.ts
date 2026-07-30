import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';
const TESTS_DIR = __dirname;

/**
 * A fixer that imports or reuses a module-scope name and emits a reference to it
 * at the report site is broken when an inner scope between the two already binds
 * that name: the emitted reference silently resolves to the inner binding.
 *
 * Nothing else catches this. The name is bound, so a stranding check passes; the
 * module scope still holds one declaration, so a collision check passes; and
 * TypeScript accepts a well-typed reference to a real binding, so there is no
 * diagnostic. Issues #1455 and #1456 were both this shape — #1455 silently
 * changed a destructuring default's value, and #1456 silently changed a router
 * key.
 *
 * This guard injects a shadowing binding into the function enclosing each report
 * site and requires that no fixer's emitted reference resolves to it. Declining
 * the fix (reporting without fixing) satisfies it; so does emitting a reference
 * that still resolves to the module-scope binding.
 */

/**
 * Anchoring on the fix range does not work: ESLint merges an
 * `insertTextBefore(program.body[0], import…)` with the call-site replacement
 * into a single fix spanning from offset 0, so the innermost function enclosing
 * that range is the whole file for exactly the import-inserting rules this guard
 * exists to check. Report locations are used instead.
 */
const FILENAMES = [
  '/repo/src/components/Widget.tsx',
  '/repo/src/util/helper.ts',
  '/repo/src/util/helper.test.ts',
  '/repo/functions/src/callable/handler.ts',
];

type Parsed = {
  ast: Record<string, unknown>;
  scopeManager: Record<string, unknown>;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

const cfgFor = (rule: string): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
    rules: { [PREFIX + rule]: 'error' },
  } as Linter.Config);

// A standalone parse throws on valid input unless given the full option set.
const parse = (text: string, filePath: string): Parsed | null => {
  try {
    return tsParser.parseForESLint(text, {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      loc: true,
      range: true,
      comment: true,
      tokens: true,
      filePath,
    });
  } catch {
    return null;
  }
};

const applyFix = (text: string, fix: { range: number[]; text: string }) =>
  text.slice(0, fix.range[0]) + fix.text + text.slice(fix.range[1]);

const fixesOf = (msg: any) => {
  const out: Array<{ range: number[]; text: string }> = [];
  if (msg.fix) out.push(msg.fix);
  for (const s of msg.suggestions || []) if (s.fix) out.push(s.fix);
  return out;
};

const walkAst = (node: any, visit: (n: any) => void) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const k of Object.keys(node)) {
    if (k === 'parent') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walkAst(c, visit));
    else if (v && typeof v === 'object' && typeof v.type === 'string') {
      walkAst(v, visit);
    }
  }
};

const moduleScope = (sm: any) =>
  sm.globalScope.childScopes.find((s: any) => s.type === 'module') ||
  sm.globalScope;

const innermostScopeAt = (sm: any, pos: number) => {
  let best: any = null;
  const visit = (scope: any) => {
    const r = scope.block && scope.block.range;
    if (r && pos >= r[0] && pos <= r[1]) {
      if (!best || r[1] - r[0] < best.block.range[1] - best.block.range[0]) {
        best = scope;
      }
    }
    scope.childScopes.forEach(visit);
  };
  visit(sm.globalScope);
  return best || sm.globalScope;
};

/**
 * Resolution walks the scope chain by position rather than reading
 * `reference.resolved`, so a JSX component name resolves exactly like a plain
 * identifier. JSX substitution is a large share of the import-inserting fixers.
 */
const resolveAt = (sm: any, name: string, pos: number) => {
  let scope = innermostScopeAt(sm, pos);
  while (scope) {
    const v = scope.variables.find((x: any) => x.name === name);
    if (v) return v;
    scope = scope.upper;
  }
  return null;
};

/**
 * An identifier in a non-reference position must not count as a use, or the
 * before/after differential cancels out. `JSON.stringify(x)` -> `stringify(x)`
 * is the case that matters: the property token counts before the fix and
 * disappears after it, exactly masking the reference the fix introduced.
 */
const isReferencePosition = (node: any, parent: any): boolean => {
  if (!parent) return true;
  const p = parent;
  if (p.type === 'MemberExpression' && p.property === node && !p.computed) {
    return false;
  }
  if (p.type === 'JSXMemberExpression' && p.property === node) return false;
  if (p.type === 'JSXAttribute' && p.name === node) return false;
  if (p.type === 'Property' && p.key === node && !p.computed && !p.shorthand) {
    return false;
  }
  if (
    (p.type === 'MethodDefinition' ||
      p.type === 'PropertyDefinition' ||
      p.type === 'TSPropertySignature' ||
      p.type === 'TSMethodSignature') &&
    p.key === node &&
    !p.computed
  ) {
    return false;
  }
  if (p.type === 'TSQualifiedName' && p.right === node) return false;
  return true;
};

/**
 * TypeScript resolves type and value positions in separate namespaces, so a
 * `const X` shadow cannot capture `Record<X, …>`. Counting type references made
 * `prefer-map-over-conditional-dispatch` look broken 22 times over while its
 * emitted type annotation resolved exactly as intended. `typeof X` is the
 * exception: it reads the value namespace from inside a type.
 */
const TYPE_CONTEXTS = new Set([
  'TSTypeReference',
  'TSTypeAnnotation',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeParameterInstantiation',
  'TSTypeParameterDeclaration',
  'TSInterfaceHeritage',
  'TSClassImplements',
]);

const isTypePosition = (ancestors: any[]): boolean => {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (a.type === 'TSTypeQuery') return false;
    if (TYPE_CONTEXTS.has(a.type)) return true;
  }
  return false;
};

const eachRefSite = (ast: any, cb: (n: any) => void) => {
  const importRanges: number[][] = [];
  walkAst(ast, (n) => {
    if (n.type === 'ImportDeclaration') importRanges.push(n.range);
  });
  const ancestors: any[] = [];
  const visit = (node: any, parent: any) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
      const inImport = importRanges.some(
        ([a, b]) => node.range[0] >= a && node.range[1] <= b,
      );
      if (
        !inImport &&
        isReferencePosition(node, parent) &&
        !isTypePosition(ancestors)
      ) {
        cb(node);
      }
    }
    ancestors.push(node);
    for (const k of Object.keys(node)) {
      if (k === 'parent') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => visit(c, node));
      else if (v && typeof v === 'object' && typeof v.type === 'string') {
        visit(v, node);
      }
    }
    ancestors.pop();
  };
  visit(ast, null);
};

const nameCounts = (ast: any) => {
  const m = new Map<string, number>();
  eachRefSite(ast, (n) => m.set(n.name, (m.get(n.name) || 0) + 1));
  return m;
};

/**
 * Uses of `name` resolving to anything other than the module-scope binding.
 *
 * Deliberately not keyed on the injected declaration's offset: the fixer inserts
 * its import above that declaration, shifting it, so any absolute position taken
 * from the pre-fix text is stale in the patched text.
 */
const capturedCount = (parsed: Parsed, name: string) => {
  const modVar = moduleScope(parsed.scopeManager as any).variables.find(
    (v: any) => v.name === name,
  );
  let n = 0;
  eachRefSite(parsed.ast, (site: any) => {
    if (site.name !== name) return;
    const v = resolveAt(parsed.scopeManager as any, name, site.range[0]);
    if (v && v !== modVar) n++;
  });
  return n;
};

const FN_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

const enclosingFunctionBody = (ast: any, pos: number) => {
  let best: any = null;
  walkAst(ast, (n) => {
    if (!FN_TYPES.has(n.type)) return;
    if (!n.body || n.body.type !== 'BlockStatement') return;
    const [a, b] = n.range;
    if (pos >= a && pos <= b) {
      if (!best || b - a < best.range[1] - best.range[0]) best = n;
    }
  });
  return best ? best.body : null;
};

const offsetOf = (text: string, line: number, column: number) => {
  const lines = text.split('\n');
  let off = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    off += lines[i].length + 1;
  }
  return off + (column - 1);
};

/**
 * Every rule ships invalid cases whose whole purpose is to make it fire, so the
 * triggers already exist — harvest them instead of inventing a synthetic input
 * per rule. Any string or no-substitution template literal is a candidate; one
 * that makes the rule fire is usable regardless of which array it came from.
 */
const harvestSnippets = (testFile: string): string[] => {
  const parsed = parse(fs.readFileSync(testFile, 'utf8'), testFile);
  if (!parsed) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: unknown) => {
    if (typeof s !== 'string') return;
    // Shorter than this is a messageId or a rule name, not a snippet.
    if (s.length < 25 || !/[;{(=<]/.test(s)) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  walkAst(parsed.ast, (node: any) => {
    if (node.type === 'Literal') push(node.value);
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
      push(node.quasis.map((q: any) => q.value.cooked).join(''));
    }
  });
  return out;
};

type Trigger = {
  code: string;
  filename: string;
  name: string;
  injectAt: number;
};

const triggersFor = (rule: string, snippets: string[]): Trigger[] => {
  const triggers: Trigger[] = [];
  for (const code of snippets) {
    let got = false;
    for (const filename of FILENAMES) {
      let msgs;
      try {
        msgs = linter.verify(code, cfgFor(rule), { filename });
      } catch {
        continue;
      }
      const actionable = msgs.filter(
        (m: any) => m.ruleId === PREFIX + rule && fixesOf(m).length,
      );
      if (!actionable.length) continue;
      const beforeParsed = parse(code, filename);
      if (!beforeParsed) continue;
      const beforeCounts = nameCounts(beforeParsed.ast);
      for (const m of actionable) {
        const site = offsetOf(code, m.line, m.column);
        const body = enclosingFunctionBody(beforeParsed.ast, site);
        if (!body) continue; // reported at module level: no inner scope to shadow
        for (const fix of fixesOf(m)) {
          const patchedParsed = parse(applyFix(code, fix), filename);
          if (!patchedParsed) continue;
          const modAfter = moduleScope(
            patchedParsed.scopeManager as any,
          ).variables.map((v: any) => v.name);
          for (const [name, n] of nameCounts(patchedParsed.ast)) {
            if (n <= (beforeCounts.get(name) || 0)) continue;
            // Only a name the module scope binds can be mis-resolved by a shadow.
            if (!modAfter.includes(name)) continue;
            triggers.push({ code, filename, name, injectAt: body.range[0] + 1 });
            got = true;
          }
        }
      }
      if (got) break;
    }
  }
  return triggers;
};

type Capture = { name: string; detail: string; patched: string };

const capturesFor = (rule: string, triggers: Trigger[]) => {
  const captures: Capture[] = [];
  let probed = 0;
  const seen = new Set<string>();
  for (const t of triggers) {
    const key = `${t.name}::${t.injectAt}::${t.code.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const decl = `const ${t.name} = undefined as unknown as never;\n`;
    const injected =
      t.code.slice(0, t.injectAt) + '\n' + decl + t.code.slice(t.injectAt);

    const beforeParsed = parse(injected, t.filename);
    if (!beforeParsed) continue;
    // The injected declaration must actually shadow, not land in module scope.
    const injectedVar = resolveAt(
      beforeParsed.scopeManager as any,
      t.name,
      t.injectAt + 2,
    );
    if (!injectedVar) continue;
    if (
      moduleScope(beforeParsed.scopeManager as any).variables.includes(
        injectedVar,
      )
    ) {
      continue;
    }

    probed++;
    const before = capturedCount(beforeParsed, t.name);

    let msgs;
    try {
      msgs = linter.verify(injected, cfgFor(rule), { filename: t.filename });
    } catch {
      continue;
    }
    for (const m of msgs.filter((x: any) => x.ruleId === PREFIX + rule)) {
      for (const fix of fixesOf(m)) {
        const patched = applyFix(injected, fix);
        const afterParsed = parse(patched, t.filename);
        if (!afterParsed) continue;
        const after = capturedCount(afterParsed, t.name);
        if (after > before) {
          captures.push({
            name: t.name,
            detail: `${before} -> ${after} uses of '${t.name}' resolve to the inner shadow`,
            patched,
          });
        }
      }
    }
  }
  return { captures, probed };
};

const transformingRules = Object.keys(plugin.rules)
  .filter((r) => {
    const meta = plugin.rules[r].meta || {};
    return Boolean(meta.fixable) || Boolean(meta.hasSuggestions);
  })
  .filter((r) => fs.existsSync(path.join(TESTS_DIR, `${r}.test.ts`)))
  .sort();

const results = new Map<
  string,
  { triggers: number; probed: number; captures: Capture[] }
>();

for (const rule of transformingRules) {
  const snippets = harvestSnippets(path.join(TESTS_DIR, `${rule}.test.ts`));
  const triggers = triggersFor(rule, snippets);
  const { captures, probed } = capturesFor(rule, triggers);
  results.set(rule, { triggers: triggers.length, probed, captures });
}

const totalProbed = [...results.values()].reduce((a, r) => a + r.probed, 0);
const rulesProbed = [...results.values()].filter((r) => r.probed > 0).length;

describe('fixers must not emit a reference an inner shadow captures', () => {
  /**
   * Coverage floor. Most transforming rules never emit a reference to a
   * module-bound name inside a function — they reorder, rename, delete, rewrite
   * an import specifier in place, or emit an ambient like `Promise.all` — so a
   * low rule count is expected and is not the signal. What must not happen is
   * the extractor breaking and degrading every assertion below to a vacuous
   * pass.
   */
  it('exercises a meaningful number of transforming rules', () => {
    expect(transformingRules.length).toBeGreaterThan(80);
    expect(rulesProbed).toBeGreaterThanOrEqual(15);
    expect(totalProbed).toBeGreaterThanOrEqual(400);
  });

  it.each(transformingRules)('%s', (rule) => {
    const { captures } = results.get(rule)!;
    const report = captures
      .map((c) => `${c.detail}\n--- patched output ---\n${c.patched}`)
      .join('\n\n');
    expect(
      captures.length === 0 ? '' : report,
      // A capture means the fix must decline instead; see #1455 / #1456.
    ).toBe('');
  });
});
