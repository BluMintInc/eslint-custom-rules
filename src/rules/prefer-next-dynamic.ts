import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'preferNextDynamic'
  | 'addNextDynamicImport'
  | 'removeUseDynamicImport';

type Options = [];

function isUseDynamicCall(node: TSESTree.CallExpression): boolean {
  const { callee, arguments: args } = node;
  if (
    callee.type === AST_NODE_TYPES.Identifier &&
    callee.name === 'useDynamic' &&
    args.length === 1 &&
    args[0].type === AST_NODE_TYPES.ImportExpression
  ) {
    return true;
  }
  return false;
}

function findProgramNode(node: TSESTree.Node): TSESTree.Program | null {
  let current: TSESTree.Node | undefined = node;
  while (current && current.type !== AST_NODE_TYPES.Program) {
    current = current.parent as TSESTree.Node | undefined;
  }
  return (current as TSESTree.Program) || null;
}

function getImportDeclarations(
  program: TSESTree.Program,
): TSESTree.ImportDeclaration[] {
  return program.body.filter(
    (n): n is TSESTree.ImportDeclaration =>
      n.type === AST_NODE_TYPES.ImportDeclaration,
  );
}

function findUseDynamicImport(
  program: TSESTree.Program,
): TSESTree.ImportDeclaration | null {
  const imports = getImportDeclarations(program);
  for (const imp of imports) {
    if (typeof imp.source.value === 'string') {
      const importedUseDynamic = imp.specifiers.find(
        (s) =>
          (s.type === AST_NODE_TYPES.ImportSpecifier &&
            s.imported.type === AST_NODE_TYPES.Identifier &&
            s.imported.name === 'useDynamic') ||
          (s.type === AST_NODE_TYPES.ImportDefaultSpecifier &&
            s.local.name === 'useDynamic') ||
          (s.type === AST_NODE_TYPES.ImportSpecifier &&
            s.local.name === 'useDynamic'),
      );
      if (importedUseDynamic) return imp;
    }
  }
  return null;
}

function hasNextDynamicImport(program: TSESTree.Program): boolean {
  return getImportDeclarations(program).some((imp) => {
    return (
      imp.source.value === 'next/dynamic' &&
      imp.specifiers.some(
        (s) => s.type === AST_NODE_TYPES.ImportDefaultSpecifier,
      )
    );
  });
}

function buildDynamicReplacement(
  call: TSESTree.CallExpression,
  variableKind: 'const' | 'let' | 'var',
  variableIdText: string,
  namedExportKey: string | null,
  sourceCode: TSESLint.SourceCode,
): string {
  const expr = buildDynamicExpression(call, namedExportKey, sourceCode);
  return `${variableKind} ${variableIdText} = ${expr};`;
}

function buildDynamicExpression(
  call: TSESTree.CallExpression,
  namedExportKey: string | null,
  sourceCode: TSESLint.SourceCode,
): string {
  // call.arguments[0] is ImportExpression
  const importExpr = call.arguments[0] as TSESTree.ImportExpression;
  const importArgText = sourceCode.getText(importExpr.source);

  const returnExpr = namedExportKey ? `mod.${namedExportKey}` : 'mod.default';

  const dynamicText = `dynamic(
  async () => {
    const mod = await import(${importArgText});
    return ${returnExpr};
  },
  { ssr: false }
)`;
  return dynamicText;
}

function inferVariableInfo(node: TSESTree.VariableDeclarator): {
  kind: 'const' | 'let' | 'var';
  idText: string;
  namedExportKey: string | null;
} | null {
  // Support: const Foo = useDynamic(import('...'));
  // or: const { Picker } = useDynamic(import('...'));
  const decl = node;
  if (!decl.init || decl.init.type !== AST_NODE_TYPES.CallExpression) {
    return null;
  }

  if (!isUseDynamicCall(decl.init)) return null;

  let kind: 'const' | 'let' | 'var' = 'const';
  const parent = decl.parent;
  if (
    parent &&
    parent.type === AST_NODE_TYPES.VariableDeclaration &&
    (parent.kind === 'const' || parent.kind === 'let' || parent.kind === 'var')
  ) {
    kind = parent.kind;
  }

  if (decl.id.type === AST_NODE_TYPES.Identifier) {
    return { kind, idText: decl.id.name, namedExportKey: null };
  }
  if (decl.id.type === AST_NODE_TYPES.ObjectPattern) {
    // Only handle a single-property destructure like { Picker }
    if (decl.id.properties.length !== 1) {
      return null;
    }
    const prop = decl.id.properties[0];
    if (prop && prop.type === AST_NODE_TYPES.Property) {
      const key =
        prop.key.type === AST_NODE_TYPES.Identifier ? prop.key.name : null;
      const valueName =
        prop.value.type === AST_NODE_TYPES.Identifier ? prop.value.name : null;
      if (key && valueName) {
        return { kind, idText: valueName, namedExportKey: key };
      }
    }
  }
  return null;
}

