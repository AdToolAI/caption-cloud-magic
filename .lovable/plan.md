# Seedance 2.5: volle ModelArk-Fähigkeiten freischalten

Du hast recht — beim Provider-Abgleich ist Seedance 2.5 zu kurz gekommen. Die Doku-Prüfung zeigt: unser Modell kann deutlich mehr, als die UI anbietet.

## Provider sagt vs. wir sagen (belegt)

| Punkt | ModelArk-Doku | Unser Code heute |
| --- | --- | --- |
| Referenzbilder | **1–30** | hart auf **7** gekappt (`modelark.ts`, Registry `maxReferences: 7`) |
| Referenz-Assets gesamt | **50** (30 Bilder + 10 Videos + 10 Audios) | nur Bilder |
| Video-Referenz | `reference_video`, 2–30 s je Clip, bis 10 Clips, Summe ≤ 30 s | **gar nicht implementiert**, `v2v` aus |
| Audio-Referenz | `reference_audio`, wav/mp3, bis 10 Clips; auch audio-only | nicht implementiert |
| Natives Audio | `generate_audio: true` unterstützt | Feld wird nie gesendet → Audio immer aus, UI zeigt `audio: false` |
| Dauer | 4–30 s **oder `-1`** (Auto-Dauer; bei Video-Edit erzwungen) | 4–30 s, kein `-1` |
| Ratio | `16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive`; bei Edit/Extension/First-Frame auf `adaptive` gezwungen | generische 3er-Liste (16:9/9:16/1:1), kein `adaptive`, keine Zwangslogik |
| Auflösung | nur 480p/720p | 480p/720p — korrekt |
| Parameter-Übergabe | Body-Felder (`resolution`, `ratio`, `duration`, `watermark`, `generate_audio`) empfohlen; `--rs/--rt/...` ist der Legacy-Weg | nur Legacy-Suffix im Prompt |
| Exklusivität First/Last-Frame vs. Multi-Reference | bestätigt | korrekt abgebildet |

Quellen: docs.byteplus.com/en/docs/ModelArk/1520757, /2298881, /2607688.

## Was umgesetzt wird

1. **Referenzbilder 7 → 30**: Cap in `modelark.ts` und `maxReferences` in der Registry; UI-Text und Uploader ziehen automatisch nach („0–30 Bilder").
2. **Video-Referenzen**: neues Feld `referenceVideoUrls` (max 10, Summe ≤ 30 s, mp4/mov) mit Rolle `reference_video`; Registry bekommt `v2v: true` plus Video-Upload-Block im `ToolkitGenerator` (nur für Seedance 2.5). Client-seitige Vorab-Prüfung von Format und Gesamtdauer, damit der Provider nicht mit 400 antwortet.
3. **Audio-Referenzen**: `referenceAudioUrls` (max 10, wav/mp3) mit Rolle `reference_audio`, eigener Upload-Slot in der Multi-Reference-Sektion.
4. **Natives Audio**: `generate_audio` als Body-Feld, Registry auf `audio: true`, Ton-Schalter erscheint in der UI.
5. **Ratio-Enum korrekt**: `16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive` statt der geteilten 3er-Liste. Bei First-/Last-Frame- und Video-Edit-Tasks setzt die Edge Function `adaptive` selbst und die UI zeigt das Feld dann gesperrt mit Hinweis.
6. **Auto-Dauer**: Option „Automatisch" (`duration: -1`) in der Dauer-Auswahl. Preis wird dabei mit 30 s reserviert und nach Fertigstellung auf die tatsächliche Länge korrigiert — kein Unter-Kosten-Verkauf.
7. **Body-Parameter statt Prompt-Suffix**: `resolution`, `ratio`, `duration`, `watermark`, `generate_audio` gehen als JSON-Felder; die `--`-Direktiven entfallen, damit Fehler als saubere 400-Meldung statt als still ignorierter Text ankommen.
8. **Task-Response absichern**: die Retrieve-Task-Doku gegenprüfen und die Extraktion der Video-URL in `getModelArkTask` daran anpassen.
9. **Matrix + Tests**: Zeile für Seedance 2.5 in `docs/ai-video-capability-matrix.md` mit Quelle; Test, dass Registry-`maxReferences` == Server-Cap und dass jede Registry-Ratio im Provider-Enum liegt.

## Verifikation vor Abschluss

Je ein echter Testlauf auf kürzester Dauer/480p: (a) Text-to-Video mit `generate_audio`, (b) 10 Referenzbilder, (c) 1 Referenzvideo, (d) `duration: -1`. Provider-Antwort wird protokolliert; was der Account-Tarif ablehnt, wird in der UI gesperrt statt angeboten.

## Technische Details

Betroffen: `supabase/functions/_shared/modelark.ts`, `supabase/functions/generate-seedance25-video/index.ts`, `src/config/aiVideoModelRegistry.ts`, `src/components/ai-video/ToolkitGenerator.tsx`, `src/components/ai-video/MultiReferenceUploader.tsx`, `docs/ai-video-capability-matrix.md`, Tests unter `src/config/__tests__/`.

Keine Änderung an Preisen (außer der Auto-Dauer-Abrechnung), Wallet-Logik oder der Lip-Sync-Kette.
