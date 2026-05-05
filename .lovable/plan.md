## Problem

In `ClipsTab.handleGenerateAll` filtert das Payload **strikt** auf:

```ts
scenes.filter(s => s.clipStatus !== 'ready' && !(s.clipSource === 'upload' && s.uploadUrl))
```

Sobald alle 6 Szenen `clipStatus === 'ready'` sind, ist `pendingScenes.length === 0` → Button zeigt **„Alle Clips bereit"** und ist disabled.

In `StoryboardTab.updateScene` wird beim Wechsel des `clipSource` (z. B. von Seedance auf Vidu Q2) nur `costEuros` neu berechnet — **`clipStatus` bleibt `'ready'`** und `clipUrl` zeigt weiterhin auf den alten Clip. Der neue KI-Generator wird dadurch nie für „Alle generieren" berücksichtigt; nur der Per-Scene-Button „Neu generieren €0.60" funktioniert noch, weil dieser nicht filtert.

## Fix (3 kleine, gezielte Änderungen)

### 1. `StoryboardTab.tsx` — Engine-Wechsel invalidiert vorhandenen Clip

In `updateScene` einen Reset-Block ergänzen, **wenn sich `clipSource` ändert UND der bisherige Clip aus einer KI stammt** (also nicht Stock/Upload):

```ts
const sourceChanged =
  updates.clipSource !== undefined && updates.clipSource !== s.clipSource;
const wasAiClip = s.clipSource?.startsWith('ai-');

if (sourceChanged && wasAiClip) {
  updated.clipStatus = 'pending';
  updated.clipUrl = undefined;
  updated.replicatePredictionId = undefined;
  updated.uploadType = undefined;
  updated.previousClipUrl = s.clipUrl; // optional Backup für „Rückgängig"
}
```

Damit fällt die Szene automatisch wieder in den `pendingScenes`-Filter und „Alle generieren" wird mit dem **neuen** Engine ausgeführt.

### 2. `ClipsTab.tsx` — Toast & UI-Feedback

Im Summary-Bar zusätzlich einen Hinweis anzeigen, wenn nach Engine-Wechsel Szenen invalidiert wurden („3 Szenen warten auf Re-Generierung mit Vidu Q2"). Das verhindert Verwirrung, falls der User vorher dachte, alles sei fertig.

Zusätzlich beim Engine-Wechsel ein Toast aus `StoryboardTab` (oder im SceneCard-Engine-Selector) auslösen:
> „Engine geändert — Szene wird mit dem neuen Modell neu generiert, sobald du auf ‚Alle generieren' klickst."

### 3. „Engine für alle übernehmen" Komfort-Button (optional, klein)

Im Storyboard-Tab oben einen Button „Engine für alle Szenen übernehmen" hinzufügen, der das aktuelle Engine-Dropdown der ersten Szene auf alle anderen Szenen anwendet (mit den unter Punkt 1 genannten Resets). Spart bei 6 Szenen 5 Klicks.

## Geänderte Dateien

- `src/components/video-composer/StoryboardTab.tsx` (Reset-Logik in `updateScene`, optionaler Bulk-Engine-Button)
- `src/components/video-composer/ClipsTab.tsx` (Hinweis-Text im Summary-Bar)
- ggf. `src/components/video-composer/SceneCard.tsx` (Toast beim Engine-Change)

## Erwartetes Verhalten danach

1. User generiert alle Clips → 6/6 fertig.
2. Zurück in Storyboard, ändert Engine z. B. auf Vidu Q2.
3. Status der geänderten Szenen springt automatisch auf `pending`, alter Clip-Preview wird ausgeblendet.
4. Im Clips-Tab ist „Alle generieren (X • €Y.YY)" wieder aktiv und nutzt den neuen Engine.
5. Stock-/Upload-Szenen bleiben unangetastet.

Soll ich das so umsetzen?
