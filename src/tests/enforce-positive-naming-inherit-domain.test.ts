// src/tests/enforce-positive-naming-inherit-domain.test.ts
// Fails today (rule flags these as negative naming); must pass after the fix.
// Mirrors the enforce-positive-naming-ingest-domain.test.ts shape.
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run(
  'enforce-positive-naming-inherit-domain',
  enforcePositiveNaming,
  {
    valid: [
      {
        // The reported FP: "inherit" = a positive verb, not in- + herit.
        code: `const shouldInheritTiming = true;`,
      },
      {
        // Whole inherit family — same mis-parse (in + herit*).
        // Note inherited/inheritance already pass; the base verb forms do not.
        code: `
        const shouldInherit = true;
        const shouldInherits = true;
        const shouldInheriting = true;
        const doesInheritStyles = false;
        const isInheritTiming = true;
        const hasInheritTiming = true;
        const canInheritTiming = true;
        const willInheritTiming = true;
      `,
      },
      {
        // Same enumeration gap, other in-initial verbs measured at 1.20.156.
        code: `
        const shouldIncrementScore = true;
        const shouldIntegrateFeed = true;
        const shouldInstantiateClient = true;
        const shouldInlineStyles = true;
      `,
      },
    ],
    invalid: [],
  },
);
