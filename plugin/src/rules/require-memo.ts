import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { RuleContext } from '@typescript-eslint/utils/dist/ts-eslint';
import { ASTHelpers } from '../utils/ASTHelpers';

export type NodeWithParent = TSESTree.Node & { parent: NodeWithParent };

export type ComponentNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

const isComponentExplicitlyUnmemoized = (componentName: string) =>
  componentName.toLowerCase().includes('unmemoized');

function isFunction(
  node: TSESTree.Node,
): node is TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

function isHigherOrderFunctionReturningJSX(node: TSESTree.Node): boolean {
  if (isFunction(node)) {
    // Check if function takes another function as an argument
    const hasFunctionParam = 'params' in node && node.params.some(isFunction);

    if (node.body && node.body.type === 'BlockStatement') {
      for (const statement of node.body.body) {
        if (statement.type === 'ReturnStatement' && statement.argument) {
          const returnsJSX = ASTHelpers.returnsJSX(statement.argument);
          const returnsFunction = isFunction(statement.argument);

          return (hasFunctionParam || returnsFunction) && returnsJSX;
        }
      }
    }
  }
  return false;
}

const isUnmemoizedArrowFunction = (parentNode: TSESTree.Node) => {
  return (
    parentNode.type === 'VariableDeclarator' &&
    parentNode.id.type === 'Identifier' &&
    !isComponentExplicitlyUnmemoized(parentNode.id.name)
  );
};

const isUnmemoizedFunctionComponent = (
  parentNode: TSESTree.Node,
  node: TSESTree.Node,
) => {
  return (
    node.type === 'FunctionDeclaration' &&
    parentNode.type === 'Program' &&
    node.id &&
    !isComponentExplicitlyUnmemoized(node.id.name)
  );
};

const isUnmemoizedExportedFunctionComponent = (
  parentNode: TSESTree.Node,
  node: TSESTree.Node,
) => {
  return (
    node.type === 'FunctionDeclaration' &&
    parentNode.type === 'ExportNamedDeclaration' &&
    node.id &&
    !isComponentExplicitlyUnmemoized(node.id.name)
  );
};

function checkFunction(
  context: Readonly<RuleContext<'requireMemo', []>>,
  node: ComponentNode & NodeWithParent,
) {
  const fileName = context.getFilename();
  if (!fileName.endsWith('.tsx')) {
    return;
  }
  if (isHigherOrderFunctionReturningJSX(node)) {
    return;
  }
  const parentNode = node.parent;
  if (node.parent.type === 'CallExpression') {
    return;
  }

  if (ASTHelpers.returnsJSX(node.body) && ASTHelpers.hasParameters(node)) {
    const results = [
      isUnmemoizedArrowFunction,
      isUnmemoizedFunctionComponent,
      isUnmemoizedExportedFunctionComponent,
    ].map((fn) => fn(parentNode, node));
    if (results.some((result) => !!result)) {
      context.report({
        node,
        messageId: 'requireMemo',
        fix:
          results[2] || results[1]
            ? function fix(fixer) {
                const sourceCode = context.getSourceCode();
                let importFix: TSESLint.RuleFix | null = null;

                // Search for React import statement
                const importDeclarations = sourceCode.ast.body.filter(
                  (node) => node.type === 'ImportDeclaration',
                ) as TSESTree.ImportDeclaration[];

                const reactImport = importDeclarations.find(
                  (importDeclaration) =>
                    importDeclaration.source.value === 'react',
                );

                if (reactImport) {
                  // Check if memo is already imported
                  if (
                    !reactImport.specifiers.some(
                      (specifier) => specifier.local.name === 'memo',
                    )
                  ) {
                    // Add memo to existing import statement
                    const lastSpecifier =
                      reactImport.specifiers[reactImport.specifiers.length - 1];
                    importFix = fixer.insertTextAfter(lastSpecifier, ', memo');
                  }
                } else {
                  // Add new import statement for memo
                  const importStatement = "import { memo } from 'react';\n";
                  importFix = fixer.insertTextBeforeRange(
                    [sourceCode.ast.range[0], sourceCode.ast.range[0]],
                    importStatement,
                  );
                }

                const functionKeywordRange: Readonly<[number, number]> = [
                  node.range[0],
                  node.range[0] + 'function'.length,
                ];
                const functionKeywordReplacement = `const ${
                  node.id!.name
                } = memo(`;

                // Step 3: Rename function
                const functionNameReplacement = `function ${
                  node.id!.name
                }Unmemoized`;

                const fixes = [
                  fixer.replaceTextRange(
                    functionKeywordRange,
                    functionKeywordReplacement,
                  ),
                  fixer.insertTextAfterRange(
                    [node.range[1], node.range[1]],
                    ')',
                  ),
                  fixer.replaceTextRange(
                    [node.id!.range[0] - 1, node.id!.range[1]],
                    functionNameReplacement,
                  ),
                ];

                if (importFix) {
                  fixes.push(importFix);
                }

                return fixes;
              }
            : undefined,
      });
    }
  }
}

export const requireMemo: TSESLint.RuleModule<'requireMemo', []> = {
  create: (context) => ({
    ArrowFunctionExpression(node) {
      checkFunction(context, node as any);
    },
    FunctionDeclaration(node) {
      checkFunction(context, node as any);
    },
    FunctionExpression(node) {
      checkFunction(context, node as any);
    },
  }),
  meta: {
    type: 'problem',
    docs: {
      description: 'React components must be memoized',
      recommended: 'error',
    },
    messages: {
      requireMemo: 'Component definition not wrapped in React.memo()',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
};
