import * as path from 'path';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'extractUtility';

type Options = [
  {
    minStatements?: number;
    minLines?: number;
    ignoreClosures?: boolean;
  },
];

const DEFAULT_MIN_STATEMENTS = 8;
const DEFAULT_MIN_LINES = 12;
const DEFAULT_IGNORE_CLOSURES = true;

/**
 * Collects all identifiers referenced in a node body (for closure detection).
 * Returns the set of identifier names referenced anywhere inside the node,
 * not counting parameter names or locally-declared names.
 */
function collectReferencedIdentifiers(node: TSESTree.Node): Set<string> {
  const refs = new Set<string>();
  const locals = new Set<string>();

  function walk(n: TSESTree.Node | null | undefined): void {
    if (!n) return;

    switch (n.type) {
      case AST_NODE_TYPES.Identifier:
        refs.add((n as TSESTree.Identifier).name);
        break;

      case AST_NODE_TYPES.FunctionDeclaration:
      case AST_NODE_TYPES.FunctionExpression:
      case AST_NODE_TYPES.ArrowFunctionExpression: {
        const fn = n as
          | TSESTree.FunctionDeclaration
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression;
        // Record parameter names as locals
        for (const param of fn.params) {
          collectPatternNames(param, locals);
        }
        walk(fn.body);
        break;
      }

      case AST_NODE_TYPES.VariableDeclarator: {
        const decl = n as TSESTree.VariableDeclarator;
        collectPatternNames(decl.id, locals);
        walk(decl.init);
        break;
      }

      default: {
        // Walk all child nodes
        for (const key of Object.keys(n)) {
          if (key === 'parent') continue;
          const child = (n as any)[key];
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                walk(item as TSESTree.Node);
              }
            }
          } else if (child && typeof child === 'object' && 'type' in child) {
            walk(child as TSESTree.Node);
          }
        }
      }
    }
  }

  walk(node);

  // Remove purely local names from the reference set
  for (const local of locals) {
    refs.delete(local);
  }

  return refs;
}

/**
 * Collects all binding names from a pattern into the given Set.
 */
function collectPatternNames(
  node: TSESTree.DestructuringPattern | TSESTree.Parameter | null | undefined,
  names: Set<string>,
): void {
  if (!node) return;

  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
      names.add((node as TSESTree.Identifier).name);
      break;

    case AST_NODE_TYPES.ArrayPattern:
      for (const el of (node as TSESTree.ArrayPattern).elements) {
        if (el) collectPatternNames(el as TSESTree.Parameter, names);
      }
      break;

    case AST_NODE_TYPES.ObjectPattern:
      for (const prop of (node as TSESTree.ObjectPattern).properties) {
        if (prop.type === AST_NODE_TYPES.RestElement) {
          collectPatternNames(
            (prop as TSESTree.RestElement).argument as TSESTree.Parameter,
            names,
          );
        } else {
          collectPatternNames(
            (prop as TSESTree.Property).value as TSESTree.Parameter,
            names,
          );
        }
      }
      break;

    case AST_NODE_TYPES.AssignmentPattern:
      collectPatternNames(
        (node as TSESTree.AssignmentPattern).left as TSESTree.Parameter,
        names,
      );
      break;

    case AST_NODE_TYPES.RestElement:
      collectPatternNames(
        (node as TSESTree.RestElement).argument as TSESTree.Parameter,
        names,
      );
      break;

    default:
      break;
  }
}

/**
 * Returns the body node (BlockStatement or expression) of a function.
 */
function getFunctionBody(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): TSESTree.BlockStatement | TSESTree.Expression | null {
  return fn.body ?? null;
}

/**
 * Counts statements inside a BlockStatement body (top level only).
 */
function countStatements(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): number {
  const body = getFunctionBody(fn);
  if (!body) return 0;
  if (body.type === AST_NODE_TYPES.BlockStatement) {
    return (body as TSESTree.BlockStatement).body.length;
  }
  // Arrow function with expression body — count as 1 statement
  return 1;
}

/**
 * Counts the number of source lines spanned by a function node.
 */
function countLines(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): number {
  if (!fn.loc) return 0;
  return fn.loc.end.line - fn.loc.start.line + 1;
}

/**
 * Returns the function expression node if the VariableDeclarator initializer
 * is (unwrapped) an arrow or function expression.
 */
