import { ruleTesterTs } from '../utils/ruleTester';
import rule, { RULE_NAME } from '../rules/require-dynamic-firebase-imports';

const ruleTester = ruleTesterTs;

ruleTester.run(RULE_NAME, rule, {
  valid: [
    // Non-Firebase imports should be valid
    {
      code: `import React from 'react';`,
    },
    {
      code: `import { useState } from 'react';`,
    },
    {
      code: `import apiClient from '@/utils/apiClient';`,
    },
  ],
  invalid: [
    // Default import from firebase
    {
      code: `import firebase from 'firebase/app';`,
      errors: [{ messageId: 'requireDynamicImport' }],
      output: `const firebase = (await import('firebase/app')).default;`,
    },
    // Side-effect import
    {
      code: `import 'firebase/auth';`,
      errors: [{ messageId: 'requireDynamicImport' }],
      output: `await import('firebase/auth');`,
    },
    // Named imports
    {
      code: `import { getAuth } from 'firebase/auth';`,
      errors: [{ messageId: 'requireDynamicImport' }],
      output: `const { getAuth } = await import('firebase/auth');`,
    },
    // Multiple named imports
    {
      code: `import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';`,
      errors: [{ messageId: 'requireDynamicImport' }],
      output: `const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');`,
    },
    // Firebase config import
    {
      code: `import firebaseConfig from '../../config/firebase-client';`,
      errors: [{ messageId: 'requireDynamicImport' }],
      output: `const firebaseConfig = (await import('../../config/firebase-client')).default;`,
    },
    // Named imports with aliases
    {
      code: `import { getAuth as auth } from 'firebase/auth';`,
      errors: [{ messageId: 'requireDynamicImport' }],
      output: `const { getAuth: auth } = await import('firebase/auth');`,
    },
  ],
});
