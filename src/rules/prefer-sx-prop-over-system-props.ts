import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferSxProp';

type Options = [
  {
    components?: string[];
    allowedProps?: string[];
    printWidth?: number;
  },
];

/**
 * Matches Prettier's own default. The autofix rewrites JSX that a formatter
 * owns, so a line it emits past this width is rewritten on the next
 * `prettier --write` — and fails `prettier --check` in the meantime.
 */
const DEFAULT_PRINT_WIDTH = 80;

/**
 * The canonical set of MUI system props that are deprecated in favor of `sx`.
 * These are all props that MUI resolves via its system/styled engine and will
 * remove in the next major release. Deliberately excludes props that serve a
 * dual role as real component API (e.g. `spacing`, `direction` on Stack,
 * Grid breakpoint props).
 */
const MUI_SYSTEM_PROPS = new Set([
  // Spacing — margin
  'm',
  'mt',
  'mr',
  'mb',
  'ml',
  'mx',
  'my',
  // Spacing — padding
  'p',
  'pt',
  'pr',
  'pb',
  'pl',
  'px',
  'py',
  // Sizing
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'boxSizing',
  // Display / overflow / visibility
  'display',
  'displayPrint',
  'overflow',
  'textOverflow',
  'visibility',
  'whiteSpace',
  // Flexbox
  'flexDirection',
  'flexWrap',
  'justifyContent',
  'justifyItems',
  'justifySelf',
  'alignItems',
  'alignContent',
  'alignSelf',
  'order',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  // CSS Grid
  'gap',
  'rowGap',
  'columnGap',
  'gridColumn',
  'gridRow',
  'gridArea',
  'gridAutoFlow',
  'gridAutoColumns',
  'gridAutoRows',
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridTemplateAreas',
  // Positioning
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
  // Color / background
  'color',
  'bgcolor',
  // Borders
  'border',
  'borderTop',
  'borderRight',
  'borderBottom',
  'borderLeft',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRadius',
  // Shadows
  'boxShadow',
  // Typography
  'typography',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textTransform',
]);

/**
 * Default MUI component names to check. The user can extend this via options.
 */
const DEFAULT_MUI_COMPONENTS = new Set([
  'Box',
  'Stack',
  'Typography',
  'Grid',
  'Paper',
  'Container',
  'Card',
  'CardContent',
  'CardActions',
  'Button',
  'IconButton',
  'Chip',
  'Avatar',
  'Badge',
  'Divider',
  'List',
  'ListItem',
  'ListItemText',
  'ListItemIcon',
  'Menu',
  'MenuItem',
  'Drawer',
  'Dialog',
  'DialogTitle',
  'DialogContent',
  'DialogActions',
  'Tabs',
  'Tab',
  'AppBar',
  'Toolbar',
]);

/**
 * Props a component declares as its own first-class API, keyed by the
 * (component, prop) pair. Each name below collides with a system prop, but the
 * component *consumes* it — feeding `ownerState`, selecting a theme value and
 * MUI's internal `.Mui*-*` class selectors — instead of forwarding it as CSS.
 * The system-prop reading is therefore wrong for the pair whatever value is
 * written, and moving the prop into `sx` emits a declaration whose value is not
 * a CSS value for that property: the browser drops it, so the fix type-checks
 * (`SxProps` accepts `string | number`), lints clean, and silently loses the
 * styling.
 *
 * The keying has to be per pair, not per prop name: the same name is a genuine
 * system prop elsewhere (`color` on `Typography`, `maxWidth` on `Box`), so
 * exempting the bare name would blind the rule on every other component.
 */
const COMPONENT_OWN_PROPS = new Map<string, ReadonlySet<string>>([
  // `color` is a closed palette/variant selector (`'primary' | 'error' | …`)
  // on these — never a CSS color (#1273). On `AppBar` it picks the *background*
  // shade, so the system-prop reading also targets the wrong CSS property.
  ['Button', new Set(['color'])],
  ['IconButton', new Set(['color'])],
  ['Chip', new Set(['color'])],
  ['Badge', new Set(['color'])],
  ['AppBar', new Set(['color'])],
  // `maxWidth` is a breakpoint KEY (`'xs' | … | 'xl' | false`) that selects a
  // width from `theme.breakpoints.values` and drives the `maxWidth*` class
  // (#1966). As CSS, `max-width: xl` is invalid and the element unbounds.
  ['Container', new Set(['maxWidth'])],
  ['Dialog', new Set(['maxWidth'])],
]);

/** True when `propName` belongs to `componentName`'s own prop API. */
const componentOwnsProp = (componentName: string, propName: string): boolean =>
  COMPONENT_OWN_PROPS.get(componentName)?.has(propName) === true;

/**
 * Props that must never be moved to `sx` because they are genuine component
 * API props, not MUI system styling shorthands. `direction` and `spacing` are
 * the most critical — they control Stack's layout via MUI internals.
 */
