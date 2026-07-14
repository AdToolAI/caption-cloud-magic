/**
 * VoiceProfileCard — Phase C, Baustein 3
 *
 * Per-character ElevenLabs voice tuning editor. Persists into
 * `brand_characters.voice_settings` (jsonb). When set, the SceneDialogStudio
 * uses these as the base profile for every TTS call from this character;
 * per-line tonality markers ([whisper], …) modulate ON TOP via
 * mergeWithTonality (resolveDialogVoice.ts).
 *
 * UI: 4 sliders + 1 toggle + Preview button. Local debounced save.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AvatarVoicePicker } from '@/components/brand-characters/AvatarVoicePicker';
import {
  DEFAULT_VOICE_TUNING,
  resolveCharacterVoiceProfile,
  type VoiceTuning,
} from '@/lib/voice-studio/resolveDialogVoice';

interface VoiceProfileCardProps {
  avatarId: string;
  avatar: {
    name?: string;
    default_voice_id?: string | null;
    default_voice_name?: string | null;
    voice_settings?: any;
  };
}

type ProfileState = Required<VoiceTuning>;

const PREVIEW_TEXTS = [
  "Hi, I'm here to help you tell your story.",
  'Every great brand starts with a clear voice.',
  'Let me show you what we can build together.',
];

export function VoiceProfileCard({ avatarId, avatar }: VoiceProfileCardProps) {
  const qc = useQueryClient();
  const initial = useMemo<ProfileState>(() => {
    const fromDb = resolveCharacterVoiceProfile(avatar);
    return { ...DEFAULT_VOICE_TUNING, ...(fromDb ?? {}) };
  }, [avatar]);

  const [profile, setProfile] = useState<ProfileState>(initial);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const hasProfile = !!avatar.voice_settings;
  const voiceId = avatar.default_voice_id || '';

  // Sync when avatar id changes
  useEffect(() => {
    setProfile(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarId]);

  const persist = async (next: ProfileState) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('brand_characters')
        .update({ voice_settings: next } as any)
        .eq('id', avatarId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['avatar-detail', avatarId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save voice profile');
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof ProfileState>(key: K, value: ProfileState[K]) => {
    const next = { ...profile, [key]: value };
    setProfile(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persist(next), 600);
  };

  const resetToDefault = async () => {
    setProfile(DEFAULT_VOICE_TUNING);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('brand_characters')
        .update({ voice_settings: null } as any)
        .eq('id', avatarId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['avatar-detail', avatarId] });
      toast.success('Reset to ElevenLabs defaults');
    } catch (e: any) {
      toast.error(e?.message || 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  const playPreview = async () => {
    if (!voiceId) {
      toast.error('Set a default voice first (Avatar settings).');
      return;
    }
    setPreviewing(true);
    try {
      const text = PREVIEW_TEXTS[Math.floor(Math.random() * PREVIEW_TEXTS.length)];
      const { data, error } = await supabase.functions.invoke('preview-voice', {
        body: {
          text,
          voiceId,
          stability: profile.stability,
          similarityBoost: profile.similarityBoost,
          style: profile.style,
          useSpeakerBoost: profile.useSpeakerBoost,
          speed: profile.speed,
        },
      });
      if (error) throw error;
      const b64 = (data as any)?.audioContent;
      if (!b64) throw new Error('No audio returned');
      const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
      audio.onended = () => setPreviewing(false);
      audio.onerror = () => setPreviewing(false);
      await audio.play();
    } catch (e: any) {
      toast.error(e?.message || 'Preview failed');
      setPreviewing(false);
    }
  };

  return (
    <Card className="p-4 bg-card/60 border-primary/15">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <h2 className="font-serif text-lg">Voice Profile</h2>
            {hasProfile && (
              <span className="inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                Brand
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Fine-tune how {avatar.name || 'this avatar'} sounds. Applied to every dialog line
            unless a per-line tonality marker overrides it.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={playPreview}
          disabled={previewing || !voiceId}
          className="gap-1.5 shrink-0"
          title={voiceId ? 'Preview with current settings' : 'Set a default voice first'}
        >
          {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Preview
        </Button>
      </div>

      <div className="space-y-4">
        <SliderRow
          label="Stability"
          hint="Higher = consistent, lower = expressive."
          value={profile.stability}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateField('stability', v)}
        />
        <SliderRow
          label="Similarity"
          hint="How closely to match the original voice timbre."
          value={profile.similarityBoost}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateField('similarityBoost', v)}
        />
        <SliderRow
          label="Style"
          hint="0 = neutral delivery, 1 = max stylization."
          value={profile.style}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateField('style', v)}
        />
        <SliderRow
          label="Speed"
          hint="0.7 = slow, 1.0 = normal, 1.2 = fast."
          value={profile.speed}
          min={0.7}
          max={1.2}
          step={0.05}
          format={(n) => `${n.toFixed(2)}×`}
          onChange={(v) => updateField('speed', v)}
        />

        <div className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-2">
          <div>
            <Label className="text-[11px] font-medium">Speaker Boost</Label>
            <p className="text-[10px] text-muted-foreground">
              Enhances clarity and voice similarity. Recommended on.
            </p>
          </div>
          <Switch
            checked={profile.useSpeakerBoost}
            onCheckedChange={(v) => updateField('useSpeakerBoost', v)}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={resetToDefault}
          className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
          disabled={saving}
        >
          <RotateCcw className="h-3 w-3" />
          Reset to defaults
        </Button>
        <span className="text-[10px] text-muted-foreground">
          {saving ? 'Saving…' : hasProfile ? 'Saved · used in every dialog' : 'Using ElevenLabs defaults'}
        </span>
      </div>
    </Card>
  );
}

interface SliderRowProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
}

function SliderRow({ label, hint, value, min, max, step, onChange, format }: SliderRowProps) {
  const display = format ? format(value) : value.toFixed(2);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-[11px] font-medium">{label}</Label>
          <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>
        </div>
        <span className="text-xs font-mono text-primary tabular-nums">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </div>
  );
}

export default VoiceProfileCard;
