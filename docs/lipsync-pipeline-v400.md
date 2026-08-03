# Lip-Sync Pipeline — Spezifikation v400

Stand: 2026-08-03. Gefroren, siehe `.lovable/LIPSYNC-FEATURE-FREEZE.md`.

Diese Datei beschreibt den Sollzustand vollständig. Wer die Pipeline von Grund
auf neu bauen müsste, kann das allein hiermit tun.

---

## 0. Die vier Verträge

| Vertrag | Regel | Konsequenz bei Verletzung |
|---|---|---|
| Run-Identität | Jede Szene trägt `active_run_id` (UUID) und `plate_generation` (Counter). Jedes Artefakt gehört zu genau einem Lauf. | Späte Ergebnisse alter Läufe überschreiben den neuen Clip. |
| Anchor-Kohärenz | Geometrie wird immer auf `reference_image_url` gemessen. | Gesichter werden um ~130 px daneben gemessen — kein Lip-Sync trifft. |
| Assignment-Lock | Sprecher → Gesichts-Slot einmal deterministisch, row-major. | Sprecher 1 spricht mit dem Gesicht von Sprecher 2. |
| Outcome-Gate | Ein Pass gilt nur als erfolgreich, wenn der Output messbar vom Input abweicht. | Stille Passthroughs werden als "fertig" ausgeliefert. |

---

## 1. T1 — Trigger

`ClipsTab.tsx` → Edge Function `compose-video-clips`.

Frontend-Pflicht beim Start:
- lokalen `clipUrl` und `posterUrl` sofort leeren (optimistisch),
- `isWorking = true`; `SceneInlinePlayer` zeigt dann weder altes Video noch
  altes Standbild noch "Re-Render empfohlen".

## 2. T2 — Run-Start (`_shared/scene-run-begin.ts`)

`beginSceneRun(sceneId)` ist die einzige Definition von "neuer Lauf":

1. laufende Sync.so-Pässe kündigen (via `reset-lipsync-scene`: Provider-Abbruch,
   Slot-Freigabe, idempotenter Credit-Refund) — nur wenn aktive Pässe existieren,
2. `dialog_shots`, Lip-Sync-Status und Dispatch-Sperren (`dialog_dispatch_locks`)
   leeren,
3. sichtbares Ergebnis des Vorlaufs leeren (`clip_url`, Standbild),
4. `active_run_id = gen_random_uuid()`, `plate_generation += 1`,
   `clip_status = 'generating'`.

Aktive Pass-Zustände: `queued`, `rendering`, `retrying`, `pending`,
`dispatched`, `processing`.

## 3. T3 — Anchor-Auflösung

- Quelle: `brand_characters` (Cast & World). Nur dort registrierte Charaktere.
- Genau ein Bild: `reference_image_url`.
- Dieses Bild ist gleichzeitig Input der Plate-Generierung **und** Messgrundlage
  der Gesichtsgeometrie. Ändert es sich, wird jedes gespeicherte Face-Layout
  verworfen.

## 4. T4 — Plate-Generierung

- Provider: HappyHorse / Kling / Seedance / Hailuo / Sora (Image-to-Video).
- Prompt deterministisch über `_shared/cast-clause.ts` — feste Klausel-Reihenfolge,
  keine Zufallsvariation, axis-aware Dedup.
- Mindestens 1080p. Darunter ist das Gesicht im Preclip zu klein.
- Fehler (Contentfilter, `InvalidParameter`, Timeout) → Szene `failed` mit
  idempotentem Refund über `_shared/lipsync-fail.ts`.

## 5. T5 — Face-Layout messen

- AWS Rekognition `DetectFaces` auf dem **Anchor**, nicht auf einem Video-Frame.
- Normalisierte BBoxes werden in Pixelraum der Plate umgerechnet.
- Unplausible Boxen (zu klein, extrem länglich, ausserhalb) werden verworfen.
- Bei null Gesichtern: Mehr-Frame-Konsens, erst danach Abbruch.

## 6. T6 — Assignment-Lock (`_shared/plateFaceSlotRouter.ts`)

1. Gesichter row-major sortieren (oben nach unten, dann links nach rechts).
2. Sprecher aus `dialog_turns` (JSONB, UUID = Source of Truth) in derselben
   Reihenfolge zuordnen.
3. Ergebnis persistieren. Kein Fuzzy-Name-Matching, kein Auto-Detect.
4. Identitätskollisionen (zwei Slots, dieselbe Person) werden kanonisiert.

## 7. T7 — Voiceover

- ElevenLabs, DE-Hard-Lock. Sprache wird erzwungen, nie vom Provider erraten.
- Pro Dialog-Turn eine WAV; nicht sprechende Slots erhalten `silence_track.wav`.
- Audio ist an `active_run_id` gebunden. Wiederverwendung über Laufgrenzen hinweg
  ist verboten.

## 8. T8 — Preclip pro Turn (kritischster Schritt)

Remotion Lambda rendert `DialogTurnFaceCropVideo`:

- quadratischer Ausschnitt um **genau ein** Gesicht,
- Ankerpunkt ist der Mund-Landmark, Fallback ist das BBox-Zentrum
  (`compute-mouth-centered-crop.ts`),
- Zielwerte: `targetFaceShare = 0.42`, `minSize = 128 px`, `outputSize = 720 px`,
  native Ausgabe geklemmt auf 720–1280 px,
- Kamerapfad geglättet (`camera-path.ts`), folgt Kopfbewegung ohne Ruckeln.

