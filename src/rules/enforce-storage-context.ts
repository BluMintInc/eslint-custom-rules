import path from 'path';
import { minimatch } from 'minimatch';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type StorageKind = 'localStorage' | 'sessionStorage';

type RuleOptions = [
  {
    allowInTests?: boolean;
    allow?: string[];
  }?,
];

type MessageIds = 'useStorageContext';
type AliasEntry = StorageKind | 'shadowed';
type AliasStack = Array<Map<string, AliasEntry>>;

type AliasState = {
  stack: AliasStack;
  currentScope: () => Map<string, AliasEntry>;
  pushScope: (kind?: 'function' | 'block') => void;
  popScope: () => void;
  reset: () => void;
  setAliasInExistingBindingScope: (name: string, value: AliasEntry) => void;
  setAlias: (
    name: string,
    value: AliasEntry,
    options?: { hoistToFunctionScope?: boolean },
  ) => void;
  markShadowed: (
    name: string,
    options?: { hoistToFunctionScope?: boolean },
  ) => void;
};

type ReportUsage = (
  node: TSESTree.Node,
  storage: StorageKind,
  accessType: string,
) => void;

const STORAGE_NAMES = new Set<StorageKind>(['localStorage', 'sessionStorage']);
const GLOBAL_NAMES = new Set(['window', 'global', 'globalThis']);
const CONTEXT_BASENAMES = new Set(['LocalStorage.tsx', 'SessionStorage.tsx']);
const TEST_FILE_REGEX = /\.(test|spec)\.[jt]sx?$/i;

const isParenthesizedExpression = (
  node: TSESTree.Node,
): node is TSESTree.Node & { expression: TSESTree.Expression } =>
  (node as { type?: string }).type === 'ParenthesizedExpression';

const isChainExpression = (
  node: TSESTree.Node,
): node is TSESTree.Node & { expression: TSESTree.Expression } =>
  (node as { type?: string }).type === 'ChainExpression';

const createAliasState = (): AliasState => {
  const stack: AliasStack = [new Map()];
  const scopeKinds: Array<'function' | 'block'> = ['function'];
  const currentScope = () => stack[stack.length - 1];
  const pushScope = (kind: 'function' | 'block' = 'block') => {
    stack.push(new Map());
    scopeKinds.push(kind);
  };
  const popScope = () => {
    if (stack.length > 1) {
      stack.pop();
      scopeKinds.pop();
    }
  };
  const findFunctionScope = (): Map<string, AliasEntry> => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (scopeKinds[i] === 'function') {
        return stack[i];
      }
    }
    return stack[0];
  };
  const setAlias = (
    name: string,
    value: AliasEntry,
    options?: { hoistToFunctionScope?: boolean },
  ) => {
    const targetScope = options?.hoistToFunctionScope
      ? findFunctionScope()
      : currentScope();

    targetScope.set(name, value);
  };
  const setAliasInExistingBindingScope = (name: string, value: AliasEntry) => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].has(name)) {
        stack[i].set(name, value);
        return;
      }
    }

    if (STORAGE_NAMES.has(name as StorageKind) || GLOBAL_NAMES.has(name)) {
      /**
       * Avoid synthesizing a new binding for global storage identifiers; treating
       * the assignment as a shadow creates false negatives for later accesses.
       */
      return;
    }

    setAlias(name, value);
  };
  const markShadowed = (
    name: string,
    options?: { hoistToFunctionScope?: boolean },
  ) => setAlias(name, 'shadowed', options);
  const reset = () => {
    stack.length = 1;
    scopeKinds.length = 1;
    scopeKinds[0] = 'function';
    stack[0].clear();
  };

  return {
    stack,
    currentScope,
    pushScope,
    popScope,
    reset,
    setAliasInExistingBindingScope,
    setAlias,
    markShadowed,
  };
};

/**
 * Unwraps TypeScript-only wrappers and parentheses to expose the runtime
 * expression. Storage checks need the underlying value even when the code uses
 * TS assertions, satisfies expressions, non-null assertions, optional chaining,
 * or parentheses that do not change runtime behavior (e.g., `(localStorage as Storage)?.getItem()`).
 */
