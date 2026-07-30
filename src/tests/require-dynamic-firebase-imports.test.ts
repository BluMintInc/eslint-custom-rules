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
    // Whole-statement type imports should be valid
    {
      code: `import type { UserInfo } from 'firebase/auth';`,
    },
    {
      code: `import type { FirebaseApp } from 'firebase/app';`,
    },
    {
      code: `import type { User as FirebaseUser } from 'firebase/auth';`,
    },
    // Type-only default and namespace imports should be valid
    {
      code: `import type FirebaseApp from 'firebase/app';`,
    },
    {
      code: `import type * as FirebaseAuthTypes from 'firebase/auth';`,
    },
    // Imports where every specifier carries an inline `type` marker are
    // erased at compile time, exactly like `import type` — no report
    {
      code: `import { type Firestore, type FirestoreSettings } from 'firebase/firestore';`,
    },
    {
      code: `import { type User } from 'firebase/auth';`,
    },
    {
      code: `import { type FirebaseOptions } from '../../config/firebase-client';`,
    },
    // Dynamic imports are the desired end state
    {
      code: `async function loadAuth() {
const { getAuth } = await import('firebase/auth');
return getAuth();
}`,
    },
    {
      code: `const loadApp = async () => {
const firebase = (await import('firebase/app')).default;
return firebase;
};`,
    },
  ],
  invalid: [
    // Module-scope imports report but must NOT be autofixed: the rewrite
    // would introduce top-level await
    {
      code: `import firebase from 'firebase/app';`,
      errors: [dynamicImportError('firebase/app')],
      output: null,
    },
    {
      code: `import 'firebase/auth';`,
      errors: [dynamicImportError('firebase/auth')],
      output: null,
    },
    {
      code: `import { getAuth } from 'firebase/auth';`,
      errors: [dynamicImportError('firebase/auth')],
      output: null,
    },
    {
      code: `import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';`,
      errors: [dynamicImportError('firebase/auth')],
      output: null,
    },
    {
      code: `import firebaseConfig from '../../config/firebase-client';`,
      errors: [dynamicImportError('../../config/firebase-client')],
      output: null,
    },
    {
      code: `import { getAuth as auth } from 'firebase/auth';`,
      errors: [dynamicImportError('firebase/auth')],
      output: null,
    },
    {
      code: `import * as firebaseAuth from 'firebase/auth';`,
      errors: [dynamicImportError('firebase/auth')],
      output: null,
    },
    // Module-scope mixed value + inline type import: report, no fix. The
    // fixer previously destructured `Firestore` at runtime, stranding the
    // type references (TS2749)
    {
      code: `import { getFirestore, type Firestore } from 'firebase/firestore';
let db: Firestore;
db = getFirestore();
export { db };`,
      errors: [dynamicImportError('firebase/firestore')],
      output: null,
    },
    // Module-scope value import used only in type position: report, no fix
    {
      code: `import { OAuthCredential } from 'firebase/auth';
export const connectWithCredential = async (credential: OAuthCredential) => {
const firebaseAuth = await import('firebase/auth');
return firebaseAuth.signInWithCredential(credential);
};`,
      errors: [dynamicImportError('firebase/auth')],
      output: null,
    },
    // Import inside a synchronous function: `await` is invalid there, so
    // report without fixing
    {
      code: `function loadAuth() {
import { getAuth } from 'firebase/auth';
return getAuth();
}`,
      errors: [dynamicImportError('firebase/auth')],
      output: null,
    },
    // A sync function nested inside an async function still cannot host the
    // await
    {
      code: `async function outer() {
function inner() {
import { getAuth } from 'firebase/auth';
return getAuth();
}
return inner();
}`,
      errors: [dynamicImportError('firebase/auth')],
      output: null,
    },
    // Inside an async function the rewrite is valid: named import
    {
      code: `async function loadAuth() {
import { getAuth } from 'firebase/auth';
return getAuth();
}`,
      errors: [dynamicImportError('firebase/auth')],
      output: `async function loadAuth() {
const { getAuth } = await import('firebase/auth');
return getAuth();
}`,
    },
    // Multiple named imports inside an async function
    {
      code: `async function signIn() {
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
return signInWithEmailAndPassword(getAuth());
}`,
      errors: [dynamicImportError('firebase/auth')],
      output: `async function signIn() {
const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
return signInWithEmailAndPassword(getAuth());
}`,
    },
    // Aliased named import inside an async function
    {
      code: `async function loadAuth() {
import { getAuth as auth } from 'firebase/auth';
return auth();
}`,
      errors: [dynamicImportError('firebase/auth')],
      output: `async function loadAuth() {
const { getAuth: auth } = await import('firebase/auth');
return auth();
}`,
    },
    // Default import inside an async function
    {
      code: `async function loadFirebase() {
import firebase from 'firebase/app';
return firebase;
}`,
      errors: [dynamicImportError('firebase/app')],
      output: `async function loadFirebase() {
const firebase = (await import('firebase/app')).default;
return firebase;
}`,
    },
    // Namespace import inside an async function maps onto the module
    // namespace object
    {
      code: `async function loadAuth() {
import * as firebaseAuth from 'firebase/auth';
return firebaseAuth;
}`,
      errors: [dynamicImportError('firebase/auth')],
      output: `async function loadAuth() {
const firebaseAuth = await import('firebase/auth');
return firebaseAuth;
}`,
    },
    // Default + named imports inside an async function
    {
      code: `async function loadApp() {
import firebase, { initializeApp } from 'firebase/app';
return initializeApp(firebase);
}`,
      errors: [dynamicImportError('firebase/app')],
      output: `async function loadApp() {
const { default: firebase, initializeApp } = await import('firebase/app');
return initializeApp(firebase);
}`,
    },
    // Default + namespace imports inside an async function
    {
      code: `async function loadApp() {
import firebase, * as firebaseApp from 'firebase/app';
return { firebase, firebaseApp };
}`,
      errors: [dynamicImportError('firebase/app')],
      output: `async function loadApp() {
const firebaseApp = await import('firebase/app'); const firebase = firebaseApp.default;
return { firebase, firebaseApp };
}`,
    },
    // Side-effect import inside an async function
    {
      code: `async function setup() {
import 'firebase/auth';
}`,
      errors: [dynamicImportError('firebase/auth')],
      output: `async function setup() {
await import('firebase/auth');
}`,
    },
    // Mixed value + inline type import inside an async function: value
    // specifiers go dynamic, type specifiers hoist into a static
    // `import type` at module scope
    {
      code: `async function initFirestore() {
import { getFirestore, type Firestore } from 'firebase/firestore';
const db: Firestore = getFirestore();
return db;
}`,
      errors: [dynamicImportError('firebase/firestore')],
      output: `import type { Firestore } from 'firebase/firestore';
async function initFirestore() {
const { getFirestore } = await import('firebase/firestore');
const db: Firestore = getFirestore();
return db;
}`,
    },
    // Multiple inline type specifiers hoist together, preserving aliases
    {
      code: `async function loadUser() {
import { getAuth, type User as FirebaseUser, type Auth } from 'firebase/auth';
const auth: Auth = getAuth();
const user: FirebaseUser | null = auth.currentUser;
return user;
}`,
      errors: [dynamicImportError('firebase/auth')],
      output: `import type { User as FirebaseUser, Auth } from 'firebase/auth';
async function loadUser() {
const { getAuth } = await import('firebase/auth');
const auth: Auth = getAuth();
const user: FirebaseUser | null = auth.currentUser;
return user;
}`,
    },
    // Default import mixed with an inline type specifier inside an async
    // function
    {
      code: `async function loadApp() {
import firebase, { type FirebaseApp } from 'firebase/app';
const app: FirebaseApp = firebase.app();
return app;
}`,
      errors: [dynamicImportError('firebase/app')],
      output: `import type { FirebaseApp } from 'firebase/app';
async function loadApp() {
const firebase = (await import('firebase/app')).default;
const app: FirebaseApp = firebase.app();
return app;
}`,
    },
    // Async arrow function bodies are valid await contexts
    {
      code: `const loadFirestore = async () => {
import { getFirestore } from 'firebase/firestore';
return getFirestore();
};`,
      errors: [dynamicImportError('firebase/firestore')],
      output: `const loadFirestore = async () => {
const { getFirestore } = await import('firebase/firestore');
return getFirestore();
};`,
    },
    // Async class methods are valid await contexts
    {
      code: `class FirebaseLoader {
async load() {
import { getAuth } from 'firebase/auth';
return getAuth();
}
}`,
      errors: [dynamicImportError('firebase/auth')],
      output: `class FirebaseLoader {
async load() {
const { getAuth } = await import('firebase/auth');
return getAuth();
}
}`,
    },
    // Firebase config imports rewrite inside async functions too
    {
      code: `async function loadConfig() {
import firebaseConfig from '../../config/firebase-client';
return firebaseConfig;
}`,
      errors: [dynamicImportError('../../config/firebase-client')],
      output: `async function loadConfig() {
const firebaseConfig = (await import('../../config/firebase-client')).default;
return firebaseConfig;
}`,
    },
  ],
});
