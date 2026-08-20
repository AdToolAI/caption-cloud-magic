import { tx } from "@/lib/i18nText";
import { useMemo } from "react";
import { SlideRenderer } from "@/components/post-designer/SlideRenderer";
import { useContentStudio } from "@/contexts/ContentStudioContext";

/**
 * Mitlaufende Vorschau des Entwurfs — sichtbar in jedem Schritt,
 * damit sich das Studio wie ein Werkzeug anfühlt und nicht wie ein Formular.
 */
export function LivePreview({ compact = false }: { compact?: boolean }) {
  const s = useContentStudio();
  const slide = s.design.slides[0];

  const headline = s.activeCopy?.headline ?? "";
  const subline = s.activeCopy?.subline ?? "";

  const showDesign = s.hasDesign && !!slide;

  const chips = useMemo(
    () => [s.platform, s.language.toUpperCase(), s.imageMode === "none" ? tx({ de: tx({ de: "ohne Bild", en: "without image", es: "sin imagen" }), en: "without image", es: "sin imagen" }) : tx({ de: "mit Motiv", en: "with motif", es: "con motivo" })],
    [s.imageMode, s.language, s.platform],
  );

  return (
    <div className={compact ? "space-y-3" : "sticky top-24 space-y-3"}>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span key={c} className="rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            {c}
          </span>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-3">
        {showDesign ? (
          <div className="flex justify-center">
            <SlideRenderer slide={slide} design={s.design} size={compact ? 240 : 300} />
          </div>
        ) : (
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted/40">
            {s.image ? (
              <img src={s.image} alt={tx({ de: "Motiv-Vorschau", en: "Motif preview", es: "Vista previa del motivo" })} className="h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,hsl(var(--primary)/0.12),transparent_65%)]" />
            )}
            <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-background/90 to-transparent p-4">
              <p className="font-display text-lg leading-tight">{headline || tx({ de: "Deine Headline", en: "Your headline", es: "Tu titular" })}</p>
              <p className="text-xs text-muted-foreground">{subline || tx({ de: "Die Aussage in einem Satz.", en: "The statement in one sentence.", es: "La declaración en una frase." })}</p>
            </div>
          </div>
        )}
      </div>

      {s.caption && (
        <div className="rounded-2xl border border-border/60 bg-card/40 p-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Caption</p>
          <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">{s.caption}</p>
        </div>
      )}
    </div>
  );
}

export default LivePreview;
