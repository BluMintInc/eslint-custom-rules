import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'functionVerbPhrase';

const PREPOSITIONS = ['to', 'from', 'with', 'by', 'at', 'of'] as const;

// Common verbs that might not match verb patterns
const COMMON_VERBS = new Set([
  'sync',
  'fix',
  'set',
  'get',
  'log',
  'add',
  'map',
  'run',
  'use',
  'has',
  'is',
  'do',
  'go',
  'put',
  'let',
  'try',
  'can',
  'will',
  'make',
  'take',
  'give',
  'find',
  'send',
  'show',
  'keep',
  'hold',
  'save',
  'read',
  'call',
  'turn',
  'pull',
  'push',
  'move',
  'play',
  'stop',
  'bind',
  'seek',
  'load',
  'fail',
  'pass',
  'skip',
  'help',
  'test',
  'mock',
  'wrap',
  'sort',
  'join',
  'wait',
  'kill',
  'lock',
  'meet',
  'rest',
  'copy',
  'drop',
  'fire',
  'plan',
  'rate',
  'mark',
  'post',
  'fetch',
  'process',
]);

// Common verb suffixes
const VERB_SUFFIXES = [
  'ize',
  'ate',
  'ify',
  'ise',
  'ect',
  'uck',
  'ush',
  'ash',
  'ess',
  'end',
  'ent',
  'ard',
  'ute',
  'ume',
  'ase',
  'ock',
  'ool',
  'ack',
  'ish',
  'ide',
  'ive',
  'ose',
  'amp',
  'ure',
  'ape',
  'eat',
  'eal',
  'aze',
  'ink',
  'unk',
  'ake',
  'ite',
  'ame',
  'aim',
  'ail',
  'own',
  'ign',
  'act',
  'eed',
  'ine',
  'lay',
  'arn',
  'urn',
  'ump',
  'ant',
  'ink',
  'unk',
  'ank',
  'ash',
  'ush',
  'oke',
  'uck',
  'ide',
  'ive',
  'ose',
  'ure',
  'ape',
  'eat',
  'eal',
  'aze',
  'ink',
  'unk',
  'ake',
  'ite',
  'ame',
  'aim',
  'ail',
  'own',
  'ign',
  'act',
  'eed',
  'ine',
  'lay',
  'arn',
  'urn',
  'ump',
  'ant',
  'ink',
  'unk',
  'ank',
  'ash',
  'ush',
  'oke',
];

export const enforceVerbNounNaming = createRule<[], MessageIds>({
  name: 'enforce-verb-noun-naming',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce verb phrases for functions and methods',
      recommended: 'error',
      requiresTypeChecking: false,
      extendsBaseRule: false,
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

    function isVerb(word: string): boolean {
      const lowerWord = word.toLowerCase();

      // Check common verbs first
      if (COMMON_VERBS.has(lowerWord)) {
        return true;
      }

      // Check verb suffixes
      for (const suffix of VERB_SUFFIXES) {
        if (lowerWord.endsWith(suffix)) {
          return true;
        }
      }

      return false;
    }

    function isVerbPhrase(name: string): boolean {
      const firstWord = extractFirstWord(name);
      const lowerFirstWord = firstWord.toLowerCase();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (PREPOSITIONS.includes(lowerFirstWord as any)) {
        return true;
      }

      return isVerb(firstWord);
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
