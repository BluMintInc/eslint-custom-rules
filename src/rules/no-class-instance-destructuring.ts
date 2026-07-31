import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noClassInstanceDestructuring';

/**
 * A synthesized binding may not be a keyword, and may not be one of the
 * bare-word globals whose rebinding would be legal but ruinous.
 */
const UNUSABLE_NAMES = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'await',
  'arguments',
  'eval',
  'undefined',
  'NaN',
  'Infinity',
]);

/**
 * Node types whose children are statements, so a single statement may be
 * replaced by several. Anything else (a `for` initializer, an unbraced `if`
 * body, a label) can hold exactly one.
 */
const STATEMENT_CONTAINERS = new Set<string>([
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.StaticBlock,
  AST_NODE_TYPES.SwitchCase,
  AST_NODE_TYPES.TSModuleBlock,
]);

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isUsableName(name: string): boolean {
  return IDENTIFIER_PATTERN.test(name) && !UNUSABLE_NAMES.has(name);
}

/**
 * `Person` -> `person`, `URL` -> `url`, `URLParser` -> `urlParser`. The leading
 * run of capitals is treated as one word so an acronym does not become `uRL`.
 */
function lowerFirstWord(name: string): string {
  const leadingCapitals = /^[A-Z]+/.exec(name);
  if (!leadingCapitals) return name;
  const run = leadingCapitals[0];
  if (run.length === name.length) return name.toLowerCase();
  if (run.length === 1) return name[0].toLowerCase() + name.slice(1);
  return run.slice(0, -1).toLowerCase() + name.slice(run.length - 1);
}

