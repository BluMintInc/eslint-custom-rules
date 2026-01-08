import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
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

/**
 * Checks if a node is at the top level of the file (not nested inside functions or classes).
 */
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

/**
 * Obtains the scope for a node in an ESLint 9+ compatible way.
 */
function getScopeForNode(
  context: TSESLint.RuleContext<MessageIds, Options>,
  node: TSESTree.Node,
): TSESLint.Scope.Scope {
  const sourceCode = context.sourceCode ?? context.getSourceCode();
  const sourceCodeWithScope = sourceCode as unknown as {
    getScope?: (currentNode: TSESTree.Node) => TSESLint.Scope.Scope;
  };

  if (typeof sourceCodeWithScope.getScope === 'function') {
    return sourceCodeWithScope.getScope(node);
  }

  return context.getScope();
}

/**
 * Gets the import definition for a given name in the current scope.
 */
function getImportDef(
  context: TSESLint.RuleContext<MessageIds, Options>,
  calleeName: string,
  node: TSESTree.Node,
): TSESLint.Scope.Definition | null {
  const scope = getScopeForNode(context, node);
  let currentScope: TSESLint.Scope.Scope | null = scope;
  let variable: TSESLint.Scope.Variable | undefined;

  while (currentScope) {
    variable = currentScope.set.get(calleeName);
    if (variable) {
      break;
    }
    currentScope = currentScope.upper;
  }

  if (!variable) {
    return null;
  }

  return variable.defs.find((def) => def.type === 'ImportBinding') ?? null;
}

/**
 * Checks if the import comes from an allowed Firebase or internal wrapper source.
 */
function isFromAllowedSource(
  importDef: TSESLint.Scope.Definition | null,
): boolean {
  if (!importDef || !importDef.parent) {
    return false;
  }

  const importDeclaration = importDef.parent as TSESTree.ImportDeclaration;
  if (importDeclaration.type !== AST_NODE_TYPES.ImportDeclaration) {
    return false;
  }

  const source = importDeclaration.source.value;
  return (
    source.startsWith('firebase-functions') ||
    source.includes('v2/') ||
    source.includes('util/webhook/')
  );
}

/**
 * Resolves the original name of the imported function, handling aliases and default imports.
 */
function getOriginalName(
  importDef: TSESLint.Scope.Definition | null,
  calleeName: string,
  entryPoints: Set<string>,
): string {
  if (!importDef || !importDef.node) {
    return calleeName;
  }

  // Handle named imports: import { onCall as myCall } from ...
  if (importDef.node.type === AST_NODE_TYPES.ImportSpecifier) {
    const { imported } = importDef.node;
    if (imported.type === AST_NODE_TYPES.Identifier) {
      return imported.name;
    }
    // In ESLint 8+, imported can be a Literal. We handle it at runtime.
    if ((imported as any).type === AST_NODE_TYPES.Literal) {
      return String((imported as any).value);
    }
  }

  // Handle default imports: import onCall from '../../v2/https/onCall'
  // or even: import myHandler from '../../v2/https/onCall'
  if (importDef.node.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
    const importDeclaration = importDef.parent as TSESTree.ImportDeclaration;
    const modulePath = importDeclaration.source.value;

    // For default imports, extract the module path's last segment and check if it's an entry point module
    // We match both / segment and \ segment (for Windows paths in sources, though uncommon)
    const match = modulePath.match(/[/\\]([^/\\]+)$/);
    const segment = match ? match[1] : modulePath;
    if (entryPoints.has(segment)) {
      return segment;
    }
  }

  return calleeName;
}

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
        'Entry points must use ".f.ts" to clearly mark the public function surface to avoid accidental export/name collisions, ' +
        'unintended exposure of internal implementation during deployment, confusion during imports/tests, and maintenance bugs. ' +
        'Rename this file to "{{suggestedName}}" to mark it as a public entry point.',
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

    return {
      ExportNamedDeclaration(node) {
        if (isDefiningEntryPoint || !node.declaration) {
          return;
        }

        // Handle function declaration: export function onCall() {}
        if (
          node.declaration.type === AST_NODE_TYPES.FunctionDeclaration &&
          node.declaration.id &&
          entryPoints.has(node.declaration.id.name)
        ) {
          isDefiningEntryPoint = true;
          return;
        }

        // Handle variable declaration: export const onCall = ...
        if (node.declaration.type === AST_NODE_TYPES.VariableDeclaration) {
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
      },
      ExportDefaultDeclaration(node) {
        if (isDefiningEntryPoint) {
          return;
        }

        if (
          node.declaration.type === AST_NODE_TYPES.FunctionDeclaration &&
          node.declaration.id &&
          entryPoints.has(node.declaration.id.name)
        ) {
          isDefiningEntryPoint = true;
        }
      },
      CallExpression(node) {
        if (reported || isDefiningEntryPoint) {
          return;
        }

        // We only care about simple identifier calls (e.g., onCall())
        if (node.callee.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        const calleeName = node.callee.name;

        // Optimization: Early return if it's not a top-level call
        if (!isTopLevel(node)) {
          return;
        }

        // Variable lookup logic and import source validation
        const importDef = getImportDef(context, calleeName, node);
        if (!importDef || !isFromAllowedSource(importDef)) {
          return;
        }

        // Entry point checking
        const originalName = getOriginalName(importDef, calleeName, entryPoints);
        if (!entryPoints.has(originalName)) {
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
