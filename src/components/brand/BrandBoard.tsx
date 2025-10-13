import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface BrandBoardProps {
  brandKit: any;
}

export function BrandBoard({ brandKit }: BrandBoardProps) {
  const { toast } = useToast();
  const [copiedColor, setCopiedColor] = useState("");

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedColor(label);
    setTimeout(() => setCopiedColor(""), 2000);
    toast({
      title: "Kopiert!",
      description: `${label}: ${text}`
    });
  };

  const ColorSwatch = ({ color, label }: { color: string; label: string }) => (
    <div className="flex items-center gap-2 group">
      <div
        className="w-16 h-16 rounded-lg border-2 border-border shadow-md group-hover:scale-110 transition-transform"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground font-mono">{color}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => copyToClipboard(color, label)}
      >
        {copiedColor === label ? (
          <Check className="h-4 w-4 text-accent" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Farbpalette */}
      <Card className="animate-fade-in">
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg mb-4">🎨 Farbpalette</h3>
          <div className="space-y-3">
            <ColorSwatch color={brandKit.color_palette.primary} label="Primär" />
            <ColorSwatch color={brandKit.color_palette.secondary} label="Sekundär" />
            <ColorSwatch color={brandKit.color_palette.accent} label="Akzent" />
            {brandKit.color_palette.neutrals?.map((color: string, idx: number) => (
              <ColorSwatch key={idx} color={color} label={`Neutral ${idx + 1}`} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Schriftarten */}
      <Card className="animate-fade-in">
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg mb-4">✍️ Schriftarten</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Überschrift</p>
              <p className="text-2xl font-bold" style={{ fontFamily: brandKit.font_pairing.headline }}>
                {brandKit.font_pairing.headline}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Fließtext</p>
              <p className="text-lg" style={{ fontFamily: brandKit.font_pairing.body }}>
                {brandKit.font_pairing.body}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Beispiel-Post Vorschau */}
      <Card className="animate-fade-in md:col-span-2">
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg mb-4">📱 Instagram Post Vorschau</h3>
          <div className="max-w-md mx-auto border rounded-2xl overflow-hidden shadow-lg">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 bg-card">
              {brandKit.logo_url && (
                <img src={brandKit.logo_url} alt="Logo" className="w-10 h-10 rounded-full object-cover" />
              )}
              <div>
                <p className="font-semibold">{brandKit.brand_name || "Deine Marke"}</p>
                <p className="text-xs text-muted-foreground">Gesponsert</p>
              </div>
            </div>

            {/* Post Bild */}
            <div 
              className="aspect-square flex items-center justify-center text-white text-2xl font-bold"
              style={{ 
                background: `linear-gradient(135deg, ${brandKit.color_palette.primary}, ${brandKit.color_palette.accent})`
              }}
            >
              {brandKit.brand_name || "Deine Marke"}
            </div>

            {/* Caption */}
            <div className="p-4 bg-card">
              <p className="text-sm">
                <span className="font-semibold">{brandKit.brand_name || "marke"}</span>
                {" "}
                {brandKit.example_caption || "Beispiel-Caption wird hier angezeigt..."}
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {brandKit.recommended_hashtags?.slice(0, 5).map((tag: string, idx: number) => (
                  <span key={idx} className="text-xs text-primary">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stimmung & Keywords */}
      <Card className="animate-fade-in">
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg mb-4">💫 Markenstimmung</h3>
          <Badge variant="secondary" className="text-base px-4 py-2 mb-4">
            {brandKit.mood}
          </Badge>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Tonalität</p>
              <Badge variant="outline">{brandKit.brand_tone || brandKit.mood}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Keywords</p>
              <div className="flex flex-wrap gap-2">
                {brandKit.keywords?.map((keyword: string, idx: number) => (
                  <Badge key={idx} variant="outline">#{keyword}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Empfohlene Emojis</p>
              <div className="flex gap-2 text-2xl">
                {brandKit.emoji_suggestions?.map((emoji: string, idx: number) => (
                  <span key={idx}>{emoji}</span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Verwendungstipps */}
      <Card className="animate-fade-in">
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg mb-4">💡 Verwendungstipps</h3>
          <ul className="space-y-2">
            {brandKit.usage_examples?.map((example: string, idx: number) => (
              <li key={idx} className="text-sm flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{example}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