const DEFAULT_ALLOWED_PROPS = new Set([
  'direction', // Stack direction (row | column | …)
  'spacing', // Stack/Grid spacing
  'container', // Grid container boolean
  'item', // Grid item boolean
  'xs',
  'sm',
  'md',
  'lg',
  'xl', // Grid breakpoint props
  'variant', // Typography/Button variant
  'component', // Polymorphic component prop
  'ref',
  'key',
  'children',
  'id',
  'className',
  'style',
  'divider', // Stack divider
  'useFlexGap', // Stack useFlexGap
  'columns', // Grid columns
  'wrap', // Grid wrap
  'rowSpacing', // Grid rowSpacing
  'columnSpacing', // Grid columnSpacing
  'zeroMinWidth', // Grid zeroMinWidth
  'offset', // Grid offset (MUI v6+)
  'size', // Grid size (MUI v6+)
]);

/** Get the component name from a JSX opening element (handles namespaced like Mui.Box). */
function getComponentName(node: TSESTree.JSXOpeningElement): string | null {
  const { name } = node;
  if (name.type === AST_NODE_TYPES.JSXIdentifier) {
    return name.name;
  }
  if (name.type === AST_NODE_TYPES.JSXMemberExpression) {
    if (name.property.type === AST_NODE_TYPES.JSXIdentifier) {
      return name.property.name;
    }
  }
  return null;
}

/** True when the first character is uppercase (i.e. a React/MUI component). */
function isUpperCase(name: string): boolean {
  return (
    name.length > 0 &&
    name[0] === name[0].toUpperCase() &&
    name[0] !== name[0].toLowerCase()
  );
}

/**
 * Convert a string value to a single-quoted JS string literal.
 * Used when building sx property values from JSX string attributes.
 */
function toSingleQuoted(value: unknown): string {
  const str = String(value);
  const escaped = str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${escaped}'`;
}

/** Serialize a JSX attribute value node back to source text for use inside sx={{ ... }}. */
function attrValueToSxValue(
  attr: TSESTree.JSXAttribute,
  sourceCode: { getText(node: TSESTree.Node): string },
): string {
  const { value } = attr;
  if (value === null) {
    // Boolean shorthand — value is `true`
    return 'true';
  }
  if (value.type === AST_NODE_TYPES.Literal) {
    // String literal attribute: display="flex" → 'flex'
    return toSingleQuoted(value.value);
  }
  if (value.type === AST_NODE_TYPES.JSXExpressionContainer) {
    if (value.expression.type === AST_NODE_TYPES.JSXEmptyExpression) {
      return 'undefined';
    }
    // Numeric, expression, object, array, etc. — preserve raw source
    return sourceCode.getText(value.expression);
  }
  return sourceCode.getText(value);
}

/** The whitespace that indents the line containing `offset`. */
const indentationAt = (
  sourceCode: TSESLint.SourceCode,
  offset: number,
): string => {
  const text = sourceCode.getText();
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const match = /^[ \t]*/.exec(text.slice(lineStart, offset));
  return match ? match[0] : '';
};

/**
 * Ranges whose interior line breaks carry string data rather than formatting.
 * A multi-line template literal (or a string spliced together with line
 * continuations) evaluates to the whitespace written inside it, so shifting
 * those lines would silently change the value the code produces — the same
 * carve-out `use-latest-callback` makes for a relocated callback body.
 */
const stringDataRangesOf = (
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
): TSESTree.Range[] =>
  sourceCode
    .getTokens(node)
    .filter(
      (token) =>
        (token.type === AST_TOKEN_TYPES.Template ||
          token.type === AST_TOKEN_TYPES.String) &&
        token.loc.start.line !== token.loc.end.line,
    )
    .map((token) => token.range);

/**
 * A per-line transform moving text written at `fromIndent` to `toIndent`, or
 * null when neither indentation is a prefix of the other (tabs against spaces),
 * where no delta can be applied without corrupting the layout.
 */
const lineShifterBetween = (
  fromIndent: string,
  toIndent: string,
): ((line: string) => string) | null => {
  if (fromIndent === toIndent) {
    return (line) => line;
  }
  if (fromIndent.startsWith(toIndent)) {
    const removed = fromIndent.slice(toIndent.length);
    return (line) =>
      line.startsWith(removed) ? line.slice(removed.length) : line;
  }
  if (toIndent.startsWith(fromIndent)) {
    const added = toIndent.slice(fromIndent.length);
    return (line) => `${added}${line}`;
  }
  return null;
};

/**
 * A node's text with its continuation lines moved from the depth it was
 * written at to `toIndent`. Null when the move is not expressible, which asks
 * the caller to leave the source as the author wrote it.
 */
const reindentedText = (
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
  fromIndent: string,
  toIndent: string,
): string | null => {
  const text = sourceCode.getText(node);
  if (!text.includes('\n')) {
    return text;
  }

  const shiftLine = lineShifterBetween(fromIndent, toIndent);
  if (!shiftLine) {
    return null;
  }

  const stringData = stringDataRangesOf(sourceCode, node);
  const carriesStringData = (offset: number) =>
    stringData.some(([start, end]) => start < offset && offset < end);

  let offset = node.range[0];
  return text
    .split('\n')
    .map((line, index) => {
      const lineStart = offset;
      offset += line.length + 1;
      // The first line is spliced in after the property key, so it has no
      // indentation of its own left to adjust.
      if (index === 0 || line.trim() === '' || carriesStringData(lineStart)) {
        return line;
      }
      return shiftLine(line);
    })
    .join('\n');
};

