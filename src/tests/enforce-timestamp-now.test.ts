import { ruleTesterTs } from '../utils/ruleTester';
import { enforceTimestampNow } from '../rules/enforce-timestamp-now';

// Mock the context.getFilename() to simulate backend files
const backendFilePath = 'functions/src/some/path/file.ts';
const frontendFilePath = 'src/components/SomeComponent.tsx';
const backendTestFilePath = 'functions/src/some/path/file.test.ts';

ruleTesterTs.run('enforce-timestamp-now', enforceTimestampNow, {
  valid: [
    // Valid usage of Timestamp.now() in backend
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Valid usage with aliased import
    {
      code: `
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        const timestamp = FirestoreTimestamp.now();
      `,
      filename: backendFilePath,
    },
    // Valid usage with dynamic import
    {
      code: `
        const { Timestamp } = await import('firebase-admin/firestore');
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Valid usage in frontend (rule should not apply)
    {
      code: `
        import { Timestamp } from 'firebase/firestore';
        const timestamp = Timestamp.fromDate(new Date());
      `,
      filename: frontendFilePath,
    },
    // Valid usage in frontend with Date.now()
    {
      code: `
        import { Timestamp } from 'firebase/firestore';
        const timestamp = Timestamp.fromMillis(Date.now());
      `,
      filename: frontendFilePath,
    },
    // Valid usage in frontend with new Date()
    {
      code: `
        const now = new Date();
        const formattedDate = now.toLocaleDateString();
      `,
      filename: frontendFilePath,
    },
    // Valid usage in backend test files (rule should not apply)
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const mockTimestamp = Timestamp.fromDate(new Date('2023-01-01'));
      `,
      filename: backendTestFilePath,
    },
    // Valid usage with custom date calculation
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        const futureTimestamp = Timestamp.fromDate(futureDate);
      `,
      filename: backendFilePath,
    },
    // Valid usage with explicit date string
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const specificTimestamp = Timestamp.fromDate(new Date('2023-01-01'));
      `,
      filename: backendFilePath,
    },
  ],
  invalid: [
    // Invalid usage of Timestamp.fromDate(new Date()) in backend
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.fromDate(new Date());
      `,
      errors: [{ messageId: 'preferTimestampNow' }],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with aliased import
    {
      code: `
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        const timestamp = FirestoreTimestamp.fromDate(new Date());
      `,
      errors: [{ messageId: 'preferTimestampNow' }],
      output: `
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        const timestamp = FirestoreTimestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with Timestamp.fromMillis(Date.now())
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.fromMillis(Date.now());
      `,
      errors: [{ messageId: 'preferTimestampNow' }],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with direct new Date() assignment
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      errors: [{ messageId: 'preferTimestampNow' }],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with createdAt naming
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const createdAt = new Date();
      `,
      errors: [{ messageId: 'preferTimestampNow' }],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        const createdAt = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with updatedAt naming
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const updatedAt = new Date();
      `,
      errors: [{ messageId: 'preferTimestampNow' }],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        const updatedAt = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with dynamic import
    {
      code: `
        const { Timestamp } = await import('firebase-admin/firestore');
        const timestamp = Timestamp.fromDate(new Date());
      `,
      errors: [{ messageId: 'preferTimestampNow' }],
      output: `
        const { Timestamp } = await import('firebase-admin/firestore');
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
  ],
});
