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
    !parent.computed &&
    !parent.shorthand
  ) {
    return true;
  }
  return false;
}

function collectNearestBlockTypeBindings(
  node: TSESTree.Node,
): Set<string> {
  const localTypes = new Set<string>();
  let current: TSESTree.Node | undefined = node.parent ?? undefined;

  const addTypeParameters = (
    maybeNode: TSESTree.Node | undefined,
  ): void => {
    if (!maybeNode) return;
    const typeParameters = (
      maybeNode as {
        typeParameters?:
          | TSESTree.TSTypeParameterDeclaration
          | TSESTree.TSTypeParameterInstantiation;
      }
    ).typeParameters;

    if (
      typeParameters &&
      typeParameters.type === AST_NODE_TYPES.TSTypeParameterDeclaration
    ) {
      for (const param of typeParameters.params) {
        const name =
          typeof param.name === 'string' ? param.name : param.name.name;
        localTypes.add(name);
      }
    }
  };

  while (current) {
    addTypeParameters(current);
    if (current.type === AST_NODE_TYPES.BlockStatement) {
      for (const statement of current.body) {
        if (
          statement.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
          statement.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
          statement.type === AST_NODE_TYPES.ClassDeclaration
        ) {
          localTypes.add(statement.id.name);
        }
      }
    }
    if (current.type === AST_NODE_TYPES.Program) {
      break;
    }
    current = current.parent ?? undefined;
  }

  return localTypes;
}

function usesLocalTypeBindings(
  typeRoots: TSESTree.Node[],
  localTypes: Set<string>,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  if (!typeRoots.length || localTypes.size === 0) {
    return false;
  }
  const visitorKeys = sourceCode.visitorKeys;
  const stack = [...typeRoots];

  while (stack.length) {
    const current = stack.pop() as TSESTree.Node;
    if (current.type === AST_NODE_TYPES.Identifier && localTypes.has(current.name)) {
      return true;
    }
    if (current.type === AST_NODE_TYPES.TSQualifiedName) {
      let left: TSESTree.EntityName = current.left;
      while (left.type === AST_NODE_TYPES.TSQualifiedName) {
        left = left.left;
      }
      if (left.type === AST_NODE_TYPES.Identifier && localTypes.has(left.name)) {
        return true;
      }
      stack.push(current.right);
      continue;
    }
    const keys = visitorKeys[current.type];
    if (!keys) continue;
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const element of value) {
          if (element && typeof (element as TSESTree.Node).type === 'string') {
            stack.push(element as TSESTree.Node);
          }
        }
      } else if (value && typeof (value as TSESTree.Node).type === 'string') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return false;
}

function collectBodyTypeAnnotations(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): TSESTree.Node[] {
  const typeNodes: TSESTree.Node[] = [];
  const visitorKeys = sourceCode.visitorKeys;
  const stack = [node];

  while (stack.length) {
    const current = stack.pop() as TSESTree.Node;

    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression
    ) {
      typeNodes.push(current.typeAnnotation);
    } else if (current.type === AST_NODE_TYPES.TSTypeAssertion) {
      typeNodes.push(current.typeAnnotation);
    }

    const typeAnnotation = (current as { typeAnnotation?: TSESTree.Node }).typeAnnotation;
    if (typeAnnotation) {
      if (typeAnnotation.type === AST_NODE_TYPES.TSTypeAnnotation) {
        typeNodes.push(typeAnnotation.typeAnnotation);
      } else {
        typeNodes.push(typeAnnotation);
      }
    }

    const typeParameters = (current as {
      typeParameters?: TSESTree.TSTypeParameterDeclaration | TSESTree.TSTypeParameterInstantiation;
    }).typeParameters;
    if (typeParameters) {
      typeNodes.push(typeParameters);
    }

    const returnType = (current as { returnType?: TSESTree.Node }).returnType;
    if (returnType) {
      typeNodes.push(returnType);
    }

    const keys = visitorKeys[current.type];
    if (!keys) continue;
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const element of value) {
          if (element && typeof (element as TSESTree.Node).type === 'string') {
            stack.push(element as TSESTree.Node);
          }
        }
      } else if (value && typeof (value as TSESTree.Node).type === 'string') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return typeNodes;
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
  const normalized = filename.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? normalized;
  return patterns.some(
    (pattern) =>
      minimatch(normalized, pattern) || minimatch(basename, pattern),
  );
}

