import { ruleTesterTs } from '../utils/ruleTester';
import rule, { RULE_NAME } from '../rules/enforce-dynamic-imports';

const ruleTester = ruleTesterTs;
const buildError = (source: string) => ({
  messageId: 'dynamicImportRequired' as const,
  data: { source },
});

ruleTester.run(RULE_NAME, rule, {
  valid: [
    // Regular imports from non-blacklisted libraries should be valid
    {
      code: `import React from 'react';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    {
      code: `import { useState } from 'react';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    // Type imports should be valid even from blacklisted libraries
    {
      code: `import type { VideoCallProps } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    {
      code: `import type { StreamVideo } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    // Type imports with aliases should be valid
    {
      code: `import type { VideoCallProps as VCProps } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    // Dynamic imports are already correct
    {
      code: `const VideoCall = useDynamic(() => import('@stream-io/video-react-sdk').then(mod => mod.VideoCall));`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    // Glob pattern matching
    {
      code: `import { Button } from '@mui/material';`,
      options: [{ libraries: ['@stream-io/*', 'some-heavy-lib*'] }],
    },
    // Regular import statement with type-only specifiers
    {
      code: `import { type VideoCallProps } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
  ],
  invalid: [
    // Default import from blacklisted library
    {
      code: `import VideoSDK from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
      errors: [buildError('@stream-io/video-react-sdk')],
    },
    // Named imports from blacklisted library
    {
      code: `import { VideoCall } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
      errors: [buildError('@stream-io/video-react-sdk')],
    },
    // Multiple named imports from blacklisted library
    {
      code: `import { VideoCall, AudioCall } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
      errors: [buildError('@stream-io/video-react-sdk')],
    },
    // Named imports with aliases from blacklisted library
    {
      code: `import { VideoCall as VC } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
      errors: [buildError('@stream-io/video-react-sdk')],
    },
    // Side-effect import from blacklisted library
    {
      code: `import '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
      errors: [buildError('@stream-io/video-react-sdk')],
    },
    // Glob pattern matching
    {
      code: `import { VideoCall } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/*'] }],
      errors: [buildError('@stream-io/video-react-sdk')],
    },
    // Multiple libraries with glob patterns
    {
      code: `import { SomeComponent } from 'some-heavy-library';`,
      options: [{ libraries: ['@stream-io/*', 'some-heavy-*'] }],
      errors: [buildError('some-heavy-library')],
    },
    // Type imports should be invalid if allowImportType is false
    {
      code: `import type { VideoCallProps } from '@stream-io/video-react-sdk';`,
      options: [
        { libraries: ['@stream-io/video-react-sdk'], allowImportType: false },
      ],
      errors: [buildError('@stream-io/video-react-sdk')],
    },
  ],
});
