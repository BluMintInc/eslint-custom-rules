import { Linter } from 'eslint';
import { parse as estreeParse } from '@typescript-eslint/typescript-estree';
import {
  FixtureCase,
  defaultFilenameFor,
  harvestFixtureCorpus,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';

/**
 * A developer's choice of function spelling must not decide whether a rule
 * remediates a violation, nor whether it sees one at all.
 *
 * Every fixture is rewritten between equivalent spellings — declaration to
 * arrow and back, function expression to arrow, and concise arrow body to block
 * and back — and two things are diffed.
 *
 * **Fix availability.** A messageId reported in BOTH spellings where one side is
 * cleanly fixable and the other cleanly unfixable. Requiring the report on both
 * sides is what makes a finding unarguable: the rule already agrees the code is
 * a violation either way, and only remediates one way of writing it. A case
 * mixing fixable and unfixable messages under one messageId is a conditional
 * decline, which the two spellings may legitimately hit different numbers of.
 *
 * **Detection**, across all five transforms. The concise/block pair holds the
 * node type fixed, so an asymmetry there means the rule reads `BlockStatement`
 * bodies exclusively; the declaration/arrow pairs change the node type, which
 * is exactly what a rule keyed on one function syntax fails to follow. Folding
 * them in does not bury the signal — that theory is measured false: the body
 * pair alone makes 5,043 comparisons and surfaces three diverging rules, while
 * all five make 12,466 and surface nine, six of them verified defects or filed
 * decisions out of 157 rules driven. Six divergences in 157 is a reviewable
 * baseline, and each is recorded in `DETECTION_EXEMPT` against its issue.
 *
 * A rule that reports on only one spelling is broken whichever way it leans: it
 * either withholds a remedy the other spelling gets, or blesses code it flags
 * one rewrite away.
 *
 * **Detection multiplicity**, which the presence census above cannot express.
 * Asking `has()` on both sides answers only whether the messageId survived, so
 * a rule seeing three violations in one spelling and one in the other reads as
 * agreeing with itself. That is the blindness #2010 found in
 * `asconst-composition-closure`, where it hid the real defect #2007 for a
 * release; here it covers the 6,000-odd comparisons where the id is present on
 * both sides, and the transforms are partial by construction (`outermostOnly`
 * drops nested sites, each builder declines what it cannot respell), so N→N-k
 * is the ordinary shape rather than an exotic one. Counted LOSS-ONLY: a
 * respelling yielding MORE reports is the introduction direction other guards
 * own, and counting both ways would fail on every legitimate node-count change
 * — `blockArrow->concise` deletes a `ReturnStatement`, so a return-keyed rule
 * SHOULD drop one. Measured zero corpus-wide, which is why it gates without an
 * exempt map; `control-detection-count-partial` is what keeps that zero
 * distinguishable from an arm that never fires.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ts = require('typescript');

const PREFIX = '@blumintinc/blumint/';

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

const configFor = (rule: string, testCase: FixtureCase): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: parserOptionsFor(testCase),
    rules: { [PREFIX + rule]: severityWithOptions(testCase) },
  } as Linter.Config);

// ---------------------------------------------------------------------------
// Spelling transforms
// ---------------------------------------------------------------------------

const parseOrNull = (code: string, jsx: boolean) => {
  try {
    return estreeParse(code, { jsx, range: true, loc: true, comment: false });
  } catch {
    return null;
  }
};

/**
 * Whether a rewrite is actually legal, which parsing alone does not answer.
 *
 * TypeScript's parser is error-tolerant: it recovers from a syntax error and
 * returns a tree instead of throwing, so `parseOrNull` accepts corrupt output
 * and the rule then "disagrees" about code no developer could have written.
 * That fabricates findings — `=> ({ return x; })` survived a reparse and was
 * reported as a detection asymmetry. Reading the parse diagnostics is what
 * separates a legal rewrite from a recovered one.
 */
const isSyntacticallyValid = (code: string, jsx: boolean): boolean => {
  const file = ts.createSourceFile(
    jsx ? 'probe.tsx' : 'probe.ts',
    code,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return ((file as any).parseDiagnostics || []).length === 0;
};

/**
 * A body binding `this`, `arguments` or `super`, or one that yields, does not
 * survive the declaration/arrow rewrite with its meaning intact. Matching the
 * raw text is deliberately over-broad: a skipped fixture costs one probe, while
 * a rewrite that changes meaning manufactures a finding out of nothing.
 */
const NEUTRALITY_BLOCKERS = /\bthis\b|\barguments\b|\bsuper\b|\byield\b/;

const isNeutral = (text: string) => !NEUTRALITY_BLOCKERS.test(text);

type Edit = { start: number; end: number; text: string };

const applyEdits = (source: string, edits: Edit[]) =>
  [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end),
      source,
    );

const walk = (
  node: any,
  visit: (n: any, parent: any) => void,
  parent?: any,
) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') walk(item, visit, node);
      }
    } else if (child && typeof child.type === 'string') {
      walk(child, visit, node);
    }
  }
};

/**
 * `function NAME<T>(p): R { ... }` to `const NAME = <T>(p): R => { ... }`.
 *
 * The text between the name (or type parameters) and the body is reused
 * verbatim, because `(p): R` is already exactly an arrow's parameter list and
 * return annotation. Rebuilding it from the AST would drop defaults, modifiers
 * and comments.
 */
const declarationToArrow = (source: string, ast: any): Edit[] => {
  const edits: Edit[] = [];
  walk(ast, (node, parent) => {
    if (node.type !== 'FunctionDeclaration') return;
    if (node.generator || !node.id || !node.body) return;
    // `export default function` has no single-edit const equivalent.
    if (parent && parent.type === 'ExportDefaultDeclaration') return;
    if (!isNeutral(source.slice(node.range[0], node.range[1]))) return;
    const afterName = node.typeParameters
      ? node.typeParameters.range[1]
      : node.id.range[1];
    const typeParams = node.typeParameters
      ? source.slice(node.typeParameters.range[0], node.typeParameters.range[1])
      : '';
    const signature = source.slice(afterName, node.body.range[0]).trim();
    const body = source.slice(node.body.range[0], node.body.range[1]);
    edits.push({
      start: node.range[0],
      end: node.range[1],
      text: `const ${node.id.name} = ${
        node.async ? 'async ' : ''
      }${typeParams}${signature} => ${body};`,
    });
  });
  return edits;
};

/**
 * `const NAME = <T>(p): R => { ... }` to `function NAME<T>(p): R { ... }`.
 *
 * Block bodies only. A concise body would have to gain a `return`, which is a
 * second spelling change and is probed on its own below.
 */
const arrowToDeclaration = (source: string, ast: any): Edit[] => {
  const edits: Edit[] = [];
  walk(ast, (node) => {
    if (node.type !== 'VariableDeclaration' || node.kind !== 'const') return;
    if (node.declarations.length !== 1) return;
    const declarator = node.declarations[0];
    const init = declarator.init;
    if (!init || init.type !== 'ArrowFunctionExpression') return;
    if (init.body.type !== 'BlockStatement') return;
    if (declarator.id.type !== 'Identifier') return;
    // An annotated binding cannot move onto a function declaration.
    if (declarator.id.typeAnnotation) return;
    if (!isNeutral(source.slice(node.range[0], node.range[1]))) return;
    const typeParams = init.typeParameters
      ? source.slice(init.typeParameters.range[0], init.typeParameters.range[1])
      : '';
    const afterTypeParams = init.typeParameters
      ? init.typeParameters.range[1]
      : init.range[0] + (init.async ? 'async'.length : 0);
    const head = source.slice(afterTypeParams, init.body.range[0]);
    // The arrow is not always the last thing before the body: a comment can sit
    // between them, and reading the arrow off the end of the text emits `=>`
    // into a function declaration, which does not parse. The text following the
    // arrow is carried VERBATIM, since a line comment there needs the line
    // break that follows it to keep the body out of the comment.
    const arrowAt = head.lastIndexOf('=>');
    if (arrowAt === -1) return;
    const signature = head.slice(0, arrowAt).trim();
    const afterArrow = head.slice(arrowAt + 2);
    const separator = /\/\*|\/\//.test(afterArrow) ? afterArrow : ' ';
    if (!signature.startsWith('(')) return;
    const body = source.slice(init.body.range[0], init.body.range[1]);
    edits.push({
      start: node.range[0],
      end: node.range[1],
      text: `${init.async ? 'async ' : ''}function ${
        declarator.id.name
      }${typeParams}${signature}${separator}${body}`,
    });
  });
  return edits;
};

/**
 * Why a transform leaves a site alone, so that a site it passes over is a NAMED
 * refusal rather than a rewrite that quietly failed to parse.
 *
 * The distinction is the whole point of the map: 1,202 of the 1,455 sites
 * `funcExpression->arrow` used to rewrite were class method shorthand, whose
 * emitted text (`foo() => {}`) is not a program, so the entire fixture was
 * dropped at the reparse — 89% of all attempts, invisibly (#1870).
 *
 * The map spans transforms rather than one, because a refusal counted by
 * nothing is the same defect wherever it lives: `blockArrow->concise` held a
 * neutrality gate that rejected 46 sites through a bare `return`, so no
 * `expect` in this file could see that all 46 were false (#2223, the class of
 * #2222).
 */
const TRANSFORM_DECLINES = {
  generator: 'an arrow has no generator form',
  namedFunctionExpression:
    'the name is in scope inside the body, which an arrow cannot express',
  classMemberShorthand:
    'a class method has no arrow-valued shorthand; `foo = () => {}` is a class PROPERTY, a different declaration with different initialization order',
  accessorShorthand: 'a getter or setter cannot hold an arrow',
  bindsThisOrSuper: 'the body binds `this`, `arguments`, `super` or yields',
  noParameterList:
    'no parameter list was found where the signature must begin, so the emitted arrow would be a guess',
  unrecognizedSpelling:
    'the node does not begin with the `function` keyword and is not a shorthand this transform knows, so its extent is unknown',
  blockBodyHoldsComment:
    'the arrow body holds text the return statement does not account for — a comment, whose deletion would change which rules fire (#1859)',
} as const;
type TransformDecline = keyof typeof TRANSFORM_DECLINES;

/** A `function` expression's own text always opens with the keyword. */
const FUNCTION_KEYWORD = /^(?:async\s+)?function\b/;

