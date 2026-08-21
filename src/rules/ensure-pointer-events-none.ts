import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'missingPointerEventsNone';

/**
 * `printWidth` is optional in the schema and required here: `applyDefault` deep
 * merges `defaultOptions` into whatever the consumer passes, so by the time the
 * fixer reads it the value is always present.
 */
type Options = [{ printWidth: number }];

/**
 * Matches Prettier's own default. The fixer writes a property into an object a
 * formatter owns, so a layout it emits past this width is re-laid-out on the
 * next `prettier --write` — and fails `prettier --check` in the meantime.
 */
const DEFAULT_PRINT_WIDTH = 80;

/**
 * Checks if a string contains a pseudo-element selector (::before or ::after)
 */
function hasPseudoElementSelector(selector: string): boolean {
  return /::?(before|after)\b/i.test(selector);
}

/**
 * The four expression assertions state a type about the expression they wrap and
 * contribute no value of their own, so `'none' as const`, `'none' satisfies
 * string`, `('none')!` and `<const>'none'` all denote the same string as
 * `'none'`. A read that classifies the value a property holds must look through
 * every one of them alike, or the verdict turns on which type syntax an author
 * reached for.
 */
const ASSERTION_TYPES = new Set([
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

const isAssertion = (node: TSESTree.Node): node is AssertionExpression =>
  ASSERTION_TYPES.has(node.type);

/**
 * Peels every assertion off a node. Assertions nest — `'none' as const
 * satisfies string` is a satisfies over an as — so a single unwrap would still
 * hand back a wrapper.
 */
function unwrapAssertions(node: TSESTree.Node): TSESTree.Node {
  let target = node;
  while (isAssertion(target)) {
    target = target.expression;
  }
  return target;
}

/**
 * Reads the static string a node denotes, so a property name or value carries
 * the same meaning however it is spelled. A no-substitution template literal is
 * a notation-only rewrite of a quoted string, and CSS-in-JS code writes both.
 *
 * Reading every name and value through one accessor keeps detection and the
 * `pointerEvents` exemption on the same footing. Widening only the detection
 * side would make the rule report objects that already set `pointerEvents` in a
 * spelling it cannot read, and its fixer would append a second key — an object
 * literal with duplicate keys does not compile.
 *
 * An interpolated template stays opaque: its text is not known statically, so
 * the rule keeps its conservative silence there. An assertion around an opaque
 * value is equally opaque: unwrapping reaches the expression underneath, and
 * that expression still decides whether anything can be read.
 */
function staticStringOf(node: TSESTree.Node): string | undefined {
  const target = unwrapAssertions(node);
  if (target.type === AST_NODE_TYPES.Literal) {
    return String(target.value);
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    return target.name;
  }
  if (
    target.type === AST_NODE_TYPES.TemplateLiteral &&
    target.expressions.length === 0 &&
    target.quasis.length === 1
  ) {
    return target.quasis[0].value.cooked ?? target.quasis[0].value.raw;
  }
  return undefined;
}

/**
 * Checks if a property name is position with absolute or fixed value
 */
function isAbsoluteOrFixedPosition(
  propertyName: string,
  propertyValue?: string,
): boolean {
  if (propertyName !== 'position') return false;
  return propertyValue === 'absolute' || propertyValue === 'fixed';
}

/**
 * Checks if a property is pointer-events with a value
 */
function isPointerEventsProperty(propertyName: string): boolean {
  return propertyName === 'pointerEvents' || propertyName === 'pointer-events';
}

/**
 * The inset offsets that position a pseudo-element relative to its origin box.
 * The `inset` shorthand and its logical-property spellings carry the same sign
 * semantics as the longhands, so an overlay must not change verdict on spelling
 * alone.
 */
const INSET_PROPERTIES = new Set([
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'insetInline',
  'insetBlock',
]);

type OffsetSign = 'positive' | 'negative' | 'zero' | 'unknown';

/**
 * Classifies the sign of a leading numeric length in a string offset value
 * (e.g. '-6px' -> negative, '0'/'0px' -> zero, '6px' -> positive). Anything
 * that does not start with an optional-minus number is unknown.
 */
function classifyOffsetString(raw: string): OffsetSign {
  const match = raw.trim().match(/^(-?)(\d+(?:\.\d+)?|\.\d+)/);
  if (!match) return 'unknown';
  const numericPart = parseFloat(match[2]);
  if (numericPart === 0) return 'zero';
  return match[1] === '-' ? 'negative' : 'positive';
}

/**
 * Classifies a value that may carry several space-separated lengths, as the
 * `inset` shorthand does (up to four). A positive component anywhere outranks a
 * negative one: it pulls an edge inside the origin box, where the overlay can
 * occlude the control.
 */
function classifyOffsetComponents(raw: string): OffsetSign {
  // A CSS function such as calc() or var() embeds whitespace inside a single
  // component, so splitting on whitespace would misread its parts as lengths.
  if (raw.includes('(')) return 'unknown';

  const signs = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(classifyOffsetString);
  if (signs.length === 0) return 'unknown';
  if (signs.includes('positive')) return 'positive';
  if (signs.includes('negative')) return 'negative';
  return signs.every((sign) => sign === 'zero') ? 'zero' : 'unknown';
}

/**
 * Classifies an inset offset property value as a positive, negative, zero, or
 * unknown length. Only the shapes that can be resolved statically are
 * classified; variables, member expressions, and calls are treated as unknown
 * and never counted toward the hit-slop exemption.
 */
function classifyOffsetValue(node: TSESTree.Node): OffsetSign {
  // An assertion states a type, not a length. Reading the position through one
  // while leaving the offsets opaque would strip an assertion-written hit-slop
  // overlay of its carve-out and hand it the tap-target-shrinking autofix.
  const value = unwrapAssertions(node);

  if (value.type === AST_NODE_TYPES.Literal) {
    if (typeof value.value === 'number') {
      if (value.value === 0) return 'zero';
      return value.value < 0 ? 'negative' : 'positive';
    }
    if (typeof value.value === 'string') {
      return classifyOffsetComponents(value.value);
    }
    return 'unknown';
  }

  // An offset derived from a named constant states its direction in the leading
  // literal text, whatever the interpolation resolves to: an interpolated
  // negative would render `--8px`, which is not a valid length. Every other
  // interpolation stays opaque and earns no exemption.
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    const leading = value.quasis[0]?.value.raw.trim() ?? '';
    return leading.startsWith('-') ? 'negative' : 'unknown';
  }

  // Negative numeric literals parse as `-` UnaryExpression over a number.
  if (
    value.type === AST_NODE_TYPES.UnaryExpression &&
    value.operator === '-' &&
    value.argument.type === AST_NODE_TYPES.Literal &&
    typeof value.argument.value === 'number'
  ) {
    return value.argument.value === 0 ? 'zero' : 'negative';
  }

  return 'unknown';
}

/** The property the fixer adds, carrying no separator of its own. */
const POINTER_EVENTS_PROPERTY = "pointerEvents: 'none'";

/** The separator-plus-property an inline append writes. */
const INLINE_APPENDED = `, ${POINTER_EVENTS_PROPERTY}`;

/** Leading whitespace of a one-based source line. */
function indentOfLine(sourceCode: TSESLint.SourceCode, line: number): string {
  const text = sourceCode.lines[line - 1] ?? '';
  return /^[ \t]*/.exec(text)?.[0] ?? '';
}

/**
 * The width of a line counting only the code on it, with any comment the line
 * carries masked out.
 *
 * A comment carries no semantics, so it must not decide the layout: measuring
 * the raw line makes the same object fix one way bare and the other way with a
 * comment trailing it, which is the divergence `comment-fix-fidelity` forbids.
 */
function codeWidthOfLine(
  sourceCode: TSESLint.SourceCode,
  line: number,
): number {
  const text = sourceCode.lines[line - 1] ?? '';
  const onLine = sourceCode
    .getAllComments()
    .filter(
      (comment) =>
        comment.loc.start.line <= line && comment.loc.end.line >= line,
    );
  if (onLine.length === 0) return text.length;

  const kept = [...text];
  for (const comment of onLine) {
    const from = comment.loc.start.line === line ? comment.loc.start.column : 0;
    const to =
      comment.loc.end.line === line ? comment.loc.end.column : text.length;
    for (let column = from; column < to && column < kept.length; column++) {
      kept[column] = '';
    }
  }
  return kept.join('').trimEnd().length;
}

/**
 * The column an object lays its properties out at, read from the last property
 * that begins a line of its own. Reading it from the properties rather than
 * from the object keeps the inserted line aligned with the ones already there
 * whatever the file's indentation is: an object opened mid-line
 * (`'&::before': {`) indents its properties past its own column, so the
 * object's column is not the answer.
 */
function propertyIndentOf(
  sourceCode: TSESLint.SourceCode,
  properties: readonly TSESTree.ObjectLiteralElement[],
): string {
  for (let index = properties.length - 1; index >= 0; index--) {
    const property = properties[index];
    const indent = indentOfLine(sourceCode, property.loc.start.line);
    if (indent.length === property.loc.start.column) return indent;
  }
  // No property begins a line, so the layout offers no column to match. The
  // indentation of the line the last property sits on is the closest thing to
  // the depth the object is written at.
  const last = properties[properties.length - 1];
  return indentOfLine(sourceCode, last.loc.start.line);
}

/**
 * The nesting step the file writes, read from the nearest enclosing object that
 * is already broken across lines: the distance between its own column and the
 * column its properties sit at. Reading the step from a neighbour rather than
 * assuming two spaces keeps an emitted layout in the author's units, and a
 * neighbour is a far better witness than a whole-file census — a rule runs on
 * fragments as well as files.
 *
 * Null where no enclosing object is broken, which withdraws the re-layout
 * altogether: with nothing to copy, any step is a guess.
 */
function nestingStepOf(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.ObjectExpression,
): string | null {
  for (
    let current: TSESTree.Node | undefined = node.parent;
    current;
    current = current.parent
  ) {
    if (current.type !== AST_NODE_TYPES.ObjectExpression) continue;
    if (current.properties.length === 0) continue;
    const ownIndent = indentOfLine(sourceCode, current.loc.start.line);
    const propertyIndent = propertyIndentOf(sourceCode, current.properties);
    if (
      propertyIndent.length > ownIndent.length &&
      propertyIndent.startsWith(ownIndent)
    ) {
      return propertyIndent.slice(ownIndent.length);
    }
  }
  return null;
}

/**
 * Whether an unbroken enclosing brace opens on the object's own line, ahead of
 * it. Such a container cannot keep its layout once the object inside it breaks
 * across lines — it no longer fits on one line either — so a formatter re-lays
 * out the whole construct and discards whatever the fixer emitted. JSX carries
 * the same tell: `style={{` puts two of those braces on the line.
 *
 * A brace inside a string or a template on that line reads the same way, which
 * only ever costs a re-layout the formatter performs anyway.
 */
function enclosedByUnbrokenContainer(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.ObjectExpression,
): boolean {
  const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
  return line.slice(0, node.loc.start.column).includes('{');
}

/**
 * Writes the new property on a line of its own at the column the object's other
 * properties occupy. Splicing it onto the end of the last property's text
 * instead puts two properties on one line of an otherwise one-property-per-line
 * object, which a formatter immediately undoes (#2085).
 */
function insertOnOwnLine(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.ObjectExpression,
  lastProperty: TSESTree.ObjectLiteralElement,
  lastPropertyToken: TSESTree.Token,
): TSESLint.RuleFix {
  const indent = propertyIndentOf(sourceCode, node.properties);
  const tokenAfter = sourceCode.getTokenAfter(lastProperty);
  const trailingComma =
    tokenAfter &&
    tokenAfter.value === ',' &&
    tokenAfter.range[1] <= node.range[1]
      ? tokenAfter
      : null;

  // A comment trailing the last property on its own line documents the property
  // it follows. The insertion goes after it, so the comment keeps the property
  // it describes instead of being re-attached to the appended one.
  let anchor: TSESTree.Token = trailingComma ?? lastPropertyToken;
  for (;;) {
    const next = sourceCode.getTokenAfter(anchor, { includeComments: true });
    if (!next || next.range[1] > node.range[1]) break;
    if (
      next.type !== AST_TOKEN_TYPES.Line &&
      next.type !== AST_TOKEN_TYPES.Block
    ) {
      break;
    }
    if (next.loc.start.line !== anchor.loc.end.line) break;
    anchor = next;
  }

  // Everything between the last property and the anchor is reproduced verbatim,
  // so a comment the span absorbs survives the rewrite unedited.
  const absorbed = sourceCode
    .getText()
    .slice(lastPropertyToken.range[1], anchor.range[1]);
  // An object that already ends its last property with a comma keeps that
  // style, and one written without a trailing comma keeps that.
  const separator = trailingComma ? '' : ',';
  const terminator = trailingComma ? ',' : '';
  return fixer.replaceTextRange(
    [lastPropertyToken.range[1], anchor.range[1]],
    `${separator}${absorbed}\n${indent}${POINTER_EVENTS_PROPERTY}${terminator}`,
  );
}

/**
 * Lays a one-line object out one property per line and appends the new property
 * to it. This is what a formatter does to a one-line object that no longer fits,
 * so emitting the appended property inline there would land a layout the next
 * `prettier --write` rewrites.
 *
 * Returns null where the rewrite cannot be made faithfully, leaving the caller
 * to append inline: a broken layout the formatter discards is no worse than the
 * one it replaces, while a lost comment is not recoverable.
 */
function breakAcrossLines(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.ObjectExpression,
): TSESLint.RuleFix[] | null {
  // A comment inside a one-line object has no unambiguous home once the
  // properties are spread over several lines.
  if (sourceCode.getCommentsInside(node).length > 0) return null;
  if (enclosedByUnbrokenContainer(sourceCode, node)) return null;

  const properties = node.properties;
  const openingBrace = sourceCode.getFirstToken(node);
  const closingBrace = sourceCode.getLastToken(node);
  const lastProperty = properties[properties.length - 1];
  const lastPropertyToken = sourceCode.getLastToken(lastProperty);
  if (!openingBrace || !closingBrace || !lastPropertyToken) return null;

  const nestingStep = nestingStepOf(sourceCode, node);
  if (nestingStep === null) return null;
  const objectIndent = indentOfLine(sourceCode, node.loc.start.line);
  const innerIndent = objectIndent + nestingStep;

  const fixes = [
    fixer.replaceTextRange(
      [openingBrace.range[1], properties[0].range[0]],
      `\n${innerIndent}`,
    ),
  ];
  for (let index = 0; index + 1 < properties.length; index++) {
    const separator = sourceCode.getTokenAfter(properties[index]);
    if (!separator || separator.value !== ',') return null;
    fixes.push(
      fixer.replaceTextRange(
        [separator.range[1], properties[index + 1].range[0]],
        `\n${innerIndent}`,
      ),
    );
  }
  // The emitted trailing comma is what Prettier's default `trailingComma`
  // setting prints for a multi-line object, and the one-line form the object
  // arrives in carries no trailing comma to read a preference from.
  fixes.push(
    fixer.replaceTextRange(
      [lastPropertyToken.range[1], closingBrace.range[0]],
      `,\n${innerIndent}${POINTER_EVENTS_PROPERTY},\n${objectIndent}`,
    ),
  );
  return fixes;
}

/**
 * Adds `pointerEvents: 'none'` to a style object in the layout the object is
 * already written in.
 */
function appendPointerEventsNone(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.ObjectExpression,
  printWidth: number,
): TSESLint.RuleFix | TSESLint.RuleFix[] | null {
  const properties = node.properties;
  if (properties.length === 0) return null;

  const lastProperty = properties[properties.length - 1];
  const lastPropertyToken = sourceCode.getLastToken(lastProperty);
  const closingBrace = sourceCode.getLastToken(node);
  if (!lastPropertyToken || !closingBrace) return null;

  // A closing brace on a line of its own is the tell that the object is written
  // one property per line, so the new property joins that column.
  if (closingBrace.loc.start.line !== lastProperty.loc.end.line) {
    return insertOnOwnLine(
      fixer,
      sourceCode,
      node,
      lastProperty,
      lastPropertyToken,
    );
  }

  // The object ends on the line its last property does. A formatter keeps such
  // an object on one line for as long as it fits, so the property is appended
  // there — and the width that decides is measured on the line the appended
  // text actually lands on.
  const landingWidth = codeWidthOfLine(sourceCode, lastProperty.loc.end.line);
  if (landingWidth + INLINE_APPENDED.length <= printWidth) {
    return fixer.insertTextAfter(lastPropertyToken, INLINE_APPENDED);
  }

  return (
    breakAcrossLines(fixer, sourceCode, node) ??
    fixer.insertTextAfter(lastPropertyToken, INLINE_APPENDED)
  );
}

function formatSelector(selector?: string): string {
  if (!selector) return 'pseudo-element';
  const trimmedSelector = selector.trim();
  const candidates = trimmedSelector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const match = candidate.match(/::?(before|after)\b/i);
    if (match) return `::${match[1].toLowerCase()}`;
  }

  if (trimmedSelector.length === 0) return 'pseudo-element';

  const snippet = trimmedSelector.slice(0, 40);
  return trimmedSelector.length > 40 ? `${snippet}...` : trimmedSelector;
}

