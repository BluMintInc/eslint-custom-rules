import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferSetAll';
type DocSetterKind = 'DocSetter' | 'DocSetterTransaction';

type IterationContext =
  | { kind: 'loop'; loopType: TSESTree.Node['type'] }
  | { kind: 'array-callback'; methodName: string };

const ITERATING_METHODS = new Set(['map', 'forEach']);
const DOC_SETTER_NAMES = new Set<DocSetterKind>([
  'DocSetter',
  'DocSetterTransaction',
]);

function unwrapCallee(
  callee: TSESTree.LeftHandSideExpression | TSESTree.ChainExpression,
): TSESTree.LeftHandSideExpression {
  return callee.type === AST_NODE_TYPES.ChainExpression
    ? callee.expression
    : callee;
}

function getEntityIdentifier(entity: TSESTree.EntityName): string {
  if (entity.type === AST_NODE_TYPES.Identifier) {
    return entity.name;
  }
  return getEntityIdentifier((entity as TSESTree.TSQualifiedName).right);
}

function getTypeName(typeNode?: TSESTree.TypeNode): string | null {
  if (!typeNode || typeNode.type !== AST_NODE_TYPES.TSTypeReference) {
    return null;
  }
  return getEntityIdentifier(typeNode.typeName);
}

function isDocSetterName(name: string | null): name is DocSetterKind {
  return Boolean(name && DOC_SETTER_NAMES.has(name as DocSetterKind));
}

function getNewExpressionKind(
  expression?: TSESTree.NewExpression | null,
): DocSetterKind | null {
  if (
    expression &&
    expression.callee.type === AST_NODE_TYPES.Identifier &&
    isDocSetterName(expression.callee.name)
  ) {
    return expression.callee.name;
  }
  return null;
}

function getTypeAnnotationKind(
  identifier: TSESTree.Identifier,
): DocSetterKind | null {
  const typeName = getTypeName(identifier.typeAnnotation?.typeAnnotation);
  if (isDocSetterName(typeName)) {
    return typeName;
  }
  return null;
}

function extractKindFromDefinition(
  definition: TSESLint.Scope.Definition,
): DocSetterKind | null {
  const nameNode = definition.name;
  if (!nameNode || nameNode.type !== AST_NODE_TYPES.Identifier) return null;

  const parent = nameNode.parent;
  if (parent?.type === AST_NODE_TYPES.VariableDeclarator) {
    const ctorKind = getNewExpressionKind(parent.init as TSESTree.NewExpression);
    if (ctorKind) return ctorKind;
  }

  const annotationKind = getTypeAnnotationKind(nameNode);
  if (annotationKind) return annotationKind;

  return null;
}

function resolveDocSetterFromScope(
  identifier: TSESTree.Identifier,
  context: TSESLint.RuleContext<MessageIds, []>,
): { setterName: string; setterKind: DocSetterKind } | null {
  let scope: TSESLint.Scope.Scope | null = context.getScope();
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      for (const def of variable.defs) {
        const kind = extractKindFromDefinition(def);
        if (kind) {
          return { setterName: identifier.name, setterKind: kind };
        }
      }
    }
    scope = scope.upper;
  }
  return null;
}

function resolveDocSetterFromClassProperty(
  propertyName: string,
  startNode: TSESTree.Node,
): DocSetterKind | null {
  let current: TSESTree.Node | undefined = startNode;
  while (current) {
    if (current.type === AST_NODE_TYPES.ClassBody) {
      for (const element of current.body) {
        if (
          element.type === AST_NODE_TYPES.PropertyDefinition &&
          element.key.type === AST_NODE_TYPES.Identifier &&
          element.key.name === propertyName
        ) {
          const ctorKind = getNewExpressionKind(
            element.value as TSESTree.NewExpression,
          );
          if (ctorKind) return ctorKind;

          const annotationKind = getTypeName(
            element.typeAnnotation?.typeAnnotation,
          );
          if (isDocSetterName(annotationKind)) {
            return annotationKind;
          }
        }
      }

      const classNode = current.parent;
      if (
        classNode &&
        (classNode.type === AST_NODE_TYPES.ClassDeclaration ||
          classNode.type === AST_NODE_TYPES.ClassExpression)
      ) {
        const constructor = classNode.body.body.find(
          (member) =>
            member.type === AST_NODE_TYPES.MethodDefinition &&
            member.kind === 'constructor',
        ) as TSESTree.MethodDefinition | undefined;

        if (constructor) {
          for (const param of constructor.value.params) {
            if (param.type === AST_NODE_TYPES.TSParameterProperty) {
              const parameter = param.parameter;
              if (
                parameter.type === AST_NODE_TYPES.Identifier &&
                parameter.name === propertyName
              ) {
                const annotationKind = getTypeAnnotationKind(parameter);
                if (annotationKind) return annotationKind;
              }
            }
          }
        }
      }

      return null;
    }
    current = current.parent as TSESTree.Node;
  }
  return null;
}

