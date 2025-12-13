import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noClassInstanceDestructuring';

export const noClassInstanceDestructuring = createRule<[], MessageIds>({
  name: 'no-class-instance-destructuring',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow destructuring of class instances to prevent loss of `this` context',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noClassInstanceDestructuring: [
        "What's wrong: Destructuring {{members}} from class instance {{instance}} detaches those members from the instance.",
        'Why it matters: Methods can run with the wrong `this`, and getters become one-time snapshots that go stale when the instance changes.',
        'How to fix: Access through the instance instead (for example, {{suggestion}}) and bind when you need to pass a method around.',
      ].join('\n'),
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    function describeMember(
      prop: TSESTree.ObjectPattern['properties'][number],
    ): string {
      if (prop.type === AST_NODE_TYPES.Property) {
        if (prop.computed) {
          const keyText = sourceCode.getText(prop.key);
          return `[${keyText}]`;
        }
        if (prop.key.type === AST_NODE_TYPES.Identifier) {
          return prop.key.name;
        }
        return sourceCode.getText(prop.key);
      }

      if (
        prop.type === AST_NODE_TYPES.RestElement &&
        prop.argument.type === AST_NODE_TYPES.Identifier
      ) {
        return `...${prop.argument.name}`;
      }

      return 'member';
    }

    function buildAccessPath(
      initText: string,
      prop: TSESTree.Property,
    ): string {
      const keyText = sourceCode.getText(prop.key);
      if (prop.key.type === AST_NODE_TYPES.Identifier && !prop.computed) {
        return `${initText}.${keyText}`;
      }
      return `${initText}[${keyText}]`;
    }

    function formatMembers(
      properties: TSESTree.ObjectPattern['properties'],
    ): string {
      const memberNames = properties.map(describeMember).filter(Boolean);
      if (memberNames.length === 0) return '`<members>`';
      return memberNames.map((name) => `\`${name}\``).join(', ');
    }

    function formatAccessExamples(
      properties: TSESTree.ObjectPattern['properties'],
      initText: string,
    ): string {
      const accessPaths = properties
        .filter(
          (prop): prop is TSESTree.Property =>
            prop.type === AST_NODE_TYPES.Property,
        )
        .map((prop) => buildAccessPath(initText, prop));

      if (accessPaths.length === 0) {
        return `\`${initText}.<member>\``;
      }

      return accessPaths.map((path) => `\`${path}\``).join(', ');
    }

    function isClassInstance(node: TSESTree.Expression): boolean {
      // Check for new expressions
      if (node.type === AST_NODE_TYPES.NewExpression) {
        return true;
      }

      // Check for identifiers that might be class instances
      if (node.type === AST_NODE_TYPES.Identifier) {
        const variableDef = context
          .getScope()
          .variables.find((variableDef) => variableDef.name === node.name);
        if (
          variableDef?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator
        ) {
          const init = (variableDef.defs[0].node as TSESTree.VariableDeclarator)
            .init;
          return init?.type === AST_NODE_TYPES.NewExpression;
        }
      }

      return false;
    }

    return {
      VariableDeclarator(node) {
        if (
          node.id.type === AST_NODE_TYPES.ObjectPattern &&
          node.init &&
          isClassInstance(node.init)
        ) {
          const objectPattern = node.id;
          const initText = sourceCode.getText(node.init as TSESTree.Node);
          context.report({
            node,
            messageId: 'noClassInstanceDestructuring',
            data: {
              members: formatMembers(objectPattern.properties),
              instance: `\`${initText}\``,
              suggestion: formatAccessExamples(
                objectPattern.properties,
                initText,
              ),
            },
            fix(fixer) {
              const properties = objectPattern.properties;

              // Skip if there's no init expression
              if (!node.init) return null;

              // For single property, use simple replacement
              if (properties.length === 1) {
                const prop = properties[0];
                if (prop.type === AST_NODE_TYPES.Property) {
                  const value =
                    prop.value.type === AST_NODE_TYPES.Identifier
                      ? prop.value.name
                      : sourceCode.getText(prop.value);
                  const accessPath = buildAccessPath(initText, prop);
                  return fixer.replaceText(node, `${value} = ${accessPath}`);
                }
                return null;
              }

              // For multiple properties, create multiple declarations
              const declarations = properties
                .filter(
                  (prop): prop is TSESTree.Property =>
                    prop.type === AST_NODE_TYPES.Property,
                )
                .map((prop) => {
                  const value =
                    prop.value.type === AST_NODE_TYPES.Identifier
                      ? prop.value.name
                      : sourceCode.getText(prop.value);
                  const accessPath = buildAccessPath(initText, prop);
                  return `${value} = ${accessPath}`;
                })
                .join(';\nconst ');

              // Only apply the fix if we have valid declarations
              if (!declarations) return null;
              return fixer.replaceText(node, declarations);
            },
          });
        }
      },
    };
  },
});
