import { Linter, Rule } from 'eslint';
import { ruleTesterJsx } from '../utils/ruleTester';
import { noArrayLengthInDeps } from '../rules/no-array-length-in-deps';
import { noHungarian } from '../rules/no-hungarian';
import { encodesTypeMarker } from '../utils/hungarianNaming';

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
    {
      // Issue #1412: every violation suppressed inline leaves the file with no
      // reports at all, so no import and no rewrite can be emitted.
      code: `
const C = ({ items, others }) => {
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(others); }, [others.length]);
  return null;
};
`,
    },
    {
      // Issue #1412: a bare line disable targets every rule, including this one.
      code: `
const C = ({ items }) => {
  // eslint-disable-next-line
  useEffect(() => { console.log(items); }, [items.length]);
  return null;
};
`,
    },
    {
      // Issue #1412: a whole-file block disable suppresses every violation.
      code: `/* eslint-disable no-array-length-in-deps */
const C = ({ items, others }) => {
  useEffect(() => { console.log(items); }, [items.length]);
  useEffect(() => { console.log(others); }, [others.length]);
  return null;
};
`,
    },
    {
      // Issue #1412: a bare block disable covers this rule too.
      code: `/* eslint-disable */
const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
  return null;
};
`,
    },
    {
      // Issue #1412: an `eslint-disable-line` trailing the hook suppresses it.
      code: `
const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]); // eslint-disable-line no-array-length-in-deps
  return null;
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

  const participantsHash = useMemo(
    () => stableHash(participants),
    [participants],
  );
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
  const hitsHash = useMemo(
    () => stableHash(infiniteHits.hits),
    [infiniteHits.hits],
  );
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
  const participantsHash = useMemo(
    () => stableHash(participants),
    [participants],
  );
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
    {
      // Issue #1412: the imports ride on a single violation's fix, so that
      // violation is the file's import carrier. Suppressing the first violation
      // must hand the carrier slot to the first violation that survives —
      // otherwise the surviving rewrite references `useMemo` and `stableHash`
      // with neither imported.
      code: `import { useEffect } from 'react';

const C = ({ items, others }) => {
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  useEffect(() => { console.log(others); }, [others.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'others.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ items, others }) => {
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  const othersHash = useMemo(() => stableHash(others), [others]);
  useEffect(() => { console.log(others); }, [othersHash]);
  return null;
};
`,
    },
    {
      // Issue #1412: suppressing a middle violation keeps the carrier on the
      // first survivor and leaves the later survivors untouched by the change.
      code: `import { useEffect } from 'react';

const C = ({ first, second, third }) => {
  useEffect(() => { console.log(first); }, [first.length]);
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(second); }, [second.length]);
  useEffect(() => { console.log(third); }, [third.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'first.length' },
        },
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'third.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ first, second, third }) => {
  const firstHash = useMemo(() => stableHash(first), [first]);
  useEffect(() => { console.log(first); }, [firstHash]);
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(second); }, [second.length]);
  const thirdHash = useMemo(() => stableHash(third), [third]);
  useEffect(() => { console.log(third); }, [thirdHash]);
  return null;
};
`,
    },
    {
      // Issue #1412: suppressing the last violation leaves the carrier where it
      // already was — the imports still land exactly once.
      code: `import { useEffect } from 'react';

const C = ({ items, others }) => {
  useEffect(() => { console.log(items); }, [items.length]);
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(others); }, [others.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ items, others }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items); }, [itemsHash]);
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(others); }, [others.length]);
  return null;
};
`,
    },
    {
      // Issue #1412: a disable naming a DIFFERENT rule must not suppress this
      // one. The memo still lands above the comment so the other rule's
      // suppression keeps pointing at the hook (see findDeclarationAnchor).
      code: `import { useEffect } from 'react';

const C = ({ items }) => {
  // eslint-disable-next-line no-console
  useEffect(() => { console.log(items); }, [items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  // eslint-disable-next-line no-console
  useEffect(() => { console.log(items); }, [itemsHash]);
  return null;
};
`,
    },
    {
      // Issue #1412: both bindings already imported -> the surviving violation
      // adds no duplicate import of either.
      code: `import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items, others }) => {
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  useEffect(() => { console.log(others); }, [others.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'others.length' },
        },
      ],
      output: `import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items, others }) => {
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  const othersHash = useMemo(() => stableHash(others), [others]);
  useEffect(() => { console.log(others); }, [othersHash]);
  return null;
};
`,
    },
    {
      // Issue #1412: only `stableHash` is already imported -> the survivor adds
      // exactly the missing `useMemo` specifier, once.
      code: `import { useEffect } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items, others }) => {
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  useEffect(() => { console.log(others); }, [others.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'others.length' },
        },
      ],
      output: `import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items, others }) => {
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  const othersHash = useMemo(() => stableHash(others), [others]);
  useEffect(() => { console.log(others); }, [othersHash]);
  return null;
};
`,
    },
    {
      // Issue #1412: an `eslint-enable` re-opens the rule, so a violation after
      // it carries the imports even though earlier ones are suppressed.
      code: `import { useEffect } from 'react';

/* eslint-disable no-array-length-in-deps */
const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
  return null;
};
/* eslint-enable no-array-length-in-deps */

