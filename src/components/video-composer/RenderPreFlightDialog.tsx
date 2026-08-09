import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Rocket,
  ImageIcon,
  Type as TypeIcon,
  Clock,
  Link2Off,
  MessageSquare,
  Users,
  Mic,
} from 'lucide-react';
import type { ComposerScene } from '@/types/video-composer';
import { NATIVE_DIALOGUE_CLIP_SOURCES } from '@/lib/video-composer/modelMapping';
import { tx } from '@/lib/i18nText';


/**
 * Phase 4 — Render-All Pre-Flight-Check
 *
 * Vor dem teuren "Render All & Stitch" wird das gesamte Storyboard validiert:
 *  - blocker  → verhindern den Start (z.B. keine Szenen, leerer Prompt + kein Asset)
 *  - warning  → erlauben den Start, müssen aber bestätigt werden
 *
 * Ziel: Verhindern, dass der User Credits in einen Render schickt, der
 * vorhersehbar in einer fehlgeschlagenen / inkonsistenten Szene endet
 * (Artlist-style "no-surprise" guardrail).
 */

type Severity = 'blocker' | 'warning' | 'ok';

interface Finding {
  id: string;
  severity: Severity;
  sceneIndex?: number;
  icon: React.ReactNode;
  title: string;
  detail: string;
}

interface RenderPreFlightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenes: ComposerScene[];
  onConfirm: () => void;
}

