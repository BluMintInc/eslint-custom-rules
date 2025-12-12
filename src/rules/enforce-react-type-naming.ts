import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'reactNodeShouldBeLowercase'
  | 'componentTypeShouldBeUppercase';

// Types that should have lowercase variable names
const LOWERCASE_TYPES = ['ReactNode', 'JSX.Element'];

// Types that should have uppercase variable names
const UPPERCASE_TYPES = ['ComponentType', 'FC', 'FunctionComponent'];
const TARGET_TYPES = new Set([...LOWERCASE_TYPES, ...UPPERCASE_TYPES]);

export const enforceReactTypeNaming = createRule<[], MessageIds>({
  name: 'enforce-react-type-naming',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce naming conventions for React types',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      reactNodeShouldBeLowercase:
        'Type "{{type}}" holds rendered output; start names with a lowercase letter (e.g., "{{suggestion}}") so it reads as a value rather than a component.',
      componentTypeShouldBeUppercase:
        'Type "{{type}}" represents a component; start names with an uppercase letter (e.g., "{{suggestion}}") so JSX treats it as a component instead of a DOM tag.',
    },
  },
  defaultOptions: [],
  create(context, _options): TSESLint.RuleListener {
    const sourceCode = context.getSourceCode();
    type AnyIdentifier = TSESTree.Identifier | TSESTree.JSXIdentifier;

    function getScopeForNode(node: TSESTree.Node): TSESLint.Scope.Scope | null {
      const scopeManager = sourceCode.scopeManager;
      if (!scopeManager) return context.getScope();

      let current: TSESTree.Node | undefined = node;
      while (current) {
        const scope = scopeManager.acquire(current);
        if (scope) return scope;
        current = current.parent;
      }

      return scopeManager.scopes[0] ?? context.getScope();
    }

    function findVariable(
      identifier: AnyIdentifier,
    ): TSESLint.Scope.Variable | null {
      let scope: TSESLint.Scope.Scope | null = getScopeForNode(identifier);

      for (; scope; scope = scope.upper) {
        const variable = scope.variables.find((candidate) => {
          if (candidate.name !== identifier.name) return false;
          return (
            candidate.identifiers.some(
              (id) =>
                id.range[0] === identifier.range[0] &&
                id.range[1] === identifier.range[1],
            ) ||
            candidate.references.some(
              (ref) =>
                ref.identifier.range[0] === identifier.range[0] &&
                ref.identifier.range[1] === identifier.range[1],
            )
          );
        });
        if (variable) return variable;
      }
      return null;
    }

    function collectRenameTargets(variable: TSESLint.Scope.Variable): AnyIdentifier[] {
      const targets = new Map<string, AnyIdentifier>();
      const addTarget = (node: AnyIdentifier) => {
        const key = `${node.range[0]}:${node.range[1]}`;
        if (!targets.has(key)) {
          targets.set(key, node);
        }
      };

      for (const id of variable.identifiers) {
        if (
          id.type === AST_NODE_TYPES.Identifier ||
          id.type === AST_NODE_TYPES.JSXIdentifier
        ) {
          addTarget(id);
        }
      }

      for (const ref of variable.references) {
        const id = ref.identifier;
        if (
          id.type === AST_NODE_TYPES.Identifier ||
          id.type === AST_NODE_TYPES.JSXIdentifier
        ) {
          addTarget(id);
        }
      }

      const visit = (node: TSESTree.Node) => {
        if (
          (node.type === AST_NODE_TYPES.Identifier ||
            node.type === AST_NODE_TYPES.JSXIdentifier) &&
          node.name === variable.name
        ) {
          const resolvedVariable = findVariable(node);
          if (resolvedVariable === variable) {
            addTarget(node);
        }
        }

        const keys = sourceCode.visitorKeys[node.type] ?? [];
        for (const key of keys) {
          const value = (node as unknown as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            for (const child of value) {
              if (child && typeof (child as TSESTree.Node).type === 'string') {
                visit(child as TSESTree.Node);
              }
            }
          } else if (
            value &&
            typeof (value as TSESTree.Node).type === 'string'
          ) {
            visit(value as TSESTree.Node);
          }
        }
      };

      visit(sourceCode.ast);

      const collectedTargets = Array.from(targets.values());

      if (process.env.DEBUG_REACT_NAMING === 'true') {
        // eslint-disable-next-line no-console
        console.log(
          'rename targets',
          variable.name,
          collectedTargets.map((target) => ({
            type: target.type,
            text: sourceCode.getText(target),
            range: target.range,
          })),
        );
      }

      return collectedTargets;
    }

    function isJsxElementName(node: AnyIdentifier): boolean {
      const parent = node.parent;
      return (
        parent?.type === AST_NODE_TYPES.JSXOpeningElement ||
        parent?.type === AST_NODE_TYPES.JSXClosingElement ||
        parent?.type === AST_NODE_TYPES.JSXIdentifier ||
        parent?.type === AST_NODE_TYPES.JSXMemberExpression
      );
    }

    function buildRenameFix(
      variable: TSESLint.Scope.Variable | null,
      newName: string,
      { allowJsx }: { allowJsx: boolean },
    ): TSESLint.ReportFixFunction | undefined {
      if (!variable) return undefined;
      const targets = collectRenameTargets(variable);

      if (!allowJsx && targets.some(isJsxElementName)) {
        return undefined;
      }

      if (process.env.DEBUG_REACT_NAMING === 'true') {
        // eslint-disable-next-line no-console
        console.log(
          'build fix',
          variable.name,
          newName,
          targets.map((identifier) => ({
            type: identifier.type,
            text: sourceCode.getText(identifier),
            range: identifier.range,
          })),
        );
      }

      const orderedTargets = [...targets].sort(
        (left, right) => right.range[0] - left.range[0],
      );

      return (fixer) =>
        orderedTargets.map((identifier) =>
          fixer.replaceText(identifier, newName),
        );
    }

    /**
     * Checks if a string starts with an uppercase letter
     */
    function isUppercase(str: string): boolean {
      return /^[A-Z]/.test(str);
    }

    /**
     * Converts a string to start with lowercase
     */
    function toLowercase(str: string): string {
      if (!str) return str;
      return str.charAt(0).toLowerCase() + str.slice(1);
    }

    /**
     * Converts a string to start with uppercase
     */
    function toUppercase(str: string): string {
      if (!str) return str;
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Builds a qualified name (e.g., JSX.Element) from a type reference
     */
    function getQualifiedName(
      typeName: TSESTree.TSTypeReference['typeName'],
    ): string | null {
      if (typeName.type === AST_NODE_TYPES.Identifier) {
        return typeName.name;
      }
      if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
        const left =
          typeName.left.type === AST_NODE_TYPES.Identifier
            ? typeName.left.name
            : getQualifiedName(typeName.left);
        if (!left) return null;
        return `${left}.${typeName.right.name}`;
      }
      return null;
    }

    /**
     * Extracts the React-related type name from a type annotation, unwrapping
     * unions/intersections, readonly/array wrappers, and generic wrappers.
     */
    function getTypeName(
      typeAnnotation: TSESTree.TypeNode | undefined,
    ): string | null {
      if (!typeAnnotation) return null;

      const maybeParenthesized = typeAnnotation as unknown as {
        type?: string;
        typeAnnotation?: TSESTree.TypeNode;
      };
      if (maybeParenthesized.type === 'TSParenthesizedType') {
        return getTypeName(maybeParenthesized.typeAnnotation);
      }

      switch (typeAnnotation.type) {
        case AST_NODE_TYPES.TSUnionType:
        case AST_NODE_TYPES.TSIntersectionType: {
          for (const inner of typeAnnotation.types) {
            const name = getTypeName(inner);
            if (name) return name;
          }
          return null;
        }
        case AST_NODE_TYPES.TSArrayType:
          return getTypeName(typeAnnotation.elementType);
        case AST_NODE_TYPES.TSTypeOperator:
          return getTypeName(typeAnnotation.typeAnnotation);
        case AST_NODE_TYPES.TSTypeReference: {
          const qualified = getQualifiedName(typeAnnotation.typeName);
          if (qualified && TARGET_TYPES.has(qualified)) {
            return qualified;
          }

          const typeParams = typeAnnotation.typeParameters?.params ?? [];
          for (const param of typeParams) {
            const name = getTypeName(param);
            if (name) return name;
          }
          return null;
        }
        default:
          return null;
      }
    }

    /**
     * Checks if a node is a destructured variable
     */
    function isDestructured(node: TSESTree.Identifier): boolean {
      return (
        node.parent?.type === AST_NODE_TYPES.Property ||
        node.parent?.type === AST_NODE_TYPES.ArrayPattern ||
        (node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          (node.parent.id.type === AST_NODE_TYPES.ObjectPattern ||
            node.parent.id.type === AST_NODE_TYPES.ArrayPattern))
      );
    }

    /**
     * Check variable declarations for React type naming conventions
     */
    function checkVariableDeclaration(node: TSESTree.VariableDeclarator) {
      if (node.id.type !== AST_NODE_TYPES.Identifier) return;

      // Skip destructured variables
      if (isDestructured(node.id)) return;

      const variableName = node.id.name;

      // Get the type annotation
      const typeAnnotation = node.id.typeAnnotation?.typeAnnotation;
      const typeName = getTypeName(typeAnnotation);

      if (!typeName) return;

      // Check if it's a ReactNode or JSX.Element (should be lowercase)
      if (LOWERCASE_TYPES.includes(typeName) && isUppercase(variableName)) {
        const suggestion = toLowercase(variableName);
        const variable =
          context.getDeclaredVariables(node)[0] ?? findVariable(node.id);
        const fix = buildRenameFix(variable, suggestion, { allowJsx: false });

        const report: TSESLint.ReportDescriptor<MessageIds> = fix
          ? {
              node: node.id,
              messageId: 'reactNodeShouldBeLowercase',
              data: {
                type: typeName,
                suggestion,
              },
              fix,
            }
          : {
              node: node.id,
              messageId: 'reactNodeShouldBeLowercase',
              data: {
                type: typeName,
                suggestion,
              },
            };

        context.report(report);
      }

      // Check if it's a ComponentType or FC (should be uppercase)
      if (UPPERCASE_TYPES.includes(typeName) && !isUppercase(variableName)) {
        const suggestion = toUppercase(variableName);
        const variable =
          context.getDeclaredVariables(node)[0] ?? findVariable(node.id);
        const fix = buildRenameFix(variable, suggestion, { allowJsx: true });

        const report: TSESLint.ReportDescriptor<MessageIds> = fix
          ? {
              node: node.id,
              messageId: 'componentTypeShouldBeUppercase',
              data: {
                type: typeName,
                suggestion,
              },
              fix,
            }
          : {
              node: node.id,
              messageId: 'componentTypeShouldBeUppercase',
              data: {
                type: typeName,
                suggestion,
              },
            };

        if (process.env.DEBUG_REACT_NAMING === 'true') {
          // eslint-disable-next-line no-console
          console.log('report variable uppercase', variableName, Boolean(fix));
        }

        context.report(report);
      }
    }

    /**
     * Check function parameters for React type naming conventions
     */
    function checkParameter(node: TSESTree.Identifier) {
      // Skip destructured parameters
      if (isDestructured(node)) return;

      const paramName = node.name;

      // Get the type annotation
      const typeAnnotation = node.typeAnnotation?.typeAnnotation;
      const typeName = getTypeName(typeAnnotation);

      if (!typeName) return;

      // Check if it's a ReactNode or JSX.Element (should be lowercase)
      if (LOWERCASE_TYPES.includes(typeName) && isUppercase(paramName)) {
        const suggestion = toLowercase(paramName);
        const variable = findVariable(node);
        const fix = buildRenameFix(variable, suggestion, { allowJsx: false });

        const report: TSESLint.ReportDescriptor<MessageIds> = fix
          ? {
              node,
              messageId: 'reactNodeShouldBeLowercase',
              data: {
                type: typeName,
                suggestion,
              },
              fix,
            }
          : {
              node,
              messageId: 'reactNodeShouldBeLowercase',
              data: {
                type: typeName,
                suggestion,
              },
            };

        context.report(report);
      }

      // Check if it's a ComponentType or FC (should be uppercase)
      if (UPPERCASE_TYPES.includes(typeName) && !isUppercase(paramName)) {
        const suggestion = toUppercase(paramName);
        const variable = findVariable(node);
        const fix = buildRenameFix(variable, suggestion, { allowJsx: true });

        const report: TSESLint.ReportDescriptor<MessageIds> = fix
          ? {
              node,
              messageId: 'componentTypeShouldBeUppercase',
              data: {
                type: typeName,
                suggestion,
              },
              fix,
            }
          : {
              node,
              messageId: 'componentTypeShouldBeUppercase',
              data: {
                type: typeName,
                suggestion,
              },
            };

        if (process.env.DEBUG_REACT_NAMING === 'true') {
          // eslint-disable-next-line no-console
          console.log('report param uppercase', paramName, Boolean(fix));
        }

        context.report(report);
      }
    }

    return {
      VariableDeclarator: checkVariableDeclaration,
      Identifier(node: TSESTree.Identifier) {
        // Check parameter names in function declarations
        if (
          node.parent &&
          (node.parent.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.parent.type === AST_NODE_TYPES.FunctionExpression ||
            node.parent.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
          node.parent.params.includes(node)
        ) {
          checkParameter(node);
        }
      },
    };
  },
});