const unwrapExpression = (
  expression: TSESTree.Expression,
): TSESTree.Expression => {
  let current: TSESTree.Expression = expression;

  while (true) {
    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      current.type === AST_NODE_TYPES.TSTypeAssertion ||
      current.type === AST_NODE_TYPES.TSNonNullExpression
    ) {
      current = current.expression as TSESTree.Expression;
      continue;
    }

    if (isParenthesizedExpression(current)) {
      current = current.expression as TSESTree.Expression;
      continue;
    }

    if (isChainExpression(current)) {
      current = current.expression as TSESTree.Expression;
      continue;
    }

    break;
  }

  return current;
};

const getPropertyName = (
  node: TSESTree.Expression | TSESTree.PrivateIdentifier,
): string | null => {
  const unwrapped =
    node.type === AST_NODE_TYPES.PrivateIdentifier
      ? node
      : unwrapExpression(node);

  if (unwrapped.type === AST_NODE_TYPES.Identifier) return unwrapped.name;
  if (
    unwrapped.type === AST_NODE_TYPES.Literal &&
    typeof unwrapped.value === 'string'
  ) {
    return unwrapped.value;
  }
  return null;
};

const getAliasFromStack = (
  aliases: AliasStack,
  name: string,
): AliasEntry | null => {
  for (let i = aliases.length - 1; i >= 0; i -= 1) {
    const value = aliases[i].get(name);
    if (value !== undefined) return value;
  }
  return null;
};

const checkIfNameShadowsStorage = (
  name: string,
  storageAliases: AliasStack,
  options: { includeCurrentScope?: boolean } = {},
): boolean => {
  const lookupStack = options.includeCurrentScope
    ? storageAliases
    : storageAliases.slice(0, -1);
  const outerAlias = getAliasFromStack(lookupStack, name);
  const shadowsGlobal =
    STORAGE_NAMES.has(name as StorageKind) || GLOBAL_NAMES.has(name);
  const shadowsOuterStorageAlias =
    outerAlias === 'localStorage' || outerAlias === 'sessionStorage';

  return shadowsGlobal || shadowsOuterStorageAlias;
};

const isGlobalLike = (
  node: TSESTree.Expression,
  aliases: AliasStack,
): boolean => {
  const base = unwrapExpression(node);
  if (base.type !== AST_NODE_TYPES.Identifier) return false;

  if (getAliasFromStack(aliases, base.name)) return false;

  return GLOBAL_NAMES.has(base.name);
};

/**
 * Resolves an expression to a storage kind when it ultimately refers to
 * localStorage/sessionStorage. Follows aliases through member access,
 * conditionals, and logical expressions so indirect access like
 * `const s = window?.localStorage` is still caught. Ignores identifiers that are
 * explicitly shadowed within the current lexical scope.
 */
const resolveStorageObject = (
  expression: TSESTree.Expression,
  aliases: AliasStack,
): StorageKind | null => {
  const target = unwrapExpression(expression);

  if (target.type === AST_NODE_TYPES.Identifier) {
    const alias = getAliasFromStack(aliases, target.name);
    if (alias === 'shadowed') return null;
    if (alias) return alias;
    if (STORAGE_NAMES.has(target.name as StorageKind)) {
      return target.name as StorageKind;
    }
    return null;
  }

  if (target.type === AST_NODE_TYPES.MemberExpression) {
    const objectKind = resolveStorageObject(
      target.object as TSESTree.Expression,
      aliases,
    );
    if (objectKind) return objectKind;

    const propertyName = getPropertyName(target.property);
    if (
      propertyName &&
      STORAGE_NAMES.has(propertyName as StorageKind) &&
      isGlobalLike(target.object as TSESTree.Expression, aliases)
    ) {
      return propertyName as StorageKind;
    }
  }

  if (target.type === AST_NODE_TYPES.ConditionalExpression) {
    const consequentKind = resolveStorageObject(
      target.consequent as TSESTree.Expression,
      aliases,
    );
    if (consequentKind) return consequentKind;
    const alternateKind = resolveStorageObject(
      target.alternate as TSESTree.Expression,
      aliases,
    );
    if (alternateKind) return alternateKind;
  }

  if (target.type === AST_NODE_TYPES.LogicalExpression) {
    return (
      resolveStorageObject(target.left as TSESTree.Expression, aliases) ??
      resolveStorageObject(target.right as TSESTree.Expression, aliases)
    );
  }

  return null;
};

