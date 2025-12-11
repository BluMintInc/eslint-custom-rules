import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'moveGuardUp'
  | 'groupDerived'
  | 'moveDeclarationCloser'
  | 'moveSideEffect';

type BlockLike = TSESTree.BlockStatement | TSESTree.Program;

const TYPE_EXPRESSION_WRAPPERS = new Set<TSESTree.Node['type']>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSInstantiationExpression,
]);

function isHookLikeName(name: string): boolean {
  return /^use[A-Z0-9]/.test(name);
}

function isHookCallee(
  callee:
    | TSESTree.LeftHandSideExpression
    | TSESTree.PrivateIdentifier
    | TSESTree.Super,
): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return isHookLikeName(callee.name);
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return isHookLikeName(callee.property.name);
  }
  return false;
}

function isTypeNode(node: TSESTree.Node | undefined): boolean {
  if (!node) {
    return false;
  }
  if (TYPE_EXPRESSION_WRAPPERS.has(node.type)) {
    return false;
  }
  return node.type.startsWith('TS');
}

function isDeclarationIdentifier(
  node: TSESTree.Identifier,
  parent: TSESTree.Node | undefined,
): boolean {
  if (!parent) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id === node) {
    return true;
  }
  if (
    (parent.type === AST_NODE_TYPES.FunctionDeclaration ||
      parent.type === AST_NODE_TYPES.FunctionExpression) &&
    parent.id === node
  ) {
    return true;
  }
  if (
    (parent.type === AST_NODE_TYPES.FunctionDeclaration ||
      parent.type === AST_NODE_TYPES.FunctionExpression ||
      parent.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
    parent.params.includes(node)
  ) {
    return true;
  }
  if (
    (parent.type === AST_NODE_TYPES.ClassDeclaration ||
      parent.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
      parent.type === AST_NODE_TYPES.TSTypeAliasDeclaration) &&
    parent.id === node
  ) {
    return true;
  }
  return false;
}

function collectUsedIdentifiers(
  node: TSESTree.Node,
  names: Set<string>,
  { skipFunctions }: { skipFunctions: boolean },
): void {
  const stack: Array<TSESTree.Node> = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current.type === AST_NODE_TYPES.Identifier) {
      processIdentifier(current, names);
      continue;
    }

    if (shouldSkipFunction(current, skipFunctions)) {
      continue;
    }

    addChildNodesToStack(current, stack);
  }
}

function collectPatternDependencies(
  pattern: TSESTree.BindingName | TSESTree.RestElement | TSESTree.AssignmentPattern,
  names: Set<string>,
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      return;
    case AST_NODE_TYPES.RestElement:
      collectPatternDependencies(pattern.argument as TSESTree.BindingName, names);
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      collectUsedIdentifiers(pattern.right as TSESTree.Expression, names, { skipFunctions: true });
      collectPatternDependencies(pattern.left as TSESTree.BindingName, names);
      return;
    case AST_NODE_TYPES.ArrayPattern:
      pattern.elements.forEach((element) => {
        if (element) {
          collectPatternDependencies(element as TSESTree.BindingName, names);
        }
      });
      return;
    case AST_NODE_TYPES.ObjectPattern:
      pattern.properties.forEach((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          if (prop.computed && ASTHelpers.isNode(prop.key)) {
            collectUsedIdentifiers(prop.key, names, { skipFunctions: true });
          }
          collectPatternDependencies(
            prop.value as TSESTree.BindingName | TSESTree.AssignmentPattern,
            names,
          );
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          collectPatternDependencies(prop.argument as TSESTree.BindingName, names);
        }
      });
      return;
    default:
      return;
  }
}

function processIdentifier(identifier: TSESTree.Identifier, names: Set<string>): void {
  const parent = identifier.parent as TSESTree.Node | undefined;
  if (shouldSkipIdentifier(identifier, parent)) {
    return;
  }
  names.add(identifier.name);
}

