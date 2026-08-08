import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import {
  buildVariableRenameFixes,
  renameIdentifierToken,
} from '../utils/renameFixes';

type MessageIds = 'usePropsName';
type Options = [];

// Every node shape whose parameters this rule renames. Each is a node
// `getDeclaredVariables` understands, which is what lets the fixer resolve the
// symbol behind the reported parameter.
type ParameterOwner =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.TSEmptyBodyFunctionExpression
  | TSESTree.TSMethodSignature;

/**
 * A body-less signature — an interface or object-type method member, or a
 * `declare`/overload constructor — has no statements, so its parameter name is
 * documentation-only and can never be referenced. A declaration-only rename is
 * therefore complete rather than partial, and stays correct even though the
 * scope analyzer models no variable for such a parameter.
 */
const isBodylessSignature = (owner: ParameterOwner): boolean =>
  owner.type === AST_NODE_TYPES.TSMethodSignature ||
  owner.type === AST_NODE_TYPES.TSEmptyBodyFunctionExpression;

/**
 * Finds the class (declaration or expression) that owns a method definition.
 */
const getEnclosingClass = (
  node: TSESTree.MethodDefinition,
): TSESTree.ClassDeclaration | TSESTree.ClassExpression | null => {
  const classBody = node.parent;
  if (classBody?.type !== AST_NODE_TYPES.ClassBody) {
    return null;
  }
  const classNode = classBody.parent;
  if (
    classNode?.type === AST_NODE_TYPES.ClassDeclaration ||
    classNode?.type === AST_NODE_TYPES.ClassExpression
  ) {
    return classNode;
  }
  return null;
};

/**
 * Reports whether renaming a constructor parameter property is unsafe to
 * autofix.
 *
 * A parameter property (`private readonly settings: FooProps`) declares BOTH a
 * constructor-local binding and a `this.settings` class field. The scope
 * analyzer only models the binding, so a scope-driven rename silently rewrites
 * the field declaration while leaving every `this.settings` access — and every
 * plain `settings` use the analyzer attributes elsewhere — pointing at a name
 * that no longer exists (Issue #1358). Since the field half of the rename
 * cannot be resolved through scope analysis, the fix is withheld whenever the
 * name occurs anywhere in the class other than at its declaration.
 */
/**
 * The member name a `this.<x>` access reads, whatever its spelling.
 *
 * Keying the check on the dot spelling alone left `this['settings']` invisible,
 * so the rename shipped and stranded it — the class no longer had the member the
 * getter reads (#1882, the sibling of #1881). A computed access with a static
 * string is the SAME member as the dot form, and the fixer cannot rewrite it
 * either, so it has to count. `null` marks a genuinely dynamic key, which names
 * no member statically and therefore strands nothing.
 */
const staticMemberName = (
  node: TSESTree.MemberExpression,
): string | null | undefined => {
  if (!node.computed) {
    return node.property.type === AST_NODE_TYPES.Identifier
      ? node.property.name
      : null;
  }
  if (
    node.property.type === AST_NODE_TYPES.Literal &&
    typeof node.property.value === 'string'
  ) {
    return node.property.value;
  }
  if (
    node.property.type === AST_NODE_TYPES.TemplateLiteral &&
    node.property.expressions.length === 0 &&
    node.property.quasis.length === 1
  ) {
    return node.property.quasis[0].value.cooked;
  }
  return null;
};

const parameterPropertyRenameIsUnsafe = (
  classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
  name: string,
  declarationId: TSESTree.Identifier,
): boolean => {
  let unsafe = false;

  const visit = (node: TSESTree.Node): void => {
    if (unsafe) {
      return;
    }

    if (
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.ThisExpression &&
      staticMemberName(node) === name
    ) {
      unsafe = true;
      return;
    }

    if (
      node.type === AST_NODE_TYPES.Identifier &&
      node.name === name &&
      node !== declarationId
    ) {
      unsafe = true;
      return;
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') {
        continue;
      }
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (ASTHelpers.isNode(child)) {
            visit(child);
          }
        }
      } else if (ASTHelpers.isNode(value)) {
        visit(value);
      }
    }
  };

  visit(classNode);
  return unsafe;
};

