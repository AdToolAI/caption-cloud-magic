import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Image as ImageIcon, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ImageSourceDialog } from "@/components/post-designer/ImageSourceDialog";
import { useContentStudio } from "@/contexts/ContentStudioContext";
import { scorePairing } from "@/lib/content-studio/pairingScore";

const MODES = [
  { id: "ai" as const, label: "KI-Motiv", hint: "Aus dem Briefing" },
  { id: "own" as const, label: "Eigenes Bild", hint: "Upload / Mediathek / Stock" },
  { id: "none" as const, label: "Ohne Bild", hint: "Reine Typografie" },
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
        <h2 className="font-display text-3xl tracking-tight">Das Motiv</h2>
        <p className="text-sm text-muted-foreground">
          Motive werden bewusst textfrei erzeugt — die Typografie kommt aus dem Layout.
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
            {s.image ? "Motiv neu denken" : "Motiv erzeugen"}
          </Button>
        )}
        {s.imageMode === "own" && (
          <Button variant="outline" onClick={() => setDialog(true)}>
            <ImageIcon className="mr-2 h-4 w-4" /> Bild wählen
          </Button>
        )}
        {s.image && s.imageMode !== "none" && (
          <img src={s.image} alt="Gewähltes Motiv" className="h-16 w-16 rounded-xl object-cover ring-1 ring-border" />
        )}
      </div>

      {s.imageMode === "ai" && (
        <p className="text-[11px] text-muted-foreground">
          Die KI schreibt den Bild-Prompt selbst und erzeugt das Motiv im Picture Studio. Kosten: 1 Bild-Credit.
        </p>
      )}
      {s.imageError && <p className="text-xs text-destructive">{s.imageError}</p>}

      <div className={`rounded-2xl border p-4 ${toneClass}`}>
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bild-Text-Passung</Label>
          <span className="font-display text-lg">{verdict.score}</span>
        </div>
        <p className="mt-1 text-sm font-medium">{verdict.label}</p>
        <p className="text-xs text-muted-foreground">{verdict.hint}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={s.back}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
        </Button>
        <Button
          onClick={() => {
            s.buildLayouts();
            s.goTo("layout");
          }}
          disabled={s.imageBusy}
        >
          Layouts erzeugen <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>


      <ImageSourceDialog open={dialog} onOpenChange={setDialog} onPick={(url) => s.setUserImage(url)} />
    </motion.div>
  );
}

export default MotifStep;
