import fs from 'fs';
import path from 'path';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';
import {
  BOUND_UNPROVABLE,
  declarationOf,
  resolveInEnclosingScopes,
  resolveNameInEnclosingScopes,
  ScopeMatch,
} from '../utils/lexicalScope';

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
 * via Pick/Omit (at any level of intersection / Readonly wrapping, union arm,
 * array or tuple element, named-alias indirection, or nested in a TSTypeLiteral
 * property's type annotation).
 *
 * `scope` (when supplied) is the node the alias lookup walks outward from, which
 * enables resolving a locally-declared named type alias to its definition, so
 * composition can be seen through named union arms and shared bases.
 * `seenAliases` guards against recursive-alias cycles; each descent *through* an
 * alias extends a copy of the set so that sibling paths (e.g. two union arms
 * sharing a base) each resolve the shared alias independently.
 */
function typeNodeComposesWithProps(
  typeNode: TSESTree.TypeNode,
  propsTypeName: string,
  scope?: TSESTree.Node,
  seenAliases: Set<string> = new Set<string>(),
): boolean {
  switch (typeNode.type) {
    case AST_NODE_TYPES.TSTypeReference: {
      // A direct reference to the child's whole props type (bare `ChildProps`
      // or generic-instantiated `ChildProps<T>`) is the maximal form of
      // composition: the entire surface is inherited verbatim, strictly
      // stronger than Pick/Omit, so no duplication/drift is possible.
      if (getTypeReferenceName(typeNode) === propsTypeName) {
        return true;
      }
      if (typeReferenceContainsPickOrOmit(typeNode, propsTypeName)) {
        return true;
      }
      // Also recurse into type params (e.g. Readonly<Pick<XProps, ...>>)
      if (typeNode.typeParameters) {
        for (const param of typeNode.typeParameters.params) {
          if (
            typeNodeComposesWithProps(param, propsTypeName, scope, seenAliases)
          ) {
            return true;
          }
        }
      }
      // Resolve a locally-declared named type alias to its definition and
      // recurse. This lets composition be seen through named union arms and
      // shared bases (issue #1343): `RowActionableProps` → `RowBaseProps & {…}`
      // → `Pick<MenuItemProps, …>`. Only in-file aliases resolve; imported
      // names (e.g. MenuItemProps) return null and are left as-is.
      if (scope) {
        const aliasName = getTypeReferenceName(typeNode);
        if (aliasName && !seenAliases.has(aliasName)) {
          const alias = findPropsTypeAliasByName(scope, aliasName);
          if (alias) {
            const nextSeen = new Set(seenAliases);
            nextSeen.add(aliasName);
            if (
              typeNodeComposesWithProps(
                alias.typeAnnotation,
                propsTypeName,
                scope,
                nextSeen,
              )
            ) {
              return true;
            }
          }
        }
      }
      return false;
    }
    case AST_NODE_TYPES.TSIntersectionType: {
      // Check each member of an intersection (A & B & C) — the whole
      // intersection composes if any member does.
      return typeNode.types.some((t) =>
        typeNodeComposesWithProps(t, propsTypeName, scope, seenAliases),
      );
    }
    case AST_NODE_TYPES.TSUnionType: {
      // A union (A | B) composes if ANY arm composes. `.some` (not `.every`) is
      // deliberate: a discriminated union commonly renders a *different* child
      // per arm (issue #1343's EditableBoolean: `Omit<SwitchProps>` on one arm,
      // `Omit<CheckboxProps>` on the other). Requiring every arm to compose with
      // every rendered child would flag that legitimate pattern — a false
      // positive the repo prefers to avoid. `.some` still passes the target
      // case, where every arm composes with the single shared child.
      return typeNode.types.some((t) =>
        typeNodeComposesWithProps(t, propsTypeName, scope, seenAliases),
      );
    }
    case AST_NODE_TYPES.TSArrayType: {
      // A list renderer's composition lives in the ELEMENT type: a parent
      // declaring `buttons: readonly ActionButtonProps[]` and spreading one
      // element onto each child forwards the child's ENTIRE prop object, which
      // is the same DRY guarantee a direct `Pick`/`Omit` prop gives — the
      // composition is simply one level of indirection away, inside the array.
      // The child's contract belongs to the element type there, so demanding a
      // whole-props Pick/Omit on the parent would name a composition a list
      // renderer must not have (issue #2038). This is the array analogue of the
      // union-arm unwrapping issue #1343 established.
      return typeNodeComposesWithProps(
        typeNode.elementType,
        propsTypeName,
        scope,
        seenAliases,
      );
    }
    case AST_NODE_TYPES.TSTupleType: {
      // A tuple is a fixed-length list, and each slot is handed to a child
      // exactly as an array element is, so any slot that composes composes.
      return typeNode.elementTypes.some((element) =>
        typeNodeComposesWithProps(element, propsTypeName, scope, seenAliases),
      );
    }
    case AST_NODE_TYPES.TSNamedTupleMember: {
      // A tuple slot's label names the slot, never its surface.
      return typeNodeComposesWithProps(
        typeNode.elementType,
        propsTypeName,
        scope,
        seenAliases,
      );
    }
    case AST_NODE_TYPES.TSOptionalType:
    case AST_NODE_TYPES.TSRestType: {
      // `?` and `...` govern how many slots a tuple carries, not what a slot
      // carries, so the decorated type is the surface to test.
      return typeNodeComposesWithProps(
        typeNode.typeAnnotation,
        propsTypeName,
        scope,
        seenAliases,
      );
    }
    case AST_NODE_TYPES.TSTypeOperator: {
      // `readonly T[]` describes the same prop surface as `T[]`: the modifier
      // constrains mutation of the container, never the shape of its elements.
      //
      // Only `readonly` unwraps. `keyof ChildProps` is the child's KEY union — a
      // set of strings that hands the child nothing — and `unique symbol` is a
      // nominal token, so crediting either would let a parent that merely names
      // the child's keys pass as composing with its props.
      if (typeNode.operator !== 'readonly' || !typeNode.typeAnnotation) {
        return false;
      }
      return typeNodeComposesWithProps(
        typeNode.typeAnnotation,
        propsTypeName,
        scope,
        seenAliases,
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
            scope,
            seenAliases,
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
 * The function a capitalized `const` declaration binds — a component declared
 * inside the region being scanned. Recognizes the `memo(...)` wrapper the
 * repo's memoization rules push components into.
 */
function componentFunctionOfDeclarator(
  node: TSESTree.Node,
): TSESTree.Node | null {
  if (node.type !== AST_NODE_TYPES.VariableDeclarator) return null;
  if (
    node.id.type !== AST_NODE_TYPES.Identifier ||
    !/^[A-Z]/.test(node.id.name)
  ) {
    return null;
  }
  if (!node.init) return null;
  // A whole optional chain arrives wrapped, so `memo?.(...)` reads as a
  // ChainExpression rather than the CallExpression below. Without the unwrap
  // the nullish spelling of a nested component would slip past the boundary —
  // a barrier that silently does not apply is worse than none.
  const init =
    node.init.type === AST_NODE_TYPES.ChainExpression
      ? node.init.expression
      : node.init;
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
  return null;
}

/**
 * A `function Inner() { ... }` component declared inside the region being
 * scanned — the statement spelling of `componentFunctionOfDeclarator`.
 */
function isComponentFunctionDeclaration(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration &&
    !!node.id &&
    /^[A-Z]/.test(node.id.name)
  );
}

/**
 * Collect all capitalized JSX element names a component renders itself
 * (handles all JSX regardless of nesting depth / conditional branches).
 *
 * The walk ends at a component DECLARED inside the region: that component's JSX
 * is its own render output, checked when the rule visits that declaration, so
 * crediting it to the enclosing component demands composition with a child the
 * enclosing component never renders — while the identical code with the inner
 * component hoisted to module scope stays silent (issue #2182). The boundary is
 * a capitalized declaration rather than any function, because an anonymous
 * callback (`items.map((i) => <Child />)`) binds no component and IS the
 * enclosing component's own output.
 */
function collectJsxElementNames(node: TSESTree.Node): Set<string> {
  const names = new Set<string>();

  // The node handed to the walk is the component under check, so its own
  // function is never a boundary; only a declaration met while descending is.
  // Membership rather than a parent-child check, because a wrapper puts the
  // function several levels below the declarator that names it
  // (`const Inner = memo(() => ...)`).
  const boundaries = new Set<TSESTree.Node>();

  function visitChild(child: TSESTree.Node): void {
    if (boundaries.has(child) || isComponentFunctionDeclaration(child)) {
      return;
    }
    visit(child);
  }

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

    const nestedComponent = componentFunctionOfDeclarator(n);
    if (nestedComponent) {
      boundaries.add(nestedComponent);
    }

    // Traverse all child nodes
    for (const key of Object.keys(n)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (n as any)[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in item) {
            visitChild(item as TSESTree.Node);
          }
        }
      } else if (child && typeof child === 'object' && 'type' in child) {
        visitChild(child as TSESTree.Node);
      }
    }
  }

  visit(node);
  return names;
}

/**
 * Collect the capitalized binding names introduced by a destructuring pattern,
 * following renames (`{ Slot: Renderer }`), defaults (`{ Slot = Fallback }`)
 * and nesting (`{ slots: { Item } }`).
 */
function collectPatternBindings(
  pattern: TSESTree.Node,
  into: Set<string>,
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      if (/^[A-Z]/.test(pattern.name)) {
        into.add(pattern.name);
      }
      break;
    case AST_NODE_TYPES.ObjectPattern:
      for (const property of pattern.properties) {
        if (property.type === AST_NODE_TYPES.Property) {
          collectPatternBindings(property.value, into);
        }
        // A `...rest` element rebinds the remaining props under a single
        // lowercase-by-convention name; it introduces no component slot.
      }
      break;
    case AST_NODE_TYPES.AssignmentPattern:
      collectPatternBindings(pattern.left, into);
      break;
    default:
      break;
  }
}

