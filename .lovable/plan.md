## Phase C.1 — Continuity Auto-Lock im Dialog-Modus

Fokussierter Nachzieh-Patch für den fehlenden Baustein 1 aus Phase C. Ziel: Sarah/Matthew driften nicht mehr optisch zwischen Dialog-Szenen mit gleichem Cast — Artlist-parity vollständig.

---

### 1) Edge Function `compose-dialog-scene` — Lock-Persistierung + Re-Use

- Akzeptiert neues optionales Feld `lockReferenceUrl: string | null` im Request-Body.
- **Wenn `lockReferenceUrl` vorhanden:** wird vor dem Plate-Render als zweite `referenceImages[]`-Slot in den Hailuo-i2v-Payload injiziert (zusätzlich zum bestehenden Scene-Anchor — Slot 1 = Komposition, Slot 2 = Identity-Lock).
- **Wenn KEIN Lock und Szene ist erster Dialog mit diesem Cast:** nach erstem erfolgreichen Plate-Render wird `lastFrameUrl` (bereits aus dem Hailuo-Output bekannt) in `composer_scenes.lock_reference_url` per Service-Role-Client persistiert.
- Idempotent: existiert die Spalte schon, wird nicht überschrieben.

### 2) DB — Spalte sicherstellen

- `composer_scenes.lock_reference_url` wird vom Composer bereits gelesen/geschrieben (Zeilen 364/495/811/1042 in `VideoComposerDashboard`). Falls die Spalte fehlt: Mini-Migration `ALTER TABLE composer_scenes ADD COLUMN IF NOT EXISTS lock_reference_url text`.
- Vorab geprüft via existierender Lese-Pfade. Migration wird nur ausgelöst, wenn Spalte tatsächlich fehlt.

### 3) Auto-Propagation in `VideoComposerDashboard.tsx`

Neue reine Helper-Funktion `propagateDialogLock(scenes)`:
- Iteriert Szenen in Reihenfolge, gruppiert nach `dialogMode === true` + Cast-Signatur (sortierte `castCharacterIds`).
- Erste Szene jeder Gruppe, die `lockReferenceUrl` besitzt → Lock wird auf alle folgenden Szenen derselben Gruppe propagiert, sofern diese noch keinen eigenen Lock haben.
- Cast-Wechsel ⇒ Gruppe endet, Lock gilt für die neue Gruppe nicht.
- Aufruf: nach jedem `compose-dialog-scene`-Response und beim initialen Scene-Load.

### 4) UI — `SceneDialogStudio.tsx`

Direkt unter der Cast-Pill-Zeile ein neuer Status-Block (nur sichtbar wenn `dialogMode === true`):

- **Badge "Continuity gesperrt"** (Gold, mit Lock-Icon) sobald `scene.lockReferenceUrl` existiert; Tooltip zeigt Thumbnail-Preview des Lock-Frames.
- **Badge "Continuity erbt von Szene N"** (Cyan, dezenter) wenn der Lock per Propagation aus einer früheren Szene stammt — Erkennung über neues, transientes Feld `lockSource: 'self' | 'inherited'`, das `propagateDialogLock` zurückgibt.
- **Toggle "Lock entfernen"** → setzt `lockReferenceUrl = null` (nur für eigene Locks, nicht für geerbte; bei geerbten zeigt der Button stattdessen "Eigenen Lock erzwingen", der die Propagation für diese Szene unterbricht).
- **Auto-Clear:** Wechselt der User den Cast einer Szene, wird `lockReferenceUrl` automatisch gelöscht (Hook in den bestehenden Cast-Change-Handler).

### 5) Persistenz

- Bereits funktional via `useComposerPersistence` (snake_case-Mapping existiert). Kein Hook-Edit nötig — nur sicherstellen, dass das transiente `lockSource` NICHT persistiert wird (nur Runtime).

---

### Bewusst NICHT enthalten

- Manuelles Hochladen eines eigenen Lock-Frames (kommt ggf. später)
- Lock-Propagation über Nicht-Dialog-Szenen hinweg (Composer hat dafür schon Continuity Guardian)
- Mehrere Lock-Slots pro Charakter

### Akzeptanzkriterien

1. Erste Dialog-Szene mit Sarah+Matthew rendert → "Continuity gesperrt" Badge erscheint sofort nach Plate-Render.
2. Nächste Dialog-Szene mit gleichem Cast zeigt automatisch "Continuity erbt von Szene N" und Hailuo-Plate behält Kleidung/Frisur/Licht (visuell verifizierbar).
3. Cast-Wechsel in Szene 3 (Sarah raus, Lisa rein) → Lock-Badge verschwindet automatisch, Folgeszenen mit Lisa+Matthew bilden neue Gruppe.
4. Klick auf "Lock entfernen" in Quell-Szene → Folgeszenen verlieren geerbten Lock im selben Tick.

### Aufwand

- 1 Edge-Function-Edit (`compose-dialog-scene`, additiv, ~20 LOC)
- 1 evtl. Mini-Migration (falls Spalte fehlt)
- 3 Frontend-Dateien (Dashboard Helper, SceneDialogStudio Badge/Toggle, Cast-Change-Handler)
- 0 neue Edge Functions, 0 Credit-Änderungen, 0 neue API-Keys

Soll ich loslegen?
