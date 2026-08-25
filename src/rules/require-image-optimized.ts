import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  ASTUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { basename, extname } from 'path';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

type Options = [{ componentPath: string }];
type MessageIds = 'useImageOptimized';

const DEFAULT_COMPONENT_PATH = 'src/components/image/ImageOptimized';

/** The JSX name the fixer writes, and the named export it comes from. */
const COMPONENT_NAME = 'ImageOptimized';

/**
 * `jest.mock` is the hoisted form; `doMock`/`setMock` register the same factory
 * at call time. A factory handed to any of them *implements* the module, so an
 * `<img>` inside one is the optimized component rather than a consumer of it.
 */
const MOCK_REGISTRARS = new Set(['mock', 'doMock', 'setMock']);

/**
 * Final segment of a module specifier or file path, extension stripped, so a
 * relative import (`../image/ImageOptimized`), a manual mock
 * (`../image/__mocks__/ImageOptimized`) and the configured path all reduce to
 * the same module identity.
 */
const moduleNameOf = (specifier: string) =>
  basename(specifier, extname(specifier));

/** Module specifier of a `jest.mock` call, when it is statically knowable. */
const staticSpecifierOf = (node: TSESTree.Node) => {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  if (
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked;
  }
  return null;
};

const isComponentMockCall = (
  node: TSESTree.CallExpression,
  componentModule: string,
) => {
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const { object, property } = callee;
  if (object.type !== AST_NODE_TYPES.Identifier || object.name !== 'jest') {
    return false;
  }
  if (
    property.type !== AST_NODE_TYPES.Identifier ||
    !MOCK_REGISTRARS.has(property.name)
  ) {
    return false;
  }
  const [specifier] = node.arguments;
  if (!specifier) {
    return false;
  }
  const modulePath = staticSpecifierOf(specifier);
  return !!modulePath && moduleNameOf(modulePath) === componentModule;
};

const isInsideComponentMock = (
  node: TSESTree.Node,
  componentModule: string,
) => {
  let current = node.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.CallExpression &&
      isComponentMockCall(current, componentModule)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

/**
 * Name a declaration binds, for the forms a component is declared under:
 * `const ImageOptimized = ...` (including `memo(...)`/`forwardRef(...)` around
 * the body), `function ImageOptimized()` and `class ImageOptimized`. Anything
 * else — an object property, a parameter — binds no declaration name the
 * wrapper can be identified by, and treating it as one would exempt a mock
 * factory keyed by the component name whatever module it stands in for.
 */
const declaredNameOf = (node: TSESTree.Node) => {
  switch (node.type) {
    case AST_NODE_TYPES.VariableDeclarator:
      return node.id.type === AST_NODE_TYPES.Identifier ? node.id.name : null;
    case AST_NODE_TYPES.FunctionDeclaration:
    case AST_NODE_TYPES.FunctionExpression:
    case AST_NODE_TYPES.ClassDeclaration:
    case AST_NODE_TYPES.ClassExpression:
      return node.id ? node.id.name : null;
    default:
      return null;
  }
};

/**
 * Names each local binding is exported under, so a wrapper declared as
 * `Picture` and shipped as `export { Picture as ImageOptimized }` is still
 * recognized as the component's own definition. A specifier carrying a `from`
 * clause re-exports another module's binding and declares nothing here.
 */
const exportedNamesByLocal = (program: TSESTree.Program) => {
  const exported = new Map<string, Set<string>>();
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ExportNamedDeclaration ||
      statement.source ||
      statement.exportKind === 'type'
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      const names = exported.get(specifier.local.name) ?? new Set<string>();
      names.add(specifier.exported.name);
      exported.set(specifier.local.name, names);
    }
  }
  return exported;
};

/**
 * A type-only specifier binds no value: it renders nothing, so it neither
 * bypasses the optimization pipeline nor can back a fix. The modifier lives
 * either on the specifier (`{ type Image }`) or on the whole declaration
 * (`import type ...`).
 */
