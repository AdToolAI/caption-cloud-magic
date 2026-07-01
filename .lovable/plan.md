## Problem

Nach 3–5 min Arbeit (bis Export/Render) wirst du beim Wechsel zu anderem Tab / Browser / Reload wieder auf **Schritt 1 – Format wählen** geworfen — obwohl Format, Content, Szenen, Audio unten weiterhin ausgefüllt sind.

## Root Cause (im Code verifiziert)

`src/pages/UniversalCreator/UniversalCreator.tsx`

**Kern-Bug:** `hydrateFromDb()` (Zeile 319–351) restauriert alles außer `currentStep`. Der Wizard-Schritt existiert schlicht nicht im DB-Payload — er wird nur in localStorage gebackupt. Sobald du in einem anderen Browser bist (kein localStorage) oder das Backup abgelaufen ist (1 h Max Age), lädt die Seite Format+Content+Scenes aus der DB, setzt `currentStep` aber auf den Default `0`. → Rückwurf auf Schritt 1.

**Nebeneffekte:**
1. **URL bekommt erst nach dem ersten "Weiter"-Klick ein `?project=<id>`** — davor kein DB-Draft, kein Cross-Browser-Resume.
2. **`BACKUP_MAX_AGE_MS = 1 h`** ist zu kurz für Sessions, die man abends abbricht und morgens weitermacht.
3. **Kein Auto-Resume**, wenn `/universal-creator` ohne `?project=` geöffnet wird, obwohl in der DB ein Draft von dir existiert.

## Fix-Plan

### 1. `currentStep` in die DB persistieren *(Kern-Fix)*
- `saveProgress()`: `current_step: currentStep` in das `customizations`-JSONB mitspeichern.
- `hydrateFromDb()`: `setCurrentStep(customizations.current_step ?? 0)` beim Restore.
- Effekt: Du landest **exakt auf dem Export-Schritt**, an dem du warst — auch in Chrome ↔ Safari.

### 2. Sofortiges DB-Draft + URL-Sync
- Sobald `formatConfig` gewählt wurde, `saveProgress()` **debounced (500 ms)** im bestehenden Backup-`useEffect` mit-triggern (nicht mehr nur bei `handleNext` / 10-s-Intervall).
- Ergebnis: `?project=<id>` steht in der URL, bevor du irgendwas anderes tust.

### 3. localStorage-Backup: 1 h → 7 Tage
- `BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000`.

### 4. Silent Auto-Resume ohne URL-Parameter
- Beim Mount, wenn weder `?project=` noch gültiges localStorage-Backup vorhanden:  
  jüngstes `content_projects` mit `content_type='universal'`, `status='draft'`, `updated_at ≥ 7 d` laden, `?project=<id>` (`replace: true`) in URL setzen, `hydrateFromDb` laufen lassen.
- Kein Toast-Prompt — du bist direkt an der letzten Stelle wieder da.
- `handleNewProject()` bleibt unverändert (räumt gezielt auf).

## Technische Details

**Betroffene Datei**
- `src/pages/UniversalCreator/UniversalCreator.tsx` — 4 Stellen (`saveProgress`, `hydrateFromDb`, `BACKUP_MAX_AGE_MS`, Mount-Effekt).

**Keine DB-Migration nötig** — `current_step` läuft in das bestehende `customizations`-JSONB.

**Keine Änderung am Renderer, Preview-Player oder Audio-Mixer.**

## Erwartetes Verhalten nach dem Fix

| Szenario | Vorher | Nachher |
|---|---|---|
| Tab wechseln und wieder zurück | Schritt 1 | Export-Schritt |
| Anderer Browser (eingeloggt) | Schritt 1 | Export-Schritt |
| Reload nach 2 h Pause | Schritt 1 | Export-Schritt |
| `/universal-creator` ohne URL-Param | Leerer Wizard | Letzter Draft resumt |
| "Neues Projekt" Button | Schritt 1 | Schritt 1 (unverändert) |