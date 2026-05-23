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
import { parseDialogScript } from '@/lib/talking-head/parseDialogScript';

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
        title: `Szene ${idx}: Continuity ohne Anker`,
        detail: 'Continuity ist aktiv, aber kein Referenz-Frame gesetzt — Bruch wahrscheinlich.',
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
        title: `Szene ${idx}: Hoher Drift (${drift.toFixed(0)}/100)`,
        detail: 'Drift-Ampel meldet visuellen Bruch zur Vorgänger-Szene.',
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
          title: `Szene ${idx}: Dialog-Modus ohne Cast`,
          detail: 'Kein Sprecher zugewiesen — Lip-Sync kann nicht generiert werden.',
        });
      }

      // Blocker: dialog mode without script → Sync.so gets 0s VO
      if (!scriptText) {
        out.push({
          id: `${s.id}-dlg-script`,
          severity: 'blocker',
          sceneIndex: idx,
          icon: <MessageSquare className="h-3.5 w-3.5" />,
          title: `Szene ${idx}: Dialog-Modus ohne Skript`,
          detail: 'Skript ist leer — kein Text zum Sprechen vorhanden.',
        });
      }

      // Warning: clipSource not in the 7 native-dialogue models
      if (!NATIVE_DIALOGUE_CLIP_SOURCES.includes(s.clipSource as any)) {
        out.push({
          id: `${s.id}-dlg-model`,
          severity: 'warning',
          sceneIndex: idx,
          icon: <Mic className="h-3.5 w-3.5" />,
          title: `Szene ${idx}: Modell nicht dialog-fähig`,
          detail: `${s.clipSource} unterstützt keinen nativen Dialog — beim Start wird auf HappyHorse umgeschaltet.`,
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
            title: `Szene ${idx}: Sprecher fehlt im Cast`,
            detail: `Skript hat ${uniqueNames.length} Sprecher, aber nur ${cast.length} im Cast — fehlende Person zuweisen.`,
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
            title: `Szene ${idx}: Skript zu lang für Plate`,
            detail: `Skript ~${expectedVoSec}s, Szene nur ${dur}s — Sync.so schneidet ab. Szene verlängern oder Skript kürzen.`,
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
      title: 'Alle Szenen render-bereit',
      detail: 'Keine Blocker, keine Warnungen — du kannst sicher rendern.',
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
      ? 'Alles klar — Pipeline bereit.'
      : `${warnings.length} Warnung${warnings.length === 1 ? '' : 'en'} — du kannst trotzdem starten.`
    : `${blockers.length} Problem${blockers.length === 1 ? '' : 'e'} verhindern den Render.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            Pre-Flight-Check
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
            Abbrechen
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
            {warnings.length > 0 ? 'Trotzdem starten' : 'Render starten'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
