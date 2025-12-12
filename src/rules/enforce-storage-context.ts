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
  const setAlias = (
    name: string,
    value: AliasEntry,
    options?: { hoistToFunctionScope?: boolean },
  ) => {
    if (options?.hoistToFunctionScope) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        stack[i].set(name, value);
        if (scopeKinds[i] === 'function') {
          break;
        }
      }
      return;
    }

    currentScope().set(name, value);
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
const unwrapExpression = (expression: TSESTree.Expression): TSESTree.Expression => {
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
  if (node.type === AST_NODE_TYPES.Identifier) return node.name;
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
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
    parent.type === AST_NODE_TYPES.ObjectPattern ||
    parent.type === AST_NODE_TYPES.ArrayPattern
  ) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.RestElement &&
    parent.argument === node
  ) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id === node) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.left === node
  ) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.FunctionDeclaration && parent.id === node) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.FunctionExpression && parent.id === node) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.ClassExpression && parent.id === node) {
    return true;
  }
  if (
    (parent.type === AST_NODE_TYPES.FunctionDeclaration ||
      parent.type === AST_NODE_TYPES.FunctionExpression ||
      parent.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
    parent.params.includes(node)
  ) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.CatchClause && parent.param === node) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.ClassDeclaration && parent.id === node) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.ImportSpecifier) return true;
  if (parent.type === AST_NODE_TYPES.ImportDefaultSpecifier) return true;
  if (parent.type === AST_NODE_TYPES.ImportNamespaceSpecifier) return true;
  return false;
};

/**
 * Distinguishes declaration sites (bindings) from usage sites. The rule reports
 * reads of storage, not the act of declaring a variable/property/parameter, so
 * declarations across destructuring, params, imports, class members, and
 * assignment targets must be ignored.
 */
const identifierRepresentsDeclaration = (node: TSESTree.Identifier): boolean => {
  const parent = node.parent;
  if (!parent) return false;

  if (identifierHasDeclarationParent(node)) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.Property) {
    // For object literals, shorthand properties are runtime reads; non-shorthand
    // keys are just property names and should not be treated as storage usage.
    if (parent.shorthand) return false;
    if (parent.key === node) return true;
  }
  if (
    (parent.type === AST_NODE_TYPES.MethodDefinition ||
      parent.type === AST_NODE_TYPES.PropertyDefinition) &&
    parent.key === node
  ) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.AssignmentPattern &&
    parent.left === node
  ) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.TSTypeAliasDeclaration && parent.id === node) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.TSInterfaceDeclaration && parent.id === node) {
    return true;
  }

  return false;
};

