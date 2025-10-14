import { ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";

interface CalendarHeaderProps {
  workspaceId: string | null;
  clientId: string | null;
  brandId: string | null;
  onWorkspaceChange: (id: string) => void;
  onClientChange: (id: string) => void;
  onBrandChange: (id: string) => void;
  workspaces: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
}

export function CalendarHeader({
  workspaceId,
  clientId,
  brandId,
  onWorkspaceChange,
  onClientChange,
  onBrandChange,
  workspaces,
  clients,
  brands,
}: CalendarHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-muted/50 rounded-lg">
      <Select value={workspaceId || undefined} onValueChange={onWorkspaceChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t("calendar.selectWorkspace")} />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>
              {workspace.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ChevronRight className="w-4 h-4 text-muted-foreground" />

      <Select value={clientId || undefined} onValueChange={onClientChange} disabled={!workspaceId}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t("calendar.selectClient")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("calendar.allClients")}</SelectItem>
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ChevronRight className="w-4 h-4 text-muted-foreground" />

      <Select value={brandId || undefined} onValueChange={onBrandChange} disabled={!workspaceId}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t("calendar.selectBrand")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("calendar.allBrands")}</SelectItem>
          {brands.map((brand) => (
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}