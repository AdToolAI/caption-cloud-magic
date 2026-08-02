/**
 * isRealizedScene — v384: nur noch ein Re-Export.
 *
 * Die Interpretation des Szenenzustands lebt seit v384 ausschließlich in
 * `src/lib/composer/sceneState.ts` (Client) bzw.
 * `supabase/functions/_shared/scene-state.ts` (Server). Diese Datei bleibt
 * als stabiler Importpfad für bestehende Aufrufer erhalten.
 */
export {
  isRealizedScene,
  canStartAudioPrep,
  canDispatchLipsync,
  sceneState,
  isSceneTerminal,
  isSceneInFlight,
  sceneProgressPercent,
} from './sceneState';
export type { SceneState } from './sceneState';
