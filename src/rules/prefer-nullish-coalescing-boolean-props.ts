import {
  AST_NODE_TYPES,
  TSESTree,
  ParserServices,
  ESLintUtils,
} from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferNullishCoalescing';

const BOOLEAN_PROP_REGEX =
  /^(is|has|should|can|will|do|does|did|was|were|enable|disable)/;

function isBooleanType(type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.every((t) => isBooleanType(t));
  }
  return (
    (type.getFlags() & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) !==
    0
  );
}

function isPossiblyNullish(type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.some((t) => isPossiblyNullish(t));
  }
  return (
    (type.getFlags() &
      (ts.TypeFlags.Null |
        ts.TypeFlags.Undefined |
        ts.TypeFlags.Void |
        ts.TypeFlags.Any |
        ts.TypeFlags.Unknown |
        ts.TypeFlags.TypeParameter)) !==
    0
  );
}

function isInJSXBooleanAttribute(node: TSESTree.Node): boolean {
  const parent = node.parent;
  if (parent?.type !== AST_NODE_TYPES.JSXAttribute) return false;

  const attributeName = parent.name.name;
  const booleanPropNames = [
    'disabled',
    'required',
    'checked',
    'selected',
    'readOnly',
    'autoFocus',
    'autoPlay',
    'controls',
    'default',
    'defer',
    'hidden',
    'isOpen',
    'loop',
    'multiple',
    'muted',
    'noValidate',
    'open',
    'scoped',
    'seamless',
    'itemScope',
    'allowFullScreen',
    'async',
    'autofocus',
    'autoplay',
    'formNoValidate',
    'spellcheck',
    'translate',
  ];

  return (
    typeof attributeName === 'string' &&
    (booleanPropNames.includes(attributeName) ||
      BOOLEAN_PROP_REGEX.test(attributeName))
  );
}

function isInConditionalContext(node: TSESTree.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;

  return (
    (parent.type === AST_NODE_TYPES.IfStatement && node === parent.test) ||
    (parent.type === AST_NODE_TYPES.ConditionalExpression &&
      node === parent.test) ||
    (parent.type === AST_NODE_TYPES.WhileStatement && node === parent.test) ||
    (parent.type === AST_NODE_TYPES.ForStatement && node === parent.test) ||
    (parent.type === AST_NODE_TYPES.DoWhileStatement && node === parent.test) ||
    (parent.type === AST_NODE_TYPES.SwitchCase && node === parent.test)
  );
}

/**
 * Determines if a node is within a boolean context in JSX props or other boolean contexts
 */
