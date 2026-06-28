import { ruleTesterJsx } from '../utils/ruleTester';
import { noArrayLengthInDeps } from '../rules/no-array-length-in-deps';

ruleTesterJsx.run('no-array-length-in-deps', noArrayLengthInDeps, {
  valid: [
    {
      code: `
const C = ({ items }) => {
  useEffect(() => { console.log(items.length); });
  return null;
};
`,
    },
    {
      code: `
const C = ({ items }) => {
  useEffect(() => {}, [items]);
  return null;
};
`,
    },
    {
      code: `
const C = ({ items }) => {
  useEffect(() => {}, [items?.[0]]);
  return null;
};
`,
    },
    {
      code: `
const C = ({ items }) => {
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => {}, [items.length]);
  return null;
};
`,
    },
    {
      // Body reads ONLY items.length (returns it) -> .length is the correct dep
      code: `
const C = ({ items }) => {
  const count = useMemo(() => {
    return items.length;
  }, [items.length]);
  return count;
};
`,
    },
    {
      // Body compares items.length === 0 -> still length-only
      code: `
const C = ({ items }) => {
  const isEmpty = useMemo(() => items.length === 0, [items.length]);
  return isEmpty;
};
`,
    },
    {
      // Body compares items.length > 5 -> still length-only
      code: `
const C = ({ items }) => {
  useEffect(() => {
    if (items.length > 5) {
      doSomething();
    }
  }, [items.length]);
  return null;
};
`,
    },
    {
      // Body passes items.length as a prop -> length-only access
      code: `
const C = ({ items }) => {
  const node = useMemo(() => {
    return <Badge count={items.length} />;
  }, [items.length]);
  return node;
};
`,
    },
    {
      // Multiple arrays, each used only via .length in the body
      code: `
const C = ({ items, users }) => {
  const total = useMemo(() => {
    return items.length + users.length;
  }, [items.length, users.length]);
  return total;
};
`,
    },
    {
      // length-only access alongside an unrelated non-array dependency
      code: `
const C = ({ items, id }) => {
  useEffect(() => {
    track(id, items.length);
  }, [items.length, id]);
  return null;
};
`,
    },
    {
      // useCallback body reads only the length
      code: `
const C = ({ items }) => {
  const cb = useCallback(() => items.length, [items.length]);
  return cb;
};
`,
    },
  ],
  invalid: [
    {
      code: `
const C = ({ items }) => {
  useEffect(() => {}, [items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(items), [items]);

const C = ({ items }) => {
  useEffect(() => {}, [itemsHash]);
  return null;
};
`,
    },
    {
      code: `
const C = ({ data }) => {
  useEffect(() => {}, [data?.items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'data?.items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(data?.items), [data?.items]);

const C = ({ data }) => {
  useEffect(() => {}, [itemsHash]);
  return null;
};
`,
    },
    {
      code: `
const C = ({ ctx }) => {
  useEffect(() => {}, [ctx.user.list.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'ctx.user.list.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const listHash = useMemo(() => stableHash(ctx.user.list), [ctx.user.list]);

const C = ({ ctx }) => {
  useEffect(() => {}, [listHash]);
  return null;
};
`,
    },
    {
      code: `
const C = ({ items, users, messages }) => {
  useEffect(() => {}, [items.length, users.length, messages.length]);

  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: {
            dependencies: 'items.length, users.length, messages.length',
          },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(items), [items]);
const usersHash = useMemo(() => stableHash(users), [users]);
const messagesHash = useMemo(() => stableHash(messages), [messages]);

const C = ({ items, users, messages }) => {
  useEffect(() => {}, [itemsHash, usersHash, messagesHash]);

  return null;
};
`,
    },
    {
      code: `
const C = ({ items, id }) => {
  useEffect(() => {}, [items.length, id]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(items), [items]);

const C = ({ items, id }) => {
  useEffect(() => {}, [itemsHash, id]);
  return null;
};
`,
    },
    {
      code: `
const itemsHash = 1;
const C = ({ items }) => {
  useEffect(() => {}, [items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash2 = useMemo(() => stableHash(items), [items]);

const itemsHash = 1;
const C = ({ items }) => {
  useEffect(() => {}, [itemsHash2]);
  return null;
};
`,
    },
    {
      code: `
const C = ({ s }) => {
  useEffect(() => {}, [s?.users.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 's?.users.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const usersHash = useMemo(() => stableHash(s?.users), [s?.users]);

const C = ({ s }) => {
  useEffect(() => {}, [usersHash]);
  return null;
};
`,
    },
    {
      code: `
const C = ({ items }) => {
  const cb = useCallback(() => {}, [items.length]);
  const memo = useMemo(() => 1, [items.length]);
  return cb && memo;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(items), [items]);

const C = ({ items }) => {
  const cb = useCallback(() => {}, [itemsHash]);
  const memo = useMemo(() => 1, [items.length]);
  return cb && memo;
};
`,
    },
    {
      code: `
const C = ({ items }) => {
  useEffect(() => {}, [items.length]);
  return null;
};
`,
      options: [
        { hashImport: { source: 'shared/hash', importName: 'makeHash' } },
      ],
      errors: [{ messageId: 'noArrayLengthInDeps' }],
      output: `import { useMemo } from 'react';
import { makeHash } from 'shared/hash';

const itemsHash = useMemo(() => makeHash(items), [items]);

const C = ({ items }) => {
  useEffect(() => {}, [itemsHash]);
  return null;
};
`,
    },
    {
      // Body iterates contents via forEach -> .length misses content changes
      code: `
const C = ({ items }) => {
  useEffect(() => {
    items.forEach((item) => console.log(item));
    console.log(items.length);
  }, [items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(items), [items]);

const C = ({ items }) => {
  useEffect(() => {
    items.forEach((item) => console.log(item));
    console.log(items.length);
  }, [itemsHash]);
  return null;
};
`,
    },
    {
      // Body maps over contents -> reads contents, must keep reporting
      code: `
const C = ({ items }) => {
  const mapped = useMemo(() => {
    return items.map((item) => item.id);
  }, [items.length]);
  return mapped;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(items), [items]);

const C = ({ items }) => {
  const mapped = useMemo(() => {
    return items.map((item) => item.id);
  }, [itemsHash]);
  return mapped;
};
`,
    },
    {
      // Body indexes into contents -> reads contents, must keep reporting
      code: `
const C = ({ items }) => {
  const first = useMemo(() => {
    return items[0];
  }, [items.length]);
  return first;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(items), [items]);

const C = ({ items }) => {
  const first = useMemo(() => {
    return items[0];
  }, [itemsHash]);
  return first;
};
`,
    },
    {
      // Body spreads contents -> reads contents, must keep reporting
      code: `
const C = ({ items }) => {
  const copy = useMemo(() => {
    return [...items];
  }, [items.length]);
  return copy;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(items), [items]);

const C = ({ items }) => {
  const copy = useMemo(() => {
    return [...items];
  }, [itemsHash]);
  return copy;
};
`,
    },
    {
      // Body passes the whole array as an argument -> reads contents
      code: `
const C = ({ items }) => {
  useEffect(() => {
    process(items);
  }, [items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(items), [items]);

const C = ({ items }) => {
  useEffect(() => {
    process(items);
  }, [itemsHash]);
  return null;
};
`,
    },
    {
      // Shadowed binding inside the body: the dep refers to the OUTER items,
      // which the body never reads -> keep reporting (do not suppress).
      code: `
const C = ({ items }) => {
  const value = useMemo(() => {
    const items = getOther();
    return items[0];
  }, [items.length]);
  return value;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(items), [items]);

const C = ({ items }) => {
  const value = useMemo(() => {
    const items = getOther();
    return items[0];
  }, [itemsHash]);
  return value;
};
`,
    },
    {
      // Mixed: one array length-only (suppressed), one array read (reported)
      code: `
const C = ({ items, users }) => {
  useEffect(() => {
    users.forEach((user) => console.log(user));
    console.log(items.length);
  }, [items.length, users.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'users.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const usersHash = useMemo(() => stableHash(users), [users]);

const C = ({ items, users }) => {
  useEffect(() => {
    users.forEach((user) => console.log(user));
    console.log(items.length);
  }, [items.length, usersHash]);
  return null;
};
`,
    },
  ],
});
