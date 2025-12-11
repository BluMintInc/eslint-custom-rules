import path from 'path';
import { minimatch } from 'minimatch';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type StorageKind = 'localStorage' | 'sessionStorage';

type RuleOptions = [
  {
    allowInTests?: boolean;
    allow?: string[];
  }?,
];

type MessageIds = 'useStorageContext';

const STORAGE_NAMES = new Set<StorageKind>(['localStorage', 'sessionStorage']);
const GLOBAL_NAMES = new Set(['window', 'global', 'globalThis']);
const CONTEXT_BASENAMES = new Set(['LocalStorage.tsx', 'SessionStorage.tsx']);
const TEST_FILE_REGEX = /\.(test|spec)\.[jt]sx?$/i;

const unwrapExpression = (expression: TSESTree.Expression): TSESTree.Expression => {
  let current: TSESTree.Expression = expression;

  while (true) {
    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSTypeAssertion ||
      current.type === AST_NODE_TYPES.TSNonNullExpression
    ) {
      current = current.expression as TSESTree.Expression;
      continue;
    }

    if ((current as { type: string }).type === 'ParenthesizedExpression') {
      current = (current as unknown as { expression: TSESTree.Expression })
        .expression;
      continue;
    }

    if (current.type === AST_NODE_TYPES.ChainExpression) {
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

const leftmostIdentifier = (node: TSESTree.Node | null): TSESTree.Identifier | null => {
  let current: TSESTree.Node | null = node;

  while (current) {
    if (current.type === AST_NODE_TYPES.Identifier) {
      return current;
    }

    if (current.type === AST_NODE_TYPES.MemberExpression) {
      current = current.object;
      continue;
    }

    if (current.type === AST_NODE_TYPES.CallExpression) {
      current = current.callee;
      continue;
    }

    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSTypeAssertion ||
      current.type === AST_NODE_TYPES.TSNonNullExpression
    ) {
      current = current.expression;
      continue;
    }

    if ((current as { type: string }).type === 'ParenthesizedExpression') {
      current = (current as unknown as { expression: TSESTree.Node }).expression;
      continue;
    }

    if (current.type === AST_NODE_TYPES.ChainExpression) {
      current = current.expression;
      continue;
    }

    return null;
  }

  return null;
};

const isGlobalLike = (node: TSESTree.Expression): boolean => {
  const base = leftmostIdentifier(node);
  return !!base && GLOBAL_NAMES.has(base.name);
};

const resolveStorageObject = (
  expression: TSESTree.Expression,
  aliases: Map<string, StorageKind>,
): StorageKind | null => {
  const target = unwrapExpression(expression);

  if (target.type === AST_NODE_TYPES.Identifier) {
    if (STORAGE_NAMES.has(target.name as StorageKind)) {
      return target.name as StorageKind;
    }
    return aliases.get(target.name) ?? null;
  }

  if (target.type === AST_NODE_TYPES.MemberExpression) {
    const objectKind = resolveStorageObject(
      target.object as TSESTree.Expression,
      aliases,
    );
    if (objectKind) return objectKind;

    const propertyName = getPropertyName(target.property);
    if (propertyName && STORAGE_NAMES.has(propertyName as StorageKind) && isGlobalLike(target.object as TSESTree.Expression)) {
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

const identifierRepresentsDeclaration = (node: TSESTree.Identifier): boolean => {
  const parent = node.parent;
  if (!parent) return false;

  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id === node) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.FunctionDeclaration && parent.id === node) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.ClassDeclaration && parent.id === node) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.ImportSpecifier) return true;
  if (parent.type === AST_NODE_TYPES.ImportDefaultSpecifier) return true;
  if (parent.type === AST_NODE_TYPES.ImportNamespaceSpecifier) return true;
  if (parent.type === AST_NODE_TYPES.TSTypeAliasDeclaration && parent.id === node) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.TSInterfaceDeclaration && parent.id === node) {
    return true;
  }
  if (
    (parent.type === AST_NODE_TYPES.Property ||
      parent.type === AST_NODE_TYPES.MethodDefinition ||
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
  aliases: Map<string, StorageKind>,
): boolean => {
  const source = unwrapExpression(init);

  if (isGlobalLike(source)) return true;

  if (source.type === AST_NODE_TYPES.MemberExpression) {
    if (resolveStorageObject(source, aliases)) return true;
    return isGlobalLike(source.object as TSESTree.Expression);
  }

  return false;
};

const recordAliasFromPattern = (
  pattern: TSESTree.ObjectPattern,
  init: TSESTree.Expression | null,
  aliases: Map<string, StorageKind>,
): void => {
  if (!init) return;
  if (!isStorageContainerSource(init, aliases)) return;

  for (const prop of pattern.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;
    if (prop.computed) continue;

    const keyName = getPropertyName(prop.key);
    if (!keyName || !STORAGE_NAMES.has(keyName as StorageKind)) continue;

    if (prop.value.type === AST_NODE_TYPES.Identifier) {
      aliases.set(prop.value.name, keyName as StorageKind);
    } else if (
      prop.value.type === AST_NODE_TYPES.AssignmentPattern &&
      prop.value.left.type === AST_NODE_TYPES.Identifier
    ) {
      aliases.set(prop.value.left.name, keyName as StorageKind);
    }
  }
};

const shouldIgnoreFile = (
  filename: string,
  options: RuleOptions[0] | undefined,
): boolean => {
  const base = path.basename(filename);
  if (CONTEXT_BASENAMES.has(base)) return true;

  const allowInTests = options?.allowInTests ?? true;
  const isTestFile =
    TEST_FILE_REGEX.test(filename) || filename.includes('__mocks__/');

  if (allowInTests && isTestFile) return true;

  const allowPatterns = options?.allow ?? [];
  return allowPatterns.some((pattern) => minimatch(filename, pattern));
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
        'Direct {{storage}} {{accessType}} bypasses the storage context providers that keep reads reactive, handle SSR checks, and centralize error handling. Use {{hook}}() helpers (getItem/setItem/removeItem/clear) so storage changes stay in sync with React state.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const filename = context.getFilename();
    const [options] = context.options;

    if (shouldIgnoreFile(filename, options)) {
      return {};
    }

    const storageAliases = new Map<string, StorageKind>();

    const reportUsage = (
      node: TSESTree.Node,
      storage: StorageKind,
      accessType: string,
    ) => {
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

    const handleIdentifier = (node: TSESTree.Identifier): void => {
      const storageKind = resolveStorageObject(node, storageAliases);
      if (!storageKind) return;
      if (identifierRepresentsDeclaration(node)) return;
      if (isMemberExpressionObject(node)) return;
      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.MemberExpression &&
        node.parent.property === node
      )
        return;

      reportUsage(node, storageKind, 'reference');
    };

    const handleMemberExpression = (node: TSESTree.MemberExpression): void => {
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
        isGlobalLike(object)
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

    const handleCallExpression = (node: TSESTree.CallExpression): void => {
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

    const handleVariableDeclarator = (
      node: TSESTree.VariableDeclarator,
    ): void => {
      if (!node.init) return;

      if (node.id.type === AST_NODE_TYPES.Identifier) {
        const storageKind = resolveStorageObject(
          node.init as TSESTree.Expression,
          storageAliases,
        );
        if (storageKind) {
          storageAliases.set(node.id.name, storageKind);
        } else {
          storageAliases.delete(node.id.name);
        }
      } else if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
        recordAliasFromPattern(node.id, node.init as TSESTree.Expression, storageAliases);
      }
    };

    const handleAssignmentExpression = (
      node: TSESTree.AssignmentExpression,
    ): void => {
      if (node.left.type === AST_NODE_TYPES.Identifier) {
        const right = node.right as TSESTree.Expression;
        const storageKind = resolveStorageObject(right, storageAliases);
        if (storageKind) {
          storageAliases.set(node.left.name, storageKind);
        } else {
          storageAliases.delete(node.left.name);
        }
      } else if (node.left.type === AST_NODE_TYPES.ObjectPattern) {
        recordAliasFromPattern(
          node.left,
          node.right as TSESTree.Expression,
          storageAliases,
        );
      }
    };

    return {
      Identifier: handleIdentifier,
      MemberExpression: handleMemberExpression,
      CallExpression: handleCallExpression,
      VariableDeclarator: handleVariableDeclarator,
      AssignmentExpression: handleAssignmentExpression,
    };
  },
});
