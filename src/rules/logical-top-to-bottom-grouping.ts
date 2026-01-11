import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'moveGuardUp'
  | 'groupDerived'
  | 'moveDeclarationCloser'
  | 'moveSideEffect';

type Options = [];

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

type RuleExecutionContext = {
  context: TSESLint.RuleContext<MessageIds, Options>;
  sourceCode: TSESLint.SourceCode;
  reportedStatements: WeakSet<TSESTree.Statement>;
};

function isTypeNode(node: TSESTree.Node | undefined): boolean {
  if (!node) {
    return false;
  }
  if (TYPE_EXPRESSION_WRAPPERS.has(node.type)) {
    return false;
  }
  return node.type.startsWith('TS');
}

function unwrapTypeExpression(
  expression: TSESTree.Expression | TSESTree.PrivateIdentifier,
): TSESTree.Expression | TSESTree.PrivateIdentifier {
  switch (expression.type) {
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSInstantiationExpression:
      return expression.expression as TSESTree.Expression;
    default:
      return expression;
  }
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

function collectPatternDependencies(
  pattern:
    | TSESTree.BindingName
    | TSESTree.RestElement
    | TSESTree.AssignmentPattern,
  names: Set<string>,
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      return;
    case AST_NODE_TYPES.RestElement:
      collectPatternDependencies(
        pattern.argument as TSESTree.BindingName,
        names,
      );
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      collectUsedIdentifiers(pattern.right as TSESTree.Expression, names, {
        skipFunctions: true,
        includeFunctionCaptures: true,
      });
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
            collectUsedIdentifiers(prop.key, names, {
              skipFunctions: true,
              includeFunctionCaptures: true,
            });
          }
          collectPatternDependencies(
            prop.value as TSESTree.BindingName | TSESTree.AssignmentPattern,
            names,
          );
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          collectPatternDependencies(
            prop.argument as TSESTree.BindingName,
            names,
          );
        }
      });
      return;
    default:
      return;
  }
}

function processIdentifier(
  identifier: TSESTree.Identifier,
  names: Set<string>,
): void {
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
    !parent.computed &&
    !parent.shorthand
  ) {
    return true;
  }

  return false;
}

function shouldSkipFunction(
  node: TSESTree.Node,
  skipFunctions: boolean,
): boolean {
  return (
    skipFunctions &&
    (node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.ArrowFunctionExpression)
  );
}

function addChildNodesToStack(
  node: TSESTree.Node,
  stack: Array<TSESTree.Node>,
): void {
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

type TraverseResult = {
  skipChildren?: boolean;
  push?: TSESTree.Node[];
};

function traverseAst(
  node: TSESTree.Node,
  {
    skipFunctions,
    visit,
    onSkipFunction,
  }: {
    skipFunctions: boolean;
    visit: (node: TSESTree.Node) => TraverseResult | void;
    onSkipFunction?: (node: TSESTree.Node) => void;
  },
): void {
  const stack: Array<TSESTree.Node> = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (shouldSkipFunction(current, skipFunctions)) {
      if (onSkipFunction) {
        onSkipFunction(current);
      }
      continue;
    }

    const result = visit(current) ?? {};

    if (result.push) {
      result.push.forEach((child) => {
        if (ASTHelpers.isNode(child)) {
          stack.push(child);
        }
      });
    }

    if (result.skipChildren) {
      continue;
    }

    addChildNodesToStack(current, stack);
  }
}

function unwrapIifeCallee(
  callee:
    | TSESTree.LeftHandSideExpression
    | TSESTree.PrivateIdentifier
    | TSESTree.Super,
): TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | null {
  const node = callee as TSESTree.Node;
  if (
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return node as
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression;
  }

  if (TYPE_EXPRESSION_WRAPPERS.has(node.type) && 'expression' in node) {
    return unwrapIifeCallee(
      (node as TSESTree.TSAsExpression)
        .expression as TSESTree.LeftHandSideExpression,
    );
  }

  if (node.type === AST_NODE_TYPES.ChainExpression && 'expression' in node) {
    return unwrapIifeCallee(
      (node as TSESTree.ChainExpression)
        .expression as TSESTree.LeftHandSideExpression,
    );
  }

  return null;
}

function collectIifeDependencies(
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  names: Set<string>,
): void {
  collectFunctionCaptures(fn, names, {
    skipFunctions: true,
    includeFunctionCaptures: true,
  });
}

type CollectIdentifierOptions = {
  skipFunctions: boolean;
  includeFunctionCaptures?: boolean;
};

function collectFunctionScopedDeclarations(
  node: TSESTree.Node,
  declared: Set<string>,
): void {
  traverseAst(node, {
    skipFunctions: false,
    visit(current) {
      if (
        current !== node &&
        (current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression)
      ) {
        return { skipChildren: true };
      }

      if (current.type === AST_NODE_TYPES.FunctionDeclaration && current.id) {
        declared.add(current.id.name);
        return { skipChildren: true };
      }

      if (current.type === AST_NODE_TYPES.VariableDeclaration) {
        current.declarations.forEach((declarator) =>
          collectDeclaredNamesFromPattern(
            declarator.id as
              | TSESTree.BindingName
              | TSESTree.RestElement
              | TSESTree.AssignmentPattern,
            declared,
          ),
        );
      }

      if (current.type === AST_NODE_TYPES.ClassDeclaration && current.id) {
        declared.add(current.id.name);
        return { skipChildren: true };
      }

      if (current.type === AST_NODE_TYPES.CatchClause && current.param) {
        collectDeclaredNamesFromPattern(
          current.param as
            | TSESTree.BindingName
            | TSESTree.RestElement
            | TSESTree.AssignmentPattern,
          declared,
        );
      }

      return undefined;
    },
  });
}