function extractFunctionInit(
  init: TSESTree.Expression | null | undefined,
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null {
  if (!init) return null;
  let node: TSESTree.Expression | null = init;
  // Unwrap TS wrappers
  while (
    node &&
    (node.type === AST_NODE_TYPES.TSAsExpression ||
      node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      node.type === AST_NODE_TYPES.TSNonNullExpression ||
      node.type === AST_NODE_TYPES.TSTypeAssertion ||
      (node as any).type === 'ParenthesizedExpression')
  ) {
    node = (node as any).expression ?? null;
  }
  if (!node) return null;
  if (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  ) {
    return node as
      | TSESTree.ArrowFunctionExpression
      | TSESTree.FunctionExpression;
  }
  return null;
}

/**
 * Returns true if the function returns JSX (is a React component).
 * We check the body for any JSXElement or JSXFragment return.
 */
function functionReturnsJSX(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): boolean {
  return ASTHelpers.returnsJSX(fn);
}

/**
 * Returns true if the name matches the React hook naming convention.
 */
function isHookName(name: string): boolean {
  return /^use[A-Z]/.test(name);
}

/**
 * Extracts the basename (without extension) from a filename.
 * E.g. "modifyRoleMembers.f.ts" → "modifyRoleMembers"
 */
function fileBasename(filename: string): string {
  const base = path.basename(filename);
  // Strip all extensions (e.g. .f.ts, .test.ts)
  return base.replace(/(\.\w+)+$/, '');
}

/**
 * Returns true if the file should be exempt from this rule.
 * Exempt: test/spec files, __mocks__ directories, type-only files under types/**
 */
function isExemptFile(filename: string): boolean {
  if (!filename) return false;
  const normalized = filename.replace(/\\/g, '/');
  // Test and spec files
  if (/\.(test|spec)\.(tsx?|jsx?)$/.test(normalized)) return true;
  // Files inside __mocks__ directories
  if (/\/__mocks__\//.test(normalized)) return true;
  // Type files (functions/src/types/**)
  if (/\/types\//.test(normalized)) return true;
  return false;
}

export const preferUtilityFunctionOwnFile = createRule<Options, MessageIds>({
  name: 'prefer-utility-function-own-file',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce that sizable utility functions live in their own file rather than being co-located inside an entry-point or consumer file',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          minStatements: {
            type: 'number',
            minimum: 1,
            default: DEFAULT_MIN_STATEMENTS,
          },
          minLines: {
            type: 'number',
            minimum: 1,
            default: DEFAULT_MIN_LINES,
          },
          ignoreClosures: {
            type: 'boolean',
            default: DEFAULT_IGNORE_CLOSURES,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      extractUtility:
        '"{{name}}" is a sizable utility function co-located in a file whose primary purpose is something else. Move it to its own file (e.g. under util/) so it is discoverable and reusable.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const minStatements = options.minStatements ?? DEFAULT_MIN_STATEMENTS;
    const minLines = options.minLines ?? DEFAULT_MIN_LINES;
    const ignoreClosures = options.ignoreClosures ?? DEFAULT_IGNORE_CLOSURES;

    const filename = context.getFilename();

    // Exempt test/mock/type files entirely
    if (isExemptFile(filename)) return {};

    const basename = fileBasename(filename);

    // We do a two-pass approach:
    // Pass 1 (Program:exit): collect all top-level info then decide what to flag.
    // We track top-level functions and file-level export information.

    type FuncInfo = {
      node: TSESTree.Node;
      name: string;
      fn:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression;
      isDefaultExport: boolean;
      isNamedExport: boolean;
    };

    const topLevelFunctions: FuncInfo[] = [];
    let hasExportDefault = false;

    // Names that appear as the handler inside `export default someWrapper(name)`
    const wrappedDefaultHandlerNames = new Set<string>();

    // Names directly exported as default (export default myFunc style via ExportDefaultDeclaration referencing an identifier)
    const defaultExportedIdentifiers = new Set<string>();

    // Names exported via `export { foo, bar }` specifiers
    const specifierExportedNames = new Set<string>();

    return {
      // Collect export default declarations
      ExportDefaultDeclaration(node: TSESTree.ExportDefaultDeclaration) {
        hasExportDefault = true;

        const decl = node.declaration;

        // export default myFunc
        if (decl.type === AST_NODE_TYPES.Identifier) {
          defaultExportedIdentifiers.add((decl as TSESTree.Identifier).name);
        }

        // export default onCall(authenticatedOnly(myFunc))
        if (decl.type === AST_NODE_TYPES.CallExpression) {
          // walk the call expression tree for identifier references
          const findWrappedIds = (
            expr: TSESTree.Expression | TSESTree.SpreadElement,
          ): void => {
            let e: TSESTree.Node = expr;
            while (
              e &&
              (e.type === AST_NODE_TYPES.TSAsExpression ||
                e.type === AST_NODE_TYPES.TSSatisfiesExpression ||
                e.type === AST_NODE_TYPES.TSNonNullExpression ||
                e.type === AST_NODE_TYPES.TSTypeAssertion ||
                (e as any).type === 'ParenthesizedExpression')
            ) {
              e = (e as any).expression;
            }
            if (!e) return;
            if (e.type === AST_NODE_TYPES.Identifier) {
              wrappedDefaultHandlerNames.add((e as TSESTree.Identifier).name);
            }
            if (e.type === AST_NODE_TYPES.CallExpression) {
              for (const arg of (e as TSESTree.CallExpression).arguments) {
                findWrappedIds(arg as TSESTree.Expression);
              }
            }
          };
          findWrappedIds(decl as TSESTree.Expression);
        }
      },

      // Collect names exported via specifiers: `export { foo, bar }`
      ExportNamedDeclaration(node: TSESTree.ExportNamedDeclaration) {
        // Only handle specifier-style exports (not `export const foo = ...` which
        // is handled by VariableDeclaration with ExportNamedDeclaration parent)
        if (node.declaration) return;
        for (const specifier of node.specifiers) {
          if (specifier.local.type === AST_NODE_TYPES.Identifier) {
            specifierExportedNames.add(
              (specifier.local as TSESTree.Identifier).name,
            );
          }
        }
      },

      // Collect top-level FunctionDeclarations
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        // Only top-level: parent must be Program or ExportNamedDeclaration or ExportDefaultDeclaration
        const parent = node.parent;
        const isTopLevel =
          parent?.type === AST_NODE_TYPES.Program ||
          parent?.type === AST_NODE_TYPES.ExportNamedDeclaration ||
          parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration;

        if (!isTopLevel) return;
        if (!node.id) return;

        const name = node.id.name;
        const isNamedExport =
          parent?.type === AST_NODE_TYPES.ExportNamedDeclaration;
        const isDefaultExport =
          parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration;

        topLevelFunctions.push({
          node,
          name,
          fn: node,
          isDefaultExport,
          isNamedExport,
        });
      },

      // Collect top-level arrow/function expression VariableDeclarators
      VariableDeclaration(node: TSESTree.VariableDeclaration) {
        // Only top-level
        const parent = node.parent;
        const isTopLevel =
          parent?.type === AST_NODE_TYPES.Program ||
          parent?.type === AST_NODE_TYPES.ExportNamedDeclaration;

        if (!isTopLevel) return;

        const isNamedExport =
          parent?.type === AST_NODE_TYPES.ExportNamedDeclaration;

        for (const declarator of node.declarations) {
          if (declarator.id.type !== AST_NODE_TYPES.Identifier) continue;
          const name = (declarator.id as TSESTree.Identifier).name;
          const fn = extractFunctionInit(declarator.init);
          if (!fn) continue;

          topLevelFunctions.push({
            node: declarator,
            name,
            fn,
            isDefaultExport: false,
            isNamedExport,
          });
        }
      },

      'Program:exit'() {
        // Determine the file's primary export name (basename heuristic)
        // e.g. "modifyRoleMembers" in "modifyRoleMembers.f.ts"
        const primaryName = basename;

        // Reconcile isNamedExport for functions exported via specifiers
        // (e.g. `export { foo, bar }` when foo/bar were declared without export keyword)
        for (const info of topLevelFunctions) {
          if (!info.isNamedExport && specifierExportedNames.has(info.name)) {
            info.isNamedExport = true;
          }
        }

        // Determine if the file has a distinct primary export (co-location gate).
        // A file must have SOME other purpose for us to flag anything.
        // Indicators of a distinct primary purpose:
        // 1. Has `export default` (callable entry-point, page, etc.)
        // 2. Has a React component (PascalCase, returning JSX)
        // 3. Has another named exported util that is NOT the function being evaluated
        // We'll compute this lazily per-candidate below.

        // If the file has no export default AND only one top-level function, the
        // file's sole purpose IS that function — it's already in its own file.
        // Never flag in that case.
        const totalFunctions = topLevelFunctions.length;
        if (!hasExportDefault && totalFunctions <= 1) return;

        // For each candidate, determine whether to flag
        for (const info of topLevelFunctions) {
          const { node, name, fn, isDefaultExport } = info;

          // --- Exclusion: is a hook ---
          if (isHookName(name)) continue;

          // --- Exclusion: returns JSX (React component) ---
          if (functionReturnsJSX(fn)) continue;

          // --- Exclusion: is the default export directly ---
          if (isDefaultExport) continue;

          // --- Exclusion: name is referenced in export default (e.g. wrapped handler) ---
          if (
            wrappedDefaultHandlerNames.has(name) ||
            defaultExportedIdentifiers.has(name)
          )
            continue;

          // --- Exclusion: name matches file basename (primary export heuristic) ---
          if (name === primaryName) continue;

          // --- Exclusion: it IS a named exported util but name matches basename ---
          // (already covered above, but be explicit)

          // --- Size check: must be sizable ---
          const stmts = countStatements(fn);
          const lines = countLines(fn);
          const isSizable = stmts >= minStatements || lines >= minLines;
          if (!isSizable) continue;

          // --- ignoreClosures: skip if the function body references module-scoped identifiers not passed as params ---
          if (ignoreClosures) {
            const closesOverModuleScope = functionClosesOverModuleScope(
              fn,
              topLevelFunctions,
            );
            if (closesOverModuleScope) continue;
          }

          // --- Co-location gate: file must have a distinct primary export ---
          // The file has a distinct primary purpose if:
          // - It has export default (and it's not THIS function)
          // - Another top-level function returns JSX (a React component lives here)
          // - Another named exported function exists that is not this one
          const hasDistinctPrimary = determineHasDistinctPrimary(
            info,
            topLevelFunctions,
            hasExportDefault,
          );

          if (!hasDistinctPrimary) continue;

          context.report({
            node,
            messageId: 'extractUtility',
            data: { name },
          });
        }
      },
    };
  },
});

/**
 * Returns true if the function closes over module-scoped bindings
 * (identifiers defined at the top level of the module) that are NOT
 * passed as parameters, making it non-trivially extractable.
 *
 * We identify "module-scope" identifiers as names of other top-level
 * declarations in the file (functions, variables) that are NOT imported.
 * Imported names and standard globals are considered "extractable" (you'd
 * just re-import them).
 *
 * Strategy: collect referenced identifiers in the body, subtract param names,
 * then check if any remain that are names of other top-level declarations.
 */
function functionClosesOverModuleScope(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
  topLevelFunctions: Array<{ name: string }>,
): boolean {
  const body = getFunctionBody(fn);
  if (!body) return false;

  // Collect names that are parameters of this function
  const paramNames = new Set<string>();
  for (const param of fn.params) {
    collectPatternNames(param as TSESTree.Parameter, paramNames);
  }

  // Collect all identifiers referenced inside the function body
  const referencedIds = collectReferencedIdentifiers(body);

  // Remove params (they're passed in, fine)
  for (const param of paramNames) {
    referencedIds.delete(param);
  }

  // Get the set of top-level sibling function names
  const topLevelNames = new Set(topLevelFunctions.map((f) => f.name));

  // If ANY referenced identifier is a top-level sibling function name,
  // then this function closes over a module-scope binding.
  for (const ref of referencedIds) {
    if (topLevelNames.has(ref)) {
      return true;
    }
  }

  return false;
}

/**
 * Determines whether the file has a distinct primary purpose (co-location gate).
 * A file has a distinct primary purpose if (excluding the function under test):
 * - It has an `export default` declaration, OR
 * - Another top-level function returns JSX (a component lives here), OR
 * - Another top-level function is a named export (a different util lives here)
 */
function determineHasDistinctPrimary(
  candidate: {
    name: string;
    fn:
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression;
    isDefaultExport: boolean;
    isNamedExport: boolean;
  },
  allFunctions: Array<{
    name: string;
    fn:
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression;
    isDefaultExport: boolean;
    isNamedExport: boolean;
  }>,
  hasExportDefault: boolean,
): boolean {
  // If there's an export default in the file, that signals a distinct primary
  if (hasExportDefault) return true;

  // Check siblings for React components or other named exported utils
  for (const other of allFunctions) {
    if (other.name === candidate.name) continue;
    if (functionReturnsJSX(other.fn)) return true;
    if (other.isNamedExport || other.isDefaultExport) return true;
  }

  return false;
}
