import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

const COMMON_PREPOSITION_SUFFIXES = new Set([
  // Basic prepositions
  'From',
  'For',
  'With',
  'To',
  'By',
  'In',
  'On',
  'At',
  'Of',

  // Temporal prepositions
  'During',
  'Until',
  'Till',
  'Since',
  'Within',

  // Logical/causal prepositions
  'Because',
  'Despite',
  'Instead',
  'Via',
  'Without',
  'Versus',
  'Vs',

  // Comparative prepositions
  'Than',
  'As',

  // Phrasal prepositions (common endings)
  'Against',
  'Among',
  'Amongst',
  'Beside',
  'Besides',
  'Between',
  'Beyond',
  'Concerning',
  'Considering',
  'Regarding',
  'Respecting',
  'Towards',
  'Toward',
  'Upon',

  // Preposition-like adverbs
  'Again',
  'Already',
  'Always',
  'Ever',
  'Never',
  'Now',
  'Soon',
  'Then',
  'There',
  'Where',
  'When',
  'While',
]);

/**
 * Phrasal-verb particles that fuse with a preceding past participle to form an
 * inseparable state adjective (e.g. "signed in", "logged in", "opted in",
 * "logged out", "zoomed in"). When such a particle is the trailing suffix AND
 * the token before it is a past participle, the ending is NOT a redundant
 * verb-preposition action suffix — it is a single adjective describing state.
 */
const PHRASAL_PARTICLES = new Set(['In', 'On', 'Out', 'Up', 'Off', 'Down']);

/**
 * Verb stems that fuse with a phrasal particle into an established phrasal verb
 * where the particle is inseparable (e.g. "signIn", "logOut", "optIn",
 * "checkIn"). Matched in base form ("signIn", "useGuardSignIn") and
 * past-participle form ("signedIn", "loggedOut", "droppedIn"). A particle
 * preceded by a NOUN object instead — "searchItemsIn", "processEventOn",
 * "loadEmbedIn", "isWidgetIn" — is a genuine redundant verb-preposition suffix
 * and stays flagged. Extend this set when a new phrasal verb appears.
 */
const PHRASAL_VERB_STEMS = new Set([
  'sign',
  'log',
  'opt',
  'check',
  'zoom',
  'drop',
  'shut',
  'turn',
  'switch',
  'scroll',
]);

/**
 * Resolves the lowercased phrasal-verb stem of a final camelCase word, or null
 * when it is not a known phrasal verb. Handles the base form ("sign"), the
 * regular past participle ("signed" → "sign"), and the doubled-consonant
 * participle ("dropped" → "drop"). A noun that merely ends in "ed" (e.g.
 * "embed" → "emb", "shed" → "sh") resolves to null, so it stays flagged — this
 * is what keeps a leaky "ends in ed" heuristic from exempting genuine targets.
 */
function phrasalVerbStem(lastWord: string): string | null {
  const word = lastWord.toLowerCase();
  if (PHRASAL_VERB_STEMS.has(word)) {
    return word;
  }
  if (word.endsWith('ed')) {
    let stem = word.slice(0, -2);
    if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      stem = stem.slice(0, -1);
    }
    if (PHRASAL_VERB_STEMS.has(stem)) {
      return stem;
    }
  }
  return null;
}

/**
 * Returns true when the trailing `suffix` of `name` is a phrasal-verb particle
 * fused to its verb — a past-participle adjective ("signedIn", "loggedOut") or a
 * base-form phrasal verb ("signIn", "logOut"). The word immediately before the
 * particle must be a KNOWN phrasal verb (via phrasalVerbStem), not merely any
 * word ending in "ed"; that keeps redundant suffixes where a noun object
 * precedes the particle ("loadEmbedIn", "isWidgetIn", "searchItemsIn") flagged.
 * This single check also covers boolean predicates: "isSignedIn" resolves the
 * pre-particle "signed" → "sign", while "isWidgetIn" resolves "widget" → null.
 */
function isPhrasalVerbEnding(name: string, suffix: string): boolean {
  if (!PHRASAL_PARTICLES.has(suffix)) {
    return false;
  }
  const beforeSuffix = name.substring(0, name.length - suffix.length);
  const lastWord = beforeSuffix.match(/[A-Z]?[a-z]+$/)?.[0] ?? '';
  return phrasalVerbStem(lastWord) !== null;
}

