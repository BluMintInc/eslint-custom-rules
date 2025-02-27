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
      output: 'const myComponent = <div>Hello</div>;',
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
      output: 'const element = <div>Hello</div>;',
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
      output: 'const Button = () => <button>Click me</button>;',
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
      output: 'const CardComponent = (props) => <div>{props.children}</div>;',
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
      output: 'const HeaderElement = () => <header>Header</header>;',
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
      output: 'function renderContent(element) { return Element; }',
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
      output: 'function useCustomHook(component) { return <Component />; }',
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
      output: 'const createComponent = (Component) => { return <component />; };',
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
      output: 'const withHOC = (Wrapper) => (props) => <wrapper {...props} />;',
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
      output: `
        const button = <button>Click</button>;
        const Card = () => <div>Card</div>;
        function render(element, Component) {
          return <component>{Element}</component>;
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
            const element = <div>Element</div>;
            return Element;
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
      output: `
        function useCustomHook() {
          const element = <div>Element</div>;
          const Component = () => <div>Component</div>;
          return { Element, component };
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
        const renderElement = function(element) {
          return Element;
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
          renderContent: (element) => Element,
          createComponent: (Component) => <component />
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
        const MyGenericComponent = <T,>(props) => {
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
        const MemoizedComponent = React.memo(function(props) {
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
            const element = <div ref={ref}>{props.children}</div>;
            return Element;
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
      output: `
        function withData(Component) {
          return function WithData(props: Props) {
            const data = <div>Data</div>;
            return <component {...props} data={Data} />;
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
          const element = props.condition
            ? <div>True</div>
            : <span>False</span>;

          const Component = () => props.condition
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
        const ListComponent = <T,>(props) => {
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
          const element = <div>Test</div>;
          return <div>{Element}</div>;
        }
      `,
    },
  ],
});
