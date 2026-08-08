import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { visitorKeys } from '@typescript-eslint/visitor-keys';
import * as ts from 'typescript';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import { planOrphanedImportRemoval, TextRange } from '../utils/importRemoval';

type MessageIds = 'redundantAnnotationAndAssertion';

/** A redundant annotation found during traversal, held until `Program:exit`. */
type CandidateSite = {
  reportNode: TSESTree.Node;
  /** The slice this site's fix deletes. */
  removal: TextRange;
  /** The shared type name, rendered into the message. */
  matchingType: string;
};

/**
 * Type string formatting flags chosen to keep comparisons stable and predictable.
 * - NoTruncation avoids `...` elisions that can hide important differences.
 * - WriteArrayAsGenericType normalizes arrays to `Array<T>` for consistent output.
 * - UseFullyQualifiedType reduces ambiguity from locally-imported type names.
 * - UseStructuralFallback keeps output meaningful when a nominal name is unavailable.
 *
 * Resolved on first use rather than at module load: the plugin barrel imports
 * every rule eagerly, and the compiler package root does not expose this enum on
 * all installed TypeScript releases (TypeScript 7 exports only a version stub),
 * so dereferencing it at module scope makes the whole plugin fail to load rather
 * than merely disabling this type-aware rule. Every call site sits behind a
 * `parserServices.program` guard, so the enum is present whenever this runs.
 */
let typeFormatFlagsCache: number | undefined;
function typeFormatFlags(): number {
  typeFormatFlagsCache ??=
    ts.TypeFormatFlags.NoTruncation |
    ts.TypeFormatFlags.WriteArrayAsGenericType |
    ts.TypeFormatFlags.UseFullyQualifiedType |
    ts.TypeFormatFlags.UseStructuralFallback;
  return typeFormatFlagsCache;
}

function extractAssertionTypeNode(
  expression: TSESTree.Node | null | undefined,
): TSESTree.TypeNode | null {
  if (!expression) return null;

  if (expression.type === AST_NODE_TYPES.TSAsExpression) {
    return expression.typeAnnotation;
  }

  if (expression.type === AST_NODE_TYPES.TSTypeAssertion) {
    return expression.typeAnnotation;
  }

  return null;
}

function isTraversalBoundary(node: TSESTree.Node): boolean {
  /**
   * Nested functions/classes have their own return semantics; inner returns should not
   * influence the outer function's return-type check.
   */
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.MethodDefinition ||
    node.type === AST_NODE_TYPES.ClassDeclaration ||
    node.type === AST_NODE_TYPES.ClassExpression
  );
}

/**
 * A returned expression that carries a type assertion, paired with the
 * assertion's type node. The expression is kept alongside the type because
 * deciding whether the annotation is redundant needs to know what the function
 * returns, not merely what it asserts.
 */
type ReturnAssertionSite = {
  assertion: TSESTree.TypeNode;
  expression: TSESTree.Expression;
};

function recordReturnStatement(
  node: TSESTree.ReturnStatement,
  assertionSites: ReturnAssertionSite[],
): void {
  if (!node.argument) return;

  const assertion = extractAssertionTypeNode(node.argument);
  if (assertion) assertionSites.push({ assertion, expression: node.argument });
}

function addChildNodesToStack(
  node: TSESTree.Node,
  stack: TSESTree.Node[],
): void {
  const keys = visitorKeys[node.type];
  if (!keys) return;

  for (const key of keys) {
    const value = (node as unknown as Record<string, unknown>)[key];

    if (Array.isArray(value)) {
      for (const element of value) {
        if (ASTHelpers.isNode(element)) {
          stack.push(element);
        }
      }
      continue;
    }

    if (ASTHelpers.isNode(value)) {
      stack.push(value);
    }
  }
}

function collectReturnInfo(body: TSESTree.BlockStatement): {
  assertionSites: ReturnAssertionSite[];
  returnCount: number;
} {
  const assertionSites: ReturnAssertionSite[] = [];
  let returnCount = 0;
  const stack: TSESTree.Node[] = [...body.body];

  while (stack.length) {
    const current = stack.pop() as TSESTree.Node;

    if (current.type === AST_NODE_TYPES.ReturnStatement) {
      returnCount += 1;
      recordReturnStatement(current, assertionSites);
      continue;
    }

    if (isTraversalBoundary(current)) continue;

    addChildNodesToStack(current, stack);
  }

  return { assertionSites, returnCount };
}

