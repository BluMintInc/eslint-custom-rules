import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferDocumentFlattening' | 'addShouldFlatten';

const SHOULD_FLATTEN_PROPERTY = 'shouldFlatten: true';
const SHOULD_FLATTEN_OPTIONS = `{ ${SHOULD_FLATTEN_PROPERTY} }`;

function isPunctuator(token: TSESTree.Token, value: string): boolean {
  return token.type === AST_TOKEN_TYPES.Punctuator && token.value === value;
}

function isIdentifier(node: TSESTree.Node): node is TSESTree.Identifier {
  return node.type === AST_NODE_TYPES.Identifier;
}

function isMemberExpression(
  node: TSESTree.Node,
): node is TSESTree.MemberExpression {
  return node.type === AST_NODE_TYPES.MemberExpression;
}

function isObjectExpression(
  node: TSESTree.Node,
): node is TSESTree.ObjectExpression {
  return node.type === AST_NODE_TYPES.ObjectExpression;
}

function isProperty(node: TSESTree.Node): node is TSESTree.Property {
  return node.type === AST_NODE_TYPES.Property;
}

/**
 * Resolves the property name every static spelling of a key denotes:
 * `shouldFlatten`, `'shouldFlatten'` and `['shouldFlatten']` all occupy the
 * same slot, so a literal that writes one of them cannot gain another without
 * duplicating the key. A key built from an expression denotes an unknown
 * property and yields no name.
 */
function staticKeyName(property: TSESTree.Property): string | undefined {
  const key = property.key;

  if (!property.computed && isIdentifier(key)) {
    return key.name;
  }

  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }

  if (
    key.type === AST_NODE_TYPES.TemplateLiteral &&
    key.expressions.length === 0 &&
    key.quasis.length === 1
  ) {
    return key.quasis[0].value.cooked;
  }

  return undefined;
}

/**
 * The single answer to "does this options literal already write shouldFlatten".
 * The reader that decides whether to report and the writer that builds the
 * suggestion share it so they cannot disagree about which members exist: a
 * writer that misses a member the reader sees appends a duplicate key.
 */
function findShouldFlattenProperty(
  options: TSESTree.ObjectExpression,
): TSESTree.Property | undefined {
  for (const property of options.properties) {
    if (!isProperty(property)) continue;
    if (staticKeyName(property) === 'shouldFlatten') {
      return property;
    }
  }

  return undefined;
}

function isLiteralBoolean(node: TSESTree.Node, expected: boolean): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === expected;
}

/**
 * Flattening counts as enabled only for a literal `true`. A variable, a
 * ternary or a call may evaluate either way, so those are treated as unknown
 * and the violation is still reported.
 */
function hasEnabledShouldFlatten(newExpr: TSESTree.NewExpression): boolean {
  if (newExpr.arguments.length < 2) {
    return false;
  }

  const optionsArg = newExpr.arguments[1];
  if (!isObjectExpression(optionsArg)) {
    return false;
  }

  const property = findShouldFlattenProperty(optionsArg);

  return !!property && isLiteralBoolean(property.value, true);
}

/**
 * Appends an entry to a comma-separated list by anchoring on its last element
 * and deriving the separator from whatever already follows that element.
 * Prettier formats multiline lists with a trailing comma, so prefixing a comma
 * unconditionally yields `, ,` and a file that no longer parses. Shapes that
 * end in neither a comma nor the expected closing punctuator are declined so a
 * withheld suggestion is the worst outcome.
 */
function appendAfterLastEntry(
  fixer: TSESLint.RuleFixer,
  sourceCode: Readonly<TSESLint.SourceCode>,
  lastEntry: TSESTree.Node,
  closer: string,
  text: string,
): TSESLint.RuleFix | null {
  const nextToken = sourceCode.getTokenAfter(lastEntry);
  if (!nextToken) {
    return null;
  }

  // Inserting after an existing trailing comma reuses it as the separator.
  if (isPunctuator(nextToken, ',')) {
    return fixer.insertTextAfter(nextToken, ` ${text}`);
  }

  if (isPunctuator(nextToken, closer)) {
    return fixer.insertTextAfter(lastEntry, `, ${text}`);
  }

  return null;
}

