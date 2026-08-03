import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import {
  importAnchorIndent,
  importAnchorLineStart,
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';
import { planOrphanedImportRemoval } from '../utils/importRemoval';

const DEEP_COMPARE_MODULE = '@blumintinc/use-deep-compare';
const DEEP_COMPARE_HOOK = 'useDeepCompareMemo';

// Consider these as memoizing hooks producing stable references
const MEMOIZING_HOOKS = new Set([
  'useMemo',
  'useCallback',
  'useDeepCompareMemo',
  'useLatestCallback',
]);

function isUseMemoCallee(callee: TSESTree.LeftHandSideExpression): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'useMemo';
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name === 'useMemo';
  }
  return false;
}

function isIdentifierMemoizedAbove(
  name: string,
  memoizedIds: Set<string>,
): boolean {
  return memoizedIds.has(name);
}

function containsJsx(node: TSESTree.Node | null | undefined): boolean {
  if (!node) return false;
  const stack: TSESTree.Node[] = [node];
  while (stack.length) {
    const cur = stack.pop()!;
    if (
      cur.type === AST_NODE_TYPES.JSXElement ||
      cur.type === AST_NODE_TYPES.JSXFragment
    ) {
      return true;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const key of Object.keys(cur as any)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (cur as any)[key];
      if (!child) continue;
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && 'type' in c) {
            stack.push(c as TSESTree.Node);
          }
        }
      } else if (typeof child === 'object' && 'type' in child) {
        stack.push(child as TSESTree.Node);
      }
    }
  }
  return false;
}

function isNonPrimitiveWithoutTypes(expr: TSESTree.Expression): boolean {
  switch (expr.type) {
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.ObjectExpression:
    case AST_NODE_TYPES.NewExpression:
    case AST_NODE_TYPES.ClassExpression:
      return true;
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.TemplateLiteral:
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.BinaryExpression:
    case AST_NODE_TYPES.LogicalExpression:
    case AST_NODE_TYPES.MemberExpression:
    case AST_NODE_TYPES.ChainExpression:
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.FunctionExpression:
    case AST_NODE_TYPES.ArrowFunctionExpression:
    default:
      return false;
  }
}

// TypeScript-aware check. Defensive and conservative.
function isNonPrimitiveWithTypes(
  context: TSESLint.RuleContext<'preferUseDeepCompareMemo', []>,
  expr: TSESTree.Expression,
): boolean {
  const services = context.parserServices;
  if (!services?.program || !services?.esTreeNodeToTSNodeMap) {
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ts: typeof import('typescript') = require('typescript');
    const checker = services.program.getTypeChecker();
    const tsNode = services.esTreeNodeToTSNodeMap.get(expr);
    if (!tsNode) return false;
    const type = checker.getTypeAtLocation(tsNode);

    // Explicitly ignore functions even though they are non-primitive
    if (type.getCallSignatures().length > 0) return false;

    // Avoid guessing for unknown/any or non-function types
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;

    return false;
  } catch {
    return false;
  }
}

function collectMemoizedIdentifiers(
  context: TSESLint.RuleContext<'preferUseDeepCompareMemo', []>,
): Set<string> {
  const memoized = new Set<string>();
  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;

  function visit(node: TSESTree.Node): void {
    if (node.type === AST_NODE_TYPES.VariableDeclarator) {
      const id = node.id;
      const init = node.init;
      if (!init) return;
      if (init.type === AST_NODE_TYPES.CallExpression) {
        let calleeName: string | null = null;
        if (init.callee.type === AST_NODE_TYPES.Identifier) {
          calleeName = init.callee.name;
        } else if (
          init.callee.type === AST_NODE_TYPES.MemberExpression &&
          !init.callee.computed &&
          init.callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          calleeName = init.callee.property.name;
        }
        if (calleeName && MEMOIZING_HOOKS.has(calleeName)) {
          if (id.type === AST_NODE_TYPES.Identifier) {
            memoized.add(id.name);
          }
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const key of Object.keys(node as any)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
      if (!child) continue;
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && 'type' in c) {
            visit(c as TSESTree.Node);
          }
        }
      } else if (typeof child === 'object' && 'type' in child) {
        visit(child as TSESTree.Node);
      }
    }
  }

  visit(program as unknown as TSESTree.Node);
  return memoized;
}

/**
 * A specifier that binds the hook as a callable value under the exact name the
 * rewritten call spells. An alias binds the hook to some other name, leaving
 * `useDeepCompareMemo` unresolvable, and a type-only specifier erases at
 * compile time, so neither can carry the call.
 */
function bindsDeepCompareMemo(specifier: TSESTree.ImportClause): boolean {
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.type === AST_NODE_TYPES.Identifier &&
    specifier.imported.name === DEEP_COMPARE_HOOK &&
    specifier.local.name === DEEP_COMPARE_HOOK
  );
}

/**
 * The hook's import read off `Program.body` rather than off a flag set by an
 * ImportDeclaration visitor, so the answer holds under multi-pass `--fix`
 * wherever the import sits relative to the fix site.
 */
