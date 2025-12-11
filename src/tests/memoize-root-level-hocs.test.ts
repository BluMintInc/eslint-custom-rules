import { ruleTesterJsx } from '../utils/ruleTester';
import { memoizeRootLevelHocs } from '../rules/memoize-root-level-hocs';

ruleTesterJsx.run('memoize-root-level-hocs', memoizeRootLevelHocs, {
  valid: [
    `
    function MyComponent({ data }) {
      const EnhancedComponent = useMemo(() => {
        return withSomeFeature(BaseComponent, { options: data.settings });
      }, [data.settings]);
      return <EnhancedComponent />;
    }
    `,
    `
    function MyComponent() {
      const handleClick = () => {
        const EnhancedModal = withAnimation(Modal);
        showModal(<EnhancedModal />);
      };
      return <Button onClick={handleClick}>Show</Button>;
    }
    `,
    `
    const GlobalEnhanced = withWrapper(BaseComponent);
    function UsesGlobal() {
      return <GlobalEnhanced />;
    }
    `,
    `
    const Component = () => {
      const Enhanced = React.useMemo(() => withTheme(BaseComponent), []);
      return <Enhanced />;
    };
    `,
    `
    function useCustomComponent() {
      const EnhancedComponent = useMemo(() => withFeatures(BaseComponent), []);
      return EnhancedComponent;
    }
    `,
    {
      code: `
      function ConnectedComponent() {
        const Connected = useMemo(() => connect(mapState)(BaseComponent), [mapState]);
        return <Connected />;
      }
      `,
      options: [{ additionalHocNames: ['connect'] }],
    },
    `
    function SafeComponent() {
      const value = withholdValue();
      return <div>{value}</div>;
    }
    `,
    `
    function WithDigitPrefix() {
      const Enhanced = with1Config(BaseComponent);
      return <Enhanced />;
    }
    `,
    `
    function ModalWrapper() {
      useEffect(() => {
        const EnhancedModal = withAnimation(Modal);
        openModal(<EnhancedModal />);
      }, []);
      return null;
    }
    `,
    `
    function UsesConnectWithoutConfig() {
      const Connected = connect(mapState)(BaseComponent);
      return <Connected />;
    }
    `,
    `
    function Parent() {
      function build() {
        return withPortal(BaseComponent);
      }
      const Component = build();
      return <Component />;
    }
    `,
    `
    const InlineArrow = () => {
      const result = data.items.map((item) => item.label);
      return <List items={result} />;
    };
    `,
    `
    function withLayout(Component) {
      function Wrapped(props) {
        return (
          <Layout>
            <Component {...props} />
          </Layout>
        );
      }
      return withPortal(Wrapped);
    }
    `,
  ],
  invalid: [
    {
      code: `
      function MyComponent({ data }) {
        const EnhancedComponent = withSomeFeature(BaseComponent, { options: data.settings });
        return <EnhancedComponent />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      const MyComponent = () => {
        const Enhanced = withAnalytics(BaseComponent);
        return <Enhanced />;
      };
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function useCustomComponent() {
        const EnhancedComponent = withFeatures(BaseComponent);
        return EnhancedComponent;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function ConditionalComponent({ enabled }) {
        let RenderComponent = BaseComponent;
        if (enabled) {
          RenderComponent = withLogger(BaseComponent);
        }
        return <RenderComponent />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function FactoryComponent() {
        const Enhanced = hocFactories.withPortal(BaseComponent);
        return <Enhanced />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function ReduxComponent() {
        const Connected = connect(mapState)(BaseComponent);
        return <Connected />;
      }
      `,
      options: [{ additionalHocNames: ['connect'] }],
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function MemoComponent() {
        const Memoized = React.memo(BaseComponent);
        return <Memoized />;
      }
      `,
      options: [{ additionalHocNames: ['memo'] }],
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function Composed() {
        const Enhanced = withTracking(withAnalytics(BaseComponent));
        return <Enhanced />;
      }
      `,
      errors: [
        { messageId: 'wrapHocInUseMemo' },
        { messageId: 'wrapHocInUseMemo' },
      ],
    },
    {
      code: `
      function WrongUseMemo() {
        const Enhanced = useMemo(withPortal(BaseComponent), []);
        return <Enhanced />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function ComplexComponent() {
        const EnhancedComponent = withComplexData(BaseComponent, {
          callbacks: {
            onEvent: () => console.log('event'),
            process: (data) => transform(data),
          },
        });
        return <EnhancedComponent />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function OptionalChain() {
        const Enhanced = maybeHocs?.withPortal(BaseComponent);
        return <Enhanced />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function WrapperComponent() {
        const build = () => <BaseComponent />;
        const Enhanced = withPortal(build);
        return <Enhanced />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
  ],
});