const parentMatchesBinding = (
  parent: TSESTree.Node,
  type: AST_NODE_TYPES,
  propertyName?: string,
  value?: TSESTree.Node,
): boolean => {
  if (parent.type !== type) return false;
  if (!propertyName) return true;

  const parentProperty = (parent as unknown as Record<string, unknown>)[
    propertyName
  ];
  if (propertyName === 'params' && Array.isArray(parentProperty)) {
    return parentProperty.includes(value);
  }
  return parentProperty === value;
};

const identifierHasDeclarationParent = (node: TSESTree.Identifier): boolean => {
  const parent = node.parent;
  if (!parent) return false;

  if (
    parent.type === AST_NODE_TYPES.Property &&
    parent.parent?.type === AST_NODE_TYPES.ObjectPattern
  ) {
    return true;
  }
  if (
    parentMatchesBinding(parent, AST_NODE_TYPES.ObjectPattern) ||
    parentMatchesBinding(parent, AST_NODE_TYPES.ArrayPattern) ||
    parentMatchesBinding(
      parent,
      AST_NODE_TYPES.RestElement,
      'argument',
      node,
    ) ||
    parentMatchesBinding(
      parent,
      AST_NODE_TYPES.VariableDeclarator,
      'id',
      node,
    ) ||
    parentMatchesBinding(
      parent,
      AST_NODE_TYPES.AssignmentExpression,
      'left',
      node,
    ) ||
    parentMatchesBinding(
      parent,
      AST_NODE_TYPES.AssignmentPattern,
      'left',
      node,
    ) ||
    parentMatchesBinding(
      parent,
      AST_NODE_TYPES.FunctionDeclaration,
      'id',
      node,
    ) ||
    parentMatchesBinding(
      parent,
      AST_NODE_TYPES.FunctionExpression,
      'id',
      node,
    ) ||
    parentMatchesBinding(parent, AST_NODE_TYPES.ClassExpression, 'id', node) ||
    parentMatchesBinding(parent, AST_NODE_TYPES.CatchClause, 'param', node) ||
    parentMatchesBinding(parent, AST_NODE_TYPES.ClassDeclaration, 'id', node) ||
    parentMatchesBinding(parent, AST_NODE_TYPES.ImportSpecifier) ||
    parentMatchesBinding(parent, AST_NODE_TYPES.ImportDefaultSpecifier) ||
    parentMatchesBinding(parent, AST_NODE_TYPES.ImportNamespaceSpecifier) ||
    parentMatchesBinding(parent, AST_NODE_TYPES.ExportSpecifier) ||
    parentMatchesBinding(parent, AST_NODE_TYPES.TSEnumMember, 'id', node)
  ) {
    return true;
  }

  if (
    parentMatchesBinding(
      parent,
      AST_NODE_TYPES.FunctionDeclaration,
      'params',
      node,
    ) ||
    parentMatchesBinding(
      parent,
      AST_NODE_TYPES.FunctionExpression,
      'params',
      node,
    ) ||
    parentMatchesBinding(
      parent,
      AST_NODE_TYPES.ArrowFunctionExpression,
      'params',
      node,
    )
  ) {
    return true;
  }

  return false;
};

const isObjectLiteralKeyDeclaration = (
  node: TSESTree.Identifier,
  parent: TSESTree.Node,
): boolean => {
  if (parent.type !== AST_NODE_TYPES.Property) return false;
  if (parent.shorthand) return false;

  return parent.key === node;
};

const isClassMemberKeyDeclaration = (
  node: TSESTree.Identifier,
  parent: TSESTree.Node,
): boolean =>
  (parent.type === AST_NODE_TYPES.MethodDefinition ||
    parent.type === AST_NODE_TYPES.PropertyDefinition) &&
  parent.key === node;

const isTypeScriptDeclarationIdentifier = (
  node: TSESTree.Identifier,
  parent: TSESTree.Node,
): boolean =>
  (parent.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
    parent.id === node) ||
  (parent.type === AST_NODE_TYPES.TSInterfaceDeclaration &&
    parent.id === node) ||
  (parent.type === AST_NODE_TYPES.TSEnumDeclaration && parent.id === node) ||
  (parent.type === AST_NODE_TYPES.TSEnumMember && parent.id === node) ||
  (parent.type === AST_NODE_TYPES.TSModuleDeclaration && parent.id === node);

