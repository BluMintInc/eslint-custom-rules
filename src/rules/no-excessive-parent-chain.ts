import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import {
  TextRange,
  nameOccursOutside,
  orphanedBindings,
  removalRuns,
  statementRemovalRange,
} from '../utils/importRemoval';
import {
  isFreestandingStatement,
  planPatternBindingRemoval,
} from '../utils/patternBindingRemoval';

type MessageIds = 'excessiveParentChain';
type Options = [{ max?: number }];

/**
 * How many times the cleanup below re-asks which bindings its own deletions have
 * stranded. Each round deletes at least one declaration, so a handler would have
 * to chain more re-destructures than this to run out — and running out declines
 * rather than shipping half a cleanup.
 */
const MAX_CLEANUP_ROUNDS = 8;

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left[0] < right[1] && right[0] < left[1];
}

/**
 * Whether an initializer is a plain read, so that deleting the declarator
 * deletes no work the file depends on. A call, an `await` or a computed access
 * could be doing something the surviving code still needs; a property read off
 * an identifier is the same risk the destructuring arm already accepts, since
 * `const { data } = event` throws on a nullish `event` exactly as `event.data`
 * does.
 */
function isPureRead(node: TSESTree.Node): boolean {
  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.ThisExpression:
      return true;
    case AST_NODE_TYPES.ChainExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSAsExpression:
      return isPureRead(node.expression);
    case AST_NODE_TYPES.MemberExpression:
      return !node.computed && isPureRead(node.object);
    default:
      return false;
  }
}

/** The declarator a binding comes from, when exactly one declares it. */
function declaratorOf(
  variable: TSESLint.Scope.Variable,
): TSESTree.VariableDeclarator | null {
  if (variable.defs.length !== 1) return null;
  const [definition] = variable.defs;
  if (definition.type !== TSESLint.Scope.DefinitionType.Variable) return null;
  return definition.node;
}

/**
 * A parameter is part of its function's signature, so a rewrite of a read inside
 * the body has no license to change it. Left in place rather than declined:
 * an unused parameter is legal and is what `args: 'none'` already permits.
 */
function isParameterBinding(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every(
      (definition) =>
        definition.type === TSESLint.Scope.DefinitionType.Parameter,
    )
  );
}

// Maximum number of consecutive .parent calls allowed before warning
const DEFAULT_MAX_PARENT_CHAIN_LENGTH = 2;

// Handler types that this rule applies to
const HANDLER_TYPES = new Set([
  'DocumentChangeHandler',
  'DocumentChangeHandlerTransaction',
  'RealtimeDbChangeHandler',
  'RealtimeDbChangeHandlerTransaction',
]);