function collectFunctionCaptures(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
  names: Set<string>,
  options: CollectIdentifierOptions,
): void {
  const declared = new Set<string>();
  if (fn.type !== AST_NODE_TYPES.ArrowFunctionExpression && fn.id) {
    declared.add(fn.id.name);
  }
  fn.params.forEach((param) =>
    collectDeclaredNamesFromPattern(
      param as
        | TSESTree.BindingName
        | TSESTree.RestElement
        | TSESTree.AssignmentPattern,
      declared,
    ),
  );

  if (fn.body.type === AST_NODE_TYPES.BlockStatement) {
    collectFunctionScopedDeclarations(fn.body, declared);
  }

  const used = new Set<string>();
  fn.params.forEach((param) => {
    collectUsedIdentifiers(param, used, {
      skipFunctions: options.skipFunctions,
      includeFunctionCaptures: options.includeFunctionCaptures,
    });
  });
  collectUsedIdentifiers(fn.body, used, {
    skipFunctions: options.skipFunctions,
    includeFunctionCaptures: options.includeFunctionCaptures,
  });

  used.forEach((name) => {
    if (!declared.has(name)) {
      names.add(name);
    }
  });
}

function collectUsedIdentifiers(
  node: TSESTree.Node,
  names: Set<string>,
  { skipFunctions, includeFunctionCaptures = false }: CollectIdentifierOptions,
): void {
  traverseAst(node, {
    skipFunctions,
    onSkipFunction: includeFunctionCaptures
      ? createFunctionCaptureHandler(names, {
          skipFunctions,
          includeFunctionCaptures,
        })
      : undefined,
    visit(current) {
      if (current.type === AST_NODE_TYPES.Identifier) {
        processIdentifier(current, names);
        return { skipChildren: true };
      }
      if (skipFunctions && current.type === AST_NODE_TYPES.CallExpression) {
        processCallExpression(current, names);
      }
      return undefined;
    },
  });
}

function createFunctionCaptureHandler(
  names: Set<string>,
  options: CollectIdentifierOptions,
): (fnNode: TSESTree.Node) => void {
  return (fnNode) => {
    if (
      fnNode.type === AST_NODE_TYPES.FunctionDeclaration ||
      fnNode.type === AST_NODE_TYPES.FunctionExpression ||
      fnNode.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      collectFunctionCaptures(fnNode, names, {
        skipFunctions: true,
        includeFunctionCaptures: options.includeFunctionCaptures,
      });
    }
  };
}

function processCallExpression(
  node: TSESTree.CallExpression,
  names: Set<string>,
): void {
  const iife = unwrapIifeCallee(node.callee);
  if (iife) {
    collectIifeDependencies(iife, names);
  }
}

