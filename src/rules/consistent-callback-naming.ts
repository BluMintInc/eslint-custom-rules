/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';

// The "handle" prefix the rule targets is the verb-phrase pattern
// `handle<Something>` — six letters immediately followed by a capitalized word
// (handleClick, handleSubmit, handleFormSubmit). When "handle" is followed by a
// lowercase letter the six letters are part of an ordinary word, not the prefix:
// the past participle "handled" (and derived names like "handledFingerprints"),
// the noun "handler(s)", "handles", "handling", the adjective "handleable". Those
// are plain identifiers, so flagging them — and worse, autofix-stripping the
// leading "handle" to leave nonsense like `d`/`dFingerprints` — silently corrupts
// unrelated code (Bug #1301). A bare "handle" is likewise a whole word, not a
// prefix.
function hasHandlePrefix(name: string): boolean {
  return /^handle[A-Z]/.test(name);
}

function stripHandlePrefix(name: string): string {
  return name.slice(6).charAt(0).toLowerCase() + name.slice(7);
}

// Stripping the prefix can land the rename squarely on a keyword:
// `handleDelete` -> `delete`, `handleNew` -> `new`, `handleReturn` -> `return`,
// `handleTrue` -> `true`. None of those is a legal binding name, so a fix that
// emits one turns a working file into a parse error — `const delete = fn` and
// `const { delete } = api` are both SyntaxErrors (Bug #1719). The set covers the
// ES reserved words, the strict-mode/module reserved words (the linted codebase
// is entirely ES modules, where `await` and `implements` et al. are reserved
// too) and the three keyword literals. The guard is applied at every emission
// site, including member names where a keyword happens to be legal
// (`class C { delete() {} }`): the rule cannot see whether that member is later
// destructured into a binding, and a fixer that is safe only sometimes is not
// safe.
const RESERVED_WORDS = new Set([
  'arguments',
  'await',
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
  'eval',
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
]);

function isEmittableName(name: string): boolean {
  return name.length > 0 && !RESERVED_WORDS.has(name);
}

function isExportedDeclaration(node: TSESTree.Node | undefined): boolean {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.ExportNamedDeclaration ||
      current.type === AST_NODE_TYPES.ExportDefaultDeclaration
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

// An object literal that is exported or returned is a value other modules read
// by member name (`api.handleOpenThread`, `const { handleOpenThread } = useX()`).
// Renaming a member of it edits one end of a contract whose readers live in
// files a single-file fixer cannot even see, so the violation is reported
// without a fix — the same reasoning that withholds the JSX prop rename.
function isApiSurfaceValue(node: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    switch (current.type) {
      case AST_NODE_TYPES.ExportNamedDeclaration:
      case AST_NODE_TYPES.ExportDefaultDeclaration:
      case AST_NODE_TYPES.ReturnStatement:
        return true;
      case AST_NODE_TYPES.ArrowFunctionExpression:
        // A concise body is a return with no `return` keyword.
        return current.body === child;
      case AST_NODE_TYPES.BlockStatement:
      case AST_NODE_TYPES.ClassBody:
      case AST_NODE_TYPES.FunctionDeclaration:
      case AST_NODE_TYPES.FunctionExpression:
      case AST_NODE_TYPES.Program:
        return false;
      default:
        child = current;
        current = current.parent;
    }
  }
  return false;
}

/** The member names already declared alongside `node`, keyed by identifier. */
function siblingMemberNames(node: TSESTree.Node | undefined): Set<string> {
  const names = new Set<string>();
  const record = (member: TSESTree.Node) => {
    const key = (member as { computed?: boolean; key?: TSESTree.Node }).key;
    if (
      !(member as { computed?: boolean }).computed &&
      key?.type === AST_NODE_TYPES.Identifier
    ) {
      names.add(key.name);
    }
  };
  if (node?.type === AST_NODE_TYPES.ObjectExpression) {
    node.properties.forEach(record);
  } else if (node?.type === AST_NODE_TYPES.ClassBody) {
    node.body.forEach(record);
  }
  return names;
}

/**
 * Every member name the file reads by name — `obj.handleClick`,
 * `obj['handleClick']`, `const { handleClick } = obj`.
 *
 * Renaming an object literal's key has to move every one of those reads with
 * it, and a fixer scoped to the literal moves none of them: `const o = { click:
 * fn }; o.handleClick()` type-checks as a missing property and throws at
 * runtime. The presence of any reader therefore withholds the rewrite. The walk
 * is over the whole program because a reader may appear anywhere, including
 * before the literal.
 */
