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
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (
      !normalizedPath.includes('/functions/src/') &&
      !normalizedPath.startsWith('functions/src/')
    ) {
      return {};
    }

    // Exclude test files
    if (
      fileName.endsWith('.test.ts') ||
      fileName.endsWith('.spec.ts') ||
      fileName.endsWith('.test.tsx') ||
      fileName.endsWith('.spec.tsx')
    ) {
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

    function getImportDef(calleeName: string): any {
      const scope = context.getScope();
      let currentScope = scope;
      let variable = currentScope.set.get(calleeName);

      while (!variable && currentScope.upper) {
        currentScope = currentScope.upper;
        variable = currentScope.set.get(calleeName);
      }

      if (!variable) return null;

      return variable.defs.find((def) => def.type === 'ImportBinding');
    }

    function isFromAllowedSource(importDef: any): boolean {
      if (!importDef || !importDef.parent) return false;

      const importDeclaration = importDef.parent as TSESTree.ImportDeclaration;
      if (importDeclaration.type !== AST_NODE_TYPES.ImportDeclaration)
        return false;

      const source = importDeclaration.source.value;
      return (
        source.startsWith('firebase-functions') ||
        source.includes('v2/') ||
        source.includes('util/webhook/')
      );
    }

    function getOriginalName(importDef: any, calleeName: string): string {
      if (!importDef || !importDef.node) return calleeName;

      if (importDef.node.type === AST_NODE_TYPES.ImportSpecifier) {
        return importDef.node.imported.name;
      }

      // For Default imports or Namespace imports, we use the local name as the "original" name
      // because we can't easily know what it was exported as without more complex analysis.
      // However, if it's a default import from a local file, it won't pass isFromAllowedSource.
      return calleeName;
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

        // We only care about simple identifier calls (e.g., onCall())
        // per instructions: "Primary focus is on our internal wrappers... donot worry about legacy code / external libraries using namespaced calls."
        if (node.callee.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        const calleeName = node.callee.name;
        const importDef = getImportDef(calleeName);

        if (!importDef) {
          return;
        }

        if (!isFromAllowedSource(importDef)) {
          return;
        }

        const originalName = getOriginalName(importDef, calleeName);
        if (!entryPoints.has(originalName)) {
          return;
        }

        if (!isTopLevel(node)) {
          return;
        }

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
      },
    };
  },
});
