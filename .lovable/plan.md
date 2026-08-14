# v431 G2.3 — Antworten auf die vier Abnahmefragen + Schließungsplan

Kurzfassung: Zwei deiner Punkte sind bestätigte Vertragsabweichungen, ein Punkt ist ein echter neuer Regressionsbefund (Overload-Ambiguität), der DB-Smoke fehlt tatsächlich. G2.3 ist damit **nicht abnahmefähig**, bis die unten genannten vier Schritte erledigt sind.

## 1. Legacy-Fallback in compose-video-clips — wo er greift

Befund (verifiziert im Code):

- `sceneRunStamps` wird ausschließlich für Szenen mit `clipSource?.startsWith("ai-")` befüllt (Zeilen 466–490).
- **Upload-Szenen (`clipSource === "upload"`) bekommen deshalb systematisch nie einen Stamp.** Der `cvc:upload-complete`-Zweig läuft heute damit *immer* in den Legacy-Fallback; `composer_finalize_upload_scene` ist praktisch toter Code.
- Der Fallback schreibt weiterhin ungeguarded direkt: `materializeCompatibilityOutput('base', …)` + `clip_status='ready'` per `.update()` auf `composer_scenes`, also Output **und** Legacy-Spiegel ohne Run-/Generations-Guard und ohne Audit.
- Pika (`ai-pika`) ist immer gestampt; dort ist der Fallback nur eine tote Sicherheitsklappe (zusätzlich wird `ai-pika` seit dem Maintenance-Window ohnehin auf `ai-hailuo` umgeleitet).

Bewertung: Für `cvc:upload-complete` ist der Pfad damit **nicht** G2.3-abgeschlossen. Nötig ist eine Stamp-Quelle für Upload-Szenen (Erweiterung der Vor-Dispatch-Run-Akquise auf Upload-Szenen über denselben kanonischen Vertrag) und danach **fail-closed statt Legacy-Fallback**: kein Stamp ⇒ kein Write, Ergebnis `failed: upload_missing_run_provenance`.

## 2. Erweiterung von `composer_fail_scene_with_mirrors`

- Default: `_clear_lip_sync_fields boolean DEFAULT false` — korrekt.
- Einziger Caller mit `true`: `compose-video-clips`, `write_id='cvc:failed/pika'`, und nur wenn `engineOverride === 'cinematic-sync'`.
- Gelöscht werden bei `true`: `lip_sync_status`, `twoshot_stage`, `lip_sync_source_clip_url`, `dialog_shots` (alle auf NULL).
- Die Option ist **nicht** an eine geschlossene write_id/Mode-Liste gebunden — jeder künftige Caller kann sie setzen.
- **Neuer Blocker (nicht in deinem Fragenkatalog, aber kritischer):** `CREATE OR REPLACE` mit zusätzlichem Parameter hat keine Ersetzung, sondern ein **zweites Overload** erzeugt. In der DB existieren jetzt beide:
  `composer_fail_scene_with_mirrors(uuid,uuid,int,text,text,text,text,text,text)` und `(…,boolean)`.
  Die frozen G2.2-Aufrufe (`report-lipsync-motion-probe`, 8 benannte Argumente; `compose-twoshot-audio`, 7) passen auf **beide** Signaturen ⇒ PostgREST/Postgres meldet "function is not unique" (PGRST203). Damit ist der eingefrorene G2.2-Hard-Fail-Pfad heute funktional beschädigt.

Fix: alte 9-Argument-Signatur explizit droppen (`DROP FUNCTION public.composer_fail_scene_with_mirrors(uuid,uuid,integer,text,text,text,text,text,text);`) und `_clear_lip_sync_fields` an eine geschlossene write_id-Liste binden (`cvc:failed/pika`) — jede andere write_id mit `true` ⇒ `applied=false, reason='clear_flag_not_allowed'`.

## 3. DB-Smoke

Ist **nicht gelaufen**. Das ist korrekt beobachtet und bleibt das eigentliche Abnahme-Gate.

## 4. Testzahlen

Die gemeldeten 373 sind nicht reproduzierbar dokumentiert (kein Command im Bericht). Ein Lauf über `src/**/__tests__` ergibt aktuell 116 Tests / 6 Failures in nicht betroffenen UI-Tests — also ein anderer Selektor. Die Zahl 482 aus G2.2 muss mit exakt demselben Command gegenübergestellt werden; ebenso muss die 20-Fehler-Typecheck-Baseline mit Dateiliste vorher/nachher belegt werden.

---

## Schließungsplan (vier Schritte, danach STOP)

