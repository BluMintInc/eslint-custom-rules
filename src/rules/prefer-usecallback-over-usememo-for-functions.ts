import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { reindentRelocated } from '../utils/reindentRelocated';
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

/**
 * Modules known to export React's hook set. The autofix emits a `useCallback`
 * call, so it may only run when the `useMemo` it replaces is provably React's
 * hook: that is what guarantees a `useCallback` with the same contract exists
 * for the rewritten import to bind. A `useMemo` from anywhere else is an unknown
 * function whose module need not export `useCallback` at all, so converting the
 * call would leave the emitted identifier unbound (or bound to a different
 * contract). Preact's hook entry points are included because their `useCallback`
 * is React's hook by specification, which is what makes the in-place rename of
 * their specifier sound.
 */
const REACT_HOOK_MODULES = new Set(['react', 'preact/hooks', 'preact/compat']);

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

function isReactHookModule(declaration: TSESTree.ImportDeclaration) {
  return (
    typeof declaration.source.value === 'string' &&
    REACT_HOOK_MODULES.has(declaration.source.value)
  );
}

/**
 * Narrows the callee binding to the single shape the import rewrite can vouch
 * for: `useMemo` imported by that name, as a value, from a module known to
 * export React's hooks. Anything else — a default import, a namespace member, a
 * local rebinding, `default as useMemo`, or a named import from an unfamiliar
 * module — leaves the rule unable to guarantee the emitted `useCallback`
 * resolves to React's hook, so the conversion is reported without a fix.
 */
function toReactUseMemoBinding(
  variable: TSESLint.Scope.Variable | null,
): ImportBinding | null {
  const binding = toImportBinding(variable);
  if (!binding || !isReactHookModule(binding.declaration)) {
    return null;
  }
  const { imported } = binding.specifier;
  if (
    imported.type !== AST_NODE_TYPES.Identifier ||
    imported.name !== 'useMemo'
  ) {
    return null;
  }
  return binding;
}

type ImportedSpecifier = {
  specifier: TSESTree.ImportSpecifier;
  declaration: TSESTree.ImportDeclaration;
};

