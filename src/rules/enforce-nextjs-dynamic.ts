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
    const sourceCode = context.getSourceCode();

    // Track imported useDynamic functions and their aliases
    const useDynamicImports = new Map<string, string>(); // alias -> original name

    return {
      ImportDeclaration(node) {
        const sourceValue = node.source.value;
        if (typeof sourceValue === 'string' &&
            (sourceValue.includes('/useDynamic') || sourceValue.includes('/hooks/useDynamic'))) {
          // Track useDynamic imports and their aliases
          for (const specifier of node.specifiers) {
            if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
              useDynamicImports.set(specifier.local.name, 'useDynamic');
            } else if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
              const importedName = specifier.imported.name;
              // Only track if the imported name is exactly 'useDynamic'
              if (importedName === 'useDynamic') {
                useDynamicImports.set(specifier.local.name, importedName);
              }
            }
          }
        }
      },

      // Look for variable declarations using useDynamic
      VariableDeclarator(node) {
        // Check if the initializer is a call expression with exactly one argument that is an import() call
        // Exclude calls with type parameters (generics)
        if (
          node.init &&
          node.init.type === AST_NODE_TYPES.CallExpression &&
          node.init.callee.type === AST_NODE_TYPES.Identifier &&
          useDynamicImports.has(node.init.callee.name) &&
          node.init.arguments.length === 1 &&
          node.init.arguments[0].type === AST_NODE_TYPES.ImportExpression &&
          !node.init.typeParameters // Exclude generic calls like useDynamic<Type>(...)
        ) {
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
          const isDestructuring = node.id.type === AST_NODE_TYPES.ObjectPattern || node.id.type === AST_NODE_TYPES.ArrayPattern;

          // Get the import argument
          const importArg = node.init.arguments[0];

          // Find useDynamic import declarations to remove
          const useDynamicImportDecls = importDeclarations.filter(importDecl => {
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
              for (const importDecl of useDynamicImportDecls) {
                fixes.push(fixer.remove(importDecl));
              }

              // Add import for dynamic if it's not already imported
              if (!dynamicImported) {
                const importStatement = 'import dynamic from \'next/dynamic\';\n';
                // Find the position to insert the import - after the useDynamic import
                const useDynamicImportDecl = useDynamicImportDecls[0];
                if (useDynamicImportDecl) {
                  fixes.push(fixer.insertTextAfter(useDynamicImportDecl, '\n' + importStatement.trim()));
                } else {
                  fixes.push(fixer.insertTextBefore(sourceCode.ast.body[0], importStatement));
                }
              }

              // Get the import path as a string
              const importPathText = sourceCode.getText(importArg);

              if (isDestructuring && node.id.type === AST_NODE_TYPES.ObjectPattern) {
                // Handle destructuring case - only simple property patterns
                const properties = node.id.properties;
                const namedExports = properties.map((prop) => {
                  if (prop.type === AST_NODE_TYPES.Property &&
                      prop.key.type === AST_NODE_TYPES.Identifier &&
                      prop.value.type === AST_NODE_TYPES.Identifier &&
                      !prop.computed) {
                    const keyName = prop.key.name;
                    const valueName = prop.value.name;

                    // Handle 'default' keyword specially
                    const exportName = keyName === 'default' ? 'default' : keyName;

                    return { keyName, valueName, exportName };
                  }
                  return null;
                }).filter(Boolean);

                // Only proceed if we can handle all properties (simple object patterns only)
                if (namedExports.length === properties.length &&
                    properties.every(prop =>
                      prop.type === AST_NODE_TYPES.Property &&
                      !prop.computed &&
                      prop.key.type === AST_NODE_TYPES.Identifier &&
                      prop.value.type === AST_NODE_TYPES.Identifier
                    )) {
                  // Create separate dynamic imports for each named export
                  const dynamicImports = namedExports.map((exportInfo) => {
                    if (!exportInfo) return '';

                    return `const ${exportInfo.valueName} = dynamic(
  async () => {
    const mod = await ${importPathText};
    return mod.${exportInfo.exportName};
  },
  { ssr: false }
);`;
                  }).filter(Boolean).join('\n\n');

                  if (node.parent) {
                    fixes.push(fixer.replaceText(node.parent, dynamicImports));
                  }
                } else {
                  // For complex destructuring patterns, don't provide auto-fix
                  return null;
                }
              } else if (isDestructuring && node.id.type === AST_NODE_TYPES.ArrayPattern) {
                // For array destructuring patterns, don't provide auto-fix
                return null;
              } else {
                // Handle regular variable declaration
                const declarationKeyword = node.parent?.type === AST_NODE_TYPES.VariableDeclaration
                  ? node.parent.kind
                  : 'const';

                // Extract type annotation if present
                let typeAnnotation = '';
                if (node.id.type === AST_NODE_TYPES.Identifier && node.id.typeAnnotation) {
                  typeAnnotation = sourceCode.getText(node.id.typeAnnotation);
                }

                const replacement = `${declarationKeyword} ${variableName}${typeAnnotation} = dynamic(
  async () => {
    const mod = await ${importPathText};
    return mod.default;
  },
  { ssr: false }
);`;

                if (node.parent?.type === AST_NODE_TYPES.VariableDeclaration) {
                  fixes.push(fixer.replaceText(node.parent, replacement));
                } else {
                  fixes.push(fixer.replaceText(node, replacement));
                }
              }

              return fixes;
            },
          });
        }
      },
    };
  },
});