/**
 * Ranges of the file's block comments. Their interior lines are excluded from
 * the indentation census below, so only a comment's opening line — which does
 * sit at the surrounding code's depth — is ever measured.
 */
const blockCommentRangesOf = (
  sourceCode: TSESLint.SourceCode,
): TSESTree.Range[] =>
  sourceCode
    .getAllComments()
    .filter((comment) => comment.type === AST_TOKEN_TYPES.Block)
    .map((comment) => comment.range);

/**
 * The file's own nesting step, taken as the most common indentation increase
 * between consecutive lines. Reading it from the source keeps emitted code in
 * the author's units instead of assuming a two-space, space-indented file.
 */
const indentUnitOf = (sourceCode: TSESLint.SourceCode): string => {
  const text = sourceCode.getText();
  const blockComments = blockCommentRangesOf(sourceCode);
  // A block comment's continuation lines align on the `*` one column in from
  // the comment's own indentation. That is comment alignment, not a nesting
  // step, and counting it makes any JSDoc-heavy file look 1-space indented.
  const continuesBlockComment = (offset: number) =>
    blockComments.some(([start, end]) => start < offset && offset < end);

  const frequencies = new Map<string, number>();
  let previous = '';
  let offset = 0;
  for (const line of text.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;
    if (line.trim() === '') continue;
    if (continuesBlockComment(lineStart)) continue;
    const match = /^[ \t]*/.exec(line);
    const indent = match ? match[0] : '';
    if (indent.length > previous.length && indent.startsWith(previous)) {
      const delta = indent.slice(previous.length);
      frequencies.set(delta, (frequencies.get(delta) ?? 0) + 1);
    }
    previous = indent;
  }

  let unit = '  ';
  let best = 0;
  for (const [delta, count] of frequencies) {
    if (count > best) {
      unit = delta;
      best = count;
    }
  }
  return unit;
};

type PlannedEdit = { range: TSESTree.Range; text: string };

/** The source with every planned edit applied, used to measure emitted lines. */
const applyEdits = (text: string, edits: PlannedEdit[]): string => {
  const ordered = [...edits].sort((a, b) => b.range[0] - a.range[0]);
  let result = text;
  for (const edit of ordered) {
    result = `${result.slice(0, edit.range[0])}${edit.text}${result.slice(
      edit.range[1],
    )}`;
  }
  return result;
};

/** The shape of the `sx` value the system props have to be merged into. */
type SxSlot =
  | { kind: 'new' }
  | { kind: 'object'; object: TSESTree.ObjectExpression }
  | { kind: 'array'; array: TSESTree.ArrayExpression }
  | { kind: 'spread'; expression: TSESTree.Node }
  | { kind: 'unsupported' };

const sxSlotOf = (sxAttr: TSESTree.JSXAttribute | null): SxSlot => {
  if (sxAttr === null) {
    return { kind: 'new' };
  }
  const { value } = sxAttr;
  if (value === null) {
    // `<Box sx />` — there is no value to merge into.
    return { kind: 'unsupported' };
  }
  if (value.type === AST_NODE_TYPES.JSXExpressionContainer) {
    const { expression } = value;
    if (expression.type === AST_NODE_TYPES.ObjectExpression) {
      return { kind: 'object', object: expression };
    }
    if (expression.type === AST_NODE_TYPES.ArrayExpression) {
      return { kind: 'array', array: expression };
    }
    return { kind: 'spread', expression };
  }
  return { kind: 'spread', expression: value };
};

/**
 * The property names an `sx` object literal declares, or null when one of its
 * keys is not statically readable. A computed key built from anything but a
 * literal resolves to a name only at runtime, so it is reported as unknown
 * rather than as no key at all, and the caller reads that as a possible
 * collision with every moved prop.
 *
 * A spread's own members are deliberately not counted: the moved props are
 * spliced in as new members of this literal, and a name the spread happens to
 * carry is not duplicated by that splice — it is overridden, exactly as any
 * other member written beside the spread overrides it.
 */
const declaredKeysOf = (
  object: TSESTree.ObjectExpression,
): Set<string> | null => {
  const keys = new Set<string>();
  for (const property of object.properties) {
    if (property.type !== AST_NODE_TYPES.Property) {
      continue;
    }
    const { key } = property;
    if (!property.computed && key.type === AST_NODE_TYPES.Identifier) {
      keys.add(key.name);
      continue;
    }
    // A literal key is readable whether or not it is written computed:
    // `'display'` and `['display']` both name the same property.
    if (
      key.type === AST_NODE_TYPES.Literal &&
      (typeof key.value === 'string' || typeof key.value === 'number')
    ) {
      keys.add(String(key.value));
      continue;
    }
    return null;
  }
  return keys;
};

