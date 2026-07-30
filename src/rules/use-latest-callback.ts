import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'useLatestCallback';

type Conversion = {
  node: TSESTree.CallExpression;
  currentHook: string;
  callee: TSESTree.Identifier | null;
  // The scope the rewritten call sits in, captured during traversal because
  // the fix runs from Program:exit, where an ESLint version without
  // sourceCode.getScope would only be able to report the global scope.
  scope: TSESLint.Scope.Scope;
};

const LATEST_CALLBACK_MODULE = 'use-latest-callback';
const LATEST_CALLBACK_HOOK = 'useLatestCallback';

type LatestCallbackImport = {
  specifier: TSESTree.ImportClause;
  /** The local name the rewritten calls must spell to reach the hook. */
  reference: string;
};

/**
 * A specifier that binds the hook itself as a value. The module's sole export
 * is the hook, so a default specifier binds it under any local name. A
 * namespace specifier binds the module object rather than a callable, and a
 * type-only specifier erases at compile time, so neither can carry the call.
 */
const bindsLatestCallback = (specifier: TSESTree.ImportClause): boolean => {
  if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
    return true;
  }
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.type === AST_NODE_TYPES.Identifier &&
    specifier.imported.name === LATEST_CALLBACK_HOOK
  );
};

/**
 * The hook's import read off `Program.body` rather than off a flag set by an
 * ImportDeclaration visitor, so the answer holds wherever the import sits
 * relative to the fix site. Reading the AST also exposes the shapes a
 * name-only flag conflates with a usable binding: a namespace import, a
 * type-only import, and a reverse alias
 * (`import { other as useLatestCallback }`) each bind a name without binding
 * the hook.
 */
const findLatestCallbackImport = (
  program: TSESTree.Program,
): LatestCallbackImport | null => {
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      statement.source.value !== LATEST_CALLBACK_MODULE ||
      (statement.importKind && statement.importKind !== 'value')
    ) {
      continue;
    }
    const specifier = statement.specifiers.find(bindsLatestCallback);
    if (specifier) {
      return { specifier, reference: specifier.local.name };
    }
  }
  return null;
};

