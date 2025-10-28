import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, AlertTriangle } from 'lucide-react';

export interface YouTubeConfig {
  privacyStatus: 'public' | 'unlisted' | 'private';
  madeForKids: boolean;
  categoryId: string;
  tags?: string[];
  license?: 'youtube' | 'creativeCommon';
  embeddable?: boolean;
  publicStatsViewable?: boolean;
}

interface YouTubeConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentConfig?: YouTubeConfig;
  onSave: (config: YouTubeConfig) => void;
}

const YOUTUBE_CATEGORIES = [
  { id: '1', name: 'Film & Animation' },
  { id: '2', name: 'Autos & Vehicles' },
  { id: '10', name: 'Music' },
  { id: '15', name: 'Pets & Animals' },
  { id: '17', name: 'Sports' },
  { id: '19', name: 'Travel & Events' },
  { id: '20', name: 'Gaming' },
  { id: '22', name: 'People & Blogs' },
  { id: '23', name: 'Comedy' },
  { id: '24', name: 'Entertainment' },
  { id: '25', name: 'News & Politics' },
  { id: '26', name: 'Howto & Style' },
  { id: '27', name: 'Education' },
  { id: '28', name: 'Science & Technology' },
];

export function YouTubeConfigModal({
  open,
  onOpenChange,
  currentConfig,
  onSave
}: YouTubeConfigModalProps) {
  const [privacyStatus, setPrivacyStatus] = useState<'public' | 'unlisted' | 'private'>(
    currentConfig?.privacyStatus || 'unlisted'
  );
  const [madeForKids, setMadeForKids] = useState(currentConfig?.madeForKids ?? false);
  const [categoryId, setCategoryId] = useState(currentConfig?.categoryId || '22');
  const [tagsInput, setTagsInput] = useState(currentConfig?.tags?.join(', ') || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [license, setLicense] = useState<'youtube' | 'creativeCommon'>(
    currentConfig?.license || 'youtube'
  );
  const [embeddable, setEmbeddable] = useState(currentConfig?.embeddable ?? true);
  const [publicStatsViewable, setPublicStatsViewable] = useState(
    currentConfig?.publicStatsViewable ?? true
  );

  const handleSave = () => {
    const tags = tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    onSave({
      privacyStatus,
      madeForKids,
      categoryId,
      tags,
      license,
      embeddable,
      publicStatsViewable,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>YouTube Einstellungen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Privacy Status */}
          <div className="space-y-2">
            <Label>Sichtbarkeit</Label>
            <Select value={privacyStatus} onValueChange={(v: any) => setPrivacyStatus(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">🌍 Öffentlich</SelectItem>
                <SelectItem value="unlisted">🔗 Nicht gelistet (Link erforderlich)</SelectItem>
                <SelectItem value="private">🔒 Privat</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {privacyStatus === 'public' && 'Video ist für alle sichtbar und durchsuchbar'}
              {privacyStatus === 'unlisted' && 'Nur mit Link zugänglich, nicht in Suche'}
              {privacyStatus === 'private' && 'Nur für dich sichtbar'}
            </p>
          </div>

          {/* Made for Kids - PFLICHT */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2">
                  Made for Kids
                  <span className="text-xs text-red-500">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  PFLICHT: Ist dieses Video speziell für Kinder gemacht?
                </p>
              </div>
              <Switch checked={madeForKids} onCheckedChange={setMadeForKids} />
            </div>
            <Alert variant={madeForKids ? "default" : "destructive"}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {madeForKids 
                  ? 'Video wird als "für Kinder geeignet" markiert (COPPA-Compliance)'
                  : 'Video wird als "nicht für Kinder" markiert (Standard für meiste Inhalte)'
                }
              </AlertDescription>
            </Alert>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Kategorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YOUTUBE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags (optional)</Label>
            <Input
              placeholder="gaming, tutorial, deutsch (komma-getrennt)"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Max. 500 Zeichen insgesamt. Tags helfen bei der Auffindbarkeit.
            </p>
          </div>

          {/* Advanced Settings */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
              <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Erweiterte Einstellungen
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 space-y-4">
              {/* License */}
              <div className="space-y-2">
                <Label>Lizenz</Label>
                <Select value={license} onValueChange={(v: any) => setLicense(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">Standard YouTube-Lizenz</SelectItem>
                    <SelectItem value="creativeCommon">Creative Commons (CC BY)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Embeddable */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Einbettbar</Label>
                  <p className="text-xs text-muted-foreground">
                    Erlaube das Einbetten auf anderen Websites
                  </p>
                </div>
                <Switch checked={embeddable} onCheckedChange={setEmbeddable} />
              </div>

              {/* Public Stats */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Öffentliche Statistiken</Label>
                  <p className="text-xs text-muted-foreground">
                    Zeige View-Count und Likes öffentlich an
                  </p>
                </div>
                <Switch checked={publicStatsViewable} onCheckedChange={setPublicStatsViewable} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