/**
 * `function (p) { ... }` to `(p) => { ... }`, and `k(p) { ... }` to
 * `k: (p) => { ... }` for an object method.
 *
 * A method shorthand's `FunctionExpression` node starts at the PARAMETER LIST,
 * not at a `function` keyword, so replacing the node's own range emits
 * `foo() => {}`. The member is therefore what gets rewritten, and only for an
 * object property: a class method's arrow-valued spelling is a class property,
 * which is a different declaration, so it is declined by name instead.
 *
 * Every site not rewritten is counted under `TRANSFORM_DECLINES`,
 * because the failure this replaces was silent by construction — a broken
 * rewrite is indistinguishable from a fixture with nothing to rewrite once the
 * reparse has thrown it away.
 */
const functionExpressionToArrow = (
  source: string,
  ast: any,
  decline: (reason: TransformDecline) => void,
): Edit[] => {
  const candidates: Edit[] = [];
  walk(ast, (node, parent) => {
    if (node.type !== 'FunctionExpression' || !node.body) return;
    if (node.generator) return decline('generator');
    if (node.id) return decline('namedFunctionExpression');

    const member = parent && parent.value === node ? parent : null;
    if (
      member &&
      (member.type === 'MethodDefinition' ||
        member.type === 'TSAbstractMethodDefinition')
    ) {
      return decline('classMemberShorthand');
    }
    if (member && member.type === 'Property' && member.kind !== 'init') {
      return decline('accessorShorthand');
    }
    // `{ k: function () {} }` is a plain value, not shorthand, and its node
    // does carry the keyword — only `method: true` starts at the parameters.
    const objectMethod =
      !!member && member.type === 'Property' && member.method === true;

    const start = objectMethod ? member.range[0] : node.range[0];
    const end = objectMethod ? member.range[1] : node.range[1];
    // Over the MEMBER, so a computed key touching `this` is caught too.
    if (!isNeutral(source.slice(start, end))) {
      return decline('bindsThisOrSuper');
    }
    // Any other shorthand-like parent would hand back a range whose extent
    // this transform has not been taught, which is how the defect above went
    // unseen. Naming it keeps a new one loud instead of unparsable.
    if (!objectMethod && !FUNCTION_KEYWORD.test(source.slice(start, end))) {
      return decline('unrecognizedSpelling');
    }

    const typeParams = node.typeParameters
      ? source.slice(node.typeParameters.range[0], node.typeParameters.range[1])
      : '';
    const afterKeyword = node.typeParameters
      ? node.typeParameters.range[1]
      : source.indexOf('(', node.range[0]);
    if (afterKeyword < 0) return decline('noParameterList');
    const signature = source.slice(afterKeyword, node.body.range[0]).trim();
    if (!signature.startsWith('(')) return decline('noParameterList');
    const body = source.slice(node.body.range[0], node.body.range[1]);
    const arrow = `${
      node.async ? 'async ' : ''
    }${typeParams}${signature} => ${body}`;
    const key = objectMethod
      ? source.slice(member.key.range[0], member.key.range[1])
      : '';
    candidates.push({
      start,
      end,
      text: objectMethod
        ? `${member.computed ? `[${key}]` : key}: ${arrow}`
        : arrow,
    });
  });
  return candidates;
};

/** `(p) => expr` to `(p) => { return expr; }`. */
const conciseArrowToBlock = (source: string, ast: any): Edit[] => {
  const edits: Edit[] = [];
  walk(ast, (node) => {
    if (node.type !== 'ArrowFunctionExpression') return;
    if (node.body.type === 'BlockStatement') return;
    // Rewritten from after the arrow token rather than from the body node,
    // because an expression's own range stops INSIDE any parentheses wrapping
    // it — an ObjectExpression body most of all, where re-emitting the bare
    // slice would put a block where the return value belongs. The nearest `=>`
    // before the body is necessarily this arrow's, since a nested arrow in a
    // parameter default sits entirely to its left.
    const arrowToken = source.lastIndexOf('=>', node.body.range[0]);
    if (arrowToken < 0) return;
    const start = arrowToken + '=>'.length;
    const bodyText = source.slice(start, node.range[1]).trim();
    if (!bodyText) return;
    edits.push({
      start,
      end: node.range[1],
      text: ` { return ${bodyText}; }`,
    });
  });
  return edits;
};

/**
 * `(p) => { return expr; }` to `(p) => expr`.
 *
 * Declines when the block holds anything besides the return statement, which in
 * practice means a COMMENT. A comment is not decoration to a linter: the block
 * bodies in the corpus carry `eslint-disable-next-line react-hooks/exhaustive-deps`
 * and other directives, and a rewrite that drops one changes which rules fire.
 * Every finding it manufactured was of that shape — a rule that declines to fix
 * rather than delete a comment (`no-useless-usememo-primitives`), or one whose
 * exemption carrier is the comment itself (`no-entire-object-hook-deps`) —
 * so the perturbation, not the rule, was the asymmetry (#1859).
 *
 * **This transform alone carries no `isNeutral` gate, and must not regain one
 * by symmetry with its four neighbours.** The other transforms convert BETWEEN
 * function forms, where `this`/`arguments`/`super` genuinely rebind. This one
 * is arrow to arrow: the edit replaces `node.body` with a verbatim slice of
 * that body's own `ReturnStatement` argument, entirely inside the same arrow,
 * and an arrow resolves `this` from its enclosing NON-arrow function — which
 * the edit never touches. Measured over the corpus, the gate rejected 46 sites,
 * every one of them `this` and never `arguments`/`super`/`yield`, and all 46
 * were provably safe: the edit range lay strictly inside the same arrow, the
 * replacement was a verbatim slice, and each round-tripped cleanly back through
 * the inverse `conciseArrow->block`. It cost 42 variants, 26 of them on
 * `prefer-getter-over-parameterless-method` — a rule about class methods, which
 * is exactly where `this` appears, so the gate blinded the guard hardest on the
 * rules it most needed to drive (#2223).
 */
const blockArrowToConcise = (
  source: string,
  ast: any,
  decline: (reason: TransformDecline) => void,
): Edit[] => {
  const edits: Edit[] = [];
  walk(ast, (node) => {
    if (node.type !== 'ArrowFunctionExpression') return;
    if (node.body.type !== 'BlockStatement') return;
    const statements = node.body.body;
    if (statements.length !== 1) return;
    const only = statements[0];
    if (only.type !== 'ReturnStatement' || !only.argument) return;
    const inner = source
      .slice(node.body.range[0] + 1, node.body.range[1] - 1)
      .trim();
    // The block carries text the return statement does not account for, which
    // is a comment. Named rather than dropped: this is the ONE refusal keeping
    // #1859's fabricated findings from coming back, so if it ever stops firing
    // that must be a failure and not a silent slide back to the old behaviour.
    if (inner !== source.slice(only.range[0], only.range[1]).trim()) {
      return decline('blockBodyHoldsComment');
    }
    const argument = source.slice(
      only.argument.range[0],
      only.argument.range[1],
    );
    edits.push({
      start: node.body.range[0],
      end: node.body.range[1],
      /**
       * A concise body whose text OPENS with `{` re-parses as a block rather
       * than a value, so it is parenthesized. Keyed on the text rather than on
       * `ObjectExpression`, which is the node type of `{ a: 1 }` but not of
       * `{ a: 1 } as const` — that is a `TSAsExpression`, and it slipped
       * through unparenthesized as `() => { a: 1 } as const` (#1870).
       *
       * A sequence needs the same treatment for the opposite reason: its own
       * range stops INSIDE the parentheses it requires, so `=> a, b` binds the
       * comma outside the arrow.
       */
      text:
        argument.startsWith('{') || only.argument.type === 'SequenceExpression'
          ? `(${argument})`
          : argument,
    });
  });
  return edits;
};

/**
 * Every transform takes the decline sink, so a new one that refuses a site is
 * counted the same way rather than reinstating the silent drop this replaced.
 */
type Build = (
  source: string,
  ast: any,
  decline: (reason: TransformDecline) => void,
) => Edit[];

const TRANSFORMS: readonly { name: string; build: Build }[] = [
  { name: 'declaration->arrow', build: declarationToArrow },
  { name: 'arrow->declaration', build: arrowToDeclaration },
  { name: 'funcExpression->arrow', build: functionExpressionToArrow },
  { name: 'conciseArrow->block', build: conciseArrowToBlock },
  { name: 'blockArrow->concise', build: blockArrowToConcise },
];

type Variant = { transform: string; code: string };

/**
 * What became of one transform's attempt on one fixture.
 *
 * `unparsable` and `recovered` are HARNESS defects, not properties of the
 * corpus: they mean this file emitted text no developer could have written. A
 * transform is only driving the spelling it declares to the extent it yields.
 */
type Outcome = 'yielded' | 'unchanged' | 'unparsable' | 'recovered';

type TransformStats = {
  /** Fixtures where the transform produced at least one edit. */
  attempted: number;
  /** Individual sites rewritten across those fixtures. */
  sites: number;
  /** Sites dropped as nested inside another, which is not a discard. */
  nested: number;
  outcomes: Record<Outcome, number>;
  /** Rules the transform produced a usable variant for. */
  rules: Set<string>;
};

type Observer = {
  attempt: (
    transform: string,
    outcome: Outcome,
    sites: number,
    nested: number,
  ) => void;
  decline: (reason: TransformDecline) => void;
  /** The text a discarded attempt emitted, so the residue can be READ. */
  discarded: (transform: string, original: string, rewritten: string) => void;
};

/**
 * The outermost edits only, one per nest, in source order.
 *
 * Every transform derives its ranges from AST nodes, so two of its edits are
 * either disjoint or one CONTAINS the other — and `applyEdits` splices by
 * range, which means a contained edit does not conflict with its container, it
 * corrupts it: the inner rewrite lands inside text the outer one has already
 * replaced, and the result is neither spelling. The corruption is silent,
 * because the mangled output simply fails to reparse and the whole fixture is
 * dropped.
 *
 * Applied centrally rather than in one transform, since the shape is not
 * peculiar to function expressions: the jest
 * `describe(..., function () { it(..., function () {}) })` nest hits
 * `funcExpression->arrow`, a JSX component whose concise body contains a
 * concise callback hits `conciseArrow->block`, and a nested function
 * declaration hits `declaration->arrow` (#1870). Sorting by start and then by
 * DESCENDING end puts every container before what it contains, so the greedy
 * sweep keeps the outermost and drops the rest.
 */
