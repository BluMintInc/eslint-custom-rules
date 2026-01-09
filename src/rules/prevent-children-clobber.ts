import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

type MessageIds = 'childrenClobbered';
type Options = [];

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type BindingInfo = {
  identifier: TSESTree.Identifier;
  childrenExcluded: boolean;
  typeAnnotationExcludesProperty: boolean;
  childrenSourceId: string;
};

type MinimalParserServices = {
  program?: ts.Program;
  esTreeNodeToTSNodeMap?: {
    get(node: TSESTree.Node): ts.Node | undefined;
  };
};

type FunctionContext = {
  isComponent: boolean;
  bindings: Map<string, BindingInfo>;
  propsLikeIdentifiers: Set<string>;
  childrenValueSourceIds: Map<string, string>;
};

function resolveFunctionName(node: FunctionLike): string | null {
  if ('id' in node && node.id?.name) {
    return node.id.name;
  }

  if (
    node.type === AST_NODE_TYPES.FunctionExpression &&
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  if (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  return null;
}

function isComponentLike(
  node: FunctionLike,
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
): boolean {
  const name = resolveFunctionName(node);
  if (name && /^[A-Z]/.test(name)) {
    return true;
  }

  return ASTHelpers.returnsJSX(node.body, context);
}

function patternHasChildrenProperty(pattern: TSESTree.ObjectPattern): boolean {
  return pattern.properties.some((prop) => {
    if (prop.type !== AST_NODE_TYPES.Property) return false;
    if (prop.computed) return false;
    const key = prop.key;
    if (key.type === AST_NODE_TYPES.Identifier) {
      return key.name === 'children';
    }
    if (key.type === AST_NODE_TYPES.Literal) {
      return key.value === 'children';
    }
    return false;
  });
}

function typeNodeContainsLiteral(
  node: TSESTree.TypeNode,
  literalValue: string,
): boolean {
  if (node.type === AST_NODE_TYPES.TSLiteralType) {
    return node.literal.type === AST_NODE_TYPES.Literal
      ? node.literal.value === literalValue
      : false;
  }
  if (node.type === AST_NODE_TYPES.TSUnionType) {
    return node.types.some((t) => typeNodeContainsLiteral(t, literalValue));
  }
  if (node.type === AST_NODE_TYPES.TSTupleType) {
    return node.elementTypes.some((t) =>
      typeNodeContainsLiteral(t, literalValue),
    );
  }
  if (node.type === AST_NODE_TYPES.TSArrayType) {
    return typeNodeContainsLiteral(node.elementType, literalValue);
  }
  return false;
}

function typeNodeExcludesProperty(
  node: TSESTree.TypeNode,
  propertyName: string,
  aliasMap?: Map<string, TSESTree.TypeNode>,
  seen: Set<string> = new Set(),
): boolean {
  if (node.type === AST_NODE_TYPES.TSTypeReference) {
    const typeName =
      node.typeName.type === AST_NODE_TYPES.Identifier
        ? node.typeName.name
        : null;

    if (typeName === 'Omit' && node.typeParameters?.params?.[1]) {
      const excluded = node.typeParameters.params[1];
      if (
        typeNodeContainsLiteral(excluded, propertyName) ||
        typeNodeExcludesProperty(excluded, propertyName, aliasMap, seen)
      ) {
        return true;
      }
    }

    if (node.typeParameters?.params) {
      return node.typeParameters.params.some((param) =>
        typeNodeExcludesProperty(param, propertyName, aliasMap, seen),
      );
    }

    if (typeName && aliasMap?.has(typeName) && !seen.has(typeName)) {
      seen.add(typeName);
      const alias = aliasMap.get(typeName);
      if (
        alias &&
        typeNodeExcludesProperty(alias, propertyName, aliasMap, seen)
      ) {
        return true;
      }
    }
  }

  if (node.type === AST_NODE_TYPES.TSUnionType) {
    return node.types.every((typeNode) =>
      typeNodeExcludesProperty(typeNode, propertyName, aliasMap, seen),
    );
  }

  if (node.type === AST_NODE_TYPES.TSIntersectionType) {
    return node.types.every((typeNode) =>
      typeNodeExcludesProperty(typeNode, propertyName, aliasMap, seen),
    );
  }

  return false;
}

function typeAnnotationExcludesProperty(
  annotation: TSESTree.TSTypeAnnotation | null | undefined,
  propertyName: string,
  aliasMap?: Map<string, TSESTree.TypeNode>,
): boolean {
  if (!annotation) return false;
  return typeNodeExcludesProperty(
    annotation.typeAnnotation,
    propertyName,
    aliasMap,
  );
}

function collectRestBindingsFromPattern(
  pattern: TSESTree.ObjectPattern,
  ctx: FunctionContext,
  annotation: TSESTree.TSTypeAnnotation | null | undefined,
  aliasMap?: Map<string, TSESTree.TypeNode>,
  sourceChildrenSourceId?: string,
): void {
  const childrenPresent = patternHasChildrenProperty(pattern);
  for (const prop of pattern.properties) {
    if (
      prop.type === AST_NODE_TYPES.RestElement &&
      prop.argument.type === AST_NODE_TYPES.Identifier
    ) {
      ctx.propsLikeIdentifiers.add(prop.argument.name);
      ctx.bindings.set(prop.argument.name, {
        identifier: prop.argument,
        childrenExcluded: childrenPresent,
        typeAnnotationExcludesProperty: typeAnnotationExcludesProperty(
          annotation,
          'children',
          aliasMap,
        ),
        childrenSourceId: sourceChildrenSourceId ?? prop.argument.name,
      });
    } else if (
      prop.type === AST_NODE_TYPES.Property &&
      prop.value.type === AST_NODE_TYPES.ObjectPattern
    ) {
      collectRestBindingsFromPattern(prop.value, ctx, null, aliasMap);
    }
  }
}

function recordChildrenValueBindingsFromPattern(
  pattern: TSESTree.ObjectPattern,
  ctx: FunctionContext,
  sourceChildrenSourceId: string,
): void {
  for (const prop of pattern.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;
    if (prop.computed) continue;

    const key = prop.key;
    const keyName =
      key.type === AST_NODE_TYPES.Identifier
        ? key.name
        : key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string'
        ? key.value
        : null;

    if (keyName !== 'children') continue;

    const value = prop.value;
    if (value.type === AST_NODE_TYPES.Identifier) {
      ctx.childrenValueSourceIds.set(value.name, sourceChildrenSourceId);
      continue;
    }

    if (
      value.type === AST_NODE_TYPES.AssignmentPattern &&
      value.left.type === AST_NODE_TYPES.Identifier
    ) {
      ctx.childrenValueSourceIds.set(value.left.name, sourceChildrenSourceId);
    }
  }
}

function recordParamBindings(
  param: TSESTree.Parameter,
  ctx: FunctionContext,
  aliasMap?: Map<string, TSESTree.TypeNode>,
) {
  if (param.type === AST_NODE_TYPES.Identifier) {
    ctx.propsLikeIdentifiers.add(param.name);
    ctx.bindings.set(param.name, {
      identifier: param,
      childrenExcluded: false,
      typeAnnotationExcludesProperty: typeAnnotationExcludesProperty(
        param.typeAnnotation,
        'children',
        aliasMap,
      ),
      childrenSourceId: param.name,
    });
    return;
  }

  if (
    param.type === AST_NODE_TYPES.AssignmentPattern &&
    param.left.type === AST_NODE_TYPES.Identifier
  ) {
    ctx.propsLikeIdentifiers.add(param.left.name);
    ctx.bindings.set(param.left.name, {
      identifier: param.left,
      childrenExcluded: false,
      typeAnnotationExcludesProperty: typeAnnotationExcludesProperty(
        param.typeAnnotation,
        'children',
        aliasMap,
      ),
      childrenSourceId: param.left.name,
    });
    return;
  }

  if (
    param.type === AST_NODE_TYPES.AssignmentPattern &&
    param.left.type === AST_NODE_TYPES.ObjectPattern
  ) {
    collectRestBindingsFromPattern(
      param.left,
      ctx,
      param.typeAnnotation,
      aliasMap,
    );
    return;
  }

  if (param.type === AST_NODE_TYPES.ObjectPattern) {
    collectRestBindingsFromPattern(param, ctx, param.typeAnnotation, aliasMap);
  }
}

function findNearestComponentContext(
  stack: FunctionContext[],
): FunctionContext | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].isComponent) return stack[i];
  }
  return undefined;
}

