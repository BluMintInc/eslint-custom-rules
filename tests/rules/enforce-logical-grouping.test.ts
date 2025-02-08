import { ruleTesterTs } from '../utils/ruleTester';
import { enforceLogicalGrouping } from '../../src/rules/enforce-logical-grouping';

ruleTesterTs.run('enforce-logical-grouping', enforceLogicalGrouping, {
  valid: [
    // Early returns before other code
    `
      if (id !== null) {
        return null;
      }

      const a = props.group;
      const b = a;
    `,

    // Related declarations grouped together
    `
      const group = useGroupDoc();
      const { id } = group || {};

      const { groupTabState } = useGroupRouter();
    `,

    // Hooks maintain their order
    `
      const { data } = useQuery();
      const { mutate } = useMutation();
      const theme = useTheme();

      const processedData = data.map(item => item.id);
    `,

    // Logical order with side effects
    `
      console.log('Processing started');

      let results = [];
      for (const item of items) {
        results.push(processItem(item));
      }
    `,

    // Function expressions with dependencies
    `
      const userId = getUserId();

      const handler = (x: number) => {
        return x + userId;
      };
      console.log(handler(10));
    `,

    // Complex nested structures
    `
      const config = loadConfig();
      const { apiKey, endpoint } = config;

      async function fetchData() {
        const response = await fetch(endpoint);
        return response.json();
      }

      const data = fetchData();
    `,

    // Multiple early returns
    `
      if (!user) {
        return null;
      }

      if (!user.permissions.includes('admin')) {
        return <AccessDenied />;
      }

      const userData = processUserData(user);
      return <AdminPanel data={userData} />;
    `,

    // React hooks with dependencies
    `
      const [count, setCount] = useState(0);
      const increment = useCallback(() => setCount(c => c + 1), []);

      const [name, setName] = useState('');
    `,

    // Async/await patterns
    `
      const fetchConfig = async () => {
        const response = await api.get('/config');
        return response.data;
      };
      const config = await fetchConfig();

      const processConfig = (config) => {
        return config.features;
      };
      const features = processConfig(config);
    `,

    // TypeScript type definitions
    `
      type User = {
        id: string;
        name: string;
      };

      const user: User = {
        id: '123',
        name: 'John',
      };

      function processUser(u: User) {
        return u.name.toUpperCase();
      }
    `,

    // Event handlers and callbacks
    `
      const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsOpen(true);
      };

      const handleClose = () => {
        setIsOpen(false);
      };

      return <button onClick={handleClick}>Open</button>;
    `,

    // Complex object destructuring
    `
      const {
        user: { id, permissions },
        settings: { theme },
      } = props;

      const isAdmin = permissions.includes('admin');

      const styles = useStyles({ theme, isAdmin });
    `,
  ],
  invalid: [
    // Basic early return reordering
    {
      code: `
        const { a } = props.group;
        if (id !== null) {
          return null;
        }
        const b = a;
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        if (id !== null) {
          return null;
        }

        const { a } = props.group;
        const b = a;
      `,
    },

    // Hook-related declarations
    {
      code: `
        const group = useGroupDoc();
        const { groupTabState } = useGroupRouter();
        const { id } = group || {};
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const group = useGroupDoc();
        const { id } = group || {};


        const { groupTabState } = useGroupRouter();
      `,
    },

    // Side effects ordering
    {
      code: `
        let results = [];
        console.log('Processing started');
        for (const item of items) {
          results.push(processItem(item));
        }
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        console.log('Processing started');


        let results = [];
        for (const item of items) {
          results.push(processItem(item));
        }
      `,
    },

    // Function expressions with dependencies
    {
      code: `
        const handler = (x: number) => {
          return x + 1;
        };
        const userId = getUserId();
        console.log(handler(10));
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const userId = getUserId();

        const handler = (x: number) => {
          return x + 1;
        };
        console.log(handler(10));
      `,
    },

    // Multiple hooks and dependencies
    {
      code: `
        const [name, setName] = useState('');
        const theme = useTheme();
        const formatName = useCallback(() => name.toUpperCase(), [name]);
        const styles = { color: theme.primary };
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const [name, setName] = useState('');
        const formatName = useCallback(() => name.toUpperCase(), [name]);

        const theme = useTheme();
        const styles = { color: theme.primary };
      `,
    },

    // Complex object destructuring and initialization
    {
      code: `
        const data = fetchData();
        const { user } = props;
        const { id, permissions } = data;
        const isAdmin = user.role === 'admin';
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const data = fetchData();
        const { id, permissions } = data;

        const { user } = props;
        const isAdmin = user.role === 'admin';
      `,
    },

    // Event handlers and related state
    {
      code: `
        const handleSubmit = (e) => {
          e.preventDefault();
          submitForm(formData);
        };
        const [formData, setFormData] = useState({});
        const handleChange = (e) => setFormData(e.target.value);
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const [formData, setFormData] = useState({});
        const handleChange = (e) => setFormData(e.target.value);

        const handleSubmit = (e) => {
          e.preventDefault();
          submitForm(formData);
        };
      `,
    },

    // Async function declarations and usage
    {
      code: `
        const result = await fetchData();
        async function fetchData() {
          const response = await fetch('/api');
          return response.json();
        }
        console.log(result);
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        async function fetchData() {
          const response = await fetch('/api');
          return response.json();
        }

        const result = await fetchData();
        console.log(result);
      `,
    },

    // Type definitions and implementations
    {
      code: `
        function processUser(user: User) {
          return user.name;
        }
        type User = {
          id: string;
          name: string;
        };
        const user: User = { id: '1', name: 'John' };
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        type User = {
          id: string;
          name: string;
        };

        function processUser(user: User) {
          return user.name;
        }

        const user: User = { id: '1', name: 'John' };
      `,
    },

    // Complex React component structure
    {
      code: `
        const styles = useStyles();
        function MyComponent() {
          return <div>Hello</div>;
        }
        const [state, setState] = useState(null);
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        function MyComponent() {
          return <div>Hello</div>;
        }

        const styles = useStyles();
        const [state, setState] = useState(null);
      `,
    },
  ],
});
