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
 * exactly the ones the operator swap makes mandatory.
 *
 * A `??` operand is the exception: `??` chains with itself without parentheses,
 * and it is associative, so reading `a ?? (b ?? c)` as `a ?? b ?? c` yields the
 * same result from the same operands evaluated in the same order. Parenthesizing
 * it emits text prettier immediately rewrites, which lands non-canonical source
 * in a repository whose lint runs `--fix` before a human sees the report.
 */
function parenthesizeLogical(
  text: string,
  operand: TSESTree.Expression | TSESTree.PrivateIdentifier,
): string {
  return operand.type === AST_NODE_TYPES.LogicalExpression &&
    operand.operator !== '??'
    ? `(${text})`
    : text;
}

/**
 * The pair of source-level parentheses wrapping the node, which live outside the
 * node's own range.
 */
function enclosingParens(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): [TSESTree.Token, TSESTree.Token] | null {
  const before = sourceCode.getTokenBefore(node);
  const after = sourceCode.getTokenAfter(node);
  if (
    !before ||
    !after ||
    before.type !== AST_TOKEN_TYPES.Punctuator ||
    before.value !== '(' ||
    after.type !== AST_TOKEN_TYPES.Punctuator ||
    after.value !== ')'
  ) {
    return null;
  }
  return [before, after];
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
  return enclosingParens(node, sourceCode) !== null;
}

/**
 * The operator a chain lands after when it is introduced by one, and the gap
 * between that operator and the chain holds nothing but whitespace.
 *
 * Prettier keeps a chain that breaks off the operator's own line entirely: it
 * breaks after `=`, `:` or `=>` and prints every operand one indent level in,
 * so a fix that rebuilds a broken chain beside the operator emits a shape the
 * formatter immediately rewrites. Claiming the operator's own line break is
 * what lets the fix land that layout in one span.
 *
 * The landing shapes are the ones measured to take that break. `return`,
 * `throw` and `yield` are absent because prettier parenthesizes a broken chain
 * after them instead, and parentheses are tokens: adding them because a comment
 * is present would let the comment change the emitted program. A JSX attribute
 * is absent because prettier answers it by re-breaking the whole opening
 * element, which is outside the expression this fix owns. An argument, an array
 * element and a parameter default are absent because prettier measurably keeps
 * the chain's first operand beside them.
 *
 * A comment written between the operator and the chain has no anchor in the
 * rebuilt text, so its presence withdraws the widening rather than letting the
 * span delete it — the same discipline the redundant-paren widening keeps.
 */
function landingOperator(
  node: TSESTree.LogicalExpression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): TSESTree.Token | null {
  const { parent } = node;
  const token = sourceCode.getTokenBefore(node);
  if (!parent || !token || token.type !== AST_TOKEN_TYPES.Punctuator) {
    return null;
  }
  const lands =
    (parent.type === AST_NODE_TYPES.VariableDeclarator &&
      parent.init === node &&
      token.value === '=') ||
    (parent.type === AST_NODE_TYPES.AssignmentExpression &&
      parent.right === node &&
      token.value === parent.operator) ||
    (parent.type === AST_NODE_TYPES.PropertyDefinition &&
      parent.value === node &&
      token.value === '=') ||
    (parent.type === AST_NODE_TYPES.Property &&
      parent.value === node &&
      token.value === ':') ||
    (parent.type === AST_NODE_TYPES.ArrowFunctionExpression &&
      parent.body === node &&
      token.value === '=>');
  if (!lands) {
    return null;
  }
  const gap = sourceCode.getText().slice(token.range[1], node.range[0]);
  return gap.trim() === '' ? token : null;
}

