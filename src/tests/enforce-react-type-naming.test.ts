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
  ],
});