function findDeepCompareMemoImport(
  program: TSESTree.Program,
): TSESTree.ImportClause | null {
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      statement.source.value !== DEEP_COMPARE_MODULE ||
      (statement.importKind && statement.importKind !== 'value')
    ) {
      continue;
    }
    const specifier = statement.specifiers.find(bindsDeepCompareMemo);
    if (specifier) return specifier;
  }
  return null;
}

/**
 * Whether the visible `useDeepCompareMemo` binding is the very import this fix
 * would otherwise insert. Reusing that binding is the intended path; any other
 * binding of the name belongs to the file's author.
 */
function bindsHookImport(
  variable: TSESLint.Scope.Variable,
  hookImport: TSESTree.ImportClause | null,
): boolean {
  return (
    hookImport !== null &&
    variable.defs.length > 0 &&
    variable.defs.every((def) => def.node === hookImport)
  );
}

function ensureDeepCompareImportFixes(
  context: TSESLint.RuleContext<'preferUseDeepCompareMemo', []>,
  fixer: TSESLint.RuleFixer,
): TSESLint.RuleFix[] {
  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;

  // If already imported anywhere, skip adding
  if (findDeepCompareMemoImport(program)) return [];

  // The shared anchor keeps the insertion below whatever opens the file: text
  // spliced above a `#!` shebang stops the file parsing, and text above a
  // `'use client'` directive or a header comment strips the prologue of the
  // meaning it only carries while it leads.
  const anchor = importInsertionAnchor(sourceCode);
  const indent = importAnchorIndent(sourceCode, anchor);
  const importText = `${indent}import { ${DEEP_COMPARE_HOOK} } from '${DEEP_COMPARE_MODULE}';\n`;

  // Widened to the anchor's line start because the emitted statement carries
  // its own indentation, leaving the displaced anchor sitting on the original.
  return [
    insertAtImportAnchor(
      sourceCode,
      fixer,
      importAnchorLineStart(sourceCode, anchor),
      importText,
    ),
  ];
}

function isImportedIdentifier(
  context: TSESLint.RuleContext<'preferUseDeepCompareMemo', []>,
  name: string,
): boolean {
  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;
  for (const node of program.body) {
    if (node.type === AST_NODE_TYPES.ImportDeclaration) {
      for (const spec of node.specifiers) {
        if (
          spec.type === AST_NODE_TYPES.ImportSpecifier ||
          spec.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
          spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier
        ) {
          if (spec.local.name === name) return true;
        }
      }
    }
  }
  return false;
}

function identifierUsedAsObjectOrArray(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  name: string,
): boolean {
  const stack: TSESTree.Node[] = [callback.body];
  while (stack.length) {
    const node = stack.pop()!;

    if (node.type === AST_NODE_TYPES.MemberExpression) {
      let base: TSESTree.Expression = node.object as TSESTree.Expression;
      while (base.type === AST_NODE_TYPES.MemberExpression) {
        base = base.object as TSESTree.Expression;
      }
      if (base.type === AST_NODE_TYPES.Identifier && base.name === name) {
        return true; // object/array usage via property access
      }
    }

    if (node.type === AST_NODE_TYPES.ChainExpression) {
      const expr = node.expression as TSESTree.Expression;
      if (expr.type === AST_NODE_TYPES.MemberExpression) {
        let base: TSESTree.Expression = expr.object as TSESTree.Expression;
        while (base.type === AST_NODE_TYPES.MemberExpression) {
          base = base.object as TSESTree.Expression;
        }
        if (base.type === AST_NODE_TYPES.Identifier && base.name === name) {
          return true;
        }
      }
    }

    if (node.type === AST_NODE_TYPES.JSXSpreadAttribute) {
      if (
        node.argument.type === AST_NODE_TYPES.Identifier &&
        node.argument.name === name
      ) {
        return true;
      }
    }

    if (node.type === AST_NODE_TYPES.SpreadElement) {
      if (
        node.argument.type === AST_NODE_TYPES.Identifier &&
        node.argument.name === name
      ) {
        return true;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const key of Object.keys(node as any)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
      if (!child) continue;
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && 'type' in c) {
            stack.push(c as TSESTree.Node);
          }
        }
      } else if (typeof child === 'object' && 'type' in child) {
        stack.push(child as TSESTree.Node);
      }
    }
  }
  return false;
}

export type MessageIds = 'preferUseDeepCompareMemo';

