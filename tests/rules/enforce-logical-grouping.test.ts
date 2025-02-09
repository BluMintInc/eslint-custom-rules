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
      const handleClose = () => {
        setIsOpen(false);
      };
      
      const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsOpen(true);
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

    // Edge case: Multiple hooks with shared dependencies
    `
      const [count, setCount] = useState(0);
      const [total, setTotal] = useState(0);
      const [average, setAverage] = useState(0);

      useEffect(() => {
        setAverage(total / count);
      }, [count, total]);

      const increment = () => {
        setCount(c => c + 1);
        setTotal(t => t + 1);
      };
    `,

    // Edge case: Complex conditional hooks
    `
      const { data } = useQuery();
      const isAdmin = useIsAdmin();

      const mutation = isAdmin
        ? useMutation(adminEndpoint)
        : useMutation(userEndpoint);

      const handleSubmit = () => {
        mutation.mutate(data);
      };
    `,

    // Edge case: Hooks in try-catch blocks
    `
      try {
        const { data } = useQuery();
        const { mutate } = useMutation();

        if (!data) throw new Error('No data');

        return <div>{data.map(mutate)}</div>;
      } catch (error) {
        return <ErrorBoundary error={error} />;
      }
    `,

    // Edge case: Hooks with complex dependency arrays
    `
      const [state, setState] = useState(initialState);
      const prevState = usePrevious(state);
      const stateRef = useRef(state);

      useEffect(() => {
        if (state !== prevState) {
          stateRef.current = state;
        }
      }, [state, prevState]);

      const resetState = useCallback(() => {
        setState(initialState);
      }, []);
    `,

    // Edge case: Multiple context providers and consumers
    `
      const theme = useTheme();
      const user = useUser();
      const settings = useSettings();

      const contextValue = useMemo(
        () => ({ theme, user, settings }),
        [theme, user, settings]
      );

      return (
        <AppContext.Provider value={contextValue}>
          <Component />
        </AppContext.Provider>
      );
    `,

    // Edge case: Complex hook composition
    `
      const useComposedHook = () => {
        const [state1] = useState(1);
        const [state2] = useState(2);

        const derived = useMemo(
          () => ({ sum: state1 + state2 }),
          [state1, state2]
        );

        const effect = useCallback(
          () => console.log(derived),
          [derived]
        );

        useEffect(() => {
          effect();
        }, [effect]);

        return derived;
      };
    `,

    // Edge case: Hooks with TypeScript generics
    `
      const { data } = useQuery<User[]>();
      const { mutate } = useMutation<User, Error>();

      const processedData = useMemo<ProcessedUser[]>(
        () => data?.map(processUser) ?? [],
        [data]
      );

      const handleUpdate = useCallback<UpdateHandler>(
        (user) => mutate(user),
        [mutate]
      );
    `,

    // Edge case: Hooks with async operations
    `
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState<Error | null>(null);
      const [data, setData] = useState<Data | null>(null);

      const fetchData = useCallback(async () => {
        setLoading(true);
        try {
          const result = await api.fetch();
          setData(result);
        } catch (e) {
          setError(e);
        } finally {
          setLoading(false);
        }
      }, []);

      useEffect(() => {
        fetchData();
      }, [fetchData]);
    `,

    // Edge case: Complex conditional rendering with hooks
    `
      const Component = () => {
        const [view, setView] = useState<'list' | 'grid'>('list');
        const listData = useListData();
        const gridData = useGridData();

        const data = useMemo(
          () => view === 'list' ? listData : gridData,
          [view, listData, gridData]
        );

        if (!data) {
          return useErrorBoundary();
        }

        return view === 'list' ? <ListView data={data} /> : <GridView data={data} />;
      };
    `,

    // Edge case: Hooks with cleanup
    `
      const [socket, setSocket] = useState<WebSocket | null>(null);
      const [messages, setMessages] = useState<Message[]>([]);

      useEffect(() => {
        const ws = new WebSocket(URL);
        setSocket(ws);

        ws.onmessage = (event) => {
          setMessages(prev => [...prev, event.data]);
        };

        return () => {
          ws.close();
          setSocket(null);
        };
      }, []);

      const sendMessage = useCallback(
        (message: string) => socket?.send(message),
        [socket]
      );
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

    // Edge case: Multiple hooks with shared dependencies in wrong order
    {
      code: `
        const increment = () => {
          setCount(c => c + 1);
          setTotal(t => t + 1);
        };

        const [count, setCount] = useState(0);
        const [total, setTotal] = useState(0);
        const [average, setAverage] = useState(0);

        useEffect(() => {
          setAverage(total / count);
        }, [count, total]);
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const [count, setCount] = useState(0);
        const [total, setTotal] = useState(0);
        const [average, setAverage] = useState(0);

        useEffect(() => {
          setAverage(total / count);
        }, [count, total]);

        const increment = () => {
          setCount(c => c + 1);
          setTotal(t => t + 1);
        };
      `,
    },

    // Edge case: Complex conditional hooks with scattered dependencies
    {
      code: `
        const handleSubmit = () => {
          mutation.mutate(data);
        };

        const { data } = useQuery();
        const isAdmin = useIsAdmin();

        const mutation = isAdmin
          ? useMutation(adminEndpoint)
          : useMutation(userEndpoint);
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const isAdmin = useIsAdmin();

        const mutation = isAdmin
          ? useMutation(adminEndpoint)
          : useMutation(userEndpoint);

        const { data } = useQuery();
        const handleSubmit = () => {
          mutation.mutate(data);
        };
      `,
    },

    // Edge case: Hooks in try-catch with scattered dependencies
    {
      code: `
        const ErrorComponent = () => <div>Error</div>;

        try {
          const { mutate } = useMutation();
          const { data } = useQuery();

          if (!data) throw new Error('No data');

          const processedData = data.map(item => item.id);
          return <div>{processedData}</div>;
        } catch (error) {
          return <ErrorComponent error={error} />;
        }
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        try {
          const { data } = useQuery();
          const { mutate } = useMutation();

          if (!data) throw new Error('No data');

          const processedData = data.map(item => item.id);
          return <div>{processedData}</div>;
        } catch (error) {
          const ErrorComponent = () => <div>Error</div>;
          return <ErrorComponent error={error} />;
        }
      `,
    },

    // Edge case: Complex hook composition with scattered dependencies
    {
      code: `
        const effect = useCallback(
          () => console.log(derived),
          [derived]
        );

        const [state1] = useState(1);
        const [state2] = useState(2);

        const derived = useMemo(
          () => ({ sum: state1 + state2 }),
          [state1, state2]
        );

        useEffect(() => {
          effect();
        }, [effect]);
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const [state1] = useState(1);
        const [state2] = useState(2);

        const derived = useMemo(
          () => ({ sum: state1 + state2 }),
          [state1, state2]
        );

        const effect = useCallback(
          () => console.log(derived),
          [derived]
        );

        useEffect(() => {
          effect();
        }, [effect]);
      `,
    },

    // Edge case: Hooks with TypeScript generics and scattered dependencies
    {
      code: `
        const { data } = useQuery<User[]>();
        const { mutate } = useMutation<User, Error>();
        
        const handleUpdate = useCallback<UpdateHandler>(
          (user) => mutate(user),
          [mutate]
        );

        const processedData = useMemo<ProcessedUser[]>(
          () => data?.map(processUser) ?? [],
          [data]
        );
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const { data } = useQuery<User[]>();
        const processedData = useMemo<ProcessedUser[]>(
          () => data?.map(processUser) ?? [],
          [data]
        );

        const { mutate } = useMutation<User, Error>();
        const handleUpdate = useCallback<UpdateHandler>(
          (user) => mutate(user),
          [mutate]
        );
      `,
    },

    // Edge case: Complex conditional rendering with scattered hooks
    {
      code: `
        const data = useMemo(
          () => view === 'list' ? listData : gridData,
          [view, listData, gridData]
        );

        const [view, setView] = useState<'list' | 'grid'>('list');
        const listData = useListData();
        const gridData = useGridData();

        if (!data) {
          return useErrorBoundary();
        }
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const [view, setView] = useState<'list' | 'grid'>('list');
        const listData = useListData();
        const gridData = useGridData();

        const data = useMemo(
          () => view === 'list' ? listData : gridData,
          [view, listData, gridData]
        );

        if (!data) {
          return useErrorBoundary();
        }
      `,
    },

    // Edge case: Hooks with cleanup and scattered dependencies
    {
      code: `
        const sendMessage = useCallback(
          (message: string) => socket?.send(message),
          [socket]
        );

        const [socket, setSocket] = useState<WebSocket | null>(null);
        const [messages, setMessages] = useState<Message[]>([]);

        useEffect(() => {
          const ws = new WebSocket(URL);
          setSocket(ws);

          ws.onmessage = (event) => {
            setMessages(prev => [...prev, event.data]);
          };

          return () => {
            ws.close();
            setSocket(null);
          };
        }, []);
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const [socket, setSocket] = useState<WebSocket | null>(null);
        const [messages, setMessages] = useState<Message[]>([]);

        useEffect(() => {
          const ws = new WebSocket(URL);
          setSocket(ws);

          ws.onmessage = (event) => {
            setMessages(prev => [...prev, event.data]);
          };

          return () => {
            ws.close();
            setSocket(null);
          };
        }, []);

        const sendMessage = useCallback(
          (message: string) => socket?.send(message),
          [socket]
        );
      `,
    },
  ],
});
