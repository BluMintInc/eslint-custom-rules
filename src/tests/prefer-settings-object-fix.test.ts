import { ruleTesterTs } from '../utils/ruleTester';
import { preferSettingsObject } from '../rules/prefer-settings-object';

// Test case to reproduce the issue with DocumentChangeHandlerTransaction
ruleTesterTs.run('prefer-settings-object-fix', preferSettingsObject, {
  valid: [
    // Test case for the specific issue with DocumentChangeHandlerTransaction
    {
      code: `
        import { Transaction } from 'firebase-admin/firestore';

        type PromiseOrValue<T> = T | Promise<T>;

        type FirebaseHandler<TEvent, TResponse> = (
          event: TEvent,
        ) => PromiseOrValue<TResponse>;

        type FirestoreEvent<T, TParams> = {
          data: T;
          params: TParams;
        };

        type FirestoreHandler<T, TParams, TResponse> = FirebaseHandler<
          FirestoreEvent<T, TParams>,
          TResponse
        >;

        type DocumentData = Record<string, any>;

        type ParamsOf<T extends string> = Record<string, string>;

        type DocumentSnapshot<TDoc extends DocumentData> = {
          data: () => TDoc | undefined;
          id: string;
          ref: { parent: any };
        };

        type Change<T> = {
          before: T;
          after: T;
        };

        type DocumentChangeHandler<
          TDoc extends DocumentData,
          TPath extends string,
          TResponse = PromiseOrValue<any>,
        > = FirestoreHandler<
          Change<DocumentSnapshot<TDoc>>,
          ParamsOf<TPath>,
          TResponse
        >;

        type WithTransaction<TFunc extends (...args: any[]) => any> = (
          ...args: [...Parameters<TFunc>, Transaction]
        ) => ReturnType<TFunc>;

        type DocumentChangeHandlerTransaction<
          TDoc extends DocumentData,
          TPath extends string,
          TResponse = PromiseOrValue<any>,
        > = WithTransaction<DocumentChangeHandler<TDoc, TPath, TResponse>>;

        // The function that was incorrectly flagged
        export const denormalizeCustomProviderIds: DocumentChangeHandlerTransaction<
          Record<string, any>,
          string
        > = (event, transaction) => {
          // Function implementation
          return true;
        };
      `,
      options: [{ checkSameTypeParameters: true }],
    },
    // Test case with explicit type annotations to show they are different
    {
      code: `
        import { Transaction } from 'firebase-admin/firestore';

        type Change<T> = { before: T; after: T };
        type DocumentSnapshot<T> = { data: () => T | undefined };

        // Explicitly showing the different types
        export const myFunction = (
          event: Change<DocumentSnapshot<any>>,
          transaction: Transaction
        ) => {
          // Function implementation
          return true;
        };
      `,
      options: [{ checkSameTypeParameters: true }],
    },
    // Original code from the bug report
    {
      code: `
        import { FieldValue } from 'firebase-admin/firestore';
        import { DocumentChangeHandlerTransaction } from '../../../v2/handlerTypes';
        import { User } from '../../../types/firestore/User';
        import { UserPath } from '../../../types/firestore/User/path';
        import { setsDiff } from '../../../util/setsDiff';
        import { DocSetterTransaction } from '../../../util/firestore/DocSetterTransaction';

        // We use DocumentChangeHandlerTransaction because we need to handle
        // both addition and removal operations as part of a single transaction
        export const denormalizeCustomProviderIds: DocumentChangeHandlerTransaction<
          User,
          UserPath
        > = (event, transaction) => {
          const { data: change } = event;
          const [userDataBefore, userDataAfter] = [
            change.before.data(),
            change.after.data(),
          ];
          const [customProvidersBefore, customProvidersAfter] = [
            userDataBefore?.hidden?.customProviders || [],
            userDataAfter?.hidden?.customProviders || [],
          ];

          const uidsBefore = customProvidersBefore.map(({ uid }) => uid);
          const uidsAfter = customProvidersAfter.map(({ uid }) => uid);

          const { added, removed } = setsDiff(new Set(uidsBefore), new Set(uidsAfter));
          if (added.length === 0 && removed.length === 0) {
            return;
          }

          const docSetter = new DocSetterTransaction(change.after.ref.parent, {
            transaction,
          });

          if (removed.length > 0) {
            docSetter.updateIfExists({
              id: change.after.id,
              'hidden.customProviderIds': FieldValue.arrayRemove(...removed),
            });
          }

          if (added.length > 0) {
            docSetter.updateIfExists({
              id: change.after.id,
              'hidden.customProviderIds': FieldValue.arrayUnion(...added),
            });
          }

          return true;
        };
      `,
      options: [{ checkSameTypeParameters: true }],
    },
  ],
  invalid: [],
});