function findTypeAnnotationStart(
  typeAnnotation: TSESTree.TSTypeAnnotation,
  sourceCode: TSESLint.SourceCode,
): number {
  const start = typeAnnotation.range[0];
  const text = sourceCode.getText();

  let removalStart = start;

  /**
   * Scan backward to remove any whitespace before `: Type`, but avoid consuming tokens
   * that belong to the declared name (e.g. `!` definite assignment assertions or `?`
   * optional markers).
   */
  for (let i = start - 1; i >= 0; i -= 1) {
    const char = text.charAt(i);

    if (char === '\n' || char === '\r') break;
    if (char === '?' || char === '!') {
      removalStart = i + 1;
      break;
    }
    if (!/\s/.test(char)) {
      removalStart = i + 1;
      break;
    }
    removalStart = i;
  }

  return removalStart;
}

/**
 * The slice a fix deletes to drop `typeAnnotation`: the `:` and the whitespace
 * separating it from the declared name go with the type.
 */
function annotationRemovalRange(
  typeAnnotation: TSESTree.TSTypeAnnotation,
  sourceCode: TSESLint.SourceCode,
): TextRange {
  return [
    findTypeAnnotationStart(typeAnnotation, sourceCode),
    typeAnnotation.range[1],
  ];
}

function typeText(type: ts.Type, checker: ts.TypeChecker): string {
  return checker.typeToString(type, undefined, typeFormatFlags());
}

