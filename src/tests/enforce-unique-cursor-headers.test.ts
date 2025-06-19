import { ruleTesterTs } from '../utils/ruleTester';
import { enforceUniqueCursorHeaders } from '../rules/enforce-unique-cursor-headers';

ruleTesterTs.run('enforce-unique-cursor-headers', enforceUniqueCursorHeaders, {
  valid: [
    // Valid: Single proper cursor header
    {
      code: `/**
 * @fileoverview User authentication utilities
 * @author BluMint Team
 */

import { HttpsError } from '../errors/HttpsError';

export const validateUser = (userId: string) => {
  // implementation
};`,
      filename: 'src/auth/utils.ts',
    },

    // Valid: Single-line comment format
    {
      code: `// @fileoverview User utilities
// @author BluMint Team

import { utils } from './utils';

export const helper = () => {};`,
      filename: 'src/utils/helper.ts',
    },

    // Valid: Multi-line comment format
    {
      code: `/*
 * @fileoverview User utilities
 * @author BluMint Team
 */

import { something } from 'somewhere';

export const func = () => {};`,
      filename: 'src/components/Component.tsx',
    },

    // Valid: File with no header when requireHeader is false
    {
      code: `import { HttpsError } from '../errors/HttpsError';

export const validateUser = (userId: string) => {
  // implementation
};`,
      filename: 'src/auth/utils.ts',
      options: [{ requireHeader: false }],
    },

    // Valid: Generated file should be excluded
    {
      code: `// This file is auto-generated
export const generatedFunction = () => {};`,
      filename: 'src/generated/file.generated.ts',
    },

    // Valid: .d.ts file should be excluded
    {
      code: `export interface User {
  id: string;
}`,
      filename: 'src/types/user.d.ts',
    },

    // Valid: Multiple blocks when allowed
    {
      code: `/**
 * @fileoverview Main utilities
 */
/**
 * @author BluMint Team
 * @since 2024-01-15
 */

import { utils } from './utils';`,
      filename: 'src/utils/main.ts',
      options: [{ allowMultipleBlocks: true }],
    },

    // Valid: Comments that are not cursor headers
    {
      code: `// Copyright 2024 BluMint
/**
 * @fileoverview User utilities
 * @author BluMint Team
 */

import { something } from 'somewhere';`,
      filename: 'src/utils/user.ts',
    },

    // Valid: Header with only required fields
    {
      code: `/**
 * @fileoverview Simple utility functions
 */

export const simpleFunc = () => {};`,
      filename: 'src/simple.ts',
      options: [{ requiredFields: ['@fileoverview'] }],
    },

    // Valid: Header with custom required fields
    {
      code: `/**
 * @fileoverview Custom utilities
 * @module CustomModule
 */

export const customFunc = () => {};`,
      filename: 'src/custom.ts',
      options: [{ requiredFields: ['@fileoverview', '@module'] }],
    },

    // Valid: File pattern doesn't match
    {
      code: `export const func = () => {};`,
      filename: 'config/webpack.config.js',
      options: [{ filePatterns: ['src/**/*.ts', 'src/**/*.tsx'] }],
    },

    // Valid: Non-cursor header comments in middle of file
    {
      code: `/**
 * @fileoverview Main utilities
 */

import { utils } from './utils';

/**
 * @section Helper functions
 * This is not a cursor header since it's after imports
 */
export const helper = () => {};`,
      filename: 'src/utils/main.ts',
    },

    // Valid: Different comment types that aren't cursor headers
    {
      code: `/**
 * @fileoverview User utilities
 */

// Regular comment
/* Another comment */
import { utils } from './utils';`,
      filename: 'src/utils/user.ts',
    },

    // Valid: Empty file
    {
      code: ``,
      filename: 'src/empty.ts',
      options: [{ requireHeader: false }],
    },

    // Valid: File with only comments (no code)
    {
      code: `/**
 * @fileoverview Configuration constants
 */

// This file only contains constants`,
      filename: 'src/constants.ts',
    },

    // Valid: Header with additional metadata
    {
      code: `/**
 * @fileoverview Advanced user authentication utilities
 * @author BluMint Team
 * @since 2024-01-01
 * @version 1.0.0
 */

export const advancedAuth = () => {};`,
      filename: 'src/auth/advanced.ts',
    },

    // Valid: Minimal header meeting requirements
    {
      code: `/** @fileoverview Basic utils */

export const basic = () => {};`,
      filename: 'src/basic.ts',
    },

    // Valid: Header with description field
    {
      code: `/**
 * @description Utility functions for data processing
 * @fileoverview Data utilities
 */

export const processData = () => {};`,
      filename: 'src/data.ts',
    },

    // Valid: Node modules should be excluded
    {
      code: `export const nodeModule = () => {};`,
      filename: 'node_modules/some-package/index.js',
    },

    // Valid: Minified files should be excluded
    {
      code: `export const minified=()=>{};`,
      filename: 'dist/bundle.min.js',
    },
  ],

  invalid: [
    // Invalid: Exact duplicate headers
    {
      code: `/**
 * @fileoverview User authentication utilities
 * @author BluMint Team
 */

/**
 * @fileoverview User authentication utilities
 * @author BluMint Team
 */

export const validateUser = (userId: string) => {
  // implementation
};`,
      filename: 'src/auth/utils.ts',
      errors: [{ messageId: 'duplicateHeader' }],
      output: `/**
 * @fileoverview User authentication utilities
 * @author BluMint Team
 */


export const validateUser = (userId: string) => {
  // implementation
};`,
    },

    // Invalid: Missing header when required
    {
      code: `import { HttpsError } from '../errors/HttpsError';

export const validateUser = (userId: string) => {
  // implementation
};`,
      filename: 'src/auth/utils.ts',
      errors: [{ messageId: 'missingHeader' }],
      output: `/**
 * @fileoverview TODO: Add file description
 */

import { HttpsError } from '../errors/HttpsError';

export const validateUser = (userId: string) => {
  // implementation
};`,
    },

    // Invalid: Duplicate @fileoverview content
    {
      code: `/**
 * @fileoverview User utilities
 * @author BluMint Team
 */

/**
 * @fileoverview User utilities
 * @version 1.0.0
 */

export const func = () => {};`,
      filename: 'src/utils.ts',
      errors: [{ messageId: 'duplicateHeader' }],
      output: `/**
 * @fileoverview User utilities
 * @author BluMint Team
 */


export const func = () => {};`,
    },

    // Invalid: Multiple headers when not allowed
    {
      code: `/**
 * @fileoverview Main utilities
 */
/**
 * @author BluMint Team
 */

export const func = () => {};`,
      filename: 'src/main.ts',
      errors: [{ messageId: 'duplicateHeader' }],
      output: `/**
 * @fileoverview Main utilities
 */

export const func = () => {};`,
    },

    // Invalid: Different comment formats but same content
    {
      code: `/**
 * @fileoverview User utilities
 */

/*
 * @fileoverview User utilities
 */

export const func = () => {};`,
      filename: 'src/utils.ts',
      errors: [{ messageId: 'duplicateHeader' }],
      output: `/**
 * @fileoverview User utilities
 */


export const func = () => {};`,
    },

    // Invalid: Missing required custom fields
    {
      code: `/**
 * @fileoverview Custom utilities
 */

export const customFunc = () => {};`,
      filename: 'src/custom.ts',
      options: [{ requiredFields: ['@fileoverview', '@author'] }],
      errors: [{ messageId: 'missingHeader' }],
      output: `/**
 * @fileoverview TODO: Add file description
 * @author BluMint Team
 */

/**
 * @fileoverview Custom utilities
 */

export const customFunc = () => {};`,
    },

    // Invalid: Three duplicate headers
    {
      code: `/**
 * @fileoverview Utils
 */

/**
 * @fileoverview Utils
 */

/**
 * @fileoverview Utils
 */

export const func = () => {};`,
      filename: 'src/utils.ts',
      errors: [
        { messageId: 'duplicateHeader' },
        { messageId: 'duplicateHeader' },
      ],
      output: `/**
 * @fileoverview Utils
 */



export const func = () => {};`,
    },

    // Invalid: Single-line duplicate headers
    {
      code: `// @fileoverview User utilities
// @author BluMint Team

// @fileoverview User utilities
// @author BluMint Team

export const func = () => {};`,
      filename: 'src/utils.ts',
      errors: [
        { messageId: 'duplicateHeader' },
        { messageId: 'duplicateHeader' },
      ],
      output: `// @fileoverview User utilities
// @author BluMint Team

// @author BluMint Team

export const func = () => {};`,
    },

    // Invalid: Mixed format duplicates
    {
      code: `/** @fileoverview Utils */

// @fileoverview Utils

export const func = () => {};`,
      filename: 'src/utils.ts',
      errors: [{ messageId: 'duplicateHeader' }],
      output: `/** @fileoverview Utils */


export const func = () => {};`,
    },

    // Invalid: Empty file missing header
    {
      code: ``,
      filename: 'src/empty.ts',
      errors: [{ messageId: 'missingHeader' }],
      output: `/**
 * @fileoverview TODO: Add file description
 */

`,
    },

    // Invalid: File with only non-cursor comments
    {
      code: `// Regular comment
/* Another comment */

export const func = () => {};`,
      filename: 'src/utils.ts',
      errors: [{ messageId: 'missingHeader' }],
      output: `/**
 * @fileoverview TODO: Add file description
 */

// Regular comment
/* Another comment */

export const func = () => {};`,
    },

    // Invalid: Header missing required @author field
    {
      code: `/**
 * @fileoverview User utilities
 */

export const func = () => {};`,
      filename: 'src/utils.ts',
      options: [{ requiredFields: ['@fileoverview', '@author'] }],
      errors: [{ messageId: 'missingHeader' }],
      output: `/**
 * @fileoverview TODO: Add file description
 * @author BluMint Team
 */

/**
 * @fileoverview User utilities
 */

export const func = () => {};`,
    },

    // Invalid: Duplicate with extra whitespace
    {
      code: `/**
 * @fileoverview User utilities
 * @author BluMint Team
 */

/**
 *   @fileoverview User utilities
 *   @author BluMint Team
 */

export const func = () => {};`,
      filename: 'src/utils.ts',
      errors: [{ messageId: 'duplicateHeader' }],
      output: `/**
 * @fileoverview User utilities
 * @author BluMint Team
 */


export const func = () => {};`,
    },

    // Invalid: Partial duplicate (same @fileoverview)
    {
      code: `/**
 * @fileoverview Data processing utilities
 * @author BluMint Team
 */

/**
 * @fileoverview Data processing utilities
 * @since 2024-01-01
 */

export const func = () => {};`,
      filename: 'src/data.ts',
      errors: [{ messageId: 'duplicateHeader' }],
      output: `/**
 * @fileoverview Data processing utilities
 * @author BluMint Team
 */


export const func = () => {};`,
    },

    // Invalid: Header after imports (should still require header at top)
    {
      code: `import { utils } from './utils';

/**
 * @fileoverview This header is in wrong place
 */

export const func = () => {};`,
      filename: 'src/utils.ts',
      errors: [{ messageId: 'missingHeader' }],
      output: `/**
 * @fileoverview TODO: Add file description
 */

import { utils } from './utils';

/**
 * @fileoverview This header is in wrong place
 */

export const func = () => {};`,
    },

    // Invalid: Multiple non-duplicate headers when not allowed
    {
      code: `/**
 * @fileoverview Main utilities
 * @author BluMint Team
 */

/**
 * @description Additional information
 * @since 2024-01-01
 */

export const func = () => {};`,
      filename: 'src/main.ts',
      options: [{ allowMultipleBlocks: false }],
      errors: [{ messageId: 'duplicateHeader' }],
      output: `/**
 * @fileoverview Main utilities
 * @author BluMint Team
 */


export const func = () => {};`,
    },

    // Invalid: File matching pattern but missing header
    {
      code: `export const func = () => {};`,
      filename: 'src/components/Button.tsx',
      options: [{ filePatterns: ['src/**/*.tsx'] }],
      errors: [{ messageId: 'missingHeader' }],
      output: `/**
 * @fileoverview TODO: Add file description
 */

export const func = () => {};`,
    },
  ],
});
