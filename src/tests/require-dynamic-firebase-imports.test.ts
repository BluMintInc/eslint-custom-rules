import { ruleTesterTs } from '../utils/ruleTester';
import rule, { RULE_NAME } from '../rules/require-dynamic-firebase-imports';

const ruleTester = ruleTesterTs;

const dynamicImportError = (importSource: string) => ({
  messageId: 'requireDynamicImport' as const,
  data: { importSource },
});

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
    // Type imports should be valid
    {
      code: `import type { UserInfo } from 'firebase/auth';`,
    },
    {
      code: `import type { FirebaseApp } from 'firebase/app';`,
    },
    {
      code: `import type { User as FirebaseUser } from 'firebase/auth';`,
    },
  ],
  invalid: [
    // Default import from firebase
    {
      code: `import firebase from 'firebase/app';`,
      errors: [dynamicImportError('firebase/app')],
      output: `const firebase = (await import('firebase/app')).default;`,
    },
    // Side-effect import
    {
      code: `import 'firebase/auth';`,
      errors: [dynamicImportError('firebase/auth')],
      output: `await import('firebase/auth');`,
    },
    // Named imports
    {
      code: `import { getAuth } from 'firebase/auth';`,
      errors: [dynamicImportError('firebase/auth')],
      output: `const { getAuth } = await import('firebase/auth');`,
    },
    // Multiple named imports
    {
      code: `import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';`,
      errors: [dynamicImportError('firebase/auth')],
      output: `const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');`,
    },
    // Firebase config import
    {
      code: `import firebaseConfig from '../../config/firebase-client';`,
      errors: [dynamicImportError('../../config/firebase-client')],
      output: `const firebaseConfig = (await import('../../config/firebase-client')).default;`,
    },
    // Named imports with aliases
    {
      code: `import { getAuth as auth } from 'firebase/auth';`,
      errors: [dynamicImportError('firebase/auth')],
      output: `const { getAuth: auth } = await import('firebase/auth');`,
    },
  ],
});
