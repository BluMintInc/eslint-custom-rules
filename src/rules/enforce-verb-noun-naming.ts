import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import nlp from 'compromise';

type MessageIds = 'functionVerbPhrase';

const PREPOSITIONS = ['to', 'from', 'with', 'by', 'at', 'of'] as const;

export const enforceVerbNounNaming = createRule<[], MessageIds>({
  name: 'enforce-verb-noun-naming',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce verb phrases for functions and methods',
      recommended: 'error',
    },
    schema: [],
    messages: {
      functionVerbPhrase:
        'Function names should start with a verb phrase (e.g., fetchData, processRequest)',
    },
  },
  defaultOptions: [],
  create(context) {
    function extractFirstWord(name: string) {
      const firstChar = name.charAt(0);
      const rest = name.slice(1);
      const words = rest.split(/(?=[A-Z])/);
      return firstChar + words[0];
    }

    function toSentence(name: string) {
      return name.split(/(?=[A-Z])/).join(' ');
    }

    function getPossibleTags(sentence: string) {
      const doc = nlp(sentence);
      const terms = doc.terms().json();

      if (terms.length === 0 || !terms[0].terms || !terms[0].terms[0].tags)
        return [];

      const tags = terms[0].terms[0].tags;
      return tags;
    }

    function isVerbPhrase(name: string): boolean {
      const firstWord = extractFirstWord(name);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (PREPOSITIONS.includes(firstWord.toLowerCase() as any)) {
        return true;
      }

      const tags = getPossibleTags(toSentence(name));
      const isVerb = tags.includes('Verb');
      const isPreposition = tags.includes('Preposition');
      const isConjunction = tags.includes('Conjunction');
      return isVerb || isPreposition || isConjunction;
    }

    function isJsxReturnFunction(node: TSESTree.Node): boolean {
      if (
        node.type !== AST_NODE_TYPES.FunctionDeclaration &&
        node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
        node.type !== AST_NODE_TYPES.FunctionExpression
      ) {
        return false;
      }

      // Check if function returns JSX
      const sourceCode = context.getSourceCode();
      const text = sourceCode.getText(node);
      return text.includes('return <') || text.includes('=> <');
    }
    return {
      FunctionDeclaration(node) {
        if (!node.id) return;

        if (isJsxReturnFunction(node)) {
          return;
        }

        if (!isVerbPhrase(node.id.name)) {
          context.report({
            node: node.id,
            messageId: 'functionVerbPhrase',
          });
        }
      },

      VariableDeclarator(node) {
        if (node.id.type !== AST_NODE_TYPES.Identifier) return;

        // Only check if it's a function
        if (
          node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.init?.type === AST_NODE_TYPES.FunctionExpression
        ) {
          if (isJsxReturnFunction(node.init)) {
            return;
          }

          if (!isVerbPhrase(node.id.name)) {
            context.report({
              node: node.id,
              messageId: 'functionVerbPhrase',
            });
          }
        }
      },

      MethodDefinition(node) {
        if (node.key.type !== AST_NODE_TYPES.Identifier) return;

        if (!isVerbPhrase(node.key.name)) {
          context.report({
            node: node.key,
            messageId: 'functionVerbPhrase',
          });
        }
      },
    };
  },
});
