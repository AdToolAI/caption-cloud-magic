# Lip-Sync-Pipeline — Errata zum v400-Guide (03.08.2026, 23:31)

Der Original-Guide (`LipsyncPipelineGralupdated`, ODT/PDF) bleibt unverändert als
Archiv. Diese Errata korrigiert punktuell die Stellen, an denen der Guide-Text
den Code beschreibt, wie er einmal war — und nicht, wie er beim Freeze-Commit
`cae9730f8` (03.08.2026, 23:06 UTC) tatsächlich lief. Der Freeze-Stand ist die
Wahrheit; der Guide-Text wurde 25 Minuten später aus dem Gedächtnis
niedergeschrieben.

## Kurzfassung

Die **Kette selbst** ist seit dem Freeze unverändert. Es gibt keinen Drift im
Code. Was driftet, ist die Beschreibung.

## Korrekturen

| Guide sagt | Tatsächlich im Freeze-Stand |
| --- | --- |
| `mouth-motion-verdict.ts` bewertet jeden Take | Datei existiert seit dem Rollback vom 27.07.2026 nicht mehr. Bewegungs-Telemetrie läuft, aber ohne Verdict-Gate. |
| Mundhöhe wird auf 0.62 der Crop-Höhe normiert | Kein fester Faktor. `computeMouthCenteredCrop.ts` zentriert auf den Mundpunkt mit gesichtsproportionaler Marge. |
| Face-Share-Floor 0.24 als harte Schranke | Nur bei Mehrsprecher-Preclips (v331). Einzelsprecher-Szenen laufen ohne Floor. |
| Pixel-Face-Contract / Face-Size-Contract (v354/v355) | Durch den Rollback vom 27.07. entfernt. Historisch, nicht aktiv. |
| Provider-Fallback bei Lip-Sync-Fehlern | Seit v425 verboten. Kein stiller Fallback, die Szene bricht ab. |
| Seedance 2.5 als Plate-Provider (v418) | Seit v425 nicht mehr zertifiziert. Nur HappyHorse und Hailuo. |

## Was der Guide korrekt beschreibt

- Geometrie-Anker ist **immer** `reference_image_url` (v400) — das ist der Kern
  und gilt unverändert.
- `dialog_turns` (JSONB) ist die UUID-Quelle der Wahrheit (v201).
- Per-Speaker-Preclips als primärer Input (v199).
- Harte CSS-Masken statt Alpha-Blend (v198).
- Silence-Track zur Stabilisierung der Zuhörer (v194).

## Verbindliche Ergänzung seit v428

Kontinuität (v426) ist für Lip-Sync-Szenen **hart deaktiviert**. Eine Szene mit
Lip-Sync-Absicht bekommt niemals einen Vorgänger-Frame oder eine Clip-Referenz
als Eingang — der Plate-Input ist ausnahmslos der Anker. Siehe
`docs/lipsync-pipeline-current.md`.