function isAncestor(
  ancestor: TSESTree.Node,
  node: TSESTree.Node,
): boolean {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent as TSESTree.Node;
  }
  return false;
}

function findIterationContext(
  node: TSESTree.Node,
): IterationContext | null {
  let current: TSESTree.Node | undefined = node.parent as TSESTree.Node;

  while (current) {
    switch (current.type) {
      case AST_NODE_TYPES.ForStatement:
      case AST_NODE_TYPES.ForInStatement:
      case AST_NODE_TYPES.ForOfStatement:
      case AST_NODE_TYPES.WhileStatement:
      case AST_NODE_TYPES.DoWhileStatement:
        return { kind: 'loop', loopType: current.type };
      case AST_NODE_TYPES.CallExpression: {
        const callee = unwrapCallee(current.callee);
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          ITERATING_METHODS.has(callee.property.name)
        ) {
          const callback = current.arguments[0];
          if (
            callback &&
            (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              callback.type === AST_NODE_TYPES.FunctionExpression) &&
            isAncestor(callback, node)
          ) {
            return { kind: 'array-callback', methodName: callee.property.name };
          }
        }
        break;
      }
      case AST_NODE_TYPES.Program:
        return null;
      default:
        break;
    }

    current = current.parent as TSESTree.Node;
  }

  return null;
}

function formatContext(iteration: IterationContext): string {
  if (iteration.kind === 'array-callback') {
    return `${iteration.methodName} callback`;
  }

  switch (iteration.loopType) {
    case AST_NODE_TYPES.ForOfStatement:
      return 'for...of loop';
    case AST_NODE_TYPES.ForInStatement:
      return 'for...in loop';
    case AST_NODE_TYPES.ForStatement:
      return 'for loop';
    case AST_NODE_TYPES.WhileStatement:
      return 'while loop';
    case AST_NODE_TYPES.DoWhileStatement:
      return 'do...while loop';
    default:
      return 'loop';
  }
}

function resolveDocSetterInfo(
  callee: TSESTree.MemberExpression,
  context: TSESLint.RuleContext<MessageIds, []>,
): { setterName: string; setterKind: DocSetterKind } | null {
  if (callee.property.type !== AST_NODE_TYPES.Identifier) return null;

  const object = callee.object;

  if (object.type === AST_NODE_TYPES.Identifier) {
    return resolveDocSetterFromScope(object, context);
  }

  if (
    object.type === AST_NODE_TYPES.MemberExpression &&
    object.object.type === AST_NODE_TYPES.ThisExpression &&
    object.property.type === AST_NODE_TYPES.Identifier
  ) {
    const setterKind = resolveDocSetterFromClassProperty(
      object.property.name,
      callee,
    );
    if (setterKind) {
      return { setterName: object.property.name, setterKind };
    }
  }

  return null;
}

export const preferDocSetterSetAll = createRule<[], MessageIds>({
  name: 'prefer-docsetter-setall',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce batching DocSetter and DocSetterTransaction writes by using setAll instead of set inside loops or array callbacks.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      preferSetAll:
        '{{setterName}}.set() runs inside a {{context}}, which sends one Firestore write per iteration. Collect the document payloads and call setAll() once to batch writes, cut round-trips, and keep payload types narrow (build an updates array and mark entries as const when needed).',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const callee = unwrapCallee(node.callee);
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.property.type !== AST_NODE_TYPES.Identifier ||
          callee.property.name !== 'set'
        ) {
          return;
        }

        const setterInfo = resolveDocSetterInfo(callee, context);
        if (!setterInfo) return;

        const iterationContext = findIterationContext(node);
        if (!iterationContext) return;

        const contextLabel = formatContext(iterationContext);

        context.report({
          node: callee.property,
          messageId: 'preferSetAll',
          data: {
            setterName: setterInfo.setterName,
            context: contextLabel,
          },
        });
      },
    };
  },
});
