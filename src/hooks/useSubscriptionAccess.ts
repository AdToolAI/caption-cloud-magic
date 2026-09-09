import { useAuth } from '@/hooks/useAuth';
import { useTrialAccess } from '@/hooks/useTrialAccess';
import { useAccountType } from '@/hooks/useAccountType';

/**
 * Display-only mirror of the server entitlement rule
 * (`_shared/subscription-entitlement.ts`):
 *
 *   access = active_subscription || creator_account
 *
 * Never uses `hasFullAccess` (Beta Open Access forces it true). The server
 * decides authoritatively.
 */
export function useSubscriptionAccess() {
  const { subscribed } = useAuth();
  const { isPaid } = useTrialAccess();
  const { isCreator, isLoading } = useAccountType();

  const isEntitled = subscribed === true || isPaid || isCreator;

  return {
    isEntitled,
    canUseContentCommandCenter: isEntitled,
    canUseSocialConnections: isEntitled,
    isLoading,
  };
}