const D = ({ others }) => {
  useEffect(() => { console.log(others); }, [others.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'others.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

/* eslint-disable no-array-length-in-deps */
const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
  return null;
};
/* eslint-enable no-array-length-in-deps */

const D = ({ others }) => {
  const othersHash = useMemo(() => stableHash(others), [others]);
  useEffect(() => { console.log(others); }, [othersHash]);
  return null;
};
`,
    },
    {
      // Issue #1412: two violations in the SAME hook's deps array are one
      // report, so suppressing the previous hook must still hand both memo
      // declarations and both imports to this survivor.
      //
      // Issue #1997: the `b` base takes the `hashOf<Base>` spelling because
      // `bHash` reads to `no-hungarian` as the single-letter boolean prefix
      // `b` glued to a capital; `a` keeps `aHash`, since `a` is not one of
      // that rule's type-prefix letters.
      code: `import { useEffect } from 'react';

const C = ({ items, a, b }) => {
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  useEffect(() => { console.log(a, b); }, [a.length, b.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'a.length, b.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ items, a, b }) => {
  // eslint-disable-next-line no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  const aHash = useMemo(() => stableHash(a), [a]);
  const hashOfB = useMemo(() => stableHash(b), [b]);
  useEffect(() => { console.log(a, b); }, [aHash, hashOfB]);
  return null;
};
`,
    },
    // ------------------------------------------------------------------
    // Issue #1425: the fix emits `useMemo(() => stableHash(...))` and imports
    // both names, so an existing binding of either name makes the edit wrong
    // twice over — a module-scope declaration collides with the inserted
    // import (TS2440, or TS2300 when the binding is itself an import), and a
    // shadow at the fix site captures the emitted call with no compile error
    // at all. The emitted code needs both names, so a collision on either one
    // withholds the whole edit. The report stands.
    // ------------------------------------------------------------------
    {
      name: 'a module-scope const named stableHash withholds the fix',
      code: `
const stableHash = (value) => String(value);

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a module-scope const named useMemo withholds the fix',
      code: `
const useMemo = (factory) => factory();

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a function declaration named stableHash withholds the fix',
      code: `
function stableHash(value) {
  return String(value);
}

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a function declaration named useMemo withholds the fix',
      code: `
function useMemo(factory) {
  return factory();
}

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a class declaration named stableHash withholds the fix',
      code: `
class stableHash {}

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a class declaration named useMemo withholds the fix',
      code: `
class useMemo {}

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a named stableHash import from another module withholds the fix',
      code: `import { stableHash } from 'some-other-hash';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a named useMemo import from another module withholds the fix',
      code: `import { useMemo } from 'preact/hooks';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a namespace import named stableHash withholds the fix',
      code: `import * as stableHash from 'some-other-hash';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a namespace import named useMemo withholds the fix',
      code: `import * as useMemo from 'some-memo-helpers';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a default import named stableHash withholds the fix',
      code: `import stableHash from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a default import named useMemo withholds the fix',
      code: `import useMemo from 'react';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a type-only stableHash import withholds the fix',
      code: `import type { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a type-only useMemo import withholds the fix',
      code: `import type { useMemo } from 'react';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'an inline type-only stableHash specifier withholds the fix',
      code: `import { type stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'an aliased stableHash import binding the name withholds the fix',
      code: `import { hashOf as stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a shadowing parameter named stableHash withholds the fix at that site',
      code: `
const C = ({ items }) => {
  const render = (stableHash) => {
    useEffect(() => { console.log(items); }, [items.length]);
    return stableHash;
  };
  return render;
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
      name: 'a shadowing parameter named useMemo withholds the fix at that site',
      code: `
const C = ({ items }) => {
  const render = (useMemo) => {
    useEffect(() => { console.log(items); }, [items.length]);
    return useMemo;
  };
  return render;
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
      name: 'a block-scoped stableHash binding withholds the fix at that site',
      code: `
const C = ({ items }) => {
  if (items) {
    const stableHash = compute(items);
    useEffect(() => { console.log(items, stableHash); }, [items.length]);
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
    {
      name: 'a block-scoped useMemo binding withholds the fix at that site',
      code: `
const C = ({ items }) => {
  if (items) {
    const useMemo = compute(items);
    useEffect(() => { console.log(items, useMemo); }, [items.length]);
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
    {
      name: 'a shadowed site declines while an unshadowed site still carries both imports',
      code: `
const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
  const render = (stableHash) => {
    useEffect(() => { console.log(items); }, [items.length]);
    return stableHash;
  };
  return render;
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
  useEffect(() => { console.log(items); }, [itemsHash]);
  const render = (stableHash) => {
    useEffect(() => { console.log(items); }, [items.length]);
    return stableHash;
  };
  return render;
};
`,
    },
    {
      name: 'an existing react useMemo import is reused rather than duplicated',
      code: `import { useEffect, useMemo } from 'react';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items); }, [itemsHash]);
  return null;
};
`,
    },
    {
      name: 'an existing stableHash import from the intended module is reused',
      code: `import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
  useEffect(() => { console.log(items); }, [itemsHash]);
  return null;
};
`,
    },
    {
      name: 'both helpers already imported adds no specifier and still rewrites the dep',
      code: `import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items); }, [itemsHash]);
  return null;
};
`,
    },
    {
      // Appending `, stableHash` in place would push the import line to 86
      // columns; prettier then re-wraps it, so the fixer authors the
      // one-specifier-per-line layout prettier keeps (#2128).
      name: 'a stableHash import aliased to another local name does not decline',
      code: `import { stableHash as hashOf } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items, hashOf); }, [items.length]);
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
import {
  stableHash as hashOf,
  stableHash,
} from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items, hashOf); }, [itemsHash]);
  return null;
};
`,
    },
    {
      // Same source as the previous case, but the configured width absorbs the
      // extension: the in-place append survives wherever it still fits.
      name: 'a wider printWidth keeps the extended import on one line',
      options: [{ printWidth: 100 }],
      code: `import { stableHash as hashOf } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items, hashOf); }, [items.length]);
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
import { stableHash as hashOf, stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items, hashOf); }, [itemsHash]);
  return null;
};
`,
    },
    {
      // An import prettier already broke across lines gains the specifier on
      // its own line at the same indent; joining it onto the last line would
      // be re-collapsed into a fresh wrap on the next format.
      name: 'a multi-line hash import gains the specifier on its own line',
      code: `import {
  stableHash as hashOf,
  somethingElseWithAVeryLongName,
} from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items, hashOf); }, [items.length]);
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
import {
  stableHash as hashOf,
  somethingElseWithAVeryLongName,
  stableHash,
} from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items, hashOf); }, [itemsHash]);
  return null;
};
`,
    },
    {
      // A comment inside a specifier is not in any gap the re-layout owns, so
      // the expansion carries it verbatim.
      name: 'expanding an over-width import preserves a specifier-interior comment',
      code: `import { stableHash /* legacy alias */ as hashOf } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items, hashOf); }, [items.length]);
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
import {
  stableHash /* legacy alias */ as hashOf,
  stableHash,
} from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items, hashOf); }, [itemsHash]);
  return null;
};
`,
    },
    {
      // A comment in a separator gap would be deleted by the re-layout, so
      // the extension is withheld and a separate declaration carries the
      // helper instead — every existing byte stays put.
      name: 'a separator-gap comment falls back to a separate import declaration',
      code: `import { /* legacy alias */ stableHash as hashOf } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items, hashOf); }, [items.length]);
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
import { /* legacy alias */ stableHash as hashOf } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items, hashOf); }, [itemsHash]);
  return null;
};
`,
    },
    {
      // A default-only import whose extension no longer fits takes the braced
      // block prettier prints for that overflow.
      name: 'an over-width default hash import gains a braced specifier block',
      code: `import theDefaultHashExportName from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
