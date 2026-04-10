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
import { useTranslation } from '@/hooks/useTranslation';

export interface ChannelConfig {
  profileId?: string;
  autoFix: boolean;
  watermarkOverride?: any;
  timeOffset: number;
}

interface ChannelConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: string;
  currentConfig?: ChannelConfig;
  onSave: (config: ChannelConfig) => void;
}

export function ChannelConfigModal({ open, onOpenChange, channel, currentConfig, onSave }: ChannelConfigModalProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string | undefined>(currentConfig?.profileId);
  const [autoFix, setAutoFix] = useState(currentConfig?.autoFix ?? true);
  const [timeOffset, setTimeOffset] = useState(currentConfig?.timeOffset ?? 0);

  useEffect(() => { if (open && user) loadProfiles(); }, [open, user, channel]);

  const loadProfiles = async () => {
    if (!user) return;
    const { data: workspace } = await supabase.from('workspaces').select('id').eq('owner_id', user.id).limit(1).single();
    if (!workspace) return;
    const { data, error } = await supabase.from('media_profiles').select('*').eq('workspace_id', workspace.id).eq('platform', channel).order('is_default', { ascending: false }).order('created_at', { ascending: false });
    if (!error && data) setProfiles(data);
  };

  const handleSave = () => {
    onSave({ profileId: selectedProfile, autoFix, timeOffset, watermarkOverride: undefined });
    onOpenChange(false);
  };

  const timeOffsetHours = Math.floor(timeOffset / 3600);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('composer.channelSettings', { channel: channel.toUpperCase() })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('composer.mediaProfile')}</Label>
            <Select value={selectedProfile} onValueChange={setSelectedProfile}>
              <SelectTrigger><SelectValue placeholder={t('composer.defaultNoAdjust')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('composer.defaultNoAdjust')}</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name} {profile.is_default && '(Standard)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('composer.autoFix')}</Label>
              <p className="text-xs text-muted-foreground">{t('composer.autoFixDesc')}</p>
            </div>
            <Switch checked={autoFix} onCheckedChange={setAutoFix} />
          </div>

          {autoFix && selectedProfile && (
            <Alert><AlertDescription className="text-xs">{t('composer.autoFixHint')}</AlertDescription></Alert>
          )}

          <div className="space-y-2">
            <Label>{t('composer.timeOffset')}</Label>
            <Select value={timeOffset.toString()} onValueChange={(v) => setTimeOffset(parseInt(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('composer.immediately')}</SelectItem>
                <SelectItem value="3600">{t('composer.plus1h')}</SelectItem>
                <SelectItem value="7200">{t('composer.plus2h')}</SelectItem>
                <SelectItem value="21600">{t('composer.plus6h')}</SelectItem>
                <SelectItem value="43200">{t('composer.plus12h')}</SelectItem>
                <SelectItem value="86400">{t('composer.plus24h')}</SelectItem>
              </SelectContent>
            </Select>
            {timeOffset > 0 && (
              <Alert><AlertDescription className="text-xs">{t('composer.timeOffsetHint', { channel, hours: timeOffsetHours })}</AlertDescription></Alert>
            )}
          </div>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
              <ChevronDown className="h-4 w-4" />
              {t('composer.watermarkAdvanced')}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <p className="text-xs text-muted-foreground">{t('composer.watermarkDev')}</p>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('composer.cancel')}</Button>
          <Button onClick={handleSave}>{t('composer.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
