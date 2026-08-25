import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import type {
  IntersectionType,
  Type,
  TypeChecker,
  UnionType,
} from 'typescript';
import { createRule } from '../utils/createRule';

type MessageIds = 'useCompareDeeply';

type Options = [
  {
    printWidth?: number;
  },
];

/**
 * Matches Prettier's own default. The fixer authors an argument list whose
 * length grows with the component's complex-prop count, so a line it emits past
 * this width is rewritten by the next `prettier --write` — and fails
 * `prettier --check` in the meantime.
 */
const DEFAULT_PRINT_WIDTH = 80;

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
  recordComponentInitializer: (
    node: TSESTree.VariableDeclarator,
    scope: TSESLint.Scope.Scope,
  ) => void;
  getInitializer: (
    name: string,
    scope: TSESLint.Scope.Scope,
  ) => TSESTree.Expression | null;
};

type ComponentTypeAnalysis = {
  ts: typeof import('typescript');
  tsNode: import('typescript').Node;
  checker: TypeChecker;
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

/**
 * Reserved React slots that never reach a component's props object at runtime.
 * React extracts `ref` and `key` before invoking the memo equality function, so
 * a deep comparator can never observe them. Some prop-type sources (notably the
 * `forwardRef<T, P>` exotic-component signature, whose params include the
 * synthetic `RefAttributes<T> = { ref?: Ref<T> }` member) surface them as
 * structural members anyway; flagging them would emit dead `compareDeeply('ref')`
 * advice. Excluded the same way `children` is.
 */
const RESERVED_REACT_PROP_NAMES = new Set(['ref', 'key', 'children']);

function isReservedReactPropName(name: string): boolean {
  return RESERVED_REACT_PROP_NAMES.has(name);
}

/**
 * Checks if a property name is handled by the default deep equality logic
 * in our custom memo implementation (blumintAreEqual).
 */
function isDefaultDeepCompareProp(name: string): boolean {
  return (
    name === 'sx' ||
    name.endsWith('Sx') ||
    name === 'style' ||
    name.endsWith('Style')
  );
}

function unwrapExpression(
  expression: TSESTree.Expression,
): TSESTree.Expression {
  let node: TSESTree.Expression = expression;
  // Unwrap harmless wrappers so detection treats casted/parenthesized expressions the same.
  while (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression
  ) {
    node = node.expression;
  }
  return node;
}

/**
 * Prettier picks whichever quote needs fewer escapes rather than always the
 * configured one, so a value carrying more \`'\` than \`"\` prints double-quoted
 * even under \`singleQuote: true\`. Emitting the other spelling is text the
 * formatter rewrites on its next run, which is the churn #2112 is about.
 */
function escapeStringForCodeGeneration(value: string): string {
  const singles = (value.match(/'/g) ?? []).length;
  const doubles = (value.match(/"/g) ?? []).length;
  const quote = singles > doubles ? '"' : "'";
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(quote === "'" ? /'/g : /"/g, `\\\\${quote}`)
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `${quote}${escaped}${quote}`;
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

function isUndefinedShadowed(scope: TSESLint.Scope.Scope | null): boolean {
  let currentScope: TSESLint.Scope.Scope | null = scope;
  while (currentScope) {
    if (
      currentScope.variables.some(
        (variable) => variable.name === 'undefined' && variable.defs.length > 0,
      )
    ) {
      return true;
    }
    currentScope = (currentScope.upper as TSESLint.Scope.Scope | null) ?? null;
  }
  return false;
}

function isNullishComparatorArgument(
  arg: TSESTree.CallExpressionArgument,
  scope?: TSESLint.Scope.Scope,
): boolean {
  if (arg.type === AST_NODE_TYPES.SpreadElement) return false;

  const node = unwrapExpression(arg as TSESTree.Expression);

  if (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') {
    if (scope && isUndefinedShadowed(scope)) return false;
    return true;
  }

  if (node.type === AST_NODE_TYPES.Literal && node.value === null) {
    return true;
  }

  if (
    node.type === AST_NODE_TYPES.UnaryExpression &&
    node.operator === 'void'
  ) {
    return true;
  }

  return false;
}

function isComparatorProvided(
  arg: TSESTree.CallExpressionArgument | undefined,
  scope?: TSESLint.Scope.Scope,
): boolean {
  if (!arg) return false;
  if (arg.type === AST_NODE_TYPES.SpreadElement) return true;
  return !isNullishComparatorArgument(arg, scope);
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
  used: ReadonlySet<string>,
): string {
  if (!used.has('compareDeeply')) return 'compareDeeply';

  for (let i = 2; ; i += 1) {
    const candidate = `compareDeeply${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

function collectUsedNames(sourceCode: TSESLint.SourceCode): Set<string> {
  const used = new Set<string>();

  for (const stmt of sourceCode.ast.body) {
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

  for (const scope of sourceCode.scopeManager?.scopes ?? []) {
    for (const variable of scope.variables) {
      used.add(variable.name);
    }
  }

  return used;
}

function ensureCompareDeeplyImportFixes(
  sourceCode: TSESLint.SourceCode,
  fixer: TSESLint.RuleFixer,
  usedNames: ReadonlySet<string>,
  preferredSource?: string,
): { fixes: TSESLint.RuleFix[]; localName: string } {
  const program = sourceCode.ast;
  const preferredLocalName = pickAvailableCompareDeeplyLocalName(usedNames);
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

  const importWithNamed = memoImports.find(
    (memoImport) =>
      memoImport.source.value === importSource &&
      memoImport.specifiers.some(
        (spec): spec is TSESTree.ImportSpecifier =>
          spec.type === AST_NODE_TYPES.ImportSpecifier,
      ),
  );
  const fallbackImportWithNamed = memoImports.find((memoImport) =>
    memoImport.specifiers.some(
      (spec) => spec.type === AST_NODE_TYPES.ImportSpecifier,
    ),
  );
  const namedImportTarget = importWithNamed ?? fallbackImportWithNamed;
  if (namedImportTarget) {
    const namedSpecifiers = namedImportTarget.specifiers.filter(
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

  const importWithDefault = memoImports.find(
    (memoImport) =>
      memoImport.source.value === importSource &&
      memoImport.specifiers.some(
        (spec): spec is TSESTree.ImportDefaultSpecifier =>
          spec.type === AST_NODE_TYPES.ImportDefaultSpecifier,
      ),
  );
  const fallbackImportWithDefault = memoImports.find((memoImport) =>
    memoImport.specifiers.some(
      (spec): spec is TSESTree.ImportDefaultSpecifier =>
        spec.type === AST_NODE_TYPES.ImportDefaultSpecifier,
    ),
  );
  const defaultImportTarget = importWithDefault ?? fallbackImportWithDefault;
  if (defaultImportTarget) {
    const defaultSpecifier = defaultImportTarget.specifiers.find(
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

  const importForInsertion =
    memoImports.find(
      (memoImport) => memoImport.source.value === importSource,
    ) ?? memoImports[0];
  if (importForInsertion) {
    return {
      fixes: [
        fixer.insertTextAfter(
          importForInsertion,
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

/**
 * Names of React types that represent renderable UI or component references.
 * Props typed as any of these are stable references (JSX elements, component
 * constructors, render-prop functions) and do NOT benefit from deep value
 * comparison — flagging them would produce false positives.
 */
const REACT_RENDER_TYPE_NAMES = new Set([
  'ReactNode',
  'ReactChild',
  'ReactElement',
  'ReactPortal',
  'ReactFragment',
  // JSX.Element resolves to a global symbol named 'Element' in the JSX namespace
  'Element',
  'Component',
  'PureComponent',
  'ComponentClass',
  'FunctionComponent',
  'FC',
  'ComponentType',
  'ExoticComponent',
  'NamedExoticComponent',
  'MemoExoticComponent',
  'ForwardRefExoticComponent',
  'LazyExoticComponent',
  'JSXElementConstructor',
  'RefObject',
  'RefCallback',
  'Ref',
]);

/**
 * Returns true when `sym` is declared inside a `.d.ts` file whose path
 * contains "react" — indicating it originates from @types/react rather than
 * from user code that happens to use the same name.
 *
 * Also returns true when the symbol has NO declarations at all: this happens
 * when TypeScript resolves the type as `any` because the source module (e.g.
 * @types/react) is not included in the tsconfig `types` array.  A symbol with
 * no declarations cannot be a user-defined type, so treating it as "from
 * React" is safe — it avoids flagging props that would otherwise be excluded
 * once the types are properly wired.
 */
function isSymbolFromReactDeclarationFile(
  sym: import('typescript').Symbol,
): boolean {
  const declarations = sym.declarations;
  // No declarations ⟹ the type was resolved from an unresolvable external
  // module (common when @types/react is absent from the tsconfig types list).
  // User-defined types always have at least one declaration.
  if (!declarations || declarations.length === 0) return true;
  return declarations.some((decl) => {
    const fileName = decl.getSourceFile?.()?.fileName ?? '';
    return fileName.endsWith('.d.ts') && /react/i.test(fileName);
  });
}

/**
 * Returns true when `type` is a React render-related type that should be
 * excluded from the "complex prop" check.  Detects by matching the type's
 * alias symbol or own symbol name against a known React-type allowlist AND
 * verifying the matched symbol's declaration originates from a React `.d.ts`
 * file to avoid false negatives for user types that coincidentally share the
 * same name.
 */
function isReactRenderType(type: Type): boolean {
  // Check the aliasSymbol first (covers type aliases like ReactNode, FC, etc.)
  const aliasSymbol = (type as { aliasSymbol?: import('typescript').Symbol })
    .aliasSymbol;
  if (aliasSymbol) {
    const name = aliasSymbol.escapedName as string;
    if (
      REACT_RENDER_TYPE_NAMES.has(name) &&
      isSymbolFromReactDeclarationFile(aliasSymbol)
    ) {
      return true;
    }
  }

  // Check the type's own symbol (covers interfaces / classes like ReactElement,
  // ComponentClass, ForwardRefExoticComponent, etc.)
  const sym = type.symbol;
  if (sym) {
    const name = sym.escapedName as string;
    if (
      REACT_RENDER_TYPE_NAMES.has(name) &&
      isSymbolFromReactDeclarationFile(sym)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Root DOM interfaces that a concrete element type extends. Any interface whose
 * heritage chain reaches one of these represents a live DOM node.  DOM nodes are
 * stable references (never recreated literals), so deep-comparing them yields no
 * benefit — and worse, walking their circular `__reactFiber$*` / `__reactProps$*`
 * back-references risks a stack overflow.  They are excluded from the complex-prop
 * check for the same reason `ReactElement` is.
 */
const DOM_ELEMENT_BASE_NAMES = new Set([
  'HTMLElement',
  'SVGElement',
  'Element',
  'Node',
  'EventTarget',
]);

/**
 * Returns true when `sym` is declared inside a DOM lib `.d.ts` file (e.g.
 * `lib.dom.d.ts`).  Gating on this origin ensures a user-defined type that
 * happens to be named `Element` / `Node` is still treated as a genuine data
 * prop rather than silently carved out.  Mirrors
 * `isSymbolFromReactDeclarationFile`, but keys on the DOM lib filename.
 */
function isSymbolFromDomDeclarationFile(
  sym: import('typescript').Symbol,
): boolean {
  const declarations = sym.declarations;
  if (!declarations || declarations.length === 0) return false;
  return declarations.some((decl) => {
    const fileName = decl.getSourceFile?.()?.fileName ?? '';
    return fileName.endsWith('.d.ts') && /lib\.dom/i.test(fileName);
  });
}

/**
 * Walks a type's base-class/heritage chain (via `getBaseTypes`) looking for a
 * root DOM interface name. Handles concrete subclasses like `HTMLDivElement` or
 * `HTMLButtonElement`, whose own name is not a root but whose ancestry reaches
 * `HTMLElement` → `Element` → `Node` → `EventTarget`.
 */
function domHeritageIncludesElementBase(
  type: Type,
  checker: TypeChecker,
  visited: Set<Type>,
): boolean {
  if (visited.has(type)) return false;
  visited.add(type);

  const sym = type.symbol;
  if (sym && DOM_ELEMENT_BASE_NAMES.has(sym.escapedName as string)) {
    return true;
  }

  if (
    typeof type.isClassOrInterface === 'function' &&
    type.isClassOrInterface()
  ) {
    let baseTypes: readonly Type[] = [];
    try {
      baseTypes = checker.getBaseTypes(type);
    } catch {
      baseTypes = [];
    }
    return baseTypes.some((base) =>
      domHeritageIncludesElementBase(base, checker, visited),
    );
  }

  return false;
}

/**
 * Returns true when `type` resolves to a DOM element type that must be excluded
 * from the complex-prop check. Requires BOTH that the type originates from a DOM
 * lib `.d.ts` file AND that its heritage chain reaches a root DOM interface, so
 * only real DOM nodes — not identically named user types — are carved out.
 *
 * For union types (e.g. the ubiquitous `HTMLElement | null` MUI anchor prop) the
 * whole union counts as a DOM element only when every non-nullish member is one,
 * so a mixed union like `HTMLElement | { theme: string }` still surfaces its
 * genuine object member as complex.
 */
function isDomElementType(
  ts: typeof import('typescript'),
  type: Type,
  checker: TypeChecker,
  visited: Set<Type>,
): boolean {
  if (visited.has(type)) return false;
  visited.add(type);

  const flags = type.flags ?? 0;
  if ((flags & ts.TypeFlags.Union) !== 0) {
    const nonNullishMembers = (type as UnionType).types.filter(
      (member) =>
        (member.flags &
          (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) ===
        0,
    );
    return (
      nonNullishMembers.length > 0 &&
      nonNullishMembers.every((member) =>
        isDomElementType(ts, member, checker, visited),
      )
    );
  }

  const sym = type.symbol;
  if (!sym) return false;
  if (!isSymbolFromDomDeclarationFile(sym)) return false;

  return domHeritageIncludesElementBase(type, checker, new Set<Type>());
}

/**
 * Root DOM interface names that have no shared `*Element` suffix and so must be
 * matched exactly (unlike `HTMLDivElement`, which is caught by the family
 * pattern below).
 */
const DOM_ELEMENT_TYPE_NAME_EXACT = new Set([
  'Element',
  'Node',
  'EventTarget',
  'HTMLElement',
  'SVGElement',
  'MathMLElement',
]);

/**
 * Matches concrete DOM element interface names (`HTMLDivElement`,
 * `HTMLButtonElement`, `SVGRectElement`, `MathMLMathElement`, …) as a family so
 * subclasses are covered without enumerating every tag. Used only on the
 * annotation fallback path, where the type resolves to `any` (DOM lib absent
 * from the tsconfig `lib`) and no heritage chain is available to walk.
 */
const DOM_ELEMENT_SUBCLASS_PATTERN = /^(?:HTML|SVG|MathML)[A-Za-z0-9]*Element$/;

function isDomElementTypeName(name: string): boolean {
  return (
    DOM_ELEMENT_TYPE_NAME_EXACT.has(name) ||
    DOM_ELEMENT_SUBCLASS_PATTERN.test(name)
  );
}

/**
 * Origin gate for the annotation fallback path. A symbol declared in a DOM lib
 * `.d.ts`, or with no declarations at all (the DOM lib is absent so the global
 * resolved to `any`), is treated as DOM-sourced. A user-defined type declared in
 * project source is not — so a coincidentally named `Element`/`Node` still
 * flags.
 */
function isDomSourcedSymbol(sym: import('typescript').Symbol): boolean {
  const declarations = sym.declarations;
  if (!declarations || declarations.length === 0) return true;
  return declarations.some((decl) => {
    const fileName = decl.getSourceFile?.()?.fileName ?? '';
    return fileName.endsWith('.d.ts') && /lib\.dom/i.test(fileName);
  });
}

/**
 * Global error constructors, matched exactly on the structural path.
 *
 * An error instance exposes NO enumerable own properties — `name`, `message` and
 * `stack` are all non-enumerable — so a structural deep equality (fast-deep-equal
 * and every implementation like it) rates any two same-class errors as equal
 * whatever they report. `compareDeeply('err')` therefore swallows a re-render
 * carrying a genuinely different failure, which on a path where the error object
 * IS the semantic signal is a correctness bug rather than a saved render.
 *
 * Carved out for the same reason DOM nodes are: deep equality is meaningless on
 * a non-plain object, so the rule demands it only for plain-data shapes.
 */
const ERROR_TYPE_NAMES = new Set([
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'AggregateError',
  'DOMException',
]);

/**
 * Matches the error naming convention as a family (`HttpError`, `FirebaseError`,
 * `ErrnoException`, …). Used ONLY on the annotation fallback path, where the
 * annotation resolves to `any` and no heritage chain exists to walk — a
 * resolvable annotation is always decided structurally, so a plain-data type
 * named `ValidationError` keeps its report.
 */
const ERROR_TYPE_NAME_PATTERN = /(?:Error|Exception)$/;

function isErrorTypeName(name: string): boolean {
  return ERROR_TYPE_NAMES.has(name) || ERROR_TYPE_NAME_PATTERN.test(name);
}

/**
 * Origin gate for the structural path. Error constructors reach a project
 * through a declaration file — `lib.es5.d.ts` for the built-ins, a dependency's
 * `.d.ts` for the rest — so requiring one keeps a project-authored type that
 * merely reuses the name `Error` reportable. A symbol with no declarations at
 * all is admitted for the reason `isSymbolFromReactDeclarationFile` admits one:
 * it means the global resolved to `any` because its lib is absent, which is
 * evidence of an unresolved external, never of authored code.
 */
function isSymbolFromDeclarationFile(
  sym: import('typescript').Symbol,
): boolean {
  const declarations = sym.declarations;
  if (!declarations || declarations.length === 0) return true;
  return declarations.some((decl) =>
    /\.d\.[cm]?ts$/.test(decl.getSourceFile?.()?.fileName ?? ''),
  );
}

/**
 * Walks a type's base-class/heritage chain looking for a global error
 * constructor, so an authored `class AppError extends Error` and a dependency's
 * `interface ErrnoException extends Error` are both recognised through their
 * ancestry rather than by their own name.
 */
function errorHeritageIncludesErrorBase(
  type: Type,
  checker: TypeChecker,
  visited: Set<Type>,
): boolean {
  if (visited.has(type)) return false;
  visited.add(type);

  const sym =
    (type as { aliasSymbol?: import('typescript').Symbol }).aliasSymbol ??
    type.symbol;
  if (
    sym &&
    ERROR_TYPE_NAMES.has(sym.escapedName as string) &&
    isSymbolFromDeclarationFile(sym)
  ) {
    return true;
  }

  if (
    typeof type.isClassOrInterface === 'function' &&
    type.isClassOrInterface()
  ) {
    let baseTypes: readonly Type[] = [];
    try {
      baseTypes = checker.getBaseTypes(type);
    } catch {
      baseTypes = [];
    }
    return baseTypes.some((base) =>
      errorHeritageIncludesErrorBase(base, checker, visited),
    );
  }

  return false;
}

/**
 * The element types of an array or tuple, or `null` when the type is neither.
 * A container of errors compares just as degenerately as a lone one — two
 * same-length lists of different errors are structurally equal element by
 * element — so `Error[]` is carved out on the same grounds.
 */
function containerElementTypes(
  type: Type,
  checker: TypeChecker,
): readonly Type[] | null {
  if (!isArrayOrTupleType(checker, type)) return null;
  try {
    return (
      checker.getTypeArguments?.(type as import('typescript').TypeReference) ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Returns true when `type` holds only error instances: an error, a union of
 * errors and nullish members (`Error | null`, the shape an error prop almost
 * always has), or an array/tuple of those. A mixed union such as
 * `Error | { theme: string }` is NOT one — its object member still carries a
 * plain-data shape whose deep comparison is meaningful.
 */
function isErrorType(
  ts: typeof import('typescript'),
  type: Type,
  checker: TypeChecker,
  visited: Set<Type>,
): boolean {
  if (visited.has(type)) return false;
  visited.add(type);

  const flags = type.flags ?? 0;
  if ((flags & ts.TypeFlags.Union) !== 0) {
    const nonNullishMembers = (type as UnionType).types.filter(
      (member) =>
        (member.flags &
          (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) ===
        0,
    );
    return (
      nonNullishMembers.length > 0 &&
      nonNullishMembers.every((member) =>
        isErrorType(ts, member, checker, visited),
      )
    );
  }

  // A parameter constrained to an error (`<E extends Error>`) holds one at every
  // instantiation, so its constraint answers for it — the same reading
  // `checkTypeParameter` gives the complexity question.
  if ((flags & ts.TypeFlags.TypeParameter) !== 0) {
    const constraint = type.getConstraint?.();
    return constraint ? isErrorType(ts, constraint, checker, visited) : false;
  }

  const elementTypes = containerElementTypes(type, checker);
  if (elementTypes) {
    return (
      elementTypes.length > 0 &&
      elementTypes.every((element) =>
        isErrorType(ts, element, checker, visited),
      )
    );
  }

  return errorHeritageIncludesErrorBase(type, checker, new Set<Type>());
}

/** The rightmost identifier of an entity name (`NodeJS.ErrnoException` → `ErrnoException`). */
function rightmostEntityName(
  ts: typeof import('typescript'),
  entityName: import('typescript').EntityName,
): string | null {
  if (ts.isIdentifier?.(entityName)) return entityName.text;
  if (ts.isQualifiedName?.(entityName)) return entityName.right.text;
  return null;
}

/**
 * The generic array spellings, whose element type lives in a type argument
 * rather than in an `ArrayTypeNode`.
 */
const ARRAY_TYPE_REFERENCE_NAMES = new Set(['Array', 'ReadonlyArray']);

function arrayTypeReferenceArgument(
  ts: typeof import('typescript'),
  node: import('typescript').TypeNode,
): import('typescript').TypeNode | null {
  if (!ts.isTypeReferenceNode?.(node)) return null;
  const name = rightmostEntityName(ts, node.typeName);
  if (!name || !ARRAY_TYPE_REFERENCE_NAMES.has(name)) return null;
  const typeArguments = node.typeArguments;
  return typeArguments?.length === 1 ? typeArguments[0] : null;
}

/**
 * Annotation-path error carve-out, parallel to `isAnnotationDomElementType`.
 *
 * The container spellings all differ syntactically — `Error[]` is an
 * `ArrayTypeNode`, `readonly Error[]` wraps that in a `TypeOperatorNode`,
 * `Array<Error>` is a `TypeReferenceNode` with a type argument — so each is
 * unwrapped to the type it holds before the name underneath is judged.
 *
 * The written name decides only where the checker could NOT: a resolvable
 * annotation is answered structurally, which is what keeps a project-authored
 * `type ValidationError = { field: string }` reported despite its name.
 */
function isAnnotationErrorType(
  annotationType: import('typescript').TypeNode,
  checker: TypeChecker,
  ts: typeof import('typescript'),
): boolean {
  try {
    if (ts.isParenthesizedTypeNode?.(annotationType)) {
      return isAnnotationErrorType(annotationType.type, checker, ts);
    }

    if (
      ts.isTypeOperatorNode?.(annotationType) &&
      annotationType.operator === ts.SyntaxKind.ReadonlyKeyword
    ) {
      return isAnnotationErrorType(annotationType.type, checker, ts);
    }

    if (ts.isArrayTypeNode?.(annotationType)) {
      return isAnnotationErrorType(annotationType.elementType, checker, ts);
    }

    if (ts.isTupleTypeNode?.(annotationType)) {
      return (
        annotationType.elements.length > 0 &&
        annotationType.elements.every((element) =>
          isAnnotationErrorType(element, checker, ts),
        )
      );
    }

    if (ts.isUnionTypeNode?.(annotationType)) {
      const nonNullishMembers = annotationType.types.filter((member) => {
        if (
          member.kind === ts.SyntaxKind.NullKeyword ||
          member.kind === ts.SyntaxKind.UndefinedKeyword ||
          member.kind === ts.SyntaxKind.VoidKeyword
        ) {
          return false;
        }
        if (ts.isLiteralTypeNode?.(member)) {
          const lit = (member as import('typescript').LiteralTypeNode).literal;
          if (
            lit.kind === ts.SyntaxKind.NullKeyword ||
            lit.kind === ts.SyntaxKind.UndefinedKeyword
          ) {
            return false;
          }
        }
        return true;
      });
      return (
        nonNullishMembers.length > 0 &&
        nonNullishMembers.every((member) =>
          isAnnotationErrorType(member, checker, ts),
        )
      );
    }

    const containerArgument = arrayTypeReferenceArgument(ts, annotationType);
    if (containerArgument) {
      return isAnnotationErrorType(containerArgument, checker, ts);
    }

    const resolvedType = checker.getTypeFromTypeNode?.(annotationType);
    if (resolvedType) {
      if (isErrorType(ts, resolvedType, checker, new Set<Type>())) return true;
      if ((resolvedType.flags & ts.TypeFlags.Any) === 0) return false;
    }

    if (!ts.isTypeReferenceNode?.(annotationType)) return false;
    const name = rightmostEntityName(ts, annotationType.typeName);
    return name !== null && isErrorTypeName(name);
  } catch {
    return false;
  }
}

/**
 * Returns true when the prop's declared type is, contains only, or extends an
 * error. Both arms are consulted: the structural one answers whenever the
 * checker resolved the type, the annotation one covers the case where it could
 * not — an unresolvable import or an absent lib leaves the prop as `any` while
 * its written annotation still names the error.
 */
function isErrorProperty(
  prop: import('typescript').Symbol,
  propType: Type,
  checker: TypeChecker,
  ts: typeof import('typescript'),
): boolean {
  if (isErrorType(ts, propType, checker, new Set<Type>())) return true;

  const annotationType = extractAnnotationType(
    extractPropertyDeclaration(prop),
  );
  return Boolean(
    annotationType && isAnnotationErrorType(annotationType, checker, ts),
  );
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

  // Exclude React render-related types before any structural checks.
  // This must come early so that ReactElement (an object type) and ReactNode
  // (a union containing ReactElement) are both short-circuited here rather
  // than being caught by the isObjectType / checkUnionType branches below.
  if (isReactRenderType(type)) {
    return false;
  }

  // Exclude DOM element types (e.g. the MUI `anchorEl: HTMLElement | null`)
  // for the same reason ReactElement is excluded: DOM nodes are stable
  // references and deep-comparing them walks React's circular fiber
  // back-references, risking a stack overflow.
  if (isDomElementType(ts, type, checker, new Set<Type>())) {
    return false;
  }

  const flags = type.flags ?? 0;

  if (isUnionType(ts, flags)) {
    return checkUnionType(ts, type as UnionType, checker, visited);
  }

  if (isIntersectionType(ts, flags)) {
    return checkIntersectionType(
      ts,
      type as IntersectionType,
      checker,
      visited,
    );
  }

  if (isPrimitiveType(ts, flags)) {
    return false;
  }

  if (isTypeParameter(ts, flags)) {
    return checkTypeParameter(ts, type, checker, visited);
  }

  if (hasCallSignatures(type)) {
    return false;
  }

  if (isArrayOrTupleType(checker, type)) {
    return true;
  }

  if (isObjectType(ts, flags)) {
    return true;
  }

  return false;
}

function isUnionType(ts: typeof import('typescript'), flags: number): boolean {
  return (flags & ts.TypeFlags.Union) !== 0;
}

function checkUnionType(
  ts: typeof import('typescript'),
  unionType: UnionType,
  checker: TypeChecker,
  visited: Set<Type>,
): boolean {
  return unionType.types.some((t) =>
    isComplexTypeInternal(ts, t, checker, visited),
  );
}

function isIntersectionType(
  ts: typeof import('typescript'),
  flags: number,
): boolean {
  return (flags & ts.TypeFlags.Intersection) !== 0;
}

/**
 * Returns true when `type` holds a JavaScript primitive at runtime — a string,
 * number, boolean, bigint, symbol, enum member, or any literal/template/mapping
 * flavour of those. A union qualifies when every constituent does.
 *
 * Deliberately narrower than `isPrimitiveType`, which also accepts
 * `null`/`undefined`/`void`/`never`: those carry no runtime *value* to reason
 * about, and inside an intersection they collapse the whole type to `never`
 * anyway, so admitting them would prove nothing about the surviving members.
 */
function isRuntimePrimitiveType(
  ts: typeof import('typescript'),
  type: Type,
): boolean {
  const flags = type.flags ?? 0;

  if (
    (flags &
      (ts.TypeFlags.StringLike |
        ts.TypeFlags.NumberLike |
        ts.TypeFlags.BooleanLike |
        ts.TypeFlags.BigIntLike |
        ts.TypeFlags.ESSymbolLike |
        ts.TypeFlags.EnumLike)) !==
    0
  ) {
    return true;
  }

  // `('a' | 'b') & {}` can surface the literal union as a single member.
  if ((flags & ts.TypeFlags.Union) !== 0) {
    const members = (type as UnionType).types;
    return (
      members.length > 0 &&
      members.every((member) => isRuntimePrimitiveType(ts, member))
    );
  }

  return false;
}

/**
 * Detects the open-ended literal union idiom — a primitive intersected with an
 * object type, e.g. `'alert' | 'button' | (string & {})`, of which React's own
 * `AriaRole` is the most widespread instance. The `& {}` exists purely to defeat
 * TypeScript's literal-union widening so editors keep offering autocomplete on
 * the named members; it contributes no runtime object identity.
 *
 * A value of `string & X` is still assignable to `string`, so it is a primitive
 * at runtime no matter what `X` is. That makes `compareDeeply('role')` provably
 * inert: the consuming comparator only reaches deep equality behind a
 * `typeof value === 'object'` guard, and `isEqual` on two primitives is `===`
 * regardless. So the reduction keys on "the intersection has a primitive
 * member", not on the object member being empty — branded primitives
 * (`string & { brand: 'x' }`) reduce identically, and the widener is spelled
 * several ways in the wild (`{}`, `Record<never, never>`, `Record<string, never>`)
 * that no structural emptiness test or name allowlist covers uniformly.
 */
function isPrimitiveBackedIntersection(
  ts: typeof import('typescript'),
  intersectionType: IntersectionType,
): boolean {
  return intersectionType.types.some((member) =>
    isRuntimePrimitiveType(ts, member),
  );
}

function checkIntersectionType(
  ts: typeof import('typescript'),
  intersectionType: IntersectionType,
  checker: TypeChecker,
  visited: Set<Type>,
): boolean {
  if (isPrimitiveBackedIntersection(ts, intersectionType)) {
    return false;
  }

  return intersectionType.types.some((t) =>
    isComplexTypeInternal(ts, t, checker, visited),
  );
}

function isPrimitiveType(
  ts: typeof import('typescript'),
  flags: number,
): boolean {
  return (
    (flags &
      (ts.TypeFlags.StringLike |
        ts.TypeFlags.NumberLike |
        ts.TypeFlags.BooleanLike |
        ts.TypeFlags.BigIntLike |
        ts.TypeFlags.ESSymbolLike |
        ts.TypeFlags.Null |
        ts.TypeFlags.Undefined |
        ts.TypeFlags.Void |
        ts.TypeFlags.Never |
        ts.TypeFlags.EnumLike)) !==
    0
  );
}

function isTypeParameter(
  ts: typeof import('typescript'),
  flags: number,
): boolean {
  return (flags & ts.TypeFlags.TypeParameter) !== 0;
}

function checkTypeParameter(
  ts: typeof import('typescript'),
  type: Type,
  checker: TypeChecker,
  visited: Set<Type>,
): boolean {
  const constraint = type.getConstraint?.();
  return constraint
    ? isComplexTypeInternal(ts, constraint, checker, visited)
    : false;
}

function hasCallSignatures(type: Type): boolean {
  const callSignatures = type.getCallSignatures?.() ?? [];
  return callSignatures.length > 0;
}

function isArrayOrTupleType(checker: TypeChecker, type: Type): boolean {
  return Boolean(checker.isArrayType?.(type) || checker.isTupleType?.(type));
}

function isObjectType(ts: typeof import('typescript'), flags: number): boolean {
  return (flags & ts.TypeFlags.Object) !== 0;
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

function extractPropertyDeclaration(
  prop: import('typescript').Symbol,
): import('typescript').Declaration | undefined {
  return (
    prop.valueDeclaration ??
    (prop.declarations?.[0] as import('typescript').Declaration | undefined)
  );
}

function extractAnnotationType(
  propDeclaration?: import('typescript').Declaration,
): import('typescript').TypeNode | undefined {
  if (!propDeclaration) return undefined;
  if ('type' in propDeclaration) {
    return (propDeclaration as { type?: import('typescript').TypeNode }).type;
  }
  return undefined;
}

/**
 * Returns true when an annotation TypeNode (the explicit type written in
 * source, e.g. `React.ComponentType` or `React.ReactNode | null`) resolves to
 * a React render type that must be excluded from the complex-prop check.
 *
 * This path is taken when the prop type resolves to `any` (common when
 * @types/react is not listed in the tsconfig `types` array) but the
 * annotation still carries the original alias name via the TypeScript
 * type-checker.
 *
 * For union annotation nodes (e.g. `ReactNode | null`), all non-null /
 * non-undefined members must themselves be React render types for the whole
 * union to be considered a React render type.
 */
function isAnnotationReactRenderType(
  annotationType: import('typescript').TypeNode,
  checker: TypeChecker,
  ts: typeof import('typescript'),
): boolean {
  try {
    const tsModule = ts;

    // Handle union annotation nodes like `React.ReactNode | null`.
    if (tsModule.isUnionTypeNode?.(annotationType)) {
      const nonNullishMembers = annotationType.types.filter((member) => {
        // Nullish keywords appearing directly (older TypeScript AST forms)
        if (
          member.kind === tsModule.SyntaxKind.NullKeyword ||
          member.kind === tsModule.SyntaxKind.UndefinedKeyword ||
          member.kind === tsModule.SyntaxKind.VoidKeyword
        ) {
          return false;
        }
        // `null` and `undefined` appear as LiteralTypeNode wrapping the
        // corresponding keyword in modern TypeScript AST.
        if (tsModule.isLiteralTypeNode?.(member)) {
          const lit = (member as import('typescript').LiteralTypeNode).literal;
          if (
            lit.kind === tsModule.SyntaxKind.NullKeyword ||
            lit.kind === tsModule.SyntaxKind.UndefinedKeyword
          ) {
            return false;
          }
        }
        return true;
      });
      // If every non-nullish member is a React render type, the union is too.
      return (
        nonNullishMembers.length > 0 &&
        nonNullishMembers.every((member) =>
          isAnnotationReactRenderType(member, checker, ts),
        )
      );
    }

    // For plain TypeReference nodes (the common case), resolve via the checker.
    const resolvedType = checker.getTypeFromTypeNode?.(annotationType);
    if (!resolvedType) return false;
    return isReactRenderType(resolvedType);
  } catch {
    return false;
  }
}

/**
 * Annotation-path DOM carve-out, parallel to `isAnnotationReactRenderType`.
 *
 * When the DOM lib is absent from the tsconfig `lib`, a prop typed as
 * `HTMLElement` / `HTMLDivElement` / `Element` / `Node` resolves to `any`, so
 * the structural `isDomElementType` check cannot see it. The annotation node,
 * however, still carries the written name via the resolved type's alias/own
 * symbol. Match that name against the DOM element family (gated on DOM origin so
 * a user-defined lookalike still flags). Union annotations (e.g. the ubiquitous
 * `HTMLElement | null` MUI anchor prop) qualify only when every non-nullish
 * member is a DOM element type.
 */
function isAnnotationDomElementType(
  annotationType: import('typescript').TypeNode,
  checker: TypeChecker,
  ts: typeof import('typescript'),
): boolean {
  try {
    const tsModule = ts;

    if (tsModule.isUnionTypeNode?.(annotationType)) {
      const nonNullishMembers = annotationType.types.filter((member) => {
        if (
          member.kind === tsModule.SyntaxKind.NullKeyword ||
          member.kind === tsModule.SyntaxKind.UndefinedKeyword ||
          member.kind === tsModule.SyntaxKind.VoidKeyword
        ) {
          return false;
        }
        if (tsModule.isLiteralTypeNode?.(member)) {
          const lit = (member as import('typescript').LiteralTypeNode).literal;
          if (
            lit.kind === tsModule.SyntaxKind.NullKeyword ||
            lit.kind === tsModule.SyntaxKind.UndefinedKeyword
          ) {
            return false;
          }
        }
        return true;
      });
      return (
        nonNullishMembers.length > 0 &&
        nonNullishMembers.every((member) =>
          isAnnotationDomElementType(member, checker, ts),
        )
      );
    }

    const resolvedType = checker.getTypeFromTypeNode?.(annotationType);
    if (!resolvedType) return false;

    // Prefer the structural heritage check when the DOM lib IS loaded.
    if (isDomElementType(ts, resolvedType, checker, new Set<Type>())) {
      return true;
    }

    // Fallback for the `any` case: the resolved type surfaces the written name
    // via its alias (e.g. `HTMLElement`) or own symbol.
    const sym =
      (resolvedType as { aliasSymbol?: import('typescript').Symbol })
        .aliasSymbol ?? resolvedType.symbol;
    if (!sym) return false;
    const name = sym.escapedName as string;
    return isDomElementTypeName(name) && isDomSourcedSymbol(sym);
  } catch {
    return false;
  }
}

function shouldTreatAnyAsComplex(
  prop: import('typescript').Symbol,
  propType: Type,
  ts: typeof import('typescript'),
  treatAnyAsComplex: boolean,
  parentTypeFlags: number,
  checker?: TypeChecker,
): boolean {
  if (!(propType.flags & ts.TypeFlags.Any)) return false;
  if (treatAnyAsComplex) return true;

  const propDeclaration = extractPropertyDeclaration(prop);
  const annotationType = extractAnnotationType(propDeclaration);

  // When the annotation resolves to a React render type, the prop is a
  // stable component/render-prop reference that does not benefit from deep
  // value comparison — exclude it regardless of the any-as-complex heuristic.
  if (
    annotationType &&
    checker &&
    isAnnotationReactRenderType(annotationType, checker, ts)
  ) {
    return false;
  }

  // Likewise, when the annotation resolves to a DOM element type (e.g. the MUI
  // `anchorEl: HTMLElement | null`), the prop is a stable DOM-node reference.
  // Deep-comparing it walks React's circular fiber back-references and yields
  // no benefit — exclude it the same way React render types are excluded.
  if (
    annotationType &&
    checker &&
    isAnnotationDomElementType(annotationType, checker, ts)
  ) {
    return false;
  }

  return (
    (annotationType && annotationType.kind !== ts.SyntaxKind.AnyKeyword) ||
    (!annotationType && Boolean(parentTypeFlags & ts.TypeFlags.Object))
  );
}

function isPropertyComplex(
  prop: import('typescript').Symbol,
  checker: TypeChecker,
  tsNode: import('typescript').Node,
  ts: typeof import('typescript'),
  treatAnyAsComplex: boolean,
  parentTypeFlags: number,
): boolean {
  const propType = getTypeFromSymbol(prop, checker, tsNode);

  // Consulted ahead of every other arm, including the `any` heuristics: whether
  // a deep comparison can say anything about this prop is a property of what it
  // holds, not of how completely the checker managed to resolve it.
  if (isErrorProperty(prop, propType, checker, ts)) {
    return false;
  }

  if (isComplexType(ts, propType, checker)) {
    return true;
  }

  return shouldTreatAnyAsComplex(
    prop,
    propType,
    ts,
    treatAnyAsComplex,
    parentTypeFlags,
    checker,
  );
}

/**
 * Returns true when `declaration` was written by a dependency rather than by the
 * component's author: a declaration file, or any file under `node_modules`.
 * Keys on the same `getSourceFile().fileName` inspection the React and DOM
 * origin gates use.
 */
function isExternalDeclaration(
  declaration: import('typescript').Declaration,
): boolean {
  const sourceFile = declaration.getSourceFile?.();
  if (!sourceFile) return false;
  const fileName = sourceFile.fileName ?? '';
  return (
    sourceFile.isDeclarationFile === true ||
    /\.d\.[cm]?ts$/.test(fileName) ||
    /[/\\]node_modules[/\\]/.test(fileName)
  );
}

/**
 * Who wrote a type: a dependency (`external`), the component's own code
 * (`authored`), or a type carrying no symbol to answer with (`unknown`, e.g.
 * `string` or a bare intersection).
 */
type TypeOrigin = 'external' | 'authored' | 'unknown';

/**
 * Classifies `type` itself by the declaration sites of the alias it was written
 * as (`SystemProps`, `Readonly`) or, absent an alias, of its own symbol — an
 * interface declaration, an object type literal, or the `MappedTypeNode` a
 * mapped type is synthesized from.
 */
function classifyTypeOrigin(type: Type): TypeOrigin {
  const symbol =
    (type as { aliasSymbol?: import('typescript').Symbol }).aliasSymbol ??
    type.symbol;
  const declarations = symbol?.declarations;
  if (!declarations || declarations.length === 0) return 'unknown';
  return declarations.every(isExternalDeclaration) ? 'external' : 'authored';
}

/**
 * The sub-types of `type` that could have contributed `propName`: intersection
 * constituents, union members, and the arguments a generic alias was
 * instantiated with. The alias arm is what sees through a dependency's wrapper
 * — `Readonly<X>`/`Omit<X, K>` re-synthesize members and present themselves as
 * `lib.es5.d.ts`, while the surface they wrap may belong to either side.
 */
function propertyCarriersOf(
  type: Type,
  propName: string,
  checker: TypeChecker,
  ts: typeof import('typescript'),
): Type[] {
  const candidates: Type[] = [];
  if (type.flags & (ts.TypeFlags.Union | ts.TypeFlags.Intersection)) {
    candidates.push(...(type as UnionType | IntersectionType).types);
  }
  const aliasTypeArguments = (type as { aliasTypeArguments?: readonly Type[] })
    .aliasTypeArguments;
  if (aliasTypeArguments) candidates.push(...aliasTypeArguments);

  return candidates.filter((candidate) => {
    if (candidate === type) return false;
    try {
      return Boolean(checker.getPropertyOfType?.(candidate, propName));
    } catch {
      return false;
    }
  });
}

// Guards the descent against a self-referential alias; real props types nest a
// handful of wrappers at most.
const MAX_ORIGIN_SEARCH_DEPTH = 8;

/**
 * Answers who wrote `propName` by finding the constituent of `type` that
 * actually carries it, rather than by asking the outermost wrapper.
 *
 * Ownership is decided by the innermost carrier, so a dependency's wrapper over
 * the author's type stays authored (`Readonly<{ [K in Keys]: … }>`) and the
 * author's wrapper over a dependency's type stays external.
 */
function classifyPropertyOrigin(
  propName: string,
  type: Type,
  checker: TypeChecker,
  ts: typeof import('typescript'),
  depth = 0,
): TypeOrigin {
  const carriers =
    depth < MAX_ORIGIN_SEARCH_DEPTH
      ? propertyCarriersOf(type, propName, checker, ts)
      : [];

  if (carriers.length > 0) {
    const origins = carriers.map((carrier) =>
      classifyPropertyOrigin(propName, carrier, checker, ts, depth + 1),
    );
    // One authored carrier is enough: the author declared the prop somewhere in
    // the composition, so the remedy is theirs to apply.
    if (origins.some((origin) => origin === 'authored')) return 'authored';
    return origins.every((origin) => origin === 'external')
      ? 'external'
      : 'unknown';
  }

  const ownOrigin = classifyTypeOrigin(type);
  if (ownOrigin !== 'external') return ownOrigin;

  // No carrier holds the prop, yet the type is a dependency's: a mapping
  // construct such as `Record<OwnKeys, T>` synthesizes members from the
  // author's inputs while presenting `lib.es5.d.ts` as its own declaration
  // site. The library supplied the machinery, the author supplied the keys.
  const aliasTypeArguments = (type as { aliasTypeArguments?: readonly Type[] })
    .aliasTypeArguments;
  const hasAuthoredInput = aliasTypeArguments?.some(
    (argument) => classifyTypeOrigin(argument) === 'authored',
  );
  return hasAuthoredInput ? 'authored' : 'external';
}

/**
 * Returns true when `prop` belongs to a dependency rather than to the component
 * under lint.
 *
 * `checker.getPropertiesOfType` returns INHERITED members, so a props type that
 * extends or intersects a library interface (MUI's `TypographyProps`, React's
 * `HTMLAttributes`, …) surfaces that library's entire surface. Demanding the
 * author name those in `compareDeeply` prescribes a remedy nobody can act on —
 * the component neither declares nor receives them, and the lists run past a
 * hundred names — so the only available exit is a blanket rule disable.
 *
 * The declaration gate is `every` rather than "first declaration", so a prop the
 * author redeclares alongside the library's (the intersection of two same-named
 * members yields one symbol carrying BOTH declarations) still counts as authored
 * and is still reported.
 *
 * A prop with NO declaration site cannot be answered that way at all, and a
 * missing declaration is evidence of neither side. TypeScript propagates
 * declarations only through HOMOMORPHIC mapped types (`Readonly<T>`,
 * `Pick<T, K>`); a keyed mapped type (`{ [K in SystemKeys]?: … }` — the shape
 * MUI's `SystemProps<Theme>` gives every `Box`-derived component) synthesizes
 * fresh symbols with none, whoever wrote it. Such a prop is classified by the
 * ORIGIN of the type that carries it, which keeps a library's ~100 style
 * shorthands out of the report while the author's own mapped types stay in it.
 */
function isDependencyOwnedProperty(
  prop: import('typescript').Symbol,
  containingType: Type,
  checker: TypeChecker,
  ts: typeof import('typescript'),
): boolean {
  const declarations = prop.declarations;
  if (declarations && declarations.length > 0) {
    return declarations.every(isExternalDeclaration);
  }
  return (
    classifyPropertyOrigin(prop.name, containingType, checker, ts) ===
    'external'
  );
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
    if (isReservedReactPropName(prop.name)) continue;
    if (isDependencyOwnedProperty(prop, type, checker, ts)) continue;

    if (
      isPropertyComplex(
        prop,
        checker,
        tsNode,
        ts,
        treatAnyAsComplex,
        parentTypeFlags,
      )
    ) {
      complexProps.push(prop.name);
    }
  }

  return complexProps;
}

function normalizePropsOrder(props: string[]): string[] {
  return Array.from(new Set(props)).sort((a, b) => a.localeCompare(b));
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

function extractPropsFromTypeArguments(
  paramTsNode: import('typescript').Node,
  checker: import('typescript').TypeChecker,
  ts: typeof import('typescript'),
): string[] {
  let cursor: import('typescript').Node | undefined = paramTsNode;
  while (cursor && !ts.isCallExpression(cursor)) {
    cursor = cursor.parent;
  }
  const parentCall = cursor && ts.isCallExpression(cursor) ? cursor : undefined;
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
  return [];
}

function extractPropsFromFunctionParam(
  param: TSESTree.Parameter,
  services: TSESLint.SourceCode['parserServices'],
  ts: typeof import('typescript'),
): string[] {
  const checker = services.program.getTypeChecker();
  const paramTsNode = services.esTreeNodeToTSNodeMap.get(param);
  if (!paramTsNode) return [];

  const paramType = checker.getTypeAtLocation(paramTsNode);
  if (paramType.flags & ts.TypeFlags.Any) {
    const propsFromTypeArgs = extractPropsFromTypeArguments(
      paramTsNode,
      checker,
      ts,
    );
    if (propsFromTypeArgs.length > 0) {
      return normalizePropsOrder(propsFromTypeArgs);
    }
  }

  const treatAnyAsComplex = Boolean(paramType.flags & ts.TypeFlags.Any);
  return normalizePropsOrder(
    getComplexPropertiesFromType(
      paramType,
      checker,
      paramTsNode,
      ts,
      treatAnyAsComplex,
      paramType.flags ?? 0,
    ),
  );
}

function extractPropsFromComponentSignatures(
  tsNode: import('typescript').Node,
  checker: import('typescript').TypeChecker,
  ts: typeof import('typescript'),
): string[] {
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

  return normalizePropsOrder(Array.from(complexProps));
}

function loadTypeScriptModule(): typeof import('typescript') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('typescript');
}

function toComponentTsNode(
  componentExpr: TSESTree.Expression,
  services: TSESLint.SourceCode['parserServices'],
): import('typescript').Node | null {
  return services.esTreeNodeToTSNodeMap.get(componentExpr) ?? null;
}

function isFunctionComponentWithProps(
  componentExpr: TSESTree.Expression,
): componentExpr is
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression {
  return (
    (componentExpr.type === AST_NODE_TYPES.FunctionExpression ||
      componentExpr.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
    Boolean(componentExpr.params[0])
  );
}

function analyzeComponentTypes(
  componentExpr: TSESTree.Expression,
  services: TSESLint.SourceCode['parserServices'],
): ComponentTypeAnalysis | null {
  const tsNode = toComponentTsNode(componentExpr, services);
  if (!tsNode) return null;

  const ts = loadTypeScriptModule();
  const checker = services.program.getTypeChecker();
  return { ts, tsNode, checker };
}

function getComplexPropsFromComponent(
  componentExpr: TSESTree.Expression,
  services: TSESLint.SourceCode['parserServices'],
): string[] {
  const analysis = analyzeComponentTypes(componentExpr, services);
  if (!analysis) return [];

  const { ts, tsNode, checker } = analysis;

  if (isFunctionComponentWithProps(componentExpr)) {
    return extractPropsFromFunctionParam(componentExpr.params[0], services, ts);
  }

  return extractPropsFromComponentSignatures(tsNode, checker, ts);
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
    if (process.env.ESLINT_CUSTOM_RULES_DEBUG === '1') {
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
      ? unwrapExpression(
          unwrappedInitializer.arguments[0] as TSESTree.Expression,
        )
      : null;
  const wrappedInnerCandidate =
    unwrappedComponent.type === AST_NODE_TYPES.CallExpression &&
    unwrappedComponent.arguments.length > 0 &&
    unwrappedComponent.arguments[0]?.type !== AST_NODE_TYPES.SpreadElement
      ? unwrapExpression(unwrappedComponent.arguments[0] as TSESTree.Expression)
      : null;
  const analysisTarget =
    (initializerWrappedCandidate &&
    isComponentExpression(initializerWrappedCandidate)
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

  const preferredAnalysisTarget =
    initializerWrappedCandidate ?? wrappedInnerCandidate ?? analysisTarget;

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
  if (
    complexProps.length === 0 &&
    targets.preferredAnalysisTarget !== targets.analysisTarget
  ) {
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
    (targets.wrappedInnerCandidate
      ? componentDisplayName(targets.wrappedInnerCandidate)
      : null) ??
    componentDisplayName(componentArg) ??
    'component'
  );
}

/**
 * The file's own nesting step, taken as the most common indentation increase
 * between consecutive lines. Reading it from the source keeps emitted code in
 * the author's units instead of assuming a two-space, space-indented file.
 */
function indentUnitOf(sourceCode: TSESLint.SourceCode): string {
  const blockComments = sourceCode
    .getAllComments()
    .filter((comment) => comment.type === AST_TOKEN_TYPES.Block)
    .map((comment) => comment.range);
  // A block comment's interior lines carry the comment's own alignment, which
  // is not a nesting step of the file; counting them makes a JSDoc-heavy file
  // look 1-space indented.
  const continuesBlockComment = (offset: number) =>
    blockComments.some(([start, end]) => start < offset && offset < end);

  const frequencies = new Map<string, number>();
  let previous = '';
  let offset = 0;
  for (const line of sourceCode.getText().split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;
    if (line.trim() === '') {
      continue;
    }
    if (continuesBlockComment(lineStart)) {
      continue;
    }
    const match = /^[ \t]*/.exec(line);
    const indent = match ? match[0] : '';
    if (indent.length > previous.length && indent.startsWith(previous)) {
      const delta = indent.slice(previous.length);
      frequencies.set(delta, (frequencies.get(delta) ?? 0) + 1);
    }
    previous = indent;
  }

  let unit = '  ';
  let best = 0;
  for (const [delta, count] of frequencies) {
    if (count > best) {
      unit = delta;
      best = count;
    }
  }
  return unit;
}

/**
 * The length the edited line ends up with, simulated against the pre-edit text:
 * everything left of the replaced range on its first line, the emitted text,
 * and the CODE right of it on its last line. Single-line emissions are the only
 * ones measured, so this is the whole resulting line.
 *
 * A trailing comment is excluded from the measurement. Prettier's own accounting
 * splits on the comment's kind — it counts a trailing block comment toward the
 * line and ignores a trailing line comment, which it emits as a line suffix —
 * and the line-comment spelling is the common one, so counting neither is both
 * the closer approximation and the answer that keeps the emitted layout a
 * function of the code alone.
 */
function lineLengthAfterEdit(
  sourceCode: TSESLint.SourceCode,
  range: TSESTree.Range,
  text: string,
): number {
  const start = sourceCode.getLocFromIndex(range[0]);
  const end = sourceCode.getLocFromIndex(range[1]);
  const endLine = sourceCode.lines[end.line - 1] ?? '';
  const lineEndIndex = range[1] + (endLine.length - end.column);
  const trailingComment = sourceCode
    .getAllComments()
    .find(
      (comment) =>
        comment.range[0] >= range[1] && comment.range[0] < lineEndIndex,
    );
  const suffix = sourceCode
    .getText()
    .slice(range[1], trailingComment ? trailingComment.range[0] : lineEndIndex)
    .replace(/\s+$/, '');
  return start.column + text.length + suffix.length;
}

/** The leading whitespace of the line the given offset sits on. */
function lineIndentAt(sourceCode: TSESLint.SourceCode, index: number): string {
  const { line } = sourceCode.getLocFromIndex(index);
  const text = sourceCode.lines[line - 1] ?? '';
  const match = /^[ \t]*/.exec(text);
  return match ? match[0] : '';
}

/** The `(` that opens a call's argument list, past any type arguments. */
function argumentListOpenParen(
  sourceCode: TSESLint.SourceCode,
  callExpression: TSESTree.CallExpression,
): TSESTree.Token | null {
  let token = sourceCode.getTokenAfter(
    callExpression.typeParameters ?? callExpression.callee,
  );
  while (token && token.value !== '(') {
    token = sourceCode.getTokenAfter(token);
  }
  return token ?? null;
}

/**
 * What to emit for a call whose inline argument list overflows.
 *
 * `hug` is the case where the inline form IS the formatter's own output, so
 * the width it exceeds is not one any reformatting would take back; `decline`
 * is every case whose broken-open shape this fixer cannot reproduce, where the
 * report must stand on its own rather than carry an emission a formatter would
 * rewrite.
 */
type OverflowPlan =
  | { kind: 'wrap'; fix: TSESLint.RuleFix }
  | { kind: 'hug' }
  | { kind: 'decline' };

/**
 * A function passed as the first of two arguments is hugged: the formatter
 * keeps its header on the call's own line and prints the remaining argument
 * after its closing brace, whatever that line's width. Measured against
 * Prettier 2.7, 2.8 and 3.3, all of which leave such a line untouched at 128
 * columns.
 *
 * The shape has to be a BLOCK body. Prettier groups a first argument only when
 * it is a `function` expression or an arrow whose body is a block — a
 * concise-bodied arrow is not grouped, and its argument list breaks one
 * argument per line instead. Reading the arrow arm alone made every
 * `function Impl() {}` component read as un-hugged and expanded a call the
 * formatter then collapsed straight back (#2112).
 */
function isHuggedFirstArgument(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.FunctionExpression ||
    (node.type === AST_NODE_TYPES.ArrowFunctionExpression &&
      node.body.type === AST_NODE_TYPES.BlockStatement)
  );
}

/**
 * Prettier's layout for a two-argument call that does not fit on one line: each
 * argument alone on its own line, one nesting step in, with a trailing comma.
 */
/**
 * Whether appending the comparator forces the formatter to break the argument
 * list open however short the edited line is.
 *
 * A call whose SOLE argument is a multi-line function is printed hugged: the
 * argument keeps the call's own line and its body indents beneath it. Adding a
 * second argument withdraws that layout unless the first argument is one the
 * formatter still groups — a block-bodied arrow, as in `useEffect(() => {…}, [])`.
 * For a concise-bodied arrow the formatter puts every argument on its own line
 * instead, so an inline emission there is text it immediately rewrites, and the
 * width the edit lands at never sees it: the insertion point is the call's short
 * LAST line (#2112).
 */
function forcesArgumentListBreak(
  sourceCode: TSESLint.SourceCode,
  componentArg: TSESTree.Node,
): boolean {
  return (
    /[\r\n]/.test(sourceCode.getText(componentArg)) &&
    !isHuggedFirstArgument(componentArg)
  );
}

function planOverflow(
  sourceCode: TSESLint.SourceCode,
  fixer: TSESLint.RuleFixer,
  callExpression: TSESTree.CallExpression,
  localName: string,
  propLiterals: readonly string[],
  printWidth: number,
  indentUnit: string,
): OverflowPlan {
  const openParen = argumentListOpenParen(sourceCode, callExpression);
  const closingParen = sourceCode.getLastToken(callExpression);
  if (!openParen || !closingParen || closingParen.value !== ')') {
    return { kind: 'decline' };
  }

  const componentArg = callExpression.arguments[0];
  if (!componentArg || componentArg.type === AST_NODE_TYPES.SpreadElement) {
    return { kind: 'decline' };
  }

  // Parentheses the author wrote around the argument are kept: they can be
  // load-bearing, most sharply around a sequence expression, where dropping
  // them turns one argument into two. The call's own `(` is not one of them,
  // so a lone argument does not acquire a second pair.
  const tokenBeforeComponent = sourceCode.getTokenBefore(componentArg);
  const tokenAfterComponent = sourceCode.getTokenAfter(componentArg);
  const componentRange: TSESTree.Range =
    tokenBeforeComponent &&
    tokenBeforeComponent.value === '(' &&
    tokenBeforeComponent.range[0] !== openParen.range[0] &&
    tokenAfterComponent?.value === ')'
      ? [tokenBeforeComponent.range[0], tokenAfterComponent.range[1]]
      : componentArg.range;
  const componentText = sourceCode
    .getText()
    .slice(componentRange[0], componentRange[1]);
  // Where the formatter hugs such a component, the inline form is what it
  // prints anyway, so that call keeps its fix untouched.
  const componentIsMultiline = /[\r\n]/.test(componentText);
  if (componentIsMultiline && isHuggedFirstArgument(componentArg)) {
    return { kind: 'hug' };
  }

  // Rebuilding the argument list drops anything in it that is not one of the
  // two arguments, so a comment between them would be deleted outright.
  const hasInteriorComment = sourceCode
    .getCommentsInside(callExpression)
    .some(
      (comment) =>
        comment.range[0] >= openParen.range[1] &&
        comment.range[1] <= closingParen.range[0],
    );
  if (hasInteriorComment) {
    return { kind: 'decline' };
  }

  const indent = lineIndentAt(sourceCode, callExpression.range[0]);
  const argIndent = `${indent}${indentUnit}`;

  // A component written across lines keeps its own interior layout; moving it
  // into the broken-open list shifts every line of it one step deeper, which is
  // a uniform shift and so preserves the relative indentation the author (or
  // the formatter) chose.
  //
  // Whitespace inside a template literal is DATA, not layout — shifting those
  // lines would edit the string's value — so they are left exactly where they
  // are. That is what the formatter does with them too, which is why the
  // component can still move rather than having to decline: declining here
  // would withhold the fix from a concise-bodied arrow while a block-bodied one
  // (hugged, and so never re-indented) kept it, making fix availability depend
  // on how the component is spelled.
  const templateSpans = sourceCode
    .getTokens(callExpression)
    .filter(
      (token) =>
        token.type === AST_TOKEN_TYPES.Template &&
        /[\r\n]/.test(token.value) &&
        token.range[1] > componentRange[0] &&
        token.range[0] < componentRange[1],
    )
    .map((token) => token.range);
  const componentLines = componentText.split('\n');
  let lineStart = componentRange[0];
  const reindentedComponent = componentLines
    .map((line, index) => {
      const offset = lineStart;
      lineStart += line.length + 1;
      // A blank continuation line gains no indentation: the formatter does not
      // write trailing whitespace, and emitting some would itself be rewritten.
      if (index === 0 || line.trim() === '') {
        return line;
      }
      const insideTemplate = templateSpans.some(
        ([from, to]) => offset > from && offset < to,
      );
      return insideTemplate ? line : `${indentUnit}${line}`;
    })
    .join('\n');
  // The component argument is emitted verbatim; when any of its lines overflows
  // once shifted, the formatter would break the expression itself in a shape
  // this fixer cannot predict.
  const widest = reindentedComponent
    .split('\n')
    .reduce(
      (worst, line, index) =>
        Math.max(worst, (index === 0 ? argIndent.length : 0) + line.length),
      0,
    );
  if (widest + 1 > printWidth) {
    return { kind: 'decline' };
  }

  const comparatorText = `${localName}(${propLiterals.join(', ')})`;
  const comparatorBlock =
    argIndent.length + comparatorText.length + 1 <= printWidth
      ? `${argIndent}${comparatorText},`
      : // A prop list too long even on its own line breaks one prop per line,
        // which is where the formatter takes it next.
        [
          `${argIndent}${localName}(`,
          ...propLiterals.map(
            (literal) => `${argIndent}${indentUnit}${literal},`,
          ),
          `${argIndent}),`,
        ].join('\n');

  return {
    kind: 'wrap',
    fix: fixer.replaceTextRange(
      [openParen.range[1], closingParen.range[0]],
      `\n${argIndent}${reindentedComponent},\n${comparatorBlock}\n${indent}`,
    ),
  };
}

function buildMemoFixes(
  sourceCode: TSESLint.SourceCode,
  fixer: TSESLint.RuleFixer,
  callExpression: TSESTree.CallExpression,
  comparatorArg: TSESTree.CallExpressionArgument | undefined,
  propLiterals: readonly string[],
  memoSource: string,
  scope: TSESLint.Scope.Scope,
  printWidth: number,
  indentUnit: string,
  resolveCompareDeeplyImport: (
    fixer: TSESLint.RuleFixer,
    memoSource: string,
  ) => {
    fixes: TSESLint.RuleFix[];
    localName: string;
    commit: () => void;
  },
): TSESLint.RuleFix[] {
  const fixes: TSESLint.RuleFix[] = [];
  const importResult = resolveCompareDeeplyImport(fixer, memoSource);
  const comparatorText = `${importResult.localName}(${propLiterals.join(
    ', ',
  )})`;
  // Every emission below is measured before it is chosen: the comparator's text
  // grows with the component's complex-prop count, so an unconditionally inline
  // argument list overflows the print width on ordinary components. Wrapping
  // unconditionally is the mirror failure — a formatter collapses a short
  // argument list back onto one line — so the width decides.
  const firstArgument = callExpression.arguments[0];
  const mustBreakArgumentList =
    !!firstArgument && forcesArgumentListBreak(sourceCode, firstArgument);
  const overflowPlan = () =>
    planOverflow(
      sourceCode,
      fixer,
      callExpression,
      importResult.localName,
      propLiterals,
      printWidth,
      indentUnit,
    );

  /**
   * The emission for a measurement that overflows: the broken-open argument
   * list, the inline text the formatter hugs anyway, or nothing at all — never
   * the over-wide line the measurement just rejected.
   */
  /**
   * The comparator with one prop per line, at the call's own nesting. This is
   * where the formatter takes a hugged call whose CLOSING line overflows: it
   * breaks the comparator's argument list and keeps the hug, rather than
   * withdrawing the hug and expanding the outer list (#2112).
   */
  const brokenComparator = (): string => {
    const indent = lineIndentAt(sourceCode, callExpression.range[0]);
    return [
      `${importResult.localName}(`,
      ...propLiterals.map((literal) => `${indent}${indentUnit}${literal},`),
      `${indent})`,
    ].join('\n');
  };

  const overflowFix = (
    inline: TSESLint.RuleFix,
    editRange: TSESTree.Range,
    prefix: string,
  ): TSESLint.RuleFix | null => {
    const plan = overflowPlan();
    if (plan.kind === 'wrap') return plan.fix;
    if (plan.kind !== 'hug') return null;
    // Reaching here means the inline emission was measured over the width, and
    // the hug itself stands either way. What the formatter does with the
    // over-wide CLOSING line then splits on the hugged argument's spelling —
    // measured against Prettier 2.8.8, the binary agora runs:
    //
    //   memo(function Impl() {…}, compareDeeply(…))  breaks the comparator
    //   memo(() => {…},           compareDeeply(…))  is left long
    //
    // so the arrow keeps the inline emission and only the `function` spelling
    // takes the broken one. Emitting either shape for both is churn in one
    // direction or the other (#2112).
    return firstArgument?.type === AST_NODE_TYPES.FunctionExpression
      ? fixer.replaceTextRange(editRange, `${prefix}${brokenComparator()}`)
      : inline;
  };

  if (
    comparatorArg &&
    comparatorArg.type !== AST_NODE_TYPES.SpreadElement &&
    isNullishComparatorArgument(comparatorArg, scope)
  ) {
    const comparatorRange = rangeWithParentheses(
      sourceCode,
      comparatorArg as TSESTree.Expression,
    );
    const inline = fixer.replaceTextRange(comparatorRange, comparatorText);
    if (
      lineLengthAfterEdit(sourceCode, comparatorRange, comparatorText) <=
        printWidth &&
      !mustBreakArgumentList
    ) {
      fixes.push(inline);
    } else {
      const fix = overflowFix(inline, comparatorRange, '');
      if (!fix) return [];
      fixes.push(fix);
    }
  } else {
    const closingParen = sourceCode.getLastToken(callExpression);
    if (closingParen) {
      const tokenBeforeParen = sourceCode.getTokenBefore(closingParen);
      const insertText = `, ${comparatorText}`;
      const editRange: TSESTree.Range =
        tokenBeforeParen?.value === ','
          ? tokenBeforeParen.range
          : [closingParen.range[0], closingParen.range[0]];
      const inline = fixer.replaceTextRange(editRange, insertText);
      if (
        lineLengthAfterEdit(sourceCode, editRange, insertText) <= printWidth &&
        !mustBreakArgumentList
      ) {
        fixes.push(inline);
      } else {
        const fix = overflowFix(inline, editRange, ', ');
        if (!fix) return [];
        fixes.push(fix);
      }
    }
  }
  if (fixes.length === 0) {
    return [];
  }
  fixes.push(...importResult.fixes);
  // The import belongs to the output only once a comparator fix is emitted; a
  // declined fix that recorded the local name would leave a later report in the
  // same file emitting an identifier nothing imports.
  importResult.commit();
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
  const componentInitializers = new WeakMap<
    TSESLint.Scope.Scope,
    Map<string, TSESTree.Expression>
  >();

  function recordComponentInitializer(
    node: TSESTree.VariableDeclarator,
    scope: TSESLint.Scope.Scope,
  ): void {
    if (node.id.type !== AST_NODE_TYPES.Identifier || !node.init) return;
    const currentScopeInitializers =
      componentInitializers.get(scope) ??
      new Map<string, TSESTree.Expression>();
    currentScopeInitializers.set(
      node.id.name,
      node.init as TSESTree.Expression,
    );
    componentInitializers.set(scope, currentScopeInitializers);
  }

  function getInitializer(
    name: string,
    scope: TSESLint.Scope.Scope,
  ): TSESTree.Expression | null {
    let currentScope: TSESLint.Scope.Scope | null = scope;
    while (currentScope) {
      const initializerMap = componentInitializers.get(currentScope);
      if (initializerMap?.has(name)) {
        return initializerMap.get(name) ?? null;
      }
      currentScope =
        (currentScope.upper as TSESLint.Scope.Scope | null) ?? null;
    }
    return null;
  }

  return {
    recordComponentInitializer,
    getInitializer,
  };
}

export const memoCompareDeeplyComplexProps = createRule<Options, MessageIds>({
  name: 'memo-compare-deeply-complex-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Suggest compareDeeply for memoized components that receive object/array props to avoid shallow comparison re-renders.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          printWidth: {
            type: 'number',
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useCompareDeeply:
        'What\'s wrong: Memoized component "{{componentName}}" receives complex prop(s) {{propsList}} but memo still uses shallow reference comparison → Why it matters: Objects/arrays are often recreated on each render, so shallow comparison treats them as "changed" and triggers avoidable re-renders → How to fix: Pass compareDeeply({{propsCall}}) as memo\'s second argument to compare those props by value.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const sourceCode = context.getSourceCode();
    const usedNames = collectUsedNames(sourceCode);
    const complexPropsCache = new WeakMap<TSESTree.Expression, string[]>();
    const memoImportTracking = createMemoImportTracking();
    const initializerTracking = createComponentInitializerTracker();
    let cachedCompareDeeplyImportLocalName: string | null = null;

    const printWidth =
      typeof options.printWidth === 'number' && options.printWidth > 0
        ? options.printWidth
        : DEFAULT_PRINT_WIDTH;

    // Derived once per file rather than per fix: every fix in a file shares the
    // author's nesting step.
    let cachedIndentUnit: string | null = null;
    const fileIndentUnit = () => {
      if (cachedIndentUnit === null) {
        cachedIndentUnit = indentUnitOf(sourceCode);
      }
      return cachedIndentUnit;
    };

    function resolveCompareDeeplyImport(
      fixer: TSESLint.RuleFixer,
      memoSource: string,
    ) {
      if (cachedCompareDeeplyImportLocalName) {
        return {
          fixes: [],
          localName: cachedCompareDeeplyImportLocalName,
          commit: () => undefined,
        };
      }

      const result = ensureCompareDeeplyImportFixes(
        sourceCode,
        fixer,
        usedNames,
        memoSource,
      );
      return {
        ...result,
        commit: () => {
          cachedCompareDeeplyImportLocalName = result.localName;
        },
      };
    }

    function validateMemoCall(node: TSESTree.CallExpression) {
      const memoCall = memoImportTracking.isMemoCall(node);
      if (!memoCall) return null;
      if (node.arguments.length === 0 || node.arguments.length > 2) return null;

      const componentArg = node.arguments[0];
      if (!componentArg || componentArg.type === AST_NODE_TYPES.SpreadElement)
        return null;

      const comparatorArg = node.arguments[1];
      return { memoCall, componentArg, comparatorArg };
    }

    function analyzeComponentAndProps(
      componentArg: TSESTree.Expression,
      comparatorArg: TSESTree.CallExpressionArgument | undefined,
      currentScope: TSESLint.Scope.Scope,
      memoSource: string,
    ) {
      const componentTargets = findComponentAnalysisTargets(
        componentArg,
        (name) => initializerTracking.getInitializer(name, currentScope),
      );
      if (!componentTargets) return null;

      if (isComparatorProvided(comparatorArg, currentScope)) return null;

      let complexProps = collectComplexPropsForTargets(
        componentTargets,
        (expr) => collectComplexProps(expr, sourceCode, complexPropsCache),
      );

      if (isUtilMemoModulePath(memoSource)) {
        complexProps = complexProps.filter(
          (prop) => !isDefaultDeepCompareProp(prop),
        );
      }

      if (complexProps.length === 0) return null;

      const componentName = resolveComponentName(
        componentTargets,
        componentArg,
      );
      return { complexProps, componentName };
    }

    function generateReportData(complexProps: string[], componentName: string) {
      const propsList = `[${complexProps.join(', ')}]`;
      const propLiterals = complexProps.map((prop) =>
        escapeStringForCodeGeneration(prop),
      );

      return {
        componentName,
        propsList,
        propLiterals,
        propsCall: propLiterals.join(', '),
      };
    }

    return {
      ImportDeclaration: memoImportTracking.recordImport,
      VariableDeclarator(node) {
        initializerTracking.recordComponentInitializer(
          node,
          context.getScope(),
        );
      },
      CallExpression(node) {
        const validationResult = validateMemoCall(node);
        if (!validationResult) return;

        const { memoCall, componentArg, comparatorArg } = validationResult;
        const currentScope = context.getScope();
        const analysisResult = analyzeComponentAndProps(
          componentArg,
          comparatorArg,
          currentScope,
          memoCall.source,
        );
        if (!analysisResult) return;

        const { complexProps, componentName } = analysisResult;
        const { propsList, propsCall, propLiterals } = generateReportData(
          complexProps,
          componentName,
        );

        context.report({
          node,
          messageId: 'useCompareDeeply',
          data: {
            componentName,
            propsList,
            propsCall,
          },
          fix(fixer) {
            const fixes = buildMemoFixes(
              sourceCode,
              fixer,
              node,
              comparatorArg,
              propLiterals,
              memoCall.source,
              currentScope,
              printWidth,
              fileIndentUnit(),
              resolveCompareDeeplyImport,
            );
            // An empty list declines the fix: emitting the measured over-wide
            // line would leave the source failing a formatter check.
            return fixes.length > 0 ? fixes : null;
          },
        });
      },
    };
  },
});

export default memoCompareDeeplyComplexProps;
