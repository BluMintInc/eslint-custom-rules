import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import {
  createSuppressionChecker,
  SuppressionChecker,
} from '../utils/disableDirectives';

type Options = [
  {
    allowComplexBodies?: boolean;
    allowFunctionFactories?: boolean;
  },
];
type MessageIds = 'preferUseCallback';

type Candidate = {
  node: TSESTree.CallExpression;
  scope: TSESLint.Scope.Scope;
};

type ImportBinding = {
  variable: TSESLint.Scope.Variable;
  specifier: TSESTree.ImportSpecifier;
  declaration: TSESTree.ImportDeclaration;
};

type ConversionPlan = {
  /** Identifier to emit at the converted call site (honors an existing alias). */
  calleeName: string;
  fixable: Set<TSESTree.CallExpression>;
  /** The single conversion that also carries the import rewrite. */
  importOwner: TSESTree.CallExpression | null;
  importFixes: (fixer: TSESLint.RuleFixer) => TSESLint.RuleFix[];
};

export const preferUseCallbackOverUseMemoForFunctions = createRule<
  Options,
  MessageIds
>({
  name: 'prefer-usecallback-over-usememo-for-functions',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using useCallback instead of useMemo for memoizing functions',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowComplexBodies: {
            type: 'boolean',
            default: true,
          },
          allowFunctionFactories: {
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferUseCallback:
        'useMemo returns {{callbackDescription}}, which hides that you are memoizing a callback. useCallback is built to keep function identities stable and signals intent to other hook consumers. Replace useMemo with useCallback and keep the same dependency array so props relying on stable references do not re-render unnecessarily.',
    },
  },
  defaultOptions: [{ allowComplexBodies: false, allowFunctionFactories: true }],
  create(context) {
    const options = context.options[0] || {
      allowComplexBodies: false,
      allowFunctionFactories: true,
    };

    /**
     * Checks if a node is a function factory (returns an object with functions or a function that generates functions)
     */
    function isFunctionFactory(node) {
      // If we're not checking for function factories, return false
      if (!options.allowFunctionFactories) {
        return false;
      }

      // For arrow functions with implicit return
      if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
        // Check if it's returning an object literal
        if (node.body.type === AST_NODE_TYPES.ObjectExpression) {
          // Check if any property in the object is a function
          return node.body.properties.some((prop) => {
            if (prop.type === AST_NODE_TYPES.Property) {
              const value = prop.value;
              return (
                value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                value.type === AST_NODE_TYPES.FunctionExpression
              );
            }
            return false;
          });
        }
        return false;
      }

      // For arrow functions with block body
      if (
        node.body.body.length === 1 &&
        node.body.body[0].type === AST_NODE_TYPES.ReturnStatement &&
        node.body.body[0].argument
      ) {
        const returnValue = node.body.body[0].argument;

        // Check if returning an object literal with functions
        if (returnValue.type === AST_NODE_TYPES.ObjectExpression) {
          return returnValue.properties.some((prop) => {
            if (prop.type === AST_NODE_TYPES.Property) {
              const value = prop.value;
              return (
                value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                value.type === AST_NODE_TYPES.FunctionExpression
              );
            }
            return false;
          });
        }
      }

      return false;
    }

    /**
     * Checks if a function body is complex (more than one statement before returning)
     */
    function hasComplexBody(node) {
      if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
        return false;
      }

      // If there's more than one statement, or the single statement isn't a return
      if (
        node.body.body.length > 1 ||
        (node.body.body.length === 1 &&
          node.body.body[0].type !== AST_NODE_TYPES.ReturnStatement)
      ) {
        return true;
      }

      return false;
    }

    /**
     * Checks if a node returns a function
     */
    function returnsFunction(node) {
      // For arrow functions with implicit return
      if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
        return (
          node.body.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.body.type === AST_NODE_TYPES.FunctionExpression
        );
      }

      // For arrow functions with block body
      if (
        node.body.body.length === 1 &&
        node.body.body[0].type === AST_NODE_TYPES.ReturnStatement &&
        node.body.body[0].argument
      ) {
        const returnValue = node.body.body[0].argument;
        return (
          returnValue.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          returnValue.type === AST_NODE_TYPES.FunctionExpression
        );
      }

      return false;
    }

    // Reporting is deferred to Program:exit because the import rewrite depends on
    // knowing every conversion in the file: useMemo may only be dropped from the
    // import when no reference to it survives the fixes.
    const candidates: Candidate[] = [];

    /**
     * A suppressed report is discarded together with its fix, yet its
     * `useMemo(...)` call stays in the file. Both halves of the import rewrite
     * therefore hinge on suppression: the rename must not ride on a violation
     * that disappears, and it must not retire a specifier a suppressed call
     * still resolves to.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    return {
      CallExpression(node) {
        // Check if the call is to useMemo
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'useMemo' &&
          node.arguments.length > 0
        ) {
          const callback = node.arguments[0];

          // Check if the callback is an arrow function or function expression
          if (
            (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              callback.type === AST_NODE_TYPES.FunctionExpression) &&
            callback.body
          ) {
            // Skip if it's a function factory and we're allowing those
            if (isFunctionFactory(callback)) {
              return;
            }

            // Skip if it has a complex body and we're allowing those
            if (hasComplexBody(callback) && options.allowComplexBodies) {
              return;
            }

            // Check if it returns a function
            if (returnsFunction(callback)) {
              candidates.push({ node, scope: context.getScope() });
            }
          }
        }
      },
      'Program:exit'() {
        if (candidates.length === 0) {
          return;
        }
        const plan = planConversion(context, candidates, isReportSuppressed);
        for (const candidate of candidates) {
          reportAndFix(candidate.node, context, plan);
        }
      },
    };
  },
});

function resolveVariable(
  scope: TSESLint.Scope.Scope | null,
  name: string,
): TSESLint.Scope.Variable | null {
  let current = scope;
  while (current) {
    const found = current.variables.find((variable) => variable.name === name);
    if (found) {
      return found;
    }
    current = current.upper;
  }
  return null;
}

/**
 * Narrows a binding to a value import written with braces, which is the only
 * shape whose specifier list can be rewritten safely.
 */
