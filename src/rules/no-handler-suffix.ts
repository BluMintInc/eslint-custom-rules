import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';

type Options = [
  {
    ignoreClassMethods?: boolean;
    ignoreInterfaceImplementations?: boolean;
    interfaceAllowlist?: string[];
    allowNames?: string[];
    allowPatterns?: string[];
    allowFilePatterns?: string[];
  },
];

type MessageIds = 'handlerSuffix';

const DEFAULT_OPTIONS: Options[0] = {
  ignoreClassMethods: false,
  ignoreInterfaceImplementations: false,
  interfaceAllowlist: [],
  allowNames: [],
  allowPatterns: [],
  allowFilePatterns: [],
};

function toEntityName(entity: TSESTree.EntityName): string {
  if (entity.type === AST_NODE_TYPES.Identifier) {
    return entity.name;
  }
  if (entity.type === AST_NODE_TYPES.TSQualifiedName) {
    return `${toEntityName(entity.left)}.${entity.right.name}`;
  }
  return '';
}

function isUnsafeAllowPattern(pattern: string): boolean {
  // Flag nested quantifiers that commonly lead to catastrophic backtracking
  const nestedQuantifierPattern = /\((?:[^()\\]|\\.)*[+*{][^)]*\)\s*[+*{]/;
  return nestedQuantifierPattern.test(pattern);
}

function getStaticKeyName(
  key:
    | TSESTree.Expression
    | TSESTree.PrivateIdentifier
    | TSESTree.Identifier
    | TSESTree.Literal,
): string | null {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }

  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }

  return null;
}

function getHandlerSuffix(name: string):
  | { baseName: string; suffix: 'Handler' | 'Handlers' }
  | null {
  const match = name.match(/^(.*?)(Handlers?)$/i);
  if (!match) return null;

  const [, baseName, suffix] = match;
  if (!suffix) return null;

  const normalizedSuffix =
    suffix.toLowerCase() === 'handlers' ? 'Handlers' : 'Handler';

  return {
    baseName,
    suffix: normalizedSuffix,
  };
}

function isInAllowedFile(
  filename: string,
  allowFilePatterns: string[],
): boolean {
  return allowFilePatterns.some((pattern) => minimatch(filename, pattern));
}