const outermostOnly = (edits: Edit[]): { kept: Edit[]; nested: number } => {
  const sorted = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Edit[] = [];
  let boundary = -1;
  for (const edit of sorted) {
    if (edit.start < boundary) continue;
    kept.push(edit);
    boundary = edit.end;
  }
  return { kept, nested: edits.length - kept.length };
};

const variantsOf = (
  code: string,
  jsx: boolean,
  observe?: Observer,
): Variant[] => {
  const ast = parseOrNull(code, jsx);
  if (!ast) return [];
  // A fixture that is already broken cannot tell us anything about a rewrite
  // of it, and would make every one of its variants read as a finding.
  if (!isSyntacticallyValid(code, jsx)) return [];
  const decline = observe ? observe.decline : () => undefined;
  const variants: Variant[] = [];
  for (const transform of TRANSFORMS) {
    let built: Edit[] = [];
    try {
      built = transform.build(code, ast, decline);
    } catch {
      continue;
    }
    if (!built.length) continue;
    const { kept: edits, nested } = outermostOnly(built);
    const rewritten = applyEdits(code, edits);
    const record = (outcome: Outcome) => {
      observe?.attempt(transform.name, outcome, edits.length, nested);
      if (outcome === 'unparsable' || outcome === 'recovered') {
        observe?.discarded(transform.name, code, rewritten);
      }
    };
    if (rewritten === code) {
      record('unchanged');
      continue;
    }
    // A rewrite that is not legal code is a harness defect, never a finding.
    if (!parseOrNull(rewritten, jsx)) {
      record('unparsable');
      continue;
    }
    if (!isSyntacticallyValid(rewritten, jsx)) {
      record('recovered');
      continue;
    }
    record('yielded');
    variants.push({ transform: transform.name, code: rewritten });
  }
  return variants;
};

const emptyTransformStats = (): TransformStats => ({
  attempted: 0,
  sites: 0,
  nested: 0,
  outcomes: { yielded: 0, unchanged: 0, unparsable: 0, recovered: 0 },
  rules: new Set<string>(),
});

const transformStats = new Map<string, TransformStats>(
  TRANSFORMS.map((transform) => [transform.name, emptyTransformStats()]),
);

const declinedSites = new Map<TransformDecline, number>();

/**
 * Every discarded attempt, printed with the census.
 *
 * A rate on its own cannot be acted on — the whole failure this replaces was a
 * number nobody could see. Carrying the emitted text means the residue is
 * READABLE the moment the rate moves, rather than requiring the reader to
 * reinstrument the harness to find out what it dropped.
 */
type Discard = { transform: string; original: string; rewritten: string };
const discards: Discard[] = [];

/** Scoped to one rule, so a yield can be attributed without a second pass. */
const observerFor = (rule: string): Observer => ({
  attempt: (transform, outcome, sites, nested) => {
    const stats = transformStats.get(transform)!;
    stats.attempted++;
    stats.sites += sites;
    stats.nested += nested;
    stats.outcomes[outcome]++;
    if (outcome === 'yielded') stats.rules.add(rule);
  },
  decline: (reason) =>
    declinedSites.set(reason, (declinedSites.get(reason) || 0) + 1),
  discarded: (transform, original, rewritten) =>
    discards.push({ transform, original: `${rule}\n${original}`, rewritten }),
});

// ---------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------

type FixState = { withFix: number; withoutFix: number };

/** Reports of one messageId, however the rule split them across fixability. */
const totalOf = (state: FixState | undefined) =>
  state ? state.withFix + state.withoutFix : 0;

const fixStatesOf = (
  rule: string,
  code: string,
  testCase: FixtureCase,
  filename: string,
): Map<string, FixState> | null => {
  const id = PREFIX + rule;
  let messages: Linter.LintMessage[];
  try {
    messages = linter.verify(code, configFor(rule, testCase), { filename });
  } catch {
    return null;
  }
  // A fatal parse reports nothing else, so it would read as rule silence.
  if (messages.some((m) => m.fatal)) return null;
  const states = new Map<string, FixState>();
  for (const message of messages) {
    if (message.ruleId !== id) continue;
    const key = message.messageId || message.message;
    const state = states.get(key) || { withFix: 0, withoutFix: 0 };
    if (message.fix) state.withFix++;
    else state.withoutFix++;
    states.set(key, state);
  }
  return states;
};

type Finding = {
  rule: string;
  messageId: string;
  transform: string;
  detail: string;
  origin: string;
  filename: string;
  options?: readonly unknown[];
  original: string;
  variant: string;
};

type ProbeResult = {
  fixFindings: Finding[];
  detectionFindings: Finding[];
  /**
   * Detections the presence census cannot express: the messageId survives the
   * respelling but FEWER of them do. A rule that sees three violations in one
   * spelling and one in the other is as blind as one that goes silent, yet
   * `has()` reads identically on both sides (#2010's shape, which hid #2007).
   */
  detectionCountFindings: Finding[];
  /** messageIds present on BOTH sides — the only comparisons that can assert. */
  sharedMessageIds: number;
  /** Respelled pairs the detection census diffed — its own floor. */
  detectionComparisons: number;
  /** Detection comparisons per transform, so a floor can hold each spelling. */
  detectionComparisonsByTransform: Record<string, number>;
  /** Shared-messageId pairs where at least one side carried a fix. */
  fixableComparisons: number;
  /** Detection comparisons where at least one side reported at all. */
  reportingDetectionComparisons: number;
  /**
   * Why a case contributed nothing, carried so a rule whose row can never fail
   * names the reason rather than leaving it to inference. A variant that was
   * never built and one the rule was silent on are different failures.
   */
  variants: number;
  comparedVariants: number;
  /** The baseline lint succeeded; false means a fatal parse or a crash. */
  lintable: boolean;
  reported: boolean;
  /** The rule offered a fix on the untouched fixture. */
  offeredFix: boolean;
};

const EMPTY: ProbeResult = {
  fixFindings: [],
  detectionFindings: [],
  detectionCountFindings: [],
  sharedMessageIds: 0,
  detectionComparisons: 0,
  detectionComparisonsByTransform: {},
  fixableComparisons: 0,
  reportingDetectionComparisons: 0,
  variants: 0,
  comparedVariants: 0,
  lintable: false,
  reported: false,
  offeredFix: false,
};

/**
 * Both censuses off one lint of each variant. Kept in one pass deliberately:
 * running them separately linted every variant twice for no extra coverage.
 */
const probeCase = (
  rule: string,
  testCase: FixtureCase,
  /**
   * Omitted by the planted controls, whose four snippets would otherwise land
   * in the corpus-wide transform census and move the floors it asserts.
   */
  observe?: Observer,
): ProbeResult => {
  const filename = defaultFilenameFor(testCase);
  const jsx = filename.endsWith('.tsx');
  const before = fixStatesOf(rule, testCase.code, testCase, filename);
  if (!before) return EMPTY;

  const result: ProbeResult = {
    fixFindings: [],
    detectionFindings: [],
    detectionCountFindings: [],
    sharedMessageIds: 0,
    detectionComparisons: 0,
    detectionComparisonsByTransform: {},
    fixableComparisons: 0,
    reportingDetectionComparisons: 0,
    variants: 0,
    comparedVariants: 0,
    lintable: true,
    reported: before.size > 0,
    offeredFix: [...before.values()].some((state) => state.withFix > 0),
  };

  for (const variant of variantsOf(testCase.code, jsx, observe)) {
    result.variants++;
    const after = fixStatesOf(rule, variant.code, testCase, filename);
    if (!after) continue;
    result.comparedVariants++;

    const context = {
      rule,
      transform: variant.transform,
      origin: testCase.origin,
      filename,
      options: testCase.options,
      original: testCase.code,
      variant: variant.code,
    };

    result.detectionComparisons++;
    result.detectionComparisonsByTransform[variant.transform] =
      (result.detectionComparisonsByTransform[variant.transform] || 0) + 1;
    // A pair silent on BOTH sides cannot produce a one-sided report, so it is
    // not a comparison that could ever have failed.
    if (before.size || after.size) result.reportingDetectionComparisons++;
    for (const messageId of new Set([...before.keys(), ...after.keys()])) {
      const inOriginal = before.has(messageId);
      if (inOriginal === after.has(messageId)) {
        // Present on both sides: the presence census is finished here, but a
        // FALL in multiplicity is the same blindness spelled quantitatively.
        // Loss-only and asymmetric — a respelling that yields MORE reports is
        // the introduction direction, which other guards own.
        const originalCount = totalOf(before.get(messageId));
        const variantCount = totalOf(after.get(messageId));
        if (inOriginal && variantCount < originalCount) {
          result.detectionCountFindings.push({
            ...context,
            messageId,
            detail: `reported ${originalCount}x on the original spelling and ${variantCount}x on the rewritten one`,
          });
        }
        continue;
      }
      result.detectionFindings.push({
        ...context,
        messageId,
        detail: `reported on the ${
          inOriginal ? 'original' : 'rewritten'
        } spelling only`,
      });
    }

    // The fix census needs the report on both sides, so it iterates the
    // original's messageIds and skips any the variant does not share.
    for (const [messageId, originalState] of before) {
      const variantState = after.get(messageId);
      if (!variantState) continue;
      result.sharedMessageIds++;
      // A finding is a polarity FLIP, so a pair where neither side carries a
      // fix cannot produce one however the two sides differ.
      if (originalState.withFix > 0 || variantState.withFix > 0) {
        result.fixableComparisons++;
      }

      const cleanlyFixable = (state: FixState) =>
        state.withFix > 0 && state.withoutFix === 0;
      const cleanlyUnfixable = (state: FixState) =>
        state.withFix === 0 && state.withoutFix > 0;

      // Only the unambiguous polarity flip: a case reporting a mix under one
      // messageId is a conditional decline, and the spellings may legitimately
      // hit different numbers of each.
      const fixableSide = cleanlyFixable(originalState)
        ? cleanlyUnfixable(variantState)
          ? 'original'
          : null
        : cleanlyUnfixable(originalState) && cleanlyFixable(variantState)
        ? 'rewritten'
        : null;
      if (!fixableSide) continue;

      result.fixFindings.push({
        ...context,
        messageId,
        detail: `fixable on the ${fixableSide} spelling only`,
      });
    }
  }
  return result;
};

const corpus = harvestFixtureCorpus();

