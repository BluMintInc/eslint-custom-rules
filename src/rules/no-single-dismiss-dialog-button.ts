import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    dismissLabels?: string[];
  },
];

type MessageIds = 'noSingleDismissDialogButton';

const DEFAULT_DISMISS_LABELS = [
  'Cancel',
  'Close',
  'Dismiss',
  'Not now',
  'Never mind',
];

/**
 * Extracts the string value from a node that is either a string Literal or a
 * TemplateLiteral with no expressions (i.e. a plain template string). Returns
 * null for anything more dynamic.
 */
function getStaticStringValue(node: TSESTree.Node): string | null {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  if (
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }
  return null;
}

/**
 * Returns true when the value (after trimming) matches one of the dismiss
 * labels, case-insensitively.
 */
function isDismissLabel(value: string, dismissLabels: string[]): boolean {
  const normalized = value.trim().toLowerCase();
  return dismissLabels.some((label) => label.toLowerCase() === normalized);
}

/**
 * Searches the properties of an ObjectExpression for a property named
 * `children` whose value is a static string matching a dismiss label.
 * Returns the button ObjectExpression node if found, null otherwise.
 */
function findDismissChildrenProp(
  element: TSESTree.ObjectExpression,
  dismissLabels: string[],
): TSESTree.Property | null {
  for (const prop of element.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;
    if (prop.computed) continue;
    const key = prop.key;
    const isChildrenKey =
      (key.type === AST_NODE_TYPES.Identifier && key.name === 'children') ||
      (key.type === AST_NODE_TYPES.Literal && key.value === 'children');
    if (!isChildrenKey) continue;
    const staticVal = getStaticStringValue(prop.value);
    if (staticVal !== null && isDismissLabel(staticVal, dismissLabels)) {
      return prop;
    }
  }
  return null;
}

export const noSingleDismissDialogButton = createRule<Options, MessageIds>({
  name: 'no-single-dismiss-dialog-button',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow a single dialog button whose label is a dismiss action (Cancel, Close, Dismiss, Not now, Never mind). Use navigation.onClose for dismissal; the buttons array should only contain affirmative actions.',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          dismissLabels: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_DISMISS_LABELS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noSingleDismissDialogButton:
        'A single dialog button with label "{{label}}" is a dismiss action. Use navigation.onClose to handle dismissal via the X close button instead; the buttons array should only contain affirmative actions.',
    },
  },
  defaultOptions: [{ dismissLabels: DEFAULT_DISMISS_LABELS }],
  create(context) {
    const options = context.options[0] ?? {};
    const dismissLabels: string[] =
      options.dismissLabels ?? DEFAULT_DISMISS_LABELS;

    return {
      Property(node) {
        // Only care about properties named `buttons`
        if (node.computed) return;
        const key = node.key;
        const isButtonsKey =
          (key.type === AST_NODE_TYPES.Identifier && key.name === 'buttons') ||
          (key.type === AST_NODE_TYPES.Literal && key.value === 'buttons');
        if (!isButtonsKey) return;

        // The value must be an array literal
        if (node.value.type !== AST_NODE_TYPES.ArrayExpression) return;
        const arrayExpr = node.value;

        // Only flag exactly one element
        if (arrayExpr.elements.length !== 1) return;

        const element = arrayExpr.elements[0];
        if (!element || element.type !== AST_NODE_TYPES.ObjectExpression)
          return;

        const dismissProp = findDismissChildrenProp(element, dismissLabels);
        if (!dismissProp) return;

        // Retrieve the label text for the error message
        const labelNode = dismissProp.value;
        const labelText = getStaticStringValue(labelNode) ?? '';

        context.report({
          node: element,
          messageId: 'noSingleDismissDialogButton',
          data: {
            label: labelText.trim(),
          },
        });
      },
    };
  },
});
