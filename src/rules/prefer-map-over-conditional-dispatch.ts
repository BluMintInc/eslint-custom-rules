import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferMap' | 'preferMapManual';

/**
 * A single value produced by a branch: either `return <expr>;` or
 * `<target> = <expr>;`. Ternary branches carry only an expression. `stmt` is
 * the producing statement itself — the anchor comments hosted by the fix are
 * attributed against (parent pointers are not yet populated when the
 * enclosing construct's visitor runs, so the statement is captured here).
 */
type BranchValue =
  | { kind: 'return'; expr: TSESTree.Expression; stmt: TSESTree.Statement }
  | {
      kind: 'assign';
      target: TSESTree.Node;
      expr: TSESTree.Expression;
      stmt: TSESTree.Statement;
    };

/**
 * Literal key resolved from a case test / equality test.
 *
 * `sourceText` is present only when the key came from a test the checker had to
 * resolve — a constant reference (`STATUS.active`, `Status.Active`, `ACTIVE`),
 * an enum member, a template literal, a negated numeric literal — rather than
 * from an inline literal. The fixer emits those as computed keys built from the
 * source expression. Keys derived from the discriminant's union type (the
 * members a `default`/`else` covers) have no source expression at all and carry
 * no `sourceText`.
 */
type LiteralKey = {
  value: string | number;
  kind: 'string' | 'number';
  sourceText?: string;
};

/**
 * Outcome of deriving the lookup constant's name. The two failures are
 * different facts about the code and are reported as such: a discriminant with
 * no usable name in it is nothing like one whose name is already taken, and a
 * report-only message that states the wrong one misdiagnoses why the fix was
 * withheld (#1941).
 */
type NameDerivation =
  | { kind: 'ok'; name: string }
  | { kind: 'taken'; name: string }
  | { kind: 'underivable' };

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

/**
 * Node types whose children are a statement LIST, so a replacement spanning a
 * declaration plus a statement fits. This is deliberately wider than
 * `CONTAINER_TYPES`, which answers a different question — where a ternary's
 * hoist lands — and would change that answer if it grew these.
 */
const STATEMENT_LIST_TYPES = new Set<string>([
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.SwitchCase,
  AST_NODE_TYPES.StaticBlock,
  AST_NODE_TYPES.TSModuleBlock,
]);

const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
]);

/**
 * Sentinel standing in for the receiver of a `this`-rooted member chain, which
 * has no identifier to key on. `this` is a reserved word, so no binding can
 * carry this name and shadow the sentinel.
 */
const THIS_ROOT = 'this';

/**
 * Node types that bind their own `this`, so a `this` inside one is a different
 * receiver than the enclosing scope's. Arrow functions are deliberately absent:
 * they close over the lexical `this`, exactly as a closure closes over an
 * identifier binding.
 */
const THIS_REBINDING_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.ClassBody,
]);

/**
 * A printed type that is a bare name — an alias, interface, enum, or class the
 * checker resolved to a single symbol. Such a name already tracks its union as
 * that union grows; anything more elaborate (a printed literal union, a type
 * literal, a generic instantiation) does not.
 */
const BARE_TYPE_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Function/constructor/conditional type notation must be parenthesized to
 * appear as a `|` union member, or the emitted annotation does not parse
 * ("Function type notation must be parenthesized when used in a union type").
 * Over-wrapping is harmless — a parenthesized type is valid in any type
 * position — so this tests the printed text conservatively instead of
 * re-deriving the printer's precedence rules.
 */
function parenthesizeForUnion(text: string): string {
  const needsParens =
    text.includes('=>') || /^new\b/.test(text) || /\bextends\b/.test(text);
  return needsParens ? `(${text})` : text;
}

/**
 * How position-sensitive a comment is when the fix relocates it onto the
 * generated Record:
 *
 * - `next-line`: suppresses exactly the following line
 *   (`eslint-disable-next-line`, `@ts-expect-error`, `@ts-ignore`) — hosting
 *   it anywhere but directly above the line it suppressed silently changes
 *   which rules report.
 * - `own-line`: suppresses its own line (`eslint-disable-line`) — must stay on
 *   the same line as the value it annotates.
 * - `range`: opens/closes a suppression region or configures the linter
 *   (`eslint-disable`, `eslint-enable`, `eslint-env`, `eslint`, `global`,
 *   `exported`) — ESLint honors these only in block-comment form, and
 *   relocation can move the region boundary across reported lines, so the fix
 *   is never attempted around one.
 * - `none`: prose; content preservation suffices.
 */