const isTypeOnlySpecifier = (specifier: TSESTree.ImportClause) => {
  if (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind === 'type'
  ) {
    return true;
  }
  return (
    (specifier.parent as TSESTree.ImportDeclaration | undefined)?.importKind ===
    'type'
  );
};

/** A type-only binding cannot be rendered, so it is no basis for a fix. */
const isTypeOnlyImport = (definition: TSESLint.Scope.Definition) => {
  const { node } = definition;
  if (
    node.type === AST_NODE_TYPES.ImportSpecifier ||
    node.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
    node.type === AST_NODE_TYPES.ImportNamespaceSpecifier
  ) {
    return isTypeOnlySpecifier(node);
  }
  return false;
};

/**
 * Whether a specifier binds `next/image`'s Image component. The default export
 * *is* that component whatever local name it is bound to, so the binding's
 * identity decides rather than the local name — otherwise `import Img from
 * 'next/image'` becomes a rename-shaped bypass of the rule. `{ default as X }`
 * is the same binding written differently. The named `Image` form is matched
 * too, while every other named export (`getImageProps`, the prop types) is
 * left alone: those are not the optimization bypass.
 */
const bindsImageComponent = (specifier: TSESTree.ImportClause) => {
  if (isTypeOnlySpecifier(specifier)) {
    return false;
  }
  if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
    return true;
  }
  // A namespace binds the module rather than the component, and is consumed
  // through a member expression the fix has no shape for.
  if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) {
    return false;
  }
  return (
    specifier.imported.name === 'default' || specifier.imported.name === 'Image'
  );
};

/**
 * The declaration text that keeps the specifiers the fix does not move pointed
 * at their original source. Rewriting the whole declaration would drop them
 * while they are still referenced, and their bindings (`ImageProps`,
 * `getImageProps`) come from `next/image` alone — the wrapper does not
 * re-export them.
 */
const retainedImportText = (
  specifiers: TSESTree.ImportClause[],
  sourceCode: Readonly<TSESLint.SourceCode>,
  source: TSESTree.StringLiteral,
) => {
  const named = specifiers.filter(
    (specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier,
  );
  const standalone = specifiers.filter(
    (specifier) => specifier.type !== AST_NODE_TYPES.ImportSpecifier,
  );
  const clauses = [
    ...standalone.map((specifier) => sourceCode.getText(specifier)),
    ...(named.length > 0
      ? [
          `{ ${named
            .map((specifier) => sourceCode.getText(specifier))
            .join(', ')} }`,
        ]
      : []),
  ];
  return `import ${clauses.join(', ')} from ${sourceCode.getText(source)};`;
};

const isBoundAsValue = (scope: TSESLint.Scope.Scope, name: string) => {
  const variable = ASTUtils.findVariable(scope, name);
  return (
    !!variable &&
    variable.defs.length > 0 &&
    variable.defs.some((definition) => !isTypeOnlyImport(definition))
  );
};

/**
 * Whether the name the fixer is about to emit still resolves, at the report
 * site, to a declaration in the file's module scope — where the component's
 * import, and any module-scope stand-in such as `const ImageOptimized =
 * dynamic(...)`, live. A binding introduced by an enclosing inner scope (a
 * local, a parameter, a block-scoped const) captures the emitted element
 * instead: the name is bound, so no reference is stranded and TypeScript
 * accepts the element, yet the fix silently renders that local value rather
 * than the shared wrapper.
 */
const resolvesToModuleBinding = (scope: TSESLint.Scope.Scope, name: string) => {
  const variable = ASTHelpers.findVariableInScope(scope, name);
  // A variable with no definition is an ambient global, which is no component
  // and cannot be the import the emitted element is meant to reach.
  return (
    !!variable &&
    variable.defs.length > 0 &&
    variable.scope.block.type === AST_NODE_TYPES.Program
  );
};

/**
 * Local name the component is imported under, when it is aliased away from
 * `ImageOptimized`. Reusing the alias keeps the fix bound to a real import
 * instead of introducing a second, unimported name.
 */
const aliasedLocalName = (
  program: TSESTree.Program,
  componentModule: string,
) => {
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      statement.importKind === 'type' ||
      typeof statement.source.value !== 'string' ||
      moduleNameOf(statement.source.value) !== componentModule
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
        return specifier.local.name;
      }
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.imported.name === COMPONENT_NAME &&
        specifier.importKind !== 'type'
      ) {
        return specifier.local.name;
      }
    }
  }
  return null;
};

