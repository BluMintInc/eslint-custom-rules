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
const INDENT_STEP = '  ';

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

    function hasNestedSpread(node: TSESTree.ObjectExpression): boolean {
      let hasFunction = false;
      let hasSymbol = false;
      let hasSpread = false;
      let hasNestedSpread = false;
      let hasNestedObject = false;

      function visit(node: TSESTree.Node, depth = 0): void {
        if (node.type === AST_NODE_TYPES.SpreadElement) {
          hasSpread = true;
          if (depth > 0) {
            hasNestedSpread = true;
          }
        } else if (
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          hasFunction = true;
        } else if (
          // Check for Symbol usage in computed properties
          (node.type === AST_NODE_TYPES.Property &&
            node.computed &&
            node.key.type === AST_NODE_TYPES.Identifier &&
            node.key.name === 'Symbol') ||
          // Check for direct Symbol constructor calls
          (node.type === AST_NODE_TYPES.Property &&
            node.computed &&
            node.key.type === AST_NODE_TYPES.CallExpression &&
            node.key.callee.type === AST_NODE_TYPES.Identifier &&
            node.key.callee.name === 'Symbol')
        ) {
          hasSymbol = true;
        }

        // Visit child nodes without traversing parent references. Depth tracks
        // object-nesting level: an object's OWN direct properties stay at the
        // object's depth, and only descending into a property's value (a
        // genuinely nested child) increments it. This keeps the top-level
        // object's own `...spread` at depth 0 so it is never miscounted as a
        // nested spread.
        if (node.type === AST_NODE_TYPES.ObjectExpression) {
          if (depth > 0) {
            hasNestedObject = true;
          }
          node.properties.forEach((prop) => visit(prop, depth));
        } else if (node.type === AST_NODE_TYPES.Property) {
          visit(node.value, depth + 1);
        } else if (node.type === AST_NODE_TYPES.SpreadElement) {
          visit(node.argument, depth);
        }
      }

      visit(node);
      return (
        hasSpread &&
        hasNestedSpread &&
        hasNestedObject &&
        !hasFunction &&
        !hasSymbol
      );
    }

    const sourceCode = context.sourceCode;

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
          hasNestedSpread(current)
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
     * shadowing it would silently call something else.
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

      const importText = `import { ${CLONE_DEEP_NAME} } from '${CLONE_DEEP_MODULE}';\n`;
      const [firstImport] = importDeclarations;
      if (firstImport) {
        return [fixer.insertTextBefore(firstImport, importText)];
      }
      return [fixer.insertTextBeforeRange([0, 0], importText)];
    }

    // Find the outermost object expression that needs cloneDeep
    function findOutermostObjectWithNestedSpread(
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
          // If this is a property of an object expression, check if that object has nested spreads
          if (hasNestedSpread(current.parent)) {
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

        if (hasNestedSpread(node)) {
          // Find the outermost object that should use cloneDeep
          const outermostNode = findOutermostObjectWithNestedSpread(node);

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
