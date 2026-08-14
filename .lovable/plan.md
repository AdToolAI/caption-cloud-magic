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
Migration: alte 9-Arg-Signatur droppen; `_clear_lip_sync_fields` nur für `write_id='cvc:failed/pika'` zulassen, sonst Ablehnung mit Audit-Eintrag. Keine weitere Semantikänderung an dem Primitive.

**S2 — Upload-Pfad wirklich schließen**
Run-Stamp-Akquise in `compose-video-clips` auf Upload-Szenen ausweiten (identischer kanonischer Vertrag wie für `ai-*`, kein Sonderpfad). Danach den Legacy-Fallback im `cvc:upload-complete`-Zweig entfernen: ohne Stamp kein State-/Output-Write, Szene wird als `failed: upload_missing_run_provenance` zurückgemeldet. Pika-Fallback ebenfalls auf fail-closed umstellen (kein Legacy-`.update()` mehr).

**S3 — Transaktionaler DB-Smoke (Pflicht-Matrix, jeweils mit ROLLBACK)**
`composer_finalize_upload_scene`: applied · stale run · stale generation · falscher From-State (z. B. `complete`) · falsche write_id · bei jeder Ablehnung Nachweis, dass `base_video_url`/`clip_url`/`clip_status` unverändert sind · Audit-Zeile für applied **und** rejected vollständig (write_id, run_id, generation, reason, caller_role).
`cvc:failed/pika`: current run applied inkl. geleerter Lip-Sync-Felder bei cinematic-sync · stale run abgelehnt, keine Feldänderung · `_clear_lip_sync_fields=true` mit fremder write_id abgelehnt.
`cta:id_only_dialog_turns_required`: current applied (lip_sync_status/twoshot_stage='failed'), stale abgelehnt.
G2.2-Regression: 8-Argument-Aufruf von `composer_fail_scene_with_mirrors` ist wieder eindeutig auflösbar.

**S4 — Testzahlen belegen**
Exakten Command für die Frozen-Composer-/Lip-Sync-Suite festschreiben (Datei-Glob im Bericht nennen), G2.2- und G2.3-Zahlen mit demselben Command gegenüberstellen, Edge-Typecheck-Fehlerliste vorher/nachher als Dateiliste anhängen und explizit bestätigen, dass keiner der Fehler in den drei G2.3-Dateien liegt.

Ergebnis wird in `docs/v431-g2-3-report.md` nachgeführt (Abschnitte: Fallback-Auflösung, Primitive-Härtung, Smoke-Matrix, Testbaseline). Danach STOP zur Abnahme.