const isLabelIdentifier = (
  node: TSESTree.Identifier,
  parent: TSESTree.Node,
): boolean =>
  (parent.type === AST_NODE_TYPES.LabeledStatement && parent.label === node) ||
  ((parent.type === AST_NODE_TYPES.BreakStatement ||
    parent.type === AST_NODE_TYPES.ContinueStatement) &&
    parent.label === node);

/**
 * Distinguishes declaration sites (bindings) from usage sites. The rule reports
 * reads of storage, not the act of declaring a variable/property/parameter, so
 * declarations across destructuring, params, imports, class members, and
 * assignment targets must be ignored.
 */
const identifierRepresentsDeclaration = (
  node: TSESTree.Identifier,
): boolean => {
  const parent = node.parent;
  if (!parent) return false;

  if (identifierHasDeclarationParent(node)) {
    return true;
  }
  if (isObjectLiteralKeyDeclaration(node, parent)) return true;
  if (isClassMemberKeyDeclaration(node, parent)) return true;
  if (isTypeScriptDeclarationIdentifier(node, parent)) return true;

  return isLabelIdentifier(node, parent);
};

const isVarBinding = (node: TSESTree.Identifier): boolean => {
  let child: TSESTree.Node = node;
  let parent: TSESTree.Node | null = node.parent ?? null;

  while (parent) {
    if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
      if (parent.init === child) return false;
      const declaration =
        parent.parent?.type === AST_NODE_TYPES.VariableDeclaration
          ? parent.parent
          : null;
      return declaration?.kind === 'var';
    }
    child = parent;
    parent = (parent.parent as TSESTree.Node | null) ?? null;
  }

  return false;
};

const isMemberExpressionObject = (node: TSESTree.Identifier): boolean => {
  const parent = node.parent;
  return (
    !!parent &&
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === node
  );
};

const isStorageContainerSource = (
  init: TSESTree.Expression,
  aliases: AliasStack,
): boolean => {
  const source = unwrapExpression(init);

  if (isGlobalLike(source, aliases)) return true;

  if (source.type === AST_NODE_TYPES.MemberExpression) {
    if (resolveStorageObject(source, aliases)) return true;
    return isGlobalLike(source.object as TSESTree.Expression, aliases);
  }

  return false;
};

/**
 * Registers aliases introduced via object destructuring of storage containers
 * (e.g., `const { localStorage: store } = window`). The callback fires at the
 * destructuring site so violations point to the extraction point. Aliases are
 * stored on the current lexical scope to avoid leaking across nested scopes.
 */
const recordAliasFromPattern = (
  pattern: TSESTree.ObjectPattern,
  init: TSESTree.Expression | null,
  aliases: AliasStack,
  setAlias: (name: string, storageKind: StorageKind) => void,
  reportStorageProperty?: (
    node: TSESTree.Node,
    storageKind: StorageKind,
    accessType: string,
  ) => void,
): void => {
  if (!init) return;
  if (!isStorageContainerSource(init, aliases)) return;

  for (const prop of pattern.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;
    if (prop.computed) continue;

    const keyName = getPropertyName(prop.key);
    if (!keyName || !STORAGE_NAMES.has(keyName as StorageKind)) continue;

    reportStorageProperty?.(
      prop.key,
      keyName as StorageKind,
      `property "${keyName}"`,
    );

    if (prop.value.type === AST_NODE_TYPES.Identifier) {
      setAlias(prop.value.name, keyName as StorageKind);
    } else if (
      prop.value.type === AST_NODE_TYPES.AssignmentPattern &&
      prop.value.left.type === AST_NODE_TYPES.Identifier
    ) {
      setAlias(prop.value.left.name, keyName as StorageKind);
    }
  }
};

