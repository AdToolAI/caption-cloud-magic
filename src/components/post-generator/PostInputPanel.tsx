import { motion } from "framer-motion";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Instagram, Facebook, Linkedin, Upload, Sparkles, Twitter, Video, Youtube, Settings, Check, Image } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface PostInputPanelProps {
  brief: string;
  setBrief: (v: string) => void;
  mediaPreview: string;
  mediaType: 'image' | 'video' | null;
  onMediaUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  platforms: string[];
  onPlatformToggle: (p: string) => void;
  stylePreset: string;
  setStylePreset: (v: string) => void;
  languages: string[];
  onLanguageToggle: (l: string) => void;
  tone: string;
  setTone: (v: string) => void;
  brandKits: any[];
  selectedBrandKit: string;
  setSelectedBrandKit: (v: string) => void;
  ctaInput: string;
  setCTAInput: (v: string) => void;
  options: {
    localize: boolean;
    brandFidelity: number;
    abVariant: boolean;
    altText: boolean;
    utm: boolean;
  };
  setOptions: (opts: any) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function PostInputPanel({
  brief,
  setBrief,
  mediaPreview,
  mediaType,
  onMediaUpload,
  platforms,
  onPlatformToggle,
  stylePreset,
  setStylePreset,
  languages,
  onLanguageToggle,
  tone,
  setTone,
  brandKits,
  selectedBrandKit,
  setSelectedBrandKit,
  ctaInput,
  setCTAInput,
  options,
  setOptions,
  onGenerate,
  isGenerating,
}: PostInputPanelProps) {
  const activeBrand = brandKits.find((k) => k.id === selectedBrandKit);

  const getPlatformIcon = (p: string) => {
    switch (p) {
      case "instagram":
        return <Instagram className="h-4 w-4" />;
      case "facebook":
        return <Facebook className="h-4 w-4" />;
      case "linkedin":
        return <Linkedin className="h-4 w-4" />;
      case "x":
        return <Twitter className="h-4 w-4" />;
      case "tiktok":
        return <Video className="h-4 w-4" />;
      case "youtube":
        return <Youtube className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getPlatformLabel = (p: string) => {
    switch (p) {
      case "x": return "X";
      case "youtube": return "YouTube";
      case "tiktok": return "TikTok";
      default: return p.charAt(0).toUpperCase() + p.slice(1);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header with Icon */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 
                        flex items-center justify-center shadow-[0_0_20px_hsla(43,90%,68%,0.2)]">
          <Image className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Post erstellen</h2>
          <p className="text-sm text-muted-foreground">Lade ein Bild hoch und beschreibe deinen Post</p>
        </div>
      </div>

      {/* Active Brand Badge */}
      {activeBrand && (
        <Badge variant="secondary" className="bg-primary/20 border border-primary/30 text-primary">
          💜 Aktives Brand-Set: {activeBrand.brand_name || activeBrand.mood}
        </Badge>
      )}

      {/* Media Upload - Premium Styling */}
      <div>
        <Label className="text-sm font-medium">Bild/Video hochladen (optional)</Label>
        <div className="mt-2 border-2 border-dashed border-white/20 rounded-xl p-8 text-center 
                        hover:border-primary/50 hover:shadow-[0_0_30px_hsla(43,90%,68%,0.1)]
                        transition-all duration-300 cursor-pointer bg-muted/10 group">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
            onChange={onMediaUpload}
            className="hidden"
            id="media-upload-v2"
          />
          <label htmlFor="media-upload-v2" className="cursor-pointer">
            {mediaPreview ? (
              mediaType === 'video' ? (
                <video 
                  src={mediaPreview} 
                  controls 
                  className="max-h-48 mx-auto rounded-lg"
                  style={{ maxWidth: '100%' }}
                />
              ) : (
                <img src={mediaPreview} alt="Preview" className="max-h-48 mx-auto rounded-lg" />
              )
            ) : (
              <>
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="inline-block"
                >
                  <Upload className="h-12 w-12 mx-auto mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                </motion.div>
                <p className="text-sm text-muted-foreground">
                  Klicken zum Hochladen
                  <br />
                  <span className="text-xs">Bilder: max 10MB | Videos: max 1GB (MP4, MOV)</span>
                </p>
              </>
            )}
          </label>
        </div>
        {mediaType === 'video' && (
          <Alert className="mt-2 bg-muted/20 border-white/10">
            <AlertDescription className="text-xs">
              📹 <strong>Video-Limits:</strong> Instagram Reels (3-90s) • Facebook (unbegrenzt) • TikTok (bis 10min)
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Kurzbeschreibung / Briefing */}
      <div>
        <Label className="text-sm font-medium">Kurzbeschreibung / Briefing</Label>
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="2-3 Stichpunkte genügen – wir bauen Hook, Caption & Hashtags..."
          maxLength={1500}
          rows={4}
          className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 
                     focus:ring-2 focus:ring-primary/20 resize-none"
        />
        <p className="text-xs text-muted-foreground mt-1">
          🪄 {brief.length}/1500 Zeichen
        </p>
      </div>

      {/* Plattformen als Premium Chips */}
      <div>
        <Label className="text-sm font-medium mb-3 block">Plattform(en)</Label>
        <div className="flex flex-wrap gap-2">
          {["instagram", "facebook", "x", "linkedin", "tiktok", "youtube"].map((p, index) => (
            <motion.div
              key={p}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onPlatformToggle(p)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-300",
                platforms.includes(p) 
                  ? "bg-primary/20 border border-primary/40 shadow-[0_0_15px_hsla(43,90%,68%,0.2)]" 
                  : "bg-muted/20 border border-white/10 hover:border-white/20"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center transition-all",
                platforms.includes(p) ? "bg-primary text-primary-foreground" : "bg-muted/40"
              )}>
                {platforms.includes(p) && <Check className="h-3 w-3" />}
              </div>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {getPlatformIcon(p)}
                {getPlatformLabel(p)}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Stil-Vorlage */}
      <div>
        <Label className="text-sm font-medium">Stil-Vorlage</Label>
        <Select value={stylePreset} onValueChange={setStylePreset}>
          <SelectTrigger className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 
                                    focus:ring-2 focus:ring-primary/20 h-12">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clean">Clean</SelectItem>
            <SelectItem value="bold">Bold</SelectItem>
            <SelectItem value="editorial">Editorial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sprache(n) als Premium Chips */}
      <div>
        <Label className="text-sm font-medium mb-3 block">Sprache(n)</Label>
        <div className="flex gap-2">
          {["de", "en", "es"].map((l) => (
            <div
              key={l}
              onClick={() => onLanguageToggle(l)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-300",
                languages.includes(l) 
                  ? "bg-primary/20 border border-primary/40 shadow-[0_0_15px_hsla(43,90%,68%,0.2)]" 
                  : "bg-muted/20 border border-white/10 hover:border-white/20"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center transition-all",
                languages.includes(l) ? "bg-primary text-primary-foreground" : "bg-muted/40"
              )}>
                {languages.includes(l) && <Check className="h-3 w-3" />}
              </div>
              <span className="uppercase text-sm font-medium">{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tonfall */}
      <div>
        <Label className="text-sm font-medium">Tonfall</Label>
        <Select value={tone} onValueChange={setTone}>
          <SelectTrigger className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 
                                    focus:ring-2 focus:ring-primary/20 h-12">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="friendly">Freundlich</SelectItem>
            <SelectItem value="professional">Professionell</SelectItem>
            <SelectItem value="casual">Locker</SelectItem>
            <SelectItem value="inspirational">Inspirierend</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Brand-Kit */}
      {brandKits.length > 0 && (
        <div>
          <Label className="text-sm font-medium">Brand-Kit</Label>
          <Select value={selectedBrandKit} onValueChange={setSelectedBrandKit}>
            <SelectTrigger className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 
                                      focus:ring-2 focus:ring-primary/20 h-12">
              <SelectValue placeholder="Default Theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default Theme</SelectItem>
              {brandKits.map((kit) => (
                <SelectItem key={kit.id} value={kit.id}>
                  {kit.brand_name || kit.mood}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* CTA (optional) */}
      <div>
        <Label className="text-sm font-medium">CTA (optional)</Label>
        <Input
          value={ctaInput}
          onChange={(e) => setCTAInput(e.target.value)}
          placeholder="z.B. Jetzt testen – Link in Bio"
          className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 
                     focus:ring-2 focus:ring-primary/20 h-12"
        />
      </div>

      {/* Optionen Section with Divider */}
      <div className="space-y-4 border-t border-white/10 pt-6 mt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/20 
                          flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.15)]">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <Label className="text-base font-semibold">Erweiterte Optionen</Label>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-white/5">
          <Label htmlFor="localize" className="text-sm">
            Lokalisieren (Währung/Emoji)
          </Label>
          <Switch
            id="localize"
            checked={options.localize}
            onCheckedChange={(checked) => setOptions({ ...options, localize: checked })}
          />
        </div>

        <div className="p-3 rounded-xl bg-muted/10 border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Brand-Treue erzwingen</Label>
            <span className="text-sm font-medium text-primary">{options.brandFidelity}%</span>
          </div>
          <Slider
            value={[options.brandFidelity]}
            onValueChange={(v) => setOptions({ ...options, brandFidelity: v[0] })}
            min={60}
            max={100}
            step={5}
            className="w-full"
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-white/5">
          <Label htmlFor="abVariant" className="text-sm">
            A/B-Variante erzeugen
          </Label>
          <Switch
            id="abVariant"
            checked={options.abVariant}
            onCheckedChange={(checked) => setOptions({ ...options, abVariant: checked })}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-white/5">
          <Label htmlFor="altText" className="text-sm">
            Alt-Text automatisch erzeugen
          </Label>
          <Switch
            id="altText"
            checked={options.altText}
            onCheckedChange={(checked) => setOptions({ ...options, altText: checked })}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-white/5">
          <Label htmlFor="utm" className="text-sm">
            UTM-Link generieren
          </Label>
          <Switch
            id="utm"
            checked={options.utm}
            onCheckedChange={(checked) => setOptions({ ...options, utm: checked })}
          />
        </div>
      </div>

      {/* Generate Button with Shimmer */}
      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
        <Button
          onClick={onGenerate}
          disabled={isGenerating || !brief.trim()}
          className="w-full h-14 text-base font-semibold relative overflow-hidden group
                     bg-gradient-to-r from-primary to-primary/80
                     hover:shadow-[0_0_30px_hsla(43,90%,68%,0.4)]
                     transition-all duration-300"
          size="lg"
        >
          {/* Shimmer Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent 
                          translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
          {isGenerating ? (
            <>Generiere Post...</>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Post generieren
            </>
          )}
        </Button>
      </motion.div>
    </div>
  );
}
