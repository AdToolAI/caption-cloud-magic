import { tx } from "@/lib/i18nText";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, Sparkles, Wand2, Download, GitCompare, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAIVideoWallet } from "@/hooks/useAIVideoWallet";
import { useEnhanceImage, type EnhanceResult } from "@/hooks/useEnhanceImage";
import {
  defaultControlValues,
  modelsWithCapability,
  pickLocalized,
  type PictureCapability,
  type PictureModelDefinition,
} from "@/config/pictureModels";
import { ENABLED_PICTURE_FLAGS } from "@/config/pictureModels/flags";
import { estimatePrice, formatDimensions } from "@/lib/pictureModels/pricing";
import { resolveTopazEnhanceModel } from "@/lib/pictureModels/adapters/topazImageUpscale";
import { useTranslation } from "@/hooks/useTranslation";
import { useActiveAsset } from "./ActiveAssetContext";
import { BeforeAfterCanvas } from "./BeforeAfterCanvas";
import { AssetLineageStrip } from "./AssetLineageStrip";
import { ModelControls } from "./ModelControls";

type EnhanceTask = "upscale" | "restore" | "colorize";

const TASK_CAPABILITY: Record<EnhanceTask, PictureCapability> = {
  upscale: "upscale",
  restore: "restore",
  colorize: "colorize",
};

const TASK_LABEL: Record<EnhanceTask, { de: string; en: string; es: string }> = {
  upscale: { de: "Upscale", en: "Upscale", es: "Ampliar" },
  restore: { de: "Restaurieren", en: "Restore", es: "Restaurar" },
  colorize: { de: "Kolorieren", en: "Colorize", es: "Colorear" },
};

interface CompareEntry {
  modelId: string;
  modelName: string;
  url: string;
  cost?: number;
  durationMs?: number;
}