function collectMemberReads(
  program: TSESTree.Program,
  visitorKeys: Readonly<Record<string, readonly string[] | undefined>>,
): Set<string> {
  const names = new Set<string>();
  const stack: TSESTree.Node[] = [program];
  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(push);
    } else if (value && typeof value === 'object' && 'type' in value) {
      stack.push(value as TSESTree.Node);
    }
  };

  while (stack.length > 0) {
    const node = stack.pop() as TSESTree.Node;
    if (node.type === AST_NODE_TYPES.MemberExpression) {
      if (!node.computed && node.property.type === AST_NODE_TYPES.Identifier) {
        names.add(node.property.name);
      } else if (
        node.property.type === AST_NODE_TYPES.Literal &&
        typeof node.property.value === 'string'
      ) {
        names.add(node.property.value);
      }
    }
    // Read directly off the pattern rather than through `parent`, which is not
    // guaranteed to be assigned on nodes the traversal has not reached.
    if (node.type === AST_NODE_TYPES.ObjectPattern) {
      for (const property of node.properties) {
        if (
          property.type === AST_NODE_TYPES.Property &&
          !property.computed &&
          property.key.type === AST_NODE_TYPES.Identifier
        ) {
          names.add(property.key.name);
        }
      }
    }
    for (const key of visitorKeys[node.type] ?? []) {
      push((node as unknown as Record<string, unknown>)[key]);
    }
  }
  return names;
}

