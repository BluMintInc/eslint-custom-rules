import { ruleTesterJsx } from '../utils/ruleTester';
import { noJsxInHooks } from '../rules/no-jsx-in-hooks';

ruleTesterJsx.run('no-jsx-in-hooks', noJsxInHooks, {
  valid: [
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
  ],
});
