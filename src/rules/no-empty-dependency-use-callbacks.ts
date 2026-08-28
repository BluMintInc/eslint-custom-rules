import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import { planOrphanedImportRemoval, TextRange } from '../utils/importRemoval';

type Options = [
  {
    ignoreTestFiles?: boolean;
    testFilePatterns?: string[];
    ignoreUseLatestCallback?: boolean;
  },
];

type MessageIds = 'preferUtilityFunction' | 'preferUtilityLatest';

const DEFAULT_TEST_PATTERNS = ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'];

const PREFER_UTILITY_FUNCTION_MESSAGE = [
  'What\'s wrong: "{{name}}" uses useCallback([]) but never reads component/hook state',
  'Why it matters: empty-deps callbacks are already stable, so hook bookkeeping adds overhead without benefit',
  'How to fix: move "{{name}}" to a module-level utility (or add an eslint-disable with a short justification if you intentionally keep it for memoized children).',
].join(' -> ');

const PREFER_UTILITY_LATEST_MESSAGE = [
  'What\'s wrong: useLatestCallback wraps "{{name}}" even though it never reads component/hook state',
  'Why it matters: the hook wrapper adds indirection without preventing stale closures',
  'How to fix: extract "{{name}}" to a module-level utility (or disable with a brief note if you rely on HMR or a stale-closure pattern).',
].join(' -> ');

function isHookCallee(
  callee: TSESTree.LeftHandSideExpression,
  hookName: string,
): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === hookName;
  }

  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === hookName
  );
}

function isUseCallbackCallee(callee: TSESTree.LeftHandSideExpression): boolean {
  return isHookCallee(callee, 'useCallback');
}

function isUseLatestCallbackCallee(
  callee: TSESTree.LeftHandSideExpression,
): boolean {
  return isHookCallee(callee, 'useLatestCallback');
}

function isFunctionExpression(
  node: TSESTree.Node | undefined,
): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
  return (
    !!node &&
    (node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionExpression)
  );
}

function isPropertyKey(
  parent: TSESTree.Node | null | undefined,
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): boolean {
  if (!parent) return false;
  if (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.property === identifier &&
    !parent.computed
  ) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.Property &&
    parent.key === identifier &&
    !parent.computed &&
    !parent.shorthand
  ) {
    return true;
  }
  return false;
}

function collectNearestBlockTypeBindings(node: TSESTree.Node): Set<string> {
  const localTypes = new Set<string>();
  let current: TSESTree.Node | undefined = node.parent ?? undefined;

  const addTypeParameters = (maybeNode: TSESTree.Node | undefined): void => {
    if (!maybeNode) return;
    const typeParameters = (
      maybeNode as {
        typeParameters?:
          | TSESTree.TSTypeParameterDeclaration
          | TSESTree.TSTypeParameterInstantiation;
      }
    ).typeParameters;

    if (
      typeParameters &&
      typeParameters.type === AST_NODE_TYPES.TSTypeParameterDeclaration
    ) {
      for (const param of typeParameters.params) {
        const name =
          typeof param.name === 'string' ? param.name : param.name.name;
        localTypes.add(name);
      }
    }
  };

  while (current) {
    addTypeParameters(current);
    if (current.type === AST_NODE_TYPES.BlockStatement) {
      for (const statement of current.body) {
        if (
          statement.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
          statement.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
          statement.type === AST_NODE_TYPES.ClassDeclaration ||
          statement.type === AST_NODE_TYPES.TSEnumDeclaration
        ) {
          localTypes.add(statement.id.name);
          continue;
        }
        if (
          statement.type === AST_NODE_TYPES.TSModuleDeclaration &&
          (statement.id.type === AST_NODE_TYPES.Identifier ||
            statement.id.type === AST_NODE_TYPES.Literal)
        ) {
          const name =
            statement.id.type === AST_NODE_TYPES.Identifier
              ? statement.id.name
              : String(statement.id.value);
          localTypes.add(name);
        }
      }
    }
    if (current.type === AST_NODE_TYPES.Program) {
      break;
    }
    current = current.parent ?? undefined;
  }

  return localTypes;
}

