## Befund (an den beiden letzten Szenen verifiziert)

Szene 1 = `6253b1af…` (2 Sprecher), Szene 2 = `b81659f3…` (1 Sprecher).

**1) Szene 2 hat kein Lip-Sync, weil im Sync.so-Input gar kein Gesicht drin ist.**
Der tatsächlich verschickte 720×720-Pre-Clip zeigt Himmel, Wal und Skyline — das Gesicht liegt komplett ausserhalb. Sync.so findet keinen Mund und gibt das Video unverändert zurück:
- Bild-Differenz Input↔Output Szene 2: PSNR ≈ **52 dB** (praktisch identisch = No-op)
- zum Vergleich Szene 1: PSNR ≈ **39 dB** bzw. **43 dB** (echte Mundanimation)

Ursache ist nicht "1 Sprecher vs. 2 Sprecher" — beide nutzen denselben Pre-Clip-Pfad. Die Crop-Koordinaten stammen aus `audio_plan.twoshot.faceMap` mit `source: "anchor"` (1376×768, **zwei** Gesichter). Für Szene 2 wurde das Plate danach per `framing-retry` als **Single-Close-up** neu gerendert (in `anchor_attempts` protokolliert), die faceMap aber nicht neu bestimmt. Der gespeicherte Crop `x:738, y:120, size:221` zeigt im neuen Framing auf den Hintergrund. Zusätzlich liegt 221 px Quellgröße weit unter dem 480p-Floor von Sync.so, auch hochskaliert auf 720.

**2) Lautstärke- und Mund-Asymmetrie in Szene 1 kommt aus der Audio-Mischung.**
Gemessen im finalen Mix-Track:
- Sprecher 1 Fenster: **−16,1 LUFS**
- Sprecher 2 Fenster: **−38,9 LUFS** → rund **23 dB leiser**

Die an Sync.so geschickten Einzelspuren waren dagegen fast gleich laut (−16,1 / −15,4 LUFS), weil `compose-twoshot-audio` nur die **Einzelspuren** und nur bei Utterances < 2 s peak-normalisiert (`peakNormalizeInPlace`), den **gemischten** Track aber unangetastet lässt. Playback-Lautstärke und Mundamplitude passen dadurch nicht zueinander; zudem ist die Normalisierung reines Peak-Matching statt Loudness-Matching (`normalizeWav` hebt nur an, dämpft nie).

## Leitprinzipien

1. **Plate-Invariante:** Face-Boxen kommen ausschließlich aus dem Frame, der auch wirklich an Sync.so geht. Der Anchor darf Identität zuordnen, aber niemals Geometrie liefern.
2. **Audio-Invariante:** Es gibt genau eine normalisierte Sprecher-Quelle; Mix, Einzelspur und Tight-Slice sind Ableitungen davon.

## Plan

### A — Plate-Invariante durchsetzen (behebt Szene 2)
1. In `compose-dialog-segments` vor dem Pre-Clip-Rendern: Frame aus dem tatsächlichen `clip_url` ziehen und Gesichter dort neu detektieren (bestehender Rekognition-Pfad).
2. `faceMap` bekommt eine Herkunfts-Signatur (Plate-URL-Hash + Frame-Dimensionen). Passt sie nicht zum aktuellen Plate — z. B. nach `framing-retry` —, wird sie verworfen und neu gebaut.
3. Der Anchor bleibt reine Identitäts-Referenz; alle Pixel-Koordinaten stammen aus dem Plate.

### B — Crop-Qualitäts-Floor + Single-Face-Vereinfachung
4. Quell-Crop unter ~360 px Kantenlänge wird nicht mehr auf 720 hochskaliert verschickt — Crop wird erweitert, bis genug echte Pixel drin sind.
5. Genau **ein** Gesicht auf dem Plate → volles Plate statt Mini-Crop. Der Pre-Clip-Pfad bleibt Mehrsprecher-Szenen vorbehalten.
6. Kein valider Input → Pass sauber als fehlgeschlagen markieren, Credits erstatten, kein stiller No-op-Mux.

### C — No-op-Erkennung als Abnahmekriterium
7. Nach jedem Pass Input/Output über die Mund-ROI vergleichen. No-op → ein Retry mit korrigiertem Input, danach Fehler + Refund statt "done".

