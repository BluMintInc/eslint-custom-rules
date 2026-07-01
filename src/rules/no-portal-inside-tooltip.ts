import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'portalInsideTooltip';

type Options = [
  {
    tooltipComponents?: string[];
    portalComponents?: string[];
    detectTooltipSuffix?: boolean;
    detectPortalSuffix?: boolean;
  }?,
];

const DEFAULT_TOOLTIP_COMPONENTS = [
  'Tooltip',
  'WYSIWYGTooltip',
  'MatchPayoutTooltip',
  'TeamDisplayTooltip',
  'OptionalTooltip',
  'ComingSoonTooltip',
  'TooltipDynamicDelay',
  'ValidationTooltip',
];

const DEFAULT_PORTAL_COMPONENTS = [
  'Dialog',
  'Drawer',
  'Menu',
  'Popover',
  'Portal',
  'Modal',
  'WizardPortal',
  'DialogCentered',
  'AlertDialog',
];

const PORTAL_SUFFIXES = ['Portal', 'Dialog', 'Drawer', 'Menu', 'Popover'];

/**
 * Extracts the string name from a JSX element's opening tag name expression.
 * Returns null for member expressions (e.g. Foo.Bar) since they're out of scope.
 */
function getJsxElementName(
  nameExpr: TSESTree.JSXTagNameExpression,
): string | null {
  if (nameExpr.type === 'JSXIdentifier') {
    return nameExpr.name;
  }
  return null;
}

/**
 * Recursively searches a node's JSX descendant tree for portal components,
 * including those nested inside expression containers (logical/conditional
 * expressions), fragments, and regular elements.
 *
 * Returns the first portal node found, or null if none.
 */
function findPortalInDescendants(
  node: TSESTree.Node,
  isPortalComponent: (name: string) => boolean,
): TSESTree.Node | null {
  if (node.type === 'JSXElement') {
    const name = getJsxElementName(node.openingElement.name);
    if (name !== null && isPortalComponent(name)) {
      return node;
    }
    // Recurse into JSXElement children
    for (const child of node.children) {
      const found = findPortalInDescendants(child, isPortalComponent);
      if (found) return found;
    }
    return null;
  }

  if (node.type === 'JSXFragment') {
    // Treat fragments as transparent — recurse into their children
    for (const child of node.children) {
      const found = findPortalInDescendants(child, isPortalComponent);
      if (found) return found;
    }
    return null;
  }

  if (node.type === 'JSXExpressionContainer') {
    return findPortalInExpression(node.expression, isPortalComponent);
  }

  return null;
}

/**
 * Descends into expression nodes (logical, conditional) looking for portal
 * JSX elements. Call expressions and other dynamic shapes are out of scope
 * and silently produce no match (avoiding false positives).
 */
function findPortalInExpression(
  expr: TSESTree.Expression | TSESTree.JSXEmptyExpression,
  isPortalComponent: (name: string) => boolean,
): TSESTree.Node | null {
  if (expr.type === 'JSXElement') {
    return findPortalInDescendants(expr, isPortalComponent);
  }

  if (expr.type === 'JSXFragment') {
    return findPortalInDescendants(expr, isPortalComponent);
  }

  if (expr.type === 'LogicalExpression') {
    // Both sides could be JSX — check the right operand (the render branch)
    // and also the left in case of || chaining
    const rightResult = findPortalInExpression(expr.right, isPortalComponent);
    if (rightResult) return rightResult;
    return findPortalInExpression(expr.left, isPortalComponent);
  }

  if (expr.type === 'ConditionalExpression') {
    const consequentResult = findPortalInExpression(
      expr.consequent,
      isPortalComponent,
    );
    if (consequentResult) return consequentResult;
    return findPortalInExpression(expr.alternate, isPortalComponent);
  }

  if (expr.type === 'Identifier') {
    // Handle {Portal} — an Identifier whose name matches a portal component name
    if (isPortalComponent(expr.name)) {
      return expr;
    }
  }

  // CallExpression, TemplateLiteral, etc. are out of scope — return null
  return null;
}

export const noPortalInsideTooltip = createRule<Options, MessageIds>({
  name: 'no-portal-inside-tooltip',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow portal-rendering components (Dialog, Drawer, Menu, Popover, Portal, Modal) inside Tooltip wrapper components. React Portals preserve React-tree event bubbling, so a portal nested under a Tooltip leaves the tooltip orphaned over the modal.',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          tooltipComponents: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Additional tooltip wrapper component names to detect.',
          },
          portalComponents: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Additional portal-rendering component names to detect.',
          },
          detectTooltipSuffix: {
            type: 'boolean',
            default: true,
            description:
              'When true, any component whose name ends in "Tooltip" is treated as a tooltip wrapper.',
          },
          detectPortalSuffix: {
            type: 'boolean',
            default: true,
            description:
              'When true, any component whose name ends in Portal, Dialog, Drawer, Menu, or Popover is treated as a portal.',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      portalInsideTooltip:
        "Portal-rendering component '{{portalName}}' must not be nested inside Tooltip wrapper '{{tooltipName}}'. React Portals preserve React-tree event bubbling, so the portal's modal Backdrop becomes a logical descendant of the tooltip wrapper — preventing onMouseLeave from firing and leaving the tooltip orphaned over the modal. Hoist the portal out of the tooltip (use TooltipChipTrigger or render the portal as a sibling).",
    },
    fixable: undefined,
  },
  defaultOptions: [{}],
  create(context) {
    const options = context.options[0] ?? {};
    const detectTooltipSuffix = options.detectTooltipSuffix !== false;
    const detectPortalSuffix = options.detectPortalSuffix !== false;

    // Build the tooltip component name set
    const tooltipSet = new Set(DEFAULT_TOOLTIP_COMPONENTS);
    if (options.tooltipComponents) {
      for (const name of options.tooltipComponents) {
        tooltipSet.add(name);
      }
    }

    // Build the portal component name set
    const portalSet = new Set(DEFAULT_PORTAL_COMPONENTS);
    if (options.portalComponents) {
      for (const name of options.portalComponents) {
        portalSet.add(name);
      }
    }

    const isTooltipComponent = (name: string): boolean => {
      if (tooltipSet.has(name)) return true;
      if (detectTooltipSuffix && name.endsWith('Tooltip')) return true;
      return false;
    };

    const isPortalComponent = (name: string): boolean => {
      if (portalSet.has(name)) return true;
      if (detectPortalSuffix) {
        for (const suffix of PORTAL_SUFFIXES) {
          if (name.endsWith(suffix) && name !== suffix) return true;
        }
      }
      return false;
    };

    return {
      JSXElement(node: TSESTree.JSXElement) {
        const tooltipName = getJsxElementName(node.openingElement.name);
        if (tooltipName === null || !isTooltipComponent(tooltipName)) {
          return;
        }

        // Only walk the tooltip's children (not its attributes like `title`)
        for (const child of node.children) {
          const portalNode = findPortalInDescendants(child, isPortalComponent);
          if (portalNode) {
            let portalName = 'Portal';
            if (portalNode.type === 'JSXElement') {
              portalName =
                getJsxElementName(portalNode.openingElement.name) ?? 'Portal';
            } else if (portalNode.type === 'Identifier') {
              portalName = (portalNode as TSESTree.Identifier).name;
            }
            context.report({
              node: portalNode,
              messageId: 'portalInsideTooltip',
              data: {
                portalName,
                tooltipName,
              },
            });
            // Report only the first portal found per tooltip to avoid flooding
            break;
          }
        }
      },
    };
  },
});
