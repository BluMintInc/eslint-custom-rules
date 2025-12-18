import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type OptionShape = {
  stripPrefixes?: string[];
  ignoredMethods?: string[];
  ignoreAsync?: boolean;
  ignoreVoidReturn?: boolean;
  ignoreAbstract?: boolean;
  respectJsDocSideEffects?: boolean;
  minBodyLines?: number;
};

type Options = [OptionShape];

type MessageIds = 'preferGetter' | 'preferGetterSideEffect';
type MethodLikeDefinition =
  | TSESTree.MethodDefinition
  | TSESTree.TSAbstractMethodDefinition;

const DEFAULT_PREFIXES = [
  'build',
  'get',
  'compute',
  'calculate',
  'retrieve',
  'extract',
  'create',
  'generate',
  'make',
  'fetch',
  'load',
  'derive',
  'resolve',
  'determine',
  'find',
  'obtain',
  'produce',
  'acquire',
];

const DEFAULT_IGNORED_METHODS = [
  'toString',
  'toJSON',
  'valueOf',
  'clone',
  'copy',
  'serialize',
  'deserialize',
  'parse',
  'stringify',
];

const SIDE_EFFECT_TAGS = ['sideEffect', 'sideEffects', 'mutates'];

const DEFAULT_OPTIONS: Required<OptionShape> = {
  stripPrefixes: DEFAULT_PREFIXES,
  ignoredMethods: DEFAULT_IGNORED_METHODS,
  ignoreAsync: true,
  ignoreVoidReturn: true,
  ignoreAbstract: true,
  respectJsDocSideEffects: true,
  minBodyLines: 0,
};

const MUTATING_ARRAY_METHODS = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
];

const MUTATING_COLLECTION_METHODS = ['set', 'add', 'delete', 'clear'];

function isVoidishType(node: TSESTree.TypeNode | TSESTree.Node): boolean {
  switch (node.type) {
    case AST_NODE_TYPES.TSVoidKeyword:
    case AST_NODE_TYPES.TSUndefinedKeyword:
      return true;
    case AST_NODE_TYPES.TSUnionType:
      return node.types.every(isVoidishType);
    default:
      return false;
  }
}

