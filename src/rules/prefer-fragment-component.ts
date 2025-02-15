import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferFragment' | 'addFragmentImport';

export const preferFragmentComponent = createRule<[], MessageIds>({
  name: 'prefer-fragment-component',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using Fragment imported from react over shorthand fragments and React.Fragment',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferFragment: 'Use Fragment imported from react instead of {{type}}',
      addFragmentImport: 'Add Fragment import from react',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    let hasFragmentImport = false;
    let reactImportNode: TSESTree.ImportDeclaration | null = null;

    function getReactImportNode(): TSESTree.ImportDeclaration | null {
      const program = sourceCode.ast;
      for (const node of program.body) {
        if (
          node.type === AST_NODE_TYPES.ImportDeclaration &&
          node.source.value === 'react'
        ) {
          return node;
        }
      }
      return null;
    }

    function checkFragmentImport(node: TSESTree.ImportDeclaration) {
      if (node.source.value === 'react') {
        reactImportNode = node;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === AST_NODE_TYPES.ImportSpecifier &&
            specifier.imported.name === 'Fragment'
          ) {
            hasFragmentImport = true;
            break;
          }
        }
      }
    }

    function addFragmentImport(fixer: TSESLint.RuleFixer) {
      if (reactImportNode) {
        // Add Fragment to existing react import
        const lastSpecifier = reactImportNode.specifiers[reactImportNode.specifiers.length - 1];
        const hasNamedImports = reactImportNode.specifiers.some(
          spec => spec.type === AST_NODE_TYPES.ImportSpecifier
        );

        if (hasNamedImports) {
          return fixer.insertTextAfter(lastSpecifier, ', Fragment');
        } else {
          return fixer.insertTextAfter(lastSpecifier, ', { Fragment }');
        }
      }
      // Add new react import with Fragment
      const importText = 'import { Fragment } from \'react\';\n';
      const indentation = sourceCode.text.match(/^[ \t]*/m)?.[0] || '';
      return fixer.insertTextBefore(
        sourceCode.ast.body[0],
        indentation + importText
      );
    }

    return {
      ImportDeclaration: checkFragmentImport,

      JSXFragment(node) {
        context.report({
          node,
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
          fix(fixer) {
            const fixes: ReturnType<typeof fixer.insertTextBefore>[] = [];
            if (!hasFragmentImport) {
              fixes.push(addFragmentImport(fixer));
            }
            const sourceCode = context.getSourceCode();
            const openingText = sourceCode.getText(node.openingFragment);
            const closingText = sourceCode.getText(node.closingFragment);
            if (openingText === '<>' && closingText === '</>') {
              const openingRange = node.openingFragment.range;
              const closingRange = node.closingFragment.range;

              fixes.push(fixer.replaceTextRange(openingRange, '<Fragment>'));
              fixes.push(fixer.replaceTextRange(closingRange, '</Fragment>'));
            }
            return fixes;
          },
        });
      },

      JSXIdentifier(node) {
        if (
          node.name === 'Fragment' &&
          node.parent?.type === AST_NODE_TYPES.JSXMemberExpression &&
          node.parent.object.type === AST_NODE_TYPES.JSXIdentifier &&
          node.parent.object.name === 'React'
        ) {
          const memberExpr = node.parent;
          const parentElement = memberExpr.parent;
          if (parentElement?.type === AST_NODE_TYPES.JSXOpeningElement) {
            const jsxElement = parentElement.parent;
            if (jsxElement?.type === AST_NODE_TYPES.JSXElement) {
              context.report({
                node: memberExpr,
                messageId: 'preferFragment',
                data: { type: 'React.Fragment' },
                fix(fixer) {
                  const fixes: ReturnType<typeof fixer.insertTextBefore>[] = [];
                  if (!hasFragmentImport) {
                    fixes.push(addFragmentImport(fixer));
                  }
                  const sourceCode = context.getSourceCode();
                  const openingText = sourceCode.getText(parentElement);
                  const closingText = jsxElement.closingElement ? sourceCode.getText(jsxElement.closingElement) : '';
                  if (openingText.startsWith('<React.Fragment') && closingText.startsWith('</React.Fragment')) {
                    const openingRange = parentElement.range;
                    const closingRange = jsxElement.closingElement?.range;
                    if (openingRange && closingRange) {
                      fixes.push(fixer.replaceTextRange(openingRange, '<Fragment>'));
                      fixes.push(fixer.replaceTextRange(closingRange, '</Fragment>'));
                    }
                  }
                  return fixes;
                },
              });
            }
          }
        }
      },

      'Program:exit'() {
        // If we found any violations but no Fragment import, we need to add it
        if (!hasFragmentImport && !reactImportNode) {
          reactImportNode = getReactImportNode();
        }
      },
    };
  },
});
