import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

const COMMON_PREPOSITION_SUFFIXES = new Set([
  // Basic prepositions
  'From',
  'For',
  'With',
  'To',
  'By',
  'In',
  'On',
  'At',
  'Of',

  // Temporal prepositions
  'During',
  'Until',
  'Till',
  'Since',
  'Within',

  // Logical/causal prepositions
  'Because',
  'Despite',
  'Instead',
  'Via',
  'Without',
  'Versus',
  'Vs',

  // Comparative prepositions
  'Than',
  'As',

  // Phrasal prepositions (common endings)
  'Against',
  'Among',
  'Amongst',
  'Beside',
  'Besides',
  'Between',
  'Beyond',
  'Concerning',
  'Considering',
  'Regarding',
  'Respecting',
  'Towards',
  'Toward',
  'Upon',

  // Preposition-like adverbs
  'Again',
  'Already',
  'Always',
  'Ever',
  'Never',
  'Now',
  'Soon',
  'Then',
  'There',
  'Where',
  'When',
  'While',
]);

/**
 * Phrasal-verb particles that fuse with a preceding past participle to form an
 * inseparable state adjective (e.g. "signed in", "logged in", "opted in",
 * "logged out", "zoomed in"). When such a particle is the trailing suffix AND
 * the token before it is a past participle, the ending is NOT a redundant
 * verb-preposition action suffix — it is a single adjective describing state.
 */
const PHRASAL_PARTICLES = new Set(['In', 'On', 'Out', 'Up', 'Off', 'Down']);

/**
 * Verb stems that fuse with a phrasal particle into an established phrasal verb
 * where the particle is inseparable (e.g. "signIn", "logOut", "optIn",
 * "checkIn"). Matched in base form ("signIn", "useGuardSignIn") and
 * past-participle form ("signedIn", "loggedOut", "droppedIn"). A particle
 * preceded by a NOUN object instead — "searchItemsIn", "processEventOn",
 * "loadEmbedIn", "isWidgetIn" — is a genuine redundant verb-preposition suffix
 * and stays flagged. Extend this set when a new phrasal verb appears.
 */
const PHRASAL_VERB_STEMS = new Set([
  'sign',
  'log',
  'opt',
  'check',
  'zoom',
  'drop',
  'shut',
  'turn',
  'switch',
  'scroll',
]);

/**
 * Resolves the lowercased phrasal-verb stem of a final camelCase word, or null
 * when it is not a known phrasal verb. Handles the base form ("sign"), the
 * regular past participle ("signed" → "sign"), and the doubled-consonant
 * participle ("dropped" → "drop"). A noun that merely ends in "ed" (e.g.
 * "embed" → "emb", "shed" → "sh") resolves to null, so it stays flagged — this
 * is what keeps a leaky "ends in ed" heuristic from exempting genuine targets.
 */
function phrasalVerbStem(lastWord: string): string | null {
  const word = lastWord.toLowerCase();
  if (PHRASAL_VERB_STEMS.has(word)) {
    return word;
  }
  if (word.endsWith('ed')) {
    let stem = word.slice(0, -2);
    if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      stem = stem.slice(0, -1);
    }
    if (PHRASAL_VERB_STEMS.has(stem)) {
      return stem;
    }
  }
  return null;
}

/**
 * Returns true when the trailing `suffix` of `name` is a phrasal-verb particle
 * fused to its verb — a past-participle adjective ("signedIn", "loggedOut") or a
 * base-form phrasal verb ("signIn", "logOut"). The word immediately before the
 * particle must be a KNOWN phrasal verb (via phrasalVerbStem), not merely any
 * word ending in "ed"; that keeps redundant suffixes where a noun object
 * precedes the particle ("loadEmbedIn", "isWidgetIn", "searchItemsIn") flagged.
 * This single check also covers boolean predicates: "isSignedIn" resolves the
 * pre-particle "signed" → "sign", while "isWidgetIn" resolves "widget" → null.
 */
