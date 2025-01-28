import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import nlp from 'compromise';

type MessageIds = 'functionVerbPhrase' | 'dataTypeNounPhrase' | 'reactComponentPascalCase';

const COMMON_VERBS = new Set([
  'get', 'set', 'fetch', 'update', 'create', 'delete', 'remove', 'process',
  'handle', 'validate', 'parse', 'format', 'convert', 'transform', 'build',
  'generate', 'compute', 'calculate', 'initialize', 'setup', 'configure',
  'load', 'save', 'store', 'cache', 'clear', 'reset', 'refresh', 'sync',
  'merge', 'split', 'filter', 'map', 'reduce', 'find', 'search', 'sort',
  'check', 'verify', 'test', 'debug', 'log', 'print', 'render', 'display',
  'show', 'hide', 'enable', 'disable', 'start', 'stop', 'pause', 'resume',
  'open', 'close', 'read', 'write', 'send', 'receive', 'emit', 'dispatch',
  'subscribe', 'unsubscribe', 'connect', 'disconnect', 'mount', 'unmount',
  'add', 'insert', 'append', 'prepend', 'push', 'pop', 'shift', 'unshift',
  'to', 'from', 'with', 'without', 'use', 'make',
]);

const COMMON_NOUNS = new Set([
  'service', 'processor', 'handler', 'manager', 'controller', 'provider',
  'factory', 'builder', 'helper', 'util', 'utility', 'config', 'configuration',
  'data', 'info', 'information', 'result', 'response', 'request', 'error',
  'state', 'props', 'options', 'settings', 'preferences', 'profile', 'account',
  'user', 'client', 'server', 'api', 'database', 'cache', 'store', 'storage',
  'queue', 'stack', 'list', 'array', 'map', 'set', 'tree', 'graph', 'node',
  'element', 'component', 'module', 'package', 'library', 'framework',
]);

export const enforceVerbNounNaming = createRule<[], MessageIds>({
  name: 'enforce-verb-noun-naming',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce verb phrases for functions and noun phrases for data types',
      recommended: 'error',
    },
    schema: [],
    messages: {
      functionVerbPhrase: 'Function names should start with a verb phrase (e.g., fetchData, processRequest)',
      dataTypeNounPhrase: 'Data type names should be noun phrases (e.g., userProfile, requestProcessor)',
      reactComponentPascalCase: 'React components should use PascalCase naming',
    },
  },
  defaultOptions: [],
  create(context) {
    function splitCamelCase(str: string): string[] {
      return str.split(/(?=[A-Z])/).map(s => s.toLowerCase());
    }

    function isVerbPhrase(name: string): boolean {
      const words = splitCamelCase(name);
      if (words.length === 0) return false;

      const firstWord = words[0];
      if (COMMON_VERBS.has(firstWord)) return true;
      if (COMMON_NOUNS.has(firstWord)) return false;

      const doc = nlp(firstWord);
      return doc.verbs().length > 0;
    }

    function isNounPhrase(name: string): boolean {
      const words = splitCamelCase(name);
      if (words.length === 0) return false;

      const firstWord = words[0];
      if (COMMON_VERBS.has(firstWord)) return false;
      if (COMMON_NOUNS.has(firstWord)) return true;

      const doc = nlp(firstWord);
      return doc.nouns().length > 0;
    }

    function isPascalCase(name: string): boolean {
      return /^[A-Z][a-zA-Z0-9]*$/.test(name);
    }

    function isJsxReturnFunction(node: TSESTree.Node): boolean {
      if (node.type !== AST_NODE_TYPES.FunctionDeclaration &&
          node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          node.type !== AST_NODE_TYPES.FunctionExpression) {
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
          if (!isPascalCase(node.id.name)) {
            context.report({
              node: node.id,
              messageId: 'reactComponentPascalCase',
            });
          }
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

        // Check if it's a function
        if (node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.init?.type === AST_NODE_TYPES.FunctionExpression) {

          if (isJsxReturnFunction(node.init)) {
            if (!isPascalCase(node.id.name)) {
              context.report({
                node: node.id,
                messageId: 'reactComponentPascalCase',
              });
            }
            return;
          }

          if (!isVerbPhrase(node.id.name)) {
            context.report({
              node: node.id,
              messageId: 'functionVerbPhrase',
            });
          }
        } else {
          // It's a data type
          if (!isNounPhrase(node.id.name)) {
            context.report({
              node: node.id,
              messageId: 'dataTypeNounPhrase',
            });
          }
        }
      },

      ClassDeclaration(node) {
        if (!node.id) return;

        if (!isNounPhrase(node.id.name)) {
          context.report({
            node: node.id,
            messageId: 'dataTypeNounPhrase',
          });
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
