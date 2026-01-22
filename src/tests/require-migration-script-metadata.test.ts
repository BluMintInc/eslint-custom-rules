import { ruleTesterTs } from '../utils/ruleTester';
import { requireMigrationScriptMetadata } from '../rules/require-migration-script-metadata';

const filename = 'functions/src/callable/scripts/testScript.f.ts';
const absolutePath = '/home/user/project/functions/src/callable/scripts/testScript.f.ts';

ruleTesterTs.run(
  'require-migration-script-metadata',
  requireMigrationScriptMetadata,
  {
    valid: [
      {
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies NONE
 * @migrationDescription Backfill team priority field
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
      },
      {
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies NONE
 * @migrationDescription Absolute path test
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename: absolutePath,
      },
      {
        code: `
/**
 * @migration false
 */
export default () => null;
      `,
        filename,
      },
      {
        code: `
/* eslint-disable */
/**
 * Legacy callable script
 */
/**
 * @migration true
 * @migrationPhase before
 * @migrationDependencies NONE
 * @migrationDescription Prepare data
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        options: [{ allowLegacyHeader: true }],
      },
      {
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies scriptA, scriptB
 * @migrationDescription Description
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
      },
      {
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies  scriptA ,  scriptB  
 * @migrationDescription Trim whitespace
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
      },
      {
        code: `
// File outside of targetGlobs
const x = 1;
      `,
        filename: 'src/otherFile.ts',
      },
      {
        code: `
/**
 * @migration true
 * @migrationPhase before
 * @migrationDependencies NONE
 * @migrationDescription Nested directory test
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename: 'functions/src/callable/scripts/nested/dir/script.f.ts',
      },
      {
        code: `
/**
 * Some other description
 */
/**
 * @migration true
 * @migrationPhase before
 * @migrationDependencies NONE
 * @migrationDescription Multiple blocks, only one with @migration
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        options: [{ allowLegacyHeader: true }],
      },
      {
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies script1, script2, script3
 * @migrationDescription Multiple dependencies
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
      },
      {
        // Legacy single-line comment is NOT treated as a legacy header, so this is valid even if allowLegacyHeader is false
        code: `
// Legacy comment
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies NONE
 * @migrationDescription Block
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        options: [{ allowLegacyHeader: false }],
      },
    ],
    invalid: [
      {
        // Missing metadata block
        code: `
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'missingMetadata' }],
      },
      {
        // Metadata after import
        code: `
import { onCallVaripotent } from '../../v2/https/onCall';

/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies NONE
 * @migrationDescription Misplaced metadata
 */
      `,
        filename,
        errors: [{ messageId: 'metadataAfterStatement' }],
      },
      {
        // Missing @migration tag
        code: `
/**
 * @migrationPhase after
 * @migrationDependencies NONE
 * @migrationDescription Missing migration tag
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'missingMigrationTag' }],
      },
      {
        // Invalid @migration tag
        code: `
/**
 * @migration maybe
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'invalidMigrationTag' }],
      },
      {
        // Missing phase when @migration true
        code: `
/**
 * @migration true
 * @migrationDependencies NONE
 * @migrationDescription Missing phase
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'missingPhaseTag' }],
      },
      {
        // Invalid phase
        code: `
/**
 * @migration true
 * @migrationPhase during
 * @migrationDependencies NONE
 * @migrationDescription Invalid phase
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'invalidPhaseTag' }],
      },
      {
        // Missing dependencies when @migration true
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDescription Missing dependencies
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'missingDependenciesTag' }],
      },
      {
        // Empty dependency entry
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies scriptA,,scriptB
 * @migrationDescription Empty dependency
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'invalidDependenciesTag' }],
      },
      {
        // Dependency with .f.ts extension
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies scriptA.f.ts
 * @migrationDescription Extension error
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [
          {
            messageId: 'extensionInDependencies',
            data: { name: 'scriptA.f.ts' },
          },
        ],
      },
      {
        // Missing description when @migration true
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies NONE
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'missingDescriptionTag' }],
      },
      {
        // Metadata in non-JSDoc comment
        code: `
// @migration true
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'missingMetadata' }],
      },
      {
        // Empty file
        code: ``,
        filename,
        errors: [{ messageId: 'missingMetadata' }],
      },
      {
        // Dependencies with only comma
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies ,
 * @migrationDescription Empty dependency
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'invalidDependenciesTag' }],
      },
      {
        // Multiple migration blocks
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies NONE
 * @migrationDescription Block 1
 */
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies NONE
 * @migrationDescription Block 2
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'multipleMetadataBlocks' }],
      },
      {
        // Legacy header not allowed
        code: `
/**
 * Legacy header
 */
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies NONE
 * @migrationDescription Block
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        options: [{ allowLegacyHeader: false }],
        errors: [{ messageId: 'legacyHeaderNotAllowed' }],
      },
      {
        // @migration with no value
        code: `
/**
 * @migration 
 * @migrationPhase after
 * @migrationDependencies NONE
 * @migrationDescription No value
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'invalidMigrationTag' }],
      },
      {
        // @migration missing but @migrationDescription present
        code: `
/**
 * @migrationDescription only desc
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'missingMigrationTag' }],
      },
      {
        // Mixing NONE with other dependencies
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies NONE, scriptA
 * @migrationDescription Mixed NONE
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'invalidDependenciesTag' }],
      },
      {
        // Wrong casing for NONE
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies none
 * @migrationDescription Casing error
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'noneCasing' }],
      },
      {
        // Mixed none with wrong casing
        code: `
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies none, scriptA
 * @migrationDescription Mixed none casing
 */
import { onCallVaripotent } from '../../v2/https/onCall';
      `,
        filename,
        errors: [{ messageId: 'invalidDependenciesTag' }],
      },
    ],
  },
);
