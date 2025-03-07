import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'tooManyParams' | 'sameTypeParams';
type Options = [
  {
    minimumParameters?: number;
    checkSameTypeParameters?: boolean;
    ignoreBoundMethods?: boolean;
    ignoreVariadicFunctions?: boolean;
  },
];

const defaultOptions: Options[0] = {
  minimumParameters: 3,
  checkSameTypeParameters: true,
  ignoreBoundMethods: true,
  ignoreVariadicFunctions: true,
};

export const preferSettingsObject = createRule<Options, MessageIds>({
  name: 'prefer-settings-object',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using a settings object for functions with multiple parameters',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          minimumParameters: {
            type: 'number',
            minimum: 2,
          },
          checkSameTypeParameters: {
            type: 'boolean',
          },
          ignoreBoundMethods: {
            type: 'boolean',
          },
          ignoreVariadicFunctions: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooManyParams:
        'Function has too many parameters ({{count}}). Use a settings object instead.',
      sameTypeParams:
        'Function has multiple parameters of the same type. Use a settings object instead.',
    },
  },
  defaultOptions: [defaultOptions],
  create(context, [options]) {
    const finalOptions = { ...defaultOptions, ...options };

    function getParameterType(param: TSESTree.Parameter): string {
      if (param.type === AST_NODE_TYPES.AssignmentPattern) {
        return getParameterType(param.left as TSESTree.Parameter);
      }
      if (param.type === AST_NODE_TYPES.ObjectPattern && param.typeAnnotation) {
        // For destructured parameters, use the type annotation name
        const typeNode = param.typeAnnotation.typeAnnotation;
        if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
          return typeNode.typeName.type === AST_NODE_TYPES.Identifier
            ? typeNode.typeName.name
            : 'unknown';
        }
        return typeNode.type;
      }
      if (param.type === AST_NODE_TYPES.Identifier && param.typeAnnotation) {
        const typeNode = param.typeAnnotation.typeAnnotation;
        if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
          return typeNode.typeName.type === AST_NODE_TYPES.Identifier
            ? typeNode.typeName.name
            : 'unknown';
        }
        if (typeNode.type === AST_NODE_TYPES.TSStringKeyword) return 'string';
        if (typeNode.type === AST_NODE_TYPES.TSNumberKeyword) return 'number';
        if (typeNode.type === AST_NODE_TYPES.TSBooleanKeyword) return 'boolean';
        return typeNode.type;
      }
      return 'unknown';
    }

    function hasSameTypeParameters(params: TSESTree.Parameter[]): boolean {
      const typeMap = new Map<string, number>();

      for (const param of params) {
        const type = getParameterType(param);
        const count = (typeMap.get(type) || 0) + 1;
        typeMap.set(type, count);

        if (count > 1) {
          return true;
        }
      }

      return false;
    }

    function isBuiltInOrThirdParty(node: TSESTree.Node): boolean {
      // Check if the node is part of a new expression (constructor call)
      let current = node;
      while (current.parent) {
        const parent = current.parent;

        // Check if we're in a constructor call
        if (parent.type === AST_NODE_TYPES.NewExpression) {
          const callee = parent.callee;
          if (callee.type === AST_NODE_TYPES.Identifier) {
            // List of built-in objects that should be ignored
            const builtInObjects = new Set([
              'Promise',
              'Map',
              'Set',
              'WeakMap',
              'WeakSet',
              'Int8Array',
              'Uint8Array',
              'Uint8ClampedArray',
              'Int16Array',
              'Uint16Array',
              'Int32Array',
              'Uint32Array',
              'Float32Array',
              'Float64Array',
              'BigInt64Array',
              'BigUint64Array',
              'ArrayBuffer',
              'SharedArrayBuffer',
              'DataView',
              'Date',
              'RegExp',
              'Error',
              'AggregateError',
              'EvalError',
              'RangeError',
              'ReferenceError',
              'SyntaxError',
              'TypeError',
              'URIError',
              'Transform', // Added Transform to built-in objects
            ]);
            if (builtInObjects.has(callee.name)) {
              return true;
            }

            // Check if the identifier is imported from a third-party module
            const scope = context.getScope();
            const variable = scope.variables.find(
              (v) => v.name === callee.name,
            );
            if (variable) {
              const def = variable.defs[0];
              if (def?.type === 'ImportBinding') {
                const importDecl = def.parent;
                let source: string | undefined;

                if (importDecl.type === AST_NODE_TYPES.ImportDeclaration) {
                  source = importDecl.source.value;
                } else if (
                  importDecl.type ===
                    AST_NODE_TYPES.TSImportEqualsDeclaration &&
                  importDecl.moduleReference.type ===
                    AST_NODE_TYPES.TSExternalModuleReference &&
                  importDecl.moduleReference.expression.type ===
                    AST_NODE_TYPES.Literal
                ) {
                  source = importDecl.moduleReference.expression
                    .value as string;
                }

                // If it's a third-party module (doesn't start with '.' or '/'), ignore it
                if (
                  source &&
                  !source.startsWith('.') &&
                  !source.startsWith('/')
                ) {
                  return true;
                }
              }
            }
          } else if (callee.type === AST_NODE_TYPES.MemberExpression) {
            // Handle cases like React.Component or lodash.debounce
            const obj = callee.object;
            if (obj.type === AST_NODE_TYPES.Identifier) {
              const scope = context.getScope();
              const variable = scope.variables.find((v) => v.name === obj.name);
              if (variable) {
                const def = variable.defs[0];
                if (def?.type === 'ImportBinding') {
                  const importDecl = def.parent;
                  let source: string | undefined;

                  if (importDecl.type === AST_NODE_TYPES.ImportDeclaration) {
                    source = importDecl.source.value;
                  } else if (
                    importDecl.type ===
                      AST_NODE_TYPES.TSImportEqualsDeclaration &&
                    importDecl.moduleReference.type ===
                      AST_NODE_TYPES.TSExternalModuleReference &&
                    importDecl.moduleReference.expression.type ===
                      AST_NODE_TYPES.Literal
                  ) {
                    source = importDecl.moduleReference.expression
                      .value as string;
                  }

                  // If it's a third-party module (doesn't start with '.' or '/'), ignore it
                  if (
                    source &&
                    !source.startsWith('.') &&
                    !source.startsWith('/')
                  ) {
                    return true;
                  }
                }
              }
            }
          }
        }

        // Also check if we're in a property of an object that's passed to a constructor
        if (
          parent.type === AST_NODE_TYPES.Property &&
          parent.parent?.type === AST_NODE_TYPES.ObjectExpression &&
          parent.parent.parent?.type === AST_NODE_TYPES.NewExpression
        ) {
          return true;
        }

        current = parent;
      }
      return false;
    }

    function hasABPattern(params: TSESTree.Parameter[]): boolean {
      if (params.length !== 2) return false;

      const paramNames = params.map((param) => {
        if (param.type === AST_NODE_TYPES.Identifier) {
          return param.name;
        }
        return '';
      });

      // Check if both parameters end with 'A' and 'B' respectively and have the same prefix
      const [first, second] = paramNames;
      if (first.endsWith('A') && second.endsWith('B')) {
        const firstPrefix = first.slice(0, -1);
        const secondPrefix = second.slice(0, -1);
        return firstPrefix === secondPrefix;
      }

      return false;
    }

    function shouldIgnoreNode(node: TSESTree.Node): boolean {
      // Ignore built-in objects and third-party modules
      if (isBuiltInOrThirdParty(node)) return true;

      // Ignore variadic functions if configured
      if (finalOptions.ignoreVariadicFunctions) {
        const hasRestParam =
          node.type === AST_NODE_TYPES.FunctionDeclaration &&
          node.params.some(
            (param) => param.type === AST_NODE_TYPES.RestElement,
          );
        if (hasRestParam) return true;
      }

      // Ignore bound methods if configured
      if (finalOptions.ignoreBoundMethods) {
        let parent = node.parent;
        while (parent) {
          if (
            parent.type === AST_NODE_TYPES.CallExpression ||
            parent.type === AST_NODE_TYPES.TSCallSignatureDeclaration
          ) {
            return true;
          }
          parent = parent.parent as TSESTree.Node;
        }
      }

      // Ignore functions with A/B pattern parameters
      if (
        (node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.type === AST_NODE_TYPES.TSMethodSignature ||
          node.type === AST_NODE_TYPES.TSFunctionType) &&
        Array.isArray(node.params)
      ) {
        if (hasABPattern(node.params)) return true;
      }

      return false;
    }

    function checkFunction(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | TSESTree.TSMethodSignature
        | TSESTree.TSFunctionType,
    ): void {
      if (shouldIgnoreNode(node)) return;

      const params = node.params;

      // Check for too many parameters first
      const minParams =
        finalOptions.minimumParameters ?? defaultOptions.minimumParameters ?? 3;
      if (params.length >= minParams) {
        context.report({
          node,
          messageId: 'tooManyParams',
          data: { count: params.length },
        });
        return;
      }

      // Then check for same type parameters if enabled
      if (finalOptions.checkSameTypeParameters && params.length >= 2) {
        if (hasSameTypeParameters(params)) {
          context.report({
            node,
            messageId: 'sameTypeParams',
          });
        }
      }
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      TSMethodSignature: checkFunction,
      TSFunctionType: checkFunction,
    };
  },
});
