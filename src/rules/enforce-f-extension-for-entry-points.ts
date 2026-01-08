import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import path from 'path';

type MessageIds = 'requireFExtension';

type Options = [
  {
    entryPoints?: string[];
  },
];

const DEFAULT_ENTRY_POINTS = [
  'onCall',
  'onCallVaripotent',
  'onRequest',
  'onQueueTask',
  'onWebhook',
  'sequentialDocumentWritten',
  'onDocumentWritten',
  'onDocumentCreated',
  'onDocumentDeleted',
  'onDocumentUpdated',
  'onSchedule',
  'onValueWritten',
  'onValueCreated',
  'onValueUpdated',
  'onValueDeleted',
  'sequentialValueWritten',
  'sequentialValueCreated',
  'sequentialValueUpdated',
  'sequentialValueDeleted',
];

export const enforceFExtensionForEntryPoints = createRule<Options, MessageIds>({
  name: 'enforce-f-extension-for-entry-points',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce .f.ts extension for entry points',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entryPoints: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      requireFExtension:
        'File "{{fileName}}" contains a Firebase Cloud Function entry point "{{entryPoint}}" but lacks the ".f.ts" extension. ' +
        'Rename this file to "{{suggestedName}}" to clearly identify it as a public entry point and distinguish it from implementation logic.',
    },
  },
  defaultOptions: [{ entryPoints: DEFAULT_ENTRY_POINTS }],
  create(context, [options]) {
    const filePath = context.getFilename();
    const fileName = path.basename(filePath);
    const entryPoints = new Set(options.entryPoints || DEFAULT_ENTRY_POINTS);

    // Only apply to files under functions/src/
    if (!filePath.includes('functions/src/')) {
      return {};
    }

    // Exclude test files
    if (fileName.endsWith('.test.ts') || fileName.endsWith('.spec.ts')) {
      return {};
    }

    // Only apply to .ts and .tsx files (not .f.ts or .f.tsx)
    if (
      (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx')) ||
      /\.f\.tsx?$/.test(fileName)
    ) {
      return {};
    }

    let isDefiningEntryPoint = false;
    let reported = false;

    function isTopLevel(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node.parent;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          current.type === AST_NODE_TYPES.ClassDeclaration ||
          current.type === AST_NODE_TYPES.ClassExpression ||
          current.type === AST_NODE_TYPES.MethodDefinition
        ) {
          return false;
        }
        current = current.parent;
      }
      return true;
    }

    return {
      ExportNamedDeclaration(node) {
        if (isDefiningEntryPoint) return;
        if (node.declaration) {
          if (
            node.declaration.type === AST_NODE_TYPES.FunctionDeclaration &&
            node.declaration.id &&
            entryPoints.has(node.declaration.id.name)
          ) {
            isDefiningEntryPoint = true;
          } else if (
            node.declaration.type === AST_NODE_TYPES.VariableDeclaration
          ) {
            for (const decl of node.declaration.declarations) {
              if (
                decl.id.type === AST_NODE_TYPES.Identifier &&
                entryPoints.has(decl.id.name)
              ) {
                isDefiningEntryPoint = true;
                break;
              }
            }
          }
        }
      },
      ExportDefaultDeclaration(node) {
        if (isDefiningEntryPoint) return;
        if (
          node.declaration.type === AST_NODE_TYPES.FunctionDeclaration &&
          node.declaration.id &&
          entryPoints.has(node.declaration.id.name)
        ) {
          isDefiningEntryPoint = true;
        }
      },
      CallExpression(node) {
        if (reported || isDefiningEntryPoint) return;

        let calleeName: string | undefined;

        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          calleeName = node.callee.name;
        } else if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          // Primary focus is on internal wrappers, but namespaced calls can be checked if they match entry points
          // However, the requirement says "Primary focus is on our internal wrappers (in functions/src/v2/), donot worry about legacy code / external libraries using namespaced calls."
          // So we skip MemberExpression for now as per instructions.
          return;
        }

        if (calleeName) {
          const scope = context.getScope();
          let variable = scope.set.get(calleeName);
          let currentScope = scope;
          while (!variable && currentScope.upper) {
            currentScope = currentScope.upper;
            variable = currentScope.set.get(calleeName);
          }

          if (variable) {
            const isImport = variable.defs.some(
              (def) => def.type === 'ImportBinding',
            );

            if (!isImport) {
              return;
            }

            const importDef = variable.defs.find(
              (def) => def.type === 'ImportBinding',
            ) as any;
            if (
              importDef &&
              importDef.node.type === AST_NODE_TYPES.ImportSpecifier
            ) {
              const importDeclaration =
                importDef.parent as TSESTree.ImportDeclaration;
              const source = importDeclaration.source.value;

              // Check if the source is from firebase-functions or our internal v2/util wrappers
              const isFromFirebaseFunctions =
                source.startsWith('firebase-functions');
              const isFromInternalWrappers =
                source.includes('v2/') || source.includes('util/webhook/');

              if (!isFromFirebaseFunctions && !isFromInternalWrappers) {
                return;
              }
            }

            let originalName = calleeName;
            if (
              importDef &&
              importDef.node.type === AST_NODE_TYPES.ImportSpecifier
            ) {
              originalName = importDef.node.imported.name;
            }

            if (!entryPoints.has(originalName)) {
              return;
            }
          } else {
            // If it's not found in scope, it might be a global or just not imported.
            return;
          }

          if (isTopLevel(node)) {
            reported = true;
            const suggestedName = fileName.replace(/\.tsx?$/, '.f$&');
            context.report({
              node,
              messageId: 'requireFExtension',
              data: {
                fileName,
                entryPoint: calleeName,
                suggestedName,
              },
            });
          }
        }
      },
    };
  },
});
