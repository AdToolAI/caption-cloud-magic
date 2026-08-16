# FA-3 — Setup + Pre-Start-Snapshot (kein Render)

Ziel: Im bestehenden Resmoke-Projekt `035273d7-…` eine **frische, ledger-freie** Szene über den normalen UI-Pfad so konfigurieren, dass sie deterministisch den Pfad Plate → `sync_segment` → `audio_mux` → Stitch nimmt. Danach read-only Snapshot und STOP.

Unangetastet: S05 und alle früheren Evidence-Szenen (`b34d1eae…`, `be06d0fd…`, `3d91edf4…`, `22cc0e10…`, `8155c6d8…`). Kein Render, kein Dispatch, keine direkten DB-Writes.

## Schritt 1 — Neue Szene über die UI anlegen

Per Playwright als Projekt-Owner in den Video Composer, Projekt `035273d7-…` öffnen und eine **neue** Szene (S06) über den normalen „Szene hinzufügen"-Pfad anlegen. Keine Duplizierung einer bestehenden Szene.

## Schritt 2 — Szene über die UI konfigurieren

Ausschließlich über die normale Oberfläche:

- genau **ein** Sprecher (Cast-Anzahl = 1), non-tight, keine Close-up-Sonderkonfiguration
- **ein** kurzer effektiver Dialog-Turn, klar innerhalb des Plate-Budgets (Ziel 4–6 s Sprechzeit, sicher unter der `dialog_too_long_for_plate`-Schwelle); „kanonisch" wird ggf. erst im Lauf durch `compose-twoshot-audio` persistiert
- Voice-ID über den normalen Voice-Picker setzen und persistieren
- intentionaler Lip-Sync über den Master-Toggle „Dialog & Lip-Sync" (nicht über Draft-Manipulation); Tri-State muss vor dem Klick resolved sein
- Provider/Engine strikt nach der frozen Capability Matrix: nur ein dort für genau diese Konfiguration zertifizierter Lip-Sync-Master, Engine `cinematic-sync`
- Speichern über den regulären Speichern-Button

Falls das Speichern selbst TTS/Plate/Dispatch auslöst: nichts weiter anfassen, Vorgang exakt dokumentieren (Zeitstempel, Function, Ledger-Zeilen) und STOP.

## Schritt 3 — Read-only Pre-Start-Snapshot

Nur `read_query`. Zu belegen:

- `isLipSyncIntentional()` / `isLipSyncIntentionalRow()` = **true** (Werte `lip_sync_with_voiceover`, `dialog_mode`, `engine_override` mitliefern)
- `active_run_id = NULL`, `pipeline_state = idle`, `lip_sync_status` ohne Alt-Wert
- `composer_pipeline_jobs` für die Szene = **0**; insbesondere `sync_segment` = 0 und `audio_mux` = 0
- keine alten Pass-/`pipeline_job_id`-Pointer auf der Szene
- kein RS3-Marker (`audio_plan.twoshot.rs3_reset`, `rs3_reset_id`)
- keine Output-Historie: `base_video_url`, `processed_video_url`, `clip_url`, Stitch-Pointer alle leer
- Dialog-Zustand nach v430-Vertrag:
  - `resolveEffectiveDialog(scene)` → **genau 1 effektiver Turn**
  - Sprecher eindeutig der gewählte Cast, `speaker_idx = 0`, Cast-Anzahl = 1
  - Voice-ID persistiert
  - `dialog_turns` darf diesen einen Turn bereits enthalten **oder** vertragsgemäß noch `[]` sein; `[]` wird ausdrücklich als erwarteter Pre-Run-Zustand dokumentiert, nicht als Finding (kanonische Turns werden erst im Lauf durch `compose-twoshot-audio` geprägt)

## Schritt 4 — Routing-Nachweis (statisch, gegen den echten Code)

Anhand der persistierten Werte gegen die tatsächliche Routing-/Preflight-Logik belegen, nicht gegen UI-Labels. Zu belegende Kette:

```text
intentional Lip-Sync → Plate → compose-twoshot-audio → kanonische Dialog-Prägung
  → compose-dialog-segments → sync_segment → audio_mux → Stitch
```

- `lipSyncIntent.ts` (Front + Backend-Spiegel) → intentional
- `sceneEngineRouter.ts` / `validateSceneForCinematicSync.ts` → Cinematic-Sync
- `compose-video-clips/index.ts` → tatsächlicher produktiver Branch; ob Plate direkt an `compose-dialog-segments` übergibt oder weiterhin über `compose-twoshot-audio` läuft, wird am Code abgelesen und so dokumentiert, wie er ist
- `compose-twoshot-audio` → Prägung der kanonischen Turns aus dem effektiven Dialog
- `compose-dialog-segments` Preflight (Dialog vorhanden, Voice vorhanden, Segmentanzahl, Plate-Budget) → pass
- `resolveEffectiveDialog.ts` → 1 Turn, Länge unter der Plate-Schwelle
- Provider-Wahl gegen die **frozen Capability Matrix** (`providerMatrix.ts` + `lipsyncMasterProvider.ts`, v425): HappyHorse/Hailuo nur dann, wenn die Matrix den Provider für genau diese Konfiguration als Lip-Sync-Master zertifiziert

Explizit ausgeschlossen, je mit Codestelle: Talking-Head-Pfad (`generate-talking-head`), Tight-/Direct-Finalize-Pfad, Guard-Abbruch wegen fehlendem Dialog/Voice, Provider-Pfad der `sync_segment` umgeht.


## Schritt 5 — UI/DB-Konsistenz nach Reload

Seite neu laden, Tri-State auflösen lassen, prüfen dass der Master-Toggle den DB-Wert (ON) zeigt und keine Draft-/Marker-Reste existieren.

## Abschluss

Nur wenn Snapshot und Routing-Nachweis vollständig grün sind: Meldung **FA-3 SETUP READY** mit finalem Snapshot, danach **STOP**. Der kostenpflichtige Renderstart ist ein separater Schritt nach explizitem GO.

## Technische Hinweise

- Alle Schreibvorgänge ausschließlich über Playwright-UI (`/tmp/browser/fa3-setup/`), Session-Restore über die bestehende Auth-Session.
- Alle DB-Zugriffe read-only.
- Keine Migration, kein Redeploy, keine Codeänderung in diesem Schritt. Frozen-Verträge (Lip-Sync-Kette, RS3, G3.2.2/F1) bleiben unberührt.
- Auftretende Findings werden nur auf der Ebene behandelt, auf der sie auftreten (z. B. reine Präsentationsfehler), und führen sonst zu STOP.
