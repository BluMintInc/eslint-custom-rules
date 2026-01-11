import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';

type Options = [
  {
    ignorePatterns?: string[];
  },
];

type MessageIds = 'memoizeNestedComponent';

type ComponentDetectionResult = {
  found: true;
  componentIsCallback: boolean;
};

const CALLBACK_HOOKS = new Set([
  'useCallback',
  'useDeepCompareCallback',
  'useMemo',
  'useDeepCompareMemo',
]);

type ReactImports = {
  namespace: string | null;
  named: Partial<Record<'createElement' | 'memo' | 'forwardRef', string>>;
};

const collectReactImports = (
  sourceCode: Readonly<TSESLint.SourceCode>,
): ReactImports => {
  const reactImports: ReactImports = { namespace: null, named: {} };

  for (const statement of sourceCode.ast.body) {
    if (statement.type !== AST_NODE_TYPES.ImportDeclaration) continue;

    if (statement.source.value !== 'react') continue;

    for (const specifier of statement.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.imported.type === AST_NODE_TYPES.Identifier
      ) {
        const importedName = specifier.imported.name;
        if (
          importedName === 'createElement' ||
          importedName === 'memo' ||
          importedName === 'forwardRef'
        ) {
          reactImports.named[importedName] = specifier.local.name;
        }
      }

      if (
        specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
        specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
      ) {
        reactImports.namespace = specifier.local.name;
      }
    }
  }

  return reactImports;
};

const calleeMatchesReactMember = (
  callee: TSESTree.LeftHandSideExpression,
  reactImports: ReactImports,
  member: keyof ReactImports['named'],
): boolean => {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return reactImports.named[member] === callee.name;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === member &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    reactImports.namespace === callee.object.name
  ) {
    return true;
  }

  return false;
};

const isFunctionExpression = (
  node: TSESTree.Node,
): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression => {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
};

const unwrapExpression = (
  expression: TSESTree.Expression,
): TSESTree.Expression => {
  if (expression.type === AST_NODE_TYPES.TSAsExpression) {
    return unwrapExpression(expression.expression);
  }
  if (expression.type === AST_NODE_TYPES.TSSatisfiesExpression) {
    return unwrapExpression(expression.expression);
  }
  if (expression.type === AST_NODE_TYPES.TSNonNullExpression) {
    return unwrapExpression(expression.expression);
  }
  /**
   * ParenthesizedExpression appears in the parsed AST even though the type
   * is missing from AST_NODE_TYPES. This assertion safely unwraps to keep
   * traversal consistent.
   */
  if (
    ((expression as TSESTree.Node).type as unknown as string) ===
    'ParenthesizedExpression'
  ) {
    return unwrapExpression(
      (expression as unknown as { expression: TSESTree.Expression }).expression,
    );
  }

  return expression;
};

const isReactCreateElementCall = (
  node: TSESTree.CallExpression,
  reactImports: ReactImports,
): boolean => {
  return calleeMatchesReactMember(node.callee, reactImports, 'createElement');
};

const isHookCall = (
  callee: TSESTree.LeftHandSideExpression,
): { name: string } | null => {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    if (CALLBACK_HOOKS.has(callee.name)) {
      return { name: callee.name };
    }
    return null;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    CALLBACK_HOOKS.has(callee.property.name)
  ) {
    return { name: callee.property.name };
  }

  return null;
};

const isForwardRefCall = (
  node: TSESTree.CallExpression,
  reactImports: ReactImports,
): boolean => {
  return calleeMatchesReactMember(node.callee, reactImports, 'forwardRef');
};

const isMemoCall = (
  node: TSESTree.CallExpression,
  reactImports: ReactImports,
): boolean => {
  return calleeMatchesReactMember(node.callee, reactImports, 'memo');
};

const filterPresentResults = (
  results: Array<ComponentDetectionResult | null>,
): ComponentDetectionResult[] => {
  return results.filter((result): result is ComponentDetectionResult =>
    Boolean(result),
  );
};

const areAllComponentsCallbacks = (
  components: ComponentDetectionResult[],
): boolean => {
  return components.every((result) => result.componentIsCallback);
};

const createMergedResult = (
  components: ComponentDetectionResult[],
): ComponentDetectionResult => {
  return {
    found: true,
    // Auto-fix wraps the callback in memo() and swaps the hook. That is only valid when
    // every branch is itself a component callback (returns JSX/createElement directly).
    // If any branch yields a component factory, the transformation changes behavior.
    componentIsCallback: areAllComponentsCallbacks(components),
  };
};

const mergeComponentResults = (
  ...results: Array<ComponentDetectionResult | null>
): ComponentDetectionResult | null => {
  const present = filterPresentResults(results);

  if (!present.length) {
    return null;
  }

  return createMergedResult(present);
};