function analyzeScenes(scenes: ComposerScene[]): Finding[] {
  const out: Finding[] = [];

  if (scenes.length === 0) {
    out.push({
      id: 'no-scenes',
      severity: 'blocker',
      icon: <XCircle className="h-3.5 w-3.5" />,
      title: 'Keine Szenen vorhanden',
      detail: 'Füge mindestens eine Szene hinzu, bevor du renderst.',
    });
    return out;
  }

  scenes.forEach((s, i) => {
    const idx = i + 1;
    const promptText = (s.aiPrompt ?? '').trim();
    const hasPrompt = promptText.length >= 4;
    const hasAsset =
      !!s.clipUrl ||
      !!s.uploadUrl ||
      !!s.referenceImageUrl ||
      s.clipStatus === 'ready';

    // Blocker: AI scene with neither prompt nor asset
    if (!hasPrompt && !hasAsset) {
      out.push({
        id: `${s.id}-empty`,
        severity: 'blocker',
        sceneIndex: idx,
        icon: <TypeIcon className="h-3.5 w-3.5" />,
        title: `Szene ${idx}: Leer`,
        detail: 'Weder Prompt noch Bild/Clip vorhanden — Render würde scheitern.',
      });
    }

    // Warning: very short or missing duration
    if (!s.durationSeconds || s.durationSeconds < 1) {
      out.push({
        id: `${s.id}-dur`,
        severity: 'warning',
        sceneIndex: idx,
        icon: <Clock className="h-3.5 w-3.5" />,
        title: `Szene ${idx}: Ungewöhnliche Dauer`,
        detail: `Dauer = ${s.durationSeconds ?? 0}s — der Renderer erzwingt mindestens 1s.`,
      });
    }

    // Warning: failed status from previous run
    if (s.clipStatus === 'failed') {
      out.push({
        id: `${s.id}-failed`,
        severity: 'warning',
        sceneIndex: idx,
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        title: `Szene ${idx}: Letzter Versuch fehlgeschlagen`,
        detail: 'Diese Szene wird neu generiert. Prüfe Prompt / Modell-Wahl.',
      });
    }

    // Warning: continuity-locked but reference frame missing
    if (s.continuityLocked && !s.referenceImageUrl) {
      out.push({
        id: `${s.id}-cont`,
        severity: 'warning',
        sceneIndex: idx,
        icon: <Link2Off className="h-3.5 w-3.5" />,
        title: `${tx({ de: 'Szene', en: 'Scene', es: 'Escena' })} ${idx}: ${tx({ de: 'Continuity ohne Anker', en: 'Continuity without anchor', es: 'Continuidad sin anclaje' })}`,
        detail: tx({ de: 'Continuity ist aktiv, aber kein Referenz-Frame gesetzt — Bruch wahrscheinlich.', en: 'Continuity is active, but no reference frame is set — a break is likely.', es: 'La continuidad está activa, pero no hay un fotograma de referencia — es probable un salto visual.' }),
      });
    }

    // Warning: severe drift score from Phase 3 (score is 0-100; <40 = visual break)
    const drift = s.continuityDriftScore;
    if (typeof drift === 'number' && drift < 40) {
      out.push({
        id: `${s.id}-drift`,
        severity: 'warning',
        sceneIndex: idx,
        icon: <ImageIcon className="h-3.5 w-3.5" />,
        title: `${tx({ de: 'Szene', en: 'Scene', es: 'Escena' })} ${idx}: ${tx({ de: 'Hoher Drift', en: 'High drift', es: 'Alta deriva' })} (${drift.toFixed(0)}/100)`,
        detail: tx({ de: 'Drift-Ampel meldet visuellen Bruch zur Vorgänger-Szene.', en: 'Drift indicator reports a visual break from the previous scene.', es: 'El indicador de deriva señala un salto visual respecto a la escena anterior.' }),
      });
    }

    // ── Dialog-mode specific checks (Phase A) ────────────────────────────
    if (s.dialogMode) {
      const cast = s.characterShots ?? [];
      const scriptText = (s.dialogScript ?? '').trim();

      // Blocker: dialog mode without cast → Hailuo plate has no portrait anchor
      if (cast.length === 0) {
        out.push({
          id: `${s.id}-dlg-cast`,
          severity: 'blocker',
          sceneIndex: idx,
          icon: <Users className="h-3.5 w-3.5" />,
          title: `${tx({ de: 'Szene', en: 'Scene', es: 'Escena' })} ${idx}: ${tx({ de: 'Dialog-Modus ohne Cast', en: 'Dialogue mode without cast', es: 'Modo de diálogo sin reparto' })}`,
          detail: tx({ de: 'Kein Sprecher zugewiesen — Lip-Sync kann nicht generiert werden.', en: 'No speaker assigned — lip-sync cannot be generated.', es: 'No hay ningún hablante asignado — no se puede generar la sincronización labial.' }),
        });
      }

      // Blocker: dialog mode without script → Sync.so gets 0s VO
      if (!scriptText) {
        out.push({
          id: `${s.id}-dlg-script`,
          severity: 'blocker',
          sceneIndex: idx,
          icon: <MessageSquare className="h-3.5 w-3.5" />,
          title: `${tx({ de: 'Szene', en: 'Scene', es: 'Escena' })} ${idx}: ${tx({ de: 'Dialog-Modus ohne Skript', en: 'Dialogue mode without script', es: 'Modo de diálogo sin guion' })}`,
          detail: tx({ de: 'Skript ist leer — kein Text zum Sprechen vorhanden.', en: 'Script is empty — there is no text to speak.', es: 'El guion está vacío — no hay texto para hablar.' }),
        });
      }

      // Warning: clipSource not in the 7 native-dialogue models
      if (!NATIVE_DIALOGUE_CLIP_SOURCES.includes(s.clipSource as any)) {
        out.push({
          id: `${s.id}-dlg-model`,
          severity: 'warning',
          sceneIndex: idx,
          icon: <Mic className="h-3.5 w-3.5" />,
          title: `${tx({ de: 'Szene', en: 'Scene', es: 'Escena' })} ${idx}: ${tx({ de: 'Modell nicht dialog-fähig', en: 'Model not dialogue-capable', es: 'Modelo no compatible con diálogo' })}`,
          detail: `${s.clipSource} ${tx({ de: 'unterstützt keinen nativen Dialog — beim Start wird auf HappyHorse umgeschaltet.', en: 'does not support native dialogue — it will switch to HappyHorse at start.', es: 'no admite diálogo nativo — cambiará a HappyHorse al iniciar.' })}`,
        });
      }

      // Warning: speaker in script not in cast
      if (scriptText && cast.length > 0) {
        const castIds = new Set(cast.map((c) => c.characterId));
        // Pseudo-parse: pass minimal ComposerCharacter shape so parseDialogScript can match by name.
        // We only have characterShots here (ids) — try a name-agnostic scan instead.
        const speakerNames = Array.from(
          scriptText.matchAll(/^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _.-]{0,40})\s*[:—-]/gm),
        ).map((m) => m[1].trim().toLowerCase());
        const uniqueNames = Array.from(new Set(speakerNames));
        // We can't resolve names → ids here without ComposerCharacter[], so this
        // becomes a soft hint: if script speakers > cast count, almost certainly
        // some speaker is missing from the cast.
        if (uniqueNames.length > cast.length) {
          out.push({
            id: `${s.id}-dlg-orphan`,
            severity: 'warning',
            sceneIndex: idx,
            icon: <Users className="h-3.5 w-3.5" />,
            title: `${tx({ de: 'Szene', en: 'Scene', es: 'Escena' })} ${idx}: ${tx({ de: 'Sprecher fehlt im Cast', en: 'Speaker missing from cast', es: 'Falta un hablante en el reparto' })}`,
            detail: `${tx({ de: 'Skript hat', en: 'Script has', es: 'El guion tiene' })} ${uniqueNames.length} ${tx({ de: 'Sprecher, aber nur', en: 'speakers, but only', es: 'hablantes, pero solo' })} ${cast.length} ${tx({ de: 'im Cast — fehlende Person zuweisen.', en: 'in the cast — assign the missing person.', es: 'en el reparto — asigna a la persona que falta.' })}`,
          });
        }

        // Warning: very long dialog vs short plate (Hailuo ~6-10s).
        // ~18 chars/sec spoken; if script chars > durationSec * 18 + 30% buffer → cut-off likely.
        const dur = s.durationSeconds ?? 6;
        const expectedVoSec = Math.ceil(scriptText.length / 18);
        if (expectedVoSec > dur * 1.3) {
          out.push({
            id: `${s.id}-dlg-overflow`,
            severity: 'warning',
            sceneIndex: idx,
            icon: <Clock className="h-3.5 w-3.5" />,
            title: `${tx({ de: 'Szene', en: 'Scene', es: 'Escena' })} ${idx}: ${tx({ de: 'Skript zu lang für Plate', en: 'Script too long for plate', es: 'Guion demasiado largo para la placa' })}`,
            detail: `${tx({ de: 'Skript', en: 'Script', es: 'Guion' })} ~${expectedVoSec}s, ${tx({ de: 'Szene nur', en: 'scene only', es: 'escena solo' })} ${dur}s — ${tx({ de: 'Sync.so schneidet ab. Szene verlängern oder Skript kürzen.', en: 'Sync.so will cut it off. Extend the scene or shorten the script.', es: 'Sync.so lo cortará. Alarga la escena o acorta el guion.' })}`,
          });
        }
      }
    }
  });

  if (out.length === 0) {
    out.push({
      id: 'all-good',
      severity: 'ok',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      title: tx({ de: 'Alle Szenen render-bereit', en: 'All scenes ready to render', es: 'Todas las escenas listas para renderizar' }),
      detail: tx({ de: 'Keine Blocker, keine Warnungen — du kannst sicher rendern.', en: 'No blockers, no warnings — you can render safely.', es: 'Sin bloqueos ni advertencias — puedes renderizar con seguridad.' }),
    });
  }

  return out;
}

