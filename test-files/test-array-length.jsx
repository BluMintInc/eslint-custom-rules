import { useEffect } from 'react';

function Component({ items }) {
  useEffect(() => {
    console.log('Items changed!', items);
  }, [items.length]);

  return <div>{/* Component JSX */}</div>;
}

export default Component;