export const useLatestCallback = createRule<[], MessageIds>({
  name: 'use-latest-callback',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using useLatestCallback from use-latest-callback instead of React useCallback',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useLatestCallback:
        'Replace {{currentHook}} with {{recommendedHook}} from "use-latest-callback" so the callback keeps a stable reference while still reading the latest props/state. useCallback recreates functions whenever dependencies change, which can trigger needless renders and stale closures. Drop the dependency array when switching to {{recommendedHook}}.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.getFilename();
    if (filename.includes('/node_modules/')) {
      return {};
    }

    const useCallbackLocalNames = new Set<string>();
    const reactNamespaceNames = new Set<string>();
    const reactDefaultLikeNames = new Set<string>();
    let hasReactMemberUseCallback = false;

    // Calls queued for conversion. Reporting is deferred to Program:exit because
    // the replacement name depends on whether any reference to react's
    // useCallback binding survives the fix, which is only knowable file-wide:
    // ESLint evaluates a report's fixer eagerly, so a call visited before a
    // later JSX-returning call would otherwise commit to a stale name.
    const conversions: Conversion[] = [];

    const isJSXLikeReturn = (
      node: TSESTree.Node | null | undefined,
    ): boolean => {
      if (!node) return false;

      if (
        node.type === AST_NODE_TYPES.JSXElement ||
        node.type === AST_NODE_TYPES.JSXFragment ||
        node.type === AST_NODE_TYPES.JSXExpressionContainer
      ) {
        return true;
      }

      if ((node as { type: string }).type === 'ParenthesizedExpression') {
        return isJSXLikeReturn(
          (node as { expression?: TSESTree.Node }).expression,
        );
      }

      if (node.type === AST_NODE_TYPES.SequenceExpression) {
        return isJSXLikeReturn(node.expressions[node.expressions.length - 1]);
      }

      if (node.type === AST_NODE_TYPES.ArrayExpression) {
        return node.elements.some((el) =>
          isJSXLikeReturn(
            el && el.type === AST_NODE_TYPES.SpreadElement
              ? el.argument
              : (el as TSESTree.Expression | null | undefined),
          ),
        );
      }

      if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          isJSXLikeReturn(node.consequent) || isJSXLikeReturn(node.alternate)
        );
      }

      if (node.type === AST_NODE_TYPES.LogicalExpression) {
        return isJSXLikeReturn(node.left) || isJSXLikeReturn(node.right);
      }

      if (node.type === AST_NODE_TYPES.CallExpression) {
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          reactNamespaceNames.has(node.callee.object.name) &&
          node.callee.property.name === 'createElement'
        ) {
          return true;
        }
      }

      return false;
    };

    return {
      // First pass: check imports
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.importKind && node.importKind !== 'value') return;

        if (node.source.value === 'react') {
          // Check if useCallback is imported from React
          const useCallbackSpecifiers = node.specifiers.filter((specifier) => {
            return (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'useCallback'
            );
          }) as TSESTree.ImportSpecifier[];

          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
              specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
            ) {
              reactNamespaceNames.add(specifier.local.name);
              reactDefaultLikeNames.add(specifier.local.name);
            }
          });

          if (useCallbackSpecifiers.length > 0) {
            useCallbackSpecifiers.forEach((spec) => {
              useCallbackLocalNames.add(spec.local.name);
            });
          }
        }
      },

      // Check for useCallback usage and identify JSX-returning callbacks
      CallExpression(node: TSESTree.CallExpression) {
        const isUseCallbackIdentifierCall =
          node.callee.type === AST_NODE_TYPES.Identifier &&
          useCallbackLocalNames.has(node.callee.name);

        const isUseCallbackMemberCall =
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          reactDefaultLikeNames.has(node.callee.object.name) &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'useCallback';

        if (
          (isUseCallbackIdentifierCall || isUseCallbackMemberCall) &&
          node.arguments.length >= 1
        ) {
          if (isUseCallbackMemberCall) {
            hasReactMemberUseCallback = true;
          }

          // Check if this is a JSX-returning callback (edge case where we shouldn't replace)
          const callback = node.arguments[0];
          let isJsxReturning = false;

          if (
            (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              callback.type === AST_NODE_TYPES.FunctionExpression) &&
            callback.body
          ) {
            // For arrow functions with implicit return
            if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
              if (isJSXLikeReturn(callback.body)) {
                isJsxReturning = true;
              }
            }
            // For functions with block body - check all return statements
            else if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
              const returnStatements = callback.body.body.filter(
                (statement) =>
                  statement.type === AST_NODE_TYPES.ReturnStatement,
              ) as TSESTree.ReturnStatement[];

              // If there are return statements, check if any return JSX
              if (returnStatements.length > 0) {
                isJsxReturning = returnStatements.some(
                  (returnStatement) =>
                    returnStatement.argument &&
                    isJSXLikeReturn(returnStatement.argument),
                );
              }
            }
          }

          if (!isJsxReturning) {
            const currentCallbackName =
              node.callee.type === AST_NODE_TYPES.Identifier
                ? node.callee.name
                : node.callee.type === AST_NODE_TYPES.MemberExpression &&
                  node.callee.property.type === AST_NODE_TYPES.Identifier
                ? node.callee.property.name
                : 'useCallback';

            conversions.push({
              node,
              currentHook: currentCallbackName,
              callee:
                node.callee.type === AST_NODE_TYPES.Identifier
                  ? node.callee
                  : null,
              scope: ASTHelpers.getScope(context, node),
            });
          }
        }
      },

      // Final pass: report the queued calls and touch the react import only
      // when every reference to its useCallback binding is being converted.
      'Program:exit'() {
        if (conversions.length === 0) {
          return; // Don't modify imports if all useCallback calls return JSX
        }

        const sourceCode = context.sourceCode;
        const program = sourceCode.ast;

        const useCallbackSpecifiersOf = (
          declaration: TSESTree.ImportDeclaration,
        ) =>
          declaration.specifiers.filter(
            (specifier): specifier is TSESTree.ImportSpecifier =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'useCallback',
          );

        const reactImports = program.body.filter(
          (node): node is TSESTree.ImportDeclaration =>
            node.type === AST_NODE_TYPES.ImportDeclaration &&
            node.source.value === 'react' &&
            (!node.importKind || node.importKind === 'value'),
        );

        // The declaration that actually binds useCallback owns the rewrite. The
        // first react import is only a fallback anchor for React.useCallback
        // member calls, which leave the react import itself untouched.
        const statement =
          reactImports.find(
            (declaration) => useCallbackSpecifiersOf(declaration).length > 0,
          ) ?? reactImports[0];

        if (!statement) {
          return;
        }

        const specifiers = useCallbackSpecifiersOf(statement);

        // A conversion nested inside another conversion cannot join the atomic
        // batch: the outer replacement re-emits the inner call's original text,
        // so fixing both at once would produce overlapping edits. The inner
        // call is reported without a fix; because its callee then counts as a
        // surviving reference, the react import is preserved and a later pass
        // converts it against the rewritten text.
        const isNestedConversion = (candidate: Conversion) =>
          conversions.some(
            (other) =>
              other.node !== candidate.node &&
              other.node.range[0] <= candidate.node.range[0] &&
              candidate.node.range[1] <= other.node.range[1],
          );
        const batchedConversions = conversions.filter(
          (conversion) => !isNestedConversion(conversion),
        );
        const deferredConversions = conversions.filter(isNestedConversion);

        // A reference the fix does not rewrite (a JSX-returning call, an
        // argument-less call, or `useCallback` used as a value) keeps needing
        // react's binding, so the import must be preserved verbatim.
        const convertedCallees = new Set<TSESTree.Node>(
          batchedConversions
            .map((conversion) => conversion.callee)
            .filter((callee): callee is TSESTree.Identifier => !!callee),
        );
        const hasSurvivingReference = context
          .getDeclaredVariables(statement)
          .filter((variable) =>
            variable.defs.some((def) =>
              specifiers.some(
                (specifier) => (def.node as TSESTree.Node) === specifier,
              ),
            ),
          )
          .some((variable) =>
            variable.references.some(
              (reference) => !convertedCallees.has(reference.identifier),
            ),
          );

        // React's alias stays bound when a reference survives, so the new
        // import needs a name of its own rather than reusing that alias.
        const freeImportName = () => {
          const taken = new Set<string>();
          const collectNames = (scope: TSESLint.Scope.Scope) => {
            scope.variables.forEach((variable) => taken.add(variable.name));
            scope.childScopes.forEach(collectNames);
          };
          collectNames(ASTHelpers.getScope(context, program));

          let name = LATEST_CALLBACK_HOOK;
          let suffix = 2;
          while (taken.has(name)) {
            name = `${LATEST_CALLBACK_HOOK}${suffix++}`;
          }
          return name;
        };

        const latestCallbackImport = findLatestCallbackImport(program);

        const useCallbackLocalName = specifiers[0]?.local.name ?? 'useCallback';
        const recommendedHook = latestCallbackImport
          ? latestCallbackImport.reference
          : hasSurvivingReference
          ? freeImportName()
          : useCallbackLocalName === 'useCallback'
          ? LATEST_CALLBACK_HOOK
          : useCallbackLocalName;

        const importText = `import ${recommendedHook} from '${LATEST_CALLBACK_MODULE}';`;

        // The react specifiers this fix deletes stop binding their names, so a
        // name that comes only from them is free for the rewritten calls to
        // claim — that is how an aliased `useCallback as uc` hands `uc` over to
        // the new import.
        const releasedSpecifiers: TSESTree.Node[] =
          hasSurvivingReference || specifiers.length === 0 ? [] : specifiers;

        const claimableDefinitions = new Set<TSESTree.Node>(releasedSpecifiers);
        if (latestCallbackImport) {
          claimableDefinitions.add(latestCallbackImport.specifier);
        }

        // Whether the rewritten call reaches the hook rather than an unrelated
        // binding of the same name. Resolving through the scope chain at each
        // rewritten call catches both failure modes: a module-scope binding
        // that the inserted import would redeclare (TS2440, or TS2300 against
        // another import), and a narrower shadow that silently captures the
        // call with no diagnostic at all.
        const reachesHook = (conversion: Conversion) => {
          const existing = ASTHelpers.findVariableInScope(
            conversion.scope,
            recommendedHook,
          );
          if (!existing) {
            return true;
          }
          return (
            existing.defs.length > 0 &&
            existing.defs.every((def) =>
              claimableDefinitions.has(def.node as TSESTree.Node),
            )
          );
        };

        // The react import statement participates in the change set only when
        // it binds useCallback or anchors a React.useCallback member call.
        const touchesImport =
          specifiers.length > 0 || hasReactMemberUseCallback;

        const importFixes = (fixer: TSESLint.RuleFixer): TSESLint.RuleFix[] => {
          if (!touchesImport) {
            return [];
          }

          // A surviving reference (or a member-only file) leaves the react
          // import untouched; only the new import is added when missing.
          if (hasSurvivingReference || specifiers.length === 0) {
            if (latestCallbackImport) {
              return [];
            }
            return [fixer.insertTextBefore(statement, `${importText}\n`)];
          }

          const defaultOrNamespace = statement.specifiers.find(
            (s) =>
              s.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
              s.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
          );

          const remainingNamed = statement.specifiers.filter(
            (s): s is TSESTree.ImportSpecifier =>
              s.type === AST_NODE_TYPES.ImportSpecifier &&
              s.imported.type === AST_NODE_TYPES.Identifier &&
              s.imported.name !== 'useCallback',
          );

          const prefix =
            statement.importKind && statement.importKind !== 'value'
              ? 'import type'
              : 'import';

          if (remainingNamed.length === 0 && !defaultOrNamespace) {
            if (!latestCallbackImport) {
              return [fixer.replaceText(statement, importText)];
            }
            return [fixer.remove(statement)];
          }

          const parts: string[] = [];
          if (defaultOrNamespace) {
            parts.push(sourceCode.getText(defaultOrNamespace));
          }
          if (remainingNamed.length > 0) {
            parts.push(
              `{ ${remainingNamed
                .map((s) => sourceCode.getText(s))
                .join(', ')} }`,
            );
          }

          const replacement = `${prefix} ${parts.join(', ')} from 'react';`;

          const fixes: TSESLint.RuleFix[] = [];
          if (!latestCallbackImport) {
            fixes.push(fixer.insertTextBefore(statement, `${importText}\n`));
          }
          fixes.push(fixer.replaceText(statement, replacement));
          return fixes;
        };

        const conversionFix = (
          fixer: TSESLint.RuleFixer,
          conversion: Conversion,
        ): TSESLint.RuleFix => {
          const callbackText = sourceCode.getText(conversion.node.arguments[0]);
          const typeParams = conversion.node.typeParameters
            ? sourceCode.getText(conversion.node.typeParameters)
            : '';

          // Replace useCallback with useLatestCallback and remove the dependency array
          return fixer.replaceText(
            conversion.node,
            `${recommendedHook}${typeParams}(${callbackText})`,
          );
        };

        // Every call-site conversion and the import rewrite ride on ONE fix
        // from ONE report. ESLint discards a multi-part fix wholesale when any
        // part conflicts with another rule's fix and retries it on the next
        // pass against the updated text, whereas fixes split across reports
        // land piecemeal: the disjoint import rewrite would apply even when
        // the call-site conversion is deferred, permanently stranding a
        // `useCallback(...)` call with no import (issue #1400).
        const [fixOwner, ...followers] = batchedConversions;

        context.report({
          node: fixOwner.node,
          messageId: 'useLatestCallback',
          data: {
            currentHook: fixOwner.currentHook,
            recommendedHook,
          },
          fix(fixer) {
            // Withhold the whole edit — nothing before this point mutates
            // state, so a withheld pass cannot leave a later one believing the
            // import is in place. The violation still stands as a report so
            // the author resolves the name clash deliberately. The batch is
            // atomic, so one unreachable call site withholds all of it.
            if (!batchedConversions.every(reachesHook)) {
              return null;
            }

            return [
              ...batchedConversions.map((conversion) =>
                conversionFix(fixer, conversion),
              ),
              ...importFixes(fixer),
            ];
          },
        });

        for (const conversion of [...followers, ...deferredConversions]) {
          context.report({
            node: conversion.node,
            messageId: 'useLatestCallback',
            data: {
              currentHook: conversion.currentHook,
              recommendedHook,
            },
          });
        }

        if (!touchesImport) {
          return;
        }

        if (hasSurvivingReference && latestCallbackImport) {
          return; // The react import stays as is and the new import exists
        }

        context.report({
          node: statement,
          messageId: 'useLatestCallback',
          data: {
            currentHook: useCallbackLocalName,
            recommendedHook,
          },
        });
      },
    };
  },
});

export default useLatestCallback;
