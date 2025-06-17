import { ruleTesterJsx } from '../utils/ruleTester';
import { noRedundantCallbackWrapping } from '../rules/no-redundant-callback-wrapping';

ruleTesterJsx.run(
  'no-redundant-callback-wrapping',
  noRedundantCallbackWrapping,
  {
    valid: [
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

      // Valid: Function from non-hook source
      {
        code: `
        function Component() {
          const utils = getUtils();
          const handleClick = useCallback(() => {
            utils.process();
          }, [utils]);
          return <button onClick={handleClick}>Click</button>;
        }
      `,
      },

      // Valid: Complex parameter processing
      {
        code: `
        function Component() {
          const { updateData } = useDataContext();
          const handleUpdate = useCallback((event) => {
            const value = event.target.value.trim().toLowerCase();
            updateData({ field: value, timestamp: Date.now() });
          }, [updateData]);
          return <input onChange={handleUpdate} />;
        }
      `,
      },

      // Valid: preventDefault is allowed as non-substantial
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

      // Valid: Renamed destructuring
      {
        code: `
        function Component() {
          const { signIn: customSignIn } = useAuthSubmit();
          const handleClick = useCallback((data) => {
            customSignIn(data.userId);
          }, [customSignIn, data]);
          return <button onClick={handleClick}>Sign In</button>;
        }
      `,
      },

      // Valid: Function with complex body structure
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

      // Valid: useDeepCompareCallback (custom memoization hook)
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

      // Valid: Function call with complex arguments
      {
        code: `
        function Component() {
          const { updateUser } = useUserContext();
          const handleUpdate = useCallback(() => {
            updateUser({
              ...currentUser,
              lastActive: Date.now(),
              preferences: { ...currentUser.preferences, theme: 'dark' }
            });
          }, [updateUser, currentUser]);
          return <button onClick={handleUpdate}>Update</button>;
        }
      `,
      },

      // Valid: Arrow function with block body and multiple statements
      {
        code: `
        function Component() {
          const { signIn } = useAuthSubmit();
          const handleSignIn = useCallback(() => {
            console.log('Signing in...');
            signIn();
            analytics.track('sign_in');
          }, [signIn, analytics]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },

      // Valid: Method access on memoized object
      {
        code: `
        function Component() {
          const authSubmit = useAuthSubmit();
          const handleSignIn = useCallback(() => {
            authSubmit.signIn();
          }, [authSubmit]);
          return <button onClick={handleSignIn}>Sign In</button>;
        }
      `,
      },
    ],

    invalid: [
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

      // Invalid: Function with no additional dependencies
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
    ],
  },
);
