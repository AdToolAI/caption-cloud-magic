# V449 — Rooftop-Test als frisches Motion-Studio-Projekt

## Ausgangslage (geprüft)

- Das Projekt **V448 — Rooftop Movement Lipsync Test** existiert weiterhin in der Datenbank, mit genau einer Szene (`4015394d-…`), Status `draft`, Clip-Status `pending` — es wurde nie gerendert.
- Es gehört bereits dem Account **bestofproducts4u@gmail.com** (`8948d3d9-…`), demselben Account, dem auch die vier Cast-Charaktere Sarah, Samuel, Matthew und Kay gehören.
- Der Grund, warum du es nie gesehen hast: Das Motion Studio öffnet beim Aufruf ohne Projekt-Parameter den zuletzt lokal gespeicherten Entwurf, nicht die Projektliste. Nach dem Löschen des alten Projekts ist dieser Entwurf leer — daher „0 Scenes".

## Was gemacht wird

**1. Ein frisches Projekt anlegen: `V449 — Rooftop Movement Lipsync Test`**
- Besitzer: bestofproducts4u@gmail.com
- Sprache Deutsch, Status `draft`, als Testlauf markiert, kein Auto-Render

**2. Genau eine Szene übernehmen — 1:1 aus V448**
- `S01 — Rooftop Movement Dialogue Test`, `order_index = 0`, 15 s, Provider HappyHorse
- Lip-Sync aktiv, Dialogmodus aktiv, Engine `cinematic-sync`
- Identischer Szenen-Prompt, identische Blocking-Beschreibung (Sarah links, Samuel wandert nach rechts, Matthew dahinter am Tablet, Kay im Dreiviertelprofil)
- Dieselben vier Cast-Einträge mit denselben Charakter-IDs
- Dieselben sechs Dialog-Turns in derselben Reihenfolge, dieselben deutschen ElevenLabs-Stimmen
- Keine Laufzeit-Felder werden mitkopiert (kein Run, kein Anker, keine Plate) — die Szene startet garantiert sauber

**3. Altes V448-Projekt entfernen**
- Damit nicht zwei identische Testprojekte in der Liste stehen. Es enthält keine Renderdaten, es geht nichts verloren.

**4. Direkter Öffnungslink**
- Nach dem Anlegen bekommst du die Projekt-ID und die fertige URL im Format
  `https://useadtool.ai/video-composer?projectId=<neue-id>`
- Dieser Link umgeht den lokalen Entwurf und lädt das Projekt direkt aus der Datenbank.

## Was NICHT passiert

- Kein Render, kein Provider-Aufruf, keine Credits.
- Keine Änderung an der Lip-Sync-Pipeline, an Edge Functions oder am Frontend-Code.
- Keine anderen Projekte, Charaktere oder Renderdaten werden angefasst.

## Technische Details

- `INSERT` in `composer_projects` (title, `user_id = 8948d3d9-…`, `language = 'de'`, `status = 'draft'`, `is_test_run = true`).
- `INSERT` in `composer_scenes` per `SELECT` aus der bestehenden V448-Zeile, mit neuer `id` und neuer `project_id`; ausgenommen bleiben `active_run_id`, `clip_url`, `reference_image_url`, `lock_reference_url`, `dialog_shots`, `replicate_prediction_id`, `clip_status` (wird `pending`), `twoshot_stage`, `lip_sync_status`.
- Anschließend `DELETE` der V448-Zeilen (Szene, dann Projekt).
- Verifikation per Query: neues Projekt hat genau 1 Szene, 6 Dialog-Turns, 4 Cast-Einträge, `clip_status = 'pending'`, kein aktiver Run.

## Rückgabe

Projekt-ID, Szenen-ID, Öffnungs-URL, die vier Cast-IDs, die sechs Dialog-Turns und die Bestätigung „bereit für genau einen manuellen Render".
