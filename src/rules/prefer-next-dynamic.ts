import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { reindentRelocated } from '../utils/reindentRelocated';

const NEXT_DYNAMIC_MODULE = 'next/dynamic';
const DEFAULT_DYNAMIC_NAME = 'dynamic';

type MessageIds = 'preferNextDynamic';

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

function matchesAllowedSource(
  source: string,
  allowedSources: string[],
): boolean {
  return allowedSources.some(
    (pattern) => source === pattern || source.endsWith(`/${pattern}`),
  );
}

function hasNodeStructure(value: unknown): value is TSESTree.Node {
  return (
    !!value &&
    typeof value === 'object' &&
    'type' in value &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/**
 * Walks the AST and invokes the visitor on each node.
 * Uses WeakSet to prevent infinite cycles.
 *
 * @param visitor - Callback invoked on each node. Return `false` to stop
 * traversal; return `undefined` (or nothing) to continue walking.
 * @returns `false` if traversal stopped early; `true` when traversal completes.
 */
function walkAst(
  node: TSESTree.Node,
  visitor: (n: TSESTree.Node) => boolean | void,
  visited = new WeakSet<object>(),
): boolean {
  if (visited.has(node)) return true;
  visited.add(node);

  const shouldContinue = visitor(node);
  if (shouldContinue === false) return false;

  const anyNode = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(anyNode)) {
    if (key === 'parent') continue;
    const child = anyNode[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (hasNodeStructure(c)) {
          if (!walkAst(c, visitor, visited)) return false;
        }
      }
    } else if (hasNodeStructure(child)) {
      if (!walkAst(child, visitor, visited)) return false;
    }
  }
  return true;
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
    if (imp.source.value === NEXT_DYNAMIC_MODULE) {
      const def = imp.specifiers.find(
        (s) => s.type === AST_NODE_TYPES.ImportDefaultSpecifier,
      ) as TSESTree.ImportDefaultSpecifier | undefined;
      if (def) return def.local.name;
    }
  }
  return null;
}

/**
 * Whether every declaration of a visible binding is the `next/dynamic` default
 * import itself. A local variable, a function declaration, a parameter, or an
 * import from any other module all mean the emitted call would resolve
 * somewhere other than Next.js's `dynamic`.
 */
function bindsNextDynamicDefault(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (specifier.type !== AST_NODE_TYPES.ImportDefaultSpecifier) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        declaration.source.value === NEXT_DYNAMIC_MODULE
      );
    })
  );
}

/**
 * Leading whitespace of the line `node` starts on, which is the depth the text
 * replacing `node` is laid out against. A declarator can sit at any depth — a
 * nested block, or a continuation line of a multi-declarator `const` — and text
 * written for one depth is text prettier re-indents at every other one.
 */
function indentOfLineAt(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): string {
  const text = sourceCode.getText();
  const lineStart = text.lastIndexOf('\n', node.range[0] - 1) + 1;
  return /^[\t ]*/u.exec(text.slice(lineStart, node.range[0]))?.[0] ?? '';
}

function buildDynamicReplacement(
  call: TSESTree.CallExpression,
  variableKind: 'const' | 'let' | 'var',
  variableIdText: string,
  namedExportKey: string | null,
  sourceCode: TSESLint.SourceCode,
  dynamicIdent: string,
  indent: string,
): string {
  const expr = buildDynamicExpression(
    call,
    namedExportKey,
    sourceCode,
    dynamicIdent,
    indent,
  );
  return `${variableKind} ${variableIdText} = ${expr};`;
}

/**
 * `indent` is the indentation of the line the emitted call lands on; its
 * argument list is printed one step deeper and its closing paren back at it.
 */
