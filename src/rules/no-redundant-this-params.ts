import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'redundantInstanceArg' | 'redundantInstanceValueInObject';

type MethodMeta = {
  params: TSESTree.Parameter[];
  isStatic: boolean;
  isAbstract: boolean;
};

type ClassInfo = {
  methods: Map<string, MethodMeta>;
};

type ThisAccess = {
  node: TSESTree.MemberExpression | TSESTree.PrivateIdentifier;
  propertyName: string;
  nested: boolean;
  transformed: boolean;
};

export const noRedundantThisParams = createRule<[], MessageIds>({
  name: 'no-redundant-this-params',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow passing class instance members (this.foo) into class instance methods; access the member from this inside the method instead.',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [],
    messages: {
      redundantInstanceArg:
        'Method "{{methodName}}" receives "{{memberText}}"{{parameterNote}}. Instance state already lives on "this"; threading it through parameters duplicates class state and bloats the signature. Read "{{memberText}}" inside "{{methodName}}" instead of accepting it as an argument.',
      redundantInstanceValueInObject:
        'Method "{{methodName}}" receives an argument that contains "{{memberText}}"{{parameterNote}}. Routing instance state through parameters hides the shared `this` contract and complicates refactors. Remove that property from the call and read "{{memberText}}" directly inside "{{methodName}}".',
    },
  },
  defaultOptions: [],
  create(context) {
    const classInfoMap = new WeakMap<
      TSESTree.ClassDeclaration | TSESTree.ClassExpression,
      ClassInfo
    >();

    type PropertyStats = {
      callsWithProperty: number;
      violations: {
        methodMeta: MethodMeta;
        access: ThisAccess;
      }[];
    };

    type MethodStats = {
      totalCalls: number;
      // argIndex -> propertyName -> PropertyStats
      argStats: Map<number, Map<string, PropertyStats>>;
    };

    type ClassStats = {
      methods: Map<string, MethodStats>;
    };

    const classStatsMap = new WeakMap<
      TSESTree.ClassDeclaration | TSESTree.ClassExpression,
      ClassStats
    >();

    function isFunctionLike(
      node: TSESTree.Node | null | undefined,
    ): node is
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression
      | TSESTree.FunctionDeclaration {
      return (
        node?.type === AST_NODE_TYPES.FunctionExpression ||
        node?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        node?.type === AST_NODE_TYPES.FunctionDeclaration
      );
    }

    function getNameFromPropertyName(
      key: TSESTree.PropertyName,
    ): string | null {
      if (key.type === AST_NODE_TYPES.Identifier) {
        return key.name;
      }

      if (key.type === AST_NODE_TYPES.Literal) {
        return typeof key.value === 'string' ? key.value : String(key.value);
      }

      if (key.type === AST_NODE_TYPES.PrivateIdentifier) {
        return `#${key.name}`;
      }

      return null;
    }

    function getMethodNameFromCallee(
      callee: TSESTree.LeftHandSideExpression,
    ): string | null {
      const maybeChain = callee as TSESTree.Node;
      const unwrapped =
        maybeChain.type === AST_NODE_TYPES.ChainExpression
          ? (maybeChain as TSESTree.ChainExpression).expression
          : callee;

      if (
        unwrapped.type === AST_NODE_TYPES.MemberExpression &&
        !unwrapped.computed &&
        unwrapped.object.type === AST_NODE_TYPES.ThisExpression &&
        (unwrapped.property.type === AST_NODE_TYPES.Identifier ||
          unwrapped.property.type === AST_NODE_TYPES.PrivateIdentifier)
      ) {
        return getNameFromPropertyName(unwrapped.property);
      }

      return null;
    }

    function getMethodParams(
      member: TSESTree.MethodDefinition | TSESTree.TSAbstractMethodDefinition,
    ): TSESTree.Parameter[] {
      const value = member.value;

      if (
        value &&
        (value.type === AST_NODE_TYPES.FunctionExpression ||
          value.type === AST_NODE_TYPES.TSEmptyBodyFunctionExpression)
      ) {
        return value.params;
      }

      return [];
    }

    function getPropertyMethodParams(
      member: TSESTree.PropertyDefinition,
    ): TSESTree.Parameter[] {
      if (
        member.value &&
        (member.value.type === AST_NODE_TYPES.FunctionExpression ||
          member.value.type === AST_NODE_TYPES.ArrowFunctionExpression)
      ) {
        return member.value.params;
      }

      const annotation = member.typeAnnotation?.typeAnnotation;
      if (
        !member.value &&
        member.optional &&
        annotation &&
        annotation.type === AST_NODE_TYPES.TSFunctionType
      ) {
        return annotation.params;
      }

      return [];
    }

    function collectClassInfo(
      node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): void {
      const methods = new Map<string, MethodMeta>();

      function setMethod(methodName: string, meta: MethodMeta): void {
        /**
         * Prefer instance methods over static methods when names collide.
         * Calls like `this.method()` always resolve to the instance member, so the rule tracks the
         * instance signature even if a static overload exists in the AST.
         */
        const existing = methods.get(methodName);

        if (!existing) {
          methods.set(methodName, meta);
          return;
        }

        if (existing.isStatic && !meta.isStatic) {
          methods.set(methodName, meta);
          return;
        }

        if (!existing.isStatic && meta.isStatic) {
          return;
        }

        methods.set(methodName, meta);
      }

      for (const member of node.body.body) {
        if (
          member.type === AST_NODE_TYPES.MethodDefinition ||
          member.type === AST_NODE_TYPES.TSAbstractMethodDefinition
        ) {
          if (member.kind === 'constructor') {
            continue;
          }

          const methodName = getNameFromPropertyName(member.key);
          if (!methodName) {
            continue;
          }

          setMethod(methodName, {
            params: getMethodParams(member),
            isStatic: Boolean(member.static),
            isAbstract:
              member.type === AST_NODE_TYPES.TSAbstractMethodDefinition,
          });
        } else if (member.type === AST_NODE_TYPES.PropertyDefinition) {
          const methodName = member.key
            ? getNameFromPropertyName(member.key)
            : null;

          if (!methodName || member.static) {
            continue;
          }

          const params = getPropertyMethodParams(member);
          if (params.length === 0) {
            continue;
          }

          setMethod(methodName, {
            params,
            isStatic: false,
            isAbstract: false,
          });
        }
      }

      classInfoMap.set(node, { methods });
    }

    function findEnclosingClass(
      node: TSESTree.Node,
    ): TSESTree.ClassDeclaration | TSESTree.ClassExpression | null {
      let current: TSESTree.Node | undefined | null = node.parent;

      while (current) {
        if (
          current.type === AST_NODE_TYPES.ClassDeclaration ||
          current.type === AST_NODE_TYPES.ClassExpression
        ) {
          return current;
        }

        current = current.parent;
      }

      return null;
    }

    function findEnclosingMember(
      node: TSESTree.Node,
    ): TSESTree.MethodDefinition | TSESTree.PropertyDefinition | null {
      let current: TSESTree.Node | undefined | null = node.parent;

      while (current) {
        if (
          current.type === AST_NODE_TYPES.MethodDefinition ||
          current.type === AST_NODE_TYPES.PropertyDefinition
        ) {
          return current;
        }

        current = current.parent;
      }

      return null;
    }

    function getMemberFunction(
      member: TSESTree.MethodDefinition | TSESTree.PropertyDefinition | null,
    ): TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | null {
      if (!member) {
        return null;
      }

      if (
        member.type === AST_NODE_TYPES.MethodDefinition &&
        member.value &&
        member.value.type === AST_NODE_TYPES.FunctionExpression
      ) {
        return member.value;
      }

      if (
        member.type === AST_NODE_TYPES.PropertyDefinition &&
        member.value &&
        (member.value.type === AST_NODE_TYPES.FunctionExpression ||
          member.value.type === AST_NODE_TYPES.ArrowFunctionExpression)
      ) {
        return member.value;
      }

      return null;
    }

    function hasNestedFunctionBetween(
      leaf: TSESTree.Node,
      boundary: TSESTree.Node,
    ): boolean {
      let current: TSESTree.Node | null | undefined = leaf.parent;

      while (current && current !== boundary) {
        if (isFunctionLike(current)) {
          return true;
        }

        current = current.parent;
      }

      return false;
    }

    function isTransparentExpressionWrapper(node: TSESTree.Node): boolean {
      // Babel emits ParenthesizedExpression nodes that are not modeled in TSESTree; treating them
      // as transparent prevents parentheses from changing nested/transformed classification.
      return (
        node.type === AST_NODE_TYPES.TSAsExpression ||
        node.type === AST_NODE_TYPES.TSTypeAssertion ||
        node.type === AST_NODE_TYPES.TSNonNullExpression ||
        node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
        node.type === AST_NODE_TYPES.TSInstantiationExpression ||
        (node as { type?: string }).type === 'ParenthesizedExpression'
      );
    }

    function unwrapTransparentExpression(node: TSESTree.Node): TSESTree.Node {
      let current: TSESTree.Node = node;

      while (isTransparentExpressionWrapper(current)) {
        current = (current as any).expression;
      }

      return current;
    }

    function isExpressionMemberChainObject(node: TSESTree.Node): boolean {
      let current: TSESTree.Node = node;
      let parent: TSESTree.Node | null | undefined = current.parent;

      while (
        parent &&
        isTransparentExpressionWrapper(parent) &&
        (parent as any).expression === current
      ) {
        current = parent;
        parent = current.parent;
      }

      return (
        parent?.type === AST_NODE_TYPES.MemberExpression &&
        (parent as TSESTree.MemberExpression).object === current
      );
    }

    function getMemberText(propertyName: string): string {
      return `this.${propertyName}`;
    }

    function isTransformingNode(node: TSESTree.Node): boolean {
      switch (node.type) {
        case AST_NODE_TYPES.CallExpression:
        case AST_NODE_TYPES.NewExpression:
        case AST_NODE_TYPES.TaggedTemplateExpression:
        case AST_NODE_TYPES.TemplateLiteral:
        case AST_NODE_TYPES.BinaryExpression:
        case AST_NODE_TYPES.LogicalExpression:
        case AST_NODE_TYPES.ConditionalExpression:
        case AST_NODE_TYPES.SequenceExpression:
        case AST_NODE_TYPES.UnaryExpression:
        case AST_NODE_TYPES.UpdateExpression:
        case AST_NODE_TYPES.AwaitExpression:
        case AST_NODE_TYPES.YieldExpression:
        case AST_NODE_TYPES.AssignmentExpression:
          return true;
        default:
          return false;
      }
    }

    function collectThisAccesses(expression: TSESTree.Node): ThisAccess[] {
      const normalized = unwrapTransparentExpression(expression);
      const results: ThisAccess[] = [];

      function visit(
        node: TSESTree.Node,
        nested: boolean,
        transformed: boolean,
      ): void {
        const isParenthesized =
          (node as { type?: string }).type === 'ParenthesizedExpression';
        const isMemberChainObject = isExpressionMemberChainObject(node);

        if (isParenthesized) {
          visit(
            (node as any).expression,
            nested || (node !== normalized && !isMemberChainObject),
            transformed,
          );
          return;
        }

        const nextNested =
          nested || (node !== normalized && !isMemberChainObject);
        const nextTransformed = transformed || isTransformingNode(node);

        switch (node.type) {
          case AST_NODE_TYPES.MemberExpression: {
            if (
              !node.computed &&
              node.object.type === AST_NODE_TYPES.ThisExpression &&
              (node.property.type === AST_NODE_TYPES.Identifier ||
                node.property.type === AST_NODE_TYPES.PrivateIdentifier)
            ) {
              const propertyName = getNameFromPropertyName(node.property);
              if (propertyName && !nextTransformed) {
                results.push({
                  node,
                  propertyName,
                  nested: nextNested,
                  transformed: nextTransformed,
                });
                return;
              }
            }

            visit(node.object, nextNested, nextTransformed);
            if (node.computed) {
              visit(node.property, true, nextTransformed);
            }
            return;
          }
          case AST_NODE_TYPES.ChainExpression:
            visit(node.expression, nextNested, nextTransformed);
            return;
          case AST_NODE_TYPES.ObjectExpression:
            for (const prop of node.properties) {
              if (prop.type === AST_NODE_TYPES.Property) {
                if (prop.computed) {
                  visit(prop.key, true, nextTransformed);
                }
                visit(prop.value, true, nextTransformed);
              } else if (prop.type === AST_NODE_TYPES.SpreadElement) {
                visit(prop.argument, true, nextTransformed);
              }
            }
            return;
          case AST_NODE_TYPES.ArrayExpression:
            for (const element of node.elements) {
              if (!element) {
                continue;
              }

              if (element.type === AST_NODE_TYPES.SpreadElement) {
                visit(element.argument, true, nextTransformed);
                continue;
              }

              visit(element, true, nextTransformed);
            }
            return;
          case AST_NODE_TYPES.CallExpression:
          case AST_NODE_TYPES.NewExpression:
            for (const arg of node.arguments) {
              if (arg) {
                visit(arg as TSESTree.Node, true, true);
              }
            }
            return;
          case AST_NODE_TYPES.SpreadElement:
            visit(node.argument, true, nextTransformed);
            return;
          case AST_NODE_TYPES.BinaryExpression:
          case AST_NODE_TYPES.LogicalExpression:
            visit(node.left, true, true);
            visit(node.right, true, true);
            return;
          case AST_NODE_TYPES.ConditionalExpression:
            visit(node.test, true, true);
            visit(node.consequent, true, true);
            visit(node.alternate, true, true);
            return;
          case AST_NODE_TYPES.TemplateLiteral:
            node.expressions.forEach((expr) => visit(expr, true, true));
            return;
          case AST_NODE_TYPES.TaggedTemplateExpression:
            visit(node.tag, true, true);
            visit(node.quasi, true, true);
            return;
          case AST_NODE_TYPES.SequenceExpression:
            node.expressions.forEach((expr) => visit(expr, true, true));
            return;
          case AST_NODE_TYPES.UnaryExpression:
          case AST_NODE_TYPES.UpdateExpression:
          case AST_NODE_TYPES.AwaitExpression:
          case AST_NODE_TYPES.YieldExpression:
            if (node.argument) {
              visit(node.argument, true, true);
            }
            return;
          case AST_NODE_TYPES.AssignmentExpression:
            visit(node.left as TSESTree.Node, true, true);
            visit(node.right, true, true);
            return;
          case AST_NODE_TYPES.TSAsExpression:
          case AST_NODE_TYPES.TSTypeAssertion:
          case AST_NODE_TYPES.TSNonNullExpression:
          case AST_NODE_TYPES.TSSatisfiesExpression:
          case AST_NODE_TYPES.TSInstantiationExpression:
            visit(node.expression, nextNested, nextTransformed);
            return;
          default:
            if (isFunctionLike(node)) {
              return;
            }
        }
      }

      visit(normalized, false, false);
      return results;
    }

    function getParameterName(
      param: TSESTree.Parameter | undefined,
    ): string | null {
      if (!param) {
        return null;
      }

      if (param.type === AST_NODE_TYPES.Identifier) {
        return param.name;
      }

      if (param.type === AST_NODE_TYPES.AssignmentPattern) {
        if (param.left.type === AST_NODE_TYPES.Identifier) {
          return param.left.name;
        }
        if (param.left.type === AST_NODE_TYPES.ObjectPattern) {
          return null;
        }
      }

      if (param.type === AST_NODE_TYPES.RestElement) {
        return param.argument.type === AST_NODE_TYPES.Identifier
          ? param.argument.name
          : null;
      }

      if (param.type === AST_NODE_TYPES.TSParameterProperty) {
        const { parameter } = param;

        if (parameter.type === AST_NODE_TYPES.Identifier) {
          return parameter.name;
        }

        if (
          parameter.type === AST_NODE_TYPES.AssignmentPattern &&
          parameter.left.type === AST_NODE_TYPES.Identifier
        ) {
          return parameter.left.name;
        }
      }

      return null;
    }

    function buildParameterNote(paramName: string | null): string {
      return paramName ? ` (parameter "${paramName}")` : '';
    }

    function reportAccess(
      methodName: string,
      methodMeta: MethodMeta,
      argIndex: number,
      access: ThisAccess,
    ): void {
      const paramName = getParameterName(methodMeta.params[argIndex]);
      const parameterNote = buildParameterNote(paramName);
      const memberText = getMemberText(access.propertyName);
      const messageId = access.nested
        ? 'redundantInstanceValueInObject'
        : 'redundantInstanceArg';

      context.report({
        node: access.node as TSESTree.Node,
        messageId,
        data: {
          methodName,
          memberText,
          parameterNote,
        },
      });
    }

    return {
      'ClassDeclaration, ClassExpression'(
        node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
      ) {
        collectClassInfo(node);
        classStatsMap.set(node, { methods: new Map() });
      },

      'ClassDeclaration, ClassExpression:exit'(
        node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
      ) {
        const stats = classStatsMap.get(node);
        if (!stats) {
          return;
        }

        for (const [methodName, methodStats] of stats.methods) {
          for (const [argIndex, argProperties] of methodStats.argStats) {
            for (const [, propStats] of argProperties) {
              if (propStats.callsWithProperty === methodStats.totalCalls) {
                for (const violation of propStats.violations) {
                  reportAccess(
                    methodName,
                    violation.methodMeta,
                    argIndex,
                    violation.access,
                  );
                }
              }
            }
          }
        }
      },

      CallExpression(node: TSESTree.CallExpression) {
        const methodName = getMethodNameFromCallee(node.callee);
        if (!methodName || methodName === 'constructor') {
          return;
        }

        const classNode = findEnclosingClass(node);
        if (!classNode) {
          return;
        }

        const classInfo = classInfoMap.get(classNode);
        const methodMeta = classInfo?.methods.get(methodName);

        if (!methodMeta || methodMeta.isStatic) {
          return;
        }

        const member = findEnclosingMember(node);
        const memberFunction = getMemberFunction(member);

        if (memberFunction) {
          if (hasNestedFunctionBetween(node, memberFunction)) {
            return;
          }
        } else {
          if (!member || member.type !== AST_NODE_TYPES.PropertyDefinition) {
            return;
          }

          if (hasNestedFunctionBetween(node, member)) {
            return;
          }
        }

        const stats = classStatsMap.get(classNode);
        if (!stats) {
          return;
        }

        let methodStats = stats.methods.get(methodName);
        if (!methodStats) {
          methodStats = { totalCalls: 0, argStats: new Map() };
          stats.methods.set(methodName, methodStats);
        }
        const currentMethodStats = methodStats;
        currentMethodStats.totalCalls++;

        const seenInThisCall = new Set<string>();

        node.arguments.forEach((arg, index) => {
          if (!arg) {
            return;
          }

          const targetNode =
            arg.type === AST_NODE_TYPES.SpreadElement ? arg.argument : arg;
          const accesses = collectThisAccesses(targetNode);

          for (const access of accesses) {
            const key = `${index}:${access.propertyName}`;

            let argMap = currentMethodStats.argStats.get(index);
            if (!argMap) {
              argMap = new Map();
              currentMethodStats.argStats.set(index, argMap);
            }

            let propStats = argMap.get(access.propertyName);
            if (!propStats) {
              propStats = { callsWithProperty: 0, violations: [] };
              argMap.set(access.propertyName, propStats);
            }

            propStats.violations.push({
              methodMeta: methodMeta,
              access,
            });

            if (!seenInThisCall.has(key)) {
              propStats.callsWithProperty++;
              seenInThisCall.add(key);
            }
          }
        });
      },
    };
  },
});