import theDefaultHashExportName, {
  stableHash,
} from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items); }, [itemsHash]);
  return null;
};
`,
    },
    {
      // `import d, * as ns` leaves no grammatical slot for `{ stableHash }`,
      // so the declaration is left alone and a separate import carries the
      // helper.
      name: 'a default-plus-namespace hash import falls back to a separate declaration',
      code: `import hashDefault, * as hashHelpers from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
import hashDefault, * as hashHelpers from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items); }, [itemsHash]);
  return null;
};
`,
    },
    {
      // The react import takes the same width-aware path as the hash import:
      // prettier already broke it, so useMemo lands on its own line.
      name: 'a multi-line react import gains useMemo on its own line',
      code: `import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useState,
} from 'react';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useState,
  useMemo,
} from 'react';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items); }, [itemsHash]);
  return null;
};
`,
    },
    {
      // Boundary: the extended react import is exactly 80 columns, which
      // prettier keeps, so the in-place append must survive at the width
      // itself and not just strictly under it.
      name: 'an extension landing exactly on the print width stays in place',
      code: `import { useEffect, useLayoutEffect, aaPaddingSpecifier } from 'react';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useLayoutEffect, aaPaddingSpecifier, useMemo } from 'react';

const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items); }, [itemsHash]);
  return null;
};
`,
    },
    {
      name: 'a configured hash import name is guarded against its own collision',
      options: [
        {
          hashImport: {
            source: 'src/util/hashValue',
            importName: 'hashValue',
          },
        },
      ],
      code: `
const hashValue = (value) => String(value);

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
      name: 'a configured hash import name already imported from its module is reused',
      options: [
        {
          hashImport: {
            source: 'src/util/hashValue',
            importName: 'hashValue',
          },
        },
      ],
      code: `import { hashValue } from 'src/util/hashValue';

const C = ({ items }) => {
  useEffect(() => { console.log(items); }, [items.length]);
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
import { hashValue } from 'src/util/hashValue';

const C = ({ items }) => {
  const itemsHash = useMemo(() => hashValue(items), [items]);
  useEffect(() => { console.log(items); }, [itemsHash]);
  return null;
};
`,
    },
    // ------------------------------------------------------------------
    // Issue #1997: the emitted binding must be a name `no-hungarian` accepts.
    // That rule ships at 'error' and is NOT fixable, so a generated name it
    // rejects converts this fixer's work into a manual rename in a file that
    // was clean before `--fix` ran. The rejected shapes are a leading `b`/`i`
    // before a capital, and any base that is itself a type word or one of its
    // abbreviations.
    // ------------------------------------------------------------------
    {
      name: 'a single-letter `b` base avoids the Hungarian boolean prefix',
      code: `import { useEffect } from 'react';

const C = ({ b }) => {
  useEffect(() => { console.log(b); }, [b.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'b.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ b }) => {
  const hashOfB = useMemo(() => stableHash(b), [b]);
  useEffect(() => { console.log(b); }, [hashOfB]);
  return null;
};
`,
    },
    {
      name: 'a single-letter `i` base avoids the Hungarian integer prefix',
      code: `import { useEffect } from 'react';

const C = ({ i }) => {
  useEffect(() => { console.log(i); }, [i.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'i.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ i }) => {
  const hashOfI = useMemo(() => stableHash(i), [i]);
  useEffect(() => { console.log(i); }, [hashOfI]);
  return null;
};
`,
    },
    {
      // Control: `a` is not one of the single-letter type prefixes, so the
      // preferred `<base>Hash` spelling is kept for short bases too.
      name: 'a single-letter `a` base keeps aHash',
      code: `import { useEffect } from 'react';

const C = ({ a }) => {
  useEffect(() => { console.log(a); }, [a.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'a.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ a }) => {
  const aHash = useMemo(() => stableHash(a), [a]);
  useEffect(() => { console.log(a); }, [aHash]);
  return null;
};
`,
    },
    {
      // Control: same for `x`.
      name: 'a single-letter `x` base keeps xHash',
      code: `import { useEffect } from 'react';

const C = ({ x }) => {
  useEffect(() => { console.log(x); }, [x.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'x.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ x }) => {
  const xHash = useMemo(() => stableHash(x), [x]);
  useEffect(() => { console.log(x); }, [xHash]);
  return null;
};
`,
    },
    {
      // An abbreviation marker taints every name that carries it as a segment
      // (objHash, hashOfObj, stableObjHash all report), so the base is dropped.
      name: 'an `obj` base drops the type-coded base entirely',
      code: `import { useEffect } from 'react';

const C = ({ obj }) => {
  useEffect(() => { console.log(obj); }, [obj.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'obj.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ obj }) => {
  const contentHash = useMemo(() => stableHash(obj), [obj]);
  useEffect(() => { console.log(obj); }, [contentHash]);
  return null;
};
`,
    },
    {
      name: 'an `arr` base drops the type-coded base entirely',
      code: `import { useEffect } from 'react';

const C = ({ arr }) => {
  useEffect(() => { console.log(arr); }, [arr.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'arr.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ arr }) => {
  const contentHash = useMemo(() => stableHash(arr), [arr]);
  useEffect(() => { console.log(arr); }, [contentHash]);
  return null;
};
`,
    },
    {
      // A spelled-out type word is rejected as a leading marker (arrayHash),
      // and `hashOfArray` trips the trailing-marker arm, so it lands on the
      // base-free name as well.
      name: 'an `array` base drops the type-coded base entirely',
      code: `import { useEffect } from 'react';

const C = ({ array }) => {
  useEffect(() => { console.log(array); }, [array.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'array.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ array }) => {
  const contentHash = useMemo(() => stableHash(array), [array]);
  useEffect(() => { console.log(array); }, [contentHash]);
  return null;
};
`,
    },
    {
      // A member chain whose LAST property is the type-coded word: the base
      // text stays `data.obj` in the memo, only the binding name changes.
      name: 'a member chain ending in `obj` drops the type-coded base',
      code: `import { useEffect } from 'react';

const C = ({ data }) => {
  useEffect(() => { console.log(data.obj); }, [data.obj.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'data.obj.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ data }) => {
  const contentHash = useMemo(() => stableHash(data.obj), [data.obj]);
  useEffect(() => { console.log(data.obj); }, [contentHash]);
  return null;
};
`,
    },
    {
      // Two rejected bases in one deps array still get distinct names.
      name: 'two type-coded bases in one deps array are disambiguated',
      code: `import { useEffect } from 'react';

const C = ({ obj, arr }) => {
  useEffect(() => { console.log(obj, arr); }, [obj.length, arr.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'obj.length, arr.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const C = ({ obj, arr }) => {
  const contentHash = useMemo(() => stableHash(obj), [obj]);
  const contentHash2 = useMemo(() => stableHash(arr), [arr]);
  useEffect(() => { console.log(obj, arr); }, [contentHash, contentHash2]);
  return null;
};
`,
    },
    {
      // An existing binding of the base-free name pushes the memo to the
      // numbered variant, exactly as a taken `<base>Hash` does.
      name: 'an existing contentHash binding forces the numbered variant',
      code: `import { useEffect } from 'react';

const contentHash = 1;
const C = ({ obj }) => {
  useEffect(() => { console.log(obj, contentHash); }, [obj.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'obj.length' },
        },
      ],
      output: `import { stableHash } from 'functions/src/util/hash/stableHash';
import { useEffect, useMemo } from 'react';

const contentHash = 1;
const C = ({ obj }) => {
  const contentHash2 = useMemo(() => stableHash(obj), [obj]);
  useEffect(() => { console.log(obj, contentHash); }, [contentHash2]);
  return null;
};
`,
    },
    {
      // A rejected base under a configured hash helper keeps the same naming
      // ladder: the binding name is independent of the helper's name.
      name: 'the naming ladder is independent of the configured hash helper',
      options: [
        {
          hashImport: { source: 'shared/hash', importName: 'makeHash' },
        },
      ],
      code: `import { useEffect } from 'react';

const C = ({ b }) => {
  useEffect(() => { console.log(b); }, [b.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'b.length' },
        },
      ],
      output: `import { makeHash } from 'shared/hash';
import { useEffect, useMemo } from 'react';

const C = ({ b }) => {
  const hashOfB = useMemo(() => makeHash(b), [b]);
  useEffect(() => { console.log(b); }, [hashOfB]);
  return null;
};
`,
    },
  ],
});

