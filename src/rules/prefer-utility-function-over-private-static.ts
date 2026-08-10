import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { getMethodName } from '../utils/getMethodName';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds =
  | 'preferUtilityFunctionOverPrivateStatic'
  | 'preferUtilityFunctionOverPrivateStaticGetter';

type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;

/**
 * A body of a single statement is trivial: extracting it to a module-level
 * utility buys nothing, so the rule stays silent below this many statements.
 *
 * Two statements is the same boundary the physical-line threshold this replaces
 * drew for conventionally formatted code — a body written one statement per
 * line spans `statements + 2` lines, so the former "fewer than 4 lines" escape
 * is exactly "fewer than 2 statements".
 */
const MIN_REPORTED_STATEMENTS = 2;

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
]);

/**
 * The single statement a function body holds when that body is the block
 * spelling of a concise arrow, and null otherwise.
 *
 * `(x) => x * 2` and `(x) => { return x * 2; }` are the same helper, and so are
 * `(x) => log(x)` and `(x) => { log(x); }`. One spelling carries a statement
 * node and the other carries none, so counting the block form's statement would
 * make the size verdict turn on which spelling an author picked — the defect
 * this measure exists to remove.
 */
const conciseSpellingStatement = (
  node: TSESTree.Node,
): TSESTree.Node | null => {
  if (!FUNCTION_TYPES.has(node.type)) {
    return null;
  }

  const body = (node as TSESTree.FunctionLike).body;
  if (!body || body.type !== 'BlockStatement' || body.body.length !== 1) {
    return null;
  }

  const only = body.body[0];
  return only.type === 'ReturnStatement' || only.type === 'ExpressionStatement'
    ? only
    : null;
};

/**
 * Counts the statements a method contains.
 *
 * The size escape asks how much work a helper does, which physical lines answer
 * badly: a comment or a blank line inside the body inflates the count, a
 * statement wrapped across several lines inflates it further, and several
 * statements joined onto one line deflate it to nothing. Statements move with
 * none of those.
 *
 * Nested statements count — those inside blocks, control flow and inner
 * functions. Counting only the body's own `body.length` would exempt every
 * helper whose logic sits inside a single `try`, `if` or `for`, or that hands
 * its work to one multi-statement callback, which describes most non-trivial
 * helpers.
 *
 * A `BlockStatement` contributes nothing of its own because it is a container
 * for the statements already counted inside it.
 */
const countStatements = (root: TSESTree.Node): number => {
  // Statements a concise arrow would not have carried, collected as their
  // enclosing function is reached and skipped when the walk arrives at them.
  const conciseSpellings = new Set<TSESTree.Node>();
  let count = 0;

  const visit = (node: TSESTree.Node) => {
    const isCountedStatement =
      node.type !== 'BlockStatement' &&
      (node.type.endsWith('Statement') || node.type.endsWith('Declaration'));

    if (isCountedStatement && !conciseSpellings.has(node)) {
      count += 1;
    }

    const conciseSpelling = conciseSpellingStatement(node);
    if (conciseSpelling) {
      conciseSpellings.add(conciseSpelling);
    }

    for (const key in node) {
      if (key === 'parent') {
        continue;
      }

      const child = (node as unknown as Record<string, unknown>)[key];

      if (Array.isArray(child)) {
        for (const item of child) {
          if (ASTHelpers.isNode(item)) {
            visit(item);
          }
        }
      } else if (ASTHelpers.isNode(child)) {
        visit(child);
      }
    }
  };

  visit(root);

  return count;
};

export const preferUtilityFunctionOverPrivateStatic = createRule<
  [],
  MessageIds
