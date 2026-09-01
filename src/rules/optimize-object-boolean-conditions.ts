import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'extractBooleanCondition';

const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

const STATE_HOOK_NAMES = new Set(['useState']);

/**
 * Approved boolean-name prefixes, kept in sync with `DEFAULT_BOOLEAN_PREFIXES`
 * in `enforce-boolean-naming-prefixes`. The list is duplicated rather than
 * imported because that rule keeps it module-private, and exporting it would
 * make a single change span two rule files, which the repository's
 * one-rule-per-commit scope contract forbids.
 *
 * The duplication matters for correctness, not style: `enforce-boolean-naming-prefixes`
 * *requires* booleans to carry one of these prefixes, so treating `!isCollapsed`
 * as an object dependency would make the two rules contradict each other.
 *
 * `have` and `were` are the plural forms that rule derives at runtime from
 * `has` and `was`; `are` already ships in its base list.
 */
const BOOLEAN_NAME_PREFIXES = [
  'is',
  'are',
  'has',
  'have',
  'does',
  'can',
  'should',
  'will',
  'was',
  'were',
  'had',
  'did',
  'would',
  'must',
  'allows',
  'supports',
  'needs',
  'asserts',
  'includes',
];

/**
 * A name carries a boolean prefix only when the prefix ends on a word boundary,
 * so `isVisible` matches while object names that merely start with the same
 * letters (`isolatedConfig`, `canvasContext`, `willowTree`) do not.
 */
function hasBooleanNamePrefix(name: string): boolean {
  const normalized = name.startsWith('_') ? name.slice(1) : name;
  const lowerName = normalized.toLowerCase();

  return BOOLEAN_NAME_PREFIXES.some((prefix) => {
    if (!lowerName.startsWith(prefix)) {
      return false;
    }
    if (normalized.length === prefix.length) {
      return true;
    }

    const nextChar = normalized.charAt(prefix.length);
    const isScreamingSnakeCase =
      normalized === normalized.toUpperCase() && /[a-z]/i.test(normalized);
    if (isScreamingSnakeCase) {
      return nextChar === '_';
    }

    return (
      nextChar === '_' ||
      nextChar === '$' ||
      (nextChar >= '0' && nextChar <= '9') ||
      (nextChar === nextChar.toUpperCase() &&
        nextChar !== nextChar.toLowerCase())
    );
  });
}

const PRIMITIVE_TYPE_KEYWORDS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.TSBooleanKeyword,
  AST_NODE_TYPES.TSNumberKeyword,
  AST_NODE_TYPES.TSStringKeyword,
  AST_NODE_TYPES.TSBigIntKeyword,
]);

const NULLISH_TYPE_KEYWORDS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.TSNullKeyword,
  AST_NODE_TYPES.TSUndefinedKeyword,
]);

function isPrimitiveTypeNode(node: TSESTree.TypeNode | undefined): boolean {
  if (!node) {
    return false;
  }
  if (PRIMITIVE_TYPE_KEYWORDS.has(node.type)) {
    return true;
  }
  // Literal types (`true`, `'grid'`, `2`) are primitives too.
  if (node.type === AST_NODE_TYPES.TSLiteralType) {
    return true;
  }
  // `boolean | undefined` stays a primitive; a union qualifies only when every
  // member is primitive or nullish, and at least one is an actual primitive.
  if (node.type === AST_NODE_TYPES.TSUnionType) {
    return (
      node.types.some((member) => isPrimitiveTypeNode(member)) &&
      node.types.every(
        (member) =>
          isPrimitiveTypeNode(member) || NULLISH_TYPE_KEYWORDS.has(member.type),
      )
    );
  }
  return false;
}

/**
 * Every expression form handled here evaluates to a primitive regardless of its
 * operands: comparisons and arithmetic yield numbers/strings/booleans, and `!`,
 * `typeof` and friends yield booleans/strings/numbers.
 */
/** `as const` — a type reference whose name is the `const` contextual keyword. */
function isConstAssertion(typeNode: TSESTree.Node): boolean {
  return (
    typeNode.type === AST_NODE_TYPES.TSTypeReference &&
    typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
    typeNode.typeName.name === 'const'
  );
}

