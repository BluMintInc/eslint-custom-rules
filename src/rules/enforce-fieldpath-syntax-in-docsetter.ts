import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESTree,
  TSESLint,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { getMemberExpressionName } from '../utils/getMethodName';

type MessageIds = 'enforceFieldPathSyntax';

export const enforceFieldPathSyntaxInDocSetter = createRule<[], MessageIds>({
  name: 'enforce-fieldpath-syntax-in-docsetter',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce the use of Firestore FieldPath syntax when passing documentData into DocSetter. Instead of using nested object syntax, developers should use dot notation for deeply nested fields.',
      recommended: 'error',
      requiresTypeChecking: false,
      extendsBaseRule: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceFieldPathSyntax:
        'What’s wrong: DocSetter {{methodName}} receives nested object data under "{{topLevelKey}}". → Why it matters: Firestore treats that nested map as a whole sub-document write, so partial updates can overwrite sibling fields you did not include. → How to fix: Flatten nested properties into FieldPath (dot) keys before passing documentData (e.g., "{{exampleFieldPath}}") so only the intended leaves are written.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    // Track DocSetter variables
    const docSetterVariables = new Set<string>();

    // Helper function to check if a node is a DocSetter method call
    function isDocSetterMethodCall(node: TSESTree.CallExpression): boolean {
      if (node.callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      const { object, property } = node.callee;

      // Only enforce for set/updateIfExists; skip overwrite (full-document replacement)
      if (
        property.type !== AST_NODE_TYPES.Identifier ||
        !['set', 'updateIfExists'].includes(property.name)
      ) {
        return false;
      }

      // Check if the object is a DocSetter instance
      if (object.type === AST_NODE_TYPES.Identifier) {
        return docSetterVariables.has(object.name);
      }

      // Support chained instantiation: new DocSetter(...).set(...)
      if (
        object.type === AST_NODE_TYPES.NewExpression &&
        object.callee.type === AST_NODE_TYPES.Identifier &&
        object.callee.name === 'DocSetter'
      ) {
        return true;
      }

      return false;
    }

    // Helper: detect spread or computed properties in an object literal
    function isSpreadOrComputed(
      prop: TSESTree.Property | TSESTree.SpreadElement,
    ): boolean {
      return (
        prop.type === AST_NODE_TYPES.SpreadElement ||
        (prop.type === AST_NODE_TYPES.Property && prop.computed === true)
      );
    }

    function isNumericKey(property: TSESTree.Property): boolean {
      return (
        property.key.type === AST_NODE_TYPES.Literal &&
        (typeof property.key.value === 'number' ||
          (typeof property.key.value === 'string' &&
            /^\d+$/.test(property.key.value)))
      );
    }

    function hasRootNumericKey(node: TSESTree.ObjectExpression): boolean {
      return node.properties.some(
        (property) =>
          property.type === AST_NODE_TYPES.Property && isNumericKey(property),
      );
    }

    // Helper function to flatten nested objects into FieldPath syntax
    function flattenObject(
      obj: TSESTree.ObjectExpression,
      sourceCode: TSESLint.SourceCode,
      prefix = '',
    ): { [key: string]: string } {
      const result: { [key: string]: string } = {};

      for (const property of obj.properties) {
        // Skip spread elements
        if (property.type === AST_NODE_TYPES.SpreadElement) {
          continue;
        }

        if (property.type !== AST_NODE_TYPES.Property) {
          continue;
        }

        // Skip computed properties (dynamic keys)
        if (property.computed) {
          continue;
        }

        let key: string;
        if (property.key.type === AST_NODE_TYPES.Identifier) {
          key = property.key.name;
        } else if (property.key.type === AST_NODE_TYPES.Literal) {
          // Handle both string and numeric literal keys
          if (typeof property.key.value === 'string') {
            key = property.key.value;
          } else if (typeof property.key.value === 'number') {
            key = String(property.key.value);
          } else {
            // Skip other literal types
            continue;
          }
        } else {
          // Skip other key types
          continue;
        }

        const numericKey = isNumericKey(property);

        if (prefix === '' && numericKey) {
          continue;
        }

        const fullKey = prefix ? `${prefix}.${key}` : key;

        // If the value is a nested object, recursively flatten it
        if (property.value.type === AST_NODE_TYPES.ObjectExpression) {
          const nestedResult = flattenObject(
            property.value,
            sourceCode,
            fullKey,
          );
          Object.assign(result, nestedResult);
        } else {
          // For non-object values, use the key as is
          result[fullKey] = sourceCode.getText(property.value);
        }
      }

      return result;
    }

    // Helper to decide if a key needs quoting (contains dot or is not IdentifierName)
    function needsQuoting(key: string): boolean {
      return key.includes('.') || !/^(?:[$_A-Za-z][$\w]*)$/u.test(key);
    }

    // A method shorthand elides the `function` keyword, and its
    // FunctionExpression range starts at the parameter list, so copying the
    // value's text verbatim emits `() { … }`, which is not an expression. The
    // member is re-emitted with the keyword the shorthand leaves out, matching
    // what the `key: function () {}` spelling already produces.
    //
    // `super` is the one binding the two spellings do not share: it resolves
    // through the enclosing object literal's home object, which a function
    // expression has none of, so such a method is declined rather than
    // rewritten into code that cannot resolve it. Any nested `super` counts,
    // because narrowing the scan to the method's own body would have to model
    // which inner forms rebind it.
    function getMethodValueText(
      value: TSESTree.FunctionExpression,
      sourceCode: TSESLint.SourceCode,
    ): string | undefined {
      const referencesSuper = sourceCode
        .getTokens(value)
        .some(
          (token) =>
            token.type === AST_TOKEN_TYPES.Keyword && token.value === 'super',
        );
      if (referencesSuper) {
        return undefined;
      }

      return `${value.async ? 'async ' : ''}function${
        value.generator ? '*' : ''
      } ${sourceCode.getText(value)}`;
    }

    // Text a nested leaf contributes to its FieldPath entry, or undefined when
    // the value has no expression-position equivalent.
    function getFlattenedValueText(
      property: TSESTree.Property,
      sourceCode: TSESLint.SourceCode,
    ): string | undefined {
      if (
        property.method &&
        property.value.type === AST_NODE_TYPES.FunctionExpression
      ) {
        return getMethodValueText(property.value, sourceCode);
      }

      return sourceCode.getText(property.value);
    }

    // Collect the FieldPath entries a nested property flattens into, or bail out
    // when flattening would silently drop payload data (spreads, computed keys,
    // accessors, unsupported key literals) or would produce nothing at all.
    // Bailing leaves the report in place so the developer flattens by hand
    // instead of receiving a fix that deletes fields or emits invalid syntax.
    function collectFieldPathEntries(
      obj: TSESTree.ObjectExpression,
      prefix: string,
      sourceCode: TSESLint.SourceCode,
    ): [string, string][] | null {
      const entries: [string, string][] = [];

      for (const property of obj.properties) {
        // A getter or setter is declined even though it is spelled like a
        // method: its body runs on access rather than holding a value, so no
        // FieldPath entry can carry it
        if (
          property.type !== AST_NODE_TYPES.Property ||
          property.computed ||
          property.kind !== 'init'
        ) {
          return null;
        }

        const keyText = getPropertyKeyText(property);
        if (keyText === undefined) {
          return null;
        }

        const fullKey = `${prefix}.${keyText}`;

        if (property.value.type === AST_NODE_TYPES.ObjectExpression) {
          const nestedEntries = collectFieldPathEntries(
            property.value,
            fullKey,
            sourceCode,
          );
          if (!nestedEntries) {
            return null;
          }
          entries.push(...nestedEntries);
          continue;
        }

        const valueText = getFlattenedValueText(property, sourceCode);
        if (valueText === undefined) {
          return null;
        }

        entries.push([fullKey, valueText]);
      }

      return entries.length > 0 ? entries : null;
    }

    function getLineIndent(line: string): string {
      return /^[\t ]*/u.exec(line)?.[0] ?? '';
    }

    // Indentation of the property when it is the first thing on its line, which
    // is the indentation the replacement text must reuse to keep the surrounding
    // lines byte-identical. Returns null for properties sharing a line with
    // other code, where the replacement stays inline.
    function getOwnLineIndent(
      property: TSESTree.Property,
      sourceCode: TSESLint.SourceCode,
    ): string | null {
      const line = sourceCode.lines[property.loc.start.line - 1] ?? '';
      const linePrefix = line.slice(0, property.loc.start.column);
      return /^[\t ]*$/u.test(linePrefix) ? linePrefix : null;
    }

    function printComment(comment: TSESTree.Comment): string {
      return comment.type === AST_TOKEN_TYPES.Line
        ? `//${comment.value}`
        : `/*${comment.value}*/`;
    }

    // Render the dot-path replacement for a single nested property. Comments
    // living inside the property are re-emitted ahead of the flattened entries
    // so directives such as eslint-disable-next-line keep covering the rewritten
    // code rather than being destroyed by the fix.
    function renderFlattenedProperty(
      property: TSESTree.Property,
      entries: [string, string][],
      sourceCode: TSESLint.SourceCode,
    ): string {
      const comments = sourceCode.getCommentsInside(property);
      const commentTexts = comments.map(printComment);
      const printedEntries = entries.map(
        ([key, value]) => `${needsQuoting(key) ? `'${key}'` : key}: ${value}`,
      );
      const ownLineIndent = getOwnLineIndent(property, sourceCode);
      // A carried line comment would swallow the rest of the line, so anything
      // holding one has to be laid out across multiple lines
      const carriesLineComment = comments.some(
        (comment) => comment.type === AST_TOKEN_TYPES.Line,
      );

      if (ownLineIndent === null && !carriesLineComment) {
        return [...commentTexts, printedEntries.join(', ')].join(' ');
      }

      const indent =
        ownLineIndent ??
        `${getLineIndent(
          sourceCode.lines[property.loc.start.line - 1] ?? '',
        )}  `;
      const separator = `\n${indent}`;
      return [...commentTexts, printedEntries.join(`,${separator}`)].join(
        separator,
      );
    }

    // Replace only the properties that actually need flattening, leaving every
    // other property, its comments, and the original indentation untouched
    function buildFieldPathFixes(
      node: TSESTree.ObjectExpression,
      sourceCode: TSESLint.SourceCode,
      fixer: TSESLint.RuleFixer,
    ): TSESLint.RuleFix[] {
      const fixes: TSESLint.RuleFix[] = [];

      for (const property of node.properties) {
        if (
          property.type !== AST_NODE_TYPES.Property ||
          property.computed ||
          property.method ||
          property.kind !== 'init' ||
          property.value.type !== AST_NODE_TYPES.ObjectExpression
        ) {
          continue;
        }

        const keyText = getPropertyKeyText(property);
        // Root-level numeric keys model array-style buckets rather than
        // Firestore document fields, so they are never flattened
        if (keyText === undefined || isNumericKey(property)) {
          continue;
        }

        const entries = collectFieldPathEntries(
          property.value,
          keyText,
          sourceCode,
        );
        if (!entries) {
          continue;
        }

        fixes.push(
          fixer.replaceTextRange(
            property.range,
            renderFlattenedProperty(property, entries, sourceCode),
          ),
        );
      }

      return fixes;
    }

    function getPropertyKeyText(
      property: TSESTree.Property,
    ): string | undefined {
      if (property.key.type === AST_NODE_TYPES.Identifier) {
        return property.key.name;
      }
      if (
        property.key.type === AST_NODE_TYPES.Literal &&
        (typeof property.key.value === 'string' ||
          typeof property.key.value === 'number')
      ) {
        return String(property.key.value);
      }
      return undefined;
    }

    function getFirstNestedObjectProperty(
      node: TSESTree.ObjectExpression,
      keyPredicate?: (keyText: string) => boolean,
    ): (TSESTree.Property & { value: TSESTree.ObjectExpression }) | undefined {
      for (const property of node.properties) {
        if (isSpreadOrComputed(property)) {
          continue;
        }

        if (property.type !== AST_NODE_TYPES.Property) {
          continue;
        }

        const propertyKeyText = getPropertyKeyText(property);
        if (!propertyKeyText) {
          continue;
        }

        if (keyPredicate && !keyPredicate(propertyKeyText)) {
          continue;
        }

        // Root-level numeric keys typically model array-style buckets rather than
        // Firestore document fields, so ignore them when identifying nested objects
        if (
          node.parent?.type !== AST_NODE_TYPES.Property &&
          isNumericKey(property)
        ) {
          continue;
        }

        if (property.value.type !== AST_NODE_TYPES.ObjectExpression) {
          continue;
        }

        const hasSpreadOrComputed = property.value.properties.some((prop) =>
          isSpreadOrComputed(prop),
        );

        if (hasSpreadOrComputed) {
          continue;
        }

        return property as TSESTree.Property & {
          value: TSESTree.ObjectExpression;
        };
      }

      return undefined;
    }

    type ViolationDetails = {
      topLevelKey: string;
      exampleFieldPath: string;
    };

    function extractViolationDetails(
      firstArg: TSESTree.ObjectExpression,
      sourceCode: TSESLint.SourceCode,
    ): ViolationDetails | null {
      const firstNestedPropertyWithoutDots = getFirstNestedObjectProperty(
        firstArg,
        (key) => !key.includes('.'),
      );

      const firstNestedProperty =
        firstNestedPropertyWithoutDots ||
        getFirstNestedObjectProperty(firstArg);

      if (!firstNestedProperty) {
        return null;
      }

      const propertyKeyText = getPropertyKeyText(firstNestedProperty);
      const exampleFieldPathFromProperty =
        propertyKeyText &&
        flattenObject(firstNestedProperty.value, sourceCode, propertyKeyText);

      const flattenedProperties = flattenObject(firstArg, sourceCode);

      const exampleFieldPath =
        (exampleFieldPathFromProperty &&
          Object.keys(exampleFieldPathFromProperty).find((key) =>
            key.includes('.'),
          )) ??
        (propertyKeyText &&
          Object.keys(flattenedProperties).find((key) =>
            key.startsWith(`${propertyKeyText}.`),
          )) ??
        Object.keys(flattenedProperties).find((key) => key.includes('.')) ??
        'field.nested';

      return {
        topLevelKey: propertyKeyText ?? 'nested field',
        exampleFieldPath,
      };
    }

    return {
      // Track DocSetter variable declarations
      VariableDeclarator(node) {
        if (
          node.init?.type === AST_NODE_TYPES.NewExpression &&
          node.init.callee.type === AST_NODE_TYPES.Identifier &&
          node.init.callee.name === 'DocSetter' &&
          node.id.type === AST_NODE_TYPES.Identifier
        ) {
          docSetterVariables.add(node.id.name);
        }
      },

      // Check DocSetter method calls
      CallExpression(node) {
        if (!isDocSetterMethodCall(node)) {
          return;
        }

        // Check if the first argument is an object literal
        const firstArg = node.arguments[0];
        if (firstArg?.type !== AST_NODE_TYPES.ObjectExpression) {
          return;
        }

        if (hasRootNumericKey(firstArg)) {
          return;
        }

        const violationDetails = extractViolationDetails(firstArg, sourceCode);

        if (!violationDetails) {
          return;
        }

        // Report and fix the issue
        const callee = node.callee as TSESTree.MemberExpression;
        context.report({
          node: firstArg,
          messageId: 'enforceFieldPathSyntax',
          data: {
            methodName: `${
              getMemberExpressionName(callee, sourceCode, {
                computedFallbackToText: false,
              }) || 'set'
            }()`,
            topLevelKey: violationDetails.topLevelKey,
            exampleFieldPath: violationDetails.exampleFieldPath,
          },
          fix(fixer) {
            const fixes = buildFieldPathFixes(firstArg, sourceCode, fixer);
            return fixes.length > 0 ? fixes : null;
          },
        });
      },
    };
  },
});