export const noClassInstanceDestructuring = createRule<[], MessageIds>({
  name: 'no-class-instance-destructuring',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow destructuring of class instances to prevent loss of `this` context',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noClassInstanceDestructuring: [
        "What's wrong: Destructuring {{members}} from class instance {{instance}} detaches those members from the instance.",
        'Why it matters: Methods can run with the wrong `this`, and getters become one-time snapshots that go stale when the instance changes.',
        'How to fix: Access through the instance instead (for example, {{suggestion}}) and bind when you need to pass a method around.',
      ].join('\n'),
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    function describeMember(
      prop: TSESTree.ObjectPattern['properties'][number],
    ): string {
      if (prop.type === AST_NODE_TYPES.Property) {
        if (prop.computed) {
          const keyText = sourceCode.getText(prop.key);
          return `[${keyText}]`;
        }
        if (prop.key.type === AST_NODE_TYPES.Identifier) {
          return prop.key.name;
        }
        return sourceCode.getText(prop.key);
      }

      if (
        prop.type === AST_NODE_TYPES.RestElement &&
        prop.argument.type === AST_NODE_TYPES.Identifier
      ) {
        return `...${prop.argument.name}`;
      }

      return 'member';
    }

    function buildAccessPath(
      receiverText: string,
      prop: TSESTree.Property,
    ): string {
      const keyText = sourceCode.getText(prop.key);
      if (prop.key.type === AST_NODE_TYPES.Identifier && !prop.computed) {
        return `${receiverText}.${keyText}`;
      }
      return `${receiverText}[${keyText}]`;
    }

    function formatMembers(
      properties: TSESTree.ObjectPattern['properties'],
    ): string {
      const memberNames = properties.map(describeMember).filter(Boolean);
      if (memberNames.length === 0) return '`<members>`';
      return memberNames.map((name) => `\`${name}\``).join(', ');
    }

    function formatAccessExamples(
      properties: TSESTree.ObjectPattern['properties'],
      receiverText: string,
    ): string {
      const accessPaths = properties
        .filter(
          (prop): prop is TSESTree.Property =>
            prop.type === AST_NODE_TYPES.Property,
        )
        .map((prop) => buildAccessPath(receiverText, prop));

      if (accessPaths.length === 0) {
        return `\`${receiverText}.<member>\``;
      }

      return accessPaths.map((path) => `\`${path}\``).join(', ');
    }

    function isClassInstance(node: TSESTree.Expression): boolean {
      // Check for new expressions
      if (node.type === AST_NODE_TYPES.NewExpression) {
        return true;
      }

      // Check for identifiers that might be class instances
      if (node.type === AST_NODE_TYPES.Identifier) {
        const variableDef = context
          .getScope()
          .variables.find((variableDef) => variableDef.name === node.name);
        if (
          variableDef?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator
        ) {
          const init = (variableDef.defs[0].node as TSESTree.VariableDeclarator)
            .init;
          return init?.type === AST_NODE_TYPES.NewExpression;
        }
      }

      return false;
    }

    /**
     * `new Person` and `new Person()` construct alike, but only the latter can
     * carry a member access: `new Person.name` reads `name` off the class and
     * constructs that instead.
     */
    function callableInitText(init: TSESTree.Expression): string {
      const text = sourceCode.getText(init);
      if (init.type === AST_NODE_TYPES.NewExpression && init.arguments) {
        const lastToken = sourceCode.getLastToken(init);
        if (lastToken?.value !== ')') return `${text}()`;
      }
      return text;
    }

    /**
     * Every name that is visible where the temp binding would be inserted,
     * including names only referenced (globals, imports resolved elsewhere) and
     * names bound by nested closures that read through this scope. Reusing any
     * of them would either redeclare or shadow a live binding — see the
     * shadow-capture guard in `src/tests/fixer-shadow-capture.test.ts`.
     */
    function collectVisibleNames(
      scope: TSESLint.Scope.Scope | null,
    ): Set<string> {
      const names = new Set<string>();
      for (let current = scope; current; current = current.upper) {
        for (const variable of current.variables) {
          names.add(variable.name);
        }
        for (const reference of current.through) {
          names.add(reference.identifier.name);
        }
      }
      return names;
    }

    function calleeName(init: TSESTree.NewExpression): string | null {
      const { callee } = init;
      if (callee.type === AST_NODE_TYPES.Identifier) return callee.name;
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        return callee.property.name;
      }
      return null;
    }

    function baseNameFor(init: TSESTree.Expression): string {
      if (init.type !== AST_NODE_TYPES.NewExpression) return 'instance';
      const raw = calleeName(init);
      if (!raw) return 'instance';
      const lowered = lowerFirstWord(raw);
      // An already-lowercase callee would have the temp shadow the class itself.
      if (lowered !== raw && isUsableName(lowered)) return lowered;
      const suffixed = `${lowered}Instance`;
      return isUsableName(suffixed) ? suffixed : 'instance';
    }

    function uniqueName(base: string, taken: Set<string>): string {
      if (!taken.has(base)) return base;
      for (let suffix = 2; suffix <= taken.size + 2; suffix++) {
        const candidate = `${base}${suffix}`;
        if (!taken.has(candidate)) return candidate;
      }
      return base;
    }

    function indentOf(node: TSESTree.Node): string {
      const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
      const leading = /^[\t ]*/.exec(line);
      return leading ? leading[0] : '';
    }

    /**
     * The statement that may be swapped for several declarations, or `null`
     * when the declarator does not own a whole statement of its own.
     */
    function resolveStatement(node: TSESTree.VariableDeclarator) {
      const declaration = node.parent;
      if (declaration?.type !== AST_NODE_TYPES.VariableDeclaration) return null;
      // Splitting one declarator out of `const {a, b} = inst, c = 1;` would have
      // to hoist emitted lines past declarators this fix does not own.
      if (declaration.declarations.length !== 1) return null;

      const exportDeclaration =
        declaration.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration
          ? declaration.parent
          : null;
      const statement = exportDeclaration ?? declaration;
      if (!STATEMENT_CONTAINERS.has(statement.parent?.type ?? '')) return null;

      const text = sourceCode.getText(statement);
      return {
        statement,
        kind: declaration.kind,
        // Re-exporting each extracted member keeps the module's public surface,
        // while the temp binding stays private.
        exportPrefix: exportDeclaration ? 'export ' : '',
        indent: indentOf(statement),
        // Matching the source's own terminator keeps semicolon-free files intact.
        terminator: text.endsWith(';') ? ';' : '',
      };
    }

    return {
      VariableDeclarator(node) {
        if (
          node.id.type === AST_NODE_TYPES.ObjectPattern &&
          node.init &&
          isClassInstance(node.init)
        ) {
          const objectPattern = node.id;
          const init = node.init;
          const initText = sourceCode.getText(init);
          const propertyCount = objectPattern.properties.filter(
            (prop) => prop.type === AST_NODE_TYPES.Property,
          ).length;

          // Reading two members off `new Person()` twice would construct twice,
          // so the instance is bound once and read from. A plain identifier is
          // already such a binding, and a lone member read constructs once.
          const needsTempBinding =
            init.type !== AST_NODE_TYPES.Identifier && propertyCount > 1;
          const tempName = needsTempBinding
            ? uniqueName(
                baseNameFor(init),
                collectVisibleNames(context.getScope()),
              )
            : null;
          const receiverText = tempName ?? callableInitText(init);

          context.report({
            node,
            messageId: 'noClassInstanceDestructuring',
            data: {
              members: formatMembers(objectPattern.properties),
              instance: `\`${initText}\``,
              suggestion: tempName
                ? `\`const ${tempName} = ${initText};\` then ${formatAccessExamples(
                    objectPattern.properties,
                    tempName,
                  )}`
                : formatAccessExamples(objectPattern.properties, receiverText),
            },
            fix(fixer) {
              const properties = objectPattern.properties;

              // Skip if there's no init expression
              if (!node.init) return null;

              // An annotation on the pattern types the object as a whole, not
              // each property, so it cannot be split across the per-property
              // declarations this fixer emits. Deriving per-property types needs
              // the type checker, so report without fixing rather than rewrite
              // the code to something more weakly typed than the author wrote.
              if (objectPattern.typeAnnotation) return null;

              if (properties.length === 0) return null;

              // A rest element collects the members no other property names, a
              // set only the type checker knows, so it cannot become a member
              // read. Rewriting the siblings alone would delete the binding.
              if (
                properties.some((prop) => prop.type !== AST_NODE_TYPES.Property)
              ) {
                return null;
              }

              const props = properties as TSESTree.Property[];

              // `const {a = 1} = inst` applies the default only when the member
              // is `undefined`; a plain member read cannot express that.
              if (
                props.some(
                  (prop) =>
                    prop.value.type === AST_NODE_TYPES.AssignmentPattern,
                )
              ) {
                return null;
              }

              const targetOf = (prop: TSESTree.Property) =>
                prop.value.type === AST_NODE_TYPES.Identifier
                  ? prop.value.name
                  : sourceCode.getText(prop.value);

              // A single binding stays a single declarator, so it can be
              // rewritten in place wherever the declaration sits.
              if (props.length === 1) {
                return fixer.replaceText(
                  node,
                  `${targetOf(props[0])} = ${buildAccessPath(
                    receiverText,
                    props[0],
                  )}`,
                );
              }

              const target = resolveStatement(node);
              if (!target) return null;

              const lines = tempName ? [`const ${tempName} = ${initText}`] : [];
              for (const prop of props) {
                lines.push(
                  `${target.exportPrefix}${target.kind} ${targetOf(
                    prop,
                  )} = ${buildAccessPath(receiverText, prop)}`,
                );
              }

              // One replacement, so the whole rewrite lands or none of it does.
              return fixer.replaceText(
                target.statement,
                lines
                  .map((line) => `${line}${target.terminator}`)
                  .join(`\n${target.indent}`),
              );
            },
          });
        }
      },
    };
  },
});