export const noExcessiveParentChain = createRule<Options, MessageIds>({
  name: 'no-excessive-parent-chain',
  meta: {
    type: 'suggestion',
    hasSuggestions: true,
    docs: {
      description:
        'Discourage excessive use of the ref.parent property chain in Firestore and RealtimeDB change handlers',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: {
            type: 'integer',
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      excessiveParentChain:
        'Found {{count}} consecutive ref.parent hops in this handler. Long parent chains break when Firestore/RealtimeDB paths change and bypass the typed params the trigger already provides. Read path components from event.params (for example, params.userId) instead of walking ref.parent repeatedly.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const maxParentChainLength =
      context.options[0]?.max ?? DEFAULT_MAX_PARENT_CHAIN_LENGTH;
    const sourceCode = context.getSourceCode();

    // Track variables that contain event data
    const eventDataVariables = new Map<string, string>();
    const eventIdentifiers = new Set<string>();
    const HANDLER_PARAM_SOURCE = '__handler_param__';

    const recordEventIdentifier = (name: string) => {
      eventIdentifiers.add(name);
    };

    const getRootIdentifier = (
      node: TSESTree.MemberExpression,
    ): string | null => {
      let current: TSESTree.Node = node;
      while (current.type === AST_NODE_TYPES.MemberExpression) {
        current = current.object;
      }
      return current.type === AST_NODE_TYPES.Identifier ? current.name : null;
    };

    // Suggestions rewrite the chain as `<event>.params`, so the event binding has
    // to be resolved back to a real identifier. Handler parameters destructured
    // in place (`async ({ data: change }) => ...`) have no such identifier and
    // resolve to null so the report can decline to suggest rather than guess.
    const resolveEventParamName = (rootIdentifier: string): string | null => {
      if (
        eventIdentifiers.has(rootIdentifier) &&
        rootIdentifier !== HANDLER_PARAM_SOURCE
      ) {
        return rootIdentifier;
      }

      const source = eventDataVariables.get(rootIdentifier);
      if (!source || source === HANDLER_PARAM_SOURCE) {
        return null;
      }

      return source;
    };

    // Every hop of a chain is reported separately, so an inner report's fix must
    // still span the outermost hop. Replacing only the reported slice leaves a
    // dangling hop behind (for example `event.params.parent.id`).
    const getOutermostParentHop = (
      node: TSESTree.MemberExpression,
    ): TSESTree.MemberExpression => {
      let outermost = node;
      let ancestor = outermost.parent;
      while (
        ancestor?.type === AST_NODE_TYPES.MemberExpression &&
        ancestor.object === outermost &&
        ancestor.property.type === AST_NODE_TYPES.Identifier &&
        ancestor.property.name === 'parent'
      ) {
        outermost = ancestor;
        ancestor = outermost.parent;
      }
      return outermost;
    };

    /**
     * The binding a name denotes at the point the suggestion writes it, resolved
     * through the scope chain rather than matched by text: a shadowing local
     * carrying the same spelling as the event binding is a different binding, and
     * mistaking one for the other is how a fixer came to rewrite an import the
     * reported call never resolved to (#1903).
     */
    const resolveInScope = (
      scope: TSESLint.Scope.Scope | null,
      name: string,
    ): TSESLint.Scope.Variable | null => {
      for (let current = scope; current; current = current.upper) {
        const variable = current.variables.find(
          (candidate) => candidate.name === name,
        );
        if (variable) return variable;
      }
      return null;
    };

    /**
     * The coarse second opinion the destructuring planner takes, for the bindings
     * it does not own. Scope analysis and a plain name scan can disagree, and a
     * removal that turns out to be wrong deletes working code. The scan is
     * windowed to the scope that declares the binding, since an occurrence of a
     * function-local name outside that function belongs to another binding.
     */
    const nameSurvivesRemoval = (
      variable: TSESLint.Scope.Variable,
      ranges: readonly TextRange[],
    ): boolean => {
      const scope = variable.scope.block.range;
      const elsewhere: TextRange[] = [
        [0, scope[0]],
        [scope[1], sourceCode.text.length],
      ];
      return nameOccursOutside(
        sourceCode,
        variable.name,
        [...ranges, ...elsewhere],
        variable.identifiers.map((identifier) => identifier.range),
      );
    };

    /**
     * The ranges that unbind `variables` declared by a plain `const x = ...`, or
     * `null` when any of them cannot be unbound safely.
     *
     * The destructuring counterpart lives in `planPatternBindingRemoval`; this
     * arm exists because a chain roots just as often at an intermediate read
     * (`const afterRef = change.after`) as at a destructured property.
     */
    const planIdentifierBindingRemoval = (
      variables: readonly TSESLint.Scope.Variable[],
      removed: readonly TextRange[],
    ): TextRange[] | null => {
      const byDeclaration = new Map<
        TSESTree.VariableDeclaration,
        Set<TSESTree.VariableDeclarator>
      >();

      for (const variable of variables) {
        const declarator = declaratorOf(variable);
        if (!declarator || declarator.id.type !== AST_NODE_TYPES.Identifier) {
          return null;
        }

        const declaration = declarator.parent;
        if (
          !declaration ||
          declaration.type !== AST_NODE_TYPES.VariableDeclaration
        ) {
          return null;
        }

        // `const` is what makes "nothing reads it" the whole story: a `let` can
        // be assigned from anywhere its scope reaches, and an assignment is not
        // a read.
        if (declaration.kind !== 'const' || declaration.declare) return null;
        // The ranges below span separators, so a comment among the declarators
        // would be swallowed or stranded depending on where it sits.
        if (sourceCode.getCommentsInside(declaration).length > 0) return null;
        if (!declarator.init || !isPureRead(declarator.init)) return null;

        const group = byDeclaration.get(declaration);
        if (group) {
          group.add(declarator);
        } else {
          byDeclaration.set(declaration, new Set([declarator]));
        }
      }

      const ranges: TextRange[] = [];
      for (const [declaration, dropped] of byDeclaration) {
        const siblings = declaration.declarations;
        if (siblings.some((sibling) => !dropped.has(sibling))) {
          const runs = removalRuns(
            siblings.map((sibling) => ({
              range: sibling.range,
              removed: dropped.has(sibling),
            })),
          );
          if (!runs) return null;
          ranges.push(...runs);
          continue;
        }

        if (!isFreestandingStatement(declaration)) return null;
        const range = statementRemovalRange(sourceCode, declaration);
        if (!range) return null;
        ranges.push(range);
      }

      for (const variable of variables) {
        if (nameSurvivesRemoval(variable, [...removed, ...ranges])) return null;
      }

      return ranges;
    };

    /**
     * The extra ranges the suggestion must delete so that replacing the chain
     * leaves no binding bound to nothing, `[]` when the rewrite strands nothing,
     * or `null` when something would be stranded that cannot be unbound safely.
     *
     * `null` withholds the whole suggestion. Rewriting anyway would trade this
     * rule's report for a `no-unused-vars` one on a file that was clean, and
     * since accepting the suggestion resolves the report, nothing revisits the
     * debt (#2026).
     *
     * Deleting a declaration strands whatever that declaration READ, so the
     * question is re-asked until it settles: `const { after } = change` goes
     * first, and only then is `const { data: change } = event` unreferenced. The
     * binding the replacement text itself names is exempt throughout — the
     * inserted `event.params` is a reference the source does not yet contain, so
     * scope analysis alone would read the event binding as stranded.
     */
    const planOrphanCleanup = (
      chainRange: TextRange,
      eventVariable: TSESLint.Scope.Variable | null,
    ): TextRange[] | null => {
      const removed: TextRange[] = [chainRange];
      const extra: TextRange[] = [];
      const handled = new Set<TSESLint.Scope.Variable>();

      for (let round = 0; round < MAX_CLEANUP_ROUNDS; round++) {
        const orphans = orphanedBindings(sourceCode, removed).filter(
          (variable) =>
            variable !== eventVariable &&
            !handled.has(variable) &&
            !isParameterBinding(variable),
        );
        if (orphans.length === 0) {
          return extra.sort((left, right) => left[0] - right[0]);
        }

        const patterns: TSESLint.Scope.Variable[] = [];
        const identifiers: TSESLint.Scope.Variable[] = [];
        for (const variable of orphans) {
          handled.add(variable);
          const declarator = declaratorOf(variable);
          // An orphan bound by an import, a type alias or anything else this
          // rule cannot rewrite declines rather than being guessed at.
          if (!declarator) return null;
          if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) {
            patterns.push(variable);
          } else if (declarator.id.type === AST_NODE_TYPES.Identifier) {
            identifiers.push(variable);
          } else {
            return null;
          }
        }

        const planned: TextRange[] = [];
        if (patterns.length > 0) {
          const plan = planPatternBindingRemoval(sourceCode, patterns, removed);
          if (!plan) return null;
          planned.push(...plan);
        }
        if (identifiers.length > 0) {
          const plan = planIdentifierBindingRemoval(identifiers, removed);
          if (!plan) return null;
          planned.push(...plan);
        }
        if (planned.length === 0) return null;

        extra.push(...planned);
        removed.push(...planned);
      }

      return null;
    };

    /**
     * The edits of the suggestion, or `null` to withdraw it. ESLint drops a
     * suggestion whose fix yields nothing, which is how the unsafe cases above
     * decline.
     */
    const buildSuggestionFixes = (
      fixer: TSESLint.RuleFixer,
      outermost: TSESTree.MemberExpression,
      eventParamName: string,
      eventVariable: TSESLint.Scope.Variable | null,
    ): TSESLint.RuleFix[] | null => {
      const cleanup = planOrphanCleanup(outermost.range, eventVariable);
      if (!cleanup) return null;

      // ESLint throws out the whole report when one fix's ranges overlap, so a
      // cleanup that collides with the rewrite (or with itself) is withheld
      // rather than allowed to take the pass down with it.
      const ranges = [outermost.range as TextRange, ...cleanup];
      const collides = ranges.some((range, index) =>
        ranges.some(
          (other, otherIndex) =>
            index !== otherIndex && rangesOverlap(range, other),
        ),
      );
      if (collides) return null;

      return [
        fixer.replaceText(outermost, `${eventParamName}.params`),
        ...cleanup.map((range) => fixer.removeRange([range[0], range[1]])),
      ];
    };

    const hasRefProperty = (node: TSESTree.MemberExpression): boolean => {
      let current: TSESTree.MemberExpression | null = node;
      while (current) {
        if (
          current.property.type === AST_NODE_TYPES.Identifier &&
          current.property.name === 'ref'
        ) {
          return true;
        }
        current =
          current.object.type === AST_NODE_TYPES.MemberExpression
            ? current.object
            : null;
      }
      return false;
    };

    const registerHandlerParams = (
      node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    ) => {
      for (const param of node.params) {
        if (param.type === AST_NODE_TYPES.Identifier) {
          recordEventIdentifier(param.name);
        }

        if (param.type === AST_NODE_TYPES.ObjectPattern) {
          for (const prop of param.properties) {
            if (
              prop.type === AST_NODE_TYPES.Property &&
              prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.value.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === 'data'
            ) {
              eventDataVariables.set(prop.value.name, HANDLER_PARAM_SOURCE);
              recordEventIdentifier(HANDLER_PARAM_SOURCE);
            }
          }
        }
      }
    };

    // Check if a function is one of our handler types
    function isHandlerFunction(node: TSESTree.Node): boolean {
      if (
        node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
        node.type !== AST_NODE_TYPES.FunctionExpression
      ) {
        return false;
      }

      // Check if the function is assigned to a variable with a type annotation
      const parent = node.parent;
      if (
        parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        // Check for type annotation
        if (parent.id.typeAnnotation?.typeAnnotation) {
          const typeNode = parent.id.typeAnnotation.typeAnnotation;

          // Check if it's a reference to one of our handler types
          if (
            typeNode.type === AST_NODE_TYPES.TSTypeReference &&
            typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
            HANDLER_TYPES.has(typeNode.typeName.name)
          ) {
            return true;
          }

          // Check for generic types that might be handlers
          if (
            typeNode.type === AST_NODE_TYPES.TSTypeReference &&
            typeNode.typeName.type === AST_NODE_TYPES.Identifier
          ) {
            // Try to resolve the type name to see if it's one of our handler types
            const scope = context.getScope();
            const typeName = typeNode.typeName.name;
            const variable = scope.variables.find((v) => v.name === typeName);
            if (variable && variable.defs.length > 0) {
              const def = variable.defs[0];
              if (
                def.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
                def.node.typeAnnotation.type ===
                  AST_NODE_TYPES.TSTypeReference &&
                def.node.typeAnnotation.typeName.type ===
                  AST_NODE_TYPES.Identifier &&
                HANDLER_TYPES.has(def.node.typeAnnotation.typeName.name)
              ) {
                return true;
              }
            }
          }
        }
      }

      // Check if the function is exported with a type annotation
      if (
        parent?.type === AST_NODE_TYPES.ExportNamedDeclaration &&
        parent.declaration?.type === AST_NODE_TYPES.VariableDeclaration &&
        parent.declaration.declarations[0]?.id.type ===
          AST_NODE_TYPES.Identifier &&
        parent.declaration.declarations[0].id.typeAnnotation?.typeAnnotation
      ) {
        const typeNode =
          parent.declaration.declarations[0].id.typeAnnotation.typeAnnotation;
        if (
          typeNode.type === AST_NODE_TYPES.TSTypeReference &&
          typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
          HANDLER_TYPES.has(typeNode.typeName.name)
        ) {
          return true;
        }
      }

      return false;
    }

    // Count consecutive .parent calls in a member expression chain
    function countParentChain(node: TSESTree.MemberExpression): number {
      let count = 1; // Start with 1 for the current .parent
      let current: TSESTree.Node = node.object;

      // Traverse the chain of member expressions
      while (
        current.type === AST_NODE_TYPES.MemberExpression &&
        current.property.type === AST_NODE_TYPES.Identifier &&
        current.property.name === 'parent'
      ) {
        count++;
        current = current.object;
      }

      return count;
    }

    // This function has been removed as it's no longer needed

    return {
      // Register handler parameters to capture destructured event data
      'ArrowFunctionExpression, FunctionExpression'(
        node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
      ) {
        if (isHandlerFunction(node)) {
          registerHandlerParams(node);
        }
      },

      // Track variable assignments that contain event data
      VariableDeclarator(node) {
        if (node.id.type === AST_NODE_TYPES.Identifier && node.init) {
          // Track direct event.data assignments
          if (
            node.init.type === AST_NODE_TYPES.MemberExpression &&
            node.init.property.type === AST_NODE_TYPES.Identifier &&
            node.init.property.name === 'data' &&
            node.init.object.type === AST_NODE_TYPES.Identifier
          ) {
            // Store the variable name and the source object (event)
            eventDataVariables.set(node.id.name, node.init.object.name);
            recordEventIdentifier(node.init.object.name);
          }

          // Track assignments from other tracked variables
          if (
            node.init.type === AST_NODE_TYPES.Identifier &&
            eventDataVariables.has(node.init.name)
          ) {
            // Store the variable name with the same source as the original variable
            eventDataVariables.set(
              node.id.name,
              eventDataVariables.get(node.init.name) || '',
            );
            const source = eventDataVariables.get(node.init.name);
            if (source) {
              recordEventIdentifier(source);
            }
          }

          // Track assignments from event data properties
          if (
            node.init.type === AST_NODE_TYPES.MemberExpression &&
            node.init.object.type === AST_NODE_TYPES.Identifier &&
            eventDataVariables.has(node.init.object.name)
          ) {
            // Store the variable name with the same source as the original variable
            eventDataVariables.set(
              node.id.name,
              eventDataVariables.get(node.init.object.name) || '',
            );
            const source = eventDataVariables.get(node.init.object.name);
            if (source) {
              recordEventIdentifier(source);
            }
          }
        }

        // Also track destructuring assignments
        if (
          node.id.type === AST_NODE_TYPES.ObjectPattern &&
          node.init?.type === AST_NODE_TYPES.Identifier
        ) {
          const eventSource =
            eventDataVariables.get(node.init.name) ||
            (eventIdentifiers.has(node.init.name) ? node.init.name : null);

          for (const property of node.id.properties) {
            if (
              property.type === AST_NODE_TYPES.Property &&
              property.key.type === AST_NODE_TYPES.Identifier &&
              property.value.type === AST_NODE_TYPES.Identifier &&
              eventSource
            ) {
              const targetName = property.value.name;
              eventDataVariables.set(targetName, eventSource);
              recordEventIdentifier(eventSource);
            }
          }
        }
      },

      // Check for excessive parent chains in member expressions
      MemberExpression(node) {
        // Only check for .parent chains
        if (
          node.property.type !== AST_NODE_TYPES.Identifier ||
          node.property.name !== 'parent'
        ) {
          return;
        }

        // Count the number of consecutive .parent calls
        const parentCount = countParentChain(node);
        if (parentCount <= maxParentChainLength) {
          return;
        }

        // Check if we're in a handler function
        let current: TSESTree.Node | undefined = node;
        let inHandler = false;
        while (current) {
          if (
            current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            current.type === AST_NODE_TYPES.FunctionExpression
          ) {
            if (isHandlerFunction(current)) {
              inHandler = true;
              break;
            }
          }
          current = current.parent;
        }

        if (!inHandler) {
          return;
        }

        // Only report when the chain originates from tracked event data and contains a ref segment
        const rootIdentifier = getRootIdentifier(node);
        if (!rootIdentifier) {
          return;
        }

        if (
          !hasRefProperty(node) ||
          (!eventDataVariables.has(rootIdentifier) &&
            !eventIdentifiers.has(rootIdentifier))
        ) {
          return;
        }

        const eventParamName = resolveEventParamName(rootIdentifier);
        const eventVariable = eventParamName
          ? resolveInScope(context.getScope(), eventParamName)
          : null;

        context.report({
          node,
          messageId: 'excessiveParentChain',
          data: {
            count: parentCount,
          },
          suggest: eventParamName
            ? [
                {
                  messageId: 'excessiveParentChain',
                  data: {
                    count: parentCount,
                  },
                  fix(fixer) {
                    return buildSuggestionFixes(
                      fixer,
                      getOutermostParentHop(node),
                      eventParamName,
                      eventVariable,
                    );
                  },
                },
              ]
            : [],
        });
      },
    };
  },
});
