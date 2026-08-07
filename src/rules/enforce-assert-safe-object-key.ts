import fs from 'fs';
import path from 'path';
import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

type MessageIds = 'useAssertSafe';
type Options = [
  {
    readonly assertSafeImportPath?: string;
  },
];

const DEFAULT_IMPORT_PATH = 'functions/src/util/assertSafe';
const ASSERT_SAFE_NAME = 'assertSafe';

/**
 * A named specifier that binds `assertSafe` under its own name — the only shape
 * that makes a bare `assertSafe(...)` call resolve to the helper. An alias
 * (`import { assertSafe as ensureSafe }`) leaves the name free for the injected
 * import, and a type-only specifier erases at compile time.
 */
function isAssertSafeSpecifier(
  specifier: TSESTree.Node,
): specifier is TSESTree.ImportSpecifier {
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.name === ASSERT_SAFE_NAME &&
    specifier.local.name === ASSERT_SAFE_NAME
  );
}

/**
 * Drops the extension and normalizes separators so two spellings of one module
 * compare equal.
 */
function normalizeModulePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\.(tsx?|jsx?|mts|cts)$/i, '');
}

/**
 * Extensions whose module system the file name settles on its own, ahead of any
 * package manifest: `.mjs` is ESM and `.cjs` is CommonJS by definition, while a
 * TypeScript source — `.mts` included — is compiled before it runs and its
 * specifiers are resolved by the compiler, which accepts the extensionless
 * form. Only `.js` is ambiguous and has to ask the nearest manifest.
 */
const NATIVE_ESM_EXTENSION = /\.mjs$/i;
const NON_NATIVE_ESM_EXTENSION = /\.(cjs|tsx?|mts|cts)$/i;
const AMBIGUOUS_JS_EXTENSION = /\.js$/i;

/**
 * Whether the nearest `package.json` at or above `startDir` declares
 * `"type": "module"`, which is what makes a `.js` file native ESM. Node consults
 * only the first manifest found, and treats a missing `type` field as
 * CommonJS — so the walk stops at the first manifest it can read, not at the
 * first one that declares a type.
 *
 * Every filesystem touch is optional: a manifest that cannot be read is
 * indistinguishable from an absent one and the walk continues, while a manifest
 * that cannot be parsed declines the extension rather than guessing. Declining
 * yields the bare specifier, which every non-ESM consumer resolves — the safer
 * answer when the tree cannot say which kind of consumer this is.
 */
function nearestManifestDeclaresModule(startDir: string): boolean {
  let dir = startDir;
  for (;;) {
    let manifest: string;
    try {
      manifest = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) {
        return false;
      }
      dir = parent;
      continue;
    }
    try {
      return (
        (JSON.parse(manifest) as { type?: unknown } | null)?.type === 'module'
      );
    } catch {
      return false;
    }
  }
}

/**
 * `jest.mock` hoists its module factory above the file's imports;
 * `doMock`/`setMock` register a factory of the same shape at call time. The
 * hoist rejects a factory that reads any out-of-scope binding whose name does
 * not begin with `mock`, which is what puts the injected `assertSafe` import
 * out of reach inside one.
 */
const MOCK_REGISTRARS = new Set(['mock', 'doMock', 'setMock']);

/** Whether the call registers a module factory with `jest`. */
function isMockRegistrarCall(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const { object, property } = callee;
  return (
    object.type === AST_NODE_TYPES.Identifier &&
    object.name === 'jest' &&
    property.type === AST_NODE_TYPES.Identifier &&
    MOCK_REGISTRARS.has(property.name)
  );
}

/**
 * Whether the node sits inside the factory a jest registrar hoists — the second
 * argument of the call. The module specifier that precedes it is evaluated in
 * place and keeps its access to the file's imports, so only the factory subtree
 * is out of reach.
 */
function isInsideMockFactory(node: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
  let parent = node.parent;
  while (parent) {
    if (
      parent.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments[1] === child &&
      isMockRegistrarCall(parent)
    ) {
      return true;
    }
    child = parent;
    parent = parent.parent;
  }
  return false;
}