/** Prettier's default print width, which this repo and agora both format with. */
const PRINT_WIDTH = 80;

/** Prettier's default `tabWidth`, the step it indents a broken group by. */
const INDENT_STEP = '  ';

/**
 * The `VariableDeclaration` a declarator is the sole member of — or the
 * `export` wrapping it, since that is where the printed line starts — or null
 * where siblings share the statement. Prettier lays a multi-declarator
 * statement out one declarator per line before it measures any initializer,
 * so the line read off the source is not the one it decides on.
 */
const soleDeclarationOf = (declarator: TSESTree.VariableDeclarator) => {
  const declaration = declarator.parent;
  if (
    declaration?.type !== AST_NODE_TYPES.VariableDeclaration ||
    declaration.declarations.length !== 1
  ) {
    return null;
  }
  return declaration.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration
    ? declaration.parent
    : declaration;
};

/**
 * The statement a plain assignment is the whole of, or null where it is an
 * operand of something else, whose layout is settled first.
 */
const statementOfAssignment = (assignment: TSESTree.AssignmentExpression) =>
  assignment.operator === '=' &&
  assignment.parent?.type === AST_NODE_TYPES.ExpressionStatement
    ? assignment.parent
    : null;

/**
 * The statement or object property whose layout prettier settles, once the
 * element at the end of it overflows the print width, by parenthesizing that
 * element on a line of its own — or null where the element stands in a layout
 * prettier resolves some other way.
 *
 * Measured against prettier 2.8.8, the parenthesized shape is what it prints
 * for an over-wide element that is the whole value of a `return`, of a
 * sole-declarator initializer, of an assignment statement or of an
 * `export default`, and for the concise body of an arrow standing in one of
 * those places or as the value of a property in an object already broken. An
 * arrow that is the SOLE argument of a call is hugged — `memo(() => (` — so the
 * call is looked through as well when it is the whole value in turn.
 * Everything else breaks an outer group first: a call whose arrow is not its
 * lone argument, or which is itself an argument, breaks its argument list; a
 * multi-declarator statement breaks between declarators; a JSX parent breaks
 * its children; a conditional, a chain and an attribute value each have a
 * layout of their own. The flat rename is left to prettier there.
 */
const parenthesizingAnchorOf = (element: TSESTree.JSXElement) => {
  let value: TSESTree.Node = element;
  let { parent } = element;
  if (
    parent?.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    parent.body === value
  ) {
    value = parent;
    parent = parent.parent;
    if (
      parent?.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments.length === 1 &&
      parent.arguments[0] === value
    ) {
      value = parent;
      parent = parent.parent;
    }
  }
  if (!parent) {
    return null;
  }
  switch (parent.type) {
    case AST_NODE_TYPES.ReturnStatement:
      return parent.argument === value ? parent : null;
    case AST_NODE_TYPES.VariableDeclarator:
      return parent.init === value ? soleDeclarationOf(parent) : null;
    case AST_NODE_TYPES.AssignmentExpression:
      return parent.right === value ? statementOfAssignment(parent) : null;
    case AST_NODE_TYPES.ExportDefaultDeclaration:
      return parent.declaration === value ? parent : null;
    case AST_NODE_TYPES.ExpressionStatement:
      // A bare element or arrow as a statement renders nothing; only the
      // hugged call form (`render(() => <img />)`) is a layout worth writing.
      return parent.expression === value &&
        value.type === AST_NODE_TYPES.CallExpression
        ? parent
        : null;
    case AST_NODE_TYPES.Property:
      // A raw element as a property value is not parenthesized by prettier,
      // which breaks the object around it instead; the arrow and hugged-call
      // values are.
      return parent.value === value &&
        value !== element &&
        parent.kind === 'init' &&
        !parent.shorthand &&
        !parent.method
        ? parent
        : null;
    default:
      return null;
  }
};

