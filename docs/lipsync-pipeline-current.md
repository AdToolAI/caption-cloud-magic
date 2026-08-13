# Lip-Sync-Pipeline — aktueller Stand (v428)

Diese Datei beschreibt, was der Code **heute** tut. Der Original-Guide vom
03.08.2026 bleibt als Archiv unangetastet; seine Abweichungen stehen in
`docs/lipsync-pipeline-v400-errata.md`. Die eingefrorene Basislinie ist in
`docs/lipsync-baseline-v283.md` dokumentiert.

## 1. Unveränderte Kette

Die Verarbeitungskette (Preclip → Plate → Sync → Maske → Mux) steht seit dem
Freeze-Commit `cae9730f8` (03.08.2026, 23:06 UTC) still. Alle Änderungen seither
liegen **vor** der Kette: Auswahl des Providers, Auswahl des Eingangsbildes,
Buchhaltung des Laufs. Kein Unfreeze ohne ausdrückliche Freigabe.

## 2. Provider-Vertrag (v425)

Zertifiziert für Lip-Sync sind ausschließlich:

- **HappyHorse** (3–15 s)
- **Hailuo** (6 s / 10 s)

Zentrale Liste: `src/lib/composer/lipsyncMasterProvider.ts`, Backend-Spiegel in
`supabase/functions/_shared/composer-ai-sources.ts`. Kein stiller Fallback: Ein
Vertragsbruch bricht die Szene mit klarer Meldung ab.

## 3. Anker-Kohärenz (v400 + v428)

Die Ursache des Ausfalls vom Juli 2026: Die Gesichtsgeometrie wurde auf einem
Bild gemessen, die Plate aber aus einem anderen erzeugt. Deshalb gilt:

> **Der Plate-Input einer Lip-Sync-Szene ist immer `reference_image_url`.**

Drei unabhängige Schichten setzen das durch:

```text
Schicht 1  slotArbitration.ts / visual-inputs.ts (Regel 0)
           lipSync === true  →  transition = match-cut, inputMode = first-frame
           kein Flag schaltet diese Regel ab.

Schicht 2  resolveVisualInputs.ts
           useContinuityFrame = false, firstFrameUrl = anchorImageUrl
           auch wenn Schicht 1 je umgangen würde.

Schicht 3  compose-video-clips/index.ts
           Continuity-Backfill wird für Lip-Sync-Szenen übersprungen,
           es wird gar kein Vorgänger-Frame extrahiert.
```

**Fail-closed:** Hat ein Provider keinen Bild-Eingang, der den Anker unverändert
übernimmt, wird die Szene mit `lipsync_anchor_input_unsupported` abgebrochen —
sie weicht nicht auf einen losen Referenz-Slot aus.

## 4. Verhältnis zur Kontinuitätskette (v426)

Die Kette `composer_continuity_queue` verbindet Szenen nahtlos, indem der
Nachfolger auf den Clip des Vorgängers wartet. Für Lip-Sync-Szenen ist dieser
Mechanismus vollständig ausgeschaltet — solche Szenen sind immer Match-Cuts. Ein
gemischtes Projekt funktioniert weiterhin: Nicht-Lip-Sync-Szenen chainen normal,
Lip-Sync-Szenen setzen die Kette an ihrer Position aus.

## 5. Absicherung

- `src/lib/composer/__tests__/lipsyncAnchorCoherence.test.ts` — semantische
  Vertragstests über **alle** Provider-Profile und alle Einstiegspunkte, mit
  Differenztest gegen `lock_reference_url`. Keine Datei-Hashes: Der Test prüft
  Verhalten, nicht Formatierung.
- `src/lib/composer/__tests__/lipsyncFrozenContract.test.ts` — Struktur der
  eingefrorenen Kette.
- `src/lib/composer/__tests__/visualInputsParity.test.ts` — Frontend-Resolver und
  Backend-Spiegel entscheiden identisch.

## 6. Warnungs-Codes

| Code | Bedeutung |
| --- | --- |
| `lipsync_continuity_disabled` | Regel 0 hat gegriffen (Normalfall, keine Störung). |
| `lipsync_anchor_input_unsupported` | Provider ohne anker-treuen Bildeingang → Szene bricht ab. |
| `anchor_takes_exclusive_slot` | Exklusiv-Slot-Provider, Anker schlägt Referenzen (nicht Lip-Sync). |
