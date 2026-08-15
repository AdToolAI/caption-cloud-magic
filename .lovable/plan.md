# v431 G3.2.2 — Resmoke Schritt 1: Abnahmeszene über den Produktpfad anlegen

Ziel: Eine frische Abnahmeszene (created_at > T0 = 2026-08-15T21:57:44Z) über den normalen Composer-Pfad anlegen, danach read-only Pre-Start-Snapshot. Kein Render, kein Lip-Sync-/Sync.so-Dispatch. Keine manuellen DB-Writes. `b34d1eae…` bleibt unangetastet.

## Befund zum Creation-Pfad (geprüft)

- Szenen werden im Produkt clientseitig angelegt: `VideoComposerDashboard.tsx` (`addScene` → `composer_scenes.insert`) auf Route `/video-composer`, ebenso über Briefing/Produktionsplan (`useApplyProductionPlan`). Es gibt keine Edge-Function „create scene“, die ein Nutzer benutzt — der normale Pfad ist zwingend die App-UI.
- Konsequenz: Der zulässige Weg für mich ist, die App-UI im Browser zu bedienen (Playwright gegen `http://localhost:8080`), nicht ein SQL-Insert.
- `LOVABLE_BROWSER_AUTH_STATUS = signed_out` → vor der UI-Bedienung muss eine Session gemintet werden (`lovable auth-session --json`). Das ist der einzige Umweg; er ersetzt keinen Produkt-Write, sondern stellt nur die Anmeldung her.
- Routing-Bedingung für den Ziel-Pfad (aus `useTwoShotAutoTrigger.ts`): `engine_override ∈ {cinematic-sync, sync-segments}` + expliziter Lip-Sync-Intent (`isLipSyncIntentionalRow`) + genau 1 Sprecher → `compose-dialog-segments` (Sync-Segments), nicht Talking-Head. Der Auto-Trigger feuert erst, wenn ein Clip existiert (`clip_url`), also nicht durch reines Anlegen.

## Ablauf

### 1. Session herstellen
`lovable auth-session --json` für den Account, unter dem die Testszene laufen soll; Session in Playwright restaurieren (localStorage + Cookies), keine Tokens loggen.

### 2. Szene über die UI anlegen
Im Composer (`/video-composer`):
- Neues Projekt mit deterministischem Namen `v431-g322-resmoke` anlegen.
- Eine Szene hinzufügen (normaler „Szene hinzufügen“-Pfad).
- Konfiguration ausschließlich über die UI-Felder:
  - Dialog: **ein** Sprecher, eine kurze Zeile (Ziel ~4–6 s Sprechzeit, sicher im Plate-Budget, non-tight).
  - Lip-Sync/Dialog-Engine so wählen, dass `engine_override` auf der Dialog-Engine landet und der Lip-Sync-Intent gesetzt ist.
  - Szenenlänge im Standardbudget; keine Sonderoptionen, keine Referenzen, kein Tight-Mode.
- **Kein** Generate/Render-Klick. Kein Voiceover-Render, kein Plate-Start.

Falls das Anlegen selbst automatisch irgendeinen Plate-/Preview-/Auto-Trigger-Prozess startet: exakt dokumentieren, was passiert ist, und sofort STOP vor jedem Lip-Sync-/Sync.so-Dispatch.

### 3. Szene selbst identifizieren
Über read-only Query die einzige Szene mit `created_at > T0` bestimmen (Projektname als Gegenprobe). Keine Rückfrage an den Nutzer.

### 4. Pre-Start-Snapshot (read-only)
Belegen: `scene_id`, `created_at > T0`, `active_run_id`, `plate_generation`, `plate_ready_generation`, `pipeline_state`/`substate`, `lip_sync_status`, `dialog_shots`, relevante `audio_plan`-Felder; `composer_pipeline_jobs` für die Szene = 0, `sync_segment`-Attempts = 0, `audio_mux`-Attempts = 0, kein `audio_plan.twoshot.rs3_reset`, keine Pass-/`pipeline_job_id`-Pointer, keine sonstige Ledger-Historie.

### 5. Routing-Nachweis
Kurz belegen, warum diese Szene den `sync-segments`-Pfad nimmt: `engine_override` + Lip-Sync-Intent + Sprecheranzahl = 1 → `compose-dialog-segments`; Abgrenzung gegen Talking-Head-/andere Lip-Sync-Pfade anhand der Zeilenwerte.

### 6. Abschluss
Alles grün → Status **G3.2.2 RESMOKE — TEST SCENE READY**, Ausgabe von `scene_id` + Snapshot, dann STOP (kein Render, kein Dispatch).

Wenn die UI-Anlage technisch nicht durchführbar ist (z. B. Session-Mint schlägt fehl), STOP mit exakter Nennung des erforderlichen Creation-Pfads, der fehlenden Capability und des Grunds — kein DB-Insert als Ersatz.

## Technische Hinweise

- Playwright-Skripte und Screenshots unter `/tmp/browser/g322/`; Projekt-Checkout bleibt unberührt.
- Einzige Schreibvorgänge sind die, die die App selbst als Reaktion auf UI-Bedienung ausführt.
- Reporting in `docs/v431-g3-2-2-report.md` erfolgt erst mit dem eigentlichen Resmoke-Abschnitt; dieser Schritt liefert Szene + Snapshot.
