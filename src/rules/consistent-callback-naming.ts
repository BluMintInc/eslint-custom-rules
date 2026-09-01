/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';

// The "handle" prefix the rule targets is the verb-phrase pattern
// `handle<Something>` — six letters immediately followed by a capitalized word
// (handleClick, handleSubmit, handleFormSubmit). When "handle" is followed by a
// lowercase letter the six letters are part of an ordinary word, not the prefix:
// the past participle "handled" (and derived names like "handledFingerprints"),
// the noun "handler(s)", "handles", "handling", the adjective "handleable". Those
// are plain identifiers, so flagging them — and worse, autofix-stripping the
// leading "handle" to leave nonsense like `d`/`dFingerprints` — silently corrupts
// unrelated code (Bug #1301). A bare "handle" is likewise a whole word, not a
// prefix.
function hasHandlePrefix(name: string): boolean {
  return /^handle[A-Z]/.test(name);
}

function stripHandlePrefix(name: string): string {
  return name.slice(6).charAt(0).toLowerCase() + name.slice(7);
}

// Stripping the prefix can land the rename squarely on a keyword:
// `handleDelete` -> `delete`, `handleNew` -> `new`, `handleReturn` -> `return`,
// `handleTrue` -> `true`. None of those is a legal binding name, so a fix that
// emits one turns a working file into a parse error — `const delete = fn` and
// `const { delete } = api` are both SyntaxErrors (Bug #1719). The set covers the
// ES reserved words, the strict-mode/module reserved words (the linted codebase
// is entirely ES modules, where `await` and `implements` et al. are reserved
// too) and the three keyword literals. The guard is applied at every emission
// site, including member names where a keyword happens to be legal
// (`class C { delete() {} }`): the rule cannot see whether that member is later
// destructured into a binding, and a fixer that is safe only sometimes is not
// safe.
const RESERVED_WORDS = new Set([
  'arguments',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

function isEmittableName(name: string): boolean {
  return name.length > 0 && !RESERVED_WORDS.has(name);
}

function isExportedDeclaration(node: TSESTree.Node | undefined): boolean {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.ExportNamedDeclaration ||
      current.type === AST_NODE_TYPES.ExportDefaultDeclaration
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

// An object literal that is exported or returned is a value other modules read
// by member name (`api.handleOpenThread`, `const { handleOpenThread } = useX()`).
// Renaming a member of it edits one end of a contract whose readers live in
// files a single-file fixer cannot even see, so the violation is reported
// without a fix — the same reasoning that withholds the JSX prop rename.
function isApiSurfaceValue(node: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    switch (current.type) {
      case AST_NODE_TYPES.ExportNamedDeclaration:
      case AST_NODE_TYPES.ExportDefaultDeclaration:
      case AST_NODE_TYPES.ReturnStatement:
        return true;
      case AST_NODE_TYPES.ArrowFunctionExpression:
        // A concise body is a return with no `return` keyword.
        return current.body === child;
      case AST_NODE_TYPES.BlockStatement:
      case AST_NODE_TYPES.ClassBody:
      case AST_NODE_TYPES.FunctionDeclaration:
      case AST_NODE_TYPES.FunctionExpression:
      case AST_NODE_TYPES.Program:
        return false;
      default:
        child = current;
        current = current.parent;
    }
  }
  return false;
}

/**
 * Whether `node` is a member of a class that `extends` or `implements`
 * something.
 *
 * Such a member is one end of a contract whose other end this fixer does not
 * own. Renaming only the implementation leaves the declaration behind and the
 * class stops satisfying it: `TS2515` when an abstract base declares the member,
 * `TS2420` when an `implements` clause does (Bug #1944). The heritage itself is
 * the trigger rather than a matching declaration the rule can find, because the
 * base is routinely imported — the declaration need not be in this file at all,
 * and sibling implementors of the same contract certainly need not be. Erring
 * toward withholding costs an autofix on members that override nothing; it buys
 * a fixer that cannot turn a compiling file into a broken one. The violation is
 * still reported, so the author renames both ends deliberately — the same policy
 * that already withholds the rename for exported bindings and for members of an
 * exported or returned object literal.
 */
function satisfiesDeclaredContract(node: TSESTree.Node): boolean {
  const classNode = enclosingClass(node);
  return (
    !!classNode &&
    (!!classNode.superClass || (classNode.implements?.length ?? 0) > 0)
  );
}

/** The class a member belongs to, when `node` is a class member. */
function enclosingClass(
  node: TSESTree.Node,
): TSESTree.ClassDeclaration | TSESTree.ClassExpression | undefined {
  const body = node.parent;
  if (body?.type !== AST_NODE_TYPES.ClassBody) {
    return undefined;
  }
  const classNode = body.parent;
  return classNode?.type === AST_NODE_TYPES.ClassDeclaration ||
    classNode?.type === AST_NODE_TYPES.ClassExpression
    ? classNode
    : undefined;
}

/**
 * What `this` denotes at `node`: `classNode`'s instance, `classNode` itself
 * (inside a `static` member), or nothing the rule can pin down.
 *
 * `this` is only rewritable evidence when it provably names the class whose
 * member is being renamed. An arrow function inherits `this` lexically, so the
 * walk passes through it; an ordinary function expression rebinds `this` to
 * whatever calls it, so `this.handleClick` inside a callback may be some other
 * object's member entirely and the rename must not touch it.
 */
function thisReceiverOf(
  node: TSESTree.Node,
  classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
): 'instance' | 'static' | undefined {
  const ownedBy = (member: TSESTree.Node & { static?: boolean }) =>
    member.parent?.parent === classNode
      ? member.static
        ? ('static' as const)
        : ('instance' as const)
      : undefined;

  let child: TSESTree.Node = node;
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    // A concise or block-bodied arrow keeps the enclosing `this`.
    if (current.type === AST_NODE_TYPES.FunctionExpression) {
      const owner = current.parent;
      return (owner?.type === AST_NODE_TYPES.MethodDefinition ||
        owner?.type === AST_NODE_TYPES.PropertyDefinition) &&
        owner.value === current
        ? ownedBy(owner)
        : undefined;
    }
    if (current.type === AST_NODE_TYPES.FunctionDeclaration) {
      return undefined;
    }
    if (current.type === AST_NODE_TYPES.PropertyDefinition) {
      // Reached through arrows alone: a field initializer's `this` is the
      // instance under construction.
      return current.value === child ? ownedBy(current) : undefined;
    }
    if (current.type === AST_NODE_TYPES.StaticBlock) {
      return current.parent === classNode.body ? 'static' : undefined;
    }
    // A computed key, a decorator or a heritage expression evaluates outside
    // the class body, so `this` there is not the instance.
    if (
      current.type === AST_NODE_TYPES.ClassBody ||
      current.type === AST_NODE_TYPES.Program
    ) {
      return undefined;
    }
    child = current;
    current = current.parent;
  }
  return undefined;
}

/** Whether a class body declares `name` twice — a `get`/`set` pair. */
function declaresNameTwice(body: TSESTree.ClassBody, name: string): boolean {
  const declarations = body.body.filter((member) => {
    const key = (member as { computed?: boolean; key?: TSESTree.Node }).key;
    return (
      !(member as { computed?: boolean }).computed &&
      key?.type === AST_NODE_TYPES.Identifier &&
      key.name === name
    );
  });
  return declarations.length > 1;
}

/** The member names already declared alongside `node`, keyed by identifier. */
function siblingMemberNames(node: TSESTree.Node | undefined): Set<string> {
  const names = new Set<string>();
  const record = (member: TSESTree.Node) => {
    const key = (member as { computed?: boolean; key?: TSESTree.Node }).key;
    if (
      !(member as { computed?: boolean }).computed &&
      key?.type === AST_NODE_TYPES.Identifier
    ) {
      names.add(key.name);
    }
  };
  if (node?.type === AST_NODE_TYPES.ObjectExpression) {
    node.properties.forEach(record);
  } else if (node?.type === AST_NODE_TYPES.ClassBody) {
    node.body.forEach(record);
  }
  return names;
}

/**
 * Every member name the file reads by name — `obj.handleClick`,
 * `obj['handleClick']`, `const { handleClick } = obj`.
 *
 * Renaming an object literal's key has to move every one of those reads with
 * it, and a fixer scoped to the literal moves none of them: `const o = { click:
 * fn }; o.handleClick()` type-checks as a missing property and throws at
 * runtime. The presence of any reader therefore withholds the rewrite. The walk
 * is over the whole program because a reader may appear anywhere, including
 * before the literal.
 */
function collectMemberReads(
  program: TSESTree.Program,
  visitorKeys: Readonly<Record<string, readonly string[] | undefined>>,
): Set<string> {
  const names = new Set<string>();

  walkProgram(program, visitorKeys, (node) => {
    if (node.type === AST_NODE_TYPES.MemberExpression) {
      if (!node.computed && node.property.type === AST_NODE_TYPES.Identifier) {
        names.add(node.property.name);
      } else if (
        node.property.type === AST_NODE_TYPES.Literal &&
        typeof node.property.value === 'string'
      ) {
        names.add(node.property.value);
      }
    }
    // Read directly off the pattern rather than through `parent`, which is not
    // guaranteed to be assigned on nodes the traversal has not reached.
    if (node.type === AST_NODE_TYPES.ObjectPattern) {
      for (const property of node.properties) {
        if (
          property.type === AST_NODE_TYPES.Property &&
          !property.computed &&
          property.key.type === AST_NODE_TYPES.Identifier
        ) {
          names.add(property.key.name);
        }
      }
    }
  });
  return names;
}

/**
 * Every node of the file, type nodes included.
 *
 * The walk is driven by `visitorKeys` rather than by the rule's own visitors so
 * that a reference is found wherever it sits — including before the declaration
 * it refers to, and inside a type position the default traversal would still
 * reach but a hand-written recursion routinely forgets.
 */
function walkProgram(
  program: TSESTree.Program,
  visitorKeys: Readonly<Record<string, readonly string[] | undefined>>,
  visit: (node: TSESTree.Node) => void,
): void {
  const stack: TSESTree.Node[] = [program];
  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(push);
    } else if (value && typeof value === 'object' && 'type' in value) {
      stack.push(value as TSESTree.Node);
    }
  };

  while (stack.length > 0) {
    const node = stack.pop() as TSESTree.Node;
    visit(node);
    for (const key of visitorKeys[node.type] ?? []) {
      push((node as unknown as Record<string, unknown>)[key]);
    }
  }
}

