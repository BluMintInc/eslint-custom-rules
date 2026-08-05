import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import {
  SymbolFlags,
  TypeFlags,
  isArrayTypeNode,
  isTupleTypeNode,
} from 'typescript';
import type { TypeChecker, Node } from 'typescript';

type MessageIds = 'avoidEntireObject' | 'removeUnusedDependency';

const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

/**
 * Hooks that run for their side effects rather than producing a value. An
 * unread dependency means something different here than in useMemo/useCallback
 * — see `callsCorrespondingSetter`.
 */
const EFFECT_HOOK_NAMES = new Set(['useEffect']);

function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier && HOOK_NAMES.has(callee.name)
  );
}

function isEffectHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier &&
    EFFECT_HOOK_NAMES.has(callee.name)
  );
}

/**
 * The rule whose suppression marks a dependency array as hand-maintained.
 */
const EXHAUSTIVE_DEPS_RULE = 'react-hooks/exhaustive-deps';

/**
 * Matches the keyword of an `eslint-disable`, `eslint-disable-next-line` or
 * `eslint-disable-line` directive, leaving the rule list as the remainder. The
 * lookahead keeps `eslint-disabled-something` (and prose that merely opens with
 * the same letters) from parsing as a directive.
 */
const DISABLE_DIRECTIVE = /^\s*eslint-disable(-next-line|-line)?(?![\w-])/u;

/**
 * ESLint splits a directive's rule list from its ` -- justification` suffix on
 * this separator, so the rule list must be read the same way.
 */
const JUSTIFICATION_SEPARATOR = /\s-{2,}\s/u;

/**
 * The line an exhaustive-deps disable comment covers, `'file'` for the
 * whole-file form, or null when the comment is not such a directive.
 *
 * why: `eslint-disable-next-line` covers the line after the comment ends, while
 * `eslint-disable-line` covers the comment's own line. Only the block form of
 * the bare `eslint-disable` is a file-level directive to ESLint, so a line
 * comment starting with it is not treated as one here either. The file form
 * counts for the whole file rather than from its own position onward: erring
 * toward exempting a hook keeps a hand-managed array intact, which is the safe
 * direction for a deleting fixer.
 */
function readExhaustiveDepsDisable(
  comment: TSESTree.Comment,
): 'file' | number | null {
  const [directive] = comment.value.split(JUSTIFICATION_SEPARATOR);
  const match = DISABLE_DIRECTIVE.exec(directive);
  if (!match) {
    return null;
  }

  // why: a bare directive with no rule list says nothing about dependency
  // management, so only an explicit mention of exhaustive-deps counts.
  const namesExhaustiveDeps = directive
    .slice(match[0].length)
    .split(',')
    .some((ruleId) => ruleId.trim() === EXHAUSTIVE_DEPS_RULE);
  if (!namesExhaustiveDeps) {
    return null;
  }

  const scope = match[1];
  if (scope === '-next-line') {
    return comment.loc.end.line + 1;
  }
  if (scope === '-line') {
    return comment.loc.start.line;
  }
  return comment.type === AST_TOKEN_TYPES.Block ? 'file' : null;
}

/** `channelGroupActive` -> `setChannelGroupActive`, `a` -> `setA`. */
function toSetterName(dependencyName: string): string {
  return `set${dependencyName.charAt(0).toUpperCase()}${dependencyName.slice(
    1,
  )}`;
}

function isArrayOrPrimitive(
  checker: TypeChecker,
  esTreeNode: TSESTree.Node,
  nodeMap: { get(node: TSESTree.Node): Node | undefined },
): boolean {
  try {
    const tsNode = nodeMap.get(esTreeNode);
    if (!tsNode) return false;

    const type = checker.getTypeAtLocation(tsNode);

    // Check if it's a primitive type
    if (
      type.flags &
      (TypeFlags.String |
        TypeFlags.StringLike |
        TypeFlags.StringLiteral |
        TypeFlags.Number |
        TypeFlags.Boolean |
        TypeFlags.Null |
        TypeFlags.Undefined |
        TypeFlags.Void |
        TypeFlags.Never |
        TypeFlags.BigInt |
        TypeFlags.ESSymbol)
    ) {
      return true;
    }

    // Check if it's an array type
    const typeNode = checker.typeToTypeNode(type, undefined, undefined);
    if (
      type.symbol?.name === 'Array' ||
      type.symbol?.escapedName === 'Array' ||
      (typeNode && (isArrayTypeNode(typeNode) || isTupleTypeNode(typeNode)))
    ) {
      return true;
    }

    // Check if it's a string type with methods (like String object)
    if (
      type.symbol?.name === 'String' ||
      type.symbol?.escapedName === 'String'
    ) {
      return true;
    }

    // Be more conservative - if we can't determine the type clearly, assume it's an object
    // This prevents false positives where complex objects are incorrectly identified as primitives
    if (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) {
      return false; // Treat Any/Unknown as potential objects
    }

    // If it's not a primitive or array, and has properties, it's an object
    return false;
  } catch (error) {
    // If there's any error in type checking, assume it's an object to be safe
    return false;
  }
}

