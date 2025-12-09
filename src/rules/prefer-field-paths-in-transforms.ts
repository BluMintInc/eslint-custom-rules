import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';

// Options for the rule
interface RuleOptions {
  containers?: string[];
  allowNestedIn?: string[];
}

type MessageIds = 'preferFieldPathsInTransforms';

// Defaults aim to catch common BluMint aggregation container names
const DEFAULT_CONTAINERS: string[] = ['*Aggregation', 'previews', '*Previews'];

function describeNestedPath(
  containerValue: TSESTree.ObjectExpression,
): string | null {
  let objectFallback: string | null = null;
  let primitiveFallback: string | null = null;
  for (const prop of containerValue.properties) {
    if (prop.type === AST_NODE_TYPES.SpreadElement) continue;
    if (!isProperty(prop)) continue;
    if (prop.computed) continue;
    const firstKey = getPropertyName(prop);
    if (!firstKey) continue;

    if (isObjectExpression(prop.value)) {
      for (const child of prop.value.properties) {
        if (child.type === AST_NODE_TYPES.SpreadElement) continue;
        if (!isProperty(child)) continue;
        if (child.computed) continue;
        const childKey = getPropertyName(child);
        if (childKey) return `${firstKey}.${childKey}`;
      }

      // Object container without usable child keys still signals nested intent
      if (!objectFallback) objectFallback = firstKey;
      continue;
    }

    if (!primitiveFallback) primitiveFallback = firstKey;
  }

  return objectFallback ?? primitiveFallback;
}

function isObjectExpression(
  node: TSESTree.Node | null | undefined,
): node is TSESTree.ObjectExpression {
  return !!node && node.type === AST_NODE_TYPES.ObjectExpression;
}

function isProperty(node: TSESTree.Node): node is TSESTree.Property {
  return node.type === AST_NODE_TYPES.Property;
}

function getPropertyName(node: TSESTree.Property): string | null {
  if (node.computed) return null;
  if (node.key.type === AST_NODE_TYPES.Identifier) return node.key.name;
  if (
    node.key.type === AST_NODE_TYPES.Literal &&
    typeof node.key.value === 'string'
  )
    return node.key.value;
  return null;
}

function isNamedFunction(
  fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression,
  name: string,
): boolean {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return (
      !!fn.id && fn.id.type === AST_NODE_TYPES.Identifier && fn.id.name === name
    );
  }
  // For function expressions, parent determines name association
  return false;
}

function isTransformEachFunction(
  fn:
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionDeclaration,
): boolean {
  // Handle named function declarations: function transformEach() {}
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    if (isNamedFunction(fn, 'transformEach')) return true;
    return false;
  }

  // Check parent contexts to determine if this function is assigned to a property/method named transformEach
  const parent = fn.parent as TSESTree.Node | null;
  if (!parent) return false;

  // Object literal: { transformEach(...) { ... } } or transformEach: () => { ... }
  if (parent.type === AST_NODE_TYPES.Property) {
    const key = parent.key;
    if (parent.computed) {
      if (key.type === AST_NODE_TYPES.Literal && key.value === 'transformEach')
        return true;
      return false;
    }
    if (key.type === AST_NODE_TYPES.Identifier) {
      return key.name === 'transformEach';
    }
    if (key.type === AST_NODE_TYPES.Literal) {
      return key.value === 'transformEach';
    }
  }

  // Class method: class X { transformEach() { ... } }
  if (parent.type === AST_NODE_TYPES.MethodDefinition) {
    const key = parent.key;
    if (parent.computed) {
      if (key.type === AST_NODE_TYPES.Literal && key.value === 'transformEach')
        return true;
      return false;
    }
    if (key.type === AST_NODE_TYPES.Identifier) {
      return key.name === 'transformEach';
    }
    if (key.type === AST_NODE_TYPES.Literal) {
      return key.value === 'transformEach';
    }
  }

  // Class property arrow: class X { transformEach = (..) => ... }
  if (parent.type === AST_NODE_TYPES.PropertyDefinition) {
    const key = parent.key;
    if (parent.computed) {
      return (
        key.type === AST_NODE_TYPES.Literal && key.value === 'transformEach'
      );
    }
    if (key.type === AST_NODE_TYPES.Identifier)
      return key.name === 'transformEach';
    if (key.type === AST_NODE_TYPES.Literal)
      return key.value === 'transformEach';
  }

  // Variable assignment: const transformEach = () => { ... }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    if (parent.id.type === AST_NODE_TYPES.Identifier) {
      return parent.id.name === 'transformEach';
    }
  }

  // Assignment: obj.transformEach = () => { ... }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    const left = parent.left;
    if (left.type === AST_NODE_TYPES.MemberExpression) {
      const prop = left.property;
      if (prop.type === AST_NODE_TYPES.Identifier)
        return prop.name === 'transformEach';
      if (prop.type === AST_NODE_TYPES.Literal)
        return prop.value === 'transformEach';
    } else if (left.type === AST_NODE_TYPES.Identifier) {
      return left.name === 'transformEach';
    }
  }

  return false;
}

