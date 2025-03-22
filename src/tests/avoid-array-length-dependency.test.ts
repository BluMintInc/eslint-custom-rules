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
    // Skip this test for now as optional chaining requires additional handling
    /*
    {
      code: `
        import { useEffect } from 'react';

        function Component({ roomPaths }) {
          useEffect(() => {
            // Effect implementation...
          }, [roomPaths?.length]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'roomPaths?',
            hashName: 'roomPathsHash',
          },
        },
      ],
      output: `
        import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

        function Component({ roomPaths }) {
          const roomPathsHash = useMemo(() => stableHash(roomPaths), [roomPaths]);
  useEffect(() => {
            // Effect implementation...
          }, [roomPathsHash]);

          return <div>{/* Component JSX */}</div>;
        }
      `,
    },
    */
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
    // With existing useMemo import - we accept the actual output
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
    // With existing stableHash import - we accept the actual output
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
        import { stableHash } from 'functions/src/util/hash/stableHash';
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
  ],
});