/**
 * The type-checker handles `getObjectUsagesInHook` needs. Absent when the
 * consumer has no `parserOptions.project`, in which case every decision falls
 * back to the syntactic heuristics below.
 */
type TypeInfo = {
  checker: TypeChecker;
  nodeMap: { get(node: TSESTree.Node): Node | undefined };
};

/**
 * Whether a member access reads a method — a function declared as a member of
 * a class or interface, which lives on the prototype.
 *
 * why: such a reference is one shared value across every instance of the type
 * (`new Set().has === new Set().has`, `f1.call === f2.call`). Narrowing a
 * dependency from `set` to `set.has` therefore pins a constant: the hook never
 * invalidates again and serves a stale value forever, so the whole object has
 * to stay the dependency. This is the checker-driven generalisation of the
 * `ARRAY_METHODS`/`STRING_METHODS` name lists, which recognise the identical
 * hazard for two built-ins only; `Map`, `Set`, `Promise`, `Date`, `Intl.*` and
 * every user-defined class come for free.
 *
 * The discriminator is how the member is *declared*, not merely "the type is
 * callable". A function-valued data property (`{ getName?: () => string }`, or
 * a class field holding an arrow function) is per-instance state: it genuinely
 * changes when the object carrying it is rebuilt, so narrowing to it is correct
 * and stays allowed.
 *
 * The question is asked of the symbol's flags rather than its declarations'
 * `SyntaxKind`, because a rule must survive a version skew between the
 * TypeScript this package resolves and the one the consumer's parser built the
 * program with. `SyntaxKind` is renumbered whenever a kind is inserted —
 * `MethodSignature` is 170 under 5.0 and 174 under 5.9 — so a `ts.isMethodX`
 * guard imported here silently answers `false` for every node of a consumer on
 * a different minor, making the carve-out a no-op in exactly the place it
 * matters. `SymbolFlags` is an append-only bit set (`Method` has been 8192
 * throughout), so the flag test holds across versions.
 */
function isMethodMember(
  checker: TypeChecker,
  esTreeNode: TSESTree.Node,
  nodeMap: { get(node: TSESTree.Node): Node | undefined },
): boolean {
  try {
    const tsNode = nodeMap.get(esTreeNode);
    if (!tsNode) return false;

    // why: an unresolved member (an `any` receiver, a missing type) yields no
    // symbol, so the check stays inert rather than guessing — matching the
    // conservative stance `isArrayOrPrimitive` takes on Any/Unknown.
    const symbol = checker.getSymbolAtLocation(tsNode);
    if (!symbol) return false;

    return (symbol.flags & SymbolFlags.Method) !== 0;
  } catch (error) {
    // A type-checker failure must not change what the rule reports.
    return false;
  }
}

type PathSegment = {
  /** Rendered link text: an identifier name (`foo`) or bracket key (`[0]`, `["key"]`). */
  text: string;
  computed: boolean;
  /** Whether this link is accessed via optional chaining (`?.`). */
  optional: boolean;
};

function renderPathSegments(
  baseName: string,
  segments: readonly PathSegment[],
): string {
  let path = baseName;
  for (const segment of segments) {
    if (segment.computed) {
      // why: an optional computed access must render as `?.[` — a bare `?`
      // before `[` parses as a conditional expression, so `state?[0]` is a
      // syntax error while `state?.[0]` is the valid optional element access.
      path += segment.optional ? `?.${segment.text}` : segment.text;
    } else {
      path += segment.optional ? `?.${segment.text}` : `.${segment.text}`;
    }
  }
  return path;
}

