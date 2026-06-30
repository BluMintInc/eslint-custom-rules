import { ruleTesterTs } from '../utils/ruleTester';
import rule, { RULE_NAME } from '../rules/enforce-dynamic-imports';

const ruleTester = ruleTesterTs;
const buildError = (source: string) => ({
  messageId: 'dynamicImportRequired' as const,
  data: { source },
});

ruleTester.run(RULE_NAME, rule, {
  valid: [
    // ─── Relative imports ───────────────────────────────────────────────────
    `import { something } from './local-file';`,
    `import { something } from '../parent-file';`,

    // ─── Path aliases starting with @/ (treated as internal) ────────────────
    `import { something } from '@/utils/helpers';`,
    `import { Component } from '@/components/Foo';`,

    // ─── Default ignored libraries ───────────────────────────────────────────
    `import React from 'react';`,
    `import { useState } from 'react';`,
    `import { createRoot } from 'react-dom/client';`,
    `import { renderToString } from 'react-dom/server';`,
    `import { useRouter } from 'next/router';`,
    `import { Button } from '@mui/material';`,
    `import { Add } from '@mui/icons-material';`,
    `import { clsx } from 'clsx';`,
    `import { twMerge } from 'tailwind-merge';`,

    // ─── Custom ignoredLibraries ─────────────────────────────────────────────
    {
      code: `import { Heavy } from 'heavy-lib';`,
      options: [{ ignoredLibraries: ['heavy-lib'] }],
    },
    {
      code: `import { Sub } from 'scoped/sub';`,
      options: [{ ignoredLibraries: ['scoped/*'] }],
    },

    // ─── Type imports ────────────────────────────────────────────────────────
    `import type { VideoCallProps } from '@stream-io/video-react-sdk';`,
    {
      code: `import { type VideoCallProps } from '@stream-io/video-react-sdk';`,
    },
    {
      code: `import { type T, type U } from 'some-heavy-lib';`,
    },

    // ─── Dynamic imports ─────────────────────────────────────────────────────
    `const VideoCall = useDynamic(() => import('@stream-io/video-react-sdk'));`,

    // ─── Complex glob handled by minimatch.hasMagic ──────────────────────────
    {
      code: `import { thing } from 'lib-a';`,
      options: [{ ignoredLibraries: ['lib-[a-z]'] }],
    },

    // ─── Digit-prefixed package can be ignored ───────────────────────────────
    {
      code: `import { thing } from '3d-force-graph';`,
      options: [{ ignoredLibraries: ['3d-force-graph'] }],
    },

    // ─── Node builtins (enforce-by-default mode, default options) ───────────
    // Bare names
    `import { parse } from 'url';`,
    `import { randomUUID } from 'crypto';`,
    `import { readFileSync } from 'fs';`,
    `import { join } from 'path';`,
    // node: prefix
    `import { readFileSync } from 'node:fs';`,
    `import { join } from 'node:path';`,
    // Sub-path forms (e.g. 'fs/promises', 'util/types')
    `import { readFile } from 'fs/promises';`,
    `import { isDeepStrictEqual } from 'util/types';`,

    // ─── Internal baseUrl paths (enforce-by-default, default prefixes) ───────
    `import { assertSafe } from 'functions/src/util/assertSafe';`,
    `import { COLORS } from 'src/styles/layout';`,
    `import { something } from 'src/components/Button';`,
    `import { helper } from 'functions/utils/helper';`,

    // ─── Custom internalPrefixes ──────────────────────────────────────────────
    {
      code: `import { thing } from 'app/foo/bar';`,
      options: [{ internalPrefixes: ['app/'] }],
    },
    {
      // Multiple custom prefixes - all should be treated as internal
      code: `import { thing } from 'packages/shared/utils';`,
      options: [{ internalPrefixes: ['packages/', 'app/'] }],
    },

    // ─── Whitelist mode: unlisted external libs are NOT flagged ──────────────
    {
      // lodash is not in libraries, so whitelist mode allows it
      code: `import { debounce } from 'lodash';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    {
      // External scoped package not in list - should be allowed
      code: `import { something } from '@some-other/lib';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    {
      // Empty libraries list - nothing should be flagged in whitelist mode
      code: `import { Heavy } from 'very-heavy-lib';`,
      options: [{ libraries: [] }],
    },

    // ─── Backwards-compat: { libraries, allowImportType } must not throw ─────
    // (RuleTester surfaces schema errors as failures, so this pins facet #1)
    {
      code: `import type { Props } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'], allowImportType: true }],
    },

    // ─── Whitelist mode: type-only imports still skipped ─────────────────────
    {
      // Listed library but it's a type import - allowImportType defaults to true
      code: `import type { VideoCallProps } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    {
      code: `import { type VideoCallProps } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },

    // ─── Enforce-by-default: allowImportType skips type-only imports ─────────
    `import type { VideoCallProps } from '@stream-io/video-react-sdk';`,
    {
      code: `import { type StreamVideo } from '@stream-io/video-react-sdk';`,
    },
  ],
  invalid: [
    // ─── Non-ignored external libs flagged in enforce-by-default mode ────────
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
    {
      // 3d-force-graph is external (digit-prefix) and not ignored by default
      code: `import ForceGraph from '3d-force-graph';`,
      errors: [buildError('3d-force-graph')],
    },

    // ─── Mixed type and value imports are still invalid ───────────────────────
    {
      code: `import { type T, someValue } from 'some-heavy-lib';`,
      errors: [buildError('some-heavy-lib')],
    },
    {
      code: `import Default, { type T } from 'some-heavy-lib';`,
      errors: [buildError('some-heavy-lib')],
    },

    // ─── Custom ignoredLibraries: unlisted libs still flagged ─────────────────
    {
      code: `import { Heavy } from 'heavy-lib';`,
      options: [{ ignoredLibraries: ['react'] }],
      errors: [buildError('heavy-lib')],
    },

    // ─── allowImportType: false makes type-only imports invalid ──────────────
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

    // ─── Scoped packages that are not ignored ─────────────────────────────────
    {
      code: `import { thing } from '@unignored/lib';`,
      options: [{ ignoredLibraries: ['@ignored/*'] }],
      errors: [buildError('@unignored/lib')],
    },
    {
      // External scoped package without @/ prefix is still external
      code: `import { thing } from '@internal/lib';`,
      options: [{ ignoredLibraries: [] }],
      errors: [buildError('@internal/lib')],
    },
    {
      code: `import { thing } from '3d-force-graph';`,
      options: [{ ignoredLibraries: [] }],
      errors: [buildError('3d-force-graph')],
    },

    // ─── Whitelist mode: listed library IS flagged ────────────────────────────
    {
      code: `import VideoSDK from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
      errors: [buildError('@stream-io/video-react-sdk')],
    },
    {
      // Glob pattern in whitelist mode
      code: `import { thing } from 'foo/bar';`,
      options: [{ libraries: ['foo/**'] }],
      errors: [buildError('foo/bar')],
    },
    {
      // Multiple libraries in whitelist: listed one is flagged
      code: `import { Heavy } from 'heavy-lib';`,
      options: [{ libraries: ['@stream-io/video-react-sdk', 'heavy-lib'] }],
      errors: [buildError('heavy-lib')],
    },

    // ─── Whitelist mode: allowImportType false still enforces type imports ────
    {
      code: `import type { VideoCallProps } from '@stream-io/video-react-sdk';`,
      options: [
        { libraries: ['@stream-io/video-react-sdk'], allowImportType: false },
      ],
      errors: [buildError('@stream-io/video-react-sdk')],
    },

    // ─── Custom internalPrefixes: non-listed prefix is still external ─────────
    {
      // 'other/lib' does not start with 'app/', so it is flagged
      code: `import { thing } from 'other/lib';`,
      options: [{ internalPrefixes: ['app/'] }],
      errors: [buildError('other/lib')],
    },
  ],
});
