## Problem

Trotz des vorigen Fixes (Slots starten mit `opacity: 0`, werden erst nach `onSeeked` sichtbar) blitzt der Anfangsframe des Quellvideos für ~1 Frame auf, bevor die Szene ab dem getrimmten In-Point weiterläuft.

## Ursache

`resetToPrimaryVideoSlot(sourceTime)` in `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` (Zeile 542–567) macht Folgendes:

1. Setzt `slotA.currentTime = sourceTime` (async — Browser muss erst seeken).
2. Setzt **sofort** `slotA.style.opacity = '1'`.

Damit wird das `opacity: 0` aus dem vorigen Patch überschrieben, **bevor** der Seek gelandet ist. Der Browser rendert einen Frame lang die alte Position (Frame 0 des Quellvideos), dann kommt `seeked` und springt zum Trim-In-Point → sichtbarer „Anfangsframe-Flash".

Dieser Reset läuft u. a. beim initialen Mount und bei jeder EDL-Änderung (Trim/Split/Delete) über den Effekt in Zeile 590–596.

## Fix (nur `DirectorsCutPreviewPlayer.tsx`, ~10 Zeilen)

`resetToPrimaryVideoSlot` so umbauen, dass Slot A **erst nach dem tatsächlichen Seek** sichtbar wird:

1. Vor dem Setzen der neuen `currentTime` prüfen, ob der aktuelle `slotA.currentTime` bereits nahe genug (`< 0.02 s`) am Ziel liegt.
   - Ja → Opacity direkt auf `1` (kein Flash möglich, weil kein Seek nötig).
   - Nein → Opacity auf `0` lassen; der bestehende `onSeeked`-Handler auf `<video ref={videoRefA}>` (bereits im vorigen Patch ergänzt) hebt sie an, sobald der Seek wirklich gelandet ist.

2. Zusätzlich: wenn `slotA.readyState < 1` (Metadaten noch nicht geladen), Opacity ebenfalls auf `0` halten — dann übernimmt der bereits vorhandene `onLoadedMetadata` + `onSeeked`-Pfad das Reveal.

## Warum das reicht

- Das Slot-A-Video wird nie sichtbar, während `currentTime` noch auf einer alten (falschen) Position steht.
- Der einzige Zeitpunkt, an dem Slot A auf `opacity: 1` gesetzt wird, ist entweder (a) sofort, wenn der Seek gar nicht nötig ist, oder (b) im `seeked`-Callback, d. h. nachdem der Browser den Trim-In-Point erreicht hat.
- Kein zusätzlicher State, kein Timer, kein Poster-Trick — nur eine korrigierte Reveal-Reihenfolge.

## Technische Details

- Datei: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- Funktion: `resetToPrimaryVideoSlot` (Zeile 542–567)
- `onSeeked` auf Slot A existiert bereits und setzt `opacity = '1'`, wenn `activeSlotRef.current === 'A'`.
- Kein anderer Codepfad setzt Slot A ohne Seek auf sichtbar — verifiziert per `grep` auf `videoRefA` / `slotA.style.opacity`.

## Nicht Teil dieses Fixes

- Keine Änderung an `handleTrimScene`, `timelineToSourceTime` oder am Remotion-Export-Template — die berechnen bereits korrekt mit `original_start_time`.
- Keine Änderung an Slot B (der ist nur während Transitions aktiv und dort schon flash-sicher, weil Transitions ihre eigene Cross-Fade-Logik verwenden).