/**
 * The moved props whose name the `sx` object literal already declares. Splicing
 * one in emits `{ display: 'flex', display: 'block' }` — TS1117, and whichever
 * value the runtime keeps, one of the two spellings the author wrote is
 * discarded. The two disagree and only the author can say which wins, so the
 * fix stands down for those props while every other prop on the element still
 * merges (#2296).
 *
 * Only the object slot is merged into in place. A new `sx`, an array entry and
 * the `{ ...moved, ...expr }` wrap each emit a fresh object literal, whose keys
 * cannot duplicate a name written elsewhere.
 */
const collidingPropsOf = (
  systemPropAttrs: TSESTree.JSXAttribute[],
  sxAttr: TSESTree.JSXAttribute | null,
): ReadonlySet<TSESTree.JSXAttribute> => {
  const slot = sxSlotOf(sxAttr);
  if (slot.kind !== 'object') {
    return new Set();
  }
  const declared = declaredKeysOf(slot.object);
  if (declared === null) {
    return new Set(systemPropAttrs);
  }
  return new Set(
    systemPropAttrs.filter(
      (attr) =>
        attr.name.type === AST_NODE_TYPES.JSXIdentifier &&
        declared.has(attr.name.name),
    ),
  );
};

/**
 * Plans every edit the autofix makes for one JSX element.
 *
 * Prettier keeps an author's decision to break an object literal across lines
 * but rewrites any line past the print width, so under-wrapping is the only
 * defect that matters here: every branch below emits the compact single-line
 * form and only adds line breaks when that form would overflow, or when the
 * object being merged into is already expanded.
 */