**S1 — Overload-Bereinigung (Vorrang, repariert G2.2)**
Migration: alte 9-Arg-Signatur droppen; `_clear_lip_sync_fields` nur für `write_id='cvc:failed/pika'` zulassen, sonst Ablehnung mit Audit-Eintrag (`clear_flag_not_allowed`). Keine weitere Semantikänderung an dem Primitive.
Verifikation (verpflichtend): nach der Migration über `pg_proc`/`to_regprocedure` nachweisen, dass genau **eine** Signatur übrig ist; PostgREST-Schema-Cache neu laden (`NOTIFY pgrst, 'reload schema'`) und mit einem echten RPC-Aufruf in 7- und 8-Argument-Form (benannte Parameter, wie in `compose-twoshot-audio` und `report-lipsync-motion-probe`) belegen, dass kein PGRST203 mehr auftritt.

**S2 — Upload-Pfad wirklich schließen**
Run-Stamp-Akquise in `compose-video-clips` auf Upload-Szenen ausweiten — identischer kanonischer Vertrag wie für `ai-*`, kein Sonderpfad.
Kein Doppel-Run (verpflichtend): Liegt bereits ein kanonischer `runContext` aus `composer-start-scene-generation` vor, wird genau dieser für die Upload-Szene validiert und verwendet; ein neuer Run wird ausschließlich dort erworben, wo der kanonische Vertrag ihn ohnehin erwirbt (Legacy-Direktaufruf ohne `runContext`). Akzeptanztest: ein Upload-Dispatch ⇒ genau eine Run-ID und genau ein Generation-Bump.
Danach Legacy-Fallback im `cvc:upload-complete`-Zweig entfernen: ohne Stamp kein State-/Output-Write, Szene wird als `failed: upload_missing_run_provenance` zurückgemeldet. Pika-Fallback ebenfalls fail-closed (kein ungeguardetes `.update()` mehr).
Quellasset-Erhalt (verbindliche Akzeptanzbedingung): Der Run-Start bereinigt historisch Output-Felder. Vor der Run-Akquise wird die Upload-Source-URL immutable außerhalb der Output-Felder festgehalten (In-Memory-Snapshot des Dispatch-Payloads bzw. eigenes Source-Feld) und die Finalisierung liest ausschließlich aus diesem Snapshot — nie aus einem Output-Feld, das der Run-Start leeren darf. Smoke: Upload-Dispatch → Run-Akquise → Finalisierung liefert exakt dieselbe Asset-URL wie vor der Akquise; zusätzlich Nachweis, dass ein zwischenzeitliches Output-Clear die Finalisierung nicht auf `null` laufen lässt.

**S3 — Transaktionaler DB-Smoke (Pflicht-Matrix, jeweils mit ROLLBACK)**
`composer_finalize_upload_scene`: applied (inkl. Nachweis `pipeline_state_run_id = run_id`) · stale run · stale generation · falscher From-State (z. B. `complete`) · falsche write_id · bei **jeder** Ablehnung Nachweis, dass weder Output-Felder (`base_video_url`, `processed_video_url`, `clip_url`) **noch Legacy-Spiegel** (`clip_status`, `lip_sync_status`, `twoshot_stage`, `dialog_shots`) verändert wurden · Audit-Zeile für applied **und** rejected vollständig (write_id, run_id, generation, reason, caller_role).
`cvc:failed/pika`: current run applied inkl. geleerter Lip-Sync-Felder bei cinematic-sync · stale run abgelehnt, keine Feld- oder Spiegeländerung · `_clear_lip_sync_fields=true` mit fremder write_id abgelehnt.
`cta:id_only_dialog_turns_required`: current applied (lip_sync_status/twoshot_stage='failed'), stale abgelehnt ohne Spiegeländerung.
G2.2-Regression: 7-/8-Argument-Aufrufe von `composer_fail_scene_with_mirrors` sind wieder eindeutig auflösbar (SQL **und** RPC).


**S4 — Testzahlen belegen**
Exakten Command für die Frozen-Composer-/Lip-Sync-Suite festschreiben (Datei-Glob im Bericht nennen), G2.2- und G2.3-Zahlen mit demselben Command gegenüberstellen, Edge-Typecheck-Fehlerliste vorher/nachher als Dateiliste anhängen und explizit bestätigen, dass keiner der Fehler in den drei G2.3-Dateien liegt.

Ergebnis wird in `docs/v431-g2-3-report.md` nachgeführt (Abschnitte: Fallback-Auflösung, Primitive-Härtung, Smoke-Matrix, Testbaseline). Danach STOP zur Abnahme.
