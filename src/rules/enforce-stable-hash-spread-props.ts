import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';

type MessageIds = 'wrapSpreadPropsWithStableHash';

type Options = [
  {
    hashImport?: {
      source?: string;
      importName?: string;
    };
    allowedHashFunctions?: string[];
    hookNames?: string[];
  }?,
];

const DEFAULT_HASH_IMPORT = {
  source: 'functions/src/util/hash/stableHash',
  importName: 'stableHash',
};

const DEFAULT_HOOKS = new Set([
  'useEffect',
  'useLayoutEffect',
  'useCallback',
  'useInsertionEffect',
]);

const IGNORED_MEMO_HOOKS = new Set(['useMemo', 'useDeepCompareMemo']);

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type FunctionContext = {
  node: FunctionLike;
  isComponent: boolean;
  restNames: Set<string>;
  propsIdentifiers: Set<string>;
};

function getFunctionName(node: FunctionLike): string | null {
  if ('id' in node && node.id?.name) {
    return node.id.name;
  }

  if (
    node.type === AST_NODE_TYPES.FunctionExpression &&
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  if (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  return null;
}

function isProbablyComponent(
  node: FunctionLike,
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
): boolean {
  const name = getFunctionName(node);

  if (name && /^[A-Z]/.test(name)) {
    return true;
  }

  if (ASTHelpers.returnsJSX(node.body, context)) {
    return true;
  }

  return false;
}

function collectRestNamesFromPattern(
  pattern: TSESTree.Node,
  restNames: Set<string>,
): void {
  if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
    for (const prop of pattern.properties) {
      if (
        prop.type === AST_NODE_TYPES.RestElement &&
        prop.argument.type === AST_NODE_TYPES.Identifier
      ) {
        restNames.add(prop.argument.name);
      } else if (
        prop.type === AST_NODE_TYPES.Property &&
        prop.value.type === AST_NODE_TYPES.ObjectPattern
      ) {
        collectRestNamesFromPattern(prop.value, restNames);
      }
    }
  } else if (pattern.type === AST_NODE_TYPES.RestElement) {
    if (pattern.argument.type === AST_NODE_TYPES.Identifier) {
      restNames.add(pattern.argument.name);
    }
  } else if (pattern.type === AST_NODE_TYPES.AssignmentPattern) {
    collectRestNamesFromPattern(pattern.left, restNames);
  }
}

function collectPropsIdentifiersFromParam(
  param: TSESTree.Parameter,
  propsIdentifiers: Set<string>,
): void {
  if (param.type === AST_NODE_TYPES.Identifier) {
    propsIdentifiers.add(param.name);
  } else if (
    param.type === AST_NODE_TYPES.AssignmentPattern &&
    param.left.type === AST_NODE_TYPES.Identifier
  ) {
    propsIdentifiers.add(param.left.name);
  }
}

function getHookName(node: TSESTree.CallExpression): string | null {
  const callee = node.callee;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name;
  }

  return null;
}

function stripTypeWrappers(
  expression: TSESTree.Expression,
): TSESTree.Expression {
  if (expression.type === AST_NODE_TYPES.TSNonNullExpression) {
    return stripTypeWrappers(expression.expression as TSESTree.Expression);
  }
  if (expression.type === AST_NODE_TYPES.TSAsExpression) {
    return stripTypeWrappers(expression.expression);
  }
  if (expression.type === AST_NODE_TYPES.TSTypeAssertion) {
    return stripTypeWrappers(expression.expression);
  }
  if (expression.type === AST_NODE_TYPES.ChainExpression) {
    return stripTypeWrappers(expression.expression as TSESTree.Expression);
  }
  if ((expression as any).type === 'ParenthesizedExpression') {
    return stripTypeWrappers((expression as any).expression);
  }
  return expression;
}

function isWrappedWithAllowedHash(
  expression: TSESTree.Expression,
  allowedHashes: Set<string>,
): boolean {
  const unwrapped = stripTypeWrappers(expression);

  if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
    const callee = unwrapped.callee;
    if (
      callee.type === AST_NODE_TYPES.Identifier &&
      allowedHashes.has(callee.name)
    ) {
      return true;
    }
    if (
      callee.type === AST_NODE_TYPES.MemberExpression &&
      !callee.computed &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      allowedHashes.has(callee.property.name)
    ) {
      return true;
    }
  }

  return false;
}

function getIdentifierFromExpression(
  expression: TSESTree.Expression,
): TSESTree.Identifier | null {
  const unwrapped = stripTypeWrappers(expression);
  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    return unwrapped;
  }
  return null;
}

function getStableHashLocalNames(
  sourceCode: TSESLint.SourceCode,
  hashImport: { source: string; importName: string },
): string[] {
  const localNames: string[] = [];
  const program = sourceCode.ast;
  for (const node of program.body) {
    if (
      node.type === AST_NODE_TYPES.ImportDeclaration &&
      node.source.value === hashImport.source
    ) {
      for (const spec of node.specifiers) {
        if (
          spec.type === AST_NODE_TYPES.ImportSpecifier &&
          spec.imported.name === hashImport.importName
        ) {
          localNames.push(spec.local.name);
        }
      }
    }
  }
  return localNames;
}

