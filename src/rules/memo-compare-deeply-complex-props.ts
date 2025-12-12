import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { IntersectionType, Type, TypeChecker, UnionType } from 'typescript';
import { createRule } from '../utils/createRule';

type MessageIds = 'useCompareDeeply';

type ComponentAnalysisResult = {
  unwrappedComponent: TSESTree.Expression;
  unwrappedInitializer: TSESTree.Expression | null;
  initializerWrappedCandidate: TSESTree.Expression | null;
  wrappedInnerCandidate: TSESTree.Expression | null;
  analysisTarget: TSESTree.Expression;
  preferredAnalysisTarget: TSESTree.Expression;
};

type MemoImportTracking = {
  recordImport: (node: TSESTree.ImportDeclaration) => void;
  isMemoCall: (
    node: TSESTree.CallExpression,
  ) => { source: string; callee: TSESTree.Expression } | null;
};

type ComponentInitializerTracker = {
  recordComponentInitializer: (node: TSESTree.VariableDeclarator) => void;
  getInitializer: (name: string) => TSESTree.Expression | null;
};

type TopLevelDeclaration =
  | TSESTree.FunctionDeclaration
  | TSESTree.ClassDeclaration
  | TSESTree.TSEnumDeclaration
  | TSESTree.TSInterfaceDeclaration
  | TSESTree.TSTypeAliasDeclaration
  | TSESTree.VariableDeclaration
  | TSESTree.TSModuleDeclaration;

function isUtilMemoModulePath(path: string): boolean {
  return /(?:^|\/|\\)util\/memo$/.test(path);
}

function unwrapExpression(expression: TSESTree.Expression): TSESTree.Expression {
  let node: TSESTree.Expression = expression;
  // Unwrap harmless wrappers so detection treats casted/parenthesized expressions the same.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (
      node.type === AST_NODE_TYPES.TSAsExpression ||
      node.type === AST_NODE_TYPES.TSTypeAssertion
    ) {
      node = node.expression;
      continue;
    }
    if (node.type === AST_NODE_TYPES.TSNonNullExpression) {
      node = node.expression;
      continue;
    }
    break;
  }
  return node;
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

function isComponentExpression(expr: TSESTree.Expression): boolean {
  return (
    expr.type === AST_NODE_TYPES.Identifier ||
    expr.type === AST_NODE_TYPES.FunctionExpression ||
    expr.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    expr.type === AST_NODE_TYPES.CallExpression ||
    expr.type === AST_NODE_TYPES.MemberExpression
  );
}

function componentDisplayName(expr: TSESTree.Expression): string | null {
  if (expr.type === AST_NODE_TYPES.Identifier) return expr.name;
  if (expr.type === AST_NODE_TYPES.FunctionExpression && expr.id) {
    return expr.id.name;
  }
  if (
    expr.type === AST_NODE_TYPES.MemberExpression &&
    !expr.computed &&
    expr.property.type === AST_NODE_TYPES.Identifier
  ) {
    return expr.property.name;
  }
  return null;
}

function isNullishComparatorArgument(arg: TSESTree.CallExpressionArgument): boolean {
  if (arg.type === AST_NODE_TYPES.SpreadElement) return false;

  const node = unwrapExpression(arg as TSESTree.Expression);

  if (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') {
    return true;
  }

  if (node.type === AST_NODE_TYPES.Literal && node.value === null) {
    return true;
  }

  if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'void') {
    return true;
  }

  return false;
}

function isComparatorProvided(arg: TSESTree.CallExpressionArgument | undefined): boolean {
  if (!arg) return false;
  if (arg.type === AST_NODE_TYPES.SpreadElement) return true;
  return !isNullishComparatorArgument(arg);
}

function rangeWithParentheses(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Expression,
): TSESTree.Range {
  const previous = sourceCode.getTokenBefore(node);
  const next = sourceCode.getTokenAfter(node);
  if (previous?.value === '(' && next?.value === ')') {
    return [previous.range[0], next.range[1]];
  }
  return node.range;
}

