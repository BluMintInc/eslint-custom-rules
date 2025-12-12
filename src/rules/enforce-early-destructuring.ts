import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'hoistDestructuring';

type DestructuringProperty = {
  key: string;
  text: string;
  order: number;
};

type DestructuringGroup = {
  objectText: string;
  properties: Map<string, DestructuringProperty>;
  names: Set<string>;
  orderedNames: string[];
  declarations: TSESTree.VariableDeclaration[];
};

const HOOK_NAMES = new Set(['useEffect', 'useMemo', 'useCallback', 'useLayoutEffect']);

function isFunctionNode(
  node: TSESTree.Node,
): node is TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression {
  return (
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function isHookCall(node: TSESTree.CallExpression): string | null {
  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.Identifier) return null;
  return HOOK_NAMES.has(callee.name) ? callee.name : null;
}

function isAllowedInit(init: TSESTree.Expression): boolean {
  if (init.type === AST_NODE_TYPES.Identifier) return true;
  if (init.type === AST_NODE_TYPES.MemberExpression) return true;
  if (init.type === AST_NODE_TYPES.ChainExpression) {
    return init.expression.type === AST_NODE_TYPES.MemberExpression;
  }
  if (init.type === AST_NODE_TYPES.TSNonNullExpression) {
    return isAllowedInit(init.expression as TSESTree.Expression);
  }
  return false;
}

function getBaseIdentifier(init: TSESTree.Expression): string | null {
  if (init.type === AST_NODE_TYPES.Identifier) {
    return init.name;
  }

  if (init.type === AST_NODE_TYPES.MemberExpression) {
    let current: TSESTree.Node = init.object;
    while (current.type === AST_NODE_TYPES.MemberExpression) {
      current = current.object;
    }
    if (current.type === AST_NODE_TYPES.Identifier) {
      return current.name;
    }
  }

  if (init.type === AST_NODE_TYPES.ChainExpression) {
    return getBaseIdentifier(init.expression as TSESTree.Expression);
  }

  if (init.type === AST_NODE_TYPES.TSNonNullExpression) {
    return getBaseIdentifier(init.expression as TSESTree.Expression);
  }

  return null;
}

function addNameIfAbsent(
  name: string,
  names: Set<string>,
  orderedNames: string[],
): void {
  if (names.has(name)) return;
  names.add(name);
  orderedNames.push(name);
}

function handleAssignmentPatternNames(
  node: TSESTree.AssignmentPattern,
  names: Set<string>,
  orderedNames: string[],
): void {
  const left = node.left;
  if (left.type === AST_NODE_TYPES.Identifier) {
    addNameIfAbsent(left.name, names, orderedNames);
    return;
  }

  if (left.type === AST_NODE_TYPES.ObjectPattern) {
    collectNamesFromPattern(left, names, orderedNames);
    return;
  }

  if (left.type === AST_NODE_TYPES.ArrayPattern) {
    collectNamesFromArrayPattern(left, names, orderedNames);
  }
}

function handlePropertyNodeNames(
  property: TSESTree.Property,
  names: Set<string>,
  orderedNames: string[],
): void {
  const value = property.value;
  if (value.type === AST_NODE_TYPES.Identifier) {
    addNameIfAbsent(value.name, names, orderedNames);
    return;
  }

  if (value.type === AST_NODE_TYPES.AssignmentPattern) {
    handleAssignmentPatternNames(value, names, orderedNames);
    return;
  }

  if (value.type === AST_NODE_TYPES.ObjectPattern) {
    collectNamesFromPattern(value, names, orderedNames);
    return;
  }

  if (value.type === AST_NODE_TYPES.ArrayPattern) {
    collectNamesFromArrayPattern(value, names, orderedNames);
  }
}

function handleRestElementNodeNames(
  rest: TSESTree.RestElement,
  names: Set<string>,
  orderedNames: string[],
): void {
  const argument = rest.argument;
  if (argument.type === AST_NODE_TYPES.Identifier) {
    addNameIfAbsent(argument.name, names, orderedNames);
    return;
  }

  if (argument.type === AST_NODE_TYPES.ObjectPattern) {
    collectNamesFromPattern(argument, names, orderedNames);
    return;
  }

  if (argument.type === AST_NODE_TYPES.ArrayPattern) {
    collectNamesFromArrayPattern(argument, names, orderedNames);
  }
}

function collectNamesFromPattern(
  pattern: TSESTree.ObjectPattern,
  names: Set<string>,
  orderedNames: string[],
): void {
  for (const property of pattern.properties) {
    if (property.type === AST_NODE_TYPES.Property) {
      handlePropertyNodeNames(property, names, orderedNames);
    } else if (property.type === AST_NODE_TYPES.RestElement) {
      handleRestElementNodeNames(property, names, orderedNames);
    }
  }
}

function collectNamesFromArrayPattern(
  pattern: TSESTree.ArrayPattern,
  names: Set<string>,
  orderedNames: string[],
): void {
  for (const element of pattern.elements) {
    if (!element) continue;
    if (element.type === AST_NODE_TYPES.Identifier) {
      addNameIfAbsent(element.name, names, orderedNames);
    } else if (element.type === AST_NODE_TYPES.AssignmentPattern) {
      handleAssignmentPatternNames(element, names, orderedNames);
    } else if (element.type === AST_NODE_TYPES.ObjectPattern) {
      collectNamesFromPattern(element, names, orderedNames);
    } else if (element.type === AST_NODE_TYPES.ArrayPattern) {
      collectNamesFromArrayPattern(element, names, orderedNames);
    } else if (element.type === AST_NODE_TYPES.RestElement) {
      handleRestElementNodeNames(element, names, orderedNames);
    }
  }
}

function collectProperties(
  pattern: TSESTree.ObjectPattern,
  sourceCode: TSESLint.SourceCode,
  acc: Map<string, DestructuringProperty>,
): void {
  for (const property of pattern.properties) {
    const text = getSafePropertyText(property, sourceCode);
    const keyText =
      property.type === AST_NODE_TYPES.Property
        ? property.key.type === AST_NODE_TYPES.Literal
          ? String(property.key.value)
          : property.key.type === AST_NODE_TYPES.Identifier
          ? property.key.name
          : sourceCode.getText(property.key)
        : `...${sourceCode.getText(property.argument)}`;

    if (acc.has(keyText)) continue;

    acc.set(keyText, {
      key: keyText,
      text,
      order: property.range ? property.range[0] : acc.size,
    });
  }
}

function renderArrayPatternWithDefaults(
  pattern: TSESTree.ArrayPattern,
  sourceCode: TSESLint.SourceCode,
): string {
  const elements = pattern.elements.map((element) => {
    if (!element) return '';
    if (element.type === AST_NODE_TYPES.Identifier) {
      return sourceCode.getText(element);
    }
    if (element.type === AST_NODE_TYPES.AssignmentPattern) {
      const left = element.left;
      const leftText =
        left.type === AST_NODE_TYPES.ObjectPattern
          ? renderObjectPatternWithDefaults(left, sourceCode)
          : left.type === AST_NODE_TYPES.ArrayPattern
          ? renderArrayPatternWithDefaults(left, sourceCode)
          : sourceCode.getText(left);
      return `${leftText} = ${sourceCode.getText(element.right)}`;
    }
    if (element.type === AST_NODE_TYPES.ObjectPattern) {
      const nested = renderObjectPatternWithDefaults(element, sourceCode);
      return `${nested} = {}`;
    }
    if (element.type === AST_NODE_TYPES.ArrayPattern) {
      const nested = renderArrayPatternWithDefaults(element, sourceCode);
      return `${nested} = []`;
    }
    if (element.type === AST_NODE_TYPES.RestElement) {
      const argument = element.argument;
      if (argument.type === AST_NODE_TYPES.ObjectPattern) {
        return `...${renderObjectPatternWithDefaults(argument, sourceCode)}`;
      }
      if (argument.type === AST_NODE_TYPES.ArrayPattern) {
        return `...${renderArrayPatternWithDefaults(argument, sourceCode)}`;
      }
      return `...${sourceCode.getText(argument)}`;
    }
    return sourceCode.getText(element);
  });

  return `[${elements.join(', ')}]`;
}

function renderObjectPatternWithDefaults(
  pattern: TSESTree.ObjectPattern,
  sourceCode: TSESLint.SourceCode,
): string {
  const properties = pattern.properties.map((property) => {
    if (property.type === AST_NODE_TYPES.Property) {
      if (property.shorthand) {
        return sourceCode.getText(property);
      }

      const keyText = property.computed
        ? `[${sourceCode.getText(property.key)}]`
        : sourceCode.getText(property.key);
      const value = property.value;

      if (value.type === AST_NODE_TYPES.AssignmentPattern) {
        const left = value.left;
        if (
          !property.computed &&
          property.key.type === AST_NODE_TYPES.Identifier &&
          left.type === AST_NODE_TYPES.Identifier &&
          property.key.name === left.name
        ) {
          return `${sourceCode.getText(property.key)} = ${sourceCode.getText(value.right)}`;
        }
        const leftText =
          left.type === AST_NODE_TYPES.ObjectPattern
            ? renderObjectPatternWithDefaults(left, sourceCode)
            : left.type === AST_NODE_TYPES.ArrayPattern
            ? renderArrayPatternWithDefaults(left, sourceCode)
            : sourceCode.getText(left);
        return `${keyText}: ${leftText} = ${sourceCode.getText(value.right)}`;
      }

      if (value.type === AST_NODE_TYPES.ObjectPattern) {
        const nested = renderObjectPatternWithDefaults(value, sourceCode);
        return `${keyText}: ${nested} = {}`;
      }

      if (value.type === AST_NODE_TYPES.ArrayPattern) {
        const nested = renderArrayPatternWithDefaults(value, sourceCode);
        return `${keyText}: ${nested} = []`;
      }

      return `${keyText}: ${sourceCode.getText(value)}`;
    }

    if (property.type === AST_NODE_TYPES.RestElement) {
      if (property.argument.type === AST_NODE_TYPES.ObjectPattern) {
        return `...${renderObjectPatternWithDefaults(property.argument, sourceCode)}`;
      }
      if (property.argument.type === AST_NODE_TYPES.ArrayPattern) {
        return `...${renderArrayPatternWithDefaults(property.argument, sourceCode)}`;
      }
      return `...${sourceCode.getText(property.argument)}`;
    }

    return sourceCode.getText(property);
  });

  return `{ ${properties.join(', ')} }`;
}

function getSafePropertyText(
  property: TSESTree.Property | TSESTree.RestElement,
  sourceCode: TSESLint.SourceCode,
): string {
  if (property.type === AST_NODE_TYPES.RestElement) {
    return `...${sourceCode.getText(property.argument)}`;
  }

  if (property.shorthand) {
    return sourceCode.getText(property);
  }

  const keyText = property.computed
    ? `[${sourceCode.getText(property.key)}]`
    : sourceCode.getText(property.key);
  const value = property.value;

  if (value.type === AST_NODE_TYPES.AssignmentPattern) {
    const left = value.left;
    if (
      !property.computed &&
      property.key.type === AST_NODE_TYPES.Identifier &&
      left.type === AST_NODE_TYPES.Identifier &&
      property.key.name === left.name
    ) {
      return `${sourceCode.getText(property.key)} = ${sourceCode.getText(value.right)}`;
    }
    const leftText =
      left.type === AST_NODE_TYPES.ObjectPattern
        ? renderObjectPatternWithDefaults(left, sourceCode)
        : left.type === AST_NODE_TYPES.ArrayPattern
        ? renderArrayPatternWithDefaults(left, sourceCode)
        : sourceCode.getText(left);
    return `${keyText}: ${leftText} = ${sourceCode.getText(value.right)}`;
  }

  if (value.type === AST_NODE_TYPES.ObjectPattern) {
    const nested = renderObjectPatternWithDefaults(value, sourceCode);
    return `${keyText}: ${nested} = {}`;
  }

  if (value.type === AST_NODE_TYPES.ArrayPattern) {
    const nested = renderArrayPatternWithDefaults(value, sourceCode);
    return `${keyText}: ${nested} = []`;
  }

  return `${keyText}: ${sourceCode.getText(value)}`;
}

function dependencyElements(
  depsArray: TSESTree.ArrayExpression,
  sourceCode: TSESLint.SourceCode,
): string[] {
  return depsArray.elements
    .filter(
      (element): element is TSESTree.Expression =>
        Boolean(element) && element?.type !== AST_NODE_TYPES.SpreadElement,
    )
    .map((element) => sourceCode.getText(element as TSESTree.Node));
}

function testContainsObjectMember(
  testNode: TSESTree.Node,
  objectName: string,
  visitorKeys: Record<string, string[]>,
): boolean {
  let found = false;
  const stack: TSESTree.Node[] = [testNode];

  while (stack.length && !found) {
    const current = stack.pop();
    if (!current) continue;

    if (
      current.type === AST_NODE_TYPES.MemberExpression &&
      current.object &&
      (() => {
        let base: TSESTree.Node = current.object;
        while (base.type === AST_NODE_TYPES.MemberExpression) {
          base = base.object;
        }
        return base.type === AST_NODE_TYPES.Identifier && base.name === objectName;
      })()
    ) {
      found = true;
      break;
    }

    if (
      current.type === AST_NODE_TYPES.Identifier &&
      current.name === objectName
    ) {
      found = true;
      break;
    }

    const keys = visitorKeys[current.type] ?? [];
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object') {
            stack.push(child as TSESTree.Node);
          }
        }
      } else if (value && typeof value === 'object') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return found;
}