export const enforcePropsNamingConsistency = createRule<Options, MessageIds>({
  name: 'enforce-props-naming-consistency',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer naming single "Props"-typed parameters as "props"; enforcement defers to enforce-props-argument-name for multi-Props cases',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      usePropsName:
        'Parameter with a type ending in "Props" should be named "props" instead of "{{ paramName }}"',
    },
  },
  defaultOptions: [],
  create(context) {
    // Extract type name from a type annotation
    function getTypeName(typeAnnotation: TSESTree.TypeNode): string | null {
      if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = typeAnnotation.typeName;
        if (typeName.type === AST_NODE_TYPES.Identifier) {
          return typeName.name;
        }
      }
      return null;
    }

    // Check if a parameter should be named "props"
    function shouldBeNamedProps(
      param: TSESTree.Parameter | TSESTree.Identifier,
    ): boolean {
      // Only check non-destructured parameters
      if (param.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      // Check if the parameter has a type annotation
      if (!param.typeAnnotation || !param.typeAnnotation.typeAnnotation) {
        return false;
      }

      // Get the type name
      const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
      if (!typeName) {
        return false;
      }

      // Check if the type name ends with "Props"
      return typeName.endsWith('Props');
    }

    // Check if a parameter name is already prefixed with "props"
    function isPropsNameWithPrefix(paramName: string): boolean {
      return paramName.endsWith('Props') || paramName === 'props';
    }

    // Build the complete rename: the parameter declaration AND every in-file
    // reference to it, rewriting only name tokens.
    //
    // `fixer.replaceText(param, 'props')` used to be the whole fix, which was
    // wrong twice over: an `Identifier` range spans its optional marker and its
    // type annotation, so replacing it deleted the very `: FooProps` annotation
    // that triggered the report, and the body kept referencing the old name
    // (Issue #1358). Returns null whenever the rename cannot be applied
    // everywhere, so the report stands on its own instead of corrupting the
    // source.
    function buildParameterRenameFixes(
      fixer: TSESLint.RuleFixer,
      owner: ParameterOwner,
      param: TSESTree.Identifier,
    ): TSESLint.RuleFix[] | null {
      const sourceCode = context.getSourceCode();

      // `getDeclaredVariables` on a function returns every parameter plus
      // `arguments` and, for a declaration, the function's own name — and those
      // can share a name (`function config(config: XProps)`), so the lookup
      // matches on declaration identity instead of on the name.
      const variable =
        context
          .getDeclaredVariables(owner)
          .find((candidate) =>
            candidate.defs.some((def) => def.name === param),
          ) ?? null;

      if (!variable) {
        if (!isBodylessSignature(owner)) {
          return null;
        }
        const declarationFix = renameIdentifierToken(
          fixer,
          sourceCode,
          param,
          'props',
        );
        return declarationFix ? [declarationFix] : null;
      }

      return buildVariableRenameFixes({
        fixer,
        sourceCode,
        variable,
        declarationId: param,
        newName: 'props',
      });
    }

    // Check function parameters
    function checkFunctionParams(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | TSESTree.TSMethodSignature,
    ): void {
      // A constructor is a `MethodDefinition` wrapping a `FunctionExpression`,
      // so both this visitor and `checkClassConstructor` would otherwise fire on
      // the same parameter and emit two identical reports — each carrying a fix
      // over the same range, which ESLint deduplicates by discarding one, so a
      // single `--fix` pass could not converge (Issue #1514). The constructor
      // handler owns the case because it is a strict superset: it also reports
      // parameter properties, counts them toward the multi-Props deferral, and
      // gates the rename on `this.<name>` safety.
      if (
        node.type === AST_NODE_TYPES.FunctionExpression &&
        node.parent?.type === AST_NODE_TYPES.MethodDefinition &&
        node.parent.kind === 'constructor'
      ) {
        return;
      }

      // Skip functions with multiple parameters that have Props types
      const propsTypeParams = node.params.filter((param) => {
        if (param.type !== AST_NODE_TYPES.Identifier) return false;
        if (!param.typeAnnotation || !param.typeAnnotation.typeAnnotation)
          return false;
        const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
        return typeName && typeName.endsWith('Props');
      });

      if (propsTypeParams.length > 1) {
        return; // Skip functions with multiple Props parameters
      }

      for (const param of node.params) {
        if (
          shouldBeNamedProps(param) &&
          param.type === AST_NODE_TYPES.Identifier &&
          !isPropsNameWithPrefix(param.name)
        ) {
          context.report({
            node: param,
            messageId: 'usePropsName',
            data: { paramName: param.name },
            fix: (fixer) => buildParameterRenameFixes(fixer, node, param),
          });
        }
      }
    }

    // Check class constructor parameters
    function checkClassConstructor(node: TSESTree.MethodDefinition): void {
      if (node.kind !== 'constructor') {
        return;
      }

      const constructor = node.value;

      // Skip constructors with multiple parameters that have Props types
      const propsTypeParams = constructor.params.filter((param) => {
        if (param.type === AST_NODE_TYPES.Identifier) {
          if (!param.typeAnnotation || !param.typeAnnotation.typeAnnotation)
            return false;
          const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
          return typeName && typeName.endsWith('Props');
        } else if (
          param.type === AST_NODE_TYPES.TSParameterProperty &&
          param.parameter.type === AST_NODE_TYPES.Identifier
        ) {
          if (
            !param.parameter.typeAnnotation ||
            !param.parameter.typeAnnotation.typeAnnotation
          )
            return false;
          const typeName = getTypeName(
            param.parameter.typeAnnotation.typeAnnotation,
          );
          return typeName && typeName.endsWith('Props');
        }
        return false;
      });

      if (propsTypeParams.length > 1) {
        return; // Skip constructors with multiple Props parameters
      }

      const enclosingClass = getEnclosingClass(node);

      for (const param of constructor.params) {
        if (
          shouldBeNamedProps(param) &&
          param.type === AST_NODE_TYPES.Identifier &&
          !isPropsNameWithPrefix(param.name)
        ) {
          context.report({
            node: param,
            messageId: 'usePropsName',
            data: { paramName: param.name },
            fix: (fixer) =>
              buildParameterRenameFixes(fixer, constructor, param),
          });
        } else if (
          param.type === AST_NODE_TYPES.TSParameterProperty &&
          param.parameter.type === AST_NODE_TYPES.Identifier &&
          shouldBeNamedProps(param.parameter) &&
          !isPropsNameWithPrefix(param.parameter.name)
        ) {
          const declarationId = param.parameter;
          context.report({
            node: declarationId,
            messageId: 'usePropsName',
            data: { paramName: declarationId.name },
            fix: (fixer) => {
              // A parameter property also declares a `this.<name>` field the
              // scope analyzer does not model, so renaming it is only safe
              // when the name appears nowhere else in the class.
              if (
                !enclosingClass ||
                parameterPropertyRenameIsUnsafe(
                  enclosingClass,
                  declarationId.name,
                  declarationId,
                )
              ) {
                return null;
              }
              return buildParameterRenameFixes(
                fixer,
                constructor,
                declarationId,
              );
            },
          });
        }
      }
    }

    return {
      FunctionDeclaration: checkFunctionParams,
      FunctionExpression: checkFunctionParams,
      ArrowFunctionExpression: checkFunctionParams,
      TSMethodSignature: checkFunctionParams,
      MethodDefinition: checkClassConstructor,
    };
  },
});
