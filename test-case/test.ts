import { useAuth } from '../../contexts/AuthContext';
import { RoleMap } from '../../../functions/src/types/Roles';
import { extractIds } from '../../../functions/src/util/roles/extractIds';
import { useStreamChat } from '../../contexts/StreamChatContext';
import { assertSafe } from '../../../functions/src/util/assertSafe';

export const useRoledUser = <T extends string>(requiredRoles?: T[]) => {
  const { uid } = useAuth();
  const { useChatContext } = useStreamChat();
  const { channel } = useChatContext();

  if (!uid || !channel) {
    return { hasRole: false, hasAnyRole: false } as const;
  }

  // Incorrect ESLint flag here
  const roles = (channel.data?.roles || {}) as RoleMap<T>;

  const hasAnyRole = extractIds<keyof RoleMap<T>>(roles).includes(uid);

  const hasRole = requiredRoles
    ? requiredRoles.some((role) => {
        // Incorrect ESLint flag here
        return (roles[assertSafe(role)] || []).includes(uid);
      })
    : hasAnyRole;

  return { hasRole, hasAnyRole } as const;
};
