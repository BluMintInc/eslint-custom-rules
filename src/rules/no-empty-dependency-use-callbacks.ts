import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

type Options = [
  {
    ignoreTestFiles?: boolean;
    testFilePatterns?: string[];
    ignoreUseLatestCallback?: boolean;
  },
];

type MessageIds = 'preferUtilityFunction' | 'preferUtilityLatest';

const DEFAULT_TEST_PATTERNS = [
  '**/__tests__/**',
  '**/*.test.*',
  '**/*.spec.*',
];

function isUseCallbackCallee(
  callee: TSESTree.LeftHandSideExpression,
): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'useCallback';
  }

  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'useCallback'
  );
}

function isUseLatestCallbackCallee(
  callee: TSESTree.LeftHandSideExpression,
): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'useLatestCallback';
  }

  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'useLatestCallback'
  );
}

function isFunctionExpression(
  node: TSESTree.Node | undefined,
): node is
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression {
  return (
    !!node &&
    (node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionExpression)
  );
}

function isPropertyKey(
  parent: TSESTree.Node | null | undefined,
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): boolean {
  if (!parent) return false;
  if (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.property === identifier &&
    !parent.computed
  ) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.Property &&
    parent.key === identifier &&
    !parent.computed
  ) {
    return true;
  }
  return false;
}

function findHoistTarget(node: TSESTree.Node): TSESTree.Node | null {
  let current: TSESTree.Node | undefined = node;

  while (current?.parent) {
    if (current.parent.type === AST_NODE_TYPES.Program) {
      return current;
    }
    if (
      current.parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
      current.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration
    ) {
      return current.parent;
    }
    current = current.parent as TSESTree.Node;
  }

  return null;
}

