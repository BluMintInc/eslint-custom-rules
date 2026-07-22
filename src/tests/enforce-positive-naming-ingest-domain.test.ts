// src/tests/enforce-positive-naming-ingest-domain.test.ts
// Fails today (rule flags these as negative naming); must pass after the fix.
// Mirrors the enforce-positive-naming-dispute-domain.test.ts / -disabled-domain shape.
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run(
  'enforce-positive-naming-ingest-domain',
  enforcePositiveNaming,
  {
    valid: [
      {
        // The reported FP: "ingestible" = ingest + -ible, not in- + gestible.
        code: `
        export function isIngestibleSurface(id: string) {
          return id.length > 0;
        }
      `,
        filename: 'scripts/slack/search-mentions.ts',
      },
      {
        // Whole ingest family — same mis-parse (in + gest*).
        code: `
        const canIngest = true;
        const hasIngestPipeline = true;
        const isIngesting = false;
        const hasIngestedData = true;
      `,
      },
    ],
    invalid: [],
  },
);
