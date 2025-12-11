import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-static-constants-in-dynamic-files';

type MessageIds = 'noStaticConstantInDynamicFile';

const isDynamicFilename = (filename: string): boolean =>
  /\.dynamic\.tsx?$/.test(filename);

const isScreamingSnakeCase = (name: string): boolean =>
  /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(name);

/**
 * Records a leaf binding identifier so SCREAMING_SNAKE_CASE exports are checked.
 */
const collectFromIdentifier = (
  identifier: TSESTree.Identifier,
  identifiers: TSESTree.Identifier[],
): void => {
  identifiers.push(identifier);
};

/**
 * Queues the rest element argument when it is a supported binding pattern so
 * nested destructuring inside `...` is still inspected for exported constants.
 */
const collectFromRestElement = (
  restElement: TSESTree.RestElement,
  queue: TSESTree.BindingName[],
): void => {
  const argument = restElement.argument;

  if (
    argument.type === AST_NODE_TYPES.Identifier ||
    argument.type === AST_NODE_TYPES.ObjectPattern ||
    argument.type === AST_NODE_TYPES.ArrayPattern
  ) {
    queue.push(argument);
  }
};

/**
 * Walks object destructuring to capture identifiers and queue nested patterns
 * (including defaults and rest spreads) so every bound name is inspected.
 */
const collectFromObjectPattern = (
  pattern: TSESTree.ObjectPattern,
  identifiers: TSESTree.Identifier[],
  queue: TSESTree.BindingName[],
): void => {
  for (const property of pattern.properties) {
    if (property.type === AST_NODE_TYPES.Property) {
      const value = property.value;

      if (value.type === AST_NODE_TYPES.Identifier) {
        identifiers.push(value);
      } else if (value.type === AST_NODE_TYPES.AssignmentPattern) {
        queue.push(value.left);
      } else if (
        value.type === AST_NODE_TYPES.ObjectPattern ||
        value.type === AST_NODE_TYPES.ArrayPattern
      ) {
        queue.push(value);
      }
    } else if (property.type === AST_NODE_TYPES.RestElement) {
      collectFromRestElement(property, queue);
    }
  }
};

/**
 * Walks array destructuring to collect identifiers and queue nested patterns
 * so array defaults, nesting, and rest elements are not skipped.
 */
const collectFromArrayPattern = (
  pattern: TSESTree.ArrayPattern,
  identifiers: TSESTree.Identifier[],
  queue: TSESTree.BindingName[],
): void => {
  for (const element of pattern.elements) {
    if (!element) {
      continue;
    }

    if (element.type === AST_NODE_TYPES.Identifier) {
      identifiers.push(element);
    } else if (element.type === AST_NODE_TYPES.AssignmentPattern) {
      queue.push(element.left);
    } else if (
      element.type === AST_NODE_TYPES.ObjectPattern ||
      element.type === AST_NODE_TYPES.ArrayPattern
    ) {
      queue.push(element);
    } else if (element.type === AST_NODE_TYPES.RestElement) {
      collectFromRestElement(element, queue);
    }
  }
};

/**
 * Traverses a binding pattern breadth-first and returns every leaf Identifier
 * so exported destructuring binds are all checked for SCREAMING_SNAKE_CASE.
 */
const collectBindingIdentifiers = (
  pattern: TSESTree.BindingName,
): TSESTree.Identifier[] => {
  const identifiers: TSESTree.Identifier[] = [];
  const queue: TSESTree.BindingName[] = [pattern];

  while (queue.length > 0) {
    const current = queue.pop();

    if (!current) {
      continue;
    }

    switch (current.type) {
      case AST_NODE_TYPES.Identifier:
        collectFromIdentifier(current, identifiers);
        break;
      case AST_NODE_TYPES.ObjectPattern:
        collectFromObjectPattern(current, identifiers, queue);
        break;
      case AST_NODE_TYPES.ArrayPattern:
        collectFromArrayPattern(current, identifiers, queue);
        break;
      default:
        break;
    }
  }

  return identifiers;
};

export default createRule<[], MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow exporting SCREAMING_SNAKE_CASE constants from .dynamic.ts/.dynamic.tsx files; move static constants to non-dynamic modules instead.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noStaticConstantInDynamicFile:
        'Global constant "{{name}}" is exported from a .dynamic file. .dynamic files are reserved for runtime-only behavior; move this constant to a non-dynamic module (e.g., config.ts) and import it so static values do not live alongside dynamic code paths.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename =
      (context as { filename?: string }).filename ?? context.getFilename();

    if (!isDynamicFilename(filename)) {
      return {};
    }

    return {
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;

        if (
          !declaration ||
          declaration.type !== AST_NODE_TYPES.VariableDeclaration ||
          declaration.kind !== 'const'
        ) {
          return;
        }

        declaration.declarations.forEach((declarator) => {
          const { id } = declarator;
          const identifiers = collectBindingIdentifiers(id);

          for (const identifier of identifiers) {
            if (!isScreamingSnakeCase(identifier.name)) {
              continue;
            }

            context.report({
              node: identifier,
              messageId: 'noStaticConstantInDynamicFile',
              data: { name: identifier.name },
            });
          }
        });
      },
    };
  },
});
