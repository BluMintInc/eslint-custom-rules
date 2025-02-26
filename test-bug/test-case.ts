import {
  DocumentReference,
  CollectionReference,
} from 'firebase-admin/firestore';
import { db } from '../../config/firebaseAdmin';
import { GroupDenormalization } from '../../types/firestore/User/GroupDenormalization';
import { toGroupDenormalizationCollectionPath } from '../../types/firestore/User/GroupDenormalization/path';
import { GroupInfo } from '../../types/firestore/Guild';
import { GroupDecoder } from './GroupDecoder';

export const STREAMER_SUBGROUP_USERNAME = 'Streamer' as const;

export const fetchStreamerGroups = async (userId: string) => {
  const denormDocs = await (
    db.collection(
      toGroupDenormalizationCollectionPath(userId),
    ) as CollectionReference<GroupDenormalization>
  ).get();

  const streamerGroups = await Promise.all(
    denormDocs.docs.map(async ({ id }) => {
      const decoder = GroupDecoder.fromBase62(id);

      const path = decoder.subgroupPath;
      if (!path) {
        return;
      }

      const subGroupDoc = await (
        db.doc(path) as DocumentReference<GroupInfo>
      ).get();

      const subGroupData = subGroupDoc.data();

      if (subGroupData?.username !== STREAMER_SUBGROUP_USERNAME) {
        return;
      }
      return decoder.groupId;
    }),
  );

  return streamerGroups.filter((id): id is string => {
    return id !== undefined;
  });
};
