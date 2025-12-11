import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type Options = [
  {
    props?: string[];
    allowRenderProps?: boolean;
    allowModuleScopeFactories?: boolean;
  },
];

type MessageIds = 'inlineComponentProp';

const DEFAULT_PROP_PATTERNS = ['CatalogWrapper', '*Wrapper', '*Component'];

const DEFAULT_OPTIONS: Required<Options[number]> = {
  props: DEFAULT_PROP_PATTERNS,
  allowRenderProps: true,
  allowModuleScopeFactories: true,
};

const INLINE_COMPONENT_NAME = 'inline component';

function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function matchesPattern(name: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.includes('*')) {
    const patternComplexity = (pattern.match(/\*/g) || []).length;
    if (patternComplexity > 2) {
      return false;
    }
    const escaped = pattern
      .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(name);
  }
  return name === pattern;
}

function isRenderPropName(name: string): boolean {
  if (name === 'children' || name === 'child' || name === 'render') {
    return true;
  }
  if (name.startsWith('render')) {
    return true;
  }
  return (
    name === 'rowRenderer' ||
    name === 'cellRenderer' ||
    name === 'itemRenderer' ||
    name === 'renderItem' ||
    name === 'renderRow'
  );
}

function unwrapExpression(
  expr: TSESTree.Expression | null | undefined,
): TSESTree.Expression | null {
  let current = expr;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression
    ) {
      current = current.expression;
      continue;
    }
    if (current.type === AST_NODE_TYPES.ChainExpression) {
      current = current.expression;
      continue;
    }
    break;
  }
  return current ?? null;
}

function isReactCreateElementCall(expr: TSESTree.Expression): boolean {
  if (expr.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = expr.callee;
  if (
    callee.type === AST_NODE_TYPES.Identifier &&
    callee.name === 'createElement'
  ) {
    return true;
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'createElement'
  ) {
    if (
      callee.object.type === AST_NODE_TYPES.Identifier &&
      callee.object.name === 'React'
    ) {
      return true;
    }
  }
  return false;
}

function returnsCreateElement(node: TSESTree.Node): boolean {
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    isReactCreateElementCall(node)
  ) {
    return true;
  }

  if (node.type === AST_NODE_TYPES.BlockStatement) {
    for (const statement of node.body) {
      if (
        statement.type === AST_NODE_TYPES.ReturnStatement &&
        statement.argument &&
        statement.argument.type === AST_NODE_TYPES.CallExpression &&
        isReactCreateElementCall(statement.argument)
      ) {
        return true;
      }
    }
  }

  return false;
}

function isFunctionNode(
  node: TSESTree.Node | null | undefined,
): node is
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration {
  if (!node) return false;
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

function getCalleeName(
  callee: TSESTree.LeftHandSideExpression,
): string | null {
  const unwrapped = unwrapExpression(callee as TSESTree.Expression);
  if (!unwrapped) return null;
  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    return unwrapped.name;
  }
  if (
    unwrapped.type === AST_NODE_TYPES.MemberExpression &&
    !unwrapped.computed &&
    unwrapped.property.type === AST_NODE_TYPES.Identifier
  ) {
    const prop = unwrapped.property.name;
    if (
      unwrapped.object.type === AST_NODE_TYPES.Identifier &&
      unwrapped.object.name
    ) {
      return `${unwrapped.object.name}.${prop}`;
    }
    return prop;
  }
  return null;
}

function getFunctionFromCall(
  call: TSESTree.CallExpression,
):
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | undefined {
  const calleeName = getCalleeName(call.callee);
  const firstArg = unwrapExpression(
    (call.arguments[0] as TSESTree.Expression | null | undefined) ?? null,
  );
  if (!firstArg || !isFunctionNode(firstArg)) {
    return undefined;
  }
  if (
    calleeName === 'useCallback' ||
    calleeName === 'React.useCallback' ||
    calleeName === 'useMemo' ||
    calleeName === 'React.useMemo' ||
    calleeName === 'memo' ||
    calleeName === 'React.memo' ||
    calleeName === 'forwardRef' ||
    calleeName === 'React.forwardRef'
  ) {
    return firstArg;
  }
  return undefined;
}

function getFunctionFromInit(
  init: TSESTree.Expression | null | undefined,
):
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration
  | undefined {
  const unwrapped = unwrapExpression(init);
  if (!unwrapped) return undefined;
  if (isFunctionNode(unwrapped)) {
    return unwrapped;
  }
  if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
    return getFunctionFromCall(unwrapped);
  }
  return undefined;
}

function isInModuleScope(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined | null = node.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      current.type === AST_NODE_TYPES.MethodDefinition
    ) {
      return false;
    }
    if (current.type === AST_NODE_TYPES.Program) {
      return true;
    }
    current = current.parent;
  }
  return true;
}

