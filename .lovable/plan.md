## Sync.so NOOP Diagnose-Modus (v142)

Bevor wir noch eine Pipeline-Iteration bauen, klären wir **empirisch**, ob/wann sync-3 für unsere Plates überhaupt Lippen bewegt. Ohne dieses Signal raten wir bei jeder weiteren Änderung blind.

### Ziel
Eine kleine, isolierte Diagnose-Edge-Function, die **eine Pass-Eingabe** (Plate + VO + ASD) gleichzeitig in mehreren Varianten an Sync.so dispatcht und die Outputs nebeneinander sichtbar macht. Danach entscheiden wir die Pipeline-Strategie auf Basis echter Daten.

### Was gebaut wird

**1. Edge Function `lipsync-diagnostic`**
Input: `{ plate_url, audio_url, speaker_label, coords?, bounding_boxes_url? }`
Dispatcht 5 parallele Sync.so Jobs (sync-3) mit identischer Plate/Audio aber verschiedenen ASD-Strategien:

| Variante | ASD | Notes |
|---|---|---|
| A | `auto_detect: true` | Baseline (Sync.so picks face) |
| B | flat `[x,y]` coords | aktueller v140 Default |
| C | `bounding_boxes_url` (S3 JSON) | aktueller v134 Stufe 1 Eskalation |
| D | `bounding_boxes` inline array | Doc-konforme Alternative |
| E | Audio gepaddet auf 2.0s + auto_detect | testet Min-Audio-Hypothese |

Pollt alle Jobs, speichert Outputs in Bucket `lipsync-diag/<run_id>/<variant>.mp4` und schreibt Row in neue Tabelle `lipsync_diagnostic_runs` mit Output-URLs, sizeRatio pro Variante, Sync.so `status`/`error_message`.

**2. UI-Page `/admin/lipsync-diag`** (admin only)
- Formular: Plate-URL, Audio-URL, optional Coords (mit Preset-Button "letzten Failed-Pass laden")
- "Run Diagnostic" Button (~€0.45 Kosten, gated via has_role admin)
- Ergebnis-Grid: 5 Video-Player nebeneinander, jeder mit Badge (sizeRatio, Sync.so status, "Lippen bewegen sich? J/N" Toggle für manuelle Annotation)
- Quick-Load: Dropdown der letzten 10 NOOP-Suspect Passes aus `dialog_shots`/`syncso_dispatch_log` mit 1-Klick "diagnose"

**3. Min-Audio-Floor Memo**
Sobald Run zeigt dass Variante E (gepaddet) Lippen bewegt aber A/B/C/D nicht → klares Signal für Audio-Min-Length-Guard in v143. Bis dahin **keine** Pipeline-Änderung.

### Was NICHT geändert wird
- `compose-dialog-segments` v140
- `lipsync-watchdog` v141
- `sync-so-webhook`
- NOOP-Eskalations-Ladder v134

Die laufende Pipeline bleibt unangetastet — Diagnose läuft komplett seitlich daran vorbei.

### Technische Details

**Files:**
- `supabase/functions/lipsync-diagnostic/index.ts` (neu)
- `supabase/migrations/<ts>_lipsync_diagnostic_runs.sql` (neu, mit GRANT + RLS auf admin role)
- `supabase/storage` Bucket `lipsync-diag` (private, admin-only RLS)
- `src/pages/admin/LipsyncDiagnostic.tsx` (neu)
- Route in `src/App.tsx` + Nav-Eintrag im Admin-Bereich
- `mem/architecture/lipsync/v142-diagnostic-mode.md` (neu)

**Sync.so Calls:** wiederverwenden die identische Helper-Logik aus `compose-dialog-segments` (sync-3 doc-strict options, Polling), aber in isolierter Datei dupliziert — kein Refactor der Live-Pipeline.

**Kosten-Kontrolle:** Hard-Cap 5 Runs/Tag pro Admin via `lipsync_diagnostic_runs.created_at` Count; Button disabled wenn überschritten.

**Auswertung:** sizeRatio + ein 3-Frame-Sample (mouth-region pixel-diff) als grobe automatische "moved?" Heuristik, manuelle Toggle hat Vorrang.

### Nächster Schritt nach Diagnose
Mit den Ergebnissen entscheiden wir genau einen Patch:
- Wenn E gewinnt → Min-Audio-Floor
- Wenn A gewinnt aber B/C nicht → ASD-Strategie auf auto_detect zurückdrehen
- Wenn alle 5 NOOP → Eskalation zu Sync.so Support, parallel Hedra/lipsync-2-pro Fallback