function unwrapExpression(expr: TSESTree.Node): TSESTree.Node {
  let current = expr;
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion ||
    current.type === AST_NODE_TYPES.ChainExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * Whether the hook body anywhere calls the state setter that corresponds to
 * `dependencyName` (dep `count` -> `setCount(...)`).
 *
 * why: for an effect, an unread dependency is React's reset-on-scope-change
 * idiom — a deliberate re-run trigger. The one shape where an unread dependency
 * is genuinely wrong is the circular dependency, where the effect writes the
 * very value it depends on and so re-triggers itself. The setter call is that
 * signature. It can sit arbitrarily deep (inside an inner async function, a
 * `startTransition` callback, a `.then()`), so the whole body is searched.
 */
function callsCorrespondingSetter(
  hookBody: TSESTree.Node,
  dependencyName: string,
): boolean {
  const setterName = toSetterName(dependencyName);
  const visited = new Set<TSESTree.Node>();

  function visit(node: TSESTree.Node): boolean {
    if (!node || visited.has(node)) return false;
    visited.add(node);

    if (node.type === AST_NODE_TYPES.CallExpression) {
      const callee = unwrapExpression(node.callee);
      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        callee.name === setterName
      ) {
        return true;
      }
    }

    for (const key in node) {
      if (key === 'parent') continue; // Skip parent references to avoid cycles

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
      if (!child || typeof child !== 'object') continue;

      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in item) {
            if (visit(item)) return true;
          }
        }
      } else if ('type' in child) {
        if (visit(child)) return true;
      }
    }

    return false;
  }

  return visit(hookBody);
}

