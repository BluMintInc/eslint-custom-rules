import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'noExplicitReturnTypeInferable'
  | 'noExplicitReturnTypeNonInferable';

type Options = [
  {
    allowRecursiveFunctions?: boolean;
    allowOverloadedFunctions?: boolean;
    allowInterfaceMethodSignatures?: boolean;
    allowAbstractMethodSignatures?: boolean;
    allowDtsFiles?: boolean;
    allowFirestoreFunctionFiles?: boolean;
  },
];

const defaultOptions: Options[0] = {
  allowRecursiveFunctions: true,
  allowOverloadedFunctions: true,
  allowInterfaceMethodSignatures: true,
  allowAbstractMethodSignatures: true,
  allowDtsFiles: true,
  allowFirestoreFunctionFiles: true,
};

function getNameFromIdentifierOrLiteral(
  key: TSESTree.Identifier | TSESTree.Literal,
): string | undefined {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }

  if (typeof key.value === 'string') {
    return key.value;
  }

  return undefined;
}

function describeMethodDefinition(node: TSESTree.MethodDefinition): string {
  if (
    !node.computed &&
    (node.key.type === AST_NODE_TYPES.Identifier ||
      (node.key.type === AST_NODE_TYPES.Literal &&
        typeof node.key.value === 'string'))
  ) {
    const name = getNameFromIdentifierOrLiteral(node.key);
    if (name) {
      return `class method "${name}"`;
    }
  }

  return 'class method';
}

function describeAbstractMethodDefinition(
  node: TSESTree.TSAbstractMethodDefinition,
): string {
  if (
    !node.computed &&
    (node.key.type === AST_NODE_TYPES.Identifier ||
      (node.key.type === AST_NODE_TYPES.Literal &&
        typeof node.key.value === 'string'))
  ) {
    const name = getNameFromIdentifierOrLiteral(node.key);
    if (name) {
      return `class method "${name}"`;
    }
  }

  return 'class method';
}

function describeMethodSignature(node: TSESTree.TSMethodSignature): string {
  if (
    !node.computed &&
    (node.key.type === AST_NODE_TYPES.Identifier ||
      (node.key.type === AST_NODE_TYPES.Literal &&
        typeof node.key.value === 'string'))
  ) {
    const name = getNameFromIdentifierOrLiteral(node.key);
    if (name) {
      return `interface method "${name}"`;
    }
  }

  return 'interface method';
}

function describeFunctionDeclaration(node: TSESTree.FunctionDeclaration): string {
  if (node.id?.name) {
    return `function "${node.id.name}"`;
  }

  return 'function';
}

function describeTSDeclareFunction(node: TSESTree.TSDeclareFunction): string {
  if (node.id?.name) {
    return `function "${node.id.name}"`;
  }

  return 'function';
}

function describeFunctionExpression(node: TSESTree.FunctionExpression): string {
  if (node.id?.name) {
    return `function "${node.id.name}"`;
  }

  if (
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return `function "${node.parent.id.name}"`;
  }

  if (
    node.parent?.type === AST_NODE_TYPES.Property &&
    !node.parent.computed &&
    (node.parent.key.type === AST_NODE_TYPES.Identifier ||
      (node.parent.key.type === AST_NODE_TYPES.Literal &&
        typeof node.parent.key.value === 'string'))
  ) {
    const name = getNameFromIdentifierOrLiteral(node.parent.key);
    if (name) {
      return `object method "${name}"`;
    }
  }

  return 'function expression';
}

function describeArrowFunction(node: TSESTree.ArrowFunctionExpression): string {
  if (
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return `arrow function "${node.parent.id.name}"`;
  }

  return 'arrow function';
}

function describeFunctionKind(node: TSESTree.Node): string {
  switch (node.type) {
    case AST_NODE_TYPES.MethodDefinition:
      return describeMethodDefinition(node);
    case AST_NODE_TYPES.TSAbstractMethodDefinition:
      return describeAbstractMethodDefinition(node);
    case AST_NODE_TYPES.TSMethodSignature:
      return describeMethodSignature(node);
    case AST_NODE_TYPES.TSDeclareFunction:
      return describeTSDeclareFunction(node);
    case AST_NODE_TYPES.FunctionDeclaration:
      return describeFunctionDeclaration(node);
    case AST_NODE_TYPES.FunctionExpression:
      return describeFunctionExpression(node);
    case AST_NODE_TYPES.ArrowFunctionExpression:
      return describeArrowFunction(node);
    default:
      return 'function';
  }
}

