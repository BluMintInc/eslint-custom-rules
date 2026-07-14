import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';

type MessageIds = 'missingPropsComposition';

type Options = [
  {
    targetPaths?: string[];
    excludeComponents?: string[];
    minDependencyCount?: number;
    requireAllDependencies?: boolean;
  },
];

const DEFAULT_EXCLUDED_COMPONENTS = new Set([
  'Box',
  'Stack',
  'Typography',
  'Fragment',
  'Divider',
  'Container',
  'Grid',
  'Paper',
  'Card',
  'CardContent',
  'CardHeader',
  'CardActions',
  'List',
  'ListItem',
  'Table',
  'TableBody',
  'TableCell',
  'TableHead',
  'TableRow',
  'Toolbar',
  'AppBar',
  'Drawer',
  'Modal',
  'Backdrop',
  'Collapse',
  'Fade',
  'Grow',
  'Slide',
  'Zoom',
  'CircularProgress',
  'LinearProgress',
  'Skeleton',
  'Suspense',
  'StrictMode',
  'Profiler',
  'ErrorBoundary',
  'React.Fragment',
  'React.Suspense',
  'React.StrictMode',
]);

const DEFAULT_TARGET_PATHS = ['src/components/**/*.tsx'];

/**
 * Icon components (e.g. CheckIcon, RefreshIcon from @mui/icons-material) are
 * decorative leaf elements — the same category as the layout/decorative
 * primitives in DEFAULT_EXCLUDED_COMPONENTS. They expose no composable
 * customization surface a parent should re-expose, so rendering one is never a
 * composition dependency. Matched by the conventional `*Icon` suffix, which
 * excludes CheckIcon/LinkIcon/RefreshIcon without touching interactive
 * components like IconButton (issue #1307).
 */
function isDecorativeIcon(name: string): boolean {
  return /Icon$/.test(name);
}

/**
 * Derives the expected Props type name for a JSX element name.
 * e.g. "LoadingButton" → "LoadingButtonProps"
 */
function toPropsTypeName(componentName: string): string {
  return `${componentName}Props`;
}

/**
 * Returns true if the given TSTypeReference node references XProps via Pick or
 * Omit (including nested inside Readonly<...>).
 */
function typeReferenceContainsPickOrOmit(
  node: TSESTree.TSTypeReference,
  propsTypeName: string,
): boolean {
  const name = getTypeReferenceName(node);

  if (name === 'Pick' || name === 'Omit') {
    // First type argument should be the target props type
    const params = node.typeParameters?.params;
    if (params && params.length >= 1) {
      const firstParam = params[0];
      if (firstParam.type === AST_NODE_TYPES.TSTypeReference) {
        const refName = getTypeReferenceName(firstParam);
        if (refName === propsTypeName) {
          return true;
        }
      }
    }
  }

  if (name === 'Readonly') {
    // Unwrap Readonly<...> and recurse
    const params = node.typeParameters?.params;
    if (params && params.length === 1) {
      const inner = params[0];
      if (inner.type === AST_NODE_TYPES.TSTypeReference) {
        return typeReferenceContainsPickOrOmit(inner, propsTypeName);
      }
    }
  }

  return false;
}

/**
 * Returns the identifier name of a TSTypeReference node.
 */
function getTypeReferenceName(node: TSESTree.TSTypeReference): string {
  const typeName = node.typeName;
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return typeName.name;
  }
  if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
    // e.g. React.Fragment
    return `${
      typeName.left.type === AST_NODE_TYPES.Identifier ? typeName.left.name : ''
    }.${typeName.right.name}`;
  }
  return '';
}

/**
 * Recursively check if a TS type node composes with the given propsTypeName
 * via Pick/Omit (at any level of intersection / Readonly wrapping, or nested
 * in a TSTypeLiteral property's type annotation).
 */