function isTransformEachVaripotent(
  fn:
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionDeclaration,
): boolean {
  // Handle named function declarations: function transformEachVaripotent() {}
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return (
      !!fn.id &&
      fn.id.type === AST_NODE_TYPES.Identifier &&
      fn.id.name === 'transformEachVaripotent'
    );
  }

  const parent = fn.parent as TSESTree.Node | null;
  if (!parent) return false;

  if (parent.type === AST_NODE_TYPES.Property) {
    const key = parent.key;
    if (parent.computed) {
      return (
        key.type === AST_NODE_TYPES.Literal &&
        key.value === 'transformEachVaripotent'
      );
    }
    if (key.type === AST_NODE_TYPES.Identifier)
      return key.name === 'transformEachVaripotent';
    if (key.type === AST_NODE_TYPES.Literal)
      return key.value === 'transformEachVaripotent';
  }

  if (parent.type === AST_NODE_TYPES.MethodDefinition) {
    const key = parent.key;
    if (parent.computed) {
      return (
        key.type === AST_NODE_TYPES.Literal &&
        key.value === 'transformEachVaripotent'
      );
    }
    if (key.type === AST_NODE_TYPES.Identifier)
      return key.name === 'transformEachVaripotent';
    if (key.type === AST_NODE_TYPES.Literal)
      return key.value === 'transformEachVaripotent';
  }

  if (parent.type === AST_NODE_TYPES.PropertyDefinition) {
    const key = parent.key;
    if (parent.computed) {
      return (
        key.type === AST_NODE_TYPES.Literal &&
        key.value === 'transformEachVaripotent'
      );
    }
    if (key.type === AST_NODE_TYPES.Identifier)
      return key.name === 'transformEachVaripotent';
    if (key.type === AST_NODE_TYPES.Literal)
      return key.value === 'transformEachVaripotent';
  }

  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return (
      parent.id.type === AST_NODE_TYPES.Identifier &&
      parent.id.name === 'transformEachVaripotent'
    );
  }

  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    const left = parent.left;
    if (left.type === AST_NODE_TYPES.MemberExpression) {
      const prop = left.property;
      if (prop.type === AST_NODE_TYPES.Identifier)
        return prop.name === 'transformEachVaripotent';
      if (prop.type === AST_NODE_TYPES.Literal)
        return prop.value === 'transformEachVaripotent';
    } else if (left.type === AST_NODE_TYPES.Identifier) {
      return left.name === 'transformEachVaripotent';
    }
  }

  return false;
}