/**
 * Whether a token is the operator prettier prints the opening parenthesis
 * after: the `=>` of a concise body, the `return` or `export default` keyword,
 * or the `=` of an initializer or assignment.
 */
const opensParenthesizedValue = (token: TSESTree.Token) =>
  (token.type === AST_TOKEN_TYPES.Punctuator &&
    (token.value === '=>' || token.value === '=')) ||
  (token.type === AST_TOKEN_TYPES.Keyword &&
    (token.value === 'return' || token.value === 'default'));

/**
 * The column the element's line ends at as prettier measures it, or null where
 * the line holds something outside the anchor's own layout. A trailing LINE
 * comment is printed as a suffix that never counts toward fitting, while a
 * BLOCK comment occupies columns like any other text — measured against
 * prettier 2.8.8, the identical statement stays flat at 92 columns with a `//`
 * suffix and is parenthesized at 81 with a block comment after its semicolon.
 * A second statement on the line is neither: its placement is the formatter's,
 * so no width is read off a line it would split first.
 */
const measuredLineEnd = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  element: TSESTree.JSXElement,
  anchor: TSESTree.Node,
) => {
  const line = element.loc.end.line;
  let end = element.loc.end.column;
  let token = sourceCode.getTokenAfter(element, { includeComments: true });
  while (token && token.loc.start.line === line) {
    if (token.type === AST_TOKEN_TYPES.Line) {
      break;
    }
    if (token.loc.end.line !== line) {
      return null;
    }
    const pastAnchor = token.range[0] >= anchor.range[1];
    // The comma after a property belongs to the object and stays on the line.
    const isPropertySeparator =
      anchor.type === AST_NODE_TYPES.Property &&
      token.type === AST_TOKEN_TYPES.Punctuator &&
      token.value === ',';
    if (
      pastAnchor &&
      token.type !== AST_TOKEN_TYPES.Block &&
      !isPropertySeparator
    ) {
      return null;
    }
    end = token.loc.end.column;
    token = sourceCode.getTokenAfter(token, { includeComments: true });
  }
  return end;
};

/**
 * Where the closing tag's replacement starts, and what it is. The component
 * renders as a void element, so `<img …></img>` becomes self-closing: the
 * splice runs from the end of the last attribute (or of the tag name, when
 * there is none) through the element's end, which leaves the attribute list
 * untouched. Text between that point and the opening element's `>` carries the
 * author's spacing and any trailing comment. Prettier puts `/>` on its own line
 * when the attribute list is expanded and a space before it when it is not,
 * which is exactly the distinction that spacing already encodes.
 */
const selfClosingSplice = (
  node: TSESTree.JSXElement,
  sourceCode: Readonly<TSESLint.SourceCode>,
) => {
  const { attributes, name } = node.openingElement;
  const spliceStart = (attributes[attributes.length - 1] ?? name).range[1];
  const gap = sourceCode.text.slice(
    spliceStart,
    node.openingElement.range[1] - 1,
  );
  return { spliceStart, text: /\s$/.test(gap) ? `${gap}/>` : `${gap} />` };
};

/**
 * The element's text as the rename leaves it: the tag swapped, every byte
 * between the tag and the closing splice carried over verbatim.
 */
const renamedElementText = (
  node: TSESTree.JSXElement,
  localName: string,
  sourceCode: Readonly<TSESLint.SourceCode>,
) => {
  const { name } = node.openingElement;
  const head = `<${localName}`;
  if (!node.closingElement) {
    return head + sourceCode.text.slice(name.range[1], node.range[1]);
  }
  const { spliceStart, text } = selfClosingSplice(node, sourceCode);
  return head + sourceCode.text.slice(name.range[1], spliceStart) + text;
};

/**
 * The parenthesized re-layout prettier gives a one-line element once the
 * longer tag name pushes its line past the print width, or null where the flat
 * rename is what prettier keeps — or where the shape it moves to is not one
 * this fixer can write. The rename always LENGTHENS the line (`ImageOptimized`
 * is twelve columns wider than `img`), so an element that fitted before the
 * fix routinely does not after it, and a flat rename there is text prettier
 * rewrites on sight, churning the file on every pass (#2133).
 */
