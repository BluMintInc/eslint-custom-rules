import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'compositingLayer';

type Options = [
  {
    exemptInteractionStates?: boolean;
    exemptStateTransitions?: boolean;
  },
];

// Convert camelCase to kebab-case
function toKebabCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

// Normalize property name to kebab-case for consistent lookup
function normalizePropertyName(name: string): string {
  // If already contains hyphens, assume it's kebab-case
  if (name.includes('-')) return name.toLowerCase();
  // Convert camelCase to kebab-case
  return toKebabCase(name).toLowerCase();
}

// `scale`, `rotate` and `translate` are the individual transform properties.
// They promote a layer exactly as `transform` does, so leaving them out would
// let a declaration the exemptions below refuse under `transform` through
// under another spelling.
const COMPOSITING_PROPERTIES = new Set([
  'filter',
  'backdrop-filter',
  'will-change',
  'transform',
  'perspective',
  'backface-visibility',
  'contain',
  'mix-blend-mode',
  'opacity',
  'scale',
  'rotate',
  'translate',
]);

// The only properties the interaction-state and state-transition exemptions
// may clear. Every other compositing property (`filter`, `backdrop-filter`,
// `will-change`, `mix-blend-mode`, `perspective`, `backface-visibility`,
// `contain`) stays reported in every context: none of them is the cheap,
// compositor-only animation the exemptions exist to allow.
const EXEMPTABLE_PROPERTIES = new Set([
  'transform',
  'opacity',
  'scale',
  'rotate',
  'translate',
]);

// Vendor-prefixed spellings name the same CSS property as their unprefixed
// counterpart: `WebkitTransform` normalizes to `-webkit-transform`, `msTransform`
// to `ms-transform`. Stripping the prefix lets one entry cover every spelling.
function stripVendorPrefix(normalizedName: string): string {
  return normalizedName.replace(/^-?(?:webkit|moz|ms|o)-/, '');
}

