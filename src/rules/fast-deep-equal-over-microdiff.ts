import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';
import { MICRODIFF_MODULES } from '../utils/microdiffModules';
import {
  FAST_DEEP_EQUAL_MODULES,
  fastDeepEqualImport,
} from '../utils/fastDeepEqualModules';

type MessageIds = 'useFastDeepEqual';

const DIFF_EXPORT_NAME = 'diff';

/**
 * Whether a declaration imports values — a `import type ...` declaration binds
 * nothing at runtime, so it neither supplies a callable `diff` nor satisfies
 * the fast-deep-equal import the fix emits.
 */
function isValueImport(declaration: TSESTree.ImportDeclaration): boolean {
  return declaration.importKind !== 'type';
}

/**
 * Whether a specifier binds microdiff's diff function: the module default, or
 * its named `diff` export under whatever local name. Type-only specifiers are
 * excluded for the same reason a type-only declaration is.
 *
 * The check matters because microdiff's other exports are types — a file
 * importing only `Difference` binds no `diff` at all, and treating that import
 * as proof of one turns any local `diff(...)` in the file into a violation.
 */
function bindsMicrodiffDiff(specifier: TSESTree.ImportClause): boolean {
  if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
    return true;
  }
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.name === DIFF_EXPORT_NAME
  );
}

/**
 * Whether a specifier binds a callable equality function rather than the module
 * object: the default export the package is, or a named specifier of it. A
 * namespace import binds the module, and a bare `import '...'` binds nothing at
 * all — reading either as the file's equality function leaves the emitted
 * `isEqual(...)` call with no declaration behind it.
 */
function bindsFastDeepEqualFunction(specifier: TSESTree.ImportClause): boolean {
  return (
    specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
    (specifier.type === AST_NODE_TYPES.ImportSpecifier &&
      specifier.importKind !== 'type')
  );
}

/**
 * Whether every declaration of a visible binding is a fast-deep-equal import,
 * i.e. the name already means the comparison function the fix wants to call.
 * The verdict comes off the AST (each definition's specifier and its import
 * declaration) rather than a traversal flag, so it holds on every pass of a
 * multi-pass `--fix`, including the passes that follow an inserted import.
 */
function bindsFastDeepEqual(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (
        specifier.type !== AST_NODE_TYPES.ImportDefaultSpecifier &&
        specifier.type !== AST_NODE_TYPES.ImportSpecifier
      ) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        isValueImport(declaration) &&
        FAST_DEEP_EQUAL_MODULES.has(String(declaration.source.value))
      );
    })
  );
}

/**
 * The expression an optional chain wraps. ESTree interposes a
 * `ChainExpression` between an optional member/call and its real parent, so
 * `changes?.length` reaches an operand test as a ChainExpression while
 * `changes.length` reaches it as a MemberExpression. Every arm that inspects an
 * operand has to unwrap first, or one spelling of a single idiom escapes the
 * rule while the other is reported.
 */
function unwrapChain(node: TSESTree.Node): TSESTree.Node {
  return node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
}

/**
 * Whether two edits touch the same characters. ESLint sorts the fixes of one
 * report and asserts each starts at or after the end of the previous one, so
 * abutting ranges are fine while overlapping ranges throw and discard every
 * message for the file.
 */
