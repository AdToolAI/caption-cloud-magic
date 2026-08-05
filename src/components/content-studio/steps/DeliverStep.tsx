import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CalendarPlus, Layers, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ExportActionBar } from "@/components/publishing/ExportActionBar";
import type { PublishHandoff } from "@/lib/publishHandoff";
import { SlideRenderer } from "@/components/post-designer/SlideRenderer";
import { CANVAS_SIZE } from "@/lib/post-design/schema";
import { elementToPngBlob, downloadBlob, safeFileName, slidesToZip } from "@/lib/post-design/export";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useContentStudio } from "@/contexts/ContentStudioContext";
import { generateSeries, resolveWorkspaceId, seriesToCalendar } from "@/lib/content-studio/series";

export function DeliverStep() {
  const s = useContentStudio();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportSlideIndex, setExportSlideIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const series = searchParams.get("mode") === "series";
  const [weeks, setWeeks] = useState(4);
  const [perWeek, setPerWeek] = useState(3);
  const [seriesBusy, setSeriesBusy] = useState(false);

  /** Serien-Modus in der URL halten, damit der Zustand teilbar bleibt. */
  const setSeries = (on: boolean) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (on) params.set("mode", "series");
        else params.delete("mode");
        return params;
      },
      { replace: true },
    );
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
      const name = safeFileName(s.design.title);
      if (s.design.slides.length === 1) {
        downloadBlob(await renderSlideToBlob(0), `${name}.png`);
      } else {
        const blobs: Blob[] = [];
        for (let i = 0; i < s.design.slides.length; i += 1) blobs.push(await renderSlideToBlob(i));
        downloadBlob(await slidesToZip(blobs, name), `${name}.zip`);
      }
      toast.success("Export fertig");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export fehlgeschlagen");
    } finally {
      setExporting(false);
    }
  };

  const resolvePublishHandoff = async (): Promise<PublishHandoff | null> => {
    try {
      if (!user) throw new Error("Nicht angemeldet");
      const blob = await renderSlideToBlob(0);
      const path = `${user.id}/content-studio/${safeFileName(s.design.title)}-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from("composer-uploads")
        .upload(path, blob, { cacheControl: "3600", upsert: true, contentType: "image/png" });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("composer-uploads").getPublicUrl(path);
      if (!data?.publicUrl) throw new Error("Öffentliche URL konnte nicht erstellt werden");
      return {
        mediaUrl: data.publicUrl,
        mediaType: "image",
        title: s.design.title,
        caption: s.caption,
        aspectRatio: s.design.format,
        source: "content_studio",
      };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Veröffentlichen fehlgeschlagen");
      return null;
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("post_designs").insert({
        user_id: user.id,
        title: s.design.title || "Neuer Post",
        format: s.design.format,
        design: JSON.parse(JSON.stringify(s.design)),
        brand_kit_id: (s.brandKit?.id as string) ?? null,
      });
      if (error) throw error;
      toast.success("Als Vorlage gesichert");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const handleSeries = async () => {
    if (!user) return;
    setSeriesBusy(true);
    try {
      const result = await generateSeries({
        brief: s.brief,
        platform: s.platform,
        language: s.language,
        tone: s.tone,
        weeks,
        postsPerWeek: perWeek,
      });
      toast.success(`Serie "${result.title}" mit ${result.postsCreated} Beiträgen erstellt`);
      const workspaceId = await resolveWorkspaceId(user.id);
      if (workspaceId) {
        const events = await seriesToCalendar(result.campaignId, workspaceId);
        toast.success(`${events} Termine im Kalender eingeplant`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Serie fehlgeschlagen");
    } finally {
      setSeriesBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="pointer-events-none fixed left-[-20000px] top-0" aria-hidden>
        <SlideRenderer
          ref={exportRef}
          slide={s.design.slides[Math.min(exportSlideIndex, s.design.slides.length - 1)]}
          design={s.design}
          size={CANVAS_SIZE}
        />
      </div>

      <div className="space-y-2">
        <h2 className="font-display text-3xl tracking-tight">Ausspielen</h2>
        <p className="text-sm text-muted-foreground">Ein Beitrag — oder gleich eine ganze Serie aus demselben Briefing.</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-border/60 bg-card/60 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={s.design.title}
            onChange={(e) => s.setDesign((p) => ({ ...p, title: e.target.value }))}
            className="h-9 w-full sm:w-64"
            placeholder="Titel"
          />
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Als Vorlage sichern
          </Button>
          <ExportActionBar size="sm" downloading={exporting} onDownload={handleExport} resolveHandoff={resolvePublishHandoff} />
        </div>

        <div className="space-y-2">
          <Label>Caption</Label>
          <Textarea rows={4} value={s.caption} onChange={(e) => s.setCaption(e.target.value)} />
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border/60 bg-card/60 p-5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-primary" /> Serie statt Einzelpost
            </Label>
            <p className="text-xs text-muted-foreground">
              Aus demselben Briefing entsteht eine Kampagne mit Terminvorschlägen.
            </p>
          </div>
          <Switch checked={series} onCheckedChange={setSeries} />
        </div>

        {series && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Wochen</Label>
              <Input type="number" min={1} max={12} value={weeks} onChange={(e) => setWeeks(Number(e.target.value) || 1)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beiträge pro Woche</Label>
              <Input type="number" min={1} max={7} value={perWeek} onChange={(e) => setPerWeek(Number(e.target.value) || 1)} />
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={handleSeries} disabled={seriesBusy}>
                {seriesBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
                Serie erzeugen & einplanen
              </Button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default DeliverStep;
