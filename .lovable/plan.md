

## Root Cause
Der "Alle Clips generieren"-Button schickt `projectId: undefined` an `compose-video-clips`. Die Edge Function lehnt deshalb mit `"projectId and scenes are required"` ab (HTTP 400).

**Warum?** `VideoComposerDashboard.tsx` hält das gesamte Projekt **nur in localStorage**. Es gibt nirgends einen `INSERT INTO composer_projects` oder `composer_scenes`. Auch die Szenen-IDs sind Client-Strings (`scene_1234567890`) statt echte UUIDs, und die Edge Function macht `UPDATE composer_scenes ... WHERE id = '...'` — also würde selbst mit projectId nichts gefunden.

## Fix — Projekt + Szenen in DB persistieren bevor Clips generiert werden

### 1. Neuer Hook `useComposerPersistence.ts`
Eine Helper-Funktion `ensureProjectPersisted(project)`:
- Wenn `project.id` bereits existiert → return id
- Sonst: `INSERT INTO composer_projects` mit `user_id`, `title`, `category`, `briefing`, `status='draft'`, `language` → erhält UUID zurück
- Dann **alle Szenen** in `composer_scenes` upserten (mit echten UUIDs aus DB) — die Client-IDs werden auf die DB-UUIDs gemappt
- Das gemappte `scenes`-Array zurückgeben (mit echten UUIDs als `id`)

### 2. `VideoComposerDashboard.tsx` anpassen
- Vor dem Wechsel zu Tab "Clips" (oder beim Klick auf "Alle Clips generieren") `ensureProjectPersisted` aufrufen
- `project.id` und Szenen-IDs ins lokale State übernehmen
- localStorage-Draft weiterhin als UX-Backup behalten

### 3. `ClipsTab.tsx` defensiv absichern
- Wenn beim Klick auf "Alle Clips generieren" `projectId` fehlt → `ensureProjectPersisted` aufrufen, dann fortsetzen
- Eindeutige Fehlermeldung statt nur "Edge Function returned non-2xx"

### 4. `compose-video-clips` Edge Function — bessere Fehlermeldung
- Statt nur `"projectId and scenes are required"` einen klaren Code (`MISSING_PROJECT_ID`) zurückgeben, damit das UI besseres Feedback geben kann

### 5. Verify
- 1× Briefing → Storyboard → Clips → "Alle Clips generieren" → DB-Insert sollte stattfinden, dann sollte die Generierung starten ohne 400-Fehler.

### Was unverändert bleibt
- Datenmodell (DB-Schema schon korrekt)
- Tab-Logik, Pricing-Logik, Briefing-Tab
- Universal Video Creator (nicht angefasst)