function addBindingNames(
  pattern: TSESTree.BindingName | TSESTree.AssignmentPattern | TSESTree.RestElement,
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

function isTopLevelDeclaration(node: TSESTree.Node | null): node is TopLevelDeclaration {
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

function pickAvailableCompareDeeplyLocalName(program: TSESTree.Program): string {
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
  sourceCode: TSESLint.SourceCode,
  fixer: TSESLint.RuleFixer,
  preferredSource?: string,
): { fixes: TSESLint.RuleFix[]; localName: string } {
  const program = sourceCode.ast;
  const preferredLocalName = pickAvailableCompareDeeplyLocalName(program);
  const memoImports = program.body.filter(
    (node): node is TSESTree.ImportDeclaration =>
      node.type === AST_NODE_TYPES.ImportDeclaration &&
      node.importKind !== 'type' &&
      typeof node.source.value === 'string' &&
      isUtilMemoModulePath(node.source.value as string),
  );
  const typeOnlyMemoImports = program.body.filter(
    (node): node is TSESTree.ImportDeclaration =>
      node.type === AST_NODE_TYPES.ImportDeclaration &&
      node.importKind === 'type' &&
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
      : memoImports[0]?.source.value ??
        typeOnlyMemoImports[0]?.source.value ??
        'src/util/memo';
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
        fixer.insertTextAfter(lastNamedSpecifier, `, ${compareDeeplySpecifierText}`),
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
          fixer.insertTextAfter(defaultSpecifier, `, { ${compareDeeplySpecifierText} }`),
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

  const firstImport = program.body.find((node) => node.type === AST_NODE_TYPES.ImportDeclaration);
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
    return unionType.types.some((t) => isComplexTypeInternal(ts, t, checker, visited));
  }
  if (flags & ts.TypeFlags.Intersection) {
    const intersectionType = type as IntersectionType;
    return intersectionType.types.some((t) => isComplexTypeInternal(ts, t, checker, visited));
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
    return constraint ? isComplexTypeInternal(ts, constraint, checker, visited) : false;
  }

  if (type.getCallSignatures?.().length) return false;

  if (checker.isArrayType?.(type) || checker.isTupleType?.(type)) return true;

  if (flags & ts.TypeFlags.Object) return true;

  return false;
}

function getTypeFromSymbol(
  symbol: import('typescript').Symbol,
  checker: TypeChecker,
  tsNode: import('typescript').Node,
): Type {
  const decl =
    symbol.valueDeclaration ??
    (symbol.declarations?.[0] as import('typescript').Declaration | undefined);

  return checker.getTypeOfSymbolAtLocation(symbol, decl ?? tsNode);
}

function getComplexPropertiesFromType(
  type: Type,
  checker: TypeChecker,
  tsNode: import('typescript').Node,
  ts: typeof import('typescript'),
  treatAnyAsComplex = false,
  parentTypeFlags = 0,
): string[] {
  const properties = checker.getPropertiesOfType(type);
  const complexProps: string[] = [];

  for (const prop of properties) {
    if (prop.name === 'children') continue;

    const propType = getTypeFromSymbol(prop, checker, tsNode);

    const isAnyType = Boolean(propType.flags & ts.TypeFlags.Any);
    const propDeclaration =
      prop.valueDeclaration ??
      (prop.declarations?.[0] as import('typescript').Declaration | undefined);
    const annotationType =
      propDeclaration &&
      'type' in propDeclaration &&
      (propDeclaration as { type?: import('typescript').TypeNode }).type;
    const treatAnyOverride =
      isAnyType &&
      !treatAnyAsComplex &&
      ((annotationType && annotationType.kind !== ts.SyntaxKind.AnyKeyword) ||
        (!annotationType && Boolean(parentTypeFlags & ts.TypeFlags.Object)));

    if (
      isComplexType(ts, propType, checker) ||
      ((treatAnyAsComplex || treatAnyOverride) && isAnyType)
    ) {
      complexProps.push(prop.name);
    }
  }

  return complexProps;
}

function extractComplexPropsFromSignature(
  signature: import('typescript').Signature,
  checker: TypeChecker,
  tsNode: import('typescript').Node,
  ts: typeof import('typescript'),
): string[] {
  const params = signature.getParameters?.() ?? [];
  if (params.length === 0) return [];

  const propsSymbol = params[0];
  const propsType = getTypeFromSymbol(propsSymbol, checker, tsNode);

  return getComplexPropertiesFromType(
    propsType,
    checker,
    tsNode,
    ts,
    false,
    propsType.flags ?? 0,
  );
}

function getComplexPropsFromComponent(
  componentExpr: TSESTree.Expression,
  services: TSESLint.SourceCode['parserServices'],
): string[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ts: typeof import('typescript') = require('typescript');
  const checker = services.program.getTypeChecker();
  const tsNode = services.esTreeNodeToTSNodeMap.get(componentExpr);
  if (!tsNode) return [];

  if (
    (componentExpr.type === AST_NODE_TYPES.FunctionExpression ||
      componentExpr.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
    componentExpr.params[0]
  ) {
    const paramTsNode = services.esTreeNodeToTSNodeMap.get(componentExpr.params[0]);
    if (paramTsNode) {
      const paramType = checker.getTypeAtLocation(paramTsNode);
      if (paramType.flags & ts.TypeFlags.Any) {
        let cursor: import('typescript').Node | undefined = paramTsNode;
        while (cursor && !ts.isCallExpression(cursor)) {
          cursor = cursor.parent;
        }
        const parentCall =
          cursor && ts.isCallExpression(cursor) ? cursor : undefined;
        const propsTypeArg = parentCall?.typeArguments?.[1];
        if (propsTypeArg) {
          const typeFromArg = checker.getTypeFromTypeNode(propsTypeArg);
          return getComplexPropertiesFromType(
            typeFromArg,
            checker,
            propsTypeArg,
            ts,
            true,
            typeFromArg.flags ?? 0,
          );
        }
      }
      const treatAnyAsComplex = Boolean(paramType.flags & ts.TypeFlags.Any);
      return getComplexPropertiesFromType(
        paramType,
        checker,
        paramTsNode,
        ts,
        treatAnyAsComplex,
        paramType.flags ?? 0,
      );
    }
  }

  const componentType = checker.getTypeAtLocation(tsNode);
  const signatures = componentType.getCallSignatures?.() ?? [];
  const complexProps = new Set<string>();

  for (const signature of signatures) {
    const propsFromSignature = extractComplexPropsFromSignature(
      signature,
      checker,
      tsNode,
      ts,
    );
    propsFromSignature.forEach((prop) => complexProps.add(prop));
  }

  return Array.from(complexProps).sort();
}

function collectComplexProps(
  componentExpr: TSESTree.Expression,
  sourceCode: TSESLint.SourceCode,
  complexPropsCache: WeakMap<TSESTree.Expression, string[]>,
): string[] {
  const cached = complexPropsCache.get(componentExpr);
  if (cached) return cached;

  const services = sourceCode.parserServices;
  if (!services?.program || !services?.esTreeNodeToTSNodeMap) {
    return [];
  }

  try {
    const result = getComplexPropsFromComponent(componentExpr, services);
    complexPropsCache.set(componentExpr, result);
    return result;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      const componentText = sourceCode.getText(componentExpr);
      // Log to aid debugging when type analysis unexpectedly fails.
      // eslint-disable-next-line no-console
      console.warn(
        '[memo-compare-deeply-complex-props] Type analysis failed for component expression:',
        componentText,
        error instanceof Error ? error.stack ?? error.message : String(error),
      );
    }
    return [];
  }
}

function findComponentAnalysisTargets(
  componentArg: TSESTree.Expression,
  getInitializer: (name: string) => TSESTree.Expression | null,
): ComponentAnalysisResult | null {
  const unwrappedComponent = unwrapExpression(componentArg);
  const initializerExpression =
    unwrappedComponent.type === AST_NODE_TYPES.Identifier
      ? getInitializer(unwrappedComponent.name)
      : null;
  const unwrappedInitializer = initializerExpression
    ? unwrapExpression(initializerExpression)
    : null;
  const initializerWrappedCandidate =
    unwrappedInitializer &&
    unwrappedInitializer.type === AST_NODE_TYPES.CallExpression &&
    unwrappedInitializer.arguments.length > 0 &&
    unwrappedInitializer.arguments[0]?.type !== AST_NODE_TYPES.SpreadElement
      ? unwrapExpression(unwrappedInitializer.arguments[0] as TSESTree.Expression)
      : null;
  const wrappedInnerCandidate =
    unwrappedComponent.type === AST_NODE_TYPES.CallExpression &&
    unwrappedComponent.arguments.length > 0 &&
    unwrappedComponent.arguments[0]?.type !== AST_NODE_TYPES.SpreadElement
      ? unwrapExpression(unwrappedComponent.arguments[0] as TSESTree.Expression)
      : null;
  const analysisTarget =
    (initializerWrappedCandidate && isComponentExpression(initializerWrappedCandidate)
      ? initializerWrappedCandidate
      : null) ??
    (unwrappedInitializer && isComponentExpression(unwrappedInitializer)
      ? unwrappedInitializer
      : null) ??
    (isComponentExpression(unwrappedComponent) ? unwrappedComponent : null) ??
    (wrappedInnerCandidate && isComponentExpression(wrappedInnerCandidate)
      ? wrappedInnerCandidate
      : null);
  if (!analysisTarget) return null;

  const preferredAnalysisTarget = initializerWrappedCandidate ?? wrappedInnerCandidate ?? analysisTarget;

  return {
    unwrappedComponent,
    unwrappedInitializer,
    initializerWrappedCandidate,
    wrappedInnerCandidate,
    analysisTarget,
    preferredAnalysisTarget,
  };
}

function collectComplexPropsForTargets(
  targets: ComponentAnalysisResult,
  getComplexProps: (expr: TSESTree.Expression) => string[],
): string[] {
  let complexProps = getComplexProps(targets.preferredAnalysisTarget);
  if (complexProps.length === 0 && targets.preferredAnalysisTarget !== targets.analysisTarget) {
    complexProps = getComplexProps(targets.analysisTarget);
  }
  if (
    complexProps.length === 0 &&
    targets.wrappedInnerCandidate &&
    targets.wrappedInnerCandidate !== targets.preferredAnalysisTarget
  ) {
    complexProps = getComplexProps(targets.wrappedInnerCandidate);
  }
  return complexProps;
}

function resolveComponentName(
  targets: ComponentAnalysisResult,
  componentArg: TSESTree.Expression,
): string {
  return (
    (targets.initializerWrappedCandidate
      ? componentDisplayName(targets.initializerWrappedCandidate)
      : null) ??
    (targets.unwrappedInitializer
      ? componentDisplayName(targets.unwrappedInitializer)
      : null) ??
    componentDisplayName(targets.unwrappedComponent) ??
    (targets.wrappedInnerCandidate ? componentDisplayName(targets.wrappedInnerCandidate) : null) ??
    componentDisplayName(componentArg) ??
    'component'
  );
}

function buildMemoFixes(
  sourceCode: TSESLint.SourceCode,
  fixer: TSESLint.RuleFixer,
  componentArg: TSESTree.Expression,
  comparatorArg: TSESTree.CallExpressionArgument | undefined,
  propsCall: string,
  memoSource: string,
): TSESLint.RuleFix[] {
  const fixes: TSESLint.RuleFix[] = [];
  const importResult = ensureCompareDeeplyImportFixes(sourceCode, fixer, memoSource);
  if (
    comparatorArg &&
    comparatorArg.type !== AST_NODE_TYPES.SpreadElement &&
    isNullishComparatorArgument(comparatorArg)
  ) {
    fixes.push(
      fixer.replaceTextRange(
        rangeWithParentheses(sourceCode, comparatorArg as TSESTree.Expression),
        `${importResult.localName}(${propsCall})`,
      ),
    );
  } else {
    fixes.push(
      fixer.insertTextAfter(componentArg, `, ${importResult.localName}(${propsCall})`),
    );
  }
  fixes.push(...importResult.fixes);
  return fixes;
}

function createMemoImportTracking(): MemoImportTracking & {
  memoIdentifiers: Map<string, string>;
  memoNamespaces: Map<string, string>;
} {
  const memoIdentifiers = new Map<string, string>();
  const memoNamespaces = new Map<string, string>();

  function recordImport(node: TSESTree.ImportDeclaration): void {
    if (node.importKind === 'type') return;
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

  return {
    memoIdentifiers,
    memoNamespaces,
    recordImport,
    isMemoCall,
  };
}

function createComponentInitializerTracker(): ComponentInitializerTracker {
  const componentInitializers = new Map<string, TSESTree.Expression>();

  function recordComponentInitializer(node: TSESTree.VariableDeclarator): void {
    if (node.id.type === AST_NODE_TYPES.Identifier && node.init) {
      componentInitializers.set(node.id.name, node.init as TSESTree.Expression);
    }
  }

  function getInitializer(name: string): TSESTree.Expression | null {
    return componentInitializers.get(name) ?? null;
  }

  return {
    recordComponentInitializer,
    getInitializer,
  };
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
        "What's wrong: Memoized component \"{{componentName}}\" receives complex prop(s) {{propsList}} but memo still uses shallow reference comparison. Why it matters: Objects and arrays are recreated on each render so shallow compare treats them as \"changed\" even when values are stable, triggering avoidable re-renders. How to fix: Pass compareDeeply({{propsCall}}) as memo's second argument to compare those props by value and keep the component memoized.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const complexPropsCache = new WeakMap<TSESTree.Expression, string[]>();
    const memoImportTracking = createMemoImportTracking();
    const initializerTracking = createComponentInitializerTracker();

    return {
      ImportDeclaration: memoImportTracking.recordImport,
      VariableDeclarator: initializerTracking.recordComponentInitializer,
      CallExpression(node) {
        const memoCall = memoImportTracking.isMemoCall(node);
        if (!memoCall) return;
        if (node.arguments.length === 0) return;

        // memo() only accepts (Component, compare?); skip malformed calls
        if (node.arguments.length > 2) return;

        const componentArg = node.arguments[0];
        const comparatorArg = node.arguments[1];
        if (componentArg.type === AST_NODE_TYPES.SpreadElement) return;

        const componentTargets = findComponentAnalysisTargets(
          componentArg,
          initializerTracking.getInitializer,
        );
        if (!componentTargets) return;

        if (isComparatorProvided(comparatorArg)) return;

        const complexProps = collectComplexPropsForTargets(componentTargets, (expr) =>
          collectComplexProps(expr, sourceCode, complexPropsCache),
        );
        if (complexProps.length === 0) return;

        const componentName = resolveComponentName(componentTargets, componentArg);

        const propsList = `[${complexProps
          .map((prop) => escapeStringForCodeGeneration(prop))
          .join(', ')}]`;
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
            return buildMemoFixes(
              sourceCode,
              fixer,
              componentArg,
              comparatorArg,
              propsCall,
              memoCall.source,
            );
          },
        });
      },
    };
  },
});

export default memoCompareDeeplyComplexProps;