function typeNodeComposesWithProps(
  typeNode: TSESTree.TypeNode,
  propsTypeName: string,
): boolean {
  switch (typeNode.type) {
    case AST_NODE_TYPES.TSTypeReference: {
      if (typeReferenceContainsPickOrOmit(typeNode, propsTypeName)) {
        return true;
      }
      // Also recurse into type params (e.g. Readonly<Pick<XProps, ...>>)
      if (typeNode.typeParameters) {
        for (const param of typeNode.typeParameters.params) {
          if (typeNodeComposesWithProps(param, propsTypeName)) {
            return true;
          }
        }
      }
      return false;
    }
    case AST_NODE_TYPES.TSIntersectionType: {
      // Check each member of an intersection (A & B & C)
      return typeNode.types.some((t) =>
        typeNodeComposesWithProps(t, propsTypeName),
      );
    }
    case AST_NODE_TYPES.TSUnionType: {
      // Check each member of a union — for union types, at least one member composes
      return typeNode.types.some((t) =>
        typeNodeComposesWithProps(t, propsTypeName),
      );
    }
    case AST_NODE_TYPES.TSTypeLiteral: {
      // Check property signatures for nested composition
      // e.g. { iconProps?: Omit<GradientIconButtonProps, 'IconComponent'> }
      return typeNode.members.some((member) => {
        if (
          member.type === AST_NODE_TYPES.TSPropertySignature &&
          member.typeAnnotation
        ) {
          return typeNodeComposesWithProps(
            member.typeAnnotation.typeAnnotation,
            propsTypeName,
          );
        }
        return false;
      });
    }
    default:
      return false;
  }
}

/**
 * Collect all capitalized JSX element names used in a component's function
 * body (handles all JSX regardless of nesting depth / conditional branches).
 */
function collectJsxElementNames(node: TSESTree.Node): Set<string> {
  const names = new Set<string>();

  function visit(n: TSESTree.Node | null | undefined): void {
    if (!n || typeof n !== 'object') return;

    if (
      n.type === AST_NODE_TYPES.JSXOpeningElement &&
      n.name.type === AST_NODE_TYPES.JSXIdentifier
    ) {
      const name = n.name.name;
      // Only custom components — starts with uppercase
      if (/^[A-Z]/.test(name)) {
        names.add(name);
      }
    }

    // Traverse all child nodes
    for (const key of Object.keys(n)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (n as any)[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in item) {
            visit(item as TSESTree.Node);
          }
        }
      } else if (child && typeof child === 'object' && 'type' in child) {
        visit(child as TSESTree.Node);
      }
    }
  }

  visit(node);
  return names;
}

/**
 * Find the Props type alias node that corresponds to a component by name.
 * Looks for `type <ComponentName>Props = ...` in the program body.
 */
function findPropsTypeAlias(
  program: TSESTree.Program,
  componentName: string,
): TSESTree.TSTypeAliasDeclaration | null {
  const expectedTypeName = toPropsTypeName(componentName);

  for (const stmt of program.body) {
    // type XProps = ...
    if (
      stmt.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
      stmt.id.name === expectedTypeName
    ) {
      return stmt;
    }
    // export type XProps = ...
    if (
      stmt.type === AST_NODE_TYPES.ExportNamedDeclaration &&
      stmt.declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
      stmt.declaration.id.name === expectedTypeName
    ) {
      return stmt.declaration;
    }
  }
  return null;
}

/**
 * Given a component function node, find the props parameter type annotation
 * and return the type alias name if it points to one. This handles patterns
 * like `const Foo = ({ a }: FooProps) => ...`.
 */