/**
 * Only rules that measurably report NOTHING under this harness are excluded —
 * currently none. The wider "mentions the type checker" set was excluded before
 * on the theory that a bare `Linter` builds no program; it builds an isolated
 * single-file one, and all 16 of those rules report over their own fixtures, so
 * the exclusion suppressed live coverage rather than a false clean (#1859).
 */
const probeRules = Object.keys(plugin.rules)
  .filter((name) => !silentWithoutProgramRuleNames.has(name))
  .sort();

/**
 * Fixtures this guard's probe cannot be applied to, named per (guard, rule)
 * with the reason.
 *
 * The probe respells a fixture's TypeScript expressions — member access as a
 * computed key, an arrow body as a block — and asks whether the fix survives
 * the respelling. That needs TypeScript syntax to respell.
 * A `package.json` body and a Markdown document have neither, so a case in
 * either language cannot pose the question. Skipping by LANGUAGE rather than by
 * parse failure is what keeps the skip honest: a Markdown fence is an empty
 * template literal, so several of those fixtures do parse as TypeScript and
 * would otherwise answer a TypeScript question by accident (#1860).
 *
 * A rule-global exclusion would be the wrong instrument — it would un-gate every
 * other arm these rules participate in (#1839) — so the entry is scoped to this
 * guard and asserted in both directions below.
 */
const NON_TYPESCRIPT_FIXTURES: Record<string, string> = {
  'enforce-typescript-markdown-code-blocks':
    'declares only Markdown documents, under ruleTesterMarkdown',
  'no-unpinned-dependencies':
    'declares only package.json bodies, under ruleTesterJson',
  'prefer-nullish-coalescing-boolean-props':
    'declares one package.json body under ruleTesterJson alongside its TypeScript fixtures',
};

const fixFindings: Finding[] = [];
const detectionFindings: Finding[] = [];
const detectionCountFindings: Finding[] = [];
let casesConsidered = 0;
let nonTypeScriptSkipped = 0;
const rulesWithNonTypeScriptFixtures = new Set<string>();
let sharedMessageIds = 0;
let detectionComparisons = 0;
const detectionComparisonsByTransform = new Map<string, number>(
  TRANSFORMS.map((transform) => [transform.name, 0]),
);
const rulesCompared = new Set<string>();

/**
 * Per-rule bookkeeping, so each rule's row can assert the probe reached it.
 *
 * `sharedMessageIds` is the only counter a FIX finding can come out of and
 * `detectionComparisons` the only one a DETECTION finding can; the rest exist
 * to say WHY a rule was never reached, which is what turns a dark row into a
 * reviewable exemption instead of a green one.
 */
type Drive = {
  tsCases: number;
  lintableCases: number;
  reportingCases: number;
  fixOfferingCases: number;
  variants: number;
  comparedVariants: number;
  sharedMessageIds: number;
  detectionComparisons: number;
  fixableComparisons: number;
  reportingDetectionComparisons: number;
};
const emptyDrive = (): Drive => ({
  tsCases: 0,
  lintableCases: 0,
  reportingCases: 0,
  fixOfferingCases: 0,
  variants: 0,
  comparedVariants: 0,
  sharedMessageIds: 0,
  detectionComparisons: 0,
  fixableComparisons: 0,
  reportingDetectionComparisons: 0,
});
const driveByRule = new Map<string, Drive>(
  probeRules.map((rule) => [rule, emptyDrive()]),
);

for (const rule of probeRules) {
  const drive = driveByRule.get(rule)!;
  for (const testCase of corpus.byRule.get(rule) || []) {
    if (testCase.language !== 'ts') {
      nonTypeScriptSkipped++;
      rulesWithNonTypeScriptFixtures.add(rule);
      continue;
    }
    const result = probeCase(rule, testCase, observerFor(rule));
    casesConsidered++;
    drive.tsCases++;
    if (result.lintable) drive.lintableCases++;
    if (result.reported) drive.reportingCases++;
    if (result.offeredFix) drive.fixOfferingCases++;
    drive.variants += result.variants;
    drive.comparedVariants += result.comparedVariants;
    drive.sharedMessageIds += result.sharedMessageIds;
    drive.detectionComparisons += result.detectionComparisons;
    drive.fixableComparisons += result.fixableComparisons;
    drive.reportingDetectionComparisons += result.reportingDetectionComparisons;
    sharedMessageIds += result.sharedMessageIds;
    detectionComparisons += result.detectionComparisons;
    for (const [transform, count] of Object.entries(
      result.detectionComparisonsByTransform,
    )) {
      detectionComparisonsByTransform.set(
        transform,
        (detectionComparisonsByTransform.get(transform) || 0) + count,
      );
    }
    if (result.sharedMessageIds > 0) rulesCompared.add(rule);
    fixFindings.push(...result.fixFindings);
    detectionFindings.push(...result.detectionFindings);
    detectionCountFindings.push(...result.detectionCountFindings);
  }
}

const detectionRules = [
  ...new Set(detectionFindings.map((f) => f.rule)),
].sort();

/**
 * Why a rule's per-rule row could never fail, read off the counters above.
 *
 * A row that renders green having compared nothing is worse than a missing row:
 * it names the rule in the jest output, so the next reader takes it as evidence
 * the rule WAS checked. Each rule therefore either asserts it drove at least one
 * comparison, or it is a NAMED SKIP carrying the measured reason — the same
 * non-vacuity check the controls at the bottom of this file already carry
 * (`sharedMessageIds + detectionComparisons > 0`), applied to the ~190 rows it
 * was never applied to (#1861).
 *
 * The causes are ordered from the outermost precondition inwards, so the one
 * named is the FIRST that failed: a rule with no TypeScript fixture is not also
 * "silent", it was never linted.
 */
const UNDRIVEN_CAUSES = {
  noFixer:
    'declares no meta.fixable, so it can never offer the fix whose availability this census diffs',
  noTsFixture:
    'declares no TypeScript fixture, and a function spelling is a TypeScript question',
  unlintable: 'every fixture fails to lint, so no baseline exists to compare',
  noRespelling:
    'no fixture contains a function this probe can respell (declaration, unnamed function expression or arrow)',
  variantUnlintable:
    'every respelling of every fixture fails to lint, so no pair was ever compared',
  silent: 'reports on none of its own fixtures under this harness',
  noSharedMessageId:
    'no messageId it reports survives into a respelling, so no pair states both sides of a fix question',
  noFixEverOffered:
    'declares meta.fixable yet offers no fix on any of its own fixtures here, so the fix channel is untested by its corpus',
  noFixInComparedPair:
    'offers a fix somewhere in its corpus, but never on a fixture whose respelling shares a messageId',
  silentOnComparedPairs:
    'reports on neither side of any respelled pair its fixtures yield',
} as const;
type UndrivenCause = keyof typeof UNDRIVEN_CAUSES;

/** A rule with no fixer cannot offer one, so the whole fix census skips it. */
const fixableRuleNames = new Set(
  probeRules.filter((rule) => plugin.rules[rule]?.meta?.fixable),
);

const fixCauseOf = (rule: string): UndrivenCause | null => {
  const drive = driveByRule.get(rule)!;
  if (!fixableRuleNames.has(rule)) return 'noFixer';
  if (drive.tsCases === 0) return 'noTsFixture';
  if (drive.lintableCases === 0) return 'unlintable';
  if (drive.variants === 0) return 'noRespelling';
  if (drive.comparedVariants === 0) return 'variantUnlintable';
  if (drive.reportingCases === 0) return 'silent';
  if (drive.sharedMessageIds === 0) return 'noSharedMessageId';
  if (drive.fixableComparisons > 0) return null;
  return drive.fixOfferingCases === 0
    ? 'noFixEverOffered'
    : 'noFixInComparedPair';
};

const detectionCauseOf = (rule: string): UndrivenCause | null => {
  const drive = driveByRule.get(rule)!;
  if (drive.tsCases === 0) return 'noTsFixture';
  if (drive.lintableCases === 0) return 'unlintable';
  if (drive.variants === 0) return 'noRespelling';
  if (drive.detectionComparisons === 0) return 'variantUnlintable';
  if (drive.reportingDetectionComparisons === 0) return 'silentOnComparedPairs';
  return null;
};

const measuredUndriven = (
  causeOf: (rule: string) => UndrivenCause | null,
  skip?: UndrivenCause,
): Record<string, UndrivenCause> =>
  Object.fromEntries(
    probeRules
      .map((rule) => [rule, causeOf(rule)] as const)
      .filter(
        (entry): entry is readonly [string, UndrivenCause] =>
          !!entry[1] && entry[1] !== skip,
      ),
  );

/**
 * Rules the FIX census cannot drive, each with the measured cause.
 *
 * `noFixer` is derived from `meta.fixable` rather than listed, because a rule
 * that gains a fixer must enter the census automatically; every other cause is
 * a fact about the CORPUS, which no metadata announces, so it is named here and
 * asserted to still hold. Both directions and the cause itself are checked
 * below, so an entry cannot outlive what it describes.
 */
const FIX_UNDRIVEN: Record<string, UndrivenCause> = {
  'enforce-date-ttime': 'noSharedMessageId',
  'enforce-typescript-markdown-code-blocks': 'noTsFixture',
  'jsdoc-above-field': 'noRespelling',
  'no-unnecessary-destructuring': 'noSharedMessageId',
  'no-unpinned-dependencies': 'noTsFixture',
  'omit-index-html': 'noRespelling',
  'prefer-fragment-shorthand': 'noRespelling',
  'prefer-params-over-parent-id': 'noFixInComparedPair',
  'sync-onwrite-name-func': 'noRespelling',
  'use-custom-link': 'noRespelling',
};

/**
 * Rules the DETECTION census cannot drive, each with the measured cause.
 *
 * Every entry here is a fact about the rule's fixtures, not about the rule:
 * `noRespelling` means no fixture contains a function any transform can
 * respell, and `silentOnComparedPairs` means the fixtures that do yield a pair
 * are fixtures the rule says nothing about. Both are legitimate — but they are
 * recorded rather than rendered as a passing row, because a reader cannot tell
 * the two apart in jest output.
 */
