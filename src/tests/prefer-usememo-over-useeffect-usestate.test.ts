import { ESLintUtils } from '@typescript-eslint/utils';
import { preferUseMemoOverUseEffectUseState } from '../rules/prefer-usememo-over-useeffect-usestate';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run(
  'prefer-usememo-over-useeffect-usestate',
  preferUseMemoOverUseEffectUseState,
  {
    valid: [
      // Valid case: using useMemo for computation
      {
        code: `
        function Component({ dependency }) {
          const computedValue = useMemo(() => expensiveCalculation(dependency), [dependency]);
          return <div>{computedValue}</div>;
        }
      `,
      },
      // Valid case: useEffect with side effects
      {
        code: `
        function Component({ dependency }) {
          const [data, setData] = useState(null);

          useEffect(() => {
            fetchData().then(setData);
          }, [dependency]);

          return <div>{data}</div>;
        }
      `,
      },
      // Valid case: useEffect with multiple statements
      {
        code: `
        function Component({ dependency }) {
          const [value, setValue] = useState(0);

          useEffect(() => {
            setValue(computeValue(dependency));
            logSomething();
          }, [dependency]);

          return <div>{value}</div>;
        }
      `,
      },
      // Valid case: useEffect with multiple state updates
      {
        code: `
        function Component({ dependency }) {
          const [value1, setValue1] = useState(0);
          const [value2, setValue2] = useState(0);

          useEffect(() => {
            setValue1(computeValue1(dependency));
            setValue2(computeValue2(dependency));
          }, [dependency]);

          return <div>{value1} {value2}</div>;
        }
      `,
      },
    ],
    invalid: [
      // Invalid case: simple computation in useEffect
      {
        code: `
        function Component({ dependency }) {
          const [computedValue, setComputedValue] = useState(0);

          useEffect(() => {
            setComputedValue(expensiveCalculation(dependency));
          }, [dependency]);

          return <div>{computedValue}</div>;
        }
      `,
        errors: [{ messageId: 'preferUseMemo' }],
        output: `
        function Component({ dependency }) {
          const computedValue = useMemo(() => expensiveCalculation(dependency), [dependency]);

          ;

          return <div>{computedValue}</div>;
        }
      `,
      },
      // Invalid case: computation with object literal
      {
        code: `
        function Component({ a, b }) {
          const [config, setConfig] = useState({});

          useEffect(() => {
            setConfig({ a, b, computed: a + b });
          }, [a, b]);

          return <MyComponent config={config} />;
        }
      `,
        errors: [{ messageId: 'preferUseMemo' }],
        output: `
        function Component({ a, b }) {
          const config = useMemo(() => ({ a, b, computed: a + b }), [a, b]);

          ;

          return <MyComponent config={config} />;
        }
      `,
      },
      // Invalid case: computation with array literal
      {
        code: `
        function Component({ items }) {
          const [processedItems, setProcessedItems] = useState([]);

          useEffect(() => {
            setProcessedItems(items.map(item => transformItem(item)));
          }, [items]);

          return <List items={processedItems} />;
        }
      `,
        errors: [{ messageId: 'preferUseMemo' }],
        output: `
        function Component({ items }) {
          const processedItems = useMemo(() => items.map(item => transformItem(item)), [items]);

          ;

          return <List items={processedItems} />;
        }
      `,
      },
      // Invalid case: computation with function that has "compute" prefix
      {
        code: `
        function Component({ data }) {
          const [result, setResult] = useState(null);

          useEffect(() => {
            setResult(computeResult(data));
          }, [data]);

          return <div>{result}</div>;
        }
      `,
        errors: [{ messageId: 'preferUseMemo' }],
        output: `
        function Component({ data }) {
          const result = useMemo(() => computeResult(data), [data]);

          ;

          return <div>{result}</div>;
        }
      `,
      },
    ],
  },
);