function isComponentLikeFunction(
  fn:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
  displayName?: string,
): boolean {
  const body = fn.body;
  const hasJSX =
    !!body && ASTHelpers.returnsJSX(body as unknown as TSESTree.Node);

  const expressionBody =
    fn.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    fn.body.type !== AST_NODE_TYPES.BlockStatement
      ? fn.body
      : null;

  const hasCreateElement =
    (expressionBody && isReactCreateElementCall(expressionBody)) ||
    (body ? returnsCreateElement(body as unknown as TSESTree.Node) : false);

  const looksLikeComponent = displayName ? isPascalCase(displayName) : false;
  return hasJSX || hasCreateElement || looksLikeComponent;
}

function findVariableInScopes(
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  identifier: TSESTree.Identifier,
): TSESLint.Scope.Variable | undefined {
  const sourceCode = context.getSourceCode() as TSESLint.SourceCode & {
    getScope?: (node: TSESTree.Node) => TSESLint.Scope.Scope | null;
  };
  let scope: TSESLint.Scope.Scope | null =
    sourceCode.getScope?.(identifier) ?? context.getScope();
  while (scope) {
    const variable = scope.variables.find((v) => v.name === identifier.name);
    if (variable) return variable;
    scope = scope.upper;
  }
  return undefined;
}

function findObjectPropertyFunction(
  objExpr: TSESTree.ObjectExpression,
  propertyName: string,
):
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | undefined {
  for (const prop of objExpr.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;
    if (prop.computed) continue;
    if (prop.key.type === AST_NODE_TYPES.Identifier) {
      if (prop.key.name !== propertyName) continue;
    } else if (
      prop.key.type === AST_NODE_TYPES.Literal &&
      prop.key.value === propertyName
    ) {
      // match
    } else {
      continue;
    }
    const value = unwrapExpression(
      prop.value as TSESTree.Expression | null | undefined,
    );
    if (value && isFunctionNode(value)) {
      return value;
    }
  }
  return undefined;
}

