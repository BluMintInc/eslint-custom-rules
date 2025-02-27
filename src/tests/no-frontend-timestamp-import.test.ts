import { ruleTesterTs } from '../utils/ruleTester';
import { noFrontendTimestampImport } from '../rules/no-frontend-timestamp-import';

// Mock file paths for testing
const frontendFilePath = 'src/components/SomeComponent.tsx';
const frontendUtilFilePath = 'src/utils/dateHelpers.ts';
const backendFilePath = 'functions/src/some/path/file.ts';
const frontendTestFilePath = 'src/components/SomeComponent.test.tsx';

ruleTesterTs.run('no-frontend-timestamp-import', noFrontendTimestampImport, {
  valid: [
    // Valid: No Timestamp import in frontend
    {
      code: `
        import { doc, getDoc } from 'firebase/firestore';
        const timestamp = new Date();
      `,
      filename: frontendFilePath,
    },
    // Valid: Type-only import of Timestamp in frontend
    {
      code: `
        import type { Timestamp } from 'firebase-admin/firestore';

        interface Document {
          createdAt: Timestamp;
        }

        const getFormattedDate = (date: Date) => {
          return date.toLocaleDateString();
        };
      `,
      filename: frontendFilePath,
    },
    // Valid: Timestamp import in backend code
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Valid: Timestamp import in backend code with alias
    {
      code: `
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        const timestamp = FirestoreTimestamp.now();
      `,
      filename: backendFilePath,
    },
    // Valid: Dynamic import in backend code
    {
      code: `
        const { Timestamp } = await import('firebase-admin/firestore');
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Valid: Test files are exempt
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const mockTimestamp = Timestamp.fromDate(new Date('2023-01-01'));
      `,
      filename: frontendTestFilePath,
    },
  ],
  invalid: [
    // Invalid: Timestamp import in frontend
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      errors: [{ messageId: 'noFrontendTimestampImport' }],
      output: `

        const timestamp = new Date();
      `,
      filename: frontendFilePath,
    },
    // Invalid: Timestamp import with alias in frontend
    {
      code: `
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      errors: [{ messageId: 'noFrontendTimestampImport' }],
      output: `

        const timestamp = new Date();
      `,
      filename: frontendFilePath,
    },
    // Invalid: Timestamp import with other imports
    {
      code: `
        import { Timestamp, FieldValue } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      errors: [{ messageId: 'noFrontendTimestampImport' }],
      output: `
        import { FieldValue } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      filename: frontendFilePath,
    },
    // Invalid: Timestamp import first in list
    {
      code: `
        import { Timestamp, FieldValue, DocumentReference } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      errors: [{ messageId: 'noFrontendTimestampImport' }],
      output: `
        import { FieldValue, DocumentReference } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      filename: frontendFilePath,
    },
    // Invalid: Timestamp import in middle of list
    {
      code: `
        import { FieldValue, Timestamp, DocumentReference } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      errors: [{ messageId: 'noFrontendTimestampImport' }],
      output: `
        import { FieldValue, DocumentReference } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      filename: frontendFilePath,
    },
    // Invalid: Timestamp import at end of list
    {
      code: `
        import { FieldValue, DocumentReference, Timestamp } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      errors: [{ messageId: 'noFrontendTimestampImport' }],
      output: `
        import { FieldValue, DocumentReference } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      filename: frontendFilePath,
    },
    // Invalid: Dynamic import in frontend
    {
      code: `
        const { Timestamp } = await import('firebase-admin/firestore');
        const timestamp = Timestamp.now();
      `,
      errors: [{ messageId: 'noFrontendTimestampImport' }],
      filename: frontendUtilFilePath,
    },
    // Invalid: Dynamic import with other imports
    {
      code: `
        const { FieldValue, Timestamp } = await import('firebase-admin/firestore');
        const timestamp = Timestamp.now();
      `,
      errors: [{ messageId: 'noFrontendTimestampImport' }],
      filename: frontendUtilFilePath,
    },
  ],
});
