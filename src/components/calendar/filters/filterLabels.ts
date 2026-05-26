type Lang = 'de' | 'en' | 'es' | string;

export const FILTER_LABELS = {
  title: { de: 'Filter', en: 'Filters', es: 'Filtros' },
  active: { de: 'aktiv', en: 'active', es: 'activos' },
  reset: { de: 'Zurücksetzen', en: 'Reset', es: 'Reiniciar' },
  search: { de: 'Suche', en: 'Search', es: 'Buscar' },
  searchPlaceholder: {
    de: 'Titel, Caption, Brief…',
    en: 'Title, caption, brief…',
    es: 'Título, leyenda, brief…',
  },
  dateRange: { de: 'Zeitraum', en: 'Date range', es: 'Rango de fechas' },
  today: { de: 'Heute', en: 'Today', es: 'Hoy' },
  week7: { de: 'Nächste 7 Tage', en: 'Next 7 days', es: 'Próximos 7 días' },
  days30: { de: 'Nächste 30 Tage', en: 'Next 30 days', es: 'Próximos 30 días' },
  clear: { de: 'Leeren', en: 'Clear', es: 'Limpiar' },
  status: { de: 'Status', en: 'Status', es: 'Estado' },
  channels: { de: 'Kanäle', en: 'Channels', es: 'Canales' },
  mediaType: { de: 'Medien-Typ', en: 'Media type', es: 'Tipo de medio' },
  media_image: { de: 'Bild', en: 'Image', es: 'Imagen' },
  media_video: { de: 'Video', en: 'Video', es: 'Vídeo' },
  media_carousel: { de: 'Carousel', en: 'Carousel', es: 'Carrusel' },
  media_text: { de: 'Text', en: 'Text', es: 'Texto' },
  owner: { de: 'Verantwortlich', en: 'Owner', es: 'Responsable' },
  tags: { de: 'Tags', en: 'Tags', es: 'Etiquetas' },
  savedFilters: { de: 'Gespeicherte Filter', en: 'Saved filters', es: 'Filtros guardados' },
  save: { de: 'Speichern', en: 'Save', es: 'Guardar' },
  savePlaceholder: { de: 'Name…', en: 'Name…', es: 'Nombre…' },
  noSaved: {
    de: 'Noch keine gespeicherten Filter.',
    en: 'No saved filters yet.',
    es: 'Aún no hay filtros guardados.',
  },
  // bar
  myPosts: { de: 'Meine Posts', en: 'My posts', es: 'Mis posts' },
  thisWeek: { de: 'Diese Woche', en: 'This week', es: 'Esta semana' },
  needsReview: { de: 'Braucht Review', en: 'Needs review', es: 'Requiere revisión' },
  failedOnly: { de: 'Fehlgeschlagen', en: 'Failed', es: 'Fallidos' },
  drafts: { de: 'Entwürfe', en: 'Drafts', es: 'Borradores' },
  showingFiltered: {
    de: 'Gefiltert: ',
    en: 'Showing: ',
    es: 'Mostrando: ',
  },
  ofTotal: { de: ' von ', en: ' of ', es: ' de ' },
  noMatches: {
    de: 'Keine Posts entsprechen deinen Filtern.',
    en: 'No posts match your filters.',
    es: 'Ningún post coincide con tus filtros.',
  },
  clearAll: { de: 'Alle löschen', en: 'Clear all', es: 'Borrar todo' },
} as const;

export function getLabel(lang: Lang, key: keyof typeof FILTER_LABELS): string {
  const entry = (FILTER_LABELS as any)[key];
  if (!entry) return key as string;
  return entry[lang] ?? entry.en ?? entry.de;
}
