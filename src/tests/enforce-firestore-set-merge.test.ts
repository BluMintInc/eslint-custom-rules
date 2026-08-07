import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreSetMerge } from '../rules/enforce-firestore-set-merge';

ruleTesterTs.run('enforce-firestore-set-merge', enforceFirestoreSetMerge, {
  valid: [
    // Valid cases using non-Firestore update methods
    {
      code: `
        import { createHash } from 'node:crypto';
        const hash = createHash('sha256')
          .update(randomHex)
          .digest('hex');
      `,
    },
    {
      code: `
        import { createHash } from 'crypto';
        const hash = createHash('sha256')
          .update('some string')
          .update('another string')
          .digest('hex');
      `,
    },
    // Valid cases using set with merge
    {
      code: `
        const admin = require('firebase-admin');
        const db = admin.firestore();
        const userRef = db.collection('users').doc(userId);
        await userRef.set({
          preferences: {
            theme: 'dark',
            fontSize: 14
          }
        }, { merge: true });
      `,
    },
    {
      code: `
        import { doc, setDoc } from 'firebase/firestore';
        const docRef = doc(db, 'users', userId);
        await setDoc(docRef, {
          preferences: {
            theme: 'dark',
            fontSize: 14
          }
        }, { merge: true });
      `,
    },
    // Valid transaction cases
    {
      code: `
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          transaction.set(userRef, {
            preferences: {
              theme: 'dark'
            }
          }, { merge: true });
        });
      `,
    },
    // Valid transaction case with complex data
    {
      code: `
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          const currentGroups = ['group1', 'group2'];
          return transaction.set(userRef, { groups: currentGroups }, { merge: true });
        });
      `,
    },
    {
      code: `
        import { runTransaction, doc, setDoc } from 'firebase/firestore';
        await runTransaction(db, async (transaction) => {
          const userRef = doc(db, 'users', userId);
          transaction.set(userRef, {
            preferences: {
              theme: 'dark'
            }
          }, { merge: true });
        });
      `,
    },
    // Issue #1710: Realtime Database's batch manager is stored under the same
    // `batchManager` field name as the Firestore one, yet it has no `set` method
    // at all — its positional `update(path, data)` is the only write path. The
    // field's initializer names the class, which puts the call out of scope.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export class MessageProcessor {
          protected readonly batchManager = new RealtimeBatchManager();
          protected setChannelGroupPulsate(path: string) {
            this.batchManager.update(path, true);
          }
        }
      `,
    },
    // A constructor parameter property carries the same evidence in its type
    // annotation, wrapped in `Readonly<…>`.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export class Erc20TokenRateSyncer {
          constructor(
            private readonly batchManager: Readonly<RealtimeBatchManager>,
          ) {}
          public sync(path: string, rate: { usd: number }) {
            this.batchManager.update(path, rate);
          }
        }
      `,
    },
    // A bare annotation on the field, with the instance handed in elsewhere.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export class NativeTokenRateSyncer {
          private batchManager: RealtimeBatchManager;
          constructor(batchManager: RealtimeBatchManager) {
            this.batchManager = batchManager;
          }
          public sync(path: string, rate: { usd: number }) {
            this.batchManager.update(path, rate);
          }
        }
      `,
    },
    // A qualified type name reads as its rightmost segment.
    {
      code: `
        import * as realtimeDb from '../realtimeDb';
        export class QualifiedSyncer {
          constructor(private readonly batchManager: realtimeDb.RealtimeBatchManager) {}
          public sync(path: string, rate: { usd: number }) {
            this.batchManager.update(path, rate);
          }
        }
      `,
    },
    // A plain constructor parameter handed to a superclass declared elsewhere
    // is the only local evidence the agora syncers carry.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export class Erc20TokenRateSyncer extends BaseTokenRateSyncer {
          constructor(batchManager: Readonly<RealtimeBatchManager>) {
            super(batchManager, 'ERC20');
          }
          protected async writePrice(path: string, price: { usd: number }) {
            await this.batchManager.update(path, price);
          }
        }
      `,
    },
    // An intersection still holds the instance type.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export class InstrumentedSyncer {
          constructor(private readonly batchManager: RealtimeBatchManager & Logged) {}
          public sync(path: string, rate: { usd: number }) {
            this.batchManager.update(path, rate);
          }
        }
      `,
    },
    // A namespaced constructor names the same class.
    {
      code: `
        import * as realtimeDb from '../realtimeDb';
        export class NamespacedSyncer {
          private readonly batchManager = new realtimeDb.RealtimeBatchManager();
          public sync(path: string, rate: { usd: number }) {
            this.batchManager.update(path, rate);
          }
        }
      `,
    },
    // A defaulted constructor parameter property declares the field too.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export class DefaultedSyncer {
          constructor(private readonly batchManager = new RealtimeBatchManager()) {}
          public sync(path: string, rate: { usd: number }) {
            this.batchManager.update(path, rate);
          }
        }
      `,
    },
    // A superclass bound to a class expression resolves the same way.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        const BaseProcessor = class {
          protected readonly batchManager = new RealtimeBatchManager();
        };
        export class PulsateProcessor extends BaseProcessor {
          public pulsate(path: string, counts: { unread: number }) {
            this.batchManager.update(path, counts);
          }
        }
      `,
    },
    // A subclass inherits the field, so the evidence lives on the superclass.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        class MessageProcessor {
          protected readonly batchManager = new RealtimeBatchManager();
        }
        export class ReadMessageProcessor extends MessageProcessor {
          public markRead(path: string, counts: { unread: number }) {
            this.batchManager.update(path, counts);
          }
        }
      `,
    },
    // Issue #1773: the superclass search reads every enclosing statement
    // container, not `Program.body` alone. A base class declared beside its
    // subclass inside a function body carries the same evidence a top-level one
    // does, and this map feeds an exemption, so a miss reports a call the rule
    // cannot legally rewrite.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        function processMessages() {
          class MessageProcessor {
            protected readonly batchManager = new RealtimeBatchManager();
          }
          class ReadMessageProcessor extends MessageProcessor {
            public markRead(path: string, counts: { unread: number }) {
              this.batchManager.update(path, counts);
            }
          }
          return ReadMessageProcessor;
        }
      `,
    },
    // The same nesting written as an arrow body.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export const buildProcessor = () => {
          class MessageProcessor {
            protected readonly batchManager = new RealtimeBatchManager();
          }
          class ReadMessageProcessor extends MessageProcessor {
            public markRead(path: string, counts: { unread: number }) {
              this.batchManager.update(path, counts);
            }
          }
          return ReadMessageProcessor;
        };
      `,
    },
    // A namespace body is a statement container too.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        namespace Messaging {
          class MessageProcessor {
            protected readonly batchManager = new RealtimeBatchManager();
          }
          export class ReadMessageProcessor extends MessageProcessor {
            public markRead(path: string, counts: { unread: number }) {
              this.batchManager.update(path, counts);
            }
          }
        }
      `,
    },
    // The class-expression spelling of the base resolves at depth as well.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        function buildProcessor() {
          const BaseProcessor = class {
            protected readonly batchManager = new RealtimeBatchManager();
          };
          class PulsateProcessor extends BaseProcessor {
            public pulsate(path: string, counts: { unread: number }) {
              this.batchManager.update(path, counts);
            }
          }
          return PulsateProcessor;
        }
      `,
    },
    // A switch case holds statements without a block of its own.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export function pick(kind: string) {
          switch (kind) {
            case 'read':
              class MessageProcessor {
                protected readonly batchManager = new RealtimeBatchManager();
              }
              class ReadMessageProcessor extends MessageProcessor {
                public markRead(path: string, counts: { unread: number }) {
                  this.batchManager.update(path, counts);
                }
              }
              return ReadMessageProcessor;
            default:
              return null;
          }
        }
      `,
    },
    // A static block is a statement container as well.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export class Registry {
          static processor: unknown;
          static {
            class MessageProcessor {
              protected readonly batchManager = new RealtimeBatchManager();
            }
            class ReadMessageProcessor extends MessageProcessor {
              public markRead(path: string, counts: { unread: number }) {
                this.batchManager.update(path, counts);
              }
            }
            Registry.processor = ReadMessageProcessor;
          }
        }
      `,
    },
    // The base sits one container further out than the subclass, so the search
    // has to keep climbing rather than answer from the innermost scope alone.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export function outer() {
          class MessageProcessor {
            protected readonly batchManager = new RealtimeBatchManager();
          }
          function inner() {
            class ReadMessageProcessor extends MessageProcessor {
              public markRead(path: string, counts: { unread: number }) {
                this.batchManager.update(path, counts);
              }
            }
            return ReadMessageProcessor;
          }
          return inner;
        }
      `,
    },
    // Shadowing control: the innermost declaration wins, so a nested realtime
    // base answers for the nested subclass even though an outer class of the
    // same name holds a Firestore manager.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        class MessageProcessor {
          protected readonly batchManager = new BatchManager();
        }
        export function buildRealtime() {
          class MessageProcessor {
            protected readonly batchManager = new RealtimeBatchManager();
          }
          class ReadMessageProcessor extends MessageProcessor {
            public markRead(path: string, counts: { unread: number }) {
              this.batchManager.update(path, counts);
            }
          }
          return ReadMessageProcessor;
        }
      `,
    },
    // A bare receiver is not a member expression, so it never reaches the batch
    // manager branch at all; its binding resolves the same way if it ever does.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        const batchManager = new RealtimeBatchManager();
        export async function bump(path: string) {
          await batchManager.update(path, { count: 1 });
        }
      `,
    },
    // Firestore's update data is an object of field updates, so a primitive
    // literal in the data position is proof on its own — which is all a
    // subclass has when it inherits the field from a sibling module.
    {
      code: `
        export class ReadMessageProcessor extends MessageProcessor {
          public resetCount(path: string) {
            this.batchManager.update(path, 0);
          }
        }
      `,
    },
    {
      code: `
        export class ReadMessageProcessor extends MessageProcessor {
          public clearFlag(path: string) {
            this.batchManager.update(path, false);
          }
        }
      `,
    },
    {
      code: `
        export class ReadMessageProcessor extends MessageProcessor {
          public setStatus(path: string) {
            this.batchManager.update(path, 'read');
          }
        }
      `,
    },
    // A template literal evaluates to a string however it interpolates.
    {
      code: `
        export class ReadMessageProcessor extends MessageProcessor {
          public setStatus(path: string) {
            this.batchManager.update(path, \`read\`);
          }
        }
      `,
    },
    {
      code: `
        export class ReadMessageProcessor extends MessageProcessor {
          public setStatus(path: string, state: string) {
            this.batchManager.update(path, \`read-\${state}\`);
          }
        }
      `,
    },
    // An assertion wrapping the literal does not change what it evaluates to.
    {
      code: `
        export class ReadMessageProcessor extends MessageProcessor {
          public resetCount(path: string) {
            this.batchManager.update(path, 0 as const);
          }
        }
      `,
    },
    // A signed numeric literal is still a numeric literal.
    {
      code: `
        export class ReadMessageProcessor extends MessageProcessor {
          public decrement(path: string) {
            this.batchManager.update(path, -1);
          }
        }
      `,
    },
    // Issue #1763: the widened `firestore()` evidence search resolves more
    // declarations, not more initializers. A name that resolves to something
    // else is still no evidence at all, exported or not.
    {
      code: `
        const db = somethingElse();
        someRef.update({ theme: 'dark' });
      `,
    },
    {
      code: `
        export const db = somethingElse();
        someRef.update({ theme: 'dark' });
      `,
    },
    // No `firestore()` handle anywhere in the file leaves a bare-identifier
    // receiver unproven, so the call stays out of the rule.
    {
      code: `
        someRef.update({ theme: 'dark' });
      `,
    },
    // The search is lexical: a handle declared in a sibling function body is not
    // in scope at the call and cannot stand as its evidence.
    {
      code: `
        function other() {
          const db = admin.firestore();
        }
        function saveTheme(someRef) {
          someRef.update({ theme: 'dark' });
        }
      `,
    },
    // Issue #1827: looking through the optional link widens which initializers
    // count as evidence, not which calls are reachable. Every other constraint
    // on the evidence scan holds identically on the chained spelling.
    {
      code: `
        const db = admin?.database();
        someRef.update({ theme: 'dark' });
      `,
    },
    // A chained reference to the method is not a call to it, so it produces no
    // instance — exactly as `admin.firestore` does not.
    {
      code: `
        const db = admin?.firestore;
        someRef.update({ theme: 'dark' });
      `,
    },
    {
      code: `
        function other() {
          const db = admin?.firestore();
        }
        function saveTheme(someRef) {
          someRef.update({ theme: 'dark' });
        }
      `,
    },
    // The evidence scan is the last resort, so an earlier carve-out still
    // answers first: a hash digest is not a Firestore write however the file's
    // Firestore handle is spelled.
    {
      code: `
        import { createHash } from 'crypto';
        const db = admin?.firestore();
        const hash = createHash('sha256').update('some string').digest('hex');
      `,
    },
    // The Realtime Database carve-out is unaffected: its manager exposes no
    // `set`, so its calls stay out of the rule even in a file that does prove
    // Firestore is in play.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        const db = admin?.firestore();
        export class MessageProcessor {
          protected readonly batchManager = new RealtimeBatchManager();
          public markRead(path: string, counts: { unread: number }) {
            this.batchManager?.update(path, counts);
          }
        }
      `,
    },
  ],
  invalid: [
    // Invalid cases using update
    {
      code: `
        const admin = require('firebase-admin');
        const db = admin.firestore();
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
          'preferences.theme': 'dark',
          'preferences.fontSize': 14
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const admin = require('firebase-admin');
        const db = admin.firestore();
        const userRef = db.collection('users').doc(userId);
        await userRef.set({
          'preferences.theme': 'dark',
          'preferences.fontSize': 14
        }, { merge: true });
      `,
    },
    // A reference whose name merely contains `transaction` takes its data as the
    // first argument; reading a second argument that is not there used to splice
    // the whole file into the call.
    {
      code: `
        const admin = require('firebase-admin');
        const db = admin.firestore();
        const transactionRef = db.collection('transactions').doc(id);
        await transactionRef.update({ status: 'settled' });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const admin = require('firebase-admin');
        const db = admin.firestore();
        const transactionRef = db.collection('transactions').doc(id);
        await transactionRef.set({ status: 'settled' }, { merge: true });
      `,
    },
    // Arguments past the second are kept rather than dropped.
    {
      code: `
        const admin = require('firebase-admin');
        const db = admin.firestore();
        const userRef = db.collection('users').doc(userId);
        await userRef.update({ theme: 'dark' }, precondition);
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const admin = require('firebase-admin');
        const db = admin.firestore();
        const userRef = db.collection('users').doc(userId);
        await userRef.set({ theme: 'dark' }, precondition, { merge: true });
      `,
    },
    // Invalid cases using updateDoc: the rewritten call needs `setDoc` bound,
    // and the last reference to `updateDoc` frees its specifier (issue #1439).
    {
      code: `
        import { doc, updateDoc } from 'firebase/firestore';
        const docRef = doc(db, 'users', userId);
        await updateDoc(docRef, {
          'preferences.theme': 'dark',
          'preferences.fontSize': 14
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        import { doc, setDoc } from 'firebase/firestore';
        const docRef = doc(db, 'users', userId);
        await setDoc(docRef, {
          'preferences.theme': 'dark',
          'preferences.fontSize': 14
        }, { merge: true });
      `,
    },
    // Invalid case with dynamic import
    {
      code: `
        const { doc, updateDoc } = await import('firebase/firestore');
        const docRef = doc(db, 'users', userId);
        await updateDoc(docRef, {
          'preferences.theme': 'dark'
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const { doc, setDoc } = await import('firebase/firestore');
        const docRef = doc(db, 'users', userId);
        await setDoc(docRef, {
          'preferences.theme': 'dark'
        }, { merge: true });
      `,
    },
    // Invalid case with aliased import: the emitted call name and the local name
    // of the specifier have to agree, so the alias goes with its last reference.
    {
      code: `
        import { updateDoc as modifyDoc } from 'firebase/firestore';
        const docRef = doc(db, 'users', userId);
        await modifyDoc(docRef, {
          theme: 'dark'
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        import { setDoc } from 'firebase/firestore';
        const docRef = doc(db, 'users', userId);
        await setDoc(docRef, {
          theme: 'dark'
        }, { merge: true });
      `,
    },
    // Issue #1439: the reported reproduction, verbatim.
    {
      code: `
import { updateDoc } from 'firebase/firestore';
export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
import { setDoc } from 'firebase/firestore';
export async function save(ref) {
  await setDoc(ref, { theme: 'dark' }, { merge: true });
}
`,
    },
    // Aliased dynamic import: the destructured alias is the binding site.
    {
      code: `
const { updateDoc: modifyDoc } = await import('firebase/firestore');
export async function save(ref) {
  await modifyDoc(ref, { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
const { setDoc } = await import('firebase/firestore');
export async function save(ref) {
  await setDoc(ref, { theme: 'dark' }, { merge: true });
}
`,
    },
    // `setDoc` is already imported: no duplicate specifier, and the redundant
    // `updateDoc` specifier goes with its last reference.
    {
      code: `
import { doc, setDoc, updateDoc } from 'firebase/firestore';
export async function save(id) {
  await updateDoc(doc(db, 'users', id), { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
import { doc, setDoc } from 'firebase/firestore';
export async function save(id) {
  await setDoc(doc(db, 'users', id), { theme: 'dark' }, { merge: true });
}
`,
    },
    // A neighbour's trailing comment is outside the spliced span, so removing the
    // redundant specifier leaves it alone.
    {
      code: `
import {
  doc, // the reference factory
  updateDoc,
  setDoc,
} from 'firebase/firestore';
export async function save(id) {
  await updateDoc(doc(db, 'users', id), { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
import {
  doc, // the reference factory
  setDoc,
} from 'firebase/firestore';
export async function save(id) {
  await setDoc(doc(db, 'users', id), { theme: 'dark' }, { merge: true });
}
`,
    },
    // With a comment on either side of the specifier there is no span to splice
    // that does not take the comment with it, so the redundant specifier stays.
    {
      code: `
import { doc, setDoc, /* keep */ updateDoc } from 'firebase/firestore';
export async function save(id) {
  await updateDoc(doc(db, 'users', id), { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
import { doc, setDoc, /* keep */ updateDoc } from 'firebase/firestore';
export async function save(id) {
  await setDoc(doc(db, 'users', id), { theme: 'dark' }, { merge: true });
}
`,
    },
    // Two violations share one import: the first carries it, and `updateDoc`
    // stays bound because a sibling fix can be dropped by a multi-rule --fix.
    {
      code: `
import { doc, updateDoc } from 'firebase/firestore';
export async function saveTheme(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
export async function saveSize(ref) {
  await updateDoc(ref, { fontSize: 14 });
}
`,
      errors: [
        { messageId: 'preferSetMerge' },
        { messageId: 'preferSetMerge' },
      ],
      output: `
import { doc, updateDoc, setDoc } from 'firebase/firestore';
export async function saveTheme(ref) {
  await setDoc(ref, { theme: 'dark' }, { merge: true });
}
export async function saveSize(ref) {
  await setDoc(ref, { fontSize: 14 }, { merge: true });
}
`,
    },
    // A surviving non-call reference keeps `updateDoc` bound, so `setDoc` is
    // added alongside it rather than replacing it.
    {
      code: `
import { updateDoc } from 'firebase/firestore';
export const legacyUpdate = updateDoc;
export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
import { updateDoc, setDoc } from 'firebase/firestore';
export const legacyUpdate = updateDoc;
export async function save(ref) {
  await setDoc(ref, { theme: 'dark' }, { merge: true });
}
`,
    },
    // Comments inside the rewritten call survive: only the callee and the
    // argument list's tail are spliced.
    {
      code: `
import { updateDoc } from 'firebase/firestore';
export async function save(ref) {
  await updateDoc(
    ref,
    // keep this note
    { theme: 'dark' },
  );
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
import { setDoc } from 'firebase/firestore';
export async function save(ref) {
  await setDoc(
    ref,
    // keep this note
    { theme: 'dark' }, { merge: true },
  );
}
`,
    },
    // A `setDoc` bound to something else makes both halves of the edit wrong, so
    // the violation is reported without a fix.
    {
      code: `
import { updateDoc } from 'firebase/firestore';
const setDoc = (ref, data) => data;
export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // A narrower-scope shadow would rebind the emitted call with no diagnostic.
    {
      code: `
import { updateDoc } from 'firebase/firestore';
export async function save(ref) {
  const setDoc = ref.setDoc;
  await updateDoc(ref, { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // `setDoc` is bound to a different firestore export, so the name cannot be
    // reused for the rewrite.
    {
      code: `
import { updateDoc, deleteDoc as setDoc } from 'firebase/firestore';
export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // A local binding that shadows the import is not firestore's `updateDoc`, so
    // rewriting the call would emit a `setDoc` that means nothing here.
    {
      code: `
import { updateDoc } from 'firebase/firestore';
export function withLogger(updateDoc) {
  return updateDoc(ref, { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // A type-only import binds no value to rewrite the call against.
    {
      code: `
import type { updateDoc } from 'firebase/firestore';
export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // Removing the only specifier would leave `import {} from …`, which means
    // rewriting the whole declaration, so the redundant specifier stays.
    {
      code: `
import { updateDoc } from 'firebase/firestore';
import { setDoc } from 'firebase-admin';
export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
import { updateDoc } from 'firebase/firestore';
import { setDoc } from 'firebase-admin';
export async function save(ref) {
  await setDoc(ref, { theme: 'dark' }, { merge: true });
}
`,
    },
    // A method call with no arguments has no data to merge.
    {
      code: `
        await db.runTransaction(async (transaction) => {
          transaction.update();
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // Without an argument list there is nothing to merge into; deleting the call
    // (the previous behaviour) left `await ;` behind.
    {
      code: `
import { updateDoc } from 'firebase/firestore';
export async function save() {
  await updateDoc();
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // Spread arguments hide the argument count, so the options object cannot be
    // positioned.
    {
      code: `
import { updateDoc } from 'firebase/firestore';
export async function save(args) {
  await updateDoc(...args);
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // Invalid transaction case
    {
      code: `
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          transaction.update(userRef, {
            'preferences.theme': 'dark'
          });
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          transaction.set(userRef, {
            'preferences.theme': 'dark'
          }, { merge: true });
        });
      `,
    },
    // A comment between a method call's arguments survives the rewrite.
    {
      code: `
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          transaction.update(
            userRef,
            // keep this note
            { theme: 'dark' }
          );
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          transaction.set(
            userRef,
            // keep this note
            { theme: 'dark' }, { merge: true }
          );
        });
      `,
    },
    // A BatchManager call without data cannot be restructured into a descriptor
    // object; the previous fix read the missing argument's text and emitted the
    // whole file into the call.
    {
      code: `
        this.batchManager.update(notificationRef);
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // Invalid BatchManager case
    {
      code: `
        this.batchManager.update(notificationRef, updates);
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        this.batchManager.set({
          ref: notificationRef,
          data: updates,
          merge: true,
        });
      `,
    },
    // Issue #1710 negative space: the exemption keys on the RealtimeBatchManager
    // name, not on the mere presence of an initializer, so the Firestore
    // BatchManager under the same field name still reports and still fixes.
    {
      code: `
        import { BatchManager } from '../firestore/BatchManager';
        export class NotificationSyncer {
          private readonly batchManager = new BatchManager();
          public sync(notificationRef, updates) {
            this.batchManager.update(notificationRef, updates);
          }
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        import { BatchManager } from '../firestore/BatchManager';
        export class NotificationSyncer {
          private readonly batchManager = new BatchManager();
          public sync(notificationRef, updates) {
            this.batchManager.set({
          ref: notificationRef,
          data: updates,
          merge: true,
        });
          }
        }
      `,
    },
    // An unrelated class under the same field name is no evidence either.
    {
      code: `
        export class NotificationSyncer {
          private readonly batchManager = new SomethingElse();
          public sync(notificationRef, updates) {
            this.batchManager.update(notificationRef, updates);
          }
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        export class NotificationSyncer {
          private readonly batchManager = new SomethingElse();
          public sync(notificationRef, updates) {
            this.batchManager.set({
          ref: notificationRef,
          data: updates,
          merge: true,
        });
          }
        }
      `,
    },
    // The evidence has to be about the receiver's own member: a
    // RealtimeBatchManager held under a different name exempts nothing.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export class MixedSyncer {
          private readonly realtime = new RealtimeBatchManager();
          private readonly batchManager = new BatchManager();
          public sync(notificationRef, updates) {
            this.batchManager.update(notificationRef, updates);
          }
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        export class MixedSyncer {
          private readonly realtime = new RealtimeBatchManager();
          private readonly batchManager = new BatchManager();
          public sync(notificationRef, updates) {
            this.batchManager.set({
          ref: notificationRef,
          data: updates,
          merge: true,
        });
          }
        }
      `,
    },
    // Evidence is read from the receiver's own class and its ancestors: an
    // unrelated class holding a RealtimeBatchManager exempts nothing.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        class RealtimeProcessor {
          protected readonly batchManager = new RealtimeBatchManager();
        }
        export class FirestoreSyncer {
          private readonly batchManager = new BatchManager();
          public sync(notificationRef, updates) {
            this.batchManager.update(notificationRef, updates);
          }
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        class RealtimeProcessor {
          protected readonly batchManager = new RealtimeBatchManager();
        }
        export class FirestoreSyncer {
          private readonly batchManager = new BatchManager();
          public sync(notificationRef, updates) {
            this.batchManager.set({
          ref: notificationRef,
          data: updates,
          merge: true,
        });
          }
        }
      `,
    },
    // Issue #1773: widening the superclass search to every enclosing container
    // resolves more declarations, not more exemptions. A nested base holding a
    // Firestore manager still reports at each nesting depth.
    {
      code: `
        function buildSyncer() {
          class BaseSyncer {
            protected readonly batchManager = new BatchManager();
          }
          class FirestoreSyncer extends BaseSyncer {
            public sync(notificationRef, updates) {
              this.batchManager.update(notificationRef, updates);
            }
          }
          return FirestoreSyncer;
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        function buildSyncer() {
          class BaseSyncer {
            protected readonly batchManager = new BatchManager();
          }
          class FirestoreSyncer extends BaseSyncer {
            public sync(notificationRef, updates) {
              this.batchManager.set({
          ref: notificationRef,
          data: updates,
          merge: true,
        });
            }
          }
          return FirestoreSyncer;
        }
      `,
    },
    {
      code: `
        namespace Syncing {
          const BaseSyncer = class {
            protected readonly batchManager = new BatchManager();
          };
          export class FirestoreSyncer extends BaseSyncer {
            public sync(notificationRef, updates) {
              this.batchManager.update(notificationRef, updates);
            }
          }
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        namespace Syncing {
          const BaseSyncer = class {
            protected readonly batchManager = new BatchManager();
          };
          export class FirestoreSyncer extends BaseSyncer {
            public sync(notificationRef, updates) {
              this.batchManager.set({
          ref: notificationRef,
          data: updates,
          merge: true,
        });
            }
          }
        }
      `,
    },
    // Shadowing control in the reporting direction: an outer realtime base does
    // not exempt a subclass whose own scope declares a Firestore-holding class
    // of the same name.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        class BaseSyncer {
          protected readonly batchManager = new RealtimeBatchManager();
        }
        export function buildSyncer() {
          class BaseSyncer {
            protected readonly batchManager = new BatchManager();
          }
          class FirestoreSyncer extends BaseSyncer {
            public sync(notificationRef, updates) {
              this.batchManager.update(notificationRef, updates);
            }
          }
          return FirestoreSyncer;
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        class BaseSyncer {
          protected readonly batchManager = new RealtimeBatchManager();
        }
        export function buildSyncer() {
          class BaseSyncer {
            protected readonly batchManager = new BatchManager();
          }
          class FirestoreSyncer extends BaseSyncer {
            public sync(notificationRef, updates) {
              this.batchManager.set({
          ref: notificationRef,
          data: updates,
          merge: true,
        });
            }
          }
          return FirestoreSyncer;
        }
      `,
    },
    // A realtime base declared in a sibling function body is out of the
    // subclass's scope chain entirely, so it exempts nothing.
    {
      code: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        function makeRealtime() {
          class BaseSyncer {
            protected readonly batchManager = new RealtimeBatchManager();
          }
          return BaseSyncer;
        }
        export class FirestoreSyncer extends BaseSyncer {
          public sync(notificationRef, updates) {
            this.batchManager.update(notificationRef, updates);
          }
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';
        function makeRealtime() {
          class BaseSyncer {
            protected readonly batchManager = new RealtimeBatchManager();
          }
          return BaseSyncer;
        }
        export class FirestoreSyncer extends BaseSyncer {
          public sync(notificationRef, updates) {
            this.batchManager.set({
          ref: notificationRef,
          data: updates,
          merge: true,
        });
          }
        }
      `,
    },
    // A primitive nested inside the data object is not a primitive data
    // argument: the object is exactly the Firestore shape.
    {
      code: `
        this.batchManager.update(notificationRef, { unread: 0 });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        this.batchManager.set({
          ref: notificationRef,
          data: { unread: 0 },
          merge: true,
        });
      `,
    },
    // A call with no data argument has nothing in the data position, so the
    // primitive-literal signal cannot read the reference as data.
    {
      code: `
        this.batchManager.update('notifications/1');
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // Issue #1763: the file's `<x>.firestore()` handle is the only evidence a
    // bare-identifier receiver has, and it is idiomatically exported rather than
    // left module-private.
    {
      code: `
        export const db = admin.firestore();
        await someRef.update({ theme: 'dark' });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        export const db = admin.firestore();
        await someRef.set({ theme: 'dark' }, { merge: true });
      `,
    },
    // A handle constructed inside the handler that uses it — how Cloud Functions
    // code is written — carries the same evidence as a module-scope one.
    {
      code: `
        function saveTheme(someRef) {
          const db = admin.firestore();
          someRef.update({ theme: 'dark' });
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        function saveTheme(someRef) {
          const db = admin.firestore();
          someRef.set({ theme: 'dark' }, { merge: true });
        }
      `,
    },
    {
      code: `
        const saveTheme = async (someRef) => {
          const database = admin.firestore();
          await someRef.update({ theme: 'dark' });
        };
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const saveTheme = async (someRef) => {
          const database = admin.firestore();
          await someRef.set({ theme: 'dark' }, { merge: true });
        };
      `,
    },
    // A namespace body is a statement container like any other, and the export
    // wrapper inside it hides the declaration one node deeper still.
    {
      code: `
        namespace Data {
          export const db = admin.firestore();
          someRef.update({ theme: 'dark' });
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        namespace Data {
          export const db = admin.firestore();
          someRef.set({ theme: 'dark' }, { merge: true });
        }
      `,
    },
    {
      code: `
        class Bootstrap {
          static {
            const db = admin.firestore();
            someRef.update({ theme: 'dark' });
          }
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        class Bootstrap {
          static {
            const db = admin.firestore();
            someRef.set({ theme: 'dark' }, { merge: true });
          }
        }
      `,
    },
    {
      code: `
        switch (kind) {
          case 'theme':
            const db = admin.firestore();
            someRef.update({ theme: 'dark' });
        }
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        switch (kind) {
          case 'theme':
            const db = admin.firestore();
            someRef.set({ theme: 'dark' }, { merge: true });
        }
      `,
    },
    // Issue #1827: an optional link changes when the handle is produced, never
    // which instance it is, so `admin?.firestore()` is the same evidence as
    // `admin.firestore()`. The report and its fix land on the `update()` call,
    // which the optional link never touches.
    {
      code: `
        const db = admin?.firestore();
        await someRef.update({ theme: 'dark' });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const db = admin?.firestore();
        await someRef.set({ theme: 'dark' }, { merge: true });
      `,
    },
    // The optional-call arm parses into the same wrapper, one level deeper.
    {
      code: `
        const db = admin.firestore?.();
        await someRef.update({ theme: 'dark' });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const db = admin.firestore?.();
        await someRef.set({ theme: 'dark' }, { merge: true });
      `,
    },
    // Only the outermost node of a chain carries the wrapper, so the idiomatic
    // admin-SDK singleton bootstrap — an optional link deep inside the callee —
    // reads as the same handle.
    {
      code: `
        const db = admin.apps[0]?.firestore();
        const userRef = db.collection('users').doc(userId);
        await userRef.update({ theme: 'dark' });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const db = admin.apps[0]?.firestore();
        const userRef = db.collection('users').doc(userId);
        await userRef.set({ theme: 'dark' }, { merge: true });
      `,
    },
    // The chain wrapper composes with the `export` one rather than replacing it.
    {
      code: `
        export const db = admin.app()?.firestore();
        await someRef.update({ theme: 'dark' });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        export const db = admin.app()?.firestore();
        await someRef.set({ theme: 'dark' }, { merge: true });
      `,
    },
    // An assertion may wrap the chain or sit inside it, so both nesting orders
    // have to unwrap to the same call.
    {
      code: `
        const db = admin?.firestore() as Firestore;
        await someRef.update({ theme: 'dark' });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const db = admin?.firestore() as Firestore;
        await someRef.set({ theme: 'dark' }, { merge: true });
      `,
    },
    {
      code: `
        const db = admin?.firestore()!;
        await someRef.update({ theme: 'dark' });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const db = admin?.firestore()!;
        await someRef.set({ theme: 'dark' }, { merge: true });
      `,
    },
  ],
});

// Issue #1439: RuleTester applies a single fix pass, so it cannot show the file
// `eslint --fix` actually writes. These cases run the real multi-pass fixer and
// assert the invariant the bug violated: an emitted `setDoc(…)` call is never
// left without its binding.
describe('enforce-firestore-set-merge: the setDoc import carrier (issue #1439)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-firestore-set-merge';

  const createLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceFirestoreSetMerge as unknown as Rule.RuleModule,
    );
    // A near-miss neighbour proves directive matching is exact rather than a
    // prefix/substring heuristic.
    linter.defineRule('@blumintinc/blumint/enforce-firestore-set-merge-2', {
      meta: { schema: [] },
      create: () => ({}),
    } as unknown as Rule.RuleModule);
    return linter;
  };

  const config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' as const, 'no-console': 'error' as const },
  };

  const lint = (code: string) =>
    createLinter().verifyAndFix(code, config, 'save.ts').output;

  const expectNoUnboundSetDoc = (output: string) => {
    if (/\bsetDoc\(/.test(output)) {
      expect(output).toMatch(
        /import \{[^}]*\bsetDoc\b[^}]*\} from 'firebase\/firestore';/,
      );
    }
  };

  it('imports setDoc alongside the rewrite in a single pass', () => {
    const output = lint(`import { updateDoc } from 'firebase/firestore';

export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`);

    expect(output).toBe(`import { setDoc } from 'firebase/firestore';

export async function save(ref) {
  await setDoc(ref, { theme: 'dark' }, { merge: true });
}
`);
    expectNoUnboundSetDoc(output);
  });

  it('carries the import on the first surviving violation', () => {
    const output = lint(`import { updateDoc } from 'firebase/firestore';

export async function saveTheme(ref) {
  // eslint-disable-next-line @blumintinc/blumint/enforce-firestore-set-merge
  await updateDoc(ref, { theme: 'dark' });
}

export async function saveSize(ref) {
  await updateDoc(ref, { fontSize: 14 });
}
`);

    expect(output).toBe(`import { updateDoc, setDoc } from 'firebase/firestore';

export async function saveTheme(ref) {
  // eslint-disable-next-line @blumintinc/blumint/enforce-firestore-set-merge
  await updateDoc(ref, { theme: 'dark' });
}

export async function saveSize(ref) {
  await setDoc(ref, { fontSize: 14 }, { merge: true });
}
`);
    expectNoUnboundSetDoc(output);
  });

  it('rewrites both violations across passes with exactly one import', () => {
    const output = lint(`import { doc, updateDoc } from 'firebase/firestore';

export async function saveTheme(ref) {
  await updateDoc(ref, { theme: 'dark' });
}

export async function saveSize(ref) {
  await updateDoc(ref, { fontSize: 14 });
}
`);

    expect(output.match(/setDoc/g)).toHaveLength(3);
    expect(output)
      .toBe(`import { doc, updateDoc, setDoc } from 'firebase/firestore';

export async function saveTheme(ref) {
  await setDoc(ref, { theme: 'dark' }, { merge: true });
}

export async function saveSize(ref) {
  await setDoc(ref, { fontSize: 14 }, { merge: true });
}
`);
    expectNoUnboundSetDoc(output);
  });

  it('leaves the aliased binding consistent with the emitted call', () => {
    const output =
      lint(`import { updateDoc as modifyDoc } from 'firebase/firestore';

export async function save(ref) {
  await modifyDoc(ref, { theme: 'dark' });
}
`);

    expect(output).toBe(`import { setDoc } from 'firebase/firestore';

export async function save(ref) {
  await setDoc(ref, { theme: 'dark' }, { merge: true });
}
`);
    expect(output).not.toMatch(/modifyDoc/);
    expectNoUnboundSetDoc(output);
  });

  it('declines the fix when setDoc is already bound to something else', () => {
    const code = `import { updateDoc } from 'firebase/firestore';

const setDoc = (ref, data) => data;

export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`;

    expect(lint(code)).toBe(code);
  });

  it('leaves a disable directive inside the rewritten call still suppressing', () => {
    const code = `import { updateDoc } from 'firebase/firestore';

export async function save(ref) {
  await updateDoc(
    ref,
    // eslint-disable-next-line no-console
    { theme: console.log('dark') },
  );
}
`;

    const countNoConsole = (source: string) =>
      createLinter()
        .verify(source, config, 'save.ts')
        .filter((message) => message.ruleId === 'no-console').length;

    expect(countNoConsole(code)).toBe(0);

    const output = lint(code);

    expect(output).toBe(`import { setDoc } from 'firebase/firestore';

export async function save(ref) {
  await setDoc(
    ref,
    // eslint-disable-next-line no-console
    { theme: console.log('dark') }, { merge: true },
  );
}
`);
    expect(countNoConsole(output)).toBe(0);
    expectNoUnboundSetDoc(output);
  });
});
