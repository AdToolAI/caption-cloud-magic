
# Block N — NLE-Export Pro (Premiere / Resolve / FCP)

**Ziel:** Composer-Projekte als professionelle NLE-Sequenzen exportieren, in DaVinci Resolve / Premiere Pro / Final Cut Pro öffnen, dort schneiden — und die Änderungen zurück in den Composer importieren ("Roundtrip").

Block M (Hybrid Production) folgt **danach** in einer separaten Session.

---

## Scope (Pro-Variante, in 2 Sessions splittbar)

### Session N-1 (zuerst, ~3h): Export
1. **FCPXML 1.10** — Zielformat für Resolve, Premiere, Final Cut Pro
2. **EDL (CMX 3600)** — Legacy-Format, kompatibel mit Avid/älteren Workflows
3. **Asset-Bundle ZIP** — alle Clips + Audio + README + Sequenz-Datei lokal gebündelt
4. **Export-Panel UI** im Composer-Sidebar (History + Re-Download)

### Session N-2 (danach, ~2h): Roundtrip-Import
5. **FCPXML-Re-Import** — geänderte Sequenz hochladen, Composer diff't Reorder/Trim/Delete und übernimmt

---

## Architektur

### 1. Storage-Bucket: `composer-exports` (privat)
- RLS: `user_id` als erstes Path-Segment (Standard-Pattern)
- TTL: 7 Tage (cleanup-Cron später optional)
- Pfad-Schema: `{user_id}/{project_id}/export-{timestamp}.{xml|edl|zip}`

### 2. DB-Tabelle: `composer_exports`
| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | RLS |
| `project_id` | uuid | FK composer_projects |
| `format` | text | `fcpxml` / `edl` / `bundle` |
| `storage_path` | text | Pfad im Bucket |
| `file_size_bytes` | bigint | für UI |
| `scene_count` | int | Snapshot |
| `total_duration_sec` | numeric | Snapshot |
| `expires_at` | timestamptz | now() + 7 days |
| `created_at` | timestamptz | default now() |

RLS: `auth.uid() = user_id` für SELECT/INSERT/DELETE.

### 3. Edge Functions (3 neue)

#### `composer-export-fcpxml`
- Input: `{ projectId }`
- Lädt `composer_projects` + `composer_scenes` (geordnet) + `composer_audio_tracks` + `globalTextOverlays`
- Generiert FCPXML 1.10 (Apple DTD) mit:
  - `<sequence>` mit Frame-Rate aus Projekt (24/30/60), Auflösung aus `aspectRatio`
  - `<asset>` pro Clip (Video-URLs aus `clipUrl` / `uploadUrl`)
  - `<asset-clip>` mit `start`/`offset`/`duration` als rationale Zeiten (z.B. `1500/30s`)
  - Audio-Tracks als `<asset-clip>` in lane -1, -2, -3
  - Text-Overlays als `<title>` mit `<text-style>`
- Upload in `composer-exports` Bucket
- Insert in `composer_exports` Tabelle
- Return: `{ downloadUrl, exportId, expiresAt }`

#### `composer-export-edl`
- Vereinfachter Output: CMX 3600 EDL
- Nur Video-Tracks + 2 Audio-Tracks
- Kein Text, keine Effekte (EDL-Limit) → README warnt
- Format:
  ```
  TITLE: Project Name
  FCM: NON-DROP FRAME
  001  CLIP_001 V     C        00:00:00:00 00:00:03:12 00:00:00:00 00:00:03:12
  ```

#### `composer-export-bundle`
- Ruft intern `composer-export-fcpxml` + `composer-export-edl` auf
- Lädt alle Asset-URLs (Clips + Audio) per `fetch` → Blob
- Packt mit `JSZip` (Deno-kompatibel via esm.sh):
  ```
  /sequence.fcpxml
  /sequence.edl
  /clips/scene-01-{sceneId}.mp4
  /clips/scene-02-{sceneId}.mp4
  /audio/voiceover.mp3
  /audio/music.mp3
  /README.md  (Anleitung: "In Resolve: Datei → Importieren → sequence.fcpxml")
  ```
- Upload als `.zip` in Bucket
- **Wichtig:** großes Bundle → Edge-Function-Timeout auf 300s in `supabase/config.toml`

#### `composer-import-fcpxml` (Session N-2)
- Input: `{ projectId, fcpxmlContent }` (text)
- Parse mit `fast-xml-parser` (esm.sh)
- Extrahiert geordnete Liste der `<asset-clip>`-Refs + ihre In/Out-Zeiten
- Diff gegen aktuelle `composer_scenes`:
  - **Reorder:** matched per Storage-URL → update `order_index`
  - **Trim:** in/out unterschiedlich → update `trim_start_sec` / `trim_end_sec`
  - **Delete:** Szene fehlt im FCPXML → `is_deleted = true` (soft) ODER warn statt löschen
  - **Unknown asset:** XML referenziert Datei, die nicht im Projekt ist → ignorieren + warnen
