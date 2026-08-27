import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { getMethodName } from '../utils/getMethodName';

type MessageIds = 'avoidGenericPrefix';

const DISALLOWED_PREFIXES = new Set([
  'get',
  'update',
  'check',
  'manage',
  'process',
  'do',
]);

const NEXTJS_DATA_FUNCTIONS = new Set([
  'getServerSideProps',
  'getStaticProps',
  'getStaticPaths',
]);

/**
 * Lexicalized verb-particle compounds whose head happens to be a disallowed
 * prefix. "check in" names an operation exactly — its meaning is not the verb
 * `check` applied to the object `in` — so the generic-prefix heuristic is
 * measuring the wrong lexeme and reports a false positive.
 *
 * Entries are `<verb> <particle>` in lowercase and are matched against the
 * first TWO camelCase segments, so derived names (checkInAndSet, checkOutTeam)
 * inherit the exemption while `check` + object (checkUserPermissions) does not.
 *
 * Criterion for adding an entry: the verb+particle pair must be a *lexicalized*
 * compound — a phrasal verb or domain noun whose meaning is not the sum of its
 * parts (check in, check out) — and its head must be a disallowed prefix.
 * A merely grammatical verb+particle sequence does NOT qualify: `getOutOfSync`,
 * `updateInPlace`, and `processOutQueue` are compositional, so the generic verb
 * still hides what the function does and the rule must keep reporting them.
 */
const COMPOUND_LEXEMES = new Set(['check in', 'check out']);

const SUGGESTED_ALTERNATIVES = {
  get: ['fetch', 'retrieve', 'compute', 'derive'],
  update: ['modify', 'set', 'apply'],
  check: ['validate', 'assert', 'ensure'],
  manage: ['control', 'coordinate', 'schedule'],
  process: ['transform', 'sanitize', 'compute'],
  do: ['execute', 'perform', 'apply'],
};

function extractFirstWord(name: string): string {
  let firstWord = name;
  for (let i = 1; i < name.length; i++) {
    const currentChar = name[i];
    const prevChar = name[i - 1];
    // lowercase -> Uppercase (camel/Pascal boundary)
    if (
      prevChar >= 'a' &&
      prevChar <= 'z' &&
      currentChar >= 'A' &&
      currentChar <= 'Z'
    ) {
      firstWord = name.substring(0, i);
      break;
    }
    // UPPERCASE acronym -> lowercase word start (e.g., XML|Http)
    if (
      prevChar >= 'A' &&
      prevChar <= 'Z' &&
      currentChar >= 'a' &&
      currentChar <= 'z'
    ) {
      if (i > 1) {
        firstWord = name.substring(0, i - 1);
        break;
      }
    }
  }
  return firstWord;
}

/**
 * The first two camelCase segments of a name, joined by a space
 * (`checkInAndSet` -> `check in`).
 *
 * Whole-segment equality is load-bearing. `checkInput` segments as
 * `check` + `Input`, so a substring test such as `name.startsWith('checkin')`
 * would exempt it — along with checkInputValidation, CheckInputData and every
 * other `check` + object name that merely begins with a particle's letters.
 */
function extractCompoundHead(name: string): string {
  const firstWord = extractFirstWord(name);
  const remainder = name.slice(firstWord.length);
  const secondWord = remainder ? extractFirstWord(remainder) : '';
  return `${firstWord} ${secondWord}`.toLowerCase();
}

function isCompoundLexeme(name: string): boolean {
  return COMPOUND_LEXEMES.has(extractCompoundHead(name));
}

