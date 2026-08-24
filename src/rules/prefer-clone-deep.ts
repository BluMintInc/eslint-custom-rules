import {
  AST_NODE_TYPES,
  ASTUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferCloneDeep';

const CLONE_DEEP_NAME = 'cloneDeep';
const CLONE_DEEP_MODULE = 'functions/src/util/cloneDeep';
const INDENT_STEP = '  ';

/**
 * Only BluMint's own `cloneDeep` accepts an overrides argument, so an existing
 * binding coming from anywhere else (notably `lodash`) must not be reused by the
 * fix. Relative/aliased paths are accepted because the helper is imported by
 * path, never as a package.
 */
function isCloneDeepModule(source: string): boolean {
  if (source === CLONE_DEEP_MODULE) {
    return true;
  }
  if (!/(^|\/)cloneDeep$/.test(source)) {
    return false;
  }
  return (
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('~') ||
    source.startsWith('@/') ||
    source.endsWith('util/cloneDeep')
  );
}

function isConstAssertion(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression &&
    node.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
    node.typeAnnotation.typeName.name === 'const'
  );
}

/**
 * A `const` assertion is legal only on a literal, so leaving one wrapped around
 * the emitted `cloneDeep(...)` call yields TS1355 and turns a compiling file
 * into a broken one (#2011).
 *
 * The whole assertion chain above `node` is walked because each of its links
 * still applies to the emitted call: `as Foo as const`, `satisfies Foo as
 * const` and `! as const` are TS1355 just the same. The walk stops at the first
 * parent that is not an assertion, which keeps `as const` on an ENCLOSING
 * literal fixable — that assertion still has a literal to apply to.
 *
 * Only a `const` assertion is disqualifying: `as Foo` and `satisfies Foo` are
 * legal on a call expression and keep their fix.
 */
