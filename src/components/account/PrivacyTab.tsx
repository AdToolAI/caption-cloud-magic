import { CookieSettings } from "./CookieSettings";
import { ActivityDataCard } from "./ActivityDataCard";

export const PrivacyTab = () => {
  return (
    <div className="space-y-6">
      <CookieSettings />
      <ActivityDataCard />
    </div>
  );
};
