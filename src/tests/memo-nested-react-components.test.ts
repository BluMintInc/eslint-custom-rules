import { ruleTesterJsx } from '../utils/ruleTester';
import { memoNestedReactComponents } from '../rules/memo-nested-react-components';

ruleTesterJsx.run('memo-nested-react-components', memoNestedReactComponents, {
  valid: [
    // Valid: Regular useCallback without JSX
    {
      code: `
        function MyComponent() {
          const handleClick = useCallback(() => {
            console.log('clicked');
          }, []);

          return <div onClick={handleClick}>Click me</div>;
        }
      `,
    },
    // Valid: useCallback with function that doesn't return JSX
    {
      code: `
        function MyComponent() {
          const formatData = useCallback((data) => {
            return data.map(item => ({
              id: item.id,
              name: item.name
            }));
          }, []);

          return <div>{formatData(items).map(item => <div key={item.id}>{item.name}</div>)}</div>;
        }
      `,
    },
    // Valid: useMemo with memo for component
    {
      code: `
        function MyComponent() {
          const CustomButton = useMemo(() => {
            return memo(function CustomButtonUnmemoized({ onClick, children }) {
              return <Button onClick={onClick}>{children}</Button>;
            });
          }, []);

          return <div><CustomButton onClick={() => {}}>Click me</CustomButton></div>;
        }
      `,
    },
    // Valid: useDeepCompareMemo with memo for component
    {
      code: `
        import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
        import { memo } from '../../../util/memo';

        function MyComponent() {
          const NonLinkMenu = useDeepCompareMemo(() => {
            return memo(function NonLinkMenuUnmemoized(props) {
              return <Menu {...props}>{menuItemsFile}</Menu>;
            });
          }, [menuItemsFile]);

          return <div><NonLinkMenu items={items} /></div>;
        }
      `,
    },
    // Valid: Higher-order function that doesn't return JSX
    {
      code: `
        function MyComponent() {
          const createHandler = useCallback(() => {
            return (event) => {
              console.log(event);
            };
          }, []);

          return <button onClick={createHandler()}>Click me</button>;
        }
      `,
    },
    // Valid: Function that returns a string template with HTML-like syntax
    {
      code: `
        function MyComponent() {
          const getTemplate = useCallback(() => {
            return \`<div>This is a template string, not JSX</div>\`;
          }, []);

          return <div dangerouslySetInnerHTML={{ __html: getTemplate() }} />;
        }
      `,
    },
    // Valid: Function that returns an object with render methods but not JSX directly
    {
      code: `
        function MyComponent() {
          const getComponents = useCallback(() => {
            return {
              renderHeader: () => <h1>Header</h1>,
              renderFooter: () => <footer>Footer</footer>
            };
          }, []);

          const { renderHeader, renderFooter } = getComponents();
          return <div>{renderHeader()}{renderFooter()}</div>;
        }
      `,
    },
  ],
  invalid: [
    // Invalid: useCallback returning JSX directly
    {
      code: `
        function MyComponent() {
          const CustomButton = useCallback(({ onClick, children }) => {
            return <Button onClick={onClick}>{children}</Button>;
          }, []);

          return <div><CustomButton onClick={() => {}}>Click me</CustomButton></div>;
        }
      `,
      errors: [{ messageId: 'memoNestedReactComponents' }],
      output: `
        function MyComponent() {
          const CustomButton = useMemo(() => {
  return memo(function CustomButtonUnmemoized({ onClick, children }) {
            return <Button onClick={onClick}>{children}</Button>;
          });
}, []);

          return <div><CustomButton onClick={() => {}}>Click me</CustomButton></div>;
        }
      `,
    },
    // Invalid: useDeepCompareCallback returning JSX
    {
      code: `
        import { useDeepCompareCallback } from '@blumintinc/use-deep-compare';

        function MyComponent() {
          const NonLinkMenu = useDeepCompareCallback((props) => {
            return <Menu {...props}>{menuItemsFile}</Menu>;
          }, [menuItemsFile]);

          return <div><NonLinkMenu items={items} /></div>;
        }
      `,
      errors: [{ messageId: 'memoNestedReactComponents' }],
      output: `
        import { useDeepCompareCallback } from '@blumintinc/use-deep-compare';

        function MyComponent() {
          const NonLinkMenu = useDeepCompareMemo(() => {
  return memo(function NonLinkMenuUnmemoized(props) {
            return <Menu {...props}>{menuItemsFile}</Menu>;
          });
}, [menuItemsFile]);

          return <div><NonLinkMenu items={items} /></div>;
        }
      `,
    },
    // Invalid: useCallback with conditional JSX return
    {
      code: `
        function MyComponent() {
          const ConditionalComponent = useCallback(({ condition, children }) => {
            if (condition) {
              return <div className="true-case">{children}</div>;
            }
            return <span className="false-case">{children}</span>;
          }, []);

          return <ConditionalComponent condition={true}>Content</ConditionalComponent>;
        }
      `,
      errors: [{ messageId: 'memoNestedReactComponents' }],
      output: `
        function MyComponent() {
          const ConditionalComponent = useMemo(() => {
  return memo(function ConditionalComponentUnmemoized({ condition, children }) {
            if (condition) {
              return <div className="true-case">{children}</div>;
            }
            return <span className="false-case">{children}</span>;
          });
}, []);

          return <ConditionalComponent condition={true}>Content</ConditionalComponent>;
        }
      `,
    },
    // Invalid: useCallback with JSX in switch statement
    {
      code: `
        function MyComponent() {
          const SwitchComponent = useCallback(({ type, children }) => {
            switch (type) {
              case 'button':
                return <button>{children}</button>;
              case 'link':
                return <a href="#">{children}</a>;
              default:
                return <div>{children}</div>;
            }
          }, []);

          return <SwitchComponent type="button">Click me</SwitchComponent>;
        }
      `,
      errors: [{ messageId: 'memoNestedReactComponents' }],
      output: `
        function MyComponent() {
          const SwitchComponent = useMemo(() => {
  return memo(function SwitchComponentUnmemoized({ type, children }) {
            switch (type) {
              case 'button':
                return <button>{children}</button>;
              case 'link':
                return <a href="#">{children}</a>;
              default:
                return <div>{children}</div>;
            }
          });
}, []);

          return <SwitchComponent type="button">Click me</SwitchComponent>;
        }
      `,
    },
    // Invalid: useCallback with array map returning JSX
    {
      code: `
        function MyComponent() {
          const ListRenderer = useCallback(({ items }) => {
            return items.map(item => <li key={item.id}>{item.name}</li>);
          }, []);

          return <ul><ListRenderer items={data} /></ul>;
        }
      `,
      errors: [{ messageId: 'memoNestedReactComponents' }],
      output: `
        function MyComponent() {
          const ListRenderer = useMemo(() => {
  return memo(function ListRendererUnmemoized({ items }) {
            return items.map(item => <li key={item.id}>{item.name}</li>);
          });
}, []);

          return <ul><ListRenderer items={data} /></ul>;
        }
      `,
    },
    // Invalid: useCallback with JSX fragments
    {
      code: `
        function MyComponent() {
          const FragmentComponent = useCallback(({ items }) => {
            return (
              <>
                <h2>List</h2>
                <ul>
                  {items.map(item => <li key={item.id}>{item.name}</li>)}
                </ul>
              </>
            );
          }, []);

          return <div><FragmentComponent items={data} /></div>;
        }
      `,
      errors: [{ messageId: 'memoNestedReactComponents' }],
      output: `
        function MyComponent() {
          const FragmentComponent = useMemo(() => {
  return memo(function FragmentComponentUnmemoized({ items }) {
            return (
              <>
                <h2>List</h2>
                <ul>
                  {items.map(item => <li key={item.id}>{item.name}</li>)}
                </ul>
              </>
            );
          });
}, []);

          return <div><FragmentComponent items={data} /></div>;
        }
      `,
    },
    // Invalid: useCallback with logical expression containing JSX
    {
      code: `
        function MyComponent() {
          const LogicalComponent = useCallback(({ condition, items }) => {
            return condition && <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
          }, []);

          return <div><LogicalComponent condition={true} items={data} /></div>;
        }
      `,
      errors: [{ messageId: 'memoNestedReactComponents' }],
      output: `
        function MyComponent() {
          const LogicalComponent = useMemo(() => {
  return memo(function LogicalComponentUnmemoized({ condition, items }) {
            return condition && <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
          });
}, []);

          return <div><LogicalComponent condition={true} items={data} /></div>;
        }
      `,
    },
    // Invalid: useCallback with ternary expression containing JSX
    {
      code: `
        function MyComponent() {
          const TernaryComponent = useCallback(({ condition, items }) => {
            return condition
              ? <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>
              : <div>No items</div>;
          }, []);

          return <div><TernaryComponent condition={true} items={data} /></div>;
        }
      `,
      errors: [{ messageId: 'memoNestedReactComponents' }],
      output: `
        function MyComponent() {
          const TernaryComponent = useMemo(() => {
  return memo(function TernaryComponentUnmemoized({ condition, items }) {
            return condition
              ? <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>
              : <div>No items</div>;
          });
}, []);

          return <div><TernaryComponent condition={true} items={data} /></div>;
        }
      `,
    },
  ],
});
