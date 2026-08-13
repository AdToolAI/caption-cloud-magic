/**
 * Compatibility re-export. The canonical implementation now lives in
 * `src/lib/composer/dialog/resolveEffectiveDialog.ts` (v430 Step 0) so that
 * client and edge function share one byte-identical dialog contract.
 */
export type {
  CanonicalTurn,
  ParsedScriptLine,
  AlignOptions,
} from './dialog/resolveEffectiveDialog';
export {
  alignDialogTurnsToScript,
  parseScriptLines,
  normalizeDialogText,
  normalizeDialogTurns,
} from './dialog/resolveEffectiveDialog';