const severityStyle: Record<Severity, string> = {
  blocker: 'border-destructive/40 bg-destructive/10 text-destructive',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  ok: 'border-green-500/40 bg-green-500/10 text-green-400',
};

export default function RenderPreFlightDialog({
  open,
  onOpenChange,
  scenes,
  onConfirm,
}: RenderPreFlightDialogProps) {
  const findings = useMemo(() => analyzeScenes(scenes), [scenes]);
  const blockers = findings.filter((f) => f.severity === 'blocker');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const canRender = blockers.length === 0;

  const summary = canRender
    ? warnings.length === 0
      ? tx({ de: 'Alles klar — Pipeline bereit.', en: 'All clear — pipeline ready.', es: 'Todo listo — pipeline preparada.' })
      : `${warnings.length} ${tx({ de: `Warnung${warnings.length === 1 ? '' : 'en'}`, en: `warning${warnings.length === 1 ? '' : 's'}`, es: `advertencia${warnings.length === 1 ? '' : 's'}` })} — ${tx({ de: 'du kannst trotzdem starten.', en: 'you can still start.', es: 'aún puedes iniciar.' })}`
    : `${blockers.length} ${tx({ de: `Problem${blockers.length === 1 ? '' : 'e'}`, en: `issue${blockers.length === 1 ? '' : 's'}`, es: `problema${blockers.length === 1 ? '' : 's'}` })} ${tx({ de: 'verhindern den Render.', en: 'prevent rendering.', es: 'impiden el renderizado.' })}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            {tx({ de: 'Pre-Flight-Check', en: 'Pre-flight check', es: 'Revisión previa' })}
          </DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-2">
          <div className="space-y-2">
            {findings.map((f) => (
              <div
                key={f.id}
                className={`rounded-lg border p-3 text-xs flex items-start gap-2 ${severityStyle[f.severity]}`}
              >
                <span className="mt-0.5 shrink-0">{f.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{f.title}</span>
                    {f.severity !== 'ok' && (
                      <Badge variant="outline" className="text-[9px] uppercase tracking-wide">
                        {f.severity}
                      </Badge>
                    )}
                  </div>
                  <p className="opacity-80 mt-0.5">{f.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tx({ de: 'Abbrechen', en: 'Cancel', es: 'Cancelar' })}
          </Button>
          <Button
            onClick={() => {
              if (!canRender) return;
              onOpenChange(false);
              onConfirm();
            }}
            disabled={!canRender}
            className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
          >
            <Rocket className="h-3.5 w-3.5 mr-1.5" />
            {warnings.length > 0 ? tx({ de: 'Trotzdem starten', en: 'Start anyway', es: 'Iniciar de todos modos' }) : tx({ de: 'Render starten', en: 'Start render', es: 'Iniciar renderizado' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
