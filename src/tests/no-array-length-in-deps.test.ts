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
  ],
});
