import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { TypeFlags } from 'typescript';

type MessageIds = 'missingBooleanPrefix' | 'negatedBooleanName';
type Options = [
  {
    prefixes?: string[];
    exemptFrameworkSpecific?: boolean;
    exemptObjectLiterals?: boolean;
    exemptGetters?: boolean;
    frameworkPrefixes?: string[];
  }
];

// Default approved boolean prefixes
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
];

// Common framework-specific boolean property names that don't follow the prefix convention
const DEFAULT_FRAMEWORK_PREFIXES = [
  'disabled',
  'enabled',
  'checked',
  'selected',
  'active',
  'visible',
  'hidden',
  'loading',
  'required',
  'optional',
  'readonly',
  'async',
  'multiple',
  'open',
  'closed',
];

export const enforceBooleanNamingPrefixes = createRule<Options, MessageIds>({
  name: 'enforce-boolean-naming-prefixes',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce consistent naming conventions for boolean values',
      recommended: 'error',
      requiresTypeChecking: true,
    },
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
          exemptFrameworkSpecific: {
            type: 'boolean',
          },
          exemptObjectLiterals: {
            type: 'boolean',
          },
          exemptGetters: {
            type: 'boolean',
          },
          frameworkPrefixes: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingBooleanPrefix:
        'Boolean {{type}} "{{name}}" should start with an approved prefix: {{prefixes}}',
      negatedBooleanName:
        'Avoid negated boolean names like "{{name}}". Consider using a positive form with logical negation instead.',
    },
  },
  defaultOptions: [{
    prefixes: DEFAULT_BOOLEAN_PREFIXES,
    exemptFrameworkSpecific: false,
    exemptObjectLiterals: false,
    exemptGetters: false,
    frameworkPrefixes: DEFAULT_FRAMEWORK_PREFIXES
  }],
  create(context, [options]) {
    const booleanPrefixes = options.prefixes || DEFAULT_BOOLEAN_PREFIXES;
    const frameworkPrefixes = options.frameworkPrefixes || DEFAULT_FRAMEWORK_PREFIXES;
    const exemptFrameworkSpecific = options.exemptFrameworkSpecific === true;
    const exemptObjectLiterals = options.exemptObjectLiterals === true;
    const exemptGetters = options.exemptGetters === true;

    // Get the filename from the context
    const filename = context.getFilename();

    // Skip checking for files that should be ignored
    if (
      (!filename.endsWith('.ts') && !filename.endsWith('.tsx')) ||
      filename.split('/').pop()?.startsWith('.') ||
      filename.includes('.config') ||
      filename.includes('rc.') ||
      filename.endsWith('rc')
    ) {
      // Return empty object to skip all checks for this file
      return {};
    }

    // Track imported identifiers to skip them
    const importedIdentifiers = new Set<string>();

    // Check if this is a test file
    const isTestFile = filename.includes('.test.') || filename.includes('/tests/');

    // Skip checking for object literals in test files
    // This is to handle test cases with external API patterns
    const skipObjectLiteralsInTests = isTestFile || exemptObjectLiterals;

    /**
     * Check if a name starts with an approved boolean prefix
     */
    function hasApprovedPrefix(name: string): boolean {
      return booleanPrefixes.some(prefix =>
        name.toLowerCase().startsWith(prefix.toLowerCase())
      );
    }

    /**
     * Check if a name is a framework-specific boolean name that should be exempted
     */
    function isFrameworkSpecificName(name: string): boolean {
      if (!exemptFrameworkSpecific) return false;

      return frameworkPrefixes.some(prefix =>
        name.toLowerCase() === prefix.toLowerCase() ||
        name.toLowerCase().endsWith(prefix.toLowerCase())
      );
    }

    /**
     * Check if a name has a negation prefix like "not" or "no"
     */
    function hasNegationPrefix(name: string): boolean {
      const lowerName = name.toLowerCase();
      return lowerName.startsWith('not') ||
             lowerName.startsWith('no') ||
             lowerName.includes('not');
    }

    /**
     * Format the list of prefixes for the error message
     */
    function formatPrefixes(): string {
      return booleanPrefixes.join(', ');
    }

    /**
     * Check if a node is a boolean type
     */
    function isBooleanType(node: TSESTree.Node): boolean {
      // Check for explicit boolean type annotation
      if (
        node.type === AST_NODE_TYPES.TSTypeAnnotation &&
        node.typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword
      ) {
        return true;
      }

      // Check for boolean literal initialization
      if (
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.init?.type === AST_NODE_TYPES.Literal &&
        typeof node.parent.init.value === 'boolean'
      ) {
        return true;
      }

      // Check for boolean expressions
      if (
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.init?.type === AST_NODE_TYPES.BinaryExpression &&
        ['===', '!==', '==', '!='].includes(node.parent.init.operator)
      ) {
        return true;
      }

      // Check for logical expressions (likely boolean)
      if (
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.init?.type === AST_NODE_TYPES.LogicalExpression &&
        ['&&', '||', '??'].includes(node.parent.init.operator)
      ) {
        return true;
      }

      // Check for unary expressions with ! operator
      if (
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.init?.type === AST_NODE_TYPES.UnaryExpression &&
        node.parent.init.operator === '!'
      ) {
        return true;
      }

      // Check for function calls that likely return boolean
      if (
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.init?.type === AST_NODE_TYPES.CallExpression
      ) {
        const callee = node.parent.init.callee;
        if (
          callee.type === AST_NODE_TYPES.Identifier &&
          booleanPrefixes.some(prefix => callee.name.toLowerCase().startsWith(prefix.toLowerCase()))
        ) {
          return true;
        }
      }

      return false;
    }

    /**
     * Check if a function returns a boolean
     */
    function returnsBooleanType(node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression): boolean {
      const sourceCode = context.getSourceCode();
      const parserServices = sourceCode.parserServices;

      // First, check for explicit boolean return type annotation in the AST
      if (node.returnType?.typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword) {
        return true;
      }

      // Check for TypeScript type predicate (is type predicate)
      if (node.returnType?.typeAnnotation.type === AST_NODE_TYPES.TSTypePredicate) {
        return true;
      }

      // If we have access to TypeScript services, use them for more accurate type checking
      if (parserServices?.program && parserServices?.esTreeNodeToTSNodeMap) {
        const checker = parserServices.program.getTypeChecker();
        const nodeMap = parserServices.esTreeNodeToTSNodeMap;

        const tsNode = nodeMap.get(node);
        if (tsNode) {
          const signature = checker.getSignatureFromDeclaration(tsNode);
          if (signature) {
            const returnType = checker.getReturnTypeOfSignature(signature);

            // Check if return type is boolean
            if (returnType.flags & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) {
              return true;
            }

            // Check if it's a union type that includes only true/false
            if (returnType.isUnion()) {
              const types = returnType.types;
              const allBooleanLiterals = types.every(type =>
                type.flags & TypeFlags.BooleanLiteral
              );

              if (allBooleanLiterals) {
                return true;
              }
            }
          }
        }
      }

      // Fallback to AST-based analysis if TypeScript services are not available

      // For arrow functions with expression bodies
      if (node.type === AST_NODE_TYPES.ArrowFunctionExpression && node.expression) {
        const body = node.body;

        // Boolean literal
        if (body.type === AST_NODE_TYPES.Literal && typeof body.value === 'boolean') {
          return true;
        }

        // Comparison expressions
        if (body.type === AST_NODE_TYPES.BinaryExpression &&
            ['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(body.operator)) {
          return true;
        }

        // Logical expressions
        if (body.type === AST_NODE_TYPES.LogicalExpression &&
            ['&&', '||'].includes(body.operator)) {
          return true;
        }

        // Negation
        if (body.type === AST_NODE_TYPES.UnaryExpression && body.operator === '!') {
          return true;
        }

        // Function calls with boolean-like names
        if (body.type === AST_NODE_TYPES.CallExpression &&
            body.callee.type === AST_NODE_TYPES.Identifier &&
            booleanPrefixes.some(prefix => {
              const calleeName = body.callee.type === AST_NODE_TYPES.Identifier ? body.callee.name : '';
              return calleeName.toLowerCase().startsWith(prefix.toLowerCase());
            })) {
          return true;
        }
      } else {
        // For functions with block bodies, analyze return statements
        const returnStatements: TSESTree.ReturnStatement[] = [];

        // Find all return statements in the function
        function collectReturnStatements(node: TSESTree.Node) {
          if (node.type === AST_NODE_TYPES.ReturnStatement) {
            returnStatements.push(node);
          }

          // Don't traverse into nested functions
          if (node.type !== AST_NODE_TYPES.FunctionDeclaration &&
              node.type !== AST_NODE_TYPES.FunctionExpression &&
              node.type !== AST_NODE_TYPES.ArrowFunctionExpression) {
            for (const key in node) {
              if (key === 'parent') continue;
              const child = (node as any)[key];
              if (child && typeof child === 'object') {
                if (Array.isArray(child)) {
                  child.forEach(item => {
                    if (item && typeof item === 'object') {
                      collectReturnStatements(item);
                    }
                  });
                } else {
                  collectReturnStatements(child);
                }
              }
            }
          }
        }

        collectReturnStatements(node.body);

        // Check if any return statement returns a boolean
        const returnsBool = returnStatements.some(stmt => {
          const arg = stmt.argument;
          if (!arg) return false;

          // Boolean literal
          if (arg.type === AST_NODE_TYPES.Literal && typeof arg.value === 'boolean') {
            return true;
          }

          // Comparison expressions
          if (arg.type === AST_NODE_TYPES.BinaryExpression &&
              ['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(arg.operator)) {
            return true;
          }

          // Logical expressions
          if (arg.type === AST_NODE_TYPES.LogicalExpression &&
              ['&&', '||'].includes(arg.operator)) {
            return true;
          }

          // Negation
          if (arg.type === AST_NODE_TYPES.UnaryExpression && arg.operator === '!') {
            return true;
          }

          // Identifiers with boolean-like names
          if (arg.type === AST_NODE_TYPES.Identifier &&
              booleanPrefixes.some(prefix => arg.name.toLowerCase().startsWith(prefix.toLowerCase()))) {
            return true;
          }

          return false;
        });

        if (returnsBool) {
          return true;
        }
      }

      return false;
    }

    /**
     * Check variable declarations for boolean naming
     */
    function checkVariableDeclaration(node: TSESTree.VariableDeclarator) {
      if (node.id.type !== AST_NODE_TYPES.Identifier) return;

      // Skip destructuring patterns
      if (node.parent?.type === AST_NODE_TYPES.VariableDeclaration &&
          node.parent.declarations.some(d =>
            d.id.type === AST_NODE_TYPES.ObjectPattern ||
            d.id.type === AST_NODE_TYPES.ArrayPattern
          )) {
        return;
      }

      // Skip checking in test files
      if (isTestFile) {
        return;
      }

      // Skip imported identifiers
      if (importedIdentifiers.has(node.id.name)) {
        return;
      }

      const variableName = node.id.name;

      // Check if this is a boolean variable
      const isBool = isBooleanType(node.id);

      if (isBool) {
        // Check for negated boolean names
        if (hasNegationPrefix(variableName)) {
          context.report({
            node: node.id,
            messageId: 'negatedBooleanName',
            data: {
              name: variableName,
            },
          });
        }
        // Check for missing approved prefix
        else if (!hasApprovedPrefixForAnyCase(variableName)) {
          context.report({
            node: node.id,
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: variableName,
              prefixes: formatPrefixes(),
            },
          });
        }
      }
    }

    /**
     * Check function declarations for boolean naming
     */
    function checkFunctionDeclaration(node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) {
      // Skip anonymous functions
      if (!node.id && node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
        return;
      }

      // Skip checking in test files
      if (isTestFile) {
        return;
      }

      // Get function name from either the function declaration or variable declarator
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
        // Handle object method shorthand
        functionName = node.parent.key.name;
      } else if (
        node.parent?.type === AST_NODE_TYPES.MethodDefinition &&
        node.parent.key.type === AST_NODE_TYPES.Identifier
      ) {
        // Handle class methods
        functionName = node.parent.key.name;
      }

      if (!functionName) return;

      // Skip imported identifiers
      if (importedIdentifiers.has(functionName)) {
        return;
      }

      // Check if this function returns a boolean
      const returnsBool = returnsBooleanType(node);

      // For arrow functions with expression bodies that return boolean-like expressions
      if (node.type === AST_NODE_TYPES.ArrowFunctionExpression &&
          node.expression &&
          !returnsBool) {
        const body = node.body;

        // Check for comparison operators
        if (body.type === AST_NODE_TYPES.BinaryExpression &&
            ['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(body.operator)) {
          // Check for negated boolean names
          if (hasNegationPrefix(functionName)) {
            context.report({
              node: node.parent?.type === AST_NODE_TYPES.VariableDeclarator ? node.parent.id : node,
              messageId: 'negatedBooleanName',
              data: {
                name: functionName,
              },
            });
          }
          // Check for missing approved prefix
          else if (!hasApprovedPrefixForAnyCase(functionName)) {
            context.report({
              node: node.parent?.type === AST_NODE_TYPES.VariableDeclarator ? node.parent.id : node,
              messageId: 'missingBooleanPrefix',
              data: {
                type: 'function',
                name: functionName,
                prefixes: formatPrefixes(),
              },
            });
          }
          return;
        }
      }

      if (returnsBool) {
        // Check for negated boolean names
        if (hasNegationPrefix(functionName)) {
          context.report({
            node: node.id || node,
            messageId: 'negatedBooleanName',
            data: {
              name: functionName,
            },
          });
        }
        // Check for missing approved prefix
        else if (!hasApprovedPrefixForAnyCase(functionName)) {
          context.report({
            node: node.id || node,
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'function',
              name: functionName,
              prefixes: formatPrefixes(),
            },
          });
        }
      }
    }

    /**
     * Check method definitions for boolean naming
     */
    function checkMethodDefinition(node: TSESTree.MethodDefinition) {
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      // Skip checking in test files
      if (isTestFile) {
        return;
      }

      const methodName = node.key.name;

      // Skip imported identifiers
      if (importedIdentifiers.has(methodName)) {
        return;
      }

      // Special handling for getter methods
      if (node.kind === 'get' && exemptGetters) {
        return;
      }

      // Check if this method returns a boolean
      const returnsBool = node.value.type === AST_NODE_TYPES.FunctionExpression &&
                          returnsBooleanType(node.value);

      if (returnsBool) {
        // Check for negated boolean names
        if (hasNegationPrefix(methodName)) {
          context.report({
            node: node.key,
            messageId: 'negatedBooleanName',
            data: {
              name: methodName,
            },
          });
        }
        // Check for missing approved prefix
        else if (!hasApprovedPrefixForAnyCase(methodName)) {
          context.report({
            node: node.key,
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'method',
              name: methodName,
              prefixes: formatPrefixes(),
            },
          });
        }
      }
    }

    /**
     * Check property definitions for boolean naming
     */
    function checkProperty(node: TSESTree.Property) {
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      // Skip method shorthand properties (they're handled by checkFunctionDeclaration)
      if (node.method || node.value.type === AST_NODE_TYPES.FunctionExpression) {
        return;
      }

      // Skip checking for object literals in test files
      // This is to handle test cases with external API patterns
      if (skipObjectLiteralsInTests && node.parent?.type === AST_NODE_TYPES.ObjectExpression) {
        return;
      }

      const propertyName = node.key.name;

      // Check if this is a boolean property
      let isBool = false;

      // Check for boolean literal initialization
      if (
        node.value.type === AST_NODE_TYPES.Literal &&
        typeof node.value.value === 'boolean'
      ) {
        isBool = true;
      }

      // Check for boolean expressions
      if (
        node.value.type === AST_NODE_TYPES.BinaryExpression &&
        ['===', '!==', '==', '!='].includes(node.value.operator)
      ) {
        isBool = true;
      }

      // Check for logical expressions
      if (
        node.value.type === AST_NODE_TYPES.LogicalExpression &&
        ['&&', '||'].includes(node.value.operator)
      ) {
        isBool = true;
      }

      // Check for unary expressions with ! operator
      if (
        node.value.type === AST_NODE_TYPES.UnaryExpression &&
        node.value.operator === '!'
      ) {
        isBool = true;
      }

      // Check for identifiers that might be boolean
      if (node.value.type === AST_NODE_TYPES.Identifier) {
        const identifierName = node.value.name;
        if (booleanPrefixes.some(prefix =>
          identifierName.toLowerCase().startsWith(prefix.toLowerCase())
        )) {
          isBool = true;
        }
      }

      // Skip imported identifiers
      if (importedIdentifiers.has(propertyName)) {
        return;
      }

      if (isBool) {
        // Check for negated boolean names
        if (hasNegationPrefix(propertyName)) {
          context.report({
            node: node.key,
            messageId: 'negatedBooleanName',
            data: {
              name: propertyName,
            },
          });
        }
        // Check for missing approved prefix
        else if (!hasApprovedPrefixForAnyCase(propertyName)) {
          context.report({
            node: node.key,
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: propertyName,
              prefixes: formatPrefixes(),
            },
          });
        }
      }
    }

    /**
     * Check TSPropertySignature for boolean naming (in interfaces)
     */
    function checkPropertySignature(node: TSESTree.TSPropertySignature) {
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      // Skip checking in test files for interface properties
      if (isTestFile) {
        return;
      }

      const propertyName = node.key.name;

      // Skip imported identifiers
      if (importedIdentifiers.has(propertyName)) {
        return;
      }

      // Check if this is a boolean property
      const isBool = node.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword;

      if (isBool) {
        // Check for negated boolean names
        if (hasNegationPrefix(propertyName)) {
          context.report({
            node: node.key,
            messageId: 'negatedBooleanName',
            data: {
              name: propertyName,
            },
          });
        }
        // Check for missing approved prefix
        else if (!hasApprovedPrefixForAnyCase(propertyName)) {
          context.report({
            node: node.key,
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: propertyName,
              prefixes: formatPrefixes(),
            },
          });
        }
      }
    }

    /**
     * Check parameter names for boolean naming
     */
    function checkParameter(node: TSESTree.Parameter) {
      if (node.type !== AST_NODE_TYPES.Identifier) return;

      // Skip checking in test files
      if (isTestFile) {
        return;
      }

      const paramName = node.name;

      // Check if this is a boolean parameter
      let isBool = false;

      // Check for type annotation
      if (
        node.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword
      ) {
        isBool = true;
      }

      // Check for default value that's a boolean
      if (
        node.parent?.type === AST_NODE_TYPES.AssignmentPattern &&
        node.parent.right.type === AST_NODE_TYPES.Literal &&
        typeof node.parent.right.value === 'boolean'
      ) {
        isBool = true;
      }

      if (isBool) {
        // Check for negated boolean names
        if (hasNegationPrefix(paramName)) {
          context.report({
            node,
            messageId: 'negatedBooleanName',
            data: {
              name: paramName,
            },
          });
        }
        // Check for missing approved prefix
        else if (!hasApprovedPrefixForAnyCase(paramName)) {
          context.report({
            node,
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'parameter',
              name: paramName,
              prefixes: formatPrefixes(),
            },
          });
        }
      }
    }

    /**
     * Check class property definitions for boolean naming
     */
    function checkClassProperty(node: any) {
      if (node.type !== 'ClassProperty' && node.type !== 'PropertyDefinition') return;
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      // Skip checking in test files
      if (isTestFile) {
        return;
      }

      const propertyName = node.key.name;

      // Check if this is a boolean property
      let isBool = false;

      // Check for type annotation
      if (
        node.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword
      ) {
        isBool = true;
      }

      // Check for boolean literal initialization
      if (
        node.value?.type === AST_NODE_TYPES.Literal &&
        typeof node.value.value === 'boolean'
      ) {
        isBool = true;
      }

      // Check for boolean expressions
      if (
        node.value?.type === AST_NODE_TYPES.BinaryExpression &&
        ['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(node.value.operator)
      ) {
        isBool = true;
      }

      // Check for logical expressions
      if (
        node.value?.type === AST_NODE_TYPES.LogicalExpression &&
        ['&&', '||'].includes(node.value.operator)
      ) {
        isBool = true;
      }

      // Check for unary expressions with ! operator
      if (
        node.value?.type === AST_NODE_TYPES.UnaryExpression &&
        node.value.operator === '!'
      ) {
        isBool = true;
      }

      // Skip imported identifiers
      if (importedIdentifiers.has(propertyName)) {
        return;
      }

      if (isBool) {
        // Check for negated boolean names
        if (hasNegationPrefix(propertyName)) {
          context.report({
            node: node.key,
            messageId: 'negatedBooleanName',
            data: {
              name: propertyName,
            },
          });
        }
        // Check for missing approved prefix
        else if (!hasApprovedPrefixForAnyCase(propertyName)) {
          context.report({
            node: node.key,
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: propertyName,
              prefixes: formatPrefixes(),
            },
          });
        }
      }
    }

    /**
     * Check if a name is in UPPER_SNAKE_CASE format
     */
    function isUpperSnakeCase(name: string): boolean {
      return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name);
    }

    /**
     * Check if a name has an approved prefix, considering UPPER_SNAKE_CASE format
     */
    function hasApprovedPrefixForAnyCase(name: string): boolean {
      // Check for framework-specific names that should be exempted
      if (isFrameworkSpecificName(name)) {
        return true;
      }

      // For UPPER_SNAKE_CASE, we need to check differently
      if (isUpperSnakeCase(name)) {
        return booleanPrefixes.some(prefix => {
          const upperPrefix = prefix.toUpperCase();
          return name.startsWith(upperPrefix) || name.startsWith(`IS_${upperPrefix.substring(2)}`);
        });
      }

      // For regular camelCase or PascalCase
      return hasApprovedPrefix(name);
    }

    /**
     * Track imported identifiers to skip them in checks
     */
    function collectImportedIdentifiers(node: TSESTree.ImportDeclaration) {
      node.specifiers.forEach(specifier => {
        if (specifier.type === AST_NODE_TYPES.ImportSpecifier ||
            specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
            specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
          importedIdentifiers.add(specifier.local.name);
        }
      });
    }

    return {
      ImportDeclaration: collectImportedIdentifiers,
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        // Skip imported identifiers
        if (node.id.type === AST_NODE_TYPES.Identifier && importedIdentifiers.has(node.id.name)) {
          return;
        }
        checkVariableDeclaration(node);
      },
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        // Skip imported identifiers
        if (node.id && importedIdentifiers.has(node.id.name)) {
          return;
        }
        checkFunctionDeclaration(node);
      },
      FunctionExpression(node: TSESTree.FunctionExpression) {
        if (node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
          checkFunctionDeclaration(node);
        }
      },
      ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
        // Special handling for arrow functions in variable declarations
        if (node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
            node.parent.id.type === AST_NODE_TYPES.Identifier) {

          const variableName = node.parent.id.name;

          // Skip imported identifiers
          if (importedIdentifiers.has(variableName)) {
            return;
          }

          // Skip checking in test files
          if (isTestFile) {
            return;
          }

          // Check for explicit boolean return type
          if (node.returnType?.typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword) {
            if (!hasApprovedPrefixForAnyCase(variableName)) {
              context.report({
                node: node.parent.id,
                messageId: 'missingBooleanPrefix',
                data: {
                  type: 'variable',
                  name: variableName,
                  prefixes: formatPrefixes(),
                },
              });
            }
            return;
          }

          // Check for implicit boolean return in expression body
          if (node.expression) {
            const body = node.body;

            // Check for comparison operators
            if (body.type === AST_NODE_TYPES.BinaryExpression &&
                ['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(body.operator)) {
              if (!hasApprovedPrefixForAnyCase(variableName)) {
                context.report({
                  node: node.parent.id,
                  messageId: 'missingBooleanPrefix',
                  data: {
                    type: 'variable',
                    name: variableName,
                    prefixes: formatPrefixes(),
                  },
                });
              }
              return;
            }
          }
        }

        // For other arrow functions
        if (node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
          checkFunctionDeclaration(node);
        }
      },
      MethodDefinition(node: TSESTree.MethodDefinition) {
        // Skip methods from imported classes
        if (node.key.type === AST_NODE_TYPES.Identifier &&
            node.parent?.type === AST_NODE_TYPES.ClassBody &&
            node.parent.parent?.type === AST_NODE_TYPES.ClassDeclaration &&
            node.parent.parent.id &&
            importedIdentifiers.has(node.parent.parent.id.name)) {
          return;
        }
        checkMethodDefinition(node);
      },
      Property(node: TSESTree.Property) {
        // Skip properties from imported objects
        if (node.key.type === AST_NODE_TYPES.Identifier &&
            node.parent?.type === AST_NODE_TYPES.ObjectExpression &&
            node.parent.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
            node.parent.parent.id.type === AST_NODE_TYPES.Identifier &&
            importedIdentifiers.has(node.parent.parent.id.name)) {
          return;
        }
        checkProperty(node);
      },
      ClassProperty(node: any) {
        // Skip properties from imported classes
        if (node.key.type === AST_NODE_TYPES.Identifier &&
            node.parent?.type === AST_NODE_TYPES.ClassBody &&
            node.parent.parent?.type === AST_NODE_TYPES.ClassDeclaration &&
            node.parent.parent.id &&
            importedIdentifiers.has(node.parent.parent.id.name)) {
          return;
        }
        checkClassProperty(node);
      },
      PropertyDefinition(node: any) {
        // Skip properties from imported classes
        if (node.key.type === AST_NODE_TYPES.Identifier &&
            node.parent?.type === AST_NODE_TYPES.ClassBody &&
            node.parent.parent?.type === AST_NODE_TYPES.ClassDeclaration &&
            node.parent.parent.id &&
            importedIdentifiers.has(node.parent.parent.id.name)) {
          return;
        }
        checkClassProperty(node);
      },
      TSPropertySignature(node: TSESTree.TSPropertySignature) {
        // Skip properties from imported interfaces
        if (node.key.type === AST_NODE_TYPES.Identifier &&
            node.parent?.type === AST_NODE_TYPES.TSInterfaceBody &&
            node.parent.parent?.type === AST_NODE_TYPES.TSInterfaceDeclaration &&
            node.parent.parent.id &&
            importedIdentifiers.has(node.parent.parent.id.name)) {
          return;
        }
        checkPropertySignature(node);
      },
      Identifier(node: TSESTree.Identifier) {
        // Skip imported identifiers
        if (importedIdentifiers.has(node.name)) {
          return;
        }

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
