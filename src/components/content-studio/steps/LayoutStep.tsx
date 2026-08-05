import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Image as ImageIcon, Layers as LayersIcon, LayoutTemplate, Loader2, Ruler, Sparkles, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DesignCanvas } from "@/components/post-designer/DesignCanvas";
import { LayerInspector } from "@/components/post-designer/LayerInspector";
import { SlideStrip } from "@/components/post-designer/SlideStrip";
import { VariantGallery } from "@/components/post-designer/VariantGallery";
import { TemplateGallery } from "@/components/post-designer/TemplateGallery";
import { ImageSourceDialog } from "@/components/post-designer/ImageSourceDialog";
import { MOODS } from "@/lib/post-design/moods";
import { applyBrandKit, setSlideImage } from "@/lib/post-design/brand";
import { cloneSlide, uid, type ImageLayer, type TextLayer } from "@/lib/post-design/schema";
import { useContentStudio } from "@/contexts/ContentStudioContext";

export function LayoutStep() {
  const s = useContentStudio();
  const [showSafeZone, setShowSafeZone] = useState(true);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [imageDialog, setImageDialog] = useState<null | "background" | "layer">(null);

  const slide = s.design.slides[Math.min(s.activeSlide, s.design.slides.length - 1)];
  const selectedLayer = slide?.layers.find((l) => l.id === s.selectedId) ?? null;

  if (!s.hasDesign) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl tracking-tight">Wähle deine Richtung</h2>
            <p className="text-sm text-muted-foreground">
              {s.imageBusy ? "Motiv wird gerendert — die Layouts stehen schon." : "Alles bleibt danach frei editierbar."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1">
              {MOODS.map((mood) => (
                <button
                  key={mood.id}
                  type="button"
                  title={mood.label}
                  onClick={() => s.setMood(mood.id)}
                  className={
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors " +
                    (s.moodId === mood.id ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground")
                  }
                >
                  <span className="flex">
                    {mood.swatch.map((c) => (
                      <span
                        key={c}
                        className="-ml-1 h-3 w-3 rounded-full ring-1 ring-background first:ml-0"
                        style={{ background: c }}
                      />
                    ))}
                  </span>
                  {mood.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={s.moreVariants}>
              <Sparkles className="mr-1.5 h-4 w-4" /> Mehr Richtungen
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTemplateDialog(true)}>
              <LayoutTemplate className="mr-1.5 h-4 w-4" /> Alle Vorlagen
            </Button>
          </div>
        </div>

        {s.imageBusy && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Motiv wird erzeugt … es erscheint automatisch in allen Layouts.
          </div>
        )}

        <VariantGallery
          variants={s.variants}
          loading={!s.variants.length}
          imagePending={s.imageBusy}
          onPick={s.openDesign}
          onShuffle={s.shuffleVariant}
        />

        <TemplateGallery
          open={templateDialog}
          onOpenChange={setTemplateDialog}
          image={s.image}
          onApply={(next) => s.openDesign(applyBrandKit(next, s.brandKit))}
        />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-5">
      <aside className="hidden w-56 shrink-0 space-y-4 xl:block">
        <div className="rounded-xl border border-border/60 bg-card/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <LayersIcon className="h-3.5 w-3.5" /> Ebenen
          </div>
          <ScrollArea className="h-[280px] pr-2">
            <div className="space-y-1">
              {[...(slide?.layers ?? [])].reverse().map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => s.setSelectedId(layer.id)}
                  className={`w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    s.selectedId === layer.id ? "bg-primary/15 text-primary" : "hover:bg-muted/60"
                  }`}
                >
                  {layer.type === "text" || layer.type === "badge"
                    ? (layer as TextLayer).text?.slice(0, 24) || layer.type
                    : layer.type === "image" ? "Bild" : layer.type === "logo" ? "Logo" : "Form"}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="space-y-3 rounded-xl border border-border/60 bg-card/60 p-3">
          <Button variant="outline" size="sm" className="w-full" onClick={() => setTemplateDialog(true)}>
            <LayoutTemplate className="mr-1.5 h-4 w-4" /> Vorlage wechseln
          </Button>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setImageDialog("background")}>
            <ImageIcon className="mr-1.5 h-4 w-4" /> Bild tauschen
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => s.generateMotif("different camera angle, alternative composition")}
            disabled={s.imageBusy}
          >
            {s.imageBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
            Motiv neu denken
          </Button>
          <div className="flex items-center justify-between pt-1">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Ruler className="h-3.5 w-3.5" /> Sicherheitszone
            </Label>
            <Switch checked={showSafeZone} onCheckedChange={setShowSafeZone} />
          </div>
        </div>

        <Button variant="ghost" size="sm" className="w-full" onClick={() => s.openDesign(s.variants[0] ?? s.design)}>
          Andere Richtung wählen
        </Button>
      </aside>

      <section className="min-w-0 flex-1">
        <div className="flex justify-center rounded-2xl border border-border/60 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.07),transparent_60%)] p-5">
          {slide && (
            <DesignCanvas
              design={s.design}
              slide={slide}
              size={560}
              selectedId={s.selectedId}
              onSelect={s.setSelectedId}
              onLayerChange={s.changeLayer}
              onCommit={() => undefined}
              showSafeZone={showSafeZone}
              pendingImage={s.imageBusy}
            />
          )}
        </div>
        <div className="mt-3 rounded-2xl border border-border/60 bg-card/40">
          <SlideStrip
            design={s.design}
            activeIndex={s.activeSlide}
            onSelect={s.setActiveSlide}
            onAdd={() =>
              s.setDesign((p) => ({ ...p, slides: [...p.slides, cloneSlide(p.slides[p.slides.length - 1])] }))
            }
            onDuplicate={(i) =>
              s.setDesign((p) => ({
                ...p,
                slides: [...p.slides.slice(0, i + 1), cloneSlide(p.slides[i]), ...p.slides.slice(i + 1)],
              }))
            }
            onDelete={(i) =>
              s.setDesign((p) => (p.slides.length <= 1 ? p : { ...p, slides: p.slides.filter((_, idx) => idx !== i) }))
            }
            onMove={(i, dir) =>
              s.setDesign((p) => {
                const target = i + dir;
                if (target < 0 || target >= p.slides.length) return p;
                const slides = [...p.slides];
                [slides[i], slides[target]] = [slides[target], slides[i]];
                return { ...p, slides };
              })
            }
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={s.back}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
          </Button>
          <Button onClick={() => s.goTo("deliver")}>
            Weiter zum Ausspielen <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <aside className="hidden w-72 shrink-0 2xl:block">
        <div className="sticky top-24 rounded-xl border border-border/60 bg-card/60 p-4">
          <LayerInspector
            design={s.design}
            layer={selectedLayer}
            onChange={(patch) => selectedLayer && s.changeLayer(selectedLayer.id, patch)}
            onCommit={() => undefined}
            onDelete={() =>
              selectedLayer &&
              s.updateSlide(s.activeSlide, (sl) => ({
                ...sl,
                layers: sl.layers.filter((l) => l.id !== selectedLayer.id),
              }))
            }
            onDuplicate={() =>
              selectedLayer &&
              s.updateSlide(s.activeSlide, (sl) => ({
                ...sl,
                layers: [
                  ...sl.layers,
                  { ...selectedLayer, id: uid("l"), x: selectedLayer.x + 0.02, y: selectedLayer.y + 0.02 },
                ],
              }))
            }
            onReplaceImage={() => setImageDialog("layer")}
          />
        </div>
      </aside>

      <ImageSourceDialog
        open={imageDialog !== null}
        onOpenChange={(open) => setImageDialog(open ? imageDialog : null)}
        onPick={(url) => {
          if (imageDialog === "layer" && selectedLayer?.type === "image") {
            s.changeLayer(selectedLayer.id, { src: url } as Partial<ImageLayer>);
            return;
          }
          s.updateSlide(s.activeSlide, (sl) => setSlideImage(sl, url));
        }}
      />
      <TemplateGallery
        open={templateDialog}
        onOpenChange={setTemplateDialog}
        image={s.image}
        onApply={(next) => s.openDesign(applyBrandKit(next, s.brandKit))}
      />
    </motion.div>
  );
}

export default LayoutStep;
