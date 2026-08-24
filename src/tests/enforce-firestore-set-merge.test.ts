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
    // Invalid cases using update. Issue #2097: an argument written across lines
    // cannot be printed flat, so the option cannot ride on the line the data
    // object closes on — the whole list breaks, one argument per line, closing
    // at the column the call opened at.
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
        await userRef.set(
          {
            'preferences.theme': 'dark',
            'preferences.fontSize': 14
          },
          { merge: true },
        );
      `,
    },
    // Issue #2097's reproduction verbatim, at column 0 and already a fixed point
    // of the consumer's formatter, so the expected output is the exact text that
    // formatter prints rather than a shape merely close to it.
    {
      code: `const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.update({
  'preferences.theme': 'dark',
  'preferences.fontSize': 14,
});
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.set(
  {
    'preferences.theme': 'dark',
    'preferences.fontSize': 14,
  },
  { merge: true },
);
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
        await setDoc(
          docRef,
          {
            'preferences.theme': 'dark',
            'preferences.fontSize': 14
          },
          { merge: true },
        );
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
        await setDoc(
          docRef,
          {
            'preferences.theme': 'dark'
          },
          { merge: true },
        );
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
        await setDoc(
          docRef,
          {
            theme: 'dark'
          },
          { merge: true },
        );
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
    // A comment caught in the spliced span is carried rather than deleted, and
    // rather than deciding whether the rewrite fires at all (#1877, #1901).
    {
      code: `
import { doc, setDoc, /* keep */ updateDoc } from 'firebase/firestore';
export async function save(id) {
  await updateDoc(doc(db, 'users', id), { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
import { doc, setDoc /* keep */ } from 'firebase/firestore';
export async function save(id) {
  await setDoc(doc(db, 'users', id), { theme: 'dark' }, { merge: true });
}
`,
    },
    // A carried LINE comment takes a line break with it, or the entry that moves
    // up into its place is commented out.
    {
      code: `
import {
  doc,
  updateDoc, // legacy write path
  setDoc,
} from 'firebase/firestore';
export async function save(id) {
  await updateDoc(doc(db, 'users', id), { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
import {
  doc,
  // legacy write path
  setDoc,
} from 'firebase/firestore';
export async function save(id) {
  await setDoc(doc(db, 'users', id), { theme: 'dark' }, { merge: true });
}
`,
    },
    // A directive comment means its position, so no re-emission is safe and the
    // whole fix is withheld — the report stands instead.
    {
      code: `
import {
  doc,
  updateDoc,
  // eslint-disable-next-line enforce-firestore-set-merge
  setDoc,
} from 'firebase/firestore';
export async function save(id) {
  await updateDoc(doc(db, 'users', id), { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // Two violations share one import, so ONE of them owns both rewrites and the
    // entry they retire: a report that removed the entry on its own would strand
    // whichever sibling fix a multi-rule --fix drops.
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
import { doc, setDoc } from 'firebase/firestore';
export async function saveTheme(ref) {
  await setDoc(ref, { theme: 'dark' }, { merge: true });
}
export async function saveSize(ref) {
  await setDoc(ref, { fontSize: 14 }, { merge: true });
}
`,
    },
    // The same shape with `setDoc` already imported: the batch removes the entry
    // instead of renaming it.
    {
      code: `
import { doc, setDoc, updateDoc } from 'firebase/firestore';
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
import { doc, setDoc } from 'firebase/firestore';
export async function saveTheme(ref) {
  await setDoc(ref, { theme: 'dark' }, { merge: true });
}
export async function saveSize(ref) {
  await setDoc(ref, { fontSize: 14 }, { merge: true });
}
`,
    },
    // A suppressed sibling keeps `updateDoc` referenced, so nothing is retired
    // and `setDoc` is added alongside it.
    {
      code: `
import { doc, updateDoc } from 'firebase/firestore';
export async function saveTheme(ref) {
  // eslint-disable-next-line enforce-firestore-set-merge
  await updateDoc(ref, { theme: 'dark' });
}
export async function saveSize(ref) {
  await updateDoc(ref, { fontSize: 14 });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
import { doc, updateDoc, setDoc } from 'firebase/firestore';
export async function saveTheme(ref) {
  // eslint-disable-next-line enforce-firestore-set-merge
  await updateDoc(ref, { theme: 'dark' });
}
export async function saveSize(ref) {
  await setDoc(ref, { fontSize: 14 }, { merge: true });
}
`,
    },
    // A sibling the rule cannot rewrite — spread arguments hide the argument
    // count — keeps `updateDoc` bound just as a suppressed one does.
    {
      code: `
import { doc, updateDoc } from 'firebase/firestore';
export async function saveTheme(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
export async function saveSize(args) {
  await updateDoc(...args);
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
export async function saveSize(args) {
  await updateDoc(...args);
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
    // Comments inside the rewritten call survive: only the callee, the argument
    // list's separators and its tail are spliced. A line comment between the
    // arguments is what forces the list to break in the first place, so the
    // option lands on a line of its own rather than beside the argument the
    // comment annotates (#2097).
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
    { theme: 'dark' },
    { merge: true },
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
    // `setDoc` bound from ANOTHER firestore entry point is not the `setDoc` the
    // rewrite needs: emitting the call against it would call a different
    // function and leave the `firebase/firestore` import bound to nothing.
    {
      code: `
import { updateDoc } from 'firebase/firestore';
import { setDoc } from 'firebase-admin';
export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // The same module on both sides: the entry retires, and since it is the only
    // specifier the whole declaration goes with it.
    {
      code: `
import { updateDoc } from 'firebase/firestore';
import { setDoc } from 'firebase/firestore';
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
    // `updateDoc` read as a value elsewhere is not this pass's to retire — an
    // over-eager removal deletes working code, where a surviving specifier is
    // inert.
    {
      code: `
import { doc, setDoc, updateDoc } from 'firebase/firestore';
export const writers = { legacy: updateDoc };
export async function save(id) {
  await updateDoc(doc(db, 'users', id), { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
import { doc, setDoc, updateDoc } from 'firebase/firestore';
export const writers = { legacy: updateDoc };
export async function save(id) {
  await setDoc(doc(db, 'users', id), { theme: 'dark' }, { merge: true });
}
`,
    },
    // The dynamic-import spelling of the same retirement: the destructured entry
    // goes, its siblings keep their separators.
    {
      code: `
const { doc, setDoc, updateDoc } = await import('firebase/firestore');
export async function save(id) {
  await updateDoc(doc(db, 'users', id), { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
const { doc, setDoc } = await import('firebase/firestore');
export async function save(id) {
  await setDoc(doc(db, 'users', id), { theme: 'dark' }, { merge: true });
}
`,
    },
    // A dynamic import of ANOTHER firestore entry point cannot supply the
    // `setDoc` the rewrite emits.
    {
      code: `
const { updateDoc } = await import('firebase/firestore');
const { setDoc } = await import('firebase-admin');
export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
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
          transaction.set(
            userRef,
            {
              'preferences.theme': 'dark'
            },
            { merge: true },
          );
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
            { theme: 'dark' },
            { merge: true },
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
    // The BatchManager arm rebuilds the argument list from the receiver and the
    // two arguments, so it copies nothing BETWEEN them. A comment in one of
    // those gaps would be dropped — and a dropped directive silently re-enables
    // what it suppressed (#1877) — so the rewrite is withheld and the report
    // left standing instead.
    {
      code: `
        this.batchManager.update(notificationRef, /* keep me */ { unread: 0 });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    {
      code: `
        this.batchManager.update(/* keep me */ notificationRef, { unread: 0 });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    {
      code: `
        this.batchManager.update(notificationRef, { unread: 0 } /* keep me */);
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    {
      code: `
        this.batchManager.update(
          notificationRef,
          // eslint-disable-next-line no-magic-numbers
          { unread: 0 },
        );
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: null,
    },
    // A comment INSIDE the receiver or either argument travels with the text it
    // annotates, so it is carried and the rewrite proceeds. Without these the
    // decline above could widen to every comment and nothing would notice.
    {
      code: `
        this.batchManager.update(notificationRef, { /* keep me */ unread: 0 });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        this.batchManager.set({
          ref: notificationRef,
          data: { /* keep me */ unread: 0 },
          merge: true,
        });
      `,
    },
    {
      code: `
        this./* keep me */batchManager.update(notificationRef, { unread: 0 });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        this./* keep me */batchManager.set({
          ref: notificationRef,
          data: { unread: 0 },
          merge: true,
        });
      `,
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
    // Issue #2084: the BatchManager descriptor is emitted across lines, so its
    // depth is a property of the call site rather than a constant. A fixed
    // indent is right for exactly one nesting level and leaves prettier to
    // re-indent the whole call everywhere else, so the fix is not a fixed point.
    // Each case below pins one call-site depth; the fixtures deliberately sit at
    // column 0 so the depth under test is the code's own, not the template's.
    {
      code: `this.batchManager.update(notificationRef, updates);`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `this.batchManager.set({
  ref: notificationRef,
  data: updates,
  merge: true,
});`,
    },
    {
      code: `
class NotificationSyncer {
  public sync(notificationRef, updates) {
    this.batchManager.update(notificationRef, updates);
  }
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
class NotificationSyncer {
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
    {
      code: `
function syncAll(notificationRef, updates) {
  if (updates) {
    this.batchManager.update(notificationRef, updates);
  }
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
function syncAll(notificationRef, updates) {
  if (updates) {
    this.batchManager.set({
      ref: notificationRef,
      data: updates,
      merge: true,
    });
  }
}
`,
    },
    {
      code: `
function syncAll(refs, updates) {
  if (updates) {
    for (const notificationRef of refs) {
      this.batchManager.update(notificationRef, updates);
    }
  }
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
function syncAll(refs, updates) {
  if (updates) {
    for (const notificationRef of refs) {
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
    {
      code: `
refs.forEach((notificationRef) => {
  this.batchManager.update(notificationRef, updates);
});
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
refs.forEach((notificationRef) => {
  this.batchManager.set({
    ref: notificationRef,
    data: updates,
    merge: true,
  });
});
`,
    },
    // A relocated argument carries the indentation of the depth it was written
    // at, so its continuation lines have to move with it. The interior of the
    // data object lands two columns deeper than the `data:` key that now
    // introduces it.
    {
      code: `
class NotificationSyncer {
  public sync(notificationRef) {
    this.batchManager.update(notificationRef, {
      unread: 0,
      lastSeen: Date.now(),
    });
  }
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
class NotificationSyncer {
  public sync(notificationRef) {
    this.batchManager.set({
      ref: notificationRef,
      data: {
        unread: 0,
        lastSeen: Date.now(),
      },
      merge: true,
    });
  }
}
`,
    },
    // The reference argument is relocated by the same rewrite, so a chain broken
    // across lines shifts with it too.
    {
      code: `
class NotificationSyncer {
  public sync(userId, updates) {
    this.batchManager.update(db
      .collection('notifications')
      .doc(userId), updates);
  }
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
class NotificationSyncer {
  public sync(userId, updates) {
    this.batchManager.set({
      ref: db
        .collection('notifications')
        .doc(userId),
      data: updates,
      merge: true,
    });
  }
}
`,
    },
    // An argument written deeper than its landing depth is shifted the other
    // way, so the descriptor stays internally consistent rather than keeping the
    // continuation column the call happened to use.
    {
      code: `
class NotificationSyncer {
  public sync(notificationRef) {
    this.batchManager.update(notificationRef,
        {
          unread: 0,
        });
  }
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
class NotificationSyncer {
  public sync(notificationRef) {
    this.batchManager.set({
      ref: notificationRef,
      data: {
        unread: 0,
      },
      merge: true,
    });
  }
}
`,
    },
    // The leading whitespace of a template literal's continuation lines is part
    // of the string's VALUE, so shifting it would change what the call writes.
    // Those lines are reproduced byte for byte while the code around them moves.
    {
      code: `
class NotificationSyncer {
  public sync(notificationRef) {
    this.batchManager.update(notificationRef, {
      summary: \`first line
  second line\`,
      unread: 0,
    });
  }
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
class NotificationSyncer {
  public sync(notificationRef) {
    this.batchManager.set({
      ref: notificationRef,
      data: {
        summary: \`first line
  second line\`,
        unread: 0,
      },
      merge: true,
    });
  }
}
`,
    },
    // A block comment whose continuation lines are not `*`-aligned is prose the
    // fixer does not own, so its interior is preserved byte for byte as well.
    {
      code: `
class NotificationSyncer {
  public sync(notificationRef) {
    this.batchManager.update(notificationRef, {
      /* keep this note
   ragged continuation */
      unread: 0,
    });
  }
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
class NotificationSyncer {
  public sync(notificationRef) {
    this.batchManager.set({
      ref: notificationRef,
      data: {
        /* keep this note
   ragged continuation */
        unread: 0,
      },
      merge: true,
    });
  }
}
`,
    },
    // A `*`-aligned block IS layout, and prettier realigns its stars to the
    // comment's new column, so this one moves with the code.
    {
      code: `
class NotificationSyncer {
  public sync(notificationRef) {
    this.batchManager.update(notificationRef, {
      /**
       * Cleared whenever the tray is opened.
       */
      unread: 0,
    });
  }
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
class NotificationSyncer {
  public sync(notificationRef) {
    this.batchManager.set({
      ref: notificationRef,
      data: {
        /**
         * Cleared whenever the tray is opened.
         */
        unread: 0,
      },
      merge: true,
    });
  }
}
`,
    },
    // Issue #2097: the option used to be appended inline, which left the data
    // object hugged against the call. A formatter breaks EVERY argument of a
    // list one of whose arguments cannot print flat, and closes such a list on a
    // line of its own, so the emitted text was never what it prints. The cases
    // below pin each regime: what forces the break, what must NOT be broken, and
    // what the break may not disturb.
    //
    // A list that fits on one line keeps it. Breaking that one out would be the
    // same defect pointing the other way.
    {
      code: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.update({ theme: 'dark' });
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.set({ theme: 'dark' }, { merge: true });
`,
    },
    // The width answer is about the line as it will be EMITTED, not as it was
    // read: this one fits at 71 columns and not at the 85 the option takes it
    // to, so the list breaks although nothing in it was written across lines.
    {
      code: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.update({ theme: 'dark', fontSize: 14, locale: 'en-US' });
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.set(
  { theme: 'dark', fontSize: 14, locale: 'en-US' },
  { merge: true },
);
`,
    },
    // Arguments past the second ride along: the rewrite edits the separators of
    // the list it found rather than rebuilding it from the two arguments it
    // cares about.
    {
      code: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.update(
  {
    theme: 'dark',
  },
  precondition,
  extra,
);
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.set(
  {
    theme: 'dark',
  },
  precondition,
  extra,
  { merge: true },
);
`,
    },
    // The emitted depth is the call's own: the list lands one step past the line
    // its parenthesis opens on and closes at that line's column, so an argument
    // written across lines moves with it.
    {
      code: `
export function syncAll(refs) {
  const db = admin.firestore();
  for (const userRef of refs) {
    if (userRef) {
      userRef.update({
        theme: 'dark',
      });
    }
  }
}
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
export function syncAll(refs) {
  const db = admin.firestore();
  for (const userRef of refs) {
    if (userRef) {
      userRef.set(
        {
          theme: 'dark',
        },
        { merge: true },
      );
    }
  }
}
`,
    },
    // A comment between the arguments of a list that stays flat is untouched,
    // because the option is appended after the last argument and nothing
    // between them is inside an edited range.
    {
      code: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.update({ theme: 'dark' }, /* keep me */ pre);
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.set({ theme: 'dark' }, /* keep me */ pre, { merge: true });
`,
    },
    // A comment sits INSIDE the span of the argument it annotates, so a broken
    // list rewrites only the separators around it and the comment survives at
    // the position it was written — which is the whole point for a directive,
    // whose meaning IS its position: it still binds the line it precedes.
    {
      code: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.update(
  // eslint-disable-next-line no-magic-numbers
  { fontSize: 14 },
);
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.set(
  // eslint-disable-next-line no-magic-numbers
  { fontSize: 14 },
  { merge: true },
);
`,
    },
    // Between the last argument and the closing parenthesis is the one gap the
    // argument spans do not absorb, since a trailing comma may sit there. A
    // comment past it would be inside a replaced range, so the list is left as
    // it was written and the option appended in place rather than deleting one.
    {
      code: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.update({
  theme: 'dark',
}, /* keep me */);
`,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
const admin = require('firebase-admin');
const db = admin.firestore();
const userRef = db.collection('users').doc(userId);
await userRef.set({
  theme: 'dark',
}, { merge: true }, /* keep me */);
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

  it('rewrites both violations with exactly one import and no stranded entry', () => {
    const output = lint(`import { doc, updateDoc } from 'firebase/firestore';

export async function saveTheme(ref) {
  await updateDoc(ref, { theme: 'dark' });
}

export async function saveSize(ref) {
  await updateDoc(ref, { fontSize: 14 });
}
`);

    expect(output.match(/setDoc/g)).toHaveLength(3);
    expect(output).not.toMatch(/updateDoc/);
    expect(output).toBe(`import { doc, setDoc } from 'firebase/firestore';

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

  // Issue #1901: `--fix` must not turn a file that lints clean into one carrying
  // an unreferenced binding. The consumer runs `no-unused-vars` as an error and
  // builds with `noUnusedLocals`, and the report is resolved by the fix, so
  // nothing re-reports the debt.
  const unusedNames = (source: string) =>
    createLinter()
      .verify(
        source,
        {
          ...config,
          rules: { 'no-unused-vars': ['error', { args: 'none' }] as const },
        },
        'save.ts',
      )
      .filter((message) => message.ruleId === 'no-unused-vars')
      .map((message) => /^'([^']+)'/.exec(message.message)?.[1] ?? '')
      .sort();

  /**
   * Core `no-unused-vars` is the instrument, exactly as the corpus guard's is.
   * A fixture may already carry an unused binding — an imported `setDoc` waiting
   * for the rewrite that will use it — so the assertion is a MULTISET
   * containment: nothing may be unused afterwards that was not unused before.
   */
  const expectNoNewOrphan = (before: string, after: string) => {
    const pool = unusedNames(before);
    const introduced = unusedNames(after).filter((name) => {
      const at = pool.indexOf(name);
      if (at === -1) return true;
      pool.splice(at, 1);
      return false;
    });
    expect(introduced).toEqual([]);
  };

  it('carries a comment out of the retired entry rather than declining', () => {
    const code = `import { doc, setDoc, /* keep */ updateDoc } from 'firebase/firestore';

export async function save(id) {
  await updateDoc(doc(db, 'users', id), { theme: 'dark' });
}
`;
    const output = lint(code);

    expect(output)
      .toBe(`import { doc, setDoc /* keep */ } from 'firebase/firestore';

export async function save(id) {
  await setDoc(doc(db, 'users', id), { theme: 'dark' }, { merge: true });
}
`);
    expectNoNewOrphan(code, output);
  });

  it('retires the whole declaration when the entry was its only specifier', () => {
    const code = `import { updateDoc } from 'firebase/firestore';
import { setDoc } from 'firebase/firestore';

export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`;
    const output = lint(code);

    expect(output).toBe(`import { setDoc } from 'firebase/firestore';

export async function save(ref) {
  await setDoc(ref, { theme: 'dark' }, { merge: true });
}
`);
    expectNoNewOrphan(code, output);
  });

  it('declines when setDoc comes from a different firestore entry point', () => {
    const code = `import { updateDoc } from 'firebase/firestore';
import { setDoc } from 'firebase-admin';

export async function save(ref) {
  await updateDoc(ref, { theme: 'dark' });
}
`;

    expect(lint(code)).toBe(code);
  });

  it('keeps an entry that another reference still reads', () => {
    const code = `import { doc, setDoc, updateDoc } from 'firebase/firestore';

export const writers = { legacy: updateDoc };

export async function save(id) {
  await updateDoc(doc(db, 'users', id), { theme: 'dark' });
}
`;
    const output = lint(code);

    expect(output)
      .toBe(`import { doc, setDoc, updateDoc } from 'firebase/firestore';

export const writers = { legacy: updateDoc };

export async function save(id) {
  await setDoc(doc(db, 'users', id), { theme: 'dark' }, { merge: true });
}
`);
    expectNoNewOrphan(code, output);
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
    { theme: console.log('dark') },
    { merge: true },
  );
}
`);
    expect(countNoConsole(output)).toBe(0);
    expectNoUnboundSetDoc(output);
  });
});
