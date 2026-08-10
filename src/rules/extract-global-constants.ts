import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';

function isInsideFunction(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression'
    ) {
      return true;
    }
    current = current.parent as TSESTree.Node;
  }
  return false;
}

type FunctionLikeNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

/**
 * Walks every child node except `parent` (which would loop back out of the
 * subtree) and reports whether any of them satisfies the predicate.
 */
function someChildNode(
  node: TSESTree.Node,
  predicate: (child: TSESTree.Node) => boolean,
): boolean {
  for (const key of Object.keys(node)) {
    if (key === 'parent') {
      continue;
    }
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (ASTHelpers.isNode(item) && predicate(item)) {
          return true;
        }
      }
    } else if (ASTHelpers.isNode(value) && predicate(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the subtree reads `this`, `super`, or `new.target` from the scope
 * that lexically encloses it. `declarationIncludesIdentifier` answers the
 * identifier half of "does this helper read from its scope?", but a bare
 * `this` (or `super`, or `new.target`) is not an Identifier node, so an arrow
 * whose only capture is its lexical `this` would otherwise read as
 * free-standing — an inverted answer, not a missed one. The walk stops at
 * nodes that rebind `this` (`function` bodies and class bodies): a `this`
 * inside those belongs to them, so it does not pin the helper to its
 * surroundings.
 */
function capturesLexicalContext(node: TSESTree.Node): boolean {
  if (
    node.type === AST_NODE_TYPES.ThisExpression ||
    node.type === AST_NODE_TYPES.Super
  ) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.MetaProperty) {
    return node.meta.name === 'new';
  }
  if (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ClassBody
  ) {
    return false;
  }
  return someChildNode(node, capturesLexicalContext);
}

/**
 * Type parameters declared by the functions and classes that enclose `node`.
 * A helper whose signature references one of these names cannot be hoisted:
 * the name is scope-bound even when the runtime body closes over nothing.
 * The `TSTypeParameterDeclaration` check keeps instantiation sites
 * (`TSTypeParameterInstantiation`, e.g. on a call or a type reference) from
 * contributing names.
 */
function enclosingTypeParameterNames(node: TSESTree.Node): Set<string> {
  const names = new Set<string>();
  let current = node.parent as TSESTree.Node | undefined;
  while (current) {
    const { typeParameters } = current as TSESTree.Node & {
      typeParameters?: TSESTree.TSTypeParameterDeclaration;
    };
    if (typeParameters?.type === AST_NODE_TYPES.TSTypeParameterDeclaration) {
      for (const param of typeParameters.params) {
        names.add(param.name.name);
      }
    }
    current = current.parent as TSESTree.Node | undefined;
  }
  return names;
}

function referencesTypeName(
  node: TSESTree.Node,
  names: ReadonlySet<string>,
): boolean {
  if (
    node.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeName.type === AST_NODE_TYPES.Identifier &&
    names.has(node.typeName.name)
  ) {
    return true;
  }
  return someChildNode(node, (child) => referencesTypeName(child, names));
}

/**
 * Whether the helper's types are pinned to an enclosing scope. Runtime
 * dependencies are not the only hoisting blocker: `function outer<T>() {
 * const makeList = (): T[] => []; }` reads no value from `outer`, yet moving
 * it to module scope leaves `T` unresolvable. Names the helper redeclares as
 * its own type parameters shadow the enclosing ones, so they are subtracted
 * before scanning; the declarator's own annotation (`const makeList: () =>
 * T[] = ...`) sits outside the helper and can never see the helper's type
 * parameters, so it is scanned against the unsubtracted set.
 */
function referencesEnclosingTypeParameter(
  fn: FunctionLikeNode,
  declaration?: TSESTree.VariableDeclarator,
): boolean {
  const enclosingNames = enclosingTypeParameterNames(fn);
  if (enclosingNames.size === 0) {
    return false;
  }

  const idAnnotation =
    declaration?.id?.type === AST_NODE_TYPES.Identifier
      ? declaration.id.typeAnnotation
      : undefined;
  if (idAnnotation && referencesTypeName(idAnnotation, enclosingNames)) {
    return true;
  }

  const visibleNames = new Set(enclosingNames);
  for (const param of fn.typeParameters?.params ?? []) {
    visibleNames.delete(param.name.name);
  }
  return visibleNames.size > 0 && referencesTypeName(fn, visibleNames);
}

/**
 * Whether hoisting the helper to module scope could change behaviour or break
 * compilation. Shared by both spellings of a nested helper — `function
 * inner()` and `const inner = () =>` — so the two answer the hoisting
 * question identically (#1755).
 */
function helperCannotBeHoisted(
  fn: FunctionLikeNode,
  declaration?: TSESTree.VariableDeclarator,
): boolean {
  return (
    ASTHelpers.declarationIncludesIdentifier(fn) ||
    capturesLexicalContext(fn) ||
    referencesEnclosingTypeParameter(fn, declaration)
  );
}

const unwrapOnce = (
  node: TSESTree.Expression | null,
): TSESTree.Expression | null => {
  if (!node) return null;
  const maybeParen = node as {
    type?: string;
    expression?: TSESTree.Expression | null;
  };
  if (maybeParen.type === 'ParenthesizedExpression') {
    return maybeParen.expression ?? null;
  }
  switch (node.type) {
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.ChainExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
      return node.expression as TSESTree.Expression | null;
    default:
      return null;
  }
};

function unwrapExpression(
  node: TSESTree.Expression | null,
): TSESTree.Expression | null {
  let current: TSESTree.Expression | null = node;
  while (current) {
    const inner = unwrapOnce(current);
    if (!inner) break;
    current = inner;
  }
  return current;
}

function isMutableValue(node: TSESTree.Expression | null): boolean {
  const unwrapped = unwrapExpression(node);
  if (!unwrapped) return false;

  // If explicitly marked readonly with `as const`, treat as immutable
  if (node && isAsConstExpression(node)) {
    return false;
  }

  // Check for JSX elements (always mutable due to props/context)
  if (unwrapped.type === 'JSXElement' || unwrapped.type === 'JSXFragment') {
    return true;
  }

  // Check for object expressions (always mutable)
  if (unwrapped.type === 'ObjectExpression') {
    return true;
  }

  // Arrays are mutable objects unless explicitly narrowed with `as const`.
  if (unwrapped.type === 'ArrayExpression') {
    return true;
  }

  // Check for new expressions (e.g., new Map(), new Set())
  if (unwrapped.type === 'NewExpression') {
    return true;
  }

  // Check for array/object methods that return mutable values
  if (unwrapped.type === 'CallExpression') {
    const callee = unwrapped.callee;
    if (callee.type === 'MemberExpression') {
      // Handle both Identifier and non-Identifier property nodes
      if (callee.property.type !== 'Identifier') {
        return false;
      }
      const methodName = callee.property.name;
      const mutatingMethods = [
        'slice',
        'map',
        'filter',
        'concat',
        'from',
        'reduce',
        'flatMap',
        'splice',
        'reverse',
        'sort',
        'fill',
      ];
      return mutatingMethods.includes(methodName);
    }
  }

  return false;
}

function isNumericLiteral(node: TSESTree.Node | null): boolean {
  if (!node) return false;
  return (
    node.type === 'Literal' &&
    typeof (node as TSESTree.Literal).value === 'number'
  );
}

function isZeroOrOne(node: TSESTree.Node | null): boolean {
  if (!isNumericLiteral(node)) return false;
  const value = (node as TSESTree.Literal).value as number;
  return value === 0 || value === 1;
}

function isAsConstExpression(node: TSESTree.Node | null): boolean {
  let current = node as TSESTree.Expression | null;
  while (current) {
    if (
      current.type === 'TSAsExpression' &&
      current.typeAnnotation.type === 'TSTypeReference' &&
      current.typeAnnotation.typeName.type === 'Identifier' &&
      current.typeAnnotation.typeName.name === 'const'
    ) {
      return true;
    }
    current = unwrapOnce(current);
  }
  return false;
}

type DeclaratorAnalysis = {
  isFunctionOrMutable: boolean;
  hasDependencies: boolean;
  hasAsConstAssertion: boolean;
  hasReportableIdentifier: boolean;
};

/**
 * The function definition an initializer resolves to, stepping over TS
 * assertion wrappers so `(() => 1) as Handler` classifies the same way as the
 * bare arrow.
 */
function functionDefinitionOf(
  node: TSESTree.Expression | null,
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null {
  const unwrapped = unwrapExpression(node);
  if (
    unwrapped?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    unwrapped?.type === AST_NODE_TYPES.FunctionExpression
  ) {
    return unwrapped;
  }
  return null;
}

function analyzeDeclarator(
  declaration: TSESTree.VariableDeclarator,
): DeclaratorAnalysis {
  const init = declaration.init ?? null;
  const functionInit = functionDefinitionOf(init);
  /**
   * A function-valued initializer is a nested helper: the same hoisting
   * question as a `function` declaration, asked in a different spelling
   * (#1755). It is exempt only when hoisting could change behaviour — it
   * closes over an enclosing binding, captures lexical `this`/`super`, or
   * names an enclosing type parameter. A helper pinned by none of these flows
   * through the same report path as a plain constant.
   */
  const isFunctionOrMutable = functionInit
    ? helperCannotBeHoisted(functionInit, declaration)
    : isMutableValue(init);

  return {
    isFunctionOrMutable,
    hasDependencies:
      !isFunctionOrMutable && init
        ? ASTHelpers.declarationIncludesIdentifier(init)
        : false,
    hasAsConstAssertion:
      !isFunctionOrMutable && init ? isAsConstExpression(init) : false,
    hasReportableIdentifier:
      declaration.id?.type === AST_NODE_TYPES.Identifier &&
      !isFunctionOrMutable,
  };
}

export const extractGlobalConstants: TSESLint.RuleModule<
  'extractGlobalConstants' | 'requireAsConst',
  never[]
> = createRule({
  create(context) {
    return {
      VariableDeclaration(node: TSESTree.VariableDeclaration) {
        if (node.kind !== 'const') {
          return;
        }

        const declarations = node.declarations.filter(
          (declaration): declaration is TSESTree.VariableDeclarator =>
            declaration !== null && declaration !== undefined,
        );

        if (declarations.length === 0) {
          return;
        }

        let hasFunctionOrMutableValue = false;
        let hasDependencies = false;
        let hasAsConstAssertion = false;
        let hasReportableIdentifierDeclaration = false;

        for (const declaration of declarations) {
          const analysis = analyzeDeclarator(declaration);

          if (analysis.isFunctionOrMutable) {
            hasFunctionOrMutableValue = true;
            break;
          }

          hasDependencies ||= analysis.hasDependencies;
          hasAsConstAssertion ||= analysis.hasAsConstAssertion;
          hasReportableIdentifierDeclaration ||=
            analysis.hasReportableIdentifier;
        }

        if (hasFunctionOrMutableValue) {
          return;
        }

        const scope = context.getScope();

        // Only check function/block scoped constants without dependencies
        if (
          !hasDependencies &&
          !hasAsConstAssertion &&
          (scope.type === 'function' || scope.type === 'block') &&
          isInsideFunction(node) &&
          hasReportableIdentifierDeclaration
        ) {
          for (const declaration of declarations) {
            if (declaration.id?.type !== AST_NODE_TYPES.Identifier) continue;
            const constName = declaration.id.name;
            context.report({
              node: declaration,
              messageId: 'extractGlobalConstants',
              data: { declarationName: constName },
            });
          }
        }
      },
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        /**
         * The enclosing function, not the immediate parent. A
         * FunctionDeclaration is a Statement, so its parent is always a
         * statement container — Program, BlockStatement, StaticBlock,
         * SwitchCase, an export, an IfStatement. It is never a direct child of
         * a function node, which made the previous `node.parent.type` check
         * unsatisfiable and this whole branch dead.
         */
        if (node.parent && isInsideFunction(node.parent)) {
          const scope = context.getScope();
          const hasDependencies = helperCannotBeHoisted(node);
          if (!hasDependencies && scope.type === 'function') {
            const funcName = node.id?.name;
            context.report({
              node,
              messageId: 'extractGlobalConstants',
              data: {
                declarationName: funcName,
              },
            });
          }
        }
      },
      ForStatement(node: TSESTree.ForStatement) {
        // Check initialization
        if (node.init && node.init.type === 'VariableDeclaration') {
          for (const decl of node.init.declarations) {
            if (
              decl.init &&
              isNumericLiteral(decl.init) &&
              !isZeroOrOne(decl.init) &&
              !isAsConstExpression(decl.init)
            ) {
              context.report({
                node: decl.init,
                messageId: 'requireAsConst',
                data: {
                  value: (decl.init as TSESTree.Literal).value,
                },
              });
            }
          }
        }

        // Check test condition
        if (node.test && node.test.type === 'BinaryExpression') {
          if (
            isNumericLiteral(node.test.right) &&
            !isZeroOrOne(node.test.right) &&
            !isAsConstExpression(node.test.right)
          ) {
            context.report({
              node: node.test.right,
              messageId: 'requireAsConst',
              data: {
                value: (node.test.right as TSESTree.Literal).value,
              },
            });
          }
        }

        // Check update expression
        if (node.update) {
          if (node.update.type === 'AssignmentExpression') {
            if (
              node.update.right &&
              isNumericLiteral(node.update.right) &&
              !isZeroOrOne(node.update.right) &&
              !isAsConstExpression(node.update.right)
            ) {
              context.report({
                node: node.update.right,
                messageId: 'requireAsConst',
                data: {
                  value: (node.update.right as TSESTree.Literal).value,
                },
              });
            }
          } else if (node.update.type === 'BinaryExpression') {
            if (
              isNumericLiteral(node.update.right) &&
              !isZeroOrOne(node.update.right) &&
              !isAsConstExpression(node.update.right)
            ) {
              context.report({
                node: node.update.right,
                messageId: 'requireAsConst',
                data: {
                  value: (node.update.right as TSESTree.Literal).value,
                },
              });
            }
          }
        }
      },
      WhileStatement(node: TSESTree.WhileStatement) {
        // Check test condition
        if (node.test.type === 'BinaryExpression') {
          if (
            isNumericLiteral(node.test.right) &&
            !isZeroOrOne(node.test.right) &&
            !isAsConstExpression(node.test.right)
          ) {
            context.report({
              node: node.test.right,
              messageId: 'requireAsConst',
              data: {
                value: (node.test.right as TSESTree.Literal).value,
              },
            });
          }
        }
      },
      DoWhileStatement(node: TSESTree.DoWhileStatement) {
        // Check test condition
        if (node.test.type === 'BinaryExpression') {
          if (
            isNumericLiteral(node.test.right) &&
            !isZeroOrOne(node.test.right) &&
            !isAsConstExpression(node.test.right)
          ) {
            context.report({
              node: node.test.right,
              messageId: 'requireAsConst',
              data: {
                value: (node.test.right as TSESTree.Literal).value,
              },
            });
          }
        }
      },
    };
  },

  name: 'extract-global-constants',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Extract static constants and functions to the global scope when possible, and enforce type narrowing with as const for numeric literals in loops',
      recommended: 'error',
    },
    schema: [],
    messages: {
      extractGlobalConstants:
        'What\'s wrong: Declaration "{{declarationName}}" does not reference values from this scope.\nWhy it matters: Keeping it nested recreates the same constant/helper on every call, which adds avoidable allocations and obscures that the value can be shared.\nHow to fix: Hoist it to module scope (use UPPER_SNAKE_CASE for immutable constants) so it is created once and can be imported.',
      requireAsConst:
        'What\'s wrong: Numeric literal {{value}} is used directly as a loop boundary.\nWhy it matters: Without "as const", TypeScript widens it to number, so if you later extract or reuse the value you lose the literal-type boundary and it is easier for related loops to drift out of sync.\nHow to fix: Extract it to a named constant with "as const" (or add "as const" inline) to keep the boundary explicit and reusable.',
    },
  },
  defaultOptions: [],
});
