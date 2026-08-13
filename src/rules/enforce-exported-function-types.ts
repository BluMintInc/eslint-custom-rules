/* eslint-disable @typescript-eslint/no-empty-function */
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'missingExportedType'
  | 'missingExportedReturnType'
  | 'missingExportedPropsType';

type ComponentFunction =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

type UnwrappedComponent = {
  fn: ComponentFunction;
  /**
   * True when the function reached the export through `memo`/`forwardRef`. The
   * wrapper is itself proof of component-hood, which is the only signal left
   * when the component is anonymous (`export default memo((props: P) => ...)`).
   */
  isWrapped: boolean;
  /**
   * The binding a wrapper argument named (`memo(BannerUnmemoized)`). It is the
   * only name an anonymous resolved function has, so it carries the
   * capitalization signal for `export default memo(BannerUnmemoized)`.
   */
  resolvedName?: string;
};

/**
 * Maps a module-scope binding name to the declaration or initializer it stands
 * for, or `undefined` when the name belongs to another module.
 */
type ComponentResolver = (name: string) => TSESTree.Node | undefined;

/**
 * `require-memo` rewrites `export function Banner(props: P)` into
 * `export const Banner = memo(function BannerUnmemoized(props: P) {...})`, so
 * every wrapper it can emit has to be unwrapped here or the config's own
 * autofix hides the component from this rule.
 */
const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef']);

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function isComponentWrapperCallee(callee: TSESTree.Node): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return COMPONENT_WRAPPERS.has(callee.name);
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return COMPONENT_WRAPPERS.has(callee.property.name);
  }
  return false;
}

/**
 * Resolves the function that actually receives the props, peeling any nesting
 * of component wrappers (`memo(forwardRef(fn))`) along the way.
 *
 * `seen` records the binding names already followed, so mutually aliased
 * declarations (`const A = memo(B); const B = memo(A);`) terminate instead of
 * recursing forever.
 */
function unwrapComponentFunction(
  node: TSESTree.Node | null | undefined,
  resolveComponent: ComponentResolver,
  isWrapped = false,
  seen: Set<string> = new Set(),
): UnwrappedComponent | undefined {
  if (!node) return undefined;

  if (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  ) {
    return { fn: node, isWrapped };
  }

  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    isComponentWrapperCallee(node.callee)
  ) {
    const [firstArgument] = node.arguments;
    if (!firstArgument || firstArgument.type === AST_NODE_TYPES.SpreadElement) {
      return undefined;
    }
    return unwrapComponentFunction(firstArgument, resolveComponent, true, seen);
  }

  // `export const Banner = memo(BannerUnmemoized)` is the shape `require-memo`
  // leaves behind most often, and the props it wraps live one hop away on the
  // named declaration. Resolution is confined to wrapper arguments: a bare
  // `export const Banner = Other` re-exports a value rather than declaring a
  // component here.
  if (isWrapped && node.type === AST_NODE_TYPES.Identifier) {
    if (seen.has(node.name)) return undefined;
    seen.add(node.name);

    const component = unwrapComponentFunction(
      resolveComponent(node.name),
      resolveComponent,
      true,
      seen,
    );
    if (!component) return undefined;

    return { ...component, resolvedName: component.resolvedName ?? node.name };
  }

  return undefined;
}

/**
 * Resolves the component a default export ships.
 *
 * `require-memo` cannot rewrite `export default function Banner(props: P)` in
 * place, since `export default const Banner = memo(...)` is a syntax error, so
 * it splits the declaration from the export instead:
 *
 * ```
 * const Banner = memo(function BannerUnmemoized(props: P) {...});
 * export default Banner;
 * ```
 *
 * The exported expression is then a bare identifier, and the component it
 * stands for is one hop away on a declaration carrying no `export` of its own —
 * invisible to every other visitor here.
 *
 * Following a bare identifier stays confined to the default export, where the
 * named declaration IS the component this module ships. The named form
 * `export const Banner = Other` re-exports a value whose props are the other
 * declaration's concern, and an identifier belonging to another module resolves
 * to nothing either way.
 */
function unwrapDefaultExportComponent(
  declaration: TSESTree.Node,
  resolveComponent: ComponentResolver,
): UnwrappedComponent | undefined {
  if (declaration.type !== AST_NODE_TYPES.Identifier) {
    return unwrapComponentFunction(declaration, resolveComponent);
  }

  // The exported name counts as already followed, so a declaration naming
  // itself (`const Banner = memo(Banner)`) terminates on the hop back.
  const component = unwrapComponentFunction(
    resolveComponent(declaration.name),
    resolveComponent,
    false,
    new Set([declaration.name]),
  );
  if (!component) return undefined;

  return {
    ...component,
    resolvedName: component.resolvedName ?? declaration.name,
  };
}

