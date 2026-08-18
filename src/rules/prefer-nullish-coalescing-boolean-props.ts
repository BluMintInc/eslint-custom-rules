import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESTree,
  TSESLint,
  ParserServices,
  ESLintUtils,
} from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';
import {
  ReplacementSegment,
  joinSegmentBody,
  joinSegments,
  requiresLineBreakAfter,
  requiresOwnLine,
} from '../utils/replacementSegments';

type MessageIds = 'preferNullishCoalescing';

const BOOLEAN_PROP_REGEX =
  /^(is|has|should|can|will|do|does|did|was|were|enable|disable)/;

function isBooleanType(type: ts.Type, checker?: ts.TypeChecker): boolean {
  if (type.isUnion()) {
    return type.types.every((t) => isBooleanType(t, checker));
  }

  // For type parameters, check if the constraint is a boolean type
  if (type.getFlags() & ts.TypeFlags.TypeParameter) {
    if (checker) {
      const constraint = checker.getBaseConstraintOfType(type);
      if (constraint && constraint !== type) {
        return isBooleanType(constraint, checker);
      }
    }
    return false;
  }

  return (
    (type.getFlags() & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) !==
    0
  );
}

function isPossiblyNullish(type: ts.Type, checker?: ts.TypeChecker): boolean {
  if (type.isUnion()) {
    return type.types.some((t) => isPossiblyNullish(t, checker));
  }

  // For type parameters, check if the constraint excludes nullish
  if (type.getFlags() & ts.TypeFlags.TypeParameter) {
    if (checker) {
      const constraint = checker.getBaseConstraintOfType(type);
      if (constraint && constraint !== type) {
        return isPossiblyNullish(constraint, checker);
      }
    }
    // If we can't determine the constraint, assume it could be nullish
    return true;
  }

  return (
    (type.getFlags() &
      (ts.TypeFlags.Null |
        ts.TypeFlags.Undefined |
        ts.TypeFlags.Void |
        ts.TypeFlags.Any |
        ts.TypeFlags.Unknown)) !==
    0
  );
}

/**
 * The union members of a type, following a type parameter to its constraint so a
 * generic operand is read through the same lens as a written-out union.
 */
function unionMembers(type: ts.Type, checker?: ts.TypeChecker): ts.Type[] {
  if (type.isUnion()) {
    return type.types.flatMap((member) => unionMembers(member, checker));
  }

  if (type.getFlags() & ts.TypeFlags.TypeParameter) {
    if (checker) {
      const constraint = checker.getBaseConstraintOfType(type);
      if (constraint && constraint !== type) {
        return unionMembers(constraint, checker);
      }
    }
    return [type];
  }

  return [type];
}

/**
 * A member every value of which is falsy while none of them is nullish: the part
 * of a union that `||` discards and `??` keeps.
 */
function isNonNullishFalsy(type: ts.Type): boolean {
  const flags = type.getFlags();

  if (flags & ts.TypeFlags.BooleanLiteral) {
    return (
      (type as ts.Type & { intrinsicName?: string }).intrinsicName === 'false'
    );
  }

  if (flags & (ts.TypeFlags.NumberLiteral | ts.TypeFlags.StringLiteral)) {
    const { value } = type as ts.LiteralType;
    // `-0` compares equal to `0`, so both numeric zeroes are covered.
    return value === 0 || value === '';
  }

  if (flags & ts.TypeFlags.BigIntLiteral) {
    const { value } = type as ts.LiteralType;
    return typeof value === 'object' && value.base10Value === '0';
  }

  return false;
}

function isNullishMember(type: ts.Type): boolean {
  return (
    (type.getFlags() &
      (ts.TypeFlags.Null |
        ts.TypeFlags.Undefined |
        ts.TypeFlags.Void |
        ts.TypeFlags.Any |
        ts.TypeFlags.Unknown)) !==
    0
  );
}