function getCallbackArg(
  node: TSESTree.CallExpression,
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null {
  const [maybeFn] = node.arguments;
  if (isFunctionExpression(maybeFn)) {
    return maybeFn;
  }
  return null;
}

function hasEmptyDependencyArray(node: TSESTree.CallExpression): boolean {
  if (node.arguments.length < 2) return false;
  const deps = node.arguments[1];
  return deps.type === AST_NODE_TYPES.ArrayExpression && deps.elements.length === 0;
}

function isTestFile(
  filename: string,
  patterns: string[],
): boolean {
  const basename = filename.split('/').pop() ?? filename;
  return patterns.some(
    (pattern) => minimatch(filename, pattern) || minimatch(basename, pattern),
  );
}

function analyzeExternalReferences(
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): { hasComponentScopeRef: boolean; hasExternalRefs: boolean } {
  const scopeManager = context.getSourceCode().scopeManager;
  if (!scopeManager) {
    return { hasComponentScopeRef: false, hasExternalRefs: false };
  }
  const scope = scopeManager.acquire(fn, true);
  if (!scope) {
    return { hasComponentScopeRef: false, hasExternalRefs: false };
  }

  let hasComponentScopeRef = false;
  let hasExternalRefs = false;

  for (const ref of scope.through) {
    const identifier = ref.identifier;
    if (isPropertyKey(identifier.parent, identifier)) {
      continue;
    }
    hasExternalRefs = true;
    const resolved = ref.resolved;
    if (!resolved) {
      continue;
    }

    const def = resolved.defs[0];
    const scopeType = resolved.scope.type;
    const isImport = def?.type === 'ImportBinding';
    const isModuleOrGlobal =
      scopeType === 'module' || scopeType === 'global';

    if (!isImport && !isModuleOrGlobal) {
      hasComponentScopeRef = true;
      break;
    }
  }

  return { hasComponentScopeRef, hasExternalRefs };
}

function buildHoistFixes(
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  callExpression: TSESTree.CallExpression,
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): ((fixer: TSESLint.RuleFixer) => TSESLint.RuleFix[]) | null {
  if (
    !callExpression.parent ||
    callExpression.parent.type !== AST_NODE_TYPES.VariableDeclarator
  ) {
    return null;
  }

  const declarator = callExpression.parent;
  if (declarator.id.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const varDecl = declarator.parent;
  if (
    !varDecl ||
    varDecl.type !== AST_NODE_TYPES.VariableDeclaration ||
    varDecl.declarations.length !== 1
  ) {
    return null;
  }

  if (!varDecl.parent || varDecl.parent.type !== AST_NODE_TYPES.BlockStatement) {
    return null;
  }

  const hoistTarget = findHoistTarget(varDecl.parent);
  if (!hoistTarget) {
    return null;
  }

  const sourceCode = context.getSourceCode();
  const functionText = sourceCode.getText(callback);
  const hoisted = `const ${declarator.id.name} = ${functionText};\n`;
  const fileText = sourceCode.getText();
  let removeStart = varDecl.range[0];

  while (removeStart > 0) {
    const char = fileText[removeStart - 1];
    if (char === '\n' || char === '\r') break;
    removeStart -= 1;
  }

  let removeEnd = varDecl.range[1];
  while (removeEnd < fileText.length && fileText[removeEnd] !== '\n') {
    removeEnd += 1;
  }
  if (removeEnd < fileText.length) {
    removeEnd += 1;
  }

  return (fixer) => [
    fixer.insertTextBefore(hoistTarget, hoisted),
    fixer.removeRange([removeStart, removeEnd]),
  ];
}

export const noEmptyDependencyUseCallbacks = createRule<Options, MessageIds>({
  name: 'no-empty-dependency-use-callbacks',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage useCallback([]) or useLatestCallback around static functions. Static callbacks do not need hook machinery—extract them to module-level utilities for clarity and to avoid unnecessary hook overhead.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          ignoreTestFiles: { type: 'boolean', default: true },
          testFilePatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_TEST_PATTERNS,
          },
          ignoreUseLatestCallback: { type: 'boolean', default: false },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferUtilityFunction:
        'This callback uses useCallback([]) but never reads component/hook state. Hook overhead is wasted when dependencies are empty. Move "{{name}}" to a module-level utility instead of wrapping it in useCallback([]) so it stays stable without React hook bookkeeping. If this must remain to satisfy memoized children, add an eslint-disable comment explaining the dependency.',
      preferUtilityLatest:
        'useLatestCallback wraps a function that never reads component/hook state. Extract "{{name}}" to a module-level utility to avoid the extra hook wrapper. If you rely on useLatestCallback for memoization or HMR, disable this rule with a short comment.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const [options] = context.options;
    const ignoreTestFiles = options?.ignoreTestFiles !== false;
    const testPatterns = options?.testFilePatterns ?? DEFAULT_TEST_PATTERNS;
    const ignoreUseLatestCallback = options?.ignoreUseLatestCallback === true;

    const filename = context.getFilename();
    const isTest = ignoreTestFiles && isTestFile(filename, testPatterns);

    function reportIfStaticCallback(
      callExpression: TSESTree.CallExpression,
      messageId: MessageIds,
    ): void {
      const callee = callExpression.callee;
      if (
        callee.type !== AST_NODE_TYPES.Identifier &&
        callee.type !== AST_NODE_TYPES.MemberExpression
      ) {
        return;
      }

      const callback = getCallbackArg(callExpression);
      if (!callback) return;

      if (ASTHelpers.returnsJSX(callback.body)) return;

      const { hasComponentScopeRef } = analyzeExternalReferences(context, callback);
      if (hasComponentScopeRef) {
        return;
      }

      const callbackName =
        callExpression.parent &&
        callExpression.parent.type === AST_NODE_TYPES.VariableDeclarator &&
        callExpression.parent.id.type === AST_NODE_TYPES.Identifier
          ? callExpression.parent.id.name
          : 'this callback';

      const fix = buildHoistFixes(context, callExpression, callback);

      context.report({
        node: callExpression,
        messageId,
        data: { name: callbackName },
        fix,
      });
    }

    return {
      CallExpression(node) {
        if (isTest) return;
        const { callee } = node;

        if (
          callee.type !== AST_NODE_TYPES.Identifier &&
          callee.type !== AST_NODE_TYPES.MemberExpression
        ) {
          return;
        }

        if (isUseCallbackCallee(callee)) {
          if (!hasEmptyDependencyArray(node)) {
            return;
          }
          reportIfStaticCallback(node, 'preferUtilityFunction');
          return;
        }

        if (ignoreUseLatestCallback) return;
        if (isUseLatestCallbackCallee(callee)) {
          reportIfStaticCallback(node, 'preferUtilityLatest');
        }
      },
    };
  },
});

export default noEmptyDependencyUseCallbacks;
