import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ASTHelpers } from './ASTHelpers';

const REACT_MODULE = 'react';
const FRAGMENT_NAME = 'Fragment';

/**
 * A named specifier that binds `Fragment` under its own name — the only shape
 * that makes a bare `<Fragment>` element resolve to react's Fragment. An alias
 * (`import { Fragment as Frag }`) leaves the name free for something else, and
 * a type-only specifier binds nothing at runtime.
 */
function isReactFragmentSpecifier(
  specifier: TSESTree.Node,
): specifier is TSESTree.ImportSpecifier {
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.name === FRAGMENT_NAME &&
    specifier.local.name === FRAGMENT_NAME
  );
}

/**
 * Whether every declaration of a visible `Fragment` binding is react's Fragment
 * import. A const/let/function/class, a parameter, a namespace or default
 * import, an alias, or a named import from another module all mean the element
 * spelled `<Fragment>` renders something other than react's Fragment — a
 * user-defined component a fragment-keyed rule must leave alone.
 *
 * An unresolved name is not react's Fragment either: nothing in the file states
 * what it renders, so counting it would trade a false negative for a false
 * positive on code the rule cannot see.
 */
export function bindsReactFragment(
  variable: TSESLint.Scope.Variable | null,
): boolean {
  return (
    !!variable &&
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (!isReactFragmentSpecifier(specifier)) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        declaration.importKind !== 'type' &&
        declaration.source.value === REACT_MODULE
      );
    })
  );
}

/**
 * Whether a JSX element is a react fragment written in long form:
 * `<React.Fragment>` (a member access on the React namespace) or a bare
 * `<Fragment>` whose name resolves to react's Fragment import. The binding is
 * resolved from the element's own scope, so a narrower shadow — a component
 * named `Fragment` declared inside a function — answers false there while a
 * module-level react import answers true elsewhere in the same file.
 *
 * The `React.Fragment` arm does not re-resolve `React`, matching how
 * `prefer-fragment-shorthand` and `prefer-fragment-component` recognise the
 * same spelling: a local object named `React` carrying a `Fragment` property is
 * not a shape worth splitting the rules' answers over.
 */
export function isReactFragmentElement(
  element: TSESTree.JSXElement,
  scopeOf: (node: TSESTree.Node) => TSESLint.Scope.Scope,
): boolean {
  const { name } = element.openingElement;
  if (name.type === AST_NODE_TYPES.JSXMemberExpression) {
    return (
      name.object.type === AST_NODE_TYPES.JSXIdentifier &&
      name.object.name === 'React' &&
      name.property.type === AST_NODE_TYPES.JSXIdentifier &&
      name.property.name === FRAGMENT_NAME
    );
  }
  if (
    name.type !== AST_NODE_TYPES.JSXIdentifier ||
    name.name !== FRAGMENT_NAME
  ) {
    return false;
  }
  return bindsReactFragment(
    ASTHelpers.findVariableInScope(scopeOf(element), FRAGMENT_NAME),
  );
}