// 3D transform functions promote a layer on their own, whatever state the
// element is in, so they are never exempt. Matched case-insensitively and only
// as a function call, so a class name or prose containing the word is inert.
const THREE_D_TRANSFORM_FUNCTION =
  /\b(?:translate3d|translatez|scale3d|scalez|rotate3d|rotatex|rotatey|rotatez|matrix3d|perspective)\s*\(/i;

// `transform` is the only property that takes a transform function as its
// value, so it is the whole key gate for the value-driven arm. A value can only
// act through a property that accepts it; ungated, any key at all was named as
// the offending "CSS property" on the strength of its value alone, including
// `spotFill`, `desktop` and `mobile`, which are not CSS properties in any
// spelling (#2353). Vendor-prefixed spellings normalize onto `transform`, which
// is what keeps `WebkitTransform: 'translate3d(0, 0, 0)'` reported even though
// `-webkit-transform` is absent from COMPOSITING_PROPERTIES.
const TRANSFORM_VALUE_PROPERTIES = new Set(['transform']);

// CSS reset/identity values that explicitly DON'T promote a layer for a given
// property. These are the opt-out counterparts to the promoting values above:
// `none` removes the effect, `auto`/global keywords disable the hint, and the
// default keyword leaves the element un-promoted. Keyed by normalized property
// name so the allowlist stays property-specific (e.g. `none` clears `transform`
// but is not a valid no-op for `opacity`).
const NON_COMPOSITING_VALUES: Record<string, ReadonlySet<string>> = {
  filter: new Set(['none']),
  'backdrop-filter': new Set(['none']),
  transform: new Set(['none']),
  scale: new Set(['none', '1']),
  rotate: new Set(['none']),
  translate: new Set(['none']),
  contain: new Set(['none']),
  perspective: new Set(['none']),
  'will-change': new Set(['auto', 'unset', 'initial', 'inherit', 'revert']),
  'backface-visibility': new Set(['visible']),
  // `normal` is the initial value and creates no stacking context. Because
  // mix-blend-mode is not inherited, `initial`/`unset`/`revert` all resolve to
  // it. `inherit` is excluded: it can resolve to a blending value set higher up.
  'mix-blend-mode': new Set(['normal', 'initial', 'unset', 'revert']),
};

// Stands in for the element the style object applies to while nested selector
// keys are composed, so "on the `&` compound or to its right" is decidable
// after `&` has been substituted away.
const ROOT_MARKER = '\u0000';
// Stands in for an interpolated `${...}` inside a selector key. It matches no
// qualifier pattern, so an unreadable fragment can never qualify a selector.
const INTERPOLATION_MARKER = '\u0001';

// A pseudo-class or class that one element holds at a time (the pointer's
// target, the pressed element, the focused element, and their ancestors). A
// transform under it can never promote a whole list at once.
const INTERACTION_PSEUDO_CLASS =
  /:(?:hover|active|focus|focus-visible|focus-within)(?![\w-])/i;
const INTERACTION_MUI_CLASS = /\.Mui-(?:focusVisible|focused|active)(?![\w-])/;

// A qualifier that flips at runtime rather than describing a static variant:
// MUI's global state classes (`.Mui-checked`, `.Mui-expanded`, ...), state
// pseudo-classes, and ARIA/data/boolean state attributes.
const STATE_PSEUDO_CLASS =
  /:(?:hover|active|focus|focus-visible|focus-within|checked|disabled|enabled|indeterminate|open|popover-open|target|visited|invalid|valid|user-invalid|user-valid|placeholder-shown|autofill|read-only|read-write|fullscreen)(?![\w-])/i;
const STATE_MUI_CLASS = /\.Mui-[a-z][\w]*(?![\w-])/;
const STATE_ATTRIBUTE =
  /\[\s*(?:aria-[\w-]+|data-[\w-]+|open|hidden|disabled|checked|selected)\s*(?:[~|^$*]?=[^\]]*)?\]/i;

const TRANSITION_PROPERTIES = new Set(['transition', 'transition-property']);

const TRANSITION_TIME = /^[+-]?(?:\d+\.?\d*|\.\d+)m?s$/;
const BARE_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const TRANSITION_KEYWORDS = new Set([
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'linear',
  'step-start',
  'step-end',
  'normal',
  'allow-discrete',
]);
const GLOBAL_KEYWORDS = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
]);

// Lexical iteration: a state-driven transform declared inside one of these
// callbacks styles every rendered sibling, and many siblings can be "on" at
// once, so the state-transition exemption is withheld there.
const ITERATION_METHODS = new Set(['map', 'flatMap', 'forEach']);
// Render props the host calls once per item. Every `render*` prop is treated
// as one because the rule cannot tell `renderOption` from `renderInput`, and
// withholding the exemption only keeps the pre-existing report.
const ITEM_RENDER_PROP = /^(?:render[A-Z0-9_]\w*|itemContent|\w+Renderer)$/;

type StyleChain = {
  // Selector keys between the style root and the property, outermost first,
  // with `@media`/`@supports`/`@container` and breakpoint keys skipped.
  selectors: string[];
  // A selector key the rule cannot read (a computed identifier), so no claim
  // about the selector can be made.
  hasUnreadableSelector: boolean;
  // The property's own object, every ancestor object up to the style root, and
  // the sibling entries of an `sx` array, which style the same element.
  objects: TSESTree.ObjectExpression[];
  // The property sits in a conditional or logical operand, e.g.
  // `...(isOpen && { transform })` or `sx={[base, isOpen && { transform }]}`.
  isConditional: boolean;
};

type KeyKind =
  | { kind: 'at-rule' }
  | { kind: 'selector'; selector: string }
  | { kind: 'unreadable-selector' }
  | { kind: 'boundary' };

