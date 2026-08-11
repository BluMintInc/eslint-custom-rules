import { ruleTesterTs } from '../utils/ruleTester';
import { preferDocSetterSetAll } from '../rules/prefer-docsetter-setall';

ruleTesterTs.run('prefer-docsetter-setall', preferDocSetterSetAll, {
  valid: [
    `
      const docSetter = new DocSetter(userCollection);
      await docSetter.set({ id: '123', activeTournament: null });
    `,
    `
      const docSetterTransaction = new DocSetterTransaction(userCollection, { transaction });
      await docSetterTransaction.set({ id: '123', activeTournament: null });
    `,
    `
      const docSetter = new DocSetter(userCollection);
      const updates = userIds.map((userId) => ({
        id: userId,
        activeTournament: null,
      }) as const);
      await docSetter.setAll(updates);
    `,
    `
      const docSetterTransaction = new DocSetterTransaction(userCollection, { transaction });
      const updates = userIds.map((userId) => ({ id: userId, activeTournament: null }));
      await docSetterTransaction.setAll(updates);
    `,
    `
      const seen = new Map();
      ids.map((id) => seen.set(id, true));
    `,
    `
      class FakeSetter {
        set(value: string) { return value; }
      }
      const setter = new FakeSetter();
      ids.forEach((id) => setter.set(id));
    `,
    `
      const docSetter = new DocSetter(userCollection);
      function writeSingle(userId: string) {
        return docSetter.set({ id: userId, activeTournament: null });
      }
      await writeSingle('abc');
    `,
    `
      class Writer {
        private docSetter = new DocSetter(userCollection);

        async save(userId: string) {
          return this.docSetter.set({ id: userId });
        }
      }
    `,
    `
      async function writeOnce(docSetter: DocSetter<User>, userId: string) {
        return docSetter.set({ id: userId });
      }
    `,
    `
      const docSetter = new DocSetter(userCollection);
      if (shouldUpdate) {
        await docSetter.set({ id: sourceId, activeTournament: null });
      }
    `,
    `
      const docSetter = new DocSetter(userCollection);
      const writer = () => docSetter.set({ id: '123' });
      writer();
    `,
    `
      function maybeCreateSetter() {
        return {};
      }

      const existingSetter = maybeCreateSetter();
      const docSetter = existingSetter;

      ids.forEach((id) => docSetter.set({ id }));
    `,
    // An ECMA private setter written once, outside any iteration, is fine — the
    // rule keys on iteration, not on the privacy spelling of the field.
    `
      class Writer {
        #docSetter = new DocSetter(userCollection);

        async save(userId: string) {
          return this.#docSetter.set({ id: userId });
        }
      }
    `,
    `
      class Writer {
        #docSetter = new DocSetter(userCollection);

        async write(ids: string[]) {
          const updates = ids.map((id) => ({ id, activeTournament: null }) as const);
          await this.#docSetter.setAll(updates);
        }
      }
    `,
    // A `#` field that is not a DocSetter keeps its unrelated `set` calls.
    `
      class Writer {
        #seen = new Map();

        track(ids: string[]) {
          ids.forEach((id) => this.#seen.set(id, true));
        }
      }
    `,
    // `#docSetter` and `docSetter` are members of two different namespaces, so a
    // sibling public DocSetter must not vouch for a private field of another type.
    `
      class Writer {
        #docSetter = new Map();
        docSetter = new DocSetter(userCollection);

        write(ids: string[]) {
          ids.forEach((id) => {
            this.#docSetter.set(id, 1);
          });
        }
      }
    `,
    `
      class Writer {
        #docSetter = new Map();
        docSetter: DocSetter<User>;

        write(ids: string[]) {
          for (const id of ids) {
            this.#docSetter.set(id, 1);
          }
        }
      }
    `,
  ],
  invalid: [
    {
      code: `
        const docSetter = new DocSetter(userCollection);
        const userPromises = userIds.map(async (userId: string) => {
          await docSetter.set({
            id: userId,
            activeTournament: tournamentData
              ? { gameId, tournamentId: id }
              : FieldValue.delete(),
          });
        });
        await Promise.all(userPromises);
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        const docSetterTransaction = new DocSetterTransaction<User>(userCollection, { transaction });
        userIds.forEach((userId) => {
          docSetterTransaction.set({
            id: userId,
            activeTournament: tournamentData ? { gameId, tournamentId: id } : FieldValue.delete(),
          });
        });
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        const docSetter = new DocSetter(userCollection);
        for (const userId of userIds) {
          await docSetter.set({ id: userId, activeTournament: null });
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        const docSetterTransaction = new DocSetterTransaction(userCollection, { transaction });
        for (let i = 0; i < userIds.length; i++) {
          docSetterTransaction.set({ id: userIds[i] });
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        const docSetter = new DocSetter(userCollection);
        let index = 0;
        while (index < userIds.length) {
          docSetter.set({ id: userIds[index] });
          index++;
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        const docSetter = new DocSetter(userCollection);
        let index = 0;
        do {
          await docSetter.set({ id: userIds[index] });
          index++;
        } while (index < userIds.length);
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        const docSetter = new DocSetter(userCollection);
        const tasks = userIds.map((userId) => {
          return async () => docSetter.set({ id: userId });
        });
        await Promise.all(tasks.map((task) => task()));
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        const docSetter = new DocSetter(userCollection);
        await Promise.all(userIds.map((userId) => docSetter.set({ id: userId })));
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        async function bulkWrite(docSetter: DocSetter<User>, ids: string[]) {
          for (const id of ids) {
            await docSetter.set({ id, active: true });
          }
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        class TournamentWriter {
          private docSetter = new DocSetter(userCollection);

          async write(ids: string[]) {
            ids.forEach((id) => {
              this.docSetter.set({ id, activeTournament: null });
            });
          }
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        const docSetterTransaction = new DocSetterTransaction(userCollection, { transaction });
        for await (const userId of userIds) {
          await docSetterTransaction.set({ id: userId });
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        class ParameterPropertyWriter {
          constructor(private docSetter: DocSetter<User>) {}

          async write(ids: string[]) {
            ids.forEach((id) => this.docSetter.set({ id }));
          }
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        class AnnotatedWriter {
          private docSetter!: DocSetter<User>;

          constructor(docSetter: DocSetter<User>) {
            this.docSetter = docSetter;
          }

          save(ids: string[]) {
            return ids.map((id) => this.docSetter.set({ id }));
          }
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        namespace Firestore {
          export interface DocSetter<T> {
            set(doc: T): void;
          }
        }

        async function writeWithNamespaceSetter(
          docSetter: Firestore.DocSetter<User>,
          ids: string[],
        ) {
          ids.forEach((id) => docSetter.set({ id }));
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        function getSetter(): DocSetter<User> {
          return new DocSetter(userCollection);
        }

        const existingSetter = getSetter();
        const docSetter: DocSetter<User> = existingSetter;
        const ids = ['a', 'b'];

        ids.forEach((id) => docSetter.set({ id }));
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    {
      code: `
        function createSetter(): DocSetter<User> {
          return new DocSetter(userCollection);
        }

        class Writer {
          private docSetter: DocSetter<User> = createSetter();

          save(ids: string[]) {
            ids.map((id) => this.docSetter.set({ id }));
          }
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // `#docSetter` is the same privacy as `private docSetter` (and the two
    // spellings are mutually exclusive — `private #x` is TS18010), so the ECMA
    // private field must report exactly like its `private` counterpart above.
    {
      code: `
        class TournamentWriter {
          #docSetter = new DocSetter(userCollection);

          async write(ids: string[]) {
            ids.forEach((id) => {
              this.#docSetter.set({ id, activeTournament: null });
            });
          }
        }
      `,
      errors: [
        {
          messageId: 'preferSetAll',
          data: { setterName: '#docSetter', context: 'forEach callback' },
        },
      ],
    },
    {
      code: `
        class TransactionWriter {
          #docSetter: DocSetterTransaction<User>;

          async write(ids: string[]) {
            for (const id of ids) {
              this.#docSetter.set({ id });
            }
          }
        }
      `,
      errors: [
        {
          messageId: 'preferSetAll',
          data: { setterName: '#docSetter', context: 'for...of loop' },
        },
      ],
    },
    {
      code: `
        class AnnotatedPrivateFieldWriter {
          #docSetter!: DocSetter<User>;

          constructor(docSetter: DocSetter<User>) {
            this.#docSetter = docSetter;
          }

          save(ids: string[]) {
            return ids.map((id) => this.#docSetter.set({ id }));
          }
        }
      `,
      errors: [
        {
          messageId: 'preferSetAll',
          data: { setterName: '#docSetter', context: 'map callback' },
        },
      ],
    },
    // The private field is the DocSetter here and the public sibling is not, so
    // resolution must reach the `#` member rather than stopping at the name.
    {
      code: `
        class MixedNamespaceWriter {
          #docSetter = new DocSetter(userCollection);
          docSetter = new Map();

          write(ids: string[]) {
            ids.forEach((id) => {
              this.#docSetter.set({ id });
            });
          }
        }
      `,
      errors: [
        {
          messageId: 'preferSetAll',
          data: { setterName: '#docSetter', context: 'forEach callback' },
        },
      ],
    },
    // Mirror of the case above: the public member keeps reporting even when a
    // same-named private field of an unrelated type sits beside it.
    {
      code: `
        class MixedNamespacePublicWriter {
          #docSetter = new Map();
          docSetter = new DocSetter(userCollection);

          write(ids: string[]) {
            ids.forEach((id) => {
              this.docSetter.set({ id });
            });
          }
        }
      `,
      errors: [
        {
          messageId: 'preferSetAll',
          data: { setterName: 'docSetter', context: 'forEach callback' },
        },
      ],
    },
    // Isolation control: renaming the member while keeping `private` must not
    // move the verdict, so the delta above is about the spelling of privacy
    // rather than about the member's name.
    {
      code: `
        class RenamedPrivateWriter {
          private tournamentSetter = new DocSetter(userCollection);

          async write(ids: string[]) {
            ids.forEach((id) => {
              this.tournamentSetter.set({ id, activeTournament: null });
            });
          }
        }
      `,
      errors: [
        {
          messageId: 'preferSetAll',
          data: { setterName: 'tournamentSetter', context: 'forEach callback' },
        },
      ],
    },
  ],
});