function unwrapAlias(type: ts.Type, checker: ts.TypeChecker): ts.Type {
  const aliasSymbol = (type as ts.Type & { aliasSymbol?: ts.Symbol })
    .aliasSymbol;
  if (!aliasSymbol) return type;

  if ((aliasSymbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const target = checker.getAliasedSymbol(aliasSymbol);
    return checker.getDeclaredTypeOfSymbol(target);
  }

  if ((aliasSymbol.flags & ts.SymbolFlags.TypeAlias) !== 0) {
    const aliasTypeArguments = (
      type as ts.Type & { aliasTypeArguments?: ts.Type[] }
    ).aliasTypeArguments;

    if (aliasTypeArguments?.length) {
      return checker.getApparentType(type);
    }

    return checker.getDeclaredTypeOfSymbol(aliasSymbol);
  }

  return type;
}

/**
 * Readonly-ness reaches a property symbol by two disjoint routes, and a key
 * built from only one of them equates shapes that differ:
 *
 * - A property *written* `readonly` (interface member, type-alias member, class
 *   field) carries the modifier on its declaration and no check flag.
 * - A property *synthesized* as readonly — an `as const` object literal, a
 *   `Readonly<T>` mapped type — has no declaration modifier and carries
 *   `CheckFlags.Readonly` instead.
 *
 * Reading only declarations makes `as const` compare equal to a mutable
 * annotation, and deleting that annotation changes the value's type (see #1883).
 *
 * `getCheckFlags` is not published in every TypeScript release's type
 * definitions, so it is reached through a guarded lookup: where it is absent the
 * key falls back to declaration modifiers alone, which is exactly the
 * information available without it. The enum is dereferenced here rather than at
 * module scope because the plugin barrel loads every rule eagerly and a missing
 * compiler export at module scope fails the whole plugin, not just this rule.
 */
function isReadonlyProperty(prop: ts.Symbol): boolean {
  const compiler = ts as unknown as {
    getCheckFlags?: (symbol: ts.Symbol) => number;
    CheckFlags?: { Readonly?: number };
  };
  const readonlyCheckFlag = compiler.CheckFlags?.Readonly;

  if (typeof compiler.getCheckFlags === 'function' && readonlyCheckFlag) {
    if ((compiler.getCheckFlags(prop) & readonlyCheckFlag) !== 0) return true;
  }

  return (prop.declarations ?? []).some(
    (declaration) =>
      (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Readonly) !==
      0,
  );
}

function formatPropertySignature(
  prop: ts.Symbol,
  parentType: ts.Type,
  checker: ts.TypeChecker,
): string | null {
  const declaration =
    prop.valueDeclaration ??
    prop.declarations?.[0] ??
    parentType.symbol?.valueDeclaration ??
    parentType.symbol?.declarations?.[0];
  if (!declaration) return null;

  const propType = checker.getTypeOfSymbolAtLocation(prop, declaration);
  const text = typeText(unwrapAlias(propType, checker), checker);
  const isOptional = (prop.getFlags() & ts.SymbolFlags.Optional) !== 0;
  const readonlyPrefix = isReadonlyProperty(prop) ? 'readonly ' : '';

  return `${readonlyPrefix}${prop.getName()}${isOptional ? '?' : ''}:${text}`;
}

function getFormattedTypeProperties(
  type: ts.Type,
  checker: ts.TypeChecker,
): string[] {
  return checker
    .getPropertiesOfType(type)
    .map((prop) => formatPropertySignature(prop, type, checker))
    .filter((entry): entry is string => Boolean(entry))
    .sort();
}

function getFormattedCallSignatures(
  type: ts.Type,
  checker: ts.TypeChecker,
): string[] {
  return checker
    .getSignaturesOfType(type, ts.SignatureKind.Call)
    .map((sig) => checker.signatureToString(sig, undefined, typeFormatFlags()))
    .sort();
}

function structuralKey(type: ts.Type, checker: ts.TypeChecker): string {
  const apparent = checker.getApparentType(type);
  const properties = getFormattedTypeProperties(apparent, checker);
  const signatures = getFormattedCallSignatures(apparent, checker);

  return `${properties.join('|')}::${signatures.join('|')}`;
}

type ParserServices = NonNullable<
  TSESLint.RuleContext<string, unknown[]>['parserServices']
>;

function getComparableType(
  typeNode: TSESTree.TypeNode,
  checker: ts.TypeChecker,
  services: ParserServices,
): ts.Type | null {
  const tsNode = services.esTreeNodeToTSNodeMap.get(typeNode);
  if (!ts.isTypeNode(tsNode)) return null;

  const type = checker.getTypeFromTypeNode(tsNode);
  const unwrapped = unwrapAlias(type, checker);

  return unwrapped;
}

type TypeRepresentations = {
  annotationText: string;
  assertionText: string;
  annotationCanonical: string;
  assertionCanonical: string;
  annotationStructural: string;
  assertionStructural: string;
};

/**
 * Generate multiple string representations of both types for comparison.
 * Multiple strategies are needed because TypeScript types can be semantically
 * identical yet have different string representations depending on:
 * - Type aliases (MyType vs the underlying type) via canonical/NoTypeReduction
 * - Type formatting options (fully qualified vs relative) via default text
 * - Structural equivalence (different names, same shape) via structural key
 */
function getTypeRepresentations(
  annotationType: ts.Type,
  assertionType: ts.Type,
  checker: ts.TypeChecker,
): TypeRepresentations {
  return {
    annotationText: typeText(annotationType, checker),
    assertionText: typeText(assertionType, checker),
    annotationCanonical: checker.typeToString(
      annotationType,
      undefined,
      typeFormatFlags() | ts.TypeFormatFlags.NoTypeReduction,
    ),
    assertionCanonical: checker.typeToString(
      assertionType,
      undefined,
      typeFormatFlags() | ts.TypeFormatFlags.NoTypeReduction,
    ),
    annotationStructural: structuralKey(annotationType, checker),
    assertionStructural: structuralKey(assertionType, checker),
  };
}

function areTypesIdentical(
  annotationType: ts.Type,
  assertionType: ts.Type,
  checker: ts.TypeChecker,
): boolean {
  if (annotationType === assertionType) return true;

  const isTypeIdenticalTo = (
    checker as {
      isTypeIdenticalTo?: (a: ts.Type, b: ts.Type) => boolean;
    }
  ).isTypeIdenticalTo;

  /** Guard the internal TypeScript helper; newer compiler versions may drop or change it. */
  if (typeof isTypeIdenticalTo !== 'function') {
    return false;
  }

  return isTypeIdenticalTo(annotationType, assertionType) === true;
}

function areTypesAssignableBothWays(
  annotationType: ts.Type,
  assertionType: ts.Type,
  checker: ts.TypeChecker,
): boolean {
  const isTypeAssignableTo = (
    checker as {
      isTypeAssignableTo?: (a: ts.Type, b: ts.Type) => boolean;
    }
  ).isTypeAssignableTo;

  /** Guard for checker.isTypeAssignableTo which may be absent from some d.ts versions. */
  if (typeof isTypeAssignableTo !== 'function') {
    return false;
  }

  return (
    isTypeAssignableTo(annotationType, assertionType) &&
    isTypeAssignableTo(assertionType, annotationType)
  );
}

function doTypeTextsMatch(representations: TypeRepresentations): boolean {
  const {
    annotationText,
    assertionText,
    annotationCanonical,
    assertionCanonical,
    annotationStructural,
    assertionStructural,
  } = representations;

  return (
    annotationText === assertionText ||
    annotationCanonical === assertionCanonical ||
    annotationStructural === assertionStructural
  );
}

function selectMatchingTypeRepresentation(
  representations: TypeRepresentations,
): string {
  return representations.annotationText;
}

/**
 * Checks if two types are effectively equal for the purpose of identifying redundant assertions.
 * Types are effectively equal if they are:
 * 1. Identical according to TypeScript's internal identity check.
 * 2. Or, they are assignable both ways AND share at least one string representation
 *    (canonical, structural, or default formatting).
 */
function areTypesEffectivelyEqual(
  annotationType: ts.Type,
  assertionType: ts.Type,
  representations: TypeRepresentations,
  checker: ts.TypeChecker,
): boolean {
  const identical = areTypesIdentical(annotationType, assertionType, checker);

  if (identical) {
    return true;
  }

  const assignableBothWays = areTypesAssignableBothWays(
    annotationType,
    assertionType,
    checker,
  );
  const textMatches = doTypeTextsMatch(representations);

  return assignableBothWays && textMatches;
}

/**
 * Compare annotation and assertion types across identity, assignability, and
 * multiple textual forms so equivalent aliases still count as redundant.
 * @param annotation The type annotation node to compare.
 * @param assertion The type assertion node to compare.
 * @param checker The TypeScript type checker.
 * @param services The parser services.
 * @returns The matching type string if the types are effectively equal, null otherwise.
 */
function haveMatchingTypes(
  annotation: TSESTree.TypeNode,
  assertion: TSESTree.TypeNode,
  checker: ts.TypeChecker,
  services: ParserServices,
): string | null {
  const annotationType = getComparableType(annotation, checker, services);
  const assertionType = getComparableType(assertion, checker, services);

  if (!annotationType || !assertionType) return null;

  const representations = getTypeRepresentations(
    annotationType,
    assertionType,
    checker,
  );

  if (
    !areTypesEffectivelyEqual(
      annotationType,
      assertionType,
      representations,
      checker,
    )
  ) {
    return null;
  }

  return selectMatchingTypeRepresentation(representations);
}

type AnnotatedFunction =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.MethodDefinition;

function getReturnAssertionSite(
  node: AnnotatedFunction,
): ReturnAssertionSite | null {
  const value =
    node.type === AST_NODE_TYPES.MethodDefinition ? node.value : node;

  const body = (
    value as {
      body: TSESTree.BlockStatement | TSESTree.Expression | null | undefined;
    }
  ).body;

  if (body?.type === AST_NODE_TYPES.BlockStatement) {
    const { assertionSites, returnCount } = collectReturnInfo(body);

    // Skip functions with multiple returns because different branches can assert different types.
    if (returnCount !== 1) return null;

    // Ensure the single return is the last statement in the function body
    // to avoid cases where an implicit undefined return exists.
    const lastStatement = body.body[body.body.length - 1];
    if (lastStatement?.type !== AST_NODE_TYPES.ReturnStatement) {
      return null;
    }

    return assertionSites[0] ?? null;
  }

  if (!body) return null;

  const assertion = extractAssertionTypeNode(body);

  return assertion ? { assertion, expression: body } : null;
}

/**
 * The identifiers that name `node`, in the AST. A self-reference inside the
 * function's own return expression resolves to one of these, whichever shape
 * the function is written in: a declaration's own name, a named function
 * expression's name, the variable or property an anonymous function is assigned
 * to, or a method's key.
 */
function ownerNameNodes(node: AnnotatedFunction): TSESTree.Node[] {
  if (node.type === AST_NODE_TYPES.MethodDefinition) {
    return node.computed ? [] : [node.key];
  }

  const names: TSESTree.Node[] = [];

  if (node.type !== AST_NODE_TYPES.ArrowFunctionExpression && node.id) {
    names.push(node.id);
  }

  const parent = node.parent;

  if (
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    names.push(parent.id);
  }

  if (
    (parent?.type === AST_NODE_TYPES.PropertyDefinition ||
      parent?.type === AST_NODE_TYPES.Property) &&
    !parent.computed
  ) {
    names.push(parent.key);
  }

  return names;
}

/**
 * A binding is identified by the declarations behind its symbol rather than by
 * the symbol object. Reading `obj.build` yields a *clone* of the symbol declared
 * by `build: () => {}` — widening an object literal's type rebuilds its property
 * symbols — so symbol identity reports a self-reference as unrelated. The clone
 * keeps the original declaration, which therefore is the stable key.
 */
function declarationsOfSymbol(symbol: ts.Symbol): ts.Declaration[] {
  return symbol.declarations ?? [];
}

function declaredAt(
  nodes: TSESTree.Node[],
  checker: ts.TypeChecker,
  services: ParserServices,
): Set<ts.Declaration> {
  const declarations = new Set<ts.Declaration>();

  for (const node of nodes) {
    const tsNode = services.esTreeNodeToTSNodeMap.get(node);
    const symbol = tsNode ? checker.getSymbolAtLocation(tsNode) : undefined;
    if (!symbol) continue;

    for (const declaration of declarationsOfSymbol(symbol)) {
      declarations.add(declaration);
    }
  }

  return declarations;
}

/**
 * Every binding the returned expression reads. Resolving through the checker
 * rather than matching identifier text keeps a shadowing inner declaration of
 * the same name from reading as a self-reference.
 */
function referencedDeclarationsOf(
  expression: TSESTree.Expression,
  checker: ts.TypeChecker,
  services: ParserServices,
): Set<ts.Declaration> {
  const declarations = new Set<ts.Declaration>();
  const root = services.esTreeNodeToTSNodeMap.get(expression);
  if (!root) return declarations;

  /**
   * Only a VALUE read can make return-type inference circular.
   *
   * The returned expression subtree contains the assertion's own type node —
   * `<Status>{…}` and `expr as Status` both carry `Status` inside it — so
   * resolving every identifier would count that type reference as a
   * self-reference whenever a binding and a type share a name
   * (`type Status = …; const Status = (): Status => <Status>{…}`). TypeScript
   * resolves a type annotation without needing any function's return type, so
   * such a reference can never close the cycle.
   *
   * `typeof f` is the one type-position spelling that reads a VALUE, and it does
   * depend on `f`'s return type, so it counts. Checking it before the general
   * type-node test is what lets it through — a type query is itself a type node.
   */
  const readsAValue = (identifier: ts.Node): boolean => {
    let current: ts.Node | undefined = identifier.parent;
    while (current) {
      if (ts.isTypeQueryNode(current)) return true;
      if (ts.isTypeNode(current)) return false;
      if (current === root) return true;
      current = current.parent;
    }
    return true;
  };

  const visit = (tsNode: ts.Node): void => {
    if (ts.isIdentifier(tsNode) && readsAValue(tsNode)) {
      const parent = tsNode.parent;
      // A shorthand property's own identifier resolves to the property, so the
      // binding it abbreviates has to be asked for by name.
      const symbol =
        parent && ts.isShorthandPropertyAssignment(parent)
          ? checker.getShorthandAssignmentValueSymbol(parent)
          : checker.getSymbolAtLocation(tsNode);

      if (symbol) {
        for (const declaration of declarationsOfSymbol(symbol)) {
          declarations.add(declaration);
        }
      }
    }

    ts.forEachChild(tsNode, visit);
  };

  visit(root);

  return declarations;
}

function intersects<T>(a: Set<T>, b: Set<T>): boolean {
  for (const entry of a) {
    if (b.has(entry)) return true;
  }

  return false;
}

/**
 * A return-position candidate, retained so the batch can tell which annotations
 * are load-bearing for one another's inference.
 */
type ReturnCandidate = {
  site: CandidateSite;
  owners: Set<ts.Declaration>;
  references: Set<ts.Declaration>;
};

/**
 * The candidates whose annotation must survive because removing it would make
 * the function's return type circular.
 *
 * A function that reaches itself through its own return expression can only be
 * typed from its annotation: dropping it leaves TypeScript inferring the return
 * type from an expression whose type depends on that same return type (TS7023),
 * or — where the assertion pins enough of the shape to break the cycle —
 * silently widening a member to `any`. That circularity is invisible to the
 * equality test that proves redundancy, because the equality only holds *while*
 * the annotation is there.
 *
 * The relation is between candidates rather than within one, because this
 * rule's fixes ship as a single batch: two mutually recursive functions each
 * type fine while the other keeps its annotation, and become circular only when
 * both annotations go in the same pass.
 *
 * Peeling candidates that cannot participate in a cycle — nothing in the batch
 * references them, or they reference nothing in the batch — leaves the ones
 * that do. The remainder is an over-approximation (a chain running between two
 * cycles survives the peel), which costs a missed report rather than a broken
 * fix.
 */
function findCircularReturnCandidates(
  candidates: ReturnCandidate[],
): Set<CandidateSite> {
  let pool = candidates;

  for (;;) {
    const owners = new Set<ts.Declaration>();
    const references = new Set<ts.Declaration>();

    for (const candidate of pool) {
      for (const owner of candidate.owners) owners.add(owner);
      for (const reference of candidate.references) references.add(reference);
    }

    const next = pool.filter(
      (candidate) =>
        intersects(candidate.references, owners) &&
        intersects(candidate.owners, references),
    );

    if (next.length === pool.length) {
      return new Set(next.map((candidate) => candidate.site));
    }

    pool = next;
  }
}

export const noRedundantAnnotationAssertion = createRule<[], MessageIds>({
  name: 'no-redundant-annotation-assertion',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow combining a type annotation with an identical type assertion on the same value. Keep a single source of truth to avoid redundant type declarations that can drift apart.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      redundantAnnotationAndAssertion:
        'What\'s wrong: Type "{{type}}" is declared twice: once as an annotation and again as an assertion. \u2192 Why it matters: If you later update the assertion but forget the annotation (or vice-versa), they can drift apart and cause TypeScript to silently bypass type checks or lead to incorrect runtime assumptions. \u2192 How to fix: Remove the annotation and keep the assertion to maintain a single source of truth.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode =
      (context as typeof context & { sourceCode?: TSESLint.SourceCode })
        .sourceCode ?? context.getSourceCode?.();
    const parserServices = sourceCode?.parserServices ?? context.parserServices;

    if (
      !sourceCode ||
      !parserServices?.program ||
      !parserServices.esTreeNodeToTSNodeMap ||
      !parserServices.tsNodeToESTreeNodeMap
    ) {
      /* istanbul ignore next -- without type information the rule cannot run */
      return {};
    }

    const checker = parserServices.program.getTypeChecker();

    /**
     * Reporting is deferred to `Program:exit` because an import is unbound only
     * once no reference to it survives the fix, and a file where two annotations
     * name the same imported type strips both in a single pass. Judging each
     * removal alone sees the sibling annotation still standing, concludes the
     * binding is alive, and leaves the import stranded with no later pass to
     * notice — this rule's own reports are resolved by the fix, so nothing
     * re-reports the debt.
     */
    const sites: CandidateSite[] = [];

    /** Return-position sites, kept with the symbols that decide circularity. */
    const returnCandidates: ReturnCandidate[] = [];

    /**
     * Suppression is applied to reports after a rule emits them, so a suppressed
     * site keeps its annotation while losing its fix. Counting its removal
     * toward orphanhood would unbind an import the surviving text still spells,
     * trading an unused import for a dangling type.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    function collectIfRedundant(
      annotation: TSESTree.TSTypeAnnotation,
      assertion: TSESTree.TypeNode,
      reportNode: TSESTree.Node,
      fixerTarget: TSESTree.TSTypeAnnotation,
    ): CandidateSite | null {
      const matchingType = haveMatchingTypes(
        annotation.typeAnnotation,
        assertion,
        checker,
        parserServices as ParserServices,
      );

      if (!matchingType) return null;

      const site: CandidateSite = {
        reportNode,
        removal: annotationRemovalRange(fixerTarget, sourceCode),
        matchingType,
      };
      sites.push(site);

      return site;
    }

    /**
     * The one gate every return-position visitor passes through, so a declined
     * return annotation loses both its report and its fix whichever of the four
     * function shapes carries it.
     */
    function collectReturnSite(
      node: AnnotatedFunction,
      annotation: TSESTree.TSTypeAnnotation,
      reportNode: TSESTree.Node,
    ): void {
      const assertionSite = getReturnAssertionSite(node);
      if (!assertionSite) return;

      const owners = declaredAt(
        ownerNameNodes(node),
        checker,
        parserServices as ParserServices,
      );
      const references = referencedDeclarationsOf(
        assertionSite.expression,
        checker,
        parserServices as ParserServices,
      );

      // A function reached from its own return expression is typed by its
      // annotation and nothing else; removing it does not simplify the code, it
      // changes the inferred type, so the site is not a finding at all.
      if (intersects(owners, references)) return;

      const site = collectIfRedundant(
        annotation,
        assertionSite.assertion,
        reportNode,
        annotation,
      );

      if (site) returnCandidates.push({ site, owners, references });
    }

    /**
     * The sites whose fixes actually ship. A site is excluded when its report
     * will be suppressed, or when its own removal orphans something the helper
     * cannot rewrite — a local alias, an interface, a type parameter. Deleting a
     * declaration is a materially riskier edit than dropping an import
     * specifier, and the author is better placed to decide whether the type
     * should go or be used elsewhere.
     *
     * Screening individually before batching keeps one unfixable site from
     * vetoing the rest: orphanhood grows monotonically with the removed set, so
     * a site that cannot be planned alone can only ever poison the batch.
     */
    function selectFixableSites(candidates: CandidateSite[]): CandidateSite[] {
      return candidates.filter(
        (site) =>
          !isReportSuppressed(site.reportNode) &&
          planOrphanedImportRemoval(sourceCode, [site.removal]) !== null,
      );
    }

    return {
      'Program:exit'() {
        if (sites.length === 0) return;

        // Mutual recursion only becomes circular once every annotation in the
        // cycle is gone, which is exactly what this rule's single batched fix
        // does, so the check has to see the whole batch.
        const circular = findCircularReturnCandidates(returnCandidates);
        const reportable = sites.filter((site) => !circular.has(site));
        if (reportable.length === 0) return;

        const fixable = selectFixableSites(reportable);
        const removals = fixable.map((site) => site.removal);
        // One plan over every surviving removal: an import referenced solely by
        // annotations that all go in this pass is orphaned by their union, even
        // though no single one of them orphans it.
        const importRanges =
          removals.length > 0
            ? planOrphanedImportRemoval(sourceCode, removals)
            : null;

        // The whole batch ships as one fix, so no removal can land without the
        // others that the import's orphanhood was judged against. The rest
        // report without a fixer; the carrier's pass already resolves them.
        const carrier = importRanges ? fixable[0] : undefined;

        for (const site of reportable) {
          context.report({
            node: site.reportNode,
            messageId: 'redundantAnnotationAndAssertion',
            data: { type: site.matchingType },
            fix:
              site === carrier && importRanges
                ? (fixer: TSESLint.RuleFixer) => [
                    ...removals.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    ),
                    ...importRanges.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    ),
                  ]
                : null,
          });
        }
      },
      VariableDeclarator(node) {
        if (
          node.id.type !== AST_NODE_TYPES.Identifier ||
          !node.id.typeAnnotation ||
          node.id.optional ||
          node.definite
        ) {
          return;
        }

        const assertionType = extractAssertionTypeNode(node.init);
        if (!assertionType) return;

        collectIfRedundant(
          node.id.typeAnnotation,
          assertionType,
          node.id,
          node.id.typeAnnotation,
        );
      },
      PropertyDefinition(node) {
        if (
          !node.typeAnnotation ||
          !node.value ||
          node.optional ||
          node.definite
        )
          return;

        const assertionType = extractAssertionTypeNode(node.value);
        if (!assertionType) return;

        collectIfRedundant(
          node.typeAnnotation,
          assertionType,
          node.key,
          node.typeAnnotation,
        );
      },
      FunctionDeclaration(node) {
        if (!node.returnType) return;

        collectReturnSite(node, node.returnType, node.id ?? node);
      },
      FunctionExpression(node) {
        if (node.parent?.type === AST_NODE_TYPES.MethodDefinition) {
          return;
        }

        if (!node.returnType) return;

        collectReturnSite(node, node.returnType, node);
      },
      ArrowFunctionExpression(node) {
        if (!node.returnType) return;

        collectReturnSite(node, node.returnType, node);
      },
      MethodDefinition(node) {
        if (!node.value.returnType) return;

        collectReturnSite(node, node.value.returnType, node.key);
      },
    };
  },
});
