/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { RuleContext } from '@typescript-eslint/utils/dist/ts-eslint';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import {
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

export type NodeWithParent = TSESTree.Node & { parent: NodeWithParent };

export type ComponentNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

const isComponentExplicitlyUnmemoized = (componentName: string) =>
  componentName.toLowerCase().includes('unmemoized');

// React's universal convention: only PascalCase-initial identifiers are
// treated as components. camelCase names are render-prop callbacks or plain
// helper functions that are invoked directly (e.g. MUI's renderCell(params)),
// NOT React components — wrapping them in memo() would break callers.
const startsWithUppercase = (name: string) => /^[A-Z]/.test(name);

function isFunction(
  node: TSESTree.Node,
): node is
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

function isHigherOrderFunctionReturningJSX(
  node: TSESTree.Node,
  context: Readonly<RuleContext<'requireMemo', []>>,
): boolean {
  if (isFunction(node)) {
    if (node.body && node.body.type === 'BlockStatement') {
      for (const statement of node.body.body) {
        if (statement.type === 'ReturnStatement' && statement.argument) {
          const returnsJSX = ASTHelpers.returnsJSX(statement.argument, context);
          const returnsFunction = isFunction(statement.argument);

          return returnsFunction && returnsJSX;
        }
      }
    } else if (node.body && isFunction(node.body)) {
      // Shorthand arrow HOC: (Comp) => (props) => <Comp {...props} />
      // Here node.body is the inner function; check if it returns JSX.
      return ASTHelpers.returnsJSX(node.body, context);
    }
  }
  return false;
}

const isUnmemoizedArrowFunction = (parentNode: TSESTree.Node) => {
  return (
    parentNode.type === 'VariableDeclarator' &&
    parentNode.id.type === 'Identifier' &&
    startsWithUppercase(parentNode.id.name) &&
    !isComponentExplicitlyUnmemoized(parentNode.id.name)
  );
};

/**
 * The nearest function whose body lexically contains `node`. Climbing from the
 * parent keeps a function from being treated as its own enclosing function.
 */
function enclosingFunctionOf(node: TSESTree.Node): ComponentNode | null {
  let current = node.parent as TSESTree.Node | undefined;
  while (current) {
    if (isFunction(current)) {
      return current;
    }
    current = current.parent as TSESTree.Node | undefined;
  }
  return null;
}

/**
 * Return arguments belonging to `fn` itself. Descent stops at a nested
 * function, whose returns belong to it rather than to `fn`.
 */
function ownReturnArguments(fn: ComponentNode): TSESTree.Node[] {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [fn.body];
  }

  const args: TSESTree.Node[] = [];
  const visit = (node: TSESTree.Node) => {
    if (isFunction(node)) {
      return;
    }
    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      if (node.argument) {
        args.push(node.argument);
      }
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (ASTHelpers.isNode(item)) {
            visit(item);
          }
        }
      } else if (ASTHelpers.isNode(value)) {
        visit(value);
      }
    }
  };

  fn.body.body.forEach(visit);
  return args;
}

/** Strips type-level wrappers so `return Row as ComponentType<P>` still reads as `Row`. */
function unwrapValue(node: TSESTree.Node): TSESTree.Node {
  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    return unwrapValue(node.expression);
  }
  return node;
}

/**
 * Whether `enclosing` is an HOC factory that hands `componentName` straight back
 * to its callers. Such a component reaches callers as-is, so wrapping it in
 * memo() at its declaration is the correct remedy — exactly as it is at module
 * scope. A `memo(Row)` / `forwardRef(Row)` return is not a bare hand-back: the
 * component is already memoized and a second wrapper would be redundant.
 */