function isStableHashImported(
  sourceCode: TSESLint.SourceCode,
  hashImport: { source: string; importName: string },
): boolean {
  return getStableHashLocalNames(sourceCode, hashImport).length > 0;
}

/**
 * Whether every declaration of a resolved binding is the configured hash import
 * itself. A namespace import, an import of another name or module, a parameter,
 * or a local declaration all mean the emitted call would resolve somewhere other
 * than the intended hash function.
 */
function bindsHashImport(
  variable: TSESLint.Scope.Variable,
  hashImport: { source: string; importName: string },
): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (
        specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
        specifier.imported.name !== hashImport.importName
      ) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        declaration.source.value === hashImport.source
      );
    })
  );
}

function getIndentBeforeNode(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
): string {
  const lineText = sourceCode.lines[node.loc.start.line - 1] ?? '';
  const match = lineText.match(/^[ \t]*/);
  return match ? match[0] : '';
}

function hasExhaustiveDepsDisable(
  sourceCode: TSESLint.SourceCode,
  callNode: TSESTree.CallExpression,
  depsNode: TSESTree.ArrayExpression,
): boolean {
  const [start, end] = [callNode.range[0], depsNode.range[1]];
  const callStartLine = callNode.loc.start.line;
  const depsStartLine = depsNode.loc.start.line;
  return sourceCode
    .getAllComments()
    .some(
      (comment) =>
        comment.value.includes('react-hooks/exhaustive-deps') &&
        ((comment.range[0] >= start && comment.range[1] <= end) ||
          comment.loc.end.line === callStartLine - 1 ||
          comment.loc.end.line === depsStartLine - 1),
    );
}

