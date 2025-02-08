/* eslint-disable @typescript-eslint/no-empty-function */
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'missingExportedType'
  | 'missingExportedReturnType'
  | 'missingExportedPropsType';

export const enforceExportedFunctionTypes = createRule<[], MessageIds>({
  name: 'enforce-exported-function-types',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce exporting types for function props and return values',
      recommended: 'error',
    },
    schema: [],
    messages: {
      missingExportedType:
        'Type {{typeName}} should be exported since it is used in an exported function. Add `export` before the type definition: `export type {{typeName}} = ...`',
      missingExportedReturnType:
        'Return type {{typeName}} should be exported since it is used in an exported function. Add `export` before the type definition: `export type {{typeName}} = ...`',
      missingExportedPropsType:
        'Props type {{typeName}} should be exported since it is used in an exported React component. Add `export` before the type definition: `export type {{typeName}} = ...`',
    },
  },
  defaultOptions: [],
  create(context) {
    const reportedTypes = new Set<string>();
    function isExported(node: TSESTree.Node | undefined): boolean {
      if (!node) return false;

      if (
        node.type === AST_NODE_TYPES.ExportNamedDeclaration ||
        node.type === AST_NODE_TYPES.ExportDefaultDeclaration
      ) {
        return true;
      }

      const parent = node.parent;
      if (!parent) return false;

      if (
        parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
        parent.type === AST_NODE_TYPES.ExportDefaultDeclaration ||
        (parent.type === AST_NODE_TYPES.VariableDeclarator &&
          isExported(parent.parent))
      ) {
        return true;
      }

      return false;
    }

    function findTypeParameters(node: TSESTree.Node): Set<string> {
      // Find all type parameters in scope
      const typeParams = new Set<string>();
      let current: TSESTree.Node | undefined = node;
      while (current) {
        // Handle type parameters in function declarations, arrow functions, and variable declarations
        if (
          current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.VariableDeclarator
        ) {
          if ('typeParameters' in current && current.typeParameters) {
            current.typeParameters.params.forEach((param) => {
              if (param.type === AST_NODE_TYPES.TSTypeParameter) {
                typeParams.add(param.name.name);
              }
            });
          }
        }
        current = current.parent as TSESTree.Node | undefined;
      }
      return typeParams;
    }

    function getTypeNames(node: TSESTree.TypeNode | undefined, typeParams?: Set<string>): string[] {
      if (!node) return [];

      // Initialize type parameters if not provided
      if (!typeParams) {
        typeParams = findTypeParameters(node);
      }

      switch (node.type) {
        case AST_NODE_TYPES.TSTypeReference:
          if (node.typeName.type === AST_NODE_TYPES.Identifier) {
            // Skip checking generic type parameters (e.g., T in <T extends DocumentData>)
            if (typeParams.has(node.typeName.name)) return [];

            const names = [node.typeName.name];
            // For generic types like AuthenticatedRequest<Params>, check type arguments
            if ('typeParameters' in node && node.typeParameters) {
              node.typeParameters.params.forEach((param) => {
                names.push(...getTypeNames(param, typeParams));
              });
            }
            return names;
          }
          break;
        case AST_NODE_TYPES.TSTypeLiteral:
          return ['AnonymousType'];
      }
      return [];
    }

    function isBuiltInType(typeName: string): boolean {
      const builtInTypes = new Set([
        // Primitive types
        'string',
        'number',
        'boolean',
        'null',
        'undefined',
        'void',
        'any',
        'never',
        'unknown',
        'object',
        'symbol',
        'bigint',
        // Built-in objects
        'Date',
        'RegExp',
        'Error',
        'Promise',
        'Array',
        'Function',
        'Symbol',
        'BigInt',
        'Map',
        'Set',
        'WeakMap',
        'WeakSet',
        'Proxy',
        'DataView',
        'ArrayBuffer',
        'SharedArrayBuffer',
        'Atomics',
        'Intl',
        'JSON',
        'Math',
        'Reflect',
        'WeakRef',
        'FinalizationRegistry',
        // TypeScript utility types
        'Record',
        'Partial',
        'Required',
        'Readonly',
        'Pick',
        'Omit',
        'Exclude',
        'Extract',
        'NonNullable',
        'Parameters',
        'ConstructorParameters',
        'ReturnType',
        'InstanceType',
        'ThisParameterType',
        'OmitThisParameter',
        'ThisType',
        'Uppercase',
        'Lowercase',
        'Capitalize',
        'Uncapitalize',
        'Awaited',
        'PropertyKey',
        'Mutable',
        'DeepPartial',
        'DeepReadonly',
        'DeepRequired',
        'Merge',
        'MergeExclusive',
        'OptionalKeys',
        'RequiredKeys',
        'ReadonlyKeys',
        'WritableKeys',
        'UnionToIntersection',
        'UnionToTuple',
        'Promisable',
        // React types
        'ReactElement',
        'ReactNode',
        'ReactChild',
        'ReactChildren',
        'ReactFragment',
        'ReactPortal',
        'ReactText',
        'JSX',
        'JSXElement',
        'JSXElementConstructor',
        'ComponentType',
        'ComponentProps',
        'ComponentRef',
        'ElementType',
        'ElementRef',
        'Ref',
        'RefObject',
        'RefCallback',
        'LegacyRef',
        'PropsWithRef',
        'PropsWithChildren',
        'PropsWithoutRef',
        'FC',
        'FunctionComponent',
        'VFC',
        'VoidFunctionComponent',
        'ForwardRefRenderFunction',
        'ForwardRefExoticComponent',
        'MutableRefObject',
        'ClassAttributes',
        'DOMAttributes',
        'CSSProperties',
        'StyleHTMLAttributes',
        'AriaAttributes',
        'DOMElement',
        'ReactHTML',
        'ReactSVG',
        // Node.js types
        'Buffer',
        'ReadableStream',
        'WritableStream',
        'DuplexStream',
        'TransformStream',
        'ReadStream',
        'WriteStream',
        'EventEmitter',
        'Timeout',
        'Immediate',
        'NodeJS',
        'Process',
        'Global',
        // DOM types
        'HTMLElement',
        'Element',
        'Node',
        'Document',
        'Window',
        'Event',
        'CustomEvent',
        'MouseEvent',
        'KeyboardEvent',
        'TouchEvent',
        'DragEvent',
        'ClipboardEvent',
        'FocusEvent',
        'FormEvent',
        'ChangeEvent',
        'AnimationEvent',
        'TransitionEvent',
        'SVGElement',
        'File',
        'FileList',
        'Blob',
        'URL',
        'URLSearchParams',
        'FormData',
        'Headers',
        'Request',
        'Response',
        'WebSocket',
        'Worker',
        'ServiceWorker',
        'MessagePort',
        'Storage',
        'CSSStyleDeclaration',
        // Common library types
        'Observable',
        'Subscription',
        'Subject',
        'BehaviorSubject',
        'ReplaySubject',
        'AsyncSubject',
        'Observer',
        'Operator',
        'Scheduler',
        'Unsubscribable',
        'SubscriptionLike',
        'TeardownLogic',
        'MonoTypeOperatorFunction',
        'OperatorFunction',
        'UnaryFunction',
        'Action',
        'AnyAction',
        'Dispatch',
        'Reducer',
        'Store',
        'Middleware',
        'Selector',
        'ThunkAction',
        'ThunkDispatch',
        'Query',
        'Mutation',
        'QueryResult',
        'MutationResult',
        'UseQueryResult',
        'UseMutationResult',
        'UseInfiniteQueryResult',
        'Schema',
        'Model',
        'Document',
        'ObjectId',
        'Collection',
        'Db',
        'Client',
        'Session',
        'Transaction',
        'ValidationError',
        'ValidationResult',
        'Validator',
        'Logger',
        'LogLevel',
        'Config',
        'Options',
        'Settings',
        'Context',
        'Next',
        'Middleware',
        'Route',
        'Router',
        'Handler',
        'Controller',
        'Service',
        'Repository',
        'Entity',
        'DTO',
        'Enum',
        'Union',
        'Intersection',
        'Tuple',
        'Readonly',
        'ReadonlyArray',
        'ReadonlyMap',
        'ReadonlySet',
        'Iterable',
        'Iterator',
        'Generator',
        'AsyncIterator',
        'AsyncGenerator',
        'Thenable',
        'PromiseLike',
        'ArrayLike',
        'Indexable',
        'Nullable',
        'Optional',
        'NonOptional',
        'NonNullable',
        'NonUndefined',
        'NonVoid',
        'NonEmptyArray',
        'DeepReadonly',
        'DeepPartial',
        'DeepRequired',
        'DeepNonNullable',
        'DeepMutable',
        'Primitive',
        'Nullish',
        'Falsy',
        'Truthy',
        'Exact',
        'Strict',
        'Loose',
        'Writable',
        'Mutable',
        'Immutable',
        'Frozen',
        'Sealed',
        'Extensible',
        'Constructable',
        'Abstract',
        'Concrete',
        'Override',
        'Overwrite',
        'OmitByValue',
        'PickByValue',
        'RequiredBy',
        'OptionalBy',
        'ReadonlyBy',
        'MutableBy',
        'NullableBy',
        'NonNullableBy',
        'UndefinedBy',
        'NonUndefinedBy',
        'NeverBy',
        'UnknownBy',
        'AnyBy',
        'VoidBy',
      ]);
      return builtInTypes.has(typeName);
    }

    function checkAndReportType(
      node: TSESTree.TypeNode,
      parentNode: TSESTree.Node,
      messageId: MessageIds,
    ): void {
      const typeNames = getTypeNames(node);
      for (const typeName of typeNames) {
        if (
          typeName !== 'AnonymousType' &&
          !isBuiltInType(typeName) &&
          !isTypeExported(typeName)
        ) {
          // Check if we've already reported this type
          const key = `${typeName}-${parentNode.loc?.start.line}-${parentNode.loc?.start.column}`;
          if (!reportedTypes.has(key)) {
            reportedTypes.add(key);
            context.report({
              node: parentNode,
              messageId,
              data: { typeName },
            });
          }
        }
      }
    }

    function isTypeExported(typeName: string): boolean {
      const sourceCode = context.getSourceCode();
      const program = sourceCode.ast;

      // Check for imported types first - if found, return true immediately
      // since imported types are already available to consumers
      const hasImportedType = program.body.some((node) => {
        if (node.type === AST_NODE_TYPES.ImportDeclaration) {
          return node.specifiers.some(
            (specifier) =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.local.name === typeName,
          );
        }
        return false;
      });

      if (hasImportedType) {
        return true;
      }

      // Check for exported type declarations
      const exportedTypes = program.body.filter((node) => {
        if (node.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          if (
            node.declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration
          ) {
            return node.declaration.id.name === typeName;
          }
          if (
            node.declaration?.type === AST_NODE_TYPES.TSInterfaceDeclaration
          ) {
            return node.declaration.id.name === typeName;
          }
        }
        return false;
      });

      if (exportedTypes.length > 0) {
        return true;
      }

      // Check for type aliases in the current scope
      const scope = context.getScope();
      const variable = scope.variables.find((v) => v.name === typeName);
      if (!variable) return false;

      const def = variable.defs[0];
      if (!def) return false;

      // Check if the type is directly exported
      if (isExported(def.node)) return true;

      // Check if the type is part of an export declaration
      const parent = def.node.parent;
      if (!parent) return false;

      // Handle type aliases in export declarations
      if (parent.type === AST_NODE_TYPES.ExportNamedDeclaration) {
        return true;
      }

      // Handle type aliases in variable declarations
      if (parent.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
        if (parent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          return true;
        }
      }

      // Handle type aliases in interface declarations
      if (parent.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        if (parent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          return true;
        }
      }

      return false;
    }

    return {
      FunctionDeclaration(node) {
        if (!isExported(node)) return;

        // Skip React components
        if (node.id?.name && /^[A-Z]/.test(node.id.name)) return;

        // Check return type
        if (node.returnType?.typeAnnotation) {
          checkAndReportType(
            node.returnType.typeAnnotation,
            node.returnType,
            'missingExportedReturnType',
          );
        }

        // Check parameter types
        node.params.forEach((param) => {
          if (
            param.type === AST_NODE_TYPES.Identifier &&
            param.typeAnnotation
          ) {
            checkAndReportType(
              param.typeAnnotation.typeAnnotation,
              param.typeAnnotation,
              'missingExportedType',
            );
          }
        });
      },

      'VariableDeclarator > ArrowFunctionExpression'(
        node: TSESTree.ArrowFunctionExpression,
      ) {
        if (!node.parent?.parent || !isExported(node.parent.parent)) return;

        // Skip React components
        if (
          node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
          node.parent.id.type === AST_NODE_TYPES.Identifier &&
          /^[A-Z]/.test(node.parent.id.name)
        )
          return;

        // Check return type
        if (node.returnType?.typeAnnotation) {
          checkAndReportType(
            node.returnType.typeAnnotation,
            node.returnType,
            'missingExportedReturnType',
          );
        }

        // Check parameter types
        node.params.forEach((param) => {
          if (
            param.type === AST_NODE_TYPES.Identifier &&
            param.typeAnnotation
          ) {
            checkAndReportType(
              param.typeAnnotation.typeAnnotation,
              param.typeAnnotation,
              'missingExportedType',
            );
          }
        });
      },

      // Handle React components
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation]'(
        node: TSESTree.Identifier,
      ) {
        if (!isExported(node.parent)) return;

        // Check props parameter
        if (node.typeAnnotation) {
          checkAndReportType(
            node.typeAnnotation.typeAnnotation,
            node.typeAnnotation,
            'missingExportedPropsType',
          );
        }
      },

      // Skip type checking for React components since we handle them separately
      'FunctionDeclaration[id.name=/^[A-Z]/] > TSTypeAnnotation'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > TSTypeAnnotation > TSTypeReference'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > TSTypeAnnotation'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > TSTypeAnnotation > TSTypeReference'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > Identifier'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > Identifier'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > Identifier'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > Identifier'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() {},
      'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
      'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() {},
    };
  },
});
