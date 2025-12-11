import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
export const ARRAY_METHODS = [
  'map',
  'filter',
  'forEach',
  'reduce',
  'some',
  'every',
];

export const arrayMethodsThisContext: TSESLint.RuleModule<
  'preferArrow' | 'unexpected',
  never[]
> = createRule({
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      CallExpression(node: TSESTree.CallExpression) {
        // Array method called with a class method reference
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          ARRAY_METHODS.includes(node.callee.property.name) &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'MemberExpression' &&
          node.arguments[0].object.type === 'ThisExpression'
        ) {
          const methodProperty = node.arguments[0].property;
          const methodAccessor = node.arguments[0].computed
            ? `[${sourceCode.getText(methodProperty)}]`
            : methodProperty.type === 'Identifier'
              ? `.${methodProperty.name}`
              : methodProperty.type === 'PrivateIdentifier'
                ? `.#${methodProperty.name}`
                : `.${sourceCode.getText(methodProperty)}`;

          const methodReference = `this${methodAccessor}`;

          context.report({
            node: node.arguments[0],
            messageId: 'unexpected',
            data: {
              arrayMethod: node.callee.property.name,
              methodAccessor,
              methodReference,
            },
          });
        }

        // Function expression bound to `this` in array method
        else if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          ARRAY_METHODS.includes(node.callee.property.name) &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'CallExpression' &&
          node.arguments[0].callee.type === 'MemberExpression' &&
          node.arguments[0].callee.object.type === 'FunctionExpression' &&
          node.arguments[0].callee.property.type === 'Identifier' &&
          node.arguments[0].callee.property.name === 'bind' &&
          node.arguments[0].arguments.length > 0 &&
          node.arguments[0].arguments[0].type === 'ThisExpression'
        ) {
          context.report({
            node: node.arguments[0],
            messageId: 'preferArrow',
            data: {
              arrayMethod: node.callee.property.name,
            },
          });
        }
      },
    };
  },

  name: 'array-methods-this-context',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent misuse of Array methods in OOP',
      recommended: 'error',
    },
    schema: [],
    messages: {
      unexpected:
        'Array method "{{arrayMethod}}" receives the class method reference {{methodReference}}, which strips its "this" binding when the callback runs. Use an arrow callback so the class instance remains available, e.g. {{arrayMethod}}((item) => this{{methodAccessor}}(item)).',
      preferArrow:
        'Array method "{{arrayMethod}}" binds a callback with ".bind(this)", which allocates a new function and hides that the code depends on the class instance. Prefer an arrow callback that captures "this" without rebinding, e.g. {{arrayMethod}}((item) => this.handleItem(item)).',
    },
  },
  defaultOptions: [],
});