const parenthesizedOverflowFix = (
  fixer: TSESLint.RuleFixer,
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.JSXElement,
  renamed: string,
) => {
  // An element already laid out over several lines is broken where prettier
  // broke it, and the rename lengthens only its first line, which holds
  // nothing but the tag.
  if (node.loc.start.line !== node.loc.end.line) {
    return null;
  }
  const anchor = parenthesizingAnchorOf(node);
  if (!anchor) {
    return null;
  }
  const line = node.loc.start.line;
  // The anchor has to open the line: anything before it there is an outer
  // group — the object holding the property, the call the statement is an
  // argument of — that prettier breaks before it measures the element.
  const beforeAnchor = sourceCode.getTokenBefore(anchor, {
    includeComments: true,
  });
  if (
    anchor.loc.start.line !== line ||
    (beforeAnchor && beforeAnchor.loc.end.line === line)
  ) {
    return null;
  }
  // The element must follow the anchor's own operator directly. A comment in
  // between is printed INSIDE the parentheses, and a parenthesis there means
  // the element is wrapped already.
  const before = sourceCode.getTokenBefore(node, { includeComments: true });
  if (!before || !opensParenthesizedValue(before)) {
    return null;
  }
  const end = measuredLineEnd(sourceCode, node, anchor);
  if (end === null) {
    return null;
  }
  const delta = renamed.length - (node.range[1] - node.range[0]);
  if (end + delta <= PRINT_WIDTH) {
    return null;
  }
  const indent = /^[\t ]*/.exec(sourceCode.lines[line - 1] ?? '')?.[0] ?? '';
  const inner = `${indent}${INDENT_STEP}`;
  // Past the width even on a line of its own, the element's attribute list
  // is what prettier breaks next — a shape only a rebuild of that list could
  // write, and a rebuild owns every byte between the attributes, comments
  // included. The flat rename is kept there: it is what the rule has always
  // written.
  if (inner.length + renamed.length > PRINT_WIDTH) {
    return null;
  }
  return fixer.replaceText(node, `(\n${inner}${renamed}\n${indent})`);
};