function isFunctionLikeNode(value: TSESTree.Node): boolean {
  return (
    value.type === AST_NODE_TYPES.FunctionExpression ||
    value.type === AST_NODE_TYPES.FunctionDeclaration ||
    value.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function lowerFirst(text: string): string {
  if (!text) return text;
  return text[0].toLowerCase() + text.slice(1);
}

function computeBodyLineCount(body: TSESTree.BlockStatement): number {
  return Math.max(0, body.loc.end.line - body.loc.start.line - 1);
}

function hasNameCollision(
  node: MethodLikeDefinition,
  newName: string,
): boolean {
  const classBody = node.parent;
  if (!classBody || classBody.type !== AST_NODE_TYPES.ClassBody) {
    return false;
  }

  const targetIsStatic = (node as { static?: boolean }).static ?? false;

  return classBody.body.some((member) => {
    if ((member as unknown as MethodLikeDefinition) === node) {
      return false;
    }

    const key = (member as { key?: TSESTree.PropertyName }).key;
    if (!key || member.type === AST_NODE_TYPES.StaticBlock) {
      return false;
    }

    if ((member as { computed?: boolean }).computed) {
      return false;
    }

    const memberIsStatic = (member as { static?: boolean }).static ?? false;
    if (memberIsStatic !== targetIsStatic) {
      return false;
    }

    if (
      member.type === AST_NODE_TYPES.MethodDefinition &&
      member.kind === 'set'
    ) {
      return false;
    }

    if (key.type === AST_NODE_TYPES.Identifier && key.name === newName) {
      return true;
    }

    return false;
  });
}

function hasOverloadSignatures(node: MethodLikeDefinition): boolean {
  const classBody = node.parent;
  if (!classBody || classBody.type !== AST_NODE_TYPES.ClassBody) {
    return false;
  }

  if (node.key.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }

  const targetName = node.key.name;
  const targetIsStatic = (node as { static?: boolean }).static ?? false;

  return classBody.body.some((member) => {
    if (
      member.type !== AST_NODE_TYPES.MethodDefinition &&
      member.type !== AST_NODE_TYPES.TSAbstractMethodDefinition
    ) {
      return false;
    }

    if ((member as { computed?: boolean }).computed) {
      return false;
    }

    const key = (member as { key?: TSESTree.PropertyName }).key;
    if (!key || key.type !== AST_NODE_TYPES.Identifier) {
      return false;
    }

    const memberIsStatic = (member as { static?: boolean }).static ?? false;
    if (memberIsStatic !== targetIsStatic) {
      return false;
    }

    if (
      member.type === AST_NODE_TYPES.MethodDefinition &&
      member.kind !== 'method'
    ) {
      return false;
    }

    const hasBody = (
      member as
        | TSESTree.MethodDefinition
        | TSESTree.TSAbstractMethodDefinition
    ).value?.body;

    return !hasBody && key.name === targetName;
  });
}

export const preferGetterOverParameterlessMethod = createRule<
  Options,
  MessageIds
>({
  name: 'prefer-getter-over-parameterless-method',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce getter syntax for synchronous parameterless methods that return values, improving semantic clarity and avoiding accidental method invocation without parentheses.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          stripPrefixes: {
            type: 'array',
            items: { type: 'string' },
          },
          ignoredMethods: {
            type: 'array',
            items: { type: 'string' },
          },
          ignoreAsync: {
            type: 'boolean',
          },
          ignoreVoidReturn: {
            type: 'boolean',
          },
          ignoreAbstract: {
            type: 'boolean',
          },
          respectJsDocSideEffects: {
            type: 'boolean',
          },
          minBodyLines: {
            type: 'number',
            minimum: 0,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferGetter:
        'Problem: Method "{{name}}" is a parameterless synchronous method that returns a value. → Impact: Calling it with parentheses disguises that it behaves like a computed property, increasing the chance callers omit parentheses or treat it like an action. → Solution: Convert it to a getter: "get {{suggestedName}}()" to signal property semantics and remove call-site parentheses.',
      preferGetterSideEffect:
        'Problem: Method "{{name}}" looks like a computed value. → Impact: However, {{reason}}, so converting it to a getter would execute side effects on every property access and violate the principle of least surprise. → Solution: Keep it as a method to indicate it performs work, or remove the side effects before converting to "get {{suggestedName}}()".',
    },
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(context, [options]) {
    const userOptions = options ?? {};
    const config = {
      ...DEFAULT_OPTIONS,
      ...userOptions,
      stripPrefixes: userOptions.stripPrefixes ?? DEFAULT_OPTIONS.stripPrefixes,
      ignoredMethods: userOptions.ignoredMethods ?? DEFAULT_OPTIONS.ignoredMethods,
    };

    const ignoredMethods = new Set(config.ignoredMethods);
    const prefixList = config.stripPrefixes;
    const sourceCode = context.getSourceCode();
    const ignoredTraversalKeys = new Set(['parent', 'loc', 'range']);

    function ensureGlobalPattern(pattern: RegExp) {
      const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
      return new RegExp(pattern.source, flags);
    }

    function pushChildNodes(current: TSESTree.Node, stack: TSESTree.Node[]) {
      for (const [key, value] of Object.entries(current)) {
        if (ignoredTraversalKeys.has(key)) continue;
        if (!value) continue;
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof (item as any).type === 'string') {
              stack.push(item as TSESTree.Node);
            }
          }
        } else if (typeof (value as any).type === 'string') {
          stack.push(value as TSESTree.Node);
        }
      }
    }

    function getEnclosingClassBody(
      node: TSESTree.Node | null,
    ): TSESTree.ClassBody | null {
      let current: TSESTree.Node | null = node;
      while (current) {
        if (current.type === AST_NODE_TYPES.ClassBody) {
          return current;
        }
        current = (current.parent as TSESTree.Node | null) ?? null;
      }
      return null;
    }

    function addCallUse(
      node: TSESTree.Node,
      propName: string,
      callUsedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      callUsedNamesInFile: Set<string>,
    ) {
      callUsedNamesInFile.add(propName);

      const classBody = getEnclosingClassBody(node);
      if (!classBody) {
        return;
      }

      let names = callUsedNamesByClass.get(classBody);
      if (!names) {
        names = new Set<string>();
        callUsedNamesByClass.set(classBody, names);
      }

      names.add(propName);
    }

    function addCallUseForMember(
      member: TSESTree.MemberExpression,
      propName: string,
      callUsedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      callUsedNamesInFile: Set<string>,
    ) {
      addCallUse(member, propName, callUsedNamesByClass, callUsedNamesInFile);
    }

    function getJsDoc(node: MethodLikeDefinition) {
      const comments = sourceCode.getCommentsBefore(node);
      const candidate = comments[comments.length - 1];
      if (
        candidate &&
        candidate.type === 'Block' &&
        candidate.value.startsWith('*') &&
        candidate.loc &&
        node.loc &&
        candidate.loc.end.line === node.loc.start.line - 1
      ) {
        return candidate;
      }
      return null;
    }

    function hasSideEffectTag(node: MethodLikeDefinition): boolean {
      const jsDoc = getJsDoc(node);
      if (!jsDoc) {
        return false;
      }

      const value = jsDoc.value;
      if (SIDE_EFFECT_TAGS.some((tag) => value.includes(`@${tag}`))) {
        return true;
      }

      const normalized = value.toLowerCase().replace(/[-\s]+/g, ' ');
      const negationPattern =
        /\b(?:no|without|not|non|none|never|free of|lack|lacks|lacking|avoid|avoids|avoiding)\b/;

      /**
       * Detects matches that are not negated within a short preceding context.
       * Uses a 24-character lookback to catch nearby negations like "no", "not",
       * or "without" that typically appear immediately before side-effect wording,
       * balancing coverage with keeping false positives low.
       */
      const matchesAffirmative = (pattern: RegExp) => {
        const globalPattern = ensureGlobalPattern(pattern);
        const matches = normalized.matchAll(globalPattern);
        for (const match of matches) {
          const start = match.index ?? 0;
          const windowStart = Math.max(0, start - 24);
          const window = normalized.slice(windowStart, start);
          if (!negationPattern.test(window)) {
            return true;
          }
        }
        return false;
      };

      return (
        matchesAffirmative(/\bside effects?\b/) ||
        matchesAffirmative(/\bmutat(?:e|es|ing|ion|ions|ed|ive|ively)?\b/)
      );
    }

    function analyzeMutations(body: TSESTree.BlockStatement): string | null {
      const stack: TSESTree.Node[] = [...body.body];

      while (stack.length) {
        const current = stack.pop() as TSESTree.Node;

        if (isFunctionLikeNode(current)) {
          continue;
        }

        if (
          current.type === AST_NODE_TYPES.UnaryExpression &&
          current.operator === 'delete'
        ) {
          return `it deletes ${sourceCode.getText(current.argument)}`;
        }

        if (current.type === AST_NODE_TYPES.UpdateExpression) {
          return 'it mutates state with ++/--';
        }

        if (current.type === AST_NODE_TYPES.AssignmentExpression) {
          if (current.left.type === AST_NODE_TYPES.MemberExpression) {
            return `it assigns to ${sourceCode.getText(current.left)}`;
          }
        }

        if (current.type === AST_NODE_TYPES.CallExpression) {
          const callee = current.callee;
          if (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            callee.property.type === AST_NODE_TYPES.Identifier &&
            (MUTATING_ARRAY_METHODS.includes(callee.property.name) ||
              MUTATING_COLLECTION_METHODS.includes(callee.property.name))
          ) {
            return `it calls mutating method ${callee.property.name}()`;
          }
        }

        pushChildNodes(current, stack);
      }

      return null;
    }

    function returnsValue(node: MethodLikeDefinition): boolean {
      const returnType = node.value.returnType?.typeAnnotation;
      if (returnType) {
        if (isVoidishType(returnType)) {
          return false;
        }
        return true;
      }

      const body = node.value.body;
      if (!body) return false;

      const stack: TSESTree.Node[] = [...body.body];
      while (stack.length) {
        const current = stack.pop() as TSESTree.Node;
        if (isFunctionLikeNode(current)) {
          continue;
        }
        if (
          current.type === AST_NODE_TYPES.ReturnStatement &&
          current.argument
        ) {
          return true;
        }
        pushChildNodes(current, stack);
      }

      return false;
    }

    function suggestName(name: string): string {
      for (const prefix of prefixList) {
        if (
          name.startsWith(prefix) &&
          name.length > prefix.length &&
          /[A-Z_]/.test(name[prefix.length])
        ) {
          const remainder = name.slice(prefix.length);
          return lowerFirst(remainder);
        }
      }
      return name;
    }

    function isThisProperty(
      member: TSESTree.MemberExpression,
      propName: string,
    ): boolean {
      if (
        member.object.type !== AST_NODE_TYPES.ThisExpression &&
        member.object.type !== AST_NODE_TYPES.Super
      ) {
        return false;
      }

      if (!member.computed && member.property.type === AST_NODE_TYPES.Identifier) {
        return member.property.name === propName;
      }

      if (
        member.computed &&
        member.property.type === AST_NODE_TYPES.Literal &&
        typeof member.property.value === 'string'
      ) {
        return member.property.value === propName;
      }

      return false;
    }

    function bodyReferencesThisProperty(
      body: TSESTree.BlockStatement,
      propName: string,
    ): boolean {
      const stack: TSESTree.Node[] = [...body.body];

      while (stack.length) {
        const current = stack.pop() as TSESTree.Node;

        if (isFunctionLikeNode(current)) {
          continue;
        }

        if (current.type === AST_NODE_TYPES.MemberExpression) {
          if (isThisProperty(current, propName)) {
            return true;
          }
        } else if (current.type === AST_NODE_TYPES.ChainExpression) {
          const expression = current.expression;
          if (
            expression.type === AST_NODE_TYPES.MemberExpression &&
            isThisProperty(expression, propName)
          ) {
            return true;
          }
        }

        pushChildNodes(current, stack);
      }

      return false;
    }

    function isMemberExpressionNode(
      value: TSESTree.Node,
    ): value is TSESTree.MemberExpression {
      return value.type === AST_NODE_TYPES.MemberExpression;
    }

    function trackMemberCall(
      member: TSESTree.MemberExpression,
      callUsedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      callUsedNamesInFile: Set<string>,
    ) {
      if (member.computed || member.property.type !== AST_NODE_TYPES.Identifier) {
        return;
      }

      const propName = member.property.name;

      if (propName === 'call' || propName === 'apply' || propName === 'bind') {
        const target = member.object;
        if (
          isMemberExpressionNode(target) &&
          !target.computed &&
          target.property.type === AST_NODE_TYPES.Identifier &&
          target.object.type === AST_NODE_TYPES.ThisExpression
        ) {
          addCallUseForMember(
            member,
            target.property.name,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        } else if (target.type === AST_NODE_TYPES.ThisExpression) {
          addCallUseForMember(
            member,
            propName,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        } else if (
          isMemberExpressionNode(target) &&
          !target.computed &&
          target.property.type === AST_NODE_TYPES.Identifier
        ) {
          addCallUseForMember(
            target,
            target.property.name,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        } else if (target.type === AST_NODE_TYPES.Identifier) {
          addCallUseForMember(
            member,
            target.name,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        } else {
          addCallUseForMember(
            member,
            propName,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        }
        return;
      }

      addCallUseForMember(
        member,
        propName,
        callUsedNamesByClass,
        callUsedNamesInFile,
      );
    }

    function isFunctionReference(member: TSESTree.MemberExpression): boolean {
      const parent = member.parent;
      if (!parent) return false;

      if (parent.type === AST_NODE_TYPES.CallExpression) {
        if (parent.callee === member) {
          return false;
        }
        return true;
      }

      if (parent.type === AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      if (parent.type === AST_NODE_TYPES.ChainExpression) {
        const chainParent = parent.parent;
        if (
          chainParent &&
          chainParent.type === AST_NODE_TYPES.CallExpression &&
          chainParent.callee ===
            (parent as unknown as TSESTree.LeftHandSideExpression)
        ) {
          return false;
        }
        return true;
      }

      return true;
    }

    function trackMemberReference(
      member: TSESTree.MemberExpression,
      callUsedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      callUsedNamesInFile: Set<string>,
    ) {
      if (member.computed || member.property.type !== AST_NODE_TYPES.Identifier) {
        return;
      }

      if (!isFunctionReference(member)) {
        return;
      }

      if (member.object.type === AST_NODE_TYPES.ThisExpression) {
        addCallUseForMember(
          member,
          member.property.name,
          callUsedNamesByClass,
          callUsedNamesInFile,
        );
        return;
      }

      addCallUseForMember(
        member,
        member.property.name,
        callUsedNamesByClass,
        callUsedNamesInFile,
      );
    }

    function trackThisDestructuring(
      pattern: TSESTree.ObjectPattern,
      init: TSESTree.Node | null | undefined,
      callUsedNamesByClass: WeakMap<TSESTree.ClassBody, Set<string>>,
      callUsedNamesInFile: Set<string>,
    ) {
      if (!init || init.type !== AST_NODE_TYPES.ThisExpression) {
        return;
      }

      for (const prop of pattern.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          if (prop.computed) continue;

          const key = prop.key;
          if (key.type === AST_NODE_TYPES.Identifier) {
            addCallUse(
              pattern,
              key.name,
              callUsedNamesByClass,
              callUsedNamesInFile,
            );
          } else if (
            key.type === AST_NODE_TYPES.Literal &&
            typeof key.value === 'string'
          ) {
            addCallUse(
              pattern,
              key.value,
              callUsedNamesByClass,
              callUsedNamesInFile,
            );
          }
        }
      }
    }

    const callUsedNamesByClass = new WeakMap<TSESTree.ClassBody, Set<string>>();
    const callUsedNamesInFile = new Set<string>();
    const candidates: Array<{
      node: MethodLikeDefinition;
      sideEffectReason: string | null;
      suggestedName: string;
    }> = [];

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee as TSESTree.Node;

        if (callee.type === AST_NODE_TYPES.MemberExpression) {
          trackMemberCall(callee, callUsedNamesByClass, callUsedNamesInFile);
        } else if (callee.type === AST_NODE_TYPES.ChainExpression) {
          const expression = (callee as TSESTree.ChainExpression).expression;
          if (expression.type === AST_NODE_TYPES.MemberExpression) {
            trackMemberCall(
              expression,
              callUsedNamesByClass,
              callUsedNamesInFile,
            );
          }
        }
      },
      MemberExpression(node: TSESTree.MemberExpression) {
        trackMemberReference(node, callUsedNamesByClass, callUsedNamesInFile);
      },
      ChainExpression(node: TSESTree.ChainExpression) {
        if (node.expression.type === AST_NODE_TYPES.MemberExpression) {
          trackMemberReference(
            node.expression,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        }
      },
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
          trackThisDestructuring(
            node.id,
            node.init ?? null,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        }
      },
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        if (node.left.type === AST_NODE_TYPES.ObjectPattern) {
          trackThisDestructuring(
            node.left,
            node.right,
            callUsedNamesByClass,
            callUsedNamesInFile,
          );
        }
      },
      'MethodDefinition, TSAbstractMethodDefinition'(
        node: MethodLikeDefinition,
      ) {
        if (node.kind !== 'method') return;
        if (node.value.params.length > 0) return;
        if (node.value.generator) return;
        if (node.optional) return;
        if (node.computed) return;
        if (node.value.typeParameters) return;
        if (node.key.type !== AST_NODE_TYPES.Identifier) return;
        if (config.ignoreAsync && node.value.async) return;
        if (
          config.ignoreAbstract &&
          node.type === AST_NODE_TYPES.TSAbstractMethodDefinition
        ) {
          return;
        }
        if ((node as unknown as { override?: boolean }).override) return;
        if (!node.value.body) return;

        const name = node.key.name;
        if (ignoredMethods.has(name)) return;
        if (hasOverloadSignatures(node)) return;

        const body = node.value.body;
        if (computeBodyLineCount(body) < config.minBodyLines) {
          return;
        }

        if (!returnsValue(node)) return;
        if (config.respectJsDocSideEffects && hasSideEffectTag(node)) return;

        const sideEffectReason = analyzeMutations(body);
        const suggestedName = suggestName(name);

        candidates.push({ node, sideEffectReason, suggestedName });
      },
      'Program:exit'() {
        const suggestedNameCounts = new WeakMap<
          TSESTree.ClassBody,
          Map<string, number>
        >();

        for (const { node, suggestedName } of candidates) {
          const classBody = node.parent;
          if (!classBody || classBody.type !== AST_NODE_TYPES.ClassBody) {
            continue;
          }

          const scopeKey = `${
            ((node as { static?: boolean }).static ?? false)
              ? 'static'
              : 'instance'
          }:${suggestedName}`;
          const existingCounts =
            suggestedNameCounts.get(classBody) ?? new Map<string, number>();
          existingCounts.set(scopeKey, (existingCounts.get(scopeKey) ?? 0) + 1);
          suggestedNameCounts.set(classBody, existingCounts);
        }

        for (const { node, sideEffectReason, suggestedName } of candidates) {
          const name = (node.key as TSESTree.Identifier).name;
          const classBody = node.parent;
          const scopeKey = `${
            ((node as { static?: boolean }).static ?? false)
              ? 'static'
              : 'instance'
          }:${suggestedName}`;

          const leftParen = sourceCode.getTokenAfter(node.key, {
            filter: (token) => token.value === '(',
          });
          const rightParen = leftParen
            ? sourceCode.getTokenAfter(leftParen, {
                filter: (token) => token.value === ')',
              })
            : null;

          const body = node.value.body;
          const referencesSuggestedName =
            body && body.type === AST_NODE_TYPES.BlockStatement
              ? bodyReferencesThisProperty(body, suggestedName)
              : false;

          const hasCollision = hasNameCollision(node, suggestedName);
          const isCallUsed =
            classBody?.type === AST_NODE_TYPES.ClassBody
              ? callUsedNamesByClass.get(classBody)?.has(name) ?? false
              : false;
          const isCallUsedSomewhereInFile = callUsedNamesInFile.has(name);
          const hasDuplicateSuggestedName =
            classBody?.type === AST_NODE_TYPES.ClassBody
              ? (suggestedNameCounts.get(classBody)?.get(scopeKey) ?? 0) > 1
              : false;

          const isAsync = node.value.async;

          context.report({
            node: node.key,
            messageId: sideEffectReason
              ? 'preferGetterSideEffect'
              : 'preferGetter',
            data: {
              name,
              suggestedName,
              reason: sideEffectReason ?? 'it returns a value',
            },
            fix:
              sideEffectReason ||
              isAsync ||
              !leftParen ||
              !rightParen ||
              hasCollision ||
              isCallUsed ||
              isCallUsedSomewhereInFile ||
              referencesSuggestedName ||
              hasDuplicateSuggestedName
                ? null
                : (fixer) =>
                    fixer.replaceTextRange(
                      [node.key.range[0], rightParen.range[1]],
                      `get ${suggestedName}()`,
                    ),
          });
        }
      },
    };
  },
});

export default preferGetterOverParameterlessMethod;
