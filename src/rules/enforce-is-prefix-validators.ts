import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { Minimatch } from 'minimatch';

type MessageIds = 'disallowedPrefix' | 'missingRequiredPrefix';

type Options = [
  {
    targetPaths?: string[];
    requiredPrefix?: string;
    allowedPrefixes?: string[];
    disallowedPrefixes?: string[];
    excludeNames?: string[];
    excludePatterns?: string[];
  },
];

const DEFAULT_TARGET_PATHS = ['**/validators/**/*.ts'];

const DEFAULT_REQUIRED_PREFIX = 'is';

// Additional prefixes that are semantically valid predicates in the codebase:
// - 'not' for negative predicates (notContainsUrl, notContainsEmail)
// - 'are' for plural predicates (areBothPositiveIntegers, areBothFiniteNumbers)
const DEFAULT_ALLOWED_PREFIXES = ['is', 'not', 'are'];

const DEFAULT_DISALLOWED_PREFIXES = ['validate', 'check', 'verify', 'ensure'];

// Infrastructure exports that live in validators/ directories but are not
// validators themselves. These are builder utilities, type exports, and
// factory patterns that follow their own naming conventions.
const DEFAULT_EXCLUDE_NAMES = [
  'ValidatorPipeline',
  'ValidatorFactory',
  'ValidatorFactorySync',
  'Validate',
  'ValidateSync',
];

const DEFAULT_EXCLUDE_PATTERNS = ['**/*.test.ts', '**/*.spec.ts'];

/**
 * Checks whether `name` starts with `prefix` at a proper camelCase boundary.
 * The prefix must be followed by an uppercase letter, digit, or end-of-string
 * so that e.g. 'check' matches 'checkTokenCount' but not 'checkbox'.
 */
function startsWithPrefix(name: string, prefix: string): boolean {
  if (!name.toLowerCase().startsWith(prefix.toLowerCase())) {
    return false;
  }
  if (name.length === prefix.length) {
    return true;
  }
  const nextChar = name.charAt(prefix.length);
  return (
    nextChar === nextChar.toUpperCase() && nextChar !== nextChar.toLowerCase()
  );
}

/**
 * Derives the suggested rename by stripping the disallowed prefix and
 * prepending the requiredPrefix. Preserves PascalCase of the remainder.
 *
 * Example: 'validateDecreaseOnly' → 'isDecreaseOnly'
 */
function suggestRename(
  name: string,
  strippedPrefix: string,
  requiredPrefix: string,
): string {
  const remainder = name.slice(strippedPrefix.length);
  // Ensure the first character of the remainder is uppercase after stripping.
  const capitalizedRemainder =
    remainder.charAt(0).toUpperCase() + remainder.slice(1);
  return `${requiredPrefix}${capitalizedRemainder}`;
}

/**
 * A sentinel value that signals to `checkName` that the exported binding is
 * definitely callable (e.g. a FunctionDeclaration or a specifier that can only
 * be a local function binding). This is distinct from `undefined` which means
 * "no initializer, unknown callability."
 */
const DEFINITELY_CALLABLE = Symbol('DEFINITELY_CALLABLE');

/**
 * Returns true when the export declaration is for a type-only construct:
 * - `export type Foo = ...`
 * - `export interface Foo { ... }`
 * - `export class Foo { ... }` (classes are infrastructure, not validators)
 * - `export enum Foo { ... }` (enums are not validators)
 */
function isTypeOrClassExport(node: TSESTree.ExportNamedDeclaration): boolean {
  if (!node.declaration) {
    return false;
  }
  const declType = node.declaration.type;
  return (
    declType === AST_NODE_TYPES.TSTypeAliasDeclaration ||
    declType === AST_NODE_TYPES.TSInterfaceDeclaration ||
    declType === AST_NODE_TYPES.TSEnumDeclaration ||
    declType === AST_NODE_TYPES.ClassDeclaration
  );
}

