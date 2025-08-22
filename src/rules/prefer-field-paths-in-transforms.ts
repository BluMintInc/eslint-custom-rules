import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferFieldPaths';

interface Options {
  containers?: string[];
  allowNestedIn?: string[];
  severity?: 'error' | 'warn';
}

const DEFAULT_CONTAINERS = [
  'matchesAggregation',
  'groupAggregation',
  'previews',
  'Aggregation',
  'Previews',
];

/**
 * Checks if a node is an identifier
 */
const isIdentifier = (node: TSESTree.Node): node is TSESTree.Identifier => {
  return node.type === AST_NODE_TYPES.Identifier;
};

/**
 * Checks if a node is an object expression
 */
const isObjectExpression = (
  node: TSESTree.Node,
): node is TSESTree.ObjectExpression => {
  return node.type === AST_NODE_TYPES.ObjectExpression;
};

/**
 * Checks if a node is a property
 */
const isProperty = (node: TSESTree.Node): node is TSESTree.Property => {
  return node.type === AST_NODE_TYPES.Property;
};



/**
 * Gets the property key as a string if possible
 */
const getPropertyKey = (property: TSESTree.Property): string | null => {
  if (property.computed) {
    // For computed properties like [key], we can't easily determine the key
    // unless it's a literal or template literal
    if (property.key.type === AST_NODE_TYPES.Literal) {
      return String(property.key.value);
    }
    if (property.key.type === AST_NODE_TYPES.TemplateLiteral) {
      // For template literals, we can only handle simple cases
      if (property.key.quasis.length === 1 && property.key.expressions.length === 0) {
        return property.key.quasis[0].value.cooked || null;
      }
    }
    return null;
  }

  if (isIdentifier(property.key)) {
    return property.key.name;
  }

  if (property.key.type === AST_NODE_TYPES.Literal) {
    return String(property.key.value);
  }

  return null;
};

/**
 * Checks if a property key matches any of the container patterns
 */
const matchesContainerPattern = (key: string, containers: string[]): boolean => {
  return containers.some(pattern => {
    // Simple string matching or regex-like pattern matching
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(key);
    }
    return key.includes(pattern);
  });
};

/**
 * Checks if an object has nested objects under container fields
 */
const hasNestedObjectsInContainers = (
  node: TSESTree.ObjectExpression,
  containers: string[],
  depth = 0,
): { hasNested: boolean; containerKey?: string; nestedProperty?: TSESTree.Property } => {
  for (const property of node.properties) {
    if (!isProperty(property)) continue;

    const key = getPropertyKey(property);
    if (!key) continue;

    // Check if this is a container field
    const isContainer = matchesContainerPattern(key, containers);

    // If the value is an object
    if (isObjectExpression(property.value)) {
      // If this is a container field and we have nested objects, that's a problem
      if (isContainer && depth === 0) {
        // Check if the nested object has any properties (indicating nesting)
        if (property.value.properties.length > 0) {
          return {
            hasNested: true,
            containerKey: key,
            nestedProperty: property,
          };
        }
      }

      // Recursively check nested objects
      const nestedResult = hasNestedObjectsInContainers(
        property.value,
        containers,
        depth + 1,
      );
      if (nestedResult.hasNested) {
        return nestedResult;
      }
    }
  }

  return { hasNested: false };
};

/**
 * Checks if we're inside a transform function (transformEach but not transformEachVaripotent)
 */
const isInTransformFunction = (node: TSESTree.Node): boolean => {
  let current: TSESTree.Node | undefined = node;

  while (current) {
    // Check if we're in a property with key 'transformEach'
    if (
      current.type === AST_NODE_TYPES.Property &&
      !current.computed &&
      isIdentifier(current.key) &&
      current.key.name === 'transformEach'
    ) {
      return true;
    }

    // Check if we're in a function declaration with name containing 'transformEach'
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration &&
      current.id &&
      isIdentifier(current.id)
    ) {
      const lowerName = current.id.name.toLowerCase();
      if (lowerName.includes('transformeach') && !lowerName.includes('transformeachvaripotent')) {
        return true;
      }
    }

    // Check if we're in an arrow function or function expression that's assigned to a variable with 'transformEach' in the name
    if (
      (current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
       current.type === AST_NODE_TYPES.FunctionExpression) &&
      current.parent &&
      current.parent.type === AST_NODE_TYPES.VariableDeclarator &&
      isIdentifier(current.parent.id)
    ) {
      const lowerName = current.parent.id.name.toLowerCase();
      if (lowerName.includes('transformeach') && !lowerName.includes('transformeachvaripotent')) {
        return true;
      }
    }

    current = current.parent as TSESTree.Node;
  }

  return false;
};

