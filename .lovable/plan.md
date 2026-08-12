# Härtungsplan v427 (überarbeitet nach Review)

Die vier Korrekturen sind berechtigt und werden vollständig übernommen. Zwei davon waren echte Implementierungsblocker: die verlorene angeforderte Dauer und die einzelne `provider_job_id`. Der Plan unten ist die freigabefähige Fassung.

## Verifizierte Befunde (unverändert)

| Punkt | Befund im Code |
|---|---|
| Dauer zu spät berechnet | Guthabenprüfung in `compose-video-clips` (377–410) rechnet mit `scene.durationSeconds`; Auto-Extend erst ab 2046. |
| `ready` vor Lip-Sync | `compose-clip-webhook` (197) setzt `clip_status: 'ready'` zusammen mit `lip_sync_status: 'pending'`. |
| Kein Escrow | `credit_reservations` + `credit-reserve/commit/refund` existieren, Composer-Pfad nutzt sie nicht. |
| TTL kürzer als Providerlauf | `PARK_TTL_MINUTES = 15` gegen `TASK_TIMEOUT_MS = 25 min` (modelark-poll). |
| Alte Webhooks | `sync-so-webhook` und `render-sync-segments-audio-mux` prüfen `active_run_id` nicht; Job-ID-Prüfung fehlt überall. |
| Storyboard nur im State | `onScenesGenerated` (BriefingTab 453) persistiert nicht. |

## Übernommene Korrekturen

### 1. Dauervertrag: angeforderte Dauer bleibt Untergrenze

Maßgeblich ist:

```text
raw_required_duration_ms =
  max(requested_duration_ms, measured_audio_end_ms + tail_padding_ms)
→ Aufrunden auf nächstes zulässiges Providerfenster
→ effective_duration_ms / effective_duration_frames
→ billable_duration_seconds → Preis
```

Voiceover verlängert, verkürzt nie. Intern wird in ganzzahligen Millisekunden bzw. Frames gerechnet; `effective_duration_seconds` ist nur abgeleiteter Anzeige- und Providerwert.

**Feste Reihenfolge vor jedem kostenpflichtigen Dispatch:** Auth/Ownership → Dialog kanonisieren → Provider-/Engine-Zulässigkeit (dauerunabhängig) → Audio-Plan/TTS → `raw_required_duration_ms` → Providerfenster → Dauervertrag validieren → Preis → Transaktion (Run + Reservierung) → Dispatch.

**Das gemessene Audio ist das später verwendete Audio.** TTS wird vor dem Videojob erzeugt und als Teil des Run-Vertrags eingefroren: `audio_plan_id`, `audio_asset_id`, `audio_asset_hash`, `measured_audio_duration_ms`, `dialog_content_hash`, `voice_configuration_hash`. Die Sync-Unterpipeline lädt exakt dieses Asset und synthetisiert nicht neu. Das ist die einzige echte Änderung der Ausführungsreihenfolge in v427. TTS-Kosten laufen in derselben Reservierung mit, als eigene idempotente Position `charge_type = 'tts'`.

**Weitere Snapshot-Felder:** `requested_duration_ms`, `required_duration_ms`, `effective_duration_ms`, `effective_duration_frames`, `billable_duration_seconds`, `duration_run_id`, `quoted_cost_euros`, `duration_policy_version`, `run_contract_version = 427`. Jeder Leser/Writer prüft `duration_run_id = active_run_id`.

**Immer aufrunden, nie klemmen.** Hailuo 6,01 s → 10 s; 10,01 s → Abbruch vor Dispatch, ohne Belastung, mit klarer Meldung. Auto-Extend (2046) wird zur reinen Kontrollschranke: keine Dauer-, Preis- oder Provideränderung; Abweichung = `duration_contract_drift`.

**Kein stiller Providerwechsel bei Dialog-/Lip-Sync-Szenen.** Die bestehende Dauerumleitung nicht-dialogischer Szenen auf Seedance 2.5 (>15 s) bleibt unverändert bestehen — sie ist Produktverhalten, keine Härtungslücke.

### 2. Provider-Capabilities und Lip-Sync-Zertifizierung getrennt

Zwei Verträge statt einer Datei:

- `ProviderCapabilities`: `durationPolicy`, `supportedQualities`, `supportedInputs`, `supportsAudio`, Referenz-Slots.
- `LipSyncCertification`: `certified`, `supportedEngines`, `dialogRestrictions` — bleibt in `lipsyncMasterProvider.ts`.

Seedance 2.5: `duration 4–30`, `lipSyncCertified = false`. Ein Paritätstest im Build vergleicht Client-Policy und `_shared/composer-ai-sources.ts`; unterschiedliche Dauerfenster lassen den Build fehlschlagen.

### 3. Zwei Fertigbegriffe: Basis vs. Endergebnis

Provider-Webhook schreibt:

```text
clip_status    = generating
pipeline_state = base_clip_ready
base_clip_status = ready
```

