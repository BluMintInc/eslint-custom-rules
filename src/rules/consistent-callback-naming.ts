import { createRule } from '../utils/createRule';
import { TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';

// Temp

export = createRule<[], 'callbackPropPrefix' | 'callbackFunctionPrefix'>({
  name: 'consistent-callback-naming',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce consistent naming conventions for callback props and functions',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      callbackPropPrefix:
        'Callback props (function type props) must be prefixed with "on" (e.g., onClick, onChange)',
      callbackFunctionPrefix:
        'Callback functions should not use "handle" prefix, use descriptive verb phrases instead',
    },
  },
  defaultOptions: [],
  create(context) {
    const parserServices = context.parserServices;

    // Check if we have access to TypeScript services
    if (!parserServices?.program || !parserServices?.esTreeNodeToTSNodeMap) {
      throw new Error(
        'You have to enable the `project` setting in parser options to use this rule',
      );
    }

    const checker = parserServices.program.getTypeChecker();

    function isReactComponentType(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);
      const symbol = type.getSymbol();

      if (!symbol) return false;

      // Check if type is a React component type
      const isComponent = symbol.declarations?.some((decl) => {
        const declaration = decl as
          | ts.ClassDeclaration
          | ts.InterfaceDeclaration
          | ts.TypeAliasDeclaration
          | ts.FunctionDeclaration;

        // Check for JSX element types
        if (ts.isTypeAliasDeclaration(declaration)) {
          const typeText = declaration.type.getText();
          return typeText.includes('JSX.Element') || typeText.includes('ReactElement');
        }

        // Check for class/interface component patterns
        if (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) {
          const name = declaration.name?.text ?? '';
          return (
            name.includes('Component') ||
            name.includes('Element') ||
            name.includes('FC') ||
            name.includes('FunctionComponent')
          );
        }

        return false;
      });

      // Check if the type itself is a component or element type
      const typeString = checker.typeToString(type);
      const isComponentType = (
        typeString.includes('JSX.Element') ||
        typeString.includes('ReactElement') ||
        typeString.includes('Component') ||
        typeString.includes('FC')
      );

      return isComponent || isComponentType;
    }

    function isPascalCase(str: string): boolean {
      return /^[A-Z][a-zA-Z0-9]*$/.test(str);
    }

    function isFunctionType(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);

      return type.getCallSignatures().length > 0;
    }

    return {
      // Check JSX attributes for callback props
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (
          node.value?.type === 'JSXExpressionContainer' &&
          node.value.expression.type === 'Identifier'
        ) {
          const propName =
            node.name.type === 'JSXIdentifier' ? node.name.name : undefined;

          // Skip React's built-in event handlers
          if (propName?.match(/^on[A-Z]/)) {
            return;
          }

          // Skip PascalCase props as they typically represent components or component-related props
          if (propName && isPascalCase(propName)) {
            return;
          }

          // Check if the value is a function type and not a React component
          if (
            isFunctionType(node.value.expression) &&
            propName &&
            !propName.startsWith('on') &&
            !isReactComponentType(node.value.expression)
          ) {
            context.report({
              node,
              messageId: 'callbackPropPrefix',
              fix(fixer) {
                // Convert camelCase to PascalCase for the event name
                const eventName =
                  propName.charAt(0).toUpperCase() + propName.slice(1);
                return fixer.replaceText(node.name, `on${eventName}`);
              },
            });
          }
        }
      },

      // Check function declarations and variable declarations for callback functions
      'FunctionDeclaration, VariableDeclarator'(
        node: TSESTree.FunctionDeclaration | TSESTree.VariableDeclarator,
      ) {
        const functionName =
          node.id?.type === 'Identifier' ? node.id.name : undefined;

        if (functionName && functionName.startsWith('handle') && node.id) {
          context.report({
            node,
            messageId: 'callbackFunctionPrefix',
            fix(fixer) {
              // Remove 'handle' prefix and convert first character to lowercase
              const newName =
                functionName.slice(6).charAt(0).toLowerCase() +
                functionName.slice(7);
              return fixer.replaceText(node.id!, newName);
            },
          });
        }
      },

      // Check class methods and object methods
      'MethodDefinition, Property'(
        node: TSESTree.MethodDefinition | TSESTree.Property,
      ) {
        if (
          node.key.type === 'Identifier' &&
          node.key.name &&
          node.key.name.startsWith('handle')
        ) {
          const name = node.key.name;
          context.report({
            node: node.key,
            messageId: 'callbackFunctionPrefix',
            fix(fixer) {
              // Remove 'handle' prefix and convert first character to lowercase
              const newName =
                name.slice(6).charAt(0).toLowerCase() + name.slice(7);
              return fixer.replaceText(node.key, newName);
            },
          });
        }
      },
    };
  },
});
