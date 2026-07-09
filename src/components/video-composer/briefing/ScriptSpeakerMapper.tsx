import { useEffect, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Users, Wand2 } from 'lucide-react';
import { detectBriefingFidelity } from '@/hooks/useStoryboardTransition';
import type { ComposerBriefing, ComposerCharacter } from '@/types/video-composer';

interface Props {
  briefing: ComposerBriefing;
  language: string;
  onUpdateBriefing: (patch: Partial<ComposerBriefing>) => void;
}

const AUTO = '__auto__';

function normalize(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function autoMatch(label: string, characters: ComposerCharacter[]): string | null {
  const n = normalize(label);
  if (!n) return null;
  const hit = characters.find((c) => {
    const cn = normalize(c.name);
    if (!cn) return false;
    // Strict: equal, or exact prefix/suffix on either side. No substring includes.
    return cn === n || cn.startsWith(n) || n.startsWith(cn);
  });
  return hit?.id ?? null;
}

const DENY_TOKEN = /^(szene|scene|shot|hook|reveal|cta|pain|proof|beat|kamera|camera|framing|mood|note|tone|dialog|dialogue|voiceover|vo|inhalt|briefing|thema|target|zielgruppe|projekt|project|duration|dauer|aspect|format|ratio|style|stil|ton|tonalitat|setting|location|endcard|optional|empfohlen|nicht|text|on|off|studio|helles|medium|close|wide|pan|tracking|push|cinematic|perfekter|perfekte|realistische|realistisch|split|creator|nach|da|sondern|create|die|der|das|ein|eine|clean|heroisch|heroischer|vier|benennt|erstelle|leichter|multi|sagen|zeigen|zuschauer|soll|botschaft|videos|video|felder|erscheinen|hauptfeature|hauptfeatu|realistic|cinematic|sprechern|sprecher|lip|sync|office|ganze|dein|erstes|merken)$/i;

function isValidSpeakerLabel(label: string, characters: ComposerCharacter[]): boolean {
  const raw = String(label ?? '').replace(/\s+/g, ' ').trim();
  if (raw.length < 2 || raw.length > 32) return false;
  const tokens = raw.split(/\s+/);
  if (tokens.length > 3) return false;
  if (tokens.some((t) => DENY_TOKEN.test(t))) return false;
  const allCaps = tokens.every((t) => /^[A-ZÄÖÜ][A-ZÄÖÜ0-9.]*$/.test(t) || /^\d+$/.test(t));
  if (allCaps) return true;
  // Otherwise only accept when the label matches a briefed cast member.
  return autoMatch(raw, characters) !== null;
}

/**
 * Compact panel shown ONLY when the briefing contains an explicit script
 * (LITERAL mode). Lets the user manually map each detected `NAME:` label to
 * a briefed cast member — overriding the fuzzy auto-match used server-side
 * when it picks the wrong role.
 */
export default function ScriptSpeakerMapper({ briefing, language, onUpdateBriefing }: Props) {
  const fidelity = useMemo(() => detectBriefingFidelity(briefing), [briefing]);
  const characters = briefing.characters ?? [];
  const speakerMap = briefing.speakerMap ?? {};

  // Defense-in-depth: re-validate every label here. Even if the detector
  // regresses or HMR hands us a stale memoized list, garbage bullet titles
  // ("Studio", "Medium Close", "Empfohlen"…) never render.
  const cleanLabels = useMemo(
    () => fidelity.speakerLabels.filter((l) => isValidSpeakerLabel(l, characters)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fidelity.speakerLabels.join('|'), characters.map((c) => `${c.id}:${c.name}`).join('|')],
  );

  // Prune stale mappings (label removed from script, char removed from cast,
  // or label was junk from a pre-fix session).
  useEffect(() => {
    const validLabels = new Set(cleanLabels);
    const validCharIds = new Set(characters.map((c) => c.id));
    let changed = false;
    const next: Record<string, string> = {};
    for (const [label, charId] of Object.entries(speakerMap)) {
      if (!validLabels.has(label)) { changed = true; continue; }
      if (charId && !validCharIds.has(charId)) { changed = true; continue; }
      next[label] = charId;
    }
    if (changed) onUpdateBriefing({ speakerMap: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanLabels.join('|'), characters.map((c) => c.id).join('|')]);

  if (fidelity.mode !== 'literal' || cleanLabels.length === 0) return null;
  if (characters.length === 0) return null;
  // Hide when nothing confidently matches — user picks manually elsewhere.
  const anyMatch = cleanLabels.some((l) => autoMatch(l, characters));
  if (!anyMatch) return null;

  const t = (de: string, en: string, es: string) =>
    language === 'de' ? de : language === 'es' ? es : en;

  const setMapping = (label: string, value: string) => {
    const next = { ...speakerMap };
    if (value === AUTO) delete next[label];
    else next[label] = value;
    onUpdateBriefing({ speakerMap: next });
  };

  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-500/[0.03] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-amber-300" />
        <h3 className="text-sm font-medium text-amber-100">
          {t('Sprecher-Zuordnung', 'Speaker mapping', 'Asignación de hablantes')}
        </h3>
        <Badge variant="outline" className="border-amber-400/40 text-amber-200 text-[10px]">
          LITERAL
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          'Wir haben ein Skript mit Sprecher-Labels erkannt. Weise jedes Label einer Cast-Rolle zu — sonst rät die KI per Namens-Match.',
          'We detected a script with speaker labels. Assign each label to a cast member — otherwise the AI falls back to name matching.',
          'Detectamos un guion con etiquetas de hablante. Asigna cada etiqueta a un miembro del reparto — de lo contrario la IA usa coincidencia por nombre.',
        )}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cleanLabels.map((label) => {
          const current = speakerMap[label];
          const auto = autoMatch(label, characters);
          const effective = current ?? auto;
          const value = current ?? AUTO;

          return (
            <div key={label} className="flex items-center gap-2">
              <div className="w-1/3 min-w-[80px] flex items-center gap-1.5">
                <Badge variant="secondary" className="font-mono text-[11px] px-2 py-0.5 truncate max-w-full">
                  {label}
                </Badge>
              </div>
              <Select value={value} onValueChange={(v) => setMapping(label, v)}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>
                    <span className="flex items-center gap-1.5">
                      <Wand2 className="h-3 w-3 text-muted-foreground" />
                      {t('Auto', 'Auto', 'Auto')}
                      {auto ? (
                        <span className="text-muted-foreground">
                          → {characters.find((c) => c.id === auto)?.name}
                        </span>
                      ) : (
                        <span className="text-destructive/70">
                          ({t('kein Match', 'no match', 'sin coincidencia')})
                        </span>
                      )}
                    </span>
                  </SelectItem>
                  {characters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {fidelity.speakerLabels.some((l) => !(speakerMap[l] ?? autoMatch(l, characters))) && (
        <p className="text-[11px] text-destructive/80">
          {t(
            '⚠ Manche Labels haben keine Zuordnung — die KI wird sie erraten.',
            '⚠ Some labels have no mapping — the AI will guess.',
            '⚠ Algunas etiquetas no están asignadas — la IA las adivinará.',
          )}
        </p>
      )}
    </div>
  );
}