// A template literal with no substitutions spells a literal exactly, so it is
// read as one; any other non-literal value is unreadable (`null`).
function readStaticText(node: TSESTree.Node): string | null {
  if (node.type === AST_NODE_TYPES.Literal) {
    return String(node.value);
  }
  if (
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.expressions.length === 0
  ) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }
  return null;
}

// Every literal fragment an expression can evaluate to or embed, so a 3D
// transform function is found even inside a ternary or an interpolation.
function collectStaticFragments(node: TSESTree.Node): string[] {
  switch (node.type) {
    case AST_NODE_TYPES.Literal:
      return typeof node.value === 'string' ? [node.value] : [];
    case AST_NODE_TYPES.TemplateLiteral:
      return [
        ...node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw),
        ...node.expressions.flatMap(collectStaticFragments),
      ];
    case AST_NODE_TYPES.ConditionalExpression:
      return [
        ...collectStaticFragments(node.consequent),
        ...collectStaticFragments(node.alternate),
      ];
    case AST_NODE_TYPES.LogicalExpression:
      return [
        ...collectStaticFragments(node.left),
        ...collectStaticFragments(node.right),
      ];
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
      return collectStaticFragments(node.expression);
    default:
      return [];
  }
}

// Strip `!important` and normalize casing so reset/identity values written
// as e.g. `none !important` are still recognized as non-promoting.
function normalizePropertyValue(value: string): string {
  return value
    .replace(/\s*!important\s*$/i, '')
    .trim()
    .toLowerCase();
}

// Splits on `separator` only outside parentheses, brackets and quotes, so
// `cubic-bezier(0.4, 0, 0.2, 1)` and `:is(a, b)` stay whole.
function splitTopLevel(text: string, isSeparator: (ch: string) => boolean) {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth += 1;
    } else if (ch === ')' || ch === ']') {
      depth -= 1;
    } else if (depth === 0 && isSeparator(ch)) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// Individual transform properties take a 3D form through their value grammar
// rather than a function: a third `translate`/`scale` component, or a
// `rotate` axis.
function isThreeDLiteral(propertyName: string, value: string): boolean {
  const tokens = splitTopLevel(normalizePropertyValue(value), (ch) =>
    /\s/.test(ch),
  );
  if (propertyName === 'translate' || propertyName === 'scale') {
    return tokens.length >= 3;
  }
  if (propertyName === 'rotate') {
    return tokens.length >= 2;
  }
  return false;
}