function shouldSkipIdentifier(
  identifier: TSESTree.Identifier,
  parent: TSESTree.Node | undefined,
): boolean {
  if (isTypeNode(parent) || isDeclarationIdentifier(identifier, parent)) {
    return true;
  }

  if (
    parent &&
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.property === identifier &&
    !parent.computed
  ) {
    return true;
  }

  if (
    parent &&
    parent.type === AST_NODE_TYPES.Property &&
    parent.key === identifier &&
    !parent.computed
  ) {
    return true;
  }

  return false;
}

function shouldSkipFunction(node: TSESTree.Node, skipFunctions: boolean): boolean {
  return (
    skipFunctions &&
    (node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.ArrowFunctionExpression)
  );
}

function addChildNodesToStack(node: TSESTree.Node, stack: Array<TSESTree.Node>): void {
  for (const key of Object.keys(node)) {
    if (key === 'parent') {
      continue;
    }

    const value = (node as unknown as Record<string, unknown>)[key];

    if (Array.isArray(value)) {
      for (const element of value) {
        if (ASTHelpers.isNode(element)) {
          stack.push(element);
        }
      }
    } else if (ASTHelpers.isNode(value)) {
      stack.push(value);
    }
  }
}

function collectDeclaredNamesFromPattern(
  pattern: TSESTree.BindingName | TSESTree.RestElement | TSESTree.AssignmentPattern,
  names: Set<string>,
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      names.add(pattern.name);
      return;
    case AST_NODE_TYPES.RestElement:
      collectDeclaredNamesFromPattern(pattern.argument as TSESTree.BindingName, names);
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      collectDeclaredNamesFromPattern(pattern.left as TSESTree.BindingName, names);
      return;
    case AST_NODE_TYPES.ArrayPattern:
      pattern.elements.forEach((element) => {
        if (element) {
          collectDeclaredNamesFromPattern(element as TSESTree.BindingName, names);
        }
      });
      return;
    case AST_NODE_TYPES.ObjectPattern:
      pattern.properties.forEach((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          if (prop.value.type === AST_NODE_TYPES.Identifier) {
            names.add(prop.value.name);
          } else {
            collectDeclaredNamesFromPattern(
              prop.value as TSESTree.BindingName | TSESTree.AssignmentPattern,
              names,
            );
          }
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          collectDeclaredNamesFromPattern(prop.argument as TSESTree.BindingName, names);
        }
      });
      return;
    default:
      return;
  }
}

function getDeclaredNames(statement: TSESTree.Statement): Set<string> {
  const names = new Set<string>();

  if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
    statement.declarations.forEach((declarator) => {
      collectDeclaredNamesFromPattern(
        declarator.id as TSESTree.BindingName | TSESTree.ArrayPattern | TSESTree.ObjectPattern,
        names,
      );
    });
  }

  if (statement.type === AST_NODE_TYPES.FunctionDeclaration && statement.id) {
    names.add(statement.id.name);
  }

  if (
    statement.type === AST_NODE_TYPES.ClassDeclaration &&
    statement.id &&
    statement.id.type === AST_NODE_TYPES.Identifier
  ) {
    names.add(statement.id.name);
  }

  return names;
}

function statementReferencesAny(statement: TSESTree.Statement, names: Set<string>): boolean {
  if (names.size === 0) {
    return false;
  }
  const found = new Set<string>();
  collectUsedIdentifiers(statement, found, { skipFunctions: false });
  for (const name of names) {
    if (found.has(name)) {
      return true;
    }
  }
  return false;
}

function collectAssignedNamesFromPattern(target: TSESTree.Node, names: Set<string>): void {
  switch (target.type) {
    case AST_NODE_TYPES.Identifier:
      names.add(target.name);
      return;
    case AST_NODE_TYPES.MemberExpression:
      if (target.object.type === AST_NODE_TYPES.Identifier) {
        names.add(target.object.name);
      }
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      collectAssignedNamesFromPattern(target.left as TSESTree.Node, names);
      return;
    case AST_NODE_TYPES.RestElement:
      collectAssignedNamesFromPattern(target.argument as TSESTree.Node, names);
      return;
    case AST_NODE_TYPES.ArrayPattern:
      target.elements.forEach((element) => {
        if (element) {
          collectAssignedNamesFromPattern(element as TSESTree.Node, names);
        }
      });
      return;
    case AST_NODE_TYPES.ObjectPattern:
      target.properties.forEach((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          collectAssignedNamesFromPattern(prop.value as TSESTree.Node, names);
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          collectAssignedNamesFromPattern(prop.argument as TSESTree.Node, names);
        }
      });
      return;
    default:
      return;
  }
}

