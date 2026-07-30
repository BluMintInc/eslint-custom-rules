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
      // Issue #1398 reproduction: the tracked variable is declared inside the
      // hook body, so the memo must be inserted there (after the declaration,
      // before the consuming hook), and the react import must be extended
      // rather than duplicated.
      code: `
import { useEffect } from 'react';
import { useParticipants } from './livekit';

export const useThing = () => {
  const participants = useParticipants();

  useEffect(() => {
    console.log('changed');
  }, [participants.length]);
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'participants.length' },
        },
      ],
      output: `
import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';
import { useParticipants } from './livekit';

export const useThing = () => {
  const participants = useParticipants();

  const participantsHash = useMemo(() => stableHash(participants), [participants]);
  useEffect(() => {
    console.log('changed');
  }, [participantsHash]);
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
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
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

const C = ({ data }) => {
  const itemsHash = useMemo(() => stableHash(data?.items), [data?.items]);
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

const C = ({ ctx }) => {
  const listHash = useMemo(() => stableHash(ctx.user.list), [ctx.user.list]);
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

const C = ({ items, users, messages }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  const usersHash = useMemo(() => stableHash(users), [users]);
  const messagesHash = useMemo(() => stableHash(messages), [messages]);
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

const C = ({ items, id }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
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

const itemsHash = 1;
const C = ({ items }) => {
  const itemsHash2 = useMemo(() => stableHash(items), [items]);
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

const C = ({ s }) => {
  const usersHash = useMemo(() => stableHash(s?.users), [s?.users]);
  useEffect(() => {}, [usersHash]);
  return null;
};
`,
    },
    {
      // Two hooks sharing one array in the same block: a single memo is
      // declared before the first consumer and both dependency arrays are
      // rewritten to use it.
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

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  const cb = useCallback(() => {}, [itemsHash]);
  const memo = useMemo(() => 1, [itemsHash]);
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

const C = ({ items }) => {
  const itemsHash = useMemo(() => makeHash(items), [items]);
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

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
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

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
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

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
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

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
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

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
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

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
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

const C = ({ items, users }) => {
  const usersHash = useMemo(() => stableHash(users), [users]);
  useEffect(() => {
    users.forEach((user) => console.log(user));
    console.log(items.length);
  }, [items.length, usersHash]);
  return null;
};
`,
    },
    {
      // Both imports already exist: the fixer must not duplicate either one.
      code: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = () => {
  const items = useItems();
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
      output: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = () => {
  const items = useItems();
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
    process(items);
  }, [itemsHash]);
  return null;
};
`,
    },
    {
      // Member-expression base (infiniteHits.hits.length) rooted in a hook
      // parameter, alongside a destructured local: each memo lands before its
      // consuming hook, inside the hook function body.
      code: `
import { useEffect, useMemo } from 'react';

export const useCustomHits = (infiniteHits) => {
  const { items, isLastPage } = infiniteHits;
  const isLoading = useMemo(() => {
    return infiniteHits.items.length === 0;
  }, [infiniteHits.hits.length]);
  useEffect(() => {
    canLoadMore.current = !isLastPage;
  }, [items.length, isLastPage]);
  return isLoading;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'infiniteHits.hits.length' },
        },
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `
import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

export const useCustomHits = (infiniteHits) => {
  const { items, isLastPage } = infiniteHits;
  const hitsHash = useMemo(() => stableHash(infiniteHits.hits), [infiniteHits.hits]);
  const isLoading = useMemo(() => {
    return infiniteHits.items.length === 0;
  }, [hitsHash]);
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {
    canLoadMore.current = !isLastPage;
  }, [itemsHash, isLastPage]);
  return isLoading;
};
`,
    },
    {
      // Optional-chained dependency on a hook-local array (agora useJoinCall
      // shape): memo inserted after the declaration, react import extended.
      code: `
import { useEffect } from 'react';

export const useJoinCall = () => {
  const participants = useParticipants();
  useEffect(() => {
    join(participants);
  }, [participants?.length]);
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'participants?.length' },
        },
      ],
      output: `
import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

export const useJoinCall = () => {
  const participants = useParticipants();
  const participantsHash = useMemo(() => stableHash(participants), [participants]);
  useEffect(() => {
    join(participants);
  }, [participantsHash]);
};
`,
    },
    {
      // Default-only react import gains a named specifier list.
      code: `
import React from 'react';

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
      output: `
import { stableHash } from 'functions/src/util/hash/stableHash';
import React, { useMemo } from 'react';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {}, [itemsHash]);
  return null;
};
`,
    },
    {
      // An aliased useMemo specifier does not provide the canonical name; the
      // existing declaration is extended with the plain specifier.
      code: `
import { useMemo as um } from 'react';

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
      output: `
import { stableHash } from 'functions/src/util/hash/stableHash';
import { useMemo as um, useMemo } from 'react';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {}, [itemsHash]);
  return null;
};
`,
    },
    {
      // A type-only react import cannot host a value specifier; a separate
      // value import is added instead.
      code: `
import type { FC } from 'react';

const C: FC = () => {
  const items = useItems();
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
      output: `
import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';
import type { FC } from 'react';

const C: FC = () => {
  const items = useItems();
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {}, [itemsHash]);
  return null;
};
`,
    },
    {
      // Hook nested in a conditional block with the array declared there: the
      // memo lands inside that block, right before the hook.
      code: `
const C = ({ flag }) => {
  if (flag) {
    const items = getItems();
    useEffect(() => {
      process(items);
    }, [items.length]);
  }
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

const C = ({ flag }) => {
  if (flag) {
    const items = getItems();
    const itemsHash = useMemo(() => stableHash(items), [items]);
    useEffect(() => {
      process(items);
    }, [itemsHash]);
  }
  return null;
};
`,
    },
    {
      // An eslint-disable-next-line comment stays attached to the hook it
      // suppresses; the memo is inserted above the comment.
      code: `
const C = ({ items }) => {
  // eslint-disable-next-line no-console
  useEffect(() => {
    console.log(items);
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

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  // eslint-disable-next-line no-console
  useEffect(() => {
    console.log(items);
  }, [itemsHash]);
  return null;
};
`,
    },
    {
      // Bail: a hook call at module scope has no legal insertion point for a
      // useMemo declaration -> report without fixing.
      code: `
const items = [1, 2, 3];
useEffect(() => {}, [items.length]);
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: null,
    },
    {
      // Bail: the array is declared after the hook statement, so a memo
      // inserted above the hook would read it in the temporal dead zone.
      code: `
const C = () => {
  useEffect(() => {}, [items.length]);
  const items = getItems();
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: null,
    },
    {
      // Bail: an expression-bodied arrow has no statement position to hold
      // the memo declaration.
      code: `
const C = ({ items }) => useMemo(() => items.map((item) => item.id), [items.length]);
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: null,
    },
    {
      // Bail: the base resolves to no declaration in any reachable scope
      // (ambient global) -> never generate code around an unproven binding.
      code: `
const C = () => {
  useEffect(() => {}, [window.frames.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'window.frames.length' },
        },
      ],
      output: null,
    },
    {
      // Bail: one dependency is safe but another is not -> report-only for
      // the whole hook rather than emitting a partial fix.
      code: `
const C = ({ items }) => {
  useEffect(() => {}, [items.length, window.frames.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length, window.frames.length' },
        },
      ],
      output: null,
    },
    {
      // Bail: a lexical declaration in a braceless switch case is scoped to
      // the switch, but the insertion point sits before the whole switch
      // statement where that binding is not visible.
      code: `
const C = ({ kind }) => {
  switch (kind) {
    case 'a':
      const items = getItems();
      useEffect(() => {
        process(items);
      }, [items.length]);
      break;
  }
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: null,
    },
  ],
});
