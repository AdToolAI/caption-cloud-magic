## Diagnose

`ToolkitGenerator.tsx` komponiert heute nur bedingt einen Nano-Banana-2 Startframe:
- nur bei `referencePlacement === 'start'`
- nur bei Modellen mit `ClipSource` (LTX/Grok fallen raus)
- Ergebnis wird nur genutzt wenn `model.capabilities.i2v === true`

Für text-only Modelle (Sora 2, Grok, LTX) landet gar kein Bild beim Provider → der Charakter erscheint zufällig (50/50).
Zusätzlich: bei mehreren gepickten Charakteren komponieren wir zwar den Frame mit allen Slots (`characterShots` bis 4), aber der Frame wird nicht immer als Startframe/Anchor durchgereicht — z. B. bei Vidu Q2 konkurriert er als ein `referenceImages[]`-Slot mit anderen Referenzen.

Motion Studio funktioniert zuverlässig, weil dort `prepareSceneAnchor` immer den Nano-Banana-2 Multi-Character-Frame komponiert und als `startImageUrl` (bzw. echten Anchor) durchreicht — inkl. Lip-Sync-Pfad. Genau die Frame-Kompo, **ohne** Lip-Sync, wollen wir 1:1 ins AI Video Studio übernehmen.

## Ziel

Wenn im Toolkit **einer oder mehrere** Charaktere gepickt sind, wird immer ein Nano-Banana-2 Multi-Character-Startframe komponiert und garantiert als erste Referenz an das gewählte Modell übergeben — ohne Lip-Sync-Kette.

## Umsetzung

### 1. Anchor-Kompo immer erzwingen wenn Cast vorhanden
`src/components/ai-video/ToolkitGenerator.tsx`:
- `shouldCompose` vereinfachen: Kompo läuft, sobald `anchorChars.length >= 1` und Modell entweder i2v- oder anchor-fähig ist — unabhängig von `referencePlacement`, außer der User hat manuell ein `startImageUrl` hochgeladen.
- Cap bleibt bei 4 Slots (Nano Banana 2 Limit).
- Bei `placement === 'end'` wird der Frame nur als Identity-Referenz (nicht als Startframe) genutzt, damit der Motiv-Endframe nicht doppelt erscheint.

### 2. Routing des komponierten Frames
- **i2v-Modelle** (Kling, Veo, Wan, Hailuo, Luma, Seedance, Runway, Pika, HappyHorse) → `body.startImageUrl = composedFirstFrame`.
- **Anchor-fähig** (Vidu Q2, Kling 3 subject-ref) → composed Frame als **erster** Slot in `referenceImages` mit expliziter Rolle `character-anchor`, damit er nicht von User-Refs verdrängt wird.
- **Text-only** (Sora 2, Grok, LTX) → kein Bild-Pfad möglich; stattdessen:
  - Prompt-Suffix hart ausbauen: volle Appearance + Signature Items für jeden gepickten Charakter + Führungssatz „All listed characters MUST appear on-screen, recognizable as described."
  - Unter dem Cast-Picker Hinweis: „Dieses Modell akzeptiert keine Bild-Referenz — Charaktere werden nur textlich beschrieben." (nur wenn Modell text-only)

### 3. Hard-Guard erweitern
Der bestehende Guard (Z. 421) prüft nur i2v. Auch bei anchor-fähigen Modellen muss ein komponierter Frame **oder** eine Subject-Ref vorhanden sein — sonst Abbruch mit klarer Fehlermeldung statt stiller Namens-Fallback.

### 4. Kein Lip-Sync
Wir triggern im Toolkit **keine** Sync.so-Kette und keine `dialog_shots`-Persistenz. Der Frame ist rein visueller Anchor; Audio bleibt Toolkit-Standard (kein VO, kein Face-Track-Preclip). Damit bleibt die Pipeline schlank und die Kosten stabil.

### 5. Debug-Chip (opt-in)
Bei `?debug=1` unter dem Generate-Button: `anchorComposed`, `referenceRoute` (start/end/anchor/text-only), `characterCount`. Hilft bei künftigen 50/50-Reports.

## Betroffene Dateien
- `src/components/ai-video/ToolkitGenerator.tsx` — Kompo-Bedingungen, Route-Zuweisung, Hard-Guard, Debug-Chip
- `src/components/ai-video/ToolkitCastWorldPicker.tsx` — text-only Warnhinweis
- `buildCastWorldPromptSuffix` — Führungssatz bei mehreren Chars

## Nicht angefasst
Motion Studio, `prepareSceneAnchor` (wird nur wiederverwendet), Sync.so / Lip-Sync-Pipeline, Universal Creator, Picture Studio.
