import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferDestructuring';
type Options = [
  {
    object?: boolean;
    enforceForRenamedProperties?: boolean;
  },
];

const defaultOptions: [Options[0]] = [
  {
    object: true,
    enforceForRenamedProperties: false,
  },
];

/**
 * Names of every class declared anywhere in the file. A purely syntactic rule
 * cannot see an imported class, so same-file declarations are the entire
 * population a type annotation can be resolved against (#1619).
 */
function collectClassNames(sourceCode: TSESLint.SourceCode): Set<string> {
  const names = new Set<string>();
  const stack: TSESTree.Node[] = [sourceCode.ast];
  while (stack.length > 0) {
    const current = stack.pop() as TSESTree.Node;
    if (
      (current.type === AST_NODE_TYPES.ClassDeclaration ||
        current.type === AST_NODE_TYPES.ClassExpression) &&
      current.id
    ) {
      names.add(current.id.name);
    }
    for (const key of sourceCode.visitorKeys[current.type] ?? []) {
      const value = (current as unknown as Record<string, unknown>)[key];
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (child && typeof child === 'object' && 'type' in child) {
          stack.push(child as TSESTree.Node);
        }
      }
    }
  }
  return names;
}

/**
 * Reports whether an identifier's declared type names a class declared in this
 * file — the annotation-carried form of a class instance (`user: User` as a
 * parameter or an annotated variable), which the docs promise the same
 * exemption as a `new User()` initializer (#1619).
 */
function annotationNamesFileClass(
  identifier: TSESTree.Node | undefined,
  classNames: Set<string>,
): boolean {
  if (!identifier || identifier.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const annotation = identifier.typeAnnotation?.typeAnnotation;
  return (
    annotation?.type === AST_NODE_TYPES.TSTypeReference &&
    annotation.typeName.type === AST_NODE_TYPES.Identifier &&
    classNames.has(annotation.typeName.name)
  );
}

const fileClassNames = new WeakMap<TSESTree.Program, Set<string>>();

function classNamesFor(context: any): Set<string> {
  const sourceCode = context.getSourceCode() as TSESLint.SourceCode;
  const cached = fileClassNames.get(sourceCode.ast);
  if (cached) {
    return cached;
  }
  const names = collectClassNames(sourceCode);
  fileClassNames.set(sourceCode.ast, names);
  return names;
}

function isClassInstance(node: TSESTree.Node, context: any): boolean {
  // Check if node is a MemberExpression
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    const object = node.object;

    // If object is a NewExpression, it's a class instance
    if (object.type === AST_NODE_TYPES.NewExpression) {
      return true;
    }

    // If object is an identifier, check if it refers to a class instance
    if (object.type === AST_NODE_TYPES.Identifier) {
      const variable = object.name;
      const scope = context.getScope();
      const ref = scope.references.find(
        (ref: any) => ref.identifier.name === variable,
      );
      const def = ref?.resolved?.defs[0];

      if (def?.node.type === AST_NODE_TYPES.VariableDeclarator) {
        const init = def.node.init;
        return (
          init?.type === AST_NODE_TYPES.NewExpression ||
          // `const user: User = getUser();` — the annotation, not the
          // initializer, is what marks the value as a class instance.
          annotationNamesFileClass(def.node.id, classNamesFor(context))
        );
      }

      // `function greet(user: User)` — a parameter typed with a same-file
      // class is a class instance the initializer-based check cannot see.
      if (
        def?.type === 'Parameter' &&
        annotationNamesFileClass(def.name, classNamesFor(context))
      ) {
        return true;
      }

      // Check if the identifier refers to a class (not an instance)
      if (def?.node.type === AST_NODE_TYPES.ClassDeclaration) {
        return false;
      }
    }

    // Recursively check if parent object is a class instance
    if (object.type === AST_NODE_TYPES.MemberExpression) {
      return isClassInstance(object, context);
    }
  }
  return false;
}

function isStaticClassMember(node: TSESTree.Node, context: any): boolean {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    const object = node.object;
    if (object.type === AST_NODE_TYPES.Identifier) {
      const variable = object.name;
      const scope = context.getScope();
      const ref = scope.references.find(
        (ref: any) => ref.identifier.name === variable,
      );
      return (
        ref?.resolved?.defs[0]?.node.type === AST_NODE_TYPES.ClassDeclaration
      );
    }
  }
  return false;
}

