import { AST_NODE_TYPES, TSESTree, TSESLint, ASTUtils } from '@typescript-eslint/utils';
import ts from 'typescript';
import { createRule } from '../utils/createRule';

type Options = [
  {
    /**
     * Patterns (regex strings) that describe call expressions considered "expensive"
     * and therefore allowed even when they return pass-by-value types.
     */
    allowExpensiveCalleePatterns?: string[];
  },
];

type MessageIds = 'primitiveMemo';

const DEFAULT_EXPENSIVE_PATTERNS = [
  'compute',
  'calculate',
  'derive',
  'generate',
  'expensive',
  'heavy',
  'hash',
];

const PASS_BY_VALUE_FLAGS =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Void |
  ts.TypeFlags.ESSymbolLike;

type FunctionContext = {
  isHook: boolean;
  hookName?: string;
  memoVariables: WeakMap<TSESLint.Scope.Variable, TSESTree.CallExpression>;
};

type UseMemoImports = {
  useMemoNames: Set<string>;
  useMemoSpecifiers: Map<string, TSESTree.ImportSpecifier>;
  reactNamespaceNames: Set<string>;
};

function isCustomHookName(name: string | undefined): boolean {
  if (!name) return false;
  return name.startsWith('use') && name.length > 3;
}

function getFunctionName(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): string | undefined {
  if (
    node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    node.id?.type === AST_NODE_TYPES.Identifier
  ) {
    return node.id.name;
  }

  if (
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  return undefined;
}

function collectUseMemoImports(program: TSESTree.Program): UseMemoImports {
  const useMemoNames = new Set<string>();
  const useMemoSpecifiers = new Map<string, TSESTree.ImportSpecifier>();
  const reactNamespaceNames = new Set<string>();

  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      statement.source.value !== 'react'
    ) {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.imported.type === AST_NODE_TYPES.Identifier &&
        specifier.imported.name === 'useMemo'
      ) {
        useMemoNames.add(specifier.local.name);
        useMemoSpecifiers.set(specifier.local.name, specifier);
      }

      if (
        specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
        specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
      ) {
        reactNamespaceNames.add(specifier.local.name);
      }
    }
  }

  return { useMemoNames, useMemoSpecifiers, reactNamespaceNames };
}

function getReturnedExpression(
  callback:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
): TSESTree.Expression | null {
  if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
    if (callback.body.body.length !== 1) {
      return null;
    }

    const [onlyStatement] = callback.body.body;
    if (
      onlyStatement.type === AST_NODE_TYPES.ReturnStatement &&
      onlyStatement.argument
    ) {
      return onlyStatement.argument;
    }

    return null;
  }

  return callback.body;
}

function getArrayElementType(
  type: ts.Type,
  checker: ts.TypeChecker,
): ts.Type | null {
  if (
    (type as ts.TypeReference).objectFlags &
    ts.ObjectFlags.Reference
  ) {
    const typeArguments = checker.getTypeArguments(type as ts.TypeReference);
    if (typeArguments.length > 0) {
      return typeArguments[0];
    }
  }

  const indexType = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
  return indexType ?? null;
}

function classifyPassByValue(
  type: ts.Type,
  checker: ts.TypeChecker,
): { passByValue: boolean; indeterminate: boolean; description: string } {
  const description = checker.typeToString(type);

  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    return { passByValue: false, indeterminate: true, description };
  }

  if (type.flags & ts.TypeFlags.Union) {
    const unionType = type as ts.UnionType;
    let sawIndeterminate = false;

    for (const part of unionType.types) {
      const result = classifyPassByValue(part, checker);
      if (result.indeterminate) {
        sawIndeterminate = true;
        break;
      }
      if (!result.passByValue) {
        return { passByValue: false, indeterminate: false, description };
      }
    }

    if (sawIndeterminate) {
      return { passByValue: false, indeterminate: true, description };
    }

    return { passByValue: true, indeterminate: false, description };
  }

  if (checker.isTupleType(type)) {
    const elementTypes = checker.getTypeArguments(type as ts.TypeReference);
    let sawIndeterminate = false;

    for (const elementType of elementTypes) {
      const result = classifyPassByValue(elementType, checker);
      if (result.indeterminate) {
        sawIndeterminate = true;
        break;
      }
      if (!result.passByValue) {
        return { passByValue: false, indeterminate: false, description };
      }
    }

    if (sawIndeterminate) {
      return { passByValue: false, indeterminate: true, description };
    }

    return { passByValue: true, indeterminate: false, description };
  }

  if (checker.isArrayType(type) || checker.isArrayLikeType(type)) {
    const elementType = getArrayElementType(type, checker);
    if (!elementType) {
      return { passByValue: false, indeterminate: true, description };
    }

    const elementResult = classifyPassByValue(elementType, checker);
    if (elementResult.indeterminate) {
      return { passByValue: false, indeterminate: true, description };
    }

    if (!elementResult.passByValue) {
      return { passByValue: false, indeterminate: false, description };
    }

    return { passByValue: true, indeterminate: false, description };
  }

  if (type.flags & PASS_BY_VALUE_FLAGS) {
    return { passByValue: true, indeterminate: false, description };
  }

  return { passByValue: false, indeterminate: false, description };
}