function usesThisOrSuper(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  const visitorKeys = sourceCode.visitorKeys;
  const stack = [node];

  while (stack.length) {
    const current = stack.pop() as TSESTree.Node;
    if (
      current.type === AST_NODE_TYPES.ThisExpression ||
      current.type === AST_NODE_TYPES.Super
    ) {
      return true;
    }
    const keys = visitorKeys[current.type];
    if (!keys) continue;
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const element of value) {
          if (element && typeof (element as TSESTree.Node).type === 'string') {
            stack.push(element as TSESTree.Node);
          }
        }
      } else if (value && typeof (value as TSESTree.Node).type === 'string') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return false;
}

function analyzeExternalReferences(
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): { hasComponentScopeRef: boolean } {
  const sourceCode = context.getSourceCode();
  let hasComponentScopeRef = usesThisOrSuper(fn.body, sourceCode);
  const scopeManager = sourceCode.scopeManager;
  if (!scopeManager) {
    return { hasComponentScopeRef: true };
  }
  const scope = scopeManager.acquire(fn, true) ?? scopeManager.acquire(fn);
  if (!scope) {
    return { hasComponentScopeRef: true };
  }

  if (!hasComponentScopeRef) {
    for (const ref of scope.through) {
      const identifier = ref.identifier;
      if (isPropertyKey(identifier.parent, identifier)) {
        continue;
      }
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
  }

  if (!hasComponentScopeRef) {
    const typeRoots: TSESTree.Node[] = [];
    if (fn.returnType) {
      typeRoots.push(fn.returnType.typeAnnotation);
    }
    if (fn.typeParameters) {
      typeRoots.push(fn.typeParameters);
    }
    for (const param of fn.params) {
      if ('typeAnnotation' in param && param.typeAnnotation) {
        typeRoots.push(param.typeAnnotation.typeAnnotation);
      } else if (
        param.type === AST_NODE_TYPES.AssignmentPattern &&
        'typeAnnotation' in param.left &&
        param.left.typeAnnotation
      ) {
        typeRoots.push(param.left.typeAnnotation.typeAnnotation);
      }
    }

    typeRoots.push(...collectBodyTypeAnnotations(fn.body, sourceCode));

    if (typeRoots.some((typeRoot) => usesThisOrSuper(typeRoot, sourceCode))) {
      hasComponentScopeRef = true;
    }

    if (!hasComponentScopeRef) {
      const localTypes = collectNearestBlockTypeBindings(fn);
      if (
        localTypes.size > 0 &&
        usesLocalTypeBindings(typeRoots, localTypes, sourceCode)
      ) {
        hasComponentScopeRef = true;
      }
    }
  }

  return { hasComponentScopeRef };
}

function getProgramNode(node: TSESTree.Node): TSESTree.Program | null {
  let current: TSESTree.Node | undefined = node;
  while (current && current.type !== AST_NODE_TYPES.Program) {
    current = current.parent ?? undefined;
  }
  return current?.type === AST_NODE_TYPES.Program ? current : null;
}

function collectPatternIdentifiers(
  pattern:
    | TSESTree.BindingName
    | TSESTree.AssignmentPattern
    | TSESTree.RestElement,
  names: Set<string>,
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      names.add(pattern.name);
      return;
    case AST_NODE_TYPES.ObjectPattern:
      for (const property of pattern.properties) {
        if (property.type === AST_NODE_TYPES.Property) {
          collectPatternIdentifiers(
            property.value as TSESTree.BindingName,
            names,
          );
        } else if (property.type === AST_NODE_TYPES.RestElement) {
          collectPatternIdentifiers(
            property.argument as TSESTree.BindingName,
            names,
          );
        }
      }
      return;
    case AST_NODE_TYPES.ArrayPattern:
      for (const element of pattern.elements) {
        if (!element) continue;
        if (element.type === AST_NODE_TYPES.RestElement) {
          collectPatternIdentifiers(
            element.argument as TSESTree.BindingName,
            names,
          );
        } else {
          collectPatternIdentifiers(element as TSESTree.BindingName, names);
        }
      }
      return;
    case AST_NODE_TYPES.RestElement:
      collectPatternIdentifiers(
        pattern.argument as TSESTree.BindingName,
        names,
      );
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      collectPatternIdentifiers(pattern.left, names);
      return;
  }
}

