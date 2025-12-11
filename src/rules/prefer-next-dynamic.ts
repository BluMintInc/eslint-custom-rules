import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'preferNextDynamic'
  | 'addNextDynamicImport'
  | 'removeUseDynamicImport';

type Options = [
  {
    useDynamicSources?: string[];
  }?,
];

const DEFAULT_USE_DYNAMIC_SOURCES = [
  'useDynamic',
  './useDynamic',
  '../hooks/useDynamic',
  '../../hooks/useDynamic',
];

function matchesAllowedSource(source: string, allowedSources: string[]): boolean {
  return allowedSources.some(
    (pattern) => source === pattern || source.endsWith(`/${pattern}`),
  );
}

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

type UseDynamicImportMatch = {
  importNode: TSESTree.ImportDeclaration;
  specifier:
    | TSESTree.ImportSpecifier
    | TSESTree.ImportDefaultSpecifier
    | TSESTree.ImportNamespaceSpecifier;
  localName: string;
};

function findUseDynamicImport(
  program: TSESTree.Program,
  allowedSources: string[],
): UseDynamicImportMatch | null {
  const imports = getImportDeclarations(program);
  for (const imp of imports) {
    if (typeof imp.source.value !== 'string') continue;
    const source = imp.source.value;
    if (!matchesAllowedSource(source, allowedSources)) continue;

    const importedUseDynamic = imp.specifiers.find(
      (s) =>
        (s.type === AST_NODE_TYPES.ImportSpecifier &&
          s.imported.type === AST_NODE_TYPES.Identifier &&
          s.imported.name === 'useDynamic') ||
        s.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
        (s.type === AST_NODE_TYPES.ImportSpecifier &&
          s.local.name === 'useDynamic'),
    );

    if (importedUseDynamic && importedUseDynamic.local.name === 'useDynamic') {
      return {
        importNode: imp,
        specifier: importedUseDynamic,
        localName: importedUseDynamic.local.name,
      };
    }
  }
  return null;
}

function getNextDynamicLocalName(program: TSESTree.Program): string | null {
  for (const imp of getImportDeclarations(program)) {
    if (imp.source.value === 'next/dynamic') {
      const def = imp.specifiers.find(
        (s) => s.type === AST_NODE_TYPES.ImportDefaultSpecifier,
      ) as TSESTree.ImportDefaultSpecifier | undefined;
      if (def) return def.local.name;
    }
  }
  return null;
}

function buildDynamicReplacement(
  call: TSESTree.CallExpression,
  variableKind: 'const' | 'let' | 'var',
  variableIdText: string,
  namedExportKey: string | null,
  sourceCode: TSESLint.SourceCode,
  dynamicIdent: string,
): string {
  const expr = buildDynamicExpression(
    call,
    namedExportKey,
    sourceCode,
    dynamicIdent,
  );
  return `${variableKind} ${variableIdText} = ${expr};`;
}

function buildDynamicExpression(
  call: TSESTree.CallExpression,
  namedExportKey: string | null,
  sourceCode: TSESLint.SourceCode,
  dynamicIdent: string,
): string {
  // call.arguments[0] is ImportExpression
  const importExpr = call.arguments[0] as TSESTree.ImportExpression;
  const importArgText = sourceCode.getText(importExpr.source);

  const returnExpr = namedExportKey ? `mod.${namedExportKey}` : 'mod.default';

  const dynamicText = `${dynamicIdent}(
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
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          useDynamicSources: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferNextDynamic:
        'Use Next.js dynamic() instead of useDynamic(import(...)) for component imports',
      addNextDynamicImport:
        "Add default import: import dynamic from 'next/dynamic'",
      removeUseDynamicImport: 'Remove unused useDynamic import',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const [options = {}] = context.options;
    const allowedUseDynamicSources =
      options.useDynamicSources && options.useDynamicSources.length > 0
        ? options.useDynamicSources
        : DEFAULT_USE_DYNAMIC_SOURCES;
    const sourceCode = context.getSourceCode();

    return {
      VariableDeclarator(node) {
        const info = inferVariableInfo(node);
        if (!info) return;

        // For edge case 1 (Non-Component Imports): we conservatively only transform when the LHS is used in JSX.
        // Heuristic: if identifier appears in any JSXOpeningElement as name, consider a component.
        const program = findProgramNode(node);
        if (!program) return;

        const useDynamicImportInfo = findUseDynamicImport(
          program,
          allowedUseDynamicSources,
        );
        if (!useDynamicImportInfo) return;

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
          fix(fixer) {
            const fixes: TSESLint.RuleFix[] = [];

            // ensure dynamic import is present
            const programNode = findProgramNode(node)!;
            let dynamicLocal = getNextDynamicLocalName(programNode);
            const hasDynamic = !!dynamicLocal;
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
              dynamicLocal = 'dynamic';
            }

            // Replace the variable declarator text with dynamic(...) usage
            if (parentDecl.declarations.length === 1) {
              const variableText = buildDynamicReplacement(
                init,
                parentDecl.kind,
                info.idText,
                info.namedExportKey,
                sourceCode,
                dynamicLocal || 'dynamic',
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
                  dynamicLocal || 'dynamic',
                );
                fixes.push(fixer.replaceText(init, dynamicExpr));
              } else if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
                // Replace the whole declarator with "<localName> = dynamic(...)"
                const dynamicExpr = buildDynamicExpression(
                  init,
                  info.namedExportKey,
                  sourceCode,
                  dynamicLocal || 'dynamic',
                );
                const replacement = `${info.idText} = ${dynamicExpr}`;
                fixes.push(fixer.replaceText(node, replacement));
              }
            }

            // Remove unused useDynamic import if present and no longer referenced
            const latestUseDynamicImport = findUseDynamicImport(
              programNode,
              allowedUseDynamicSources,
            );
            if (latestUseDynamicImport) {
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
              const specifiers = latestUseDynamicImport.importNode.specifiers;
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
                  fixes.push(fixer.remove(latestUseDynamicImport.importNode));
                  // If dynamic was already present (we didn't insert), collapse the extra newline left by removal
                  if (hasDynamic) {
                    const after = latestUseDynamicImport.importNode.range[1];
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
                    const newText = `import { ${specText} } from '${latestUseDynamicImport.importNode.source.value}';`;
                    fixes.push(
                      fixer.replaceText(latestUseDynamicImport.importNode, newText),
                    );
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