/**
 * Every binding name a destructuring pattern introduces, capitalized or not,
 * the `...rest` element included. A lowercase binding names no component slot,
 * but it still HOLDS props, so a slot destructured out of it one hop later is
 * caller-injected all the same — which is why the carve-out follows `rest`
 * without ever treating `rest` itself as a slot (issue #2184).
 */
function collectPatternBindingNames(
  pattern: TSESTree.Node,
  into: Set<string>,
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      into.add(pattern.name);
      break;
    case AST_NODE_TYPES.ObjectPattern:
      for (const property of pattern.properties) {
        collectPatternBindingNames(
          property.type === AST_NODE_TYPES.Property
            ? property.value
            : property.argument,
          into,
        );
      }
      break;
    case AST_NODE_TYPES.ArrayPattern:
      for (const element of pattern.elements) {
        if (element) collectPatternBindingNames(element, into);
      }
      break;
    case AST_NODE_TYPES.AssignmentPattern:
      collectPatternBindingNames(pattern.left, into);
      break;
    case AST_NODE_TYPES.RestElement:
      collectPatternBindingNames(pattern.argument, into);
      break;
    default:
      break;
  }
}

/**
 * Whether an initializer reads out of a name that holds props. Only the
 * spellings that preserve the reference are followed — a member access
 * (`props.slots`) and the type-level wrappers that erase to nothing — so a
 * value produced by a call or an object literal is never mistaken for a
 * caller-injected slot.
 */
function isPropsRootedExpression(
  node: TSESTree.Node,
  roots: Set<string>,
): boolean {
  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
      return roots.has(node.name);
    case AST_NODE_TYPES.MemberExpression:
      return isPropsRootedExpression(node.object, roots);
    // `props?.slots` reaches the same value as `props.slots`, and an exemption
    // the nullish spelling withdraws is a false positive keyed on punctuation.
    case AST_NODE_TYPES.ChainExpression:
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
      return isPropsRootedExpression(node.expression, roots);
    default:
      return false;
  }
}

/**
 * Names of JSX elements that resolve to one of the component's own props — a
 * rendering strategy injected by the caller (`ViewComponent: ComponentType<T>`)
 * rather than a fixed child.
 *
 * A props-parameter binding shadows every import, so such an element is not a
 * dependency the parent can compose with: the concrete component is chosen per
 * call site and the slot's accepted props are already constrained by the prop's
 * own type annotation. Demanding `<Slot>Props` composition names a type that
 * exists nowhere.
 */
function collectPropSlotNames(
  funcNode:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
): Set<string> {
  const slots = new Set<string>();
  const rawParam = funcNode.params[0];
  if (!rawParam) return slots;

  // `({ Slot }: Props = {})` hands the walk the default rather than the
  // pattern. The binding is the same either way, so the parameter is unwrapped
  // exactly as collectPatternBindings unwraps a defaulted property one level
  // in (issue #2181).
  const propsParam =
    rawParam.type === AST_NODE_TYPES.AssignmentPattern
      ? rawParam.left
      : rawParam;

  // Names holding the props object or a slice of it. The parameter seeds the
  // set; the body scan grows it one binding at a time.
  const propsRoots = new Set<string>();

  if (propsParam.type === AST_NODE_TYPES.Identifier) {
    propsRoots.add(propsParam.name);
  } else if (propsParam.type === AST_NODE_TYPES.ObjectPattern) {
    collectPatternBindings(propsParam, slots);
    collectPatternBindingNames(propsParam, propsRoots);
  } else {
    return slots;
  }

  // The body scan runs on BOTH parameter spellings: a slot reached through an
  // intermediate binding (`({ slots }) => { const { Slot } = slots; }`) is
  // chosen by the caller exactly as one destructured straight off the
  // parameter is, so the signature arm cannot return before the body is read
  // (issue #2184). Following the chain needs a fixed point rather than a
  // single hop, because a binding may be read before the walk reaches the
  // declaration that made it props-rooted.
  function visit(node: TSESTree.Node | null | undefined): boolean {
    if (!node || typeof node !== 'object') return false;
    let grew = false;

    if (
      node.type === AST_NODE_TYPES.VariableDeclarator &&
      node.init &&
      isPropsRootedExpression(node.init, propsRoots)
    ) {
      if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
        collectPatternBindings(node.id, slots);
      } else if (
        node.id.type === AST_NODE_TYPES.Identifier &&
        /^[A-Z]/.test(node.id.name)
      ) {
        slots.add(node.id.name);
      }
      const rootCount = propsRoots.size;
      collectPatternBindingNames(node.id, propsRoots);
      grew = propsRoots.size !== rootCount;
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in item) {
            grew = visit(item as TSESTree.Node) || grew;
          }
        }
      } else if (child && typeof child === 'object' && 'type' in child) {
        grew = visit(child as TSESTree.Node) || grew;
      }
    }

    return grew;
  }

  // Terminates because propsRoots only ever grows, bounded by the bindings the
  // body declares.
  while (visit(funcNode.body)) {
    // Another pass: a name learned late re-arms the declarations above it.
  }
  return slots;
}

/**
 * Find the Props type alias node that corresponds to a component by name.
 * Looks for `type <ComponentName>Props = ...` in `scope`'s lexical chain.
 */
