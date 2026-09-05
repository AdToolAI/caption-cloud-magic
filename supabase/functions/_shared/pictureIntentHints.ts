/**
 * Picture Studio — intent hints (SHARED, pure).
 *
 * Detects what the written prompt is really asking for so the UI can RECOMMEND
 * a better workspace. Never redirects, never rewrites the prompt, never
 * changes a provider parameter.
 */

export type PictureHintKind = 'transparency' | 'edit';

const TRANSPARENCY_TERMS = [
  'transparent background',
  'transparent backdrop',
  'no background',
  'without background',
  'alpha channel',
  'cut out',
  'cutout',
  'png with alpha',
  'transparenter hintergrund',
  'ohne hintergrund',
  'hintergrund entfernen',
  'freigestellt',
  'freistellen',
  'alphakanal',
  'fondo transparente',
  'sin fondo',
  'quitar el fondo',
  'recortado',
];

const EDIT_TERMS = [
  'remove the',
  'remove this',
  'delete the',
  'erase the',
  'replace the',
  'swap the',
  'change the sky',
  'add a',
  'take out the',
  'entferne',
  'entfernen',
  'lösche',
  'ersetze',
  'ersetzen',
  'tausche',
  'austauschen',
  'weg damit',
  'elimina',
  'eliminar',
  'quita',
  'quitar',
  'reemplaza',
  'reemplazar',
  'sustituye',
];

function normalize(prompt: string): string {
  return (prompt ?? '').toLowerCase();
}

function matchTerm(prompt: string, terms: string[]): string | null {
  const text = normalize(prompt);
  for (const term of terms) {
    if (text.includes(term)) return term;
  }
  return null;
}

/** The prompt asks for a transparent / cut-out result. */
export function detectTransparencyWish(prompt: string): { matched: boolean; term?: string } {
  const term = matchTerm(prompt, TRANSPARENCY_TERMS);
  return term ? { matched: true, term } : { matched: false };
}

/**
 * The prompt reads like a local edit ("remove the tree") rather than a new
 * picture. Only meaningful when a template image is present.
 */
export function detectEditIntent(prompt: string): { matched: boolean; term?: string } {
  const term = matchTerm(prompt, EDIT_TERMS);
  return term ? { matched: true, term } : { matched: false };
}