/**
 * Returns true when `node` (or its relevant ancestor for the declaration kind)
 * is directly wrapped in an export declaration. An exported symbol must not be
 * auto-fixed because the fixer can only rename within the current file, leaving
 * cross-file import references broken.
 *
 * Call this with:
 *  - the FunctionDeclaration node for `function foo() {}`
 *  - the ArrowFunctionExpression/FunctionExpression node for `const foo = () => {}`
 *    (its parent chain: arrow → VariableDeclarator → VariableDeclaration → export?)
 */
function isExported(node: TSESTree.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // FunctionDeclaration directly inside `export function foo() {}`
  if (
    parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    parent.type === AST_NODE_TYPES.ExportDefaultDeclaration
  ) {
    return true;
  }

  // Arrow/FunctionExpression assigned to a VariableDeclarator:
  //   VariableDeclarator → VariableDeclaration → ExportNamedDeclaration
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    const varDecl = parent.parent; // VariableDeclaration
    if (!varDecl) return false;
    const varDeclParent = varDecl.parent; // possible ExportNamedDeclaration
    if (
      varDeclParent &&
      (varDeclParent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
        varDeclParent.type === AST_NODE_TYPES.ExportDefaultDeclaration)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Renames `identifier` to `newName` while leaving every other token inside the
 * identifier's range intact.
 *
 * A TSESTree `Identifier` node's range spans the tokens that trail its name:
 * a type annotation (`validateBy: Validator`), a definite-assignment assertion
 * (`validateBy!: Validator`) and an optional marker (`cbBy?: Fn`). Replacing the
 * whole node therefore deletes them, and dropping a contextual type turns
 * inferred parameters into implicit `any` so the file no longer compiles — a
 * silent corruption, since the rule reports nothing afterwards (#1351). The name
 * is always the identifier's first token, so replacing that token's range alone
 * renames the symbol and nothing else.
 */
function renameIdentifier(
  fixer: TSESLint.RuleFixer,
  sourceCode: Readonly<TSESLint.SourceCode>,
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
  newName: string,
): TSESLint.RuleFix {
  const nameToken = sourceCode.getFirstToken(identifier);
  // The token store yields the name for every real identifier; the arithmetic
  // end keeps the range narrowed even if a token is somehow unavailable.
  const nameEnd = nameToken
    ? nameToken.range[1]
    : identifier.range[0] + identifier.name.length;
  return fixer.replaceTextRange([identifier.range[0], nameEnd], newName);
}

/**
 * Walks a scope chain upward from `scope` (inclusive) and reports whether
 * `targetName` is bound anywhere between `scope` and `stopScope` (inclusive).
 * Mirrors how the engine resolves an identifier at a use site: the first scope
 * on the chain that declares the name wins. Used to detect whether a rewritten
 * reference would be captured by a binding sitting between it and the
 * declaration it currently resolves to.
 */
function isNameBoundInChain(
  scope: TSESLint.Scope.Scope | null,
  stopScope: TSESLint.Scope.Scope | null,
  targetName: string,
): boolean {
  let current: TSESLint.Scope.Scope | null = scope;
  while (current) {
    if (current.set.has(targetName)) {
      return true;
    }
    if (current === stopScope) {
      break;
    }
    current = current.upper;
  }
  return false;
}

/**
 * Walks a scope subtree rooted at `root` and reports whether `targetName` is
 * declared anywhere within it — the renamed function's own parameters and body
 * bindings. A `suggestion` binding here would shadow the function's new name
 * (the self-shadowing trap in #1278).
 */
function isNameBoundInSubtree(
  root: TSESLint.Scope.Scope,
  targetName: string,
): boolean {
  const stack: TSESLint.Scope.Scope[] = [root];
  while (stack.length > 0) {
    const scope = stack.pop() as TSESLint.Scope.Scope;
    if (scope.set.has(targetName)) {
      return true;
    }
    for (const child of scope.childScopes) {
      stack.push(child);
    }
  }
  return false;
}

/**
 * Annotations that impose no excess-property check. A value annotated `any` or
 * `unknown` may carry members its annotation never declares, so the annotation
 * proves nothing about where a member name came from (#1350).
 */
const UNCHECKED_ANNOTATION_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.TSAnyKeyword,
  AST_NODE_TYPES.TSUnknownKeyword,
]);

/**
 * The declared type of an annotation-bearing node (`const x: T`, `field: T`),
 * or null when the node carries no annotation.
 */
function declaredTypeNode(node: TSESTree.Node): TSESTree.Node | null {
  const { typeAnnotation } = node as {
    typeAnnotation?: TSESTree.TSTypeAnnotation;
  };
  return typeAnnotation?.typeAnnotation ?? null;
}

function checksExcessProperties(typeNode: TSESTree.Node | null): boolean {
  return typeNode !== null && !UNCHECKED_ANNOTATION_TYPES.has(typeNode.type);
}

/** `as const` declares no members of its own, so it pins no name. */
function isConstAssertionType(typeNode: TSESTree.Node): boolean {
  return (
    typeNode.type === AST_NODE_TYPES.TSTypeReference &&
    typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
    typeNode.typeName.name === 'const'
  );
}

/**
 * An `as T` / `<T>` whose target type declares members the value must still
 * have. Renaming one of them makes the assertion uncomparable (TS2352), so the
 * name is dictated by `T` rather than chosen by the author — the same reasoning
 * the annotation arms use, applied to the check an assertion actually performs.
 */
function isCheckedTypeAssertion(node: TSESTree.Node): boolean {
  if (
    node.type !== AST_NODE_TYPES.TSAsExpression &&
    node.type !== AST_NODE_TYPES.TSTypeAssertion
  ) {
    return false;
  }
  const { typeAnnotation } = node;
  return (
    checksExcessProperties(typeAnnotation) &&
    !isConstAssertionType(typeAnnotation)
  );
}

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

function isFunctionNode(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

/**
 * The function a `return` statement belongs to — the nearest function ancestor,
 * which is what the language binds the return to. Scoping to the NEAREST one
 * keeps a nested callback's literal from inheriting an outer function's
 * annotation.
 */
function enclosingFunction(node: TSESTree.Node): FunctionNode | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (isFunctionNode(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Reports whether `fn` declares a return type that checks the shape of what it
 * returns. Which type it names is irrelevant — the signal is that the author
 * declared a contract at all, matching how an annotated variable is treated.
 */
function declaresCheckedReturnType(fn: FunctionNode | null): boolean {
  return (
    fn !== null && checksExcessProperties(fn.returnType?.typeAnnotation ?? null)
  );
}

/**
 * Assertion wrappers, which never change the runtime value they wrap. An
 * `as const`, `as T`, `satisfies T` or `!` therefore leaves the literal beneath
 * it the same object, still checked by whatever declared type sits OUTSIDE the
 * wrapper. Mirrors the set `no-firestore-object-arrays` unwraps for the same
 * reason.
 */
const EXPRESSION_ASSERTION_TYPES = new Set<string>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
]);

/**
 * Reports whether `node` sits inside a value whose shape TypeScript checks
 * against a declared type — a type-annotated variable or class field, a
 * `satisfies` clause, or the return-type annotation of the function that
 * returns it. Excess-property checking makes such a literal unable to carry a
 * member the target type does not declare, so a member name there is dictated
 * by that type rather than chosen by the author, and renaming it would break
 * conformance (#1350). No member resolution is needed: the signal alone is
 * proof, because code carrying an undeclared member does not compile.
 *
 * The return-type form is the only one a RECURSIVE factory can reach (#1511):
 * `return {...} satisfies Q` inside a self-referencing factory does not compile
 * at all (TS7023 — the return type becomes implicitly `any` because the
 * function is referenced in its own return expression), so the annotation is
 * that shape's sole way to declare the contract it imitates.
 *
 * The walk climbs object/array containers so an outer signal covers nested
 * members, and climbs THROUGH assertion wrappers, which change no runtime value
 * and so cannot detach a literal from the declared type it is assigned to
 * (#1597) — `enforce-object-literal-as-const` ships in the same recommended
 * config and appends `as const` to exactly these literals by `--fix`.
 *
 * An `as T` is itself a signal when `T` declares members. It is true that an
 * `as` clause does not reject EXCESS members the way an annotation does
 * (`{ orderBy, extra } as Q` compiles; `const c: Q = { orderBy, extra }` is
 * TS2322) — but the operation being gated is a RENAME, which removes a REQUIRED
 * member, and that an assertion does reject: `{ order } as Q` is TS2352 when `Q`
 * requires `orderBy`. Reasoning from excess properties alone made the rule
 * demand a rename that does not compile (#1885). `as const` is the exception
 * and stays transparent, declaring no members of its own.
 *
 * The walk stops at anything else.
 */
function hasConformanceSignal(node: TSESTree.Node): boolean {
  let current: TSESTree.Node = node;
  for (;;) {
    const parent: TSESTree.Node | undefined = current.parent;
    if (!parent) {
      return false;
    }
    // A `satisfies` clause both asserts and checks, so it is answered before
    // the wrapper is stepped over; an unchecked one (`satisfies any`) proves
    // nothing on its own and the walk continues past it to the outer context.
    if (
      parent.type === AST_NODE_TYPES.TSSatisfiesExpression &&
      parent.expression === current &&
      checksExcessProperties(parent.typeAnnotation)
    ) {
      return true;
    }
    // An `as T` DOES pin the member names it requires, even though it does not
    // reject excess ones. The two are different checks: excess-property
    // checking is what an annotation adds, but a RENAME removes a REQUIRED
    // member, and that breaks comparability — `{ beta: 1 } as T` is TS2352 when
    // `T` requires `alpha`. Reasoning from excess properties alone made the rule
    // demand a rename that does not compile (#1885). `as const` stays
    // transparent: it declares no members of its own, and
    // `enforce-object-literal-as-const` appends one to exactly these literals.
    if (
      isCheckedTypeAssertion(parent) &&
      (parent as TSESTree.TSAsExpression | TSESTree.TSTypeAssertion)
        .expression === current
    ) {
      return true;
    }
    if (EXPRESSION_ASSERTION_TYPES.has(parent.type)) {
      current = parent;
      continue;
    }
    switch (parent.type) {
      case AST_NODE_TYPES.VariableDeclarator:
        return (
          parent.init === current &&
          checksExcessProperties(declaredTypeNode(parent.id))
        );
      case AST_NODE_TYPES.PropertyDefinition:
        return (
          parent.value === current &&
          checksExcessProperties(declaredTypeNode(parent))
        );
      case AST_NODE_TYPES.ReturnStatement:
        // Only the returned value is covered; a literal elsewhere in the body
        // of an annotated function is unrelated to its declared return type.
        return (
          parent.argument === current &&
          declaresCheckedReturnType(enclosingFunction(parent))
        );
      case AST_NODE_TYPES.ArrowFunctionExpression:
        // A concise arrow body is the returned value.
        return parent.body === current && declaresCheckedReturnType(parent);
      case AST_NODE_TYPES.Property:
      case AST_NODE_TYPES.ObjectExpression:
      case AST_NODE_TYPES.ArrayExpression:
        current = parent;
        break;
      default:
        return false;
    }
  }
}

/**
 * Named type and class declarations of a single file, keyed by name, so a class
 * heritage clause can be resolved without type information. Interfaces map to a
 * list because declaration merging spreads one interface across several
 * declarations.
 */
type DeclarationIndex = {
  interfaces: Map<string, TSESTree.TSInterfaceDeclaration[]>;
  typeAliases: Map<string, TSESTree.TSTypeAliasDeclaration>;
  classes: Map<string, TSESTree.ClassDeclaration | TSESTree.ClassExpression>;
};

function buildDeclarationIndex(
  sourceCode: Readonly<TSESLint.SourceCode>,
): DeclarationIndex {
  const index: DeclarationIndex = {
    interfaces: new Map(),
    typeAliases: new Map(),
    classes: new Map(),
  };

  // Declarations are collected from the whole file rather than from
  // `Program.body` alone so contracts declared inside modules, blocks or
  // functions resolve as well as top-level ones.
  const stack: TSESTree.Node[] = [sourceCode.ast];
  while (stack.length > 0) {
    const current = stack.pop() as TSESTree.Node;
    switch (current.type) {
      case AST_NODE_TYPES.TSInterfaceDeclaration: {
        const merged = index.interfaces.get(current.id.name) ?? [];
        merged.push(current);
        index.interfaces.set(current.id.name, merged);
        break;
      }
      case AST_NODE_TYPES.TSTypeAliasDeclaration:
        index.typeAliases.set(current.id.name, current);
        break;
      case AST_NODE_TYPES.ClassDeclaration:
      case AST_NODE_TYPES.ClassExpression:
        if (current.id) {
          index.classes.set(current.id.name, current);
        }
        break;
      default:
        break;
    }

    for (const key of sourceCode.visitorKeys[current.type] ?? []) {
      const value = (current as unknown as Record<string, unknown>)[key];
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (child && typeof child === 'object' && 'type' in child) {
          stack.push(child as TSESTree.Node);
        }
      }
    }
  }

  return index;
}

function heritageTypeName(expression: TSESTree.Node): string | null {
  return expression.type === AST_NODE_TYPES.Identifier ? expression.name : null;
}

function membersDeclareName(
  members: readonly TSESTree.Node[],
  memberName: string,
): boolean {
  return members.some(
    (member) =>
      (member.type === AST_NODE_TYPES.TSMethodSignature ||
        member.type === AST_NODE_TYPES.TSPropertySignature) &&
      member.key.type === AST_NODE_TYPES.Identifier &&
      member.key.name === memberName,
  );
}

function classBodyDeclaresName(
  members: readonly TSESTree.Node[],
  memberName: string,
): boolean {
  return members.some(
    (member) =>
      (member.type === AST_NODE_TYPES.MethodDefinition ||
        member.type === AST_NODE_TYPES.PropertyDefinition) &&
      member.key.type === AST_NODE_TYPES.Identifier &&
      member.key.name === memberName,
  );
}

/**
 * Reports whether the contract named `typeName` accounts for `memberName`,
 * either by declaring it or by being unreadable from this file. A class may add
 * members its contract never declares, so presence of a heritage clause alone
 * cannot exempt a name — but an imported or otherwise unresolvable contract
 * hides its members from a purely syntactic rule, and this plugin prefers a
 * false negative over a false positive (#1350).
 */
function contractCoversName(
  typeName: string,
  memberName: string,
  index: DeclarationIndex,
  visited: Set<string>,
): boolean {
  // A name already inspected on this path adds nothing and would loop on a
  // circular heritage chain.
  if (visited.has(typeName)) {
    return false;
  }
  visited.add(typeName);

  const interfaces = index.interfaces.get(typeName);
  if (interfaces) {
    return interfaces.some(
      (declaration) =>
        membersDeclareName(declaration.body.body, memberName) ||
        heritageCoversName(
          declaration.extends ?? [],
          memberName,
          index,
          visited,
        ),
    );
  }

  const alias = index.typeAliases.get(typeName);
  if (alias) {
    return aliasCoversName(alias.typeAnnotation, memberName, index, visited);
  }

  const classDeclaration = index.classes.get(typeName);
  if (classDeclaration) {
    return (
      classBodyDeclaresName(classDeclaration.body.body, memberName) ||
      classContractCoversName(classDeclaration, memberName, index, visited)
    );
  }

  // Nothing under this name in the file: the contract lives in another module
  // and its members are unreadable here.
  return true;
}

/**
 * Reports whether the type an alias names accounts for `memberName`.
 *
 * A type literal lists its members outright. An intersection is readable as far
 * as its constituents are, which matters because `prefer-type-over-interface`
 * ships in the same recommended config and rewrites
 * `interface S extends Base { … }` to `type S = Base & { … }` by `--fix`:
 * treating every non-literal alias as unreadable would let that sibling fix
 * retire the member check for every contract written as an interface with a
 * heritage clause (#1679). Anything else — a union, a mapped or conditional
 * type, a reference whose target lives in another module — hides its member
 * list from a syntactic reader and stays unreadable, so the member keeps its
 * exemption.
 */
function aliasCoversName(
  typeNode: TSESTree.TypeNode,
  memberName: string,
  index: DeclarationIndex,
  visited: Set<string>,
): boolean {
  switch (typeNode.type) {
    case AST_NODE_TYPES.TSTypeLiteral:
      return membersDeclareName(typeNode.members, memberName);
    case AST_NODE_TYPES.TSIntersectionType:
      return intersectionCoversName(typeNode, memberName, index, visited);
    default:
      return true;
  }
}

/**
 * Reports whether an intersection accounts for `memberName`. An intersection
 * contributes every member of every constituent, so one constituent declaring
 * the name settles the question — and a constituent whose members cannot be
 * read settles it too, in the exempting direction: the name may well be that
 * hidden part's, and this plugin prefers a false negative over a false positive
 * (#1350). The member is only left to the class author when every constituent
 * is readable and none of them declares it.
 */
function intersectionCoversName(
  intersection: TSESTree.TSIntersectionType,
  memberName: string,
  index: DeclarationIndex,
  visited: Set<string>,
): boolean {
  return intersection.types.some((constituent) =>
    constituentCoversName(constituent, memberName, index, visited),
  );
}

/**
 * Answers `intersectionCoversName` for one constituent. A reference is followed
 * through the file's declarations by the same resolver a heritage clause uses,
 * so a contract split across a local base and an inline literal reads as a
 * whole; a reference the file does not declare, and a qualified or otherwise
 * opaque constituent, count as unreadable.
 */
function constituentCoversName(
  typeNode: TSESTree.TypeNode,
  memberName: string,
  index: DeclarationIndex,
  visited: Set<string>,
): boolean {
  if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
    return typeNode.typeName.type === AST_NODE_TYPES.Identifier
      ? contractCoversName(typeNode.typeName.name, memberName, index, visited)
      : true;
  }
  return aliasCoversName(typeNode, memberName, index, visited);
}

