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

const HOOK_NAMES = new Set(['useEffect', 'useMemo', 'useCallback']);

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

function collectNamesFromPattern(
  pattern: TSESTree.ObjectPattern,
  names: Set<string>,
  orderedNames: string[],
): void {
  for (const property of pattern.properties) {
    if (property.type === AST_NODE_TYPES.Property) {
      const value = property.value;
      if (value.type === AST_NODE_TYPES.Identifier) {
        if (!names.has(value.name)) {
          names.add(value.name);
          orderedNames.push(value.name);
        }
      } else if (value.type === AST_NODE_TYPES.AssignmentPattern) {
        if (value.left.type === AST_NODE_TYPES.Identifier) {
          if (!names.has(value.left.name)) {
            names.add(value.left.name);
            orderedNames.push(value.left.name);
          }
        } else if (value.left.type === AST_NODE_TYPES.ObjectPattern) {
          collectNamesFromPattern(value.left, names, orderedNames);
        }
      } else if (value.type === AST_NODE_TYPES.ObjectPattern) {
        collectNamesFromPattern(value, names, orderedNames);
      }
    } else if (property.type === AST_NODE_TYPES.RestElement) {
      if (property.argument.type === AST_NODE_TYPES.Identifier) {
        if (!names.has(property.argument.name)) {
          names.add(property.argument.name);
          orderedNames.push(property.argument.name);
        }
      } else if (property.argument.type === AST_NODE_TYPES.ObjectPattern) {
        collectNamesFromPattern(property.argument, names, orderedNames);
      }
    }
  }
}

function collectProperties(
  pattern: TSESTree.ObjectPattern,
  sourceCode: TSESLint.SourceCode,
  acc: Map<string, DestructuringProperty>,
): void {
  for (const property of pattern.properties) {
    const text = sourceCode.getText(property);
    let keyText = text;

    if (property.type === AST_NODE_TYPES.Property) {
      const keyNode = property.key;
      if (keyNode.type === AST_NODE_TYPES.Identifier) {
        keyText = keyNode.name;
      } else if (keyNode.type === AST_NODE_TYPES.Literal) {
        keyText = String(keyNode.value);
      }
    } else if (property.type === AST_NODE_TYPES.RestElement) {
      keyText = `...${sourceCode.getText(property.argument)}`;
    }

    if (!acc.has(keyText)) {
      acc.set(keyText, {
        key: keyText,
        text,
        order: property.range ? property.range[0] : acc.size,
      });
    }
  }
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
        'Destructure "{{objectName}}" before calling {{hookName}}. Keeping destructuring inside the hook forces the dependency array to track the whole object, triggering rerenders when unrelated fields change. Hoist the destructuring (or memoize/nullish-guard it) and depend on the specific fields: {{dependencies}}.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const visitorKeys =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((sourceCode as any).visitorKeys as Record<string, string[]>) ??
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

          if (isFunctionNode(current) && current !== callback) {
            // Skip nested functions (covers async helpers)
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
                if (isTypeNarrowingContext(current, baseName, visitorKeys)) {
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