/**
 * Tracks DocSetter instances that don't have shouldFlatten option
 */
interface DocSetterInstance {
  className: string;
  name: string;
  node: TSESTree.NewExpression;
  hasShouldFlatten: boolean;
}

/**
 * Recursively checks if an object has deeply nested objects
 */
const hasDeepNestedObjects = (node: TSESTree.Node): boolean => {
  if (isObjectExpression(node)) {
    for (const property of node.properties) {
      if (!isProperty(property)) continue;

      const value = property.value;

      // If the property value is an object, it's a nested object
      if (isObjectExpression(value)) {
        return true;
      }

      // Check arrays for nested objects
      if (value.type === AST_NODE_TYPES.ArrayExpression) {
        for (const element of value.elements) {
          if (element && hasDeepNestedObjects(element)) {
            return true;
          }
        }
      }
    }
  }

  // Check arrays for nested objects
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    for (const element of node.elements) {
      if (element && hasDeepNestedObjects(element)) {
        return true;
      }
    }
  }

  return false;
};

export const preferDocumentFlattening = createRule<[], MessageIds>({
  name: 'prefer-document-flattening',
  meta: {
    type: 'suggestion',
    hasSuggestions: true,
    docs: {
      description:
        'Enforce using the shouldFlatten option when setting deeply nested objects in Firestore documents',
      recommended: 'error',
    },
    schema: [],
    messages: {
      preferDocumentFlattening:
        '{{className}} instance "{{instanceName}}" sets nested Firestore data without enabling shouldFlatten. Nested object writes overwrite sibling fields and require read-modify-write cycles, which increases contention and hides field-level query paths. Add shouldFlatten: true in the {{className}} options or pass flattened field paths (for example, "profile.settings.theme") so nested updates stay atomic and queryable.',
      addShouldFlatten: 'Add shouldFlatten: true to the DocSetter options.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track DocSetter instances without shouldFlatten option
    const docSetterInstances: DocSetterInstance[] = [];

    // Track which DocSetter instances are used to set nested objects
    const docSetterWithNestedObjects = new Set<string>();

    const buildShouldFlattenFix = (
      fixer: TSESLint.RuleFixer,
      newExpr: TSESTree.NewExpression,
    ): TSESLint.RuleFix | null => {
      const sourceCode = context.getSourceCode();
      const optionsArg =
        newExpr.arguments.length >= 2 ? newExpr.arguments[1] : undefined;

      if (optionsArg) {
        // Options built elsewhere (a reference, a call, a spread) cannot gain a
        // property through a textual edit at the call site.
        if (!isObjectExpression(optionsArg)) {
          return null;
        }

        const existing = findShouldFlattenProperty(optionsArg);
        if (existing) {
          // Appending a second `shouldFlatten` member is never correct: the
          // literal would carry the key twice (TS1117, and core no-dupe-keys).
          // A literal `false` is rewritten in place; any other value — a
          // variable, a ternary, a call, a shorthand reference, an accessor —
          // may already be true, so the edit is declined rather than guessed.
          if (isLiteralBoolean(existing.value, false)) {
            return fixer.replaceText(existing.value, 'true');
          }
          return null;
        }

        const lastEntry =
          optionsArg.properties[optionsArg.properties.length - 1];

        if (!lastEntry) {
          // An empty object offers no entry to anchor on, so the opening brace
          // is the anchor; inserting after it preserves any enclosed comment.
          const openBrace = sourceCode.getFirstToken(optionsArg);
          if (!openBrace || !isPunctuator(openBrace, '{')) {
            return null;
          }
          return fixer.insertTextAfter(
            openBrace,
            ` ${SHOULD_FLATTEN_PROPERTY} `,
          );
        }

        // A spread element is not a Property, yet it anchors the insertion the
        // same way because only its end position and the token after it matter.
        return appendAfterLastEntry(
          fixer,
          sourceCode,
          lastEntry,
          '}',
          SHOULD_FLATTEN_PROPERTY,
        );
      }

      const lastArgument = newExpr.arguments[newExpr.arguments.length - 1];

      // With no arguments, or with spread arguments, the position the options
      // object belongs in is unknowable.
      if (!lastArgument || lastArgument.type === AST_NODE_TYPES.SpreadElement) {
        return null;
      }

      return appendAfterLastEntry(
        fixer,
        sourceCode,
        lastArgument,
        ')',
        SHOULD_FLATTEN_OPTIONS,
      );
    };

    const buildSuggestion = (
      instance: DocSetterInstance,
    ): TSESLint.ReportSuggestionArray<MessageIds> => {
      // ESLint drops a suggestion whose fix resolves to null, so the violation
      // is still reported when no edit can be made confidently.
      return [
        {
          messageId: 'addShouldFlatten',
          fix(fixer: TSESLint.RuleFixer) {
            return buildShouldFlattenFix(fixer, instance.node);
          },
        },
      ];
    };

    return {
      // Detect DocSetter and DocSetterTransaction instantiations
      NewExpression(node) {
        if (!isIdentifier(node.callee)) return;

        const className = node.callee.name;

        // Only check DocSetter and DocSetterTransaction classes
        if (className !== 'DocSetter' && className !== 'DocSetterTransaction')
          return;

        // The options object is typically the second argument
        const hasShouldFlatten = hasEnabledShouldFlatten(node);

        // Get variable name from parent node if it's a variable declaration
        let instanceName = '';
        if (
          node.parent &&
          node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
          isIdentifier(node.parent.id)
        ) {
          instanceName = node.parent.id.name;
        }

        if (instanceName && !hasShouldFlatten) {
          docSetterInstances.push({
            className,
            name: instanceName,
            node,
            hasShouldFlatten,
          });
        }
      },

      // Check for set method calls on DocSetter instances
      CallExpression(node) {
        if (!isMemberExpression(node.callee)) return;

        const property = node.callee.property;
        if (!isIdentifier(property)) return;

        // Check if it's a set or setAll method
        if (property.name !== 'set' && property.name !== 'setAll') return;

        const object = node.callee.object;
        let instance: DocSetterInstance | undefined;

        if (isIdentifier(object)) {
          instance = docSetterInstances.find((i) => i.name === object.name);
        } else if (
          object.type === AST_NODE_TYPES.NewExpression &&
          isIdentifier(object.callee)
        ) {
          const className = object.callee.name;
          if (
            className === 'DocSetter' ||
            className === 'DocSetterTransaction'
          ) {
            const hasShouldFlatten = hasEnabledShouldFlatten(object);

            if (!hasShouldFlatten) {
              instance = {
                className,
                name: `(inline-${docSetterInstances.length})`,
                node: object,
                hasShouldFlatten,
              };
              docSetterInstances.push(instance);
            }
          }
        }

        if (!instance) return;

        // Check if we're setting a nested object
        if (node.arguments.length > 0) {
          const dataArg = node.arguments[0];

          // For set method
          if (isObjectExpression(dataArg) && hasDeepNestedObjects(dataArg)) {
            docSetterWithNestedObjects.add(instance.name);
          }

          // For setAll method with array argument
          if (
            dataArg.type === AST_NODE_TYPES.ArrayExpression &&
            dataArg.elements.some((element) => {
              if (!element || !isObjectExpression(element)) {
                return false;
              }
              for (const prop of element.properties) {
                if (!isProperty(prop) || !isIdentifier(prop.key)) continue;
                if (prop.key.name !== 'data') continue;
                if (!isObjectExpression(prop.value)) return false;
                return hasDeepNestedObjects(prop.value);
              }
              return false;
            })
          ) {
            docSetterWithNestedObjects.add(instance.name);
          }
        }
      },

      // Report at the end of the program
      'Program:exit'() {
        for (const instance of docSetterInstances) {
          if (docSetterWithNestedObjects.has(instance.name)) {
            context.report({
              node: instance.node,
              messageId: 'preferDocumentFlattening',
              data: {
                className: instance.className,
                instanceName: instance.name,
              },
              suggest: buildSuggestion(instance),
            });
          }
        }
      },
    };
  },
});
