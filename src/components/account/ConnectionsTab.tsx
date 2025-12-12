import { LinkedAccountsCard } from "./LinkedAccountsCard";
import { ApiKeyCard } from "./ApiKeyCard";

export const ConnectionsTab = () => {
  return (
    <div className="space-y-6">
      <LinkedAccountsCard />
      <ApiKeyCard />
    </div>
  );
};
