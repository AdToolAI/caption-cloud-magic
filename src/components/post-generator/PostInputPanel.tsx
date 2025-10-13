import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Instagram, Facebook, Linkedin, Upload, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PostInputPanelProps {
  brief: string;
  setBrief: (v: string) => void;
  imagePreview: string;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  imagePreview,
  onImageUpload,
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
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Active Brand Badge */}
      {activeBrand && (
        <Badge variant="secondary" className="mb-4">
          💜 Aktives Brand-Set: {activeBrand.brand_name || activeBrand.mood}
        </Badge>
      )}

      {/* Bild Upload */}
      <div>
        <Label>Bild hochladen (optional)</Label>
        <div className="mt-2 border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onImageUpload}
            className="hidden"
            id="image-upload-v2"
          />
          <label htmlFor="image-upload-v2" className="cursor-pointer">
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded" />
            ) : (
              <>
                <Upload className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Klicken zum Hochladen (max 10MB)</p>
              </>
            )}
          </label>
        </div>
      </div>

      {/* Kurzbeschreibung / Briefing */}
      <div>
        <Label>Kurzbeschreibung / Briefing</Label>
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="2-3 Stichpunkte genügen – wir bauen Hook, Caption & Hashtags..."
          maxLength={500}
          rows={4}
          className="mt-2"
        />
        <p className="text-xs text-muted-foreground mt-1">
          🪄 {brief.length}/500 Zeichen
        </p>
      </div>

      {/* Plattformen */}
      <div>
        <Label>Plattform(en)</Label>
        <div className="flex gap-4 mt-2">
          {["instagram", "facebook", "linkedin"].map((p) => (
            <label key={p} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={platforms.includes(p)} onCheckedChange={() => onPlatformToggle(p)} />
              <span className="capitalize flex items-center gap-1">
                {getPlatformIcon(p)}
                {p}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Stil-Vorlage */}
      <div>
        <Label>Stil-Vorlage</Label>
        <Select value={stylePreset} onValueChange={setStylePreset}>
          <SelectTrigger className="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clean">Clean</SelectItem>
            <SelectItem value="bold">Bold</SelectItem>
            <SelectItem value="editorial">Editorial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sprache(n) */}
      <div>
        <Label>Sprache(n)</Label>
        <div className="flex gap-4 mt-2">
          {["de", "en", "es"].map((l) => (
            <label key={l} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={languages.includes(l)} onCheckedChange={() => onLanguageToggle(l)} />
              <span className="uppercase">{l}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Tonfall */}
      <div>
        <Label>Tonfall</Label>
        <Select value={tone} onValueChange={setTone}>
          <SelectTrigger className="mt-2">
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
          <Label>Brand-Kit</Label>
          <Select value={selectedBrandKit} onValueChange={setSelectedBrandKit}>
            <SelectTrigger className="mt-2">
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
        <Label>CTA (optional)</Label>
        <Input
          value={ctaInput}
          onChange={(e) => setCTAInput(e.target.value)}
          placeholder="z.B. Jetzt testen – Link in Bio"
          className="mt-2"
        />
      </div>

      {/* Optionen */}
      <div className="space-y-4 border-t pt-4">
        <Label className="text-base font-semibold">Optionen</Label>

        <div className="flex items-center justify-between">
          <Label htmlFor="localize" className="text-sm">
            Lokalisieren (Währung/Emoji)
          </Label>
          <Switch
            id="localize"
            checked={options.localize}
            onCheckedChange={(checked) => setOptions({ ...options, localize: checked })}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Brand-Treue erzwingen</Label>
            <span className="text-sm font-medium">{options.brandFidelity}%</span>
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

        <div className="flex items-center justify-between">
          <Label htmlFor="abVariant" className="text-sm">
            A/B-Variante erzeugen
          </Label>
          <Switch
            id="abVariant"
            checked={options.abVariant}
            onCheckedChange={(checked) => setOptions({ ...options, abVariant: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="altText" className="text-sm">
            Alt-Text automatisch erzeugen
          </Label>
          <Switch
            id="altText"
            checked={options.altText}
            onCheckedChange={(checked) => setOptions({ ...options, altText: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
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

      {/* Generate Button */}
      <Button
        onClick={onGenerate}
        disabled={isGenerating || !brief.trim()}
        className="w-full"
        size="lg"
      >
        {isGenerating ? (
          <>Generiere Post...</>
        ) : (
          <>
            <Sparkles className="mr-2 h-5 w-5" />
            Post generieren
          </>
        )}
      </Button>
    </div>
  );
}
