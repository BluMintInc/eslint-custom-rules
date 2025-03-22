import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

function Component({ items }) {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
    console.log('Items changed!', items);
  }, [itemsHash]);

  return <div>{/* Component JSX */}</div>;
}

export default Component;
