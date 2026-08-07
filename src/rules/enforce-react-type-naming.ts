import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { buildVariableRenameFixes } from '../utils/renameFixes';

type MessageIds =
  | 'reactNodeShouldBeLowercase'
  | 'componentTypeShouldBeUppercase';

// Types that should have lowercase variable names
const LOWERCASE_TYPES = ['ReactNode', 'JSX.Element'];

// Types that should have uppercase variable names
const UPPERCASE_TYPES = ['ComponentType', 'FC', 'FunctionComponent'];

/**
 * `global-const-style` owns the NAME of a non-exported module-scope `const`, and
 * the two rules cannot both be satisfied there: it demands UPPER_SNAKE_CASE,
 * this rule demands a lowercase initial for `ReactNode`/`JSX.Element`. Every
 * spelling reports under one or the other, and because BOTH renamers autofix,
 * `--fix` oscillates (`element` -> `ELEMENT` -> `eLEMENT` -> `E_LEMENT` ->
 * `e_LEMENT` -> …) until ESLint's ten-pass cap and writes the mangled
 * identifier to disk (Issue #1846).
 *
 * The pair is resolved by this rule yielding: module-scope constant naming is
 * `global-const-style`'s universal contract, while this rule's purpose —
 * telling an element VALUE apart from a COMPONENT — is about local and
 * parameter naming, where nothing competes with it. Do not re-open the
 * carve-out without changing `global-const-style` in the same breath.
 *
 * The predicate below mirrors `global-const-style`'s ACTUAL governance rather
 * than "module-scope const", because that rule declines on several shapes and
 * yielding on one of those would leave the declaration governed by nothing:
 *
 *   - `let`/`var`, and any non-module scope, are outside it entirely;
 *   - an EXPORTED declaration keeps its report there, so this rule keeps its
 *     own (neither renames it, so nothing oscillates);
 *   - a function value or a `memo`/`forwardRef` call makes it skip the whole
 *     declaration list — `const button: FC = () => …` is this rule's alone;
 *   - an absent initializer, a dynamic value, a binding alias and a
 *     `jest.Mock*` cast each silence its rename check.
 *
 * When any of that cannot be established the answer is `false`: keeping a
 * report is recoverable, silently governing nothing is not.
 */
const VALUE_WRAPPER_TYPES = new Set([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
]);

type ValueWrapper =
  | TSESTree.TSAsExpression
  | TSESTree.TSTypeAssertion
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression;

const isValueWrapper = (node: TSESTree.Node): node is ValueWrapper =>
  VALUE_WRAPPER_TYPES.has(node.type);

const unwrapValueWrappers = (node: TSESTree.Node): TSESTree.Node => {
  let target: TSESTree.Node = node;
  while (isValueWrapper(target)) {
    target = target.expression;
  }
  return target;
};

// `global-const-style` unwraps only `as`/`<T>` casts before classifying an
// initializer as dynamic or as a binding alias, so the mirror does the same.
const unwrapCasts = (node: TSESTree.Node): TSESTree.Node => {
  let target = node;
  while (
    target.type === AST_NODE_TYPES.TSTypeAssertion ||
    target.type === AST_NODE_TYPES.TSAsExpression
  ) {
    target = target.expression;
  }
  return target;
};

const COMPONENT_FACTORY_NAMES = new Set(['forwardRef', 'memo']);

const isComponentFactoryCall = (node: TSESTree.Node): boolean => {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return COMPONENT_FACTORY_NAMES.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    COMPONENT_FACTORY_NAMES.has(callee.property.name)
  );
};

const isFunctionValue = (node: TSESTree.Node): boolean =>
  node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
  node.type === AST_NODE_TYPES.FunctionExpression;

const isDynamicValue = (node: TSESTree.Node): boolean => {
  const target = unwrapCasts(node);

  if (
    target.type === AST_NODE_TYPES.CallExpression ||
    target.type === AST_NODE_TYPES.NewExpression ||
    target.type === AST_NODE_TYPES.BinaryExpression
  ) {
    return true;
  }
  if (target.type === AST_NODE_TYPES.ChainExpression) {
    return isDynamicValue(target.expression);
  }
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    return isDynamicValue(target.object);
  }
  return false;
};

const PRIMITIVE_VALUE_GLOBALS = new Set(['undefined', 'NaN', 'Infinity']);

const isBindingAlias = (node: TSESTree.Node): boolean => {
  const target = unwrapCasts(node);
  return (
    target.type === AST_NODE_TYPES.Identifier &&
    !PRIMITIVE_VALUE_GLOBALS.has(target.name)
  );
};

const JEST_MOCK_TYPE_NAMES = new Set([
  'Mock',
  'MockedFunction',
  'Mocked',
  'MockedClass',
]);

