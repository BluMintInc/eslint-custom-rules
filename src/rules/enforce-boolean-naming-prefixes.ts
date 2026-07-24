import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';
import pluralize from 'pluralize';
import { createRule } from '../utils/createRule';

type MessageIds = 'missingBooleanPrefix';
type Options = [
  {
    prefixes?: string[];
    ignoreOverriddenGetters?: boolean;
    enforceForPropertySignatures?: boolean;
  },
];

// Default approved boolean prefixes. Some less common prefixes (e.g., 'are',
// 'includes') stay allowed for flexibility even though the user-facing message
// highlights only the most common ones. Underscore-prefixed names are also
// intentionally allowed for private/internal fields.
const DEFAULT_BOOLEAN_PREFIXES = [
  'is',
  'has',
  'does',
  'can',
  'should',
  'will',
  'was',
  'had',
  'did',
  'would',
  'must',
  'allows',
  'supports',
  'needs',
  'asserts',
  'includes',
  'are', // Adding 'are' as an approved prefix (plural form of 'is')
];

const DEFAULT_OPTIONS: Required<Options[0]> = {
  prefixes: DEFAULT_BOOLEAN_PREFIXES,
  ignoreOverriddenGetters: false,
  // Property names declared in interfaces and type aliases are frequently
  // dictated by contracts the author cannot rename: external API request/response
  // shapes, third-party library interfaces, and persisted data-model schemas
  // (e.g. Firestore document fields). Flagging those produces unavoidable false
  // positives, so property-signature enforcement is opt-in. Names the author does
  // choose freshly — variables, function returns, class fields, parameters — stay
  // enforced by default.
  enforceForPropertySignatures: false,
};

const BOOLEANISH_BINARY_OPERATORS = new Set<
  TSESTree.BinaryExpression['operator']
>(['===', '!==', '==', '!=', '>', '<', '>=', '<=', 'in', 'instanceof']);

