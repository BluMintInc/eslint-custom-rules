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
  ],
  invalid: [
    // Issue #1357 repro: annotation must survive and references must follow.
    {
      code: `const Content: ReactNode = null;\nrender(Content);`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: `const content: ReactNode = null;\nrender(content);`,
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
      code: `const Content: ReactNode = null;\nconst wrapper = { Content };`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: `const content: ReactNode = null;\nconst wrapper = { Content: content };`,
    },

    // The target name is already bound in the declaration scope: renaming would
    // redeclare it, so the report stands without a fix.
    {
      code: `const Content: ReactNode = null;\nconst content = 1;\nrender(Content, content);`,
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
      code: `const Content: ReactNode = null;\nfunction read() { return Content; }`,
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'content',
          },
        },
      ],
      output: `const content: ReactNode = null;\nfunction read() { return content; }`,
    },

    // A binding of the target name sits between a reference and the
    // declaration, so the rewritten reference would resolve to it instead.
    {
      code: `const Content: ReactNode = null;\nfunction read() { const content = 1; return [Content, content]; }`,
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
      code: `const Content: ReactNode = null;\nfunction read() { const content = 1; return content; }\nrender(Content);`,
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
      code: `const Content: ReactNode = null;\nexport { Content };`,
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
    // the guard is scoped to the export contract, not blanket.
    {
      code: 'const Content: ReactNode = null;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: { type: 'ReactNode', suggestion: 'content' },
        },
      ],
      output: 'const content: ReactNode = null;',
    },

    // Invalid uppercase names for ReactNode
    {
      code: 'const MyComponent: ReactNode = <div>Hello</div>;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'ReactNode',
            suggestion: 'myComponent',
          },
        },
      ],
      output: 'const myComponent: ReactNode = <div>Hello</div>;',
    },
    {
      code: 'const Element: JSX.Element = <div>Hello</div>;',
      errors: [
        {
          messageId: 'reactNodeShouldBeLowercase',
          data: {
            type: 'JSX.Element',
            suggestion: 'element',
          },
        },
      ],
      output: 'const element: JSX.Element = <div>Hello</div>;',
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
        const Button: ReactNode = <button>Click</button>;
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
        const button: ReactNode = <button>Click</button>;
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
