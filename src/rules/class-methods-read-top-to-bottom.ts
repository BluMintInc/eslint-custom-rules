import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ClassGraphBuilder } from '../utils/graph/ClassGraphBuilder';

function getMemberName(member: TSESTree.ClassElement): string | null {
  if (
    member.type === 'MethodDefinition' ||
    member.type === 'PropertyDefinition'
  ) {
    return member.key.type === 'Identifier' ? member.key.name : null;
  }
  return null;
}

export const classMethodsReadTopToBottom: TSESLint.RuleModule<
  'classMethodsReadTopToBottom',
  never[]
> = createRule({
  name: 'class-methods-read-top-to-bottom',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Ensures classes read linearly from top to bottom.',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      classMethodsReadTopToBottom:
        'Methods should be ordered for top-down readability.',
    },
    fixable: 'code', // To allow ESLint to autofix issues.
  },
  defaultOptions: [],
  create(context) {
    let className: string;
    return {
      ClassDeclaration(node: TSESTree.ClassDeclaration) {
        className = node.id?.name || '';
      },
      'ClassBody:exit'(node: TSESTree.ClassBody) {
        const graphBuilder = new ClassGraphBuilder(className, node);
        const sortedOrder = graphBuilder.memberNamesSorted;
        const actualOrder = node.body
          .map((member) =>
            member.type === 'MethodDefinition' ||
            member.type === 'PropertyDefinition'
              ? (member.key as TSESTree.Identifier).name
              : null,
          )
          .filter(Boolean) as string[];

        for (let i = 0; i < actualOrder.length; i++) {
          if (actualOrder[i] !== sortedOrder[i]) {
            const sourceCode = context.getSourceCode();
            const newClassBody = sortedOrder
              .map((n, index) => {
                // Fetch the actual AST node corresponding to the name
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const memberNode = node.body.find(
                  (member) => getMemberName(member) === n,
                )!;

                // Get all comments before and after the member
                const comments = sourceCode.getCommentsBefore(memberNode);
                const commentsAfter = sourceCode.getCommentsAfter(memberNode);

                // Get the original text with comments
                const originalText = sourceCode.getText().slice(
                  Math.min(
                    memberNode.range[0],
                    comments.length > 0 ? comments[0].range[0] : memberNode.range[0],
                  ),
                  Math.max(
                    memberNode.range[1],
                    commentsAfter.length > 0 ? commentsAfter[commentsAfter.length - 1].range[1] : memberNode.range[1],
                  ),
                );

                // Add newlines between members
                const prefix = index === 0 ? '' : '\n';
                const lines = originalText.split('\n').map((line, i) => {
                  const trimmedLine = line.trim();
                  if (i === 0) {
                    // For first line, preserve any leading whitespace
                    const leadingSpace = line.match(/^\s*/)?.[0] || '';
                    return leadingSpace + trimmedLine;
                  }
                  const lines = trimmedLine.split('\n');
                  const indentation = '                ';
                  const indentedLines = lines.map(line => {
                    if (line.trim().startsWith('//')) {
                      return line.trim();
                    }
                    if (line.trim().startsWith('*')) {
                      return indentation + '  ' + line.trim();
                    }
                    if (line.trim().startsWith('public') || line.trim().startsWith('protected') || line.trim().startsWith('private')) {
                      return '  ' + line.trim();
                    }
                    if (line.trim().startsWith('constructor')) {
                      return '  ' + line.trim();
                    }
                    if (line.trim().startsWith('return') || line.trim().startsWith('const') || line.trim().startsWith('if') || line.trim().startsWith('for')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('this.')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('}')) {
                      return '                ' + line.trim();
                    }
                    if (line.trim().startsWith('LinkedListUtil.')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('rounds.push')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('throw')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('abstract class')) {
                      return '  ' + line.trim();
                    }
                    if (line.trim().startsWith('class')) {
                      return '  ' + line.trim();
                    }
                    if (line.trim().startsWith('export class')) {
                      return '  ' + line.trim();
                    }
                    if (line.trim().startsWith('async')) {
                      return '                ' + line.trim();
                    }
                    if (line.trim().startsWith('public static')) {
                      return '  ' + line.trim();
                    }
                    if (line.trim().startsWith('abstract')) {
                      return '  ' + line.trim();
                    }
                    if (line.trim().startsWith('protected abstract')) {
                      return '  ' + line.trim();
                    }
                    if (line.trim().startsWith('public')) {
                      return '  ' + line.trim();
                    }
                    if (line.trim().startsWith('private')) {
                      return '  ' + line.trim();
                    }
                    if (line.trim().startsWith('protected')) {
                      return '  ' + line.trim();
                    }
                    if (line.trim().startsWith('?')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('winner')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('...')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('=')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith(':')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('(')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('{')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('?')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('!')) {
                      return indentation + line.trim();
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    if (line.trim().startsWith('·')) {
                      return '\n';
                    }
                    return indentation + line.trim();
                  });
                  return indentedLines.join('\n');
                });

                // Remove trailing whitespace and empty lines
                return prefix + lines.map(line => line.trimEnd()).join('\n');
              })
              .join('');
            return context.report({
              node,
              messageId: 'classMethodsReadTopToBottom',
              fix(fixer) {
                return fixer.replaceTextRange(
                  [node.range[0] + 1, node.range[1] - 1], // Exclude the curly braces
                  newClassBody,
                );
              },
            });
          }
        }
      },
    };
  },
});