// Issue #1997: RuleTester pins the emitted text but says nothing about whether
// the REST of the shipped config accepts it. `no-hungarian` is an error rule
// with no fixer, so a generated binding it rejects leaves a manual rename in a
// file that was clean before `--fix` ran. These cases run the real fixer and
// then the real `no-hungarian` over its output, which is how the defect
// (`bHash` reported, `aHash` and `itemsHash` not) was found.
describe('no-array-length-in-deps: emitted names clear no-hungarian (issue #1997)', () => {
  const RULE_ID = '@blumintinc/blumint/no-array-length-in-deps';
  const HUNGARIAN_ID = '@blumintinc/blumint/no-hungarian';

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      noArrayLengthInDeps as unknown as Rule.RuleModule,
    );
    linter.defineRule(HUNGARIAN_ID, noHungarian as unknown as Rule.RuleModule);
    return linter;
  };

  const PARSER_CONFIG = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
      ecmaFeatures: { jsx: true },
    },
  };

  const fix = (code: string) =>
    makeLinter().verifyAndFix(
      code,
      { ...PARSER_CONFIG, rules: { [RULE_ID]: 'error' as const } },
      'Component.tsx',
    ).output;

  const hungarianReports = (code: string) =>
    makeLinter()
      .verify(
        code,
        { ...PARSER_CONFIG, rules: { [HUNGARIAN_ID]: 'error' as const } },
        'Component.tsx',
      )
      .filter((message) => message.ruleId === HUNGARIAN_ID);

  const componentFor = (base: string) => `import { useEffect } from 'react';

const C = ({ ${base} }) => {
  useEffect(() => { console.log(${base}); }, [${base}.length]);
  return null;
};
`;

  const emittedNameIn = (output: string) =>
    /const (\w+) = useMemo/.exec(output)?.[1] ?? null;

  // Realistic bases first, then every family the rule's predicate rejects:
  // the single-letter type prefixes, the abbreviation markers, and the
  // spelled-out type words.
  const BASES = [
    'items',
    'list',
    'users',
    'rows',
    'data',
    'entries',
    'values',
    'tags',
    'a',
    'b',
    'c',
    'i',
    'n',
    'x',
    'obj',
    'arr',
    'str',
    'num',
    'int',
    'bool',
    'array',
    'object',
    'string',
    'number',
    'boolean',
    'promise',
    'symbol',
    'regexp',
    'bigint',
  ];

  // The oracle must be able to fire and to stay silent, or "no reports after
  // the fix" would hold for a broken rule too.
  it('reports a hand-written bHash and accepts a hand-written itemsHash', () => {
    expect(
      hungarianReports(`const bHash = 1;\nexport default bHash;\n`),
    ).toHaveLength(1);
    expect(
      hungarianReports(`const itemsHash = 1;\nexport default itemsHash;\n`),
    ).toHaveLength(0);
  });

  it('leaves no-hungarian silent on every fixed output', () => {
    let fixedCount = 0;
    let fallbackCount = 0;

    for (const base of BASES) {
      const input = componentFor(base);
      // Control: the input is clean, so any report on the output belongs to
      // the name this fixer invented.
      expect({ base, before: hungarianReports(input).length }).toEqual({
        base,
        before: 0,
      });

      const output = fix(input);
      const emitted = emittedNameIn(output);
      expect({ base, emitted: emitted !== null }).toEqual({
        base,
        emitted: true,
      });
      fixedCount++;
      if (emitted !== `${base}Hash`) {
        fallbackCount++;
      }

      expect({ base, emitted, after: hungarianReports(output).length }).toEqual(
        {
          base,
          emitted,
          after: 0,
        },
      );
    }

    expect(fixedCount).toBe(BASES.length);
    // Non-vacuity: the fallback rungs of the ladder must actually be walked,
    // or the suite would pass on a fixer that never changed its naming.
    expect(fallbackCount).toBeGreaterThanOrEqual(15); // measured 17
  });

  it('keeps <base>Hash wherever no-hungarian accepts it', () => {
    for (const base of ['items', 'list', 'users', 'rows', 'data', 'a', 'x']) {
      expect(emittedNameIn(fix(componentFor(base)))).toBe(`${base}Hash`);
    }
  });

  // The fixer consults a mirror of `no-hungarian`'s predicate rather than the
  // rule itself. This pins the mirror to the real rule over every name the
  // fixer can emit, so a change to either surfaces here rather than as another
  // unfixable report in consumer code.
  it('agrees with no-hungarian on every name the fixer can emit', () => {
    const capitalize = (name: string) =>
      name.charAt(0).toUpperCase() + name.slice(1);
    const candidates = [
      ...BASES.flatMap((base) => [`${base}Hash`, `hashOf${capitalize(base)}`]),
      'contentHash',
      'contentHash2',
    ];

    let rejected = 0;
    let accepted = 0;
    for (const name of candidates) {
      const reportedByRule =
        hungarianReports(`const ${name} = 1;\nexport default ${name};\n`)
          .length > 0;
      expect({ name, encodesTypeMarker: encodesTypeMarker(name) }).toEqual({
        name,
        encodesTypeMarker: reportedByRule,
      });
      if (reportedByRule) {
        rejected++;
      } else {
        accepted++;
      }
    }

    // Both verdicts must be represented, or the agreement is trivial.
    expect(rejected).toBeGreaterThanOrEqual(25); // measured 32
    expect(accepted).toBeGreaterThanOrEqual(25); // measured 28
  });
});

