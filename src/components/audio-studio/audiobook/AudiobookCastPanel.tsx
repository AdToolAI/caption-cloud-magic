import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Mic, Plus, Trash2, UserRound } from 'lucide-react';
import { UniversalVoiceLibraryPicker } from '@/components/voices/UniversalVoiceLibraryPicker';
import type { VoiceMeta } from '@/lib/elevenlabs-voices';
import type { AudiobookCast } from '@/lib/audiobook/manuscript';

interface Props {
  cast: AudiobookCast;
  language: string;
  onChange: (cast: AudiobookCast) => void;
}

type PickerTarget = { kind: 'narrator' } | { kind: 'character'; index: number } | null;

export function AudiobookCastPanel({ cast, language, onChange }: Props) {
  const [target, setTarget] = useState<PickerTarget>(null);
  const [newName, setNewName] = useState('');

  const pickerLanguage = (['de', 'en', 'es'].includes(language) ? language : 'all') as
    'de' | 'en' | 'es' | 'all';

  const handleSelect = (voice: VoiceMeta) => {
    if (!target) return;
    if (target.kind === 'narrator') {
      onChange({ ...cast, narrator: { voiceId: voice.id, voiceName: voice.name } });
    } else {
      const characters = cast.characters.map((c, i) =>
        i === target.index ? { ...c, voiceId: voice.id, voiceName: voice.name } : c);
      onChange({ ...cast, characters });
    }
    setTarget(null);
  };

  const addCharacter = () => {
    const name = newName.trim();
    if (!name) return;
    if (cast.characters.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    onChange({ ...cast, characters: [...cast.characters, { name, voiceId: '', voiceName: '' }] });
    setNewName('');
  };

  return (
    <Card className="p-5 space-y-5 bg-card/60 backdrop-blur-xl border-primary/20">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <UserRound className="w-4 h-4 text-primary" /> Besetzung
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Absätze im Format <span className="font-mono">Figur: Text</span> bekommen automatisch die
          Stimme der Figur — alles andere spricht der Erzähler.
        </p>
      </div>

      {/* Erzähler */}
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-background/40 p-3">
        <Badge variant="outline" className="border-primary/40 text-primary shrink-0">Erzähler</Badge>
        <span className="text-sm flex-1 truncate">
          {cast.narrator?.voiceName || <span className="text-muted-foreground">Keine Stimme gewählt</span>}
        </span>
        <Button size="sm" variant="outline" onClick={() => setTarget({ kind: 'narrator' })}>
          <Mic className="w-3.5 h-3.5 mr-1.5" /> Stimme wählen
        </Button>
      </div>

      {/* Figuren */}
      <div className="space-y-2">
        {cast.characters.map((character, index) => (
          <div key={character.name} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/30 p-3">
            <Badge variant="outline" className="shrink-0 max-w-[9rem] truncate">{character.name}</Badge>
            <span className="text-sm flex-1 truncate">
              {character.voiceName || <span className="text-muted-foreground">Keine Stimme</span>}
            </span>
            <Button size="sm" variant="outline" onClick={() => setTarget({ kind: 'character', index })}>
              <Mic className="w-3.5 h-3.5 mr-1.5" /> Stimme
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onChange({
                ...cast,
                characters: cast.characters.filter((_, i) => i !== index),
              })}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCharacter(); } }}
          placeholder="Figur hinzufügen (z. B. Emma)"
          className="h-9 text-sm"
        />
        <Button size="sm" variant="outline" onClick={addCharacter} disabled={!newName.trim()}>
          <Plus className="w-4 h-4 mr-1" /> Figur
        </Button>
      </div>

      <UniversalVoiceLibraryPicker
        open={target !== null}
        onOpenChange={(open) => { if (!open) setTarget(null); }}
        onSelect={handleSelect}
        language={pickerLanguage}
        title="Hörbuch-Stimme wählen"
        currentVoiceId={
          target?.kind === 'narrator'
            ? cast.narrator?.voiceId
            : target?.kind === 'character'
              ? cast.characters[target.index]?.voiceId
              : undefined
        }
      />
    </Card>
  );
}
