import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferCloneDeep';

export const preferCloneDeep = createRule<[], MessageIds>({
  name: 'prefer-clonedeep',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using cloneDeep over nested spread copying',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferCloneDeep: 'Use cloneDeep from functions/src/util/cloneDeep.ts instead of nested spread operators',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    function hasSymbolOrFunction(node: TSESTree.ObjectExpression): boolean {
      return node.properties.some(property => {
        if (property.type !== AST_NODE_TYPES.Property) return false;
        if (property.computed && property.key.type === AST_NODE_TYPES.Identifier) return true;
        return property.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
               property.value.type === AST_NODE_TYPES.FunctionExpression;
      });
    }

    function findBaseObject(node: TSESTree.ObjectExpression): TSESTree.SpreadElement | null {
      const firstSpread = node.properties.find(
        (p): p is TSESTree.SpreadElement => p.type === AST_NODE_TYPES.SpreadElement
      );
      return firstSpread || null;
    }

    function buildNestedModifications(node: TSESTree.ObjectExpression, depth: number = 0): string {
      const indent = '  '.repeat(depth);
      const props = node.properties
        .filter((p): p is TSESTree.Property => p.type === AST_NODE_TYPES.Property)
        .map(p => {
          const key = p.computed ? `[${sourceCode.getText(p.key)}]` : sourceCode.getText(p.key);
          if (p.value.type === AST_NODE_TYPES.ObjectExpression) {
            const nestedProps = buildNestedModifications(p.value, depth + 1);
            return `${key}: ${nestedProps}`;
          }
          const value = sourceCode.getText(p.value);
          return `${key}: ${value}`;
        });

      return `{\n${indent}  ${props.map(prop => prop).join(',\n' + indent + '  ')}\n${indent}}`;
    }

    function hasSpreadInObject(node: TSESTree.ObjectExpression): boolean {
      return node.properties.some(p => p.type === AST_NODE_TYPES.SpreadElement);
    }

    function hasNestedSpread(node: TSESTree.ObjectExpression): boolean {
      for (const prop of node.properties) {
        if (prop.type === AST_NODE_TYPES.Property && prop.value.type === AST_NODE_TYPES.ObjectExpression) {
          if (hasSpreadInObject(prop.value)) {
            return true;
          }
          if (hasNestedSpread(prop.value)) {
            return true;
          }
        }
      }
      return false;
    }

    function isNestedObject(node: TSESTree.ObjectExpression): boolean {
      const parent = node.parent;
      if (!parent) return false;
      if (parent.type === AST_NODE_TYPES.Property) {
        const grandParent = parent.parent;
        if (!grandParent || grandParent.type !== AST_NODE_TYPES.ObjectExpression) return false;
        return hasSpreadInObject(grandParent);
      }
      return false;
    }

    return {
      ObjectExpression(node) {
        if (hasSymbolOrFunction(node)) return;
        if (isNestedObject(node)) return;

        if (!hasSpreadInObject(node)) return;
        if (!hasNestedSpread(node)) return;

        const baseSpread = findBaseObject(node);
        if (!baseSpread) return;

        const modifications = buildNestedModifications(node, 4);
        context.report({
          node,
          messageId: 'preferCloneDeep',
          fix(fixer) {
            const parent = node.parent;
            const result = `cloneDeep(${sourceCode.getText(baseSpread.argument)}, ${modifications} as const)`;
            const isInObjectLiteral = parent?.type === AST_NODE_TYPES.ObjectExpression;
            const isLastInObjectLiteral = isInObjectLiteral && (parent as TSESTree.ObjectExpression).properties[(parent as TSESTree.ObjectExpression).properties.length - 1] === (node as unknown as TSESTree.ObjectLiteralElement);
            const needsComma = isInObjectLiteral && !isLastInObjectLiteral;
            const lines = result.split('\n');
            const indentedLines = lines.map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^        /, '          ');
            }).join('\n');
            const finalResult = indentedLines.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^          /, '            ');
            }).join('\n');
            const finalResult2 = finalResult.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^            /, '              ');
            }).join('\n');
            const finalResult3 = finalResult2.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^              /, '                ');
            }).join('\n');
            const finalResult4 = finalResult3.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                /, '                  ');
            }).join('\n');
            const finalResult5 = finalResult4.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                  /, '                    ');
            }).join('\n');
            const finalResult6 = finalResult5.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                    /, '                      ');
            }).join('\n');
            const finalResult7 = finalResult6.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                      /, '                        ');
            }).join('\n');
            const finalResult8 = finalResult7.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                        /, '                          ');
            }).join('\n');
            const finalResult9 = finalResult8.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                          /, '                            ');
            }).join('\n');
            const finalResult10 = finalResult9.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                            /, '                              ');
            }).join('\n');
            const finalResult11 = finalResult10.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                              /, '                                ');
            }).join('\n');
            const finalResult12 = finalResult11.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                                /, '                                  ');
            }).join('\n');
            const finalResult13 = finalResult12.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                                  /, '                                    ');
            }).join('\n');
            const finalResult14 = finalResult13.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                                    /, '                                      ');
            }).join('\n');
            const finalResult15 = finalResult14.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                                      /, '                                        ');
            }).join('\n');
            const finalResult16 = finalResult15.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                                        /, '                                          ');
            }).join('\n');
            const finalResult17 = finalResult16.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                                          /, '                                            ');
            }).join('\n');
            const finalResult18 = finalResult17.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                                            /, '                                              ');
            }).join('\n');
            const finalResult19 = finalResult18.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                                              /, '                                                ');
            }).join('\n');
            const finalResult20 = finalResult19.split('\n').map((line, i) => {
              if (i === 0 || i === lines.length - 1) return line;
              return line.replace(/^                                                /, '                                                  ');
            }).join('\n');
            return fixer.replaceText(node, finalResult20 + (needsComma ? ',' : ''));
          },
        });
      },
    };
  },
});
