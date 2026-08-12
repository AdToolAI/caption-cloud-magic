# Motion Studio: Stand v427 und die verbleibenden Schritte

## Was steht

Die Infrastruktur des Run-Vertrags ist gebaut und deployed:

- Phase A1 — Tabellen `composer_scene_runs` (unveränderliche Wahrheit pro Lauf) und
  `composer_pipeline_jobs` (Callback-Ledger) existieren.
- Phase A2 — Dual-Write spiegelt Dispatches in den Ledger (`_shared/v427-dual-write.ts`).
- Phase A3 — Callback-Guard läuft im `compose-clip-webhook` und als Heartbeat im `modelark-poll`.

## Was noch fehlt (geprüft)

In `system_config` existiert **keine einzige `v427.*`-Zeile**, und die Tabellen
`composer_pipeline_jobs`, `composer_scene_runs`, `composer_continuity_queue` enthalten
**0 Zeilen**. Das heißt: alles läuft weiterhin exakt auf v426-Verhalten, der neue Vertrag
ist gebaut, aber nirgends aktiv. Die Phasen B, C und D sind noch offen.

## Vorgehen

### 1. Aktivierung A2/A3 (zuerst, ohne Verhaltensänderung)

- `v427.pipeline_jobs_dual_write` auf den eigenen Account setzen, eine Szene fahren,
  im Ledger prüfen: eine Zeile pro Stage, korrekte `run_id`, keine Duplikate.
- Danach `v427.callback_guard_mode = observe` (gleicher Account). Eine Woche bzw. mehrere
  Läufe beobachten: es dürfen **keine** Ablehnungsgründe gegen gültige Callbacks geloggt
  werden. Erst dann `enforce`.

### 2. Phase B — Dauer- und Geldvertrag

- `tail_padding_ms` als benannte Konstante aus `compose-twoshot-audio` extrahieren
  (Wert unverändert) — der letzte offene Phase-0-Punkt.
- Reihenfolge herstellen: Auth → Dialog kanonisieren → Provider-Zulässigkeit →
  Maximalkosten → Run + Obergrenzen-Reservierung atomar → TTS → Audio messen →
  exakter Dauervertrag → Reservierung reduzieren → einfrieren → Videodispatch.
- Flags: `v427.audio_preflight`, `v427.credit_reservations`.
- Offene Produktentscheidung: Wer trägt die TTS-Kosten, wenn der gemessene Dialog in
  kein Providerfenster passt (Hailuo 10 s, HappyHorse 15 s, Seedance 30 s)?

### 3. Phase C — Fertig-Semantik

- C1: `compose-clip-webhook` schreibt `base_clip_status`/`base_clip_url`.
- C2: alle Consumer aus `docs/v427-ready-consumers.md` auf die zwei Gates umstellen.
- C3: Flip hinter `v427.ready_semantics`.
- Wirkung für den Kunden: die Kontinuitätskette startet den Folgeclip schon bei fertiger
  Bildbasis, während `ready` erst nach Lip-Sync und Mux gesetzt wird.

### 4. Phase D — Leases, Drafts, UI

- `v427.provider_leases` gegen Doppelbuchungen desselben Providerslots.
- Storyboard-Persistenz (Drafts) und die Fortschrittsanzeige vollständig aus
  `pipeline_state` ableiten.

## Separater Punkt außerhalb v427

`composer.feature.seedance25_lipsync` steht in der Datenbank noch auf `enabled: true`
für einen Account. Der v425-Vertrag zertifiziert für Lip-Sync nur HappyHorse und Hailuo.
Der Flag-Wert sollte auf `false` gesetzt werden, damit Datenbank und Vertrag
übereinstimmen — der Code lehnt Seedance im Lip-Sync-Pfad ohnehin ab.

## Technische Details

- Flags werden als Zeilen in `system_config` gesetzt, gelesen über `_shared/v427-flags.ts`
  (30 s Cache, Default v426).
- Kein Eingriff in die gefrorenen Lip-Sync-Dateien
  (`.lovable/LIPSYNC-FEATURE-FREEZE.md`); die Freeze-Tests bleiben Abnahmebedingung
  jedes Teilschritts.
- Neue Logik strikt additiv, `run_contract_version = 427` grenzt strenge Prüfungen ab.
