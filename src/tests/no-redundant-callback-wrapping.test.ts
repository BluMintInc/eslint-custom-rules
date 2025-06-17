import { ruleTesterJsx } from '../utils/ruleTester';
import { noRedundantCallbackWrapping } from '../rules/no-redundant-callback-wrapping';

ruleTesterJsx.run(
  'no-redundant-callback-wrapping',
  noRedundantCallbackWrapping,
  {
    valid: [
      // ===== BASIC VALID CASES =====

      // Valid: Function not from a hook
      {
        code: `
        function SignInButton() {
          const handleClick = () => console.log('click');
          const memoizedHandler = useCallback(() => {
            handleClick();
          }, [handleClick]);
          return <button onClick={memoizedHandler}>Sign In</button>;
        }
      `,
      },

      // Valid: Function with substantial additional logic
      {
        code: `
        function SignInButton() {
          const { signIn } = useAuthSubmit();
          const handleSignIn = useCallback(() => {
            trackEvent('sign_in_attempt');
            signIn();
            setSomeLocalState(true);
          }, [signIn, trackEvent, setSomeLocalState]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },

      // Valid: Parameter transformation
      {
        code: `
        function UserForm() {
          const { updateUser } = useUserContext();
          const handleSubmit = useCallback((event) => {
            event.preventDefault();
            const formData = new FormData(event.target);
            updateUser(userId, Object.fromEntries(formData));
          }, [updateUser, userId]);
          return <form onSubmit={handleSubmit}></form>;
        }
      `,
      },

      // Valid: Multiple dependencies with arguments
      {
        code: `
        function SignInButton() {
          const { signIn } = useAuthSubmit();
          const [username, setUsername] = useState('');
          const handleSignInWithUsername = useCallback(() => {
            signIn(username);
          }, [signIn, username]);
          return <button onClick={handleSignInWithUsername}>Sign In</button>;
        }
      `,
      },

      // Valid: Direct function usage (no wrapping)
      {
        code: `
        function SignInButton() {
          const { signIn } = useAuthSubmit();
          return <button onClick={signIn}>Sign In</button>;
        }
      `,
      },

      // ===== COMPLEX LOGIC EDGE CASES =====

      // Valid: Conditional logic with if/else
      {
        code: `
        function Component() {
          const { signIn } = useAuthSubmit();
          const handleSignIn = useCallback(() => {
            if (isReady) {
              signIn();
            } else {
              showError();
            }
          }, [signIn, isReady, showError]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },

      // Valid: Switch statement logic
      {
        code: `
        function Component() {
          const { process } = useDataProcessor();
          const handleProcess = useCallback((type) => {
            switch (type) {
              case 'fast':
                process({ mode: 'fast' });
                break;
              case 'slow':
                process({ mode: 'slow' });
                break;
              default:
                process();
            }
          }, [process]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // Valid: Try/catch error handling
      {
        code: `
        function Component() {
          const { save } = useSaveHandler();
          const handleSave = useCallback(async () => {
            try {
              await save();
              showSuccess();
            } catch (error) {
              showError(error);
            }
          }, [save, showSuccess, showError]);
          return <button onClick={handleSave}>Save</button>;
        }
      `,
      },

      // Valid: Async/await patterns
      {
        code: `
        function Component() {
          const { fetchData } = useDataFetcher();
          const handleFetch = useCallback(async () => {
            setLoading(true);
            const result = await fetchData();
            setData(result);
            setLoading(false);
          }, [fetchData, setLoading, setData]);
          return <button onClick={handleFetch}>Fetch</button>;
        }
      `,
      },

      // Valid: Loop/iteration logic
      {
        code: `
        function Component() {
          const { processItem } = useItemProcessor();
          const handleProcessAll = useCallback(() => {
            items.forEach(item => {
              processItem(item.id);
            });
            setProcessed(true);
          }, [processItem, items, setProcessed]);
          return <button onClick={handleProcessAll}>Process All</button>;
        }
      `,
      },

      // Valid: Complex parameter destructuring
      {
        code: `
        function Component() {
          const { updateData } = useDataContext();
          const handleUpdate = useCallback(({ target: { value, dataset: { id } } }) => {
            const processedValue = value.trim().toLowerCase();
            updateData(id, processedValue);
          }, [updateData]);
          return <input onChange={handleUpdate} />;
        }
      `,
      },

      // Valid: Return value transformation
      {
        code: `
        function Component() {
          const { calculate } = useCalculator();
          const handleCalculate = useCallback(() => {
            const result = calculate();
            return result * 2 + offset;
          }, [calculate, offset]);
          return <button onClick={handleCalculate}>Calculate</button>;
        }
      `,
      },

      // Valid: Multiple function calls
      {
        code: `
        function Component() {
          const { signIn } = useAuthSubmit();
          const handleSignIn = useCallback(() => {
            analytics.track('sign_in_start');
            signIn();
            router.push('/dashboard');
          }, [signIn, analytics, router]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },

      // Valid: Complex object/array operations
      {
        code: `
        function Component() {
          const { updateUser } = useUserContext();
          const handleUpdate = useCallback(() => {
            const updatedUser = {
              ...currentUser,
              lastActive: Date.now(),
              preferences: {
                ...currentUser.preferences,
                theme: isDark ? 'dark' : 'light'
              }
            };
            updateUser(updatedUser);
          }, [updateUser, currentUser, isDark]);
          return <button onClick={handleUpdate}>Update</button>;
        }
      `,
      },

      // Valid: Method chaining
      {
        code: `
        function Component() {
          const { processData } = useDataProcessor();
          const handleProcess = useCallback(() => {
            const result = data
              .filter(item => item.active)
              .map(item => ({ ...item, processed: true }));
            processData(result);
          }, [processData, data]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // ===== PARAMETER USAGE EDGE CASES =====

      // Valid: Complex parameter usage with spread
      {
        code: `
        function Component() {
          const { updateSettings } = useSettingsContext();
          const handleUpdate = useCallback((event, ...args) => {
            const [type, value] = args;
            updateSettings({ [type]: value, timestamp: event.timeStamp });
          }, [updateSettings]);
          return <button onClick={handleUpdate}>Update</button>;
        }
      `,
      },

      // Valid: Parameter used in complex expression
      {
        code: `
        function Component() {
          const { search } = useSearchContext();
          const handleSearch = useCallback((query) => {
            const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, ' ');
            search(normalizedQuery);
          }, [search]);
          return <input onChange={handleSearch} />;
        }
      `,
      },

      // Valid: Parameter used conditionally
      {
        code: `
        function Component() {
          const { submit } = useFormContext();
          const handleSubmit = useCallback((event) => {
            if (event.ctrlKey) {
              event.preventDefault();
              submit({ draft: true });
            } else {
              submit();
            }
          }, [submit]);
          return <form onSubmit={handleSubmit}></form>;
        }
      `,
      },

      // ===== NON-HOOK SOURCES =====

      // Valid: Function from regular import
      {
        code: `
        import { processData } from './utils';
        function Component() {
          const handleProcess = useCallback(() => {
            processData();
          }, []);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // Valid: Function from props
      {
        code: `
        function Component({ onSubmit }) {
          const handleSubmit = useCallback(() => {
            onSubmit();
          }, [onSubmit]);
          return <form onSubmit={handleSubmit}></form>;
        }
      `,
      },

      // Valid: Function from context (not hook pattern)
      {
        code: `
        function Component() {
          const context = useContext(MyContext);
          const handleClick = useCallback(() => {
            context.action();
          }, [context]);
          return <button onClick={handleClick}>Click</button>;
        }
      `,
      },

      // ===== COMPLEX DEPENDENCY PATTERNS =====

      // Valid: Computed property in dependencies
      {
        code: `
        function Component() {
          const { update } = useDataUpdater();
          const handleUpdate = useCallback(() => {
            update(data[currentIndex]);
          }, [update, data[currentIndex]]);
          return <button onClick={handleUpdate}>Update</button>;
        }
      `,
      },

      // Valid: Function with closure variables
      {
        code: `
        function Component() {
          const { process } = useProcessor();
          const multiplier = 2;
          const handleProcess = useCallback(() => {
            const result = process() * multiplier;
            setResult(result);
          }, [process, setResult]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // ===== MEMOIZATION WRAPPER VARIATIONS =====

      // Valid: useMemo for complex objects
      {
        code: `
        function Component() {
          const { signIn } = useAuthSubmit();
          const config = useMemo(() => ({
            onSubmit: signIn,
            validation: true,
            timeout: 5000
          }), [signIn]);
          return <Form config={config} />;
        }
      `,
      },

      // Valid: useDeepCompareCallback with complex dependencies
      {
        code: `
        function Component() {
          const { signIn } = useAuthSubmit();
          const handleSignIn = useDeepCompareCallback(() => {
            signIn(complexObject);
          }, [signIn, complexObject]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },

      // ===== EDGE CASES WITH MEMBER ACCESS =====

      // Valid: Method access on memoized object with additional logic
      {
        code: `
        function Component() {
          const authSubmit = useAuthSubmit();
          const handleSignIn = useCallback(() => {
            if (authSubmit.isReady) {
              authSubmit.signIn();
            }
          }, [authSubmit]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },

      // ===== TYPESCRIPT SPECIFIC CASES =====

      // Valid: Function with type assertions
      {
        code: `
        function Component() {
          const { process } = useProcessor();
          const handleProcess = useCallback((data: unknown) => {
            process(data as ProcessableData);
          }, [process]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // Valid: Generic function usage
      {
        code: `
        function Component<T>() {
          const { process } = useProcessor<T>();
          const handleProcess = useCallback((item: T) => {
            process(item);
            setProcessed(true);
          }, [process, setProcessed]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // ===== CUSTOM HOOK PATTERNS =====

      // Valid: Custom hook pattern not matching default patterns
      {
        code: `
        function Component() {
          const { process } = getProcessor(); // Not a hook
          const handleProcess = useCallback(() => {
            process();
          }, [process]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // Valid: Hook with non-standard naming
      {
        code: `
        function Component() {
          const { action } = createHandler(); // Not matching use* pattern
          const handleAction = useCallback(() => {
            action();
          }, [action]);
          return <button onClick={handleAction}>Action</button>;
        }
      `,
      },

      // ===== COMPLEX SCENARIOS =====

      // Valid: Nested components with multiple hooks
      {
        code: `
        function Component() {
          const { signIn } = useAuthSubmit();
          const { track } = useAnalytics();
          const handleSignIn = useCallback(() => {
            track('sign_in_attempt');
            signIn();
            track('sign_in_complete');
          }, [signIn, track]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },

      // Valid: Higher-order component pattern
      {
        code: `
        function withAuth(Component) {
          return function AuthComponent(props) {
            const { signIn } = useAuthSubmit();
            const handleAuth = useCallback(() => {
              if (props.requireAuth) {
                signIn();
              }
            }, [signIn, props.requireAuth]);
            return <Component {...props} onAuth={handleAuth} />;
          };
        }
      `,
      },

      // ===== PREVENT FALSE POSITIVES =====

      // Valid: preventDefault only (should be allowed as non-substantial)
      {
        code: `
        function Component() {
          const { submit } = useFormContext();
          const handleSubmit = useCallback((event) => {
            event.preventDefault();
            submit();
          }, [submit]);
          return <form onSubmit={handleSubmit}></form>;
        }
      `,
      },

      // Valid: Simple variable assignment before call
      {
        code: `
        function Component() {
          const { process } = useProcessor();
          const handleProcess = useCallback(() => {
            const timestamp = Date.now();
            process({ timestamp });
          }, [process]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // Valid: Console.log with memoized function (debugging)
      {
        code: `
        function Component() {
          const { signIn } = useAuthSubmit();
          const handleSignIn = useCallback(() => {
            console.log('Signing in...');
            signIn();
            console.log('Sign in complete');
          }, [signIn]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },

      // Valid: Promise/callback patterns
      {
        code: `
        function Component() {
          const { fetchData } = useDataFetcher();
          const handleFetch = useCallback(() => {
            fetchData().then(result => {
              setData(result);
            }).catch(error => {
              setError(error);
            });
          }, [fetchData, setData, setError]);
          return <button onClick={handleFetch}>Fetch</button>;
        }
      `,
      },

      // Valid: Function used in complex expression
      {
        code: `
        function Component() {
          const { calculate } = useCalculator();
          const handleCalculate = useCallback(() => {
            const result = Math.max(0, calculate() + offset);
            setResult(result);
          }, [calculate, offset, setResult]);
          return <button onClick={handleCalculate}>Calculate</button>;
        }
      `,
      },
    ],

    invalid: [
      // ===== BASIC INVALID CASES =====

      // Invalid: Simple redundant wrapping
      {
        code: `
        function SignInButton() {
          const { signIn } = useAuthSubmit();
          const handleSignIn = useCallback(() => {
            signIn();
          }, [signIn]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'signIn',
              hookName: 'useAuthSubmit',
            },
          },
        ],
        output: `
        function SignInButton() {
          const { signIn } = useAuthSubmit();
          const handleSignIn = signIn;
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },

      // Invalid: Expression body redundant wrapping
      {
        code: `
        function Component() {
          const { process } = useProcessor();
          const handleProcess = useCallback(() => process(), [process]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'process',
              hookName: 'useProcessor',
            },
          },
        ],
        output: `
        function Component() {
          const { process } = useProcessor();
          const handleProcess = process;
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // Invalid: useMemo redundant wrapping
      {
        code: `
        function Component() {
          const { calculate } = useCalculator();
          const memoizedCalculate = useMemo(() => () => calculate(), [calculate]);
          return <button onClick={memoizedCalculate}>Calculate</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useMemo',
              functionName: 'calculate',
              hookName: 'useCalculator',
            },
          },
        ],
        output: `
        function Component() {
          const { calculate } = useCalculator();
          const memoizedCalculate = calculate;
          return <button onClick={memoizedCalculate}>Calculate</button>;
        }
      `,
      },

      // ===== MULTIPLE FUNCTIONS =====

      // Invalid: Multiple functions from same hook
      {
        code: `
        function Component() {
          const { signIn, signOut } = useAuthSubmit();
          const handleSignIn = useCallback(() => {
            signIn();
          }, [signIn]);
          const handleSignOut = useCallback(() => {
            signOut();
          }, [signOut]);
          return (
            <div>
              <button onClick={handleSignIn}>Sign In</button>
              <button onClick={handleSignOut}>Sign Out</button>
            </div>
          );
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'signIn',
              hookName: 'useAuthSubmit',
            },
          },
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'signOut',
              hookName: 'useAuthSubmit',
            },
          },
        ],
        output: `
        function Component() {
          const { signIn, signOut } = useAuthSubmit();
          const handleSignIn = signIn;
          const handleSignOut = signOut;
          return (
            <div>
              <button onClick={handleSignIn}>Sign In</button>
              <button onClick={handleSignOut}>Sign Out</button>
            </div>
          );
        }
      `,
      },

      // ===== DESTRUCTURING PATTERNS =====

      // Invalid: Renamed destructuring
      {
        code: `
        function Component() {
          const { signIn: customSignIn } = useAuthSubmit();
          const handleSignIn = useCallback(() => {
            customSignIn();
          }, [customSignIn]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'customSignIn',
              hookName: 'useAuthSubmit',
            },
          },
        ],
        output: `
        function Component() {
          const { signIn: customSignIn } = useAuthSubmit();
          const handleSignIn = customSignIn;
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },

      // Invalid: Complex destructuring with renaming
      {
        code: `
        function Component() {
          const {
            submit: handleFormSubmit,
            validate: validateForm
          } = useFormHandler();
          const onSubmit = useCallback(() => {
            handleFormSubmit();
          }, [handleFormSubmit]);
          return <form onSubmit={onSubmit}></form>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'handleFormSubmit',
              hookName: 'useFormHandler',
            },
          },
        ],
        output: `
        function Component() {
          const {
            submit: handleFormSubmit,
            validate: validateForm
          } = useFormHandler();
          const onSubmit = handleFormSubmit;
          return <form onSubmit={onSubmit}></form>;
        }
      `,
      },

      // ===== DIFFERENT HOOK PATTERNS =====

      // Invalid: Function from custom hook with different naming
      {
        code: `
        function Component() {
          const { handleSubmit } = useFormHandler();
          const onSubmit = useCallback(() => {
            handleSubmit();
          }, [handleSubmit]);
          return <form onSubmit={onSubmit}></form>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'handleSubmit',
              hookName: 'useFormHandler',
            },
          },
        ],
        output: `
        function Component() {
          const { handleSubmit } = useFormHandler();
          const onSubmit = handleSubmit;
          return <form onSubmit={onSubmit}></form>;
        }
      `,
      },

      // Invalid: Function from context hook
      {
        code: `
        function Component() {
          const { updateSettings } = useSettingsContext();
          const handleUpdate = useCallback(() => {
            updateSettings();
          }, [updateSettings]);
          return <button onClick={handleUpdate}>Update</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'updateSettings',
              hookName: 'useSettingsContext',
            },
          },
        ],
        output: `
        function Component() {
          const { updateSettings } = useSettingsContext();
          const handleUpdate = updateSettings;
          return <button onClick={handleUpdate}>Update</button>;
        }
      `,
      },

      // Invalid: Function from data hook
      {
        code: `
        function Component() {
          const { process } = useDataProcessor();
          const handleProcess = useCallback(() => {
            process();
          }, [process]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'process',
              hookName: 'useDataProcessor',
            },
          },
        ],
        output: `
        function Component() {
          const { process } = useDataProcessor();
          const handleProcess = process;
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // ===== DIFFERENT MEMOIZATION WRAPPERS =====

      // Invalid: useDeepCompareCallback with simple wrapping
      {
        code: `
        function Component() {
          const { save } = useSaveHandler();
          const handleSave = useDeepCompareCallback(() => {
            save();
          }, [save]);
          return <button onClick={handleSave}>Save</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useDeepCompareCallback',
              functionName: 'save',
              hookName: 'useSaveHandler',
            },
          },
        ],
        output: `
        function Component() {
          const { save } = useSaveHandler();
          const handleSave = save;
          return <button onClick={handleSave}>Save</button>;
        }
      `,
      },

      // Invalid: useDeepCompareMemo with function wrapping
      {
        code: `
        function Component() {
          const { calculate } = useCalculationEngine();
          const memoizedCalculate = useDeepCompareMemo(() => () => calculate(), [calculate]);
          return <button onClick={memoizedCalculate}>Calculate</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useDeepCompareMemo',
              functionName: 'calculate',
              hookName: 'useCalculationEngine',
            },
          },
        ],
        output: `
        function Component() {
          const { calculate } = useCalculationEngine();
          const memoizedCalculate = calculate;
          return <button onClick={memoizedCalculate}>Calculate</button>;
        }
      `,
      },

      // ===== FUNCTION EXPRESSION VARIANTS =====

      // Invalid: Function expression instead of arrow function
      {
        code: `
        function Component() {
          const { delete: deleteItem } = useItemManager();
          const handleDelete = useCallback(function() {
            deleteItem();
          }, [deleteItem]);
          return <button onClick={handleDelete}>Delete</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'deleteItem',
              hookName: 'useItemManager',
            },
          },
        ],
        output: `
        function Component() {
          const { delete: deleteItem } = useItemManager();
          const handleDelete = deleteItem;
          return <button onClick={handleDelete}>Delete</button>;
        }
      `,
      },

      // Invalid: Named function expression
      {
        code: `
        function Component() {
          const { process } = useProcessor();
          const handleProcess = useCallback(function processHandler() {
            process();
          }, [process]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'process',
              hookName: 'useProcessor',
            },
          },
        ],
        output: `
        function Component() {
          const { process } = useProcessor();
          const handleProcess = process;
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // ===== EXPRESSION BODY VARIANTS =====

      // Invalid: Direct function call from hook object
      {
        code: `
        function Component() {
          const { signIn } = useAuthSubmit();
          const handleSignIn = useCallback(() => signIn(), [signIn]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'signIn',
              hookName: 'useAuthSubmit',
            },
          },
        ],
        output: `
        function Component() {
          const { signIn } = useAuthSubmit();
          const handleSignIn = signIn;
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },

      // Invalid: Expression body with parentheses
      {
        code: `
        function Component() {
          const { update } = useUpdater();
          const handleUpdate = useCallback(() => (update()), [update]);
          return <button onClick={handleUpdate}>Update</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'update',
              hookName: 'useUpdater',
            },
          },
        ],
        output: `
        function Component() {
          const { update } = useUpdater();
          const handleUpdate = update;
          return <button onClick={handleUpdate}>Update</button>;
        }
      `,
      },

      // ===== CUSTOM MEMOIZATION HOOKS =====

      // Invalid: Custom memoization hook
      {
        code: `
        function Component() {
          const { process } = useCustomProcessor();
          const handleProcess = useCustomMemo(() => {
            process();
          }, [process]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
        options: [
          {
            allowedWrapperPatterns: ['useCallback', 'useMemo', 'useCustomMemo'],
          },
        ],
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCustomMemo',
              functionName: 'process',
              hookName: 'useCustomProcessor',
            },
          },
        ],
        output: `
        function Component() {
          const { process } = useCustomProcessor();
          const handleProcess = process;
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // ===== EMPTY OR MINIMAL DEPENDENCIES =====

      // Invalid: Empty dependency array (should still catch if function is from hook)
      {
        code: `
        function Component() {
          const { action } = useActionHandler();
          const handleAction = useCallback(() => {
            action();
          }, []);
          return <button onClick={handleAction}>Action</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'action',
              hookName: 'useActionHandler',
            },
          },
        ],
        output: `
        function Component() {
          const { action } = useActionHandler();
          const handleAction = action;
          return <button onClick={handleAction}>Action</button>;
        }
      `,
      },

      // Invalid: Only memoized function in dependencies
      {
        code: `
        function Component() {
          const { submit } = useSubmitHandler();
          const handleSubmit = useCallback(() => {
            submit();
          }, [submit]);
          return <form onSubmit={handleSubmit}></form>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'submit',
              hookName: 'useSubmitHandler',
            },
          },
        ],
        output: `
        function Component() {
          const { submit } = useSubmitHandler();
          const handleSubmit = submit;
          return <form onSubmit={handleSubmit}></form>;
        }
      `,
      },

      // ===== LITERAL ARGUMENTS =====

      // Invalid: Function called with literal values only
      {
        code: `
        function Component() {
          const { update } = useUpdater();
          const handleUpdate = useCallback(() => {
            update('literal', 42, true);
          }, [update]);
          return <button onClick={handleUpdate}>Update</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'update',
              hookName: 'useUpdater',
            },
          },
        ],
        output: `
        function Component() {
          const { update } = useUpdater();
          const handleUpdate = update;
          return <button onClick={handleUpdate}>Update</button>;
        }
      `,
      },

      // Invalid: Function called with no arguments when it could accept them
      {
        code: `
        function Component() {
          const { reset } = useFormReset();
          const handleReset = useCallback(() => {
            reset();
          }, [reset]);
          return <button onClick={handleReset}>Reset</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'reset',
              hookName: 'useFormReset',
            },
          },
        ],
        output: `
        function Component() {
          const { reset } = useFormReset();
          const handleReset = reset;
          return <button onClick={handleReset}>Reset</button>;
        }
      `,
      },

      // ===== DIFFERENT HOOK NAMING PATTERNS =====

      // Invalid: Hook with Context suffix
      {
        code: `
        function Component() {
          const { save } = useSaveContext();
          const handleSave = useCallback(() => {
            save();
          }, [save]);
          return <button onClick={handleSave}>Save</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'save',
              hookName: 'useSaveContext',
            },
          },
        ],
        output: `
        function Component() {
          const { save } = useSaveContext();
          const handleSave = save;
          return <button onClick={handleSave}>Save</button>;
        }
      `,
      },

      // Invalid: Hook with Handler suffix
      {
        code: `
        function Component() {
          const { execute } = useExecuteHandler();
          const handleExecute = useCallback(() => {
            execute();
          }, [execute]);
          return <button onClick={handleExecute}>Execute</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'execute',
              hookName: 'useExecuteHandler',
            },
          },
        ],
        output: `
        function Component() {
          const { execute } = useExecuteHandler();
          const handleExecute = execute;
          return <button onClick={handleExecute}>Execute</button>;
        }
      `,
      },

      // Invalid: Hook with Manager suffix
      {
        code: `
        function Component() {
          const { create } = useItemManager();
          const handleCreate = useCallback(() => {
            create();
          }, [create]);
          return <button onClick={handleCreate}>Create</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'create',
              hookName: 'useItemManager',
            },
          },
        ],
        output: `
        function Component() {
          const { create } = useItemManager();
          const handleCreate = create;
          return <button onClick={handleCreate}>Create</button>;
        }
      `,
      },

      // ===== MEMBER ACCESS PATTERNS =====

      // Invalid: Simple member access on hook result
      {
        code: `
        function Component() {
          const authManager = useAuthManager();
          const handleLogin = useCallback(() => {
            authManager.login();
          }, [authManager]);
          return <button onClick={handleLogin}>Login</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'authManager',
              hookName: 'useAuthManager',
            },
          },
        ],
        output: `
        function Component() {
          const authManager = useAuthManager();
          const handleLogin = authManager;
          return <button onClick={handleLogin}>Login</button>;
        }
      `,
      },

      // ===== WHITESPACE AND COMMENTS =====

      // Invalid: Function with only whitespace and comments
      {
        code: `
        function Component() {
          const { process } = useProcessor();
          const handleProcess = useCallback(() => {
            // This is a comment

            process(); // Call the function

            // End comment
          }, [process]);
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'process',
              hookName: 'useProcessor',
            },
          },
        ],
        output: `
        function Component() {
          const { process } = useProcessor();
          const handleProcess = process;
          return <button onClick={handleProcess}>Process</button>;
        }
      `,
      },

      // ===== SIMPLE RETURN STATEMENTS =====

      // Invalid: Simple return statement
      {
        code: `
        function Component() {
          const { getValue } = useValueProvider();
          const handleGetValue = useCallback(() => {
            return getValue();
          }, [getValue]);
          return <button onClick={handleGetValue}>Get Value</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'getValue',
              hookName: 'useValueProvider',
            },
          },
        ],
        output: `
        function Component() {
          const { getValue } = useValueProvider();
          const handleGetValue = getValue;
          return <button onClick={handleGetValue}>Get Value</button>;
        }
      `,
      },

      // ===== PREVENT FALSE NEGATIVES =====

      // Invalid: Only preventDefault and memoized function call
      {
        code: `
        function Component() {
          const { submit } = useFormSubmitter();
          const handleSubmit = useCallback((event) => {
            event.preventDefault();
            submit();
          }, [submit]);
          return <form onSubmit={handleSubmit}></form>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'submit',
              hookName: 'useFormSubmitter',
            },
          },
        ],
        output: `
        function Component() {
          const { submit } = useFormSubmitter();
          const handleSubmit = submit;
          return <form onSubmit={handleSubmit}></form>;
        }
      `,
      },

      // Invalid: Only simple variable assignment and memoized function call
      {
        code: `
        function Component() {
          const { log } = useLogger();
          const handleLog = useCallback(() => {
            const message = 'logging';
            log();
          }, [log]);
          return <button onClick={handleLog}>Log</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'log',
              hookName: 'useLogger',
            },
          },
        ],
        output: `
        function Component() {
          const { log } = useLogger();
          const handleLog = log;
          return <button onClick={handleLog}>Log</button>;
        }
      `,
      },

      // Invalid: Only console.log and memoized function call
      {
        code: `
        function Component() {
          const { action } = useActionProvider();
          const handleAction = useCallback(() => {
            console.log('action called');
            action();
          }, [action]);
          return <button onClick={handleAction}>Action</button>;
        }
      `,
        errors: [
          {
            messageId: 'redundantWrapper',
            data: {
              wrapperName: 'useCallback',
              functionName: 'action',
              hookName: 'useActionProvider',
            },
          },
        ],
        output: `
        function Component() {
          const { action } = useActionProvider();
          const handleAction = action;
          return <button onClick={handleAction}>Action</button>;
        }
      `,
      },
    ],
  },
);