function getCalleeName(node: TSESTree.CallExpression): string | null {
  if (node.callee.type === AST_NODE_TYPES.Identifier) {
    return node.callee.name;
  }

  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    const object =
      node.callee.object.type === AST_NODE_TYPES.Identifier
        ? node.callee.object.name
        : null;
    if (!object) {
      return node.callee.property.name;
    }
    return `${object}.${node.callee.property.name}`;
  }

  return null;
}

function isExpensiveComputation(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  expensiveMatchers: RegExp[],
): boolean {
  const returnedExpression = getReturnedExpression(callback);
  if (!returnedExpression || returnedExpression.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }

  const calleeName = getCalleeName(returnedExpression);
  if (!calleeName) {
    return false;
  }

  return expensiveMatchers.some((matcher) => matcher.test(calleeName));
}

function isUseMemoCall(
  node: TSESTree.CallExpression,
  imports: UseMemoImports,
): boolean {
  if (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    imports.useMemoNames.has(node.callee.name)
  ) {
    return true;
  }

  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'useMemo' &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    (imports.reactNamespaceNames.has(node.callee.object.name) ||
      node.callee.object.name === 'React')
  ) {
    return true;
  }

  return false;
}

function buildImportRemovalFix(
  specifier: TSESTree.ImportSpecifier,
  sourceCode: Readonly<TSESLint.SourceCode>,
  fixer: TSESLint.RuleFixer,
): TSESLint.RuleFix | null {
  const importDeclaration = specifier.parent;
  if (!importDeclaration || importDeclaration.type !== AST_NODE_TYPES.ImportDeclaration) {
    return null;
  }

  const remainingSpecifiers = importDeclaration.specifiers.filter(
    (candidate) => candidate !== specifier,
  );

  if (remainingSpecifiers.length === 0) {
    const text = sourceCode.getText();
    let [start, end] = importDeclaration.range;

    let scan = start;
    while (scan > 0 && (text[scan - 1] === ' ' || text[scan - 1] === '\t')) {
      scan -= 1;
    }
    if (scan > 0 && text[scan - 1] === '\n') {
      start = scan - 1;
      if (start > 0 && text[start - 1] === '\r') {
        start -= 1;
      }
    } else {
      start = scan;
      if (start > 0 && text[start - 1] === '\r') {
        start -= 1;
      }
    }

    while (end < text.length && (text[end] === ' ' || text[end] === '\t')) {
      end += 1;
    }
    const consumeLineBreak = () => {
      if (end < text.length && text[end] === '\r' && text[end + 1] === '\n') {
        end += 2;
        return true;
      }
      if (end < text.length && (text[end] === '\n' || text[end] === '\r')) {
        end += 1;
        return true;
      }
      return false;
    };

    if (consumeLineBreak()) {
      while (end < text.length && (text[end] === ' ' || text[end] === '\t')) {
        end += 1;
      }
      if (consumeLineBreak()) {
        while (end < text.length && (text[end] === ' ' || text[end] === '\t')) {
          end += 1;
        }
      }
    }

    return fixer.removeRange([start, end]);
  }

  const defaultSpecifier = remainingSpecifiers.find(
    (candidate) => candidate.type === AST_NODE_TYPES.ImportDefaultSpecifier,
  );
  const namespaceSpecifier = remainingSpecifiers.find(
    (candidate) => candidate.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
  );
  const namedSpecifiers = remainingSpecifiers.filter(
    (candidate) => candidate.type === AST_NODE_TYPES.ImportSpecifier,
  ) as TSESTree.ImportSpecifier[];

  const pieces: string[] = [];
  if (defaultSpecifier) {
    pieces.push(sourceCode.getText(defaultSpecifier));
  }
  if (namespaceSpecifier) {
    pieces.push(sourceCode.getText(namespaceSpecifier));
  }
  if (namedSpecifiers.length > 0) {
    pieces.push(
      `{ ${namedSpecifiers.map((candidate) => sourceCode.getText(candidate)).join(', ')} }`,
    );
  }

  const importPrefix = importDeclaration.importKind === 'type' ? 'import type ' : 'import ';
  const newImport = `${importPrefix}${pieces.join(', ')} from ${sourceCode.getText(importDeclaration.source)};`;

  return fixer.replaceText(importDeclaration, newImport);
}