function isRecursiveFunction(node: TSESTree.FunctionLike): boolean {
  const functionName =
    node.type === AST_NODE_TYPES.FunctionDeclaration
      ? node.id?.name
      : node.type === AST_NODE_TYPES.FunctionExpression && node.id
      ? node.id.name
      : undefined;

  if (!functionName || !node.body) return false;

  let hasRecursiveCall = false;
  function checkNode(node: TSESTree.Node): void {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === functionName
    ) {
      hasRecursiveCall = true;
      return;
    }

    // Only traverse specific node types to avoid circular references
    if (node.type === AST_NODE_TYPES.BlockStatement) {
      node.body.forEach(checkNode);
    } else if (node.type === AST_NODE_TYPES.ExpressionStatement) {
      checkNode(node.expression);
    } else if (node.type === AST_NODE_TYPES.CallExpression) {
      checkNode(node.callee);
      node.arguments.forEach(checkNode);
    } else if (node.type === AST_NODE_TYPES.BinaryExpression) {
      checkNode(node.left);
      checkNode(node.right);
    } else if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) {
      checkNode(node.argument);
    } else if (node.type === AST_NODE_TYPES.IfStatement) {
      checkNode(node.test);
      checkNode(node.consequent);
      if (node.alternate) {
        checkNode(node.alternate);
      }
    }
  }

  checkNode(node.body);
  return hasRecursiveCall;
}

function isOverloadedFunction(node: TSESTree.Node): boolean {
  if (!node.parent) return false;

  if (node.type === AST_NODE_TYPES.TSMethodSignature) {
    const interfaceBody = node.parent;
    if (interfaceBody.type !== AST_NODE_TYPES.TSInterfaceBody) return false;

    if (node.computed) return false;

    const methodName =
      node.key.type === AST_NODE_TYPES.Identifier ||
      node.key.type === AST_NODE_TYPES.Literal
        ? getNameFromIdentifierOrLiteral(node.key)
        : undefined;
    if (!methodName) return false;

    return (
      interfaceBody.body.filter(
        (member) =>
          member.type === AST_NODE_TYPES.TSMethodSignature &&
          !member.computed &&
          (member.key.type === AST_NODE_TYPES.Identifier ||
            member.key.type === AST_NODE_TYPES.Literal) &&
          getNameFromIdentifierOrLiteral(member.key) === methodName,
      ).length > 1
    );
  }

  return false;
}

function isInterfaceOrAbstractMethodSignature(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.TSAbstractMethodDefinition) return true;
  if (node.type === AST_NODE_TYPES.TSMethodSignature) return true;

  if (node.type === AST_NODE_TYPES.MethodDefinition) {
    let current: TSESTree.Node | undefined = node;
    while (current) {
      if (
        current.type === AST_NODE_TYPES.ClassDeclaration &&
        current.abstract
      ) {
        return true;
      }
      current = current.parent;
    }
  }

  return false;
}

function isTypeGuardFunction(node: TSESTree.Node): boolean {
  if (!('returnType' in node) || !node.returnType) return false;

  const returnType = node.returnType;
  if (returnType.type !== AST_NODE_TYPES.TSTypeAnnotation) return false;

  const typeAnnotation = returnType.typeAnnotation;

  // Check for type predicates (is keyword)
  if (typeAnnotation.type === AST_NODE_TYPES.TSTypePredicate) return true;

  // Check for assertion functions (asserts keyword)
  if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
    const typeName = typeAnnotation.typeName;
    if (
      typeName.type === AST_NODE_TYPES.Identifier &&
      typeName.name === 'asserts'
    ) {
      return true;
    }
  }

  return false;
}