const DETECTION_UNDRIVEN: Record<string, UndrivenCause> = {
  'array-methods-this-context': 'silentOnComparedPairs',
  'avoid-utils-directory': 'noRespelling',
  'enforce-date-ttime': 'silentOnComparedPairs',
  'enforce-dynamic-file-naming': 'noRespelling',
  'enforce-dynamic-imports': 'silentOnComparedPairs',
  'enforce-firestore-path-utils': 'noRespelling',
  'enforce-identifiable-firestore-type': 'noRespelling',
  'enforce-m3-sentence-case': 'noRespelling',
  'enforce-realtimedb-path-utils': 'noRespelling',
  'enforce-singular-type-names': 'noRespelling',
  'enforce-types-directory-placement': 'silentOnComparedPairs',
  'enforce-typescript-markdown-code-blocks': 'noTsFixture',
  'jsdoc-above-field': 'noRespelling',
  'no-conditional-literals-in-jsx': 'noRespelling',
  'no-harness-coupled-disables': 'noRespelling',
  'no-memoize-on-static': 'silentOnComparedPairs',
  'no-misused-switch-case': 'noRespelling',
  'no-overridable-method-calls-in-constructor': 'silentOnComparedPairs',
  'no-passthrough-getters': 'silentOnComparedPairs',
  'no-redundant-boolean-callback-props': 'noRespelling',
  'no-restricted-properties-fix': 'silentOnComparedPairs',
  'no-static-constants-in-dynamic-files': 'silentOnComparedPairs',
  'no-try-catch-already-exists-in-transaction': 'silentOnComparedPairs',
  'no-unnecessary-destructuring': 'silentOnComparedPairs',
  'no-unpinned-dependencies': 'noTsFixture',
  'omit-index-html': 'noRespelling',
  'prefer-fragment-shorthand': 'noRespelling',
  'prefer-use-theme': 'silentOnComparedPairs',
  'require-https-error-cause': 'silentOnComparedPairs',
  'sync-onwrite-name-func': 'noRespelling',
  'test-file-location-enforcement': 'noRespelling',
  'use-custom-link': 'noRespelling',
};

/**
 * Rules whose detection asymmetry is known and filed — a design decision or an
 * open defect issue — rather than an unnoticed defect. Each entry names the
 * issue that tracks it, so nothing can retire silently under a label written
 * for something else.
 *
 * Enforced in BOTH directions below. A rule that stops flagging must be removed
 * from here, and a new one must be added consciously — a one-way list would let
 * a fresh defect hide under an entry written for something else. Keyed on the
 * rule name rather than on a finding count, so adding fixtures to an exempt
 * rule does not churn the gate while a NEW rule name still trips it.
 */
const DETECTION_EXEMPT: Record<string, string> = {
  // Registers only a `ReturnStatement` visitor, so a concise body is
  // structurally invisible. Parity is a breadth decision, not a mechanical fix:
  // it adds ~703 consumer reports, almost all `jest.mock` factories, where the
  // `as const` remedy makes properties readonly and can break a test that
  // reassigns a mock.
  'enforce-object-literal-as-const': 'breadth decision, tracked as #1795',
  // Reports in BOTH spellings and swaps `preferMap` for `preferMapManual` when
  // the dispatch sits in a concise body, whose message names the reason: there
  // is no statement position to place the `Record` in, so the fix is withheld
  // and the developer is told to extract it. The census keys on messageId, so a
  // deliberate fixable/manual split reads as two one-sided detections.
  // Surfaced by the #1859 widening.
  'prefer-map-over-conditional-dispatch':
    'deliberate fixable/manual split on an expression body',
  // `ignoreVariadicFunctions` exempts a variadic FunctionDeclaration and not
  // the identical arrow — a human-labeled design call.
  'prefer-settings-object':
    'ignoreVariadicFunctions exempts declarations only, tracked as #1857',
  // The #2019 carve-out spares the IMPLEMENTATION of an overload set, and an
  // overload set has no arrow spelling: `function f(a: string): number;` above
  // `const f = (a) => ...` is not an implementation of that signature but a
  // duplicate binding beside an unimplemented one (TS2391 + TS2300). The
  // respelling therefore yields a different program rather than the same
  // function spelled another way, and on that program the annotation really is
  // the restatement the rule reports. Asymmetry by construction, not blindness.
  'no-explicit-return-type':
    'an overload implementation has no arrow spelling, #2019',
};

/**
 * Rules whose FIX asymmetry is a deliberate, documented decline rather than an
 * oversight — the fix census's counterpart to `DETECTION_EXEMPT`, and kept
 * apart from `FIX_KNOWN_DEFECTS` for the same reason that map is kept apart
 * from `DETECTION_EXEMPT`: merging them lets a bug retire under a label
 * written for a decision.
 *
 * An entry belongs here only when the rule's SOURCE states the reason it
 * withholds the fix from one spelling and that reason is a property of the
 * spelling, not of the rule's reach.
 */
const FIX_EXEMPT: Record<string, string> = {
  // Its remedy gives the dependency array a leading own-line comment, which
  // forces prettier to expand the whole argument list — so the fixer must write
  // the arguments' post-expansion indent, and it derives that from the indent of
  // the line the hook call's statement starts (#2065). A statement sharing its
  // line with text ahead of it offers no such indent, and recovering one would
  // mean re-printing the enclosing block: text the fixer does not own, which is
  // the deletion class #1877 guards against. So it declines outright.
  //
  // Only a block body collapsed onto one line — `=> { return useCallback(...); }`
  // — puts the statement there, and that is a shape prettier never prints:
  // measured, all three findings here are prettier-UNSTABLE at the repo's
  // settings, while the same body printed the way prettier prints it is fixed
  // exactly like the concise spelling. The split is prettier-stable input vs
  // not, not concise vs block, so it cannot reach agora, which lints
  // prettier-formatted source. Because this entry un-gates the rule's other
  // arms (#1839), the boundary itself is pinned in the rule's own suite —
  // 'the expansion declines exactly on a body prettier would reprint'.
  'enforce-stable-hash-spread-props':
    'the forced argument expansion needs a statement that starts its own line; a one-line block body denies it one',
  // Its remedy is a hoisted `const <hash> = useMemo(...)` declaration placed
  // immediately above the statement holding the hook call, so an
  // expression-bodied arrow has nowhere to put it — `findInsertionPoint`
  // returns null on reaching the function before any block, and says so. The
  // report stands and the developer converts the body first. Surfaced once the
  // nested-edit corruption stopped discarding this fixture's respelling
  // (#1870); it is the same shape `prefer-map-over-conditional-dispatch` is
  // exempted for above.
  'no-array-length-in-deps':
    'the memo declaration needs a statement position an expression body does not have',
  // Its planner strips the annotation in place, so it can only ship an edit
  // whose text settles where it is written. `keepsSurroundingLayout` withholds
  // the fix on the two arrow shapes where it would not: `displacesBody`, where
  // a carried comment run pushes a multi-line body off the `=>` onto a line of
  // its own, leaving the body's interior and closing bracket a step behind its
  // opening bracket; and `collapsesChainHead`, where the strip deletes the line
  // terminator holding a broken arrow chain's group open and so re-decides
  // where every OTHER link breaks. Both re-lay out text outside the
  // annotation's span — the deletion class #1877 guards against — so the report
  // stands and only the edit is withheld (#2120).
  //
  // Every discriminator is a property of the arrow spelling. A `function`
  // declaration has no `=>` to displace a body from and no chain to hold open,
  // so the guard returns early for it; a concise body occupies one line, so it
  // has no interior to leave behind. The two remaining findings respell the
  // arrow as a one-line `=> { return ...; }`, a shape prettier never prints and
  // therefore one agora — which lints prettier-formatted source — never holds.
  // Measured over the rule's corpus: 5 declines, all 5 on inputs whose previous
  // output prettier rewrote, and 0 cases where a fix that already settled was
  // lost. Because this entry un-gates the rule's other arms (#1839), the
  // boundary is pinned in the rule's own suite —
  // 'no-redundant-annotation-assertion --fix output survives Prettier'.
  'no-redundant-annotation-assertion':
    'the in-place strip cannot re-lay out an arrow body or chain it would displace; a declaration has neither',
  // Its strip carries a line-ending comment run onto the block body's first
  // line, which is where prettier settles such a run, so the brace keeps its
  // line and every column behind it is kept (#2129). Three shapes have no first
  // line to carry into and are declined instead: an arrow whose body is a
  // parenthesized object, and the two broken arrow chains whose inner head
  // holds the run — re-emitting those would mean laying out text the strip does
  // not own.
  //
  // In each of the three, the guard's rewritten spelling is a one-line
  // `=> { return ...; }` block — a shape prettier NEVER prints, so agora, which
  // lints prettier-formatted source, cannot hold it. That respelling is also
  // what dissolves the asymmetry: the block gives the object a first line to
  // carry into and flattens the chain. Measured against agora's prettier
  // (2.8.8): every prettier-STABLE spelling of these subjects is fixed, and its
  // output is a fixed point; only the unstable respellings differ. The
  // `arrow->declaration` and `blockArrow->concise` arms — the ones whose
  // rewritten spellings ARE prettier-stable — were a real defect in the
  // declaration path and were fixed rather than recorded here (#2129), which is
  // why they no longer appear.
  //
  // Because this entry un-gates the rule's other arms (#1839), the boundary is
  // pinned in the rule's own suite —
  // 'no-explicit-return-type --fix emits code Prettier leaves alone'.
  'no-explicit-return-type':
    'carries the comment run onto the block body it precedes; the three declined shapes have no first line to carry into, and each respells only into a one-line block prettier never prints',
  // The reorder pins non-function statements and swaps functions among their
  // slots, so a helper can be carried below a pinned module-scope caller
  // (`const CHAMPION = buildHit(...)`). A `function` declaration hoists and the
  // demoted module still loads, so the fix applies; a `const` arrow demoted the
  // same way throws `ReferenceError` at import, so
  // reorderDemotesDeclarationBelowEagerReference withholds it (#1983). The
  // asymmetry IS the hoisting difference between the two spellings.
  'vertically-group-related-functions':
    'a hoisted declaration may be demoted past its module-scope caller; a const binding may not',
};