function isConstAsserted(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node.parent;
  while (
    current &&
    (current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      current.type === AST_NODE_TYPES.TSNonNullExpression)
  ) {
    if (isConstAssertion(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * The node the `cloneDeep(...)` call replaces for a rewritten literal, or null
 * where the fix has to be declined.
 *
 * A `const` assertion applied DIRECTLY to the literal (`{ ... } as const`,
 * optionally followed by `as Foo`, `satisfies Foo` or `!`) is absorbed: the
 * replaced range covers the assertion, so the call takes its place with no
 * `as const` left to wrap it. The emitted call already spells `as const` on its
 * overrides literal, which is the only place a `const` assertion stays legal
 * after the rewrite, so the author's literal typing lands there. Absorbing it
 * is also what keeps the fix reachable under a composed `--fix`:
 * `global-const-style` wins the range race on a module-scope constant and
 * appends `as const` before this rule's turn, and declining on that assertion
 * would report the hazard forever without ever fixing it (#2032).
 *
 * A `const` assertion behind another link (`as Foo as const`) cannot be
 * absorbed without dropping the intervening assertion, and it would still wrap
 * the emitted call — TS1355 either way — so the fix is declined there.
 */
function rewriteSiteOf(
  target: TSESTree.ObjectExpression,
): TSESTree.Node | null {
  const parent = target.parent;
  const site = parent && isConstAssertion(parent) ? parent : target;
  return isConstAsserted(site) ? null : site;
}

/**
 * Parent constructs whose own syntax spells a parenthesis immediately before
 * one of their expression children, so a `(` found there is not a grouping pair
 * the rewrite may absorb.
 */
const PAREN_DELIMITED_PARENTS = new Set<string>([
  AST_NODE_TYPES.CatchClause,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ImportExpression,
  AST_NODE_TYPES.SwitchStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.WithStatement,
]);

/**
 * Whether an object or array literal ENCLOSING the rewrite site is written on a
 * single source line.
 *
 * The emitted call is always multi-line, and prettier keeps an author's
 * one-line literal on one line only while everything inside it fits there.
 * Splicing a hard-broken call into one therefore forces a re-layout of a
 * construct whose range this fix does not own, so the output is text prettier
 * immediately rewrites (#2094). Reprinting the enclosing literal instead would
 * put every comment inside it under this fixer's ownership; declining costs
 * nothing, because the report stands either way.
 */
function hasSingleLineEncloser(site: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = site.parent;
  while (current) {
    if (
      (current.type === AST_NODE_TYPES.ObjectExpression ||
        current.type === AST_NODE_TYPES.ArrayExpression) &&
      current.loc.start.line === current.loc.end.line
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export const preferCloneDeep = createRule<[], MessageIds>({
  name: 'prefer-clone-deep',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer using cloneDeep over nested spread copying',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferCloneDeep:
        'Nested spread copies only clone one level, so inner objects still point at the original and later mutations leak back. Use cloneDeep from functions/src/util/cloneDeep.ts and pass overrides as the second argument so the base object is deeply cloned before applying updates.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track processed nodes to avoid duplicate reports
    const processedNodes = new Set<TSESTree.Node>();

    const sourceCode = context.sourceCode;

    function normalizedTextOf(node: TSESTree.Node): string {
      return sourceCode.getText(node).replace(/\s+/g, '');
    }

    /**
     * `...(base.a ?? {})`, `...(base?.a)` and `...base.a!` are defensive
     * spellings of `...base.a`; unwrapping them lets the mirror check below
     * recognize the underlying member path.
     */
    function unwrapSpreadArgument(node: TSESTree.Node): TSESTree.Node {
      if (node.type === AST_NODE_TYPES.ChainExpression) {
        return unwrapSpreadArgument(node.expression);
      }
      if (node.type === AST_NODE_TYPES.TSNonNullExpression) {
        return unwrapSpreadArgument(node.expression);
      }
      if (
        node.type === AST_NODE_TYPES.LogicalExpression &&
        (node.operator === '??' || node.operator === '||') &&
        node.right.type === AST_NODE_TYPES.ObjectExpression &&
        node.right.properties.length === 0
      ) {
        return unwrapSpreadArgument(node.left);
      }
      return node;
    }

    /**
     * Canonical, whitespace-insensitive spelling of a member path so that a
     * nested spread can be compared against the path cloneDeep already copies.
     */
    function accessPathOf(node: TSESTree.Node): string {
      const unwrapped = unwrapSpreadArgument(node);
      if (unwrapped.type === AST_NODE_TYPES.MemberExpression) {
        const objectPath = accessPathOf(unwrapped.object);
        if (unwrapped.computed) {
          return `${objectPath}[${normalizedTextOf(unwrapped.property)}]`;
        }
        if (unwrapped.property.type === AST_NODE_TYPES.Identifier) {
          return `${objectPath}.${unwrapped.property.name}`;
        }
        return `${objectPath}.${normalizedTextOf(unwrapped.property)}`;
      }
      return normalizedTextOf(unwrapped);
    }

    const partialDeepCopyCache = new WeakMap<
      TSESTree.ObjectExpression,
      boolean
    >();

    /**
     * The hazard this rule describes is a hand-written PARTIAL deep copy: a
     * literal that spreads a base AND separately spreads one of that same
     * base's sub-paths, as in `{ ...base, a: { ...base.a, x: 1 } }`. Only the
     * sub-objects spelled out that way get their own copy; every OTHER
     * sub-object of `base` keeps aliasing the original, so a later mutation
     * leaks back.
     *
     * Merging unrelated sources copies nothing twice and is safe, which is why
     * shapes such as `{ ...a, nested: { ...b } }`, MUI `sx` style maps and
     * static config maps must not be flagged (#1371). That verdict depends on
     * ALL of a literal's sources, not on any one of them: `{ ...props, sx: {
     * ...DEFAULT_SX, ...props.sx } }` builds `sx` fresh out of two sources and
     * aliases neither, so it is a merge even though one source happens to be a
     * sub-path of the base (#1745). A spread of the exact same path
     * (`{ ...a, x: { ...a } }`) is deliberately excluded as well: it is a
     * redundant copy rather than a partial one, and this repo prefers false
     * negatives over false positives.
     */
    function isPartialDeepCopy(node: TSESTree.ObjectExpression): boolean {
      const cached = partialDeepCopyCache.get(node);
      if (cached !== undefined) {
        return cached;
      }

      let hasFunction = false;
      let hasSymbol = false;
      const basePaths = new Set<string>();
      // Spread paths kept grouped by the literal that writes them, because a
      // literal is classified by its sources as a set: flattening them loses
      // the co-spread relation the merge exemption is stated over.
      const nestedGroups: string[][] = [];

      function visit(
        current: TSESTree.Node,
        depth = 0,
        group: string[] = [],
      ): void {
        if (current.type === AST_NODE_TYPES.SpreadElement) {
          const path = accessPathOf(current.argument);
          if (depth === 0) {
            basePaths.add(path);
          } else {
            group.push(path);
          }
        } else if (
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          hasFunction = true;
        } else if (
          // Check for Symbol usage in computed properties
          (current.type === AST_NODE_TYPES.Property &&
            current.computed &&
            current.key.type === AST_NODE_TYPES.Identifier &&
            current.key.name === 'Symbol') ||
          // Check for direct Symbol constructor calls
          (current.type === AST_NODE_TYPES.Property &&
            current.computed &&
            current.key.type === AST_NODE_TYPES.CallExpression &&
            current.key.callee.type === AST_NODE_TYPES.Identifier &&
            current.key.callee.name === 'Symbol')
        ) {
          hasSymbol = true;
        }

        // Visit child nodes without traversing parent references. Depth tracks
        // object-nesting level: an object's OWN direct properties stay at the
        // object's depth, and only descending into a property's value (a
        // genuinely nested child) increments it. This keeps the literal's own
        // `...spread` at depth 0, where it names a base rather than a
        // hand-copied sub-path.
        if (current.type === AST_NODE_TYPES.ObjectExpression) {
          // Every literal owns the spreads written directly inside it. The
          // root's spreads name bases instead, so only descendants contribute
          // a group.
          const ownGroup: string[] = [];
          if (current !== node) {
            nestedGroups.push(ownGroup);
          }
          current.properties.forEach((prop) => visit(prop, depth, ownGroup));
        } else if (current.type === AST_NODE_TYPES.Property) {
          visit(current.value, depth + 1, group);
        } else if (current.type === AST_NODE_TYPES.SpreadElement) {
          visit(current.argument, depth, group);
        }
      }

      visit(node);

      // The separators guard against a sibling whose name merely starts with a
      // base's name (`abc.x` is not a sub-path of `ab`).
      const isBaseSubPath = (nested: string): boolean =>
        [...basePaths].some(
          (base) =>
            nested.startsWith(`${base}.`) || nested.startsWith(`${base}[`),
        );

      // cloneDeep cannot faithfully reproduce functions or symbol keys, so
      // their presence suppresses the report regardless of the copy shape.
      const result =
        !hasFunction &&
        !hasSymbol &&
        // A nested literal is a hand-written partial copy only when EVERY
        // source it spreads is a sub-path of a spread base. One foreign source
        // makes the literal a fresh merge of both, which aliases nothing and is
        // not expressible as cloneDeep overrides.
        nestedGroups.some(
          (group) => group.length > 0 && group.every(isBaseSubPath),
        );

      partialDeepCopyCache.set(node, result);
      return result;
    }

    /**
     * A literal that merely wraps a partial deep copy (the #365 membership
     * shape) is still the site the report belongs on, so the predicate reaches
     * through property values into descendant literals.
     */
    function containsPartialDeepCopy(node: TSESTree.ObjectExpression): boolean {
      if (isPartialDeepCopy(node)) {
        return true;
      }
      return node.properties.some(
        (prop) =>
          prop.type === AST_NODE_TYPES.Property &&
          prop.value.type === AST_NODE_TYPES.ObjectExpression &&
          containsPartialDeepCopy(prop.value),
      );
    }

    function accessorForKey(prop: TSESTree.Property): string | null {
      if (prop.computed) {
        return `[${normalizedTextOf(prop.key)}]`;
      }
      if (prop.key.type === AST_NODE_TYPES.Identifier) {
        return `.${prop.key.name}`;
      }
      if (prop.key.type === AST_NODE_TYPES.Literal) {
        return `[${normalizedTextOf(prop.key)}]`;
      }
      return null;
    }

    function keyTextOf(prop: TSESTree.Property): string {
      return prop.computed
        ? `[${sourceCode.getText(prop.key)}]`
        : sourceCode.getText(prop.key);
    }

    function indentOf(node: TSESTree.Node): string {
      const text = sourceCode.getText();
      const lineStart = text.lastIndexOf('\n', node.range[0] - 1) + 1;
      const prefix = text.slice(lineStart, node.range[0]);
      return /^[ \t]*/.exec(prefix)?.[0] ?? '';
    }

    function startsWithSpread(node: TSESTree.ObjectExpression): boolean {
      return node.properties[0]?.type === AST_NODE_TYPES.SpreadElement;
    }

    /** The `(` that opens a call's or `new`'s argument list, if it has one. */
    function argumentListOpener(
      node: TSESTree.CallExpression | TSESTree.NewExpression,
    ): TSESTree.Token | null {
      return sourceCode.getTokenAfter(node.callee, {
        filter: (token) => token.value === '(',
      });
    }

    /**
     * Whether the `(` immediately preceding the rewrite site is a redundant
     * grouping pair rather than punctuation the enclosing construct owns.
     * Deleting `f(` or `if (` would rewrite the program, so those positions are
     * named explicitly instead of inferred from adjacency.
     */
    function isGroupingParen(
      site: TSESTree.Node,
      open: TSESTree.Token,
    ): boolean {
      const parent = site.parent;
      if (!parent) {
        return false;
      }
      if (PAREN_DELIMITED_PARENTS.has(parent.type)) {
        return false;
      }
      if (
        parent.type === AST_NODE_TYPES.CallExpression ||
        parent.type === AST_NODE_TYPES.NewExpression
      ) {
        // `new (fn())()` re-associates into `new fn()()` without its
        // parentheses, so a `new` callee keeps them even though a call
        // expression needs none anywhere else.
        if (
          parent.type === AST_NODE_TYPES.NewExpression &&
          parent.callee === site
        ) {
          return false;
        }
        return open !== argumentListOpener(parent);
      }
      return true;
    }

    /**
     * The source range the emitted call replaces, widened over any parentheses
     * that merely wrap the rewrite site.
     *
     * A `cloneDeep(...)` call is a `LeftHandSideExpression`, so parentheses that
     * were doing work around `{ ... } as const` are redundant around the call
     * that takes its place — `(...)!` and `(...).prop` never need them. Leaving
     * them behind emits text prettier rewrites the moment the fix lands
     * (#2094).
     *
     * Absorbing a pair takes ownership of its margins, so a pair with a comment
     * between its parenthesis and the site is left alone: the fix still lands,
     * and the comment stays exactly where its author put it.
     */
    function absorbedRangeOf(site: TSESTree.Node): TSESTree.Range {
      let range: TSESTree.Range = [site.range[0], site.range[1]];
      let first = sourceCode.getFirstToken(site);
      let last = sourceCode.getLastToken(site);

      while (first && last) {
        const open = sourceCode.getTokenBefore(first);
        const close = sourceCode.getTokenAfter(last);
        if (!open || !close || open.value !== '(' || close.value !== ')') {
          break;
        }
        if (!isGroupingParen(site, open)) {
          break;
        }
        if (
          sourceCode.commentsExistBetween(open, first) ||
          sourceCode.commentsExistBetween(last, close)
        ) {
          break;
        }
        // `typeof({ ... } as const)` would fuse into `typeofcloneDeep(...)`
        // once the parenthesis it abuts is gone.
        const preceding = sourceCode.getTokenBefore(open);
        if (
          preceding &&
          preceding.range[1] === open.range[0] &&
          /[\w$]$/.test(preceding.value)
        ) {
          break;
        }
        range = [open.range[0], close.range[1]];
        first = open;
        last = close;
      }

      return range;
    }

    /**
     * `SourceCode#getScope` supersedes the deprecated `context.getScope`; the
     * fallback keeps the rule working on ESLint versions that predate it.
     */
    function scopeOf(node: TSESTree.Node): TSESLint.Scope.Scope {
      const scoped = sourceCode as TSESLint.SourceCode & {
        getScope?: (node: TSESTree.Node) => TSESLint.Scope.Scope;
      };
      return typeof scoped.getScope === 'function'
        ? scoped.getScope(node)
        : context.getScope();
    }

    /**
     * Rebuilds the properties of one object as cloneDeep overrides. Returns null
     * whenever a property cannot be reproduced without changing runtime
     * behavior, which makes the caller decline the fix instead of emitting code
     * that silently drops data (#1364).
     */
    function buildOverrideEntries(
      properties: TSESTree.ObjectLiteralElement[],
      basePath: string,
      indent: string,
    ): string | null {
      const entries: string[] = [];

      for (const prop of properties) {
        // Any spread other than a leading copy of the path cloneDeep already
        // clones would have to be dropped, deleting whatever it contributed.
        if (prop.type !== AST_NODE_TYPES.Property) {
          return null;
        }
        // Getters, setters and shorthand methods degrade into plain data
        // properties when reprinted as overrides.
        if (prop.kind !== 'init' || prop.method) {
          return null;
        }

        let valueText: string;
        if (prop.value.type === AST_NODE_TYPES.ObjectExpression) {
          const accessor = accessorForKey(prop);
          if (accessor === null) {
            return null;
          }
          const nested = buildOverrideObject(
            prop.value,
            `${basePath}${accessor}`,
            `${indent}${INDENT_STEP}`,
          );
          if (nested === null) {
            return null;
          }
          valueText = nested;
        } else {
          // Arrays, calls, conditionals and primitives are copied verbatim, so
          // whatever they contain survives the fix untouched.
          valueText = sourceCode.getText(prop.value);
        }

        entries.push(`${indent}${keyTextOf(prop)}: ${valueText}`);
      }

      // Every entry, including the last, carries its own terminator: an object
      // with entries is only ever emitted across multiple lines (the single-line
      // spelling `{}` has no entries at all), and prettier's `trailingComma:
      // 'all'` demands a comma after the final property of a multi-line object.
      // Joining with ',\n' instead left the last property of every emitted
      // object, at every nesting depth, unterminated, so prettier rewrote the
      // fix the moment it landed (#2088). Spreads never reach here — the loop
      // above declines any property that is not a plain `init` Property — so no
      // rest element can pick up an illegal trailing comma.
      return entries.map((entry) => `${entry},`).join('\n');
    }

    /**
     * `indent` is the indentation of the rebuilt object's entries; its closing
     * brace lines up one step to the left.
     */
    function buildOverrideObject(
      node: TSESTree.ObjectExpression,
      basePath: string,
      indent: string,
    ): string | null {
      let properties: TSESTree.ObjectLiteralElement[] = [...node.properties];
      const [first] = properties;

      if (first && first.type === AST_NODE_TYPES.SpreadElement) {
        // A leading spread of this exact path is redundant: cloneDeep already
        // copies it from the base. Any other spread carries data that the
        // overrides object cannot express.
        if (accessPathOf(first.argument) !== basePath) {
          return null;
        }
        properties = properties.slice(1);
      }

      const body = buildOverrideEntries(properties, basePath, indent);
      if (body === null) {
        return null;
      }
      if (body === '') {
        return '{}';
      }
      const closingIndent = indent.slice(0, indent.length - INDENT_STEP.length);
      return `{\n${body}\n${closingIndent}}`;
    }

    function buildCloneDeepCall(
      node: TSESTree.ObjectExpression,
    ): string | null {
      const [first, ...rest] = node.properties;
      if (!first || first.type !== AST_NODE_TYPES.SpreadElement) {
        return null;
      }

      const baseText = sourceCode.getText(first.argument);
      const basePath = accessPathOf(first.argument);
      const baseIndent = indentOf(node);
      const body = buildOverrideEntries(
        rest,
        basePath,
        `${baseIndent}${INDENT_STEP}`,
      );
      if (body === null) {
        return null;
      }

      const overrides = body === '' ? '{}' : `{\n${body}\n${baseIndent}}`;
      return `cloneDeep(${baseText}, ${overrides} as const)`;
    }

    /**
     * When the reported object has no spread of its own (the #365 membership
     * shape), the object that actually shallow-copies a base lives one or more
     * levels down; rewriting only those children leaves the rest of the literal
     * untouched.
     */
    function collectCloneTargets(
      node: TSESTree.ObjectExpression,
    ): TSESTree.ObjectExpression[] {
      const targets: TSESTree.ObjectExpression[] = [];

      const visit = (current: TSESTree.ObjectExpression): void => {
        if (
          current !== node &&
          startsWithSpread(current) &&
          isPartialDeepCopy(current)
        ) {
          targets.push(current);
          return;
        }
        for (const prop of current.properties) {
          if (
            prop.type === AST_NODE_TYPES.Property &&
            prop.value.type === AST_NODE_TYPES.ObjectExpression
          ) {
            visit(prop.value);
          }
        }
      };

      visit(node);
      return targets;
    }

    /**
     * Whether the rewritten `cloneDeep(...)` call resolves in this file, which is
     * true only where the file already imports the helper as a value.
     *
     * The specifier that reaches the helper is a property of the consuming
     * project, not of this rule: the module is absent from some consumers
     * entirely, and where it exists the two TypeScript tiers reach it by
     * different forms. Writing an import from a guessed specifier therefore
     * trades working code for a build error (#1396), so an existing import is
     * demanded as proof of a path that resolves here — the same policy
     * `enforce-querykey-ts` applies to its own import.
     *
     * A binding of the name from anywhere else is not proof and must not be
     * reused: `lodash`'s `cloneDeep` accepts no overrides argument, a local
     * declaration would shadow the helper, and a namespace or type-only import
     * supplies no callable value.
     */
    function bindsCloneDeepHelper(scope: TSESLint.Scope.Scope): boolean {
      const existing = ASTUtils.findVariable(scope, CLONE_DEEP_NAME);
      if (!existing) {
        return false;
      }
      const [definition] = existing.defs;
      if (!definition) {
        return false;
      }
      const definitionNode = definition.node;
      if (
        definitionNode.type !== AST_NODE_TYPES.ImportSpecifier &&
        definitionNode.type !== AST_NODE_TYPES.ImportDefaultSpecifier
      ) {
        return false;
      }
      if (
        definitionNode.type === AST_NODE_TYPES.ImportSpecifier &&
        definitionNode.importKind === 'type'
      ) {
        return false;
      }
      const declaration = definitionNode.parent;
      return (
        !!declaration &&
        declaration.type === AST_NODE_TYPES.ImportDeclaration &&
        declaration.importKind !== 'type' &&
        isCloneDeepModule(String(declaration.source.value))
      );
    }

    // Find the outermost object expression that needs cloneDeep
    function findOutermostPartialDeepCopy(
      node: TSESTree.ObjectExpression,
    ): TSESTree.ObjectExpression {
      let current: TSESTree.Node | undefined = node.parent;
      let result: TSESTree.ObjectExpression = node;

      // Walk up the tree to find the outermost object expression
      while (current) {
        if (
          current.type === AST_NODE_TYPES.Property &&
          current.parent &&
          current.parent.type === AST_NODE_TYPES.ObjectExpression
        ) {
          // Reporting on the enclosing literal keeps sibling copies under a
          // single error, so one fix pass rewrites them all together.
          if (containsPartialDeepCopy(current.parent)) {
            result = current.parent;
          }
        }
        current = current.parent;
      }

      return result;
    }

    return {
      ObjectExpression(node) {
        // Skip if we've already processed this node
        if (processedNodes.has(node)) {
          return;
        }

        if (containsPartialDeepCopy(node)) {
          // Find the outermost object that should use cloneDeep
          const outermostNode = findOutermostPartialDeepCopy(node);

          // Mark all nested object expressions as processed
          const markProcessed = (n: TSESTree.Node): void => {
            if (n.type === AST_NODE_TYPES.ObjectExpression) {
              processedNodes.add(n);
              n.properties.forEach((prop) => {
                if (prop.type === AST_NODE_TYPES.Property) {
                  markProcessed(prop.value);
                } else if (prop.type === AST_NODE_TYPES.SpreadElement) {
                  // Also mark spread elements to avoid processing them again
                  if (prop.argument.type === AST_NODE_TYPES.ObjectExpression) {
                    markProcessed(prop.argument);
                  }
                }
              });
            }
          };

          markProcessed(outermostNode);

          // Only report on the outermost node
          if (outermostNode === node) {
            const scope = scopeOf(node);

            context.report({
              node,
              messageId: 'preferCloneDeep',
              fix(fixer) {
                if (!bindsCloneDeepHelper(scope)) {
                  return null;
                }

                const rewrites: TSESLint.RuleFix[] = [];
                const targets = startsWithSpread(node)
                  ? [node]
                  : collectCloneTargets(node);

                if (targets.length === 0) {
                  return null;
                }

                for (const target of targets) {
                  const site = rewriteSiteOf(target);
                  if (site === null) {
                    return null;
                  }
                  if (hasSingleLineEncloser(site)) {
                    return null;
                  }
                  const call = buildCloneDeepCall(target);
                  if (call === null) {
                    return null;
                  }
                  rewrites.push(
                    fixer.replaceTextRange(absorbedRangeOf(site), call),
                  );
                }

                return rewrites;
              },
            });
          }
        }
      },
    };
  },
});