export const noExplicitReturnType: TSESLint.RuleModule<MessageIds, Options> =
  createRule<Options, MessageIds>({
  name: 'no-explicit-return-type',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Disallow explicit return type annotations on functions when TypeScript can infer them. This reduces code verbosity and maintenance burden while leveraging TypeScript's powerful type inference. Exceptions are made for type guard functions (using the `is` keyword), recursive functions, overloaded functions, interface methods, and abstract methods where explicit types improve clarity.",
      recommended: 'error',
      requiresTypeChecking: false,
      extendsBaseRule: false,
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowRecursiveFunctions: { type: 'boolean' },
          allowOverloadedFunctions: { type: 'boolean' },
          allowInterfaceMethodSignatures: { type: 'boolean' },
          allowAbstractMethodSignatures: { type: 'boolean' },
          allowDtsFiles: { type: 'boolean' },
          allowFirestoreFunctionFiles: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noExplicitReturnTypeInferable:
        'Explicit return type on {{functionKind}} requires manual upkeep and can drift from what the implementation returns. Remove the return type annotation so TypeScript infers it and keeps the signature aligned automatically.',
      noExplicitReturnTypeNonInferable:
        '{{functionKind}} has no implementation body for TypeScript to infer from. Removing the return type here widens it to any; keep the annotation or provide an implementation where inference can succeed.',
    },
  },
  defaultOptions: [defaultOptions],
  create(context, [options]) {
    const mergedOptions = { ...defaultOptions, ...options };
    const filename = context.getFilename();

    if (
      (mergedOptions.allowDtsFiles && filename.endsWith('.d.ts')) ||
      (mergedOptions.allowFirestoreFunctionFiles && filename.endsWith('.f.ts'))
    ) {
      return {};
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function fixReturnType(fixer: any, node: any) {
      const returnType = node.returnType || node.value?.returnType;
      if (!returnType) return null;

      // Create a fix that removes the return type annotation
      return fixer.remove(returnType);
    }

    return {
      FunctionDeclaration(node) {
        const returnType = node.returnType;
        if (!returnType) return;

        if (
          isTypeGuardFunction(node) ||
          (mergedOptions.allowRecursiveFunctions && isRecursiveFunction(node))
        ) {
          return;
        }

        const isInferable = Boolean(node.body);

        context.report({
          node: returnType,
          messageId: isInferable
            ? 'noExplicitReturnTypeInferable'
            : 'noExplicitReturnTypeNonInferable',
          data: { functionKind: describeFunctionKind(node) },
          ...(isInferable ? { fix: (fixer) => fixReturnType(fixer, node) } : {}),
        });
      },

      FunctionExpression(node) {
        const returnType = node.returnType;
        if (!returnType) return;

        if (node.parent?.type === AST_NODE_TYPES.MethodDefinition) {
          return;
        }

        if (
          isTypeGuardFunction(node) ||
          (mergedOptions.allowRecursiveFunctions && isRecursiveFunction(node))
        ) {
          return;
        }

        const isInferable = Boolean(node.body);

        context.report({
          node: returnType,
          messageId: isInferable
            ? 'noExplicitReturnTypeInferable'
            : 'noExplicitReturnTypeNonInferable',
          data: { functionKind: describeFunctionKind(node) },
          ...(isInferable ? { fix: (fixer) => fixReturnType(fixer, node) } : {}),
        });
      },

      ArrowFunctionExpression(node) {
        const returnType = node.returnType;
        if (!returnType) return;

        if (isTypeGuardFunction(node)) {
          return;
        }

        const isInferable = true;

        context.report({
          node: returnType,
          messageId: isInferable
            ? 'noExplicitReturnTypeInferable'
            : 'noExplicitReturnTypeNonInferable',
          data: { functionKind: describeFunctionKind(node) },
          ...(isInferable ? { fix: (fixer) => fixReturnType(fixer, node) } : {}),
        });
      },

      TSMethodSignature(node) {
        const returnType = node.returnType;
        if (!returnType) return;

        if (mergedOptions.allowInterfaceMethodSignatures) {
          return;
        }

        if (
          mergedOptions.allowOverloadedFunctions &&
          isOverloadedFunction(node)
        ) {
          return;
        }

        context.report({
          node: returnType,
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: describeFunctionKind(node) },
        });
      },

      MethodDefinition(node) {
        const returnType = node.value.returnType;
        if (!returnType) return;

        if (
          isTypeGuardFunction(node.value) ||
          (mergedOptions.allowAbstractMethodSignatures &&
            isInterfaceOrAbstractMethodSignature(node))
        ) {
          return;
        }

        const isInferable = Boolean(node.value.body);

        context.report({
          node: returnType,
          messageId: isInferable
            ? 'noExplicitReturnTypeInferable'
            : 'noExplicitReturnTypeNonInferable',
          data: { functionKind: describeFunctionKind(node) },
          ...(isInferable ? { fix: (fixer) => fixReturnType(fixer, node) } : {}),
        });
      },

      TSAbstractMethodDefinition(node) {
        const returnType = node.value.returnType;
        if (!returnType) return;

        if (
          isTypeGuardFunction(node.value) ||
          (mergedOptions.allowAbstractMethodSignatures &&
            isInterfaceOrAbstractMethodSignature(node))
        ) {
          return;
        }

        const isInferable = Boolean(node.value.body);

        context.report({
          node: returnType,
          messageId: isInferable
            ? 'noExplicitReturnTypeInferable'
            : 'noExplicitReturnTypeNonInferable',
          data: { functionKind: describeFunctionKind(node) },
          ...(isInferable ? { fix: (fixer) => fixReturnType(fixer, node) } : {}),
        });
      },

      TSDeclareFunction(node) {
        const returnType = node.returnType;
        if (!returnType) return;

        context.report({
          node: returnType,
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: describeFunctionKind(node) },
        });
      },
    };
  },
});