export = createRule<Options, MessageIds>({
  name: 'require-image-optimized',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce using ImageOptimized component instead of next/image or img tags',
      recommended: 'error',
      requiresTypeChecking: false,
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          componentPath: {
            type: 'string',
            description: 'The import path for the ImageOptimized component',
            default: DEFAULT_COMPONENT_PATH,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useImageOptimized:
        'Use ImageOptimized from {{ componentPath }} instead of {{ component }}. The shared wrapper handles responsive sizing, lazy loading, and blur placeholders so images stay optimized and do not hurt Core Web Vitals. Replace this usage with ImageOptimized to send the asset through the optimization pipeline.',
    },
  },
  defaultOptions: [{ componentPath: DEFAULT_COMPONENT_PATH }],

  create(context) {
    const componentPath =
      context.options[0]?.componentPath || DEFAULT_COMPONENT_PATH;
    const sourceCode = context.getSourceCode();
    const componentModule = moduleNameOf(componentPath);

    /**
     * The component's own module and its manual mock implement the wrapper, so
     * every image primitive they reach for is the implementation detail the
     * rule exists to centralize, not a violation of it.
     */
    const isComponentImplementationFile =
      moduleNameOf(context.getFilename()) === componentModule;

    /**
     * The wrapper is identified by the name the fixer would emit and by its
     * module's name, which a component module's export shares by convention.
     * Matching is exact so a distinct component whose name merely starts with
     * it (`ImageOptimizedGallery`) stays reportable.
     */
    const isComponentName = (name: string) =>
      name === COMPONENT_NAME || name === componentModule;

    const exportedNames = exportedNamesByLocal(sourceCode.ast);

    const definesComponent = (name: string) => {
      if (isComponentName(name)) {
        return true;
      }
      const aliases = exportedNames.get(name);
      return !!aliases && [...aliases].some(isComponentName);
    };

    /**
     * Whether the element sits inside the declaration of the component the fix
     * points at. That declaration renders the image primitive by definition, so
     * swapping it for the component makes the wrapper render itself: unbounded
     * recursion, and a type error too, since the wrapper forwards only the
     * props it destructured. The whole ancestry is walked because a helper
     * nested inside the declaration is part of that implementation as well.
     */
    const isInsideComponentDefinition = (node: TSESTree.Node) => {
      let current = node.parent;
      while (current) {
        const declared = declaredNameOf(current);
        if (declared && definesComponent(declared)) {
          return true;
        }
        current = current.parent;
      }
      return false;
    };

    return {
      // Handle JSX img elements
      JSXElement(node) {
        const elementName = node.openingElement.name;
        if (
          elementName.type !== AST_NODE_TYPES.JSXIdentifier ||
          elementName.name !== 'img'
        ) {
          return;
        }
        if (
          isComponentImplementationFile ||
          isInsideComponentMock(node, componentModule) ||
          isInsideComponentDefinition(node)
        ) {
          return;
        }

        const scope = ASTHelpers.getScope(context, node);
        const localName = isBoundAsValue(scope, COMPONENT_NAME)
          ? COMPONENT_NAME
          : aliasedLocalName(sourceCode.ast, componentModule);

        context.report({
          node,
          messageId: 'useImageOptimized',
          data: {
            componentPath,
            component: 'img tag',
          },
          fix(fixer) {
            // Swapping in an unimported name would strand the reference, and
            // picking an import path for it is a product decision the rule
            // cannot make; reporting without fixing keeps the file valid.
            if (!localName) {
              return null;
            }
            // A shadow of that name over the report site would make the swap
            // render the shadow's value; declining leaves the report for the
            // author to resolve the shadow by hand.
            if (!resolvesToModuleBinding(scope, localName)) {
              return null;
            }
            // The longer name can push a one-line element past the print
            // width, where prettier parenthesizes the element on a line of its
            // own; that layout is written here whenever it is the one prettier
            // would settle on.
            const overflow = parenthesizedOverflowFix(
              fixer,
              sourceCode,
              node,
              renamedElementText(node, localName, sourceCode),
            );
            if (overflow) {
              return overflow;
            }
            // Renaming the tag in place carries every attribute — and every
            // line break between them — over byte for byte. Re-authoring the
            // element from joined attribute texts instead collapses the list
            // onto one line, by an amount that grows with the attribute count,
            // so a prettier-formatted element comes back overflowing the print
            // width. Breaking the attribute list by measurement is no remedy
            // either: prettier collapses a short expanded attribute list back
            // onto one line, so the input's own layout is the only shape that
            // survives a round trip in both directions.
            const fixes = [fixer.replaceText(elementName, localName)];
            if (node.closingElement) {
              const { spliceStart, text } = selfClosingSplice(node, sourceCode);
              fixes.push(
                fixer.replaceTextRange([spliceStart, node.range[1]], text),
              );
            }
            return fixes;
          },
        });
      },

      // Handle next/image imports and usage
      ImportDeclaration(node) {
        if (isComponentImplementationFile) {
          return;
        }
        if (node.source.value !== 'next/image') {
          return;
        }
        // A default binding comes first in the specifier list, so this prefers
        // it over a redundant named `Image` alongside it.
        const imageSpecifier = node.specifiers.find(bindsImageComponent);
        if (!imageSpecifier) {
          return;
        }
        const localName = imageSpecifier.local.name;
        const retained = node.specifiers.filter(
          (specifier) => specifier !== imageSpecifier,
        );

        context.report({
          node,
          messageId: 'useImageOptimized',
          data: {
            componentPath,
            component: 'next/image',
          },
          fix(fixer) {
            const swapped = `import ${localName} from '${componentPath}';`;
            if (retained.length === 0) {
              return fixer.replaceText(node, swapped);
            }
            return fixer.replaceText(
              node,
              `${retainedImportText(
                retained,
                sourceCode,
                node.source,
              )}\n${swapped}`,
            );
          },
        });
      },
    };
  },
});
