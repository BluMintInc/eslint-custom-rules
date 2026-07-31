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
 * The type the *returned expression* must satisfy. For an async function or a
 * generator the declared return type wraps that expression's type, so the
 * wrapper is peeled off before the annotation is judged.
 */
function returnedValueTypeOf(fn: FunctionNode): TSESTree.TypeNode | undefined {
  const declared = declaredReturnTypeOf(fn);
  if (!declared) {
    return undefined;
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
     * `as const` turns an array literal into a readonly *tuple*, which TS4104
     * refuses to assign to a mutable array or tuple. Where the annotation says
     * the value must be mutable, appending `as const` breaks the build, and no
     * edit at the literal can satisfy the rule — honouring it would mean
     * rewriting the signature, a call the author has to make. So the rule stays
     * silent rather than reporting something the developer cannot act on
     * (#1526).
     *
     * Object literals are unaffected: `readonly` property modifiers do not
     * enter assignability, so `{ a: 1 } as const` still satisfies a mutable
     * `{ a: number }`.
     */
    function conflictsWithDeclaredType(
      literal: TSESTree.Node,
      ancestors: TSESTree.Node[],
    ): boolean {
      if (!isArrayLiteral(literal)) {
        return false;
      }
      const enclosingFunction = enclosingFunctionOf(ancestors);
      if (!enclosingFunction) {
        return false;
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
        const sourceCode = context.sourceCode;
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

        // Skip arrays the enclosing signature declares mutable: `as const`
        // cannot compile there and the developer cannot act on the report
        // (#1526)
        if (conflictsWithDeclaredType(literal, ancestors)) {
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
