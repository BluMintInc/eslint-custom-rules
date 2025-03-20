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

export default Component;