const shouldIgnoreFile = (
  filename: string,
  options: RuleOptions[0] | undefined,
): boolean => {
  const normalizedFilename = filename.replace(/\\/g, '/');
  const base = path.basename(normalizedFilename);
  if (CONTEXT_BASENAMES.has(base)) return true;

  const allowInTests = options?.allowInTests ?? true;
  const isTestFile =
    TEST_FILE_REGEX.test(normalizedFilename) ||
    /(^|\/)__mocks__(\/|$)/.test(normalizedFilename);

  if (allowInTests && isTestFile) return true;

  const allowPatterns = options?.allow ?? [];
  const normalizedAllowPatterns = allowPatterns.map((pattern) =>
    pattern.replace(/\\/g, '/'),
  );

  return normalizedAllowPatterns.some((pattern) =>
    minimatch(normalizedFilename, pattern, { windowsPathsNoEscape: true }),
  );
};

const createUsageReporter = (
  context: Readonly<TSESLint.RuleContext<MessageIds, RuleOptions>>,
): ReportUsage => {
  const reportedNodes = new WeakSet<TSESTree.Node>();
  const reportedLocations = new Set<string>();

  return (node, storage, accessType) => {
    const locationKey = node.range ? `${node.range[0]}:${node.range[1]}` : null;
    if (locationKey && reportedLocations.has(locationKey)) return;
    if (locationKey) reportedLocations.add(locationKey);
    if (reportedNodes.has(node)) return;
    reportedNodes.add(node);
    const hook =
      storage === 'localStorage' ? 'useLocalStorage' : 'useSessionStorage';
    context.report({
      node,
      messageId: 'useStorageContext',
      data: {
        storage,
        accessType,
        hook,
      },
    });
  };
};

const createIdentifierHandler = (
  aliases: AliasState,
  storageAliases: AliasStack,
  reportUsage: ReportUsage,
): ((node: TSESTree.Identifier) => void) => {
  return (node) => {
    const parent = node.parent;
    if (identifierRepresentsDeclaration(node)) {
      const hoistToFunctionScope = isVarBinding(node);
      const existingAlias = getAliasFromStack(storageAliases, node.name);
      const isAssignmentTarget =
        parent?.type === AST_NODE_TYPES.AssignmentExpression &&
        parent.left === node;
      if (
        isAssignmentTarget &&
        !existingAlias &&
        (STORAGE_NAMES.has(node.name as StorageKind) ||
          GLOBAL_NAMES.has(node.name))
      ) {
        /**
         * Ignore assignments to global storage identifiers without an existing
         * local binding. Treating them as declarations would shadow the global
         * object and mask subsequent violations.
         */
        return;
      }
      if (
        existingAlias === 'localStorage' ||
        existingAlias === 'sessionStorage'
      ) {
        /**
         * Preserve existing aliases introduced earlier in the traversal
         * (e.g., destructuring) so later declaration-node visits do not
         * override them as shadowed bindings.
         */
        return;
      }
      if (
        parent?.type === AST_NODE_TYPES.ClassExpression &&
        parent.id === node
      ) {
        /**
         * Class expression names are only bound to the class body and should not
         * be treated as shadowing outer scope storage references.
         */
        return;
      }
      if (
        identifierHasDeclarationParent(node) &&
        !aliases.currentScope().has(node.name)
      ) {
        const shadowsStorage = checkIfNameShadowsStorage(
          node.name,
          storageAliases,
        );
        if (shadowsStorage) {
          aliases.markShadowed(node.name, { hoistToFunctionScope });
        }
      }
      return;
    }
    const storageKind = resolveStorageObject(node, storageAliases);
    if (!storageKind) return;
    if (isMemberExpressionObject(node)) return;
    if (
      node.parent &&
      node.parent.type === AST_NODE_TYPES.MemberExpression &&
      node.parent.property === node
    )
      return;

    reportUsage(node, storageKind, 'reference');
  };
};

const createMemberExpressionHandler = (
  storageAliases: AliasStack,
  reportUsage: ReportUsage,
): ((node: TSESTree.MemberExpression) => void) => {
  return (node) => {
    const object = node.object as TSESTree.Expression;
    const isAssignmentTarget =
      node.parent?.type === AST_NODE_TYPES.AssignmentExpression &&
      node.parent.left === node;

    if (isAssignmentTarget) {
      return;
    }

    const storageKind = resolveStorageObject(object, storageAliases);

    if (storageKind) {
      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.CallExpression &&
        node.parent.callee === node
      ) {
        return;
      }

      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.MemberExpression &&
        node.parent.object === node
      ) {
        return;
      }

      const propName = getPropertyName(node.property);
      reportUsage(
        node,
        storageKind,
        propName ? `property "${propName}"` : 'property access',
      );
      return;
    }

    const propertyName = getPropertyName(node.property);
    if (
      propertyName &&
      STORAGE_NAMES.has(propertyName as StorageKind) &&
      isGlobalLike(object, storageAliases)
    ) {
      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.MemberExpression &&
        node.parent.object === node
      ) {
        return;
      }

      reportUsage(node.property, propertyName as StorageKind, 'reference');
    }
  };
};