function collectMutatedIdentifiers(
  node: TSESTree.Node,
  names: Set<string>,
  { skipFunctions }: { skipFunctions: boolean },
): void {
  const stack: Array<TSESTree.Node> = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current.type === AST_NODE_TYPES.AssignmentExpression) {
      collectAssignedNamesFromPattern(current.left as TSESTree.Node, names);
      if (ASTHelpers.isNode(current.right)) {
        stack.push(current.right);
      }
      continue;
    }

    if (current.type === AST_NODE_TYPES.UpdateExpression) {
      collectAssignedNamesFromPattern(current.argument as TSESTree.Node, names);
      continue;
    }

    if (
      skipFunctions &&
      (current.type === AST_NODE_TYPES.FunctionDeclaration ||
        current.type === AST_NODE_TYPES.FunctionExpression ||
        current.type === AST_NODE_TYPES.ArrowFunctionExpression)
    ) {
      continue;
    }

    for (const key of Object.keys(current)) {
      if (key === 'parent') {
        continue;
      }
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const element of value) {
          if (ASTHelpers.isNode(element)) {
            stack.push(element);
          }
        }
      } else if (ASTHelpers.isNode(value)) {
        stack.push(value);
      }
    }
  }
}

function statementMutatesAny(statement: TSESTree.Statement, names: Set<string>): boolean {
  if (names.size === 0) {
    return false;
  }
  const mutated = new Set<string>();
  collectMutatedIdentifiers(statement, mutated, { skipFunctions: true });
  for (const name of names) {
    if (mutated.has(name)) {
      return true;
    }
  }
  return false;
}

function initializerIsSafe(
  expression: TSESTree.Expression | TSESTree.PrivateIdentifier,
  { allowHooks }: { allowHooks: boolean },
): boolean {
  // Hook calls are treated as impure so we never reorder React hook execution unless a callsite explicitly opts in.
  switch (expression.type) {
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.Super:
    case AST_NODE_TYPES.ThisExpression:
      return true;
    case AST_NODE_TYPES.TemplateLiteral:
      return expression.expressions.every((exp) =>
        initializerIsSafe(exp as TSESTree.Expression, { allowHooks }),
      );
    case AST_NODE_TYPES.MemberExpression:
      if (expression.computed) {
        return (
          initializerIsSafe(expression.property as TSESTree.Expression, { allowHooks }) &&
          initializerIsSafe(expression.object as TSESTree.Expression, { allowHooks })
        );
      }
      return initializerIsSafe(expression.object as TSESTree.Expression, { allowHooks });
    case AST_NODE_TYPES.ArrayExpression:
      return expression.elements.every((element) => {
        if (!element) {
          return true;
        }
        if (element.type === AST_NODE_TYPES.SpreadElement) {
          return false;
        }
        return initializerIsSafe(element as TSESTree.Expression, { allowHooks });
      });
    case AST_NODE_TYPES.ObjectExpression:
      return expression.properties.every((prop) => {
        if (prop.type !== AST_NODE_TYPES.Property) {
          return false;
        }
        if (prop.computed) {
          if (!initializerIsSafe(prop.key as TSESTree.Expression, { allowHooks })) {
            return false;
          }
        }
        return initializerIsSafe(prop.value as TSESTree.Expression, { allowHooks });
      });
    case AST_NODE_TYPES.UnaryExpression:
      return initializerIsSafe(expression.argument as TSESTree.Expression, { allowHooks });
    case AST_NODE_TYPES.BinaryExpression:
    case AST_NODE_TYPES.LogicalExpression:
      return (
        initializerIsSafe(expression.left as TSESTree.Expression, { allowHooks }) &&
        initializerIsSafe(expression.right as TSESTree.Expression, { allowHooks })
      );
    case AST_NODE_TYPES.ConditionalExpression:
      return (
        initializerIsSafe(expression.test as TSESTree.Expression, { allowHooks }) &&
        initializerIsSafe(expression.consequent as TSESTree.Expression, { allowHooks }) &&
        initializerIsSafe(expression.alternate as TSESTree.Expression, { allowHooks })
      );
    case AST_NODE_TYPES.CallExpression: {
      if (allowHooks && isHookCallee(expression.callee)) {
        return expression.arguments.every((arg) => {
          if (!ASTHelpers.isNode(arg)) {
            return true;
          }
          if (arg.type === AST_NODE_TYPES.SpreadElement) {
            return false;
          }
          return initializerIsSafe(arg as TSESTree.Expression, { allowHooks });
        });
      }
      return false;
    }
    case AST_NODE_TYPES.ChainExpression:
      return initializerIsSafe(expression.expression as TSESTree.Expression, { allowHooks });
    default:
      return false;
  }
}

