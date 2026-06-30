import { ruleTesterTs } from '../utils/ruleTester';
import { requireServerTimestampForFirestoreDates } from '../rules/require-server-timestamp-for-firestore-dates';

ruleTesterTs.run(
  'require-server-timestamp-for-firestore-dates',
  requireServerTimestampForFirestoreDates,
  {
    valid: [
      // new Date() in a NON-Firestore-typed object (no Firestore import)
      {
        code: `
const obj = { createdAt: new Date() };
`,
        filename: 'src/hooks/useExample.ts',
      },
      // Firestore-typed object using serverTimestamp() — should NOT fire
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const x: TokenMetadata<'offchain', Date> = {
  id: 'offchain:abc',
  createdAt: serverTimestamp(),
};
`,
        filename: 'src/hooks/useExample.ts',
      },
      // Plain const d = new Date() not inside a Firestore-typed object
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const d = new Date();
const x: TokenMetadata<'offchain', Date> = {
  id: 'offchain:abc',
  createdAt: serverTimestamp(),
};
`,
        filename: 'src/hooks/useExample.ts',
      },
      // Firestore-typed object with no date fields at all
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const x: TokenMetadata<'offchain', Date> = {
  id: 'offchain:abc',
  name: 'My Token',
};
`,
        filename: 'src/hooks/useExample.ts',
      },
      // Import from a NON-firestore path — new Date() should not be flagged
      {
        code: `
import type { TokenMetadata } from 'src/types/TokenMetadata';
const x: TokenMetadata = { createdAt: new Date() };
`,
        filename: 'src/hooks/useExample.ts',
      },
      // Object literal with no type annotation at all — should not flag
      {
        code: `
const obj = { createdAt: new Date(), name: 'hello' };
`,
        filename: 'src/utils/helper.ts',
      },
      // test file — should be ignored by default (ignoreTestFiles: true)
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const mock: TokenMetadata<'offchain', Date> = { createdAt: new Date() };
`,
        filename: 'src/components/Token.test.ts',
      },
      // spec file — also ignored
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const mock: TokenMetadata<'offchain', Date> = { createdAt: new Date() };
`,
        filename: 'src/components/Token.spec.tsx',
      },
      // File outside targetPaths (functions/ backend) — not flagged
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const x: TokenMetadata<'offchain', Date> = { createdAt: new Date() };
`,
        filename: 'functions/src/handlers/createToken.ts',
        options: [{ targetPaths: ['src/**'] }],
      },
      // serverTimestamp() used in nested object
      {
        code: `
import type { Tournament } from 'functions/src/types/firestore/Tournament';
const t: Tournament = {
  title: 'Championship',
  schedule: {
    startDate: serverTimestamp(),
    endDate: serverTimestamp(),
  },
};
`,
        filename: 'src/hooks/useTournament.ts',
      },
      // Relative Firestore import but using serverTimestamp()
      {
        code: `
import type { Advancement } from '../../functions/src/types/firestore/Progression';
const a: Advancement<Date> = {
  id: 'temp-1',
  createdAt: serverTimestamp(),
};
`,
        filename: 'src/contexts/ProgressionContext.ts',
      },
      // Custom firestoreTypePaths that does NOT match the import — should pass
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const x: TokenMetadata<'offchain', Date> = { createdAt: new Date() };
`,
        filename: 'src/hooks/useExample.ts',
        options: [{ firestoreTypePaths: ['custom/types/firestore/**'] }],
      },
      // Firestore type import but new Date() is used in a separate non-typed variable
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const timestamp = new Date();
const x: TokenMetadata<'offchain', Date> = {
  id: 'abc',
  createdAt: serverTimestamp(),
};
`,
        filename: 'src/hooks/useExample.ts',
      },
    ],

    invalid: [
      // Basic: typed variable with new Date() as property value
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const x: TokenMetadata<'offchain', Date> = {
  id: 'offchain:abc',
  createdAt: new Date(),
};
`,
        filename: 'src/hooks/useExample.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // new Date() wrapped with `as any` cast
      {
        code: `
import type { Advancement } from 'functions/src/types/firestore/Progression';
const newAdvancement: Advancement<Date> = {
  id: 'temp',
  createdAt: new Date() as any,
};
`,
        filename: 'src/contexts/ProgressionContext.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // Aliased import: import type { Advancement as AdvancementType }
      {
        code: `
import type { Advancement as AdvancementType } from 'functions/src/types/firestore/Progression';
const a: AdvancementType<Date> = {
  id: '1',
  createdAt: new Date(),
};
`,
        filename: 'src/contexts/ProgressionContext.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // Relative import path for Firestore type
      {
        code: `
import type { TokenMetadata } from '../../functions/src/types/firestore/TokenMetadata';
const x: TokenMetadata<'offchain', Date> = {
  id: 'offchain:abc',
  createdAt: new Date(),
};
`,
        filename: 'src/hooks/useExample.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // Object cast with `as FirestoreType`
      {
        code: `
import type { Advancement } from 'functions/src/types/firestore/Progression';
const a = {
  id: '1',
  createdAt: new Date(),
} as Advancement<Date>;
`,
        filename: 'src/contexts/ProgressionContext.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // Multiple date fields — multiple errors
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const x: TokenMetadata<'offchain', Date> = {
  id: 'offchain:abc',
  createdAt: new Date(),
  updatedAt: new Date(),
};
`,
        filename: 'src/hooks/useExample.ts',
        errors: [
          { messageId: 'useServerTimestamp' },
          { messageId: 'useServerTimestamp' },
        ],
      },
      // Nested object with new Date()
      {
        code: `
import type { Tournament } from 'functions/src/types/firestore/Tournament';
const t: Tournament = {
  title: 'Championship',
  schedule: {
    startDate: new Date(),
  },
};
`,
        filename: 'src/hooks/useTournament.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // new Date() wrapped with `as Timestamp` cast
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const x: TokenMetadata<'offchain', Date> = {
  id: 'abc',
  createdAt: new Date() as Timestamp,
};
`,
        filename: 'src/hooks/useExample.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // Function return typed as Firestore type
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
function buildToken(): TokenMetadata<'offchain', Date> {
  return {
    id: 'abc',
    createdAt: new Date(),
  };
}
`,
        filename: 'src/hooks/useExample.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // Arrow function return typed as Firestore type
      {
        code: `
import type { Advancement } from 'functions/src/types/firestore/Progression';
const buildAdvancement = (): Advancement<Date> => ({
  id: '1',
  createdAt: new Date(),
});
`,
        filename: 'src/contexts/ProgressionContext.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // Deep nesting: new Date() at depth > 1
      {
        code: `
import type { Tournament } from 'functions/src/types/firestore/Tournament';
const t: Tournament = {
  title: 'Championship',
  schedule: {
    rounds: {
      checkIn: new Date(),
    },
  },
};
`,
        filename: 'src/hooks/useTournament.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // new Date() with arguments (e.g. new Date('2024-01-01'))
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const x: TokenMetadata<'offchain', Date> = {
  id: 'abc',
  createdAt: new Date('2024-01-01'),
};
`,
        filename: 'src/hooks/useExample.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // Conditional (ternary) with new Date() in one branch inside Firestore-typed object
      {
        code: `
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const isOnline = true;
const x: TokenMetadata<'offchain', Date> = {
  id: 'abc',
  createdAt: isOnline ? serverTimestamp() : new Date(),
};
`,
        filename: 'src/hooks/useExample.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // Multiple Firestore type imports from same path
      {
        code: `
import type { TokenMetadata, TokenDraft } from 'functions/src/types/firestore/TokenMetadata';
const x: TokenDraft = {
  id: 'abc',
  createdAt: new Date(),
};
`,
        filename: 'src/hooks/useExample.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
      // Both nested and top-level — two errors
      {
        code: `
import type { Tournament } from 'functions/src/types/firestore/Tournament';
const t: Tournament = {
  title: 'Championship',
  createdAt: new Date(),
  schedule: {
    startDate: new Date(),
  },
};
`,
        filename: 'src/hooks/useTournament.ts',
        errors: [
          { messageId: 'useServerTimestamp' },
          { messageId: 'useServerTimestamp' },
        ],
      },
      // import (non-type) keyword — still detected
      {
        code: `
import { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
const x: TokenMetadata<'offchain', Date> = {
  id: 'abc',
  createdAt: new Date(),
};
`,
        filename: 'src/hooks/useExample.ts',
        errors: [{ messageId: 'useServerTimestamp' }],
      },
    ],
  },
);
