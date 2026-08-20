import { Badge } from "@/components/ui/badge";
import { tx } from "@/lib/i18nText";
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
      <span>{tx({ de: "Aktives Brand-Set:", en: "Active brand set:", es: "Conjunto de marca activo:" })} {brandName}</span>
      {isActive && <span className="h-2 w-2 rounded-full bg-success animate-pulse" />}
    </Badge>
  );
};