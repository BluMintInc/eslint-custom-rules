import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

type MessageIds = 'useFlexGapRequired';

/**
 * `applyDefault` deep merges `defaultOptions` into whatever the consumer passes
 * and an array value replaces rather than extends, so both keys are present by
 * the time `create` reads them.
 */
type Options = [
  {
    stackComponents: string[];
    importSources: string[];
  },
];

const DEFAULT_STACK_COMPONENTS = ['Stack'];

/**
 * Both spellings occur in the consuming codebase: the deep default path in the
 * overwhelming majority of files, the barrel in a handful.
 */
const DEFAULT_IMPORT_SOURCES = ['@mui/material/Stack', '@mui/material'];

/** The attribute whose presence exempts, and the one the fixer writes. */
const USE_FLEX_GAP = 'useFlexGap';

/**
 * The two `flex-wrap` values that put children on more than one line. Everything
 * else — `nowrap`, the initial value, an unresolvable expression — leaves a
 * single line, where margin-based spacing renders correctly.
 */
const WRAPPING_VALUES = new Set(['wrap', 'wrap-reverse']);

/**
 * `x as T`, `<T>x`, `x satisfies T` and `x!` assert a type about the expression
 * they wrap without contributing a value, so a read that classifies the SHAPE or
 * the VALUE of an expression must look through all four alike.
 *
 * This is load-bearing rather than defensive here: `global-const-style` rewrites
 * hoisted style constants into `const ROW_SX = { ... } as const`, so the `sx`
 * constants this rule resolves arrive assertion-wrapped and a resolver keyed on
 * `ObjectExpression` alone goes silently quiet on them (#1805).
 */
const ASSERTION_EXPRESSION_TYPES = new Set([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
]);

type AssertionExpression =
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.TSTypeAssertion;

const isAssertionExpression = (
  node: TSESTree.Node,
): node is AssertionExpression => ASSERTION_EXPRESSION_TYPES.has(node.type);

/** Peels every assertion wrapper, since assertions nest. */
function unwrapAssertions(node: TSESTree.Node): TSESTree.Node {
  let target: TSESTree.Node = node;
  while (isAssertionExpression(target)) {
    target = target.expression;
  }
  return target;
}

/**
 * The component a deep import path names. `@mui/material/Stack` denotes `Stack`
 * whatever the local binding is called, which is what separates the real import
 * from the copy-paste defect `import Stack from '@mui/material/Typography'`.
 */
function finalSegmentOf(source: string): string {
  const segments = source.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? source;
}

/**
 * A verdict of `undefined` means "not resolvable here", which is distinct from
 * `false`. The distinction decides precedence: an unreadable `flexWrap`
 * attribute must fall through to the `sx` object rather than answer for it.
 */
type WrapVerdict = boolean | undefined;

