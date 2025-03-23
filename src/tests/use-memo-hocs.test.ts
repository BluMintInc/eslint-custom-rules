import { ESLintUtils } from '@typescript-eslint/utils';
import { useMemoHocs } from '../rules/use-memo-hocs';

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

ruleTester.run('use-memo-hocs', useMemoHocs, {
  valid: [
    // Valid case: HOC wrapped in useMemo
    {
      code: `
        function MyComponent({ data }) {
          const EnhancedComponent = useMemo(() => {
            return withSomeFeature(BaseComponent, {
              options: data.settings
            });
          }, [data.settings]);

          return <EnhancedComponent />;
        }
      `,
    },
    // Valid case: HOC in event handler (not during render)
    {
      code: `
        function MyComponent() {
          const handleClick = () => {
            // This is okay as it's not during render
            const EnhancedModal = withAnimation(Modal);
            showModal(<EnhancedModal />);
          };

          return <Button onClick={handleClick}>Show Modal</Button>;
        }
      `,
    },
    // Valid case: HOC defined outside component
    {
      code: `
        const EnhancedComponent = withSomeFeature(BaseComponent);

        function MyComponent() {
          return <EnhancedComponent />;
        }
      `,
    },
    // Valid case: connect HOC wrapped in useMemo
    {
      code: `
        function MyComponent({ userId }) {
          const ConnectedComponent = useMemo(() => {
            return connect(mapStateToProps)(BaseComponent);
          }, []);

          return <ConnectedComponent id={userId} />;
        }
      `,
    },
    // Valid case: memo HOC wrapped in useMemo
    {
      code: `
        function MyComponent() {
          const MemoizedComponent = useMemo(() => {
            return memo(BaseComponent);
          }, []);

          return <MemoizedComponent />;
        }
      `,
    },
    // Valid case: HOC in callback prop
    {
      code: `
        function MyComponent() {
          return (
            <TabPanel
              renderContent={() => {
                const EnhancedComponent = withFeatures(BaseComponent);
                return <EnhancedComponent />;
              }}
            />
          );
        }
      `,
    },
  ],
  invalid: [
    // Invalid case: HOC created directly in component body
    {
      code: `
        function MyComponent({ data }) {
          // Bad: HOC created directly in component body
          const EnhancedComponent = withSomeFeature(BaseComponent, {
            options: data.settings
          });

          return <EnhancedComponent />;
        }
      `,
      errors: [{ messageId: 'wrapInUseMemo' }],
    },
    // Invalid case: connect HOC not wrapped in useMemo
    {
      code: `
        function MyComponent() {
          const ConnectedComponent = connect(mapStateToProps)(BaseComponent);
          return <ConnectedComponent />;
        }
      `,
      errors: [{ messageId: 'wrapInUseMemo' }],
    },
    // Invalid case: memo HOC not wrapped in useMemo
    {
      code: `
        function MyComponent() {
          const MemoizedComponent = memo(BaseComponent);
          return <MemoizedComponent />;
        }
      `,
      errors: [{ messageId: 'wrapInUseMemo' }],
    },
    // Invalid case: HOC directly in JSX
    {
      code: `
        function MyComponent() {
          return <div>{withTranslation()(MyText)}</div>;
        }
      `,
      errors: [{ messageId: 'wrapInUseMemo' }],
    },
    // Invalid case: HOC in custom hook
    {
      code: `
        function useCustomComponent() {
          // Should be memoized even in a custom hook
          const EnhancedComponent = withFeatures(BaseComponent);
          return EnhancedComponent;
        }
      `,
      errors: [{ messageId: 'wrapInUseMemo' }],
    },
  ],
});
