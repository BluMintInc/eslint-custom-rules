import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceReactTypeNaming } from '../rules/enforce-react-type-naming';

ruleTesterJsx.run('enforce-react-type-naming', enforceReactTypeNaming, {
  valid: [
    // Valid lowercase names for ReactNode and JSX.Element
    'const myComponent: ReactNode = <div>Hello</div>;',
    'const element: JSX.Element = <div>Hello</div>;',
    'const jsxContent: JSX.Element = <span>Content</span>;',
    'const reactNodeContent: ReactNode = <p>Text</p>;',

    // Valid uppercase names for ComponentType and FC
    'const MyComponent: ComponentType = () => <div />;',
    'const Button: FC = () => <button>Click me</button>;',
    'const CardComponent: ComponentType<Props> = (props) => <div>{props.children}</div>;',
    'const HeaderElement: FunctionComponent = () => <header>Header</header>;',

    // Valid function parameters
    'function renderContent(element: JSX.Element) { return element; }',
    'function withHOC(Component: ComponentType) { return Component; }',
    'const useElement = (content: ReactNode) => { return content; };',
    'const createComponent = (Component: FC) => { return <Component />; };',

    // Destructured variables (should be ignored)
    'const { MyComponent } = components;',
    'function render({ Element }: { Element: ReactNode }) { return Element; }',

    // Default imports (should be ignored)
    'import MyComponent from "./MyComponent";',
    'import { Button as ButtonComponent } from "./Button";',

    // Generic types and other non-React types
    'const data: string = "text";',
    'const count: number = 5;',
    'const items: Array<string> = [];',

    // No type annotation (should be ignored)
    'const component = () => <div />;',
    'const element = <div>No type</div>;',

    // ADDITIONAL VALID TEST CASES

    // More complex destructuring patterns (should be ignored)
    'const { components: { MyElement, Button: CustomButton } } = props;',
    'const [FirstComponent, SecondComponent] = componentArray;',
    'function useComponents({ Header: HeaderComponent, Content: ContentElement }: ComponentMap) { return { HeaderComponent, ContentElement }; }',

    // Nested imports (should be ignored)
    'import * as Components from "./components";',
    'import { Button, Card } from "./components";',

    // Type aliases and interfaces with React types
    `
      type RenderFunction = (element: ReactNode) => JSX.Element;
      interface ComponentProps {
        content: ReactNode;
        Component: ComponentType;
      }
    `,

    // Higher-order components with proper naming
    `
      function withData(Component: ComponentType<Props>) {
        return function WithData(props: Props) {
          const data = useData();
          return <Component {...props} data={data} />;
        };
      }
    `,

    // React hooks with proper naming
    `
      function useCustomHook() {
        const element: JSX.Element = <div>Hook content</div>;
        const Component: FC = () => <span>Component in hook</span>;
        return { element, Component };
      }
    `,

    // Class components with proper naming
    `
      class MyComponent extends React.Component {
        private renderContent(): JSX.Element {
          return <div>Content</div>;
        }

        private SubComponent: FC = () => <div>Sub component</div>;

        render() {
          const element: ReactNode = this.renderContent();
          return (
            <>
              {element}
              <this.SubComponent />
            </>
          );
        }
      }
    `,

    // Complex generic types
    `
      const MyGenericComponent: ComponentType<{ data: T }> = <T,>(props) => {
        return <div>{props.data}</div>;
      };

      function renderGeneric<T>(element: React.ReactElement<T>) {
        return element;
      }
    `,

    // Conditional types
    `
      type ConditionalComponent<T> = T extends string ? FC<{text: T}> : ComponentType<{data: T}>;
      const StringComponent: ConditionalComponent<string> = ({text}) => <span>{text}</span>;
    `,

    // Function expressions with proper naming
    `
      const renderElement = function(element: JSX.Element) {
        return element;
      };

      const createComponent = function(Component: ComponentType) {
        return <Component />;
      };
    `,

    // Arrow functions with proper naming in object literals
    `
      const utils = {
        renderContent: (element: ReactNode) => element,
        createComponent: (Component: FC) => <Component />
      };
    `,

    // React.memo with proper naming
    `
      const MemoizedComponent: FC = React.memo(function(props) {
        return <div>{props.children}</div>;
      });

      const element: JSX.Element = <MemoizedComponent />;
    `,

    // forwardRef with proper naming
    `
      const ForwardedComponent = React.forwardRef<HTMLDivElement, Props>(
        function(props, ref) {
          return <div ref={ref}>{props.children}</div>;
        }
      );

      const forwardedElement: JSX.Element = <ForwardedComponent />;
    `,

    // ISSUE #1846 — the carve-out for `global-const-style`.
    //
    // A non-exported module-scope `const` has its name governed by
    // `global-const-style`, which demands UPPER_SNAKE_CASE. This rule used to
    // demand a lowercase initial for the same identifier, so no spelling
    // satisfied both and the two autofixers oscillated until `--fix` wrote a
    // mangled `e_LEMENT` to disk. The UPPER_SNAKE spelling below is the one the
    // sibling drives to, and it must be silent HERE — otherwise the pair is
    // still unsatisfiable, just in the other direction.
    'const ELEMENT: JSX.Element = <div>Hello</div>;',
    'const CONTENT: ReactNode = null;',
    'const NODE_LIST: ReactNode = <span>Text</span>;',
    // The literal input from #1846 before `global-const-style` renames it: this
    // rule stays out of the way at every point on that rename path.
    'const Element: JSX.Element = <div>Hello</div>;',
    // The component branch yields on the same terms. `global-const-style`'s
    // UPPER_SNAKE target already starts uppercase, so the two agree once it has
    // run; this rule reporting in the meantime only adds a competing fixer.
    'const WIDGET: FC = {} as FC;',
    // Every declarator in a list is governed when none of them holds a function
    // value, so the JSX-typed one yields along with the rest.
    'const Element: JSX.Element = <div />, OTHER_THING = 1;',
  ],
  invalid: [
    // The rename-fixer fixtures below declare their subject with `let` rather
    // than `const`. That is not incidental: a non-exported module-scope `const`
    // is `global-const-style`'s to name (#1846) and this rule yields there, so a
    // `const` subject would silence the very reports these cases exist to pin.
    // `let` keeps the module-scope topology every collision/capture case
    // depends on while leaving the sibling's contract untouched.

    // Issue #1357 repro: annotation must survive and references must follow.
    {
      code: `let Content: ReactNode = null;\nrender(Content);`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: `let content: ReactNode = null;\nrender(content);`,
    },

    // Issue #1357 repro, the opposite direction: a component type renamed
    // upward must keep its annotation and carry its references along.
    {
      code: `const button: FC = () => null;\nuse(button);`,
      errors: [
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'FC',
            suggestion: 'Button',
          },
        },
      ],
      output: `const Button: FC = () => null;\nuse(Button);`,
    },

    // Issue #1357: the parameter form of the same defect.
    {
      code: 'function f(Child: ReactNode) { return Child; }',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'child',
          },
        },
      ],
      output: 'function f(child: ReactNode) { return child; }',
    },

    // The parameter shadows the function's own name, so the two share a name
    // while being distinct symbols. Resolving by declaration identity (not by
    // name) is what keeps the fixer on the parameter.
    {
      code: 'function Child(Child: ReactNode) { return Child; }',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'child',
          },
        },
      ],
      output: 'function Child(child: ReactNode) { return child; }',
    },

    // An optional marker sits inside the identifier's range alongside the
    // annotation; both must survive the rename.
    {
      code: 'function f(Child?: ReactNode) { return Child; }',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'child',
          },
        },
      ],
      output: 'function f(child?: ReactNode) { return child; }',
    },

    // A definite-assignment marker is likewise part of the identifier's range.
    {
      code: `let Content!: ReactNode;\nrender(Content);`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: `let content!: ReactNode;\nrender(content);`,
    },

    // A shorthand property is both key and value; expanding it keeps the
    // object's shape while renaming only the value.
    {
      code: `let Content: ReactNode = null;\nconst wrapper = { Content };`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: `let content: ReactNode = null;\nconst wrapper = { Content: content };`,
    },

    // The target name is already bound in the declaration scope: renaming would
    // redeclare it, so the report stands without a fix.
    {
      code: `let Content: ReactNode = null;\nconst content = 1;\nrender(Content, content);`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: null,
    },

    // A reference from a nested scope renames along with the declaration when
    // nothing on the scope chain binds the target name.
    {
      code: `let Content: ReactNode = null;\nfunction read() { return Content; }`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: `let content: ReactNode = null;\nfunction read() { return content; }`,
    },

    // A binding of the target name sits between a reference and the
    // declaration, so the rewritten reference would resolve to it instead.
    {
      code: `let Content: ReactNode = null;\nfunction read() { const content = 1; return [Content, content]; }`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: null,
    },

    // A nested scope already uses the target name for something else, so the
    // rename would capture it.
    {
      code: `let Content: ReactNode = null;\nfunction read() { const content = 1; return content; }\nrender(Content);`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: null,
    },

    // An exported declaration with in-file references is a cross-file contract
    // a single-file fixer cannot complete.
    {
      code: `export const Content: ReactNode = null;\nrender(Content);`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: null,
    },

    // A bare exported declaration is the most exposed shape, not the safest:
    // its importers all spell the name in files this fixer cannot reach.
    {
      code: 'export const Content: ReactNode = null;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: null,
    },

    // A re-export specifier binds the public export name to this identifier;
    // rewriting it would rename the export itself.
    {
      code: `let Content: ReactNode = null;\nexport { Content };`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: null,
    },

    // A parameter of an exported function is function-local, so the export
    // guard must not suppress its rename.
    {
      code: 'export function render(Child: ReactNode) { return Child; }',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'child',
          },
        },
      ],
      output: 'export function render(child: ReactNode) { return child; }',
    },

    // The non-exported twin of the bare `export const` above still renames:
    // the export guard is scoped to the export contract, not blanket.
    {
      code: 'let Content: ReactNode = null;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: { type: 'ReactNode', suggestion: 'content' },
        },
      ],
      output: 'let content: ReactNode = null;',
    },

    // ISSUE #1846 NEGATIVE CONTROLS — the carve-out must match
    // `global-const-style`'s ACTUAL governance, not "module-scope const". Each
    // case below is a module-scope declaration that rule declines to name, so
    // yielding on it would leave the declaration governed by NOTHING.

    // `let`/`var` are outside `global-const-style` entirely.
    {
      code: 'var Element: JSX.Element = <div>Hello</div>;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: { type: 'JSX.Element', suggestion: 'element' },
        },
      ],
      output: 'var element: JSX.Element = <div>Hello</div>;',
    },

    // A dynamic initializer silences the sibling's rename check.
    {
      code: 'const Element: JSX.Element = renderIt();',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: { type: 'JSX.Element', suggestion: 'element' },
        },
      ],
      output: 'const element: JSX.Element = renderIt();',
    },

    // So does a bare identifier initializer, which merely aliases a binding.
    {
      code: 'const Element: JSX.Element = other;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: { type: 'JSX.Element', suggestion: 'element' },
        },
      ],
      output: 'const element: JSX.Element = other;',
    },

    // A declaration with no initializer is skipped there before the name is
    // ever examined.
    {
      code: 'declare const Element: JSX.Element;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: { type: 'JSX.Element', suggestion: 'element' },
        },
      ],
      output: 'declare const element: JSX.Element;',
    },

    // A function value anywhere in the declaration LIST makes the sibling skip
    // every declarator in it, so this rule keeps the whole list.
    {
      code: 'const handler = () => null, Element: JSX.Element = <div />;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: { type: 'JSX.Element', suggestion: 'element' },
        },
      ],
      output: 'const handler = () => null, element: JSX.Element = <div />;',
    },

    // Not module scope: a component-local declaration is this rule's alone.
    {
      code: 'function Wrapper() { const Element: JSX.Element = <div />; return Element; }',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: { type: 'JSX.Element', suggestion: 'element' },
        },
      ],
      output:
        'function Wrapper() { const element: JSX.Element = <div />; return element; }',
    },

    // Exported: `global-const-style` withholds only the FIX there, so neither
    // rule renames and no `--fix` loop can form. This rule keeps its report.
    {
      code: 'export const Element: JSX.Element = <div>Hello</div>;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: { type: 'JSX.Element', suggestion: 'element' },
        },
      ],
      output: null,
    },

    // Invalid uppercase names for ReactNode
    {
      code: 'let MyComponent: ReactNode = <div>Hello</div>;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'myComponent',
          },
        },
      ],
      output: 'let myComponent: ReactNode = <div>Hello</div>;',
    },
    {
      code: 'let Element: JSX.Element = <div>Hello</div>;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'JSX.Element',
            suggestion: 'element',
          },
        },
      ],
      output: 'let element: JSX.Element = <div>Hello</div>;',
    },

    // Invalid lowercase names for ComponentType and FC
    {
      code: 'const button: FC = () => <button>Click me</button>;',
      errors: [
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'FC',
            suggestion: 'Button',
          },
        },
      ],
      output: 'const Button: FC = () => <button>Click me</button>;',
    },
    {
      code: 'const cardComponent: ComponentType<Props> = (props) => <div>{props.children}</div>;',
      errors: [
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'ComponentType',
            suggestion: 'CardComponent',
          },
        },
      ],
      output:
        'const CardComponent: ComponentType<Props> = (props) => <div>{props.children}</div>;',
    },
    {
      code: 'const headerElement: FunctionComponent = () => <header>Header</header>;',
      errors: [
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'FunctionComponent',
            suggestion: 'HeaderElement',
          },
        },
      ],
      output:
        'const HeaderElement: FunctionComponent = () => <header>Header</header>;',
    },

    // Invalid function parameters
    {
      code: 'function renderContent(Element: JSX.Element) { return Element; }',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'JSX.Element',
            suggestion: 'element',
          },
        },
      ],
      output:
        'function renderContent(element: JSX.Element) { return element; }',
    },
    {
      code: 'function useCustomHook(Component: ReactNode) { return <Component />; }',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'component',
          },
        },
      ],
      // The JSX element name resolves to the parameter binding, so it is renamed
      // with it: a consistent rename beats leaving `<Component />` dangling.
      output:
        'function useCustomHook(component: ReactNode) { return <component />; }',
    },
    {
      code: 'const createComponent = (component: FC) => { return <component />; };',
      errors: [
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'FC',
            suggestion: 'Component',
          },
        },
      ],
      // `<component />` is a lowercase JSX name, which the scope analyzer models
      // as an intrinsic host element rather than a reference to the parameter,
      // so there is nothing to rewrite besides the declaration.
      output:
        'const createComponent = (Component: FC) => { return <component />; };',
    },
    {
      code: 'const withHOC = (wrapper: ComponentType) => (props) => <wrapper {...props} />;',
      errors: [
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'ComponentType',
            suggestion: 'Wrapper',
          },
        },
      ],
      output:
        'const withHOC = (Wrapper: ComponentType) => (props) => <wrapper {...props} />;',
    },

    // Multiple errors in one file
    {
      code: `
        let Button: ReactNode = <button>Click</button>;
        const card: ComponentType = () => <div>Card</div>;
        function render(Element: JSX.Element, component: FC) {
          return <component>{Element}</component>;
        }
      `,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'button',
          },
        },
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'ComponentType',
            suggestion: 'Card',
          },
        },
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'JSX.Element',
            suggestion: 'element',
          },
        },
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'FC',
            suggestion: 'Component',
          },
        },
      ],
      // ESLint merges each report's fix list into one range-spanning fix, so the
      // `Element` rename (declaration through its JSX use) and the `component`
      // rename (nested between them) overlap; a single pass keeps the first and
      // defers the other to the next pass.
      output: `
        let button: ReactNode = <button>Click</button>;
        const Card: ComponentType = () => <div>Card</div>;
        function render(element: JSX.Element, component: FC) {
          return <component>{element}</component>;
        }
      `,
    },

    // ADDITIONAL INVALID TEST CASES

    // Invalid naming in class methods
    {
      code: `
        class MyComponent extends React.Component {
          private renderElement(): JSX.Element {
            const Element: ReactNode = <div>Element</div>;
            return Element;
          }
        }
      `,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'element',
          },
        },
      ],
      output: `
        class MyComponent extends React.Component {
          private renderElement(): JSX.Element {
            const element: ReactNode = <div>Element</div>;
            return element;
          }
        }
      `,
    },

    // Invalid naming in React hooks
    {
      code: `
        function useCustomHook() {
          const Element: JSX.Element = <div>Element</div>;
          const component: FC = () => <div>Component</div>;
          return { Element, component };
        }
      `,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'JSX.Element',
            suggestion: 'element',
          },
        },
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'FC',
            suggestion: 'Component',
          },
        },
      ],
      // The shorthand `{ Element }` expands to `{ Element: element }` so the
      // object's key (its public shape) survives the rename. The `component`
      // rename's merged range overlaps this one and lands on the next pass.
      output: `
        function useCustomHook() {
          const element: JSX.Element = <div>Element</div>;
          const component: FC = () => <div>Component</div>;
          return { Element: element, component };
        }
      `,
    },

    // Invalid naming in function expressions
    {
      code: `
        const renderElement = function(Element: ReactNode) {
          return Element;
        };
      `,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'element',
          },
        },
      ],
      output: `
        const renderElement = function(element: ReactNode) {
          return element;
        };
      `,
    },

    // Invalid naming in arrow functions with object literals
    {
      code: `
        const utils = {
          renderContent: (Element: JSX.Element) => Element,
          createComponent: (component: ComponentType) => <component />
        };
      `,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'JSX.Element',
            suggestion: 'element',
          },
        },
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'ComponentType',
            suggestion: 'Component',
          },
        },
      ],
      output: `
        const utils = {
          renderContent: (element: JSX.Element) => element,
          createComponent: (Component: ComponentType) => <component />
        };
      `,
    },

    // Invalid naming with complex generic types
    {
      code: `
        const myGenericComponent: ComponentType<{ data: T }> = <T,>(props) => {
          return <div>{props.data}</div>;
        };
      `,
      errors: [
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'ComponentType',
            suggestion: 'MyGenericComponent',
          },
        },
      ],
      output: `
        const MyGenericComponent: ComponentType<{ data: T }> = <T,>(props) => {
          return <div>{props.data}</div>;
        };
      `,
    },

    // Invalid naming with React.memo
    {
      code: `
        const memoizedComponent: FC = React.memo(function(props) {
          return <div>{props.children}</div>;
        });
      `,
      errors: [
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'FC',
            suggestion: 'MemoizedComponent',
          },
        },
      ],
      output: `
        const MemoizedComponent: FC = React.memo(function(props) {
          return <div>{props.children}</div>;
        });
      `,
    },

    // Invalid naming with forwardRef
    {
      code: `
        const forwardedComponent = React.forwardRef<HTMLDivElement, Props>(
          function(props, ref): JSX.Element {
            const Element: ReactNode = <div ref={ref}>{props.children}</div>;
            return Element;
          }
        );
      `,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'element',
          },
        },
      ],
      output: `
        const forwardedComponent = React.forwardRef<HTMLDivElement, Props>(
          function(props, ref): JSX.Element {
            const element: ReactNode = <div ref={ref}>{props.children}</div>;
            return element;
          }
        );
      `,
    },

    // Invalid naming in higher-order components
    {
      code: `
        function withData(component: ComponentType<Props>) {
          return function WithData(props: Props) {
            const Data: ReactNode = <div>Data</div>;
            return <component {...props} data={Data} />;
          };
        }
      `,
      errors: [
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'ComponentType',
            suggestion: 'Component',
          },
        },
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'data',
          },
        },
      ],
      // The JSX attribute name `data` is not a reference, so only the `{Data}`
      // value moves; the attribute keeps its name.
      output: `
        function withData(Component: ComponentType<Props>) {
          return function WithData(props: Props) {
            const data: ReactNode = <div>Data</div>;
            return <component {...props} data={data} />;
          };
        }
      `,
    },

    // Invalid naming with conditional rendering
    {
      code: `
        function ConditionalRender(props: Props) {
          const Element: JSX.Element = props.condition
            ? <div>True</div>
            : <span>False</span>;

          const component: FC = () => props.condition
            ? <button>Click</button>
            : <a>Link</a>;

          return (
            <>
              {Element}
              <component />
            </>
          );
        }
      `,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'JSX.Element',
            suggestion: 'element',
          },
        },
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'FC',
            suggestion: 'Component',
          },
        },
      ],
      output: `
        function ConditionalRender(props: Props) {
          const element: JSX.Element = props.condition
            ? <div>True</div>
            : <span>False</span>;

          const component: FC = () => props.condition
            ? <button>Click</button>
            : <a>Link</a>;

          return (
            <>
              {element}
              <component />
            </>
          );
        }
      `,
    },

    // Invalid naming with multiple type parameters
    {
      code: `
        const listComponent: ComponentType<ListProps<T>> = <T,>(props) => {
          return (
            <ul>
              {props.items.map(item => <li key={item.id}>{item.name}</li>)}
            </ul>
          );
        };
      `,
      errors: [
        {
          messageId: 'componentTypeShouldBeUppercase',
          data: {
            type: 'ComponentType',
            suggestion: 'ListComponent',
          },
        },
      ],
      output: `
        const ListComponent: ComponentType<ListProps<T>> = <T,>(props) => {
          return (
            <ul>
              {props.items.map(item => <li key={item.id}>{item.name}</li>)}
            </ul>
          );
        };
      `,
    },

    // Invalid naming with complex object destructuring
    {
      code: `
        function RenderComponent({
          items,
          render: RenderFunction
        }: {
          items: string[];
          render: (item: string) => ReactNode;
        }) {
          const Element: JSX.Element = <div>Test</div>;
          return <div>{Element}</div>;
        }
      `,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'JSX.Element',
            suggestion: 'element',
          },
        },
      ],
      output: `
        function RenderComponent({
          items,
          render: RenderFunction
        }: {
          items: string[];
          render: (item: string) => ReactNode;
        }) {
          const element: JSX.Element = <div>Test</div>;
          return <div>{element}</div>;
        }
      `,
    },
  ],
});

