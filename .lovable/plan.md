

## Plan: Content Planner lokalisieren + LanguageSwitcher in AppHeader

### Problem
1. `PlannerV2.tsx` und `CampaignTab.tsx` enthalten ~60 hardcodierte deutsche Strings
2. `AppHeader.tsx` (used for logged-in pages) hat keinen LanguageSwitcher — nur der Landing-`Header.tsx` hat einen

### Änderungen

**1. `src/components/layout/AppHeader.tsx` — LanguageSwitcher hinzufügen**
- Import `LanguageSwitcher` und neben `ThemeToggle` einfügen

**2. `src/lib/translations.ts` — Neuer `planner`-Block (alle 3 Sprachen)**

| Key | EN | DE | ES |
|---|---|---|---|
| `planner.title` | Content Planner | Content Planner | Planificador de Contenido |
| `planner.subtitle` | Plan and manage your social media posts | Plane und verwalte deine Social Media Posts | Planifica y gestiona tus publicaciones |
| `planner.newPost` | New Post | Neuer Post | Nuevo Post |
| `planner.aiSuggestions` | AI Suggestions | AI Vorschläge | Sugerencias IA |
| `planner.calendarView` | Calendar View | Kalenderansicht | Vista Calendario |
| `planner.campaigns` | Campaigns | Kampagnen | Campañas |
| `planner.sort` | Sort | Sortieren | Ordenar |
| `planner.allPlatforms` | All Platforms | Alle Plattformen | Todas las plataformas |
| `planner.allStatuses` | All Statuses | Alle Status | Todos los estados |
| `planner.draft` | Draft | Entwurf | Borrador |
| `planner.scheduled` | Scheduled | Geplant | Programado |
| `planner.published` | Published | Veröffentlicht | Publicado |
| `planner.approved` | Approved | Freigegeben | Aprobado |
| `planner.queued` | Queued | In Warteschlange | En cola |
| `planner.dateAsc` | Date (ascending) | Datum (aufsteigend) | Fecha (ascendente) |
| `planner.dateDesc` | Date (descending) | Datum (absteigend) | Fecha (descendente) |
| `planner.noPostsYet` | No posts planned yet | Noch keine Posts geplant | Aún no hay posts planificados |
| `planner.noPostsFound` | No posts found | Keine Posts gefunden | No se encontraron posts |
| `planner.createFirst` | Create your first post or use AI suggestions | Erstelle deinen ersten Post oder nutze AI-Vorschläge | Crea tu primer post o usa sugerencias IA |
| `planner.adjustFilters` | Adjust your filters to see posts | Passe deine Filter an, um Posts zu sehen | Ajusta tus filtros para ver posts |
| `planner.toCalendar` | to Calendar | zum Kalender | al Calendario |
| `planner.all` | All | Alle | Todos |
| `planner.none` | None | Keine | Ninguno |
| `planner.edit` | Edit | Bearbeiten | Editar |
| `planner.editPost` | Edit Post | Post bearbeiten | Editar Post |
| `planner.titleLabel` | Title | Titel | Título |
| `planner.dateTime` | Date & Time | Datum & Uhrzeit | Fecha y Hora |
| `planner.choosePlatform` | Choose platform | Platform wählen | Elegir plataforma |
| `planner.chooseStatus` | Choose status | Status wählen | Elegir estado |
| `planner.delete` | Delete | Löschen | Eliminar |
| `planner.cancel` | Cancel | Abbrechen | Cancelar |
| `planner.save` | Save | Speichern | Guardar |
| `planner.postsScheduled` | Posts scheduled | Posts geplant | Posts programados |
| `planner.platforms` | Platforms | Plattformen | Plataformas |
| `planner.weeklyUtilization` | Weekly utilization | Wochenauslastung | Utilización semanal |
| `planner.untitledPost` | Untitled Post | Unbenannter Post | Post sin título |
| `planner.transferToCalendar` | Transfer to Calendar | Zum Kalender übertragen | Transferir al Calendario |
| `planner.transferDesc` | posts will be transferred to the Smart Calendar | Posts werden in den Intelligenten Kalender übertragen | posts se transferirán al Calendario Inteligente |
| `planner.autoPublish` | Enable Auto-Publish | Auto-Publish aktivieren | Activar Auto-Publicación |
| `planner.autoPublishDesc` | Posts will be published automatically at the scheduled time | Posts werden automatisch zur geplanten Zeit veröffentlicht | Los posts se publicarán automáticamente a la hora programada |
| `planner.autoPublishActive` | Auto-Publish active | Auto-Publish aktiv | Auto-Publicación activa |
| `planner.autoPublishActiveDesc` | Posts will be automatically published at the set time | Die Posts werden automatisch zur eingestellten Uhrzeit veröffentlicht | Los posts se publicarán automáticamente a la hora establecida |
| `planner.transferAndPublish` | Transfer & Auto-Publish | Übertragen & Auto-Publish | Transferir y Auto-Publicar |
| Plus ~15 more for CampaignTab (loading, empty state, week, day names, progress, delete confirmation, generate with AI, preview) |

**3. `src/components/planner/PlannerV2.tsx` — Alle ~40 Strings ersetzen**
- Import `useTranslation`, dynamic `date-fns` locale
- Replace all hardcoded German strings with `t('planner.xxx')`
- Dynamic date formatting based on language

**4. `src/components/planner/CampaignTab.tsx` — Alle ~20 Strings ersetzen**
- Import `useTranslation`, dynamic `date-fns` locale
- Replace: "Kampagnen laden...", "Keine Kampagnen vorhanden", "Erstelle Kampagnen aus Templates...", "Zu den Templates", "Gestartet:", "Abgeschlossen", "In Bearbeitung", "Fortschritt", "Posts geplant", "Zum Kalender übertragen", "Woche", day names (Montag-Sonntag → Monday-Sunday), "Mit KI generieren", "Vorschau", "Kampagne löschen?", delete confirmation text, toast messages

### Betroffene Dateien
- `src/components/layout/AppHeader.tsx` (add LanguageSwitcher)
- `src/lib/translations.ts` (add ~55 keys × 3 languages)
- `src/components/planner/PlannerV2.tsx` (localize ~40 strings)
- `src/components/planner/CampaignTab.tsx` (localize ~20 strings)

