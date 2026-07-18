import path from 'path';
import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'useAssertSafe';
type Options = [
  {
    readonly assertSafeImportPath?: string;
  },
];

const DEFAULT_IMPORT_PATH = 'functions/src/util/assertSafe';

export const enforceAssertSafeObjectKey = createRule<Options, MessageIds>({
  name: 'enforce-assert-safe-object-key',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce the use of assertSafe(id) when accessing object properties with computed keys that involve string interpolation or explicit string conversion.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          assertSafeImportPath: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useAssertSafe:
        'Dynamic object key "{{key}}" is used without assertSafe() validation. Unvalidated keys can resolve to unexpected properties (including prototype fields) and make lookups fragile or unsafe. Wrap the key with assertSafe({{key}}) before accessing the object.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const importPath = options?.assertSafeImportPath || DEFAULT_IMPORT_PATH;
    let hasAssertSafeImport = false;

    /**
     * Computes the module specifier for the injected assertSafe import.
     *
     * `importPath` is anchored at the repo root (relative to process.cwd(),
     * which is the repo root in real eslint runs), matching how
     * avoid-utils-directory and test-file-location-enforcement treat paths.
     * A bare repo-root specifier such as 'functions/src/util/assertSafe' is
     * unresolvable inside the functions/ TS project, whose baseUrl is
     * functions/: it would resolve to functions/functions/src/util/assertSafe,
     * which does not exist. The specifier is therefore derived relative to the
     * file being fixed so the emitted import resolves from that file's location.
     */
    const computeImportSpecifier = (): string => {
      const rawFilename = context.getFilename().replace(/\\/g, '/');
      // Virtual/stdin files (RuleTester default 'file.ts', '<input>', '<text>')
      // are not absolute; we cannot anchor a relative path, so emit the
      // configured path verbatim (preserves the option's literal value for
      // non-file lints).
      if (!path.isAbsolute(rawFilename)) {
        return importPath;
      }
      const target = importPath
        .replace(/\\/g, '/')
        .replace(/\.(tsx?|jsx?|mts|cts)$/i, '');
      const fileRelToCwd = path
        .relative(process.cwd(), rawFilename)
        .replace(/\\/g, '/');
      const fileDir = path.posix.dirname(fileRelToCwd);
      let specifier = path.posix.relative(fileDir, target);
      if (!specifier.startsWith('.')) {
        specifier = `./${specifier}`;
      }
      return specifier;
    };

    /**
     * Helper function to add assertSafe import if needed
     */
    const addAssertSafeImport = (
      fixer: TSESLint.RuleFixer,
    ): TSESLint.RuleFix => {
      const program = context.sourceCode.ast;
      const firstImport = program.body.find(
        (node) => node.type === AST_NODE_TYPES.ImportDeclaration,
      );
      const importStatement = `import { assertSafe } from '${computeImportSpecifier()}';\n`;

      if (firstImport) {
        return fixer.insertTextBefore(firstImport, importStatement);
      } else {
        return fixer.insertTextBefore(program.body[0], importStatement);
      }
    };

    /**
     * Helper function to create fixes for a node
     */
    const createFixes = (
      fixer: TSESLint.RuleFixer,
      node: TSESTree.Node,
      argText: string,
    ): TSESLint.RuleFix[] => {
      const fixes: TSESLint.RuleFix[] = [];

      // Add import if not present
      if (!hasAssertSafeImport) {
        fixes.push(addAssertSafeImport(fixer));
        hasAssertSafeImport = true;
      }

      // Replace the node with assertSafe(argText)
      fixes.push(fixer.replaceText(node, `assertSafe(${argText})`));

      return fixes;
    };

    const reportUseAssertSafe = (node: TSESTree.Node, expressionText: string) =>
      context.report({
        node,
        messageId: 'useAssertSafe',
        data: { key: expressionText },
        fix(fixer) {
          return createFixes(fixer, node, expressionText);
        },
      });

    /**
     * Returns true when the identifier was initialized directly from an
     * assertSafe(...) call, e.g. `const safeKey = assertSafe(rawKey)`.
     * Only direct, single-step initializers count — transitive aliases
     * (const b = a) are not followed so they continue to be flagged.
     * findVariableInScope returns the nearest binding, so an inner variable
     * that shadows an outer assertSafe-initialized one is correctly not exempt.
     */
    const isAssertSafeValidatedIdentifier = (
      node: TSESTree.Identifier,
    ): boolean => {
      const scope = ASTHelpers.getScope(context, node);
      const variable = ASTHelpers.findVariableInScope(scope, node.name);
      if (!variable) return false;
      return variable.defs.some((def) => {
        const init =
          def.node.type === AST_NODE_TYPES.VariableDeclarator
            ? def.node.init
            : null;
        return (
          !!init &&
          init.type === AST_NODE_TYPES.CallExpression &&
          init.callee.type === AST_NODE_TYPES.Identifier &&
          init.callee.name === 'assertSafe'
        );
      });
    };

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        // Check if assertSafe is already imported
        if (
          node.specifiers.some(
            (specifier) =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.name === 'assertSafe',
          )
        ) {
          hasAssertSafeImport = true;
        }
      },
      // Handle computed property in object destructuring
      Property(node: TSESTree.Property) {
        if (node.computed && node.key) {
          const key = node.key;

          // Check for String(id) pattern
          if (
            key.type === AST_NODE_TYPES.CallExpression &&
            key.callee.type === AST_NODE_TYPES.Identifier &&
            key.callee.name === 'String'
          ) {
            const arg = key.arguments[0];
            const argText = context.sourceCode.getText(arg);
            reportUseAssertSafe(key, argText);
          }

          // Check for template literals like `${id}`
          if (
            key.type === AST_NODE_TYPES.TemplateLiteral &&
            key.expressions.length === 1 &&
            key.quasis.length === 2 &&
            key.quasis[0].value.raw === '' &&
            key.quasis[1].value.raw === ''
          ) {
            const expr = key.expressions[0];
            const exprText = context.sourceCode.getText(expr);
            reportUseAssertSafe(key, exprText);
          }
        }
      },
      // Handle binary expressions like 'key' in obj
      BinaryExpression(node: TSESTree.BinaryExpression) {
        if (node.operator === 'in') {
          const left = node.left;

          // Check for String(id) pattern
          if (
            left.type === AST_NODE_TYPES.CallExpression &&
            left.callee.type === AST_NODE_TYPES.Identifier &&
            left.callee.name === 'String'
          ) {
            const arg = left.arguments[0];
            const argText = context.sourceCode.getText(arg);
            reportUseAssertSafe(left, argText);
          }

          // Check for template literals like `${id}`
          if (
            left.type === AST_NODE_TYPES.TemplateLiteral &&
            left.expressions.length === 1 &&
            left.quasis.length === 2 &&
            left.quasis[0].value.raw === '' &&
            left.quasis[1].value.raw === ''
          ) {
            const expr = left.expressions[0];
            const exprText = context.sourceCode.getText(expr);
            reportUseAssertSafe(left, exprText);
          }
        }
      },
      MemberExpression(node: TSESTree.MemberExpression) {
        if (node.computed) {
          const property = node.property;

          // Skip if already using assertSafe
          if (
            property.type === AST_NODE_TYPES.CallExpression &&
            property.callee.type === AST_NODE_TYPES.Identifier &&
            property.callee.name === 'assertSafe'
          ) {
            // Already using assertSafe, this is valid
            return;
          }

          // Try to determine if this is likely an array or dictionary
          const objectNode = node.object;
          let objectName = '';
          let isLikelyArray = false;

          if (objectNode.type === AST_NODE_TYPES.Identifier) {
            objectName = objectNode.name.toLowerCase();
            isLikelyArray =
              /^(array|arr|items|elements|list|collection|data)s?$/i.test(
                objectName,
              );
          }

          // Check for string literals - allow them for dictionaries but not for regular objects
          if (
            property.type === AST_NODE_TYPES.Literal &&
            typeof property.value === 'string'
          ) {
            // String literals are fine, no need for assertSafe
            return;
          }

          // Check for numeric literals - always allow for arrays
          if (
            property.type === AST_NODE_TYPES.Literal &&
            typeof property.value === 'number'
          ) {
            // Numeric literals are fine, no need for assertSafe
            return;
          }

          // Check if we're using String(id) pattern
          if (
            property.type === AST_NODE_TYPES.CallExpression &&
            property.callee.type === AST_NODE_TYPES.Identifier &&
            property.callee.name === 'String'
          ) {
            const arg = property.arguments[0];
            const argText = context.sourceCode.getText(arg);
            reportUseAssertSafe(property, argText);
            return;
          }

          // Check for template literals
          if (property.type === AST_NODE_TYPES.TemplateLiteral) {
            // If it's a template literal in an array, allow it
            if (isLikelyArray) {
              return;
            }

            // Only flag simple template literals that are just `${id}`
            // Complex templates with additional text like `prefix_${id}_suffix` are allowed
            const isSimpleVarInterpolation =
              property.expressions.length === 1 &&
              property.quasis.length === 2 &&
              property.quasis[0].value.raw === '' &&
              property.quasis[1].value.raw === '';

            if (!isSimpleVarInterpolation) {
              // Complex template literals with additional text are fine
              return;
            }

            const expr = property.expressions[0];
            const exprText = context.sourceCode.getText(expr);
            reportUseAssertSafe(property, exprText);
            return;
          }

          // Check for direct variable usage (identifiers)
          if (property.type === AST_NODE_TYPES.Identifier) {
            // Skip numeric literals, they're safe
            if (/^\d+$/.test(property.name)) {
              return;
            }

            // If it looks like an array access, allow it
            if (isLikelyArray) {
              return;
            }

            // Variables initialized directly from assertSafe(...) are already
            // validated — no need to double-wrap them.
            if (isAssertSafeValidatedIdentifier(property)) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportUseAssertSafe(property, propText);
            return;
          }

          // Check for binary expressions (like index + 1)
          if (property.type === AST_NODE_TYPES.BinaryExpression) {
            // Allow binary expressions in array access
            if (isLikelyArray) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportUseAssertSafe(property, propText);
            return;
          }

          // Check for boolean expressions and other literals
          if (
            property.type === AST_NODE_TYPES.Literal ||
            property.type === AST_NODE_TYPES.LogicalExpression ||
            property.type === AST_NODE_TYPES.ConditionalExpression
          ) {
            // Allow these expressions in array access
            if (isLikelyArray) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportUseAssertSafe(property, propText);
            return;
          }

          // Check for function calls (anything that isn't handled above)
          if (
            property.type === AST_NODE_TYPES.MemberExpression ||
            (property.type === AST_NODE_TYPES.CallExpression &&
              !(
                property.callee.type === AST_NODE_TYPES.Identifier &&
                property.callee.name === 'String'
              ))
          ) {
            // Allow member expressions and function calls in array access
            if (isLikelyArray) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportUseAssertSafe(property, propText);
            return;
          }
        }
      },
    };
  },
});