function planSxEdits(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.JSXOpeningElement,
  systemPropAttrs: TSESTree.JSXAttribute[],
  sxAttr: TSESTree.JSXAttribute | null,
  printWidth: number,
): PlannedEdit[] {
  const source = sourceCode.getText();
  const slot = sxSlotOf(sxAttr);
  if (slot.kind === 'unsupported') {
    return [];
  }

  const anchor = systemPropAttrs[0];
  const sxSlotNode: TSESTree.Node = sxAttr ?? anchor;
  const indentUnit = indentUnitOf(sourceCode);
  const systemPropSet = new Set<TSESTree.Node>(systemPropAttrs);

  /**
   * The `key: value` pairs for the moved props. `targetIndent` is the depth the
   * pairs are emitted at, which only matters for a value spanning several lines
   * (a nested object, a template literal): its continuation lines have to move
   * with it. Null asks for the value verbatim, as the single-line form leaves
   * every pair on the line it already occupies.
   */
  const renderEntries = (targetIndent: string | null): string[] | null => {
    const entries: string[] = [];
    for (const attr of systemPropAttrs) {
      const key =
        attr.name.type === AST_NODE_TYPES.JSXIdentifier
          ? attr.name.name
          : sourceCode.getText(attr.name);
      const rawValue = attrValueToSxValue(attr, sourceCode);
      if (targetIndent === null || !rawValue.includes('\n')) {
        entries.push(`${key}: ${rawValue}`);
        continue;
      }
      // Only an expression container's text comes straight from the source, so
      // it is the only multi-line value whose lines can be located and moved.
      const value = attr.value;
      if (
        !value ||
        value.type !== AST_NODE_TYPES.JSXExpressionContainer ||
        value.expression.type === AST_NODE_TYPES.JSXEmptyExpression
      ) {
        return null;
      }
      const moved = reindentedText(
        sourceCode,
        value.expression,
        indentationAt(sourceCode, attr.range[0]),
        targetIndent,
      );
      if (moved === null) {
        return null;
      }
      entries.push(`${key}: ${moved}`);
    }
    return entries;
  };

  const inlineEntries = renderEntries(null) ?? [];
  const joinedEntries = inlineEntries.join(', ');

  /** Deleting the whitespace ahead of a prop keeps attributes from drifting apart. */
  const removalOf = (attr: TSESTree.JSXAttribute): PlannedEdit => {
    let start = attr.range[0];
    while (start > 0 && /\s/.test(source[start - 1])) {
      start--;
    }
    return { range: [start, attr.range[1]], text: '' };
  };

  // The first system prop is reused as the insertion point when the element has
  // no `sx` yet, so it is replaced rather than removed.
  const removals = (
    sxAttr === null ? systemPropAttrs.slice(1) : systemPropAttrs
  ).map(removalOf);

  const emptyRangeAt = (offset: number): TSESTree.Range => [offset, offset];

  const inlineEditFor = (): PlannedEdit | null => {
    switch (slot.kind) {
      case 'new':
        return { range: anchor.range, text: `sx={{ ${joinedEntries} }}` };
      case 'object': {
        const first = slot.object.properties[0];
        return first
          ? {
              range: emptyRangeAt(first.range[0]),
              text: `${joinedEntries}, `,
            }
          : { range: slot.object.range, text: `{ ${joinedEntries} }` };
      }
      case 'array': {
        const first = slot.array.elements[0];
        if (slot.array.elements.length === 0) {
          return { range: slot.array.range, text: `[{ ${joinedEntries} }]` };
        }
        // A hole (`sx={[, base]}`) has no node to anchor an insertion on.
        return first
          ? {
              range: emptyRangeAt(first.range[0]),
              text: `{ ${joinedEntries} }, `,
            }
          : null;
      }
      case 'spread':
        return sxAttr
          ? {
              range: sxAttr.range,
              text: `sx={{ ${joinedEntries}, ...${sourceCode.getText(
                slot.expression,
              )} }}`,
            }
          : null;
    }
  };

  const inlineEdit = inlineEditFor();
  if (inlineEdit === null) {
    return [];
  }
  const inlineEdits = [inlineEdit, ...removals];

  /**
   * Prettier's JSX printer breaks an element's children onto their own lines
   * whenever the opening element carries more than one attribute, whatever the
   * width. Merging every system prop into one `sx` can drop the element to
   * exactly one attribute, which flips that decision: the formatter joins the
   * children back onto the element's line while the fix leaves them broken, so
   * the emitted element fails `prettier --check`.
   *
   * The children lie outside `node.range` (which covers only the opening
   * element), so the join widens the fix range over adjacent text. It stays a
   * deletion of the two whitespace runs that surround the children — their text
   * is spliced verbatim, never re-authored.
   */
  const childJoinEdits = (planned: PlannedEdit[]): PlannedEdit[] => {
    const element = node.parent;
    if (!element || element.type !== AST_NODE_TYPES.JSXElement) {
      return [];
    }
    if (element.openingElement !== node || !element.closingElement) {
      return [];
    }
    // Joining changes the element's height, and Prettier chooses the layout of
    // several enclosing constructs from that height: the parentheses wrapping a
    // multi-line JSX initializer, `return`, arrow body, ternary branch or
    // object value, and the broken form of an array or argument list. A
    // collapsed element lets all of those close up, which moves text the fix
    // does not own. The join is therefore confined to the two positions whose
    // enclosing layout cannot answer back: a statement of its own, and a direct
    // JSX child, whose parent is held open by containing a tag at all.
    const host = element.parent;
    if (
      !host ||
      (host.type !== AST_NODE_TYPES.JSXElement &&
        host.type !== AST_NODE_TYPES.JSXFragment &&
        host.type !== AST_NODE_TYPES.ExpressionStatement)
    ) {
      return [];
    }
    // Only crossing the one-attribute threshold moves the children: an element
    // that already carried one attribute, or that keeps two, is printed the
    // same way before and after the merge.
    const attributesAfter =
      node.attributes.length -
      systemPropAttrs.length +
      (sxAttr === null ? 1 : 0);
    if (node.attributes.length <= 1 || attributesAfter !== 1) {
      return [];
    }

    const regionStart = node.range[1];
    const regionEnd = element.closingElement.range[0];
    const region = source.slice(regionStart, regionEnd);
    const leading = /^\s*/.exec(region)?.[0] ?? '';
    const trailing = /\s*$/.exec(region)?.[0] ?? '';
    // Both runs have to carry a line break, which is what makes them layout
    // rather than content: JSX drops whitespace spanning a newline but keeps a
    // space written inline. A whitespace-only region has no children to join.
    if (
      leading.length === region.length ||
      !leading.includes('\n') ||
      !trailing.includes('\n')
    ) {
      return [];
    }
    const contentStart = regionStart + leading.length;
    const contentEnd = regionEnd - trailing.length;
    // Children spread over several lines would have to be reflowed, which is
    // rewriting them rather than moving the lines they sit between.
    if (source.slice(contentStart, contentEnd).includes('\n')) {
      return [];
    }

    let containers = 0;
    for (const child of element.children) {
      switch (child.type) {
        // Prettier's `containsTag`: an element or fragment child forces the
        // broken layout at any width, so the merge never moves it.
        case AST_NODE_TYPES.JSXElement:
        case AST_NODE_TYPES.JSXFragment:
          return [];
        case AST_NODE_TYPES.JSXExpressionContainer: {
          containers += 1;
          // Prettier's `containsMultipleExpressions`: a second container forces
          // the break just as a second attribute does.
          if (containers > 1) {
            return [];
          }
          const { expression } = child;
          // `{' '}` is Prettier's own spelling of a significant JSX space; the
          // formatter rewrites it into a literal space rather than moving it.
          if (
            expression.type === AST_NODE_TYPES.Literal &&
            typeof expression.value === 'string' &&
            expression.value.trim() === ''
          ) {
            return [];
          }
          break;
        }
        case AST_NODE_TYPES.JSXText: {
          const kept = source.slice(
            Math.max(child.range[0], contentStart),
            Math.min(child.range[1], contentEnd),
          );
          // Prettier collapses whitespace runs inside JSX text and prints every
          // separator as one space, so text carrying anything else is not
          // reproduced by a verbatim splice.
          if (/\s\s/.test(kept) || /[^\S ]/.test(kept)) {
            return [];
          }
          break;
        }
        default:
          return [];
      }
    }

    const joinEdits: PlannedEdit[] = [
      { range: [regionStart, contentStart], text: '' },
      { range: [contentEnd, regionEnd], text: '' },
    ];
    const merged = [...planned, ...joinEdits];
    const emitted = applyEdits(source, merged);
    const shift = (offset: number) =>
      merged
        .filter((edit) => edit.range[1] <= offset)
        .reduce(
          (total, edit) =>
            total + edit.text.length - (edit.range[1] - edit.range[0]),
          0,
        );
    const elementStart = node.range[0] + shift(node.range[0]);
    const elementEnd =
      element.closingElement.range[1] + shift(element.closingElement.range[1]);
    // An opening element the merge leaves broken across lines keeps Prettier's
    // multi-line children layout, so there is nothing to join.
    if (emitted.slice(elementStart, elementEnd).includes('\n')) {
      return [];
    }
    const joinedLineStart = emitted.lastIndexOf('\n', elementStart - 1) + 1;
    const joinedLineBreak = emitted.indexOf('\n', elementStart);
    const joinedLineEnd =
      joinedLineBreak === -1 ? emitted.length : joinedLineBreak;
    // Past the print width the broken layout is Prettier's own answer, so the
    // children stay where the author left them.
    return joinedLineEnd - joinedLineStart <= printWidth ? joinEdits : [];
  };

  /**
   * Every plan that emits anything carries the children join, so no arm — least
   * of all the conservative fall-through at the end — can bypass it. The join
   * measures the plan it is handed and declines on its own where the emitted
   * opening element still spans lines.
   */
  const withJoinedChildren = (planned: PlannedEdit[]): PlannedEdit[] => [
    ...planned,
    ...childJoinEdits(planned),
  ];

  /** The indentation of a node that starts its own line, else null. */
  const ownLineIndentOf = (offset: number): string | null => {
    const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
    const lead = source.slice(lineStart, offset);
    return lead.trim() === '' ? lead : null;
  };

  /**
   * Whether the author already broke a literal open, which Prettier preserves.
   * Merging into it has to follow that shape at any width; splicing onto the
   * first member's line leaves the literal formatted two ways at once.
   */
  const firstMemberOnOwnLine = (
    literal: TSESTree.Node,
    first: TSESTree.Node,
  ): string | null => {
    if (!source.slice(literal.range[0] + 1, first.range[0]).includes('\n')) {
      return null;
    }
    return ownLineIndentOf(first.range[0]);
  };

  const objectText = (parts: string[], indent: string, expand: boolean) =>
    expand
      ? `{\n${parts
          .map((part) => `${indent}${indentUnit}${part},`)
          .join('\n')}\n${indent}}`
      : `{ ${parts.join(', ')} }`;

  /** Existing members reproduced verbatim, or null when any spans lines. */
  const verbatimTextsOf = (
    nodes: (TSESTree.Node | null)[],
  ): string[] | null => {
    const texts: string[] = [];
    for (const member of nodes) {
      if (!member) {
        return null;
      }
      const text = sourceCode.getText(member);
      if (text.includes('\n')) {
        return null;
      }
      texts.push(text);
    }
    return texts;
  };

  /** The object literal for the moved props, expanded only when it must be. */
  const objectAt = (indent: string): string | null => {
    const inline = `{ ${joinedEntries} }`;
    if (!inline.includes('\n') && indent.length + inline.length <= printWidth) {
      return inline;
    }
    const parts = renderEntries(`${indent}${indentUnit}`);
    return parts === null ? null : objectText(parts, indent, true);
  };

  /**
   * The whole rewritten `sx={...}` attribute, breaking the literal open only
   * when the compact form would overflow the print width. `indent` is where
   * continuation lines land; `firstLineColumn` is the column the attribute
   * itself starts at. The two differ when something else (a same-line block
   * comment) already occupies the front of the line: continuation lines still
   * belong at the line's indentation, but the width test has to charge for
   * every column the first line has already consumed.
   */
  const sxAttributeText = (
    indent: string,
    firstLineColumn: number,
  ): string | null => {
    if (slot.kind === 'array') {
      const existing = verbatimTextsOf(slot.array.elements);
      if (existing === null) {
        return null;
      }
      const inline = `sx={[${[`{ ${joinedEntries} }`, ...existing].join(
        ', ',
      )}]}`;
      if (
        !inline.includes('\n') &&
        firstLineColumn + inline.length <= printWidth
      ) {
        return inline;
      }
      const elementIndent = `${indent}${indentUnit}`;
      const object = objectAt(elementIndent);
      if (object === null) {
        return null;
      }
      const elements = [object, ...existing]
        .map((element) => `${elementIndent}${element},`)
        .join('\n');
      return `sx={[\n${elements}\n${indent}]}`;
    }

    const trailing =
      slot.kind === 'object'
        ? verbatimTextsOf(slot.object.properties)
        : slot.kind === 'spread'
        ? [`...${sourceCode.getText(slot.expression)}`]
        : [];
    if (trailing === null || trailing.some((text) => text.includes('\n'))) {
      return null;
    }

    const inline = `sx={${objectText(
      [...inlineEntries, ...trailing],
      indent,
      false,
    )}}`;
    if (
      !inline.includes('\n') &&
      firstLineColumn + inline.length <= printWidth
    ) {
      return inline;
    }
    const parts = renderEntries(`${indent}${indentUnit}`);
    if (parts === null) {
      return null;
    }
    return `sx={${objectText([...parts, ...trailing], indent, true)}}`;
  };

  /**
   * Merging into a literal the author already expanded: one new member per
   * line, at the indentation the existing members sit at.
   */
  const expandedMergeEdits = (): PlannedEdit[] | null => {
    if (slot.kind === 'object') {
      const first = slot.object.properties[0];
      if (!first) {
        return null;
      }
      const indent = firstMemberOnOwnLine(slot.object, first);
      if (indent === null) {
        return null;
      }
      const parts = renderEntries(indent);
      if (parts === null) {
        return null;
      }
      return [
        {
          range: emptyRangeAt(first.range[0]),
          text: parts.map((part) => `${part},\n${indent}`).join(''),
        },
        ...removals,
      ];
    }
    if (slot.kind === 'array') {
      const first = slot.array.elements[0];
      if (!first) {
        return null;
      }
      const indent = firstMemberOnOwnLine(slot.array, first);
      if (indent === null) {
        return null;
      }
      const object = objectAt(indent);
      if (object === null) {
        return null;
      }
      return [
        {
          range: emptyRangeAt(first.range[0]),
          text: `${object},\n${indent}`,
        },
        ...removals,
      ];
    }
    return null;
  };

  const expandedMerge = expandedMergeEdits();
  if (expandedMerge) {
    return withJoinedChildren(expandedMerge);
  }

  // Measure the line the compact form actually lands on, with every removal
  // already applied, rather than guessing at the element's final shape.
  const simulated = applyEdits(source, inlineEdits);
  const shiftBefore = (offset: number) =>
    inlineEdits
      .filter((edit) => edit.range[1] <= offset)
      .reduce(
        (total, edit) =>
          total + edit.text.length - (edit.range[1] - edit.range[0]),
        0,
      );
  const slotStart = sxSlotNode.range[0] + shiftBefore(sxSlotNode.range[0]);
  const slotEnd = sxSlotNode.range[1] + shiftBefore(sxSlotNode.range[1]);
  const lineStart = simulated.lastIndexOf('\n', slotStart - 1) + 1;
  const lineBreak = simulated.indexOf('\n', slotStart);
  const lineEnd = lineBreak === -1 ? simulated.length : lineBreak;

  // A prop whose value already spans lines cannot sit in a one-line object: the
  // literal would open on one line and close on another with its remaining
  // entries crammed against the value. Width says nothing here, because the
  // measured line stops at the value's first break.
  const hasMultilineEntry = inlineEntries.some((entry) => entry.includes('\n'));

  if (!hasMultilineEntry && lineEnd - lineStart <= printWidth) {
    return withJoinedChildren(inlineEdits);
  }

  // The attribute may end several lines below where it starts once a multi-line
  // value is folded in, so ownership is judged against the line it ends on.
  const slotLineBreak = simulated.indexOf('\n', slotEnd);
  const slotLineEnd = slotLineBreak === -1 ? simulated.length : slotLineBreak;
  // A block comment ahead of the attribute does not disqualify the in-place
  // wrap: only the attribute's own range is replaced, so the comment stays
  // put. Anything else on the line (the element head, another attribute) still
  // does — wrapping there would not be the shape Prettier settles on.
  const linePrefix = simulated.slice(lineStart, slotStart);
  const attributeOwnsLine =
    linePrefix.replace(/\/\*[\s\S]*?\*\//g, '').trim() === '' &&
    simulated.slice(slotEnd, slotLineEnd).trim() === '';

  if (attributeOwnsLine) {
    const indent = /^[ \t]*/.exec(linePrefix)?.[0] ?? '';
    const rewritten = sxAttributeText(indent, slotStart - lineStart);
    if (rewritten !== null) {
      return withJoinedChildren([
        { range: sxSlotNode.range, text: rewritten },
        ...removals,
      ]);
    }
  }

  /**
   * An element whose attributes all share one line has no room left for the
   * merged `sx`; Prettier's answer is to give every attribute its own line,
   * which is reproduced here so the emitted element is already in the shape the
   * formatter would put it in.
   */
  const restructuredElement = (): string | null => {
    if (node.loc.start.line !== node.loc.end.line) {
      return null;
    }
    // Rebuilding from the attribute list would drop anything the list does not
    // cover, and would leave a trailing fragment of an unrelated statement.
    if (sourceCode.getCommentsInside(node).length > 0) {
      return null;
    }
    const elementIndent = ownLineIndentOf(node.range[0]);
    if (elementIndent === null) {
      return null;
    }
    const tailBreak = source.indexOf('\n', node.range[1]);
    const tail = source.slice(
      node.range[1],
      tailBreak === -1 ? source.length : tailBreak,
    );
    // The tail sits outside the replaced range (`node.range` covers only the
    // opening element), so pure punctuation — a statement's `;`, an array
    // element's `,`, a closing bracket — survives the rebuild verbatim and
    // lands after the element's closing line, which is where Prettier puts it.
    // Anything else (children, an operator, a sibling expression) keeps the
    // decline: Prettier moves that text instead of breaking the element apart.
    if (!/^[;,)\]}]*$/.test(tail.trim())) {
      return null;
    }

    const first = node.attributes[0];
    if (!first) {
      return null;
    }
    const attributeIndent = `${elementIndent}${indentUnit}`;
    const attributes: string[] = [];
    for (const attr of node.attributes) {
      if (attr === sxSlotNode) {
        const rewritten = sxAttributeText(
          attributeIndent,
          attributeIndent.length,
        );
        if (rewritten === null) {
          return null;
        }
        attributes.push(rewritten);
        continue;
      }
      if (systemPropSet.has(attr)) {
        continue;
      }
      attributes.push(sourceCode.getText(attr));
    }

    const head = source.slice(node.range[0], first.range[0]).trimEnd();
    const body = attributes
      .map((attribute) => `${attributeIndent}${attribute}`)
      .join('\n');
    return `${head}\n${body}\n${elementIndent}${node.selfClosing ? '/>' : '>'}`;
  };

  const restructured = restructuredElement();
  if (restructured !== null) {
    return withJoinedChildren([{ range: node.range, text: restructured }]);
  }

  // Every wrap remedy declined and the compact line measures over the print
  // width — e.g. `const el = <Box ... />;`, whose only prettier-stable rewrite
  // parenthesizes the whole element, outside the opening element's range.
  // Reporting without a fix (an established outcome: unsupported slots return
  // `[]` above) beats emitting the very line just measured as over-wide.
  if (lineEnd - lineStart > printWidth) {
    return [];
  }
  return withJoinedChildren(inlineEdits);
}

