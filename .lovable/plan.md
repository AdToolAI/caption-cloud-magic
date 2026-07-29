## Ziel

Jedes exportierte Video (UCC **und** Director's Cut) bleibt pixelnah zum Upload. Farb-/Kontrastanpassungen greifen ausschließlich, wenn der Kunde im Director's Cut aktiv einen Filter, Mood-Grade oder Effekt hinzufügt.

## Aktueller Stand (verifiziert)

- `src/remotion/templates/UniversalCreatorVideo.tsx` — Baseline bereits entfernt (letzter Turn).
- `src/remotion/templates/DirectorsCutVideo.tsx` Zeile 630 wendet `prependSensorBaseline(baseFilter)` **immer** im Export an, unabhängig davon, ob der Kunde einen Filter/Mood gesetzt hat. Das ist die Quelle für den Rest-Drift.
- `filterString` (Zeile 625) enthält bereits alle vom Kunden bewusst gewählten Grade-/Mood-/Effekt-Filter — die bleiben unangetastet.

## Änderung

**Datei:** `src/remotion/templates/DirectorsCutVideo.tsx`

- Zeile 628–630: `prependSensorBaseline`-Aufruf entfernen. `finalFilter` = `baseFilter` in Preview **und** Export.
- Import `prependSensorBaseline` (Zeile 3) entfernen, wenn danach ungenutzt.

**Datei:** `src/remotion/utils/sensorBaselineGrade.ts`

- Datei bleibt liegen (keine weiteren Referenzen), Kopfkommentar aktualisieren: „Deaktiviert per Kundenentscheidung 29.07.2026 — Rohtreue hat Vorrang. Nur reaktivieren, wenn ausdrücklich gewünscht."

## Nicht angefasst

- User-Filter, Mood-Grade, KenBurns, Grain, Vignette, Overlays, SceneFX, Transitions → bleiben exakt wie vom Kunden im Director's Cut konfiguriert.
- UCC-Renderpfad → schon roh, unverändert.
- Qualitäts-Floor (`jpegQuality 95`, `crf 16`, `OffthreadVideo`) → bleibt.

## Verifikation nach Build

1. DC-Export einer Szene **ohne** aktiven Filter/Mood → frame-genau identisch zum Upload (Screenshot-Vergleich wie beim letzten Roundtrip).
2. DC-Export mit aktivem Mood-Grade → Grade sichtbar wie eingestellt, kein zusätzlicher Baseline-Boost darüber.
3. UCC-Export → unverändert roh.

## Memory-Update

`mem://architecture/render/global-export-quality-floor` und `mem://architecture/video-composer/raw-media-invariant` erweitern: Sensor-Baseline ist projektweit deaktiviert; Raw-Invariant gilt jetzt auch für Director's Cut, außer der Kunde aktiviert explizit Filter/Effekte.