>({
  name: 'prefer-utility-function-over-private-static',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce abstraction of private static methods into utility functions',
      recommended: 'error',
    },
    schema: [],
    messages: {
      preferUtilityFunctionOverPrivateStatic:
        'Private static method "{{methodName}}" in class "{{className}}" does not use class state. Keeping class-agnostic helpers as private statics hides reusable logic and signals coupling that is not present. Extract this logic into a standalone utility function (module-level or shared) and import it where needed so it can be reused and unit tested independently.',
      // A getter carries the same hidden helper as a method, but the remedy
      // differs in one step — module scope has no getter form, so the extracted
      // function is called from the accessor (or from its call sites) rather
      // than replacing it. Naming the subject "method" for an accessor sends a
      // developer looking for a declaration that is not there.
      preferUtilityFunctionOverPrivateStaticGetter:
        'Private static getter "{{methodName}}" in class "{{className}}" does not use class state. Keeping class-agnostic helpers as private statics hides reusable logic and signals coupling that is not present. Extract this logic into a standalone utility function (module-level or shared) and call it from the getter, or from the call sites directly, so it can be reused and unit tested independently.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    /**
     * The variable each identifier in the file resolves to, built from the
     * scope manager on first use because most files hold no private static
     * member at all and so never need it.
     *
     * Resolution has to run from the identifier rather than from a name lookup:
     * an alias is credited only when the binding it refers to is the class
     * binding itself, and a name lookup cannot tell a shadowing local apart
     * from the class.
     */
    let variablesByIdentifier: Map<
      TSESTree.Node,
      TSESLint.Scope.Variable
    > | null = null;

    const variableOf = (
      identifier: TSESTree.Identifier,
    ): TSESLint.Scope.Variable | null => {
      if (!variablesByIdentifier) {
        variablesByIdentifier = new Map();
        for (const scope of sourceCode.scopeManager?.scopes ?? []) {
          for (const reference of scope.references) {
            if (reference.resolved) {
              variablesByIdentifier.set(
                reference.identifier,
                reference.resolved,
              );
            }
          }
        }
      }

      return variablesByIdentifier.get(identifier) ?? null;
    };

    // Type-only syntax wraps a value without changing which binding it names,
    // so `(ClassName as typeof ClassName).member` reaches the same state the
    // bare spelling does.
    const TYPE_WRAPPER_TYPES = new Set([
      'TSAsExpression',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
      'TSTypeAssertion',
    ]);

    const unwrapTypeSyntax = (node: TSESTree.Node): TSESTree.Node => {
      let current = node;
      while (TYPE_WRAPPER_TYPES.has(current.type)) {
        current = (current as unknown as { expression: TSESTree.Node })
          .expression;
      }
      return current;
    };

    /**
     * Whether an expression evaluates to the class itself: the class binding, or
     * a local holding it as in `const owner = ClassName`.
     *
     * Alias chains are followed to a fixpoint rather than to a fixed number of
     * hops: `const a = ClassName; const b = a; b.MEMBER` reads the same member
     * as `ClassName.MEMBER`, and no chain length changes that answer, so any
     * bound would be arbitrary and would misreport the read one hop past it.
     * Termination holds because each hop consumes a distinct variable from the
     * file's finite set, tracked in `visited`.
     *
     * An alias is credited only when it provably still holds the class wherever
     * it is dereferenced: exactly one definition, a plain identifier binding, an
     * initializer that is the class, and no later write. A binding reassigned
     * anywhere may hold something else by the time it is used, and crediting it
     * would exempt a helper that never touches the class.
     */
    const holdsClassBinding = (
      node: TSESTree.Node,
      classBindingIdentifiers: ReadonlySet<TSESTree.Node>,
      visited: Set<TSESLint.Scope.Variable> = new Set(),
    ): boolean => {
      const target = unwrapTypeSyntax(node);
      if (target.type !== 'Identifier') {
        return false;
      }

      if (classBindingIdentifiers.has(target)) {
        return true;
      }

      const variable = variableOf(target);
      if (!variable || visited.has(variable)) {
        return false;
      }
      visited.add(variable);

      if (variable.defs.length !== 1) {
        return false;
      }

      const [definition] = variable.defs;
      if (
        definition.type !== 'Variable' ||
        definition.node.type !== 'VariableDeclarator' ||
        definition.node.id.type !== 'Identifier' ||
        !definition.node.init
      ) {
        return false;
      }

      const isReassigned = variable.references.some(
        (reference) => reference.isWrite() && !reference.init,
      );
      if (isReassigned) {
        return false;
      }

      return holdsClassBinding(
        definition.node.init,
        classBindingIdentifiers,
        visited,
      );
    };

    // A method reads the class it is declared on through several spellings, all
    // equivalent: `this.x`, `super.x`, `new.target` and `ClassName.x`. The last
    // one is resolved by identity against the class binding (see
    // collectClassBindingIdentifiers) so that a shadowing local of the same name
    // does not read as class state, and it follows aliases of that binding so
    // that the syntax reaching a member does not change the answer.
    const referencesClassState = (
      node: TSESTree.Node,
      classBindingIdentifiers: ReadonlySet<TSESTree.Node>,
    ): boolean => {
      if (!node) return false;

      if (node.type === 'ThisExpression' || node.type === 'Super') {
        return true;
      }

      if (
        node.type === 'MetaProperty' &&
        node.meta.name === 'new' &&
        node.property.name === 'target'
      ) {
        return true;
      }

      // `ClassName.member` — including the optional-chained `ClassName?.member`,
      // whose MemberExpression is reached through its wrapping ChainExpression,
      // and `owner.member` where `owner` is a local holding the class.
      if (
        node.type === 'MemberExpression' &&
        holdsClassBinding(node.object, classBindingIdentifiers)
      ) {
        return true;
      }

      // `const { MEMBER } = ClassName` reaches the same state `ClassName.MEMBER`
      // does; the pattern is the dereference. It has to name a member to be
      // one: an empty pattern reads nothing, and a lone rest element selects no
      // property either — `no-unnecessary-destructuring` reports exactly that
      // shape and rewrites it to the plain assignment it already is.
      if (
        node.type === 'VariableDeclarator' &&
        node.id.type === 'ObjectPattern' &&
        node.id.properties.some((property) => property.type === 'Property') &&
        node.init &&
        holdsClassBinding(node.init, classBindingIdentifiers)
      ) {
        return true;
      }

      // Check all child properties that are objects or arrays
      for (const key in node) {
        const child = (node as any)[key];

        // Skip non-object properties and special properties
        if (!child || typeof child !== 'object' || key === 'parent') {
          continue;
        }

        // If it's an array, check each element
        if (Array.isArray(child)) {
          for (const item of child) {
            if (
              item &&
              typeof item === 'object' &&
              referencesClassState(item, classBindingIdentifiers)
            ) {
              return true;
            }
          }
        } else if (referencesClassState(child, classBindingIdentifiers)) {
          // If it's an object, recursively check it
          return true;
        }
      }

      return false;
    };

    const getClassNode = (
      method: TSESTree.MethodDefinition,
    ): ClassNode | null => {
      const classNode = method.parent?.parent;

      if (
        classNode &&
        (classNode.type === 'ClassDeclaration' ||
          classNode.type === 'ClassExpression')
      ) {
        return classNode;
      }

      return null;
    };

    // An anonymous class expression that is not bound to a name yields null:
    // there is no spelling of the class to match against.
    const getClassName = (classNode: ClassNode): string | null => {
      if (classNode.id && classNode.id.type === 'Identifier') {
        return classNode.id.name;
      }

      if (
        classNode.type === 'ClassExpression' &&
        classNode.parent &&
        classNode.parent.type === 'VariableDeclarator' &&
        classNode.parent.id.type === 'Identifier'
      ) {
        return classNode.parent.id.name;
      }

      if (
        classNode.type === 'ClassExpression' &&
        classNode.parent &&
        classNode.parent.type === 'AssignmentExpression' &&
        classNode.parent.left.type === 'Identifier'
      ) {
        return classNode.parent.left.name;
      }

      return null;
    };

    /**
     * Whether a variable is the binding for this class rather than an unrelated
     * one that happens to share its name.
     */
    const isClassVariable = (
      variable: TSESLint.Scope.Variable,
      classNode: ClassNode,
    ): boolean =>
      variable.defs.some(
        (definition) =>
          definition.node === classNode ||
          (definition.node.type === 'VariableDeclarator' &&
            definition.node.init === classNode),
      );

    /**
     * Collects the identifier nodes that resolve to the class binding itself.
     * Resolution starts at the class scope, so a named class picks up its inner
     * binding and an anonymous class expression picks up the variable it is
     * assigned to. Matching by identity rather than by name text is what keeps a
     * local variable or parameter that shadows the class name from masquerading
     * as class state.
     *
     * A class declaration carries a second binding — the one its enclosing scope
     * holds — and code outside the class body resolves to that one. It names the
     * same class, so it is collected too, which lets an alias declared outside
     * the class body still read as the class. It is admitted only after
     * confirming the variable is defined by this class node, since a name match
     * alone would let an unrelated outer binding pass.
     */
    const collectClassBindingIdentifiers = (
      classNode: ClassNode,
      className: string | null,
    ): ReadonlySet<TSESTree.Node> => {
      const identifiers = new Set<TSESTree.Node>();

      if (!className) {
        return identifiers;
      }

      const classScope = sourceCode.scopeManager?.acquire(classNode);
      if (!classScope) {
        return identifiers;
      }

      const classVariable = ASTHelpers.findVariableInScope(
        classScope,
        className,
      );
      if (!classVariable) {
        return identifiers;
      }

      const enclosingVariable = classScope.upper
        ? ASTHelpers.findVariableInScope(classScope.upper, className)
        : null;

      const classVariables = [classVariable];
      if (
        enclosingVariable &&
        enclosingVariable !== classVariable &&
        isClassVariable(enclosingVariable, classNode)
      ) {
        classVariables.push(enclosingVariable);
      }

      for (const variable of classVariables) {
        for (const reference of variable.references) {
          identifiers.add(reference.identifier);
        }
      }

      return identifiers;
    };

    return {
      'MethodDefinition[static=true][accessibility="private"]'(
        node: TSESTree.MethodDefinition,
      ) {
        // A setter is out of scope whatever its size: it has no return value
        // and module scope has no setter form, so "extract this logic into a
        // standalone utility function" names a rewrite its author cannot
        // perform. A rule whose remedy cannot be carried out is unenforceable,
        // and the accessor still has to exist to receive the assignment.
        if (node.kind === 'set') {
          return;
        }

        const methodBody = node.value.body;

        if (!methodBody) {
          return;
        }

        // Skip trivial methods, measured in statements so that formatting —
        // comments, blank lines, wrapping, or statements joined onto one line —
        // cannot move the verdict. The whole method is measured, not just its
        // body block, so that its own body and every function nested in it are
        // counted by the same rule.
        if (countStatements(node.value) < MIN_REPORTED_STATEMENTS) {
          return;
        }

        const classNode = getClassNode(node);
        const className = classNode ? getClassName(classNode) : null;
        const classBindingIdentifiers = classNode
          ? collectClassBindingIdentifiers(classNode, className)
          : new Set<TSESTree.Node>();

        // A method that reaches its own class cannot become a module-level
        // utility: a `private static` member is unreachable from module scope.
        if (referencesClassState(methodBody, classBindingIdentifiers)) {
          return;
        }

        const methodName =
          getMethodName(node, sourceCode, {
            computedFallbackToText: false,
          }) || '<unknown>';

        context.report({
          node,
          messageId:
            node.kind === 'get'
              ? 'preferUtilityFunctionOverPrivateStaticGetter'
              : 'preferUtilityFunctionOverPrivateStatic',
          data: {
            methodName,
            className: className ?? 'this class',
          },
        });
      },
    };
  },
});