function usesLocalTypeBindings(
  typeRoots: TSESTree.Node[],
  localTypes: Set<string>,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  if (!typeRoots.length || localTypes.size === 0) {
    return false;
  }
  const visitorKeys = sourceCode.visitorKeys;
  const stack = [...typeRoots];

  while (stack.length) {
    const current = stack.pop() as TSESTree.Node;
    if (
      current.type === AST_NODE_TYPES.Identifier &&
      localTypes.has(current.name)
    ) {
      return true;
    }
    if (current.type === AST_NODE_TYPES.TSQualifiedName) {
      let left: TSESTree.EntityName = current.left;
      while (left.type === AST_NODE_TYPES.TSQualifiedName) {
        left = left.left;
      }
      if (
        left.type === AST_NODE_TYPES.Identifier &&
        localTypes.has(left.name)
      ) {
        return true;
      }
      // Qualified names (e.g. External.LocalType) are scoped by their leftmost
      // namespace. Traversing into the right side can falsely match an
      // unrelated local type with the same name.
      continue;
    }
    const keys = visitorKeys[current.type];
    if (!keys) continue;
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const element of value) {
          if (element && typeof (element as TSESTree.Node).type === 'string') {
            stack.push(element as TSESTree.Node);
          }
        }
      } else if (value && typeof (value as TSESTree.Node).type === 'string') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return false;
}

function collectBodyTypeAnnotations(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): TSESTree.Node[] {
  const typeNodes: TSESTree.Node[] = [];
  const visitorKeys = sourceCode.visitorKeys;
  const stack = [node];

  while (stack.length) {
    const current = stack.pop() as TSESTree.Node;

    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression
    ) {
      typeNodes.push(current.typeAnnotation);
    } else if (current.type === AST_NODE_TYPES.TSTypeAssertion) {
      typeNodes.push(current.typeAnnotation);
    }

    const typeAnnotation = (current as { typeAnnotation?: TSESTree.Node })
      .typeAnnotation;
    if (typeAnnotation) {
      if (typeAnnotation.type === AST_NODE_TYPES.TSTypeAnnotation) {
        typeNodes.push(typeAnnotation.typeAnnotation);
      } else {
        typeNodes.push(typeAnnotation);
      }
    }

    const typeParameters = (
      current as {
        typeParameters?:
          | TSESTree.TSTypeParameterDeclaration
          | TSESTree.TSTypeParameterInstantiation;
      }
    ).typeParameters;
    if (typeParameters) {
      typeNodes.push(typeParameters);
    }

    const returnType = (current as { returnType?: TSESTree.Node }).returnType;
    if (returnType) {
      typeNodes.push(returnType);
    }

    const keys = visitorKeys[current.type];
    if (!keys) continue;
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const element of value) {
          if (element && typeof (element as TSESTree.Node).type === 'string') {
            stack.push(element as TSESTree.Node);
          }
        }
      } else if (value && typeof (value as TSESTree.Node).type === 'string') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return typeNodes;
}

function findHoistTarget(node: TSESTree.Node): TSESTree.Node | null {
  let current: TSESTree.Node | undefined = node;

  while (current?.parent) {
    if (current.parent.type === AST_NODE_TYPES.Program) {
      return current;
    }
    if (
      current.parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
      current.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration
    ) {
      return current.parent;
    }
    current = current.parent as TSESTree.Node;
  }

  return null;
}

function getCallbackArg(
  node: TSESTree.CallExpression,
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null {
  const [maybeFn] = node.arguments;
  if (isFunctionExpression(maybeFn)) {
    return maybeFn;
  }
  return null;
}

function hasEmptyDependencyArray(node: TSESTree.CallExpression): boolean {
  if (node.arguments.length < 2) return false;
  const deps = node.arguments[1];
  return (
    deps.type === AST_NODE_TYPES.ArrayExpression && deps.elements.length === 0
  );
}

function filenameMatchesPatterns(
  filename: string,
  patterns: string[],
): boolean {
  const normalized = filename.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? normalized;
  return patterns.some(
    (pattern) => minimatch(normalized, pattern) || minimatch(basename, pattern),
  );
}

function usesThisOrSuper(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  const visitorKeys = sourceCode.visitorKeys;
  const stack = [node];

  while (stack.length) {
    const current = stack.pop() as TSESTree.Node;
    if (
      current.type === AST_NODE_TYPES.ThisExpression ||
      current.type === AST_NODE_TYPES.Super
    ) {
      return true;
    }
    const keys = visitorKeys[current.type];
    if (!keys) continue;
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const element of value) {
          if (element && typeof (element as TSESTree.Node).type === 'string') {
            stack.push(element as TSESTree.Node);
          }
        }
      } else if (value && typeof (value as TSESTree.Node).type === 'string') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return false;
}