function handsComponentToCallers(
  enclosing: ComponentNode,
  componentName: string,
  context: Readonly<RuleContext<'requireMemo', []>>,
): boolean {
  // A function that renders JSX is a render body, not a factory. Components
  // declared in one are recreated on every render, which memo() cannot fix;
  // `memo-nested-react-components` owns that shape and says so in its message.
  if (ASTHelpers.returnsJSX(enclosing.body, context)) {
    return false;
  }

  return ownReturnArguments(enclosing).some((argument) => {
    const value = unwrapValue(argument);
    return (
      value.type === AST_NODE_TYPES.Identifier && value.name === componentName
    );
  });
}

/**
 * Whether wrapping the declaration in memo() where it stands is the right fix.
 *
 * This is the rule's real question, and it is about the binding's lifetime, not
 * about which node happens to be the declaration's parent: a component whose
 * binding outlives a render (module scope — including a block, a namespace and
 * `export default`) is memoizable in place, and so is one an HOC factory returns
 * unwrapped. A component created inside a render body is not; it gets a fresh
 * identity on every render and `memo-nested-react-components` owns it.
 */
function isMemoizableInPlace(
  node: TSESTree.FunctionDeclaration,
  context: Readonly<RuleContext<'requireMemo', []>>,
): boolean {
  const enclosing = enclosingFunctionOf(node);
  if (!enclosing) {
    return true;
  }
  return handsComponentToCallers(enclosing, node.id?.name ?? '', context);
}

const isUnmemoizedFunctionComponent = (
  node: TSESTree.Node,
  context: Readonly<RuleContext<'requireMemo', []>>,
) => {
  return (
    node.type === 'FunctionDeclaration' &&
    !!node.id &&
    startsWithUppercase(node.id.name) &&
    !isComponentExplicitlyUnmemoized(node.id.name) &&
    isMemoizableInPlace(node, context)
  );
};

/**
 * Statement positions where the rewritten `const X = memo(...)` is legal. A
 * function declaration is also grammatical as the lone body of an `if` or a
 * labelled statement, where a lexical declaration is not, so the report there
 * stands without an edit.
 */
const CONST_HOSTING_PARENTS = new Set<string>([
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.ExportNamedDeclaration,
  AST_NODE_TYPES.ExportDefaultDeclaration,
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.StaticBlock,
  AST_NODE_TYPES.SwitchCase,
  AST_NODE_TYPES.TSModuleBlock,
]);

const canHostConstDeclaration = (parentNode: TSESTree.Node) =>
  CONST_HOSTING_PARENTS.has(parentNode.type);

const MEMO_NAME = 'memo';

function isMemoImport(importPath: string): boolean {
  // Match both absolute and relative paths ending with util/memo
  return /(?:^|\/|\\)util\/memo$/.test(importPath);
}

/**
 * Value `util/memo` import declarations in source order. A type-only
 * declaration (`import type { MemoOptions } from '../util/memo'`) is excluded
 * because a specifier appended to one erases at compile time, leaving the
 * emitted `memo(...)` call unbound at runtime.
 */
function memoValueImports(
  program: TSESTree.Program,
): TSESTree.ImportDeclaration[] {
  return program.body.filter(
    (statement): statement is TSESTree.ImportDeclaration =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      statement.importKind !== 'type' &&
      isMemoImport(statement.source.value),
  );
}

/**
 * A named specifier that binds `memo` under its own name — the only shape that
 * makes the emitted `memo(...)` call reach the helper. An alias in either
 * direction (`memo as m`, `createMemo as memo`) or a type-only specifier binds
 * something else, or nothing at all, at runtime.
 */
function isMemoSpecifier(
  specifier: TSESTree.Node,
): specifier is TSESTree.ImportSpecifier {
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.name === MEMO_NAME &&
    specifier.local.name === MEMO_NAME
  );
}

/**
 * Import state is read off `Program.body` at fix time rather than from a
 * traversal flag: a component that precedes the import declaration in source
 * order is fixed before an `ImportDeclaration` visitor would have run, so a
 * flag would call the import missing and insert a duplicate.
 */
function importsMemo(program: TSESTree.Program): boolean {
  return memoValueImports(program).some((declaration) =>
    declaration.specifiers.some(isMemoSpecifier),
  );
}