/**
 * Every site in the file that could name a class member, split by whether an
 * in-place rename can own it.
 *
 * `reads` are `<expr>.name` accesses — the only spelling this fixer rewrites,
 * and then only when `<expr>` is a `this` that provably denotes the class being
 * edited. Everything else is `opaque`: a string spelling of the name
 * (`this['handleClick']`, `Pick<C, 'handleClick'>`, `emit('handleClick')`), a
 * destructuring key, or a qualified type name. Those either resolve the member
 * through text the fixer must not rewrite blindly or hand the name to something
 * outside the file, so a single occurrence withholds the whole rename.
 * `dynamicThisAccess` is the same verdict for `this[expr]`, where the member
 * being read is not decidable at all.
 */
type MemberSites = {
  reads: Map<string, TSESTree.MemberExpression[]>;
  opaque: Set<string>;
  dynamicThisAccess: boolean;
};

function collectMemberSites(
  program: TSESTree.Program,
  visitorKeys: Readonly<Record<string, readonly string[] | undefined>>,
): MemberSites {
  const reads = new Map<string, TSESTree.MemberExpression[]>();
  const opaque = new Set<string>();
  let dynamicThisAccess = false;

  walkProgram(program, visitorKeys, (node) => {
    if (node.type === AST_NODE_TYPES.MemberExpression) {
      if (!node.computed && node.property.type === AST_NODE_TYPES.Identifier) {
        const existing = reads.get(node.property.name);
        if (existing) {
          existing.push(node);
        } else {
          reads.set(node.property.name, [node]);
        }
      } else if (
        node.computed &&
        node.object.type === AST_NODE_TYPES.ThisExpression &&
        !(
          node.property.type === AST_NODE_TYPES.Literal &&
          typeof node.property.value === 'string'
        )
      ) {
        dynamicThisAccess = true;
      }
    }
    if (
      node.type === AST_NODE_TYPES.Literal &&
      typeof node.value === 'string'
    ) {
      opaque.add(node.value);
    }
    if (node.type === AST_NODE_TYPES.TSQualifiedName) {
      opaque.add(node.right.name);
    }
    if (node.type === AST_NODE_TYPES.ObjectPattern) {
      for (const property of node.properties) {
        if (
          property.type === AST_NODE_TYPES.Property &&
          !property.computed &&
          property.key.type === AST_NODE_TYPES.Identifier
        ) {
          opaque.add(property.key.name);
        }
      }
    }
  });
  return { reads, opaque, dynamicThisAccess };
}

