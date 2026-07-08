import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferSxProp';

type Options = [
  {
    components?: string[];
    allowedProps?: string[];
  },
];

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
 * Components whose public prop API defines `color` as a closed semantic enum
 * (a palette / variant selector like `'primary' | 'secondary' | 'error' | …`),
 * not a CSS-forwarded system style prop. On these, `color` feeds
 * `ownerState.color`, selecting theme variants and MUI's internal
 * `.Mui*-color*` class selectors — moving it into `sx` both drops the variant
 * selection and produces an invalid CSS `color` value. So `color` here is a
 * first-class component prop, never a deprecated system prop.
 */
const COMPONENT_COLOR_IS_SEMANTIC = new Set([
  'Button',
  'IconButton',
  'Chip',
  'Badge',
]);

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

    function isAllowedProp(name: string): boolean {
      if (DEFAULT_ALLOWED_PROPS.has(name)) return true;
      if (extraAllowed.has(name)) return true;
      if (/^on[A-Z]/.test(name)) return true;
      if (name.startsWith('aria-') || name.startsWith('data-')) return true;
      return false;
    }

    function isSystemProp(name: string, componentName: string): boolean {
      // `color` is a semantic enum prop (not a CSS system prop) on components
      // like Button/IconButton/Chip/Badge — exempt it there so the autofix
      // never rewrites a variant selector into an invalid CSS color.
      if (name === 'color' && COMPONENT_COLOR_IS_SEMANTIC.has(componentName)) {
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
        const fullSource = sourceCode.getText();

        /**
         * Remove an attribute AND the whitespace that precedes it so the
         * output does not accumulate extra spaces between attributes.
         */
        function removeAttrWithLeadingSpace(
          fixer: TSESLint.RuleFixer,
          attr: TSESTree.JSXAttribute,
        ) {
          const range = attr.range ?? [0, 0];
          const [start, end] = range;
          // Walk backwards from the attribute start to consume any whitespace
          let wsStart = start;
          while (wsStart > 0 && /\s/.test(fullSource[wsStart - 1])) {
            wsStart--;
          }
          return fixer.removeRange([wsStart, end]);
        }

        // Report each system prop. Only the first carries the fixer to avoid
        // overlapping fix ranges on the same element.
        systemPropAttrs.forEach((attr, index) => {
          const propName =
            attr.name.type === AST_NODE_TYPES.JSXIdentifier
              ? attr.name.name
              : '';

          context.report({
            node: attr,
            messageId: 'preferSxProp',
            data: { prop: propName },
            fix:
              index === 0
                ? (fixer) => {
                    const sc = sourceCode;
                    const newEntries = systemPropAttrs
                      .map((a) => {
                        const key =
                          a.name.type === AST_NODE_TYPES.JSXIdentifier
                            ? a.name.name
                            : sc.getText(a.name);
                        const val = attrValueToSxValue(a, sc);
                        return `${key}: ${val}`;
                      })
                      .join(', ');

                    const fixes: TSESLint.RuleFix[] = [];

                    if (sxAttr === null) {
                      // No existing sx — replace the first system prop with sx={{...}}
                      // and delete the rest (including their leading whitespace).
                      fixes.push(
                        fixer.replaceText(
                          systemPropAttrs[0],
                          `sx={{ ${newEntries} }}`,
                        ),
                      );
                      for (let i = 1; i < systemPropAttrs.length; i++) {
                        fixes.push(
                          removeAttrWithLeadingSpace(fixer, systemPropAttrs[i]),
                        );
                      }
                    } else if (
                      sxAttr.value?.type ===
                        AST_NODE_TYPES.JSXExpressionContainer &&
                      sxAttr.value.expression.type ===
                        AST_NODE_TYPES.ObjectExpression
                    ) {
                      // Existing sx={{ ... }} — merge system props at the front.
                      const existingObj = sxAttr.value.expression;
                      const existingProps = existingObj.properties;

                      if (existingProps.length === 0) {
                        fixes.push(
                          fixer.replaceText(existingObj, `{ ${newEntries} }`),
                        );
                      } else {
                        fixes.push(
                          fixer.insertTextBefore(
                            existingProps[0],
                            `${newEntries}, `,
                          ),
                        );
                      }
                      for (const a of systemPropAttrs) {
                        fixes.push(removeAttrWithLeadingSpace(fixer, a));
                      }
                    } else if (
                      sxAttr.value?.type ===
                        AST_NODE_TYPES.JSXExpressionContainer &&
                      sxAttr.value.expression.type ===
                        AST_NODE_TYPES.ArrayExpression
                    ) {
                      // sx={[...]} — prepend a new object as the first array element.
                      const arr = sxAttr.value.expression;
                      if (arr.elements.length === 0) {
                        fixes.push(
                          fixer.replaceText(arr, `[{ ${newEntries} }]`),
                        );
                      } else {
                        fixes.push(
                          fixer.insertTextBefore(
                            arr.elements[0] as TSESTree.Node,
                            `{ ${newEntries} }, `,
                          ),
                        );
                      }
                      for (const a of systemPropAttrs) {
                        fixes.push(removeAttrWithLeadingSpace(fixer, a));
                      }
                    } else if (sxAttr.value !== null) {
                      // sx is a variable/expression — spread it: sx={{ entries, ...expr }}
                      const innerExpr =
                        sxAttr.value.type ===
                        AST_NODE_TYPES.JSXExpressionContainer
                          ? sc.getText(
                              (sxAttr.value as TSESTree.JSXExpressionContainer)
                                .expression,
                            )
                          : sc.getText(sxAttr.value);
                      fixes.push(
                        fixer.replaceText(
                          sxAttr,
                          `sx={{ ${newEntries}, ...${innerExpr} }}`,
                        ),
                      );
                      for (const a of systemPropAttrs) {
                        fixes.push(removeAttrWithLeadingSpace(fixer, a));
                      }
                    }

                    return fixes;
                  }
                : null,
          });
        });
      },
    };
  },
});
