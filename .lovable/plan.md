# Referenzbild-Platzierung im AI Video Toolkit

## Problem
Aktuell wird jedes hochgeladene Referenzbild automatisch als **i2v-Startframe** (`startImageUrl`) an den Provider geschickt. Wenn der Prompt sagt „Charakter/Location soll am **Ende** erscheinen", zeigt das Video den Referenzinhalt **doppelt**: einmal erzwungen als Frame 0 (aus i2v) und nochmal am Ende (aus dem Prompt).

Ursache in `src/components/ai-video/ToolkitGenerator.tsx` (Zeile ~385-391):
```
if (model.capabilities.i2v && referenceImage) body.startImageUrl = referenceImage;
```
Es gibt keine Möglichkeit zu sagen: „Bild NICHT als Startframe, sondern als Endframe oder nur als Identitäts-Referenz."

## Lösung — Placement-Selector unter dem Referenzbild-Upload

Neuer UI-Toggle (SegmentedControl / RadioGroup) direkt unter der Referenzbild-Card mit drei Optionen:

1. **Startframe** _(Default, aktuelles Verhalten)_ — Bild wird als erster Frame verwendet (`startImageUrl`).
2. **Endframe** — Bild wird als letzter Frame verwendet (`endImageUrl`), Modell interpoliert die Bewegung dorthin. Nur sichtbar wenn `model.capabilities.endFrame === true` (Kling 3 Pro/Std, Pika 2.2, Luma Ray 2).
3. **Nur als Anker** — Bild wird nur als Subject/Identity-Reference genutzt (`referenceImages[]`), kein erzwungener Frame. Nur sichtbar wenn Provider Subject-Reference unterstützt (Vidu Q2, Kling omni). Bei nicht-unterstützten Providern wird das Bild nur an `compose-scene-anchor` als Identity-Hint übergeben, aber weder als start- noch als endImage gesendet.

## Änderungen

### 1. `src/config/aiVideoModelRegistry.ts`
- Neues Capability-Flag `endFrame: boolean` für Modelle: Kling 3 Std/Pro (✓), Pika 2.2 Std/Pro (✓), Luma Ray 2 (✓). Alle anderen `false`.
- Bestehendes `subjectReference` bzw. Vidu-Multi-Ref bleibt Basis für „Nur Anker".

### 2. `src/components/ai-video/ToolkitGenerator.tsx`
- Neuer State: `referencePlacement: 'start' | 'end' | 'anchor'` (Default `'start'`).
- Reset auf `'start'`, wenn Modell gewechselt wird und die Option nicht mehr verfügbar ist.
- Beim Absenden:
  - `'start'` → `body.startImageUrl = referenceImage` (wie heute).
  - `'end'` → `body.endImageUrl = referenceImage`, `startImageUrl` NICHT setzen, `compose-scene-anchor` überspringen (kein composed first-frame → verhindert Doppel-Auftritt).
  - `'anchor'` → weder `startImageUrl` noch `endImageUrl`; falls Vidu → in `referenceImages[]` einreihen; sonst weiter über `compose-scene-anchor` als Identity-Guidance ohne startFrame-Override.
- Klarer Hinweistext pro Option: „Startframe zeigt das Bild zu Beginn", „Endframe animiert zum Bild hin", „Anker nutzt nur Identität".

### 3. `src/components/ai-video/ToolkitReferenceCard.tsx` (oder Sub-Komponente)
- Neue `<ReferencePlacementToggle />` unter Bild-Preview.
- Deaktivierte Optionen mit Tooltip: „Nicht unterstützt von {Modellname}".

## Technische Hinweise
- `generate-kling-video`, `generate-pika-video`, `generate-luma-video` akzeptieren bereits `endImageUrl` — keine Edge-Function-Änderung nötig.
- Für „Nur Anker" bei Nicht-Vidu-Modellen: `compose-scene-anchor` liefert weiter einen komponierten Frame, der aber nur an ein subject-ref-fähiges Feld geht oder gänzlich gedroppt wird. Für reine i2v-only Provider (Hailuo, Seedance ohne subject-ref) wird die Option ausgeblendet, damit User nicht denken, es funktioniere.
- Fallback: Wenn User „Endframe" wählt und `capabilities.endFrame === false`, wird das UI diese Option gar nicht erst anbieten.

## Betroffene Dateien
- `src/config/aiVideoModelRegistry.ts` — `endFrame`-Flag ergänzen.
- `src/components/ai-video/ToolkitGenerator.tsx` — Placement-State, Body-Routing, Bedingungen für `compose-scene-anchor`.
- `src/components/ai-video/ToolkitGenerator.tsx` oder neue kleine Sub-Komponente — Placement-Toggle UI.
- Ggf. `useToolkitTranslations` / i18n-Strings (DE/EN/ES) für Toggle-Labels.

## Verifikation
- Toolkit öffnen, Kling 3 Pro wählen, Bild hochladen, „Endframe" auswählen, Prompt „Charakter erscheint am Ende".
- Erwartetes Ergebnis: Video startet ohne den Charakter, Kamera fährt heran, letzter Frame = Referenzbild. Kein Doppel-Auftritt am Anfang.
- Modell zu Hailuo wechseln → „Endframe" ist ausgegraut mit Tooltip.