/**
 * ISSUE #1846 — the pair `enforce-react-type-naming` + `global-const-style`
 * must reach a FIXPOINT, and that fixpoint must be clean under both.
 *
 * Neither rule's own `RuleTester` suite can express this. A single-rule case
 * sees one fixer; the defect was two fixers rewriting the same identifier in
 * opposite directions across passes (`element` -> `ELEMENT` -> `eLEMENT` ->
 * `E_LEMENT` -> `e_LEMENT` -> …) until ESLint's ten-pass cap gave up and wrote
 * the mangled name to disk. `verifyAndFix` returns `fixed: true` with no signal
 * that it never converged, which is why it reached a consumer's source.
 *
 * `src/tests/fixer-convergence.test.ts` cannot see it either: it probes one
 * rule at a time, and each of these two converges alone.
 *
 * Both rules are registered under their real `@blumintinc/blumint/` ids and
 * read out of the shipped plugin, so this exercises the objects a consumer gets
 * rather than a local copy.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
  configs: { recommended: { rules: Record<string, string> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';
const PAIR = ['enforce-react-type-naming', 'global-const-style'] as const;
const PAIR_IDS = PAIR.map((name) => `${PREFIX}${name}`);

const pairLinter = new Linter();
pairLinter.defineParser('ts', tsParser as never);
for (const name of PAIR) {
  pairLinter.defineRule(`${PREFIX}${name}`, plugin.rules[name] as never);
}

const PAIR_CONFIG = {
  parser: 'ts',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  rules: Object.fromEntries(PAIR_IDS.map((id) => [id, 'error'])),
} as unknown as Linter.Config;

const FILENAME = '/repo/src/components/Component.tsx';

const lintPair = (code: string) =>
  pairLinter
    .verify(code, PAIR_CONFIG, FILENAME)
    .map(
      (message) => `${message.ruleId}:${message.messageId ?? message.message}`,
    );

/**
 * The declared name of every `const`/`let`/`var` in the source.
 *
 * Asserted independently of the expected output text, because the symptom is
 * not "the wrong name" but "a name no human convention produces": `e_LEMENT` is
 * neither camel/Pascal nor UPPER_SNAKE, and only a fixer fighting another fixer
 * writes one.
 */