// Issue #1412: RuleTester applies a single fix pass and never shows the file
// that `eslint --fix` actually writes. These cases run the real multi-pass fixer
// and assert the invariant the bug violated: emitted `useMemo(...)` /
// `stableHash(...)` code is never left without its import.
describe('no-array-length-in-deps: inline disables and the import carrier (issue #1412)', () => {
  const RULE_ID = '@blumintinc/blumint/no-array-length-in-deps';
  const HASH_IMPORT =
    "import { stableHash } from 'functions/src/util/hash/stableHash';";

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      noArrayLengthInDeps as unknown as Rule.RuleModule,
    );
    // A near-miss neighbour proves rule matching is exact rather than a
    // suffix/substring heuristic; the react-hooks rule is the disable users
    // most often park on a dependency array.
    for (const neighbour of [
      '@blumintinc/blumint/no-array-length-in-deps-strict',
      'react-hooks/exhaustive-deps',
    ]) {
      linter.defineRule(neighbour, {
        meta: { schema: [] },
        create: () => ({}),
      } as unknown as Rule.RuleModule);
    }
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: { [RULE_ID]: 'error' as const },
    };
    const { output } = linter.verifyAndFix(code, config, 'Component.tsx');
    return output;
  };

  /**
   * The invariant: any emitted call must have a binding. Counting occurrences
   * also catches the opposite failure, a fix that adds the import twice.
   */
  const expectNoUnboundHelpers = (output: string) => {
    const hashImports = output.split(HASH_IMPORT).length - 1;
    if (output.includes('stableHash(')) {
      expect(hashImports).toBe(1);
    } else {
      expect(hashImports).toBe(0);
    }

    const reactImports =
      output.match(/^import \{[^}]*\} from 'react';$/gm) ?? [];
    if (output.includes('useMemo(')) {
      expect(
        reactImports.filter((line) => /\buseMemo\b/.test(line)),
      ).toHaveLength(1);
    }
  };

  const CONTROL = `import { useEffect } from 'react';
const C = (items: any[], others: any[]) => {
  useEffect(() => { console.log(items); }, [items.length]);
  useEffect(() => { console.log(others); }, [others.length]);
};
`;

  it('fixes every violation and imports both helpers once when nothing is disabled', () => {
    const output = lint(CONTROL);

    expect(output).toBe(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
const C = (items: any[], others: any[]) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items); }, [itemsHash]);
  const othersHash = useMemo(() => stableHash(others), [others]);
  useEffect(() => { console.log(others); }, [othersHash]);
};
`);
    expectNoUnboundHelpers(output);
  });

  it('carries both imports on the first surviving violation', () => {
    const output = lint(`import { useEffect } from 'react';
