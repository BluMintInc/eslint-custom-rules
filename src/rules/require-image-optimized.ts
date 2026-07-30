import {
  AST_NODE_TYPES,
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

/** A type-only binding cannot be rendered, so it is no basis for a fix. */
const isTypeOnlyImport = (definition: TSESLint.Scope.Definition) => {
  const { node } = definition;
  if (node.type === AST_NODE_TYPES.ImportSpecifier) {
    return (
      node.importKind === 'type' ||
      (node.parent as TSESTree.ImportDeclaration | undefined)?.importKind ===
        'type'
    );
  }
  if (
    node.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
    node.type === AST_NODE_TYPES.ImportNamespaceSpecifier
  ) {
    return (
      (node.parent as TSESTree.ImportDeclaration | undefined)?.importKind ===
      'type'
    );
  }
  return false;
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
          isInsideComponentMock(node, componentModule)
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
            const attributes = node.openingElement.attributes
              .map((attribute) => sourceCode.getText(attribute))
              .join(' ');
            return fixer.replaceText(
              node,
              `<${localName}${attributes ? ` ${attributes}` : ''} />`,
            );
          },
        });
      },

      // Handle next/image imports and usage
      ImportDeclaration(node) {
        if (isComponentImplementationFile) {
          return;
        }
        if (node.source.value === 'next/image' && node.specifiers.length > 0) {
          const imageSpecifier = node.specifiers.find(
            (spec) =>
              (spec.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
                spec.type === AST_NODE_TYPES.ImportSpecifier) &&
              (spec.local.name === 'Image' ||
                (spec.type === AST_NODE_TYPES.ImportSpecifier &&
                  spec.imported.name === 'Image')),
          );

          if (imageSpecifier) {
            const localName = imageSpecifier.local.name;

            // Report the import
            context.report({
              node,
              messageId: 'useImageOptimized',
              data: {
                componentPath,
                component: 'next/image',
              },
              fix(fixer) {
                return fixer.replaceText(
                  node,
                  `import ${localName} from '${componentPath}';`,
                );
              },
            });
          }
        }
      },
    };
  },
});