export const noInlineComponentProp = createRule<Options, MessageIds>({
  name: 'no-inline-component-prop',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prevent inline function components defined in render from being passed to component-type props like CatalogWrapper to avoid remounts and UI flashes.',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          props: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_PROP_PATTERNS,
          },
          allowRenderProps: {
            type: 'boolean',
            default: true,
          },
          allowModuleScopeFactories: {
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      inlineComponentProp:
        'Inline component "{{componentName}}" is created inside a render scope and passed to component-type prop "{{propName}}". React treats it as a new component whenever the scope re-runs, remounting its subtree and causing UI flashes. Move the wrapper to module scope (optionally memoize with React.memo) and pass changing data via props or context instead.',
    },
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(context, [options]) {
    const resolvedOptions = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
    const propPatterns = resolvedOptions.props ?? DEFAULT_PROP_PATTERNS;
    const parserServices = context.parserServices;
    const checker = parserServices?.program?.getTypeChecker();
    const esTreeNodeToTSNodeMap = parserServices?.esTreeNodeToTSNodeMap;

    function isComponentTypeByTypeInfo(
      attribute: TSESTree.JSXAttribute,
    ): boolean {
      if (!checker || !esTreeNodeToTSNodeMap) return false;
      const tsNode = esTreeNodeToTSNodeMap.get(attribute);
      if (!tsNode) return false;
      let type: ts.Type | undefined;
      if (ts.isExpression(tsNode)) {
        type =
          checker.getContextualType(tsNode as ts.Expression) ??
          checker.getTypeAtLocation(tsNode as ts.Expression);
      } else {
        type = checker.getTypeAtLocation(tsNode as ts.Node);
      }
      if (!type) return false;
      const typeText = checker.typeToString(type);
      return (
        typeText.includes('ComponentType') ||
        typeText.includes('FunctionComponent') ||
        typeText.includes('ReactElement') ||
        typeText.includes('FC')
      );
    }

    function isTargetProp(
      attribute: TSESTree.JSXAttribute,
      name: string,
    ): boolean {
      if (resolvedOptions.allowRenderProps && isRenderPropName(name)) {
        return false;
      }
      const patternMatch = propPatterns.some((pattern) =>
        matchesPattern(name, pattern),
      );
      const looksComponent =
        isPascalCase(name) || name.endsWith('Wrapper') || name.endsWith('Component');
      if (patternMatch) {
        return true;
      }
      if (looksComponent) {
        return isComponentTypeByTypeInfo(attribute);
      }
      return false;
    }

    function shouldReportDefinition(
      definition: TSESLint.Scope.Definition,
      displayName: string | undefined,
    ): boolean {
      if (
        definition.type === 'ImportBinding' ||
        definition.type === 'Parameter' ||
        definition.type === 'Type'
      ) {
        return false;
      }

      const defNode = definition.node;
      const moduleScoped = isInModuleScope(defNode);
      if (moduleScoped && resolvedOptions.allowModuleScopeFactories) {
        return false;
      }

      let fnNode:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration
        | undefined;

      if (defNode.type === AST_NODE_TYPES.FunctionDeclaration) {
        fnNode = defNode;
      } else if (defNode.type === AST_NODE_TYPES.VariableDeclarator) {
        fnNode = getFunctionFromInit(defNode.init);
      } else {
        return false;
      }

      if (!fnNode) return false;
      return isComponentLikeFunction(fnNode, displayName);
    }

    function report(
      node: TSESTree.Node,
      propName: string,
      componentName: string,
    ): void {
      context.report({
        node,
        messageId: 'inlineComponentProp',
        data: { propName, componentName },
      });
    }

    function handleIdentifierExpression(
      identifier: TSESTree.Identifier,
      propName: string,
    ): void {
      const variable = findVariableInScopes(context, identifier);
      if (!variable) return;
      const definition = variable.defs.find(
        (def) =>
          (def.node.type === AST_NODE_TYPES.FunctionDeclaration ||
            def.node.type === AST_NODE_TYPES.VariableDeclarator) &&
          def.type !== 'Parameter' &&
          def.type !== 'ImportBinding',
      );
      if (!definition) return;
      if (shouldReportDefinition(definition, identifier.name)) {
        report(identifier, propName, identifier.name);
      }
    }

    function handleMemberExpression(
      member: TSESTree.MemberExpression,
      propName: string,
    ): void {
      if (member.computed) return;
      if (member.property.type !== AST_NODE_TYPES.Identifier) return;
      const objectId = member.object;
      if (objectId.type !== AST_NODE_TYPES.Identifier) return;

      const variable = findVariableInScopes(context, objectId);
      if (!variable) return;
      const definition = variable.defs.find(
        (def) =>
          def.node.type === AST_NODE_TYPES.VariableDeclarator &&
          def.node.id.type === AST_NODE_TYPES.Identifier &&
          def.node.id.name === objectId.name &&
          def.type !== 'ImportBinding' &&
          def.type !== 'Parameter' &&
          def.type !== 'Type',
      );
      if (!definition) return;
      const defNode = definition.node;
      if (
        !defNode ||
        defNode.type !== AST_NODE_TYPES.VariableDeclarator ||
        !defNode.init ||
        defNode.init.type !== AST_NODE_TYPES.ObjectExpression
      ) {
        return;
      }

      if (isInModuleScope(defNode) && resolvedOptions.allowModuleScopeFactories) {
        return;
      }

      const fnNode = findObjectPropertyFunction(
        defNode.init,
        member.property.name,
      );
      if (fnNode && isComponentLikeFunction(fnNode, member.property.name)) {
        report(member, propName, member.property.name);
      }
    }

    function handleInlineFunctionExpression(
      fn:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration,
      propName: string,
    ): void {
      const explicitName =
        fn.type === AST_NODE_TYPES.FunctionExpression ? fn.id?.name : undefined;
      if (!isComponentLikeFunction(fn, explicitName)) {
        return;
      }
      const displayName =
        (fn.type === AST_NODE_TYPES.FunctionExpression && fn.id?.name) ||
        INLINE_COMPONENT_NAME;
      report(fn, propName, displayName);
    }

    function handleCallExpression(
      call: TSESTree.CallExpression,
      propName: string,
    ): void {
      const fnNode = getFunctionFromCall(call);
      if (!fnNode) return;
      if (isComponentLikeFunction(fnNode)) {
        report(call, propName, INLINE_COMPONENT_NAME);
      }
    }

    return {
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (!node.name || node.name.type !== AST_NODE_TYPES.JSXIdentifier) {
          return;
        }
        const propName = node.name.name;
        if (!isTargetProp(node, propName)) return;

        if (
          !node.value ||
          node.value.type !== AST_NODE_TYPES.JSXExpressionContainer
        ) {
          return;
        }

        if (
          node.value.expression.type === AST_NODE_TYPES.JSXEmptyExpression
        ) {
          return;
        }

        const expression = unwrapExpression(
          node.value.expression as TSESTree.Expression,
        );
        if (!expression) return;

        if (
          expression.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          expression.type === AST_NODE_TYPES.FunctionExpression
        ) {
          handleInlineFunctionExpression(expression, propName);
          return;
        }

        if (expression.type === AST_NODE_TYPES.CallExpression) {
          handleCallExpression(expression, propName);
          return;
        }

        if (expression.type === AST_NODE_TYPES.Identifier) {
          handleIdentifierExpression(expression, propName);
          return;
        }

        if (expression.type === AST_NODE_TYPES.MemberExpression) {
          handleMemberExpression(expression, propName);
        }
      },
    };
  },
});