const getVariableDeclarationKind = (
  node: TSESTree.Identifier,
): TSESTree.VariableDeclaration['kind'] | null => {
  let current: TSESTree.Node | null = node.parent ?? null;

  while (current) {
    if (current.type === AST_NODE_TYPES.VariableDeclaration) {
      return current.kind;
    }
    current = (current.parent as TSESTree.Node | null) ?? null;
  }

  return null;
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
  return allowPatterns.some((pattern) => minimatch(normalizedFilename, pattern));
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
      const declarationKind = getVariableDeclarationKind(node);
      const hoistToFunctionScope = declarationKind === 'var';
      if (
        parent?.type === AST_NODE_TYPES.ClassExpression &&
        parent.id === node
      ) {
        return;
      }
      if (identifierHasDeclarationParent(node) && !aliases.currentScope().has(node.name)) {
        const outerAlias = getAliasFromStack(storageAliases.slice(0, -1), node.name);
        const shadowsGlobal =
          STORAGE_NAMES.has(node.name as StorageKind) ||
          GLOBAL_NAMES.has(node.name);
        const shadowsOuterStorageAlias =
          outerAlias === 'localStorage' || outerAlias === 'sessionStorage';

        if (shadowsGlobal || shadowsOuterStorageAlias) {
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
        const shadowsGlobal =
          STORAGE_NAMES.has(node.id.name as StorageKind) ||
          GLOBAL_NAMES.has(node.id.name);
        if (shadowsGlobal) {
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
        aliases.setAlias(node.left.name, storageKind);
      } else {
        const existing = getAliasFromStack(storageAliases, node.left.name);
        const isStorageOrGlobalName =
          STORAGE_NAMES.has(node.left.name as StorageKind) ||
          GLOBAL_NAMES.has(node.left.name);
        if (
          isStorageOrGlobalName ||
          existing === 'localStorage' ||
          existing === 'sessionStorage'
        ) {
          aliases.markShadowed(node.left.name);
        }
      }
    } else if (node.left.type === AST_NODE_TYPES.ObjectPattern) {
      recordAliasFromPattern(
        node.left,
        node.right as TSESTree.Expression,
        storageAliases,
        (name, storageKind) => aliases.setAlias(name, storageKind),
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
  BlockStatement: (_node: TSESTree.BlockStatement) => aliases.pushScope(),
  'BlockStatement:exit': aliases.popScope,
  TSModuleBlock: (_node: TSESTree.TSModuleBlock) => aliases.pushScope(),
  'TSModuleBlock:exit': aliases.popScope,
  ClassBody: (node: TSESTree.ClassBody) => {
    aliases.pushScope();
    const parent = node.parent;
    if (
      parent &&
      (parent.type === AST_NODE_TYPES.ClassDeclaration ||
        parent.type === AST_NODE_TYPES.ClassExpression) &&
      parent.id
    ) {
      const name = parent.id.name;
      const outerAlias = getAliasFromStack(storageAliases.slice(0, -1), name);
      const shadowsGlobal =
        STORAGE_NAMES.has(name as StorageKind) || GLOBAL_NAMES.has(name);
      const shadowsOuterStorageAlias =
        outerAlias === 'localStorage' || outerAlias === 'sessionStorage';

      if (shadowsGlobal || shadowsOuterStorageAlias) {
        aliases.setAlias(name, 'shadowed');
      }
    }
  },
  'ClassBody:exit': aliases.popScope,
  StaticBlock: (_node: TSESTree.StaticBlock) => aliases.pushScope(),
  'StaticBlock:exit': aliases.popScope,
  SwitchStatement: (_node: TSESTree.SwitchStatement) => aliases.pushScope(),
  'SwitchStatement:exit': aliases.popScope,
  ForStatement: (_node: TSESTree.ForStatement) => aliases.pushScope(),
  'ForStatement:exit': aliases.popScope,
  ForInStatement: (_node: TSESTree.ForInStatement) => aliases.pushScope(),
  'ForInStatement:exit': aliases.popScope,
  ForOfStatement: (_node: TSESTree.ForOfStatement) => aliases.pushScope(),
  'ForOfStatement:exit': aliases.popScope,
  CatchClause: (_node: TSESTree.CatchClause) => aliases.pushScope(),
  'CatchClause:exit': aliases.popScope,
  FunctionDeclaration: (node: TSESTree.FunctionDeclaration) => {
    if (node.id) {
      const name = node.id.name;
      const shadowsGlobal =
        STORAGE_NAMES.has(name as StorageKind) || GLOBAL_NAMES.has(name);
      const outerAlias = getAliasFromStack(storageAliases, name);
      const shadowsOuterStorageAlias =
        outerAlias === 'localStorage' || outerAlias === 'sessionStorage';

      if (shadowsGlobal || shadowsOuterStorageAlias) {
        aliases.setAlias(name, 'shadowed');
      }
    }
    aliases.pushScope('function');
  },
  'FunctionDeclaration:exit': aliases.popScope,
  FunctionExpression: (_node: TSESTree.FunctionExpression) =>
    aliases.pushScope('function'),
  'FunctionExpression:exit': aliases.popScope,
  ArrowFunctionExpression: (_node: TSESTree.ArrowFunctionExpression) =>
    aliases.pushScope('function'),
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
    MemberExpression: createMemberExpressionHandler(storageAliases, reportUsage),
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
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useStorageContext:
        'Direct {{storage}} {{accessType}} bypasses the storage context provider and causes three failures: (1) UI will not re-render when storage changes because React state is never updated, (2) code can crash during server-side rendering when `window` is undefined, and (3) storage errors go unhandled and break user flows. Call {{hook}}() at the component top level and use its returned methods (getItem, setItem, removeItem, clear) to keep storage access reactive and safe.',
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