const createCallExpressionHandler = (
  storageAliases: AliasStack,
  reportUsage: ReportUsage,
): ((node: TSESTree.CallExpression) => void) => {
  return (node) => {
    const callee = unwrapExpression(node.callee as TSESTree.Expression);
    if (callee.type !== AST_NODE_TYPES.MemberExpression) return;

    const storageKind = resolveStorageObject(
      callee.object as TSESTree.Expression,
      storageAliases,
    );
    if (!storageKind) return;

    const propName = getPropertyName(callee.property);
    reportUsage(
      callee.property,
      storageKind,
      propName ? `method "${propName}"` : 'storage method',
    );
  };
};

const createVariableDeclaratorHandler = (
  aliases: AliasState,
  storageAliases: AliasStack,
  reportUsage: ReportUsage,
): ((node: TSESTree.VariableDeclarator) => void) => {
  return (node) => {
    const declaration =
      node.parent && node.parent.type === AST_NODE_TYPES.VariableDeclaration
        ? node.parent
        : null;
    const hoistToFunctionScope = declaration?.kind === 'var';

    if (node.id.type === AST_NODE_TYPES.Identifier) {
      const storageKind = node.init
        ? resolveStorageObject(node.init as TSESTree.Expression, storageAliases)
        : null;
      if (storageKind) {
        aliases.setAlias(node.id.name, storageKind, { hoistToFunctionScope });
      } else {
        const shadowsStorage = checkIfNameShadowsStorage(
          node.id.name,
          storageAliases,
          {
            includeCurrentScope: true,
          },
        );
        if (shadowsStorage) {
          aliases.markShadowed(node.id.name, { hoistToFunctionScope });
        }
      }
    } else if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
      const initExpr = (node.init as TSESTree.Expression | null) ?? null;
      recordAliasFromPattern(
        node.id,
        initExpr,
        storageAliases,
        (name, storageKind) =>
          aliases.setAlias(name, storageKind, { hoistToFunctionScope }),
        (propertyNode, storageKind, accessType) => {
          reportUsage(propertyNode, storageKind, accessType);
        },
      );
    }
  };
};

const createAssignmentExpressionHandler = (
  aliases: AliasState,
  storageAliases: AliasStack,
  reportUsage: ReportUsage,
): ((node: TSESTree.AssignmentExpression) => void) => {
  return (node) => {
    if (node.left.type === AST_NODE_TYPES.Identifier) {
      const right = node.right as TSESTree.Expression;
      const storageKind = resolveStorageObject(right, storageAliases);
      if (storageKind) {
        aliases.setAliasInExistingBindingScope(node.left.name, storageKind);
      } else {
        const shadowsStorage = checkIfNameShadowsStorage(
          node.left.name,
          storageAliases,
          {
            includeCurrentScope: true,
          },
        );
        if (shadowsStorage) {
          aliases.setAliasInExistingBindingScope(node.left.name, 'shadowed');
        }
      }
    } else if (node.left.type === AST_NODE_TYPES.ObjectPattern) {
      recordAliasFromPattern(
        node.left,
        node.right as TSESTree.Expression,
        storageAliases,
        (name, storageKind) =>
          aliases.setAliasInExistingBindingScope(name, storageKind),
        (propertyNode, storageKind, accessType) => {
          reportUsage(propertyNode, storageKind, accessType);
        },
      );
    }
  };
};

