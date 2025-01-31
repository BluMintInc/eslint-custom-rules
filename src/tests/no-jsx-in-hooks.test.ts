import { ruleTesterJsx } from '../utils/ruleTester';
import { noJsxInHooks } from '../rules/no-jsx-in-hooks';

ruleTesterJsx.run('no-jsx-in-hooks', noJsxInHooks, {
  valid: [
    // Valid hook that returns a non-JSX value
    {
      code: `
        const useCounter = () => {
          const [count, setCount] = useState(0);
          return { count, setCount };
        };
      `,
    },
    // Valid hook that returns a function
    {
      code: `
        const useRenderCallback = () => {
          return (props: Props) => {
            return props.value;
          };
        };
      `,
    },
    // Valid hook with useMemo returning non-JSX
    {
      code: `
        const useComputedValue = () => {
          return useMemo(() => {
            return { value: 42 };
          }, []);
        };
      `,
    },
    // Valid hook that returns an object with JSX property
    {
      code: `
        const useComponentProps = () => {
          return { element: <div>Component</div> };
        };
      `,
    },
    // Valid function declaration hook
    {
      code: `
        function useData() {
          const [data, setData] = useState(null);
          return data;
        }
      `,
    },
  ],
  invalid: [
    // Invalid hook that directly returns JSX
    {
      code: `
        const useLivestreamPlayer = ({ placeholder, playbackId }) => {
          return <div>Livestream Player</div>;
        };
      `,
      errors: [{ messageId: 'noJsxInHooks' }],
    },
    // Invalid hook that returns JSX via useMemo
    {
      code: `
        const useGetElement = () => {
          return useMemo(() => <div>Element</div>, []);
        };
      `,
      errors: [{ messageId: 'noJsxInHooks' }],
    },
    // Invalid hook with explicit ReactNode return type
    {
      code: `
        const useElement = (): ReactNode => {
          return <div>Element</div>;
        };
      `,
      errors: [{ messageId: 'noJsxInHooks' }],
    },
    // Invalid function declaration hook
    {
      code: `
        function useHeader() {
          return <header>App Header</header>;
        }
      `,
      errors: [{ messageId: 'noJsxInHooks' }],
    },
    // Invalid hook with JSX.Element return type
    {
      code: `
        const useNavigation = (): JSX.Element => {
          return <nav>Navigation</nav>;
        };
      `,
      errors: [{ messageId: 'noJsxInHooks' }],
    },
    // Invalid hook with block body and JSX return
    {
      code: `
        const useComplexElement = () => {
          const value = 42;
          return <div>{value}</div>;
        };
      `,
      errors: [{ messageId: 'noJsxInHooks' }],
    },
  ],
});
