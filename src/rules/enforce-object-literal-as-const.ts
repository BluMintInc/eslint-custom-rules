import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

/**
 * A `return` inside a generator yields the generator type's *second* type
 * argument; the first types the `yield`s. `IterableIterator` and friends leave
 * `TReturn` unparameterised, so they carry no constraint on the returned value.
 */
const GENERATOR_TYPE_NAMES = new Set(['Generator', 'AsyncGenerator']);

const PROMISE_TYPE_NAMES = new Set(['Promise', 'PromiseLike']);

/**
 * A readonly tuple is assignable to none of these, so a union member spelled
 * this way cannot rescue an `as const` the rest of the union rejects.
 */
const NON_ARRAY_KEYWORDS = new Set([
  'TSBigIntKeyword',
  'TSBooleanKeyword',
  'TSLiteralType',
  'TSNeverKeyword',
  'TSNullKeyword',
  'TSNumberKeyword',
  'TSStringKeyword',
  'TSSymbolKeyword',
  'TSUndefinedKeyword',
  'TSVoidKeyword',
]);

/**
 * Type arguments are `typeParameters` on this parser version and
 * `typeArguments` on newer ones; both spell the same `<T>` after the name.
 */
function typeArgumentsOf(node: TSESTree.TSTypeReference): TSESTree.TypeNode[] {
  const withTypeArgs = node as unknown as {
    typeArguments?: TSESTree.TSTypeParameterInstantiation;
    typeParameters?: TSESTree.TSTypeParameterInstantiation;
  };
  return (
    (withTypeArgs.typeArguments ?? withTypeArgs.typeParameters)?.params ?? []
  );
}

function typeReferenceNameOf(node: TSESTree.TypeNode): string | undefined {
  if (node.type !== 'TSTypeReference' || node.typeName.type !== 'Identifier') {
    return undefined;
  }
  return node.typeName.name;
}

/**
 * Whether a readonly tuple — what `as const` makes of an array literal — can be
 * assigned to this annotation, judged from syntax alone.
 *
 * Only shapes the annotation states outright are treated as hostile. Anything
 * the rule cannot resolve (a type reference, a type parameter, an object type)
 * counts as accepting, because declining on no evidence would silence the rule
 * across most annotated code.
 */
function acceptsReadonlyArray(typeNode: TSESTree.TypeNode): boolean {
  switch (typeNode.type) {
    // `string[]` and `[string, number]` are mutable: TS4104 rejects a readonly
    // tuple assigned to either.
    case 'TSArrayType':
    case 'TSTupleType':
      return false;
    // `readonly string[]` / `readonly [string, number]`.
    case 'TSTypeOperator':
      return typeNode.operator === 'readonly';
    case 'TSTypeReference':
      return typeReferenceNameOf(typeNode) !== 'Array';
    // Assignable to the union as a whole iff assignable to some member.
    case 'TSUnionType':
      return typeNode.types.some(acceptsReadonlyArray);
    case 'TSIntersectionType':
      return typeNode.types.every(acceptsReadonlyArray);
    default:
      return !NON_ARRAY_KEYWORDS.has(typeNode.type);
  }
}

/**
 * The type a function type annotation declares for its return value, or
 * `undefined` when the annotation is not a function type (a type reference to
 * an aliased signature, say) and so states nothing resolvable here.
 */
function returnTypeOfFunctionType(
  typeNode: TSESTree.TypeNode | undefined,
): TSESTree.TypeNode | undefined {
  if (typeNode?.type !== 'TSFunctionType') {
    return undefined;
  }
  return typeNode.returnType?.typeAnnotation;
}

/**
 * The declared return type visible for `fn`, whether written on the function
 * itself (`function f(): string[]`) or on the site that declares it — a typed
 * variable, a typed class property, or an assertion on the function expression.
 *
 * A callback passed as a call argument is deliberately not resolved: its
 * contextual type lives on the callee's declaration, which is usually in
 * another file, and the in-file shapes that do reach here (`useMemo`, `.map`)
 * annotate their callbacks generically rather than with a mutable array.
 */
