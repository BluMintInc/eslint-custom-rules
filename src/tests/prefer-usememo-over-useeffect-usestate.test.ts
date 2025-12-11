import { ruleTesterJsx } from '../utils/ruleTester';
import { preferUseMemoOverUseEffectUseState } from '../rules/prefer-usememo-over-useeffect-usestate';

// We're using ruleTesterJsx since our tests contain JSX code
// Setting output: null for invalid tests to skip output checking
ruleTesterJsx.run(
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
      // Valid case: useEffect with state update based on previous state
      {
        code: `
        function Component({ increment }) {
          const [count, setCount] = useState(0);

          useEffect(() => {
            setCount(prevCount => prevCount + increment);
          }, [increment]);

          return <div>{count}</div>;
        }
      `,
      },
      // Valid case: useEffect with non-pure function call
      {
        code: `
        function Component({ userId }) {
          const [userData, setUserData] = useState(null);

          useEffect(() => {
            setUserData(processUserData(userId)); // processUserData doesn't match pure name patterns
          }, [userId]);

          return <div>{userData?.name}</div>;
        }
      `,
      },
      // Valid case: State synchronization with prop (direct reference)
      {
        code: `
        function Component({ isEditingProp }) {
          const [isEditingInternal, setIsEditingInternal] = useState(isEditingProp);

          useEffect(() => {
            setIsEditingInternal(isEditingProp);
          }, [isEditingProp]);

          return <div>{isEditingInternal ? 'Editing' : 'Viewing'}</div>;
        }
      `,
      },
      // Valid case: State synchronization with prop (using arrow function initializer)
      {
        code: `
        function Component({ isEditingProp }) {
          const [isEditingInternal, setIsEditingInternal] = useState(() => isEditingProp);

          useEffect(() => {
            setIsEditingInternal(isEditingProp);
          }, [isEditingProp]);

          return <div>{isEditingInternal ? 'Editing' : 'Viewing'}</div>;
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
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'computedValue' },
          },
        ],
        output: null, // Skip output checking
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
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'config' },
          },
        ],
        output: null, // Skip output checking
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
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'processedItems' },
          },
        ],
        output: null, // Skip output checking
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
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'result' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with function that has "calculate" prefix
      {
        code: `
        function Component({ numbers }) {
          const [sum, setSum] = useState(0);

          useEffect(() => {
            setSum(calculateTotal(numbers));
          }, [numbers]);

          return <div>Total: {sum}</div>;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'sum' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with function that has "format" prefix
      {
        code: `
        function Component({ date }) {
          const [formattedDate, setFormattedDate] = useState('');

          useEffect(() => {
            setFormattedDate(formatDate(date));
          }, [date]);

          return <div>{formattedDate}</div>;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'formattedDate' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with function that has "transform" prefix
      {
        code: `
        function Component({ data }) {
          const [transformed, setTransformed] = useState(null);

          useEffect(() => {
            setTransformed(transformData(data));
          }, [data]);

          return <div>{transformed}</div>;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'transformed' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with function that has "convert" prefix
      {
        code: `
        function Component({ celsius }) {
          const [fahrenheit, setFahrenheit] = useState(0);

          useEffect(() => {
            setFahrenheit(convertToFahrenheit(celsius));
          }, [celsius]);

          return <div>{fahrenheit}°F</div>;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'fahrenheit' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with function that has "get" prefix
      {
        code: `
        function Component({ user }) {
          const [fullName, setFullName] = useState('');

          useEffect(() => {
            setFullName(getFullName(user));
          }, [user]);

          return <div>{fullName}</div>;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'fullName' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with function that has "derive" prefix
      {
        code: `
        function Component({ basePrice, taxRate }) {
          const [totalPrice, setTotalPrice] = useState(0);

          useEffect(() => {
            setTotalPrice(deriveTotalPrice(basePrice, taxRate));
          }, [basePrice, taxRate]);

          return <div>Total: {totalPrice}</div>;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'totalPrice' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with function that has "create" prefix
      {
        code: `
        function Component({ data }) {
          const [chart, setChart] = useState(null);

          useEffect(() => {
            setChart(createChartConfig(data));
          }, [data]);

          return <Chart config={chart} />;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'chart' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with array method (map)
      {
        code: `
        function Component({ users }) {
          const [userNames, setUserNames] = useState([]);

          useEffect(() => {
            setUserNames(users.map(user => user.name));
          }, [users]);

          return <UserList names={userNames} />;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'userNames' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with array method (filter)
      {
        code: `
        function Component({ items }) {
          const [activeItems, setActiveItems] = useState([]);

          useEffect(() => {
            setActiveItems(items.filter(item => item.isActive));
          }, [items]);

          return <ItemList items={activeItems} />;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'activeItems' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with array method (reduce)
      {
        code: `
        function Component({ transactions }) {
          const [total, setTotal] = useState(0);

          useEffect(() => {
            setTotal(transactions.reduce((sum, tx) => sum + tx.amount, 0));
          }, [transactions]);

          return <div>Total: {total}</div>;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'total' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with nested object destructuring
      {
        code: `
        function Component({ user }) {
          const [displayInfo, setDisplayInfo] = useState({});

          useEffect(() => {
            setDisplayInfo({
              name: user.profile.name,
              avatar: user.profile.avatar,
              role: user.settings.role
            });
          }, [user]);

          return <UserProfile info={displayInfo} />;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'displayInfo' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with template literals
      {
        code: `
        function Component({ firstName, lastName }) {
          const [fullName, setFullName] = useState('');

          useEffect(() => {
            setFullName(\`\${firstName} \${lastName}\`);
          }, [firstName, lastName]);

          return <div>{fullName}</div>;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'fullName' },
          },
        ],
        output: null, // Skip output checking
      },
      // Invalid case: computation with ternary operator
      {
        code: `
        function Component({ isAdmin, userData }) {
          const [displayData, setDisplayData] = useState(null);

          useEffect(() => {
            setDisplayData(isAdmin ? userData.adminView : userData.userView);
          }, [isAdmin, userData]);

          return <DataDisplay data={displayData} />;
        }
      `,
        errors: [
          {
            messageId: 'preferUseMemo',
            data: { stateName: 'displayData' },
          },
        ],
        output: null, // Skip output checking
      },
    ],
  },
);