/**
 * Whether the rebuilt chain still holds a `||` link a later pass converts.
 *
 * Two things withhold the landing break from such a pass. The emitted layout is
 * not the chain's final one — the surviving link comes back parenthesized and
 * its own fix rewrites the same text again — and a fix reaching back to the
 * landing operator starts EARLIER than that link's own fix, which starts at the
 * chain's first operand. ESLint keeps the earlier of two overlapping fixes and
 * drops the other, so claiming the operator here would convert the chain from
 * the outside in and leave the inner link indented one level deeper than
 * prettier prints it.
 */
function hasUnconvertedLink(node: TSESTree.LogicalExpression): boolean {
  const isOrLink = (operand: TSESTree.Node) =>
    operand.type === AST_NODE_TYPES.LogicalExpression &&
    operand.operator === '||';
  return isOrLink(node.left) || isOrLink(node.right);
}

/**
 * The span the fix replaces: the node, widened over parentheses the operator
 * swap makes redundant, or back through the operator the chain lands after when
 * the rebuilt chain takes that operator's line break.
 *
 * A `||` can only be an operand of `??` when parentheses separate them, so those
 * parens survive into the fixed source even though `??` needs none against a
 * `??` parent. Left there they are text prettier strips, so the fix claims them
 * and emits the chain flat.
 *
 * The widened span swallows the margins between each paren and the node, which
 * `getCommentsInside(node)` never reports — a comment written there would be
 * deleted rather than carried, so its presence withdraws the widening and keeps
 * the (harmless) parens instead.
 *
 * The two widenings cannot both apply: a node whose parent is a `??` sits
 * behind a `(`, never behind an operator a chain lands after.
 */
