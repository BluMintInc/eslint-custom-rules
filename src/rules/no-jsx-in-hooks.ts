import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noJsxInHooks';

const isJsxElement = (node: TSESTree.Node): boolean => {
  if (!node) return false;

  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return isJsxElement(node.consequent) || isJsxElement(node.alternate);
  }

  return (
    node.type === AST_NODE_TYPES.JSXElement ||
    node.type === AST_NODE_TYPES.JSXFragment ||
    node.type === AST_NODE_TYPES.JSXExpressionContainer
  );
};

/**
 * A type reference's name as dotted segments.
 *
 * A qualified name nests to the LEFT, so `React.JSX.Element` is a
 * TSQualifiedName whose own `left` is another TSQualifiedName. Matching one
 * nesting level at a time therefore recognizes `JSX.Element` but not the
 * React-namespaced spelling of the same type; comparing whole paths recognizes
 * both.
 */
const qualifiedSegments = (typeName: TSESTree.EntityName): string[] | null => {
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return [typeName.name];
  }
  if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
    const left = qualifiedSegments(typeName.left);
    return left && [...left, typeName.right.name];
  }
  return null;
};

/** JSX-producing type paths, written without the optional `React` qualifier. */
const JSX_TYPE_PATHS = new Set([
  'JSX',
  'JSX.Element',
  'ReactNode',
  'ReactElement',
]);

const isJsxReturnType = (node: TSESTree.TSTypeAnnotation): boolean => {
  if (node.typeAnnotation.type !== AST_NODE_TYPES.TSTypeReference) {
    return false;
  }
  const segments = qualifiedSegments(node.typeAnnotation.typeName);
  if (!segments) {
    return false;
  }
  /**
   * `React.` re-exports the same declarations, so it carries no meaning for
   * this question. Every other qualifier names a type from a different module
   * and must not match — `Foo.ReactNode` is not React's.
   */
  const path = segments[0] === 'React' ? segments.slice(1) : segments;
  return path.length > 0 && JSX_TYPE_PATHS.has(path.join('.'));
};

const containsJsxInBlockStatement = (
  node: TSESTree.BlockStatement,
): boolean => {
  const variablesWithJsx = new Set<string>();

  for (const statement of node.body) {
    // Check variable declarations for JSX assignments
    if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        if (declarator.init) {
          if (
            declarator.init.type === AST_NODE_TYPES.CallExpression &&
            containsJsxInUseMemo(declarator.init)
          ) {
            if (declarator.id.type === AST_NODE_TYPES.Identifier) {
              variablesWithJsx.add(declarator.id.name);
            }
          }
        }
      }
    }

    // Check return statements
    if (
      statement.type === AST_NODE_TYPES.ReturnStatement &&
      statement.argument
    ) {
      if (isJsxElement(statement.argument)) {
        return true;
      }
      if (statement.argument.type === AST_NODE_TYPES.CallExpression) {
        if (containsJsxInUseMemo(statement.argument)) {
          return true;
        }
      }
      if (
        statement.argument.type === AST_NODE_TYPES.Identifier &&
        variablesWithJsx.has(statement.argument.name)
      ) {
        return true;
      }
    }

    // Check if statements
    if (statement.type === AST_NODE_TYPES.IfStatement) {
      if (
        statement.consequent.type === AST_NODE_TYPES.ReturnStatement &&
        statement.consequent.argument
      ) {
        if (isJsxElement(statement.consequent.argument)) {
          return true;
        }
        if (
          statement.consequent.argument.type === AST_NODE_TYPES.Identifier &&
          variablesWithJsx.has(statement.consequent.argument.name)
        ) {
          return true;
        }
      }
      if (
        statement.consequent.type === AST_NODE_TYPES.BlockStatement &&
        containsJsxInBlockStatement(statement.consequent)
      ) {
        return true;
      }
      if (statement.alternate) {
        if (
          statement.alternate.type === AST_NODE_TYPES.ReturnStatement &&
          statement.alternate.argument
        ) {
          if (isJsxElement(statement.alternate.argument)) {
            return true;
          }
          if (
            statement.alternate.argument.type === AST_NODE_TYPES.Identifier &&
            variablesWithJsx.has(statement.alternate.argument.name)
          ) {
            return true;
          }
        }
        if (
          statement.alternate.type === AST_NODE_TYPES.BlockStatement &&
          containsJsxInBlockStatement(statement.alternate)
        ) {
          return true;
        }
      }
    }
  }
  return false;
};

const containsJsxInUseMemo = (node: TSESTree.CallExpression): boolean => {
  if (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'useMemo' &&
    node.arguments.length > 0
  ) {
    const callback = node.arguments[0];
    if (
      callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      callback.type === AST_NODE_TYPES.FunctionExpression
    ) {
      const body = callback.body;
      if (isJsxElement(body)) {
        return true;
      }
      if (body.type === AST_NODE_TYPES.BlockStatement) {
        return containsJsxInBlockStatement(body);
      }
      if (
        body.type === AST_NODE_TYPES.CallExpression &&
        body.callee.type === AST_NODE_TYPES.MemberExpression &&
        body.callee.property.type === AST_NODE_TYPES.Identifier &&
        body.callee.property.name === 'map'
      ) {
        // A zero-argument .map() leaves this undefined. The indexed read is
        // typed non-optional, so nothing forces the check.
        const mapCallback = body.arguments[0];
        if (
          mapCallback &&
          (mapCallback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            mapCallback.type === AST_NODE_TYPES.FunctionExpression) &&
          isJsxElement(mapCallback.body)
        ) {
          return true;
        }
      }
    }
  }
  return false;
};

export const noJsxInHooks = createRule<[], MessageIds>({
  name: 'no-jsx-in-hooks',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent hooks from returning JSX',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noJsxInHooks:
        'Hook "{{hookName}}" returns JSX. Hooks are meant to expose data and behavior; embedding JSX turns the hook into a hidden component and forces callers to use a hook where a component should render. Move the JSX into a component and have the hook return the values and callbacks that component needs instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      FunctionDeclaration(node) {
        if (node.id && node.id.name.startsWith('use')) {
          // Check return type annotation
          if (node.returnType && isJsxReturnType(node.returnType)) {
            context.report({
              node: node.id,
              messageId: 'noJsxInHooks',
              data: { hookName: node.id.name },
            });
            return;
          }

          // Check return statements
          if (node.body.type === AST_NODE_TYPES.BlockStatement) {
            if (containsJsxInBlockStatement(node.body)) {
              context.report({
                node: node.id,
                messageId: 'noJsxInHooks',
                data: { hookName: node.id.name },
              });
            }
          }
        }
      },
      ArrowFunctionExpression(node) {
        const parent = node.parent;
        if (
          parent &&
          parent.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.id.type === AST_NODE_TYPES.Identifier &&
          parent.id.name.startsWith('use')
        ) {
          // Check return type annotation
          if (node.returnType && isJsxReturnType(node.returnType)) {
            context.report({
              node: parent.id,
              messageId: 'noJsxInHooks',
              data: { hookName: parent.id.name },
            });
            return;
          }

          // Check direct JSX return
          if (isJsxElement(node.body)) {
            context.report({
              node: parent.id,
              messageId: 'noJsxInHooks',
              data: { hookName: parent.id.name },
            });
            return;
          }

          // Check block body returns
          if (node.body.type === AST_NODE_TYPES.BlockStatement) {
            if (containsJsxInBlockStatement(node.body)) {
              context.report({
                node: parent.id,
                messageId: 'noJsxInHooks',
                data: { hookName: parent.id.name },
              });
            }
          }
        }
      },
    };
  },
});