function getObjectUsagesInHook(
  hookBody: TSESTree.Node,
  objectName: string,
  typeInfo?: TypeInfo,
): { usages: Set<string>; needsEntireObject: boolean; notUsed: boolean } {
  const usages = new Map<string, number>(); // Track usage and its position
  // why: derived dependency paths (first-optional intermediate, array base)
  // must be re-rendered from structured links — string surgery on the
  // rendered path cannot place `?.` markers correctly.
  const pathSegments = new Map<string, PathSegment[]>();
  const visited = new Set<TSESTree.Node>();
  let needsEntireObject = false;
  let isUsed = false;

  // Built-in array methods that indicate usage of the entire array
  const ARRAY_METHODS = new Set([
    'map',
    'filter',
    'reduce',
    'forEach',
    'some',
    'every',
    'find',
    'findIndex',
    'includes',
    'indexOf',
    'join',
    'slice',
    'splice',
    'concat',
    'push',
    'pop',
    'shift',
    'unshift',
    'sort',
    'reverse',
    'flat',
    'flatMap',
  ]);

  // Built-in string methods that indicate usage of the entire string
  const STRING_METHODS = new Set([
    'charAt',
    'charCodeAt',
    'concat',
    'indexOf',
    'lastIndexOf',
    'localeCompare',
    'match',
    'replace',
    'search',
    'slice',
    'split',
    'substr',
    'substring',
    'toLowerCase',
    'toUpperCase',
    'trim',
    'trimStart',
    'trimEnd',
    'padStart',
    'padEnd',
    'repeat',
    'startsWith',
    'endsWith',
    'includes',
  ]);

  function buildAccessPath(node: TSESTree.MemberExpression): string | null {
    // why: optionality belongs to individual links, not the whole chain.
    // Rendering from per-link segments keeps `?.` markers at their real
    // position (a.b?.[0] stays a.b?.[0], not a?.b[0]) and forms the mandatory
    // `?.[` for optional computed access (state?.[0], never state?[0]).
    const segments: PathSegment[] = [];
    let current: TSESTree.Node = node;

    // Collect all links from leaf to root
    while (current.type === AST_NODE_TYPES.MemberExpression) {
      const memberExpr = current as TSESTree.MemberExpression;

      // Handle computed properties (like array indices)
      if (memberExpr.computed) {
        // why: only a *literal* string/number computed key (obj[0],
        // obj['special-key']) narrows to a single, stable field. EVERY other
        // computed key — Identifier (obj[i]), CallExpression
        // (obj[assertSafe(i)]), BinaryExpression (obj[i+1]), MemberExpression
        // (obj[keys[j]]), TSAsExpression (obj[k as K]), TemplateLiteral
        // (obj[`row-${i}`]), etc. — is a dynamic access that can read
        // arbitrary elements across an iteration. Remaining literal kinds
        // (boolean/null/regex/bigint keys) have no rendering the fixer can
        // guarantee round-trips, so they decline narrowing too rather than
        // emit unreliable text. In every declined case the whole object is a
        // legitimate dependency: resolve the base and mark it accordingly.
        const literalValue =
          memberExpr.property.type === AST_NODE_TYPES.Literal
            ? memberExpr.property.value
            : undefined;
        if (
          typeof literalValue !== 'number' &&
          typeof literalValue !== 'string'
        ) {
          // Check if this is accessing our target object
          let currentBase = unwrapExpression(memberExpr.object);
          while (currentBase.type === AST_NODE_TYPES.MemberExpression) {
            currentBase = unwrapExpression(
              (currentBase as TSESTree.MemberExpression).object,
            );
          }
          if (
            currentBase.type === AST_NODE_TYPES.Identifier &&
            currentBase.name === objectName
          ) {
            // No narrowable field exists, so the entire object is required.
            needsEntireObject = true;
          }
          return null;
        }

        segments.unshift({
          text:
            typeof literalValue === 'number'
              ? `[${literalValue}]`
              : `[${JSON.stringify(literalValue)}]`,
          computed: true,
          optional: memberExpr.optional,
        });
      } else {
        // Regular property access
        if (memberExpr.property.type !== AST_NODE_TYPES.Identifier) {
          return null;
        }

        // Check for a member that cannot serve as a narrowed dependency: a
        // built-in array/string method by name, or — when type information is
        // available — any method of a class or interface. Both denote usage of
        // the entire receiver, because the member itself is a prototype-shared
        // reference rather than per-instance state.
        const isBuiltInWholeObjectMethod =
          !!memberExpr.property.name &&
          (ARRAY_METHODS.has(memberExpr.property.name) ||
            STRING_METHODS.has(memberExpr.property.name));
        if (
          isBuiltInWholeObjectMethod ||
          (typeInfo !== undefined &&
            isMethodMember(typeInfo.checker, memberExpr, typeInfo.nodeMap))
        ) {
          const methodTarget = unwrapExpression(memberExpr.object);
          if (methodTarget.type === AST_NODE_TYPES.MemberExpression) {
            // Method call on a property (e.g., userData.items.map(...) or
            // userData?.items?.map(...)): depend on that property's own path,
            // rendered with the same per-link optional markers as any other
            // access.
            const path = buildAccessPath(methodTarget);
            if (path) {
              usages.set(path, memberExpr.range?.[0] || 0);
            }
          } else if (
            methodTarget.type === AST_NODE_TYPES.Identifier &&
            methodTarget.name === objectName
          ) {
            // Direct method call on the object (e.g., userData.map(...))
            needsEntireObject = true;
          }
          return null;
        }

        segments.unshift({
          text: memberExpr.property.name,
          computed: false,
          optional: memberExpr.optional,
        });
      }

      current = unwrapExpression(memberExpr.object);
    }

    // Check if we reached the target identifier
    const base = unwrapExpression(current);
    if (base.type === AST_NODE_TYPES.Identifier && base.name === objectName) {
      const path = renderPathSegments(objectName, segments);
      pathSegments.set(path, segments);
      return path;
    }

    return null;
  }

  function visit(node: TSESTree.Node): void {
    if (!node || visited.has(node)) return;
    visited.add(node);

    if (node.type === AST_NODE_TYPES.Identifier && node.name === objectName) {
      // Skip TS type assertions, ChainExpression and TSNonNullExpression wrappers
      // (used around the Identifier) so we can attribute the Identifier's usage
      // to its actual parent context (e.g., call/member/assignment) and avoid
      // misclassifying the dependency when determining if the whole object is referenced.
      let wrapperNode: TSESTree.Node = node;
      let effectiveParent = node.parent;
      while (
        effectiveParent &&
        (effectiveParent.type === AST_NODE_TYPES.TSAsExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSTypeAssertion ||
          effectiveParent.type === AST_NODE_TYPES.ChainExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSNonNullExpression)
      ) {
        wrapperNode = effectiveParent;
        effectiveParent = effectiveParent.parent;
      }

      // Exclude: property name in `other.objectName` (not our target object)
      const isMemberProperty =
        effectiveParent?.type === AST_NODE_TYPES.MemberExpression &&
        effectiveParent.property === wrapperNode &&
        !effectiveParent.computed;

      // Exclude: object in `objectName.prop` (handled by MemberExpression visitor for field tracking)
      const isMemberObject =
        effectiveParent?.type === AST_NODE_TYPES.MemberExpression &&
        effectiveParent.object === wrapperNode;

      // Exclude: key in `{ objectName: value }` (not usage, just a label)
      // Include: shorthand `{ objectName }` (actual usage)
      const isPropertyKey =
        effectiveParent?.type === AST_NODE_TYPES.Property &&
        effectiveParent.key === wrapperNode &&
        !effectiveParent.computed &&
        !effectiveParent.shorthand;

      if (!isMemberProperty && !isMemberObject && !isPropertyKey) {
        isUsed = true;

        // Patterns that require the entire object (cannot refactor to specific fields)
        const isTypeAUsage =
          effectiveParent?.type === AST_NODE_TYPES.ReturnStatement ||
          effectiveParent?.type === AST_NODE_TYPES.ArrayExpression ||
          effectiveParent?.type === AST_NODE_TYPES.BinaryExpression ||
          effectiveParent?.type === AST_NODE_TYPES.LogicalExpression ||
          effectiveParent?.type === AST_NODE_TYPES.ConditionalExpression ||
          effectiveParent?.type === AST_NODE_TYPES.UnaryExpression ||
          (effectiveParent?.type === AST_NODE_TYPES.Property &&
            (effectiveParent.value === wrapperNode ||
              effectiveParent.shorthand ||
              (effectiveParent.key === wrapperNode &&
                effectiveParent.computed))) ||
          effectiveParent?.type === AST_NODE_TYPES.TemplateLiteral ||
          effectiveParent?.type === AST_NODE_TYPES.VariableDeclarator ||
          effectiveParent?.type === AST_NODE_TYPES.AssignmentExpression ||
          effectiveParent?.type === AST_NODE_TYPES.JSXExpressionContainer ||
          effectiveParent?.type === AST_NODE_TYPES.JSXSpreadAttribute ||
          effectiveParent?.type === AST_NODE_TYPES.SpreadElement ||
          effectiveParent?.type === AST_NODE_TYPES.ForInStatement ||
          effectiveParent?.type === AST_NODE_TYPES.ForOfStatement ||
          effectiveParent?.type === AST_NODE_TYPES.CallExpression;

        if (isTypeAUsage) {
          needsEntireObject = true;
        }
      }
    }

    if (node.type === AST_NODE_TYPES.CallExpression) {
      // Check if the object is being called as a function
      const callee = unwrapExpression(node.callee);
      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        callee.name === objectName
      ) {
        needsEntireObject = true;
      }

      // Check if the object is directly passed as an argument
      node.arguments.forEach((arg) => {
        const unwrappedArg = unwrapExpression(arg);
        if (
          unwrappedArg.type === AST_NODE_TYPES.Identifier &&
          unwrappedArg.name === objectName
        ) {
          needsEntireObject = true;
        }
      });
    } else if (
      node.type === AST_NODE_TYPES.JSXElement ||
      node.type === AST_NODE_TYPES.JSXFragment
    ) {
      // If we find a JSX element, check its attributes for spread operator
      if (node.type === AST_NODE_TYPES.JSXElement) {
        node.openingElement.attributes.forEach((attr) => {
          if (attr.type === AST_NODE_TYPES.JSXSpreadAttribute) {
            const argument = unwrapExpression(attr.argument);
            if (
              argument.type === AST_NODE_TYPES.Identifier &&
              argument.name === objectName
            ) {
              needsEntireObject = true;
            }
          }
        });
      }
    } else if (node.type === AST_NODE_TYPES.SpreadElement) {
      // If we find a spread operator with our target object, consider it as accessing all properties
      const argument = unwrapExpression(node.argument);
      if (
        argument.type === AST_NODE_TYPES.Identifier &&
        argument.name === objectName
      ) {
        needsEntireObject = true;
        return;
      }
    } else if (node.type === AST_NODE_TYPES.MemberExpression) {
      // Check if this is accessing a property of our target object
      const memberExpr = node as TSESTree.MemberExpression;

      // Skip TS type assertions, ChainExpression and TSNonNullExpression wrappers
      // so we can attribute the MemberExpression's usage to its actual parent
      // context and avoid misclassifying the dependency.
      // We only process if this is the outermost member expression in a chain.
      let effectiveParent = memberExpr.parent;
      while (
        effectiveParent &&
        (effectiveParent.type === AST_NODE_TYPES.TSAsExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSTypeAssertion ||
          effectiveParent.type === AST_NODE_TYPES.ChainExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSNonNullExpression)
      ) {
        effectiveParent = effectiveParent.parent;
      }
      const isIntermediate =
        effectiveParent &&
        effectiveParent.type === AST_NODE_TYPES.MemberExpression;

      if (!isIntermediate) {
        // Check if this member expression involves our target object
        let current: TSESTree.Node = memberExpr;
        let foundTargetObject = false;
        let hasDynamicComputed = false;

        // Walk up the member expression chain to see if it involves our target object
        while (current.type === AST_NODE_TYPES.MemberExpression) {
          const currentMember = current as TSESTree.MemberExpression;

          // Check if this level uses dynamic computed property access.
          // why: any non-literal computed key reads arbitrary elements, so it
          // requires the entire object. Only a literal key (obj[0], obj['k'])
          // narrows to a single, stable field.
          if (
            currentMember.computed &&
            currentMember.property.type !== AST_NODE_TYPES.Literal
          ) {
            hasDynamicComputed = true;
          }

          current = unwrapExpression(currentMember.object);
        }

        // Check if we reached our target object
        const base = unwrapExpression(current);
        if (
          base.type === AST_NODE_TYPES.Identifier &&
          base.name === objectName
        ) {
          foundTargetObject = true;
        }

        if (foundTargetObject) {
          if (hasDynamicComputed) {
            // Dynamic computed property access means we need the entire object
            needsEntireObject = true;
          } else {
            // Static property access - add to usages
            const path = buildAccessPath(memberExpr);
            if (path) {
              usages.set(path, memberExpr.range?.[0] || 0);
            }
          }
        }
      }
    } else if (node.type === AST_NODE_TYPES.ChainExpression) {
      // Handle optional chaining expressions
      if (node.expression.type === AST_NODE_TYPES.MemberExpression) {
        const path = buildAccessPath(node.expression);
        if (path) {
          usages.set(path, node.range?.[0] || 0);
        }
      }
    } else if (
      node.type === AST_NODE_TYPES.BinaryExpression ||
      node.type === AST_NODE_TYPES.LogicalExpression
    ) {
      // Handle binary expressions like `userId || userData?.id`
      visit(node.left);
      visit(node.right);
    } else if (node.type === AST_NODE_TYPES.ConditionalExpression) {
      // Handle ternary expressions
      visit(node.test);
      visit(node.consequent);
      visit(node.alternate);
    } else if (node.type === AST_NODE_TYPES.VariableDeclaration) {
      // Handle variable declarations
      node.declarations.forEach((declaration) => {
        if (declaration.init) {
          visit(declaration.init);
        }
      });
    } else if (node.type === AST_NODE_TYPES.AssignmentExpression) {
      // Handle assignments
      visit(node.right);
    }

    // Visit all child nodes
    for (const key in node) {
      if (key === 'parent') continue; // Skip parent references to avoid cycles

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach((item) => {
            if (item && typeof item === 'object') {
              visit(item);
            }
          });
        } else if ('type' in child) {
          visit(child);
        }
      }
    }
  }

  visit(hookBody);

  // Process paths and determine which ones to include
  const paths = Array.from(usages.keys());
  const finalPaths = new Set<string>();

  paths.forEach((path) => {
    // Always include the main path
    finalPaths.add(path);

    const segments = pathSegments.get(path);
    if (!segments) {
      return;
    }

    // Include the FIRST optional link as an intermediate dependency when more
    // links follow it: for userData?.profile.settings.theme.primary we also
    // want userData?.profile.
    const firstOptionalIndex = segments.findIndex(
      (segment) => segment.optional,
    );
    if (firstOptionalIndex !== -1 && firstOptionalIndex < segments.length - 1) {
      finalPaths.add(
        renderPathSegments(
          objectName,
          segments.slice(0, firstOptionalIndex + 1),
        ),
      );
    }

    // For array access, include the array property itself: for
    // userData.items[0] we also want userData.items. A bracket directly on
    // the base (state[0], state?.[0]) adds nothing — its "array" is the
    // entire object dependency this rule exists to narrow away.
    const firstComputedIndex = segments.findIndex(
      (segment) => segment.computed,
    );
    if (firstComputedIndex > 0) {
      finalPaths.add(
        renderPathSegments(objectName, segments.slice(0, firstComputedIndex)),
      );
    }
  });

  // Convert to array for sorting
  const pathsArray = Array.from(finalPaths);

  // Filter out array paths when we're already accessing specific indices
  // Exception: keep array paths with optional chaining as they represent different dependencies
  const filteredPaths = pathsArray.filter((path) => {
    // Skip array paths if we're accessing specific indices, unless it's optional chaining
    // why: an optional bracket renders as `?.[`, so the specific-index probe
    // must accept both `base[0]` and `base?.[0]` shapes.
    const isArrayWithSpecificIndices = pathsArray.some(
      (otherPath) =>
        otherPath !== path &&
        (otherPath.startsWith(path + '[') ||
          otherPath.startsWith(path + '?.[')),
    );

    // Keep array paths with optional chaining even if specific indices are accessed
    if (isArrayWithSpecificIndices && path.includes('?.')) {
      return true;
    }

    return !isArrayWithSpecificIndices;
  });

  // Sort paths: longer/more specific paths first, then by optional chaining preference
  const sortedPaths = filteredPaths.sort((a, b) => {
    const posA = usages.get(a) || 0;
    const posB = usages.get(b) || 0;

    // For paths with the same base, put longer ones first
    const aDepth = a.split('.').length + (a.includes('[') ? 1 : 0);
    const bDepth = b.split('.').length + (b.includes('[') ? 1 : 0);

    if (aDepth !== bDepth) {
      return bDepth - aDepth; // Longer paths first
    }

    // If same depth, prefer optional chaining paths first
    const aHasOptional = a.includes('?');
    const bHasOptional = b.includes('?');

    if (aHasOptional && !bHasOptional) {
      return -1; // a comes first
    }
    if (!aHasOptional && bHasOptional) {
      return 1; // b comes first
    }

    // If same depth and same optional chaining status, sort by source position
    return posA - posB;
  });

  const filteredUsages = new Set(sortedPaths);
  const notUsed = !needsEntireObject && !isUsed && filteredUsages.size === 0;

  return {
    usages: filteredUsages,
    needsEntireObject,
    notUsed,
  };
}