function isPhrasalVerbEnding(name: string, suffix: string): boolean {
  if (!PHRASAL_PARTICLES.has(suffix)) {
    return false;
  }
  const beforeSuffix = name.substring(0, name.length - suffix.length);
  const lastWord = beforeSuffix.match(/[A-Z]?[a-z]+$/)?.[0] ?? '';
  return phrasalVerbStem(lastWord) !== null;
}

/**
 * Returns true when `node` (or its relevant ancestor for the declaration kind)
 * is directly wrapped in an export declaration. An exported symbol must not be
 * auto-fixed because the fixer can only rename within the current file, leaving
 * cross-file import references broken.
 *
 * Call this with:
 *  - the FunctionDeclaration node for `function foo() {}`
 *  - the ArrowFunctionExpression/FunctionExpression node for `const foo = () => {}`
 *    (its parent chain: arrow → VariableDeclarator → VariableDeclaration → export?)
 */
function isExported(node: TSESTree.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // FunctionDeclaration directly inside `export function foo() {}`
  if (
    parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    parent.type === AST_NODE_TYPES.ExportDefaultDeclaration
  ) {
    return true;
  }

  // Arrow/FunctionExpression assigned to a VariableDeclarator:
  //   VariableDeclarator → VariableDeclaration → ExportNamedDeclaration
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    const varDecl = parent.parent; // VariableDeclaration
    if (!varDecl) return false;
    const varDeclParent = varDecl.parent; // possible ExportNamedDeclaration
    if (
      varDeclParent &&
      (varDeclParent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
        varDeclParent.type === AST_NODE_TYPES.ExportDefaultDeclaration)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Walks a scope chain upward from `scope` (inclusive) and reports whether
 * `targetName` is bound anywhere between `scope` and `stopScope` (inclusive).
 * Mirrors how the engine resolves an identifier at a use site: the first scope
 * on the chain that declares the name wins. Used to detect whether a rewritten
 * reference would be captured by a binding sitting between it and the
 * declaration it currently resolves to.
 */
function isNameBoundInChain(
  scope: TSESLint.Scope.Scope | null,
  stopScope: TSESLint.Scope.Scope | null,
  targetName: string,
): boolean {
  let current: TSESLint.Scope.Scope | null = scope;
  while (current) {
    if (current.set.has(targetName)) {
      return true;
    }
    if (current === stopScope) {
      break;
    }
    current = current.upper;
  }
  return false;
}

/**
 * Walks a scope subtree rooted at `root` and reports whether `targetName` is
 * declared anywhere within it — the renamed function's own parameters and body
 * bindings. A `suggestion` binding here would shadow the function's new name
 * (the self-shadowing trap in #1278).
 */
function isNameBoundInSubtree(
  root: TSESLint.Scope.Scope,
  targetName: string,
): boolean {
  const stack: TSESLint.Scope.Scope[] = [root];
  while (stack.length > 0) {
    const scope = stack.pop() as TSESLint.Scope.Scope;
    if (scope.set.has(targetName)) {
      return true;
    }
    for (const child of scope.childScopes) {
      stack.push(child);
    }
  }
  return false;
}

type MessageIds = 'unnecessaryVerbSuffix';

export const noUnnecessaryVerbSuffix = createRule<[], MessageIds>({
  name: 'no-unnecessary-verb-suffix',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prevent unnecessary verb suffixes in function and method names',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      unnecessaryVerbSuffix:
        'Function name "{{name}}" ends with verb suffix "{{suffix}}" that does not add meaning beyond its parameters. Redundant verb-preposition endings make call sites harder to scan and hide the primary action. Rename to "{{suggestion}}" so the name stays action-oriented while arguments express the relationship.',
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Returns true when renaming the symbol to `suggestion` would collide with
     * an existing binding in any scope the rename touches, making the autofix
     * semantics-changing (and thus unsafe). The strip-suffix fix rewrites the
     * declaration plus every in-file reference to `suggestion`; if `suggestion`
     * already resolves to a different binding the rewrite would:
     *   - redeclare a name already bound in the declaration scope,
     *   - capture a call site onto an intervening binding (e.g. turning
     *     `const line = lineAt(...)` into the TDZ self-reference
     *     `const line = line(...)`, #1278), or
     *   - shadow the function's own new name from inside its body.
     * In every such case the fix is suppressed (report-only) so the developer
     * picks a non-colliding name — the safety standard core rename fixers hold.
     */
    function renameWouldCollide(
      functionNode: TSESTree.Node,
      variable: TSESLint.Scope.Variable | null,
      suggestion: string,
    ): boolean {
      const scopeManager = context.sourceCode.scopeManager;
      const functionScope = scopeManager?.acquire(functionNode) ?? null;
      const declarationScope = variable?.scope ?? functionScope?.upper ?? null;

      // (1) Declaration site: a `suggestion` already bound in the scope that
      //     holds the declaration would make the rename a redeclaration/shadow.
      if (declarationScope?.set.has(suggestion)) {
        return true;
      }

      // (2) Reference sites: a binding sitting between a reference and the
      //     declaration scope would swallow the rewritten identifier — the
      //     reference would resolve to that binding instead of the function.
      if (variable && declarationScope) {
        for (const ref of variable.references) {
          const referenceScope = ref.from ?? declarationScope;
          if (
            isNameBoundInChain(referenceScope, declarationScope, suggestion)
          ) {
            return true;
          }
        }
      }

      // (3) The function's own parameters/body: a `suggestion` binding there
      //     would shadow the function's new name.
      if (functionScope && isNameBoundInSubtree(functionScope, suggestion)) {
        return true;
      }

      return false;
    }

    function checkFunctionName(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
      name: string | null,
      /**
       * The AST node that holds the identifier being renamed.
       * For FunctionDeclaration this is `node.id`; for VariableDeclarator
       * assigned arrows it is `declarator.id`; for Property/MethodDefinition
       * it is the key node. Passing it explicitly avoids re-deriving it inside
       * the fixer and allows the reference-rename loop to skip it cleanly.
       */
      declarationIdNode: TSESTree.Node | null,
      /**
       * The AST node whose declared variables the scope manager tracks.
       * For FunctionDeclaration this is `node` itself; for a VariableDeclarator
       * arrow it is the VariableDeclarator; for methods/properties it is null
       * because member references are not in scope (resolved via `this.x`).
       */
      scopeNode: TSESTree.Node | null,
      /**
       * Whether the symbol is exported. When true, the fix is suppressed so we
       * don't produce broken cross-file renames.
       */
      exported: boolean,
    ): void {
      if (!name) return;

      for (const suffix of COMMON_PREPOSITION_SUFFIXES) {
        // Check if the name ends with the suffix
        if (name.endsWith(suffix)) {
          // Make sure there's a verb before the suffix (camelCase format)
          // This regex checks for a verb pattern before the suffix
          // It looks for a word character followed by lowercase letters before the suffix
          const verbBeforeSuffixPattern = new RegExp(`\\w[a-z]+${suffix}$`);

          if (verbBeforeSuffixPattern.test(name)) {
            const suggestion = name.substring(0, name.length - suffix.length);

            // Skip if the suggestion would be empty or just a single character
            if (suggestion.length <= 1) continue;

            // Skip phrasal-verb endings (e.g. past-participle adjectives
            // "signedIn"/"loggedOut" or compound phrasal verbs "signIn"/
            // "logOut"): the trailing particle fuses with its verb, so stripping
            // it ("signed", "sign") destroys the meaning. The pre-particle word
            // must be a known phrasal verb, so noun-object endings like
            // "loadEmbedIn"/"isWidgetIn" remain flagged.
            if (isPhrasalVerbEnding(name, suffix)) continue;

            context.report({
              node,
              messageId: 'unnecessaryVerbSuffix',
              data: {
                name,
                suffix,
                suggestion,
              },
              fix(fixer) {
                // An autofix here is only reference-safe when the fixer can
                // rename EVERY use of the symbol, not just its declaration —
                // otherwise call sites are orphaned and produce a ReferenceError
                // (#1256). Two cases make that impossible, so the fix is
                // suppressed (report only, no `--fix` change):
                //
                //  1. Exported symbols — a single-file fixer cannot reach
                //     cross-file import references.
                //  2. Member-accessed symbols (class methods, object-literal
                //     properties, interface method signatures) — their call
                //     sites are member expressions (`this.x()`, `obj.x()`) that
                //     the scope manager does not track as variable references,
                //     so they cannot be found and renamed syntactically.
                //     `scopeNode` is null for exactly these declarations.
                if (exported || !scopeNode || !declarationIdNode) {
                  return null;
                }

                // Note: context.getDeclaredVariables is the API available in the
                // pinned @typescript-eslint version (the SourceCode-based
                // replacement is not yet in these type definitions).
                // getDeclaredVariables returns ALL variables the node declares
                // (e.g. for a FunctionDeclaration it includes the function name
                // variable AND its parameter variables). Pick the one whose name
                // matches the symbol being renamed so we only follow references
                // to the name, not parameters.
                const declaredVars = context.getDeclaredVariables(scopeNode);
                const targetVariable =
                  declaredVars.find((variable) => variable.name === name) ??
                  null;

                // Suppress the fix when the suggested name already binds
                // something in a scope the rename would touch — a rename fixer
                // must never change program semantics or break compilation
                // (#1278).
                if (renameWouldCollide(node, targetVariable, suggestion)) {
                  return null;
                }

                // Scope-tracked symbols (FunctionDeclaration, VariableDeclarator
                // arrows/functions, named FunctionExpression): rename the
                // declaration identifier and every in-file reference together so
                // no call site is left pointing at the old name.
                const fixes = [
                  fixer.replaceText(declarationIdNode, suggestion),
                ];
                if (targetVariable) {
                  for (const ref of targetVariable.references) {
                    // Skip the declaration identifier itself — already handled.
                    if (ref.identifier === declarationIdNode) continue;
                    fixes.push(fixer.replaceText(ref.identifier, suggestion));
                  }
                }

                return fixes;
              },
            });
          }
        }
      }
    }

    return {
      FunctionDeclaration(node): void {
        if (node.id) {
          checkFunctionName(
            node,
            node.id.name,
            node.id,
            node,
            isExported(node),
          );
        }
      },
      VariableDeclarator(node): void {
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          (node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.init?.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          checkFunctionName(
            node.init,
            node.id.name,
            node.id,
            node,
            isExported(node.init),
          );
        }
      },
      MethodDefinition(node): void {
        if (node.key.type === AST_NODE_TYPES.Identifier) {
          // Class methods are called via member expressions (`this.method()`,
          // `instance.method()`) that the scope manager does not track as
          // references. A syntactic single-file fixer therefore cannot find and
          // rename those call sites, so renaming the method would orphan them
          // (#1256). Pass null for both the rename target and scopeNode so the
          // violation is still reported but no unsafe fix is offered.
          checkFunctionName(
            node.value as TSESTree.FunctionExpression,
            node.key.name,
            null,
            null,
            false,
          );
        }
      },
      TSMethodSignature(node): void {
        // Interface method signatures have their implementations and call sites
        // elsewhere (member accesses on implementers), unreachable from this
        // declaration. Report only — never offer a rename fix.
        if (node.key.type === AST_NODE_TYPES.Identifier) {
          checkFunctionName(
            node as unknown as TSESTree.FunctionExpression,
            node.key.name,
            null,
            null,
            false,
          );
        }
      },
      Property(node): void {
        if (
          node.key.type === AST_NODE_TYPES.Identifier &&
          (node.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.value.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          // Object-literal method properties are accessed via member expressions
          // (`obj.method()`) the scope manager does not track. As with class
          // methods, the fix is suppressed to avoid orphaning call sites.
          checkFunctionName(node.value, node.key.name, null, null, false);
        }
      },
      FunctionExpression(node): void {
        // Handle named function expressions
        if (node.id) {
          checkFunctionName(
            node,
            node.id.name,
            node.id,
            node,
            isExported(node),
          );
        }
      },
    };
  },
});
