import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useFastDeepEqual' | 'addFastDeepEqualImport';

export const fastDeepEqualOverMicrodiff = createRule<[], MessageIds>({
  name: 'fast-deep-equal-over-microdiff',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using fast-deep-equal for equality checks instead of microdiff',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useFastDeepEqual:
        'Use fast-deep-equal for equality checks instead of microdiff.length === 0',
      addFastDeepEqualImport:
        'Import isEqual from fast-deep-equal for equality checks',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    let hasFastDeepEqualImport = false;
    let microdiffImportName = 'diff';
    let fastDeepEqualImportName = 'isEqual';
    const reportedNodes = new Set<TSESTree.Node>();
    let plannedFastDeepEqualImport = false;

    /**
     * Resolve an identifier to its variable and return the initializer CallExpression if it's a microdiff call.
     */
function findVariableInScopeChain(
  identifier: TSESTree.Identifier,
): any | undefined {
  let scope: any = context.getScope();
  let variable: any | undefined;
  while (scope && !variable) {
    variable = scope.variables.find((v: any) => v.name === identifier.name);
    scope = scope.upper;
  }
  return variable;
}

function resolveIdentifierToMicrodiffCall(
  identifier: TSESTree.Identifier,
): TSESTree.CallExpression | undefined {
  // Look for a reference in the current scope chain
  const variable = findVariableInScopeChain(identifier);
  if (!variable) return undefined;
  const defNode = variable.defs[0]?.node as any;
  if (!defNode) return undefined;

  // Variable declarator with initializer call
  if (
    defNode.type === AST_NODE_TYPES.VariableDeclarator &&
    defNode.init &&
    defNode.init.type === AST_NODE_TYPES.CallExpression &&
    defNode.init.callee &&
    defNode.init.callee.type === AST_NODE_TYPES.Identifier &&
    defNode.init.callee.name === microdiffImportName
  ) {
    return defNode.init as TSESTree.CallExpression;
  }
  return undefined;
}

/**
 * Determine if the given variable is used only for `.length` property accesses.
 * If there is any non-length usage (e.g., indexing, iteration, method calls), return false.
 */
function isVariableOnlyUsedForLength(identifier: TSESTree.Identifier): boolean {
  // Walk up scope chain to find a reference for this identifier
  const variable = findVariableInScopeChain(identifier);
  if (!variable) return false;

  // All references must be strictly of the form <id>.length, except the variable's own declaration
  return variable.references.every((reference: any) => {
    const idNode = reference.identifier as TSESTree.Identifier;
    const parent = idNode.parent as TSESTree.Node | undefined;
    if (!parent) return false;

    // Allow the declaration id (not considered a read)
    if (
      parent.type === AST_NODE_TYPES.VariableDeclarator &&
      (parent.id as any) === idNode
    ) {
      return true;
    }

    // Accept only the specific pattern: Identifier used as object in MemberExpression with property `length`
    if (
      parent.type === AST_NODE_TYPES.MemberExpression &&
      parent.object === idNode &&
      !parent.computed &&
      parent.property.type === AST_NODE_TYPES.Identifier &&
      parent.property.name === 'length'
    ) {
      return true;
    }
    return false;
  });
}

    /**
     * If a MemberExpression is `<something>.length`, returns the underlying microdiff call if applicable.
     * Supports direct `diff(a,b).length` and `changes.length` where `changes` is initialized to a microdiff call.
     */
    function getMicrodiffCallFromLengthAccess(
      member: TSESTree.MemberExpression,
    ): { diffCall?: TSESTree.CallExpression; viaIdentifier: boolean } {
      if (
        member.property.type !== AST_NODE_TYPES.Identifier ||
        member.property.name !== 'length'
      ) {
        return { viaIdentifier: false };
      }

      const obj = member.object as TSESTree.Node;
      if (
        obj.type === AST_NODE_TYPES.CallExpression &&
        obj.callee.type === AST_NODE_TYPES.Identifier &&
        obj.callee.name === microdiffImportName
      ) {
        return { diffCall: obj, viaIdentifier: false };
      }

      if (obj.type === AST_NODE_TYPES.Identifier) {
        const resolved = resolveIdentifierToMicrodiffCall(obj);
        if (!resolved) return { viaIdentifier: true };

        // Ensure the identifier is only used for `.length` accesses (no content-based usage)
        if (!isVariableOnlyUsedForLength(obj)) {
          return { viaIdentifier: true };
        }
        return { diffCall: resolved, viaIdentifier: true };
      }

      return { viaIdentifier: false };
    }

    /**
     * Check if a node is a microdiff equality check pattern
     * Looks for patterns like:
     * - diff(a, b).length === 0
     * - 0 === diff(a, b).length
     * - changes.length === 0 (where `changes = diff(a,b)` and changes is only used for length checks)
     * - changes.length !== 0
     * - !diff(a, b).length
     * - !changes.length
     */
    function isMicrodiffEqualityCheck(node: TSESTree.Node): {
      isEquality: boolean;
      diffCall?: TSESTree.CallExpression;
    } {
      // Check for binary expressions comparing length to 0 (both directions)
      if (node.type === AST_NODE_TYPES.BinaryExpression) {
        const operators = ['===', '==', '!==', '!='] as const;
        if (operators.includes(node.operator as any)) {
          // side A: MemberExpression .length, side B: 0
          if (
            node.right.type === AST_NODE_TYPES.Literal &&
            node.right.value === 0 &&
            node.left.type === AST_NODE_TYPES.MemberExpression
          ) {
            const { diffCall } = getMicrodiffCallFromLengthAccess(node.left);
            if (diffCall) {
              return {
                isEquality: node.operator === '===' || node.operator === '==',
                diffCall,
              };
            }
          }
          // side A: 0, side B: MemberExpression .length
          if (
            node.left.type === AST_NODE_TYPES.Literal &&
            node.left.value === 0 &&
            node.right.type === AST_NODE_TYPES.MemberExpression
          ) {
            const { diffCall } = getMicrodiffCallFromLengthAccess(node.right);
            if (diffCall) {
              return {
                isEquality: node.operator === '===' || node.operator === '==',
                diffCall,
              };
            }
          }
        }
      }

      // Check for unary expressions like !diff(a, b).length or !changes.length
      if (
        node.type === AST_NODE_TYPES.UnaryExpression &&
        node.operator === '!'
      ) {
        if (node.argument.type === AST_NODE_TYPES.MemberExpression) {
          const { diffCall } = getMicrodiffCallFromLengthAccess(node.argument);
          if (diffCall) {
            return {
              isEquality: true, // !<expr>.length is equivalent to <expr>.length === 0
              diffCall,
            };
          }
        }
      }

      // Not a microdiff equality check
      return { isEquality: false };
    }

    /**
     * Try to find the identifier used as `<id>.length` for the given equality node
     */
    function getLengthIdentifierFromNode(
      node: TSESTree.Node,
    ): TSESTree.Identifier | undefined {
      if (node.type === AST_NODE_TYPES.BinaryExpression) {
        const left = node.left;
        const right = node.right;
        const isLengthMember = (n: TSESTree.Node): n is TSESTree.MemberExpression =>
          n.type === AST_NODE_TYPES.MemberExpression &&
          !n.computed &&
          n.property.type === AST_NODE_TYPES.Identifier &&
          n.property.name === 'length';
        if (isLengthMember(left) && left.object.type === AST_NODE_TYPES.Identifier) {
          return left.object;
        }
        if (isLengthMember(right) && right.object.type === AST_NODE_TYPES.Identifier) {
          return right.object;
        }
      }
      if (node.type === AST_NODE_TYPES.UnaryExpression) {
        const arg = node.argument;
        if (
          arg.type === AST_NODE_TYPES.MemberExpression &&
          !arg.computed &&
          arg.property.type === AST_NODE_TYPES.Identifier &&
          arg.property.name === 'length' &&
          arg.object.type === AST_NODE_TYPES.Identifier
        ) {
          return arg.object;
        }
      }
      return undefined;
    }

    /**
     * Get the indentation at the start of the current line for a node
     */
    function getLineBaseIndent(node: TSESTree.Node): string {
      const text = sourceCode.text as string;
      const start = node.range![0];
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      let i = lineStart;
      let indent = '';
      while (i < text.length) {
        const ch = text[i];
        if (ch === ' ' || ch === '\t') {
          indent += ch;
          i++;
        } else {
          break;
        }
      }
      return indent;
    }

    /**
     * Create a fix for replacing microdiff equality check with fast-deep-equal
     */
    function createFix(
      fixer: any,
      node: TSESTree.Node,
      diffCall: TSESTree.CallExpression,
      isEquality: boolean,
    ) {
      const args = diffCall.arguments;

      if (args.length !== 2) {
        return null; // Can't fix if not exactly 2 arguments
      }

      const arg1 = sourceCode.getText(args[0]);
      const arg2 = sourceCode.getText(args[1]);

      const fixes: any[] = [];

      // Add import if needed (only once across all fixes in this file)
      if (!hasFastDeepEqualImport && !plannedFastDeepEqualImport) {
        const importDeclarations = sourceCode.ast.body.filter(
          (node): node is TSESTree.ImportDeclaration =>
            node.type === AST_NODE_TYPES.ImportDeclaration,
        );
        const microdiffImport = importDeclarations.find(
          (node) => node.source.value === 'microdiff',
        );
        if (microdiffImport) {
          fixes.push(
            fixer.insertTextAfter(
              microdiffImport,
              `\nimport isEqual from 'fast-deep-equal';`,
            ),
          );
          plannedFastDeepEqualImport = true;
        }
      }

      // If the equality was via an identifier like `changes.length`, and that identifier
      // is declared as `const changes = diff(...);` and used ONLY for `.length` checks,
      // remove the redundant variable declaration.
      const maybeIdentifier = getLengthIdentifierFromNode(node);
      if (maybeIdentifier && isVariableOnlyUsedForLength(maybeIdentifier)) {
        // Resolve the definition
        let scope: any = context.getScope();
        let variable: any | undefined;
        while (scope && !variable) {
          variable = scope.variables.find(
            (v: any) => v.name === maybeIdentifier.name,
          );
          scope = scope.upper;
        }
        const defNode = variable?.defs?.[0]?.node as TSESTree.VariableDeclarator;
        if (
          defNode &&
          defNode.type === AST_NODE_TYPES.VariableDeclarator &&
          defNode.parent &&
          defNode.parent.type === AST_NODE_TYPES.VariableDeclaration
        ) {
          const declaration = defNode.parent;
          if (declaration.declarations.length === 1) {
            const start = declaration.range[0];
            const end = declaration.range[1];
            const text = sourceCode.text as string;
            let removalStart = start;
            const prevNewline = text.lastIndexOf('\n', start - 1);
            removalStart = prevNewline >= 0 ? prevNewline + 1 : 0;
            let removalEnd = end;
            if (text[removalEnd] === '\r' && text[removalEnd + 1] === '\n') {
              removalEnd += 2;
            } else if (text[removalEnd] === '\n') {
              removalEnd += 1;
            }
            fixes.push(fixer.removeRange([removalStart, removalEnd]));
          }
        }
      }

      // Replace the equality expression with isEqual call
      const isMultilineCall =
        diffCall.loc &&
        args[0].loc &&
        (diffCall.loc.start.line !== args[0].loc.start.line ||
          (args[1] && args[0].loc.start.line !== args[1].loc.start.line));

      let replacement: string;
      if (isMultilineCall) {
        const baseIndent = getLineBaseIndent(node);
        const innerIndentPlus = baseIndent + '  ';
        replacement =
          `${fastDeepEqualImportName}(` +
          `\n${innerIndentPlus}${arg1},` +
          `\n${innerIndentPlus}${arg2},` +
          `\n${baseIndent})`;
      } else {
        replacement = `${fastDeepEqualImportName}(${arg1}, ${arg2})`;
      }

      if (!isEquality) {
        replacement = `!${replacement}`;
      }

      fixes.push(fixer.replaceText(node, replacement));

      return fixes;
    }

    return {
      // Track imports of microdiff and fast-deep-equal
      ImportDeclaration(node) {
        const importSource = node.source.value;

        // Check for microdiff import
        if (importSource === 'microdiff') {
          // Get the local name of the imported diff function
          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.name === 'diff'
            ) {
              microdiffImportName = specifier.local.name;
            }
            if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
              microdiffImportName = specifier.local.name;
            }
          });
        }

        // Check for fast-deep-equal import
        if (
          importSource === 'fast-deep-equal' ||
          importSource === 'fast-deep-equal/es6'
        ) {
          hasFastDeepEqualImport = true;
          // Get the local name of the imported isEqual function
          node.specifiers.forEach((specifier) => {
            if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
              fastDeepEqualImportName = specifier.local.name;
            }
          });
        }
      },

      // Check expressions for microdiff equality patterns
      ['BinaryExpression, UnaryExpression'](
        node: TSESTree.BinaryExpression | TSESTree.UnaryExpression,
      ) {
        // Skip if we've already reported this node
        if (reportedNodes.has(node)) {
          return;
        }

        const result = isMicrodiffEqualityCheck(node);
        if (result.isEquality !== undefined && result.diffCall) {
          reportedNodes.add(node);
          context.report({
            node,
            messageId: 'useFastDeepEqual',
            fix(fixer) {
              return createFix(
                fixer,
                node,
                result.diffCall!,
                result.isEquality,
              );
            },
          });
        }
      },

      // Check if statements for microdiff equality patterns
      IfStatement(node) {
        // Skip if we've already reported this node
        if (reportedNodes.has(node.test)) {
          return;
        }

        const result = isMicrodiffEqualityCheck(node.test);
        if (result.isEquality !== undefined && result.diffCall) {
          reportedNodes.add(node.test);
          context.report({
            node: node.test,
            messageId: 'useFastDeepEqual',
            fix(fixer) {
              return createFix(
                fixer,
                node.test,
                result.diffCall!,
                result.isEquality,
              );
            },
          });
        }
      },

      // Check return statements for microdiff equality patterns
      ReturnStatement(node) {
        // Skip if we've already reported this node or if there's no argument
        if (!node.argument || reportedNodes.has(node.argument)) {
          return;
        }

        const result = isMicrodiffEqualityCheck(node.argument);
        if (result.isEquality !== undefined && result.diffCall) {
          reportedNodes.add(node.argument);
          context.report({
            node: node.argument,
            messageId: 'useFastDeepEqual',
            fix(fixer) {
              // We already checked that node.argument is not null above
              return createFix(
                fixer,
                node.argument as TSESTree.Node,
                result.diffCall!,
                result.isEquality,
              );
            },
          });
        }
      },
    };
  },
});