export const preferNextDynamic = createRule<Options, MessageIds>({
  name: 'prefer-next-dynamic',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prefer Next.js dynamic() over custom useDynamic() for component imports',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferNextDynamic:
        'Component "{{componentName}}" is created with useDynamic(import(...)), which bypasses Next.js dynamic() handling for client-only components and leaves SSR control to a custom wrapper. Wrap the import in dynamic(() => import(...), { ssr: false }) so Next.js manages code-splitting and disables server rendering safely.',
      addNextDynamicImport:
        "Add `import dynamic from 'next/dynamic'` so the fixer can call Next.js dynamic() and avoid a runtime ReferenceError when replacing useDynamic(import(...)).",
      removeUseDynamicImport:
        'Remove the unused useDynamic import after migrating to dynamic(); leaving the custom hook imported invites accidental reuse and keeps dead code in the bundle.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      VariableDeclarator(node) {
        const info = inferVariableInfo(node);
        if (!info) return;

        // For edge case 1 (Non-Component Imports): we conservatively only transform when the LHS is used in JSX.
        // Heuristic: if identifier appears in any JSXOpeningElement as name, consider a component.
        const program = findProgramNode(node);
        if (!program) return;

        const identifierName = info.idText;
        let usedInJsx = false;
        const scopeBody = program.body;
        // Walk AST to find JSX usage; track visited nodes to avoid cycles
        // Note: We intentionally avoid relying on tokens here.
        // Fallback AST traversal for JSX usage
        const visited = new WeakSet<object>();
        const checkJsxUsage = (n: TSESTree.Node) => {
          if (visited.has(n)) return;
          visited.add(n);
          if (usedInJsx) return;
          if (n.type === AST_NODE_TYPES.JSXOpeningElement) {
            const name = n.name;
            if (name.type === AST_NODE_TYPES.JSXIdentifier) {
              if (name.name === identifierName) usedInJsx = true;
            } else if (name.type === AST_NODE_TYPES.JSXMemberExpression) {
              // Not matching identifier simple usage
            }
          }
          // recurse
          const anyNode = n as unknown as Record<string, unknown>;
          for (const key of Object.keys(anyNode)) {
            if (key === 'parent') continue;
            const child = anyNode[key];
            if (Array.isArray(child)) {
              for (const c of child) {
                if (c && typeof (c as any).type === 'string') {
                  checkJsxUsage(c as unknown as TSESTree.Node);
                }
              }
            } else if (child && typeof child === 'object') {
              if (
                (child as any).type &&
                typeof (child as any).type === 'string'
              ) {
                checkJsxUsage(child as unknown as TSESTree.Node);
              }
            }
          }
        };
        scopeBody.forEach((b) => checkJsxUsage(b as unknown as TSESTree.Node));

        if (!usedInJsx) {
          // Skip to avoid flagging non-component dynamic imports
          return;
        }

        // Now we are confident enough to report and fix
        const init = node.init as TSESTree.CallExpression;
        const parentDecl = node.parent as TSESTree.VariableDeclaration;

        context.report({
          node: init,
          messageId: 'preferNextDynamic',
          data: { componentName: identifierName },
          fix(fixer) {
            const fixes: TSESLint.RuleFix[] = [];

            // ensure dynamic import is present
            const programNode = findProgramNode(node)!;
            const hasDynamic = hasNextDynamicImport(programNode);
            if (!hasDynamic) {
              // Insert after directive prologue (e.g., "use client")
              const insertionIndex = programNode.body.findIndex((stmt) => {
                return !(
                  stmt.type === AST_NODE_TYPES.ExpressionStatement &&
                  stmt.expression.type === AST_NODE_TYPES.Literal &&
                  typeof stmt.expression.value === 'string'
                );
              });
              const target =
                insertionIndex === -1
                  ? programNode.body[0]
                  : programNode.body[insertionIndex];
              const indentation = '';
              fixes.push(
                fixer.insertTextBefore(
                  target,
                  `${indentation}import dynamic from 'next/dynamic';\n`,
                ),
              );
            }

            // Replace the variable declarator text with dynamic(...) usage
            if (parentDecl.declarations.length === 1) {
              const variableText = buildDynamicReplacement(
                init,
                parentDecl.kind,
                info.idText,
                info.namedExportKey,
                sourceCode,
              );
              fixes.push(fixer.replaceText(parentDecl, variableText));
            } else {
              // Multiple declarators:
              if (node.id.type === AST_NODE_TYPES.Identifier) {
                // Replace only the initializer expression
                const dynamicExpr = buildDynamicExpression(
                  init,
                  info.namedExportKey,
                  sourceCode,
                );
                fixes.push(fixer.replaceText(init, dynamicExpr));
              } else if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
                // Replace the whole declarator with "<localName> = dynamic(...)"
                const dynamicExpr = buildDynamicExpression(
                  init,
                  info.namedExportKey,
                  sourceCode,
                );
                const replacement = `${info.idText} = ${dynamicExpr}`;
                fixes.push(fixer.replaceText(node, replacement));
              }
            }

            // Remove unused useDynamic import if present and no longer referenced
            const useDynamicImport = findUseDynamicImport(programNode);
            if (useDynamicImport) {
              // Abort removal if there are other useDynamic(import(...)) calls in the file
              let otherUseDynamicCalls = false;
              const visit = (n: TSESTree.Node) => {
                if (otherUseDynamicCalls) return;
                if (
                  n.type === AST_NODE_TYPES.CallExpression &&
                  isUseDynamicCall(n)
                ) {
                  if (n !== init) otherUseDynamicCalls = true;
                }
                const anyNode = n as unknown as Record<string, unknown>;
                for (const key of Object.keys(anyNode)) {
                  if (key === 'parent') continue;
                  const child = anyNode[key];
                  if (Array.isArray(child)) {
                    for (const c of child)
                      if (c && typeof (c as any).type === 'string')
                        visit(c as any);
                  } else if (
                    child &&
                    typeof child === 'object' &&
                    (child as any).type
                  ) {
                    visit(child as any);
                  }
                }
              };
              programNode.body.forEach((b) =>
                visit(b as unknown as TSESTree.Node),
              );
              if (otherUseDynamicCalls) {
                return fixes; // keep the import; other occurrences still rely on it
              }
              // If import had only useDynamic, remove entire declaration; else remove just its specifier
              const specifiers = useDynamicImport.specifiers;
              const useDynamicSpecifier = specifiers.find(
                (s) =>
                  (s.type === AST_NODE_TYPES.ImportSpecifier &&
                    s.imported.type === AST_NODE_TYPES.Identifier &&
                    s.imported.name === 'useDynamic') ||
                  (s.type === AST_NODE_TYPES.ImportDefaultSpecifier &&
                    s.local.name === 'useDynamic') ||
                  (s.type === AST_NODE_TYPES.ImportSpecifier &&
                    s.local.name === 'useDynamic'),
              );
              if (useDynamicSpecifier) {
                if (specifiers.length === 1) {
                  // Remove entire import
                  fixes.push(fixer.remove(useDynamicImport));
                  // If dynamic was already present (we didn't insert), collapse the extra newline left by removal
                  if (hasDynamic) {
                    const after = useDynamicImport.range[1];
                    if (after < sourceCode.text.length) {
                      const ch = sourceCode.text[after];
                      if (ch === '\n' || ch === '\r') {
                        fixes.push(fixer.removeRange([after, after + 1]));
                      }
                    }
                  }
                } else {
                  // If only named specifiers exist, reconstruct a clean import text
                  const onlyNamed = specifiers.every(
                    (s) => s.type === AST_NODE_TYPES.ImportSpecifier,
                  );
                  if (onlyNamed) {
                    const remaining = specifiers.filter(
                      (s) => s !== useDynamicSpecifier,
                    ) as TSESTree.ImportSpecifier[];
                    const specText = remaining
                      .map((s) =>
                        s.imported.name === s.local.name
                          ? s.local.name
                          : `${s.imported.name} as ${s.local.name}`,
                      )
                      .join(', ');
                    const newText = `import { ${specText} } from '${useDynamicImport.source.value}';`;
                    fixes.push(fixer.replaceText(useDynamicImport, newText));
                  } else {
                    // Otherwise, remove the specifier with proper comma handling
                    const tokenAfter =
                      sourceCode.getTokenAfter(useDynamicSpecifier);
                    const tokenBefore =
                      sourceCode.getTokenBefore(useDynamicSpecifier);
                    if (tokenAfter && tokenAfter.value === ',') {
                      fixes.push(
                        fixer.removeRange([
                          useDynamicSpecifier.range[0],
                          tokenAfter.range[1],
                        ]),
                      );
                    } else if (tokenBefore && tokenBefore.value === ',') {
                      fixes.push(
                        fixer.removeRange([
                          tokenBefore.range[0],
                          useDynamicSpecifier.range[1],
                        ]),
                      );
                    } else {
                      fixes.push(fixer.remove(useDynamicSpecifier));
                    }
                  }
                }
              }
            }

            return fixes;
          },
        });
      },
    };
  },
});
