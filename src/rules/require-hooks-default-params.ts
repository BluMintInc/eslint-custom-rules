import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { declarationOf, resolveInEnclosingScopes } from '../utils/lexicalScope';

type MessageIds = 'requireDefaultParams';

export const requireHooksDefaultParams = createRule<[], MessageIds>({
  name: 'require-hooks-default-params',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce React hooks with optional parameters to default to an empty object',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireDefaultParams:
        'Hook "{{hookName}}" accepts an options object where every property is optional, but the parameter is not defaulted. When callers omit the argument the hook receives undefined, so destructuring or property access throws even though the fields are optional. Default the parameter to an empty object (e.g., "({ option } = {})") so the hook stays safe to call with no arguments.',
    },
  },
  defaultOptions: [],
  create(context) {
    function isHookName(name: string): boolean {
      return name.startsWith('use') && name[3]?.toUpperCase() === name[3];
    }

    /** The declaration a statement introduces, looking through `export`. */
    function typeDeclarationNamed(
      statement: TSESTree.Node,
      name: string,
    ):
      | TSESTree.TSTypeAliasDeclaration
      | TSESTree.TSInterfaceDeclaration
      | undefined {
      const declared = declarationOf(statement);
      if (
        (declared.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
          declared.type === AST_NODE_TYPES.TSInterfaceDeclaration) &&
        declared.id.name === name
      ) {
        return declared;
      }
      return undefined;
    }

    /**
     * Lexical resolution of a type name, innermost scope outward.
     *
     * `context.getScope()` returns the scope of the node being visited and
     * `scope.variables` is own-scope-only, so a type declared anywhere above
     * the hook is invisible to it — and when a *value* of the same name is
     * bound nearby, the lookup succeeds with a non-type definition and the
     * whole check is abandoned. Walking the enclosing statement containers
     * answers the question the rule actually asks, and a name that resolves to
     * something other than a type declaration simply keeps searching.
     *
     * The container set comes from the shared helper rather than an inlined
     * list: which containers count is not a per-rule decision, and enumerating
     * them here let the DEPTH of a declaration decide whether the rule can see
     * it — a type written in a class `static {}` block or a `switch` case
     * consequent went unresolved while the identical type one container over
     * resolved fine (#1781).
     */
    function resolveTypeDeclaration(
      from: TSESTree.Node,
      name: string,
    ):
      | TSESTree.TSTypeAliasDeclaration
      | TSESTree.TSInterfaceDeclaration
      | undefined {
      return resolveInEnclosingScopes<
        TSESTree.TSTypeAliasDeclaration | TSESTree.TSInterfaceDeclaration
      >(from, (statements) => {
        for (const statement of statements) {
          const found = typeDeclarationNamed(statement, name);
          if (found) {
            return found;
          }
        }
        return undefined;
      });
    }

    function hasAllOptionalProperties(
      typeNode:
        | TSESTree.TypeNode
        | TSESTree.TSTypeAliasDeclaration
        | TSESTree.TSInterfaceDeclaration,
    ): boolean {
      // Handle type literals directly
      if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
        return typeNode.members.every((member) => {
          if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
            return false;
          }
          return member.optional === true;
        });
      }

      // Handle type references
      if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = typeNode.typeName;
        if (typeName.type !== AST_NODE_TYPES.Identifier) {
          return false;
        }

        const declaration = resolveTypeDeclaration(typeNode, typeName.name);
        // An unresolved name is an imported type whose shape is unknowable
        // here, so it is treated as carrying required properties.
        return declaration ? hasAllOptionalProperties(declaration) : false;
      }

      // Handle type alias declarations
      if (typeNode.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
        return hasAllOptionalProperties(typeNode.typeAnnotation);
      }

      // Handle interface declarations
      if (typeNode.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        return typeNode.body.body.every((member) => {
          if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
            return false;
          }
          return member.optional === true;
        });
      }

      return false;
    }

    return {
      'ArrowFunctionExpression, FunctionDeclaration'(
        node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration,
      ): void {
        // Check if it's a hook function
        let isHook = false;
        let hookName: string | undefined;
        if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
          hookName = node.id?.name;
          isHook = hookName ? isHookName(hookName) : false;
        } else {
          const parent = node.parent;
          if (
            parent &&
            parent.type === AST_NODE_TYPES.VariableDeclarator &&
            parent.id &&
            parent.id.type === AST_NODE_TYPES.Identifier
          ) {
            hookName = parent.id.name;
            isHook = isHookName(parent.id.name);
          }
        }

        if (!isHook) {
          return;
        }

        const messageData = { hookName: hookName ?? 'this hook' };

        // Check if it has exactly one parameter
        if (node.params.length !== 1) {
          return;
        }

        // Check if the parameter is already an assignment pattern
        const param = node.params[0];
        if (param.type === AST_NODE_TYPES.AssignmentPattern) {
          return;
        }

        // Check if the parameter has a type annotation
        if (
          param.type === AST_NODE_TYPES.ObjectPattern &&
          param.typeAnnotation
        ) {
          const typeAnnotation = param.typeAnnotation.typeAnnotation;
          if (hasAllOptionalProperties(typeAnnotation)) {
            context.report({
              node: param,
              messageId: 'requireDefaultParams',
              data: messageData,
              fix(fixer) {
                const paramText = context.sourceCode.getText(param);
                return fixer.replaceText(param, `${paramText} = {}`);
              },
            });
          }
        }
      },
    };
  },
});
