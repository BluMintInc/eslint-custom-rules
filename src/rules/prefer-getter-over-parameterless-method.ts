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

    if (key.type === AST_NODE_TYPES.Identifier && key.name === newName) {
      return true;
    }

    return false;
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
        'Method "{{name}}" has no parameters and returns a value, which reads like a computed property. Use a getter (e.g., "get {{suggestedName}}()") to signal property access and avoid call-site parentheses.',
      preferGetterSideEffect:
        'Method "{{name}}" looks like a computed value but {{reason}}. Keep it as a method or remove the side effects before converting to "get {{suggestedName}}()".',
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
            ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'].includes(
              callee.property.name,
            )
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
        if (config.ignoreVoidReturn && isVoidishType(returnType)) {
          return false;
        }
        if (!isVoidishType(returnType)) {
          return true;
        }
      }

      const body = node.value.body;
      if (!body) return false;

      const stack: TSESTree.Node[] = [...body.body];
      while (stack.length) {
        const current = stack.pop() as TSESTree.Node;
        if (isFunctionLikeNode(current) && current !== body) {
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

    function trackMemberCall(
      member: TSESTree.MemberExpression,
      callUsedNames: Set<string>,
    ) {
      if (member.computed || member.property.type !== AST_NODE_TYPES.Identifier) {
        return;
      }

      const propName = member.property.name;

      if (propName === 'call' || propName === 'apply' || propName === 'bind') {
        const target = member.object;
        if (target.type === AST_NODE_TYPES.MemberExpression) {
          if (
            !target.computed &&
            target.property.type === AST_NODE_TYPES.Identifier &&
            target.object.type === AST_NODE_TYPES.ThisExpression
          ) {
            callUsedNames.add(target.property.name);
          }
        }
        return;
      }

      if (member.object.type === AST_NODE_TYPES.ThisExpression) {
        callUsedNames.add(propName);
      }
    }

    const callUsedNames = new Set<string>();
    const candidates: Array<{
      node: MethodLikeDefinition;
      sideEffectReason: string | null;
      suggestedName: string;
    }> = [];

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee as TSESTree.Node;

        if (callee.type === AST_NODE_TYPES.MemberExpression) {
          trackMemberCall(callee, callUsedNames);
        } else if (callee.type === AST_NODE_TYPES.ChainExpression) {
          const expression = (callee as TSESTree.ChainExpression).expression;
          if (expression.type === AST_NODE_TYPES.MemberExpression) {
            trackMemberCall(expression, callUsedNames);
          }
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
        for (const { node, sideEffectReason, suggestedName } of candidates) {
          const name = (node.key as TSESTree.Identifier).name;

          const leftParen = sourceCode.getTokenAfter(node.key, {
            filter: (token) => token.value === '(',
          });
          const rightParen = leftParen
            ? sourceCode.getTokenAfter(leftParen, {
                filter: (token) => token.value === ')',
              })
            : null;

          const hasCollision = hasNameCollision(node, suggestedName);
          const isCallUsed = callUsedNames.has(name);

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
              !leftParen ||
              !rightParen ||
              hasCollision ||
              isCallUsed
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
