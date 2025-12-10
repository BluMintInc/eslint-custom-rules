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

const BOOLEAN_PREFIXES = new Set([
  'is',
  'has',
  'can',
  'should',
  'will',
  'did',
  'was',
]);

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
        'Method "{{name}}" has no parameters and returns a value, which reads like a computed property. Use a getter (e.g., "get {{suggestedName}}") to signal property access and avoid call-site parentheses.',
      preferGetterSideEffect:
        'Method "{{name}}" looks like a computed value but {{reason}}. Keep it as a method or remove the side effects before converting to "get {{suggestedName}}".',
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

    function hasSideEffectTag(node: TSESTree.MethodDefinition): boolean {
      const jsDoc = sourceCode.getJSDocComment(node);
      if (!jsDoc) {
        return false;
      }
      const value = jsDoc.value;
      if (SIDE_EFFECT_TAGS.some((tag) => value.includes(`@${tag}`))) {
        return true;
      }
      return /@returns?[^@]*side\s*effect/i.test(value) ||
        /@returns?[^@]*mutat/i.test(value);
    }

    function detectSideEffect(body: TSESTree.BlockStatement): string | null {
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
          continue;
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

        for (const value of Object.values(current)) {
          if (!value) continue;
          if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item && typeof (item as any).type === 'string') {
                stack.push(item as TSESTree.Node);
              }
            });
          } else if (typeof (value as any).type === 'string') {
            stack.push(value as TSESTree.Node);
          }
        }
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
        for (const value of Object.values(current)) {
          if (!value) continue;
          if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item && typeof (item as any).type === 'string') {
                stack.push(item as TSESTree.Node);
              }
            });
          } else if (typeof (value as any).type === 'string') {
            stack.push(value as TSESTree.Node);
          }
        }
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
          if (BOOLEAN_PREFIXES.has(remainder) || BOOLEAN_PREFIXES.has(lowerFirst(remainder))) {
            return lowerFirst(remainder);
          }
          return lowerFirst(remainder);
        }
      }
      return name;
    }

    return {
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
        if (config.ignoreAbstract && node.abstract) return;
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

        const sideEffectReason = detectSideEffect(body);
        const suggestedName = suggestName(name);

        const leftParen = sourceCode.getTokenAfter(node.key, {
          filter: (token) => token.value === '(',
        });
        const rightParen = leftParen
          ? sourceCode.getTokenAfter(leftParen, {
              filter: (token) => token.value === ')',
            })
          : null;

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
            sideEffectReason || !leftParen || !rightParen
              ? null
              : (fixer) =>
                  fixer.replaceTextRange(
                    [node.key.range[0], rightParen.range[1]],
                    `get ${suggestedName}`,
                  ),
        });
      },
    };
  },
});

export default preferGetterOverParameterlessMethod;
