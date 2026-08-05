import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

type MessageIds = 'preferFragment' | 'addFragmentImport';

const REACT_MODULE = 'react';
const FRAGMENT_NAME = 'Fragment';

/**
 * Value `react` import declarations in source order. A type-only declaration
 * (`import type { FC } from 'react'`) is excluded because a specifier appended
 * to one erases at compile time, leaving the rewritten <Fragment> unbound at
 * runtime.
 */
function reactValueImports(
  program: TSESTree.Program,
): TSESTree.ImportDeclaration[] {
  return program.body.filter(
    (statement): statement is TSESTree.ImportDeclaration =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      statement.source.value === REACT_MODULE &&
      statement.importKind !== 'type',
  );
}

/**
 * A named specifier that binds `Fragment` under its own name — the only shape
 * that makes a bare <Fragment> element resolve to react's Fragment. An alias
 * (`import { Fragment as Frag }`) leaves the name free, and a type-only
 * specifier binds nothing at runtime.
 */
function isFragmentSpecifier(
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
 * Import state is read off `Program.body` at fix time rather than from a
 * traversal flag: a fragment that precedes the import declaration in source
 * order is fixed before the `ImportDeclaration` visitor has run, so a flag
 * would call the import missing and insert a duplicate.
 */
function importsFragment(program: TSESTree.Program): boolean {
  return reactValueImports(program).some((declaration) =>
    declaration.specifiers.some(isFragmentSpecifier),
  );
}

/**
 * Whether every declaration of a visible `Fragment` binding is react's Fragment
 * import. A const/let/function/class, a parameter, a namespace or default
 * import, an alias, or a named import from another module all mean the
 * rewritten <Fragment> renders something other than react's Fragment.
 */
function bindsReactFragment(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (!isFragmentSpecifier(specifier)) {
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
 * `jest.mock` hoists its module factory above the file's imports;
 * `doMock`/`setMock` register a factory of the same shape at call time. The
 * hoist rejects a factory that reads any out-of-scope binding whose name does
 * not begin with `mock`, which is what puts the injected `Fragment` import out
 * of reach inside one: the module fails at transform time
 * (`Invalid variable access: Fragment`) and takes the whole suite down with it.
 * The shorthand `<>` the rule rewrites away is the spelling that works there.
 *
 * The report still fires, because remedies the factory can hold exist —
 * `const { Fragment } = jest.requireActual('react')` inside it, or a
 * `mock`-prefixed import alias — and only the fix is withheld.
 */
const MOCK_REGISTRARS = new Set(['mock', 'doMock', 'setMock']);

/** Whether the call registers a module factory with `jest`. */
function isMockRegistrarCall(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const { object, property } = callee;
  return (
    object.type === AST_NODE_TYPES.Identifier &&
    object.name === 'jest' &&
    property.type === AST_NODE_TYPES.Identifier &&
    MOCK_REGISTRARS.has(property.name)
  );
}

/**
 * Whether the node sits inside the factory a jest registrar hoists — the second
 * argument of the call. The module specifier that precedes it is evaluated in
 * place and keeps its access to the file's imports, so only the factory subtree
 * is out of reach.
 */
function isInsideMockFactory(node: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
  let parent = node.parent;
  while (parent) {
    if (
      parent.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments[1] === child &&
      isMockRegistrarCall(parent)
    ) {
      return true;
    }
    child = parent;
    parent = parent.parent;
  }
  return false;
}

export const preferFragmentComponent = createRule<[], MessageIds>({
  name: 'prefer-fragment-component',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require the Fragment named import instead of shorthand fragments or React.Fragment to keep fragments explicit and prop-friendly',
      // `RuleMetaDataDocs` admits `false | 'error' | 'strict' | 'warn'` and has
      // no `'off'` member, so `false` is this field's spelling of the `'off'`
      // the recommended config ships. See the docs page for why it ships off
      // and what graduates it to 'error'.
      recommended: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferFragment:
        'Prefer Fragment imported from react over {{type}}. Shorthand fragments block props like "key" and mixing fragment styles makes JSX harder to refactor. Import { Fragment } from "react" and wrap the children with <Fragment>...</Fragment> so fragment usage stays explicit.',
      addFragmentImport:
        "Fragment is used but not imported from react. Without an explicit import the fixer leaves <Fragment> undefined and the React dependency implicit. Add `import { Fragment } from 'react'` alongside your other React imports so the file compiles.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
    // The `import { Fragment } from 'react'` edit rides on one violation's fix,
    // making that violation the file's import carrier. ESLint builds fixes
    // eagerly and drops inline-disabled reports afterwards, so a suppressed
    // carrier would take the import down with it while the surviving
    // violations still emit <Fragment>. Resolving suppression before the latch
    // is read hands the carrier slot to the first violation that survives.
    const isReportSuppressed = createSuppressionChecker(context);
    // One pass rewrites several fragments but must insert the import once. The
    // AST does not change mid-pass, so the latch records only what an earlier
    // fix in this same pass already scheduled; existing imports are read from
    // the AST instead.
    let importScheduled = false;

    // Track nodes we've already reported to avoid duplicates
    const reportedNodes = new Set<TSESTree.Node>();

    /**
     * Whether a bare <Fragment> emitted at `node` would resolve to react's
     * Fragment. Any other visible binding of the name breaks the edit two ways:
     * the inserted import collides with the existing declaration (TS2440, or
     * TS2300 when that declaration is itself an import), and a narrower-scope
     * shadow captures the emitted element with no compile error at all.
     * Resolving through the scope chain from the reported element covers both,
     * and keeps `React.Fragment` — a member access on the default import, not a
     * `Fragment` binding — off the collision path.
     */
    function resolvesToReactFragment(node: TSESTree.Node): boolean {
      const existing = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, node),
        FRAGMENT_NAME,
      );
      return !existing || bindsReactFragment(existing);
    }

    /**
     * True once the file binds react's Fragment, counting an insertion an
     * earlier fix in this pass already scheduled.
     */
    function fragmentImportPresent(): boolean {
      return importScheduled || importsFragment(sourceCode.ast);
    }

    /**
     * Checks if a node is a React.Fragment element
     */
    function isReactFragment(node: TSESTree.JSXOpeningElement): boolean {
      return (
        node.name.type === AST_NODE_TYPES.JSXMemberExpression &&
        node.name.object.type === AST_NODE_TYPES.JSXIdentifier &&
        node.name.object.name === 'React' &&
        node.name.property.type === AST_NODE_TYPES.JSXIdentifier &&
        node.name.property.name === 'Fragment'
      );
    }

    /**
     * Finds if a node has a React.Fragment parent
     */
    function findReactFragmentParent(
      node: TSESTree.Node,
    ): TSESTree.JSXElement | null {
      let current: TSESTree.Node | undefined = node;

      // Check parent chain until we find a JSXElement with React.Fragment
      while (current && current.parent) {
        current = current.parent;

        if (
          current.type === AST_NODE_TYPES.JSXElement &&
          current.openingElement &&
          isReactFragment(current.openingElement)
        ) {
          return current as TSESTree.JSXElement;
        }
      }

      return null;
    }

    /**
     * Check if a node is inside a JSX fragment
     */
    function isInsideJSXFragment(
      node: TSESTree.Node,
    ): TSESTree.JSXFragment | null {
      let current: TSESTree.Node | undefined = node;

      // Check parent chain until we find a JSXFragment
      while (current && current.parent) {
        current = current.parent;

        if (current.type === AST_NODE_TYPES.JSXFragment) {
          return current as TSESTree.JSXFragment;
        }
      }

      return null;
    }

    /**
     * Adds Fragment to an existing react import or creates a new one. The
     * emitted shape is a value named specifier, since the rewritten element
     * references `Fragment` at runtime. Declarations come from `Program.body`
     * at fix time so the choice does not depend on how far traversal has
     * progressed.
     */
    function addFragmentImport(fixer: TSESLint.RuleFixer) {
      const declarations = reactValueImports(sourceCode.ast);
      // A declaration carrying the default import keeps `React` and `Fragment`
      // on one line; otherwise the first declaration that can host a specifier
      // wins. A bare `import 'react';` hosts none, so it falls through.
      const targetImportNode =
        declarations.find((declaration) =>
          declaration.specifiers.some(
            (spec) => spec.type === AST_NODE_TYPES.ImportDefaultSpecifier,
          ),
        ) ??
        declarations.find((declaration) => declaration.specifiers.length > 0);

      if (targetImportNode) {
        // `import * as React, { Fragment }` is a syntax error, so a namespace
        // import gets its own declaration beside it.
        const hasNamespaceImport = targetImportNode.specifiers.some(
          (spec) => spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
        );

        if (hasNamespaceImport) {
          return fixer.insertTextAfter(
            targetImportNode,
            `\nimport { ${FRAGMENT_NAME} } from '${REACT_MODULE}';`,
          );
        }

        // Add Fragment to existing React import
        const lastSpecifier =
          targetImportNode.specifiers[targetImportNode.specifiers.length - 1];
        const hasNamedImports = targetImportNode.specifiers.some(
          (spec) => spec.type === AST_NODE_TYPES.ImportSpecifier,
        );

        if (hasNamedImports) {
          return fixer.insertTextAfter(lastSpecifier, `, ${FRAGMENT_NAME}`);
        } else {
          return fixer.insertTextAfter(lastSpecifier, `, { ${FRAGMENT_NAME} }`);
        }
      }

      // No react declaration can host the specifier, so the fix emits its own
      // declaration. The shared anchor keeps the file's prologue intact: a
      // `'use client'` directive stays the first statement, a `#!` shebang
      // stays at character 0, a header comment stays above the code it covers,
      // and an `eslint-disable-next-line` keeps pointing at the line its author
      // aimed it at instead of at the inserted import.
      const anchor = importInsertionAnchor(sourceCode);
      return insertAtImportAnchor(
        sourceCode,
        fixer,
        anchor,
        `import { ${FRAGMENT_NAME} } from '${REACT_MODULE}';\n`,
      );
    }

    return {
      // Find JSX Fragment shorthand (<></>)
      JSXFragment(node) {
        // Skip if already reported
        if (reportedNodes.has(node)) {
          return;
        }

        // Track that we've seen this node
        reportedNodes.add(node);

        // Special handling for nested fragments
        const reactFragmentParent = findReactFragmentParent(node);

        // Check if this fragment contains React.Fragment children
        const hasReactFragmentChild = node.children.some(
          (child) =>
            child.type === AST_NODE_TYPES.JSXElement &&
            child.openingElement.name.type ===
              AST_NODE_TYPES.JSXMemberExpression &&
            child.openingElement.name.object.type ===
              AST_NODE_TYPES.JSXIdentifier &&
            child.openingElement.name.object.name === 'React' &&
            child.openingElement.name.property.type ===
              AST_NODE_TYPES.JSXIdentifier &&
            child.openingElement.name.property.name === 'Fragment',
        );

        // For nested fragments, we have multiple test cases with different expected behaviors
        if (reactFragmentParent) {
          // This is a fragment inside a React.Fragment
          // Report on this JSX fragment
          context.report({
            node,
            messageId: 'preferFragment',
            data: { type: 'shorthand fragment (<>)' },
            fix(fixer) {
              // A suppressed report is discarded together with its fix, so it
              // must not claim the import carrier slot.
              if (isReportSuppressed(node)) {
                return null;
              }

              // A hoisted jest factory cannot reach the injected import, so
              // the rewrite is withheld inside one. Checking the inner
              // fragment covers the outer React.Fragment as well, since a
              // parent of a node in the factory is in the factory too.
              if (isInsideMockFactory(node)) {
                return null;
              }

              // Both tags are rewritten to the same bare name, so resolving at
              // the inner fragment — the deeper of the two scopes — covers the
              // outer one too. Every bail precedes the latch so a withheld edit
              // cannot make a later fix believe the import is handled.
              if (!resolvesToReactFragment(node)) {
                return null;
              }

              const fixes: ReturnType<typeof fixer.replaceText>[] = [];

              // Add Fragment import if needed
              if (!fragmentImportPresent()) {
                fixes.push(addFragmentImport(fixer));
                importScheduled = true;
              }

              // Fix the outer React.Fragment
              const outerOpeningElement = reactFragmentParent.openingElement;
              const outerOpeningText = sourceCode.getText(outerOpeningElement);
              const newOuterOpeningText = outerOpeningText.replace(
                'React.Fragment',
                'Fragment',
              );
              fixes.push(
                fixer.replaceText(outerOpeningElement, newOuterOpeningText),
              );

              if (reactFragmentParent.closingElement) {
                const outerClosingText = sourceCode.getText(
                  reactFragmentParent.closingElement,
                );
                const newOuterClosingText = outerClosingText.replace(
                  'React.Fragment',
                  'Fragment',
                );
                fixes.push(
                  fixer.replaceText(
                    reactFragmentParent.closingElement,
                    newOuterClosingText,
                  ),
                );
              }

              // Fix the inner shorthand fragment
              const innerOpeningText = sourceCode.getText(node.openingFragment);
              const innerClosingText = sourceCode.getText(node.closingFragment);

              const newInnerOpeningText = innerOpeningText.replace(
                '<>',
                '<Fragment>',
              );
              const newInnerClosingText = innerClosingText.replace(
                '</>',
                '</Fragment>',
              );

              fixes.push(
                fixer.replaceText(node.openingFragment, newInnerOpeningText),
              );
              fixes.push(
                fixer.replaceText(node.closingFragment, newInnerClosingText),
              );

              return fixes;
            },
          });

          // Also report on the parent React.Fragment
          context.report({
            node: reactFragmentParent.openingElement.name,
            messageId: 'preferFragment',
            data: { type: 'React.Fragment' },
          });

          // Mark the parent as already handled
          reportedNodes.add(reactFragmentParent);
          reportedNodes.add(reactFragmentParent.openingElement);
          reportedNodes.add(reactFragmentParent.openingElement.name);

          return;
        }
        // Special case: JSX Fragment with React.Fragment child (don't convert outer fragment)
        else if (hasReactFragmentChild) {
          // Just report the error but don't fix the outer fragment
          context.report({
            node,
            messageId: 'preferFragment',
            data: { type: 'shorthand fragment (<>)' },
            // No fix here - we'll let the inner React.Fragment visitor handle it
          });

          return;
        }

        // Standard handling for standalone JSX fragments
        context.report({
          node,
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
          fix(fixer) {
            // A suppressed report is discarded together with its fix, so it
            // must not claim the import carrier slot.
            if (isReportSuppressed(node)) {
              return null;
            }

            // A hoisted jest factory cannot reach the injected import, so the
            // rewrite is withheld inside one.
            if (isInsideMockFactory(node)) {
              return null;
            }

            // Every bail precedes the latch so a withheld edit cannot make a
            // later fix believe the import is already handled.
            if (!resolvesToReactFragment(node)) {
              return null;
            }

            const fixes: ReturnType<typeof fixer.replaceText>[] = [];

            // Add Fragment import if needed
            if (!fragmentImportPresent()) {
              fixes.push(addFragmentImport(fixer));
              importScheduled = true;
            }

            // Replace fragment tags
            const openingText = sourceCode.getText(node.openingFragment);
            const closingText = sourceCode.getText(node.closingFragment);

            const newOpeningText = openingText.replace('<>', '<Fragment>');
            const newClosingText = closingText.replace('</>', '</Fragment>');

            fixes.push(fixer.replaceText(node.openingFragment, newOpeningText));
            fixes.push(fixer.replaceText(node.closingFragment, newClosingText));

            return fixes;
          },
        });
      },

      // Find React.Fragment usage
      JSXOpeningElement(node) {
        // Only process React.Fragment elements
        if (!isReactFragment(node)) {
          return;
        }

        // Skip if already reported
        if (reportedNodes.has(node) || reportedNodes.has(node.name)) {
          return;
        }

        const jsxElement = node.parent;
        if (!jsxElement || jsxElement.type !== AST_NODE_TYPES.JSXElement) {
          return;
        }

        // Mark as reported
        reportedNodes.add(node);
        reportedNodes.add(node.name);

        // Check if this React.Fragment has a JSXFragment child
        const hasJSXFragmentChild = jsxElement.children.some(
          (child) => child.type === AST_NODE_TYPES.JSXFragment,
        );

        // Check if this React.Fragment is inside a JSXFragment
        const fragmentParent = isInsideJSXFragment(node);

        // Special case: React.Fragment inside a JSX Fragment
        if (fragmentParent) {
          // Have to report on it even if we don't fix it here
          context.report({
            node: node.name,
            messageId: 'preferFragment',
            data: { type: 'React.Fragment' },
            fix(fixer) {
              // A suppressed report is discarded together with its fix, so it
              // must not claim the import carrier slot.
              if (isReportSuppressed(node.name)) {
                return null;
              }

              // A hoisted jest factory cannot reach the injected import, so
              // the rewrite is withheld inside one.
              if (isInsideMockFactory(node)) {
                return null;
              }

              // Every bail precedes the latch so a withheld edit cannot make a
              // later fix believe the import is already handled.
              if (!resolvesToReactFragment(node)) {
                return null;
              }

              const fixes: ReturnType<typeof fixer.replaceText>[] = [];

              // Add Fragment import if needed
              if (!fragmentImportPresent()) {
                fixes.push(addFragmentImport(fixer));
                importScheduled = true;
              }

              // Replace opening tag
              const openingText = sourceCode.getText(node);
              const newOpeningText = openingText.replace(
                'React.Fragment',
                'Fragment',
              );
              fixes.push(fixer.replaceText(node, newOpeningText));

              // Replace closing tag if it exists
              if (jsxElement.closingElement) {
                const closingText = sourceCode.getText(
                  jsxElement.closingElement,
                );
                const newClosingText = closingText.replace(
                  'React.Fragment',
                  'Fragment',
                );
                fixes.push(
                  fixer.replaceText(jsxElement.closingElement, newClosingText),
                );
              }

              return fixes;
            },
          });
          return;
        }

        // If this React.Fragment contains a JSXFragment, skip it as it will be
        // handled by the JSXFragment visitor for proper nesting
        if (hasJSXFragmentChild) {
          return;
        }

        context.report({
          node: node.name,
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
          fix(fixer) {
            // A suppressed report is discarded together with its fix, so it
            // must not claim the import carrier slot.
            if (isReportSuppressed(node.name)) {
              return null;
            }

            // A hoisted jest factory cannot reach the injected import, so the
            // rewrite is withheld inside one.
            if (isInsideMockFactory(node)) {
              return null;
            }

            // Every bail precedes the latch so a withheld edit cannot make a
            // later fix believe the import is already handled.
            if (!resolvesToReactFragment(node)) {
              return null;
            }

            const fixes: ReturnType<typeof fixer.replaceText>[] = [];

            // Add Fragment import if needed
            if (!fragmentImportPresent()) {
              fixes.push(addFragmentImport(fixer));
              importScheduled = true;
            }

            // Replace opening tag
            const openingText = sourceCode.getText(node);
            const newOpeningText = openingText.replace(
              'React.Fragment',
              'Fragment',
            );
            fixes.push(fixer.replaceText(node, newOpeningText));

            // Replace closing tag if it exists
            if (jsxElement.closingElement) {
              const closingText = sourceCode.getText(jsxElement.closingElement);
              const newClosingText = closingText.replace(
                'React.Fragment',
                'Fragment',
              );
              fixes.push(
                fixer.replaceText(jsxElement.closingElement, newClosingText),
              );
            }

            return fixes;
          },
        });
      },
    };
  },
});