/**
 * Rules whose FIX asymmetry is a real defect, recorded so the census stays
 * actionable while each is filed and fixed. Deliberately separate from
 * `DETECTION_EXEMPT` and `FIX_EXEMPT`, which record design decisions: merging
 * them would let a bug retire under a "filed decision" label.
 *
 * The entry it held before that was `prefer-use-deep-compare-memo`, which
 * rewrote a call to a `const`-spelled local hook while withholding the same
 * rewrite from the `function` spelling. Its cause was in the shared planner
 * rather than the rule: `planOrphanedImportRemoval`
 * (`src/utils/importRemoval.ts`) counted a declarator's own initializer write as
 * a surviving reference, so a `const` binding could never look orphaned. The
 * planner discounts that self-write, and both spellings decline (#1868).
 *
 * The entry it held most recently was `enforce-fieldpath-syntax-in-docsetter`,
 * which flattened `{ handlers: { onDone: () => {} } }` to `'handlers.onDone'`
 * while declining the identical field spelled as a method. The bail on
 * `property.method` was load-bearing as written, because a method shorthand's
 * `FunctionExpression` range starts at its parameter list — the same range trap
 * this guard's own `funcExpression->arrow` transform had — so copying that text
 * emitted `() { return 1; }`. The member is re-emitted as
 * `[async ]function[*] <sig> <body>`, which is what the rule already produces
 * for the `function`-valued spelling; `super`, the one binding the two spellings
 * do not share, is declined (#1876).
 */
const FIX_KNOWN_DEFECTS: Record<string, string> = {};

/** Every rule whose fix finding is accounted for, however it is accounted. */
const FIX_RECORDED = [
  ...Object.keys(FIX_EXEMPT),
  ...Object.keys(FIX_KNOWN_DEFECTS),
];

const reportOf = (findings: Finding[]) =>
  findings
    .map(
      (f) =>
        `[${f.transform}] ${f.messageId}: ${f.detail}\n` +
        `src/tests/${f.origin} as ${f.filename}\n` +
        `options: ${JSON.stringify(f.options)}\n` +
        `--- original ---\n${f.original}\n--- rewritten ---\n${f.variant}`,
    )
    .join('\n\n');

const findingsFor = (rule: string, findings: Finding[]) =>
  findings.filter((f) => f.rule === rule);

// ---------------------------------------------------------------------------
// Controls. A zero over the real rules asserts nothing without these, and each
// census needs its own pair — they read different halves of the probe result.
// ---------------------------------------------------------------------------

const CONTROLS = [
  {
    name: 'control-fix-asymmetric',
    code: 'function widget() { return legacyCompare(a, b); }\n',
    expect: { fix: true, detection: false, detectionCount: false },
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'use the helper' },
      },
      create(context: any) {
        const report = (node: any, fixable: boolean) => {
          const call = node.body?.body?.[0]?.argument;
          if (!call || call.callee?.name !== 'legacyCompare') return;
          context.report({
            node,
            messageId: 'm',
            ...(fixable
              ? { fix: (f: any) => f.replaceText(call.callee, 'diff') }
              : {}),
          });
        };
        return {
          FunctionDeclaration: (node: any) => report(node, true),
          ArrowFunctionExpression: (node: any) => report(node, false),
        };
      },
    },
  },
  {
    name: 'control-fix-symmetric',
    code: 'function widget() { return legacyCompare(a, b); }\n',
    expect: { fix: false, detection: false, detectionCount: false },
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'use the helper' },
      },
      create(context: any) {
        const report = (node: any) => {
          const call = node.body?.body?.[0]?.argument;
          if (!call || call.callee?.name !== 'legacyCompare') return;
          context.report({
            node,
            messageId: 'm',
            fix: (f: any) => f.replaceText(call.callee, 'diff'),
          });
        };
        return { FunctionDeclaration: report, ArrowFunctionExpression: report };
      },
    },
  },
  {
    // Reads the returned expression only out of a block, so the concise
    // spelling of the same function goes unseen. This is the shape #1795 and
    // #1792 both had.
    name: 'control-detection-block-only',
    code: 'const build = () => { return { a: 1 }; };\n',
    expect: { fix: false, detection: true, detectionCount: false },
    rule: {
      meta: { type: 'problem', schema: [], messages: { m: 'annotate it' } },
      create(context: any) {
        return {
          ReturnStatement(node: any) {
            if (node.argument?.type !== 'ObjectExpression') return;
            context.report({ node, messageId: 'm' });
          },
        };
      },
    },
  },
  {
    // Sees the returned object through either body form, so it must stay
    // silent — without this the detection check would flag every rule that
    // merely reports on an object literal.
    name: 'control-detection-both-bodies',
    code: 'const build = () => { return { a: 1 }; };\n',
    expect: { fix: false, detection: false, detectionCount: false },
    rule: {
      meta: { type: 'problem', schema: [], messages: { m: 'annotate it' } },
      create(context: any) {
        const check = (node: any, argument: any) => {
          if (argument?.type !== 'ObjectExpression') return;
          context.report({ node, messageId: 'm' });
        };
        return {
          ReturnStatement: (node: any) => check(node, node.argument),
          ArrowFunctionExpression: (node: any) =>
            node.body?.type === 'BlockStatement'
              ? undefined
              : check(node, node.body),
        };
      },
    },
  },
  {
    /**
     * Reports on every spelling, so the messageId is present on BOTH sides and
     * the presence census is silent by construction — but twice as often on a
     * declaration. That is the only shape the COUNT census can catch and the
     * presence one cannot, so without this control a corpus-wide zero would be
     * indistinguishable from an arm that never fires.
     */
    name: 'control-detection-count-partial',
    code: 'function widget() { return legacyCompare(a, b); }\n',
    expect: { fix: false, detection: false, detectionCount: true },
    rule: {
      meta: { type: 'problem', schema: [], messages: { m: 'inspect it' } },
      create(context: any) {
        const once = (node: any) => context.report({ node, messageId: 'm' });
        return {
          // Two distinct nodes rather than one reported twice, so the pair
          // survives any de-duplication ESLint applies to identical locations.
          FunctionDeclaration: (node: any) => {
            once(node);
            if (node.body) once(node.body);
          },
          ArrowFunctionExpression: once,
          FunctionExpression: once,
        };
      },
    },
  },
] as const;

for (const control of CONTROLS) {
  linter.defineRule(PREFIX + control.name, control.rule as never);
}

const plantedCase = (code: string): FixtureCase => ({
  code,
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted control',
  bucket: 'invalid',
});

// ---------------------------------------------------------------------------
// Transform census. A spelling this file DECLARES it probes but never actually
// produces is coverage nobody can see is missing, and that is not a
// hypothetical: `funcExpression->arrow` discarded 969 of its 1,091 attempts as
// unparsable, reaching 44 rules instead of 61, and nothing said so (#1870).
// ---------------------------------------------------------------------------

/**
 * What each transform must still yield, per transform rather than in total: a
 * corpus-wide count survives intact while one of five spellings stops being
 * produced at all.
 *
 * The floors are the measurement with headroom, and the corpus only grows, so
 * a fall through one is a harness regression rather than fixture churn.
 */
const TRANSFORM_FLOORS: Record<string, { yielded: number; rules: number }> = {
  'declaration->arrow': { yielded: 3800, rules: 120 },
  'arrow->declaration': { yielded: 2100, rules: 90 },
  // Measured 229 variants over 61 rules. The floor deliberately sits ABOVE the
  // 122 over 44 this transform produced before the method-shorthand and
  // overlapping-edit repairs, so a regression to that state fails here instead
  // of passing as it did for as long as it existed.
  'funcExpression->arrow': { yielded: 200, rules: 55 },
  'conciseArrow->block': { yielded: 3000, rules: 125 },
  'blockArrow->concise': { yielded: 950, rules: 78 },
};

/**
 * What the DETECTION census must keep diffing, per transform, in the same
 * shape as `TRANSFORM_FLOORS` and for the same reason: the total comparison
 * count survives intact while one spelling's pairs stop being diffed at all.
 * That is not hypothetical — the declaration/arrow answers were computed and
 * discarded behind a body-pair fence, and the six defects they surface
 * (#1908, #1909, #1910, #1774, #1755, #1857) were invisible for as long as the
 * fence stood. The floors are the measurement with headroom, and the corpus
 * only grows, so a fall through one is a harness regression rather than
 * fixture churn.
 */
const DETECTION_COMPARISON_FLOORS: Record<string, number> = {
  'declaration->arrow': 4000,
  'arrow->declaration': 2200,
  'funcExpression->arrow': 200,
  'conciseArrow->block': 3400,
  'blockArrow->concise': 1100,
};

/**
 * Attempts a transform still throws away, with the measured cause.
 *
 * Read in BOTH directions below: a transform with no entry must discard
 * NOTHING, and an entry whose transform stops discarding is stale and fails.
 * A ceiling rather than an exact count, because the corpus grows — but a low
 * one, since the whole failure mode this records is a rate nobody was watching.
 */
const DISCARD_RESIDUE: Record<string, { cause: string; ceiling: number }> = {
  'declaration->arrow': {
    cause:
      'a generic `function f<T>(...)` in a .tsx fixture becomes `const f = <T>(...) => ...`, where `<T>` opens a JSX element; the disambiguating `<T,>` is a second text change this transform does not make',
    ceiling: 25,
  },
};

/**
 * What the `funcExpression->arrow` decline census must keep counting.
 *
 * `noParameterList` and `unrecognizedSpelling` are DEFENSIVE and floored at
 * zero on purpose: they fire only when a `FunctionExpression` arrives under a
 * parent whose range this transform has not been taught, which is precisely
 * the condition that used to emit `foo() => {}` and vanish at the reparse.
 * Holding them at exactly zero makes the next such shape a failure rather than
 * a silent discard.
 */
const DECLINE_FLOORS: Record<TransformDecline, number> = {
  classMemberShorthand: 1500,
  namedFunctionExpression: 100,
  accessorShorthand: 10,
  bindsThisOrSuper: 8,
  generator: 5,
  noParameterList: 0,
  unrecognizedSpelling: 0,
  blockBodyHoldsComment: 60,
};

const DEFENSIVE_DECLINES = new Set<TransformDecline>([
  'noParameterList',
  'unrecognizedSpelling',
]);

const declineReasons = Object.keys(
  TRANSFORM_DECLINES,
) as TransformDecline[];

/** What a transform threw away, so a breached ceiling names its own residue. */
const discardReport = (transform: string) =>
  discards
    .filter((discard) => discard.transform === transform)
    .slice(0, 6)
    .map(
      (discard) =>
        `[${discard.transform}] ${discard.original}\n===>\n${discard.rewritten}`,
    )
    .join('\n\n');

/**
 * One transform applied to one planted snippet, run outside the corpus census
 * so a control cannot move the floors it asserts.
 */