function findBinding(
  name: string,
  stack: FunctionContext[],
): BindingInfo | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const binding = stack[i].bindings.get(name);
    if (binding) return binding;
  }
  return undefined;
}

function findChildrenValueSourceId(
  name: string,
  stack: FunctionContext[],
): string | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const sourceId = stack[i].childrenValueSourceIds.get(name);
    if (sourceId) return sourceId;
  }
  return undefined;
}

function isPropsLike(name: string, stack: FunctionContext[]): boolean {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].propsLikeIdentifiers.has(name)) return true;
  }
  return false;
}

function typeHasChildrenProperty(
  checker: ts.TypeChecker,
  type: ts.Type,
): boolean | null {
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    return null;
  }

  const apparent = checker.getApparentType(type);
  const directProp =
    type.getProperty?.('children') ??
    checker.getPropertyOfType(type, 'children') ??
    checker.getPropertyOfType(apparent, 'children');

  if (directProp) {
    return true;
  }

  if (type.isUnion?.()) {
    let sawUnknown = false;
    for (const member of type.types) {
      const result = typeHasChildrenProperty(checker, member);
      if (result) return true;
      if (result === null) sawUnknown = true;
    }
    return sawUnknown ? null : false;
  }

  if (type.isIntersection?.()) {
    let sawUnknown = false;
    for (const member of type.types) {
      const result = typeHasChildrenProperty(checker, member);
      if (result) return true;
      if (result === null) sawUnknown = true;
    }
    return sawUnknown ? null : false;
  }

  return false;
}

