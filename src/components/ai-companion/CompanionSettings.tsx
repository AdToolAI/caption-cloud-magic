import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Bot, Volume2, Mic, Sparkles, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CompanionSettingsProps {
  userId: string;
  onClose: () => void;
  onSettingsChange: (settings: CompanionPreferences) => void;
}

export interface CompanionPreferences {
  bot_name: string;
  voice_id: string;
  voice_enabled: boolean;
  speech_input_enabled: boolean;
  personality: 'professional' | 'casual' | 'friendly';
  auto_speak: boolean;
}

const VOICE_OPTIONS = [
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', gender: 'Weiblich', accent: 'Amerikanisch' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Weiblich', accent: 'Amerikanisch' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'Weiblich', accent: 'Amerikanisch' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'Weiblich', accent: 'Amerikanisch' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'Weiblich', accent: 'Britisch' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'Männlich', accent: 'Australisch' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'Männlich', accent: 'Britisch' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'Männlich', accent: 'Amerikanisch' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'Männlich', accent: 'Amerikanisch' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'Männlich', accent: 'Britisch' },
];

const DEFAULT_PREFERENCES: CompanionPreferences = {
  bot_name: 'AdTool AI',
  voice_id: '9BWtsMINqrJLrRacOk9x', // Aria
  voice_enabled: false,
  speech_input_enabled: false,
  personality: 'friendly',
  auto_speak: false,
};

export function CompanionSettings({ userId, onClose, onSettingsChange }: CompanionSettingsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompanionPreferences>(DEFAULT_PREFERENCES);
  const [previewingVoice, setPreviewingVoice] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [userId]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('companion_user_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .single();

      if (data?.preferences) {
        const prefs = data.preferences as Record<string, unknown>;
        setSettings({
          ...DEFAULT_PREFERENCES,
          ...prefs,
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      // First try to update existing record
      const { data: existing } = await supabase
        .from('companion_user_preferences')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('companion_user_preferences')
          .update({
            preferences: JSON.parse(JSON.stringify(settings)),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('companion_user_preferences')
          .insert([{
            user_id: userId,
            preferences: JSON.parse(JSON.stringify(settings)),
          }]);
        if (error) throw error;
      }

      onSettingsChange(settings);
      toast({
        title: 'Einstellungen gespeichert',
        description: `${settings.bot_name} ist jetzt konfiguriert.`,
      });
      onClose();
      toast({
        title: 'Einstellungen gespeichert',
        description: `${settings.bot_name} ist jetzt konfiguriert.`,
      });
      onClose();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Fehler',
        description: 'Einstellungen konnten nicht gespeichert werden.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const previewVoice = async () => {
    setPreviewingVoice(true);
    try {
      const { data, error } = await supabase.functions.invoke('preview-voice', {
        body: {
          text: `Hallo! Ich bin ${settings.bot_name}, dein persönlicher AdTool-Assistent.`,
          voiceId: settings.voice_id,
        }
      });

      if (error) throw error;

      if (data?.audioContent) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audioContent}`);
        await audio.play();
      }
    } catch (error) {
      console.error('Error previewing voice:', error);
      toast({
        title: 'Fehler',
        description: 'Sprachvorschau konnte nicht abgespielt werden.',
        variant: 'destructive',
      });
    } finally {
      setPreviewingVoice(false);
    }
  };

  const selectedVoice = VOICE_OPTIONS.find(v => v.id === settings.voice_id);

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="absolute inset-0 bg-card/95 backdrop-blur-xl flex items-center justify-center"
      >
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute inset-0 bg-card/95 backdrop-blur-xl flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Bot-Einstellungen</h3>
        </div>
      </div>

      {/* Settings Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Bot Name */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Bot className="w-4 h-4" />
            Bot-Name
          </Label>
          <Input
            value={settings.bot_name}
            onChange={(e) => setSettings(prev => ({ ...prev, bot_name: e.target.value }))}
            placeholder="Gib deinem Assistenten einen Namen"
            className="bg-muted/30 border-white/10"
          />
          <p className="text-xs text-muted-foreground">
            Dein Assistent wird sich mit diesem Namen vorstellen
          </p>
        </div>

        {/* Voice Selection */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            Stimme
          </Label>
          <Select
            value={settings.voice_id}
            onValueChange={(value) => setSettings(prev => ({ ...prev, voice_id: value }))}
          >
            <SelectTrigger className="bg-muted/30 border-white/10">
              <SelectValue>
                {selectedVoice ? `${selectedVoice.name} (${selectedVoice.gender})` : 'Stimme wählen'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {VOICE_OPTIONS.map(voice => (
                <SelectItem key={voice.id} value={voice.id}>
                  <div className="flex items-center justify-between w-full">
                    <span>{voice.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {voice.gender} • {voice.accent}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={previewVoice}
            disabled={previewingVoice}
            className="w-full mt-2"
          >
            {previewingVoice ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Volume2 className="w-4 h-4 mr-2" />
            )}
            Stimme anhören
          </Button>
        </div>

        {/* Voice Output Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              Sprachausgabe
            </Label>
            <p className="text-xs text-muted-foreground">
              Bot-Antworten werden vorgelesen
            </p>
          </div>
          <Switch
            checked={settings.voice_enabled}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, voice_enabled: checked }))}
          />
        </div>

        {/* Auto Speak Toggle */}
        {settings.voice_enabled && (
          <div className="flex items-center justify-between pl-6 border-l-2 border-primary/30">
            <div className="space-y-0.5">
              <Label>Automatisch vorlesen</Label>
              <p className="text-xs text-muted-foreground">
                Jede Antwort wird automatisch vorgelesen
              </p>
            </div>
            <Switch
              checked={settings.auto_speak}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, auto_speak: checked }))}
            />
          </div>
        )}

        {/* Voice Input Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Spracheingabe
            </Label>
            <p className="text-xs text-muted-foreground">
              Sprich mit dem Bot per Mikrofon
            </p>
          </div>
          <Switch
            checked={settings.speech_input_enabled}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, speech_input_enabled: checked }))}
          />
        </div>

        {/* Personality */}
        <div className="space-y-3">
          <Label>Persönlichkeit</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'professional', label: '💼 Professionell' },
              { value: 'friendly', label: '😊 Freundlich' },
              { value: 'casual', label: '🎉 Locker' },
            ].map(option => (
              <Button
                key={option.value}
                variant={settings.personality === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSettings(prev => ({ ...prev, personality: option.value as CompanionPreferences['personality'] }))}
                className="text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="p-4 border-t border-white/10">
        <Button
          onClick={saveSettings}
          disabled={saving}
          className="w-full bg-primary hover:bg-primary/90"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Einstellungen speichern
        </Button>
      </div>
    </motion.div>
  );
}