/**
 * The primitive domain a union member belongs to. Members of one domain form the
 * unions the rule exists for (`string | undefined`, `boolean | undefined`,
 * `0 | 1 | undefined`), where a falsy value is a value of the same kind as the
 * fallback and preserving it is the point.
 */
function domainOf(type: ts.Type): string {
  const flags = type.getFlags();

  if (flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
    return 'boolean';
  }
  if (flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {
    return 'number';
  }
  if (flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
    return 'string';
  }
  if (flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) {
    return 'bigint';
  }
  return 'other';
}

/**
 * Whether the `||` is load-bearing because its left operand carries a falsy
 * sentinel from outside the payload's domain.
 *
 * `cond && payload` evaluates to the falsy `cond` itself when it short-circuits,
 * so the operand's type is `false | payload` (or `0 | payload`, `'' | payload`).
 * The trailing `||` exists to strip that sentinel; `??` strips only `null` and
 * `undefined`, so the rewrite leaks a `false` into a position typed for the
 * payload alone and the program stops compiling. The same union written out by
 * hand behaves identically, so the test is a property of the type rather than of
 * the `&&` that usually produces it.
 *
 * A union confined to a single domain is left alone: there the falsy member is a
 * value of the payload's own kind, which is exactly the state the rule asks
 * callers to preserve.
 *
 * Positive evidence from the checker is required. Without type information the
 * answer is unknowable, and guessing would silence the rule across every
 * untyped operand.
 */
function stripsForeignFalsyMember(
  node: TSESTree.Expression,
  checker?: ts.TypeChecker,
  parserServices?: ParserServices,
): boolean {
  if (!checker || !parserServices) {
    return false;
  }

  let members: ts.Type[];
  try {
    const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
    const type = checker.getTypeAtLocation(tsNode);
    if (!type) {
      return false;
    }
    members = unionMembers(type, checker);
  } catch {
    // esTreeNodeToTSNodeMap may fail for synthetic nodes and getTypeAtLocation
    // may throw for nodes without type information; both mean no evidence.
    return false;
  }

  const sentinelDomains = new Set(
    members.filter(isNonNullishFalsy).map(domainOf),
  );
  if (sentinelDomains.size === 0) {
    return false;
  }

  return members.some(
    (member) =>
      !isNullishMember(member) &&
      !isNonNullishFalsy(member) &&
      !sentinelDomains.has(domainOf(member)),
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
      if (contextualType && isBooleanType(contextualType, checker)) {
        return true;
      }

      // Also check if the expression itself is a boolean type
      const actualType = checker.getTypeAtLocation(tsNode);
      if (actualType && isBooleanType(actualType, checker)) {
        return true;
      }

      // If this is a logical expression, also check if the left operand is a boolean
      if (node.type === AST_NODE_TYPES.LogicalExpression) {
        const leftTSNode = parserServices.esTreeNodeToTSNodeMap.get(node.left);
        const leftType = checker.getTypeAtLocation(leftTSNode);
        if (leftType && isBooleanType(leftType, checker)) {
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
      return isPossiblyNullish(type, checker);
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

/**
 * ECMAScript forbids `??` from sharing an expression with an unparenthesized
 * `&&`/`||`. Source-level parentheses are not part of an ESTree node's range,
 * so rewriting a whole LogicalExpression drops the parens around its operands —
 * exactly the ones the operator swap makes mandatory. Re-adding them around any
 * logical operand is unconditionally safe: the sub-expression was already
 * evaluated as a unit, so redundant parens cannot change semantics.
 */
function parenthesizeLogical(
  text: string,
  operand: TSESTree.Expression | TSESTree.PrivateIdentifier,
): string {
  return operand.type === AST_NODE_TYPES.LogicalExpression ? `(${text})` : text;
}

/**
 * Detects parentheses that wrap the node itself. They live outside the node's
 * range, so a `replaceText` of the node preserves them and the rewrite needs no
 * parens of its own.
 */
function isParenthesized(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  const before = sourceCode.getTokenBefore(node);
  const after = sourceCode.getTokenAfter(node);
  return (
    !!before &&
    !!after &&
    before.type === AST_TOKEN_TYPES.Punctuator &&
    before.value === '(' &&
    after.type === AST_TOKEN_TYPES.Punctuator &&
    after.value === ')'
  );
}

/**
 * A partially converted chain (`a ?? b || c`) is a syntax error just like an
 * unparenthesized operand. Only one fix per overlapping range survives a pass,
 * so converting one link of a `||` chain always leaves the sibling links
 * untouched; parenthesizing the rewritten link keeps the emitted program
 * parseable while later passes convert the remaining links.
 */
function needsSelfParens(
  node: TSESTree.LogicalExpression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  const { parent } = node;
  if (
    !parent ||
    parent.type !== AST_NODE_TYPES.LogicalExpression ||
    parent.operator === '??'
  ) {
    return false;
  }
  return !isParenthesized(node, sourceCode);
}

/**
 * Comments the rewrite would delete.
 *
 * The fix rebuilds the whole expression from `getText` of each operand, so every
 * comment written inside the node but outside both operand ranges has no anchor
 * in the replacement: the trivia around the `||` operator, and anything sitting
 * inside source-level parentheses that the rebuild discards. Comments nested
 * within an operand travel with that operand's own text and are never stranded.
 */
function strandedComments(
  node: TSESTree.LogicalExpression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): TSESTree.Comment[] {
  const enclosedBy = (operand: TSESTree.Node) => (comment: TSESTree.Comment) =>
    comment.range[0] >= operand.range[0] &&
    comment.range[1] <= operand.range[1];
  const inLeft = enclosedBy(node.left);
  const inRight = enclosedBy(node.right);
  return sourceCode
    .getCommentsInside(node)
    .filter((comment) => !inLeft(comment) && !inRight(comment));
}

/**
 * The stranded comments split by the position they were written in, so each one
 * is re-emitted on the same side of the operator its author put it on. A comment
 * is a token and cannot straddle an operand or the operator, so the four groups
 * partition them exactly.
 */
type StrandedGroups = {
  leading: TSESTree.Comment[];
  beforeOperator: TSESTree.Comment[];
  afterOperator: TSESTree.Comment[];
  trailing: TSESTree.Comment[];
};

function groupStrandedComments(
  node: TSESTree.LogicalExpression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): StrandedGroups {
  const operator = sourceCode.getTokenAfter(node.left, {
    filter: (token) =>
      token.type === AST_TOKEN_TYPES.Punctuator && token.value === '||',
  });
  const groups: StrandedGroups = {
    leading: [],
    beforeOperator: [],
    afterOperator: [],
    trailing: [],
  };
  for (const comment of strandedComments(node, sourceCode)) {
    if (comment.range[1] <= node.left.range[0]) {
      groups.leading.push(comment);
    } else if (comment.range[0] >= node.right.range[1]) {
      groups.trailing.push(comment);
    } else if (operator && comment.range[1] <= operator.range[0]) {
      groups.beforeOperator.push(comment);
    } else {
      groups.afterOperator.push(comment);
    }
  }
  return groups;
}

/**
 * `return`, `throw` and `yield` forbid a LineTerminator between themselves and
 * their operand, so a carried comment that demands its own line cannot sit
 * between one of them and the rewritten expression: a line comment there ends
 * the statement through ASI, and so does a block comment carrying a line
 * terminator, which the grammar reads AS a LineTerminator (#1963). Such a
 * comment rides ahead of the keyword instead.
 *
 * The keyword token is the anchor rather than the start of its line because an
 * insertion point immediately before a token is always a token boundary, while a
 * line start can fall inside a multi-line template literal and would be written
 * into the template's text.
 */
const RESTRICTED_KEYWORDS = new Set(['return', 'throw', 'yield']);

function restrictedKeywordBefore(
  node: TSESTree.LogicalExpression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): TSESTree.Token | null {
  const before = sourceCode.getTokenBefore(node);
  return before && RESTRICTED_KEYWORDS.has(before.value) ? before : null;
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
    // getParserServices throws whenever the parser is not @typescript-eslint/parser
    // (espree for .js, jsonc-eslint-parser for package.json). A throw here fails the
    // entire lint run for that file, not just this rule, so mirror the same
    // precondition it checks and degrade to the syntactic analysis instead. The
    // `allowWithoutFullTypeInformation` flag only covers a TS parser lacking
    // `parserOptions.project`; it does not cover a non-TS parser.
    const services = context.parserServices;
    const hasTypeServices =
      !!services?.program &&
      !!services.esTreeNodeToTSNodeMap &&
      !!services.tsNodeToESTreeNodeMap;
    const parserServices = hasTypeServices
      ? ESLintUtils.getParserServices(context, true)
      : undefined;
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
            // A `||` that strips a falsy sentinel from outside its payload's
            // domain cannot become `??` without changing the expression's type.
            if (stripsForeignFalsyMember(node.left, checker, parserServices)) {
              return;
            }

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
                const groups = groupStrandedComments(node, sourceCode);
                // Whether the replacement is parenthesized is decided by the
                // expression's context exactly as it is without comments:
                // parentheses are tokens, so letting a carried comment add them
                // would make the comment change the emitted program.
                const selfParens = needsSelfParens(node, sourceCode);
                const text = sourceCode.getText();
                const toSegment = (
                  comment: TSESTree.Comment,
                ): ReplacementSegment => ({
                  text: text.slice(comment.range[0], comment.range[1]),
                  breakAfter: requiresLineBreakAfter(comment),
                });
                // A carried comment's only anchor is the line the expression
                // opens on, which can start mid-line.
                const startLine =
                  sourceCode.lines[node.loc.start.line - 1] ?? '';
                const indent = /^[\t ]*/.exec(startLine)?.[0] ?? '';

                // Inside parentheses a newline can never trigger ASI, so every
                // comment can ride within the replacement on a line of its own.
                // Without them, a leading comment that demands its own line
                // moves ahead of a restricted keyword when one governs the
                // expression; everywhere else a line break before the
                // expression is inert.
                const keyword = selfParens
                  ? null
                  : restrictedKeywordBefore(node, sourceCode);
                const hoisted = keyword
                  ? groups.leading.filter(requiresOwnLine)
                  : [];
                const segments: ReplacementSegment[] = [
                  ...groups.leading
                    .filter((comment) => !hoisted.includes(comment))
                    .map(toSegment),
                  {
                    text: parenthesizeLogical(leftText, node.left),
                    breakAfter: false,
                  },
                  ...groups.beforeOperator.map(toSegment),
                  { text: '??', breakAfter: false },
                  ...groups.afterOperator.map(toSegment),
                  {
                    text: parenthesizeLogical(rightText, node.right),
                    breakAfter: false,
                  },
                  ...groups.trailing.map(toSegment),
                ];

                if (selfParens) {
                  return fixer.replaceText(
                    node,
                    joinSegments(segments, indent),
                  );
                }

                const body = joinSegmentBody(segments, indent);
                const trailing = segments[segments.length - 1].breakAfter
                  ? `\n${indent}`
                  : '';
                const replacement = fixer.replaceText(
                  node,
                  `${body}${trailing}`,
                );
                if (!keyword || hoisted.length === 0) {
                  return replacement;
                }
                return [
                  fixer.insertTextBefore(
                    keyword,
                    hoisted
                      .map(
                        (comment) =>
                          `${text.slice(
                            comment.range[0],
                            comment.range[1],
                          )}\n${indent}`,
                      )
                      .join(''),
                  ),
                  replacement,
                ];
              },
            });
          }
        }
      },
    };
  },
});