function getReplacementText(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): string | null {
  const returnedExpression = getReturnedExpression(callback);
  if (!returnedExpression) {
    return null;
  }

  if (
    callback.body.type === AST_NODE_TYPES.BlockStatement &&
    callback.body.body.length !== 1
  ) {
    return null;
  }

  return sourceCode.getText(returnedExpression);
}

function isSafeAtomicExpression(expression: TSESTree.Expression): boolean {
  switch (expression.type) {
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.TemplateLiteral:
    case AST_NODE_TYPES.ThisExpression:
    case AST_NODE_TYPES.Super:
    case AST_NODE_TYPES.MemberExpression:
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.ObjectExpression:
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression:
    case AST_NODE_TYPES.ClassExpression:
    case AST_NODE_TYPES.TaggedTemplateExpression:
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.UpdateExpression:
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
      return true;
    default:
      return false;
  }
}

function shouldParenthesizeReplacement(
  node: TSESTree.CallExpression,
  replacementExpression: TSESTree.Expression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  const alreadyParenthesized = ASTUtils.isParenthesized(
    replacementExpression,
    sourceCode,
  );
  const parent = node.parent;
  if (!parent) {
    return false;
  }

  if (
    (replacementExpression as TSESTree.SequenceExpression).type ===
    AST_NODE_TYPES.SequenceExpression
  ) {
    return true;
  }

  switch (parent.type) {
    case AST_NODE_TYPES.LogicalExpression:
    case AST_NODE_TYPES.BinaryExpression:
      return (
        alreadyParenthesized ||
        !isSafeAtomicExpression(replacementExpression)
      );
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.MemberExpression:
    case AST_NODE_TYPES.TaggedTemplateExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.ChainExpression:
      return true;
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
      return (
        alreadyParenthesized ||
        !isSafeAtomicExpression(replacementExpression)
      );
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
      return (
        alreadyParenthesized ||
        parent.callee === node ||
        replacementExpression.type === AST_NODE_TYPES.SequenceExpression
      );
    default:
      return false;
  }
}