function collectDeclaredNamesFromPattern(
  pattern:
    | TSESTree.BindingName
    | TSESTree.RestElement
    | TSESTree.AssignmentPattern,
  names: Set<string>,
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      names.add(pattern.name);
      return;
    case AST_NODE_TYPES.RestElement:
      collectDeclaredNamesFromPattern(
        pattern.argument as TSESTree.BindingName,
        names,
      );
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      collectDeclaredNamesFromPattern(
        pattern.left as TSESTree.BindingName,
        names,
      );
      return;
    case AST_NODE_TYPES.ArrayPattern:
      pattern.elements.forEach((element) => {
        if (element) {
          collectDeclaredNamesFromPattern(
            element as TSESTree.BindingName,
            names,
          );
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
          collectDeclaredNamesFromPattern(
            prop.argument as TSESTree.BindingName,
            names,
          );
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
        declarator.id as
          | TSESTree.BindingName
          | TSESTree.ArrayPattern
          | TSESTree.ObjectPattern,
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

function statementReferencesAny(
  statement: TSESTree.Statement,
  names: Set<string>,
): boolean {
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

function collectAssignedNamesFromPattern(
  target: TSESTree.Node,
  names: Set<string>,
): void {
  if (
    TYPE_EXPRESSION_WRAPPERS.has(target.type) &&
    'expression' in (target as { expression?: unknown })
  ) {
    collectAssignedNamesFromPattern(
      (target as { expression: TSESTree.Node }).expression as TSESTree.Node,
      names,
    );
    return;
  }

  switch (target.type) {
    case AST_NODE_TYPES.Identifier:
      names.add((target as TSESTree.Identifier).name);
      return;
    case AST_NODE_TYPES.MemberExpression: {
      let cursor = (target as TSESTree.MemberExpression)
        .object as TSESTree.Expression;
      while (true) {
        if (
          TYPE_EXPRESSION_WRAPPERS.has(cursor.type) &&
          'expression' in (cursor as { expression?: unknown })
        ) {
          cursor = (cursor as { expression: TSESTree.Expression })
            .expression as TSESTree.Expression;
          continue;
        }
        if (cursor.type === AST_NODE_TYPES.MemberExpression) {
          cursor = (cursor as TSESTree.MemberExpression)
            .object as TSESTree.Expression;
          continue;
        }
        break;
      }
      if (cursor.type === AST_NODE_TYPES.Identifier) {
        names.add((cursor as TSESTree.Identifier).name);
      }
      return;
    }
    case AST_NODE_TYPES.AssignmentPattern:
      collectAssignedNamesFromPattern(
        (target as TSESTree.AssignmentPattern).left as TSESTree.Node,
        names,
      );
      return;
    case AST_NODE_TYPES.RestElement:
      collectAssignedNamesFromPattern(
        (target as TSESTree.RestElement).argument as TSESTree.Node,
        names,
      );
      return;
    case AST_NODE_TYPES.ArrayPattern:
      (target as TSESTree.ArrayPattern).elements.forEach((element) => {
        if (element) {
          collectAssignedNamesFromPattern(element as TSESTree.Node, names);
        }
      });
      return;
    case AST_NODE_TYPES.ObjectPattern:
      (target as TSESTree.ObjectPattern).properties.forEach((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          collectAssignedNamesFromPattern(prop.value as TSESTree.Node, names);
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          collectAssignedNamesFromPattern(
            prop.argument as TSESTree.Node,
            names,
          );
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
  traverseAst(node, {
    skipFunctions,
    visit(current) {
      if (current.type === AST_NODE_TYPES.AssignmentExpression) {
        const push = ASTHelpers.isNode(current.right)
          ? ([current.right] as TSESTree.Node[])
          : undefined;
        collectAssignedNamesFromPattern(current.left as TSESTree.Node, names);
        return { skipChildren: true, push };
      }

      if (current.type === AST_NODE_TYPES.UpdateExpression) {
        collectAssignedNamesFromPattern(
          current.argument as TSESTree.Node,
          names,
        );
        return { skipChildren: true };
      }

      return undefined;
    },
  });
}

function statementMutatesAny(
  statement: TSESTree.Statement,
  names: Set<string>,
): boolean {
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

/**
 * Mutations create ordering barriers: once a name is reassigned, moving statements
 * across that mutation can change observable state. Guard moves stop before the
 * first mutation to keep evaluation order stable.
 */
function isIdentifierMutated(
  body: TSESTree.Statement[],
  name: string,
  beforeIndex: number,
): boolean {
  const target = new Set([name]);
  let seenDeclaration = false;
  for (let index = 0; index < beforeIndex; index += 1) {
    const statement = body[index];
    if (statementMutatesAny(statement, target)) {
      return true;
    }
    if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        const declaredNames = new Set<string>();
        collectDeclaredNamesFromPattern(
          declarator.id as
            | TSESTree.BindingName
            | TSESTree.RestElement
            | TSESTree.AssignmentPattern,
          declaredNames,
        );
        if (!declaredNames.has(name)) {
          continue;
        }
        if (seenDeclaration && declarator.init) {
          return true;
        }
        seenDeclaration = true;
      }
    }
  }
  return false;
}

function initializerIsSafe(
  expression: TSESTree.Expression | TSESTree.PrivateIdentifier,
  { allowHooks }: { allowHooks: boolean },
): boolean {
  // Hook calls are treated as impure so we never reorder React hook execution unless a callsite explicitly opts in.
  const unwrapped = unwrapTypeExpression(expression);
  if (unwrapped !== expression) {
    return initializerIsSafe(unwrapped as TSESTree.Expression, { allowHooks });
  }

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
          initializerIsSafe(expression.property as TSESTree.Expression, {
            allowHooks,
          }) &&
          initializerIsSafe(expression.object as TSESTree.Expression, {
            allowHooks,
          })
        );
      }
      return initializerIsSafe(expression.object as TSESTree.Expression, {
        allowHooks,
      });
    case AST_NODE_TYPES.ArrayExpression:
      return expression.elements.every((element) => {
        if (!element) {
          return true;
        }
        if (element.type === AST_NODE_TYPES.SpreadElement) {
          return false;
        }
        return initializerIsSafe(element as TSESTree.Expression, {
          allowHooks,
        });
      });
    case AST_NODE_TYPES.ObjectExpression:
      return expression.properties.every((prop) => {
        if (prop.type !== AST_NODE_TYPES.Property) {
          return false;
        }
        if (prop.computed) {
          if (
            !initializerIsSafe(prop.key as TSESTree.Expression, { allowHooks })
          ) {
            return false;
          }
        }
        return initializerIsSafe(prop.value as TSESTree.Expression, {
          allowHooks,
        });
      });
    case AST_NODE_TYPES.UnaryExpression:
      if (expression.operator === 'delete') {
        return false;
      }
      return initializerIsSafe(expression.argument as TSESTree.Expression, {
        allowHooks,
      });
    case AST_NODE_TYPES.BinaryExpression:
    case AST_NODE_TYPES.LogicalExpression:
      return (
        initializerIsSafe(expression.left as TSESTree.Expression, {
          allowHooks,
        }) &&
        initializerIsSafe(expression.right as TSESTree.Expression, {
          allowHooks,
        })
      );
    case AST_NODE_TYPES.ConditionalExpression:
      return (
        initializerIsSafe(expression.test as TSESTree.Expression, {
          allowHooks,
        }) &&
        initializerIsSafe(expression.consequent as TSESTree.Expression, {
          allowHooks,
        }) &&
        initializerIsSafe(expression.alternate as TSESTree.Expression, {
          allowHooks,
        })
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
      return initializerIsSafe(expression.expression as TSESTree.Expression, {
        allowHooks,
      });
    default:
      return false;
  }
}

function patternIsSafe(
  pattern:
    | TSESTree.BindingName
    | TSESTree.RestElement
    | TSESTree.AssignmentPattern,
  { allowHooks }: { allowHooks: boolean },
): boolean {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      return true;
    case AST_NODE_TYPES.RestElement:
      return patternIsSafe(pattern.argument as TSESTree.BindingName, {
        allowHooks,
      });
    case AST_NODE_TYPES.AssignmentPattern:
      return (
        initializerIsSafe(pattern.right as TSESTree.Expression, {
          allowHooks,
        }) &&
        patternIsSafe(pattern.left as TSESTree.BindingName, { allowHooks })
      );
    case AST_NODE_TYPES.ArrayPattern:
      return pattern.elements.every(
        (element) =>
          !element ||
          patternIsSafe(element as TSESTree.BindingName, { allowHooks }),
      );
    case AST_NODE_TYPES.ObjectPattern:
      return pattern.properties.every((prop) => {
        if (prop.type === AST_NODE_TYPES.RestElement) {
          return patternIsSafe(prop.argument as TSESTree.BindingName, {
            allowHooks,
          });
        }
        if (prop.type !== AST_NODE_TYPES.Property) {
          return false;
        }
        if (prop.computed && ASTHelpers.isNode(prop.key)) {
          if (
            !initializerIsSafe(prop.key as TSESTree.Expression, { allowHooks })
          ) {
            return false;
          }
        }
        return patternIsSafe(
          prop.value as TSESTree.BindingName | TSESTree.AssignmentPattern,
          { allowHooks },
        );
      });
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
    if (
      declarator.id &&
      ASTHelpers.isNode(declarator.id) &&
      !patternIsSafe(
        declarator.id as
          | TSESTree.BindingName
          | TSESTree.RestElement
          | TSESTree.AssignmentPattern,
        { allowHooks },
      )
    ) {
      return false;
    }
    if (!declarator.init) {
      return true;
    }
    return initializerIsSafe(declarator.init as TSESTree.Expression, {
      allowHooks,
    });
  });
}

function statementDeclaresAny(
  statement: TSESTree.Statement,
  names: Set<string>,
): boolean {
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

function getStartWithComments(
  statement: TSESTree.Statement,
  sourceCode: TSESLint.SourceCode,
): number {
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
  const closingBraceOffset =
    parent.type === AST_NODE_TYPES.BlockStatement ? 1 : 0;
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

function reportOnce(
  { context, reportedStatements }: RuleExecutionContext,
  statement: TSESTree.Statement,
  messageId: MessageIds,
  data: Record<string, string>,
  fix: (fixer: TSESLint.RuleFixer) => TSESLint.RuleFix | null,
): void {
  if (reportedStatements.has(statement)) {
    return;
  }
  reportedStatements.add(statement);
  context.report({ node: statement, messageId, data, fix });
}

function isGuardIfStatement(
  statement: TSESTree.Statement,
): statement is TSESTree.IfStatement {
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

function handleGuardHoists(
  ruleContext: RuleExecutionContext,
  body: TSESTree.Statement[],
  parent: BlockLike,
): void {
  const { sourceCode } = ruleContext;
  body.forEach((statement, index) => {
    if (!isGuardIfStatement(statement)) {
      return;
    }

    const guardDependencies = new Set<string>();
    collectUsedIdentifiers(statement.test, guardDependencies, {
      skipFunctions: true,
      includeFunctionCaptures: true,
    });
    collectUsedIdentifiers(statement.consequent, guardDependencies, {
      skipFunctions: true,
      includeFunctionCaptures: true,
    });

    const targetIndex = findEarliestSafeIndex(body, index, guardDependencies, {
      allowHooks: false,
    });

    if (targetIndex === index) {
      return;
    }

    reportOnce(
      ruleContext,
      statement,
      'moveGuardUp',
      { guard: truncateWithEllipsis(sourceCode.getText(statement.test)) },
      (fixer) =>
        buildMoveFix(body, index, targetIndex, parent, sourceCode, fixer),
    );
  });
}

function handleDerivedGrouping(
  ruleContext: RuleExecutionContext,
  body: TSESTree.Statement[],
  parent: BlockLike,
): void {
  const declaredIndices = new Map<string, number>();
  const { sourceCode } = ruleContext;

  body.forEach((statement, index) => {
    if (isVariableDeclaration(statement)) {
      processVariableDeclaration(
        ruleContext,
        statement,
        index,
        body,
        declaredIndices,
        parent,
        sourceCode,
      );
    }

    trackDeclaredNames(statement, index, declaredIndices);
  });
}

function isVariableDeclaration(
  statement: TSESTree.Statement,
): statement is TSESTree.VariableDeclaration {
  return statement.type === AST_NODE_TYPES.VariableDeclaration;
}

function processVariableDeclaration(
  ruleContext: RuleExecutionContext,
  statement: TSESTree.VariableDeclaration,
  index: number,
  body: TSESTree.Statement[],
  declaredIndices: Map<string, number>,
  parent: BlockLike,
  sourceCode: TSESLint.SourceCode,
): void {
  const dependencies = collectDependencies(statement);
  const priorDependencies = findPriorDependencies(
    dependencies,
    declaredIndices,
  );

  if (
    priorDependencies.length === 0 ||
    ruleContext.reportedStatements.has(statement)
  ) {
    return;
  }

  const lastDependencyIndex = findLastDependencyIndex(
    priorDependencies,
    declaredIndices,
  );

  if (lastDependencyIndex >= index - 1) {
    return;
  }

  const declaredNames = getDeclaredNames(statement);
  const priorDependencySet = new Set(priorDependencies);

  if (
    hasBlockers(
      body,
      lastDependencyIndex,
      index,
      priorDependencySet,
      declaredNames,
    )
  ) {
    return;
  }

  reportDerivedGroupingViolation(
    ruleContext,
    statement,
    priorDependencies,
    declaredNames,
    body,
    index,
    lastDependencyIndex,
    parent,
    sourceCode,
  );
}

function collectDependencies(
  statement: TSESTree.VariableDeclaration,
): Set<string> {
  const dependencies = new Set<string>();

  statement.declarations.forEach((declarator) => {
    collectPatternDependencies(
      declarator.id as TSESTree.BindingName | TSESTree.AssignmentPattern,
      dependencies,
    );
    if (declarator.init) {
      collectUsedIdentifiers(declarator.init, dependencies, {
        skipFunctions: true,
        includeFunctionCaptures: true,
      });
    }
  });

  return dependencies;
}

function findPriorDependencies(
  dependencies: Set<string>,
  declaredIndices: Map<string, number>,
): string[] {
  return Array.from(dependencies).filter((name) => declaredIndices.has(name));
}

function findLastDependencyIndex(
  priorDependencies: string[],
  declaredIndices: Map<string, number>,
): number {
  return Math.max(
    ...priorDependencies.map((name) => declaredIndices.get(name) ?? -1),
  );
}

function hasBlockers(
  body: TSESTree.Statement[],
  lastDependencyIndex: number,
  currentIndex: number,
  priorDependencySet: Set<string>,
  declaredNames: Set<string>,
): boolean {
  return body
    .slice(lastDependencyIndex + 1, currentIndex)
    .some(
      (between) =>
        !isPureDeclaration(between, { allowHooks: false }) ||
        statementDeclaresAny(between, priorDependencySet) ||
        statementReferencesAny(between, priorDependencySet) ||
        statementDeclaresAny(between, declaredNames) ||
        statementReferencesAny(between, declaredNames),
    );
}

function reportDerivedGroupingViolation(
  ruleContext: RuleExecutionContext,
  statement: TSESTree.Statement,
  priorDependencies: string[],
  declaredNames: Set<string>,
  body: TSESTree.Statement[],
  currentIndex: number,
  lastDependencyIndex: number,
  parent: BlockLike,
  sourceCode: TSESLint.SourceCode,
): void {
  const dependency = priorDependencies[0];
  const name = declaredNames.values().next().value ?? 'value';

  reportOnce(
    ruleContext,
    statement,
    'groupDerived',
    {
      dependency,
      name,
    },
    (fixer) =>
      buildMoveFix(
        body,
        currentIndex,
        lastDependencyIndex + 1,
        parent,
        sourceCode,
        fixer,
      ),
  );
}

function trackDeclaredNames(
  statement: TSESTree.Statement,
  index: number,
  declaredIndices: Map<string, number>,
): void {
  const declared = getDeclaredNames(statement);
  declared.forEach((name) => declaredIndices.set(name, index));
}

/**
 * Detects a dependency barrier where a variable is declared before a loop, mutated inside
 * the loop, and then used after the loop.
 *
 * This pattern requires special handling because moving the declaration closer to the
 * first usage (the loop) would be correct for the first iteration but might be invalid
 * if the declaration needs to persist across iterations or if its value after the loop
 * depends on the mutations within.
 *
 * This function specifically:
 * 1. Checks if the first usage is a loop (For, ForIn, ForOf, While, DoWhile).
 * 2. Verifies the loop mutates any variable in the nameSet (via statementMutatesAny).
 * 3. Verifies there is a subsequent usage after the loop (via statementReferencesAny).
 *
 * Assumptions:
 * - nameSet contains the name(s) being tracked for late declaration.
 * - body is the array of statements in the current block.
 * - usageIndex is the index of the first usage of the variable(s) in the body.
 */
function isMutatedInLoopAndUsedAfter(
  body: TSESTree.Statement[],
  usageIndex: number,
  nameSet: Set<string>,
): boolean {
  const firstUsage = body[usageIndex];
  const isLoop =
    firstUsage.type === AST_NODE_TYPES.ForStatement ||
    firstUsage.type === AST_NODE_TYPES.ForInStatement ||
    firstUsage.type === AST_NODE_TYPES.ForOfStatement ||
    firstUsage.type === AST_NODE_TYPES.WhileStatement ||
    firstUsage.type === AST_NODE_TYPES.DoWhileStatement;

  if (!isLoop) {
    return false;
  }

  if (!statementMutatesAny(firstUsage, nameSet)) {
    return false;
  }

  for (let i = usageIndex + 1; i < body.length; i += 1) {
    if (statementReferencesAny(body[i], nameSet)) {
      return true;
    }
  }

  return false;
}

function handleLateDeclarations(
  ruleContext: RuleExecutionContext,
  body: TSESTree.Statement[],
  parent: BlockLike,
): void {
  const { sourceCode } = ruleContext;

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

    // Loop mutations create a dependency barrier: declarations that precede loops and are
    // mutated inside them cannot be safely moved, as the declaration must be visible across
    // all iterations. Prevent false positives for this pattern.
    if (isMutatedInLoopAndUsedAfter(body, usageIndex, nameSet)) {
      return;
    }

    const intervening = body.slice(index + 1, usageIndex);
    // Only move across pure declarations that do not mention the placeholder or its initializer dependencies to avoid changing closure timing or TDZ behavior.
    const crossesImpureOrTracked = intervening.some((stmt) => {
      if (!isPureDeclaration(stmt, { allowHooks: false })) {
        return true;
      }
      if (
        statementDeclaresAny(stmt, nameSet) ||
        statementMutatesAny(stmt, nameSet)
      ) {
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
      ruleContext,
      statement,
      'moveDeclarationCloser',
      { name },
      (fixer) =>
        buildMoveFix(body, index, usageIndex, parent, sourceCode, fixer),
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

function collectFunctionBodyDependencies(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
  dependencies: Set<string>,
  context: {
    body: TSESTree.Statement[];
    callIndex: number;
    visitedCallees: Set<string>;
  },
): boolean {
  if (!fn.body) {
    return true;
  }
  collectFunctionCaptures(fn, dependencies, {
    skipFunctions: true,
    includeFunctionCaptures: true,
  });

  let resolved = true;
  traverseAst(fn.body, {
    skipFunctions: true,
    visit(current) {
      if (
        current.type !== AST_NODE_TYPES.CallExpression &&
        current.type !== AST_NODE_TYPES.ChainExpression
      ) {
        return undefined;
      }

      const callExpression =
        current.type === AST_NODE_TYPES.CallExpression
          ? current
          : extractCallExpression(current as TSESTree.Expression);
      if (!callExpression) {
        return undefined;
      }

      const nestedResolved = collectCalleeDependencies(
        context.body,
        callExpression.callee,
        dependencies,
        context.callIndex,
        context.visitedCallees,
      );
      if (!nestedResolved) {
        resolved = false;
        return { skipChildren: true };
      }
      return undefined;
    },
  });

  return resolved;
}

function resolveValueForIdentifier(
  body: TSESTree.Statement[],
  name: string,
  beforeIndex: number,
):
  | TSESTree.Expression
  | TSESTree.ClassDeclaration
  | TSESTree.ClassExpression
  | null {
  for (
    let index = Math.min(beforeIndex, body.length) - 1;
    index >= 0;
    index -= 1
  ) {
    const statement = body[index];
    if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        if (
          declarator.id.type === AST_NODE_TYPES.Identifier &&
          declarator.id.name === name &&
          declarator.init &&
          ASTHelpers.isNode(declarator.init)
        ) {
          return declarator.init as TSESTree.Expression;
        }
      }
    }
    if (
      statement.type === AST_NODE_TYPES.ClassDeclaration &&
      statement.id?.name === name
    ) {
      return statement;
    }
    if (
      statement.type === AST_NODE_TYPES.ExpressionStatement &&
      statement.expression.type === AST_NODE_TYPES.AssignmentExpression &&
      statement.expression.left.type === AST_NODE_TYPES.Identifier &&
      statement.expression.left.name === name &&
      ASTHelpers.isNode(statement.expression.right)
    ) {
      return statement.expression.right as TSESTree.Expression;
    }
  }
  return null;
}

function resolveValueNode(
  body: TSESTree.Statement[],
  node:
    | TSESTree.Expression
    | TSESTree.ClassDeclaration
    | TSESTree.ClassExpression,
  visited: Set<string>,
  beforeIndex: number,
):
  | TSESTree.Expression
  | TSESTree.ClassDeclaration
  | TSESTree.ClassExpression
  | null {
  if (node.type === AST_NODE_TYPES.Identifier) {
    if (visited.has(node.name)) {
      return null;
    }
    visited.add(node.name);
    const resolved = resolveValueForIdentifier(body, node.name, beforeIndex);
    if (!resolved) {
      return null;
    }
    return resolveValueNode(
      body,
      resolved as TSESTree.Expression,
      visited,
      beforeIndex,
    );
  }

  if (
    node.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier
  ) {
    const resolvedClass = resolveValueForIdentifier(
      body,
      node.callee.name,
      beforeIndex,
    );
    if (
      resolvedClass &&
      (resolvedClass.type === AST_NODE_TYPES.ClassDeclaration ||
        resolvedClass.type === AST_NODE_TYPES.ClassExpression)
    ) {
      return resolvedClass;
    }
  }

  return node;
}

function resolveMemberFunction(
  body: TSESTree.Statement[],
  member: TSESTree.MemberExpression,
  beforeIndex: number,
): TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | null {
  if (member.computed || member.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const path: string[] = [];
  let cursor:
    | TSESTree.LeftHandSideExpression
    | TSESTree.PrivateIdentifier
    | TSESTree.Super
    | null = member;

  while (
    cursor &&
    cursor.type === AST_NODE_TYPES.MemberExpression &&
    !cursor.computed &&
    cursor.property.type === AST_NODE_TYPES.Identifier
  ) {
    path.unshift(cursor.property.name);
    cursor = cursor.object as
      | TSESTree.LeftHandSideExpression
      | TSESTree.PrivateIdentifier
      | TSESTree.Super
      | null;
  }

  if (!cursor || cursor.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  path.unshift(cursor.name);
  const [root, ...segments] = path;
  const initialValue = resolveValueForIdentifier(body, root, beforeIndex);
  if (!initialValue) {
    return null;
  }

  const visited = new Set<string>([root]);
  return descend(
    resolveValueNode(body, initialValue, visited, beforeIndex),
    segments,
    visited,
  );

  function descend(
    value:
      | TSESTree.Expression
      | TSESTree.ClassDeclaration
      | TSESTree.ClassExpression
      | null,
    remaining: string[],
    visitedNames: Set<string>,
  ): TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | null {
    if (!value) {
      return null;
    }

    if (remaining.length === 0) {
      if (
        value.type === AST_NODE_TYPES.FunctionExpression ||
        value.type === AST_NODE_TYPES.ArrowFunctionExpression
      ) {
        return value;
      }
      return null;
    }

    const [segment, ...rest] = remaining;

    if (value.type === AST_NODE_TYPES.ObjectExpression) {
      const property = value.properties.find(
        (prop) =>
          prop.type === AST_NODE_TYPES.Property &&
          !prop.computed &&
          prop.key.type === AST_NODE_TYPES.Identifier &&
          prop.key.name === segment,
      ) as TSESTree.Property | undefined;

      if (!property) {
        return null;
      }

      const resolved = resolveValueNode(
        body,
        property.value as TSESTree.Expression,
        visitedNames,
        beforeIndex,
      );
      return descend(resolved, rest, visitedNames);
    }

    if (
      value.type === AST_NODE_TYPES.ClassDeclaration ||
      value.type === AST_NODE_TYPES.ClassExpression
    ) {
      const method = value.body.body.find(
        (memberDef) =>
          memberDef.type === AST_NODE_TYPES.MethodDefinition &&
          !memberDef.computed &&
          memberDef.key.type === AST_NODE_TYPES.Identifier &&
          memberDef.key.name === segment,
      ) as TSESTree.MethodDefinition | undefined;

      if (!method) {
        return null;
      }

      const resolved = resolveValueNode(
        body,
        method.value as TSESTree.FunctionExpression,
        visitedNames,
        beforeIndex,
      );
      return descend(resolved, rest, visitedNames);
    }

    return null;
  }
}

function getMemberCalleeKey(member: TSESTree.MemberExpression): string | null {
  if (member.computed || member.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const parts: string[] = [member.property.name];
  let cursor: TSESTree.Expression = member.object as TSESTree.Expression;
  while (
    cursor.type === AST_NODE_TYPES.MemberExpression &&
    !cursor.computed &&
    cursor.property.type === AST_NODE_TYPES.Identifier
  ) {
    parts.unshift(cursor.property.name);
    cursor = cursor.object as TSESTree.Expression;
  }

  if (cursor.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }
  parts.unshift(cursor.name);
  return parts.join('.');
}

function unwrapCalleeExpression(
  callee:
    | TSESTree.LeftHandSideExpression
    | TSESTree.PrivateIdentifier
    | TSESTree.Super
    | TSESTree.ChainExpression,
):
  | TSESTree.LeftHandSideExpression
  | TSESTree.PrivateIdentifier
  | TSESTree.Super
  | TSESTree.ChainExpression {
  let current = callee;
  while (true) {
    if (TYPE_EXPRESSION_WRAPPERS.has(current.type) && 'expression' in current) {
      current = (current as TSESTree.TSAsExpression).expression as
        | TSESTree.LeftHandSideExpression
        | TSESTree.PrivateIdentifier
        | TSESTree.Super;
      continue;
    }
    if (
      current.type === AST_NODE_TYPES.ChainExpression &&
      'expression' in current
    ) {
      current = (current as TSESTree.ChainExpression).expression as
        | TSESTree.LeftHandSideExpression
        | TSESTree.PrivateIdentifier
        | TSESTree.Super;
      continue;
    }
    break;
  }
  return current;
}

function collectCalleeDependencies(
  body: TSESTree.Statement[],
  callee:
    | TSESTree.LeftHandSideExpression
    | TSESTree.PrivateIdentifier
    | TSESTree.Super
    | TSESTree.ChainExpression,
  dependencies: Set<string>,
  callIndex: number,
  visitedCallees: Set<string> = new Set<string>(),
): boolean {
  const unwrappedCallee = unwrapCalleeExpression(callee);
  if (unwrappedCallee !== callee) {
    return collectCalleeDependencies(
      body,
      unwrappedCallee,
      dependencies,
      callIndex,
      visitedCallees,
    );
  }

  if (
    callee.type === AST_NODE_TYPES.FunctionExpression ||
    callee.type === AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return collectFunctionBodyDependencies(callee, dependencies, {
      body,
      callIndex,
      visitedCallees,
    });
  }

  if (callee.type === AST_NODE_TYPES.Identifier) {
    const name = callee.name;
    if (visitedCallees.has(name)) {
      return true;
    }
    visitedCallees.add(name);
    if (isIdentifierMutated(body, name, callIndex)) {
      return false;
    }

    // Function declarations are hoisted, and duplicate declarations bind the name to the last
    // declaration in source order. Scanning from the end also finds the implementation in
    // TypeScript overloads (where earlier signatures omit the body).
    let functionDeclaration: TSESTree.FunctionDeclaration | null = null;
    for (let index = body.length - 1; index >= 0; index -= 1) {
      const statement = body[index];
      const declaration =
        statement.type === AST_NODE_TYPES.FunctionDeclaration
          ? statement
          : statement.type === AST_NODE_TYPES.ExportNamedDeclaration &&
            statement.declaration?.type === AST_NODE_TYPES.FunctionDeclaration
          ? statement.declaration
          : null;

      if (declaration?.id?.name !== name) {
        continue;
      }

      functionDeclaration = declaration;
      if (functionDeclaration.body) {
        break;
      }
    }

    if (functionDeclaration?.body) {
      return collectFunctionBodyDependencies(
        functionDeclaration,
        dependencies,
        {
          body,
          callIndex,
          visitedCallees,
        },
      );
    }

    for (let index = callIndex - 1; index >= 0; index -= 1) {
      const statement = body[index];
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
          return collectFunctionBodyDependencies(
            declarator.init,
            dependencies,
            {
              body,
              callIndex,
              visitedCallees,
            },
          );
        }
      }
    }
    return true;
  }

  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    const memberKey = getMemberCalleeKey(callee);
    if (memberKey) {
      if (visitedCallees.has(memberKey)) {
        return true;
      }
      visitedCallees.add(memberKey);
    }

    const rootName =
      callee.object.type === AST_NODE_TYPES.Identifier
        ? callee.object.name
        : null;
    if (rootName && isIdentifierMutated(body, rootName, callIndex)) {
      return false;
    }
    const memberFunction = resolveMemberFunction(body, callee, callIndex);
    if (memberFunction) {
      return collectFunctionBodyDependencies(memberFunction, dependencies, {
        body,
        callIndex,
        visitedCallees,
      });
    }
    if (rootName) {
      const declaredBeforeCall = body
        .slice(0, callIndex)
        .some((statement) =>
          statementDeclaresAny(statement, new Set([rootName])),
        );
      if (declaredBeforeCall) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function isSideEffectExpression(
  statement: TSESTree.Statement,
): statement is TSESTree.ExpressionStatement {
  if (statement.type !== AST_NODE_TYPES.ExpressionStatement) {
    return false;
  }
  return Boolean(extractCallExpression(statement.expression));
}

function handleSideEffects(
  ruleContext: RuleExecutionContext,
  body: TSESTree.Statement[],
  parent: BlockLike,
): void {
  const { sourceCode } = ruleContext;

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
    collectUsedIdentifiers(expression, dependencies, {
      skipFunctions: true,
      includeFunctionCaptures: true,
    });
    const calleeResolved = collectCalleeDependencies(
      body,
      callExpression.callee,
      dependencies,
      index,
    );
    if (!calleeResolved) {
      return;
    }

    const targetIndex = findEarliestSafeIndex(body, index, dependencies, {
      allowHooks: false,
    });

    if (targetIndex === index) {
      return;
    }

    const effectText = truncateWithEllipsis(
      sourceCode.getText(statement).trim(),
    );
    reportOnce(
      ruleContext,
      statement,
      'moveSideEffect',
      { effect: effectText },
      (fixer) =>
        buildMoveFix(body, index, targetIndex, parent, sourceCode, fixer),
    );
  });
}

function handleBlock(ruleContext: RuleExecutionContext, node: BlockLike): void {
  const statements = node.body;
  handleGuardHoists(ruleContext, statements, node);
  handleDerivedGrouping(ruleContext, statements, node);
  handleLateDeclarations(ruleContext, statements, node);
  handleSideEffects(ruleContext, statements, node);
}

export const logicalTopToBottomGrouping: TSESLint.RuleModule<
  MessageIds,
  Options
> = createRule<Options, MessageIds>({
  name: 'logical-top-to-bottom-grouping',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce logical top-to-bottom grouping of related statements',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      moveGuardUp: `What's wrong: the guard "{{guard}}" appears after setup it can skip. Why it matters: readers miss the early-exit path and unnecessary work may execute; unsafe reordering can also introduce TDZ errors when guards reference values declared below. How to fix: place the guard immediately before the setup it protects.`,
      groupDerived: `What's wrong: "{{name}}" depends on "{{dependency}}" but is separated by unrelated statements. Why it matters: scattered dependencies make the input→output flow harder to follow and increase cognitive load; grouping them clarifies the logical relationship. How to fix: move "{{name}}" next to "{{dependency}}" so they form a cohesive unit.`,
      moveDeclarationCloser: `What's wrong: "{{name}}" is declared far from its first use. Why it matters: distant declarations scatter the flow and make the execution order harder to follow; readers must mentally track when the variable becomes available. How to fix: move "{{name}}" next to its first usage.`,
      moveSideEffect: `What's wrong: the side effect "{{effect}}" is buried after unrelated setup. Why it matters: chronological flow becomes unclear and readers may assume the effect happens later than it actually does. How to fix: emit observable effects before unrelated initialization to keep the temporal order obvious.`,
    },
  },
  defaultOptions: [],
  create(context) {
    // Prefer context.sourceCode when present to avoid deprecated getSourceCode() while remaining
    // compatible with ESLint versions that omit the property.
    const sourceCode =
      (
        context as TSESLint.RuleContext<MessageIds, Options> & {
          sourceCode?: TSESLint.SourceCode;
        }
      ).sourceCode ?? context.getSourceCode();

    const ruleContext: RuleExecutionContext = {
      context,
      sourceCode,
      reportedStatements: new WeakSet<TSESTree.Statement>(),
    };

    const visitBlock = (node: BlockLike) => handleBlock(ruleContext, node);

    return {
      Program: visitBlock,
      BlockStatement: visitBlock,
    };
  },
});