function findPropsTypeAlias(
  scope: TSESTree.Node,
  componentName: string,
): TSESTree.TSTypeAliasDeclaration | null {
  return findPropsTypeAliasByName(scope, toPropsTypeName(componentName));
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
 * The only wrappers that hand a component's props surface through unchanged, so
 * the parameter list of the wrapped function still describes the binding's
 * props. Every other call — `lazy`, `dynamic`, `styled(Box)`, `connect(...)()`,
 * any `withX` — either forwards a *different* component's props or injects its
 * own, so its argument proves nothing about the exported binding.
 */
const PROPS_PRESERVING_HOCS = new Set(['memo', 'forwardRef', 'observer']);

/**
 * Matches both the bare (`memo(...)`) and React-qualified (`React.memo(...)`)
 * callee forms. A computed or deeper member expression, and a callee that is
 * itself a call (`connect(mapState)(...)`, `styled(Box)(...)`), never match.
 */
function isPropsPreservingHocCallee(
  callee: TSESTree.LeftHandSideExpression,
): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return PROPS_PRESERVING_HOCS.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'React' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    PROPS_PRESERVING_HOCS.has(callee.property.name)
  );
}

type ComponentFunctionLookup = {
  /** Guards against alias cycles (`const A = B; const B = A`). */
  seen?: Set<string>;
  /**
   * Restricts call unwrapping to PROPS_PRESERVING_HOCS. Set on the
   * zero-parameter *proof* path, where unwrapping an arbitrary call would let an
   * incidental zero-argument callback (a `lazy`/`dynamic` loader, a `styled`
   * style callback) masquerade as the component and silently drop a child that
   * really takes props (issue #1316). Left off for props-type resolution, where
   * a best-effort look inside any wrapper only ever finds *more* composition.
   */
  propsPreservingHocsOnly?: boolean;
};

/**
 * A statement list either binds the name or it does not, and the two must not be
 * conflated: `undefined` means "not declared here, keep walking outward", while
 * a `declared` result ends the search even when it proves no function.
 *
 * A name bound to something unprovable — `const Spinner = lazy(…)` under the
 * zero-parameter proof — has to STOP the walk, which is what `BOUND_UNPROVABLE`
 * says. Letting it fall through would let an outer, unrelated `Spinner` answer
 * for the inner binding the JSX actually resolves to, which is precisely the
 * masquerade the zero-parameter proof exists to prevent (issue #1316).
 */
function findComponentFunctionInStatements(
  statements: readonly TSESTree.Node[],
  name: string,
  lookup: ComponentFunctionLookup,
  nextLookup: ComponentFunctionLookup,
): ScopeMatch<ComponentFunction> {
  for (const stmt of statements) {
    const decl = declarationOf(stmt);

    if (
      (decl.type === AST_NODE_TYPES.FunctionDeclaration ||
        decl.type === AST_NODE_TYPES.ClassDeclaration) &&
      decl.id?.name === name
    ) {
      // A class component binds the name without being a ComponentFunction, so
      // it proves nothing and still ends the search.
      return decl.type === AST_NODE_TYPES.FunctionDeclaration
        ? decl
        : BOUND_UNPROVABLE;
    }

    if (decl.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of decl.declarations) {
        if (
          declarator.id.type !== AST_NODE_TYPES.Identifier ||
          declarator.id.name !== name
        ) {
          continue;
        }
        const init = declarator.init;
        if (!init) {
          return BOUND_UNPROVABLE;
        }
        if (
          init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          init.type === AST_NODE_TYPES.FunctionExpression
        ) {
          return init;
        }
        if (init.type === AST_NODE_TYPES.CallExpression) {
          if (
            lookup.propsPreservingHocsOnly &&
            !isPropsPreservingHocCallee(init.callee)
          ) {
            // The binding IS this call, and the call is not known to preserve
            // props — so nothing about its props surface is provable.
            return BOUND_UNPROVABLE;
          }
          const arg0 = init.arguments[0];
          if (
            arg0 &&
            (arg0.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              arg0.type === AST_NODE_TYPES.FunctionExpression)
          ) {
            return arg0;
          }
          return BOUND_UNPROVABLE;
        }
        if (init.type === AST_NODE_TYPES.Identifier) {
          // The alias target is resolved from the alias's own declaration site,
          // which is the scope the alias was written in — not the site that
          // asked, which may sit several containers deeper. An alias resolving
          // to nothing still binds the name here, so it ends the search.
          return (
            findComponentFunction(declarator, init.name, nextLookup) ??
            BOUND_UNPROVABLE
          );
        }
        return BOUND_UNPROVABLE;
      }
    }
  }
  return undefined;
}

/**
 * Resolve the function node a component name binds to, following a
 * single-identifier alias (`const Live = LiveUnmemoized`) and unwrapping a HOC
 * call (`memo((props) => ...)`). Returns null when no function is found.
 *
 * The search runs from `scope` outward through every enclosing statement
 * container, so a child declared beside the JSX that renders it resolves exactly
 * as a top-level one does. Anchoring at `Program.body` made a nested
 * `const Spinner = memo(() => <div />)` unresolvable, and an unresolvable child
 * is treated as one that takes props: the rule then demanded a `SpinnerProps`
 * that cannot exist, because Spinner declares no parameters (issue #1776).
 */
function findComponentFunction(
  scope: TSESTree.Node,
  name: string,
  lookup: ComponentFunctionLookup = {},
): ComponentFunction | null {
  const seen = lookup.seen ?? new Set<string>();
  const nextLookup: ComponentFunctionLookup = { ...lookup, seen };
  if (seen.has(name)) return null;
  seen.add(name);

  return (
    resolveInEnclosingScopes<ComponentFunction>(scope, (statements) =>
      findComponentFunctionInStatements(statements, name, lookup, nextLookup),
    ) ?? null
  );
}

/**
 * A rendered child that resolves in-file to a component function taking no
 * parameters has no props surface to compose with, so it is not a composition
 * dependency (same category as a decorative icon). Only in-file resolution is
 * used; imported children are left to the normal composition check.
 *
 * `scope` must be anchored at the JSX site's own container rather than at the
 * program: a child declared inside the very component that renders it is the
 * commonplace shape (`memo-nested-react-components` ships as an error, which
 * presumes nested components exist), and reading its unresolvability as "takes
 * props" names a props type the author cannot write.
 */
function isZeroPropComponent(scope: TSESTree.Node, name: string): boolean {
  const fn = findComponentFunction(scope, name, {
    propsPreservingHocsOnly: true,
  });
  return fn !== null && fn.params.length === 0;
}

const RELATIVE_SOURCE = /^\.\.?\//;
const MODULE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];
const DEFAULT_BINDING = 'default';

/**
 * A whole-repo run re-visits the same parent/child pairs many times, so both the
 * module resolution (misses included) and the per-binding verdict are memoized to
 * hold the disk work to one stat/read per module. Keys are JSON-encoded tuples so
 * no separator character can collide with a directory or module name. Only the
 * verdicts are retained — a parsed child program is discarded as soon as it has
 * answered, so a whole-repo run never accumulates foreign ASTs.
 *
 * The resolution cache stores the candidate search only (which path a specifier
 * picks), never the file's contents or state: a resolution *miss* is safe to
 * keep because a file created later stays unresolved, which reports. The verdict
 * cache instead carries the resolved file's mtime/size stamp as its VALUE, so a
 * child edited under a long-lived host (the VS Code ESLint extension, eslint_d)
 * is re-read on the next lint rather than answering from a stale verdict. The
 * stamp lives in the value, not the key, so an edited file replaces its entry
 * instead of accumulating one per revision.
 */