function toImportBinding(
  variable: TSESLint.Scope.Variable | null,
): ImportBinding | null {
  if (!variable) {
    return null;
  }
  for (const def of variable.defs) {
    if (def.type !== 'ImportBinding') {
      continue;
    }
    const specifier = def.node;
    if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) {
      continue;
    }
    const declaration = def.parent;
    if (
      !declaration ||
      declaration.type !== AST_NODE_TYPES.ImportDeclaration ||
      declaration.importKind === 'type' ||
      specifier.importKind === 'type'
    ) {
      continue;
    }
    return { variable, specifier, declaration };
  }
  return null;
}

function findImportedSpecifier(
  program: TSESTree.Program,
  importedName: string,
): TSESTree.ImportSpecifier | null {
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      statement.importKind === 'type'
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.importKind !== 'type' &&
        specifier.imported.type === AST_NODE_TYPES.Identifier &&
        specifier.imported.name === importedName
      ) {
        return specifier;
      }
    }
  }
  return null;
}

function removeImportSpecifierFixes(
  sourceCode: TSESLint.SourceCode,
  fixer: TSESLint.RuleFixer,
  binding: ImportBinding,
): TSESLint.RuleFix[] {
  const { specifier, declaration } = binding;

  if (declaration.specifiers.length === 1) {
    // Dropping the sole specifier leaves a side-effect import, so the whole
    // statement goes, along with the line break it occupied.
    const text = sourceCode.getText();
    let end = declaration.range[1];
    while (end < text.length && (text[end] === ' ' || text[end] === '\t')) {
      end += 1;
    }
    if (text[end] === '\r') {
      end += 1;
    }
    if (text[end] === '\n') {
      end += 1;
    }
    return [fixer.removeRange([declaration.range[0], end])];
  }

  const namedCount = declaration.specifiers.filter(
    (candidate) => candidate.type === AST_NODE_TYPES.ImportSpecifier,
  ).length;
  const openBrace = sourceCode.getTokenBefore(specifier);
  if (namedCount === 1 && openBrace && openBrace.value === '{') {
    // Dropping the only named specifier would leave `import React, {} from ...`,
    // so the brace group goes with it.
    const closeBrace = sourceCode.getTokenAfter(specifier, {
      filter: (token) => token.value === '}',
    });
    const beforeBrace = sourceCode.getTokenBefore(openBrace);
    if (closeBrace && beforeBrace && beforeBrace.value === ',') {
      return [fixer.removeRange([beforeBrace.range[0], closeBrace.range[1]])];
    }
  }

  const tokenAfter = sourceCode.getTokenAfter(specifier);
  if (tokenAfter && tokenAfter.value === ',') {
    const tokenAfterComma = sourceCode.getTokenAfter(tokenAfter);
    const end =
      tokenAfterComma && tokenAfterComma.value !== '}'
        ? tokenAfterComma.range[0]
        : tokenAfter.range[1];
    return [fixer.removeRange([specifier.range[0], end])];
  }

  const tokenBefore = sourceCode.getTokenBefore(specifier);
  if (tokenBefore && tokenBefore.value === ',') {
    return [fixer.removeRange([tokenBefore.range[0], specifier.range[1]])];
  }

  return [fixer.remove(specifier)];
}