function bindingMayContainChildren(
  binding: BindingInfo,
  context: TSESLint.RuleContext<MessageIds, Options>,
): boolean {
  if (binding.childrenExcluded) return false;
  if (binding.typeAnnotationExcludesProperty) return false;

  const services =
    (
      context as unknown as {
        sourceCode?: { parserServices?: MinimalParserServices };
      }
    ).sourceCode?.parserServices ??
    (context.parserServices as MinimalParserServices);
  if (!services?.program || !services?.esTreeNodeToTSNodeMap) {
    return true;
  }

  try {
    const checker = services.program.getTypeChecker();
    const tsNode = services.esTreeNodeToTSNodeMap.get(binding.identifier);
    if (!tsNode) return true;
    const type = checker.getTypeAtLocation(tsNode);
    const hasChildren = typeHasChildrenProperty(checker, type);
    if (hasChildren === false) return false;
    return true;
  } catch {
    return true;
  }
}

function hasExplicitChildren(element: TSESTree.JSXElement): boolean {
  if (element.openingElement.selfClosing) return false;

  return element.children.some((child) => {
    if (child.type === AST_NODE_TYPES.JSXText) {
      return child.value.trim().length > 0;
    }
    if (child.type === AST_NODE_TYPES.JSXExpressionContainer) {
      return child.expression.type !== AST_NODE_TYPES.JSXEmptyExpression;
    }
    return true; // JSXElement, JSXFragment, JSXSpreadChild, etc.
  });
}

function nodeReferencesChildren(
  node: TSESTree.Node,
  propsObjectNames: Set<string>,
  childrenValueNames: Set<string>,
): boolean {
  const stack: TSESTree.Node[] = [node];
  while (stack.length) {
    const current = stack.pop()!;
    if (current.type === AST_NODE_TYPES.Identifier) {
      if (childrenValueNames.has(current.name)) return true;
    } else if (current.type === AST_NODE_TYPES.MemberExpression) {
      if (
        !current.computed &&
        current.property.type === AST_NODE_TYPES.Identifier &&
        current.property.name === 'children' &&
        current.object.type === AST_NODE_TYPES.Identifier &&
        propsObjectNames.has(current.object.name)
      ) {
        return true;
      }
    } else if (current.type === AST_NODE_TYPES.ChainExpression) {
      stack.push(current.expression as TSESTree.Node);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const key of Object.keys(current as any)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (current as any)[key];
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object' && 'type' in child) {
            stack.push(child as TSESTree.Node);
          }
        }
      } else if (typeof value === 'object' && 'type' in value) {
        stack.push(value as TSESTree.Node);
      }
    }
  }
  return false;
}

