import path from 'path';
import {
  AST_NODE_TYPES,
  ASTUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferCloneDeep';

const CLONE_DEEP_NAME = 'cloneDeep';
const CLONE_DEEP_MODULE = 'functions/src/util/cloneDeep';
const CLONE_DEEP_TARGET = 'src/util/cloneDeep';
const FUNCTIONS_TIER_SEGMENT = '/functions/src/';
const FUNCTIONS_ROOT_SEGMENT = '/functions/';
const INDENT_STEP = '  ';

const toPosixPath = (filePath: string) => filePath.replace(/\\/g, '/');

const ensureRelativeSpecifier = (specifier: string) =>
  specifier.startsWith('.') ? specifier : `./${specifier}`;

const isWindowsDrivePath = (filePath: string) =>
  /^[A-Za-z]:[\\/]/.test(filePath);

const isValidRelativePath = (relativePath: string) =>
  relativePath !== '' &&
  !path.isAbsolute(relativePath) &&
  !isWindowsDrivePath(relativePath);

/**
 * The helper lives in one place but the two TypeScript tiers reach it
 * differently: the root tsconfig maps `functions/*` through `paths`, so files
 * outside `functions/` resolve the bare specifier, while `functions/tsconfig.json`
 * is rooted at `functions/` and declares no `paths`, leaving backend files able
 * to reach a sibling util only by relative path. A single hardcoded specifier
 * therefore emits an unresolvable import for every backend fix (#1389).
 *
 * Returns null when no correct specifier exists, which makes the caller decline
 * the fix rather than write an import that cannot resolve.
 */
function buildCloneDeepSpecifier(
  sourceFilePath: string,
  cwd: string,
): string | null {
  const absoluteFilename = toPosixPath(
    path.isAbsolute(sourceFilePath)
      ? sourceFilePath
      : path.join(cwd, sourceFilePath),
  );

  const tierIndex = absoluteFilename.indexOf(FUNCTIONS_TIER_SEGMENT);
  if (tierIndex === -1) {
    return CLONE_DEEP_MODULE;
  }

  const functionsRoot = absoluteFilename.slice(
    0,
    tierIndex + FUNCTIONS_ROOT_SEGMENT.length,
  );
  const targetPath = path.join(functionsRoot, CLONE_DEEP_TARGET);
  const relativePath = path.relative(
    path.dirname(absoluteFilename),
    targetPath,
  );

  if (!isValidRelativePath(relativePath)) {
    return null;
  }

  return ensureRelativeSpecifier(toPosixPath(relativePath));
}

/**
 * Only BluMint's own `cloneDeep` accepts an overrides argument, so an existing
 * binding coming from anywhere else (notably `lodash`) must not be reused by the
 * fix. Relative/aliased paths are accepted because the helper is imported by
 * path, never as a package.
 */
function isCloneDeepModule(source: string): boolean {
  if (source === CLONE_DEEP_MODULE) {
    return true;
  }
  if (!/(^|\/)cloneDeep$/.test(source)) {
    return false;
  }
  return (
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('~') ||
    source.startsWith('@/') ||
    source.endsWith('util/cloneDeep')
  );
}

export const preferCloneDeep = createRule<[], MessageIds>({
  name: 'prefer-clone-deep',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer using cloneDeep over nested spread copying',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferCloneDeep:
        'Nested spread copies only clone one level, so inner objects still point at the original and later mutations leak back. Use cloneDeep from functions/src/util/cloneDeep.ts and pass overrides as the second argument so the base object is deeply cloned before applying updates.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track processed nodes to avoid duplicate reports
    const processedNodes = new Set<TSESTree.Node>();

    const sourceCode = context.sourceCode;

    const cwd =
      typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();
    const cloneDeepSpecifier = buildCloneDeepSpecifier(
      context.getFilename(),
      cwd,
    );

    function normalizedTextOf(node: TSESTree.Node): string {
      return sourceCode.getText(node).replace(/\s+/g, '');
    }

    /**
     * `...(base.a ?? {})`, `...(base?.a)` and `...base.a!` are defensive
     * spellings of `...base.a`; unwrapping them lets the mirror check below
     * recognize the underlying member path.
     */
    function unwrapSpreadArgument(node: TSESTree.Node): TSESTree.Node {
      if (node.type === AST_NODE_TYPES.ChainExpression) {
        return unwrapSpreadArgument(node.expression);
      }
      if (node.type === AST_NODE_TYPES.TSNonNullExpression) {
        return unwrapSpreadArgument(node.expression);
      }
      if (
        node.type === AST_NODE_TYPES.LogicalExpression &&
        (node.operator === '??' || node.operator === '||') &&
        node.right.type === AST_NODE_TYPES.ObjectExpression &&
        node.right.properties.length === 0
      ) {
        return unwrapSpreadArgument(node.left);
      }
      return node;
    }

    /**
     * Canonical, whitespace-insensitive spelling of a member path so that a
     * nested spread can be compared against the path cloneDeep already copies.
     */
    function accessPathOf(node: TSESTree.Node): string {
      const unwrapped = unwrapSpreadArgument(node);
      if (unwrapped.type === AST_NODE_TYPES.MemberExpression) {
        const objectPath = accessPathOf(unwrapped.object);
        if (unwrapped.computed) {
          return `${objectPath}[${normalizedTextOf(unwrapped.property)}]`;
        }
        if (unwrapped.property.type === AST_NODE_TYPES.Identifier) {
          return `${objectPath}.${unwrapped.property.name}`;
        }
        return `${objectPath}.${normalizedTextOf(unwrapped.property)}`;
      }
      return normalizedTextOf(unwrapped);
    }

    const partialDeepCopyCache = new WeakMap<
      TSESTree.ObjectExpression,
      boolean
    >();

    /**
     * The hazard this rule describes is a hand-written PARTIAL deep copy: a
     * literal that spreads a base AND separately spreads one of that same
     * base's sub-paths, as in `{ ...base, a: { ...base.a, x: 1 } }`. Only the
     * sub-objects spelled out that way get their own copy; every OTHER
     * sub-object of `base` keeps aliasing the original, so a later mutation
     * leaks back.
     *
     * Merging unrelated sources copies nothing twice and is safe, which is why
     * shapes such as `{ ...a, nested: { ...b } }`, MUI `sx` style maps and
     * static config maps must not be flagged (#1371). A spread of the exact
     * same path (`{ ...a, x: { ...a } }`) is deliberately excluded as well: it
     * is a redundant copy rather than a partial one, and this repo prefers
     * false negatives over false positives.
     */
    function isPartialDeepCopy(node: TSESTree.ObjectExpression): boolean {
      const cached = partialDeepCopyCache.get(node);
      if (cached !== undefined) {
        return cached;
      }

      let hasFunction = false;
      let hasSymbol = false;
      const basePaths = new Set<string>();
      const nestedPaths: string[] = [];

      function visit(current: TSESTree.Node, depth = 0): void {
        if (current.type === AST_NODE_TYPES.SpreadElement) {
          const path = accessPathOf(current.argument);
          if (depth === 0) {
            basePaths.add(path);
          } else {
            nestedPaths.push(path);
          }
        } else if (
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          hasFunction = true;
        } else if (
          // Check for Symbol usage in computed properties
          (current.type === AST_NODE_TYPES.Property &&
            current.computed &&
            current.key.type === AST_NODE_TYPES.Identifier &&
            current.key.name === 'Symbol') ||
          // Check for direct Symbol constructor calls
          (current.type === AST_NODE_TYPES.Property &&
            current.computed &&
            current.key.type === AST_NODE_TYPES.CallExpression &&
            current.key.callee.type === AST_NODE_TYPES.Identifier &&
            current.key.callee.name === 'Symbol')
        ) {
          hasSymbol = true;
        }

        // Visit child nodes without traversing parent references. Depth tracks
        // object-nesting level: an object's OWN direct properties stay at the
        // object's depth, and only descending into a property's value (a
        // genuinely nested child) increments it. This keeps the literal's own
        // `...spread` at depth 0, where it names a base rather than a
        // hand-copied sub-path.
        if (current.type === AST_NODE_TYPES.ObjectExpression) {
          current.properties.forEach((prop) => visit(prop, depth));
        } else if (current.type === AST_NODE_TYPES.Property) {
          visit(current.value, depth + 1);
        } else if (current.type === AST_NODE_TYPES.SpreadElement) {
          visit(current.argument, depth);
        }
      }

      visit(node);

      // cloneDeep cannot faithfully reproduce functions or symbol keys, so
      // their presence suppresses the report regardless of the copy shape.
      const result =
        !hasFunction &&
        !hasSymbol &&
        nestedPaths.some((nested) =>
          // The separators guard against a sibling whose name merely starts
          // with a base's name (`abc.x` is not a sub-path of `ab`).
          [...basePaths].some(
            (base) =>
              nested.startsWith(`${base}.`) || nested.startsWith(`${base}[`),
          ),
        );

      partialDeepCopyCache.set(node, result);
      return result;
    }

    /**
     * A literal that merely wraps a partial deep copy (the #365 membership
     * shape) is still the site the report belongs on, so the predicate reaches
     * through property values into descendant literals.
     */
    function containsPartialDeepCopy(node: TSESTree.ObjectExpression): boolean {
      if (isPartialDeepCopy(node)) {
        return true;
      }
      return node.properties.some(
        (prop) =>
          prop.type === AST_NODE_TYPES.Property &&
          prop.value.type === AST_NODE_TYPES.ObjectExpression &&
          containsPartialDeepCopy(prop.value),
      );
    }

    function accessorForKey(prop: TSESTree.Property): string | null {
      if (prop.computed) {
        return `[${normalizedTextOf(prop.key)}]`;
      }
      if (prop.key.type === AST_NODE_TYPES.Identifier) {
        return `.${prop.key.name}`;
      }
      if (prop.key.type === AST_NODE_TYPES.Literal) {
        return `[${normalizedTextOf(prop.key)}]`;
      }
      return null;
    }

    function keyTextOf(prop: TSESTree.Property): string {
      return prop.computed
        ? `[${sourceCode.getText(prop.key)}]`
        : sourceCode.getText(prop.key);
    }

    function indentOf(node: TSESTree.Node): string {
      const text = sourceCode.getText();
      const lineStart = text.lastIndexOf('\n', node.range[0] - 1) + 1;
      const prefix = text.slice(lineStart, node.range[0]);
      return /^[ \t]*/.exec(prefix)?.[0] ?? '';
    }

    function startsWithSpread(node: TSESTree.ObjectExpression): boolean {
      return node.properties[0]?.type === AST_NODE_TYPES.SpreadElement;
    }

    /**
     * `SourceCode#getScope` supersedes the deprecated `context.getScope`; the
     * fallback keeps the rule working on ESLint versions that predate it.
     */
    function scopeOf(node: TSESTree.Node): TSESLint.Scope.Scope {
      const scoped = sourceCode as TSESLint.SourceCode & {
        getScope?: (node: TSESTree.Node) => TSESLint.Scope.Scope;
      };
      return typeof scoped.getScope === 'function'
        ? scoped.getScope(node)
        : context.getScope();
    }

    /**
     * Rebuilds the properties of one object as cloneDeep overrides. Returns null
     * whenever a property cannot be reproduced without changing runtime
     * behavior, which makes the caller decline the fix instead of emitting code
     * that silently drops data (#1364).
     */
    function buildOverrideEntries(
      properties: TSESTree.ObjectLiteralElement[],
      basePath: string,
      indent: string,
    ): string | null {
      const entries: string[] = [];

      for (const prop of properties) {
        // Any spread other than a leading copy of the path cloneDeep already
        // clones would have to be dropped, deleting whatever it contributed.
        if (prop.type !== AST_NODE_TYPES.Property) {
          return null;
        }
        // Getters, setters and shorthand methods degrade into plain data
        // properties when reprinted as overrides.
        if (prop.kind !== 'init' || prop.method) {
          return null;
        }

        let valueText: string;
        if (prop.value.type === AST_NODE_TYPES.ObjectExpression) {
          const accessor = accessorForKey(prop);
          if (accessor === null) {
            return null;
          }
          const nested = buildOverrideObject(
            prop.value,
            `${basePath}${accessor}`,
            `${indent}${INDENT_STEP}`,
          );
          if (nested === null) {
            return null;
          }
          valueText = nested;
        } else {
          // Arrays, calls, conditionals and primitives are copied verbatim, so
          // whatever they contain survives the fix untouched.
          valueText = sourceCode.getText(prop.value);
        }

        entries.push(`${indent}${keyTextOf(prop)}: ${valueText}`);
      }

      return entries.join(',\n');
    }

    /**
     * `indent` is the indentation of the rebuilt object's entries; its closing
     * brace lines up one step to the left.
     */
    function buildOverrideObject(
      node: TSESTree.ObjectExpression,
      basePath: string,
      indent: string,
    ): string | null {
      let properties: TSESTree.ObjectLiteralElement[] = [...node.properties];
      const [first] = properties;

      if (first && first.type === AST_NODE_TYPES.SpreadElement) {
        // A leading spread of this exact path is redundant: cloneDeep already
        // copies it from the base. Any other spread carries data that the
        // overrides object cannot express.
        if (accessPathOf(first.argument) !== basePath) {
          return null;
        }
        properties = properties.slice(1);
      }

      const body = buildOverrideEntries(properties, basePath, indent);
      if (body === null) {
        return null;
      }
      if (body === '') {
        return '{}';
      }
      const closingIndent = indent.slice(0, indent.length - INDENT_STEP.length);
      return `{\n${body}\n${closingIndent}}`;
    }

    function buildCloneDeepCall(
      node: TSESTree.ObjectExpression,
    ): string | null {
      const [first, ...rest] = node.properties;
      if (!first || first.type !== AST_NODE_TYPES.SpreadElement) {
        return null;
      }

      const baseText = sourceCode.getText(first.argument);
      const basePath = accessPathOf(first.argument);
      const baseIndent = indentOf(node);
      const body = buildOverrideEntries(
        rest,
        basePath,
        `${baseIndent}${INDENT_STEP}`,
      );
      if (body === null) {
        return null;
      }

      const overrides = body === '' ? '{}' : `{\n${body}\n${baseIndent}}`;
      return `cloneDeep(${baseText}, ${overrides} as const)`;
    }

    /**
     * When the reported object has no spread of its own (the #365 membership
     * shape), the object that actually shallow-copies a base lives one or more
     * levels down; rewriting only those children leaves the rest of the literal
     * untouched.
     */
    function collectCloneTargets(
      node: TSESTree.ObjectExpression,
    ): TSESTree.ObjectExpression[] {
      const targets: TSESTree.ObjectExpression[] = [];

      const visit = (current: TSESTree.ObjectExpression): void => {
        if (
          current !== node &&
          startsWithSpread(current) &&
          isPartialDeepCopy(current)
        ) {
          targets.push(current);
          return;
        }
        for (const prop of current.properties) {
          if (
            prop.type === AST_NODE_TYPES.Property &&
            prop.value.type === AST_NODE_TYPES.ObjectExpression
          ) {
            visit(prop.value);
          }
        }
      };

      visit(node);
      return targets;
    }

    /**
     * Returns the fixes required for `cloneDeep` to resolve, an empty list when
     * it already does, or null when a conflicting binding of that name exists —
     * shadowing it would silently call something else — or when no import
     * specifier that resolves from this file can be derived.
     */
    function buildImportFixes(
      fixer: TSESLint.RuleFixer,
      scope: TSESLint.Scope.Scope,
    ): TSESLint.RuleFix[] | null {
      const existing = ASTUtils.findVariable(scope, CLONE_DEEP_NAME);
      if (existing) {
        const [definition] = existing.defs;
        if (!definition) {
          return null;
        }
        const definitionNode = definition.node;
        if (
          definitionNode.type !== AST_NODE_TYPES.ImportSpecifier &&
          definitionNode.type !== AST_NODE_TYPES.ImportDefaultSpecifier
        ) {
          return null;
        }
        if (
          definitionNode.type === AST_NODE_TYPES.ImportSpecifier &&
          definitionNode.importKind === 'type'
        ) {
          return null;
        }
        const declaration = definitionNode.parent;
        if (
          !declaration ||
          declaration.type !== AST_NODE_TYPES.ImportDeclaration ||
          declaration.importKind === 'type' ||
          !isCloneDeepModule(String(declaration.source.value))
        ) {
          return null;
        }
        return [];
      }

      const importDeclarations = sourceCode.ast.body.filter(
        (statement): statement is TSESTree.ImportDeclaration =>
          statement.type === AST_NODE_TYPES.ImportDeclaration,
      );

      const reusable = importDeclarations.find(
        (declaration) =>
          declaration.importKind !== 'type' &&
          isCloneDeepModule(String(declaration.source.value)) &&
          declaration.specifiers.some(
            (specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier,
          ),
      );
      if (reusable) {
        const namedSpecifiers = reusable.specifiers.filter(
          (specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier,
        );
        const lastSpecifier = namedSpecifiers[namedSpecifiers.length - 1];
        return [fixer.insertTextAfter(lastSpecifier, `, ${CLONE_DEEP_NAME}`)];
      }

      // Reusing an existing import needs no specifier of its own, so only a
      // freshly written import depends on one being derivable.
      if (cloneDeepSpecifier === null) {
        return null;
      }

      const importText = `import { ${CLONE_DEEP_NAME} } from '${cloneDeepSpecifier}';\n`;
      const [firstImport] = importDeclarations;
      if (firstImport) {
        return [fixer.insertTextBefore(firstImport, importText)];
      }
      return [fixer.insertTextBeforeRange([0, 0], importText)];
    }

    // Find the outermost object expression that needs cloneDeep
    function findOutermostPartialDeepCopy(
      node: TSESTree.ObjectExpression,
    ): TSESTree.ObjectExpression {
      let current: TSESTree.Node | undefined = node.parent;
      let result: TSESTree.ObjectExpression = node;

      // Walk up the tree to find the outermost object expression
      while (current) {
        if (
          current.type === AST_NODE_TYPES.Property &&
          current.parent &&
          current.parent.type === AST_NODE_TYPES.ObjectExpression
        ) {
          // Reporting on the enclosing literal keeps sibling copies under a
          // single error, so one fix pass rewrites them all together.
          if (containsPartialDeepCopy(current.parent)) {
            result = current.parent;
          }
        }
        current = current.parent;
      }

      return result;
    }

    return {
      ObjectExpression(node) {
        // Skip if we've already processed this node
        if (processedNodes.has(node)) {
          return;
        }

        if (containsPartialDeepCopy(node)) {
          // Find the outermost object that should use cloneDeep
          const outermostNode = findOutermostPartialDeepCopy(node);

          // Mark all nested object expressions as processed
          const markProcessed = (n: TSESTree.Node): void => {
            if (n.type === AST_NODE_TYPES.ObjectExpression) {
              processedNodes.add(n);
              n.properties.forEach((prop) => {
                if (prop.type === AST_NODE_TYPES.Property) {
                  markProcessed(prop.value);
                } else if (prop.type === AST_NODE_TYPES.SpreadElement) {
                  // Also mark spread elements to avoid processing them again
                  if (prop.argument.type === AST_NODE_TYPES.ObjectExpression) {
                    markProcessed(prop.argument);
                  }
                }
              });
            }
          };

          markProcessed(outermostNode);

          // Only report on the outermost node
          if (outermostNode === node) {
            const scope = scopeOf(node);

            context.report({
              node,
              messageId: 'preferCloneDeep',
              fix(fixer) {
                const rewrites: TSESLint.RuleFix[] = [];
                const targets = startsWithSpread(node)
                  ? [node]
                  : collectCloneTargets(node);

                if (targets.length === 0) {
                  return null;
                }

                for (const target of targets) {
                  const call = buildCloneDeepCall(target);
                  if (call === null) {
                    return null;
                  }
                  rewrites.push(fixer.replaceText(target, call));
                }

                const importFixes = buildImportFixes(fixer, scope);
                if (importFixes === null) {
                  return null;
                }

                return [...importFixes, ...rewrites];
              },
            });
          }
        }
      },
    };
  },
});
