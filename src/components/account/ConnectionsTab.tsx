import { LinkedAccountsCard } from "./LinkedAccountsCard";
import { ApiKeyCard } from "./ApiKeyCard";
import { CloudStorageConnect } from "@/components/media-library/CloudStorageConnect";

export const ConnectionsTab = () => {
  return (
    <div className="space-y-6">
      <LinkedAccountsCard />
      <CloudStorageConnect />
      <ApiKeyCard />
    </div>
  );
};