const respell = (code: string, build: Build = functionExpressionToArrow) => {
  const ast = parseOrNull(code, false);
  const declined: TransformDecline[] = [];
  const built = ast ? build(code, ast, (reason) => declined.push(reason)) : [];
  const { kept, nested } = outermostOnly(built);
  return { code: applyEdits(code, kept), declined, nested };
};

/**
 * The shapes the corpus does not settle, planted.
 *
 * Every decline reason the corpus never reaches, and the nested-edit case it
 * reaches zero times, are exercised here — a filter no input trips is a filter
 * whose next regression is invisible. Each control also asserts the emitted
 * text is a legal program, which is the property the transform actually lost:
 * `foo() => {}` parses under TypeScript's error recovery and dies at the
 * diagnostics check, so "it produced something" was never the question.
 */
const RESPELLING_CONTROLS: readonly {
  name: string;
  code: string;
  output: string;
  declined: TransformDecline[];
  nested?: number;
  /** Defaults to `funcExpression->arrow`, which most controls exercise. */
  build?: Build;
}[] = [
  {
    name: 'a plain function expression',
    code: 'const f = function (a) { return a; };',
    output: 'const f = (a) => { return a; };',
    declined: [],
  },
  {
    name: 'an async function expression',
    code: 'const f = async function (a) { return a; };',
    output: 'const f = async (a) => { return a; };',
    declined: [],
  },
  {
    name: 'a function-valued property, which is not shorthand',
    code: 'const o = { k: function () { return 1; } };',
    output: 'const o = { k: () => { return 1; } };',
    declined: [],
  },
  {
    name: 'an object method, by rewriting the MEMBER',
    code: 'const o = { bar() { return 2; } };',
    output: 'const o = { bar: () => { return 2; } };',
    declined: [],
  },
  {
    name: 'an async generic object method',
    code: 'const o = { async bar<T>(a: T) { return a; } };',
    output: 'const o = { bar: async <T>(a: T) => { return a; } };',
    declined: [],
  },
  {
    name: 'a computed object method, keeping the brackets',
    code: 'const o = { [k]() { return 2; } };',
    output: 'const o = { [k]: () => { return 2; } };',
    declined: [],
  },
  {
    name: 'a string-keyed object method',
    code: "const o = { 'a-b'() { return 2; } };",
    output: "const o = { 'a-b': () => { return 2; } };",
    declined: [],
  },
  {
    name: 'nothing of a class method',
    code: 'class A { foo() { return 1; } }',
    output: 'class A { foo() { return 1; } }',
    declined: ['classMemberShorthand'],
  },
  {
    name: 'nothing of an object getter',
    code: 'const o = { get a() { return 1; } };',
    output: 'const o = { get a() { return 1; } };',
    declined: ['accessorShorthand'],
  },
  {
    name: 'nothing of a named function expression',
    code: 'const f = function named() { return named; };',
    output: 'const f = function named() { return named; };',
    declined: ['namedFunctionExpression'],
  },
  {
    name: 'nothing of a generator',
    code: 'const g = function* () { yield 1; };',
    output: 'const g = function* () { yield 1; };',
    declined: ['generator'],
  },
  {
    name: 'nothing of a body that binds this',
    code: 'const f = function () { return this.x; };',
    output: 'const f = function () { return this.x; };',
    declined: ['bindsThisOrSuper'],
  },
  {
    // The jest shape. Both are candidates; the contained one is dropped, so
    // the two edits can never be spliced into each other.
    name: 'only the outer of two nested function expressions',
    code: 'describe("x", function () { it("y", function () { return 1; }); });',
    output: 'describe("x", () => { it("y", function () { return 1; }); });',
    declined: [],
    nested: 1,
  },
  {
    // The refusal that keeps #1859's fabricated findings retired: a directive
    // inside the block decides which rules fire, so dropping it would make the
    // PERTURBATION the asymmetry.
    name: 'nothing of an arrow body holding a comment',
    code: 'const f = () => {\n  // eslint-disable-next-line no-console\n  return x;\n};',
    output:
      'const f = () => {\n  // eslint-disable-next-line no-console\n  return x;\n};',
    declined: ['blockBodyHoldsComment'],
    build: blockArrowToConcise,
  },
  {
    // The #2223 regression detector. `this` in an arrow body is NOT a reason to
    // decline — the expression stays inside the same arrow, which resolves
    // `this` from an enclosing non-arrow function the edit never touches. If a
    // neutrality gate is ever reinstated here by symmetry with the four
    // boundary-moving transforms, this control is what fails.
    name: 'an arrow body that reads this, which rebinds nothing',
    code: 'class A { f = () => { return this.x; }; }',
    output: 'class A { f = () => this.x; }',
    declined: [],
    build: blockArrowToConcise,
  },
];

const measuredFixUndriven = measuredUndriven(fixCauseOf, 'noFixer');
const measuredDetectionUndriven = measuredUndriven(detectionCauseOf);

/** The rows that CAN fail: every rule the census actually drove. */
const fixDrivenRules = probeRules.filter((rule) => !fixCauseOf(rule));
const detectionDrivenRules = probeRules.filter(
  (rule) => !detectionCauseOf(rule),
);

/**
 * A skipped row, titled with the rule and the measured reason. Jest renders
 * these as `○ skipped`, which is the point: a rule the probe never drove must
 * be visibly absent from the result rather than indistinguishable from a clean
 * one (#1861).
 */
const skipTitles = (causeOf: (rule: string) => UndrivenCause | null) =>
  probeRules
    .map((rule) => [rule, causeOf(rule)] as const)
    .filter((entry): entry is readonly [string, UndrivenCause] => !!entry[1])
    .map(([rule, cause]) => `${rule} — NOT DRIVEN: ${UNDRIVEN_CAUSES[cause]}`);

console.log(
  [
    `[fix-spelling-asymmetry] ${probeRules.length} rules probed, ` +
      `${rulesCompared.size} compared`,
    `  corpus: ${corpus.totalCases} cases from ${corpus.suitesUsed} suites, ` +
      `${corpus.failures.length} failed`,
    `  fix census: ${sharedMessageIds} shared messageIds, ` +
      `${fixFindings.length} finding(s); ${fixDrivenRules.length} rule(s) ` +
      `driven, ${probeRules.length - fixDrivenRules.length} named skip(s)`,
    `  detection census: ${detectionComparisons} compared pairs, ` +
      `${detectionFindings.length} finding(s) across ` +
      `${detectionRules.length} rule(s); ${detectionDrivenRules.length} rule(s) ` +
      `driven, ${
        probeRules.length - detectionDrivenRules.length
      } named skip(s)`,
    `  detection pairs by transform: ${JSON.stringify(
      Object.fromEntries(detectionComparisonsByTransform),
    )}`,
    `  detection COUNT census: ${detectionCountFindings.length} finding(s) ` +
      `across ${
        new Set(detectionCountFindings.map((f) => f.rule)).size
      } rule(s)`,
    ...[
      ...new Map(
        detectionCountFindings.map((f) => [
          `${f.rule} :: ${f.messageId} :: ${f.transform}`,
          f,
        ]),
      ),
    ].map(
      ([key, f]) =>
        `    ${key} | ${f.detail} | ${f.origin.replace(/^.*\//, '')}`,
    ),
    ...[...transformStats].map(
      ([name, stats]) =>
        `  ${name}: attempted=${stats.attempted} sites=${stats.sites} ` +
        `nested=${stats.nested} yielded=${stats.outcomes.yielded} ` +
        `unchanged=${stats.outcomes.unchanged} ` +
        `unparsable=${stats.outcomes.unparsable} ` +
        `recovered=${stats.outcomes.recovered} rules=${stats.rules.size}`,
    ),
    `  declined by transform gates: ${JSON.stringify(
      Object.fromEntries([...declinedSites].sort()),
    )}`,
    `  discarded: ${discards.length}`,
    ...discards
      .slice(0, 8)
      .map(
        (discard) =>
          `  DISCARDED [${discard.transform}] ${discard.original}\n  ===>\n${discard.rewritten}`,
      ),
  ].join('\n'),
);

