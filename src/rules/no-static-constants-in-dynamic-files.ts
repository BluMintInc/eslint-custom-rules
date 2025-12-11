import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-static-constants-in-dynamic-files';

type MessageIds = 'noStaticConstantInDynamicFile';

const isDynamicFilename = (filename: string): boolean =>
  /\.dynamic\.tsx?$/.test(filename);

const isScreamingSnakeCase = (name: string): boolean =>
  /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(name);

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
      case AST_NODE_TYPES.Identifier: {
        identifiers.push(current);
        break;
      }
      case AST_NODE_TYPES.ObjectPattern: {
        for (const property of current.properties) {
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
            const argument = property.argument;

            if (
              argument.type === AST_NODE_TYPES.Identifier ||
              argument.type === AST_NODE_TYPES.ObjectPattern ||
              argument.type === AST_NODE_TYPES.ArrayPattern
            ) {
              queue.push(argument);
            }
          }
        }
        break;
      }
      case AST_NODE_TYPES.ArrayPattern: {
        for (const element of current.elements) {
          if (!element) {
            continue;
          }

          if (element.type === AST_NODE_TYPES.Identifier) {
            identifiers.push(element);
          } else if (element.type === AST_NODE_TYPES.AssignmentPattern) {
            queue.push(element.left);
          } else if (
            element.type === AST_NODE_TYPES.ObjectPattern ||
            element.type === AST_NODE_TYPES.ArrayPattern ||
            element.type === AST_NODE_TYPES.RestElement
          ) {
            const binding =
              element.type === AST_NODE_TYPES.RestElement
                ? element.argument
                : element;

            if (
              binding.type === AST_NODE_TYPES.Identifier ||
              binding.type === AST_NODE_TYPES.ObjectPattern ||
              binding.type === AST_NODE_TYPES.ArrayPattern
            ) {
              queue.push(binding);
            }
          }
        }
        break;
      }
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
    if (!isDynamicFilename(context.getFilename())) {
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

          identifiers
            .filter((identifier) => isScreamingSnakeCase(identifier.name))
            .forEach((identifier) => {
              context.report({
                node: identifier,
                messageId: 'noStaticConstantInDynamicFile',
                data: { name: identifier.name },
              });
            });
        });
      },
    };
  },
});