function isPureDeclaration(
  statement: TSESTree.Statement,
  { allowHooks }: { allowHooks: boolean },
): statement is TSESTree.VariableDeclaration {
  if (statement.type !== AST_NODE_TYPES.VariableDeclaration) {
    return false;
  }

  return statement.declarations.every((declarator) => {
    if (!declarator.init) {
      return true;
    }
    return initializerIsSafe(declarator.init as TSESTree.Expression, { allowHooks });
  });
}

function statementDeclaresAny(statement: TSESTree.Statement, names: Set<string>): boolean {
  const declared = getDeclaredNames(statement);
  for (const name of names) {
    if (declared.has(name)) {
      return true;
    }
  }
  return false;
}

function findEarliestSafeIndex(
  body: TSESTree.Statement[],
  startIndex: number,
  dependencies: Set<string>,
  { allowHooks }: { allowHooks: boolean },
): number {
  // Reuse the backward scan so guard/side-effect movers stop before impure work or any declaration/reference of tracked dependencies.
  let targetIndex = startIndex;
  for (let cursor = startIndex - 1; cursor >= 0; cursor -= 1) {
    const candidate = body[cursor];
    if (!isPureDeclaration(candidate, { allowHooks })) {
      break;
    }
    if (statementDeclaresAny(candidate, dependencies)) {
      break;
    }
    if (statementReferencesAny(candidate, dependencies)) {
      break;
    }
    targetIndex = cursor;
  }
  return targetIndex;
}

function getStartWithComments(statement: TSESTree.Statement, sourceCode: TSESLint.SourceCode): number {
  const comments = sourceCode.getCommentsBefore(statement);
  if (comments.length === 0) {
    return statement.range[0];
  }
  return comments[0].range[0];
}

function getNextStart(
  body: TSESTree.Statement[],
  index: number,
  parent: BlockLike,
  sourceCode: TSESLint.SourceCode,
): number {
  const nextStatement = body[index + 1];
  if (nextStatement) {
    return getStartWithComments(nextStatement, sourceCode);
  }
  const closingBraceOffset = parent.type === AST_NODE_TYPES.BlockStatement ? 1 : 0;
  return parent.range[1] - closingBraceOffset;
}

function buildMoveFix(
  body: TSESTree.Statement[],
  fromIndex: number,
  toIndex: number,
  parent: BlockLike,
  sourceCode: TSESLint.SourceCode,
  fixer: TSESLint.RuleFixer,
): TSESLint.RuleFix {
  const text = sourceCode.getText();

  if (toIndex < fromIndex) {
    const segmentStart = getStartWithComments(body[toIndex], sourceCode);
    const movingStart = getStartWithComments(body[fromIndex], sourceCode);
    const segmentEnd = getNextStart(body, fromIndex, parent, sourceCode);
    const before = text.slice(segmentStart, movingStart);
    const moving = text.slice(movingStart, segmentEnd).replace(/[ \t]+$/u, '');
    const newText = moving + before;
    return fixer.replaceTextRange([segmentStart, segmentEnd], newText);
  }

  const segmentStart = getStartWithComments(body[fromIndex], sourceCode);
  const movingEnd = getNextStart(body, fromIndex, parent, sourceCode);
  const segmentEnd = getStartWithComments(body[toIndex], sourceCode);
  const moving = text.slice(segmentStart, movingEnd).replace(/[ \t]+$/u, '');
  const between = text.slice(movingEnd, segmentEnd);
  const newText = between + moving;
  return fixer.replaceTextRange([segmentStart, segmentEnd], newText);
}