function replacementRange(
  node: TSESTree.LogicalExpression,
  sourceCode: Readonly<TSESLint.SourceCode>,
  landing: TSESTree.Token | null,
): TSESTree.Range {
  if (landing) {
    return [landing.range[1], node.range[1]];
  }
  const { parent } = node;
  if (
    !parent ||
    parent.type !== AST_NODE_TYPES.LogicalExpression ||
    parent.operator !== '??'
  ) {
    return node.range;
  }
  const parens = enclosingParens(node, sourceCode);
  if (!parens) {
    return node.range;
  }
  const [open, close] = parens;
  const text = sourceCode.getText();
  const marginsAreBlank =
    text.slice(open.range[1], node.range[0]).trim() === '' &&
    text.slice(node.range[1], close.range[0]).trim() === '';
  return marginsAreBlank ? [open.range[0], close.range[1]] : node.range;
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
 * A comment written between the operands of a logical chain that demands a line
 * of its own, whether this fix carries it or an earlier pass already baked it
 * into an operand's text.
 *
 * The recursion follows only operands that are themselves logical expressions,
 * because those are the links the rebuild joins into one chain. A comment nested
 * inside an operand's own brackets — a line comment in an object literal passed
 * to a call — belongs to that operand's layout and leaves the chain's own layout
 * alone, which is how prettier prints it.
 */
function chainBreaksLine(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  if (node.type !== AST_NODE_TYPES.LogicalExpression) {
    return false;
  }
  return (
    strandedComments(node, sourceCode).some(requiresLineBreakAfter) ||
    chainBreaksLine(node.left, sourceCode) ||
    chainBreaksLine(node.right, sourceCode)
  );
}

/**
 * The depths the rebuilt expression lands at.
 *
 * `lineIndent` is the indentation of the line the expression opens on, which is
 * where the statement introducing it sits: text pushed ahead of that statement,
 * and text resuming after the expression, belongs at that column.
 *
 * `bodyIndent` is where the chain's own lines belong. An expression that already
 * opens its own line keeps that line's indentation; one sharing its opening line
 * with the code that introduces it (`const uid = …`) is a continuation of that
 * line and lands one level deeper, which is the column prettier gives the chain.
 * Taking the opening line's indentation verbatim in that case drops every
 * continuation operand to column 0 — an indentation no formatter produces and no
 * author wrote.
 *
 * `opensItsLine` is also what decides whether the chain still needs the line
 * break its landing operator carries: one already opening its own line has it.
 *
 * The step matches the indentation already in use so a tab-indented file is not
 * given a space-indented continuation.
 */
function landingIndent(
  node: TSESTree.LogicalExpression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): { lineIndent: string; bodyIndent: string; opensItsLine: boolean } {
  const startLine = sourceCode.lines[node.loc.start.line - 1] ?? '';
  const lineIndent = /^[\t ]*/.exec(startLine)?.[0] ?? '';
  const opensItsLine = startLine.slice(0, node.loc.start.column).trim() === '';
  const step = lineIndent.includes('\t') ? '\t' : '  ';
  return {
    lineIndent,
    bodyIndent: opensItsLine ? lineIndent : `${lineIndent}${step}`,
    opensItsLine,
  };
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
                const { lineIndent, bodyIndent, opensItsLine } = landingIndent(
                  node,
                  sourceCode,
                );

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
                const leadingSegments = groups.leading
                  .filter((comment) => !hoisted.includes(comment))
                  .map(toSegment);
                const beforeOperatorSegments =
                  groups.beforeOperator.map(toSegment);
                const afterOperatorSegments =
                  groups.afterOperator.map(toSegment);
                const trailingSegments = groups.trailing.map(toSegment);
                const segments: ReplacementSegment[] = [
                  ...leadingSegments,
                  {
                    text: parenthesizeLogical(leftText, node.left),
                    breakAfter: false,
                  },
                  ...beforeOperatorSegments,
                  { text: '??', breakAfter: false },
                  ...afterOperatorSegments,
                  {
                    text: parenthesizeLogical(rightText, node.right),
                    breakAfter: false,
                  },
                  ...trailingSegments,
                ];

                // Prettier prints every operand of a logical chain broken by a
                // comment on a line of its own, so an operand re-joined onto the
                // line above it lands non-canonical source. The break rides
                // after the operator, where the chain's other breaks already
                // sit, and only when nothing between the operands breaks the
                // line already — a carried comment holding them apart needs no
                // second separator.
                const leftIndex = leadingSegments.length;
                const operatorIndex =
                  leftIndex + 1 + beforeOperatorSegments.length;
                const rightIndex =
                  operatorIndex + 1 + afterOperatorSegments.length;
                const operandsSeparated = segments
                  .slice(leftIndex, rightIndex)
                  .some((segment) => segment.breakAfter);
                if (
                  !operandsSeparated &&
                  (chainBreaksLine(node.left, sourceCode) ||
                    chainBreaksLine(node.right, sourceCode))
                ) {
                  segments[operatorIndex] = {
                    ...segments[operatorIndex],
                    breakAfter: true,
                  };
                }

                if (selfParens) {
                  return fixer.replaceText(
                    node,
                    joinSegments(segments, bodyIndent),
                  );
                }

                // Prettier prints a chain that breaks starting on its own
                // line, so a first operand left beside the `=`, `:` or `=>` it
                // lands after is text the formatter rewrites. The fix claims
                // that operator's line break, but only where the chain does not
                // open its own line already, so an input that carries the break
                // is re-emitted byte-identical.
                //
                // The break belongs to the chain, so only the chain's own breaks
                // ask for it: a comment trailing the whole expression sits
                // outside it, and prettier leaves such a chain on one line.
                const chainSpansLines = segments
                  .slice(0, rightIndex)
                  .some((segment) => segment.breakAfter);
                const landing =
                  chainSpansLines && !opensItsLine && !hasUnconvertedLink(node)
                    ? landingOperator(node, sourceCode)
                    : null;
                const leading = landing ? `\n${bodyIndent}` : '';
                const body = joinSegmentBody(segments, bodyIndent);
                const trailing = segments[segments.length - 1].breakAfter
                  ? `\n${lineIndent}`
                  : '';
                const replacement = fixer.replaceTextRange(
                  replacementRange(node, sourceCode, landing),
                  `${leading}${body}${trailing}`,
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
                          )}\n${lineIndent}`,
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
