import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'scopeOutOfOrder';

const REACT_HOOKS = new Set([
  'useState',
  'useEffect',
  'useContext',
  'useReducer',
  'useCallback',
  'useMemo',
  'useRef',
  'useImperativeHandle',
  'useLayoutEffect',
  'useDebugValue',
]);

function isReactHook(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.Identifier) return false;
  return REACT_HOOKS.has(callee.name);
}

function hasSideEffects(node: TSESTree.Node): boolean {
  switch (node.type) {
    case AST_NODE_TYPES.CallExpression:
      return true;
    case AST_NODE_TYPES.AssignmentExpression:
      return true;
    case AST_NODE_TYPES.UpdateExpression:
      return true;
    case AST_NODE_TYPES.AwaitExpression:
      return true;
    case AST_NODE_TYPES.YieldExpression:
      return true;
    default:
      return false;
  }
}

function getReferencedIdentifiers(node: TSESTree.Node): Set<string> {
  const identifiers = new Set<string>();
  const visited = new Set<TSESTree.Node>();

  function visit(node: TSESTree.Node): void {
    if (visited.has(node)) return;
    visited.add(node);

    switch (node.type) {
      case AST_NODE_TYPES.Identifier:
        identifiers.add(node.name);
        break;
      case AST_NODE_TYPES.MemberExpression:
        if (node.object.type === AST_NODE_TYPES.Identifier) {
          identifiers.add(node.object.name);
        }
        visit(node.object);
        if (!node.computed) break;
        visit(node.property);
        break;
      default:
        for (const key in node) {
          if (key === 'parent') continue;
          const value = (node as any)[key];
          if (value && typeof value === 'object') {
            if (Array.isArray(value)) {
              value.forEach(item => {
                if (item && typeof item === 'object' && 'type' in item) {
                  visit(item);
                }
              });
            } else if ('type' in value) {
              visit(value);
            }
          }
        }
    }
  }

  visit(node);
  return identifiers;
}

function getDeclaredIdentifiers(node: TSESTree.Node): Set<string> {
  const identifiers = new Set<string>();

  if (node.type === AST_NODE_TYPES.VariableDeclaration) {
    for (const declarator of node.declarations) {
      if (declarator.id.type === AST_NODE_TYPES.Identifier) {
        identifiers.add(declarator.id.name);
      } else if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) {
        for (const property of declarator.id.properties) {
          if (property.type === AST_NODE_TYPES.Property &&
              property.value.type === AST_NODE_TYPES.Identifier) {
            identifiers.add(property.value.name);
          }
        }
      }
    }
  }

  return identifiers;
}

export const scopesReadTopToBottom = createRule<[], MessageIds>({
  name: 'scopes-read-top-to-bottom',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce a top-to-bottom ordering for scopes in the code',
      recommended: 'error',
    },

    schema: [],
    messages: {
      scopeOutOfOrder:
        'This code depends on variables defined below. Move it after its dependencies for better readability.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      Program(node) {
        const statements = node.body;
        const declaredVars = new Map<string, number>();
        const statementsToCheck: TSESTree.Statement[] = [];

        // First pass: collect all declarations and their positions
        statements.forEach((stmt, index) => {
          if (stmt.type === AST_NODE_TYPES.VariableDeclaration) {
            const declared = getDeclaredIdentifiers(stmt);
            declared.forEach(id => declaredVars.set(id, index));
          }
          statementsToCheck.push(stmt);
        });

        // Second pass: check dependencies
        statementsToCheck.forEach((stmt, index) => {
          // Skip React hooks - they must maintain their order
          if (stmt.type === AST_NODE_TYPES.ExpressionStatement &&
              stmt.expression.type === AST_NODE_TYPES.CallExpression &&
              isReactHook(stmt.expression)) {
            return;
          }

          // Skip statements with side effects in control flow
          if (stmt.type === AST_NODE_TYPES.IfStatement ||
              stmt.type === AST_NODE_TYPES.ForStatement ||
              stmt.type === AST_NODE_TYPES.ForInStatement ||
              stmt.type === AST_NODE_TYPES.ForOfStatement ||
              stmt.type === AST_NODE_TYPES.WhileStatement) {
            if (hasSideEffects(stmt)) return;
          }

          const referenced = getReferencedIdentifiers(stmt);
          let maxDependencyIndex = -1;

          for (const ref of referenced) {
            const declarationIndex = declaredVars.get(ref);
            if (declarationIndex !== undefined && declarationIndex > index) {
              maxDependencyIndex = Math.max(maxDependencyIndex, declarationIndex);
            }
          }

          if (maxDependencyIndex !== -1) {
            context.report({
              node: stmt,
              messageId: 'scopeOutOfOrder',

            });
          }
        });
      },
    };
  },
});