export function EnhancePanel() {
  const { language } = useTranslation();
  const { wallet } = useAIVideoWallet();
  const { enhance, isEnhancing, runningModelId } = useEnhanceImage();
  const { active, push } = useActiveAsset();
  const [, setSearchParams] = useSearchParams();

  const [task, setTask] = useState<EnhanceTask>("upscale");
  const [modelId, setModelId] = useState<string>("clarity-pro");
  const [scale, setScale] = useState<number>(2);
  const [presetId, setPresetId] = useState<string | null>("balanced");
  const [valuesByModel, setValuesByModel] = useState<Record<string, Record<string, unknown>>>({});
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [compare, setCompare] = useState<CompareEntry[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const currencySymbol = (wallet?.currency || "EUR") === "USD" ? "$" : "€";

  // Premium models stay visible (that is the USP) but only unlocked ones run.
  const models = useMemo(
    () => modelsWithCapability(TASK_CAPABILITY[task], { includeDisabled: true }),
    [task],
  );

  const isUnlocked = (m: PictureModelDefinition) =>
    m.enabled || (m.featureFlag ? ENABLED_PICTURE_FLAGS.includes(m.featureFlag) : false);

  useEffect(() => {
    if (models.length && !models.some((m) => m.id === modelId)) {
      const preferred = models.find(isUnlocked) ?? models[0];
      setModelId(preferred.id);
    }
  }, [models, modelId]);

  // Active asset from Generate / Edit flows into Enhance — no re-upload.
  useEffect(() => {
    if (active?.url) {
      setSourceUrl(active.url);
      setSourceId(active.mediaItemId);
      setResultUrl(null);
      setCompare(null);
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

  useEffect(() => {
    if (!model) return;
    setValuesByModel((prev) =>
      prev[model.id] ? prev : { ...prev, [model.id]: defaultControlValues(model) },
    );
    setPresetId(model.presets?.[0]?.id ?? null);
  }, [model?.id]);

  useEffect(() => {
    if (model?.supportedScales && !model.supportedScales.includes(scale)) {
      setScale(model.supportedScales[0]);
    }
  }, [model, scale]);

  const values = (model && valuesByModel[model.id]) || (model ? defaultControlValues(model) : {});

  const setValue = (key: string, value: unknown) => {
    if (!model) return;
    setPresetId(null);
    setValuesByModel((prev) => ({ ...prev, [model.id]: { ...(prev[model.id] ?? {}), [key]: value } }));
  };

  const applyPreset = (id: string) => {
    if (!model) return;
    const preset = model.presets?.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setValuesByModel((prev) => ({
      ...prev,
      [model.id]: { ...defaultControlValues(model), ...(prev[model.id] ?? {}), ...preset.values },
    }));
  };

  const estimate = useMemo(
    () =>
      estimatePrice({
        modelId,
        inputWidth: sourceSize?.width,
        inputHeight: sourceSize?.height,
        scale: model?.supportedScales ? scale : 1,
      }),
    [modelId, sourceSize, scale, model],
  );

  const resolvedTopazModel =
    model?.id === "topaz-image-upscale"
      ? resolveTopazEnhanceModel({
          imageUrl: sourceUrl ?? "",
          scale,
          values,
          inputWidth: sourceSize?.width,
          inputHeight: sourceSize?.height,
        })
      : null;

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
      setSourceId(undefined);
      setResultUrl(null);
      setCompare(null);
      push({
        id: `upload-${Date.now()}`,
        kind: "upload",
        url: pub.publicUrl,
        label: tx({ de: "Original", en: "Original", es: "Original" }),
        parentId: null,
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : tx({ de: "Upload fehlgeschlagen", en: "Upload failed", es: "Error al cargar" }),
      );
    } finally {
      setUploading(false);
    }
  };

  const runModel = async (
    target: PictureModelDefinition,
    options: { quiet?: boolean } = {},
  ): Promise<EnhanceResult | null> => {
    if (!sourceUrl) return null;
    return enhance({
      modelId: target.id,
      imageUrl: sourceUrl,
      imageId: sourceId,
      scale: target.supportedScales ? scale : undefined,
      values: { ...(valuesByModel[target.id] ?? defaultControlValues(target)) },
      inputWidth: sourceSize?.width,
      inputHeight: sourceSize?.height,
      quiet: options.quiet,
    });
  };

  const handleRun = async () => {
    if (!sourceUrl) {
      toast.error(
        tx({ de: "Bitte zuerst ein Bild wählen", en: "Please pick an image first", es: "Elige una imagen primero" }),
      );
      return;
    }
    if (!model) return;
    if (!isUnlocked(model)) {
      toast.info(
        tx({
          de: `${model.name} wird nach dem Abschluss der Qualitäts- und Kostentests freigeschaltet.`,
          en: `${model.name} unlocks once the cost and quality tests are finished.`,
          es: `${model.name} se activará cuando terminen las pruebas de coste y calidad.`,
        }),
      );
      return;
    }
    const result = await runModel(model);
    if (result?.url) {
      setResultUrl(result.url);
      setCompare(null);
      push({
        id: result.id || `enhance-${Date.now()}`,
        kind: task === "upscale" ? "enhance" : "edit",
        url: result.url,
        label: `${model.name}${model.supportedScales ? ` ${scale}×` : ""}`,
        modelId: model.id,
        mediaItemId: result.id,
      });
    }
  };

  const compareModels = models.filter(isUnlocked).slice(0, 2);
  const canCompare = task === "upscale" && compareModels.length >= 2 && !!sourceUrl;

  const handleCompare = async () => {
    if (!canCompare) return;
    setComparing(true);
    setCompare(null);
    try {
      const entries: CompareEntry[] = [];
      for (const target of compareModels) {
        const result = await runModel(target, { quiet: true });
        if (result?.url) {
          entries.push({
            modelId: target.id,
            modelName: target.name,
            url: result.url,
            cost: result.cost,
            durationMs: result.durationMs,
          });
          push({
            id: result.id || `compare-${target.id}-${Date.now()}`,
            kind: "enhance",
            url: result.url,
            label: `${target.name} ${scale}×`,
            modelId: target.id,
            mediaItemId: result.id,
          });
        }
      }
      setCompare(entries.length ? entries : null);
    } finally {
      setComparing(false);
    }
  };

  const continueWith = (nextTask: EnhanceTask | "edit" | "background") => {
    if (resultUrl) {
      setSourceUrl(resultUrl);
      setResultUrl(null);
    }
    if (nextTask === "edit" || nextTask === "background") {
      setSearchParams({ tab: nextTask === "edit" ? "edit" : "background" });
      return;
    }
    setTask(nextTask);
  };

  const busy = isEnhancing || comparing;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr]">
      {/* Left: task, model, controls */}
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-border/50 bg-muted/30 p-1">
          {(Object.keys(TASK_LABEL) as EnhanceTask[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTask(t)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                task === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tx(TASK_LABEL[t])}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {models.map((m) => {
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
                <p className="mt-1 text-xs text-muted-foreground">{pickLocalized(m.description, language)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {m.bestFor.map((b) => pickLocalized(b, language)).join(" · ")}
                </p>
                {!isUnlocked(m) && (
                  <Badge variant="secondary" className="mt-2 text-[10px]">
                    {tx({ de: "Bald verfügbar", en: "Coming soon", es: "Próximamente" })}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        {model?.supportedScales && (
          <div className="space-y-2">
            <Label>{tx({ de: "Faktor", en: "Scale", es: "Factor" })}</Label>
            <div className="flex gap-2">
              {model.supportedScales.map((s) => (
                <Button key={s} size="sm" variant={scale === s ? "default" : "outline"} onClick={() => setScale(s)}>
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

        {model?.presets && model.presets.length > 0 && (
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
                  onClick={() => applyPreset(p.id)}
                >
                  {pickLocalized(p.label, language)}
                </Button>
              ))}
            </div>
            {resolvedTopazModel && values.enhanceModel === "auto" && (
              <p className="text-[11px] text-muted-foreground">
                {tx({ de: "Auto wählt", en: "Auto selects", es: "Auto elige" })}: {resolvedTopazModel}
              </p>
            )}
          </div>
        )}

        {model && (
          <ModelControls model={model} values={values} onChange={setValue} language={language} />
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
          <BeforeAfterCanvas originalUrl={sourceUrl} resultUrl={resultUrl} busy={busy} />
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

        {compare && compare.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {compare.map((entry) => (
              <Card key={entry.modelId} className="overflow-hidden border-border/50">
                <img src={entry.url} alt={entry.modelName} className="h-48 w-full object-cover" loading="lazy" />
                <CardContent className="space-y-1 p-3 text-xs">
                  <p className="font-semibold">{entry.modelName}</p>
                  <p className="text-muted-foreground">
                    {entry.cost != null ? `${currencySymbol}${entry.cost.toFixed(2)}` : "—"}
                    {entry.durationMs ? ` · ${Math.round(entry.durationMs / 1000)}s` : ""}
                  </p>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setResultUrl(entry.url)}>
                    {tx({ de: "Diesen übernehmen", en: "Use this one", es: "Usar este" })}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AssetLineageStrip />

        <Card className="border-border/50">
          <CardContent className="space-y-2 p-4 text-sm">
            <Row label={tx({ de: "Modell", en: "Model", es: "Modelo" })} value={model?.name ?? "—"} />
            {resolvedTopazModel && (
              <Row
                label={tx({ de: "Enhance-Modell", en: "Enhance model", es: "Modelo de mejora" })}
                value={resolvedTopazModel}
              />
            )}
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
            <Button className="w-full" onClick={handleRun} disabled={busy || !sourceUrl}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {task === "colorize"
                ? tx({ de: "Bild kolorieren", en: "Colorize image", es: "Colorear imagen" })
                : task === "restore"
                  ? tx({ de: "Bild restaurieren", en: "Restore image", es: "Restaurar imagen" })
                  : tx({ de: "Bild verbessern", en: "Enhance image", es: "Mejorar imagen" })}
            </Button>

            {canCompare && (
              <Button variant="outline" className="w-full" onClick={handleCompare} disabled={busy}>
                {comparing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <GitCompare className="mr-2 h-4 w-4" />
                )}
                {tx({
                  de: `${compareModels[0].name} vs. ${compareModels[1].name} vergleichen`,
                  en: `Compare ${compareModels[0].name} vs. ${compareModels[1].name}`,
                  es: `Comparar ${compareModels[0].name} vs. ${compareModels[1].name}`,
                })}
              </Button>
            )}

            {runningModelId && (
              <p className="text-center text-[11px] text-muted-foreground">{runningModelId}</p>
            )}
          </CardContent>
        </Card>

        {resultUrl && (
          <Card className="border-border/50">
            <CardContent className="flex flex-wrap gap-2 p-4">
              {task !== "upscale" && (
                <Button size="sm" variant="outline" onClick={() => continueWith("upscale")}>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  {tx({ de: "Weiter mit Upscale", en: "Continue with upscale", es: "Continuar con ampliar" })}
                </Button>
              )}
              {task === "upscale" && (
                <Button size="sm" variant="outline" onClick={() => continueWith("upscale")}>
                  <Wand2 className="mr-2 h-4 w-4" />
                  {tx({ de: "Nochmals verbessern", en: "Enhance again", es: "Mejorar otra vez" })}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => continueWith("edit")}>
                {tx({ de: "Bearbeiten", en: "Edit", es: "Editar" })}
              </Button>
              <Button size="sm" variant="outline" onClick={() => continueWith("background")}>
                {tx({ de: "Hintergrund", en: "Background", es: "Fondo" })}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={resultUrl} download target="_blank" rel="noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  {tx({ de: "Herunterladen", en: "Download", es: "Descargar" })}
                </a>
              </Button>
            </CardContent>
          </Card>
        )}
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
