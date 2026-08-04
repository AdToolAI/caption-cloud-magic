import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Image as ImageIcon, Layers as LayersIcon, LayoutTemplate,
  Loader2, Save, Sparkles, Wand2, Ruler,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DesignCanvas } from "@/components/post-designer/DesignCanvas";
import { LayerInspector } from "@/components/post-designer/LayerInspector";
import { SlideRenderer } from "@/components/post-designer/SlideRenderer";
import { SlideStrip } from "@/components/post-designer/SlideStrip";
import { VariantGallery } from "@/components/post-designer/VariantGallery";
import { TemplateGallery } from "@/components/post-designer/TemplateGallery";
import { ImageSourceDialog } from "@/components/post-designer/ImageSourceDialog";
import { DESIGN_TEMPLATES } from "@/lib/post-design/templates";
import { applyBrandKit, setSlideImage, type BrandKitLike } from "@/lib/post-design/brand";
import { elementToPngBlob, downloadBlob, safeFileName, slidesToZip } from "@/lib/post-design/export";
import {
  CANVAS_SIZE, cloneDesign, cloneSlide, emptyDesign, uid,
  type ImageLayer, type Layer, type PostDesign, type TextLayer,
} from "@/lib/post-design/schema";

type Stage = "brief" | "variants" | "editor";

const VARIANT_TEMPLATE_IDS = ["bold-statement", "editorial-serif", "split-duo", "minimal-overlay"];

function pickVariantTemplates() {
  const picked = VARIANT_TEMPLATE_IDS
    .map((id) => DESIGN_TEMPLATES.find((t) => t.id === id))
    .filter(Boolean) as typeof DESIGN_TEMPLATES;
  if (picked.length === 4) return picked;
  const rest = DESIGN_TEMPLATES.filter((t) => !picked.includes(t));
  return [...picked, ...rest].slice(0, 4);
}

function fillCopy(design: PostDesign, copy: { headline: string; subline: string; cta: string; badge: string }) {
  const next = cloneDesign(design);
  let headlineDone = false;
  let sublineDone = false;
  next.slides[0].layers = next.slides[0].layers.map((layer) => {
    if (layer.type === "badge" && copy.badge) return { ...layer, text: copy.badge };
    if (layer.type !== "text") return layer;
    const t = layer as TextLayer;
    if (!headlineDone && t.size >= 0.06) {
      headlineDone = true;
      return { ...t, text: copy.headline || t.text };
    }
    if (!sublineDone && t.size < 0.06 && t.size >= 0.028) {
      sublineDone = true;
      return { ...t, text: copy.subline || t.text };
    }
    if (t.size < 0.028 && copy.cta) return { ...t, text: copy.cta };
    return t;
  });
  return next;
}

