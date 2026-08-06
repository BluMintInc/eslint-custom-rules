import { ruleTesterJsx } from '../utils/ruleTester';
import { noJsxInHooks } from '../rules/no-jsx-in-hooks';

ruleTesterJsx.run('no-jsx-in-hooks', noJsxInHooks, {
  valid: [
    // Only `React.` re-exports the JSX types; any other qualifier names a type
    // from a different module, so the annotation says nothing about JSX.
    {
      code: `
        const useElement = (): Foo.ReactNode => {
          return getElement();
        };
      `,
    },
    {
      code: `
        function useElement(): Foo.JSX.Element {
          return getElement();
        }
      `,
    },
    {
      code: `
        const useElement = (): React.Dispatch<Action> => {
          return getElement();
        };
      `,
    },
    // A zero-argument .map() used to abort the whole lint run: the indexed
    // `arguments[0]` read is typed non-optional (issue #1572).
    {
      code: `
        const useItems = () => {
          return useMemo(() => registry.map(), []);
        };
      `,
    },
    {
      code: `
        function useItems() {
          return useMemo(function () {
            return registry.map();
          }, []);
        }
      `,
    },
    // The same zero-argument .map(), reached through a concise arrow body so the
    // guard is exercised on that path too rather than only through the block
    // scanner.
    {
      code: `const useItems = () => useMemo(() => registry.map(), []);`,
    },
    // A concise body that is a useMemo call producing no JSX: the call shape
    // alone must not report, only JSX inside it.
    {
      code: `const useComputed = () => useMemo(() => computeThing(), []);`,
    },
    {
      code: `const useComputed = () => useMemo(() => { return { value: 42 }; }, []);`,
    },
    // A concise body that is an ordinary call returning JSX is not a memoized
    // render, and the unwrapper deliberately gates on useMemo.
    {
      code: `const useThing = () => buildThing(() => <div />);`,
    },
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
    // Invalid hook with early return of ReactNode
    {
      code: `
        const useLivestreamPlayer = ({ placeholder, playbackId }) => {
          const { isPictureInPicture } = usePictureInPicture();
          const { playbackIds } = useVideo();

          const livestreamCarousel = useMemo(() => {
            const playbackIdsResolved = playbackId ? [playbackId] : playbackIds;

            if (!playbackIdsResolved || playbackIdsResolved.length === 0) {
              return placeholder ?? undefined;
            }

            const carouselContent = playbackIdsResolved.map((id: string) => {
              return <LivestreamPlayer key={id} playbackId={id} />;
            });

            return (
              <Box
                sx={{
                  height: '100%',
                  visibility: isPictureInPicture ? 'hidden' : 'visible',
                }}
              >
                <ContentCarousel
                  buttonSx={BUTTON_SX}
                  content={carouselContent}
                  showNavigation={playbackIdsResolved.length > 1}
                  sx={{ height: '100%' }}
                />
              </Box>
            );
          }, [playbackId, playbackIds, isPictureInPicture, placeholder]);

          return livestreamCarousel;
        };
      `,
      errors: [
        {
          messageId: 'noJsxInHooks',
          data: { hookName: 'useLivestreamPlayer' },
        },
      ],
    },
    // Invalid hook with early return of ReactNode via ternary
    {
      code: `
        const useConditionalElement = ({ condition, placeholder }) => {
          return condition ? <div>Content</div> : placeholder;
        };
      `,
      errors: [
        {
          messageId: 'noJsxInHooks',
          data: { hookName: 'useConditionalElement' },
        },
      ],
    },
    // Invalid hook with early return of JSX in if statement
    {
      code: `
        const useLoadingState = ({ isLoading, data }) => {
          if (isLoading) {
            return <div>Loading...</div>;
          }
          return data;
        };
      `,
      errors: [
        {
          messageId: 'noJsxInHooks',
          data: { hookName: 'useLoadingState' },
        },
      ],
    },
    // Invalid hook that returns JSX via useMemo
    {
      code: `
        const useGetElement = () => {
          return useMemo(() => <div>Element</div>, []);
        };
      `,
      errors: [
        {
          messageId: 'noJsxInHooks',
          data: { hookName: 'useGetElement' },
        },
      ],
    },
    /**
     * The same hook spelled with a concise body. A concise body is a
     * CallExpression rather than a BlockStatement, so neither the direct-JSX
     * check nor the block scanner sees it; rewriting a block-bodied hook to a
     * concise arrow must not turn the rule off.
     */
    {
      code: `const useGetElement = () => useMemo(() => <div>Element</div>, []);`,
      errors: [
        {
          messageId: 'noJsxInHooks',
          data: { hookName: 'useGetElement' },
        },
      ],
    },
    {
      code: `const useGetElement = () => useMemo(() => { return <div>Element</div>; }, []);`,
      errors: [
        {
          messageId: 'noJsxInHooks',
          data: { hookName: 'useGetElement' },
        },
      ],
    },
    // A concise arrow body carries no BlockStatement and no return type, so it
    // is the only shape reaching the direct-JSX-return branch; every other JSX
    // fixture here routes through the block scanner or the annotation check.
    {
      code: `const useThing = () => <div />;`,
      errors: [
        {
          messageId: 'noJsxInHooks',
          data: { hookName: 'useThing' },
        },
      ],
    },
    {
      code: `const useFragmentThing = () => <><span /></>;`,
      errors: [
        {
          messageId: 'noJsxInHooks',
          data: { hookName: 'useFragmentThing' },
        },
      ],
    },
    // Invalid hook with explicit ReactNode return type
    {
      code: `
        const useElement = (): ReactNode => {
          return <div>Element</div>;
        };
      `,
      errors: [{ messageId: 'noJsxInHooks', data: { hookName: 'useElement' } }],
    },
    // Invalid function declaration hook
    {
      code: `
        function useHeader() {
          return <header>App Header</header>;
        }
      `,
      errors: [{ messageId: 'noJsxInHooks', data: { hookName: 'useHeader' } }],
    },
    // Invalid hook with JSX.Element return type
    {
      code: `
        const useNavigation = (): JSX.Element => {
          return <nav>Navigation</nav>;
        };
      `,
      errors: [
        { messageId: 'noJsxInHooks', data: { hookName: 'useNavigation' } },
      ],
    },
    // Invalid hook with block body and JSX return
    {
      code: `
        const useComplexElement = () => {
          const value = 42;
          return <div>{value}</div>;
        };
      `,
      errors: [
        {
          messageId: 'noJsxInHooks',
          data: { hookName: 'useComplexElement' },
        },
      ],
    },
    /**
     * React-namespaced spellings of the same types (issue #1753). The bodies
     * produce JSX indirectly on purpose: a literal `<div />` is caught by the
     * block-statement scanner, which would mask a broken annotation check —
     * as it does for the `(): ReactNode` and `(): JSX.Element` cases above.
     */
    {
      code: `
        const useElement = (): React.ReactNode => {
          return getElement();
        };
      `,
      errors: [{ messageId: 'noJsxInHooks', data: { hookName: 'useElement' } }],
    },
    {
      code: `
        const useElement = (): React.ReactElement => {
          return getElement();
        };
      `,
      errors: [{ messageId: 'noJsxInHooks', data: { hookName: 'useElement' } }],
    },
    {
      code: `
        const useNavigation = (): React.JSX.Element => {
          return getElement();
        };
      `,
      errors: [
        { messageId: 'noJsxInHooks', data: { hookName: 'useNavigation' } },
      ],
    },
    {
      code: `
        function useElement(): React.ReactNode {
          return getElement();
        }
      `,
      errors: [{ messageId: 'noJsxInHooks', data: { hookName: 'useElement' } }],
    },
    {
      code: `
        function useElement(): React.ReactElement {
          return getElement();
        }
      `,
      errors: [{ messageId: 'noJsxInHooks', data: { hookName: 'useElement' } }],
    },
    {
      code: `
        function useNavigation(): React.JSX.Element {
          return getElement();
        }
      `,
      errors: [
        { messageId: 'noJsxInHooks', data: { hookName: 'useNavigation' } },
      ],
    },
    // The unqualified spellings, with an indirect body so the annotation is the
    // only detector in play — the pre-existing cases cannot make that claim.
    {
      code: `
        const useElement = (): ReactNode => {
          return getElement();
        };
      `,
      errors: [{ messageId: 'noJsxInHooks', data: { hookName: 'useElement' } }],
    },
    {
      code: `
        function useNavigation(): JSX.Element {
          return getElement();
        }
      `,
      errors: [
        { messageId: 'noJsxInHooks', data: { hookName: 'useNavigation' } },
      ],
    },
  ],
});