/**
 * Generates a suggestion for flattening the nested object
 */
const generateFlatteningSuggestion = (
  containerKey: string,
  nestedProperty: TSESTree.Property,
): string => {
  const key = getPropertyKey(nestedProperty);
  if (!key) return '';

  // Simple example for the most common case
  if (isObjectExpression(nestedProperty.value)) {
    const nestedProps = nestedProperty.value.properties
      .filter(isProperty)
      .map(prop => {
        const propKey = getPropertyKey(prop);
        return propKey ? `${containerKey}.${propKey}` : null;
      })
      .filter(Boolean);

    if (nestedProps.length > 0) {
      return `Consider using: { '${nestedProps[0]}': value }`;
    }
  }

  return `Consider using: { '${containerKey}.${key}': value }`;
};

export const preferFieldPathsInTransforms = createRule<[Options], MessageIds>({
  name: 'prefer-field-paths-in-transforms',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer dot-path field updates in transforms to prevent parent-field deletes',
      recommended: 'warn',
    },
    schema: [
      {
        type: 'object',
        properties: {
          containers: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_CONTAINERS,
          },
          allowNestedIn: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
          severity: {
            type: 'string',
            enum: ['error', 'warn'],
            default: 'warn',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferFieldPaths:
        'Prefer dot-path field updates in transforms to prevent parent-field deletes. {{suggestion}}',
    },
  },
  defaultOptions: [
    {
      containers: DEFAULT_CONTAINERS,
      allowNestedIn: [],
      severity: 'warn',
    },
  ],
  create(context, [options]) {
    const userOptions = {
      containers: DEFAULT_CONTAINERS,
      allowNestedIn: [],
      severity: 'warn' as const,
      ...options,
    };

    // Check if current file should be ignored
    const filename = context.getFilename();
    const shouldIgnoreFile = userOptions.allowNestedIn.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filename);
    });

    if (shouldIgnoreFile) {
      return {};
    }

    return {
      ReturnStatement(node) {
        // Only check return statements that return object expressions
        if (!node.argument || !isObjectExpression(node.argument)) {
          return;
        }

        // Only check if we're inside a transform function
        const inTransform = isInTransformFunction(node);
        if (!inTransform) {
          return;
        }

        // Check for nested objects in container fields
        const result = hasNestedObjectsInContainers(
          node.argument,
          userOptions.containers,
        );

        if (result.hasNested && result.containerKey && result.nestedProperty) {
          const suggestion = generateFlatteningSuggestion(
            result.containerKey,
            result.nestedProperty,
          );

          context.report({
            node: result.nestedProperty,
            messageId: 'preferFieldPaths',
            data: {
              suggestion,
            },
          });
        }
      },

      // Also check arrow function expre
    {
      code: `
        const transformEach = () => {
          return {
            [\`matchesAggregation.matchPreviews.\${matchId}.name\`]: preview.name,
            [\`matchesAggregation.matchPreviews.\${matchId}.stage\`]: preview.stage,
          };
        };
      `,
      filename: 'src/propagation/strategy.ts',
    },

    // Good: Non-container fields can be nested
    {
      code: `
        const transformEach = () => {
          return {
            userData: {
              profile: {
                name: 'test',
              },
            },
          };
        };
      `,
      filename: 'src/propagation/strategy.ts',
    },

    // Good: transformEachVaripotent is allowed to have nested objects
    {
      code: `
        const transformEachVaripotent = () => {
          return {
            matchesAggregation: {
              matchPreviews: {