function getPropsTypeNameFromParam(
  funcNode:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
): string | null {
  const firstParam = funcNode.params[0];
  if (!firstParam) return null;

  let typeAnnotation: TSESTree.TypeNode | null = null;

  if (
    firstParam.type === AST_NODE_TYPES.Identifier &&
    firstParam.typeAnnotation
  ) {
    typeAnnotation = firstParam.typeAnnotation.typeAnnotation;
  } else if (
    firstParam.type === AST_NODE_TYPES.ObjectPattern &&
    firstParam.typeAnnotation
  ) {
    typeAnnotation = firstParam.typeAnnotation.typeAnnotation;
  } else if (firstParam.type === AST_NODE_TYPES.RestElement) {
    return null;
  }

  if (
    typeAnnotation &&
    typeAnnotation.type === AST_NODE_TYPES.TSTypeReference
  ) {
    const name = getTypeReferenceName(typeAnnotation);
    // Strip Readonly wrapper if present
    if (name === 'Readonly' && typeAnnotation.typeParameters?.params[0]) {
      const inner = typeAnnotation.typeParameters.params[0];
      if (inner.type === AST_NODE_TYPES.TSTypeReference) {
        return getTypeReferenceName(inner);
      }
    }
    return name;
  }

  return null;
}

type ComponentFunction =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

/**
 * Returns the first-parameter type annotation node of a component function, or
 * null when the parameter is untyped or a rest element. Unlike
 * getPropsTypeNameFromParam, this returns the raw TypeNode (e.g. the whole
 * `Omit<ParentProps, 'children'>`) so it can be tested for composition.
 */
function getFirstParamTypeNode(
  funcNode: ComponentFunction,
): TSESTree.TypeNode | null {
  const firstParam = funcNode.params[0];
  if (!firstParam) return null;
  if (
    (firstParam.type === AST_NODE_TYPES.Identifier ||
      firstParam.type === AST_NODE_TYPES.ObjectPattern) &&
    firstParam.typeAnnotation
  ) {
    return firstParam.typeAnnotation.typeAnnotation;
  }
  return null;
}

/**
 * Resolve the function node for a component name in the program, following a
 * single-identifier alias (`const Live = LiveUnmemoized`) and unwrapping a HOC
 * call (`memo((props) => ...)`). Returns null when no function is found. The
 * `seen` set guards against alias cycles.
 */
function findComponentFunction(
  program: TSESTree.Program,
  name: string,
  seen: Set<string> = new Set<string>(),
): ComponentFunction | null {
  if (seen.has(name)) return null;
  seen.add(name);

  for (const stmt of program.body) {
    const decl =
      stmt.type === AST_NODE_TYPES.ExportNamedDeclaration
        ? stmt.declaration
        : stmt;
    if (!decl) continue;

    if (
      decl.type === AST_NODE_TYPES.FunctionDeclaration &&
      decl.id?.name === name
    ) {
      return decl;
    }

    if (decl.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of decl.declarations) {
        if (
          declarator.id.type !== AST_NODE_TYPES.Identifier ||
          declarator.id.name !== name ||
          !declarator.init
        ) {
          continue;
        }
        const init = declarator.init;
        if (
          init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          init.type === AST_NODE_TYPES.FunctionExpression
        ) {
          return init;
        }
        if (init.type === AST_NODE_TYPES.CallExpression) {
          const arg0 = init.arguments[0];
          if (
            arg0 &&
            (arg0.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              arg0.type === AST_NODE_TYPES.FunctionExpression)
          ) {
            return arg0;
          }
        }
        if (init.type === AST_NODE_TYPES.Identifier) {
          return findComponentFunction(program, init.name, seen);
        }
      }
    }
  }
  return null;
}

/**
 * Resolve the type node that defines a rendered dependency's props: its
 * `{Dep}Props` alias if one exists, otherwise the dependency component's
 * first-parameter type annotation. Used to detect inverse composition, where
 * the child derives its props from the parent's props type.
 */
function getDependencyPropsSourceType(
  program: TSESTree.Program,
  depName: string,
): TSESTree.TypeNode | null {
  const alias = findPropsTypeAliasByName(program, toPropsTypeName(depName));
  if (alias) {
    return alias.typeAnnotation;
  }
  const fn = findComponentFunction(program, depName);
  if (fn) {
    return getFirstParamTypeNode(fn);
  }
  return null;
}

