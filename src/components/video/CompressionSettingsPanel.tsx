import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Loader2, Settings } from 'lucide-react';

export type CompressionProfile = 'social-media' | 'presentation' | 'archive' | 'custom';

interface CompressionSettings {
  profile: CompressionProfile;
  maxSizeMb?: number;
  quality?: 'high' | 'medium' | 'low';
  codec?: 'h264' | 'h265';
}

interface CompressionSettingsPanelProps {
  onApply: (settings: CompressionSettings) => Promise<void>;
  loading?: boolean;
}

const profileDescriptions: Record<CompressionProfile, string> = {
  'social-media': tx({ de: 'Optimiert für Social Media (max 50MB, 1080p)', en: 'Optimized for social media (max 50MB, 1080p)', es: 'Optimizado para redes sociales (máximo 50 MB, 1080p)' }),
  'presentation': tx({ de: 'Hohe Qualität für Präsentationen (max 200MB, 4K)', en: 'High quality for presentations (max 200MB, 4K)', es: 'Alta calidad para presentaciones (máximo 200 MB, 4K)' }),
  'archive': tx({ de: 'Minimale Komprimierung für Archivierung', en: 'Minimum compression for archiving', es: 'Compresión mínima para archivar' }),
  'custom': tx({ de: 'Eigene Einstellungen', en: 'Own settings', es: 'Configuraciones propias' }),
};

export const CompressionSettingsPanel = ({
  onApply,
  loading = false,
}: CompressionSettingsPanelProps) => {
  const [profile, setProfile] = useState<CompressionProfile>('social-media');
  const [maxSizeMb, setMaxSizeMb] = useState(50);
  const [quality, setQuality] = useState<'high' | 'medium' | 'low'>('high');
  const [codec, setCodec] = useState<'h264' | 'h265'>('h264');

  const handleApply = async () => {
    const settings: CompressionSettings = {
      profile,
      ...(profile === 'custom' && {
        maxSizeMb,
        quality,
        codec,
      }),
    };

    await onApply(settings);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          {tx({ de: "Komprimierungseinstellungen", en: "Compression settings", es: "Compression settings" })}
        </CardTitle>
        <CardDescription>
          {tx({ de: "Wähle ein Profil oder passe die Einstellungen manuell an", en: "Select a profile or adjust settings manually", es: "Selecciona un perfil o ajusta la configuración manualmente" })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Profile Selection */}
        <div className="space-y-2">
          <Label htmlFor="profile">Profil</Label>
          <Select
            value={profile}
            onValueChange={(value) => setProfile(value as CompressionProfile)}
          >
            <SelectTrigger id="profile">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="social-media">Social Media</SelectItem>
              <SelectItem value="presentation">{tx({ de: "Präsentation", en: "Presentation", es: "Presentación" })}</SelectItem>
              <SelectItem value="archive">Archiv</SelectItem>
              <SelectItem value="custom">{tx({ de: "Benutzerdefiniert", en: "Custom", es: "Personalizado" })}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {profileDescriptions[profile]}
          </p>
        </div>

        {/* Custom Settings */}
        {profile === 'custom' && (
          <>
            {/* Max File Size */}
            <div className="space-y-2">
              <Label>{tx({ de: "Maximale Dateigröße:", en: "Maximum file size:", es: "Tamaño máximo:" })} {maxSizeMb} MB</Label>
              <Slider
                value={[maxSizeMb]}
                onValueChange={([value]) => setMaxSizeMb(value)}
                min={10}
                max={500}
                step={10}
                className="w-full"
              />
            </div>

            {/* Quality */}
            <div className="space-y-2">
              <Label htmlFor="quality">{tx({ de: "Qualität", en: "Quality", es: "Calidad" })}</Label>
              <Select
                value={quality}
                onValueChange={(value) => setQuality(value as 'high' | 'medium' | 'low')}
              >
                <SelectTrigger id="quality">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">{tx({ de: 'Hoch', en: 'High', es: 'Alta' })}</SelectItem>
                  <SelectItem value="medium">Mittel</SelectItem>
                  <SelectItem value="low">{tx({ de: 'Niedrig', en: 'Low', es: 'Baja' })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Codec */}
            <div className="space-y-2">
              <Label htmlFor="codec">Codec</Label>
              <Select
                value={codec}
                onValueChange={(value) => setCodec(value as 'h264' | 'h265')}
              >
                <SelectTrigger id="codec">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="h264">H.264 (Standard)</SelectItem>
                  <SelectItem value="h265">H.265 (Bessere Kompression)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Apply Button */}
        <Button
          onClick={handleApply}
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {tx({ de: "Komprimierung läuft...", en: "Compression in progress...", es: "Comprimiendo..." })}
            </>
          ) : (
            tx({ de: "Komprimierung starten", en: "Start compression", es: "Iniciar compresión" })
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