function toMemberExpressionName(
  expr: TSESTree.MemberExpression,
): string | null {
  if (expr.computed || expr.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const objectName =
    expr.object.type === AST_NODE_TYPES.Identifier
      ? expr.object.name
      : expr.object.type === AST_NODE_TYPES.MemberExpression
        ? toMemberExpressionName(expr.object)
        : null;

  return objectName ? `${objectName}.${expr.property.name}` : null;
}

function getImplementedInterfaces(
  classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
): string[] {
  return (
    classNode.implements?.flatMap((impl) => {
      const expr = impl.expression;
      const name =
        expr.type === AST_NODE_TYPES.Identifier
          ? expr.name
          : expr.type === AST_NODE_TYPES.MemberExpression
            ? toMemberExpressionName(expr)
            : null;

      return name ? [name] : [];
    }) ?? []
  );
}

function getClassFromMember(
  node: TSESTree.MethodDefinition | TSESTree.PropertyDefinition,
): TSESTree.ClassDeclaration | TSESTree.ClassExpression | null {
  const classBody = node.parent;
  if (
    classBody &&
    classBody.type === AST_NODE_TYPES.ClassBody &&
    classBody.parent &&
    (classBody.parent.type === AST_NODE_TYPES.ClassDeclaration ||
      classBody.parent.type === AST_NODE_TYPES.ClassExpression)
  ) {
    return classBody.parent;
  }
  return null;
}

function getTypeAnnotationName(
  annotation: TSESTree.TSTypeAnnotation | undefined | null,
): string | null {
  if (!annotation) return null;
  if (annotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
    const typeName = annotation.typeAnnotation.typeName;
    if (
      typeName.type === AST_NODE_TYPES.Identifier ||
      typeName.type === AST_NODE_TYPES.TSQualifiedName
    ) {
      return toEntityName(typeName);
    }
  }
  return null;
}

export const noHandlerSuffix = createRule<Options, MessageIds>({
  name: 'no-handler-suffix',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow the generic "handler" suffix in callback names so names explain the action they perform',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignoreClassMethods: { type: 'boolean' },
          ignoreInterfaceImplementations: { type: 'boolean' },
          interfaceAllowlist: {
            type: 'array',
            items: { type: 'string' },
          },
          allowNames: { type: 'array', items: { type: 'string' } },
          allowPatterns: { type: 'array', items: { type: 'string' } },
          allowFilePatterns: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      handlerSuffix:
        'Function "{{name}}" ends with the generic {{suffix}} suffix. Handler names hide the outcome of the callback and make call sites indistinguishable. Rename it to describe the effect (e.g., "{{suggestedName}}" or another action phrase) so readers know what the function actually does.',
    },
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(context, [options]) {
    const filename = context.getFilename();
    const resolvedOptions = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
    const allowNames = new Set(resolvedOptions.allowNames);
    const interfaceAllowlist = new Set(resolvedOptions.interfaceAllowlist);
    const invalidAllowPatterns: string[] = [];
    const unsafeAllowPatterns: string[] = [];
    const allowPatterns = (resolvedOptions.allowPatterns ?? []).flatMap(
      (pattern) => {
        try {
          if (isUnsafeAllowPattern(pattern)) {
            unsafeAllowPatterns.push(pattern);
            return [];
          }
          return [new RegExp(pattern)];
        } catch (error: unknown) {
          const reason =
            error && typeof error === 'object' && 'message' in error
              ? ` (${String((error as { message?: string }).message)})`
              : '';
          invalidAllowPatterns.push(`${pattern}${reason}`);
          return [];
        }
      },
    );

    if (invalidAllowPatterns.length > 0 || unsafeAllowPatterns.length > 0) {
      const errorParts: string[] = [];
      if (invalidAllowPatterns.length > 0) {
        errorParts.push(
          `invalid allowPatterns: ${invalidAllowPatterns.join(', ')}`,
        );
      }
      if (unsafeAllowPatterns.length > 0) {
        errorParts.push(
          `unsafe allowPatterns (avoid nested quantifiers that risk catastrophic backtracking): ${unsafeAllowPatterns.join(
            ', ',
          )}`,
        );
      }
      throw new Error(`no-handler-suffix: ${errorParts.join('; ')}`);
    }

    if (
      isInAllowedFile(filename, resolvedOptions.allowFilePatterns ?? [])
    ) {
      return {};
    }

    function isAllowedName(name: string): boolean {
      if (allowNames.has(name)) return true;
      return allowPatterns.some((regex) => regex.test(name));
    }

    function shouldIgnoreForInterfaces(
      node:
        | TSESTree.MethodDefinition
        | TSESTree.PropertyDefinition
        | TSESTree.VariableDeclarator
        | TSESTree.FunctionDeclaration,
    ): boolean {
      const { ignoreInterfaceImplementations } = resolvedOptions;

      if (
        (node.type === AST_NODE_TYPES.MethodDefinition ||
          node.type === AST_NODE_TYPES.PropertyDefinition) &&
        !node.computed &&
        (node.key.type === AST_NODE_TYPES.Identifier ||
          node.key.type === AST_NODE_TYPES.PrivateIdentifier ||
          (node.key.type === AST_NODE_TYPES.Literal &&
            typeof node.key.value === 'string'))
      ) {
        const classNode = getClassFromMember(node);
        if (!classNode) return false;

        const implemented = getImplementedInterfaces(classNode);
        if (implemented.length === 0) return false;

        if (ignoreInterfaceImplementations) {
          return true;
        }

        if (interfaceAllowlist.size > 0) {
          return implemented.some((iface) => interfaceAllowlist.has(iface));
        }
      }

      if (
        node.type === AST_NODE_TYPES.VariableDeclarator &&
        node.id.type === AST_NODE_TYPES.Identifier
      ) {
        const annotationName = getTypeAnnotationName(node.id.typeAnnotation);
        if (
          annotationName &&
          (interfaceAllowlist.has(annotationName) ||
            resolvedOptions.ignoreInterfaceImplementations)
        ) {
          return true;
        }
      }

      return false;
    }

    function getParentName(parent: TSESTree.Node | undefined): string | null {
      if (!parent) return null;

      if (
        parent.type === AST_NODE_TYPES.VariableDeclarator &&
        parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        return parent.id.name;
      }

      if (
        (parent.type === AST_NODE_TYPES.Property ||
          parent.type === AST_NODE_TYPES.MethodDefinition ||
          parent.type === AST_NODE_TYPES.PropertyDefinition) &&
        !parent.computed &&
        parent.key.type !== AST_NODE_TYPES.PrivateIdentifier
      ) {
        return getStaticKeyName(parent.key);
      }

      return null;
    }

    function reportIfHandlerName(
      name: string | null,
      identifierNode: TSESTree.Node | null,
      owner:
        | TSESTree.MethodDefinition
        | TSESTree.PropertyDefinition
        | TSESTree.Property
        | TSESTree.VariableDeclarator
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ): void {
      if (!name || !identifierNode) return;
      const suffixInfo = getHandlerSuffix(name);
      if (!suffixInfo) return;
      if (isAllowedName(name)) return;

      if (
        (owner.type === AST_NODE_TYPES.MethodDefinition ||
          owner.type === AST_NODE_TYPES.PropertyDefinition) &&
        resolvedOptions.ignoreClassMethods
      ) {
        return;
      }

      if (
        owner.type === AST_NODE_TYPES.MethodDefinition ||
        owner.type === AST_NODE_TYPES.PropertyDefinition ||
        owner.type === AST_NODE_TYPES.VariableDeclarator ||
        owner.type === AST_NODE_TYPES.FunctionDeclaration
      ) {
        if (shouldIgnoreForInterfaces(owner)) {
          return;
        }
      }

      const suggestedName =
        suffixInfo.baseName || 'a verb phrase that states the outcome';

      context.report({
        node: identifierNode,
        messageId: 'handlerSuffix',
        data: {
          name,
          suffix: suffixInfo.suffix,
          suggestedName,
        },
      });
    }

    return {
      FunctionDeclaration(node) {
        if (node.id?.type === AST_NODE_TYPES.Identifier) {
          reportIfHandlerName(node.id.name, node.id, node);
        }
      },
      VariableDeclarator(node) {
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          (node.init?.type === AST_NODE_TYPES.FunctionExpression ||
            node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          reportIfHandlerName(node.id.name, node.id, node);
        }
      },
      MethodDefinition(node) {
        if (!node.computed) {
          const name = getStaticKeyName(node.key);
          if (name) {
            reportIfHandlerName(name, node.key, node);
          }
        }
      },
      PropertyDefinition(node) {
        if (
          !node.computed &&
          (node.value?.type === AST_NODE_TYPES.FunctionExpression ||
            node.value?.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          const name = getStaticKeyName(node.key);
          if (name) {
            reportIfHandlerName(name, node.key, node);
          }
        }
      },
      Property(node) {
        if (
          !node.computed &&
          (node.value.type === AST_NODE_TYPES.FunctionExpression ||
            node.value.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          const name = getStaticKeyName(node.key);
          if (name) {
            reportIfHandlerName(name, node.key, node);
          }
        }
      },
      FunctionExpression(node) {
        if (!node.id) return;

        // Avoid double-reporting when the parent already names the function
        const parentName = getParentName(node.parent);

        if (parentName && parentName === node.id.name) {
          return;
        }

        reportIfHandlerName(node.id.name, node.id, node);
      },
    };
  },
});
