import { ruleTesterJsx } from './src/utils/ruleTester';
import { avoidArrayLengthDependency } from './src/rules/avoid-array-length-dependency';

// Simple test to check the autofix
ruleTesterJsx.run('avoid-array-length-dependency-simple', avoidArrayLengthDependency, {
  valid: [],
  invalid: [
    {
      code: `import { useEffect } from 'react';

function Component({ items }) {
  useEffect(() => {
    console.log('Items changed!', items);
  }, [items.length]);

  return <div>{/* Component JSX */}</div>;
}`,
      errors: [
        {
          messageId: 'avoidArrayLengthDependency',
          data: {
            arrayName: 'items',
            hashName: 'itemsHash',
          },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

function Component({ items }) {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
    console.log('Items changed!', items);
  }, [itemsHash]);

  return <div>{/* Component JSX */}</div>;
}`,
    },
  ],
});