export const enforceBooleanNamingPrefixes = createRule<Options, MessageIds>({
  name: 'enforce-boolean-naming-prefixes',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce consistent naming conventions for boolean values by requiring approved prefixes',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          prefixes: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          ignoreOverriddenGetters: {
            type: 'boolean',
            default: false,
          },
          enforceForPropertySignatures: {
            type: 'boolean',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingBooleanPrefix:
        'Boolean {{type}} "{{name}}" is missing a common approved boolean prefix ({{prefixes}}). ' +
        'Prefixes immediately communicate that the value is a true/false predicate; without one, checks like `if ({{name}})` read as generic truthiness guards and hide the boolean intent. ' +
        'Rename by prepending any approved prefix so the name becomes `<prefix>{{capitalizedName}}`, making the boolean contract obvious at call sites and API boundaries.',
    },
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(context, [options]) {
    const approvedPrefixes = options.prefixes || DEFAULT_OPTIONS.prefixes;
    const approvedPrefixesWithoutAsserts = approvedPrefixes.filter(
      (p) => p !== 'asserts',
    );
    const ignoreOverriddenGetters =
      options.ignoreOverriddenGetters ??
      DEFAULT_OPTIONS.ignoreOverriddenGetters;
    const enforceForPropertySignatures =
      options.enforceForPropertySignatures ??
      DEFAULT_OPTIONS.enforceForPropertySignatures;

    function findVariableInScopes(
      name: string,
    ): TSESLint.Scope.Variable | undefined {
      let currentScope: TSESLint.Scope.Scope | null = context.getScope();
      while (currentScope) {
        const variable = currentScope.variables.find((v) => v.name === name);
        if (variable) return variable;
        currentScope = currentScope.upper;
      }
      return undefined;
    }

    /**
     * Check if a name is prefixed by a boolean keyword with proper boundaries.
     * Supports camelCase (isSomething), snake_case (is_something, IS_SOMETHING),
     * and exact matches.
     */
    function isPrefixedByBooleanKeyword(
      name: string,
      prefixes: string[],
    ): boolean {
      const normalizedName = name.startsWith('_') ? name.slice(1) : name;

      const checkPrefix = (p: string) => {
        if (!normalizedName.toLowerCase().startsWith(p.toLowerCase())) {
          return false;
        }

        if (normalizedName.length === p.length) {
          return true;
        }

        const nextChar = normalizedName.charAt(p.length);

        // For SCREAMING_SNAKE_CASE or similar all-uppercase names,
        // we require an underscore boundary.
        const isAllUppercase =
          normalizedName === normalizedName.toUpperCase() &&
          /[a-z]/i.test(normalizedName);
        if (isAllUppercase) {
          return nextChar === '_';
        }

        // For camelCase, the next char must be uppercase, a digit, or $
        return (
          nextChar === '_' ||
          nextChar === '$' ||
          (nextChar >= '0' && nextChar <= '9') ||
          (nextChar === nextChar.toUpperCase() &&
            nextChar !== nextChar.toLowerCase())
        );
      };

      const checkPrefixWithPlural = (p: string) => {
        if (checkPrefix(p)) return true;

        if (['is', 'has', 'does', 'was', 'had', 'did'].includes(p)) {
          const pluralPrefix = pluralize.plural(p);
          if (checkPrefix(pluralPrefix)) return true;
        }

        return false;
      };

      return prefixes.some((prefix) => checkPrefixWithPlural(prefix));
    }

    /**
     * Check if a name starts with any of the approved prefixes, their plural forms,
     * or if it starts with an underscore (which indicates a private/internal property)
     */
    function hasApprovedPrefix(
      name: string,
      options?: { treatLeadingUnderscoreAsApproved?: boolean },
    ): boolean {
      const treatLeadingUnderscoreAsApproved =
        options?.treatLeadingUnderscoreAsApproved ?? true;

      // Skip checking properties that start with an underscore (private/internal properties)
      if (treatLeadingUnderscoreAsApproved && name.startsWith('_')) {
        return true;
      }

      return isPrefixedByBooleanKeyword(name, approvedPrefixes);
    }

    function nameSuggestsBoolean(name: string): boolean {
      const normalizedName = name.startsWith('_') ? name.slice(1) : name;
      const lowerName = normalizedName.toLowerCase();
      const suffixKeywords = [
        'active',
        'inactive',
        'enabled',
        'disabled',
        'visible',
        'ready',
        'valid',
        'verified',
        'authenticated',
        'authorized',
      ];

      return (
        isPrefixedByBooleanKeyword(normalizedName, approvedPrefixes) ||
        suffixKeywords.some((keyword) => lowerName.endsWith(keyword))
      );
    }

    /**
     * Capitalize the first letter of a name for use in suggested alternatives
     */
    function capitalizeFirst(name: string): string {
      if (!name) return '';
      return name.charAt(0).toUpperCase() + name.slice(1);
    }

    /**
     * Format the list of approved prefixes for error messages
     * Note: We exclude 'are' and 'includes' from the error message to maintain backward compatibility with tests
     */
    function formatPrefixes(): string {
      // Filter out 'are' and 'includes' from the displayed prefixes to maintain backward compatibility with tests
      const displayPrefixes = approvedPrefixes.filter(
        (prefix) => prefix !== 'are' && prefix !== 'includes',
      );
      return displayPrefixes.join(', ');
    }

    /**
     * Check if a node is a TypeScript type predicate
     */
    function isTypePredicate(node: TSESTree.Node): boolean {
      if (
        node.parent?.type === AST_NODE_TYPES.TSTypeAnnotation &&
        node.parent.parent?.type === AST_NODE_TYPES.Identifier &&
        node.parent.parent.parent?.type === AST_NODE_TYPES.FunctionDeclaration
      ) {
        const typeAnnotation = node.parent;
        return (
          typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypePredicate
        );
      }
      return false;
    }

    /**
     * Check if a node has a boolean type annotation
     */
    function hasBooleanTypeAnnotation(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.Identifier) {
        // Check for explicit boolean type annotation
        if (
          node.typeAnnotation?.typeAnnotation.type ===
          AST_NODE_TYPES.TSBooleanKeyword
        ) {
          return true;
        }

        // Check if it's a parameter in a function with a boolean type
        if (
          node.parent?.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.parent?.type === AST_NODE_TYPES.FunctionExpression ||
          node.parent?.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          if (
            node.typeAnnotation?.typeAnnotation &&
            node.typeAnnotation.typeAnnotation.type ===
              (AST_NODE_TYPES.TSBooleanKeyword as any)
          ) {
            return true;
          }
        }
      }

      // Check for property signature with boolean type
      if (
        node.type === AST_NODE_TYPES.TSPropertySignature &&
        node.typeAnnotation?.typeAnnotation.type ===
          AST_NODE_TYPES.TSBooleanKeyword
      ) {
        return true;
      }

      return false;
    }

    /**
     * Check if a node is initialized with a boolean value
     */
    function hasInitialBooleanValue(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.VariableDeclarator && node.init) {
        // Check for direct boolean literal initialization
        if (
          node.init.type === AST_NODE_TYPES.Literal &&
          typeof node.init.value === 'boolean'
        ) {
          return true;
        }

        // Check for logical expressions that typically return boolean
        if (
          node.init.type === AST_NODE_TYPES.BinaryExpression &&
          BOOLEANISH_BINARY_OPERATORS.has(node.init.operator)
        ) {
          return true;
        }

        // Check for logical expressions (&&)
        if (
          node.init.type === AST_NODE_TYPES.LogicalExpression &&
          node.init.operator === '&&'
        ) {
          const left = evaluateBooleanishExpression(node.init.left);
          const right = evaluateBooleanishExpression(node.init.right);

          // If both sides are boolean, the result is boolean.
          if (left === 'boolean' && right === 'boolean') {
            return true;
          }

          // If the right side is boolean, and the left side is unknown (but not non-boolean),
          // we treat it as boolean to avoid false negatives for common patterns like `user && user.isActive`.
          // This is a trade-off: it might cause some false positives for non-boolean variables
          // used as guards, but those are less common than the `user && user.isActive` pattern.
          if (right === 'boolean' && left === 'unknown') {
            return true;
          }

          return false;
        }

        // Special case for logical OR (||) - only consider it boolean if:
        // 1. It's used with boolean literals or
        // 2. It's not used with array/object literals as fallbacks
        if (
          node.init.type === AST_NODE_TYPES.LogicalExpression &&
          node.init.operator === '||'
        ) {
          // Check if right side is a non-boolean literal (array, object, string, number)
          const rightSide = node.init.right;
          if (
            rightSide.type === AST_NODE_TYPES.ArrayExpression ||
            rightSide.type === AST_NODE_TYPES.ObjectExpression ||
            (rightSide.type === AST_NODE_TYPES.Literal &&
              typeof rightSide.value !== 'boolean')
          ) {
            return false;
          }

          // If right side is a boolean literal, it's likely a boolean variable
          if (
            rightSide.type === AST_NODE_TYPES.Literal &&
            typeof rightSide.value === 'boolean'
          ) {
            return true;
          }

          // For other cases, we need to be more careful
          // If we can determine the left side is a boolean, then it's a boolean variable
          const leftSide = node.init.left;
          if (
            (leftSide.type === AST_NODE_TYPES.Literal &&
              typeof leftSide.value === 'boolean') ||
            (leftSide.type === AST_NODE_TYPES.UnaryExpression &&
              leftSide.operator === '!')
          ) {
            return true;
          }

          // For function calls, check if the function name suggests it returns a boolean
          if (
            leftSide.type === AST_NODE_TYPES.CallExpression &&
            leftSide.callee.type === AST_NODE_TYPES.Identifier
          ) {
            const calleeName = leftSide.callee.name;
            const lowerCallee = calleeName.toLowerCase();

            // For assert*-style utilities, only treat as boolean if we can confirm boolean return type
            if (lowerCallee.startsWith('assert')) {
              return identifierReturnsBoolean(calleeName);
            }

            return calleeNameImpliesBoolean(
              calleeName,
              approvedPrefixesWithoutAsserts,
            );
          }

          // Default to false for other cases with || to avoid false positives
          return false;
        }

        // Check for unary expressions with ! operator
        if (
          node.init.type === AST_NODE_TYPES.UnaryExpression &&
          node.init.operator === '!'
        ) {
          return true;
        }

        // Check for function calls that might return boolean
        if (
          node.init.type === AST_NODE_TYPES.CallExpression &&
          node.init.callee.type === AST_NODE_TYPES.Identifier
        ) {
          const calleeName = node.init.callee.name;
          const lowerCallee = calleeName.toLowerCase();

          // For assert*-style utilities, only treat as boolean if we can confirm boolean return type
          if (lowerCallee.startsWith('assert')) {
            return identifierReturnsBoolean(calleeName);
          }

          // Check if the function name suggests it returns a boolean
          return calleeNameImpliesBoolean(
            calleeName,
            approvedPrefixesWithoutAsserts,
          );
        }
      }

      return false;
    }

    /**
     * Check if a function returns a boolean value
     */
    function returnsBooleanValue(node: TSESTree.FunctionLike): boolean {
      // Check for explicit boolean return type annotation
      if (
        node.returnType?.typeAnnotation &&
        node.returnType.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any)
      ) {
        return true;
      }

      // For arrow functions with expression bodies, check if the expression is boolean-like
      if (
        node.type === AST_NODE_TYPES.ArrowFunctionExpression &&
        node.expression &&
        node.body
      ) {
        if (
          node.body.type === AST_NODE_TYPES.Literal &&
          typeof node.body.value === 'boolean'
        ) {
          return true;
        }
        if (
          node.body.type === AST_NODE_TYPES.BinaryExpression &&
          BOOLEANISH_BINARY_OPERATORS.has(node.body.operator)
        ) {
          return true;
        }
        if (
          node.body.type === AST_NODE_TYPES.UnaryExpression &&
          node.body.operator === '!'
        ) {
          return true;
        }
      }

      // Check for arrow function with boolean return type
      if (node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        const variableDeclarator = node.parent;
        if (
          variableDeclarator?.type === AST_NODE_TYPES.VariableDeclarator &&
          variableDeclarator.id.type === AST_NODE_TYPES.Identifier
        ) {
          // Check if the arrow function has a boolean return type annotation
          if (
            node.returnType?.typeAnnotation &&
            node.returnType.typeAnnotation.type ===
              (AST_NODE_TYPES.TSBooleanKeyword as any)
          ) {
            return true;
          }
        }
      }

      return false;
    }

    type BooleanEvaluation = 'boolean' | 'nonBoolean' | 'unknown';

    function identifierIsBoolean(identifier: TSESTree.Identifier): boolean {
      if (nameSuggestsBoolean(identifier.name)) {
        return true;
      }

      const variable = findVariableInScopes(identifier.name);
      if (!variable) return false;

      for (const def of variable.defs) {
        if (def.type === 'Variable' && def.node) {
          const declarator = def.node as unknown as TSESTree.VariableDeclarator;
          if (
            declarator.id.type === AST_NODE_TYPES.Identifier &&
            (hasBooleanTypeAnnotation(declarator.id) ||
              hasInitialBooleanValue(declarator))
          ) {
            return true;
          }
        }

        if (
          def.type === 'Parameter' &&
          def.name?.type === AST_NODE_TYPES.Identifier &&
          hasBooleanTypeAnnotation(def.name)
        ) {
          return true;
        }

        if (
          def.type === 'FunctionName' &&
          def.node &&
          returnsBooleanValue(def.node as unknown as TSESTree.FunctionLike)
        ) {
          return true;
        }
      }

      return false;
    }

    function callExpressionLooksBoolean(
      callExpression: TSESTree.CallExpression,
    ): BooleanEvaluation {
      if (callExpression.callee.type === AST_NODE_TYPES.Identifier) {
        const calleeName = callExpression.callee.name;
        const lowerCallee = calleeName.toLowerCase();

        if (lowerCallee.startsWith('assert')) {
          return identifierReturnsBoolean(calleeName) ? 'boolean' : 'unknown';
        }

        // Treat the callee as returning boolean when it has a boolean-indicating
        // prefix at a proper name boundary. We check both the approved output
        // prefixes (is/has/can/…) and additional callee-specific indicators
        // (check, auth, valid, enabled, boolean). The critical constraint is
        // boundary-correct starts-with: `checkAuth` (check + Auth, uppercase
        // boundary) → boolean; `preserveUsersCheckedIn` (check is a substring
        // mid-word, not a boundary prefix) → not boolean. Using
        // isPrefixedByBooleanKeyword for all checks prevents the false-positive
        // that raw String.includes() caused.
        const calleeBooleanPrefixes = [
          ...approvedPrefixesWithoutAsserts,
          'check',
          'auth',
          'valid',
          'enabled',
          'boolean',
        ];

        const matchesPrefix = isPrefixedByBooleanKeyword(
          calleeName,
          calleeBooleanPrefixes,
        );

        if (matchesPrefix) {
          // The callee's declaration outranks its name: a resolvable predicate
          // that demonstrably returns a verdict object, a string or a Promise
          // yields a non-boolean value no matter how it is named.
          return calleeReturnEvaluation(calleeName) === 'nonBoolean'
            ? 'nonBoolean'
            : 'boolean';
        }

        if (
          lowerCallee.startsWith('get') ||
          lowerCallee.startsWith('fetch') ||
          lowerCallee.startsWith('retrieve') ||
          lowerCallee.startsWith('load') ||
          lowerCallee.startsWith('read')
        ) {
          return 'unknown';
        }
      }

      if (
        callExpression.callee.type === AST_NODE_TYPES.MemberExpression &&
        callExpression.callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        const methodName = callExpression.callee.property.name;
        const lowerMethodName = methodName.toLowerCase();

        if (lowerMethodName.startsWith('assert')) {
          return 'unknown';
        }

        // Same boundary-aware prefix check for method names on member expressions.
        const methodBooleanPrefixes = [
          ...approvedPrefixesWithoutAsserts,
          'check',
          'auth',
          'valid',
          'enabled',
          'boolean',
        ];

        const matchesPrefix = isPrefixedByBooleanKeyword(
          methodName,
          methodBooleanPrefixes,
        );

        if (matchesPrefix) {
          return 'boolean';
        }
      }

      return 'unknown';
    }

    function evaluateBooleanishExpression(
      expression: TSESTree.Expression | null | undefined,
    ): BooleanEvaluation {
      if (!expression) return 'unknown';

      let currentExpression: TSESTree.Expression = expression;

      if (
        currentExpression.type === AST_NODE_TYPES.TSAsExpression ||
        currentExpression.type === AST_NODE_TYPES.TSTypeAssertion ||
        currentExpression.type === AST_NODE_TYPES.TSSatisfiesExpression
      ) {
        if (
          currentExpression.typeAnnotation?.type ===
          AST_NODE_TYPES.TSBooleanKeyword
        ) {
          return 'boolean';
        }

        currentExpression = currentExpression.expression as TSESTree.Expression;
      }

      if (currentExpression.type === AST_NODE_TYPES.ChainExpression) {
        currentExpression = currentExpression.expression;
      }

      if (
        (currentExpression as { type: string }).type ===
        'ParenthesizedExpression'
      ) {
        return evaluateBooleanishExpression(
          (currentExpression as { expression: TSESTree.Expression }).expression,
        );
      }

      if (currentExpression.type === AST_NODE_TYPES.TSNonNullExpression) {
        return evaluateBooleanishExpression(
          currentExpression.expression as TSESTree.Expression,
        );
      }

      if (
        currentExpression.type === AST_NODE_TYPES.Literal &&
        typeof currentExpression.value === 'boolean'
      ) {
        return 'boolean';
      }

      if (currentExpression.type === AST_NODE_TYPES.Identifier) {
        return identifierIsBoolean(currentExpression) ? 'boolean' : 'unknown';
      }

      if (
        currentExpression.type === AST_NODE_TYPES.MemberExpression &&
        currentExpression.property.type === AST_NODE_TYPES.Identifier
      ) {
        return nameSuggestsBoolean(currentExpression.property.name)
          ? 'boolean'
          : 'unknown';
      }

      if (currentExpression.type === AST_NODE_TYPES.CallExpression) {
        return callExpressionLooksBoolean(currentExpression);
      }

      if (currentExpression.type === AST_NODE_TYPES.BinaryExpression) {
        if (BOOLEANISH_BINARY_OPERATORS.has(currentExpression.operator)) {
          return 'boolean';
        }
      }

      if (
        currentExpression.type === AST_NODE_TYPES.UnaryExpression &&
        currentExpression.operator === '!'
      ) {
        return 'boolean';
      }

      if (currentExpression.type === AST_NODE_TYPES.LogicalExpression) {
        const left = evaluateBooleanishExpression(currentExpression.left);
        const right = evaluateBooleanishExpression(currentExpression.right);

        if (left === 'nonBoolean' || right === 'nonBoolean') {
          return 'nonBoolean';
        }

        if (left === 'boolean' && right === 'boolean') {
          return 'boolean';
        }

        return 'unknown';
      }

      if (currentExpression.type === AST_NODE_TYPES.ConditionalExpression) {
        const consequent = evaluateBooleanishExpression(
          currentExpression.consequent,
        );
        const alternate = evaluateBooleanishExpression(
          currentExpression.alternate,
        );

        if (consequent === 'nonBoolean' || alternate === 'nonBoolean') {
          return 'nonBoolean';
        }

        if (consequent === 'boolean' && alternate === 'boolean') {
          return 'boolean';
        }

        return 'unknown';
      }

      return 'unknown';
    }

    /**
     * Attempt to resolve an identifier to a function declaration/expression and detect if it returns boolean
     */
    function identifierReturnsBoolean(name: string): boolean {
      // Try to find the variable in all scopes, starting from current and going up
      let currentScope: any = context.getScope();
      let variable: any = undefined;

      while (currentScope && !variable) {
        variable = currentScope.variables.find((v: any) => v.name === name);
        if (!variable) {
          currentScope = currentScope.upper;
        }
      }

      if (!variable) return false;

      for (const def of variable.defs) {
        // Function declaration
        if (def.type === 'FunctionName' && def.node) {
          const fn = def.node as unknown as TSESTree.FunctionDeclaration;
          if (
            fn.returnType?.typeAnnotation &&
            fn.returnType.typeAnnotation.type ===
              (AST_NODE_TYPES.TSBooleanKeyword as any)
          ) {
            return true;
          }
        }

        // Variable with function expression or arrow function
        if (def.type === 'Variable' && def.node) {
          const varDecl = def.node as unknown as TSESTree.VariableDeclarator;
          const init = (varDecl && (varDecl as any).init) as
            | TSESTree.Expression
            | undefined;
          if (!init) continue;

          if (
            (init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              init.type === AST_NODE_TYPES.FunctionExpression) &&
            init.returnType?.typeAnnotation &&
            init.returnType.typeAnnotation.type ===
              (AST_NODE_TYPES.TSBooleanKeyword as any)
          ) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * A callee name carrying a boolean prefix is only a hint about the value it
     * produces. When the declaration is reachable, the declaration wins:
     * 'nonBoolean' means the call demonstrably yields something other than a
     * boolean, 'indeterminate' means the rule cannot tell (unresolved import,
     * parameter, opaque body) and the name heuristic stays in force.
     */
    type CalleeReturnEvaluation = 'boolean' | 'nonBoolean' | 'indeterminate';

    // Predicates that call themselves (or each other) would otherwise recurse
    // forever while their returns are classified.
    const calleesUnderEvaluation = new Set<string>();

    const NON_BOOLEAN_TYPE_KEYWORDS = new Set<string>([
      AST_NODE_TYPES.TSStringKeyword,
      AST_NODE_TYPES.TSNumberKeyword,
      AST_NODE_TYPES.TSBigIntKeyword,
      AST_NODE_TYPES.TSSymbolKeyword,
      AST_NODE_TYPES.TSObjectKeyword,
      AST_NODE_TYPES.TSVoidKeyword,
      AST_NODE_TYPES.TSNullKeyword,
      AST_NODE_TYPES.TSUndefinedKeyword,
      AST_NODE_TYPES.TSTypeLiteral,
      AST_NODE_TYPES.TSArrayType,
      AST_NODE_TYPES.TSTupleType,
      AST_NODE_TYPES.TSFunctionType,
      AST_NODE_TYPES.TSConstructorType,
      AST_NODE_TYPES.TSIntersectionType,
      AST_NODE_TYPES.TSTemplateLiteralType,
      AST_NODE_TYPES.TSMappedType,
    ]);

    const NON_BOOLEAN_EXPRESSION_TYPES = new Set<string>([
      AST_NODE_TYPES.ObjectExpression,
      AST_NODE_TYPES.ArrayExpression,
      AST_NODE_TYPES.TemplateLiteral,
      AST_NODE_TYPES.TaggedTemplateExpression,
      AST_NODE_TYPES.ArrowFunctionExpression,
      AST_NODE_TYPES.FunctionExpression,
      AST_NODE_TYPES.ClassExpression,
      AST_NODE_TYPES.NewExpression,
      AST_NODE_TYPES.UpdateExpression,
      AST_NODE_TYPES.JSXElement,
      AST_NODE_TYPES.JSXFragment,
    ]);

    // `as const` preserves the operand's shape, so the assertion says nothing
    // about booleanness and the operand must be classified instead.
    function isConstAssertion(typeNode: TSESTree.Node): boolean {
      return (
        typeNode.type === AST_NODE_TYPES.TSTypeReference &&
        typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
        typeNode.typeName.name === 'const'
      );
    }

    function classifyTypeAnnotation(
      typeNode: TSESTree.Node,
    ): CalleeReturnEvaluation {
      if (
        typeNode.type === AST_NODE_TYPES.TSBooleanKeyword ||
        typeNode.type === AST_NODE_TYPES.TSTypePredicate
      ) {
        return 'boolean';
      }

      if (typeNode.type === AST_NODE_TYPES.TSLiteralType) {
        const literal = typeNode.literal;
        return literal.type === AST_NODE_TYPES.Literal &&
          typeof literal.value === 'boolean'
          ? 'boolean'
          : 'nonBoolean';
      }

      if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
        const members = typeNode.types.map(classifyTypeAnnotation);
        if (members.every((member) => member === 'boolean')) {
          return 'boolean';
        }
        // A union that mixes boolean with anything else cannot be trusted to
        // hold a boolean; the repository prefers false negatives here.
        return members.some((member) => member === 'nonBoolean')
          ? 'nonBoolean'
          : 'indeterminate';
      }

      if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
        if (
          typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
          typeNode.typeName.name === 'Boolean'
        ) {
          return 'boolean';
        }
        // Named types (including `Promise<boolean>`, whose call site yields a
        // promise rather than a boolean) are treated as non-boolean values.
        return 'nonBoolean';
      }

      if (NON_BOOLEAN_TYPE_KEYWORDS.has(typeNode.type)) {
        return 'nonBoolean';
      }

      // `any`, `unknown`, generics, conditional and indexed-access types carry
      // no reliable syntactic verdict.
      return 'indeterminate';
    }

    function classifyReturnExpression(
      expression: TSESTree.Expression | null | undefined,
    ): CalleeReturnEvaluation {
      // A bare `return;` (or a fall-through) produces undefined.
      if (!expression) return 'nonBoolean';

      if (
        expression.type === AST_NODE_TYPES.TSAsExpression ||
        expression.type === AST_NODE_TYPES.TSSatisfiesExpression ||
        expression.type === AST_NODE_TYPES.TSTypeAssertion
      ) {
        const annotation = expression.typeAnnotation;
        if (annotation && !isConstAssertion(annotation)) {
          const classified = classifyTypeAnnotation(annotation);
          if (classified !== 'indeterminate') {
            return classified;
          }
        }
        return classifyReturnExpression(
          expression.expression as TSESTree.Expression,
        );
      }

      if (
        expression.type === AST_NODE_TYPES.ChainExpression ||
        expression.type === AST_NODE_TYPES.TSNonNullExpression
      ) {
        return classifyReturnExpression(
          expression.expression as TSESTree.Expression,
        );
      }

      if (expression.type === AST_NODE_TYPES.SequenceExpression) {
        return classifyReturnExpression(
          expression.expressions[expression.expressions.length - 1],
        );
      }

      if (NON_BOOLEAN_EXPRESSION_TYPES.has(expression.type)) {
        return 'nonBoolean';
      }

      if (expression.type === AST_NODE_TYPES.Literal) {
        return typeof expression.value === 'boolean' ? 'boolean' : 'nonBoolean';
      }

      if (
        expression.type === AST_NODE_TYPES.Identifier &&
        expression.name === 'undefined'
      ) {
        return 'nonBoolean';
      }

      if (expression.type === AST_NODE_TYPES.UnaryExpression) {
        if (expression.operator === '!' || expression.operator === 'delete') {
          return 'boolean';
        }
        return 'nonBoolean';
      }

      if (
        expression.type === AST_NODE_TYPES.BinaryExpression &&
        !BOOLEANISH_BINARY_OPERATORS.has(expression.operator)
      ) {
        return 'nonBoolean';
      }

      // Branching expressions are classified from their branches so a mix of a
      // boolean and an object (or two objects) is recognized as non-boolean.
      if (expression.type === AST_NODE_TYPES.ConditionalExpression) {
        return combineClassifications([
          classifyReturnExpression(expression.consequent),
          classifyReturnExpression(expression.alternate),
        ]);
      }

      if (expression.type === AST_NODE_TYPES.LogicalExpression) {
        return combineClassifications([
          classifyReturnExpression(expression.left),
          classifyReturnExpression(expression.right),
        ]);
      }

      const evaluation = evaluateBooleanishExpression(expression);
      if (evaluation === 'boolean') return 'boolean';
      if (evaluation === 'nonBoolean') return 'nonBoolean';
      return 'indeterminate';
    }

    function combineClassifications(
      classifications: CalleeReturnEvaluation[],
    ): CalleeReturnEvaluation {
      if (classifications.length === 0) return 'indeterminate';
      if (classifications.every((entry) => entry === 'boolean')) {
        return 'boolean';
      }
      return classifications.some((entry) => entry === 'nonBoolean')
        ? 'nonBoolean'
        : 'indeterminate';
    }

    function classifyFunctionReturn(
      functionLike: TSESTree.FunctionLike,
    ): CalleeReturnEvaluation {
      const annotation = functionLike.returnType?.typeAnnotation;
      if (annotation) {
        const classified = classifyTypeAnnotation(annotation);
        if (classified !== 'indeterminate') {
          return classified;
        }
      }

      // Calling an async or generator function hands back a promise or an
      // iterator, never the boolean produced inside the body.
      if (functionLike.async || functionLike.generator) {
        return 'nonBoolean';
      }

      if (
        functionLike.type === AST_NODE_TYPES.ArrowFunctionExpression &&
        functionLike.expression
      ) {
        return classifyReturnExpression(
          functionLike.body as TSESTree.Expression,
        );
      }

      // Overload signatures and ambient declarations expose no body to inspect.
      if (functionLike.body?.type !== AST_NODE_TYPES.BlockStatement) {
        return 'indeterminate';
      }

      const returnArguments = collectReturnArguments(functionLike.body);
      if (returnArguments.length === 0) {
        return 'nonBoolean';
      }

      return combineClassifications(
        returnArguments.map(classifyReturnExpression),
      );
    }

    function functionOfDefinition(
      definition: TSESLint.Scope.Definition,
    ): TSESTree.FunctionLike | undefined {
      if (definition.type === 'FunctionName') {
        return definition.node as unknown as TSESTree.FunctionLike;
      }

      if (definition.type === 'Variable') {
        const init = (definition.node as unknown as TSESTree.VariableDeclarator)
          .init;
        if (
          init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          init?.type === AST_NODE_TYPES.FunctionExpression
        ) {
          return init;
        }
      }

      return undefined;
    }

    /**
     * Resolve a callee identifier through the scope chain and classify the value
     * its calls produce, without a type checker.
     */
    function calleeReturnEvaluation(name: string): CalleeReturnEvaluation {
      if (calleesUnderEvaluation.has(name)) return 'indeterminate';

      const variable = findVariableInScopes(name);
      if (!variable || variable.defs.length === 0) return 'indeterminate';

      calleesUnderEvaluation.add(name);
      try {
        const classifications: CalleeReturnEvaluation[] = [];
        for (const definition of variable.defs) {
          const functionLike = functionOfDefinition(definition);
          // Imports, parameters and aliases hide the implementation, so the
          // name heuristic must keep its reach across module boundaries.
          if (!functionLike) return 'indeterminate';
          classifications.push(classifyFunctionReturn(functionLike));
        }
        return combineClassifications(classifications);
      } finally {
        calleesUnderEvaluation.delete(name);
      }
    }

    /**
     * Decide whether a call to `calleeName` yields a boolean, giving the callee's
     * resolvable declaration the final say over its name.
     */
    function calleeNameImpliesBoolean(
      calleeName: string,
      prefixes: string[],
    ): boolean {
      if (!isPrefixedByBooleanKeyword(calleeName, prefixes)) {
        return false;
      }

      return calleeReturnEvaluation(calleeName) !== 'nonBoolean';
    }

    /**
     * Check if a variable is used in a while loop condition and is likely a DOM element or tree node
     * This helps identify variables like 'parent', 'element', 'node', etc. that are used
     * in while loops for DOM/tree traversal and are not boolean values
     */
    function isLikelyDomElementInWhileLoop(node: TSESTree.Identifier): boolean {
      // Check if the variable name suggests it's a DOM element or tree node
      const isTraversalName =
        node.name.toLowerCase().includes('element') ||
        node.name.toLowerCase().includes('node') ||
        node.name.toLowerCase().includes('parent') ||
        node.name.toLowerCase().includes('child') ||
        node.name.toLowerCase().includes('sibling') ||
        node.name.toLowerCase().includes('ancestor') ||
        node.name.toLowerCase().includes('descendant');

      if (!isTraversalName) {
        return false;
      }

      // Must be used in a while loop to be considered for this exception
      if (!isUsedInWhileLoop(node)) {
        return false;
      }

      // Check if the variable is initialized with a traversal-related value
      const variableDeclarator = node.parent;
      if (
        variableDeclarator?.type === AST_NODE_TYPES.VariableDeclarator &&
        variableDeclarator.init
      ) {
        const init = variableDeclarator.init;

        // Check for logical expressions with traversal-related properties on the right side
        if (
          init.type === AST_NODE_TYPES.LogicalExpression &&
          init.operator === '&&' &&
          init.right.type === AST_NODE_TYPES.MemberExpression &&
          init.right.property.type === AST_NODE_TYPES.Identifier
        ) {
          const propertyName = (init.right.property as TSESTree.Identifier)
            .name;

          // DOM-specific properties - these are definitely DOM traversal
          const isDomProperty =
            propertyName.toLowerCase().includes('element') ||
            propertyName.toLowerCase().includes('node') ||
            propertyName === 'parentElement' ||
            propertyName === 'parentNode' ||
            propertyName === 'firstChild' ||
            propertyName === 'lastChild' ||
            propertyName === 'nextSibling' ||
            propertyName === 'previousSibling' ||
            propertyName === 'firstElementChild' ||
            propertyName === 'lastElementChild' ||
            propertyName === 'nextElementSibling' ||
            propertyName === 'previousElementSibling';

          if (isDomProperty) {
            return true;
          }

          // Tree-like properties - need additional confirmation
          const isTreeProperty =
            propertyName === 'parent' ||
            propertyName === 'child' ||
            propertyName === 'root' ||
            propertyName === 'left' ||
            propertyName === 'right' ||
            propertyName === 'next' ||
            propertyName === 'prev' ||
            propertyName === 'previous';

          if (isTreeProperty) {
            // For tree properties, check if there's a traversal pattern in the code
            return hasTreeTraversalPattern(variableDeclarator);
          }
        }

        // Check for direct member expressions (without logical operators)
        if (
          init.type === AST_NODE_TYPES.MemberExpression &&
          init.property.type === AST_NODE_TYPES.Identifier
        ) {
          const propertyName = (init.property as TSESTree.Identifier).name;

          // DOM-specific properties
          const isDomProperty =
            propertyName === 'parentElement' ||
            propertyName === 'parentNode' ||
            propertyName === 'firstChild' ||
            propertyName === 'lastChild' ||
            propertyName === 'nextSibling' ||
            propertyName === 'previousSibling';

          if (isDomProperty) {
            return true;
          }
        }

        // Check for call expressions that return DOM elements
        if (
          init.type === AST_NODE_TYPES.CallExpression &&
          init.callee.type === AST_NODE_TYPES.MemberExpression &&
          init.callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          const methodName = (init.callee.property as TSESTree.Identifier).name;

          // DOM query methods
          const isDomMethod =
            methodName === 'querySelector' ||
            methodName === 'querySelectorAll' ||
            methodName === 'getElementById' ||
            methodName === 'getElementsByClassName' ||
            methodName === 'getElementsByTagName';

          if (isDomMethod) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Traverses an AST depth-first, skipping metadata keys, and stops early when the
     * visitor returns true.
     */
    const isTraversalMetadataKey = (key: string) =>
      key === 'parent' || key === 'range' || key === 'loc';

    function traverseAst(
      node: TSESTree.Node,
      visitor: (candidate: TSESTree.Node) => boolean,
    ): boolean {
      if (visitor(node)) return true;

      for (const key in node) {
        if (isTraversalMetadataKey(key)) continue;

        const value = (node as unknown as Record<string, unknown>)[key];
        if (Array.isArray(value)) {
          for (const child of value) {
            if (
              child &&
              typeof child === 'object' &&
              (child as { type?: unknown }).type
            ) {
              if (traverseAst(child as TSESTree.Node, visitor)) {
                return true;
              }
            }
          }
        } else if (
          value &&
          typeof value === 'object' &&
          (value as { type?: unknown }).type
        ) {
          if (traverseAst(value as TSESTree.Node, visitor)) {
            return true;
          }
        }
      }

      return false;
    }

    function collectReturnArguments(
      root: TSESTree.Node,
    ): Array<TSESTree.Expression | null> {
      const results: Array<TSESTree.Expression | null> = [];

      function walk(node: TSESTree.Node) {
        if (node.type === AST_NODE_TYPES.ReturnStatement) {
          results.push(node.argument ?? null);
          return;
        }

        if (
          node !== root &&
          (node.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.type === AST_NODE_TYPES.FunctionExpression ||
            node.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          return;
        }

        for (const key in node) {
          if (isTraversalMetadataKey(key)) continue;

          const value = (node as unknown as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            for (const child of value) {
              if (
                child &&
                typeof child === 'object' &&
                (child as { type?: unknown }).type
              ) {
                walk(child as TSESTree.Node);
              }
            }
          } else if (
            value &&
            typeof value === 'object' &&
            (value as { type?: unknown }).type
          ) {
            walk(value as TSESTree.Node);
          }
        }
      }

      walk(root);
      return results;
    }

    /**
     * Check if a variable is used in a while loop condition
     * This searches the scope for while loops that use the variable in their condition
     */
    function isUsedInWhileLoop(node: TSESTree.Identifier): boolean {
      const variableName = node.name;

      // Find the function or block scope containing this variable
      let currentScope = node.parent;
      while (
        currentScope &&
        currentScope.type !== AST_NODE_TYPES.BlockStatement
      ) {
        currentScope = currentScope.parent as TSESTree.Node;
      }

      if (
        !currentScope ||
        currentScope.type !== AST_NODE_TYPES.BlockStatement
      ) {
        return false;
      }

      return traverseAst(currentScope, (searchNode) => {
        return (
          searchNode.type === AST_NODE_TYPES.WhileStatement &&
          searchNode.test.type === AST_NODE_TYPES.Identifier &&
          searchNode.test.name === variableName
        );
      });
    }

    /**
     * Check if a variable declarator has a tree traversal pattern
     * This looks for patterns like reassignment to .parent, .parentElement, etc.
     */
    function hasTreeTraversalPattern(
      declarator: TSESTree.VariableDeclarator,
    ): boolean {
      if (declarator.id.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      const variableName = declarator.id.name;

      // Find the function or block scope containing this variable
      let currentScope = declarator.parent;
      while (
        currentScope &&
        currentScope.type !== AST_NODE_TYPES.BlockStatement
      ) {
        currentScope = currentScope.parent as TSESTree.Node;
      }

      if (
        !currentScope ||
        currentScope.type !== AST_NODE_TYPES.BlockStatement
      ) {
        return false;
      }

      return traverseAst(currentScope, (node) => {
        if (
          node.type === AST_NODE_TYPES.AssignmentExpression &&
          node.left.type === AST_NODE_TYPES.Identifier &&
          node.left.name === variableName &&
          node.right.type === AST_NODE_TYPES.MemberExpression &&
          node.right.property.type === AST_NODE_TYPES.Identifier
        ) {
          const propertyName = (node.right.property as TSESTree.Identifier)
            .name;

          // Check for DOM traversal properties
          if (
            propertyName === 'parentElement' ||
            propertyName === 'parentNode' ||
            propertyName === 'nextSibling' ||
            propertyName === 'previousSibling' ||
            propertyName === 'firstChild' ||
            propertyName === 'lastChild'
          ) {
            return true;
          }

          // Check for generic tree traversal properties
          if (
            propertyName === 'parent' ||
            propertyName === 'child' ||
            propertyName === 'left' ||
            propertyName === 'right' ||
            propertyName === 'next' ||
            propertyName === 'prev' ||
            propertyName === 'previous'
          ) {
            return true;
          }
        }
        return false;
      });
    }

    /**
     * Check if a variable is initialized with a boolean-suggesting member expression
     * This helps identify variables that should be flagged as needing a boolean prefix
     */
    function isLikelyBooleanByMemberExpression(
      node: TSESTree.Identifier,
    ): boolean {
      // Check if the variable is initialized with a boolean-related value
      const variableDeclarator = node.parent;
      if (
        variableDeclarator?.type === AST_NODE_TYPES.VariableDeclarator &&
        variableDeclarator.init
      ) {
        const init = variableDeclarator.init;

        // Check for direct boolean initialization
        if (
          init.type === AST_NODE_TYPES.Literal &&
          typeof init.value === 'boolean'
        ) {
          return true;
        }

        // Check for property access with boolean-suggesting name
        if (
          init.type === AST_NODE_TYPES.MemberExpression &&
          init.property.type === AST_NODE_TYPES.Identifier
        ) {
          const propertyName = (init.property as TSESTree.Identifier).name;
          // If the property name suggests it's a boolean (starts with a boolean prefix)
          const isBooleanProperty = isPrefixedByBooleanKeyword(
            propertyName,
            approvedPrefixes,
          );

          if (isBooleanProperty) {
            return true;
          }
        }
      }

      return false;
    }

    function getterReturnsBoolean(
      node: TSESTree.MethodDefinition | TSESTree.TSAbstractMethodDefinition,
    ): boolean {
      if (node.kind !== 'get') {
        return false;
      }

      const functionLike = node.value;
      const returnAnnotation =
        functionLike?.returnType?.typeAnnotation ||
        (node as { returnType?: TSESTree.TSTypeAnnotation }).returnType
          ?.typeAnnotation;

      if (
        returnAnnotation &&
        returnAnnotation.type === (AST_NODE_TYPES.TSBooleanKeyword as any)
      ) {
        return true;
      }

      if (
        !functionLike?.body ||
        functionLike.body.type !== AST_NODE_TYPES.BlockStatement
      ) {
        return false;
      }

      const returnArguments = collectReturnArguments(functionLike.body);
      if (returnArguments.length === 0) {
        return false;
      }

      for (const argument of returnArguments) {
        const evaluation = evaluateBooleanishExpression(argument);
        if (evaluation !== 'boolean') {
          return false;
        }
      }

      return true;
    }

    /**
     * Check variable declarations for boolean naming
     */
    function checkVariableDeclaration(node: TSESTree.VariableDeclarator) {
      if (node.id.type !== AST_NODE_TYPES.Identifier) return;

      const variableName = node.id.name;

      // Skip checking if it's a type predicate
      if (isTypePredicate(node.id)) return;

      // Skip checking if it's likely a DOM element used in a while loop
      if (isLikelyDomElementInWhileLoop(node.id)) return;

      // Check if it's a boolean variable
      let isBooleanVar =
        hasBooleanTypeAnnotation(node.id) || hasInitialBooleanValue(node);

      // Check if it's a boolean variable used in a while loop or initialized with a boolean property
      if (!isBooleanVar && isLikelyBooleanByMemberExpression(node.id)) {
        isBooleanVar = true;
      }

      // Check if it's an arrow function with boolean return type
      if (
        node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression &&
        node.init.returnType?.typeAnnotation &&
        node.init.returnType.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any)
      ) {
        isBooleanVar = true;
      }

      if (isBooleanVar && !hasApprovedPrefix(variableName)) {
        context.report({
          node: node.id,
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'variable',
            name: variableName,
            capitalizedName: capitalizeFirst(variableName),
            prefixes: formatPrefixes(),
          },
        });
      }
    }

    /**
     * Check function declarations for boolean return values
     */
    function checkFunctionDeclaration(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ) {
      // Skip anonymous functions
      if (!node.id && node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
        return;
      }

      // Get function name
      let functionName = '';
      if (node.id) {
        functionName = node.id.name;
      } else if (
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        functionName = node.parent.id.name;
      } else if (
        node.parent?.type === AST_NODE_TYPES.Property &&
        node.parent.key.type === AST_NODE_TYPES.Identifier
      ) {
        functionName = node.parent.key.name;
      } else if (
        node.parent?.type === AST_NODE_TYPES.MethodDefinition &&
        node.parent.key.type === AST_NODE_TYPES.Identifier
      ) {
        functionName = node.parent.key.name;
      }

      if (!functionName) return;

      // Skip checking if it's a type predicate (these are allowed to use 'is' prefix regardless)
      if (
        node.returnType?.typeAnnotation.type === AST_NODE_TYPES.TSTypePredicate
      ) {
        return;
      }

      // Check if it returns a boolean
      if (returnsBooleanValue(node) && !hasApprovedPrefix(functionName)) {
        context.report({
          node: node.id || node,
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'function',
            name: functionName,
            capitalizedName: capitalizeFirst(functionName),
            prefixes: formatPrefixes(),
          },
        });
      }
    }

    /**
     * Check method definitions for boolean return values
     */
    function checkMethodDefinition(
      node: TSESTree.MethodDefinition | TSESTree.TSAbstractMethodDefinition,
    ) {
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      const methodName = node.key.name;
      const isGetter = node.kind === 'get';

      const returnAnnotation =
        node.value?.returnType?.typeAnnotation ||
        (node as { returnType?: TSESTree.TSTypeAnnotation }).returnType
          ?.typeAnnotation;

      if (
        ignoreOverriddenGetters &&
        isGetter &&
        ((node as { override?: boolean }).override ||
          (node as { abstract?: boolean }).abstract ||
          !node.value?.body ||
          node.type === AST_NODE_TYPES.TSAbstractMethodDefinition)
      ) {
        return;
      }

      // Skip checking if it's a type predicate
      if (
        returnAnnotation &&
        returnAnnotation.type === (AST_NODE_TYPES.TSTypePredicate as any)
      ) {
        return;
      }

      const returnsBoolean =
        (returnAnnotation &&
          returnAnnotation.type === (AST_NODE_TYPES.TSBooleanKeyword as any)) ||
        (isGetter && getterReturnsBoolean(node));

      if (returnsBoolean && !hasApprovedPrefix(methodName)) {
        context.report({
          node: node.key,
          messageId: 'missingBooleanPrefix',
          data: {
            type: isGetter ? 'getter' : 'method',
            name: methodName,
            capitalizedName: capitalizeFirst(methodName),
            prefixes: formatPrefixes(),
          },
        });
      }
    }

    /**
     * Check class property definitions for boolean values
     */
    function checkClassProperty(node: any) {
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      const propertyName = node.key.name;

      // Check if it's a boolean property
      let isBooleanProperty = false;

      // Check if it has a boolean type annotation
      if (
        node.typeAnnotation?.typeAnnotation &&
        node.typeAnnotation.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any)
      ) {
        isBooleanProperty = true;
      }

      // Check if it's initialized with a boolean value
      if (
        node.value?.type === AST_NODE_TYPES.Literal &&
        typeof node.value.value === 'boolean'
      ) {
        isBooleanProperty = true;
      }

      if (isBooleanProperty && !hasApprovedPrefix(propertyName)) {
        context.report({
          node: node.key,
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'property',
            name: propertyName,
            capitalizedName: capitalizeFirst(propertyName),
            prefixes: formatPrefixes(),
          },
        });
      }
    }

    /**
     * Check class property declarations for boolean values
     */
    function checkClassPropertyDeclaration(node: any) {
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      const propertyName = node.key.name;

      // Check if it's a boolean property
      let isBooleanProperty = false;

      // Check if it has a boolean type annotation
      if (
        node.typeAnnotation?.typeAnnotation &&
        node.typeAnnotation.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any)
      ) {
        isBooleanProperty = true;
      }

      // Check if it's initialized with a boolean value
      if (
        node.value?.type === AST_NODE_TYPES.Literal &&
        typeof node.value.value === 'boolean'
      ) {
        isBooleanProperty = true;
      }

      if (isBooleanProperty && !hasApprovedPrefix(propertyName)) {
        context.report({
          node: node.key,
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'property',
            name: propertyName,
            capitalizedName: capitalizeFirst(propertyName),
            prefixes: formatPrefixes(),
          },
        });
      }
    }

    /**
     * Check property signatures in interfaces/types for boolean types
     */
    function checkPropertySignature(node: TSESTree.TSPropertySignature) {
      // Interface/type-alias property names are commonly imposed by contracts the
      // author cannot rename (external APIs, data-model schemas), so they are only
      // enforced when explicitly opted in.
      if (!enforceForPropertySignatures) return;

      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      const propertyName = node.key.name;

      // Check if it has a boolean type
      if (
        node.typeAnnotation?.typeAnnotation &&
        node.typeAnnotation.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any) &&
        !hasApprovedPrefix(propertyName)
      ) {
        // Skip if this property is part of a parameter's type annotation
        // Check if this property signature is inside a parameter's type annotation
        let isInParameterType = false;
        let parent = node.parent;

        while (parent) {
          if (parent.type === AST_NODE_TYPES.TSTypeLiteral) {
            const grandParent = parent.parent;
            if (
              grandParent?.type === AST_NODE_TYPES.TSTypeAnnotation &&
              grandParent.parent?.type === AST_NODE_TYPES.Identifier &&
              grandParent.parent.parent?.type ===
                AST_NODE_TYPES.FunctionDeclaration
            ) {
              isInParameterType = true;
              break;
            }
          }
          parent = parent.parent as TSESTree.Node;
        }

        // Only report if not in a parameter type annotation
        if (!isInParameterType) {
          context.report({
            node: node.key,
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: propertyName,
              capitalizedName: capitalizeFirst(propertyName),
              prefixes: formatPrefixes(),
            },
          });
        }
      }
    }

    /**
     * Check parameters for boolean types
     */
    function checkParameter(node: TSESTree.Parameter) {
      if (node.type !== AST_NODE_TYPES.Identifier) return;

      const paramName = node.name;

      // Check if it has a boolean type annotation
      if (
        node.typeAnnotation?.typeAnnotation &&
        node.typeAnnotation.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any) &&
        !hasApprovedPrefix(paramName)
      ) {
        context.report({
          node,
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'parameter',
            name: paramName,
            capitalizedName: capitalizeFirst(paramName),
            prefixes: formatPrefixes(),
          },
        });
      }

      // Check if the parameter has an object type with boolean properties
      if (
        node.typeAnnotation?.typeAnnotation &&
        node.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeLiteral
      ) {
        const typeLiteral = node.typeAnnotation.typeAnnotation;

        // Check each member of the type literal
        for (const member of typeLiteral.members) {
          if (
            member.type === AST_NODE_TYPES.TSPropertySignature &&
            member.key.type === AST_NODE_TYPES.Identifier &&
            member.typeAnnotation?.typeAnnotation.type ===
              AST_NODE_TYPES.TSBooleanKeyword
          ) {
            const propertyName = member.key.name;

            if (!hasApprovedPrefix(propertyName)) {
              context.report({
                node: member.key,
                messageId: 'missingBooleanPrefix',
                data: {
                  type: 'property',
                  name: propertyName,
                  capitalizedName: capitalizeFirst(propertyName),
                  prefixes: formatPrefixes(),
                },
              });
            }
          }
        }
      }
    }

    return {
      VariableDeclarator: checkVariableDeclaration,
      FunctionDeclaration: checkFunctionDeclaration,
      FunctionExpression(node: TSESTree.FunctionExpression) {
        if (node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
          checkFunctionDeclaration(node);
        }
      },
      ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
        if (node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
          checkFunctionDeclaration(node);
        }
      },
      MethodDefinition: checkMethodDefinition,
      TSAbstractMethodDefinition: checkMethodDefinition,
      ClassProperty: checkClassProperty,
      PropertyDefinition: checkClassPropertyDeclaration, // For TypeScript class properties
      TSPropertySignature: checkPropertySignature,
      Identifier(node: TSESTree.Identifier) {
        // Check parameter names in function declarations
        if (
          node.parent &&
          (node.parent.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.parent.type === AST_NODE_TYPES.FunctionExpression ||
            node.parent.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
          node.parent.params.includes(node)
        ) {
          checkParameter(node);
        }
      },
    };
  },
});
