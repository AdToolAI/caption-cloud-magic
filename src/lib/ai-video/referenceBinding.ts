/**
 * Client view of the Seedance 2.5 reference binding. Deliberately a
 * re-export of the shared module so the browser and the Edge Function use
 * the exact same index math (UI slot i → provider content[i + 1] → "@Image i+1").
 * Never fork this logic.
 */
export {
  REFERENCE_ROLES,
  TEXT_CONTENT_INDEX,
  isReferenceRole,
  referenceIdentity,
  findDuplicateReferences,
  bindReferenceSlots,
  buildReferenceInstructions,
  composeReferencePrompt,
  parseModelArkContentIndex,
  contentIndexToReferenceSlot,
  resolveRejectedReference,
} from '../../../supabase/functions/_shared/referenceBinding';

export type {
  ReferenceRole,
  ReferenceSlotInput,
  BoundReferenceSlot,
  DuplicateReference,
  RejectedReferenceInfo,
} from '../../../supabase/functions/_shared/referenceBinding';