/**
 * Extracts the literal name a MemberExpression's property spells, when that
 * name is comparable to a binding identifier (an Identifier's own name, or a
 * string Literal's value). A non-string literal (e.g. `obj[0]`) can never
 * equal an identifier name, so it is excluded here rather than at every
 * caller.
 */
function getComparablePropertyName(propertyNode: TSESTree.Node): string | null {
  if (propertyNode.type === AST_NODE_TYPES.Identifier) {
    return propertyNode.name;
  }
  if (
    propertyNode.type === AST_NODE_TYPES.Literal &&
    typeof propertyNode.value === 'string'
  ) {
    return propertyNode.value;
  }
  return null;
}

/**
 * Check if the property name matches the variable name in an assignment
 */
function isMatchingPropertyName(
  propertyNode: TSESTree.Node,
  variableName: string,
): boolean {
  return getComparablePropertyName(propertyNode) === variableName;
}

/**
 * Strips underscores and lowercases a name so a SCREAMING_SNAKE_CASE binding
 * compares equal to the camelCase property it reads (`MY_VALUE` vs
 * `myValue`), not merely a pure case shift (`FOO` vs `foo`). A rename tool
 * such as `global-const-style` reshapes only the BINDING to fit a naming
 * convention; it never touches the property expression on the right-hand
 * side, so the two spellings diverge in casing and word separators without
 * the assignment becoming a genuine rename of what the binding refers to.
 */
function normalizeForLooseNameMatch(name: string): string {
  return name.replace(/_/g, '').toLowerCase();
}

/**
 * Case/underscore-insensitive counterpart to `isMatchingPropertyName`, used
 * only where `enforceForRenamedProperties` is off. The default gate must
 * still recognize `const FOO = obj.foo;` as the same property access it
 * recognizes for `const foo = obj.foo;` (#2316), while a genuinely different
 * name (`TOTAL` vs `count`) keeps failing the match.
 */
function isMatchingPropertyNameIgnoringCase(
  propertyNode: TSESTree.Node,
  variableName: string,
): boolean {
  const propertyName = getComparablePropertyName(propertyNode);
  return (
    propertyName !== null &&
    normalizeForLooseNameMatch(propertyName) ===
      normalizeForLooseNameMatch(variableName)
  );
}

/**
 * Get the property text for destructuring
 */
function getPropertyText(
  property: TSESTree.Expression | TSESTree.PrivateIdentifier,
  computed: boolean,
  sourceCode: any,
): string {
  if (computed) {
    return sourceCode.getText(property);
  }

  if (property.type === AST_NODE_TYPES.Identifier) {
    return property.name;
  }

  if (property.type === AST_NODE_TYPES.Literal) {
    return String(property.value);
  }

  // For any other type, use the source text
  return sourceCode.getText(property);
}