/**
 * Works out which conversions can be autofixed and how the import list must
 * change so the emitted useCallback resolves and useMemo is not left dangling.
 */
function planConversion(
  context: TSESLint.RuleContext<MessageIds, Options>,
  candidates: Candidate[],
  isReportSuppressed: SuppressionChecker,
): ConversionPlan {
  const sourceCode = context.getSourceCode();
  const program = sourceCode.ast;

  const existingUseCallback = findImportedSpecifier(program, 'useCallback');
  const calleeName = existingUseCallback
    ? existingUseCallback.local.name
    : 'useCallback';

  // A local binding of the target name would capture the emitted call, so those
  // conversions are reported without a fix rather than silently miscompiled.
  // A suppressed violation is skipped for the same reason it is skipped for the
  // import: ESLint drops its fix, so treating it as unfixable keeps the plan
  // honest about which useMemo calls actually go away.
  const fixableCandidates = candidates.filter((candidate) => {
    if (isReportSuppressed(candidate.node)) {
      return false;
    }
    const bound = resolveVariable(candidate.scope, calleeName);
    if (!existingUseCallback) {
      return bound === null;
    }
    return (
      bound !== null &&
      bound.defs.some((def) => def.node === existingUseCallback)
    );
  });

  const fixable = new Set(fixableCandidates.map((candidate) => candidate.node));
  const emptyPlan: ConversionPlan = {
    calleeName,
    fixable,
    importOwner: null,
    importFixes: () => [],
  };

  if (fixableCandidates.length === 0) {
    return emptyPlan;
  }

  const useMemoBinding = fixableCandidates.reduce<ImportBinding | null>(
    (found, candidate) =>
      found ??
      toImportBinding(
        resolveVariable(
          candidate.scope,
          (candidate.node.callee as TSESTree.Identifier).name,
        ),
      ),
    null,
  );

  // Without an imported useMemo there is no import to migrate: the file either
  // relies on a global or on a local binding this rule must not touch.
  if (!useMemoBinding) {
    return emptyPlan;
  }

  const convertedReferences = new Set<TSESTree.Node>(
    fixableCandidates
      .filter(
        (candidate) =>
          toImportBinding(
            resolveVariable(
              candidate.scope,
              (candidate.node.callee as TSESTree.Identifier).name,
            ),
          )?.variable === useMemoBinding.variable,
      )
      .map((candidate) => candidate.node.callee),
  );

  // Every reference the fixes do not rewrite still needs the specifier: a plain
  // value memo, a bare `useMemo` mention, a conversion blocked by shadowing, or
  // the call behind a disable directive. Any one of them turns the rename into
  // a plain insertion of useCallback beside useMemo.
  const useMemoSurvives = useMemoBinding.variable.references.some(
    (reference) => !convertedReferences.has(reference.identifier),
  );

  const shouldAdd = existingUseCallback === null;
  const shouldRemove = !useMemoSurvives;

  if (!shouldAdd && !shouldRemove) {
    return emptyPlan;
  }

  return {
    calleeName,
    fixable,
    // The carrier is the first violation whose fix actually survives, so a
    // suppressed leading violation cannot take the import edit down with it.
    importOwner: fixableCandidates[0].node,
    importFixes: (fixer) => {
      if (shouldAdd && shouldRemove) {
        return [fixer.replaceText(useMemoBinding.specifier, calleeName)];
      }
      if (shouldAdd) {
        return [
          fixer.insertTextAfter(useMemoBinding.specifier, `, ${calleeName}`),
        ];
      }
      return removeImportSpecifierFixes(sourceCode, fixer, useMemoBinding);
    },
  };
}