const createScopeListeners = (
  aliases: AliasState,
  storageAliases: AliasStack,
): TSESLint.RuleListener => ({
  Program: aliases.reset,
  BlockStatement: () => aliases.pushScope(),
  'BlockStatement:exit': aliases.popScope,
  TSModuleBlock: () => aliases.pushScope(),
  'TSModuleBlock:exit': aliases.popScope,
  ClassBody: (node: TSESTree.ClassBody) => {
    const parent = node.parent;
    if (
      parent?.type === AST_NODE_TYPES.ClassDeclaration &&
      parent.id &&
      checkIfNameShadowsStorage(parent.id.name, storageAliases, {
        includeCurrentScope: true,
      })
    ) {
      aliases.setAlias(parent.id.name, 'shadowed');
    }

    aliases.pushScope();

    if (
      parent?.type === AST_NODE_TYPES.ClassExpression &&
      parent.id &&
      checkIfNameShadowsStorage(parent.id.name, storageAliases, {
        includeCurrentScope: true,
      })
    ) {
      aliases.setAlias(parent.id.name, 'shadowed');
    }
  },
  'ClassBody:exit': aliases.popScope,
  StaticBlock: () => aliases.pushScope(),
  'StaticBlock:exit': aliases.popScope,
  SwitchStatement: () => aliases.pushScope(),
  'SwitchStatement:exit': aliases.popScope,
  ForStatement: () => aliases.pushScope(),
  'ForStatement:exit': aliases.popScope,
  ForInStatement: () => aliases.pushScope(),
  'ForInStatement:exit': aliases.popScope,
  ForOfStatement: () => aliases.pushScope(),
  'ForOfStatement:exit': aliases.popScope,
  CatchClause: () => aliases.pushScope(),
  'CatchClause:exit': aliases.popScope,
  FunctionDeclaration: (node: TSESTree.FunctionDeclaration) => {
    if (node.id) {
      const name = node.id.name;
      if (
        checkIfNameShadowsStorage(name, storageAliases, {
          includeCurrentScope: true,
        })
      ) {
        aliases.setAlias(name, 'shadowed');
      }
    }
    aliases.pushScope('function');
  },
  'FunctionDeclaration:exit': aliases.popScope,
  FunctionExpression: () => aliases.pushScope('function'),
  'FunctionExpression:exit': aliases.popScope,
  ArrowFunctionExpression: () => aliases.pushScope('function'),
  'ArrowFunctionExpression:exit': aliases.popScope,
});

const createStorageVisitors = (
  aliases: AliasState,
  reportUsage: ReportUsage,
): TSESLint.RuleListener => {
  const storageAliases = aliases.stack;

  return {
    ...createScopeListeners(aliases, storageAliases),
    Identifier: createIdentifierHandler(aliases, storageAliases, reportUsage),
    MemberExpression: createMemberExpressionHandler(
      storageAliases,
      reportUsage,
    ),
    CallExpression: createCallExpressionHandler(storageAliases, reportUsage),
    VariableDeclarator: createVariableDeclaratorHandler(
      aliases,
      storageAliases,
      reportUsage,
    ),
    AssignmentExpression: createAssignmentExpressionHandler(
      aliases,
      storageAliases,
      reportUsage,
    ),
  };
};

export const enforceStorageContext = createRule<RuleOptions, MessageIds>({
  name: 'enforce-storage-context',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require storage access to go through the LocalStorage and SessionStorage context providers instead of direct browser APIs',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          allowInTests: {
            type: 'boolean',
            default: true,
          },
          allow: {
            type: 'array',
            items: { type: 'string' },
            default: [],
            description:
              'Glob patterns that permit direct storage access (normalized to forward slashes) so polyfills and approved shims can bypass the context providers.',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useStorageContext:
        "What's wrong: Direct {{storage}} {{accessType}} bypasses the LocalStorage/SessionStorage context providers.\n\nWhy it matters: (1) UI will not re-render when storage changes because React state is never updated, (2) code can crash during server-side rendering when `window` is undefined, and (3) storage errors go unhandled and break user flows.\n\nHow to fix: Call {{hook}}() at the component top level and use its returned methods (getItem, setItem, removeItem, clear) instead of accessing {{storage}} directly.",
    },
  },
  defaultOptions: [{}],
  create(context) {
    const filename =
      (context as unknown as { filename?: string }).filename ??
      context.getFilename?.() ??
      '';
    const [options] = context.options;

    if (shouldIgnoreFile(filename, options)) {
      return {};
    }

    const aliases = createAliasState();
    const reportUsage = createUsageReporter(context);

    return createStorageVisitors(aliases, reportUsage);
  },
});
