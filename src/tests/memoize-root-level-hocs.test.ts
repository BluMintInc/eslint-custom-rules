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
    // A string utility that merely matches the with[A-Z] name shape: no argument
    // is a component, so the call is not an HOC creation.
    `
    const DropIndicator = () => {
      const theme = useTheme();
      const background = withOpacity(theme.palette.disabled.main, 0.3);
      return <div style={{ backgroundColor: background }} />;
    };
    `,
    `
    function Badge({ tone }) {
      const color = withAlpha('#ffffff', 0.5);
      const label = withFallback(tone, 'neutral');
      return <span style={{ color }}>{label}</span>;
    }
    `,
    `
    function Meter({ value }) {
      const shade = withOpacity(palette.primary.main, 0.25);
      const width = withScale(value, 2) * 100;
      return (
        <div
          style={{ background: \`linear-gradient(\${shade}, transparent)\` }}
          data-width={width}
        />
      );
    }
    `,
    // A lowercase identifier argument that resolves to a plain value stays silent.
    `
    function Panel() {
      const base = theme.palette.primary.main;
      const background = withOpacity(base, 0.4);
      return <div style={{ background }} />;
    }
    `,
    // An imported lowercase binding resolves to an import, never to a component.
    `
    import { brandColor } from './tokens';
    function Chip() {
      const background = withOpacity(brandColor, 0.2);
      return <div style={{ background }} />;
    }
    `,
    `
    function Spacer({ size }) {
      const gap = withSpacing(size);
      return <div style={{ gap }} />;
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
    // A capitalized identifier argument is the canonical component signal.
    {
      code: `
      const Wrapper = () => {
        const Enhanced = withTracking(BaseComponent);
        return <Enhanced />;
      };
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function NamespacedComponent() {
        const Enhanced = withTracking(Components.Base);
        return <Enhanced />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function InlineArrowArgument() {
        const Enhanced = withPortal((props) => <BaseComponent {...props} />);
        return <Enhanced />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    {
      code: `
      function InlineFunctionArgument() {
        const Enhanced = withPortal(function Wrapped(props) {
          return <BaseComponent {...props} />;
        });
        return <Enhanced />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    // A component argument hidden behind a type assertion is still a component.
    {
      code: `
      function AssertedArgument() {
        const Enhanced = withPortal(BaseComponent as ComponentType<Props>);
        return <Enhanced />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    // A lowercase identifier that resolves to a JSX-returning function declaration.
    {
      code: `
      function ResolvedDeclaration() {
        function build(props) {
          return <BaseComponent {...props} />;
        }
        const Enhanced = withPortal(build);
        return <Enhanced />;
      }
      `,
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
    // A configured HOC name opts in explicitly, so its arguments are never
    // second-guessed even when they look like plain values.
    {
      code: `
      function ConfiguredHoc() {
        const background = withOpacity(theme.palette.disabled.main, 0.3);
        return <div style={{ backgroundColor: background }} />;
      }
      `,
      options: [{ additionalHocNames: ['withOpacity'] }],
      errors: [{ messageId: 'wrapHocInUseMemo' }],
    },
  ],
});