Er extrahiert Übergangsmaterial und setzt die Kontinuitätskette **sofort** fort — die nächste Szene wartet nicht auf TTS, Sync.so und Mux.

```text
Kontinuitäts-Gate: base_clip_status = ready AND Übergangsmaterial vorhanden
Nutzer-/Export-Gate: clip_status = ready AND (requires_lip_sync = false OR lip_sync_status = done)
```

`clip_status = ready` / `pipeline_state = completed` wird ausschließlich für das endgültige Nutzerergebnis gesetzt. Vorschau, Export, Projektabschluss und Benachrichtigung hängen am Nutzer-Gate.

### 4. Stage-spezifische Job-Identitäten

Neue Tabelle statt einer einzelnen `provider_job_id`:

```text
composer_pipeline_jobs(
  id, scene_id, run_id, stage, segment_id,
  external_job_id, status, created_at, completed_at)
stage ∈ base_video | audio_plan | tts | preclip | sync_segment | audio_mux | final_render
UNIQUE(scene_id, run_id, stage, segment_id)
```

Ein Callback schreibt nur, wenn `scene.active_run_id = callback.run_id`, ein passender Job-Datensatz (`scene_id`, `run_id`, `stage`, `external_job_id`, ggf. `segment_id`/`speaker_id`) existiert und der erwartete Zustand nicht terminal ist. Jede Zustandsänderung erfolgt als Compare-and-Set (`WHERE active_run_id = :run_id AND pipeline_state = :expected`), doppelte Zustellung wird damit zum No-op.

### 5. Dauervertrag und Escrow gemeinsam, in einer Transaktion

```text
BEGIN
  neue run_id setzen (active_run_id)
  Run-Vertrag persistieren (Dauer, Preis, Audio-Asset, Policy-Version)
  Credits atomar reservieren
  Reservierungs-ID am Run speichern
COMMIT
→ danach externer Dispatch
```

**„Erfolgreich gestartet"** = Provider hat einen Auftrag erzeugt UND dessen Job-ID ist für diesen Run persistiert. Netzwerk-Timeout nach Create → Reservierung geht in `dispatch_uncertain` und wird von einem Reconciliation-Job geklärt, nicht sofort freigegeben. Idempotency-Key beim Provider: `scene_id + run_id + stage`. Commit/Release/Refund idempotent via `UNIQUE(scene_id, run_id, charge_type)`. Batch-Renders erzeugen alle Szenenreservierungen in einer Transaktion (Parent-Reservierung über die Summe plus Szenenallokationen), damit nicht die halbe Charge startet.

### 6. Providerabhängige Lease + Heartbeat

`lease_expires_at`, `lease_run_id`, `lease_job_id`, `last_heartbeat_at`. TTL = Provider-Timeout + Toleranz (ModelArk 30 min). Heartbeat verlängert nur bei passender Run- **und** Job-ID. Die Kettenlease hängt allein am `base_video`-Job, nicht an der Lip-Sync-Unterpipeline.

### 7. Storyboard-Entwurf mit Optimistic Concurrency

Direkt nach `onScenesGenerated` persistieren: `draft_revision`, `last_saved_revision`, `client_instance_id`, `updated_at`, Briefing-Hash, Erzeugungsmodus. Autosave debounced; Schreibkonflikt zweier Tabs wird erkannt und angeboten statt still überschrieben.

### 8. UI-Phasen aus der Zustandsmaschine

Sichtbare Phasen (wartet auf vorherige Szene / Video / Dialog wird vorbereitet / Lip-Sync / Zusammenführen / Export) werden aus `pipeline_state` abgeleitet — keine frei gesetzten UI-Texte.

## Reihenfolge (übernommen)

- **v427A — Datenintegrität:** Schema für Run-Vertrag und `composer_pipeline_jobs`, Nachzüglerprüfung (`run_id` + `stage` + `external_job_id`), `run_contract_version = 427`.
- **v427B — Dauer und Geld als Einheit:** Audio-Preflight, `max(requested, audio)`, Run-Snapshot + Reservierung in einer Transaktion, idempotente Dispatch/Commit/Release/Refund.
- **v427C — Fertig-Semantik:** `base_clip_ready` nichtterminal, Kette läuft bei Basisfertigstellung weiter, `clip_status = ready` nur final, alle Gates umgestellt.
- **v427D — Wartezeiten und Wiederherstellung:** Leases + Heartbeats, Storyboard-Autosave, UI-Phasen.

## Rollout (Expand and Contract)

1. Neue Felder/Tabellen nullable hinzufügen.
2. Neue Runs mit `run_contract_version = 427` dual-write.
3. Strikte Job-ID- und Gate-Checks nur für v427-Runs.
4. Alte v426-Runs auslaufen lassen.
5. Legacy-Fallback entfernen.

Bestandsdaten mit `clip_status = ready` + `lip_sync_status = pending/running` werden nicht pauschal migriert; ein Reconciliation-Lauf unterscheidet aktive Altläufe von echten Ergebnissen.
