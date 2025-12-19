import { enforcePositiveNaming } from '../rules/enforce-positive-naming';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run(
  'enforce-positive-naming-dispute-domain',
  enforcePositiveNaming,
  {
    valid: [
      {
        // Reproduces the reported false positive in tournament moderation
        code: `
        export class DisputeDetector implements MessageGeneratorTeam {
          constructor(private readonly match: Match) {}
          public get forTeam() {
            const isDispute = this.winnersCount > this.maxWinners;
            if (!isDispute) {
              return;
            }
            return this.winnersCount;
          }
        }
      `,
        filename:
          'functions/src/util/tournaments/moderation/DisputeDetector.ts',
      },
      {
        code: `
        const hasDispute = true;
        const isDisputed = false;
      `,
        filename:
          'functions/src/util/tournaments/moderation/DisputeDetector.ts',
      },
    ],
    invalid: [
      // Guardrail: real negatives with "dis" stay flagged
      {
        code: `
        const isDisallowed = true;
      `,
        filename:
          'functions/src/util/tournaments/moderation/DisputeDetector.ts',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
    ],
  },
);