function findImportedSpecifier(
  program: TSESTree.Program,
  importedName: string,
): ImportedSpecifier | null {
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
        return { specifier, declaration: statement };
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

  const useCallbackImport = findImportedSpecifier(program, 'useCallback');
  const existingUseCallback = useCallbackImport?.specifier ?? null;
  const calleeName = existingUseCallback
    ? existingUseCallback.local.name
    : 'useCallback';

  // A useCallback imported from outside the React hook set is a different
  // function: reusing its binding would change what the code calls, while adding
  // React's beside it would collide with the name already bound. Neither is a
  // safe rewrite, so no conversion in the file is fixed.
  if (useCallbackImport && !isReactHookModule(useCallbackImport.declaration)) {
    return {
      calleeName,
      fixable: new Set(),
      importOwner: null,
      importFixes: () => [],
    };
  }

  // A local binding of the target name would capture the emitted call, so those
  // conversions are reported without a fix rather than silently miscompiled.
  const emitsResolvableCallee = (scope: TSESLint.Scope.Scope) => {
    const bound = resolveVariable(scope, calleeName);
    if (!existingUseCallback) {
      return bound === null;
    }
    return (
      bound !== null &&
      bound.defs.some((def) => def.node === existingUseCallback)
    );
  };

  // Each fixable conversion is paired with the binding its callee resolves to:
  // the import rewrite hangs off that binding, and only a binding the rule can
  // vouch for makes the emitted useCallback resolvable.
  const conversions: { candidate: Candidate; useMemoBinding: ImportBinding }[] =
    [];
  for (const candidate of candidates) {
    // A suppressed violation is skipped for the same reason it is skipped for
    // the import: ESLint drops its fix, so treating it as unfixable keeps the
    // plan honest about which useMemo calls actually go away.
    if (isReportSuppressed(candidate.node)) {
      continue;
    }
    const useMemoBinding = toReactUseMemoBinding(
      resolveVariable(
        candidate.scope,
        (candidate.node.callee as TSESTree.Identifier).name,
      ),
    );
    if (!useMemoBinding || !emitsResolvableCallee(candidate.scope)) {
      continue;
    }
    conversions.push({ candidate, useMemoBinding });
  }

  const fixable = new Set(
    conversions.map((conversion) => conversion.candidate.node),
  );
  const emptyPlan: ConversionPlan = {
    calleeName,
    fixable,
    importOwner: null,
    importFixes: () => [],
  };

  if (conversions.length === 0) {
    return emptyPlan;
  }

  const { useMemoBinding } = conversions[0];

  const convertedReferences = new Set<TSESTree.Node>(
    conversions
      .filter(
        (conversion) =>
          conversion.useMemoBinding.variable === useMemoBinding.variable,
      )
      .map((conversion) => conversion.candidate.node.callee),
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
    importOwner: conversions[0].candidate.node,
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

/** Leading whitespace of the line `line` (1-based) sits on. */
function indentOfLine(line: number, sourceCode: TSESLint.SourceCode) {
  return /^[\t ]*/u.exec(sourceCode.lines[line - 1] ?? '')?.[0] ?? '';
}

function commentsWithin(
  sourceCode: TSESLint.SourceCode,
  start: number,
  end: number,
) {
  return sourceCode
    .getAllComments()
    .filter((comment) => comment.range[0] >= start && comment.range[1] <= end);
}

const textOfComment = (
  sourceCode: TSESLint.SourceCode,
  comment: TSESTree.Comment,
) => sourceCode.getText().slice(comment.range[0], comment.range[1]);

/** Whether the source between two offsets holds a blank line. */
function separatesWithBlankLine(
  sourceCode: TSESLint.SourceCode,
  start: number,
  end: number,
) {
  const gap = sourceCode.getText().slice(start, end);
  return (gap.match(/\n/g)?.length ?? 0) >= 2;
}

/**
 * The parenthesis that opens the call's argument list. The search walks back
 * from the first argument rather than forward from the callee so a type-argument
 * list (`useMemo<T>(...)`) is never crossed, and steps over the parentheses of a
 * parenthesized argument so it lands on the call's own.
 */
function openParenOf(
  sourceCode: TSESLint.SourceCode,
  firstArgument: TSESTree.Node,
) {
  let token = sourceCode.getTokenBefore(firstArgument);
  while (token && sourceCode.getTokenBefore(token)?.value === '(') {
    token = sourceCode.getTokenBefore(token);
  }
  return token?.value === '(' ? token : null;
}

/**
 * A comment that cannot share a line with the code beside it forces the
 * argument list open: a `//` comment swallows the rest of a flat list, and a
 * block comment spanning lines cannot be printed inline either. Emitting the
 * collapsed shape for one of those lands text a formatter rewrites on sight, so
 * the presence of such a comment picks the multi-line rebuild instead.
 */
function forcesArgumentBreak(comments: readonly TSESTree.Comment[]) {
  return comments.some(
    (comment) =>
      comment.type === AST_TOKEN_TYPES.Line ||
      comment.loc.start.line !== comment.loc.end.line,
  );
}

/**
 * The converted call written with one argument per line.
 *
 * Every comment the deleted wrapper held is re-emitted beside the argument it
 * annotates — a comment trailing the returned function on its own line follows
 * the comma that now ends that argument, and a comment on a line of its own
 * keeps one — so an `eslint-disable-next-line` still governs the line it did.
 * The returned function is shifted to the depth it lands at, so the nesting the
 * unwrap removes is taken out of its body as well as its first line.
 */
function expandedArguments(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.CallExpression,
  useMemoCallback: TSESTree.Node,
  returnedFunction: TSESTree.Node,
  openParen: TSESTree.Token,
  closeParen: TSESTree.Token,
) {
  const callIndent = indentOfLine(node.loc.start.line, sourceCode);
  const inner = `${callIndent}  `;
  const dependencies = node.arguments[1];

  const leading = [
    ...commentsWithin(sourceCode, openParen.range[1], useMemoCallback.range[0]),
    ...commentsWithin(
      sourceCode,
      useMemoCallback.range[0],
      returnedFunction.range[0],
    ),
  ];
  const trailing = commentsWithin(
    sourceCode,
    returnedFunction.range[1],
    useMemoCallback.range[1],
  );
  const beforeDependencies = commentsWithin(
    sourceCode,
    useMemoCallback.range[1],
    dependencies ? dependencies.range[0] : closeParen.range[0],
  );

  let text = '\n';
  let cursorEnd = openParen.range[1];
  let cursorLine = openParen.loc.end.line;
  let atLineStart = true;

  const breakBefore = (start: number) =>
    separatesWithBlankLine(sourceCode, cursorEnd, start) ? '\n\n' : '\n';

  /** Places an item, keeping it on the line it shared with its predecessor. */
  const place = (item: TSESTree.Node | TSESTree.Comment, body: string) => {
    if (atLineStart) {
      text += `${inner}${body}`;
    } else if (item.loc.start.line === cursorLine) {
      text += ` ${body}`;
    } else {
      text += `${breakBefore(item.range[0])}${inner}${body}`;
    }
    atLineStart = false;
    cursorEnd = item.range[1];
    cursorLine = item.loc.end.line;
  };

  /** Places an item on a line of its own, whatever it shared in the source. */
  const placeOwnLine = (
    item: TSESTree.Node | TSESTree.Comment,
    body: string,
  ) => {
    text += `${breakBefore(item.range[0])}${inner}${body}`;
    atLineStart = false;
    cursorEnd = item.range[1];
    cursorLine = item.loc.end.line;
  };

  for (const comment of leading) {
    place(comment, textOfComment(sourceCode, comment));
  }
  place(
    returnedFunction,
    reindentRelocated(returnedFunction, inner, sourceCode),
  );
  text += ',';

  // Only a comment that already trailed the returned function stays on its
  // line; the rest annotate what follows them, which is the dependency array.
  trailing.forEach((comment, index) => {
    const body = textOfComment(sourceCode, comment);
    if (
      index === 0 &&
      comment.loc.start.line === returnedFunction.loc.end.line
    ) {
      place(comment, body);
      return;
    }
    placeOwnLine(comment, body);
  });
  for (const comment of beforeDependencies) {
    placeOwnLine(comment, textOfComment(sourceCode, comment));
  }

  if (dependencies) {
    placeOwnLine(
      dependencies,
      reindentRelocated(dependencies, inner, sourceCode),
    );
  } else {
    // A call written without a dependency array memoizes nothing, so the
    // conversion supplies the empty array useCallback needs.
    text += `\n${inner}[]`;
  }
  return `${text},\n${callIndent}`;
}

/**
 * The converted call written as one flat argument list.
 *
 * Only the tokens of the wrapper are removed: the comments it held come back
 * beside the function they framed, because re-emitting the call from `getText`
 * erased whatever sat in those stretches, which silently retired them — and an
 * `eslint-disable` among them stopped suppressing a line that outlives the
 * rewrite.
 */
function flatArgument(
  sourceCode: TSESLint.SourceCode,
  useMemoCallback: TSESTree.Node,
  returnedFunction: TSESTree.Node,
  appended: string,
) {
  const leading = commentsWithin(
    sourceCode,
    useMemoCallback.range[0],
    returnedFunction.range[0],
  );
  const trailing = commentsWithin(
    sourceCode,
    returnedFunction.range[1],
    useMemoCallback.range[1],
  );
  // The relocated function lands on the line the collapsed callback opened, so
  // that line's indentation is the depth its body has to be shifted to.
  const toIndent = indentOfLine(useMemoCallback.loc.start.line, sourceCode);
  const parts = [
    ...leading.map((comment) => textOfComment(sourceCode, comment)),
    reindentRelocated(returnedFunction, toIndent, sourceCode),
    ...trailing.map((comment) => textOfComment(sourceCode, comment)),
  ];
  return `${parts.join(' ')}${appended}`;
}

/**
 * Replaces `useMemo`'s callback with the function it returned, choosing between
 * the flat and the multi-line argument list by what the surviving comments can
 * be printed as.
 */
function unwrapFixes(
  sourceCode: TSESLint.SourceCode,
  fixer: TSESLint.RuleFixer,
  node: TSESTree.CallExpression,
  useMemoCallback: TSESTree.Node,
  returnedFunction: TSESTree.Node,
  missingDependencies: string,
): TSESLint.RuleFix[] {
  const wrapperComments = [
    ...commentsWithin(
      sourceCode,
      useMemoCallback.range[0],
      returnedFunction.range[0],
    ),
    ...commentsWithin(
      sourceCode,
      returnedFunction.range[1],
      useMemoCallback.range[1],
    ),
  ];

  const openParen = openParenOf(sourceCode, useMemoCallback);
  const closeParen = sourceCode.getLastToken(node);
  const dependencies = node.arguments[1];
  // Rebuilding the list means owning every byte between the parentheses, which
  // the rule may only do when it can account for all of them: a third argument
  // or a comment past the dependency array is text it has no place to put.
  const rebuildable =
    openParen !== null &&
    closeParen !== null &&
    closeParen.value === ')' &&
    node.arguments.length <= 2 &&
    (!dependencies ||
      commentsWithin(sourceCode, dependencies.range[1], closeParen.range[0])
        .length === 0);

  if (
    rebuildable &&
    openParen &&
    closeParen &&
    forcesArgumentBreak(wrapperComments)
  ) {
    return [
      fixer.replaceTextRange(
        [openParen.range[1], closeParen.range[0]],
        expandedArguments(
          sourceCode,
          node,
          useMemoCallback,
          returnedFunction,
          openParen,
          closeParen,
        ),
      ),
    ];
  }

  return [
    fixer.replaceTextRange(
      [useMemoCallback.range[0], useMemoCallback.range[1]],
      flatArgument(
        sourceCode,
        useMemoCallback,
        returnedFunction,
        missingDependencies,
      ),
    ),
  ];
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
  const sourceCode = context.getSourceCode();
  const useMemoCallback = node.arguments[0];

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

  // A call written without a dependency array memoizes nothing, so the
  // conversion supplies the empty array useCallback needs.
  const missingDependencies = node.arguments.length < 2 ? ', []' : '';

  const callbackDescription = getMemoizedFunctionDescription(node);

  context.report({
    node,
    messageId: 'preferUseCallback',
    data: { callbackDescription },
    fix: plan.fixable.has(node)
      ? (fixer: TSESLint.RuleFixer) => {
          // The callee is renamed in place and the wrapper around the returned
          // function is deleted, so the type arguments and the dependency array
          // stay byte-identical while the relocated function is re-indented to
          // the depth the unwrap leaves it at.
          const fixes: TSESLint.RuleFix[] = [
            fixer.replaceText(node.callee, plan.calleeName),
            ...unwrapFixes(
              sourceCode,
              fixer,
              node,
              useMemoCallback,
              returnedFunction,
              missingDependencies,
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
