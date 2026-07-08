/**
 * SceneRenderConfirmProvider — Promise-based confirm gate for every
 * cost-incurring render trigger in Motion Studio (Schritt 1).
 *
 * v209: When the aggregated cost contains at least one scene running
 * lipsync on a risky provider (see `src/config/lipsyncProviderSafety.ts`),
 * an additional consent block is rendered inside the dialog and the
 * confirm button is disabled until the user acknowledges the disclaimer.
 *
 * The user's acknowledgment is persisted on `composer_scenes.metadata`
 * for the affected scenes so support can honour the refund-exclusion
 * ("no refund for lipsync artifacts on risky providers") retroactively.
 * The suppression window ("30 Min. nicht mehr fragen") is disabled while
 * a risky scene is in the payload — every risky render must go through
 * the full consent dialog.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import SceneRenderConfirmDialog, {
  type SceneRenderConfirmPayload,
} from '@/components/video-composer/SceneRenderConfirmDialog';
import {
  aggregateCost,
  type AggregatedCost,
} from '@/lib/composer/estimateSceneRenderCost';
import type { ComposerScene } from '@/types/video-composer';
import { supabase } from '@/integrations/supabase/client';

const SUPPRESS_KEY = 'composer:render-confirm:suppressed-until';
const SUPPRESS_MS = 30 * 60 * 1000;

function isSuppressedNow(): boolean {
  try {
    const raw = sessionStorage.getItem(SUPPRESS_KEY);
    if (!raw) return false;
    const until = Number.parseInt(raw, 10);
    if (Number.isNaN(until)) return false;
    if (Date.now() > until) {
      sessionStorage.removeItem(SUPPRESS_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function setSuppressed(on: boolean) {
  try {
    if (on) {
      sessionStorage.setItem(SUPPRESS_KEY, String(Date.now() + SUPPRESS_MS));
    } else {
      sessionStorage.removeItem(SUPPRESS_KEY);
    }
  } catch {
    /* noop */
  }
}

export interface ConfirmRenderArgs {
  scenes: ComposerScene[];
  title?: string;
  description?: string;
  passes?: number;          // override (e.g. dialog turns)
  skipLipsync?: boolean;
  skipVoiceover?: boolean;
  /** Pre-computed cost; if provided, scenes is ignored. */
  cost?: AggregatedCost;
  /** If true, ignore the "30 min" suppress (always show). */
  force?: boolean;
}

type Resolver = (ok: boolean) => void;

interface Ctx {
  confirm: (args: ConfirmRenderArgs) => Promise<boolean>;
}

const SceneRenderConfirmCtx = createContext<Ctx | null>(null);

/**
 * v209: Persistiert die Risiko-Zustimmung des Nutzers auf allen
 * betroffenen Szenen. Best-effort — falls das Schreiben fehlschlägt,
 * loggen wir und lassen den Render trotzdem laufen (der Consent-Klick
 * selbst ist die Willenserklärung, die DB-Zeile nur die Beweisspur).
 */
async function persistRiskAcknowledgment(cost: AggregatedCost): Promise<void> {
  const risky = cost.riskyLipsyncScenes ?? [];
  if (risky.length === 0) return;
  const acknowledged_at = new Date().toISOString();
  await Promise.all(
    risky.map(async (r) => {
      try {
        const { data: row } = await supabase
          .from('composer_scenes')
          .select('scene_assets')
          .eq('id', r.sceneId)
          .maybeSingle();
        const assets =
          (row?.scene_assets as Record<string, unknown> | null) ?? {};
        const nextAssets = {
          ...assets,
          risky_provider_consent: {
            acknowledged: true,
            provider: r.info.provider,
            speaker_count: r.info.speakerCount,
            multi_speaker: r.info.multiSpeaker,
            acknowledged_at,
            consent_version: 'v209',
            scope: 'lipsync_artifacts',
            refund_excluded_for: 'lipsync_artifacts_only',
          },
        };
        const { error } = await supabase
          .from('composer_scenes')
          .update({ scene_assets: nextAssets as any })
          .eq('id', r.sceneId);
        if (error) {
          console.warn(
            '[risky-provider-consent] failed to persist ack for scene',
            r.sceneId,
            error,
          );
        }
      } catch (e) {
        console.warn(
          '[risky-provider-consent] persist crash for scene',
          r.sceneId,
          e,
        );
      }
    }),
  );
}

export function SceneRenderConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<SceneRenderConfirmPayload | null>(null);
  const [suppressedLocal, setSuppressedLocal] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const resolverRef = useRef<Resolver | null>(null);
  const currentCostRef = useRef<AggregatedCost | null>(null);

  const confirm = useCallback(async (args: ConfirmRenderArgs) => {
    const cost =
      args.cost ??
      aggregateCost(args.scenes, {
        passes: args.passes,
        skipLipsync: args.skipLipsync,
        skipVoiceover: args.skipVoiceover,
      });

    // Auto-pass when nothing actually costs (e.g. stock/upload-only scenes).
    if (cost.totalCredits === 0) return true;

    const hasRisk = (cost.riskyLipsyncScenes ?? []).length > 0;

    // Suppressed for the session window — silent pass, aber NIEMALS bei
    // risky provider (Consent muss aktiv erteilt werden).
    if (!args.force && !hasRisk && isSuppressedNow()) return true;

    currentCostRef.current = cost;
    setPayload({ title: args.title, description: args.description, cost });
    setSuppressedLocal(false);
    setRiskAcknowledged(false);
    setOpen(true);

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const cost = currentCostRef.current;
    const hasRisk = (cost?.riskyLipsyncScenes ?? []).length > 0;
    // Doppelte Absicherung: bei Risiko darf ohne Ack nicht bestätigt werden.
    if (hasRisk && !riskAcknowledged) return;
    if (suppressedLocal && !hasRisk) setSuppressed(true);
    setOpen(false);
    // Fire-and-forget: Consent-Spur in DB schreiben (best-effort).
    if (hasRisk && cost) {
      void persistRiskAcknowledgment(cost);
    }
    resolverRef.current?.(true);
    resolverRef.current = null;
    currentCostRef.current = null;
  }, [suppressedLocal, riskAcknowledged]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    resolverRef.current?.(false);
    resolverRef.current = null;
    currentCostRef.current = null;
  }, []);

  const value = useMemo<Ctx>(() => ({ confirm }), [confirm]);

  return (
    <SceneRenderConfirmCtx.Provider value={value}>
      {children}
      <SceneRenderConfirmDialog
        open={open}
        payload={payload}
        suppressed={suppressedLocal}
        onSuppressedChange={setSuppressedLocal}
        riskAcknowledged={riskAcknowledged}
        onRiskAcknowledgedChange={setRiskAcknowledged}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </SceneRenderConfirmCtx.Provider>
  );
}

export function useSceneRenderConfirm() {
  const ctx = useContext(SceneRenderConfirmCtx);
  if (!ctx) {
    // Safe no-op fallback so a component outside the provider does not
    // accidentally bypass the gate by throwing — instead surfaces a
    // console warning and lets the action proceed (preserves existing UX
    // for any future code path we missed).
    if (typeof console !== 'undefined') {
      console.warn(
        '[useSceneRenderConfirm] No provider in tree — confirm gate disabled.',
      );
    }
    return async () => true;
  }
  return ctx.confirm;
}