/**
 * Whether every declaration of a visible `memo` binding is the helper import.
 * A const/let/function/class, a parameter, a namespace or default import, an
 * alias, or a named import from another module all mean the emitted `memo(...)`
 * call would resolve somewhere other than the helper.
 */
function bindsMemoHelper(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (!isMemoSpecifier(specifier)) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        declaration.importKind !== 'type' &&
        isMemoImport(declaration.source.value)
      );
    })
  );
}

/**
 * Extends an existing value `util/memo` import with a `memo` specifier instead
 * of adding a second declaration. A namespace-only or side-effect-only
 * declaration has nowhere to put a named specifier, so those fall through to a
 * separate declaration (null).
 */
function buildImportExtensionFix(
  fixer: TSESLint.RuleFixer,
  program: TSESTree.Program,
): TSESLint.RuleFix | null {
  for (const declaration of memoValueImports(program)) {
    const named = declaration.specifiers.filter(
      (specifier): specifier is TSESTree.ImportSpecifier =>
        specifier.type === AST_NODE_TYPES.ImportSpecifier,
    );
    if (named.length > 0) {
      return fixer.insertTextAfter(named[named.length - 1], `, ${MEMO_NAME}`);
    }
    const defaultSpecifier = declaration.specifiers.find(
      (specifier) => specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier,
    );
    if (defaultSpecifier) {
      return fixer.insertTextAfter(defaultSpecifier, `, { ${MEMO_NAME} }`);
    }
  }
  return null;
}

function checkFunction(
  context: Readonly<RuleContext<'requireMemo', []>>,
  node: ComponentNode & NodeWithParent,
) {
  const fileName = context.getFilename();
  if (!fileName.endsWith('.tsx')) {
    return;
  }
  if (isHigherOrderFunctionReturningJSX(node, context)) {
    return;
  }
  const parentNode = node.parent;
  if (node.parent.type === 'CallExpression') {
    return;
  }

  if (
    ASTHelpers.returnsJSX(node.body, context) &&
    ASTHelpers.hasParameters(node)
  ) {
    const isDeclarationComponent = isUnmemoizedFunctionComponent(node, context);
    const isArrowComponent = isUnmemoizedArrowFunction(parentNode);
    if (isDeclarationComponent || isArrowComponent) {
      const componentName =
        (node.type === 'FunctionDeclaration' && node.id?.name) ||
        (parentNode.type === 'VariableDeclarator' &&
          parentNode.id.type === 'Identifier' &&
          parentNode.id.name) ||
        'component';

      context.report({
        node,
        messageId: 'requireMemo',
        data: {
          name: componentName,
        },
        fix:
          isDeclarationComponent && canHostConstDeclaration(parentNode)
            ? function fix(fixer) {
                if (node.async || (node as any).generator) {
                  return null;
                }
                const sourceCode = context.sourceCode;
                const program = sourceCode.ast;

                // Resolve `memo` through the scope chain at the fixed node. A
                // binding that is not the helper import breaks the edit two
                // ways: the inserted import collides with the existing
                // declaration (TS2440, or TS2300 when that declaration is
                // itself an import), and a binding visible at the fix site
                // captures the emitted call with no compile error at all.
                // Declining leaves the report standing so the author resolves
                // the clash deliberately. `React.memo` is a member access on
                // the default import rather than a `memo` binding, so it never
                // reaches this path.
                const existingMemo = ASTHelpers.findVariableInScope(
                  ASTHelpers.getScope(context, node),
                  MEMO_NAME,
                );
                if (existingMemo && !bindsMemoHelper(existingMemo)) {
                  return null;
                }

                let importFix: TSESLint.RuleFix | null = null;

                if (!importsMemo(program)) {
                  importFix = buildImportExtensionFix(fixer, program);

                  if (!importFix) {
                    // Calculate relative path based on current file location
                    const currentFilePath = context.getFilename();
                    const importPath = calculateImportPath(currentFilePath);

                    const importStatement = `import { memo } from '${importPath}';`;

                    const firstImport = program.body.find(
                      (statement) =>
                        statement.type === AST_NODE_TYPES.ImportDeclaration,
                    );

                    // An existing import hosts the helper import directly after
                    // it, keeping the module's imports contiguous. With none to
                    // follow, the shared anchor keeps the file's prologue in
                    // place: a `'use client'` directive only counts as one while
                    // it is the first statement, and a `#!` shebang only parses
                    // at character 0.
                    importFix = firstImport
                      ? fixer.insertTextAfter(
                          firstImport,
                          `\n${importStatement}`,
                        )
                      : insertAtImportAnchor(
                          sourceCode,
                          fixer,
                          importInsertionAnchor(sourceCode),
                          `${importStatement}\n`,
                        );
                  }
                }

                const functionKeywordRange: Readonly<[number, number]> = [
                  node.range[0],
                  node.range[0] + 'function'.length,
                ];
                const functionKeywordReplacement = `const ${
                  node.id!.name
                } = memo(`;

                // Step 3: Rename function
                const functionNameReplacement = `function ${
                  node.id!.name
                }Unmemoized`;

                // `export default const X = memo(...)` is a syntax error, so a
                // default-exported declaration becomes a memoized const plus a
                // trailing `export default X;`. The local binding is preserved
                // because other statements in the module may reference it.
                const defaultExport =
                  parentNode.type === AST_NODE_TYPES.ExportDefaultDeclaration
                    ? parentNode
                    : null;

                const fixes = [
                  fixer.replaceTextRange(
                    functionKeywordRange,
                    functionKeywordReplacement,
                  ),
                  fixer.insertTextAfterRange(
                    [node.range[1], node.range[1]],
                    defaultExport
                      ? `);\nexport default ${node.id!.name};`
                      : ');',
                  ),
                  fixer.replaceTextRange(
                    [node.id!.range[0] - 1, node.id!.range[1]],
                    functionNameReplacement,
                  ),
                ];

                if (defaultExport) {
                  fixes.push(
                    fixer.removeRange([defaultExport.range[0], node.range[0]]),
                  );
                }

                if (importFix) {
                  fixes.push(importFix);
                }

                return fixes;
              }
            : undefined,
      });
    }
  }
}