const expressionCreatesComponent = (
  expression: TSESTree.Expression | null,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  if (!expression) {
    return null;
  }

  const unwrapped = unwrapExpression(expression);

  if (
    unwrapped.type === AST_NODE_TYPES.JSXElement ||
    unwrapped.type === AST_NODE_TYPES.JSXFragment
  ) {
    return { found: true, componentIsCallback: true };
  }

  if (
    unwrapped.type === AST_NODE_TYPES.CallExpression &&
    isReactCreateElementCall(unwrapped, reactImports)
  ) {
    return { found: true, componentIsCallback: true };
  }

  switch (unwrapped.type) {
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression: {
      const inner = functionCreatesComponent(unwrapped, reactImports);
      return inner ? { found: true, componentIsCallback: false } : null;
    }
    case AST_NODE_TYPES.CallExpression: {
      if (
        isForwardRefCall(unwrapped, reactImports) ||
        isMemoCall(unwrapped, reactImports)
      ) {
        const firstArg = unwrapped.arguments[0];
        if (firstArg && isFunctionExpression(firstArg)) {
          const inner = functionCreatesComponent(firstArg, reactImports);
          if (inner) {
            return { found: true, componentIsCallback: false };
          }
        }
      }

      return null;
    }
    case AST_NODE_TYPES.ConditionalExpression: {
      const cons = expressionCreatesComponent(
        unwrapped.consequent,
        reactImports,
      );
      const alt = expressionCreatesComponent(unwrapped.alternate, reactImports);
      return mergeComponentResults(cons, alt);
    }
    case AST_NODE_TYPES.LogicalExpression: {
      const left = expressionCreatesComponent(unwrapped.left, reactImports);
      const right = expressionCreatesComponent(unwrapped.right, reactImports);
      return mergeComponentResults(left, right);
    }
    case AST_NODE_TYPES.SequenceExpression: {
      const last = unwrapped.expressions[unwrapped.expressions.length - 1];
      return expressionCreatesComponent(last || null, reactImports);
    }
    case AST_NODE_TYPES.ArrayExpression: {
      const matches = unwrapped.elements
        .map((element) =>
          element && element.type !== AST_NODE_TYPES.SpreadElement
            ? expressionCreatesComponent(element, reactImports)
            : null,
        )
        .filter(Boolean) as ComponentDetectionResult[];
      return mergeComponentResults(...matches);
    }
    default:
      return null;
  }
};

const statementCreatesComponent = (
  node: TSESTree.Statement,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  switch (node.type) {
    case AST_NODE_TYPES.ReturnStatement:
      return expressionCreatesComponent(node.argument, reactImports);
    case AST_NODE_TYPES.IfStatement: {
      const cons =
        node.consequent.type === AST_NODE_TYPES.BlockStatement
          ? blockCreatesComponent(node.consequent, reactImports)
          : statementCreatesComponent(node.consequent, reactImports);

      const alt = node.alternate
        ? node.alternate.type === AST_NODE_TYPES.BlockStatement
          ? blockCreatesComponent(node.alternate, reactImports)
          : statementCreatesComponent(node.alternate, reactImports)
        : null;

      return mergeComponentResults(cons, alt);
    }
    case AST_NODE_TYPES.SwitchStatement: {
      const matches: Array<ComponentDetectionResult | null> = [];
      for (const switchCase of node.cases) {
        for (const consequent of switchCase.consequent) {
          matches.push(statementCreatesComponent(consequent, reactImports));
        }
      }
      return mergeComponentResults(...matches);
    }
    case AST_NODE_TYPES.BlockStatement:
      return blockCreatesComponent(node, reactImports);
    case AST_NODE_TYPES.ForStatement:
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForOfStatement:
    case AST_NODE_TYPES.WhileStatement:
    case AST_NODE_TYPES.DoWhileStatement: {
      if (node.body.type === AST_NODE_TYPES.BlockStatement) {
        return blockCreatesComponent(node.body, reactImports);
      }
      return statementCreatesComponent(node.body, reactImports);
    }
    case AST_NODE_TYPES.TryStatement: {
      const blockMatch = blockCreatesComponent(node.block, reactImports);
      const handlerMatch = node.handler?.body
        ? blockCreatesComponent(node.handler.body, reactImports)
        : null;
      const finalizerMatch = node.finalizer
        ? blockCreatesComponent(node.finalizer, reactImports)
        : null;

      return mergeComponentResults(blockMatch, handlerMatch, finalizerMatch);
    }
    default:
      return null;
  }
};

const blockCreatesComponent = (
  block: TSESTree.BlockStatement,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  const matches: Array<ComponentDetectionResult | null> = [];

  for (const statement of block.body) {
    matches.push(statementCreatesComponent(statement, reactImports));
  }

  return mergeComponentResults(...matches);
};

const functionCreatesComponent = (
  node:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  if (node.body.type === AST_NODE_TYPES.BlockStatement) {
    return blockCreatesComponent(node.body, reactImports);
  }

  return expressionCreatesComponent(node.body, reactImports);
};

const shouldIgnoreFile = (filename: string, patterns: string[]): boolean => {
  return patterns.some((pattern) => minimatch(filename, pattern));
};