const moduleResolutionCache = new Map<string, string | null>();
const propLessBindingCache = new Map<string, StampedVerdict>();
const unionMemberCache = new Map<string, StampedMembers>();

type FileStamp = { mtimeMs: number; size: number };
type ResolvedModule = FileStamp & { filePath: string };
type StampedVerdict = FileStamp & { propLess: boolean };
type StampedMembers = FileStamp & { members: string[] };

/**
 * Stat a candidate path, returning its identity stamp when it is a file. The
 * single stat both resolves existence and stamps the file, so proving a child
 * prop-less never pays for two.
 */
function statModule(candidate: string): ResolvedModule | null {
  try {
    const stats = fs.statSync(candidate);
    return stats.isFile()
      ? { filePath: candidate, mtimeMs: stats.mtimeMs, size: stats.size }
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a relative import specifier the way a bundler would: sibling file
 * first, then the directory's index file. Package specifiers never reach here —
 * only a file proven to exist on disk can relax the rule.
 *
 * The chosen path is memoized, but the returned stamp never is: the stat that
 * confirms the resolved file still exists is the same stat that dates it, so a
 * cache hit costs exactly one stat (against up to eight on a miss) and a deleted
 * file resolves to null again, which reports.
 */
function resolveRelativeModule(
  fromDir: string,
  source: string,
): ResolvedModule | null {
  const cacheKey = JSON.stringify([fromDir, source]);
  const cached = moduleResolutionCache.get(cacheKey);
  if (cached !== undefined) {
    return cached === null ? null : statModule(cached);
  }

  const base = path.resolve(fromDir, source);
  let resolved: ResolvedModule | null = null;
  for (const extension of MODULE_EXTENSIONS) {
    resolved = statModule(`${base}${extension}`);
    if (resolved) {
      break;
    }
  }
  if (!resolved) {
    for (const extension of MODULE_EXTENSIONS) {
      resolved = statModule(path.join(base, `index${extension}`));
      if (resolved) {
        break;
      }
    }
  }

  moduleResolutionCache.set(cacheKey, resolved?.filePath ?? null);
  return resolved;
}

type ForeignParseOptions = {
  jsx: boolean;
  loc: boolean;
  range: boolean;
  comment: boolean;
};

type ForeignParse = (
  source: string,
  options: ForeignParseOptions,
) => TSESTree.Program;

/**
 * `undefined` means the parser has not been looked up yet; `null` means the
 * lookup failed and must not be retried.
 */
let foreignParse: ForeignParse | null | undefined;

/**
 * The child module is read with the parser that backs `@typescript-eslint/utils`
 * itself, loaded lazily and memoized (failure included) so the resolution cost is
 * paid once per process rather than per file. A consumer install that somehow
 * lacks the parser degrades to "not provable", which leaves the dependency in the
 * set and keeps the rule reporting.
 */
function getForeignParse(): ForeignParse | null {
  if (foreignParse === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const estree = require('@typescript-eslint/typescript-estree');
      foreignParse = (estree?.parse as ForeignParse | undefined) ?? null;
    } catch {
      foreignParse = null;
    }
  }
  return foreignParse;
}

/**
 * Parse a child module into an AST. Only a real parse can decide whether a file
 * declares a zero-parameter component: text that merely looks like a declaration
 * — inside a string, a template literal, a comment, a nested scope, or a
 * TypeScript overload signature — must never stand in for the definition.
 * A file that cannot be read or parsed yields null, i.e. proves nothing.
 */
function parseModuleProgram(filePath: string): TSESTree.Program | null {
  const parse = getForeignParse();
  if (!parse) {
    return null;
  }
  try {
    return parse(fs.readFileSync(filePath, 'utf8'), {
      jsx: true,
      loc: false,
      range: false,
      comment: false,
    });
  } catch {
    return null;
  }
}

/**
 * Map an exported name to the local binding that defines it, covering both
 * `export const X` / `export function X` and the `const X = …; export { X as Y }`
 * split. A re-export (`export { X } from './y'`) is deliberately left
 * unresolved: the definition lives in another module, so nothing is proven.
 */
function findExportedLocalName(
  program: TSESTree.Program,
  exported: string,
): string | null {
  for (const stmt of program.body) {
    if (
      stmt.type !== AST_NODE_TYPES.ExportNamedDeclaration ||
      stmt.exportKind === 'type' ||
      stmt.source
    ) {
      continue;
    }

    const declaration = stmt.declaration;
    if (declaration) {
      if (
        declaration.type === AST_NODE_TYPES.FunctionDeclaration &&
        declaration.id?.name === exported
      ) {
        return exported;
      }
      if (declaration.type === AST_NODE_TYPES.VariableDeclaration) {
        for (const declarator of declaration.declarations) {
          if (
            declarator.id.type === AST_NODE_TYPES.Identifier &&
            declarator.id.name === exported
          ) {
            return exported;
          }
        }
      }
      continue;
    }

    for (const specifier of stmt.specifiers) {
      if (specifier.exported.name === exported) {
        return specifier.local.name;
      }
    }
  }
  return null;
}

/**
 * Resolve `export default <expr>` to the component function it defines,
 * unwrapping a HOC call and following an identifier alias the same way
 * findComponentFunction does for named bindings. `lookup` carries the same
 * restrictions, so `export default lazy(() => import('./X'))` is as unprovable
 * as its named counterpart.
 */
function findDefaultExportFunction(
  program: TSESTree.Program,
  lookup: ComponentFunctionLookup = {},
): ComponentFunction | null {
  for (const stmt of program.body) {
    if (stmt.type !== AST_NODE_TYPES.ExportDefaultDeclaration) {
      continue;
    }

    const declaration = stmt.declaration;
    if (
      declaration.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      declaration.type === AST_NODE_TYPES.FunctionExpression ||
      declaration.type === AST_NODE_TYPES.FunctionDeclaration
    ) {
      return declaration;
    }
    if (declaration.type === AST_NODE_TYPES.Identifier) {
      return findComponentFunction(program, declaration.name, lookup);
    }
    if (declaration.type === AST_NODE_TYPES.CallExpression) {
      if (
        lookup.propsPreservingHocsOnly &&
        !isPropsPreservingHocCallee(declaration.callee)
      ) {
        return null;
      }
      const arg0 = declaration.arguments[0];
      if (!arg0) {
        return null;
      }
      if (
        arg0.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        arg0.type === AST_NODE_TYPES.FunctionExpression
      ) {
        return arg0;
      }
      if (arg0.type === AST_NODE_TYPES.Identifier) {
        return findComponentFunction(program, arg0.name, lookup);
      }
    }
    return null;
  }
  return null;
}

/**
 * Whether the module at `filePath` provably exports `binding` as a component
 * declared with an empty parameter list. The verdict comes from
 * findComponentFunction — the same resolution the rule applies to in-file
 * children — run against the child's own parsed program, so `const X = () => …`,
 * `function X() {}`, props-preserving HOC wrappers and identifier aliases all
 * behave identically whether the child lives in this file or a sibling one.
 */
function isPropLessExport(filePath: string, binding: string): boolean {
  const program = parseModuleProgram(filePath);
  if (!program) {
    return false;
  }

  const lookup: ComponentFunctionLookup = { propsPreservingHocsOnly: true };
  let fn: ComponentFunction | null = null;
  if (binding === DEFAULT_BINDING) {
    fn = findDefaultExportFunction(program, lookup);
  } else {
    const local = findExportedLocalName(program, binding);
    fn = local === null ? null : findComponentFunction(program, local, lookup);
  }

  return fn !== null && fn.params.length === 0;
}

type RelativeImport = { source: string; binding: string };

/**
 * Locate the relative import that introduces `localName`. Package imports
 * (`@mui/material`, `react`), namespace imports, type-only imports and free
 * identifiers all return null, so they keep the rule's normal behavior.
 */
function findRelativeImport(
  program: TSESTree.Program,
  localName: string,
): RelativeImport | null {
  for (const stmt of program.body) {
    if (
      stmt.type !== AST_NODE_TYPES.ImportDeclaration ||
      stmt.importKind === 'type' ||
      typeof stmt.source.value !== 'string' ||
      !RELATIVE_SOURCE.test(stmt.source.value)
    ) {
      continue;
    }
    for (const specifier of stmt.specifiers) {
      if (specifier.local.name !== localName) {
        continue;
      }
      if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
        return { source: stmt.source.value, binding: DEFAULT_BINDING };
      }
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.importKind !== 'type' &&
        specifier.imported.type === AST_NODE_TYPES.Identifier
      ) {
        return { source: stmt.source.value, binding: specifier.imported.name };
      }
      return null;
    }
  }
  return null;
}