export const enforceStableHashSpreadProps = createRule<Options, MessageIds>({
  name: 'enforce-stable-hash-spread-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require stableHash wrapping when spread props rest objects are used in React hook dependency arrays to avoid re-renders triggered by new object references on every render.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          hashImport: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              importName: { type: 'string' },
            },
            additionalProperties: false,
          },
          allowedHashFunctions: {
            type: 'array',
            items: { type: 'string' },
          },
          hookNames: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      wrapSpreadPropsWithStableHash:
        'Rest props object(s) "{{names}}" are recreated on every render, so using them directly in a dependency array makes React rerun the hook on every render. Wrap each in stableHash() (or a memoized hash) and depend on that stable value instead to avoid noisy re-renders.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const sourceCode =
      (context as unknown as { sourceCode?: TSESLint.SourceCode }).sourceCode ??
      context.getSourceCode();
    const [options = {}] = context.options;
    const hashImport = {
      source: options.hashImport?.source ?? DEFAULT_HASH_IMPORT.source,
      importName:
        options.hashImport?.importName ?? DEFAULT_HASH_IMPORT.importName,
    };
    const existingHashLocalNames = getStableHashLocalNames(
      sourceCode,
      hashImport,
    );
    const userHookNames = new Set<string>(options.hookNames ?? []);
    const allowedHashes = new Set<string>([
      ...existingHashLocalNames,
      hashImport.importName,
      ...(options.allowedHashFunctions ?? []),
    ]);
    const hookNames = new Set<string>([...DEFAULT_HOOKS, ...userHookNames]);

    // The `import { stableHash }` statement rides on a single violation's fix,
    // so that violation is the file's import carrier. A suppressed carrier
    // would take the import down with it while the surviving violations still
    // emit `stableHash(...)`, leaving calls to an unbound identifier.
    let importPlanned = false;
    const isReportSuppressed = createSuppressionChecker(context);
    const functionStack: FunctionContext[] = [];

    function getCurrentComponentContext(): FunctionContext | undefined {
      for (let i = functionStack.length - 1; i >= 0; i -= 1) {
        if (functionStack[i].isComponent) {
          return functionStack[i];
        }
      }
      return undefined;
    }

    return {
      ':function'(node: FunctionLike) {
        const restNames = new Set<string>();
        const propsIdentifiers = new Set<string>();

        for (const param of node.params) {
          collectRestNamesFromPattern(param, restNames);
          collectPropsIdentifiersFromParam(param, propsIdentifiers);
        }

        functionStack.push({
          node,
          isComponent: isProbablyComponent(node, context),
          restNames,
          propsIdentifiers,
        });
      },
      'FunctionDeclaration:exit'() {
        functionStack.pop();
      },
      'FunctionExpression:exit'() {
        functionStack.pop();
      },
      'ArrowFunctionExpression:exit'() {
        functionStack.pop();
      },
      VariableDeclarator(node) {
        const current = getCurrentComponentContext();
        if (!current || !current.isComponent) return;

        if (
          node.id.type === AST_NODE_TYPES.ObjectPattern &&
          node.init &&
          node.init.type === AST_NODE_TYPES.Identifier &&
          current.propsIdentifiers.has(node.init.name)
        ) {
          collectRestNamesFromPattern(node.id, current.restNames);
        }
      },
      CallExpression(node) {
        const current = getCurrentComponentContext();
        if (!current || !current.isComponent) return;
        const hookName = getHookName(node);
        if (!hookName || !hookNames.has(hookName)) return;
        if (IGNORED_MEMO_HOOKS.has(hookName) && !userHookNames.has(hookName))
          return;
        if (node.arguments.length < 2) return;

        const depsArg = node.arguments[node.arguments.length - 1];
        if (depsArg.type !== AST_NODE_TYPES.ArrayExpression) return;

        const offendingElements: {
          node: TSESTree.Expression;
          name: string;
        }[] = [];

        for (const element of depsArg.elements) {
          if (!element || element.type === AST_NODE_TYPES.SpreadElement) {
            continue;
          }

          if (isWrappedWithAllowedHash(element, allowedHashes)) {
            continue;
          }

          const identifier = getIdentifierFromExpression(element);
          if (!identifier) {
            continue;
          }

          if (current.restNames.has(identifier.name)) {
            offendingElements.push({ node: element, name: identifier.name });
          }
        }

        if (offendingElements.length === 0) return;

        const offendingNames = Array.from(
          new Set(offendingElements.map(({ name }) => name)),
        );

        // The report is emitted even when suppressed: ESLint discards it, and
        // reporting keeps the user's disable directive "used" so that
        // `--report-unused-disable-directives` does not flag it.
        context.report({
          node: depsArg,
          messageId: 'wrapSpreadPropsWithStableHash',
          data: { names: offendingNames.join(', ') },
          fix(fixer) {
            // A suppressed report is dropped together with its fix. Producing
            // no fix — and leaving the import unscheduled — passes the import
            // to the first violation that survives. The check runs on the
            // reported node so it resolves the same location ESLint does.
            if (isReportSuppressed(depsArg)) {
              return null;
            }

            // Derive the emitted name from the file's imports rather than from
            // traversal state: `--fix` re-lints between passes, so an import a
            // previous pass landed must be reused, and an alias it introduced
            // must be honoured.
            const hashIdentifier =
              getStableHashLocalNames(sourceCode, hashImport)[0] ??
              hashImport.importName;

            // The fix writes a bare `hashIdentifier` call into the dependency
            // array and may add a top-level import for it. Another binding of
            // that name, visible from the array, makes both halves wrong: a
            // module-scope binding collides with the inserted import
            // (TS2440/TS2300), and a narrower shadow silently resolves the
            // emitted call to the wrong value with no TypeScript diagnostic at
            // all. Resolving through the scope chain of the reported node — the
            // exact position the call lands in — covers both, while a binding
            // that already is the desired import is the reuse path. Declining
            // leaves the report for the author to resolve deliberately.
            const existingBinding = ASTHelpers.findVariableInScope(
              ASTHelpers.getScope(context, depsArg),
              hashIdentifier,
            );
            if (
              existingBinding &&
              !bindsHashImport(existingBinding, hashImport)
            ) {
              return null;
            }

            const fixes: TSESLint.RuleFix[] = [];
            const seen = new Set<number>();
            for (const { node: targetNode } of offendingElements) {
              if (seen.has(targetNode.range[0])) continue;
              seen.add(targetNode.range[0]);
              const original = sourceCode.getText(targetNode);
              fixes.push(
                fixer.replaceText(targetNode, `${hashIdentifier}(${original})`),
              );
            }

            if (
              !isStableHashImported(sourceCode, hashImport) &&
              !importPlanned
            ) {
              const importText = `import { ${hashImport.importName} } from '${hashImport.source}';\n`;
              const program = sourceCode.ast;
              const firstImport = program.body.find(
                (n) => n.type === AST_NODE_TYPES.ImportDeclaration,
              );
              if (firstImport) {
                fixes.push(fixer.insertTextBefore(firstImport, importText));
              } else {
                fixes.push(fixer.insertTextBeforeRange([0, 0], importText));
              }
              importPlanned = true;
            }

            if (!hasExhaustiveDepsDisable(sourceCode, node, depsArg)) {
              const indent = getIndentBeforeNode(sourceCode, depsArg);
              const tokenBefore = sourceCode.getTokenBefore(depsArg, {
                includeComments: true,
              });
              const needsLeadingNewline =
                tokenBefore?.loc.end.line === depsArg.loc.start.line;
              const commentText = needsLeadingNewline
                ? `\n${indent}// eslint-disable-next-line react-hooks/exhaustive-deps\n${indent}`
                : `// eslint-disable-next-line react-hooks/exhaustive-deps\n${indent}`;
              fixes.push(fixer.insertTextBefore(depsArg, commentText));
            }

            return fixes;
          },
        });
      },
    };
  },
});
