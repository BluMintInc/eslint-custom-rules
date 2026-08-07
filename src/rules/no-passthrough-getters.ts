import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { getMethodName } from '../utils/getMethodName';
import * as ts from 'typescript';

const COMPLEX_EXPRESSION_TYPES = new Set<TSESTree.Expression['type']>([
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.BinaryExpression,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.ObjectExpression,
]);

type Accessibility = 'private' | 'protected' | 'public';

/**
 * How far a member reaches. An unannotated member is `public`, which is why the
 * ranks are compared rather than the raw modifiers.
 */
const VISIBILITY_RANK: Record<Accessibility, number> = {
  private: 0,
  protected: 1,
  public: 2,
};

export const noPassthroughGetters = createRule({
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      // Target getter methods in classes
      MethodDefinition(node) {
        // Only check getter methods
        if (node.kind !== 'get') {
          return;
        }

        // Skip if the getter has decorators (like @Memoize)
        if (node.decorators && node.decorators.length > 0) {
          return;
        }

        // Check if this getter satisfies an interface or overrides a base class member
        if (isRequiredByInterfaceOrBaseClass(node, sourceCode)) {
          return;
        }

        const methodBody = node.value.body;
        if (!methodBody) {
          return;
        }

        // Check if the getter body is a simple return statement
        if (
          methodBody.body.length === 1 &&
          methodBody.body[0].type === 'ReturnStatement'
        ) {
          const returnStatement = methodBody
            .body[0] as TSESTree.ReturnStatement;

          // Skip if there's no return argument
          if (!returnStatement.argument) {
            return;
          }

          // Skip if the return statement uses super
          if (containsSuper(returnStatement.argument)) {
            return;
          }

          // Skip if the return statement includes type assertions or casting
          if (hasTypeAssertion(returnStatement.argument)) {
            return;
          }

          // Skip if the return statement includes null/undefined handling
          if (hasNullUndefinedHandling(returnStatement.argument)) {
            return;
          }

          // Skip if the return statement includes computed property access or function calls
          if (hasComputedPropertyOrFunctionCall(returnStatement.argument)) {
            return;
          }

          // Check if the return statement is accessing a property from a constructor parameter
          if (isConstructorParameterPropertyAccess(returnStatement.argument)) {
            // A getter that reaches further than the member it forwards is the
            // only read path its audience has
            if (
              widensVisibilityOfForwardedRoot(node, returnStatement.argument)
            ) {
              return;
            }

            const getterName =
              getMethodName(node, sourceCode, {
                computedFallbackToText: false,
              }) || 'getter';
            const propertyPath =
              getMemberPath(returnStatement.argument) ??
              'nested property on a constructor-injected object';

            context.report({
              node,
              messageId: 'noPassthroughGetter',
              data: {
                getterName,
                propertyPath,
              },
            });
          }
        }
      },
    };

    /**
     * Whether the getter is more visible than the member it forwards.
     *
     * The rule's remedy — read the constructor-injected object directly — is
     * only expressible by callers that can see that object. When the getter
     * reaches further than its root (`public get` over `private readonly
     * props`, `protected get` over a base class's `private` field), the getter
     * IS the encapsulation boundary rather than indirection over an accessible
     * field, and no caller outside the root's audience has another read path.
     * TypeScript flatly rejects `this.props.x` in a subclass of a class that
     * declares `props` private, so for that audience the remedy does not exist.
     *
     * Equal visibility keeps reporting: a `private get` over a `private` field
     * aliases state its only callers already reach, which is the indirection
     * the rule targets.
     */
    function widensVisibilityOfForwardedRoot(
      node: TSESTree.MethodDefinition,
      argument: TSESTree.Expression,
    ): boolean {
      const root = forwardedRootOf(argument);
      if (!root) {
        return false;
      }

      const rootAccessibility = accessibilityOfRoot(node, root);
      if (!rootAccessibility) {
        return false;
      }

      const getterAccessibility = node.accessibility ?? 'public';
      return (
        VISIBILITY_RANK[getterAccessibility] >
        VISIBILITY_RANK[rootAccessibility]
      );
    }

    /**
     * The member the getter ultimately reads off `this`, e.g. `props` for
     * `this.props.metadata.ticker`. `#`-prefixed roots are reported separately
     * because they carry no `accessibility` modifier while being maximally
     * private.
     */
    function forwardedRootOf(
      argument: TSESTree.Expression,
    ): { name: string; isEcmaPrivate: boolean } | null {
      let current: TSESTree.Expression = argument;

      while (current.type === AST_NODE_TYPES.MemberExpression) {
        if (current.object.type === AST_NODE_TYPES.ThisExpression) {
          if (current.property.type === AST_NODE_TYPES.PrivateIdentifier) {
            return { name: current.property.name, isEcmaPrivate: true };
          }
          if (!current.computed && current.property.type === 'Identifier') {
            return { name: current.property.name, isEcmaPrivate: false };
          }
          if (
            current.computed &&
            current.property.type === 'Literal' &&
            typeof current.property.value === 'string'
          ) {
            return { name: current.property.value, isEcmaPrivate: false };
          }
          return null;
        }
        current = current.object as TSESTree.Expression;
      }

      return null;
    }

    function accessibilityOfRoot(
      node: TSESTree.MethodDefinition,
      root: { name: string; isEcmaPrivate: boolean },
    ): Accessibility | null {
      if (root.isEcmaPrivate) {
        return 'private';
      }

      const declared = declaredAccessibilityIn(
        node.parent as TSESTree.Node | undefined,
        root.name,
      );
      if (declared) {
        return declared;
      }

      // A root declared by a base class is invisible to a syntactic lookup, and
      // that is exactly where the widest gaps sit (a `public get` forwarding a
      // base class's `protected` field).
      return inheritedAccessibilityOf(node, root.name);
    }

    /**
     * Accessibility of `name` as declared in the class body that owns `node`,
     * covering constructor parameter properties, fields and accessors alike —
     * a forwarded root is spelled any of the three in practice.
     */
    function declaredAccessibilityIn(
      classBody: TSESTree.Node | undefined,
      name: string,
    ): Accessibility | null {
      if (!classBody || classBody.type !== AST_NODE_TYPES.ClassBody) {
        return null;
      }

      for (const member of classBody.body) {
        if (
          member.type === AST_NODE_TYPES.PropertyDefinition ||
          member.type === AST_NODE_TYPES.TSAbstractPropertyDefinition
        ) {
          if (
            member.key.type === AST_NODE_TYPES.PrivateIdentifier &&
            member.key.name === name
          ) {
            return 'private';
          }
          if (
            !member.computed &&
            member.key.type === AST_NODE_TYPES.Identifier &&
            member.key.name === name
          ) {
            return member.accessibility ?? 'public';
          }
          continue;
        }

        if (
          member.type !== AST_NODE_TYPES.MethodDefinition &&
          member.type !== AST_NODE_TYPES.TSAbstractMethodDefinition
        ) {
          continue;
        }

        if (member.kind === 'constructor') {
          const parameterAccessibility = parameterPropertyAccessibility(
            member,
            name,
          );
          if (parameterAccessibility) {
            return parameterAccessibility;
          }
          continue;
        }

        if (
          member.kind === 'get' &&
          !member.computed &&
          member.key.type === AST_NODE_TYPES.Identifier &&
          member.key.name === name
        ) {
          return member.accessibility ?? 'public';
        }
      }

      return null;
    }

    function parameterPropertyAccessibility(
      constructorNode:
        | TSESTree.MethodDefinition
        | TSESTree.TSAbstractMethodDefinition,
      name: string,
    ): Accessibility | null {
      for (const parameter of constructorNode.value.params) {
        if (parameter.type !== AST_NODE_TYPES.TSParameterProperty) {
          continue;
        }
        const { parameter: inner } = parameter;
        const identifier =
          inner.type === AST_NODE_TYPES.AssignmentPattern ? inner.left : inner;
        if (
          identifier.type === AST_NODE_TYPES.Identifier &&
          identifier.name === name
        ) {
          // `constructor(readonly props: P)` declares a public member.
          return parameter.accessibility ?? 'public';
        }
      }
      return null;
    }

    function inheritedAccessibilityOf(
      node: TSESTree.MethodDefinition,
      name: string,
    ): Accessibility | null {
      const parserServices = sourceCode.parserServices;
      if (
        !parserServices ||
        !parserServices.program ||
        !parserServices.esTreeNodeToTSNodeMap
      ) {
        return null;
      }

      const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node) as
        | ts.GetAccessorDeclaration
        | undefined;
      if (
        !tsNode ||
        !tsNode.parent ||
        !(
          ts.isClassDeclaration(tsNode.parent) ||
          ts.isClassExpression(tsNode.parent)
        )
      ) {
        return null;
      }

      const checker = parserServices.program.getTypeChecker();
      const classSymbol = checker.getTypeAtLocation(tsNode.parent).getSymbol();
      if (!classSymbol) {
        return null;
      }

      const property = checker
        .getDeclaredTypeOfSymbol(classSymbol)
        .getProperty(name);
      const declaration =
        property?.valueDeclaration ?? property?.declarations?.[0];
      if (!declaration) {
        return null;
      }

      const flags = ts.getCombinedModifierFlags(declaration as ts.Declaration);
      if (flags & ts.ModifierFlags.Private) {
        return 'private';
      }
      if (flags & ts.ModifierFlags.Protected) {
        return 'protected';
      }
      return 'public';
    }

    /**
     * Check if the getter is required by an implemented interface or overrides a base class member
     */
    function isRequiredByInterfaceOrBaseClass(
      node: TSESTree.MethodDefinition,
      sourceCode: TSESLint.SourceCode,
    ): boolean {
      const parserServices = sourceCode.parserServices;
      if (
        !parserServices ||
        !parserServices.program ||
        !parserServices.esTreeNodeToTSNodeMap
      ) {
        return false;
      }

      const checker = parserServices.program.getTypeChecker();
      const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node) as
        | ts.MethodDeclaration
        | ts.GetAccessorDeclaration
        | undefined;
      if (!tsNode) {
        return false;
      }
      const symbol = checker.getSymbolAtLocation(tsNode.name);

      if (
        !symbol ||
        !tsNode.parent ||
        !(
          ts.isClassDeclaration(tsNode.parent) ||
          ts.isClassExpression(tsNode.parent)
        )
      ) {
        return false;
      }

      const classNode = tsNode.parent as
        | ts.ClassDeclaration
        | ts.ClassExpression;
      const classType = checker.getTypeAtLocation(classNode);
      const classSymbol = classType.getSymbol();
      if (!classSymbol) {
        return false;
      }

      const instanceType = checker.getDeclaredTypeOfSymbol(classSymbol);
      const name = symbol.getName();

      // Check base classes
      const baseTypes = instanceType.getBaseTypes() || [];
      for (const baseType of baseTypes) {
        if (baseType.getProperty(name)) {
          return true;
        }
      }

      // Check interfaces
      if (classNode.heritageClauses) {
        for (const clause of classNode.heritageClauses) {
          // Only check implemented interfaces as base classes are already checked via getBaseTypes()
          if (clause.token !== ts.SyntaxKind.ImplementsKeyword) {
            continue;
          }
          for (const typeNode of clause.types) {
            const type = checker.getTypeAtLocation(typeNode);
            if (type.getProperty(name)) {
              return true;
            }
          }
        }
      }

      return false;
    }

    /**
     * Check if the node is a simple property access from a constructor parameter
     * like this.settings.property or this.settings['property'] or this.settings.nested.deep.property
     */
    function isConstructorParameterPropertyAccess(
      node: TSESTree.Expression,
    ): boolean {
      // Check for member expressions like this.settings.property
      if (node.type === 'MemberExpression') {
        return isConstructorParameterAccess(node);
      }

      return false;
    }

    /**
     * Check if the node is accessing a property from a constructor parameter
     * Patterns to match: this.constructorParam.property, this.constructorParam['property'], this.constructorParam.nested.deep.property
     * Patterns to NOT match: this.property, SomeClass.property, this.methodCall()
     */
    function isConstructorParameterAccess(
      node: TSESTree.MemberExpression,
    ): boolean {
      let current: TSESTree.MemberExpression['object'] | TSESTree.Expression =
        node.object;
      let depth = 0;

      // Walk up member expressions until we reach a base
      while (current && current.type === 'MemberExpression') {
        depth += 1;
        current = current.object as TSESTree.Expression;
      }

      // Require at least one nesting and a base of `this`
      return depth >= 1 && current?.type === 'ThisExpression';
    }

    /**
     * Check if the node contains a reference to super
     */
    function containsSuper(node: TSESTree.Expression): boolean {
      let current: TSESTree.Expression | undefined = node;
      while (current && current.type === 'MemberExpression') {
        if (current.object.type === 'Super') {
          return true;
        }
        current = current.object as TSESTree.Expression;
      }
      return false;
    }

    function getMemberPath(node: TSESTree.Expression): string | null {
      if (node.type === 'ThisExpression') {
        return 'this';
      }

      if (node.type === 'Identifier') {
        return node.name;
      }

      if (node.type !== 'MemberExpression') {
        return null;
      }

      const objectPath = getMemberPath(node.object);
      if (!objectPath) {
        return null;
      }

      if (node.computed && node.property.type === 'Literal') {
        const literalValue =
          typeof node.property.value === 'string'
            ? JSON.stringify(node.property.value)
            : String(node.property.value);
        return `${objectPath}[${literalValue}]`;
      }

      if (node.property.type === 'Identifier') {
        return `${objectPath}.${node.property.name}`;
      }

      return null;
    }

    /**
     * Check if the node has a type assertion or casting
     */
    function hasTypeAssertion(node: TSESTree.Expression): boolean {
      if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') {
        return true;
      }

      if (node.type === 'MemberExpression') {
        return hasTypeAssertion(node.object);
      }

      return false;
    }

    /**
     * Check if the node handles null/undefined values
     */
    function hasNullUndefinedHandling(node: TSESTree.Expression): boolean {
      // Check for logical expressions like this.settings.property || []
      if (node.type === 'LogicalExpression') {
        return true;
      }

      // Check for conditional expressions like this.settings.property ? this.settings.property : []
      if (node.type === 'ConditionalExpression') {
        return true;
      }

      // Check for optional chaining like this.settings?.property. `a?.b` parses
      // as a ChainExpression wrapping the member access, so the wrapper has to
      // be stripped here or this arm never fires — the shape stays silent only
      // because the member walker cannot follow it, which would reverse the
      // moment that walker learns to.
      let unchained: TSESTree.Node = node;
      while (unchained.type === 'ChainExpression') {
        unchained = unchained.expression;
      }
      if (unchained.type === 'MemberExpression' && unchained.optional) {
        return true;
      }

      // The nullish coalescing check is already covered by the LogicalExpression check above

      return false;
    }

    /**
     * Check if the node includes computed property access or function calls
     */
    function hasComputedPropertyOrFunctionCall(
      node: TSESTree.Expression,
    ): boolean {
      if (COMPLEX_EXPRESSION_TYPES.has(node.type)) {
        return true;
      }

      // Check for member expressions with computed properties like this.settings[key]
      if (node.type === 'MemberExpression') {
        // If the property is computed with a dynamic expression (not a literal), it's not a simple property access
        if (node.computed && node.property.type !== 'Literal') {
          return true;
        }

        // Recursively check the object part
        return hasComputedPropertyOrFunctionCall(node.object);
      }

      return false;
    }
  },

  name: 'no-passthrough-getters',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid getter methods that only re-expose nested properties on constructor-injected objects without adding behavior',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noPassthroughGetter:
        'Getter "{{getterName}}" only forwards nested property "{{propertyPath}}" from an object provided via the constructor. This indirection hides the real source of state and expands the class API without adding behavior. Read the constructor-injected object directly or add logic that justifies a getter (validation, memoization, fallback).',
    },
  },
  defaultOptions: [],
});
