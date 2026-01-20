import { ruleTesterTs } from '../utils/ruleTester';
import rule, { RULE_NAME } from '../rules/enforce-dynamic-imports';

const ruleTester = ruleTesterTs;
const buildError = (source: string) => ({
  messageId: 'dynamicImportRequired' as const,
  data: { source },
});

ruleTester.run(RULE_NAME, rule, {
  valid: [
    // Relative imports should always be valid
    `import { something } from './local-file';`,
    `import { something } from '../parent-file';`,

    // Path aliases starting with @/ should be valid (considered internal)
    `import { something } from '@/utils/helpers';`,

    // Default ignored libraries should be valid
    `import React from 'react';`,
    `import { useState } from 'react';`,
    `import { useRouter } from 'next/router';`,
    `import { Button } from '@mui/material';`,
    `import { Add } from '@mui/icons-material';`,
    `import { clsx } from 'clsx';`,
    `import { twMerge } from 'tailwind-merge';`,

    // Custom ignored libraries
    {
      code: `import { Heavy } from 'heavy-lib';`,
      options: [{ ignoredLibraries: ['heavy-lib'] }],
    },
    {
      code: `import { Sub } from 'scoped/sub';`,
      options: [{ ignoredLibraries: ['scoped/*'] }],
    },

    // Type imports should be valid
    `import type { VideoCallProps } from '@stream-io/video-react-sdk';`,
    {
      code: `import { type VideoCallProps } from '@stream-io/video-react-sdk';`,
    },
    {
      code: `import { type T, type U } from 'some-heavy-lib';`,
    },

    // Dynamic imports are valid
    `const VideoCall = useDynamic(() => import('@stream-io/video-react-sdk'));`,
  ],
  invalid: [
    // Non-ignored external libraries should be invalid by default
    {
      code: `import VideoSDK from '@stream-io/video-react-sdk';`,
      errors: [buildError('@stream-io/video-react-sdk')],
    },
    {
      code: `import { someFunc } from 'lodash';`,
      errors: [buildError('lodash')],
    },
    {
      code: `import 'some-side-effect-lib';`,
      errors: [buildError('some-side-effect-lib')],
    },

    // Mixed type and value imports should be invalid
    {
      code: `import { type T, someValue } from 'some-heavy-lib';`,
      errors: [buildError('some-heavy-lib')],
    },
    {
      code: `import Default, { type T } from 'some-heavy-lib';`,
      errors: [buildError('some-heavy-lib')],
    },

    // Even if some libraries are ignored, others are still enforced
    {
      code: `import { Heavy } from 'heavy-lib';`,
      options: [{ ignoredLibraries: ['react'] }],
      errors: [buildError('heavy-lib')],
    },

    // Type imports should be invalid if allowImportType is false
    {
      code: `import type { Props } from 'some-lib';`,
      options: [{ ignoredLibraries: [], allowImportType: false }],
      errors: [buildError('some-lib')],
    },
    {
      code: `import { type T, type U } from 'some-lib';`,
      options: [{ ignoredLibraries: [], allowImportType: false }],
      errors: [buildError('some-lib')],
    },

    // Scoped libraries that are not ignored
    {
      code: `import { thing } from '@unignored/lib';`,
      options: [{ ignoredLibraries: ['@ignored/*'] }],
      errors: [buildError('@unignored/lib')],
    },

    // External that starts with @ but not @/
    {
      code: `import { thing } from '@internal/lib';`,
      options: [{ ignoredLibraries: [] }],
      errors: [buildError('@internal/lib')],
    },
  ],
});
