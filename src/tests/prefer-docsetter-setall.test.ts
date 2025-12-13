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
  ],
});