function getModuleScopeValueBindings(program: TSESTree.Program): Set<string> {
  const names = new Set<string>();

  for (const statement of program.body) {
    const target =
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration ||
      statement.type === AST_NODE_TYPES.ExportDefaultDeclaration
        ? statement.declaration
        : statement;

    if (!target) continue;

    if (target.type === AST_NODE_TYPES.ImportDeclaration) {
      for (const specifier of target.specifiers) {
        names.add(specifier.local.name);
      }
      continue;
    }

    if (target.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declaration of target.declarations) {
        collectPatternIdentifiers(declaration.id, names);
      }
      continue;
    }

    if (
      target.type === AST_NODE_TYPES.FunctionDeclaration ||
      target.type === AST_NODE_TYPES.ClassDeclaration ||
      target.type === AST_NODE_TYPES.TSEnumDeclaration
    ) {
      if (target.id) {
        names.add(target.id.name);
      }
    }
  }

  return names;
}

function buildHoistFixes(
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  callExpression: TSESTree.CallExpression,
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  moduleBindingsCache: WeakMap<TSESTree.Program, Set<string>>,
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

  const programNode = getProgramNode(hoistTarget);
  if (programNode) {
    const cachedBindings = moduleBindingsCache.get(programNode);
    const moduleBindings =
      cachedBindings ?? getModuleScopeValueBindings(programNode);
    if (!cachedBindings) {
      moduleBindingsCache.set(programNode, moduleBindings);
    }
    if (moduleBindings.has(declarator.id.name)) {
      return null;
    }
  }

  const sourceCode = context.getSourceCode();
  const identifierText = sourceCode.getText(declarator.id);
  const functionText = sourceCode.getText(callback);
  const hoisted = `const ${identifierText} = ${functionText};\n`;
  const fileText = sourceCode.getText();
  let removeStart = varDecl.range[0];
  const lineStart = fileText.lastIndexOf('\n', removeStart - 1) + 1;
  const leadingSegment = fileText.slice(lineStart, removeStart);
  const hasOnlyIndentBefore = /^[ \t]*$/.test(leadingSegment);
  if (hasOnlyIndentBefore) {
    removeStart = lineStart;
  }

  let removeEnd = varDecl.range[1];
  const lineEnd = fileText.indexOf('\n', removeEnd);
  const segmentEnd = lineEnd === -1 ? fileText.length : lineEnd;
  const trailingSegment = fileText.slice(removeEnd, segmentEnd);
  const hasOnlyWhitespaceAfter = /^[ \t]*$/.test(trailingSegment);
  if (hasOnlyWhitespaceAfter) {
    removeEnd = segmentEnd;
  }

  if (hasOnlyIndentBefore && hasOnlyWhitespaceAfter && lineEnd !== -1) {
    removeEnd = lineEnd + 1;
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
        'What\'s wrong: "{{name}}" uses useCallback([]) but never reads component/hook state -> Why it matters: empty-deps callbacks are already stable, so hook bookkeeping adds overhead without benefit -> How to fix: move "{{name}}" to a module-level utility (or add an eslint-disable with a short justification if you intentionally keep it for memoized children).',
      preferUtilityLatest:
        'What\'s wrong: useLatestCallback wraps "{{name}}" even though it never reads component/hook state -> Why it matters: the hook wrapper adds indirection without preventing stale closures -> How to fix: extract "{{name}}" to a module-level utility (or disable with a brief note if you rely on HMR or a stale-closure pattern).',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const [options] = context.options;
    const ignoreTestFiles = options?.ignoreTestFiles !== false;
    const testPatterns = options?.testFilePatterns ?? DEFAULT_TEST_PATTERNS;
    const ignoreUseLatestCallback = options?.ignoreUseLatestCallback === true;
    const moduleBindingsCache = new WeakMap<TSESTree.Program, Set<string>>();

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

      const fix = buildHoistFixes(
        context,
        callExpression,
        callback,
        moduleBindingsCache,
      );

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
