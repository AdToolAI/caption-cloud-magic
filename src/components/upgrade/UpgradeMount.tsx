import { useAuth } from "@/hooks/useAuth";
import { SmartUpgradeModal } from "./SmartUpgradeModal";
import { CreditThresholdWatcher } from "./CreditThresholdWatcher";
import { StreakMilestoneUpsellWatcher } from "./StreakMilestoneUpsellWatcher";
import { UsageRecommendationWatcher } from "./UsageRecommendationWatcher";

/**
 * Mounts the SmartUpgradeModal + all background trigger watchers.
 * Watchers are no-ops for unauthenticated users.
 */
export const UpgradeMount = () => {
  const { user } = useAuth();

  return (
    <>
      <SmartUpgradeModal />
      {user && (
        <>
          <CreditThresholdWatcher />
          <StreakMilestoneUpsellWatcher />
          <UsageRecommendationWatcher />
        </>
      )}
    </>
  );
};
