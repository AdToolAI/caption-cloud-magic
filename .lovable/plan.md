## Problem

Beim Klick auf **„Voiceover generieren"** im *Szenen-Skript*-Panel erscheint der Toast `Generierung fehlgeschlagen — [object Object]`.

## Ursache

In `SceneDialogStudio.tsx` (`handleGenerateInline`) wird beim ersten Block erfolgreich Audio von ElevenLabs erzeugt (Edge-Log bestätigt: `bytes: 31391`, projectId: `""`). Direkt danach scheitert der `INSERT` in `scene_audio_clips`:

- Die Spalte `project_id` ist `uuid`, aber das Frontend übergibt `projectId ?? scene.projectId` — das ist hier ein **leerer String** (`''`), weil `VideoComposerDashboard` das Projekt initial mit `projectId: ''` rendert (Zeile 498/769) und Nullish-Coalescing `""` nicht ersetzt.
- Postgres liefert daraufhin einen `PostgrestError`-Objekt-Fehler. Der Toast macht `String(e)` → `"[object Object]"`.

Der gleiche Bug existiert auch im SRS-Pfad (`handleGenerate`, ~Zeile 436) und beim AI-Skript-Aufruf.

## Fix (klein, frontend-only)

**Datei:** `src/components/video-composer/SceneDialogStudio.tsx`

1. **Projekt-Guard** vor `handleGenerateInline` und `handleGenerate`:
   - Effektive Projekt-ID berechnen: `const pid = (projectId || scene.projectId || '').trim();`
   - Wenn leer → Toast „Bitte zuerst das Projekt speichern" (DE/EN/ES) und Abbruch, **bevor** ElevenLabs aufgerufen wird (spart Credits).
2. **Fehler-Toast härten**: kleine Hilfsfunktion `formatError(e)`, die in dieser Reihenfolge probiert: `e.message` → `e.error?.message` / `e.context?.message` → `e.details` → `JSON.stringify(e)` → `String(e)`. An allen drei `catch`-Blöcken (AI-Skript, Inline-Generate, SRS-Generate) verwenden.
3. **Insert nur mit gültiger pid**: `project_id: pid` statt `projectId ?? scene.projectId`.

## Out of scope

- Keine DB-Migrationen, keine Edge-Function-Änderungen, keine UI-Redesigns.
- Auto-Save des Projekts wird hier **nicht** ergänzt — nur klarer Hinweis an den User.
