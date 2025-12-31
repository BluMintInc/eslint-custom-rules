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

function isComponentLike(node: FunctionLike): boolean {
  const name = resolveFunctionName(node);
  if (name && /^[A-Z]/.test(name)) {
    return true;
  }

  return ASTHelpers.returnsJSX(node.body);
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
      });
    } else if (
      prop.type === AST_NODE_TYPES.Property &&
      prop.value.type === AST_NODE_TYPES.ObjectPattern
    ) {
      collectRestBindingsFromPattern(prop.value, ctx, null, aliasMap);
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
    ).sourceCode?.parserServices ?? (context.parserServices as MinimalParserServices);
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
  spreadNames: Set<string>,
): boolean {
  const stack: TSESTree.Node[] = [node];
  while (stack.length) {
    const current = stack.pop()!;
    if (current.type === AST_NODE_TYPES.Identifier) {
      if (current.name === 'children') return true;
    } else if (current.type === AST_NODE_TYPES.MemberExpression) {
      if (
        !current.computed &&
        current.property.type === AST_NODE_TYPES.Identifier &&
        current.property.name === 'children' &&
        current.object.type === AST_NODE_TYPES.Identifier &&
        spreadNames.has(current.object.name)
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
  spreadNames: Set<string>,
): boolean {
  for (const child of children) {
    if (child.type === AST_NODE_TYPES.JSXExpressionContainer) {
      if (nodeReferencesChildren(child.expression, spreadNames)) {
        return true;
      }
    } else if (
      child.type === AST_NODE_TYPES.JSXElement ||
      child.type === AST_NODE_TYPES.JSXFragment ||
      child.type === AST_NODE_TYPES.JSXSpreadChild
    ) {
      if (nodeReferencesChildren(child, spreadNames)) {
        return true;
      }
    } else if (child.type === AST_NODE_TYPES.JSXText) {
      continue;
    }
  }
  return false;
}

export const preventChildrenClobber = createRule<Options, MessageIds>({
  name: 'prevent-children-clobber',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent JSX spreads from silently discarding props.children',
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
          isComponent: isComponentLike(node),
          bindings: new Map(),
          propsLikeIdentifiers: new Set(),
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
            });
          } else if (isPropsLike(init.name, functionStack)) {
            componentCtx.bindings.set(id.name, {
              identifier: id,
              childrenExcluded: false,
              typeAnnotationExcludesProperty: typeExcludes,
            });
          }

          if (isPropsLike(init.name, functionStack)) {
            componentCtx.propsLikeIdentifiers.add(id.name);
          }
        } else if (
          id.type === AST_NODE_TYPES.ObjectPattern &&
          init?.type === AST_NODE_TYPES.Identifier &&
          isPropsLike(init.name, functionStack)
        ) {
          collectRestBindingsFromPattern(
            id,
            componentCtx,
            id.typeAnnotation ?? null,
            aliasMap,
          );
        }
      },
      JSXElement(node) {
        const componentCtx = findNearestComponentContext(functionStack);
        if (!componentCtx) return;
        if (!hasExplicitChildren(node)) return;

        const spreadNames = new Set<string>();
        for (const attr of node.openingElement.attributes) {
          if (
            attr.type === AST_NODE_TYPES.JSXSpreadAttribute &&
            attr.argument.type === AST_NODE_TYPES.Identifier
          ) {
            spreadNames.add(attr.argument.name);
          }
        }

        if (spreadNames.size === 0) return;

        const offendingNames: string[] = [];
        for (const name of spreadNames) {
          const binding = findBinding(name, functionStack);
          if (!binding) continue;
          if (!bindingMayContainChildren(binding, context)) {
            continue;
          }
          offendingNames.push(name);
        }

        if (offendingNames.length === 0) return;

        const offendingSet = new Set(offendingNames);
        if (childrenRenderSpreadChildren(node.children, offendingSet)) {
          return;
        }

        context.report({
          node: node.openingElement,
          messageId: 'childrenClobbered',
          data: { spreadNames: offendingNames.join(', ') },
        });
      },
    };
  },
});
