import { tx } from "@/lib/i18nText";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, ListChecks, Wallet, Sparkles, CheckCircle2, XCircle, Zap, Crown, Gem, Palette } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAIVideoWallet } from "@/hooks/useAIVideoWallet";
import { useActiveBrandKit } from "@/hooks/useActiveBrandKit";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseBatchPrompts } from "@/lib/pictureModels/batchPrompts";


type QualityTier = 'fast' | 'pro' | 'ultra';

const TIER_COSTS: Record<QualityTier, number> = {
  fast: 0.04,
  pro: 0.08,
  ultra: 0.20,
};

const TIER_META: Record<QualityTier, { label: string; model: string; icon: any }> = {
  fast: { label: 'Fast', model: 'Seedream 4', icon: Zap },
  pro: { label: 'Pro', model: 'Imagen 4 Ultra', icon: Crown },
  ultra: { label: 'Ultra', model: 'Nano Banana 2', icon: Gem },
};

interface BatchItem {
  prompt: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  url?: string;
  error?: string;
}

export function BatchGeneratePanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { wallet } = useAIVideoWallet();
  const { data: activeBrandKit } = useActiveBrandKit();

  const [rawPrompts, setRawPrompts] = useState("");
  const [tier, setTier] = useState<QualityTier>('fast');
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [style, setStyle] = useState("realistic");
  const [useBrandKit, setUseBrandKit] = useState(false);
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<BatchItem[]>([]);

  const [showAllPrompts, setShowAllPrompts] = useState(false);

  const prompts = useMemo(() => parseBatchPrompts(rawPrompts), [rawPrompts]);


  const currency = wallet?.currency || 'EUR';
  const currencySymbol = currency === 'USD' ? '$' : '€';
  const balance = wallet?.balance_euros ?? 0;
  const totalCost = prompts.length * TIER_COSTS[tier];
  const insufficient = totalCost > 0 && balance < totalCost;

  const completed = items.filter(i => i.status === 'success' || i.status === 'failed').length;
  const successCount = items.filter(i => i.status === 'success').length;
  const progress = items.length > 0 ? (completed / items.length) * 100 : 0;

  const brandKitPayload = useBrandKit && activeBrandKit ? {
    name: activeBrandKit.brand_name || undefined,
    primaryColor: activeBrandKit.primary_color || undefined,
    secondaryColor: activeBrandKit.secondary_color || undefined,
    accentColor: activeBrandKit.accent_color || undefined,
    mood: activeBrandKit.mood || undefined,
  } : null;

  const runOne = async (idx: number, prompt: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, status: 'running' } : it));
    try {
      const { data, error } = await supabase.functions.invoke('generate-image-replicate', {
        body: {
          prompt,
          tier,
          aspectRatio,
          style,
          brandKit: brandKitPayload,
        }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const url = data?.image?.url;
      setItems(prev => prev.map((it, i) =>
        i === idx ? { ...it, status: 'success', url } : it
      ));
    } catch (err: any) {
      setItems(prev => prev.map((it, i) =>
        i === idx ? { ...it, status: 'failed', error: err?.message || 'Failed' } : it
      ));
    }
  };

  const handleStart = async () => {
    if (!user) { toast.error(tx({ de: "Bitte zuerst einloggen", en: "Please log in first", es: "Por favor, inicia sesión primero" })); return; }
    if (!prompts.length) { toast.error(tx({ de: "Mindestens 1 Prompt eingeben", en: "Enter at least 1 prompt", es: "Introduce al menos 1 mensaje" })); return; }
    if (prompts.length > 20) { toast.error(tx({ de: "Max. 20 Prompts pro Batch", en: "Max. 20 prompts per batch", es: "Máx. 20 indicaciones por lote" })); return; }
    if (insufficient) {
      toast.error(tx({ de: `Nicht genügend Credits. Du benötigst ${currencySymbol}${totalCost.toFixed(2)}.`, en: `Not enough credits. You need ${currencySymbol}${totalCost.toFixed(2)}.`, es: `No hay suficientes créditos. Necesitas ${currencySymbol}${totalCost.toFixed(2)}.` }));
      navigate('/ai-video-purchase-credits');
      return;
    }

    setItems(prompts.map(p => ({ prompt: p, status: 'pending' as const })));
    setRunning(true);

    // Sequential to respect rate limits and avoid wallet race
    for (let i = 0; i < prompts.length; i++) {
      await runOne(i, prompts[i]);
    }

    setRunning(false);
    toast.success(tx({ de: `Batch fertig: ${prompts.length} verarbeitet`, en: `Batch finished: ${prompts.length} processed`, es: `Lote terminado: ${prompts.length} procesado` }));
  };

  return (
    <div className="space-y-6">
      {/* Wallet Header */}
      <Card className="border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">AI Credits</p>
              <p className="text-lg font-semibold">{currencySymbol}{balance.toFixed(2)}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/ai-video-purchase-credits')}>
            {tx({ de: "Aufladen", en: "Top up", es: "Recargar" })}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6 space-y-5">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              {tx({ de: "Prompts (1 pro Zeile, max. 20)", en: "Prompts (1 per line, max. 20)", es: "Indicaciones (1 por línea, máx. 20)" })}
            </Label>
            <Textarea
              placeholder={tx({ de: `Modernes Office im skandinavischen Stil\\nProduktfoto roter Sneaker auf weißem Hintergrund\\nMacro Shot frische Kaffeebohnen mit Dampf\\n…`, en: `Modern office in Scandinavian style\\nProduct photo of red sneakers on a white background\\nMacro shot of fresh coffee beans with steam\\n…`, es: `Oficina moderna en estilo escandinavo\\nFoto del producto de zapatillas rojas sobre un fondo blanco\\nFoto macro de granos de café frescos con vapor\\n...` })}
              value={rawPrompts}
              onChange={(e) => setRawPrompts(e.target.value)}
              className="min-h-[160px] bg-background/50 border-border/50 font-mono text-sm"
              disabled={running}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{tx({
                de: `${prompts.length} Prompt${prompts.length !== 1 ? 's' : ''} erkannt`,
                en: `${prompts.length} prompt${prompts.length !== 1 ? 's' : ''} detected`,
                es: `${prompts.length} indicación${prompts.length !== 1 ? 'es' : ''} detectada${prompts.length !== 1 ? 's' : ''}`,
              })}</span>
              {prompts.length > 20 && <span className="text-destructive">{tx({ de: "Max. 20 Prompts erlaubt", en: "Max. 20 prompts allowed", es: "Máx. 20 indicaciones permitidas" })}</span>}
            </div>

            {prompts.length > 0 && (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
                {(showAllPrompts ? prompts : prompts.slice(0, 3)).map((p, i) => (
                  <div key={`${i}-${p.slice(0, 12)}`} className="flex gap-2 text-xs">
                    <span className="text-muted-foreground tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate">{p}</span>
                  </div>
                ))}
                {prompts.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllPrompts(!showAllPrompts)}
                    className="text-xs text-primary hover:underline"
                  >
                    {showAllPrompts
                      ? tx({ de: "Weniger anzeigen", en: "Show less", es: "Mostrar menos" })
                      : tx({
                          de: `Alle ${prompts.length} anzeigen`,
                          en: `Show all ${prompts.length}`,
                          es: `Mostrar los ${prompts.length}`,
                        })}
                  </button>
                )}
              </div>
            )}
          </div>


          {/* Tier */}
          <div className="space-y-2">
            <Label>{tx({ de: "Qualität & Modell", en: "Quality & Model", es: "Calidad y modelo" })}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TIER_META) as QualityTier[]).map((t) => {
                const meta = TIER_META[t];
                const Icon = meta.icon;
                const isSelected = tier === t;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={running}
                    onClick={() => setTier(t)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border/50 bg-background/30 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-semibold text-sm">{meta.label}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-1.5">{meta.model}</p>
                    <Badge variant="outline" className="text-[10px] h-5">
                      {currencySymbol}{TIER_COSTS[t].toFixed(2)}/{tx({ de: "Bild", en: "Image", es: "Imagen" })}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{tx({ de: "Stil", en: "Style", es: "Estilo" })}</Label>
              <Select value={style} onValueChange={setStyle} disabled={running}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="realistic">{tx({ de: "Realistisch", en: "Realistic", es: "Realista" })}</SelectItem>
                  <SelectItem value="cinematic">{tx({ de: "Cinematic", en: "Cinematic", es: "Cinematográfico" })}</SelectItem>
                  <SelectItem value="product-photo">{tx({ de: "Produktfoto", en: "Product photo", es: "Foto de producto" })}</SelectItem>
                  <SelectItem value="minimalist">{tx({ de: "Minimalistisch", en: "Minimalist", es: "Minimalista" })}</SelectItem>
                  <SelectItem value="editorial">{tx({ de: "Editorial", en: "Editorial", es: "Editorial" })}</SelectItem>
                  <SelectItem value="3d-render">{tx({ de: "3D Render", en: "3D Render", es: "Renderizado 3D" })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{tx({ de: "Format", en: "Format", es: "Formato" })}</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={running}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1:1">{tx({ de: "1:1 Quadrat", en: "1:1 Square", es: "1:1 Cuadrado" })}</SelectItem>
                  <SelectItem value="16:9">{tx({ de: "16:9 Landscape", en: "16:9 Landscape", es: "16:9 Paisaje" })}</SelectItem>
                  <SelectItem value="9:16">{tx({ de: "9:16 Portrait", en: "9:16 Portrait", es: "9:16 Retrato" })}</SelectItem>
                  <SelectItem value="4:5">{tx({ de: "4:5 Instagram", en: "4:5 Instagram", es: "4:5 Instagram" })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Brand-Kit Toggle */}
          {activeBrandKit && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/30">
              <div className="flex items-center gap-3">
                <Palette className="h-4 w-4 text-primary" />
                <div>
                  <Label className="text-sm">{tx({ de: "Brand-Kit aktiv:", en: "Brand Kit active:", es: "Kit de marca activo:" })} {activeBrandKit.brand_name || tx({ de: "Markenkit", en: "Brand Kit", es: "Kit de marca" })}</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {tx({ de: "Farben & Mood werden in jeden Prompt injiziert", en: "Colors & mood are injected into every prompt", es: "Los colores y el estado de ánimo se inyectan en cada mensaje." })}
                  </p>
                </div>
              </div>
              <Switch checked={useBrandKit} onCheckedChange={setUseBrandKit} disabled={running} />
            </div>
          )}

          {/* Cost Preview */}
          {prompts.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-primary/30 bg-primary/5">
              <div>
                <p className="text-xs text-muted-foreground">{tx({ de: "Gesamtkosten", en: "Total cost", es: "Coste total" })}</p>
                <p className="text-xl font-bold text-primary">
                  {currencySymbol}{totalCost.toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{prompts.length} × {currencySymbol}{TIER_COSTS[tier].toFixed(2)}</p>
                {insufficient && <p className="text-xs text-destructive font-medium">{tx({ de: "Credits unzureichend", en: "Insufficient credits", es: "Créditos insuficientes" })}</p>}
              </div>
            </div>
          )}

          <Button
            className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground"
            size="lg"
            onClick={handleStart}
            disabled={running || !prompts.length || prompts.length > 20 || insufficient}
          >
            {running ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {tx({ de: `Generiere ${completed}/${items.length}…`, en: `Generating ${completed}/${items.length}…`, es: `Generando ${completed}/${items.length}…` })}</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> {tx({ de: "Batch starten (", en: "Start batch (", es: "Iniciar lote (" })}{prompts.length} {tx({ de: "Bilder)", en: "images)", es: "imágenes)" })}</>
            )}
          </Button>

          {items.length > 0 && (
            <div className="space-y-3">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {successCount} {tx({ de: 'erfolgreich', en: 'succeeded', es: 'con éxito' })} · {items.filter(i => i.status === 'failed').length} {tx({ de: 'fehlgeschlagen', en: 'failed', es: 'fallidos' })} · {completed} / {items.length}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="relative aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted"
            >
              {item.status === 'success' && item.url ? (
                <img src={item.url} className="w-full h-full object-cover" alt={item.prompt} />
              ) : item.status === 'running' ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : item.status === 'failed' ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                  <XCircle className="h-6 w-6 text-destructive mb-2" />
                  <p className="text-[10px] text-muted-foreground">{item.error}</p>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center opacity-40">
                  <span className="text-xs">{tx({ de: "Wartet…", en: "Waiting…", es: "Esperando…" })}</span>
                </div>
              )}

              {item.status === 'success' && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 drop-shadow-md" />
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-[10px] text-white line-clamp-2">{item.prompt}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