function isInBooleanContext(
  node: TSESTree.Node,
  checker?: ts.TypeChecker,
  parserServices?: ParserServices,
): boolean {
  if (checker && parserServices) {
    try {
      const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
      const contextualType = checker.getContextualType(tsNode as ts.Expression);
      if (contextualType && isBooleanType(contextualType)) {
        return true;
      }

      // Also check if the expression itself is a boolean type
      const actualType = checker.getTypeAtLocation(tsNode);
      if (actualType && isBooleanType(actualType)) {
        return true;
      }

      // If this is a logical expression, also check if the left operand is a boolean
      if (node.type === AST_NODE_TYPES.LogicalExpression) {
        const leftTSNode = parserServices.esTreeNodeToTSNodeMap.get(node.left);
        const leftType = checker.getTypeAtLocation(leftTSNode);
        if (leftType && isBooleanType(leftType)) {
          return true;
        }
      }
    } catch {
      // esTreeNodeToTSNodeMap may fail for synthetic nodes or nodes without
      // source positions; getContextualType may return undefined for non-expression
      // contexts. Fall back to AST-based heuristics in these cases.
    }
  }

  let current: TSESTree.Node | undefined = node;

  // Traverse up the AST to find if we're in a boolean context
  while (current && current.parent) {
    if (isInJSXBooleanAttribute(current)) return true;
    if (isInConditionalContext(current)) return true;

    // If we're in a logical expression that's part of a boolean context
    if (
      current.parent.type === AST_NODE_TYPES.LogicalExpression &&
      (current.parent.operator === '&&' || current.parent.operator === '||')
    ) {
      // Continue up the tree to check if the parent logical expression is in a boolean context
      current = current.parent;
      continue;
    }

    // If we're in a unary expression with a boolean operator
    if (
      current.parent.type === AST_NODE_TYPES.UnaryExpression &&
      current.parent.operator === '!'
    ) {
      return true;
    }

    // If we're in a conditional expression (ternary)
    if (
      current.parent.type === AST_NODE_TYPES.ConditionalExpression &&
      current === current.parent.test
    ) {
      return true;
    }

    // If we're in a variable declaration that has a boolean-like name
    if (
      current.parent.type === AST_NODE_TYPES.VariableDeclarator &&
      current.parent.id.type === AST_NODE_TYPES.Identifier
    ) {
      const variableName = current.parent.id.name;
      if (/^(is|has|should|can|will|do|does|did|was|were)/.test(variableName)) {
        return true;
      }
    }

    // If we're in a while loop condition
    if (
      current.parent.type === AST_NODE_TYPES.WhileStatement &&
      current === current.parent.test
    ) {
      return true;
    }

    // If we're in a for loop condition
    if (
      current.parent.type === AST_NODE_TYPES.ForStatement &&
      current === current.parent.test
    ) {
      return true;
    }

    // If we're in a do-while loop condition
    if (
      current.parent.type === AST_NODE_TYPES.DoWhileStatement &&
      current === current.parent.test
    ) {
      return true;
    }

    // If we're in a function return statement with a boolean-like function name
    if (current.parent.type === AST_NODE_TYPES.ReturnStatement) {
      // Find the function that contains this return statement
      let functionNode = current.parent.parent;
      let functionName = '';

      // Handle different function types
      if (
        functionNode &&
        functionNode.type === AST_NODE_TYPES.FunctionDeclaration &&
        functionNode.id
      ) {
        functionName = functionNode.id.name;
      } else if (
        functionNode &&
        functionNode.type === AST_NODE_TYPES.FunctionExpression
      ) {
        // For function expressions, check the parent context
        if (
          functionNode.parent &&
          functionNode.parent.type === AST_NODE_TYPES.VariableDeclarator &&
          functionNode.parent.id.type === AST_NODE_TYPES.Identifier
        ) {
          functionName = functionNode.parent.id.name;
        } else if (
          functionNode.parent &&
          functionNode.parent.type === AST_NODE_TYPES.Property &&
          functionNode.parent.key.type === AST_NODE_TYPES.Identifier
        ) {
          functionName = functionNode.parent.key.name;
        } else if (
          functionNode.parent &&
          functionNode.parent.type === AST_NODE_TYPES.MethodDefinition &&
          functionNode.parent.key.type === AST_NODE_TYPES.Identifier
        ) {
          functionName = functionNode.parent.key.name;
        }
      } else if (
        functionNode &&
        functionNode.type === AST_NODE_TYPES.ArrowFunctionExpression
      ) {
        // For arrow functions, check the parent context
        if (
          functionNode.parent &&
          functionNode.parent.type === AST_NODE_TYPES.VariableDeclarator &&
          functionNode.parent.id.type === AST_NODE_TYPES.Identifier
        ) {
          functionName = functionNode.parent.id.name;
        } else if (
          functionNode.parent &&
          functionNode.parent.type === AST_NODE_TYPES.Property &&
          functionNode.parent.key.type === AST_NODE_TYPES.Identifier
        ) {
          functionName = functionNode.parent.key.name;
        } else if (
          functionNode.parent &&
          functionNode.parent.type === AST_NODE_TYPES.MethodDefinition &&
          functionNode.parent.key.type === AST_NODE_TYPES.Identifier
        ) {
          functionName = functionNode.parent.key.name;
        }
      } else if (
        functionNode &&
        functionNode.type === AST_NODE_TYPES.BlockStatement
      ) {
        // Handle case where return is in a block statement
        functionNode = functionNode.parent;
        if (
          functionNode &&
          functionNode.type === AST_NODE_TYPES.FunctionDeclaration &&
          functionNode.id
        ) {
          functionName = functionNode.id.name;
        } else if (
          functionNode &&
          functionNode.type === AST_NODE_TYPES.FunctionExpression
        ) {
          if (
            functionNode.parent &&
            functionNode.parent.type === AST_NODE_TYPES.VariableDeclarator &&
            functionNode.parent.id.type === AST_NODE_TYPES.Identifier
          ) {
            functionName = functionNode.parent.id.name;
          } else if (
            functionNode.parent &&
            functionNode.parent.type === AST_NODE_TYPES.Property &&
            functionNode.parent.key.type === AST_NODE_TYPES.Identifier
          ) {
            functionName = functionNode.parent.key.name;
          } else if (
            functionNode.parent &&
            functionNode.parent.type === AST_NODE_TYPES.MethodDefinition &&
            functionNode.parent.key.type === AST_NODE_TYPES.Identifier
          ) {
            functionName = functionNode.parent.key.name;
          }
        } else if (
          functionNode &&
          functionNode.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          if (
            functionNode.parent &&
            functionNode.parent.type === AST_NODE_TYPES.VariableDeclarator &&
            functionNode.parent.id.type === AST_NODE_TYPES.Identifier
          ) {
            functionName = functionNode.parent.id.name;
          } else if (
            functionNode.parent &&
            functionNode.parent.type === AST_NODE_TYPES.Property &&
            functionNode.parent.key.type === AST_NODE_TYPES.Identifier
          ) {
            functionName = functionNode.parent.key.name;
          } else if (
            functionNode.parent &&
            functionNode.parent.type === AST_NODE_TYPES.MethodDefinition &&
            functionNode.parent.key.type === AST_NODE_TYPES.Identifier
          ) {
            functionName = functionNode.parent.key.name;
          }
        }
      }

      if (
        functionName &&
        /^(is|has|should|can|will|do|does|did|was|were|check|validate)/.test(
          functionName,
        )
      ) {
        return true;
      }
    }

    // If we're directly in an arrow function body (without explicit return) with boolean-like name
    if (current.parent.type === AST_NODE_TYPES.ArrowFunctionExpression) {
      let functionName = '';
      if (
        current.parent.parent &&
        current.parent.parent.type === AST_NODE_TYPES.VariableDeclarator &&
        current.parent.parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        functionName = current.parent.parent.id.name;
      } else if (
        current.parent.parent &&
        current.parent.parent.type === AST_NODE_TYPES.Property &&
        current.parent.parent.key.type === AST_NODE_TYPES.Identifier
      ) {
        functionName = current.parent.parent.key.name;
      }

      if (
        functionName &&
        /^(is|has|should|can|will|do|does|did|was|were|check|validate)/.test(
          functionName,
        )
      ) {
        return true;
      }
    }

    // If we're in a conditional rendering context (JSX && operator)
    if (
      current.parent.type === AST_NODE_TYPES.LogicalExpression &&
      current.parent.operator === '&&' &&
      current.parent.parent &&
      (current.parent.parent.type === AST_NODE_TYPES.JSXExpressionContainer ||
        current.parent.parent.type === AST_NODE_TYPES.ReturnStatement)
    ) {
      return true;
    }

    // If we're the left side of a && operator that's used for conditional rendering
    if (
      current.parent.type === AST_NODE_TYPES.LogicalExpression &&
      current.parent.operator === '&&' &&
      current === current.parent.left &&
      current.parent.parent &&
      current.parent.parent.type === AST_NODE_TYPES.ReturnStatement
    ) {
      return true;
    }

    // If we're in a logical expression that will be used for conditional rendering
    if (
      current.parent.type === AST_NODE_TYPES.LogicalExpression &&
      current.parent.operator === '&&' &&
      current.parent.parent &&
      current.parent.parent.type === AST_NODE_TYPES.ReturnStatement &&
      current.parent.right &&
      current.parent.right.type === AST_NODE_TYPES.JSXElement
    ) {
      return true;
    }

    // If we're inside parentheses that are the left side of a && operator for conditional rendering
    if (
      current.parent.type === AST_NODE_TYPES.LogicalExpression &&
      current.parent.parent &&
      current.parent.parent.type === AST_NODE_TYPES.LogicalExpression &&
      current.parent.parent.operator === '&&' &&
      current.parent.parent.parent &&
      current.parent.parent.parent.type === AST_NODE_TYPES.ReturnStatement &&
      current.parent.parent.right &&
      current.parent.parent.right.type === AST_NODE_TYPES.JSXElement
    ) {
      return true;
    }

    // Check if we're in a logical expression that's eventually used for conditional rendering
    let tempParent: TSESTree.Node | undefined = current.parent;
    while (tempParent) {
      if (
        tempParent.type === AST_NODE_TYPES.LogicalExpression &&
        tempParent.operator === '&&' &&
        tempParent.right &&
        tempParent.right.type === AST_NODE_TYPES.JSXElement
      ) {
        return true;
      }
      tempParent = tempParent.parent;
    }

    // If we're in a switch case
    if (
      current.parent.type === AST_NODE_TYPES.SwitchCase &&
      current === current.parent.test
    ) {
      return true;
    }

    // If we're in array method callbacks that expect boolean returns
    if (
      current.parent.type === AST_NODE_TYPES.ReturnStatement &&
      current.parent.parent &&
      current.parent.parent.type === AST_NODE_TYPES.ArrowFunctionExpression &&
      current.parent.parent.parent &&
      current.parent.parent.parent.type === AST_NODE_TYPES.CallExpression &&
      current.parent.parent.parent.callee.type ===
        AST_NODE_TYPES.MemberExpression &&
      current.parent.parent.parent.callee.property.type ===
        AST_NODE_TYPES.Identifier
    ) {
      const methodName = current.parent.parent.parent.callee.property.name;
      if (
        ['filter', 'some', 'every', 'find', 'findIndex'].includes(methodName)
      ) {
        return true;
      }
    }

    // If we're directly in array method callbacks (arrow function body without return)
    if (
      current.parent.type === AST_NODE_TYPES.ArrowFunctionExpression &&
      current.parent.parent &&
      current.parent.parent.type === AST_NODE_TYPES.CallExpression &&
      current.parent.parent.callee.type === AST_NODE_TYPES.MemberExpression &&
      current.parent.parent.callee.property.type === AST_NODE_TYPES.Identifier
    ) {
      const methodName = current.parent.parent.callee.property.name;
      if (
        ['filter', 'some', 'every', 'find', 'findIndex'].includes(methodName)
      ) {
        return true;
      }
    }

    // If we're in an object property with a boolean-like name
    if (
      current.parent.type === AST_NODE_TYPES.Property &&
      current.parent.key.type === AST_NODE_TYPES.Identifier
    ) {
      const propertyName = current.parent.key.name;
      if (
        /^(is|has|should|can|will|do|does|did|was|were|enable|disable|validate)/.test(
          propertyName,
        )
      ) {
        return true;
      }
    }

    // If we're in destructuring assignment with boolean-like name
    if (
      current.parent.type === AST_NODE_TYPES.AssignmentPattern &&
      current.parent.parent &&
      current.parent.parent.type === AST_NODE_TYPES.Property &&
      current.parent.parent.key.type === AST_NODE_TYPES.Identifier
    ) {
      const propertyName = current.parent.parent.key.name;
      if (/^(is|has|should|can|will|do|does|did|was|were)/.test(propertyName)) {
        return true;
      }
    }

    // If we're in a function call argument for useState with boolean-like variable name
    if (
      current.parent.type === AST_NODE_TYPES.CallExpression &&
      current.parent.callee.type === AST_NODE_TYPES.Identifier &&
      current.parent.callee.name === 'useState' &&
      current.parent.parent &&
      current.parent.parent.type === AST_NODE_TYPES.VariableDeclarator &&
      current.parent.parent.id.type === AST_NODE_TYPES.ArrayPattern &&
      current.parent.parent.id.elements.length > 0 &&
      current.parent.parent.id.elements[0] &&
      current.parent.parent.id.elements[0].type === AST_NODE_TYPES.Identifier
    ) {
      const variableName = current.parent.parent.id.elements[0].name;
      if (
        /^(is|has|should|can|will|do|does|did|was|were|ready|valid|loading|error|complete|active|enabled|disabled|visible|hidden)/.test(
          variableName,
        )
      ) {
        return true;
      }
    }

    // If we're in an event handler (arrow function in JSX prop)
    if (
      current.parent.type === AST_NODE_TYPES.LogicalExpression &&
      current.parent.operator === '&&' &&
      current.parent.parent &&
      current.parent.parent.type === AST_NODE_TYPES.ArrowFunctionExpression &&
      current.parent.parent.parent &&
      current.parent.parent.parent.type ===
        AST_NODE_TYPES.JSXExpressionContainer &&
      current.parent.parent.parent.parent &&
      current.parent.parent.parent.parent.type === AST_NODE_TYPES.JSXAttribute
    ) {
      return true;
    }

    // If we're in a logical expression inside an arrow function that's in a JSX attribute
    let tempCurrent: TSESTree.Node | undefined = current.parent;
    while (tempCurrent) {
      if (
        tempCurrent.type === AST_NODE_TYPES.ArrowFunctionExpression &&
        tempCurrent.parent &&
        tempCurrent.parent.type === AST_NODE_TYPES.JSXExpressionContainer &&
        tempCurrent.parent.parent &&
        tempCurrent.parent.parent.type === AST_NODE_TYPES.JSXAttribute
      ) {
        return true;
      }
      tempCurrent = tempCurrent.parent;
    }

    current = current.parent;
  }

  return false;
}