/**
 * Returns true when the variable initializer is clearly a non-function
 * constant (primitive literal, regex, array literal, object literal, template
 * literal, tagged template) rather than a callable validator. This avoids
 * false positives on constants like `MAX_DESCRIPTION_LENGTH`, `EMAIL_REGEX`,
 * and `ERROR_NOT_INTEGER`.
 *
 * Per the spec (Edge Case 1), we flag:
 *   - function expressions / arrow functions
 *   - call expressions (derived validators, ValidatorPipeline chains)
 *   - member expressions that may resolve to validators
 *
 * We skip:
 *   - Literal primitives (string/number/boolean)
 *   - RegExp literals
 *   - Array literals
 *   - Object literals
 *   - Template literals
 *   - Tagged template expressions
 *   - TS `as const` assertions wrapping the above (TSAsExpression)
 *   - Await expressions
 *
 * Any initializer not in the skip list is treated as potentially callable so
 * we don't accidentally hide a renamed validator.
 */
function isNonFunctionInitializer(
  init: TSESTree.Expression | null | undefined,
): boolean {
  if (!init) {
    return true;
  }

  // Unwrap `as const` / type assertions — look at the underlying expression.
  let expr: TSESTree.Expression = init;
  while (
    expr.type === AST_NODE_TYPES.TSAsExpression ||
    expr.type === AST_NODE_TYPES.TSTypeAssertion ||
    expr.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    expr.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    expr = (expr as TSESTree.TSAsExpression).expression as TSESTree.Expression;
  }

  switch (expr.type) {
    case AST_NODE_TYPES.Literal:
      // string, number, boolean, null, bigint, regex
      return true;
    case AST_NODE_TYPES.TemplateLiteral:
      return true;
    case AST_NODE_TYPES.TaggedTemplateExpression:
      return true;
    case AST_NODE_TYPES.ArrayExpression:
      return true;
    case AST_NODE_TYPES.ObjectExpression:
      return true;
    default:
      // Arrow functions, function expressions, call expressions, identifiers,
      // member expressions, new expressions, etc. — all potentially callable.
      return false;
  }
}