function analyzeExternalReferences(
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  extraTypeRoots: TSESTree.Node[] = [],
): { hasComponentScopeRef: boolean } {
  const sourceCode = context.getSourceCode();
  if (usesThisOrSuper(fn.body, sourceCode)) {
    return { hasComponentScopeRef: true };
  }
  let hasComponentScopeRef = false;
  const scopeManager = sourceCode.scopeManager;
  if (!scopeManager) {
    return { hasComponentScopeRef: true };
  }
  const scope = scopeManager.acquire(fn, true) ?? scopeManager.acquire(fn);
  if (!scope) {
    return { hasComponentScopeRef: true };
  }

  if (!hasComponentScopeRef) {
    for (const ref of scope.through) {
      const identifier = ref.identifier;
      if (isPropertyKey(identifier.parent, identifier)) {
        continue;
      }
      const resolved = ref.resolved;
      if (!resolved) {
        continue;
      }

      const def = resolved.defs[0];
      const scopeType = resolved.scope.type;
      const isImport = def?.type === 'ImportBinding';
      const isModuleOrGlobal = scopeType === 'module' || scopeType === 'global';

      if (!isImport && !isModuleOrGlobal) {
        hasComponentScopeRef = true;
        break;
      }
    }
  }

  if (!hasComponentScopeRef) {
    const typeRoots: TSESTree.Node[] = [];
    if (fn.returnType) {
      typeRoots.push(fn.returnType.typeAnnotation);
    }
    if (fn.typeParameters) {
      typeRoots.push(fn.typeParameters);
    }
    for (const param of fn.params) {
      if ('typeAnnotation' in param && param.typeAnnotation) {
        typeRoots.push(param.typeAnnotation.typeAnnotation);
      } else if (
        param.type === AST_NODE_TYPES.AssignmentPattern &&
        'typeAnnotation' in param.left &&
        param.left.typeAnnotation
      ) {
        typeRoots.push(param.left.typeAnnotation.typeAnnotation);
      }
    }

    typeRoots.push(...collectBodyTypeAnnotations(fn.body, sourceCode));
    typeRoots.push(...extraTypeRoots);

    if (typeRoots.some((typeRoot) => usesThisOrSuper(typeRoot, sourceCode))) {
      hasComponentScopeRef = true;
    }

    if (!hasComponentScopeRef) {
      const localTypes = collectNearestBlockTypeBindings(fn);
      if (
        localTypes.size > 0 &&
        usesLocalTypeBindings(typeRoots, localTypes, sourceCode)
      ) {
        hasComponentScopeRef = true;
      }
    }
  }

  return { hasComponentScopeRef };
}

function getProgramNode(node: TSESTree.Node): TSESTree.Program | null {
  let current: TSESTree.Node | undefined = node;
  while (current && current.type !== AST_NODE_TYPES.Program) {
    current = current.parent ?? undefined;
  }
  return current?.type === AST_NODE_TYPES.Program ? current : null;
}

function addPatternIdentifiersToSet(
  pattern:
    | TSESTree.BindingName
    | TSESTree.AssignmentPattern
    | TSESTree.RestElement,
  names: Set<string>,
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      names.add(pattern.name);
      return;
    case AST_NODE_TYPES.ObjectPattern:
      for (const property of pattern.properties) {
        if (property.type === AST_NODE_TYPES.Property) {
          addPatternIdentifiersToSet(
            property.value as TSESTree.BindingName,
            names,
          );
        } else if (property.type === AST_NODE_TYPES.RestElement) {
          addPatternIdentifiersToSet(
            property.argument as TSESTree.BindingName,
            names,
          );
        }
      }
      return;
    case AST_NODE_TYPES.ArrayPattern:
      for (const element of pattern.elements) {
        if (!element) continue;
        if (element.type === AST_NODE_TYPES.RestElement) {
          addPatternIdentifiersToSet(
            element.argument as TSESTree.BindingName,
            names,
          );
        } else {
          addPatternIdentifiersToSet(element as TSESTree.BindingName, names);
        }
      }
      return;
    case AST_NODE_TYPES.RestElement:
      addPatternIdentifiersToSet(
        pattern.argument as TSESTree.BindingName,
        names,
      );
      return;
    case AST_NODE_TYPES.AssignmentPattern:
      addPatternIdentifiersToSet(pattern.left, names);
      return;
  }
}