function isPrimitiveExpression(node: TSESTree.Node | undefined): boolean {
  if (!node) {
    return false;
  }
  switch (node.type) {
    case AST_NODE_TYPES.Literal: {
      const { value } = node;
      return (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
      );
    }
    case AST_NODE_TYPES.TemplateLiteral:
      return true;
    case AST_NODE_TYPES.UnaryExpression:
      return ['!', '-', '+', '~', 'typeof', 'void'].includes(node.operator);
    case AST_NODE_TYPES.BinaryExpression:
      return true;
    case AST_NODE_TYPES.TSAsExpression:
      // `as const` narrows rather than retypes, so the asserted expression
      // decides. Recursing keeps `{ a: 1 } as const` an object while accepting
      // `0 as const` — the form global-const-style and
      // enforce-object-literal-as-const rewrite bare constants into, so without
      // this the plugin's own fixers manufacture the report (#1581).
      return isConstAssertion(node.typeAnnotation)
        ? isPrimitiveExpression(node.expression)
        : isPrimitiveTypeNode(node.typeAnnotation);
    // `satisfies` never changes the value, only checks it.
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return isPrimitiveExpression(node.expression);
    case AST_NODE_TYPES.TSNonNullExpression:
      return isPrimitiveExpression(node.expression);
    default:
      return false;
  }
}

function propertyKeyNameOf(
  key: TSESTree.Node,
  computed: boolean,
): string | undefined {
  if (!computed && key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }
  return undefined;
}

function memberTypeOf(
  members: TSESTree.TypeElement[],
  keyName: string,
): TSESTree.TypeNode | undefined {
  for (const member of members) {
    if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
      continue;
    }
    if (propertyKeyNameOf(member.key, member.computed === true) === keyName) {
      return member.typeAnnotation?.typeAnnotation;
    }
  }
  return undefined;
}

function findVariableInScopes(
  scope: TSESLint.Scope.Scope | null,
  name: string,
): TSESLint.Scope.Variable | undefined {
  let currentScope = scope;
  while (currentScope) {
    const variable = currentScope.variables.find((v) => v.name === name);
    if (variable) {
      return variable;
    }
    currentScope = currentScope.upper;
  }
  return undefined;
}

/**
 * Resolves the declared type of a property inside an object type, following at
 * most a couple of hops through same-file type aliases and interfaces. Anything
 * that needs cross-file resolution stays unresolved: the rule then falls back to
 * reporting, which is the conservative direction for a suggestion-only rule.
 */
function propertyTypeOf(
  typeNode: TSESTree.TypeNode | undefined,
  keyName: string,
  scope: TSESLint.Scope.Scope | null,
  depth = 0,
): TSESTree.TypeNode | undefined {
  if (!typeNode || depth > 2) {
    return undefined;
  }
  if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
    return memberTypeOf(typeNode.members, keyName);
  }
  if (typeNode.type === AST_NODE_TYPES.TSIntersectionType) {
    for (const member of typeNode.types) {
      const resolved = propertyTypeOf(member, keyName, scope, depth + 1);
      if (resolved) {
        return resolved;
      }
    }
    return undefined;
  }
  if (
    typeNode.type === AST_NODE_TYPES.TSTypeReference &&
    typeNode.typeName.type === AST_NODE_TYPES.Identifier
  ) {
    const variable = findVariableInScopes(scope, typeNode.typeName.name);
    for (const def of variable?.defs ?? []) {
      if (def.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
        return propertyTypeOf(
          def.node.typeAnnotation,
          keyName,
          scope,
          depth + 1,
        );
      }
      if (def.node.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        return memberTypeOf(def.node.body.body, keyName);
      }
    }
  }
  return undefined;
}

/**
 * Finds the type annotation attached to a binding, including the annotation a
 * destructured prop inherits from its object pattern (`({ isOpen }: Props)`).
 */