describe('fix availability must not depend on how a function is spelled', () => {
  /**
   * Floors sit on the ASSERTED counts. Cases and variants are bookkeeping — a
   * comparison only happens where a messageId appears on both sides, so that
   * is the number whose collapse would make every assertion below vacuous.
   */
  /**
   * The non-TypeScript skip, both ways. An unlisted rule whose fixtures get
   * skipped is a silent loss of coverage; a listed rule whose fixtures stop
   * being skipped is a dead entry that would absorb the next one. The count
   * floor keeps the set equality from passing vacuously.
   */
  it('skips only the named non-TypeScript fixtures', () => {
    expect([...rulesWithNonTypeScriptFixtures].sort()).toEqual(
      Object.keys(NON_TYPESCRIPT_FIXTURES).sort(),
    );
    expect(nonTypeScriptSkipped).toBeGreaterThan(0);
  });

  it('compares enough to make a zero mean something', () => {
    expect(corpus.failures).toEqual([]);
    expect(probeRules.length).toBeGreaterThan(150);
    expect(casesConsidered).toBeGreaterThan(5000);
    expect(sharedMessageIds).toBeGreaterThan(3000);
    expect(detectionComparisons).toBeGreaterThan(11000);
    expect(rulesCompared.size).toBeGreaterThan(100);
    // The rows that can actually fail, floored separately: the counts above
    // survive intact even if every comparison piles onto a handful of rules.
    expect(fixDrivenRules.length).toBeGreaterThan(50);
    expect(detectionDrivenRules.length).toBeGreaterThan(140);
  });

  /** Both directions, so a fixed rule must be removed rather than lingering. */
  it('flags exactly the rules whose fix asymmetry is recorded', () => {
    expect([...new Set(fixFindings.map((f) => f.rule))].sort()).toEqual(
      [...FIX_RECORDED].sort(),
    );
    // A rule cannot be both a decision and a defect, or the two maps would
    // cover for each other and neither could retire.
    expect(FIX_RECORDED.length).toBe(new Set(FIX_RECORDED).size);
  });

  /**
   * Two-way accounting for the skipped rows, cause included.
   *
   * A rule that becomes drivable fails as a stale entry; a rule that stops
   * being drivable fails as an unrecorded skip; and a rule that stays dark for
   * a DIFFERENT reason fails too, because the recorded cause is the claim being
   * made about it and a changed cause is a changed claim.
   */
  it('accounts for every rule the fix census cannot drive', () => {
    expect(measuredFixUndriven).toEqual(FIX_UNDRIVEN);
  });

  it('derives the fixer-less skip from meta rather than a list', () => {
    // `noFixer` is the one cause not written down, so it must be exactly the
    // rules with no `meta.fixable` — and no fix finding may ever come from one,
    // or deriving the skip would be hiding a finding rather than a vacuum.
    expect(
      probeRules.filter((rule) => fixCauseOf(rule) === 'noFixer').sort(),
    ).toEqual(probeRules.filter((rule) => !fixableRuleNames.has(rule)).sort());
    expect(
      [...new Set(fixFindings.map((f) => f.rule))].filter(
        (rule) => !fixableRuleNames.has(rule),
      ),
    ).toEqual([]);
    expect(fixableRuleNames.size).toBeGreaterThan(50);
  });

  /** Both maps at once: an unexplained or unmeasurable entry is dead weight. */
  it('explains every cause it records', () => {
    const causes = [
      ...Object.values(FIX_UNDRIVEN),
      ...Object.values(DETECTION_UNDRIVEN),
    ];
    expect(causes.filter((cause) => !UNDRIVEN_CAUSES[cause])).toEqual([]);
    // An entry naming a rule that is not probed is an exemption nothing can
    // retire, so it would sit there forever absorbing the next regression.
    const probed = new Set(probeRules);
    expect(
      [...Object.keys(FIX_UNDRIVEN), ...Object.keys(DETECTION_UNDRIVEN)].filter(
        (rule) => !probed.has(rule),
      ),
    ).toEqual([]);
  });

  it.each(fixDrivenRules.filter((rule) => !FIX_RECORDED.includes(rule)))(
    '%s',
    (rule) => {
      // The row asserts it did work before it asserts a zero: an `expect('')
      // .toBe('')` over a rule the probe never compared is a green row that
      // validated nothing (#1861).
      expect(driveByRule.get(rule)!.fixableComparisons).toBeGreaterThan(0);
      // A rule reaching here reports a violation in both spellings and remedies
      // only one; the cure is to fix both or decline on both.
      expect(reportOf(findingsFor(rule, fixFindings))).toBe('');
    },
  );

  const fixSkips = skipTitles(fixCauseOf);
  if (fixSkips.length) {
    it.skip.each(fixSkips)('%s', () => undefined);
  }
});

describe('every spelling of a function must be seen alike', () => {
  it('flags exactly the rules whose detection asymmetry is recorded', () => {
    expect(detectionRules).toEqual(Object.keys(DETECTION_EXEMPT).sort());
  });

  /**
   * The census must keep diffing every spelling, per transform: a fence that
   * re-scopes detection to the body pair would zero the declaration/arrow
   * counts while the total above stays comfortably over its floor, and the six
   * defects those pairs surface would go back to being computed and discarded.
   */
  it('declares a detection floor for each transform and for no other', () => {
    expect(Object.keys(DETECTION_COMPARISON_FLOORS).sort()).toEqual(
      TRANSFORMS.map((transform) => transform.name).sort(),
    );
  });

  it.each(TRANSFORMS.map((transform) => transform.name))(
    '%s feeds the detection census',
    (name) => {
      const compared = detectionComparisonsByTransform.get(name) || 0;
      expect({
        compared,
        clearsFloor: compared >= DETECTION_COMPARISON_FLOORS[name],
      }).toEqual({ compared, clearsFloor: true });
    },
  );

  /** Both directions and the cause, exactly as the fix census does above. */
  it('accounts for every rule the detection census cannot drive', () => {
    expect(measuredDetectionUndriven).toEqual(DETECTION_UNDRIVEN);
  });

  it.each(detectionDrivenRules.filter((rule) => !(rule in DETECTION_EXEMPT)))(
    '%s',
    (rule) => {
      expect(
        driveByRule.get(rule)!.reportingDetectionComparisons,
      ).toBeGreaterThan(0);
      // Reported one way and silent the other: either a remedy is withheld, or
      // code the rule flags is blessed one rewrite away.
      expect(reportOf(findingsFor(rule, detectionFindings))).toBe('');
    },
  );

  const detectionSkips = skipTitles(detectionCauseOf);
  if (detectionSkips.length) {
    it.skip.each(detectionSkips)('%s', () => undefined);
  }

  /**
   * The same question the census above asks, spelled quantitatively: a rule may
   * survive a respelling with its messageId intact and still see fewer of the
   * violations. `has()` cannot express that, which is how a set-differencing
   * guard stayed green over the real defect it existed to catch (#2007/#2010).
   *
   * Corpus-wide rather than per-rule because the measured population is zero:
   * an exempt map here would be an allowance with nothing in it to review, and
   * `sharedMessageIds` (asserted above, >3000) is already this arm's floor —
   * it reads exactly the both-sides messageIds that counter counts.
   */
  it('no rule loses reports to a respelling it still reports on', () => {
    expect(reportOf(detectionCountFindings)).toBe('');
  });
});

describe('both detectors are load-bearing', () => {
  it.each(CONTROLS.map((c) => [c.name, c.expect] as const))(
    'control %s yields %s',
    (name, expected) => {
      const control = CONTROLS.find((c) => c.name === name)!;
      const result = probeCase(name, plantedCase(control.code));
      // A control the probe never actually compared would prove nothing.
      expect(
        result.sharedMessageIds + result.detectionComparisons,
      ).toBeGreaterThan(0);
      expect({
        fix: result.fixFindings.length > 0,
        detection: result.detectionFindings.length > 0,
        detectionCount: result.detectionCountFindings.length > 0,
      }).toEqual(expected);
    },
  );
});

/**
 * The transforms themselves, which the two censuses above cannot speak for.
 *
 * Both of them read a rule's behaviour across a pair of spellings, so a
 * transform that stops producing its spelling makes them quieter, never redder
 * — every finding it would have surfaced simply never arrives. That is how
 * `funcExpression->arrow` spent its whole life emitting `foo() => {}` for 83%
 * of its sites while both censuses reported clean (#1870). The discard rate is
 * the number that had to be asserted, so it is.
 */
describe('every declared respelling must actually be produced', () => {
  it('declares a floor for each transform and for no other', () => {
    const names = TRANSFORMS.map((transform) => transform.name).sort();
    expect(Object.keys(TRANSFORM_FLOORS).sort()).toEqual(names);
    // An entry naming a transform that does not exist is an allowance nothing
    // can retire, so it would silently cover the next one added.
    expect(
      Object.keys(DISCARD_RESIDUE).filter((name) => !names.includes(name)),
    ).toEqual([]);
    // The overlap filter is load-bearing over the CORPUS and not only over the
    // planted nest below: without this, every discard assertion could pass on
    // a corpus that never nests, and the filter would be untested where it
    // matters. Measured 532 contained sites dropped.
    expect(
      [...transformStats.values()].reduce(
        (total, stats) => total + stats.nested,
        0,
      ),
    ).toBeGreaterThan(300);
  });

  it.each(TRANSFORMS.map((transform) => transform.name))(
    '%s reaches the corpus',
    (name) => {
      const stats = transformStats.get(name)!;
      const floor = TRANSFORM_FLOORS[name];
      expect({
        yielded: stats.outcomes.yielded,
        rules: stats.rules.size,
        clearsYieldFloor: stats.outcomes.yielded >= floor.yielded,
        clearsRuleFloor: stats.rules.size >= floor.rules,
      }).toEqual({
        yielded: stats.outcomes.yielded,
        rules: stats.rules.size,
        clearsYieldFloor: true,
        clearsRuleFloor: true,
      });
    },
  );

  it.each(TRANSFORMS.map((transform) => transform.name))(
    '%s discards only what it declares it discards',
    (name) => {
      const stats = transformStats.get(name)!;
      const discarded =
        stats.outcomes.unparsable +
        stats.outcomes.recovered +
        stats.outcomes.unchanged;
      const residue = DISCARD_RESIDUE[name];
      if (!residue) {
        // The report, not the count: a transform that starts throwing rewrites
        // away must show the reader the text it emitted.
        expect(discardReport(name)).toBe('');
        return;
      }
      // Stale-entry direction. An allowance for something that no longer
      // happens is a slot the next regression lands in unnoticed.
      expect(discarded).toBeGreaterThan(0);
      expect({ name, within: discarded <= residue.ceiling }).toEqual({
        name,
        within: true,
      });
    },
  );

  it('counts every function expression it passes over', () => {
    const measured = Object.fromEntries(
      declineReasons.map((reason) => [reason, declinedSites.get(reason) || 0]),
    ) as Record<TransformDecline, number>;
    // A defensive reason is held at exactly zero, so a shape whose range this
    // transform does not understand becomes a failure rather than a discard;
    // every other reason must keep being exercised or its branch is dead.
    const holds = Object.fromEntries(
      declineReasons.map((reason) => [
        reason,
        DEFENSIVE_DECLINES.has(reason)
          ? measured[reason] === 0
          : measured[reason] >= DECLINE_FLOORS[reason],
      ]),
    );
    expect({ measured, holds }).toEqual({
      measured,
      holds: Object.fromEntries(declineReasons.map((r) => [r, true])),
    });
  });

  it('plants a control for every decline the corpus cannot reach', () => {
    const covered = new Set(
      RESPELLING_CONTROLS.flatMap((control) => control.declined),
    );
    expect(
      declineReasons.filter(
        (reason) => !covered.has(reason) && !DEFENSIVE_DECLINES.has(reason),
      ),
    ).toEqual([]);
    // Half the controls must actually REWRITE, or the table could pass by
    // declining everything.
    expect(
      RESPELLING_CONTROLS.filter((control) => control.output !== control.code)
        .length,
    ).toBeGreaterThan(5);
  });

  it.each(
    RESPELLING_CONTROLS.map((control) => [control.name, control] as const),
  )('respells %s', (_name, control) => {
    const result = respell(control.code, control.build);
    expect({
      code: result.code,
      declined: result.declined,
      nested: result.nested,
      // TypeScript's parser RECOVERS from a syntax error rather than
      // throwing, so producing a tree proves nothing; the diagnostics do.
      legal: isSyntacticallyValid(result.code, false),
    }).toEqual({
      code: control.output,
      declined: control.declined,
      nested: control.nested ?? 0,
      legal: true,
    });
  });
});