// Determine whether any path two or more levels below a container is created using object literals
function hasDeeperThanOneLevelUnderContainer(
  containerObj: TSESTree.ObjectExpression,
): boolean {
  for (const prop of containerObj.properties) {
    if (prop.type === AST_NODE_TYPES.SpreadElement) continue;
    if (!isProperty(prop)) continue;
    const value = prop.value;

    // If the child value is itself an object literal with at least one property, we have depth >= 2
    if (isObjectExpression(value)) {
      const hasAnyProp = value.properties.some(
        (p) => p.type === AST_NODE_TYPES.Property,
      );
      if (hasAnyProp) return true;
    }
  }
  return false;
}

function analyzeReturnedObject(
  obj: TSESTree.ObjectExpression,
  context: any,
  containerNameMatches: (name: string) => boolean,
) {
  for (const top of obj.properties) {
    if (top.type === AST_NODE_TYPES.SpreadElement) continue;
    if (!isProperty(top)) continue;

    // Skip computed top-level keys and already-flattened keys containing dots
    if (top.computed) continue;

    const keyName = getPropertyName(top);
    if (!keyName) continue;
    if (keyName.includes('.')) continue;

    if (!containerNameMatches(keyName)) continue;

    const containerValue = top.value;
    if (!isObjectExpression(containerValue)) continue; // only care if returning an object under the container

    if (hasDeeperThanOneLevelUnderContainer(containerValue)) {
      const nestedPath = describeNestedPath(containerValue) ?? 'nestedField';
      context.report({
        node: top,
        messageId: 'preferFieldPathsInTransforms',
        data: {
          container: keyName,
          nestedPath,
          flattenedPath: `${keyName}.${nestedPath}`,
        },
      });
    }
  }
}

export const preferFieldPathsInTransforms = createRule<
  [RuleOptions?],
  MessageIds
>({
  name: 'prefer-field-paths-in-transforms',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Flatten aggregation updates inside transformEach so diff-based deletes remove only the intended fields instead of wiping sibling data.',
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
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferFieldPathsInTransforms:
        'Transform returns nested object under "{{container}}" (e.g., "{{nestedPath}}"). Nested writes in shared aggregation containers cause diff reconciliation to delete the whole subtree, wiping sibling fields. Flatten the update into field-path keys such as "{{flattenedPath}}" so only the intended leaf changes and other aggregation data stays intact.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const filename = context.getFilename();
    const { containers = DEFAULT_CONTAINERS, allowNestedIn = [] } =
      options || {};

    // Skip files explicitly allowed
    if (
      allowNestedIn.length > 0 &&
      allowNestedIn.some((glob) => minimatch(filename, glob))
    ) {
      return {};
    }

    function containerNameMatches(name: string): boolean {
      return containers.some((pattern) => minimatch(name, pattern));
    }

    function isInTargetTransform(returnNode: TSESTree.Node): boolean {
      // Find nearest function ancestor
      let current: TSESTree.Node | undefined | null = (returnNode as any)
        .parent as TSESTree.Node | null;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          current.type === AST_NODE_TYPES.FunctionDeclaration
        ) {
          const fn = current as
            | TSESTree.FunctionExpression
            | TSESTree.ArrowFunctionExpression
            | TSESTree.FunctionDeclaration;
          if (isTransformEachVaripotent(fn)) return false;
          if (isTransformEachFunction(fn)) return true;
        }
        current = (current as any).parent as TSESTree.Node | null;
      }
      return false;
    }

    return {
      ReturnStatement(node) {
        if (!node.argument || !isObjectExpression(node.argument)) return;
        if (!isInTargetTransform(node)) return;
        analyzeReturnedObject(node.argument, context, containerNameMatches);
      },
      ArrowFunctionExpression(node) {
        // Handle implicit returns: transformEach: doc => ({ ... })
        if (!isTransformEachFunction(node) || isTransformEachVaripotent(node))
          return;
        if (isObjectExpression(node.body)) {
          analyzeReturnedObject(node.body, context, containerNameMatches);
        }
      },
    };
  },
});
