import { motion } from "framer-motion";
import { Shield, Palette, Type } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandVaultProps {
  brandKit: any | null;
  className?: string;
}

/**
 * BrandVault — sticky "Brand at a Glance" Glass-Bar.
 * Zeigt das aktive Brand-Kit immer sichtbar, damit alle weiteren Aktionen
 * (Generate, Edit, Asset Factory) im Brand-Kontext stattfinden.
 */
export function BrandVault({ brandKit, className }: BrandVaultProps) {
  if (!brandKit) return null;

  const palette: string[] = [
    brandKit.primary_color,
    brandKit.color_palette?.secondary,
    brandKit.color_palette?.accent,
    ...(brandKit.color_palette?.neutrals ?? []),
  ].filter(Boolean).slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "sticky top-4 z-30 mb-6 rounded-2xl border border-white/10",
        "bg-gradient-to-r from-background/70 via-card/70 to-background/70",
        "backdrop-blur-2xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]",
        className,
      )}
    >
      <div className="flex items-center gap-4 px-5 py-3">
        {/* Lock badge */}
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1">
          <Shield className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            Vault
          </span>
        </div>

        {/* Logo */}
        {brandKit.logo_url ? (
          <img
            src={brandKit.logo_url}
            alt={brandKit.brand_name}
            className="h-9 w-9 rounded-lg border border-white/10 object-cover bg-background/60"
          />
        ) : (
          <div
            className="h-9 w-9 rounded-lg border border-white/10"
            style={{ background: brandKit.primary_color || "#6366F1" }}
          />
        )}

        {/* Name + mood */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{brandKit.brand_name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {brandKit.mood ?? "—"} · {brandKit.brand_tone ?? "—"}
          </div>
        </div>

        {/* Palette */}
        <div className="hidden md:flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="flex -space-x-1">
            {palette.map((c, i) => (
              <span
                key={c + i}
                className="inline-block h-5 w-5 rounded-full border border-background ring-1 ring-white/10"
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* Fonts */}
        {brandKit.font_pairing?.headline && (
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Type className="h-3.5 w-3.5" />
            <span className="font-medium">{brandKit.font_pairing.headline}</span>
            <span className="opacity-50">/</span>
            <span>{brandKit.font_pairing.body}</span>
          </div>
        )}

        {/* Consistency score */}
        {typeof brandKit.consistency_score === "number" && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/10 bg-background/40 px-2.5 py-1">
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-background/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                style={{ width: `${Math.max(0, Math.min(100, brandKit.consistency_score))}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold tabular-nums">
              {brandKit.consistency_score}%
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