function declaredTypeOf(
  nameNode: TSESTree.Identifier,
  scope: TSESLint.Scope.Scope | null,
): TSESTree.TypeNode | undefined {
  if (nameNode.typeAnnotation) {
    return nameNode.typeAnnotation.typeAnnotation;
  }

  let binding: TSESTree.Node = nameNode;
  const defaulted = binding.parent;
  if (
    defaulted?.type === AST_NODE_TYPES.AssignmentPattern &&
    defaulted.left === binding
  ) {
    if (defaulted.typeAnnotation) {
      return defaulted.typeAnnotation.typeAnnotation;
    }
    binding = defaulted;
  }

  const property = binding.parent;
  if (
    property?.type !== AST_NODE_TYPES.Property ||
    property.value !== binding ||
    property.parent?.type !== AST_NODE_TYPES.ObjectPattern
  ) {
    return undefined;
  }

  const keyName = propertyKeyNameOf(property.key, property.computed);
  if (!keyName) {
    return undefined;
  }

  return propertyTypeOf(
    property.parent.typeAnnotation?.typeAnnotation,
    keyName,
    scope,
  );
}

function isPrimitiveStateHookCall(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  const isStateHook =
    (callee.type === AST_NODE_TYPES.Identifier &&
      STATE_HOOK_NAMES.has(callee.name)) ||
    (callee.type === AST_NODE_TYPES.MemberExpression &&
      !callee.computed &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      STATE_HOOK_NAMES.has(callee.property.name));
  if (!isStateHook) {
    return false;
  }

  const explicitType = node.typeParameters?.params[0];
  if (explicitType) {
    return isPrimitiveTypeNode(explicitType);
  }
  return isPrimitiveExpression(node.arguments[0]);
}

function isPrimitiveInitializedVariable(
  nameNode: TSESTree.Identifier,
  declarator: TSESTree.VariableDeclarator,
): boolean {
  if (!declarator.init) {
    return false;
  }
  if (declarator.id === nameNode) {
    return isPrimitiveExpression(declarator.init);
  }
  // `const [isOpen, setIsOpen] = useState(false)` binds the state value first.
  if (
    declarator.id.type === AST_NODE_TYPES.ArrayPattern &&
    declarator.id.elements[0] === nameNode
  ) {
    return isPrimitiveStateHookCall(declarator.init);
  }
  return false;
}

function isPrimitiveBinding(
  variable: TSESLint.Scope.Variable,
  scope: TSESLint.Scope.Scope | null,
): boolean {
  return variable.defs.some((def) => {
    const nameNode = def.name;
    if (nameNode.type !== AST_NODE_TYPES.Identifier) {
      return false;
    }
    if (isPrimitiveTypeNode(declaredTypeOf(nameNode, scope))) {
      return true;
    }
    return (
      def.node.type === AST_NODE_TYPES.VariableDeclarator &&
      isPrimitiveInitializedVariable(nameNode, def.node)
    );
  });
}

/**
 * Predicate deciding whether a negated identifier may be treated as an object.
 * Negating a primitive cannot churn an object reference, so those identifiers
 * carry none of the cost this rule exists to remove.
 */
type ObjectIdentifierPredicate = (node: TSESTree.Identifier) => boolean;

interface BooleanConditionPattern {
  type: 'existence' | 'keyCount' | 'complex';
  objectName: string;
  expression: string;
  suggestedName: string;
  node: TSESTree.Node;
}

function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    (callee.type === AST_NODE_TYPES.Identifier &&
      HOOK_NAMES.has(callee.name)) ||
    (callee.type === AST_NODE_TYPES.MemberExpression &&
      !callee.computed &&
      callee.object.type === AST_NODE_TYPES.Identifier &&
      callee.object.name === 'React' &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      HOOK_NAMES.has(callee.property.name))
  );
}

function generateBooleanVariableName(
  objectName: string,
  conditionType: 'existence' | 'keyCount' | 'complex',
  isNegated: boolean,
): string {
  const base = capitalize(objectName);
  if (conditionType === 'existence') {
    return isNegated ? `is${base}Missing` : `has${base}`;
  }
  if (conditionType === 'keyCount') {
    return isNegated ? `is${base}Empty` : `has${base}`;
  }
  // complex: default to hasX to avoid over-guessing semantics
  return `has${base}`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isObjectExistenceCheck(
  node: TSESTree.Node,
  isObjectIdentifier: ObjectIdentifierPredicate,
): boolean {
  // Check for patterns like !obj
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    // !obj
    if (
      node.operator === '!' &&
      node.argument.type === AST_NODE_TYPES.Identifier
    ) {
      return isObjectIdentifier(node.argument);
    }
    // !!obj
    if (
      node.operator === '!' &&
      node.argument.type === AST_NODE_TYPES.UnaryExpression &&
      node.argument.operator === '!' &&
      node.argument.argument.type === AST_NODE_TYPES.Identifier
    ) {
      return isObjectIdentifier(node.argument.argument);
    }
  }
  return false;
}

