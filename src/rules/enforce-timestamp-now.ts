import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferTimestampNow';

export const enforceTimestampNow = createRule<[], MessageIds>({
  name: 'enforce-timestamp-now',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce the use of Timestamp.now() for getting the current timestamp in backend code. This rule prevents using alternatives like Timestamp.fromDate(new Date()) or other date creation patterns that could lead to inconsistency.',
      recommended: 'error',
      requiresTypeChecking: false,
      extendsBaseRule: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferTimestampNow:
        'Use Timestamp.now() instead of creating a Date object and converting it. This is more efficient and idiomatic for Firestore.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Only apply this rule to backend code (functions/src/)
    const filename = context.getFilename();
    if (!filename.includes('functions/src/')) {
      return {};
    }

    // Skip test files
    if (filename.includes('.test.') || filename.includes('.spec.')) {
      return {};
    }

    // Track Timestamp imports and aliases
    const timestampAliases = new Set<string>(['Timestamp']);

    function isTimestampFromDateWithNewDate(node: TSESTree.CallExpression): boolean {
      // Check if it's a Timestamp.fromDate(new Date()) call
      if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
        const property = node.callee.property;
        const object = node.callee.object;

        if (
          property.type === AST_NODE_TYPES.Identifier &&
          property.name === 'fromDate' &&
          object.type === AST_NODE_TYPES.Identifier &&
          timestampAliases.has(object.name)
        ) {
          // Check if the argument is new Date()
          const arg = node.arguments[0];
          if (
            arg &&
            arg.type === AST_NODE_TYPES.NewExpression &&
            arg.callee.type === AST_NODE_TYPES.Identifier &&
            arg.callee.name === 'Date' &&
            arg.arguments.length === 0
          ) {
            return true;
          }

          // Check if the argument is a variable reference to a Date object
          if (
            arg &&
            arg.type === AST_NODE_TYPES.Identifier
          ) {
            // If it's a variable, we need to check if it's a Date that's being modified
            // If it's modified, we shouldn't flag it
            return false;
          }
        }
      }
      return false;
    }

    function isTimestampFromMillisWithDateNow(node: TSESTree.CallExpression): boolean {
      // Check if it's a Timestamp.fromMillis(Date.now()) call
      if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
        const property = node.callee.property;
        const object = node.callee.object;

        if (
          property.type === AST_NODE_TYPES.Identifier &&
          property.name === 'fromMillis' &&
          object.type === AST_NODE_TYPES.Identifier &&
          timestampAliases.has(object.name)
        ) {
          // Check if the argument is Date.now()
          const arg = node.arguments[0];
          if (
            arg &&
            arg.type === AST_NODE_TYPES.CallExpression &&
            arg.callee.type === AST_NODE_TYPES.MemberExpression &&
            arg.callee.object.type === AST_NODE_TYPES.Identifier &&
            arg.callee.object.name === 'Date' &&
            arg.callee.property.type === AST_NODE_TYPES.Identifier &&
            arg.callee.property.name === 'now'
          ) {
            return true;
          }
        }
      }
      return false;
    }

    function isNewDateDirectUsage(node: TSESTree.NewExpression): boolean {
      // Check if it's a new Date() with no arguments
      return (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === 'Date' &&
        node.arguments.length === 0
      );
    }

    // Check if a Date object is being modified (e.g., futureDate.setDate())
    function isDateBeingModified(dateVar: string): boolean {
      // Look through the scope to find if this variable is modified
      const scope = context.getScope();
      const variable = scope.variables.find(v => v.name === dateVar);

      if (!variable) return false;

      // Check if any references to this variable are followed by property access and modification
      return variable.references.some(ref => {
        const id = ref.identifier;
        const parent = id.parent;

        // Check for patterns like dateVar.setDate(), dateVar.setHours(), etc.
        return (
          parent &&
          parent.type === AST_NODE_TYPES.MemberExpression &&
          parent.object === id &&
          parent.property.type === AST_NODE_TYPES.Identifier &&
          (
            parent.property.name.startsWith('set') ||
            parent.property.name === 'toISOString' ||
            parent.property.name === 'toLocaleString' ||
            parent.property.name === 'toString'
          )
        );
      });
    }

    return {
      ImportDeclaration(node): void {
        // Track Timestamp imports from Firebase
        if (
          node.source.value === 'firebase-admin/firestore' ||
          node.source.value === 'firebase/firestore'
        ) {
          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'Timestamp'
            ) {
              timestampAliases.add(specifier.local.name);
            }
          });
        }
      },

      VariableDeclarator(node): void {
        // Track dynamic imports of Timestamp
        if (
          node.init?.type === AST_NODE_TYPES.AwaitExpression &&
          node.init.argument.type === AST_NODE_TYPES.ImportExpression
        ) {
          const importSource = node.init.argument.source;
          if (
            importSource.type === AST_NODE_TYPES.Literal &&
            (importSource.value === 'firebase-admin/firestore' ||
              importSource.value === 'firebase/firestore')
          ) {
            // Handle destructured imports
            if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
              node.id.properties.forEach((prop) => {
                if (
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'Timestamp'
                ) {
                  if (prop.value.type === AST_NODE_TYPES.Identifier) {
                    timestampAliases.add(prop.value.name);
                  }
                }
              });
            }
          }
        }
      },

      CallExpression(node): void {
        if (isTimestampFromDateWithNewDate(node)) {
          context.report({
            node,
            messageId: 'preferTimestampNow',
            fix(fixer) {
              if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
                const timestampObj = context
                  .getSourceCode()
                  .getText(node.callee.object);
                return fixer.replaceText(node, `${timestampObj}.now()`);
              }
              return null;
            },
          });
        } else if (isTimestampFromMillisWithDateNow(node)) {
          context.report({
            node,
            messageId: 'preferTimestampNow',
            fix(fixer) {
              if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
                const timestampObj = context
                  .getSourceCode()
                  .getText(node.callee.object);
                return fixer.replaceText(node, `${timestampObj}.now()`);
              }
              return null;
            },
          });
        }
      },

      NewExpression(node): void {
        // Only flag direct new Date() usage if it's assigned to a variable named timestamp or similar
        if (isNewDateDirectUsage(node)) {
          const parent = node.parent;
          if (
            parent &&
            parent.type === AST_NODE_TYPES.VariableDeclarator &&
            parent.id.type === AST_NODE_TYPES.Identifier
          ) {
            const varName = parent.id.name.toLowerCase();

            // Check if the variable name suggests it's a timestamp
            if (
              varName.includes('timestamp') ||
              varName.includes('time') ||
              varName.includes('now') ||
              varName.includes('date') ||
              varName.includes('created') ||
              varName.includes('updated')
            ) {
              // Check if the Date object is being modified
              if (isDateBeingModified(parent.id.name)) {
                // If the Date is being modified, don't flag it
                return;
              }

              // Check if we have a Timestamp import before suggesting
              if (timestampAliases.size > 0) {
                const timestampName = Array.from(timestampAliases)[0];
                context.report({
                  node,
                  messageId: 'preferTimestampNow',
                  fix(fixer) {
                    return fixer.replaceText(node, `${timestampName}.now()`);
                  },
                });
              }
            }
          }
        }
      },
    };
  },
});