/**
 * Whether `name` is bound by a destructuring/assignment pattern. Every binding
 * form a parameter or declarator can take is walked, so a name introduced by
 * `const { X } = …` or `([X]) => …` counts as a binding just like `const X = …`.
 */
function patternBindsName(
  pattern: TSESTree.Node | null | undefined,
  name: string,
): boolean {
  if (!pattern) return false;
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      return pattern.name === name;
    case AST_NODE_TYPES.ObjectPattern:
      return pattern.properties.some((property) =>
        property.type === AST_NODE_TYPES.RestElement
          ? patternBindsName(property.argument, name)
          : patternBindsName(property.value, name),
      );
    case AST_NODE_TYPES.ArrayPattern:
      return pattern.elements.some((element) =>
        patternBindsName(element, name),
      );
    case AST_NODE_TYPES.AssignmentPattern:
      return patternBindsName(pattern.left, name);
    case AST_NODE_TYPES.RestElement:
      return patternBindsName(pattern.argument, name);
    default:
      return false;
  }
}

/**
 * Whether a declaration of `name` appears anywhere inside `root`.
 *
 * A module-level import only describes the JSX name when nothing between the
 * import and the JSX site re-declares it. Scope boundaries inside the component
 * are deliberately ignored: over-detecting a shadow costs nothing but a report
 * (the fail-safe direction), whereas missing one silently drops a dependency the
 * import never described (issue #1316).
 */
function isNameDeclaredWithin(root: TSESTree.Node, name: string): boolean {
  let found = false;

  function visit(node: TSESTree.Node | null | undefined): void {
    if (found || !node || typeof node !== 'object') return;

    switch (node.type) {
      case AST_NODE_TYPES.VariableDeclarator:
        if (patternBindsName(node.id, name)) found = true;
        break;
      case AST_NODE_TYPES.FunctionDeclaration:
      case AST_NODE_TYPES.ClassDeclaration:
        if (node.id?.name === name) found = true;
        break;
      case AST_NODE_TYPES.CatchClause:
        if (patternBindsName(node.param, name)) found = true;
        break;
      default:
        break;
    }
    if (
      node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      if (node.params.some((param) => patternBindsName(param, name))) {
        found = true;
      }
    }
    if (found) return;

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
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

  visit(root);
  return found;
}

/**
 * A child imported from a sibling module can be just as prop-less as an in-file
 * one (issue #1316: `<BestOfText />`, whose module declares
 * `export const BestOfText = () => …` and no BestOfTextProps anywhere). Demanding
 * composition with a props type that cannot exist is unfixable, so such a child
 * is not a composition dependency.
 *
 * The relaxation is deliberately narrow — it applies only when the child is
 * imported from a *relative* path, that path resolves to a file on disk, that
 * file's own AST positively proves a zero-parameter component, and nothing
 * inside the rendering component re-declares the name. Every other dependency
 * (package imports, unresolvable modules, free identifiers, shadowed names,
 * anything the parse cannot decide with certainty) still reports, so the rule
 * cannot be silently disabled by an unresolvable name.
 */
function isPropLessImportedComponent(
  program: TSESTree.Program,
  localName: string,
  filename: string,
  componentRoot: TSESTree.Node,
  cwd: string,
): boolean {
  const relativeImport = findRelativeImport(program, localName);
  if (!relativeImport) {
    return false;
  }

  // A local declaration of the same name inside the component means the JSX
  // resolves to that binding, not the import, so the import proves nothing.
  if (isNameDeclaredWithin(componentRoot, localName)) {
    return false;
  }

  try {
    // A relative filename is anchored at the directory ESLint was configured
    // with, never the node process cwd. The two differ under the VS Code ESLint
    // extension, in monorepos, and for any programmatic `new Linter({ cwd })`,
    // and anchoring at the process cwd there resolves the sibling import
    // against the wrong directory: the child module is not found, the
    // prop-less relaxation silently stops applying, and the parent reports a
    // composition it cannot satisfy (issue #1476).
    const absolute = path.isAbsolute(filename)
      ? filename
      : path.resolve(cwd, filename);
    const resolved = resolveRelativeModule(
      path.dirname(absolute),
      relativeImport.source,
    );
    if (!resolved) {
      return false;
    }

    const cacheKey = JSON.stringify([
      resolved.filePath,
      relativeImport.binding,
    ]);
    const cached = propLessBindingCache.get(cacheKey);
    if (
      cached !== undefined &&
      cached.mtimeMs === resolved.mtimeMs &&
      cached.size === resolved.size
    ) {
      return cached.propLess;
    }

    const propLess = isPropLessExport(
      resolved.filePath,
      relativeImport.binding,
    );
    propLessBindingCache.set(cacheKey, {
      mtimeMs: resolved.mtimeMs,
      size: resolved.size,
      propLess,
    });
    return propLess;
  } catch {
    return false;
  }
}

/**
 * Resolve the type node that defines a rendered dependency's props: its
 * `{Dep}Props` alias if one exists, otherwise the dependency component's
 * first-parameter type annotation. Used to detect inverse composition, where
 * the child derives its props from the parent's props type.
 */
function getDependencyPropsSourceType(
  scope: TSESTree.Node,
  depName: string,
): TSESTree.TypeNode | null {
  const alias = findPropsTypeAliasByName(scope, toPropsTypeName(depName));
  if (alias) {
    return alias.typeAnnotation;
  }
  const fn = findComponentFunction(scope, depName);
  if (fn) {
    return getFirstParamTypeNode(fn);
  }
  return null;
}

/**
 * Name one arm of a union, and flatten whatever the arm turns out to be.
 *
 * Only an arm spelled as a type *reference* yields a name: an inline object arm
 * has no name a parent could compose with, and an intersection arm's members
 * describe a fragment of the arm rather than the arm itself. A named arm is
 * followed to its definition too, because an alias of a union flattens into the
 * enclosing union in TypeScript, so its own arms are arms here.
 */
function collectUnionArmNames(
  arm: TSESTree.TypeNode,
  scope: TSESTree.Node,
  seenAliases: Set<string>,
  into: Set<string>,
): void {
  if (arm.type === AST_NODE_TYPES.TSUnionType) {
    for (const nested of arm.types) {
      collectUnionArmNames(nested, scope, seenAliases, into);
    }
    return;
  }
  if (arm.type !== AST_NODE_TYPES.TSTypeReference) {
    return;
  }

  const name = getTypeReferenceName(arm);
  if (name === 'Readonly') {
    // A `Readonly<X>` arm is the X arm: the wrapper adds no surface of its own.
    const inner = arm.typeParameters?.params[0];
    if (inner) {
      collectUnionArmNames(inner, scope, seenAliases, into);
    }
    return;
  }
  if (!name || seenAliases.has(name)) {
    return;
  }

  into.add(name);
  const alias = findPropsTypeAliasByName(scope, name);
  if (alias) {
    const nextSeen = new Set(seenAliases);
    nextSeen.add(name);
    collectUnionArmNames(alias.typeAnnotation, scope, nextSeen, into);
  }
}

/**
 * Collect the named arms of a props type that resolves to a union, following
 * `Readonly<...>` wrappers and named-alias indirection within `program` to reach
 * it. A props type that is not a union contributes nothing, so a single-shape
 * child keeps demanding composition with its own name.
 *
 * Resolving *to* the union never names anything on the way: only an arm of a
 * real union is a member, so an alias chain that ends at a single object type
 * credits none of the names it passed through.
 */
function collectUnionMemberNames(
  typeNode: TSESTree.TypeNode | null,
  scope: TSESTree.Node,
  seenAliases: Set<string> = new Set<string>(),
  into: Set<string> = new Set<string>(),
): Set<string> {
  if (!typeNode) {
    return into;
  }

  if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
    for (const arm of typeNode.types) {
      collectUnionArmNames(arm, scope, seenAliases, into);
    }
    return into;
  }

  if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
    const name = getTypeReferenceName(typeNode);
    if (name === 'Readonly') {
      const inner = typeNode.typeParameters?.params[0];
      if (inner) {
        collectUnionMemberNames(inner, scope, seenAliases, into);
      }
      return into;
    }
    if (name && !seenAliases.has(name)) {
      const alias = findPropsTypeAliasByName(scope, name);
      if (alias) {
        const nextSeen = new Set(seenAliases);
        nextSeen.add(name);
        collectUnionMemberNames(alias.typeAnnotation, scope, nextSeen, into);
      }
    }
  }

  return into;
}