const isJestMockTypeReference = (
  typeAnnotation: TSESTree.TypeNode,
): boolean => {
  if (typeAnnotation.type !== AST_NODE_TYPES.TSTypeReference) {
    return false;
  }
  const { typeName } = typeAnnotation;
  return (
    typeName.type === AST_NODE_TYPES.TSQualifiedName &&
    typeName.left.type === AST_NODE_TYPES.Identifier &&
    typeName.left.name === 'jest' &&
    typeName.right.type === AST_NODE_TYPES.Identifier &&
    JEST_MOCK_TYPE_NAMES.has(typeName.right.name)
  );
};

const isJestMockCast = (node: TSESTree.Node): boolean => {
  let current: TSESTree.Node = node;
  while (isValueWrapper(current)) {
    if (
      current.type === AST_NODE_TYPES.TSAsExpression &&
      isJestMockTypeReference(current.typeAnnotation)
    ) {
      return true;
    }
    current = current.expression;
  }
  return false;
};

const isGlobalConstStyleGoverned = (
  declarator: TSESTree.VariableDeclarator,
): boolean => {
  const declaration = declarator.parent;
  if (
    !declaration ||
    declaration.type !== AST_NODE_TYPES.VariableDeclaration ||
    declaration.kind !== 'const'
  ) {
    return false;
  }

  // Module scope only, and not exported: `global-const-style` withholds the
  // rename FIX for an exported binding (#1700) but keeps reporting it, so both
  // rules stay report-only there and no `--fix` loop can form.
  if (declaration.parent?.type !== AST_NODE_TYPES.Program) {
    return false;
  }

  // The function-value / component-factory skip is evaluated over the whole
  // declaration LIST there, so `const a = () => {}, b = <div />;` exempts both.
  const listSkipped = declaration.declarations.some((one) => {
    if (one.id.type !== AST_NODE_TYPES.Identifier || !one.init) {
      return false;
    }
    const target = unwrapValueWrappers(one.init);
    return isFunctionValue(target) || isComponentFactoryCall(target);
  });
  if (listSkipped) {
    return false;
  }

  const { init } = declarator;
  if (!init) {
    return false;
  }

  return (
    !isDynamicValue(init) && !isBindingAlias(init) && !isJestMockCast(init)
  );
};

// Every node shape whose declared identifiers this rule renames. Each one is a
// node `getDeclaredVariables` understands, which is what lets the fixer resolve
// the symbol behind the reported identifier.
type RenameOwner =
  | TSESTree.VariableDeclarator
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

