# Visual-Continuity-System für Motion Studio

Die Analyse ist richtig und ersetzt meinen bisherigen Vorschlag. Ein reiner `transitionMode` löst nur die Schnittkante — das eigentliche Problem ist, dass `firstFrame`, Charakter-Identität und Location/Produkt heute in einen einzigen gedanklichen „Referenzbild"-Slot fallen.

Zwei Punkte, denen ich ausdrücklich zustimme:

- **`maxReferences` reicht als Fähigkeitsangabe nicht.** Entscheidend ist, ob `first_frame` ein eigener API-Parameter ist oder einen der Referenzslots verbraucht. Genau das steht heute nirgends.
- **„Lip-Sync = immer Match-Cut" als Hardcode ist falsch.** Richtig ist die Slot-Konflikt-Regel: Frame-Chain wird nur blockiert, wenn First Frame und Identitäts-Anker auf demselben Modell um denselben Input-Slot konkurrieren.

Ein Punkt, an dem ich vorsichtiger bin: die Lip-Sync-Kette steht unter Feature-Freeze (v400, `.lovable/LIPSYNC-FEATURE-FREEZE.md`, Invariante 1: Geometrie wird ausschließlich auf `reference_image_url` gemessen). Der Resolver darf deshalb für Lip-Sync-Szenen zwar *auswerten*, aber im ersten Schritt nichts am Payload der Sync-Kette ändern. Die Lockerung „Lip-Sync + First Frame, wenn getrennte Slots" wird als Fähigkeit modelliert, aber erst nach einem grünen Referenzlauf scharf geschaltet.

## Architektur

```text
Storyboard → Scene Analysis → Continuity Requirements
   → Character / Product / Location Anchors
   → Model Capability Lookup
   → VisualInputResolver
   → Transition Resolver
   → Lip-Sync Compatibility Guard
   → Provider Payload
```

### 1. Getrennte Bildrollen pro Szene

Statt eines Slots: `firstFrameUrl`, `endFrameUrl`, `characterReferences[]`, `locationReferences[]`, `productReferences[]`. Die bestehenden Felder `referenceImageUrl` und `lockReferenceUrl` bleiben als Identitäts-Anker unangetastet und werden in `characterReferences` nur *gespiegelt*, nie ersetzt — die v400-Invariante bleibt gültig.

### 2. Registry: `visualInputs` statt `maxReferences`

```ts
visualInputs: {
  firstFrame: true,
  endFrame: false,
  references: { max: 30, character: true, product: true, location: true },
  firstFrameConsumesReferenceSlot: false,
  lipSync: { supported: true, requiresIdentityReference: true, conflictsWithFirstFrame: false },
}
```

Pro Modell aus der bereits erstellten Capability-Matrix (`docs/ai-video-capability-matrix.md`) befüllt. `maxReferences` bleibt als abgeleiteter Wert für die UI erhalten, damit nichts bricht.

### 3. VisualInputResolver

`resolveVisualInputs({ scene, previousScene, model, transitionPreference })` → `{ firstFrameUrl, referenceImages, endFrameUrl, transitionMode, anchorStrategy, warnings }`.

`anchorStrategy`: `transition-priority` | `identity-priority` | `product-priority` | `balanced`.

Automatik: kein Charakter → `transition-priority`; sichtbarer wiederkehrender Charakter → `identity-priority`; Produkt-Hero-Shot → `product-priority`; Multi-Ref-Modell mit getrenntem First-Frame-Slot → `balanced`.

Priorität bei nur einem verfügbaren Bild-Slot:
- B-Roll / Environment: Last Frame > Location
- Produkt: Produkt oder Last Frame (je nach `product-priority`)
- Charakter ohne Lip-Sync: Charakter-Identität > Last Frame
- Charakter mit Lip-Sync: Charakter-Anker / Sync-Plate schlägt alles

### 4. Reference Budget