/**
 * The props type node a module exports alongside `binding`: its
 * `{Binding}Props` alias when one exists, otherwise the exported component's
 * own first-parameter annotation. Mirrors getDependencyPropsSourceType for a
 * foreign program, resolving the export's local name first so
 * `const X = …; export { X as Y }` reads X's props type.
 */
function getExportedPropsSourceType(
  program: TSESTree.Program,
  binding: string,
): TSESTree.TypeNode | null {
  if (binding === DEFAULT_BINDING) {
    const fn = findDefaultExportFunction(program);
    return fn ? getFirstParamTypeNode(fn) : null;
  }
  const local = findExportedLocalName(program, binding);
  return local === null ? null : getDependencyPropsSourceType(program, local);
}

/**
 * The union arms of a dependency's props type as declared in the sibling module
 * it is imported from. Resolution mirrors isPropLessImportedComponent — a
 * relative specifier, a file that exists on disk, no shadowing declaration
 * inside the rendering component — so anything the parse cannot decide yields
 * no members and the composition requirement stands.
 */
function getImportedDependencyUnionMembers(
  program: TSESTree.Program,
  localName: string,
  filename: string,
  componentRoot: TSESTree.Node,
  cwd: string,
): string[] {
  const relativeImport = findRelativeImport(program, localName);
  if (!relativeImport) {
    return [];
  }
  if (isNameDeclaredWithin(componentRoot, localName)) {
    return [];
  }

  try {
    const absolute = path.isAbsolute(filename)
      ? filename
      : path.resolve(cwd, filename);
    const resolved = resolveRelativeModule(
      path.dirname(absolute),
      relativeImport.source,
    );
    if (!resolved) {
      return [];
    }

    const cacheKey = JSON.stringify([
      resolved.filePath,
      relativeImport.binding,
    ]);
    const cached = unionMemberCache.get(cacheKey);
    if (
      cached !== undefined &&
      cached.mtimeMs === resolved.mtimeMs &&
      cached.size === resolved.size
    ) {
      return cached.members;
    }

    const childProgram = parseModuleProgram(resolved.filePath);
    const members = childProgram
      ? Array.from(
          collectUnionMemberNames(
            getExportedPropsSourceType(childProgram, relativeImport.binding),
            childProgram,
          ),
        )
      : [];
    unionMemberCache.set(cacheKey, {
      mtimeMs: resolved.mtimeMs,
      size: resolved.size,
      members,
    });
    return members;
  } catch {
    return [];
  }
}

/**
 * Every name the file under lint can use to reference an imported type: the
 * exported name itself plus each `import { Exported as Local }` rename of it.
 * A union member declared in a sibling module is written with the local
 * spelling at the composition site.
 */
function collectImportSpellings(
  program: TSESTree.Program,
  importedName: string,
): string[] {
  const spellings = [importedName];
  for (const stmt of program.body) {
    if (stmt.type !== AST_NODE_TYPES.ImportDeclaration) continue;
    for (const specifier of stmt.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.imported.type === AST_NODE_TYPES.Identifier &&
        specifier.imported.name === importedName &&
        specifier.local.name !== importedName
      ) {
        spellings.push(specifier.local.name);
      }
    }
  }
  return spellings;
}

/**
 * Modules whose exported types are a framework contract. A props type written
 * against one of them describes a shape the framework dictates, not a shape its
 * author chose, so no rendered child can be its source of truth.
 */
const FRAMEWORK_MODULE = /^next(\/|$)/;

/**
 * The local spellings under which the file binds a framework module's types.
 * Only named import specifiers count: a default or namespace import binds a
 * value or a namespace object rather than a type a props alias is written
 * against, so crediting one would key the carve-out on a name the framework
 * never handed over.
 */
function collectFrameworkContractNames(program: TSESTree.Program): Set<string> {
  const names = new Set<string>();
  for (const stmt of program.body) {
    if (
      stmt.type !== AST_NODE_TYPES.ImportDeclaration ||
      typeof stmt.source.value !== 'string' ||
      !FRAMEWORK_MODULE.test(stmt.source.value)
    ) {
      continue;
    }
    for (const specifier of stmt.specifiers) {
      if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
        names.add(specifier.local.name);
      }
    }
  }
  return names;
}

/**
 * Every type name the file binds itself — through an import, a type alias, an
 * interface, a class or an enum — in any scope.
 *
 * A contract member is credited on its type as well as its name, and the only
 * type the routing contract names is the ambient `Error`. A file that binds
 * `Error` itself (`type Error = { message: string }`, `import type { Error }
 * from '../errors'`) therefore annotates its AUTHOR's shape at `err: Error`, not
 * the one the router hands over, and the composition requirement must stand.
 *
 * Collected file-wide rather than per enclosing scope because the two mistakes
 * are not equally costly: a name bound elsewhere in the file at worst keeps the
 * rule reporting, while missing one silently switches a recommended rule off.
 */