export = createRule<[], 'callbackPropPrefix' | 'callbackFunctionPrefix'>({
  name: 'consistent-callback-naming',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce consistent naming conventions for callback props and functions',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      callbackPropPrefix:
        'Callback prop "{{propName}}" is a function but lacks the "on" prefix. ' +
        'Consistent "on" prefixes signal event handlers to consumers and distinguish callbacks from data props. ' +
        'Rename to "on{{eventName}}" here, in the props type that declares it, and in every reader of that prop.',
      callbackFunctionPrefix:
        'Function "{{functionName}}" uses the "handle" prefix. ' +
        'The "handle" prefix is redundant and less descriptive than action-oriented verb phrases. ' +
        'Rename using a descriptive verb (e.g., click instead of handleClick).',
    },
  },
  defaultOptions: [],
  create(context) {
    const parserServices = context.parserServices;

    // This rule is type-aware, but a single eslint invocation routinely mixes
    // in-project files with out-of-project ones (plain-Node `.mjs` scripts,
    // config files, etc.) that the TS `project` never parses. Throwing here
    // aborts rule loading for the ENTIRE run — one out-of-project file in argv
    // kills diagnostics for every file (Bug #1302). Degrade gracefully instead:
    // skip files without type information with a no-op visitor, matching how
    // @typescript-eslint rules tolerate missing parser services per file.
    if (!parserServices?.program || !parserServices?.esTreeNodeToTSNodeMap) {
      return {};
    }

    const checker = parserServices.program.getTypeChecker();

    function isReactComponentType(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);
      const symbol = type.getSymbol();

      if (!symbol) return false;

      // Check if type is a React component type
      const isComponent = symbol.declarations?.some((decl) => {
        const declaration = decl as
          | ts.ClassDeclaration
          | ts.InterfaceDeclaration
          | ts.TypeAliasDeclaration
          | ts.FunctionDeclaration;

        // Check for JSX element types
        if (ts.isTypeAliasDeclaration(declaration)) {
          const typeText = declaration.type.getText();
          return (
            typeText.includes('JSX.Element') ||
            typeText.includes('ReactElement')
          );
        }

        // Check for class/interface component patterns
        if (
          ts.isClassDeclaration(declaration) ||
          ts.isInterfaceDeclaration(declaration)
        ) {
          const name = declaration.name?.text ?? '';
          return (
            name.includes('Component') ||
            name.includes('Element') ||
            name.includes('FC') ||
            name.includes('FunctionComponent')
          );
        }

        return false;
      });

      // Check if the type itself is a component or element type
      const typeString = checker.typeToString(type);
      const isComponentType =
        typeString.includes('JSX.Element') ||
        typeString.includes('ReactElement') ||
        typeString.includes('Component') ||
        typeString.includes('FC');

      return isComponent || isComponentType;
    }

    function isPascalCase(str: string): boolean {
      return /^[A-Z][a-zA-Z0-9]*$/.test(str);
    }

    function isFunctionType(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);

      return type.getCallSignatures().length > 0;
    }

    // A union counts as "mixed" when it pairs a callable member with a
    // non-callable one (e.g. `Validate<T> | readonly T[]`). `undefined`/`null`
    // members are ignored so plain optional callbacks (`(() => void) | undefined`)
    // remain pure functions.
    function isMixedFunctionUnion(type: ts.Type | undefined): boolean {
      if (!type || !type.isUnion()) {
        return false;
      }
      const members = type.types.filter(
        (member) =>
          !(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
      );
      const hasFunctionMember = members.some(
        (member) => member.getCallSignatures().length > 0,
      );
      const hasNonFunctionMember = members.some(
        (member) => member.getCallSignatures().length === 0,
      );
      return hasFunctionMember && hasNonFunctionMember;
    }

    // The `on` prefix is only meaningful for props that are *exclusively*
    // callbacks. A prop typed `Validate<T> | readonly T[]` is a configuration
    // prop that merely accepts a function as one option, so it must be skipped.
    // The passed value may be a plain function even when the prop legitimately
    // accepts non-function values, so the prop's contextual (declared) type is
    // inspected alongside the value's own type.
    function acceptsNonFunctionValue(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const valueType = checker.getTypeAtLocation(tsNode);
      const contextualType = checker.getContextualType(tsNode as ts.Expression);
      return (
        isMixedFunctionUnion(valueType) || isMixedFunctionUnion(contextualType)
      );
    }

    function isRenderFunction(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);
      const signatures = type.getCallSignatures();

      if (signatures.length === 0) return false;

      const isReactType = (t: ts.Type): boolean => {
        const typeStr = checker.typeToString(t);
        return (
          typeStr.includes('JSX.Element') ||
          typeStr.includes('ReactElement') ||
          typeStr.includes('ReactNode')
        );
      };

      return signatures.some((signature) => {
        const returnType = checker.getReturnTypeOfSignature(signature);

        if (isReactType(returnType)) return true;

        if (returnType.isUnion()) {
          return returnType.types.some((t) => isReactType(t));
        }

        return false;
      });
    }

    // An event-handler callback's return value is discarded: `void`, `undefined`,
    // `never`, or a `Promise` thereof. Anything else is a value the caller
    // consumes, which marks the prop as an accessor rather than a handler.
    function returnsVoidLike(type: ts.Type): boolean {
      if (type.isUnion()) {
        return type.types.every((member) => returnsVoidLike(member));
      }
      if (
        type.flags &
        (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never)
      ) {
        return true;
      }
      // `Promise<void>` (async handlers) unwraps to its resolved type.
      if (type.getSymbol()?.getName() === 'Promise') {
        const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
        if (typeArgs.length === 1) {
          return returnsVoidLike(typeArgs[0]);
        }
      }
      return false;
    }

    // A function-typed prop is an accessor (getRowId, valueGetter, filterOptions,
    // a per-item props deriver, ...) rather than an event handler when its call
    // signature returns a value the component consumes instead of a discarded
    // `void`. The `on` prefix signals event handlers, so accessors are exempt.
    // The prop's declared (contextual) type is authoritative because the passed
    // value's inferred return type can be wider than the prop contract.
    function isValueAccessor(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const contextualType = checker.getContextualType(tsNode as ts.Expression);
      const type = contextualType ?? checker.getTypeAtLocation(tsNode);

      const members = type.isUnion() ? type.types : [type];
      const signatures = members.flatMap((member) =>
        member.getCallSignatures(),
      );
      if (signatures.length === 0) {
        return false;
      }

      // Exempt only when every call signature returns a consumed value; a mix
      // that includes a void-returning signature keeps the handler semantics.
      return signatures.every(
        (signature) =>
          !returnsVoidLike(checker.getReturnTypeOfSignature(signature)),
      );
    }

    // Built once per file, and only when an object literal member is actually a
    // rename candidate.
    let memberReads: Set<string> | undefined;
    function isReadByName(name: string): boolean {
      const sourceCode = context.getSourceCode();
      memberReads ??= collectMemberReads(
        sourceCode.ast,
        sourceCode.visitorKeys as Readonly<
          Record<string, readonly string[] | undefined>
        >,
      );
      return memberReads.has(name);
    }

    // Built once per file, and only when a class member is actually a rename
    // candidate.
    let memberSites: MemberSites | undefined;
    function fileMemberSites(): MemberSites {
      const sourceCode = context.getSourceCode();
      memberSites ??= collectMemberSites(
        sourceCode.ast,
        sourceCode.visitorKeys as Readonly<
          Record<string, readonly string[] | undefined>
        >,
      );
      return memberSites;
    }

    /**
     * Whether the class — and with it every value of its type — stays inside
     * this file.
     *
     * A rename of a member another module can name is the JSX-prop problem in
     * class clothing: the fixer edits one end of a contract whose readers it
     * cannot see, and `import { C } from './c'; c.handleClick()` fails with
     * TS2339 (Bug #1946). Export of the class is the obvious leak; a bare
     * mention of the class name is the subtler one, since `export const c = new
     * C()` hands the instance out without exporting the class at all. Neither is
     * traceable across files, so both withhold.
     */
    function classStaysModulePrivate(
      classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): boolean {
      if (isApiSurfaceValue(classNode)) {
        return false;
      }
      const bindings = [...context.getDeclaredVariables(classNode)];
      if (classNode.type === AST_NODE_TYPES.ClassExpression) {
        const declarator = classNode.parent;
        if (
          declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
          declarator.init !== classNode ||
          declarator.id.type !== AST_NODE_TYPES.Identifier
        ) {
          // A class expression passed to a call, stored on a property or
          // returned is a value whose consumers the fixer cannot follow.
          return false;
        }
        bindings.push(...context.getDeclaredVariables(declarator));
      } else if (bindings.length === 0) {
        // An unnamed declaration is only reachable through an export.
        return false;
      }
      return bindings.every(
        (variable) =>
          !isExportedBinding(variable) &&
          !variable.references.some(
            (ref) =>
              !(variable.identifiers as TSESTree.Node[]).includes(
                ref.identifier,
              ),
          ),
      );
    }

    /**
     * The reads a class-member rename must rewrite alongside the key, or `null`
     * when the rename has to be withheld entirely.
     *
     * The reads live in this file, so unlike the JSX prop or the exported
     * binding they are the fixer's to move — and they must move in the SAME fix,
     * because a rename that reaches the declaration and not `this.handleClick()`
     * turns a compiling file into TS2339 (Bug #1946). Any read the fixer cannot
     * prove it owns — a computed access, a `super.` or instance-variable read, a
     * `this` that some other object binds — collapses the whole rename to
     * `null`: a partial rename is the very breakage this returns to prevent.
     *
     * A field (`handleClick = () => {}`) has exactly the binding sites a method
     * has — the key, and `this.` reads of it — so it is answered here rather
     * than on a parallel path that would have to re-derive every one of these
     * withholdings (Bug #1949).
     */
    function classMemberRenameTargets(
      node: TSESTree.MethodDefinition | TSESTree.PropertyDefinition,
      name: string,
    ): TSESTree.Node[] | null {
      const classNode = enclosingClass(node);
      if (!classNode || node.computed) {
        return null;
      }
      // A `get`/`set` pair declares the name twice, and this report covers one
      // half of it: the getter is report-only, so renaming the setter alone
      // would split the accessor in two and leave `obj.handleResize = x`
      // assigning to a property that no longer has a setter.
      if (declaresNameTwice(classNode.body, name)) {
        return null;
      }
      // A `private` member is unnameable outside the class body, so its
      // references are all in this file however far the class itself travels.
      if (
        node.accessibility !== 'private' &&
        !classStaysModulePrivate(classNode)
      ) {
        return null;
      }
      const sites = fileMemberSites();
      if (sites.dynamicThisAccess || sites.opaque.has(name)) {
        return null;
      }
      // `this` in a static member is the class object, so a static member's
      // reads and an instance member's reads are different members entirely.
      const receiver = node.static ? 'static' : 'instance';
      const targets: TSESTree.Node[] = [];
      for (const read of sites.reads.get(name) ?? []) {
        if (
          read.object.type !== AST_NODE_TYPES.ThisExpression ||
          thisReceiverOf(read, classNode) !== receiver
        ) {
          return null;
        }
        targets.push(read.property);
      }
      return targets;
    }

    /**
     * The variable a pattern identifier binds. `getDeclaredVariables` is
     * authoritative — it is asked of the declaring ancestor (the
     * `VariableDeclaration`, the function owning a destructured parameter, the
     * `CatchClause`) rather than reconstructed by crawling scopes by name,
     * which cannot tell two same-named bindings apart.
     */
    function findPatternVariable(
      id: TSESTree.Identifier,
    ): TSESLint.Scope.Variable | undefined {
      let current: TSESTree.Node | undefined = id.parent;
      while (current) {
        const match = context
          .getDeclaredVariables(current)
          .find((variable) => variable.identifiers.includes(id));
        if (match) {
          return match;
        }
        current = current.parent;
      }
      return undefined;
    }

    // Renaming a binding that leaves the module — `export const { a: handleX }`,
    // or `export { handleX }` — breaks importers the fixer cannot edit.
    function isExportedBinding(variable: TSESLint.Scope.Variable): boolean {
      const namedByExportSpecifier = (id: TSESTree.Node) =>
        id.parent?.type === AST_NODE_TYPES.ExportSpecifier;
      return (
        variable.references.some((ref) =>
          namedByExportSpecifier(ref.identifier),
        ) ||
        variable.identifiers.some(namedByExportSpecifier) ||
        variable.defs.some((def) => isExportedDeclaration(def.node))
      );
    }

    /**
     * Whether any scope from `from` up to — but NOT including — `until` binds
     * `newName`.
     *
     * `until` is the scope the renamed declaration lives in, so it and
     * everything above it is already answered by the upward walk in
     * `isNameTaken`. What this adds is the span BETWEEN a reference and its
     * declaration, which is where a binding of the new name captures the
     * rewritten reference without colliding with anything the rename can see.
     */
    function bindsNameBelow(
      from: TSESLint.Scope.Scope | null,
      until: TSESLint.Scope.Scope,
      newName: string,
    ): boolean {
      let scope = from;
      while (scope && scope !== until) {
        if (scope.set.has(newName)) {
          return true;
        }
        scope = scope.upper;
      }
      return false;
    }

    // A rename that collides with a name already visible where the binding (or
    // any of its references) lives silently re-points those references at the
    // other declaration.
    function isNameTaken(
      variable: TSESLint.Scope.Variable,
      newName: string,
      // The sites the fix will actually rewrite. The function path gathers a
      // wider set than `variable.references` — a reference resolved through a
      // sibling or child scope is still a site the fixer emits the new name at,
      // so it is still a site the new name has to resolve correctly at.
      references: readonly TSESLint.Scope.Reference[] = variable.references,
    ): boolean {
      let scope: TSESLint.Scope.Scope | null = variable.scope;
      while (scope) {
        if (scope.set.has(newName)) {
          return true;
        }
        scope = scope.upper;
      }
      if (variable.scope.childScopes.some((child) => child.set.has(newName))) {
        return true;
      }
      /**
       * The declaration site is not the only place the new name has to mean the
       * renamed binding: the fix emits it at every reference too, and a scope
       * BETWEEN a reference and the declaration that binds the new name takes
       * that reference over (Bug #1948). Nothing else notices — the module scope
       * still holds one `submit`, so a redeclaration check passes, and the
       * emitted reference is well-typed against a real binding right up until it
       * is called (`TS2349`). Withholding the whole rename is the only safe
       * answer: alpha-renaming the intervening binding instead would mean owning
       * ITS references as well, and a partial rename is exactly the breakage
       * this prevents.
       */
      return references.some((ref) =>
        bindsNameBelow(ref.from, variable.scope, newName),
      );
    }

    /**
     * A `Property` inside an `ObjectPattern`. Its key names a property of the
     * object being destructured — someone else's API (`const { handleDelete: fn }
     * = useMessage('handleDelete')` reads Stream Chat's own member) — so
     * rewriting the key changes WHICH property is read, strands every reader of
     * the old name, and can emit a keyword that is not a legal binding
     * (Bug #1719). The key is therefore never reported and never rewritten. The
     * only name the file owns here is the local binding, so that is what the
     * report targets when it too carries the prefix.
     */
    function reportDestructuredBinding(node: TSESTree.Property): void {
      // A shorthand binding is a single token that is simultaneously the
      // foreign property name and the local name: there is no name the file
      // chose independently, and no in-place edit can change one without the
      // other. Left alone entirely rather than reported with no remedy.
      if (node.shorthand || node.value.type !== AST_NODE_TYPES.Identifier) {
        return;
      }

      const binding = node.value;
      if (!hasHandlePrefix(binding.name)) {
        return;
      }

      const newName = stripHandlePrefix(binding.name);
      const variable = findPatternVariable(binding);
      const canFix =
        isEmittableName(newName) &&
        !!variable &&
        !isExportedBinding(variable) &&
        !isNameTaken(variable, newName);

      context.report({
        node: binding,
        messageId: 'callbackFunctionPrefix',
        data: { functionName: binding.name },
        fix(fixer) {
          if (!canFix || !variable) {
            return null;
          }
          // Every occurrence in one edit: a rename that reaches the declaration
          // but not its readers is worse than no rename at all.
          const targets = new Set<TSESTree.Node>([binding]);
          for (const ref of variable.references) {
            targets.add(ref.identifier);
          }
          return [...targets].map((id) => fixer.replaceText(id, newName));
        },
      });
    }

    return {
      // Check JSX attributes for callback props
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (
          node.value?.type === 'JSXExpressionContainer' &&
          node.value.expression.type === 'Identifier'
        ) {
          const propName =
            node.name.type === 'JSXIdentifier' ? node.name.name : undefined;

          // Skip React's built-in event handlers
          if (propName?.match(/^on[A-Z]/)) {
            return;
          }

          // Skip PascalCase props as they typically represent components or component-related props
          if (propName && isPascalCase(propName)) {
            return;
          }

          // Skip common non-callback props
          const commonNonCallbackProps = new Set([
            'theme', // MUI ThemeProvider theme prop
            'style', // React style prop
            'className', // React className prop
            'ref', // React ref prop
            'key', // React key prop
            'component', // MUI component prop
            'as', // Styled-components/Emotion as prop
            'sx', // MUI sx prop
            'css', // Emotion css prop
          ]);
          if (propName && commonNonCallbackProps.has(propName)) {
            return;
          }

          // Skip props on components that commonly use function props that aren't callbacks
          const parentName = (node.parent as TSESTree.JSXOpeningElement)?.name;
          const componentName =
            parentName?.type === 'JSXIdentifier' ? parentName.name : undefined;
          const componentsWithFunctionProps = new Set([
            'ThemeProvider', // MUI ThemeProvider
            'Transition', // React Transition Group
            'CSSTransition', // React Transition Group
            'TransitionGroup', // React Transition Group
            'SwitchTransition', // React Transition Group
          ]);
          if (componentName && componentsWithFunctionProps.has(componentName)) {
            return;
          }

          // Check if the value is a function type and not a React component
          if (
            isFunctionType(node.value.expression) &&
            propName &&
            !propName.startsWith('on') &&
            !propName.startsWith('render') &&
            !acceptsNonFunctionValue(node.value.expression) &&
            !isValueAccessor(node.value.expression) &&
            !isRenderFunction(node.value.expression) &&
            !isReactComponentType(node.value.expression)
          ) {
            const eventName =
              propName.charAt(0).toUpperCase() + propName.slice(1);
            // Reported without an autofix (Bug #1522). A JSX attribute name is
            // one end of a props contract: the other end is the declaration
            // that binds the name — a props `type`/`interface`, a
            // `JSX.IntrinsicElements` augmentation for host elements — plus
            // every reader of that member (`props.validate`, destructuring) and
            // every other call site of the component. Rewriting only the
            // attribute yields TS2322, and renaming the local declaration
            // as well merely relocates the break: readers in the same file fail
            // with TS2551 and call sites in other files (which a single-file
            // fixer cannot see, let alone edit atomically) fail with TS2322.
            // No subset of the rename is safe to apply in isolation, so the
            // report carries the full instruction instead of a broken fix.
            context.report({
              node,
              messageId: 'callbackPropPrefix',
              data: {
                propName,
                eventName,
              },
            });
          }
        }
      },

      // Check function declarations and variable declarations for callback functions
      'FunctionDeclaration, VariableDeclarator'(
        node: TSESTree.FunctionDeclaration | TSESTree.VariableDeclarator,
      ) {
        const functionName =
          node.id?.type === 'Identifier' ? node.id.name : undefined;

        if (functionName && hasHandlePrefix(functionName) && node.id) {
          // Skip autofixing for class parameters and getters
          const parent = node.parent;
          if (
            parent?.type === AST_NODE_TYPES.PropertyDefinition ||
            parent?.type === AST_NODE_TYPES.MethodDefinition
          ) {
            context.report({
              node,
              messageId: 'callbackFunctionPrefix',
              data: { functionName },
            });
            return;
          }

          // Get all references to this variable
          const scope = context.getScope();
          const variable = scope.variables.find((v) => v.name === functionName);
          const references = new Set(variable?.references ?? []);

          // Get references from all scopes
          const allScopes = [scope];
          let currentScope = scope;
          while (currentScope.upper) {
            currentScope = currentScope.upper;
            allScopes.push(currentScope);
          }

          // Get references from all scopes and their children
          for (const s of allScopes) {
            // Get references from current scope
            const currentVar = s.variables.find((v) => v.name === functionName);
            if (currentVar) {
              currentVar.references.forEach((ref) => references.add(ref));
            }

            // Get references from child scopes
            const childScopes = s.childScopes;
            for (const childScope of childScopes) {
              const childVar = childScope.variables.find(
                (v) => v.name === functionName,
              );
              if (childVar) {
                childVar.references.forEach((ref) => references.add(ref));
              }
            }
          }

          // Get references from sibling scopes
          const siblingScopes = scope.upper?.childScopes ?? [];
          for (const siblingScope of siblingScopes) {
            if (siblingScope !== scope) {
              const siblingVar = siblingScope.variables.find(
                (v) => v.name === functionName,
              );
              if (siblingVar) {
                siblingVar.references.forEach((ref) => references.add(ref));
              }
            }
          }

          // Get references from global scope
          const sourceCode = context.getSourceCode();
          if (sourceCode.scopeManager?.globalScope) {
            const globalVar =
              sourceCode.scopeManager.globalScope.variables.find(
                (v) => v.name === functionName,
              );
            if (globalVar) {
              globalVar.references.forEach((ref) => references.add(ref));
            }
          }

          // A binding that leaves the module is one end of a cross-file
          // contract. Renaming `export const handleClick` to `click` strands
          // every `import { handleClick }` with TS2724, and a single-file fixer
          // cannot reach those importers — the same reasoning that already
          // withholds the JSX prop rename and the destructured one, which is
          // where `isExportedBinding` was first needed. The violation still
          // reports; only the rename is withheld.
          const declaredVariable = context
            .getDeclaredVariables(node)
            .find((v) =>
              v.identifiers.includes(node.id as TSESTree.Identifier),
            );
          const leavesModule = declaredVariable
            ? isExportedBinding(declaredVariable)
            : isExportedDeclaration(node);

          // Remove 'handle' prefix and convert first character to lowercase
          const newName = stripHandlePrefix(functionName);

          // The rename is emitted at the declaration AND at every reference, so
          // it is safe only where the new name resolves to this declaration at
          // each of them. A binding of that name between a reference and the
          // declaration silently captures the rewritten reference (Bug #1948),
          // and without the binding itself there is no scope chain to ask, so
          // the fix is withheld rather than guessed. The violation still
          // reports; only the rename is withheld.
          const capturesReference =
            !declaredVariable ||
            isNameTaken(declaredVariable, newName, [...references]);

          context.report({
            node,
            messageId: 'callbackFunctionPrefix',
            data: { functionName },
            fix(fixer) {
              if (leavesModule || capturesReference) {
                return null;
              }
              // `const handleDelete = fn` would become `const delete = fn`,
              // which does not parse (Bug #1719).
              if (!isEmittableName(newName)) {
                return null;
              }

              // Fix the declaration and all references
              const fixes: Array<
                import('@typescript-eslint/utils').TSESLint.RuleFix
              > = [];
              fixes.push(fixer.replaceText(node.id!, newName));
              for (const ref of references) {
                if (ref.identifier !== node.id) {
                  fixes.push(fixer.replaceText(ref.identifier, newName));
                }
              }
              return fixes;
            },
          });
        }
      },

      /**
       * Class members (methods and fields) and object-literal members.
       *
       * A class FIELD is a subject here because it is one of the docs' own
       * subjects — "a function, method, class property, or parameter" — and
       * because covering only the method spelling leaves the rule evadable by a
       * single token: `handleClick() {}` reported while `handleClick = () => {}`
       * did not, so writing `=` silenced it without changing anything about the
       * callback (Bug #1949).
       *
       * The field is judged on its NAME alone, not on whether it holds a
       * function — the same question this arm already asks of an object-literal
       * member, that the abstract-member arm asks of `abstract handleSubmit:
       * (d: string) => string`, and that the variable arm asks of `const
       * handleClickCount = 0`. The subject is the `handle<Something>` prefix
       * itself, which describes no action whatever sits to the right of the
       * `=`. Gating on a function-typed value would reinstate the same evasion
       * one level down — `handleClick = makeHandler()` and `handleClick =
       * deps.click` are the identical name behind a value the rule cannot
       * always resolve, and a file parsed without type information resolves
       * none of them.
       */
      'MethodDefinition, PropertyDefinition, Property'(
        node:
          | TSESTree.MethodDefinition
          | TSESTree.PropertyDefinition
          | TSESTree.Property,
      ) {
        const key = node.key;
        if (
          key.type !== AST_NODE_TYPES.Identifier ||
          !key.name ||
          !hasHandlePrefix(key.name)
        ) {
          return;
        }
        const name = key.name;

        // A computed key is an expression evaluated where the class is
        // defined, so the identifier in `[handleClick] = fn` REFERENCES a
        // binding and the member's own name is whatever that binding holds —
        // something the rule cannot read. That binding is a subject in its own
        // right and is reported at its declaration, so reporting the reference
        // too would name a member that need not exist. The abstract-member arm
        // skips a computed key for the same reason.
        if (node.type === AST_NODE_TYPES.PropertyDefinition && node.computed) {
          return;
        }

        // Skip autofixing for class parameters and getters
        if (
          node.type === AST_NODE_TYPES.MethodDefinition &&
          node.kind === 'get'
        ) {
          context.report({
            node: key,
            messageId: 'callbackFunctionPrefix',
            data: { functionName: name },
          });
          return;
        }

        const isProperty = node.type === AST_NODE_TYPES.Property;
        if (isProperty && node.parent?.type === AST_NODE_TYPES.ObjectPattern) {
          reportDestructuredBinding(node);
          return;
        }

        const newName = stripHandlePrefix(name);
        // A shorthand property's key and value are the same token, so replacing
        // the key also replaces the value: `{ handleClick }` becomes
        // `{ click }`, which both renames the member and re-points it at a
        // binding that need not exist (Bug #1719).
        const isRenameable =
          isEmittableName(newName) &&
          // A sibling already holding the target name turns the rename into a
          // duplicate member: `{ click: a, handleClick: b }` would collapse to
          // two `click` keys, silently discarding the first.
          !siblingMemberNames(node.parent).has(newName) &&
          !(isProperty && node.shorthand) &&
          // A member of a class with heritage may be satisfying a declaration
          // the fixer cannot rewrite (Bug #1944).
          !satisfiesDeclaredContract(node) &&
          // A `declare` field defines nothing: it asserts that a property is
          // established somewhere the class body does not show — a base
          // constructor, a decorator, a framework assigning by name — so the
          // definition the rename must move with is out of the fixer's reach,
          // exactly as an abstract declaration's implementors are (Bug #1949).
          !(node.type === AST_NODE_TYPES.PropertyDefinition && node.declare) &&
          !(
            isProperty &&
            node.parent &&
            (isApiSurfaceValue(node.parent) || isReadByName(name))
          );

        // A class member's readers are `this.handleClick` sites in this same
        // file, so the rename owns them and rewrites them in one fix; `null`
        // means at least one reference is beyond its reach (Bug #1946).
        const referenceTargets =
          isRenameable && !isProperty
            ? classMemberRenameTargets(
                node as TSESTree.MethodDefinition | TSESTree.PropertyDefinition,
                name,
              )
            : [];
        const canFix = isRenameable && referenceTargets !== null;

        context.report({
          node: key,
          messageId: 'callbackFunctionPrefix',
          data: { functionName: name },
          fix(fixer) {
            if (!canFix || !referenceTargets) {
              return null;
            }
            // One fix carrying every edit: ESLint applies a fix atomically, so
            // the declaration and its readers cannot be rewritten apart — a
            // partial application would leave the file broken.
            return [key, ...referenceTargets].map((target) =>
              fixer.replaceText(target, newName),
            );
          },
        });
      },

      // The declaration half of a class contract: `abstract handleSubmit(): T`
      // and `abstract handleSubmit: () => T`. The docs scope the subject by what
      // the member IS — "a function, method, class property, or parameter" — and
      // an abstract member is a method or a class property, so silence here is
      // a gap rather than a carve-out (Bug #1944).
      //
      // Report-only, and permanently so: the declaration binds every implementor
      // of the class, and implementors live in files a single-file fixer cannot
      // see, let alone edit atomically. Interface and type-literal members
      // (`TSMethodSignature`, `TSPropertySignature`) are deliberately NOT
      // reported here — a member of a type is a prop declaration, which this
      // rule governs through `callbackPropPrefix`, whose remedy is the OPPOSITE
      // one (`onSubmit`, not `submit`). Reporting both on one declaration would
      // hand the author contradictory instructions.
      'TSAbstractMethodDefinition, TSAbstractPropertyDefinition'(
        node:
          | TSESTree.TSAbstractMethodDefinition
          | TSESTree.TSAbstractPropertyDefinition,
      ) {
        const key = node.key;
        if (
          node.computed ||
          key.type !== AST_NODE_TYPES.Identifier ||
          !hasHandlePrefix(key.name)
        ) {
          return;
        }
        context.report({
          node: key,
          messageId: 'callbackFunctionPrefix',
          data: { functionName: key.name },
        });
      },

      // Check constructor parameters
      TSParameterProperty(node: TSESTree.TSParameterProperty) {
        if (
          node.parameter.type === 'Identifier' &&
          hasHandlePrefix(node.parameter.name)
        ) {
          context.report({
            node,
            messageId: 'callbackFunctionPrefix',
            data: { functionName: node.parameter.name },
          });
        }
      },
    };
  },
});
