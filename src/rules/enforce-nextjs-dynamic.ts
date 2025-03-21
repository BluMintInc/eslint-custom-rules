import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import type { RuleFix } from '@typescript-eslint/utils/dist/ts-eslint';

export const RULE_NAME = 'enforce-nextjs-dynamic';

type Options = [];

export default createRule<Options, 'useNextjsDynamic'>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce Next.js dynamic over useDynamic',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useNextjsDynamic:
        'Use Next.js dynamic() instead of useDynamic(). Example: const Component = dynamic(() => import("path/to/component"), { ssr: false })',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      // Look for variable declarations using useDynamic
      VariableDeclarator(node) {
        // Check if the initializer is a call expression
        if (
          node.init &&
          node.init.type === AST_NODE_TYPES.CallExpression &&
          node.init.callee.type === AST_NODE_TYPES.Identifier &&
          node.init.callee.name === 'useDynamic'
        ) {
          // Get the source code of the file
          const sourceCode = context.getSourceCode();

          // Check if 'dynamic' is already imported from 'next/dynamic'
          let dynamicImported = false;
          const importDeclarations = sourceCode.ast.body.filter(
            (node): node is TSESTree.ImportDeclaration =>
              node.type === AST_NODE_TYPES.ImportDeclaration
          );

          for (const importDecl of importDeclarations) {
            if (
              importDecl.source.value === 'next/dynamic' &&
              importDecl.specifiers.some(
                (spec) =>
                  spec.type === AST_NODE_TYPES.ImportDefaultSpecifier &&
                  spec.local.name === 'dynamic'
              )
            ) {
              dynamicImported = true;
              break;
            }
          }

          // Get the variable name being declared
          const variableName = node.id.type === AST_NODE_TYPES.Identifier ? node.id.name : '';

          // Check if it's a destructuring pattern
          const isDestructuring = node.id.type === AST_NODE_TYPES.ObjectPattern;

          // Get the import argument
          const importArg = node.init.arguments[0];

          // Find useDynamic import declarations to remove
          const useDynamicImports = importDeclarations.filter(importDecl => {
            const sourceValue = importDecl.source.value;
            return (
              typeof sourceValue === 'string' &&
              (sourceValue.includes('/useDynamic') || sourceValue.includes('/hooks/useDynamic'))
            );
          });

          // Report the issue and provide a fix
          context.report({
            node,
            messageId: 'useNextjsDynamic',
            fix(fixer) {
              const fixes: RuleFix[] = [];

              // First, remove all useDynamic imports
              for (const importDecl of useDynamicImports) {
                fixes.push(fixer.remove(importDecl));
              }

              // Add import for dynamic if it's not already imported
              if (!dynamicImported) {
                const importStatement = 'import dynamic from \'next/dynamic\';\n';
                fixes.push(fixer.insertTextBefore(sourceCode.ast.body[0], importStatement));
              }

              // Get the import path as a string
              const importPathText = sourceCode.getText(importArg);

              if (isDestructuring && node.id.type === AST_NODE_TYPES.ObjectPattern) {
                // Handle destructuring case
                const properties = node.id.properties;
                const namedExports = properties.map((prop) => {
                  if (prop.type === AST_NODE_TYPES.Property &&
                      prop.key.type === AST_NODE_TYPES.Identifier) {
                    return prop.key.name;
                  }
                  return '';
                }).filter(Boolean);

                // Create separate dynamic imports for each named export
                const dynamicImports = namedExports.map((name) => {
                  return `const ${name} = dynamic(
  async () => {
    const mod = await ${importPathText};
    return mod.${name};
  },
  { ssr: false }
);`;
                }).join('\n\n');

                if (node.parent) {
                  fixes.push(fixer.replaceText(node.parent, dynamicImports));
                }
              } else {
                // Handle regular variable declaration
                const replacement = `${variableName} = dynamic(
  async () => {
    const mod = await ${importPathText};
    return mod.default;
  },
  { ssr: false }
)`;
                fixes.push(fixer.replaceText(node, replacement));
              }

              return fixes;
            },
          });
        }
      },
    };
  },
});
