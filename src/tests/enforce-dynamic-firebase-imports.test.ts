import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirebaseImports } from '../rules/enforce-dynamic-firebase-imports';

ruleTesterTs.run('enforce-dynamic-firebase-imports', enforceFirebaseImports, {
  valid: [
    // Type-only imports should be allowed
    {
      code: `import type { Params } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
    },
    {
      code: `import type { User, Settings } from './firebaseCloud/auth/types';`,
    },
    {
      code: `import type { FirebaseConfig } from '../firebaseCloud/config';`,
    },

    // Regular imports from non-firebaseCloud directories should be allowed
    {
      code: `import { someFunction } from '../../../../otherDirectory/messaging/someFile';`,
    },
    {
      code: `import { utils } from './utils/helper';`,
    },
    {
      code: `import { component } from '../components/Button';`,
    },

    // Framework imports should be allowed
    {
      code: `import { initializeApp } from 'firebase/app';`,
    },
    {
      code: `import { getAuth } from 'firebase/auth';`,
    },
    {
      code: `import { getFirestore } from 'firebase/firestore';`,
    },
    {
      code: `import React from 'react';`,
    },
    {
      code: `import { useState } from 'react';`,
    },

    // Dynamic imports from firebaseCloud should be allowed
    {
      code: `const { setGroupChannel } = await import('../../../../firebaseCloud/messaging/setGroupChannel');`,
    },
    {
      code: `const module = await import('./firebaseCloud/auth/login');`,
    },

    // Default imports from non-firebaseCloud should be allowed
    {
      code: `import defaultExport from './utils/helper';`,
    },
    {
      code: `import * as utils from './utils/helper';`,
    },

    // Side-effect imports from non-firebaseCloud should be allowed
    {
      code: `import './styles.css';`,
    },
    {
      code: `import 'firebase/app';`,
    },

    // Mixed type and regular imports from non-firebaseCloud should be allowed
    {
      code: `import { func, type TypeDef } from './utils/helper';`,
    },

    // Imports with firebaseCloud in the middle of path but not targeting firebaseCloud directory
    {
      code: `import { func } from './some/firebaseCloud-like/path';`,
    },
    {
      code: `import { func } from './firebaseCloudHelper/utils';`,
    },

    // Empty import statements from non-firebaseCloud
    {
      code: `import './polyfills';`,
    },
  ],

  invalid: [
    // Basic static import from firebaseCloud
    {
      code: `import { setChannelGroup } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { setChannelGroup } = await import('../../../../firebaseCloud/messaging/setGroupChannel');`,
    },

    // Multiple named imports from firebaseCloud
    {
      code: `import { func1, func2, func3 } from './firebaseCloud/utils/helpers';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func1, func2, func3 } = await import('./firebaseCloud/utils/helpers');`,
    },

    // Single named import from firebaseCloud
    {
      code: `import { singleFunction } from '../firebaseCloud/auth/login';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { singleFunction } = await import('../firebaseCloud/auth/login');`,
    },

    // Mixed static and type imports from firebaseCloud (should still be flagged)
    {
      code: `import { setChannelGroup, Params } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { setChannelGroup, Params } = await import('../../../../firebaseCloud/messaging/setGroupChannel');`,
    },

    // Relative paths to firebaseCloud
    {
      code: `import { helper } from '../../../../../src/firebaseCloud/utils/helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { helper } = await import('../../../../../src/firebaseCloud/utils/helper');`,
    },

    // Deep nested firebaseCloud paths
    {
      code: `import { deepFunction } from './firebaseCloud/nested/very/deep/path/module';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { deepFunction } = await import('./firebaseCloud/nested/very/deep/path/module');`,
    },

    // firebaseCloud at the beginning of path
    {
      code: `import { func } from 'firebaseCloud/auth/login';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('firebaseCloud/auth/login');`,
    },

    // Complex import with renamed imports
    {
      code: `import { originalName as newName, anotherFunc } from './firebaseCloud/utils/complex';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { originalName, anotherFunc } = await import('./firebaseCloud/utils/complex');`,
    },

    // Import with special characters in function names
    {
      code: `import { $specialFunc, _privateFunc, func123 } from './firebaseCloud/special/names';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { $specialFunc, _privateFunc, func123 } = await import('./firebaseCloud/special/names');`,
    },

    // Very long import paths
    {
      code: `import { veryLongFunctionNameThatIsQuiteLong } from './very/long/path/to/firebaseCloud/with/many/segments/file';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { veryLongFunctionNameThatIsQuiteLong } = await import('./very/long/path/to/firebaseCloud/with/many/segments/file');`,
    },

    // Import from firebaseCloud with file extension
    {
      code: `import { func } from './firebaseCloud/utils/helper.ts';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/utils/helper.ts');`,
    },

    // Import from firebaseCloud with .js extension
    {
      code: `import { func } from './firebaseCloud/utils/helper.js';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/utils/helper.js');`,
    },

    // Import with quotes variations (double quotes)
    {
      code: `import { func } from "./firebaseCloud/utils/helper";`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/utils/helper');`,
    },

    // Multiple imports on same line with different spacing
    {
      code: `import {func1,func2, func3 ,func4} from './firebaseCloud/utils/spacing';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func1, func2, func3, func4 } = await import('./firebaseCloud/utils/spacing');`,
    },

    // Import with trailing comma
    {
      code: `import { func1, func2, } from './firebaseCloud/utils/trailing';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func1, func2 } = await import('./firebaseCloud/utils/trailing');`,
    },

    // Absolute path-like imports to firebaseCloud
    {
      code: `import { func } from '/src/firebaseCloud/absolute/path';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('/src/firebaseCloud/absolute/path');`,
    },

    // Import from firebaseCloud subdirectory with index file
    {
      code: `import { func } from './firebaseCloud/utils/';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/utils/');`,
    },

    // Import with firebaseCloud in middle of complex path
    {
      code: `import { func } from '../../src/app/firebaseCloud/services/auth';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('../../src/app/firebaseCloud/services/auth');`,
    },

    // Import with numbers in path
    {
      code: `import { func } from './firebaseCloud/v2/api/endpoints';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/v2/api/endpoints');`,
    },

    // Import with hyphens and underscores in path
    {
      code: `import { func } from './firebaseCloud/auth-service/user_management';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/auth-service/user_management');`,
    },

    // Import with uppercase letters in path
    {
      code: `import { func } from './firebaseCloud/AuthService/UserManagement';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/AuthService/UserManagement');`,
    },

    // Edge case: single character function name
    {
      code: `import { a, b, c } from './firebaseCloud/utils/short';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { a, b, c } = await import('./firebaseCloud/utils/short');`,
    },

    // Edge case: function name with numbers
    {
      code: `import { func1, func2, func123 } from './firebaseCloud/utils/numbered';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func1, func2, func123 } = await import('./firebaseCloud/utils/numbered');`,
    },

    // Edge case: very nested firebaseCloud path
    {
      code: `import { func } from './a/b/c/d/e/f/firebaseCloud/g/h/i/j/k/l/m/n/o/p/file';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./a/b/c/d/e/f/firebaseCloud/g/h/i/j/k/l/m/n/o/p/file');`,
    },

    // Edge case: firebaseCloud with query parameters (unusual but possible)
    {
      code: `import { func } from './firebaseCloud/utils/helper?version=1';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/utils/helper?version=1');`,
    },

    // Edge case: firebaseCloud with hash (unusual but possible)
    {
      code: `import { func } from './firebaseCloud/utils/helper#section';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/utils/helper#section');`,
    },

    // Edge case: side-effect import from firebaseCloud (no fix possible)
    {
      code: `import './firebaseCloud/styles.css';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: null,
    },

    // Edge case: default import from firebaseCloud (no fix possible)
    {
      code: `import defaultExport from './firebaseCloud/module';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: null,
    },

    // Edge case: namespace import from firebaseCloud (no fix possible)
    {
      code: `import * as firebaseModule from './firebaseCloud/module';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: null,
    },

    // Edge case: mixed default and named imports from firebaseCloud (only named imports in fix)
    {
      code: `import defaultExport, { namedExport } from './firebaseCloud/module';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { namedExport } = await import('./firebaseCloud/module');`,
    },

    // Edge case: import with very long path and many named imports
    {
      code: `import { func1, func2, func3, func4, func5, func6, func7, func8, func9, func10 } from './very/long/path/to/firebaseCloud/with/many/segments/and/deeply/nested/structure/file';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func1, func2, func3, func4, func5, func6, func7, func8, func9, func10 } = await import('./very/long/path/to/firebaseCloud/with/many/segments/and/deeply/nested/structure/file');`,
    },

    // Edge case: import with unicode characters in path
    {
      code: `import { func } from './firebaseCloud/utils/héllo-wörld';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/utils/héllo-wörld');`,
    },

    // Edge case: import with empty path segments
    {
      code: `import { func } from './firebaseCloud//utils//helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud//utils//helper');`,
    },

    // Edge case: import with current directory references
    {
      code: `import { func } from './firebaseCloud/./utils/./helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/./utils/./helper');`,
    },

    // Edge case: import with parent directory references
    {
      code: `import { func } from './firebaseCloud/../firebaseCloud/utils/helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/../firebaseCloud/utils/helper');`,
    },

    // Edge case: import with escaped characters in path
    {
      code: `import { func } from './firebaseCloud/utils/file\\\\name';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { func } = await import('./firebaseCloud/utils/file\\name');`,
    },

    // Edge case: import with very short path
    {
      code: `import { f } from './firebaseCloud/f';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { f } = await import('./firebaseCloud/f');`,
    },
  ],
});
