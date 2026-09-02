# Lip-Sync Änderung 1: Full-Shot + explizite Sprecher-Box (statt Selbst-Crop)

## Zur pasted Anleitung

Der Text ist generische REST-Standardberatung und in zwei Punkten für Sync.so falsch bzw. bereits erledigt:

- **Auth**: Sync.so v2 nutzt den Header `x-api-key`, nicht `Authorization: Bearer`. Unsere Integration macht das bereits korrekt (`https://api.sync.so/v2`, `x-api-key`). Hier ist nichts zu ändern — ein Umbau auf Bearer würde die Pipeline brechen.
- **Webhooks**: Bereits vorhanden und funktionsfähig (`sync-so-webhook`); die Callbacks der letzten Läufe kamen sauber an und wurden gebunden.

Richtig und relevant ist nur der inhaltliche Kern, der auch aus der offiziellen Multi-Speaker-Anleitung kommt: **sync-3 verarbeitet den ganzen Shot und wählt den Sprecher über Koordinaten aus.** Genau das ist der Punkt, an dem unsere Pipeline abweicht.

## Befund aus Gate 0 (bereits gemessen, kein Rateschluss)

Szene `7aa7fc93…`, Gen 7, alle 4 Pässe `noop`:

- Modell `sync-3`, ASD über `bounding_boxes_url`, Crop-Share 0.29 — alles vertragskonform.
- Aber: Face-Track `sample_count = 0` in allen Pässen, Mundposition `selected_source: "pose_estimate"` (geschätzt, nicht gemessen).
- Ergebnis: Mund im Output bei `mouth_over_frame 1.18–1.81`, Gesichtsunterkante bei ~1.05 — der Mund liegt am/unter dem Bildrand.
- Ursache: Wir schneiden aus der Plate einen 720×720-Preclip, geplant aus **einer** Snapshot-Box. Bewegen sich die Figuren, wandert der Mund aus diesem Fenster. Sync.so bekommt einen Clip ohne verwertbaren Mund → noop.
- Der dokumentierte Full-Plate-Pfad existiert bereits im Code, ist aber hart abgeschaltet (`v153UnifiedBboxEligible = false`, v201).

## Änderung 1 (von maximal 4)

**Ziel**: sync-3 den ganzen Shot geben und den Sprecher nur noch per Box auswählen — statt ihm das Bild vorzuschneiden.

Umfang:
1. Full-Plate-Dispatch in `compose-dialog-segments/index.ts` hinter einem Flag wieder aktivieren: Video = volle Plate (bzw. voller Zeitausschnitt der Plate für den Turn), `bounding_boxes_url` = plate-native Box des zugewiesenen Sprechers, `auto_detect` bleibt aus.
2. Identitäts-Zuweisung unverändert: die Box kommt weiterhin aus dem bestehenden V524/V530-Lock. Kein Auto-Detect, keine Positions-Heuristik.
3. Preclip bleibt als Fallback bestehen: schlägt der Full-Plate-Dispatch provider-seitig fehl, greift der heutige Pfad unverändert.
4. Die auf den Selbst-Crop bezogenen Vor-Provider-Gates (`v536_mouth_crop_infeasible`, `no_coherent_track_samples`, dynamische Crop-Feasibility) gelten im Full-Plate-Pfad nicht mehr, weil es dort keinen eigenen Crop gibt, den sie prüfen könnten. Sie bleiben für den Preclip-Fallback aktiv.
5. Telemetrie: pro Pass festhalten, welcher Pfad dispatcht wurde, plus die bestehende Motion-/noop-Messung.

Ausdrücklich **nicht** Teil dieser Änderung: Provider-Wechsel, Preise, Refund-Logik, FA-4, V537, Retry-Zähler, Watchdog-Timings, Schema/Migrationen, Frontend.

## Verifikation

- Fokus-Tests für den Dispatch-Pfad, `deno check` auf den geänderten Funktionen.
- Deploy ausschließlich `compose-dialog-segments`.
- Danach je **ein** kontrollierter Lauf mit 2, 3 und 4 Sprechern; Bewertung rein visuell plus gemessener Motion-Verdikt. Kein „Mux erfolgreich = bestanden".

## Abbruchkriterium

Bringen die vier geplanten Änderungen keinen visuell bestätigten Lip-Sync in allen drei Kohorten, wird Lip-Sync per Feature-Flag stillgelegt und der Composer ohne Lip-Sync ausgeliefert.
