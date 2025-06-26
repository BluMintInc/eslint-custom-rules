import { db } from './config/firebaseAdmin';
import { BatchManager } from './utils/BatchManager';
import { ChannelMembership } from './types/firestore/ChannelMembership';
import { DocumentReference, FieldValue } from 'firebase-admin/firestore';

const CHANNEL_MEMBERSHIP_ID = 'channel-membership';

interface SetPendingChannelMemershipProps {
  userIds: string[];
  channelId: string;
}

const toChannelMembershipPath = (userId: string) => `users/${userId}/channelMembership/membership`;

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
