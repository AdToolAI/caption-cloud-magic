
# Bond QA Cleanup-Sprint — Schlanker Plan

## TL;DR — Gute Nachricht
Beim Aufmachen des Codes habe ich gesehen: **3 von 4 vermeintlichen Bugs sind bereits gefixt**:

| # | Vermuteter Bug | Realität |
|---|---|---|
| 1 | Composer Stitch — `'prompt' column not found` | ✅ Fix bereits drin (`ai_prompt`). Letzte Failures (2 Stück, 30.04.) waren in Wahrheit `401 Unauthorized` |
| 2 | DC Lambda NaN-Bug | ✅ Nur **1 historischer Vorfall** am 30.04.; jüngster Sweep am 01.05. lief 5/6 grün |
| 3 | Long-Form Render 5× failed | ✅ Flow wurde im Code **entfernt** (Kommentar Zeile 664), die Failures sind alt |
| 4 | HeyGen No-Face Bootstrap | 🟡 Bootstrap-Code ist **stabil** (3 Quellen, force-replace), aber Live-Sweep nutzt das Asset nur **wenn** Bootstrap vorher manuell läuft |
| 5 | Hedra noch im Live-Sweep | 🔴 **Echter Cleanup-Bedarf** — Provider ist EOL und produziert dauerhaft 10/10 fail-Rows |

## Zu erledigen — 3 echte Aktionen + 1 Cosmetics

### Action 1 (🔴 BLOCKER für QA-Statistik) — Hedra aus Live-Sweep entfernen
**Datei:** `supabase/functions/qa-live-sweep/index.ts` (Zeilen 53-80)
- Hedra-Eintrag aus `PROVIDER_MATRIX` löschen
- `needsHedraBootstrap` (Zeile 411) wird damit obsolet — `ensureHeyGenTalkingPhoto`-Call entfernen oder auf HeyGen-Provider umleiten
- **Optional:** echten HeyGen-Provider als Async-Test ins `PROVIDER_MATRIX` aufnehmen (`async_started`-Pattern wie er heute schon greift), wenn wir Talking-Head weiter live monitoren wollen

### Action 2 (🟡 Cosmetic) — 12 historische "Recovered after"-Rows aufräumen
- `qa_live_runs` mit `error_message LIKE 'Recovered after qa-live-sweep request idle timeout%'` → entweder löschen oder UI filtert sie aus den Stats raus. Aktuell verfälschen sie den Live-Sweep-Erfolgsbalken.
- Die String-Quelle existiert nicht mehr im aktuellen Code — die Rows sind tote Altlasten von einer früheren Watchdog-Version.

### Action 3 (🟡) — Deep Sweep "Long-Form Render" aus alten UI-Listen entfernen
- Die Flow-Funktion ist im Code raus, aber das UI/Cockpit listet sie noch (5 alte Failure-Rows tauchen in der Übersicht auf). Schnell-Filter `WHERE flow_name != 'Long-Form Render (Lambda)'` in der View, oder die Rows hard-deleten.

### Action 4 (🟢 Nice) — Auto-Bootstrap im Deep Sweep
**Datei:** `supabase/functions/qa-weekly-deep-sweep/index.ts` (Talking Head HeyGen Flow, Zeilen 548-561)
- Wenn `portraitUrl` fehlt → **automatisch** `qa-live-sweep-bootstrap` triggern statt nur skippen. Spart manuelle Schritte.
- Gleiches für Magic Edit (Zeile 689 Mask-Bootstrap).

---

## Was wir **nicht** anfassen (bereits gut)
- ✅ Watchdog (alle 2 min, 0 Auto-Fails letzte 24 h)
- ✅ Synthetic Probes (72 / Stunde, 100 % grün außer 2× HTTP 404 Cold-Start in 6 h — vernachlässigbar)
- ✅ Live-Sweep Async-Pattern (202 + `EdgeRuntime.waitUntil`)
- ✅ Heartbeat-Logik
- ✅ Composer-Stitch-Code (richtige Spalten)
- ✅ Lambda-Bundle (NaN-Bug ist seit dem letzten Deploy nicht wieder aufgetreten)

---

## Geschätzter Aufwand
**~10–15 min Implementation** für alle 4 Actions. Kein DB-Schema-Migration nötig, nur:
- 1 Edge-Function-Edit (`qa-live-sweep`)
- 2 Daten-Cleanup-INSERTs (DELETE auf `qa_live_runs` + `qa_deep_sweep_flow_results`)
- 1 Edge-Function-Edit (`qa-weekly-deep-sweep`) für Auto-Bootstrap

## Frage
Soll ich **alle 4 Actions** ausführen, oder reicht dir **Action 1 + 2** (Hedra raus + tote Rows weg) — das wäre der absolute Minimal-Cleanup, der die QA-Statistik sofort sauber macht?
