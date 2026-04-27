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

  const prompts = useMemo(
    () => rawPrompts.split('\n').map(p => p.trim()).filter(Boolean),
    [rawPrompts]
  );

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
    if (!user) { toast.error("Bitte zuerst einloggen"); return; }
    if (!prompts.length) { toast.error("Mindestens 1 Prompt eingeben"); return; }
    if (prompts.length > 20) { toast.error("Max. 20 Prompts pro Batch"); return; }
    if (insufficient) {
      toast.error(`Nicht genügend Credits. Brauchst ${currencySymbol}${totalCost.toFixed(2)}.`);
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
    toast.success(`Batch fertig: ${prompts.filter((_, i) => true).length} verarbeitet`);
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
            Aufladen
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6 space-y-5">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              Prompts (1 pro Zeile, max. 20)
            </Label>
            <Textarea
              placeholder={`Modernes Office im skandinavischen Stil\nProduktfoto roter Sneaker auf weißem Hintergrund\nMacro Shot frische Kaffeebohnen mit Dampf\n…`}
              value={rawPrompts}
              onChange={(e) => setRawPrompts(e.target.value)}
              className="min-h-[160px] bg-background/50 border-border/50 font-mono text-sm"
              disabled={running}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{prompts.length} Prompt{prompts.length !== 1 ? 's' : ''} erkannt</span>
              {prompts.length > 20 && <span className="text-destructive">Max. 20 Prompts erlaubt</span>}
            </div>
          </div>

          {/* Tier */}
          <div className="space-y-2">
            <Label>Qualität & Modell</Label>
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
                      {currencySymbol}{TIER_COSTS[t].toFixed(2)}/Bild
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Stil</Label>
              <Select value={style} onValueChange={setStyle} disabled={running}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="realistic">Realistisch</SelectItem>
                  <SelectItem value="cinematic">Cinematic</SelectItem>
                  <SelectItem value="product-photo">Produktfoto</SelectItem>
                  <SelectItem value="minimalist">Minimalistisch</SelectItem>
                  <SelectItem value="editorial">Editorial</SelectItem>
                  <SelectItem value="3d-render">3D Render</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={running}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1:1">1:1 Quadrat</SelectItem>
                  <SelectItem value="16:9">16:9 Landscape</SelectItem>
                  <SelectItem value="9:16">9:16 Portrait</SelectItem>
                  <SelectItem value="4:5">4:5 Instagram</SelectItem>
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
                  <Label className="text-sm">Brand-Kit aktiv: {activeBrandKit.brand_name || 'Markenkit'}</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Farben & Mood werden in jeden Prompt injiziert
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
                <p className="text-xs text-muted-foreground">Gesamtkosten</p>
                <p className="text-xl font-bold text-primary">
                  {currencySymbol}{totalCost.toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{prompts.length} × {currencySymbol}{TIER_COSTS[tier].toFixed(2)}</p>
                {insufficient && <p className="text-xs text-destructive font-medium">Credits unzureichend</p>}
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
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generiere {completed}/{items.length}…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Batch starten ({prompts.length} Bilder)</>
            )}
          </Button>

          {items.length > 0 && (
            <div className="space-y-3">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {successCount} erfolgreich · {items.filter(i => i.status === 'failed').length} fehlgeschlagen · {completed} / {items.length}
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
                  <span className="text-xs">Wartet…</span>
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