function collectLocallyBoundTypeNames(program: TSESTree.Program): Set<string> {
  const names = new Set<string>();

  function visit(node: TSESTree.Node | null | undefined): void {
    if (!node || typeof node !== 'object') return;

    switch (node.type) {
      case AST_NODE_TYPES.ImportSpecifier:
      case AST_NODE_TYPES.ImportDefaultSpecifier:
      case AST_NODE_TYPES.ImportNamespaceSpecifier:
        names.add(node.local.name);
        break;
      case AST_NODE_TYPES.TSTypeAliasDeclaration:
      case AST_NODE_TYPES.TSInterfaceDeclaration:
      case AST_NODE_TYPES.TSEnumDeclaration:
        names.add(node.id.name);
        break;
      case AST_NODE_TYPES.ClassDeclaration:
        if (node.id) {
          names.add(node.id.name);
        }
        break;
      default:
        break;
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
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

  visit(program);
  return names;
}

/**
 * The name spellings a file supplies to the carve-out, both properties of the
 * module rather than of any one component.
 */
type ContractNames = {
  /** Local spellings under which a `next` import binds a framework type. */
  framework: Set<string>;
  /** Every type name the file binds itself, which shadows an ambient one. */
  localTypes: Set<string>;
};

/**
 * Utility types that re-shape a contract without replacing it: what survives
 * them is still the framework's surface, so the first type argument is the one
 * to test. `Pick`/`Omit` carry their key list in the second argument, which
 * names keys rather than a surface and is therefore never followed.
 */
const CONTRACT_WRAPPERS = new Set([
  'Pick',
  'Omit',
  'Readonly',
  'Partial',
  'Required',
]);

/**
 * The two spellings of "the framework handed nothing". Either widens a contract
 * member without changing whose shape it is.
 */
const NULLISH_TYPE_NODES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.TSUndefinedKeyword,
  AST_NODE_TYPES.TSNullKeyword,
]);

/**
 * Whether a member's annotation is the contract's own type, optionally widened
 * by absence (`T | undefined`, `T | null`). A union carrying any other arm is a
 * shape its author widened, which the framework never dictated.
 */
function matchesContractMemberType(
  typeNode: TSESTree.TypeNode,
  isContractType: (node: TSESTree.TypeNode) => boolean,
): boolean {
  if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
    return (
      typeNode.types.some(isContractType) &&
      typeNode.types.every(
        (arm) => isContractType(arm) || NULLISH_TYPE_NODES.has(arm.type),
      )
    );
  }
  return isContractType(typeNode);
}

/**
 * The props Next hands a custom `pages/_error`: `statusCode` from the page's
 * `getInitialProps`, `err` from the router's `handleRouteInfoError`. Each is
 * keyed on its type as well as its name, so a same-named prop of the author's
 * own making (`err: ApiFailure`, `statusCode: HttpStatus`) is a shape they chose
 * and keeps demanding composition.
 *
 * `statusCode` names a keyword type, which nothing can rebind. `err` names an
 * ambient one, so its predicate has to ask the file whether `Error` still means
 * the global: a name the file binds itself is the author's, and keying on the
 * spelling alone would credit exactly the shape this table exists to exclude.
 */
const ROUTING_CONTRACT_MEMBERS = new Map<
  string,
  (typeNode: TSESTree.TypeNode, localTypeNames: Set<string>) => boolean
>([
  [
    'statusCode',
    (typeNode) =>
      matchesContractMemberType(
        typeNode,
        (arm) => arm.type === AST_NODE_TYPES.TSNumberKeyword,
      ),
  ],
  [
    'err',
    (typeNode, localTypeNames) =>
      !localTypeNames.has('Error') &&
      matchesContractMemberType(
        typeNode,
        (arm) =>
          arm.type === AST_NODE_TYPES.TSTypeReference &&
          getTypeReferenceName(arm) === 'Error',
      ),
  ],
]);

/**
 * The name a property signature declares, or null for anything that is not a
 * plain named property — an index signature, a method or call signature, and a
 * computed key each describe a surface no contract table can vouch for.
 */
function contractPropertyName(member: TSESTree.TypeElement): string | null {
  if (member.type !== AST_NODE_TYPES.TSPropertySignature || member.computed) {
    return null;
  }
  const key = member.key;
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }
  return null;
}

/**
 * Whether a props type's ENTIRE surface is dictated by an external framework
 * contract, and so has no composable source of truth among the children the
 * component renders. Two spellings qualify, and both are decided from syntax
 * alone:
 *
 * - a reference to a type the framework itself exports (`NextPageContext`,
 *   reached bare or through `Pick`/`Omit`/`Readonly`/`Partial`/`Required`);
 * - an object type whose every member is a routing-contract property with the
 *   contract's own type — the `{ statusCode, err }` a custom `pages/_error`
 *   receives, which its author can neither rename nor extend.
 *
 * The quantifier over composite types is `every`, the opposite of the `some`
 * the composition check uses, because the questions are opposites: composition
 * asks whether ANY part of the props type inherits a child's surface, while this
 * asks whether the props type is dictated upstream in its ENTIRETY. One authored
 * member (`Pick<NextPageContext, 'err'> & { sx?: SxProps }`) makes the rendered
 * child a candidate owner of that member again, so the requirement stands.
 *
 * Nesting is deliberately not followed: a contract inside a property signature
 * or an array element describes one FIELD's shape, leaving the surrounding props
 * the author's to compose.
 */