function getMemoizedFunctionDescription(node) {
  const parent = node.parent;

  if (
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return `the callback "${parent.id.name}"`;
  }

  if (
    parent?.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.left.type === AST_NODE_TYPES.Identifier
  ) {
    return `the callback "${parent.left.name}"`;
  }

  if (
    parent?.type === AST_NODE_TYPES.Property &&
    parent.key.type === AST_NODE_TYPES.Identifier
  ) {
    return `the "${parent.key.name}" property callback`;
  }

  if (
    parent?.type === AST_NODE_TYPES.JSXExpressionContainer &&
    parent.parent?.type === AST_NODE_TYPES.JSXAttribute &&
    parent.parent.name.type === AST_NODE_TYPES.JSXIdentifier
  ) {
    return `the "${parent.parent.name.name}" prop callback`;
  }

  return 'this callback value';
}

function reportAndFix(node, context, plan: ConversionPlan) {
  const sourceCode = context.sourceCode;
  const useMemoCallback = node.arguments[0];
  const dependencyArray = node.arguments[1]
    ? sourceCode.getText(node.arguments[1])
    : '[]';

  // Get the returned function from useMemo
  let returnedFunction;
  if (useMemoCallback.body.type === AST_NODE_TYPES.BlockStatement) {
    // For block body arrow functions or function expressions
    const returnStatement = useMemoCallback.body.body[0];
    returnedFunction = returnStatement.argument;
  } else {
    // For implicit return arrow functions
    returnedFunction = useMemoCallback.body;
  }

  // Create the useCallback replacement
  const returnedFunctionText = sourceCode.getText(returnedFunction);

  // Check if useMemo has TypeScript generic type parameters
  const hasTypeParameters = node.typeParameters !== undefined;
  const typeParametersText = hasTypeParameters
    ? sourceCode.getText(node.typeParameters)
    : '';

  const callbackDescription = getMemoizedFunctionDescription(node);

  context.report({
    node,
    messageId: 'preferUseCallback',
    data: { callbackDescription },
    fix: plan.fixable.has(node)
      ? (fixer: TSESLint.RuleFixer) => {
          const fixes: TSESLint.RuleFix[] = [
            fixer.replaceText(
              node,
              `${plan.calleeName}${typeParametersText}(${returnedFunctionText}, ${dependencyArray})`,
            ),
          ];
          // Only one conversion carries the import rewrite so the fixes of
          // sibling conversions never overlap.
          if (plan.importOwner === node) {
            fixes.push(...plan.importFixes(fixer));
          }
          return fixes;
        }
      : undefined,
  });
}

export default preferUseCallbackOverUseMemoForFunctions;
