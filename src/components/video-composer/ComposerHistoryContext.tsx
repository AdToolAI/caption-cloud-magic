/**
 * Phase 5.6 — Context exposing the Composer Undo-History push function to
 * deeply-nested children (Storyboard, Clips, Scene cards) without prop drilling.
 * Provided by VideoComposerDashboard, consumed wherever a destructive action
 * happens.
 */
import { createContext, useContext } from 'react';
import type { PushEntryParams } from '@/hooks/useComposerHistory';

export interface ComposerHistoryContextValue {
  pushEntry: (params: PushEntryParams) => Promise<void>;
}

const noop = async () => { /* no provider mounted — silently skip */ };

export const ComposerHistoryContext = createContext<ComposerHistoryContextValue>({
  pushEntry: noop,
});

export function useComposerHistoryContext() {
  return useContext(ComposerHistoryContext);
}