function isFrameworkContractPropsType(
  typeNode: TSESTree.TypeNode,
  scope: TSESTree.Node,
  contractNames: ContractNames,
  seenAliases: Set<string> = new Set<string>(),
): boolean {
  switch (typeNode.type) {
    case AST_NODE_TYPES.TSTypeLiteral: {
      // An empty object declares no contract at all.
      if (typeNode.members.length === 0) {
        return false;
      }
      return typeNode.members.every((member) => {
        const name = contractPropertyName(member);
        const matchesContract =
          name === null ? undefined : ROUTING_CONTRACT_MEMBERS.get(name);
        if (!matchesContract) {
          return false;
        }
        const annotation = (member as TSESTree.TSPropertySignature)
          .typeAnnotation;
        return (
          !!annotation &&
          matchesContract(annotation.typeAnnotation, contractNames.localTypes)
        );
      });
    }
    case AST_NODE_TYPES.TSIntersectionType:
    case AST_NODE_TYPES.TSUnionType: {
      return typeNode.types.every((member) =>
        isFrameworkContractPropsType(member, scope, contractNames, seenAliases),
      );
    }
    case AST_NODE_TYPES.TSTypeReference: {
      const name = getTypeReferenceName(typeNode);
      if (!name) {
        return false;
      }
      // An in-file alias of the same name shadows the import at the annotation
      // site, so a locally declared `NextPageContext` says nothing about what
      // the framework dictates.
      const alias = findPropsTypeAliasByName(scope, name);
      if (contractNames.framework.has(name) && !alias) {
        return true;
      }
      if (CONTRACT_WRAPPERS.has(name)) {
        const inner = typeNode.typeParameters?.params[0];
        return (
          !!inner &&
          isFrameworkContractPropsType(inner, scope, contractNames, seenAliases)
        );
      }
      if (!alias || seenAliases.has(name)) {
        return false;
      }
      const nextSeen = new Set(seenAliases);
      nextSeen.add(name);
      return isFrameworkContractPropsType(
        alias.typeAnnotation,
        scope,
        contractNames,
        nextSeen,
      );
    }
    default:
      return false;
  }
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
    // Glob matching needs forward slashes, while resolving a relative import off
    // disk needs the platform-native path — keep both.
    // Sibling modules are resolved from disk relative to the file under lint,
    // so a non-absolute filename needs the directory ESLint itself was
    // configured with. The node process cwd is only a fallback for harnesses
    // that predate `getCwd`.
    const cwd =
      typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();

    const rawFilename = context.getFilename();
    const filename = rawFilename.replace(/\\/g, '/');
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

    // Imports and declarations are a property of the module, so the
    // framework-contract spellings are collected once per file rather than once
    // per component.
    let contractNames: ContractNames | null = null;
    function getContractNames(prog: TSESTree.Program): ContractNames {
      if (!contractNames) {
        contractNames = {
          framework: collectFrameworkContractNames(prog),
          localTypes: collectLocallyBoundTypeNames(prog),
        };
      }
      return contractNames;
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

    /**
     * Whether the parent's props type composes with a member of `dep`'s props
     * union. Both spellings the member can take are tried: the in-file
     * declaration, and the sibling module's export (under the exported name and
     * under any local rename the parent imports it as).
     *
     * A dependency whose props type is not a union yields no members, so this
     * never credits a parent that composes with nothing.
     *
     * `scope` resolves in-file declarations lexically, while `prog` answers the
     * questions that are genuinely module-level: an import can only ever appear
     * at the top of the file, so its spelling does not depend on where the JSX
     * sits.
     */
    function composesWithUnionMember(
      dep: string,
      propsTypeNode: TSESTree.TypeNode,
      prog: TSESTree.Program,
      scope: TSESTree.Node,
      componentRoot: TSESTree.Node,
    ): boolean {
      const localMembers = collectUnionMemberNames(
        getDependencyPropsSourceType(scope, dep),
        scope,
      );
      for (const member of localMembers) {
        if (typeNodeComposesWithProps(propsTypeNode, member, scope)) {
          return true;
        }
      }

      const importedMembers = getImportedDependencyUnionMembers(
        prog,
        dep,
        rawFilename,
        componentRoot,
        cwd,
      );
      return importedMembers.some((member) =>
        collectImportSpellings(prog, member).some((spelling) =>
          typeNodeComposesWithProps(propsTypeNode, spelling, scope),
        ),
      );
    }

    function checkComponentWithProgram(
      componentName: string,
      funcNode:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration,
      reportNode: TSESTree.Node,
      prog: TSESTree.Program,
    ): void {
      // Collect all JSX element names the component renders. The walk is
      // rooted at the function rather than at its body because a parameter
      // default is render output too: `({ header = <Child /> }) => ...` renders
      // <Child /> whenever the caller omits `header`, exactly as the body's
      // `header ?? <Child />` does, and params are the body's siblings so a
      // body-rooted walk never reaches them (issue #2183).
      const body = funcNode.body ?? funcNode;
      const allJsxNames = collectJsxElementNames(funcNode);
      const propSlots = collectPropSlotNames(funcNode);

      // A rendered child is resolved from the JSX site outward, so a component
      // declared inside this very body is found; the component's own props alias
      // is resolved from the *declaration* site outward, because a parameter
      // annotation is read in the scope enclosing the function, never in its
      // body. `bodyScope`'s chain contains `declarationScope`'s, so the two only
      // differ over declarations local to the body — exactly the nested children
      // the dependency lookups must see and the props lookups must not.
      const bodyScope: TSESTree.Node = body;
      const declarationScope: TSESTree.Node = funcNode;

      // Filter to non-excluded custom components
      const depComponents = Array.from(allJsxNames).filter(
        (name) =>
          !excludeComponents.has(name) &&
          !isDecorativeIcon(name) &&
          name !== componentName &&
          !propSlots.has(name) &&
          !isZeroPropComponent(bodyScope, name),
      );

      if (depComponents.length < minDependencyCount) {
        return;
      }

      // Resolve the props type for this component
      const propsTypeAlias = findPropsTypeAlias(
        declarationScope,
        componentName,
      );

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
        // Try to find this type alias in scope too
        const resolved = findPropsTypeAliasByName(
          declarationScope,
          paramTypeName,
        );
        if (resolved) {
          propsTypeNode = resolved.typeAnnotation;
        }
      }

      // No props type resolvable — skip
      if (!propsTypeNode) {
        return;
      }

      // Props whose shape is dictated by an external framework contract have no
      // composable source of truth on screen: the routing layer, not the
      // rendered child, decides what the component receives. Composing them from
      // the presentational child would invert the dependency — a styling prop
      // added to the child would leak into a routing contract (issue #2098).
      if (
        isFrameworkContractPropsType(
          propsTypeNode,
          declarationScope,
          getContractNames(prog),
        )
      ) {
        return;
      }

      const composedWith = new Set<string>();
      const missingComposition: string[] = [];

      for (const dep of depComponents) {
        const expectedPropsType = toPropsTypeName(dep);
        let composes = typeNodeComposesWithProps(
          propsTypeNode,
          expectedPropsType,
          declarationScope,
        );
        // Inverse composition: the child derives its props FROM this parent's
        // props type (e.g. `Omit<ParentProps, 'children'>`, often with no named
        // ChildProps at all). The parent is then the single shared source of
        // truth, so the DRY guarantee is already met; requiring the parent to
        // *also* compose from ChildProps would invert the source of truth or
        // create a circular dependency.
        if (!composes && propsTypeName) {
          const depPropsSource = getDependencyPropsSourceType(bodyScope, dep);
          if (
            depPropsSource &&
            typeNodeComposesWithProps(depPropsSource, propsTypeName, bodyScope)
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

      // A child whose props type is a union is composed by composing with any
      // one of its MEMBERS: `Pick<ChipToggleProps, 'label'>` inherits exactly
      // the surface the child accepts on that arm, so the DRY guarantee holds
      // just as it does for the union alias itself. This mirrors on the child
      // side the `.some` rule issue #1343 established on the parent side.
      //
      // Deferred behind the whole cheap pass because resolving a sibling
      // module's members reads it off disk: a file that already composes never
      // pays for it.
      if (
        missingComposition.length > 0 &&
        (requireAllDependencies || composedWith.size === 0)
      ) {
        for (let index = missingComposition.length - 1; index >= 0; index--) {
          const dep = missingComposition[index];
          if (
            composesWithUnionMember(
              dep,
              propsTypeNode,
              prog,
              bodyScope,
              funcNode,
            )
          ) {
            composedWith.add(dep);
            missingComposition.splice(index, 1);
          }
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

      // Drop dependencies proven prop-less on disk (issue #1316 reopened). This
      // runs only on the about-to-report path so a compliant file never pays for
      // the file reads, and it drops the dep from the *reported* set rather than
      // suppressing the whole report — a sibling child that genuinely needs
      // composition still fires.
      const reportableDeps = depComponents.filter(
        (dep) =>
          !isPropLessImportedComponent(prog, dep, rawFilename, funcNode, cwd),
      );
      if (reportableDeps.length < minDependencyCount) {
        return;
      }
      const reportable = new Set(reportableDeps);

      const flaggedDeps = requireAllDependencies
        ? missingComposition.filter((dep) => reportable.has(dep))
        : reportableDeps;

      if (flaggedDeps.length === 0) return;

      context.report({
        node: reportNode,
        messageId: 'missingPropsComposition',
        data: {
          componentName,
          propsTypeName: propsTypeName ?? `${componentName}Props`,
          dependencyList: reportableDeps.map((d) => `'${d}'`).join(', '),
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
 * Find a type alias by name (exported or not), searching from `scope` outward
 * through every enclosing statement container.
 *
 * Scanning `Program.body` alone made the *depth* of a declaration decide whether
 * it exists, a distinction a props type knows nothing about: a component and its
 * props alias written inside a factory, a `describe` block or an
 * `export namespace` resolved to nothing, so the rule returned early and went
 * silent (issue #1776). The innermost container wins, so an alias declared
 * beside the component shadows a same-named one further out — a file-wide search
 * would instead hand one scope's verdict to another.
 */
function findPropsTypeAliasByName(
  scope: TSESTree.Node,
  typeName: string,
): TSESTree.TSTypeAliasDeclaration | null {
  return (
    resolveNameInEnclosingScopes<TSESTree.TSTypeAliasDeclaration>(
      scope,
      typeName,
      'type',
      (statements) => {
        for (const stmt of statements) {
          const declaration = declarationOf(stmt);
          if (
            declaration.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
            declaration.id.name === typeName
          ) {
            return declaration;
          }
        }
        return undefined;
      },
    ) ?? null
  );
}