/**
 * Strips the wrappers that stand between a computed key and the value that
 * actually names the property. `k as string`, `k satisfies string`, `<string>k`
 * and `k!` erase at compile time, and `await k` resolves to the very same key,
 * so every one of them leaves the run-time lookup untouched — including a lookup
 * of `__proto__` or `constructor`. Reading the wrapper instead of what it holds
 * classifies nothing and turns appending `as string` into a silent bypass of the
 * guard, so the wrappers are peeled off before the key is judged.
 *
 * The peel repeats because the wrappers nest: `(x as any)!` is a non-null
 * assertion over a type assertion.
 *
 * Everything peeled here erases before the code runs, which is why the peel is
 * unconditional. An optional chain does not, so it is handled apart from these
 * — see `unwrapOptionalChain`.
 */
function unwrapKeyExpression(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  for (;;) {
    switch (current.type) {
      case AST_NODE_TYPES.TSAsExpression:
      case AST_NODE_TYPES.TSSatisfiesExpression:
      case AST_NODE_TYPES.TSNonNullExpression:
      case AST_NODE_TYPES.TSTypeAssertion:
        current = current.expression;
        break;
      case AST_NODE_TYPES.AwaitExpression:
        current = current.argument;
        break;
      default:
        return current;
    }
  }
}

/**
 * Reads through an optional chain to the member access or call it holds.
 * `source?.key` parses as a `ChainExpression` wrapping the member expression,
 * so a classification that matches a bare `MemberExpression` — or a numeric
 * proof that matches `.length` — sees the wrapper and recognizes nothing.
 *
 * Kept apart from `unwrapKeyExpression` rather than folded into it because the
 * two make different claims. Those wrappers are gone before the code runs; `?.`
 * survives and short-circuits, so it is read through only where the question is
 * "what value names this property", never where the question is what the
 * expression does. That value is what the chain evaluates to, `undefined`
 * included — and the chain guards a nullish RECEIVER, not a hostile KEY:
 * `"__proto__"` is a perfectly non-nullish string, so `store[req.body?.key]`
 * reaches the prototype surface exactly as `store[req.body.key]` does.
 */
function unwrapOptionalChain(node: TSESTree.Node): TSESTree.Node {
  return node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
}

/**
 * The key expression stripped of every wrapper standing between it and the
 * value that names the property: the compile-time assertions and the `await`
 * that `unwrapKeyExpression` peels, plus an optional chain.
 *
 * The peel repeats because the two kinds nest in either order — `source?.key as
 * string` is an assertion over a chain, `(source as Raw)?.key` a chain over an
 * assertion.
 */
function unwrapWrittenKey(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  for (;;) {
    const peeled = unwrapOptionalChain(unwrapKeyExpression(current));
    if (peeled === current) {
      return current;
    }
    current = peeled;
  }
}

/** Names that read as a positional sequence rather than a keyed record. */
const ARRAY_LIKE_NAME = /^(array|arr|items|elements|list|collection|data)s?$/i;

/**
 * The name an indexed object is judged by. A collection reached as a field —
 * `raster.data[i]`, `this.items[i]`, `a.b.list[i]` — carries its signal on the
 * property rather than on the root object, so the property name is what the
 * array-ish test sees there.
 */
function indexedObjectName(node: TSESTree.Node): string {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier
  ) {
    return node.property.name;
  }
  return '';
}

/**
 * Operators that coerce both operands with ToNumeric before operating, so the
 * result is a number (or bigint) whatever the operands hold. `+` is absent: it
 * keeps string concatenation, so it is judged from its operands instead.
 */
const NUMERIC_BINARY_OPERATORS = new Set([
  '-',
  '*',
  '/',
  '%',
  '**',
  '<<',
  '>>',
  '>>>',
  '&',
  '|',
  '^',
]);

/** The compound assignments of NUMERIC_BINARY_OPERATORS, `+=` excluded. */
const NUMERIC_ASSIGNMENT_OPERATORS = new Set([
  '-=',
  '*=',
  '/=',
  '%=',
  '**=',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '|=',
  '^=',
]);

/** Global conversions whose result is a number regardless of the argument. */
const NUMERIC_CALLEE_NAMES = new Set(['Number', 'parseInt', 'parseFloat']);

/**
 * Whether the call is guaranteed to produce a number. Every `Math` member
 * returns one, so the namespace is accepted wholesale rather than enumerated.
 */
function isNumericCall(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return NUMERIC_CALLEE_NAMES.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Math'
  );
}

/**
 * A `: number` annotation on a binding name. Parameters and variable
 * declarators are the bindings that carry one, and TypeScript checks every
 * value that reaches such a binding against it.
 */
function isNumberAnnotated(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.Identifier &&
    node.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSNumberKeyword
  );
}

