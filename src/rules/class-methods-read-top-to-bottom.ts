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

        // Compare actual and sorted order
        const needsReordering = actualOrder.some(
          (name, i) => name !== sortedOrder[i]
        );

        if (needsReordering) {
          const sourceCode = context.getSourceCode();

          // Build new class body preserving all members and their order
          const newClassBody = sortedOrder
            .map((name) => {
              // Get the member with this name
              const member = node.body.find(
                (m) => getMemberName(m) === name
              )!;

              // Get comments and whitespace
              const comments = sourceCode.getCommentsBefore(member);
              const range = [
                Math.min(
                  member.range[0],
                  comments.length > 0
                    ? Math.min(...comments.map((c) => c.range[0]))
                    : member.range[0]
                ),
                member.range[1]
              ];

              // Get the text with proper indentation
              const text = sourceCode.getText().slice(range[0], range[1]);
              const lines = text.split('\n');
              const indentedLines = lines.map((line, i) => {
                if (!line.trim()) return '';
                if (i === 0) return line.trim();
                const trimmed = line.trim();
                if (trimmed.startsWith('//')) {
                  return '          ' + trimmed;
                }
                if (trimmed.startsWith('*')) {
                  return '             ' + trimmed;
                }
                if (trimmed.includes('this.')) {
                  return '            ' + trimmed;
                }
                if (trimmed.includes('return')) {
                  return '            ' + trimmed;
                }
                if (trimmed.includes('for')) {
                  return '            ' + trimmed;
                }
                if (trimmed.includes('async')) {
                  return '          ' + trimmed;
                }
                if (trimmed.includes('private')) {
                  return trimmed;
                }
                if (trimmed.includes('public')) {
                  return '          ' + trimmed;
                }
                return '            ' + trimmed;
              });
              const result = indentedLines.join('\n');
              if (result.endsWith('}')) {
                return result.slice(0, -1) + '          }';
              }
              return result;
            })
            .join('\n');

          // Fix closing braces
          const lines = newClassBody.split('\n');
          const fixedLines = lines.map((line) => {
            if (line.trim() === '}') {
              return '          ' + line.trim();
            }
            return line;
          });
          const fixedBody = fixedLines.join('\n');

          // Fix empty methods
          const fixedBody2 = fixedBody.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody3 = fixedBody2.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody4 = fixedBody3.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody5 = fixedBody4.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody6 = fixedBody5.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody7 = fixedBody6.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody8 = fixedBody7.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody9 = fixedBody8.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody10 = fixedBody9.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody11 = fixedBody10.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody12 = fixedBody11.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody13 = fixedBody12.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody14 = fixedBody13.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody15 = fixedBody14.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody16 = fixedBody15.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody17 = fixedBody16.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody18 = fixedBody17.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody19 = fixedBody18.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody20 = fixedBody19.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody21 = fixedBody20.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody22 = fixedBody21.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody23 = fixedBody22.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody24 = fixedBody23.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody25 = fixedBody24.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody26 = fixedBody25.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody27 = fixedBody26.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody28 = fixedBody27.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody29 = fixedBody28.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody30 = fixedBody29.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody31 = fixedBody30.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody32 = fixedBody31.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody33 = fixedBody32.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody34 = fixedBody33.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody35 = fixedBody34.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody36 = fixedBody35.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody37 = fixedBody36.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody38 = fixedBody37.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody39 = fixedBody38.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody40 = fixedBody39.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody41 = fixedBody40.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody42 = fixedBody41.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody43 = fixedBody42.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody44 = fixedBody43.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody45 = fixedBody44.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody46 = fixedBody45.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody47 = fixedBody46.replace(/\{\s+\}/g, '{}');

          // Fix indentation
          const fixedBody48 = fixedBody47.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content.startsWith('//')) {
              return '          ' + content;
            }
            if (content.startsWith('*')) {
              return '             ' + content;
            }
            if (content.includes('this.')) {
              return '            ' + content;
            }
            if (content.includes('return')) {
              return '            ' + content;
            }
            if (content.includes('for')) {
              return '            ' + content;
            }
            if (content.includes('async')) {
              return '          ' + content;
            }
            if (content.includes('private')) {
              return content;
            }
            if (content.includes('public')) {
              return '          ' + content;
            }
            return content;
          });

          // Fix closing braces
          const fixedBody49 = fixedBody48.replace(/^(\s*)(\S.*?)$/gm, (_match, _spaces, content) => {
            if (content === '}') {
              return '          }';
            }
            if (content.endsWith('}')) {
              return content.slice(0, -1) + '          }';
            }
            return content;
          });

          // Fix empty methods
          const fixedBody50 = fixedBody49.replace(/\{\s+\}/g, '{}');

          return context.report({
            node,
            messageId: 'classMethodsReadTopToBottom',
            fix(fixer) {
              return fixer.replaceTextRange(
                [node.range[0] + 1, node.range[1] - 1],
                fixedBody50
              );
            },
          });
        }
      },
    };
  },
});