const C = (items: any[], others: any[]) => {
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  useEffect(() => { console.log(others); }, [others.length]);
};
`);

    expect(output).toBe(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
const C = (items: any[], others: any[]) => {
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  const othersHash = useMemo(() => stableHash(others), [others]);
  useEffect(() => { console.log(others); }, [othersHash]);
};
`);
    expectNoUnboundHelpers(output);
  });

  it('keeps the imports when only the middle violation is disabled', () => {
    const output = lint(`import { useEffect } from 'react';
const C = (first: any[], second: any[], third: any[]) => {
  useEffect(() => { console.log(first); }, [first.length]);
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => { console.log(second); }, [second.length]);
  useEffect(() => { console.log(third); }, [third.length]);
};
`);

    expect(output).toBe(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
const C = (first: any[], second: any[], third: any[]) => {
  const firstHash = useMemo(() => stableHash(first), [first]);
  useEffect(() => { console.log(first); }, [firstHash]);
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => { console.log(second); }, [second.length]);
  const thirdHash = useMemo(() => stableHash(third), [third]);
  useEffect(() => { console.log(third); }, [thirdHash]);
};
`);
    expectNoUnboundHelpers(output);
  });

  it('keeps the imports when only the last violation is disabled', () => {
    const output = lint(`import { useEffect } from 'react';
const C = (items: any[], others: any[]) => {
  useEffect(() => { console.log(items); }, [items.length]);
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => { console.log(others); }, [others.length]);
};
`);

    expect(output).toBe(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
const C = (items: any[], others: any[]) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items); }, [itemsHash]);
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => { console.log(others); }, [others.length]);
};
`);
    expectNoUnboundHelpers(output);
  });

  it('adds neither import nor rewrite when every violation is disabled', () => {
    const code = `import { useEffect } from 'react';
const C = (items: any[], others: any[]) => {
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => { console.log(others); }, [others.length]);
};
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('stableHash');
    expect(output).not.toContain('useMemo');
  });

  it('adds nothing under a whole-file block disable', () => {
    const code = `/* eslint-disable @blumintinc/blumint/no-array-length-in-deps */
import { useEffect } from 'react';
const C = (items: any[], others: any[]) => {
  useEffect(() => { console.log(items); }, [items.length]);
  useEffect(() => { console.log(others); }, [others.length]);
};
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('stableHash');
    expect(output).not.toContain('useMemo');
  });

  it('treats a bare line disable as covering this rule', () => {
    const code = `import { useEffect } from 'react';
const C = (items: any[]) => {
  // eslint-disable-next-line
  useEffect(() => { console.log(items); }, [items.length]);
};
`;

    expect(lint(code)).toBe(code);
  });

  it('does not treat a disable for a different rule as its own', () => {
    const output = lint(`import { useEffect } from 'react';
const C = (items: any[]) => {
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps-strict
  useEffect(() => { console.log(items); }, [items.length]);
};
`);

    expect(output).toBe(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
const C = (items: any[]) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps-strict
  useEffect(() => { console.log(items); }, [itemsHash]);
};
`);
    expectNoUnboundHelpers(output);
  });

  it('does not treat a react-hooks disable on the same hook as its own', () => {
    const output = lint(`import { useEffect } from 'react';
const C = (items: any[]) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { console.log(items); }, [items.length]);
};
`);

    expect(output).toBe(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
const C = (items: any[]) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { console.log(items); }, [itemsHash]);
};
`);
    expectNoUnboundHelpers(output);
  });

  // The report is located on the dependency array, so for a multi-line hook the
  // directive that ESLint honours is the one on the deps line — not the one
  // above the `useEffect(`. Both placements must leave coherent output.
  it('withholds the fix when the disable sits on the deps line of a multi-line hook', () => {
    const output = lint(`import { useEffect } from 'react';
const C = (items: any[], others: any[]) => {
  useEffect(() => {
    console.log(items);
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  }, [items.length]);
  useEffect(() => {
    console.log(others);
  }, [others.length]);
};
`);

    expect(output).toBe(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
const C = (items: any[], others: any[]) => {
  useEffect(() => {
    console.log(items);
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  }, [items.length]);
  const othersHash = useMemo(() => stableHash(others), [others]);
  useEffect(() => {
    console.log(others);
  }, [othersHash]);
};
`);
    expectNoUnboundHelpers(output);
  });

  it('fixes a multi-line hook whose disable ESLint does not apply to the deps line', () => {
    const output = lint(`import { useEffect } from 'react';
const C = (items: any[]) => {
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => {
    console.log(items);
  }, [items.length]);
};
`);

    // The memo lands above the directive so the directive keeps pointing at the
    // hook rather than at the generated declaration (see findDeclarationAnchor).
    expect(output).toBe(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
const C = (items: any[]) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => {
    console.log(items);
  }, [itemsHash]);
};
`);
    expectNoUnboundHelpers(output);
  });

  it('does not duplicate imports the file already has', () => {
    const output = lint(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
const C = (items: any[], others: any[]) => {
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  useEffect(() => { console.log(others); }, [others.length]);
};
`);

    expect(output).toBe(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
const C = (items: any[], others: any[]) => {
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => { console.log(items); }, [items.length]);
  const othersHash = useMemo(() => stableHash(others), [others]);
  useEffect(() => { console.log(others); }, [othersHash]);
};
`);
    expectNoUnboundHelpers(output);
  });

  it('carries the imports past a block disable that re-enables later', () => {
    const output = lint(`import { useEffect } from 'react';
/* eslint-disable @blumintinc/blumint/no-array-length-in-deps */
const C = (items: any[]) => {
  useEffect(() => { console.log(items); }, [items.length]);
};
/* eslint-enable @blumintinc/blumint/no-array-length-in-deps */
const D = (others: any[]) => {
  useEffect(() => { console.log(others); }, [others.length]);
};
`);

    expect(output).toBe(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
/* eslint-disable @blumintinc/blumint/no-array-length-in-deps */
const C = (items: any[]) => {
  useEffect(() => { console.log(items); }, [items.length]);
};
/* eslint-enable @blumintinc/blumint/no-array-length-in-deps */
const D = (others: any[]) => {
  const othersHash = useMemo(() => stableHash(others), [others]);
  useEffect(() => { console.log(others); }, [othersHash]);
};
`);
    expectNoUnboundHelpers(output);
  });
});

// Issue #1425: RuleTester shows one fix pass, so it cannot prove that a
// declined edit stays declined under the multi-pass `eslint --fix` a developer
// actually runs. These cases run the real fixer and assert the file is left
// untouched — and that the violation is still reported — whenever `useMemo` or
// the hash helper is already bound to something else.
describe('no-array-length-in-deps: existing bindings of the injected names (issue #1425)', () => {
  const RULE_ID = '@blumintinc/blumint/no-array-length-in-deps';
  const HASH_IMPORT =
    "import { stableHash } from 'functions/src/util/hash/stableHash';";

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      noArrayLengthInDeps as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const CONFIG = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
      ecmaFeatures: { jsx: true },
    },
    rules: { [RULE_ID]: 'error' as const },
  };

  const fix = (code: string) =>
    makeLinter().verifyAndFix(code, CONFIG, 'Component.tsx').output;

  const reportCount = (code: string) =>
    makeLinter()
      .verify(code, CONFIG, 'Component.tsx')
      .filter((message) => message.ruleId === RULE_ID).length;

  /**
   * A collision is a duplicate declaration only if the name ends up declared
   * twice, so count the module-scope binders of the name rather than trusting
   * the rendered text.
   */
  const topScopeDeclarations = (code: string, name: string) => {
    const pattern = new RegExp(
      `^(?:import[^;]*\\b${name}\\b[^;]*;|(?:const|let|var|function|class)\\s+${name}\\b)`,
      'gm',
    );
    return (code.match(pattern) ?? []).length;
  };

  const CONTROL = `import { useEffect } from 'react';
const C = (items: any[]) => {
  useEffect(() => { console.log(items); }, [items.length]);
};
`;

  // Without this the collision cases below would prove nothing: they must
  // differ from an input the fixer genuinely rewrites.
  it('still applies the ordinary fix when neither name is bound', () => {
    expect(fix(CONTROL)).toBe(`${HASH_IMPORT}
import { useEffect, useMemo } from 'react';
const C = (items: any[]) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => { console.log(items); }, [itemsHash]);
};
`);
  });

  for (const name of ['stableHash', 'useMemo']) {
    it(`leaves the file untouched when \`${name}\` is a module-scope const`, () => {
      const code = `import { useEffect } from 'react';
const ${name} = undefined as unknown as never;
const C = (items: any[]) => {
  useEffect(() => { console.log(items); }, [items.length]);
};
`;

      expect(topScopeDeclarations(code, name)).toBe(1);
      const output = fix(code);
      expect(output).toBe(code);
      expect(topScopeDeclarations(output, name)).toBe(1);
      // The edit is withheld, not the diagnostic.
      expect(reportCount(output)).toBe(1);
    });

    it(`leaves the file untouched when \`${name}\` shadows at the fix site`, () => {
      const code = `import { useEffect } from 'react';
const C = (items: any[]) => {
  const render = (${name}: unknown) => {
    useEffect(() => { console.log(items); }, [items.length]);
    return ${name};
  };
  return render;
};
`;

      const output = fix(code);
      expect(output).toBe(code);
      expect(reportCount(output)).toBe(1);
    });
  }
});

