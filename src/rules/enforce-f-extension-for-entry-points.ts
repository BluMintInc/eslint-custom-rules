import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import path from 'path';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'requireFExtension';

type EnforceFExtensionOptions = [
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
 * Entry points must be defined at the top level because Firebase deployment
 * discovers and registers them by evaluating the module scope. Nested definitions
 * inside functions or classes won't be discovered during the deployment process.
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
 * Checks if a node is defining an entry point, either as a function or variable.
 */
function isNodeDefiningEntryPoint(
  node: TSESTree.Node,
  entryPoints: Set<string>,
): boolean {
  // Handle function declaration: export function onCall() {}
  if (
    node.type === AST_NODE_TYPES.FunctionDeclaration &&
    node.id &&
    entryPoints.has(node.id.name)
  ) {
    return true;
  }

  // Handle variable declaration: export const onCall = ...
  if (node.type === AST_NODE_TYPES.VariableDeclaration) {
    return node.declarations.some(
      (decl) =>
        decl.id.type === AST_NODE_TYPES.Identifier &&
        entryPoints.has(decl.id.name),
    );
  }

  return false;
}

/**
 * Obtains the scope for a node in an ESLint 9+ compatible way.
 */
function getScopeForNode(
  context: TSESLint.RuleContext<MessageIds, EnforceFExtensionOptions>,
  node: TSESTree.Node,
): TSESLint.Scope.Scope {
  const sourceCode = context.sourceCode ?? context.getSourceCode();

  // In ESLint 9+, sourceCode.getScope(node) is the preferred way to get the scope for a node.
  if (typeof (sourceCode as any).getScope === 'function') {
    return (sourceCode as any).getScope(node);
  }

  return context.getScope();
}

/**
 * Gets the import definition for a given name in the current scope.
 */
function getImportDef(
  context: TSESLint.RuleContext<MessageIds, EnforceFExtensionOptions>,
  calleeName: string,
  node: TSESTree.Node,
): TSESLint.Scope.Definition | null {
  const scope = getScopeForNode(context, node);
  const variable = ASTHelpers.findVariableInScope(scope, calleeName);
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
    /(^|\/)v2(\/|$)/.test(source) ||
    /(^|\/)util\/webhook(\/|$)/.test(source)
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
    // Handle Literal imports (string-named imports in ESLint 8+)
    const importedNode = imported as {
      type: AST_NODE_TYPES;
      value?: unknown;
    };
    if (
      importedNode.type === AST_NODE_TYPES.Literal &&
      typeof importedNode.value === 'string'
    ) {
      return importedNode.value;
    }
  }

  // Handle default imports: import onCall from '../../v2/https/onCall'
  // or namespace imports: import * as onCall from '../../v2/https/onCall'
  if (
    importDef.node.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
    importDef.node.type === AST_NODE_TYPES.ImportNamespaceSpecifier
  ) {
    const importDeclaration = importDef.parent as TSESTree.ImportDeclaration;
    const modulePath = importDeclaration.source.value;

    // For default/namespace imports, extract the module path's last segment and check if it's an entry point module
    const match = modulePath.match(/[/\\]([^/\\]+)$/);
    const segment = (match ? match[1] : modulePath).replace(/\.[jt]sx?$/, '');
    if (entryPoints.has(segment)) {
      return segment;
    }
  }

  return calleeName;
}

export const enforceFExtensionForEntryPoints = createRule<
  EnforceFExtensionOptions,
  MessageIds
>({
  name: 'enforce-f-extension-for-entry-points',
  meta: {
    type: 'problem',
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
    const filePath =
      (context as unknown as { filename?: string }).filename ??
      context.getFilename();
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

    // Exclude test files and declaration files
    if (/\.(test|spec)\.tsx?$|\.d\.ts$/.test(fileName)) {
      return {};
    }

    // Only apply to .ts and .tsx files (not .f.ts or .f.tsx)
    if (!/\.tsx?$/.test(fileName) || /\.f\.tsx?$/.test(fileName)) {
      return {};
    }

    let isDefiningEntryPoint = false;
    let reported = false;

    return {
      ExportNamedDeclaration(node) {
        if (isDefiningEntryPoint || !node.declaration) {
          return;
        }

        if (isNodeDefiningEntryPoint(node.declaration, entryPoints)) {
          isDefiningEntryPoint = true;
        }
      },
      ExportDefaultDeclaration(node) {
        if (isDefiningEntryPoint) {
          return;
        }

        if (isNodeDefiningEntryPoint(node.declaration, entryPoints)) {
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
        const originalName = getOriginalName(
          importDef,
          calleeName,
          entryPoints,
        );
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
