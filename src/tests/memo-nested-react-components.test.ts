import { ruleTesterJsx } from '../utils/ruleTester';
import { memoNestedReactComponents } from '../rules/memo-nested-react-components';

ruleTesterJsx.run('memo-nested-react-components', memoNestedReactComponents, {
  valid: [
    {
      code: `
        import { useCallback } from 'react';

        const handleClick = useCallback((event) => {
          event.preventDefault();
          return event.clientX;
        }, []);
      `,
    },
    {
      code: `
        import { useDeepCompareCallback } from '@blumintinc/use-deep-compare';

        const computeValue = useDeepCompareCallback((input) => input.value * 2, []);
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const buildConfig = useCallback(() => {
          return {
            title: 'example',
            footer: <div>not treated as component</div>,
          };
        }, []);
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const noop = useCallback(() => {}, []);
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const getList = useCallback(() => [1, 2, 3], []);
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const ignoreTests = useCallback(() => {
          return <div>Should be ignored via pattern</div>;
        }, []);
      `,
      filename: 'Component.test.tsx',
      options: [{ ignorePatterns: ['**/*.test.tsx'] }],
    },
    {
      code: `
        import { useCallback } from 'react';
        import * as Factory from 'ui-factory';

        const NonReactFactory = useCallback(() => {
          return Factory.createElement('div', null, 'text');
        }, []);
      `,
    },
    {
      code: `
        import { useMemo } from 'react';
        const element = useMemo(() => <div>just an element</div>, []);
      `,
    },
    {
      code: `
        const MyComponent = () => {
          return <List render={(item) => <div>{item}</div>} />;
        };
      `,
    },
    {
      code: `
        const MyComponent = () => {
          const handleClick = () => console.log('hi');
          return <button onClick={handleClick} />;
        };
      `,
    },
    {
      code: `
        const MyComponent = () => {
          const renderHeader = () => <div>Header</div>;
          return <div>{renderHeader()}</div>;
        };
      `,
    },
    {
      code: `
        const MyPage = () => {
          return <Layout Header={<header />} />; // JSX element, not a function
        };
      `,
    },
    {
      code: `
        const Comp = useCallback(...args);
      `,
    },
    {
      code: `
        const MyPage = () => {
          const MyElement = <div />;
          return <div>{MyElement}</div>;
        };
      `,
    },
    {
      code: `
        const MyPage = () => {
          return <Layout Header={/* comment */} />;
        };
      `,
    },
    {
      // FP #1: HOC factory returning memo(Inner) is not a render body; the
      // inner component has a stable identity (factory runs once per call).
      code: `
        import { memo } from 'react';

        export function withPendingSupport(WrappedComponent) {
          const ComponentWithPendingSupportUnmemoized = (props) => {
            if (isPending(props)) {
              return <Pending {...props} />;
            }
            return <WrappedComponent {...props} />;
          };
          return memo(ComponentWithPendingSupportUnmemoized);
        }
      `,
    },
    {
      // FP #1 variant: HOC factory returning the component identifier directly.
      code: `
        export function withLogging(WrappedComponent) {
          const LoggedComponentUnmemoized = (props) => {
            return <WrappedComponent {...props} />;
          };
          return LoggedComponentUnmemoized;
        }
      `,
    },
    {
      // FP #2: forwardRef wrapper inside an HOC factory returning
      // memo(forwardRef(...)); the refless component must not be flagged.
      code: `
        import { memo, forwardRef } from 'react';

        export function withDatePickerEdit(WrappedPicker, options) {
          function DatePickerEditReflessUnmemoized(props, forwardedRef) {
            return <WrappedPicker {...props} ref={forwardedRef} options={options} />;
          }
          const DatePickerEditUnmemoized = forwardRef(DatePickerEditReflessUnmemoized);
          return memo(DatePickerEditUnmemoized);
        }
      `,
    },
    {
      // FP #2 variant: HOC factory returning forwardRef(...) directly.
      code: `
        import { forwardRef } from 'react';

        export function withRef(WrappedComponent) {
          const InnerUnmemoized = (props, ref) => {
            return <WrappedComponent {...props} ref={ref} />;
          };
          return forwardRef(InnerUnmemoized);
        }
      `,
    },
    {
      // FP #3: render callback assigned to a non-PascalCase name (render={...}).
      code: `
        import { useCallback } from 'react';

        const renderHit = useCallback((hit) => <AccordionCompetitor {...hit} />, []);
      `,
    },
    {
      // FP #3 variant: lowercase render callback via useMemo returning a function.
      code: `
        import { useMemo } from 'react';

        const renderRow = useMemo(() => (row) => <Row {...row} />, []);
      `,
    },
    {
      // FP #3 variant: lowercase render callback inside a render body.
      code: `
        import { useCallback } from 'react';

        const MyList = () => {
          const renderHit = useCallback((hit) => <Hit {...hit} />, []);
          return <Hits render={renderHit} />;
        };
      `,
    },
  ],
  invalid: [
    {
      code: `
        import React, { useCallback } from 'react';

        const CustomButton = useCallback(({ onClick, children }) => <button onClick={onClick}>{children}</button>, []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CustomButton',
            locationDescription: 'useCallback()',
          },
        },
      ],
    },
    {
      code: `
        import { useMemo } from 'react';
        const NestedComp = useMemo(() => (props) => <div {...props} />, []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'NestedComp',
            locationDescription: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        const Parent = () => {
          const Child = () => <div />;
          return <Child />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Child',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      code: `
        const Parent = () => {
          function Child() { return <div />; }
          return <Child />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Child',
            locationDescription: 'a render body',
          },
        },
      ],
    },
    {
      code: `
        const ContentVerticalCarouselGrid = ({ header, ...gridProps }) => {
          const CatalogWrapper = useCallback((props) => {
            return <ContentCarouselWrapper {...props} {...gridProps} header={header} />;
          }, [gridProps, header]);

          return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CatalogWrapper',
            locationDescription: 'useCallback()',
          },
        },
      ],
    },
    {
      code: `
        const MyComp = () => {
          return <AlgoliaLayout CatalogWrapper={(props) => <div {...props} />} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CatalogWrapper',
            locationDescription: 'the "CatalogWrapper" prop',
          },
        },
      ],
    },
    {
      code: `
        import { useMemo, memo } from 'react';
        const Wrapped = useMemo(() => memo((props) => <div {...props} />), []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Wrapped',
            locationDescription: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        const TeamsUnmemoized = () => {
          const TeamsCatalogWrapper = useCallback((props) => {
            return (
              <TeamKeyProvider teamKey={teamKey}>
                <TeamsCarouselWrapper {...props} />
              </TeamKeyProvider>
            );
          }, [teamKey]);

          return <AlgoliaLayout CatalogWrapper={TeamsCatalogWrapper} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'TeamsCatalogWrapper',
            locationDescription: 'useCallback()',
          },
        },
      ],
    },
    {
      code: `
        import { useDeepCompareCallback } from '@blumintinc/use-deep-compare';
        const DeepComp = useDeepCompareCallback((props) => <div {...props} />, []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'DeepComp',
            locationDescription: 'useDeepCompareCallback()',
          },
        },
      ],
    },
    {
      code: `
        import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
        const DeepMemo = useDeepCompareMemo(() => (props) => <div {...props} />, []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'DeepMemo',
            locationDescription: 'useDeepCompareMemo()',
          },
        },
      ],
    },
    {
      code: `
        const MyPage = () => {
          return <Something SomethingComponent={() => <div />} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'SomethingComponent',
            locationDescription: 'the "SomethingComponent" prop',
          },
        },
      ],
    },
    {
      code: `
        const MyPage = () => {
          return <Layout Header={() => <header />} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Header',
            locationDescription: 'the "Header" prop',
          },
        },
      ],
    },
    {
      code: `
        const Comp = useCallback((flag: boolean) => flag && <div />, []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        const Comp = useCallback((flag: boolean) => {
          if (flag) return <div />;
          return null;
        }, []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        const Comp = useCallback((type: string) => {
          switch (type) {
            case 'a': return <div />;
            default: return null;
          }
        }, []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        const Comp = useCallback(() => {
          try {
            return <div />;
          } catch {
            return null;
          }
        }, []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        const Comp = useCallback(() => {
          for (let i = 0; i < 1; i++) {
             return <div />;
          }
          return null;
        }, []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        import { forwardRef, useCallback } from 'react';
        const RefComp = useCallback(forwardRef((props, ref) => <div ref={ref} />), []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      code: `
        import React, { useCallback } from 'react';
        const Comp = useCallback(() => React.createElement('div'), []);
      `,
      errors: [{ messageId: 'memoizeNestedComponent' }],
    },
    {
      // FP #4 control: PascalCase useCallback used as a component-type prop
      // inside a render body (returns JSX) must STILL report.
      code: `
        import { useCallback } from 'react';

        const UserCarouselWrapperUnmemoized = ({ ContentCard = UserCardLayout, ...rest }) => {
          const CarouselWrapper = useCallback(
            (props) => <UserVerticalCarousel {...props} ContentCard={ContentCard} />,
            [ContentCard, rest],
          );
          return <AlgoliaLayout CatalogWrapper={CarouselWrapper} />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CarouselWrapper',
            locationDescription: 'useCallback()',
          },
        },
      ],
    },
    {
      // FP #5 control: PascalCase component via useMemo inside a render body
      // (the enclosing function returns JSX) must STILL report.
      code: `
        import { useMemo } from 'react';

        const Parent = () => {
          const Child = useMemo(() => (props) => <div {...props} />, []);
          return <Child />;
        };
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Child',
            locationDescription: 'useMemo()',
          },
        },
      ],
    },
    {
      // FP #2 control: a PascalCase component defined inside an HOC factory
      // that ALSO returns JSX is still a render body and must report.
      code: `
        import { memo } from 'react';

        function withWeird(WrappedComponent) {
          const InnerUnmemoized = (props) => <WrappedComponent {...props} />;
          if (shouldRenderInline) {
            return <InnerUnmemoized />;
          }
          return memo(InnerUnmemoized);
        }
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'InnerUnmemoized',
            locationDescription: 'a render body',
          },
        },
      ],
    },
  ],
});