export const requirePropsComposition = createRule<Options, MessageIds>({
  name: 'require-props-composition',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require React component Props types to compose (via Pick/Omit) with the props types of non-leaf child components rendered in JSX',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          targetPaths: {
            type: 'array',
            items: { type: 'string' },
          },
          excludeComponents: {
            type: 'array',
            items: { type: 'string' },
          },
          minDependencyCount: {
            type: 'number',
            minimum: 1,
          },
          requireAllDependencies: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingPropsComposition:
        "Component '{{componentName}}' renders {{dependencyList}} but '{{propsTypeName}}' does not compose with {{missingList}} via Pick<...> or Omit<...>. Consider: type {{propsTypeName}} = Omit<{{primaryDep}}, 'overriddenProp'> & { /* your props */ };",
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const targetPaths = options?.targetPaths ?? DEFAULT_TARGET_PATHS;
    const excludeComponents = new Set([
      ...DEFAULT_EXCLUDED_COMPONENTS,
      ...(options?.excludeComponents ?? []),
    ]);
    const minDependencyCount = options?.minDependencyCount ?? 1;
    const requireAllDependencies = options?.requireAllDependencies ?? false;

    // Check whether the current file matches any of the targetPaths globs.
    // `getFilename()` returns an absolute, platform-native path, but the globs
    // are repo-relative (`src/components/**`), so a raw minimatch never matches
    // an absolute path — on any platform. Normalize backslashes, then match each
    // pattern against both the full path and the repo-relative slice (from
    // `/src/`) so absolute POSIX and Windows paths both resolve (issue #1268).
    const filename = context.getFilename().replace(/\\/g, '/');
    const matchesTargetPath = targetPaths.some((pattern) => {
      if (minimatch(filename, pattern, { matchBase: false })) {
        return true;
      }
      const srcIdx = filename.indexOf('/src/');
      return (
        srcIdx !== -1 &&
        minimatch(filename.slice(srcIdx + 1), pattern, { matchBase: false })
      );
    });
    if (!matchesTargetPath) {
      return {};
    }

    return {
      // Arrow function component: const MyComponent = (...) => ...
      VariableDeclaration(node) {
        for (const declarator of node.declarations) {
          if (
            declarator.id.type !== AST_NODE_TYPES.Identifier ||
            !declarator.init
          ) {
            continue;
          }

          const componentName = declarator.id.name;

          // Must start with uppercase to be a component
          if (!/^[A-Z]/.test(componentName)) continue;

          let funcNode:
            | TSESTree.ArrowFunctionExpression
            | TSESTree.FunctionExpression
            | null = null;

          if (
            declarator.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            declarator.init.type === AST_NODE_TYPES.FunctionExpression
          ) {
            funcNode = declarator.init;
          } else if (
            // memo((...) => ...)
            declarator.init.type === AST_NODE_TYPES.CallExpression
          ) {
            const call = declarator.init;
            const arg0 = call.arguments[0];
            if (
              arg0 &&
              (arg0.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                arg0.type === AST_NODE_TYPES.FunctionExpression)
            ) {
              funcNode = arg0;
            }
          }

          if (!funcNode) continue;

          // Get the program node from the ancestors
          const ancestors = context.getAncestors();
          const prog = ancestors[0] as TSESTree.Program;

          checkComponentWithProgram(
            componentName,
            funcNode,
            declarator.id,
            prog,
          );
        }
      },

      // Function declaration component: function MyComponent(...) { ... }
      FunctionDeclaration(node) {
        if (!node.id || !/^[A-Z]/.test(node.id.name)) return;
        const componentName = node.id.name;
        const ancestors = context.getAncestors();
        const prog = ancestors[0] as TSESTree.Program;
        checkComponentWithProgram(componentName, node, node.id, prog);
      },
    };

    function checkComponentWithProgram(
      componentName: string,
      funcNode:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration,
      reportNode: TSESTree.Node,
      prog: TSESTree.Program,
    ): void {
      // Collect all JSX element names used in the component body
      const body = funcNode.body ?? funcNode;
      const allJsxNames = collectJsxElementNames(body);

      // Filter to non-excluded custom components
      const depComponents = Array.from(allJsxNames).filter(
        (name) =>
          !excludeComponents.has(name) &&
          !isDecorativeIcon(name) &&
          name !== componentName,
      );

      if (depComponents.length < minDependencyCount) {
        return;
      }

      // Resolve the props type for this component
      const propsTypeAlias = findPropsTypeAlias(prog, componentName);

      let propsTypeName: string | null = null;
      let propsTypeNode: TSESTree.TypeNode | null = null;

      if (propsTypeAlias) {
        propsTypeName = propsTypeAlias.id.name;
        propsTypeNode = propsTypeAlias.typeAnnotation;
      } else {
        // Fall back to inline parameter annotation
        const paramTypeName = getPropsTypeNameFromParam(funcNode);
        if (!paramTypeName) {
          // No props type at all — skip per spec
          return;
        }
        propsTypeName = paramTypeName;
        // Try to find this type alias in the program too
        const resolved = findPropsTypeAliasByName(prog, paramTypeName);
        if (resolved) {
          propsTypeNode = resolved.typeAnnotation;
        }
      }

      // No props type resolvable — skip
      if (!propsTypeNode) {
        return;
      }

      const composedWith = new Set<string>();
      const missingComposition: string[] = [];

      for (const dep of depComponents) {
        const expectedPropsType = toPropsTypeName(dep);
        let composes = typeNodeComposesWithProps(
          propsTypeNode,
          expectedPropsType,
        );
        // Inverse composition: the child derives its props FROM this parent's
        // props type (e.g. `Omit<ParentProps, 'children'>`, often with no named
        // ChildProps at all). The parent is then the single shared source of
        // truth, so the DRY guarantee is already met; requiring the parent to
        // *also* compose from ChildProps would invert the source of truth or
        // create a circular dependency.
        if (!composes && propsTypeName) {
          const depPropsSource = getDependencyPropsSourceType(prog, dep);
          if (
            depPropsSource &&
            typeNodeComposesWithProps(depPropsSource, propsTypeName)
          ) {
            composes = true;
          }
        }
        if (composes) {
          composedWith.add(dep);
        } else {
          missingComposition.push(dep);
        }
      }

      if (!requireAllDependencies) {
        // Only flag when NO dependency has composition
        if (composedWith.size > 0) {
          return;
        }
      } else {
        // Flag when ANY dependency is missing composition
        if (missingComposition.length === 0) {
          return;
        }
      }

      const flaggedDeps = requireAllDependencies
        ? missingComposition
        : depComponents;

      if (flaggedDeps.length === 0) return;

      context.report({
        node: reportNode,
        messageId: 'missingPropsComposition',
        data: {
          componentName,
          propsTypeName: propsTypeName ?? `${componentName}Props`,
          dependencyList: depComponents.map((d) => `'${d}'`).join(', '),
          missingList: flaggedDeps
            .map((d) => `'${toPropsTypeName(d)}'`)
            .join(', '),
          primaryDep: toPropsTypeName(flaggedDeps[0]),
        },
      });
    }
  },
});

/**
 * Find a type alias by name anywhere in the program body (exported or not).
 */
function findPropsTypeAliasByName(
  program: TSESTree.Program,
  typeName: string,
): TSESTree.TSTypeAliasDeclaration | null {
  for (const stmt of program.body) {
    if (
      stmt.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
      stmt.id.name === typeName
    ) {
      return stmt;
    }
    if (
      stmt.type === AST_NODE_TYPES.ExportNamedDeclaration &&
      stmt.declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
      stmt.declaration.id.name === typeName
    ) {
      return stmt.declaration;
    }
  }
  return null;
}
