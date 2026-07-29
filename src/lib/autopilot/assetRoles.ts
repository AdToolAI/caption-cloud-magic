/**
 * Customer-uploaded assets.
 *
 * The role is not cosmetic metadata — it decides how an image enters the film.
 * A logo must never go into an image model (they mangle typography), while a
 * product photo must go in as a reference or the film shows a lookalike
 * product. Keeping that decision in one table means the orchestrator, the
 * anchor gate and the final cut all agree on it.
 */

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
    hint: 'Wird sauber als Einblendung gelegt — nie ins KI-Bild, dort würde die Schrift verzerren.',
    useAsImageReference: false,
    useAsOverlay: true,
    styleOnly: false,
    placeholder: 'z. B. am Ende 2 Sekunden mittig einblenden',
  },
  product: {
    id: 'product',
    label: 'Produkt',
    hint: 'Referenz für die Bildgenerierung, damit das echte Produkt im Film steht.',
    useAsImageReference: true,
    useAsOverlay: false,
    styleOnly: false,
    placeholder: 'z. B. steht auf dem Tresen, Etikett gut sichtbar',
  },
  person: {
    id: 'person',
    label: 'Person',
    hint: 'Gesichtsreferenz für einen Charakter im Film.',
    useAsImageReference: true,
    useAsOverlay: false,
    styleOnly: false,
    placeholder: 'z. B. unser Inhaber, soll den Schlusssatz sprechen',
  },
  place: {
    id: 'place',
    label: 'Ort',
    hint: 'Referenz für Kulisse, Raumgefühl und Lichtstimmung.',
    useAsImageReference: true,
    useAsOverlay: false,
    styleOnly: false,
    placeholder: 'z. B. unser Ladenlokal, soll in Szene 1 zu sehen sein',
  },
  style: {
    id: 'style',
    label: 'Stil-Referenz',
    hint: 'Nur Farbwelt, Licht und Look werden übernommen — nie der Bildinhalt.',
    useAsImageReference: true,
    useAsOverlay: false,
    styleOnly: true,
    placeholder: 'z. B. diese warme, körnige Farbwelt bitte übernehmen',
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
    return `${file.name}: nur PNG, JPG oder WebP.`;
  }
  if (file.size > MAX_ASSET_BYTES) {
    return `${file.name}: größer als 10 MB.`;
  }
  return null;
}