export default function PostDesigner() {
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>("brief");
  const [brief, setBrief] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [language, setLanguage] = useState("de");
  const [tone, setTone] = useState("selbstbewusst, klar");
  const [image, setImage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<PostDesign[]>([]);
  const [design, setDesign] = useState<PostDesign>(() => emptyDesign());
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSafeZone, setShowSafeZone] = useState(true);
  const [imageDialog, setImageDialog] = useState<null | "background" | "layer" | "brief">(null);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [brandKit, setBrandKit] = useState<BrandKitLike | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [carouselLoading, setCarouselLoading] = useState(false);
  const [designId, setDesignId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

  const exportRef = useRef<HTMLDivElement>(null);
  const [exportSlideIndex, setExportSlideIndex] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("brand_kits")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setBrandKit((data as BrandKitLike) ?? null));
  }, [user]);

  const slide = design.slides[Math.min(activeSlide, design.slides.length - 1)];
  const selectedLayer = useMemo(
    () => slide?.layers.find((l) => l.id === selectedId) ?? null,
    [slide, selectedId],
  );

  const updateSlide = useCallback(
    (index: number, updater: (s: PostDesign["slides"][number]) => PostDesign["slides"][number]) => {
      setDesign((prev) => ({
        ...prev,
        slides: prev.slides.map((s, i) => (i === index ? updater(s) : s)),
      }));
    },
    [],
  );

  const handleLayerChange = useCallback(
    (id: string, patch: Partial<Layer>) => {
      updateSlide(activeSlide, (s) => ({
        ...s,
        layers: s.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
      }));
    },
    [activeSlide, updateSlide],
  );

  const handleGenerate = async () => {
    if (!brief.trim()) {
      toast.error("Bitte kurz beschreiben, worum es geht");
      return;
    }
    setGenerating(true);
    setStage("variants");
    setVariants([]);
    try {
      const { data, error } = await supabase.functions.invoke("generate-post-design", {
        body: { brief, platform, language, tone, brandName: brandKit?.name ?? "" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const copy = data.copy as {
        headline: string; subline: string; cta: string; badge: string; caption: string;
        variants: { name: string; headline: string; subline: string }[];
      };
      setCaption(copy.caption ?? "");
      const templates = pickVariantTemplates();
      const built = templates.map((template, i) => {
        const v = copy.variants?.[i];
        const base = template.build({ image });
        const filled = fillCopy(base, {
          headline: v?.headline || copy.headline,
          subline: v?.subline || copy.subline,
          cta: copy.cta,
          badge: copy.badge,
        });
        return applyBrandKit({ ...filled, variantName: v?.name || template.name, title: copy.headline?.slice(0, 60) || "Neuer Post" }, brandKit);
      });
      setVariants(built);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generierung fehlgeschlagen");
      setStage("brief");
    } finally {
      setGenerating(false);
    }
  };

  const openDesign = (next: PostDesign) => {
    setDesign(next);
    setActiveSlide(0);
    setSelectedId(null);
    setStage("editor");
  };

  const handleAddCarouselSlides = async () => {
    setCarouselLoading(true);
    try {
      const headline = (design.slides[0].layers.find((l) => l.type === "text") as TextLayer | undefined)?.text ?? design.title;
      const { data, error } = await supabase.functions.invoke("generate-carousel-slides", {
        body: { headline, brief, language, count: 4 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const slides = (data.slides ?? []) as { title: string; text: string }[];
      if (!slides.length) throw new Error("Keine Slides erhalten");

      setDesign((prev) => ({
        ...prev,
        format: "carousel",
        slides: [
          prev.slides[0],
          ...slides.map((s) => ({
            id: uid("s"),
            background: prev.palette.background,
            layers: [
              {
                id: uid("l"), type: "text" as const, x: 0.09, y: 0.24, w: 0.82, h: 0.2,
                text: s.title, size: 0.075, weight: 700, font: "display" as const,
                color: prev.palette.text, align: "left" as const, lineHeight: 1.1, shadow: false,
              },
              {
                id: uid("l"), type: "text" as const, x: 0.09, y: 0.47, w: 0.82, h: 0.28,
                text: s.text, size: 0.04, weight: 400, font: "body" as const,
                color: prev.palette.text, align: "left" as const, lineHeight: 1.35, opacity: 0.85, shadow: false,
              },
              {
                id: uid("l"), type: "shape" as const, shape: "line" as const,
                x: 0.09, y: 0.2, w: 0.14, h: 0.006, color: prev.palette.accent,
              },
            ],
          })),
        ],
      }));
      toast.success(`${slides.length} Slides ergänzt`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Karussell fehlgeschlagen");
    } finally {
      setCarouselLoading(false);
    }
  };

  const renderSlideToBlob = async (index: number): Promise<Blob> => {
    setExportSlideIndex(index);
    await new Promise((r) => setTimeout(r, 120));
    const node = exportRef.current;
    if (!node) throw new Error("Export-Renderer nicht bereit");
    return elementToPngBlob(node);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const name = safeFileName(design.title);
      if (design.slides.length === 1) {
        const blob = await renderSlideToBlob(0);
        downloadBlob(blob, `${name}.png`);
      } else {
        const blobs: Blob[] = [];
        for (let i = 0; i < design.slides.length; i += 1) {
          blobs.push(await renderSlideToBlob(i));
        }
        downloadBlob(await slidesToZip(blobs, name), `${name}.zip`);
      }
      toast.success("Export fertig");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export fehlgeschlagen");
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        title: design.title || "Neuer Post",
        format: design.format,
        design: design as unknown as Record<string, unknown>,
        brand_kit_id: (brandKit?.id as string) ?? null,
      };
      if (designId) {
        const { error } = await supabase.from("post_designs").update(payload).eq("id", designId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("post_designs").insert(payload).select("id").single();
        if (error) throw error;
        setDesignId(data.id as string);
      }
      toast.success("Design gespeichert");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const handlePickImage = (url: string) => {
    if (imageDialog === "brief") {
      setImage(url);
      return;
    }
    if (imageDialog === "layer" && selectedLayer?.type === "image") {
      handleLayerChange(selectedLayer.id, { src: url } as Partial<ImageLayer>);
      return;
    }
    updateSlide(activeSlide, (s) => setSlideImage(s, url));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Off-screen 1080px Export-Renderer */}
      <div className="pointer-events-none fixed left-[-20000px] top-0" aria-hidden>
        <SlideRenderer
          ref={exportRef}
          slide={design.slides[Math.min(exportSlideIndex, design.slides.length - 1)]}
          design={design}
          size={CANVAS_SIZE}
        />
      </div>

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-5 py-3">
          {stage !== "brief" && (
            <Button variant="ghost" size="sm" onClick={() => setStage(stage === "editor" ? "variants" : "brief")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Zurück
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="font-display text-lg tracking-tight">Post Designer</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {stage === "editor" && (
              <>
                <Input
                  value={design.title}
                  onChange={(e) => setDesign((p) => ({ ...p, title: e.target.value }))}
                  className="hidden h-9 w-56 md:block"
                />
                <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                  Speichern
                </Button>
                <Button size="sm" onClick={handleExport} disabled={exporting}>
                  {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                  Export
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {stage === "brief" && (
        <main className="mx-auto max-w-3xl px-5 py-14">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div className="space-y-3 text-center">
              <h2 className="font-display text-4xl tracking-tight">Ein Briefing. Ein fertiger Post.</h2>
              <p className="text-muted-foreground">
                Beschreibe kurz, worum es geht — du bekommst vier professionell gesetzte Layouts, die du frei bearbeitest.
              </p>
            </div>

            <div className="space-y-5 rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur">
              <div className="space-y-2">
                <Label>Briefing</Label>
                <Textarea
                  rows={5}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="z. B. Neues Winter-Menü in unserem Café: Zimt-Cappuccino, ab Montag, 20 % für Stammgäste."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Plattform</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sprache</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="en">Englisch</SelectItem>
                      <SelectItem value="es">Spanisch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tonalität</Label>
                  <Input value={tone} onChange={(e) => setTone(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Bild (optional)</Label>
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => setImageDialog("brief")}>
                    <ImageIcon className="mr-2 h-4 w-4" /> Bild wählen
                  </Button>
                  {image && (
                    <img src={image} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  )}
                </div>
              </div>

              <Button size="lg" className="w-full" onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Layouts erzeugen
              </Button>
            </div>
          </motion.div>
        </main>
      )}

      {stage === "variants" && (
        <main className="mx-auto max-w-[1400px] px-5 py-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl tracking-tight">Wähle deine Richtung</h2>
              <p className="text-sm text-muted-foreground">Alles bleibt danach frei editierbar.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setTemplateDialog(true)}>
              <LayoutTemplate className="mr-1.5 h-4 w-4" /> Alle Vorlagen
            </Button>
          </div>
          <VariantGallery variants={variants} loading={generating} onPick={openDesign} />
        </main>
      )}

      {stage === "editor" && slide && (
        <main className="mx-auto flex max-w-[1600px] gap-5 px-5 py-5">
          <aside className="hidden w-60 shrink-0 space-y-4 lg:block">
            <div className="rounded-xl border border-border/60 bg-card/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <LayersIcon className="h-3.5 w-3.5" /> Ebenen
              </div>
              <ScrollArea className="h-[320px] pr-2">
                <div className="space-y-1">
                  {[...slide.layers].reverse().map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => setSelectedId(layer.id)}
                      className={`w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                        selectedId === layer.id ? "bg-primary/15 text-primary" : "hover:bg-muted/60"
                      }`}
                    >
                      {layer.type === "text" || layer.type === "badge"
                        ? (layer as TextLayer).text?.slice(0, 26) || layer.type
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
              <Button variant="outline" size="sm" className="w-full" onClick={handleAddCarouselSlides} disabled={carouselLoading}>
                {carouselLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                Karussell ergänzen
              </Button>
              <div className="flex items-center justify-between pt-1">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Ruler className="h-3.5 w-3.5" /> Sicherheitszone
                </Label>
                <Switch checked={showSafeZone} onCheckedChange={setShowSafeZone} />
              </div>
            </div>

            {caption && (
              <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Caption-Vorschlag</p>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">{caption}</p>
              </div>
            )}
          </aside>

          <section className="min-w-0 flex-1">
            <div className="flex justify-center rounded-2xl border border-border/60 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.07),transparent_60%)] p-6">
              <DesignCanvas
                design={design}
                slide={slide}
                size={620}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onLayerChange={handleLayerChange}
                onCommit={() => undefined}
                showSafeZone={showSafeZone}
              />
            </div>
            <div className="mt-3 rounded-2xl border border-border/60 bg-card/40">
              <SlideStrip
                design={design}
                activeIndex={activeSlide}
                onSelect={setActiveSlide}
                onAdd={() =>
                  setDesign((p) => ({ ...p, slides: [...p.slides, cloneSlide(p.slides[p.slides.length - 1])] }))
                }
                onDuplicate={(i) =>
                  setDesign((p) => ({
                    ...p,
                    slides: [...p.slides.slice(0, i + 1), cloneSlide(p.slides[i]), ...p.slides.slice(i + 1)],
                  }))
                }
                onDelete={(i) =>
                  setDesign((p) => (p.slides.length <= 1 ? p : { ...p, slides: p.slides.filter((_, idx) => idx !== i) }))
                }
                onMove={(i, dir) =>
                  setDesign((p) => {
                    const target = i + dir;
                    if (target < 0 || target >= p.slides.length) return p;
                    const slides = [...p.slides];
                    [slides[i], slides[target]] = [slides[target], slides[i]];
                    return { ...p, slides };
                  })
                }
              />
            </div>
          </section>

          <aside className="hidden w-72 shrink-0 xl:block">
            <div className="sticky top-20 rounded-xl border border-border/60 bg-card/60 p-4">
              <LayerInspector
                design={design}
                layer={selectedLayer}
                onChange={(patch) => selectedLayer && handleLayerChange(selectedLayer.id, patch)}
                onCommit={() => undefined}
                onDelete={() =>
                  selectedLayer &&
                  updateSlide(activeSlide, (s) => ({ ...s, layers: s.layers.filter((l) => l.id !== selectedLayer.id) }))
                }
                onDuplicate={() =>
                  selectedLayer &&
                  updateSlide(activeSlide, (s) => ({
                    ...s,
                    layers: [...s.layers, { ...selectedLayer, id: uid("l"), x: selectedLayer.x + 0.02, y: selectedLayer.y + 0.02 }],
                  }))
                }
                onReplaceImage={() => setImageDialog("layer")}
              />
            </div>
          </aside>
        </main>
      )}

      <ImageSourceDialog
        open={imageDialog !== null}
        onOpenChange={(open) => setImageDialog(open ? imageDialog : null)}
        onPick={handlePickImage}
      />
      <TemplateGallery
        open={templateDialog}
        onOpenChange={setTemplateDialog}
        image={image}
        onApply={(next) => openDesign(applyBrandKit(next, brandKit))}
      />
    </div>
  );
}