Grund: Sync.so behandelt Koordinaten-Hints nur als Empfehlung und greift sonst
das linkeste Gesicht. Deshalb muss physisch nur ein Gesicht im Frame sein.

## 9. T9 — Face-Gate (`_shared/syncso-face-gate.ts`)

Prüft vor dem Provider-Call, ob der Preclip brauchbar ist: Gesichtsanteil,
Mindestgrösse, Mundabstand zum Rand, Bewegung im Crop. Nicht bestanden bedeutet
Abbruch mit sprechendem Code — nie ein stiller Retry.

## 10. T10 — Dispatch

- Ein Sync.so-Job pro Sprecher, `model = sync-3`, `sync_mode = cut_off`,
  `active_speaker_detection` mit expliziten Bounding-Boxes, `auto_detect = false`.
- Parallelität: max. 4 Pässe.
- Job-ID wird mit Lauf-Zugehörigkeit in `dialog_shots.passes[]` abgelegt.

## 11. T11 — Webhook + Run-Guard (`sync-so-webhook`)

1. Job-ID nachschlagen.
2. Gehört der Job noch zum aktuellen Lauf? Wenn nein: `run_guard_discarded`,
   Ergebnis wird verworfen. Das ist **kein Fehler**, sondern korrektes Verhalten.
3. Nur passende Jobs schreiben ihr Ergebnis.

## 12. T12 — Passthrough-Erkennung

Frames aus Input und Output werden über AWS Remotion Lambda Stills extrahiert
(Replicate ist im Lip-Sync-Pfad verboten), Mundregion-Delta über mehrere Frames
im Konsens gemessen.

- `moving` → weiter,
- `static` → Szene `failed` ("Provider hat Video unverändert zurückgegeben"),
- `unknown` → blockiert das Muxing, wird nie durchgewinkt.

## 13. T13 — Reprojektion (`DialogStitchVideo.tsx`)

Der lipsyncte Crop wird an der Original-Position (x, y, size) auf die Plate
zurückgelegt. Maske: `radial-gradient(circle at center, #000 0%, #000 30%,
rgba(0,0,0,0) 78%)`. Harte Scheiben legen die Naht auf Haut und erzeugen eine
sichtbare Kontur; der weiche Verlauf blendet sie unsichtbar aus. Die
gesichtsproportionale Overlay-Variante nutzt Faktor 2.2 (aussen) und 0.6 (Kern).

## 14. T14 — Mux (`compose-dialog-segments`)

- Video-Spur mit variablen Szenendauern, Audio linear (Original, VO, Musik).
- `OffthreadVideo` für lange Muxes.
- `rawMediaMode: true` — kein Grading, keine Filter, pixelidentisch zum Upload.
- Lambda: max. 5 Worker, `framesPerLambda = 270`.

## 15. T15/T16 — Abschluss

`clip_url` setzen und `pipeline_state = 'complete'` über die atomare
DB-Funktion `composer_scene_transition()`. Guard-Trigger verhindern illegale
Übergänge, insbesondere `failed → lipsync_running`.

## 16. Watchdog (`lipsync-watchdog`, alle 2 Minuten)

| Konstante | Wert | Bedeutung |
|---|---|---|
| `STALE_PREFLIGHT_MS` | 4 min | läuft, aber nie ein Provider-Job entstanden |
| `STALE_PROVIDER_MS` | 10 min | Job in flight ohne Update |
| `STALE_AUDIO_MUX_MS` | 6 min | Audio fertig, Mux nie gestartet |
| `STALE_HARD_MS` | 25 min | absolutes Limit, danach fail + Refund |
| `STALE_DISPATCH_RECOVERY_MS` | 30 s | Dispatch-Lock-Wiederherstellung |
| `RECOVERY_COOLDOWN_MS` | 90 s | Abstand zwischen zwei Recovery-Versuchen |

Zusätzlich werden verwaiste Inflight-Slots freigegeben.

---

## 17. Fehlercode-Referenz

| Code | Bedeutung | Typische Ursache |
|---|---|---|
| `v204_preclip_required` | Preclip fehlt | Lambda-Render fehlgeschlagen |
| `preclip_face_share_too_low` | Gesicht zu klein im Crop | Crop zu weit, Plate zu niedrig aufgelöst |
| `face_gate_mouth_at_edge` | Mund angeschnitten | Kamerapfad zu spät korrigiert |
| `face_gate_no_face` | kein Gesicht erkannt | Anchor/Plate-Mismatch |
| `provider_passthrough` | Output gleich Input | Sync.so hat kein Gesicht gefunden |
| `run_guard_discarded` | altes Ergebnis verworfen | kein Fehler, korrektes Verhalten |
| `bbox_geometry_insane` | Boxen unplausibel | Rekognition-Skalierung falsch |

## 18. Nachbau-Checkliste

1. `composer_scenes` mit `active_run_id`, `plate_generation`, `dialog_shots`,
   `dialog_turns`, `pipeline_state` (Enum `composer_scene_state`).
2. Atomare Transition-Funktion plus Guard-Trigger in der Datenbank.
3. `beginSceneRun()` als einziger Einstiegspunkt jedes Laufs.
4. Geometrie ausschliesslich auf `reference_image_url`.
5. Ein-Gesicht-Preclip pro Sprecher, mundzentriert, face share 0.42.
6. Face-Gate vor dem Provider-Call, fail-closed.
7. Run-Guard im Webhook.
8. Passthrough-Check mit Frame-Konsens; `unknown` blockiert.
9. Weiche 30/78-Maske bei der Reprojektion.
10. Watchdog mit idempotentem Refund.