export const enforceIsPrefixValidators = createRule<Options, MessageIds>({
  name: 'enforce-is-prefix-validators',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce the `is` (or other allowed predicate) prefix for exported validators in **/validators/**/*.ts files',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          targetPaths: {
            type: 'array',
            items: { type: 'string' },
          },
          requiredPrefix: {
            type: 'string',
          },
          allowedPrefixes: {
            type: 'array',
            items: { type: 'string' },
          },
          disallowedPrefixes: {
            type: 'array',
            items: { type: 'string' },
          },
          excludeNames: {
            type: 'array',
            items: { type: 'string' },
          },
          excludePatterns: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      disallowedPrefix:
        'Exported validator "{{name}}" uses the disallowed "{{prefix}}" prefix. Validators use the "{{requiredPrefix}}" prefix (e.g., "{{suggestion}}"). See .claude/skills/validation/SKILL.md.',
      missingRequiredPrefix:
        'Exported validator "{{name}}" must use the "{{requiredPrefix}}" prefix. Rename to "{{suggestion}}".',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const targetPaths = options.targetPaths ?? DEFAULT_TARGET_PATHS;
    const requiredPrefix = options.requiredPrefix ?? DEFAULT_REQUIRED_PREFIX;
    const allowedPrefixes = options.allowedPrefixes ?? DEFAULT_ALLOWED_PREFIXES;
    const disallowedPrefixes =
      options.disallowedPrefixes ?? DEFAULT_DISALLOWED_PREFIXES;
    const excludeNames = options.excludeNames ?? DEFAULT_EXCLUDE_NAMES;
    const excludePatterns = options.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS;

    const filename: string = context.getFilename();

    // Build matchers once per file to avoid repeated Minimatch construction.
    const targetMatchers = targetPaths.map((p) => new Minimatch(p));
    const excludeMatchers = excludePatterns.map((p) => new Minimatch(p));

    const isTargetFile = targetMatchers.some((mm) => mm.match(filename));
    const isExcludedFile = excludeMatchers.some((mm) => mm.match(filename));

    if (!isTargetFile || isExcludedFile) {
      return {};
    }

    const excludeNamesSet = new Set(excludeNames);

    /**
     * Check a single exported name and report a violation if it does not meet
     * the prefix requirements.
     *
     * @param init - The initializer expression for `export const` declarations,
     *   `DEFINITELY_CALLABLE` for function declarations / specifier exports
     *   that are definitely callable, or `undefined` when the callability is
     *   unknown (treated as non-callable to avoid false positives).
     */
    function checkName(
      name: string,
      reportNode: TSESTree.Node,
      init: typeof DEFINITELY_CALLABLE | TSESTree.Expression | null | undefined,
    ): void {
      // Infrastructure or explicitly excluded names are always exempt.
      if (excludeNamesSet.has(name)) {
        return;
      }

      // Skip PascalCase names: these are typically class instances, type
      // utilities, or infrastructure exports — not validator functions.
      if (
        name.charAt(0) === name.charAt(0).toUpperCase() &&
        /^[A-Z]/.test(name)
      ) {
        return;
      }

      // Non-function constants (primitives, regex, arrays, objects) are exempt
      // from the naming requirement per Edge Case 1 in the spec.
      // When init is DEFINITELY_CALLABLE (function declarations, specifier
      // exports), skip the check and always enforce the prefix requirement.
      if (
        init !== DEFINITELY_CALLABLE &&
        isNonFunctionInitializer(init as TSESTree.Expression | null | undefined)
      ) {
        return;
      }

      // Check if the name uses an explicitly disallowed prefix.
      const matchedDisallowed = disallowedPrefixes.find((prefix) =>
        startsWithPrefix(name, prefix),
      );

      if (matchedDisallowed) {
        const suggestion = suggestRename(
          name,
          matchedDisallowed,
          requiredPrefix,
        );
        context.report({
          node: reportNode,
          messageId: 'disallowedPrefix',
          data: {
            name,
            prefix: matchedDisallowed,
            requiredPrefix,
            suggestion,
          },
        });
        return;
      }

      // Check if the name starts with one of the allowed prefixes.
      const hasAllowedPrefix = allowedPrefixes.some((prefix) =>
        startsWithPrefix(name, prefix),
      );

      if (!hasAllowedPrefix) {
        // Generate a best-effort suggestion using the required prefix.
        const suggestion = `${requiredPrefix}${name
          .charAt(0)
          .toUpperCase()}${name.slice(1)}`;
        context.report({
          node: reportNode,
          messageId: 'missingRequiredPrefix',
          data: {
            name,
            requiredPrefix,
            suggestion,
          },
        });
      }
    }

    return {
      ExportNamedDeclaration(node: TSESTree.ExportNamedDeclaration) {
        // Skip type/interface/class/enum — these are not validator functions.
        if (isTypeOrClassExport(node)) {
          return;
        }

        // `export const foo = ...` or `export let foo = ...`
        if (node.declaration?.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declarator of node.declaration.declarations) {
            if (declarator.id.type === AST_NODE_TYPES.Identifier) {
              checkName(declarator.id.name, declarator.id, declarator.init);
            }
          }
          return;
        }

        // `export function foo(...) { ... }`
        if (
          node.declaration?.type === AST_NODE_TYPES.FunctionDeclaration &&
          node.declaration.id
        ) {
          // Function declarations are always callable.
          checkName(
            node.declaration.id.name,
            node.declaration.id,
            DEFINITELY_CALLABLE,
          );
          return;
        }

        // `export { foo }` — re-exports of locally-defined names.
        // We only flag names that are exported from the current file's own
        // bindings. Specifiers with `source` (e.g., `export { x } from '...'`)
        // re-export external names the author does not control, so we skip them
        // to avoid false positives.
        if (node.specifiers.length > 0 && node.source === null) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === AST_NODE_TYPES.ExportSpecifier &&
              specifier.exported.type === AST_NODE_TYPES.Identifier
            ) {
              // For specifier-style exports, we cannot inspect the initializer
              // here without scope analysis. We treat them as definitely callable
              // (DEFINITELY_CALLABLE) so the prefix check always runs.
              const exportedName = specifier.exported.name;
              const localName =
                specifier.local.type === AST_NODE_TYPES.Identifier
                  ? specifier.local.name
                  : exportedName;
              // Skip re-exports of known infrastructure names.
              if (!excludeNamesSet.has(localName)) {
                checkName(
                  exportedName,
                  specifier.exported,
                  DEFINITELY_CALLABLE,
                );
              }
            }
          }
        }
      },
    };
  },
});