/** The types an assertion can launder any value through without complaint. */
const LAUNDERING_ASSERTION_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.TSAnyKeyword,
  AST_NODE_TYPES.TSUnknownKeyword,
]);

/**
 * An assertion naming `number` over the value it wraps — `f() as number`,
 * `f() satisfies number`, `<number>f()`. An assertion to anything other than
 * the `number` keyword — `as any`, `as unknown`, `as string`, `as const`, a
 * union, a generic — is not this claim at all.
 *
 * The claim is only worth trusting because TypeScript checks it: `f() as number`
 * is rejected unless the operand's type overlaps `number`. A step through `any`
 * or `unknown` removes exactly that check, which is what makes
 * `userInput as unknown as number` the idiom for asserting anything at all — so
 * a chain carrying one proves nothing, and a string laundered through it would
 * re-open the `__proto__` key this rule exists to stop.
 */
function assertsNumberType(node: TSESTree.Node): boolean {
  if (
    (node.type !== AST_NODE_TYPES.TSAsExpression &&
      node.type !== AST_NODE_TYPES.TSSatisfiesExpression &&
      node.type !== AST_NODE_TYPES.TSTypeAssertion) ||
    node.typeAnnotation.type !== AST_NODE_TYPES.TSNumberKeyword
  ) {
    return false;
  }
  for (
    let inner: TSESTree.Node = node.expression;
    inner.type === AST_NODE_TYPES.TSAsExpression ||
    inner.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    inner.type === AST_NODE_TYPES.TSTypeAssertion;
    inner = inner.expression
  ) {
    if (LAUNDERING_ASSERTION_TYPES.has(inner.typeAnnotation.type)) {
      return false;
    }
  }
  return true;
}

/**
 * Whether the write is the initializer of a declaration that declares itself
 * numeric — either by annotating the binding name (`const k: number =
 * rankOf(id)`, `(index: number = rankOf(id)) =>`) or by asserting the
 * initializing value (`const k = rankOf(id) as number`). TypeScript rejects a
 * non-numeric value under either spelling, so on a TypeScript source both are
 * syntactic proof that the value is a number — the same trust a
 * `(index: number) =>` parameter already earns. Without them an author whose
 * index comes from a call has no compliant spelling at all, because the shape
 * of a call proves nothing on its own.
 *
 * The proof covers the initializer alone. A later assignment is a separate
 * statement and is where a value out of a `catch` binding or an `any`-typed
 * source enters the binding, so every other write still has to prove itself by
 * its own shape — including a `for (k of xs)` binding, whose write expression
 * is the iterated value rather than an initializer.
 */
function initializesNumericDeclaration(writeExpr: TSESTree.Node): boolean {
  const site = writeExpr.parent;
  switch (site?.type) {
    case AST_NODE_TYPES.VariableDeclarator:
      // A destructuring pattern takes the initializer apart before binding, so
      // an assertion over the whole initializer describes the container rather
      // than the element bound out of it: `const { a } = f() as number` says
      // nothing about `a`.
      return (
        site.id.type === AST_NODE_TYPES.Identifier &&
        (isNumberAnnotated(site.id) || assertsNumberType(writeExpr))
      );
    // A parameter default is checked against the parameter's own annotation the
    // same way a declarator's initializer is checked against its own. That
    // annotation is also what admits the parameter as a numeric binding at all,
    // so an assertion on the default decides nothing here.
    case AST_NODE_TYPES.AssignmentPattern:
      return isNumberAnnotated(site.left);
    default:
      return false;
  }
}

/**
 * Whether the definition can hold a number: a declarator (whose value is proven
 * by its declaration site and its writes) or a parameter annotated `: number`.
 * Anything else — an import, a function or class name, a catch binding — is
 * not.
 */
function definesNumericBinding(def: TSESLint.Scope.Definition): boolean {
  return (
    def.node.type === AST_NODE_TYPES.VariableDeclarator ||
    isNumberAnnotated(def.name)
  );
}