const DECLARED_NAMES = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
const WELL_FORMED = /^(?:[A-Za-z_$][A-Za-z0-9$]*|[A-Z][A-Z0-9_$]*)$/;
const mangledNamesIn = (code: string) =>
  [...code.matchAll(DECLARED_NAMES)]
    .map((match) => match[1])
    .filter((name) => !WELL_FORMED.test(name));

type PairCase = { name: string; code: string; output: string };

const PAIR_CASES: PairCase[] = [
  {
    name: 'the reported input: a JSX.Element const',
    code: 'const element: JSX.Element = <div>Hello</div>;\n',
    output: 'const ELEMENT: JSX.Element = <div>Hello</div>;\n',
  },
  {
    name: 'the same const already spelled PascalCase',
    code: 'const Element: JSX.Element = <div>Hello</div>;\n',
    output: 'const ELEMENT: JSX.Element = <div>Hello</div>;\n',
  },
  {
    name: 'the ReactNode annotation',
    code: 'const content: ReactNode = null;\n',
    output: 'const CONTENT: ReactNode = null;\n',
  },
  {
    name: 'the ReactNode annotation, PascalCase',
    code: 'const Content: ReactNode = null;\n',
    output: 'const CONTENT: ReactNode = null;\n',
  },
  {
    name: 'the FC annotation on a non-function value',
    code: 'const widget: FC = {} as FC;\n',
    output: 'const WIDGET: FC = {} as FC;\n',
  },
  {
    name: 'references follow the rename',
    code: 'const element: JSX.Element = <div />;\nrender(element);\n',
    output: 'const ELEMENT: JSX.Element = <div />;\nrender(ELEMENT);\n',
  },
  {
    // The control the issue names: with no React annotation only
    // `global-const-style` speaks, and it converged even before the fix. A
    // regression that silenced BOTH rules would pass every case above while
    // failing this one.
    name: 'control: no React annotation, `global-const-style` alone',
    code: 'const element = { a: 1 };\n',
    output: 'const ELEMENT = { a: 1 } as const;\n',
  },
  {
    // The other side of the carve-out: a function value is outside
    // `global-const-style`, so this rule alone names it — and must still fix.
    name: 'control: a function value stays this rule s to name',
    code: 'const button: FC = () => <button />;\n',
    output: 'const Button: FC = () => <button />;\n',
  },
];