// ------------------------------------------------------------------
// Issue #1648: a fix that writes brand-new imports must not displace the
// file's prologue. Each case is flush-left because a prologue's meaning
// depends on its position in the file. The final case is the control: an
// anchor disabled outright would also "preserve" every prologue above, so
// the imports must still land at the top of an existing import block.
// ------------------------------------------------------------------
ruleTesterJsx.run('no-array-length-in-deps', noArrayLengthInDeps, {
  valid: [],
  invalid: [
    {
      name: "the injected imports land below a 'use client' directive",
      code: `'use client';
const C = ({ items }) => {
  useEffect(() => {}, [items.length]);
  return null;
};
`,
      errors: [{ messageId: 'noArrayLengthInDeps' }],
      output: `'use client';
import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';
const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {}, [itemsHash]);
  return null;
};
`,
    },
    {
      name: 'the injected imports leave a shebang at character 0',
      code: `#!/usr/bin/env node
const C = ({ items }) => {
  useEffect(() => {}, [items.length]);
  return null;
};
`,
      errors: [{ messageId: 'noArrayLengthInDeps' }],
      output: `#!/usr/bin/env node
import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';
const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {}, [itemsHash]);
  return null;
};
`,
    },
    {
      name: 'the injected imports stay below a // @ts-nocheck header',
      code: `// @ts-nocheck
const C = ({ items }) => {
  useEffect(() => {}, [items.length]);
  return null;
};
`,
      errors: [{ messageId: 'noArrayLengthInDeps' }],
      output: `// @ts-nocheck
import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';
const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {}, [itemsHash]);
  return null;
};
`,
    },
    {
      name: "a 'use client' file with an existing import anchors on that import",
      code: `'use client';
import { x } from './x';
void x;
const C = ({ items }) => {
  useEffect(() => {}, [items.length]);
  return null;
};
`,
      errors: [{ messageId: 'noArrayLengthInDeps' }],
      output: `'use client';
import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';
import { x } from './x';
void x;
const C = ({ items }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  useEffect(() => {}, [itemsHash]);
  return null;
};
`,
    },
  ],
});

// ------------------------------------------------------------------
// Issue #1992: the memo declaration lands before the statement the climb from
// the hook reaches, so a guard that wraps the hook without a block of its own
// is left behind. The emitted `[<base>]` dependency array then dereferences
// the guarded value on every render, rewriting code that does not throw into
// code that does. Each escaping shape must report without fixing.
//
// The fixing cases below are the controls: they prove the bail is keyed on
// escaping a skippable position rather than on the mere presence of a
// conditional, so it cannot pass by disabling the fixer wholesale.
// ------------------------------------------------------------------
ruleTesterJsx.run('no-array-length-in-deps', noArrayLengthInDeps, {
  valid: [],
  invalid: [
    {
      name: 'declines when a braceless if guards the hook',
      code: `
const C = ({ data }) => {
  if (data) useEffect(() => { process(data.items); }, [data.items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'data.items.length' },
        },
      ],
      output: null,
    },
    {
      name: 'declines when a && short-circuit guards the hook',
      code: `
const C = ({ data }) => {
  data && useEffect(() => { process(data.items); }, [data.items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'data.items.length' },
        },
      ],
      output: null,
    },
    {
      name: 'declines when a ternary in a declarator guards the hook',
      code: `
const C = ({ data }) => {
  const v = data ? useMemo(() => data.items.join(''), [data.items.length]) : null;
  return v;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'data.items.length' },
        },
      ],
      output: null,
    },
    {
      // The braceless-switch-case bail above rejects a case-local `const` on
      // the scope question. A parameter-rooted path passes that question, so
      // only the skipped-branch check keeps the hoist out of the switch.
      name: 'declines when a braceless switch case guards the hook',
      code: `
const C = ({ state }) => {
  switch (state.status) {
    case 'loaded':
      useEffect(() => { process(state.data.items); }, [state.data.items.length]);
      break;
  }
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'state.data.items.length' },
        },
      ],
      output: null,
    },
    {
      name: 'declines when a typeof narrowing guards the hook',
      code: `
const C = ({ data }) => {
  if (typeof data === 'object' && data !== null) useEffect(() => { process(data.items); }, [data.items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'data.items.length' },
        },
      ],
      output: null,
    },
    {
      // A loop body runs zero times when its test never holds, so hoisting
      // above it adds a dereference the input never performs.
      name: 'declines when a braceless loop body holds the hook',
      code: `
const C = ({ data }) => {
  while (data) useEffect(() => { process(data.items); }, [data.items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'data.items.length' },
        },
      ],
      output: null,
    },
    {
      // An optional chain guards its arguments exactly as an `if` guards its
      // consequent: `data?.run(...)` evaluates neither when `data` is nullish.
      name: 'declines when an optional chain short-circuits around the hook',
      code: `
const C = ({ data }) => {
  data?.run(useMemo(() => data.items.join(''), [data.items.length]));
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'data.items.length' },
        },
      ],
      output: null,
    },
    {
      // Control: a braced guard gives the climb a statement position inside
      // the guarded block, so the memo stays under the narrowing and fixes.
      name: 'still fixes inside a braced if block',
      code: `
const C = ({ data }) => {
  if (data) {
    useEffect(() => { process(data.items); }, [data.items.length]);
  }
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'data.items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ data }) => {
  if (data) {
    const itemsHash = useMemo(() => stableHash(data.items), [data.items]);
    useEffect(() => { process(data.items); }, [itemsHash]);
  }
  return null;
};
`,
    },
    {
      // Control: an early return narrows the statements that follow it, and
      // the memo lands among them rather than above the guard.
      name: 'still fixes after an early return guard',
      code: `
const C = ({ data }) => {
  if (!data) return null;
  useEffect(() => { process(data.items); }, [data.items.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'data.items.length' },
        },
      ],
      output: `import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ data }) => {
  if (!data) return null;
  const itemsHash = useMemo(() => stableHash(data.items), [data.items]);
  useEffect(() => { process(data.items); }, [itemsHash]);
  return null;
};
`,
    },
    {
      // Control: an `if` test evaluates before the branch is chosen, so a hook
      // there is unconditional and the hoist preserves evaluation.
      name: 'still fixes a hook called in an if test',
      code: `
const C = ({ items }) => {
  if (useMemo(() => items.join(''), [items.length])) return null;
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
  if (useMemo(() => items.join(''), [itemsHash])) return null;
  return null;
};
`,
    },
    {
      // Control: the left operand of && is what decides the short-circuit, so
      // it always evaluates.
      name: 'still fixes a hook in the left operand of &&',
      code: `
const C = ({ items }) => {
  const v = useMemo(() => items.join(''), [items.length]) && 'x';
  return v;
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
  const v = useMemo(() => items.join(''), [itemsHash]) && 'x';
  return v;
};
`,
    },
    {
      // Control: a `do` body always runs once, so it is not a skippable
      // position and the loop arm must not claim it.
      name: 'still fixes a braceless do-while body',
      code: `
const C = ({ items }) => {
  do useEffect(() => { process(items); }, [items.length]); while (false);
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
  do useEffect(() => { process(items); }, [itemsHash]); while (false);
  return null;
};
`,
    },
  ],
});

