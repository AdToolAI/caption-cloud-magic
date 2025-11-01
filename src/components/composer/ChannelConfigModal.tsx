import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ChevronDown } from 'lucide-react';

export interface ChannelConfig {
  profileId?: string;
  autoFix: boolean;
  watermarkOverride?: any;
  timeOffset: number; // Sekunden
}

interface ChannelConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: string;
  currentConfig?: ChannelConfig;
  onSave: (config: ChannelConfig) => void;
}

export function ChannelConfigModal({
  open,
  onOpenChange,
  channel,
  currentConfig,
  onSave
}: ChannelConfigModalProps) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string | undefined>(currentConfig?.profileId);
  const [autoFix, setAutoFix] = useState(currentConfig?.autoFix ?? true);
  const [timeOffset, setTimeOffset] = useState(currentConfig?.timeOffset ?? 0);

  useEffect(() => {
    if (open && user) {
      loadProfiles();
    }
  }, [open, user, channel]);

  const loadProfiles = async () => {
    if (!user) return;

    // Get user's workspace first
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)
      .single();

    if (!workspace) return;

    const { data, error } = await supabase
      .from('media_profiles')
      .select('*')
      .eq('workspace_id', workspace.id)
      .eq('platform', channel)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (!error && data) {
      setProfiles(data);
    }
  };

  const handleSave = () => {
    onSave({
      profileId: selectedProfile,
      autoFix,
      timeOffset,
      watermarkOverride: undefined // Simplified for now
    });
    onOpenChange(false);
  };

  const timeOffsetHours = Math.floor(timeOffset / 3600);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {channel.toUpperCase()} Einstellungen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Profil-Auswahl */}
          <div className="space-y-2">
            <Label>Medien-Profil</Label>
            <Select value={selectedProfile} onValueChange={setSelectedProfile}>
              <SelectTrigger>
                <SelectValue placeholder="Standard (keine Anpassung)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Standard (keine Anpassung)</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name} {profile.is_default && '(Standard)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auto-Fix Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Fix</Label>
              <p className="text-xs text-muted-foreground">
                Medien automatisch anpassen
              </p>
            </div>
            <Switch checked={autoFix} onCheckedChange={setAutoFix} />
          </div>

          {autoFix && selectedProfile && (
            <Alert>
              <AlertDescription className="text-xs">
                Dein Video wird automatisch umgerechnet (Format, Bitrate, etc.)
              </AlertDescription>
            </Alert>
          )}

          {/* Zeitversatz */}
          <div className="space-y-2">
            <Label>Zeitversatz</Label>
            <Select 
              value={timeOffset.toString()} 
              onValueChange={(v) => setTimeOffset(parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sofort (+0h)</SelectItem>
                <SelectItem value="3600">+1 Stunde</SelectItem>
                <SelectItem value="7200">+2 Stunden</SelectItem>
                <SelectItem value="21600">+6 Stunden</SelectItem>
                <SelectItem value="43200">+12 Stunden</SelectItem>
                <SelectItem value="86400">+24 Stunden</SelectItem>
              </SelectContent>
            </Select>
            {timeOffset > 0 && (
              <Alert>
                <AlertDescription className="text-xs">
                  Post wird auf {channel} +{timeOffsetHours}h nach Start veröffentlicht.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Wasserzeichen Override - Collapsed */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
              <ChevronDown className="h-4 w-4" />
              Wasserzeichen (erweitert)
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <p className="text-xs text-muted-foreground">
                Funktion in Entwicklung - Wasserzeichen werden aus dem Profil übernommen.
              </p>
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