function getModuleScopeValueBindings(program: TSESTree.Program): Set<string> {
  const names = new Set<string>();

  for (const statement of program.body) {
    const target =
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration ||
      statement.type === AST_NODE_TYPES.ExportDefaultDeclaration
        ? statement.declaration
        : statement;

    if (!target) continue;

    if (target.type === AST_NODE_TYPES.ImportDeclaration) {
      for (const specifier of target.specifiers) {
        names.add(specifier.local.name);
      }
      continue;
    }

    if (target.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declaration of target.declarations) {
        addPatternIdentifiersToSet(declaration.id, names);
      }
      continue;
    }

    if (
      target.type === AST_NODE_TYPES.FunctionDeclaration ||
      target.type === AST_NODE_TYPES.ClassDeclaration ||
      target.type === AST_NODE_TYPES.TSEnumDeclaration
    ) {
      if (target.id) {
        names.add(target.id.name);
      }
    }
  }

  return names;
}

/** The leading whitespace of the line the offset sits on. */
function indentationAt(
  sourceCode: Readonly<TSESLint.SourceCode>,
  offset: number,
): string {
  const text = sourceCode.getText();
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const match = /^[ \t]*/.exec(text.slice(lineStart, offset));
  return match ? match[0] : '';
}

/**
 * Ranges whose interior line breaks carry string data rather than formatting.
 * A multi-line template literal (or a string spliced together with line
 * continuations) evaluates to the whitespace written inside it, so shifting
 * those lines would silently change the value the code produces.
 */
function stringDataRangesOf(
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.Node,
): TSESTree.Range[] {
  return sourceCode
    .getTokens(node)
    .filter(
      (token) =>
        (token.type === AST_TOKEN_TYPES.Template ||
          token.type === AST_TOKEN_TYPES.String) &&
        token.loc.start.line !== token.loc.end.line,
    )
    .map((token) => token.range);
}

/**
 * The callback's text re-indented for the module scope it is hoisted into.
 *
 * Module scope sits at least one nesting level shallower than the component
 * body the callback is lifted out of, so splicing the text verbatim leaves
 * every interior line — and the closing brace — indented for a level the
 * declaration no longer occupies (issue #1560). Each line therefore moves by
 * the difference between the callback's original indentation and the
 * indentation of the statement the declaration is inserted before. The
 * callback's own line is the reference rather than the declaration's, so a
 * callback broken onto its own argument line sheds that extra level too.
 */
function dedentedCallbackText(
  sourceCode: Readonly<TSESLint.SourceCode>,
  callback: TSESTree.Node,
  hoistTarget: TSESTree.Node,
): string {
  const text = sourceCode.getText(callback);
  const targetIndent = indentationAt(sourceCode, hoistTarget.range[0]);
  const callbackIndent = indentationAt(sourceCode, callback.range[0]);

  if (targetIndent === callbackIndent) {
    return text;
  }

  const shiftLine = ((): ((line: string) => string) | null => {
    if (callbackIndent.startsWith(targetIndent)) {
      const removed = callbackIndent.slice(targetIndent.length);
      return (line) =>
        line.startsWith(removed) ? line.slice(removed.length) : line;
    }
    if (targetIndent.startsWith(callbackIndent)) {
      const added = targetIndent.slice(callbackIndent.length);
      return (line) => `${added}${line}`;
    }
    // Indent characters that disagree give no delta that can be applied
    // without corrupting the layout, so the text is left as the author wrote it.
    return null;
  })();

  if (!shiftLine) {
    return text;
  }

  const stringData = stringDataRangesOf(sourceCode, callback);
  const carriesStringData = (offset: number) =>
    stringData.some(([start, end]) => start < offset && offset < end);

  let offset = callback.range[0];
  return text
    .split('\n')
    .map((line, index) => {
      const lineStart = offset;
      offset += line.length + 1;
      // The first line is spliced in after the hoisted declaration's `=`, so it
      // has no indentation of its own left to adjust.
      if (index === 0 || line.trim() === '' || carriesStringData(lineStart)) {
        return line;
      }
      return shiftLine(line);
    })
    .join('\n');
}

/** One rewrite the fix performs: `range` becomes `text`. */
type Edit = { range: TextRange; text: string };

