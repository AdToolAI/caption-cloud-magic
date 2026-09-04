import { tx } from "@/lib/i18nText";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Upload, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAIVideoWallet } from "@/hooks/useAIVideoWallet";
import { useImageUpscaler, type UpscaleFactor } from "@/hooks/useImageUpscaler";
import {
  modelsWithCapability,
  pickLocalized,
  type PictureCapability,
  type PictureModelDefinition,
} from "@/config/pictureModels";
import { ENABLED_PICTURE_FLAGS } from "@/config/pictureModels/flags";
import { estimatePrice, formatDimensions } from "@/lib/pictureModels/pricing";
import { useTranslation } from "@/hooks/useTranslation";
import { useActiveAsset } from "./ActiveAssetContext";
import { BeforeAfterCanvas } from "./BeforeAfterCanvas";
import { AssetLineageStrip } from "./AssetLineageStrip";

type EnhanceTask = "upscale" | "restore" | "colorize";

const TASK_CAPABILITY: Record<EnhanceTask, PictureCapability> = {
  upscale: "upscale",
  restore: "restore",
  colorize: "colorize",
};

export function EnhancePanel() {
  const { language } = useTranslation();
  const { wallet } = useAIVideoWallet();
  const { upscale, isUpscaling } = useImageUpscaler();
  const { active, push } = useActiveAsset();

  const [task, setTask] = useState<EnhanceTask>("upscale");
  const [modelId, setModelId] = useState<string>("clarity-pro");
  const [scale, setScale] = useState<number>(2);
  const [presetId, setPresetId] = useState<string>("balanced");
  const [creativity, setCreativity] = useState<number>(0);
  const [faceEnhancement, setFaceEnhancement] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const currencySymbol = (wallet?.currency || "EUR") === "USD" ? "$" : "€";

  const models = useMemo(
    () => modelsWithCapability(TASK_CAPABILITY[task], { enabledFlags: ENABLED_PICTURE_FLAGS }),
    [task],
  );

  useEffect(() => {
    if (models.length && !models.some((m) => m.id === modelId)) {
      setModelId(models[0].id);
    }
  }, [models, modelId]);

  // Active asset from Generate / Edit flows into Enhance — no re-upload.
  useEffect(() => {
    if (active?.url) {
      setSourceUrl(active.url);
      setResultUrl(null);
      if (active.width && active.height) setSourceSize({ width: active.width, height: active.height });
    }
  }, [active?.id]);

  useEffect(() => {
    if (!sourceUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setSourceSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = sourceUrl;
  }, [sourceUrl]);

  const model = models.find((m) => m.id === modelId);
  const maxScale = model?.supportedScales?.[model.supportedScales.length - 1] ?? 2;

  useEffect(() => {
    if (model?.supportedScales && !model.supportedScales.includes(scale)) {
      setScale(model.supportedScales[0]);
    }
  }, [model, scale]);

  const estimate = useMemo(
    () =>
      estimatePrice({
        modelId,
        inputWidth: sourceSize?.width,
        inputHeight: sourceSize?.height,
        scale,
      }),
    [modelId, sourceSize, scale],
  );

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(tx({ de: "Bitte einloggen", en: "Please log in", es: "Por favor inicia sesión" }));
        return;
      }
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/picture-studio/sources/enh-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("background-projects")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("background-projects").getPublicUrl(path);
      setSourceUrl(pub.publicUrl);
      setResultUrl(null);
      push({
        id: `upload-${Date.now()}`,
        kind: "upload",
        url: pub.publicUrl,
        label: tx({ de: "Original", en: "Original", es: "Original" }),
        parentId: null,
      });
    } catch (err: any) {
      toast.error(err?.message || tx({ de: "Upload fehlgeschlagen", en: "Upload failed", es: "Error al cargar" }));
    } finally {
      setUploading(false);
    }
  };

  const handleRun = async () => {
    if (!sourceUrl) {
      toast.error(tx({ de: "Bitte zuerst ein Bild wählen", en: "Please pick an image first", es: "Elige una imagen primero" }));
      return;
    }
    if (!model) return;
    if (model.id !== "clarity-pro") {
      toast.info(
        tx({
          de: `${model.name} wird nach dem Abschluss der Qualitäts- und Kostentests freigeschaltet.`,
          en: `${model.name} unlocks once the cost and quality tests are finished.`,
          es: `${model.name} se activará cuando terminen las pruebas de coste y calidad.`,
        }),
      );
      return;
    }
    const result = await upscale({
      imageUrl: sourceUrl,
      factor: scale as UpscaleFactor,
    });
    if (result?.url) {
      setResultUrl(result.url);
      push({
        id: result.id || `enhance-${Date.now()}`,
        kind: "enhance",
        url: result.url,
        label: `${model.name} ${scale}×`,
        modelId: model.id,
      });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr]">
      {/* Left: input + controls */}
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-border/50 bg-muted/30 p-1">
          {(["upscale", "restore", "colorize"] as EnhanceTask[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTask(t)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                task === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "upscale"
                ? tx({ de: "Upscale", en: "Upscale", es: "Ampliar" })
                : t === "restore"
                  ? tx({ de: "Restaurieren", en: "Restore", es: "Restaurar" })
                  : tx({ de: "Kolorieren", en: "Colorize", es: "Colorear" })}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {models.map((m: PictureModelDefinition) => {
            const selected = m.id === modelId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModelId(m.id)}
                className={`w-full rounded-xl border p-3 text-left transition-all ${
                  selected ? "border-primary bg-primary/10" : "border-border/50 hover:border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{m.name}</span>
                  {m.badges?.[0] && (
                    <Badge variant="outline" className="text-[10px]">
                      {pickLocalized(m.badges[0], language)}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pickLocalized(m.description, language)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {m.bestFor.map((b) => pickLocalized(b, language)).join(" · ")}
                </p>
                {!m.enabled && (
                  <Badge variant="secondary" className="mt-2 text-[10px]">
                    {tx({ de: "Bald verfügbar", en: "Coming soon", es: "Próximamente" })}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        {task === "upscale" && model?.supportedScales && (
          <div className="space-y-2">
            <Label>{tx({ de: "Faktor", en: "Scale", es: "Factor" })}</Label>
            <div className="flex gap-2">
              {model.supportedScales.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={scale === s ? "default" : "outline"}
                  onClick={() => setScale(s)}
                >
                  {s}×
                </Button>
              ))}
            </div>
            {sourceSize && (
              <p className="text-xs text-muted-foreground">
                {formatDimensions(sourceSize.width, sourceSize.height)} →{" "}
                {formatDimensions(sourceSize.width * scale, sourceSize.height * scale)}
              </p>
            )}
          </div>
        )}

        {model?.presets && (
          <div className="space-y-2">
            <Label>
              {model.id === "topaz-image-upscale"
                ? tx({ de: "Enhance-Modell", en: "Enhance model", es: "Modelo de mejora" })
                : tx({ de: "Voreinstellung", en: "Preset", es: "Preajuste" })}
            </Label>
            <div className="flex flex-wrap gap-2">
              {model.presets.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={presetId === p.id ? "default" : "outline"}
                  onClick={() => setPresetId(p.id)}
                >
                  {pickLocalized(p.label, language)}
                </Button>
              ))}
            </div>
          </div>
        )}

        {model?.id === "clarity-pro" && (
          <div className="space-y-2">
            <Label>
              {tx({ de: "Detail-Kreativität", en: "Detail creativity", es: "Creatividad del detalle" })}{" "}
              <span className="text-muted-foreground">({creativity})</span>
            </Label>
            <Slider
              min={-10}
              max={10}
              step={1}
              value={[creativity]}
              onValueChange={(v) => setCreativity(v[0])}
            />
            <p className="text-[11px] text-muted-foreground">
              {tx({
                de: "Negative Werte bewahren das Original, positive erfinden Details.",
                en: "Negative values preserve the original, positive values invent detail.",
                es: "Los valores negativos conservan el original; los positivos inventan detalle.",
              })}
            </p>
          </div>
        )}

        {model?.capabilities.includes("face_enhance") && (
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <Label className="text-sm">
              {tx({ de: "Gesichts-Verbesserung", en: "Face enhancement", es: "Mejora de rostros" })}
            </Label>
            <Switch checked={faceEnhancement} onCheckedChange={setFaceEnhancement} />
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {tx({ de: "Bild hochladen", en: "Upload image", es: "Subir imagen" })}
        </Button>
      </div>

      {/* Right: canvas + inspector */}
      <div className="space-y-4">
        {sourceUrl ? (
          <BeforeAfterCanvas originalUrl={sourceUrl} resultUrl={resultUrl} busy={isUpscaling} />
        ) : (
          <Card className="border-dashed border-border/60">
            <CardContent className="flex h-64 flex-col items-center justify-center gap-2 text-center">
              <Sparkles className="h-6 w-6 text-primary" />
              <p className="text-sm text-muted-foreground">
                {tx({
                  de: "Lade ein Bild hoch oder nutze das zuletzt erzeugte Bild aus Generate.",
                  en: "Upload an image or continue with your latest Generate result.",
                  es: "Sube una imagen o continúa con tu último resultado de Generate.",
                })}
              </p>
            </CardContent>
          </Card>
        )}

        <AssetLineageStrip />

        <Card className="border-border/50">
          <CardContent className="space-y-2 p-4 text-sm">
            <Row
              label={tx({ de: "Modell", en: "Model", es: "Modelo" })}
              value={model?.name ?? "—"}
            />
            {estimate?.outputWidth && (
              <Row
                label={tx({ de: "Ausgabe", en: "Output", es: "Salida" })}
                value={`${formatDimensions(estimate.outputWidth, estimate.outputHeight)} · ${(estimate.outputMegapixels ?? 0).toFixed(1)} MP`}
              />
            )}
            <Row
              label={tx({ de: "Preis", en: "Price", es: "Precio" })}
              value={estimate ? `${currencySymbol}${estimate.sellEUR.toFixed(2)}` : "—"}
            />
            <Row
              label={tx({ de: "Typische Dauer", en: "Typical processing time", es: "Duración típica" })}
              value={
                model?.typicalProcessingSeconds
                  ? `~${model.typicalProcessingSeconds[0]}–${model.typicalProcessingSeconds[1]} sec`
                  : "—"
              }
            />
            <Button className="w-full" onClick={handleRun} disabled={isUpscaling || !sourceUrl}>
              {isUpscaling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              {tx({ de: "Bild verbessern", en: "Enhance image", es: "Mejorar imagen" })}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