function isTypeNarrowingContext(
  node: TSESTree.Node,
  baseName: string | null,
  visitorKeys: Record<string, string[]>,
): boolean {
  if (!baseName) return false;
  let current: TSESTree.Node | undefined = node.parent as TSESTree.Node | undefined;

  while (current && current.type !== AST_NODE_TYPES.Program) {
    if (current.type === AST_NODE_TYPES.IfStatement && current.test) {
      if (testContainsObjectMember(current.test, baseName, visitorKeys)) {
        return true;
      }
    }
    current = current.parent as TSESTree.Node | undefined;
  }

  return false;
}

function getIndentation(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): string {
  const text = sourceCode.getText();
  const lineStart = text.lastIndexOf('\n', node.range![0]) + 1;
  const prefix = text.slice(lineStart, node.range![0]);
  const match = prefix.match(/^[\t ]*/);
  return match ? match[0] : '';
}

function fullLineRange(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): [number, number] {
  const text = sourceCode.getText();
  const start = text.lastIndexOf('\n', node.range![0] - 1) + 1;
  const lineEnd = text.indexOf('\n', node.range![1]);
  const end = lineEnd === -1 ? text.length : lineEnd + 1;
  return [start, end];
}

function shouldSkipNestedFunction(
  candidateNode: TSESTree.Node,
  callback: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
): boolean {
  return isFunctionNode(candidateNode) && candidateNode !== callback;
}

