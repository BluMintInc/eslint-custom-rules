import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreFacade } from '../rules/enforce-firestore-facade';

ruleTesterTs.run('enforce-firestore-facade-batch-manager', enforceFirestoreFacade, {
  valid: [
    // Valid BatchManager.set() usage - should not trigger the rule
    {
      code: `
        export const setPendingChannelMembership = async ({
          userIds,
          channelId,
        }: SetPendingChannelMemershipProps) => {
          const batchManager = new BatchManager<ChannelMembership>();

          for (const userId of userIds) {
            const ref = db.doc(
              toChannelMembershipPath(userId),
            ) as DocumentReference<ChannelMembership>;

            // We must await each operation as BatchManager may commit internally
            await batchManager.set({
              ref,
              data: {
                id: CHANNEL_MEMBERSHIP_ID,
                channelsPending: FieldValue.arrayUnion(channelId),
              },
            });
          }

          await batchManager.commit();
        };
      `,
    },
    // Another valid BatchManager usage with different method name
    {
      code: `
        const customBatchManager = new BatchManager();
        await customBatchManager.set({ ref: docRef, data: { field: 'value' } });
      `,
    },
  ],
  invalid: [
    // This should still be invalid - direct DocumentReference.set() call
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        await docRef.set({ name: 'John' });
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
  ],
});