// `:not(:hover)` matches every element that is NOT hovered, the opposite of
// singular, so a negated qualifier must never count.
function stripNegations(compound: string): string {
  let result = compound;
  let start = result.search(/:not\(/i);
  while (start !== -1) {
    let depth = 0;
    let end = start + ':not'.length;
    for (; end < result.length; end += 1) {
      if (result[end] === '(') depth += 1;
      if (result[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    result = result.slice(0, start) + result.slice(end + 1);
    start = result.search(/:not\(/i);
  }
  return result;
}

// The compounds of a composed selector from the one holding the styled
// element rightward. A qualifier to the LEFT of that compound belongs to an
// ancestor (`.MuiList-root:hover &`), which matches every child at once.
function compoundsFromRoot(member: string): string[] {
  const compounds = splitTopLevel(member, (ch) => /[\s>+~]/.test(ch));
  const rootIndex = compounds.findIndex((compound) =>
    compound.includes(ROOT_MARKER),
  );
  return rootIndex === -1 ? [] : compounds.slice(rootIndex).map(stripNegations);
}

// Nested selector keys compose the way emotion composes them: `&` is replaced
// by the parent selector, a key opening with `:` attaches to the parent
// compound, and any other key is a descendant of it.
function composeSelectors(selectors: readonly string[]): string[] {
  let members = [ROOT_MARKER];
  for (const selector of selectors) {
    const next: string[] = [];
    for (const member of splitTopLevel(selector, (ch) => ch === ',')) {
      for (const parent of members) {
        if (member.includes('&')) {
          next.push(member.split('&').join(parent));
        } else if (member.startsWith(':')) {
          next.push(`${parent}${member}`);
        } else {
          next.push(`${parent} ${member}`);
        }
      }
    }
    members = next;
  }
  return members;
}

function carriesInteraction(compound: string): boolean {
  return (
    INTERACTION_PSEUDO_CLASS.test(compound) ||
    INTERACTION_MUI_CLASS.test(compound)
  );
}

function carriesState(compound: string): boolean {
  return (
    carriesInteraction(compound) ||
    STATE_PSEUDO_CLASS.test(compound) ||
    STATE_MUI_CLASS.test(compound) ||
    STATE_ATTRIBUTE.test(compound)
  );
}

// Every comma-separated member of the composed selector must qualify: one
// unqualified member applies the declaration at rest.
function everyMemberQualifies(
  chain: StyleChain,
  qualifies: (compound: string) => boolean,
): boolean {
  if (chain.hasUnreadableSelector || chain.selectors.length === 0) {
    return false;
  }
  return composeSelectors(chain.selectors).every((member) =>
    compoundsFromRoot(member).some(qualifies),
  );
}

function readKeyName(key: TSESTree.Node): string | null {
  if (key.type === AST_NODE_TYPES.Identifier) return key.name;
  if (key.type === AST_NODE_TYPES.Literal) return String(key.value);
  return null;
}

// `[theme.breakpoints.up('md')]` compiles to an `@media` query, so it is
// skipped exactly as a literal `@media` key is.
function isBreakpointKey(key: TSESTree.Node): boolean {
  let current: TSESTree.Node = key;
  for (;;) {
    switch (current.type) {
      case AST_NODE_TYPES.ChainExpression:
        current = current.expression;
        break;
      case AST_NODE_TYPES.TSNonNullExpression:
        current = current.expression;
        break;
      case AST_NODE_TYPES.CallExpression:
        current = current.callee;
        break;
      case AST_NODE_TYPES.MemberExpression:
        if (
          current.property.type === AST_NODE_TYPES.Identifier &&
          current.property.name === 'breakpoints'
        ) {
          return true;
        }
        current = current.object;
        break;
      default:
        return false;
    }
  }
}

function classifyKey(property: TSESTree.Property): KeyKind {
  const { key } = property;
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return /^\s*@/.test(key.value)
      ? { kind: 'at-rule' }
      : { kind: 'selector', selector: key.value };
  }
  if (key.type === AST_NODE_TYPES.TemplateLiteral) {
    const selector = key.quasis
      .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
      .join(INTERPOLATION_MARKER);
    return /^\s*@/.test(selector)
      ? { kind: 'at-rule' }
      : { kind: 'selector', selector };
  }
  if (property.computed) {
    return isBreakpointKey(key)
      ? { kind: 'at-rule' }
      : { kind: 'unreadable-selector' };
  }
  // A bare identifier key (`root`, `sx`, `style`, a slot name) names the
  // element being styled rather than a selector below it.
  return { kind: 'boundary' };
}

// Object entries of an `sx` array element, looking through the conditional
// wrappers MUI's array form is written with.
function objectsOfArrayEntry(
  node: TSESTree.Node | null,
): TSESTree.ObjectExpression[] {
  if (!node) return [];
  switch (node.type) {
    case AST_NODE_TYPES.ObjectExpression:
      return [node];
    case AST_NODE_TYPES.LogicalExpression:
      return objectsOfArrayEntry(node.right);
    case AST_NODE_TYPES.ConditionalExpression:
      return [
        ...objectsOfArrayEntry(node.consequent),
        ...objectsOfArrayEntry(node.alternate),
      ];
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return objectsOfArrayEntry(node.expression);
    default:
      return [];
  }
}

// Climbs from a declaration to the root of the style object it belongs to,
// collecting what both exemptions read. The climb crosses only constructs that
// keep it inside one style value; anything else (a call argument, a JSX
// attribute, a variable declarator, a statement) ends it.
function climbStyleChain(property: TSESTree.Property): StyleChain {
  const selectorsInnerFirst: string[] = [];
  const objects: TSESTree.ObjectExpression[] = [];
  let hasUnreadableSelector = false;
  let isConditional = false;

  let child: TSESTree.Node = property;
  let current: TSESTree.Node | undefined = property.parent;
  climb: while (current) {
    switch (current.type) {
      case AST_NODE_TYPES.ObjectExpression:
        objects.push(current);
        break;
      case AST_NODE_TYPES.ArrayExpression:
        for (const element of current.elements) {
          if (element !== child) objects.push(...objectsOfArrayEntry(element));
        }
        break;
      case AST_NODE_TYPES.Property: {
        if (current.value !== child) break climb;
        const key = classifyKey(current);
        if (key.kind === 'boundary') break climb;
        if (key.kind === 'selector') selectorsInnerFirst.push(key.selector);
        if (key.kind === 'unreadable-selector') hasUnreadableSelector = true;
        break;
      }
      case AST_NODE_TYPES.ConditionalExpression:
        if (current.test === child) break climb;
        isConditional = true;
        break;
      case AST_NODE_TYPES.LogicalExpression:
        isConditional = true;
        break;
      case AST_NODE_TYPES.ArrowFunctionExpression:
        if (current.body !== child) break climb;
        break;
      case AST_NODE_TYPES.SpreadElement:
      case AST_NODE_TYPES.TSAsExpression:
      case AST_NODE_TYPES.TSSatisfiesExpression:
      case AST_NODE_TYPES.TSNonNullExpression:
      case AST_NODE_TYPES.TSTypeAssertion:
        break;
      default:
        break climb;
    }
    child = current;
    current = current.parent;
  }

  return {
    selectors: selectorsInnerFirst.reverse(),
    hasUnreadableSelector,
    objects,
    isConditional,
  };
}

// The properties a transition shorthand animates. An item naming no property
// animates `all`, which is the shorthand's initial `transition-property`.
function readTransitionShorthand(value: string): string[] {
  if (value === 'none') return [];
  return splitTopLevel(value, (ch) => ch === ',').map((item) => {
    const tokens = splitTopLevel(item, (ch) => /\s/.test(ch));
    const property = tokens.find(
      (token) =>
        !TRANSITION_TIME.test(token) &&
        !BARE_NUMBER.test(token) &&
        !TRANSITION_KEYWORDS.has(token) &&
        !token.includes('('),
    );
    return property ?? 'all';
  });
}

function transitionCovers(
  value: TSESTree.Node,
  transitionProperty: string,
  target: string,
): boolean {
  // `isDragging ? 'none' : TRANSITIONS.transform` covers through the branch
  // that animates.
  if (value.type === AST_NODE_TYPES.ConditionalExpression) {
    return (
      transitionCovers(value.consequent, transitionProperty, target) ||
      transitionCovers(value.alternate, transitionProperty, target)
    );
  }
  const text = readStaticText(value);
  // An expression the rule cannot read (`createTransition(...)`,
  // `theme.transitions.create(...)`, a constant) is trusted to cover it.
  if (text === null) return true;
  const normalized = normalizePropertyValue(text);
  if (GLOBAL_KEYWORDS.has(normalized)) return true;
  const animated =
    transitionProperty === 'transition'
      ? readTransitionShorthand(normalized)
      : splitTopLevel(normalized, (ch) => ch === ',');
  return animated.some(
    (name) => name === 'all' || stripVendorPrefix(name) === target,
  );
}

function hasCoveringTransition(chain: StyleChain, target: string): boolean {
  return chain.objects.some((object) =>
    object.properties.some((entry) => {
      if (entry.type !== AST_NODE_TYPES.Property || entry.computed) {
        return false;
      }
      const name = readKeyName(entry.key);
      if (name === null) return false;
      const transitionProperty = stripVendorPrefix(normalizePropertyName(name));
      return (
        TRANSITION_PROPERTIES.has(transitionProperty) &&
        transitionCovers(entry.value, transitionProperty, target)
      );
    }),
  );
}

function isFunctionNode(
  node: TSESTree.Node,
): node is
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

function isIterationCallee(callee: TSESTree.Node): boolean {
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  if (ITERATION_METHODS.has(callee.property.name)) return true;
  return (
    callee.property.name === 'from' &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Array'
  );
}

function isItemRenderProp(fn: TSESTree.Node): boolean {
  const { parent } = fn;
  if (
    parent?.type === AST_NODE_TYPES.JSXExpressionContainer &&
    parent.parent?.type === AST_NODE_TYPES.JSXAttribute &&
    parent.parent.name.type === AST_NODE_TYPES.JSXIdentifier
  ) {
    return ITEM_RENDER_PROP.test(parent.parent.name.name);
  }
  if (
    parent?.type === AST_NODE_TYPES.Property &&
    parent.value === fn &&
    parent.key.type === AST_NODE_TYPES.Identifier
  ) {
    return ITEM_RENDER_PROP.test(parent.key.name);
  }
  return false;
}

function isInsideIteration(node: TSESTree.Node): boolean {
  for (
    let current: TSESTree.Node | undefined = node.parent;
    current;
    current = current.parent
  ) {
    if (!isFunctionNode(current)) continue;
    const { parent } = current;
    if (
      parent?.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments.some((argument) => argument === current) &&
      isIterationCallee(parent.callee)
    ) {
      return true;
    }
    if (isItemRenderProp(current)) return true;
  }
  return false;
}

export const noCompositingLayerProps = createRule<Options, MessageIds>({
  name: 'no-compositing-layer-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage CSS properties that force GPU compositing layers (e.g., transform, filter, will-change). Extra layers consume GPU memory and split rendering work, which slows scrolling and animation when sprinkled across a page. The rule inspects inline style objects and MUI sx props so layer promotion stays intentional rather than incidental.',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          exemptInteractionStates: {
            type: 'boolean',
            default: true,
          },
          exemptStateTransitions: {
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      compositingLayer:
        "CSS property \"{{property}}\" promotes this element to its own GPU compositing layer. On a component repeated in a list or scroll view, one layer per row exhausts GPU memory and tears during scroll. Animate transform/opacity under an interaction state ('&:hover', '&:active', '&:focus-visible'), or drive a state-dependent value with a 'transition'; both are exempt. Otherwise remove it, or keep it with an eslint-disable-next-line comment giving the reason.",
    },
  },
  defaultOptions: [
    {
      exemptInteractionStates: true,
      exemptStateTransitions: true,
    },
  ],
  create(context, [options]) {
    const exemptInteractionStates = options.exemptInteractionStates !== false;
    const exemptStateTransitions = options.exemptStateTransitions !== false;
    const seenNodes = new WeakSet<TSESTree.Node>();

    // The value-driven arm exists to catch a layer-promoting value written under
    // a property spelling COMPOSITING_PROPERTIES misses (a vendor prefix). It
    // therefore requires BOTH: a value that promotes a layer, and a key that is
    // a CSS property whose grammar accepts that value. A key failing the second
    // half is never a CSS property being reported, so it is never reported.
    function checkPropertyValue(
      normalizedName: string,
      value: string,
    ): boolean {
      return (
        TRANSFORM_VALUE_PROPERTIES.has(stripVendorPrefix(normalizedName)) &&
        THREE_D_TRANSFORM_FUNCTION.test(value)
      );
    }

    function checkProperty(
      propertyName: string,
      propertyValue?: string,
    ): boolean {
      const normalizedName = normalizePropertyName(propertyName);
      if (COMPOSITING_PROPERTIES.has(normalizedName)) {
        // Special case for opacity - only warn if it's animated or fractional
        if (normalizedName === 'opacity') {
          if (!propertyValue) return false;
          const numValue = Number.parseFloat(propertyValue);
          if (Number.isNaN(numValue)) return false;
          return numValue > 0 && numValue < 1;
        }
        // CSS reset/identity values can't create a compositing layer, so don't
        // flag them (mirrors the opacity value-awareness for the other props).
        const allowedValues = NON_COMPOSITING_VALUES[normalizedName];
        if (
          allowedValues &&
          propertyValue &&
          allowedValues.has(normalizePropertyValue(propertyValue))
        ) {
          return false;
        }
        return true;
      }
      if (propertyValue && checkPropertyValue(normalizedName, propertyValue)) {
        return true;
      }
      return false;
    }

    // A responsive object or array holds one value per breakpoint, not per
    // state, so it is state-driven only when no entry promotes a layer at rest.
    function isStateDrivenValue(
      normalizedName: string,
      value: TSESTree.Node,
    ): boolean {
      switch (value.type) {
        case AST_NODE_TYPES.TSAsExpression:
        case AST_NODE_TYPES.TSSatisfiesExpression:
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.TSTypeAssertion:
          return isStateDrivenValue(normalizedName, value.expression);
        case AST_NODE_TYPES.ObjectExpression:
          return value.properties.every(
            (entry) =>
              entry.type !== AST_NODE_TYPES.Property ||
              isStateDrivenValue(normalizedName, entry.value),
          );
        case AST_NODE_TYPES.ArrayExpression:
          return value.elements.every(
            (entry) =>
              !entry ||
              entry.type === AST_NODE_TYPES.SpreadElement ||
              isStateDrivenValue(normalizedName, entry),
          );
        default: {
          const literal = readStaticText(value);
          return literal === null || !checkProperty(normalizedName, literal);
        }
      }
    }

    // A 3D transform promotes a layer whatever state the element is in.
    function writesThreeDTransform(
      normalizedName: string,
      value: TSESTree.Node,
      literal: string | null,
    ): boolean {
      if (
        collectStaticFragments(value).some((fragment) =>
          THREE_D_TRANSFORM_FUNCTION.test(fragment),
        )
      ) {
        return true;
      }
      return literal !== null && isThreeDLiteral(normalizedName, literal);
    }

    // Both arms are list-safe by construction. A singular interaction state
    // matches one element per pointer or focus however many siblings exist,
    // and a CSS transition never runs on first paint, so a state-driven value
    // promotes only the element whose state flipped, and only while it
    // animates. The second arm is withheld inside lexical iteration, where
    // many siblings can be "on" at once.
    function isExempt(
      node: TSESTree.Property,
      normalizedName: string,
      literal: string | null,
    ): boolean {
      if (!EXEMPTABLE_PROPERTIES.has(normalizedName)) return false;
      if (!exemptInteractionStates && !exemptStateTransitions) return false;
      if (writesThreeDTransform(normalizedName, node.value, literal)) {
        return false;
      }

      const chain = climbStyleChain(node);
      if (
        exemptInteractionStates &&
        everyMemberQualifies(chain, carriesInteraction)
      ) {
        return true;
      }
      if (!exemptStateTransitions) return false;

      const isStateDriven =
        (literal === null && isStateDrivenValue(normalizedName, node.value)) ||
        chain.isConditional ||
        everyMemberQualifies(chain, carriesState);
      return (
        isStateDriven &&
        hasCoveringTransition(chain, normalizedName) &&
        !isInsideIteration(node)
      );
    }

    // A property key names a `@keyframes` at-rule when it is a string literal
    // (`'@keyframes spin'`) or a template literal whose leading text starts the
    // at-rule (`` [`@keyframes ${name}`] `` for a dynamically-named animation).
    function keyNamesKeyframes(key: TSESTree.Node): boolean {
      if (
        key.type === AST_NODE_TYPES.Literal &&
        typeof key.value === 'string'
      ) {
        return /^\s*@keyframes/i.test(key.value);
      }
      if (
        key.type === AST_NODE_TYPES.TemplateLiteral &&
        key.quasis.length > 0
      ) {
        const leading = key.quasis[0].value.cooked ?? key.quasis[0].value.raw;
        return /^\s*@keyframes/i.test(leading);
      }
      return false;
    }

    // Compositing props declared inside a `@keyframes` block are exempt.
    // Animating `transform`/`opacity` via `@keyframes` is the web-standard,
    // GPU-accelerated animation pattern; this rule targets gratuitous *static*
    // layer promotion, not a deliberate keyframe animation. Scoped to
    // descendants of the `@keyframes` value object, so a static compositing prop
    // sitting as a *sibling* of the `@keyframes` key is still flagged.
    function isInKeyframes(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node.parent;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.Property &&
          keyNamesKeyframes(current.key)
        ) {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    function isStyleContext(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;
      while (current?.parent) {
        // Check for JSX style attribute
        if (
          current.parent.type === AST_NODE_TYPES.JSXAttribute &&
          current.parent.name.type === AST_NODE_TYPES.JSXIdentifier &&
          (current.parent.name.name === 'style' ||
            current.parent.name.name === 'sx')
        ) {
          return true;
        }

        // Check for style-related variable names or properties
        if (
          current.type === AST_NODE_TYPES.VariableDeclarator &&
          current.id.type === AST_NODE_TYPES.Identifier &&
          /style/i.test(current.id.name)
        ) {
          return true;
        }

        // Check for style-related object property assignments
        if (
          current.parent.type === AST_NODE_TYPES.Property &&
          current.parent.key.type === AST_NODE_TYPES.Identifier &&
          (/style/i.test(current.parent.key.name) ||
            current.parent.key.name === 'sx')
        ) {
          return true;
        }

        // Skip if we're in a TypeScript type definition
        if (
          current.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
          current.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
          current.type === AST_NODE_TYPES.TSPropertySignature
        ) {
          return false;
        }

        current = current.parent;
      }
      return false;
    }

    function checkNode(node: TSESTree.Property): void {
      // Skip if we've already processed this node
      if (seenNodes.has(node)) return;
      seenNodes.add(node);

      // Skip if not in a style context
      if (!isStyleContext(node)) return;

      // Skip compositing props inside a @keyframes animation definition
      if (isInKeyframes(node)) return;

      let propertyName = '';

      // Get property name
      if (node.key.type === AST_NODE_TYPES.Identifier) {
        propertyName = node.key.name;
      } else if (node.key.type === AST_NODE_TYPES.Literal) {
        propertyName = String(node.key.value);
      }

      const literal = readStaticText(node.value);

      if (!checkProperty(propertyName, literal ?? '')) return;
      if (isExempt(node, normalizePropertyName(propertyName), literal)) return;

      context.report({
        node,
        messageId: 'compositingLayer',
        data: {
          property: propertyName,
        },
      });
    }

    return {
      // Handle object literal properties (inline styles)
      Property(node: TSESTree.Property) {
        if (node.parent?.type !== AST_NODE_TYPES.ObjectExpression) return;
        checkNode(node);
      },

      // Handle JSX style and sx attributes
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (node.name.name !== 'style' && node.name.name !== 'sx') return;

        if (
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.value.expression.type === AST_NODE_TYPES.ObjectExpression
        ) {
          node.value.expression.properties.forEach((prop) => {
            if (prop.type === AST_NODE_TYPES.Property) {
              checkNode(prop);
            }
          });
        }
      },
    };
  },
});