export const noEntireObjectHookDeps = createRule<[], MessageIds>({
  name: 'no-entire-object-hook-deps',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid using entire objects in React hook dependency arrays.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      avoidEntireObject:
        'What\'s wrong: Dependency array includes entire object "{{objectName}}". Why it matters: Any change to its other properties reruns the hook even though the hook reads only {{fields}}, creating extra renders and stale memoized values. How to fix: Depend on those fields instead.',
      removeUnusedDependency:
        'What\'s wrong: Dependency "{{objectName}}" is listed in the array but never read inside the hook body. Why it matters: The hook reruns when "{{objectName}}" changes without affecting the result and can hide the real missing dependency. How to fix: Remove it or add the specific value that actually drives the hook.',
    },
  },
  defaultOptions: [],
  create(context) {
    // For testing purposes, we'll make the rule work without TypeScript services
    const parserServices = context.parserServices;
    const hasFullTypeChecking =
      parserServices?.program &&
      parserServices?.esTreeNodeToTSNodeMap &&
      typeof parserServices.program.getTypeChecker === 'function';

    // Skip type checking if we don't have TypeScript services
    if (hasFullTypeChecking) {
      // This is just to make the rule work in tests without TypeScript services
      // In a real environment, we would want to enforce this
      // throw new Error('You have to enable the `project` setting in parser options to use this rule');
    }

    // why: building the checker is the expensive half of a typed lint, so the
    // handles are resolved once per file and shared by every type-driven check
    // rather than re-fetched per dependency.
    let typeInfo: TypeInfo | undefined;
    function getTypeInfo(): TypeInfo | undefined {
      if (!hasFullTypeChecking || !parserServices) {
        return undefined;
      }
      if (!typeInfo) {
        typeInfo = {
          checker: parserServices.program.getTypeChecker(),
          nodeMap: parserServices.esTreeNodeToTSNodeMap,
        };
      }
      return typeInfo;
    }

    const sourceCode = context.getSourceCode();

    // why: scanning every comment once per file rather than once per hook call
    // keeps the check off the hot path of files with many hooks.
    let manuallyManagedLines: Set<number> | null = null;
    let disabledForWholeFile = false;

    function collectDisableDirectives(): Set<number> {
      if (manuallyManagedLines) {
        return manuallyManagedLines;
      }

      const lines = new Set<number>();
      for (const comment of sourceCode.getAllComments()) {
        const scope = readExhaustiveDepsDisable(comment);
        if (scope === 'file') {
          disabledForWholeFile = true;
        } else if (scope !== null) {
          lines.add(scope);
        }
      }

      manuallyManagedLines = lines;
      return lines;
    }

    /**
     * Whether the author has taken manual control of this hook's dependency
     * array by suppressing `react-hooks/exhaustive-deps` for it.
     *
     * why: exhaustive-deps is the rule that would otherwise force every read
     * value into the array, so disabling it declares the array hand-maintained.
     * Entries in such an array are load-bearing by construction — an unread one
     * is a deliberate recompute trigger (a hydration flag, a change-detecting
     * hash) whose deletion silently returns a stale value. The comment can sit
     * above the hook call, above the dependency array, or above the closing
     * `}, [...])` line, so any directive landing anywhere within the call
     * counts.
     */
    function hasManuallyManagedDeps(node: TSESTree.CallExpression): boolean {
      const lines = collectDisableDirectives();
      if (disabledForWholeFile) {
        return true;
      }

      for (
        let line = node.loc.start.line;
        line <= node.loc.end.line;
        line += 1
      ) {
        if (lines.has(line)) {
          return true;
        }
      }
      return false;
    }

    return {
      CallExpression(node) {
        if (!isHookCall(node)) {
          return;
        }

        // Get the dependency array argument
        const depsArg = node.arguments[node.arguments.length - 1];
        if (!depsArg || depsArg.type !== AST_NODE_TYPES.ArrayExpression) {
          return;
        }

        // Get the hook callback function
        const callbackArg = node.arguments[0];
        if (
          !callbackArg ||
          (callbackArg.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
            callbackArg.type !== AST_NODE_TYPES.FunctionExpression)
        ) {
          return;
        }

        const callbackBody = (
          callbackArg as
            | TSESTree.ArrowFunctionExpression
            | TSESTree.FunctionExpression
        ).body;
        const isEffect = isEffectHookCall(node);
        const manuallyManagedDeps = hasManuallyManagedDeps(node);

        // Check each dependency in the array
        depsArg.elements.forEach((element) => {
          const unwrappedElement = element ? unwrapExpression(element) : null;
          if (!unwrappedElement) return; // Skip null elements (holes in the array)

          if (unwrappedElement.type === AST_NODE_TYPES.Identifier) {
            const objectName = unwrappedElement.name;

            // Skip type checking if we don't have TypeScript services
            const dependencyTypeInfo = getTypeInfo();
            if (dependencyTypeInfo) {
              // Skip if the dependency is an array or primitive type
              if (
                isArrayOrPrimitive(
                  dependencyTypeInfo.checker,
                  unwrappedElement,
                  dependencyTypeInfo.nodeMap,
                )
              ) {
                return;
              }
            }
            // For testing without TypeScript services, we'll assume all identifiers are objects

            const result = getObjectUsagesInHook(
              callbackBody,
              objectName,
              dependencyTypeInfo,
            );

            // If the object is not used at all, suggest removing it
            if (result.notUsed) {
              // why: deleting an entry from an array the author maintains by
              // hand is presumptuous — the suppression is the declaration that
              // the entries were chosen deliberately, and an unread one is a
              // recompute trigger whose removal yields a stale value. Narrowing
              // an entire object (avoidEntireObject) is a different transform
              // and stays enabled: it preserves the dependency, it does not
              // drop it.
              if (manuallyManagedDeps) {
                return;
              }

              // why: an effect reruns for its side effects, so a dependency the
              // body never reads is normally a deliberate re-run trigger
              // (React's reset-on-scope-change idiom) — deleting it silently
              // stops the effect from rerunning. Only when the body also writes
              // that value (setX for dep x) is the dependency a circular one
              // worth removing. Value-producing hooks (useMemo/useCallback)
              // gain nothing from an unread dependency, so they still report.
              if (
                isEffect &&
                !callsCorrespondingSetter(callbackBody, objectName)
              ) {
                return;
              }

              context.report({
                node: element as TSESTree.Node,
                messageId: 'removeUnusedDependency',
                data: {
                  objectName,
                },
                fix(fixer) {
                  // Remove the element and handle commas properly
                  const elementIndex = depsArg.elements.indexOf(element);

                  if (elementIndex === -1) return null;

                  // If this is the only element, just remove it
                  if (depsArg.elements.length === 1) {
                    return fixer.remove(element as TSESTree.Node);
                  }

                  // If this is the last element, remove the preceding comma
                  if (elementIndex === depsArg.elements.length - 1) {
                    const prevElement = depsArg.elements[elementIndex - 1];
                    if (prevElement) {
                      const range: [number, number] = [
                        prevElement.range![1],
                        (element as TSESTree.Node).range![1],
                      ];
                      return fixer.removeRange(range);
                    }
                  }

                  // Otherwise, remove the element and the following comma
                  const nextElement = depsArg.elements[elementIndex + 1];
                  if (nextElement) {
                    const range: [number, number] = [
                      (element as TSESTree.Node).range![0],
                      nextElement.range![0],
                    ];
                    return fixer.removeRange(range);
                  }

                  // Fallback to just removing the element
                  return fixer.remove(element as TSESTree.Node);
                },
              });
            }
            // If we found specific field usages and the entire object is in deps
            // Skip reporting if needsEntireObject is true (indicates spread operator usage)
            else if (result.usages.size > 0 && !result.needsEntireObject) {
              const fields = Array.from(result.usages).join(', ');
              context.report({
                node: element as TSESTree.Node,
                messageId: 'avoidEntireObject',
                data: {
                  objectName,
                  fields,
                },
                fix(fixer) {
                  return fixer.replaceText(
                    element as TSESTree.Node,
                    Array.from(result.usages).join(', '),
                  );
                },
              });
            }
          }
        });
      },
    };
  },
});
