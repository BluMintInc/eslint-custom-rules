/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
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
        'Callback prop "{{propName}}" is a function but does not use the "on" prefix. The "on" prefix marks event-style props so readers know they must pass a callback instead of data or a component. Rename it to "{{suggestedName}}" (and update the prop definition) so call sites make the callback contract explicit.',
      callbackFunctionPrefix:
        'Callback function "{{functionName}}" uses the generic "handle" prefix, which hides the action being performed and makes call sites read like plumbing instead of behavior. Use a verb phrase such as "{{suggestedName}}" to describe the side effect so handlers are self-documenting and easy to scan.',
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
          return (
            typeText.includes('JSX.Element') ||
            typeText.includes('ReactElement')
          );
        }

        // Check for class/interface component patterns
        if (
          ts.isClassDeclaration(declaration) ||
          ts.isInterfaceDeclaration(declaration)
        ) {
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
      const isComponentType =
        typeString.includes('JSX.Element') ||
        typeString.includes('ReactElement') ||
        typeString.includes('Component') ||
        typeString.includes('FC');

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

    function getHandleSuggestedName(functionName: string): string {
      const base = functionName.slice(6);
      if (!base || functionName === 'handler' || functionName === 'handlers') {
        return 'describeAction';
      }
      return base.charAt(0).toLowerCase() + base.slice(1);
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

          // Skip common non-callback props
          const commonNonCallbackProps = new Set([
            'theme', // MUI ThemeProvider theme prop
            'style', // React style prop
            'className', // React className prop
            'ref', // React ref prop
            'key', // React key prop
            'component', // MUI component prop
            'as', // Styled-components/Emotion as prop
            'sx', // MUI sx prop
            'css', // Emotion css prop
          ]);
          if (propName && commonNonCallbackProps.has(propName)) {
            return;
          }

          // Skip props on components that commonly use function props that aren't callbacks
          const parentName = (node.parent as TSESTree.JSXOpeningElement)?.name;
          const componentName =
            parentName?.type === 'JSXIdentifier' ? parentName.name : undefined;
          const componentsWithFunctionProps = new Set([
            'ThemeProvider', // MUI ThemeProvider
            'Transition', // React Transition Group
            'CSSTransition', // React Transition Group
            'TransitionGroup', // React Transition Group
            'SwitchTransition', // React Transition Group
          ]);
          if (componentName && componentsWithFunctionProps.has(componentName)) {
            return;
          }

          // Check if the value is a function type and not a React component
          if (
            isFunctionType(node.value.expression) &&
            propName &&
            !propName.startsWith('on') &&
            !isReactComponentType(node.value.expression)
          ) {
            const eventName =
              propName.charAt(0).toUpperCase() + propName.slice(1);
            const suggestedName = `on${eventName}`;
            context.report({
              node,
              messageId: 'callbackPropPrefix',
              data: {
                propName,
                suggestedName,
              },
              fix(fixer) {
                return fixer.replaceText(node.name, suggestedName);
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
          // Skip autofixing for "handler" and "handlers"
          if (functionName === 'handler' || functionName === 'handlers') {
            context.report({
              node,
              messageId: 'callbackFunctionPrefix',
              data: {
                functionName,
                suggestedName: getHandleSuggestedName(functionName),
              },
            });
            return;
          }

          // Skip autofixing for class parameters and getters
          const parent = node.parent;
          if (
            parent?.type === AST_NODE_TYPES.PropertyDefinition ||
            parent?.type === AST_NODE_TYPES.MethodDefinition
          ) {
            context.report({
              node,
              messageId: 'callbackFunctionPrefix',
              data: {
                functionName,
                suggestedName: getHandleSuggestedName(functionName),
              },
            });
            return;
          }

          // Get all references to this variable
          const scope = context.getScope();
          const variable = scope.variables.find((v) => v.name === functionName);
          const references = new Set(variable?.references ?? []);

          // Get references from all scopes
          const allScopes = [scope];
          let currentScope = scope;
          while (currentScope.upper) {
            currentScope = currentScope.upper;
            allScopes.push(currentScope);
          }

          // Get references from all scopes and their children
          for (const s of allScopes) {
            // Get references from current scope
            const currentVar = s.variables.find((v) => v.name === functionName);
            if (currentVar) {
              currentVar.references.forEach((ref) => references.add(ref));
            }

            // Get references from child scopes
            const childScopes = s.childScopes;
            for (const childScope of childScopes) {
              const childVar = childScope.variables.find(
                (v) => v.name === functionName,
              );
              if (childVar) {
                childVar.references.forEach((ref) => references.add(ref));
              }
            }
          }

          // Get references from sibling scopes
          const siblingScopes = scope.upper?.childScopes ?? [];
          for (const siblingScope of siblingScopes) {
            if (siblingScope !== scope) {
              const siblingVar = siblingScope.variables.find(
                (v) => v.name === functionName,
              );
              if (siblingVar) {
                siblingVar.references.forEach((ref) => references.add(ref));
              }
            }
          }

          // Get references from global scope
          const sourceCode = context.getSourceCode();
          if (sourceCode.scopeManager?.globalScope) {
            const globalVar =
              sourceCode.scopeManager.globalScope.variables.find(
                (v) => v.name === functionName,
              );
            if (globalVar) {
              globalVar.references.forEach((ref) => references.add(ref));
            }
          }

          context.report({
            node,
            messageId: 'callbackFunctionPrefix',
            data: {
              functionName,
              suggestedName: getHandleSuggestedName(functionName),
            },
            fix(fixer) {
              const newName = getHandleSuggestedName(functionName);

              // Fix the declaration and all references
              const fixes: Array<
                import('@typescript-eslint/utils').TSESLint.RuleFix
              > = [];
              fixes.push(fixer.replaceText(node.id!, newName));
              for (const ref of references) {
                if (ref.identifier !== node.id) {
                  fixes.push(fixer.replaceText(ref.identifier, newName));
                }
              }
              return fixes;
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

          // Skip autofixing for "handler" and "handlers"
          if (name === 'handler' || name === 'handlers') {
            context.report({
              node: node.key,
              messageId: 'callbackFunctionPrefix',
              data: {
                functionName: name,
                suggestedName: getHandleSuggestedName(name),
              },
            });
            return;
          }

          // Skip autofixing for class parameters and getters
          if (node.type === 'MethodDefinition' && node.kind === 'get') {
            context.report({
              node: node.key,
              messageId: 'callbackFunctionPrefix',
              data: {
                functionName: name,
                suggestedName: getHandleSuggestedName(name),
              },
            });
            return;
          }

          context.report({
            node: node.key,
            messageId: 'callbackFunctionPrefix',
            data: {
              functionName: name,
              suggestedName: getHandleSuggestedName(name),
            },
            fix(fixer) {
              const newName = getHandleSuggestedName(name);
              return fixer.replaceText(node.key, newName);
            },
          });
        }
      },

      // Check constructor parameters
      TSParameterProperty(node: TSESTree.TSParameterProperty) {
        if (
          node.parameter.type === 'Identifier' &&
          node.parameter.name.startsWith('handle')
        ) {
          context.report({
            node,
            messageId: 'callbackFunctionPrefix',
            data: {
              functionName: node.parameter.name,
              suggestedName: getHandleSuggestedName(node.parameter.name),
            },
          });
        }
      },
    };
  },
});