function getRemovableImportSpecifier(
  callExpression: TSESTree.CallExpression,
  imports: UseMemoImports,
  context: TSESLint.RuleContext<MessageIds, Options>,
): TSESTree.ImportSpecifier | null {
  if (callExpression.callee.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const specifier = imports.useMemoSpecifiers.get(callExpression.callee.name);
  if (!specifier) {
    return null;
  }

  const sourceCode = context.getSourceCode();
  const declaredVariables =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((sourceCode as any).getDeclaredVariables?.(specifier) as
      | TSESLint.Scope.Variable[]
      | undefined) ?? context.getDeclaredVariables(specifier);
  const [variable] = declaredVariables;
  if (!variable) {
    // Defer removal when scope analysis cannot resolve the import.
    return null;
  }

  const otherReferences = variable.references.filter(
    (reference) => reference.identifier !== callExpression.callee,
  );
  if (otherReferences.length > 0) {
    return null;
  }

  return specifier;
}

export const noUsememoForPassByValue = createRule<Options, MessageIds>({
  name: 'no-usememo-for-pass-by-value',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow returning useMemo results from custom hooks when the memoized value is pass-by-value (primitives or tuples/arrays of primitives). Memoizing primitives adds noise without referential benefits. Requires type information.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowExpensiveCalleePatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_EXPENSIVE_PATTERNS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      primitiveMemo:
        'What’s wrong: custom hook "{{hookName}}" returns useMemo wrapping a pass-by-value value ({{valueType}}) → Why it matters: memoizing pass-by-value results cannot change identity and implies stability that is not real, which misleads callers and adds noise → How to fix: inline the returned expression and remove the useMemo import if it becomes unused.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const sourceCode = context.getSourceCode();
    const parserServices =
      sourceCode.parserServices ?? context.parserServices;
    if (!parserServices?.program || !parserServices.esTreeNodeToTSNodeMap) {
      return {};
    }

    const { program, esTreeNodeToTSNodeMap } = parserServices;
    const checker = program.getTypeChecker();
    const imports = collectUseMemoImports(sourceCode.ast);
    const expensiveMatchers = (
      context.options[0]?.allowExpensiveCalleePatterns ??
      DEFAULT_EXPENSIVE_PATTERNS
      // Skip invalid patterns instead of throwing during lint execution.
    ).flatMap((pattern) => {
      try {
        return [new RegExp(pattern)];
      } catch {
        return [];
      }
    });

    const functionStack: FunctionContext[] = [];
    const reported = new WeakSet<TSESTree.CallExpression>();
    const resolveVariable = (identifier: TSESTree.Identifier) =>
      ASTUtils.findVariable(context.getScope(), identifier) ?? null;

    function handleUseMemoCall(
      node: TSESTree.CallExpression,
      currentContext: FunctionContext | undefined,
    ) {
      if (!currentContext?.isHook || reported.has(node)) {
        return;
      }

      const callback = node.arguments[0];
      if (
        !callback ||
        (callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callback.type !== AST_NODE_TYPES.FunctionExpression)
      ) {
        return;
      }
      const returnedExpression = getReturnedExpression(callback);
      if (!returnedExpression) {
        return;
      }

      if (isExpensiveComputation(callback, expensiveMatchers)) {
        return;
      }

      const tsNode = esTreeNodeToTSNodeMap.get(node);
      if (!tsNode) {
        return;
      }

      const type = checker.getTypeAtLocation(tsNode);
      let classification = classifyPassByValue(type, checker);
      if (classification.indeterminate && returnedExpression) {
        const returnedTsNode = esTreeNodeToTSNodeMap.get(returnedExpression);
        if (returnedTsNode) {
          const returnedType = checker.getTypeAtLocation(returnedTsNode);
          const fallbackClassification = classifyPassByValue(
            returnedType,
            checker,
          );
          if (!fallbackClassification.indeterminate) {
            classification = fallbackClassification;
          }
        }
      }
      if (classification.indeterminate || !classification.passByValue) {
        return;
      }

      reported.add(node);

      context.report({
        node,
        messageId: 'primitiveMemo',
        data: {
          hookName: currentContext.hookName ?? 'this hook',
          valueType: classification.description,
        },
        fix: (fixer) => {
          const replacementText = getReplacementText(callback, sourceCode);
          if (!replacementText || !returnedExpression) {
            return null;
          }

          const needsParentheses = shouldParenthesizeReplacement(
            node,
            returnedExpression,
            sourceCode,
          );
          const replacement = needsParentheses
            ? `(${replacementText})`
            : replacementText;

          const specifier = getRemovableImportSpecifier(node, imports, context);
          const fixes: TSESLint.RuleFix[] = [
            fixer.replaceText(node, replacement),
          ];

          if (specifier) {
            const removal = buildImportRemovalFix(specifier, sourceCode, fixer);
            if (removal) {
              fixes.push(removal);
            }
          }

          return fixes;
        },
      });
    }

    function analyzeReturnedValue(
      expression: TSESTree.Expression | null | undefined,
      currentContext: FunctionContext | undefined,
    ) {
      if (!expression || !currentContext?.isHook) {
        return;
      }

      switch (expression.type) {
        case AST_NODE_TYPES.CallExpression:
          if (isUseMemoCall(expression, imports)) {
            handleUseMemoCall(expression, currentContext);
            return;
          }
          for (const argument of expression.arguments) {
            if (argument.type === AST_NODE_TYPES.SpreadElement) {
              analyzeReturnedValue(argument.argument, currentContext);
              continue;
            }
            analyzeReturnedValue(argument, currentContext);
          }
          return;
        case AST_NODE_TYPES.NewExpression:
          for (const argument of expression.arguments ?? []) {
            if (argument.type === AST_NODE_TYPES.SpreadElement) {
              analyzeReturnedValue(argument.argument, currentContext);
              continue;
            }
            analyzeReturnedValue(argument, currentContext);
          }
          return;
        case AST_NODE_TYPES.Identifier: {
          const variable = resolveVariable(expression);
          const memoCall = variable
            ? currentContext.memoVariables.get(variable)
            : undefined;
          if (memoCall) {
            handleUseMemoCall(memoCall, currentContext);
          }
          return;
        }
        case AST_NODE_TYPES.ConditionalExpression:
          analyzeReturnedValue(expression.consequent, currentContext);
          analyzeReturnedValue(expression.alternate, currentContext);
          return;
        case AST_NODE_TYPES.LogicalExpression:
          analyzeReturnedValue(expression.left, currentContext);
          analyzeReturnedValue(expression.right, currentContext);
          return;
        case AST_NODE_TYPES.BinaryExpression:
          if (expression.left.type !== AST_NODE_TYPES.PrivateIdentifier) {
            analyzeReturnedValue(expression.left, currentContext);
          }
          analyzeReturnedValue(expression.right, currentContext);
          return;
        case AST_NODE_TYPES.SequenceExpression: {
          const lastExpression =
            expression.expressions[expression.expressions.length - 1];
          analyzeReturnedValue(lastExpression, currentContext);
          return;
        }
        case AST_NODE_TYPES.TSAsExpression:
        case AST_NODE_TYPES.TSTypeAssertion:
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.TSSatisfiesExpression:
        case AST_NODE_TYPES.ChainExpression:
          analyzeReturnedValue(expression.expression, currentContext);
          return;
        case AST_NODE_TYPES.AwaitExpression:
          analyzeReturnedValue(expression.argument, currentContext);
          return;
      }
    }

    return {
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        const name = getFunctionName(node);
        functionStack.push({
          isHook: isCustomHookName(name),
          hookName: name,
          memoVariables: new WeakMap(),
        });
      },
      'FunctionDeclaration:exit'() {
        functionStack.pop();
      },
      FunctionExpression(node: TSESTree.FunctionExpression) {
        const name = getFunctionName(node);
        functionStack.push({
          isHook: isCustomHookName(name),
          hookName: name,
          memoVariables: new WeakMap(),
        });
      },
      'FunctionExpression:exit'() {
        functionStack.pop();
      },
      ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
        const name = getFunctionName(node);
        functionStack.push({
          isHook: isCustomHookName(name),
          hookName: name,
          memoVariables: new WeakMap(),
        });
      },
      'ArrowFunctionExpression:exit'(node: TSESTree.ArrowFunctionExpression) {
        const currentContext = functionStack[functionStack.length - 1];
        if (currentContext?.isHook && node.expression) {
          analyzeReturnedValue(node.body as TSESTree.Expression, currentContext);
        }
        functionStack.pop();
      },
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        const currentContext = functionStack[functionStack.length - 1];
        if (
          !currentContext?.isHook ||
          node.id.type !== AST_NODE_TYPES.Identifier ||
          !node.init ||
          node.init.type !== AST_NODE_TYPES.CallExpression ||
          !isUseMemoCall(node.init, imports)
        ) {
          return;
        }

        const variable = resolveVariable(node.id);
        if (variable) {
          currentContext.memoVariables.set(variable, node.init);
        }
      },
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        const currentContext = functionStack[functionStack.length - 1];
        if (
          !currentContext?.isHook ||
          node.operator !== '=' ||
          node.left.type !== AST_NODE_TYPES.Identifier
        ) {
          return;
        }

        const variable = resolveVariable(node.left);
        if (!variable) {
          return;
        }

        if (
          node.right.type === AST_NODE_TYPES.CallExpression &&
          isUseMemoCall(node.right, imports)
        ) {
          currentContext.memoVariables.set(variable, node.right);
          return;
        }

        currentContext.memoVariables.delete(variable);
      },
      ReturnStatement(node: TSESTree.ReturnStatement) {
        const currentContext = functionStack[functionStack.length - 1];
        if (!currentContext?.isHook) {
          return;
        }

        analyzeReturnedValue(node.argument, currentContext);
      },
    };
  },
});

export default noUsememoForPassByValue;