export const enforceAssertSafeObjectKey = createRule<Options, MessageIds>({
  name: 'enforce-assert-safe-object-key',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce the use of assertSafe(id) when accessing object properties with computed keys that involve string interpolation or explicit string conversion.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          assertSafeImportPath: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useAssertSafe:
        'Dynamic object key "{{key}}" is used without assertSafe() validation. Unvalidated keys can resolve to unexpected properties (including prototype fields) and make lookups fragile or unsafe. Wrap the key with assertSafe({{key}}) before accessing the object.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const importPath = options?.assertSafeImportPath || DEFAULT_IMPORT_PATH;
    // Repo-root-anchored location of the helper, the yardstick every module
    // specifier written in the file is compared against.
    const assertSafeTarget = normalizeModulePath(importPath);
    // Whether an earlier fix in this pass already carries the import. The AST is
    // not re-parsed between the fixes of a single pass, so the import can only
    // be claimed once: a second fix repeating it would span the same insertion
    // point, overlap, and be dropped along with its wrap.
    let importClaimed = false;

    /**
     * The `import { assertSafe }` statement rides on a single violation's fix,
     * making that violation the file's import carrier. A suppressed carrier
     * would take the import down with it while the surviving violations still
     * emit `assertSafe(...)`, leaving the call unbound.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * The directory ESLint itself was configured with, which is what
     * `importPath` is anchored at. The node process cwd is only a fallback for
     * harnesses that predate `getCwd`: the two differ under the VS Code ESLint
     * extension, in monorepos, and for any programmatic `new ESLint({ cwd })`,
     * and anchoring at the process cwd there emits an unresolvable specifier.
     */
    const cwd =
      typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();

    /**
     * Directory of the file being fixed, relative to the configured cwd, or
     * null for virtual/stdin files (RuleTester default 'file.ts', '<input>',
     * '<text>') whose non-absolute name cannot anchor a relative path.
     */
    const fileDirFromRoot = (): string | null => {
      const rawFilename = context.getFilename().replace(/\\/g, '/');
      if (!path.isAbsolute(rawFilename)) {
        return null;
      }
      const fileRelToCwd = path.relative(cwd, rawFilename).replace(/\\/g, '/');
      return path.posix.dirname(fileRelToCwd);
    };

    /**
     * Whether the file being fixed runs as native ESM, where node's resolver
     * takes a specifier literally and an extensionless one throws
     * ERR_MODULE_NOT_FOUND at startup. TypeScript and bundler consumers resolve
     * extensionless specifiers themselves, so they keep the bare form.
     *
     * The walk for an ambiguous `.js` file runs only while a fix is being built,
     * costs a handful of stat-sized reads, and needs an absolute name to have a
     * directory to start from.
     */
    const isNativeEsmFile = (): boolean => {
      const filename = context.getFilename().replace(/\\/g, '/');
      if (NATIVE_ESM_EXTENSION.test(filename)) {
        return true;
      }
      if (
        NON_NATIVE_ESM_EXTENSION.test(filename) ||
        !AMBIGUOUS_JS_EXTENSION.test(filename) ||
        !path.isAbsolute(filename)
      ) {
        return false;
      }
      return nearestManifestDeclaresModule(path.dirname(filename));
    };

    /**
     * Computes the module specifier for the injected assertSafe import.
     *
     * `importPath` is anchored at the repo root — the directory ESLint runs
     * with, not the node process cwd — matching how avoid-utils-directory and
     * test-file-location-enforcement treat paths. A bare repo-root specifier
     * such as 'functions/src/util/assertSafe' is unresolvable inside the
     * functions/ TS project, whose baseUrl is functions/: it would resolve to
     * functions/functions/src/util/assertSafe, which does not exist. The
     * specifier is therefore derived relative to the file being fixed so the
     * emitted import resolves from that file's location.
     */
    const computeImportSpecifier = (): string => {
      // The helper is authored as TypeScript and runs as its compiled output, so
      // a native-ESM importer names the emitted `.js` file. TS resolves a `.js`
      // specifier back to the `.ts` source under nodenext, which keeps the one
      // spelling correct for both.
      const extension = isNativeEsmFile() ? '.js' : '';
      const fileDir = fileDirFromRoot();
      // Emitting the configured path verbatim preserves the option's literal
      // value for non-file lints.
      if (fileDir === null) {
        return `${importPath}${extension}`;
      }
      let specifier = path.posix.relative(fileDir, assertSafeTarget);
      if (!specifier.startsWith('.')) {
        specifier = `./${specifier}`;
      }
      return `${specifier}${extension}`;
    };

    /**
     * Whether a module specifier written in the file denotes the same helper the
     * fix imports. A relative specifier is resolved against the file's own
     * directory before the comparison, because the configured path is anchored
     * at the repo root: `../../assertSafe` inside functions/src/util/a/b and
     * `functions/src/util/assertSafe` name one module, and treating them as
     * different would withhold the fix from files that import the helper
     * perfectly well.
     */
    const isAssertSafeModule = (source: string): boolean => {
      const normalized = normalizeModulePath(source);
      if (normalized === assertSafeTarget) {
        return true;
      }
      if (!normalized.startsWith('.')) {
        return false;
      }
      const fileDir = fileDirFromRoot();
      if (fileDir === null) {
        return false;
      }
      return (
        path.posix.normalize(path.posix.join(fileDir, normalized)) ===
        assertSafeTarget
      );
    };

    /**
     * Read the import off the AST instead of a traversal flag: a violation that
     * precedes the import declaration in source order would otherwise be judged
     * against a flag the `ImportDeclaration` visitor has not set yet, emitting a
     * duplicate import.
     */
    const importsAssertSafe = (program: TSESTree.Program): boolean =>
      program.body.some(
        (statement) =>
          statement.type === AST_NODE_TYPES.ImportDeclaration &&
          statement.importKind !== 'type' &&
          isAssertSafeModule(statement.source.value) &&
          statement.specifiers.some(isAssertSafeSpecifier),
      );

    /**
     * Whether every declaration of a visible `assertSafe` binding is the helper
     * import itself. A local const/function/class, a parameter, a namespace or
     * default import, or a named import from another module all mean the emitted
     * `assertSafe(...)` call would resolve somewhere other than the helper.
     */
    const bindsAssertSafe = (variable: TSESLint.Scope.Variable): boolean =>
      variable.defs.length > 0 &&
      variable.defs.every((def) => {
        const specifier = def.node as TSESTree.Node;
        if (!isAssertSafeSpecifier(specifier)) {
          return false;
        }
        const declaration = specifier.parent;
        return (
          declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
          declaration.importKind !== 'type' &&
          isAssertSafeModule(declaration.source.value)
        );
      });

    /**
     * Emits the `import { assertSafe }` statement the wrapped call needs. The
     * position comes from the shared anchor so the file's prologue keeps its
     * meaning: a `'use client'` directive stops being a directive the moment a
     * statement precedes it, and a `#!` shebang stops parsing once it leaves
     * character 0.
     */
    const addAssertSafeImport = (
      fixer: TSESLint.RuleFixer,
    ): TSESLint.RuleFix => {
      const importStatement = `import { assertSafe } from '${computeImportSpecifier()}';\n`;
      return insertAtImportAnchor(
        context.sourceCode,
        fixer,
        importInsertionAnchor(context.sourceCode),
        importStatement,
      );
    };

    /**
     * Helper function to create fixes for a node
     */
    const createFixes = (
      fixer: TSESLint.RuleFixer,
      node: TSESTree.Node,
      argText: string,
    ): TSESLint.RuleFix[] => {
      const fixes: TSESLint.RuleFix[] = [];

      if (!importClaimed && !importsAssertSafe(context.sourceCode.ast)) {
        fixes.push(addAssertSafeImport(fixer));
        importClaimed = true;
      }

      // Replace the node with assertSafe(argText)
      fixes.push(fixer.replaceText(node, `assertSafe(${argText})`));

      return fixes;
    };

    // The report is emitted even when suppressed: ESLint discards it, and
    // reporting keeps the user's disable directive "used" so that
    // `--report-unused-disable-directives` does not flag it.
    const reportUseAssertSafe = (node: TSESTree.Node, expressionText: string) =>
      context.report({
        node,
        messageId: 'useAssertSafe',
        data: { key: expressionText },
        fix(fixer) {
          // A suppressed report is dropped together with its fix. Producing no
          // fix — and leaving the import unclaimed — passes the carrier slot to
          // the first violation that survives.
          if (isReportSuppressed(node)) {
            return null;
          }

          // A jest registrar's factory is hoisted above every import in the
          // file, so the injected `import { assertSafe }` binds too late for
          // the emitted call: the hoist allows a factory to read only globals
          // and `mock`-prefixed bindings, and rejects the module at transform
          // time otherwise, taking the whole suite down with it. Declining —
          // and leaving the import unclaimed for a violation that does fix —
          // keeps the report standing so the author reaches for a remedy the
          // factory can hold, such as `jest.requireActual` inside it or a
          // `mock`-prefixed import alias.
          if (isInsideMockFactory(node)) {
            return null;
          }

          // Resolve `assertSafe` through the scope chain at the fixed node. A
          // binding that is not the helper import breaks the edit two ways: the
          // injected import collides with a module-scope declaration (TS2440,
          // or TS2300 when the binding is itself an import), and a shadowing
          // parameter or block-scoped binding captures the emitted call with no
          // compile error at all. Declining leaves the report standing so the
          // author resolves the clash deliberately.
          const existing = ASTHelpers.findVariableInScope(
            ASTHelpers.getScope(context, node),
            ASSERT_SAFE_NAME,
          );
          if (existing && !bindsAssertSafe(existing)) {
            return null;
          }

          return createFixes(fixer, node, expressionText);
        },
      });

    /**
     * Reports a key whose written form may carry assertion or await wrappers or
     * an optional chain.
     *
     * The report and the fix sit on the outermost written node, so the wrapper
     * the author put there survives the rewrite: `m[assertSafe(k as string)]`
     * rather than `m[assertSafe(k)]`, which would delete text the fixer does not
     * own. `assertSafe` is identity-typed (`<T extends PropertyKey>(key: T): T`),
     * so wrapping the asserted expression preserves the key's type, and wrapping
     * an `await` keeps the validation on the resolved key rather than moving it
     * onto the promise. Wrapping the whole chain is what keeps the short-circuit
     * intact: `m[assertSafe(source?.key)]` evaluates `source?.key` once, in the
     * position the author wrote it, and hands assertSafe what it produces — the
     * rewrite adds a validation, it does not move a dereference.
     *
     * A key written without a wrapper keeps the narrower argument the fix has
     * always emitted: `String(id)` and `` `${id}` `` collapse to `id`, whose
     * conversion assertSafe subsumes.
     */
    const reportWrittenKey = (
      written: TSESTree.Node,
      unwrapped: TSESTree.Node,
      innerText: string,
    ) =>
      reportUseAssertSafe(
        written,
        written === unwrapped ? innerText : context.sourceCode.getText(written),
      );

    /**
     * Returns true when the identifier was initialized directly from an
     * assertSafe(...) call, e.g. `const safeKey = assertSafe(rawKey)`.
     * Only direct, single-step initializers count — transitive aliases
     * (const b = a) are not followed so they continue to be flagged.
     * findVariableInScope returns the nearest binding, so an inner variable
     * that shadows an outer assertSafe-initialized one is correctly not exempt.
     */
    const isAssertSafeValidatedIdentifier = (
      node: TSESTree.Identifier,
    ): boolean => {
      const scope = ASTHelpers.getScope(context, node);
      const variable = ASTHelpers.findVariableInScope(scope, node.name);
      if (!variable) return false;
      return variable.defs.some((def) => {
        // `assertSafe?.(rawKey)` produces the very same validated key as
        // `assertSafe(rawKey)` — the chain guards only a nullish callee — so
        // the exemption reads through it rather than re-reporting the binding.
        const init =
          def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init
            ? unwrapOptionalChain(def.node.init)
            : null;
        return (
          !!init &&
          init.type === AST_NODE_TYPES.CallExpression &&
          init.callee.type === AST_NODE_TYPES.Identifier &&
          init.callee.name === 'assertSafe'
        );
      });
    };

    /**
     * Whether the syntax alone proves the key is a number. `__proto__`,
     * `constructor` and `prototype` are never the string form of a number, so a
     * numeric key cannot reach the prototype surface assertSafe exists to
     * guard: the call would be dead weight, and in an index-heavy loop a
     * per-iteration coercion. The judgement stays syntactic — a key the syntax
     * does not prove numeric keeps being reported.
     */
    const isStaticallyNumeric = (
      node: TSESTree.Node,
      seen: Set<TSESLint.Scope.Variable> = new Set(),
    ): boolean => {
      // An assertion or an await around an operand leaves its run-time value
      // alone, so the proof reads through to what the wrapper holds. The
      // annotation on the binding underneath is what proves the key numeric —
      // an assertion asserts and proves nothing on its own. An optional chain
      // is read through as well: `xs?.length` is the same `.length` proof, and
      // its short-circuit yields `undefined`, which stringifies to "undefined"
      // and so still names no field of the prototype surface.
      const target = unwrapWrittenKey(node);
      switch (target.type) {
        case AST_NODE_TYPES.Literal:
          return typeof target.value === 'number';
        case AST_NODE_TYPES.UpdateExpression:
          return true;
        case AST_NODE_TYPES.UnaryExpression:
          return (
            target.operator === '-' ||
            target.operator === '+' ||
            target.operator === '~'
          );
        case AST_NODE_TYPES.BinaryExpression:
          if (NUMERIC_BINARY_OPERATORS.has(target.operator)) {
            return true;
          }
          return (
            target.operator === '+' &&
            isStaticallyNumeric(target.left, seen) &&
            isStaticallyNumeric(target.right, seen)
          );
        case AST_NODE_TYPES.CallExpression:
          return isNumericCall(target);
        case AST_NODE_TYPES.MemberExpression:
          // `.length` is a number on arrays, typed arrays and strings alike.
          return (
            !target.computed &&
            target.property.type === AST_NODE_TYPES.Identifier &&
            target.property.name === 'length'
          );
        case AST_NODE_TYPES.Identifier:
          return isNumericIdentifier(target, seen);
        default:
          return false;
      }
    };

    /**
     * Whether every declaration and every write of the resolved binding keeps it
     * numeric. `seen` is copied per resolution step so a cycle
     * (`let a = b; let b = a;`) terminates without a sibling occurrence of one
     * variable (`arr[i + i]`) being mistaken for that cycle.
     */
    const isNumericIdentifier = (
      node: TSESTree.Identifier,
      seen: Set<TSESLint.Scope.Variable>,
    ): boolean => {
      const variable = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, node),
        node.name,
      );
      if (!variable || seen.has(variable)) {
        return false;
      }
      const nextSeen = new Set(seen).add(variable);

      if (
        variable.defs.length === 0 ||
        !variable.defs.every(definesNumericBinding)
      ) {
        return false;
      }

      const writes = variable.references.filter((reference) =>
        reference.isWrite(),
      );
      const staysNumeric = writes.every((reference) => {
        const { writeExpr } = reference;
        // `i++`/`--i` write a number back with no expression to inspect.
        if (!writeExpr) {
          return true;
        }
        const assignment = writeExpr.parent;
        if (
          assignment?.type === AST_NODE_TYPES.AssignmentExpression &&
          NUMERIC_ASSIGNMENT_OPERATORS.has(assignment.operator)
        ) {
          return true;
        }
        if (initializesNumericDeclaration(writeExpr)) {
          return true;
        }
        return isStaticallyNumeric(writeExpr, nextSeen);
      });
      if (!staysNumeric) {
        return false;
      }

      // A `: number` parameter is numeric from its declaration; a declarator is
      // only proven by a write, and its initializer is one — so `let k;` with no
      // write anywhere holds undefined and stays unproven.
      return (
        writes.length > 0 ||
        variable.defs.every((def) => isNumberAnnotated(def.name))
      );
    };

    return {
      // Handle computed property in object destructuring
      Property(node: TSESTree.Property) {
        if (node.computed && node.key) {
          const written = node.key;
          const key = unwrapWrittenKey(written);

          // Check for String(id) pattern
          if (
            key.type === AST_NODE_TYPES.CallExpression &&
            key.callee.type === AST_NODE_TYPES.Identifier &&
            key.callee.name === 'String'
          ) {
            const arg = key.arguments[0];
            const argText = context.sourceCode.getText(arg);
            reportWrittenKey(written, key, argText);
          }

          // Check for template literals like `${id}`
          if (
            key.type === AST_NODE_TYPES.TemplateLiteral &&
            key.expressions.length === 1 &&
            key.quasis.length === 2 &&
            key.quasis[0].value.raw === '' &&
            key.quasis[1].value.raw === ''
          ) {
            const expr = key.expressions[0];
            const exprText = context.sourceCode.getText(expr);
            reportWrittenKey(written, key, exprText);
          }
        }
      },
      // Handle binary expressions like 'key' in obj
      BinaryExpression(node: TSESTree.BinaryExpression) {
        if (node.operator === 'in') {
          const written = node.left;
          const left = unwrapWrittenKey(written);

          // Check for String(id) pattern
          if (
            left.type === AST_NODE_TYPES.CallExpression &&
            left.callee.type === AST_NODE_TYPES.Identifier &&
            left.callee.name === 'String'
          ) {
            const arg = left.arguments[0];
            const argText = context.sourceCode.getText(arg);
            reportWrittenKey(written, left, argText);
          }

          // Check for template literals like `${id}`
          if (
            left.type === AST_NODE_TYPES.TemplateLiteral &&
            left.expressions.length === 1 &&
            left.quasis.length === 2 &&
            left.quasis[0].value.raw === '' &&
            left.quasis[1].value.raw === ''
          ) {
            const expr = left.expressions[0];
            const exprText = context.sourceCode.getText(expr);
            reportWrittenKey(written, left, exprText);
          }
        }
      },
      MemberExpression(node: TSESTree.MemberExpression) {
        if (node.computed) {
          const written = node.property;
          // The written key may sit under assertion or await wrappers that erase
          // at run time, or under an optional chain; what they hold is what
          // names the property, so that is what the branches below classify.
          const property = unwrapWrittenKey(written);

          // Skip if already using assertSafe
          if (
            property.type === AST_NODE_TYPES.CallExpression &&
            property.callee.type === AST_NODE_TYPES.Identifier &&
            property.callee.name === 'assertSafe'
          ) {
            // Already using assertSafe, this is valid
            return;
          }

          // Try to determine if this is likely an array or dictionary
          const isLikelyArray = ARRAY_LIKE_NAME.test(
            indexedObjectName(node.object),
          );

          // Check for string literals - allow them for dictionaries but not for regular objects
          if (
            property.type === AST_NODE_TYPES.Literal &&
            typeof property.value === 'string'
          ) {
            // String literals are fine, no need for assertSafe
            return;
          }

          // Check for numeric literals - always allow for arrays
          if (
            property.type === AST_NODE_TYPES.Literal &&
            typeof property.value === 'number'
          ) {
            // Numeric literals are fine, no need for assertSafe
            return;
          }

          // A key the syntax proves numeric — a loop counter, an offset
          // computation, Math.floor(...) — cannot name a prototype field, so
          // validating it guards nothing.
          if (isStaticallyNumeric(property)) {
            return;
          }

          // Check if we're using String(id) pattern
          if (
            property.type === AST_NODE_TYPES.CallExpression &&
            property.callee.type === AST_NODE_TYPES.Identifier &&
            property.callee.name === 'String'
          ) {
            const arg = property.arguments[0];
            const argText = context.sourceCode.getText(arg);
            reportWrittenKey(written, property, argText);
            return;
          }

          // Check for template literals
          if (property.type === AST_NODE_TYPES.TemplateLiteral) {
            // If it's a template literal in an array, allow it
            if (isLikelyArray) {
              return;
            }

            // Only flag simple template literals that are just `${id}`
            // Complex templates with additional text like `prefix_${id}_suffix` are allowed
            const isSimpleVarInterpolation =
              property.expressions.length === 1 &&
              property.quasis.length === 2 &&
              property.quasis[0].value.raw === '' &&
              property.quasis[1].value.raw === '';

            if (!isSimpleVarInterpolation) {
              // Complex template literals with additional text are fine
              return;
            }

            const expr = property.expressions[0];
            const exprText = context.sourceCode.getText(expr);
            reportWrittenKey(written, property, exprText);
            return;
          }

          // Check for direct variable usage (identifiers)
          if (property.type === AST_NODE_TYPES.Identifier) {
            // Skip numeric literals, they're safe
            if (/^\d+$/.test(property.name)) {
              return;
            }

            // If it looks like an array access, allow it
            if (isLikelyArray) {
              return;
            }

            // Variables initialized directly from assertSafe(...) are already
            // validated — no need to double-wrap them.
            if (isAssertSafeValidatedIdentifier(property)) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportWrittenKey(written, property, propText);
            return;
          }

          // Check for binary expressions (like index + 1)
          if (property.type === AST_NODE_TYPES.BinaryExpression) {
            // Allow binary expressions in array access
            if (isLikelyArray) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportWrittenKey(written, property, propText);
            return;
          }

          // Check for boolean expressions and other literals
          if (
            property.type === AST_NODE_TYPES.Literal ||
            property.type === AST_NODE_TYPES.LogicalExpression ||
            property.type === AST_NODE_TYPES.ConditionalExpression
          ) {
            // Allow these expressions in array access
            if (isLikelyArray) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportWrittenKey(written, property, propText);
            return;
          }

          // Check for function calls (anything that isn't handled above)
          if (
            property.type === AST_NODE_TYPES.MemberExpression ||
            (property.type === AST_NODE_TYPES.CallExpression &&
              !(
                property.callee.type === AST_NODE_TYPES.Identifier &&
                property.callee.name === 'String'
              ))
          ) {
            // Allow member expressions and function calls in array access
            if (isLikelyArray) {
              return;
            }

            const propText = context.sourceCode.getText(property);
            reportWrittenKey(written, property, propText);
            return;
          }
        }
      },
    };
  },
});