function declaredReturnTypeOf(fn: FunctionNode): TSESTree.TypeNode | undefined {
  if (fn.returnType) {
    return fn.returnType.typeAnnotation;
  }
  const { parent } = fn;
  if (!parent) {
    return undefined;
  }
  if (parent.type === 'VariableDeclarator') {
    return parent.id.type === 'Identifier'
      ? returnTypeOfFunctionType(parent.id.typeAnnotation?.typeAnnotation)
      : undefined;
  }
  if (parent.type === 'PropertyDefinition') {
    return returnTypeOfFunctionType(parent.typeAnnotation?.typeAnnotation);
  }
  if (parent.type === 'TSAsExpression') {
    return returnTypeOfFunctionType(parent.typeAnnotation);
  }
  return undefined;
}

/**
 * Every `return` statement lexically owned by `fn` — a `return` inside a
 * nested function returns from that function, not this one, so descent stops
 * at each function boundary. Both single-node and array-valued child
 * properties are walked (`BlockStatement.body` is an array,
 * `IfStatement.consequent` a single node): a walk keyed on a plain `isNode`
 * check alone silently skips every array-shaped child.
 */
function returnStatementsOf(fn: FunctionNode): TSESTree.ReturnStatement[] {
  const returns: TSESTree.ReturnStatement[] = [];
  function visit(node: TSESTree.Node): void {
    if (node.type === 'ReturnStatement') {
      returns.push(node);
      return;
    }
    if (node !== fn && FUNCTION_TYPES.has(node.type)) {
      return;
    }
    for (const key in node) {
      if (key === 'parent') {
        continue;
      }
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (ASTHelpers.isNode(item)) {
            visit(item);
          }
        }
      } else if (ASTHelpers.isNode(value)) {
        visit(value);
      }
    }
  }
  visit(fn.body);
  return returns;
}

/**
 * The type carried by the sole `return` statement's own `as` assertion — a
 * fallback reading used only when the signature itself states nothing. A
 * single return whose expression is asserted to a type states that type as
 * forcefully as a signature would: TS infers nothing beyond it, since there
 * is nothing else to union it with. Two or more returns lose this — each
 * return's own assertion describes only its branch, and the signature TS
 * infers unions them, so no single assertion speaks for the whole function.
 *
 * Reading only the signature is exactly what let
 * `no-redundant-annotation-assertion`'s `--fix` disarm this rule: deleting a
 * signature that repeats a sole return's assertion moves the type
 * information rather than removing it, and this rule read only the moved-from
 * location (#2319).
 *
 * `as const` is excluded: it names no separate type to read here — it is the
 * very rewrite this rule is deciding whether to apply, not a statement of
 * what a signature would accept.
 */
function soleReturnAssertionTypeOf(
  fn: FunctionNode,
): TSESTree.TypeNode | undefined {
  const returns = returnStatementsOf(fn);
  if (returns.length !== 1) {
    return undefined;
  }
  const { argument } = returns[0];
  if (!argument || argument.type !== 'TSAsExpression') {
    return undefined;
  }
  const { typeAnnotation } = argument;
  const isAsConst =
    typeAnnotation.type === 'TSTypeReference' &&
    typeAnnotation.typeName.type === 'Identifier' &&
    typeAnnotation.typeName.name === 'const';
  return isAsConst ? undefined : typeAnnotation;
}

/**
 * The type the *returned expression* must satisfy. For an async function or a
 * generator the declared return type wraps that expression's type, so the
 * wrapper is peeled off before the annotation is judged.
 *
 * With no signature annotation in view, the sole return statement's own
 * assertion (`soleReturnAssertionTypeOf`) is read directly as the value's
 * type instead: it targets the returned expression itself, not a
 * function-level return type, so it carries no Promise/Generator wrapper to
 * peel the way a signature annotation would.
 */
function returnedValueTypeOf(fn: FunctionNode): TSESTree.TypeNode | undefined {
  const declared = declaredReturnTypeOf(fn);
  if (!declared) {
    return soleReturnAssertionTypeOf(fn);
  }
  const referenceName = typeReferenceNameOf(declared);
  if (fn.generator) {
    return referenceName && GENERATOR_TYPE_NAMES.has(referenceName)
      ? typeArgumentsOf(declared as TSESTree.TSTypeReference)[1]
      : undefined;
  }
  if (fn.async) {
    return referenceName && PROMISE_TYPE_NAMES.has(referenceName)
      ? typeArgumentsOf(declared as TSESTree.TSTypeReference)[0]
      : undefined;
  }
  return declared;
}

