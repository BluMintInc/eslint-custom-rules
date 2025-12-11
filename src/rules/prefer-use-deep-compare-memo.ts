import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

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
    case AST_NODE_TYPES.FunctionExpression:
    case AST_NODE_TYPES.ArrowFunctionExpression:
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

    // Only consider explicit functions as non-primitive here
    if (type.getCallSignatures().length > 0) return true;

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

function ensureDeepCompareImportFixes(
  context: TSESLint.RuleContext<'preferUseDeepCompareMemo', []>,
  fixer: TSESLint.RuleFixer,
): TSESLint.RuleFix[] {
  const fixes: TSESLint.RuleFix[] = [];
  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;

  // If already imported anywhere, skip adding
  const hasImport = program.body.some(
    (n) =>
      n.type === AST_NODE_TYPES.ImportDeclaration &&
      n.source.value === '@blumintinc/use-deep-compare' &&
      n.specifiers.some(
        (s) =>
          s.type === AST_NODE_TYPES.ImportSpecifier &&
          s.imported.type === AST_NODE_TYPES.Identifier &&
          s.imported.name === 'useDeepCompareMemo',
      ),
  );
  if (hasImport) return fixes;

  // Determine insertion point and indentation
  const importDecls = program.body.filter(
    (n) => n.type === AST_NODE_TYPES.ImportDeclaration,
  ) as TSESTree.ImportDeclaration[];

  const fullText = sourceCode.getText();
  let importText = `import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';\n`;

  if (importDecls.length === 0) {
    fixes.push(fixer.insertTextBeforeRange([0, 0], importText));
  } else {
    const firstImport = importDecls[0];
    const before = fullText.slice(0, firstImport.range![0]);
    const lastNewline = before.lastIndexOf('\n');
    const indent = lastNewline >= 0 ? before.slice(lastNewline + 1) : '';
    importText = `${indent}${importText}`;
    fixes.push(fixer.insertTextBefore(firstImport, importText));
  }

  return fixes;
}

function findVariableInScope(scope: any, name: string): any | null {
  if (!scope) return null;
  const found = scope.variables?.find((v: any) => v.name === name);
  if (found) return found;
  if (Array.isArray(scope.childScopes)) {
    for (const child of scope.childScopes) {
      const v = findVariableInScope(child, name);
      if (v) return v;
    }
  }
  return null;
}

function isIdentifierReferenced(
  sourceCode: TSESLint.SourceCode,
  name: string,
): boolean {
  const scope = sourceCode.scopeManager?.globalScope;
  if (!scope) return true;
  const variable = findVariableInScope(scope, name);
  if (!variable) return false;
  return variable.references.some(
    (ref: any) => ref.identifier && ref.identifier.name === name,
  );
}

function removeImportSpecifierFixes(
  sourceCode: TSESLint.SourceCode,
  fixer: TSESLint.RuleFixer,
  importDecl: TSESTree.ImportDeclaration,
  specifier: TSESTree.ImportSpecifier | TSESTree.ImportDefaultSpecifier,
): TSESLint.RuleFix[] {
  const fixes: TSESLint.RuleFix[] = [];
  if (importDecl.specifiers.length === 1) {
    fixes.push(fixer.remove(importDecl));
    return fixes;
  }

  const tokenAfter = sourceCode.getTokenAfter(specifier);
  const tokenBefore = sourceCode.getTokenBefore(specifier);

  if (tokenAfter && tokenAfter.value === ',') {
    fixes.push(
      fixer.removeRange([specifier.range[0], tokenAfter.range![1]]),
    );
  } else if (tokenBefore && tokenBefore.value === ',') {
    fixes.push(
      fixer.removeRange([tokenBefore.range![0], specifier.range[1]]),
    );
  } else {
    fixes.push(fixer.remove(specifier));
  }

  return fixes;
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

function identifierUsedAsObjectOrFunction(
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

    if (node.type === AST_NODE_TYPES.CallExpression) {
      const callee = node.callee;
      if (callee.type === AST_NODE_TYPES.Identifier && callee.name === name) {
        return true; // function usage
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
        'Enforce using useDeepCompareMemo when dependency array contains non-primitive values (objects, arrays, functions) that are not already memoized. This prevents unnecessary re-renders due to reference changes.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferUseDeepCompareMemo:
        'Use useDeepCompareMemo instead of useMemo because dependency array contains unmemoized non-primitive values.',
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
              identifierUsedAsObjectOrFunction(callback, expr.name) &&
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

        context.report({
          node,
          messageId: 'preferUseDeepCompareMemo',
          fix(fixer) {
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

            // Clean up now-unused React/useMemo imports if safe
            const sourceCode = context.sourceCode;
            const program = sourceCode.ast;
            const reactImport = program.body.find(
              (n): n is TSESTree.ImportDeclaration =>
                n.type === AST_NODE_TYPES.ImportDeclaration &&
                n.source.value === 'react',
            );
            if (reactImport) {
              // remove named useMemo if unused
              const useMemoSpec = reactImport.specifiers.find(
                (s): s is TSESTree.ImportSpecifier =>
                  s.type === AST_NODE_TYPES.ImportSpecifier &&
                  s.imported.type === AST_NODE_TYPES.Identifier &&
                  s.imported.name === 'useMemo',
              );
              if (
                useMemoSpec &&
                !isIdentifierReferenced(sourceCode, useMemoSpec.local.name)
              ) {
                fixes.push(
                  ...removeImportSpecifierFixes(
                    sourceCode,
                    fixer,
                    reactImport,
                    useMemoSpec,
                  ),
                );
              }

              const defaultSpec = reactImport.specifiers.find(
                (s): s is TSESTree.ImportDefaultSpecifier =>
                  s.type === AST_NODE_TYPES.ImportDefaultSpecifier,
              );
              if (
                defaultSpec &&
                !isIdentifierReferenced(sourceCode, defaultSpec.local.name)
              ) {
                fixes.push(
                  ...removeImportSpecifierFixes(
                    sourceCode,
                    fixer,
                    reactImport,
                    defaultSpec,
                  ),
                );
              }
            }

            return fixes;
          },
        });
      },
    };
  },
});

export default preferUseDeepCompareMemo;
