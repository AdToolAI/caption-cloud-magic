# Fix: Drehbuch-Textfeld löscht/verschluckt Buchstaben

## Problem

Im `SceneDialogStudio` schreibt der User in das Drehbuch-Textfeld. Während des Tippens werden zufällig Buchstaben überschrieben oder gelöscht, der Cursor springt.

## Ursache

In `src/components/video-composer/SceneDialogStudio.tsx`:

```ts
// Zeile 169–174: debounced auto-save (500ms)
useEffect(() => {
  if (script === (scene.dialogScript ?? '')) return;
  const handle = setTimeout(() => onUpdate({ dialogScript: script }), 500);
  return () => clearTimeout(handle);
}, [script]);

// Zeile 163–166: sync from props
useEffect(() => {
  setScript(scene.dialogScript ?? '');
  setVoicePerSpeaker(scene.dialogVoices ?? {});
}, [scene.id, scene.dialogScript, scene.dialogVoices]);
```

Race-Condition:
1. User tippt „Wimmm" → `script` = "Wimmm"
2. Nach 500 ms feuert `onUpdate({ dialogScript: "Wimmm" })` → Parent re-rendert mit neuem `scene.dialogScript`
3. User tippt parallel weiter → lokal "Wimmme"
4. Sync-Effect läuft (Dependency `scene.dialogScript` hat sich geändert) → `setScript("Wimmm")` überschreibt das aktuell getippte „Wimmme"
5. Resultat: Buchstaben verschwinden, Cursor springt zurück.

Gleiches Problem mit `dialogVoices`.

## Fix

Sync nur bei **echtem Szenen-Wechsel** (scene.id), nicht bei jeder Prop-Änderung des eigenen Felds.

```ts
useEffect(() => {
  setScript(scene.dialogScript ?? '');
  setVoicePerSpeaker(scene.dialogVoices ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [scene.id]);
```

Damit gewinnt der lokale State während des Tippens; der debounced Save schickt seinen Wert an den Parent, ohne dass der Parent den User wieder „überschreibt".

## Geänderte Dateien

- `src/components/video-composer/SceneDialogStudio.tsx` — Dependencies des Sync-Effects auf `[scene.id]` reduzieren.

## Out of Scope

Keine DB-Migration, keine UI-Änderung, keine Logik-Änderung an Generierung oder Persistenz.