export const enforceUseFlexGapOnWrap = createRule<Options, MessageIds>({
  name: 'enforce-use-flex-gap-on-wrap',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require `useFlexGap` on a MUI `Stack` that wraps and passes `spacing`, because margin-based spacing leaves the wrapped line with no row gap and a phantom leading indent',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          stackComponents: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Component names treated as MUI Stack. A name here is checked only after its binding resolves to an allowed import source, so a local component that shadows the name is never flagged.',
          },
          importSources: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Import sources whose Stack binding this rule governs.',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useFlexGapRequired:
        "`Stack` sets `flexWrap: 'wrap'` with margin-based `spacing`: the wrapped line gets no row gap and a phantom leading indent. Add `useFlexGap` to route `spacing` onto CSS `gap`.",
    },
  },
  defaultOptions: [
    {
      stackComponents: DEFAULT_STACK_COMPONENTS,
      importSources: DEFAULT_IMPORT_SOURCES,
    },
  ],
  create(context, [options]) {
    const stackComponents = new Set(
      options.stackComponents ?? DEFAULT_STACK_COMPONENTS,
    );
    const importSources = new Set(
      options.importSources ?? DEFAULT_IMPORT_SOURCES,
    );
    const sourceCode = context.getSourceCode();

    /**
     * The single expression a name is initialized with, or undefined when the
     * name is not a write-once local. Resolution walks the real scope chain, so
     * a module constant read from inside a component is found while a parameter
     * or any other inner binding of the same name shadows it correctly.
     *
     * A name written more than once does not denote its initializer, so
     * following it would trade a conservative miss for a wrong answer.
     */
    function initializerOf(
      node: TSESTree.Identifier,
    ): TSESTree.Node | undefined {
      const scope = ASTHelpers.getScope(context, node);
      const variable = ASTHelpers.findVariableInScope(scope, node.name);
      if (!variable || variable.defs.length !== 1) {
        return undefined;
      }
      const [definition] = variable.defs;
      if (
        definition.node.type !== AST_NODE_TYPES.VariableDeclarator ||
        !definition.node.init
      ) {
        return undefined;
      }
      return unwrapAssertions(definition.node.init);
    }

    /** Whether one import binding is MUI's `Stack` under the configured sets. */
    function bindsMuiStack(definition: TSESLint.Scope.Definition): boolean {
      const declaration = definition.parent;
      if (
        !declaration ||
        declaration.type !== AST_NODE_TYPES.ImportDeclaration ||
        typeof declaration.source.value !== 'string' ||
        !importSources.has(declaration.source.value)
      ) {
        return false;
      }
      const specifier = definition.node;
      if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
        const { imported } = specifier;
        return (
          imported.type === AST_NODE_TYPES.Identifier &&
          stackComponents.has(imported.name)
        );
      }
      if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
        // The PATH names the component for a default import, which is what makes
        // `import Stack from '@mui/material/Typography'` a non-match.
        return stackComponents.has(finalSegmentOf(declaration.source.value));
      }
      // A namespace import is reached as `<Mui.Stack>`, a member expression this
      // rule does not visit.
      return false;
    }

    /**
     * Whether the element name denotes MUI's `Stack` at this point in the file.
     * Every definition must qualify: a name bound both by an import and by a
     * local declaration is not provably the import at the use site.
     */
    function resolvesToMuiStack(node: TSESTree.JSXIdentifier): boolean {
      const scope = ASTHelpers.getScope(context, node);
      const variable = ASTHelpers.findVariableInScope(scope, node.name);
      if (!variable || variable.defs.length === 0) {
        return false;
      }
      return variable.defs.every(bindsMuiStack);
    }

    /** The expression an attribute carries, or undefined for a bare attribute. */
    function attributeValueOf(
      attribute: TSESTree.JSXAttribute,
    ): TSESTree.Node | undefined {
      const { value } = attribute;
      if (!value) {
        return undefined;
      }
      if (value.type === AST_NODE_TYPES.Literal) {
        return value;
      }
      if (value.type === AST_NODE_TYPES.JSXExpressionContainer) {
        const expression = unwrapAssertions(value.expression);
        return expression.type === AST_NODE_TYPES.JSXEmptyExpression
          ? undefined
          : expression;
      }
      return undefined;
    }

    /** The static name of an object property key, or undefined when computed. */
    function propertyNameOf(property: TSESTree.Property): string | undefined {
      const key = unwrapAssertions(property.key);
      if (key.type === AST_NODE_TYPES.Identifier && !property.computed) {
        return key.name;
      }
      if (key.type === AST_NODE_TYPES.Literal) {
        return typeof key.value === 'string' ? key.value : undefined;
      }
      return undefined;
    }

    /**
     * Whether a `flexWrap` value puts children on more than one line.
     *
     * A responsive object answers true when ANY breakpoint wraps: the seam is
     * real at that width, and the rule deliberately does not reconcile a
     * responsive `flexWrap` against a responsive `spacing` breakpoint by
     * breakpoint.
     */
    function wrapVerdict(
      node: TSESTree.Node | undefined,
      seen: Set<TSESTree.Node>,
    ): WrapVerdict {
      if (!node) {
        return undefined;
      }
      const target = unwrapAssertions(node);
      switch (target.type) {
        case AST_NODE_TYPES.Literal:
          return typeof target.value === 'string'
            ? WRAPPING_VALUES.has(target.value)
            : undefined;
        case AST_NODE_TYPES.TemplateLiteral:
          return target.expressions.length === 0
            ? WRAPPING_VALUES.has(target.quasis[0]?.value.cooked ?? '')
            : undefined;
        case AST_NODE_TYPES.Identifier: {
          if (seen.has(target)) {
            return undefined;
          }
          seen.add(target);
          return wrapVerdict(initializerOf(target), seen);
        }
        case AST_NODE_TYPES.ObjectExpression: {
          let verdict: WrapVerdict = false;
          for (const property of target.properties) {
            const value =
              property.type === AST_NODE_TYPES.SpreadElement
                ? wrapVerdict(property.argument, seen)
                : wrapVerdict(property.value, seen);
            if (value === true) {
              return true;
            }
            if (value === undefined) {
              verdict = undefined;
            }
          }
          return verdict;
        }
        case AST_NODE_TYPES.ConditionalExpression: {
          const consequent = wrapVerdict(target.consequent, seen);
          const alternate = wrapVerdict(target.alternate, seen);
          if (consequent === true || alternate === true) {
            return true;
          }
          return consequent === false && alternate === false
            ? false
            : undefined;
        }
        case AST_NODE_TYPES.LogicalExpression: {
          const left = wrapVerdict(target.left, seen);
          const right = wrapVerdict(target.right, seen);
          if (left === true || right === true) {
            return true;
          }
          return left === false && right === false ? false : undefined;
        }
        default:
          return undefined;
      }
    }

    /** Whether an object literal states a wrapping `flexWrap`. */
    function objectWraps(
      object: TSESTree.ObjectExpression,
      seen: Set<TSESTree.Node>,
    ): boolean {
      for (const property of object.properties) {
        if (property.type === AST_NODE_TYPES.SpreadElement) {
          // A spread of a local constant is read through; a spread of an
          // imported or caller-supplied value stays opaque, because resolving it
          // would need the cross-module analysis this rule declines.
          if (sxWraps(property.argument, seen)) {
            return true;
          }
          continue;
        }
        if (propertyNameOf(property) !== 'flexWrap') {
          continue;
        }
        if (wrapVerdict(property.value, seen) === true) {
          return true;
        }
      }
      return false;
    }

    /**
     * Whether an `sx` expression states a wrapping `flexWrap` anywhere the rule
     * can read statically. Four of the six wrapping Stacks in the consuming
     * codebase hoist their `sx` to a module constant, including both live
     * violations, so identifier resolution is the path that matters most.
     */
    function sxWraps(
      node: TSESTree.Node | undefined,
      seen: Set<TSESTree.Node>,
    ): boolean {
      if (!node) {
        return false;
      }
      const target = unwrapAssertions(node);
      switch (target.type) {
        case AST_NODE_TYPES.ObjectExpression:
          return objectWraps(target, seen);
        case AST_NODE_TYPES.Identifier: {
          if (seen.has(target)) {
            return false;
          }
          seen.add(target);
          return sxWraps(initializerOf(target), seen);
        }
        case AST_NODE_TYPES.ArrowFunctionExpression: {
          const body = unwrapAssertions(target.body);
          if (body.type === AST_NODE_TYPES.BlockStatement) {
            return body.body.some(
              (statement) =>
                statement.type === AST_NODE_TYPES.ReturnStatement &&
                sxWraps(statement.argument ?? undefined, seen),
            );
          }
          return sxWraps(body, seen);
        }
        case AST_NODE_TYPES.ConditionalExpression:
          // Either branch renders, so either branch wrapping is a real seam.
          return (
            sxWraps(target.consequent, seen) || sxWraps(target.alternate, seen)
          );
        case AST_NODE_TYPES.ArrayExpression:
          // MUI merges an array of sx entries left to right.
          return target.elements.some((element) =>
            element ? sxWraps(element, seen) : false,
          );
        default:
          // A call expression is opaque. Guessing at what it returns would
          // report on code the rule cannot read.
          return false;
      }
    }

    /**
     * Whether a `spacing` value is statically zero. The value is not interpreted
     * further: `spacing={0}` exists precisely so an `sx` gap owns the rhythm,
     * while every non-zero value emits the sibling margins this rule is about.
     */
    function isZeroSpacing(
      node: TSESTree.Node | undefined,
      seen: Set<TSESTree.Node>,
    ): boolean {
      if (!node) {
        // A bare `spacing` attribute is not zero.
        return false;
      }
      const target = unwrapAssertions(node);
      if (target.type === AST_NODE_TYPES.Literal) {
        return target.value === 0 || target.value === '0';
      }
      if (target.type === AST_NODE_TYPES.Identifier) {
        if (seen.has(target)) {
          return false;
        }
        seen.add(target);
        return isZeroSpacing(initializerOf(target), seen);
      }
      return false;
    }

    /**
     * The whitespace run that ends the gap before a node, reused so the inserted
     * attribute lands in the layout the author (and prettier) already chose.
     * Only the whitespace is copied: a comment can sit between two attributes,
     * and carrying the whole gap would duplicate it.
     */
    function separatorBefore(node: TSESTree.Node): string {
      const previous = sourceCode.getTokenBefore(node, {
        includeComments: true,
      });
      const gap = previous
        ? sourceCode.text.slice(previous.range[1], node.range[0])
        : ' ';
      const trailing = /\s*$/.exec(gap)?.[0] ?? '';
      const lastBreak = trailing.lastIndexOf('\n');
      return lastBreak === -1 ? ' ' : `\n${trailing.slice(lastBreak + 1)}`;
    }

    /**
     * Inserts the bare `useFlexGap` attribute in alphabetical position, which is
     * how this codebase orders JSX attributes: appending at the end would land a
     * second lint error on top of the fix.
     *
     * The insert joins the run of named attributes FOLLOWING the last spread. A
     * spread can carry `useFlexGap` of its own, and JSX resolves the later
     * writer, so writing after it is what makes the fix take effect.
     */
    function insertUseFlexGap(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.JSXOpeningElement,
    ): TSESLint.RuleFix | null {
      const { attributes } = node;
      if (attributes.length === 0) {
        return null;
      }
      let groupStart = 0;
      attributes.forEach((attribute, index) => {
        if (attribute.type === AST_NODE_TYPES.JSXSpreadAttribute) {
          groupStart = index + 1;
        }
      });
      const successor = attributes
        .slice(groupStart)
        .find(
          (attribute) =>
            attribute.type === AST_NODE_TYPES.JSXAttribute &&
            attribute.name.type === AST_NODE_TYPES.JSXIdentifier &&
            attribute.name.name > USE_FLEX_GAP,
        );
      if (successor) {
        return fixer.insertTextBefore(
          successor,
          `${USE_FLEX_GAP}${separatorBefore(successor)}`,
        );
      }
      const last = attributes[attributes.length - 1];
      return fixer.insertTextAfter(
        last,
        `${separatorBefore(last)}${USE_FLEX_GAP}`,
      );
    }

    return {
      JSXOpeningElement(node: TSESTree.JSXOpeningElement) {
        const elementName = node.name;
        if (elementName.type !== AST_NODE_TYPES.JSXIdentifier) {
          return;
        }
        if (!stackComponents.has(elementName.name)) {
          return;
        }

        const named = new Map<string, TSESTree.JSXAttribute>();
        for (const attribute of node.attributes) {
          if (
            attribute.type === AST_NODE_TYPES.JSXAttribute &&
            attribute.name.type === AST_NODE_TYPES.JSXIdentifier
          ) {
            named.set(attribute.name.name, attribute);
          }
        }

        // Whatever else it sets, an element that already states the pairing is
        // compliant — including an explicit opt-out, which is a decision rather
        // than an oversight.
        if (named.has(USE_FLEX_GAP)) {
          return;
        }

        // `spacing` is the trigger, never the absence of a gap. A wrapping Stack
        // that reaches past `useFlexGap` for `rowGap` or an `sx` `gap` buys some
        // separation and leaves the phantom indent in place, so neither shape
        // can exempt.
        const spacing = named.get('spacing');
        if (!spacing || isZeroSpacing(attributeValueOf(spacing), new Set())) {
          return;
        }

        const flexWrap = named.get('flexWrap');
        const attributeVerdict = flexWrap
          ? wrapVerdict(attributeValueOf(flexWrap), new Set())
          : undefined;
        const sx = named.get('sx');
        // The attribute wins where both spell `flexWrap` and disagree; an
        // unreadable attribute is not a disagreement, so it falls through.
        const wraps =
          attributeVerdict ??
          (sx ? sxWraps(attributeValueOf(sx), new Set()) : false);
        if (!wraps) {
          return;
        }

        if (!resolvesToMuiStack(elementName)) {
          return;
        }

        context.report({
          node: elementName,
          messageId: 'useFlexGapRequired',
          fix: (fixer) => insertUseFlexGap(fixer, node),
        });
      },
    };
  },
});
