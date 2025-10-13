import { Badge } from "@/components/ui/badge";
import { Palette } from "lucide-react";

interface BrandSyncBadgeProps {
  brandName?: string;
  isActive?: boolean;
}

export const BrandSyncBadge = ({ brandName, isActive }: BrandSyncBadgeProps) => {
  if (!brandName) return null;

  return (
    <Badge 
      variant={isActive ? "default" : "secondary"} 
      className="gap-2 px-3 py-1"
    >
      <Palette className="h-3 w-3" />
      <span>Aktives Brand-Set: {brandName}</span>
      {isActive && <span className="h-2 w-2 rounded-full bg-success animate-pulse" />}
    </Badge>
  );
};