function directiveKindOf(
  comment: TSESTree.Comment,
): 'next-line' | 'own-line' | 'range' | 'none' {
  const text = comment.value.trim();
  if (/^(eslint-disable-next-line|@ts-expect-error|@ts-ignore)\b/.test(text)) {
    return 'next-line';
  }
  if (/^eslint-disable-line\b/.test(text)) {
    return 'own-line';
  }
  if (
    comment.type === AST_TOKEN_TYPES.Block &&
    /^(eslint-disable|eslint-enable|eslint-env|eslint\b|globals?\b|exported\b)/.test(
      text,
    )
  ) {
    return 'range';
  }
  return 'none';
}

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

    // Lookup names this pass has committed to emitting, keyed by the scope that
    // receives the declaration. The textual collision check only sees names the
    // source already carries, so without a claim two dispatches sharing a
    // trailing property name (`this.tier` and `this.#tier`, or `a.tier` and
    // `b.tier`) both emit `const RESULT_BY_TIER` into one scope, which does not
    // compile (TS2451). The key is the scope rather than the file because the
    // same name in two sibling function bodies is two independent bindings, and
    // blocking those would strand every dispatch after the first — the textual
    // check sees the first fix's output on every later run.
    const claimedNames = new Map<TSESTree.Node, Set<string>>();

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
     *
     * A test the checker had to resolve carries its source text along with the
     * value: the value proves the key is a literal, but emitting the value as
     * the key destroys the expression it came from. For a constant reference
     * that orphans the constant (an imported one then trips `no-unused-vars`)
     * and bakes its value into the call site, discarding the single source of
     * truth the constant exists to provide; for `case -1:` the resolved value
     * does not even print as a legal object key (`{ -1: v }` does not parse).
     * The fixer emits a computed key from the source text instead.
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
      const literal = literalValueOf(type);
      if (!literal) {
        return null;
      }
      return { ...literal, sourceText: sourceCode.getText(node) };
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
      if (parts.length === 0) {
        return null;
      }
      if (parts.length === 1) {
        return parts[0];
      }
      return parts.map(parenthesizeForUnion).join(' | ');
    }

    /** Whether two classified discriminant types admit exactly the same keys. */
    function sameKeySpace(
      left: ReturnType<typeof classifyDiscriminant>,
      right: ReturnType<typeof classifyDiscriminant>,
    ): boolean {
      if (left.hasOther || right.hasOther) {
        return false;
      }
      if (left.hasNullish !== right.hasNullish) {
        return false;
      }
      const spell = (keys: LiteralKey[]) =>
        new Set(keys.map((key) => `${key.kind}:${String(key.value)}`));
      const leftKeys = spell(left.literalKeys);
      const rightKeys = spell(right.literalKeys);
      return (
        leftKeys.size === rightKeys.size &&
        [...leftKeys].every((key) => rightKeys.has(key))
      );
    }

    /**
     * `ObjectType['tag']` for a tag access whose object type has a name that
     * resolves at the fix site.
     *
     * The rule's promise is that a missing key becomes a *compile* error the
     * moment the union grows, and inlining the resolved literal union does not
     * keep it: the stale `Record` still typechecks on its own, and only the
     * lookup trips TS7053 — an implicit-any diagnostic, so under
     * `noImplicitAny: false` nothing is reported at all and the lookup quietly
     * yields `undefined` for the new member. Following the property through its
     * declaring type instead puts the error on the `Record` ("Property 'c' is
     * missing"), which names what to add and does not depend on
     * `noImplicitAny` (#1926).
     *
     * A wrong annotation does not compile, so the derived spelling ships only
     * when two things hold. The printed object-type name must resolve, at the
     * fix site, to exactly the object's own type: the checker prints a symbol's
     * bare name with no regard for whether that name is reachable there (the
     * printer behaviour `validateAnnotation` exists to catch), and building an
     * unreachable name would turn a fix that used to apply into a report. And
     * the property's declared key set must equal the discriminant's, because a
     * flow-narrowed tag access (`if (o.kind === 'c') return;` above the switch)
     * leaves the declared union wider than the cases the construct covers —
     * `Holder['kind']` there demands an entry the switch has no value for.
     * Failing either, the resolved literal union stays: a weak key type beats
     * one that breaks the build.
     */
    function indexedAccessTypeText(
      discriminant: TSESTree.Node,
      discriminantType: ts.Type,
    ): string | null {
      const chain = unwrapChain(discriminant);
      if (
        chain.type !== AST_NODE_TYPES.MemberExpression ||
        chain.computed ||
        chain.property.type !== AST_NODE_TYPES.Identifier
      ) {
        return null;
      }
      const objectType = tsTypeOf(chain.object);
      const tsObjectNode = esTreeNodeToTSNodeMap.get(chain.object);
      const tsFixSite = esTreeNodeToTSNodeMap.get(discriminant);
      if (!objectType || !tsObjectNode || !tsFixSite) {
        return null;
      }
      const propertyName = chain.property.name;
      try {
        const printed = checker.typeToString(objectType, tsObjectNode);
        if (!printed || !BARE_TYPE_NAME.test(printed)) {
          return null;
        }
        const inScope = checker
          .getSymbolsInScope(
            tsFixSite,
            ts.SymbolFlags.Type | ts.SymbolFlags.Alias,
          )
          .find((symbol) => symbol.name === printed);
        if (!inScope) {
          return null;
        }
        const declaredSymbol =
          inScope.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(inScope)
            : inScope;
        if (checker.getDeclaredTypeOfSymbol(declaredSymbol) !== objectType) {
          return null;
        }
        const property = checker.getPropertyOfType(objectType, propertyName);
        if (!property) {
          return null;
        }
        const declared = checker.getTypeOfSymbolAtLocation(
          property,
          tsObjectNode,
        );
        if (
          !sameKeySpace(
            classifyDiscriminant(declared),
            classifyDiscriminant(discriminantType),
          )
        ) {
          return null;
        }
        return `${printed}['${propertyName}']`;
      } catch {
        return null;
      }
    }

    /**
     * Key type for the emitted `Record`. A discriminant whose own type prints
     * as a bare name already carries the union's identity, so that name is
     * kept; otherwise the fix reaches for the tag's declaring type before
     * settling for the resolved literal union (#1926).
     */
    function discriminantTypeText(
      type: ts.Type,
      discriminant: TSESTree.Node,
    ): string | null {
      let printed: string | null;
      try {
        // Pass the discriminant's TS node as the enclosing declaration so the
        // printer qualifies namespaced symbols to their scoped name at the fix
        // site rather than printing an ambiguous short name.
        const enclosing = esTreeNodeToTSNodeMap.get(discriminant);
        const text = checker.typeToString(type, enclosing);
        printed = text && text !== 'error' ? text : null;
      } catch {
        printed = null;
      }
      if (printed && BARE_TYPE_NAME.test(printed)) {
        return printed;
      }
      return indexedAccessTypeText(discriminant, type) ?? printed;
    }

    /**
     * `checker.typeToString()` prints a symbol's bare name with no regard for
     * whether that name resolves at the fix site (an unimported helper type
     * prints the same as an imported one), and exotic printer output can be
     * invalid in an annotation position. Shipping such an annotation breaks
     * the build, so the fix is gated on the synthesized text (a) parsing
     * standalone and (b) referencing only names in scope where the Record is
     * inserted. Failing the gate downgrades to the report-only path — the
     * plugin prefers a skipped fix over one that does not compile.
     */
    function validateAnnotation(
      annotationText: string,
      fixSite: TSESTree.Node,
    ): 'ok' | 'unparseable' | 'unresolvable' {
      const sourceFile = ts.createSourceFile(
        '__annotation__.ts',
        `type __T = ${annotationText};`,
        ts.ScriptTarget.Latest,
        true,
      );
      // parseDiagnostics is absent from the public SourceFile type but always
      // populated at runtime; a diagnostic here means the annotation cannot
      // ship (e.g. printer truncation, or an unparenthesized member shape the
      // union-wrapping heuristic does not recognize).
      const parseDiagnostics = (
        sourceFile as unknown as { parseDiagnostics?: readonly unknown[] }
      ).parseDiagnostics;
      if (!parseDiagnostics || parseDiagnostics.length > 0) {
        return 'unparseable';
      }

      const typeReferenceRoots = new Set<string>();
      const typeQueryRoots = new Set<string>();
      let hasImportType = false;
      const rootNameOf = (name: ts.EntityName): string => {
        let current: ts.EntityName = name;
        while (ts.isQualifiedName(current)) {
          current = current.left;
        }
        return current.text;
      };
      const collect = (node: ts.Node): void => {
        if (ts.isTypeReferenceNode(node)) {
          typeReferenceRoots.add(rootNameOf(node.typeName));
        } else if (ts.isTypeQueryNode(node)) {
          typeQueryRoots.add(rootNameOf(node.exprName));
        } else if (ts.isImportTypeNode(node)) {
          // `import("...").T` paths printed by the checker are absolute or
          // resolver-relative — never portable source text.
          hasImportType = true;
        }
        ts.forEachChild(node, collect);
      };
      collect(sourceFile);
      if (hasImportType) {
        return 'unresolvable';
      }

      // `Record` is the wrapper this rule itself emits — a TS lib global that
      // is present in any real project. The isolated single-file program a
      // RuleTester builds loads no lib files at all, so requiring it in scope
      // would falsely downgrade every fix under test.
      typeReferenceRoots.delete('Record');
      if (typeReferenceRoots.size === 0 && typeQueryRoots.size === 0) {
        return 'ok';
      }

      const tsFixSite = esTreeNodeToTSNodeMap.get(fixSite);
      if (!tsFixSite) {
        return 'unresolvable';
      }
      try {
        const namesInScope = (meaning: ts.SymbolFlags): Set<string> =>
          new Set(
            checker
              .getSymbolsInScope(tsFixSite, meaning)
              .map((symbol) => symbol.name),
          );
        if (typeReferenceRoots.size > 0) {
          const typeNames = namesInScope(
            ts.SymbolFlags.Type |
              ts.SymbolFlags.Namespace |
              ts.SymbolFlags.Alias,
          );
          for (const root of typeReferenceRoots) {
            if (!typeNames.has(root)) {
              return 'unresolvable';
            }
          }
        }
        if (typeQueryRoots.size > 0) {
          const valueNames = namesInScope(
            ts.SymbolFlags.Value | ts.SymbolFlags.Alias,
          );
          for (const root of typeQueryRoots) {
            if (!valueNames.has(root)) {
              return 'unresolvable';
            }
          }
        }
      } catch {
        return 'unresolvable';
      }
      return 'ok';
    }

    // ---- AST helpers --------------------------------------------------------

    /**
     * The expression an optional chain wraps: ESTree hangs a `ChainExpression`
     * above the OUTERMOST link of `a?.b`, so a shape test written against
     * `MemberExpression` sees a different node for a spelling that asks the same
     * question here. `?.` changes nothing this rule decides on shape — the
     * generated lookup copies the discriminant's source text verbatim
     * (`RESULT_BY_KIND[a?.b]`), so the optional link survives the fix intact, and
     * whether the chain can produce `undefined` is answered by the discriminant's
     * TYPE (`hasNullish`), never by its shape. Reading the raw node instead made
     * the narrowing carve-out unreachable and turned a `?.` on a discriminated
     * union into a false positive whose remedy does not compile (#1867).
     *
     * Only one unwrap is needed: inner links of the same chain are plain
     * `MemberExpression`s carrying `optional`, not nested `ChainExpression`s.
     */
    function unwrapChain(node: TSESTree.Node): TSESTree.Node {
      return node.type === AST_NODE_TYPES.ChainExpression
        ? node.expression
        : node;
    }

    /**
     * The link a chain-internal spelling wraps: `unwrapChain` for `?.`, plus the
     * `TSNonNullExpression` a `!` hangs around the link it asserts.
     *
     * Both wrappers sit between one link and the next while changing nothing a
     * walk down a chain is asking — `a!.b` and `a?.b` read the same property of
     * the same receiver as `a.b` — so a walk that stops at either one reports
     * the wrapper's own node type as its answer. `unwrapChain` stays the single
     * place that knows how `?.` is shaped; this composes with it so no walk
     * grows a second one (#1929).
     */
    function unwrapLink(node: TSESTree.Node): TSESTree.Node {
      let cur = unwrapChain(node);
      while (cur.type === AST_NODE_TYPES.TSNonNullExpression) {
        cur = unwrapChain(cur.expression);
      }
      return cur;
    }

    /**
     * Whether a discriminant expression is an identifier or a call-free member
     * chain rooted at one (safe to collapse repeated evaluations).
     *
     * The walk down the chain goes through `unwrapLink`, so a link spelled
     * `a?.b` or `a!.b` is read as the member access it is. Both are pure
     * property reads, so collapsing repeated evaluations of `flags?.tier` into
     * one lookup is exactly as safe as collapsing `flags.tier`, and the emitted
     * lookup copies the discriminant's source text verbatim so the spelling
     * survives the fix. Stopping at either wrapper answered "is this a member
     * chain?" with false and took the whole construct silent, while the switch
     * arm — which reads its discriminant through `unwrapChain` — reported and
     * fixed the same code: two arms disagreeing about one spelling of one
     * question (#1929).
     *
     * The OUTERMOST `!` is deliberately not stripped: `a.b!` asserts the
     * discriminant as a whole rather than a link inside it, and the name and
     * key-type derivations reach the member access through `unwrapChain`, so
     * admitting it here would emit a report no fix can serve.
     *
     * Whether the chain can yield `undefined` is decided by the discriminant's
     * TYPE (`hasNullish` routes it to the report-only path), never by its
     * shape. A computed link stays out: `a[i].b` re-reads `i`, which is the
     * evaluation this test exists to protect.
     */
    function isValidDiscriminant(node: TSESTree.Node): boolean {
      let cur: TSESTree.Node = unwrapChain(node);
      while (cur.type === AST_NODE_TYPES.MemberExpression) {
        if (cur.computed) {
          return false;
        }
        cur = unwrapLink(cur.object);
      }
      return cur.type === AST_NODE_TYPES.Identifier;
    }

    /**
     * Root of a member chain (`a.b.c` -> `a`, `this.a.b` -> `THIS_ROOT`).
     *
     * A `this`-rooted chain names its receiver with a keyword rather than a
     * binding, so it needs a sentinel to participate in root-keyed analysis at
     * all. `'this'` cannot collide with a real root: `this` is a reserved word,
     * so no identifier can ever carry that name.
     *
     * The descent goes through `unwrapLink`, because a root the walk cannot
     * name is a narrowing exemption that cannot fire: `switch (result!.kind)`
     * narrows its union exactly as `result.kind` does, so failing to reach
     * `result` reports a discriminated-union dispatch whose Record hoists
     * `result.data` out of the narrowing and does not compile (#1929).
     */
    function chainRootName(node: TSESTree.Node): string | null {
      let cur: TSESTree.Node = unwrapLink(node);
      while (cur.type === AST_NODE_TYPES.MemberExpression) {
        cur = unwrapLink(cur.object);
      }
      if (cur.type === AST_NODE_TYPES.ThisExpression) {
        return THIS_ROOT;
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
        return { kind: 'return', expr: stmt.argument, stmt };
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
          stmt,
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

    /**
     * Whether the subtree reads the receiver of the enclosing scope — the `this`
     * counterpart of `referencesIdentifier`. Nested `function`/class bodies are
     * skipped because their `this` is a different receiver, so a `this` inside
     * one is no more a read of the narrowed object than an identifier of the
     * same name declared in an inner scope would be.
     */
    function referencesThis(node: TSESTree.Node): boolean {
      let found = false;
      const visit = (n: unknown): void => {
        if (found || !n || typeof n !== 'object') {
          return;
        }
        const anyNode = n as Record<string, unknown> & { type?: string };
        if (typeof anyNode.type !== 'string') {
          return;
        }
        if (anyNode.type === AST_NODE_TYPES.ThisExpression) {
          found = true;
          return;
        }
        if (THIS_REBINDING_TYPES.has(anyNode.type)) {
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

    /**
     * Whether the subtree names an ECMA private member (`o.#f`, `#f in o`).
     * Such a name resolves only lexically inside the class body that declares
     * it, so text carrying one cannot be moved out of that body.
     */
    function referencesPrivateName(node: TSESTree.Node): boolean {
      let found = false;
      const visit = (n: unknown): void => {
        if (found || !n || typeof n !== 'object') {
          return;
        }
        const anyNode = n as Record<string, unknown> & { type?: string };
        if (typeof anyNode.type !== 'string') {
          return;
        }
        if (anyNode.type === AST_NODE_TYPES.PrivateIdentifier) {
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

    /**
     * Whether the ternary form's hoist would carry a branch value out of the
     * class body that gives it meaning.
     *
     * Only the ternary hoists: it inserts the `Record` before the enclosing
     * statement, and inside a class that statement can be the class declaration
     * itself (a field initializer or a `static` block has no statement of its
     * own inside the body). The lookup that replaces the construct stays put —
     * a `#private` discriminant is still read where it was written — but the
     * branch VALUES travel with the `Record`, and `this` or `#f` in one of them
     * does not resolve at module scope (TS18013/TS18016, and a `this` that is
     * no longer the instance). Values that name neither are free to move, so
     * the test is on what the hoisted text needs, not on where it started.
     */
    function hoistLeavesClassBody(
      node: TSESTree.Node,
      values: TSESTree.Expression[],
    ): boolean {
      let stmt: TSESTree.Node = node;
      let crossesClassBody = false;
      while (stmt.parent && !CONTAINER_TYPES.has(stmt.parent.type)) {
        stmt = stmt.parent;
        if (stmt.type === AST_NODE_TYPES.ClassBody) {
          crossesClassBody = true;
        }
      }
      if (!crossesClassBody) {
        return false;
      }
      return values.some(
        (value) => referencesThis(value) || referencesPrivateName(value),
      );
    }

    /**
     * Whether stepping from `child` up to `parent` crosses a boundary that
     * decides WHETHER — or how many times — the child is evaluated, or that
     * owns bindings the child may read.
     *
     * The question is about the child's POSITION, not the parent's type alone:
     * an `if` test, a `for` init and a `for…of` right-hand side are evaluated
     * exactly once, before control reaches the construct they head, so text
     * lifted out of them runs precisely when it used to. A while/do-while test
     * is re-evaluated per iteration, so it is a boundary like the bodies are.
     */
    function crossingGuardsEvaluation(
      child: TSESTree.Node,
      parent: TSESTree.Node,
    ): boolean {
      switch (parent.type) {
        case AST_NODE_TYPES.IfStatement:
          return parent.test !== child;
        case AST_NODE_TYPES.WhileStatement:
        case AST_NODE_TYPES.DoWhileStatement:
          return true;
        case AST_NODE_TYPES.ForStatement:
          return parent.init !== child;
        case AST_NODE_TYPES.ForInStatement:
        case AST_NODE_TYPES.ForOfStatement:
          return parent.right !== child;
        case AST_NODE_TYPES.LogicalExpression:
          // `&&`/`||`/`??` evaluate the right operand only for some values of
          // the left; the left operand always runs.
          return parent.right === child;
        case AST_NODE_TYPES.ConditionalExpression:
          return parent.test !== child;
        default:
          return false;
      }
    }

    /**
     * Whether the ternary form's hoist would carry the branch values across a
     * guard that decides whether they are evaluated, or out of a scope that
     * owns bindings they read.
     *
     * The hoist walk treats a braceless body as transparent — it stops only at
     * a `BlockStatement`/`Program`/`SwitchCase` — so `if (box) return kind ===
     * 'a' ? box.a.v : box.b.v;` lands the `Record` ABOVE the guard and
     * dereferences both values with the narrowing left behind (#1990). Braces
     * are what make the hoist safe: with them the walk stops inside the guarded
     * block, where the values are still narrowed and every loop binding is
     * still in scope, so the boundary test also cures the scope violation that
     * hoisting out of `for (const r of rows)` produces (TS2304).
     *
     * Nothing else sees this: the branch values are ordinary member reads, so
     * `EAGER_UNSAFE_NODES` passes them, and `isNarrowingExempt` inspects only
     * narrowing by the discriminant's own root, never narrowing applied by a
     * surrounding statement.
     */
    function hoistCrossesGuard(node: TSESTree.Node): boolean {
      let child: TSESTree.Node = node;
      while (child.parent && !CONTAINER_TYPES.has(child.parent.type)) {
        if (crossingGuardsEvaluation(child, child.parent)) {
          return true;
        }
        child = child.parent;
      }
      return false;
    }

    // ---- Name derivation ----------------------------------------------------

    function toUpperSnake(name: string): string {
      return name
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
    }

    /**
     * `RESULT_BY_<KEY>` for a discriminant, or why no such name is available.
     *
     * The trailing member property may be spelled as an ECMA private field
     * (`this.#tier`). `#tier` and a `private tier` declared on the same class
     * are the same privacy, they are mutually exclusive (`private #tier` is
     * TS18010), and the parser hands the name over with the `#` already
     * stripped — so the derivation has a perfectly ordinary identifier to work
     * with and both spellings arrive at the same `RESULT_BY_TIER`. Reading the
     * `#` spelling as "no name derivable" withheld the fix from it and reported
     * a reason that was false (#1941).
     *
     * The name is only a name: it is not the private member and does not read
     * it. A sibling public `tier` on the same class is a different member that
     * the fix neither reads nor shadows — the emitted lookup copies the
     * discriminant's source text verbatim, so `this.#tier` stays `this.#tier`.
     * What the two spellings do share is the derived constant, which is why the
     * name has to be claimed rather than merely tested against the source text:
     * two dispatches in one scope both emitting `const RESULT_BY_TIER` do not
     * compile (TS2451).
     */
    function deriveLookupName(
      discriminant: TSESTree.Node,
      fixScope: TSESTree.Node,
    ): NameDerivation {
      const target = unwrapChain(discriminant);
      let key: string | null = null;
      if (target.type === AST_NODE_TYPES.Identifier) {
        key = target.name;
      } else if (
        target.type === AST_NODE_TYPES.MemberExpression &&
        !target.computed &&
        (target.property.type === AST_NODE_TYPES.Identifier ||
          target.property.type === AST_NODE_TYPES.PrivateIdentifier)
      ) {
        key = target.property.name;
      }
      if (!key) {
        return { kind: 'underivable' };
      }
      const snake = toUpperSnake(key);
      if (!snake) {
        return { kind: 'underivable' };
      }
      const name = `RESULT_BY_${snake}`;
      // Conservative collision check: any textual occurrence of the name, or a
      // claim staked by an earlier dispatch in this file, blocks the autofix (a
      // false collision only downgrades to report-only).
      if (
        claimedNames.get(fixScope)?.has(name) ||
        new RegExp(`\\b${name}\\b`).test(sourceCode.getText())
      ) {
        return { kind: 'taken', name };
      }
      return { kind: 'ok', name };
    }

    /**
     * The node whose children the generated `const` joins — the scope its
     * binding lives in. A ternary hoists to the enclosing statement, so its
     * declaration lands beside that statement; every other form is replaced in
     * place, so the declaration lands beside the construct. A `const` written
     * into a `case` clause is scoped to the whole `switch` block, so the clause
     * answers with the statement that owns that block.
     */
    function fixScopeOf(node: TSESTree.Node, form: Analysis['form']) {
      let stmt: TSESTree.Node = node;
      if (form === 'expr') {
        while (stmt.parent && !CONTAINER_TYPES.has(stmt.parent.type)) {
          stmt = stmt.parent;
        }
      }
      const container = stmt.parent ?? stmt;
      return container.type === AST_NODE_TYPES.SwitchCase
        ? container.parent ?? container
        : container;
    }

    // ---- Fix construction ---------------------------------------------------

    function formatKey(key: LiteralKey): string {
      if (key.sourceText !== undefined) {
        // Computed key preserving the constant reference the case tested on.
        // Type-safe by construction: the fix is reached only after the checker
        // resolved this expression to a string/number *literal* type, so the
        // computed key is a literal key and the Record stays exhaustive.
        return `[${key.sourceText}]`;
      }
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
      entries: Entry[],
      baseIndent: string,
    ): string {
      const lines = entries.flatMap((e) => {
        const hosted = (e.leadingComments ?? []).map(
          (comment) => `${baseIndent}  ${comment}`,
        );
        const trailing =
          e.trailingComments && e.trailingComments.length > 0
            ? ` ${e.trailingComments.join(' ')}`
            : '';
        hosted.push(
          `${baseIndent}  ${formatKey(e.key)}: ${e.valueText},${trailing}`,
        );
        return hosted;
      });
      return [
        `const ${name}: Record<${dText}, ${vText}> = {`,
        ...lines,
        `${baseIndent}};`,
      ].join('\n');
    }

    // ---- Comment hosting ----------------------------------------------------

    /**
     * A branch's value statement (or ternary value expression), used to decide
     * which generated map entry hosts the comments attributed to that branch.
     * `entryCount > 1` marks a grouped-case branch that expands into several
     * entries — a line-targeted directive cannot cover all of them at once.
     */
    type CommentAnchor = {
      range: TSESTree.Range;
      startLine: number;
      endLine: number;
      entryIndex: number;
      entryCount: number;
    };

    /**
     * Decides where every comment inside the replaced construct lands on the
     * generated Record, mutating `entries` with the hosted text. Comments
     * inside a carried span (a branch value expression, the discriminant, the
     * assignment target) survive verbatim inside the copied text; comments
     * inside a dropped span (an unreachable default/tail) die together with
     * the code they annotate, which is not an orphaning. Every other comment
     * must be hosted onto a map entry — leading comments go on the line(s)
     * directly above the entry, same-line trailing comments append after it.
     * Returns false when a comment cannot be hosted without changing what it
     * annotates or suppresses; the caller then withholds the autofix so a
     * directive is never silently deleted or retargeted.
     */
    function planCommentHosting(args: {
      container: TSESTree.Node;
      carriedSpans: TSESTree.Range[];
      droppedSpans: TSESTree.Range[];
      anchors: CommentAnchor[];
      entries: Entry[];
    }): boolean {
      const { container, carriedSpans, droppedSpans, anchors, entries } = args;
      const ordered = [...anchors].sort((a, b) => a.range[0] - b.range[0]);
      const hostLeading = (entry: Entry, text: string): void => {
        entry.leadingComments = [...(entry.leadingComments ?? []), text];
      };
      const hostTrailing = (entry: Entry, text: string): void => {
        entry.trailingComments = [...(entry.trailingComments ?? []), text];
      };

      for (const comment of sourceCode.getCommentsInside(container)) {
        const [cStart, cEnd] = comment.range;
        const within = (spans: TSESTree.Range[]): boolean =>
          spans.some(([start, end]) => cStart >= start && cEnd <= end);
        if (within(carriedSpans) || within(droppedSpans)) {
          continue;
        }
        const kind = directiveKindOf(comment);
        if (kind === 'range') {
          return false;
        }
        const text = sourceCode.getText(comment);

        // Same-line trailing (`doThing(); // note`): append to the entry line
        // so an `eslint-disable-line` keeps suppressing the line its value
        // lands on. The last matching anchor wins so a comment trailing two
        // same-line statements attaches to the nearer one.
        const trailingCandidates = ordered.filter(
          (anchor) =>
            anchor.endLine === comment.loc.start.line &&
            cStart >= anchor.range[1],
        );
        const trailingAnchor =
          trailingCandidates[trailingCandidates.length - 1];
        if (trailingAnchor) {
          if (kind === 'next-line') {
            // A trailing disable-next-line targets whatever follows the
            // statement; the generated map has no equivalent following line.
            return false;
          }
          if (kind === 'own-line' && trailingAnchor.entryCount > 1) {
            return false;
          }
          hostTrailing(entries[trailingAnchor.entryIndex], text);
          continue;
        }

        // A comment inside the value statement but outside the copied
        // expression (`return /* why */ value;`) belongs to that branch.
        const containingAnchor = ordered.find(
          (anchor) => cStart >= anchor.range[0] && cEnd <= anchor.range[1],
        );
        const leadingAnchor =
          containingAnchor ?? ordered.find((anchor) => anchor.range[0] >= cEnd);
        if (!leadingAnchor) {
          return false;
        }
        if (kind === 'next-line') {
          // Host a line-targeted directive only when it provably targeted the
          // branch's value line, so relocation preserves — never widens or
          // drops — the suppression.
          if (
            leadingAnchor.entryCount > 1 ||
            leadingAnchor.startLine !== comment.loc.end.line + 1
          ) {
            return false;
          }
        }
        hostLeading(entries[leadingAnchor.entryIndex], text);
      }
      return true;
    }

    // ---- Core analysis result ----------------------------------------------

    type Entry = {
      key: LiteralKey;
      valueText: string;
      /** Comments emitted on their own line(s) directly above the entry. */
      leadingComments?: string[];
      /** Comments appended after the entry's trailing comma. */
      trailingComments?: string[];
    };

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
      // True when a comment inside the construct cannot be hosted on the
      // generated Record without changing what it annotates or suppresses —
      // forces the report-only path rather than destroying the comment.
      commentBlocked: boolean;
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

    /**
     * Why the fix was withheld, in the words of the condition that actually
     * withheld it. Every arm here is a fact about the reported code, so a
     * reason that is emitted is a reason that is true — a report-only message
     * blaming the wrong condition sends the author to fix something that is not
     * broken (#1941).
     */
    function manualReason(flags: {
      fullCoverage: boolean;
      hasNullish: boolean;
      eagerSafe: boolean;
      canPlaceFix: boolean;
      hoistEscapesClass: boolean;
      hoistCrossesGuard: boolean;
      inStatementList: boolean;
      commentSafe: boolean;
      derivation: NameDerivation | null;
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
      if (flags.hoistEscapesClass) {
        return 'the Record would hoist outside the class body, where the branch values’ `this`/`#private` reads do not resolve; extract it manually inside the class';
      }
      if (flags.hoistCrossesGuard) {
        return 'the Record would hoist above the guard or loop that decides whether the branch values are evaluated, dropping their narrowing and any binding the guard scopes; add braces around the branch — or lift the guarded expression into its own statement — then convert';
      }
      if (!flags.inStatementList) {
        return 'the dispatch is the whole body of a braceless branch, where a declaration is not allowed; add braces around it, then convert';
      }
      if (!flags.commentSafe) {
        return 'a comment inside the dispatch cannot be carried onto the generated Record without changing what it annotates or suppresses — relocate the comment, then convert';
      }
      if (flags.derivation?.kind === 'taken') {
        return `the lookup name ${flags.derivation.name} is already taken in this file — rename the colliding binding, or write the Record manually`;
      }
      return 'no lookup name could be derived from the discriminant';
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
        commentBlocked,
      } = analysis;

      const eagerSafe = contributingValues.every(
        (expr) => !containsEagerUnsafe(expr),
      );

      const hoistEscapesClass =
        form === 'expr' && hoistLeavesClassBody(node, contributingValues);

      // Only the ternary hoists; every other form is replaced where it stands,
      // so no guard can be crossed.
      const crossesGuard = form === 'expr' && hoistCrossesGuard(node);

      // Every non-ternary form replaces the construct with a declaration plus a
      // statement, which needs a statement LIST to land in. As the sole body of
      // a braceless `if`/`else`/loop the construct sits where exactly one
      // statement is allowed and a lexical declaration is not allowed at all
      // (TS1156), so the fix waits for braces.
      const inStatementList =
        form === 'expr' ||
        (node.parent !== undefined &&
          STATEMENT_LIST_TYPES.has(node.parent.type));

      const fixScope = fixScopeOf(node, form);
      let derivation: NameDerivation | null = null;
      // Name derivation is only needed for the autofix path.
      if (
        fullCoverage &&
        !hasNullish &&
        eagerSafe &&
        canPlaceFix &&
        !hoistEscapesClass &&
        !crossesGuard &&
        inStatementList &&
        !commentBlocked
      ) {
        derivation = deriveLookupName(discriminantOf(node), fixScope);
      }

      if (derivation === null || derivation.kind !== 'ok') {
        context.report({
          node,
          messageId: 'preferMapManual',
          data: {
            reason: manualReason({
              fullCoverage,
              hasNullish,
              eagerSafe,
              canPlaceFix,
              hoistEscapesClass,
              hoistCrossesGuard: crossesGuard,
              inStatementList,
              commentSafe: !commentBlocked,
              derivation,
            }),
          },
        });
        return;
      }

      const lookupName = derivation.name;
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

      const verdict = validateAnnotation(
        `Record<${dText}, ${vText}>`,
        discriminantOf(node),
      );
      if (verdict !== 'ok') {
        context.report({
          node,
          messageId: 'preferMapManual',
          data: {
            reason:
              verdict === 'unparseable'
                ? 'the branch value type does not print as a parseable annotation — write the Record with an explicit type manually'
                : 'the annotation would name types that are not in scope at the fix site — import them or write the Record manually',
          },
        });
        return;
      }

      // Claimed only once every gate has passed, so a dispatch that ends up
      // report-only never blocks a later one from using the name.
      const claimed = claimedNames.get(fixScope) ?? new Set<string>();
      claimed.add(lookupName);
      claimedNames.set(fixScope, claimed);

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
     *
     * `this.obj.tag` narrows identically — the receiver is reached through a
     * keyword instead of a binding, which changes nothing about what the Record
     * would lose (hoisting `this.obj.data` out of the switch drops the narrowing
     * and the emitted code no longer typechecks), so a `this`-rooted chain is
     * matched against `this` reads in the kept branches.
     *
     * `obj?.tag` narrows identically too — TypeScript discriminates a union
     * through an optional chain — so the discriminant is unwrapped before its
     * shape is read. A nullable discriminant is exactly where `?.` gets written,
     * and reading the `ChainExpression` as "not a member access" skipped this
     * carve-out entirely (#1867). `obj.tag!` and `obj!.tag` are the same access
     * under an assertion and are unwrapped for the same reason: a carve-out
     * that a spelling can switch off is a carve-out for one spelling (#1929).
     */
    function isNarrowingExempt(
      discriminant: TSESTree.Node,
      keptValues: TSESTree.Expression[],
    ): boolean {
      const chain = unwrapLink(discriminant);
      if (chain.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }
      const root = chainRootName(chain);
      if (!root) {
        return false;
      }
      const readsRoot =
        root === THIS_ROOT
          ? referencesThis
          : (value: TSESTree.Expression) => referencesIdentifier(value, root);
      return keptValues.some(readsRoot);
    }

    // ---- Switch form --------------------------------------------------------

    function handleSwitch(node: TSESTree.SwitchStatement): void {
      // Parse cases into branches, grouping empty-consequent fallthrough cases
      // onto the following case's body.
      type ParsedBranch = {
        tests: (TSESTree.Node | null)[];
        value: BranchValue | null;
        // The case clause holding the consequent — the source region a
        // dropped default's comments legitimately die with.
        caseNode: TSESTree.SwitchCase;
      };
      const parsed: ParsedBranch[] = [];
      let pending: (TSESTree.Node | null)[] = [];
      for (const c of node.cases) {
        if (c.consequent.length === 0) {
          pending.push(c.test);
          continue;
        }
        const value = extractBranchValue(c.consequent);
        parsed.push({ tests: [...pending, c.test], value, caseNode: c });
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
      let defaultCaseNode: TSESTree.SwitchCase | null = null;
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
          defaultCaseNode = branch.caseNode;
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

      // Comment hosting only gates the autofix path (partial coverage is
      // already report-only), so it is planned for full coverage alone.
      let commentBlocked = false;
      if (coverage.fullCoverage) {
        const tailUsed = coverage.remainingCount === 1 && defaultVal !== null;
        const carriedSpans: TSESTree.Range[] = [node.discriminant.range];
        const droppedSpans: TSESTree.Range[] = [];
        const anchors: CommentAnchor[] = [];
        let entryIndex = 0;
        for (const branch of explicit) {
          carriedSpans.push(branch.value.expr.range);
          anchors.push({
            range: branch.value.stmt.range,
            startLine: branch.value.stmt.loc.start.line,
            endLine: branch.value.stmt.loc.end.line,
            entryIndex,
            entryCount: branch.keys.length,
          });
          entryIndex += branch.keys.length;
        }
        if (kind === 'assign' && explicit[0].value.kind === 'assign') {
          carriedSpans.push(explicit[0].value.target.range);
        }
        if (tailUsed && defaultVal) {
          carriedSpans.push(defaultVal.expr.range);
          anchors.push({
            range: defaultVal.stmt.range,
            startLine: defaultVal.stmt.loc.start.line,
            endLine: defaultVal.stmt.loc.end.line,
            entryIndex: coverage.entries.length - 1,
            entryCount: 1,
          });
        } else if (defaultCaseNode) {
          // The unreachable default is deleted wholesale; its comments —
          // including any directly above the `default:` label — annotate
          // deleted code and die with it.
          const caseIndex = node.cases.indexOf(defaultCaseNode);
          const droppedStart =
            caseIndex > 0
              ? node.cases[caseIndex - 1].range[1]
              : node.discriminant.range[1];
          droppedSpans.push([droppedStart, defaultCaseNode.range[1]]);
        }
        commentBlocked = !planCommentHosting({
          container: node,
          carriedSpans,
          droppedSpans,
          anchors,
          entries: coverage.entries,
        });
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
        commentBlocked,
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

      let commentBlocked = false;
      if (coverage.fullCoverage) {
        const tailUsed = coverage.remainingCount === 1;
        const carriedSpans: TSESTree.Range[] = [
          head.discNode.range,
          ...links.map((l) => l.expr.range),
        ];
        const droppedSpans: TSESTree.Range[] = [];
        const anchors: CommentAnchor[] = links.map((l, i) => ({
          range: l.expr.range,
          startLine: l.expr.loc.start.line,
          endLine: l.expr.loc.end.line,
          entryIndex: i,
          entryCount: 1,
        }));
        if (tailUsed) {
          carriedSpans.push(tailExpr.range);
          anchors.push({
            range: tailExpr.range,
            startLine: tailExpr.loc.start.line,
            endLine: tailExpr.loc.end.line,
            entryIndex: coverage.entries.length - 1,
            entryCount: 1,
          });
        } else {
          // The unreachable tail is deleted; comments between the last kept
          // consequent and the tail's end annotate deleted code.
          droppedSpans.push([
            links[links.length - 1].expr.range[1],
            tailExpr.range[1],
          ]);
        }
        commentBlocked = !planCommentHosting({
          container: node,
          carriedSpans,
          droppedSpans,
          anchors,
          entries: coverage.entries,
        });
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
        commentBlocked,
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
      // The final else statement/block and the end of the consequent before
      // it — the source region a dropped tail's comments die with.
      let tailNode: TSESTree.Statement | null = null;
      let tailPrevEnd = 0;
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
        tailNode = alt;
        tailPrevEnd = cur.consequent.range[1];
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

      let commentBlocked = false;
      if (coverage.fullCoverage) {
        const tailUsed = coverage.remainingCount === 1 && tail !== null;
        const carriedSpans: TSESTree.Range[] = [head.discNode.range];
        const droppedSpans: TSESTree.Range[] = [];
        const anchors: CommentAnchor[] = [];
        links.forEach((link, i) => {
          carriedSpans.push(link.value.expr.range);
          anchors.push({
            range: link.value.stmt.range,
            startLine: link.value.stmt.loc.start.line,
            endLine: link.value.stmt.loc.end.line,
            entryIndex: i,
            entryCount: 1,
          });
        });
        if (kind === 'assign' && links[0].value.kind === 'assign') {
          carriedSpans.push(links[0].value.target.range);
        }
        if (tailUsed && tail) {
          carriedSpans.push(tail.expr.range);
          anchors.push({
            range: tail.stmt.range,
            startLine: tail.stmt.loc.start.line,
            endLine: tail.stmt.loc.end.line,
            entryIndex: coverage.entries.length - 1,
            entryCount: 1,
          });
        } else if (tailNode) {
          // The unreachable else is deleted; comments from the last kept
          // consequent through the else's end annotate deleted code.
          droppedSpans.push([tailPrevEnd, tailNode.range[1]]);
        }
        commentBlocked = !planCommentHosting({
          container: node,
          carriedSpans,
          droppedSpans,
          anchors,
          entries: coverage.entries,
        });
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
        commentBlocked,
      });
    }

    return {
      SwitchStatement: handleSwitch,
      ConditionalExpression: handleConditional,
      IfStatement: handleIf,
    } as TSESLint.RuleListener;
  },
});