describe('enforce-react-type-naming and global-const-style converge (#1846)', () => {
  it('ships both rules as errors in the recommended config', () => {
    // The contradiction only reaches a consumer because both are on by default.
    expect(PAIR_IDS.map((id) => plugin.configs.recommended.rules[id])).toEqual([
      'error',
      'error',
    ]);
  });

  it.each(PAIR_CASES)('$name', ({ code, output }) => {
    const result = pairLinter.verifyAndFix(code, PAIR_CONFIG, FILENAME);

    expect(result.output).toBe(output);
    // (a) the written file is clean under BOTH rules...
    expect(lintPair(result.output)).toEqual([]);
    // (b) ...and carries no identifier a fixer war produced.
    expect(mangledNamesIn(result.output)).toEqual([]);
    // Re-fixing a fixpoint is a no-op; anything else means the pass cap, not
    // agreement, is what stopped the loop.
    expect(
      pairLinter.verifyAndFix(result.output, PAIR_CONFIG, FILENAME).output,
    ).toBe(output);
  });

  it('detects a mangled identifier (control)', () => {
    // The exact name `--fix` wrote before this fix. A `toEqual([])` assertion
    // over a predicate that accepts everything passes forever.
    expect(
      mangledNamesIn('const e_LEMENT: JSX.Element = <div>Hello</div>;\n'),
    ).toEqual(['e_LEMENT']);
    expect(mangledNamesIn('const ELEMENT = 1;\nlet myThing = 2;\n')).toEqual(
      [],
    );
  });

  it('hears from both rules (machinery control)', () => {
    // A misassembled config reports nothing and makes every case above pass
    // vacuously, so each rule is made to speak on an input only it objects to.
    expect(
      lintPair('function f(Child: ReactNode) { return Child; }\n'),
    ).toEqual([
      `${PREFIX}enforce-react-type-naming:reactNodeShouldBeLowercase`,
    ]);
    expect(lintPair('const thing = { a: 1 };\n')).toEqual([
      `${PREFIX}global-const-style:asConst`,
      `${PREFIX}global-const-style:upperSnakeCase`,
    ]);
  });
});
