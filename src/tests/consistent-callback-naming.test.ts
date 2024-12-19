import { ruleTesterJsx } from '../utils/ruleTester';
import rule from '../rules/consistent-callback-naming';

ruleTesterJsx.run('consistent-callback-naming', rule, {
  valid: [
    // Valid callback props with 'on' prefix
    {
      code: '<Example onFoo={fetchFoo} />;',
    },
    {
      code: '<button onClick={buttonClick} />;',
    },
    // Valid callback functions without 'handle' prefix
    {
      code: `
        function MyComponent({ onClick }) {
          const buttonClick = () => {
            console.log('Button clicked!');
          };
          return <button onClick={onClick}>Click Me</button>;
        }
      `,
    },
    // Valid object methods without 'handle' prefix
    {
      code: `
        const obj = {
          buttonClick() {
            console.log('clicked');
          }
        };
      `,
    },
    // Built-in React event handlers should be valid
    {
      code: '<div onClick={handleClick} onMouseOver={mouseOver} />;',
    },
    // Non-callback props should be valid
    {
      code: `
        function MyComponent() {
          const errorMessage = 'Error occurred';
          const autoFocus = true;
          return (
            <Input
              errorMessage={errorMessage}
              autoFocus={autoFocus}
              placeholder="Enter text"
            />
          );
        }
      `,
    },
    // Props with non-function values should be valid
    {
      code: `
        function MyComponent() {
          const message = 'Hello';
          const isEnabled = true;
          const count = 42;
          return (
            <Example
              message={message}
              enabled={isEnabled}
              count={count}
            />
          );
        }
      `,
    },
  ],
  invalid: [
    // Invalid callback props without 'on' prefix
    {
      code: '<Example fetchFoo={handleFetchFoo} />;',
      errors: [{ messageId: 'callbackPropPrefix' }],
      output: '<Example onFetchFoo={handleFetchFoo} />;',
    },
    // Invalid callback functions with 'handle' prefix
    {
      code: `
        function MyComponent() {
          const handleButtonClick = () => {
            console.log('Button clicked!');
          };
          return <button onClick={handleButtonClick}>Click Me</button>;
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        function MyComponent() {
          const buttonClick = () => {
            console.log('Button clicked!');
          };
          return <button onClick={handleButtonClick}>Click Me</button>;
        }
      `,
    },
    // Invalid object methods with 'handle' prefix
    {
      code: `
        const obj = {
          handleButtonClick() {
            console.log('clicked');
          }
        };
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        const obj = {
          buttonClick() {
            console.log('clicked');
          }
        };
      `,
    },
    // Multiple invalid cases in one component
    {
      code: `
        function MyComponent({ fetchData }) {
          const handleClick = () => {};
          return (
            <div>
              <Example fetchFoo={handleFetchFoo} />
              <button onClick={handleClick}>Click</button>
            </div>
          );
        }
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackPropPrefix' },
      ],
      output: `
        function MyComponent({ fetchData }) {
          const click = () => {};
          return (
            <div>
              <Example onFetchFoo={handleFetchFoo} />
              <button onClick={handleClick}>Click</button>
            </div>
          );
        }
      `,
    },
  ],
});
