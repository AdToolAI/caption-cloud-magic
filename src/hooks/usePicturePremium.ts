import { useAuth } from '@/hooks/useAuth';
import { useTrialAccess } from '@/hooks/useTrialAccess';
import { useAccountType } from '@/hooks/useAccountType';

/**
 * Display-only mirror of the server's Picture Studio premium gate.
 *
 * Never uses `hasFullAccess` (Beta Open Access forces it true). The server
 * decides authoritatively via `_shared/picture-studio-premium.ts`.
 */
export function usePicturePremium(): { isEntitled: boolean } {
  const { subscribed } = useAuth();
  const { isPaid } = useTrialAccess();
  const { isCreator } = useAccountType();
  return { isEntitled: subscribed === true || isPaid || isCreator };
}
