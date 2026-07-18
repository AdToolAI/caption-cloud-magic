## Bug: Drehbuch verschwindet während des Tippens

### Root Cause (bestätigt in `SceneDialogStudio.tsx:568-583`)

Der Sync-Effekt hat zwei Design-Fehler, die zusammen den User-Text löschen:

```ts
// Zeile 571-573
const localMatchesPersisted =
  script === (scene.dialogScript ?? '') || script === '';
if (sceneChanged || localMatchesPersisted) {
  setScript(cleanedScript);   // ← überschreibt User-Eingabe
  ...
}
```

**Problem 1 — `script === ''` als "Match" behandelt:**
Sobald der User das Feld leert (Strg+A, Backspace) und dann tippt, gilt der Zwischenzustand `''` als "local matches persisted". Feuert der Effekt jetzt (weil `canonicalDialogTurns` sich referenziell ändert), wird `setScript(cleanedScript)` mit dem aus `dialogTurns` rekonstruierten Skript aufgerufen → das gerade Getippte ist weg.

**Problem 2 — `canonicalDialogTurns` in Deps ohne Ref-Stabilität:**
Der Effekt hängt an `canonicalDialogTurns`. Wenn dieses Array bei jedem Render neu berechnet wird (Zeile 794 `Array.from(byId.values())`), feuert der Sync-Effekt in Schleife. Kombiniert mit dem Debounce (500 ms, Zeile 602), der `scene.dialogScript` asynchron zurückpropagiert, entsteht ein Fenster, in dem `cleanedScript` (aus alten Turns) neuer erscheint als `script`.

**Problem 3 — `displayScriptFromScene()` fällt bei leerem Skript auf `dialogTurnsToScript()` zurück:**
Löscht der User bewusst und tippt neu, ist der erste Buchstabe (`'I'`) noch nicht persistiert. `scene.dialogScript` ist `''`, `cleanedScript` liefert stattdessen das alte Dialog-Turns-Skript → Überschreibung.

### Fix

Der Sync-Effekt darf ausschließlich bei echten externen Änderungen laufen — nicht mehr bei jedem Turn-Ref-Wechsel und nicht mehr, wenn der lokale Puffer leer ist.

**1. Typing-Guard verschärfen (`SceneDialogStudio.tsx`, ~Z. 567-583)**

- `localMatchesPersisted` neu definieren als *nur* `script === (scene.dialogScript ?? '')` — kein `script === ''`-Zweig mehr. Ein leerer lokaler Puffer ist eine bewusste User-Aktion, kein Freibrief zum Überschreiben.
- Ein `isUserTypingRef = useRef(false)` einführen; im `onChange` des Textareas (Z. 1993) auf `true` setzen und via `setTimeout` (~1500 ms nach letztem Keystroke) wieder auf `false`. Solange `isUserTypingRef.current === true` gilt: **kein** `setScript()` aus dem Sync-Effekt, egal was extern kommt.
- `sceneChanged` bleibt die einzige Bedingung, die die Typing-Guard aushebelt (Scene-Wechsel = User verlässt die Szene, Puffer muss neu geladen werden).

**2. Deps stabilisieren**

- Statt `canonicalDialogTurns` (Array-Ref) als Dependency einen daraus abgeleiteten stabilen String hashen, z.B. `canonicalDialogTurns.map(t => t.characterId + ':' + t.text).join('|')`. Damit feuert der Effekt nur bei semantischer Änderung, nicht bei jedem Render.

**3. Debounce race schließen**

- Im Persist-Effekt (Z. 587-605) einen Vergleich `if (script === lastPushedRef.current) return;` ergänzen, damit die zurückpropagierte `scene.dialogScript` nicht als „externe Änderung" fehlgedeutet wird.
- `lastPushedRef` wird direkt vor `onUpdate(updates)` (Z. 601) auf `script` gesetzt.

**4. Fallback-Reihenfolge fixen**

- `displayScriptFromScene()` (Z. 502) darf nur beim initialen Mount oder bei Scene-Wechsel auf `dialogTurnsToScript()` zurückfallen. Sonst: wenn `scene.dialogScript === ''`, den bestehenden `script` behalten. Realisierung: neue Signatur `displayScriptFromScene({ fallbackToTurns: boolean })`, im Sync-Effekt mit `fallbackToTurns: sceneChanged` aufgerufen.

### Verifikation

- Vitest-Unit-Test in `src/components/video-composer/__tests__/SceneDialogStudio.script.test.tsx`:
  - Simuliert schnelles Tippen, während parent `scene.dialogTurns`-Prop referenziell wechselt (gleicher Inhalt).
  - Erwartung: Der Textarea-Wert bleibt exakt der User-Input, keine Restauration.
- Manueller Preview-Check: Neue Szene öffnen, in Drehbuch tippen, Cast in einer anderen Szene ändern (löst Realtime-Update aus) → Text bleibt stehen.

### Nicht angefasst

- Voice-Map, Dialog-Takes, Debounce-Intervall, Persist-Pfad (`onUpdate`), Kling-Omni-Integration.
- Lip-Sync-Pipeline (v247/v248) — reiner Frontend-Statebug.

### Betroffene Dateien

- `src/components/video-composer/SceneDialogStudio.tsx` (Sync- + Persist-Effekt, Fallback-Signatur, Typing-Ref)
- `src/components/video-composer/__tests__/SceneDialogStudio.script.test.tsx` (neu)
