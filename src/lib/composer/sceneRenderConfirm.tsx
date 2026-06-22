/**
 * SceneRenderConfirmProvider — Promise-based confirm gate for every
 * cost-incurring render trigger in Motion Studio (Schritt 1).
 *
 * Usage:
 *   const confirm = useSceneRenderConfirm();
 *   const ok = await confirm({ scenes, title?, description?, opts? });
 *   if (!ok) return;
 *
 * "30 Minuten nicht mehr fragen" is stored in sessionStorage and
 * automatically expires; it never persists across tabs/sessions.
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

export function SceneRenderConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<SceneRenderConfirmPayload | null>(null);
  const [suppressedLocal, setSuppressedLocal] = useState(false);
  const resolverRef = useRef<Resolver | null>(null);

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

    // Suppressed for the session window — silent pass.
    if (!args.force && isSuppressedNow()) return true;

    setPayload({ title: args.title, description: args.description, cost });
    setSuppressedLocal(false);
    setOpen(true);

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (suppressedLocal) setSuppressed(true);
    setOpen(false);
    resolverRef.current?.(true);
    resolverRef.current = null;
  }, [suppressedLocal]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    resolverRef.current?.(false);
    resolverRef.current = null;
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
