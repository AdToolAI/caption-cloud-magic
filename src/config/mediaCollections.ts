import {
  Sparkles,
  Wand2,
  Zap,
  Image as ImageIcon,
  History,
  Palette,
  Upload,
  type LucideIcon,
} from "lucide-react";

/**
 * Auto Collections registry — the ONLY place that knows which workflow types
 * exist and how they are labelled. MediaLibrary, MediaAlbumManager, the filter
 * bar and the count badges all read from here.
 *
 * The data values are stable and never translated; only the labels are.
 */
export type WorkflowType =
  | "generated"
  | "edited"
  | "enhanced"
  | "background"
  | "restored"
  | "colorized"
  | "uploaded";

export interface MediaCollection {
  id: WorkflowType;
  workflowType: WorkflowType;
  icon: LucideIcon;
  labels: { en: string; de: string; es: string };
  sortOrder: number;
}

export const MEDIA_COLLECTIONS: MediaCollection[] = [
  {
    id: "generated",
    workflowType: "generated",
    icon: Sparkles,
    labels: { en: "Generated", de: "Generiert", es: "Generado" },
    sortOrder: 10,
  },
  {
    id: "edited",
    workflowType: "edited",
    icon: Wand2,
    labels: { en: "Edited", de: "Bearbeitet", es: "Editado" },
    sortOrder: 20,
  },
  {
    id: "enhanced",
    workflowType: "enhanced",
    icon: Zap,
    labels: { en: "Enhanced", de: "Verbessert", es: "Mejorado" },
    sortOrder: 30,
  },
  {
    id: "background",
    workflowType: "background",
    icon: ImageIcon,
    labels: { en: "Background", de: "Hintergrund", es: "Fondo" },
    sortOrder: 40,
  },
  {
    id: "restored",
    workflowType: "restored",
    icon: History,
    labels: { en: "Restored", de: "Restauriert", es: "Restaurado" },
    sortOrder: 50,
  },
  {
    id: "colorized",
    workflowType: "colorized",
    icon: Palette,
    labels: { en: "Colorized", de: "Koloriert", es: "Coloreado" },
    sortOrder: 60,
  },
  {
    id: "uploaded",
    workflowType: "uploaded",
    icon: Upload,
    labels: { en: "Uploads", de: "Uploads", es: "Subidas" },
    sortOrder: 70,
  },
];

export const WORKFLOW_TYPES: WorkflowType[] = MEDIA_COLLECTIONS.map((c) => c.workflowType);

export function isWorkflowType(value: unknown): value is WorkflowType {
  return typeof value === "string" && (WORKFLOW_TYPES as string[]).includes(value);
}

export function getCollection(workflowType: string): MediaCollection | undefined {
  return MEDIA_COLLECTIONS.find((c) => c.workflowType === workflowType);
}

export function sortedCollections(): MediaCollection[] {
  return [...MEDIA_COLLECTIONS].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function collectionLabel(collection: MediaCollection, lang: string): string {
  if (lang.startsWith("de")) return collection.labels.de;
  if (lang.startsWith("es")) return collection.labels.es;
  return collection.labels.en;
}

/** Label for a raw workflow value, falling back to the raw value. */
export function workflowLabel(workflowType: string | null | undefined, lang: string): string {
  if (!workflowType) return "";
  const collection = getCollection(workflowType);
  return collection ? collectionLabel(collection, lang) : workflowType;
}

export type CollectionCounts = Record<WorkflowType, number>;

export function emptyCounts(): CollectionCounts {
  return WORKFLOW_TYPES.reduce((acc, w) => {
    acc[w] = 0;
    return acc;
  }, {} as CollectionCounts);
}
