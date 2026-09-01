import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

type MessageIds = 'preferFragment';

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
 * The specifier that already binds react's Fragment, or `undefined` when the
 * file has none. Read off `Program.body` at fix time rather than from a
 * traversal flag: a fragment that precedes the import declaration in source
 * order is fixed before the `ImportDeclaration` visitor has run, so a flag
 * would call the import missing and insert a duplicate.
 */
function fragmentImportSpecifier(
  program: TSESTree.Program,
): TSESTree.ImportSpecifier | undefined {
  for (const declaration of reactValueImports(program)) {
    const specifier = declaration.specifiers.find(isFragmentSpecifier);
    if (specifier) {
      return specifier;
    }
  }
  return undefined;
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

/** One tag of a fragment and the text that replaces it. */
type TagRewrite = { node: TSESTree.Node; text: string };

/**
 * A reported fragment and the rewrite it contributes to the file's fix.
 * `rewrites` is `null` for the spellings the rule reports but never rewrites,
 * and `isFixable` is deferred because suppression and scope are read at fix
 * time rather than at traversal time.
 */
type Violation = {
  node: TSESTree.Node;
  type: string;
  rewrites: TagRewrite[] | null;
  isFixable: () => boolean;
};

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
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    // ESLint builds fixes eagerly and drops inline-disabled reports afterwards,
    // so a rewrite riding on a suppressed report is discarded with it.
    // Resolving suppression before the fix is assembled keeps a report that
    // cannot survive from carrying the rewrites the surviving reports need.
    const isReportSuppressed = createSuppressionChecker(context);

    // Track nodes already accounted for, so a fragment reachable from both
    // visitors is not counted twice
    const reportedNodes = new Set<TSESTree.Node>();

    /**
     * Violations held until the whole file is known.
     *
     * Every emitted <Fragment> depends on one import binding site, and edits
     * claiming that site cannot be spread across separate reports: ESLint drops
     * all but the first as overlapping, so a file would convert one fragment
     * per `--fix` pass and stall at the pass budget. Carrying the claim and
     * every rewrite in a single fix keeps a file a one-pass conversion while
     * still denying any other rule the chance to unbind the import in the pass
     * that emits the name.
     */
    const violations: Violation[] = [];

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
     * The edit that binds the <Fragment> this fix emits: the react import when
     * the file has none, and otherwise the specifier that already binds it,
     * restated over its own range.
     *
     * Restating an existing specifier writes nothing, but it makes the fix
     * *own* the binding site, which is the whole guarantee. ESLint merges a
     * report's edits into one span and drops any span overlapping an
     * already-applied one, so an edit naming the import declaration cannot land
     * in the same pass as another rule's edit to that declaration.
     * `no-useless-fragment` unwrapping the file's other <Fragment> removes the
     * import it orphans; without the claim, that removal and a fresh <Fragment>
     * emission elsewhere both apply and leave the name unbound (TS2304).
     * Reading "the import is present" and emitting nothing for it is precisely
     * what lets the two edits pass each other.
     */
    function bindFragmentImport(fixer: TSESLint.RuleFixer) {
      const specifier = fragmentImportSpecifier(sourceCode.ast);
      return specifier
        ? fixer.replaceText(specifier, sourceCode.getText(specifier))
        : addFragmentImport(fixer);
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

    /** The `React.Fragment` tags of `element` rewritten to the bare name. */
    function reactFragmentTagRewrites(
      element: TSESTree.JSXElement,
    ): TagRewrite[] {
      const rewrites: TagRewrite[] = [
        {
          node: element.openingElement,
          text: sourceCode
            .getText(element.openingElement)
            .replace('React.Fragment', 'Fragment'),
        },
      ];

      if (element.closingElement) {
        rewrites.push({
          node: element.closingElement,
          text: sourceCode
            .getText(element.closingElement)
            .replace('React.Fragment', 'Fragment'),
        });
      }

      return rewrites;
    }

    /** The `<>` tags of `fragment` rewritten to the bare name. */
    function shorthandTagRewrites(
      fragment: TSESTree.JSXFragment,
    ): TagRewrite[] {
      return [
        {
          node: fragment.openingFragment,
          text: sourceCode
            .getText(fragment.openingFragment)
            .replace('<>', '<Fragment>'),
        },
        {
          node: fragment.closingFragment,
          text: sourceCode
            .getText(fragment.closingFragment)
            .replace('</>', '</Fragment>'),
        },
      ];
    }

    /**
     * Whether the rewrite for a fragment reported at `reportNode` may be
     * emitted.
     *
     * A suppressed report is discarded together with its fix, a hoisted jest
     * factory cannot reach the injected import, and a `Fragment` bound to
     * anything but react's captures the emitted element. Each withholds the
     * rewrite while the report stands.
     */
    function canRewrite(
      reportNode: TSESTree.Node,
      scopeNode: TSESTree.Node,
    ): boolean {
      return (
        !isReportSuppressed(reportNode) &&
        !isInsideMockFactory(scopeNode) &&
        resolvesToReactFragment(scopeNode)
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
          // A fragment inside a React.Fragment rewrites both spellings at once:
          // resolving at the inner fragment — the deeper of the two scopes —
          // covers the outer one, and a parent of a node inside a hoisted mock
          // factory is inside that factory too.
          violations.push({
            node,
            type: 'shorthand fragment (<>)',
            rewrites: [
              ...reactFragmentTagRewrites(reactFragmentParent),
              ...shorthandTagRewrites(node),
            ],
            isFixable: () => canRewrite(node, node),
          });

          // The parent React.Fragment is reported in its own right, but its
          // tags belong to the rewrite above.
          violations.push({
            node: reactFragmentParent.openingElement.name,
            type: 'React.Fragment',
            rewrites: null,
            isFixable: () => false,
          });

          // Mark the parent as already handled
          reportedNodes.add(reactFragmentParent);
          reportedNodes.add(reactFragmentParent.openingElement);
          reportedNodes.add(reactFragmentParent.openingElement.name);

          return;
        }
        // Special case: JSX Fragment with React.Fragment child (don't convert outer fragment)
        else if (hasReactFragmentChild) {
          // The inner React.Fragment's own violation carries the rewrite, so
          // the outer fragment reports without one.
          violations.push({
            node,
            type: 'shorthand fragment (<>)',
            rewrites: null,
            isFixable: () => false,
          });

          return;
        }

        // Standard handling for standalone JSX fragments
        violations.push({
          node,
          type: 'shorthand fragment (<>)',
          rewrites: shorthandTagRewrites(node),
          isFixable: () => canRewrite(node, node),
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
          violations.push({
            node: node.name,
            type: 'React.Fragment',
            rewrites: reactFragmentTagRewrites(jsxElement),
            isFixable: () => canRewrite(node.name, node),
          });
          return;
        }

        // If this React.Fragment contains a JSXFragment, skip it as it will be
        // handled by the JSXFragment visitor for proper nesting
        if (hasJSXFragmentChild) {
          return;
        }

        violations.push({
          node: node.name,
          type: 'React.Fragment',
          rewrites: reactFragmentTagRewrites(jsxElement),
          isFixable: () => canRewrite(node.name, node),
        });
      },

      'Program:exit'() {
        const fixable = violations.filter(
          (violation): violation is Violation & { rewrites: TagRewrite[] } =>
            violation.rewrites !== null && violation.isFixable(),
        );
        // The file's rewrites ride on the first fixable report. A carrier that
        // loses a range competition withdraws every <Fragment> it would have
        // emitted rather than some of them, so a lost pass leaves the file as
        // it found it and the whole conversion is re-proposed against the text
        // that did land.
        const [carrier] = fixable;

        for (const violation of violations) {
          const descriptor = {
            node: violation.node,
            messageId: 'preferFragment' as const,
            data: { type: violation.type },
          };

          if (violation !== carrier) {
            context.report(descriptor);
            continue;
          }

          context.report({
            ...descriptor,
            fix: (fixer) => [
              bindFragmentImport(fixer),
              ...fixable.flatMap((entry) =>
                entry.rewrites.map((rewrite) =>
                  fixer.replaceText(rewrite.node, rewrite.text),
                ),
              ),
            ],
          });
        }
      },
    };
  },
});