export = createRule<[], 'callbackPropPrefix' | 'callbackFunctionPrefix'>({
  name: 'consistent-callback-naming',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce consistent naming conventions for callback props and functions',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      callbackPropPrefix:
        'Callback prop "{{propName}}" is a function but lacks the "on" prefix. ' +
        'Consistent "on" prefixes signal event handlers to consumers and distinguish callbacks from data props. ' +
        'Rename to "on{{eventName}}" here, in the props type that declares it, and in every reader of that prop.',
      callbackFunctionPrefix:
        'Function "{{functionName}}" uses the "handle" prefix. ' +
        'The "handle" prefix is redundant and less descriptive than action-oriented verb phrases. ' +
        'Rename using a descriptive verb (e.g., click instead of handleClick).',
    },
  },
  defaultOptions: [],
  create(context) {
    const parserServices = context.parserServices;

    // This rule is type-aware, but a single eslint invocation routinely mixes
    // in-project files with out-of-project ones (plain-Node `.mjs` scripts,
    // config files, etc.) that the TS `project` never parses. Throwing here
    // aborts rule loading for the ENTIRE run — one out-of-project file in argv
    // kills diagnostics for every file (Bug #1302). Degrade gracefully instead:
    // skip files without type information with a no-op visitor, matching how
    // @typescript-eslint rules tolerate missing parser services per file.
    if (!parserServices?.program || !parserServices?.esTreeNodeToTSNodeMap) {
      return {};
    }

    const checker = parserServices.program.getTypeChecker();

    function isReactComponentType(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);
      const symbol = type.getSymbol();

      if (!symbol) return false;

      // Check if type is a React component type
      const isComponent = symbol.declarations?.some((decl) => {
        const declaration = decl as
          | ts.ClassDeclaration
          | ts.InterfaceDeclaration
          | ts.TypeAliasDeclaration
          | ts.FunctionDeclaration;

        // Check for JSX element types
        if (ts.isTypeAliasDeclaration(declaration)) {
          const typeText = declaration.type.getText();
          return (
            typeText.includes('JSX.Element') ||
            typeText.includes('ReactElement')
          );
        }

        // Check for class/interface component patterns
        if (
          ts.isClassDeclaration(declaration) ||
          ts.isInterfaceDeclaration(declaration)
        ) {
          const name = declaration.name?.text ?? '';
          return (
            name.includes('Component') ||
            name.includes('Element') ||
            name.includes('FC') ||
            name.includes('FunctionComponent')
          );
        }

        return false;
      });

      // Check if the type itself is a component or element type
      const typeString = checker.typeToString(type);
      const isComponentType =
        typeString.includes('JSX.Element') ||
        typeString.includes('ReactElement') ||
        typeString.includes('Component') ||
        typeString.includes('FC');

      return isComponent || isComponentType;
    }

    function isPascalCase(str: string): boolean {
      return /^[A-Z][a-zA-Z0-9]*$/.test(str);
    }

    function isFunctionType(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);

      return type.getCallSignatures().length > 0;
    }

    // A union counts as "mixed" when it pairs a callable member with a
    // non-callable one (e.g. `Validate<T> | readonly T[]`). `undefined`/`null`
    // members are ignored so plain optional callbacks (`(() => void) | undefined`)
    // remain pure functions.
    function isMixedFunctionUnion(type: ts.Type | undefined): boolean {
      if (!type || !type.isUnion()) {
        return false;
      }
      const members = type.types.filter(
        (member) =>
          !(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
      );
      const hasFunctionMember = members.some(
        (member) => member.getCallSignatures().length > 0,
      );
      const hasNonFunctionMember = members.some(
        (member) => member.getCallSignatures().length === 0,
      );
      return hasFunctionMember && hasNonFunctionMember;
    }

    // The `on` prefix is only meaningful for props that are *exclusively*
    // callbacks. A prop typed `Validate<T> | readonly T[]` is a configuration
    // prop that merely accepts a function as one option, so it must be skipped.
    // The passed value may be a plain function even when the prop legitimately
    // accepts non-function values, so the prop's contextual (declared) type is
    // inspected alongside the value's own type.
    function acceptsNonFunctionValue(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const valueType = checker.getTypeAtLocation(tsNode);
      const contextualType = checker.getContextualType(tsNode as ts.Expression);
      return (
        isMixedFunctionUnion(valueType) || isMixedFunctionUnion(contextualType)
      );
    }

    function isRenderFunction(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);
      const signatures = type.getCallSignatures();

      if (signatures.length === 0) return false;

      const isReactType = (t: ts.Type): boolean => {
        const typeStr = checker.typeToString(t);
        return (
          typeStr.includes('JSX.Element') ||
          typeStr.includes('ReactElement') ||
          typeStr.includes('ReactNode')
        );
      };

      return signatures.some((signature) => {
        const returnType = checker.getReturnTypeOfSignature(signature);

        if (isReactType(returnType)) return true;

        if (returnType.isUnion()) {
          return returnType.types.some((t) => isReactType(t));
        }

        return false;
      });
    }

    // An event-handler callback's return value is discarded: `void`, `undefined`,
    // `never`, or a `Promise` thereof. Anything else is a value the caller
    // consumes, which marks the prop as an accessor rather than a handler.
    function returnsVoidLike(type: ts.Type): boolean {
      if (type.isUnion()) {
        return type.types.every((member) => returnsVoidLike(member));
      }
      if (
        type.flags &
        (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never)
      ) {
        return true;
      }
      // `Promise<void>` (async handlers) unwraps to its resolved type.
      if (type.getSymbol()?.getName() === 'Promise') {
        const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
        if (typeArgs.length === 1) {
          return returnsVoidLike(typeArgs[0]);
        }
      }
      return false;
    }

    // A function-typed prop is an accessor (getRowId, valueGetter, filterOptions,
    // a per-item props deriver, ...) rather than an event handler when its call
    // signature returns a value the component consumes instead of a discarded
    // `void`. The `on` prefix signals event handlers, so accessors are exempt.
    // The prop's declared (contextual) type is authoritative because the passed
    // value's inferred return type can be wider than the prop contract.
    function isValueAccessor(node: TSESTree.Node): boolean {
      const tsNode = parserServices!.esTreeNodeToTSNodeMap.get(node);
      const contextualType = checker.getContextualType(tsNode as ts.Expression);
      const type = contextualType ?? checker.getTypeAtLocation(tsNode);

      const members = type.isUnion() ? type.types : [type];
      const signatures = members.flatMap((member) =>
        member.getCallSignatures(),
      );
      if (signatures.length === 0) {
        return false;
      }

      // Exempt only when every call signature returns a consumed value; a mix
      // that includes a void-returning signature keeps the handler semantics.
      return signatures.every(
        (signature) =>
          !returnsVoidLike(checker.getReturnTypeOfSignature(signature)),
      );
    }

    // Built once per file, and only when an object literal member is actually a
    // rename candidate.
    let memberReads: Set<string> | undefined;
    function isReadByName(name: string): boolean {
      const sourceCode = context.getSourceCode();
      memberReads ??= collectMemberReads(
        sourceCode.ast,
        sourceCode.visitorKeys as Readonly<
          Record<string, readonly string[] | undefined>
        >,
      );
      return memberReads.has(name);
    }

    /**
     * The variable a pattern identifier binds. `getDeclaredVariables` is
     * authoritative — it is asked of the declaring ancestor (the
     * `VariableDeclaration`, the function owning a destructured parameter, the
     * `CatchClause`) rather than reconstructed by crawling scopes by name,
     * which cannot tell two same-named bindings apart.
     */
    function findPatternVariable(
      id: TSESTree.Identifier,
    ): TSESLint.Scope.Variable | undefined {
      let current: TSESTree.Node | undefined = id.parent;
      while (current) {
        const match = context
          .getDeclaredVariables(current)
          .find((variable) => variable.identifiers.includes(id));
        if (match) {
          return match;
        }
        current = current.parent;
      }
      return undefined;
    }

    // Renaming a binding that leaves the module — `export const { a: handleX }`,
    // or `export { handleX }` — breaks importers the fixer cannot edit.
    function isExportedBinding(variable: TSESLint.Scope.Variable): boolean {
      const namedByExportSpecifier = (id: TSESTree.Node) =>
        id.parent?.type === AST_NODE_TYPES.ExportSpecifier;
      return (
        variable.references.some((ref) =>
          namedByExportSpecifier(ref.identifier),
        ) ||
        variable.identifiers.some(namedByExportSpecifier) ||
        variable.defs.some((def) => isExportedDeclaration(def.node))
      );
    }

    // A rename that collides with a name already visible where the binding (or
    // any of its references) lives silently re-points those references at the
    // other declaration.
    function isNameTaken(
      variable: TSESLint.Scope.Variable,
      newName: string,
    ): boolean {
      let scope: TSESLint.Scope.Scope | null = variable.scope;
      while (scope) {
        if (scope.set.has(newName)) {
          return true;
        }
        scope = scope.upper;
      }
      return variable.scope.childScopes.some((child) => child.set.has(newName));
    }

    /**
     * A `Property` inside an `ObjectPattern`. Its key names a property of the
     * object being destructured — someone else's API (`const { handleDelete: fn }
     * = useMessage('handleDelete')` reads Stream Chat's own member) — so
     * rewriting the key changes WHICH property is read, strands every reader of
     * the old name, and can emit a keyword that is not a legal binding
     * (Bug #1719). The key is therefore never reported and never rewritten. The
     * only name the file owns here is the local binding, so that is what the
     * report targets when it too carries the prefix.
     */
    function reportDestructuredBinding(node: TSESTree.Property): void {
      // A shorthand binding is a single token that is simultaneously the
      // foreign property name and the local name: there is no name the file
      // chose independently, and no in-place edit can change one without the
      // other. Left alone entirely rather than reported with no remedy.
      if (node.shorthand || node.value.type !== AST_NODE_TYPES.Identifier) {
        return;
      }

      const binding = node.value;
      if (!hasHandlePrefix(binding.name)) {
        return;
      }

      const newName = stripHandlePrefix(binding.name);
      const variable = findPatternVariable(binding);
      const canFix =
        isEmittableName(newName) &&
        !!variable &&
        !isExportedBinding(variable) &&
        !isNameTaken(variable, newName);

      context.report({
        node: binding,
        messageId: 'callbackFunctionPrefix',
        data: { functionName: binding.name },
        fix(fixer) {
          if (!canFix || !variable) {
            return null;
          }
          // Every occurrence in one edit: a rename that reaches the declaration
          // but not its readers is worse than no rename at all.
          const targets = new Set<TSESTree.Node>([binding]);
          for (const ref of variable.references) {
            targets.add(ref.identifier);
          }
          return [...targets].map((id) => fixer.replaceText(id, newName));
        },
      });
    }

    return {
      // Check JSX attributes for callback props
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (
          node.value?.type === 'JSXExpressionContainer' &&
          node.value.expression.type === 'Identifier'
        ) {
          const propName =
            node.name.type === 'JSXIdentifier' ? node.name.name : undefined;

          // Skip React's built-in event handlers
          if (propName?.match(/^on[A-Z]/)) {
            return;
          }

          // Skip PascalCase props as they typically represent components or component-related props
          if (propName && isPascalCase(propName)) {
            return;
          }

          // Skip common non-callback props
          const commonNonCallbackProps = new Set([
            'theme', // MUI ThemeProvider theme prop
            'style', // React style prop
            'className', // React className prop
            'ref', // React ref prop
            'key', // React key prop
            'component', // MUI component prop
            'as', // Styled-components/Emotion as prop
            'sx', // MUI sx prop
            'css', // Emotion css prop
          ]);
          if (propName && commonNonCallbackProps.has(propName)) {
            return;
          }

          // Skip props on components that commonly use function props that aren't callbacks
          const parentName = (node.parent as TSESTree.JSXOpeningElement)?.name;
          const componentName =
            parentName?.type === 'JSXIdentifier' ? parentName.name : undefined;
          const componentsWithFunctionProps = new Set([
            'ThemeProvider', // MUI ThemeProvider
            'Transition', // React Transition Group
            'CSSTransition', // React Transition Group
            'TransitionGroup', // React Transition Group
            'SwitchTransition', // React Transition Group
          ]);
          if (componentName && componentsWithFunctionProps.has(componentName)) {
            return;
          }

          // Check if the value is a function type and not a React component
          if (
            isFunctionType(node.value.expression) &&
            propName &&
            !propName.startsWith('on') &&
            !propName.startsWith('render') &&
            !acceptsNonFunctionValue(node.value.expression) &&
            !isValueAccessor(node.value.expression) &&
            !isRenderFunction(node.value.expression) &&
            !isReactComponentType(node.value.expression)
          ) {
            const eventName =
              propName.charAt(0).toUpperCase() + propName.slice(1);
            // Reported without an autofix (Bug #1522). A JSX attribute name is
            // one end of a props contract: the other end is the declaration
            // that binds the name — a props `type`/`interface`, a
            // `JSX.IntrinsicElements` augmentation for host elements — plus
            // every reader of that member (`props.validate`, destructuring) and
            // every other call site of the component. Rewriting only the
            // attribute yields TS2322, and renaming the local declaration
            // as well merely relocates the break: readers in the same file fail
            // with TS2551 and call sites in other files (which a single-file
            // fixer cannot see, let alone edit atomically) fail with TS2322.
            // No subset of the rename is safe to apply in isolation, so the
            // report carries the full instruction instead of a broken fix.
            context.report({
              node,
              messageId: 'callbackPropPrefix',
              data: {
                propName,
                eventName,
              },
            });
          }
        }
      },

      // Check function declarations and variable declarations for callback functions
      'FunctionDeclaration, VariableDeclarator'(
        node: TSESTree.FunctionDeclaration | TSESTree.VariableDeclarator,
      ) {
        const functionName =
          node.id?.type === 'Identifier' ? node.id.name : undefined;

        if (functionName && hasHandlePrefix(functionName) && node.id) {
          // Skip autofixing for class parameters and getters
          const parent = node.parent;
          if (
            parent?.type === AST_NODE_TYPES.PropertyDefinition ||
            parent?.type === AST_NODE_TYPES.MethodDefinition
          ) {
            context.report({
              node,
              messageId: 'callbackFunctionPrefix',
              data: { functionName },
            });
            return;
          }

          // Get all references to this variable
          const scope = context.getScope();
          const variable = scope.variables.find((v) => v.name === functionName);
          const references = new Set(variable?.references ?? []);

          // Get references from all scopes
          const allScopes = [scope];
          let currentScope = scope;
          while (currentScope.upper) {
            currentScope = currentScope.upper;
            allScopes.push(currentScope);
          }

          // Get references from all scopes and their children
          for (const s of allScopes) {
            // Get references from current scope
            const currentVar = s.variables.find((v) => v.name === functionName);
            if (currentVar) {
              currentVar.references.forEach((ref) => references.add(ref));
            }

            // Get references from child scopes
            const childScopes = s.childScopes;
            for (const childScope of childScopes) {
              const childVar = childScope.variables.find(
                (v) => v.name === functionName,
              );
              if (childVar) {
                childVar.references.forEach((ref) => references.add(ref));
              }
            }
          }

          // Get references from sibling scopes
          const siblingScopes = scope.upper?.childScopes ?? [];
          for (const siblingScope of siblingScopes) {
            if (siblingScope !== scope) {
              const siblingVar = siblingScope.variables.find(
                (v) => v.name === functionName,
              );
              if (siblingVar) {
                siblingVar.references.forEach((ref) => references.add(ref));
              }
            }
          }

          // Get references from global scope
          const sourceCode = context.sourceCode;
          if (sourceCode.scopeManager?.globalScope) {
            const globalVar =
              sourceCode.scopeManager.globalScope.variables.find(
                (v) => v.name === functionName,
              );
            if (globalVar) {
              globalVar.references.forEach((ref) => references.add(ref));
            }
          }

          // A binding that leaves the module is one end of a cross-file
          // contract. Renaming `export const handleClick` to `click` strands
          // every `import { handleClick }` with TS2724, and a single-file fixer
          // cannot reach those importers — the same reasoning that already
          // withholds the JSX prop rename and the destructured one, which is
          // where `isExportedBinding` was first needed. The violation still
          // reports; only the rename is withheld.
          const declaredVariable = context
            .getDeclaredVariables(node)
            .find((v) =>
              v.identifiers.includes(node.id as TSESTree.Identifier),
            );
          const leavesModule = declaredVariable
            ? isExportedBinding(declaredVariable)
            : isExportedDeclaration(node);

          context.report({
            node,
            messageId: 'callbackFunctionPrefix',
            data: { functionName },
            fix(fixer) {
              if (leavesModule) {
                return null;
              }
              // Remove 'handle' prefix and convert first character to lowercase
              const newName = stripHandlePrefix(functionName);
              // `const handleDelete = fn` would become `const delete = fn`,
              // which does not parse (Bug #1719).
              if (!isEmittableName(newName)) {
                return null;
              }

              // Fix the declaration and all references
              const fixes: Array<
                import('@typescript-eslint/utils').TSESLint.RuleFix
              > = [];
              fixes.push(fixer.replaceText(node.id!, newName));
              for (const ref of references) {
                if (ref.identifier !== node.id) {
                  fixes.push(fixer.replaceText(ref.identifier, newName));
                }
              }
              return fixes;
            },
          });
        }
      },

      // Check class methods and object methods
      'MethodDefinition, Property'(
        node: TSESTree.MethodDefinition | TSESTree.Property,
      ) {
        const key = node.key;
        if (
          key.type !== AST_NODE_TYPES.Identifier ||
          !key.name ||
          !hasHandlePrefix(key.name)
        ) {
          return;
        }
        const name = key.name;

        // Skip autofixing for class parameters and getters
        if (
          node.type === AST_NODE_TYPES.MethodDefinition &&
          node.kind === 'get'
        ) {
          context.report({
            node: key,
            messageId: 'callbackFunctionPrefix',
            data: { functionName: name },
          });
          return;
        }

        const isProperty = node.type === AST_NODE_TYPES.Property;
        if (isProperty && node.parent?.type === AST_NODE_TYPES.ObjectPattern) {
          reportDestructuredBinding(node);
          return;
        }

        const newName = stripHandlePrefix(name);
        // A shorthand property's key and value are the same token, so replacing
        // the key also replaces the value: `{ handleClick }` becomes
        // `{ click }`, which both renames the member and re-points it at a
        // binding that need not exist (Bug #1719).
        const canFix =
          isEmittableName(newName) &&
          // A sibling already holding the target name turns the rename into a
          // duplicate member: `{ click: a, handleClick: b }` would collapse to
          // two `click` keys, silently discarding the first.
          !siblingMemberNames(node.parent).has(newName) &&
          !(isProperty && node.shorthand) &&
          !(
            isProperty &&
            node.parent &&
            (isApiSurfaceValue(node.parent) || isReadByName(name))
          );

        context.report({
          node: key,
          messageId: 'callbackFunctionPrefix',
          data: { functionName: name },
          fix(fixer) {
            return canFix ? fixer.replaceText(key, newName) : null;
          },
        });
      },

      // Check constructor parameters
      TSParameterProperty(node: TSESTree.TSParameterProperty) {
        if (
          node.parameter.type === 'Identifier' &&
          hasHandlePrefix(node.parameter.name)
        ) {
          context.report({
            node,
            messageId: 'callbackFunctionPrefix',
            data: { functionName: node.parameter.name },
          });
        }
      },
    };
  },
});
