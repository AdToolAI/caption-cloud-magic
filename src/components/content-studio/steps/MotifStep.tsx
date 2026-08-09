import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Image as ImageIcon, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ImageSourceDialog } from "@/components/post-designer/ImageSourceDialog";
import { useContentStudio } from "@/contexts/ContentStudioContext";
import { scorePairing } from "@/lib/content-studio/pairingScore";
import { tx } from '@/lib/i18nText';

const MODES = [
  { id: "ai" as const, label: tx({ de: "KI-Motiv", en: "AI motif", es: "Motivo IA" }), hint: tx({ de: "Aus dem Briefing", en: "From the briefing", es: "Del briefing" }) },
  { id: "own" as const, label: tx({ de: "Eigenes Bild", en: "Own picture", es: "Foto propia" }), hint: tx({ de: "Upload / Mediathek / Stock", en: "Upload / library / stock", es: "Subida / biblioteca / stock" }) },
  { id: "none" as const, label: tx({ de: "Ohne Bild", en: "Without picture", es: "Sin foto" }), hint: tx({ de: "Reine Typografie", en: "Pure typography", es: "Tipografía pura" }) },
];

export function MotifStep() {
  const s = useContentStudio();
  const [dialog, setDialog] = useState(false);

  const verdict = useMemo(
    () =>
      scorePairing({
        imagePrompt: s.copy?.imagePrompt,
        brief: s.brief,
        headline: s.activeCopy?.headline,
        subline: s.activeCopy?.subline,
        caption: s.caption,
        hasImage: s.imageMode !== "none" && !!s.image,
      }),
    [s.activeCopy, s.brief, s.caption, s.copy, s.image, s.imageMode],
  );

  const toneClass =
    verdict.tone === "good"
      ? "border-primary/50 bg-primary/10"
      : verdict.tone === "weak"
        ? "border-destructive/40 bg-destructive/5"
        : "border-border/60 bg-card/50";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-display text-3xl tracking-tight">{tx({ de: "Das Motiv", en: "The motif", es: "El motivo" })}</h2>
        <p className="text-sm text-muted-foreground">
          {tx({ de: "Motive werden bewusst textfrei erzeugt — die Typografie kommt aus dem Layout.", en: "Motifs are deliberately generated without text — the typography comes from the layout.", es: "Los motivos se generan deliberadamente sin texto: la tipografía viene del diseño." })}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              s.setImageMode(opt.id);
              if (opt.id === "none") s.setUserImage(null);
            }}
            className={
              "rounded-xl border px-3 py-2.5 text-left transition-all " +
              (s.imageMode === opt.id
                ? "border-primary/70 bg-primary/10 shadow-[0_0_30px_-14px_hsl(var(--primary)/0.8)]"
                : "border-border/60 bg-card/40 hover:border-primary/40")
            }
          >
            <span className="block text-sm font-medium">{opt.label}</span>
            <span className="block text-[11px] text-muted-foreground">{opt.hint}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {s.imageMode === "ai" && (
          <Button onClick={() => s.generateMotif()} disabled={s.imageBusy}>
            {s.imageBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {s.image ? tx({ de: "Motiv neu denken", en: "Rethink motif", es: "Repensar motivo" }) : tx({ de: "Motiv erzeugen", en: "Generate motif", es: "Generar motivo" })}
          </Button>
        )}
        {s.imageMode === "own" && (
          <Button variant="outline" onClick={() => setDialog(true)}>
            <ImageIcon className="mr-2 h-4 w-4" /> {tx({ de: "Bild wählen", en: "Choose image", es: "Elegir imagen" })}
          </Button>
        )}
        {s.image && s.imageMode !== "none" && (
          <img src={s.image} alt={tx({ de: "Gewähltes Motiv", en: "Chosen motif", es: "Motivo elegido" })} className="h-16 w-16 rounded-xl object-cover ring-1 ring-border" />
        )}
      </div>

      {s.imageMode === "ai" && (
        <p className="text-[11px] text-muted-foreground">
          {tx({ de: "Die KI schreibt den Bild-Prompt selbst und erzeugt das Motiv im Picture Studio. Kosten: 1 Bild-Credit.", en: "The AI writes the image prompt itself and generates the motif in Picture Studio. Cost: 1 image credit.", es: "La IA escribe el prompt de imagen y genera el motivo en Picture Studio. Costo: 1 crédito de imagen." })}
        </p>
      )}
      {s.imageError && <p className="text-xs text-destructive">{s.imageError}</p>}

      <div className={`rounded-2xl border p-4 ${toneClass}`}>
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">{tx({ de: "Bild-Text-Passung", en: "Image-text match", es: "Coincidencia imagen-texto" })}</Label>
          <span className="font-display text-lg">{verdict.score}</span>
        </div>
        <p className="mt-1 text-sm font-medium">{verdict.label}</p>
        <p className="text-xs text-muted-foreground">{verdict.hint}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={s.back}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {tx({ de: "Zurück", en: "Back", es: "Atrás" })}
        </Button>
        <Button
          onClick={() => {
            s.buildLayouts();
            s.goTo("layout");
          }}
          disabled={s.imageBusy}
        >
          {tx({ de: "Layouts erzeugen", en: "Generate layouts", es: "Generar diseños" })} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>


      <ImageSourceDialog open={dialog} onOpenChange={setDialog} onPick={(url) => s.setUserImage(url)} />
    </motion.div>
  );
}

export default MotifStep;