Nicht 30 Bilder schicken, weil 30 gehen. Gewichtete Auswahl, dann auf das Modell-Maximum gekürzt: Previous-Frame (höchste), Hauptcharakter (höchste), Nebencharakter (hoch), Produkt (hoch), Location (mittel), Style (niedrig), weitere Charakter-Refs (niedrig).

### 5. UI an der Schnittkante

Kein technischer Wortlaut. Ein Feld **Visual Continuity** mit `Auto · Seamless · Identity · Match Cut`; Auto ist Default. Tooltip nennt die getroffene Entscheidung im Klartext, z. B. „Hailuo — Charakter-Identität hat Vorrang → Match Cut" oder „Seedance 2.5 — Charakter + Vorframe + Location → nahtlos". Unmögliche Optionen sind gesperrt mit Begründung.

### 6. Transition Frame Analyzer (Stufe 2)

Statt stumpf dem letzten Frame: „last usable continuity frame". Bewertet die letzten ~1 s auf `characterVisibility`, `characterCount`, `productVisibility`, `cameraAngle`, `motionBlur`, `occlusion`, `lighting`, `frameQuality` und wählt den besten Kandidaten. Baut auf `extract-video-last-frame` / `extract-video-frames` und `analyze-scene-subject` auf — die existieren bereits.

## Reihenfolge

1. **Registry `visualInputs`** für alle Modelle füllen + Test, dass jedes Modell einen vollständigen Block hat.
2. **Szenen-Bildrollen** in `src/types/video-composer.ts` und Persistenz (`composer_scenes`), abwärtskompatibel zu heutigen Feldern.
3. **VisualInputResolver** als reine Funktion mit Unit-Tests je Rendering-Klasse (B-Roll, Produkt, Charakter ohne Sync, Charakter mit Sync).
4. **Render-Routen anbinden**: `compose-video-clips` ruft den Resolver auf und übergibt das Ergebnis; die providerspezifischen `if/else`-Ketten für Bildinputs entfallen dort.
5. **UI „Visual Continuity"** an der Schnittkante inkl. Klartext-Tooltip.
6. **Reference Budget** für Multi-Ref-Modelle.
7. **Transition Frame Analyzer** als letzter Schritt, hinter einem Flag.

Schritte 1–3 sind reine Vorbereitung ohne Verhaltensänderung; ab Schritt 4 wird pro Provider verifiziert.

## Technische Details

- Neu: `src/lib/composer/visualInputs/{types.ts,resolveVisualInputs.ts,referenceBudget.ts}` + Tests.
- `src/config/aiVideoModelRegistry.ts`: `visualInputs`-Block je Modell, `maxReferences` als Ableitung.
- `src/types/video-composer.ts`: neue Rollen-Arrays, `visualContinuity?: 'auto' | 'seamless' | 'identity' | 'match-cut'` je Kante.
- `supabase/functions/compose-video-clips/index.ts` und die `generate-*-video`-Functions nehmen das Resolver-Ergebnis entgegen, statt Bildinputs selbst zu wählen.
- Guard-Tests: (a) kein Resolver-Pfad schreibt `referenceImageUrl` / `lockReferenceUrl`; (b) Lip-Sync-Szenen erhalten nur dann einen First Frame, wenn `lipSync.conflictsWithFirstFrame === false` **und** das Freeze-Flag für diese Lockerung gesetzt ist; (c) Referenzanzahl je Payload ≤ Modell-Maximum.
- Lip-Sync-Kette (v400-Freeze) bleibt in Stufe 1–6 unverändert; Preise und Wallet-Logik ebenfalls.

## Verifikation

Vier Referenzfälle, je ein echter Lauf mit protokolliertem Payload: (a) Atlantis / B-Roll auf Seedance 2.5 → Frame-Chain + Location-Referenz; (b) Landschaftspaar auf Hailuo → Frame-Chain; (c) Founder-Spot mit Lip-Sync → Identity-Priority, Anker unverändert, Match Cut; (d) Produkt-Hero auf Kling Omni → Produkt + Vorframe.
