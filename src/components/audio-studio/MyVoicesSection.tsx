import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Play, Loader2, Trash2, Pencil, Check, X, Plus, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PREVIEW_TEXT: Record<string, string> = {
  de: 'Hallo, das ist ein kurzer Test meiner geklonten Stimme. Klingt das nach mir?',
  en: 'Hello, this is a short test of my cloned voice. Does it sound like me?',
  es: 'Hola, esta es una prueba corta de mi voz clonada. ¿Suena como yo?',
  fr: 'Bonjour, ceci est un court test de ma voix clonée.',
  it: 'Ciao, questo è un breve test della mia voce clonata.',
};

interface MyVoicesSectionProps {
  onCreate?: () => void;
}

export function MyVoicesSection({ onCreate }: MyVoicesSectionProps) {
  const { voices, deleteVoice, toggleVoiceActive, renameVoice } = useCustomVoices();
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handlePreview = async (voiceId: string, elevenId: string, lang: string) => {
    setPreviewingId(voiceId);
    try {
      const { data, error } = await supabase.functions.invoke('preview-voice', {
        body: {
          text: PREVIEW_TEXT[lang] ?? PREVIEW_TEXT.en,
          voiceId: elevenId,
        },
      });
      if (error) throw error;
      const audioB64 = data?.audioBase64 || data?.audio || data?.audioContent;
      if (!audioB64) throw new Error('Keine Audio-Daten erhalten');
      const audio = new Audio(`data:audio/mpeg;base64,${audioB64}`);
      await audio.play();
    } catch (err) {
      console.error('[MyVoicesSection] preview failed:', err);
      toast.error('Voice-Preview fehlgeschlagen');
    } finally {
      setPreviewingId(null);
    }
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    await renameVoice(renamingId, renameValue);
    setRenamingId(null);
    setRenameValue('');
  };

  if (voices.length === 0) {
    return (
      <Card
        id="my-voices"
        className="relative overflow-hidden backdrop-blur-xl bg-card/40 border-dashed border-primary/25 p-8 text-center"
      >
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Mic className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-1">Noch keine eigenen Stimmen</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
          Klone deine erste Stimme über das Voice Studio — Skript vorlesen, Mikrofon oder
          WhatsApp-Sprachnachricht.
        </p>
        {onCreate && (
          <Button
            onClick={onCreate}
            className="bg-gradient-to-r from-primary to-cyan-500 hover:opacity-90"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Erste Stimme erstellen
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div id="my-voices" className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Meine Stimmen</h2>
          <Badge variant="secondary" className="bg-primary/15 border border-primary/30 text-primary">
            {voices.length}
          </Badge>
        </div>
        {onCreate && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCreate}
            className="border-primary/30 hover:border-primary/60"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Neue Stimme
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <AnimatePresence initial={false}>
          {voices.map((v) => (
            <motion.div
              key={v.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card
                className={`backdrop-blur-xl bg-card/60 border p-4 transition-all ${
                  v.is_active
                    ? 'border-primary/30 hover:border-primary/60'
                    : 'border-border/40 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 border border-primary/30 flex items-center justify-center shrink-0">
                      <Mic className="w-4 h-4 text-primary" />
                    </div>
                    {renamingId === v.id ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          autoFocus
                          className="h-8 text-sm"
                        />
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={commitRename}>
                          <Check className="w-4 h-4 text-primary" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setRenamingId(null)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{v.name || 'Unbenannt'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {(v.language || 'en').toUpperCase()} ·{' '}
                          {new Date(v.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                  {renamingId !== v.id && (
                    <Badge
                      variant="outline"
                      className={
                        v.is_active
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 text-[10px]'
                          : 'bg-muted/40 border-border/50 text-muted-foreground text-[10px]'
                      }
                    >
                      {v.is_active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-border/50"
                    onClick={() => handlePreview(v.id, v.elevenlabs_voice_id, v.language)}
                    disabled={previewingId === v.id}
                  >
                    {previewingId === v.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-1.5" />
                        Preview
                      </>
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    title="Umbenennen"
                    onClick={() => startRename(v.id, v.name)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    title="Löschen"
                    onClick={() => setConfirmDeleteId(v.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
                  <span className="text-[11px] text-muted-foreground">
                    Für Voiceovers verfügbar
                  </span>
                  <Switch
                    checked={v.is_active}
                    onCheckedChange={(checked) => toggleVoiceActive(v.id, checked)}
                  />
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stimme löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Die geklonte Stimme wird aus deiner
              Bibliothek entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmDeleteId) await deleteVoice(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