// ------------------------------------------------------------------
// Issue #2049: the emitted declaration re-spells the base expression twice and
// derives the binding name from it, so its width grows with the input. Every
// `output` below is a verified Prettier fixed point at the case's own
// `printWidth`, and every layout was measured against the repo's own Prettier
// rather than reasoned about — Prettier COLLAPSES a hand-broken short call
// back onto one line, so the flat cases are the control an always-wrap remedy
// would break.
//
// Boundary, measured at a two-space indent: the flat statement is
// `41 + len(name) + 2 * len(base)` columns wide, and Prettier keeps it flat at
// exactly 80 and breaks the argument list at 81.
// ------------------------------------------------------------------
ruleTesterJsx.run('no-array-length-in-deps', noArrayLengthInDeps, {
  valid: [],
  invalid: [
    {
      // The wrap side of the boundary: a member-chain base makes the flat
      // statement 120 columns.
      name: 'breaks the argument list when the flat statement overflows',
      code: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

export const useRegistrations = (state) => {
  useEffect(() => {
    sync(state.tournament.registrations);
  }, [state.tournament.registrations.length]);
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'state.tournament.registrations.length' },
        },
      ],
      output: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

export const useRegistrations = (state) => {
  const registrationsHash = useMemo(
    () => stableHash(state.tournament.registrations),
    [state.tournament.registrations],
  );
  useEffect(() => {
    sync(state.tournament.registrations);
  }, [registrationsHash]);
};
`,
    },
    {
      // Collapse control, sitting exactly ON the width: an always-wrap remedy
      // emits four lines here and Prettier folds them straight back.
      name: 'keeps a declaration of exactly 80 columns on one line',
      code: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ attachments }) => {
  useEffect(() => {
    upload(attachments);
  }, [attachments.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'attachments.length' },
        },
      ],
      output: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ attachments }) => {
  const attachmentsHash = useMemo(() => stableHash(attachments), [attachments]);
  useEffect(() => {
    upload(attachments);
  }, [attachmentsHash]);
  return null;
};
`,
    },
    {
      // One column over the control above: the predicate is `> printWidth`.
      name: 'breaks a declaration of exactly 81 columns',
      code: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ s }) => {
  useEffect(() => {
    render(s.selections);
  }, [s.selections.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 's.selections.length' },
        },
      ],
      output: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ s }) => {
  const selectionsHash = useMemo(
    () => stableHash(s.selections),
    [s.selections],
  );
  useEffect(() => {
    render(s.selections);
  }, [selectionsHash]);
  return null;
};
`,
    },
    {
      // The width is measured per declaration, not per report.
      name: 'wraps only the declaration that overflows',
      code: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items, participants }) => {
  useEffect(() => {
    track(items, participants);
  }, [items.length, participants.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: { dependencies: 'items.length, participants.length' },
        },
      ],
      output: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items, participants }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  const participantsHash = useMemo(
    () => stableHash(participants),
    [participants],
  );
  useEffect(() => {
    track(items, participants);
  }, [itemsHash, participantsHash]);
  return null;
};
`,
    },
    {
      // Past the argument-list break Prettier's answer depends on which line
      // overflowed and the spellings compose, so the fixer declines instead of
      // authoring text `prettier --check` rejects. Reaching this needs a base
      // of ~58 characters or more at a two-space indent; here it is 62.
      name: 'declines when no layout it can author fits the width',
      code: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ settings }) => {
  useEffect(() => {
    invite(settings.notifications.emailDigest.pendingInvitationRecipients);
  }, [settings.notifications.emailDigest.pendingInvitationRecipients.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: {
            dependencies:
              'settings.notifications.emailDigest.pendingInvitationRecipients.length',
          },
        },
      ],
      output: null,
    },
  ],
});

// ------------------------------------------------------------------
// Issue #2049: the `printWidth` option is live in both directions — it moves
// the wrap boundary and it moves the point at which the fixer declines.
// ------------------------------------------------------------------
ruleTesterJsx.run('no-array-length-in-deps', noArrayLengthInDeps, {
  valid: [],
  invalid: [
    {
      name: 'a raised printWidth keeps an 83-column declaration on one line',
      options: [{ printWidth: 100 }],
      code: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

export const useThing = (participants) => {
  useEffect(() => {
    join(participants);
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
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

export const useThing = (participants) => {
  const participantsHash = useMemo(() => stableHash(participants), [participants]);
  useEffect(() => {
    join(participants);
  }, [participantsHash]);
};
`,
    },
    {
      name: 'a lowered printWidth breaks a declaration that fits at 80',
      options: [{ printWidth: 60 }],
      code: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ items }) => {
  useEffect(() => {
    track(items);
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

const C = ({ items }) => {
  const itemsHash = useMemo(
    () => stableHash(items),
    [items],
  );
  useEffect(() => {
    track(items);
  }, [itemsHash]);
  return null;
};
`,
    },
    {
      // Control for the decline above: the same base is fixable once the width
      // admits the broken argument list, so the decline is width-driven rather
      // than a shape this fixer cannot handle at all.
      name: 'a raised printWidth makes a declined base fixable again',
      options: [{ printWidth: 120 }],
      code: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ settings }) => {
  useEffect(() => {
    invite(settings.notifications.emailDigest.pendingInvitationRecipients);
  }, [settings.notifications.emailDigest.pendingInvitationRecipients.length]);
  return null;
};
`,
      errors: [
        {
          messageId: 'noArrayLengthInDeps',
          data: {
            dependencies:
              'settings.notifications.emailDigest.pendingInvitationRecipients.length',
          },
        },
      ],
      output: `
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const C = ({ settings }) => {
  const pendingInvitationRecipientsHash = useMemo(
    () => stableHash(settings.notifications.emailDigest.pendingInvitationRecipients),
    [settings.notifications.emailDigest.pendingInvitationRecipients],
  );
  useEffect(() => {
    invite(settings.notifications.emailDigest.pendingInvitationRecipients);
  }, [pendingInvitationRecipientsHash]);
  return null;
};
`,
    },
  ],
});
