import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferMap' | 'preferMapManual';

/**
 * A single value produced by a branch: either `return <expr>;` or
 * `<target> = <expr>;`. Ternary branches carry only an expression.
 */
type BranchValue =
  | { kind: 'return'; expr: TSESTree.Expression }
  | { kind: 'assign'; target: TSESTree.Node; expr: TSESTree.Expression };

/** Literal key resolved from a case test / equality test. */
type LiteralKey = { value: string | number; kind: 'string' | 'number' };

/**
 * Node types whose presence anywhere in a branch value means the value is NOT
 * safe to eager-evaluate inside a `Record` (all entries construct at once).
 */
const EAGER_UNSAFE_NODES = new Set<string>([
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.YieldExpression,
  AST_NODE_TYPES.TaggedTemplateExpression,
  AST_NODE_TYPES.UpdateExpression,
  AST_NODE_TYPES.AssignmentExpression,
]);

const CONTAINER_TYPES = new Set<string>([
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.SwitchCase,
]);

const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
]);

export const preferMapOverConditionalDispatch = createRule<[], MessageIds>({
  name: 'prefer-map-over-conditional-dispatch',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer a Record<Discriminant, Value> lookup over switch/ternary/if-else dispatch on a literal-union discriminant where every branch returns or assigns a single value.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferMap:
        'This dispatch on a literal-union discriminant maps each case to a single value; replace it with a Record<Discriminant, Value> lookup so exhaustiveness is a compile-time guarantee and adding a case is a one-line data edit.',
      preferMapManual:
        'This dispatch on a literal-union discriminant is a lookup table in disguise; prefer a Record<Discriminant, Value>. Autofix skipped: {{reason}}.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const parserServices = sourceCode.parserServices;

    // Type-aware rule: without the TypeScript program we cannot verify the
    // discriminant is a finite literal union, so we silently skip (the plugin
    // prefers false negatives over false positives on trust-boundary switches).
    if (
      !parserServices?.program ||
      !parserServices.esTreeNodeToTSNodeMap ||
      typeof parserServices.program.getTypeChecker !== 'function'
    ) {
      return {};
    }

    const checker = parserServices.program.getTypeChecker();
    const esTreeNodeToTSNodeMap = parserServices.esTreeNodeToTSNodeMap;

    // Ternary/if forms stash their resolved discriminant here so the shared
    // `report`/fixer can recover it (switch reads `node.discriminant` directly).
    const discriminantMap = new WeakMap<TSESTree.Node, TSESTree.Node>();

    // ---- Type helpers -------------------------------------------------------

    function tsTypeOf(node: TSESTree.Node): ts.Type | null {
      try {
        const tsNode = esTreeNodeToTSNodeMap.get(node);
        if (!tsNode) {
          return null;
        }
        return checker.getTypeAtLocation(tsNode);
      } catch {
        return null;
      }
    }

    function unionPartsOf(type: ts.Type): ts.Type[] {
      return type.isUnion() ? type.types : [type];
    }

    function literalValueOf(t: ts.Type): LiteralKey | null {
      if (t.flags & ts.TypeFlags.StringLiteral) {
        return { value: (t as ts.StringLiteralType).value, kind: 'string' };
      }
      if (t.flags & ts.TypeFlags.NumberLiteral) {
        return { value: (t as ts.NumberLiteralType).value, kind: 'number' };
      }
      return null;
    }

    /**
     * Classify the discriminant's static type. The rule fires only when every
     * non-nullish constituent is a string/number literal. `undefined`/`null`
     * do not block firing but force the report-only path (they are not
     * expressible as Record keys).
     */
    function classifyDiscriminant(type: ts.Type): {
      literalKeys: LiteralKey[];
      hasNullish: boolean;
      hasOther: boolean;
    } {
      const literalKeys: LiteralKey[] = [];
      let hasNullish = false;
      let hasOther = false;
      for (const part of unionPartsOf(type)) {
        const f = part.flags;
        if (f & ts.TypeFlags.Undefined || f & ts.TypeFlags.Null) {
          hasNullish = true;
          continue;
        }
        // `boolean` is `true | false`; boolean literals are NOT literal keys.
        if (f & ts.TypeFlags.BooleanLiteral) {
          hasOther = true;
          continue;
        }
        const lit = literalValueOf(part);
        if (lit) {
          literalKeys.push(lit);
        } else {
          hasOther = true;
        }
      }
      return { literalKeys, hasNullish, hasOther };
    }

    /**
     * Resolve a case-test / equality-test node to a literal key. Handles inline
     * literals directly and constant references (e.g. `THIS_DEVICE_STATUS.active`)
     * via the checker.
     */
    function resolveLiteralKey(node: TSESTree.Node): LiteralKey | null {
      if (node.type === AST_NODE_TYPES.Literal) {
        if (typeof node.value === 'string') {
          return { value: node.value, kind: 'string' };
        }
        if (typeof node.value === 'number') {
          return { value: node.value, kind: 'number' };
        }
        return null;
      }
      const type = tsTypeOf(node);
      if (!type) {
        return null;
      }
      return literalValueOf(type);
    }

    function computeValueTypeText(exprs: TSESTree.Expression[]): string | null {
      const seen = new Set<string>();
      const parts: string[] = [];
      for (const expr of exprs) {
        const type = tsTypeOf(expr);
        if (!type) {
          return null;
        }
        let widened: ts.Type;
        try {
          widened = checker.getBaseTypeOfLiteralType(type);
        } catch {
          widened = type;
        }
        let text: string;
        try {
          // Pass the expression's TS node as the enclosing declaration so the
          // printer qualifies namespaced symbols to their scoped name (e.g.
          // `JSX.Element`, not the DOM global `Element`) at the fix site.
          const enclosing = esTreeNodeToTSNodeMap.get(expr);
          text = checker.typeToString(widened, enclosing);
        } catch {
          return null;
        }
        if (!text || text === 'error') {
          return null;
        }
        if (!seen.has(text)) {
          seen.add(text);
          parts.push(text);
        }
      }
      return parts.length > 0 ? parts.join(' | ') : null;
    }

    function discriminantTypeText(
      type: ts.Type,
      discriminant: TSESTree.Node,
    ): string | null {
      try {
        // Pass the discriminant's TS node as the enclosing declaration so the
        // printer qualifies namespaced symbols to their scoped name at the fix
        // site rather than printing an ambiguous short name.
        const enclosing = esTreeNodeToTSNodeMap.get(discriminant);
        const text = checker.typeToString(type, enclosing);
        return text && text !== 'error' ? text : null;
      } catch {
        return null;
      }
    }

    // ---- AST helpers --------------------------------------------------------

    /** Whether a discriminant expression is an identifier or a call-free,
     * non-optional member chain (safe to collapse repeated evaluations). */
    function isValidDiscriminant(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.Identifier) {
        return true;
      }
      let cur: TSESTree.Node = node;
      while (cur.type === AST_NODE_TYPES.MemberExpression) {
        if (cur.optional || cur.computed) {
          return false;
        }
        cur = cur.object;
      }
      return cur.type === AST_NODE_TYPES.Identifier;
    }

    /** Root identifier of a member chain (`a.b.c` -> `a`). */
    function rootIdentifierName(node: TSESTree.Node): string | null {
      let cur: TSESTree.Node = node;
      while (cur.type === AST_NODE_TYPES.MemberExpression) {
        cur = cur.object;
      }
      return cur.type === AST_NODE_TYPES.Identifier ? cur.name : null;
    }

    function isInlineLiteralKey(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.Literal &&
        (typeof node.value === 'string' || typeof node.value === 'number')
      );
    }

    /** Extract the single value produced by a run of statements, tolerating a
     * wrapping block and a trailing `break`. Returns null for any other shape. */
    function extractBranchValue(
      statements: TSESTree.Statement[],
    ): BranchValue | null {
      let stmts = statements;
      if (
        stmts.length === 1 &&
        stmts[0].type === AST_NODE_TYPES.BlockStatement
      ) {
        stmts = stmts[0].body;
      }
      if (
        stmts.length > 0 &&
        stmts[stmts.length - 1].type === AST_NODE_TYPES.BreakStatement
      ) {
        stmts = stmts.slice(0, -1);
      }
      if (stmts.length !== 1) {
        return null;
      }
      const stmt = stmts[0];
      if (stmt.type === AST_NODE_TYPES.ReturnStatement && stmt.argument) {
        return { kind: 'return', expr: stmt.argument };
      }
      if (
        stmt.type === AST_NODE_TYPES.ExpressionStatement &&
        stmt.expression.type === AST_NODE_TYPES.AssignmentExpression &&
        stmt.expression.operator === '='
      ) {
        return {
          kind: 'assign',
          target: stmt.expression.left,
          expr: stmt.expression.right,
        };
      }
      return null;
    }

    /** True when any node in the subtree is unsafe to eager-evaluate. */
    function containsEagerUnsafe(node: TSESTree.Node): boolean {
      let found = false;
      const visit = (n: unknown): void => {
        if (found || !n || typeof n !== 'object') {
          return;
        }
        const anyNode = n as Record<string, unknown> & { type?: string };
        if (typeof anyNode.type !== 'string') {
          return;
        }
        if (EAGER_UNSAFE_NODES.has(anyNode.type)) {
          found = true;
          return;
        }
        for (const key of Object.keys(anyNode)) {
          if (key === 'parent') {
            continue;
          }
          const val = anyNode[key];
          if (Array.isArray(val)) {
            for (const child of val) {
              visit(child);
            }
          } else {
            visit(val);
          }
        }
      };
      visit(node);
      return found;
    }

    /** Whether the subtree references an identifier with the given name in a
     * non-property-key position (i.e., an actual read of that binding). */
    function referencesIdentifier(node: TSESTree.Node, name: string): boolean {
      let found = false;
      const visit = (n: unknown, parent?: Record<string, unknown>): void => {
        if (found || !n || typeof n !== 'object') {
          return;
        }
        const anyNode = n as Record<string, unknown> & { type?: string };
        if (typeof anyNode.type !== 'string') {
          return;
        }
        if (
          anyNode.type === AST_NODE_TYPES.Identifier &&
          anyNode.name === name
        ) {
          // Ignore non-computed property names / object-literal keys — those
          // are not references to the outer binding.
          const isMemberProperty =
            parent &&
            parent.type === AST_NODE_TYPES.MemberExpression &&
            parent.property === anyNode &&
            parent.computed === false;
          const isPropertyKey =
            parent &&
            parent.type === AST_NODE_TYPES.Property &&
            parent.key === anyNode &&
            parent.computed === false;
          if (!isMemberProperty && !isPropertyKey) {
            found = true;
            return;
          }
        }
        for (const key of Object.keys(anyNode)) {
          if (key === 'parent') {
            continue;
          }
          const val = anyNode[key];
          if (Array.isArray(val)) {
            for (const child of val) {
              visit(child, anyNode);
            }
          } else {
            visit(val, anyNode);
          }
        }
      };
      visit(node);
      return found;
    }

    // ---- Name derivation ----------------------------------------------------

    function toUpperSnake(name: string): string {
      return name
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
    }

    function deriveLookupName(discriminant: TSESTree.Node): string | null {
      let key: string | null = null;
      if (discriminant.type === AST_NODE_TYPES.Identifier) {
        key = discriminant.name;
      } else if (
        discriminant.type === AST_NODE_TYPES.MemberExpression &&
        !discriminant.computed &&
        discriminant.property.type === AST_NODE_TYPES.Identifier
      ) {
        key = discriminant.property.name;
      }
      if (!key) {
        return null;
      }
      const snake = toUpperSnake(key);
      if (!snake) {
        return null;
      }
      const name = `RESULT_BY_${snake}`;
      // Conservative collision check: any textual occurrence of the name blocks
      // the autofix (a false collision only downgrades to report-only).
      if (new RegExp(`\\b${name}\\b`).test(sourceCode.getText())) {
        return null;
      }
      return name;
    }

    // ---- Fix construction ---------------------------------------------------

    function formatKey(key: LiteralKey): string {
      if (key.kind === 'number') {
        return String(key.value);
      }
      const str = String(key.value);
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(str)) {
        return str;
      }
      return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    }

    function indentOf(node: TSESTree.Node): string {
      const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
      const before = line.slice(0, node.loc.start.column);
      const match = /[ \t]*$/.exec(before);
      return match ? match[0] : '';
    }

    function buildRecordText(
      name: string,
      dText: string,
      vText: string,
      entries: { key: LiteralKey; valueText: string }[],
      baseIndent: string,
    ): string {
      const lines = entries.map(
        (e) => `${baseIndent}  ${formatKey(e.key)}: ${e.valueText},`,
      );
      return [
        `const ${name}: Record<${dText}, ${vText}> = {`,
        ...lines,
        `${baseIndent}};`,
      ].join('\n');
    }

    // ---- Core analysis result ----------------------------------------------

    type Entry = { key: LiteralKey; valueText: string };

    type Analysis = {
      // Ordered Record entries (only meaningful when autofixable).
      entries: Entry[];
      // Expressions that will materialize as Record values (for eager check).
      contributingValues: TSESTree.Expression[];
      dText: string;
      // 'return' | 'assign' for switch/if forms; 'expr' for ternary.
      form: 'return' | 'assign' | 'expr';
      assignTargetText?: string;
      fullCoverage: boolean;
      hasNullish: boolean;
      // False when the fix cannot be safely placed (ternary inside an
      // expression-bodied function) — forces the report-only path.
      canPlaceFix: boolean;
    };

    /**
     * Given ordered explicit branches + optional tail, resolve coverage against
     * the union's literal keys and (when full) the ordered Record entries.
     * Returns null when the construct is not a qualifying dispatch at all.
     */
    function resolveCoverage(
      explicit: { keys: LiteralKey[]; valueText: string }[],
      unionKeys: LiteralKey[],
      tail: { valueText: string } | null,
    ): {
      entries: Entry[];
      fullCoverage: boolean;
      remainingCount: number;
    } | null {
      const unionValues = new Set(unionKeys.map((k) => String(k.value)));
      const explicitValues = new Set<string>();
      for (const branch of explicit) {
        for (const k of branch.keys) {
          const s = String(k.value);
          if (!unionValues.has(s) || explicitValues.has(s)) {
            // Key outside the union, or duplicated — bail entirely.
            return null;
          }
          explicitValues.add(s);
        }
      }
      const remaining = unionKeys.filter(
        (k) => !explicitValues.has(String(k.value)),
      );

      const entries: Entry[] = [];
      for (const branch of explicit) {
        for (const k of branch.keys) {
          entries.push({ key: k, valueText: branch.valueText });
        }
      }

      if (remaining.length === 0) {
        // Full coverage; any tail is unreachable for typed values and dropped.
        return { entries, fullCoverage: true, remainingCount: 0 };
      }
      if (remaining.length === 1 && tail) {
        entries.push({ key: remaining[0], valueText: tail.valueText });
        return { entries, fullCoverage: true, remainingCount: 1 };
      }
      if (!tail) {
        // Not exhaustive and no default/else — genuine control flow, skip.
        return null;
      }
      // Partial coverage relying on a shared default — report-only.
      return { entries, fullCoverage: false, remainingCount: remaining.length };
    }

    function manualReason(flags: {
      fullCoverage: boolean;
      hasNullish: boolean;
      eagerSafe: boolean;
      canPlaceFix: boolean;
    }): string {
      if (flags.hasNullish) {
        return 'the union includes undefined/null, which cannot be a Record key — use Partial<Record<D, V>> with a ?? fallback';
      }
      if (!flags.fullCoverage) {
        return 'the default/else covers multiple union members — use Partial<Record<D, V>> with a ?? fallback';
      }
      if (!flags.eagerSafe) {
        return 'a branch value invokes a call/await and would run eagerly for every entry — use a thunk Record<D, () => V> invoked after lookup';
      }
      if (!flags.canPlaceFix) {
        return 'the dispatch sits inside an expression-bodied function; extract the Record manually so it stays in scope';
      }
      return 'a collision-free lookup name could not be derived from the discriminant';
    }

    function report(node: TSESTree.Node, analysis: Analysis): void {
      const {
        entries,
        contributingValues,
        dText,
        form,
        assignTargetText,
        fullCoverage,
        hasNullish,
        canPlaceFix,
      } = analysis;

      const eagerSafe = contributingValues.every(
        (expr) => !containsEagerUnsafe(expr),
      );

      let name: string | null = null;
      // Name derivation is only needed for the autofix path.
      if (fullCoverage && !hasNullish && eagerSafe && canPlaceFix) {
        name = deriveLookupName(discriminantOf(node));
      }

      const autofixable =
        fullCoverage &&
        !hasNullish &&
        eagerSafe &&
        canPlaceFix &&
        name !== null;

      if (!autofixable) {
        context.report({
          node,
          messageId: 'preferMapManual',
          data: {
            reason: manualReason({
              fullCoverage,
              hasNullish,
              eagerSafe,
              canPlaceFix,
            }),
          },
        });
        return;
      }

      const lookupName = name as string;
      const vText = computeValueTypeText(contributingValues);
      if (!vText) {
        context.report({
          node,
          messageId: 'preferMapManual',
          data: {
            reason:
              'the branch value type could not be resolved for the annotation',
          },
        });
        return;
      }

      context.report({
        node,
        messageId: 'preferMap',
        fix(fixer) {
          const discText = sourceCode.getText(discriminantOf(node));
          if (form === 'expr') {
            // Ternary: insert the Record before the enclosing statement and
            // replace the conditional expression with the lookup.
            let stmt: TSESTree.Node = node;
            while (stmt.parent && !CONTAINER_TYPES.has(stmt.parent.type)) {
              stmt = stmt.parent;
            }
            const stmtIndent = indentOf(stmt);
            const recordText = buildRecordText(
              lookupName,
              dText,
              vText,
              entries,
              stmtIndent,
            );
            return [
              fixer.insertTextBefore(stmt, `${recordText}\n${stmtIndent}`),
              fixer.replaceText(node, `${lookupName}[${discText}]`),
            ];
          }

          const baseIndent = indentOf(node);
          const recordText = buildRecordText(
            lookupName,
            dText,
            vText,
            entries,
            baseIndent,
          );
          const lookup =
            form === 'assign'
              ? `${assignTargetText} = ${lookupName}[${discText}];`
              : `return ${lookupName}[${discText}];`;
          return fixer.replaceText(
            node,
            `${recordText}\n${baseIndent}${lookup}`,
          );
        },
      });
    }

    function discriminantOf(node: TSESTree.Node): TSESTree.Node {
      if (node.type === AST_NODE_TYPES.SwitchStatement) {
        return node.discriminant;
      }
      // For ternary/if we stash the discriminant on a WeakMap.
      return discriminantMap.get(node) ?? node;
    }

    // ---- Shared type gate + narrowing exemption -----------------------------

    /**
     * Type gate (Edge Case 4): fire only when every non-nullish union member is
     * a string/number literal. Returns the union keys + nullish flag, or null to
     * skip entirely (boolean/open string/number/object/function discriminants).
     */
    function typeGate(
      discriminant: TSESTree.Node,
    ): { unionKeys: LiteralKey[]; hasNullish: boolean; dText: string } | null {
      const type = tsTypeOf(discriminant);
      if (!type) {
        return null;
      }
      const { literalKeys, hasNullish, hasOther } = classifyDiscriminant(type);
      if (literalKeys.length === 0 || hasOther) {
        return null;
      }
      const dText = discriminantTypeText(type, discriminant);
      if (!dText) {
        return null;
      }
      return { unionKeys: literalKeys, hasNullish, dText };
    }

    /**
     * Narrowing exemption (Edge Case 1): when the discriminant is `obj.tag`, a
     * flat Record cannot express variant narrowing. If any KEPT branch value
     * references the base object beyond the tag access itself, do not fire.
     */
    function isNarrowingExempt(
      discriminant: TSESTree.Node,
      keptValues: TSESTree.Expression[],
    ): boolean {
      if (discriminant.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }
      const root = rootIdentifierName(discriminant);
      if (!root) {
        return false;
      }
      return keptValues.some((value) => referencesIdentifier(value, root));
    }

    // ---- Switch form --------------------------------------------------------

    function handleSwitch(node: TSESTree.SwitchStatement): void {
      // Parse cases into branches, grouping empty-consequent fallthrough cases
      // onto the following case's body.
      type ParsedBranch = {
        tests: (TSESTree.Node | null)[];
        value: BranchValue | null;
      };
      const parsed: ParsedBranch[] = [];
      let pending: (TSESTree.Node | null)[] = [];
      for (const c of node.cases) {
        if (c.consequent.length === 0) {
          pending.push(c.test);
          continue;
        }
        const value = extractBranchValue(c.consequent);
        parsed.push({ tests: [...pending, c.test], value });
        pending = [];
      }
      if (pending.length > 0) {
        // Trailing empty cases falling through to nothing — malformed.
        return;
      }
      if (parsed.length === 0) {
        return;
      }

      // Separate explicit branches from the default; disallow mixed groups.
      const explicit: { keys: LiteralKey[]; value: BranchValue }[] = [];
      let defaultValue: BranchValue | null | undefined;
      let hasDefault = false;
      for (const branch of parsed) {
        const literalTests = branch.tests.filter(
          (t): t is TSESTree.Node => t !== null,
        );
        const isDefaultGroup = literalTests.length !== branch.tests.length;
        if (isDefaultGroup) {
          if (literalTests.length > 0) {
            // `default: case 'x':` mixed group — bail (rare).
            return;
          }
          hasDefault = true;
          defaultValue = branch.value;
          continue;
        }
        if (!branch.value) {
          // A non-default branch that is not a single value — control flow.
          return;
        }
        const keys: LiteralKey[] = [];
        for (const test of literalTests) {
          const key = resolveLiteralKey(test);
          if (!key) {
            return;
          }
          keys.push(key);
        }
        explicit.push({ keys, value: branch.value });
      }

      if (explicit.length === 0) {
        return;
      }

      // Consistent kind/target across contributing branches.
      const kind = explicit[0].value.kind;
      const assignTargetText =
        kind === 'assign'
          ? sourceCode.getText(
              (explicit[0].value as { target: TSESTree.Node }).target,
            )
          : undefined;
      for (const branch of explicit) {
        if (branch.value.kind !== kind) {
          return;
        }
        if (
          kind === 'assign' &&
          sourceCode.getText(
            (branch.value as { target: TSESTree.Node }).target,
          ) !== assignTargetText
        ) {
          return;
        }
      }

      // Determine tail value from the default (only usable if it is a value).
      const defaultVal: BranchValue | null =
        hasDefault && defaultValue != null ? defaultValue : null;
      if (defaultVal && defaultVal.kind !== kind) {
        return;
      }
      if (
        defaultVal &&
        kind === 'assign' &&
        sourceCode.getText((defaultVal as { target: TSESTree.Node }).target) !==
          assignTargetText
      ) {
        return;
      }

      const gated = typeGate(node.discriminant);
      if (!gated) {
        return;
      }
      const { unionKeys, hasNullish, dText } = gated;

      // Compute coverage.
      const explicitForCoverage = explicit.map((b) => ({
        keys: b.keys,
        valueText: sourceCode.getText(b.value.expr),
      }));
      const tail = defaultVal
        ? { valueText: sourceCode.getText(defaultVal.expr) }
        : null;

      // A throwing/omitted default cannot satisfy a needed tail: when the
      // remaining members are guarded (not value-mapped), `resolveCoverage`
      // returns null because there is no usable tail, so the construct is not a
      // pure lookup and is skipped below.
      const coverage = resolveCoverage(explicitForCoverage, unionKeys, tail);
      if (!coverage) {
        return;
      }

      // Kept values (materialize as Record entries / shared fallback): explicit
      // branches always, plus the default only when the tail is used.
      const contributingValues = explicit.map((b) => b.value.expr);
      if (coverage.remainingCount >= 1 && defaultVal) {
        contributingValues.push(defaultVal.expr);
      }

      if (isNarrowingExempt(node.discriminant, contributingValues)) {
        return;
      }

      report(node, {
        entries: coverage.entries,
        contributingValues,
        dText,
        form: kind,
        assignTargetText,
        fullCoverage: coverage.fullCoverage,
        hasNullish,
        canPlaceFix: true,
      });
    }

    // ---- Ternary form -------------------------------------------------------

    function equalityDiscriminant(
      test: TSESTree.Node,
    ): { discNode: TSESTree.Node; keyNode: TSESTree.Node } | null {
      if (
        test.type !== AST_NODE_TYPES.BinaryExpression ||
        test.operator !== '==='
      ) {
        return null;
      }
      const { left, right } = test;
      let discNode: TSESTree.Node | null = null;
      let keyNode: TSESTree.Node | null = null;
      if (isInlineLiteralKey(left) && !isInlineLiteralKey(right)) {
        keyNode = left;
        discNode = right;
      } else if (isInlineLiteralKey(right) && !isInlineLiteralKey(left)) {
        keyNode = right;
        discNode = left;
      } else {
        return null;
      }
      if (!isValidDiscriminant(discNode)) {
        return null;
      }
      return { discNode, keyNode };
    }

    function handleConditional(node: TSESTree.ConditionalExpression): void {
      const head = equalityDiscriminant(node.test);
      if (!head) {
        return;
      }
      const discText = sourceCode.getText(head.discNode);

      // Skip chain continuations — only the outermost link reports.
      if (
        node.parent?.type === AST_NODE_TYPES.ConditionalExpression &&
        node.parent.alternate === node
      ) {
        const parentHead = equalityDiscriminant(node.parent.test);
        if (
          parentHead &&
          sourceCode.getText(parentHead.discNode) === discText
        ) {
          return;
        }
      }

      // Walk the chain.
      const links: { keyNode: TSESTree.Node; expr: TSESTree.Expression }[] = [];
      let cur: TSESTree.Expression = node;
      while (cur.type === AST_NODE_TYPES.ConditionalExpression) {
        const link = equalityDiscriminant(cur.test);
        if (!link || sourceCode.getText(link.discNode) !== discText) {
          break;
        }
        links.push({ keyNode: link.keyNode, expr: cur.consequent });
        cur = cur.alternate;
      }
      const tailExpr = cur;
      if (links.length === 0) {
        return;
      }

      const explicitKeys: LiteralKey[][] = [];
      for (const link of links) {
        const key = resolveLiteralKey(link.keyNode);
        if (!key) {
          return;
        }
        explicitKeys.push([key]);
      }

      const gated = typeGate(head.discNode);
      if (!gated) {
        return;
      }
      const { unionKeys, hasNullish, dText } = gated;

      const explicitForCoverage = links.map((l, i) => ({
        keys: explicitKeys[i],
        valueText: sourceCode.getText(l.expr),
      }));
      const coverage = resolveCoverage(explicitForCoverage, unionKeys, {
        valueText: sourceCode.getText(tailExpr),
      });
      if (!coverage) {
        return;
      }

      // Contributing values: links, plus tail only when it is kept.
      const contributingValues = links.map((l) => l.expr);
      if (coverage.remainingCount >= 1) {
        contributingValues.push(tailExpr);
      }

      if (isNarrowingExempt(head.discNode, contributingValues)) {
        return;
      }

      // A ternary hoists its Record to the enclosing statement; if that crosses
      // a function boundary the values/discriminant may fall out of scope, so
      // the fix cannot be placed safely there — downgrade to report-only.
      let stmt: TSESTree.Node = node;
      let crossesFunction = false;
      while (stmt.parent && !CONTAINER_TYPES.has(stmt.parent.type)) {
        stmt = stmt.parent;
        if (FUNCTION_TYPES.has(stmt.type)) {
          crossesFunction = true;
        }
      }

      discriminantMap.set(node, head.discNode);
      report(node, {
        entries: coverage.entries,
        contributingValues,
        dText,
        form: 'expr',
        fullCoverage: coverage.fullCoverage,
        hasNullish,
        canPlaceFix: !crossesFunction,
      });
    }

    // ---- if / else-if form --------------------------------------------------

    function handleIf(node: TSESTree.IfStatement): void {
      const head = equalityDiscriminant(node.test);
      if (!head) {
        return;
      }
      const discText = sourceCode.getText(head.discNode);

      // Skip continuations (this if is the else-if of a same-discriminant chain).
      if (
        node.parent?.type === AST_NODE_TYPES.IfStatement &&
        node.parent.alternate === node
      ) {
        const parentHead = equalityDiscriminant(node.parent.test);
        if (
          parentHead &&
          sourceCode.getText(parentHead.discNode) === discText
        ) {
          return;
        }
      }

      const links: { keyNode: TSESTree.Node; value: BranchValue }[] = [];
      let tail: BranchValue | null = null;
      let cur: TSESTree.IfStatement | null = node;
      while (cur) {
        const link = equalityDiscriminant(cur.test);
        if (!link || sourceCode.getText(link.discNode) !== discText) {
          return;
        }
        const value = extractBranchValue([cur.consequent]);
        if (!value) {
          return;
        }
        links.push({ keyNode: link.keyNode, value });
        const alt = cur.alternate;
        if (!alt) {
          cur = null;
          break;
        }
        if (alt.type === AST_NODE_TYPES.IfStatement) {
          cur = alt;
          continue;
        }
        const tailValue = extractBranchValue([alt]);
        if (!tailValue) {
          return;
        }
        tail = tailValue;
        cur = null;
      }

      if (links.length === 0) {
        return;
      }

      // Consistent kind/target.
      const kind = links[0].value.kind;
      const assignTargetText =
        kind === 'assign'
          ? sourceCode.getText(
              (links[0].value as { target: TSESTree.Node }).target,
            )
          : undefined;
      const allValues = [...links.map((l) => l.value)];
      if (tail) {
        allValues.push(tail);
      }
      for (const v of allValues) {
        if (v.kind !== kind) {
          return;
        }
        if (
          kind === 'assign' &&
          sourceCode.getText((v as { target: TSESTree.Node }).target) !==
            assignTargetText
        ) {
          return;
        }
      }

      const explicitKeys: LiteralKey[][] = [];
      for (const link of links) {
        const key = resolveLiteralKey(link.keyNode);
        if (!key) {
          return;
        }
        explicitKeys.push([key]);
      }

      const gated = typeGate(head.discNode);
      if (!gated) {
        return;
      }
      const { unionKeys, hasNullish, dText } = gated;

      const explicitForCoverage = links.map((l, i) => ({
        keys: explicitKeys[i],
        valueText: sourceCode.getText(l.value.expr),
      }));
      const coverage = resolveCoverage(
        explicitForCoverage,
        unionKeys,
        tail ? { valueText: sourceCode.getText(tail.expr) } : null,
      );
      if (!coverage) {
        return;
      }

      const contributingValues = links.map((l) => l.value.expr);
      if (coverage.remainingCount >= 1 && tail) {
        contributingValues.push(tail.expr);
      }

      if (isNarrowingExempt(head.discNode, contributingValues)) {
        return;
      }

      discriminantMap.set(node, head.discNode);
      report(node, {
        entries: coverage.entries,
        contributingValues,
        dText,
        form: kind,
        assignTargetText,
        fullCoverage: coverage.fullCoverage,
        hasNullish,
        canPlaceFix: true,
      });
    }

    return {
      SwitchStatement: handleSwitch,
      ConditionalExpression: handleConditional,
      IfStatement: handleIf,
    } as TSESLint.RuleListener;
  },
});