export const ensurePointerEventsNone = createRule<Options, MessageIds>({
  name: 'ensure-pointer-events-none',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Ensure pointer-events: none is added to non-interactive pseudo-elements',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          printWidth: {
            type: 'integer',
            minimum: 1,
            default: DEFAULT_PRINT_WIDTH,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingPointerEventsNone:
        'What\'s wrong: pseudo-element "{{selector}}" uses absolute or fixed positioning without pointer-events: none. ' +
        'Why it matters: positioned overlays capture clicks, hover, and focus, blocking the underlying control and harming accessibility. ' +
        'How to fix: add pointer-events: none so the pseudo-element stays decorative and does not intercept interactions.',
    },
  },
  defaultOptions: [{ printWidth: DEFAULT_PRINT_WIDTH }] as Options,
  create(context, [{ printWidth }]) {
    // Track style objects that have position: absolute or fixed
    const absolutePositionedStyles = new Map<
      TSESTree.ObjectExpression,
      boolean
    >();

    // Track style objects that already have pointer-events defined
    const stylesWithPointerEvents = new Map<
      TSESTree.ObjectExpression,
      string
    >();

    // Track style objects that declare a `pointerEvents` key whose value cannot
    // be read statically (a member expression, a call, a ternary, an
    // interpolated template). Such a value earns no exemption — it might be
    // 'auto', so the report stands — but it does veto the fix: the rule's only
    // remedy is to append a `pointerEvents` key, and an object literal with two
    // identical keys does not compile (TS1117).
    const stylesWithUnreadablePointerEvents = new Map<
      TSESTree.ObjectExpression,
      boolean
    >();

    // Track style objects that are hit-slop touch-target extensions: an
    // absolute/fixed overlay whose inset offsets only extend beyond the origin
    // box (>=1 negative, none positive). A browser attributes pointer events on
    // a pseudo-element to its origin element, so such an overlay cannot occlude
    // the control and must not be flagged (its autofix would shrink the tap
    // target, the very accessibility regression this rule exists to prevent).
    const hitSlopStyles = new Map<TSESTree.ObjectExpression, boolean>();

    /**
     * Process a CSS-in-JS style object to check for position: absolute/fixed and pointer-events
     */
    function processStyleObject(node: TSESTree.ObjectExpression) {
      let hasAbsolutePosition = false;
      let pointerEventsValue: string | undefined;
      let hasUnreadablePointerEvents = false;
      let hasNegativeOffset = false;
      let hasPositiveOffset = false;

      // Check each property in the style object
      for (const property of node.properties) {
        if (property.type !== AST_NODE_TYPES.Property) continue;

        const propertyName = staticStringOf(property.key) ?? '';
        const propertyValue = staticStringOf(property.value);

        // Check if this is position: absolute/fixed
        if (isAbsoluteOrFixedPosition(propertyName, propertyValue)) {
          hasAbsolutePosition = true;
        }

        // Check if this is pointer-events property. A value that can be read
        // decides the exemption; one that cannot is recorded separately, because
        // the key's presence vetoes the fix even where it cannot prove the
        // overlay is inert. An unreadable value never clears one already read.
        if (isPointerEventsProperty(propertyName)) {
          if (propertyValue !== undefined) {
            pointerEventsValue = propertyValue;
          } else {
            hasUnreadablePointerEvents = true;
          }
        }

        // Track inset offsets to detect hit-slop touch-target extensions
        if (INSET_PROPERTIES.has(propertyName)) {
          const sign = classifyOffsetValue(property.value);
          if (sign === 'negative') {
            hasNegativeOffset = true;
          } else if (sign === 'positive') {
            hasPositiveOffset = true;
          }
        }
      }

      // Store the results for this style object
      absolutePositionedStyles.set(node, hasAbsolutePosition);
      if (pointerEventsValue !== undefined) {
        stylesWithPointerEvents.set(node, pointerEventsValue);
      }
      stylesWithUnreadablePointerEvents.set(node, hasUnreadablePointerEvents);

      // A hit-slop extension only enlarges the tappable area: it is
      // absolute/fixed and its inset offsets extend outward (>=1 negative, none
      // positive). Such overlays cannot occlude the control they belong to.
      hitSlopStyles.set(
        node,
        hasAbsolutePosition && hasNegativeOffset && !hasPositiveOffset,
      );
    }

    /**
     * Check if a style object needs pointer-events: none
     */
    function checkStyleObject(
      node: TSESTree.ObjectExpression,
      selector?: string,
    ) {
      const isPseudoElement = selector && hasPseudoElementSelector(selector);
      const isAbsolutePositioned = absolutePositionedStyles.get(node) || false;
      const pointerEventsValue = stylesWithPointerEvents.get(node);

      // A hit-slop touch-target extension extends the origin element's tappable
      // area outward; because pointer events on it are attributed to the origin
      // control, it cannot block anything. Skip reporting (and its destructive
      // shrink-the-tap-target autofix).
      if (hitSlopStyles.get(node)) {
        return;
      }

      // If this is a pseudo-element with absolute positioning but no pointer-events
      if (
        isPseudoElement &&
        isAbsolutePositioned &&
        pointerEventsValue === undefined
      ) {
        context.report({
          node,
          messageId: 'missingPointerEventsNone',
          data: {
            selector: formatSelector(selector),
          },
          fix(fixer) {
            // The object already declares `pointerEvents`, but in a spelling
            // whose value cannot be read. Appending the key is the rule's only
            // remedy, and here it would emit a duplicate key that does not
            // compile. A report with no fix is the correct outcome: the reader
            // decides what the opaque value resolves to.
            if (stylesWithUnreadablePointerEvents.get(node)) return null;

            return appendPointerEventsNone(
              fixer,
              context.sourceCode,
              node,
              printWidth,
            );
          },
        });
      }

      // If this is a pseudo-element with absolute positioning and pointer-events: auto
      if (
        isPseudoElement &&
        isAbsolutePositioned &&
        pointerEventsValue === 'auto'
      ) {
        // Don't report an error if pointer-events is explicitly set to 'auto'
        // This is an intentional choice by the developer
      }
    }

    return {
      // Check for pseudo-element selectors in styled-components and similar libraries
      TaggedTemplateExpression(node: TSESTree.TaggedTemplateExpression) {
        // Check if this is a styled-components template
        const tag = node.tag;
        let isStyledComponent = false;

        if (
          tag.type === AST_NODE_TYPES.MemberExpression &&
          tag.object.type === AST_NODE_TYPES.Identifier &&
          tag.object.name === 'styled'
        ) {
          isStyledComponent = true;
        } else if (
          tag.type === AST_NODE_TYPES.Identifier &&
          (tag.name === 'styled' || tag.name === 'css')
        ) {
          isStyledComponent = true;
        }

        if (isStyledComponent) {
          // For styled-components, we need to check the template content
          const template = node.quasi.quasis.map((q) => q.value.raw).join('');

          // Check if it contains a pseudo-element with position: absolute/fixed
          if (
            hasPseudoElementSelector(template) &&
            (template.includes('position: absolute') ||
              template.includes('position: fixed'))
          ) {
            // Check if it's missing pointer-events: none
            if (
              !template.includes('pointer-events: none') &&
              !template.includes('pointer-events:none')
            ) {
              context.report({
                node,
                messageId: 'missingPointerEventsNone',
                data: {
                  selector: formatSelector(template),
                },
              });
            }
          }
        }
      },

      // Process style objects in JSX
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (
          node.name.type !== AST_NODE_TYPES.JSXIdentifier ||
          node.name.name !== 'style'
        )
          return;

        if (
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.value.expression.type === AST_NODE_TYPES.ObjectExpression
        ) {
          processStyleObject(node.value.expression);
          checkStyleObject(node.value.expression);
        }
      },

      // Process style objects in regular JavaScript/TypeScript
      ObjectExpression(node: TSESTree.ObjectExpression) {
        // Skip if parent is not a variable declaration or assignment
        const parent = node.parent;
        if (!parent) return;

        // Check if this might be a style object
        let isStyleObject = false;
        let selector: string | undefined;

        if (
          parent.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.id.type === AST_NODE_TYPES.Identifier &&
          /style/i.test(parent.id.name)
        ) {
          isStyleObject = true;
        } else if (
          parent.type === AST_NODE_TYPES.Property &&
          parent.key.type === AST_NODE_TYPES.Identifier &&
          /style/i.test(parent.key.name)
        ) {
          isStyleObject = true;
        } else if (parent.type === AST_NODE_TYPES.CallExpression) {
          // Check for CSS-in-JS libraries like emotion's css() function
          const callee = parent.callee;
          if (
            callee.type === AST_NODE_TYPES.Identifier &&
            callee.name === 'css'
          ) {
            isStyleObject = true;
          }
        }

        if (isStyleObject) {
          processStyleObject(node);
          checkStyleObject(node, selector);
        }
      },

      // Process CSS-in-JS libraries that use objects with selectors
      Property(node: TSESTree.Property) {
        // Check for patterns like { '&::before': { ... } }
        const selector = staticStringOf(node.key);
        if (
          selector !== undefined &&
          hasPseudoElementSelector(selector) &&
          node.value.type === AST_NODE_TYPES.ObjectExpression
        ) {
          processStyleObject(node.value);
          checkStyleObject(node.value, selector);
        }
      },
    };
  },
});
