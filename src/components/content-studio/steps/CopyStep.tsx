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
        <p className="text-sm text-muted-foreground">Noch keine Copy vorhanden.</p>
        <Button variant="outline" onClick={() => s.goTo("brief")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Zurück zum Briefing
        </Button>
      </div>
    );
  }


  const options = copy.variants?.length
    ? copy.variants
    : [{ name: "Vorschlag", headline: copy.headline, subline: copy.subline }];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-display text-3xl tracking-tight">{tx({ de: "Wähle die Stimme", en: "Choose the voice", es: "Elige la voz" })}</h2>
        <p className="text-sm text-muted-foreground">
          Eine Richtung auswählen — alles bleibt später frei editierbar.
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
          <Label className="text-xs text-muted-foreground">Call-to-Action</Label>
          <p className="mt-1 text-sm">{copy.cta || "—"}</p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Badge</Label>
          <p className="mt-1 text-sm">{copy.badge || "—"}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Caption für die Veröffentlichung</Label>
        <Textarea rows={5} value={s.caption} onChange={(e) => s.setCaption(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={s.back}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
        </Button>
        <Button onClick={() => s.goTo("motif")}>
          Weiter zum Motiv <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={s.generateCopy} disabled={s.copyBusy}>
          <RefreshCw className="mr-2 h-4 w-4" /> Neue Vorschläge
        </Button>
      </div>
    </motion.div>
  );
}

export default CopyStep;