### D — Audio-Invariante
8. Loudness-Normalisierung **am TTS-Segment**, vor Mix und vor Slicing: Ziel ca. −18 LUFS, True-Peak-Deckel −1 dBFS, bidirektional.
9. Mix-Track, Einzelspuren und Tight-Slices werden aus dieser normalisierten Quelle abgeleitet.
10. `normalizeWav` (Stage F.2) auf bidirektionales LUFS-Matching umstellen; Peak-Sonderfall < 2 s entfällt.
11. Gemessene LUFS pro Sprecher in `audio_plan` protokollieren.

## Risiken für die bestehende Pipeline und Gegenmaßnahmen

| Risiko | Bewertung | Gegenmaßnahme |
| --- | --- | --- |
| Zusätzliche Plate-Detektion kostet Zeit/Geld pro Szene | 1 Frame-Extraktion + 1 Rekognition-Call, ca. 1–2 s und Cent-Bereich — gegenüber ~20 min Renderzeit vernachlässigbar | Ergebnis wird unter der Plate-Signatur gecacht; unveränderte Plates lösen keinen zweiten Call aus |
| Mehrsprecher-Szenen, die heute funktionieren, könnten durch neue Boxen kippen | Reales Regressionsrisiko, da Slot-Zuordnung betroffen | Identitäts-Zuordnung (Hungarian/Rekognition, v133/v242) bleibt unverändert — nur die Geometrie-Quelle wechselt. Vor Rollout Gegenprobe an den zuletzt erfolgreichen 2-Sprecher-Szenen |
| Bestehende Projekte klingen nach dem Loudness-Umbau anders | Betrifft nur neu gemischte Szenen | Normalisierung greift beim Neu-Mischen; bereits exportierte Videos bleiben unangetastet, es wird nichts rückwirkend neu gerendert |
| Zu scharfer No-op-Schwellwert verwirft gute Passes und löst unnötige Retries/Refunds aus | Wichtigster Fehlalarm-Kandidat | Schwelle konservativ auf Basis der Messwerte (No-op ≈ 52 dB, gut ≈ 39–43 dB) mit großem Abstand; maximal ein Retry; im Zweifel wird der Pass akzeptiert statt verworfen |
| Volles Plate statt Crop bei Einzelsprecher = größerer Sync.so-Input | Etwas höhere Verarbeitungszeit pro Pass | Betrifft nur 1-Sprecher-Szenen, die heute ohnehin fehlschlagen; Auflösung bleibt im empfohlenen Bereich |
| Autopilot/Composer-Bridge nutzt denselben Pfad | Änderungen wirken automatisch dort mit | Kein separater Code-Pfad nötig; Autopilot profitiert von denselben Gates, Watchdog- und Refund-Logik bleibt unverändert |
| Lambda-Bundle out of sync | Nur relevant, wenn Crop-Props sich ändern | `DialogTurnFaceCropVideo` bleibt möglichst unverändert; andernfalls wird `scripts/deploy-remotion-bundle.sh` im selben Schritt ausgeführt |

Nicht angefasst werden: Sync.so-Modellwahl, `sync_mode`, Tight-Audio-Architektur (v39), Stitcher, Credit-/Refund-Regeln, Terminal-Failure-Gate (v317) und die Cast-Identity-Auflösung (v318–v320).

## Verifikation
- Szene 2 zurücksetzen und neu rendern → Input-Frame zeigt ein Gesicht, PSNR Input↔Output deutlich unter 50 dB.
- Szene 1 neu mischen → LUFS-Differenz zwischen den Sprecherfenstern unter ~2 LU.
- Gegenprobe: eine zuvor funktionierende 2-Sprecher-Szene erneut rendern, Ergebnis muss unverändert gut bleiben.

## Technische Details
- Betroffene Dateien: `supabase/functions/compose-dialog-segments/index.ts`, `supabase/functions/_shared/pass-face-preclip.ts`, `supabase/functions/_shared/twoshot-face-map.ts`, `supabase/functions/compose-twoshot-audio/index.ts`, `supabase/functions/_shared/syncso-preflight.ts`, `supabase/functions/sync-so-webhook/index.ts`.
- Keine DB-Migration; neue Felder landen in bestehenden JSONB-Spalten (`dialog_shots`, `audio_plan`).