export const semanticFunctionPrefixes = createRule<[], MessageIds>({
  name: 'semantic-function-prefixes',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require semantic function prefixes instead of generic verbs so callers know whether a function fetches data, transforms input, or mutates state',
      recommended: 'error',
    },
    schema: [],
    messages: {
      avoidGenericPrefix:
        'Function "{{functionName}}" starts with the generic prefix "{{prefix}}", which hides whether it fetches remote data, transforms input, or mutates state. Use a semantic verb such as {{alternatives}} to describe the operation and set caller expectations.',
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Single detection path for every visited shape. Methods and functions
     * differ only in which node carries the report, so sharing the guards keeps
     * an exemption from applying to one shape and not the other.
     */
    function reportIfGenericPrefix(
      reportNode: TSESTree.Node,
      functionName: string,
      /**
       * The name as written, when it differs from the name the prefix
       * heuristic reads. An ECMA private method matches on its bare word
       * (`updateUser`) so every exemption applies to both privacy spellings,
       * but the message must name `#updateUser` — the member the author wrote,
       * and one that a sibling public `updateUser` does not share.
       */
      displayName: string = functionName,
    ) {
      // Skip if the name starts with 'is' (boolean check functions are okay)
      if (functionName.startsWith('is')) return;

      // Skip Next.js data-fetching functions
      if (NEXTJS_DATA_FUNCTIONS.has(functionName)) return;

      // Skip compound lexemes whose head merely coincides with a banned prefix
      if (isCompoundLexeme(functionName)) return;

      // Extract first word from PascalCase/camelCase
      const firstWord = extractFirstWord(functionName);

      // Check for disallowed prefixes
      // Only flag if the disallowed word is used as a prefix (not the entire name)
      for (const prefix of DISALLOWED_PREFIXES) {
        if (
          firstWord.toLowerCase() === prefix.toLowerCase() &&
          firstWord.length < functionName.length
        ) {
          context.report({
            node: reportNode,
            messageId: 'avoidGenericPrefix',
            data: {
              functionName: displayName,
              prefix,
              alternatives:
                SUGGESTED_ALTERNATIVES[
                  prefix as keyof typeof SUGGESTED_ALTERNATIVES
                ].join(', '),
            },
          });
          break;
        }
      }
    }

    function checkMethodName(node: TSESTree.MethodDefinition) {
      // Skip getters and setters
      if (node.kind === 'get' || node.kind === 'set') {
        return;
      }

      const { key } = node;

      /**
       * Computed and string-literal keys stay out of scope: `[expr]()` has no
       * statically knowable name. A private identifier does — `#updateUser`
       * carries the plain word `updateUser` on `key.name` — and it is the same
       * privacy as `private updateUser`, which this rule reports. The two
       * spellings are mutually exclusive (`private #foo` is TS18010), so
       * treating `#` as nameless would leave the ECMA spelling permanently
       * uncoverable rather than merely unchecked.
       */
      if (
        key.type !== AST_NODE_TYPES.Identifier &&
        key.type !== AST_NODE_TYPES.PrivateIdentifier
      ) {
        return;
      }

      const methodName = key.name;
      if (!methodName) return;

      reportIfGenericPrefix(
        key,
        methodName,
        getMethodName(node, context.getSourceCode(), {
          privateIdentifierPrefix: '#',
        }),
      );
    }

    /**
     * A class member written as a function-valued field (`getUser = () => {}`)
     * declares the same thing as `getUser() {}`: a named, callable member of the
     * class. The two spellings differ only in binding and `this` semantics, not
     * in what this rule judges, so a single `=` must not decide whether the name
     * is read.
     */
    function checkPropertyName(node: TSESTree.PropertyDefinition) {
      const value = node.value;

      /**
       * Only a function-valued field names an operation. `updateCount = 0` and
       * `getters = {}` are data whose names describe a value, not a verb applied
       * to one, and a field with no initializer (`declare getData: Fn`,
       * `getData!: Fn`) declares no implementation to name.
       */
      if (
        value?.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
        value?.type !== AST_NODE_TYPES.FunctionExpression
      ) {
        return;
      }

      /**
       * A named function expression carries its own binding, which the function
       * arm reads and reports on. Deferring to it keeps exactly one report per
       * site and matches the precedence the rule already applies to the variable
       * spelling, where `const getUser = function getData() {}` is reported as
       * `getData`.
       */
      if (value.type === AST_NODE_TYPES.FunctionExpression && value.id) {
        return;
      }

      const { key } = node;

      // Same readable-key requirement as the method arm; see checkMethodName.
      if (
        node.computed ||
        (key.type !== AST_NODE_TYPES.Identifier &&
          key.type !== AST_NODE_TYPES.PrivateIdentifier)
      ) {
        return;
      }

      const propertyName = key.name;
      if (!propertyName) return;

      reportIfGenericPrefix(
        key,
        propertyName,
        getMethodName(node, context.getSourceCode(), {
          privateIdentifierPrefix: '#',
        }),
      );
    }

    function checkFunctionName(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ) {
      // Skip anonymous functions
      if (!node.id && node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
        return;
      }

      // Get function name from either the function declaration or variable declarator
      let functionName = '';
      if (node.id) {
        functionName = node.id.name;
      } else if (
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        functionName = node.parent.id.name;
      }

      if (!functionName) return;

      reportIfGenericPrefix(node.id || node, functionName);
    }

    return {
      FunctionDeclaration: checkFunctionName,
      FunctionExpression: checkFunctionName,
      ArrowFunctionExpression: checkFunctionName,
      MethodDefinition: checkMethodName,
      PropertyDefinition: checkPropertyName,
    };
  },
});