function childrenRenderSpreadChildren(
  children: TSESTree.JSXChild[],
  propsObjectNames: Set<string>,
  childrenValueNames: Set<string>,
): boolean {
  for (const child of children) {
    if (child.type === AST_NODE_TYPES.JSXExpressionContainer) {
      if (
        nodeReferencesChildren(
          child.expression,
          propsObjectNames,
          childrenValueNames,
        )
      ) {
        return true;
      }
    } else if (
      child.type === AST_NODE_TYPES.JSXElement ||
      child.type === AST_NODE_TYPES.JSXFragment ||
      child.type === AST_NODE_TYPES.JSXSpreadChild
    ) {
      if (nodeReferencesChildren(child, propsObjectNames, childrenValueNames)) {
        return true;
      }
    } else if (child.type === AST_NODE_TYPES.JSXText) {
      continue;
    }
  }
  return false;
}

function collectPropsObjectNamesForChildrenSourceIds(
  sourceIds: Set<string>,
  stack: FunctionContext[],
): Set<string> {
  const names = new Set<string>();
  for (const ctx of stack) {
    for (const [name, binding] of ctx.bindings) {
      if (sourceIds.has(binding.childrenSourceId)) {
        names.add(name);
      }
    }
  }
  return names;
}

function collectChildrenValueNamesForChildrenSourceIds(
  sourceIds: Set<string>,
  stack: FunctionContext[],
): Set<string> {
  const names = new Set<string>();
  for (const ctx of stack) {
    for (const [name, sourceId] of ctx.childrenValueSourceIds) {
      if (sourceIds.has(sourceId)) {
        names.add(name);
      }
    }
  }
  return names;
}

