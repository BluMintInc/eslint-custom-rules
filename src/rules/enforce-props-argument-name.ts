import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'usePropsParameterName' | 'usePropsParameterNameWithPrefix';
type Options = [];

// Every node shape whose parameters this rule renames.
type ParameterOwner =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.TSEmptyBodyFunctionExpression
  | TSESTree.TSMethodSignature;

/**
 * A body-less signature (an interface method signature, or an abstract /
 * `declare` / overload class method) has no statements, so its parameter name
 * is documentation-only and can never be referenced in-file. A
 * declaration-only rename is therefore complete rather than partial, and stays
 * safe even if the scope analyzer declines to model the parameter.
 */
const isBodylessSignature = (owner: ParameterOwner): boolean =>
  owner.type === AST_NODE_TYPES.TSMethodSignature ||
  owner.type === AST_NODE_TYPES.TSEmptyBodyFunctionExpression;

/**
 * Rewrites only the identifier's first token. A TSESTree `Identifier` range
 * spans its type annotation and optional marker (`props?: RunnerProps`), so
 * `fixer.replaceText(id, newName)` would delete the annotation along with the
 * name (Issue #1351).
 */
const renameIdentifierToken = (
  fixer: TSESLint.RuleFixer,
  sourceCode: Readonly<TSESLint.SourceCode>,
  identifier: TSESTree.Node,
  text: string,
): TSESLint.RuleFix | null => {
  const token = sourceCode.getFirstToken(identifier);
  if (!token) {
    return null;
  }
  return fixer.replaceTextRange([token.range[0], token.range[1]], text);
};

/**
 * Walks the scope chain upward from `scope` (inclusive) and reports whether
 * `targetName` is bound anywhere between `scope` and `stopScope` (inclusive).
 * Mirrors how the engine resolves an identifier at a use site: the first scope
 * on the chain that declares the name wins. Used to detect whether a rewritten
 * reference would be captured by a binding sitting between it and the
 * declaration it currently resolves to.
 */
const isNameBoundInChain = (
  scope: TSESLint.Scope.Scope | null,
  stopScope: TSESLint.Scope.Scope | null,
  targetName: string,
): boolean => {
  let current: TSESLint.Scope.Scope | null = scope;
  while (current) {
    if (current.set.has(targetName)) {
      return true;
    }
    if (current === stopScope) {
      break;
    }
    current = current.upper;
  }
  return false;
};

/**
 * Reports whether `targetName` is used as an identifier anywhere inside
 * `scope` or its nested scopes. Such a use currently resolves to some other
 * binding (an outer constant, a nested declaration); giving the parameter that
 * same name would capture it, silently rebinding working code.
 */
const scopeSubtreeReferencesName = (
  scope: TSESLint.Scope.Scope,
  targetName: string,
): boolean => {
  const pending: TSESLint.Scope.Scope[] = [scope];
  while (pending.length > 0) {
    const current = pending.pop() as TSESLint.Scope.Scope;
    if (
      current.references.some(
        (reference) => reference.identifier.name === targetName,
      )
    ) {
      return true;
    }
    pending.push(...current.childScopes);
  }
  return false;
};

/**
 * Returns true when renaming `variable` to `newName` would collide with an
 * existing binding in any scope the rename touches, making the autofix
 * semantics-changing (and thus unsafe). The fixer rewrites the declaration
 * plus every in-file reference; if `newName` already resolves to a different
 * binding, the rewrite would redeclare a name already bound in the declaration
 * scope, capture a reference onto an intervening binding, or swallow a use of
 * an outer binding that shares the name. In every such case the fix is
 * suppressed (report-only).
 */
