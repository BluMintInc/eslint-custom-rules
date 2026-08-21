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

    type FieldPathEntry = {
      key: string;
      valueText: string;
      /** Line the copied value text was laid out against. */
      sourceLine: number;
      /** Absolute source lines whose leading whitespace must not be shifted. */
      frozenLines: ReadonlySet<number>;
    };

    // A block comment whose continuation lines are `*`-aligned is layout that
    // moves with the code around it — prettier realigns those stars to the
    // comment's new column. Any other block comment is prose whose interior
    // prettier reproduces verbatim.
    function isStarAligned(comment: TSESTree.Comment): boolean {
      return comment.value
        .split('\n')
        .slice(1)
        .every((line) => {
          const trimmed = line.trim();
          return trimmed === '' || trimmed.startsWith('*');
        });
    }

    const NO_FROZEN_LINES: ReadonlySet<number> = new Set();

    // Lines inside the relocated span whose leading whitespace is data rather
    // than layout: a template literal and a line-continued string carry it in
    // the string's value, and a non-aligned block comment carries it in text
    // this fixer does not own. Shifting either would be a correctness defect,
    // not a formatting one.
    function frozenLinesOf(
      value: TSESTree.Node,
      sourceCode: TSESLint.SourceCode,
    ): ReadonlySet<number> {
      // A value occupying one line brings no continuation lines to shift
      if (value.loc.start.line === value.loc.end.line) {
        return NO_FROZEN_LINES;
      }

      const frozen = new Set<number>();

      const freezeInterior = (loc: TSESTree.SourceLocation) => {
        for (let line = loc.start.line + 1; line <= loc.end.line; line++) {
          frozen.add(line);
        }
      };

      for (const token of sourceCode.getTokens(value)) {
        if (
          (token.type === AST_TOKEN_TYPES.Template ||
            token.type === AST_TOKEN_TYPES.String) &&
          token.loc.start.line !== token.loc.end.line
        ) {
          freezeInterior(token.loc);
        }
      }

      for (const comment of sourceCode.getCommentsInside(value)) {
        if (
          comment.type === AST_TOKEN_TYPES.Block &&
          comment.loc.start.line !== comment.loc.end.line &&
          !isStarAligned(comment)
        ) {
          freezeInterior(comment.loc);
        }
      }

      return frozen;
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
    ): FieldPathEntry[] | null {
      const entries: FieldPathEntry[] = [];

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

        entries.push({
          key: fullKey,
          valueText,
          // The copied text was laid out against the line its value opens on,
          // which is the depth every continuation line is relative to
          sourceLine: property.value.loc.start.line,
          frozenLines: frozenLinesOf(property.value, sourceCode),
        });
      }

      return entries.length > 0 ? entries : null;
    }

    function getLineIndent(line: string): string {
      return /^[\t ]*/u.exec(line)?.[0] ?? '';
    }

    // Flattening lifts a nested value out to its parent's column, but the text
    // copied with it still carries the indentation of the depth it was written
    // at, so every line after the first lands too deep (or too shallow) and
    // prettier immediately rewrites the fix (#2083). Shifting all of them by the
    // same delta moves the span to its landing depth while preserving the
    // relative nesting inside it.
    function reindentRelocated(
      text: string,
      fromIndent: string,
      toIndent: string,
      firstLine: number,
      frozenLines: ReadonlySet<number>,
    ): string {
      const lines = text.split('\n');
      if (fromIndent === toIndent || lines.length === 1) {
        return text;
      }

      // Tabs and spaces that share no prefix have no delta expressible as
      // whitespace, and picking a tab width would rewrite the file's own
      // indentation style, so such a span is left where it was
      const deepening = toIndent.startsWith(fromIndent);
      const shallowing = fromIndent.startsWith(toIndent);
      if (!deepening && !shallowing) {
        return text;
      }

      const added = deepening ? toIndent.slice(fromIndent.length) : '';
      const removed = shallowing ? fromIndent.slice(toIndent.length) : '';

      return lines
        .map((line, offset) => {
          // The first line is emitted at the landing column by the caller, and
          // a frozen line's leading whitespace belongs to a string or a comment
          if (offset === 0 || frozenLines.has(firstLine + offset)) {
            return line;
          }
          if (deepening) {
            // Padding a blank line would leave trailing whitespace prettier
            // strips, which is itself a fixed-point failure
            return line.trim() === '' ? line : `${added}${line}`;
          }
          // A line shallower than the delta cannot absorb it; leaving it put
          // keeps the fix from eating indentation that is not the span's
          return line.startsWith(removed) ? line.slice(removed.length) : line;
        })
        .join('\n');
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

    // A hoisted comment is relocated text like any other, so its continuation
    // lines move to the landing depth too (#2083). Only a `*`-aligned block has
    // continuation lines that are layout; every other block comment's interior
    // is prose prettier reproduces byte for byte, and so is frozen here.
    function printRelocatedComment(
      comment: TSESTree.Comment,
      landingIndent: string,
      sourceCode: TSESLint.SourceCode,
    ): string {
      const frozenLines = new Set<number>();
      if (!isStarAligned(comment)) {
        for (
          let line = comment.loc.start.line + 1;
          line <= comment.loc.end.line;
          line++
        ) {
          frozenLines.add(line);
        }
      }

      return reindentRelocated(
        printComment(comment),
        getLineIndent(sourceCode.lines[comment.loc.start.line - 1] ?? ''),
        landingIndent,
        comment.loc.start.line,
        frozenLines,
      );
    }

    // Render the dot-path replacement for a single nested property. Comments
    // living inside the property are re-emitted ahead of the flattened entries
    // so directives such as eslint-disable-next-line keep covering the rewritten
    // code rather than being destroyed by the fix.
    function renderFlattenedProperty(
      property: TSESTree.Property,
      entries: FieldPathEntry[],
      sourceCode: TSESLint.SourceCode,
    ): string {
      const comments = sourceCode.getCommentsInside(property);
      const ownLineIndent = getOwnLineIndent(property, sourceCode);
      // A carried line comment would swallow the rest of the line, so anything
      // holding one has to be laid out across multiple lines
      const carriesLineComment = comments.some(
        (comment) => comment.type === AST_TOKEN_TYPES.Line,
      );
      const propertyLineIndent = getLineIndent(
        sourceCode.lines[property.loc.start.line - 1] ?? '',
      );
      // Column every entry is emitted at, and so the depth the text moving with
      // it has to be re-indented against. A property sharing its line keeps the
      // enclosing line's depth; one broken apart by a carried line comment gains
      // a nesting step, read from the object literal it is already inside.
      const landingIndent =
        ownLineIndent ??
        (carriesLineComment ? `${propertyLineIndent}  ` : propertyLineIndent);

      const commentTexts = comments.map((comment) =>
        printRelocatedComment(comment, landingIndent, sourceCode),
      );
      const printedEntries = entries.map((entry) => {
        const valueText = reindentRelocated(
          entry.valueText,
          getLineIndent(sourceCode.lines[entry.sourceLine - 1] ?? ''),
          landingIndent,
          entry.sourceLine,
          entry.frozenLines,
        );
        return `${
          needsQuoting(entry.key) ? `'${entry.key}'` : entry.key
        }: ${valueText}`;
      });

      if (ownLineIndent === null && !carriesLineComment) {
        return [...commentTexts, printedEntries.join(', ')].join(' ');
      }

      const separator = `\n${landingIndent}`;
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