export const preventChildrenClobber = createRule<Options, MessageIds>({
  name: 'prevent-children-clobber',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent JSX spreads from silently discarding props.children',
      recommended: 'error',
      requiresTypeChecking: false,
    },
    schema: [],
    messages: {
      childrenClobbered:
        "Children clobber detected: JSX spreads {{spreadNames}} which may already contain children, but the element also declares its own children. The spread children are discarded. Destructure and render children explicitly (e.g., `{ children, ...rest }` and include `{children}`) or add `'children'` to an `Omit<>` if this component should not accept children.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode =
      (context as unknown as { sourceCode: TSESLint.SourceCode }).sourceCode ??
      context.getSourceCode();
    const aliasMap = new Map<string, TSESTree.TypeNode>();
    for (const node of sourceCode.ast.body) {
      if (node.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
        aliasMap.set(node.id.name, node.typeAnnotation);
      }
    }

    const functionStack: FunctionContext[] = [];

    return {
      ':function'(node: FunctionLike) {
        const ctx: FunctionContext = {
          isComponent: isComponentLike(node, context),
          bindings: new Map(),
          propsLikeIdentifiers: new Set(),
          childrenValueSourceIds: new Map(),
        };

        if (ctx.isComponent) {
          for (const param of node.params) {
            recordParamBindings(param, ctx, aliasMap);
          }
        }

        functionStack.push(ctx);
      },
      ':function:exit'() {
        functionStack.pop();
      },
      VariableDeclarator(node) {
        const componentCtx = findNearestComponentContext(functionStack);
        if (!componentCtx) return;

        const id = node.id;
        const init = node.init;

        if (
          id.type === AST_NODE_TYPES.Identifier &&
          init?.type === AST_NODE_TYPES.Identifier
        ) {
          const sourceBinding = findBinding(init.name, functionStack);
          const typeExcludes = typeAnnotationExcludesProperty(
            id.typeAnnotation,
            'children',
            aliasMap,
          );
          if (sourceBinding) {
            componentCtx.bindings.set(id.name, {
              identifier: id,
              childrenExcluded: sourceBinding.childrenExcluded,
              typeAnnotationExcludesProperty:
                sourceBinding.typeAnnotationExcludesProperty || typeExcludes,
              childrenSourceId: sourceBinding.childrenSourceId,
            });
          } else if (isPropsLike(init.name, functionStack)) {
            const propsLikeBinding = findBinding(init.name, functionStack);
            componentCtx.bindings.set(id.name, {
              identifier: id,
              childrenExcluded: false,
              typeAnnotationExcludesProperty: typeExcludes,
              childrenSourceId: propsLikeBinding?.childrenSourceId ?? init.name,
            });
          }

          if (isPropsLike(init.name, functionStack)) {
            componentCtx.propsLikeIdentifiers.add(id.name);
          }

          const childSourceId = findChildrenValueSourceId(
            init.name,
            functionStack,
          );
          if (childSourceId) {
            componentCtx.childrenValueSourceIds.set(id.name, childSourceId);
          }
        } else if (
          id.type === AST_NODE_TYPES.Identifier &&
          init &&
          (init.type === AST_NODE_TYPES.MemberExpression ||
            init.type === AST_NODE_TYPES.ChainExpression)
        ) {
          const member =
            init.type === AST_NODE_TYPES.ChainExpression
              ? (init.expression as TSESTree.Expression)
              : init;

          if (
            member.type === AST_NODE_TYPES.MemberExpression &&
            !member.computed &&
            member.property.type === AST_NODE_TYPES.Identifier &&
            member.property.name === 'children' &&
            member.object.type === AST_NODE_TYPES.Identifier
          ) {
            const sourceBinding = findBinding(
              member.object.name,
              functionStack,
            );
            if (sourceBinding) {
              componentCtx.childrenValueSourceIds.set(
                id.name,
                sourceBinding.childrenSourceId,
              );
            }
          }
        } else if (
          id.type === AST_NODE_TYPES.ObjectPattern &&
          init?.type === AST_NODE_TYPES.Identifier &&
          isPropsLike(init.name, functionStack)
        ) {
          const initBinding = findBinding(init.name, functionStack);
          const sourceChildrenSourceId =
            initBinding?.childrenSourceId ?? init.name;

          recordChildrenValueBindingsFromPattern(
            id,
            componentCtx,
            sourceChildrenSourceId,
          );
          collectRestBindingsFromPattern(
            id,
            componentCtx,
            id.typeAnnotation ?? null,
            aliasMap,
            sourceChildrenSourceId,
          );
        }
      },
      JSXElement(node) {
        const componentCtx = findNearestComponentContext(functionStack);
        if (!componentCtx) return;
        if (!hasExplicitChildren(node)) return;

        const spreadNamesInOrder: string[] = [];
        for (const attr of node.openingElement.attributes) {
          if (
            attr.type === AST_NODE_TYPES.JSXSpreadAttribute &&
            attr.argument.type === AST_NODE_TYPES.Identifier
          ) {
            spreadNamesInOrder.push(attr.argument.name);
          }
        }

        if (spreadNamesInOrder.length === 0) return;

        const offendingSpreads: Array<{
          name: string;
          childrenSourceId: string;
        }> = [];
        for (const name of spreadNamesInOrder) {
          const binding = findBinding(name, functionStack);
          if (!binding) continue;
          if (!bindingMayContainChildren(binding, context)) {
            continue;
          }
          offendingSpreads.push({
            name,
            childrenSourceId: binding.childrenSourceId,
          });
        }

        if (offendingSpreads.length === 0) return;

        const lastOffendingChildrenSourceId =
          offendingSpreads[offendingSpreads.length - 1].childrenSourceId;
        const lastSourceIds = new Set([lastOffendingChildrenSourceId]);
        const propsObjectNames = collectPropsObjectNamesForChildrenSourceIds(
          lastSourceIds,
          functionStack,
        );
        const childrenValueNames =
          collectChildrenValueNamesForChildrenSourceIds(
            lastSourceIds,
            functionStack,
          );
        if (
          childrenRenderSpreadChildren(
            node.children,
            propsObjectNames,
            childrenValueNames,
          )
        ) {
          return;
        }

        const clobberedNames = Array.from(
          new Set(
            offendingSpreads
              .filter(
                (spread) =>
                  spread.childrenSourceId === lastOffendingChildrenSourceId,
              )
              .map((spread) => spread.name),
          ),
        );
        context.report({
          node: node.openingElement,
          messageId: 'childrenClobbered',
          data: { spreadNames: clobberedNames.join(', ') },
        });
      },
    };
  },
});
