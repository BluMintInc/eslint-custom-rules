import { ruleTesterJsx } from '../utils/ruleTester';
import { avoidArrayLengthDependency } from '../rules/avoid-array-length-dependency';

ruleTesterJsx.run('avoid-array-length-dependency', avoidArrayLengthDependency, {
  valid: [
    // Using the array itself is valid
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log('Items changed!', items);
          }, [items]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Using a memoized hash is valid
    {
      code: `
        import { useMemo } from 'react';
        import { stableHash } from 'functions/src/util/hash/stableHash';

        const MyComponent = ({ items }) => {
          const itemsHash = useMemo(() => stableHash(items), [items]);

          useEffect(() => {
            console.log('Items changed!', items);
          }, [itemsHash]);

          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Using other properties is valid
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log('Items changed!', items);
          }, [items[0], items.someProperty]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // String.length should not trigger the rule
    {
      code: `
        const MyComponent = ({ text }) => {
          useEffect(() => {
            console.log('Text length:', text.length);
          }, [text.length]);
          return <div>{text}</div>;
        };
      `,
    },
    // Array.length used outside dependency arrays should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          const count = items.length;
          useEffect(() => {
            console.log('Count:', count);
          }, [count]);
          return <div>{count}</div>;
        };
      `,
    },
    // Array.length in non-hook contexts should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          const handleClick = () => {
            console.log('Items length:', items.length);
          };
          return <button onClick={handleClick}>Click</button>;
        };
      `,
    },
    // Array.length in comparison expressions should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log('Has items:', items.length > 0);
          }, [items.length > 0]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Array.length in mathematical operations should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log('Double length:', items.length * 2);
          }, [items.length * 2]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Array.length in template literals should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log(\`Items: \${items.length}\`);
          }, [\`items-\${items.length}\`]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Array.length in function calls should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log('Length:', Math.max(items.length, 0));
          }, [Math.max(items.length, 0)]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Array.length in object properties should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log('Config:', { count: items.length });
          }, [{ count: items.length }]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Array.length with equality comparison should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log('Empty:', items.length === 0);
          }, [items.length === 0]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Custom object with length property should not trigger
    {
      code: `
        const MyComponent = ({ customObj }) => {
          useEffect(() => {
            console.log('Custom length:', customObj.length);
          }, [customObj.length]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Array.length in conditional expressions should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log('Result:', items.length ? 'has items' : 'empty');
          }, [items.length ? 'has items' : 'empty']);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Array.length with logical operators should not trigger
    {
      code: `
        const MyComponent = ({ items, enabled }) => {
          useEffect(() => {
            console.log('Should process:', enabled && items.length > 0);
          }, [enabled && items.length > 0]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Array.length in array expressions should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log('Array:', [items.length, 'other']);
          }, [[items.length, 'other']]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Array.length with destructuring should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          const { length } = items;
          useEffect(() => {
            console.log('Length:', length);
          }, [length]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Non-React hooks should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          customHook(() => {
            console.log('Items changed!', items);
          }, [items.length]);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Hooks without dependency arrays should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log('Items length:', items.length);
          });
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Empty dependency arrays should not trigger
    {
      code: `
        const MyComponent = ({ items }) => {
          useEffect(() => {
            console.log('Items length:', items.length);
          }, []);
          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
  ],
  invalid: [
    // Basic case - using array.length
    {
      code: `
        import { useEffect } from 'react';

        function Component({ items }) {
          useEffect(() => {
            console.log('Items changed!', items);
          }, [items.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ items }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!', items);
          }, [itemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Optional chaining with array.length
    {
      code: `
        import { useEffect } from 'react';

        function Component({ items }) {
          useEffect(() => {
            console.log('Items changed!', items);
          }, [items?.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ items }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!', items);
          }, [itemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // useCallback with array.length
    {
      code: `
        import { useCallback } from 'react';

        function Component({ items }) {
          const handleClick = useCallback(() => {
            console.log('Items changed!', items);
          }, [items.length]);

          return <button onClick={handleClick}>Click</button>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useCallback, useMemo } from 'react';

        function Component({ items }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  const handleClick = useCallback(() => {
            console.log('Items changed!', items);
          }, [itemsHash]);

          return <button onClick={handleClick}>Click</button>;
        }
      `,
    },
    // useMemo with array.length
    {
      code: `
        import { useMemo } from 'react';

        function Component({ items }) {
          const processedData = useMemo(() => {
            return items.map(item => item * 2);
          }, [items.length]);

          return <div>{processedData}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useMemo } from 'react';

        function Component({ items }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  const processedData = useMemo(() => {
            return items.map(item => item * 2);
          }, [itemsHash]);

          return <div>{processedData}</div>;
        }
      `,
    },
    // Nested property access with array.length
    {
      code: `
        import { useEffect } from 'react';

        function Component({ data }) {
          useEffect(() => {
            console.log('Data items changed!');
          }, [data.items.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'data.items',
            hashName: 'dataitemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ data }) {
          const dataitemsHash = useMemo(() => stableHash(data.items), [data.items]);
  useEffect(() => {
            console.log('Data items changed!');
          }, [dataitemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length with computed property access
    {
      code: `
        import { useEffect } from 'react';

        function Component({ items }) {
          useEffect(() => {
            console.log('Items changed!', items);
          }, [items['length']]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ items }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!', items);
          }, [itemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length mixed with other dependencies
    {
      code: `
        import { useEffect } from 'react';

        function Component({ items, enabled }) {
          useEffect(() => {
            console.log('Items or enabled changed!');
          }, [items.length, enabled]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ items, enabled }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items or enabled changed!');
          }, [itemsHash, enabled]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length in custom hook
    {
      code: `
        import { useEffect } from 'react';

        function useCustomHook(items) {
          useEffect(() => {
            console.log('Items changed in custom hook!');
          }, [items.length]);
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function useCustomHook(items) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed in custom hook!');
          }, [itemsHash]);
        }
      `,
    },
    // Array.length with destructured array parameter
    {
      code: `
        import { useEffect } from 'react';

        function Component({ items: userItems }) {
          useEffect(() => {
            console.log('User items changed!');
          }, [userItems.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'userItems',
            hashName: 'userItemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ items: userItems }) {
          const userItemsHash = useMemo(() => stableHash(userItems), [userItems]);
  useEffect(() => {
            console.log('User items changed!');
          }, [userItemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length with camelCase array name
    {
      code: `
        import { useEffect } from 'react';

        function Component({ todoItems }) {
          useEffect(() => {
            console.log('Todo items changed!');
          }, [todoItems.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'todoItems',
            hashName: 'todoItemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ todoItems }) {
          const todoItemsHash = useMemo(() => stableHash(todoItems), [todoItems]);
  useEffect(() => {
            console.log('Todo items changed!');
          }, [todoItemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length with underscore in name
    {
      code: `
        import { useEffect } from 'react';

        function Component({ user_items }) {
          useEffect(() => {
            console.log('User items changed!');
          }, [user_items.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'user_items',
            hashName: 'user_itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ user_items }) {
          const user_itemsHash = useMemo(() => stableHash(user_items), [user_items]);
  useEffect(() => {
            console.log('User items changed!');
          }, [user_itemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Multiple array.length expressions - we only report the first one but fix both
    {
      code: `
        import { useEffect } from 'react';

        function Component({ items, users }) {
          useEffect(() => {
            console.log('Items or users changed!');
          }, [items.length, users.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ items, users }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  const usersHash = useMemo(() => stableHash(users), [users]);
  useEffect(() => {
            console.log('Items or users changed!');
          }, [itemsHash, usersHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length with complex array expressions
    {
      code: `
        import { useEffect } from 'react';

        function Component({ data }) {
          const items = data.filter(item => item.active);
          useEffect(() => {
            console.log('Filtered items changed!');
          }, [items.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ data }) {
          const items = data.filter(item => item.active);
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Filtered items changed!');
          }, [itemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length in arrow function component
    {
      code: `
        import { useEffect } from 'react';

        const Component = ({ items }) => {
          useEffect(() => {
            console.log('Items changed!');
          }, [items.length]);

          return <div>{/* Component JSX */}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        const Component = ({ items }) => {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!');
          }, [itemsHash]);

          return <div>{/* Component JSX */}</div>;
        };
      `,
    },
    // Array.length with state variable
    {
      code: `
        import { useEffect, useState } from 'react';

        function Component() {
          const [items, setItems] = useState([]);
          useEffect(() => {
            console.log('Items changed!');
          }, [items.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useState, useMemo } from 'react';

        function Component() {
          const [items, setItems] = useState([]);
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!');
          }, [itemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length with multiple hooks in same component
    {
      code: `
        import { useEffect, useCallback } from 'react';

        function Component({ items, users }) {
          useEffect(() => {
            console.log('Items changed!');
          }, [items.length]);

          const handleClick = useCallback(() => {
            console.log('Users changed!');
          }, [users.length]);

          return <button onClick={handleClick}>Click</button>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'users',
            hashName: 'usersHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useCallback, useMemo } from 'react';

        function Component({ items, users }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!');
          }, [itemsHash]);

          const handleClick = useCallback(() => {
            console.log('Users changed!');
          }, [users.length]);

          return <button onClick={handleClick}>Click</button>;
        }
      `,
    },
    // Array.length with TypeScript type annotations
    {
      code: `
        import { useEffect } from 'react';

        interface Props {
          items: string[];
        }

        function Component({ items }: Props) {
          useEffect(() => {
            console.log('Items changed!');
          }, [items.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        interface Props {
          items: string[];
        }

        function Component({ items }: Props) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!');
          }, [itemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length with React.useEffect
    {
      code: `
        import React from 'react';

        function Component({ items }) {
          React.useEffect(() => {
            console.log('Items changed!');
          }, [items.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import React, { useMemo } from 'react';

        function Component({ items }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  React.useEffect(() => {
            console.log('Items changed!');
          }, [itemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length with no existing React import
    {
      code: `
        function Component({ items }) {
          useEffect(() => {
            console.log('Items changed!');
          }, [items.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useMemo } from 'react';
function Component({ items }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!');
          }, [itemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // With existing useMemo import
    {
      code: `
        import { useEffect, useMemo } from 'react';

        function Component({ items, otherData }) {
          const processedData = useMemo(() => {
            return otherData.map(d => d * 2);
          }, [otherData]);

          useEffect(() => {
            console.log('Items changed!', items);
          }, [items.length]);

          return <div>{processedData}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ items, otherData }) {
          const processedData = useMemo(() => {
            return otherData.map(d => d * 2);
          }, [otherData]);

          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!', items);
          }, [itemsHash]);

          return <div>{processedData}</div>;
        }
      `,
    },
    // With existing stableHash import - should not add duplicate
    {
      code: `
        import { useEffect } from 'react';
        import { stableHash } from 'functions/src/util/hash/stableHash';

        function Component({ items, otherItems }) {
          const otherItemsHash = stableHash(otherItems);

          useEffect(() => {
            console.log('Items changed!', items);
          }, [items.length]);

          return <div>{otherItemsHash}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { useEffect, useMemo } from 'react';
        import { stableHash } from 'functions/src/util/hash/stableHash';

        function Component({ items, otherItems }) {
          const otherItemsHash = stableHash(otherItems);

          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!', items);
          }, [itemsHash]);

          return <div>{otherItemsHash}</div>;
        }
      `,
    },
    // Array.length with comments in dependency array
    {
      code: `
        import { useEffect } from 'react';

        function Component({ items }) {
          useEffect(() => {
            console.log('Items changed!');
          }, [
            items.length, // Track array length
          ]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ items }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!');
          }, [
            itemsHash, // Track array length
          ]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length with spread in dependency array
    {
      code: `
        import { useEffect } from 'react';

        function Component({ items, otherDeps }) {
          useEffect(() => {
            console.log('Items changed!');
          }, [items.length, ...otherDeps]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ items, otherDeps }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
            console.log('Items changed!');
          }, [itemsHash, ...otherDeps]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length with complex variable names
    {
      code: `
        import { useEffect } from 'react';

        function Component({ $specialItems }) {
          useEffect(() => {
            console.log('Special items changed!');
          }, [$specialItems.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: '$specialItems',
            hashName: '$specialItemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ $specialItems }) {
          const $specialItemsHash = useMemo(() => stableHash($specialItems), [$specialItems]);
  useEffect(() => {
            console.log('Special items changed!');
          }, [$specialItemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length with numeric variable names
    {
      code: `
        import { useEffect } from 'react';

        function Component({ items1, items2 }) {
          useEffect(() => {
            console.log('Items changed!');
          }, [items1.length, items2.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items1',
            hashName: 'items1Hash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ items1, items2 }) {
          const items1Hash = useMemo(() => stableHash(items1), [items1]);
  const items2Hash = useMemo(() => stableHash(items2), [items2]);
  useEffect(() => {
            console.log('Items changed!');
          }, [items1Hash, items2Hash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    // Array.length in nested component
    {
      code: `
        import { useEffect } from 'react';

        function ParentComponent({ items }) {
          const NestedComponent = () => {
            useEffect(() => {
              console.log('Items changed in nested!');
            }, [items.length]);

            return <div>Nested</div>;
          };

          return <NestedComponent />;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function ParentComponent({ items }) {
          const NestedComponent = () => {
            const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
              console.log('Items changed in nested!');
            }, [itemsHash]);

            return <div>Nested</div>;
          };

          return <NestedComponent />;
        }
      `,
    },
    // Array.length with useLayoutEffect
    {
      code: `
        import { useLayoutEffect } from 'react';

        function Component({ items }) {
          useLayoutEffect(() => {
            console.log('Items changed!');
          }, [items.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useLayoutEffect, useMemo } from 'react';

        function Component({ items }) {
          const itemsHash = useMemo(() => stableHash(items), [items]);
  useLayoutEffect(() => {
            console.log('Items changed!');
          }, [itemsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
  ],
});