function hasPriorConditionalGuard(
  node: TSESTree.Node,
  baseName: string | null,
  visitorKeys: Record<string, string[]>,
): boolean {
  if (!baseName) return false;
  const parent = node.parent;
  if (!parent || parent.type !== AST_NODE_TYPES.BlockStatement) return false;

  const index = parent.body.indexOf(node as TSESTree.Statement);
  if (index <= 0) return false;

  return parent.body
    .slice(0, index)
    .some(
      (statement) =>
        statement.type === AST_NODE_TYPES.IfStatement &&
        Boolean(statement.test) &&
        testContainsObjectMember(statement.test, baseName, visitorKeys),
    );
}

export const enforceEarlyDestructuring = createRule<[], MessageIds>({
  name: 'enforce-early-destructuring',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Hoist object destructuring out of React hooks so dependency arrays track the fields in use instead of the entire object.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      hoistDestructuring:
        'Destructure "{{objectName}}" before calling {{hookName}}. Keeping destructuring inside the hook forces the dependency array to track the whole object, triggering rerenders when unrelated fields change. Hoist the destructuring (or memoize/guard for missing values) and depend on the specific fields: {{dependencies}}.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode =
      (context as unknown as { sourceCode?: TSESLint.SourceCode }).sourceCode ??
      context.getSourceCode();
    const visitorKeys =
      (sourceCode as unknown as { visitorKeys?: Record<string, string[]> }).visitorKeys ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (context as any).visitorKeys ??
      {};

    return {
      CallExpression(node) {
        const hookName = isHookCall(node);
        if (!hookName) return;

        const callback = node.arguments[0];
        if (!callback || !isFunctionNode(callback) || callback.body.type !== AST_NODE_TYPES.BlockStatement) {
          return;
        }

        if (callback.async) return;

        const depsArray =
          node.arguments.length > 1 &&
          node.arguments[1] &&
          node.arguments[1].type === AST_NODE_TYPES.ArrayExpression
            ? (node.arguments[1] as TSESTree.ArrayExpression)
            : null;

        if (!depsArray) return;

        const depTexts = dependencyElements(depsArray, sourceCode);
        const depTextSet = new Set(depTexts);

        const groups = new Map<string, DestructuringGroup>();

        const stack: TSESTree.Node[] = [...callback.body.body];
        while (stack.length) {
          const current = stack.shift();
          if (!current) continue;

          if (shouldSkipNestedFunction(current, callback)) {
            continue;
          }

          if (current.type === AST_NODE_TYPES.VariableDeclaration) {
            for (const declarator of current.declarations) {
              if (
                declarator.id.type === AST_NODE_TYPES.ObjectPattern &&
                declarator.init &&
                isAllowedInit(declarator.init) &&
                current.declarations.length === 1 &&
                !declarator.id.properties.some(
                  (prop) => prop.type === AST_NODE_TYPES.RestElement,
                )
              ) {
                const objectText = sourceCode.getText(declarator.init);
                if (!depTextSet.has(objectText)) continue;

                const baseName = getBaseIdentifier(declarator.init);
                if (
                  hasPriorConditionalGuard(current, baseName, visitorKeys) ||
                  isTypeNarrowingContext(current, baseName, visitorKeys)
                ) {
                  continue;
                }

                const existingGroup = groups.get(objectText);
                const properties = existingGroup?.properties ?? new Map();
                collectProperties(declarator.id, sourceCode, properties);

                const names = existingGroup?.names ?? new Set<string>();
                const orderedNames = existingGroup?.orderedNames ?? [];
                collectNamesFromPattern(declarator.id, names, orderedNames);

                const declarations = existingGroup?.declarations ?? [];
                declarations.push(current);

                groups.set(objectText, {
                  objectText,
                  properties,
                  names,
                  orderedNames,
                  declarations,
                });
              }
            }
          }

          const keys = visitorKeys[current.type] ?? [];
          for (const key of keys) {
            const value = (current as unknown as Record<string, unknown>)[key];
            if (Array.isArray(value)) {
              for (const child of value) {
                if (child && typeof child === 'object') {
                  stack.push(child as TSESTree.Node);
                }
              }
            } else if (value && typeof value === 'object') {
              stack.push(value as TSESTree.Node);
            }
          }
        }

        if (!groups.size) return;

        const allNames = new Set<string>();
        const orderedDependencies: string[] = [];
        for (const group of groups.values()) {
          for (const name of group.orderedNames) {
            if (!allNames.has(name)) {
              allNames.add(name);
              orderedDependencies.push(name);
            }
          }
        }

        const dependencyList =
          orderedDependencies.length > 0
            ? orderedDependencies.join(', ')
            : 'the fields you use';

        const firstGroup = Array.from(groups.values())[0];
        context.report({
          node: firstGroup.declarations[0],
          messageId: 'hoistDestructuring',
          data: {
            objectName: firstGroup.objectText,
            hookName,
            dependencies: dependencyList,
          },
          fix(fixer) {
            const indent = getIndentation(node, sourceCode);

            const hoistedLines: string[] = [];
            const declarationsToRemove = new Set<TSESTree.Node>();
            const newDepTexts = depTexts.filter(
              (text) => !groups.has(text),
            );

            for (const group of groups.values()) {
              const sortedProps = Array.from(group.properties.values()).sort(
                (a, b) => a.order - b.order,
              );
              const pattern = `{ ${sortedProps.map((p) => p.text).join(', ')} }`;
              hoistedLines.push(
                `${indent}const ${pattern} = (${group.objectText}) ?? {};`,
              );
              group.declarations.forEach((decl) => declarationsToRemove.add(decl));
            }

            const newDepSet = new Set(newDepTexts);
            for (const name of orderedDependencies) {
              if (!newDepSet.has(name)) {
                newDepTexts.push(name);
                newDepSet.add(name);
              }
            }

            const lineStart =
              sourceCode.getText().lastIndexOf('\n', node.range![0]) + 1;
            const fixes = [
              fixer.insertTextBeforeRange(
                [lineStart, lineStart],
                `${hoistedLines.join('\n')}\n`,
              ),
              fixer.replaceText(depsArray, `[${newDepTexts.join(', ')}]`),
            ];

            for (const decl of declarationsToRemove) {
              fixes.push(
                fixer.removeRange(fullLineRange(decl, sourceCode)),
              );
            }

            return fixes;
          },
        });
      },
    };
  },
});
