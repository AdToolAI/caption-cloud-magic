# Schritt 1 — Output-Semantik (v430)

Nur Schritt 1. Schritt 0 (Dialog-Canonicalization) ist abgeschlossen und wird nicht erneut angefasst. Keine Arbeiten an Capabilities, Visual Input, Continuity, State/Legacy oder UI.

## Harte Grenzen (übernommen)

1. `resolveSceneOutput()` bleibt strikt pure: keine DB, kein Supabase-Import, kein Netzwerk, kein Schreiben von `clip_url`. Ein Vertragstest erzwingt das.
2. `materializeCompatibilityOutput()` ist der einzige **neue** Writer von `clip_url`. Es werden keine weiteren direkten `clip_url = …`-Writes eingeführt.
3. Keine Semantik der Lip-Sync-Pipeline ändern. `lip_sync_source_clip_url` wird Legacy-Spiegelspalte, aber Passes, Webhooks, Job-Guards, Assignment und Sync.so-Verhalten bleiben in Schritt 1 unverändert.

## Datenmodell

Migration auf `composer_scenes`:

- `base_video_url text` — die Plate (Provider-Output vor Lip-Sync).
- `processed_video_url text` — das veredelte Ergebnis (Lip-Sync-Mux).
- Backfill: `base_video_url = COALESCE(lip_sync_source_clip_url, clip_url)`, `processed_video_url = clip_url` nur wenn `lip_sync_status = 'applied'`.
- `clip_url` bleibt Kompatibilitätsspalte. Bridge-Trigger, Media-Library-Sync und Exporter (FCPXML/EDL/Bundle) laufen unverändert weiter.

## Lesen: `resolveSceneOutput(scene)`

Neu `src/lib/composer/output/resolveSceneOutput.ts` plus byte-identischer Server-Spiegel `supabase/functions/_shared/resolve-scene-output.ts` (Paritätstest wie bei Schritt 0).

Rückgabe:

```text
{ baseUrl, processedUrl, effectiveUrl, source: 'processed'|'base'|'legacy_clip'|'upload'|'none', isLipsynced }
```

Auflösungsreihenfolge (lesend, tolerant gegen den Alt-Bestand):

```text
processed_video_url
  -> clip_url wenn lip_sync_status = 'applied'
  -> base_video_url
  -> lip_sync_source_clip_url
  -> clip_url
  -> upload_url
```

Ersetzt die duplizierten Ketten in `useTwoShotAutoTrigger.ts:465`, `DebugLipsync.tsx:145-146` und `compose-dialog-segments/index.ts:1008-1009` — rein lesend, gleiches Ergebnis für heutige Daten.

## Schreiben: `materializeCompatibilityOutput()`

Neu `supabase/functions/_shared/materialize-scene-output.ts`. Baut aus `{ baseUrl?, processedUrl? }` das vollständige Update-Objekt (`base_video_url`, `processed_video_url`, `clip_url`) und ist der einzige neue Ort, an dem `clip_url` gesetzt wird.

Eingebaut an genau vier Finalisierungspunkten — bestehende Writes werden ersetzt, nicht ergänzt:

- Plate-Webhook: `compose-clip-webhook/index.ts:217` und `_shared/plate-attempt.ts:214` → `baseUrl`.
- Sync.so-Mux-Abschluss: `sync-so-webhook/index.ts:1129` → `processedUrl`.
- `beginSceneRun()` (`_shared/scene-run-begin.ts:130`) → zusätzlich `base_video_url = null`, `processed_video_url = null` im **selben** UPDATE. Kein Eingriff in Cancel, Lock-Purge, `active_run_id`, `plate_generation + 1`.
- Reset-Pfade: `_shared/scene-hard-reset.ts:605` (Null-Reset) und `reset-lipsync-scene/index.ts:124` (Restore der Plate → `baseUrl`).

Alle anderen heutigen Writer bleiben zunächst unverändert und werden im Bericht als Bestand ausgewiesen (siehe unten).

## Abschlussbericht: `clip_url`-Writer vorher/nachher

Der Bericht listet tabellarisch alle Fundstellen mit Datei:Zeile und Klassifikation, mindestens:

- **Vorher, produktiv setzend:** `compose-clip-webhook:217`, `compose-video-clips:4002,4033`, `_shared/plate-attempt:214`, `generate-composer-image-scene:235`, `generate-talking-head:464`, `sync-so-webhook:1129`, `remotion-webhook:278`, `reset-lipsync-scene:124`, `_shared/autopilotComposerBridge:170`.
- **Vorher, nullend:** `_shared/scene-run-begin:130`, `_shared/scene-hard-reset:605`, `compose-dialog-segments:1029,2859,3016,3259,5529`, `useTwoShotAutoTrigger:128`.
- **Nicht-Pipeline (Snapshots/Drafts/QA):** `useComposerPersistence`, `VideoComposerDashboard`, `sceneSnapshot`, `spawnAdCampaignChildren`, `motion-studio-superuser`, `qa-weekly-deep-sweep`.
- **Nachher:** welche davon durch `materializeCompatibilityOutput()` laufen, welche unverändert blieben und warum.

## Tests

- Purity-Test: `resolveSceneOutput` importiert kein Supabase/`fetch`.
- Paritätstest Client/Server (byte-identisch).
- Resolver-Matrix: Lip-Sync applied, Plate ohne Lip-Sync, nur Legacy `clip_url`, nur Upload, leer.
- Migrations-/Backfill-Test gegen die Backfill-Logik.
- Compatibility-Writer-Test: jeder Finalisierungspunkt schreibt konsistente Tripel.
- Alle bestehenden Suites (inkl. der 118 Lip-Sync-Anker-Tests) plus `tsgo` müssen grün sein.

Danach: Stopp und Bericht. Schritt 2 startet nicht automatisch.