export const preferSxPropOverSystemProps = createRule<Options, MessageIds>({
  name: 'prefer-sx-prop-over-system-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using the MUI `sx` prop instead of deprecated system props (e.g. `mt`, `display`, `flexDirection`) on MUI components.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          components: {
            type: 'array',
            items: { type: 'string' },
          },
          allowedProps: {
            type: 'array',
            items: { type: 'string' },
          },
          printWidth: {
            type: 'number',
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferSxProp:
        'MUI system prop "{{prop}}" is deprecated. Move it into the `sx` prop instead.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const componentSet = options.components
      ? new Set(options.components)
      : DEFAULT_MUI_COMPONENTS;

    const extraAllowed = options.allowedProps
      ? new Set(options.allowedProps)
      : new Set<string>();

    const printWidth =
      typeof options.printWidth === 'number' && options.printWidth > 0
        ? options.printWidth
        : DEFAULT_PRINT_WIDTH;

    function isAllowedProp(name: string): boolean {
      if (DEFAULT_ALLOWED_PROPS.has(name)) return true;
      if (extraAllowed.has(name)) return true;
      if (/^on[A-Z]/.test(name)) return true;
      if (name.startsWith('aria-') || name.startsWith('data-')) return true;
      return false;
    }

    function isSystemProp(name: string, componentName: string): boolean {
      // A prop the component owns is never the system prop of the same name, so
      // the autofix must not rewrite it into a CSS declaration the browser
      // discards.
      if (componentOwnsProp(componentName, name)) {
        return false;
      }
      return MUI_SYSTEM_PROPS.has(name) && !isAllowedProp(name);
    }

    return {
      JSXOpeningElement(node: TSESTree.JSXOpeningElement) {
        const componentName = getComponentName(node);
        if (!componentName) return;

        if (!isUpperCase(componentName)) return;
        if (!componentSet.has(componentName)) return;

        const systemPropAttrs: TSESTree.JSXAttribute[] = [];
        let sxAttr: TSESTree.JSXAttribute | null = null;

        for (const attr of node.attributes) {
          if (attr.type !== AST_NODE_TYPES.JSXAttribute) continue;
          if (attr.name.type !== AST_NODE_TYPES.JSXIdentifier) continue;
          const name = attr.name.name;

          if (name === 'sx') {
            sxAttr = attr;
          } else if (isSystemProp(name, componentName)) {
            systemPropAttrs.push(attr);
          }
        }

        if (systemPropAttrs.length === 0) return;

        const sourceCode = context.getSourceCode();

        // A prop whose name the `sx` literal already declares is reported
        // without a fix: merging it would duplicate the key. The rest of the
        // element is still merged, so one disagreeing pair does not hold the
        // other props back.
        const collidingProps = collidingPropsOf(systemPropAttrs, sxAttr);
        const fixableAttrs = systemPropAttrs.filter(
          (attr) => !collidingProps.has(attr),
        );

        // Report each system prop. Only the first fixable one carries the fixer
        // to avoid overlapping fix ranges on the same element.
        const fixAnchor = fixableAttrs[0] ?? null;
        systemPropAttrs.forEach((attr) => {
          const propName =
            attr.name.type === AST_NODE_TYPES.JSXIdentifier
              ? attr.name.name
              : '';

          context.report({
            node: attr,
            messageId: 'preferSxProp',
            data: { prop: propName },
            fix:
              attr === fixAnchor
                ? (fixer) =>
                    planSxEdits(
                      sourceCode,
                      node,
                      fixableAttrs,
                      sxAttr,
                      printWidth,
                    ).map((edit) =>
                      fixer.replaceTextRange(edit.range, edit.text),
                    )
                : null,
          });
        });
      },
    };
  },
});
