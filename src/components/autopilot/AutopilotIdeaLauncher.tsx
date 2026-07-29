/**
 * The one-field briefing.
 *
 * The customer writes a sentence and, optionally, drops in their own images.
 * Everything else on this screen is a small decision they actually care about —
 * cast, length, voice, lip-sync. No prompt fields, no model names.
 */

import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Sparkles,
  ImagePlus,
  X,
  AlertTriangle,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { ASSET_ROLES, type AssetRole } from '@/lib/autopilot/assetRoles';
import { MAX_TOTAL_SECONDS, MIN_TOTAL_SECONDS, clampTotalDuration } from '@/lib/autopilot/ideaFeasibility';
import type { AutopilotIdea, AutopilotStrategy } from '@/lib/autopilot/strategy';
import { useBrandCharacters } from '@/hooks/useBrandCharacters';
import { cn } from '@/lib/utils';

const MAX_ASSETS = 8;

export interface LauncherOptions {
  aspect: string;
  language: string;
  duration: number;
  voiceover: boolean;
  lipSync: boolean;
  lipSyncSpeakers: number;
  characterIds: string[];
}

export interface UploadedAsset {
  id: string;
  role: AssetRole;
  note: string;
  url: string;
  fileName: string;
  analyzing: boolean;
  description?: string;
  warning?: string | null;
  usable: boolean;
}

interface Props {
  onIdeas: (result: {
    ideaRecordId: string;
    strategy: AutopilotStrategy;
    ideas: AutopilotIdea[];
    brief: string;
    options: LauncherOptions;
    assets: UploadedAsset[];
  }) => void;
}

const ASPECTS = [
  { value: '9:16', label: 'Hochkant — Reels, Shorts, TikTok' },
  { value: '16:9', label: 'Quer — YouTube, Website' },
  { value: '1:1', label: 'Quadrat — Feed' },
  { value: '4:5', label: 'Portrait — Feed' },
];

const LANGUAGES = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'Englisch' },
  { value: 'es', label: 'Spanisch' },
];