export const preferDestructuringNoClass = createRule<Options, MessageIds>({
  name: 'prefer-destructuring-no-class',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce destructuring when accessing object properties, except for class instances',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          object: {
            type: 'boolean',
            default: true,
          },
          enforceForRenamedProperties: {
            type: 'boolean',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferDestructuring:
        'Property "{{property}}" from "{{object}}" is assigned via dot access{{targetNote}}. Destructure the property so the dependency is declared once and stays aligned with the source object. Use destructuring{{renamingHint}} (e.g., {{example}}).',
    },
  },
  defaultOptions,
  create(context) {
    const options = {
      object: defaultOptions[0].object,
      enforceForRenamedProperties:
        defaultOptions[0].enforceForRenamedProperties,
      ...context.options[0],
    };
    const sourceCode = context.getSourceCode();

    /**
     * Check if we're inside a class method
     */
    function isInsideClassMethod(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;

      // Traverse up the AST to find a MethodDefinition
      while (current && current.parent) {
        current = current.parent;
        if (current.type === AST_NODE_TYPES.MethodDefinition) {
          return true;
        }
      }

      return false;
    }

    function isIdentifierTarget(
      node: TSESTree.Node,
    ): node is TSESTree.Identifier {
      return node.type === AST_NODE_TYPES.Identifier;
    }

    function isSkippedClassMemberAccess(
      memberExpression: TSESTree.MemberExpression,
    ): boolean {
      return (
        isClassInstance(memberExpression, context) ||
        isStaticClassMember(memberExpression, context)
      );
    }

    function isThisMemberInClassMethod(
      memberExpression: TSESTree.MemberExpression,
    ): boolean {
      return (
        memberExpression.object.type === AST_NODE_TYPES.ThisExpression &&
        isInsideClassMethod(memberExpression)
      );
    }

    function findEnclosingMethodDefinition(
      node: TSESTree.Node,
    ): TSESTree.MethodDefinition | null {
      let current: TSESTree.Node | undefined = node;

      while (current) {
        if (current.type === AST_NODE_TYPES.MethodDefinition) {
          return current;
        }

        current = current.parent ?? undefined;
      }

      return null;
    }

    function isInsideConstructorBody(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;

      while (current) {
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          const enclosingMethod = findEnclosingMethodDefinition(current);
          return (
            !!enclosingMethod &&
            enclosingMethod.kind === 'constructor' &&
            enclosingMethod.value === current
          );
        }

        current = current.parent ?? undefined;
      }

      return false;
    }

    function isPrivateIdentifierProperty(
      property: TSESTree.MemberExpression['property'],
    ): property is TSESTree.PrivateIdentifier {
      return property.type === AST_NODE_TYPES.PrivateIdentifier;
    }

    function canDestructureObjectProperty(
      memberExpression: TSESTree.MemberExpression,
      identifier: TSESTree.Identifier,
    ): boolean {
      if (isPrivateIdentifierProperty(memberExpression.property)) {
        return false;
      }

      // `super.x` has no destructurable form: `const { x } = super;` is a
      // syntax error, since `super` must be followed by a call or a member
      // access. Reachable for any binding whose name matches the property in
      // any casing, so the guard belongs here rather than at one call site.
      if (memberExpression.object.type === AST_NODE_TYPES.Super) {
        return false;
      }

      if (!options.object) {
        return false;
      }

      if (options.enforceForRenamedProperties) {
        return true;
      }

      return isMatchingPropertyNameIgnoringCase(
        memberExpression.property,
        identifier.name,
      );
    }

    function getPatternKeyText(
      memberExpression: TSESTree.MemberExpression,
      propertyText: string,
    ): string {
      if (memberExpression.computed) {
        return `[${sourceCode.getText(memberExpression.property)}]`;
      }

      return propertyText;
    }

    function getDestructuringBindingText(
      memberExpression: TSESTree.MemberExpression,
      propertyText: string,
      targetName: string,
    ): string | null {
      if (isPrivateIdentifierProperty(memberExpression.property)) {
        return null;
      }

      const patternKeyText = getPatternKeyText(memberExpression, propertyText);

      // Alias whenever the destructured key would not itself spell the
      // target binding: a computed key never can, and any literal spelling
      // mismatch — an explicit rename under `enforceForRenamedProperties`,
      // or a case/underscore-only difference the default gate now tolerates
      // (#2316) — must keep `key: target`, or the emitted destructuring
      // binds the wrong name (or, for `const { FOO } = OBJ;` where the
      // property is `foo`, no name at all).
      if (
        memberExpression.computed ||
        !isMatchingPropertyName(memberExpression.property, targetName)
      ) {
        return `${patternKeyText}: ${targetName}`;
      }

      return patternKeyText;
    }

    /**
     * Check if destructuring should be used for this node
     */
    function shouldUseDestructuring(
      node: TSESTree.MemberExpression,
      leftNode: TSESTree.Node,
    ): boolean {
      if (!isIdentifierTarget(leftNode)) {
        return false;
      }

      return (
        !isSkippedClassMemberAccess(node) &&
        !isThisMemberInClassMethod(node) &&
        canDestructureObjectProperty(node, leftNode)
      );
    }

    /**
     * Extracts the property name from a MemberExpression when it can be safely compared.
     */
    function getMemberExpressionPropertyName(
      memberExpression: TSESTree.MemberExpression,
    ): string | null {
      if (isPrivateIdentifierProperty(memberExpression.property)) {
        return null;
      }

      if (!memberExpression.computed) {
        if (memberExpression.property.type === AST_NODE_TYPES.Identifier) {
          return memberExpression.property.name;
        }

        return null;
      }

      if (
        memberExpression.property.type === AST_NODE_TYPES.Literal &&
        typeof memberExpression.property.value === 'string'
      ) {
        return memberExpression.property.value;
      }

      return null;
    }

    /**
     * Look up a variable by name within a scope.
     */
    function findVariableInScope(
      scope: TSESLint.Scope.Scope | null,
      name: string,
    ): TSESLint.Scope.Variable | undefined {
      return scope?.variables.find((variable) => variable.name === name);
    }

    /**
     * Check whether a variable definition originates from a parameter.
     */
    function isParameterDefinition(
      variable: TSESLint.Scope.Variable | undefined,
    ): boolean {
      if (!variable || !Array.isArray(variable.defs)) {
        return false;
      }

      return variable.defs.some(
        (definition) => definition.type === 'Parameter',
      );
    }

    /**
     * Determine whether an identifier refers to a function or method parameter.
     */
    function isFunctionParameter(identifier: TSESTree.Identifier): boolean {
      let scope: TSESLint.Scope.Scope | null = context.getScope();

      while (scope) {
        const variable = findVariableInScope(scope, identifier.name);
        if (variable) {
          return isParameterDefinition(variable);
        }

        scope = scope.upper;
      }

      return false;
    }

    function buildReportDetails(
      memberExpr: TSESTree.MemberExpression,
      targetName: string | null,
      examplePrefix: string,
      exampleSuffix: string,
    ) {
      const objectText = sourceCode.getText(memberExpr.object);
      const propertyText = getPropertyText(
        memberExpr.property,
        memberExpr.computed,
        sourceCode,
      );
      // Tracks whether the FIXED destructuring needs an alias — the same
      // question `getDestructuringBindingText` answers — so the message
      // wording ("with renaming", the target-name note) stays truthful for
      // a case/underscore-only spelling difference the default gate now
      // reports (#2316), not only for an explicit
      // `enforceForRenamedProperties` rename.
      const usesRenaming =
        !!targetName &&
        !isMatchingPropertyName(memberExpr.property, targetName);
      const aliasName = targetName ?? propertyText;
      const patternKeyText = getPatternKeyText(memberExpr, propertyText);
      const destructuringBinding =
        getDestructuringBindingText(memberExpr, propertyText, aliasName) ??
        patternKeyText;

      return {
        propertyText,
        objectText,
        destructuringBinding,
        data: {
          property: propertyText,
          object: objectText,
          targetNote: usesRenaming && targetName ? ` to "${targetName}"` : '',
          renamingHint: usesRenaming ? ' with renaming' : '',
          example: usesRenaming
            ? `${examplePrefix}{ ${destructuringBinding} } = ${objectText}${exampleSuffix}`
            : `${examplePrefix}{ ${destructuringBinding} } = ${objectText}${exampleSuffix}`,
        },
      };
    }

    function generateVariableDeclaratorFix(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.VariableDeclarator,
      propertyText: string,
      objectText: string,
      memberExpr: TSESTree.MemberExpression,
    ) {
      const parentNode = node.parent;
      if (
        !parentNode ||
        parentNode.type !== AST_NODE_TYPES.VariableDeclaration
      ) {
        return null;
      }

      if (parentNode.declarations.length > 1) {
        return null;
      }

      const kind = parentNode.kind;
      if (node.id.type !== AST_NODE_TYPES.Identifier) {
        return null;
      }

      // The fix re-emits the declaration as `kind { binding } = object`, which has
      // nowhere to carry an explicit annotation on the binding. Relocating it as
      // `const { alpha }: { alpha: string } = obj` would assert something different
      // (a structural constraint on the source object rather than the variable's
      // declared type) and can shift inference, so withhold the fix and report only.
      if (node.id.typeAnnotation) {
        return null;
      }

      const destructuringBinding = getDestructuringBindingText(
        memberExpr,
        propertyText,
        node.id.name,
      );

      if (!destructuringBinding) {
        return null;
      }

      return fixer.replaceText(
        parentNode,
        `${kind} { ${destructuringBinding} } = ${objectText};`,
      );
    }

    function generateAssignmentExpressionFix(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.AssignmentExpression,
      propertyText: string,
      objectText: string,
      memberExpr: TSESTree.MemberExpression,
    ) {
      if (node.left.type !== AST_NODE_TYPES.Identifier) {
        return null;
      }

      const destructuringBinding = getDestructuringBindingText(
        memberExpr,
        propertyText,
        node.left.name,
      );

      if (!destructuringBinding) {
        return null;
      }

      return fixer.replaceText(
        node,
        `({ ${destructuringBinding} } = ${objectText})`,
      );
    }

    /**
     * Report assignments that copy properties from parameter objects to class fields.
     * These are reported without a fixer to avoid changing function signatures.
     */
    function handleClassPropertyAssignment(
      node: TSESTree.AssignmentExpression & {
        right: TSESTree.MemberExpression;
      },
    ): void {
      // Caller ensures node.right is a MemberExpression.
      if (
        !options.object ||
        node.left.type !== AST_NODE_TYPES.MemberExpression ||
        node.left.object.type !== AST_NODE_TYPES.ThisExpression
      ) {
        return;
      }

      if (!isInsideConstructorBody(node)) {
        return;
      }

      const rightObject = node.right.object;

      if (
        rightObject.type !== AST_NODE_TYPES.Identifier ||
        !isFunctionParameter(rightObject)
      ) {
        return;
      }

      const leftPropertyName = getMemberExpressionPropertyName(node.left);
      const rightPropertyName = getMemberExpressionPropertyName(node.right);

      if (!leftPropertyName || !rightPropertyName) {
        return;
      }

      if (
        !options.enforceForRenamedProperties &&
        leftPropertyName !== rightPropertyName
      ) {
        return;
      }

      if (
        isClassInstance(node.right, context) ||
        isStaticClassMember(node.right, context)
      ) {
        return;
      }

      const { data } = buildReportDetails(
        node.right,
        leftPropertyName,
        '(',
        ')',
      );

      // No fixer here because destructuring parameters changes the function signature and must stay manual.
      context.report({
        node,
        messageId: 'preferDestructuring',
        data,
      });
    }

    return {
      VariableDeclarator(node) {
        // Skip if variable is declared without assignment or if init is not a MemberExpression
        if (!node.init) return;
        if (node.init.type !== AST_NODE_TYPES.MemberExpression) return;

        const memberInit = node.init;
        if (!shouldUseDestructuring(memberInit, node.id)) {
          return;
        }

        const targetName =
          node.id.type === AST_NODE_TYPES.Identifier ? node.id.name : null;
        const { propertyText, objectText, data } = buildReportDetails(
          memberInit,
          targetName,
          `${
            node.parent?.type === AST_NODE_TYPES.VariableDeclaration
              ? node.parent.kind
              : 'const'
          } `,
          ';',
        );

        context.report({
          node,
          messageId: 'preferDestructuring',
          data,
          fix(fixer) {
            return generateVariableDeclaratorFix(
              fixer,
              node,
              propertyText,
              objectText,
              memberInit,
            );
          },
        });
      },

      AssignmentExpression(node) {
        if (
          node.operator !== '=' ||
          node.right.type !== AST_NODE_TYPES.MemberExpression
        ) {
          return;
        }

        const memberRight = node.right;
        if (shouldUseDestructuring(memberRight, node.left)) {
          const targetName =
            node.left.type === AST_NODE_TYPES.Identifier
              ? node.left.name
              : null;
          const { propertyText, objectText, data } = buildReportDetails(
            memberRight,
            targetName,
            '(',
            ')',
          );

          context.report({
            node,
            messageId: 'preferDestructuring',
            data,
            fix(fixer) {
              return generateAssignmentExpressionFix(
                fixer,
                node,
                propertyText,
                objectText,
                memberRight,
              );
            },
          });
          return;
        }

        handleClassPropertyAssignment(
          node as TSESTree.AssignmentExpression & {
            right: TSESTree.MemberExpression;
          },
        );
      },
    };
  },
});
