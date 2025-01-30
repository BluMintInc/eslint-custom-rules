import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferSetMerge';

export const enforceFirestoreSetMerge = createRule<[], MessageIds>({
  name: 'enforce-firestore-set-merge',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using set() with { merge: true } instead of update() for Firestore operations',
      recommended: 'error',
      requiresTypeChecking: false,
      extendsBaseRule: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferSetMerge:
        'Use set() with { merge: true } instead of update() for more predictable Firestore operations. Instead of `docRef.update({ field: value })`, use `docRef.set({ field: value }, { merge: true })`. This ensures consistent behavior when the document does not exist.',
    },
  },
  defaultOptions: [],
  create(context) {
    const updateAliases = new Set<string>();

    function isFirestoreUpdateCall(node: TSESTree.CallExpression): boolean {
      // Check if it's a set() call with merge: true
      if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
        const property = node.callee.property;
        if (property.type === AST_NODE_TYPES.Identifier) {
          // If it's a set() call, check if it has merge: true
          if (property.name === 'set') {
            const lastArg = node.arguments[node.arguments.length - 1];
            if (lastArg?.type === AST_NODE_TYPES.ObjectExpression) {
              const hasMergeTrue = lastArg.properties.some(
                (prop) =>
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'merge' &&
                  prop.value.type === AST_NODE_TYPES.Literal &&
                  prop.value.value === true
              );
              if (hasMergeTrue) {
                return false; // Already using set with merge: true
              }
            }
          }
          // Only flag update() calls
          return property.name === 'update';
        }
      }
      if (node.callee.type === AST_NODE_TYPES.Identifier) {
        // Check if it's a setDoc() call with merge: true
        if (node.callee.name === 'setDoc') {
          const lastArg = node.arguments[node.arguments.length - 1];
          if (lastArg?.type === AST_NODE_TYPES.ObjectExpression) {
            const hasMergeTrue = lastArg.properties.some(
              (prop) =>
                prop.type === AST_NODE_TYPES.Property &&
                prop.key.type === AST_NODE_TYPES.Identifier &&
                prop.key.name === 'merge' &&
                prop.value.type === AST_NODE_TYPES.Literal &&
                prop.value.value === true
            );
            if (hasMergeTrue) {
              return false; // Already using setDoc with merge: true
            }
          }
        }
        return updateAliases.has(node.callee.name);
      }
      return false;
    }

    function convertUpdateToSetMerge(
      node: TSESTree.CallExpression,
      sourceCode: any,
    ): string {
      const args = node.arguments;
      if (args.length === 0) return '';

      if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
        const object = sourceCode.getText(node.callee.object);
        if (object.includes('transaction')) {
          const docRef = sourceCode.getText(args[0]);
          const data = sourceCode.getText(args[1]);
          return `${object}.set(${docRef}, ${data}, { merge: true })`;
        }
        const data = sourceCode.getText(args[0]);
        return `${object}.set(${data}, { merge: true })`;
      }
      // For updateDoc from firebase/firestore
      const docRef = sourceCode.getText(args[0]);
      const data = args.length > 1 ? sourceCode.getText(args[1]) : '{}';
      return `setDoc(${docRef}, ${data}, { merge: true })`;
    }

    return {
      ImportDeclaration(node): void {
        if (
          node.source.value === 'firebase/firestore' ||
          node.source.value === 'firebase-admin'
        ) {
          node.specifiers.forEach((specifier) => {
            if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
              if (specifier.imported.name === 'updateDoc') {
                updateAliases.add(specifier.local.name);
              }
            }
          });
        }
      },

      ImportExpression(node): void {
        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          (node.source.value === 'firebase/firestore' ||
            node.source.value === 'firebase-admin')
        ) {
          // Dynamic imports are handled in VariableDeclarator
        }
      },

      VariableDeclarator(node): void {
        if (
          node.init?.type === AST_NODE_TYPES.AwaitExpression &&
          node.init.argument.type === AST_NODE_TYPES.ImportExpression
        ) {
          const importSource = node.init.argument.source;
          if (
            importSource.type === AST_NODE_TYPES.Literal &&
            (importSource.value === 'firebase/firestore' ||
              importSource.value === 'firebase-admin')
          ) {
            // Handle destructured imports
            if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
              node.id.properties.forEach((prop) => {
                if (
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'updateDoc'
                ) {
                  if (prop.value.type === AST_NODE_TYPES.Identifier) {
                    updateAliases.add(prop.value.name);
                  }
                }
              });
            }
          }
        }
      },

      CallExpression(node): void {
        if (isFirestoreUpdateCall(node)) {
          context.report({
            node,
            messageId: 'preferSetMerge',
            fix(fixer) {
              const newText = convertUpdateToSetMerge(
                node,
                context.getSourceCode(),
              );
              return fixer.replaceText(node, newText);
            },
          });
        }
      },
    };
  },
});