- Return: `{ changesApplied: { reordered, trimmed, deleted }, warnings }`
- Frontend zeigt Diff-Vorschau **vor** Bestätigung (kein silent overwrite)

### 4. Frontend

#### `src/components/video-composer/NLEExportPanel.tsx` (neu)
- Lebt im Composer-Sidebar (neuer Tab "Export → NLE" oder Erweiterung des bestehenden ExportPresetPanel)
- 3 Buttons: "FCPXML", "EDL", "Bundle (ZIP)"
- Nach Klick: Loading → toast → automatischer Download via `<a href download>`
- History-Liste der letzten 10 Exporte (mit Re-Download + Ablaufdatum)
- "Re-Import"-Button (Session N-2): File-Picker für `.fcpxml`, zeigt Diff-Modal

#### `src/components/video-composer/NLEImportDiffDialog.tsx` (Session N-2)
- Modal mit drei Sektionen: Reordered (alte → neue Position), Trimmed (alte → neue Dauer), Deleted (Liste)
- Buttons: "Änderungen übernehmen" / "Abbrechen"

#### `src/hooks/useNLEExport.ts` (neu)
- `exportFCPXML(projectId)`, `exportEDL`, `exportBundle`, `importFCPXML(file)`
- Polling für Bundle (kann 30-60s dauern)
- Fehler-Toasts mit klaren Messages

### 5. Lokalisierung
- DE/EN/ES für alle UI-Strings (Buttons, Toasts, Diff-Labels, README im Bundle bleibt EN für Profi-Workflow)

---

## Edge Cases & Hardening

| Case | Lösung |
|---|---|
| Szene ohne `clipUrl` (noch nicht generiert) | Skip mit Warning im Toast |
| Mixed Aspect-Ratios | Sequenz-Auflösung = Projekt-Setting, einzelne Clips werden in NLE skaliert |
| Speed-Ramping (`speedCurve`) | Nicht in FCPXML 1.10 mappbar → "rate"-Tag mit Durchschnitt + Warning im README |
| Text-Overlay-Animationen | Statisch in FCPXML, Animation geht verloren → README-Warning |
| Asset-URL nicht erreichbar (deleted) | Bundle: skip + log; FCPXML/EDL: include URL aber warn |
| FCPXML > 5 MB | unlikely, aber Streaming-Response statt JSON |
| Bundle > 500 MB | Hard-Limit, error-toast "Projekt zu groß für Bundle, nutze FCPXML + manuelle Downloads" |

---

## Sicherheit

- Alle Edge-Functions: `verify_jwt` via Code-Check (`supabase.auth.getUser()`)
- Storage-RLS: `user_id` muss erstes Path-Segment sein (Pattern aus `background-projects`)
- Re-Import: Validate, dass `projectId` dem User gehört, **bevor** Diff angewendet wird
- XML-Parser: `fast-xml-parser` mit `processEntities: true` aber `allowBooleanAttributes: false` (kein XXE)

---

## Files (Session N-1, ~7 neue)

**Neu:**
- `supabase/migrations/{timestamp}_composer_exports.sql` — Tabelle + Bucket + RLS
- `supabase/functions/composer-export-fcpxml/index.ts`
- `supabase/functions/composer-export-edl/index.ts`
- `supabase/functions/composer-export-bundle/index.ts`
- `src/components/video-composer/NLEExportPanel.tsx`
- `src/hooks/useNLEExport.ts`

**Geändert:**
- `src/components/video-composer/VideoComposerDashboard.tsx` — neuer Tab/Section für NLE-Export
- `supabase/config.toml` — Timeout-Konfig für `composer-export-bundle` (300s)
- 3× i18n-Files (DE/EN/ES)

## Files (Session N-2, ~3 neue)

- `supabase/functions/composer-import-fcpxml/index.ts`
- `src/components/video-composer/NLEImportDiffDialog.tsx`
- (Hook erweitern)

---

## Vorgehen

**Erst Session N-1** komplett implementieren + manuell testen (FCPXML in Resolve öffnen, EDL in Premiere, Bundle entpacken). Wenn alles sauber läuft, **dann Session N-2** (Roundtrip).

**Danach** beginnt Block M (Hybrid Production Pro) mit Schema-Änderungen am Composer.

Sag Bescheid, wenn ich loslegen soll mit **Session N-1** — oder ob du noch was anpassen willst (z.B. FCPXML-only und EDL/Bundle weglassen).
