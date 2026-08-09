import { tx } from "@/lib/i18nText";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useContentStudio } from "@/contexts/ContentStudioContext";

export function CopyStep() {
  const s = useContentStudio();
  const copy = s.copy;

  if (!copy) {
    return (
      <div className="space-y-4 rounded-2xl border border-border/60 bg-card/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">{tx({ de: "Noch keine Copy vorhanden.", en: "No copy yet.", es: "Aún no hay texto." })}</p>
        <Button variant="outline" onClick={() => s.goTo("brief")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {tx({ de: "Zurück zum Briefing", en: "Back to briefing", es: "Volver al briefing" })}
        </Button>
      </div>
    );
  }


  const options = copy.variants?.length
    ? copy.variants
    : [{ name: tx({ de: "Vorschlag", en: "Suggestion", es: "Sugerencia" }), headline: copy.headline, subline: copy.subline }];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-display text-3xl tracking-tight">{tx({ de: "Wähle die Stimme", en: "Choose the voice", es: "Elige la voz" })}</h2>
        <p className="text-sm text-muted-foreground">
          {tx({ de: "Eine Richtung auswählen — alles bleibt später frei editierbar.", en: "Choose a direction — everything remains freely editable later.", es: "Elige una dirección — todo permanece libremente editable más tarde." })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((v, i) => {
          const active = i === s.copyIndex;
          return (
            <button
              key={`${v.name}-${i}`}
              type="button"
              onClick={() => s.setCopyIndex(i)}
              className={
                "rounded-2xl border p-4 text-left transition-all " +
                (active
                  ? "border-primary/70 bg-primary/10 shadow-[0_0_40px_-18px_hsl(var(--primary)/0.9)]"
                  : "border-border/60 bg-card/50 hover:border-primary/40")
              }
            >
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                {v.name}
                {active && <Check className="h-3.5 w-3.5 text-primary" />}
              </div>
              <p className="font-display text-lg leading-tight">{v.headline}</p>
              <p className="mt-1 text-sm text-muted-foreground">{v.subline}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 rounded-2xl border border-border/60 bg-card/50 p-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">{tx({ de: "Call-to-Action", en: "Call-to-Action", es: "Llamada a la acción" })}</Label>
          <p className="mt-1 text-sm">{copy.cta || "—"}</p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{tx({ de: "Badge", en: "Badge", es: "Insignia" })}</Label>
          <p className="mt-1 text-sm">{copy.badge || "—"}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{tx({ de: "Caption für die Veröffentlichung", en: "Caption for publishing", es: "Leyenda para publicar" })}</Label>
        <Textarea rows={5} value={s.caption} onChange={(e) => s.setCaption(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={s.back}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {tx({ de: "Zurück", en: "Back", es: "Atrás" })}
        </Button>
        <Button onClick={() => s.goTo("motif")}>
          {tx({ de: "Weiter zum Motiv", en: "Continue to motif", es: "Continuar al motivo" })} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={s.generateCopy} disabled={s.copyBusy}>
          <RefreshCw className="mr-2 h-4 w-4" /> {tx({ de: "Neue Vorschläge", en: "New suggestions", es: "Nuevas sugerencias" })}
        </Button>
      </div>
    </motion.div>
  );
}

export default CopyStep;
