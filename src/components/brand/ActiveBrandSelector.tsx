import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Paintbrush } from "lucide-react";

interface ActiveBrandSelectorProps {
  brandKits: any[];
  activeKitId: string | null;
  onSelect: (kitId: string) => void;
}

export function ActiveBrandSelector({ brandKits, activeKitId, onSelect }: ActiveBrandSelectorProps) {
  if (brandKits.length === 0) return null;

  const activeKit = brandKits.find(kit => kit.id === activeKitId) || brandKits[0];

  return (
    <div className="flex items-center gap-3 p-3 bg-card rounded-lg border shadow-sm">
      <Paintbrush className="h-5 w-5 text-primary" />
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">Aktives Marken-Set</p>
        <Select value={activeKitId || brandKits[0]?.id} onValueChange={onSelect}>
          <SelectTrigger className="border-0 h-auto p-0 focus:ring-0 font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {brandKits.map(kit => (
              <SelectItem key={kit.id} value={kit.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border"
                    style={{ backgroundColor: kit.color_palette.primary }}
                  />
                  {kit.brand_name || "Unnamed Brand"}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Badge variant="secondary" className="text-xs">
        {activeKit?.mood}
      </Badge>
    </div>
  );
}
