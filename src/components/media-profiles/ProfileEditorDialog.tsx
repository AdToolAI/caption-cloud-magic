import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MonacoJsonEditor } from './MonacoJsonEditor';
import { MediaPreview } from './MediaPreview';
import { PresetSelector } from './PresetSelector';
import { mediaProfileConfigSchema, MediaProfile, Platform, MediaType, MediaProfileConfig } from '@/lib/mediaProfileSchema';
import { getPreset } from '@/lib/mediaProfilePresets';
import { toast } from '@/hooks/use-toast';

interface ProfileEditorDialogProps {
  profile: MediaProfile | null;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (profile: Omit<MediaProfile, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
}

export function ProfileEditorDialog({
  profile,
  workspaceId,
  open,
  onOpenChange,
  onSave
}: ProfileEditorDialogProps) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [type, setType] = useState<MediaType>('image');
  const [configJson, setConfigJson] = useState('{}');
  const [isValid, setIsValid] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [parsedConfig, setParsedConfig] = useState<MediaProfileConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setPlatform(profile.platform);
      setType(profile.type);
      setConfigJson(JSON.stringify(profile.config, null, 2));
    } else {
      const defaultConfig = {
        aspect: '1:1',
        width: 1080,
        height: 1080,
        fitMode: 'cover' as const,
        sizeLimitMb: 30,
        type: 'image' as const
      };
      setName('');
      setPlatform('instagram');
      setType('image');
      setConfigJson(JSON.stringify(defaultConfig, null, 2));
    }
  }, [profile, open]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(configJson);
      const result = mediaProfileConfigSchema.safeParse(parsed);
      if (result.success) {
        setParsedConfig(result.data);
      } else {
        setParsedConfig(null);
      }
    } catch {
      setParsedConfig(null);
    }
  }, [configJson]);

  const handleSelectPreset = (presetKey: string) => {
    const preset = getPreset(platform, presetKey);
    if (preset) {
      setConfigJson(JSON.stringify(preset.config, null, 2));
      setType(preset.config.type);
      toast({
        title: 'Preset geladen',
        description: `${preset.name} wurde geladen.`
      });
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Fehler',
        description: 'Name ist erforderlich.',
        variant: 'destructive'
      });
      return;
    }

    if (!isValid) {
      toast({
        title: 'Ungültige Konfiguration',
        description: 'Bitte behebe die Validierungsfehler.',
        variant: 'destructive'
      });
      return;
    }

    setIsSaving(true);
    try {
      const config = JSON.parse(configJson);
      await onSave({
        workspace_id: workspaceId,
        name: name.trim(),
        platform,
        type,
        config,
        is_default: false
      });
      toast({
        title: 'Erfolg',
        description: profile ? 'Profil wurde aktualisiert.' : 'Profil wurde erstellt.'
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Speichern fehlgeschlagen.',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {profile ? 'Profil bearbeiten' : 'Neues Profil erstellen'}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="config" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="config">Konfiguration</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="flex-1 overflow-y-auto space-y-4 p-1">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Instagram Reels 9:16 HD"
                maxLength={100}
              />
            </div>

            <div>
              <Label htmlFor="platform">Plattform *</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger id="platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="x">X (Twitter)</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="type">Medientyp *</Label>
              <Select value={type} onValueChange={(v) => setType(v as MediaType)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Bild</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <PresetSelector
              platform={platform}
              onSelectPreset={handleSelectPreset}
              disabled={isSaving}
            />

            <div>
              <Label>Konfiguration (JSON) *</Label>
              <MonacoJsonEditor
                value={configJson}
                onChange={setConfigJson}
                onValidationChange={(valid, errors) => {
                  setIsValid(valid);
                  setValidationErrors(errors);
                }}
                height="350px"
              />
            </div>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 overflow-y-auto p-1">
            <MediaPreview config={parsedConfig} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSaving}>
            {isSaving ? 'Speichert...' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
