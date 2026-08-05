import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { afterShebang } from '../utils/shebang';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'useGlobalConstant' | 'extractDefaultToGlobalConstant';

export const enforceGlobalConstants = createRule<[], MessageIds>({
  name: 'enforce-global-constants',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce global static constants for React components/hooks',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useGlobalConstant:
        'Object literal returned from useMemo with empty dependencies creates a new reference every render without providing memoization benefits → this wastes memory and misleads readers into thinking the value is computed → move the object to a module-level constant (e.g., const OPTIONS = { ... } as const;).',
      extractDefaultToGlobalConstant:
        'Inline default value in destructuring creates a new reference on every render → this causes unnecessary re-renders in child components due to unstable identity → extract the default to a module-level constant (e.g., const DEFAULT_OPTIONS = { ... } as const;).',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    function isHookName(name: string): boolean {
      return /^use[A-Z]/.test(name);
    }

    function isComponentOrHookFunction(
      fn:
        | TSESTree.FunctionDeclaration
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression,
    ): boolean {
      if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
        const n = fn.id?.name ?? '';
        return /^[A-Z]/.test(n) || isHookName(n);
      }
      const parent = fn.parent;
      if (
        parent &&
        parent.type === AST_NODE_TYPES.VariableDeclarator &&
        parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        const n = parent.id.name;
        return /^[A-Z]/.test(n) || isHookName(n);
      }
      return false;
    }

    function getEnclosingFunction(
      node: TSESTree.Node,
    ):
      | TSESTree.FunctionDeclaration
      | TSESTree.ArrowFunctionExpression
      | TSESTree.FunctionExpression
      | null {
      let current: TSESTree.Node | undefined | null = node;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          current.type === AST_NODE_TYPES.FunctionExpression
        ) {
          return current;
        }
        current = current.parent as TSESTree.Node | undefined | null;
      }
      return null;
    }

    function toUpperSnakeCase(name: string): string {
      return name
        .replace(/([A-Z])/g, '_$1')
        .toUpperCase()
        .replace(/^_/, '');
    }

    function collectAssignmentDefaultsFromPattern(
      pattern:
        | TSESTree.ArrayPattern
        | TSESTree.ObjectPattern
        | TSESTree.AssignmentPattern,
    ) {
      const results: Array<{
        assignment: TSESTree.AssignmentPattern;
        localName: string;
      }> = [];
      const visitPattern = (
        p:
          | TSESTree.ArrayPattern
          | TSESTree.ObjectPattern
          | TSESTree.AssignmentPattern,
      ) => {
        if (p.type === AST_NODE_TYPES.ObjectPattern) {
          for (const prop of p.properties) {
            if (prop.type === AST_NODE_TYPES.Property) {
              const value = prop.value as unknown as
                | TSESTree.ArrayPattern
                | TSESTree.ObjectPattern
                | TSESTree.AssignmentPattern
                | TSESTree.Identifier;
              if (
                value &&
                (value as TSESTree.AssignmentPattern).type ===
                  AST_NODE_TYPES.AssignmentPattern
              ) {
                const assign = value as TSESTree.AssignmentPattern;
                const left = assign.left;
                if (left.type === AST_NODE_TYPES.Identifier) {
                  results.push({ assignment: assign, localName: left.name });
                }
                if (
                  left.type === AST_NODE_TYPES.ObjectPattern ||
                  left.type === AST_NODE_TYPES.ArrayPattern
                ) {
                  // Nested pattern on the left of an assignment; uncommon, ignore naming
                }
              } else if (
                value &&
                (value as TSESTree.ObjectPattern | TSESTree.ArrayPattern)
                  .type &&
                ((value as TSESTree.ObjectPattern | TSESTree.ArrayPattern)
                  .type === AST_NODE_TYPES.ObjectPattern ||
                  (value as TSESTree.ObjectPattern | TSESTree.ArrayPattern)
                    .type === AST_NODE_TYPES.ArrayPattern)
              ) {
                visitPattern(
                  value as TSESTree.ObjectPattern | TSESTree.ArrayPattern,
                );
              }
            }
          }
        } else if (p.type === AST_NODE_TYPES.ArrayPattern) {
          for (const elem of p.elements) {
            if (!elem) continue;
            if (elem.type === AST_NODE_TYPES.AssignmentPattern) {
              const left = elem.left;
              if (left.type === AST_NODE_TYPES.Identifier) {
                results.push({ assignment: elem, localName: left.name });
              }
            } else if (
              elem.type === AST_NODE_TYPES.ArrayPattern ||
              elem.type === AST_NODE_TYPES.ObjectPattern
            ) {
              visitPattern(elem);
            }
          }
        } else if (p.type === AST_NODE_TYPES.AssignmentPattern) {
          const left = p.left;
          if (left.type === AST_NODE_TYPES.Identifier) {
            results.push({ assignment: p, localName: left.name });
          }
        }
      };
      visitPattern(pattern);
      return results;
    }

    function hasIdentifiers(node: TSESTree.Expression | null): boolean {
      return !!node && ASTHelpers.declarationIncludesIdentifier(node);
    }

    /**
     * A generated name is safe to emit only when nothing between the report
     * site and module scope already owns it. Resolution therefore walks the
     * scope chain at the report site rather than scanning `Program.body`: a
     * name-only scan misses inner-scope bindings (which would capture the
     * emitted reference), non-`const` bindings (which would be redeclared) and
     * module constants holding a different value (which would silently swap the
     * default).
     */
    type NameResolution =
      | { kind: 'free' }
      | { kind: 'reusable'; initText: string }
      | { kind: 'blocked' };

    function classifyModuleBinding(
      variable: TSESLint.Scope.Variable,
    ): NameResolution {
      if (variable.defs.length !== 1) {
        return { kind: 'blocked' };
      }
      const declarator = variable.defs[0].node;
      if (declarator.type !== AST_NODE_TYPES.VariableDeclarator) {
        return { kind: 'blocked' };
      }
      const declaration = declarator.parent;
      if (
        !declaration ||
        declaration.type !== AST_NODE_TYPES.VariableDeclaration ||
        declaration.kind !== 'const' ||
        declarator.id.type !== AST_NODE_TYPES.Identifier ||
        !declarator.init
      ) {
        return { kind: 'blocked' };
      }
      return {
        kind: 'reusable',
        initText: sourceCode.getText(declarator.init),
      };
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

    function resolveGeneratedName(
      scope: TSESLint.Scope.Scope | null,
      constName: string,
    ): NameResolution {
      let current = scope;
      while (current) {
        const variable = current.variables.find((v) => v.name === constName);
        if (variable) {
          return current.block.type === AST_NODE_TYPES.Program
            ? classifyModuleBinding(variable)
            : { kind: 'blocked' };
        }
        current = current.upper;
      }
      // An unresolved reference elsewhere in the file points at an ambient
      // global; declaring the name at module scope would capture it.
      const globalScope = sourceCode.scopeManager?.globalScope;
      if (
        globalScope?.through.some((ref) => ref.identifier.name === constName)
      ) {
        return { kind: 'blocked' };
      }
      return { kind: 'free' };
    }

    function buildInitializerText(initText: string): string {
      const needsAsConst =
        /^(?:true|false|-?\d|\[|\{|[`'"])/.test(initText) &&
        !/\bas const\b/.test(initText);
      return needsAsConst ? `${initText} as const` : initText;
    }

    function buildConstDeclarationLine(
      constName: string,
      initText: string,
    ): string {
      return `const ${constName} = ${buildInitializerText(initText)};`;
    }

    function reportStaticDefaults(
      patterns: Array<TSESTree.ObjectPattern | TSESTree.ArrayPattern>,
      enclosingFn:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | null,
      nodeForReport: TSESTree.Node,
    ) {
      if (!enclosingFn || !isComponentOrHookFunction(enclosingFn)) return;

      const defaults: Array<{
        assignment: TSESTree.AssignmentPattern;
        localName: string;
      }> = [];
      for (const pattern of patterns) {
        defaults.push(...collectAssignmentDefaultsFromPattern(pattern));
      }
      if (defaults.length === 0) return;

      const staticDefaults = defaults.filter((def) => {
        const right = def.assignment.right as TSESTree.Expression | null;
        return right && !hasIdentifiers(right);
      });
      if (staticDefaults.length === 0) return;

      const reportScope = scopeOf(nodeForReport);

      context.report({
        node: nodeForReport,
        messageId: 'extractDefaultToGlobalConstant',
        fix(fixer) {
          const fixes: TSESLint.RuleFix[] = [];

          const declLines: string[] = [];
          // Names this fix commits to declaring, mapped to the initializer it
          // declares them with, so sibling defaults sharing a generated name
          // share the declaration instead of duplicating the binding.
          const scheduledInits = new Map<string, string>();

          for (const def of staticDefaults) {
            const { assignment, localName } = def;
            const right = assignment.right as TSESTree.Expression;
            const rightText = sourceCode.getText(right);
            const constName = `DEFAULT_${toUpperSnakeCase(localName)}`;
            const initText = buildInitializerText(rightText);

            const scheduled = scheduledInits.get(constName);
            if (scheduled !== undefined) {
              if (scheduled !== initText) continue;
              fixes.push(fixer.replaceText(right, constName));
              continue;
            }

            const resolution = resolveGeneratedName(reportScope, constName);
            if (resolution.kind === 'blocked') {
              // Declining leaves the report in place: the developer extracts
              // the constant by hand instead of the fixer corrupting the file.
              continue;
            }
            if (resolution.kind === 'reusable') {
              // Reuse is safe only when the existing constant holds the very
              // same value; `as const` may be present on either side.
              if (
                resolution.initText !== initText &&
                resolution.initText !== rightText
              ) {
                continue;
              }
              fixes.push(fixer.replaceText(right, constName));
              continue;
            }

            declLines.push(buildConstDeclarationLine(constName, rightText));
            scheduledInits.set(constName, initText);
            fixes.push(fixer.replaceText(right, constName));
          }

          if (fixes.length === 0) return null;

          if (declLines.length > 0) {
            const program = sourceCode.ast;
            const constSection =
              declLines.length === 1
                ? declLines[0]
                : `${declLines[0]}\n\n${declLines.slice(1).join('\n')}`;
            const text = sourceCode.text;
            const findNextNonWhitespace = (start: number): number => {
              let idx = start;
              while (idx < text.length && /\s/.test(text[idx])) {
                idx += 1;
              }
              return idx;
            };
            const buildBlock = (
              extraSpacing: boolean,
              insertPos: number,
              nextPos: number,
            ): string => {
              const whitespace = text.slice(insertPos, nextPos);
              const lastNewline = whitespace.lastIndexOf('\n');
              const nextIndentRaw =
                lastNewline === -1
                  ? ''
                  : whitespace.slice(lastNewline + 1).replace(/[^\t ]/g, '');
              const separator = extraSpacing ? '\n\n\n' : '\n\n';
              const nextIndent = extraSpacing ? nextIndentRaw : '';
              return `\n${constSection}${separator}${nextIndent}`;
            };
            const imports = program.body.filter(
              (s) => s.type === AST_NODE_TYPES.ImportDeclaration,
            );
            if (imports.length > 0) {
              const lastImport = imports[imports.length - 1];
              const insertPos = lastImport.range![1];
              const nextPos = findNextNonWhitespace(insertPos);
              fixes.push(
                fixer.replaceTextRange(
                  [insertPos, nextPos],
                  buildBlock(false, insertPos, nextPos),
                ),
              );
            } else {
              const body = program.body;
              // A shebang has to stay at character 0 or the file stops parsing
              // (TS18026), so it bounds the insertion the same way the
              // directive prologue below does.
              let insertPos = afterShebang(text);
              let afterDirectiveIdx = -1;
              for (let i = 0; i < body.length; i++) {
                const stmt = body[i];
                if (
                  stmt.type === AST_NODE_TYPES.ExpressionStatement &&
                  stmt.expression.type === AST_NODE_TYPES.Literal &&
                  typeof stmt.expression.value === 'string'
                ) {
                  afterDirectiveIdx = i;
                } else {
                  break;
                }
              }
              if (afterDirectiveIdx >= 0) {
                insertPos = body[afterDirectiveIdx].range![1];
              }
              const nextPos = findNextNonWhitespace(insertPos);
              fixes.push(
                fixer.replaceTextRange(
                  [insertPos, nextPos],
                  buildBlock(afterDirectiveIdx < 0, insertPos, nextPos),
                ),
              );
            }
          }

          return fixes;
        },
      });
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type !== AST_NODE_TYPES.Identifier ||
          node.callee.name !== 'useMemo'
        ) {
          return;
        }

        if (node.arguments.length !== 2) {
          return;
        }

        const depsArray = node.arguments[1];
        if (
          depsArray.type !== AST_NODE_TYPES.ArrayExpression ||
          depsArray.elements.length !== 0
        ) {
          return;
        }

        const callback = node.arguments[0];
        if (
          callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callback.type !== AST_NODE_TYPES.FunctionExpression
        ) {
          return;
        }

        let returnValue: TSESTree.Expression | null = null;

        if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
          const returnStatement = callback.body.body.find(
            (stmt) => stmt.type === AST_NODE_TYPES.ReturnStatement,
          ) as TSESTree.ReturnStatement | undefined;

          if (!returnStatement || !returnStatement.argument) {
            return;
          }

          returnValue = returnStatement.argument;
        } else {
          returnValue = callback.body;
        }

        let actualReturnValue = returnValue;
        if (returnValue.type === AST_NODE_TYPES.TSAsExpression) {
          actualReturnValue = returnValue.expression;
        }

        if (
          actualReturnValue.type === AST_NODE_TYPES.ObjectExpression ||
          (actualReturnValue.type === AST_NODE_TYPES.ArrayExpression &&
            actualReturnValue.elements.some(
              (element) =>
                element !== null &&
                element.type === AST_NODE_TYPES.ObjectExpression,
            ))
        ) {
          context.report({
            node,
            messageId: 'useGlobalConstant',
          });
        }
      },

      VariableDeclaration(node) {
        const relevantDeclarators = node.declarations.filter(
          (d) =>
            d.id.type === AST_NODE_TYPES.ObjectPattern ||
            d.id.type === AST_NODE_TYPES.ArrayPattern,
        );
        if (relevantDeclarators.length === 0) return;

        const enclosingFn = getEnclosingFunction(node);
        reportStaticDefaults(
          relevantDeclarators.map(
            (d) => d.id as TSESTree.ObjectPattern | TSESTree.ArrayPattern,
          ),
          enclosingFn,
          node,
        );
      },

      FunctionDeclaration(node) {
        const patterns = node.params.filter(
          (p): p is TSESTree.ObjectPattern | TSESTree.ArrayPattern =>
            p.type === AST_NODE_TYPES.ObjectPattern ||
            p.type === AST_NODE_TYPES.ArrayPattern,
        );
        if (patterns.length === 0) return;
        reportStaticDefaults(patterns, node, node);
      },

      FunctionExpression(node) {
        const patterns = node.params.filter(
          (p): p is TSESTree.ObjectPattern | TSESTree.ArrayPattern =>
            p.type === AST_NODE_TYPES.ObjectPattern ||
            p.type === AST_NODE_TYPES.ArrayPattern,
        );
        if (patterns.length === 0) return;
        reportStaticDefaults(patterns, node, node);
      },

      ArrowFunctionExpression(node) {
        const patterns = node.params.filter(
          (p): p is TSESTree.ObjectPattern | TSESTree.ArrayPattern =>
            p.type === AST_NODE_TYPES.ObjectPattern ||
            p.type === AST_NODE_TYPES.ArrayPattern,
        );
        if (patterns.length === 0) return;
        reportStaticDefaults(patterns, node, node);
      },
    };
  },
});