export const preferUseDeepCompareMemo = createRule<[], MessageIds>({
  name: 'prefer-use-deep-compare-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using useDeepCompareMemo when dependency array contains non-primitive values (objects, arrays) that are not already memoized. This prevents unnecessary re-renders due to reference changes.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferUseDeepCompareMemo:
        'Dependency array for "{{hook}}" includes objects/arrays that change identity each render, so React treats them as changed and reruns the memoized computation, triggering avoidable renders. Use useDeepCompareMemo (or memoize those dependencies first) so comparisons use deep equality and the memo stays stable.',
    },
  },
  defaultOptions: [],
  create(context) {
    const memoizedIds = collectMemoizedIdentifiers(context);

    return {
      CallExpression(node) {
        if (!isUseMemoCallee(node.callee)) return;
        if (node.arguments.length === 0) return;

        const callback = node.arguments[0];
        if (
          callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callback.type !== AST_NODE_TYPES.FunctionExpression
        ) {
          return;
        }

        // Ignore if JSX is present inside the memo callback
        if (containsJsx(callback)) return;

        // Get dependency array (last argument)
        const depsArg = node.arguments[node.arguments.length - 1];
        if (!depsArg || depsArg.type !== AST_NODE_TYPES.ArrayExpression) return;

        // Empty dependency arrays should be ignored
        if (depsArg.elements.length === 0) return;

        // Determine if any dependency is a non-primitive and not already memoized
        let hasUnmemoizedNonPrimitive = false;

        for (const el of depsArg.elements) {
          if (!el) continue; // holes
          if (el.type === AST_NODE_TYPES.SpreadElement) continue;

          const expr = el as TSESTree.Expression;

          // TS-aware check first
          let isNonPrimitive = isNonPrimitiveWithTypes(context, expr);

          // Fallback heuristic without type info for literals/arrays/objects/functions
          if (!isNonPrimitive) {
            isNonPrimitive = isNonPrimitiveWithoutTypes(expr);
          }

          // Identifier-specific heuristic: consider non-primitive only if used as object or function in callback
          if (!isNonPrimitive && expr.type === AST_NODE_TYPES.Identifier) {
            // Imported identifiers are treated as stable
            if (isImportedIdentifier(context, expr.name)) {
              isNonPrimitive = false;
            } else if (
              identifierUsedAsObjectOrArray(callback, expr.name) &&
              !isIdentifierMemoizedAbove(expr.name, memoizedIds)
            ) {
              isNonPrimitive = true;
            }
          }

          if (!isNonPrimitive) continue;

          // If identifier and memoized above, skip
          if (
            expr.type === AST_NODE_TYPES.Identifier &&
            isIdentifierMemoizedAbove(expr.name, memoizedIds)
          ) {
            continue;
          }

          hasUnmemoizedNonPrimitive = true;
          break;
        }

        if (!hasUnmemoizedNonPrimitive) return;

        // Captured during traversal because the fix runs afterwards, when an
        // ESLint version lacking sourceCode.getScope can only report the
        // global scope and would miss a narrower shadow.
        const scope = ASTHelpers.getScope(context, node);

        context.report({
          node,
          messageId: 'preferUseDeepCompareMemo',
          data: {
            hook: 'useMemo',
          },
          fix(fixer) {
            // Resolve the emitted name through the scope chain at the call
            // site. A binding that is not this fix's own import makes the edit
            // wrong twice over: the inserted import declares the name a second
            // time (TS2440/TS2300), and a shadowing parameter or local silently
            // routes the call to the wrong value with no diagnostic at all.
            // Declining leaves the report so the author migrates deliberately —
            // including the useMemo specifier removal below, which would
            // otherwise strip an import the untouched call site still needs.
            const existing = ASTHelpers.findVariableInScope(
              scope,
              DEEP_COMPARE_HOOK,
            );
            if (
              existing &&
              !bindsHookImport(
                existing,
                findDeepCompareMemoImport(context.sourceCode.ast),
              )
            ) {
              return null;
            }

            // The callee is the text this fix deletes, so it is also the text
            // whatever carried the hook stops being read from: `useMemo` for a
            // bare call, `React` for a member call. A binding left with no
            // reference at all is unbound here, in this same fix — stripping
            // its last use and keeping the declaration trades this rule's
            // report for an unused-import one, and nothing re-reports that debt
            // once the rewrite has resolved the original violation.
            //
            // Orphanhood is judged against this one callee's removal and the
            // file as it stands. A second `useMemo` call site keeps the
            // specifier, even one this rule also reports: that sibling may be
            // `eslint-disable`d (suppression is applied after a rule emits its
            // reports, so its fix never runs) or lose its fix to a conflict, and
            // either way the surviving call would spell a name nothing binds. A
            // later pass, reading a source where the sibling is already
            // converted, finds the specifier orphaned and removes it then.
            const importRemoval = planOrphanedImportRemoval(
              context.sourceCode,
              [node.callee.range],
            );
            // No plan means a binding is orphaned yet cannot be unbound safely,
            // so the rewrite stays too: the report without a fixer is the lesser
            // damage.
            if (!importRemoval) return null;

            const fixes: TSESLint.RuleFix[] = [];

            // Replace callee
            if (node.callee.type === AST_NODE_TYPES.Identifier) {
              fixes.push(fixer.replaceText(node.callee, 'useDeepCompareMemo'));
            } else if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
              fixes.push(
                fixer.replaceText(
                  node.callee as TSESTree.MemberExpression,
                  'useDeepCompareMemo',
                ),
              );
            }

            // Ensure import exists
            fixes.push(...ensureDeepCompareImportFixes(context, fixer));

            fixes.push(
              ...importRemoval.map((range) =>
                fixer.removeRange([range[0], range[1]]),
              ),
            );

            return fixes;
          },
        });
      },
    };
  },
});

export default preferUseDeepCompareMemo;
