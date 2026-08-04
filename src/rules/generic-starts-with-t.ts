import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';

/**
 * A module augmentation targets either an external module
 * (`declare module 'pkg'`, whose id is a string literal) or the global scope
 * (`declare global`). TypeScript requires every declaration of a merged entity
 * to spell its type parameters identically (TS2428, "All declarations of 'X'
 * must have identical type parameters"), so the name inside an augmentation is
 * fixed by the upstream declaration rather than chosen by the author. Renaming
 * it to satisfy the convention breaks the merge.
 *
 * A plain `namespace X` — including the ambient `declare namespace X` and
 * `declare module Foo`, both of which carry an identifier id — augments nothing
 * upstream, so its type parameters stay author-owned and reportable.
 */
function isModuleAugmentation(node: TSESTree.TSModuleDeclaration): boolean {
  if (
    node.id.type === AST_NODE_TYPES.Literal &&
    typeof node.id.value === 'string'
  ) {
    return true;
  }

  // `declare global` carries a dedicated flag, which also covers the bare
  // `global { ... }` form nested inside an ambient module (that form has no
  // `declare` of its own).
  if (node.global === true) {
    return true;
  }

  // Parser versions that predate the `global` flag spell the same block as an
  // ambient module whose id is the `global` keyword. Requiring `declare` keeps
  // an ordinary `namespace global { ... }` reportable.
  return (
    node.declare === true &&
    node.id.type === AST_NODE_TYPES.Identifier &&
    node.id.name === 'global'
  );
}

/**
 * The declaration need not be a direct child of the augmentation block; it can
 * sit inside a nested namespace, an interface member signature or any other
 * container within it, so the whole ancestor chain is inspected.
 */
function isInsideModuleAugmentation(node: TSESTree.Node): boolean {
  for (
    let ancestor: TSESTree.Node | undefined = node.parent;
    ancestor;
    ancestor = ancestor.parent
  ) {
    if (
      ancestor.type === AST_NODE_TYPES.TSModuleDeclaration &&
      isModuleAugmentation(ancestor)
    ) {
      return true;
    }
  }
  return false;
}

export const genericStartsWithT: TSESLint.RuleModule<
  'genericStartsWithT',
  never[]
> = createRule({
  create(context) {
    return {
      TSTypeParameterDeclaration(node: TSESTree.TSTypeParameterDeclaration) {
        if (isInsideModuleAugmentation(node)) {
          return;
        }

        for (const param of node.params) {
          if (
            typeof param.name.name === 'string' &&
            param.name.name[0] !== 'T'
          ) {
            const name = param.name.name;
            const suggestedName = `T${name}`;

            context.report({
              node: param,
              messageId: 'genericStartsWithT',
              data: {
                name,
                suggestedName,
              },
            });
          }
        }
      },
    };
  },

  name: 'generic-starts-with-t',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce TypeScript generic type parameters to start with T so they stand out from runtime values.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      genericStartsWithT:
        'Generic type parameter "{{name}}" should start with "T" (e.g., "{{suggestedName}}") so readers immediately recognize it as a generic type rather than a concrete value. T-prefixed generics make type parameters stand out in signatures and prevent confusion with runtime parameters.',
    },
  },
  defaultOptions: [],
});