function buildDynamicExpression(
  call: TSESTree.CallExpression,
  namedExportKey: string | null,
  sourceCode: TSESLint.SourceCode,
  dynamicIdent: string,
  indent: string,
): string {
  const argIndent = `${indent}  `;
  const bodyIndent = `${argIndent}  `;

  // call.arguments[0] is ImportExpression
  const importExpr = call.arguments[0] as TSESTree.ImportExpression;
  // The specifier is copied out of the declarator and lands inside the loader
  // body, so a specifier expression spanning lines has to be shifted to the
  // depth it lands at rather than carried at the depth it was written at.
  const importArgText = reindentRelocated(
    importExpr.source,
    bodyIndent,
    sourceCode,
  );

  const returnExpr = namedExportKey ? `mod.${namedExportKey}` : 'mod.default';

  // The loader body always holds two statements, so this argument list can
  // never print on one line: prettier breaks every argument out and, under the
  // consumer's `trailingComma: 'all'`, prints the comma below. Emitting it
  // makes the fix a prettier fixed point instead of text prettier rewrites on
  // the next format. A single-line list is the opposite case, which is why the
  // import statements this rule emits carry no trailing comma.
  const dynamicText = `${dynamicIdent}(
${argIndent}async () => {
${bodyIndent}const mod = await import(${importArgText});
${bodyIndent}return ${returnExpr};
${argIndent}},
${argIndent}{ ssr: false },
${indent})`;
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
      requiresTypeChecking: false,
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
        'Component "{{componentName}}" is created with useDynamic(import(...)), which bypasses Next.js dynamic() handling for client-only components and leaves SSR control to a custom wrapper. Wrap the import in dynamic(() => import(...), { ssr: false }) so Next.js manages code-splitting and disables server rendering safely.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const [options = {}] = context.options;
    const allowedUseDynamicSources =
      options.useDynamicSources && options.useDynamicSources.length > 0
        ? options.useDynamicSources
        : DEFAULT_USE_DYNAMIC_SOURCES;
    const sourceCode = context.sourceCode;

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
        // walkAst returns false when visitor returns false (early exit on match)
        const usedInJsx = program.body.some(
          (b) =>
            walkAst(b, (n) => {
              if (n.type === AST_NODE_TYPES.JSXOpeningElement) {
                const name = n.name;
                if (name.type === AST_NODE_TYPES.JSXIdentifier) {
                  if (name.name === identifierName) {
                    return false;
                  }
                }
              }
              return undefined;
            }) === false,
        );

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

            // Read the import off Program.body rather than a traversal flag so
            // the decision stays correct across the re-lints of a multi-pass
            // `--fix`, where an earlier pass may already have inserted it.
            const programNode = program;
            let dynamicLocal = getNextDynamicLocalName(programNode);
            const hasDynamic = !!dynamicLocal;

            // Resolve the identifier the replacement will emit through the
            // scope chain at the fix site. Any binding that is not the
            // `next/dynamic` default import makes the edit wrong: an inserted
            // import collides with a same-named declaration (TS2440/TS2300),
            // and a narrower-scope shadow silently binds the emitted call to
            // the shadow with no TypeScript diagnostic at all. Declining leaves
            // the report for the author to resolve deliberately.
            const emittedName = dynamicLocal ?? DEFAULT_DYNAMIC_NAME;
            const existing = ASTHelpers.findVariableInScope(
              ASTHelpers.getScope(context, init),
              emittedName,
            );
            if (existing && !bindsNextDynamicDefault(existing)) {
              return null;
            }

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

            // Replace the variable declarator text with dynamic(...) usage.
            // Each branch lays the call out against the line its own replaced
            // span starts on, because that is where the emitted text lands: the
            // whole declaration for a lone declarator, but a continuation line
            // of the declarator list — two columns deeper — for the others.
            if (parentDecl.declarations.length === 1) {
              const variableText = buildDynamicReplacement(
                init,
                parentDecl.kind,
                info.idText,
                info.namedExportKey,
                sourceCode,
                dynamicLocal || 'dynamic',
                indentOfLineAt(parentDecl, sourceCode),
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
                  indentOfLineAt(init, sourceCode),
                );
                fixes.push(fixer.replaceText(init, dynamicExpr));
              } else if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
                // Replace the whole declarator with "<localName> = dynamic(...)"
                const dynamicExpr = buildDynamicExpression(
                  init,
                  info.namedExportKey,
                  sourceCode,
                  dynamicLocal || 'dynamic',
                  indentOfLineAt(node, sourceCode),
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
              const otherUseDynamicCalls = programNode.body.some(
                (b) =>
                  walkAst(b, (n) => {
                    if (
                      n.type === AST_NODE_TYPES.CallExpression &&
                      isUseDynamicCall(n) &&
                      n !== init
                    ) {
                      return false;
                    }
                    return undefined;
                  }) === false,
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
                      fixer.replaceText(
                        latestUseDynamicImport.importNode,
                        newText,
                      ),
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
