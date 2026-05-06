import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, User, Lightbulb, Library, Sparkles, ImageIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAccessibleCharacters } from '@/hooks/useAccessibleCharacters';
import { buildCharacterPromptInjection } from '@/hooks/useBrandCharacters';
import type { ComposerCharacter } from '@/types/video-composer';

interface CharacterManagerProps {
  characters: ComposerCharacter[];
  language: string;
  onChange: (characters: ComposerCharacter[]) => void;
}

const labels = {
  de: {
    title: 'Charaktere (optional)',
    subtitle:
      'Hilft der KI, Personen über mehrere Szenen hinweg ähnlich aussehen zu lassen — exakte Gesichts-Identität ist mit Text-zu-Video technisch nicht möglich.',
    add: 'Charakter hinzufügen',
    name: 'Name',
    namePlaceholder: 'z. B. Richard Löwenherz',
    appearance: 'Aussehen (Englisch empfohlen)',
    appearancePlaceholder:
      'tall man late 30s, long auburn red hair, full beard, weathered face, blue eyes',
    signature: 'Markante Kleidung & Objekte (Englisch empfohlen)',
    signaturePlaceholder:
      'crimson tunic with golden lion crest, fur-lined cloak, golden crown with red rubies, ornate longsword',
    proTipTitle: 'Pro-Tipp: Sherlock-Holmes-Effekt',
    proTipBody:
      'Beschreibe markante Kleidung & Objekte ausführlich (Mantel, Krone, Waffe). Die KI wiederholt diese viel zuverlässiger als Gesichter — der Zuschauer erkennt die Person daran. Die KI variiert automatisch Kamerawinkel, damit nicht jede Szene ein Gesichts-Closeup ist.',
    empty: 'Keine Charaktere definiert.',
    delete: 'Löschen',
  },
  en: {
    title: 'Characters (optional)',
    subtitle:
      'Helps the AI keep people looking similar across scenes — pixel-perfect face identity is technically impossible with text-to-video.',
    add: 'Add character',
    name: 'Name',
    namePlaceholder: 'e.g. Richard the Lionheart',
    appearance: 'Appearance (English recommended)',
    appearancePlaceholder:
      'tall man late 30s, long auburn red hair, full beard, weathered face, blue eyes',
    signature: 'Signature clothing & objects (English recommended)',
    signaturePlaceholder:
      'crimson tunic with golden lion crest, fur-lined cloak, golden crown with red rubies, ornate longsword',
    proTipTitle: 'Pro tip: the Sherlock Holmes effect',
    proTipBody:
      'Describe signature clothing & objects in detail (cloak, crown, weapon). The AI repeats these far more reliably than faces — viewers recognise the person by them. The AI also varies camera angles automatically so not every scene is a face close-up.',
    empty: 'No characters defined.',
    delete: 'Delete',
  },
  es: {
    title: 'Personajes (opcional)',
    subtitle:
      'Ayuda a la IA a mantener a las personas con apariencia similar entre escenas — la identidad facial exacta no es técnicamente posible con texto a vídeo.',
    add: 'Añadir personaje',
    name: 'Nombre',
    namePlaceholder: 'p. ej. Ricardo Corazón de León',
    appearance: 'Apariencia (recomendado en inglés)',
    appearancePlaceholder:
      'tall man late 30s, long auburn red hair, full beard, weathered face, blue eyes',
    signature: 'Ropa y objetos distintivos (recomendado en inglés)',
    signaturePlaceholder:
      'crimson tunic with golden lion crest, fur-lined cloak, golden crown with red rubies, ornate longsword',
    proTipTitle: 'Consejo Pro: el efecto Sherlock Holmes',
    proTipBody:
      'Describe la ropa y objetos distintivos con detalle (capa, corona, arma). La IA los repite mucho más fiablemente que los rostros — el espectador reconoce a la persona por ellos. La IA varía automáticamente los ángulos de cámara para que no toda escena sea un primer plano.',
    empty: 'Sin personajes definidos.',
    delete: 'Eliminar',
  },
};

function makeId(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 32) || `char-${Date.now().toString(36)}`
  );
}

export default function CharacterManager({ characters, language, onChange }: CharacterManagerProps) {
  const lang = (language === 'de' || language === 'es' ? language : 'en') as 'de' | 'en' | 'es';
  const t = labels[lang];

  const [draft, setDraft] = useState({ name: '', appearance: '', signatureItems: '' });

  const addCharacter = () => {
    if (!draft.name.trim()) return;
    const id = makeId(draft.name.trim());
    // Avoid duplicate IDs
    const uniqueId = characters.some((c) => c.id === id) ? `${id}-${Date.now().toString(36)}` : id;
    onChange([
      ...characters,
      {
        id: uniqueId,
        name: draft.name.trim(),
        appearance: draft.appearance.trim(),
        signatureItems: draft.signatureItems.trim(),
      },
    ]);
    setDraft({ name: '', appearance: '', signatureItems: '' });
  };

  const removeCharacter = (id: string) => {
    onChange(characters.filter((c) => c.id !== id));
  };

  const updateCharacter = (id: string, patch: Partial<ComposerCharacter>) => {
    onChange(characters.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  return (
    <Card className="border-border/40 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          {t.title}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{t.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pro-tip box */}
        <div className="relative overflow-hidden rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex gap-2.5">
            <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">{t.proTipTitle}</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t.proTipBody}</p>
            </div>
          </div>
        </div>

        {/* Existing characters */}
        {characters.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">{t.empty}</p>
        ) : (
          <div className="space-y-3">
            {characters.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="text-xs gap-1">
                    👤 {c.name}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive"
                    onClick={() => removeCharacter(c.id)}
                    aria-label={t.delete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{t.appearance}</Label>
                    <Textarea
                      value={c.appearance}
                      onChange={(e) => updateCharacter(c.id, { appearance: e.target.value })}
                      placeholder={t.appearancePlaceholder}
                      rows={2}
                      className="text-xs bg-background/50 resize-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{t.signature}</Label>
                    <Textarea
                      value={c.signatureItems}
                      onChange={(e) => updateCharacter(c.id, { signatureItems: e.target.value })}
                      placeholder={t.signaturePlaceholder}
                      rows={2}
                      className="text-xs bg-background/50 resize-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add new character */}
        <div className="rounded-lg border border-dashed border-border/40 p-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{t.name}</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder={t.namePlaceholder}
                className="text-xs bg-background/50"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{t.appearance}</Label>
              <Input
                value={draft.appearance}
                onChange={(e) => setDraft((d) => ({ ...d, appearance: e.target.value }))}
                placeholder={t.appearancePlaceholder}
                className="text-xs bg-background/50"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{t.signature}</Label>
              <Input
                value={draft.signatureItems}
                onChange={(e) => setDraft((d) => ({ ...d, signatureItems: e.target.value }))}
                placeholder={t.signaturePlaceholder}
                className="text-xs bg-background/50"
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={addCharacter}
            disabled={!draft.name.trim()}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {t.add}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
