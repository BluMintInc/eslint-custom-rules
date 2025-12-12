import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { IntersectionType, Type, TypeChecker, UnionType } from 'typescript';
import { createRule } from '../utils/createRule';

type MessageIds = 'useCompareDeeply';

function isMemoUtilityImportPath(path: string): boolean {
  return /(?:^|\/|\\)util\/memo$/.test(path);
}

function toSingleQuotedStringLiteral(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `'${escaped}'`;
}

export const memoCompareDeeplyComplexProps = createRule<[], MessageIds>({
  name: 'memo-compare-deeply-complex-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Suggest compareDeeply for memoized components that receive object/array props to avoid shallow comparison re-renders.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useCompareDeeply:
        'Memoized component "{{componentName}}" receives complex prop(s) {{propsList}} but memo uses shallow reference comparison. Object and array props create new references on every render, so shallow compare re-renders even when values are identical. Pass compareDeeply({{propsCall}}) as memo\'s second argument to compare these props by value and avoid unnecessary re-renders.',
    },
  },
  defaultOptions: [],
  create(context) {
    const memoIdentifiers = new Map<string, string>();
    const memoNamespaces = new Map<string, string>();
    const sourceCode = context.getSourceCode();

    function isNullishComparatorArgument(
      arg: TSESTree.CallExpressionArgument,
    ): boolean {
      if (
        arg.type === AST_NODE_TYPES.Identifier &&
        arg.name === 'undefined'
      ) {
        return true;
      }

      if (arg.type === AST_NODE_TYPES.Literal && arg.value === null) {
        return true;
      }

      if (arg.type === AST_NODE_TYPES.UnaryExpression && arg.operator === 'void') {
        return true;
      }

      return false;
    }

    function isComparatorProvided(
      arg: TSESTree.CallExpressionArgument | undefined,
    ): boolean {
      if (!arg) return false;
      if (arg.type === AST_NODE_TYPES.SpreadElement) return true;
      return !isNullishComparatorArgument(arg);
    }

    function recordImport(node: TSESTree.ImportDeclaration): void {
      if (typeof node.source.value !== 'string') return;
      const importPath = node.source.value;

      for (const specifier of node.specifiers) {
        if (
          specifier.type === AST_NODE_TYPES.ImportSpecifier &&
          specifier.imported.type === AST_NODE_TYPES.Identifier &&
          specifier.imported.name === 'memo' &&
          (importPath === 'react' || isMemoUtilityImportPath(importPath))
        ) {
          memoIdentifiers.set(specifier.local.name, importPath);
        }

        if (
          specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
          specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
        ) {
          if (importPath === 'react') {
            memoNamespaces.set(specifier.local.name, importPath);
          } else if (isMemoUtilityImportPath(importPath)) {
            if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
              memoNamespaces.set(specifier.local.name, importPath);
            } else {
              memoIdentifiers.set(specifier.local.name, importPath);
            }
          }
        }
      }
    }

    function isMemoCall(
      node: TSESTree.CallExpression,
    ): { source: string; callee: TSESTree.Expression } | null {
      if (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        memoIdentifiers.has(node.callee.name)
      ) {
        return {
          source: memoIdentifiers.get(node.callee.name)!,
          callee: node.callee,
        };
      }

      if (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        !node.callee.computed &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'memo' &&
        node.callee.object.type === AST_NODE_TYPES.Identifier &&
        memoNamespaces.has(node.callee.object.name)
      ) {
        return {
          source: memoNamespaces.get(node.callee.object.name)!,
          callee: node.callee,
        };
      }

      return null;
    }

    function isComplexType(
      ts: typeof import('typescript'),
      type: Type,
      checker: TypeChecker,
    ): boolean {
      return isComplexTypeInternal(ts, type, checker, new Set<Type>());
    }

    function isComplexTypeInternal(
      ts: typeof import('typescript'),
      type: Type,
      checker: TypeChecker,
      visited: Set<Type>,
    ): boolean {
      if (visited.has(type)) return false;
      visited.add(type);

      const flags = type.flags ?? 0;

      if (flags & ts.TypeFlags.Union) {
        const unionType = type as UnionType;
        return unionType.types.some((t) =>
          isComplexTypeInternal(ts, t, checker, visited),
        );
      }
      if (flags & ts.TypeFlags.Intersection) {
        const intersectionType = type as IntersectionType;
        return intersectionType.types.some((t) =>
          isComplexTypeInternal(ts, t, checker, visited),
        );
      }
      if (
        flags &
        (ts.TypeFlags.StringLike |
          ts.TypeFlags.NumberLike |
          ts.TypeFlags.BooleanLike |
          ts.TypeFlags.BigIntLike |
          ts.TypeFlags.ESSymbolLike |
          ts.TypeFlags.Null |
          ts.TypeFlags.Undefined |
          ts.TypeFlags.Void |
          ts.TypeFlags.Never |
          ts.TypeFlags.EnumLike)
      ) {
        return false;
      }

      if (flags & ts.TypeFlags.TypeParameter) {
        const constraint = type.getConstraint?.();
        return constraint
          ? isComplexTypeInternal(ts, constraint, checker, visited)
          : false;
      }

      if (type.getCallSignatures?.().length) return false;

      if (checker.isArrayType?.(type) || checker.isTupleType?.(type)) return true;

      if (flags & ts.TypeFlags.Object) return true;

      return false;
    }

    function collectComplexProps(
      componentExpr: TSESTree.Expression,
    ): string[] {
      const services = sourceCode.parserServices;
      if (!services?.program || !services?.esTreeNodeToTSNodeMap) {
        return [];
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ts: typeof import('typescript') = require('typescript');
        const checker = services.program.getTypeChecker();
        const tsNode = services.esTreeNodeToTSNodeMap.get(componentExpr);
        if (!tsNode) return [];

        const componentType = checker.getTypeAtLocation(tsNode);
        const signatures = componentType.getCallSignatures?.() ?? [];
        const complexProps = new Set<string>();

        for (const signature of signatures) {
          const params = signature.getParameters?.() ?? [];
          if (params.length === 0) continue;

          const propsSymbol = params[0];
          const decl =
            propsSymbol.valueDeclaration ??
            (propsSymbol.declarations?.[0] as
              | import('typescript').Declaration
              | undefined);
          const propsType = checker.getTypeOfSymbolAtLocation(
            propsSymbol,
            decl ?? tsNode,
          );

          const properties = checker.getPropertiesOfType(propsType);
          for (const prop of properties) {
            if (prop.name === 'children') continue;

            const propDecl =
              prop.valueDeclaration ??
              (prop.declarations?.[0] as
                | import('typescript').Declaration
                | undefined);
            const propType = checker.getTypeOfSymbolAtLocation(
              prop,
              propDecl ?? tsNode,
            );

            if (isComplexType(ts, propType, checker)) {
              complexProps.add(prop.name);
            }
          }
        }

        return Array.from(complexProps).sort();
      } catch {
        return [];
      }
    }

    function ensureCompareDeeplyImportFixes(
      fixer: TSESLint.RuleFixer,
      preferredSource?: string,
    ): { fixes: TSESLint.RuleFix[]; localName: string } {
      const program = sourceCode.ast;
      const memoImports = program.body.filter(
        (node): node is TSESTree.ImportDeclaration =>
          node.type === AST_NODE_TYPES.ImportDeclaration &&
          typeof node.source.value === 'string' &&
          isMemoUtilityImportPath(node.source.value as string),
      );

      for (const memoImport of memoImports) {
        const compareDeeplySpecifier = memoImport.specifiers.find(
          (spec): spec is TSESTree.ImportSpecifier =>
            spec.type === AST_NODE_TYPES.ImportSpecifier &&
            spec.imported.type === AST_NODE_TYPES.Identifier &&
            spec.imported.name === 'compareDeeply',
        );
        if (compareDeeplySpecifier) {
          return {
            fixes: [],
            localName: compareDeeplySpecifier.local.name,
          };
        }
      }

      const importSource =
        preferredSource && isMemoUtilityImportPath(preferredSource)
          ? preferredSource
          : memoImports[0]?.source.value ?? 'src/util/memo';

      const importWithNamed = memoImports.find((memoImport) =>
        memoImport.specifiers.some(
          (spec): spec is TSESTree.ImportSpecifier =>
            spec.type === AST_NODE_TYPES.ImportSpecifier,
        ),
      );
      if (importWithNamed) {
        const namedSpecifiers = importWithNamed.specifiers.filter(
          (spec): spec is TSESTree.ImportSpecifier =>
            spec.type === AST_NODE_TYPES.ImportSpecifier,
        );
        const lastNamedSpecifier =
          namedSpecifiers[namedSpecifiers.length - 1] ?? namedSpecifiers[0];
        return {
          fixes: [fixer.insertTextAfter(lastNamedSpecifier, ', compareDeeply')],
          localName: 'compareDeeply',
        };
      }

      const importWithDefault = memoImports.find((memoImport) =>
        memoImport.specifiers.some(
          (spec): spec is TSESTree.ImportDefaultSpecifier =>
            spec.type === AST_NODE_TYPES.ImportDefaultSpecifier,
        ),
      );
      if (importWithDefault) {
        const defaultSpecifier = importWithDefault.specifiers.find(
          (spec): spec is TSESTree.ImportDefaultSpecifier =>
            spec.type === AST_NODE_TYPES.ImportDefaultSpecifier,
        );
        if (defaultSpecifier) {
          return {
            fixes: [
              fixer.insertTextAfter(defaultSpecifier, ', { compareDeeply }'),
            ],
            localName: 'compareDeeply',
          };
        }
      }

      if (memoImports.length > 0) {
        return {
          fixes: [
            fixer.insertTextAfter(
              memoImports[0],
              `\nimport { compareDeeply } from '${importSource}';`,
            ),
          ],
          localName: 'compareDeeply',
        };
      }

      const firstImport = program.body.find(
        (node) => node.type === AST_NODE_TYPES.ImportDeclaration,
      );
      const importText = `import { compareDeeply } from '${importSource}';\n`;

      if (firstImport) {
        return {
          fixes: [fixer.insertTextBefore(firstImport, importText)],
          localName: 'compareDeeply',
        };
      }

      return {
        fixes: [fixer.insertTextBeforeRange([0, 0], importText)],
        localName: 'compareDeeply',
      };
    }

    return {
      ImportDeclaration: recordImport,
      CallExpression(node) {
        const memoCall = isMemoCall(node);
        if (!memoCall) return;
        if (node.arguments.length === 0) return;

        if (node.arguments.length > 2) return;

        const componentArg = node.arguments[0];
        const comparatorArg = node.arguments[1];

        if (
          componentArg.type !== AST_NODE_TYPES.Identifier &&
          componentArg.type !== AST_NODE_TYPES.FunctionExpression &&
          componentArg.type !== AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          return;
        }

        if (isComparatorProvided(comparatorArg)) return;

        const complexProps = collectComplexProps(componentArg);
        if (complexProps.length === 0) return;

        const componentName =
          componentArg.type === AST_NODE_TYPES.Identifier
            ? componentArg.name
            : componentArg.type === AST_NODE_TYPES.FunctionExpression &&
              componentArg.id
            ? componentArg.id.name
            : 'component';

        const propsList = `[${complexProps.join(', ')}]`;
        const propsCall = complexProps
          .map((prop) => toSingleQuotedStringLiteral(prop))
          .join(', ');

        context.report({
          node,
          messageId: 'useCompareDeeply',
          data: {
            componentName,
            propsList,
            propsCall,
          },
          fix(fixer) {
            const fixes: TSESLint.RuleFix[] = [];
            const importResult = ensureCompareDeeplyImportFixes(
              fixer,
              memoCall.source,
            );
            if (
              comparatorArg &&
              comparatorArg.type !== AST_NODE_TYPES.SpreadElement &&
              isNullishComparatorArgument(comparatorArg)
            ) {
              fixes.push(
                fixer.replaceText(
                  comparatorArg,
                  `${importResult.localName}(${propsCall})`,
                ),
              );
            } else {
              fixes.push(
                fixer.insertTextAfter(
                  componentArg,
                  `, ${importResult.localName}(${propsCall})`,
                ),
              );
            }
            fixes.push(...importResult.fixes);
            return fixes;
          },
        });
      },
    };
  },
});

export default memoCompareDeeplyComplexProps;
