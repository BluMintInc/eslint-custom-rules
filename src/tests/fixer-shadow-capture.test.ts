import { Linter } from 'eslint';
import {
  FALLBACK_FILENAMES,
  FixtureCase,
  defaultFilenameFor,
  harvestFixtureCorpus,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ts = require('typescript');

const PREFIX = '@blumintinc/blumint/';

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
 *
 * The corpus is the suite's OWN `RuleTester` cases, captured by
 * `harvestFixtureCorpus` with their `options`, `filename` and `parserOptions`
 * attached. Text-parsing the test files for string literals — what this guard
 * did until #1732 — dropped every case a suite assembles by interpolation and
 * stripped the configuration from the ones it kept, which is how a rule could
 * be listed among 69 with no trigger while nothing of it had been probed.
 *
 * A fixture written flat has no function block to shadow into, so a rule whose
 * corpus happens to be flat asks this guard nothing. `runNested` below wraps
 * each such fixture and re-asks, which is what distinguishes a rule that CANNOT
 * pose the question from a corpus that merely does not (#1998).
 */

/**
 * Anchoring on the fix range does not work: ESLint merges an
 * `insertTextBefore(program.body[0], import…)` with the call-site replacement
 * into a single fix spanning from offset 0, so the innermost function enclosing
 * that range is the whole file for exactly the import-inserting rules this guard
 * exists to check. Report locations are used instead.
 */

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

/**
 * A case's options must reach the fix pass; an option-gated fixer is otherwise
 * unreachable, and applying them to only one pass would manufacture a finding.
 */
const cfgFor = (rule: string, testCase: FixtureCase): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: parserOptionsFor(testCase),
    rules: { [PREFIX + rule]: severityWithOptions(testCase) },
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

/** Every identifier that DECLARES a binding, at any depth. */
const declarationIdentifiers = (sm: any) => {
  const ids = new Set<any>();
  const visit = (scope: any) => {
    for (const v of scope.variables)
      for (const id of v.identifiers) ids.add(id);
    scope.childScopes.forEach(visit);
  };
  visit(sm.globalScope);
  return ids;
};

/**
 * Uses of `name` resolving to anything other than the module-scope binding.
 *
 * Deliberately not keyed on the injected declaration's offset: the fixer inserts
 * its import above that declaration, shifting it, so any absolute position taken
 * from the pre-fix text is stale in the patched text.
 *
 * Two exclusions keep this counting the documented harm rather than everything
 * that shares a name. Both were needed to clear a false capture on
 * `no-unnecessary-verb-suffix`, whose fixture declares an inner shadow on
 * purpose (#1998):
 *
 * * **No module-scope binding of `name` means no harm is defined.** The harm is
 *   an emitted reference resolving to an inner binding INSTEAD of the
 *   module-scope one; with nothing at module scope there is no intended target
 *   to miss, and counting every resolving use then charges the fixer for
 *   bindings the fixture already had.
 * * **A declaration is not a use.** Counting binding identifiers makes the
 *   probe's own injected declaration read as a captured reference to itself.
 */
const capturedCount = (parsed: Parsed, name: string) => {
  const sm = parsed.scopeManager as any;
  const modVar = moduleScope(sm).variables.find((v: any) => v.name === name);
  if (!modVar) return 0;
  const declarations = declarationIdentifiers(sm);
  let n = 0;
  eachRefSite(parsed.ast, (site: any) => {
    if (site.name !== name || declarations.has(site)) return;
    const v = resolveAt(sm, name, site.range[0]);
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

type Trigger = {
  testCase: FixtureCase;
  filename: string;
  name: string;
  injectAt: number;
};

/** What the run establishes about a rule, before any shadow is injected. */
type Reach = {
  reported: number;
  actionable: number;
  enclosed: number;
  triggers: Trigger[];
};

const triggersFor = (
  rule: string,
  probes: Array<{ testCase: FixtureCase; filename: string }>,
): Reach => {
  const reach: Reach = {
    reported: 0,
    actionable: 0,
    enclosed: 0,
    triggers: [],
  };
  for (const { testCase, filename } of probes) {
    const code = testCase.code;
    let msgs;
    try {
      msgs = linter.verify(code, cfgFor(rule, testCase), { filename });
    } catch {
      continue;
    }
    const mine = msgs.filter((m: any) => m.ruleId === PREFIX + rule);
    if (mine.length) reach.reported++;
    const actionable = mine.filter((m: any) => fixesOf(m).length);
    if (!actionable.length) continue;
    reach.actionable++;
    const beforeParsed = parse(code, filename);
    if (!beforeParsed) continue;
    const beforeCounts = nameCounts(beforeParsed.ast);
    for (const m of actionable) {
      const site = offsetOf(code, m.line, m.column);
      const body = enclosingFunctionBody(beforeParsed.ast, site);
      if (!body) continue; // reported at module level: no inner scope to shadow
      reach.enclosed++;
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
          reach.triggers.push({
            testCase,
            filename,
            name,
            injectAt: body.range[0] + 1,
          });
        }
      }
    }
  }
  return reach;
};

type Capture = {
  name: string;
  detail: string;
  origin: string;
  patched: string;
};

const capturesFor = (rule: string, triggers: Trigger[]) => {
  const captures: Capture[] = [];
  let probed = 0;
  const seen = new Set<string>();
  for (const t of triggers) {
    // The whole fixture, not a prefix of it: under the nesting perturbation
    // below every wrapped variant opens with the same import block and wrapper
    // head, so a truncated key collapses distinct fixtures into one probe.
    const key = `${t.name}::${t.injectAt}::${t.testCase.code}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const code = t.testCase.code;
    const decl = `const ${t.name} = undefined as unknown as never;\n`;
    const injected =
      code.slice(0, t.injectAt) + '\n' + decl + code.slice(t.injectAt);

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
      msgs = linter.verify(injected, cfgFor(rule, t.testCase), {
        filename: t.filename,
      });
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
            origin: `src/tests/${t.testCase.origin} as ${t.filename}`,
            patched,
          });
        }
      }
    }
  }
  return { captures, probed };
};

/* ------------------------------------------------------------------ *
 * The nesting perturbation.
 *
 * A rule whose every report sits at module level is parked above with no shadow
 * put in front of it. That was read as a property of the RULE; for most of the
 * class it is a property of its FIXTURES, which happen to be written flat. This
 * arm settles which is which by wrapping each fixture's body in a function and
 * re-asking. It moved 13 of 21 parked rules off that reason and put 5 of them in
 * front of a real shadow (#1998). All 5 decline correctly.
 *
 * One measured behaviour is deliberately NOT failed here, because it is not a
 * capture. Under a shadow `enforce-mui-rounded-icons` declines only HALF its
 * fix: it still rewrites the module path but drops the identifier rename, so
 * `import NotificationsActiveOutlined from '…/NotificationsActiveRounded'`
 * survives — valid, and misleadingly named, but nothing it emits resolves to
 * the shadow, which is the only question this guard answers.
 * ------------------------------------------------------------------ */

const WRAPPER_NAMES = ['ProbeShell', 'probeBody'];

/**
 * The wrapper's own block, whichever variant produced it.
 *
 * The report-anchored arm cannot reach an import-keyed rule: its report sits on
 * an `ImportDeclaration`, which the wrap deliberately leaves at module level, so
 * `enclosingFunctionBody` is null even though the FIX rewrites call sites inside
 * the wrapper. Standing the shadow in the wrapper block instead is what reaches
 * `enforce-mui-rounded-icons`.
 */
const wrapperBodyOf = (ast: any): any => {
  for (const stmt of ast.body) {
    if (stmt.type !== 'VariableDeclaration') continue;
    const d = stmt.declarations[0];
    if (!d || !d.id || d.id.name !== 'ProbeShell' || !d.init) continue;
    if (d.init.type === 'ArrowFunctionExpression') {
      return d.init.body && d.init.body.type === 'BlockStatement'
        ? d.init.body
        : null;
    }
    if (d.init.type === 'ClassExpression') {
      const m = d.init.body.body[0];
      return m && m.value && m.value.body ? m.value.body : null;
    }
  }
  return null;
};

/** Same extraction as `triggersFor`, anchoring every shadow in the wrapper. */
const wrapperTriggersFor = (
  rule: string,
  probes: Array<{ testCase: FixtureCase; filename: string }>,
): Reach => {
  const reach: Reach = {
    reported: 0,
    actionable: 0,
    enclosed: 0,
    triggers: [],
  };
  for (const { testCase, filename } of probes) {
    const code = testCase.code;
    let msgs;
    try {
      msgs = linter.verify(code, cfgFor(rule, testCase), { filename });
    } catch {
      continue;
    }
    const mine = msgs.filter((m: any) => m.ruleId === PREFIX + rule);
    if (mine.length) reach.reported++;
    const actionable = mine.filter((m: any) => fixesOf(m).length);
    if (!actionable.length) continue;
    reach.actionable++;
    const beforeParsed = parse(code, filename);
    if (!beforeParsed) continue;
    const body = wrapperBodyOf(beforeParsed.ast);
    if (!body) continue;
    reach.enclosed++;
    const beforeCounts = nameCounts(beforeParsed.ast);
    for (const m of actionable) {
      for (const fix of fixesOf(m)) {
        const patchedParsed = parse(applyFix(code, fix), filename);
        if (!patchedParsed) continue;
        const modAfter = moduleScope(
          patchedParsed.scopeManager as any,
        ).variables.map((v: any) => v.name);
        for (const [name, n] of nameCounts(patchedParsed.ast)) {
          if (n <= (beforeCounts.get(name) || 0)) continue;
          if (!modAfter.includes(name)) continue;
          reach.triggers.push({
            testCase,
            filename,
            name,
            injectAt: body.range[0] + 1,
          });
        }
      }
    }
  }
  return reach;
};

/**
 * `await` belonging to the region itself, not to a function nested in it.
 *
 * The wrapper's own modifier is a rule input, and neither spelling is safe as a
 * default: a plain wrapper puts top-level `await` where `await` is not an
 * operator, while a blanket `async` one cannot be a React component, which
 * silences every component-keyed rule. Choosing per fixture is what keeps the
 * arm from manufacturing findings out of its own scaffolding.
 */
const regionNeedsAsync = (nodes: any[]): boolean => {
  let found = false;
  const visit = (n: any) => {
    if (!n || typeof n.type !== 'string' || found) return;
    if (n.type === 'AwaitExpression') {
      found = true;
      return;
    }
    if (n.type === 'ForOfStatement' && n.await) {
      found = true;
      return;
    }
    if (FN_TYPES.has(n.type)) return;
    for (const k of Object.keys(n)) {
      if (k === 'parent') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object' && typeof v.type === 'string') {
        visit(v);
      }
    }
  };
  nodes.forEach(visit);
  return found;
};

/** Top-level forms illegal inside a function body (TS1184 / TS1235). */
const isUnmovable = (node: any): boolean => {
  if (node.declare === true) return true;
  if (
    node.type === 'ExportDefaultDeclaration' ||
    node.type === 'ExportAllDeclaration' ||
    node.type === 'TSExportAssignment' ||
    node.type === 'TSImportEqualsDeclaration' ||
    node.type === 'TSModuleDeclaration'
  ) {
    return true;
  }
  if (node.type === 'ExportNamedDeclaration') {
    if (!node.declaration) return true;
    if (node.declaration.declare === true) return true;
  }
  return false;
};

type WrapVariant = 'arrow' | 'class';

type WrapResult =
  | {
      ok: true;
      flat: string;
      wrapped: string;
      /** Byte spans of the inserted scaffolding, so a report ON it is visible. */
      scaffolding: Array<[number, number]>;
    }
  | { ok: false; reason: string };

/**
 * Strips top-level `export ` (illegal in a function body), keeps imports at
 * module level, and moves the remaining REGION — sliced as one span, so the
 * comments between statements survive — into an enclosing block.
 *
 * `flat` is the export-stripped but still top-level text, and it is the control
 * the wrapped variant is compared against: that attributes a report change to
 * the nesting rather than to the keyword the wrap has to remove.
 */
const wrapFixture = (
  code: string,
  filename: string,
  variant: WrapVariant,
): WrapResult => {
  if (WRAPPER_NAMES.some((n) => code.includes(n))) {
    return { ok: false, reason: 'fixture already uses a wrapper name' };
  }
  const first = parse(code, filename);
  if (!first) return { ok: false, reason: 'fixture does not parse' };
  const body = (first.ast as any).body as any[];
  if (!body.length) return { ok: false, reason: 'empty fixture' };
  for (const node of body) {
    if (isUnmovable(node)) {
      return { ok: false, reason: `unmovable top-level ${node.type}` };
    }
  }

  // Reverse order so each removal leaves the earlier ranges valid.
  let flat = code;
  for (let i = body.length - 1; i >= 0; i--) {
    const node = body[i];
    if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue;
    flat = flat.slice(0, node.range[0]) + flat.slice(node.declaration.range[0]);
  }

  const stripped = parse(flat, filename);
  if (!stripped) return { ok: false, reason: 'export strip broke the parse' };
  const sbody = (stripped.ast as any).body as any[];
  let lastImportEnd = 0;
  let sawNonImport = false;
  for (const node of sbody) {
    if (node.type === 'ImportDeclaration') {
      // An import after other statements cannot be hoisted without reordering.
      if (sawNonImport) {
        return { ok: false, reason: 'import interleaved with statements' };
      }
      lastImportEnd = node.range[1];
    } else {
      sawNonImport = true;
    }
  }
  if (!sawNonImport)
    return { ok: false, reason: 'nothing but imports to wrap' };

  const head = flat.slice(0, lastImportEnd);
  const region = flat.slice(lastImportEnd);
  const asyncKeyword = regionNeedsAsync(
    sbody.filter((n) => n.type !== 'ImportDeclaration'),
  )
    ? 'async '
    : '';

  const prefix =
    variant === 'arrow'
      ? `\nconst ProbeShell = ${asyncKeyword}() => {\n`
      : `\nconst ProbeShell = class {\n  ${asyncKeyword}probeBody() {\n`;
  const suffix = variant === 'arrow' ? `\n};\n` : `\n  }\n};\n`;
  const wrapped = `${head}${prefix}${region}${suffix}`;

  return {
    ok: true,
    flat,
    wrapped,
    scaffolding: [
      [head.length, head.length + prefix.length],
      [wrapped.length - suffix.length, wrapped.length],
    ],
  };
};

const idsOf = (msgs: any[], rule: string) =>
  msgs
    .filter((m) => m.ruleId === PREFIX + rule)
    .map((m) => `${m.messageId || m.message}${m.fix ? '+fix' : ''}`)
    .sort();

const verifyOf = (rule: string, testCase: FixtureCase, filename: string) => {
  try {
    return linter.verify(testCase.code, cfgFor(rule, testCase), { filename });
  } catch {
    return null;
  }
};

/**
 * Validity as a DIFFERENTIAL checker run. A reparse does not see grammar errors
 * — `declare` in a body is TS1184, a namespace in one is TS1235, and both parse
 * — so the variant counts as valid only when it introduces no diagnostic CODE
 * the flat control already carries. An ABSOLUTE count is useless here: fixtures
 * are full of unresolved names (TS2304), which would reject every variant.
 */
const TS_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.Preserve,
  experimentalDecorators: true,
  skipLibCheck: true,
  noEmit: true,
  allowJs: true,
};
const baseHost = ts.createCompilerHost(TS_OPTIONS, true);
/**
 * Parsing the ~200 lib files dominates every program below and
 * `createCompilerHost` does not cache across programs. A hand-rolled
 * `noLib`/`noResolve` host is not the alternative: it leaves the checker
 * without globals and THROWS rather than returning diagnostics, which would
 * read as clean.
 */
const libCache = new Map<string, any>();
const cachedLib = (f: string, ...rest: any[]) => {
  if (libCache.has(f)) return libCache.get(f);
  const sf = baseHost.getSourceFile(f, ...rest);
  libCache.set(f, sf);
  return sf;
};

const diagnosticCache = new Map<string, Map<number, number>>();

const diagnosticCodesFor = (
  text: string,
  filename: string,
): Map<number, number> => {
  const name = filename.startsWith('/') ? filename : `/probe/${filename}`;
  const key = `${name}\n${text}`;
  const cached = diagnosticCache.get(key);
  if (cached) return cached;
  const sourceFile = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.ES2022,
    true,
    name.endsWith('.tsx')
      ? ts.ScriptKind.TSX
      : name.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : name.endsWith('.js')
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS,
  );
  const host = Object.create(baseHost);
  host.getSourceFile = (f: string, ...rest: any[]) =>
    f === name ? sourceFile : cachedLib(f, ...rest);
  host.fileExists = (f: string) => f === name || baseHost.fileExists(f);
  host.readFile = (f: string) => (f === name ? text : baseHost.readFile(f));
  const program = ts.createProgram({
    rootNames: [name],
    options: TS_OPTIONS,
    host,
  });
  if (program.getSourceFile(name) !== sourceFile) {
    throw new Error(`program lost the probe file ${name}`);
  }
  const counts = new Map<number, number>();
  for (const d of [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ]) {
    counts.set(d.code, (counts.get(d.code) || 0) + 1);
  }
  diagnosticCache.set(key, counts);
  return counts;
};

/** Counted, never swallowed: an unvalidatable variant is not a valid one. */
let validationErrors = 0;

const introducedDiagnostics = (
  base: string,
  variant: string,
  filename: string,
): number[] | null => {
  try {
    const baseCodes = diagnosticCodesFor(base, filename);
    const variantCodes = diagnosticCodesFor(variant, filename);
    const introduced: number[] = [];
    for (const [code, n] of variantCodes) {
      if (n > (baseCodes.get(code) || 0)) introduced.push(code);
    }
    return introduced;
  } catch {
    validationErrors++;
    return null;
  }
};

type WrapCounters = {
  /** Fixtures the rule reports on flat; only those can move the enclosure count. */
  reporting: number;
  wrappable: number;
  droppedByExportStrip: number;
  droppedByWrap: number;
  droppedReportOnWrapper: number;
  droppedInvalid: number;
  droppedUnvalidatable: number;
  neutral: number;
  /** Reports on neutral wrapped variants that still anchor inside an import. */
  importAnchored: number;
};

type NestedVariant = WrapCounters & {
  reach: Reach;
  wrapperReach: Reach;
  probed: number;
  captures: Capture[];
};

const importRangesOf = (ast: any) => {
  const out: number[][] = [];
  walkAst(ast, (n) => {
    if (n.type === 'ImportDeclaration') out.push(n.range);
  });
  return out;
};

const runNestedVariant = (
  rule: string,
  variant: WrapVariant,
  cases: FixtureCase[],
): NestedVariant => {
  const out: NestedVariant = {
    reporting: 0,
    wrappable: 0,
    droppedByExportStrip: 0,
    droppedByWrap: 0,
    droppedReportOnWrapper: 0,
    droppedInvalid: 0,
    droppedUnvalidatable: 0,
    neutral: 0,
    importAnchored: 0,
    reach: { reported: 0, actionable: 0, enclosed: 0, triggers: [] },
    wrapperReach: { reported: 0, actionable: 0, enclosed: 0, triggers: [] },
    probed: 0,
    captures: [],
  };
  const probes: Array<{ testCase: FixtureCase; filename: string }> = [];

  for (const testCase of cases) {
    const filename = defaultFilenameFor(testCase);
    const baseMsgs = verifyOf(rule, testCase, filename);
    if (!baseMsgs) continue;
    const baseIds = idsOf(baseMsgs, rule);
    if (!baseIds.length) continue;
    out.reporting++;

    const wrap = wrapFixture(testCase.code, filename, variant);
    if (!wrap.ok) continue;
    out.wrappable++;

    const flatCase: FixtureCase = { ...testCase, code: wrap.flat };
    const flatMsgs = verifyOf(rule, flatCase, filename);
    if (!flatMsgs || idsOf(flatMsgs, rule).join('|') !== baseIds.join('|')) {
      out.droppedByExportStrip++;
      continue;
    }

    const wrappedCase: FixtureCase = { ...testCase, code: wrap.wrapped };
    const wrappedMsgs = verifyOf(rule, wrappedCase, filename);
    if (
      !wrappedMsgs ||
      idsOf(wrappedMsgs, rule).join('|') !== baseIds.join('|')
    ) {
      out.droppedByWrap++;
      continue;
    }
    const mine = wrappedMsgs.filter((m: any) => m.ruleId === PREFIX + rule);
    /**
     * A matching messageId multiset is NOT neutrality. On 44 `global-const-style`
     * fixtures it matched exactly while the SUBJECT had swapped: the rule lost
     * its report on the fixture's own const (the wrap took it out of module
     * scope) and gained one renaming `ProbeShell` itself, one in and one out.
     * Both gates, or the control certifies its own contamination (#1998).
     */
    if (
      mine.some((m: any) => {
        const off = offsetOf(wrap.wrapped, m.line, m.column);
        return wrap.scaffolding.some(([a, b]) => off >= a && off < b);
      })
    ) {
      out.droppedReportOnWrapper++;
      continue;
    }

    const introduced = introducedDiagnostics(wrap.flat, wrap.wrapped, filename);
    // `null` is "could not validate", which is not "valid": counted at its own
    // skip so it can never read as zero from downstream.
    if (introduced === null) {
      out.droppedUnvalidatable++;
      continue;
    }
    if (introduced.length) {
      out.droppedInvalid++;
      continue;
    }

    out.neutral++;
    const wrappedParsed = parse(wrap.wrapped, filename);
    if (wrappedParsed) {
      const ranges = importRangesOf(wrappedParsed.ast);
      for (const m of mine) {
        const off = offsetOf(wrap.wrapped, m.line, m.column);
        if (ranges.some(([a, b]) => off >= a && off < b)) out.importAnchored++;
      }
    }
    probes.push({ testCase: wrappedCase, filename });
  }

  out.reach = triggersFor(rule, probes);
  out.wrapperReach = wrapperTriggersFor(rule, probes);
  const anchored = capturesFor(rule, out.reach.triggers);
  const wrapped = capturesFor(rule, out.wrapperReach.triggers);
  out.probed = anchored.probed + wrapped.probed;
  out.captures = [...anchored.captures, ...wrapped.captures];
  return out;
};

const WRAP_VARIANTS: WrapVariant[] = ['arrow', 'class'];

type Nested = {
  byVariant: Record<string, NestedVariant>;
  wrappable: number;
  neutral: number;
  dropped: number;
  enclosed: number;
  importAnchored: number;
  triggers: number;
  probed: number;
  captures: Capture[];
};

const runNested = (rule: string, cases: FixtureCase[]): Nested => {
  const byVariant: Record<string, NestedVariant> = {};
  for (const variant of WRAP_VARIANTS) {
    byVariant[variant] = runNestedVariant(rule, variant, cases);
  }
  const all = Object.values(byVariant);
  const sum = (pick: (v: NestedVariant) => number) =>
    all.reduce((a, v) => a + pick(v), 0);
  return {
    byVariant,
    wrappable: sum((v) => v.wrappable),
    neutral: sum((v) => v.neutral),
    dropped: sum(
      (v) =>
        v.droppedByExportStrip +
        v.droppedByWrap +
        v.droppedReportOnWrapper +
        v.droppedInvalid +
        v.droppedUnvalidatable,
    ),
    enclosed: sum((v) => v.reach.enclosed),
    importAnchored: sum((v) => v.importAnchored),
    triggers: sum(
      (v) => v.reach.triggers.length + v.wrapperReach.triggers.length,
    ),
    probed: sum((v) => v.probed),
    captures: all.flatMap((v) => v.captures),
  };
};

const corpus = harvestFixtureCorpus();

const transformingRules = Object.keys(plugin.rules)
  .filter((r) => {
    const meta = plugin.rules[r].meta || {};
    return Boolean(meta.fixable) || Boolean(meta.hasSuggestions);
  })
  .sort();

type RuleResult = {
  cases: number;
  /** Fixtures excluded for not being TypeScript, so the reason can say so. */
  nonTypeScript: number;
  reach: Reach;
  probed: number;
  captures: Capture[];
  /** Only for a rule the flat pass parks with no enclosure; see `runNested`. */
  nested: Nested | null;
};

const results = new Map<string, RuleResult>();

for (const rule of transformingRules) {
  const declared = corpus.byRule.get(rule) || [];
  /**
   * TypeScript fixtures only. A shadow is a lexical binding injected into a
   * function block, and neither JSON nor Markdown has either, so a case in
   * those languages cannot pose this guard's question. Excluding them by
   * language rather than by parse failure is what keeps the answer honest:
   * several Markdown fixtures happen to be legal TypeScript (a fence is an
   * empty template literal), so leaving them in let them answer a scope
   * question by accident (#1860).
   */
  const cases = declared.filter((testCase) => testCase.language === 'ts');
  let reach = triggersFor(
    rule,
    cases.map((testCase) => ({
      testCase,
      filename: defaultFilenameFor(testCase),
    })),
  );
  /**
   * Second chance only for a rule that reported NOTHING. Once a rule reports,
   * the path it was probed under is not what decides whether its fix emits a
   * reference, so re-probing the whole corpus under seven invented filenames
   * would multiply the cost of the pass without changing an outcome — but a
   * rule that never reported at all may simply have been handed a path it
   * rejects, and that would be a false reason.
   */
  if (reach.reported === 0 && cases.length) {
    reach = triggersFor(
      rule,
      cases.flatMap((testCase) =>
        testCase.filename
          ? []
          : FALLBACK_FILENAMES.map((filename) => ({ testCase, filename })),
      ),
    );
  }
  const { captures, probed } = capturesFor(rule, reach.triggers);
  /**
   * The nesting perturbation runs for exactly the class it settles: a rule that
   * transforms something but whose every report sits outside any function
   * block. Scoping it that way is what keeps it derived rather than listed — a
   * rule that later falls into the class is perturbed without being named —
   * and holds the cost to the ~21 rules that can learn anything from it.
   */
  const nested =
    reach.actionable > 0 && reach.enclosed === 0
      ? runNested(rule, cases)
      : null;
  results.set(rule, {
    cases: cases.length,
    nonTypeScript: declared.length - cases.length,
    reach,
    probed: probed + (nested ? nested.probed : 0),
    captures: [...captures, ...(nested ? nested.captures : [])],
    nested,
  });
}

const totalProbed = [...results.values()].reduce((a, r) => a + r.probed, 0);
const totalTriggers = [...results.values()].reduce(
  (a, r) => a + r.reach.triggers.length + (r.nested ? r.nested.triggers : 0),
  0,
);
const rulesProbed = [...results.values()].filter((r) => r.probed > 0).length;

const nestedResults = [...results.values()]
  .map((r) => r.nested)
  .filter((n): n is Nested => n !== null);
const nestedVariants = nestedResults.flatMap((n) => Object.values(n.byVariant));
const nestSum = (pick: (n: Nested) => number) =>
  nestedResults.reduce((a, n) => a + pick(n), 0);
const nestedTotals = {
  rules: nestedResults.length,
  neutral: nestSum((n) => n.neutral),
  dropped: nestSum((n) => n.dropped),
  /** Rules the wrap gives a function block at the report site. */
  enclosureGained: nestedResults.filter((n) => n.enclosed > 0).length,
  probedRules: nestedResults.filter((n) => n.probed > 0).length,
  droppedByExportStrip: nestedVariants.reduce(
    (a, v) => a + v.droppedByExportStrip,
    0,
  ),
  droppedByWrap: nestedVariants.reduce((a, v) => a + v.droppedByWrap, 0),
  droppedReportOnWrapper: nestedVariants.reduce(
    (a, v) => a + v.droppedReportOnWrapper,
    0,
  ),
  droppedInvalid: nestedVariants.reduce((a, v) => a + v.droppedInvalid, 0),
  droppedUnvalidatable: nestedVariants.reduce(
    (a, v) => a + v.droppedUnvalidatable,
    0,
  ),
};

/**
 * Why a rule's transforms were never put in front of a shadow. Derived from the
 * run rather than asserted by hand, so an entry cannot claim a reason the
 * corpus contradicts — and the reasons are deliberately distinct, because
 * "emits no reference to a module-bound name" (the expected, healthy answer for
 * a reordering or deleting fixer) and "never reports at all" (a broken corpus)
 * are the two facts a single bucket would conflate.
 */
const REASONS = {
  noFixtures: 'declares no fixture this TypeScript harness can lint',
  nonTypeScript:
    'declares only JSON or Markdown fixtures, which have no lexical scope for a shadow to stand in',
  // Held for a rule that measurably produces nothing here. The old wording
  // ("is type-aware, and a bare Linter has no program") was a premise, not a
  // measurement, and a false one: the parser builds an isolated program and all
  // 16 checker-touching rules report over their own fixtures (#1859).
  undrivable:
    'is measurably silent under this harness, so it reports nothing here',
  neverReports: 'never reports on any of its own fixtures',
  noTransform: 'reports on its own fixtures but offers no fix or suggestion',
  /**
   * The four below split a single `noEnclosingBlock` that had covered 21 rules
   * (#1998). "No function block encloses the report" is a fact about the
   * FIXTURES for most of that class — they are simply written flat — and the
   * nesting perturbation separates the two readings by wrapping each fixture and
   * re-asking. 14 of the 21 moved off it: 13 gain a block once nested, and
   * `enforce-mui-rounded-icons` is reached by the wrapper-anchored arm without
   * gaining one. Of the 7 that remain, only `enforce-unique-cursor-headers`
   * still answers with the original reason; the other 6 name a sharper
   * obstruction that the flat pass could not distinguish from it.
   */
  noWrappableBody:
    'reports on no fixture with a wrappable body — each is imports-only, or a top-level form illegal inside a function',
  moduleScopeKeyed:
    'is keyed on module scope, so wrapping its fixture changes its answer and no nested variant is neutral',
  importAnchoredReport:
    'anchors its report on an import, which stays at module level however its fixture is nested, so no shadow can stand',
  noEnclosingBlock:
    'reports outside every function block even once its fixture is nested, so no shadow can stand',
  noModuleBoundReference:
    'emits no new reference to a module-scope-bound name, so no shadow can capture one',
  shadowNeverLanded:
    'emits such a reference, but the injected declaration never shadowed it',
} as const;

type Reason = typeof REASONS[keyof typeof REASONS];

/** Only meaningful for a rule with no probe; the branches narrow toward one. */
const unprobedReasonFor = (rule: string): Reason => {
  const { cases, nonTypeScript, reach, nested } = results.get(rule)!;
  if (cases === 0) {
    return nonTypeScript > 0 ? REASONS.nonTypeScript : REASONS.noFixtures;
  }
  // Undrivability outranks the report counts: a rule that produces nothing at
  // all here says nothing about itself, so its counts are not evidence.
  if (reach.actionable === 0) {
    if (silentWithoutProgramRuleNames.has(rule)) return REASONS.undrivable;
    return reach.reported === 0 ? REASONS.neverReports : REASONS.noTransform;
  }
  // Flat, nothing encloses the report. The perturbation decides whether that is
  // the rule speaking or its fixtures, and each branch below is a distinct
  // measured obstruction rather than a restatement of the same one.
  if (reach.enclosed === 0 && nested) {
    if (nested.wrappable === 0) return REASONS.noWrappableBody;
    if (nested.neutral === 0) return REASONS.moduleScopeKeyed;
    if (nested.enclosed === 0) {
      return nested.importAnchored > 0
        ? REASONS.importAnchoredReport
        : REASONS.noEnclosingBlock;
    }
    if (nested.triggers === 0) return REASONS.noModuleBoundReference;
    return REASONS.shadowNeverLanded;
  }
  if (reach.triggers.length === 0) return REASONS.noModuleBoundReference;
  // Triggers existed, so the injection step is the only thing left that can
  // have dropped them.
  return REASONS.shadowNeverLanded;
};

const observedUnprobed = Object.fromEntries(
  transformingRules
    .filter((rule) => results.get(rule)!.probed === 0)
    .map((rule) => [rule, unprobedReasonFor(rule)]),
);

/**
 * Every transforming rule this corpus never puts in front of a shadow, with the
 * reason the run produces for it.
 *
 * Most entries are `noModuleBoundReference`, and that is the healthy answer: a
 * fixer that reorders members, deletes a wrapper, renames in place or rewrites
 * an import specifier emits no reference at all, so there is nothing for an
 * inner binding to capture. The list exists because the ALTERNATIVE readings —
 * a rule that stopped reporting, a corpus that stopped carrying its triggers —
 * are indistinguishable from that one until each rule is named with its reason.
 */
const UNPROBED_RULES: Record<string, Reason> = {
  /**
   * Their fixtures are Markdown documents and `package.json` bodies. Both rules
   * are probed here for what this guard can ask of them — nothing: a shadow is
   * an inner binding that re-resolves an emitted reference, and neither
   * language has a binding or a function block. Their fixers are exercised by
   * `fixer-convergence` and their messages by `message-render-integrity`.
   */
  'enforce-typescript-markdown-code-blocks': REASONS.nonTypeScript,
  'no-unpinned-dependencies': REASONS.nonTypeScript,

  // Its fixer RELOCATES text rather than emitting any: the memoized expression
  // moves out of the `useMemo` callback to the call's own position, one scope
  // outward. Moving a reference outward can only lose shadows, never acquire
  // one, and the callback declares nothing of its own in the shapes the fixer
  // accepts, so resolution is identical before and after (#1871).
  'no-usememo-for-pass-by-value': REASONS.noModuleBoundReference,

  /**
   * The four classes below were ONE entry, `noEnclosingBlock`, covering all 21
   * rules whose every report sits outside a function block. The nesting
   * perturbation settled what each was really saying (#1998): for 13 of them
   * the flatness belonged to the FIXTURES, which the wrap relocates, and 5 of
   * those then reach a real shadow and left this list entirely —
   * `enforce-mui-rounded-icons`, `enforce-snapshot-state-narrowing`,
   * `prefer-clone-deep`, `prefer-fragment-component` and `prefer-next-dynamic`,
   * each of which declines correctly under one.
   *
   * `enforce-memoize-getters` (#1947) and `require-memoize-jsx-returners`
   * (#1950) are absent for a different reason again: their corpora carry class
   * declarations nested in a function whose members are reported AND decorated,
   * so the flat pass already drives them for real.
   */

  // Its report anchors on an ImportDeclaration, which the wrap deliberately
  // leaves at module level, so nesting the fixture cannot enclose it. The fix
  // still rewrites call sites INSIDE the wrapper, which the wrapper-anchored
  // arm reaches — for these three it emits no module-bound reference there.
  'enforce-dynamic-firebase-imports': REASONS.importAnchoredReport,
  'use-custom-memo': REASONS.importAnchoredReport,
  'use-custom-router': REASONS.importAnchoredReport,

  // All 7 fixtures it reports on are nothing but an import list: there is no
  // region to move, so the perturbation has no variant to offer it. Closing
  // this needs a FIXTURE with a body, not a rewrite of one that has none.
  'use-custom-link': REASONS.noWrappableBody,

  // Keyed on module scope by design, so the wrap is not neutral for it at all:
  // every one of its wrapped variants is dropped by a neutrality gate, and a
  // finding taken from one would be about the probe rather than the rule.
  'global-const-style': REASONS.moduleScopeKeyed,
  'prefer-block-comments-for-declarations': REASONS.moduleScopeKeyed,

  // Genuinely anchor-free: `reportMissingHeader` reports at `line 1, column 0`
  // and the duplicate/split arms report on the file's leading comments, none of
  // which any wrapper can enclose. This is the one rule of the 21 for which the
  // original reason survives the perturbation unchanged.
  'enforce-unique-cursor-headers': REASONS.noEnclosingBlock,

  // Nested, their reports DO land in a function block, and the fix still emits
  // no reference for a shadow to capture — the same healthy answer as the
  // majority below, now measured rather than masked by a flat fixture.
  'enforce-date-ttime': REASONS.noModuleBoundReference,
  'enforce-firestore-rules-get-access': REASONS.noModuleBoundReference,
  'enforce-m3-sentence-case': REASONS.noModuleBoundReference,
  'jsdoc-above-field': REASONS.noModuleBoundReference,
  'no-unnecessary-destructuring': REASONS.noModuleBoundReference,
  'omit-index-html': REASONS.noModuleBoundReference,
  'prefer-fragment-shorthand': REASONS.noModuleBoundReference,
  'prefer-getter-over-parameterless-method': REASONS.noModuleBoundReference,
  'sync-onwrite-name-func': REASONS.noModuleBoundReference,

  // The healthy majority: these fixers reorder, rename in place, delete a
  // wrapper or rewrite an import specifier, and emit no reference at all.
  'class-methods-read-top-to-bottom': REASONS.noModuleBoundReference,
  // `consistent-callback-naming` is absent from this class deliberately
  // (#1948). Its rename emits the new name at every reference, so the reason
  // held only while no fixture paired a module-scope `handle*` declaration with
  // a reference inside the function body enclosing the report — the one place
  // this guard can stand a shadow. Its corpus carries a recursive function that
  // does, and the probe below drives the rule for real.
  //
  // `enforce-centralized-mock-firestore` left this class for the same reason
  // (#1967): its fixer injects a module-scope `mockFirestore` import and then
  // renames the call sites to it, so once a fixture destructured the mock under
  // a new name INSIDE a function, the reason stopped holding and the probe
  // below drives it for real.
  'enforce-early-destructuring': REASONS.noModuleBoundReference,
  'enforce-empty-object-check': REASONS.noModuleBoundReference,
  'enforce-exported-function-types': REASONS.noModuleBoundReference,
  'enforce-fieldpath-syntax-in-docsetter': REASONS.noModuleBoundReference,
  'enforce-id-capitalization': REASONS.noModuleBoundReference,
  'enforce-object-literal-as-const': REASONS.noModuleBoundReference,
  'enforce-props-argument-name': REASONS.noModuleBoundReference,
  'enforce-props-naming-consistency': REASONS.noModuleBoundReference,
  'enforce-react-type-naming': REASONS.noModuleBoundReference,
  'ensure-pointer-events-none': REASONS.noModuleBoundReference,
  'flatten-push-calls': REASONS.noModuleBoundReference,
  'key-only-outermost-element': REASONS.noModuleBoundReference,
  'logical-top-to-bottom-grouping': REASONS.noModuleBoundReference,
  'no-class-instance-destructuring': REASONS.noModuleBoundReference,
  // Reaches inside a function block once the parent gate spans every statement
  // list, but the fix only strips braces, so it emits no reference to capture.
  'no-curly-brackets-around-commented-properties':
    REASONS.noModuleBoundReference,
  'no-direct-function-state': REASONS.noModuleBoundReference,
  'no-empty-dependency-use-callbacks': REASONS.noModuleBoundReference,
  'no-entire-object-hook-deps': REASONS.noModuleBoundReference,
  'no-excessive-parent-chain': REASONS.noModuleBoundReference,
  'no-explicit-return-type': REASONS.noModuleBoundReference,
  'no-firestore-jest-mock': REASONS.noModuleBoundReference,
  'no-redundant-annotation-assertion': REASONS.noModuleBoundReference,
  'no-redundant-param-types': REASONS.noModuleBoundReference,
  'no-redundant-usecallback-wrapper': REASONS.noModuleBoundReference,
  'no-unnecessary-destructuring-rename': REASONS.noModuleBoundReference,
  'no-unused-usestate': REASONS.noModuleBoundReference,
  'no-useless-fragment': REASONS.noModuleBoundReference,
  // Like no-usememo-for-pass-by-value above: the fixer relocates the memoized
  // expression out of the `useMemo` callback, one scope outward, emitting no
  // reference of its own. Its fixtures include reports inside function blocks
  // (the #1591/#1877 comment-carriage cases live in hook bodies), so the
  // enclosing-block reason does not describe it.
  'no-useless-usememo-primitives': REASONS.noModuleBoundReference,
  'parallelize-async-operations': REASONS.noModuleBoundReference,
  'prefer-destructuring-no-class': REASONS.noModuleBoundReference,
  'prefer-document-flattening': REASONS.noModuleBoundReference,
  'prefer-nullish-coalescing-boolean-props': REASONS.noModuleBoundReference,
  'prefer-params-over-parent-id': REASONS.noModuleBoundReference,
  'prefer-spread-over-reassembly': REASONS.noModuleBoundReference,
  'prefer-sx-prop-over-system-props': REASONS.noModuleBoundReference,
  'prefer-type-over-interface': REASONS.noModuleBoundReference,
  'prefer-union-from-const-array': REASONS.noModuleBoundReference,
  'prefer-url-tostring-over-tojson': REASONS.noModuleBoundReference,
  'require-hooks-default-params': REASONS.noModuleBoundReference,
  'vertically-group-related-functions': REASONS.noModuleBoundReference,
};

const reportOf = (captures: Capture[]) =>
  captures
    .map(
      (c) => `${c.detail}\n${c.origin}\n--- patched output ---\n${c.patched}`,
    )
    .join('\n\n');

console.log(
  [
    `[fixer-shadow-capture] ${rulesProbed} of ${transformingRules.length} ` +
      `transforming rules probed; ${totalProbed} shadow injections from ` +
      `${totalTriggers} emitted references`,
    `  corpus: ${corpus.totalCases} cases from ${corpus.suitesUsed} suites, ` +
      `${corpus.filesLoaded} files loaded, ${corpus.failures.length} failed`,
    `  nesting perturbation: ${nestedTotals.rules} rules wrapped, ` +
      `${nestedTotals.enclosureGained} gain an enclosing block, ` +
      `${nestedTotals.probedRules} reach a shadow; ` +
      `${nestedTotals.neutral} variants neutral, ${nestedTotals.dropped} ` +
      `dropped (strip ${nestedTotals.droppedByExportStrip}, wrap ` +
      `${nestedTotals.droppedByWrap}, on-wrapper ` +
      `${nestedTotals.droppedReportOnWrapper}, invalid ` +
      `${nestedTotals.droppedInvalid}, unvalidatable ` +
      `${nestedTotals.droppedUnvalidatable}), ${validationErrors} ` +
      `validation errors`,
    `  unprobed (${
      Object.keys(observedUnprobed).length
    }), each with its reason:`,
    ...Object.entries(observedUnprobed).map(
      ([rule, reason]) => `    ${rule}: ${reason}`,
    ),
  ].join('\n'),
);

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
    // Exact, not a floor: every unprobed rule is named below with the reason
    // the run produced for it, so slack here would only hide a rule going dark.
    expect(rulesProbed).toBe(
      transformingRules.length - Object.keys(UNPROBED_RULES).length,
    );
    expect(totalProbed).toBeGreaterThanOrEqual(1300);
    expect(corpus.failures).toEqual([]);
  });

  /**
   * The nesting perturbation's own non-vacuity. Its whole contribution is
   * REACH — it finds no defect today — so nothing downstream would notice it
   * degrading to zero wrapped fixtures, and the guard would go on passing while
   * asking 21 rules nothing at all.
   */
  it('the nesting perturbation reaches a shadow it could not reach flat', () => {
    expect(nestedTotals.rules).toBeGreaterThanOrEqual(21);
    expect(nestedTotals.enclosureGained).toBeGreaterThanOrEqual(13);
    expect(nestedTotals.probedRules).toBeGreaterThanOrEqual(5);
    expect(nestedTotals.neutral).toBeGreaterThanOrEqual(980);
    // An unvalidatable variant is not a valid one. Both zeros are trustworthy
    // only because the counter sits at its own skip rather than downstream.
    expect(validationErrors).toBe(0);
    expect(nestedTotals.droppedUnvalidatable).toBe(0);
    // Every gate must be observed removing something: a control that never
    // drops anything is indistinguishable from an absent one.
    expect(nestedTotals.droppedByExportStrip).toBeGreaterThanOrEqual(16);
    expect(nestedTotals.droppedByWrap).toBeGreaterThanOrEqual(190);
    expect(nestedTotals.droppedReportOnWrapper).toBeGreaterThanOrEqual(70);
    expect(nestedTotals.droppedInvalid).toBeGreaterThanOrEqual(6);
  });

  /**
   * Why BOTH wrapper spellings ship, on the rule that proves it.
   *
   * Under the arrow wrapper `global-const-style` simply falls silent — its
   * subject leaves module scope — and the messageId multiset gate catches that.
   * Under the class wrapper the multiset MATCHES, because the report it loses on
   * the fixture's own const is replaced one-for-one by a report renaming
   * `ProbeShell` itself: same shape, different subject. Only the second gate
   * sees it, and only this variant makes the second gate fire. Ship one variant
   * and that gate becomes decoration (#1998).
   */
  it('keeps both neutrality gates load-bearing, not just the multiset one', () => {
    const { byVariant } = results.get('global-const-style')!.nested!;
    expect(byVariant.arrow.droppedByWrap).toBeGreaterThanOrEqual(65);
    expect(byVariant.arrow.droppedReportOnWrapper).toBe(0);
    expect(byVariant.class.droppedReportOnWrapper).toBeGreaterThanOrEqual(40);
    // Neither variant may leave it a usable fixture; a single survivor here
    // would be one the probe had silently swapped the subject of.
    expect(byVariant.arrow.neutral).toBe(0);
    expect(byVariant.class.neutral).toBe(0);
  });

  /**
   * Every transforming rule is either probed or listed with the reason the run
   * itself produced, enforced BOTH ways: a rule that stops being probed must be
   * added consciously, and an entry whose reason stops holding must be deleted.
   * Without this the per-rule assertion below is `expect('').toBe('')` for 69
   * of the 90 rules and says nothing at all (#1732).
   */
  it('accounts for every transforming rule, unprobed ones by reason', () => {
    expect(observedUnprobed).toEqual(UNPROBED_RULES);
  });

  it.each(transformingRules)('%s', (rule) => {
    const { captures, probed } = results.get(rule)!;
    const problems: string[] = [];
    if (probed === 0 && !(rule in UNPROBED_RULES)) {
      problems.push(
        `no transform of this rule was put in front of a shadow ` +
          `(${unprobedReasonFor(
            rule,
          )}). Restore a triggering fixture, or add the ` +
          `rule to UNPROBED_RULES with that reason.`,
      );
    }
    // A capture means the fix must decline instead; see #1455 / #1456.
    if (captures.length) problems.push(reportOf(captures));
    expect(problems.join('\n\n')).toBe('');
  });
});

/**
 * Planted fixers of both polarities, run through the same `triggersFor` /
 * `capturesFor` the shipped rules go through.
 *
 * Every shipped rule is clean on this axis, so without a planted defect the
 * detector is only ever observed returning nothing — and a harness that stopped
 * detecting anything at all would read exactly the same way. The negative
 * control is what keeps the positive one honest: it emits the SAME reference to
 * the SAME module-bound name, but at module level where the injected shadow
 * cannot reach it, so a detector that simply flagged every emitted name would
 * fail it.
 */
const IMPORT_HELPER = "import { helper } from './helpers';\n";

const controlRule = (emitAtModuleLevel: boolean) => ({
  meta: {
    type: 'problem' as const,
    fixable: 'code' as const,
    schema: [],
    messages: { m: 'x' },
  },
  create(context: any) {
    return {
      CallExpression(node: any) {
        if (node.callee.name !== 'render') return;
        const program = context.getSourceCode().ast;
        context.report({
          node,
          messageId: 'm',
          fix: (fixer: any) => [
            fixer.insertTextBefore(program.body[0], IMPORT_HELPER),
            emitAtModuleLevel
              ? fixer.insertTextAfter(
                  program.body[program.body.length - 1],
                  '\nexport const alias = helper;\n',
                )
              : fixer.replaceText(node.callee, 'helper'),
          ],
        });
      },
    };
  },
});

const SHADOW_CONTROLS = [
  {
    name: 'control-shadow-captured',
    expectCaptures: 1,
    rule: controlRule(false),
  },
  {
    name: 'control-shadow-uncaptured',
    expectCaptures: 0,
    rule: controlRule(true),
  },
];

for (const control of SHADOW_CONTROLS) {
  linter.defineRule(PREFIX + control.name, control.rule as never);
}

const CONTROL_CASE: FixtureCase = {
  code: 'export function run() {\n  return render();\n}\n',
  tester: 'ruleTesterTs',
  origin: 'planted control',
  bucket: 'valid',
};

/**
 * The same two controls again, but written FLAT — deliberately with no function
 * anywhere, so the report site has nothing enclosing it and the report-anchored
 * arm cannot reach it at all. Running them through `wrapFixture` is what proves
 * the perturbation MANUFACTURES the reach it claims to, rather than the 5 newly
 * probed rules having been reachable all along by some other route.
 */
const FLAT_CONTROL_CASE: FixtureCase = {
  code: "import { x } from './x';\nconst out = render(x);\n",
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted nesting control',
  bucket: 'valid',
};

const nestedControlOutcome = (name: string, variant: WrapVariant) => {
  const flat = triggersFor(name, [
    { testCase: FLAT_CONTROL_CASE, filename: 'file.ts' },
  ]);
  const wrap = wrapFixture(FLAT_CONTROL_CASE.code, 'file.ts', variant);
  if (!wrap.ok) throw new Error(`control unwrappable: ${wrap.reason}`);
  const wrapped = triggersFor(name, [
    {
      testCase: { ...FLAT_CONTROL_CASE, code: wrap.wrapped },
      filename: 'file.ts',
    },
  ]);
  return { flat, wrapped, ...capturesFor(name, wrapped.triggers) };
};

describe('the shadow-capture detector is load-bearing', () => {
  it.each(SHADOW_CONTROLS.map((c) => [c.name, c.expectCaptures] as const))(
    'control %s yields %s capture(s)',
    (name, expectCaptures) => {
      const reach = triggersFor(name, [
        { testCase: CONTROL_CASE, filename: 'file.ts' },
      ]);
      // A control whose fix never emitted a module-bound reference would never
      // reach the injection step, and its zero would prove nothing.
      expect(reach.triggers.length).toBeGreaterThan(0);
      const { captures, probed } = capturesFor(name, reach.triggers);
      expect(probed).toBeGreaterThan(0);
      expect(captures.length).toBe(expectCaptures);
    },
  );

  it.each(
    SHADOW_CONTROLS.flatMap((c) =>
      (['arrow', 'class'] as WrapVariant[]).map(
        (v) => [c.name, v, c.expectCaptures] as const,
      ),
    ),
  )(
    'control %s under the %s wrapper: flat has no enclosure, wrapped yields %s capture(s)',
    (name, variant, expectCaptures) => {
      const o = nestedControlOutcome(name, variant);
      // Flat, the site is at module level and there is nothing to probe.
      expect(o.flat.enclosed).toBe(0);
      expect(o.flat.triggers.length).toBe(0);
      // Wrapped, the same fixture reaches an injection...
      expect(o.wrapped.enclosed).toBeGreaterThan(0);
      expect(o.probed).toBeGreaterThan(0);
      // ...and the detector still tells the two polarities apart there, so the
      // reach the perturbation adds is reach that can still report a defect.
      expect(o.captures.length).toBe(expectCaptures);
    },
  );

  /**
   * The corpus must carry the configuration each case was written for; a
   * bare-snippet corpus cannot reach an option-gated or path-gated fixer.
   */
  it('carries options and filenames from the fixtures themselves', () => {
    const cases = [...corpus.byRule.values()].flat();
    expect(cases.filter((c) => c.options).length).toBeGreaterThanOrEqual(250);
    expect(cases.filter((c) => c.filename).length).toBeGreaterThanOrEqual(1000);
    expect(
      (corpus.byRule.get('no-usememo-for-pass-by-value') || []).length,
    ).toBeGreaterThanOrEqual(60);
  });
});
