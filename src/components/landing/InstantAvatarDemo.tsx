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

// Cinematic camera-viewfinder corner ticks
const CornerTicks = () => (
  <>
    <span className="pointer-events-none absolute top-2 left-2 w-3 h-3 border-t border-l border-primary/60" />
    <span className="pointer-events-none absolute top-2 right-2 w-3 h-3 border-t border-r border-primary/60" />
    <span className="pointer-events-none absolute bottom-2 left-2 w-3 h-3 border-b border-l border-primary/60" />
    <span className="pointer-events-none absolute bottom-2 right-2 w-3 h-3 border-b border-r border-primary/60" />
  </>
);

// SVG film-grain noise overlay
const GrainOverlay = () => (
  <div
    className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
    }}
  />
);

export const InstantAvatarDemo = () => {
  const [style, setStyle] = useState<Style>("cinematic");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [angleIdx, setAngleIdx] = useState(2);
  const [sweep, setSweep] = useState(false);
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
      setSweep(true);
      window.setTimeout(() => setSweep(false), 1300);
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
  const handlePct = frames.length > 1 ? (angleIdx / (frames.length - 1)) * 100 : 50;
  const parallax = currentFrame ? (currentFrame.angle / 60) * 4 : 0;

  return (
    <section className="relative py-12 md:py-16 px-4 overflow-hidden">
      {/* Ambient Gold Aurora */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[720px] h-[420px] rounded-full bg-primary/15 blur-[120px] animate-pulse-slow" />
        <div className="absolute top-1/2 right-[15%] w-[380px] h-[380px] rounded-full bg-primary/10 blur-[100px] animate-pulse-slow [animation-delay:2s]" />
      </div>

      <div className="container max-w-5xl mx-auto relative">
        {/* Header */}
        <div className="text-center mb-8">
          <Badge className="mb-3 bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
            <Sparkles className="w-3 h-3 mr-1.5" />
            Live · 10 s · Kein Login
          </Badge>
          <h2 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight mb-3">
            Werde in 10 Sekunden zum{" "}
            <span className="bg-gradient-to-r from-primary via-primary to-primary/70 bg-clip-text text-transparent">
              Cast-Mitglied
            </span>
            .
          </h2>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            Foto hoch, Style wählen, in 5 Winkeln drehen — im Bond-Gold-Cinematic-Look.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* LEFT: Upload */}
          <div className="rounded-2xl border border-primary/15 bg-card/40 backdrop-blur-xl p-5 flex flex-col">
            {!sourceUrl ? (
              <div
                {...getRootProps()}
                className={cn(
                  "relative aspect-[4/5] max-h-[520px] w-full rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center p-6",
                  isDragActive
                    ? "border-primary bg-primary/10"
                    : "border-primary/25 hover:border-primary/50 hover:bg-primary/5",
                )}
              >
                <CornerTicks />
                <input {...getInputProps()} />
                <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mb-3">
                  <Upload className="w-5 h-5 text-primary" />
                </div>
                <p className="font-medium text-sm mb-1">Foto hierher ziehen oder klicken</p>
                <p className="text-xs text-muted-foreground">
                  JPG · PNG · WEBP · max. 8 MB
                </p>
              </div>
            ) : (
              <div className="relative aspect-[4/5] max-h-[520px] w-full rounded-xl overflow-hidden border border-primary/20 bg-[#050816]">
                <CornerTicks />
                <img
                  src={sourceUrl}
                  alt="Dein hochgeladenes Foto"
                  className="w-full h-full object-contain"
                />
                <button
                  onClick={handleReset}
                  disabled={isLoading}
                  className="absolute top-3 right-3 z-10 rounded-full bg-background/80 backdrop-blur px-3 py-1.5 text-xs font-medium hover:bg-background transition"
                >
                  Anderes Foto
                </button>
              </div>
            )}

            {/* Style chips — clapper-board buttons */}
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Style
              </p>
              <div className="grid grid-cols-4 gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStyle(s.id)}
                    disabled={isLoading}
                    className={cn(
                      "relative rounded-lg border px-2 py-2 text-left transition-all overflow-hidden",
                      style === s.id
                        ? "border-primary/60 bg-primary/10 shadow-[inset_0_1px_0_hsl(var(--primary)),_0_0_20px_-10px_hsl(var(--primary))]"
                        : "border-border/50 hover:border-primary/40 hover:bg-primary/5",
                    )}
                  >
                    {style === s.id && (
                      <span className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent" />
                    )}
                    <div className="text-xs font-semibold">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground">{s.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={!sourceDataUrl || isLoading}
              className="mt-4 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
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

            <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
              <Lock className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary/70" />
              <p>
                Foto nur zur Generierung, nach 24 h automatisch gelöscht. Keine
                Weitergabe. 3 Versuche pro Stunde.
              </p>
            </div>
          </div>

          {/* RIGHT: Turntable */}
          <div className="rounded-2xl border border-primary/15 bg-card/40 backdrop-blur-xl p-5 flex flex-col">
            <div
              className={cn(
                "relative aspect-[4/5] max-h-[520px] w-full rounded-xl overflow-hidden bg-[#050816] border border-primary/20 flex items-center justify-center",
                "ring-1 ring-primary/10 ring-offset-2 ring-offset-background",
              )}
            >
              <CornerTicks />

              {isLoading && !hasResult ? (
                <div className="flex flex-col items-center gap-4 text-center px-6">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-2 border-primary/20" />
                    <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-t-primary border-r-primary/50 border-b-transparent border-l-transparent animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">5 Winkel werden parallel gerendert...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Identity-Lock · Bond-Gold Cinematic
                    </p>
                  </div>
                </div>
              ) : currentFrame?.b64 ? (
                <>
                  <img
                    key={angleIdx}
                    src={`data:image/png;base64,${currentFrame.b64}`}
                    alt={`Avatar Winkel ${currentFrame.angle}°`}
                    className="w-full h-full object-contain animate-fade-in transition-transform duration-200"
                    style={{ transform: `translateX(${parallax}px)` }}
                  />
                  <GrainOverlay />
                  {/* Scanline sweep once */}
                  {sweep && (
                    <span className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-primary/25 to-transparent animate-scanline" />
                  )}
                  {/* Vignette */}
                  <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55)_100%)]" />
                  {/* HUD top-right */}
                  <div className="pointer-events-none absolute top-3 right-3 text-right font-mono text-[9px] tracking-widest text-primary/80 space-y-0.5">
                    <div>IDENTITY LOCK · 98%</div>
                    <div>STYLE · {style.toUpperCase()}</div>
                    <div>ANGLE · {currentFrame.angle > 0 ? "+" : ""}{currentFrame.angle}°</div>
                  </div>
                  {/* Wordmark bottom */}
                  <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center font-mono text-[9px] tracking-[0.35em] text-primary/45">
                    POWERED BY ADTOOL AI
                  </div>
                </>
              ) : (
                <div className="text-center px-6">
                  <Sparkles className="w-8 h-8 text-primary/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Lade links ein Foto hoch und starte die Generierung.
                  </p>
                </div>
              )}
            </div>

            {/* Iris Scrubber */}
            {hasResult && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
                  <span>← Ziehen</span>
                  <span>Pfeiltasten ↔</span>
                </div>
                <div
                  ref={scrubberRef}
                  onPointerDown={handleScrubberDown}
                  className="relative h-8 cursor-grab active:cursor-grabbing select-none touch-none"
                  role="slider"
                  aria-valuemin={0}
                  aria-valuemax={ANGLES.length - 1}
                  aria-valuenow={angleIdx}
                  tabIndex={0}
                >
                  {/* Gold line */}
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-gradient-to-r from-primary/10 via-primary/60 to-primary/10" />
                  {/* Notches */}
                  {frames.map((f, i) => (
                    <div
                      key={i}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 w-[2px] h-3 rounded-full",
                        f.b64 ? "bg-primary/70" : "bg-muted-foreground/25",
                      )}
                      style={{ left: `calc(${(i / (frames.length - 1)) * 100}% - 1px)` }}
                    />
                  ))}
                  {/* Diamond handle + label */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2"
                    style={{ left: `calc(${handlePct}% - 10px)` }}
                  >
                    <div className="relative w-5 h-5 rotate-45 bg-primary shadow-[0_0_18px_hsl(var(--primary))] rounded-[3px]">
                      <span className="absolute inset-[-6px] rounded-md border border-primary/40 animate-pulse-slow" />
                    </div>
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-widest text-primary whitespace-nowrap">
                      {currentFrame && currentFrame.angle > 0 ? "+" : ""}
                      {currentFrame?.angle ?? 0}°
                    </div>
                  </div>
                </div>
              </div>
            )}

            {hasResult && (
              <div className="mt-8 grid grid-cols-3 gap-2">
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

        {/* Proof strip — Bento 2-1 */}
        {hasResult && (
          <div className="mt-10 animate-fade-in">
            <div className="text-center mb-5">
              <p className="text-[10px] uppercase tracking-[0.3em] text-primary/70 mb-1">
                So könnte dein Spot aussehen
              </p>
              <h3 className="font-serif text-xl md:text-2xl font-semibold">
                Dein Avatar in echten AdTool-AI-Szenen
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[320px]">
              {/* Hero left */}
              <ProofCard
                img={proofOffice}
                label="Boardroom"
                avatarB64={currentFrame?.b64 ?? null}
                className="md:col-span-2 md:row-span-2 aspect-[16/10] md:aspect-auto md:h-full"
              />
              <ProofCard
                img={proofStudio}
                label="Studio"
                avatarB64={currentFrame?.b64 ?? null}
                className="aspect-[16/10] md:aspect-auto md:h-full"
              />
              <ProofCard
                img={proofOutdoor}
                label="Rooftop"
                avatarB64={currentFrame?.b64 ?? null}
                className="aspect-[16/10] md:aspect-auto md:h-full"
              />
            </div>
            <div className="mt-6 text-center">
              <Button
                asChild
                size="lg"
                className="group bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                <Link to="/auth">
                  In Cast &amp; World speichern
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <p className="mt-3 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary/70" />
                Beta 14,99 € · Gründerpreis 15,99 € für die ersten 1000 Nutzer
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const ProofCard = ({
  img,
  label,
  avatarB64,
  className,
}: {
  img: string;
  label: string;
  avatarB64: string | null;
  className?: string;
}) => (
  <div
    className={cn(
      "relative rounded-xl overflow-hidden border border-primary/15 group min-h-[160px]",
      className,
    )}
  >
    <img
      src={img}
      alt={label}
      loading="lazy"
      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
    />
    <CornerTicks />
    {avatarB64 && (
      <div className="absolute inset-0 flex items-end justify-center pb-5">
        <div className="w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden border-2 border-primary shadow-[0_0_28px_hsl(var(--primary))] ring-2 ring-primary/25 bg-background">
          <img
            src={`data:image/png;base64,${avatarB64}`}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    )}
    <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.5)_100%)]" />
    <div className="absolute top-3 left-3 rounded-full bg-background/70 backdrop-blur px-2.5 py-1 text-[10px] font-mono tracking-widest border border-primary/20">
      {label.toUpperCase()}
    </div>
    <div className="absolute bottom-3 left-3 right-3 h-[1px] bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
  </div>
);

export default InstantAvatarDemo;