const getVariableName = (node: TSESTree.CallExpression): string | null => {
  if (
    node.parent &&
    node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  return null;
};

const isInsideFunction = (node: TSESTree.Node): boolean => {
  let parent = node.parent;
  while (parent) {
    if (
      parent.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      parent.type === AST_NODE_TYPES.FunctionExpression ||
      parent.type === AST_NODE_TYPES.FunctionDeclaration
    ) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
};

export const memoNestedReactComponents = createRule<Options, MessageIds>({
  name: 'memo-nested-react-components',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow React components defined in render bodies, hooks, or passed as props',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignorePatterns: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      memoizeNestedComponent: `What's wrong: React component "{{componentName}}" is created inline inside {{locationDescription}}.

Why it matters: Inline components get new identities when their containing scope re-renders, causing React to unmount and remount them—dropping state, replaying animations, and causing UI flashes. Wrapping with memo() does NOT fix this—memo() only prevents re-renders when props change, not when the component identity itself changes.

How to fix:
  1. Define the component at MODULE SCOPE in its own file, wrapped with memo()
  2. Use React Context and/or directly provide props to supply any dynamic data the component needs
  3. Pass the stable, imported component reference to props like CatalogWrapper

Don't pass inline function components to component-type props (*Wrapper, *Component).
Render-prop callbacks (e.g., render={...}) are fine; this rule targets component-type props only.

See: https://react.dev/learn/your-first-component#nesting-and-organizing-components`,
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const ignorePatterns = options?.ignorePatterns ?? [];
    const filename =
      (context as { filename?: string }).filename ?? context.getFilename();

    if (ignorePatterns.length && shouldIgnoreFile(filename, ignorePatterns)) {
      return {};
    }

    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const reactImports = collectReactImports(sourceCode);

    const reportNestedComponentViolation = (
      node: TSESTree.Node,
      componentName: string,
      locationDescription: string,
    ) => {
      context.report({
        node,
        messageId: 'memoizeNestedComponent',
        data: {
          componentName,
          locationDescription,
        },
      });
    };

    return {
      CallExpression(node) {
        const hook = isHookCall(node.callee);
        if (!hook) return;

        const callback = node.arguments[0];

        if (!callback || callback.type === AST_NODE_TYPES.SpreadElement) {
          return;
        }

        const componentMatch = isFunctionExpression(callback)
          ? functionCreatesComponent(callback, reactImports)
          : expressionCreatesComponent(callback, reactImports);
        if (!componentMatch) {
          return;
        }

        // For useMemo, it only counts as a component if it returns a function
        if (
          hook.name.includes('useMemo') ||
          hook.name.includes('useDeepCompareMemo')
        ) {
          if (componentMatch.componentIsCallback) {
            // Returns JSX directly, so it's an element, not a component
            return;
          }
        }

        const componentName =
          getVariableName(node) ??
          (isFunctionExpression(callback) &&
          callback.id?.type === AST_NODE_TYPES.Identifier
            ? callback.id.name
            : 'component');

        reportNestedComponentViolation(node, componentName, `${hook.name}()`);
      },

      VariableDeclarator(node) {
        if (!node.init) return;
        if (node.id.type !== AST_NODE_TYPES.Identifier) return;

        // Only check if name starts with uppercase (convention for components)
        if (!/^[A-Z]/.test(node.id.name)) return;

        if (!isInsideFunction(node)) return;

        // Skip if it's already a hook call (handled by CallExpression visitor)
        if (node.init.type === AST_NODE_TYPES.CallExpression) {
          const hook = isHookCall(node.init.callee);
          if (hook) return;
        }

        const componentMatch = expressionCreatesComponent(
          node.init,
          reactImports,
        );
        if (!componentMatch) return;

        // JSX elements assigned to variables are fine, only report function definitions
        if (componentMatch.componentIsCallback) return;

        reportNestedComponentViolation(node, node.id.name, 'a render body');
      },

      FunctionDeclaration(node) {
        if (!node.id || !/^[A-Z]/.test(node.id.name)) return;
        if (!isInsideFunction(node)) return;

        const componentMatch = functionCreatesComponent(node, reactImports);
        if (!componentMatch) return;

        reportNestedComponentViolation(node.id, node.id.name, 'a render body');
      },

      JSXAttribute(node) {
        if (node.name.type !== AST_NODE_TYPES.JSXIdentifier) return;
        const attrName = node.name.name;

        // Check if it's a component-type prop
        if (!/(Wrapper|Component|Template|Header|Footer)$/.test(attrName)) {
          return;
        }

        if (
          !node.value ||
          node.value.type !== AST_NODE_TYPES.JSXExpressionContainer
        ) {
          return;
        }

        const expression = node.value.expression;
        if (expression.type === AST_NODE_TYPES.JSXEmptyExpression) return;

        const componentMatch = expressionCreatesComponent(
          expression,
          reactImports,
        );
        if (!componentMatch) return;

        // For props, we only report if it's a function (component definition)
        if (componentMatch.componentIsCallback) {
          // It's a JSX element passed directly, which is usually fine
          return;
        }

        reportNestedComponentViolation(node, attrName, `the "${attrName}" prop`);
      },
    };
  },
});
