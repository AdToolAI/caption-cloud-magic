import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  Upload,
  Download,
  RotateCcw,
  Sparkles,
  Loader2,
  ShieldCheck,
  Lock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import proofOffice from "@/assets/proof-scene-office.jpg";
import proofStudio from "@/assets/proof-scene-studio.jpg";
import proofOutdoor from "@/assets/proof-scene-outdoor.jpg";

type Style = "executive" | "creator" | "sport" | "cinematic";
type Frame = { angle: number; b64: string | null; error: string | null };

const STYLES: { id: Style; label: string; sub: string }[] = [
  { id: "executive", label: "Executive", sub: "Boardroom" },
  { id: "creator", label: "Creator", sub: "Studio" },
  { id: "sport", label: "Sport", sub: "Performance" },
  { id: "cinematic", label: "Cinematic", sub: "Editorial" },
];

const ANGLES = [-60, -30, 0, 30, 60];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const InstantAvatarDemo = () => {
  const [style, setStyle] = useState<Style>("cinematic");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [angleIdx, setAngleIdx] = useState(2); // 0° default
  const scrubberRef = useRef<HTMLDivElement>(null);

  const availableFrames = useMemo(
    () => frames.filter((f) => f.b64),
    [frames],
  );

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Foto ist zu groß (max. 8 MB).");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setSourceUrl(URL.createObjectURL(file));
    setSourceDataUrl(dataUrl);
    setFrames([]);
    setAngleIdx(2);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [], "image/png": [], "image/webp": [] },
    multiple: false,
    disabled: isLoading,
  });

  const handleGenerate = useCallback(async () => {
    if (!sourceDataUrl) {
      toast.error("Bitte zuerst ein Foto hochladen.");
      return;
    }
    setIsLoading(true);
    setFrames([]);
    try {
      const { data, error } = await supabase.functions.invoke("instant-avatar-demo", {
        body: { image: sourceDataUrl, style },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.message ?? "Generierung fehlgeschlagen.");
        return;
      }
      const received: Frame[] = data?.frames ?? [];
      if (received.filter((f) => f.b64).length === 0) {
        toast.error("Keiner der Winkel konnte generiert werden. Bitte erneut versuchen.");
        return;
      }
      setFrames(received);
      setAngleIdx(received.findIndex((f) => f.angle === 0 && f.b64) ?? 2);
      toast.success("Dein Avatar ist bereit — dreh ihn mit dem Scrubber.");
    } catch (err) {
      const msg = (err as Error)?.message ?? "Unbekannter Fehler.";
      if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
        toast.error("Demo-Kontingent erreicht. Starte kostenlos für unbegrenzte Avatare.");
      } else {
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [sourceDataUrl, style]);

  const handleReset = useCallback(() => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
    setSourceDataUrl(null);
    setFrames([]);
    setAngleIdx(2);
  }, [sourceUrl]);

  const handleDownloadCurrent = useCallback(() => {
    const f = frames[angleIdx];
    if (!f?.b64) return;
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${f.b64}`;
    link.download = `adtool-ai-avatar-${style}-${f.angle}deg.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [frames, angleIdx, style]);

  const handleDownloadZip = useCallback(async () => {
    if (availableFrames.length === 0) return;
    const zip = new JSZip();
    availableFrames.forEach((f) => {
      zip.file(`adtool-ai-avatar-${style}-${f.angle}deg.png`, f.b64!, { base64: true });
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `adtool-ai-avatar-${style}-turnaround.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [availableFrames, style]);

  // Keyboard rotation
  useEffect(() => {
    if (frames.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setAngleIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        setAngleIdx((i) => Math.min(frames.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frames.length]);

  const handleScrubberDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = scrubberRef.current;
      if (!el || frames.length === 0) return;
      el.setPointerCapture(e.pointerId);
      const update = (clientX: number) => {
        const rect = el.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const idx = Math.round(ratio * (frames.length - 1));
        // Skip empty frames — snap to nearest available
        let nearest = idx;
        for (let d = 0; d < frames.length; d++) {
          const a = Math.max(0, idx - d);
          const b = Math.min(frames.length - 1, idx + d);
          if (frames[a]?.b64) { nearest = a; break; }
          if (frames[b]?.b64) { nearest = b; break; }
        }
        setAngleIdx(nearest);
      };
      update(e.clientX);
      const onMove = (ev: PointerEvent) => update(ev.clientX);
      const onUp = () => {
        el.releasePointerCapture(e.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [frames],
  );

  const currentFrame = frames[angleIdx];
  const hasResult = availableFrames.length > 0;

  return (
    <section className="relative py-20 px-4 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <div className="container max-w-6xl mx-auto relative">
        {/* Header */}
        <div className="text-center mb-10">
          <Badge className="mb-4 bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
            <Sparkles className="w-3 h-3 mr-1.5" />
            Live-Demo · Kein Login nötig
          </Badge>
          <h2 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight mb-4">
            Werde in 10 Sekunden zum{" "}
            <span className="bg-gradient-to-r from-primary via-primary to-primary/70 bg-clip-text text-transparent">
              Cast-Mitglied
            </span>
            .
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Lade ein Foto hoch. Wir liefern dir sofort deinen eigenen AdTool-AI-Avatar
            — drehbar in 5 Winkeln, im Bond-Gold-Cinematic-Look.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* LEFT: Upload */}
          <div className="rounded-2xl border border-primary/15 bg-card/40 backdrop-blur-xl p-6 flex flex-col">
            {!sourceUrl ? (
              <div
                {...getRootProps()}
                className={cn(
                  "aspect-[3/4] w-full rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center p-8",
                  isDragActive
                    ? "border-primary bg-primary/10"
                    : "border-primary/25 hover:border-primary/50 hover:bg-primary/5",
                )}
              >
                <input {...getInputProps()} />
                <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center mb-4">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <p className="font-medium mb-1">Foto hierher ziehen oder klicken</p>
                <p className="text-sm text-muted-foreground">
                  JPG · PNG · WEBP · max. 8 MB
                </p>
              </div>
            ) : (
              <div className="aspect-[3/4] w-full rounded-xl overflow-hidden relative border border-primary/20 bg-[#050816]">
                <img
                  src={sourceUrl}
                  alt="Dein hochgeladenes Foto"
                  className="w-full h-full object-contain"
                />
                <button
                  onClick={handleReset}
                  disabled={isLoading}
                  className="absolute top-3 right-3 rounded-full bg-background/80 backdrop-blur px-3 py-1.5 text-xs font-medium hover:bg-background transition"
                >
                  Anderes Foto
                </button>
              </div>
            )}

            {/* Style chips */}
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Style wählen
              </p>
              <div className="grid grid-cols-4 gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStyle(s.id)}
                    disabled={isLoading}
                    className={cn(
                      "rounded-lg border px-2 py-2.5 text-left transition-all",
                      style === s.id
                        ? "border-primary bg-primary/10 shadow-[0_0_20px_-8px_hsl(var(--primary))]"
                        : "border-border/50 hover:border-primary/40 hover:bg-primary/5",
                    )}
                  >
                    <div className="text-xs font-semibold">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground">{s.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={!sourceDataUrl || isLoading}
              className="mt-5 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Turnaround wird gerendert...
                </>
              ) : hasResult ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Nochmal generieren
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Avatar generieren
                </>
              )}
            </Button>

            {/* Privacy */}
            <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary/70" />
              <p>
                Dein Foto wird nur zur Generierung verwendet, nach 24 h automatisch
                gelöscht. Keine Weitergabe an Dritte. 3 Versuche pro Stunde.
              </p>
            </div>
          </div>

          {/* RIGHT: Turntable */}
          <div className="rounded-2xl border border-primary/15 bg-card/40 backdrop-blur-xl p-6 flex flex-col">
            <div className="relative flex-1 min-h-[380px] rounded-xl overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 border border-primary/10 flex items-center justify-center">
              {isLoading && !hasResult ? (
                <div className="flex flex-col items-center gap-4 text-center px-6">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full border-2 border-primary/20" />
                    <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-t-primary border-r-primary/50 border-b-transparent border-l-transparent animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Wir rendern 5 Winkel parallel...</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Identity-Lock · Bond-Gold Cinematic · ~10 Sekunden
                    </p>
                  </div>
                </div>
              ) : currentFrame?.b64 ? (
                <img
                  key={angleIdx}
                  src={`data:image/png;base64,${currentFrame.b64}`}
                  alt={`Avatar Winkel ${currentFrame.angle}°`}
                  className="w-full h-full object-cover animate-fade-in"
                />
              ) : (
                <div className="text-center px-6">
                  <Sparkles className="w-10 h-10 text-primary/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    Lade links ein Foto hoch und starte die Generierung.
                  </p>
                </div>
              )}

              {/* Angle badge */}
              {currentFrame?.b64 && (
                <div className="absolute top-3 left-3 rounded-full bg-background/70 backdrop-blur px-3 py-1 text-xs font-medium border border-primary/20">
                  {currentFrame.angle > 0 ? "+" : ""}
                  {currentFrame.angle}°
                </div>
              )}
            </div>

            {/* Scrubber */}
            {hasResult && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  <span>← Ziehen zum Drehen</span>
                  <span>Pfeiltasten ↔</span>
                </div>
                <div
                  ref={scrubberRef}
                  onPointerDown={handleScrubberDown}
                  className="relative h-8 rounded-full bg-secondary/40 border border-primary/20 cursor-grab active:cursor-grabbing select-none touch-none"
                  role="slider"
                  aria-valuemin={0}
                  aria-valuemax={ANGLES.length - 1}
                  aria-valuenow={angleIdx}
                  tabIndex={0}
                >
                  {/* Ticks */}
                  {frames.map((f, i) => (
                    <div
                      key={i}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 w-1 h-4 rounded-full transition-colors",
                        f.b64 ? "bg-primary/40" : "bg-muted-foreground/20",
                      )}
                      style={{ left: `calc(${(i / (frames.length - 1)) * 100}% - 2px)` }}
                    />
                  ))}
                  {/* Handle */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary shadow-[0_0_20px_hsl(var(--primary))] transition-all"
                    style={{
                      left: `calc(${(angleIdx / (frames.length - 1)) * 100}% - 12px)`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            {hasResult && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadCurrent}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  PNG
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadZip}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Alle 5 (ZIP)
                </Button>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Reset
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Proof strip */}
        {hasResult && (
          <div className="mt-12 animate-fade-in">
            <div className="text-center mb-6">
              <p className="text-xs uppercase tracking-wider text-primary/70 mb-2">
                So könnte dein Spot aussehen
              </p>
              <h3 className="font-serif text-2xl font-semibold">
                Dein Avatar in echten AdTool-AI-Szenen
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { img: proofOffice, label: "Boardroom" },
                { img: proofStudio, label: "Studio" },
                { img: proofOutdoor, label: "Rooftop" },
              ].map((scene) => (
                <div
                  key={scene.label}
                  className="relative aspect-[4/5] rounded-xl overflow-hidden border border-primary/15 group"
                >
                  <img
                    src={scene.img}
                    alt={scene.label}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {/* Avatar overlay — small circular composite */}
                  {currentFrame?.b64 && (
                    <div className="absolute inset-0 flex items-end justify-center pb-6">
                      <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-primary shadow-[0_0_30px_hsl(var(--primary))] ring-2 ring-primary/30 bg-background">
                        <img
                          src={`data:image/png;base64,${currentFrame.b64}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                  <div className="absolute top-3 left-3 rounded-full bg-background/70 backdrop-blur px-2.5 py-1 text-[10px] font-medium border border-primary/20">
                    {scene.label}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Button
                asChild
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                <Link to="/auth">
                  In Cast &amp; World speichern
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <p className="mt-3 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary/70" />
                Beta 19,99 € · Gründerpreis 15,99 € für die ersten 1000 Nutzer
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default InstantAvatarDemo;