/**
 * Checks if the left operand could be nullish (null or undefined)
 */
function couldBeNullish(
  node: TSESTree.Expression,
  checker?: ts.TypeChecker,
  parserServices?: ParserServices,
): boolean {
  if (checker && parserServices) {
    try {
      const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);
      return isPossiblyNullish(type);
    } catch {
      // esTreeNodeToTSNodeMap may fail for synthetic nodes or nodes without
      // source positions; getTypeAtLocation may throw for nodes without
      // type information. Fall back to manual check.
    }
  }

  // For literals, check the actual value
  if (node.type === AST_NODE_TYPES.Literal) {
    return node.value === null || node.value === undefined;
  }

  if (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') {
    return true;
  }

  if (
    node.type === AST_NODE_TYPES.NewExpression ||
    node.type === AST_NODE_TYPES.ArrayExpression ||
    node.type === AST_NODE_TYPES.ObjectExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.ClassExpression ||
    (node.type === AST_NODE_TYPES.TemplateLiteral &&
      node.expressions.length === 0)
  ) {
    return false;
  }

  // For other expressions, conservatively assume they could be nullish
  return true;
}

export const preferNullishCoalescingBooleanProps = createRule<[], MessageIds>({
  name: 'prefer-nullish-coalescing-boolean-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer nullish coalescing over logical OR, but allow logical OR in boolean contexts',
      recommended: 'error',
    },
    fixable: 'code',
    messages: {
      preferNullishCoalescing:
        'Logical OR between "{{left}}" and "{{right}}" treats every falsy value (false, 0, "", NaN) as missing and will override intentional boolean or empty states. Use the nullish coalescing operator (??) so "{{right}}" only applies when "{{left}}" is null or undefined, preserving explicit false/0/"" values.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const parserServices = ESLintUtils.getParserServices(context, true);
    const checker = parserServices?.program?.getTypeChecker();

    return {
      LogicalExpression(node) {
        if (node.operator === '||') {
          // If the node is in a boolean context, we allow logical OR
          if (isInBooleanContext(node, checker, parserServices)) {
            return;
          }

          // Check if this could benefit from nullish coalescing
          // We only suggest nullish coalescing when the left operand could be nullish
          if (couldBeNullish(node.left, checker, parserServices)) {
            const sourceCode = context.getSourceCode();
            const leftText = sourceCode.getText(node.left);
            const rightText = sourceCode.getText(node.right);

            context.report({
              node,
              messageId: 'preferNullishCoalescing',
              data: {
                left: leftText,
                right: rightText,
              },
              fix(fixer) {
                return fixer.replaceText(node, `${leftText} ?? ${rightText}`);
              },
            });
          }
        }
      },
    };
  },
});
