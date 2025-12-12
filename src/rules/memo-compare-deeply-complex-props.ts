import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { IntersectionType, Type, TypeChecker, UnionType } from 'typescript';
import { createRule } from '../utils/createRule';

type MessageIds = 'useCompareDeeply';

function isUtilMemoModulePath(path: string): boolean {
  return /(?:^|\/|\\)util\/memo$/.test(path);
}

function escapeStringForCodeGeneration(value: string): string {
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
    const complexPropsCache = new WeakMap<TSESTree.Expression, string[]>();

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
          (importPath === 'react' || isUtilMemoModulePath(importPath))
        ) {
          memoIdentifiers.set(specifier.local.name, importPath);
        }

        if (
          specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
          specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
        ) {
          if (importPath === 'react') {
            memoNamespaces.set(specifier.local.name, importPath);
          } else if (isUtilMemoModulePath(importPath)) {
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
      const cached = complexPropsCache.get(componentExpr);
      if (cached) return cached;

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

        const result = Array.from(complexProps).sort();
        complexPropsCache.set(componentExpr, result);
        return result;
      } catch {
        return [];
      }
    }

    function addBindingNames(
      pattern:
        | TSESTree.BindingName
        | TSESTree.AssignmentPattern
        | TSESTree.RestElement,
      target: Set<string>,
    ): void {
      switch (pattern.type) {
        case AST_NODE_TYPES.Identifier:
          target.add(pattern.name);
          return;
        case AST_NODE_TYPES.AssignmentPattern:
          addBindingNames(pattern.left as TSESTree.BindingName, target);
          return;
        case AST_NODE_TYPES.ObjectPattern:
          for (const prop of pattern.properties) {
            if (prop.type === AST_NODE_TYPES.Property) {
              addBindingNames(
                prop.value as TSESTree.BindingName | TSESTree.AssignmentPattern,
                target,
              );
            } else if (prop.type === AST_NODE_TYPES.RestElement) {
              addBindingNames(
                prop.argument as
                  | TSESTree.BindingName
                  | TSESTree.AssignmentPattern
                  | TSESTree.RestElement,
                target,
              );
            }
          }
          return;
        case AST_NODE_TYPES.ArrayPattern:
          for (const element of pattern.elements) {
            if (element) {
              addBindingNames(
                element as
                  | TSESTree.BindingName
                  | TSESTree.AssignmentPattern
                  | TSESTree.RestElement,
                target,
              );
            }
          }
          return;
        case AST_NODE_TYPES.RestElement:
          addBindingNames(
            pattern.argument as
              | TSESTree.BindingName
              | TSESTree.AssignmentPattern
              | TSESTree.RestElement,
            target,
          );
          return;
        default:
          return;
      }
    }

    type TopLevelDeclaration =
      | TSESTree.FunctionDeclaration
      | TSESTree.ClassDeclaration
      | TSESTree.TSEnumDeclaration
      | TSESTree.TSInterfaceDeclaration
      | TSESTree.TSTypeAliasDeclaration
      | TSESTree.VariableDeclaration
      | TSESTree.TSModuleDeclaration;

    function isTopLevelDeclaration(
      node: TSESTree.Node | null,
    ): node is TopLevelDeclaration {
      if (!node) return false;
      return (
        node.type === AST_NODE_TYPES.FunctionDeclaration ||
        node.type === AST_NODE_TYPES.ClassDeclaration ||
        node.type === AST_NODE_TYPES.TSEnumDeclaration ||
        node.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
        node.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
        node.type === AST_NODE_TYPES.VariableDeclaration ||
        node.type === AST_NODE_TYPES.TSModuleDeclaration
      );
    }

    function addNamesFromDeclaration(
      declaration: TopLevelDeclaration,
      target: Set<string>,
    ): void {
      if (
        declaration.type === AST_NODE_TYPES.FunctionDeclaration ||
        declaration.type === AST_NODE_TYPES.ClassDeclaration ||
        declaration.type === AST_NODE_TYPES.TSEnumDeclaration ||
        declaration.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
        declaration.type === AST_NODE_TYPES.TSInterfaceDeclaration
      ) {
        if (declaration.id) {
          target.add(declaration.id.name);
        }
        return;
      }

      if (declaration.type === AST_NODE_TYPES.VariableDeclaration) {
        for (const decl of declaration.declarations) {
          addBindingNames(
            decl.id as TSESTree.BindingName | TSESTree.AssignmentPattern,
            target,
          );
        }
        return;
      }

      if (
        declaration.type === AST_NODE_TYPES.TSModuleDeclaration &&
        declaration.id.type === AST_NODE_TYPES.Identifier
      ) {
        target.add(declaration.id.name);
      }
    }

    function pickAvailableCompareDeeplyLocalName(
      program: TSESTree.Program,
    ): string {
      const used = new Set<string>();

      for (const stmt of program.body) {
        if (stmt.type === AST_NODE_TYPES.ImportDeclaration) {
          for (const spec of stmt.specifiers) {
            used.add(spec.local.name);
          }
          continue;
        }

        if (stmt.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          if (isTopLevelDeclaration(stmt.declaration)) {
            addNamesFromDeclaration(stmt.declaration, used);
          }
          continue;
        }

        if (stmt.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
          const decl = stmt.declaration;
          if (
            decl &&
            (decl.type === AST_NODE_TYPES.FunctionDeclaration ||
              decl.type === AST_NODE_TYPES.ClassDeclaration)
          ) {
            if (decl.id) used.add(decl.id.name);
          } else if (decl && decl.type === AST_NODE_TYPES.Identifier) {
            used.add(decl.name);
          }
          continue;
        }

        if (isTopLevelDeclaration(stmt)) {
          addNamesFromDeclaration(stmt, used);
          continue;
        }
      }

      if (!used.has('compareDeeply')) return 'compareDeeply';

      for (let i = 2; ; i += 1) {
        const candidate = `compareDeeply${i}`;
        if (!used.has(candidate)) return candidate;
      }
    }

    function ensureCompareDeeplyImportFixes(
      fixer: TSESLint.RuleFixer,
      preferredSource?: string,
    ): { fixes: TSESLint.RuleFix[]; localName: string } {
      const program = sourceCode.ast;
      const preferredLocalName = pickAvailableCompareDeeplyLocalName(program);
      const memoImports = program.body.filter(
        (node): node is TSESTree.ImportDeclaration =>
          node.type === AST_NODE_TYPES.ImportDeclaration &&
          typeof node.source.value === 'string' &&
          isUtilMemoModulePath(node.source.value as string),
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
        preferredSource && isUtilMemoModulePath(preferredSource)
          ? preferredSource
          : memoImports[0]?.source.value ?? 'src/util/memo';
      const compareDeeplySpecifierText =
        preferredLocalName === 'compareDeeply'
          ? 'compareDeeply'
          : `compareDeeply as ${preferredLocalName}`;

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
          fixes: [
            fixer.insertTextAfter(
              lastNamedSpecifier,
              `, ${compareDeeplySpecifierText}`,
            ),
          ],
          localName: preferredLocalName,
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
              fixer.insertTextAfter(
                defaultSpecifier,
                `, { ${compareDeeplySpecifierText} }`,
              ),
            ],
            localName: preferredLocalName,
          };
        }
      }

      if (memoImports.length > 0) {
        return {
          fixes: [
            fixer.insertTextAfter(
              memoImports[0],
              `\nimport { ${compareDeeplySpecifierText} } from '${importSource}';`,
            ),
          ],
          localName: preferredLocalName,
        };
      }

      const firstImport = program.body.find(
        (node) => node.type === AST_NODE_TYPES.ImportDeclaration,
      );
      const importText = `import { ${compareDeeplySpecifierText} } from '${importSource}';\n`;

      if (firstImport) {
        return {
          fixes: [fixer.insertTextBefore(firstImport, importText)],
          localName: preferredLocalName,
        };
      }

      return {
        fixes: [fixer.insertTextBeforeRange([0, 0], importText)],
        localName: preferredLocalName,
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
          .map((prop) => escapeStringForCodeGeneration(prop))
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