export const enforceExportedFunctionTypes = createRule<[], MessageIds>({
  name: 'enforce-exported-function-types',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce exporting types for function props and return values',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingExportedType:
        'Type "{{typeName}}" is used in a parameter of an exported function but is not exported. Callers cannot import the parameter contract, which forces duplicate or ad-hoc types and makes the API drift. Export the type (e.g., `export type {{typeName}} = ...`) or reuse an already exported type.',
      missingExportedReturnType:
        'Return type "{{typeName}}" belongs to an exported function but is not exported. Consumers cannot reference the returned shape for validation or composition, which leads to duplicated types and diverging contracts. Export the return type alias or interface so callers can import the shared contract.',
      missingExportedPropsType:
        'Props type "{{typeName}}" is used by an exported React component but is not exported. Other modules cannot type the props when composing the component and end up recreating the shape. Export the props type (e.g., `export type {{typeName}} = ...`) or reference an existing exported props contract.',
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

    function getTypeNames(
      node: TSESTree.TypeNode | undefined,
      typeParams?: Set<string>,
    ): string[] {
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

    /**
     * Locates the module-scope declaration of a type so the report can offer to
     * export it. Only a bare declaration in `Program.body` qualifies: anything
     * already carrying `export` is an `ExportNamedDeclaration` (and never
     * reported), while a declaration nested in a namespace or a function body
     * cannot be exported by inserting a single keyword.
     *
     * Merged declarations (repeated `interface Props`) are left alone: TypeScript
     * requires every declaration of a merged name to be exported or none of
     * them, so exporting one of several would trade a lint report for a compile
     * error.
     */
    function findExportableTypeDeclaration(
      typeName: string,
    ):
      | TSESTree.TSTypeAliasDeclaration
      | TSESTree.TSInterfaceDeclaration
      | undefined {
      const declarations = context.sourceCode.ast.body.filter(
        (
          statement,
        ): statement is
          | TSESTree.TSTypeAliasDeclaration
          | TSESTree.TSInterfaceDeclaration =>
          (statement.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
            statement.type === AST_NODE_TYPES.TSInterfaceDeclaration) &&
          statement.id.name === typeName,
      );

      return declarations.length === 1 ? declarations[0] : undefined;
    }

    function checkAndReportType(
      node: TSESTree.TypeNode,
      parentNode: TSESTree.Node,
      messageId: MessageIds,
      typeParams?: Set<string>,
    ): void {
      const typeNames = getTypeNames(node, typeParams);
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
            // The props contract is the shape consumers compose against, so its
            // remedy — exporting the local declaration — is offered as a fix.
            const declaration =
              messageId === 'missingExportedPropsType'
                ? findExportableTypeDeclaration(typeName)
                : undefined;
            context.report({
              node: parentNode,
              messageId,
              data: { typeName },
              fix: declaration
                ? (fixer) => fixer.insertTextBefore(declaration, 'export ')
                : undefined,
            });
          }
        }
      }
    }

    /**
     * Applies the props check every exported component shape shares, reusing
     * the parameter walk the `export function Banner(props: P)` visitor
     * performs so the widened shapes cannot drift from it.
     *
     * Only the first parameter carries props. `forwardRef` hands the second one
     * a ref, whose type (`Ref<HTMLDivElement>`) is no part of the contract a
     * consumer composes against, so reporting it would be noise.
     */
    function checkComponentProps(fn: ComponentFunction): void {
      const [props] = fn.params;
      if (!props) return;

      const typeParams = componentTypeParameters(fn);

      // Destructuring the props changes nothing about the contract a consumer
      // composes against, so `({ message }: BannerProps)` is read exactly like
      // `(props: BannerProps)`. The widening stays on the props path: the
      // parameter helper the other messageIds share keeps reading named
      // parameters only.
      if (props.type === AST_NODE_TYPES.ObjectPattern && props.typeAnnotation) {
        checkAndReportType(
          props.typeAnnotation.typeAnnotation,
          props.typeAnnotation,
          'missingExportedPropsType',
          typeParams,
        );
        return;
      }

      checkAndReportParameterType(
        props,
        'missingExportedPropsType',
        typeParams,
      );
    }

    /**
     * Collects the generic parameters a component may legitimately name in its
     * props annotation (`memo(function ListUnmemoized<T>(props: ListProps<T>))`),
     * which are contracts the module cannot export.
     *
     * Reading them off the function itself is what keeps the check correct for
     * the shapes it reaches indirectly: `parent` links exist only for nodes
     * ESLint has already traversed, so a component resolved through
     * `memo(ListUnmemoized)` above its declaration has no ancestor chain to walk
     * yet, and a function expression is no part of the ancestor walk to begin
     * with. The ancestors are still unioned in for a component nested inside a
     * generic function.
     */
    function componentTypeParameters(fn: ComponentFunction): Set<string> {
      const typeParams = findTypeParameters(fn);
      for (const param of fn.typeParameters?.params ?? []) {
        if (param.type === AST_NODE_TYPES.TSTypeParameter) {
          typeParams.add(param.name.name);
        }
      }
      return typeParams;
    }

    /**
     * Resolves a module-scope binding to the declaration or initializer it
     * names, which is what turns `memo(BannerUnmemoized)` into the function
     * carrying the props.
     *
     * A name with no module-scope declaration belongs to another module. Its
     * props type is declared there and cannot be exported by editing this file,
     * so an unresolved name leaves the component unchecked rather than guessing.
     */
    function findModuleScopeDeclaration(
      name: string,
    ): TSESTree.Node | undefined {
      for (const statement of context.sourceCode.ast.body) {
        const declaration =
          statement.type === AST_NODE_TYPES.ExportNamedDeclaration &&
          statement.declaration
            ? statement.declaration
            : statement;

        if (
          declaration.type === AST_NODE_TYPES.FunctionDeclaration &&
          declaration.id?.name === name
        ) {
          return declaration;
        }

        if (declaration.type === AST_NODE_TYPES.VariableDeclaration) {
          const declarator = declaration.declarations.find(
            (candidate) =>
              candidate.id.type === AST_NODE_TYPES.Identifier &&
              candidate.id.name === name,
          );
          if (declarator?.init) {
            return declarator.init;
          }
        }
      }

      return undefined;
    }

    function checkAndReportParameterType(
      param: TSESTree.Parameter,
      messageId: MessageIds,
      typeParams?: Set<string>,
    ): void {
      if (param.type === AST_NODE_TYPES.Identifier && param.typeAnnotation) {
        checkAndReportType(
          param.typeAnnotation.typeAnnotation,
          param.typeAnnotation,
          messageId,
          typeParams,
        );
      }
    }

    function isTypeExported(typeName: string): boolean {
      // If it's a built-in type, consider it as "exported"
      if (isBuiltInType(typeName)) {
        return true;
      }

      const sourceCode = context.sourceCode;
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
          // Check for export { Type } statements
          if (node.specifiers) {
            return node.specifiers.some(
              (specifier) =>
                specifier.type === AST_NODE_TYPES.ExportSpecifier &&
                specifier.local.name === typeName,
            );
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
        // Check if the type alias itself is exported
        if (parent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          return true;
        }
        // If not exported, return false
        return false;
      }

      // Handle type aliases in interface declarations
      if (parent.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        // Check if the interface itself is exported
        if (parent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          return true;
        }
        // If not exported, return false
        return false;
      }

      // Handle type aliases in variable declarations
      if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
        if (parent.parent?.type === AST_NODE_TYPES.VariableDeclaration) {
          if (
            parent.parent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration
          ) {
            return true;
          }
        }
      }

      // Handle type aliases in type declarations
      if (parent.type === AST_NODE_TYPES.Identifier) {
        if (parent.parent?.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
          // Check if the type alias itself is exported
          if (
            parent.parent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration
          ) {
            return true;
          }
          // If not exported, return false
          return false;
        }
      }

      // Handle type aliases in type declarations
      if (def.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
        // Check if the type alias itself is exported
        if (def.node.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          return true;
        }
        // If not exported, return false
        return false;
      }

      return false;
    }

    return {
      FunctionDeclaration(node) {
        if (!isExported(node)) return;

        // A component declaration takes the props path, which reads the first
        // parameter however it is spelled. Routing it through the same helper
        // as the expression and wrapper shapes is what keeps a destructured
        // parameter from being visible in one shape and invisible in another.
        if (node.id?.name && isComponentName(node.id.name)) {
          checkComponentProps(node);
          return;
        }

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
          checkAndReportParameterType(param, 'missingExportedType');
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
          checkAndReportParameterType(param, 'missingExportedType');
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

      // Handle exported components written as an expression:
      // `export const Banner = (props: P) => ...`,
      // `export const Banner = function (props: P) {...}`, any
      // `memo`/`forwardRef` nesting around either form, and the wrappers whose
      // argument names a same-file function (`memo(BannerUnmemoized)`).
      VariableDeclarator(node) {
        if (
          node.id.type !== AST_NODE_TYPES.Identifier ||
          !isComponentName(node.id.name) ||
          !isExported(node.parent)
        ) {
          return;
        }

        const component = unwrapComponentFunction(
          node.init,
          findModuleScopeDeclaration,
        );
        if (!component) return;

        checkComponentProps(component.fn);
      },

      // `export default memo(function Banner(props: P) {...})` mirrors the
      // `export default function Banner(props: P)` form the declaration
      // visitors already cover, as does `export default Banner` naming either
      // of them on a separate declaration.
      ExportDefaultDeclaration(node) {
        const component = unwrapDefaultExportComponent(
          node.declaration,
          findModuleScopeDeclaration,
        );
        if (!component) return;

        // The binding a wrapper argument named outranks the inner function's
        // own name: `export default memo(BannerUnmemoized)` is the component
        // consumers see, whatever the resolved expression calls itself.
        const name = component.resolvedName ?? component.fn.id?.name;
        // An anonymous default export is only recognizable as a component
        // through its wrapper, since there is no name to inspect.
        const isComponent =
          name === undefined ? component.isWrapped : isComponentName(name);
        if (!isComponent) return;

        checkComponentProps(component.fn);
      },
    };
  },
});
