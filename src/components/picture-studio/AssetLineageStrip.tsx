import { tx } from "@/lib/i18nText";
import { ChevronRight } from "lucide-react";
import { useActiveAsset } from "./ActiveAssetContext";

/**
 * Non-destructive history strip: every earlier version stays selectable.
 */
export function AssetLineageStrip() {
  const { lineage, active, select } = useActiveAsset();

  if (lineage.nodes.length === 0) return null;

  const ordered = [...lineage.nodes].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-3">
      <p className="text-xs text-muted-foreground mb-2">
        {tx({ de: "Verlauf", en: "History", es: "Historial" })}
      </p>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ordered.map((node, index) => (
          <div key={node.id} className="flex items-center gap-2 shrink-0">
            {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <button
              type="button"
              onClick={() => select(node.id)}
              className={`group flex flex-col items-center gap-1 rounded-lg border p-1 transition-colors ${
                active?.id === node.id
                  ? "border-primary bg-primary/10"
                  : "border-border/50 hover:border-border"
              }`}
              title={node.label}
            >
              <img
                src={node.url}
                alt={node.label}
                loading="lazy"
                className="h-12 w-12 rounded object-cover"
              />
              <span className="max-w-[90px] truncate text-[10px] text-muted-foreground">
                {node.label}
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