export const enforceReactTypeNaming = createRule<[], MessageIds>({
  name: 'enforce-react-type-naming',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce naming conventions for React types',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      reactNodeShouldBeLowercase:
        'Variables or parameters of type "{{type}}" should use lowercase naming (e.g., "{{suggestion}}").',
      componentTypeShouldBeUppercase:
        'Variables or parameters of type "{{type}}" should use uppercase naming (e.g., "{{suggestion}}").',
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Checks if a string starts with an uppercase letter
     */
    function isUppercase(str: string): boolean {
      return /^[A-Z]/.test(str);
    }

    /**
     * Converts a string to start with lowercase
     */
    function toLowercase(str: string): string {
      if (!str) return str;
      return str.charAt(0).toLowerCase() + str.slice(1);
    }

    /**
     * Converts a string to start with uppercase
     */
    function toUppercase(str: string): string {
      if (!str) return str;
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Extracts the type name from a type annotation
     */
    function getTypeName(
      typeAnnotation: TSESTree.TypeNode | undefined,
    ): string | null {
      if (!typeAnnotation) return null;

      // Handle TSTypeReference (e.g., ReactNode, ComponentType)
      if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
        if (typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier) {
          return typeAnnotation.typeName.name;
        }
        // Handle qualified names like JSX.Element
        if (typeAnnotation.typeName.type === AST_NODE_TYPES.TSQualifiedName) {
          const left =
            typeAnnotation.typeName.left.type === AST_NODE_TYPES.Identifier
              ? typeAnnotation.typeName.left.name
              : '';
          const right = typeAnnotation.typeName.right.name;
          return `${left}.${right}`;
        }
      }

      return null;
    }

    /**
     * Checks if a node is a destructured variable
     */
    function isDestructured(node: TSESTree.Node): boolean {
      return (
        node.parent?.type === AST_NODE_TYPES.Property ||
        node.parent?.type === AST_NODE_TYPES.ArrayPattern ||
        (node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          (node.parent.id.type === AST_NODE_TYPES.ObjectPattern ||
            node.parent.id.type === AST_NODE_TYPES.ArrayPattern))
      );
    }

    /**
     * Checks if a node is a default import
     */
    function isDefaultImport(node: TSESTree.Node): boolean {
      return (
        node.parent?.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
        (node.parent?.type === AST_NODE_TYPES.ImportSpecifier &&
          node.parent.local.name !== node.parent.imported?.name)
      );
    }

    /**
     * Builds the rename for a reported identifier: the declaration plus every
     * in-file reference, rewriting only name tokens so the type annotation that
     * triggered the report survives (Issue #1357).
     *
     * The variable is resolved by declaration identity rather than by name,
     * because a shape like `function Content(Content: ReactNode)` declares two
     * distinct symbols under one name and a name-based lookup picks the wrong
     * one. When the symbol cannot be resolved the fix is withheld entirely — a
     * partial rename is worse than no rename.
     */
    function buildRenameFixes(
      fixer: TSESLint.RuleFixer,
      owner: RenameOwner,
      declarationId: TSESTree.Identifier,
      newName: string,
    ): TSESLint.RuleFix[] | null {
      const variable =
        context
          .getDeclaredVariables(owner)
          .find((candidate) =>
            candidate.defs.some((def) => def.name === declarationId),
          ) ?? null;

      if (!variable) {
        return null;
      }

      return buildVariableRenameFixes({
        fixer,
        sourceCode: context.getSourceCode(),
        variable,
        declarationId,
        newName,
      });
    }

    /**
     * Check variable declarations for React type naming conventions
     */
    function checkVariableDeclaration(node: TSESTree.VariableDeclarator) {
      if (node.id.type !== AST_NODE_TYPES.Identifier) return;

      const id = node.id;

      // Skip destructured variables
      if (isDestructured(id)) return;

      // Yield the name to `global-const-style` where it governs (Issue #1846).
      // Both branches yield: its UPPER_SNAKE_CASE target already satisfies the
      // component branch's "starts uppercase", so nothing is lost there, and
      // the element branch is the one that cannot coexist with it at all.
      if (isGlobalConstStyleGoverned(node)) return;

      const variableName = id.name;

      // Get the type annotation
      const typeAnnotation = id.typeAnnotation?.typeAnnotation;
      const typeName = getTypeName(typeAnnotation);

      if (!typeName) return;

      // Check if it's a ReactNode or JSX.Element (should be lowercase)
      if (LOWERCASE_TYPES.includes(typeName) && isUppercase(variableName)) {
        const suggestion = toLowercase(variableName);
        context.report({
          node: id,
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: typeName,
            suggestion,
          },
          fix: (fixer) => buildRenameFixes(fixer, node, id, suggestion),
        });
      }

      // Check if it's a ComponentType or FC (should be uppercase)
      if (UPPERCASE_TYPES.includes(typeName) && !isUppercase(variableName)) {
        const suggestion = toUppercase(variableName);
        context.report({
          node: id,
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: typeName,
            suggestion,
          },
          fix: (fixer) => buildRenameFixes(fixer, node, id, suggestion),
        });
      }
    }

    /**
     * Check function parameters for React type naming conventions
     */
    function checkParameter(
      node: TSESTree.Parameter,
      owner:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ) {
      if (node.type !== AST_NODE_TYPES.Identifier) return;

      const id = node;

      // Skip destructured parameters
      if (isDestructured(id)) return;

      // Skip default imports
      if (isDefaultImport(id)) return;

      const paramName = id.name;

      // Get the type annotation
      const typeAnnotation = id.typeAnnotation?.typeAnnotation;
      const typeName = getTypeName(typeAnnotation);

      if (!typeName) return;

      // Check if it's a ReactNode or JSX.Element (should be lowercase)
      if (LOWERCASE_TYPES.includes(typeName) && isUppercase(paramName)) {
        const suggestion = toLowercase(paramName);
        context.report({
          node: id,
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: typeName,
            suggestion,
          },
          fix: (fixer) => buildRenameFixes(fixer, owner, id, suggestion),
        });
      }

      // Check if it's a ComponentType or FC (should be uppercase)
      if (UPPERCASE_TYPES.includes(typeName) && !isUppercase(paramName)) {
        const suggestion = toUppercase(paramName);
        context.report({
          node: id,
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: typeName,
            suggestion,
          },
          fix: (fixer) => buildRenameFixes(fixer, owner, id, suggestion),
        });
      }
    }

    return {
      VariableDeclarator: checkVariableDeclaration,
      Identifier(node: TSESTree.Identifier) {
        // Check parameter names in function declarations
        if (
          node.parent &&
          (node.parent.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.parent.type === AST_NODE_TYPES.FunctionExpression ||
            node.parent.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
          node.parent.params.includes(node)
        ) {
          checkParameter(node, node.parent);
        }
      },
    };
  },
});
