import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
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
    // Several named bindings destructured off one dynamic import
    {
      code: `async function signIn() {
const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
return signInWithEmailAndPassword(getAuth());
}`,
    },
    // Aliased destructuring off a dynamic import
    {
      code: `async function loadAuth() {
const { getAuth: auth } = await import('firebase/auth');
return auth();
}`,
    },
    // The promise resolved by `import()` IS the module namespace object
    {
      code: `async function loadAuth() {
const firebaseAuth = await import('firebase/auth');
return firebaseAuth;
}`,
    },
    // The namespace object exposes the default export under `default`
    {
      code: `async function loadApp() {
const { default: firebase, initializeApp } = await import('firebase/app');
return initializeApp(firebase);
}`,
    },
    // Dynamic side-effect import
    {
      code: `async function setup() {
await import('firebase/auth');
}`,
    },
    // A dynamic import cannot supply types, so a static `import type` pairs
    // with it at module scope
    {
      code: `import type { Firestore } from 'firebase/firestore';
async function initFirestore() {
const { getFirestore } = await import('firebase/firestore');
const db: Firestore = getFirestore();
return db;
}`,
    },
    // Async class methods are valid await contexts
    {
      code: `class FirebaseLoader {
async load() {
const { getAuth } = await import('firebase/auth');
return getAuth();
}
}`,
    },
    // The config module loads dynamically the same way
    {
      code: `async function loadConfig() {
const firebaseConfig = (await import('../../config/firebase-client')).default;
return firebaseConfig;
}`,
    },
    // `.then()` is an equally valid dynamic form outside an async context
    {
      code: `const authPromise = import('firebase/auth').then((mod) => mod.getAuth());`,
    },
  ],
  invalid: [
    // A static `import` declaration is legal only at the top level of a module
    // or namespace, so every reportable site is at module scope. The rule is
    // report-only: the `await import()` rewrite would introduce top-level
    // await, so `output` stays null throughout.
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
    // Default combined with named specifiers
    {
      code: `import firebase, { initializeApp } from 'firebase/app';
export const app = initializeApp(firebase);`,
      errors: [dynamicImportError('firebase/app')],
      output: null,
    },
    // Default combined with a namespace specifier
    {
      code: `import firebase, * as firebaseApp from 'firebase/app';
export const both = { firebase, firebaseApp };`,
      errors: [dynamicImportError('firebase/app')],
      output: null,
    },
    // A single value specifier alongside inline type markers still loads the
    // SDK at runtime, so the statement reports
    {
      code: `import { getFirestore, type Firestore } from 'firebase/firestore';
let db: Firestore;
db = getFirestore();
export { db };`,
      errors: [dynamicImportError('firebase/firestore')],
      output: null,
    },
    // Multiple inline type specifiers do not excuse the one value specifier
    {
      code: `import { getAuth, type User as FirebaseUser, type Auth } from 'firebase/auth';
export const auth: Auth = getAuth();
export const user: FirebaseUser | null = auth.currentUser;`,
      errors: [dynamicImportError('firebase/auth')],
      output: null,
    },
    // A default import is a value binding even when every named specifier is
    // type-only
    {
      code: `import firebase, { type FirebaseApp } from 'firebase/app';
export const app: FirebaseApp = firebase.app();`,
      errors: [dynamicImportError('firebase/app')],
      output: null,
    },
    // A value import used only in type position still emits a runtime require
    {
      code: `import { OAuthCredential } from 'firebase/auth';
export const connectWithCredential = async (credential: OAuthCredential) => {
const firebaseAuth = await import('firebase/auth');
return firebaseAuth.signInWithCredential(credential);
};`,
      errors: [dynamicImportError('firebase/auth')],
      output: null,
    },
    // A compliant dynamic import elsewhere in the file does not excuse a
    // static sibling
    {
      code: `import { getFirestore } from 'firebase/firestore';
export async function loadAuth() {
const { getAuth } = await import('firebase/auth');
return { getAuth, getFirestore };
}`,
      errors: [dynamicImportError('firebase/firestore')],
      output: null,
    },
    // Each static Firebase import reports independently
    {
      code: `import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
export const services = { getAuth, getFirestore };`,
      errors: [
        dynamicImportError('firebase/auth'),
        dynamicImportError('firebase/firestore'),
      ],
      output: null,
    },
    // Deeper relative paths to the config module still match
    {
      code: `import { firebaseApp } from '../../../config/firebase-client';
export const app = firebaseApp;`,
      errors: [dynamicImportError('../../../config/firebase-client')],
      output: null,
    },
  ],
});

// The rule reports without ever offering a fix. A static `import` declaration
// only parses inside a function because @typescript-eslint/parser is more
// permissive than the compiler (TypeScript rejects that shape with TS1232), so
// a fixer gated on an async enclosing function could never run on source that
// compiles. Declaring `meta.fixable` there would advertise a `--fix` remedy
// consumers can never receive, so both halves are asserted here.
describe(`${RULE_NAME} is report-only`, () => {
  const RULE_ID = `@blumintinc/blumint/${RULE_NAME}`;

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser('ts', tsParser as never);
    linter.defineRule(RULE_ID, rule as never);
    const messages = linter.verify(
      code,
      {
        parser: 'ts',
        parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { [RULE_ID]: 'error' },
      } as never,
      { filename: 'file.ts' },
    );
    // A single-rule Linter also emits directive problems that carry no
    // messageId; only real reports are of interest.
    return messages.filter((message) => Boolean(message.messageId));
  };

  it('declares no fixable capability', () => {
    expect(rule.meta.fixable).toBeUndefined();
  });

  it('attaches no fix to a module-scope import', () => {
    const reports = lint(`import firebase from 'firebase/app';`);
    expect(reports).toHaveLength(1);
    expect(reports[0].fix).toBeUndefined();
  });

  it('attaches no fix to an import nested in an async function', () => {
    const reports = lint(`async function loadAuth() {
import { getAuth } from 'firebase/auth';
return getAuth();
}`);
    expect(reports).toHaveLength(1);
    expect(reports[0].fix).toBeUndefined();
  });
});