function heritageCoversName(
  heritage: readonly (
    | TSESTree.TSClassImplements
    | TSESTree.TSInterfaceHeritage
  )[],
  memberName: string,
  index: DeclarationIndex,
  visited: Set<string>,
): boolean {
  return heritage.some((clause) => {
    const typeName = heritageTypeName(clause.expression);
    // A namespaced or computed heritage expression cannot be followed
    // syntactically, so it counts as an unreadable contract.
    return (
      typeName === null ||
      contractCoversName(typeName, memberName, index, visited)
    );
  });
}

function classContractCoversName(
  classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
  memberName: string,
  index: DeclarationIndex,
  visited: Set<string>,
): boolean {
  if (
    heritageCoversName(classNode.implements ?? [], memberName, index, visited)
  ) {
    return true;
  }

  const { superClass } = classNode;
  if (!superClass) {
    return false;
  }
  const superName = heritageTypeName(superClass);
  // A computed superclass (a mixin call) is unreadable, like an imported one.
  return (
    superName === null ||
    contractCoversName(superName, memberName, index, visited)
  );
}

type MessageIds = 'unnecessaryVerbSuffix';

export const noUnnecessaryVerbSuffix = createRule<[], MessageIds>({
  name: 'no-unnecessary-verb-suffix',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prevent unnecessary verb suffixes in function and method names',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      unnecessaryVerbSuffix:
        'Function name "{{name}}" ends with verb suffix "{{suffix}}" that does not add meaning beyond its parameters. Redundant verb-preposition endings make call sites harder to scan and hide the primary action. Rename to "{{suggestion}}" so the name stays action-oriented while arguments express the relationship.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Built on first heritage question only, since most files never ask one.
    let declarationIndex: DeclarationIndex | null = null;
    function getDeclarationIndex(): DeclarationIndex {
      if (declarationIndex === null) {
        declarationIndex = buildDeclarationIndex(context.sourceCode);
      }
      return declarationIndex;
    }

    /**
     * Reports whether a class member's name comes from a contract the class
     * declares conformance to, rather than from its author (#1350).
     */
    function isDictatedByHeritage(
      node: TSESTree.MethodDefinition,
      memberName: string,
    ): boolean {
      const classBody = node.parent;
      if (!classBody || classBody.type !== AST_NODE_TYPES.ClassBody) {
        return false;
      }
      const classNode = classBody.parent;
      if (
        !classNode ||
        (classNode.type !== AST_NODE_TYPES.ClassDeclaration &&
          classNode.type !== AST_NODE_TYPES.ClassExpression)
      ) {
        return false;
      }
      // Indexing the file's declarations is only worth its cost once a class
      // declares conformance to something.
      if (
        (classNode.implements ?? []).length === 0 &&
        classNode.superClass === null
      ) {
        return false;
      }
      return classContractCoversName(
        classNode,
        memberName,
        getDeclarationIndex(),
        new Set(),
      );
    }

    /**
     * Returns true when renaming the symbol to `suggestion` would collide with
     * an existing binding in any scope the rename touches, making the autofix
     * semantics-changing (and thus unsafe). The strip-suffix fix rewrites the
     * declaration plus every in-file reference to `suggestion`; if `suggestion`
     * already resolves to a different binding the rewrite would:
     *   - redeclare a name already bound in the declaration scope,
     *   - capture a call site onto an intervening binding (e.g. turning
     *     `const line = lineAt(...)` into the TDZ self-reference
     *     `const line = line(...)`, #1278), or
     *   - shadow the function's own new name from inside its body.
     * In every such case the fix is suppressed (report-only) so the developer
     * picks a non-colliding name — the safety standard core rename fixers hold.
     */
    function renameWouldCollide(
      functionNode: TSESTree.Node,
      variable: TSESLint.Scope.Variable | null,
      suggestion: string,
    ): boolean {
      const scopeManager = context.sourceCode.scopeManager;
      const functionScope = scopeManager?.acquire(functionNode) ?? null;
      const declarationScope = variable?.scope ?? functionScope?.upper ?? null;

      // (1) Declaration site: a `suggestion` already bound in the scope that
      //     holds the declaration would make the rename a redeclaration/shadow.
      if (declarationScope?.set.has(suggestion)) {
        return true;
      }

      // (2) Reference sites: a binding sitting between a reference and the
      //     declaration scope would swallow the rewritten identifier — the
      //     reference would resolve to that binding instead of the function.
      if (variable && declarationScope) {
        for (const ref of variable.references) {
          const referenceScope = ref.from ?? declarationScope;
          if (
            isNameBoundInChain(referenceScope, declarationScope, suggestion)
          ) {
            return true;
          }
        }
      }

      // (3) The function's own parameters/body: a `suggestion` binding there
      //     would shadow the function's new name.
      if (functionScope && isNameBoundInSubtree(functionScope, suggestion)) {
        return true;
      }

      return false;
    }

    function checkFunctionName(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
      name: string | null,
      /**
       * The AST node that holds the identifier being renamed.
       * For FunctionDeclaration this is `node.id`; for VariableDeclarator
       * assigned arrows it is `declarator.id`; for Property/MethodDefinition
       * it is the key node. Passing it explicitly avoids re-deriving it inside
       * the fixer and allows the reference-rename loop to skip it cleanly.
       */
      declarationIdNode: TSESTree.Identifier | null,
      /**
       * The AST node whose declared variables the scope manager tracks.
       * For FunctionDeclaration this is `node` itself; for a VariableDeclarator
       * arrow it is the VariableDeclarator; for methods/properties it is null
       * because member references are not in scope (resolved via `this.x`).
       */
      scopeNode: TSESTree.Node | null,
      /**
       * Whether the symbol is exported. When true, the fix is suppressed so we
       * don't produce broken cross-file renames.
       */
      exported: boolean,
    ): void {
      if (!name) return;

      for (const suffix of COMMON_PREPOSITION_SUFFIXES) {
        // Check if the name ends with the suffix
        if (name.endsWith(suffix)) {
          // Make sure there's a verb before the suffix (camelCase format)
          // This regex checks for a verb pattern before the suffix
          // It looks for a word character followed by lowercase letters before the suffix
          const verbBeforeSuffixPattern = new RegExp(`\\w[a-z]+${suffix}$`);

          if (verbBeforeSuffixPattern.test(name)) {
            const suggestion = name.substring(0, name.length - suffix.length);

            // Skip if the suggestion would be empty or just a single character
            if (suggestion.length <= 1) continue;

            // Skip phrasal-verb endings (e.g. past-participle adjectives
            // "signedIn"/"loggedOut" or compound phrasal verbs "signIn"/
            // "logOut"): the trailing particle fuses with its verb, so stripping
            // it ("signed", "sign") destroys the meaning. The pre-particle word
            // must be a known phrasal verb, so noun-object endings like
            // "loadEmbedIn"/"isWidgetIn" remain flagged.
            if (isPhrasalVerbEnding(name, suffix)) continue;

            context.report({
              node,
              messageId: 'unnecessaryVerbSuffix',
              data: {
                name,
                suffix,
                suggestion,
              },
              fix(fixer) {
                // An autofix here is only reference-safe when the fixer can
                // rename EVERY use of the symbol, not just its declaration —
                // otherwise call sites are orphaned and produce a ReferenceError
                // (#1256). Two cases make that impossible, so the fix is
                // suppressed (report only, no `--fix` change):
                //
                //  1. Exported symbols — a single-file fixer cannot reach
                //     cross-file import references.
                //  2. Member-accessed symbols (class methods, object-literal
                //     properties, interface method signatures) — their call
                //     sites are member expressions (`this.x()`, `obj.x()`) that
                //     the scope manager does not track as variable references,
                //     so they cannot be found and renamed syntactically.
                //     `scopeNode` is null for exactly these declarations.
                if (exported || !scopeNode || !declarationIdNode) {
                  return null;
                }

                // Note: context.getDeclaredVariables is the API available in the
                // pinned @typescript-eslint version (the SourceCode-based
                // replacement is not yet in these type definitions).
                // getDeclaredVariables returns ALL variables the node declares
                // (e.g. for a FunctionDeclaration it includes the function name
                // variable AND its parameter variables). Pick the one whose name
                // matches the symbol being renamed so we only follow references
                // to the name, not parameters.
                const declaredVars = context.getDeclaredVariables(scopeNode);
                const targetVariable =
                  declaredVars.find((variable) => variable.name === name) ??
                  null;

                // Suppress the fix when the suggested name already binds
                // something in a scope the rename would touch — a rename fixer
                // must never change program semantics or break compilation
                // (#1278).
                if (renameWouldCollide(node, targetVariable, suggestion)) {
                  return null;
                }

                // Scope-tracked symbols (FunctionDeclaration, VariableDeclarator
                // arrows/functions, named FunctionExpression): rename the
                // declaration identifier and every in-file reference together so
                // no call site is left pointing at the old name. Every rewrite
                // goes through renameIdentifier, because an identifier's range
                // can carry trailing tokens that must survive a rename (#1351).
                const { sourceCode } = context;
                const fixes = [
                  renameIdentifier(
                    fixer,
                    sourceCode,
                    declarationIdNode,
                    suggestion,
                  ),
                ];
                if (targetVariable) {
                  for (const ref of targetVariable.references) {
                    // Skip the declaration identifier itself — already handled.
                    if (ref.identifier === declarationIdNode) continue;

                    const refParent = ref.identifier.parent;

                    // An object-literal shorthand `{ fooBar }` desugars to
                    // `{ fooBar: fooBar }`: the one token is both the property
                    // key and its value. Renaming it would rename the KEY too,
                    // silently changing the object's shape so every
                    // `obj.fooBar` consumer reads undefined. Expand to
                    // `oldKey: newName` so only the value moves (#1352).
                    if (
                      refParent?.type === AST_NODE_TYPES.Property &&
                      refParent.shorthand &&
                      refParent.parent?.type === AST_NODE_TYPES.ObjectExpression
                    ) {
                      fixes.push(
                        fixer.replaceText(
                          ref.identifier,
                          `${name}: ${suggestion}`,
                        ),
                      );
                      continue;
                    }

                    // A re-export specifier `export { fooBar }` binds the public
                    // export name to this identifier, a cross-file contract a
                    // single-file fixer cannot rewrite. The declaration-level
                    // export guard misses this form because the declaration
                    // itself carries no `export` keyword (#1352).
                    if (refParent?.type === AST_NODE_TYPES.ExportSpecifier) {
                      return null;
                    }

                    fixes.push(
                      renameIdentifier(
                        fixer,
                        sourceCode,
                        ref.identifier,
                        suggestion,
                      ),
                    );
                  }
                }

                return fixes;
              },
            });
          }
        }
      }
    }

    return {
      FunctionDeclaration(node): void {
        if (node.id) {
          checkFunctionName(
            node,
            node.id.name,
            node.id,
            node,
            isExported(node),
          );
        }
      },
      VariableDeclarator(node): void {
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          (node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.init?.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          checkFunctionName(
            node.init,
            node.id.name,
            node.id,
            node,
            isExported(node.init),
          );
        }
      },
      MethodDefinition(node): void {
        if (node.key.type === AST_NODE_TYPES.Identifier) {
          // A member implementing a contract the class declares conformance to
          // is named by that contract, so renaming it would break conformance.
          if (isDictatedByHeritage(node, node.key.name)) {
            return;
          }

          // Class methods are called via member expressions (`this.method()`,
          // `instance.method()`) that the scope manager does not track as
          // references. A syntactic single-file fixer therefore cannot find and
          // rename those call sites, so renaming the method would orphan them
          // (#1256). Pass null for both the rename target and scopeNode so the
          // violation is still reported but no unsafe fix is offered.
          checkFunctionName(
            node.value as TSESTree.FunctionExpression,
            node.key.name,
            null,
            null,
            false,
          );
        }
      },
      TSMethodSignature(node): void {
        // Interface method signatures have their implementations and call sites
        // elsewhere (member accesses on implementers), unreachable from this
        // declaration. Report only — never offer a rename fix.
        if (node.key.type === AST_NODE_TYPES.Identifier) {
          checkFunctionName(
            node as unknown as TSESTree.FunctionExpression,
            node.key.name,
            null,
            null,
            false,
          );
        }
      },
      Property(node): void {
        if (
          node.key.type === AST_NODE_TYPES.Identifier &&
          (node.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.value.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          // A literal checked against a declared type can only hold members
          // that type declares, so its member names are not the author's to
          // rename.
          if (hasConformanceSignal(node)) {
            return;
          }

          // Object-literal method properties are accessed via member expressions
          // (`obj.method()`) the scope manager does not track. As with class
          // methods, the fix is suppressed to avoid orphaning call sites.
          checkFunctionName(node.value, node.key.name, null, null, false);
        }
      },
      FunctionExpression(node): void {
        // Handle named function expressions
        if (node.id) {
          checkFunctionName(
            node,
            node.id.name,
            node.id,
            node,
            isExported(node),
          );
        }
      },
    };
  },
});
