## Pipeline-Audit: Status vs. Artlist

Ich habe die komplette Phase-A/B/C-Pipeline durchgegangen (DB-Spalten, Edge Functions, Persistenz-Pfade, Propagation, UI-Badges, Cast-Logik). **Das meiste sitzt korrekt** — drei echte Bugs bleiben aber.

### Was sauber funktioniert
- `composer_scenes.lock_reference_url` + `dialog_mode` existieren in der DB, Daten werden bereits korrekt geschrieben (verifiziert: 2/5 letzten Dialog-Szenen haben Lock).
- `compose-video-clips` persistiert den ersten Anchor als Lock und injiziert vorhandene Locks als primäre Portrait-Referenz in `compose-scene-anchor` (Nano Banana 2).
- `propagateDialogLock` läuft auf allen drei Ladepfaden (initial fetch, realtime merge, lokales `setScenes`) und auf dem Persist-Pfad.
- Dashboard-`persistScenesToDb` schreibt `lock_reference_url` mit (Zeile 812).
- Badges (gold self / cyan inherited) + Thumbnail + Aktions-Button rendern in `SceneDialogStudio`.
- `compose-dialog-scene` braucht den Lock **nicht** — es ist der Sync.so-Lipsync-Dispatcher auf einem bereits gerenderten Plate (kein Bug, anders als ursprünglich vermutet).

### Drei echte Bugs

**Bug 1 — "Force own lock"-Button ist faktisch ein No-Op.**
In `SceneDialogStudio.tsx` (Zeile 1332) ruft der Button bei *inherited* Locks `onUpdate({ lockReferenceUrl: undefined })` auf. Im nächsten `setScenes` läuft aber `propagateDialogLock`, das genau diesen leeren Wert wieder mit `leaderLock` füllt → die Vererbung kehrt sofort zurück. Der User kann den geerbten Lock nicht aufbrechen.

**Bug 2 — Cast-Wechsel behält stale Lock.**
Wenn der User in einer Dialog-Szene Sarah gegen Anna tauscht, bleibt `lockReferenceUrl` (= Anchor mit Sarahs Gesicht) bestehen und wird bei der nächsten Anchor-Komposition als primäre Identity-Referenz gegen Annas Portrait gemischt → Identity-Pollution. `propagateDialogLock` schützt nur *nachfolgende* Szenen (neue cast-signature = neue Gruppe), nicht die geänderte Szene selbst.

**Bug 3 — `useComposerPersistence` droppt `lock_reference_url` beim Initial-Flush.**
Beide `.update(...)`- und `.insert(...)`-Blöcke (`src/hooks/useComposerPersistence.ts` Zeile ~180 und ~220) listen `lock_reference_url` nicht auf. Beim ersten `ensureProjectPersisted`-Save kann ein bereits gesetzter Lock verloren gehen. Edge case, aber inkonsistent zum Dashboard-Pfad.

---

## Fix-Plan (Phase C.2 — Polish)

### 1. `SceneDialogStudio.tsx` — Force-Own korrekt umsetzen
Neuer Prop `onForceOwnLock?: () => Promise<void>` vom Dashboard. Bei Klick auf "Lock erzwingen" (inherited): triggert einen leichten Re-Run von `compose-scene-anchor` *ohne* `lockRefUrl` für **diese** Szene, persistiert das Ergebnis als neuen `lockReferenceUrl` → propagateDialogLock erkennt sie ab dann als eigene Leaderin der Sub-Gruppe.
Alternativ (leichtere Variante, wenn kein neuer Anchor gewünscht): Button-Label klarstellen auf "Vererbung lösen" und Lock auf `null` setzen *plus* einen transienten "no-inherit"-Marker, der propagate respektiert. Empfehlung: **Re-Render-Variante** (sauber, kostet 1× Nano Banana 2 ≈ €0.04).

### 2. Cast-Change-Auto-Clear
In `VideoComposerDashboard.tsx` → `setScenes`: vor `propagateDialogLock` ein kleiner Diff-Check pro Szene: wenn die alte Szene eine `cast-signature` (sortierte `characterShots[].characterId`) ≠ neue cast-signature und `lockSource === 'self'`, dann `lockReferenceUrl = undefined` (und auch `clipUrl/clipStatus` invalidieren, damit der nächste Render einen frischen Anchor zieht).

### 3. `useComposerPersistence.ts` — Spalte ergänzen
In beiden Update- und Insert-Payloads ergänzen:
```ts
lock_reference_url: scene.lockReferenceUrl ?? null,
continuity_locked: scene.continuityLocked === true,
```

### 4. Persist-Filter für transiente Felder
Sicherstellen, dass `lockSource` / `lockSourceSceneIndex` nirgendwo als Spalten verschickt werden (Stichprobe ergab: aktuell sauber, weil beide Persist-Pfade nur whitelisted Felder schreiben — keine Änderung nötig, nur Vermerk im Plan).

### Definition of Done
- "Lock erzwingen" auf einer geerbten Szene rendert einen neuen Anchor und der Badge wechselt von cyan → gold.
- Cast-Tausch (Sarah → Anna) in einer self-locked Dialog-Szene entfernt den Lock automatisch, der nächste Render zieht ein frisches Anchor-Bild mit Annas Identität.
- Initial-Save einer Brand-new-Szene mit vorhandenem Lock erhält den Lock in der DB.

### Technische Details
- **Geänderte Dateien:** `src/components/video-composer/SceneDialogStudio.tsx`, `src/components/video-composer/VideoComposerDashboard.tsx`, `src/hooks/useComposerPersistence.ts`, ggf. neue Helper-Function `src/lib/video-composer/castSignature.ts`.
- **Keine** DB-Migration, **keine** neuen Edge Functions, **keine** Credit-Änderungen.
- Force-Own ruft `compose-scene-anchor` direkt aus dem Frontend auf (gleicher Pfad wie der bestehende manuelle Re-Anchor-Flow).