function truncateWithEllipsis(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function isGuardIfStatement(statement: TSESTree.Statement): statement is TSESTree.IfStatement {
  if (statement.type !== AST_NODE_TYPES.IfStatement || statement.alternate) {
    return false;
  }
  const { consequent } = statement;
  if (
    consequent.type === AST_NODE_TYPES.ReturnStatement ||
    consequent.type === AST_NODE_TYPES.ThrowStatement ||
    consequent.type === AST_NODE_TYPES.BreakStatement ||
    consequent.type === AST_NODE_TYPES.ContinueStatement
  ) {
    return true;
  }
  if (
    consequent.type === AST_NODE_TYPES.BlockStatement &&
    consequent.body.length === 1 &&
    (consequent.body[0].type === AST_NODE_TYPES.ReturnStatement ||
      consequent.body[0].type === AST_NODE_TYPES.ThrowStatement ||
      consequent.body[0].type === AST_NODE_TYPES.BreakStatement ||
      consequent.body[0].type === AST_NODE_TYPES.ContinueStatement)
  ) {
    return true;
  }
  return false;
}

export const logicalTopToBottomGrouping: TSESLint.RuleModule<MessageIds, never[]> = createRule({
  name: 'logical-top-to-bottom-grouping',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Encourages grouping related statements in top-to-bottom order so readers see guards, side effects, and dependent declarations together.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      moveGuardUp:
        'Early exit "{{guard}}" should appear before setup it skips. Hoist guard clauses so readers see the exit path first and avoid doing work that is immediately abandoned.',
      groupDerived:
        'Declaration "{{name}}" depends on "{{dependency}}" but is separated by unrelated statements. Keep derived values adjacent to their source so the flow reads from input to result without jumping.',
      moveDeclarationCloser:
        'Move declaration "{{name}}" next to its first use. Keeping placeholders far above their usage scatters the flow and makes the execution order harder to follow.',
      moveSideEffect:
        'Side effect "{{effect}}" is buried after later setup. Emit observable effects before unrelated initialization to keep the chronological flow obvious.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const reportedStatements = new WeakSet<TSESTree.Statement>();

    function reportOnce(
      statement: TSESTree.Statement,
      messageId: MessageIds,
      data: Record<string, string>,
      fix: (fixer: TSESLint.RuleFixer) => TSESLint.RuleFix | null,
    ) {
      if (reportedStatements.has(statement)) {
        return;
      }
      reportedStatements.add(statement);
      context.report({ node: statement, messageId, data, fix });
    }

    // Hoist guard clauses only across pure declarations that neither mention nor redefine guard inputs so early exits do not skip newly introduced work.
    function handleGuardHoists(body: TSESTree.Statement[], parent: BlockLike): void {
      body.forEach((statement, index) => {
        if (!isGuardIfStatement(statement)) {
          return;
        }

        const guardDependencies = new Set<string>();
        collectUsedIdentifiers(statement.test, guardDependencies, { skipFunctions: true });
        collectUsedIdentifiers(statement.consequent, guardDependencies, { skipFunctions: true });

        const targetIndex = findEarliestSafeIndex(body, index, guardDependencies, {
          allowHooks: false,
        });

        if (targetIndex === index) {
          return;
        }

        reportOnce(
          statement,
          'moveGuardUp',
          { guard: truncateWithEllipsis(sourceCode.getText(statement.test)) },
          (fixer) => buildMoveFix(body, index, targetIndex, parent, sourceCode, fixer),
        );
      });
    }

    // Keep derived declarations adjacent to their inputs while stopping before anything impure or dependency-touching to avoid changing evaluation order.
    function handleDerivedGrouping(body: TSESTree.Statement[], parent: BlockLike): void {
      const declaredIndices = new Map<string, number>();

      body.forEach((statement, index) => {
        if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
          const dependencies = new Set<string>();
          statement.declarations.forEach((declarator) => {
            collectPatternDependencies(
              declarator.id as TSESTree.BindingName | TSESTree.AssignmentPattern,
              dependencies,
            );
            if (declarator.init) {
              collectUsedIdentifiers(declarator.init, dependencies, { skipFunctions: true });
            }
          });

          const priorDependencies = Array.from(dependencies).filter((name) =>
            declaredIndices.has(name),
          );
          if (priorDependencies.length > 0 && !reportedStatements.has(statement)) {
            const lastDependencyIndex = Math.max(
              ...priorDependencies.map((name) => declaredIndices.get(name) ?? -1),
            );

            if (lastDependencyIndex < index - 1) {
              const declaredNames = getDeclaredNames(statement);
              const priorDependencySet = new Set(priorDependencies);
              // Avoid moving derived declarations across any impure or dependency-touching statement to keep evaluation order stable.
              const blockerExists = body
                .slice(lastDependencyIndex + 1, index)
                .some(
                  (between) =>
                    !isPureDeclaration(between, { allowHooks: false }) ||
                    statementDeclaresAny(between, priorDependencySet) ||
                    statementReferencesAny(between, priorDependencySet) ||
                    statementDeclaresAny(between, declaredNames) ||
                    statementReferencesAny(between, declaredNames),
                );

              if (!blockerExists) {
                const dependency = priorDependencies[0];
                const name = declaredNames.values().next().value ?? 'value';
                reportOnce(
                  statement,
                  'groupDerived',
                  {
                    dependency,
                    name,
                  },
                  (fixer) =>
                    buildMoveFix(
                      body,
                      index,
                      lastDependencyIndex + 1,
                      parent,
                      sourceCode,
                      fixer,
                    ),
                );
              }
            }
          }
        }

        const declared = getDeclaredNames(statement);
        declared.forEach((name) => declaredIndices.set(name, index));
      });
    }

    // Only move placeholder declarations with trivial initializers so we do not shift computed or side-effectful bindings whose evaluation timing matters.
    function handleLateDeclarations(body: TSESTree.Statement[], parent: BlockLike): void {
      body.forEach((statement, index) => {
        if (
          statement.type !== AST_NODE_TYPES.VariableDeclaration ||
          statement.declarations.length !== 1
        ) {
          return;
        }
        const [declarator] = statement.declarations;
        if (
          declarator.id.type !== AST_NODE_TYPES.Identifier ||
          (declarator.init &&
            declarator.init.type !== AST_NODE_TYPES.Identifier &&
            declarator.init.type !== AST_NODE_TYPES.Literal)
        ) {
          return;
        }
        const name = declarator.id.name;
        const dependencies = new Set<string>();
        if (declarator.init && declarator.init.type === AST_NODE_TYPES.Identifier) {
          dependencies.add(declarator.init.name);
        }

        const nameSet = new Set([name]);
        let usageIndex = -1;
        for (let cursor = index + 1; cursor < body.length; cursor += 1) {
          if (statementReferencesAny(body[cursor], nameSet)) {
            usageIndex = cursor;
            break;
          }
        }

        if (usageIndex === -1 || usageIndex <= index + 1) {
          return;
        }

        const intervening = body.slice(index + 1, usageIndex);
        // Only move across pure declarations that do not mention the placeholder or its initializer dependencies to avoid changing closure timing or TDZ behavior.
        const crossesImpureOrTracked = intervening.some((stmt) => {
          if (!isPureDeclaration(stmt, { allowHooks: false })) {
            return true;
          }
          if (statementDeclaresAny(stmt, nameSet) || statementMutatesAny(stmt, nameSet)) {
            return true;
          }
          if (
            dependencies.size > 0 &&
            (statementDeclaresAny(stmt, dependencies) ||
              statementReferencesAny(stmt, dependencies) ||
              statementMutatesAny(stmt, dependencies))
          ) {
            return true;
          }
          return false;
        });
        if (crossesImpureOrTracked) {
          return;
        }

        reportOnce(
          statement,
          'moveDeclarationCloser',
          { name },
          (fixer) => buildMoveFix(body, index, usageIndex, parent, sourceCode, fixer),
        );
      });
    }

    function extractCallExpression(
      expression: TSESTree.Expression,
    ): TSESTree.CallExpression | null {
      if (expression.type === AST_NODE_TYPES.CallExpression) {
        return expression;
      }
      if (
        expression.type === AST_NODE_TYPES.ChainExpression &&
        expression.expression.type === AST_NODE_TYPES.CallExpression
      ) {
        return expression.expression;
      }
      return null;
    }

  function collectCalleeDependencies(
    body: TSESTree.Statement[],
    callee: TSESTree.LeftHandSideExpression | TSESTree.PrivateIdentifier | TSESTree.Super,
    dependencies: Set<string>,
  ): void {
    if (callee.type !== AST_NODE_TYPES.Identifier) {
      return;
    }
    const name = callee.name;

    const functionDeclaration = body.find(
      (statement) =>
        statement.type === AST_NODE_TYPES.FunctionDeclaration && statement.id?.name === name,
    ) as TSESTree.FunctionDeclaration | undefined;
    if (functionDeclaration && functionDeclaration.body) {
      collectUsedIdentifiers(functionDeclaration.body, dependencies, { skipFunctions: true });
      return;
    }

    for (const statement of body) {
      if (statement.type !== AST_NODE_TYPES.VariableDeclaration) {
        continue;
      }
      for (const declarator of statement.declarations) {
        if (
          declarator.id.type === AST_NODE_TYPES.Identifier &&
          declarator.id.name === name &&
          declarator.init &&
          (declarator.init.type === AST_NODE_TYPES.FunctionExpression ||
            declarator.init.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          collectUsedIdentifiers(declarator.init.body, dependencies, { skipFunctions: true });
          return;
        }
      }
    }
  }

    function isSideEffectExpression(
      statement: TSESTree.Statement,
    ): statement is TSESTree.ExpressionStatement {
      if (statement.type !== AST_NODE_TYPES.ExpressionStatement) {
        return false;
      }
      return Boolean(extractCallExpression(statement.expression));
    }

    // Lift observable side effects above unrelated setup while never crossing hook calls or dependency declarations to preserve execution order.
    function handleSideEffects(body: TSESTree.Statement[], parent: BlockLike): void {
      body.forEach((statement, index) => {
        if (!isSideEffectExpression(statement)) {
          return;
        }

        const expression = statement.expression;
        const callExpression = extractCallExpression(expression);
        if (!callExpression) {
          return;
        }
        if (isHookCallee(callExpression.callee)) {
          return;
        }

        const dependencies = new Set<string>();
        collectUsedIdentifiers(expression, dependencies, { skipFunctions: true });
        collectCalleeDependencies(body, callExpression.callee, dependencies);

        const targetIndex = findEarliestSafeIndex(body, index, dependencies, { allowHooks: false });

        if (targetIndex === index) {
          return;
        }

        const effectText = truncateWithEllipsis(sourceCode.getText(statement).trim());
        reportOnce(
          statement,
          'moveSideEffect',
          { effect: effectText },
          (fixer) => buildMoveFix(body, index, targetIndex, parent, sourceCode, fixer),
        );
      });
    }

    function handleBlock(node: BlockLike): void {
      const statements = node.body;
      handleGuardHoists(statements, node);
      handleDerivedGrouping(statements, node);
      handleLateDeclarations(statements, node);
      handleSideEffects(statements, node);
    }

    return {
      Program(node) {
        handleBlock(node);
      },
      BlockStatement(node) {
        handleBlock(node);
      },
    };
  },
});