function calculateImportPath(currentFilePath: string): string {
  // Default to absolute path if we can't calculate relative path
  if (!currentFilePath) return 'src/util/memo';

  // Split the current file path into parts and normalize
  const parts = currentFilePath.split(/[\\/]/); // Handle both Unix and Windows paths
  const srcIndex = parts.indexOf('src');

  if (srcIndex === -1) {
    // If we're not in a src directory, use absolute path
    return 'src/util/memo';
  }

  // Calculate relative path based on current file depth from src
  // Subtract 1 from depth to exclude the filename itself
  const depth = parts.length - (srcIndex + 1) - 1;
  return depth > 0 ? '../'.repeat(depth) + 'util/memo' : './util/memo';
}

export const requireMemo = createRule<[], 'requireMemo'>({
  name: 'require-memo',
  create: (context) => ({
    ArrowFunctionExpression(node) {
      checkFunction(context, node as any);
    },
    FunctionDeclaration(node) {
      checkFunction(context, node as any);
    },
    FunctionExpression(node) {
      checkFunction(context, node as any);
    },
  }),
  meta: {
    type: 'problem',
    docs: {
      description: 'React components must be memoized',
      recommended: 'error',
    },
    messages: {
      requireMemo:
        'Component "{{name}}" renders JSX with props but is not wrapped in memo(). ' +
        'Without memo the component function is recreated on every parent render, breaking referential equality and causing avoidable child re-renders. ' +
        'Wrap the component with memo from util/memo so callers receive a stable reference; rename to "{{name}}Unmemoized" if it must stay un-memoized.',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
});