/** A hoistable callback the rule reports, held until `Program:exit`. */
type Violation = {
  node: TSESTree.CallExpression;
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
  messageId: MessageIds;
  name: string;
};

/** A hoist that is ready to ship, with the deletions it owns. */
type HoistPlan = {
  edits: Edit[];
  /**
   * The positions the hoist genuinely erases, for the orphaned-import analysis.
   *
   * The hoist is not a deletion: the declared identifier and the callback text
   * are re-emitted at module scope, so every reference inside them outlives the
   * fix. Only the wrapper disappears — the `const` keyword, the ` = hook(`
   * between the identifier and the callback, and the trailing `, []);`.
   * Orphanhood is judged against those three slices alone, which keeps a hook
   * call nested in the callback body counted as a live reference (the hoist
   * carries that inner call along verbatim).
   */
  removed: TextRange[];
  /**
   * The span the edits occupy, from the module-scope insertion point to the end
   * of the declaration being lifted.
   */
  span: TextRange;
};

/** A violation whose hoist ships, paired with the plan that carries it. */
type PlannedViolation = HoistPlan & { violation: Violation };

function rangesOverlap(a: TextRange, b: TextRange): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function buildHoistPlan(
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  callExpression: TSESTree.CallExpression,
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  hoistedIdentifierCache: WeakMap<TSESTree.Program, Set<string>>,
): HoistPlan | null {
  if (
    !callExpression.parent ||
    callExpression.parent.type !== AST_NODE_TYPES.VariableDeclarator
  ) {
    return null;
  }

  const declarator = callExpression.parent;
  if (declarator.id.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const varDecl = declarator.parent;
  if (
    !varDecl ||
    varDecl.type !== AST_NODE_TYPES.VariableDeclaration ||
    varDecl.declarations.length !== 1
  ) {
    return null;
  }

  if (varDecl.kind !== 'const') {
    return null;
  }

  if (
    !varDecl.parent ||
    varDecl.parent.type !== AST_NODE_TYPES.BlockStatement
  ) {
    return null;
  }

  const hoistTarget = findHoistTarget(varDecl.parent);
  if (!hoistTarget) {
    return null;
  }

  const programNode = getProgramNode(hoistTarget);
  let moduleBindings: Set<string> | null = null;
  if (programNode) {
    const cachedBindings = hoistedIdentifierCache.get(programNode);
    moduleBindings = cachedBindings ?? getModuleScopeValueBindings(programNode);
    if (!cachedBindings) {
      hoistedIdentifierCache.set(programNode, moduleBindings);
    }
    if (moduleBindings.has(declarator.id.name)) {
      return null;
    }
    // Reserve the identifier so later callbacks in the same file with the same
    // name do not attempt to hoist and produce duplicate declarations.
    moduleBindings.add(declarator.id.name);
  }

  const sourceCode = context.getSourceCode();
  // We use the full range of the id to ensure we capture any type annotations.
  // In @typescript-eslint/parser, the Identifier range already includes the
  // type annotation, but we explicitly calculate the end range for robustness.
  const idRangeEnd =
    declarator.id.typeAnnotation &&
    declarator.id.typeAnnotation.range[1] > declarator.id.range[1]
      ? declarator.id.typeAnnotation.range[1]
      : declarator.id.range[1];

  const identifierText = sourceCode
    .getText()
    .slice(declarator.id.range[0], idRangeEnd);
  const functionText = dedentedCallbackText(sourceCode, callback, hoistTarget);
  const hoisted = `const ${identifierText} = ${functionText};\n`;
  const fileText = sourceCode.getText();
  let removeStart = varDecl.range[0];
  const lineStart = fileText.lastIndexOf('\n', removeStart - 1) + 1;
  const leadingSegment = fileText.slice(lineStart, removeStart);
  const hasOnlyIndentBefore = /^[ \t]*$/.test(leadingSegment);
  if (hasOnlyIndentBefore) {
    removeStart = lineStart;
  }

  let removeEnd = varDecl.range[1];
  const lineEnd = fileText.indexOf('\n', removeEnd);
  const segmentEnd = lineEnd === -1 ? fileText.length : lineEnd;
  const trailingSegment = fileText.slice(removeEnd, segmentEnd);
  const hasOnlyWhitespaceAfter = /^[ \t]*$/.test(trailingSegment);
  if (hasOnlyWhitespaceAfter) {
    removeEnd = segmentEnd;
  }

  if (hasOnlyIndentBefore && hasOnlyWhitespaceAfter && lineEnd !== -1) {
    removeEnd = lineEnd + 1;
  }

  return {
    edits: [
      { range: [hoistTarget.range[0], hoistTarget.range[0]], text: hoisted },
      { range: [removeStart, removeEnd], text: '' },
    ],
    removed: [
      [removeStart, declarator.id.range[0]],
      [idRangeEnd, callback.range[0]],
      [callback.range[1], removeEnd],
    ],
    span: [hoistTarget.range[0], removeEnd],
  };
}

export const noEmptyDependencyUseCallbacks = createRule<Options, MessageIds>({
  name: 'no-empty-dependency-use-callbacks',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage useCallback([]) or useLatestCallback around static functions. Static callbacks do not need hook machinery—extract them to module-level utilities for clarity and to avoid unnecessary hook overhead.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          ignoreTestFiles: { type: 'boolean', default: true },
          testFilePatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_TEST_PATTERNS,
          },
          ignoreUseLatestCallback: { type: 'boolean', default: false },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferUtilityFunction: PREFER_UTILITY_FUNCTION_MESSAGE,
      preferUtilityLatest: PREFER_UTILITY_LATEST_MESSAGE,
    },
  },
  defaultOptions: [{}],
  create(context) {
    const [options] = context.options;
    const ignoreTestFiles = options?.ignoreTestFiles !== false;
    const testPatterns = options?.testFilePatterns ?? DEFAULT_TEST_PATTERNS;
    const ignoreUseLatestCallback = options?.ignoreUseLatestCallback === true;
    const hoistedIdentifierCache = new WeakMap<TSESTree.Program, Set<string>>();
    const sourceCode = context.getSourceCode();

    const filename = context.getFilename();
    const isTest =
      ignoreTestFiles && filenameMatchesPatterns(filename, testPatterns);

    /**
     * Every hoistable callback the rule finds, in traversal order.
     *
     * Reporting is deferred to `Program:exit` because the binding the call
     * reads — the `useCallback` specifier, or the `React` default import behind
     * `React.useCallback` — is unbound only once no surviving call references
     * it. Judged one call at a time, a file with two hoistable callbacks never
     * sees either as the binding's last use, and the pass that hoists both
     * resolves every report — so nothing ever revisits the stranded import.
     */
    const violations: Violation[] = [];

    /**
     * A suppressed report is dropped together with its fix, so its hoist never
     * happens: counting it toward the batch would unbind an import the
     * surviving call still reads.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * The hoists that actually ship.
     *
     * Each is screened alone before it joins the batch: a hoist whose own
     * deletion orphans something that cannot be unbound safely — a local
     * variable, an import behind a directive comment — would otherwise poison
     * every other hoist in the file.
     *
     * Candidates are then ordered and screened for collisions exactly as ESLint
     * orders and screens competing reports, so batching cannot change which of
     * two colliding hoists lands. A nested pair collides: both insert at the
     * same module-scope offset, but the inner declaration's span ends first, so
     * the inner hoist wins and the outer one waits for a later pass — hoisting
     * the outer instead would relocate the inner hook call to module scope.
     * Sibling hoists in one component share only that zero-width insertion
     * point, so both ship together.
     */
    function planViolations(): PlannedViolation[] {
      const candidates: PlannedViolation[] = [];

      for (const violation of violations) {
        if (isReportSuppressed(violation.node)) continue;
        const plan = buildHoistPlan(
          context,
          violation.node,
          violation.callback,
          hoistedIdentifierCache,
        );
        if (!plan) continue;
        if (planOrphanedImportRemoval(sourceCode, plan.removed) === null) {
          continue;
        }
        candidates.push({ violation, ...plan });
      }

      candidates.sort(
        (left, right) =>
          left.span[0] - right.span[0] || left.span[1] - right.span[1],
      );

      const planned: PlannedViolation[] = [];
      const claimed: TextRange[] = [];
      for (const candidate of candidates) {
        if (
          claimed.some((taken) =>
            candidate.edits.some((edit) => rangesOverlap(edit.range, taken)),
          )
        ) {
          continue;
        }
        claimed.push(...candidate.edits.map((edit) => edit.range));
        planned.push(candidate);
      }

      return planned;
    }

    function reportIfStaticCallback(
      callExpression: TSESTree.CallExpression,
      messageId: MessageIds,
    ): void {
      const callee = callExpression.callee;
      if (
        callee.type !== AST_NODE_TYPES.Identifier &&
        callee.type !== AST_NODE_TYPES.MemberExpression
      ) {
        return;
      }

      const callback = getCallbackArg(callExpression);
      if (!callback) return;

      // The exemption is for a callback that RENDERS. Handing `callback.body`
      // let a callback returning a FUNCTION claim it, because returnsJSX
      // unwraps a handed function instead of judging it as a value — so
      // `useCallback(() => () => <div/>, [])` was exempt while the identical
      // block-bodied spelling reported (#2192).
      if (ASTHelpers.returnsJSX(callback, context)) return;

      const extraTypeRoots: TSESTree.Node[] = [];
      if (
        callExpression.parent &&
        callExpression.parent.type === AST_NODE_TYPES.VariableDeclarator &&
        'typeAnnotation' in callExpression.parent.id &&
        callExpression.parent.id.typeAnnotation
      ) {
        const typeAnnotation = callExpression.parent.id.typeAnnotation;
        if (typeAnnotation.type === AST_NODE_TYPES.TSTypeAnnotation) {
          extraTypeRoots.push(typeAnnotation.typeAnnotation);
        } else {
          extraTypeRoots.push(typeAnnotation);
        }
      }

      const { hasComponentScopeRef } = analyzeExternalReferences(
        context,
        callback,
        extraTypeRoots,
      );
      if (hasComponentScopeRef) {
        return;
      }

      const callbackName =
        callExpression.parent &&
        callExpression.parent.type === AST_NODE_TYPES.VariableDeclarator &&
        callExpression.parent.id.type === AST_NODE_TYPES.Identifier
          ? callExpression.parent.id.name
          : 'this callback';

      violations.push({
        node: callExpression,
        callback,
        messageId,
        name: callbackName,
      });
    }

    return {
      CallExpression(node) {
        if (isTest) return;
        const { callee } = node;

        if (
          callee.type !== AST_NODE_TYPES.Identifier &&
          callee.type !== AST_NODE_TYPES.MemberExpression
        ) {
          return;
        }

        if (isUseCallbackCallee(callee)) {
          if (!hasEmptyDependencyArray(node)) {
            return;
          }
          reportIfStaticCallback(node, 'preferUtilityFunction');
          return;
        }

        if (ignoreUseLatestCallback) return;
        if (isUseLatestCallbackCallee(callee)) {
          reportIfStaticCallback(node, 'preferUtilityLatest');
        }
      },
      'Program:exit'() {
        if (violations.length === 0) return;

        const planned = planViolations();
        // One plan over every surviving hoist: the binding behind the callee is
        // left unreferenced by their union even when no single hoist strips its
        // last use, and the pass that applies them all resolves every report —
        // so this is the only moment the stranded import is visible.
        const importRemoval =
          planned.length > 0
            ? planOrphanedImportRemoval(
                sourceCode,
                planned.flatMap((entry) => entry.removed),
              )
            : null;

        // The whole batch ships as one fix, so no hoist can land without the
        // others the import's orphanhood was judged against, and no unbinding
        // can land without the hoist it was claimed on. The other violations
        // report without a fixer; the carrier's pass already resolves them.
        //
        // No plan at all means some binding would be left unreferenced yet
        // cannot be unbound safely, so every hoist stays behind: reports
        // without a fixer are the lesser damage. Hoisting anyway would trade
        // this rule's report for an unused-import one, and nothing re-reports
        // that debt once the hoist has resolved the original violation.
        const removalRanges: readonly TextRange[] = importRemoval ?? [];
        const carrier = importRemoval ? planned[0] : undefined;

        for (const violation of violations) {
          context.report({
            node: violation.node,
            messageId: violation.messageId,
            data: { name: violation.name },
            fix:
              violation === carrier?.violation
                ? (fixer: TSESLint.RuleFixer) => [
                    ...removalRanges.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    ),
                    ...planned.flatMap((entry) =>
                      entry.edits.map((edit) =>
                        fixer.replaceTextRange(
                          [edit.range[0], edit.range[1]],
                          edit.text,
                        ),
                      ),
                    ),
                  ]
                : undefined,
          });
        }
      },
    };
  },
});

export default noEmptyDependencyUseCallbacks;