export const enforceObjectLiteralAsConst = createRule({
  name: 'enforce-object-literal-as-const',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce that object literals returned from functions should be marked with `as const` to ensure type safety and immutability.',
      recommended: 'error',
    },
    fixable: 'code',
    messages: {
      enforceAsConst:
        'Object literals returned from functions should be marked with `as const` to ensure type safety and immutability',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    /**
     * Checks if the node is inside a React hook like useMemo
     */
    function isInsideReactHook(ancestors: TSESTree.Node[]): boolean {
      for (let i = 0; i < ancestors.length; i++) {
        const ancestor = ancestors[i];

        // Check for CallExpression (function call)
        if (ancestor.type === 'CallExpression') {
          const callee = ancestor.callee;

          // Check if it's a hook like useMemo, useCallback, etc.
          if (
            callee.type === 'Identifier' &&
            (callee.name === 'useMemo' ||
              callee.name === 'useCallback' ||
              callee.name.startsWith('use'))
          ) {
            return true;
          }
        }
      }
      return false;
    }

    /**
     * Checks if the (unwrapped) return argument is an array literal.
     *
     * Arrays returned from React hook callbacks represent memoized data/prop
     * lists (component props, hit lists, tab labels, etc.). Freezing them into
     * readonly tuples via `as const` fights the mutable/`readonly`-array types
     * they flow into downstream, so any array returned from a hook is exempt —
     * regardless of whether its elements are inline object literals (`[{...}]`),
     * identifier/member references to objects (`[ANY_GAME_HIT]`,
     * `[constants.HIT]`), or primitives. The rule has no type information, so it
     * cannot narrow this further without reintroducing the false positives
     * issues #511 and #1324 document.
     */
    function isArrayLiteral(node: TSESTree.Node): boolean {
      return node.type === 'ArrayExpression';
    }

    /**
     * The function the `return` belongs to — the nearest one, so a `return`
     * inside a nested callback is judged against that callback's annotation
     * rather than the outer function's.
     */
    function enclosingFunctionOf(
      ancestors: TSESTree.Node[],
    ): FunctionNode | undefined {
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const ancestor = ancestors[i];
        if (FUNCTION_TYPES.has(ancestor.type)) {
          return ancestor as FunctionNode;
        }
      }
      return undefined;
    }

    /**
     * `as const` turns an array literal into a fixed-length readonly *tuple*,
     * strictly narrower than the mutable array the literal otherwise gets. Two
     * separate breakages follow from that narrowing, and neither is visible at
     * the literal:
     *
     * - Where the enclosing signature declares a mutable array or tuple, TS4104
     *   refuses the assignment, so appending `as const` breaks the build. No
     *   edit at the literal satisfies the rule — honouring it means rewriting
     *   the signature, a call the author has to make (#1526).
     * - Where the signature is inferred, the frozen arity becomes part of the
     *   return type and every caller inherits it: `.length` narrows to a literal
     *   number (TS2367 against any other length), `.includes` narrows its
     *   parameter to the element union — `never` for `[]` — (TS2345), and the
     *   value stops satisfying a mutable `T[]` parameter. The break lands in a
     *   different function than the one edited, and the callers are beyond what
     *   the rule can see (#2015).
     *
     * So an array literal is left alone unless the enclosing signature states a
     * type that accepts a readonly tuple. An annotation the rule cannot resolve
     * still counts as accepting, per `acceptsReadonlyArray`: the annotation, not
     * the literal, is what callers read, so the arity never escapes.
     *
     * Object literals are unaffected: `readonly` property modifiers do not
     * enter assignability, so `{ a: 1 } as const` still satisfies a mutable
     * `{ a: number }`, and freezing one fixes no arity.
     */
    function freezingArrayIsUnsafe(
      literal: TSESTree.Node,
      ancestors: TSESTree.Node[],
    ): boolean {
      if (!isArrayLiteral(literal)) {
        return false;
      }
      const enclosingFunction = enclosingFunctionOf(ancestors);
      // With no declared return type in view — neither the signature nor, as
      // a fallback, the sole return statement's own assertion — the inferred
      // tuple is what the callers get.
      if (
        !enclosingFunction ||
        (!declaredReturnTypeOf(enclosingFunction) &&
          !soleReturnAssertionTypeOf(enclosingFunction))
      ) {
        return true;
      }
      const returnedValueType = returnedValueTypeOf(enclosingFunction);
      return !!returnedValueType && !acceptsReadonlyArray(returnedValueType);
    }

    return {
      ReturnStatement(node) {
        // Skip if there's no argument in the return statement
        if (!node.argument) {
          return;
        }

        // Check if the return statement is inside a function
        const sourceCode = context.getSourceCode();
        // Use ASTHelpers.getAncestors for ESLint v8/v9 compatibility
        const ancestors = ASTHelpers.getAncestors(context, node);
        const isInFunction = ancestors.some(
          (ancestor) =>
            ancestor.type === 'FunctionDeclaration' ||
            ancestor.type === 'ArrowFunctionExpression' ||
            ancestor.type === 'FunctionExpression' ||
            ancestor.type === 'MethodDefinition',
        );

        if (!isInFunction) {
          return;
        }

        // Check if the return value is an object or array literal
        const { argument } = node;

        // Skip if the return value already has 'as const' assertion
        if (argument.type === 'TSAsExpression') {
          const tsAsExpression = argument as TSESTree.TSAsExpression;

          // Check if the type annotation is 'const'
          if (
            tsAsExpression.typeAnnotation.type === 'TSTypeReference' &&
            tsAsExpression.typeAnnotation.typeName.type === 'Identifier' &&
            tsAsExpression.typeAnnotation.typeName.name === 'const'
          ) {
            return;
          }

          // If it has another type assertion but not 'as const', we still need to check
          // if the expression is an object/array literal
          if (
            tsAsExpression.expression.type !== 'ObjectExpression' &&
            tsAsExpression.expression.type !== 'ArrayExpression'
          ) {
            return;
          }
        } else if (
          argument.type !== 'ObjectExpression' &&
          argument.type !== 'ArrayExpression'
        ) {
          // Skip if not an object/array literal and not a type assertion
          return;
        }

        // Skip if the return value uses spread operator
        if (
          (argument.type === 'ObjectExpression' &&
            argument.properties.some(
              (prop) => prop.type === 'SpreadElement',
            )) ||
          (argument.type === 'ArrayExpression' &&
            argument.elements.some(
              (elem) => elem !== null && elem.type === 'SpreadElement',
            ))
        ) {
          return;
        }

        const literal =
          argument.type === 'TSAsExpression'
            ? (argument as TSESTree.TSAsExpression).expression
            : argument;

        // Skip arrays returned from React hooks (memoized data/prop lists that
        // must not be frozen into readonly tuples — see #511 and #1324)
        if (isInsideReactHook(ancestors) && isArrayLiteral(literal)) {
          return;
        }

        // Skip arrays whose enclosing signature does not accept the readonly
        // tuple `as const` produces — declared mutable (#1526) or inferred, in
        // which case the frozen arity reaches every caller (#2015)
        if (freezingArrayIsUnsafe(literal, ancestors)) {
          return;
        }

        // Report the issue and provide a fix
        context.report({
          node,
          messageId: 'enforceAsConst',
          fix(fixer) {
            // A literal already carrying an explicit assertion states a contract
            // the fix cannot preserve: `as const` produces a readonly,
            // literal-typed shape that is structurally different from the
            // asserted type, so rewriting `as SomeType` into `as const` silently
            // changes what the function returns and can break the signature the
            // assertion was written to satisfy. The diagnostic still holds — the
            // author may well want `as const` — but choosing between the two
            // types needs a human, so decline to fix (#1503).
            //
            // Any `TSAsExpression` reaching here is a non-`const` assertion; the
            // `as const` case returns before the report. The angle-bracket form
            // (`<SomeType>{...}`, a `TSTypeAssertion`) needs no branch here
            // because it is never detected above — tsc rejects testing for it.
            if (argument.type === 'TSAsExpression') {
              return null;
            }

            return fixer.replaceText(
              argument,
              `${sourceCode.getText(argument)} as const`,
            );
          },
        });
      },
    };
  },
});