function rangesOverlap(
  a: Readonly<TSESTree.Range>,
  b: Readonly<TSESTree.Range>,
): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

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
        "What's wrong: This code uses `{{diffName}}(...).length` as a deep equality check.\n" +
        'Why it matters: `{{diffName}}` allocates a full change list (paths, types, values) before you compare it to zero, which hides the boolean intent and wastes memory/time.\n' +
        'How to fix: Call `{{fastEqualName}}(left, right)` for equality (or prefix with `!` for inequality) using the same two arguments instead of counting diff length.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
    let hasFastDeepEqualImport = false;
    let hasMicrodiffImport = false;
    let microdiffImportName = 'diff';
    let fastDeepEqualImportName = 'isEqual';
    const reportedNodes = new Set<TSESTree.Node>();
    let plannedFastDeepEqualImport = false;

    /**
     * The `import ... from '@blumintinc/fast-deep-equal'` statement rides on a
     * single violation's fix, so that violation is the file's import carrier. A
     * suppressed carrier would take the import down with it while the surviving
     * violations still emit `isEqual(...)` calls, leaving them unbound.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    function isMicrodiffCallee(
      callee: TSESTree.LeftHandSideExpression,
    ): boolean {
      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        callee.name === microdiffImportName
      ) {
        return true;
      }
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.object.type === AST_NODE_TYPES.Identifier &&
        callee.object.name === microdiffImportName &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        (callee.property.name === 'diff' || callee.property.name === 'default')
      ) {
        return true;
      }
      return false;
    }

    /**
     * Resolve an identifier to its variable and return the initializer CallExpression if it's a microdiff call.
     */
    function findVariableInScopeChain(
      identifier: TSESTree.Identifier,
    ): TSESLint.Scope.Variable | undefined {
      // Use scopeManager to resolve variable from the identifier's reference
      const scopeManager = sourceCode.scopeManager;
      if (!scopeManager) return undefined;

      // Find the scope for this identifier
      let scope: TSESLint.Scope.Scope | null = null;
      let currentNode: TSESTree.Node | undefined = identifier;

      while (currentNode) {
        scope = scopeManager.acquire(currentNode, true) || null;
        if (scope) break;
        currentNode = currentNode.parent;
      }

      if (!scope) {
        scope = scopeManager.globalScope;
      }

      if (!scope) return undefined;

      // Look up variable in the scope chain
      let currentScope: TSESLint.Scope.Scope | null = scope;
      while (currentScope) {
        const variable = currentScope.variables.find(
          (v) => v.name === identifier.name,
        );
        if (variable) return variable;
        currentScope = currentScope.upper;
      }

      return undefined;
    }

    function resolveIdentifierToMicrodiffCall(
      identifier: TSESTree.Identifier,
    ): TSESTree.CallExpression | undefined {
      // Look for a reference in the current scope chain
      const variable = findVariableInScopeChain(identifier);
      if (!variable) return undefined;
      const defNode = variable.defs[0]?.node;
      if (!defNode) return undefined;

      // Variable declarator with initializer call
      if (defNode.type === AST_NODE_TYPES.VariableDeclarator) {
        const { init } = defNode;
        if (
          init &&
          init.type === AST_NODE_TYPES.CallExpression &&
          init.callee &&
          init.callee.type === AST_NODE_TYPES.Identifier &&
          init.callee.name === microdiffImportName
        ) {
          return init;
        }
      }
      return undefined;
    }

    /**
     * Determine if the given variable is used only for `.length` property accesses.
     * If there is any non-length usage (e.g., indexing, iteration, method calls), return false.
     */
    function isVariableOnlyUsedForLength(
      identifier: TSESTree.Identifier,
    ): boolean {
      // Walk up scope chain to find a reference for this identifier
      const variable = findVariableInScopeChain(identifier);
      if (!variable) return false;

      // All references must be strictly of the form <id>.length, except the variable's own declaration
      return variable.references.every((reference) => {
        const idNode = reference.identifier;
        const parent = idNode.parent;
        if (!parent) return false;

        // Allow the declaration id (not considered a read)
        if (
          parent.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.id.type === AST_NODE_TYPES.Identifier &&
          parent.id === idNode
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
        // Accept optional chaining: identifier?.length represented as ChainExpression
        if (
          parent.type === AST_NODE_TYPES.ChainExpression &&
          parent.expression.type === AST_NODE_TYPES.MemberExpression &&
          parent.expression.object === idNode &&
          !parent.expression.computed &&
          parent.expression.property.type === AST_NODE_TYPES.Identifier &&
          parent.expression.property.name === 'length'
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
      if (!hasMicrodiffImport) return { viaIdentifier: false };
      if (
        member.property.type !== AST_NODE_TYPES.Identifier ||
        member.property.name !== 'length'
      ) {
        return { viaIdentifier: false };
      }

      const obj = member.object;
      if (
        obj.type === AST_NODE_TYPES.CallExpression &&
        isMicrodiffCallee(obj.callee)
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
        const operators: Array<TSESTree.BinaryExpression['operator']> = [
          '===',
          '==',
          '!==',
          '!=',
        ];
        if (operators.includes(node.operator)) {
          // `diff(a, b)?.length`, `changes?.length` and `diff?.(a, b).length`
          // each reach the operand as a ChainExpression, so the unwrap is what
          // keeps the comparison spellings of one idiom from diverging.
          const left = unwrapChain(node.left);
          const right = unwrapChain(node.right);
          // side A: MemberExpression .length, side B: 0
          if (
            right.type === AST_NODE_TYPES.Literal &&
            right.value === 0 &&
            left.type === AST_NODE_TYPES.MemberExpression
          ) {
            const { diffCall } = getMicrodiffCallFromLengthAccess(left);
            if (diffCall) {
              return {
                isEquality: node.operator === '===' || node.operator === '==',
                diffCall,
              };
            }
          }
          // side A: 0, side B: MemberExpression .length
          if (
            left.type === AST_NODE_TYPES.Literal &&
            left.value === 0 &&
            right.type === AST_NODE_TYPES.MemberExpression
          ) {
            const { diffCall } = getMicrodiffCallFromLengthAccess(right);
            if (diffCall) {
              return {
                isEquality: node.operator === '===' || node.operator === '==',
                diffCall,
              };
            }
          }
        }
      }

      // Check for unary expressions like !diff(a, b).length or !changes.length (including optional chaining)
      if (
        node.type === AST_NODE_TYPES.UnaryExpression &&
        node.operator === '!'
      ) {
        const target = unwrapChain(node.argument);
        if (target.type === AST_NODE_TYPES.MemberExpression) {
          const { diffCall } = getMicrodiffCallFromLengthAccess(target);
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
      // The operands are unwrapped for the same reason the detection arm
      // unwraps them: `changes?.length` hides the identifier behind a
      // ChainExpression. Missing it here does not silence the report — it
      // rewrites the comparison and leaves the now-dead
      // `const changes = diff(a, b);` behind.
      const isLengthMember = (
        n: TSESTree.Node,
      ): n is TSESTree.MemberExpression =>
        n.type === AST_NODE_TYPES.MemberExpression &&
        !n.computed &&
        n.property.type === AST_NODE_TYPES.Identifier &&
        n.property.name === 'length';

      if (node.type === AST_NODE_TYPES.BinaryExpression) {
        const left = unwrapChain(node.left);
        const right = unwrapChain(node.right);
        if (
          isLengthMember(left) &&
          left.object.type === AST_NODE_TYPES.Identifier
        ) {
          return left.object;
        }
        if (
          isLengthMember(right) &&
          right.object.type === AST_NODE_TYPES.Identifier
        ) {
          return right.object;
        }
      }
      if (node.type === AST_NODE_TYPES.UnaryExpression) {
        const arg = unwrapChain(node.argument);
        if (
          isLengthMember(arg) &&
          arg.object.type === AST_NODE_TYPES.Identifier
        ) {
          return arg.object;
        }
      }
      return undefined;
    }

    /**
     * The call's own text with nothing but the callee name swapped for the
     * fast-deep-equal name. Slicing the original text keeps the argument list —
     * including its formatting and any comments inside it — byte-identical,
     * which matters when the call has to be re-emitted at another position.
     */
    function renameCallee(diffCall: TSESTree.CallExpression): string {
      const callText = sourceCode.getText(diffCall);
      const start = diffCall.range[0];
      return (
        callText.slice(0, diffCall.callee.range[0] - start) +
        fastDeepEqualImportName +
        callText.slice(diffCall.callee.range[1] - start)
      );
    }

    /**
     * The `const changes = diff(...)` statement behind a `changes.length`
     * comparison, when nothing but the comparison reads it — so inlining the
     * call makes the statement dead. A statement declaring more than one
     * variable stays: dropping it would take the other declarators with it.
     */
    function findRedundantDeclaration(
      node: TSESTree.Node,
    ): TSESTree.VariableDeclaration | undefined {
      const lengthIdentifier = getLengthIdentifierFromNode(node);
      if (!lengthIdentifier || !isVariableOnlyUsedForLength(lengthIdentifier)) {
        return undefined;
      }
      const variable = findVariableInScopeChain(lengthIdentifier);
      const defNode = variable?.defs?.[0]?.node;
      if (!defNode || defNode.type !== AST_NODE_TYPES.VariableDeclarator) {
        return undefined;
      }
      const declaration = defNode.parent;
      if (
        declaration?.type !== AST_NODE_TYPES.VariableDeclaration ||
        declaration.declarations.length !== 1
      ) {
        return undefined;
      }
      return declaration;
    }

    /**
     * The span to delete for a redundant declaration. A declaration that owns
     * its whole line takes the line with it, leaving no blank line behind.
     * Otherwise only its own node range goes: a line-wide span would swallow
     * whatever shares the line — the comparison this same report rewrites (an
     * overlap ESLint refuses), the `;` separating a `for` header's clauses, or a
     * trailing directive that governs the surviving next line.
     */
    function redundantDeclarationRange(
      declaration: TSESTree.VariableDeclaration,
    ): TSESTree.Range {
      const text = sourceCode.text;
      const [start, end] = declaration.range;
      const startOfLine = text.lastIndexOf('\n', start - 1) + 1;
      const nextNewline = text.indexOf('\n', end);
      const lineEnd = nextNewline === -1 ? text.length : nextNewline;
      const isBlank = (slice: string) => /^[ \t]*$/.test(slice);

      // A comment counts as content, so it keeps its line rather than riding
      // along with the statement being deleted.
      if (
        isBlank(text.slice(startOfLine, start)) &&
        isBlank(text.slice(end, lineEnd))
      ) {
        return [startOfLine, nextNewline === -1 ? end : nextNewline + 1];
      }

      // The blanks between the declaration and what follows it on the line go
      // too, so the surviving statement keeps its original spacing.
      let removalEnd = end;
      while (removalEnd < lineEnd && isBlank(text[removalEnd])) {
        removalEnd++;
      }
      if (removalEnd < lineEnd) {
        return [start, removalEnd];
      }

      // Nothing but the line break follows, so the blanks in front of the
      // declaration would be left behind as trailing whitespace.
      let removalStart = start;
      while (removalStart > startOfLine && isBlank(text[removalStart - 1])) {
        removalStart--;
      }
      return [removalStart, removalEnd];
    }

    /**
     * The edits that turn the comparison itself into a fast-deep-equal call.
     */
    function createComparisonFixes(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.Node,
      diffCall: TSESTree.CallExpression,
      isEquality: boolean,
    ): TSESLint.RuleFix[] {
      // Comparing a call in place — `diff(a, b).length === 0` — is rewritten by
      // splicing the two ranges that actually change: the callee name and the
      // `.length` comparison tail (plus the `!`/`0 ===` head). Re-emitting the
      // argument list instead destroyed everything between the arguments, and a
      // dropped `eslint-disable` comment silently re-enables the rule it was
      // suppressing.
      const isCallInPlace =
        diffCall.range[0] >= node.range[0] &&
        diffCall.range[1] <= node.range[1];

      if (!isCallInPlace) {
        // `changes.length === 0` compares a call declared elsewhere, so that
        // call moves to the comparison's position and its text has to be
        // re-emitted — verbatim, so its comments move with it.
        const call = renameCallee(diffCall);
        return [fixer.replaceText(node, isEquality ? call : `!${call}`)];
      }

      const fixes: TSESLint.RuleFix[] = [];
      const headRange: TSESTree.Range = [node.range[0], diffCall.range[0]];
      if (!isEquality) {
        fixes.push(fixer.replaceTextRange(headRange, '!'));
      } else if (headRange[0] !== headRange[1]) {
        fixes.push(fixer.removeRange(headRange));
      }
      fixes.push(fixer.replaceText(diffCall.callee, fastDeepEqualImportName));
      fixes.push(fixer.removeRange([diffCall.range[1], node.range[1]]));
      return fixes;
    }

    /**
     * The `import ... from '@blumintinc/fast-deep-equal'` edit, scheduled at
     * most once per file. Claiming the carrier slot is a side effect, so this
     * runs last — after every reason to decline the fix has been ruled out —
     * otherwise a declining violation takes the import down with it and leaves
     * the surviving violations' `isEqual(...)` calls unbound.
     *
     * The specifier is the scoped fork: it is the dependency this codebase
     * declares, so any other name would be written as an import that resolves
     * nowhere.
     */
    function planFastDeepEqualImport(
      fixer: TSESLint.RuleFixer,
    ): TSESLint.RuleFix[] {
      if (hasFastDeepEqualImport || plannedFastDeepEqualImport) {
        return [];
      }
      plannedFastDeepEqualImport = true;

      const importStatement = fastDeepEqualImport(fastDeepEqualImportName);
      const importDeclarations = sourceCode.ast.body.filter(
        (statement): statement is TSESTree.ImportDeclaration =>
          statement.type === AST_NODE_TYPES.ImportDeclaration,
      );
      const microdiffImport = importDeclarations.find((declaration) =>
        MICRODIFF_MODULES.has(String(declaration.source.value)),
      );
      const anchor =
        microdiffImport ?? importDeclarations[importDeclarations.length - 1];

      if (anchor) {
        return [fixer.insertTextAfter(anchor, `\n${importStatement}`)];
      }
      return [fixer.insertTextBeforeRange([0, 0], `${importStatement}\n`)];
    }

    /**
     * Create a fix for replacing microdiff equality check with fast-deep-equal
     */
    function createFix(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.Node,
      diffCall: TSESTree.CallExpression,
      isEquality: boolean,
    ): TSESLint.RuleFix[] | null {
      // A suppressed report is dropped together with its fix. Producing no fix
      // — and leaving the import unscheduled — passes the carrier slot to the
      // first violation that survives.
      if (isReportSuppressed(node)) {
        return null;
      }

      // A binding for the target name that is not the fast-deep-equal import
      // makes both halves of the edit wrong: an inserted import collides with a
      // same-scope declaration (TS2440/TS2300), and a narrower-scope shadow
      // rebinds the emitted call to the local value with no diagnostic at all.
      // Resolving from the fixed node's scope chain catches both. Declining
      // before the import is scheduled leaves the carrier slot to a violation
      // whose scope is safe, and drops the whole edit — including the removal
      // of a redundant `const changes = diff(...)` — rather than half of it.
      const existingBinding = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, node),
        fastDeepEqualImportName,
      );
      if (existingBinding && !bindsFastDeepEqual(existingBinding)) {
        return null;
      }

      if (diffCall.arguments.length !== 2) {
        return null; // Can't fix if not exactly 2 arguments
      }

      const comparisonFixes = createComparisonFixes(
        fixer,
        node,
        diffCall,
        isEquality,
      );

      // If the equality was via an identifier like `changes.length`, and that
      // identifier is declared as `const changes = diff(...);` and used ONLY for
      // `.length` checks, remove the redundant variable declaration.
      const declaration = findRedundantDeclaration(node);
      const declarationFixes: TSESLint.RuleFix[] = [];
      if (declaration) {
        const removalRange = redundantDeclarationRange(declaration);
        // A comparison nested inside the declaration it would delete — a diff
        // argument that reads `changes.length` — admits no pair of disjoint
        // edits. Reporting without a fix beats an overlap, which aborts the
        // file, and beats a half-applied edit that deletes the surviving code.
        if (
          comparisonFixes.some(({ range }) =>
            rangesOverlap(range, removalRange),
          )
        ) {
          return null;
        }
        declarationFixes.push(fixer.removeRange(removalRange));
      }

      return [
        ...planFastDeepEqualImport(fixer),
        ...declarationFixes,
        ...comparisonFixes,
      ];
    }

    function reportEqualityCheck(
      node: TSESTree.Node,
      result: { isEquality: boolean; diffCall?: TSESTree.CallExpression },
    ): void {
      const { diffCall, isEquality } = result;
      if (!diffCall) return;
      if (reportedNodes.has(node)) return;
      reportedNodes.add(node);
      context.report({
        node,
        messageId: 'useFastDeepEqual',
        data: {
          diffName: microdiffImportName,
          fastEqualName: fastDeepEqualImportName,
        },
        fix(fixer) {
          return createFix(fixer, node, diffCall, isEquality);
        },
      });
    }

    return {
      // Track imports of microdiff and fast-deep-equal
      ImportDeclaration(node) {
        const importSource = String(node.source.value);
        if (!isValueImport(node)) {
          return;
        }

        // A microdiff import counts only once it binds the diff function
        // itself. Every other export of the package is a type, so
        // `import { Difference } from '@blumintinc/microdiff'` brings in
        // nothing callable — reading it as microdiff's presence turns an
        // unrelated local `diff(...)` in that file into a violation whose fix
        // rewrites it to an equality check.
        if (MICRODIFF_MODULES.has(importSource)) {
          node.specifiers.filter(bindsMicrodiffDiff).forEach((specifier) => {
            hasMicrodiffImport = true;
            microdiffImportName = specifier.local.name;
          });
        }

        // An equality function the file already has, under any of the
        // specifiers that resolve to one — the scoped fork this codebase
        // depends on, its React entry point, and upstream. Missing one of them
        // costs the fix twice over: a second import of a function already in
        // scope, and, when that import's local name is the one the fix emits, a
        // collision with it that makes the fix decline outright and leaves the
        // report with no remedy.
        if (
          FAST_DEEP_EQUAL_MODULES.has(importSource) &&
          node.specifiers.some(bindsFastDeepEqualFunction)
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
        if (!hasMicrodiffImport) return;
        // Skip if we've already reported this node
        if (reportedNodes.has(node)) {
          return;
        }

        reportEqualityCheck(node, isMicrodiffEqualityCheck(node));
      },

      // Check if statements for microdiff equality patterns
      IfStatement(node) {
        if (!hasMicrodiffImport) return;
        // Skip if we've already reported this node
        if (reportedNodes.has(node.test)) {
          return;
        }

        reportEqualityCheck(node.test, isMicrodiffEqualityCheck(node.test));
      },

      // Check return statements for microdiff equality patterns
      ReturnStatement(node) {
        if (!hasMicrodiffImport) return;
        // Skip if we've already reported this node or if there's no argument
        const argument = node.argument;
        if (!argument || reportedNodes.has(argument)) {
          return;
        }

        reportEqualityCheck(argument, isMicrodiffEqualityCheck(argument));
      },
    };
  },
});
