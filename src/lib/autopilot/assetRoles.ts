/**
 * Customer-uploaded assets.
 *
 * The role is not cosmetic metadata — it decides how an image enters the film.
 * A logo must never go into an image model (they mangle typography), while a
 * product photo must go in as a reference or the film shows a lookalike
 * product. Keeping that decision in one table means the orchestrator, the
 * anchor gate and the final cut all agree on it.
 */

import { tx } from '@/lib/i18nText';

export type AssetRole = 'logo' | 'product' | 'person' | 'place' | 'style';

export interface AssetRoleSpec {
  id: AssetRole;
  label: string;
  hint: string;
  /** Feed the image to the image model as a visual reference. */
  useAsImageReference: boolean;
  /** Composite it in the final cut instead (overlay layer). */
  useAsOverlay: boolean;
  /** Only colour, light and texture are taken — never the depicted content. */
  styleOnly: boolean;
  placeholder: string;
}

export const ASSET_ROLES: Record<AssetRole, AssetRoleSpec> = {
  logo: {
    id: 'logo',
    label: 'Logo',
    hint: tx({ de: 'Wird sauber als Einblendung gelegt — nie ins KI-Bild, dort würde die Schrift verzerren.', en: 'Placed cleanly as an overlay — never into the AI image, where the text would distort.', es: 'Se coloca limpiamente como superposición — nunca en la imagen de IA, donde el texto se distorsionaría.' }),
    useAsImageReference: false,
    useAsOverlay: true,
    styleOnly: false,
    placeholder: tx({ de: 'z. B. am Ende 2 Sekunden mittig einblenden', en: 'e.g. fade in centered for 2 seconds at the end', es: 'p. ej. mostrar centrado durante 2 segundos al final' }),
  },
  product: {
    id: 'product',
    label: 'Produkt',
    hint: tx({ de: 'Referenz für die Bildgenerierung, damit das echte Produkt im Film steht.', en: 'Reference for image generation, so the real product appears in the film.', es: 'Referencia para la generación de imágenes, para que el producto real aparezca en el video.' }),
    useAsImageReference: true,
    useAsOverlay: false,
    styleOnly: false,
    placeholder: tx({ de: 'z. B. steht auf dem Tresen, Etikett gut sichtbar', en: 'e.g. standing on the counter, label clearly visible', es: 'p. ej. sobre el mostrador, con la etiqueta bien visible' }),
  },
  person: {
    id: 'person',
    label: 'Person',
    hint: tx({ de: 'Gesichtsreferenz für einen Charakter im Film.', en: 'Facial reference for a character in the film.', es: 'Referencia facial para un personaje del video.' }),
    useAsImageReference: true,
    useAsOverlay: false,
    styleOnly: false,
    placeholder: tx({ de: 'z. B. unser Inhaber, soll den Schlusssatz sprechen', en: 'e.g. our owner, should say the closing line', es: 'p. ej. nuestro propietario, debe decir la frase final' }),
  },
  place: {
    id: 'place',
    label: 'Ort',
    hint: tx({ de: 'Referenz für Kulisse, Raumgefühl und Lichtstimmung.', en: 'Reference for setting, spatial feel and lighting mood.', es: 'Referencia para el escenario, la sensación espacial y el ambiente de luz.' }),
    useAsImageReference: true,
    useAsOverlay: false,
    styleOnly: false,
    placeholder: tx({ de: 'z. B. unser Ladenlokal, soll in Szene 1 zu sehen sein', en: 'e.g. our storefront, should appear in scene 1', es: 'p. ej. nuestro local, debería aparecer en la escena 1' }),
  },
  style: {
    id: 'style',
    label: 'Stil-Referenz',
    hint: tx({ de: 'Nur Farbwelt, Licht und Look werden übernommen — nie der Bildinhalt.', en: 'Only color palette, light and look are taken over — never the image content.', es: 'Solo se toman la paleta de colores, la luz y el estilo — nunca el contenido de la imagen.' }),
    useAsImageReference: true,
    useAsOverlay: false,
    styleOnly: true,
    placeholder: tx({ de: 'z. B. diese warme, körnige Farbwelt bitte übernehmen', en: 'e.g. please use this warm, grainy color palette', es: 'p. ej. usar esta paleta de colores cálida y granulada' }),
  },
};

export const ASSET_ROLE_LIST: AssetRoleSpec[] = [
  ASSET_ROLES.product,
  ASSET_ROLES.logo,
  ASSET_ROLES.person,
  ASSET_ROLES.place,
  ASSET_ROLES.style,
];

export const MAX_ASSETS = 8;
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_ASSET_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export interface AutopilotAsset {
  id: string;
  role: AssetRole;
  userNote: string;
  publicUrl: string;
  storagePath: string;
  fileName: string;
  /** English description produced by the vision pass, for the image models. */
  analysisDescription?: string;
  usable?: boolean;
  warning?: string | null;
}

export function referenceAssets(assets: AutopilotAsset[]): AutopilotAsset[] {
  return assets.filter((a) => ASSET_ROLES[a.role]?.useAsImageReference);
}

export function overlayAssets(assets: AutopilotAsset[]): AutopilotAsset[] {
  return assets.filter((a) => ASSET_ROLES[a.role]?.useAsOverlay);
}

/** Human sentence the idea engine reads instead of raw role enums. */
export function describeAssetForBrief(asset: AutopilotAsset): string {
  const spec = ASSET_ROLES[asset.role];
  const parts = [`${spec.label}: ${asset.analysisDescription ?? asset.fileName}`];
  if (asset.userNote.trim()) parts.push(`Kundenwunsch: ${asset.userNote.trim()}`);
  if (spec.styleOnly) parts.push('Nur Look übernehmen, nicht den Inhalt.');
  if (spec.useAsOverlay) parts.push('Wird als Einblendung gelegt, nicht generiert.');
  return parts.join(' — ');
}

export function validateAssetFile(file: File): string | null {
  if (!ACCEPTED_ASSET_TYPES.includes(file.type)) {
    return `${file.name}: ${tx({ de: 'nur PNG, JPG oder WebP.', en: 'only PNG, JPG or WebP.', es: 'solo PNG, JPG o WebP.' })}`;
  }
  if (file.size > MAX_ASSET_BYTES) {
    return `${file.name}: ${tx({ de: 'größer als 10 MB.', en: 'larger than 10 MB.', es: 'más grande que 10 MB.' })}`;
  }
  return null;
}