const renameWouldCollide = (
  variable: TSESLint.Scope.Variable,
  newName: string,
): boolean => {
  const declarationScope = variable.scope;

  // (1) Declaration site: `newName` already bound in the scope that holds the
  //     parameter would make the rename a redeclaration/shadow.
  if (declarationScope.set.has(newName)) {
    return true;
  }

  // (2) Reference sites: a binding of `newName` sitting between a reference and
  //     the declaration scope would swallow the rewritten identifier — the
  //     reference would resolve to that binding instead of the parameter.
  for (const reference of variable.references) {
    const referenceScope = reference.from ?? declarationScope;
    if (isNameBoundInChain(referenceScope, declarationScope, newName)) {
      return true;
    }
  }

  // (3) Capture: the parameter's own scope (or a nested one) already uses
  //     `newName` for something else, so introducing the parameter under that
  //     name would shadow whatever those uses resolve to.
  return scopeSubtreeReferencesName(declarationScope, newName);
};

export const enforcePropsArgumentName = createRule<Options, MessageIds>({
  name: 'enforce-props-argument-name',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Authoritative rule: parameters with types ending in "Props" should be named "props" (or prefixed variants when multiple Props params exist)',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      usePropsParameterName:
        'Parameter with type "{{ typeName }}" should be named "props"',
      usePropsParameterNameWithPrefix:
        'Parameter with type "{{ typeName }}" should be named "{{ suggestedName }}"',
    },
  },
  defaultOptions: [],
  create(context) {
    // Extract type name from a type annotation
    function getTypeName(typeAnnotation: TSESTree.TypeNode): string | null {
      if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = typeAnnotation.typeName;
        if (typeName.type === AST_NODE_TYPES.Identifier) {
          return typeName.name;
        }
      }
      return null;
    }

    // Check if a type name ends with "Props"
    function endsWithProps(typeName: string): boolean {
      return typeName.endsWith('Props');
    }

    // Get all parameters that have a "Props" type
    function getPropsParams(
      params: TSESTree.Parameter[],
    ): { id: TSESTree.Identifier; typeName: string }[] {
      return params
        .map((param) => {
          const id = getIdFromParam(param);
          if (id && id.typeAnnotation && id.typeAnnotation.typeAnnotation) {
            const paramTypeName = getTypeName(id.typeAnnotation.typeAnnotation);
            if (paramTypeName && endsWithProps(paramTypeName)) {
              return { id, typeName: paramTypeName };
            }
          }
          return null;
        })
        .filter((p): p is { id: TSESTree.Identifier; typeName: string } => !!p);
    }

    // Generate suggested parameter name for Props types
    function getSuggestedParameterName(
      typeName: string,
      allParams: TSESTree.Parameter[],
      currentParam: TSESTree.Parameter,
      propsParams: { id: TSESTree.Identifier; typeName: string }[],
    ): string {
      const currentId = getIdFromParam(currentParam);
      const currentName = currentId?.name;
      const existingNames = new Set(
        allParams
          .map((p) => getIdFromParam(p))
          .filter(
            (id): id is TSESTree.Identifier => !!id && id.name !== currentName,
          )
          .map((id) => id.name),
      );

      // If multiple parameters have the exact same Props type, allow the current names.
      // This handles cases like (prevProps: TProps, nextProps: TProps) where
      // forcing a single name based on the type would cause a collision or
      // break descriptive naming.
      const sameTypeParams = propsParams.filter((p) => p.typeName === typeName);
      if (sameTypeParams.length > 1) {
        // Keep the current name when multiple params share the same Props type.
        // This preserves descriptive names like prevProps/nextProps.
        if (!currentName) {
          // Fallback should not occur since destructured params are filtered upstream.
          let candidate = 'props';
          let suffix = 2;
          while (existingNames.has(candidate)) {
            candidate = `props${suffix++}`;
          }
          return candidate;
        }
        return currentName;
      }

      if (typeName === 'Props') {
        let candidate = 'props';
        let suffix = 2;
        while (existingNames.has(candidate)) {
          candidate = `props${suffix++}`;
        }
        return candidate;
      }

      // If there's only one Props parameter (regardless of type name), suggest "props"
      if (propsParams.length <= 1) {
        let candidate = 'props';
        let suffix = 2;
        while (existingNames.has(candidate)) {
          candidate = `props${suffix++}`;
        }
        return candidate;
      }

      // If there are multiple Props parameters with different types, use prefixed names.
      // For types like "UserProps", suggest "userProps".
      const baseName = typeName.slice(0, -5); // Remove "Props"
      const camelCaseBase =
        baseName.charAt(0).toLowerCase() + baseName.slice(1);

      let candidate = `${camelCaseBase}Props`;
      let i = 2;
      while (existingNames.has(candidate)) {
        candidate = `${camelCaseBase}Props${i++}`;
      }
      return candidate;
    }

    // Check if parameter is destructured
    function isDestructuredParameter(param: TSESTree.Parameter): boolean {
      if (
        param.type === AST_NODE_TYPES.ObjectPattern ||
        param.type === AST_NODE_TYPES.ArrayPattern
      ) {
        return true;
      }

      if (
        param.type === AST_NODE_TYPES.AssignmentPattern &&
        (param.left.type === AST_NODE_TYPES.ObjectPattern ||
          param.left.type === AST_NODE_TYPES.ArrayPattern)
      ) {
        return true;
      }

      if (param.type === AST_NODE_TYPES.TSParameterProperty) {
        const inner = param.parameter;
        if (
          inner.type === AST_NODE_TYPES.ObjectPattern ||
          inner.type === AST_NODE_TYPES.ArrayPattern
        ) {
          return true;
        }
        if (
          inner.type === AST_NODE_TYPES.AssignmentPattern &&
          (inner.left.type === AST_NODE_TYPES.ObjectPattern ||
            inner.left.type === AST_NODE_TYPES.ArrayPattern)
        ) {
          return true;
        }
      }

      return false;
    }

    function getIdFromParam(
      param: TSESTree.Parameter,
    ): TSESTree.Identifier | null {
      if (param.type === AST_NODE_TYPES.Identifier) return param;

      if (
        param.type === AST_NODE_TYPES.AssignmentPattern &&
        param.left.type === AST_NODE_TYPES.Identifier
      ) {
        return param.left;
      }

      if (param.type === AST_NODE_TYPES.TSParameterProperty) {
        const inner = param.parameter;
        if (inner.type === AST_NODE_TYPES.Identifier) return inner;
        if (
          inner.type === AST_NODE_TYPES.AssignmentPattern &&
          inner.left.type === AST_NODE_TYPES.Identifier
        ) {
          return inner.left;
        }
      }

      if (param.type === AST_NODE_TYPES.RestElement) {
        if (param.argument.type === AST_NODE_TYPES.Identifier) {
          return param.argument;
        }
      }

      return null;
    }

    // Build the complete rename: the parameter declaration AND every in-scope
    // reference to it. A declaration-only rename leaves every use site bound to
    // a now-undefined name, so `--fix` exits 0 while producing code that no
    // longer compiles (Issue #1355, same defect class as #1313 and #1256).
    // Returns null whenever the rename cannot be applied everywhere, so the
    // report stands on its own rather than corrupting the source.
    function buildParameterRenameFixes(
      fixer: TSESLint.RuleFixer,
      owner: ParameterOwner,
      id: TSESTree.Identifier,
      newName: string,
    ): TSESLint.RuleFix[] | null {
      const sourceCode = context.sourceCode;

      const declarationFix = renameIdentifierToken(
        fixer,
        sourceCode,
        id,
        newName,
      );
      if (!declarationFix) {
        return null;
      }

      // `getDeclaredVariables` on a function returns every parameter plus
      // `arguments` and, for a declaration, the function's own name — and those
      // can share a name (`function config(config: XProps)`), so the lookup
      // matches on declaration identity instead of on the name.
      const variable =
        context
          .getDeclaredVariables(owner)
          .find((candidate) => candidate.defs.some((def) => def.name === id)) ??
        null;

      if (!variable) {
        return isBodylessSignature(owner) ? [declarationFix] : null;
      }

      if (renameWouldCollide(variable, newName)) {
        return null;
      }

      const fixes: TSESLint.RuleFix[] = [declarationFix];
      for (const reference of variable.references) {
        const referenceId = reference.identifier;

        // A parameter with a default value carries a write reference whose
        // identifier is the declaration itself, already rewritten above.
        // Skipping it also avoids overlapping fix ranges, which ESLint rejects.
        if (referenceId === id) {
          continue;
        }

        const referenceParent = referenceId.parent;

        // An object-literal shorthand `{ runnerProps }` desugars to
        // `{ runnerProps: runnerProps }`: the single token is both the property
        // key and its value. Rewriting it to `{ props }` would rename the KEY
        // too, silently changing the object's shape. Expand to
        // `oldKey: newName` so only the value is renamed.
        if (
          referenceParent?.type === AST_NODE_TYPES.Property &&
          referenceParent.shorthand &&
          referenceParent.parent?.type === AST_NODE_TYPES.ObjectExpression
        ) {
          const shorthandFix = renameIdentifierToken(
            fixer,
            sourceCode,
            referenceId,
            `${id.name}: ${newName}`,
          );
          if (!shorthandFix) {
            return null;
          }
          fixes.push(shorthandFix);
          continue;
        }

        const referenceFix = renameIdentifierToken(
          fixer,
          sourceCode,
          referenceId,
          newName,
        );
        if (!referenceFix) {
          return null;
        }
        fixes.push(referenceFix);
      }

      return fixes;
    }

    // Check function parameters
    function checkFunctionParams(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | TSESTree.TSMethodSignature,
    ): void {
      // Skip function expressions that are part of method definitions
      // to avoid duplicate processing
      if (
        node.type === AST_NODE_TYPES.FunctionExpression &&
        node.parent &&
        node.parent.type === AST_NODE_TYPES.MethodDefinition
      ) {
        return;
      }

      const propsParams = getPropsParams(node.params);

      node.params.forEach((param) => {
        if (isDestructuredParameter(param)) {
          return;
        }

        const id = getIdFromParam(param);
        if (id && id.typeAnnotation && id.typeAnnotation.typeAnnotation) {
          const typeName = getTypeName(id.typeAnnotation.typeAnnotation);

          if (typeName && endsWithProps(typeName)) {
            const suggestedName = getSuggestedParameterName(
              typeName,
              node.params,
              param,
              propsParams,
            );

            if (id.name !== suggestedName) {
              const messageId =
                suggestedName === 'props'
                  ? 'usePropsParameterName'
                  : 'usePropsParameterNameWithPrefix';

              context.report({
                node: id,
                messageId,
                data: {
                  typeName,
                  suggestedName,
                },
                fix: (fixer) =>
                  buildParameterRenameFixes(fixer, node, id, suggestedName),
              });
            }
          }
        }
      });
    }

    /**
     * The member name a `this.<x>` access reads, whatever its spelling.
     *
     * Keying the check on the dot spelling alone left `this['settings']`
     * invisible, so the rename shipped and stranded it — the class no longer had
     * the member the getter reads (#1881). A computed access with a static
     * string is the SAME member as the dot form, and the fixer cannot rewrite it
     * either, so it has to count. `null` marks a genuinely dynamic key, which
     * names no member statically.
     */
    function staticMemberName(node: TSESTree.MemberExpression): string | null {
      if (!node.computed) {
        return node.property.type === AST_NODE_TYPES.Identifier
          ? node.property.name
          : null;
      }
      if (
        node.property.type === AST_NODE_TYPES.Literal &&
        typeof node.property.value === 'string'
      ) {
        return node.property.value;
      }
      if (
        node.property.type === AST_NODE_TYPES.TemplateLiteral &&
        node.property.expressions.length === 0 &&
        node.property.quasis.length === 1
      ) {
        return node.property.quasis[0].value.cooked;
      }
      return null;
    }

    // Determine whether renaming a constructor parameter property is unsafe to
    // autofix. A parameter property (`private readonly foo: T`) creates BOTH a
    // constructor-local binding and a `this.foo` class field, so a
    // declaration-only rename would leave dangling references: plain `foo`
    // usages inside the constructor (e.g. `super(foo)`) and `this.foo` accesses
    // anywhere in the class. Mirrors #1123 — when a rename cannot be applied
    // everywhere syntactically, emit no fix rather than corrupt the code.
    function parameterPropertyRenameIsUnsafe(
      classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
      name: string,
      declarationId: TSESTree.Identifier,
    ): boolean {
      let unsafe = false;

      const visit = (node: TSESTree.Node): void => {
        if (unsafe) {
          return;
        }

        if (
          node.type === AST_NODE_TYPES.MemberExpression &&
          node.object.type === AST_NODE_TYPES.ThisExpression &&
          staticMemberName(node) === name
        ) {
          unsafe = true;
          return;
        }

        if (
          node.type === AST_NODE_TYPES.Identifier &&
          node.name === name &&
          node !== declarationId
        ) {
          unsafe = true;
          return;
        }

        for (const key of Object.keys(node)) {
          if (key === 'parent') {
            continue;
          }
          const value = (node as unknown as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            for (const child of value) {
              if (ASTHelpers.isNode(child)) {
                visit(child);
              }
            }
          } else if (ASTHelpers.isNode(value)) {
            visit(value);
          }
        }
      };

      visit(classNode);
      return unsafe;
    }

    // Find the class (declaration or expression) that owns a method definition.
    function getEnclosingClass(
      node: TSESTree.MethodDefinition,
    ): TSESTree.ClassDeclaration | TSESTree.ClassExpression | null {
      const classBody = node.parent;
      if (classBody && classBody.type === AST_NODE_TYPES.ClassBody) {
        const classNode = classBody.parent;
        if (
          classNode &&
          (classNode.type === AST_NODE_TYPES.ClassDeclaration ||
            classNode.type === AST_NODE_TYPES.ClassExpression)
        ) {
          return classNode;
        }
      }
      return null;
    }

    // Check class method parameters (including constructors)
    function checkClassMethod(node: TSESTree.MethodDefinition): void {
      const method = node.value;
      const propsParams = getPropsParams(method.params);

      // When the enclosing class extends a base class, a constructor parameter
      // property (e.g. `private readonly fullProps: SubProps`) cannot be safely
      // renamed to `props`: the base class may already declare a private `props`
      // field/parameter-property, so the rename would create a TS2415 private-
      // field collision, and it would also leave `super(fullProps)` / `this.
      // fullProps` references dangling. The rule is purely syntactic and cannot
      // inspect the base class, so it defers to TypeScript correctness here and
      // does not report on parameter properties in subclasses (this repo prefers
      // false negatives over false positives).
      const enclosingClass = getEnclosingClass(node);
      const classExtendsBase = !!enclosingClass?.superClass;

      method.params.forEach((param) => {
        if (isDestructuredParameter(param)) {
          return;
        }

        if (
          classExtendsBase &&
          param.type === AST_NODE_TYPES.TSParameterProperty
        ) {
          return;
        }

        const id = getIdFromParam(param);
        if (id && id.typeAnnotation && id.typeAnnotation.typeAnnotation) {
          const typeName = getTypeName(id.typeAnnotation.typeAnnotation);

          if (typeName && endsWithProps(typeName)) {
            const suggestedName = getSuggestedParameterName(
              typeName,
              method.params,
              param,
              propsParams,
            );

            if (id.name !== suggestedName) {
              const messageId =
                suggestedName === 'props'
                  ? 'usePropsParameterName'
                  : 'usePropsParameterNameWithPrefix';

              context.report({
                node: id,
                messageId,
                data: {
                  typeName,
                  suggestedName,
                },
                fix: (fixer) => {
                  // A parameter-property rename touches both the parameter and
                  // the `this.<name>` field; refuse to autofix when the name is
                  // referenced elsewhere, since a declaration-only rename would
                  // leave dangling references.
                  if (
                    param.type === AST_NODE_TYPES.TSParameterProperty &&
                    enclosingClass &&
                    parameterPropertyRenameIsUnsafe(enclosingClass, id.name, id)
                  ) {
                    return null;
                  }
                  return buildParameterRenameFixes(
                    fixer,
                    method,
                    id,
                    suggestedName,
                  );
                },
              });
            }
          }
        }
      });
    }

    return {
      FunctionDeclaration: checkFunctionParams,
      FunctionExpression: checkFunctionParams,
      ArrowFunctionExpression: checkFunctionParams,
      TSMethodSignature: checkFunctionParams,
      MethodDefinition: checkClassMethod,
    };
  },
});