function isObjectKeyCountCheck(node: TSESTree.Node): boolean {
  // Check for patterns like Object.keys(obj).length === 0 or Object.keys(obj).length > 0
  if (node.type === AST_NODE_TYPES.BinaryExpression) {
    const { left, operator, right } = node;

    // Check if left side is Object.keys(obj).length
    if (
      left.type === AST_NODE_TYPES.MemberExpression &&
      left.property.type === AST_NODE_TYPES.Identifier &&
      left.property.name === 'length' &&
      left.object.type === AST_NODE_TYPES.CallExpression
    ) {
      const callExpr = left.object;
      if (
        callExpr.callee.type === AST_NODE_TYPES.MemberExpression &&
        callExpr.callee.object.type === AST_NODE_TYPES.Identifier &&
        callExpr.callee.object.name === 'Object' &&
        callExpr.callee.property.type === AST_NODE_TYPES.Identifier &&
        callExpr.callee.property.name === 'keys' &&
        callExpr.arguments.length === 1 &&
        callExpr.arguments[0].type === AST_NODE_TYPES.Identifier
      ) {
        // Check if right side is a number
        if (
          right.type === AST_NODE_TYPES.Literal &&
          typeof right.value === 'number' &&
          ['===', '!==', '>', '<', '>=', '<='].includes(operator)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function isComplexBooleanExpression(
  node: TSESTree.Node,
  isObjectIdentifier: ObjectIdentifierPredicate,
): boolean {
  // Check for complex expressions involving objects
  if (node.type === AST_NODE_TYPES.LogicalExpression) {
    return (
      containsObjectCondition(node.left, isObjectIdentifier) ||
      containsObjectCondition(node.right, isObjectIdentifier)
    );
  }
  return false;
}

function containsObjectCondition(
  node: TSESTree.Node,
  isObjectIdentifier: ObjectIdentifierPredicate,
): boolean {
  return (
    isObjectExistenceCheck(node, isObjectIdentifier) ||
    isObjectKeyCountCheck(node) ||
    isComplexBooleanExpression(node, isObjectIdentifier)
  );
}

function extractObjectName(
  node: TSESTree.Node,
  isObjectIdentifier: ObjectIdentifierPredicate,
): string | null {
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    // Mirror the existence matcher so a primitive negation inside a larger
    // expression never becomes the reported "object".
    if (
      node.argument.type === AST_NODE_TYPES.Identifier &&
      isObjectIdentifier(node.argument)
    ) {
      return node.argument.name;
    }
  } else if (node.type === AST_NODE_TYPES.BinaryExpression) {
    const { left } = node;
    if (
      left.type === AST_NODE_TYPES.MemberExpression &&
      left.object.type === AST_NODE_TYPES.CallExpression &&
      left.object.callee.type === AST_NODE_TYPES.MemberExpression &&
      left.object.arguments.length === 1 &&
      left.object.arguments[0].type === AST_NODE_TYPES.Identifier
    ) {
      return left.object.arguments[0].name;
    }
  } else if (node.type === AST_NODE_TYPES.LogicalExpression) {
    // For complex expressions, try to extract from the first object condition found
    const leftObj = extractObjectName(node.left, isObjectIdentifier);
    if (leftObj) return leftObj;
    return extractObjectName(node.right, isObjectIdentifier);
  }
  return null;
}

function analyzeBooleanCondition(
  node: TSESTree.Node,
  context: {
    getSourceCode(): {
      getText(node: TSESTree.Node): string;
    };
  },
  isObjectIdentifier: ObjectIdentifierPredicate,
): BooleanConditionPattern | null {
  const sourceCode = context.getSourceCode();
  const expression = sourceCode.getText(node);

  if (isObjectExistenceCheck(node, isObjectIdentifier)) {
    const objectName = extractObjectName(node, isObjectIdentifier);
    if (objectName) {
      const isNegated =
        node.type === AST_NODE_TYPES.UnaryExpression &&
        node.operator === '!' &&
        !(
          node.argument.type === AST_NODE_TYPES.UnaryExpression &&
          node.argument.operator === '!'
        );

      return {
        type: 'existence',
        objectName,
        expression,
        suggestedName: generateBooleanVariableName(
          objectName,
          'existence',
          isNegated,
        ),
        node,
      };
    }
  } else if (isObjectKeyCountCheck(node)) {
    const objectName = extractObjectName(node, isObjectIdentifier);
    if (objectName) {
      const isNegated =
        expression.includes('=== 0') || expression.includes('<= 0');

      return {
        type: 'keyCount',
        objectName,
        expression,
        suggestedName: generateBooleanVariableName(
          objectName,
          'keyCount',
          isNegated,
        ),
        node,
      };
    }
  } else if (isComplexBooleanExpression(node, isObjectIdentifier)) {
    const objectName = extractObjectName(node, isObjectIdentifier);
    if (objectName) {
      return {
        type: 'complex',
        objectName,
        expression,
        suggestedName: generateBooleanVariableName(
          objectName,
          'complex',
          false,
        ),
        node,
      };
    }
  }

  return null;
}

function findBooleanConditionsInDependencies(
  depsArray: TSESTree.ArrayExpression,
  context: {
    getSourceCode(): {
      getText(node: TSESTree.Node): string;
    };
  },
  isObjectIdentifier: ObjectIdentifierPredicate,
): BooleanConditionPattern[] {
  const patterns: BooleanConditionPattern[] = [];

  for (const element of depsArray.elements) {
    if (!element) continue; // Skip holes in array

    const pattern = analyzeBooleanCondition(
      element,
      context,
      isObjectIdentifier,
    );
    if (pattern) {
      patterns.push(pattern);
    }
  }

  return patterns;
}

function isAlreadyBooleanVariable(node: TSESTree.Node): boolean {
  // Check if the dependency is already a boolean variable (starts with is, has, can, etc.)
  return (
    node.type === AST_NODE_TYPES.Identifier && hasBooleanNamePrefix(node.name)
  );
}

export const optimizeObjectBooleanConditions = createRule<[], MessageIds>({
  name: 'optimize-object-boolean-conditions',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detects and suggests optimizations for boolean conditions formed over objects in React hook dependencies. Suggests extracting boolean conditions into separate variables to reduce unnecessary re-computations when objects change frequently but the boolean condition changes less frequently.',
      recommended: 'error',
    },

    schema: [],
    messages: {
      extractBooleanCondition:
        'Dependency array includes boolean condition "{{expression}}" derived from object "{{objectName}}". Hook re-runs every time the object reference changes even when the boolean outcome stays the same, leading to wasted renders and unstable memoization. Extract the condition into a stable boolean like "{{suggestedName}}" and depend on that variable instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (!isHookCall(node)) {
          return;
        }

        // Get the dependency array argument (last argument for hooks)
        const depsArg = node.arguments[node.arguments.length - 1];
        if (!depsArg || depsArg.type !== AST_NODE_TYPES.ArrayExpression) {
          return;
        }

        const scope = context.getScope();
        const primitiveByName = new Map<string, boolean>();

        // A negated identifier only carries the cost this rule targets when it
        // can actually hold an object. Approved boolean prefixes (which
        // enforce-boolean-naming-prefixes mandates) and same-file primitive
        // evidence both rule that out; unresolved identifiers keep reporting.
        const isObjectIdentifier: ObjectIdentifierPredicate = (identifier) => {
          const { name } = identifier;
          if (hasBooleanNamePrefix(name)) {
            return false;
          }
          const cached = primitiveByName.get(name);
          if (cached !== undefined) {
            return !cached;
          }
          const variable = findVariableInScopes(scope, name);
          const isPrimitive = !!variable && isPrimitiveBinding(variable, scope);
          primitiveByName.set(name, isPrimitive);
          return !isPrimitive;
        };

        // Find boolean conditions in dependencies
        const patterns = findBooleanConditionsInDependencies(
          depsArg,
          context,
          isObjectIdentifier,
        );

        for (const pattern of patterns) {
          // Skip if it's already a boolean variable
          if (isAlreadyBooleanVariable(pattern.node)) {
            continue;
          }

          context.report({
            node: pattern.node,
            messageId: 'extractBooleanCondition',
            data: {
              expression: pattern.expression,
              suggestedName: pattern.suggestedName,
              objectName: pattern.objectName,
            },
          });
        }
      },
    };
  },
});
