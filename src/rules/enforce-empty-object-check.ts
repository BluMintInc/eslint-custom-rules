import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'missingEmptyObjectCheck';
type Options = [
  {
    objectSuffixes?: string[];
    ignoreInLoops?: boolean;
    ignorePerformanceSensitive?: boolean;
  },
];

// Default object-like naming suffixes
const DEFAULT_OBJECT_SUFFIXES = [
  'Config',
  'Data',
  'Info',
  'Settings',
  'Options',
  'Props',
  'State',
  'Params',
  'Meta',
  'Attributes',
  'Details',
  'Spec',
  'Schema',
  'Model',
  'Entity',
  'Record',
  'Document',
  'Item',
  'Object',
  'Map',
  'Dict',
  'Cache',
  'Store',
  'Context',
  'Payload',
  'Response',
  'Request',
];

export const enforceEmptyObjectCheck = createRule<Options, MessageIds>({
  name: 'enforce-empty-object-check',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce checking for both undefined/falsy objects AND empty objects when performing object existence validation',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          objectSuffixes: {
            type: 'array',
            items: {
              type: 'string',
            },
            default: DEFAULT_OBJECT_SUFFIXES,
          },
          ignoreInLoops: {
            type: 'boolean',
            default: true,
          },
          ignorePerformanceSensitive: {
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingEmptyObjectCheck:
        'Object existence check should also verify the object is not empty. Consider using `!{{name}} || Object.keys({{name}}).length === 0` instead of `!{{name}}`.',
    },
  },
  defaultOptions: [
    {
      objectSuffixes: DEFAULT_OBJECT_SUFFIXES,
      ignoreInLoops: true,
      ignorePerformanceSensitive: true,
    },
  ],
  create(context, [options]) {
    const objectSuffixes = options.objectSuffixes || DEFAULT_OBJECT_SUFFIXES;
    const ignoreInLoops = options.ignoreInLoops ?? true;
    const ignorePerformanceSensitive =
      options.ignorePerformanceSensitive ?? true;

    /**
     * Check if a variable name suggests it's an object
     */
    function isObjectLikeName(name: string): boolean {
      // Check for object-like suffixes (case-insensitive)
      const hasObjectSuffix = objectSuffixes.some((suffix) =>
        name.toLowerCase().endsWith(suffix.toLowerCase()),
      );

      if (hasObjectSuffix) return true;

      // Check for camelCase names that suggest objects
      const objectLikePatterns = [
        /^user[A-Z]/, // userConfig, userData, etc.
        /^api[A-Z]/, // apiResponse, apiConfig, etc.
        /^app[A-Z]/, // appSettings, appState, etc.
        /^form[A-Z]/, // formData, formState, etc.
        /^page[A-Z]/, // pageData, pageInfo, etc.
        /^component[A-Z]/, // componentProps, componentState, etc.
        /^route[A-Z]/, // routeParams, routeData, etc.
        /^session[A-Z]/, // sessionData, sessionInfo, etc.
        /^auth[A-Z]/, // authConfig, authData, etc.
        /^theme[A-Z]/, // themeConfig, themeData, etc.
        /^style[A-Z]/, // styleConfig, styleData, etc.
      ];

      return objectLikePatterns.some((pattern) => pattern.test(name));
    }

    /**
     * Check if a variable name suggests it's NOT an object
     */
    function isNonObjectLikeName(name: string): boolean {
      // Common non-object prefixes/patterns
      const nonObjectPatterns = [
        /^is[A-Z]/, // isEnabled, isValid, etc. (booleans)
        /^has[A-Z]/, // hasAccess, hasData, etc. (booleans)
        /^can[A-Z]/, // canEdit, canAccess, etc. (booleans)
        /^should[A-Z]/, // shouldUpdate, shouldRender, etc. (booleans)
        /^will[A-Z]/, // willUpdate, willRender, etc. (booleans)
        /^count$/i, // count (number)
        /^index$/i, // index (number)
        /^length$/i, // length (number)
        /^size$/i, // size (number)
        /^total$/i, // total (number)
        /^amount$/i, // amount (number)
        /^value$/i, // value (could be primitive)
        /^result$/i, // result (could be primitive)
        /^status$/i, // status (usually string/enum)
        /^type$/i, // type (usually string/enum)
        /^id$/i, // id (usually string/number)
        /^key$/i, // key (usually string)
        /^name$/i, // name (usually string)
        /^title$/i, // title (usually string)
        /^message$/i, // message (usually string)
        /^error$/i, // error (could be Error object, but often string)
        /^callback$/i, // callback (function)
        /^handler$/i, // handler (function)
        /^listener$/i, // listener (function)
        /^fn$/i, // fn (function)
        /^func$/i, // func (function)
        /^items?$/i, // items, item (arrays) - but only if the whole name is just "items" or "item"
        /List$/, // list (array)
        /Array$/, // array (array)
      ];

      return nonObjectPatterns.some((pattern) => pattern.test(name));
    }

    /**
     * Check if we're in a performance-sensitive context
     */
    function isInPerformanceSensitiveContext(node: TSESTree.Node): boolean {
      if (!ignorePerformanceSensitive) return false;

      let current: TSESTree.Node | undefined = node;
      while (current) {
        // Check if we're inside a loop
        if (
          current.type === AST_NODE_TYPES.ForStatement ||
          current.type === AST_NODE_TYPES.ForInStatement ||
          current.type === AST_NODE_TYPES.ForOfStatement ||
          current.type === AST_NODE_TYPES.WhileStatement ||
          current.type === AST_NODE_TYPES.DoWhileStatement
        ) {
          return ignoreInLoops;
        }

        // Check if we're inside array methods that might be called frequently
        if (
          current.type === AST_NODE_TYPES.CallExpression &&
          current.callee.type === AST_NODE_TYPES.MemberExpression &&
          current.callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          const methodName = current.callee.property.name;
          if (
            ['map', 'filter', 'forEach', 'find', 'some', 'every'].includes(
              methodName,
            )
          ) {
            return true;
          }
        }

        current = current.parent as TSESTree.Node;
      }

      return false;
    }

    /**
     * Check if the condition already includes empty object check
     */
    function alreadyHasEmptyObjectCheck(node: TSESTree.Node): boolean {
      // Look for patterns like:
      // !obj || Object.keys(obj).length === 0
      // !obj || isEmpty(obj)
      // obj && Object.keys(obj).length > 0

      let current: TSESTree.Node | undefined = node.parent;
      while (current) {
        if (current.type === AST_NODE_TYPES.LogicalExpression) {
          const { right, operator } = current;

          // Check for !obj || Object.keys(obj).length === 0 pattern
          if (operator === '||') {
            // Check if right side has Object.keys check
            if (hasObjectKeysLengthCheck(right)) {
              return true;
            }
          }

          // Check for obj && Object.keys(obj).length > 0 pattern
          if (operator === '&&') {
            if (hasObjectKeysLengthCheck(right)) {
              return true;
            }
          }
        }

        current = current.parent as TSESTree.Node;
      }

      return false;
    }

    /**
     * Check if a node contains Object.keys().length check
     */
    function hasObjectKeysLengthCheck(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.BinaryExpression) {
        const { left, operator } = node;

        if (['===', '!==', '>', '<', '>=', '<='].includes(operator)) {
          return hasObjectKeysCall(left);
        }
      }

      return false;
    }

    /**
     * Check if a node is an Object.keys().length call
     */
    function hasObjectKeysCall(node: TSESTree.Node): boolean {
      if (
        node.type === AST_NODE_TYPES.MemberExpression &&
        node.property.type === AST_NODE_TYPES.Identifier &&
        node.property.name === 'length' &&
        node.object.type === AST_NODE_TYPES.CallExpression &&
        node.object.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.object.callee.object.type === AST_NODE_TYPES.Identifier &&
        node.object.callee.object.name === 'Object' &&
        node.object.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.object.callee.property.name === 'keys'
      ) {
        return true;
      }

      return false;
    }

    /**
     * Check if this is a default value assignment pattern
     */
    function isDefaultValuePattern(node: TSESTree.UnaryExpression): boolean {
      const parent = node.parent;

      // Check for patterns like: const x = !obj ? defaultValue : obj
      if (
        parent?.type === AST_NODE_TYPES.ConditionalExpression &&
        parent.test === node
      ) {
        return true;
      }

      // Check for patterns like: !obj && doSomething() (but not in if conditions)
      if (
        parent?.type === AST_NODE_TYPES.LogicalExpression &&
        parent.operator === '&&' &&
        parent.left === node
      ) {
        // Don't treat as default value pattern if it's in an if statement condition
        const grandParent = parent.parent;
        if (
          grandParent?.type === AST_NODE_TYPES.IfStatement &&
          grandParent.test === parent
        ) {
          return false;
        }
        return true;
      }

      // Check for patterns like: !obj || defaultValue
      if (
        parent?.type === AST_NODE_TYPES.LogicalExpression &&
        parent.operator === '||' &&
        parent.left === node
      ) {
        return true;
      }

      return false;
    }

    /**
     * Get the variable name from a unary expression
     */
    function getVariableName(node: TSESTree.UnaryExpression): string | null {
      if (node.argument.type === AST_NODE_TYPES.Identifier) {
        return node.argument.name;
      }

      // Handle member expressions like !user.config
      if (node.argument.type === AST_NODE_TYPES.MemberExpression) {
        const property = node.argument.property;
        if (property.type === AST_NODE_TYPES.Identifier) {
          return property.name;
        }
      }

      return null;
    }

    /**
     * Get the full expression text for the argument
     */
    function getArgumentText(node: TSESTree.UnaryExpression): string {
      const sourceCode = context.getSourceCode();
      return sourceCode.getText(node.argument);
    }

    return {
      UnaryExpression(node: TSESTree.UnaryExpression) {
        // Only handle negation operator
        if (node.operator !== '!') return;

        // Skip if we're in a performance-sensitive context
        if (isInPerformanceSensitiveContext(node)) return;

        // Skip if this is a default value pattern
        if (isDefaultValuePattern(node)) return;

        // Skip if already has empty object check
        if (alreadyHasEmptyObjectCheck(node)) return;

        // Get variable name to check if it's object-like
        const variableName = getVariableName(node);
        if (!variableName) return;

        // Skip if the variable name suggests it's not an object
        if (isNonObjectLikeName(variableName)) return;

        // Only proceed if the variable name suggests it's an object
        if (!isObjectLikeName(variableName)) return;

        const argumentText = getArgumentText(node);

        context.report({
          node,
          messageId: 'missingEmptyObjectCheck',
          data: {
            name: argumentText,
          },
          fix(fixer) {
            const replacement = `!${argumentText} || Object.keys(${argumentText}).length === 0`;

            // Check if we need to wrap in parentheses due to operator precedence
            const parent = node.parent;
            const needsParentheses =
              parent?.type === AST_NODE_TYPES.LogicalExpression &&
              parent.operator === '&&' &&
              parent.left === node;

            return fixer.replaceText(
              node,
              needsParentheses ? `(${replacement})` : replacement,
            );
          },
        });
      },
    };
  },
});