export function AutopilotIdeaLauncher({ onIdeas }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { characters } = useBrandCharacters();

  const [brief, setBrief] = useState('');
  const [options, setOptions] = useState<LauncherOptions>({
    aspect: '9:16',
    language: 'de',
    duration: 30,
    voiceover: true,
    lipSync: false,
    lipSyncSpeakers: 1,
    characterIds: [],
  });
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof LauncherOptions>(key: K, value: LauncherOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  const toggleCharacter = (id: string) =>
    setOptions((prev) => ({
      ...prev,
      characterIds: prev.characterIds.includes(id)
        ? prev.characterIds.filter((c) => c !== id)
        : prev.characterIds.length >= 4
          ? prev.characterIds
          : [...prev.characterIds, id],
    }));

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_ASSETS - assets.length;
    if (room <= 0) {
      toast({ title: 'Maximal 8 Bilder', description: 'Mehr verarbeitet der Autopilot nicht sauber.' });
      return;
    }

    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Nicht angemeldet.');

      for (const file of Array.from(files).slice(0, room)) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 12 * 1024 * 1024) {
          toast({ title: `${file.name} ist zu groß`, description: 'Maximal 12 MB pro Bild.', variant: 'destructive' });
          continue;
        }

        // RLS on this bucket requires the user id as the first path segment.
        const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`;
        const { error: uploadError } = await supabase.storage
          .from('autopilot-assets')
          .upload(path, file, { upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;

        const { data: pub } = supabase.storage.from('autopilot-assets').getPublicUrl(path);
        const publicUrl = pub.publicUrl;

        const { data: row, error: insertError } = await supabase
          .from('autopilot_assets')
          .insert({
            user_id: userId,
            role: 'product',
            storage_path: path,
            public_url: publicUrl,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
          })
          .select('id')
          .single();
        if (insertError) throw insertError;

        const asset: UploadedAsset = {
          id: row.id,
          role: 'product',
          note: '',
          url: publicUrl,
          fileName: file.name,
          analyzing: true,
          usable: true,
        };
        setAssets((prev) => [...prev, asset]);
        void analyzeAsset(asset);
      }
    } catch (err) {
      toast({
        title: 'Upload fehlgeschlagen',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const analyzeAsset = async (asset: UploadedAsset, roleOverride?: AssetRole, note?: string) => {
    setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, analyzing: true } : a)));
    try {
      const { data, error } = await supabase.functions.invoke('autopilot-analyze-asset', {
        body: {
          asset_id: asset.id,
          image_url: asset.url,
          role: roleOverride ?? asset.role,
          user_note: note ?? asset.note,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? {
                ...a,
                analyzing: false,
                description: data.analysis?.description,
                warning: data.analysis?.warning ?? null,
                usable: data.analysis?.usable !== false,
              }
            : a,
        ),
      );
    } catch {
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, analyzing: false } : a)));
    }
  };

  const updateAsset = (id: string, patch: Partial<UploadedAsset>) =>
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const removeAsset = async (asset: UploadedAsset) => {
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    await supabase.from('autopilot_assets').delete().eq('id', asset.id);
  };

  const handleGenerate = async () => {
    if (brief.trim().length < 8) {
      toast({
        title: 'Noch zu knapp',
        description: 'Ein Satz reicht — sag, worum es gehen soll und für wen.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('autopilot-ideas', {
        body: {
          brief: brief.trim(),
          language: options.language,
          aspect_ratio: options.aspect,
          target_duration_seconds: clampTotalDuration(options.duration),
          voiceover: options.voiceover,
          lip_sync: options.lipSync,
          lip_sync_speakers: options.lipSyncSpeakers,
          characters: characters
            .filter((c) => options.characterIds.includes(c.id))
            .map((c) => ({ id: c.id, name: c.name, description: c.description ?? undefined })),
          assets: assets
            .filter((a) => a.usable)
            .map((a) => ({ id: a.id, role: a.role, description: a.description ?? '', note: a.note })),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      onIdeas({
        ideaRecordId: data.idea_record_id,
        strategy: data.strategy,
        ideas: data.ideas,
        brief: brief.trim(),
        options,
        assets,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({
        title: 'Ideen konnten nicht entwickelt werden',
        description:
          message === 'credits_exhausted'
            ? 'Dein KI-Guthaben ist aufgebraucht.'
            : message === 'rate_limited'
              ? 'Zu viele Anfragen — bitte kurz warten.'
              : message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-card/60 p-6 backdrop-blur">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-serif text-xl">Was sollen wir für dich drehen?</h2>
          <p className="text-sm text-muted-foreground">
            Ein Satz genügt. Du bekommst fünf Ideen, die wir auch wirklich umsetzen können.
          </p>
        </div>
      </div>

      <Textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={3}
        placeholder="z. B. Werbespot für unsere neue Kaffeemischung — für Leute, die morgens keine Zeit haben."
        className="resize-none text-base"
      />

      {/* -------------------------------------------------------- own images */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-sm">Eigene Bilder (optional)</Label>
          <span className="text-xs text-muted-foreground">{assets.length}/{MAX_ASSETS}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {assets.map((asset) => (
            <div key={asset.id} className="rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="flex gap-3">
                <img
                  src={asset.url}
                  alt={asset.fileName}
                  loading="lazy"
                  className="h-16 w-16 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">{asset.fileName}</p>
                    <button
                      type="button"
                      onClick={() => removeAsset(asset)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="Bild entfernen"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <Select
                    value={asset.role}
                    onValueChange={(value) => {
                      updateAsset(asset.id, { role: value as AssetRole });
                      void analyzeAsset(asset, value as AssetRole);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ASSET_ROLES).map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Input
                value={asset.note}
                onChange={(e) => updateAsset(asset.id, { note: e.target.value })}
                onBlur={() => asset.note && void analyzeAsset(asset, asset.role, asset.note)}
                placeholder={ASSET_ROLES[asset.role].placeholder}
                className="mt-2 h-8 text-xs"
              />
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                {ASSET_ROLES[asset.role].hint}
              </p>

              {asset.analyzing ? (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Bild wird gelesen…
                </p>
              ) : asset.warning ? (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-500">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {asset.warning}
                </p>
              ) : asset.description ? (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" /> Erkannt und einsatzbereit
                </p>
              ) : null}
            </div>
          ))}

          {assets.length < MAX_ASSETS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-background/20 p-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              Logo, Produkt oder Ort hochladen
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* ------------------------------------------------------------ choices */}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm">Format</Label>
          <Select value={options.aspect} onValueChange={(v) => set('aspect', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASPECTS.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Sprache</Label>
          <Select value={options.language} onValueChange={(v) => set('language', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Länge</Label>
            <span className="text-sm text-muted-foreground">{options.duration} Sekunden</span>
          </div>
          <Slider
            value={[options.duration]}
            onValueChange={([v]) => set('duration', v)}
            min={MIN_TOTAL_SECONDS}
            max={MAX_TOTAL_SECONDS}
            step={5}
          />
          <p className="text-xs text-muted-foreground">
            Mehr als 180 Sekunden produzieren wir bewusst nicht — darunter leidet die Qualität.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Voiceover</p>
            <p className="text-xs text-muted-foreground">Erzählerstimme über dem Film</p>
          </div>
          <Switch checked={options.voiceover} onCheckedChange={(v) => set('voiceover', v)} />
        </div>

        <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Lip-Sync</p>
              <p className="text-xs text-muted-foreground">Charaktere sprechen sichtbar</p>
            </div>
            <Switch checked={options.lipSync} onCheckedChange={(v) => set('lipSync', v)} />
          </div>
          {options.lipSync && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Sprecher im Bild</span>
                <span className="text-xs font-medium">{options.lipSyncSpeakers}</span>
              </div>
              <Slider
                value={[options.lipSyncSpeakers]}
                onValueChange={([v]) => set('lipSyncSpeakers', v)}
                min={1}
                max={4}
                step={1}
              />
            </div>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------------- cast */}
      {characters.length > 0 && (
        <div className="mt-6">
          <Label className="mb-2 flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" /> Cast aus Cast &amp; World (max. 4)
          </Label>
          <div className="flex flex-wrap gap-2">
            {characters.map((character) => {
              const active = options.characterIds.includes(character.id);
              return (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => toggleCharacter(character.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                    active
                      ? 'border-primary bg-primary/15 text-foreground'
                      : 'border-border/60 text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {character.portrait_url && (
                    <img
                      src={character.portrait_url}
                      alt={character.name}
                      loading="lazy"
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  )}
                  {character.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Button onClick={handleGenerate} disabled={loading} size="lg" className="mt-6 w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Strategie und Ideen entstehen…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" /> Fünf Ideen entwickeln
          </>
        )}
      </Button>

      {options.lipSync && options.characterIds.length === 0 && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-amber-500">
          <AlertTriangle className="h-3 w-3" /> Für Lip-Sync brauchst du mindestens einen Charakter aus Cast &amp; World.
        </p>
      )}

      <Badge variant="outline" className="mt-4 border-primary/30 text-[11px] font-normal text-muted-foreground">
        Bis hierhin kostet dich nichts außer der Ideenrunde — produziert wird erst nach deiner Freigabe.
      </Badge>
    </Card>
  );
}
